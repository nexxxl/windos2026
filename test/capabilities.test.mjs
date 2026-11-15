import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 与 host.test.mjs 同一套加载方式：可以指向解包后的 npm 产物，
// 这样「源码通过」和「发布物通过」是同一份断言。
const packageRoot = process.env.NEXLOS_TEST_PACKAGE
  ? path.resolve(process.env.NEXLOS_TEST_PACKAGE)
  : fileURLToPath(new URL('../', import.meta.url))
const { apply } = await import(pathToFileURL(path.join(packageRoot, 'index.js')).href)

// 起一个只注册路由的宿主；services 决定「这个宿主提供了什么能力」。
async function startHost(t, provided) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nexlos-capability-test-'))
  const home = path.join(temporary, 'workspace')
  const routes = []
  const services = {
    ...provided,
    // apply() 只通过 webServer.register 拿路由，没有它就直接返回。
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const at = routes.indexOf(route)
          if (at >= 0) routes.splice(at, 1)
        }
      }
    }
  }
  const effects = []
  const context = {
    get: (key) => services[key],
    // apply() 把路由注册包在 ctx.effect 里：回调必须真的执行，否则一条路由都没有。
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') effects.push(dispose)
    },
    inject() {},
    logger: { warn() {} }
  }
  apply(context, { home })
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const route =
      routes.find((item) => item.kind === 'exact' && pathname === item.path) ||
      routes.find((item) => item.kind === 'prefix' && (pathname === item.path || pathname.startsWith(item.path + '/')))
    if (route) return route.handler(req, res)
    res.writeHead(404)
    res.end('route not found')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await fs.rm(temporary, { recursive: true, force: true })
  })
  async function request(route, { fields, method } = {}) {
    const response = await fetch(base + route, {
      method: method || (fields ? 'POST' : 'GET'),
      headers: fields ? { 'content-type': 'application/json' } : undefined,
      ...(fields ? { body: JSON.stringify(fields) } : {}),
      signal: AbortSignal.timeout(5000)
    })
    const text = await response.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { status: response.status, body }
  }
  return { request, home, routes }
}

test('capabilities are declared once and unsupported commands say so', { timeout: 20000 }, async (t) => {
  // 一个「什么都没提供」的宿主：只有 webServer。
  const services = { webServer: null }
  const { request } = await startHost(t, services)

  await t.test('capability.list is the single source and covers the placeholders', async () => {
    const res = await request('/c/capability.list')
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.append))
    const byCommand = new Map(res.body.append.map((entry) => [entry.command, entry]))
    for (const command of ['task.list', 'companion.list', 'companion.get', 'clip.set', 'agent.byok']) {
      assert.ok(byCommand.has(command), `能力表缺少 ${command}`)
    }
    assert.equal(byCommand.get('task.list').status, 'unavailable')
    assert.ok(byCommand.get('task.list').reason.length > 0)
    assert.equal(byCommand.get('clip.set').status, 'degraded')
    assert.equal(res.body.detail.count, res.body.append.length)
    // 每条都必须带状态与理由，空理由等于没解释。
    for (const entry of res.body.append) {
      assert.ok(['implemented', 'degraded', 'unavailable'].includes(entry.status), entry.command)
      assert.equal(typeof entry.reason, 'string')
      if (entry.status !== 'implemented') assert.ok(entry.reason.length > 0, `${entry.command} 缺理由`)
    }
  })

  await t.test('task.list returns UNSUPPORTED_CAPABILITY instead of a fake empty list', async () => {
    const res = await request('/c/task.list')
    // 501 而不是 200：调用方必须能分辨「没有数据」与「不支持」。
    assert.equal(res.status, 501)
    assert.equal(res.body.ok, false)
    assert.equal(res.body.code, 'UNSUPPORTED_CAPABILITY')
    assert.equal(res.body.capability, 'task.list')
    assert.ok(res.body.error.includes('UNSUPPORTED_CAPABILITY'))
    assert.equal(res.body.append, undefined)
  })

  await t.test('companion.list is unsupported while companion.get stays loadable', async () => {
    const list = await request('/c/companion.list')
    assert.equal(list.status, 501)
    assert.equal(list.body.capability, 'companion.list')

    const get = await request('/c/companion.get')
    assert.equal(get.status, 200)
    assert.equal(get.body.detail.manifest, null)
    assert.equal(get.body.detail.unsupported, true)
    assert.ok(get.body.detail.reason.length > 0)
  })

  await t.test('agent status never claims ready without a model runtime', async () => {
    const res = await request('/agent/status')
    assert.equal(res.status, 200)
    assert.equal(res.body.available, false)
    assert.equal(res.body.ready, false)
    assert.equal(res.body.reason, 'model-service-missing')
    assert.equal(res.body.readyState, 'unavailable')
    // 不再编造 deepseek/dsh 这样的默认值。
    assert.equal(res.body.provider, '')
    assert.equal(res.body.model, '')
  })

  await t.test('run/current and byok are marked unsupported', async () => {
    const running = await request('/agent/run/current')
    assert.equal(running.status, 200)
    assert.equal(running.body.running, false)
    assert.equal(running.body.unsupported, true)
    assert.ok(running.body.reason.length > 0)

    const byok = await request('/agent/byok')
    assert.equal(byok.status, 200)
    assert.equal(byok.body.active, false)
    assert.equal(byok.body.unsupported, true)
    assert.ok(byok.body.reason.length > 0)
  })
})

test('agent status reports ready only when the host can really run a model', { timeout: 20000 }, async (t) => {
  const services = {
    webServer: null,
    llm: {
      stream() {
        return (async function* empty() {})()
      }
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }) }
  }
  const { request } = await startHost(t, services)

  await t.test('ready with provider and model resolved from the host', async () => {
    const res = await request('/agent/status')
    assert.equal(res.body.available, true)
    assert.equal(res.body.ready, true)
    assert.equal(res.body.readyState, 'ready')
    assert.equal(res.body.reason, '')
    assert.equal(res.body.provider, 'deepseek')
    assert.equal(res.body.model, 'deepseek-chat')
  })

  await t.test('runtime without a selection is unknown, not a false "not ready"', async () => {
    // 运行时在，但没有选择服务、也没有模型目录可读 → 只能说不知道。
    // 把它报成「未就绪」等于断言一个我们没验证过的事实。
    const host = await startHost(t, {
      webos: null,
      webServer: null,
      llm: {
        stream() {
          return (async function* empty() {})()
        }
      }
    })
    const res = await host.request('/agent/status')
    assert.equal(res.body.available, true)
    assert.equal(res.body.ready, false)
    assert.equal(res.body.readyState, 'unknown')
    assert.equal(res.body.reason, 'model-catalog-unavailable')
  })

  await t.test('empty model catalog is degraded with a reason', async () => {
    // 目录读得到但没有默认模型：这是确定的「没选模型」，不是未知。
    const host = await startHost(t, {
      webServer: null,
      sessionController: { modelCatalog: async () => ({ default: null }) }
    })
    const res = await host.request('/agent/status')
    assert.equal(res.body.available, true)
    assert.equal(res.body.ready, false)
    assert.equal(res.body.readyState, 'degraded')
    assert.equal(res.body.reason, 'model-selection-unresolved')
  })
})
