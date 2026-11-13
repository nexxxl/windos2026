import { h, api } from './can.js';
import { mdToHtml } from './md.js';
import { icon } from './icons.js';

// 便利贴：贴在桌面上的小纸条。
// 一张便利贴 = 一个普通文本文件（.md 或 .html），放在「文稿/便利贴」。
// 位置、尺寸、颜色、折叠状态写在文件头里：md 用 YAML 头，html 用首行注释。
// 便利贴不进入窗口管理器：它永远浮在应用窗口之上，双击标题栏折叠成一条。
const DIR = '/文稿/便利贴';
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'paper'];
const MIN_W = 190;
const MIN_H = 130;
const FOLD_H = 34;
const SAVE_MS = 600;
const BASE_Z = 22;
const DEFAULT_W = 248;
const DEFAULT_H = 214;
const KEEP_X = 64; // 横向至少露出的可抓宽度
const TUCK_PEEK = 18; // 双击桌面收边时露在屏幕边缘的宽度，和窗口一致
const MAX_FILE = 6 * 1024 * 1024;

// 附件选择器只收办公文档五类：md / Word / PDF / PPT / Excel。
const PICK_RE = /\.(md|markdown|doc|docx|pdf|ppt|pptx|xls|xlsx|csv)$/i;
const PICK_ACCEPT = '.md,.markdown,.doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.csv';
const PICK_HINT = 'md、Word、PDF、PPT、Excel';
const EXCHANGE = '/nexl交换区';

// 附件的种类只影响两件事：一行小字的色标，以及点开时送去哪里。
const KIND_EXT = {
  doc: ['doc', 'docx', 'rtf', 'odt', 'pages'],
  sheet: ['xls', 'xlsx', 'csv', 'ods', 'numbers'],
  slide: ['ppt', 'pptx', 'odp', 'key'],
  pdf: ['pdf'],
  md: ['md', 'markdown'],
  html: ['html', 'htm'],
  text: ['txt', 'log', 'json', 'yml', 'yaml', 'ini', 'toml', 'sh', 'go', 'js', 'css'],
  img: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif', 'heic'],
  media: ['mp4', 'mov', 'm4v', 'mp3', 'wav', 'm4a', 'aac', 'flac'],
  zip: ['zip', 'tar', 'gz', 'tgz', '7z', 'rar'],
};
const OFFICE_KINDS = { doc: 1, sheet: 1, slide: 1, pdf: 1, md: 1, html: 1 };

