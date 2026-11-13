import { h, clear, api } from './can.js';
import { appIcon } from './appicons.js';
import { applyAppearance, applyTypography, RETRO_BACKGROUNDS, RETRO_FONTS, RETRO_FONT_SIZES, wallpaperField, wallpaperKey } from './appearance.js';
import { PIXEL_ICONS } from './classicicons.js';
import { LANGUAGES, availableLanguages, systemLanguage, setLanguage, getLanguage, localizeDoc, observeDoc, t, formatTime } from './i18n.js';
import { starOpen } from './star.js';

// 设置是 Win10 “设置”应用的结构：左侧分类、右侧白色卡片。
// 每一项都落到真实的 settings.* / fs.* / app.list / system.status 上：
// 改主题、强调色、壁纸、时钟制式立即写回 NEXLOS_HOME/settings.json，
// 同时 postMessage 给桌面外壳，让整个桌面当场变色，而不是等下次刷新。

const DEFAULT_PREFS = {
  appearance: 'current', retroWallpaper: 'default',
  retroFont: 'pixel', retroFontSize: 12,
  theme: 'light', accent: '#0078d4', wallpaper: 'snowfog',
  clock24: false, reduceMotion: false, name: 'NexlOS', language: 'en',
  companion: '', companionSize: 100, companionHidden: false, companionMode: 'desktop',
};

// 分类顺序按 Win10 原样。每个分类都有一页真内容，不画打不开的入口。
const CATS = [
  { id: 'system', name: '系统', desc: '显示、声音、通知、电源', keys: '显示 声音 通知 电源 存储 关于 分辨率 缩放 电池' },
  { id: 'devices', name: '设备', desc: '蓝牙、打印机、鼠标', keys: '蓝牙 打印机 扫描仪 鼠标 触控 显示 自动播放' },
  { id: 'network', name: '网络和 Internet', desc: '状态、以太网、代理', keys: '网络 以太网 代理 状态 Wi-Fi 回环' },
  { id: 'personal', name: '个性化', desc: '主题、背景、配色', keys: '背景 壁纸 颜色 主题 字体 字号 深色 浅色 强调色 NEXL Windos2026 现代 复古 外观', labels: ['字体与字号', '界面字体', '界面字号', '背景图片', '深色', '浅色', '强调色'] },
  { id: 'apps', name: '应用', desc: '应用和功能、默认应用', keys: '应用 功能 默认 卸载 打开 浏览器' },
  { id: 'time', name: '时间和语言', desc: '日期、时间、区域', keys: '时间 日期 语言 区域 时区 24 小时 制式' },
  { id: 'gaming', name: '游戏', desc: '游戏栏、游戏模式、捕获', keys: '游戏 游戏栏 模式 捕获' },
  { id: 'privacy', name: '隐私', desc: '位置、相机、麦克风', keys: '隐私 位置 相机 麦克风 诊断 权限' },
  { id: 'update', name: '更新和安全', desc: '更新、恢复、开发者', keys: '更新 安全 恢复 备份 开发者 命令 重置' },
];

const ACCENTS = [
  '#0078d4', '#0063b1', '#2d7d9a', '#00b294', '#107c10',
  '#498205', '#8764b8', '#b146c2', '#e81123', '#ea005e',
  '#ff8c00', '#767676',
];

const USAGE_COLORS = ['#0078d4', '#00b294', '#8764b8', '#ff8c00', '#e81123', '#498205', '#2d7d9a', '#b146c2'];

// 现代主题只保留一张图片壁纸（2560×1600）。
// 旧配置的 default/canyon/valley 由 os.js 的 applyWallpaper 回退到 snowfog。
const WALLS = [
  { id: 'snowfog', name: '丹霞碧水', cls: 'wall-snowfog' },
];

// 页面图标统一走 24×24 线稿，颜色继承文字色；卡片左侧的图标才有底色。
const GLYPHS = {
  system: '<rect x="3" y="4.5" width="18" height="13" rx="1.6"/><path d="M9 20.5h6M12 17.5v3"/>',
  devices: '<rect x="7" y="3.5" width="10" height="17" rx="2"/><path d="M10.5 6.5h3"/>',
  network: '<path d="M3 9.5a13 13 0 0 1 18 0M6.5 13a8.5 8.5 0 0 1 11 0M9.8 16.4a4 4 0 0 1 4.4 0"/><circle cx="12" cy="19.6" r=".9"/>',
  personal: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.8 2-1.7 0-1.7-1.8-1.8-1.8-3.2 0-1 .8-1.7 1.9-1.7h2.1c1.7 0 2.8-1.2 2.8-2.8 0-4.2-3.2-7.6-7-7.6z"/><circle cx="7.6" cy="10.2" r="1"/><circle cx="10.6" cy="7" r="1"/><circle cx="14.6" cy="7.2" r="1"/>',
  apps: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>',
  time: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.4l3.4 2"/>',
  gaming: '<rect x="2.8" y="7" width="18.4" height="10" rx="4"/><path d="M6.5 10v4M4.5 12h4M16 10.4h.1M18 13.4h.1"/>',
  privacy: '<rect x="4.5" y="10" width="15" height="10" rx="1.6"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  update: '<path d="M12 3.2 19 6v5.4c0 4.3-2.9 7.8-7 9.4-4.1-1.6-7-5.1-7-9.4V6z"/><path d="m8.9 12.2 2.1 2.1 4.1-4.3"/>',
  display: '<rect x="3" y="4.5" width="18" height="13" rx="1.6"/><path d="M9 20.5h6M12 17.5v3"/>',
  sound: '<path d="M4 9.5h3.4L12 5.5v13L7.4 14.5H4zM15.6 9a4.2 4.2 0 0 1 0 6M18.2 6.6a8 8 0 0 1 0 10.8"/>',
  bell: '<path d="M6 16.5h12l-1.4-2.2V10a4.6 4.6 0 0 0-9.2 0v4.3zM10 19a2 2 0 0 0 4 0"/>',
  power: '<path d="M12 3v9M6.4 6.4a8 8 0 1 0 11.2 0"/>',
  storage: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8V6M4.5 12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8"/>',
  memory: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M8.2 6h7.6M7.2 8l3.6 8M16.8 8l-3.6 8"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 10.6V17M12 7.6h.1"/>',
  paint: '<path d="M4.5 15.5 15 5a3 3 0 0 1 4.2 4.2L8.7 19.7H4.5z"/><path d="m13.4 6.6 4 4"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5.5H4.5V6H10"/>',
};

function glyph(name, cls) {
  const body = GLYPHS[name] || GLYPHS.info;
  const pixel = PIXEL_ICONS[name];
  return h('svg', { class: `st-ic ${cls || ''}`.trim(), viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: pixel ? `<g class="nexlos-modern-icon">${body}</g><g class="nexlos-classic-icon" transform="scale(.75)">${pixel}</g>` : body,
  });
}

