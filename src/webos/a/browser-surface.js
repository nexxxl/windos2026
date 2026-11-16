// 浏览器（原生 Surface 模式）：页面由系统 WKWebView 子视图直接合成。
//
// 这条路径不搬运像素：滚动、视频、输入法、右键菜单都由 WebKit 处理。
// 窗口外壳、标签页、书签、历史、下载、扩展管理留在 WebOS 里，
// 需要盖住页面时先收起原生视图（面板/菜单/开始菜单）。
//
// 兼容 Chrome 72：不用可选链、空值合并、flex gap。
import { h, clear } from './can.js';

const HOME = 'https://cn.bing.com/?mkt=zh-CN';
// 新标签页不加载远端首页：留一块干净的空白舞台，收藏入口都在书签栏。
const START = 'nexlos://start';
const MAX_LIVE = 6;       // 没拿到内核预算时的兜底上限（实际按物理内存算）
const POLL_MS = 400;      // surface.status 轮询间隔
const OV_POLL_MS = 120;   // 浮层打开时降到 120ms：弹层交互要走这条通道
const BEAT_MS = 500;      // 页面报告器心跳间隔
const FPS_MS = 5000;      // fps 采样间隔（每次只采 1 秒，采完即停）
const PLACE_GAP = 33;     // 空闲时 place 上限 30Hz：静止窗口不必每帧都发一次
const PLACE_GAP_MOVE = 8; // 窗口/弹层正在移动时放到 ~125Hz：拖表头时页面要跟手
const SLEEP_IDLE = 30 * 60 * 1000;  // 默认 30 分钟空闲才休眠标签
const SLEEP_WARN = 5 * 60 * 1000;   // 系统内存警告时收紧到 5 分钟
const OV_Z = 2;           // 弹层视图的层级：永远在页面（z=1）之上
// 弹层视图比卡片大一圈留投影，和 overlay.css 的 body padding 保持一致。
const OV_PAD = { left: 3, top: 3, right: 12, bottom: 16 };

const K = {
  bookmarks: 'nexlos.browser.bookmarks.v1',
  spaces: 'nexlos.browser.spaces.v1',
  history: 'nexlos.browser.history.v1',
  downloads: 'nexlos.browser.downloads.v1',
  settings: 'nexlos.browser.settings.v1',
};

// 空间配色：新建空间按顺序取色，和标签栏里的圆点一致。
const SPACE_COLORS = ['#d4644f', '#4f7fd4', '#3f9a68', '#c08a3e', '#7d63c9', '#3f9aa8'];

function normalizeSpace(raw, i) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const name = typeof s.name === 'string' ? s.name.trim().slice(0, 24) : '';
  return {
    id: typeof s.id === 'string' && s.id ? s.id : 'space-' + (i + 1),
    name: name || '折叠空间 ' + (i + 1),
    color: /^#[0-9a-f]{3,8}$/i.test(s.color || '') ? s.color : SPACE_COLORS[i % SPACE_COLORS.length],
    bookmarks: Array.isArray(s.bookmarks) ? s.bookmarks.filter((b) => b && b.url) : [],
  };
}

// 旧版只有一份全局书签：首次升级时并进「默认空间」，之后每个空间各自一份。
function loadSpaces() {
  const saved = readJSON(K.spaces, null);
  const list = saved && Array.isArray(saved.list) ? saved.list.map(normalizeSpace) : [];
  if (list.length) {
    const current = list.some((s) => s.id === saved.current) ? saved.current : list[0].id;
    return { list, current };
  }
  const legacy = readJSON(K.bookmarks, []);
  const first = normalizeSpace({ id: 'space-1', name: '默认空间', bookmarks: legacy }, 0);
  return { list: [first], current: first.id };
}

const ENGINES = {
  bing: { name: '必应', url: 'https://www.bing.com/search?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
};

const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

// 注入页面：标题 / 地址心跳，外加按需的 rAF 帧率探针。
// 常驻 rAF 只为算 fps 会让每个空闲标签也跑 60Hz，改成 1 秒窗口按需采样：
// 外壳每 5 秒对当前可见标签调一次 window.__nexlosFps(1000)，采完即停。
const REPORTER = [
  '(function(){',
  'if(window.__nexlosReporter){return;}window.__nexlosReporter=1;',
  'function beat(){try{',
  'window.__nexlosSurface({type:"beat",title:document.title||"",url:location.href,',
  'vis:document.visibilityState||"",ready:document.readyState,t:Date.now(),',
  'audible:mk.a,media:mk.c,pip:mk.p,dirty:mk.d,loadMs:window.__nexlosLoadMs||0,dcl:window.__nexlosDcl||0,',
  'probe:window.__nexlosProbe||0});',
  '}catch(e){}}',
  // 保活信号：正在出声 / 摄像头麦克风 / 画中画 / 有未提交输入。
  // 这些状态的标签不允许被休眠，否则用户正在用的东西会被回收掉。
  'var mk={a:0,c:0,p:0,d:0};',
  'function scan(){try{',
  'mk.a=0;',
  'var vs=document.getElementsByTagName("video"),as=document.getElementsByTagName("audio"),i;',
  'for(i=0;i<vs.length;i++){if(!vs[i].paused&&!vs[i].muted&&vs[i].volume>0){mk.a=1;}}',
  'for(i=0;i<as.length;i++){if(!as[i].paused&&!as[i].muted&&as[i].volume>0){mk.a=1;}}',
  'mk.p=document.pictureInPictureElement?1:0;',
  'mk.c=window.__nexlosLiveMedia?1:0;',
  '}catch(e){}}',
  'try{if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&!navigator.mediaDevices.__nexlos){',
  'var g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);',
  'navigator.mediaDevices.getUserMedia=function(c){window.__nexlosLiveMedia=1;return g(c);};',
  'navigator.mediaDevices.__nexlos=1;}}catch(e){}',
  'document.addEventListener("input",function(e){try{var t=e.target;',
  'if(t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.isContentEditable)&&t.value){mk.d=Date.now();}}catch(e){}},true);',
  'setInterval(scan,2000);',
  'setInterval(beat,' + BEAT_MS + ');',
  'addEventListener("load",beat);',
  'document.addEventListener("visibilitychange",beat);',
  'window.__nexlosFps=function(ms){',
  'var span=(ms>0)?ms:1000;var start=0;var frames=0;var closed=false;',
  'function tick(ts){if(closed){return;}if(!start){start=ts;}frames++;',
  'if(ts-start<span){requestAnimationFrame(tick);return;}',
  'closed=true;var spent=ts-start;',
  'try{window.__nexlosSurface({type:"fps",fps:Math.round(frames*1000/Math.max(1,spent)),ms:Math.round(spent)});}catch(e){}',
  '}',
  'requestAnimationFrame(tick);',
  '};',
  'function markLoad(){try{if(!window.__nexlosLoadMs&&document.readyState==="complete"){',
  'window.__nexlosLoadMs=Math.round(performance.now());',
  'var t=performance.timing;',
  'window.__nexlosDcl=Math.round(t.domContentLoadedEventEnd-t.navigationStart);',
  '}}catch(e){}}',
  'addEventListener("load",markLoad);markLoad();',
  'beat();',
  '})();',
].join('');

function call(method, command, payload) {
  return new Promise((resolve, reject) => {
    const data = payload || {};
    let qs = '';
    if (method === 'GET') {
      const pairs = [];
      Object.keys(data).forEach((k) => {
        if (data[k] === undefined || data[k] === null) return;
        pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(data[k]));
      });
      if (pairs.length) qs = '?' + pairs.join('&');
    }
    const xhr = new XMLHttpRequest();
    xhr.open(method, '/c/' + command + qs, true);
    xhr.timeout = 45000;
    if (method !== 'GET') xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch (e) { body = null; }
      if (!body) { reject(new Error('内核没有返回有效结果')); return; }
      if (!xhr.status || xhr.status >= 400 || body.ok === false) {
        const detail = body.detail || {};
        reject(new Error(detail.error || body.error || ('HTTP ' + xhr.status)));
        return;
      }
      resolve(body);
    };
    xhr.onerror = () => reject(new Error('连不上内核'));
    xhr.ontimeout = () => reject(new Error('内核响应超时'));
    xhr.send(method === 'GET' ? null : JSON.stringify(data));
  });
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 存储满 */ }
}

