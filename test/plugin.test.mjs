import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { apply } from '../index.js'

function makeRequest(method, url, { headers = {}, body } = {}) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const request = Readable.from(payload)
  request.method = method
  request.url = url
  request.headers = headers
  return request
}

function makeResponse() {
  return {
    status: 0,
    headers: {},
    chunks: [],
    headersSent: false,
    ended: false,
    destroyed: false,
    writeHead(status, headers) {
      this.status = status
      this.headers = { ...(headers || {}) }
      this.headersSent = true
    },
    end(chunk) {
      if (chunk !== undefined) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      this.ended = true
    },
    destroy() {
      this.destroyed = true
    },
    text() {
      return Buffer.concat(this.chunks).toString('utf8')
    },
    json() {
      return JSON.parse(this.text())
    },
  }
}

async function withPlugin(fn) {
  const base = await mkdtemp(join(tmpdir(), 'dsh-prompt-manager-plugin-'))
  const workspace = join(base, 'workspace')
  const dshHome = join(base, 'dsh-home')
  const agentsHome = join(base, 'agents-home')
  await mkdir(workspace, { recursive: true })
  await mkdir(dshHome, { recursive: true })
  await mkdir(join(workspace, '.git'), { recursive: true })
  const previous = { dshHome: process.env.DSH_HOME, agentsHome: process.env.DSH_AGENTS_HOME }
  process.env.DSH_HOME = dshHome
  process.env.DSH_AGENTS_HOME = agentsHome
  try {
    const routes = []
    const commands = []
    const disposers = []
    const fakeWebServer = {
      getOrigin: () => 'http://127.0.0.1:57999',
      register: (route) => {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index !== -1) routes.splice(index, 1)
        }
      },
    }
    const fakeCommands = {
      register: (definition) => {
        commands.push(definition)
        return () => undefined
      },
    }
    const fakeLogger = { info() {}, warn(...args) { if (process.env.DSH_TEST_DEBUG) console.error('[plugin-warn]', ...args) }, error() {} }
    const ctx = {
      logger: fakeLogger,
      webServer: fakeWebServer,
      workspaceRegistry: {
        list: () => [{ id: 'ws-1', title: 'Demo workspace', path: workspace, sessionIds: [] }],
      },
      get: (name) => (name === 'workingDirectory' ? { defaultDirectory: workspace } : undefined),
      effect: (callback) => {
        const disposer = callback()
        disposers.push(disposer)
        return disposer
      },
      inject: (deps, callback) => {
        if (Array.isArray(deps) && deps.includes('commands')) {
          callback({ commands: fakeCommands, webServer: fakeWebServer, effect: (fn) => fn() })
        }
        return () => undefined
      },
    }
    apply(ctx, { pagePath: '/pm', maxBackups: 2, maxFileBytes: 4096, maxInjectBytes: 1024 })
    assert.equal(routes.length, 1, 'one registered route')
    const route = routes[0]
    assert.equal(route.kind, 'prefix')
    assert.equal(route.path, '/pm')

    const call = async (method, path, options) => {
      const response = makeResponse()
      await route.handler(makeRequest(method, path, options), response)
      return response
    }
    const apiHeaders = { 'x-prompt-manager': '1', origin: 'http://127.0.0.1:57999' }

    await fn({ base, workspace, dshHome, routes, commands, call, apiHeaders, disposers })
  } finally {
    if (previous.dshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous.dshHome
    if (previous.agentsHome === undefined) delete process.env.DSH_AGENTS_HOME
    else process.env.DSH_AGENTS_HOME = previous.agentsHome
    await rm(base, { recursive: true, force: true })
  }
}

test('page, state and security guards respond as designed', async () => {
  await withPlugin(async ({ call, apiHeaders }) => {
    const page = await call('GET', '/pm')
    assert.equal(page.status, 200)
    assert.match(page.headers['content-type'], /text\/html/u)
    assert.match(page.text(), /<!doctype html>/u)
    assert.match(page.headers['content-security-policy'], /default-src 'none'/u)

    const redirect = await call('GET', '/pm/')
    assert.equal(redirect.status, 308)
    assert.equal(redirect.headers.location, '/pm')

    const unauthorized = await call('GET', '/pm/api/state')
    assert.equal(unauthorized.status, 403)

    const crossOrigin = await call('GET', '/pm/api/state', { headers: { ...apiHeaders, origin: 'http://evil.example' } })
    assert.equal(crossOrigin.status, 403)

    const state = await call('GET', '/pm/api/state', { headers: apiHeaders })
    assert.equal(state.status, 200)
    const data = state.json()
    assert.equal(data.pagePath, '/pm')
    assert.equal(data.groups.length >= 2, true)
    const global = data.groups.find((group) => group.kind === 'global')
    assert.ok(global)
    assert.equal(global.files[0].id, 'global')
    assert.equal(global.files[0].exists, false)
    const workspace = data.groups.find((group) => group.kind === 'workspace')
    assert.ok(workspace)
    assert.equal(workspace.files[0].id, 'workspace:ws-1')
    assert.equal(workspace.files[0].exists, false)
    assert.ok(Array.isArray(data.templates) && data.templates.length >= 6)
  })
})

