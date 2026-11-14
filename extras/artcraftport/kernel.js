// artcraftport 内核：命令总线、画布、窗口外框、面板与文件进出。
// 每个 craft 自带一套贴合原软件的布局，内核算只提供原子件，不规定长相。
import { h, clear } from '/a/can.js';

export { h, clear };

/* ---------------- 命令总线 ---------------- */

const commands = new Map();
let scope = 0;

// 每个 craft 挂载时登记自己的命令，卸载时按前缀收回，避免重复挂载后互相覆盖。
// owner 由 commandScope 传入：登记与回收必须用同一个作用域号，否则旧命令永远删不掉。
export function registerCommand(id, help, fn, owner) {
  commands.set(id, { help, fn, scope: owner === undefined ? scope : owner });
  return id;
}

export function runCommand(id, args) {
  const cmd = commands.get(id);
  if (!cmd) throw new Error('未知命令：' + id);
  return cmd.fn(args || {});
}

export function commandList() {
  return Array.from(commands.entries()).map(([id, c]) => ({ id, help: c.help }));
}

export function commandScope() {
  const mine = scope;
  scope += 1;
  return {
    add(id, help, fn) { return registerCommand(id, help, fn, mine); },
    dispose() {
      for (const [id, c] of Array.from(commands.entries())) {
        if (c.scope === mine) commands.delete(id);
      }
    },
  };
}

// 页面级控制通道：浏览器控制台、NEXLOS 的自动化脚本都从这里进。
if (typeof window !== 'undefined') {
  window.artcraftport = {
    run: runCommand,
    commands: commandList,
    open(id) {
      if (window.__artcraftportShow) window.__artcraftportShow(id);
      else location.hash = '#/artcraftport/' + id;
    },
    home() {
      if (window.__artcraftportHome) window.__artcraftportHome();
      else location.hash = '#/artcraftport';
    },
  };
}

/* ---------------- 基础工具 ---------------- */

export const clamp = (n, lo, hi) => Math.min(Math.max(Number(n) || 0, lo), hi);
export const uid = () => Math.random().toString(36).slice(2, 9);

export function download(name, data, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function saveCanvas(canvas, name) {
  canvas.toBlob((blob) => {
    if (blob) download(name, blob, 'image/png');
  }, 'image/png');
}

export function pickFile(accept, cb) {
  const input = h('input', { type: 'file', accept, hidden: true });
  document.body.append(input);
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    input.remove();
    if (f) cb(f);
  });
  input.click();
}

export function pickImage(cb) {
  pickFile('image/*', (file) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => cb(img, file);
    img.onerror = () => cb(null, file);
    img.src = url;
  });
}

export function readFileText(file, cb) {
  const r = new FileReader();
  r.onload = () => cb(String(r.result || ''));
  r.readAsText(file);
}

// 逗号、空格、换行都能当分隔符；十六进制里常见的 0x 前缀一并去掉。
export function parseHex(text) {
  const parts = String(text || '').replace(/0x/gi, ' ').split(/[^0-9a-fA-F]+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i].length % 2 ? '0' + parts[i] : parts[i];
    for (let k = 0; k < s.length; k += 2) out.push(parseInt(s.slice(k, k + 2), 16));
  }
  return out;
}

/* ---------------- 图标 ---------------- */

