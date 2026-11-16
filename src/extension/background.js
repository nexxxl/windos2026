const HOST = 'http://127.0.0.1:3080'
let token = ''
let pollTimer = 0
let state = { tabId: 0, capturing: false, attached: false }

async function post(path, body) {
  const response = await fetch(HOST + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  return response.json().catch(() => null)
}

async function poll() {
  if (!token) return
  try {
    const response = await fetch(HOST + '/nexlos/browser/bhost/poll?token=' + encodeURIComponent(token) + '&side=ext', { cache: 'no-store' })
    const data = await response.json()
    for (const item of data.items || []) await handle(item)
  } catch (error) { /* relay not ready yet */ }
}

async function handle(item) {
  if (item.kind === 'offer') {
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'tab capture for NexlOS' }).catch(() => {})
    chrome.runtime.sendMessage({ type: 'set-remote-offer', sdp: item.payload.sdp }).catch(() => {})
    return
  }
  if (item.kind === 'candidate') {
    chrome.runtime.sendMessage({ type: 'add-ice', candidate: item.payload }).catch(() => {})
    return
  }
  if (item.kind === 'command') {
    const command = item.payload || {}
    if (command.type === 'open') {
      const tab = await chrome.tabs.create({ url: command.url, active: true })
      state.tabId = tab.id
      try { await chrome.debugger.attach({ tabId: tab.id }, '1.3'); state.attached = true } catch (_error) {}
      chrome.runtime.sendMessage({ type: 'start-capture', tabId: tab.id }).catch(() => {})
      return
    }
    if (command.type === 'input' && state.attached && state.tabId) {
      const event = command.event || {}
      const method = event.type === 'wheel' ? 'Input.dispatchMouseEvent'
        : event.type === 'text' ? 'Input.insertText'
        : event.type === 'key' ? 'Input.dispatchKeyEvent'
        : 'Input.dispatchMouseEvent'
      try {
        if (method === 'Input.insertText') await chrome.debugger.sendCommand({ tabId: state.tabId }, method, { text: event.text || '' })
        else if (method === 'Input.dispatchKeyEvent') await chrome.debugger.sendCommand({ tabId: state.tabId }, method, { type: 'keyDown', key: event.key, code: event.code, text: event.text, modifiers: event.modifiers })
        else await chrome.debugger.sendCommand({ tabId: state.tabId }, method, { type: event.type === 'wheel' ? 'mouseWheel' : (event.type || 'mousePressed'), x: event.x || 0, y: event.y || 0, button: 'left', clickCount: 1, deltaX: event.deltaX || 0, deltaY: event.deltaY || 0 })
        if (method === 'Input.dispatchKeyEvent') await chrome.debugger.sendCommand({ tabId: state.tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp', key: event.key, code: event.code })
      } catch (_error) { /* tab may have closed */ }
      return
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'connect') {
    token = String(message.token || '')
    chrome.storage.local.set({ token })
    if (!pollTimer) pollTimer = setInterval(poll, 900)
    sendResponse({ ok: true })
    return
  }
  if (message.type === 'signal') {
    post('/nexlos/browser/bhost/ext?token=' + encodeURIComponent(token), message.payload).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }))
    return true
  }
  sendResponse({ ok: false })
})

chrome.storage.local.get(['token'], (value) => {
  if (value.token) { token = value.token; if (!pollTimer) pollTimer = setInterval(poll, 900) }
})
