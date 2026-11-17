/**
 * NexlOS native browser bridge.
 *
 * The NexlOS WebOS cannot embed sites such as GitHub in an iframe: GitHub sends
 * `X-Frame-Options: deny` and `frame-ancestors 'none'`. This module owns a real
 * Chromium process through the Chrome DevTools Protocol and streams its frames
 * into the NexlOS browser window. The same page is available to the DSH agent
 * through the Host command endpoint, so user and agent share one browser.
 *
 * No Playwright/Electron dependency: Chromium + CDP, one page, one profile.
 * Cross-platform discovery covers Chrome/Edge/Chromium on macOS, Windows and
 * Linux, plus Playwright's cached Chromium when present.
 */

import { spawn, execFile as execFileCallback } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const readabilitySource = readFileSync(new URL('./vendor/readability.js', import.meta.url), 'utf8')
const nexlL1Source = readFileSync(new URL('./vendor/nexl-l1.js', import.meta.url), 'utf8')
let jpegDecoder = null
try { jpegDecoder = require('jpeg-js') } catch (_error) { jpegDecoder = null }

const execFile = promisify(execFileCallback)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const viewport = { width: 1280, height: 800, dpr: 1 }
const FRAME_INTERVAL = 500
const FRAME_QUALITY = 86
let frameQuality = 86

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