function pad(n) { return String(n).padStart(2, '0'); }

function fmtBytes(n) {
  n = Number(n || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function timeText(prefs) {
  const d = new Date();
  if (prefs.clock24) return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return formatTime(d, { second: '2-digit', hour12: true });
}

export function mountSettings(host) {
  const S = {
    cat: 'system',
    sysPage: 'home',
    prefs: Object.assign({}, DEFAULT_PREFS),
    apps: [],
    purge: Object.create(null), // 每个应用一行“同时删数据”，卸载后清空
    confirming: '', // 第一次点“卸载”只展开确认，第二次才真正删除
    removing: '',
    status: null,
    usage: null,
    workspace: null, // 宿主工作区：根目录、配额与占用
    loading: true,
    error: '',
    filter: '',
    checking: false,
    updated: false,
    checked: false,
    savingPrefs: false,
    lives: [],
    companionBusy: false,
    companionStatus: '',
    companionConfirm: '',
  };
  let prefsRevision = 0;

  const navEl = h('nav', { class: 'st-nav', 'aria-label': '设置分类' });
  const mainEl = h('main', { class: 'st-main' });
  const searchInput = h('input', {
    class: 'st-search-input', type: 'search', placeholder: '查找设置', autocomplete: 'off',
    oninput: () => { S.filter = searchInput.value.trim(); paintNav(); },
    onkeydown: (e) => {
      if (e.key === 'Escape') { searchInput.value = ''; S.filter = ''; paintNav(); }
      if (e.key === 'Enter') {
        const first = navEl.querySelector('.st-nav-item');
        if (first) first.click();
      }
    },
  });
  const accountBtn = h('button', {
    class: 'st-account', type: 'button', title: '账户与关于',
    onclick: () => { S.cat = 'system'; S.sysPage = 'about'; paintNav(); paintMain(); },
  });
  const header = h('header', { class: 'st-head' },
    h('div', { class: 'st-head-title' }, h('span', { class: 'st-logo' }, glyph('system')), h('b', {}, '设置')),
    h('label', { class: 'st-search' }, h('svg', { class: 'st-ic', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/>' }), searchInput),
    accountBtn);

  // 自定义壁纸在设置里选：同一源下写到外壳的 localStorage，再让外壳换图，
  // 比从 iframe 里远程点父页面的文件框可靠（浏览器要求文件选择来自真实手势）。
  const wallInput = h('input', {
    type: 'file', accept: 'image/*', class: 'st-file', 'aria-label': '上传主题背景',
    onchange: () => {
      const file = wallInput.files && wallInput.files[0];
      if (file) pickCustomWallpaper(file);
      wallInput.value = '';
    },
  });

  const frame = h('div', { class: 'st' }, header, h('div', { class: 'st-body' }, navEl, mainEl), wallInput);
  host.append(frame);
  // 设置页每次重绘都会换一批节点，观察器负责把新文案就地翻译。
  observeDoc(document);
  localizeDoc(document);

  function prefsAvailable() { return !S.loading && !S.error; }

  // ---------- 读取 ----------
  async function load() {
    const requestedAt = prefsRevision;
    S.loading = true;
    S.error = '';
    paintNav();
    paintMain();
    try {
      const results = await Promise.all([
        api('settings.get'),
        api('app.list').catch(() => ({ append: [] })),
        api('system.status').catch(() => ({ detail: {} })),
        api('fs.usage').catch(() => null),
        api('workspace.info').catch(() => null),
        api('companion.list').catch(() => ({ append: [], detail: {} })),
      ]);
      // A live shell patch may arrive while slow storage metrics are loading.
      // Never let the older settings snapshot undo that user action.
      if (prefsRevision === requestedAt) S.prefs = Object.assign({}, DEFAULT_PREFS, results[0].detail || {});
      S.apps = results[1].append || [];
      S.status = results[2].detail || {};
      S.usage = results[3];
      S.workspace = results[4];
      S.lives = (results[5] && results[5].append) || [];
      applyLocal();
    } catch (e) {
      S.error = e.message;
    } finally {
      S.loading = false;
      paintNav();
      paintMain();
      paintAccount();
    }
  }

  function applyLocal() {
    applyAppearance(S.prefs.appearance);
    applyTypography(S.prefs);
    // 语言先落到本应用，再重译已渲染的节点；缺词条时保留中文原文。
    const lang = S.prefs.language || 'en';
    const changed = lang !== getLanguage();
    setLanguage(lang);
    if (changed) localizeDoc(document, true);
    // 主题只在本应用内先落地，桌面外壳收到 postMessage 后同步整台桌面。
    document.body.classList.toggle('st-dark', S.prefs.theme === 'dark');
    frame.classList.toggle('st-dark', S.prefs.theme === 'dark');
    frame.style.setProperty('--st-accent', S.prefs.accent);
  }

  async function setPref(patch) {
    if (S.savingPrefs) return;
    S.savingPrefs = true;
    paintMain(true);
    try {
      const r = await api('settings.set', { method: 'POST', fields: patch });
      prefsRevision += 1;
      Object.assign(S.prefs, r.detail || patch);
      applyLocal();
      post('nexlos.settings', { patch: r.detail || patch });
      return true;
    } catch (e) {
      toast(`设置没保存：${e.message}`);
      return false;
    } finally {
      S.savingPrefs = false;
      paintNav();
      paintMain(true);
      paintAccount();
    }
  }

  function onPrefsMessage(e) {
    if (e.origin === location.origin && e.source === window.parent && e.data && e.data.type === 'nexlos.settings.page' && CATS.some(cat => cat.id === e.data.page)) {
      S.cat = e.data.page; paintNav(); paintMain(true); return;
    }
    if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.type !== 'nexlos.settings' || !e.data.patch) return;
    prefsRevision += 1;
    Object.assign(S.prefs, e.data.patch);
    applyLocal();
    paintMain(true);
    paintAccount();
  }
  window.addEventListener('message', onPrefsMessage);

  // ---------- 外壳 ----------
  function paintAccount() {
    clear(accountBtn);
    const name = S.prefs.name || 'NexlOS';
    accountBtn.append(
      h('span', { class: 'st-avatar' }, name.slice(0, 1).toUpperCase()),
      h('span', { class: 'st-account-meta' }, h('b', {}, name), h('i', {}, '本地账户')),
      h('span', { class: 'st-account-arrow' }, '›'));
  }

  function visibleCats() {
    const q = S.filter.toLowerCase();
    if (!q) return CATS;
    return CATS.filter((c) => [c.name, c.keys, t(c.name), t(c.desc), ...c.keys.split(' ').map(t), ...(c.labels || []).map(t)].join(' ').toLowerCase().includes(q));
  }

  function paintNav() {
    const cats = visibleCats();
    const focused = navEl.contains(document.activeElement) ? document.activeElement.dataset.cat : null;
    const buttons = [...navEl.querySelectorAll('.st-nav-item')];
    const sameItems = buttons.length === cats.length && buttons.every((button, i) => button.dataset.cat === cats[i].id);
    if (!cats.length) {
      if (!navEl.querySelector('.st-nav-empty')) {
        clear(navEl);
        navEl.append(h('p', { class: 'st-nav-empty' }, '没有匹配的设置。'));
      }
      if (focused) searchInput.focus({ preventScroll: true });
      return;
    }
    // A category change updates the existing button, so keyboard/pointer focus
    // stays on the user's category instead of being discarded with its DOM node.
    if (!sameItems) {
      clear(navEl);
      cats.forEach((c) => {
        navEl.append(h('button', {
          class: 'st-nav-item', type: 'button', dataset: { cat: c.id },
          // 指针点击在 WebKit 里不会自己给按钮焦点，选中态就与真实焦点脱钩；
          // 先聚焦再切页，导航的 :focus-within 与 active 才能同时成立。
          onclick: (e) => {
            e.currentTarget.focus({ preventScroll: true });
            S.cat = c.id; S.sysPage = 'home'; paintNav(); paintMain();
          },
        }, h('span', { class: 'st-nav-ic' }, glyph(c.id)), h('span', {}, c.name)));
      });
      navEl.append(h('div', { class: 'st-nav-foot' },
        h('span', {}, ''), h('span', {}, '内核托管')));
    }
    for (const button of navEl.querySelectorAll('.st-nav-item')) {
      const active = button.dataset.cat === S.cat;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    navEl.querySelector('.st-nav-foot > span').textContent = `NexlOS ${S.status && S.status.version ? S.status.version : ''}`;
    if (!sameItems && focused) {
      const next = [...navEl.querySelectorAll('.st-nav-item')].find(button => button.dataset.cat === focused);
      (next || searchInput).focus({ preventScroll: true });
    }
  }

  function paintMain(keepScroll) {
    // 改开关时保留滚动位置：Win10 的设置不会因为切一个开关就跳回页首。
    const y = keepScroll ? mainEl.scrollTop : 0;
    clear(mainEl);
    if (S.loading) {
      mainEl.append(h('div', { class: 'st-empty' }, h('span', { class: 'st-spinner' }), h('p', {}, '正在读取设置…')));
      return;
    }
    if (S.error) {
      mainEl.append(h('div', { class: 'st-empty' },
        glyph('info', 'big'), h('p', {}, S.error),
        h('button', { class: 'st-btn', type: 'button', onclick: load }, '重试')));
      return;
    }
    const page = {
      system: pageSystem, devices: pageDevices, network: pageNetwork, personal: pagePersonal,
      apps: pageApps, time: pageTime, gaming: pageGaming, privacy: pagePrivacy, update: pageUpdate,
    }[S.cat] || pageSystem;
    mainEl.append(page());
    mainEl.setAttribute('aria-busy', String(S.savingPrefs));
    if (S.savingPrefs) {
      // Controls must reflect the single in-flight write instead of dropping clicks.
      for (const control of mainEl.querySelectorAll('button, input, select')) control.disabled = true;
    }
    mainEl.scrollTop = y;
  }

  // ---------- 通用控件 ----------
  function pageHead(title, desc, extra) {
    return h('div', { class: 'st-page-head' },
      h('div', {}, h('h1', {}, title), h('p', {}, desc)),
      extra || null);
  }

  function card(kids, cls) {
    return h('section', { class: `st-card ${cls || ''}`.trim() }, kids);
  }

  function row(icon, title, desc, control) {
    return h('div', { class: 'st-row' },
      h('span', { class: 'st-row-ic' }, icon),
      h('div', { class: 'st-row-text' }, h('b', {}, title), desc ? h('span', {}, desc) : null),
      control || null);
  }

  function toggle(on, label, fn) {
    return h('button', {
      class: `st-switch${on ? ' on' : ''}`, type: 'button', role: 'switch',
      'aria-checked': on ? 'true' : 'false', 'aria-label': label,
      onclick: fn,
    }, h('i', { class: 'st-switch-knob' }));
  }

  function button(label, fn, cls) {
    return h('button', { class: `st-btn ${cls || ''}`.trim(), type: 'button', onclick: fn }, label);
  }

  function note(text) {
    return h('p', { class: 'st-note' }, text);
  }

  // ---------- 系统 ----------
  function pageSystem() {
    if (S.sysPage === 'about') return pageAbout();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(screen.width * dpr);
    const hgt = Math.round(screen.height * dpr);
    const tiles = [
      { icon: 'display', label: '显示', desc: `${w} × ${hgt} · ${Math.round(dpr * 100)}%` },
      { icon: 'sound', label: '声音', desc: '由本机设备控制' },
      { icon: 'bell', label: '通知', desc: '显示在桌面右下角' },
      { icon: 'power', label: '电源', desc: '由本机设备管理' },
    ];
    return h('section', { class: 'st-page' },
      pageHead('系统', '显示、声音、通知、电源'),
      h('div', { class: 'st-tiles' }, tiles.map((t) => h('div', { class: 'st-tile' },
        h('span', { class: 'st-tile-ic' }, glyph(t.icon)),
        h('b', {}, t.label),
        h('span', {}, t.desc)))),
      workspaceCard(),
      storageCard(),
      card([
        row(glyph('info'), '关于', '设备名称、版本、NexlOS 目录与命令目录', button('查看', () => { S.sysPage = 'about'; paintMain(); }, 'ghost')),
      ]));
  }

  // 宿主工作区是部署时切给 NexlOS 的那部分容器存储：记忆树、收件箱与库都落在里面。
  // 卡片只报告 workspace.info 的真实数字；配额可在本页直接改。
  function workspaceCard() {
    const w = S.workspace && S.workspace.detail;
    if (!w) return null;
    const quota = w.quotaBytes || 0;
    const used = w.usedBytes || 0;
    const pct = quota > 0 ? Math.max(0, Math.min(100, Math.round(used / quota * 100))) : 0;
    const quotaMB = Math.max(1, Math.round(quota / (1 << 20)));
    const input = h('input', {
      class: 'st-input st-quota-input', type: 'number', min: '16', step: '16',
      value: String(quotaMB), 'aria-label': '工作区配额（MB）',
    });
    const apply = button('调整配额', async () => {
      const mb = parseInt(input.value, 10);
      if (!mb || mb < 16) { toast('配额至少 16 MB'); return; }
      apply.disabled = true;
      try {
        await api('workspace.quota', { method: 'POST', fields: { mb } });
        toast(`工作区配额已改为 ${mb} MB`);
        await load();
      } catch (e) {
        toast(`配额没保存：${e.message}`);
      } finally {
        apply.disabled = false;
      }
    }, 'ghost');
    const health = (w.dirs || []).every((d) => d.exists) ? '目录完整' : '目录缺失';
    return card([
      h('div', { class: 'st-card-head' },
        h('span', { class: 'st-row-ic' }, glyph('storage')),
        h('div', {}, h('b', {}, `宿主工作区 · ${w.device || '本机'}`),
          h('span', {}, `${fmtBytes(used)} / ${fmtBytes(quota)} · ${(w.files || 0).toLocaleString(getLanguage())} 个文件`))),
      h('div', { class: 'st-usage-bar' }, h('i', {
        style: `width:${pct}%;background:${pct > 90 ? 'var(--st-danger, #e81123)' : 'var(--st-accent)'}`,
      })),
      row(glyph('open'), '工作区根目录', '部署时切给 NexlOS 的宿主目录，可直接在文件管理器里打开',
        h('span', { class: 'st-value mono' }, w.root || '')),
      row(glyph('storage'), '磁盘可用', `${w.platform || ''} · ${health}`,
        h('span', { class: 'st-value' }, w.diskError ? '无法读取' : fmtBytes(w.freeBytes || 0))),
      row(glyph('check'), '配额', '上传、写入与记忆树都按这条上限执行', input),
      row(glyph('memory'), '记忆树', `主题 ${(w.memory && w.memory.topics) || 0} · 观察 ${(w.memory && w.memory.observations) || 0} · 项目 ${(w.memory && w.memory.projects) || 0}`,
        h('div', { class: 'st-btn-row' },
          button('打开工作区', async () => {
            try { await api('workspace.reveal', { method: 'POST' }); } catch (e) { toast(`打不开：${e.message}`); }
          }, 'ghost'),
          button('修复目录', async () => {
            try { await api('workspace.repair', { method: 'POST' }); toast('工作区目录已补齐'); await load(); }
            catch (e) { toast(`修复失败：${e.message}`); }
          }, 'ghost'),
          apply)),
      note(`收件箱 ${w.inbox || 0} 个文件 · 发件箱 ${w.outbox || 0} 个文件。上传走 此电脑 → 上传，下载走 此电脑 → 下载。`),
    ]);
  }

  function storageCard() {
    const rows = (S.usage && S.usage.append) || [];
    const total = (S.usage && S.usage.detail && S.usage.detail.bytes) || 0;
    const files = (S.usage && S.usage.detail && S.usage.detail.files) || 0;
    const bar = h('div', { class: 'st-usage-bar' });
    rows.forEach((r, i) => {
      if (!r.bytes || !total) return;
      bar.append(h('i', {
        style: `width:${Math.max(2, Math.round(r.bytes / total * 100))}%;background:${USAGE_COLORS[i % USAGE_COLORS.length]}`,
      }));
    });
    if (!total) bar.append(h('i', { class: 'seg-empty', style: 'width:100%' }));
    return card([
      h('div', { class: 'st-card-head' }, h('span', { class: 'st-row-ic' }, glyph('storage')), h('div', {}, h('b', {}, '存储'), h('span', {}, `NexlOS 占用 ${fmtBytes(total)} · ${files.toLocaleString(getLanguage())} 个文件`))),
      bar,
      h('div', { class: 'st-usage-list' }, rows.map((r, i) => h('div', { class: 'st-usage-row' },
        h('span', { class: 'st-dot', style: `background:${USAGE_COLORS[i % USAGE_COLORS.length]}` }),
        h('b', {}, r.name),
        h('span', {}, `${r.files.toLocaleString(getLanguage())} 个文件`),
        h('i', {}, fmtBytes(r.bytes))))),
      note(S.usage && S.usage.detail ? S.usage.detail.home : 'NexlOS 目录'),
    ]);
  }

  function pageAbout() {
    const d = S.status || {};
    const nameInput = h('input', {
      class: 'st-input', value: S.prefs.name, maxlength: '24', autocomplete: 'off',
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); saveName(nameInput.value); } },
      onblur: () => saveName(nameInput.value),
    });
    return h('section', { class: 'st-page' },
      h('button', { class: 'st-back', type: 'button', onclick: () => { S.sysPage = 'home'; paintMain(); } }, '‹ 系统'),
      pageHead('关于', `${S.prefs.name} · NexlOS ${d.version || ''}`),
      card([
        row(glyph('display'), '设备名称', '显示在开始菜单与账户卡片上', nameInput),
        row(glyph('info'), '版本', 'NexlOS 内核与运行时',
          h('span', { class: 'st-value' }, `${d.version || '—'} · ${d.runtime || ''}`)),
        row(glyph('storage'), 'NexlOS 目录', '所有空间、应用与库都在这棵目录树里',
          h('span', { class: 'st-value mono' }, d.home || '')),
        row(glyph('system'), '平台', '静态二进制在哪个平台上运行',
          h('span', { class: 'st-value' }, d.platform || '')),
        row(glyph('info'), '在 GitHub 上点星标', '打开项目主页',
          button('打开', async () => {
            if (!(await starOpen())) { toast('打不开项目主页'); return; }
            // 外壳据此收起桌面右键的常驻入口；设置页的入口仍然保留。
            post('nexlos.settings', { patch: { starOpened: true } });
          }, 'ghost')),
        row(glyph('check'), '命令目录', `已注册 ${d.commands || 0} 条命令；维护者从这里进系统面板`,
          button('打开', () => post('nexlos.openSystem'), 'ghost')),
      ]),
      note('这台电脑是干净安装：空间、应用配置与库都在 NexlOS 目录里，不读取本机其他项目。'));
  }

  function saveName(raw) {
    const name = String(raw || '').trim();
    if (!name || name === S.prefs.name) return;
    if (name.length > 24) { toast('名字最多 24 个字'); return; }
    setPref({ name });
  }

  // ---------- 设备 ----------
  function pageDevices() {
    return h('section', { class: 'st-page' },
      pageHead('设备', '蓝牙、打印机、鼠标、显示'),
      card([
        row(glyph('devices'), '蓝牙和其他设备', '此设备由浏览器提供输入，没有可配对的蓝牙适配器', h('span', { class: 'st-value' }, '未检测到')),
        row(glyph('display'), '显示', `${screen.width} × ${screen.height} · 缩放 ${Math.round((window.devicePixelRatio || 1) * 100)}%`, h('span', { class: 'st-value' }, '已连接')),
        row(glyph('devices'), '鼠标、键盘和笔', '指针与键盘事件由本机浏览器转发到 NexlOS', h('span', { class: 'st-value' }, '本机')),
        row(glyph('storage'), '打印机和扫描仪', 'NexlOS 不直接管理打印队列', h('span', { class: 'st-value' }, '无')),
      ]),
      note('设备页只报告真实可见的状态；没有的硬件不会伪造一个图标。'));
  }

  // ---------- 网络 ----------
  function pageNetwork() {
    const online = navigator.onLine;
    return h('section', { class: 'st-page' },
      pageHead('网络和 Internet', '状态、以太网、代理'),
      card([
        h('div', { class: 'st-net-status' },
          h('span', { class: `st-net-dot${online ? ' on' : ''}` }),
          h('div', {}, h('b', {}, online ? '已连接到 NexlOS 本机回环' : '离线'),
            h('span', {}, online ? '浏览器网络可用；应用通过本机 HTTP 服务访问内核' : '浏览器报告当前离线'))),
        row(glyph('network'), '以太网', `地址 ${location.host || '本机'}`, h('span', { class: 'st-value ok' }, online ? '已连接' : '断开')),
        row(glyph('info'), 'IPv4 地址', 'NexlOS 默认只监听本机回环', h('span', { class: 'st-value mono' }, '127.0.0.1')),
        row(glyph('privacy'), '代理', '不经过任何代理，数据留在本机', h('span', { class: 'st-value' }, '关闭')),
      ]),
      card([
        row(glyph('apps'), '应用联网', `${S.apps.length} 个应用共用同一个本机内核`, button('查看应用', () => { S.cat = 'apps'; paintNav(); paintMain(); }, 'ghost')),
      ]),
      note('NexlOS 是单机系统：没有云端账户，也没有远程同步。'));
  }

  // ---------- 个性化 ----------
  function pagePersonal() {
    const retro = S.prefs.appearance === 'win98';
    const field = wallpaperField(S.prefs.appearance);
    const walls = retro ? RETRO_BACKGROUNDS : WALLS;
    return h('section', { class: 'st-page' },
      pageHead('个性化', '主题、背景与配色，让桌面成为你的创作空间'),
      h('h2', { class: 'st-h2' }, '选择主题'),
      h('div', { class: 'st-appearance-grid', role: 'group', 'aria-label': '选择主题' },
        appearanceCard('current', 'NEXL现代主题', '自由选择深浅配色与强调色', 'NEXL'),
        appearanceCard('win98', 'Windos2026', '经典桌面、立体边框与固定配色', 'Windos2026')),
      note(retro
        ? 'Windos2026 保留经典的固定配色。你可以更换背景，也可以上传自己的图片。'
        : '选择深浅配色与强调色，或换一张喜欢的背景。每套主题会记住自己的背景。'),
      retro ? typographyControls() : null,
      h('h2', { class: 'st-h2' }, retro ? 'Windos2026 背景' : '现代主题背景'),
      h('div', { class: 'st-wall-grid' },
        walls.map((w) => h('button', {
          class: `st-wall${(S.prefs[field] === w.id || retro && S.prefs[field] === 'bliss' && w.id === 'default') ? ' active' : ''}`, type: 'button',
          onclick: () => setPref({ [field]: w.id }),
        }, h('span', { class: `st-wall-art ${w.cls || ''}`, style: w.color ? `background:${w.color}` : w.image ? `background-image:url(${w.image});background-size:cover;background-position:center` : null }), h('span', { class: 'st-wall-name' }, w.name, (S.prefs[field] === w.id || retro && S.prefs[field] === 'bliss' && w.id === 'default') ? h('i', {}, '当前') : null))),
        h('button', {
          class: `st-wall${S.prefs[field] === 'custom' ? ' active' : ''}`, type: 'button',
          onclick: () => wallInput.click(),
        }, h('span', { class: 'st-wall-art wall-custom' }, customWallUrl() ? h('span', { class: 'st-wall-custom-img', style: `background-image:url(${customWallUrl()})` }) : h('span', { class: 'st-wall-plus' }, '+')),
          h('span', { class: 'st-wall-name' }, '上传背景图片', S.prefs[field] === 'custom' ? h('i', {}, '当前') : null))),

      h('h2', { class: 'st-h2' }, '桌面伴侣'),
      note('上传 .nexloslife、.zip 或单文件 .html 生命包。它不参与对话，只陪着你：拖一份文档或图片到它身上，它当场读给你看。文件只在本机解析，不上传。'),
      companionSection(),

      !retro ? [h('h2', { class: 'st-h2' }, '强调色'),
      card([
        h('div', { class: 'st-card-head' }, h('span', { class: 'st-row-ic' }, glyph('paint')), h('div', {}, h('b', {}, '强调色'), h('span', {}, '标题栏、开关、选中项都会跟着变'))),
        h('div', { class: 'st-swatches' },
          ACCENTS.map((c) => h('button', {
            class: `st-swatch${S.prefs.accent.toLowerCase() === c ? ' active' : ''}`, type: 'button',
            style: `background:${c}`, title: c, 'aria-label': `强调色 ${c}`,
            onclick: () => setPref({ accent: c }),
          }, S.prefs.accent.toLowerCase() === c ? glyph('check') : null)),
          h('label', { class: 'st-swatch-custom', title: '自定义颜色' },
            h('input', { type: 'color', value: S.prefs.accent, 'aria-label': '自定义强调色', onchange: (e) => setPref({ accent: e.target.value }) }),
            '＋')),
        h('div', { class: 'st-preview' },
          h('span', { class: 'st-preview-bar' }), h('span', { class: 'st-preview-line' }), h('span', { class: 'st-preview-line short' })),
      ]),

      h('h2', { class: 'st-h2' }, '深浅配色主题'),
      h('div', { class: 'st-theme-grid' },
        themeCard('light', '浅色', '任务栏、开始菜单与窗口用浅色'),
        themeCard('dark', '深色', '外壳与系统应用切到深色'))] : null,
      card([
        row(glyph('bell'), '减少动画', '窗口与开始菜单改用更短的过渡',
          toggle(S.prefs.reduceMotion, '减少动画', () => setPref({ reduceMotion: !S.prefs.reduceMotion }))),
      ]),
      note('主题会立即作用于桌面外壳；第三方应用保留自己的配色。'));
  }

  function typographyControls() {
    const font = h('select', {
      id: 'retro-font', class: 'st-input st-typography-select', 'aria-label': '界面字体', disabled: S.savingPrefs,
      onchange: (e) => setPref({ retroFont: e.target.value }),
    }, RETRO_FONTS.map((item) => h('option', { value: item.id, selected: item.id === S.prefs.retroFont }, item.name)));
    const size = h('select', {
      id: 'retro-font-size', class: 'st-input st-typography-select', 'aria-label': '界面字号', disabled: S.savingPrefs,
      onchange: (e) => setPref({ retroFontSize: Number(e.target.value) }),
    }, RETRO_FONT_SIZES.map((value) => h('option', { value, selected: value === S.prefs.retroFontSize }, `${value} px`)));
    return h('section', { class: 'st-typography', 'aria-label': '字体与字号' },
      h('h2', { class: 'st-h2' }, '字体与字号'),
      card([
        row(glyph('paint'), '界面字体', '只调整 Windos2026；第三方应用使用自己的字体', font),
        row(glyph('display'), '界面字号', '12–24 像素，保存后立即应用', size),
        h('div', { class: 'st-typography-preview', 'aria-label': '字体预览' },
          h('span', {}, '字体预览'), h('p', {}, '创作从这里开始 · NexlOS 2026'), h('p', {}, 'The quick brown fox · 0123456789')),
        h('div', { class: 'st-typography-actions' }, button('恢复字体默认值', () => setPref({ retroFont: 'pixel', retroFontSize: 12 }), 'ghost')),
        h('div', { class: 'st-typography-actions' }, button('重播开机画面与音效', () => post('nexlos.startup'), 'ghost')),
        h('div', { class: 'st-typography-actions' }, button('声音设置', () => post('nexlos.sound.settings'), 'ghost')),
      ]));
  }

  function appearanceCard(id, name, desc, badge) {
    const active = S.prefs.appearance === id;
    return h('button', {
      class: `st-appearance-card ${id}${active ? ' active' : ''}`, type: 'button',
      'aria-label': `${name} 外观`, 'aria-pressed': String(active), disabled: S.savingPrefs,
      onclick: () => setPref({ appearance: id }),
    }, h('span', { class: 'st-appearance-art', 'aria-hidden': 'true' },
      h('span', { class: 'st-appearance-window' },
        h('span', { class: 'st-appearance-title' }, 'NexlOS'),
        h('span', { class: 'st-appearance-content' })),
      h('span', { class: 'st-appearance-taskbar', 'data-i18n-content': '开始' })),
    h('span', { class: 'st-appearance-copy' }, h('b', {}, name), h('span', {}, desc)),
    h('span', { class: 'st-appearance-badge' }, active ? '使用中' : badge));
  }

  // ---------- 桌面伴侣 ----------
  // 生命包与主题、壁纸放在同一页：用户换的是“桌面长什么样”，
  // 不需要理解应用包、签名或内核路由。
  function companionSection() {
    const active = S.prefs.companion || '';
    const cards = S.lives.map((life) => companionCard(life, active));
    cards.push(h('label', {
      class: `st-companion st-companion-add${S.companionBusy ? ' is-busy' : ''}`,
      title: '上传 .nexloslife、.zip 或单文件 .html',
    },
      h('input', {
        type: 'file', accept: '.nexloslife,.zip,.html,.htm,application/zip,text/html',
        style: 'display:none', disabled: S.companionBusy,
        onchange: (e) => {
          const file = e.target.files && e.target.files[0];
          e.target.value = '';
          if (file) installCompanion(file);
        },
      }),
      h('span', { class: 'st-companion-plus' }, S.companionBusy ? '…' : '+'),
      h('span', { class: 'st-companion-addtext' }, S.companionBusy ? (S.companionStatus || '正在安装…') : '上传生命包')));
    if (!S.lives.length) {
      return h('div', { class: 'st-companion-empty' },
        h('div', { class: 'st-companion-grid' }, cards),
        h('p', { class: 'st-note' }, '还没有伴侣。用 WorkBuddy 的「NEXL 伴侣工厂」把喜欢的角色做成生命包，再从这里上传。'));
    }
    const sizeRow = row(glyph('display'), '伴侣大小',
      `${S.prefs.companionSize || 100}% · ${S.prefs.companionMode === 'notch' ? '头像会跟着缩放' : '直接拖动角色可换位置'}`,
      h('div', { class: 'st-companion-size' },
        h('input', {
          type: 'range', min: 60, max: 160, step: 5,
          value: String(S.prefs.companionSize || 100),
          'aria-label': '伴侣大小', disabled: S.savingPrefs,
          onchange: (e) => setPref({ companionSize: Number(e.target.value) }),
        }),
        button('重置位置', () => post('nexlos.companion.reset'), 'ghost')));
    // 窄屏时让标题与控件各占一行，否则「伴侣大小」会被挤成竖排。
    sizeRow.classList.add('st-row-companion-size');
    const mode = S.prefs.companionMode === 'notch' ? 'notch' : 'desktop';
    const modeRow = row(glyph('display'), '形态',
      mode === 'notch' ? '贴在屏幕顶部中央，像刘海一样；鼠标靠近展开面板' : '可拖动的桌面立绘，拖到哪就待在哪',
      h('div', { class: 'st-companion-mode', role: 'group', 'aria-label': '伴侣形态' },
        h('button', {
          class: 'st-mode-btn' + (mode === 'desktop' ? ' active' : ''), type: 'button',
          'aria-pressed': String(mode === 'desktop'), disabled: S.savingPrefs,
          onclick: () => setPref({ companionMode: 'desktop' }),
        }, '桌面'),
        h('button', {
          class: 'st-mode-btn' + (mode === 'notch' ? ' active' : ''), type: 'button',
          'aria-pressed': String(mode === 'notch'), disabled: S.savingPrefs,
          onclick: () => setPref({ companionMode: 'notch' }),
        }, '刘海')));
    modeRow.classList.add('st-row-companion-mode');
    return [
      h('div', { class: 'st-companion-grid' }, cards),
      card([
        sizeRow,
        modeRow,
        row(glyph('personal'), '显示在桌面上', '收起后仍保留安装与陪伴记录',
          toggle(!S.prefs.companionHidden && !!S.prefs.companion, '显示桌面伴侣',
            () => setPref({ companionHidden: !S.prefs.companionHidden }))),
      ]),
    ];
  }

  function companionCard(life, activeId) {
    const using = life.id === activeId;
    const shown = using && !S.prefs.companionHidden;
    const confirming = S.companionConfirm === life.id;
    const kind = life.renderer === 'html' ? 'HTML' : life.renderer === 'frames' ? '帧动画' : '立绘';
    return h('div', { class: `st-companion${shown ? ' active' : ''}` },
      h('span', { class: 'st-companion-art' },
        life.thumbnail
          ? h('img', { src: life.thumbnail, alt: '', loading: 'lazy' })
          : h('span', { class: 'st-companion-fallback', 'aria-hidden': 'true' }, '◍')),
      h('div', { class: 'st-companion-meta' },
        h('b', {}, life.name || life.id, h('i', {}, `v${life.version || '1.0.0'}`)),
        h('span', {}, `${kind} · ${life.width || 0}×${life.height || 0}`),
        life.description ? h('p', {}, life.description) : null,
        confirming ? h('p', { class: 'st-companion-warn' }, '卸载只删生命包，陪伴记录默认保留。') : null),
      h('div', { class: 'st-companion-actions' },
        using
          ? button(S.prefs.companionHidden ? '显示' : '收起', () => setPref({ companionHidden: !S.prefs.companionHidden }), 'ghost')
          : button('启用', () => setPref({ companion: life.id, companionHidden: false })),
        confirming
          ? [
            button('确认卸载', () => removeCompanion(life.id, true), 'ghost danger'),
            button('取消', () => { S.companionConfirm = ''; paintMain(true); }, 'ghost'),
          ]
          : button('卸载', () => removeCompanion(life.id), 'ghost danger')));
  }

  async function installCompanion(file) {
    if (S.companionBusy) return;
    S.companionBusy = true;
    S.companionStatus = `正在上传 ${file.name}…`;
    paintMain(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch('/u?path=inbox', {
        method: 'POST', headers: { 'X-NEXLOS-Upload': '1' }, body: fd,
      });
      const data = await res.json().catch(() => ({ ok: false, error: `bad response ${res.status}` }));
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
      const path = data.detail && data.detail.path;
      if (!path) throw new Error('上传没有返回路径');
      S.companionStatus = '正在校验并安装…';
      paintMain(true);
      const installed = await api('companion.install', { method: 'POST', fields: { path } });
      const detail = installed.detail || {};
      const id = detail.installed;
      if (!id) throw new Error('安装没有返回伴侣 id');
      // 重装同一个包时 id 不变，外壳不会重载 iframe：先收起再启用，强制换一份画面。
      if (S.prefs.companion === id) await setPref({ companion: '', companionHidden: true });
      await setPref({ companion: id, companionHidden: false });
      toast(`已启用「${detail.name || id}」`);
    } catch (e) {
      toast(`伴侣没装上：${e.message}`);
    } finally {
      S.companionBusy = false;
      S.companionStatus = '';
      load();
    }
  }

  async function removeCompanion(id, confirmed) {
    if (!confirmed) {
      S.companionConfirm = id;
      paintMain(true);
      return;
    }
    S.companionConfirm = '';
    try {
      await api('companion.remove', { method: 'POST', fields: { id } });
      if (S.prefs.companion === id) await setPref({ companion: '', companionHidden: false });
      toast('已卸载伴侣');
      load();
    } catch (e) {
      toast(`没卸载：${e.message}`);
      paintMain(true);
    }
  }

  function customWallUrl() {
    try { return localStorage.getItem(wallpaperKey(S.prefs.appearance)) || ''; } catch (e) { return ''; }
  }

  // 压到 1920 宽再存，和外壳自己的换壁纸路径保持同一份数据。
  function pickCustomWallpaper(file) {
    const appearance = S.prefs.appearance;
    const key = wallpaperKey(appearance);
    const field = wallpaperField(appearance);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const scale = Math.min(1, 1920 / Math.max(1, img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      let previous = null;
      try {
        const data = canvas.toDataURL('image/jpeg', 0.82);
        previous = localStorage.getItem(key);
        localStorage.setItem(key, data);
        if (await setPref({ [field]: 'custom' })) toast('壁纸已更换');
        else {
          if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key, previous);
          paintMain(true);
        }
      } catch (e) {
        try { if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key, previous); } catch (restoreError) { /* Storage may be unavailable. */ }
        toast('图片太大，未能保存');
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('读不到这张图片'); };
    img.src = url;
  }

  function themeCard(id, name, desc) {
    const active = S.prefs.theme === id;
    return h('button', {
      class: `st-theme${active ? ' active' : ''}`, type: 'button',
      onclick: () => setPref({ theme: id }),
    },
      h('span', { class: `st-theme-art ${id}` },
        h('span', { class: 'st-theme-win' }, h('span', { class: 'st-theme-bar' }), h('span', { class: 'st-theme-line' }), h('span', { class: 'st-theme-line short' }))),
      h('b', {}, name), h('span', {}, desc), active ? h('i', { class: 'st-theme-check' }, glyph('check')) : null);
  }

  // ---------- 应用 ----------
  function removeApp(a, confirmed) {
    // 用行内二次确认代替原生 confirm：WebView 与嵌入窗口里不会被拦截，操作也可回看。
    if (!confirmed) {
      S.confirming = a.id;
      paintMain();
      return;
    }
    const wipe = !!S.purge[a.id];
    S.confirming = '';
    S.removing = a.id;
    paintMain();
    api('app.remove', { method: 'POST', fields: { id: a.id, purge: wipe } })
      .then(() => { S.purge[a.id] = false; load(); })
      .catch((e) => { S.removing = ''; S.error = e.message; paintMain(); });
  }

  function pageApps() {
    return h('section', { class: 'st-page' },
      pageHead('应用', '应用和功能、默认应用'),
      card([
        h('div', { class: 'st-card-head' }, h('span', { class: 'st-row-ic' }, glyph('apps')), h('div', {}, h('b', {}, `应用和功能 · ${S.apps.length}`), h('span', {}, '内置应用随二进制发布；上传的应用可在这里卸载'))),
        h('div', { class: 'st-app-list' }, S.apps.map((a) => h('div', { class: 'st-app' },
          h('span', { class: 'st-app-ic' }, appIcon(a.id)),
          h('div', { class: 'st-app-meta' }, h('b', {}, a.name), h('span', {}, `${a.description || ''} · ${a.category || '应用'}`)),
          h('span', { class: 'st-app-kind' }, a.kind === 'internal' ? '内置' : a.kind === 'web' ? 'Web' : a.version ? `上传 · ${a.version}` : '本机'),
          a.kind === 'bundle'
            ? h('div', { class: `st-app-actions${S.confirming === a.id ? ' is-confirming' : ''}` },
              h('label', { class: 'st-app-purge', title: '同时删除 appdata 里的书、笔记与设置' },
                h('input', {
                  type: 'checkbox',
                  checked: !!S.purge[a.id],
                  onchange: (e) => { S.purge[a.id] = e.target.checked; },
                }),
                '删数据'),
              S.confirming === a.id
                ? [
                  button('确认卸载', () => removeApp(a, true), 'ghost danger'),
                  button('取消', () => { S.confirming = ''; paintMain(); }, 'ghost'),
                ]
                : button(S.removing === a.id ? '卸载中…' : '卸载', () => removeApp(a), 'ghost danger'))
            : button('打开', () => post('nexlos.open', { app: a.id }), 'ghost')))),
      ]),
      card([
        row(glyph('open'), '默认应用', 'Web 浏览器、邮件、地图由本机浏览器提供', h('span', { class: 'st-value' }, '本机')),
        row(glyph('info'), '打开系统面板', '命令目录与内核状态', button('打开', () => post('nexlos.openSystem'), 'ghost')),
      ]),
      note('上传入口在「软件安装」；卸载只针对签名包，内置应用不可删除。'));
  }

  // ---------- 时间和语言 ----------
  function pageTime() {
    let zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { zone = ''; }
    const clock = h('span', { class: 'st-clock' }, timeText(S.prefs));
    clockEl = clock;
    // 系统语言与已保存语言不同时，给一条常驻建议：一次提示可能被错过，这里永远点得到。
    const detected = systemLanguage();
    const current = S.prefs.language || 'en';
    const suggested = detected && detected !== current ? LANGUAGES.find((l) => l.code === detected) : null;
    return h('section', { class: 'st-page' },
      pageHead('时间和语言', '日期、时间、区域'),
      card([
        row(glyph('time'), '当前时间', zone ? `时区 ${zone}` : '跟随本机时钟', clock),
        row(glyph('time'), '24 小时制', '任务栏与设置里的时间立即切换',
          toggle(S.prefs.clock24, '24 小时制', () => setPref({ clock24: !S.prefs.clock24 }))),
        row(glyph('info'), '时区', '由浏览器从本机系统读取', h('span', { class: 'st-value' }, zone || '本机')),
        row(glyph('apps'), '界面语言', '整台系统的显示语言', languageSelect()),
        suggested
          ? row(glyph('apps'), '系统语言', `检测到 ${suggested.label}`,
            button('使用', () => setPref({ language: suggested.code }), 'ghost'))
          : null,
      ]),
      note('NexlOS 没有内置 NTP 客户端，时间与区域直接跟随这台设备。'));
  }

  // 原生名称始终以本语言显示，切换后一眼能找到自己的语言。
  // 只列词条完整的语言：缺词条的语言会在界面上留下半截英文。
  function languageSelect() {
    const select = h('select', {
      class: 'st-select', 'aria-label': '界面语言',
      onchange: (e) => setPref({ language: e.target.value }),
    }, availableLanguages().map((l) => h('option', { value: l.code }, l.label)));
    select.value = S.prefs.language || 'en';
    return select;
  }

  // ---------- 游戏 ----------
  function pageGaming() {
    return h('section', { class: 'st-page' },
      pageHead('游戏', '游戏栏、游戏模式、捕获'),
      card([
        row(glyph('gaming'), 'Xbox 游戏栏', 'NexlOS 不注入系统级覆盖层', h('span', { class: 'st-value' }, '不可用')),
        row(glyph('gaming'), '游戏模式', '窗口与动画已经是轻量路径', h('span', { class: 'st-value' }, '始终开启')),
        row(glyph('display'), '捕获', '需要录屏时使用本机浏览器或系统工具', h('span', { class: 'st-value' }, '外部')),
      ]),
      note('这一页保留 Win10 的分类位置，但只写 NexlOS 真实具备的能力。'));
  }

  // ---------- 隐私 ----------
  function pagePrivacy() {
    return h('section', { class: 'st-page' },
      pageHead('隐私', '位置、相机、麦克风、诊断'),
      card([
        row(glyph('privacy'), '位置', 'NexlOS 不请求定位权限', h('span', { class: 'st-value' }, '关闭')),
        row(glyph('privacy'), '相机', '应用无法访问摄像头', h('span', { class: 'st-value' }, '关闭')),
        row(glyph('privacy'), '麦克风', '应用无法访问麦克风', h('span', { class: 'st-value' }, '关闭')),
      ]),
      card([
        row(glyph('info'), '诊断数据', '只在本机记录内核命令耗时', h('span', { class: 'st-value' }, '基本')),
        row(glyph('storage'), '后台应用', '关闭窗口即释放 iframe，不在后台常驻', h('span', { class: 'st-value' }, '由桌面管理')),
      ]),
      note('NexlOS 不向任何服务器上传数据。'));
  }

  // ---------- 更新和安全 ----------
  function pageUpdate() {
    const d = S.status || {};
    return h('section', { class: 'st-page' },
      pageHead('更新和安全', '更新、恢复、开发者'),
      card([
        h('div', { class: 'st-card-head' }, h('span', { class: 'st-row-ic' }, glyph('update')),
          h('div', {}, h('b', {}, 'NexlOS 更新'), h('span', {}, `当前版本 ${d.version || '—'} · 静态二进制`))),
        h('div', { class: 'st-update' },
          h('span', { class: `st-update-dot${S.updated ? ' ok' : ''}` }),
          h('div', {}, h('b', {}, S.checked ? '已是最新版本' : '你使用的是最新版本'),
            h('span', {}, S.checked ? `上次检查：刚刚 · ${d.version || ''}` : 'NexlOS 以单个二进制发布，替换文件即完成更新')),
          button(S.checking ? '检查中…' : '检查更新', checkUpdate, 'ghost')),
      ]),
      card([
        row(glyph('paint'), '恢复默认外观', '主题、强调色、壁纸与时钟制式回到初始值', button('恢复', resetAppearance, 'ghost')),
        row(glyph('storage'), '备份', '把 NexlOS 目录整体复制走就是完整备份',
          h('span', { class: 'st-value mono' }, d.home || '')),
      ]),
      card([
        row(glyph('system'), '面向维护者', '命令目录、运行状态与空间清单', button('打开系统面板', () => post('nexlos.openSystem'), 'ghost')),
      ]),
      note('更新与恢复都不会删除空间、应用与库。'));
  }

  async function checkUpdate() {
    if (S.checking) return;
    S.checking = true;
    paintMain();
    try {
      const r = await api('system.status');
      S.status = r.detail || S.status;
      S.checked = true;
      S.updated = true;
    } catch (e) {
      toast(e.message);
    } finally {
      S.checking = false;
      paintMain();
      paintNav();
    }
  }

  async function resetAppearance() {
    const saved = await setPref({ appearance: 'current', retroWallpaper: 'default', retroFont: 'pixel', retroFontSize: 12, theme: 'light', accent: '#0078d4', wallpaper: 'snowfog', clock24: false, reduceMotion: false });
    if (saved) toast('外观已恢复默认');
  }

  // ---------- 与外壳通信 ----------
  function post(type, extra) {
    try {
      window.parent.postMessage(Object.assign({ type }, extra || {}), location.origin);
    } catch (e) { /* 独立标签页里没有外壳 */ }
  }

  function toast(msg) {
    let t = frame.querySelector('.st-toast');
    if (!t) { t = h('div', { class: 'st-toast' }); frame.append(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // 时间页每秒走一格；离开时间页就停，避免空闲时白耗一帧。
  let clockEl = null;
  const timer = setInterval(() => {
    if (!clockEl || S.cat !== 'time') return;
    clockEl.textContent = timeText(S.prefs);
  }, 1000);

  paintNav();
  paintMain();
  paintAccount();
  load();

  return {
    destroy() { clearInterval(timer); window.removeEventListener('message', onPrefsMessage); },
  };
}
