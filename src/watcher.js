import chokidar from 'chokidar'
import { readFileSync, statSync, openSync, readSync, closeSync } from 'fs'
import { relative, resolve, basename } from 'path'
import { chunkText } from './chunker.js'
import { informationDensity } from './density.js'
import { DEFAULT_TEXT_EXTENSIONS, DEFAULT_IGNORE } from './config.js'

const PROBE_BYTES = 8192
const utf8DecoderFatal = new TextDecoder('utf-8', { fatal: true })

function fileExt(filePath) {
  const name = basename(filePath).toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot)
}

export function probeIsUtf8(filePath) {
  let fd
  try {
    fd = openSync(filePath, 'r')
    const buf = Buffer.alloc(PROBE_BYTES)
    const bytes = readSync(fd, buf, 0, PROBE_BYTES, 0)
    if (bytes === 0) return true
    const slice = buf.subarray(0, bytes)
    if (slice.includes(0)) return false
    try {
      utf8DecoderFatal.decode(slice)
      return true
    } catch {
      return false
    }
  } catch {
    return false
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd) } catch {}
    }
  }
}

export function makeFilter(options = {}) {
  const extensions = options.extensions instanceof Set
    ? options.extensions
    : new Set(options.extensions || DEFAULT_TEXT_EXTENSIONS)
  const probeExtensionless = options.probeExtensionless !== false
  return function shouldIndex(filePath) {
    const ext = fileExt(filePath)
    if (ext) return extensions.has(ext)
    return probeExtensionless ? probeIsUtf8(filePath) : false
  }
}

export async function processFile(filePath, store, embedder, options = {}) {
  const filter = options.filter || makeFilter(options)
  if (!filter(filePath)) return

  let text
  try {
    text = readFileSync(filePath, 'utf8')
  } catch {
    return
  }

  if (!text.trim()) return

  const stat = statSync(filePath)
  const relPath = relative(process.cwd(), filePath)

  const storedMtime = store.getFileMtime(relPath)
  if (storedMtime && storedMtime === stat.mtime.toISOString()) {
    return
  }

  console.log(`Processing: ${relPath}`)

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

export function startWatcher(dir, store, embedder, options = {}) {
  const filter = makeFilter(options)
  const procOpts = { ...options, filter }
  const ignore = options.ignore || DEFAULT_IGNORE

  const watcher = chokidar.watch(dir, {
    ignored: ignore,
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
        await processFile(filePath, store, embedder, procOpts)
      } catch (err) {
        console.error(`Error processing ${filePath}:`, err.message)
      }
    }

    processing = false
  }

  function enqueue(filePath) {
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
    .on('ready', () => {
      const watched = watcher.getWatched()
      const present = new Set()
      for (const [d, names] of Object.entries(watched)) {
        for (const name of names) {
          const abs = resolve(d, name)
          present.add(relative(process.cwd(), abs))
        }
      }
      for (const indexed of store.listIndexedFiles()) {
        if (!present.has(indexed)) {
          console.log(`Removed (stale): ${indexed}`)
          try {
            store.removeFile(indexed)
          } catch (err) {
            console.error(`Error removing ${indexed}: ${err.message}`)
          }
        }
      }
    })

  console.log(`Watching ${dir} for changes...`)
  return watcher
}
