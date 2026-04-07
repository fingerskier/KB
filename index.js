#!/usr/bin/env node

import { resolve } from 'path'
import { startWatcher } from './src/watcher.js'
import { createServer } from './src/server.js'
import { Store } from './src/store.js'
import { initEmbedder } from './src/embedder.js'

const args = process.argv.slice(2)

function flag(name, fallback) {
  const i = args.indexOf(name)
  if (i === -1) return fallback
  return args.splice(i, 2)[1] || fallback
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`underrow - watch a directory, embed content, search via UI & API

Usage: underrow [dir] [options]

Arguments:
  dir              Directory to watch (default: current directory)

Options:
  --port, -p       Server port (default: 3737, env: KB_PORT)
  --data, -d       Data storage directory (default: ./data, env: KB_DATA_DIR)
  -h, --help       Show this help
`)
  process.exit(0)
}

const PORT = parseInt(flag('--port', flag('-p', process.env.KB_PORT || '3737')), 10)
const DATA_DIR = resolve(flag('--data', flag('-d', process.env.KB_DATA_DIR || './data')))
const WATCH_DIR = resolve(args[0] || process.env.KB_WATCH_DIR || process.cwd())

async function main() {
  console.log(`KB starting...`)
  console.log(`  Watch dir : ${WATCH_DIR}`)
  console.log(`  Data dir  : ${DATA_DIR}`)
  console.log(`  Port      : ${PORT}`)

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
  app.listen(PORT, () => {
    console.log(`KB server listening on http://localhost:${PORT}`)
  })
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
