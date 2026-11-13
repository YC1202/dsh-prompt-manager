/**
 * Static checks for the bundle before installation:
 * page assembly, embedded-script safety, manifest/locale/patch consistency.
 * Run: node check.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { CLIENT_JS } from './lib/client.js'
import { STYLES } from './lib/styles.js'
import { STARTER_CONTENT, TEMPLATES } from './lib/templates.js'
import { renderPage } from './lib/ui.js'

const page = renderPage({
  pagePath: '/prompt-manager',
  version: '0.2.0',
  maxBackups: 5,
  maxInjectBytes: 65536,
  maxFileBytes: 1048576,
})

assert.ok(page.startsWith('<!doctype html>'), 'page doctype')
assert.ok(page.includes('<title>提示词管理器 · DeepSeek Harness</title>'), 'page title')
assert.ok(page.includes('window.__PM__'), 'boot payload')
assert.ok(!page.includes('\${'), 'no unexpanded template placeholders')
assert.equal(page.split('</script>').length - 1, 2, 'exactly the boot and client script tags')
assert.ok(page.includes('id="editor"') && page.includes('id="highlight"'), 'editor and highlight layers')
assert.ok(page.includes('id="fileList"') && page.includes('id="preview"'), 'sidebar and preview')
assert.ok(page.length > 40000, 'page carries the full UI (got ' + page.length + ' bytes)')
assert.ok(!CLIENT_JS.includes('`'), 'embedded client script has no backticks')
assert.ok(!STYLES.includes('`'), 'embedded styles have no backticks')
assert.ok(!CLIENT_JS.includes('</script'), 'embedded client script closes no script tag early')
assert.ok(CLIENT_JS.includes("ctrlKey || event.metaKey"), 'Ctrl/Cmd shortcut handling')
assert.ok(CLIENT_JS.includes('/save') && CLIENT_JS.includes('/rollback'), 'save and rollback endpoints')
assert.ok(CLIENT_JS.includes('renderMarkdown') && CLIENT_JS.includes('highlightMarkdown'), 'highlight and preview')
assert.ok(TEMPLATES.length >= 6, 'template catalog')
assert.ok(STARTER_CONTENT.includes('# AGENTS.md'), 'starter content')

const idRefs = [...new Set([...CLIENT_JS.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((match) => match[1]))]
const missingIds = idRefs.filter((id) => !page.includes('id="' + id + '"'))
assert.deepEqual(missingIds, [], 'every element id used by the client exists in the page')
assert.ok(page.includes('data-view="edit"') && page.includes('data-view="split"') && page.includes('data-view="preview"'), 'view mode buttons')

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))
assert.equal(pkg.type, 'module')
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.ok(pkg.exports['./icon'] && pkg.exports['./locale/*.json'], 'icon and locale exports')
assert.ok(pkg.files.includes('lib') && pkg.files.includes('icon.svg'), 'runtime files listed')

const dshClient = await readFile(new URL('./client.js', import.meta.url), 'utf8')
assert.equal(pkg.exports['./client'], './client.js', 'client export')
assert.equal(pkg.dsh.client.platform, 'web', 'client platform')
assert.ok(pkg.files.includes('client.js'), 'client bundle listed in files')
assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'), 'client injects settings UI')
assert.ok(dshClient.includes('window.__ModuleLoader__.load'), 'client bundle registers a lazy factory')
assert.ok(dshClient.includes("id: '@local/dsh-prompt-manager'"), 'client bundle id equals the package name')
assert.ok(dshClient.includes("'settings.section'"), 'client registers a settings section')
assert.ok(dshClient.includes("inject: ['slots', 'locale']"), 'client injects slots and locale')
assert.doesNotThrow(() => new Function(dshClient), 'client bundle parses as a classic script')

const zh = JSON.parse(await readFile(new URL('./locale/zh.json', import.meta.url), 'utf8'))
const en = JSON.parse(await readFile(new URL('./locale/en.json', import.meta.url), 'utf8'))
assert.ok(zh.meta.title && zh.meta.description, 'zh metadata')
assert.ok(en.meta.title && en.meta.description, 'en metadata')

const patch = await readFile(new URL('./cordis.patch.yml', import.meta.url), 'utf8')
assert.ok(patch.includes("name: '@local/dsh-prompt-manager'"), 'patch row name')
assert.ok(patch.includes('maxBackups: 5'), 'patch default backups')

const icon = await readFile(new URL('./icon.svg', import.meta.url), 'utf8')
assert.ok(icon.includes('viewBox="0 0 36 36"'), 'icon canvas')
assert.ok(!/<script|<style|<image|<foreignObject/u.test(icon), 'icon is self-contained geometry')

console.log('check: ok — page', page.length, 'bytes; client', CLIENT_JS.length, 'bytes; templates', TEMPLATES.length)
