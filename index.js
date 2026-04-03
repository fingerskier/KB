import { resolve } from 'path'
import { startWatcher } from './src/watcher.js'
import { createServer } from './src/server.js'
import { Store } from './src/store.js'
import { initEmbedder } from './src/embedder.js'

const WATCH_DIR = process.env.KB_WATCH_DIR || process.cwd()
const PORT = parseInt(process.env.KB_PORT || '3737', 10)
const DATA_DIR = resolve(process.env.KB_DATA_DIR || './data')

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
