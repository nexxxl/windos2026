import { h, clear, api } from './can.js';
import { icon } from './icons.js';
import { t } from './i18n.js';

// 记忆树：宿主交换区里的「记忆树」文件夹（明文 Markdown）。
// 左侧按 INDEX / 主题 / 观察 / 项目 分组，右侧直接编辑 Markdown；保存走 memory.write（原子写 + 配额）。
// 这个目录就是 NexlOS 的知识库：人和 agent 读写的是同一批 Markdown，
// 关系图谱界面只读它，不再依赖宿主上的编辑器。

const AREAS = [
  { id: 'index', name: '索引', hint: '入口与自动登记' },
  { id: 'topics', name: '主题', hint: '长期事实与决策' },
  { id: 'observations', name: '观察', hint: '一次性的新发现' },
  { id: 'projects', name: '项目', hint: '进行中的事项' },
];

function fmtBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function mountMemory(host) {
  const S = { rows: [], areas: {}, current: null, dirty: false, loading: true, error: '', dialog: null };
  const listEl = h('div', { class: 'mm-list' });
  const titleEl = h('b', { class: 'mm-doc-title' }, '记忆树');
  const metaEl = h('span', { class: 'mm-doc-meta' }, '');
  const stateEl = h('span', { class: 'mm-dirty' }, '');
  const editor = h('textarea', {
    class: 'mm-editor', spellcheck: 'false', placeholder: '在这里写 Markdown…',
    oninput: () => { if (S.current) { S.current.text = editor.value; S.dirty = true; stateEl.textContent = '未保存'; } },
  });
  const saveBtn = h('button', { class: 'mm-btn primary', type: 'button', onclick: () => save() }, '保存');
  const emptyEl = h('div', { class: 'mm-empty' }, h('p', {}, '正在读取记忆树…'));
  const countEl = h('span', { class: 'mm-count' }, '');
  const dialogLayer = h('div', { class: 'mm-dialog-layer', hidden: true });

  const bar = h('div', { class: 'mm-bar' },
    h('span', { class: 'mm-bar-ic' }, icon('memory')),
    h('b', {}, '记忆树'),
    countEl,
    h('span', { class: 'mm-spacer' }),
    h('button', { class: 'mm-btn', type: 'button', onclick: () => openCreate('topics') }, '新建主题'),
    h('button', { class: 'mm-btn', type: 'button', onclick: () => openCreate('observations') }, '记录观察'),
    h('button', { class: 'mm-btn', type: 'button', onclick: () => openCreate('projects') }, '新建项目'),
    h('button', { class: 'mm-btn', type: 'button', title: '在 NexlOS 里查看双链图谱', onclick: () => openGraph() }, '关系图谱'),
    h('button', { class: 'mm-btn', type: 'button', title: '重新读取', onclick: () => loadTree() }, '刷新'));

  const docBar = h('div', { class: 'mm-docbar' },
    h('div', { class: 'mm-doc-head' }, titleEl, metaEl),
    stateEl,
    saveBtn);

  const rightEl = h('div', { class: 'mm-right' }, docBar, editor, emptyEl);
  const frame = h('div', { class: 'mm' }, bar, h('div', { class: 'mm-body' }, listEl, rightEl), dialogLayer);
  host.append(frame);

  function applyPrefs(p) {
    p = p || {};
    if (p.theme) frame.classList.toggle('mm-dark', p.theme === 'dark');
    if (p.accent) frame.style.setProperty('--mm-accent', p.accent);
  }
  function onPrefs(e) {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'nexlos.settings') applyPrefs(e.data.patch);
  }
  window.addEventListener('message', onPrefs);
  api('settings.get').then((r) => applyPrefs(r.detail || {})).catch(() => {});

  function toast(msg, kind) {
    let t = frame.querySelector('.mm-toast');
    if (!t) { t = h('div', { class: 'mm-toast' }); frame.append(t); }
    t.textContent = msg;
    t.dataset.kind = kind || 'ok';
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function openGraph() {
    // 图谱是独立窗口：交给外壳去开，记忆树本身不离开；
    // 直接访问 #/memory 时没有外壳，就退化成同窗跳转。
    if (parent !== window) parent.postMessage({ type: 'nexlos.open', app: 'graph' }, location.origin);
    else location.hash = '#/graph';
  }

  function rowsFor(area) {
    return S.rows.filter((r) => r.area === area);
  }

  function paintList() {
    clear(listEl);
    for (const area of AREAS) {
      const rows = rowsFor(area.id);
      if (!rows.length && area.id !== 'index') continue;
      listEl.append(h('div', { class: 'mm-group' },
        h('div', { class: 'mm-group-head' },
          h('b', {}, area.name),
          h('span', {}, area.hint),
          h('i', {}, String(rows.length))),
        rows.map((row) => h('button', {
          class: `mm-item${S.current && S.current.path === row.path ? ' active' : ''}`,
          type: 'button',
          title: row.path,
          onclick: () => open(row.path),
        },
          h('span', { class: 'mm-item-title', 'data-i18n-skip': true }, row.title || row.name),
          h('span', { class: 'mm-item-meta' }, `${fmtBytes(row.bytes)} · ${fmtDate(row.mod)}`)))));
    }
    if (!listEl.childNodes.length) listEl.append(h('div', { class: 'mm-empty-list' }, '还没有记忆条目。'));
  }

  async function loadTree(selectPath) {
    S.loading = true;
    try {
      const r = await api('memory.tree');
      S.rows = r.append || [];
      S.areas = (r.detail && r.detail.areas) || {};
      countEl.textContent = `${S.rows.length} 篇`;
      paintList();
      const target = selectPath || (S.current && S.current.path) || '/memory/INDEX.md';
      const exists = S.rows.some((row) => row.path === target);
      if (exists) await open(target);
      else if (S.rows.length) await open(S.rows[0].path);
      else showEmpty();
    } catch (e) {
      S.error = e.message;
      showEmpty(`读不到记忆树：${e.message}`);
    } finally {
      S.loading = false;
    }
  }

  function showEmpty(msg) {
    editor.hidden = true;
    emptyEl.hidden = false;
    clear(emptyEl);
    emptyEl.append(h('p', {}, msg || '工作区里还没有记忆。先建一个主题，或把 Markdown 放进 memory/topics/。'));
    titleEl.removeAttribute('data-i18n-skip');
    titleEl.textContent = '记忆树';
    metaEl.textContent = '';
    saveBtn.disabled = true;
  }

  async function open(path) {
    if (S.dirty && S.current && !window.confirm(t('当前这篇还没保存，切换会丢掉修改。继续？'))) return;
    try {
      const r = await api('memory.read', { query: { path } });
      S.current = { path, text: r.detail.text, bytes: r.detail.bytes, mod: r.detail.mod };
      S.dirty = false;
      editor.hidden = false;
      emptyEl.hidden = true;
      editor.value = r.detail.text;
      titleEl.setAttribute('data-i18n-skip', '');
      titleEl.textContent = titleOf(r.detail.text) || path.split('/').pop();
      metaEl.textContent = `${path} · ${fmtBytes(r.detail.bytes)} · ${fmtDate(r.detail.mod)}`;
      stateEl.textContent = '';
      saveBtn.disabled = false;
      paintList();
      editor.focus();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function titleOf(text) {
    for (const line of String(text || '').split('\n')) {
      if (line.startsWith('# ')) return line.slice(2).trim();
    }
    return '';
  }

  async function save() {
    if (!S.current) return;
    try {
      const r = await api('memory.write', { method: 'POST', fields: { path: S.current.path, text: editor.value } });
      S.current.text = editor.value;
      S.current.bytes = (r.detail && r.detail.bytes) || editor.value.length;
      S.dirty = false;
      stateEl.textContent = '已保存';
      titleEl.setAttribute('data-i18n-skip', '');
      titleEl.textContent = titleOf(editor.value) || S.current.path.split('/').pop();
      metaEl.textContent = `${S.current.path} · ${fmtBytes(S.current.bytes)}`;
      toast('已写入宿主工作区');
      await loadTree(S.current.path);
    } catch (e) {
      toast(`保存失败：${e.message}`, 'err');
    }
  }

  function openCreate(area) {
    const input = h('input', { class: 'mm-input', placeholder: '标题，例如：宿主工作区约定', maxlength: '80' });
    const err = h('p', { class: 'mm-dialog-err' }, '');
    const close = () => { S.dialog = null; dialogLayer.hidden = true; clear(dialogLayer); };
    const submit = async () => {
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      try {
        const r = await api('memory.create', { method: 'POST', fields: { area, title } });
        close();
        await loadTree(r.detail.path);
        toast('已新建');
      } catch (e) {
        err.textContent = e.message;
      }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') close(); });
    clear(dialogLayer);
    dialogLayer.hidden = false;
    dialogLayer.append(h('div', { class: 'mm-dialog', role: 'dialog', 'aria-modal': 'true' },
      h('b', {}, AREAS.find((a) => a.id === area).name + ' · 新建'),
      input, err,
      h('div', { class: 'mm-dialog-btns' },
        h('button', { class: 'mm-btn', type: 'button', onclick: close }, '取消'),
        h('button', { class: 'mm-btn primary', type: 'button', onclick: submit }, '创建'))));
    input.focus();
  }

  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      save();
    }
  }
  document.addEventListener('keydown', onKey);

  function destroy() {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('message', onPrefs);
    clear(host);
  }

  loadTree();
  return { destroy };
}
