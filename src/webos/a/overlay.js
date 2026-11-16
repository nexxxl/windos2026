// 折叠空间弹层页面（独立原生 Surface）。
//
// 这个页面不联网、不读 localStorage：状态由浏览器外壳通过查询参数交进来，
// 之后每次变更都用 surface.eval 调 window.__nexlosOverlayUpdate 增量刷新。
// 所有操作都走 window.__nexlosSurface 回传，外壳轮询 surface.status 取回结果。
//
// 兼容 Chrome 72：不用可选链、空值合并、flex gap。

const PARAMS = new URLSearchParams(location.search);
const SKIN = PARAMS.get('skin') === 'win98' ? 'win98' : 'current';
// 外壳把当前像素字体传进来：弹层是新文档，拿不到外壳 documentElement 上的变量。
const FONT = PARAMS.get('font') || '';
if (FONT) document.documentElement.style.setProperty('--ov-font', FONT);
// Windos2026 的正文最小 14px，和普通窗口一致；浏览器外壳把用户字号传进来。
const FS = parseInt(PARAMS.get('fs'), 10) || 12;
document.documentElement.style.setProperty('--ov-ui', Math.max(14, FS) + 'px');
// 视图比窗体大一圈留投影；原生侧按同一组数字摆放，锚点才不会偏。
const PAD = { left: 3, top: 3, right: 12, bottom: 16 };

const root = document.getElementById('ov-root');
let state = { list: [], current: '' };
let mode = '';        // '' | 'rename' | 'confirm'
let inputEl = null;
let lastMetrics = '';

function post(payload) {
  try {
    if (typeof window.__nexlosSurface === 'function') window.__nexlosSurface(payload);
  } catch (e) { /* 桥未注入时静默 */ }
}

function esc(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function currentSpace() {
  for (let i = 0; i < state.list.length; i += 1) {
    if (state.list[i].id === state.current) return state.list[i];
  }
  return null;
}

// 卡片尺寸回传：原生视图按它调整 frame，弹层永远不会被裁掉半截。
function reportMetrics() {
  const card = root.firstChild;
  if (!card) return;
  const r = card.getBoundingClientRect();
  const w = Math.ceil(r.width) + PAD.left + PAD.right;
  const h = Math.ceil(r.height) + PAD.top + PAD.bottom;
  const sig = w + 'x' + h;
  if (sig === lastMetrics) return;
  lastMetrics = sig;
  post({ type: 'space', action: 'metrics', w: w, h: h, skin: SKIN });
}

function render() {
  root.className = 'ov-root ov-skin-' + SKIN;
  document.body.className = 'ov-skin-' + SKIN;
  root.textContent = '';

  const card = el('div', 'ov-card');
  const head = el('div', 'ov-head');
  head.appendChild(el('span', null, '折叠空间'));
  const close = el('button', 'ov-close', '×');
  close.type = 'button';
  close.title = '关闭';
  close.addEventListener('click', () => post({ type: 'space', action: 'close' }));
  head.appendChild(close);
  card.appendChild(head);

  // 空间列表：当前空间打勾，点其它空间直接切换。
  state.list.forEach((space) => {
    const active = space.id === state.current;
    const row = el('button', 'ov-row' + (active ? ' on' : ''));
    row.type = 'button';
    row.setAttribute('role', 'menuitemradio');
    row.setAttribute('aria-checked', active ? 'true' : 'false');
    const dot = el('span', 'ov-dot');
    dot.style.background = space.color || '#999';
    row.appendChild(dot);
    row.appendChild(el('span', 'ov-name', space.name || '未命名'));
    if (active) row.appendChild(el('span', 'ov-tick', '✓'));
    row.addEventListener('click', () => {
      if (active) { post({ type: 'space', action: 'close' }); return; }
      post({ type: 'space', action: 'switch', id: space.id });
    });
    card.appendChild(row);
  });

  card.appendChild(el('div', 'ov-sep'));

  if (mode === 'rename') {
    card.appendChild(buildRename());
  } else {
    card.appendChild(buildCreate());
    if (mode === 'confirm') card.appendChild(buildConfirm());
    else card.appendChild(buildActions());
  }

  root.appendChild(card);
  requestAnimationFrame(reportMetrics);
}

function buildCreate() {
  const row = el('div', 'ov-create');
  inputEl = el('input', 'ov-input');
  inputEl.type = 'text';
  inputEl.maxLength = 24;
  inputEl.placeholder = '折叠空间名称';
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      create();
    }
  });
  row.appendChild(inputEl);
  const add = el('button', 'ov-add', '创建');
  add.type = 'button';
  add.addEventListener('click', create);
  row.appendChild(add);
  return row;
}

