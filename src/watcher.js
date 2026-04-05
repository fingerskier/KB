import chokidar from 'chokidar'
import { readFileSync, statSync } from 'fs'
import { relative, resolve } from 'path'
import { chunkText } from './chunker.js'
import { informationDensity } from './density.js'

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go',
  '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.css', '.html', '.xml',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.sh',
  '.bash', '.zsh', '.fish', '.sql', '.csv', '.log', '.env', '.gitignore',
  '.dockerfile', '.makefile', '.cmake', '.gradle', '.properties',
])

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/data/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/*.lock',
  '**/package-lock.json',
]

function isTextFile(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return TEXT_EXTENSIONS.has(ext) || ext === ''
}

async function processFile(filePath, store, embedder) {
  if (!isTextFile(filePath)) return

  let text
  try {
    text = readFileSync(filePath, 'utf8')
  } catch {
    return
  }

  if (!text.trim()) return

  const stat = statSync(filePath)
  const relPath = relative(process.cwd(), filePath)

  console.log(`Processing: ${relPath}`)

  // Remove old entries for this file
  store.removeFile(relPath)

  const chunks = chunkText(text)
  const densities = chunks.map(c => informationDensity(c))
  const vectors = []

  for (const chunk of chunks) {
    const vec = await embedder.embed(chunk)
    vectors.push(vec)
  }

  store.addChunks(relPath, chunks, vectors, densities, stat.mtime)
  console.log(`  Indexed ${chunks.length} chunks (avg density: ${(densities.reduce((a, b) => a + b, 0) / densities.length).toFixed(3)})`)
}

export function startWatcher(dir, store, embedder) {
  const watcher = chokidar.watch(dir, {
    ignored: IGNORE_PATTERNS,
    persistent: true,
    ignoreInitial: false,
  })

  const queue = []
  let processing = false

  async function processQueue() {
    if (processing) return
    processing = true

    while (queue.length > 0) {
      const { filePath } = queue.shift()
      try {
        await processFile(filePath, store, embedder)
      } catch (err) {
        console.error(`Error processing ${filePath}:`, err.message)
      }
    }

    processing = false
  }

  function enqueue(filePath) {
    // Deduplicate
    if (!queue.some(q => q.filePath === filePath)) {
      queue.push({ filePath: resolve(filePath) })
    }
    processQueue()
  }

  watcher
    .on('add', enqueue)
    .on('change', enqueue)
    .on('unlink', filePath => {
      const relPath = relative(process.cwd(), resolve(filePath))
      console.log(`Removed: ${relPath}`)
      try {
        store.removeFile(relPath)
      } catch (err) {
        console.error(`Error removing ${relPath}: ${err.message}`)
      }
    })

  console.log(`Watching ${dir} for changes...`)
  return watcher
}
