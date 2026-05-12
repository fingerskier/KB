import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const npmCommand = 'npm'

function killProcessTree(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

function runDev(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ['run', '--silent', 'dev', '--', ...args], {
      cwd: repoRoot,
      detached: process.platform !== 'win32',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })

    const timer = setTimeout(() => {
      timedOut = true
      killProcessTree(child)
    }, 5000)

    child.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`npm run dev -- ${args.join(' ')} did not exit within 5s\nstdout:\n${stdout}\nstderr:\n${stderr}`))
        return
      }
      resolve({ code, signal, stdout, stderr })
    })
  })
}

test('npm run dev -- list exits after printing instance list', async () => {
  const result = await runDev(['list'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.signal, null)
  assert.match(result.stdout, /(No running underrow instances\.|PID\s+PORT\s+URL\s+WATCH\s+UPTIME)/)
  assert.doesNotMatch(result.stdout, /Completed running/)
})

test('npm run dev -- help exits after printing CLI help', async () => {
  const result = await runDev(['help'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.signal, null)
  assert.match(result.stdout, /Usage: underrow \[dir\] \[options\]/)
  assert.match(result.stdout, /underrow list/)
  assert.doesNotMatch(result.stdout, /Completed running/)
})
