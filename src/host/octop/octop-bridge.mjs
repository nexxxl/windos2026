/**
 * Octop → NexlOS 命令栏桥。
 *
 * WebOS 的命令栏说的是 NDJSON 事件流（status / tool / assistant / error / done），
 * Octop 说的是 WebSocket 帧（turn.started / token / reasoning / usage / done）。
 * 这个模块只做翻译，不碰模型选择：用哪个模型由 Octop 的 agent 决定，
 * 所以命令栏跑的就是 Octop 自己配置的引擎，与 DSH 无关。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const OCTOP = (process.env.OCTOP_URL || 'http://127.0.0.1:8088').replace(/\/+$/, '')
const STATE = process.env.NEXLOS_STATE_DIR || path.join(os.homedir(), '.nexlos-octop')
const SESSION_FILE = path.join(STATE, 'sessions.json')

let auth = { token: '', exp: 0 }
let agentId = ''
let modelName = ''
let agentCheckedAt = 0
// 缓存要短：Octop 停机/重启后，/agent/status 必须很快反映真实状态。
const AGENT_TTL_MS = 8000

function creds() {
  const out = { username: process.env.OCTOP_USER || 'admin', password: process.env.OCTOP_PASSWORD || '' }
  try {
    const file = path.join(os.homedir(), '.octop', 'credential.txt')
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim()
      const m = /^(username|password)\s*:\s*(.+)$/.exec(line)
      if (m) out[m[1]] = m[2].trim()
    }
  } catch {
    /* 没有凭据文件时退回环境变量 */
  }
  return out
}

