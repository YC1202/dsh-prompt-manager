/**
 * Client-half smoke test with a minimal React hook/runtime simulator.
 * Renders the settings section component, drives the initial load, a file
 * switch and a save through the fake Host API, and asserts the rendered tree.
 * Run: node test/client.test.cjs
 */
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const clientSource = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')

/* ------------------------------------------------------------------ */
/* minimal React runtime                                               */
/* ------------------------------------------------------------------ */

let hookSlots = []
let hookCursor = 0
let pendingEffects = []
let needsRender = false
let lastTree = null

function nextSlot() {
  const index = hookCursor
  hookCursor += 1
  if (hookSlots[index] === undefined) hookSlots[index] = {}
  return hookSlots[index]
}

function depsChanged(slot, deps) {
  if (!slot.deps || !deps || slot.deps.length !== deps.length) return true
  return deps.some((value, index) => !Object.is(value, slot.deps[index]))
}

const ReactFake = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    const flat = []
    const push = (child) => {
      if (Array.isArray(child)) child.forEach(push)
      else if (child !== null && child !== undefined && child !== false && child !== true) flat.push(child)
    }
    children.forEach(push)
    return { type, props: props || {}, children: flat }
  },
  useReducer(reducer, initial) {
    const slot = nextSlot()
    if (!('value' in slot)) slot.value = initial
    const dispatch = (action) => {
      slot.value = reducer(slot.value, action)
      needsRender = true
    }
    return [slot.value, dispatch]
  },
  useState(initial) {
    const slot = nextSlot()
    if (!('value' in slot)) slot.value = typeof initial === 'function' ? initial() : initial
    const setState = (next) => {
      slot.value = typeof next === 'function' ? next(slot.value) : next
      needsRender = true
    }
    return [slot.value, setState]
  },
  useRef(initial) {
    const slot = nextSlot()
    if (!('ref' in slot)) slot.ref = { current: initial }
    return slot.ref
  },
  useCallback(callback, deps) {
    const slot = nextSlot()
    if (!('value' in slot) || depsChanged(slot, deps)) {
      slot.value = callback
      slot.deps = deps
    }
    return slot.value
  },
  useMemo(factory, deps) {
    const slot = nextSlot()
    if (!('value' in slot) || depsChanged(slot, deps)) {
      slot.value = factory()
      slot.deps = deps
    }
    return slot.value
  },
  useEffect(effect, deps) {
    const slot = nextSlot()
    if (!('value' in slot) || depsChanged(slot, deps)) {
      slot.value = effect
      slot.deps = deps
      pendingEffects.push(effect)
    }
  },
}

