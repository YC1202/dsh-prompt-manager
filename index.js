/**
 * dsh-prompt-manager — Host plugin.
 *
 * Registers a small JSON API and a single-page management UI on the DSH Web
 * server's loopback origin. The API scans the user-global instruction files
 * (`$DSH_HOME/AGENTS.md`, `$DSH_AGENTS_HOME/AGENTS.md`) and every registered
 * Workspace's `AGENTS.md`, reads and atomically saves them, keeps timestamped
 * backups and restores them. The files it writes are the same files the
 * standard agent preset's `agent-instructions` row loads on each model step,
 * so a save applies to the next request without restarting DeepSeek Harness.
 */

import { basename, dirname, join, resolve } from 'node:path'
import {
  DEFAULT_PAGE_PATH,
  PROMPT_FILE_NAME,
  displayPath,
  findProjectRoot,
  isBackupName,
  listBackups,
  normalizeConfig,
  readBackup,
  readPromptFile,
  resolveHomes,
  rollbackPromptFile,
  safeStat,
  savePromptFile,
} from './lib/core.js'
import { STARTER_CONTENT, TEMPLATES } from './lib/templates.js'
import { renderPage } from './lib/ui.js'

export const inject = ['webServer', 'workspaceRegistry']

const VERSION = '0.2.0'
const LOCAL_ONLY_ORIGIN = 'http://local'
const MAX_BACKUP_PREVIEW_BYTES = 1_048_576
const SIBLING_CANDIDATES = ['CLAUDE.md', 'AGENTS.local.md']

/** One scope descriptor resolved from live registry state (never from client input). */
function makeFileSpec({ id, kind, groupKey, groupTitle, groupSubtitle, title, directory }) {
  return {
    id,
    kind,
    groupKey,
    groupTitle,
    groupSubtitle,
    title,
    directory,
    path: join(directory, PROMPT_FILE_NAME),
  }
}

const GLOBAL_GROUP_KEY = 'global'
const GLOBAL_GROUP_TITLE = '全局配置'

/** Display subtitle shared by the global group and the primary global spec. */
function globalGroupSubtitle(homes) {
  return displayPath(homes.dshHome, homes) + '/' + PROMPT_FILE_NAME
}

/** Build the primary or shared global spec directly from live homes, with no filesystem I/O. */
function makeGlobalSpec(variant, homes) {
  if (variant === 'global') {
    return makeFileSpec({
      id: 'global',
      kind: 'global',
      groupKey: GLOBAL_GROUP_KEY,
      groupTitle: GLOBAL_GROUP_TITLE,
      groupSubtitle: globalGroupSubtitle(homes),
      title: PROMPT_FILE_NAME,
      directory: homes.dshHome,
    })
  }
  if (resolve(homes.agentsHome) === resolve(homes.dshHome)) return undefined
  return makeFileSpec({
    id: 'global-shared',
    kind: 'shared',
    groupKey: GLOBAL_GROUP_KEY,
    groupTitle: GLOBAL_GROUP_TITLE,
    groupSubtitle: globalGroupSubtitle(homes),
    title: 'AGENTS.md (共享)',
    directory: homes.agentsHome,
  })
}

/** Group key/title/subtitle shared by a workspace's group and its file specs. */
function workspaceGroupMeta(workspace, homes) {
  return {
    key: 'workspace:' + workspace.id,
    title: workspace.title || basename(workspace.path) || workspace.path,
    subtitle: displayPath(workspace.path, homes),
  }
}

/** Format bytes for human-readable warnings. */
function formatBytes(value) {
  if (!Number.isFinite(value)) return String(value)
  if (value >= 1_048_576) return (value / 1_048_576).toFixed(value % 1_048_576 === 0 ? 0 : 1) + ' MiB'
  if (value >= 1_024) return Math.round(value / 1_024) + ' KiB'
  return value + ' B'
}

