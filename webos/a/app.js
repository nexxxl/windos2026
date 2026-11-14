import { h, clear, api, fmt, debounce } from './can.js';
import './perf.js';
import { ICONS, icon } from './icons.js';
import { mountOS } from './os.js';
import { mountPC } from './pc.js';
import { mountSettings } from './settings.js';
import { mountTerm } from './term.js';
import { mountMemory } from './memory.js';
import { mountVideo, mountMusic } from './media.js';
import { mountScan } from './scan.js';
import { mountBrowser } from './browser.js';
import { mountDraw } from './draw.js';
import { mountOffice } from './office.js';
import { mountMinesweeper } from './minesweeper.js';
import { mountGraph } from './graph.js';
import { mountStore } from './store.js';
import { showHello } from './hello.js';
import { initAppearance } from './appearance.js';
import { getLanguage, setLanguage, localizeDoc, observeDoc, formatDate } from './i18n.js';

initAppearance((prefs) => {
  if (!prefs.language) return;
  setLanguage(prefs.language);
  localizeDoc(document, true);
  observeDoc(document);
});

// 启动进度轴：加载期间分阶段推进，桌面真正挂载完成才补到 100%。
// 只许前进：晚到的阶段定时器不能把已完成的进度改回去。
let bootPercent = 0;
function bootProgress(percent) {
  if (percent <= bootPercent) return;
  bootPercent = percent;
  const bar = document.querySelector('#boot .boot-bar i');
  if (bar) bar.style.width = percent + '%';
}
observeDoc(document);

const APPS = [
  { id: 'apps', label: '应用', icon: ICONS.apps },
  { id: 'shelf', label: '书房', icon: ICONS.shelf },
  { id: 'chapters', label: '正文', icon: ICONS.chapter },
  { id: 'tasks', label: '任务', icon: ICONS.tasks },
  { id: 'outline', label: '总纲', icon: ICONS.outline },
  { id: 'cast', label: '人物', icon: ICONS.cast },
  { id: 'export', label: '导出', icon: ICONS.export },
  { id: 'system', label: '系统', icon: ICONS.system },
];

const S = {
  books: [], space: null, book: null, chapters: [], view: 'desktop',
  chapter: null, text: '', dirty: false, saving: false, savedAt: null,
  cast: [], outline: '', exportText: '', status: null, error: null,
  tasks: [], task: null, taskNote: '', apps: [], appBusy: '',
};

// Chrome for Android 的 100vh 取“地址栏收起后的高度”，系统应用会把底栏画到地址栏后面。
// 系统级页面统一用当前 innerHeight，地址栏收起/展开时跟着 resize 重算。
function fitAppHeight() {
  document.documentElement.style.setProperty('--nexlos-app-h', `${window.innerHeight}px`);
}
window.addEventListener('resize', fitAppHeight);
window.addEventListener('orientationchange', fitAppHeight);
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitAppHeight);
fitAppHeight();

const saveQueue = debounce(flushSave, 900);
let mainEl = null;
let currentOS = null;
let currentApp = null;

