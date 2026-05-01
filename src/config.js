import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export const DEFAULT_TEXT_EXTENSIONS = [
  '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go',
  '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.css', '.html', '.xml',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.sh',
  '.bash', '.zsh', '.fish', '.sql', '.csv', '.log', '.env', '.gitignore',
  '.dockerfile', '.makefile', '.cmake', '.gradle', '.properties',
]

export const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/data/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/*.lock',
  '**/package-lock.json',
]

export function normalizeExt(ext) {
  if (!ext) return ''
  let e = String(ext).trim().toLowerCase()
  if (!e) return ''
  if (!e.startsWith('.')) e = '.' + e
  return e
}

export function parseExtList(s) {
  if (!s) return []
  return s.split(',').map(normalizeExt).filter(Boolean)
}

export function loadConfig(watchDir) {
  const path = join(watchDir, '.kbrc.json')
  if (!existsSync(path)) return { _path: null }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return { ...raw, _path: path }
  } catch (err) {
    console.warn(`Failed to load ${path}: ${err.message}`)
    return { _path: path, _error: err.message }
  }
}

export function buildIndexerOptions({ watchDir, cliExt = [], probeOverride }) {
  const cfg = loadConfig(watchDir)
  const cfgExt = Array.isArray(cfg.extensions) ? cfg.extensions.map(normalizeExt).filter(Boolean) : []
  const extensions = new Set([
    ...DEFAULT_TEXT_EXTENSIONS,
    ...cfgExt,
    ...cliExt,
  ])
  const ignore = [
    ...DEFAULT_IGNORE,
    ...(Array.isArray(cfg.ignore) ? cfg.ignore : []),
  ]
  let probeExtensionless = cfg.probeExtensionless !== false
  if (probeOverride === true) probeExtensionless = true
  if (probeOverride === false) probeExtensionless = false
  return {
    extensions,
    ignore,
    probeExtensionless,
    configPath: cfg._path,
  }
}