function renderOnce(component) {
  hookCursor = 0
  pendingEffects = []
  const tree = component({})
  const effects = pendingEffects
  pendingEffects = []
  return { tree, effects }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Rerender until no state update is pending (fake fetch resolves in microtasks). */
async function settle(component) {
  for (let round = 0; round < 30; round += 1) {
    await sleep(0)
    if (!needsRender) {
      if (round > 2) break
      continue
    }
    needsRender = false
    const { tree, effects } = renderOnce(component)
    lastTree = tree
    for (const effect of effects) effect()
  }
  return lastTree
}

/* ------------------------------------------------------------------ */
/* fake Host API                                                       */
/* ------------------------------------------------------------------ */

const globalFile = {
  id: 'global',
  kind: 'global',
  groupKey: 'global',
  title: 'AGENTS.md',
  displayPath: '~/.dsh/AGENTS.md',
  path: 'C:/Users/me/.dsh/AGENTS.md',
  exists: true,
  size: 15,
  mtimeMs: 1000,
  backupCount: 1,
  warnings: [],
}
const workspaceFile = {
  id: 'workspace:ws1',
  kind: 'workspace',
  groupKey: 'workspace:ws1',
  title: 'AGENTS.md',
  displayPath: '~/demo/AGENTS.md',
  path: 'C:/demo/AGENTS.md',
  exists: false,
  size: 0,
  mtimeMs: null,
  backupCount: 0,
  warnings: [],
}
const statePayload = {
  ok: true,
  version: '0.2.0',
  pagePath: '/prompt-manager',
  groups: [
    { key: 'global', kind: 'global', title: '全局配置', subtitle: '~/.dsh/AGENTS.md', files: [globalFile] },
    { key: 'workspace:ws1', kind: 'workspace', title: 'Demo', subtitle: '~/demo', workspaceId: 'ws1', files: [workspaceFile] },
  ],
  templates: [{ id: 'reply', title: '回复与协作方式', hint: 'hint', body: '## 回复与协作\n' }],
  homes: { dshHome: '~/.dsh', agentsHome: '~/.agents' },
}

const calls = []
const previousFetch = global.fetch
let saveCount = 0

global.fetch = async (url, init) => {
  const target = String(url)
  calls.push({ url: target, init: init || {} })
  await Promise.resolve()
  let data = {}
  if (target.endsWith('/state')) {
    data = statePayload
  } else if (target.includes('/file?')) {
    const id = decodeURIComponent(target.split('id=')[1])
    if (id === 'global') {
      data = { ok: true, file: globalFile, content: '# Global rule\n', eol: 'lf', bom: false, size: 15, mtimeMs: 1000, lines: 2, backups: [] }
    } else {
      data = { ok: true, file: workspaceFile, content: '', eol: 'lf', bom: false, size: 0, mtimeMs: null, lines: 0, backups: [] }
    }
  } else if (target.endsWith('/save')) {
    saveCount += 1
    const body = JSON.parse(init.body)
    const savedFile = { ...workspaceFile, exists: true, size: body.content.length, mtimeMs: 2000 + saveCount, backupCount: 0 }
    data = { ok: true, file: savedFile, backups: [], backupName: null, unchanged: false, savedAt: new Date().toISOString() }
  } else if (target.includes('/starter')) {
    data = { ok: true, content: '# AGENTS.md\n' }
  } else if (target.includes('/backups')) {
    data = { ok: true, backups: [{ name: '.AGENTS.md.20260101-000000-000.bak', size: 10, mtimeMs: 1500, lines: 2, heading: '# old' }] }
  } else if (target.includes('/backup?')) {
    data = { ok: true, name: '.AGENTS.md.20260101-000000-000.bak', content: '# old\n', eol: 'lf', bom: false, size: 7, lines: 2 }
  } else if (target.endsWith('/rollback')) {
    data = { ok: true, file: { ...workspaceFile, exists: true, size: 7, mtimeMs: 2500 }, content: '# old\n', eol: 'lf', bom: false, size: 7, mtimeMs: 2500, lines: 2, backups: [], safetyBackupName: '.AGENTS.md.20260101-000001-000.bak' }
  }
  return { ok: true, status: 200, json: async () => data }
}

/* ------------------------------------------------------------------ */
/* load the bundle, mount the settings page                            */
/* ------------------------------------------------------------------ */

let captured = null
global.window = {
  __ModuleLoader__: {
    load(entry) {
      captured = entry
    },
  },
  addEventListener() {},
  removeEventListener() {},
}
vm.runInThisContext(clientSource, { filename: 'client.js' })
assert.ok(captured, 'client bundle registered a factory')
assert.equal(captured.id, '@local/dsh-prompt-manager')

let component = null
const localeDictionaries = {}
const slots = []
const context = {
  effect(effect) {
    const cleanup = effect()
    return cleanup
  },
  locale: {
    register(ns, locale, dict) {
      localeDictionaries[locale] = dict
      return () => {}
    },
    bind() {
      return (key) => (localeDictionaries.zh && localeDictionaries.zh[key]) || key
    },
    subscribe() {
      return () => {}
    },
  },
  slots: {
    inject(key, callback) {
      slots.push(key)
      callback()
      return () => {}
    },
    register(options, renderer) {
      assert.equal(options.name, 'settings.section')
      assert.equal(options.id, 'prompt-manager')
      component = renderer
      return () => {}
    },
  },
}

const exportsObject = captured.factory((name) => {
  if (name === 'react') return ReactFake
  throw new Error('unexpected require: ' + name)
})
assert.ok(exportsObject.apply, 'factory exports apply')
exportsObject.apply(context)
assert.ok(component, 'settings.section component registered')
assert.ok(slots.includes('settings.section'))

/* ------------------------------------------------------------------ */
/* helpers over the rendered tree                                      */
/* ------------------------------------------------------------------ */

function walk(node, visit) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node !== 'object') {
    visit(node)
    return
  }
  visit(node)
  for (const child of node.children || []) walk(child, visit)
}

