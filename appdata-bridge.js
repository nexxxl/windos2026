/* Parent-side broker for sandboxed generated apps.
 * The app stays opaque-origin (no parent DOM, no real localStorage), but gets a
 * capability-checked storage API via postMessage. Data is stored by the Host in
 * home/apps/<id>/data.json so uninstall removes it with the app directory.
 */
(function () {
  if (window.__nexlosAppDataBridge) return
  window.__nexlosAppDataBridge = true

  function appIdFor(source) {
    var frames = document.querySelectorAll('iframe')
    for (var i = 0; i < frames.length; i += 1) {
      var frame = frames[i]
      if (frame.contentWindow !== source) continue
      var src = frame.getAttribute('src') || ''
      var hit = /\/a\/generated\/([a-z0-9][a-z0-9-]{2,63})\//u.exec(src)
      if (!hit) hit = /\/app\/([a-z0-9][a-z0-9-]{2,63})\//u.exec(src)
      if (hit) return hit[1]
    }
    return ''
  }

  window.addEventListener('message', async (event) => {
    var data = event.data
    if (!data || data.__nexlAppData !== true || typeof data.requestId !== 'string') return
    var id = appIdFor(event.source)
    if (id === '') return
    try {
      var response = await fetch('/agent/appdata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          op: String(data.op || ''),
          key: data.key === undefined ? undefined : String(data.key),
          value: data.value,
        }),
      })
      var payload = await response.json().catch(() => null)
      event.source.postMessage({
        __nexlAppDataResult: true,
        requestId: data.requestId,
        ok: !!(payload && payload.ok),
        value: payload ? payload.value : undefined,
        error: payload && payload.error ? payload.error : '',
      }, '*')
    } catch (error) {
      try {
        event.source.postMessage({
          __nexlAppDataResult: true,
          requestId: data.requestId,
          ok: false,
          error: error && error.message ? error.message : String(error),
        }, '*')
      } catch (_error) { /* source gone */ }
    }
  })
})()