// 24×24 线性图标；深色工作台里比文字符号更接近原软件的观感。
export const ICONS = {
  cursor: 'M5 3l14 8-6 1.6L10 19z',
  marquee: 'M3 3h6M15 3h6M3 21h6M15 21h6M3 9v6M21 9v6',
  lasso: 'M12 4c4.4 0 8 2.5 8 5.6 0 3-3.6 5.4-8 5.4-1.5 0-2.9-.3-4-.8M8 14.2C4.9 13.3 3 11.6 3 9.6 3 6.5 6.6 4 12 4M8 15v3a2 2 0 1 0 3 1.7',
  wand: 'M4 20 15 9M13 3l.7 2.1L16 6l-2.3.9L13 9l-.7-2.1L10 6l2.3-.9zM19 11l.5 1.5L21 13l-1.5.5L19 15l-.5-1.5L17 13l1.5-.5z',
  crop: 'M6 2v16h16M2 6h16v16',
  brush: 'M4 20c2 .3 4-.6 5-2.3.7-1.2.4-2.6-.5-3.4-.9-.8-2.3-.8-3.2.1C3.5 16 4 18.5 4 20zM10 14 20 4',
  eraser: 'M8 20h12M4.5 15.5 15 5a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L10 20H6l-1.5-1.5a2 2 0 0 1 0-3z',
  text: 'M5 5h14M12 5v14M9 19h6',
  pen: 'M12 19l7-7-4-4-7 7v4zM14 5l2-2 4 4-2 2',
  hand: 'M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7s-6-3-6-7v-3',
  zoom: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5M7.5 10.5h6M10.5 7.5v6',
  image: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  layers: 'M12 3 3 8l9 5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  square: 'M4 4h16v16H4z',
  circle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  triangle: 'M12 4 21 20H3z',
  star: 'M12 3l2.7 6.2 6.8.6-5.1 4.5 1.5 6.7-5.9-3.5-5.9 3.5 1.5-6.7L3.5 9.8l6.8-.6z',
  line: 'M4 20 20 4',
  play: 'M7 4l13 8-13 8z',
  pause: 'M8 4v16M16 4v16',
  stop: 'M5 5h14v14H5z',
  skipBack: 'M18 4 5 12l13 8zM4 4v16',
  skipForward: 'M6 4l13 8-13 8zM20 4v16',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  undo: 'M4 9h10a5 5 0 0 1 0 10h-4M4 9l4-4M4 9l4 4',
  redo: 'M20 9H10a5 5 0 0 0 0 10h4M20 9l-4-4M20 9l-4 4',
  save: 'M4 4h13l3 3v13H4zM8 4v6h8V4M8 20v-6h8v6',
  download: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  table: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  slide: 'M2 4h20v13H2zM12 17v4M8 21h8',
  film: 'M2 4h20v16H2zM7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5',
  scissors: 'M6 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 23a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.5 9.5 21 4M8.5 14.5 21 20',
  speaker: 'M4 9h4l5-4v14l-5-4H4zM16 8a5 5 0 0 1 0 8M18.5 5.5a8 8 0 0 1 0 13',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 .6-2-1.2L14 4h-4l-.6 2.4-2 1.2L5 7l-2 4 2 1v2l-2 1 2 4 2.4-.6 2 1.2L10 22h4l.6-2.4 2-1.2 2.4.6 2-4-2-1z',
  node: 'M5 5h5v5H5zM14 14h5v5h-5zM10 7.5h4v9M12 7.5h2',
  cube: 'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10',
  palette: 'M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-2 0-1.6-1-1.6-1-3 0-1 .8-2 2-2h2a4 4 0 0 0 4-4c0-3.9-4-7-9-7zM7.5 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM11 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM15.5 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z',
  italic: 'M10 4h8M6 20h8M14 4 10 20',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 21h14',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  print: 'M6 9V2h12v7M6 18H4v-7h16v7h-2M6 14h12v8H6z',
  trash: 'M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  cropMark: 'M6 2v16h16M2 6h16v16',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  link2: 'M9 12h6M12 3v18',
};

export function icon(name, size) {
  return h('svg', {
    class: 'ag-ic', viewBox: '0 0 24 24', width: size || 16, height: size || 16,
    'aria-hidden': 'true', html: '<path d="' + (ICONS[name] || ICONS.square) + '"/>',
  });
}

export function iconButton(name, title, onClick, opts) {
  opts = opts || {};
  return h('button', {
    class: 'ag-icbtn' + (opts.active ? ' active' : '') + (opts.cls ? ' ' + opts.cls : ''),
    type: 'button', title: title, 'aria-label': title, onclick: onClick,
  }, icon(name, opts.size || 16));
}

/* ---------------- 画布 ---------------- */

export function createCanvas(host, width, height, opts) {
  opts = opts || {};
  const canvas = h('canvas', { class: 'ag-canvas', width, height });
  canvas.style.maxWidth = '100%';
  canvas.style.maxHeight = opts.maxHeight || '100%';
  const wrap = h('div', { class: 'ag-canvas-wrap' }, canvas);
  host.append(wrap);
  const ctx = canvas.getContext('2d');
  const view = {
    canvas, ctx, width, height, wrap,
    clear(color) {
      if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, width, height); }
      else ctx.clearRect(0, 0, width, height);
    },
    point(ev) {
      const r = canvas.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) * (width / r.width),
        y: (ev.clientY - r.top) * (height / r.height),
      };
    },
    onDrag(down, move, up) {
      canvas.addEventListener('pointerdown', (ev) => {
        canvas.setPointerCapture(ev.pointerId);
        const p = view.point(ev);
        if (down(p, ev) === false) return;
        const onMove = (e) => move(view.point(e), e);
        const onUp = (e) => {
          canvas.removeEventListener('pointermove', onMove);
          canvas.removeEventListener('pointerup', onUp);
          canvas.removeEventListener('pointercancel', onUp);
          if (up) up(view.point(e), e);
        };
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onUp);
      });
    },
    snapshot() { return canvas.toDataURL('image/png'); },
  };
  return view;
}

