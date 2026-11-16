/**
 * Headless CDP verification for generated apps.
 * A one-shot local origin serves the HTML, a temporary Chromium checks console
 * errors and key interactions, then both are torn down. Verification failures
 * carry errors/DOM facts for the repair pass in index.js.
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function candidates() {
  const out = []
  if (process.env.NEXLOS_BROWSER_PATH) out.push(process.env.NEXLOS_BROWSER_PATH)
  if (process.platform === 'darwin') {
    for (const base of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      out.push(path.join(base, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'))
      out.push(path.join(base, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'))
      out.push(path.join(base, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
      out.push(path.join(base, 'Brave Browser.app', 'Contents', 'MacOS', 'Brave Browser'))
    }
    const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
    try {
      for (const version of readdirSync(cache)) {
        out.push(path.join(cache, version, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
        out.push(path.join(cache, version, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
      }
    } catch (_error) { /* no cache */ }
  } else if (process.platform === 'win32') {
    for (const root of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
      out.push(path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
      out.push(path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
      out.push(path.join(root, 'Chromium', 'Application', 'chrome.exe'))
    }
  } else {
    for (const dir of String(process.env.PATH || '').split(':').filter(Boolean)) {
      for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) out.push(path.join(dir, name))
    }
  }
  return [...new Set(out)]
}

async function findBrowser() {
  for (const file of candidates()) {
    try {
      const stat = await fsp.stat(file)
      if (stat.isFile()) return file
    } catch (_error) { /* next */ }
  }
  return ''
}

class Cdp {
  static async connect(url) {
    if (typeof WebSocket !== 'function') throw new Error('no WebSocket runtime')
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connect timeout')), 8000)
      socket.onopen = () => { clearTimeout(timer); resolve() }
      socket.onerror = () => { clearTimeout(timer); reject(new Error('CDP connect failed')) }
    })
    return new Cdp(socket)
  }
  constructor(socket) {
    this.socket = socket
    this.id = 0
    this.pending = new Map()
    this.listeners = new Map()
    socket.onmessage = event => {
      let msg
      try { msg = JSON.parse(String(event.data)) } catch (_error) { return }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        clearTimeout(p.timer)
        msg.error ? p.reject(new Error(msg.error.message || 'CDP error')) : p.resolve(msg.result)
      } else if (msg.method) {
        const handlers = this.listeners.get(msg.method)
        if (handlers) for (const fn of [...handlers]) fn(msg.params)
      }
    }
    socket.onclose = () => {
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('CDP closed')) }
      this.pending.clear()
    }
  }
  send(method, params = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set())
    this.listeners.get(method).add(fn)
    return () => this.listeners.get(method)?.delete(fn)
  }
  close() { try { this.socket.close() } catch (_error) { /* ignore */ } }
}

async function launchBrowser(executable) {
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'nx-app-verify-'))
  const args = [
    '--headless=new', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-extensions', '--mute-audio',
    '--hide-scrollbars', '--window-size=1280,800', 'about:blank',
  ]
  const child = spawn(executable, args, { stdio: 'ignore', windowsHide: true })
  let port = 0
  for (let i = 0; i < 120; i += 1) {
    await sleep(100)
    try {
      const text = await fsp.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
      port = Number(String(text).split('\n')[0])
      if (port > 0) break
    } catch (_error) { /* booting */ }
    if (child.exitCode !== null) break
  }
  if (!port) {
    try { child.kill() } catch (_error) { /* ignore */ }
    await fsp.rm(profile, { recursive: true, force: true }).catch(() => {})
    throw new Error('Chromium verifier failed to start')
  }
  return { child, port, profile }
}