/** 换取并缓存 JWT；失败返回空串，由调用方决定降级。 */
async function token(force = false) {
  if (!force && auth.token && Date.now() < auth.exp) return auth.token
  const { username, password } = creds()
  if (!password) return ''
  try {
    const res = await fetch(OCTOP + '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    auth = { token: data.access_token, exp: Date.now() + Math.max(60, (data.expires_in || 3600) - 120) * 1000 }
    return auth.token
  } catch {
    return ''
  }
}

async function apiGet(pathname) {
  const t = await token()
  if (!t) return null
  try {
    const res = await fetch(OCTOP + '/api' + pathname, { headers: { authorization: 'Bearer ' + t } })
    if (res.status === 401) {
      const fresh = await token(true)
      if (!fresh) return null
      const retry = await fetch(OCTOP + '/api' + pathname, { headers: { authorization: 'Bearer ' + fresh } })
      return retry.ok ? retry.json() : null
    }
    return res.ok ? res.json() : null
  } catch {
    return null
  }
}

/** 取当前用户的默认 agent；模型名优先用 Octop 里 agent 绑定的值，其次用上次实测值。 */
export async function agentInfo() {
  if (agentId && Date.now() - agentCheckedAt < AGENT_TTL_MS) return { agentId, model: modelName || readModel() }
  const agents = await apiGet('/agents')
  if (Array.isArray(agents) && agents.length > 0) {
    agentId = agents[0].agent_id
    modelName = agents[0].default_model || readModel()
    agentCheckedAt = Date.now()
  } else {
    agentId = ''
    agentCheckedAt = 0
  }
  return { agentId, model: modelName }
}

const MODEL_FILE = path.join(STATE, 'model.txt')

function readModel() {
  try {
    return readFileSync(MODEL_FILE, 'utf8').trim()
  } catch {
    return ''
  }
}

function persistModel(name) {
  try {
    mkdirSync(STATE, { recursive: true })
    writeFileSync(MODEL_FILE, name + '\n')
  } catch {
    /* 写不了就只在内存里生效 */
  }
}

export function setModel(name) {
  if (name) modelName = name
}

function loadSessions() {
  try {
    return JSON.parse(readFileSync(SESSION_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveSessions(map) {
  try {
    mkdirSync(STATE, { recursive: true })
    writeFileSync(SESSION_FILE, JSON.stringify(map, null, 2))
  } catch {
    /* 状态落盘失败不影响当前会话 */
  }
}

const sessions = loadSessions()
const active = new Map() // sessionId -> { ws, threadId }

function write(res, event) {
  res.write(JSON.stringify(event) + '\n')
}

/**
 * 处理一次命令：把 WebOS 的 {sessionId, text} 变成 Octop 的 user_turn，
 * 再把 WS 帧翻成 NDJSON 事件写回。
 */
export async function chat({ sessionId, text, res }) {
  const info = await agentInfo()
  if (!info.agentId) {
    write(res, { type: 'error', text: 'Octop 未就绪：拿不到 agent（检查服务与凭据）' })
    write(res, { type: 'done', reason: 'error' })
    return res.end()
  }
  const t = await token()
  if (!t) {
    write(res, { type: 'error', text: 'Octop 登录失败：检查 ~/.octop/credential.txt' })
    write(res, { type: 'done', reason: 'error' })
    return res.end()
  }

  const threadId = sessions[sessionId] || undefined
  // Octop 默认把所有请求归到 agent+user 的同一个 dashboard thread；
  // 不带 session_key 时“新会话”会继承旧上下文。这里按 NexlOS 会话隔离。
  const sessionKey = `${info.agentId}:dashboard:nexlos-${sessionId}:dm`
  const wsUrl = `ws://${OCTOP.replace(/^https?:\/\//, '')}/api/agents/${info.agentId}/chat/ws?token=${encodeURIComponent(t)}`
  let ws
  try {
    ws = new WebSocket(wsUrl)
  } catch (error) {
    write(res, { type: 'error', text: '无法连接 Octop 对话通道：' + error.message })
    write(res, { type: 'done', reason: 'error' })
    return res.end()
  }

  let answer = ''
  let sent = ''
  let reasoning = 0
  // 本轮是否已经发过具体错误：turn.ended 的 failed 只是布尔标记，避免多弹一行 "true"
  let errorShown = false
  let model = ''
  let finished = false
  let lastFlush = 0
  let flushTimer = null

  const flush = (force) => {
    if (!answer || answer === sent) return
    const now = Date.now()
    if (!force && now - lastFlush < 80) {
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null
          flush(true)
        }, 90)
      }
      return
    }
    lastFlush = now
    sent = answer
    write(res, { type: 'assistant', text: answer })
  }

  const finish = (reason, detail) => {
    if (finished) return
    finished = true
    if (flushTimer) clearTimeout(flushTimer)
    flush(true)
    write(res, { type: 'done', reason: reason || 'done', detail: detail || '', model })
    try {
      ws.close()
    } catch {
      /* 已关闭 */
    }
    active.delete(sessionId)
    res.end()
  }

  ws.onopen = () => {
    write(res, { type: 'status', phase: 'running' })
    ws.send(JSON.stringify({ type: 'user_turn', text, thread_id: threadId, session_key: sessionKey }))
  }

  ws.onmessage = (event) => {
    let frame
    try {
      frame = JSON.parse(typeof event.data === 'string' ? event.data : '{}')
    } catch {
      return
    }
    switch (frame.type) {
      case 'turn.started':
        if (frame.thread_id) {
          sessions[sessionId] = frame.thread_id
          saveSessions(sessions)
          // 首轮对话的 thread_id 只有 turn.started 才拿到；同步给 active，
          // 否则 stop() 会拿到空 thread_id，Octop 会拒绝取消。
          const entry = active.get(sessionId)
          if (entry) entry.threadId = frame.thread_id
        }
        break
      case 'token':
        answer += frame.content || ''
        flush(false)
        break
      case 'reasoning':
        reasoning += 1
        break
      case 'usage':
        if (frame.model) {
          model = frame.model
          setModel(frame.model)
          persistModel(frame.model)
        }
        break
      case 'error':
        errorShown = true
        write(res, { type: 'error', text: frame.message || '模型调用失败' })
        break
      case 'turn.ended':
        if (typeof frame.failed === 'string' && frame.failed) {
          errorShown = true
          write(res, { type: 'error', text: frame.failed })
        } else if (frame.failed === true && !errorShown) {
          write(res, { type: 'error', text: '本轮运行失败（Octop 未返回具体原因）' })
        }
        break
      case 'done':
        if (frame.thread_id) {
          sessions[sessionId] = frame.thread_id
          saveSessions(sessions)
          const entry = active.get(sessionId)
          if (entry) entry.threadId = frame.thread_id
        }
        finish('done', '')
        break
      default:
        break
    }
  }

  ws.onerror = () => {
    // 连接级失败：丢掉 agent 缓存，下一次 /agent/status 会重新探测。
    agentId = ''
    agentCheckedAt = 0
    write(res, { type: 'error', text: '与 Octop 的连接断开' })
    finish('error', '')
  }

  ws.onclose = () => {
    if (!finished) finish('done', '')
  }

  active.set(sessionId, { ws, threadId })

  // 客户端断开（关窗/切走）时顺手取消，避免白白计费
  res.on('close', () => {
    if (finished) return
    finished = true
    try {
      if (threadId) ws.send(JSON.stringify({ type: 'cancel', thread_id: threadId }))
      ws.close()
    } catch {
      /* 已关闭 */
    }
    active.delete(sessionId)
  })
}

/** 停止一次运行：对应 Octop 的 cancel 帧。 */
export function stop(sessionId) {
  const entry = active.get(sessionId)
  if (!entry) return false
  try {
    entry.ws.send(JSON.stringify({ type: 'cancel', thread_id: entry.threadId || sessions[sessionId] }))
  } catch {
    /* 已关闭 */
  }
  return true
}

export function running(sessionId) {
  return active.has(sessionId)
}

export function thread(sessionId) {
  return sessions[sessionId] || ''
}

export { OCTOP }