/* ---------------- 表单 ---------------- */

export function slider(label, min, max, step, value, onInput) {
  const out = h('span', { class: 'ag-val' }, String(value));
  const input = h('input', {
    type: 'range', min, max, step, value,
    oninput(e) { out.textContent = e.target.value; onInput(Number(e.target.value)); },
  });
  return h('label', { class: 'ag-field ag-range' },
    h('span', { class: 'ag-label' }, label, out), input);
}

// 显影 / 材质面板那种「标签 + 数值 + 细滑块」一行。
export function sliderRow(label, min, max, step, value, fmt, onInput) {
  const out = h('span', { class: 'ag-rowval' }, fmt ? fmt(value) : String(value));
  const input = h('input', {
    type: 'range', min, max, step, value,
    oninput(e) {
      const v = Number(e.target.value);
      out.textContent = fmt ? fmt(v) : String(v);
      onInput(v);
    },
  });
  return h('div', { class: 'ag-srow' },
    h('div', { class: 'ag-srow-top' }, h('span', { class: 'ag-srow-label' }, label), out), input);
}

export function numberField(label, value, opts) {
  opts = opts || {};
  const input = h('input', {
    type: 'number', value, min: opts.min, max: opts.max, step: opts.step || 1,
    onchange(e) { opts.onInput && opts.onInput(Number(e.target.value)); },
  });
  return h('label', { class: 'ag-field' }, h('span', { class: 'ag-label' }, label), input);
}

export function textField(label, value, onInput, opts) {
  opts = opts || {};
  const input = h(opts.multiline ? 'textarea' : 'input', {
    value, rows: opts.rows || 3, placeholder: opts.placeholder || '',
    oninput(e) { onInput && onInput(e.target.value); },
  });
  if (opts.multiline) input.className = 'ag-textarea';
  return h('label', { class: 'ag-field' }, h('span', { class: 'ag-label' }, label), input);
}

export function selectField(label, options, value, onChange) {
  const sel = h('select', { onchange(e) { onChange(e.target.value); } },
    options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  return h('label', { class: 'ag-field' }, h('span', { class: 'ag-label' }, label), sel);
}

export function colorField(label, value, onChange) {
  const input = h('input', {
    type: 'color', value,
    oninput(e) { onChange(e.target.value); },
  });
  return h('label', { class: 'ag-field ag-color' }, h('span', { class: 'ag-label' }, label), input);
}

// 面板里的紧凑色块行（材质 / 界面设计的 fill 行）。
export function colorRow(label, value, onChange) {
  return h('label', { class: 'ag-color-row' },
    h('span', { class: 'ag-color-chip', style: 'background:' + value },
      h('input', { type: 'color', value, oninput(e) { onChange(e.target.value); } })),
    h('span', { class: 'ag-color-name' }, label),
    h('span', { class: 'ag-color-hex' }, String(value).toUpperCase()));
}

/* ---------------- 面板 ---------------- */

export function panel(title, opts) {
  opts = opts || {};
  const body = h('div', { class: 'ag-panel-body' });
  const caret = h('span', { class: 'ag-panel-caret' }, '▾');
  const head = h('div', {
    class: 'ag-panel-head',
    onclick() {
      if (opts.static) return;
      const closed = body.hidden;
      body.hidden = !closed;
      caret.textContent = closed ? '▾' : '▸';
    },
  }, h('span', { class: 'ag-panel-title' }, title), opts.actions || caret);
  const el = h('section', { class: 'ag-panel' }, head, body);
  return { el, body, head, setTitle(t) { head.firstChild.textContent = t; } };
}

export function panelStack(children) {
  return h('div', { class: 'ag-panel-stack' }, children || []);
}

export function sectionLabel(text) {
  return h('div', { class: 'ag-section-label' }, text);
}

export function fieldRow(label, control) {
  return h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, label), control);
}