async function interactionChecks(cdp, kind) {
  const evalJs = async expression => {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'evaluate failed')
    return result.result ? result.result.value : undefined
  }
  const checks = []
  if (kind === 'pomodoro') {
    const before = await evalJs(`document.querySelector('[data-testid="time"]')?.textContent || ''`)
    const clicked = await evalJs(`(() => { const b=document.querySelector('[data-testid="toggle"]'); if(!b) return false; b.click(); return true })()`)
    await sleep(1300)
    const after = await evalJs(`document.querySelector('[data-testid="time"]')?.textContent || ''`)
    checks.push({ name: 'toggle exists', ok: clicked === true })
    checks.push({ name: 'timer changes', ok: before !== '' && after !== '' && before !== after, before, after })
    await evalJs(`document.querySelector('[data-testid="toggle"]')?.click()`).catch(() => {})
  } else if (kind === 'timer') {
    const before = await evalJs(`document.querySelector('[data-testid="timer"]')?.textContent || ''`)
    const clicked = await evalJs(`(() => { const b=document.querySelector('[data-testid="start"]'); if(!b) return false; b.click(); return true })()`)
    await sleep(900)
    const after = await evalJs(`document.querySelector('[data-testid="timer"]')?.textContent || ''`)
    checks.push({ name: 'start exists', ok: clicked === true })
    checks.push({ name: 'timer changes', ok: before !== after, before, after })
  } else if (kind === 'todo') {
    const value = await evalJs(`(() => { const i=document.querySelector('[data-testid="todo-input"]'); if(!i) return false; i.value='验证任务'; i.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-testid="todo-add"]')?.click(); return true })()`)
    await sleep(250)
    const text = await evalJs(`document.querySelector('[data-testid="todo-list"]')?.innerText || ''`)
    checks.push({ name: 'add todo', ok: value === true && text.includes('验证任务'), text: text.slice(0, 200) })
  } else if (kind === 'calculator') {
    await evalJs(`(() => { document.querySelector('[data-k="7"]')?.click(); document.querySelector('[data-k="+"]')?.click(); document.querySelector('[data-k="3"]')?.click(); document.querySelector('[data-k="="]')?.click(); return true })()`)
    await sleep(150)
    const value = await evalJs(`document.querySelector('[data-testid="calc-display"]')?.textContent || ''`)
    checks.push({ name: 'calculator 7+3', ok: value.trim() === '10', value })
  } else if (kind === 'dashboard') {
    const exists = await evalJs(`!!document.querySelector('[data-testid="dashboard"]')`)
    checks.push({ name: 'dashboard rendered', ok: exists === true })
  } else {
    // 极简界面（时钟、单按钮）正文往往不到 20 字：按“有没有渲染出内容”判断，
    // 而不是按文案长度，否则合法的应用会被验收挡掉。
    const facts = await evalJs(`(() => ({
      text: String(document.body ? document.body.innerText : '').length,
      nodes: document.body ? document.body.children.length : 0,
    }))()`)
    checks.push({ name: 'body rendered', ok: facts.text > 0 || facts.nodes > 0, text: facts.text, nodes: facts.nodes })
  }
  // 标题只是元信息：缺了就补（writer 侧保证），不拿它否掉一个能跑的应用。
  const title = await evalJs('document.title')
  checks.push({ name: 'title exists', ok: typeof title === 'string' && title.trim() !== '', title, warn: true })
  return checks
}

export async function verifyAppHtml(html, spec, options = {}) {
  const executable = await findBrowser()
  if (executable === '') return { ok: true, skipped: true, errors: [], checks: [], reason: 'no Chromium available' }
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(html)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  let browser
  let cdp
  try {
    browser = await launchBrowser(executable)
    const target = await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json())
    cdp = await Cdp.connect(target.webSocketDebuggerUrl)
    const errors = []
    cdp.on('Runtime.exceptionThrown', params => errors.push(params?.exceptionDetails?.text || 'JavaScript exception'))
    cdp.on('Log.entryAdded', params => { if (params?.entry?.level === 'error') errors.push(params.entry.text || 'console error') })
    cdp.on('Runtime.consoleAPICalled', params => { if (params?.type === 'error') errors.push(params.args?.map(a => a.value || a.description).filter(Boolean).join(' ') || 'console.error') })
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    cdp.send('Log.enable').catch(() => {})
    const loaded = new Promise(resolve => {
      const off = cdp.on('Page.loadEventFired', () => { off(); resolve(true) })
      setTimeout(() => { off(); resolve(false) }, 1500)
    })
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/app` })
    await loaded
    await sleep(450)
    const checks = await interactionChecks(cdp, spec && spec.kind)
    const realErrors = [...new Set(errors)].filter(text => !/favicon|net::ERR_/iu.test(text))
    const ok = realErrors.length === 0 && checks.filter(check => !check.warn).every(check => check.ok)
    return { ok, errors: realErrors.slice(0, 12), checks, url: `http://127.0.0.1:${port}/app` }
  } catch (error) {
    return { ok: false, errors: [error && error.message ? error.message : String(error)], checks: [] }
  } finally {
    if (cdp) cdp.close()
    if (browser) {
      try { browser.child.kill() } catch (_error) { /* ignore */ }
      await fsp.rm(browser.profile, { recursive: true, force: true }).catch(() => {})
    }
    try { server.closeAllConnections?.() } catch (_error) { /* older Node */ }
    await Promise.race([
      new Promise(resolve => server.close(resolve)),
      sleep(500),
    ])
  }
}
