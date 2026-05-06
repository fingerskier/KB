import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import crypto from 'crypto'

function safeSlug(input) {
  return String(input || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown'
}

export function createActivityLogger({ watchDir, dataDir, pid = process.pid }) {
  const baseDir = join(homedir(), '.underrow', 'logs')
  mkdirSync(baseDir, { recursive: true })

  const hash = crypto.createHash('sha1').update(`${watchDir}\n${dataDir}`).digest('hex').slice(0, 10)
  const fileName = `${safeSlug(watchDir)}__${hash}.log`
  const filePath = join(baseDir, fileName)

  function write(level, event, details = {}) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      pid,
      watchDir,
      dataDir,
      ...details,
    }
    appendFileSync(filePath, `${JSON.stringify(entry)}\n`)
  }

  return {
    filePath,
    lifecycle(event, details = {}) { write('info', event, details) },
    errata(event, error, details = {}) {
      const err = error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) }
      write('error', event, { ...details, error: err })
    },
  }
}
