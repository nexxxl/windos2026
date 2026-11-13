/* DSH workbench bridge rendered inside the NexlOS state console.
 * Real sessions/workspaces come from the DSH client session list via
 * postMessage; this script only presents them and asks the shell to open one.
 */
(function () {
  let data = null
  let lastSignature = ''
  let styleInjected = false

  function injectStyle() {
    if (styleInjected) return
    styleInjected = true
    const style = document.createElement('style')
    style.textContent = `
      /* Router/plugin CSS hides the stock expanded console. The workbench is
         the reason the console now has content, so restore it for this build. */
      .os-agentspace.expanded .os-console{display:flex!important}
      .os-agentspace .os-space-expand{display:inline-flex!important}
      .os-console-pane > .nx-dsh-panel ~ .os-console-error,
      .os-console-pane > .nx-dsh-panel ~ .os-console-empty{display:none!important}
      .nx-dsh-panel{border:1px solid rgba(30,45,70,.13);border-radius:11px;background:rgba(255,255,255,.62);padding:10px 11px;margin-bottom:10px}
      .nx-dsh-compact{border:1px solid rgba(30,45,70,.12);border-radius:10px;background:rgba(255,255,255,.6);padding:7px 8px;margin:0 0 8px}
      .os-agentspace.expanded .nx-dsh-compact{display:none}
      .nx-dsh-compact-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px}
      .nx-dsh-compact-title{font-size:9px;font-weight:700;letter-spacing:.08em;color:#566274;text-transform:uppercase}
      .nx-dsh-compact-count{font-size:8px;color:#8a94a3}
      .nx-dsh-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
      .nx-dsh-title{font-size:10px;font-weight:700;letter-spacing:.08em;color:#5f6a7a;text-transform:uppercase}
      .nx-dsh-badge{font-size:8px;color:#1d6f4e;background:#dff2e8;border-radius:99px;padding:2px 6px}
      .nx-dsh-group{font-size:10px;font-weight:700;color:#1d2430;margin:8px 0 4px}
      .nx-dsh-where{font-size:8.5px;color:#8a94a3;margin-left:5px;font-weight:400}
      .nx-dsh-row{display:flex;align-items:center;gap:7px;width:100%;border:0;background:transparent;text-align:left;border-radius:7px;padding:5px 5px;cursor:pointer;font:inherit;color:#1d2430}
      .nx-dsh-row:hover{background:rgba(0,120,212,.09)}
      .nx-dsh-dot{width:6px;height:6px;border-radius:50%;background:#37a06b;flex:none}
      .nx-dsh-row .nx-dsh-name{font-size:10.5px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
      .nx-dsh-row .nx-dsh-age{font-size:8.5px;color:#8a94a3;flex:none}
      .nx-dsh-empty{font-size:10px;color:#8a94a3;padding:7px 2px}
      .os.dark .nx-dsh-panel{background:rgba(255,255,255,.05);border-color:rgba(160,190,225,.16)}
      .os.dark .nx-dsh-title,.os.dark .nx-dsh-group,.os.dark .nx-dsh-row{color:#e7eef8}
      .os.dark .nx-dsh-row:hover{background:rgba(255,255,255,.08)}
    `
    document.head.append(style)
  }

  function age(value) {
    if (!value) return ''
    const time = new Date(value).getTime()
    if (!Number.isFinite(time)) return ''
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000))
    if (seconds < 60) return '刚刚'
    if (seconds < 3600) return Math.round(seconds / 60) + ' 分钟'
    if (seconds < 86400) return Math.round(seconds / 3600) + ' 小时'
    return Math.round(seconds / 86400) + ' 天'
  }

  function openSession(id) {
    try { window.parent.postMessage({ type: 'nexlos.open-session', sessionId: id }, location.origin) } catch (_error) { /* no parent */ }
  }

  function row(session) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'nx-dsh-row'
    button.title = session.cwd || session.id
    const dot = document.createElement('span')
    dot.className = 'nx-dsh-dot'
    const name = document.createElement('span')
    name.className = 'nx-dsh-name'
    name.textContent = session.title || session.id
    const time = document.createElement('span')
    time.className = 'nx-dsh-age'
    time.textContent = age(session.updatedAt || session.createdAt)
    button.append(dot, name, time)
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openSession(session.id) })
    return button
  }

  function section(title, sessions, where) {
    const wrap = document.createElement('div')
    wrap.className = 'nx-dsh-panel'
    const head = document.createElement('div')
    head.className = 'nx-dsh-head'
    const label = document.createElement('span')
    label.className = 'nx-dsh-title'
    label.textContent = title
    const badge = document.createElement('span')
    badge.className = 'nx-dsh-badge'
    badge.textContent = 'DSH LIVE'
    head.append(label, badge)
    wrap.append(head)
    if (where) {
      const group = document.createElement('div')
      group.className = 'nx-dsh-group'
      group.append(document.createTextNode(where))
      wrap.append(group)
    }
    if (!sessions || sessions.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'nx-dsh-empty'
      empty.textContent = '还没有 DSH 会话；在 DSH 里新建任务后会出现在这里。'
      wrap.append(empty)
      return wrap
    }
    for (const session of sessions.slice(0, 7)) wrap.append(row(session))
    return wrap
  }

  function groupsPanel(groups) {
    const wrap = document.createElement('div')
    wrap.className = 'nx-dsh-panel'
    const head = document.createElement('div')
    head.className = 'nx-dsh-head'
    const label = document.createElement('span')
    label.className = 'nx-dsh-title'
    label.textContent = 'DSH 工作台'
    const badge = document.createElement('span')
    badge.className = 'nx-dsh-badge'
    badge.textContent = 'DSH LIVE'
    head.append(label, badge)
    wrap.append(head)
    if (!groups || groups.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'nx-dsh-empty'
      empty.textContent = '还没有 DSH 工作区；在 DSH 里跑一次任务后会出现在这里。'
      wrap.append(empty)
      return wrap
    }
    let rendered = 0
    for (const group of groups) {
      if (rendered >= 9) break
      const groupEl = document.createElement('div')
      groupEl.className = 'nx-dsh-group'
      groupEl.append(document.createTextNode(group.label || group.cwd || '未分组'))
      if (group.cwd) {
        const where = document.createElement('span')
        where.className = 'nx-dsh-where'
        where.textContent = group.cwd
        groupEl.append(where)
      }
      wrap.append(groupEl)
      for (const session of (group.sessions || []).slice(0, 4)) {
        if (rendered >= 9) break
        wrap.append(row(session))
        rendered += 1
      }
    }
    return wrap
  }

  function renderCompact() {
    const space = document.querySelector('.os-agentspace')
    if (!space || !data) return
    const compact = space.querySelector('.os-space-compact')
    if (!compact) return
    const expanded = space.classList.contains('expanded')
    const existing = compact.querySelector('.nx-dsh-compact')
    if (expanded) { existing?.remove(); return }
    const signature = JSON.stringify((data.sessions || []).slice(0, 3).map(s => [s.id, s.title, s.cwd, s.updatedAt]))
    if (existing && existing.dataset.signature === signature) return
    existing?.remove()
    const card = document.createElement('div')
    card.className = 'nx-dsh-compact'
    card.dataset.signature = signature
    const head = document.createElement('div')
    head.className = 'nx-dsh-compact-head'
    const title = document.createElement('span')
    title.className = 'nx-dsh-compact-title'
    title.textContent = 'DSH 工作台'
    const count = document.createElement('span')
    count.className = 'nx-dsh-compact-count'
    count.textContent = (data.sessions || []).length + ' 个会话'
    head.append(title, count)
    card.append(head)
    const sessions = (data.sessions || []).slice(0, 3)
    if (sessions.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'nx-dsh-empty'
      empty.textContent = '还没有会话'
      card.append(empty)
    } else for (const session of sessions) card.append(row(session))
    compact.insertBefore(card, compact.firstChild)
  }

  function spaceVisible() {
    const space = document.querySelector('.os-agentspace')
    if (!space) return false
    if (space.getAttribute('aria-hidden') === 'true') return false
    if (!space.classList.contains('open')) return false
    const rect = space.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  function render() {
    if (!spaceVisible()) return
    injectStyle()
    renderCompact()
    const pane = document.querySelector('.os-console-pane')
    if (!pane) return
    const active = document.querySelector('.os-rail-btn.is-active')
    const tab = active ? active.getAttribute('data-tab') : ''
    if (tab !== 'task' && tab !== 'workspace') return
    const signature = JSON.stringify({ tab, data: data && data.sessions ? data.sessions.slice(0, 30).map(item => [item.id, item.title, item.cwd, item.updatedAt]) : [] })
    const existing = pane.querySelector('.nx-dsh-panel')
    if (existing && signature === lastSignature) return
    lastSignature = signature
    for (const node of pane.querySelectorAll('.nx-dsh-panel')) node.remove()
    if (!data) {
      pane.prepend(section('DSH 工作台', [], ''))
      return
    }
    if (tab === 'workspace') pane.prepend(groupsPanel(data.workspaces || []))
    else pane.prepend(section('DSH 最近会话', data.sessions || [], ''))
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return
    const message = event.data
    if (!message || message.type !== 'nexlos.dsh-workbench' || !message.data) return
    data = message.data
    lastSignature = ''
    render()
  })

  function request() {
    try { window.parent.postMessage({ type: 'nexlos.dsh-workbench.request' }, location.origin) } catch (_error) { /* no parent */ }
  }

  setTimeout(() => { if (!spaceVisible()) return; request(); render(); }, 700)
  setInterval(() => {
    if (!spaceVisible() || document.hidden) return
    request()
    render()
  }, 2600)
  const observer = new MutationObserver(() => {
    if (!spaceVisible()) return
    request()
    render()
  })
  function observe() {
    const space = document.querySelector('.os-agentspace')
    if (space) observer.observe(space, { attributes: true, attributeFilter: ['class', 'aria-hidden'] })
  }
  document.addEventListener('click', (event) => {
    if (!event.target || !event.target.closest || !event.target.closest('.os-rail-btn')) return
    setTimeout(() => { if (spaceVisible()) { request(); render(); } }, 0)
  }, true)
  document.addEventListener('DOMContentLoaded', observe)
  setTimeout(() => { observe(); if (spaceVisible()) { request(); render(); } }, 700)
})()
