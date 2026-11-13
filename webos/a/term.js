import { t } from './i18n.js';
import { h, clear, api } from './can.js';
import { icon } from './icons.js';

// 宿主终端：窗口里的每个 shell 会话都跑在“跑着 nexlos 的那台机器”上，不在浏览器沙箱里。
// 一个窗口可以开多个会话（标签切换），每个会话是一条独立 PTY：
//   - 输出走 SSE（base64 帧，避免 UTF-8 被切半）；
//   - 输入走 term.input，尺寸走 term.resize，关闭走 term.close。
// xterm.js 4.19 以 vendor 形式随二进制分发（MIT），Chrome 72 也能跑。

const FONT = '"SF Mono", "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';
const THEME = {
  background: '#0c0c0c',
  foreground: '#e8e8e8',
  cursor: '#ffffff',
  cursorAccent: '#0c0c0c',
  selection: '#264f78',
  black: '#0c0c0c',
  red: '#e74856',
  green: '#16c60c',
  yellow: '#f9f1a5',
  blue: '#3b78ff',
  magenta: '#b4009e',
  cyan: '#61d6d6',
  white: '#cccccc',
  brightBlack: '#767676',
  brightRed: '#ff6b6b',
  brightGreen: '#5ffb5f',
  brightYellow: '#fff36b',
  brightBlue: '#6ea8ff',
  brightMagenta: '#ff5cd6',
  brightCyan: '#9ffcfc',
  brightWhite: '#ffffff',
};

