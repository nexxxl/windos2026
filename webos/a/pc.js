import { getLanguage, t } from './i18n.js';
import { h, clear, api } from './can.js';
import { pixelMarkup } from './classicicons.js';

// “此电脑”是 NEXLOS_HOME 的真实目录树：列目录、进文件夹、看文本、建文件夹都走 Go 的 fs.* 命令。
// 交互按 Windows 10 资源管理器做：命令栏 → 地址栏 → 导航窗格 + 详细信息列表 → 状态栏。
// 所有长驻状态只在这里，DOM 一次搭好，切目录只重画列表与地址栏，避免整页闪烁。
//
// 0.6.0 起补上文件管理器的基本盘：多选、回收站、复制/剪切/粘贴、重命名、
// 手机抽屉导航与键盘操作。选择状态只切 class，不重建列表——批量选 200 项也不卡。

// 资源管理器里的小图标：文件夹、文本、图片、未知文件、磁盘。
// 都画在 20×20 里，尺寸由 CSS 决定，和高分屏缩放无关。
const GLYPHS = {
  folder: `
    <path fill="#E9A81C" d="M1.5 4.5A1.7 1.7 0 0 1 3.2 2.8h4.2l1.5 1.9h7.9a1.7 1.7 0 0 1 1.7 1.7v8.9a1.7 1.7 0 0 1-1.7 1.7H3.2a1.7 1.7 0 0 1-1.7-1.7z"/>
    <path fill="#F8CB4B" d="M1.5 8.1h17v7.2a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5z"/>
  `,
  file: `
    <path fill="#FFFFFF" d="M4 1.5h8l4 4v13H4z"/>
    <path fill="#D6DCE3" d="M12 1.5v4h4z"/>
    <path fill="none" stroke="#B6C0CA" d="M4 1.5h8l4 4v13H4z"/>
  `,
  text: `
    <path fill="#FFFFFF" d="M4 1.5h8l4 4v13H4z"/>
    <path fill="#D6DCE3" d="M12 1.5v4h4z"/>
    <path fill="none" stroke="#B6C0CA" d="M4 1.5h8l4 4v13H4z"/>
    <path stroke="#4A90C4" stroke-width="1.2" stroke-linecap="round" d="M6.6 9.2h7M6.6 11.8h7M6.6 14.4h4.6"/>
  `,
  image: `
    <rect x="2.6" y="3.6" width="14.8" height="12.8" rx="1" fill="#FFFFFF" stroke="#B6C0CA"/>
    <circle cx="6.7" cy="7.6" r="1.5" fill="#F2B33D"/>
    <path fill="#5AA469" d="m3.4 15.4 4.5-5.2 3.1 3.4 2.2-2.2 4.1 4z"/>
  `,
  disk: `
    <rect x="1.5" y="4.5" width="17" height="11" rx="2" fill="#8C9AA8"/>
    <rect x="1.5" y="10.6" width="17" height="4.9" rx="2" fill="#6D7C8A"/>
    <circle cx="15.2" cy="13" r="0.9" fill="#BDEFC2"/>
  `,
  trash: `
    <path fill="#FFFFFF" d="M5 5.5h10l-1 13H6z"/>
    <path fill="none" stroke="#B6C0CA" d="M3.5 5.5h13M7.5 5.5V3.2h5v2.3M8.5 8.5v7M11.5 8.5v7"/>
  `,
};

// 扩展名 → 图标键；未知类型统一给白纸，和 Win10 的“未知文件”一致。
const IMAGE_EXT = { '.jpg': 1, '.jpeg': 1, '.png': 1, '.gif': 1, '.webp': 1, '.bmp': 1 };
const TEXT_EXT = { '.md': 1, '.txt': 1, '.log': 1, '.json': 1, '.js': 1, '.mjs': 1, '.css': 1, '.html': 1, '.go': 1, '.csv': 1, '.yml': 1, '.yaml': 1, '.sh': 1, '.toml': 1, '.ini': 1, '.reg': 1 };

function glyph(kind, cls = '') {
  const body = GLYPHS[kind] || GLYPHS.file;
  const classic = pixelMarkup({ text: 'document', file: 'document', disk: 'pc', image: 'draw' }[kind] || kind);
  return h('svg', { class: `xp-glyph ${cls}`.trim(), viewBox: '0 0 20 20', 'aria-hidden': 'true',
    html: `<g class="nexlos-modern-icon">${body}</g><g class="nexlos-classic-icon" transform="scale(.625)">${classic}</g>`,
  });
}

function entryGlyph(entry) {
  if (entry.kind === 'folder') return glyph('folder');
  if (IMAGE_EXT[entry.ext]) return glyph('image');
  if (TEXT_EXT[entry.ext]) return glyph('text');
  return glyph('file');
}

function pad(n) { return String(n).padStart(2, '0'); }

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Win10 的大小列：文件夹留空，文件用 KB / MB，保留一位小数。
function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// 占用条按行取色：目录名是用户的书名，不能靠固定 class 上色。
const USAGE_COLORS = ['#0078d4', '#00b294', '#8764b8', '#ff8c00', '#e81123', '#498205', '#2d7d9a', '#b146c2'];

function joinPath(parent, name) {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}

function parentPath(path) {
  if (path === '/' || !path) return '/';
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
}

function baseName(path) {
  if (path === '/') return '此电脑';
  const parts = path.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '此电脑';
}

// 「文稿」是便捷办公的工作区，在资源管理器里作为快速访问的常驻文件夹出现。
// 这里不列磁盘上的 .office.json 模型，而是读便捷办公的目录接口，
// 所以用户看到的是「未命名文档.docx」这样的真实名字，双击就进编辑器。
const DOCS_PATH = '/文稿';
const OFFICE_API = '/a/office/api';
const OFFICE_EXT = { doc: '.docx', sheet: '.xlsx', slide: '.pptx', markdown: '.md', html: '.html', pdf: '.pdf' };
const OFFICE_LABEL = {
  doc: 'Word 文档', sheet: 'Excel 工作簿', slide: 'PowerPoint 演示文稿',
  markdown: 'Markdown 文档', html: 'HTML 网页', pdf: 'PDF 文档',
};

// 从 #/pc/文稿 这类深链接里取出目标目录；没有就回此电脑根。
function hashPath() {
  const hash = location.hash || '';
  if (hash.indexOf('#/pc/') !== 0) return '/';
  try {
    const tail = decodeURIComponent(hash.slice(5)) || '/';
    return tail.charAt(0) === '/' ? tail : `/${tail}`;
  } catch (e) {
    return '/';
  }
}

const PREFS_KEY = 'nexlos.pc.prefs.v1';

