#!/usr/bin/env node

import { spawn } from 'child_process'
import { constants as osConstants } from 'os'
import { fileURLToPath } from 'url'

const args = process.argv.slice(2)
const indexPath = fileURLToPath(new URL('../index.js', import.meta.url))

function isShortLivedCli(args) {
  return args[0] === 'list' || args[0] === 'help' || args.includes('--help') || args.includes('-h')
}

const nodeArgs = isShortLivedCli(args)
  ? [indexPath, ...args]
  : ['--watch', indexPath, ...args]

const child = spawn(process.execPath, nodeArgs, { stdio: 'inherit' })

let finished = false
function finish(code) {
  if (finished) return
  finished = true
  process.exit(code)
}

child.on('error', err => {
  console.error(`failed to start dev process: ${err.message}`)
  finish(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    finish(128 + (osConstants.signals[signal] || 0))
    return
  }
  finish(code ?? 0)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal)
  })
}