function extOf(name) {
  const m = String(name || '').match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

function kindOf(name) {
  const ext = extOf(name);
  const keys = Object.keys(KIND_EXT);
  for (let i = 0; i < keys.length; i += 1) {
    if (KIND_EXT[keys[i]].indexOf(ext) >= 0) return keys[i];
  }
  return 'other';
}

function extLabel(name) {
  const ext = extOf(name);
  return (ext || '?').slice(0, 3);
}

function humanSize(n) {
  const size = Number(n) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeOf(name) {
  const ext = extOf(name);
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
    pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv', md: 'text/markdown', html: 'text/html', txt: 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

// 文件名只保留最后一段，去掉路径分隔符与控制字符；太长会撑坏一行。
function safeName(name) {
  const base = String(name || '').split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f<>:"|?*]/g, '_')
    .trim();
  return (base || '文件').slice(0, 80);
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function joinPath(dir, name) {
  return (dir === '/' ? '' : dir) + '/' + name;
}

function parentPath(path) {
  if (!path || path === '/') return '/';
  const cut = String(path).replace(/\/+$/, '').lastIndexOf('/');
  return cut <= 0 ? '/' : String(path).slice(0, cut);
}
const pad = (n) => (n < 10 ? '0' : '') + n;

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-`
    + `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// 读一个便利贴文件：拆出元数据，正文交给渲染层。
function parseNote(raw, ext) {
  const text = String(raw == null ? '' : raw).replace(/^\uFEFF/, '');
  const meta = {};
  let body = text;
  if (ext === 'html') {
    const m = text.match(/^\s*<!--\s*nexlos-sticky\s*:\s*(\{[\s\S]*?\})\s*-->\s*\r?\n?/);
    if (m) {
      try { Object.assign(meta, JSON.parse(m[1])); } catch (e) { /* 注释坏了就当没有元数据 */ }
      body = text.slice(m[0].length);
    }
    return { meta, body };
  }
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (m && /(^|\n)\s*nexlos-sticky\s*:/.test(m[1])) {
    m[1].split(/\r?\n/).forEach((line) => {
      const kv = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
      if (kv) meta[kv[1]] = kv[2];
    });
    body = text.slice(m[0].length);
  }
  return { meta, body };
}

function noteFileText(note) {
  const m = note.meta;
  const geo = {
    x: Math.round(m.x), y: Math.round(m.y), w: Math.round(m.w), h: Math.round(m.h),
    color: m.color, folded: m.folded ? 1 : 0,
  };
  if (note.ext === 'html') {
    return `<!-- nexlos-sticky: ${JSON.stringify(geo)} -->\n${note.text}`;
  }
  const head = ['---', 'nexlos-sticky: 1'];
  Object.keys(geo).forEach((k) => head.push(`${k}: ${geo[k]}`));
  head.push('---', '');
  return head.join('\n') + note.text;
}

// 便利贴里的 HTML 跑在无同源权限的沙箱里，脚本能用，但碰不到系统的存储和接口。
function htmlDoc(src) {
  return '<!doctype html><meta charset="utf-8">'
    + '<style>html,body{margin:0;padding:0;background:transparent;color:#26221a}'
    + 'body{padding:10px 12px;font:13px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;overflow-wrap:break-word}'
    + 'img{max-width:100%}a{color:#2563c8}pre{overflow:auto}</style>'
    + src;
}

function base64Bytes(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const at = text.indexOf(',');
      resolve(at >= 0 ? text.slice(at + 1) : '');
    };
    reader.onerror = () => reject(reader.error || new Error('读不到这个文件'));
    reader.readAsDataURL(file);
  });
}

// 附件目录是唯一事实来源：manifest.json 只补 office 文档号与显示顺序。
async function listAttachments(key) {
  const dir = `${DIR}/附件/${key}`;
  let rows = [];
  try {
    const r = await api('fs.list', { query: { path: dir, soft: 1 } });
    rows = Array.isArray(r.append) ? r.append : [];
  } catch (e) {
    return [];
  }
  // 没有附件文件就不必再读清单：省一次必然失败的请求。
  if (!rows.length) return [];
  let order = [];
  let office = {};
  try {
    const r = await api('fs.read', { query: { path: `${dir}/manifest.json` } });
    const man = JSON.parse((r.detail && r.detail.text) || '{}');
    if (Array.isArray(man.files)) {
      order = man.files.map((f) => (f && f.name) || '').filter(Boolean);
      man.files.forEach((f) => { if (f && f.name) office[f.name] = f.office || ''; });
    }
  } catch (e) { /* 清单缺失时按文件名排 */ }
  return rows
    .filter((row) => row && row.kind === 'file' && row.name !== 'manifest.json')
    .map((row) => ({
      name: row.name,
      size: row.size,
      office: office[row.name] || '',
      rank: order.indexOf(row.name),
    }))
    .sort((a, b) => {
      if (a.rank >= 0 && b.rank >= 0) return a.rank - b.rank;
      if (a.rank >= 0) return -1;
      if (b.rank >= 0) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((f) => ({ name: f.name, size: f.size, office: f.office }));
}


export function createStickyLayer(root, opts) {
  opts = opts || {};
  const notify = opts.onNotify || function () {};
  const layer = h('div', { class: 'os-stickies', 'aria-label': '便利贴' });
  layer.hidden = true; // 应用没打开时桌面上不出现纸
  root.append(layer);
  const notes = new Map();
  let seq = 0;
  let serial = 0;
  let booted = false;
  let appOpen = false;
  let visible = false;
  const OPEN_KEY = 'nexlos.sticky.open';

  function state() { if (opts.onState) opts.onState(); }

  // 没有便利贴就没有可展示的桌面：应用状态跟着一起收回，底栏不留空壳。
  function settleEmpty() {
    if (notes.size) return false;
    appOpen = false;
    visible = false;
    layer.hidden = true;
    rememberOpen(false);
    state();
    return true;
  }

  function rememberOpen(on) {
    try {
      if (on) localStorage.setItem(OPEN_KEY, '1');
      else localStorage.removeItem(OPEN_KEY);
    } catch (e) { /* 隐私模式没有 localStorage 时，只是不跨重启记住 */ }
  }

  function wasOpen() {
    try { return localStorage.getItem(OPEN_KEY) === '1'; } catch (e) { return false; }
  }

  // 便利贴的下边界是任务栏上沿：不盖住底栏，也不被底栏咬掉。
  function workBottom() {
    const bar = document.querySelector('.os-taskbar');
    const top = bar ? bar.getBoundingClientRect().top : 0;
    return top > 0 && top < window.innerHeight ? top : window.innerHeight - 88;
  }
  function area() { return { w: window.innerWidth, h: workBottom() }; }

  // 宽屏允许便利贴露一半在边上（按 64px 可抓宽度保住），窄屏则整张留在可视区内。
  function clampX(x, w, vw) {
    if (vw < 520) return clamp(x, 8, Math.max(8, vw - w - 8));
    return clamp(x, KEEP_X - w, Math.max(KEEP_X - w, vw - KEEP_X));
  }

  function note(id) { return notes.get(id); }

  // 拖纸期间关掉整页的文本选择，并让 iframe 退出命中测试。
  // 否则指针滑过子午流注钟时会被 iframe 抢走 pointermove，纸会卡住、
  // 钟里的字还会被拉出一片蓝色选区。
  let gestureDepth = 0;
  function beginGesture() {
    gestureDepth += 1;
    if (gestureDepth > 1) return;
    document.documentElement.classList.add('sticky-gesture');
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.rangeCount) sel.removeAllRanges();
  }
  function endGesture() {
    if (gestureDepth > 0) gestureDepth -= 1;
    if (gestureDepth !== 0) return;
    document.documentElement.classList.remove('sticky-gesture');
    // 拖动默认动作会在纸面留下一个折叠光标；手势结束顺手收掉，不打断编辑焦点。
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.rangeCount && sel.isCollapsed) sel.removeAllRanges();
  }

  function bring(rec) {
    seq += 1;
    rec.z = BASE_Z + seq;
    rec.el.style.zIndex = String(rec.z);
  }

  function titleOf(text, ext) {
    if (!text.trim()) return ext === 'html' ? 'HTML 便利贴' : '便利贴';
    if (ext === 'html') {
      const m = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const h1 = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const raw = (m && m[1]) || (h1 && h1[1]) || '';
      const clean = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      return clean ? clean.slice(0, 32) : 'HTML 便利贴';
    }
    const line = text.split(/\r?\n/).find((s) => s.trim()) || '';
    return line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/[*_`~]/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim()
      .slice(0, 32) || (ext === 'html' ? 'HTML 便利贴' : '便利贴');
  }

  function create(init) {
    init = init || {};
    const ext = init.ext === 'html' ? 'html' : 'md';
    const meta = Object.assign({
      x: 0, y: 0, w: DEFAULT_W, h: DEFAULT_H, color: COLORS[0], folded: 0,
    }, init.meta || {});
    if (COLORS.indexOf(meta.color) < 0) meta.color = COLORS[0];
    meta.w = clamp(Number(meta.w) || DEFAULT_W, MIN_W, 1200);
    meta.h = clamp(Number(meta.h) || DEFAULT_H, MIN_H, 1200);

    const box = area();
    const grew = notes.size;
    if (!init.meta) {
      // 新纸从左上角阶梯排开，叠到边上就回到起点。
      meta.x = clamp(96 + (grew % 6) * 26, 8, Math.max(8, box.w - DEFAULT_W - 12));
      meta.y = clamp(76 + (grew % 6) * 22, 8, Math.max(8, box.h - DEFAULT_H - 12));
    }
    meta.x = clampX(Number(meta.x) || 0, meta.w, box.w);
    meta.y = clamp(Number(meta.y) || 0, 0, Math.max(0, box.h - FOLD_H));
    // YAML 里读回来的是字符串 "0"/"1"，直接判真假会把 "0" 当成折叠。
    meta.folded = meta.folded === 1 || meta.folded === '1' ? 1 : 0;

    const rec = {
      id: init.id || `st${++serial}`,
      file: init.file || '',
      ext,
      meta,
      text: String(init.text == null ? '' : init.text),
      files: Array.isArray(init.files) ? init.files.slice() : [],
      editing: false,
      folded: !!meta.folded,
      tuck: null,
      peekClick: false,
      timer: 0,
      z: 0,
      el: null,
    };

    const tools = h('div', { class: 'st-tools' });
    const colorBtn = h('button', {
      class: 'st-btn st-color', type: 'button', title: '换一张纸', 'aria-label': '换颜色',
      onclick: (e) => { e.stopPropagation(); cycleColor(); },
    });
    const addBtn = h('button', {
      class: 'st-btn st-add', type: 'button', title: '新建一张便利贴', 'aria-label': '新建便利贴',
      onclick: (e) => { e.stopPropagation(); newNote(); },
    }, icon('plus'));
    const attachBtn = h('button', {
      class: 'st-btn st-attach', type: 'button', title: '添加文件', 'aria-label': '添加文件',
      onclick: (e) => { e.stopPropagation(); openPicker(); },
    }, icon('paperclip'));
    const foldBtn = h('button', {
      class: 'st-btn', type: 'button', title: '折叠成一条', 'aria-label': '折叠',
      onclick: (e) => { e.stopPropagation(); setFold(!rec.folded); },
    }, icon('chevron', 'st-fold-ico'));
    const minBtn = h('button', {
      class: 'st-btn st-min', type: 'button', title: '最小化到任务栏', 'aria-label': '最小化便利贴',
      onclick: (e) => { e.stopPropagation(); minimize(); },
    }, icon('minimize'));
    const closeBtn = h('button', {
      class: 'st-btn st-close', type: 'button', title: '关闭（移到回收站）', 'aria-label': '关闭便利贴',
      onclick: (e) => { e.stopPropagation(); close(); },
    }, icon('close'));
    tools.append(colorBtn, addBtn, attachBtn, foldBtn, minBtn, closeBtn);

    const head = h('header', { class: 'st-head' }, tools);

    const src = h('textarea', {
      class: 'st-src', spellcheck: 'false', hidden: true,
      'aria-label': '便利贴内容', placeholder: '写点什么…',
    });
    const render = h('div', { class: 'st-render' });
    const filesEl = h('div', { class: 'st-files', hidden: true });
    const lookEl = h('div', { class: 'st-look', hidden: true });
    const body = h('div', { class: 'st-body' }, render, src);
    const el = h('section', {
      class: 'os-sticky', 'data-color': meta.color, role: 'note', 'aria-label': '便利贴',
    }, head, body, filesEl, lookEl,
      h('span', { class: 'st-resize', title: '拖动调整大小', 'aria-hidden': 'true' }));

    rec.el = el;
    el.style.left = `${Math.round(meta.x)}px`;
    el.style.top = `${Math.round(meta.y)}px`;
    el.style.setProperty('--st-w', `${Math.round(meta.w)}px`);
    el.style.setProperty('--st-h', `${Math.round(meta.h)}px`);
    if (meta.folded) {
      el.classList.add('folded');
      el.style.setProperty('--st-h', `${FOLD_H}px`);
    }

    // ----- 渲染 -----

    function paint() {
      // 表头不再显示标题；文件名与正文首行已经能说明这张纸是什么。
      const name = titleOf(rec.text, ext);
      el.setAttribute('aria-label', name === '便利贴' ? name : `便利贴：${name}`);
      if (ext === 'html') {
        let frame = render.querySelector('iframe');
        if (!frame) {
          frame = h('iframe', {
            class: 'st-html', sandbox: 'allow-scripts allow-forms allow-modals allow-popups',
            referrerpolicy: 'no-referrer', title: 'HTML 便利贴',
          });
          render.append(frame);
        }
        frame.srcdoc = htmlDoc(rec.text);
        return;
      }
      if (!rec.text.trim()) {
        render.innerHTML = '<p class="st-empty">点一下写点什么，Esc 回到预览</p>';
      } else {
        render.innerHTML = mdToHtml(rec.text);
      }
    }

    function setEditing(on) {
      if (rec.editing === on) return;
      rec.editing = on;
      el.classList.toggle('editing', on);
      src.hidden = !on;
      render.hidden = on;
      if (on) {
        if (rec.folded) setFold(false);
        src.value = rec.text;
        src.focus();
        src.setSelectionRange(src.value.length, src.value.length);
      } else {
        if (src.value !== rec.text) {
          rec.text = src.value;
          scheduleSave();
        }
        paint();
      }
    }

    function cycleColor() {
      const at = COLORS.indexOf(meta.color);
      meta.color = COLORS[(at + 1) % COLORS.length];
      el.dataset.color = meta.color;
      scheduleSave();
    }

    function setFold(folded) {
      rec.folded = !!folded;
      meta.folded = rec.folded ? 1 : 0;
      el.classList.toggle('folded', rec.folded);
      el.style.setProperty('--st-h', rec.folded ? `${FOLD_H}px` : `${Math.round(meta.h)}px`);
      if (rec.folded && rec.editing) setEditing(false);
      scheduleSave();
    }

    // ----- 附件 -----

    function noteKey() {
      if (rec.file) return rec.file.split('/').pop().replace(/\.(md|html)$/i, '');
      return rec.id;
    }

    function attachDir() { return `${DIR}/附件/${noteKey()}`; }

    function uniqueName(name) {
      const used = {};
      rec.files.forEach((f) => { used[String(f.name).toLowerCase()] = 1; });
      if (!used[name.toLowerCase()]) return name;
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      for (let i = 2; i < 100; i += 1) {
        const next = `${stem}-${i}${ext}`;
        if (!used[next.toLowerCase()]) return next;
      }
      return `${stem}-${Date.now()}${ext}`;
    }

    // 清单只缓存 office 文档号与顺序；附件文件本身才是事实。
    async function saveManifest() {
      try {
        await api('fs.write', {
          method: 'POST',
          fields: {
            path: `${attachDir()}/manifest.json`,
            text: JSON.stringify({
              version: 1,
              files: rec.files.map((f) => ({ name: f.name, office: f.office || '', size: f.size || 0 })),
            }, null, 2),
          },
        });
      } catch (e) { /* 清单丢了也只影响 office 文档号，附件仍在 */ }
    }

    // 所有来源最终都落到这里：先让便利贴有文件名（附件目录按它归档），再原子写进附件目录。
    async function addBytes(name, b64, size) {
      if (Number(size) > MAX_FILE) {
        notify(`「${name}」超过 6MB，便利贴装不下`);
        return false;
      }
      if (!rec.file) {
        const saved = await save();
        if (!saved) return false;
      }
      const clean = uniqueName(safeName(name));
      await api('fs.put', { method: 'POST', fields: { path: `${attachDir()}/${clean}`, base64: b64 } });
      rec.files.push({ name: clean, size: Number(size) || 0, office: '' });
      return true;
    }

    async function attachFiles(list) {
      let added = 0;
      for (let i = 0; i < list.length; i += 1) {
        const file = list[i];
        try {
          const b64 = await readBase64(file);
          if (await addBytes(file.name, b64, file.size)) added += 1;
        } catch (e) {
          notify(`「${file.name}」没有加进来：${e.message}`);
        }
      }
      if (!added) return;
      await saveManifest();
      paintFiles();
      bring(rec);
      notify(added > 1 ? `加了 ${added} 个文件` : '文件已贴进便利贴');
    }

    // 附件选择器：此电脑 / nexl交换区 / 宿主电脑三个来源，只列办公文档。
    // 复用媒体浏览器的 .mf 外壳，交互和系统里其它文件选择器保持一致。
    let picker = null;
    function openPicker() {
      if (picker) { picker.close(); return; }
      let source = 'pc'; // pc | exchange | host
      let path = '/';
      let entries = [];
      let selected = {};
      let busy = false;
      let errorText = '';
      let closed = false;

      const crumb = h('div', { class: 'mf-crumb' });
      const places = h('div', { class: 'mf-places' });
      const list = h('div', { class: 'mf-list', role: 'listbox', 'aria-label': '添加文件' });
      const status = h('span', { class: 'mf-status' }, '');
      const upBtn = h('button', {
        class: 'mf-icon', type: 'button', title: '上一级', 'aria-label': '上一级',
        onclick: () => navigate(parentPath(path)),
      }, icon('chevron-up'));
      const closeBtn = h('button', {
        class: 'mf-icon', type: 'button', title: '关闭', 'aria-label': '关闭',
        onclick: () => close(),
      }, icon('close'));
      const addBtn = h('button', {
        class: 'mf-btn primary', type: 'button', disabled: true,
        onclick: () => pickPaths(selectedPaths()),
      }, '加到便利贴');
      const cancelBtn = h('button', { class: 'mf-btn', type: 'button', onclick: () => close() }, '取消');
      const hostInput = h('input', { class: 'stp-host-input', type: 'file', multiple: true, accept: PICK_ACCEPT });
      const hostBox = h('div', { class: 'stp-host', hidden: true },
        h('span', { class: 'stp-host-ic' }, icon('folder')),
        h('b', {}, '从宿主电脑选择'),
        h('span', {}, `${PICK_HINT}，单张不超过 6 MB`),
        hostInput,
        h('span', { class: 'stp-host-go' }, '选择文件…'));

      const box = h('div', { class: 'mf-box stp-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': '添加文件' },
        h('header', { class: 'mf-head' },
          h('div', { class: 'mf-headtop' },
            h('span', { class: 'mf-title' }, '添加文件'),
            h('div', { class: 'mf-headtools' }, upBtn, closeBtn)),
          places,
          crumb),
        list,
        hostBox,
        h('footer', { class: 'mf-foot' }, status, cancelBtn, addBtn));
      const el = h('div', { class: 'mf stp' }, box);

      function paintPlaces() {
        places.innerHTML = '';
        [['pc', '此电脑'], ['exchange', 'nexl交换区'], ['host', '宿主电脑']].forEach(([id, label]) => {
          places.append(h('button', {
            class: 'mf-place' + (source === id ? ' on' : ''), type: 'button',
            onclick: () => switchSource(id),
          }, label));
        });
      }

      function selectedPaths() {
        return Object.keys(selected).filter((p) => selected[p]);
      }

      function paintSelection() {
        const n = selectedPaths().length;
        addBtn.disabled = busy || n === 0;
        addBtn.textContent = n > 1 ? `加到便利贴 · ${n}` : '加到便利贴';
        upBtn.disabled = source === 'host' || path === (source === 'exchange' ? EXCHANGE : '/');
        if (!busy) status.textContent = (n ? `已选 ${n} 个 · ` : '') + `只收 ${PICK_HINT}`;
        Array.prototype.forEach.call(list.querySelectorAll('.mf-row'), (row) => {
          const p = row.getAttribute('data-path');
          row.classList.toggle('on', !!selected[p]);
          row.setAttribute('aria-selected', selected[p] ? 'true' : 'false');
        });
      }

      function toggle(p) {
        selected[p] = !selected[p];
        paintSelection();
      }

      function paintList() {
        list.innerHTML = '';
        if (busy) { list.append(h('p', { class: 'mf-empty' }, '正在打开…')); return; }
        if (errorText) {
          list.append(h('p', { class: 'mf-empty error' }, errorText));
          paintSelection();
          return;
        }
        if (!entries.length) {
          list.append(h('p', { class: 'mf-empty' }, source === 'exchange'
            ? `nexl交换区里还没有 ${PICK_HINT} 文件。把文件放进去，或切到「此电脑 / 宿主电脑」。`
            : `这里没有 ${PICK_HINT} 文件。`));
          paintSelection();
          return;
        }
        entries.forEach((entry) => {
          const p = joinPath(path, entry.name);
          const row = h('div', {
            class: 'mf-row' + (entry.kind === 'folder' ? ' folder' : ''),
            'data-path': p, 'data-kind': entry.kind, role: 'option', tabindex: '0',
            'aria-selected': selected[p] ? 'true' : 'false',
            onclick: () => (entry.kind === 'folder' ? navigate(p) : toggle(p)),
            ondblclick: () => { if (entry.kind === 'file') pickPaths([p]); },
            onkeydown: (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (entry.kind === 'folder') navigate(p); else toggle(p);
              }
            },
          },
            h('span', { class: 'mf-rowicon' }, entry.kind === 'folder'
              ? icon('folder')
              : h('span', { class: 'stp-ext' }, extLabel(entry.name))),
            h('span', { class: 'mf-rowtext' },
              h('b', { 'data-i18n-skip': true }, entry.name),
              h('i', {}, entry.kind === 'folder' ? '文件夹' : (entry.kindLabel || '文档'))),
            h('span', { class: 'mf-rowsize' }, entry.kind === 'file' ? humanSize(entry.size) : ''),
            entry.kind === 'folder' ? h('span', { class: 'mf-rowgo' }, icon('chevron-up')) : null);
          list.append(row);
        });
        paintSelection();
      }

      function clampPath(next) {
        if (source !== 'exchange') return next || '/';
        return next === EXCHANGE || String(next || '').indexOf(EXCHANGE + '/') === 0 ? next : EXCHANGE;
      }

      async function navigate(next) {
        if (closed) return;
        const at = source;
        path = clampPath(next);
        selected = {};
        errorText = '';
        crumb.textContent = path;
        crumb.title = path;
        busy = true;
        paintList();
        try {
          const r = await api('fs.list', { query: { path, soft: 1 } });
          if (closed || source !== at) return; // 读盘期间切走了，别把旧目录画回来
          const rows = Array.isArray(r.append) ? r.append : [];
          entries = rows.filter((e) => e && (e.kind === 'folder' || PICK_RE.test(e.name)));
          // 文件夹在前，同类按名字排：找文档时不用在一堆文件夹里挑。
          entries.sort((a, b) => (a.kind === b.kind
            ? String(a.name).localeCompare(String(b.name))
            : (a.kind === 'folder' ? -1 : 1)));
          path = clampPath((r.detail && r.detail.path) || path);
          crumb.textContent = path;
          crumb.title = path;
          busy = false;
        } catch (e) {
          if (closed || source !== at) return;
          busy = false;
          entries = [];
          errorText = e.message || '读不到这个文件夹';
        }
        paintList();
      }

      function switchSource(id) {
        source = id;
        busy = false;
        selected = {};
        paintPlaces();
        const host = id === 'host';
        list.hidden = host;
        hostBox.hidden = !host;
        crumb.hidden = host;
        upBtn.disabled = host;
        if (host) {
          addBtn.disabled = true;
          status.textContent = `只收 ${PICK_HINT}`;
          return;
        }
        navigate(id === 'exchange' ? EXCHANGE : '/');
      }

      async function pickPaths(paths) {
        if (busy || !paths.length) return;
        busy = true;
        paintSelection();
        let added = 0, failed = 0;
        for (let i = 0; i < paths.length; i += 1) {
          status.textContent = `正在加入 ${i + 1} / ${paths.length}…`;
          try {
            const r = await api('fs.base64', { query: { path: paths[i] } });
            const d = r.detail || {};
            const name = d.name || String(paths[i]).split('/').pop();
            if (await addBytes(name, d.base64, d.size)) added += 1; else failed += 1;
          } catch (e) {
            failed += 1;
          }
        }
        busy = false;
        if (!added) {
          paintSelection();
          status.textContent = failed ? '没有加进来：文件可能超过 6 MB 或读不到' : `只收 ${PICK_HINT}`;
          return;
        }
        await saveManifest();
        paintFiles();
        bring(rec);
        notify(added > 1 ? `加了 ${added} 个文件` : '文件已贴进便利贴');
        close();
        if (failed) notify(`${failed} 个文件没有加进来`);
      }

      async function addHostFiles(files) {
        const all = Array.from(files || []);
        const ok = all.filter((f) => PICK_RE.test(f.name));
        if (!ok.length) {
          notify(`只收 ${PICK_HINT} 文件`);
          return;
        }
        busy = true;
        paintSelection();
        let added = 0, failed = 0;
        for (let i = 0; i < ok.length; i += 1) {
          status.textContent = `正在加入 ${i + 1} / ${ok.length}…`;
          try {
            const b64 = await readBase64(ok[i]);
            if (await addBytes(ok[i].name, b64, ok[i].size)) added += 1; else failed += 1;
          } catch (e) {
            failed += 1;
          }
        }
        busy = false;
        if (!added) {
          paintSelection();
          status.textContent = '没有加进来：文件可能超过 6 MB 或读不到';
          return;
        }
        await saveManifest();
        paintFiles();
        bring(rec);
        notify(added > 1 ? `加了 ${added} 个文件` : '文件已贴进便利贴');
        close();
        const skipped = all.length - ok.length;
        if (skipped) notify(`跳过 ${skipped} 个不支持的文件`);
        if (failed) notify(`${failed} 个文件没有加进来`);
      }

      function close() {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        el.remove();
        picker = null;
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
        else if (e.key === 'Enter' && selectedPaths().length) { e.preventDefault(); pickPaths(selectedPaths()); }
        else if (e.key === 'Backspace' && !e.target.closest('input') && source !== 'host') {
          e.preventDefault();
          navigate(parentPath(path));
        }
      }

      hostInput.addEventListener('change', () => {
        addHostFiles(hostInput.files);
        hostInput.value = '';
      });
      el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
      document.addEventListener('keydown', onKey, true);
      document.body.append(el);
      picker = { close };

      paintPlaces();
      navigate('/');
    }

    function paintFiles() {
      filesEl.innerHTML = '';
      if (!rec.files.length) { filesEl.hidden = true; return; }
      filesEl.hidden = false;
      rec.files.forEach((f) => {
        const row = h('button', {
          class: 'st-file', type: 'button', 'data-kind': kindOf(f.name),
          title: `打开 ${f.name}`,
          onclick: (e) => { e.stopPropagation(); openFile(f, row); },
        },
          h('span', { class: 'st-file-ic', 'aria-hidden': 'true' }, extLabel(f.name)),
          h('span', { class: 'st-file-name' }, f.name),
          h('span', { class: 'st-file-size' }, humanSize(f.size)),
          h('span', { class: 'st-file-go', 'aria-hidden': 'true' }, '↗'));
        filesEl.append(row);
      });
    }

    function onLookKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLook(); }
    }

    function closeLook() {
      lookEl.hidden = true;
      lookEl.innerHTML = '';
      document.removeEventListener('keydown', onLookKey, true);
    }

    // 图片与纯文本就在纸上放大看，不另开窗口；离开这张纸前一直可读。
    async function quickLook(f) {
      lookEl.innerHTML = '';
      const stage = h('div', { class: 'st-look-body' });
      lookEl.append(
        h('div', { class: 'st-look-head' },
          h('span', { class: 'st-look-name' }, f.name),
          h('button', {
            class: 'st-btn st-look-x', type: 'button', title: '关闭预览', 'aria-label': '关闭预览',
            onclick: (e) => { e.stopPropagation(); closeLook(); },
          }, icon('close'))),
        stage);
      lookEl.hidden = false;
      document.addEventListener('keydown', onLookKey, true);
      try {
        if (kindOf(f.name) === 'img') {
          const r = await api('fs.base64', { query: { path: `${attachDir()}/${f.name}` } });
          stage.append(h('img', {
            class: 'st-look-img', alt: f.name,
            src: `data:${mimeOf(f.name)};base64,${r.detail.base64}`,
          }));
        } else {
          const r = await api('fs.read', { query: { path: `${attachDir()}/${f.name}` } });
          stage.append(h('pre', { class: 'st-look-text' }, (r.detail && r.detail.text) || ''));
        }
      } catch (e) {
        stage.append(h('p', { class: 'st-look-note' }, '这个文件暂时打不开'));
      }
    }

    async function importToOffice(f) {
      const r = await api('fs.base64', { query: { path: `${attachDir()}/${f.name}` } });
      const blob = new Blob([base64Bytes(r.detail.base64)], { type: mimeOf(f.name) });
      const res = await fetch(`/a/office/api/import?name=${encodeURIComponent(f.name)}`, {
        method: 'POST', body: blob,
      });
      let data = {};
      try { data = await res.json(); } catch (e) { /* 错误页未必是 JSON */ }
      if (!res.ok) throw new Error(data.error || '便捷办公打不开这个文件');
      return (data.doc && data.doc.id) || '';
    }

    async function openFile(f, row) {
      const kind = kindOf(f.name);
      if (kind === 'img' || kind === 'text') { quickLook(f); return; }
      if (!OFFICE_KINDS[kind]) { notify('这种格式暂时没有预览，文件已经收在便利贴里'); return; }
      row.classList.add('busy');
      try {
        if (!f.office) {
          f.office = await importToOffice(f);
          await saveManifest();
        }
        if (!f.office) throw new Error('没有拿到文档');
        if (opts.openOffice) opts.openOffice(f.office, f.name);
        else notify('便捷办公没有响应');
      } catch (e) {
        notify(e.message);
      } finally {
        row.classList.remove('busy');
      }
    }

    // 把任意文件拖到这张纸上 = 收进这张便利贴，不再落到桌面又长出一张新便利贴。
    el.addEventListener('dragover', (e) => {
      const types = e.dataTransfer && e.dataTransfer.types;
      if (types && Array.from(types).indexOf('Files') >= 0) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    el.addEventListener('drop', (e) => {
      const list = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
      if (!list.length) return;
      e.preventDefault();
      e.stopPropagation();
      attachFiles(list);
    });

    // ----- 持久化 -----

    function scheduleSave() {
      clearTimeout(rec.timer);
      rec.timer = setTimeout(save, SAVE_MS);
    }

    async function save() {
      rec.timer = 0;
      if (!rec.file) {
        rec.file = `${DIR}/便利贴-${stamp()}-${rec.id}.${rec.ext}`;
      }
      try {
        await api('fs.write', { method: 'POST', fields: { path: rec.file, text: noteFileText(rec) } });
        rec.dirty = false;
        return true;
      } catch (e) {
        if (opts.onError) opts.onError(e);
        return false;
      }
    }

    async function close() {
      clearTimeout(rec.timer);
      notes.delete(rec.id);
      el.remove();
      const paths = [];
      if (rec.file) paths.push(rec.file);
      if (rec.files.length) paths.push(attachDir());
      for (let i = 0; i < paths.length; i += 1) {
        try {
          await api('fs.delete', { method: 'POST', fields: { path: paths[i] } });
        } catch (e) { /* 文件可能已被外部删掉 */ }
      }
      // 最后一张纸关了，应用本身也该退出：底栏不能留一个点不开的空壳。
      if (!notes.size) settleEmpty();
    }

    function minimize() {
      // 收起前把焦点还给桌面：隐藏的正文不该继续吃键盘输入。
      const act = document.activeElement;
      if (act && el.contains(act) && act.blur) act.blur();
      hideApp();
    }

    // ----- 收边（双击桌面时和窗口一起吸到边缘） -----

    function placeTuck(edge) {
      const box = area();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const dx = edge === 'left' ? TUCK_PEEK - w - meta.x
        : (edge === 'right' ? box.w - TUCK_PEEK - meta.x : 0);
      const dy = edge === 'top' ? TUCK_PEEK - h - meta.y : 0;
      rec.tuck.dx = dx;
      rec.tuck.dy = dy;
      el.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
    }

    function tuck() {
      if (rec.tuck) return;
      const box = area();
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const dist = { left: cx, right: box.w - cx, top: cy };
      let edge = 'left';
      if (dist.right < dist[edge]) edge = 'right';
      if (dist.top < dist[edge]) edge = 'top';
      rec.tuck = { edge, dx: 0, dy: 0 };
      el.classList.add('tucked');
      el.dataset.tuck = edge;
      el.style.willChange = 'transform';
      el.style.transition = 'transform 0.36s cubic-bezier(0.22, 0.8, 0.2, 1)';
      placeTuck(edge);
    }

    function untuck() {
      if (!rec.tuck) return;
      rec.tuck = null;
      el.classList.remove('tucked');
      delete el.dataset.tuck;
      el.style.transition = 'transform 0.3s cubic-bezier(0.22, 0.8, 0.2, 1)';
      el.style.transform = '';
      setTimeout(() => {
        if (rec.tuck) return;
        el.style.transition = '';
        el.style.willChange = '';
      }, 320);
    }

    // ----- 手势 -----

    function dragHead(e) {
      if (e.button || e.target.closest('button')) return;
      if (rec.peekClick) { e.preventDefault(); return; } // 点边缘只负责把便利贴收回来
      // 阻止原生文本选择；同时在整次手势期间让 iframe 不参与命中测试。
      e.preventDefault();
      beginGesture();
      // 指针捕获把后续 move/up 锁在这张纸上：手划过子午流注钟时也不会被
      // iframe 的文档截走事件。旧内核不支持时退回 window 监听 + 关 iframe 命中。
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 旧内核无捕获 */ }
      // 置顶已经由便利贴的捕获阶段 pointerdown 做过，这里不再重复写 z-index。
      // 按下就升层：拖动中途再提升图层会卡一帧。
      el.style.willChange = 'transform';
      const sx = e.clientX;
      const sy = e.clientY;
      const x0 = meta.x;
      const y0 = meta.y;
      let moved = false;
      const box2 = area();
      // 拖动只写 transform：位置由合成器搬运，不触发布局，也不重绘纸面内容。
      // 每帧最多写一次（高分鼠标的 pointermove 比屏幕刷新快，逐条写会白干）。
      let lastEv = null;
      let lastTf = '';
      let tx = 0;
      let ty = 0;
      let raf = 0;
      function measure() {
        if (!lastEv) return;
        tx = clampX(x0 + lastEv.clientX - sx, meta.w, box2.w) - x0;
        ty = clamp(y0 + lastEv.clientY - sy, 0, Math.max(0, box2.h - FOLD_H)) - y0;
      }
      function apply() {
        raf = 0;
        if (!moved || !lastEv) return;
        measure();
        // 贴到屏幕边时位置不再变化，重复写同一条 transform 只是白算样式。
        const tf = `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`;
        if (tf !== lastTf) { lastTf = tf; el.style.transform = tf; }
      }
      const move = (ev) => {
        lastEv = ev;
        if (!moved) {
          if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
          moved = true;
          el.classList.add('dragging');
        }
        if (!raf) raf = requestAnimationFrame(apply);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        el.classList.remove('dragging');
        if (!rec.tuck) el.style.willChange = '';
        endGesture();
        if (!moved) return;
        measure(); // 松手比最后一帧快时，用最新指针位置结算
        // 落点一次写回 left/top，再撤掉临时 transform：同一帧完成，不会闪。
        meta.x = clampX(x0 + tx, meta.w, box2.w);
        meta.y = clamp(y0 + ty, 0, Math.max(0, box2.h - FOLD_H));
        el.style.left = `${Math.round(meta.x)}px`;
        el.style.top = `${Math.round(meta.y)}px`;
        el.style.transform = '';
        scheduleSave();
      };
      window.addEventListener('pointermove', move, { passive: true });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    function resize(e) {
      e.preventDefault();
      e.stopPropagation();
      beginGesture();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 旧内核无捕获 */ }
      if (rec.folded) setFold(false);
      // 改尺寸时关掉 height 过渡：过渡会让纸面追着指针慢半拍，还多算几帧。
      el.classList.add('resizing');
      const sx = e.clientX;
      const sy = e.clientY;
      const w0 = meta.w;
      const h0 = meta.h;
      const box2 = area();
      // 改尺寸必然重排纸面内容：同样按帧合并，一帧只排一次。
      let lastEv = null;
      let lastW = 0;
      let lastH = 0;
      let raf = 0;
      function apply() {
        raf = 0;
        if (!lastEv) return;
        meta.w = clamp(w0 + lastEv.clientX - sx, MIN_W, Math.max(MIN_W, box2.w - meta.x - 8));
        meta.h = clamp(h0 + lastEv.clientY - sy, MIN_H, Math.max(MIN_H, box2.h - meta.y - 8));
        const w = Math.round(meta.w);
        const h = Math.round(meta.h);
        if (w === lastW && h === lastH) return;
        lastW = w; lastH = h;
        el.style.setProperty('--st-w', `${w}px`);
        el.style.setProperty('--st-h', `${h}px`);
      }
      const move = (ev) => {
        lastEv = ev;
        if (!raf) raf = requestAnimationFrame(apply);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        apply(); // 用最后的指针位置结算尺寸
        el.classList.remove('resizing');
        endGesture();
        scheduleSave();
      };
      window.addEventListener('pointermove', move, { passive: true });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    // 事件：标题栏拖动 + 双击折叠；正文点一下进入编辑；Esc / ⌘Enter 回预览。
    head.addEventListener('pointerdown', dragHead);
    head.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      setFold(!rec.folded);
    });
    el.addEventListener('pointerdown', () => {
      if (rec.tuck) {
        untuck();
        rec.peekClick = true;
        setTimeout(() => { rec.peekClick = false; }, 400);
      }
      bring(rec);
    }, true);
    render.addEventListener('click', (e) => {
      if (rec.peekClick || e.target.closest('a')) return;
      setEditing(true);
    });
    src.addEventListener('input', () => {
      rec.text = src.value;
      scheduleSave();
    });
    src.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        e.stopPropagation();
        setEditing(false);
      }
    });
    src.addEventListener('blur', () => {
      setTimeout(() => {
        if (rec.editing && !el.contains(document.activeElement)) setEditing(false);
      }, 120);
    });
    el.querySelector('.st-resize').addEventListener('pointerdown', resize);

    // 外壳要复用同一套状态切换，不能再手改 textarea 的 hidden。
    rec.edit = setEditing;
    rec.tuckNow = tuck;
    rec.untuckNow = untuck;
    rec.placeTuck = placeTuck;
    rec.flush = save;
    rec.dismiss = closeLook;
    rec.saveSoon = scheduleSave;
    notes.set(rec.id, rec);
    layer.append(el);
    bring(rec);
    paint();
    paintFiles();
    if (init.edit) setEditing(true);
    return rec;
  }

  // 便利贴都挂在「便利贴」这个应用下面：应用关掉时纸收起，文件留在磁盘。
  async function openApp(flag) {
    flag = flag || {};
    const already = appOpen;
    appOpen = true;
    visible = true;
    layer.hidden = false;
    rememberOpen(true);
    if (!booted) await restore();
    if (flag.create && !notes.size) spawn({ edit: true });
    if (!already) notes.forEach((rec) => bring(rec));
    state();
    return !already;
  }

  async function newNote(init) {
    if (!appOpen) {
      appOpen = true;
      visible = true;
      layer.hidden = false;
      rememberOpen(true);
    }
    if (!booted) await restore();
    const rec = spawn(init);
    state();
    return rec;
  }

  async function closeApp() {
    const all = [...notes.values()];
    for (const rec of all) {
      if (rec.timer) clearTimeout(rec.timer);
      if (rec.dismiss) rec.dismiss();
      // 空白且从未落盘的便利贴不生成文件；有内容的先写盘再收起。
      if (rec.file || rec.text.trim() || rec.files.length) await rec.flush();
    }
    all.forEach((rec) => {
      notes.delete(rec.id);
      rec.el.remove();
    });
    booted = false; // 下次打开重新读盘，外部改过的文件也能看到
    settleEmpty();
  }

  function showApp() {
    if (!appOpen) { openApp(); return; }
    visible = true;
    layer.hidden = false;
    state();
  }

  function hideApp() {
    if (!appOpen) return;
    visible = false;
    layer.hidden = true;
    // 收起时把还在防抖窗口里的正文落盘：应用仍开着，重开不该丢字。
    for (const rec of notes.values()) {
      if (!rec.timer) continue;
      clearTimeout(rec.timer);
      rec.timer = 0;
      if (rec.file || rec.text.trim() || rec.files.length) rec.flush();
    }
    state();
  }

  function toggleVisible() {
    if (!appOpen) { openApp({ create: true }); return; }
    if (visible) hideApp();
    else showApp();
  }

  // 应用入口：没有便利贴就新建一张；已有就把最上面那张拿到面前。
  function spawn(init) {
    if (init) return create(init);
    const empty = [...notes.values()].find((n) => !n.text.trim() && !n.file);
    if (empty) {
      bring(empty);
      if (empty.tuck) empty.untuckNow();
      empty.edit(true); // 折叠的便利贴会先自动展开
      return empty;
    }
    return create({ edit: true });
  }

  const validExt = (name) => (/\.html?$/i.test(name) ? 'html' : (/\.(md|markdown|txt)$/i.test(name) ? 'md' : ''));

  async function restore() {
    if (booted) return;
    booted = true;
    let rows = [];
    try {
      const r = await api('fs.list', { query: { path: DIR, soft: 1 } });
      rows = Array.isArray(r.append) ? r.append : [];
    } catch (e) { return; } // 目录还不存在：第一张便利贴保存时会自动建
    const files = rows
      .filter((row) => row && row.kind === 'file' && (row.ext === '.md' || row.ext === '.html'))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    for (const row of files.slice(-24)) {
      const path = `${DIR}/${row.name}`;
      try {
        const r = await api('fs.read', { query: { path } });
        const ext = row.ext === '.html' ? 'html' : 'md';
        const parsed = parseNote(r.detail && r.detail.text, ext);
        const key = String(row.name).replace(/\.(md|html)$/i, '');
        const files = await listAttachments(key);
        create({ ext, meta: parsed.meta, text: parsed.body, file: path, id: row.name, files });
      } catch (e) { /* 单张读不到不影响其它便利贴 */ }
    }
  }

  // 把 .md / .html 拖到桌面就能贴：内容复制进便利贴，原文件不动。
  root.addEventListener('dragover', (e) => {
    const types = e.dataTransfer && e.dataTransfer.types;
    if (types && Array.from(types).indexOf('Files') >= 0) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  root.addEventListener('drop', (e) => {
    const list = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    const pick = list.filter((f) => validExt(f.name));
    if (!pick.length) return;
    e.preventDefault();
    pick.forEach((file, i) => {
      const ext = validExt(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        newNote({
          ext,
          text: String(reader.result == null ? '' : reader.result),
          meta: {
            x: clamp(e.clientX - 80 + i * 26, 8, Math.max(8, window.innerWidth - DEFAULT_W - 12)),
            y: clamp(e.clientY - 18 + i * 20, 8, Math.max(8, workBottom() - DEFAULT_H - 8)),
            w: DEFAULT_W, h: DEFAULT_H,
          },
        });
      };
      reader.readAsText(file);
    });
  });

  // 桌面变小（窗口缩放、转屏）时把跑出去的便利贴拉回可抓范围。
  window.addEventListener('resize', () => {
    const box = area();
    notes.forEach((rec) => {
      if (rec.tuck) { rec.placeTuck(rec.tuck.edge); return; }
      const m = rec.meta;
      const x = clampX(m.x, m.w, box.w);
      const y = clamp(m.y, 0, Math.max(0, box.h - FOLD_H));
      if (x !== m.x || y !== m.y) {
        m.x = x;
        m.y = y;
        rec.el.style.left = `${Math.round(x)}px`;
        rec.el.style.top = `${Math.round(y)}px`;
        rec.saveSoon();
      }
    });
  });

  return {
    el: layer,
    openApp,
    newNote,
    closeApp,
    hideApp,
    showApp,
    toggleVisible,
    wasOpen,
    isOpen: () => appOpen,
    isVisible: () => appOpen && visible,
    spawn,
    restore,
    count: () => notes.size,
    note,
    // 任务视图要按桌面上的真实位置预览每一张纸；名称取正文首行。
    items() { return [...notes.values()].filter((rec) => rec.el); },
    title(rec) { return rec ? titleOf(rec.text, rec.ext) : '便利贴'; },
    focus(rec) {
      if (!rec) return;
      if (!appOpen) openApp();
      else if (!visible) showApp();
      if (rec.tuck) rec.untuckNow();
      bring(rec);
    },
    tuckAll() { notes.forEach((rec) => { if (rec.tuckNow) rec.tuckNow(); }); },
    untuckAll() { notes.forEach((rec) => { if (rec.untuckNow) rec.untuckNow(); }); },
    anyTucked() {
      let found = false;
      notes.forEach((rec) => { if (rec.tuck) found = true; });
      return found;
    },
  };
}