function toast(msg, kind = 'info') {
  let t = document.querySelector('.toast');
  if (!t) { t = h('div', { class: 'toast', 'data-i18n-content': '打开汇报' }); document.body.append(t); }
  t.textContent = msg;
  t.dataset.kind = kind;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function saveState() {
  if (S.saving) return '保存中…';
  if (S.dirty) return '未保存';
  if (S.savedAt) return `已保存 ${S.savedAt}`;
  return '';
}

function stamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function flushSave() {
  if (!S.dirty || !S.space) return;
  if (S.view === 'chapters' && S.chapter) {
    S.saving = true; renderHeader();
    try {
      const res = await api('chapter.save', { method: 'POST', space: S.space, fields: { chapter: S.chapter.file, text: S.text } });
      S.dirty = false; S.savedAt = stamp();
      const row = S.chapters.find((c) => c.file === S.chapter.file);
      if (row) {
        const saved = res.fields.saved || {};
        row.words = saved.words != null ? saved.words : (S.text.match(/[\u3400-\u9fff]|[A-Za-z0-9]+/g) || []).length;
        if (saved.title) row.title = saved.title;
        if (S.chapter) { S.chapter.words = row.words; S.chapter.title = row.title; }
        const wc = document.querySelector('.chapter-row.active .chapter-words');
        if (wc) wc.textContent = fmt(row.words);
        const tc = document.querySelector('.chapter-row.active .chapter-title');
        if (tc) tc.textContent = row.title;
      }
    } catch (e) { toast(`保存失败：${e.message}`, 'error'); }
    finally { S.saving = false; renderHeader(); }
  } else if (S.view === 'outline') {
    S.saving = true; renderHeader();
    try {
      await api('outline.save', { method: 'POST', space: S.space, fields: { text: S.outline } });
      S.dirty = false; S.savedAt = stamp();
    } catch (e) { toast(`保存失败：${e.message}`, 'error'); }
    finally { S.saving = false; renderHeader(); }
  } else if (S.view === 'cast') {
    S.saving = true; renderHeader();
    try {
      await api('cast.save', { method: 'POST', space: S.space, fields: { cast: S.cast } });
      S.dirty = false; S.savedAt = stamp();
    } catch (e) { toast(`保存失败：${e.message}`, 'error'); }
    finally { S.saving = false; renderHeader(); }
  }
}

function navigate(view, space = S.space) {
  saveQueue.flush();
  closeAppWindow();
  let hash = '#/';
  if (view === 'desktop') hash = '#/desktop';
  else if (view === 'apps') hash = '#/apps';
  else if (space && view !== 'shelf') hash = `#/b/${encodeURIComponent(space)}/${view}`;
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function openSpace(id) {
  const res = await api('novel.open', { space: id });
  S.space = id;
  S.book = res.fields.book;
  S.chapters = res.append;
  localStorage.setItem('nexlos.space', id);
  if (S.chapter && !S.chapters.some((c) => c.file === S.chapter.file)) S.chapter = null;
}

// 桌面是增量 DOM：进入时挂载一次，离开时销毁；窗口交互不触发整页重渲染。
function renderDesktop() {
  const app = document.getElementById('app');
  const boot = document.getElementById('boot');
  // 每个会话只演一次开机：桌面已经挂载好，启动画面只负责遮挡再清晰。
  let seen = false;
  try { seen = sessionStorage.getItem('nexlos.booted') === '1'; } catch (e) { seen = true; }
  if (seen || !boot) document.body.classList.remove('booting');
  app.hidden = false;
  clear(app);
  currentOS = mountOS(app);
  // 深链：?open=browser 在桌面就绪后自动打开指定应用（联调与自动化用）。
  const deepOpen = new URLSearchParams(location.search).get('open');
  if (deepOpen && !window.__nexlosDeepOpen) {
    window.__nexlosDeepOpen = 1;
    setTimeout(() => window.postMessage({ type: 'nexlos.open', app: deepOpen }, location.origin), 650);
  }
  if (!boot) return;
  if (seen) { boot.remove(); return; }
  try { sessionStorage.setItem('nexlos.booted', '1'); } catch (e) { /* 隐私模式不拦启动 */ }
  // 桌面已经挂载：进度轴补满，稍作停留后同步“去雾 + 玻璃淡出”。
  bootProgress(100);
  setTimeout(() => {
    document.body.classList.remove('booting');
    boot.classList.add('done');
    setTimeout(() => boot.remove(), 1100);
  }, 420);
}

// 画板是可选包：首次打开才拉取样式与内核；缺包时给可读提示，不让整条路由失败。
// 样式表由 artcraftport.js 自己装载，系统应用路由与这里共用同一份。
async function openArtCraftPort(wrap) {
  try {
    const module = await import('./artcraftport.js');
    return module.mountArtCraftPort(wrap);
  } catch (error) {
    console.warn('[nexlos] ArtCraft 移植版未安装：', error);
    wrap.append(h('div', { class: 'empty' }, 'ArtCraft 移植版未安装：把 extras/ 放到 /extras/ 后重开。'));
    return { destroy() { wrap.replaceChildren(); } };
  }
}

async function route() {
  if (currentOS) { currentOS.destroy(); currentOS = null; }
  if (currentApp) { currentApp.destroy(); currentApp = null; }
  document.body.classList.remove('os-mode', 'sys-view', 'sys-pc', 'sys-settings', 'sys-term', 'sys-memory', 'sys-video', 'sys-music', 'sys-scan', 'sys-draw', 'sys-office', 'sys-artcraftport', 'sys-minesweeper', 'sys-browser', 'sys-graph', 'sys-store', 'st-dark');
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  try {
    if (parts[0] === 'desktop') {
      S.view = 'desktop';
      renderDesktop();
      return;
    }
    // 此电脑、终端、媒体与设置是系统级应用：占满窗口，不套写作外壳的侧栏与顶栏。
    const SYS = ['pc', 'settings', 'term', 'memory', 'video', 'music', 'scan', 'draw', 'office', 'artcraftport', 'minesweeper', 'browser', 'graph', 'store'];
    if (SYS.indexOf(parts[0]) >= 0) {
      S.view = parts[0];
      const app = document.getElementById('app');
      const boot = document.getElementById('boot');
      if (boot) boot.remove();
      document.body.classList.remove('booting');
      app.hidden = false;
      clear(app);
      document.body.classList.add('sys-view', `sys-${parts[0]}`);
      fitAppHeight();
      const wrap = h('div', { class: 'sysapp' });
      app.append(wrap);
      const mounts = {
        pc: mountPC, settings: mountSettings, term: mountTerm, memory: mountMemory,
        video: mountVideo, music: mountMusic, scan: mountScan, draw: mountDraw,
        office: mountOffice, artcraftport: openArtCraftPort, minesweeper: mountMinesweeper, browser: mountBrowser,
        graph: mountGraph, store: mountStore,
      };
      currentApp = await mounts[parts[0]](wrap);
      return;
    }
    if (parts[0] === 'apps') {
      S.view = 'apps';
    } else if (parts[0] === 'system') {
      // WebOS 的“系统”窗口按 #/system 打开，不能落到书房兜底分支。
      S.view = 'system';
    } else if (parts[0] === 'b' && parts[1]) {
      const id = decodeURIComponent(parts[1]);
      if (!S.book || S.book.id !== id) { S.chapter = null; S.text = ''; await openSpace(id); }
      S.view = APPS.some((a) => a.id === parts[2]) ? parts[2] : 'chapters';
    } else {
      S.view = 'shelf';
      S.books = (await api('novel.list')).append;
    }
    await loadViewData();
    render();
  } catch (e) {
    S.error = e.message;
    render();
  }
}

async function loadViewData() {
  if (S.view === 'apps') {
    const r = await api('app.list');
    S.apps = r.append || [];
    return;
  }
  // 系统面板不依赖当前空间：没有书的干净安装也要能看到内核状态。
  if (S.view === 'system') {
    S.status = await api('system.status', { space: S.space });
    return;
  }
  if (S.view === 'shelf' || !S.space) return;
  if (S.view === 'chapters' && !S.chapter) {
    const last = localStorage.getItem(`nexlos.chapter:${S.space}`);
    const target = S.chapters.find((c) => c.file === last) || S.chapters[0];
    if (target) {
      const r = await api('chapter.read', { space: S.space, query: { chapter: target.file } });
      S.chapter = target;
      S.text = r.fields.chapter.text;
      S.dirty = false;
      S.savedAt = null;
    }
  }
  if (S.view === 'tasks') {
    const r = await api('task.list', { space: S.space });
    S.tasks = r.append;
    if (S.task && !S.tasks.some((t) => t.id === S.task.id)) S.task = null;
    if (S.task) {
      try {
        S.task = (await api('task.open', { space: S.space, query: { task: S.task.id } })).fields.task;
      } catch { S.task = null; }
    }
  }
  if (S.view === 'outline') {
    const r = await api('outline.read', { space: S.space });
    S.outline = r.text || '';
    S.dirty = false;
  }
  if (S.view === 'cast') {
    const r = await api('cast.list', { space: S.space });
    S.cast = r.append;
    S.dirty = false;
  }
  if (S.view === 'export') {
    const r = await api('export.markdown', { space: S.space });
    S.exportText = r.text || '';
  }
}

function renderHeader() {
  const el = document.querySelector('.topbar');
  if (!el) return;
  const book = S.book;
  const onApps = S.view === 'apps';
  const showBook = !onApps && S.view !== 'shelf' && book;
  const st = el.querySelector('.save-state');
  if (st) st.textContent = showBook ? saveState() : '';
  const title = el.querySelector('.book-title');
  if (title) {
    title.toggleAttribute('data-i18n-skip', !!showBook);
    title.textContent = showBook ? book.title : onApps ? '启动台' : '书房';
  }
  const meta = el.querySelector('.book-meta');
  if (meta) meta.textContent = showBook ? `${S.chapters.length} 章 · ${fmt(S.chapters.reduce((n, c) => n + c.words, 0))} 字` : onApps ? '本机应用' : '';
}

function render() {
  const app = document.getElementById('app');
  const boot = document.getElementById('boot');
  if (boot) boot.remove();
  document.body.classList.remove('booting');
  app.hidden = false;
  clear(app);

  const onApps = S.view === 'apps';
  const showBook = !onApps && S.view !== 'shelf' && S.book;
  const topbar = h('header', { class: 'topbar' },
    h('button', { class: 'brand', onclick: () => navigate('apps'), title: '回到启动台' },
      h('span', { class: 'monogram' }, 'N'),
      h('span', { class: 'brand-text' }, h('b', {}, 'NexlOS'), h('i', {}, 'next-link · 复古未来操作系统'))),
    h('div', { class: 'book-head' },
      h('div', { class: 'book-title', 'data-i18n-skip': !!showBook }, showBook ? S.book.title : onApps ? '启动台' : '书房'),
      h('div', { class: 'book-meta' }, showBook ? `${S.chapters.length} 章 · ${fmt(S.chapters.reduce((n, c) => n + c.words, 0))} 字` : onApps ? '本机应用' : '')),
    h('div', { class: 'top-actions' },
      h('span', { class: 'save-state' }, showBook ? saveState() : ''),
      S.book ? h('button', { class: 'ghost', onclick: () => navigate('export') }, '导出') : null));

  const rail = h('nav', { class: 'rail' }, APPS.map((a) => {
    const active = S.view === a.id;
    const locked = !S.book && !['apps', 'shelf', 'system'].includes(a.id);
    return h('button', {
      class: `rail-item${active ? ' active' : ''}`, disabled: locked,
      onclick: () => navigate(a.id),
    }, icon(a.icon), h('span', {}, a.label));
  }));

  mainEl = h('main', { class: 'main' });
  app.append(h('div', { class: 'shell' }, rail, h('div', { class: 'stage' }, topbar, mainEl)));

  const view = {
    apps: viewApps, shelf: viewShelf, chapters: viewChapters, tasks: viewTasks, outline: viewOutline,
    cast: viewCast, export: viewExport, system: viewSystem,
  }[S.view] || viewApps;

  mainEl.append(S.error ? errorPane(S.error) : view());
}

function errorPane(msg) {
  return h('section', { class: 'pane center' },
    h('p', { class: 'eyebrow' }, '出错了'),
    h('h1', {}, msg),
    h('button', { class: 'primary', onclick: () => { S.error = null; route(); } }, '重试'));
}

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function scopeText(scope) {
  const chapters = (scope && scope.chapters) || [];
  if (!chapters.length) return '未限定章节';
  if (chapters.length <= 2) return chapters.join('、');
  return `${chapters.slice(0, 2).join('、')} 等 ${chapters.length} 章`;
}

function taskCard(t) {
  return h('button', {
    class: `task-card${S.task && S.task.id === t.id ? ' active' : ''}`,
    onclick: () => openTask(t.id),
  },
    h('div', { class: 'task-card-top' },
      h('span', { class: `stage-pill stage-${t.stage}` }, t.stageLabel),
      h('span', { class: 'task-id' }, t.id)),
    h('b', {}, t.title),
    h('small', {}, scopeText(t.scope)),
    h('small', {}, `${t.inputs} 条输入 · ${when(t.updatedAt)}`));
}

async function openTask(id) {
  try {
    S.task = (await api('task.open', { space: S.space, query: { task: id } })).fields.task;
    S.taskNote = '';
    render();
  } catch (e) { toast(e.message, 'error'); }
}

async function refreshTasks() {
  if (!S.space) return;
  const r = await api('task.list', { space: S.space });
  S.tasks = r.append;
  if (S.task) {
    try {
      S.task = (await api('task.open', { space: S.space, query: { task: S.task.id } })).fields.task;
    } catch { S.task = null; }
  }
  render();
}

async function taskAction(cmd, fields = {}) {
  if (!S.task) return;
  try {
    await api(cmd, { method: 'POST', space: S.space, fields: { task: S.task.id, ...fields } });
    await refreshTasks();
    toast('已更新');
  } catch (e) { toast(e.message, 'error'); }
}

function taskDetail(t) {
  const stage = t.stage;
  const actions = [];
  const push = (label, cmd, fields, cls = 'ghost') => actions.push(h('button', {
    class: cls,
    onclick: () => taskAction(cmd, typeof fields === 'function' ? fields() : fields),
  }, label));

  if (stage === 'queued') push('开始', 'task.start', {}, 'primary');
  if (stage === 'working' || stage === 'idle') {
    push('等待', 'task.report', () => ({ state: 'waiting', note: S.taskNote }));
    push('报告完成', 'task.report', () => ({ state: 'ready', note: S.taskNote }), 'primary');
    push('报告受阻', 'task.report', () => ({ state: 'blocked', note: S.taskNote }));
  }
  if (stage === 'review') {
    push('验收结束', 'task.end', {}, 'primary');
    push('退回重试', 'task.retry', () => ({ note: S.taskNote }));
  }
  if (stage === 'blocked' || stage === 'failed') {
    push('重试', 'task.retry', () => ({ note: S.taskNote }), 'primary');
    push('结束', 'task.end', {});
  }
  if (stage === 'done') push('重新打开', 'task.retry', () => ({ note: S.taskNote }));
  actions.push(h('button', { class: 'ghost danger', onclick: () => { S.task = null; render(); } }, '收起'));

  const note = h('textarea', {
    class: 'task-note-input',
    placeholder: '写下决定、约束或交接说明…',
    value: S.taskNote,
    oninput: (e) => { S.taskNote = e.target.value; },
  });

  const timeline = (t.inputs || []).length
    ? h('div', { class: 'timeline' }, [...t.inputs].reverse().map((inp) => h('div', { class: 'timeline-row' },
        h('i', {}, inp.kind), h('b', {}, inp.text), h('span', { class: 'when' }, when(inp.at)))))
    : h('p', { class: 'hint' }, '还没有输入。');

  return h('div', { class: 'task-detail' },
    h('div', { class: 'task-detail-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, `${t.id} · ${t.stageLabel}`),
        h('h2', {}, t.title),
        h('p', { class: 'task-scope' },
          `范围：${scopeText(t.scope)} · 开始：${t.facts && t.facts.startedAt ? when(t.facts.startedAt) : '未开始'} · 报告：${(t.facts && t.facts.report) || '无'}`)),
      h('div', { class: 'task-actions' }, actions)),
    h('div', { class: 'task-note' },
      note,
      h('button', { class: 'ghost', onclick: () => taskAction('task.note', { text: S.taskNote }) }, '记录')),
    h('h3', { class: 'section-title' }, `输入 · ${(t.inputs || []).length}`),
    timeline);
}

function viewTasks() {
  if (!S.book) return h('div');
  const cols = [
    { key: 'queued', label: '排队', stages: ['queued'] },
    { key: 'working', label: '进行中', stages: ['working', 'idle'] },
    { key: 'person', label: '等人', stages: ['review', 'blocked', 'failed'] },
    { key: 'done', label: '完成', stages: ['done'] },
  ];
  const board = h('div', { class: 'task-board' }, cols.map((col) => {
    const items = S.tasks.filter((t) => col.stages.includes(t.stage));
    return h('div', { class: 'task-col' },
      h('div', { class: 'task-col-head' }, h('b', {}, col.label), h('span', {}, items.length)),
      items.length ? items.map(taskCard) : h('p', { class: 'hint task-empty' }, '空'));
  }));

  const title = h('input', { class: 'field', placeholder: '要做什么，例如：把第一章改成第一人称', autocomplete: 'off' });
  const chapters = h('input', { class: 'field grow', placeholder: '章节文件名，逗号分隔（可选）', autocomplete: 'off' });
  const form = h('form', {
    class: 'new-task',
    onsubmit: async (e) => {
      e.preventDefault();
      const text = title.value.trim();
      if (!text) return title.focus();
      try {
        const r = await api('task.create', { method: 'POST', space: S.space, fields: { title: text, chapters: chapters.value.trim() } });
        title.value = ''; chapters.value = '';
        S.task = r.fields.task;
        S.taskNote = '';
        await refreshTasks();
        toast('任务已立项');
      } catch (err) { toast(err.message, 'error'); }
    },
  }, title, chapters, h('button', { class: 'primary', type: 'submit' }, '立项'));

  return h('section', { class: 'pane' },
    h('div', { class: 'pane-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, '任务'), h('h1', {}, '看板')),
      h('div', { class: 'stat' },
        h('b', {}, S.tasks.filter((t) => t.stage !== 'done').length),
        h('span', {}, '件未完成'))),
    form, board,
    S.task ? taskDetail(S.task) : null);
}

function appStatusLabel(status) {
  return {
    running: '运行中',
    ready: '已就绪',
    stopped: '未启动',
    missing: '未找到',
    internal: '系统内',
  }[status] || status || '';
}

function appIcon(id) {
  if (id === 'graph') return 'graph';
  if (id === 'shelf') return 'shelf';
  return 'apps';
}

function viewApps() {
  const cards = [
    {
      id: 'shelf', name: '书房', kind: 'internal', status: 'internal',
      description: '书目、正文、总纲、人物、任务与导出。',
      note: 'NexlOS 自带的写作空间',
    },
    ...S.apps,
  ].map((a) => {
    const isInternal = a.id === 'shelf';
    const busy = S.appBusy === a.id;
    const missing = !isInternal && a.status === 'missing';
    return h('article', { class: 'app-card' },
      h('div', { class: 'app-icon' }, icon(a.icon || appIcon(a.id))),
      h('div', { class: 'app-body' },
        h('div', { class: 'app-title' },
          h('b', {}, a.name),
          h('span', { class: `app-status status-${a.status}` }, appStatusLabel(a.status))),
        h('p', {}, a.description || ''),
        h('small', {}, a.note || ''),
        h('div', { class: 'app-actions' },
          h('button', {
            class: 'primary',
            disabled: missing || busy,
            onclick: isInternal ? () => navigate('shelf') : () => openApp(a.id),
          }, busy ? '打开中…' : isInternal ? '进入书房' : a.kind === 'internal' || a.kind === 'bundle' ? '打开' : a.status === 'running' ? '打开' : '启动并打开'),
          h('span', { class: 'app-tag' },
            a.kind === 'bundle' ? '应用' : a.kind === 'web' ? 'Web' : a.kind === 'native' ? '本机 App' : '内置'))));
  });

  return h('section', { class: 'pane' },
    h('div', { class: 'pane-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, '启动台'), h('h1', {}, '本机应用')),
      h('div', { class: 'row-actions' },
        h('button', { class: 'ghost', onclick: () => { location.hash = '#/store'; } }, '软件安装'),
        h('button', {
          class: 'ghost',
          onclick: async () => {
            try { await loadViewData(); render(); toast('状态已刷新'); }
            catch (e) { toast(e.message, 'error'); }
          },
        }, '刷新状态'))),
    h('p', { class: 'app-lede' }, 'NexlOS 是这台机器上的入口。关系图谱只读交换区里的 Markdown。'),
    h('div', { class: 'app-grid' }, cards));
}

async function openApp(id) {
  // 已安装的签名包：代码在宿主 apps/<id>/current，窗口里只加载 /x/<id>/。
  // 不经过 app.open，省掉一次往返；权限与尺寸都来自 manifest。
  const bundle = (S.apps || []).filter((a) => a.id === id && a.kind === 'bundle')[0];
  if (bundle) {
    openAppWindow(bundle.route || `/x/${encodeURIComponent(id)}/`, bundle.name || id, bundle.window, {
      id, digest: bundle.digest, capabilities: bundle.capabilities, permissions: bundle.permissions,
    });
    return;
  }
  // 内置应用本身就是一条 hash 路由（artcraftport、便捷办公、终端…），直接跳转。
  // 服务端 app.open 只负责生成应用；内置应用走 hash 路由。
  const internal = (S.apps || []).filter((a) => a.id === id && a.kind === 'internal')[0];
  if (internal && internal.route) {
    closeAppWindow();
    if (location.hash === internal.route) route();
    else location.hash = internal.route;
    return;
  }
  if (S.appBusy) return;
  S.appBusy = id;
  render();
  try {
    const r = await api('app.open', { method: 'POST', fields: { app: id } });
    const d = r.detail || {};
    if (d.embed && d.url) {
      openAppWindow(d.url, d.name || id, d.window, {
        id, digest: d.digest, capabilities: d.capabilities, permissions: d.permissions,
      });
    }
    toast(d.message || '已打开');
    await loadViewData();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    S.appBusy = '';
    render();
  }
}

let appBridge = null;

function closeAppWindow() {
  if (appBridge && window.NexlOSHost) window.NexlOSHost.detach(appBridge);
  appBridge = null;
  const stale = document.getElementById('app-window');
  if (stale) stale.remove();
  document.body.classList.remove('app-window-open');
}

function openAppWindow(url, name, win, bridge) {
  closeAppWindow();
  // sandbox 刻意不带 allow-same-origin：应用拿到的是不透明源，
  // 读不到内核 cookie，也不能用同源 fetch 直接调 /c/。所有宿主能力走 bridge。
  const frame = h('iframe', {
    class: 'app-frame',
    sandbox: 'allow-scripts allow-forms allow-popups allow-downloads allow-modals',
    src: url,
    title: name,
  });
  // 登记帧之后客户端会主动 ping；能力与权限都来自已验签的清单。
  if (bridge && bridge.id && window.NexlOSHost) {
    appBridge = window.NexlOSHost.attach(frame, {
      id: bridge.id, digest: bridge.digest, name,
      capabilities: bridge.capabilities, permissions: bridge.permissions,
    });
  }
  const panel = h('div', { class: 'app-window-panel' },
    h('div', { class: 'app-window-bar' },
      h('div', { class: 'app-window-title' }, `${name} · 内嵌窗口`),
      h('div', { class: 'app-window-actions' },
        h('a', { class: 'ghost', href: url, target: '_blank', rel: 'noopener' }, '新标签打开'),
        h('button', { class: 'ghost', onclick: closeAppWindow }, '关闭'))),
    h('div', { class: 'app-window-body' }, frame));
  // manifest 声明的默认窗口尺寸；没有声明就铺满可用区域。
  if (win && win.width > 0 && win.height > 0) {
    panel.style.width = `${win.width}px`;
    panel.style.height = `${win.height}px`;
    if (win.minWidth > 0) panel.style.minWidth = `${win.minWidth}px`;
    if (win.minHeight > 0) panel.style.minHeight = `${win.minHeight}px`;
  }
  const overlay = h('div', { class: 'app-window-overlay', id: 'app-window' }, panel);
  document.body.append(overlay);
  document.body.classList.add('app-window-open');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAppWindow();
});

function viewShelf() {
  const grid = h('div', { class: 'book-grid' });
  for (const b of S.books) {
    grid.append(h('button', { class: 'book-card', onclick: () => navigate('chapters', b.id) },
      h('span', { class: 'book-spine' }),
      h('span', { class: 'book-body' },
        h('b', { 'data-i18n-skip': true }, b.title),
        h('i', { 'data-i18n-skip': !!b.author }, b.author || '未署作者'),
        h('small', {}, `${b.chapters} 章 · ${fmt(b.words)} 字 · ${b.updatedAt ? formatDate(b.updatedAt) : ''}`))));
  }
  if (!S.books.length) {
    grid.append(h('div', { class: 'empty-card' },
      h('p', { class: 'eyebrow' }, '开始'),
      h('h2', {}, '还没有书'),
      h('p', {}, '建一本，目录就成了空间，正文就是 Markdown。')));
  }

  const name = h('input', { class: 'field', placeholder: '书名', autocomplete: 'off' });
  const author = h('input', { class: 'field', placeholder: '作者（可选）', autocomplete: 'off' });
  const form = h('form', {
    class: 'new-book',
    onsubmit: async (e) => {
      e.preventDefault();
      const title = name.value.trim();
      if (!title) return name.focus();
      try {
        const r = await api('novel.create', { method: 'POST', fields: { name: title, title, author: author.value.trim() } });
        name.value = ''; author.value = '';
        S.books = (await api('novel.list')).append;
        navigate('chapters', r.detail.created);
        toast('书已建好');
      } catch (err) { toast(err.message, 'error'); }
    },
  }, name, author, h('button', { class: 'primary', type: 'submit' }, '建立'));

  return h('section', { class: 'pane' },
    h('div', { class: 'pane-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, '书房'), h('h1', {}, '你的书')),
      h('div', { class: 'stat' }, h('b', {}, fmt(S.books.length)), h('span', {}, '本'))),
    form, grid);
}

function viewChapters() {
  if (!S.book) return h('div');
  const list = h('aside', { class: 'chapter-list' });
  for (const c of S.chapters) {
    list.append(h('button', {
      class: `chapter-row${S.chapter && S.chapter.file === c.file ? ' active' : ''}`,
      onclick: async () => {
        await saveQueue.flush();
        S.chapter = c;
        const r = await api('chapter.read', { space: S.space, query: { chapter: c.file } });
        S.text = r.fields.chapter.text;
        S.dirty = false; S.savedAt = null;
        localStorage.setItem(`nexlos.chapter:${S.space}`, c.file);
        render();
      },
    }, h('span', { class: 'chapter-title', 'data-i18n-skip': true }, c.title), h('span', { class: 'chapter-words' }, fmt(c.words))));
  }
  if (!S.chapters.length) {
    list.append(h('p', { class: 'hint' }, '还没有章节。'));
  }

  const addBtn = h('button', {
    class: 'ghost add-chapter', onclick: async () => {
      await saveQueue.flush();
      const r = await api('chapter.create', { method: 'POST', space: S.space, fields: { title: `第 ${S.chapters.length + 1} 章` } });
      S.chapters = (await api('chapter.list', { space: S.space })).append;
      const created = S.chapters.find((c) => c.file === r.append[0].file);
      if (created) {
        S.chapter = created;
        const rr = await api('chapter.read', { space: S.space, query: { chapter: created.file } });
        S.text = rr.fields.chapter.text;
        S.dirty = false; S.savedAt = null;
      }
      render();
      const ed = document.querySelector('.editor');
  if (ed) ed.focus();
    },
  }, '+ 新章');

  let body;
  if (S.chapter) {
    const area = h('textarea', {
      class: 'editor', spellcheck: 'false', value: S.text,
      oninput: (e) => {
        S.text = e.target.value; S.dirty = true;
        const wc = document.querySelector('.word-count');
        if (wc) wc.textContent = `${fmt((S.text.match(/[\u3400-\u9fff]|[A-Za-z0-9]+/g) || []).length)} 字`;
        renderHeader(); saveQueue();
      },
      onkeydown: (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveQueue.flush(); }
      },
    });
    body = h('div', { class: 'editor-wrap' },
      h('div', { class: 'editor-bar' },
        h('span', { class: 'word-count' }, `${fmt(S.chapter.words)} 字`),
        h('span', { class: 'hint' }, '⌘S 保存 · 自动保存')),
      area);
  } else {
    body = h('div', { class: 'center empty-editor' },
      h('p', { class: 'eyebrow' }, '正文'),
      h('h2', {}, S.chapters.length ? '从左侧选一章' : '写下第一章'),
      h('p', {}, '纯 Markdown，保存在书的目录里，随时可以带走。'));
  }

  return h('section', { class: 'pane chapters' },
    h('div', { class: 'chapters-head' }, h('div', {}, h('p', { class: 'eyebrow' }, '正文'), h('h1', {}, `${S.chapters.length} 章`)), addBtn),
    h('div', { class: 'chapters-body' }, list, body));
}

function viewOutline() {
  if (!S.book) return h('div');
  const area = h('textarea', {
    class: 'editor outline-editor', spellcheck: 'false', value: S.outline,
    oninput: (e) => { S.outline = e.target.value; S.dirty = true; renderHeader(); saveQueue(); },
    onkeydown: (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveQueue.flush(); } },
  });
  return h('section', { class: 'pane' },
    h('div', { class: 'pane-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, '总纲'), h('h1', {}, '骨架')),
      h('span', { class: 'hint' }, 'Markdown · 自动保存')),
    h('div', { class: 'editor-wrap wide' }, area));
}

function viewCast() {
  if (!S.book) return h('div');
  const rows = h('div', { class: 'cast-rows' });
  const sync = () => { S.dirty = true; renderHeader(); saveQueue(); };
  S.cast.forEach((p, i) => {
    rows.append(h('div', { class: 'cast-row' },
      h('input', { class: 'field', value: p.name || '', placeholder: '姓名', oninput: (e) => { S.cast[i].name = e.target.value; sync(); } }),
      h('input', { class: 'field', value: p.role || '', placeholder: '身份 / 功能', oninput: (e) => { S.cast[i].role = e.target.value; sync(); } }),
      h('input', { class: 'field grow', value: p.note || '', placeholder: '欲望、秘密、口头禅', oninput: (e) => { S.cast[i].note = e.target.value; sync(); } }),
      h('button', { class: 'ghost danger', title: '删除', onclick: () => { S.cast.splice(i, 1); sync(); render(); } }, '×')));
  });
  if (!S.cast.length) rows.append(h('p', { class: 'hint' }, '还没有人物。'));

  return h('section', { class: 'pane' },
    h('div', { class: 'pane-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, '人物'), h('h1', {}, `${S.cast.length} 人`)),
      h('button', { class: 'ghost', onclick: () => { S.cast.push({ name: '', role: '', note: '' }); S.dirty = true; render(); } }, '+ 加一个人')),
    rows);
}

function viewExport() {
  if (!S.book) return h('div');
  const href = `/s/${encodeURIComponent(S.space)}/c/export.markdown?download=1`;
  return h('section', { class: 'pane' },
    h('div', { class: 'pane-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, '导出'), h('h1', {}, '整本 Markdown')),
      h('div', { class: 'row-actions' },
        h('a', { class: 'primary', href, download: '' }, '下载 .md'),
        h('button', { class: 'ghost', onclick: async () => {
          // 局域网 http 没有 navigator.clipboard；execCommand 在非安全上下文仍可用。
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(S.exportText);
          } else {
            const ta = document.createElement('textarea');
            ta.value = S.exportText; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.append(ta); ta.select();
            try { document.execCommand('copy'); } finally { ta.remove(); }
          }
          toast('已复制全文');
        } }, '复制'))),
    h('pre', { class: 'export-preview' }, S.exportText || '（空）'));
}

function viewSystem() {
  const d = (S.status && S.status.detail) || {};
  const rows = (S.status && S.status.append) || [];
  return h('section', { class: 'pane' },
    h('div', { class: 'pane-head' }, h('div', {}, h('p', { class: 'eyebrow' }, '系统'), h('h1', {}, '内核'))),
    h('dl', { class: 'kv' },
      Object.entries(d).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, String(v))))),
    h('h2', { class: 'section-title' }, `命令目录 · ${rows.length}`),
    h('div', { class: 'cmd-table' },
      rows.map((c) => h('div', { class: 'cmd-row' }, h('code', {}, c.name), h('span', {}, c.help), h('i', {}, c.method)))));
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => saveQueue.flush());

(async function boot() {
  try {
    // 应用窗口里的 iframe 用 ?embed=1 打开：隐藏外层顶栏，只保留应用自己的侧栏和内容。
    const embedded = new URLSearchParams(location.search).get('embed') === '1';
    if (embedded) document.body.classList.add('embed');
    // replaceState 不触发 hashchange，避免首屏挂载两次桌面。
    if (!location.hash) history.replaceState(null, '', embedded ? '#/shelf' : '#/desktop');
    bootProgress(14);
    setTimeout(() => bootProgress(42), 260);
    setTimeout(() => bootProgress(78), 900);
    // 首次进入先过一遍 hello 引导：语言在桌面挂载前定下来。
    if (!embedded) await showHello();
    await route();
  } catch (e) {
    document.getElementById('boot').innerHTML = `<p class="boot-error">${e.message}</p>`;
  }
})();