/** Host plugin entry point. */
export function apply(ctx, rawConfig) {
  const settings = normalizeConfig(rawConfig)
  const homes = resolveHomes()
  const logger = ctx.logger

  /** Register the page + JSON API on the already-running Web carrier. */
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: settings.pagePath,
        handler: (req, res) => handleRequest(ctx, settings, homes, req, res),
      }),
    'prompt-manager: web route',
  )

  /** `/prompts` prints the management URL; registered only where a command registry exists. */
  ctx.inject(['commands'], (scope) => {
    scope.effect(
      () =>
        scope.commands.register({
          name: 'prompts',
          description: '显示提示词管理器的访问地址与快捷键',
          handler: () => {
            let origin
            try {
              origin = scope.webServer.getOrigin()
            } catch {
              origin = 'http://127.0.0.1:<port>'
            }
            return {
              kind: 'success',
              text: [
                '提示词管理器：' + origin + settings.pagePath,
                '在浏览器打开该地址即可管理全局与会话工作区的 AGENTS.md。',
                '快捷键：Ctrl/Cmd+S 保存 · Ctrl/Cmd+B 切换预览 · Ctrl/Cmd+F 搜索文件。',
                '保存后由 agent-instructions 在下一次模型步骤读取，无需重启 Harness。',
              ].join('\n'),
            }
          },
        }),
      'prompt-manager: /prompts command',
    )
  })

  if (logger && typeof logger.info === 'function') {
    try {
      const origin = ctx.webServer.getOrigin()
      logger.info('prompt-manager: management page at %s', origin + settings.pagePath)
    } catch {
      // getOrigin throws before the listener binds; the route is live regardless.
    }
  }
}

/** Resolve every manageable scope from the live workspace registry and filesystem. */
async function collectGroups(ctx, settings, homes) {
  /** Raw scope specs by id; request handlers resolve ids through this map, never through client paths. */
  const specs = new Map()

  const primary = makeGlobalSpec('global', homes)
  specs.set(primary.id, primary)
  const sharedSpec = makeGlobalSpec('shared', homes)

  // Describe both global specs concurrently; the shared one only contributes
  // a row once its file or home directory actually exists.
  const globalDescribeTasks = [describeFile(primary, settings, homes)]
  if (sharedSpec !== undefined) {
    specs.set(sharedSpec.id, sharedSpec)
    globalDescribeTasks.push(
      Promise.all([safeStat(sharedSpec.path), safeStat(homes.agentsHome)]).then(([sharedInfo, agentsHomeInfo]) =>
        sharedInfo.exists || agentsHomeInfo.isDirectory ? describeFile(sharedSpec, settings, homes) : null,
      ),
    )
  }
  const globalFiles = (await Promise.all(globalDescribeTasks)).filter((file) => file !== null)

  const groups = [{
    key: GLOBAL_GROUP_KEY,
    kind: 'global',
    title: GLOBAL_GROUP_TITLE,
    subtitle: globalGroupSubtitle(homes),
    files: globalFiles,
  }]

  const workspaces = listWorkspaces(ctx)
  // Independent workspaces never share filesystem state, so describe them concurrently.
  const workspaceGroups = await Promise.all(workspaces.map(async (workspace) => {
    const directory = workspace.path
    const meta = workspaceGroupMeta(workspace, homes)
    const directoryInfo = await safeStat(directory)
    const available = directoryInfo.exists && directoryInfo.isDirectory === true
    const group = {
      key: meta.key,
      kind: 'workspace',
      title: meta.title,
      subtitle: meta.subtitle,
      workspaceId: workspace.id,
      path: meta.subtitle,
      missingDirectory: !available,
      files: [],
    }
    if (!available) return group

    const workspaceFile = makeFileSpec({
      id: meta.key,
      kind: 'workspace',
      groupKey: meta.key,
      groupTitle: meta.title,
      groupSubtitle: meta.subtitle,
      title: PROMPT_FILE_NAME,
      directory,
    })
    specs.set(workspaceFile.id, workspaceFile)

    const [workspaceFileDescribed, projectRoot] = await Promise.all([
      describeFile(workspaceFile, settings, homes),
      findProjectRoot(directory, ['.git']).catch(() => undefined),
    ])
    group.files.push(workspaceFileDescribed)

    if (projectRoot !== undefined && resolve(projectRoot) !== resolve(directory)) {
      const projectFile = makeFileSpec({
        id: 'project:' + workspace.id,
        kind: 'project',
        groupKey: meta.key,
        groupTitle: meta.title,
        groupSubtitle: meta.subtitle,
        title: '项目根 AGENTS.md',
        directory: projectRoot,
      })
      specs.set(projectFile.id, projectFile)
      const projectInfo = await safeStat(projectFile.path)
      if (projectInfo.exists) group.files.push(await describeFile(projectFile, settings, homes))
    }
    return group
  }))
  groups.push(...workspaceGroups)

  return { groups, specs }
}

