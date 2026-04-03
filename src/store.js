import faiss from 'faiss-node'
const { IndexFlatIP } = faiss
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import Fuse from 'fuse.js'

export class Store {
  constructor(dataDir, dimensions) {
    this.dataDir = dataDir
    this.dimensions = dimensions
    this.indexPath = join(dataDir, 'faiss.index')
    this.metaPath = join(dataDir, 'metadata.json')

    mkdirSync(dataDir, { recursive: true })

    this.metadata = [] // array of { id, filePath, chunkIndex, text, density, mtime }
    this.index = new IndexFlatIP(dimensions) // inner product (cosine sim on normalized vecs)

    this._load()
  }

  _load() {
    if (existsSync(this.metaPath)) {
      try {
        this.metadata = JSON.parse(readFileSync(this.metaPath, 'utf8'))
      } catch {
        this.metadata = []
      }
    }
    if (existsSync(this.indexPath) && this.metadata.length > 0) {
      try {
        this.index = IndexFlatIP.read(this.indexPath)
      } catch {
        this.index = new IndexFlatIP(this.dimensions)
      }
    }
  }

  save() {
    writeFileSync(this.metaPath, JSON.stringify(this.metadata, null, 2))
    if (this.metadata.length > 0) {
      this.index.write(this.indexPath)
    }
  }

  removeFile(filePath) {
    const remaining = []
    const removeIds = new Set()

    for (let i = 0; i < this.metadata.length; i++) {
      if (this.metadata[i].filePath === filePath) {
        removeIds.add(i)
      } else {
        remaining.push(this.metadata[i])
      }
    }

    if (removeIds.size === 0) return

    // Rebuild index without removed entries
    const newIndex = new IndexFlatIP(this.dimensions)
    // We need to re-add all vectors except removed ones
    // Unfortunately faiss-node doesn't support removal, so we reconstruct
    for (let i = 0; i < this.metadata.length; i++) {
      if (!removeIds.has(i)) {
        const vec = this.index.reconstruct(i)
        newIndex.add(vec)
      }
    }

    this.metadata = remaining
    this.index = newIndex
    this.save()
  }

  addChunks(filePath, chunks, vectors, densities, mtime) {
    for (let i = 0; i < chunks.length; i++) {
      this.metadata.push({
        id: this.metadata.length,
        filePath,
        chunkIndex: i,
        text: chunks[i],
        density: densities[i],
        mtime: mtime.toISOString(),
      })
      this.index.add(vectors[i])
    }
    this.save()
  }

  vectorSearch(queryVector, k = 10) {
    if (this.metadata.length === 0) return []
    const clampedK = Math.min(k, this.metadata.length)
    const result = this.index.search(queryVector, clampedK)

    return result.labels.map((idx, i) => ({
      ...this.metadata[idx],
      score: result.distances[i],
    }))
  }

  fuzzySearch(query, options = {}) {
    const fuse = new Fuse(this.metadata, {
      keys: ['text', 'filePath'],
      includeScore: true,
      threshold: options.threshold ?? 0.4,
    })

    const results = fuse.search(query, { limit: options.limit ?? 20 })
    return results.map(r => ({
      ...r.item,
      score: 1 - r.score, // invert so higher = better
    }))
  }

  getStats() {
    const files = new Set(this.metadata.map(m => m.filePath))
    return {
      totalChunks: this.metadata.length,
      totalFiles: files.size,
      files: [...files],
      avgDensity: this.metadata.length > 0
        ? this.metadata.reduce((sum, m) => sum + m.density, 0) / this.metadata.length
        : 0,
    }
  }

  getAllMetadata() {
    return this.metadata
  }
}
