import express from 'express'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createServer(store, embedder) {
  const app = express()

  app.use(express.json())
  app.use(express.static(resolve(__dirname, '..', 'public')))

  // Vector search
  app.post('/api/search/vector', async (req, res) => {
    const { query, k = 10 } = req.body

    if (!query) {
      return res.status(400).json({ error: 'query is required' })
    }

    try {
      const vec = await embedder.embed(query)
      const results = store.vectorSearch(vec, k)
      res.json({ results })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // Fuzzy text search
  app.get('/api/search/fuzzy', (req, res) => {
    const { q, limit = 20, threshold = 0.4 } = req.query

    if (!q) {
      return res.status(400).json({ error: 'q query parameter is required' })
    }

    const results = store.fuzzySearch(q, {
      limit: parseInt(limit, 10),
      threshold: parseFloat(threshold),
    })
    res.json({ results })
  })

  // Stats
  app.get('/api/stats', (req, res) => {
    res.json(store.getStats())
  })

  // All metadata
  app.get('/api/documents', (req, res) => {
    res.json(store.getAllMetadata())
  })

  return app
}