/** Build the Workspace list from the registry, falling back to the default directory. */
function listWorkspaces(ctx) {
  const rows = []
  const seen = new Set()
  let registry
  try {
    registry = ctx.workspaceRegistry
  } catch {
    registry = undefined
  }
  if (registry !== undefined && typeof registry.list === 'function') {
    try {
      for (const workspace of registry.list()) {
        const path = typeof workspace.path === 'string' ? workspace.path : undefined
        if (path === undefined || seen.has(resolve(path))) continue
        seen.add(resolve(path))
        rows.push({
          id: String(workspace.id),
          title: typeof workspace.title === 'string' ? workspace.title : '',
          path: resolve(path),
        })
      }
    } catch (error) {
      if (ctx.logger && typeof ctx.logger.warn === 'function') {
        ctx.logger.warn('prompt-manager: reading workspaceRegistry failed: %o', error)
      }
    }
  }
  if (rows.length === 0) {
    let fallback
    try {
      fallback = ctx.get('workingDirectory')?.defaultDirectory
    } catch {
      fallback = undefined
    }
    if (typeof fallback === 'string' && fallback.trim().length > 0) {
      rows.push({
        id: 'default',
        title: basename(resolve(fallback)),
        path: resolve(fallback),
      })
    }
  }
  return rows
}

/** Describe one managed file: existence, metadata, backups and safety warnings. */
async function describeFile(spec, settings, homes) {
  const info = await safeStat(spec.path)
  const exists = info.exists && info.isFile === true
  const [backups, siblingHits] = await Promise.all([
    exists ? listBackups(spec.directory) : Promise.resolve([]),
    Promise.all(
      SIBLING_CANDIDATES.map((name) => safeStat(join(spec.directory, name)).then((siblingInfo) => ({ name, siblingInfo }))),
    ),
  ])
  const warnings = []
  if (info.exists && info.isFile === false) {
    warnings.push('该路径不是普通文件，无法编辑')
  }
  if (exists && info.size > settings.maxInjectBytes) {
    warnings.push(
      '内容 ' + formatBytes(info.size) + ' 超过 ' + formatBytes(settings.maxInjectBytes) +
      ' 的单链注入预算，注入时可能被省略或截断',
    )
  }
  const siblings = siblingHits.filter((hit) => hit.siblingInfo.exists && hit.siblingInfo.isFile).map((hit) => hit.name)
  if (siblings.length > 0) {
    warnings.push('同目录的 ' + siblings.join('、') + ' 也会被 agent-instructions 加载')
  }
  return {
    id: spec.id,
    kind: spec.kind,
    groupKey: spec.groupKey,
    title: spec.title,
    displayPath: displayPath(spec.path, homes),
    path: spec.path,
    directory: displayPath(spec.directory, homes),
    exists,
    editable: info.isFile !== false,
    size: exists ? info.size : 0,
    mtimeMs: exists ? info.mtimeMs : null,
    backupCount: backups.length,
    latestBackupAt: backups[0]?.name ?? null,
    warnings,
    maxFileBytes: settings.maxFileBytes,
    maxInjectBytes: settings.maxInjectBytes,
  }
}

/**
 * Resolve one raw scope spec by id directly from live state; client paths are
 * never trusted. Unlike `collectGroups`, this touches the filesystem only for
 * the one requested scope instead of describing every file in every group,
 * so a single file/save/rollback request stays O(1) in the workspace count.
 */