/* ---------------- 功能区（Office 应用） ---------------- */

// 轻量功能区：标签页 + 分组 + 大/小按钮，行为对齐长文档 / 表格 / 幻灯片的通用功能区。
export function ribbonBar(tabs, opts) {
  opts = opts || {};
  const tabStrip = h('div', { class: 'ag-ribbon-tabs' });
  const content = h('div', { class: 'ag-ribbon-content' });
  const btns = {};
  let active = opts.active || tabs[0].id;

  function render() {
    clear(content);
    const tab = tabs.filter((t) => t.id === active)[0] || tabs[0];
    tab.groups.forEach((g) => {
      const group = h('div', { class: 'ag-rgroup' });
      const row = h('div', { class: 'ag-rgroup-body' });
      (g.items || []).forEach((it) => {
        if (it.sep) { row.append(h('span', { class: 'ag-rsep' })); return; }
        row.append(h('button', {
          class: 'ag-rbtn' + (it.large ? ' large' : '') + (it.active ? ' active' : ''),
          type: 'button', title: it.title || it.label,
          onclick: it.onClick,
        }, it.icon ? icon(it.icon, it.large ? 22 : 15) : null,
          h('span', { class: 'ag-rbtn-label' }, it.label)));
      });
      if (g.groups) {
        g.groups.forEach((col) => {
          const sub = h('div', { class: 'ag-rcol' });
          col.forEach((it) => sub.append(h('button', {
            class: 'ag-rbtn small', type: 'button', title: it.title || it.label, onclick: it.onClick,
          }, it.icon ? icon(it.icon, 14) : null, h('span', { class: 'ag-rbtn-label' }, it.label))));
          row.append(sub);
        });
      }
      group.append(row, h('div', { class: 'ag-rgroup-label' }, g.label));
      content.append(group);
    });
    Object.keys(btns).forEach((id) => btns[id].classList.toggle('active', id === active));
  }

  tabs.forEach((t) => {
    btns[t.id] = h('button', {
      class: 'ag-ribbon-tab', type: 'button',
      onclick() { active = t.id; render(); },
    }, t.label);
    tabStrip.append(btns[t.id]);
  });
  render();

  const el = h('div', { class: 'ag-ribbon' }, tabStrip, content);
  return {
    el,
    select(id) { active = id; render(); },
    refresh: render,
    get active() { return active; },
  };
}

/* ---------------- 快速开始 ---------------- */

export function stageHint(title, text, actions) {
  return h('div', { class: 'ag-stage-hint' },
    h('div', { class: 'ag-stage-hint-card' },
      h('div', { class: 'ag-stage-hint-eyebrow' }, '快速开始'),
      h('h3', { class: 'ag-stage-hint-title' }, title),
      h('p', { class: 'ag-stage-hint-text' }, text),
      h('div', { class: 'ag-stage-hint-actions' },
        (actions || []).map((a) => h('button', {
          class: 'ag-btn' + (a.primary ? ' primary' : ''), type: 'button',
          onclick: a.onClick,
        }, a.label)))));
}

/* ---------------- 窗口外框 ---------------- */

