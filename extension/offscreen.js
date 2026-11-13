let pc = null
let streamId = ''

async function post(kind, payload) {
  const token = await new Promise(resolve => chrome.storage.local.get(['token'], v => resolve(v.token || '')))
  await fetch('http://127.0.0.1:3080/nexlos/browser/bhost/ext?token=' + encodeURIComponent(token), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, payload }),
  })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'start-capture') {
    (async () => {
      try {
        const id = await new Promise((resolve, reject) => chrome.tabCapture.getMediaStreamId({ targetTabId: message.tabId }, value => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(value)))
        streamId = id
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id, maxWidth: 2560, maxHeight: 1600, maxFrameRate: 30 } },
        })
        pc = new RTCPeerConnection({ iceServers: [] })
        for (const track of stream.getTracks()) pc.addTrack(track, stream)
        pc.onicecandidate = event => { if (event.candidate) post('candidate', event.candidate.toJSON()) }
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        post('answer-offer', { sdp: offer.sdp, type: offer.type })
        sendResponse({ ok: true })
      } catch (error) { sendResponse({ ok: false, error: String(error && error.message || error) }) }
    })()
    return true
  }
  if (message.type === 'set-remote-offer') {
    (async () => {
      if (!pc) return sendResponse({ ok: false })
      await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      post('answer', { sdp: answer.sdp, type: answer.type })
      sendResponse({ ok: true })
    })()
    return true
  }
  if (message.type === 'add-ice') {
    if (pc && message.candidate) pc.addIceCandidate(message.candidate).catch(() => {})
    sendResponse({ ok: true })
  }
  sendResponse({ ok: false })
})

async function poll() {
  const token = await new Promise(resolve => chrome.storage.local.get(['token'], v => resolve(v.token || '')))
  if (!token) return
  try {
    const response = await fetch('http://127.0.0.1:3080/nexlos/browser/bhost/poll?token=' + encodeURIComponent(token) + '&side=ext', { cache: 'no-store' })
    const data = await response.json()
    for (const item of data.items || []) {
      if (item.kind === 'candidate') chrome.runtime.sendMessage({ type: 'add-ice', candidate: item.payload })
    }
  } catch (_error) {}
}
setInterval(poll, 900)