async function resolveScope(ctx, settings, homes, id) {
  if (typeof id !== 'string' || id.length === 0) return undefined
  if (id === 'global') return makeGlobalSpec('global', homes)
  if (id === 'global-shared') return makeGlobalSpec('shared', homes)

  const match = /^(workspace|project):([\s\S]+)$/.exec(id)
  if (!match) return undefined
  const [, prefix, workspaceId] = match
  const workspace = listWorkspaces(ctx).find((candidate) => candidate.id === workspaceId)
  if (!workspace) return undefined

  const directory = workspace.path
  const directoryInfo = await safeStat(directory)
  if (!directoryInfo.exists || directoryInfo.isDirectory !== true) return undefined
  const meta = workspaceGroupMeta(workspace, homes)

  if (prefix === 'workspace') {
    return makeFileSpec({
      id: meta.key,
      kind: 'workspace',
      groupKey: meta.key,
      groupTitle: meta.title,
      groupSubtitle: meta.subtitle,
      title: PROMPT_FILE_NAME,
      directory,
    })
  }

  let projectRoot
  try {
    projectRoot = await findProjectRoot(directory, ['.git'])
  } catch {
    projectRoot = undefined
  }
  if (projectRoot === undefined || resolve(projectRoot) === resolve(directory)) return undefined
  return makeFileSpec({
    id: 'project:' + workspace.id,
    kind: 'project',
    groupKey: meta.key,
    groupTitle: meta.title,
    groupSubtitle: meta.subtitle,
    title: '项目根 AGENTS.md',
    directory: projectRoot,
  })
}

/** Read a JSON request body with a hard byte bound. */
async function readJsonBody(req, limitBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limitBytes) {
      const error = new Error('request body too large')
      error.code = 'TOO_LARGE'
      throw error
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text.length === 0) return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('invalid JSON body')
    error.code = 'BAD_JSON'
    throw error
  }
}

/** Send one JSON response. */
function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

/** Send one JSON error response. */
function sendError(res, status, code, message, extra) {
  sendJson(res, status, { error: code, message, ...extra })
}

/** Authorize an API request: same local origin, not cross-site, and this plugin's header. */
function authorizeApi(ctx, req) {
  let expected
  try {
    expected = ctx.webServer.getOrigin()
  } catch {
    expected = undefined
  }
  const origin = req.headers.origin
  if (origin !== undefined && expected !== undefined && !sameLocalOrigin(origin, expected)) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  return req.headers['x-prompt-manager'] === '1'
}

/** Whether two URLs name the same locally bound web origin (127.0.0.1 and localhost alias). */
function sameLocalOrigin(origin, expected) {
  try {
    const left = new URL(origin)
    const right = new URL(expected)
    if (left.protocol !== right.protocol || left.port !== right.port) return false
    return isLoopbackHostname(left.hostname) && isLoopbackHostname(right.hostname)
  } catch {
    return false
  }
}

/** Local loopback hostnames a browser may use for the same listener. */
function isLoopbackHostname(hostname) {
  return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || /^127\./u.test(hostname)
}

/** Serve the management page. */
function sendPage(res, settings, head) {
  const html = renderPage({
    pagePath: settings.pagePath,
    version: VERSION,
    maxBackups: settings.maxBackups,
    maxInjectBytes: settings.maxInjectBytes,
    maxFileBytes: settings.maxFileBytes,
  })
  const body = Buffer.from(html, 'utf8')
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'no-referrer',
    'content-security-policy': [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      'img-src data:',
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
    ].join('; '),
  })
  if (head) res.end()
  else res.end(body)
}

/** First heading (or first non-empty line) of a prompt file, for backup lists. */
function firstHeading(text) {
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const heading = /^#{1,6}\s+(.*)$/u.exec(trimmed)
    if (heading && heading[1] !== undefined) return heading[1].trim().slice(0, 80)
    return trimmed.slice(0, 80)
  }
  return undefined
}

