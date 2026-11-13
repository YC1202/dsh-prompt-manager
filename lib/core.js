/**
 * Pure-ish file helpers for the prompt manager: path resolution, encoding,
 * atomic writes, timestamped backups and backup rotation.
 *
 * Every mutation is synchronous at the OS level per call (temp file + rename),
 * so a reader never observes a half-written AGENTS.md.
 */

import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

/** File name this plugin manages inside every scope directory. */
export const PROMPT_FILE_NAME = 'AGENTS.md'
/** Prefix added to every backup file name. */
export const BACKUP_PREFIX = '.'
/** Suffix of a backup file name. */
export const BACKUP_SUFFIX = '.bak'
/** Longest prompt file accepted by the API (mirrors agent-instructions maxSourceBytes default). */
export const DEFAULT_MAX_FILE_BYTES = 1_048_576
/** Injection budget of the standard preset's agent-instructions row. */
export const DEFAULT_MAX_INJECT_BYTES = 65_536
/** Default number of backups retained per file. */
export const DEFAULT_MAX_BACKUPS = 5
/** Default page path on the DSH Web origin. */
export const DEFAULT_PAGE_PATH = '/prompt-manager'

const BOM = '\uFEFF'

/** Resolve the harness and shared-agents roots the same way dsh-home-paths does. */
export function resolveHomes(env = process.env, home = homedir()) {
  const fromEnv = (name) => {
    const value = env[name]
    return typeof value === 'string' && value.trim().length > 0 ? resolve(value.trim()) : undefined
  }
  return {
    home: resolve(home),
    dshHome: fromEnv('DSH_HOME') ?? join(resolve(home), '.dsh'),
    agentsHome: fromEnv('DSH_AGENTS_HOME') ?? join(resolve(home), '.agents'),
  }
}

/** Render an absolute path with `~` / `~/.dsh` / `~/.agents` prefixes for display. */
export function displayPath(absolutePath, homes = resolveHomes()) {
  const normalized = resolve(absolutePath)
  const roots = [
    { root: homes.dshHome, label: '~/.dsh' },
    { root: homes.agentsHome, label: '~/.agents' },
    { root: homes.home, label: '~' },
  ]
  for (const { root, label } of roots) {
    if (root === normalized) return label
    if (normalized.startsWith(root + sep)) {
      const tail = normalized.slice(root.length + 1).split(sep).join('/')
      return label + '/' + tail
    }
  }
  return normalized
}

/** Clamp plugin configuration read from the bundle patch row. */
export function normalizeConfig(raw = {}) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  const int = (value, fallback, min, max) => {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.trunc(n)))
  }
  const pagePath = normalizePagePath(input.pagePath)
  return {
    maxBackups: int(input.maxBackups, DEFAULT_MAX_BACKUPS, 1, 50),
    maxInjectBytes: int(input.maxInjectBytes, DEFAULT_MAX_INJECT_BYTES, 1_024, 4 * 1024 * 1024),
    maxFileBytes: int(input.maxFileBytes, DEFAULT_MAX_FILE_BYTES, 1_024, 16 * 1024 * 1024),
    pagePath,
  }
}

/** Normalize a page path into `/name` form; falls back to the default path. */
export function normalizePagePath(value) {
  if (typeof value !== 'string') return DEFAULT_PAGE_PATH
  const trimmed = value.trim()
  if (!/^\/[A-Za-z0-9._~/-]*$/u.test(trimmed)) return DEFAULT_PAGE_PATH
  const noTrailing = trimmed.length > 1 ? trimmed.replace(/\/+$/u, '') : trimmed
  if (noTrailing === '/' || noTrailing.length === 0) return DEFAULT_PAGE_PATH
  return noTrailing
}

/** Byte length of a UTF-8 string. */
export function byteLength(text) {
  return Buffer.byteLength(text, 'utf8')
}

/** Editor-style line count: one line per newline, plus the final (possibly empty) line. */
export function lineCount(text) {
  let lines = 1
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) lines += 1
  }
  return lines
}

/** Decode a prompt file buffer, remembering BOM and dominant line ending. */
export function decodeContent(buffer) {
  const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
  const text = buffer.toString('utf8').replace(/^\uFEFF/u, '')
  const crlf = (text.match(/\r\n/gu) ?? []).length
  const lf = (text.match(/\n/gu) ?? []).length
  const eol = crlf > 0 && crlf >= lf - crlf ? 'crlf' : 'lf'
  const normalized = text.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n')
  return { content: normalized, eol, bom: hasBom }
}