function shortURL(url) {
  if (!url) return '新标签页';
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function hostOf(url) {
  const m = /^[a-z]+:\/\/([^/]+)/i.exec(url || '');
  return m ? m[1] : shortURL(url);
}

// 书签只留站点名：标题里的副标题（" - 字节跳动旗下…"）会把整条书签栏撑长。
// 先在常见分隔符处截断，再按字数兜底，保证每条都短到能一眼扫完。
function shortBookmarkTitle(title, url) {
  const raw = String(title || '').trim() || hostOf(url);
  const head = raw.split(/\s+[|｜·—–-]\s+/)[0] || raw;
  return head.length > 12 ? head.slice(0, 12) + '…' : head;
}

// 站点图标走各站根目录的 favicon；加载失败时 img 自己隐藏，露出首字色块。
function faviconOf(url) {
  const m = /^[a-z]+:\/\/([^/]+)/i.exec(url || '');
  return m ? 'https://' + m[1] + '/favicon.ico' : '';
}

export function mountBrowserSurface(host) {
  const bootedSpaces = loadSpaces();
  const S = {
    tabs: [], active: '', seq: 0, prefix: 'br' + Date.now().toString(36),
    activeWindow: !window.frameElement,
    chromeHidden: false, destroyed: false,
    // place 通道：同一时刻只允许一个请求在飞，最新几何合并到 pending 里。
    placeInFlight: false, placeLastAt: 0, placeTotal: 0, placeAt: [],
    moveUntil: 0,
    lastRect: null, overlay: 0, zoom: 1, frozenAt: 0,
    // 外壳下发的工作区底边（任务栏顶边，窗口坐标）。原生页面浮在 HTML 之上，
    // 超过这条线的部分要裁掉，任务栏才能正常压住窗口。
    workBottom: 0,
    // 空间弹层：独立原生 Surface（br-ov*），不是 DOM 菜单。
    // ovHtml 只在独立弹层起不来时置位，表示退回 HTML 菜单（需要收起页面才能显示）。
    ov: { id: '', raw: '', w: 0, h: 0, skin: 'current', rect: null, mode: '' },
    ovHtml: false,
    // 内核给的活跃视图预算、系统内存压力、拦截器状态。
    budget: MAX_LIVE, pressure: 0, blocker: null,
    spaces: bootedSpaces.list, space: bootedSpaces.current, spaceActive: {},
    history: readJSON(K.history, []),
    downloads: readJSON(K.downloads, []),
    settings: readJSON(K.settings, { engine: 'bing', home: HOME, bar: true }),
    findOpen: false, findText: '', findMatch: null, menuOpen: false, panel: '',
    spaceMenuOpen: false, tabsMenuOpen: false, spaceConfirm: false,
    // 外壳转来的外链一次性令牌：挂载与 postMessage 可能同时到达，用 token 去重。
    pendingToken: '',
  };
  const timers = [];
  let pollTimer = 0;
  let pollBusy = false;
  let fpsTimer = 0;
  let sig = '';
  // 待发送的几何（按 id 合并，只保留最新值）。
  const pendingPlace = {};
  let placeTimer = 0;
  // 用户正在改地址时不覆盖输入；外部导航/页面跳动仍然同步地址栏。
  let addrDirty = false;

  /* ------------------------------ DOM ------------------------------ */

  const tabsEl = h('div', { class: 'br-tabs', role: 'tablist', 'aria-label': '标签页' });
  // 空间入口固定在标签栏最左；点击后展开空间菜单。
  const spaceBtn = h('button', {
    class: 'br-space-btn', type: 'button', title: '切换折叠空间',
    'aria-haspopup': 'menu', 'aria-expanded': 'false',
  });
  // 标签溢出时出现的收件口：列出当前空间的全部标签，可搜索、可点选。
  const tabsMore = h('button', {
    class: 'br-tabs-more', type: 'button', title: '全部标签页',
    'aria-label': '全部标签页', hidden: true,
  }, '»');
  const tabbar = h('div', { class: 'br-tabbar' }, spaceBtn, tabsEl, tabsMore);
  const backBtn = h('button', { class: 'br-btn br-back', type: 'button', title: '后退', 'aria-label': '后退' }, '‹');
  const fwdBtn = h('button', { class: 'br-btn br-forward', type: 'button', title: '前进', 'aria-label': '前进' }, '›');
  const reloadBtn = h('button', { class: 'br-btn br-reload', type: 'button', title: '刷新', 'aria-label': '刷新' }, '⟳');
  const addr = h('input', {
    class: 'br-addr', type: 'text', spellcheck: 'false', autocomplete: 'off',
    'aria-label': '地址与搜索', placeholder: '输入网址或搜索词，回车打开',
    oninput: () => { addrDirty = true; },
    onblur: () => { addrDirty = false; syncBar(); },
    onkeydown: (e) => {
      if (e.key === 'Enter') { e.preventDefault(); navigate(addr.value); }
      if (e.key === 'Escape') { addr.blur(); }
    },
  });
  const starBtn = h('button', { class: 'br-btn', type: 'button', title: '收藏此页（⌘D）', 'aria-label': '收藏此页' }, '☆');
  const menuBtn = h('button', { class: 'br-btn', type: 'button', title: '菜单', 'aria-label': '菜单' }, '⋮');
  // 和 Chrome 一样，新建标签页的 + 跟在最后一个标签后面，不占工具栏的位置。
  const newTabBtn = h('button', { class: 'br-tab-new', type: 'button', title: '新建标签页（⌘T）', 'aria-label': '新建标签页' }, '+');

  const bookmarksBar = h('div', { class: 'br-bookmarks', role: 'toolbar', 'aria-label': '书签栏' });

  const findInput = h('input', {
    class: 'br-find-input', type: 'text', spellcheck: 'false', autocomplete: 'off',
    placeholder: '在页面中查找',
    oninput: () => { S.findText = findInput.value; find(true); },
    onkeydown: (e) => {
      if (e.key === 'Enter') { e.preventDefault(); find(!e.shiftKey); }
      if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
    },
  });
  const findPrev = h('button', { class: 'br-btn', type: 'button', title: '上一个', onclick: () => find(false) }, '‹');
  const findNext = h('button', { class: 'br-btn', type: 'button', title: '下一个', onclick: () => find(true) }, '›');
  const findState = h('span', { class: 'br-find-state' }, '');
  const findClose = h('button', { class: 'br-btn', type: 'button', title: '关闭查找', onclick: closeFind }, '×');
  const findBar = h('div', { class: 'br-find', hidden: true },
    findInput, findPrev, findNext, findState, findClose);

  const empty = h('div', { class: 'br-empty' });
  // 浮层期间垫在舞台上的页面快照：原生视图收起后，背后仍是刚才的页面。
  const freeze = h('img', { class: 'br-freeze', alt: '', draggable: 'false', hidden: true });
  const stage = h('div', { class: 'br-stage' }, freeze, empty);
  const menu = h('div', { class: 'br-menu', role: 'menu', hidden: true });
  const spaceMenu = h('div', { class: 'br-menu br-space-menu', role: 'menu', hidden: true });
  const tabsMenu = h('div', { class: 'br-menu br-tabs-menu', role: 'menu', hidden: true });
  const panel = h('div', { class: 'br-panel', role: 'dialog', 'aria-modal': 'true', hidden: true });
  const panelCard = h('section', { class: 'br-panel-card' });
  panel.append(panelCard);

  const chromeEl = h('div', { class: 'br-chrome' },
    tabbar,
    h('div', { class: 'br-bar' },
      backBtn, fwdBtn, reloadBtn, addr, starBtn, menuBtn),
    bookmarksBar,
    findBar);
  const shell = h('div', { class: 'br' },
    chromeEl,
    stage,
    menu,
    spaceMenu,
    tabsMenu,
    panel,
  );
  host.append(shell);

  backBtn.onclick = () => hop(-1);
  fwdBtn.onclick = () => hop(1);
  reloadBtn.onclick = () => reload();
  starBtn.onclick = () => toggleBookmark();
  menuBtn.onclick = () => (S.menuOpen ? closeMenu() : openMenu());
  spaceBtn.onclick = () => (S.spaceMenuOpen ? closeSpaceMenu() : openSpaceMenu());
  tabsMore.onclick = () => (S.tabsMenuOpen ? closeTabsMenu() : openTabsMenu());
  newTabBtn.onclick = () => newTab(START);

  // iframe 里的点击不会冒泡到父页面：主动把窗口提到最前。
  shell.addEventListener('pointerdown', () => {
    if (!window.frameElement) return;
    try { window.parent.postMessage({ type: 'nexlos.focus' }, '*'); } catch (e) { /* 父页面已卸载 */ }
  }, true);

  // 任何浮层打开后，点浏览器里其他位置都收起；点各自的按钮除外。
  shell.addEventListener('pointerdown', (e) => {
    if (S.menuOpen && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
    if (S.spaceMenuOpen && !spaceMenu.contains(e.target) && !spaceBtn.contains(e.target)) closeSpaceMenu();
    if (S.tabsMenuOpen && !tabsMenu.contains(e.target) && !tabsMore.contains(e.target)) closeTabsMenu();
  }, true);

  // 标签栏支持滚轮横移，几十个标签时不必去够滚动条。
  tabsEl.addEventListener('wheel', (e) => {
    if (tabsEl.scrollWidth <= tabsEl.clientWidth + 1) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    tabsEl.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('resize', () => syncTabsMore());

  /* ------------------------------ 基础状态 ------------------------------ */

  function showNote(text) {
    clear(empty);
    if (text) {
      empty.append(h('div', { class: 'br-empty-title' }, text));
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }
  }

  // 浮层打开时原生视图要先收起（原生视图永远盖在 HTML 之上）。
  // 收起之前拍一张快照垫在舞台上，菜单背后仍是刚才的页面，不会闪成白板。
  let freezeSeq = 0;

  function clearFreeze() {
    freezeSeq += 1;
    freeze.hidden = true;
    freeze.removeAttribute('src');
  }

  // 常驻底图：原生页永远盖在它上面，页面让位（尺寸变化/收页/切标签）时露出的是
  // 上一帧，而不是舞台白底。新图先在离屏 Image 里解码完再换，换图瞬间不会发白。
  function paintPoster(src) {
    if (!src) return;
    if (freeze.getAttribute('src') !== src) freeze.src = src;
    freeze.hidden = false;
  }

  let posterAt = 0;
  let posterTimer = 0;

  function refreshPoster(tab, delay) {
    if (!tab || tab.url === START || tab.dormant) return;
    if (posterTimer) clearTimeout(posterTimer);
    posterTimer = setTimeout(() => {
      posterTimer = 0;
      if (S.destroyed || tab.id !== S.active) return;
      const now = Date.now();
      if (now - posterAt < 600) return;
      const r = stageRect();
      if (!r.w || !r.h) return;
      posterAt = now;
      call('POST', 'surface.snapshot', { id: tab.id, width: Math.max(1, Math.round(r.w)) })
        .then((body) => {
          const src = (body.detail && body.detail.image) || '';
          if (!src || S.destroyed || tab.id !== S.active) return;
          const im = new Image();
          im.onload = () => {
            if (S.destroyed || tab.id !== S.active) return;
            tab.poster = src;
            paintPoster(src);
          };
          im.src = src;
        }).catch(() => { /* 底图是纯加速，失败就保留上一张 */ });
    }, delay || 0);
  }

  // 等两帧合成，让刚设置的图片真正上屏；rAF 被节流时用定时器兜底，
  // 避免后台窗口里收起动作一直等不到帧。
  function afterPaint() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      let left = 2;
      const tick = () => {
        left -= 1;
        if (left <= 0) { finish(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(finish, 160);
    });
  }

  async function freezeFrame(tab, allowPark) {
    if (!tab || tab.url === START || tab.dormant) return false;
    const rect = stageRect();
    if (!rect.w || !rect.h) return false;
    const seq = ++freezeSeq;
    try {
      const body = await call('POST', 'surface.snapshot', {
        id: tab.id, width: Math.max(1, Math.round(rect.w)),
      });
      // 浮层收起后不能再把旧快照贴回来；失焦/收边（allowPark）没有这个限制。
      if (seq !== freezeSeq || S.destroyed || (!allowPark && S.overlay <= 0)) return false;
      const src = (body.detail && body.detail.image) || '';
      if (!src) return false;
      freeze.src = src;
      freeze.hidden = false;
      // 图片在 WebContent 进程，原生视图在 UI 进程。必须等这张图解码并提交两帧，
      // 确认已经上屏，调用方才能收原生视图；顺序反了就是右键时那一下闪白。
      try { if (freeze.decode) await freeze.decode(); } catch (e) { /* 图已被换掉 */ }
      await afterPaint();
      if (seq !== freezeSeq || S.destroyed) return false;
      if (!allowPark && S.overlay <= 0) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  // 浮层期间原生视图被移走，用一张静态海报占住舞台。
  function showTaskPoster(tab) {
    clear(empty);
    if (!tab || tab.url === START) { empty.hidden = true; return; }
    empty.append(h('div', { class: 'br-tv-poster' },
      h('b', {}, tab.title || hostOf(tab.url)),
      h('span', {}, hostOf(tab.url))));
    empty.hidden = false;
  }

  // 原生页面让位时统一处理：失焦、任务视窗、菜单/面板都走这里。
  // 顺序固定为「先让冻结帧上屏，再收原生视图」；没有图可盖时绝不清空舞台。
  function parkPage() {
    const tab = activeTab();
    if (!tab) { hide(tab); return; }
    // 已有冻结帧：它已经显示在舞台里，直接收原生视图是原子替换。
    if (!freeze.hidden) { hide(tab); syncBar(); return; }
    if (tab.url === START || tab.dormant) {
      hide(tab);
      return;
    }
    // 每次没有图时都重新拍：之前按 900ms 节流会跳过快照，
    // 连续右键时舞台只剩底色，就是用户看到的那一下闪。
    S.frozenAt = Date.now();
    freezeFrame(tab, true).then((ok) => {
      // 快照期间可能又切回来了：这时候不能把已经恢复的页面收掉。
      if (visible()) return;
      hide(tab);
      // 快照失败才退回标题卡；有图时卡片绝不能压上去。
      if (!ok && freeze.hidden) showTaskPoster(tab);
      syncBar();
    });
  }

  function showError(message) {
    S.errorAt = Date.now();
    clear(empty);
    empty.append(
      h('div', { class: 'br-empty-title' }, '浏览器页面没有挂上'),
      h('div', { class: 'br-empty-body' }, message),
      h('div', { class: 'br-empty-hint' }, '原生 Surface 只在 NexlOS 桌面壳里可用（-tags shell）。'),
      h('button', { class: 'br-btn br-retry', type: 'button', onclick: () => recover() }, '重试'),
    );
    empty.hidden = false;
  }

  function activeTab() {
    for (let i = 0; i < S.tabs.length; i++) {
      if (S.tabs[i].id === S.active) return S.tabs[i];
    }
    return null;
  }

  // 空间：每个空间有自己的一组标签和一份书签，切换时只换视角，不销毁其他空间的页面。
  function curSpace() {
    for (let i = 0; i < S.spaces.length; i++) if (S.spaces[i].id === S.space) return S.spaces[i];
    return S.spaces[0] || null;
  }

  function spaceBookmarks() {
    const s = curSpace();
    if (!s) return [];
    if (!Array.isArray(s.bookmarks)) s.bookmarks = [];
    return s.bookmarks;
  }

  function writeSpaces() {
    writeJSON(K.spaces, { list: S.spaces, current: S.space });
  }

  function spaceTabs() {
    return S.tabs.filter((t) => t.space === S.space);
  }

  function tabAt(id) {
    for (let i = 0; i < S.tabs.length; i++) {
      if (S.tabs[i].id === id) return S.tabs[i];
    }
    return null;
  }

  /* ------------------------------ 标签页 ------------------------------ */

  function renderTabs() {
    const list = spaceTabs();
    const now = S.space + '\n' + list.map((t) => (t.id + '|' + (t.title || '') + '|' + (t.url || '') + '|' + (t.id === S.active ? 1 : 0))).join('\n');
    if (now === sig && newTabBtn.parentNode === tabsEl) {
      paintSpaceBtn();
      syncTabsMore();
      return;
    }
    sig = now;
    clear(tabsEl);
    list.forEach((tab) => {
      const active = tab.id === S.active;
      tabsEl.append(h('div', {
        class: 'br-tab' + (active ? ' active' : ''),
        role: 'tab', 'aria-selected': active ? 'true' : 'false',
        'data-id': tab.id,
        title: tab.title || tab.url || '标签页',
        onclick: () => { if (!active) switchTab(tab.id); },
      },
        h('span', { class: 'br-tab-title' }, tab.title || shortURL(tab.url)),
        h('button', {
          class: 'br-tab-close', type: 'button', 'aria-label': '关闭标签页',
          onclick: (e) => { e.stopPropagation(); closeTab(tab.id); },
        }, '×'),
      ));
    });
    // + 紧跟最后一个标签，和 Chrome 的标签栏结构一致。
    tabsEl.append(newTabBtn, h('div', { class: 'br-tab-fill' }));
    paintSpaceBtn();
    syncTabsMore();
    keepTabInView();
  }

  function paintSpaceBtn() {
    const s = curSpace();
    if (!s) return;
    clear(spaceBtn);
    spaceBtn.append(
      h('span', { class: 'br-space-dot', style: 'background:' + s.color }),
      h('span', { class: 'br-space-name' }, s.name));
    spaceBtn.title = '切换折叠空间（当前：' + s.name + '）';
  }

  // 只在该出现时出现：标签总宽超过可视宽，才有必要开收件口。
  function syncTabsMore() {
    const over = tabsEl.scrollWidth > tabsEl.clientWidth + 4;
    tabsMore.hidden = !over;
  }

  function keepTabInView() {
    const el = tabsEl.querySelector('.br-tab.active');
    if (!el) return;
    const er = el.getBoundingClientRect();
    const cr = tabsEl.getBoundingClientRect();
    if (er.left < cr.left) tabsEl.scrollLeft -= (cr.left - er.left) + 4;
    else if (er.right > cr.right) tabsEl.scrollLeft += (er.right - cr.right) + 4;
  }

  function syncBar() {
    const tab = activeTab();
    const url = tab ? tab.url : '';
    const isStart = url === START;
    if (!addrDirty) addr.value = isStart ? '' : url;
    starBtn.textContent = isBookmarked(url) ? '★' : '☆';
    renderBookmarks();
  }

  function applyBeat(tab, data) {
    const prev = tab.url;
    const wasLoading = tab.loading;
    if (data.title) tab.title = data.title;
    // 导航刚发起时旧页面还会再报一次旧地址；加载标志落地前不接受它，
    // 否则地址栏会先跳回旧网址，看起来像「打不开」。
    if (data.url && (!wasLoading || data.url === tab.url)) tab.url = data.url;
    tab.beatAt = Date.now();
    tab.loading = false;
    // 保活信号：出声 / 摄像头麦克风 / 画中画 / 未提交输入。
    tab.audible = !!data.audible;
    tab.media = !!data.media;
    tab.pip = !!data.pip;
    if (data.dirty) {
      tab.dirty = true;
      tab.dirtyAt = data.dirty;
    } else if (data.dirty === 0) {
      tab.dirty = false;
    }
    // 首屏耗时：页面自己报的 performance.now()，用于拦截前后对比。
    if (data.loadMs && !tab.loadMs) tab.loadMs = data.loadMs;
    if (data.dcl && !tab.dcl) tab.dcl = data.dcl;
    if (tab.url && tab.url !== prev) {
      recordVisit(tab);
      // 页面自己跳转（重定向/站内跳转）后地址栏要跟上；否则会停在上一页，
      // 看起来像「刚打开又弹回旧网址」。用户正在编辑时 syncBar 不会覆盖输入。
      if (S.active === tab.id) syncBar();
    }
    // 从地址栏导航后，页面加载完把键盘交还页面（与 Chrome 一致）。
    // 地址栏正在用时不动，否则会把用户刚敲的字抢走。
    if (data.ready === 'complete' && wasLoading && S.active === tab.id &&
        document.activeElement !== addr && !addrDirty && visible()) {
      call('POST', 'surface.focus', { id: tab.id }).catch(() => { /* 页面已关 */ });
    }
    // 首屏完成时补一张底图：之后的最大化/最小化/收边都有一帧真实画面兜底。
    if (data.ready === 'complete' && wasLoading && S.active === tab.id && visible()) {
      refreshPoster(tab, 200);
    }
    renderTabs();
  }

  /* ------------------------------ 几何与叠层 ------------------------------ */

  // iframe 内任意矩形 → 宿主窗口坐标（含 iframe 边框与窗口缩放的视觉比例）。
  function toWindowRect(left, top, width, height) {
    const fe = window.frameElement;
    if (!fe) return { x: left, y: top, w: width, h: height };
    const fr = fe.getBoundingClientRect();
    const base = fe.offsetWidth || width || 1;
    const scale = fr.width / Math.max(1, base);
    return {
      x: fr.left + (fe.clientLeft + left) * scale,
      y: fr.top + (fe.clientTop + top) * scale,
      w: width * scale,
      h: height * scale,
    };
  }

  function stageRect() {
    const sr = stage.getBoundingClientRect();
    if (!sr.width || !sr.height) return { x: 0, y: 0, w: 0, h: 0 };
    const fe = window.frameElement;
    if (!fe) return toWindowRect(sr.left, sr.top, sr.width, sr.height);
    const fr = fe.getBoundingClientRect();
    const base = fe.offsetWidth || sr.width || 1;
    const scale = fr.width / Math.max(1, base);
    // iframe 换尺寸后，子文档的布局会晚 1–2 帧；过去这里读子文档的 width/height，
    // 结果是「新原点 + 旧尺寸」，最大化时舞台边缘露出白带。
    // 宽高直接取 iframe 元素的当前布局值，只从子文档读不随窗口变化的 chrome 高度。
    const chromeTop = Math.max(0, sr.top);
    return {
      x: fr.left + fe.clientLeft * scale,
      y: fr.top + (fe.clientTop + chromeTop) * scale,
      w: Math.max(0, fe.clientWidth) * scale,
      h: Math.max(0, fe.clientHeight - chromeTop) * scale,
    };
  }

  // 可见底边：窗口滑到任务栏下面时返回任务栏顶边，否则 0（不裁）。
  // 原生视图尺寸保持整块舞台，只缩短承载它的裁剪宿主，页面不会重排。
  function stageClip(r) {
    if (!S.workBottom || r.y + r.h <= S.workBottom) return 0;
    return S.workBottom;
  }

  function clipChanged(r) {
    const clip = stageClip(r);
    const prev = S.lastRect ? (S.lastRect.clipBottom || 0) : 0;
    return clip !== prev;
  }

  function visible() {
    return !S.destroyed && S.activeWindow && !S.chromeHidden && !S.overlay;
  }

  // 开始菜单悬停时预拍一张：原生层把结果放进缓存，点击展开时不再等 takeSnapshot。
  // 600ms 内只发一次，鼠标来回扫不会变成快照风暴。
  let warmAt = 0;
  function warmSurface() {
    const now = Date.now();
    if (now - warmAt < 600) return;
    const tab = activeTab();
    if (!tab || tab.url === START || tab.dormant || !visible()) return;
    warmAt = now;
    call('POST', 'surface.warm', { id: tab.id }).catch(() => { /* 预热失败不影响正式流程 */ });
  }
  window.__nexlosWarm = warmSurface;

  function sameRect(a, b) {
    if (!a || !b) return false;
    return Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6 &&
      Math.abs(a.w - b.w) < 0.6 && Math.abs(a.h - b.h) < 0.6;
  }

  // 最近 1 秒发出的 place 次数：验收时读这个数，空闲必须是 0。
  function placeRate() {
    const now = Date.now();
    while (S.placeAt.length && now - S.placeAt[0] > 1000) S.placeAt.shift();
    return S.placeAt.length;
  }

  function notePlace() {
    S.placeLastAt = Date.now();
    S.placeTotal += 1;
    S.placeAt.push(S.placeLastAt);
    if (S.placeAt.length > 200) S.placeAt.shift();
  }

  // 一次 place 请求。成功/失败都以 {ok, error} 交回，调用方自己决定是否报错。
  function placeJob(job) {
    S.placeInFlight = true;
    notePlace();
    return call('POST', 'surface.place', job).then(
      () => ({ ok: true }),
      (e) => ({ ok: false, error: e.message || String(e) }),
    ).then((res) => {
      S.placeInFlight = false;
      pumpPlace();
      return res;
    });
  }

  // 几何微调：同一个 id 只保留最新值；同一时刻最多一个请求在飞；30Hz 上限。
  function enqueue(job) {
    // 原生视图可能已经被回收（休眠/内存压力）。重建时要带上 URL，
    // 否则新视图落在 about:blank，地址栏却还写着原来的地址。
    if (!job.url) {
      const tab = tabAt(job.id);
      if (tab && !tab.placed && tab.url && tab.url !== START) job.url = tab.url;
    }
    pendingPlace[job.id] = job;
    pumpPlace();
  }

  function pumpPlace() {
    if (S.destroyed || S.placeInFlight) return;
    const ids = Object.keys(pendingPlace);
    if (!ids.length) return;
    // 拖窗/收边期间按运动频率追，静止时退回 30Hz，避免空转。
    const gap = Date.now() < S.moveUntil ? PLACE_GAP_MOVE : PLACE_GAP;
    const wait = gap - (Date.now() - S.placeLastAt);
    if (wait > 0) {
      if (!placeTimer) placeTimer = setTimeout(() => { placeTimer = 0; pumpPlace(); }, wait);
      return;
    }
    const job = pendingPlace[ids[0]];
    delete pendingPlace[ids[0]];
    placeJob(job).then((res) => {
      if (res.ok) {
        if (job.id === S.active) S.lastRect = job;
        const tab = tabAt(job.id);
        if (tab) { tab.dormant = false; tab.placed = true; }
        return;
      }
      if (job.id === S.active) S.lastRect = null;
      showError(res.error);
    });
  }

  async function place(tab, url, rect) {
    const r = rect || stageRect();
    if (!r.w || !r.h) return false;
    // 先报会话标识：外壳切走这扇窗时可以直接收起它，不必等这里往返。
    try { window.parent.postMessage({ type: 'nexlos.surface', id: tab.id }, '*'); } catch (e) { /* 独立页面 */ }
    const job = { id: tab.id, x: r.x, y: r.y, w: r.w, h: r.h, clipBottom: stageClip(r), z: 1 };
    if (url) job.url = url;
    delete pendingPlace[tab.id]; // 整页重挂覆盖掉待发的微调
    const res = await placeJob(job);
    if (!res.ok) {
      showError(res.error);
      return false;
    }
    tab.dormant = false;
    tab.placed = true;
    // 请求在飞的时候窗口可能已经失焦、或者被菜单盖住：place 会把视图重新亮起来，
    // 这里再收一次，避免旧页面在切换后一直浮着。
    if (!visible()) { hide(tab); return false; }
    if (tab.id === S.active) {
      S.lastRect = job;
      if (empty.textContent) showNote('');
      // 原生视图上屏后再换底图：新一帧盖住旧的，下次让位露出的就是当前画面。
      // 底图不撤：它永远垫在原生页下面，白底就再也没有露出的机会。
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (S.destroyed || tab.id !== S.active || !visible()) return;
        refreshPoster(tab, 120);
      }));
    }
    return true;
  }

  // 事件驱动的几何追帧：只在「几何可能正在变」的时间窗里跑 rAF。
  // 触发源是 resize / 外壳的窗口拖动消息 / 标签切换 / place 失败重试；
  // 窗口结束后彻底停掉，空闲页面上一个 rAF 都不留。
  let pumpUntil = 0;
  let pumpHandle = 0;
  let pumpStable = 0;

  function pump(ms) {
    // 一段窗口里的几何都在变：这段时间按高频 place 追，停下后再退回 30Hz。
    S.moveUntil = Math.max(S.moveUntil, Date.now() + 220);
    pumpUntil = Math.max(pumpUntil, Date.now() + (ms || 400));
    pumpStable = 0;
    if (pumpHandle) return;
    pumpHandle = requestAnimationFrame(pumpTick);
  }

  function pumpTick() {
    pumpHandle = 0;
    if (S.destroyed) return;
    const now = Date.now();
    let moved = false;

    const tab = activeTab();
    if (tab && tab.url !== START && !tab.dormant && visible()) {
      const r = stageRect();
      if (r.w && r.h && (!sameRect(r, S.lastRect) || clipChanged(r))) {
        enqueue({ id: tab.id, x: r.x, y: r.y, w: r.w, h: r.h, clipBottom: stageClip(r), z: 1 });
        moved = true;
      }
    }
    // 弹层跟着锚点走：窗口移动/缩放时一起挪，不然它会留在旧位置。
    if (S.ov.id) {
      const r = overlayRect();
      if (r && !sameRect(r, S.ov.rect)) {
        S.ov.rect = r;
        enqueue({ id: S.ov.id, x: r.x, y: r.y, w: r.w, h: r.h, z: OV_Z });
        moved = true;
      }
    }

    pumpStable = moved ? 0 : pumpStable + 1;
    if (moved) pumpUntil = Math.max(pumpUntil, now + 200);
    if (now < pumpUntil || pumpStable < 6) pumpHandle = requestAnimationFrame(pumpTick);
  }

  async function hide(tab) {
    if (!tab) return;
    try { await call('POST', 'surface.hide', { id: tab.id }); } catch (e) { /* 已销毁 */ }
  }

  function syncVisible(force) {
    const tab = activeTab();
    if (!tab) return;
    // 新标签页没有原生 Surface：收掉页面，留一块干净的空白舞台。
    if (tab.url === START) {
      hide(tab);
      if (visible()) showNote('');
      clearFreeze();
      return;
    }
    if (!visible()) { hide(tab); return; }
    if (force || tab.dormant || !tab.placed) {
      // 原生视图按添加顺序叠放：切回来时先提到最上层，旧页面就算还没收到
      // 隐藏命令也盖不住它。首次挂载本来就在最上层，多这一枪无副作用。
      if (force) call('POST', 'surface.front', { id: tab.id }).catch(() => { /* 尚未创建 */ });
      // 切标签/唤醒时先垫上这张标签自己的上一帧；没有就保留旧底图，
      // 也比把舞台清成白色好。
      if (tab.poster) paintPoster(tab.poster);
      place(tab, (tab.dormant || !tab.placed) ? tab.url : '').then((ok) => {
        if (ok) {
          call('POST', 'surface.focus', { id: tab.id }).catch(() => {});
          applyZoom();
        }
      });
      return;
    }
    const r = stageRect();
    if (!sameRect(r, S.lastRect) || clipChanged(r)) {
      enqueue({ id: tab.id, x: r.x, y: r.y, w: r.w, h: r.h, clipBottom: stageClip(r), z: 1 });
    }
    // 窗口重新拿到焦点时底图可能已经过期：补一张，原生页盖着它，看不见这次捕获。
    if (posterAt === 0 || Date.now() - posterAt > 2000) refreshPoster(tab, 300);
  }

  /* ------------------------------ 页面动作 ------------------------------ */

  function sid() {
    S.seq += 1;
    return S.prefix + '-' + S.seq;
  }

  function markLoading(tab) {
    tab.loading = true;
    tab.beatAt = 0;
    tab.lastInjectAt = 0;
    syncBar();
  }

  async function newTab(url, opts) {
    if (S.destroyed) return;
    closeSpaceMenu(true);
    const prev = activeTab();
    if (prev) hide(prev);
    const target = url || START;
    const isStart = target === START;
    const tab = {
      id: sid(), url: target, title: isStart ? '新标签页' : '', dormant: true,
      space: S.space,
      placed: false, loading: !isStart, beatAt: 0, lastInjectAt: 0, raw: '', usedAt: Date.now(),
    };
    S.tabs.push(tab);
    S.active = tab.id;
    S.spaceActive[S.space] = tab.id;
    S.lastRect = null;
    addrDirty = false;
    renderTabs();
    syncBar();
    if (isStart) {
      showNote('');
      clearFreeze();
    } else {
      showNote('正在打开 ' + hostOf(tab.url) + '…');
      if (visible()) {
        await place(tab, tab.url);
        call('POST', 'surface.focus', { id: tab.id }).catch(() => {});
        applyZoom();
      }
    }
    sweepTabs();
    if (!opts || !opts.silent) addr.focus();
    addr.select();
  }

  function switchTab(id) {
    const nextTab = tabAt(id);
    if (!nextTab || id === S.active) return;
    // 换标签先收起空间弹层：它锚在当前标签栏上，跟着一起换没有意义。
    closeSpaceMenu(true);
    const prev = activeTab();
    S.active = id;
    S.spaceActive[S.space] = id;
    S.lastRect = null;
    nextTab.usedAt = Date.now();
    if (prev) hide(prev);
    renderTabs();
    syncBar();
    syncVisible(true);
    pump(500);
  }

  async function closeTab(id) {
    const tab = tabAt(id);
    if (!tab) return;
    closeSpaceMenu(true);
    const idx = S.tabs.indexOf(tab);
    // 先在空间内记下位置，关掉后才能接着打开相邻的那一个。
    const spaceIdx = S.tabs.filter((t) => t.space === tab.space).indexOf(tab);
    try { await call('POST', 'surface.remove', { id: tab.id }); } catch (e) { /* 已不存在 */ }
    S.tabs.splice(idx, 1);
    if (S.active === id) {
      S.active = '';
      // 只在同一空间里找接替的标签，不能跳到别的空间去。
      const siblings = S.tabs.filter((t) => t.space === tab.space);
      const next = siblings[Math.min(spaceIdx, siblings.length - 1)];
      if (next) {
        S.active = next.id;
        S.spaceActive[tab.space] = next.id;
        S.lastRect = null;
        syncVisible(true);
      } else {
        await newTab(START);
      }
    }
    renderTabs();
    syncBar();
  }

  function normalize(raw) {
    const s = (raw || '').trim();
    if (!s) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    if (!/\s/.test(s) && /^[^\s/]+\.[^\s/]+/.test(s)) return 'https://' + s;
    const engine = ENGINES[S.settings.engine] || ENGINES.bing;
    return engine.url + encodeURIComponent(s);
  }

  async function navigate(raw) {
    if (raw === START) {
      const tab = activeTab();
      if (!tab) { newTab(START); return; }
      tab.url = START;
      tab.title = '新标签页';
      tab.loading = false;
      tab.dormant = true;
      tab.placed = false;
      hide(tab);
      syncBar();
      renderTabs();
      showNote('');
      clearFreeze();
      return;
    }
    const url = normalize(raw);
    if (!url) return;
    closeSpaceMenu(true);
    addrDirty = false;
    const tab = activeTab();
    if (!tab) { newTab(url); return; }
    tab.url = url;
    tab.title = '';
    markLoading(tab);
    // 菜单和面板都可能在导航前打开，先收起再跳；函数名是复数形式会抛
    // ReferenceError，把后面的 surface.navigate 整段吞掉。
    closeMenu();
    closePanel();
    if (tab.dormant) {
      if (visible()) {
        await place(tab, url);
        call('POST', 'surface.focus', { id: tab.id }).catch(() => {});
        applyZoom();
      }
      return;
    }
    try {
      await call('POST', 'surface.navigate', { id: tab.id, url: url });
      call('POST', 'surface.focus', { id: tab.id }).catch(() => {});
      applyZoom();
    } catch (e) {
      tab.dormant = true;
      tab.url = url;
    }
  }

  async function hop(delta) {
    const tab = activeTab();
    if (!tab || tab.dormant) return;
    markLoading(tab);
    try {
      await call('POST', delta < 0 ? 'surface.back' : 'surface.forward', { id: tab.id });
    } catch (e) { syncBar(); }
  }

  async function reload() {
    const tab = activeTab();
    if (!tab) return;
    if (tab.url === START) { renderStartPage(true); return; }
    markLoading(tab);
    if (tab.dormant) { if (visible()) await place(tab, tab.url); return; }
    try { await call('POST', 'surface.reload', { id: tab.id }); }
    catch (e) { tab.dormant = true; }
  }

  function recover() {
    const tab = activeTab();
    if (!tab) return;
    clear(empty);
    empty.hidden = true;
    tab.dormant = true;
    S.lastRect = null;
    syncVisible(true);
  }

  /* ------------------------------ 查找 / 缩放 / 打印 ------------------------------ */

  function openFind() {
    S.findOpen = true;
    findBar.hidden = false;
    findInput.focus();
    findInput.select();
    if (S.findText) find(true);
  }

  function closeFind() {
    S.findOpen = false;
    findBar.hidden = true;
    findState.textContent = '';
    const tab = activeTab();
    if (tab && visible()) call('POST', 'surface.focus', { id: tab.id }).catch(() => {});
  }

  function find(forward) {
    const text = findInput.value;
    if (!text) return;
    S.findText = text;
    const tab = activeTab();
    if (!tab || tab.dormant) return;
    call('POST', 'surface.find', {
      id: tab.id, text: text, forward: forward ? true : false, matchCase: false,
    }).catch(() => {});
    findState.textContent = '…';
  }

  function applyZoom() {
    const tab = activeTab();
    if (!tab || tab.dormant) return;
    call('POST', 'surface.zoom', { id: tab.id, factor: S.zoom }).catch(() => {});
  }

  function setZoom(next) {
    S.zoom = Math.max(0.25, Math.min(3, Math.round(next * 100) / 100));
    applyZoom();
    syncBar();
  }

  function zoomStep(dir) {
    let i = 0;
    for (let k = 0; k < ZOOMS.length; k++) if (ZOOMS[k] <= S.zoom) i = k;
    setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))]);
  }

  /* ------------------------------ 书签 ------------------------------ */

  function isBookmarked(url) {
    if (!url) return false;
    return spaceBookmarks().some((b) => b.url === url);
  }

  function toggleBookmark() {
    const tab = activeTab();
    if (!tab || !tab.url || tab.url === START) return;
    const list = spaceBookmarks();
    const idx = list.findIndex((b) => b.url === tab.url);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.unshift({ url: tab.url, title: tab.title || hostOf(tab.url), at: Date.now() });
      if (list.length > 200) list.length = 200;
    }
    writeSpaces();
    syncBar();
    renderBookmarks();
  }

  function removeBookmark(url) {
    const list = spaceBookmarks();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].url === url) list.splice(i, 1);
    }
    writeSpaces();
    renderBookmarks();
    syncBar();
    if (S.panel === 'bookmarks') renderPanel();
  }

  function renderBookmarks() {
    const list = spaceBookmarks();
    const show = S.settings.bar !== false && list.length > 0;
    bookmarksBar.hidden = !show;
    // 空空间没有书签栏可画，把签名清空，回到有书签的空间时才不会命中旧签名而跳过重绘。
    if (!show) { S.bmSig = ''; clear(bookmarksBar); return; }
    // 空间也进签名：切换空间后即使书签标题相同也要重画。
    const markup = S.space + '\n' + list.slice(0, 12).map((b) => b.url + '|' + (b.title || '')).join('\n');
    if (markup === S.bmSig) return;
    S.bmSig = markup;
    clear(bookmarksBar);
    list.slice(0, 12).forEach((b, i) => {
      // 条与条之间只用一道竖线分隔，宽度由内容决定，不留整齐的空格子。
      if (i) bookmarksBar.append(h('span', { class: 'br-bm-sep' }, '｜'));
      const label = shortBookmarkTitle(b.title, b.url);
      bookmarksBar.append(h('button', {
        class: 'br-bm', type: 'button', title: b.title || b.url, onclick: (e) => {
          if (e.metaKey || e.ctrlKey) newTab(b.url);
          else navigate(b.url);
        },
      },
        h('span', { class: 'br-bm-mark' },
          h('span', { class: 'br-bm-letter' }, (label || '?').slice(0, 1)),
          h('img', {
            class: 'br-bm-icon', src: faviconOf(b.url), alt: '',
            onerror: (e) => { e.currentTarget.style.display = 'none'; },
          })),
        h('span', { class: 'br-bm-label' }, label)));
    });
    bookmarksBar.append(h('span', { class: 'br-bm-sep' }, '｜'));
    bookmarksBar.append(h('button', {
      class: 'br-bm br-bm-more', type: 'button', title: '全部书签',
      onclick: () => openPanel('bookmarks'),
    }, '全部'));
  }

  /* ------------------------------ 历史与下载 ------------------------------ */

  function recordVisit(tab) {
    if (!/^https?:/i.test(tab.url || '')) return;
    const now = Date.now();
    const last = S.history[0];
    if (last && last.url === tab.url) {
      if (tab.title) last.title = tab.title;
      last.at = now;
      writeJSON(K.history, S.history);
      return;
    }
    S.history.unshift({ url: tab.url, title: tab.title || hostOf(tab.url), at: now });
    if (S.history.length > 300) S.history.length = 300;
    writeJSON(K.history, S.history);
  }

  function recordDownload(data) {
    if (data.state === 'start') {
      S.downloads.unshift({
        file: data.file || '下载', path: data.path || '', url: activeTab() ? activeTab().url : '',
        at: Date.now(), state: 'downloading',
      });
      if (S.downloads.length > 100) S.downloads.length = 100;
    } else {
      const hit = S.downloads[0];
      if (hit) {
        hit.state = data.state === 'done' ? 'done' : 'fail';
        if (data.error) hit.error = data.error;
      }
    }
    writeJSON(K.downloads, S.downloads);
    if (S.panel === 'downloads') renderPanel();
  }

  /* ------------------------------ 菜单与面板 ------------------------------ */

  function openOverlay() {
    S.overlay += 1;
    const tab = activeTab();
    if (!tab) return;
    // 第二层浮层沿用第一层已经垫好的快照，不重复拍照。
    if (S.overlay > 1) { hide(tab); return; }
    if (tab.url === START || tab.dormant) { hide(tab); clearFreeze(); return; }
    // 先拍照、等图上屏，再收起：这几十毫秒里页面仍在，菜单会被页面盖住一会儿，
    // 但收起时舞台上已经有同一帧画面，不会闪白。
    freezeFrame(tab).then((ok) => {
      if (S.overlay <= 0 || S.destroyed) return;
      hide(tab);
      if (!ok && freeze.hidden) showTaskPoster(tab);
    });
  }

  function closeOverlay() {
    S.overlay = Math.max(0, S.overlay - 1);
    // 同一拍里可能马上又打开另一个浮层；等一拍再恢复页面，避免闪一下。
    if (!S.overlay) {
      setTimeout(() => { if (!S.overlay && !S.destroyed) syncVisible(true); }, 0);
    }
  }

  function closeMenu() {
    if (!S.menuOpen) return;
    S.menuOpen = false;
    menu.hidden = true;
    closeOverlay();
  }

  function openMenu() {
    closePanel();
    closeSpaceMenu();
    closeTabsMenu();
    if (S.menuOpen) { closeMenu(); return; }
    S.menuOpen = true;
    clear(menu);
    // 分组与 Chrome 一致：新建标签单独成组，浏览、页面操作、开发与设置各一组。
    const groups = [
      [['新标签页', '⌘T', () => { closeMenu(); newTab(START); }]],
      [
        ['历史记录', '', () => { closeMenu(); openPanel('history'); }],
        ['下载内容', '', () => { closeMenu(); openPanel('downloads'); }],
        ['书签管理器', '', () => { closeMenu(); openPanel('bookmarks'); }],
        ['扩展程序', '', () => { closeMenu(); openPanel('extensions'); }],
      ],
      [
        ['查找…', '⌘F', () => { closeMenu(); openFind(); }],
        ['打印…', '⌘P', () => { closeMenu(); printPage(); }],
        ['缩放 ' + Math.round(S.zoom * 100) + '%', '', () => { closeMenu(); zoomStep(0); }],
        ['放大', '⌘+', () => { closeMenu(); zoomStep(1); }],
        ['缩小', '⌘-', () => { closeMenu(); zoomStep(-1); }],
      ],
      [
        ['开发者工具', '', () => { closeMenu(); devtoolsHint(); }],
        ['设置', '', () => { closeMenu(); openPanel('settings'); }],
      ],
    ];
    groups.forEach((items, gi) => {
      if (gi) menu.append(h('div', { class: 'br-mi-sep', role: 'separator' }));
      items.forEach((it) => {
        menu.append(h('button', {
          class: 'br-mi', type: 'button', role: 'menuitem',
          onclick: it[2],
        }, h('span', {}, it[0]), h('span', { class: 'br-mi-key' }, it[1])));
      });
    });
    // 菜单贴着工具栏底边，书签栏或查找条出现时也跟着下移。
    placePop(menu);
    menu.hidden = false;
    openOverlay();
  }

  // 所有浮层共用一条定位规则：贴着 chrome（标签栏 + 工具栏 + 书签栏）的底边。
  function placePop(node) {
    const shellTop = shell.getBoundingClientRect().top;
    node.style.top = Math.round(chromeEl.getBoundingClientRect().bottom - shellTop + 6) + 'px';
  }

  /* ------------------------------ 空间 ------------------------------ */

  // 空间弹层是一块独立的原生 Surface（id 前缀 br-ov），不是 DOM 菜单：
  // DOM 永远压在真实页面之下，菜单只能靠「收起页面」换位置，那就会露出白底。
  // 弹层自己画卡片、自己收键盘，操作结果通过 __nexlosSurface 回传。

  function overlayState() {
    return {
      list: S.spaces.map((s) => ({ id: s.id, name: s.name, color: s.color })),
      current: S.space,
      mode: S.ov.mode || '',
    };
  }

  function overlaySkin() {
    return document.documentElement.getAttribute('data-appearance') === 'win98' ? 'win98' : 'current';
  }

  // 弹层贴着空间按钮下沿、工具栏底边之下，和原来的 HTML 菜单同一个锚点。
  function overlayAnchor() {
    const b = spaceBtn.getBoundingClientRect();
    const c = chromeEl.getBoundingClientRect();
    return toWindowRect(b.left, c.bottom + 6, 0, 0);
  }

  // 首次摆放用的估算尺寸：内容高度是可算的（表头 + 每行 + 分隔 + 两个按钮行）。
  // 弹层加载完会回传真实尺寸，之后以它为准。
  function estimateOverlay() {
    const pad = OV_PAD;
    // 标题栏 24 + 每行 30 + 分隔 9 + 新建行 31 + 按钮行 31 + 窗体上下 7。
    // 真实高度由弹层回传，这里只求首帧不跳。
    const rows = S.spaces.length * 30;
    return {
      w: 236 + pad.left + pad.right,
      h: 102 + rows + pad.top + pad.bottom,
    };
  }

  function overlayRect() {
    if (!S.ov.id) return null;
    const a = overlayAnchor();
    const pad = OV_PAD;
    const est = estimateOverlay();
    return {
      x: a.x - pad.left,
      y: a.y - pad.top,
      w: S.ov.w || est.w,
      h: S.ov.h || est.h,
    };
  }

  function updateOverlayBody() {
    if (!S.ov.id) return;
    const js = 'window.__nexlosOverlayUpdate&&window.__nexlosOverlayUpdate(' +
      JSON.stringify(overlayState()) + ')';
    call('POST', 'surface.eval', { id: S.ov.id, js: js }).catch(() => { /* 弹层已关 */ });
  }

  // 弹层回传的操作：切换 / 新建 / 重命名 / 删除 / 关闭 / 尺寸变化。
  function handleOverlayMessage(data) {
    if (!data || !data.action) return;
    if (data.action === 'open') return;
    if (data.action === 'metrics') {
      const w = Math.round(data.w || 0);
      const h = Math.round(data.h || 0);
      if (w < 80 || h < 60 || (w === S.ov.w && h === S.ov.h)) return;
      S.ov.w = w;
      S.ov.h = h;
      const r = overlayRect();
      S.ov.rect = r;
      enqueue({ id: S.ov.id, x: r.x, y: r.y, w: r.w, h: r.h, z: OV_Z });
      return;
    }
    if (data.action === 'close' || data.action === 'outside') { closeSpaceMenu(); return; }
    if (data.action === 'switch') {
      const id = String(data.id || '');
      closeSpaceMenu(true);
      if (id) switchSpace(id);
      return;
    }
    if (data.action === 'create') {
      const name = String(data.name || '').trim();
      closeSpaceMenu(true);
      createSpace(name);
      return;
    }
    if (data.action === 'rename') {
      const s = curSpace();
      const name = String(data.name || '').trim();
      if (!s || !name) return;
      s.name = name.slice(0, 24);
      S.ov.mode = '';
      S.ov.raw = '';
      writeSpaces();
      paintSpaceBtn();
      updateOverlayBody();
      return;
    }
    if (data.action === 'delete') {
      closeSpaceMenu(true);
      deleteSpace();
    }
  }

  function closeSpaceMenu(silent) {
    if (!S.spaceMenuOpen && !S.ov.id) return;
    const html = S.ovHtml;
    const hadOverlay = !!S.ov.id;
    S.spaceMenuOpen = false;
    S.spaceConfirm = false;
    S.ovHtml = false;
    spaceMenu.hidden = true;
    spaceBtn.setAttribute('aria-expanded', 'false');
    const id = S.ov.id;
    S.ov.id = '';
    S.ov.raw = '';
    S.ov.w = 0;
    S.ov.h = 0;
    S.ov.rect = null;
    S.ov.mode = '';
    if (id) {
      delete pendingPlace[id];
      call('POST', 'surface.remove', { id: id }).catch(() => { /* 已不存在 */ });
      // 键盘焦点还给页面：弹层视图销毁后焦点不能留在半空。
      const tab = activeTab();
      if (tab && visible()) call('POST', 'surface.focus', { id: tab.id }).catch(() => { /* 无页面 */ });
    }
    if (html) closeOverlay();
    if (hadOverlay) syncPoll();
    if (!silent) pump(240);
  }

  async function openSpaceMenu() {
    if (S.spaceMenuOpen) { closeSpaceMenu(); return; }
    closeMenu();
    closeTabsMenu();
    closePanel();
    S.spaceMenuOpen = true;
    S.spaceConfirm = false;
    S.ov.mode = '';
    S.ov.skin = overlaySkin();
    S.ov.w = 0;
    S.ov.h = 0;
    S.ov.raw = '';
    S.ov.id = 'br-ov-' + S.prefix + '-' + (++S.seq);
    S.ov.rect = overlayRect();
    spaceBtn.setAttribute('aria-expanded', 'true');
    // 必须是绝对地址：原生侧直接把它交给 NSURL/loadRequest，相对路径不会加载。
    // 弹层是独立文档，字体变量必须显式传过去，否则 Windos2026 下会掉回系统字体。
    const font = document.documentElement.style.getPropertyValue('--retro-font-family') || '';
    const fs = document.documentElement.style.getPropertyValue('--retro-font-size') || '';
    const url = location.origin + '/?overlay=space&skin=' + S.ov.skin +
      (font ? '&font=' + encodeURIComponent(font) : '') +
      (fs ? '&fs=' + encodeURIComponent(parseInt(fs, 10) || 0) : '') +
      '&state=' + encodeURIComponent(JSON.stringify(overlayState()));
    const rect = S.ov.rect;
    const res = await placeJob({
      id: S.ov.id, url: url, x: rect.x, y: rect.y, w: rect.w, h: rect.h, z: OV_Z,
    });
    if (S.destroyed) return;
    if (!res.ok) {
      // 独立弹层起不来时退回 HTML 菜单：功能不能跟着一起丢。
      S.ov.id = '';
      S.ov.rect = null;
      S.ovHtml = true;
      renderSpaceMenu();
      spaceMenu.hidden = false;
      placePop(spaceMenu);
      openOverlay();
      return;
    }
    call('POST', 'surface.focus', { id: S.ov.id }).catch(() => { /* 视图已销毁 */ });
    syncPoll();
    pump(1200);
  }

  function renderSpaceMenu() {
    clear(spaceMenu);
    spaceMenu.append(h('div', { class: 'br-sm-head' }, '折叠空间'));
    S.spaces.forEach((s) => {
      const active = s.id === S.space;
      spaceMenu.append(h('button', {
        class: 'br-sm-row' + (active ? ' on' : ''), type: 'button', role: 'menuitemradio',
        'aria-checked': active ? 'true' : 'false',
        onclick: () => switchSpace(s.id),
      },
        h('span', { class: 'br-sm-dot', style: 'background:' + s.color }),
        h('span', { class: 'br-sm-name' }, s.name),
        active ? h('span', { class: 'br-sm-tick' }, '✓') : null,
      ));
    });
    spaceMenu.append(h('div', { class: 'br-mi-sep', role: 'separator' }));

    const createInput = h('input', {
      class: 'br-sm-input', type: 'text', maxlength: '24', placeholder: '新空间名称',
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); createSpace(createInput.value); } },
    });
    spaceMenu.append(h('div', { class: 'br-sm-create' },
      createInput,
      h('button', { class: 'br-sm-add', type: 'button', onclick: () => createSpace(createInput.value) }, '创建')));

    const s = curSpace();
    if (S.spaceConfirm) {
      spaceMenu.append(h('div', { class: 'br-sm-confirm' },
        h('span', { class: 'br-sm-warn' }, '删除「' + (s ? s.name : '') + '」？'),
        h('button', {
          class: 'br-sm-danger', type: 'button',
          onclick: () => deleteSpace(),
        }, '删除'),
        h('button', {
          class: 'br-sm-cancel', type: 'button',
          onclick: () => { S.spaceConfirm = false; renderSpaceMenu(); },
        }, '取消')));
    } else {
      // 只剩一个空间时不给删除入口：删除总是把用户送回另一个存在的空间。
      spaceMenu.append(h('div', { class: 'br-sm-actions' },
        h('button', { class: 'br-sm-action', type: 'button', onclick: () => beginRename(s) }, '重命名'),
        S.spaces.length > 1
          ? h('button', {
            class: 'br-sm-action', type: 'button',
            onclick: () => { S.spaceConfirm = true; renderSpaceMenu(); },
          }, '删除')
          : null));
    }
  }

  function beginRename(s) {
    if (!s) return;
    const input = h('input', { class: 'br-sm-input', type: 'text', maxlength: '24', value: s.name });
    const row = h('div', { class: 'br-sm-create' },
      input,
      h('button', {
        class: 'br-sm-add', type: 'button',
        onclick: () => {
          const name = input.value.trim();
          if (!name) return;
          s.name = name.slice(0, 24);
          writeSpaces();
          paintSpaceBtn();
          renderSpaceMenu();
        },
      }, '保存'));
    const first = spaceMenu.querySelector('.br-sm-create');
    if (first) first.replaceWith(row); else spaceMenu.append(row);
    input.focus();
    input.select();
  }

  function createSpace(rawName) {
    const name = (rawName || '').trim() || ('折叠空间 ' + (S.spaces.length + 1));
    const sp = normalizeSpace({
      id: 'space-' + Date.now().toString(36),
      name,
      color: SPACE_COLORS[S.spaces.length % SPACE_COLORS.length],
      bookmarks: [],
    }, S.spaces.length);
    S.spaces.push(sp);
    writeSpaces();
    switchSpace(sp.id);
  }

  function activateSpaceTab() {
    const list = spaceTabs();
    let target = null;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].id === S.spaceActive[S.space]) target = list[i];
    }
    if (!target && list.length) target = list[list.length - 1];
    if (!target) { newTab(START); return; }
    S.active = target.id;
    S.lastRect = null;
    renderTabs();
    syncBar();
    if (target.url === START) { showNote(''); clearFreeze(); }
    else { syncVisible(true); pump(500); }
  }

  function switchSpace(id) {
    if (id === S.space) { closeSpaceMenu(); return; }
    const prev = activeTab();
    if (prev) {
      hide(prev);
      S.spaceActive[S.space] = prev.id;
    }
    closeSpaceMenu();
    S.space = id;
    writeSpaces();
    S.lastRect = null;
    activateSpaceTab();
  }

  function deleteSpace() {
    if (S.spaces.length <= 1) return;
    const s = curSpace();
    if (!s) return;
    // 空间里的标签和原生页面一起回收，避免留下看不见的 Surface。
    S.tabs.filter((t) => t.space === s.id).forEach((t) => {
      call('POST', 'surface.remove', { id: t.id }).catch(() => { /* 已不存在 */ });
    });
    S.tabs = S.tabs.filter((t) => t.space !== s.id);
    delete S.spaceActive[s.id];
    S.spaces = S.spaces.filter((x) => x.id !== s.id);
    S.space = S.spaces[0].id;
    writeSpaces();
    S.spaceConfirm = false;
    closeSpaceMenu();
    S.lastRect = null;
    activateSpaceTab();
  }

  /* ------------------------------ 标签收件口 ------------------------------ */

  function closeTabsMenu() {
    if (!S.tabsMenuOpen) return;
    S.tabsMenuOpen = false;
    tabsMenu.hidden = true;
    closeOverlay();
  }

  function openTabsMenu() {
    if (S.tabsMenuOpen) { closeTabsMenu(); return; }
    closeMenu();
    closeSpaceMenu();
    closePanel();
    S.tabsMenuOpen = true;
    renderTabsMenu('');
    tabsMenu.hidden = false;
    placePop(tabsMenu);
    openOverlay();
  }

  function renderTabsMenu(query) {
    clear(tabsMenu);
    const search = h('input', {
      class: 'br-tm-search', type: 'search', placeholder: '搜索标签页', autocomplete: 'off',
      value: query || '',
      oninput: () => renderTabsMenu(search.value),
      onkeydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = tabsMenu.querySelector('.br-tm-row');
          if (first) first.click();
        }
      },
    });
    tabsMenu.append(search);
    const q = (query || '').trim().toLowerCase();
    const items = spaceTabs().filter((t) => {
      if (!q) return true;
      return ((t.title || '') + ' ' + (t.url || '')).toLowerCase().indexOf(q) >= 0;
    });
    const list = h('div', { class: 'br-tm-list' });
    if (!items.length) list.append(h('div', { class: 'br-tm-empty' }, '没有匹配的标签页'));
    items.forEach((tab) => {
      const active = tab.id === S.active;
      list.append(h('div', {
        class: 'br-tm-row' + (active ? ' on' : ''), role: 'menuitem', tabindex: '0',
        onclick: () => { closeTabsMenu(); switchTab(tab.id); },
      },
        h('span', { class: 'br-tm-title' }, tab.title || shortURL(tab.url)),
        h('button', {
          class: 'br-tm-close', type: 'button', title: '关闭标签页',
          onclick: (e) => {
            e.stopPropagation();
            closeTab(tab.id);
            renderTabsMenu(search.value);
          },
        }, '×')));
    });
    tabsMenu.append(list);
    // 重渲染后把焦点交还搜索框，连续输入不会断。
    if (S.tabsMenuOpen) {
      search.focus();
      try { search.setSelectionRange(search.value.length, search.value.length); } catch (e) { /* 已失焦 */ }
    }
  }

  function closePanel() {
    if (!S.panel) return;
    S.panel = '';
    panel.hidden = true;
    closeOverlay();
  }

  function openPanel(kind) {
    closeMenu();
    closeSpaceMenu();
    closeTabsMenu();
    if (S.panel === kind) { closePanel(); return; }
    if (!S.panel) openOverlay();
    S.panel = kind;
    panel.hidden = false;
    renderPanel();
  }

  function panelHeader(title, actions) {
    return h('header', { class: 'br-panel-head' },
      h('b', {}, title),
      h('span', { class: 'br-panel-actions' },
        (actions || []).map((a) => h('button', { class: 'br-btn', type: 'button', onclick: a[1] }, a[0])),
        h('button', { class: 'br-btn', type: 'button', title: '关闭', onclick: closePanel }, '×')));
  }

  function emptyRow(text) {
    return h('p', { class: 'br-panel-empty' }, text);
  }

  function renderPanel() {
    clear(panelCard);
    if (S.panel === 'bookmarks') return renderBookmarksPanel();
    if (S.panel === 'history') return renderHistoryPanel();
    if (S.panel === 'downloads') return renderDownloadsPanel();
    if (S.panel === 'extensions') return renderExtensionsPanel();
    if (S.panel === 'settings') return renderSettingsPanel();
  }

  function renderBookmarksPanel() {
    panelCard.append(panelHeader('书签管理器', [
      ['添加当前页', () => { toggleBookmark(); renderPanel(); }],
    ]));
    const list = h('div', { class: 'br-list' });
    const marks = spaceBookmarks();
    if (!marks.length) list.append(emptyRow('这个空间还没有书签。点地址栏右侧的 ☆ 收藏当前页。'));
    marks.forEach((b) => {
      list.append(h('div', { class: 'br-item' },
        h('button', { class: 'br-item-main', type: 'button', onclick: () => { closePanel(); navigate(b.url); } },
          h('b', {}, b.title || hostOf(b.url)), h('i', {}, shortURL(b.url))),
        h('button', { class: 'br-btn br-item-del', type: 'button', title: '删除', onclick: () => removeBookmark(b.url) }, '删除'),
      ));
    });
    panelCard.append(list);
  }

  function renderHistoryPanel() {
    panelCard.append(panelHeader('历史记录', [
      ['清空', () => {
        S.history = [];
        writeJSON(K.history, S.history);
        renderPanel();
      }],
    ]));
    const list = h('div', { class: 'br-list' });
    if (!S.history.length) list.append(emptyRow('还没有浏览记录。'));
    const groups = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = today.getTime() - 86400000;
    S.history.slice(0, 200).forEach((it) => {
      const at = it.at || 0;
      const label = at >= today.getTime() ? '今天' : at >= yesterday ? '昨天' : '更早';
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label: label, items: [] });
      groups[groups.length - 1].items.push(it);
    });
    groups.forEach((g) => {
      list.append(h('div', { class: 'br-group' }, g.label));
      g.items.forEach((it) => {
        list.append(h('div', { class: 'br-item' },
          h('button', { class: 'br-item-main', type: 'button', onclick: () => { closePanel(); navigate(it.url); } },
            h('b', {}, it.title || hostOf(it.url)), h('i', {}, shortURL(it.url)))));
      });
    });
    panelCard.append(list);
  }

  function renderDownloadsPanel() {
    panelCard.append(panelHeader('下载内容', [
      ['打开文件夹', () => call('POST', 'browser.downloads.reveal').catch(() => {})],
    ]));
    const list = h('div', { class: 'br-list' });
    if (!S.downloads.length) list.append(emptyRow('还没有下载。'));
    S.downloads.forEach((d) => {
      const state = d.state === 'done' ? '已完成' : d.state === 'fail' ? '失败' : '下载中';
      list.append(h('div', { class: 'br-item' },
        h('span', { class: 'br-item-main' },
          h('b', {}, d.file || '下载'), h('i', {}, state + (d.path ? ' · ' + d.path : '')))));
    });
    panelCard.append(list);
  }

  function renderExtensionsPanel() {
    panelCard.append(panelHeader('扩展程序', [
      ['重新加载', () => reloadExtensions()],
      ['打开目录', () => call('POST', 'browser.ext.reveal').catch(() => {})],
    ]));
    const intro = h('div', { class: 'br-ext-form' },
      h('p', { class: 'br-hint' }, '支持 Chrome 格式扩展（manifest.json）。可填 32 位扩展 ID、下载的 .crx/.zip 路径，或扩展目录。'),
      h('input', { class: 'br-ext-input', type: 'text', placeholder: '扩展 ID / .crx 路径 / 目录' }),
      h('button', {
        class: 'br-btn br-ext-go', type: 'button', onclick: (e) => {
          const input = e.target.parentNode.querySelector('.br-ext-input');
          installExtension(input.value);
        },
      }, '安装'));
    panelCard.append(intro);
    const list = h('div', { class: 'br-list' });
    list.append(emptyRow('正在读取扩展…'));
    panelCard.append(list);
    call('GET', 'browser.ext.list').then((body) => {
      if (S.panel !== 'extensions') return;
      clear(list);
      const rows = body.append || [];
      const meta = body.detail || {};
      if (!rows.length) {
        list.append(emptyRow('还没有扩展。可以从 Chrome 应用商店复制扩展 ID，或安装本地 .crx。'));
      }
      rows.forEach((ext) => {
        list.append(h('div', { class: 'br-item' },
          h('span', { class: 'br-item-main' },
            h('b', {}, ext.name || ext.id),
            h('i', {}, 'v' + (ext.version || '?') + ' · manifest ' + (ext.manifestVersion || '?') + (ext.error ? ' · ' + ext.error : ''))),
          h('button', {
            class: 'br-btn br-item-del', type: 'button', title: '卸载',
            onclick: () => removeExtension(ext.id),
          }, '卸载'),
        ));
      });
      list.append(h('p', { class: 'br-hint' },
        '原生已挂载 ' + (meta.loaded || 0) + ' 个 · 目录 ' + (meta.root || '')));
    }).catch((e) => {
      clear(list);
      list.append(emptyRow('读取失败：' + e.message));
    });
  }

  function installExtension(source) {
    if (!source) return;
    const list = panelCard.querySelector('.br-list');
    if (list) { clear(list); list.append(emptyRow('正在安装…')); }
    call('POST', 'browser.ext.install', { source: source }).then(() => {
      renderPanel();
    }).catch((e) => {
      if (list) { clear(list); list.append(emptyRow('安装失败：' + e.message)); }
    });
  }

  function removeExtension(id) {
    call('POST', 'browser.ext.remove', { id: id }).then(() => renderPanel())
      .catch((e) => { if (S.panel === 'extensions') renderPanel(); });
  }

  function reloadExtensions() {
    call('POST', 'browser.ext.reload').then(() => renderPanel()).catch(() => {});
  }

  function renderSettingsPanel() {
    panelCard.append(panelHeader('设置'));
    const row = (label, node) => h('div', { class: 'br-set-row' }, h('span', {}, label), node);
    const select = h('select', { class: 'br-set-select', onchange: (e) => {
      S.settings.engine = e.target.value;
      writeJSON(K.settings, S.settings);
    } });
    Object.keys(ENGINES).forEach((id) => {
      const opt = h('option', { value: id }, ENGINES[id].name);
      if (S.settings.engine === id) opt.selected = true;
      select.append(opt);
    });
    const homeInput = h('input', { class: 'br-set-input', type: 'text', value: S.settings.home || HOME });
    homeInput.onchange = () => {
      S.settings.home = normalize(homeInput.value) || HOME;
      writeJSON(K.settings, S.settings);
    };
    const bar = h('input', { type: 'checkbox' });
    bar.checked = S.settings.bar !== false;
    bar.onchange = () => {
      S.settings.bar = bar.checked;
      writeJSON(K.settings, S.settings);
      renderBookmarks();
    };
    // 第三方内容拦截：总开关 + 按站点暂停。规则由内核编译，这里只发指令。
    const block = blockerSettings();
    const blockBox = h('input', { type: 'checkbox' });
    blockBox.checked = block.enabled !== false;
    blockBox.onchange = () => {
      setBlocker({ enabled: blockBox.checked });
      renderPanel();
    };
    const pauseHost = hostOf(activeTab() ? activeTab().url : '');
    const isPaused = (block.paused || '').split(',').some((h) => h && h === pauseHost);
    const pauseBtn = h('button', {
      class: 'br-btn', type: 'button',
      onclick: () => {
        const list = (block.paused || '').split(',').filter((h) => h && h !== pauseHost);
        if (!isPaused && pauseHost) list.push(pauseHost);
        setBlocker({ pause: list.join(',') });
        renderPanel();
      },
    }, isPaused ? '恢复本站' : '本站暂停');

    panelCard.append(
      row('默认搜索引擎', select),
      row('主页', homeInput),
      row('显示书签栏', bar),
      row('页面裁剪', clipSelect()),
      row('拦截第三方广告与追踪', blockBox),
      row('站点：' + (pauseHost || '—'), pauseBtn),
      h('p', { class: 'br-hint' }, '缩放会跟随当前标签页；书签、历史、下载与设置保存在本机。'),
    );
    if (block.state === 2) {
      // 编译失败必须说出来：不能让人以为拦截生效了。
      panelCard.append(h('p', { class: 'br-hint br-hint-warn' },
        '拦截规则编译失败：' + (block.error || '未知原因')));
    } else if (block.state === 0) {
      panelCard.append(h('p', { class: 'br-hint' }, '拦截规则尚未编译完成。'));
    }
  }

  // 三档裁剪调试开关：常开 / 仅窗口动画与缩放期间 / 关。
  // 关掉能看到原生视图的真实边界，用来判断画面出卡片是裁剪问题还是几何延迟。
  function clipSelect() {
    const select = h('select', { class: 'br-set-select', onchange: (e) => {
      S.settings.clip = e.target.value;
      writeJSON(K.settings, S.settings);
      call('POST', 'surface.clip', { mode: e.target.value }).catch(() => { /* 内核不在 */ });
    } });
    [['always', '常开'], ['motion', '仅动画期间'], ['off', '关']].forEach((pair) => {
      const opt = h('option', { value: pair[0] }, pair[1]);
      if ((S.settings.clip || 'always') === pair[0]) opt.selected = true;
      select.append(opt);
    });
    return select;
  }

  function blockerSettings() {
    const local = S.settings.blocker || {};
    const kernel = S.blocker || {};
    return {
      enabled: local.enabled !== false && kernel.enabled !== false,
      paused: local.paused || kernel.paused || '',
      state: kernel.state,
      error: kernel.error,
    };
  }

  function setBlocker(patch) {
    const next = Object.assign(blockerSettings(), patch);
    S.settings.blocker = { enabled: next.enabled, paused: next.paused };
    writeJSON(K.settings, S.settings);
    call('POST', 'surface.blocker', { enabled: next.enabled, pause: next.paused }).catch(() => {
      // 指令没送达时保持界面上的值，下次轮询会用内核状态纠正。
    });
  }

  function printPage() {
    const tab = activeTab();
    if (!tab || tab.dormant) return;
    call('POST', 'surface.print', { id: tab.id }).catch(() => {});
  }

  function devtoolsHint() {
    openPanel('settings');
    const card = panelCard;
    const tip = h('p', { class: 'br-hint' }, '开发者工具由 Safari 的 Web Inspector 提供：Safari → 开发 → 此设备 → NexlOS → 选择页面。');
    card.append(tip);
  }

  /* ------------------------------ 轮询 ------------------------------ */

  // 活跃视图预算：按物理内存定（4GB→2、8GB→4、16GB→6），由内核随状态回传。
  function budget() {
    return S.budget || MAX_LIVE;
  }

  // 保活白名单：这些标签再老也不能休眠。
  // 固定标签目前只有数据位（没有置顶入口），留着给后续 UI 用。
  function keepAlive(tab) {
    if (!tab) return true;
    if (tab.id === S.active) return true;
    if (tab.pinned) return true;
    if (tab.audible || tab.media || tab.pip) return true;
    if (tab.downloading) return true;
    if (tab.dirty && Date.now() - tab.dirtyAt < SLEEP_IDLE) return true;
    return false;
  }

  // 休眠：原生先存 interactionState + 海报，再把 WKWebView 摘掉。
  // 不是 load about:blank——那样 WebContent 进程还在，内存并不会降。
  function sleepTab(tab) {
    if (!tab || tab.dormant || !tab.placed) return;
    if (keepAlive(tab)) return;
    const width = Math.max(1, Math.round(S.lastRect ? S.lastRect.w : 900));
    tab.dormant = true;
    tab.placed = false;
    tab.sleptAt = Date.now();
    call('POST', 'surface.suspend', { id: tab.id, width: width }).then((body) => {
      const poster = (body.detail && body.detail.poster) || '';
      if (poster) tab.poster = poster;
    }).catch(() => { /* 存档失败：下次按 URL 重新加载 */ });
  }

  // 每分钟扫一遍：先按空闲时长休眠，再按预算回收最久未用的。
  function sweepTabs() {
    if (S.destroyed) return;
    const now = Date.now();
    const level = S.pressure;
    const idleLimit = level >= 1 ? SLEEP_WARN : SLEEP_IDLE;
    S.tabs.forEach((tab) => {
      if (tab.dormant || keepAlive(tab)) return;
      // 严重压力下不等空闲时长，直接回收所有可回收的标签。
      if (level >= 2 || now - (tab.usedAt || 0) > idleLimit) sleepTab(tab);
    });
    const live = S.tabs.filter((t) => !t.dormant);
    if (live.length <= budget()) return;
    live.sort((a, b) => a.usedAt - b.usedAt);
    for (let i = 0; i < live.length && live.length - i > budget(); i += 1) {
      if (keepAlive(live[i])) continue;
      sleepTab(live[i]);
    }
  }

  function injectReporter(tab) {
    const now = Date.now();
    if (tab.lastInjectAt && now - tab.lastInjectAt < 1500) return;
    tab.lastInjectAt = now;
    call('POST', 'surface.eval', { id: tab.id, js: REPORTER }).catch(() => {});
  }

  async function poll() {
    if (S.destroyed || pollBusy) return;
    pollBusy = true;
    try {
      const body = await call('GET', 'surface.status');
      const detail = body.detail || {};
      // 预算与压力每次都刷新：内存压力是边沿事件，两分钟内有效。
      if (detail.liveBudget) S.budget = detail.liveBudget;
      S.pressure = (Date.now() - (detail.pressureAt || 0) < 120000) ? (detail.pressure || 0) : 0;
      if (detail.blocker) S.blocker = detail.blocker;
      const rows = body.append || [];
      const map = {};
      for (let i = 0; i < rows.length; i++) map[rows[i].id] = rows[i];
      // 弹层是独立 Surface：它的消息不走标签那一套，单独读一次。
      if (S.ov.id) {
        const ovRow = map[S.ov.id];
        if (ovRow && ovRow.lastMessage && ovRow.lastMessage !== S.ov.raw) {
          S.ov.raw = ovRow.lastMessage;
          let data = null;
          try { data = JSON.parse(ovRow.lastMessage); } catch (e) { data = null; }
          if (data) handleOverlayMessage(data);
        }
      }
      S.tabs.forEach((tab) => {
        const row = map[tab.id];
        if (!row) {
          tab.missing = (tab.missing || 0) + 1;
          if (tab.missing >= 2 && !tab.dormant) {
            tab.missing = 0;
            tab.dormant = true;
            if (tab.id === S.active && visible()) syncVisible(true);
          } else if (tab.id === S.active && visible() && tab.url !== START &&
            Date.now() - (tab.retryAt || 0) > 1000) {
            // 页面视图还没建起来时的兜底重试，放在轮询里就不再需要常驻 rAF。
            tab.retryAt = Date.now();
            syncVisible(true);
          }
          return;
        }
        tab.missing = 0;
        if (row.ready && Date.now() - (tab.beatAt || 0) > 1500) injectReporter(tab);
        if (row.lastMessage && row.lastMessage !== tab.raw) {
          tab.raw = row.lastMessage;
          let data = null;
          try { data = JSON.parse(row.lastMessage); } catch (e) { data = null; }
          if (data && data.type === 'beat') applyBeat(tab, data);
          else if (data && data.type === 'fps') {
            tab.fps = data.fps | 0;
            tab.fpsAt = Date.now();
          } else if (data && data.type === 'find') {
            S.findMatch = !!data.match;
            findState.textContent = data.match ? '找到' : '未找到';
          } else if (data && data.type === 'download') {
            recordDownload(data);
          }
        } else if (!row.ready && tab.id === S.active && !tab.loading) {
          tab.loading = true;
          syncBar();
        }
      });
    } catch (e) {
      // 单次轮询失败保持当前画面，下一轮会自动重试。
    }
    pollBusy = false;
    pollTimer = setTimeout(poll, S.ov.id ? OV_POLL_MS : POLL_MS);
  }

  // 轮询节奏跟着弹层走：打开弹层立刻拉一次，之后用 120ms 的高频取交互结果。
  function syncPoll() {
    if (S.destroyed) return;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = 0; }
    poll();
  }

  // fps 只在需要时采：当前标签可见时每 5 秒采 1 秒，采完 rAF 就停。
  // 每个页面常驻一条 60Hz 的 rAF 只为了算帧率，是纯浪费。
  function sampleFps() {
    if (!visible() || document.visibilityState === 'hidden') return;
    const tab = activeTab();
    if (!tab || tab.dormant || tab.url === START) return;
    call('POST', 'surface.eval', { id: tab.id, js: 'window.__nexlosFps&&__nexlosFps(1000)' })
      .catch(() => { /* 页面已销毁 */ });
  }

  function scheduleFps() {
    fpsTimer = setTimeout(() => {
      if (S.destroyed) return;
      sampleFps();
      scheduleFps();
    }, FPS_MS);
  }

  // 验收钩子：手动休眠/唤醒某个标签，用来在真实 app 里验证内存回收与状态恢复。
  // 正常使用走 sweepTabs 的定时策略，这里只给验证与排障用。
  window.__brSleep = function (id) {
    const tab = id ? tabAt(id) : S.tabs.filter((t) => !t.dormant && t.id !== S.active)[0];
    if (!tab) return 'none';
    sleepTab(tab);
    return tab.id;
  };
  window.__brWake = function (id) {
    const tab = tabAt(id);
    if (!tab) return 'none';
    tab.usedAt = Date.now();
    switchTab(tab.id);
    return tab.id;
  };
  // 验收钩子：关标签（同时把原生视图一起移除），用于批量测量后清理现场。
  window.__brClose = function (id) {
    const tab = tabAt(id);
    if (!tab) return 'none';
    closeTab(tab.id);
    return tab.id;
  };

  // 验收探针：place 计数 / 每秒 place 次数 / 活跃标签 fps / 各标签休眠状态。
  // 只读，不写 DOM；通过 shell.eval 或注入调试层读出来。
  window.__brStats = function () {
    const tab = activeTab();
    return {
      place: S.placeTotal,
      rate: placeRate(),
      fps: tab ? (tab.fps || 0) : 0,
      overlay: S.ov.id || '',
      budget: budget(), pressure: S.pressure, loadMs: tab ? (tab.loadMs || 0) : 0,
      keep: S.tabs.filter((t) => keepAlive(t)).length,
      gap: (function () {
        const at = S.placeAt;
        let min = 0;
        for (let i = 1; i < at.length; i += 1) {
          const d = at[i] - at[i - 1];
          if (!min || d < min) min = d;
        }
        return min;
      })(),
      tabs: S.tabs.map((t) => t.id + ':' + (t.dormant ? 'sleep' : 'live')),
    };
  };

  /* ------------------------------ 生命周期 ------------------------------ */

  // 外壳（扫码 / 应用内链接）把网址交进来：同一 token 只开一个标签页。
  function consumeExternal(payload) {
    if (!payload || typeof payload.url !== 'string') return;
    const url = payload.url;
    if (!/^https?:\/\//i.test(url)) return;
    const token = String(payload.token || url);
    if (token === S.pendingToken) return;
    S.pendingToken = token;
    try { sessionStorage.removeItem('nexlos.browser.pending'); } catch (e) { /* 隐私模式 */ }
    newTab(url);
  }

  function takePending() {
    let raw = '';
    try { raw = sessionStorage.getItem('nexlos.browser.pending') || ''; } catch (e) { return; }
    if (!raw) return;
    let payload = null;
    try { payload = JSON.parse(raw); } catch (e) { payload = { url: raw }; }
    consumeExternal(payload);
  }

  function onMessage(e) {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    const d = e.data;
    if (d.type === 'nexlos.browser.openUrl') {
      consumeExternal({ url: d.url, token: d.token });
      return;
    }
    if (d.type === 'nexlos.lifecycle') {
      S.activeWindow = d.state === 'active';
      if (!S.activeWindow) closeSpaceMenu(true);
      // 前台就恢复页面；退到后台/休眠一律走 parkPage：它先留一帧再收起，
      // 直接从 syncVisible 里 hide 会把窗口留成一块白底（收边/切窗的空白）。
      if (S.activeWindow) { syncVisible(true); pump(700); }
      else parkPage();
      return;
    }
    if (d.type === 'nexlos.frame') {
      // 外壳在拖窗/缩窗/开窗动画里每帧发一针：弹层和页面都要跟着走。
      // workBottom 随任务栏显隐变化，改了就立即重排一帧几何。
      if (typeof d.workBottom === 'number') S.workBottom = d.workBottom;
      pump(320);
      return;
    }
    if (d.type === 'nexlos.chrome' && d.state) {
      const hidden = !!(d.state.start || d.state.overlay);
      if (hidden === S.chromeHidden) return;
      S.chromeHidden = hidden;
      if (hidden) { closeSpaceMenu(true); parkPage(); }
      else { syncVisible(true); pump(500); }
    }
  }
  window.addEventListener('message', onMessage);

  function onKey(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) {
      if (e.key === 'Escape') {
        if (S.tabsMenuOpen) { closeTabsMenu(); e.preventDefault(); }
        else if (S.spaceMenuOpen) { closeSpaceMenu(); e.preventDefault(); }
        else if (S.menuOpen) { closeMenu(); e.preventDefault(); }
        else if (S.panel) { closePanel(); e.preventDefault(); }
        else if (S.findOpen) { closeFind(); e.preventDefault(); }
      }
      return;
    }
    const key = (e.key || '').toLowerCase();
    if (e.shiftKey && key === 'a') { e.preventDefault(); openTabsMenu(); }
    else if (key === 'l') { e.preventDefault(); addr.focus(); addr.select(); }
    else if (key === 't') { e.preventDefault(); newTab(START); }
    else if (key === 'w') { e.preventDefault(); closeTab(S.active); }
    else if (key === 'r') { e.preventDefault(); reload(); }
    else if (key === 'f') { e.preventDefault(); openFind(); }
    else if (key === 'd') { e.preventDefault(); toggleBookmark(); }
    else if (key === 'p') { e.preventDefault(); printPage(); }
    else if (key === '+' || key === '=') { e.preventDefault(); zoomStep(1); }
    else if (key === '-') { e.preventDefault(); zoomStep(-1); }
    else if (key === '0') { e.preventDefault(); setZoom(1); }
  }
  window.addEventListener('keydown', onKey);

  // 窗口模式：应用是异步挂载的，外壳在 iframe load 时发的那次生命周期可能早于
  // 这里的监听器注册。主动向父层要一次当前状态，否则 S.activeWindow 一直是 false，
  // 浏览器会停在「正在打开」且永远不创建原生 Surface。
  if (window.frameElement) {
    try { window.parent.postMessage({ type: 'nexlos.wantLifecycle' }, '*'); } catch (e) { /* 顶层视图 */ }
  }

  function cleanup() {
    // 弹层也是原生视图：窗口关闭时一起收掉，别留一个挂在窗口上的孤儿。
    if (S.ov.id) {
      try {
        call('POST', 'surface.remove', { id: S.ov.id }).catch(() => { /* 已不存在 */ });
      } catch (e) { /* 卸载阶段只能尽力 */ }
      S.ov.id = '';
    }
    S.tabs.forEach((tab) => {
      try {
        const data = JSON.stringify({ id: tab.id });
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/c/surface.remove', new Blob([data], { type: 'application/json' }));
        } else {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/c/surface.remove', false);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(data);
        }
      } catch (e) { /* 页面卸载阶段只能尽力 */ }
    });
  }
  window.addEventListener('pagehide', cleanup, true);

  /* ------------------------------ 启动 ------------------------------ */

  renderBookmarks();
  // 空间入口和溢出收件口依赖布局宽度，启动时先画一次，再等一帧按真实尺寸校正。
  paintSpaceBtn();
  syncTabsMore();
  requestAnimationFrame(() => { if (!S.destroyed) syncTabsMore(); });
  // 外壳在打开应用前写入的网址优先于主页（同一 token 的后续消息会被去重）。
  takePending();
  // 启动页直接进中文必应；没有待打开网址时才建这个初始标签。
  if (!S.tabs.length) newTab(HOME, { silent: true });
  pollTimer = setTimeout(poll, POLL_MS);
  // 几何追帧只在意几何变化的时间窗里跑；空闲时没有任何常驻 rAF。
  window.addEventListener('resize', () => pump(600));
  pump(600);
  scheduleFps();
  // 上次选的裁剪档位跟着设置走：会话里的原生层状态不会自己保留。
  if (S.settings.clip) call('POST', 'surface.clip', { mode: S.settings.clip }).catch(() => { /* 内核不在 */ });
  timers.push(setInterval(sweepTabs, 60 * 1000));
  timers.push(setInterval(() => {
    if (S.destroyed || !visible()) return;
    const tab = activeTab();
    if (!tab) return;
    tab.usedAt = Date.now();
  }, 5000));

  return {
    destroy() {
      S.destroyed = true;
      if (pumpHandle) cancelAnimationFrame(pumpHandle);
      if (pollTimer) clearTimeout(pollTimer);
      if (fpsTimer) clearTimeout(fpsTimer);
      if (placeTimer) clearTimeout(placeTimer);
      timers.forEach((t) => clearInterval(t));
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKey);
      if (window.__nexlosWarm === warmSurface) window.__nexlosWarm = null;
      window.removeEventListener('pagehide', cleanup, true);
      cleanup();
      clear(host);
    },
  };
}