/** Route one request under the configured page path. */
async function handleRequest(ctx, settings, homes, req, res) {
  let url
  try {
    url = new URL(req.url ?? '/', LOCAL_ONLY_ORIGIN)
  } catch {
    req.resume()
    sendError(res, 400, 'BAD_URL', '无法解析请求地址')
    return
  }
  const pathname = url.pathname
  if (pathname === settings.pagePath || pathname === settings.pagePath + '/') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.resume()
      sendError(res, 405, 'METHOD_NOT_ALLOWED', '页面仅支持 GET')
      return
    }
    if (pathname === settings.pagePath + '/' && req.method === 'GET') {
      res.writeHead(308, { location: settings.pagePath, 'cache-control': 'no-store' })
      res.end()
      return
    }
    sendPage(res, settings, req.method === 'HEAD')
    return
  }

  const apiPrefix = settings.pagePath + '/api/'
  if (!pathname.startsWith(apiPrefix)) {
    req.resume()
    sendError(res, 404, 'NOT_FOUND', '未知路径')
    return
  }
  if (!authorizeApi(ctx, req)) {
    req.resume()
    sendError(res, 403, 'FORBIDDEN', '请求必须来自同源的提示词管理器页面')
    return
  }
  const route = pathname.slice(apiPrefix.length)
  const method = req.method ?? 'GET'
  try {
    if (route === 'state' && method === 'GET') {
      const { groups } = await collectGroups(ctx, settings, homes)
      sendJson(res, 200, {
        ok: true,
        version: VERSION,
        pagePath: settings.pagePath,
        generatedAt: new Date().toISOString(),
        config: settings,
        homes: {
          dshHome: displayPath(homes.dshHome, homes),
          agentsHome: displayPath(homes.agentsHome, homes),
        },
        instructionLoader: {
          package: '@deepseek-ai/dsh-agent-instructions',
          presetRow: 'standard preset · agent-instructions',
          note: '保存后由该行在下一次模型步骤探测并注入',
        },
        groups,
        templates: TEMPLATES,
      })
      return
    }
    if (route === 'file' && method === 'GET') {
      const spec = await resolveScope(ctx, settings, homes, url.searchParams.get('id'))
      if (spec === undefined) {
        sendError(res, 404, 'NOT_FOUND', '未知的提示词文件')
        return
      }
      const content = await readPromptFile(spec.path)
      const backups = await listBackups(dirname(spec.path))
      sendJson(res, 200, {
        ok: true,
        file: await describeFile(spec, settings, homes),
        content: content.content,
        eol: content.eol,
        bom: content.bom,
        size: content.size,
        mtimeMs: content.mtimeMs,
        lines: content.lines,
        backups,
      })
      return
    }
    if ((route === 'save' || route === 'rollback') && method === 'POST') {
      const body = await readJsonBody(req, settings.maxFileBytes * 2 + 65_536)
      const spec = await resolveScope(ctx, settings, homes, body.id)
      if (spec === undefined) {
        sendError(res, 404, 'NOT_FOUND', '未知的提示词文件')
        return
      }
      if (route === 'save') {
        const content = body.content
        if (typeof content !== 'string') {
          sendError(res, 400, 'BAD_CONTENT', 'content 必须是字符串')
          return
        }
        if (content.includes('\u0000')) {
          sendError(res, 400, 'BAD_CONTENT', 'content 不能包含 NUL 字符')
          return
        }
        const current = await safeStat(spec.path)
        const baseMtimeMs = body.baseMtimeMs === null || body.baseMtimeMs === undefined
          ? null
          : Number(body.baseMtimeMs)
        if (current.exists && !body.force) {
          if (baseMtimeMs === null) {
            sendError(res, 409, 'CONFLICT', '文件已在磁盘上创建或被外部修改，请先重新加载', {
              currentMtimeMs: current.mtimeMs,
            })
            return
          }
          if (Number.isFinite(baseMtimeMs) && Math.abs(current.mtimeMs - baseMtimeMs) > 0.5) {
            sendError(res, 409, 'CONFLICT', '文件已被外部修改，请重新加载或选择覆盖保存', {
              currentMtimeMs: current.mtimeMs,
            })
            return
          }
        }
        const eol = body.eol === 'crlf' ? 'crlf' : 'lf'
        const bom = body.bom === true
        const result = await savePromptFile(spec.path, content, {
          eol,
          bom,
          maxFileBytes: settings.maxFileBytes,
          maxBackups: settings.maxBackups,
        })
        const backups = await listBackups(dirname(spec.path))
        sendJson(res, 200, {
          ok: true,
          file: await describeFile(spec, settings, homes),
          backups,
          backupName: result.backup?.name ?? null,
          unchanged: result.unchanged === true,
          savedAt: new Date().toISOString(),
        })
        return
      }
      // rollback
      const name = body.name
      if (!isBackupName(name, PROMPT_FILE_NAME)) {
        sendError(res, 400, 'BAD_BACKUP', '备份文件名无效')
        return
      }
      const result = await rollbackPromptFile(spec.path, name, {
        maxBackups: settings.maxBackups,
        maxFileBytes: settings.maxFileBytes,
      })
      const content = await readPromptFile(spec.path)
      sendJson(res, 200, {
        ok: true,
        file: await describeFile(spec, settings, homes),
        content: content.content,
        eol: content.eol,
        bom: content.bom,
        size: content.size,
        mtimeMs: content.mtimeMs,
        lines: content.lines,
        backups: await listBackups(dirname(spec.path)),
        safetyBackupName: result.safetyBackup?.name ?? null,
      })
      return
    }
    if (route === 'backups' && method === 'GET') {
      const spec = await resolveScope(ctx, settings, homes, url.searchParams.get('id'))
      if (spec === undefined) {
        sendError(res, 404, 'NOT_FOUND', '未知的提示词文件')
        return
      }
      const backups = await listBackups(dirname(spec.path))
      const enriched = []
      for (const backup of backups) {
        const row = { ...backup }
        // Heading and line count make a backup list scannable; skip oversized copies.
        if (backup.size <= 262_144) {
          try {
            const content = await readBackup(dirname(spec.path), backup.name, PROMPT_FILE_NAME)
            row.lines = content.lines
            const heading = firstHeading(content.content)
            if (heading !== undefined) row.heading = heading
          } catch {
            // A backup removed between list and read keeps its basic metadata.
          }
        }
        enriched.push(row)
      }
      sendJson(res, 200, { ok: true, backups: enriched })
      return
    }
    if (route === 'backup' && method === 'GET') {
      const spec = await resolveScope(ctx, settings, homes, url.searchParams.get('id'))
      if (spec === undefined) {
        sendError(res, 404, 'NOT_FOUND', '未知的提示词文件')
        return
      }
      const name = url.searchParams.get('name') ?? ''
      if (!isBackupName(name, PROMPT_FILE_NAME)) {
        sendError(res, 400, 'BAD_BACKUP', '备份文件名无效')
        return
      }
      const backup = await readBackup(dirname(spec.path), name, PROMPT_FILE_NAME)
      if (backup.size > MAX_BACKUP_PREVIEW_BYTES) {
        sendError(res, 413, 'TOO_LARGE', '备份内容过大，无法预览')
        return
      }
      sendJson(res, 200, {
        ok: true,
        name,
        content: backup.content,
        eol: backup.eol,
        bom: backup.bom,
        size: backup.size,
        lines: backup.lines,
      })
      return
    }
    if (route === 'starter' && method === 'GET') {
      sendJson(res, 200, { ok: true, content: STARTER_CONTENT })
      return
    }
    req.resume()
    sendError(res, 404, 'NOT_FOUND', '未知的接口')
  } catch (error) {
    const log = ctx.logger
    if (log && typeof log.warn === 'function') {
      log.warn('prompt-manager: request failed: %o', error)
    }
    if (error && error.code === 'TOO_LARGE') {
      sendError(res, 413, 'TOO_LARGE', '内容超过允许的大小')
      return
    }
    if (error && error.code === 'ENOENT') {
      sendError(res, 404, 'BACKUP_NOT_FOUND', '备份文件不存在，可能已被清理')
      return
    }
    if (res.headersSent) {
      res.destroy()
      return
    }
    sendError(res, 500, 'INTERNAL', error instanceof Error ? error.message : '内部错误')
  }
}

// Re-exported helpers keep the entry's surface explicit for tests and tooling.
export { DEFAULT_PAGE_PATH }