/** Encode editor text as bytes for the physical file, restoring BOM and line endings. */
export function encodeContent(text, { eol = 'lf', bom = false } = {}) {
  const normalized = String(text).replace(/\r\n/gu, '\n').replace(/\r/gu, '\n')
  const body = eol === 'crlf' ? normalized.replace(/\n/gu, '\r\n') : normalized
  return Buffer.from(bom ? BOM + body : body, 'utf8')
}

/** Local-time timestamp used inside backup file names. */
export function backupStamp(date = new Date()) {
  const pad = (value, width = 2) => String(value).padStart(width, '0')
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    '-' +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds()) +
    '-' +
    pad(date.getMilliseconds(), 3)
  )
}

/** Regex matching this plugin's backups for one managed file name. */
export function backupNamePattern(fileName = PROMPT_FILE_NAME) {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp('^\\.' + escaped + '\\.(\\d{8}-\\d{6}-\\d{3})\\.bak$', 'u')
}

/** Build a backup file name for one managed file. */
export function backupFileName(fileName = PROMPT_FILE_NAME, date = new Date()) {
  return BACKUP_PREFIX + fileName + '.' + backupStamp(date) + BACKUP_SUFFIX
}

/** Whether `name` is a valid backup name for this plugin's managed file. */
export function isBackupName(name, fileName = PROMPT_FILE_NAME) {
  return typeof name === 'string' && backupNamePattern(fileName).test(name)
}

/** Path helper for one scope file: `<directory>/AGENTS.md`. */
export function promptFilePath(directory, fileName = PROMPT_FILE_NAME) {
  return join(directory, fileName)
}

/**
 * Find the nearest ancestor (including `startDir`) that contains one of the
 * project-root markers, mirroring agent-instructions' discovery. Returns
 * `undefined` when no marker exists or the walk fails.
 */