test('create, save, conflict, backup rotation and rollback work end to end', async () => {
  await withPlugin(async ({ workspace, call, apiHeaders }) => {
    const filePath = join(workspace, 'AGENTS.md')

    const created = await call('POST', '/pm/api/save', {
      headers: apiHeaders,
      body: { id: 'workspace:ws-1', content: '# 工作区规则\n\n第一条\n', baseMtimeMs: null, eol: 'lf' },
    })
    assert.equal(created.status, 200)
    const createdData = created.json()
    assert.equal(createdData.ok, true)
    assert.equal(createdData.backupName, null)
    assert.equal(await readFile(filePath, 'utf8'), '# 工作区规则\n\n第一条\n')
    const firstMtime = createdData.file.mtimeMs

    const second = await call('POST', '/pm/api/save', {
      headers: apiHeaders,
      body: { id: 'workspace:ws-1', content: '# 工作区规则\n\n第二条\n', baseMtimeMs: firstMtime, eol: 'lf' },
    })
    assert.equal(second.status, 200)
    const secondData = second.json()
    assert.match(secondData.backupName, /^\.AGENTS\.md\.\d{8}-\d{6}-\d{3}\.bak$/u)
    assert.equal(secondData.backups.length, 1)

    const stale = await call('POST', '/pm/api/save', {
      headers: apiHeaders,
      body: { id: 'workspace:ws-1', content: '# 旧内容\n', baseMtimeMs: firstMtime, eol: 'lf' },
    })
    assert.equal(stale.status, 409)
    assert.equal(stale.json().error, 'CONFLICT')

    const forced = await call('POST', '/pm/api/save', {
      headers: apiHeaders,
      body: { id: 'workspace:ws-1', content: '# 强制覆盖\n', baseMtimeMs: firstMtime, eol: 'lf', force: true },
    })
    assert.equal(forced.status, 200)

    const listed = await call('GET', '/pm/api/backups?id=' + encodeURIComponent('workspace:ws-1'), { headers: apiHeaders })
    assert.equal(listed.status, 200)
    const backups = listed.json().backups
    assert.equal(backups.length, 2, 'maxBackups=2 kept')
    const oldest = backups[backups.length - 1]
    assert.equal(oldest.name, secondData.backupName)

    const preview = await call('GET', '/pm/api/backup?id=' + encodeURIComponent('workspace:ws-1') + '&name=' + encodeURIComponent(secondData.backupName), { headers: apiHeaders })
    assert.equal(preview.status, 200)
    assert.equal(preview.json().content, '# 工作区规则\n\n第一条\n')

    const rolled = await call('POST', '/pm/api/rollback', {
      headers: apiHeaders,
      body: { id: 'workspace:ws-1', name: secondData.backupName },
    })
    assert.equal(rolled.status, 200)
    const rollbackData = rolled.json()
    assert.equal(rollbackData.content, '# 工作区规则\n\n第一条\n')
    assert.match(rollbackData.safetyBackupName, /^\.AGENTS\.md\./u)
    assert.equal(await readFile(filePath, 'utf8'), '# 工作区规则\n\n第一条\n')

    const read = await call('GET', '/pm/api/file?id=' + encodeURIComponent('workspace:ws-1'), { headers: apiHeaders })
    assert.equal(read.status, 200)
    assert.equal(read.json().file.exists, true)
    assert.equal(read.json().content, '# 工作区规则\n\n第一条\n')

    const traversal = await call('GET', '/pm/api/file?id=' + encodeURIComponent('../../etc/passwd'), { headers: apiHeaders })
    assert.equal(traversal.status, 404)

    const starter = await call('GET', '/pm/api/starter', { headers: apiHeaders })
    assert.equal(starter.status, 200)
    assert.match(starter.json().content, /# AGENTS\.md/u)
  })
})

test('size limit and encoding metadata are enforced', async () => {
  await withPlugin(async ({ call, apiHeaders }) => {
    const tooLarge = await call('POST', '/pm/api/save', {
      headers: apiHeaders,
      body: { id: 'global', content: 'x'.repeat(5000), baseMtimeMs: null, eol: 'lf' },
    })
    assert.equal(tooLarge.status, 413)

    const globalSave = await call('POST', '/pm/api/save', {
      headers: apiHeaders,
      body: { id: 'global', content: 'global rule\r\nsecond\r\n', baseMtimeMs: null, eol: 'crlf', bom: true },
    })
    assert.equal(globalSave.status, 200)
    const data = globalSave.json()
    assert.equal(data.file.id, 'global')
    const read = await call('GET', '/pm/api/file?id=global', { headers: apiHeaders })
    assert.equal(read.status, 200)
    assert.equal(read.json().content, 'global rule\nsecond\n')
    assert.equal(read.json().eol, 'crlf')
    assert.equal(read.json().bom, true)
  })
})

test('/prompts command reports the management URL', async () => {
  await withPlugin(async ({ commands }) => {
    assert.equal(commands.length, 1)
    assert.equal(commands[0].name, 'prompts')
    const result = commands[0].handler()
    assert.equal(result.kind, 'success')
    assert.match(result.text, /http:\/\/127\.0\.0\.1:57999\/pm/u)
  })
})

test('route disposer unregisters the page', async () => {
  await withPlugin(async ({ routes, disposers }) => {
    assert.equal(routes.length, 1)
    const dispose = disposers[0]
    assert.equal(typeof dispose, 'function')
    dispose()
    assert.equal(routes.length, 0)
  })
})

test('existing files report metadata and warning for over-budget content', async () => {
  await withPlugin(async ({ workspace, call, apiHeaders }) => {
    await mkdir(join(workspace, '.git'), { recursive: true })
    const filePath = join(workspace, 'AGENTS.md')
    await import('node:fs/promises').then((fs) => fs.writeFile(filePath, 'a'.repeat(2048)))
    const state = await call('GET', '/pm/api/state', { headers: apiHeaders })
    const workspaceGroup = state.json().groups.find((group) => group.kind === 'workspace')
    const file = workspaceGroup.files[0]
    assert.equal(file.exists, true)
    assert.equal(file.size, 2048)
    assert.ok(file.warnings.some((warning) => warning.includes('注入预算')))
    const info = await stat(filePath)
    assert.ok(info.isFile())
  })
})
