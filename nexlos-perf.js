/* NexlOS plugin-edition multi-window performance guard.
 * With several app windows open, heavy CSS animation and backdrop filters are
 * the first thing to degrade compositor frame rate. Toggle a lite class so the
 * desktop stays responsive while windows remain fully functional. */
(function () {
  var style = document.createElement('style')
  style.textContent = [
    '.os.nx-perf-lite * { animation-duration: 0.001s !important; animation-iteration-count: 1 !important; transition-duration: 0.04s !important; }',
    '.os.nx-perf-lite .os-window, .os.nx-perf-lite .os-agentspace, .os.nx-perf-lite .os-tb, .os.nx-perf-lite .os-start { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }',
    '.os.nx-perf-lite .os-window { box-shadow: 0 6px 18px rgba(15,20,30,.16) !important; contain: layout style paint; }',
    // Compositor-only windowing: while a window is dragged, its iframe must
    // not take part in cross-process hit testing; non-active windows are
    // contained so their internal layout changes cannot dirty the desktop.
    '.os-window.dragging iframe { pointer-events: none !important; }',
    '.os-window:not(.active) { contain: layout style paint; }',
  ].join('\n')
  document.head.append(style)
  var root = document.querySelector('.os')
  function apply() {
    if (!root) return
    var windows = document.querySelectorAll('.os-window').length
    root.classList.toggle('nx-perf-lite', windows > 2)
  }
  var timer = 0
  var observer = new MutationObserver(function () {
    clearTimeout(timer)
    timer = setTimeout(apply, 300)
  })
  function start() {
    root = document.querySelector('.os')
    if (!root) return
    apply()
    observer.observe(document.body, { childList: true, subtree: true })
  }
  setTimeout(start, 1200)
  document.addEventListener('DOMContentLoaded', start)
})()
