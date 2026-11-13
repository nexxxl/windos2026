/* Plugin-side import bridge for the real NexlOS drawboard.
 * The original board.js is served byte-identical except for one method injected
 * at delivery time: SongBoard.importSvg(). This script watches a pending agent
 * drawing and feeds it into that method, so the user can continue hand-drawing
 * and press Save in the normal app.
 */
(function () {
  var consumed = false
  var polling = 0
  var importing = false

  function toast(text) {
    try {
      var el = document.getElementById('nexlos-toast')
      if (!el) return
      el.textContent = text
      el.classList.add('show')
      setTimeout(function () { el.classList.remove('show') }, 2600)
    } catch (_error) { /* optional */ }
  }

  function ready() {
    return window.SongBoard && typeof window.SongBoard.importSvg === 'function'
  }

  function canvasReady() {
    var canvas = document.querySelector('#sb-canvas')
    return !!(canvas && canvas.width > 10 && canvas.height > 10)
  }

  async function waitForCanvas() {
    for (var i = 0; i < 40; i += 1) {
      if (canvasReady()) return true
      try { if (window.SongBoard && typeof window.SongBoard.show === 'function') window.SongBoard.show() } catch (_error) { /* mounting */ }
      await new Promise(function (resolve) { setTimeout(resolve, 100) })
    }
    return canvasReady()
  }

  async function loadPending() {
    if (consumed || importing || !ready()) return
    importing = true
    try {
      var response = await fetch('/nexlos/draw/pending', { cache: 'no-store' })
      if (!response.ok) return
      var data = await response.json()
      if (!data || data.pending !== true || typeof data.svg !== 'string') return
      if (!(await waitForCanvas())) throw new Error('画布尚未就绪')
      try { window.SongBoard.show() } catch (_error) { /* already visible */ }
      await new Promise(function (resolve) { setTimeout(resolve, 120) })
      await window.SongBoard.importSvg(data.svg)
      consumed = true
      await fetch('/nexlos/draw/consumed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      toast('已载入 Agent 画稿 · 可继续手绘并保存')
    } catch (error) {
      toast('Agent 画稿载入失败：' + (error && error.message ? error.message : error))
    } finally {
      importing = false
    }
  }

  function start() {
    if (polling) return
    polling = setInterval(loadPending, 1200)
    setTimeout(loadPending, 200)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})();
