/**
 * NexlOS standalone host —— 把同一个 index.js 挂到独立 HTTP 服务上，供 Octop 使用。
 *
 * DSH 里 index.js 由 Cordis 运行时装载；Octop 没有 Cordis。这里用一个最小 ctx shim
 * 提供 index.js 实际用到的键（get / logger / effect / inject），缺的服务返回 undefined，
 * index.js 里的守卫会把这些能力降级成 501，而不是崩溃。
 *
 * 与 DSH 版共用同一份 `src/webos/` 和同一个 `index.js`：发版即对齐，不存在第二份快照。
 *
 * 只监听回环地址：`/c/fs.*` 没有二次鉴权，绑定公网等于把工作区交给局域网。
 */
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as bridge from './octop-bridge.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// 仓库根：宿主就在插件包里面，APP_ROOT 即插件根。
const APP_ROOT = path.join(HERE, '..', '..', '..')
const WEBOS_INDEX = path.join(APP_ROOT, 'src', 'webos', 'index.html')

/** 默认 home：优先 NexlOS 原生目录，与 DSH 版共用同一批应用与文稿。 */
export function defaultHome() {
  const fromEnv = (process.env.NEXLOS_HOME || '').trim()
  if (fromEnv !== '') return path.resolve(fromEnv)
  return path.join(os.homedir(), 'Library', 'Application Support', 'NexlOS')
}

const HOME = defaultHome()
const PORT = Number(process.env.NEXLOS_PORT || 8090)
const BIND = process.env.NEXLOS_BIND || '127.0.0.1'

/** web.register 收集到的路由表。 */
const routes = []

/** 最小 ctx shim：只实现 index.js 实际用到的 get / logger / effect / inject。 */
const ctx = {
  get(name) {
    if (name === 'webServer') {
      return {
        register({ kind, path: routePath, handler }) {
          routes.push({ kind, path: routePath, handler })
          return () => {}
        },
      }
    }
    if (name === 'workingDirectory') return { defaultDirectory: HOME }
    // sessionController / llm / subprocess / connection 等一律缺省，
    // 让 index.js 里的守卫走 501 分支并带上原因。
    return undefined
  },
  logger: {
    info: (...a) => console.log('[nexlos]', ...a),
    warn: (...a) => console.warn('[nexlos]', ...a),
    error: (...a) => console.error('[nexlos]', ...a),
  },
  // Cordis 的 scoped inject：独立宿主没有 tools / browser 服务，
  // 给一个同形的 scope 让插件自己的 try/catch 决定降级。
  inject(_names, callback) {
    const scope = { get: (n) => ctx.get(n), effect: ctx.effect, logger: ctx.logger }
    try {
      callback(scope)
    } catch (error) {
      ctx.logger.warn('scoped inject skipped:', String(error))
    }
  },
  effect(fn) {
    const dispose = fn()
    return () => {
      try {
        if (typeof dispose === 'function') dispose()
      } catch {
        /* 释放失败不影响退出 */
      }
    }
  },
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
}

/* 与 index.js 的 sameOrigin 同形（index.js:1023）。src/host 不进 npm 包，
 * 没法共享同一份实现；宿主自有的 /agent/* 路由不经过 index.js 的路由表，
 * 不在这里自查，浏览器里任意网页就能用免预检的 no-cors POST 驱动本机 agent。 */
function sameOrigin(req) {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.origin
  const host = req.headers.host
  if (typeof origin === 'string' && typeof host === 'string') {
    try {
      if (new URL(origin).host !== host) return false
    } catch (_error) {
      return false
    }
  }
  return true
}