export async function findProjectRoot(startDir, markers = ['.git'], io = {}) {
  const exists = io.exists ?? (async (path) => {
    try {
      await stat(path)
      return true
    } catch {
      return false
    }
  })
  let current = resolve(startDir)
  for (;;) {
    for (const marker of markers) {
      if (await exists(join(current, marker))) return current
    }
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/** Stat a path without throwing for a missing file. */
export async function safeStat(path) {
  try {
    const info = await stat(path)
    return {
      exists: true,
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
      size: info.size,
      mtimeMs: info.mtimeMs,
    }
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return { exists: false }
    throw error
  }
}

/** Read one prompt file with encoding metadata; missing files report `exists: false`. */
export async function readPromptFile(filePath) {
  const info = await safeStat(filePath)
  if (!info.exists || !info.isFile) {
    return {
      exists: false,
      content: '',
      eol: 'lf',
      bom: false,
      size: 0,
      mtimeMs: null,
      lines: 0,
    }
  }
  const buffer = await readFile(filePath)
  const decoded = decodeContent(buffer)
  return {
    exists: true,
    content: decoded.content,
    eol: decoded.eol,
    bom: decoded.bom,
    size: buffer.length,
    mtimeMs: info.mtimeMs,
    lines: lineCount(decoded.content),
  }
}

/** List this plugin's backups for one managed file, newest first. */
export async function listBackups(directory, fileName = PROMPT_FILE_NAME) {
  let names
  try {
    names = await readdir(directory)
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return []
    throw error
  }
  const pattern = backupNamePattern(fileName)
  const rows = []
  for (const name of names) {
    if (!pattern.test(name)) continue
    const backupPath = join(directory, name)
    const info = await safeStat(backupPath)
    if (!info.exists || !info.isFile) continue
    rows.push({ name, size: info.size, mtimeMs: info.mtimeMs })
  }
  rows.sort((left, right) => (left.name < right.name ? 1 : -1))
  return rows
}

/** Delete backups beyond `maxBackups` (newest kept). Returns removed backup names. */
export async function pruneBackups(directory, fileName = PROMPT_FILE_NAME, maxBackups = DEFAULT_MAX_BACKUPS) {
  const backups = await listBackups(directory, fileName)
  const removed = []
  for (const stale of backups.slice(Math.max(0, maxBackups))) {
    try {
      await unlink(join(directory, stale.name))
      removed.push(stale.name)
    } catch (error) {
      if (error && error.code !== 'ENOENT') throw error
    }
  }
  return removed
}

/**
 * Copy the current file into a timestamped backup before an overwrite.
 * Returns the created backup, or `null` when there was no file to back up.
 */
export async function createBackup(filePath, options = {}) {
  const {
    fileName = basename(filePath),
    maxBackups = DEFAULT_MAX_BACKUPS,
    now = new Date(),
  } = options
  const info = await safeStat(filePath)
  if (!info.exists || !info.isFile) return null
  const directory = dirname(filePath)
  await mkdir(directory, { recursive: true })
  let name = backupFileName(fileName, now)
  if (existsSync(join(directory, name))) {
    name = backupFileName(fileName, new Date(now.getTime() + 1))
  }
  const backupPath = join(directory, name)
  await copyFile(filePath, backupPath)
  await pruneBackups(directory, fileName, maxBackups)
  const copied = await safeStat(backupPath)
  return { name, size: copied.exists ? copied.size : info.size, mtimeMs: copied.exists ? copied.mtimeMs : Date.now() }
}

/** Atomically publish `data` at `filePath` (temp file in the same directory, then rename). */
export async function atomicWrite(filePath, data) {
  const directory = dirname(filePath)
  await mkdir(directory, { recursive: true })
  const tempPath = join(
    directory,
    '.' + basename(filePath) + '.' + process.pid + '.' + Date.now() + '.' + randomBytes(4).toString('hex') + '.tmp',
  )
  try {
    await writeFile(tempPath, data)
    await renameWithRetry(tempPath, filePath)
  } catch (error) {
    try {
      await unlink(tempPath)
    } catch {
      // The rename may already have consumed the temp file.
    }
    throw error
  }
}

/** Windows can briefly report EPERM/EBUSY while another process closes the target. */
async function renameWithRetry(source, target) {
  const delays = [0, 40, 120]
  let lastError
  for (const delay of delays) {
    if (delay > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay))
    try {
      await rename(source, target)
      return
    } catch (error) {
      lastError = error
      if (!error || (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'EACCES')) throw error
    }
  }
  throw lastError
}

/** Write editor text as one atomic save; optionally backup the previous file first. */
export async function savePromptFile(filePath, text, options = {}) {
  const {
    eol = 'lf',
    bom = false,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    maxBackups = DEFAULT_MAX_BACKUPS,
    now = new Date(),
  } = options
  const encoded = encodeContent(text, { eol, bom })
  if (encoded.length > maxFileBytes) {
    const error = new Error('content exceeds the configured file byte limit')
    error.code = 'TOO_LARGE'
    throw error
  }
  let existing
  try {
    existing = await readFile(filePath)
  } catch (error) {
    if (!error || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) throw error
  }
  if (existing !== undefined && existing.equals(encoded)) {
    const unchanged = await safeStat(filePath)
    return {
      backup: null,
      unchanged: true,
      size: encoded.length,
      mtimeMs: unchanged.exists ? unchanged.mtimeMs : Date.now(),
    }
  }
  const backup = await createBackup(filePath, { fileName: basename(filePath), maxBackups, now })
  await atomicWrite(filePath, encoded)
  const info = await safeStat(filePath)
  return { backup, size: encoded.length, mtimeMs: info.exists ? info.mtimeMs : Date.now() }
}

/** Read a backup for preview or rollback: normalized text plus raw encoding facts. */
export async function readBackup(directory, name, fileName = PROMPT_FILE_NAME) {
  if (!isBackupName(name, fileName)) {
    const error = new Error('invalid backup name')
    error.code = 'INVALID_BACKUP'
    throw error
  }
  const buffer = await readFile(join(directory, name))
  const decoded = decodeContent(buffer)
  return { ...decoded, size: buffer.length, lines: lineCount(decoded.content) }
}

/** Restore one backup, backing up the current file first so the rollback is reversible. */
export async function rollbackPromptFile(filePath, name, options = {}) {
  const {
    maxBackups = DEFAULT_MAX_BACKUPS,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    now = new Date(),
  } = options
  const directory = dirname(filePath)
  const fileName = basename(filePath)
  const backupContent = await readBackup(directory, name, fileName)
  const encoded = encodeContent(backupContent.content, { eol: backupContent.eol, bom: backupContent.bom })
  if (encoded.length > maxFileBytes) {
    const error = new Error('backup exceeds the configured file byte limit')
    error.code = 'TOO_LARGE'
    throw error
  }
  const safety = await createBackup(filePath, { fileName, maxBackups, now })
  await atomicWrite(filePath, encoded)
  const info = await safeStat(filePath)
  return { safetyBackup: safety, size: encoded.length, mtimeMs: info.exists ? info.mtimeMs : Date.now() }
}

/** Truncated UTC/local ISO string for JSON responses. */
export function isoNow() {
  return new Date().toISOString()
}