// 只持久化偏好，不持久化选择：换用户或刷新后不该带着上一轮的勾选。
function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function mountPC(host) {
  const prefs = readPrefs();
  const S = {
    path: hashPath(),
    entries: [],
    detail: { crumbs: [{ name: '此电脑', path: '/' }], folders: 0, files: 0, bytes: 0, parent: '/' },
    usage: null,
    ws: null,
    sel: {},          // { '/inbox/a.md': 1 }：对象比 Set 好序列化，也避免 Chrome 72 的兼容顾虑
    anchor: '',       // Shift 连选的锚点
    clip: null,       // { mode: 'copy' | 'cut', paths: [] }
    sortKey: prefs.sortKey || 'name',
    sortDir: prefs.sortDir === -1 ? -1 : 1,
    dirFirst: prefs.dirFirst !== false,
    hidden: prefs.hidden === true,
    view: prefs.view === 'icons' ? 'icons' : 'details',
    query: '',
    loading: true,
    error: '',
    compact: false,
    drawer: false,
    note: null,       // 记事本：{ name, path, text, size, mod }
    prop: null,       // 属性：{ entry, path }
    rename: null,     // 重命名：{ path, name }
    confirm: null,    // 确认框：{ title, text, ok, danger, run }
    ctx: null,        // 右键菜单
  };
  const back = [];
  const fwd = [];
  let loadVersion = 0;
  let sideClipKey = '';
  let sideNote = null;

  function writePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        sortKey: S.sortKey, sortDir: S.sortDir, dirFirst: S.dirFirst,
        hidden: S.hidden, view: S.view,
      }));
    } catch (e) { /* 隐私模式下 localStorage 会抛，偏好降级为本次会话有效 */ }
  }

  // ---------- 骨架 ----------
  const classicMenuBar = h('nav', { class: 'xp-classic-menubar', 'aria-label': '资源管理器菜单' });
  const classicMenuButtons = [];
  for (const [id, label, key] of [['file', '文件', 'F'], ['edit', '编辑', 'E'], ['view', '查看', 'V'], ['help', '帮助', 'H']]) {
    const button = h('button', {
      class: 'xp-menubar-button', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
      'aria-controls': 'xp-context-menu', dataset: { menu: id },
      onclick: () => openClassicMenu(id, button),
      onpointerenter: () => {
        if (S.ctx && S.ctx.owner && S.ctx.owner !== button) openClassicMenu(id, button);
      },
      onkeydown: (e) => {
        if (e.key !== 'ArrowDown') return;
        e.preventDefault(); e.stopPropagation();
        if (S.ctx && S.ctx.owner === button) {
          const first = ctxEl.querySelector('button:not(:disabled)');
          if (first) first.focus();
        } else openClassicMenu(id, button);
      },
    }, h('span', {}, label), ' (', h('u', {}, key), ')');
    classicMenuButtons.push(button);
    classicMenuBar.append(button);
  }
  const cmdBar = h('div', { class: 'xp-cmd' });
  const backBtn = h('button', { class: 'xp-navbtn', type: 'button', title: '后退', 'aria-label': '后退', onclick: () => goBack() });
  const fwdBtn = h('button', { class: 'xp-navbtn', type: 'button', title: '前进', 'aria-label': '前进', onclick: () => goForward() });
  const upBtn = h('button', { class: 'xp-navbtn', type: 'button', title: '向上一级', 'aria-label': '向上一级', onclick: () => goUp() });
  backBtn.append(navGlyph('back'));
  fwdBtn.append(navGlyph('forward'));
  upBtn.append(navGlyph('up'));

  const crumbsEl = h('nav', { class: 'xp-crumbs', 'aria-label': '地址' });
  const searchInput = h('input', {
    class: 'xp-search-input', type: 'search', placeholder: '搜索 此电脑', autocomplete: 'off',
    oninput: () => { S.query = searchInput.value.trim(); paintList(); paintStatus(); paintCmd(); },
    onkeydown: (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        S.query = '';
        paintList(); paintStatus(); paintCmd();
      }
      if (e.key === 'Enter') { const rows = sortedEntries(); if (rows.length === 1) openEntry(rows[0]); }
    },
  });
  const searchBox = h('label', { class: 'xp-search' }, searchGlyph(), searchInput);

  const addrBar = h('div', { class: 'xp-addr' },
    h('div', { class: 'xp-nav' }, backBtn, fwdBtn, upBtn),
    crumbsEl,
    searchBox);

  const sideEl = h('aside', { class: 'xp-side', 'aria-label': '导航窗格' });
  const listEl = h('div', { class: 'xp-listwrap', tabindex: '-1', 'data-i18n-content': '松开即上传到当前文件夹' });
  const selBar = h('div', { class: 'xp-selbar', hidden: true });
  const statusEl = h('footer', { class: 'xp-status' });
  const scrim = h('div', { class: 'xp-scrim', hidden: true, onclick: () => closeDrawer() });
  const cmdRight = h('div', { class: 'xp-cmd-right' });
  const drawerBtn = h('button', {
    class: 'xp-cmd-btn xp-drawer-btn', type: 'button', title: '导航窗格', 'aria-label': '打开导航窗格',
    onclick: () => (S.drawer ? closeDrawer() : openDrawer()),
  }, cmdGlyph('menu'));

  const viewBtn = h('button', {
    class: 'xp-cmd-btn', type: 'button', title: '切换视图',
    onclick: () => { S.view = S.view === 'details' ? 'icons' : 'details'; writePrefs(); paintCmd(); paintList(); },
  }, cmdGlyph('view'), h('span', {}, '查看'));
  const newBtn = h('button', {
    class: 'xp-cmd-btn', type: 'button', title: '在当前文件夹新建文件夹',
    onclick: () => createFolder(),
  }, cmdGlyph('newfolder'), h('span', {}, '新建'));
  const uploadInput = h('input', {
    type: 'file', multiple: true, style: 'display:none',
    onchange: () => { uploadFiles(uploadInput.files); uploadInput.value = ''; },
  });
  const uploadBtn = h('button', {
    class: 'xp-cmd-btn', type: 'button', title: '把文件传到当前文件夹（也可以直接拖进来）',
    onclick: () => uploadInput.click(),
  }, cmdGlyph('upload'), h('span', {}, '上传'));
  const downloadBtn = h('button', {
    class: 'xp-cmd-btn', type: 'button', title: '下载选中的文件到本机', disabled: true,
    onclick: () => downloadSelection(),
  }, cmdGlyph('download'), h('span', {}, '下载'));
  const moreBtn = h('button', {
    class: 'xp-cmd-btn', type: 'button', title: '更多选项', 'aria-label': '更多选项',
    onclick: () => openMore(),
  }, cmdGlyph('more'));
  cmdBar.append(h('div', { class: 'xp-cmd-left' }, drawerBtn, newBtn, uploadBtn, uploadInput), cmdRight);
  cmdRight.append(downloadBtn, viewBtn, moreBtn);

  // 拖拽上传：文件落到当前目录，不上传目录。
  listEl.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || Array.from(e.dataTransfer.types || []).indexOf('Files') < 0) return;
    e.preventDefault();
    frame.classList.add('xp-drop');
  });
  listEl.addEventListener('dragleave', (e) => {
    if (e.target === listEl) frame.classList.remove('xp-drop');
  });
  listEl.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    frame.classList.remove('xp-drop');
    uploadFiles(e.dataTransfer.files);
  });

  const ctxEl = h('div', { class: 'xp-ctx', id: 'xp-context-menu', hidden: true, role: 'menu' });
  const dialogLayer = h('div', { class: 'xp-dialog-layer', hidden: true });

  const frame = h('div', { class: 'xp' },
    classicMenuBar, cmdBar, addrBar,
    h('div', { class: 'xp-body' }, sideEl,
      h('div', { class: 'xp-content' }, listEl, selBar, statusEl)),
    scrim, ctxEl, dialogLayer);
  host.append(frame);

  // 资源管理器跟随桌面设置：强调色用于焦点与主按钮，深色主题整套换底色。
  function applyPrefs(p) {
    p = p || {};
    if (p.accent) frame.style.setProperty('--xp-accent', p.accent);
    if (p.theme) frame.classList.toggle('xp-dark', p.theme === 'dark');
  }
  function onPrefsMessage(e) {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    if (e.source === window.parent && e.data.type === 'nexlos.fs.refresh') {
      if (!S.note || !S.note.dirty) load(e.data.path || S.path);
      return;
    }
    if (e.data.type === 'nexlos.settings') applyPrefs(e.data.patch);
  }
  function onResize() {
    const compact = window.innerWidth <= 760;
    if (compact !== S.compact) {
      S.compact = compact;
      if (!compact) closeDrawer();
      paintCmd();
    }
  }
  window.addEventListener('message', onPrefsMessage);
  window.addEventListener('resize', onResize);
  api('settings.get').then((r) => applyPrefs(r.detail || {})).catch(() => {});

  // ---------- 抽屉（手机导航） ----------
  function openDrawer() {
    S.drawer = true;
    frame.classList.add('drawer-open');
    scrim.hidden = false;
    drawerBtn.setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    S.drawer = false;
    frame.classList.remove('drawer-open');
    scrim.hidden = true;
    drawerBtn.setAttribute('aria-expanded', 'false');
  }

  // ---------- 数据 ----------
  async function load(path, opts) {
    opts = opts || {};
    const version = ++loadVersion;
    // 列表重绘时不能让侧栏焦点落到 body：记下点击来源，收尾时焦点若落空就还给同一项。
    const navFocusPath = document.activeElement && document.activeElement.classList
      && document.activeElement.classList.contains('xp-side-item') ? document.activeElement.dataset.path : null;
    if (path !== S.path || S.detail.path !== path) {
      // The address owns the pending/error page too; never leave a failed
      // navigation's Retry button pointing at the directory we just left.
      S.path = path;
      const crumbs = [{ name: '此电脑', path: '/' }];
      let crumbPath = '';
      path.split('/').filter(Boolean).forEach((name) => {
        crumbPath += `/${name}`;
        crumbs.push({ name, path: crumbPath });
      });
      S.detail = { path, parent: parentPath(path), crumbs, folders: 0, files: 0, bytes: 0 };
      S.entries = [];
      S.usage = null;
      S.ws = null;
    }
    S.loading = true;
    S.error = '';
    S.query = '';
    searchInput.value = '';
    if (!opts.keepSel) clearSel();
    if (!opts.keepDrawer) closeDrawer();
    paintAll();
    try {
      let r;
      if (path === DOCS_PATH) r = await loadDocs();
      else {
        const query = { path };
        if (S.hidden) query.hidden = '1';
        r = await api('fs.list', { query });
      }
      if (version !== loadVersion) return;
      let usage = null;
      let ws = null;
      if ((r.detail.path || path) === '/') {
        [usage, ws] = await Promise.all([
          api('fs.usage').catch(() => null),
          api('workspace.info').catch(() => null),
        ]);
        if (version !== loadVersion) return;
      }
      S.path = r.detail.path || path;
      S.detail = r.detail;
      S.entries = r.append || [];
      S.usage = usage;
      S.ws = ws;
    } catch (e) {
      if (version === loadVersion) S.error = e.message;
    } finally {
      // Older directory, office and drive-summary requests must not repaint
      // after a newer navigation (or after this app has been destroyed).
      if (version === loadVersion) {
        S.loading = false;
        paintAll();
        if (navFocusPath && document.activeElement === document.body) {
          const item = [...sideEl.querySelectorAll('.xp-side-item')].find(el => el.dataset.path === navFocusPath);
          if (item) item.focus({ preventScroll: true });
        }
      }
    }
  }

  // 文稿只存办公文件：条目来自便捷办公的模型目录，但显示成普通文件。
  async function loadDocs() {
    const res = await fetch(`${OFFICE_API}/files`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const files = data.files || [];
    const entries = files.map((f) => {
      const ext = OFFICE_EXT[f.kind] || '.docx';
      return {
        name: f.title + ext,
        kind: 'file',
        kindLabel: OFFICE_LABEL[f.kind] || '文档',
        size: f.size || 0,
        mod: f.updatedAt || '',
        ext,
        officeId: f.id,
        officeRev: f.rev,
        officeKind: f.kind,
      };
    });
    let bytes = 0;
    for (const e of entries) bytes += e.size;
    return { append: entries, detail: {
      path: DOCS_PATH,
      parent: '/',
      crumbs: [{ name: '此电脑', path: '/' }, { name: '文稿', path: DOCS_PATH }],
      folders: 0,
      files: entries.length,
      bytes,
    } };
  }

  function navigate(path) {
    if (path === S.path) { if (S.error) load(path); return; }
    back.push(S.path);
    fwd.length = 0;
    load(path);
  }

  function goBack() {
    if (!back.length) return;
    fwd.push(S.path);
    load(back.pop());
  }
  function goForward() {
    if (!fwd.length) return;
    back.push(S.path);
    load(fwd.pop());
  }
  function goUp() {
    const up = S.detail.parent || '/';
    if (up !== S.path) navigate(up);
  }

  // ---------- 地址栏 ----------
  function paintAddress() {
    const focused = crumbsEl.contains(document.activeElement) ? document.activeElement.dataset.path : null;
    clear(crumbsEl);
    const crumbs = (S.detail && S.detail.crumbs) || [{ name: '此电脑', path: '/' }];
    crumbs.forEach((c, i) => {
      if (i) crumbsEl.append(h('span', { class: 'xp-crumb-sep' }, '›'));
      const active = i === crumbs.length - 1;
      crumbsEl.append(h('button', {
        class: `xp-crumb${active ? ' active' : ''}`, type: 'button', title: c.path,
        dataset: { path: c.path },
        'aria-current': active ? 'location' : null,
        onclick: () => navigate(c.path),
      }, crumbGlyph(i === 0, active), h('span', { 'data-i18n-skip': i !== 0 }, c.name)));
    });
    if (focused != null) {
      const match = Array.from(crumbsEl.querySelectorAll('.xp-crumb')).find((el) => el.dataset.path === focused);
      if (match) match.focus({ preventScroll: true });
    }
    backBtn.disabled = !back.length;
    fwdBtn.disabled = !fwd.length;
    upBtn.disabled = S.path === '/';
    searchInput.placeholder = `搜索 ${baseName(S.path)}`;
  }

  // ---------- 导航窗格 ----------
  function sideItem(label, path, icon) {
    return h('button', {
      class: `xp-side-item${S.path === path ? ' active' : ''}`, type: 'button',
      dataset: { path },
      onclick: (e) => { e.currentTarget.focus({ preventScroll: true }); navigate(path); },
    }, icon, h('span', {}, label));
  }

  function paintSide() {
    // Navigation buttons keep their identity and focus across directory loads.
    // Rebuilding this pane used to focus the old active row during loading,
    // then discard the clicked button (and :focus-within) when loading ended.
    if (!sideEl.firstChild) {
      sideEl.append(h('div', { class: 'xp-side-group' },
        h('div', { class: 'xp-side-head' }, sideGlyph('star'), h('span', {}, '快速访问')),
        sideItem('应用', '/apps', glyph('folder')),
        sideItem('库', '/vaults', glyph('folder')),
        sideItem('日志', '/logs', glyph('folder')),
        sideItem('文稿', DOCS_PATH, glyph('folder'))));
      sideEl.append(h('div', { class: 'xp-side-group' },
        h('div', { class: 'xp-side-head' }, sideGlyph('workspace'), h('span', {}, '工作区')),
        // 记忆树真实位置在交换区下面；写成 /memory 会指向不存在的 home/memory。
        sideItem('记忆树', '/nexl交换区/记忆树', sideGlyph('memory')),
        sideItem('收件箱', '/inbox', sideGlyph('inbox')),
        sideItem('发件箱', '/outbox', sideGlyph('outbox'))));
      sideEl.append(h('div', { class: 'xp-side-group' },
        h('div', { class: 'xp-side-head' }, sideGlyph('pc'), h('span', {}, '此电脑')),
        sideItem('NexlOS (C:)', '/', glyph('disk')),
        sideItem('回收站', '/.trash', glyph('trash'))));
    }
    sideEl.querySelectorAll('.xp-side-item').forEach((el) => {
      const active = el.dataset.path === S.path;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'location');
      else el.removeAttribute('aria-current');
    });
    const clipKey = S.clip ? JSON.stringify(S.clip) : '';
    if (clipKey === sideClipKey) return;
    sideClipKey = clipKey;
    if (sideNote) sideNote.remove();
    sideNote = null;
    if (S.clip && S.clip.paths.length) {
      // 切目录后选择会被清空，粘贴不能只挂在底部选择条上。
      sideNote = h('div', { class: 'xp-side-note' },
        h('span', {}, `${S.clip.mode === 'cut' ? '剪切' : '复制'}了 ${S.clip.paths.length} 项`),
        h('span', { class: 'xp-side-note-actions' },
          h('button', { class: 'xp-side-clear', type: 'button', onclick: () => pasteSelection() }, '粘贴'),
          h('button', { class: 'xp-side-clear', type: 'button', onclick: () => { S.clip = null; paintSide(); paintCmd(); paintSelbar(); } }, '取消')));
      sideEl.append(sideNote);
    }
  }

  // ---------- 选择 ----------
  function pathOf(entry) { return joinPath(S.path, entry.name); }

  function selCount() {
    let n = 0;
    for (const k in S.sel) if (S.sel[k]) n++;
    return n;
  }

  function selPaths() {
    const out = [];
    for (const k in S.sel) if (S.sel[k]) out.push(k);
    return out;
  }

  function isSelected(p) { return S.sel[p] === 1; }

  function clearSel() { S.sel = {}; S.anchor = ''; }

  function selectOnly(p) {
    S.sel = {};
    if (p) { S.sel[p] = 1; S.anchor = p; }
  }

  function selectToggle(p) {
    if (S.sel[p]) delete S.sel[p];
    else S.sel[p] = 1;
    S.anchor = p;
  }

  function selectRange(p) {
    const rows = sortedEntries();
    const a = rows.findIndex((x) => pathOf(x) === S.anchor);
    const b = rows.findIndex((x) => pathOf(x) === p);
    if (a < 0 || b < 0) { selectOnly(p); return; }
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    S.sel = {};
    for (let i = lo; i <= hi; i++) S.sel[pathOf(rows[i])] = 1;
    S.anchor = p;
  }

  function selectAll() {
    const rows = sortedEntries();
    S.sel = {};
    rows.forEach((e) => { S.sel[pathOf(e)] = 1; });
    S.anchor = rows.length ? pathOf(rows[0]) : '';
    markSelection(); paintStatus(); paintCmd();
  }

  // 选择只切 class，不重建 DOM：整表重建在几百项时会明显掉帧。
  function markSelection() {
    const rows = listEl.querySelectorAll('.xp-row, .xp-tile');
    for (let i = 0; i < rows.length; i++) {
      const on = isSelected(rows[i].dataset.path);
      if (on !== rows[i].classList.contains('selected')) {
        rows[i].classList.toggle('selected', on);
        rows[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
    }
    paintSelbar();
  }

  function scrollToPath(p) {
    const rows = listEl.querySelectorAll('.xp-row, .xp-tile');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].dataset.path === p) { rows[i].scrollIntoView({ block: 'nearest' }); return; }
    }
  }

  // ---------- 列表 ----------
  function sortedEntries() {
    const q = S.query.toLowerCase();
    const rows = S.entries.filter((e) => !q || e.name.toLowerCase().includes(q));
    const key = S.sortKey;
    const dir = S.sortDir;
    rows.sort((a, b) => {
      if (S.dirFirst && a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      let cmp = 0;
      if (key === 'date') cmp = String(a.mod).localeCompare(String(b.mod));
      else if (key === 'type') cmp = a.kindLabel.localeCompare(b.kindLabel, getLanguage());
      else if (key === 'size') cmp = a.size - b.size;
      else cmp = a.name.localeCompare(b.name, getLanguage());
      if (cmp === 0) cmp = a.name.localeCompare(b.name, getLanguage());
      return cmp * dir;
    });
    return rows;
  }

  function headerCell(key, label, cls) {
    const active = S.sortKey === key;
    return h('button', {
      class: `xp-col ${cls || ''}${active ? ' active' : ''}`.trim(), type: 'button',
      dataset: { sort: key },
      'aria-label': `按${label}排序`,
      onclick: () => {
        if (S.sortKey === key) S.sortDir = -S.sortDir;
        else { S.sortKey = key; S.sortDir = 1; }
        writePrefs();
        paintList();
      },
    }, h('span', {}, label), active ? h('i', { class: `xp-caret${S.sortDir < 0 ? ' up' : ''}` }) : null);
  }

  function detailsHeader() {
    return h('div', { class: 'xp-cols' },
      headerCell('name', '名称', 'name'),
      headerCell('date', '修改日期', 'date'),
      headerCell('type', '类型', 'type'),
      headerCell('size', '大小', 'size'));
  }

  function onEntryClick(e, entry) {
    const p = pathOf(entry);
    if (e.shiftKey && S.anchor) selectRange(p);
    else if (e.metaKey || e.ctrlKey) selectToggle(p);
    else if (S.compact && entry.kind === 'folder') { navigate(p); return; }
    else if (S.compact && selCount() === 1 && isSelected(p) && entry.kind === 'file') { openEntry(entry); return; }
    else selectOnly(p);
    markSelection();
    paintStatus();
    paintCmd();
  }

  function entryMenu(entry) {
    const p = pathOf(entry);
    const inTrash = S.path === '/.trash' || S.path.indexOf('/.trash/') === 0;
    const items = [
      ['打开', () => openEntry(entry)],
      entry.kind === 'file' && TEXT_EXT[entry.ext] ? ['用记事本打开', () => openText(entry)] : null,
      entry.kind === 'file' ? ['下载到本机', () => downloadEntry(entry)] : null,
      ['复制', () => clipSelection('copy')],
      ['剪切', () => clipSelection('cut')],
      inTrash ? ['还原到原位置', () => restoreSelection()] : null,
      ['重命名', () => askRename()],
      ['删除', () => askDelete()],
      ['属性', () => showProp(entry)],
    ];
    return items.filter(Boolean);
  }

  // 长按进入多选：触屏没有 Ctrl，长按是最接近资源管理器的入口。
  function bindLongPress(el, onLong) {
    let timer = 0;
    let sx = 0;
    let sy = 0;
    let fired = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      sx = e.clientX; sy = e.clientY; fired = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        fired = true;
        el._lpFired = true;
        onLong();
        if (navigator.vibrate) navigator.vibrate(12);
      }, 480);
    });
    const cancel = (e) => {
      clearTimeout(timer);
      if (e && e.type === 'pointermove' && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) fired = false;
    };
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointermove', cancel);
    el.addEventListener('click', (e) => {
      if (!fired) return;
      e.preventDefault();
      e.stopPropagation();
      fired = false;
      el._lpFired = false;
    }, true);
  }

  function row(entry) {
    const p = pathOf(entry);
    const selected = isSelected(p);
    const el = h('button', {
      class: `xp-row${selected ? ' selected' : ''}`, type: 'button', dataset: { path: p },
      'aria-selected': selected ? 'true' : 'false',
      title: `${entry.name}\n${entry.kindLabel}${entry.kind === 'file' ? ' · ' + fmtSize(entry.size) : ''}`,
      onclick: (e) => {
        if (el._lpFired) { el._lpFired = false; return; }
        onEntryClick(e, entry);
      },
      ondblclick: () => openEntry(entry),
      oncontextmenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isSelected(p)) { selectOnly(p); markSelection(); paintStatus(); paintCmd(); }
        openCtx(e.clientX, e.clientY, entryMenu(entry));
      },
    },
      h('span', { class: 'xp-name' }, entryGlyph(entry), h('span', { class: 'xp-name-text', 'data-i18n-skip': true }, entry.name)),
      h('span', { class: 'xp-date' }, fmtDate(entry.mod)),
      h('span', { class: 'xp-type' }, entry.kindLabel),
      h('span', { class: 'xp-size' }, entry.kind === 'folder' ? '' : fmtSize(entry.size)));
    bindLongPress(el, () => {
      if (!isSelected(p)) selectToggle(p);
      markSelection(); paintStatus(); paintCmd();
    });
    return el;
  }

  function iconTile(entry) {
    const p = pathOf(entry);
    const selected = isSelected(p);
    const el = h('button', {
      class: `xp-tile${selected ? ' selected' : ''}`, type: 'button', dataset: { path: p },
      'aria-selected': selected ? 'true' : 'false',
      ondblclick: () => openEntry(entry),
      onclick: (e) => {
        if (el._lpFired) { el._lpFired = false; return; }
        onEntryClick(e, entry);
      },
      oncontextmenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isSelected(p)) { selectOnly(p); markSelection(); paintStatus(); paintCmd(); }
        openCtx(e.clientX, e.clientY, entryMenu(entry));
      },
    }, entryGlyph(entry), h('span', { class: 'xp-tile-name', 'data-i18n-skip': true }, entry.name));
    bindLongPress(el, () => {
      if (!isSelected(p)) selectToggle(p);
      markSelection(); paintStatus(); paintCmd();
    });
    return el;
  }

  function groupHead(label, count) {
    return h('div', { class: 'xp-group' }, h('b', {}, label), h('span', {}, `(${count})`));
  }

  function usageCard() {
    const rows = (S.usage && S.usage.append) || [];
    const total = (S.usage && S.usage.detail && S.usage.detail.bytes) || 0;
    const files = (S.usage && S.usage.detail && S.usage.detail.files) || 0;
    const bar = h('span', { class: 'xp-drive-bar' });
    rows.forEach((r, i) => {
      if (!r.bytes || !total) return;
      bar.append(h('i', {
        style: `width:${Math.max(2, Math.round(r.bytes / total * 100))}%;background:${USAGE_COLORS[i % USAGE_COLORS.length]}`,
      }));
    });
    const ws = (S.ws && S.ws.detail) || null;
    const quota = ws && ws.quotaBytes ? ws.quotaBytes : 0;
    return h('div', { class: 'xp-drive' },
      h('div', { class: 'xp-drive-head' }, glyph('disk', 'big'),
        h('div', {}, h('b', {}, 'NexlOS (C:)'), h('i', {}, ws ? `宿主工作区 · ${ws.device || '本机'}` : '宿主工作区 · 系统盘'))),
      bar,
      h('div', { class: 'xp-drive-meta' },
        h('span', {}, quota ? `已用 ${fmtSize(total)} / 配额 ${fmtSize(quota)}` : `已用 ${fmtSize(total)}`),
        h('span', {}, `${files.toLocaleString(getLanguage())} 个文件`),
        h('span', {}, ws ? ws.root : (S.usage ? S.usage.detail.home : ''))));
  }

  function paintList() {
    const focused = document.activeElement;
    const ownedFocus = listEl.contains(focused);
    const path = ownedFocus && focused.dataset.path;
    const sort = ownedFocus && focused.dataset.sort;
    paintListContent();
    if (ownedFocus && focused !== listEl) {
      const match = Array.from(listEl.querySelectorAll('.xp-row, .xp-tile, .xp-col')).find((el) =>
        path ? el.dataset.path === path : sort && el.dataset.sort === sort);
      // A sort/view redraw can preserve the exact row/header. If navigation
      // removes it, keep keyboard focus in the list instead of dropping to body.
      (match || listEl).focus({ preventScroll: true });
    }
  }

  function paintListContent() {
    clear(listEl);
    if (S.loading) {
      listEl.append(h('div', { class: 'xp-empty' }, h('span', { class: 'xp-spinner' }), h('p', {}, '正在打开…')));
      return;
    }
    if (S.error) {
      listEl.append(h('div', { class: 'xp-empty' },
        glyph('file', 'big'),
        h('p', {}, S.error),
        h('button', { class: 'xp-btn', type: 'button', onclick: () => load(S.path) }, '重试')));
      return;
    }
    const rows = sortedEntries();
    if (S.query) {
      listEl.append(h('div', { class: 'xp-search-head' }, `“${S.query}”的搜索结果 · ${rows.length} 项`));
    }
    if (!rows.length) {
      const emptyText = S.query ? '没有匹配的项目。'
        : S.path === '/.trash' ? '回收站是空的。删除的文件会先到这里。'
          : '这个文件夹是空的。';
      listEl.append(h('div', { class: 'xp-empty' }, h('p', {}, emptyText)));
      return;
    }

    if (S.view === 'icons') {
      listEl.append(h('div', { class: 'xp-tiles' }, rows.map(iconTile)));
      return;
    }

    // “此电脑”根层按 Win10 的写法分组：文件夹在上，设备和驱动器在下。
    if (S.path === '/' && !S.query) {
      const folders = rows.filter((e) => e.kind === 'folder');
      const files = rows.filter((e) => e.kind === 'file');
      if (folders.length) {
        listEl.append(groupHead('文件夹', folders.length), h('div', { class: 'xp-table' }, detailsHeader(), folders.map(row)));
      }
      if (files.length) {
        listEl.append(groupHead('文件', files.length), h('div', { class: 'xp-table' }, detailsHeader(), files.map(row)));
      }
      if (S.usage) listEl.append(groupHead('设备和驱动器', 1), h('div', { class: 'xp-drives' }, usageCard()));
      return;
    }

    listEl.append(h('div', { class: 'xp-table' }, detailsHeader(), rows.map(row)));
  }

  function paintStatus() {
    clear(statusEl);
    const shown = sortedEntries();
    const n = selCount();
    if (n) {
      let bytes = 0;
      selPaths().forEach((p) => {
        const e = S.entries.find((x) => joinPath(S.path, x.name) === p);
        if (e && e.kind === 'file') bytes += e.size;
      });
      statusEl.append(h('span', {}, `已选择 ${n} 项`));
      if (bytes) statusEl.append(h('span', { class: 'xp-status-sel' }, `合计 ${fmtSize(bytes)}`));
    } else {
      statusEl.append(h('span', {}, `${shown.length} 个项目`));
    }
    statusEl.append(h('span', { class: 'xp-status-right' },
      `${S.detail.folders || 0} 个文件夹 · ${S.detail.files || 0} 个文件${S.hidden ? ' · 含隐藏项目' : ''}`));
  }

  function paintCmd() {
    viewBtn.title = S.view === 'details' ? '切换到大图标' : '切换到详细信息';
    // 文稿里没有子文件夹，「新建」直接建文档，按钮文案跟着换。
    const docs = S.path === DOCS_PATH;
    newBtn.title = docs ? '新建 Word 文档（Excel / PPT 在文件菜单里）' : '在当前文件夹新建文件夹';
    uploadBtn.title = docs ? '把文件导入文稿（也可以直接拖进来）' : '把文件传到当前文件夹（也可以直接拖进来）';
    const files = selPaths().filter((p) => {
      const e = S.entries.find((x) => joinPath(S.path, x.name) === p);
      return e && e.kind === 'file';
    });
    downloadBtn.disabled = !files.length;
    paintSelbar();
  }

  function selBarBtn(label, fn, cls) {
    const el = h('button', { class: `xp-selbar-btn ${cls || ''}`.trim(), type: 'button', onclick: fn }, label);
    if (cls === 'disabled') el.disabled = true;
    return el;
  }

  function paintSelbar() {
    clear(selBar);
    const n = selCount();
    if (!n) {
      selBar.hidden = true;
      return;
    }
    selBar.hidden = false;
    const inTrash = S.path === '/.trash' || S.path.indexOf('/.trash/') === 0;
    // Node.append(null) 会写成字符串 "null"，先过滤再挂。
    const kids = [
      h('span', { class: 'xp-selbar-count' }, `已选 ${n} 项`),
      selBarBtn('复制', () => clipSelection('copy')),
      selBarBtn('剪切', () => clipSelection('cut')),
      selBarBtn('粘贴', () => pasteSelection(), S.clip ? '' : 'disabled'),
      inTrash ? selBarBtn('还原', () => restoreSelection()) : null,
      selBarBtn('重命名', () => askRename(), n === 1 ? '' : 'disabled'),
      selBarBtn('删除', () => askDelete(), 'danger'),
      h('span', { class: 'xp-selbar-spacer' }),
      selBarBtn('取消', () => { clearSel(); markSelection(); paintStatus(); paintCmd(); }),
    ];
    selBar.append.apply(selBar, kids.filter(Boolean));
  }

  function paintAll() {
    paintAddress();
    paintSide();
    paintList();
    paintStatus();
    paintCmd();
  }

  // ---------- 打开文件 ----------
  async function openEntry(entry) {
    if (entry.officeId) { openOfficeDoc(entry); return; }
    if (entry.kind === 'folder') { navigate(pathOf(entry)); return; }
    const path = pathOf(entry);
    if (TEXT_EXT[entry.ext]) { openText(entry); return; }
    // 非文本类型：先让 Go 判一次，图片等类型会返回 textual=false，给一个属性卡而不是假装能打开。
    try {
      const r = await api('fs.read', { query: { path } });
      if (r.detail && r.detail.textual) S.note = { name: entry.name, path, text: r.detail.text, size: entry.size, mod: entry.mod };
      else S.prop = { entry, path, info: r.detail };
      paintDialog();
    } catch (e) {
      toast(e.message);
    }
  }

  // 双击办公文件 = 在便捷办公里打开它。桌面里开新页，
  // 避免把资源管理器窗口本身顶成编辑器；独立访问时直接跳转。
  function openOfficeDoc(entry) {
    const url = `/a/office/?doc=${encodeURIComponent(entry.officeId)}`;
    let top = false;
    try { top = window.top === window.self; } catch (e) { top = false; }
    if (top) location.href = url;
    else window.open(url, '_blank');
  }

  async function openText(entry) {
    const path = pathOf(entry);
    try {
      const r = await api('fs.read', { query: { path } });
      S.note = { name: entry.name, path, text: r.detail.text, size: r.detail.size, mod: r.detail.mod, dirty: false };
      paintDialog();
    } catch (e) {
      toast(e.message);
    }
  }

  // ---------- 与宿主互传 ----------
  async function uploadFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    let ok = 0;
    if (S.path === DOCS_PATH) {
      // 文稿里的上传走便捷办公的导入：Office 文件进模型，其余按原文存档。
      for (const f of list) {
        try {
          const res = await fetch(`${OFFICE_API}/import?name=${encodeURIComponent(f.name)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: f,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          ok += 1;
        } catch (e) {
          toast(`导入失败：${e.message}`);
        }
      }
      if (ok) {
        toast(`已导入 ${ok} 个文件到文稿`);
        await load(DOCS_PATH);
      }
      return;
    }
    for (const f of list) {
      const fd = new FormData();
      fd.append('file', f, f.name);
      try {
        const res = await fetch(`/u?path=${encodeURIComponent(S.path)}`, {
          method: 'POST',
          headers: { 'X-NEXLOS-Upload': '1' },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        ok += 1;
      } catch (e) {
        toast(`上传失败：${e.message}`);
      }
    }
    if (ok) {
      toast(`已传到 ${S.path}：${ok} 个文件`);
      await load(S.path);
    }
  }

  function downloadPath(path, name) {
    const a = h('a', {
      href: `/d?path=${encodeURIComponent(path)}`,
      download: name, style: 'display:none',
    });
    frame.append(a);
    a.click();
    a.remove();
  }

  function downloadEntry(entry) {
    if (entry.officeId) {
      const a = h('a', {
        href: `${OFFICE_API}/export/${encodeURIComponent(entry.officeId)}?format=${exportFormat(entry.officeKind)}`,
        download: entry.name, style: 'display:none',
      });
      frame.append(a);
      a.click();
      a.remove();
      toast(`开始下载：${entry.name}`);
      return;
    }
    downloadPath(pathOf(entry), entry.name);
    toast(`开始下载：${entry.name}`);
  }

  function exportFormat(kind) {
    return { doc: 'docx', sheet: 'xlsx', slide: 'pptx', markdown: 'md', html: 'html', pdf: 'pdf' }[kind] || 'docx';
  }

  function downloadSelection() {
    const paths = selPaths().filter((p) => {
      const e = S.entries.find((x) => joinPath(S.path, x.name) === p);
      return e && e.kind === 'file';
    });
    if (!paths.length) return;
    // 逐个触发，避免浏览器把同一手势里的多次下载当成弹窗。
    paths.forEach((p, i) => setTimeout(() => downloadPath(p, baseName(p)), i * 120));
    toast(`开始下载 ${paths.length} 个文件`);
  }

  // ---------- 新建文件夹 ----------
  async function createFolder() {
    if (S.path === DOCS_PATH) { createDoc('doc'); return; }
    let name = '新建文件夹';
    const used = new Set(S.entries.map((e) => e.name.toLowerCase()));
    if (used.has(name.toLowerCase())) {
      let i = 2;
      while (used.has(`新建文件夹 (${i})`.toLowerCase())) i++;
      name = `新建文件夹 (${i})`;
    }
    try {
      const r = await api('fs.mkdir', { method: 'POST', fields: { path: S.path, name } });
      await load(S.path);
      selectOnly(r.detail.path);
      markSelection();
      paintStatus();
      paintCmd();
    } catch (e) {
      toast(e.message);
    }
  }

  // 文稿里“新建”直接落一份空文档：建完就出现在列表，双击进编辑器。
  async function createDoc(kind) {
    try {
      const res = await fetch(`${OFFICE_API}/files`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title: '' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      await load(DOCS_PATH);
      toast(`已新建《${d.title}》，双击打开`);
    } catch (e) {
      toast(e.message);
    }
  }

  // 文稿里没有子文件夹：新建菜单直接给 Word / Excel / PPT 三种文件。
  function newMenuItems() {
    if (S.path === DOCS_PATH) {
      return [
        ['新建 Word 文档', () => createDoc('doc')],
        ['新建 Excel 表格', () => createDoc('sheet')],
        ['新建 PPT 演示', () => createDoc('slide')],
      ];
    }
    return [['新建文件夹', () => createFolder()]];
  }

  // ---------- 复制 / 剪切 / 粘贴 / 删除 / 还原 ----------
  function clipSelection(mode) {
    const paths = selPaths();
    if (!paths.length) { toast('先选中项目'); return; }
    S.clip = { mode, paths };
    paintSide();
    paintSelbar();
    toast(mode === 'cut' ? `已剪切 ${paths.length} 项，打开目标文件夹后粘贴` : `已复制 ${paths.length} 项，打开目标文件夹后粘贴`);
  }

  async function pasteSelection() {
    if (!S.clip || !S.clip.paths.length) return;
    const clip = S.clip;
    if (clip.mode === 'copy') {
      try {
        const r = await api('fs.copy', { method: 'POST', fields: { from: clip.paths, to: S.path } });
        const d = r.detail || {};
        const skipped = (d.skipped || []).length;
        toast(`已复制 ${d.copied || 0} 项${skipped ? `，跳过 ${skipped} 项（同名）` : ''}`);
        S.clip = null;
        await load(S.path);
      } catch (e) {
        toast(e.message);
      }
      return;
    }
    // 剪切 = 逐项 fs.rename；目标里已有同名项时 Go 会拒绝，计数后提示。
    let moved = 0;
    let failed = 0;
    for (const from of clip.paths) {
      if (parentPath(from) === S.path) continue;
      try {
        await api('fs.rename', { method: 'POST', fields: { from, to: joinPath(S.path, baseName(from)) } });
        moved += 1;
      } catch (e) {
        failed += 1;
      }
    }
    toast(failed ? `已移动 ${moved} 项，${failed} 项失败（目标可能同名）` : `已移动 ${moved} 项`);
    S.clip = null;
    await load(S.path);
  }

  function askDelete() {
    const paths = selPaths();
    if (!paths.length) return;
    if (S.path === DOCS_PATH) {
      const items = S.entries.filter((e) => paths.indexOf(pathOf(e)) >= 0 && e.officeId);
      if (!items.length) return;
      S.confirm = {
        title: '删除',
        text: `从文稿里彻底删除选中的 ${items.length} 个文件？便捷办公里的同一份文件也会消失。`,
        ok: '彻底删除',
        danger: true,
        run: async () => {
          let ok = 0;
          for (const it of items) {
            try {
              const res = await fetch(`${OFFICE_API}/files/${encodeURIComponent(it.officeId)}?rev=${it.officeRev || 0}`, { method: 'DELETE' });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
              ok += 1;
            } catch (e) {
              toast(`删除失败：${e.message}`);
            }
          }
          closeDialog();
          await load(DOCS_PATH);
          toast(`已删除 ${ok} 个文件`);
        },
      };
      paintDialog();
      return;
    }
    const inTrash = S.path === '/.trash' || S.path.indexOf('/.trash/') === 0;
    S.confirm = {
      title: inTrash ? '彻底删除' : '删除',
      text: inTrash
        ? `彻底删除选中的 ${paths.length} 项？回收站里的项目无法再还原。`
        : `把选中的 ${paths.length} 项移到回收站？可以随时在“回收站”里还原。`,
      ok: inTrash ? '彻底删除' : '移到回收站',
      danger: true,
      run: async () => {
        try {
          const r = await api('fs.delete', { method: 'POST', fields: { paths, trash: !inTrash } });
          if (window.parent !== window) window.parent.postMessage({ type: 'nexlos.sound', name: 'recycle' }, location.origin);
          const d = r.detail || {};
          closeDialog();
          await load(S.path);
          toast(inTrash ? `已彻底删除 ${d.permanent || paths.length} 项`
            : `已移到回收站 · ${d.batch || ''}`);
        } catch (e) {
          toast(e.message);
        }
      },
    };
    paintDialog();
  }

  async function restoreSelection() {
    const paths = selPaths();
    if (!paths.length) return;
    // 批次清单在 /.trash/<batch>/manifest.json，文件名 → 原路径由它决定。
    try {
      const r = await api('fs.read', { query: { path: joinPath(S.path, 'manifest.json') } });
      const man = JSON.parse(r.detail.text || '{}');
      const fromOf = {};
      (man.items || []).forEach((it) => { fromOf[it.name] = it.from; });
      let ok = 0;
      let failed = 0;
      for (const p of paths) {
        const name = baseName(p);
        if (name === 'manifest.json') continue;
        const from = fromOf[name];
        if (!from) { failed += 1; continue; }
        try {
          await api('fs.rename', { method: 'POST', fields: { from: p, to: from } });
          ok += 1;
        } catch (e) {
          failed += 1;
        }
      }
      toast(failed ? `已还原 ${ok} 项，${failed} 项失败（原位置可能已有同名文件）` : `已还原 ${ok} 项`);
      await load(S.path);
    } catch (e) {
      toast(`读不到回收站清单：${e.message}`);
    }
  }

  function askRename() {
    const paths = selPaths();
    if (paths.length !== 1) { toast('一次改一个名字'); return; }
    S.rename = { path: paths[0], name: baseName(paths[0]) };
    paintDialog();
  }

  async function doRename() {
    const r = S.rename;
    if (!r) return;
    const name = (r.name || '').trim();
    if (!name || name === baseName(r.path)) { closeDialog(); return; }
    if (S.path === DOCS_PATH) {
      const entry = S.entries.find((e) => pathOf(e) === r.path);
      if (!entry || !entry.officeId) { closeDialog(); return; }
      try {
        const title = name.replace(/\.(docx|xlsx|pptx|md|html|pdf)$/i, '');
        const res = await fetch(`${OFFICE_API}/files/${encodeURIComponent(entry.officeId)}`, { cache: 'no-store' });
        const model = await res.json();
        if (!res.ok) throw new Error(model.error || `HTTP ${res.status}`);
        model.title = title;
        const saved = await fetch(`${OFFICE_API}/files/${encodeURIComponent(entry.officeId)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc: model, rev: model.rev }),
        });
        const out = await saved.json().catch(() => ({}));
        if (!saved.ok) throw new Error(out.error || `HTTP ${saved.status}`);
        closeDialog();
        await load(DOCS_PATH);
        toast(`已重命名为 ${title}`);
      } catch (e) {
        toast(e.message);
      }
      return;
    }
    try {
      await api('fs.rename', { method: 'POST', fields: { from: r.path, to: joinPath(parentPath(r.path), name) } });
      closeDialog();
      await load(S.path);
      const next = joinPath(S.path, name);
      if (parentPath(r.path) === S.path) { selectOnly(next); markSelection(); paintStatus(); paintCmd(); }
      toast(`已重命名为 ${name}`);
    } catch (e) {
      toast(e.message);
    }
  }

  // ---------- 属性 ----------
  function showProp(entry) {
    S.prop = { entry, path: joinPath(S.path, entry.name) };
    paintDialog();
  }

  function propTabs() {
    return h('div', { class: 'xp-tabs' }, h('span', { class: 'active' }, '常规'), h('span', {}, '详细信息'));
  }

  function dialogFrame(title, body, buttons) {
    return h('div', { class: 'xp-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { class: 'xp-dialog-bar' },
        h('span', {}, title),
        h('button', { class: 'xp-dialog-x', type: 'button', title: '关闭', 'aria-label': '关闭', onclick: closeDialog }, '×')),
      h('div', { class: 'xp-dialog-body' }, body),
      h('footer', { class: 'xp-dialog-foot' }, buttons));
  }

  function paintDialog() {
    clear(dialogLayer);
    if (!S.note && !S.prop && !S.rename && !S.confirm) { dialogLayer.hidden = true; return; }
    dialogLayer.hidden = false;

    if (S.note) {
      const n = S.note;
      const state = h('span', { class: 'xp-note-state' }, n.dirty ? '未保存' : '');
      const body = h('textarea', {
        class: 'xp-note-body', spellcheck: 'false', wrap: 'off',
        oninput: (e) => { n.text = e.target.value; n.dirty = true; state.textContent = '未保存'; },
      });
      body.value = n.text || '';
      dialogLayer.append(h('div', { class: 'xp-note-win', role: 'dialog', 'aria-modal': 'true', 'aria-label': '记事本' },
        h('header', { class: 'xp-note-bar' },
          h('span', { class: 'xp-note-icon' }, glyph('text')),
          h('span', { class: 'xp-note-title' }, h('span', { 'data-i18n-skip': true }, n.name), ' - ', h('span', {}, '记事本')),
          h('button', { class: 'xp-dialog-x', type: 'button', title: '关闭', onclick: closeDialog }, '×')),
        h('div', { class: 'xp-note-menu' }, h('span', {}, '文件'), h('span', {}, '编辑'), h('span', {}, '格式'), h('span', {}, '查看'), h('span', {}, '帮助')),
        body,
        h('footer', { class: 'xp-note-foot' },
          h('span', {}, n.path),
          state,
          h('button', { class: 'xp-btn primary', type: 'button', onclick: saveNote }, '保存'),
          h('span', {}, `${fmtSize(n.size)} · ⌘S 保存`))));
      return;
    }

    if (S.rename) {
      const r = S.rename;
      const input = h('input', {
        class: 'xp-rename-input', type: 'text', value: r.name, autocomplete: 'off', spellcheck: 'false',
        oninput: (e) => { r.name = e.target.value; },
        onkeydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); doRename(); }
          if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
        },
      });
      dialogLayer.append(dialogFrame('重命名',
        h('label', { class: 'xp-field' }, h('span', {}, '新名称'), input),
        h('div', { class: 'xp-dialog-btns' },
          h('button', { class: 'xp-btn primary', type: 'button', onclick: doRename }, '确定'),
          h('button', { class: 'xp-btn', type: 'button', onclick: closeDialog }, '取消'))));
      setTimeout(() => { input.focus(); input.select(); }, 0);
      return;
    }

    if (S.confirm) {
      const c = S.confirm;
      dialogLayer.append(dialogFrame(c.title,
        h('p', { class: 'xp-confirm-text' }, c.text),
        h('div', { class: 'xp-dialog-btns' },
          h('button', { class: `xp-btn primary${c.danger ? ' danger' : ''}`, type: 'button', onclick: () => { if (c.run) c.run(); } }, c.ok || '确定'),
          h('button', { class: 'xp-btn', type: 'button', onclick: closeDialog }, '取消'))));
      return;
    }

    const p = S.prop;
    const e = p.entry;
    const isFolder = e.kind === 'folder';
    const info = [
      ['类型', e.kindLabel],
      ['位置', S.path],
      ['大小', isFolder ? '—' : fmtSize(e.size)],
      ['修改日期', fmtDate(e.mod)],
    ];
    dialogLayer.append(dialogFrame('属性',
      h('div', { class: 'xp-prop' },
        h('div', { class: 'xp-prop-head' }, entryGlyph(e), h('div', {}, h('b', { 'data-i18n-skip': true }, e.name), h('i', {}, e.kindLabel))),
        propTabs(),
        h('div', { class: 'xp-prop-grid' }, info.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v || '—')))),
        h('p', { class: 'xp-prop-path', 'data-i18n-skip': true }, p.path)),
      h('div', { class: 'xp-dialog-btns' },
        h('button', { class: 'xp-btn primary', type: 'button', onclick: closeDialog }, '确定'),
        h('button', { class: 'xp-btn', type: 'button', onclick: closeDialog }, '取消'))));
  }

  async function saveNote() {
    const n = S.note;
    if (!n) return;
    try {
      const r = await api('fs.write', { method: 'POST', fields: { path: n.path, text: n.text } });
      n.size = (r.detail && r.detail.bytes) || n.text.length;
      n.dirty = false;
      toast('已保存到宿主工作区');
      await load(S.path);
      paintDialog();
    } catch (e) {
      toast(`保存失败：${e.message}`);
    }
  }

  function closeDialog() {
    S.note = null;
    S.prop = null;
    S.rename = null;
    S.confirm = null;
    paintDialog();
  }

  // ---------- 右键菜单 ----------
  function openCtx(x, y, items, owner) {
    closeCtx();
    S.ctx = { x, y, owner: owner || null, returnFocus: owner || document.activeElement };
    if (owner) owner.setAttribute('aria-expanded', 'true');
    clear(ctxEl);
    items.filter(Boolean).forEach((it) => {
      const [label, fn, disabled] = it;
      ctxEl.append(h('button', {
        class: 'xp-ctx-item', type: 'button', role: 'menuitem', disabled: !!disabled,
        onclick: () => { closeCtx(true); fn(); },
      }, label));
    });
    ctxEl.hidden = false;
    // 贴着视口收边，右键在右下角时菜单不会跑出去。
    const rect = ctxEl.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 6);
    const top = Math.min(y, window.innerHeight - rect.height - 6);
    ctxEl.style.left = `${Math.max(4, left)}px`;
    ctxEl.style.top = `${Math.max(4, top)}px`;
    if (owner) {
      const first = ctxEl.querySelector('button:not(:disabled)');
      if (first) first.focus();
    }
  }

  function closeCtx(restoreFocus) {
    const owner = S.ctx && S.ctx.owner;
    const returnFocus = S.ctx && S.ctx.returnFocus;
    if (owner) owner.setAttribute('aria-expanded', 'false');
    ctxEl.hidden = true;
    clear(ctxEl);
    S.ctx = null;
    if (restoreFocus && returnFocus && frame.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
  }

  // The classic menubar reuses the file manager's existing actions and menu.
  // Disabled commands are recalculated on every open, from the current selection.
  function openClassicMenu(id, owner) {
    if (S.ctx && S.ctx.owner === owner) { closeCtx(true); return; }
    const count = selCount();
    const selectedFiles = selPaths().some((path) => S.entries.some((entry) => pathOf(entry) === path && entry.kind === 'file'));
    const changeView = (view) => { S.view = view; writePrefs(); paintCmd(); paintList(); };
    const selectedProp = () => {
      const entry = S.entries.find((item) => pathOf(item) === selPaths()[0]);
      if (entry) showProp(entry);
    };
    const menus = {
      file: [
        ...newMenuItems(),
        ['上传文件…', () => uploadInput.click()],
        ['下载选中的文件', () => downloadSelection(), !selectedFiles],
        ['重命名', () => askRename(), count !== 1],
        ['删除', () => askDelete(), !count],
        ['属性', selectedProp, count !== 1],
      ],
      edit: [
        ['剪切', () => clipSelection('cut'), !count],
        ['复制', () => clipSelection('copy'), !count],
        ['粘贴', () => pasteSelection(), !(S.clip && S.clip.paths.length)],
        ['全选', () => selectAll(), !sortedEntries().length],
        ['取消选择', () => { clearSel(); markSelection(); paintStatus(); paintCmd(); }, !count],
      ],
      view: [
        ['详细信息', () => changeView('details')],
        ['大图标', () => changeView('icons')],
        [S.hidden ? '隐藏隐藏的项目' : '显示隐藏的项目', () => setHidden(!S.hidden)],
        [S.dirFirst ? '取消目录优先' : '目录优先', () => setDirFirst(!S.dirFirst)],
        ['刷新', () => load(S.path)],
      ],
      help: [
        ['文件管理说明', () => toast('文件来自 NexlOS 宿主工作区；双击打开，右键查看操作。删除的项目默认进入回收站。')],
        ['键盘快捷键', () => toast('Ctrl/⌘+A 全选 · C 复制 · X 剪切 · V 粘贴 · F2 重命名 · F5 刷新 · Delete 删除')],
        ['打开回收站', () => navigate('/.trash')],
      ],
    };
    const rect = owner.getBoundingClientRect();
    openCtx(rect.left, rect.bottom, menus[id] || [], owner);
  }

  ctxEl.addEventListener('keydown', (e) => {
    // A menu's Enter/Space must not also open the selected file behind it.
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closeCtx(true); return; }
    const owner = S.ctx && S.ctx.owner;
    if (owner && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const index = classicMenuButtons.indexOf(owner);
      const next = classicMenuButtons[(index + (e.key === 'ArrowRight' ? 1 : -1) + classicMenuButtons.length) % classicMenuButtons.length];
      openClassicMenu(next.dataset.menu, next);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const buttons = Array.from(ctxEl.querySelectorAll('button:not(:disabled)'));
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
      : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  });

  function openMore() {
    const r = moreBtn.getBoundingClientRect();
    openCtx(r.left, r.bottom + 2, [
      ['全选', () => selectAll()],
      [S.hidden ? '隐藏隐藏的项目' : '显示隐藏的项目', () => setHidden(!S.hidden)],
      [S.dirFirst ? '取消目录优先' : '目录优先', () => setDirFirst(!S.dirFirst)],
      ['刷新', () => load(S.path)],
      ['打开回收站', () => navigate('/.trash')],
    ]);
  }

  function setHidden(v) {
    S.hidden = v;
    writePrefs();
    load(S.path);
  }

  function setDirFirst(v) {
    S.dirFirst = v;
    writePrefs();
    paintList();
  }

  listEl.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.xp-row, .xp-tile')) return;
    e.preventDefault();
    openCtx(e.clientX, e.clientY, [
      ['查看：详细信息', () => { S.view = 'details'; writePrefs(); paintCmd(); paintList(); }],
      ['查看：大图标', () => { S.view = 'icons'; writePrefs(); paintCmd(); paintList(); }],
      ['刷新', () => load(S.path)],
      ...newMenuItems(),
      [S.hidden ? '隐藏隐藏的项目' : '显示隐藏的项目', () => setHidden(!S.hidden)],
    ]);
  });

  // 空白处单击取消选中；右键菜单在别处按下时收起。
  listEl.addEventListener('click', (e) => {
    // 框选松手后浏览器还会补一个 click：不能让它把刚选中的结果清掉。
    if (bandDragged) { bandDragged = false; return; }
    if (e.target.closest('.xp-row, .xp-tile')) return;
    if (selCount()) { clearSel(); markSelection(); paintStatus(); paintCmd(); }
  });

  // ---------- 框选：左键拖拽画圈多选 ----------
  // Windows 资源管理器的手感：空白处按下拖动出现选框，按矩形命中所见的行。
  // 只处理鼠标主键；触屏仍是点击/长按，避免和滚动、拖动上传打架。
  const marquee = h('div', { class: 'xp-marquee', hidden: true });
  frame.append(marquee);
  let band = null;
  let bandDragged = false;

  function bandBox() {
    const f = frame.getBoundingClientRect();
    return {
      left: Math.min(band.x0, band.x) - f.left,
      top: Math.min(band.y0, band.y) - f.top,
      w: Math.abs(band.x - band.x0),
      h: Math.abs(band.y - band.y0),
    };
  }

  function bandApply() {
    const f = frame.getBoundingClientRect();
    const box = bandBox();
    const next = Object.assign({}, band.base);
    const nodes = listEl.querySelectorAll('.xp-row, .xp-tile');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!el.dataset.path) continue;
      const r = el.getBoundingClientRect();
      const l = r.left - f.left;
      const t = r.top - f.top;
      if (l < box.left + box.w && l + r.width > box.left &&
          t < box.top + box.h && t + r.height > box.top) {
        next[el.dataset.path] = 1;
      }
    }
    S.sel = next;
    S.anchor = '';
    markSelection();
  }

  function bandStart(e) {
    if (e.button !== 0 || e.pointerType !== 'mouse') return;
    if (e.target.closest('.xp-row, .xp-tile, .xp-col, .xp-drive, .xp-group, .xp-search-head, button, a, input')) return;
    bandDragged = false;
    band = {
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      base: (e.metaKey || e.ctrlKey) ? Object.assign({}, S.sel) : {},
      id: e.pointerId, moved: false,
    };
  }

  function bandMove(e) {
    if (!band || e.pointerId !== band.id) return;
    if (!band.moved) {
      if (Math.abs(e.clientX - band.x0) < 4 && Math.abs(e.clientY - band.y0) < 4) return;
      band.moved = true;
      marquee.hidden = false;
      try { listEl.setPointerCapture(e.pointerId); } catch (err) { /* 老内核不支持捕获 */ }
    }
    band.x = e.clientX;
    band.y = e.clientY;
    const box = bandBox();
    marquee.style.left = box.left + 'px';
    marquee.style.top = box.top + 'px';
    marquee.style.width = box.w + 'px';
    marquee.style.height = box.h + 'px';
    bandApply();
    // 拖到上下边缘时跟着滚动，和资源管理器一致。
    const r = listEl.getBoundingClientRect();
    if (e.clientY < r.top + 26) listEl.scrollTop -= 14;
    else if (e.clientY > r.bottom - 26) listEl.scrollTop += 14;
  }

  function bandEnd() {
    if (!band) return;
    const moved = band.moved;
    band = null;
    marquee.hidden = true;
    if (moved) {
      bandDragged = true;
      // 松手可能落在某一行上：行自己的 click 会把框选结果改成单选。
      // 捕获阶段吞掉紧随 pointerup 的这一次 click，下一拍恢复。
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 0);
      paintStatus();
      paintCmd();
    }
  }

  listEl.addEventListener('pointerdown', bandStart);
  listEl.addEventListener('pointermove', bandMove);
  listEl.addEventListener('pointerup', bandEnd);
  listEl.addEventListener('pointercancel', bandEnd);

  function onDocDown(e) {
    if (S.ctx && S.ctx.owner && S.ctx.owner.contains(e.target)) return;
    if (!ctxEl.hidden && !ctxEl.contains(e.target)) closeCtx();
  }
  document.addEventListener('pointerdown', onDocDown, true);

  // ---------- 键盘 ----------
  function moveSel(delta, extend) {
    const rows = sortedEntries();
    if (!rows.length) return;
    const paths = rows.map(pathOf);
    let idx = S.anchor ? paths.indexOf(S.anchor) : -1;
    if (idx < 0 && selCount() === 1) idx = paths.indexOf(selPaths()[0]);
    if (idx < 0) idx = delta > 0 ? -1 : 0;
    const next = Math.max(0, Math.min(paths.length - 1, idx + delta));
    if (extend && S.anchor) selectRange(paths[next]);
    else selectOnly(paths[next]);
    markSelection();
    paintStatus();
    paintCmd();
    scrollToPath(paths[next]);
  }

  function onKey(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea';
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S') && S.note) {
      e.preventDefault();
      saveNote();
      return;
    }
    if (e.key === 'Escape') {
      if (S.note || S.prop || S.rename || S.confirm) { closeDialog(); return; }
      if (!ctxEl.hidden) { closeCtx(); return; }
      if (S.drawer) { closeDrawer(); return; }
      if (!typing && selCount()) { clearSel(); markSelection(); paintStatus(); paintCmd(); }
      return;
    }
    if (typing) return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); selectAll(); return; }
    if (mod && (e.key === 'c' || e.key === 'C') && selCount()) { e.preventDefault(); clipSelection('copy'); return; }
    if (mod && (e.key === 'x' || e.key === 'X') && selCount()) { e.preventDefault(); clipSelection('cut'); return; }
    if (mod && (e.key === 'v' || e.key === 'V') && S.clip) { e.preventDefault(); pasteSelection(); return; }

    if (e.key === 'Backspace') { e.preventDefault(); goUp(); return; }
    if (e.key === 'Delete') { e.preventDefault(); askDelete(); return; }
    if (e.key === 'F2') { e.preventDefault(); askRename(); return; }
    if (e.key === 'F5') { e.preventDefault(); load(S.path); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1, e.shiftKey); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1, e.shiftKey); return; }
    if (e.key === 'Enter') {
      const first = selPaths()[0];
      if (!first) return;
      const entry = S.entries.find((x) => joinPath(S.path, x.name) === first);
      if (entry) { e.preventDefault(); openEntry(entry); }
    }
  }
  document.addEventListener('keydown', onKey);

  function toast(msg) {
    let t = frame.querySelector('.xp-toast');
    if (!t) { t = h('div', { class: 'xp-toast' }); frame.append(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  onResize();
  paintAll();
  load(S.path);

  return {
    destroy() {
      loadVersion += 1;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onPrefsMessage);
      window.removeEventListener('resize', onResize);
      // pointerdown 用了捕获，移除时也要带同样的标志。
      document.removeEventListener('pointerdown', onDocDown, true);
    },
  };
}

// ---------- 小图标（线稿，16×16 像素网格） ----------
// 前后/向上的箭头与标题栏控件共用同一块 16px 画布、2px 描边，1:1 渲染不发虚。
function navGlyph(kind) {
  const paths = {
    back: '<path d="M11 3 5 8 11 13"/>',
    forward: '<path d="M5 3 11 8 5 13"/>',
    up: '<path d="M8 13V5M3 10 8 5 13 10"/>',
  };
  return h('svg', { class: 'xp-ic', viewBox: '0 0 16 16', 'aria-hidden': 'true', html: paths[kind] });
}

function cmdGlyph(kind) {
  const paths = {
    view: '<rect x="3.5" y="4.5" width="7" height="7"/><rect x="13.5" y="4.5" width="7" height="7"/><rect x="3.5" y="12.5" width="7" height="7"/><rect x="13.5" y="12.5" width="7" height="7"/>',
    newfolder: '<path d="M3.5 7h6l1.6 2h9.4v9.5h-17z"/><path d="M12 11.5v5M9.5 14h5"/>',
    upload: '<path d="M12 16V4.5M7.5 9 12 4.5 16.5 9M4 19.5h16"/>',
    download: '<path d="M12 4.5V16M7.5 11.5 12 16l4.5-4.5M4 19.5h16"/>',
    more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  };
  return h('svg', { class: 'xp-ic', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: paths[kind] });
}

function searchGlyph() {
  return h('svg', { class: 'xp-ic', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/>' });
}

function sideGlyph(kind) {
  const paths = {
    star: '<path d="m12 3.6 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>',
    pc: '<rect x="3.5" y="5" width="17" height="11.5" rx="1.4"/><path d="M9.5 20h5M12 16.5V20"/>',
    workspace: '<path d="M3.5 7.5h6l1.5 2H20.5v9h-17z"/><path d="M8 4.5h8"/>',
    memory: '<circle cx="7" cy="6" r="2"/><circle cx="17" cy="8.5" r="2"/><circle cx="9" cy="18" r="2"/><path d="M8.8 7.5 15.2 8M15.4 10.3 10.5 16.3"/>',
    inbox: '<path d="M3.5 12.5h5l1.2 2h4.6l1.2-2h5"/><path d="M3.5 12.5 6 5h12l2.5 7.5v6.5h-17z"/>',
    outbox: '<path d="M3.5 12.5h5l1.2 2h4.6l1.2-2h5"/><path d="M3.5 12.5 6 5h12l2.5 7.5v6.5h-17z"/><path d="M12 15V8.5M9.8 10.7 12 8.5l2.2 2.2"/>',
  };
  return h('svg', { class: 'xp-ic sm', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: paths[kind] });
}

function crumbGlyph(isRoot, active) {
  if (isRoot) {
    return h('svg', { class: 'xp-ic sm', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: '<rect x="3.5" y="5" width="17" height="11.5" rx="1.4"/><path d="M9.5 20h5M12 16.5V20"/>' });
  }
  return h('svg', { class: 'xp-ic sm', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: '<path d="M3.5 7h6l1.6 2h9.4v9.5h-17z"/>' });
}