async function dispatch(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const pathname = url.pathname

  // 宿主自己的 /agent/* 先于内核路由匹配，把 index.js 里带 sameOrigin 的同名路由遮蔽了。
  if (pathname.startsWith('/agent/') && !sameOrigin(req)) {
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
    return res.end(JSON.stringify({ ok: false, error: 'cross-origin request rejected' }))
  }

  // 命令栏：直接走 Octop 自己的 agent 引擎（模型由 Octop 配置决定，与 DSH 无关）
  if (pathname === '/agent/status') {
    const info = await bridge.agentInfo()
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    return res.end(
      JSON.stringify({
        ok: true,
        available: Boolean(info.agentId),
        ready: Boolean(info.agentId),
        provider: 'octop',
        model: info.model || null,
        agent: info.agentId || null,
        workspace: HOME,
        last_error: info.agentId ? '' : 'Octop 未就绪：检查服务与 ~/.octop/credential.txt',
        byok: null,
        byokActive: false,
      }),
    )
  }

  if (pathname === '/agent/chat' || pathname === '/agent/send') {
    const MAX_BODY = 1024 * 1024
    let body = ''
    let tooLarge = false
    for await (const chunk of req) {
      if (tooLarge) continue
      if (body.length + chunk.length > MAX_BODY) {
        tooLarge = true
        body = ''
        continue
      }
      body += chunk
    }
    if (tooLarge) {
      res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' })
      return res.end(JSON.stringify({ ok: false, error: 'message too large (limit 1MB)' }))
    }
    let payload = {}
    try {
      payload = JSON.parse(body || '{}')
    } catch {
      /* 空 body 交给下游报错 */
    }
    const text = String(payload.text || payload.message || '').trim()
    if (!text) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      return res.end(JSON.stringify({ ok: false, error: 'empty message' }))
    }
    res.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    })
    return bridge.chat({ sessionId: String(payload.sessionId || 'default'), text, res })
  }

  if (pathname === '/agent/stop') {
    let body = ''
    for await (const chunk of req) body += chunk
    let payload = {}
    try {
      payload = JSON.parse(body || '{}')
    } catch {
      /* 忽略 */
    }
    const stopped = bridge.stop(String(payload.sessionId || 'default'))
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    return res.end(JSON.stringify({ ok: true, stopped }))
  }

  if (pathname === '/agent/run/current') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    return res.end(JSON.stringify({ running: false, taskId: '' }))
  }

  // 先匹配内核路由；/agent/status 这类无扩展名路径不能再被 SPA 兜底吃掉
  const candidates = routes
    .filter((r) => (r.kind === 'exact' ? pathname === r.path : pathname.startsWith(r.path)))
    .sort((a, b) => b.path.length - a.path.length)

  for (const route of candidates) {
    try {
      return await route.handler(req, res, url)
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        return res.end(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }))
      }
      return undefined
    }
  }

  // 桌面壳：根路径和任何无扩展名路径都交给 index.html，由前端路由接管
  if (pathname === '/' || pathname === '/index.html' || !path.extname(pathname)) {
    try {
      const html = await readFile(WEBOS_INDEX)
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' })
      return res.end(html)
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('NexlOS webos/index.html 缺失：' + error.message)
    }
  }

  // 兜底：/favicon 之类的静态文件按插件根解析
  const safe = path.normalize(path.join(APP_ROOT, pathname))
  const relative = path.relative(APP_ROOT, safe)
  const inRoot = relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  if (inRoot) {
    try {
      const info = await stat(safe)
      if (info.isFile()) {
        const body = await readFile(safe)
        res.writeHead(200, { 'content-type': MIME[path.extname(safe).toLowerCase()] || 'application/octet-stream' })
        return res.end(body)
      }
    } catch {
      /* 落到 404 */
    }
  }

  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ ok: false, error: 'not found', path: pathname }))
}

/** 只有显式回环地址算安全默认；其余绑定会把无鉴权的 /c/fs.* 交给局域网。 */
const LOOPBACK_BINDS = new Set(['127.0.0.1', '::1', 'localhost'])

function guardBind() {
  if (LOOPBACK_BINDS.has(BIND)) return
  if (process.env.NEXLOS_ALLOW_LAN !== '1') {
    console.error(`[nexlos] 拒绝启动：NEXLOS_BIND=${BIND} 会把无鉴权的 /c/fs.* 暴露给局域网。`)
    console.error('[nexlos] 确需局域网访问时设 NEXLOS_ALLOW_LAN=1 重试，并自行承担暴露风险。')
    process.exit(1)
  }
  console.warn(`[nexlos] 警告：NEXLOS_BIND=${BIND} 且 NEXLOS_ALLOW_LAN=1；/c/fs.* 无二次鉴权，工作区对局域网可读写。`)
}

async function main() {
  guardBind()
  // Windows 的盘符会被 import() 当成 URL 协议（ERR_UNSUPPORTED_ESM_URL_SCHEME），必须转成 file: URL
  const mod = await import(pathToFileURL(path.join(APP_ROOT, 'index.js')).href)
  if (typeof mod.apply !== 'function') throw new Error('index.js 没有导出 apply(ctx, config)')
  await mod.apply(ctx, { home: HOME })
  if (routes.length === 0) throw new Error('apply() 没有注册任何路由，Host 契约可能已变化')

  const server = http.createServer((req, res) => {
    void dispatch(req, res)
  })
  server.listen(PORT, BIND, () => {
    console.log(`[nexlos] NexlOS 桌面: http://${BIND}:${PORT}`)
    console.log(`[nexlos] home: ${HOME}`)
    console.log(`[nexlos] routes: ${routes.map((r) => r.path).join(' ')}`)
  })

  const stop = () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1500).unref()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main().catch((error) => {
  console.error('[nexlos] 启动失败:', error)
  process.exit(1)
})
