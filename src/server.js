import express from 'express'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createServer(store, embedder) {
  const app = express()

  app.use(express.json())
  app.use(express.static(resolve(__dirname, '..', 'public')))

  // Help
  app.get('/help', (req, res) => {
    res.type('text/plain').send(`Underrow - KnowledgeBase Driver

Underrow watches a directory for file changes, chunks the content,
computes vector embeddings and information density, and makes
everything searchable via a web dashboard and REST API.

Routes
------

GET  /              Web dashboard with search UI and live stats
GET  /help          This help text
GET  /openapi.json  OpenAPI 3.0 spec for the API

GET  /api/stats
  Returns indexing statistics: file count, chunk count, average density.

GET  /api/documents
  Returns metadata for every indexed chunk.

POST /api/search/vector
  Body: { "query": "...", "k": 10 }
  Embeds the query and returns the top-k chunks by cosine similarity.

GET  /api/search/fuzzy?q=...&limit=20&threshold=0.4
  Fuzzy text search across all indexed chunks.

Environment / CLI
-----------------
  underrow [dir]           Directory to watch (default: cwd)
  --port, -p <number>      Server port (default: 3737, env: KB_PORT)
  --data, -d <path>        Data storage dir (default: ./data, env: KB_DATA_DIR)
  --ext <.a,.b>            Opt-in extensions (extends defaults; repeatable)
  --no-probe               Disable UTF-8 probe for extensionless files

  .kbrc.json in watched dir may set: extensions, ignore, probeExtensionless
`)
  })

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

  // OpenAPI spec
  app.get('/openapi.json', (req, res) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'Underrow',
        version: '2026.5.1',
        description: 'KnowledgeBase driver - file watcher with vector and fuzzy search',
      },
      paths: {
        '/api/search/vector': {
          post: {
            summary: 'Vector similarity search',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['query'],
                    properties: {
                      query: { type: 'string', description: 'Search text to embed and match against indexed chunks' },
                      k: { type: 'integer', default: 10, description: 'Number of results to return' },
                    },
                  },
                },
              },
            },
            responses: {
              200: {
                description: 'Search results ranked by cosine similarity',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchResults' } } },
              },
              400: { description: 'Missing query' },
            },
          },
        },
        '/api/search/fuzzy': {
          get: {
            summary: 'Fuzzy text search',
            parameters: [
              { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Search query' },
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Max results' },
              { name: 'threshold', in: 'query', schema: { type: 'number', default: 0.4 }, description: 'Fuse.js match threshold (0 = exact, 1 = anything)' },
            ],
            responses: {
              200: {
                description: 'Fuzzy-matched results',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchResults' } } },
              },
              400: { description: 'Missing q parameter' },
            },
          },
        },
        '/api/stats': {
          get: {
            summary: 'Index statistics',
            responses: {
              200: {
                description: 'Current indexing stats',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        files: { type: 'integer' },
                        chunks: { type: 'integer' },
                        avgDensity: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/api/documents': {
          get: {
            summary: 'All indexed document metadata',
            responses: {
              200: {
                description: 'Array of chunk metadata',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/ChunkMeta' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          ChunkMeta: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              filePath: { type: 'string' },
              chunkIndex: { type: 'integer' },
              text: { type: 'string' },
              density: { type: 'number' },
              mtime: { type: 'number' },
            },
          },
          SearchResults: {
            type: 'object',
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    score: { type: 'number' },
                    filePath: { type: 'string' },
                    chunkIndex: { type: 'integer' },
                    text: { type: 'string' },
                    density: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    })
  })

  return app
}