function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function strToB64(s) {
  // 先按 UTF-8 编码再转 base64：中文与 emoji 不会在 JSON 里被拆坏。
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  const step = 0x2000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

export function mountTerm(host) {
  const tabsEl = h('div', { class: 'tm-tabs', role: 'tablist', 'aria-label': '终端会话' });
  const actionsEl = h('div', { class: 'tm-actions' });
  const shellEl = h('b', { class: 'tm-shell' }, '终端');
  const barEl = h('div', { class: 'tm-bar' },
    h('span', { class: 'tm-bar-ic' }, icon('term')),
    h('span', { class: 'tm-bar-title' }, shellEl),
    tabsEl,
    actionsEl);
  const statusEl = h('span', { class: 'tm-status-text' }, '准备中…');
  const metaEl = h('span', { class: 'tm-meta' }, '');
  const bodyEl = h('div', { class: 'tm-body' });
  const fallbackEl = h('div', { class: 'tm-fallback', hidden: true });
  const frame = h('div', { class: 'tm' }, barEl, bodyEl, fallbackEl,
    h('footer', { class: 'tm-foot' },
      h('span', { class: 'tm-dot' }),
      statusEl,
      metaEl));
  host.append(frame);

  // 设置里的主题只影响工具条；控制台本身保持深色，像 Win10 的 conhost。
  function applyPrefs(p) {
    p = p || {};
    if (p.theme) frame.classList.toggle('tm-dark', p.theme === 'dark');
  }
  function onPrefsMessage(e) {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'nexlos.settings') applyPrefs(e.data.patch);
  }
  window.addEventListener('message', onPrefsMessage);
  api('settings.get').then((r) => applyPrefs(r.detail || {})).catch(() => {});

  const sessions = [];
  const tabs = [];
  let activeTab = null;
  let tabSeq = 0;
  let active = null;
  let seq = 0;
  let info = null;
  let disposed = false;

  // 会话记录放 sessionStorage：刷新或切到别的应用再回来，接回同一条 PTY。
  // 应用重启时内核里的会话已经没了，term.status 探测失败就自动开新 shell。
  // v3 起一个标签保存整棵布局树（i3 式嵌套分栏），旧格式读入时折成单行分栏。
  const STORE_KEY = 'nexlos.term.sessions.v3';
  const LEGACY_KEYS = ['nexlos.term.sessions.v2', 'nexlos.term.sessions.v1'];
  let saveTimer = 0;

  // ---------- 布局树 ----------
  // 与 i3 的容器模型一致：split 节点按方向排孩子，孩子可以是叶子（一条 PTY）
  // 或另一个 split。权重 w 是 flex-grow，拖动分隔条只改相邻两个权重。
  let nodeSeq = 0;

  function newLeaf(s) {
    return { t: 'leaf', id: ++nodeSeq, s };
  }

  function newSplit(dir, children, weights) {
    return {
      t: 'split', id: ++nodeSeq, dir,
      c: children,
      w: (weights || children.map(() => 1)).slice(),
    };
  }

  function leavesOf(node, out) {
    out = out || [];
    if (!node) return out;
    if (node.t === 'leaf') {
      if (node.s) out.push(node.s);
      return out;
    }
    for (const c of node.c) leavesOf(c, out);
    return out;
  }

  function firstLeaf(node) {
    let n = node;
    while (n && n.t !== 'leaf') n = n.c[0];
    return n ? n.s : null;
  }

  function findLeafNode(node, s) {
    if (!node) return null;
    if (node.t === 'leaf') return node.s === s ? node : null;
    for (const c of node.c) {
      const hit = findLeafNode(c, s);
      if (hit) return hit;
    }
    return null;
  }

  // 返回 { parent, index }：定位某个节点在父容器里的位置。
  function findParent(node, target) {
    if (!node || node.t === 'leaf') return null;
    for (let i = 0; i < node.c.length; i += 1) {
      if (node.c[i] === target) return { parent: node, index: i };
      const hit = findParent(node.c[i], target);
      if (hit) return hit;
    }
    return null;
  }

  function syncPanes(tb) {
    tb.panes = leavesOf(tb.root);
    if (tb.active && tb.panes.indexOf(tb.active) < 0) tb.active = tb.panes[0] || null;
    if (!tb.active) tb.active = tb.panes[0] || null;
  }

  function sessionRecord(s) {
    return {
      key: s.key, title: s.title, cwd: s.cwd, next: s.next || 0,
      sessionId: s.sessionId || '', token: s.token || '',
    };
  }

  function treeRecord(node) {
    if (!node) return null;
    if (node.t === 'leaf') return { t: 'leaf', s: sessionRecord(node.s) };
    return {
      t: 'split', dir: node.dir,
      w: node.w.slice(),
      c: node.c.map(treeRecord).filter(Boolean),
    };
  }

  // 旧版平铺 panes 折成一排分栏，读进来就能参与新的拖拽和嵌套。
  function panesTree(panes) {
    const items = (panes || []).map((p) => ({ t: 'leaf', s: p }));
    if (!items.length) return null;
    if (items.length === 1) return items[0];
    return { t: 'split', dir: 'row', w: items.map(() => 1), c: items };
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    try {
      if (!tabs.length) {
        sessionStorage.removeItem(STORE_KEY);
        return;
      }
      const rec = {
        activeTab: activeTab ? activeTab.key : 0,
        tabs: tabs.map((tb) => ({
          key: tb.key,
          active: tb.active ? tb.active.key : 0,
          tree: treeRecord(tb.root),
        })),
      };
      sessionStorage.setItem(STORE_KEY, JSON.stringify(rec));
    } catch (e) { /* 隐私模式不拦使用 */ }
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(saveNow, 800);
  }

  function loadSaved() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) {
        const rec = JSON.parse(raw);
        if (rec && Array.isArray(rec.tabs) && rec.tabs.length) return rec;
      }
      for (const key of LEGACY_KEYS) {
        const legacy = sessionStorage.getItem(key);
        if (!legacy) continue;
        const old = JSON.parse(legacy);
        if (!old) continue;
        // v2：{ activeTab, tabs: [{ key, active, panes: [...] }] }
        if (Array.isArray(old.tabs)) {
          const mapped = old.tabs.map((tb) => ({
            key: tb.key,
            active: tb.active,
            tree: panesTree(tb.panes || []),
          })).filter((tb) => tb.tree);
          if (mapped.length) return { activeTab: old.activeTab, tabs: mapped };
        }
        // v1：{ sessions: [...] }，每条会话补成一个单 pane 标签。
        if (Array.isArray(old.sessions) && old.sessions.length) {
          return {
            activeTab: 1,
            tabs: old.sessions.map((s, i) => ({
              key: i + 1,
              active: s.key || i + 1,
              tree: { t: 'leaf', s },
            })),
          };
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function status(text, kind) {
    statusEl.textContent = text;
    frame.dataset.state = kind || 'ok';
  }

  function setSessionStatus(s, text, kind) {
    s.status = text;
    s.kind = kind || 'ok';
    if (s === active) {
      status(text, kind);
      metaEl.textContent = s.cwd || '';
      metaEl.title = s.cwd || '';
    }
  }

  function showFallback(title, detail) {
    clear(fallbackEl);
    fallbackEl.hidden = false;
    bodyEl.hidden = true;
    fallbackEl.append(
      h('div', { class: 'tm-fail-ic' }, icon('term')),
      h('b', {}, title),
      h('p', {}, detail),
      h('button', { class: 'tm-btn', type: 'button', onclick: () => { fallbackEl.hidden = true; bodyEl.hidden = false; newTab(); } }, '重试'));
    status('未启动', 'off');
  }

  async function ensureInfo() {
    if (info) return info;
    const r = await api('term.info');
    info = r.detail || {};
    if (!info.enabled) throw new Error('服务端设置了 NEXLOS_TERM=0。去掉后重启 nexlos。');
    if (!info.pty) throw new Error(`宿主平台：${info.platform || '未知'}。终端目前支持 macOS 与 Linux。`);
    if (!window.Terminal || !window.FitAddon) throw new Error('xterm.js 没有随页面加载，检查 /a/vendor/xterm.js。');
    return info;
  }

  // ---------- 单个会话的渲染与 PTY ----------

  function renderTabs() {
    clear(tabsEl);
    for (const tb of tabs) {
      const cur = tb.active || tb.panes[0];
      const label = h('span', { class: 'tm-tab-label' }, (cur && cur.title) || 'shell');
      const close = h('button', {
        class: 'tm-tab-x', type: 'button', title: '关闭这个标签（含分栏）',
        onclick: (e) => { e.stopPropagation(); closeTab(tb); },
      }, '×');
      const tab = h('button', {
        class: 'tm-tab' + (tb === activeTab ? ' active' : ''),
        type: 'button', role: 'tab', 'aria-selected': tb === activeTab ? 'true' : 'false',
        title: (cur && cur.cwd) || (cur && cur.title) || '',
        onclick: () => activateTab(tb),
      }, label,
      tb.panes.length > 1 ? h('span', { class: 'tm-tab-n', title: `${tb.panes.length} 个分栏` }, String(tb.panes.length)) : null,
      close);
      tabsEl.append(tab);
    }
    tabsEl.append(h('button', {
      class: 'tm-tab tm-tab-add', type: 'button', title: '新建标签（⌘T）',
      onclick: () => newTab(),
    }, '+'));
  }

  const PANE_MAX = 8;

  function paintActions(s) {
    clear(actionsEl);
    // 工具条跟随当前分栏；data-pane 方便自动化确认按钮在操作哪一块。
    actionsEl.dataset.pane = s ? String(s.key) : '';
    const full = !activeTab || activeTab.panes.length >= PANE_MAX;
    actionsEl.append(
      h('button', { class: 'tm-btn', type: 'button', title: '清屏', onclick: () => { if (s && s.term) s.term.clear(); } }, '清屏'),
      h('button', {
        class: 'tm-btn', type: 'button', title: '左右分栏（⌘D）',
        disabled: full ? true : null,
        onclick: () => splitPane('row'),
      }, '分栏'),
      h('button', {
        class: 'tm-btn', type: 'button', title: '上下分屏（⌘⇧D）',
        disabled: full ? true : null,
        onclick: () => splitPane('col'),
      }, '横分'),
      h('button', {
        class: 'tm-btn', type: 'button', title: '关闭当前分栏（⌘W）',
        onclick: () => { if (s) closePane(s); },
      }, '关闭'),
      h('button', { class: 'tm-btn', type: 'button', title: '结束当前会话并新开一个', onclick: () => restart(s) }, '重启'));
  }

  function activateTab(tb) {
    if (!tb || disposed) return;
    activeTab = tb;
    for (const other of tabs) {
      if (other.paneEl) other.paneEl.hidden = other !== tb;
    }
    // 隐藏标签的分栏不再上屏，GL 上下文先还回去，避免多标签把上下文额度吃光。
    for (const s of sessions) {
      if (s.tab !== tb) detachGl(s);
    }
    activatePane(tb.active || tb.panes[0] || null);
    // 整棵标签重新量一遍：隐藏期间宽高都是 0，切回来每个分栏都要重排。
    fitTab(tb);
    // 多路流跟着标签走：新标签的会话加入，旧标签的会话退订。
    scheduleMux(0);
  }

  function activatePane(s) {
    if (!s) return;
    active = s;
    s.focusAt = Date.now(); // GL 上下文超额时按最近聚焦顺序回收
    if (s.tab) {
      s.tab.active = s;
      activeTab = s.tab;
    }
    for (const other of sessions) {
      if (other.el) other.el.classList.toggle('focused', other === s);
    }
    renderTabs();
    paintActions(s);
    status(s.status || '已连接', s.kind || 'ok');
    metaEl.textContent = s.cwd || '';
    metaEl.title = s.cwd || '';
    // 隐藏时 fit 会量到 0，切回来再量一次；分栏后两块都要重新量。
    requestAnimationFrame(() => {
      if (disposed || s !== active) return;
      fitSession(s);
      if (s.term) s.term.focus();
    });
    window.__nexlosTerm = s.term || null;
    scheduleSave();
  }

  function fitSession(s) {
    if (!s || !s.fit) return;
    try { s.fit.fit(); } catch (e) { return; }
    // 分栏变小后不再值得占一个 GL 上下文，及时还回去（聚焦栏除外）。
    if (s.gl && (s.term.cols || 0) * (s.term.rows || 0) < GL_MIN_CELLS && s !== active) detachGl(s);
    attachGl(s);
    sendResize(s);
  }

  function flushInput(s) {
    s.inputTimer = 0;
    if (!s.pending || !s.sessionId) return;
    const data = s.pending;
    s.pending = '';
    api('term.input', {
      method: 'POST',
      fields: { id: s.sessionId, token: s.token, data: strToB64(data) },
    }).catch((e) => setSessionStatus(s, `写入失败：${e.message}`, 'err'));
  }

  function queueInput(s, data) {
    s.pending += data;
    if (s.inputTimer) return;
    s.inputTimer = setTimeout(() => flushInput(s), 8);
  }

  function sendResize(s) {
    if (!s || !s.sessionId || !s.term || s.exited) return;
    api('term.resize', {
      method: 'POST',
      fields: { id: s.sessionId, token: s.token, cols: s.term.cols, rows: s.term.rows },
    }).catch(() => {});
  }

  // 所有分栏共用一条 SSE：浏览器对同一 host 只给 6 条 HTTP/1.1 连接，
  // 每个分栏一条会在第 5 个分栏后把输入、尺寸和状态请求全部饿死。
  let mux = null;
  let muxTimer = 0;

  function b64url(s) {
    return strToB64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function closeMux() {
    if (mux && mux.es) {
      try { mux.es.close(); } catch (e) { /* ignore */ }
    }
    mux = null;
  }

  function muxSpec() {
    // 只订阅当前标签：隐藏标签的输出留在内核缓冲里，切回来再按 since 续上。
    // 每栏给 128 KiB 追赶上限，避免切回一个跑了很久的标签时一次性灌进几百 KB。
    const spec = [];
    for (const s of sessions) {
      if (!s.sessionId || !s.token) continue;
      if (activeTab && s.tab !== activeTab) continue;
      spec.push({ id: s.sessionId, token: s.token, since: s.next || 0, tail: 131072 });
    }
    return spec;
  }

  function scheduleMux(wait) {
    if (disposed) return;
    clearTimeout(muxTimer);
    muxTimer = setTimeout(connectMux, wait == null ? 25 : wait);
  }

  // 分栏按帧轮转：一帧只让有限几块 xterm 重绘，避免 6–8 张 canvas 同时脏。
  // 数据先按会话排队，帧预算到了再一次性 write；当前分栏每帧优先。
  const inbox = new Map();
  let pumpFrame = 0;
  let pumpTurn = 0;

  let pumpTimer = 0;
  // 帧预算按毫秒算，再按实测解析成本换算成字节：写死 8 KiB/帧时单栏吞吐被锁在
  // 0.5 MB/s，写死 256 KiB/帧又会在慢机器上吃掉整帧。目标是把解析控制在
  // PUMP_BUDGET_MS 内，掉帧就砍、有余量就涨（AIMD）。
  const PUMP_MIN_BYTES = 8192;
  const PUMP_MAX_BYTES = 131072;
  const PUMP_BUDGET_MS = 5;
  const PUMP_PANES_PER_FRAME = 3;
  let pumpBytes = 32768;        // 当前每帧总预算
  let pumpCost = 0.00004;       // ms/byte，指数平均（初值 25 MB/s）
  let pumpBusy = false;         // 上一帧排完还有积压：此刻的帧间隔才算掉帧
  let lastPumpAt = 0;
  let gapEma = 16.7;            // 帧间隔指数平均
  let refreshMs = 16.7;         // 刷新周期，启动时用前几帧最小间隔估计
  let refreshProbe = [];
  window.__muxStats = { frames: 0, bytes: 0 };
  window.__pumpStats = { frames: 0, flushes: 0, bytes: 0, spentMs: 0, maxFrameBytes: 0,
    maxSpentMs: 0, budgetBytes: pumpBytes, gapMs: 16.7, refreshMs: 16.7, acked: 0 };
  // 输出背压：xterm 解析完一包才回执，内核按未回执字节数暂停读 PTY。
  function bumpAck(s, n) {
    s.ackBytes = (s.ackBytes || 0) + n;
    window.__pumpStats.acked += n;
    if (s.ackBytes > 262144) {
      if (s.ackTimer) { clearTimeout(s.ackTimer); s.ackTimer = 0; }
      flushAck(s);
      return;
    }
    if (!s.ackTimer) s.ackTimer = setTimeout(() => { s.ackTimer = 0; flushAck(s); }, 200);
  }

  function flushAck(s) {
    const n = s.ackBytes || 0;
    if (!n || !s.sessionId) return;
    s.ackBytes = 0;
    api('term.ack', { method: 'POST', fields: { id: s.sessionId, token: s.token, bytes: n } })
      .catch(() => { /* 回执失败只影响背压窗口，下一包还会再报 */ });
  }

  // 帧预算控制：掉帧优先砍字节，解析超预算再砍，连续有余量才慢涨。
  function tunePump(gap, spent, bytes, inflight) {
    if (gap > 0) {
      if (refreshProbe.length < 90) {
        refreshProbe.push(gap);
        if (refreshProbe.length === 30 || refreshProbe.length === 90) {
          const sorted = refreshProbe.slice().sort((a, b) => a - b);
          refreshMs = Math.min(16.7, Math.max(6, sorted[Math.floor(sorted.length * 0.25)]));
          window.__pumpStats.refreshMs = Math.round(refreshMs * 10) / 10;
        }
      }
      gapEma = gapEma * 0.85 + gap * 0.15;
    }
    if (bytes > 0) pumpCost = pumpCost * 0.75 + (spent / bytes) * 0.25;
    const target = Math.min(PUMP_MAX_BYTES, Math.max(PUMP_MIN_BYTES, PUMP_BUDGET_MS / pumpCost));
    let next = pumpBytes;
    if (gapEma > refreshMs * 1.6) next = pumpBytes * 0.6;
    else if (spent > PUMP_BUDGET_MS) next = pumpBytes * 0.8;
    else if (inflight < pumpBytes * 1.5 && spent < PUMP_BUDGET_MS * 0.7) {
      // 没在掉帧就加码：gap 落在 refresh 的 1.15–1.6 倍之间只小步加，
      // 真正满帧才加大步。只在 gap 很小时才涨会让预算卡在谷底再也不回升。
      const step = gapEma < refreshMs * 1.15 ? 1.12 : 1.05;
      next = Math.min(pumpBytes * step, Math.max(pumpBytes, target));
    }
    pumpBytes = Math.min(PUMP_MAX_BYTES, Math.max(PUMP_MIN_BYTES, next));
    window.__pumpStats.budgetBytes = Math.round(pumpBytes);
    window.__pumpStats.gapMs = Math.round(gapEma * 10) / 10;
  }

  function schedulePump() {
    if (pumpFrame || pumpTimer || disposed) return;
    pumpFrame = requestAnimationFrame(pumpOutput);
    // rAF 被系统降频时（窗口被盖住）也要继续排空，否则输出会堵在内存里。
    pumpTimer = setTimeout(() => {
      pumpTimer = 0;
      if (pumpFrame) { cancelAnimationFrame(pumpFrame); pumpFrame = 0; }
      pumpOutput();
    }, 34);
  }

  function enqueueOutput(s, bytes) {
    let q = inbox.get(s.key);
    if (!q) { q = { chunks: [], bytes: 0 }; inbox.set(s.key, q); }
    q.chunks.push(bytes);
    q.bytes += bytes.length;
    // 极端洪水（yes 之类）下不能无限堆内存：超预算就丢最旧的整块，并补一个
    // 颜色/光标重置，避免被截断的转义序列污染后续显示。
    if (q.bytes > 4194304) {
      while (q.bytes > 3145728 && q.chunks.length > 1) {
        q.bytes -= q.chunks.shift().length;
      }
      q.chunks.unshift(new Uint8Array([0x1b, 0x5b, 0x30, 0x6d]));
      q.bytes += 4;
    }
    schedulePump();
  }

  // 从队列头取不超过 max 字节；不足一块就整块拿走，避免每次都拼接整个积压。
  function takeBytes(q, max) {
    const parts = [];
    let taken = 0;
    while (q.chunks.length && taken < max) {
      const head = q.chunks[0];
      const need = max - taken;
      if (head.length <= need) {
        parts.push(head);
        taken += head.length;
        q.chunks.shift();
      } else {
        parts.push(head.subarray(0, need));
        q.chunks[0] = head.subarray(need);
        taken += need;
      }
    }
    q.bytes -= taken;
    if (parts.length === 1) return parts[0];
    const out = new Uint8Array(taken);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  function pumpOutput() {
    if (pumpFrame) { cancelAnimationFrame(pumpFrame); pumpFrame = 0; }
    if (pumpTimer) { clearTimeout(pumpTimer); pumpTimer = 0; }
    if (disposed) return;
    const live = new Set(sessions.map((s) => s.key));
    for (const key of inbox.keys()) {
      if (!live.has(key)) inbox.delete(key);
    }
    const now = performance.now();
    // 只有上一帧结束时队列还没排空（追赶状态），帧间隔才反映真实帧率；
    // 空闲后第一帧的间隔是等数据的时长，当成掉帧会把预算一路砍到底。
    const gap = (lastPumpAt && pumpBusy) ? now - lastPumpAt : 0;
    lastPumpAt = now;
    const started = now;
    let budget = Math.max(1024, Math.round(pumpBytes));
    let frameBytes = 0;
    // 当前分栏优先，保证交互回显不排在其它栏后面；其余字节在后台分栏里轮转。
    const writePane = (s, max) => {
      const q = inbox.get(s.key);
      if (!q || !q.chunks.length || budget <= 0) return 0;
      const bytes = takeBytes(q, Math.min(max, budget));
      if (s.term) {
        // 解析完才回执：内核按未确认字节数暂停读 PTY，慢机器上只放慢、不丢输出。
        s.inflight = (s.inflight || 0) + bytes.length;
        s.term.write(bytes, () => {
          s.inflight -= bytes.length;
          bumpAck(s, bytes.length);
        });
      }
      window.__pumpStats.flushes += 1;
      window.__pumpStats.bytes += bytes.length;
      budget -= bytes.length;
      frameBytes += bytes.length;
      return bytes.length;
    };
    const rest = sessions.filter((s) => s !== active && inbox.has(s.key));
    if (active && inbox.has(active.key)) {
      // 只有当前分栏有活时整帧预算都给它；多栏竞争时给它一半，其余轮转。
      writePane(active, rest.length ? Math.max(PUMP_MIN_BYTES, budget * 0.5) : budget);
    }
    let served = 0;
    const perPane = Math.max(PUMP_MIN_BYTES, Math.round(budget / Math.max(1, PUMP_PANES_PER_FRAME - 1)));
    for (let i = 0; i < rest.length && served < PUMP_PANES_PER_FRAME - 1 && budget > 0; i += 1) {
      const s = rest[(pumpTurn + i) % rest.length];
      if (writePane(s, perPane) > 0) served += 1;
    }
    pumpTurn = (pumpTurn + Math.max(1, served)) % Math.max(1, rest.length);
    if (frameBytes > window.__pumpStats.maxFrameBytes) window.__pumpStats.maxFrameBytes = frameBytes;
    window.__pumpStats.frames += 1;
    const spent = performance.now() - started;
    window.__pumpStats.spentMs += spent;
    if (spent > window.__pumpStats.maxSpentMs) window.__pumpStats.maxSpentMs = spent;
    let inflight = 0;
    for (const s of sessions) inflight += s.inflight || 0;
    window.__pumpStats.inflight = inflight;
    tunePump(gap, spent, frameBytes, inflight);
    for (const [key, q] of inbox) {
      if (!q.chunks.length && q.bytes <= 0) inbox.delete(key);
    }
    pumpBusy = inbox.size > 0;
    if (pumpBusy) schedulePump();
  }

  function connectMux() {
    muxTimer = 0;
    if (disposed) return;
    const spec = muxSpec();
    // 规格为空只是「当前没有该订阅的栏」，不要顺手拆掉已有连接：
    // 切标签的一瞬间会短暂为空，一拆就再没人把它接回来（输出永久停住）。
    if (!spec.length) {
      if (!mux) scheduleMux(400);
      return;
    }
    closeMux();
    const es = new EventSource(`/tm?q=${b64url(JSON.stringify(spec))}`);
    mux = { es };
    es.addEventListener('out', (ev) => {
      let d = null;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      const s = sessions.find((x) => x.sessionId === d.id);
      if (!s) return;
      if (typeof d.next === 'number') s.next = d.next;
      if (d.data && s.term) {
        // xterm 自己处理 UTF-8，这里交字节而不是先解码成字符串。
        window.__muxStats.frames += 1;
        window.__muxStats.bytes += d.data.length;
        enqueueOutput(s, b64ToBytes(d.data));
      }
      scheduleSave();
      // 会话恢复时输出可能先到、xterm 实例后建；此时没有 cols 可读。
      if (s === active && s.term && Date.now() >= copiedUntil) {
        status(`已连接 · ${s.term.cols}×${s.term.rows}`, 'ok');
      }
    });
    es.addEventListener('exit', (ev) => {
      let d = null;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      const s = sessions.find((x) => x.sessionId === d.id);
      if (!s || s.exited) return;
      s.exited = true;
      const code = d.code || 0;
      if (s.term) {
        s.term.write(`\r\n\u001b[90m[${t(`进程已退出（代码 ${code}）`)} · ${t('重新打开 shell')}]\u001b[0m\r\n`);
      }
      setSessionStatus(s, `进程已退出（代码 ${code}）`, 'off');
      s.title = `${s.title} (${code})`;
      renderTabs();
    });
    es.onerror = () => {
      if (disposed) return;
      closeMux();
      if (active) setSessionStatus(active, '连接中断，正在重连…', 'warn');
      // 规格临时为空（切标签、会话重建）也要继续探，直接 return 会让流永久断掉。
      scheduleMux(muxSpec().length ? 1200 : 400);
    };
  }

  function ensureTerm(s) {
    if (s.term) return;
    s.term = new window.Terminal({
      fontFamily: FONT,
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 3000,
      theme: THEME,
      allowTransparency: false,
    });
    s.fit = new window.FitAddon.FitAddon();
    s.term.loadAddon(s.fit);
    s.term.open(s.xtermEl);
    s.term.onData((data) => queueInput(s, data));
    s.term.onTitleChange((title) => {
      if (!title) return;
      s.title = title;
      renderTabs();
      scheduleSave();
    });
    if (s === active) window.__nexlosTerm = s.term;
  }

  // WebGL 渲染器：一栏一个 GL 上下文，贵且有限（WebKit 同页上限 ~16，每个上下文
  // 还带一份字形图集，8 栏一起上会明显抬高 WindowServer 的合成开销）。
  // 实测结论：单栏 WebGL 比 canvas 快 20–25%、WebContent 少 8 个点；
  // 3 栏打平；8 个 13 列的小栏反而略慢。所以按「面积 + 数量」分级，
  // 小栏留在 canvas 上，超预算就挤掉最久没聚焦的那一栏。
  const GL_LIMIT = 4;
  const GL_MIN_CELLS = 400; // 小于 20×20 的分栏不值得开上下文
  let glLive = 0;

  // 显式交还 GPU 上下文用的调试计数：切标签/收栏会反复装配渲染器。
  let glReleased = 0;

  function detachGl(s) {
    if (!s || !s.gl) return;
    const addon = s.gl;
    s.gl = null;
    glLive = Math.max(0, glLive - 1);
    // addon-webgl 0.12 的 dispose 只摘掉 canvas，不释放 WebGL2 上下文（xterm #6068）。
    // 反复切标签 / 切空间会把浏览器 ~16 个上下文额度用光，之后浏览器按“最旧”淘汰
    // 仍然活着的分栏，表现成别的栏花屏或空白。这里用 WEBGL_lose_context 让驱动立刻回收。
    addon._nexlosDetach = true; // 主动丢弃，别走“GPU 上下文丢失”的告警与退避
    try {
      const gl = addon._renderer && addon._renderer._gl;
      const ext = gl && gl.getExtension('WEBGL_lose_context');
      if (ext) { ext.loseContext(); glReleased += 1; }
    } catch (e) { /* 上下文已经丢了就算了 */ }
    // 0.19 及更早的 addon 不会停掉光标闪烁定时器，它会把已销毁的 Terminal 和整屏回滚
    // 缓冲一直拖住（xterm #5817，Tabby 也是这么绕的）。先手动停，再 dispose。
    try { addon._renderer && addon._renderer._cursorBlinkStateManager && addon._renderer._cursorBlinkStateManager.dispose(); } catch (e) { /* ignore */ }
    try { addon.dispose(); } catch (e) { /* 已经释放过 */ }
  }

  function detachAllGl() {
    for (const s of sessions) detachGl(s);
  }

  function attachGl(s) {
    if (disposed || !s || !s.term || s.gl) return false;
    if (!window.WebglAddon || !window.WebglAddon.WebglAddon) return false;
    if (Date.now() < (s.glRetryAt || 0)) return false;
    if (s.tab !== activeTab || !s.el || s.el.hidden) return false;
    // 尺寸为 0 时装配会拿到错误的字符尺寸，等 fit 之后再挂。
    if (!s.term.element || !s.term.element.clientWidth || s.term.cols < 2) return false;
    const cells = (s.term.cols || 0) * (s.term.rows || 0);
    if (cells < GL_MIN_CELLS && s !== active) return false;
    if (glLive >= GL_LIMIT) {
      // 挤掉最久没聚焦的那一栏：聚焦栏的交互体验优先级最高。
      let victim = null;
      for (const o of sessions) {
        if (!o.gl || o === s) continue;
        if (!victim || (o.focusAt || 0) < (victim.focusAt || 0)) victim = o;
      }
      if (!victim) return false;
      detachGl(victim);
    }
    let addon = null;
    try {
      addon = new window.WebglAddon.WebglAddon();
      addon.onContextLoss(() => {
        if (addon._nexlosDetach) return; // 我们主动释放的，不是真故障
        if (s.gl === addon) { s.gl = null; glLive = Math.max(0, glLive - 1); }
        try { addon.dispose(); } catch (e) { /* ignore */ }
        s.glRetryAt = Date.now() + 5000;
        setSessionStatus(s, 'GPU 上下文丢失，已切回兼容渲染', 'warn');
      });
      s.term.loadAddon(addon);
      s.gl = addon;
      glLive += 1;
      return true;
    } catch (e) {
      try { if (addon) addon.dispose(); } catch (e2) { /* ignore */ }
      // 没有 WebGL2 / 显存不足：这一栏就一直走 canvas 渲染器。
      s.glRetryAt = Date.now() + 30000;
      return false;
    }
  }

  // 全屏 TUI（grok / codebuddy / opencode / vim）靠 SIGWINCH 重画：
  // 恢复窗口后先缩一行再恢复，让它在新的 xterm 里重新铺满。
  function nudgeRedraw(s) {
    if (disposed || !s || !s.term || !s.sessionId) return;
    const cols = s.term.cols;
    const rows = Math.max(2, s.term.rows - 1);
    api('term.resize', { method: 'POST', fields: { id: s.sessionId, token: s.token, cols, rows } })
      .then(() => setTimeout(() => { if (!disposed) sendResize(s); }, 80))
      .catch(() => {});
  }

  async function bootSession(s) {
    setSessionStatus(s, '正在启动宿主 shell…', 'warn');
    let d = null;
    try {
      d = await ensureInfo();
    } catch (e) {
      showFallback('终端不可用', e.message);
      return;
    }
    s.title = (d.shell || 'shell').split('/').pop();
    renderTabs();
    ensureTerm(s);
    if (s === active) fitSession(s);
    try {
      const r = await api('term.open', {
        method: 'POST',
        fields: { cols: (s.term && s.term.cols) || 100, rows: (s.term && s.term.rows) || 30 },
      });
      s.sessionId = r.detail.id;
      s.token = r.detail.token;
      if (r.detail.cwd) s.cwd = r.detail.cwd;
      scheduleMux();
      setSessionStatus(s, `已连接 · ${s.term.cols}×${s.term.rows}`, 'ok');
      renderTabs();
      scheduleSave();
      if (s === active) {
        window.__nexlosTerm = s.term;
        fitSession(s);
        s.term.focus();
      }
    } catch (e) {
      setSessionStatus(s, 'shell 启动失败', 'err');
      showFallback('shell 启动失败', e.message);
    }
  }

  // 探活后接回旧 PTY：内核还留着输出缓冲，按增量续上。
  async function attachSaved(s) {
    try {
      await ensureInfo();
    } catch (e) {
      showFallback('终端不可用', e.message);
      return;
    }
    ensureTerm(s);
    if (s === active) fitSession(s);
    let d = null;
    try {
      const r = await api('term.status', {
        method: 'POST',
        fields: { id: s.sessionId, token: s.token },
      });
      d = r.detail || {};
    } catch (e) {
      d = null; // 内核换了或会话被回收
    }
    if (!d) {
      s.sessionId = '';
      s.token = '';
      s.next = 0;
      await bootSession(s);
      return;
    }
    // 新 xterm 是白屏：回放最后 64 KB 作为上下文，再往后就是增量。
    const total = Number(d.total) || 0;
    const start = Number(d.start) || 0;
    s.next = Math.max(start, total - 64 * 1024);
    scheduleMux();
    setSessionStatus(s, d.closed ? `已恢复（进程已退出，代码 ${d.exitCode || 0}）` : '已恢复会话', d.closed ? 'off' : 'ok');
    if (s === active && s.term) window.__nexlosTerm = s.term;
    if (!d.closed) setTimeout(() => nudgeRedraw(s), 120);
    scheduleSave();
  }

  function makeSession(title, key) {
    const n = key && key > 0 ? key : ++seq;
    seq = Math.max(seq, n);
    const s = {
      key: n,
      title: title || `shell ${n}`,
      cwd: '',
      status: '准备中…',
      kind: 'warn',
      next: 0,
      pending: '',
      inputTimer: 0,
      exited: false,
      sessionId: '',
      token: '',
      term: null,
      fit: null,
      tab: null,
      xtermEl: h('div', { class: 'tm-xterm' }),
    };
    s.el = h('div', { class: 'tm-sess', hidden: true }, s.xtermEl);
    // 点进哪一块，⌘W / ⌘D / 状态栏就跟哪一块走。
    s.el.addEventListener('mousedown', () => {
      if (!disposed && active !== s) activatePane(s);
    }, true);
    // 选中即复制：xterm 先处理鼠标事件，冒泡到这里时选区已经定下来。
    s.el.addEventListener('mouseup', () => {
      if (disposed || !s.term) return;
      const text = s.term.getSelection();
      if (text) copyText(text);
    });
    sessions.push(s);
    return s;
  }

  function makeTab(key) {
    const n = key && key > 0 ? key : ++tabSeq;
    tabSeq = Math.max(tabSeq, n);
    const tb = {
      key: n,
      root: null,
      panes: [],
      active: null,
      paneEl: h('div', { class: 'tm-panes', hidden: true }),
    };
    bodyEl.append(tb.paneEl);
    tabs.push(tb);
    return tb;
  }

  // ---------- 布局渲染 ----------

  function setGrow(el, w) {
    el.style.flex = `${Math.max(0.0001, w)} 1 0px`;
  }

  function refreshSession(s) {
    if (!s || !s.term) return;
    try { s.term.refresh(0, Math.max(0, s.term.rows - 1)); } catch (e) { /* ignore */ }
  }

  function fitNode(node) {
    for (const s of leavesOf(node)) {
      fitSession(s);
      refreshSession(s);
    }
  }

  // 分隔条拖动：只改相邻两个权重，不重建 DOM，拖动过程中不触发 fit。
  function attachSplitterDrag(tb, node, i, childA, childB, elA, elB, sp) {
    const horizontal = node.dir === 'row';
    sp.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const ra = elA.getBoundingClientRect();
      const rb = elB.getBoundingClientRect();
      const pair = horizontal ? ra.width + rb.width : ra.height + rb.height;
      if (pair < 8) return;
      const startPos = horizontal ? e.clientX : e.clientY;
      const sum = node.w[i] + node.w[i + 1];
      const ratio0 = node.w[i] / sum;
      frame.classList.add('tm-resizing');
      const onMove = (ev) => {
        const cur = horizontal ? ev.clientX : ev.clientY;
        const ratio = Math.min(0.92, Math.max(0.08, ratio0 + (cur - startPos) / pair));
        node.w[i] = sum * ratio;
        node.w[i + 1] = sum * (1 - ratio);
        setGrow(elA, node.w[i]);
        setGrow(elB, node.w[i + 1]);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
        frame.classList.remove('tm-resizing');
        fitNode(childA);
        fitNode(childB);
        scheduleSave();
      };
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    });
    sp.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const sum = node.w[i] + node.w[i + 1];
      node.w[i] = sum / 2;
      node.w[i + 1] = sum / 2;
      setGrow(elA, node.w[i]);
      setGrow(elB, node.w[i + 1]);
      fitTab(tb);
      scheduleSave();
    });
  }

  function buildNode(tb, node) {
    if (node.t === 'leaf') {
      node.s.el.hidden = false;
      return node.s.el;
    }
    const box = h('div', { class: 'tm-node tm-' + node.dir });
    const els = node.c.map((child) => buildNode(tb, child));
    for (let i = 0; i < els.length; i += 1) {
      setGrow(els[i], node.w[i] || 1);
      box.append(els[i]);
      if (i < els.length - 1) {
        const sp = h('div', { class: 'tm-splitter ' + node.dir, title: '拖动调整比例，双击平分' });
        box.append(sp);
        attachSplitterDrag(tb, node, i, node.c[i], node.c[i + 1], els[i], els[i + 1], sp);
      }
    }
    return box;
  }

  function renderTree(tb) {
    if (!tb || !tb.paneEl) return;
    clear(tb.paneEl);
    if (tb.root) tb.paneEl.append(buildNode(tb, tb.root));
  }

  function attachPane(tb, s, dir) {
    s.tab = tb;
    const leaf = newLeaf(s);
    if (!tb.root) {
      tb.root = leaf;
    } else {
      const base = (tb.active && findLeafNode(tb.root, tb.active))
        || findLeafNode(tb.root, firstLeaf(tb.root));
      const loc = base ? findParent(tb.root, base) : null;
      if (loc && loc.parent.dir === dir) {
        // i3 行为：同方向容器里追加为兄弟，新窗口分到与现有窗口相近的份额。
        const ws = loc.parent.w;
        const avg = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : 1;
        loc.parent.c.splice(loc.index + 1, 0, leaf);
        loc.parent.w.splice(loc.index + 1, 0, avg);
      } else {
        const merged = newSplit(dir, [base || tb.root, leaf]);
        if (loc) loc.parent.c[loc.index] = merged;
        else tb.root = merged;
      }
    }
    syncPanes(tb);
  }

  function replaceNode(tb, oldNode, newNode) {
    if (tb.root === oldNode) { tb.root = newNode; return; }
    const loc = findParent(tb.root, oldNode);
    if (loc) loc.parent.c[loc.index] = newNode;
  }

  function fitTab(tb) {
    if (!tb) return;
    requestAnimationFrame(() => {
      for (const s of leavesOf(tb.root)) {
        fitSession(s);
        refreshSession(s);
      }
    });
  }

  async function newTab() {
    if (disposed) return;
    const tb = makeTab();
    const s = makeSession();
    attachPane(tb, s, 'row');
    renderTree(tb);
    activateTab(tb);
    await bootSession(s);
  }

  // 首次进入的默认工作台：左栏一个 shell，右栏上下两个，和 i3 默认开三个 xterm 一致。
  async function newWorkspace() {
    if (disposed) return;
    const tb = makeTab();
    const a = makeSession();
    const b = makeSession();
    const c = makeSession();
    tb.root = newSplit('row', [newLeaf(a), newSplit('col', [newLeaf(b), newLeaf(c)])], [1, 1]);
    for (const s of [a, b, c]) s.tab = tb;
    syncPanes(tb);
    tb.active = a;
    renderTree(tb);
    activateTab(tb);
    await Promise.all([a, b, c].map((s) => bootSession(s)));
    fitTab(tb);
    scheduleSave();
  }

  async function splitPane(dir) {
    if (disposed || !activeTab) return;
    const tb = activeTab;
    if (tb.panes.length >= PANE_MAX) {
      status(`一个标签最多 ${PANE_MAX} 个分栏`, 'warn');
      return;
    }
    const s = makeSession();
    attachPane(tb, s, dir || 'row');
    activatePane(s);
    renderTree(tb);
    fitTab(tb);
    await bootSession(s);
    fitTab(tb);
    scheduleSave();
  }

  // 显式关闭才结束 PTY；切应用/刷新走的是 destroy 的保留路径。
  function detachSession(s) {
    clearTimeout(s.inputTimer);
    flushInput(s);
    if (s.sessionId) {
      fetch('/c/term.close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.sessionId, token: s.token }),
        keepalive: true,
      }).catch(() => {});
      s.sessionId = '';
      scheduleMux(40); // 重连时把这路会话从多路流里摘掉
    }
    detachGl(s); // 终端销毁会连带释放 GL 上下文，先把计数还回去
    if (s.term) { try { s.term.dispose(); } catch (e) { /* ignore */ } s.term = null; }
    if (s.el) s.el.remove();
  }

  function closePane(s) {
    const i = sessions.indexOf(s);
    if (i < 0) return;
    const tb = s.tab;
    const node = tb ? findLeafNode(tb.root, s) : null;
    detachSession(s);
    sessions.splice(i, 1);
    if (!tb) { scheduleSave(); return; }
    if (!node) { syncPanes(tb); renderTabs(); return; }
    const loc = findParent(tb.root, node);
    if (!loc) {
      // 最后一个分栏：整棵标签一起收掉。
      tb.root = null;
      syncPanes(tb);
      closeTab(tb, true);
      return;
    }
    const parent = loc.parent;
    // 关闭后焦点落到原位置的右邻，没有右邻就落到左邻，和 i3 一致。
    const sibling = parent.c[loc.index + 1] || parent.c[loc.index - 1];
    const nextSess = sibling ? firstLeaf(sibling) : null;
    parent.c.splice(loc.index, 1);
    parent.w.splice(loc.index, 1);
    if (!parent.c.length) {
      // 正常不会走到这里（每次分裂至少两个孩子）；留着防止坏记录把树打断。
      if (tb.root === parent) tb.root = null;
    } else if (parent.c.length === 1) {
      // 只剩一个孩子：把父容器折叠掉，空间直接交给孩子（即 i3 的 merge）。
      replaceNode(tb, parent, parent.c[0]);
    }
    if (tb.active === s) tb.active = nextSess;
    syncPanes(tb);
    if (!tb.root || !tb.panes.length) {
      closeTab(tb, true);
      return;
    }
    renderTree(tb);
    scheduleSave();
    if (activeTab === tb) {
      activatePane(tb.active || tb.panes[0]);
      fitTab(tb);
    } else {
      renderTabs();
    }
  }

  function closeTab(tb, empty) {
    if (!tb) return;
    if (!empty) {
      for (const s of tb.panes.slice()) closePane(s);
      return;
    }
    const ti = tabs.indexOf(tb);
    if (ti >= 0) tabs.splice(ti, 1);
    if (tb.paneEl) tb.paneEl.remove();
    scheduleSave();
    if (activeTab === tb) {
      activeTab = null;
      const next = tabs[Math.min(ti, tabs.length - 1)];
      if (next) activateTab(next);
      else newTab();
    } else {
      renderTabs();
    }
  }

  // 把保存的树还原成活节点；旧记录里单个孩子的容器顺手折平。
  function recToTree(rec, stats) {
    if (!rec) return null;
    if (rec.t === 'leaf') {
      const p = rec.s || {};
      const s = makeSession(p.title, Number(p.key) || 0);
      s.cwd = p.cwd || '';
      s.sessionId = p.sessionId || '';
      s.token = p.token || '';
      s.next = Number(p.next) || 0;
      s.restored = true;
      stats.maxKey = Math.max(stats.maxKey, s.key);
      return newLeaf(s);
    }
    if (rec.t !== 'split') return null;
    const children = [];
    const weights = [];
    (rec.c || []).forEach((child, i) => {
      const node = recToTree(child, stats);
      if (!node) return;
      children.push(node);
      weights.push(Number((rec.w || [])[i]) || 1);
    });
    if (!children.length) return null;
    if (children.length === 1) return children[0];
    return newSplit(rec.dir === 'col' ? 'col' : 'row', children, weights);
  }

  // 刷新/切应用后回来：先接旧会话，接不上才开新 shell。
  async function restoreSessions(saved) {
    const recTabs = (saved && Array.isArray(saved.tabs) && saved.tabs) || [];
    if (!recTabs.length) {
      await newWorkspace();
      return;
    }
    const stats = { maxKey: 0 };
    for (const rec of recTabs) {
      const tb = makeTab(Number(rec.key) || 0);
      tb.root = recToTree(rec.tree || panesTree(rec.panes || []), stats);
      if (!tb.root) continue;
      syncPanes(tb);
      // 还原出来的会话也要挂回标签：关闭分栏、点选焦点都靠这个反向指针。
      for (const s of tb.panes) s.tab = tb;
      tb.active = tb.panes.find((s) => s.key === Number(rec.active)) || tb.panes[0] || null;
      renderTree(tb);
    }
    // 记录里理论上不会出现空标签；真出现就丢掉，不留一个点不开的壳。
    for (const tb of tabs.slice()) {
      if (tb.root && tb.panes.length) continue;
      const i = tabs.indexOf(tb);
      if (i >= 0) tabs.splice(i, 1);
      tb.paneEl.remove();
    }
    seq = Math.max(seq, stats.maxKey);
    const target = tabs.find((tb) => tb.key === Number(saved.activeTab)) || tabs[0];
    if (!target) {
      await newWorkspace();
      return;
    }
    activateTab(target);
    await Promise.all(sessions.map((s) => (
      s.sessionId ? attachSaved(s).catch(() => bootSession(s)) : bootSession(s)
    )));
    fitTab(target);
    scheduleSave();
  }

  function restart(s) {
    if (!s) return;
    clearTimeout(s.inputTimer);
    if (s.sessionId) {
      const { sessionId, token } = s;
      fetch('/c/term.close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, token }),
        keepalive: true,
      }).catch(() => {});
      s.sessionId = '';
    }
    s.next = 0;
    s.pending = '';
    s.exited = false;
    scheduleSave();
    if (s.term) { try { s.term.reset(); } catch (e) { /* ignore */ } }
    bootSession(s);
  }

  // 拖拽选中即复制：鼠标松开时若选区非空，直接写入剪贴板并提示一下。
  let copiedUntil = 0;

  function flashCopied() {
    copiedUntil = Date.now() + 1200;
    status('copied!', 'ok');
    setTimeout(() => {
      if (!disposed && active && Date.now() >= copiedUntil) {
        status(active.status || '已连接', active.kind || 'ok');
      }
    }, 1250);
  }

  function copyText(text) {
    if (!text) return;
    // 宿主剪贴板最稳：WKWebView 的 clipboard API 会因缺少可信用户激活被拒。
    api('clip.set', { method: 'POST', fields: { text } }).then(flashCopied).catch(() => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flashCopied).catch(() => legacyCopy(text));
        return;
      }
      legacyCopy(text);
    });
  }

  function copySelection(s) {
    const text = s && s.term ? s.term.getSelection() : '';
    if (!text) { status('先用鼠标选中要复制的内容', 'warn'); return; }
    copyText(text);
  }

  function legacyCopy(text) {
    const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (ok) flashCopied();
    else status('浏览器拒绝了复制', 'err');
  }

  function onResize() {
    // 分栏树的每一块宽度都变了，整棵标签一起重量。
    if (activeTab) fitTab(activeTab);
    else if (active) fitSession(active);
  }

  function onPageHide() {
    // 只断开输出流并落盘会话记录；PTY 留给内核托管，刷新后接回来。
    saveNow();
    closeMux();
    for (const s of sessions) flushInput(s);
  }

  function onVisibility() {
    if (disposed) return;
    // 整个窗口被盖住时不再拉流；GL 上下文也还回去，回来时按需重挂。
    if (document.hidden) { closeMux(); detachAllGl(); }
    else {
      scheduleMux(0);
      for (const s of sessions) if (s.tab === activeTab) attachGl(s);
    }
  }

  function onKeydown(e) {
    // 只接管 Command 组合：Ctrl-T / Ctrl-W 在 shell 里有自己的含义（交换字符、删词），
    // 不能让标签快捷键把它们吃掉。
    if (!e.metaKey || e.ctrlKey || e.altKey) return;
    const k = String(e.key || '').toLowerCase();
    if (k === 't') {
      e.preventDefault();
      // ⇧ 给三栏工作台，普通 ⌘T 还是单会话标签。
      if (e.shiftKey) newWorkspace();
      else newTab();
      return;
    }
    if (k === 'd') {
      e.preventDefault();
      splitPane(e.shiftKey ? 'col' : 'row');
      return;
    }
    if (k === 'w') {
      e.preventDefault();
      if (active) closePane(active);
      return;
    }
    if (k === 'c') {
      e.preventDefault();
      copySelection(active);
      return;
    }
    if (/^[1-9]$/.test(k)) {
      const idx = Number(k) - 1;
      if (idx < tabs.length) {
        e.preventDefault();
        activateTab(tabs[idx]);
      }
    }
  }

  function destroy() {
    disposed = true;
    saveNow();
    closeMux();
    clearTimeout(muxTimer);
    clearInterval(muxWatch);
    if (pumpFrame) { cancelAnimationFrame(pumpFrame); pumpFrame = 0; }
    if (pumpTimer) { clearTimeout(pumpTimer); pumpTimer = 0; }
    inbox.clear();
    for (const s of sessions) {
      clearTimeout(s.inputTimer);
      flushInput(s);
      // 不关 PTY：切走应用或刷新后回来还要接回同一个 shell。
      detachGl(s); // 终端销毁会连带释放 GL 上下文，先把计数还回去
    if (s.term) { try { s.term.dispose(); } catch (e) { /* ignore */ } s.term = null; }
    }
    sessions.length = 0;
    tabs.length = 0;
    activeTab = null;
    active = null;
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('message', onPrefsMessage);
    window.removeEventListener('keydown', onKeydown, true);
    clear(host);
  }

  // 看门狗：EventSource 偶尔会静默进 CLOSED（系统休眠、网络栈重置），
  // 没有 error 回调时就再没人重连，表现为「画面还在但输出不再更新」。
  const muxWatch = setInterval(() => {
    if (disposed) return;
    if (!mux) {
      if (sessions.length && !muxTimer) scheduleMux(0);
      return;
    }
    if (mux.es && mux.es.readyState === 2) {
      closeMux();
      scheduleMux(600);
    }
  }, 3000);

  window.addEventListener('resize', onResize);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('keydown', onKeydown, true);
  paintActions(null);
  renderTabs();
  const saved = loadSaved();
  if (saved) restoreSessions(saved);
  else newWorkspace();

  // 给自动化验收留只读入口：会话数、标签数、布局树、当前 term。
  function treeSummary(node) {
    if (!node) return null;
    if (node.t === 'leaf') return { leaf: node.s.key };
    return {
      dir: node.dir,
      w: node.w.map((v) => Math.round(v * 1000) / 1000),
      c: node.c.map(treeSummary),
    };
  }

  window.__nexlosTermList = () => sessions.length;
  window.__nexlosActive = () => (active ? active.key : 0);
  // 性能取样用：会话句柄 + 最近若干行，方便外部脚本直接写入/读取某一块。
  window.__nexlosTermDebug = () => sessions.map((s) => ({
    key: s.key, id: s.sessionId, token: s.token, tab: s.tab ? s.tab.key : 0,
    title: s.title, cols: s.term ? s.term.cols : 0, rows: s.term ? s.term.rows : 0,
    exited: s.exited, gl: !!s.gl,
  }));
  // 渲染器阶梯的验收口径：还有几个 GL 上下文、上限多少。
  window.__nexlosGl = () => ({ live: glLive, limit: GL_LIMIT, released: glReleased });
  // 排障/验收用：强制退回兼容渲染器再挂回来，等价于“这个 GPU 上 WebGL 有问题”。
  window.__nexlosGlForce = (on) => {
    if (on) {
      for (const s of sessions) if (s.tab === activeTab) { s.glRetryAt = 0; attachGl(s); }
    } else {
      detachAllGl();
    }
    return { live: glLive };
  };
  window.__nexlosRead = (key) => {
    const s = sessions.find((x) => x.key === key);
    if (!s || !s.term) return null;
    const b = s.term.buffer.active;
    const out = [];
    // 只读尾部：整条 scrollback 翻译一遍会自己制造卡顿，测出来的就不是终端了。
    for (let i = Math.max(0, b.length - 10); i < b.length; i += 1) {
      const line = b.getLine(i);
      if (!line) continue;
      const text = line.translateToString(true);
      if (text) out.push(text);
    }
    return out;
  };
  window.__nexlosTabList = () => tabs.map((tb) => ({
    key: tb.key, panes: tb.panes.length, active: tb.active ? tb.active.key : 0,
    titles: tb.panes.map((s) => s.title),
    tree: treeSummary(tb.root),
  }));
  // 性能取样用：直接拿到 xterm 实例，便于挂 onRender 量渲染耗时。
  window.__nexlosTerms = () => sessions.map((s) => ({ key: s.key, term: s.term }));

  return { destroy };
}
