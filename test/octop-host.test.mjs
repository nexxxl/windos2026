import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 独立宿主（Octop）自带 /agent/* 路由，会先于 index.js 匹配。
// 这组用例钉住两件事：遮蔽路由也必须做同源检查；非回环绑定必须显式放行。
const root = fileURLToPath(new URL('../', import.meta.url))
const hostEntry = path.join(root, 'src/host/octop', 'server.mjs')

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

function request(port, method, pathname, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

function hostEnv(overrides) {
  const env = { ...process.env, ...overrides }
  delete env.NEXLOS_ALLOW_LAN
  return env
}

async function startHost(overrides) {
  const child = spawn(process.execPath, [hostEntry], {
    cwd: root,
    env: hostEnv(overrides),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const collect = (chunk) => {
    output += String(chunk)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`宿主未在 15s 内就绪：${output}`)), 15000)
    const poll = setInterval(() => {
      if (output.includes('NexlOS 桌面')) {
        clearInterval(poll)
        clearTimeout(timer)
        resolve()
      }
    }, 50)
    child.once('exit', (code) => {
      clearInterval(poll)
      clearTimeout(timer)
      reject(new Error(`宿主提前退出 code=${code}：${output}`))
    })
  })
  return { child, output: () => output }
}

test('Octop host rejects cross-origin requests on its own /agent routes', { timeout: 30000 }, async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'nexlos-octop-origin-'))
  const port = await freePort()
  const host = await startHost({ NEXLOS_HOME: home, NEXLOS_PORT: String(port), NEXLOS_BIND: '127.0.0.1' })
  t.after(() => {
    host.child.kill('SIGKILL')
    return fs.rm(home, { recursive: true, force: true })
  })

  const crossSite = {
    origin: 'http://evil.example',
    'sec-fetch-site': 'cross-site',
    'content-type': 'text/plain',
  }
  for (const [method, route] of [['POST', '/agent/chat'], ['GET', '/agent/status'], ['POST', '/agent/stop']]) {
    const res = await request(port, method, route, crossSite, method === 'POST' ? '{"text":"probe"}' : undefined)
    assert.equal(res.status, 403, `${method} ${route} 应拒绝跨站来源`)
  }

  // 同源请求仍然要走到 handler：/agent/status 不依赖 Octop 进程，能给出 JSON。
  const sameOrigin = await request(port, 'GET', '/agent/status')
  assert.equal(sameOrigin.status, 200)
  assert.match(sameOrigin.body, /"provider":"octop"/)
})

test('Octop host refuses a non-loopback bind without NEXLOS_ALLOW_LAN', { timeout: 20000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'nexlos-octop-bind-'))
  const port = await freePort()
  const child = spawn(process.execPath, [hostEntry], {
    cwd: root,
    env: hostEnv({ NEXLOS_HOME: home, NEXLOS_PORT: String(port), NEXLOS_BIND: '0.0.0.0' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    output += String(chunk)
  })
  const code = await new Promise((resolve, reject) => {
    child.once('exit', resolve)
    child.once('error', reject)
  })
  await fs.rm(home, { recursive: true, force: true })
  assert.equal(code, 1)
  assert.match(output, /拒绝启动/)
  assert.match(output, /NEXLOS_ALLOW_LAN=1/)
})