function create() {
  const name = String(inputEl ? inputEl.value : '').trim();
  lastMetrics = '';
  post({ type: 'space', action: 'create', name: name });
}

function buildRename() {
  const space = currentSpace();
  const row = el('div', 'ov-create');
  inputEl = el('input', 'ov-input');
  inputEl.type = 'text';
  inputEl.maxLength = 24;
  inputEl.value = space ? space.name : '';
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const name = inputEl.value.trim();
      if (name) post({ type: 'space', action: 'rename', name: name });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      mode = '';
      render();
    }
  });
  row.appendChild(inputEl);
  const save = el('button', 'ov-add', '保存');
  save.type = 'button';
  save.addEventListener('click', () => {
    const name = inputEl.value.trim();
    if (name) post({ type: 'space', action: 'rename', name: name });
  });
  row.appendChild(save);
  return row;
}

function buildConfirm() {
  const space = currentSpace();
  const row = el('div', 'ov-confirm');
  row.appendChild(el('span', 'ov-warn', '删除「' + (space ? space.name : '') + '」？'));
  const yes = el('button', 'ov-danger', '删除');
  yes.type = 'button';
  yes.addEventListener('click', () => post({ type: 'space', action: 'delete' }));
  row.appendChild(yes);
  const no = el('button', 'ov-cancel', '取消');
  no.type = 'button';
  no.addEventListener('click', () => { mode = ''; render(); });
  row.appendChild(no);
  return row;
}

function buildActions() {
  const row = el('div', 'ov-actions');
  const rename = el('button', 'ov-action', '重命名');
  rename.type = 'button';
  rename.addEventListener('click', () => {
    mode = 'rename';
    render();
    if (inputEl) { inputEl.focus(); inputEl.select(); }
  });
  row.appendChild(rename);
  // 只剩一个空间时不给删除入口：删除总是把用户送回另一个存在的空间。
  if (state.list.length > 1) {
    const del = el('button', 'ov-action', '删除');
    del.type = 'button';
    del.addEventListener('click', () => { mode = 'confirm'; render(); });
    row.appendChild(del);
  }
  return row;
}

// 外壳改完状态后调这里刷新；mode 变化由外壳决定（rename/confirm 只是本地折叠状态）。
window.__nexlosOverlayUpdate = function (payload) {
  let next = payload;
  if (typeof next === 'string') {
    try { next = JSON.parse(next); } catch (e) { return; }
  }
  if (!next || !next.list) return;
  state = { list: next.list, current: next.current || '' };
  if (typeof next.mode === 'string' && next.mode !== mode) mode = next.mode;
  lastMetrics = '';
  render();
  if (mode === 'rename' && inputEl) { inputEl.focus(); inputEl.select(); }
};

window.__nexlosOverlayMetrics = function () { return lastMetrics; };

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if (mode) { mode = ''; render(); return; }
  post({ type: 'space', action: 'close' });
}, true);

// 首次渲染。state 参数是 encodeURIComponent 过的 JSON，超长也不会打断 URL。
(function boot() {
  const raw = new URLSearchParams(location.search).get('state');
  let payload = null;
  try { payload = raw ? JSON.parse(decodeURIComponent(raw)) : null; } catch (e) { payload = null; }
  if (payload && payload.list) state = { list: payload.list, current: payload.current || '' };
  render();
  // 字体到位后再量一次：像素字体和系统字体的行高不同。
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { lastMetrics = ''; reportMetrics(); });
  }
  // 打开即可输入：弹层的第一个用途就是新建或切换空间。
  setTimeout(() => {
    const input = root.querySelector('.ov-input');
    if (input) input.focus();
  }, 40);
  post({ type: 'space', action: 'open', skin: SKIN });
})();

window.addEventListener('resize', () => { lastMetrics = ''; reportMetrics(); });