function normalizeUrl(value) {
  const text = String(value || '').trim()
  if (text === '') throw new Error('请输入网址')
  if (text === 'about:blank') return text
  if (/^https?:\/\//iu.test(text)) {
    const parsed = new URL(text)
    if (parsed.username || parsed.password) throw new Error('网址里不能带账号密码')
    return parsed.toString()
  }
  if (/^[\w-]+(?:\.[\w-]+)+(?::\d+)?(?:[/?#].*)?$/u.test(text)) {
    return new URL('https://' + text).toString()
  }
  throw new Error('不是可打开的网址；可输入 https://… 或域名')
}

function engineLabel(executable) {
  const base = path.basename(executable).toLowerCase()
  if (base.includes('edge')) return 'Microsoft Edge'
  if (base.includes('brave')) return 'Brave'
  if (base.includes('chromium')) return 'Chromium'
  if (base.includes('chrome')) return 'Google Chrome'
  return path.basename(executable)
}

function candidatePaths() {
  const list = []
  const env = String(process.env.NEXLOS_BROWSER_PATH || process.env.DSH_BROWSER_EXECUTABLE || '').trim()
  if (env !== '') list.push(env)
  if (process.platform === 'darwin') {
    const apps = ['/Applications', path.join(os.homedir(), 'Applications')]
    const names = [
      ['Google Chrome', 'Google Chrome.app/Contents/MacOS/Google Chrome'],
      ['Google Chrome for Testing', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'],
      ['Microsoft Edge', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
      ['Brave Browser', 'Brave Browser.app/Contents/MacOS/Brave Browser'],
      ['Chromium', 'Chromium.app/Contents/MacOS/Chromium'],
    ]
    for (const dir of apps) for (const [, rel] of names) list.push(path.join(dir, rel))
  } else if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
    for (const root of roots) {
      list.push(path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
      list.push(path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
      list.push(path.join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'))
      list.push(path.join(root, 'Chromium', 'Application', 'chrome.exe'))
    }
  } else {
    const dirs = String(process.env.PATH || '').split(':').filter(Boolean)
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']
    for (const dir of dirs) for (const name of names) list.push(path.join(dir, name))
    list.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge')
  }
  // Playwright keeps Chromium under a per-OS cache. Reuse it when the user has
  // a DSH/Playwright installation but no system Chrome.
  const caches = process.platform === 'darwin'
    ? [path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')]
    : process.platform === 'win32'
      ? [path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')]
      : [path.join(os.homedir(), '.cache', 'ms-playwright')]
  for (const cache of caches) {
    let versions = []
    try { versions = readdirSync(cache) } catch (_error) { versions = [] }
    for (const version of versions) {
      if (process.platform === 'darwin') {
        list.push(path.join(cache, version, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
        list.push(path.join(cache, version, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
      } else if (process.platform === 'win32') {
        list.push(path.join(cache, version, 'chrome-win', 'chrome.exe'))
      } else {
        list.push(path.join(cache, version, 'chrome-linux', 'chrome'))
      }
    }
  }
  return [...new Set(list)]
}

async function discoverExecutable() {
  for (const candidate of candidatePaths()) {
    try {
      const stat = await fsp.stat(candidate)
      if (!stat.isFile()) continue
      try { await fsp.access(candidate, 1) } catch (_error) { continue }
      return candidate
    } catch (_error) { /* next */ }
  }
  return ''
}

class PageConnection {
  static async connect(url) {
    if (typeof WebSocket !== 'function') throw new Error('当前 Node 运行时没有 WebSocket，无法连接 Chromium CDP')
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('连接 Chromium CDP 超时')), 10000)
      socket.onopen = () => { clearTimeout(timer); resolve() }
      socket.onerror = () => { clearTimeout(timer); reject(new Error('连接 Chromium CDP 失败')) }
    })
    return new PageConnection(socket)
  }

  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    this.waiters = new Map()
    this.listeners = new Map()
    this.closed = false
    socket.onmessage = (event) => {
      let message
      try { message = JSON.parse(String(event.data)) } catch (_error) { return }
      if (message.id !== undefined && this.pending.has(message.id)) {
        const item = this.pending.get(message.id)
        this.pending.delete(message.id)
        clearTimeout(item.timer)
        if (message.error !== undefined) item.reject(new Error(message.error.message || 'CDP error'))
        else item.resolve(message.result)
        return
      }
      if (message.method) {
        const listeners = this.listeners.get(message.method)
        if (listeners !== undefined) for (const listener of [...listeners]) {
          try { listener(message.params) } catch (_error) { /* listener isolation */ }
        }
        const waiting = this.waiters.get(message.method)
        if (waiting !== undefined) {
          this.waiters.delete(message.method)
          waiting.resolve(message.params)
        }
      }
    }
    socket.onclose = () => {
      this.closed = true
      for (const item of this.pending.values()) {
        clearTimeout(item.timer)
        item.reject(new Error('Chromium 页面已关闭'))
      }
      this.pending.clear()
      for (const item of this.waiters.values()) item.resolve(undefined)
      this.waiters.clear()
      this.listeners.clear()
    }
    socket.onerror = () => { /* close follows */ }
  }

  send(method, params = {}, timeoutMs = 30000) {
    if (this.closed) return Promise.reject(new Error('Chromium 页面已关闭'))
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Chromium 操作超时：' + method))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set())
    this.listeners.get(method).add(listener)
    return () => this.listeners.get(method)?.delete(listener)
  }

  waitEvent(method, timeoutMs = 12000) {
    if (this.closed) return Promise.resolve(undefined)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(method)
        resolve(undefined)
      }, timeoutMs)
      this.waiters.set(method, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
      })
    })
  }

  close() {
    this.closed = true
    try { this.socket.close() } catch (_error) { /* ignore */ }
  }
}

export function createBrowserBridge({ home, logger, getConfig } = {}) {
  const homeDir = typeof home === 'function' ? home : () => String(home || process.cwd())
  let executableCache
  let executable = ''
  let engineVersion = ''
  let processHandle = null
  let sidecarPidFile = ''
  let humanHandoff = null
  let humanTargetId = ''
  let sweptSidecars = false
  let port = 0
  let cdp = null
  let profileDir = ''
  let profileMode = 'persistent'
  let provider = 'sidecar'
  let attachUrl = 'http://127.0.0.1:9222'
  let profileId = 'default'
  let appliedProvider = ''
  let appliedProfileId = ''
  let attachedTargetId = ''
  let primaryTargetId = ''
  let attachedCreated = false
  let attachOrigin = ''
  let starting = null
  let lastError = ''
  let lastUrl = ''
  let lastTitle = ''
  let lastFrameAt = 0
  let lastStateAt = 0
  const perf = { captures: 0, captureMs: 0, captureMax: 0, inputs: 0, inputMs: 0, inputMax: 0, frames: 0, frameBytes: 0, lastFrameAt: 0 }
  let lastInputAt = 0
  let frameTimer = null
  let burstTimers = []
  let interactionLoop = null
  let interactionUntil = 0
  let motionCheck = null
  let screencastActive = false
  let h264Proc = null
  let h264Width = 0
  let h264Height = 0
  let h264Res = null
  let targetCache = []
  let targetCacheAt = 0
  let h264FeedCount = 0
  let h264BytesOut = 0
  let screencastOff = null
  let lastScreencastAt = 0
  let capturing = false
  let shuttingDown = false
  const streamClients = new Set()
  const mjpegClients = new Set()
  let inputQueue = Promise.resolve()

  const info = (prefix, error) => {
    if (logger && typeof logger.debug === 'function' && error) logger.debug(prefix + ' ' + (error.message || error))
  }

  function browserConfig() {
    return {
      provider: appliedProvider || provider,
      configuredProvider: provider,
      attachUrl,
      attached: appliedProvider === 'attach',
    }
  }

  async function readBrowserConfig() {
    let next = null
    try {
      if (typeof getConfig === 'function') next = await getConfig()
    } catch (_error) { /* use env/default */ }
    if (!next || typeof next !== 'object') {
      next = {
        browserProvider: process.env.NEXLOS_BROWSER_PROVIDER || 'sidecar',
        browserAttachUrl: process.env.NEXLOS_BROWSER_ATTACH_URL || 'http://127.0.0.1:9222',
      }
    }
    provider = next.browserProvider === 'attach' ? 'attach' : 'sidecar'
    const raw = typeof next.browserAttachUrl === 'string' ? next.browserAttachUrl.trim() : ''
    attachUrl = raw === '' ? 'http://127.0.0.1:9222' : raw
    profileId = typeof next.browserProfile === 'string' && /^[a-z0-9_-]{1,32}$/u.test(next.browserProfile)
      ? next.browserProfile
      : 'default'
    if (cdp && !cdp.closed && appliedProvider !== '') {
      const providerChanged = appliedProvider !== provider
      // attachOrigin is only meaningful in attach mode. In sidecar mode it is
      // intentionally empty, so comparing it with the configured attach URL
      // used to shut the sidecar down on every status poll.
      const attachTargetChanged = provider === 'attach' && attachOrigin !== attachUrl
      const profileChanged = provider === 'sidecar' && appliedProvider === 'sidecar' && appliedProfileId !== profileId
      if (providerChanged || attachTargetChanged || profileChanged) await shutdown()
    }
  }

  function normalizeAttachUrl(value) {
    let parsed
    try { parsed = new URL(String(value || '').trim()) } catch (_error) { throw new Error('Chrome 调试地址不是有效 URL') }
    if (parsed.protocol !== 'http:') throw new Error('Chrome 调试地址必须是 http://127.0.0.1:端口')
    if (parsed.username || parsed.password) throw new Error('Chrome 调试地址不能包含账号密码')
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)) {
      throw new Error('只允许连接本机 Chrome（127.0.0.1 / localhost）')
    }
    if (parsed.pathname !== '/' && parsed.pathname !== '') throw new Error('Chrome 调试地址只填写 origin，例如 http://127.0.0.1:9222')
    return parsed.origin
  }

  async function fetchJson(url, options = {}, timeoutMs = 2200) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return await response.json()
    } finally { clearTimeout(timer) }
  }

  async function attachToBrowser() {
    const origin = normalizeAttachUrl(attachUrl)
    let versionInfo
    try {
      versionInfo = await fetchJson(origin + '/json/version')
    } catch (_error) {
      throw new Error('连不上本机 Chrome 调试端口 ' + origin + '。请用 --remote-debugging-port=9222 启动 Chrome，或切回隔离浏览器。')
    }
    let target
    let createdTab = false
    try {
      target = await fetchJson(origin + '/json/new?about:blank', { method: 'PUT' })
      createdTab = true
    } catch (_error) {
      // Some Chrome builds disable /json/new for non-local callers; use the
      // first existing page only as a fallback so attach still works. Do not
      // close that tab on shutdown: it may be the user's real tab.
      const list = await fetchJson(origin + '/json/list').catch(() => [])
      target = Array.isArray(list) ? list.find(item => item && item.type === 'page' && item.webSocketDebuggerUrl) : undefined
    }
    if (!target || !target.webSocketDebuggerUrl) throw new Error('本机 Chrome 没有可控制的页面')
    const connection = await PageConnection.connect(target.webSocketDebuggerUrl)
    try {
      await connection.send('Page.enable')
      await connection.send('Runtime.enable')
      await connection.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.dpr, mobile: false,
      })
    } catch (error) {
      connection.close()
      throw error
    }
    cdp = connection
    engineVersion = versionInfo && versionInfo.Browser ? String(versionInfo.Browser) : 'Chrome'
    executable = 'attached'
    port = Number(new URL(origin).port || 80)
    profileDir = ''
    profileMode = 'attached'
    processHandle = null
    attachedTargetId = target.id || ''
    primaryTargetId = target.id || ''
    attachedCreated = createdTab
    const data = await profileData(profileId)
    if (Array.isArray(data.blocklist) && data.blocklist.length > 0) await applyBlocklist(data.blocklist)
    attachOrigin = origin
    appliedProvider = 'attach'
    lastError = ''
    lastUrl = 'about:blank'
    lastTitle = ''
    return true
  }

  function profilesFile() {
    return path.join(homeDir(), 'appdata', 'browser', 'profiles.json')
  }

  async function loadProfileData() {
    try { return await fsp.readFile(profilesFile(), 'utf8').then(text => JSON.parse(text)) } catch (_error) { return {} }
  }

  async function saveProfileData(data) {
    try {
      await fsp.mkdir(path.dirname(profilesFile()), { recursive: true })
      await fsp.writeFile(profilesFile(), JSON.stringify(data, null, 2))
    } catch (_error) { /* best effort */ }
  }

  async function profileData(id) {
    const data = await loadProfileData()
    return (data && data[id]) || {}
  }

  async function applyBlocklist(domains) {
    if (!cdp || cdp.closed) return
    const list = (Array.isArray(domains) ? domains : []).filter(d => typeof d === 'string' && /^[a-z0-9.-]{1,253}$/u.test(d))
    const urls = list.flatMap(d => ['*://' + d + '/*', '*://*.' + d + '/*'])
    await cdp.send('Network.enable').catch(() => {})
    await cdp.send('Network.setBlockedURLs', { urls }).catch(() => {})
  }

  async function setBlocklist(domains) {
    const list = (Array.isArray(domains) ? domains : []).map(d => String(d || '').trim().toLowerCase()).filter(d => /^[a-z0-9.-]{1,253}$/u.test(d))
    const data = await loadProfileData()
    const entry = data[profileId] || {}
    entry.blocklist = [...new Set(list)]
    data[profileId] = entry
    await saveProfileData(data)
    await applyBlocklist(entry.blocklist)
    return entry.blocklist
  }

  async function rememberLastUrl() {
    if (!lastUrl || lastUrl === 'about:blank') return
    const data = await loadProfileData()
    const entry = data[profileId] || {}
    entry.lastUrl = lastUrl
    data[profileId] = entry
    await saveProfileData(data)
  }

  async function status() {
    try { await readBrowserConfig() } catch (_error) { /* status remains readable */ }
    if (executable === '') executable = await discoverExecutable().catch(() => '')
    const available = executable !== ''
    let version = engineVersion
    if (available && executable !== 'attached' && version === '') {
      try {
        const result = await execFile(executable, ['--version'], { timeout: 3000, windowsHide: true })
        version = String(result.stdout || '').trim()
        engineVersion = version
      } catch (_error) { version = '' }
    }
    const live = !!(cdp && !cdp.closed)
    if (!live && appliedProvider === 'attach' && lastError === '') lastError = '宿主 Chrome 连接已断开'
    return {
      ok: available && live,
      available,
      running: live,
      engine: appliedProvider === 'attach' ? 'Host Chrome' : (executable === '' ? '' : engineLabel(executable)),
      version,
      mode: 'cdp',
      stream: frameTimer !== null ? 'motion' : (hasViewers() ? 'on-demand' : 'idle'),
      dpr: viewport.dpr,
      url: lastUrl,
      title: lastTitle,
      width: viewport.width,
      height: viewport.height,
      h264: { decoder: !!jpegDecoder, active: h264Res !== null, width: h264Width, height: h264Height, feeds: h264FeedCount, bytesOut: h264BytesOut },
      perf: {
        captures: perf.captures,
        captureAvgMs: perf.captures ? +(perf.captureMs / perf.captures).toFixed(1) : 0,
        captureMaxMs: perf.captureMax,
        inputs: perf.inputs,
        frames: perf.frames,
        frameBytes: perf.frameBytes,
        lastFrameAt: perf.lastFrameAt,
      },
      profile: appliedProvider === 'attach' ? 'attached' : profileId,
      profileId,
      blocklist: (await profileData(profileId)).blocklist || [],
      profiles: ['default', 'work', 'research'],
      provider: appliedProvider || provider,
      configuredProvider: provider,
      attached: appliedProvider === 'attach' && live,
      attachUrl: appliedProvider === 'attach' ? attachOrigin : attachUrl,
      error: lastError,
      hint: !available
        ? '未找到 Chrome / Edge / Chromium；安装 Chrome 后重试，或使用系统浏览器'
        : (provider === 'attach' && !(cdp && !cdp.closed)
          ? '需要先启动本机 Chrome：--remote-debugging-port=9222 --user-data-dir=~/.nx-host-chrome'
          : ''),
    }
  }

  async function launch(profile) {
    const args = [
      // Headless: the capture page sends the stream to the receiver inside
      // NexlOS. A headful sidecar would expose a second Chrome window, which is
      // exactly what this product must avoid.
      '--headless=new',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      // 不给 --remote-allow-origins=*：CDP 客户端是 Node 的 WebSocket，不发 Origin，
      // 放开通配只会让本机任意网页在猜到端口后接管这个浏览器。
      '--user-data-dir=' + profile,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-component-update',
      '--disable-sync',
      '--disable-extensions',
      '--hide-scrollbars',
      '--auto-select-tab-capture-source-by-title=NEXL_CAPTURE_TARGET',
      '--disable-features=CalculateNativeWinOcclusion',
      '--enable-gpu-rasterization',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--lang=zh-CN',
      '--accept-lang=zh-CN,zh;q=0.9,en;q=0.6',
      '--autoplay-policy=no-user-gesture-required',
      '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      '--disable-dev-shm-usage',
      '--window-size=' + viewport.width + ',' + viewport.height,
      'about:blank',
    ]
    if (process.env.NEXLOS_BROWSER_NO_SANDBOX === '1') args.unshift('--no-sandbox')
    const activePortFile = path.join(profile, 'DevToolsActivePort')
    try { await fsp.rm(activePortFile, { force: true }) } catch (_error) { /* ignore */ }
    const pidFile = path.join(profile, 'nexl-sidecar.pid')
    try {
      const stale = Number(String(await fsp.readFile(pidFile, 'utf8')).trim())
      if (Number.isInteger(stale) && stale > 0 && stale !== process.pid && await isOurSidecarProcess(stale, profile)) {
        try { process.kill(stale, 'SIGKILL') } catch (_error) { /* already gone */ }
      }
    } catch (_error) { /* no stale pid */ }
    let stderr = ''
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    processHandle = child
    sidecarPidFile = pidFile
    if (child.pid) await fsp.writeFile(pidFile, String(child.pid), 'utf8').catch(() => {})
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + String(chunk)).slice(-4000)
    })
    child.stderr.on('error', () => {})
    child.on('exit', () => {
      if (processHandle === child) {
        processHandle = null
        if (cdp) { cdp.close(); cdp = null }
        lastError = shuttingDown ? '' : 'Chromium 已退出'
        broadcastStatus()
      }
    })
    const deadline = Date.now() + 15000
    let activePort = 0
    while (Date.now() < deadline) {
      await sleep(100)
      try {
        const text = await fsp.readFile(activePortFile, 'utf8')
        activePort = Number(String(text).split('\n')[0])
        if (activePort > 0) break
      } catch (_error) { /* still booting */ }
      if (child.exitCode !== null) break
    }
    if (!activePort) {
      try { child.kill() } catch (_error) { /* ignore */ }
      processHandle = null
      throw new Error('Chromium 启动失败' + (stderr.trim() ? '：' + stderr.trim().split('\n').slice(-2).join(' ') : ''))
    }
    port = activePort
    const versionInfo = await fetch('http://127.0.0.1:' + port + '/json/version').then(response => response.json()).catch(() => ({}))
    engineVersion = versionInfo.Browser || engineVersion
    let target
    try {
      target = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' }).then(response => response.json())
    } catch (_error) {
      const list = await fetch('http://127.0.0.1:' + port + '/json/list').then(response => response.json())
      target = Array.isArray(list) ? list.find(item => item.type === 'page') : undefined
    }
    if (!target || !target.webSocketDebuggerUrl) throw new Error('Chromium 没有可控制的页面')
    primaryTargetId = target.id || ''
    cdp = await PageConnection.connect(target.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false,
    })
    const profileState = await profileData(profileId)
    if (Array.isArray(profileState.blocklist) && profileState.blocklist.length > 0) {
      await applyBlocklist(profileState.blocklist)
    }
    lastError = ''
    attachedTargetId = ''
    attachOrigin = ''
    appliedProvider = 'sidecar'
    return true
  }

  async function isOurSidecarProcess(pid, profile) {
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false
    try {
      const { stdout } = await execFile('ps', ['-p', String(pid), '-o', 'command='], { timeout: 1200 })
      const command = String(stdout || '')
      return command.includes(profile) && /Google Chrome|Chromium|Microsoft Edge/iu.test(command)
    } catch (_error) { return false }
  }

  async function sweepStaleSidecars() {
    if (sweptSidecars) return
    sweptSidecars = true
    const root = path.join(homeDir(), 'appdata', 'browser')
    let dirs = []
    try { dirs = await fsp.readdir(root, { withFileTypes: true }) } catch (_error) { return }
    for (const entry of dirs) {
      if (!entry.isDirectory() || !entry.name.startsWith('profile-')) continue
      const dir = path.join(root, entry.name)
      const pidFile = path.join(dir, 'nexl-sidecar.pid')
      try {
        const pid = Number(String(await fsp.readFile(pidFile, 'utf8')).trim())
        if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && await isOurSidecarProcess(pid, dir)) {
          try { process.kill(pid, 'SIGKILL') } catch (_error) { /* gone */ }
        }
        await fsp.rm(pidFile, { force: true })
      } catch (_error) { /* no pid file */ }
    }
  }

  async function ensure() {
    await sweepStaleSidecars()
    if (cdp && !cdp.closed) return
    if (starting !== null) return starting
    starting = (async () => {
      shuttingDown = false
      await readBrowserConfig()
      if (provider === 'attach') {
        try { await attachToBrowser() } catch (error) {
          lastError = error && error.message ? error.message : String(error)
          throw error
        }
        return true
      }
      appliedProvider = 'sidecar'
      executable = executable === 'attached' ? '' : executable
      executable = executable || await discoverExecutable()
      if (!executable) throw new Error('未找到 Chrome / Edge / Chromium')
      const root = path.join(homeDir(), 'appdata', 'browser')
      await fsp.mkdir(root, { recursive: true })
      profileDir = path.join(root, 'profile-' + profileId)
      await fsp.mkdir(profileDir, { recursive: true })
      profileMode = 'persistent'
      appliedProfileId = profileId
      try {
        await launch(profileDir)
      } catch (error) {
        info('persistent profile launch failed', error)
        try { if (processHandle) processHandle.kill() } catch (_killError) { /* ignore */ }
        processHandle = null
        profileMode = 'ephemeral'
        profileDir = path.join(root, 'profile-' + Date.now().toString(36))
        await fsp.mkdir(profileDir, { recursive: true })
        try {
          await launch(profileDir)
        } catch (secondError) {
          lastError = secondError.message || String(secondError)
          throw secondError
        }
      }
      return true
    })()
    try {
      return await starting
    } finally {
      starting = null
    }
  }

  async function evaluate(expression, awaitPromise = false) {
    await ensure()
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    }, 30000)
    if (result.exceptionDetails !== undefined) {
      throw new Error(result.exceptionDetails.text || '页面脚本执行失败')
    }
    return result.result ? result.result.value : undefined
  }

  async function refreshState() {
    try {
      const value = await evaluate(`({ url: location.href, title: document.title, ready: document.readyState })`)
      if (value && typeof value === 'object') {
        if (value.url) lastUrl = String(value.url)
        if (value.title !== undefined) lastTitle = String(value.title)
      }
    } catch (error) {
      info('refreshState', error)
    }
  }

  async function navigate(rawUrl) {
    const url = normalizeUrl(rawUrl)
    await ensure()
    const state = await profileData(profileId)
    const blocklist = Array.isArray(state.blocklist) ? state.blocklist : []
    if (blocklist.length > 0) {
      const host = new URL(url).hostname.toLowerCase()
      const blocked = blocklist.some(domain => host === domain || host.endsWith('.' + domain))
      if (blocked) throw new Error('该域名在浏览器空间屏蔽名单中：' + host)
    }
    lastError = ''
    lastUrl = url
    lastTitle = ''
    const loaded = cdp.waitEvent('Page.loadEventFired', 12000)
    const result = await cdp.send('Page.navigate', { url }, 20000)
    if (result && result.errorText) throw new Error(result.errorText)
    await loaded
    if (url !== 'about:blank') {
      // GitHub paints its hero after the webfont resolves; without this wait a
      // screenshot can show only the fixed header on a white canvas.
      await Promise.race([
        evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true', true).catch(() => true),
        sleep(8000),
      ])
    }
    await sleep(url === 'about:blank' ? 100 : 500)
    await refreshState()
    void rememberLastUrl()
    requestFrameBurst()
    return { url: lastUrl, title: lastTitle }
  }

  async function startScreencast() {
    if (screencastActive) return true
    if (!cdp || cdp.closed) return false
    try {
      if (screencastOff) { screencastOff(); screencastOff = null }
      screencastOff = cdp.on('Page.screencastFrame', (params) => {
        try { if (h264Res && !globalThis.__nxScLog) { globalThis.__nxScLog = 1; void fsp.appendFile('/tmp/nx-h264.log', Date.now() + ' screencastFrame\n') } } catch (_e) {}
        if (!params || !params.data) return
        cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {})
        const now = Date.now()
        const due = now - lastScreencastAt >= 140
        if (h264Res && due) feedH264(params.data)
        if (due) feedMjpeg(params.data)
        if (streamClients.size === 0) return
        // Native video can push many frames. Limit the wire rate; the browser
        // still composites at full speed and we always forward the newest frame.
        if (!due) return
        lastScreencastAt = now
        broadcast({ type: 'frame', jpeg: params.data, url: lastUrl, title: lastTitle, width: viewport.width, height: viewport.height, dpr: viewport.dpr })
        if (now - lastStateAt > 1400) {
          lastStateAt = now
          void refreshState().catch(() => {})
        }
      })
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: FRAME_QUALITY,
        maxWidth: Math.round(viewport.width * viewport.dpr),
        maxHeight: Math.round(viewport.height * viewport.dpr),
        everyNthFrame: 4,
      }, 15000)
      screencastActive = true
      return true
    } catch (error) {
      info('screencast', error)
      screencastActive = false
      if (screencastOff) { screencastOff(); screencastOff = null }
      return false
    }
  }

  async function stopScreencast() {
    if (!screencastActive) return
    screencastActive = false
    if (screencastOff) { screencastOff(); screencastOff = null }
    if (cdp && !cdp.closed) await cdp.send('Page.stopScreencast').catch(() => {})
  }

  async function capture() {
    await ensure()
    if (capturing) return null
    capturing = true
    const startedAt = Date.now()
    try {
      await cdp.send('Page.bringToFront').catch(() => {})
      const result = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg', quality: frameQuality, fromSurface: true, captureBeyondViewport: false,
      }, 6000)
      lastFrameAt = Date.now()
      perf.captures += 1
      perf.captureMs += Date.now() - startedAt
      perf.captureMax = Math.max(perf.captureMax, Date.now() - startedAt)
      return result.data || ''
    } finally {
      capturing = false
    }
  }

  function debugOrigin() {
    if (appliedProvider === 'attach' && attachOrigin) return attachOrigin
    if (port > 0) return 'http://127.0.0.1:' + port
    return ''
  }

  async function debugTargets() {
    const origin = debugOrigin()
    if (origin === '') return []
    try { return await fetchJson(origin + '/json/list', {}, 1200) } catch (_error) { return [] }
  }

  async function cachedTargetIds() {
    if (Date.now() - targetCacheAt < 2500) return targetCache
    try {
      const list = await debugTargets()
      targetCache = list.map(item => item && item.id).filter(Boolean)
      targetCacheAt = Date.now()
    } catch (_error) { /* keep previous */ }
    return targetCache
  }

  async function closeDebugTarget(id) {
    const origin = debugOrigin()
    if (!origin || !id) return
    await fetch(origin + '/json/close/' + encodeURIComponent(id), { method: 'GET' }).catch(() => {})
  }

  async function followNewTarget(knownIds) {
    const list = await debugTargets()
    const known = new Set(Array.isArray(knownIds) ? knownIds : [])
    const created = list.find(item => item && item.type === 'page' && item.id !== primaryTargetId && !known.has(item.id)
      && /^https?:\/\//iu.test(String(item.url || '')))
    if (!created) return false
    const targetUrl = String(created.url)
    // This browser window is single-page. When a site uses target=_blank,
    // bring that page into the primary tab instead of leaving it invisible.
    await navigate(targetUrl).catch(() => {})
    await closeDebugTarget(created.id)
    return true
  }

  function broadcast(message) {
    const text = 'data: ' + JSON.stringify(message) + '\n\n'
    for (const client of [...streamClients]) {
      try {
        if (client.res.writableEnded) { streamClients.delete(client); continue }
        if (client.res.writableLength > 2 * 1024 * 1024) continue
        client.res.write(text, () => {})
      } catch (_error) {
        streamClients.delete(client)
      }
    }
  }

  function broadcastStatus() {
    if (streamClients.size === 0) return
    void status().then((value) => broadcast({ type: 'status', ...value })).catch(() => {})
  }

  // Inspect page structure first and capture pixels on demand: no background capture
  // loop. Frames are produced on interactions and while a <video> is playing;
  // idle pages cost zero pixels. This is the main multi-window balance knob.
  function spawnH264Encoder(width, height) {
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', width + 'x' + height, '-r', '15', '-i', '-',
      '-an',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p',
      '-g', '1', '-bf', '0', '-crf', '22',
      '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-frag_duration', '100000',
      'pipe:1',
    ]
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'ignore'] })
    h264Proc = proc
    h264Width = width
    h264Height = height
    proc.on('error', () => { void stopH264() })
    proc.stdin.on('error', () => { void stopH264() })
    proc.stdout.on('error', () => { void stopH264() })
    proc.on('exit', () => {
      if (h264Proc === proc) { h264Proc = null; h264Width = 0; h264Height = 0 }
    })
    void fsp.appendFile('/tmp/nx-h264.log', Date.now() + ' encoder spawn ' + width + 'x' + height + '\n')
    proc.stdout.on('data', (chunk) => {
      h264BytesOut += chunk.length
      if (h264BytesOut === chunk.length) void fsp.appendFile('/tmp/nx-h264.log', Date.now() + ' first output ' + chunk.length + '\n')
      if (!h264Res || h264Res.writableEnded || h264Res.destroyed) return
      try { h264Res.write(chunk) } catch (_error) { void stopH264() }
    })
    return proc
  }

  function feedH264(base64) {
    if (h264FeedCount < 4) void fsp.appendFile('/tmp/nx-h264.log', Date.now() + ' feed res=' + !!h264Res + ' decoder=' + !!jpegDecoder + ' len=' + (base64 ? base64.length : 0) + '\n')
    if (!h264Res || !jpegDecoder) return
    let decoded
    try { decoded = jpegDecoder.decode(Buffer.from(base64, 'base64'), { useTArray: true }) } catch (_error) { return }
    if (!decoded || !decoded.width || !decoded.height) return
    let proc = h264Proc
    if (!proc || h264Width !== decoded.width || h264Height !== decoded.height) {
      if (proc) { try { proc.kill('SIGKILL') } catch (_error) {} }
      proc = spawnH264Encoder(decoded.width, decoded.height)
    }
    if (!proc.stdin.writable) return
    h264FeedCount += 1
    try { proc.stdin.write(decoded.data) } catch (_error) { void stopH264() }
  }

  function feedMjpeg(base64) {
    if (mjpegClients.size === 0 || !base64) return
    perf.frames += 1
    perf.lastFrameAt = Date.now()
    const bytes = Buffer.from(base64, 'base64')
    perf.frameBytes += bytes.length
    const header = Buffer.alloc(4)
    header.writeUInt32BE(bytes.length, 0)
    for (const client of [...mjpegClients]) {
      try {
        if (client.writableEnded || client.destroyed) { mjpegClients.delete(client); continue }
        // A stalled DSH renderer must not grow the Host process without bound.
        // Dropping a frame is always better than an OOM exit.
        if (client.writableLength > 2 * 1024 * 1024) continue
        client.write(header, () => {})
        client.write(bytes, () => {})
      } catch (_error) { mjpegClients.delete(client) }
    }
  }

  async function streamMjpeg(req, res) {
    res.writeHead(200, {
      'content-type': 'application/x-nexlos-mjpeg',
      'cache-control': 'no-store',
      'connection': 'keep-alive',
      'access-control-allow-origin': '*',
    })
    mjpegClients.add(res)
    const dropMjpeg = () => mjpegClients.delete(res)
    res.on('close', dropMjpeg)
    res.on('error', dropMjpeg)
    req.on('error', dropMjpeg)
    ensureMotionCheck()
    // One explicit frame so the client paints immediately; subsequent frames
    // ride the interaction/video bursts.
    if (cdp && !cdp.closed) {
      void capture().then((data) => { if (data) feedMjpeg(data) }).catch(() => {})
    }
  }

  async function stopH264() {
    if (h264Proc) {
      try { h264Proc.stdin.end() } catch (_error) { /* ignore */ }
      try { h264Proc.kill('SIGKILL') } catch (_error) { /* ignore */ }
      h264Proc = null
    }
    h264Width = 0
    h264Height = 0
    if (h264Res) { try { if (!h264Res.writableEnded) h264Res.end() } catch (_error) {} }
    h264Res = null
    if (streamClients.size === 0 && mjpegClients.size === 0) await stopScreencast().catch(() => {})
  }

  async function streamH264(req, res) {
    void fsp.appendFile('/tmp/nx-h264.log', Date.now() + ' h264 enter\n')
    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'GET only' }))
      return
    }
    await ensure()
    if (h264Res !== null) {
      // Last viewer wins: a reloaded NexlOS iframe may leave an aborted fetch
      // without a close event on the server. Replace the stale encoder instead
      // of dead-locking the next session on 409.
      await stopH264().catch(() => {})
    }
    res.writeHead(200, {
      // octet-stream avoids the web layer's text-compression threshold
      // buffering the first small fMP4 moov box.
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store, no-transform',
      'connection': 'keep-alive',
      'access-control-allow-origin': '*',
      'x-no-compression': '1',
    })
    h264Res = res
    void fsp.appendFile('/tmp/nx-h264.log', Date.now() + ' h264 headers decoder=' + !!jpegDecoder + '\n')
    try { res.flushHeaders() } catch (_error) { /* older Node */ }
    req.on('close', () => { void stopH264() })
    req.on('error', () => { void stopH264() })
    res.on('close', () => { void stopH264() })
    res.on('error', () => { void stopH264() })
    // Screencast JPEGs are decoded to RGBA on the Host and piped as rawvideo;
    // image2pipe buffers until EOF, rawvideo streams immediately.
    void cachedTargetIds()
    void startScreencast().then((ok) => { void fsp.appendFile('/tmp/nx-h264.log', Date.now() + ' screencast=' + ok + '\n') })
    // A static page produces no screencast frames. Nudge a paint so the first
    // frame arrives without relying on Page.captureScreenshot (which can block
    // during navigation). Interaction frames follow naturally.
    const nudge = () => {
      if (!h264Res || !cdp || cdp.closed) return
      void fsp.appendFile('/tmp/nx-h264.log', Date.now() + ' nudge\n')
      void evaluate(`(() => {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;background:#ff0000;z-index:2147483647;pointer-events:none';
        document.body.append(d);
        setTimeout(() => d.remove(), 180);
        return true;
      })()`, true).then(() => fsp.appendFile('/tmp/nx-h264.log', Date.now() + ' nudged\n')).catch((e) => fsp.appendFile('/tmp/nx-h264.log', Date.now() + ' nudgeError ' + (e && e.message || e) + '\n'))
    }
    setTimeout(nudge, 500)
    setTimeout(nudge, 1800)
    setTimeout(nudge, 4000)
    const h264NudgeTimer = setInterval(nudge, 1100)
    if (h264NudgeTimer.unref) h264NudgeTimer.unref()
    res.on('close', () => clearInterval(h264NudgeTimer))
  }

  function hasViewers() {
    return streamClients.size > 0 || mjpegClients.size > 0 || h264Res !== null
  }

  function captureBroadcast() {
    if (!hasViewers() || !cdp || cdp.closed || capturing) return
    void (async () => {
      try {
        const data = await capture()
        if (data === '') return
        feedH264(data)
        feedMjpeg(data)
        if (Date.now() - lastStateAt > 1200) {
          lastStateAt = Date.now()
          await refreshState()
        }
        broadcast({ type: 'frame', jpeg: data, url: lastUrl, title: lastTitle, width: viewport.width, height: viewport.height, dpr: viewport.dpr })
      } catch (error) {
        info('frame', error)
        broadcast({ type: 'error', error: error.message || String(error) })
      }
    })()
  }

  function requestFrameBurst() {
    if (!hasViewers()) return
    // Coalesce scroll/click bursts into one short render loop. The previous
    // per-event timers stacked up on heavy pages and made them feel worse.
    interactionUntil = Date.now() + 1400
    if (interactionLoop !== null) return
    const tick = () => {
      if (!hasViewers() || Date.now() > interactionUntil) { interactionLoop = null; return }
      captureBroadcast()
      interactionLoop = setTimeout(tick, 160)
      if (interactionLoop.unref) interactionLoop.unref()
    }
    interactionLoop = setTimeout(tick, 0)
    if (interactionLoop.unref) interactionLoop.unref()
  }

  function startMotionLoop() {
    if (frameTimer !== null) return
    frameTimer = setInterval(() => {
      if (!hasViewers()) { stopMotionLoop(); return }
      captureBroadcast()
    }, FRAME_INTERVAL)
    if (frameTimer.unref) frameTimer.unref()
  }

  function stopMotionLoop() {
    if (frameTimer !== null) { clearInterval(frameTimer); frameTimer = null }
  }

  function ensureMotionCheck() {
    if (motionCheck !== null) return
    motionCheck = setInterval(async () => {
      if (!hasViewers()) { clearInterval(motionCheck); motionCheck = null; return }
      let playing = false
      try {
        playing = await evaluate(`[...document.querySelectorAll('video')].some(function (v) { return !v.paused && !v.ended && v.readyState >= 2; })`, true)
      } catch (_error) { playing = false }
      if (playing) startMotionLoop(); else stopMotionLoop()
    }, 4000)
    if (motionCheck.unref) motionCheck.unref()
  }

  function startFrameLoop() {
    // Compatibility alias: motion loop only starts when a video is playing.
    ensureMotionCheck()
  }

  function stopFrameLoopIfIdle() {
    if (hasViewers()) return
    for (const client of [...mjpegClients]) { try { client.end() } catch (_error) {} }
    mjpegClients.clear()
    stopMotionLoop()
    for (const timer of burstTimers) clearTimeout(timer)
    burstTimers = []
    if (interactionLoop !== null) { clearTimeout(interactionLoop); interactionLoop = null }
    void stopScreencast()
  }

  async function stream(req, res) {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'GET only' }))
      return
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write(': nexlos browser stream\n\n')
    const client = { res }
    streamClients.add(client)
    const remove = () => { streamClients.delete(client); stopFrameLoopIfIdle() }
    req.on('close', remove)
    req.on('error', remove)
    res.on('close', remove)
    res.on('error', remove)
    const keepAlive = setInterval(() => {
      try { if (!res.writableEnded) res.write(': keep-alive\n\n') } catch (_error) { /* removed below */ }
    }, 15000)
    keepAlive.unref?.()
    try {
      const current = await status()
      broadcast({ type: 'status', ...current })
      if (!current.available) throw new Error(current.error || current.hint || '浏览器引擎不可用')
      await ensure()
      await stopScreencast().catch(() => {})
      ensureMotionCheck()
      const data = await capture()
      if (data !== '') {
        res.write('data: ' + JSON.stringify({ type: 'frame', jpeg: data, url: lastUrl, title: lastTitle, width: viewport.width, height: viewport.height, dpr: viewport.dpr }) + '\n\n')
      }
    } catch (error) {
      lastError = error.message || String(error)
      try {
        res.write('data: ' + JSON.stringify({ type: 'error', error: lastError }) + '\n\n')
      } catch (_error) { /* ignore */ }
    }
    req.on('close', () => clearInterval(keepAlive))
  }

  async function inputWithPopupFollow(event) {
    const startedAt = Date.now()
    const type = String(event && event.type || '')
    if (type !== 'click' && type !== 'dblclick') return input(event)
    // Never delay the click on an HTTP /json/list round-trip. Use the cached
    // target set for popup detection; latency matters more than perfect
    // popup tracking on heavy video pages.
    const known = targetCache.length > 0 ? targetCache : await cachedTargetIds()
    const result = await input(event)
    void (async () => {
      await sleep(400)
      if (await followNewTarget(known)) return
      await sleep(900)
      await followNewTarget(known)
    })()
    return result
  }

  function queueInput(fn) {
    const next = inputQueue.then(fn, fn)
    inputQueue = next.catch(() => {})
    return next
  }

  async function dispatchMouse(event) {
    const x = clampNumber(event.x, 0, viewport.width - 1, 0)
    const y = clampNumber(event.y, 0, viewport.height - 1, 0)
    const type = String(event.type || 'click')
    const button = event.button === 'right' ? 'right' : 'left'
    if (type === 'mousemove') {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      return { x, y }
    }
    if (type === 'wheel') {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x, y, deltaX: clampNumber(event.deltaX, -2000, 2000, 0), deltaY: clampNumber(event.deltaY, -2000, 2000, 0),
      })
      return { x, y }
    }
    const count = type === 'dblclick' ? 2 : 1
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    for (let index = 1; index <= count; index += 1) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: index })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: index })
    }
    return { x, y }
  }

  const KEY_CODES = {
    Enter: 13, Backspace: 8, Tab: 9, Escape: 27, Delete: 46,
    ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
    Home: 36, End: 35, PageUp: 33, PageDown: 34,
  }

  async function dispatchKey(event) {
    const key = String(event.key || '')
    if (key === '') return {}
    const modifiers = clampNumber(event.modifiers, 0, 15, 0)
    const code = typeof event.code === 'string' ? event.code : key
    if (key.length === 1 && !modifiers) {
      await cdp.send('Input.insertText', { text: key })
      return { key }
    }
    const keyCode = KEY_CODES[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0)
    const base = { key, code, modifiers, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
    await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'keyDown' })
    if (key === 'Enter') await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'char', text: '\r', unmodifiedText: '\r' })
    await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' })
    return { key }
  }

  async function input(event) {
    const type = String(event && event.type || '')
    if (type === '') throw new Error('缺少输入类型')
    await ensure()
    return queueInput(async () => {
      if (type === 'click' || type === 'dblclick' || type === 'mousemove' || type === 'wheel') {
        return dispatchMouse({ ...event, type })
      }
      if (type === 'text') {
        const text = String(event.text || '')
        if (text === '') return {}
        await cdp.send('Input.insertText', { text })
        return { text: text.length }
      }
      if (type === 'key') return dispatchKey(event)
      if (type === 'focus') {
        await cdp.send('Page.bringToFront')
        return {}
      }
      throw new Error('不支持的浏览器输入类型：' + type)
    })
  }

  async function selectorPoint(selector) {
    const value = await evaluate(`(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(String(selector))})];
      for (const el of nodes) {
        const before = el.getBoundingClientRect();
        if (before.width <= 0 || before.height <= 0) continue;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width, h: rect.height };
        }
      }
      return null;
    })()`)
    if (!value || value.w === 0 || value.h === 0) throw new Error('页面上找不到可见的点击元素：' + selector)
    return value
  }

  async function history(direction) {
    await ensure()
    const value = await cdp.send('Page.getNavigationHistory')
    const index = Number(value.currentIndex)
    const target = index + direction
    const entries = Array.isArray(value.entries) ? value.entries : []
    if (target < 0 || target >= entries.length) return { url: lastUrl, title: lastTitle }
    await cdp.send('Page.navigateToHistoryEntry', { entryId: entries[target].id })
    await sleep(800)
    await refreshState()
    return { url: lastUrl, title: lastTitle }
  }

  function currentAgentProfileDir() {
    return path.join(homeDir(), 'appdata', 'browser', 'profile-' + (profileId || 'default'))
  }

  async function handoffToHuman(url) {
    await ensure().catch(() => {})
    const target = String(url || lastUrl || lastTitle || '')
    await refreshState().catch(() => {})
    const destination = /^https?:\/\//u.test(target) ? target : lastUrl
    await shutdown()
    const launched = await startHostBrowser({ port: 9334, profileDir: currentAgentProfileDir() })
    const created = await fetch(launched.url + '/json/new?' + encodeURIComponent(destination || 'about:blank'), { method: 'PUT' })
      .then(response => response.json()).catch(() => ({}))
    humanHandoff = { pid: launched.pid || 0, origin: launched.url, targetId: created.id || '', url: destination }
    return {
      mode: 'human-login',
      url: destination,
      port: 9334,
      profile: currentAgentProfileDir(),
      message: '已打开独立 Chrome。请完成登录/验证码，然后调用 resume 回到 Agent 浏览。',
    }
  }

  async function resumeFromHuman() {
    let resumeUrl = ''
    if (humanHandoff !== null) {
      const handoff = humanHandoff
      resumeUrl = handoff.url || ''
      humanHandoff = null
      if (handoff.targetId && handoff.origin) {
        await fetch(handoff.origin + '/json/close/' + encodeURIComponent(handoff.targetId), { method: 'GET' }).catch(() => {})
      }
      if (handoff.pid) { try { process.kill(handoff.pid, 'SIGTERM') } catch (_error) { /* gone */ } }
      await sleep(1200)
    }
    await shutdown()
    await ensure()
    if (resumeUrl) await navigate(resumeUrl).catch(() => {})
    await refreshState().catch(() => {})
    return { mode: 'agent', url: lastUrl || resumeUrl, title: lastTitle, message: '已回到 Agent 浏览模式，登录态沿用刚才的 profile。' }
  }

  const repositoryCache = new Map()

  function jsonLdSignals(value) {
    const types = []
    const authors = []
    const dates = []
    const walk = (node) => {
      if (node === null || typeof node !== 'object') return
      if (Array.isArray(node)) { for (const item of node) walk(item); return }
      const type = node['@type']
      if (typeof type === 'string') types.push(type)
      else if (Array.isArray(type)) for (const item of type) if (typeof item === 'string') types.push(item)
      const author = node.author
      if (typeof author === 'string') authors.push(author)
      else if (author && typeof author === 'object') {
        if (typeof author.name === 'string') authors.push(author.name)
        else if (Array.isArray(author)) for (const item of author) if (item && typeof item.name === 'string') authors.push(item.name)
      }
      if (typeof node.datePublished === 'string') dates.push(node.datePublished)
      if (typeof node.dateModified === 'string') dates.push(node.dateModified)
      for (const key of Object.keys(node)) if (key !== 'author') walk(node[key])
    }
    walk(value)
    return { types: [...new Set(types)].slice(0, 24), authors: [...new Set(authors)].slice(0, 8), dates: [...new Set(dates)].slice(0, 8) }
  }

  async function githubRepositoryCard(url) {
    const match = String(url || '').match(/^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/u)
    if (!match) return null
    const full = match[1] + '/' + match[2]
    const cached = repositoryCache.get(full)
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.value
    try {
      const token = process.env.GITHUB_TOKEN || process.env.NEXLOS_GITHUB_TOKEN || ''
      const headers = { 'user-agent': 'NexlOS-Agent-Browser', accept: 'application/vnd.github+json' }
      if (token) headers.authorization = 'Bearer ' + token
      const response = await fetch('https://api.github.com/repos/' + full, { headers, signal: AbortSignal.timeout(4000) })
      if (!response.ok) return null
      const repo = await response.json()
      const [readme, languages, release] = await Promise.all([
        fetch('https://api.github.com/repos/' + full + '/readme', {
          headers: { ...headers, accept: 'application/vnd.github.raw' },
          signal: AbortSignal.timeout(4000),
        }).then(r => r.ok ? r.text() : '').catch(() => ''),
        fetch('https://api.github.com/repos/' + full + '/languages', { headers, signal: AbortSignal.timeout(4000) })
          .then(r => r.ok ? r.json() : {}).catch(() => ({})),
        fetch('https://api.github.com/repos/' + full + '/releases/latest', { headers, signal: AbortSignal.timeout(4000) })
          .then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      const readmeText = String(readme || '')
      const readmeOutline = [...readmeText.matchAll(/^(#{1,4})\s+(.+)$/gmu)].slice(0, 40).map(m => ({ level: m[1].length, text: m[2].trim().slice(0, 160) }))
      const codeBlocks = [...readmeText.matchAll(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/gu)].slice(0, 12).map(m => ({ language: m[1] || '', code: m[2].slice(0, 2000) }))
      const installCommands = [...readmeText.matchAll(/^(?:\s*)((?:npm|pnpm|yarn|pip|pipx|uv|cargo|go|brew|apt|docker)\s+[^\n]{1,180})$/gmu)].slice(0, 10).map(m => m[1].trim())
      let tree = []
      try {
        const treeResponse = await fetch('https://api.github.com/repos/' + full + '/git/trees/' + (repo.default_branch || 'main') + '?recursive=1', { headers, signal: AbortSignal.timeout(4000) })
        if (treeResponse.ok) {
          const treeValue = await treeResponse.json()
          tree = (treeValue.tree || []).filter(item => item.type === 'blob').map(item => item.path).slice(0, 4000)
        }
      } catch (_error) { /* tree optional */ }
      const manifests = tree.filter(file => /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml|build\.gradle|requirements\.txt|README[^/]*|docs?\/)/iu.test(file)).slice(0, 60)
      const docs = tree.filter(file => /(^|\/)(docs?|documentation|guide|manual)\/.+\.(md|mdx|txt|html)$/iu.test(file)).slice(0, 40)
      const entryPoints = tree.filter(file => /(^|\/)(main|index|cli|app|server|entry)\.[a-z0-9]+$/iu.test(file) && !/(test|spec|example|demo)/iu.test(file)).slice(0, 20)
      const directories = [...new Set(tree.map(file => file.split('/')[0]).filter(Boolean))].slice(0, 40)
      const value = {
        fullName: repo.full_name || full,
        description: repo.description || '',
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        language: repo.language || '',
        topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 20) : [],
        license: repo.license?.spdx_id || '',
        updatedAt: repo.updated_at || '',
        defaultBranch: repo.default_branch || '',
        url: repo.html_url || url,
        readmeExcerpt: readmeText.slice(0, 8000),
        readmeOutline,
        codeBlocks,
        installCommands,
        fileCount: tree.length,
        manifests,
        docs,
        entryPoints,
        directories,
        languages,
        openIssues: repo.open_issues_count || 0,
        createdAt: repo.created_at || '',
        pushedAt: repo.pushed_at || '',
        archived: repo.archived === true,
        homepage: repo.homepage || '',
        latestRelease: release ? { tag: release.tag_name || '', name: release.name || '', publishedAt: release.published_at || '' } : null,
      }
      repositoryCache.set(full, { at: Date.now(), value })
      return value
    } catch (_error) { return null }
  }

  const nexlBytecodeCache = new Map()

  async function nexlBytecode(connection, url) {
    const key = String(url || '')
    const cached = nexlBytecodeCache.get(key)
    if (cached && Date.now() - cached.at < 8 * 1000) return cached.value
    try {
      await connection.send('Runtime.evaluate', { expression: nexlL1Source, returnByValue: false })
      const result = await connection.send('Runtime.evaluate', {
        expression: `(async () => {
          try {
            if (!window.NEXL_L1 || !document.body) return null;
            const snapshot = NEXL_L1.serializeDom(document.body, location.href);
            const bytes = new NEXL_L1.NexlStateStack().traverse(snapshot);
            let digest = '';
            try {
              const hash = await crypto.subtle.digest('SHA-256', bytes);
              digest = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (_error) { /* digest optional */ }
            let preview = '';
            try { preview = btoa(String.fromCharCode(...bytes.slice(0, 48))); } catch (_error) { /* optional */ }
            return {
              nodeCount: snapshot.nodeCount,
              bytes: bytes.length,
              magic: String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]),
              digest,
              preview,
            };
          } catch (error) { return { error: String(error && error.message || error) }; }
        })()`,
        returnByValue: true,
        awaitPromise: true,
      })
      const value = result.result?.value || null
      nexlBytecodeCache.set(key, { at: Date.now(), value })
      return value
    } catch (error) {
      return { error: String(error && error.message || error) }
    }
  }

  const readabilityCache = new Map()

  async function readabilityExtract(connection, url) {
    const key = String(url || '')
    const cached = readabilityCache.get(key)
    if (cached && Date.now() - cached.at < 12 * 1000) return cached.value
    try {
      await connection.send('Runtime.evaluate', { expression: readabilitySource, returnByValue: false })
      const result = await connection.send('Runtime.evaluate', {
        expression: `(() => {
          try {
            const clone = document.cloneNode(true);
            const article = new Readability(clone, { charThreshold: 200 }).parse();
            if (!article) return null;
            return {
              title: String(article.title || '').slice(0, 300),
              byline: String(article.byline || '').slice(0, 200),
              excerpt: String(article.excerpt || '').slice(0, 1000),
              siteName: String(article.siteName || '').slice(0, 200),
              publishedTime: String(article.publishedTime || '').slice(0, 100),
              textContent: String(article.textContent || '').slice(0, 30000),
              length: String(article.textContent || '').length,
            };
          } catch (error) { return { error: String(error && error.message || error) }; }
        })()`,
        returnByValue: true,
        awaitPromise: true,
      })
      const value = result.result?.value || null
      readabilityCache.set(key, { at: Date.now(), value })
      return value
    } catch (error) {
      return { error: String(error && error.message || error) }
    }
  }

  async function enrichSemantic(data) {
    const result = { ...data }
    const jsonLd = []
    for (const raw of Array.isArray(data.jsonLd) ? data.jsonLd : []) {
      try { jsonLd.push(JSON.parse(raw)) } catch (_error) { /* invalid JSON-LD */ }
    }
    const ld = jsonLdSignals(jsonLd)
    result.schema = { types: ld.types, context: 'https://schema.org', jsonLdBlocks: jsonLd.length }
    const metadata = { ...(data.metadata || {}) }
    const readability = data.readability && !data.readability.error ? data.readability : {}
    if (!metadata.canonical) metadata.canonical = data.url || ''
    if (!metadata.author && ld.authors.length) metadata.author = ld.authors[0]
    if (!metadata.author && readability.byline) metadata.author = readability.byline
    if (!metadata.published && ld.dates.length) metadata.published = ld.dates[0]
    if (!metadata.published && readability.publishedTime) metadata.published = readability.publishedTime
    if (!data.description && readability.excerpt) data.description = readability.excerpt.slice(0, 500)
    result.metadata = metadata
    const headings = Array.isArray(data.headings) ? data.headings : []
    const questionHeadings = headings.filter(h => /[?？]/u.test(String(h.text || ''))).length
    const mainText = String(data.mainText || '')
    const signals = {
      mainTextChars: mainText.length,
      headings: headings.length,
      questionHeadings,
      links: Array.isArray(data.links) ? data.links.length : 0,
      codeBlocks: Array.isArray(data.code) ? data.code.length : 0,
      tables: Array.isArray(data.tables) ? data.tables.length : 0,
      jsonLdTypes: ld.types.length,
      hasCanonical: Boolean(metadata.canonical),
      hasAuthor: Boolean(metadata.author || ld.authors.length),
      hasDate: Boolean(metadata.published || metadata.modified || ld.dates.length),
      hasDescription: Boolean(data.description),
      lang: metadata.lang || '',
    }
    let score = 0
    const missing = []
    if (signals.mainTextChars >= 1500) score += 25
    else if (signals.mainTextChars >= 400) score += 14
    else { score += 4; missing.push('正文过短') }
    if (signals.headings >= 3) score += 10
    else { missing.push('标题层级不足') }
    if (signals.jsonLdTypes > 0) score += 15
    else missing.push('缺少 JSON-LD / schema.org')
    if (signals.hasDescription) score += 5
    else missing.push('缺少 description')
    if (signals.hasCanonical) score += 5
    else missing.push('缺少 canonical')
    if (signals.hasAuthor) score += 8
    else missing.push('缺少作者')
    if (signals.hasDate) score += 7
    else missing.push('缺少日期')
    if (questionHeadings > 0) score += 8
    else if (headings.length >= 5) score += 4
    else missing.push('缺少问题式/答案式标题')
    if (signals.tables > 0 || signals.codeBlocks > 0) score += 7
    if (signals.links >= 5) score += 5
    if (signals.lang) score += 3
    else missing.push('缺少 lang')
    if (mainText.length > 0) score += Math.min(2, Math.round((signals.links / mainText.length) * 1000))
    result.geo = {
      score: Math.max(0, Math.min(100, score)),
      signals,
      missing: missing.slice(0, 8),
      formula: 'extractability+structure+schema+entity+answerability+language',
    }
    result.repository = await githubRepositoryCard(data.url)
    return result
  }

  async function agent(action) {
    const type = String(action && action.action || '')
    if (type === 'state' || type === 'status') {
      await ensure().catch(() => {})
      await refreshState().catch(() => {})
      return { url: lastUrl, title: lastTitle }
    }
    if (type === 'navigate' || type === 'open') return navigate(action.url)
    if (type === 'human-semantic') return humanSemantic()
    if (type === 'handoff') return handoffToHuman(action.url)
    if (type === 'resume') return resumeFromHuman()
    if (type === 'screenshot') {
      const data = await capture()
      if (!data) throw new Error('截图为空')
      return { jpeg: data, url: lastUrl, title: lastTitle, width: viewport.width, height: viewport.height, dpr: viewport.dpr }
    }
    if (type === 'semantic') {
      await ensure()
      const value = await evaluate(`(() => {
        const text = (el) => String(el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const main = document.querySelector('main,article,[role="main"]') || document.body;
        const roleOf = (el) => {
          const explicit = el.getAttribute('role');
          if (explicit) return explicit;
          const tag = el.tagName.toLowerCase();
          if (tag === 'a') return 'link';
          if (tag === 'button') return 'button';
          if (tag === 'select') return 'combobox';
          if (tag === 'textarea') return 'textbox';
          if (tag === 'input') return el.type === 'submit' ? 'button' : (el.type === 'checkbox' ? 'checkbox' : 'textbox');
          return tag;
        };
        const actionOf = (el) => {
          const actions = [];
          if (el.matches('a[href]')) actions.push('navigate');
          if (el.matches('button,input[type="submit"],input[type="button"],[role="button"]')) actions.push('click');
          if (el.matches('input,textarea,select,[contenteditable="true"]')) actions.push('input');
          if (el.hasAttribute('data-nexl-action')) actions.push('custom:' + el.getAttribute('data-nexl-action'));
          return actions;
        };
        const actionSpace = [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[data-nexl-action]')]
          .filter(visible).slice(0, 160).map(el => ({ role: roleOf(el), name: text(el).slice(0, 160), actions: actionOf(el) }));
        return {
          url: location.href,
          title: document.title,
          nexl: {
            mode: document.documentElement.getAttribute('data-nexl-agent-view') || String(document.querySelector('meta[name="nexl-agent-view"]')?.content || 'pixel'),
            actionSpace,
          },
          metadata: {
            canonical: String(document.querySelector('link[rel="canonical"]')?.href || ''),
            lang: String(document.documentElement.lang || ''),
            author: String(document.querySelector('meta[name="author"]')?.content || ''),
            published: String(document.querySelector('meta[property="article:published_time"]')?.content || document.querySelector('time[datetime]')?.getAttribute('datetime') || ''),
            modified: String(document.querySelector('meta[property="article:modified_time"]')?.content || ''),
            ogTitle: String(document.querySelector('meta[property="og:title"]')?.content || ''),
            ogType: String(document.querySelector('meta[property="og:type"]')?.content || ''),
            ogImage: String(document.querySelector('meta[property="og:image"]')?.content || ''),
            robots: String(document.querySelector('meta[name="robots"]')?.content || ''),
          },
          description: String(document.querySelector('meta[name="description"]')?.content || '').slice(0, 1000),
          headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).slice(0, 80).map(h => ({ level: Number(h.tagName.slice(1)), text: text(h).slice(0, 240) })),
          links: [...document.querySelectorAll('a[href]')].filter(visible).slice(0, 160).map(a => ({ text: text(a).slice(0, 160), href: a.href })),
          code: [...document.querySelectorAll('pre,code')].slice(0, 40).map(c => String(c.innerText || c.textContent || '').slice(0, 3000)).filter(Boolean),
          tables: [...document.querySelectorAll('table')].slice(0, 8).map(t => [...t.querySelectorAll('tr')].slice(0, 20).map(r => [...r.querySelectorAll('th,td')].map(c => text(c).slice(0, 120)))),
          forms: [...document.querySelectorAll('input,textarea,select,button')].filter(visible).slice(0, 80).map(el => ({ tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', name: el.getAttribute('name') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || text(el).slice(0, 120) })),
          jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 4).map(s => String(s.textContent || '').slice(0, 4000)),
          mainText: String(main.innerText || '').slice(0, 24000),
        };
      })()`)
      let readability = null
      try { readability = await readabilityExtract(cdp, value?.url || lastUrl) } catch (_error) { /* optional */ }
      let bytecode = null
      try { bytecode = await nexlBytecode(cdp, value?.url || lastUrl) } catch (_error) { /* optional */ }
      if (readability && readability.textContent) value.mainText = readability.textContent
      let ax = []
      try {
        const tree = await cdp.send('Accessibility.getFullAXTree', {})
        ax = (tree.nodes || []).filter(node => !node.ignored && node.role?.value && node.name?.value)
          .slice(0, 220)
          .map(node => ({ role: String(node.role.value), name: String(node.name.value).slice(0, 220) }))
      } catch (_error) { /* accessibility unavailable */ }
      return enrichSemantic({ ...value, ax, readability, bytecode })
    }
    if (type === 'snapshot') {
      await ensure()
      return evaluate(`(() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        return {
          url: location.href,
          title: document.title,
          text: String(document.body ? document.body.innerText : '').slice(0, 24000),
          links: [...document.querySelectorAll('a[href]')].filter(visible).slice(0, 300).map(a => ({
            text: String(a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 160),
            href: a.href,
          })),
        };
      })()`)
    }
    if (type === 'click' || type === 'dblclick') {
      let point = { x: action.x, y: action.y }
      if (action.selector) point = await selectorPoint(action.selector)
      await ensure()
      const known = (await debugTargets()).map(item => item && item.id).filter(Boolean)
      const result = await dispatchMouse({ ...point, type: type === 'dblclick' ? 'dblclick' : 'click' })
      void (async () => {
        await sleep(650)
        if (await followNewTarget(known)) return
        await sleep(1200)
        await followNewTarget(known)
      })()
      return result
    }
    if (type === 'type') {
      requestFrameBurst()
      await ensure()
      if (action.selector) {
        await evaluate(`(() => {
          const nodes = [...document.querySelectorAll(${JSON.stringify(String(action.selector))})];
          const el = nodes.find(node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
          if (!el) return false;
          el.scrollIntoView({ block: 'center' });
          el.focus();
          return true;
        })()`)
      }
      const text = String(action.text || '')
      if (text !== '') await cdp.send('Input.insertText', { text })
      if (action.enter === true) await dispatchKey({ key: 'Enter', code: 'Enter' })
      return { typed: text.length }
    }
    if (type === 'key') {
      await ensure()
      const result = await dispatchKey(action)
      requestFrameBurst()
      return result
    }
    if (type === 'eval') {
      await ensure()
      const value = await evaluate(String(action.expression || 'undefined'), true)
      return { value }
    }
    if (type === 'back') return history(-1)
    if (type === 'forward') return history(1)
    if (type === 'reload') {
      await ensure()
      await cdp.send('Page.reload')
      await sleep(900)
      await refreshState()
      return { url: lastUrl, title: lastTitle }
    }
    if (type === 'stop') {
      await ensure()
      await cdp.send('Page.stopLoading').catch(() => {})
      await refreshState().catch(() => {})
      return { url: lastUrl, title: lastTitle, stopped: true }
    }
    if (type === 'scroll') {
      await ensure()
      const point = action.selector ? await selectorPoint(action.selector) : { x: action.x, y: action.y }
      const wheelResult = await dispatchMouse({ type: 'wheel', x: point.x, y: point.y, deltaX: action.deltaX, deltaY: action.deltaY })
      requestFrameBurst()
      return wheelResult
    }
    throw new Error('不支持的浏览器操作：' + type)
  }

  async function setViewport(width, height, dpr, quality) {
    const nextWidth = Math.round(clampNumber(width, 640, 2400, viewport.width))
    const nextHeight = Math.round(clampNumber(height, 360, 1400, viewport.height))
    const nextDpr = clampNumber(dpr, 1, 2, viewport.dpr)
    viewport.width = nextWidth
    viewport.height = nextHeight
    viewport.dpr = nextDpr
    if (typeof quality === 'number' && Number.isFinite(quality)) frameQuality = Math.round(clampNumber(quality, 45, 95, frameQuality))
    if (cdp && !cdp.closed) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: nextWidth, height: nextHeight, deviceScaleFactor: nextDpr, mobile: false,
      }).catch(() => {})
      if (screencastActive) {
        await stopScreencast()
        await startScreencast()
      }
      await refreshState().catch(() => {})
    }
    return { width: viewport.width, height: viewport.height, dpr: viewport.dpr }
  }

  async function preflight() {
    return {
      platform: process.platform || '',
      arch: process.arch || '',
      node: process.version || '',
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      cpus: Array.isArray(os.cpus()) ? os.cpus().length : 0,
      lowMemory: os.totalmem() < 8 * 1024 * 1024 * 1024 || os.freemem() < 1.5 * 1024 * 1024 * 1024,
      heapTotal: process.memoryUsage().heapTotal,
      executable: executable || '',
      chromeAvailable: !!(executable && executable !== 'attached'),
      provider: appliedProvider || 'sidecar',
    }
  }

  async function humanSemantic() {
    const origin = 'http://127.0.0.1:9333'
    let list
    try { list = await fetch(origin + '/json/list').then(r => r.json()) } catch (_error) {
      throw new Error('独立 Chrome 未运行')
    }
    const candidates = Array.isArray(list) ? list : []
    const page = candidates.find(item => item && item.id === humanTargetId)
      || candidates.find(item => item && item.type === 'page' && /^https?:\/\//u.test(String(item.url || '')))
    if (!page || !page.webSocketDebuggerUrl) throw new Error('独立 Chrome 没有可采集页面')
    const conn = await PageConnection.connect(page.webSocketDebuggerUrl)
    try {
      await conn.send('Runtime.enable')
      const value = await conn.send('Runtime.evaluate', {
        expression: `(() => {
          const text = (el) => String(el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
          const visible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          };
          const main = document.querySelector('main,article,[role="main"]') || document.body;
          const roleOf = (el) => {
            const explicit = el.getAttribute('role');
            if (explicit) return explicit;
            const tag = el.tagName.toLowerCase();
            if (tag === 'a') return 'link';
            if (tag === 'button') return 'button';
            if (tag === 'select') return 'combobox';
            if (tag === 'textarea') return 'textbox';
            if (tag === 'input') return el.type === 'submit' ? 'button' : (el.type === 'checkbox' ? 'checkbox' : 'textbox');
            return tag;
          };
          const actionOf = (el) => {
            const actions = [];
            if (el.matches('a[href]')) actions.push('navigate');
            if (el.matches('button,input[type="submit"],input[type="button"],[role="button"]')) actions.push('click');
            if (el.matches('input,textarea,select,[contenteditable="true"]')) actions.push('input');
            if (el.hasAttribute('data-nexl-action')) actions.push('custom:' + el.getAttribute('data-nexl-action'));
            return actions;
          };
          return {
            url: location.href,
            title: document.title,
            nexl: {
              mode: document.documentElement.getAttribute('data-nexl-agent-view') || String(document.querySelector('meta[name="nexl-agent-view"]')?.content || 'pixel'),
              actionSpace: [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[data-nexl-action]')]
                .filter(visible).slice(0, 160).map(el => ({ role: roleOf(el), name: text(el).slice(0, 160), actions: actionOf(el) })),
            },
            metadata: {
            canonical: String(document.querySelector('link[rel="canonical"]')?.href || ''),
            lang: String(document.documentElement.lang || ''),
            author: String(document.querySelector('meta[name="author"]')?.content || ''),
            published: String(document.querySelector('meta[property="article:published_time"]')?.content || document.querySelector('time[datetime]')?.getAttribute('datetime') || ''),
            modified: String(document.querySelector('meta[property="article:modified_time"]')?.content || ''),
            ogTitle: String(document.querySelector('meta[property="og:title"]')?.content || ''),
            ogType: String(document.querySelector('meta[property="og:type"]')?.content || ''),
            ogImage: String(document.querySelector('meta[property="og:image"]')?.content || ''),
            robots: String(document.querySelector('meta[name="robots"]')?.content || ''),
          },
          description: String(document.querySelector('meta[name="description"]')?.content || '').slice(0, 1000),
            headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).slice(0, 80).map(h => ({ level: Number(h.tagName.slice(1)), text: text(h).slice(0, 240) })),
            links: [...document.querySelectorAll('a[href]')].filter(visible).slice(0, 160).map(a => ({ text: text(a).slice(0, 160), href: a.href })),
            code: [...document.querySelectorAll('pre,code')].slice(0, 40).map(c => String(c.innerText || c.textContent || '').slice(0, 3000)).filter(Boolean),
            tables: [...document.querySelectorAll('table')].slice(0, 8).map(t => [...t.querySelectorAll('tr')].slice(0, 20).map(r => [...r.querySelectorAll('th,td')].map(c => text(c).slice(0, 120)))),
            forms: [...document.querySelectorAll('input,textarea,select,button')].filter(visible).slice(0, 80).map(el => ({ tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', name: el.getAttribute('name') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || text(el).slice(0, 120) })),
            jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 4).map(s => String(s.textContent || '').slice(0, 4000)),
            mainText: String(main.innerText || '').slice(0, 24000),
          };
        })()`,
        returnByValue: true,
        awaitPromise: true,
      })
      const data = value.result?.value || {}
      let readability = null
      try { readability = await readabilityExtract(conn, data.url || page.url) } catch (_error) { /* optional */ }
      let bytecode = null
      try { bytecode = await nexlBytecode(conn, data.url || page.url) } catch (_error) { /* optional */ }
      if (readability && readability.textContent) data.mainText = readability.textContent
      let ax = []
      try {
        const tree = await conn.send('Accessibility.getFullAXTree', {})
        ax = (tree.nodes || []).filter(node => !node.ignored && node.role?.value && node.name?.value)
          .slice(0, 220).map(node => ({ role: String(node.role.value), name: String(node.name.value).slice(0, 220) }))
      } catch (_error) { /* accessibility unavailable */ }
      return enrichSemantic({ ...data, ax, readability, bytecode, source: 'human-chrome' })
    } finally { try { conn.close() } catch (_error) { /* ignore */ } }
  }

  async function openHumanUrl(url) {
    const target = String(url || '')
    if (!/^https?:\/\//u.test(target)) throw new Error('human browser needs http(s) url')
    const launched = await startHostBrowser({ port: 9333, profile: 'human-chrome-profile' })
    const origin = launched.url
    if (launched.launched === false) {
      const list = await fetch(origin + '/json/list').then(response => response.json()).catch(() => [])
      const candidates = Array.isArray(list) ? list : []
      const page = candidates.find(item => item && item.id === humanTargetId)
        || candidates.find(item => item && item.type === 'page' && /^https?:\/\//u.test(String(item.url || '')))
        || candidates.find(item => item && item.type === 'page')
      if (page && page.webSocketDebuggerUrl) {
        const conn = await PageConnection.connect(page.webSocketDebuggerUrl)
        try {
          await conn.send('Page.navigate', { url: target })
          await conn.send('Page.bringToFront').catch(() => {})
        } finally { try { conn.close() } catch (_error) { /* ignore */ } }
        humanTargetId = page.id || ''
        return { ok: true, launched: false, url: target, targetId: page.id || '' }
      }
    }
    const created = await fetch(origin + '/json/new?' + encodeURIComponent(target), { method: 'PUT' })
      .then(response => response.json())
    humanTargetId = created && created.id || ''
    return { ok: true, launched: launched.launched === true, url: target, targetId: humanTargetId }
  }

  async function startHostBrowser(options = {}) {
    const bin = executable && executable !== 'attached' ? executable : await discoverExecutable()
    if (!bin) throw new Error('未找到 Chrome / Edge / Chromium，无法启动本机浏览器')
    const port = Number(options.port || 9222)
    const origin = 'http://127.0.0.1:' + port
    try {
      await fetchJson(origin + '/json/version', {}, 800)
      return { launched: false, url: origin, message: '本机浏览器已在运行' }
    } catch (_error) { /* start it */ }
    const profile = options.profileDir ? String(options.profileDir) : path.join(homeDir(), 'appdata', options.profile || 'host-chrome-profile')
    await fsp.mkdir(profile, { recursive: true })
    const args = [
      '--remote-debugging-port=' + port,
      '--remote-debugging-address=127.0.0.1',
      '--user-data-dir=' + profile,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
    ]
    if (options.headless === true) args.unshift('--headless=new', '--disable-gpu')
    const child = spawn(bin, [...args, 'about:blank'], { stdio: 'ignore', detached: true })
    child.unref()
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      await sleep(300)
      try {
        await fetchJson(origin + '/json/version', {}, 700)
        return { launched: true, url: origin, pid: child.pid }
      } catch (_error) { /* still starting */ }
    }
    throw new Error('本机 Chrome 启动超时。可手动运行：' + bin + ' --remote-debugging-port=' + port)
  }

  async function shutdown() {
    shuttingDown = true
    await stopH264().catch(() => {})
    stopMotionLoop()
    for (const timer of burstTimers) clearTimeout(timer)
    burstTimers = []
    if (interactionLoop !== null) { clearTimeout(interactionLoop); interactionLoop = null }
    if (motionCheck !== null) { clearInterval(motionCheck); motionCheck = null }
    await stopScreencast().catch(() => {})
    for (const client of [...streamClients]) {
      try { client.res.end() } catch (_error) { /* ignore */ }
    }
    streamClients.clear()
    for (const client of [...mjpegClients]) { try { client.end() } catch (_error) {} }
    mjpegClients.clear()
    const wasAttached = appliedProvider === 'attach'
    const targetId = attachedTargetId
    const origin = attachOrigin
    const closeCreatedTab = wasAttached && attachedCreated
    if (wasAttached && closeCreatedTab && cdp) {
      await cdp.send('Page.close').catch(() => {})
    }
    if (cdp) { try { cdp.close() } catch (_error) { /* ignore */ } cdp = null }
    if (wasAttached) {
      if (closeCreatedTab && targetId && origin) {
        await Promise.race([
          fetch(origin + '/json/close/' + encodeURIComponent(targetId), { method: 'GET' }).catch(() => {}),
          sleep(800),
        ])
      }
    } else if (processHandle) {
      const child = processHandle
      processHandle = null
      try { child.kill('SIGTERM') } catch (_error) { /* ignore */ }
      for (let i = 0; i < 12 && child.exitCode === null; i += 1) await sleep(100)
      if (child.exitCode === null) { try { child.kill('SIGKILL') } catch (_error) { /* ignore */ } }
      if (sidecarPidFile) { await fsp.rm(sidecarPidFile, { force: true }).catch(() => {}); sidecarPidFile = '' }
    }
    attachedTargetId = ''
    attachedCreated = false
    attachOrigin = ''
    appliedProvider = ''
    appliedProfileId = ''
    executable = executable === 'attached' ? '' : executable
    profileMode = 'persistent'
    lastError = ''
    lastUrl = ''
    lastTitle = ''
    port = 0
    await sleep(120)
    shuttingDown = false
  }

  return { status, ensure, navigate, input: inputWithPopupFollow, agent, stream, streamMjpeg, streamH264, capture, refreshState, setViewport, shutdown, startHostBrowser, openHumanUrl, humanSemantic, preflight, setBlocklist, profileData, config: browserConfig }
}
