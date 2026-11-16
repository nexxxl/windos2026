/* NexlOS plugin-edition conversation popup.
 *
 * Opens a DSH session transcript as a floating NexlOS window instead of
 * navigating the user away from the desktop. The captain window is writable;
 * member windows are read-only snapshots. Data comes from the Host's
 * `/agent/conversation` route, which reads the durable Session log.
 */
(function () {
  'use strict';
  if (window.__nxChatPopup) return;

  var panel = null;
  var titleEl = null;
  var statusEl = null;
  var backBtn = null;
  var agentsEl = null;
  var bodyEl = null;
  var composer = null;
  var input = null;
  var mini = null;
  var current = null;
  var items = [];
  var agents = [];
  var running = false;
  var statusOpen = readFlag('nexlos.chat.status', true);
  var agentsSignature = '';
  var timer = 0;
  var inflight = null;
  var loading = false;
  var lastSignature = '';
  var busy = false;
  var drag = null;

  function $(tag, attrs) {
    var kids = Array.prototype.slice.call(arguments, 2);
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null || value === false) return;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2).toLowerCase(), value);
        else el.setAttribute(key, value === true ? '' : value);
      });
    }
    kids.flat(9).forEach(function (kid) {
      if (kid == null || kid === false) return;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    });
    return el;
  }

  function mark(edge) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    svg.setAttribute('width', String(edge || 16));
    svg.setAttribute('height', String(edge || 16));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('shape-rendering', 'crispEdges');
    [
      ['#EF4B23', 'M33.92,16 105.6,16 105.6,33.92 123.52,33.92 123.52,51.84 141.44,51.84 141.44,87.68 105.6,87.68 105.6,69.76 87.68,69.76 87.68,51.84 51.84,51.84 51.84,98.56 16,98.56 16,33.92 33.92,33.92Z'],
      ['#73B534', 'M240,33.92 240,105.6 222.08,105.6 222.08,123.52 204.16,123.52 204.16,141.44 168.32,141.44 168.32,105.6 186.24,105.6 186.24,87.68 204.16,87.68 204.16,51.84 157.44,51.84 157.44,16 222.08,16 222.08,33.92Z'],
      ['#F4D632', 'M222.08,240 150.4,240 150.4,222.08 132.48,222.08 132.48,204.16 114.56,204.16 114.56,168.32 150.4,168.32 150.4,186.24 168.32,186.24 168.32,204.16 204.16,204.16 204.16,157.44 240,157.44 240,222.08 222.08,222.08Z'],
      ['#438FD2', 'M16,222.08 16,150.4 33.92,150.4 33.92,132.48 51.84,132.48 51.84,114.56 87.68,114.56 87.68,150.4 69.76,150.4 69.76,168.32 51.84,168.32 51.84,204.16 98.56,204.16 98.56,240 33.92,240 33.92,222.08Z'],
    ].forEach(function (row) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', row[0]);
      path.setAttribute('d', row[1]);
      svg.append(path);
    });
    return svg;
  }

  function shortId(id) {
    return String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || '—';
  }

  function readFlag(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : raw === '1';
    } catch (error) {
      return fallback;
    }
  }

  function writeFlag(key, value) {
    try { localStorage.setItem(key, value ? '1' : '0'); } catch (error) { /* private mode */ }
  }

  var TOOL_LABELS = {
    bash: '运行命令', shell: '运行命令', read: '读取文件', read_file: '读取文件',
    write: '写入文件', write_file: '写入文件', edit: '修改文件', apply_patch: '修改文件',
    grep: '搜索内容', glob: '查找文件', ls: '列目录', web_search: '搜索网页',
    fetch: '抓取网页', task: '子任务', todo_write: '更新任务', image_gen: '生成图片',
  };

  function toolLabel(name) {
    return TOOL_LABELS[name] || name || '工具';
  }

  function formatElapsed(ms) {
    var value = Math.max(0, Number(ms) || 0);
    if (value < 1000) return value + 'ms';
    if (value < 60000) return (value / 1000).toFixed(value < 10000 ? 1 : 0) + 's';
    var mins = Math.floor(value / 60000);
    var secs = Math.round((value % 60000) / 1000);
    return mins + 'm' + (secs ? ' ' + secs + 's' : '');
  }

  function currentAction(agent) {
    var now = agent.current || {};
    if (now.kind === 'tool') return toolLabel(now.name) + (now.text ? ' · ' + String(now.text).replace(/\s+/gu, ' ').slice(0, 60) : '');
    if (now.kind === 'thinking') return '思考中';
    if (now.kind === 'message') return String(now.text || '').replace(/\s+/gu, ' ').slice(0, 60);
    if (agent.status === 'running') return '工作中';
    if (agent.ended || agent.status === 'done') return '已交付';
    return '空闲';
  }

  function nearBottom() {
    return !bodyEl || bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight < 90;
  }

  function agentsSignatureOf() {
    if (!agents.length) return '0:' + (running ? '1' : '0') + ':' + (statusOpen ? '1' : '0');
    return agents.map(function (agent) {
      var now = agent.current || {};
      return [agent.id, agent.status, agent.steps, agent.label, now.kind, now.text, now.name].join(':');
    }).join('|') + ':' + (statusOpen ? '1' : '0');
  }

  function toggleStatus() {
    statusOpen = !statusOpen;
    writeFlag('nexlos.chat.status', statusOpen);
    agentsSignature = '';
    renderAgents();
  }

  function openAgent(agent) {
    if (!agent || !agent.id) return;
    open({
      sessionId: agent.id,
      title: agent.label || '子代理',
      canWrite: false,
      parentSessionId: current ? current.sessionId : '',
    });
  }

  /* 状态弹窗：队长这一轮里，每个子代理此刻在做什么。
     一行一个成员，点开就是那个成员的真实会话（只读）。 */
  function renderAgents() {
    if (!statusEl || !agentsEl) return;
    var live = agents.filter(function (agent) { return agent.status === 'running'; }).length;
    if (agents.length === 0) {
      statusEl.textContent = running ? '运行中' : '已就绪';
      statusEl.className = 'nxch-state' + (running ? ' is-live' : '');
      statusEl.setAttribute('aria-expanded', 'false');
    } else {
      statusEl.textContent = (live ? live + '/' : '') + agents.length + ' 子代理';
      statusEl.className = 'nxch-state is-agents' + (live ? ' is-live' : '');
      statusEl.setAttribute('aria-expanded', statusOpen ? 'true' : 'false');
    }
    var signature = agentsSignatureOf();
    if (signature === agentsSignature) {
      agentsEl.hidden = agents.length === 0 || !statusOpen;
      return;
    }
    agentsSignature = signature;
    agentsEl.hidden = agents.length === 0 || !statusOpen;
    agentsEl.replaceChildren();
    if (agents.length === 0) return;

    var head = $('div', { class: 'nxch-agents-head' },
      $('b', {}, '子代理 ' + agents.length),
      $('span', { class: 'nxch-agents-count' }, live ? live + ' 个在跑' : '全部结束'));
    agentsEl.append(head);

    agents.slice().sort(function (a, b) {
      var rank = function (agent) { return agent.status === 'running' ? 0 : 1; };
      return rank(a) - rank(b) || (b.startedAt || 0) - (a.startedAt || 0);
    }).forEach(function (agent) {
      var now = agent.current || {};
      var dotClass = agent.status === 'running'
        ? ' is-running'
        : (agent.ended || agent.status === 'done' ? ' is-done' : ' is-idle');
      var meta = agent.status === 'running' ? formatElapsed(agent.elapsedMs) : (agent.steps ? agent.steps + ' 步' : '');
      agentsEl.append($('button', {
        class: 'nxch-agent' + dotClass, type: 'button',
        title: agent.status === 'running' ? '点开看它正在做什么' : '打开该子代理会话',
        onclick: function () { openAgent(agent); },
      },
        $('i', { class: 'nxch-agent-dot', 'aria-hidden': 'true' }),
        $('span', { class: 'nxch-agent-main' },
          $('span', { class: 'nxch-agent-label' }, agent.label || ('子代理 · ' + shortId(agent.id))),
          $('span', { class: 'nxch-agent-action' }, currentAction(agent))),
        $('span', { class: 'nxch-agent-meta' }, meta || (now.kind === 'tool' ? '工具中' : '')),
      ));
    });
  }

  function renderItems() {
    if (!bodyEl) return;
    var stick = nearBottom();
    bodyEl.replaceChildren();
    if (items.length === 0) {
      bodyEl.append($('div', { class: 'nxch-empty' }, '正在读取会话…'));
      return;
    }
    var shown = items.slice(-140);
    shown.forEach(function (item) {
      if (item.role === 'user') {
        bodyEl.append($('div', { class: 'nxch-msg is-user' }, [
          $('div', { class: 'nxch-bubble' }, item.text || ''),
        ]));
        return;
      }
      if (item.role === 'assistant') {
        bodyEl.append($('div', { class: 'nxch-msg is-agent' }, [
          $('div', { class: 'nxch-who' }, current && current.canWrite ? '队长 / Harness' : '成员 / Harness'),
          $('div', { class: 'nxch-bubble' }, item.text || ''),
        ]));
        return;
      }
      var call = $('div', { class: 'nxch-tool' + (item.ok === false ? ' is-failed' : '') },
        $('span', { class: 'nxch-tool-mark' }, item.ok === false ? '×' : '›'),
        $('span', { class: 'nxch-tool-name' }, item.name || 'tool'),
        item.arguments ? $('span', { class: 'nxch-tool-args' }, String(item.arguments).replace(/\s+/gu, ' ').slice(0, 120)) : null,
      );
      if (item.text) {
        var out = $('pre', { class: 'nxch-tool-out', hidden: true }, String(item.text).slice(0, 4000));
        call.append(out);
        call.addEventListener('click', function () { out.hidden = !out.hidden; });
        call.classList.add('is-expandable');
      }
      bodyEl.append(call);
    });
    if (stick) bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  async function load() {
    if (!current || !current.sessionId || loading) return;
    if (!panel || panel.hidden || document.hidden) return;
    loading = true;
    var controller = new AbortController();
    inflight = controller;
    try {
      var response = await fetch('/agent/conversation?sessionId=' + encodeURIComponent(current.sessionId) + '&title=' + encodeURIComponent(current.title || ''), { cache: 'no-store', signal: controller.signal });
      var data = await response.json().catch(function () { return null; });
      if (!response.ok || !data || data.ok !== true) throw new Error(data && data.error ? data.error : 'HTTP ' + response.status);
      items = Array.isArray(data.items) ? data.items : [];
      agents = Array.isArray(data.agents) ? data.agents : [];
      running = data.running === true;
      if (data.title && !current.title) current.title = data.title;
      var lastSeq = items.length ? (items[items.length - 1].seq || 0) : 0;
      var signature = (running ? '1' : '0') + ':' + items.length + ':' + lastSeq;
      if (signature !== lastSignature) {
        lastSignature = signature;
        titleEl.textContent = current.title || data.title || 'DSH 会话';
        renderItems();
        if (mini) mini.title = (current.title || 'DSH 会话') + (running ? ' · 运行中' : '');
      }
      renderAgents();
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (bodyEl && items.length === 0) bodyEl.replaceChildren($('div', { class: 'nxch-empty' }, '读取会话失败：' + (error.message || String(error))));
    } finally {
      if (inflight === controller) inflight = null;
      loading = false;
      schedule();
    }
  }

  function schedule(delay) {
    if (timer) { window.clearTimeout(timer); timer = 0; }
    if (!current || !panel || panel.hidden || document.hidden) return;
    timer = window.setTimeout(function () { timer = 0; void load(); }, delay === undefined ? (running ? 1200 : 2500) : delay);
  }

  async function send() {
    if (!current || !current.canWrite || busy) return;
    var text = input.value.trim();
    if (text === '') return;
    busy = true;
    input.value = '';
    input.disabled = true;
    items.push({ role: 'user', text: text });
    renderItems();
    try {
      var response = await fetch('/agent/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: current.sessionId, text: text }),
      });
      var data = await response.json().catch(function () { return null; });
      if (!response.ok || !data || data.ok !== true) throw new Error(data && data.error ? data.error : 'HTTP ' + response.status);
      await load();
    } catch (error) {
      if (bodyEl) bodyEl.append($('div', { class: 'nxch-error' }, '发送失败：' + (error.message || String(error))));
    } finally {
      busy = false;
      input.disabled = false;
      input.focus();
    }
  }

  function place() {
    if (!panel) return;
    var width = Math.min(560, window.innerWidth - 28);
    var height = Math.min(Math.round(window.innerHeight * 0.64), 620);
    panel.style.width = width + 'px';
    panel.style.height = height + 'px';
    if (!panel.style.left) {
      panel.style.left = Math.round((window.innerWidth - width) / 2) + 'px';
      panel.style.top = Math.round((window.innerHeight - height) / 2 - 18) + 'px';
    }
  }

  function build() {
    var os = document.querySelector('.os') || document.body;
    panel = $('section', { class: 'nxch-panel', role: 'dialog', 'aria-label': 'DSH 会话', hidden: true });
    titleEl = $('b', { class: 'nxch-title' }, 'DSH 会话');
    statusEl = $('button', {
      class: 'nxch-state', type: 'button', 'aria-expanded': 'false',
      title: '展开子代理状态', onclick: toggleStatus,
    }, '连接中');
    agentsEl = $('div', { class: 'nxch-agents', hidden: true });
    // 子代理会话是只读的；返回键放在标题栏，叶子成员也能一步回到队长。
    backBtn = $('button', {
      class: 'nxch-back', type: 'button', title: '回到上一级会话', 'aria-label': '返回上一级', hidden: true,
      onclick: function () {
        if (!current || !current.parentSessionId) return;
        open({ sessionId: current.parentSessionId, title: '', canWrite: true });
      },
    }, '←');
    var head = $('header', { class: 'nxch-head' },
      $('span', { class: 'nxch-mark' }, mark(17)),
      $('div', { class: 'nxch-titles' }, [
        titleEl,
        $('span', { class: 'nxch-sub' }, '真实 DSH 会话 · 会话内容来自 Harness'),
      ]),
      backBtn,
      statusEl,
      $('button', { class: 'nxch-btn', type: 'button', title: '收起到左侧小条', 'aria-label': '收起', onclick: minimize }, '–'),
      $('button', { class: 'nxch-btn', type: 'button', title: '关闭', 'aria-label': '关闭', onclick: close }, '×'),
    );
    bodyEl = $('div', { class: 'nxch-body' });
    input = $('input', {
      class: 'nxch-input', type: 'text', placeholder: '继续对队长说话，Enter 发送',
      onkeydown: function (event) {
        if (event.key === 'Enter') { event.preventDefault(); void send(); }
        if (event.key === 'Escape') close();
      },
    });
    composer = $('div', { class: 'nxch-composer' },
      input,
      $('button', { class: 'nxch-send', type: 'button', onclick: function () { void send(); } }, '发送'));
    panel.append(head, agentsEl, bodyEl, composer);
    os.append(panel);

    mini = $('button', { class: 'nxch-mini', type: 'button', hidden: true },
      mark(13),
      $('span', { class: 'nxch-mini-title' }, 'DSH 会话'),
      $('i', { class: 'nxch-mini-dot' }));
    mini.addEventListener('click', restore);
    os.append(mini);

    head.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || event.target.closest('button')) return;
      var rect = panel.getBoundingClientRect();
      drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      try { head.setPointerCapture(event.pointerId); } catch (error) { /* older engines */ }
    });
    head.addEventListener('pointermove', function (event) {
      if (!drag) return;
      var left = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, event.clientX - drag.dx));
      var top = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, event.clientY - drag.dy));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
    });
    head.addEventListener('pointerup', function (event) {
      drag = null;
      try { head.releasePointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    });
    window.addEventListener('resize', place);
  }

  function minimize() {
    if (!panel) return;
    if (timer) { window.clearTimeout(timer); timer = 0; }
    if (inflight !== null) { try { inflight.abort(); } catch (_error) { /* already done */ } inflight = null; }
    panel.hidden = true;
    if (mini) {
      mini.hidden = false;
      mini.querySelector('.nxch-mini-title').textContent = (current && current.title) || 'DSH 会话';
      mini.querySelector('.nxch-mini-dot').className = 'nxch-mini-dot' + (running ? ' is-live' : '');
    }
  }

  function restore() {
    if (!panel) return;
    panel.hidden = false;
    if (mini) mini.hidden = true;
    place();
    void load();
    if (input && current && current.canWrite) setTimeout(function () { input.focus(); }, 40);
  }

  function close() {
    if (panel) panel.hidden = true;
    if (mini) mini.hidden = true;
    if (timer) window.clearTimeout(timer);
    timer = 0;
    if (inflight !== null) { try { inflight.abort(); } catch (_error) { /* already done */ } inflight = null; }
    current = null;
    items = [];
    agents = [];
    agentsSignature = '';
    lastSignature = '';
    if (agentsEl) { agentsEl.hidden = true; agentsEl.replaceChildren(); }
  }

  function open(options) {
    if (!options || typeof options.sessionId !== 'string' || options.sessionId === '') return;
    if (!panel) build();
    var same = current && current.sessionId === options.sessionId;
    current = {
      sessionId: options.sessionId,
      title: options.title || '',
      canWrite: options.canWrite === true,
      parentSessionId: options.parentSessionId || '',
    };
    if (!same) {
      items = [];
      agents = [];
      agentsSignature = '';
      lastSignature = '';
      bodyEl.replaceChildren($('div', { class: 'nxch-empty' }, '正在读取会话…'));
      if (agentsEl) { agentsEl.hidden = true; agentsEl.replaceChildren(); }
    }
    titleEl.textContent = current.title || 'DSH 会话';
    if (backBtn) backBtn.hidden = !current.parentSessionId;
    statusEl.textContent = '连接中';
    statusEl.className = 'nxch-state';
    composer.hidden = !current.canWrite;
    input.placeholder = current.canWrite ? '继续对队长说话，Enter 发送' : '成员会话由队长调度（只读）';
    panel.hidden = false;
    if (mini) mini.hidden = true;
    place();
    void load();
    schedule(0);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (timer) { window.clearTimeout(timer); timer = 0; }
    } else if (current && panel && !panel.hidden) {
      void load();
    }
  });
  window.__nxChatPopup = { open: open, minimize: minimize, close: close };
})();
