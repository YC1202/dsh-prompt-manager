import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  atomicWrite,
  backupFileName,
  backupStamp,
  decodeContent,
  displayPath,
  encodeContent,
  findProjectRoot,
  isBackupName,
  lineCount,
  listBackups,
  normalizeConfig,
  normalizePagePath,
  readPromptFile,
  resolveHomes,
  rollbackPromptFile,
  savePromptFile,
} from '../lib/core.js'

async function withTempDir(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-prompt-manager-test-'))
  try {
    return await fn(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('resolveHomes follows DSH_HOME and DSH_AGENTS_HOME', () => {
  const homes = resolveHomes({ DSH_HOME: 'C:\\homes\\dsh', DSH_AGENTS_HOME: 'C:\\homes\\agents' }, 'C:\\Users\\me')
  assert.equal(homes.dshHome, 'C:\\homes\\dsh')
  assert.equal(homes.agentsHome, 'C:\\homes\\agents')

  const fallback = resolveHomes({}, 'C:\\Users\\me')
  assert.equal(fallback.dshHome, join('C:\\Users\\me', '.dsh'))
  assert.equal(fallback.agentsHome, join('C:\\Users\\me', '.agents'))
})

test('displayPath shortens known homes', () => {
  const homes = { home: 'C:\\Users\\me', dshHome: 'C:\\Users\\me\\.dsh', agentsHome: 'C:\\Users\\me\\.agents' }
  assert.equal(displayPath('C:\\Users\\me\\.dsh\\AGENTS.md', homes), '~/.dsh/AGENTS.md')
  assert.equal(displayPath('C:\\Users\\me\\.agents\\AGENTS.md', homes), '~/.agents/AGENTS.md')
  assert.equal(displayPath('D:\\work\\AGENTS.md', homes), 'D:\\work\\AGENTS.md')
})

test('configuration is clamped and page paths validated', () => {
  assert.equal(normalizePagePath('/prompt-manager'), '/prompt-manager')
  assert.equal(normalizePagePath('/a/b/'), '/a/b')
  assert.equal(normalizePagePath('nope'), '/prompt-manager')
  assert.equal(normalizePagePath('/'), '/prompt-manager')
  assert.equal(normalizePagePath('/a?x=1'), '/prompt-manager')

  const config = normalizeConfig({ maxBackups: 999, maxInjectBytes: '1', pagePath: '/pm' })
  assert.equal(config.maxBackups, 50)
  assert.equal(config.maxInjectBytes, 1024)
  assert.equal(config.pagePath, '/pm')
})

test('lineCount and encoding round-trip preserve CRLF and BOM', () => {
  assert.equal(lineCount(''), 1)
  assert.equal(lineCount('a'), 1)
  assert.equal(lineCount('a\n'), 2)
  assert.equal(lineCount('a\nb\n'), 3)

  const buffer = Buffer.from('\uFEFFa\r\nb\r\n', 'utf8')
  const decoded = decodeContent(buffer)
  assert.equal(decoded.content, 'a\nb\n')
  assert.equal(decoded.eol, 'crlf')
  assert.equal(decoded.bom, true)
  const encoded = encodeContent(decoded.content, decoded)
  assert.equal(encoded.toString('utf8'), '\uFEFFa\r\nb\r\n')
})

test('atomic write replaces an existing file', async () => {
  await withTempDir(async (directory) => {
    const target = join(directory, 'AGENTS.md')
    await atomicWrite(target, 'one')
    assert.equal(await readFile(target, 'utf8'), 'one')
    await atomicWrite(target, 'two')
    assert.equal(await readFile(target, 'utf8'), 'two')
  })
})

test('save creates backups, rotates the newest five and skips unchanged writes', async () => {
  await withTempDir(async (directory) => {
    const target = join(directory, 'AGENTS.md')
    const now = new Date('2026-01-02T03:04:05.678')
    for (let i = 1; i <= 7; i += 1) {
      await savePromptFile(target, 'version ' + i + '\n', {
        maxBackups: 5,
        now: new Date(now.getTime() + i * 1000),
      })
    }
    const backups = await listBackups(directory)
    assert.equal(backups.length, 5)
    for (const backup of backups) assert.ok(isBackupName(backup.name))

    const unchanged = await savePromptFile(target, 'version 7\n', { maxBackups: 5, now })
    assert.equal(unchanged.unchanged, true)
    assert.equal(unchanged.backup, null)
    assert.equal((await listBackups(directory)).length, 5)

    const file = await readPromptFile(target)
    assert.equal(file.exists, true)
    assert.equal(file.content, 'version 7\n')
  })
})

test('rollback restores a backup and backs up the current content first', async () => {
  await withTempDir(async (directory) => {
    const target = join(directory, 'AGENTS.md')
    const base = new Date('2026-02-03T04:05:06.789')
    await savePromptFile(target, 'v1\n', { maxBackups: 5, now: base })
    await savePromptFile(target, 'v2\n', { maxBackups: 5, now: new Date(base.getTime() + 1000) })
    await savePromptFile(target, 'v3\n', { maxBackups: 5, now: new Date(base.getTime() + 2000) })

    const backups = await listBackups(directory)
    assert.equal(backups.length, 2)
    const oldest = backups[backups.length - 1]
    const restored = await rollbackPromptFile(target, oldest.name, {
      maxBackups: 5,
      now: new Date(base.getTime() + 3000),
    })
    assert.equal(restored.safetyBackup.name.startsWith('.AGENTS.md.'), true)
    const file = await readPromptFile(target)
    assert.equal(file.content, 'v1\n')
    const after = await listBackups(directory)
    assert.ok(after.some((backup) => backup.name === restored.safetyBackup.name))
  })
})

test('findProjectRoot climbs to the nearest marker', async () => {
  await withTempDir(async (directory) => {
    const root = join(directory, 'repo')
    const nested = join(root, 'packages', 'app', 'src')
    await mkdir(nested, { recursive: true })
    await mkdir(join(root, '.git'))
    assert.equal(await findProjectRoot(nested, ['.git']), root)
    assert.equal(await findProjectRoot(directory, ['.git']), undefined)
  })
})

test('backup file names embed a sortable local timestamp', () => {
  const name = backupFileName('AGENTS.md', new Date('2026-03-04T05:06:07.008'))
  assert.equal(name, '.AGENTS.md.20260304-050607-008.bak')
  assert.equal(isBackupName(name), true)
  assert.equal(isBackupName('AGENTS.md.bak'), false)
  assert.equal(isBackupName('.AGENTS.md.20260304-050607-008.bak/../x'), false)
  assert.equal(backupStamp(new Date('2026-01-01T00:00:00.001')), '20260101-000000-001')
})