// 只负责四件事：返回、菜单、插槽、状态栏。工作区长什么样由每个 craft 自己搭。
export function craftShell(host, def) {
  def = def || {};
  function goHome() {
    if (window.__artcraftportHome) window.__artcraftportHome();
    else location.hash = '#/artcraftport';
  }
  const back = h('button', {
    class: 'ag-back', type: 'button', title: '回到矩阵',
    onclick: goHome,
  }, '←');
  const menus = h('nav', { class: 'ag-menus' });
  // 标题是产品给的默认文件名（未改名入口），不是用户正文：放行翻译，
  // 英文界面下 "未命名-1.psd" 才会显示成 "Untitled-1.psd"。
  const title = h('span', { class: 'ag-craft-name' }, def.file || def.name);
  const up = h('span', { class: 'ag-craft-up' }, def.up || '');
  const tag = h('span', { class: 'ag-craft-mode' }, def.tag || '');
  const search = def.search
    ? h('span', { class: 'ag-mb-search' }, icon('search', 13), h('span', {}, def.search))
    : null;
  const menubar = h('header', { class: 'ag-menubar' },
    back, menus, h('span', { class: 'ag-spacer' }),
    search || null,
    def.center ? h('span', { class: 'ag-mb-center' }, title) : null,
    def.center ? null : title,
    up, tag);

  const sub = h('div', { class: 'ag-subbar' });
  const body = h('div', { class: 'ag-body' });
  const statusLeft = h('span', { class: 'ag-status-text' }, def.hint || '');
  const statusInfo = h('span', { class: 'ag-status-info' }, '');
  const status = h('footer', { class: 'ag-status' },
    statusLeft, h('span', { class: 'ag-spacer' }), statusInfo);
  const toastBox = h('div', { class: 'ag-toast' });
  const root = h('div', { class: 'ag-craft ag-layout-' + (def.layout || 'default'), 'data-theme': def.theme || 'dark' },
    menubar, sub, body, status, toastBox);
  host.append(root);

  let openWrap = null;
  function closeMenus() {
    if (!openWrap) return;
    openWrap.pop.hidden = true;
    openWrap.btn.classList.remove('open');
    openWrap = null;
  }
  document.addEventListener('pointerdown', (e) => {
    if (!root.isConnected) { closeMenus(); return; }
    if (openWrap && !openWrap.wrap.contains(e.target)) closeMenus();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

  function setMenus(list) {
    closeMenus();
    clear(menus);
    (list || []).forEach((m) => {
      const wrap = h('div', { class: 'ag-menu-wrap' });
      const pop = h('div', { class: 'ag-menu-pop', hidden: true },
        (m.items || []).map((it) => {
          if (it.sep) return h('div', { class: 'ag-menu-sep' });
          return h('button', {
            class: 'ag-menu-item' + (it.disabled ? ' disabled' : ''),
            type: 'button', disabled: it.disabled || false,
            onclick(e) {
              e.stopPropagation();
              closeMenus();
              if (it.onClick) it.onClick();
            },
          },
          h('span', { class: 'ag-menu-label' },
            it.checked ? h('span', { class: 'ag-menu-check' }, '✓ ') : null,
            h('span', {}, it.label)),
          it.shortcut ? h('span', { class: 'ag-menu-kbd' }, it.shortcut) : null);
        }));
      const btn = h('button', {
        class: 'ag-menu-btn', type: 'button',
        onclick(e) {
          e.stopPropagation();
          if (openWrap && openWrap.wrap === wrap) { closeMenus(); return; }
          closeMenus();
          pop.hidden = false;
          btn.classList.add('open');
          openWrap = { wrap, btn, pop };
          const r = wrap.getBoundingClientRect();
          if (window.innerWidth <= 760) {
            // 窄屏下菜单栏是横向滚动容器，绝对定位的弹层会被裁掉，改用 fixed 贴按钮
            pop.style.position = 'fixed';
            pop.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 228)) + 'px';
            pop.style.top = Math.round(r.bottom + 2) + 'px';
            pop.style.right = 'auto';
          } else {
            pop.style.position = '';
            pop.style.left = (r.left + 220 > window.innerWidth ? 'auto' : '-4px');
            pop.style.right = (r.left + 220 > window.innerWidth ? '-4px' : 'auto');
          }
        },
      }, m.label);
      wrap.append(btn, pop);
      menus.append(wrap);
    });
  }

  function baseMenus() {
    setMenus([
      { label: '文件', items: [
        { label: '回到矩阵', shortcut: 'Esc', onClick: goHome },
      ] },
      { label: '帮助', items: [
        { label: '命令面板', onClick: () => toastIn(root, '控制台调用 artcraftport.commands() 查看全部命令') },
      ] },
    ]);
  }

  function toast(text) { toastIn(root, text); }

  baseMenus();
  return {
    root, menubar, menus, sub, body, status, title, goHome, toast,
    theme: def.theme || 'dark',
    setMenus, baseMenus,
    setStatus(text) { statusLeft.textContent = text; },
    setInfo(text) { statusInfo.textContent = text || ''; },
    setTitle(text) { title.textContent = text || def.name; },
  };
}

export function toastIn(host, text) {
  let box = host.querySelector(':scope > .ag-toast');
  if (!box) {
    box = h('div', { class: 'ag-toast' });
    host.append(box);
  }
  box.textContent = text;
  box.classList.add('show');
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.remove('show'), 1800);
}

/* ---------------- craft 注册 ---------------- */

export const CRAFTS = [];

export function craft(def) {
  CRAFTS.push(def);
  return def;
}

export function findCraft(id) {
  return CRAFTS.filter((c) => c.id === id)[0] || null;
}
