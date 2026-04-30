#!/usr/bin/env node

import { resolve, join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { startWatcher } from './src/watcher.js'
import { createServer } from './src/server.js'
import { Store } from './src/store.js'
import { initEmbedder } from './src/embedder.js'

const args = process.argv.slice(2)

const REGISTRY_DIR = join(homedir(), '.underrow')
const REGISTRY_PATH = join(REGISTRY_DIR, 'instances.json')

function flag(name, fallback) {
  const i = args.indexOf(name)
  if (i === -1) return fallback
  return args.splice(i, 2)[1] || fallback
}

function isPidAlive(pid) {
  if (!pid || pid === process.pid) return pid === process.pid
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

function readRegistry() {
  try {
    const arr = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeRegistry(list) {
  mkdirSync(REGISTRY_DIR, { recursive: true })
  writeFileSync(REGISTRY_PATH, JSON.stringify(list, null, 2))
}

function pruneRegistry() {
  const list = readRegistry().filter(e => isPidAlive(e.pid))
  writeRegistry(list)
  return list
}

function registerInstance(entry) {
  const list = pruneRegistry().filter(e => e.pid !== entry.pid)
  list.push(entry)
  writeRegistry(list)
}

function deregisterInstance(pid) {
  try {
    writeRegistry(readRegistry().filter(e => e.pid !== pid))
  } catch {}
}

function formatUptime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function runList() {
  const list = pruneRegistry()
  if (list.length === 0) {
    console.log('No running underrow instances.')
    return
  }
  const now = Date.now()
  const rows = list.map(e => ({
    pid: String(e.pid),
    port: String(e.port),
    url: `http://localhost:${e.port}`,
    watch: e.watchDir || '',
    uptime: formatUptime(now - (e.startedAt || now)),
  }))
  const w = {
    pid: Math.max(3, ...rows.map(r => r.pid.length)),
    port: Math.max(4, ...rows.map(r => r.port.length)),
    url: Math.max(3, ...rows.map(r => r.url.length)),
    watch: Math.max(5, ...rows.map(r => r.watch.length)),
  }
  const line = (pid, port, url, watch, uptime) =>
    `${pid.padEnd(w.pid)}  ${port.padEnd(w.port)}  ${url.padEnd(w.url)}  ${watch.padEnd(w.watch)}  ${uptime}`
  console.log(line('PID', 'PORT', 'URL', 'WATCH', 'UPTIME'))
  for (const r of rows) console.log(line(r.pid, r.port, r.url, r.watch, r.uptime))
}

function acquireLock(dataDir, info) {
  mkdirSync(dataDir, { recursive: true })
  const lockPath = join(dataDir, '.underrow.lock')
  if (existsSync(lockPath)) {
    let existing = null
    try { existing = JSON.parse(readFileSync(lockPath, 'utf8')) } catch {}
    if (existing && existing.pid && existing.pid !== process.pid && isPidAlive(existing.pid)) {
      console.error(`refusing to start: instance pid=${existing.pid} already serving ${dataDir} on port ${existing.port}`)
      process.exit(2)
    }
    if (existing && existing.pid) {
      console.warn(`stale lockfile detected (pid=${existing.pid} not alive); overwriting`)
    }
  }
  writeFileSync(lockPath, JSON.stringify(info, null, 2))
  return lockPath
}

function releaseLock(lockPath) {
  try { unlinkSync(lockPath) } catch {}
}

function listenWithRetry(app, startPort, allowIncrement, maxTries = 20) {
  return new Promise((resolveP, rejectP) => {
    let port = startPort
    let tries = 0
    const tryListen = () => {
      tries++
      const server = app.listen(port)
      const onListening = () => {
        server.removeListener('error', onError)
        resolveP({ server, port })
      }
      const onError = err => {
        server.removeListener('listening', onListening)
        if (err.code === 'EADDRINUSE' && allowIncrement && tries < maxTries) {
          console.warn(`port ${port} in use, trying ${port + 1}...`)
          port++
          setImmediate(tryListen)
          return
        }
        rejectP(err)
      }
      server.once('listening', onListening)
      server.once('error', onError)
    }
    tryListen()
  })
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`underrow - watch a directory, embed content, search via UI & API

Usage: underrow [dir] [options]
       underrow list

Subcommands:
  list             Show running underrow instances (pid, port, watch dir)

Arguments:
  dir              Directory to watch (default: current directory)

Options:
  --port, -p       Server port (default: 3737, env: KB_PORT). If not explicitly
                   set and the port is busy, underrow auto-increments.
  --data, -d       Data storage directory (default: ./data, env: KB_DATA_DIR).
                   Two instances may not share a data directory.
  -h, --help       Show this help
`)
  process.exit(0)
}

if (args[0] === 'list') {
  runList()
  process.exit(0)
}

const portExplicit = !!process.env.KB_PORT || args.includes('--port') || args.includes('-p')
const PORT = parseInt(flag('--port', flag('-p', process.env.KB_PORT || '3737')), 10)
const DATA_DIR = resolve(flag('--data', flag('-d', process.env.KB_DATA_DIR || './data')))
const WATCH_DIR = resolve(args[0] || process.env.KB_WATCH_DIR || process.cwd())

let lockPath = null
let cleaned = false
function cleanup() {
  if (cleaned) return
  cleaned = true
  if (lockPath) releaseLock(lockPath)
  deregisterInstance(process.pid)
}

process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(0) })
process.on('SIGTERM', () => { cleanup(); process.exit(0) })

async function main() {
  lockPath = acquireLock(DATA_DIR, {
    pid: process.pid,
    port: PORT,
    watchDir: WATCH_DIR,
    startedAt: Date.now(),
  })

  console.log(`KB starting...`)
  console.log(`  Watch dir : ${WATCH_DIR}`)
  console.log(`  Data dir  : ${DATA_DIR}`)
  console.log(`  Port      : ${PORT}${portExplicit ? '' : ' (auto-increment if busy)'}`)

  console.log('Loading embedding model...')
  const embedder = await initEmbedder()
  console.log('Embedding model ready.')

  const store = new Store(DATA_DIR, embedder.dimensions)
  store._embedder = embedder

  if (process.env.KB_REINDEX === '1') {
    console.log('KB_REINDEX=1 set — clearing store for full rebuild')
    store.metadata = []
    store.vectors = []
    const faiss = (await import('faiss-node')).default
    store.index = new faiss.IndexFlatIP(embedder.dimensions)
    store.save()
  }

  startWatcher(WATCH_DIR, store, embedder)

  const app = createServer(store, embedder)
  const { port: actualPort } = await listenWithRetry(app, PORT, !portExplicit)

  const startedAt = Date.now()
  writeFileSync(lockPath, JSON.stringify({
    pid: process.pid,
    port: actualPort,
    watchDir: WATCH_DIR,
    startedAt,
  }, null, 2))

  registerInstance({
    pid: process.pid,
    port: actualPort,
    watchDir: WATCH_DIR,
    dataDir: DATA_DIR,
    startedAt,
  })

  console.log(`KB server listening on http://localhost:${actualPort}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  cleanup()
  process.exit(1)
})
