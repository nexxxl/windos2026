/* Attach an agent-created PTY as a real tab in the visible NexlOS terminal.
 * sessionStorage is shared by same-origin iframes in this tab, so the terminal
 * app's normal restore path can pick up the pending session after reload.
 */
(function () {
  if (!/^#\/term(?:$|[?&/])/u.test(location.hash)) return
  var busy = false
  function recordOf(data) {
    var key = 'nexlos.term.sessions.v3'
    var saved = null
    try { saved = JSON.parse(sessionStorage.getItem(key) || 'null') } catch (_error) { saved = null }
    if (!saved || !Array.isArray(saved.tabs)) saved = { activeTab: 0, tabs: [] }
    var maxTab = 0
    var maxSession = 0
    for (var tab of saved.tabs) {
      maxTab = Math.max(maxTab, Number(tab.key) || 0)
      var leaves = []
      ;(function walk(node) {
        if (!node) return
        if (node.t === 'leaf') { leaves.push(node.s); return }
        for (var child of node.c || []) walk(child)
      })(tab.tree)
      for (var leaf of leaves) maxSession = Math.max(maxSession, Number(leaf && leaf.key) || 0)
    }
    if (saved.tabs.some(function (tab) {
      return !!(tab.tree && tab.tree.s && tab.tree.s.sessionId === data.id)
    })) return false
    var tabKey = maxTab + 1
    var sessionKey = maxSession + 1
    saved.tabs.push({
      key: tabKey,
      active: sessionKey,
      tree: { t: 'leaf', s: {
        key: sessionKey, title: data.title || 'Agent 终端', cwd: data.cwd || '',
        next: 0, sessionId: data.id, token: data.token,
      } },
    })
    saved.activeTab = tabKey
    try { sessionStorage.setItem(key, JSON.stringify(saved)) } catch (_error) { return false }
    return true
  }
  async function poll() {
    if (busy) return
    busy = true
    try {
      var response = await fetch('/nexlos/terminal/pending', { cache: 'no-store' })
      if (!response.ok) return
      var data = await response.json()
      if (!data || data.pending !== true || !data.session || !data.session.id) return
      if (!recordOf(data.session)) return
      await fetch('/nexlos/terminal/consumed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      location.reload()
    } catch (_error) {
      /* terminal app may not be mounted yet */
    } finally {
      busy = false
    }
  }
  setTimeout(poll, 250)
  setInterval(poll, 1400)
})();