function textOf(node) {
  let out = ''
  walk(node, (item) => {
    if (typeof item === 'string') out += item
    if (typeof item === 'number') out += String(item)
  })
  return out
}

function findAll(tree, predicate) {
  const found = []
  walk(tree, (node) => {
    if (predicate(node)) found.push(node)
  })
  return found
}

function findTextarea(tree) {
  return findAll(tree, (node) => node.type === 'textarea')[0]
}

function findButton(tree, label) {
  return findAll(tree, (node) => node.type === 'button' && textOf(node).includes(label))[0]
}

function findToolbarButton(tree, label) {
  return findAll(tree, (node) => node.type === 'button' &&
    String(node.props.className || '').includes('pm-btn') &&
    textOf(node).trim() === label)[0]
}

function findItem(tree, pathFragment) {
  return findAll(tree, (node) => node.type === 'button' &&
    String(node.props.className || '').includes('pm-item') &&
    textOf(node).includes(pathFragment))[0]
}

;(async () => {
  const first = renderOnce(component)
  lastTree = first.tree
  for (const effect of first.effects) effect()
  await settle(component)

  const initialText = textOf(lastTree)
  assert.ok(initialText.includes('提示词文件'), 'renders the title')
  assert.ok(initialText.includes('全局配置'), 'renders the global group')
  assert.ok(initialText.includes('Demo'), 'renders the workspace group')
  const textarea = findTextarea(lastTree)
  assert.ok(textarea, 'renders the editor textarea')
  assert.equal(textarea.props.value, '# Global rule\n', 'loads the global file content')
  assert.ok(calls.some((call) => call.url.endsWith('/state')), 'fetches state')
  assert.ok(calls.some((call) => call.url.includes('/file?id=global')), 'fetches the initial file')

  // Switch to the missing workspace file: the empty state and create actions appear.
  const workspaceItem = findItem(lastTree, '~/demo/AGENTS.md')
  assert.ok(workspaceItem, 'renders the workspace file row')
  workspaceItem.props.onClick()
  await settle(component)
  const missingText = textOf(lastTree)
  assert.ok(missingText.includes('尚未创建'), 'shows the missing-file banner')
  assert.ok(findButton(lastTree, '填入初始化模板'), 'offers the starter template action')
  assert.equal(findTextarea(lastTree).props.value, '', 'edits the missing file as empty')

  // Type and save: the POST body carries the new content and the create path.
  findTextarea(lastTree).props.onChange({ target: { value: '# New rule\n' } })
  await settle(component)
  const saveButton = findButton(lastTree, '创建文件') || findButton(lastTree, '保存')
  assert.ok(saveButton, 'renders the save/create button')
  saveButton.props.onClick()
  await settle(component)
  const saveCall = calls.filter((call) => call.url.endsWith('/save')).pop()
  assert.ok(saveCall, 'posts to /save')
  const body = JSON.parse(saveCall.init.body)
  assert.equal(body.id, 'workspace:ws1')
  assert.equal(body.content, '# New rule\n')
  assert.equal(body.baseMtimeMs, null, 'creates with no base mtime')
  const savedText = textOf(lastTree)
  assert.ok(savedText.includes('已保存'), 'reports the save result')
  assert.ok(!savedText.includes('尚未创建'), 'clears the missing banner after save')

  // Backups panel lists the enriched backup with a heading.
  const backupsButton = findToolbarButton(lastTree, '备份')
  assert.ok(backupsButton, 'renders the backups button')
  backupsButton.props.onClick()
  await settle(component)
  const backupText = textOf(lastTree)
  assert.ok(backupText.includes('备份历史'), 'opens the backup panel')
  assert.ok(backupText.includes('# old'), 'shows the backup heading')

  console.log('client test: ok — settings page mounts, switches files, saves and lists backups')
  global.fetch = previousFetch
  process.exit(0)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
