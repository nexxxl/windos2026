// 浏览器窗口：优先使用系统 WebView 原生 Surface，其它平台退回兼容引擎。
//
// 原生路径不搬运像素：滚动、视频、输入法、右键菜单都由 WebKit 处理。
// 兼容路径把页面放在常驻引擎里，内核按帧取图，窗口转发点击/滚轮/键盘；
// 两条路径共用同一套 /c/browser.* 与 /c/surface.* 命令面。
import { h, clear } from './can.js';
import { mountBrowserSurface } from './browser-surface.js';

const HOME = 'https://www.bing.com/';
const SPACE_NAME = 'Nexl浏览器';

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
      resolve(body.detail || {});
    };
    xhr.onerror = () => reject(new Error('连不上内核'));
    xhr.ontimeout = () => reject(new Error('内核响应超时'));
    xhr.send(method === 'GET' ? null : JSON.stringify(data));
  });
}

function shortURL(url) {
  if (!url) return '新标签页';
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// 冷启动时兼容引擎可能还没准备好，首条命令会拿到空结果。
// 启动阶段允许重试几次，避免用户第一眼看到「浏览器没有启动」。
async function withRetry(task, attempts) {
  let last = null;
  for (let i = 0; i < (attempts || 3); i++) {
    try {
      return await task();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw last;
}

// 兼容引擎：没有原生 Surface 时（headless / 非 macOS 构建）的回退路径。
function mountEgoBrowser(host) {
  const S = {
    space: 0, spaceName: 'Nexl浏览器', tabs: [], target: '', url: '', title: '',
    width: 0, height: 0, frameAt: 0, seq: 0, pump: '',
    busy: false, tabsBusy: false, tabsDirty: false, tabsSig: '', recovering: false, frameMiss: 0, lastRecover: 0, seqAt: 0, error: '', transport: '', version: '', ready: false,
    typing: '', composing: false, paused: false, pendingClicks: 1, loadingFrame: false,
  };
  const timers = [];
  let destroyed = false;
  let watchTimer = 0;
  let frameTimer = 0;
  let tabsTimer = 0;
  let sizeTimer = 0;
  let textTimer = 0;
  let wheelAt = 0;
  let lastClick = 0;
  let addrDirty = false;

  /* ------------------------------ DOM ------------------------------ */

  const tabsEl = h('div', { class: 'br-tabs', role: 'tablist', 'aria-label': '标签页' });
  const backBtn = h('button', { class: 'br-btn br-back', type: 'button', title: '后退', 'aria-label': '后退' }, '‹');
  const fwdBtn = h('button', { class: 'br-btn br-forward', type: 'button', title: '前进', 'aria-label': '前进' }, '›');
  const reloadBtn = h('button', { class: 'br-btn br-reload', type: 'button', title: '刷新', 'aria-label': '刷新' }, '⟳');
  const addr = h('input', {
    class: 'br-addr', type: 'text', spellcheck: 'false', autocomplete: 'off',
    'aria-label': '地址与搜索', placeholder: '输入网址或搜索词，回车打开',
    oninput: () => { addrDirty = true; },
    onblur: () => { addrDirty = false; applyTab(S.tabs.filter((t) => t.active)[0] || S.tabs[0]); },
    onkeydown: (e) => {
      if (e.key === 'Enter') { e.preventDefault(); navigate(addr.value); }
      if (e.key === 'Escape') { addr.blur(); }
    },
  });
  const goBtn = h('button', { class: 'br-btn br-go', type: 'button', title: '打开', 'aria-label': '打开' }, '前往');
  const newTabBtn = h('button', { class: 'br-btn', type: 'button', title: '新建标签页', 'aria-label': '新建标签页' }, '+');

  const shot = h('img', { class: 'br-shot', alt: '', draggable: 'false' });
  const hit = h('div', { class: 'br-hit', tabindex: '0', 'aria-label': '页面交互区' });
  const empty = h('div', { class: 'br-empty' });
  const stage = h('div', { class: 'br-stage' }, shot, hit, empty);
  const statusUrl = h('span', { class: 'br-status-url' }, '未连接');
  const statusMeta = h('span', { class: 'br-status-meta' }, '');
  const statusBar = h('div', { class: 'br-status' }, statusUrl, statusMeta);
  const compose = h('input', {
    class: 'br-compose', type: 'text', spellcheck: 'false', autocomplete: 'off',
    placeholder: '输入到页面，回车发送（先点一下页面里的输入框）',
    'aria-label': '输入到页面',
    onkeydown: (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendText(true); }
      if (e.key === 'Escape') { compose.value = ''; }
    },
  });
  const sendBtn = h('button', { class: 'br-btn', type: 'button', title: '发送文字', 'aria-label': '发送文字' }, '发送');
  const typeBar = h('div', { class: 'br-type' }, compose, sendBtn);

  const shell = h('div', { class: 'br' },
    h('div', { class: 'br-chrome' },
      tabsEl,
      h('div', { class: 'br-bar' },
        backBtn, fwdBtn, reloadBtn, addr, goBtn, newTabBtn),
    ),
    stage,
    statusBar,
    typeBar,
  );
  host.append(shell);
  empty.append(h('div', { class: 'br-empty-title' }, '正在启动浏览器…'));
  empty.hidden = false;

  backBtn.onclick = () => hop(-1);
  fwdBtn.onclick = () => hop(1);
  reloadBtn.onclick = () => reload();
  goBtn.onclick = () => navigate(addr.value);
  newTabBtn.onclick = () => newTab();
  sendBtn.onclick = () => sendText(true);

  /* ------------------------------ 状态 ------------------------------ */

  function setStatus(text, meta) {
    statusUrl.textContent = text || '';
    statusMeta.textContent = meta || '';
  }

  function showError(message) {
    S.error = message;
    clear(empty);
    empty.append(
      h('div', { class: 'br-empty-title' }, '浏览器没有启动'),
      h('div', { class: 'br-empty-body' }, message),
      h('div', { class: 'br-empty-hint' }, '当前环境没有可用的内置浏览器引擎；桌面版请从 NexlOS.app 启动。'),
      h('button', {
        class: 'br-btn br-retry', type: 'button',
        onclick: () => boot(),
      }, '重试'),
    );
    empty.hidden = false;
  }

  function clearError() {
    S.error = '';
    empty.hidden = true;
    clear(empty);
  }

  function renderTabs() {
    // 3 秒轮询会拿回同样的标签页；不比对就重画会吞掉正在进行的点击。
    const sig = S.tabs.map((t) => (t.targetId || '') + '|' + (t.title || '') + '|' + (t.url || '') + '|' + (t.active ? 1 : 0)).join('\n');
    if (sig === S.tabsSig) return;
    S.tabsSig = sig;
    clear(tabsEl);
    S.tabs.forEach((tab) => {
      const active = tab.targetId === S.target || (tab.active && !S.target);
      const chip = h('div', {
        class: 'br-tab' + (active ? ' active' : ''),
        role: 'tab',
        'aria-selected': active ? 'true' : 'false',
        title: tab.title || tab.url || '标签页',
        onclick: () => { if (!active) switchTab(tab.targetId); },
      },
        h('span', { class: 'br-tab-title' }, tab.title || shortURL(tab.url)),
        h('button', {
          class: 'br-tab-close', type: 'button', 'aria-label': '关闭标签页',
          onclick: (e) => { e.stopPropagation(); closeTab(tab.targetId); },
        }, '×'),
      );
      tabsEl.append(chip);
    });
    tabsEl.append(h('div', { class: 'br-tab-fill' }));
  }

  function applyTab(tab) {
    if (!tab) return;
    S.target = tab.targetId || S.target;
    S.url = tab.url || S.url;
    S.title = tab.title || '';
    if (S.url && !addrDirty) addr.value = S.url;
    statusUrl.textContent = S.title ? (S.title + ' — ' + shortURL(S.url)) : shortURL(S.url);
  }

  /* ------------------------------ 命令 ------------------------------ */

  async function boot() {
    if (destroyed) return;
    setStatus('正在连接浏览器引擎…');
    try {
      const status = await withRetry(() => call('GET', 'browser.status'), 3);
      S.transport = status.transport || '';
      S.version = status.version || '';
      if (!status.available) {
        throw new Error(status.error || '浏览器引擎不可用');
      }
      // 任务空间按名字在引擎里全局复用；带上实例短标识，多个 NEXLOS 进程不会串标签。
      S.spaceName = SPACE_NAME + (status.instance ? '-' + status.instance : '');
      const sp = await withRetry(() => call('POST', 'browser.space.create', { name: S.spaceName }), 3);
      S.space = sp.id;
      await refreshTabs();
      if (!S.tabs.length) {
        await newTab(pendingUrl || HOME);
        pendingUrl = '';
      } else {
        const active = S.tabs.filter((t) => t.active)[0] || S.tabs[0];
        applyTab(active);
        await startWatch();
        if (pendingUrl) {
          const url = pendingUrl;
          pendingUrl = '';
          await navigate(url);
        } else if (!S.url || S.url.indexOf('about:') === 0 || S.url.indexOf('chrome://') === 0) {
          await navigate(HOME);
        }
      }
      S.ready = true;
      clearError();
      startLoops();
      setStatus(S.title || shortURL(S.url), 'WebView' + (S.version ? ' ' + S.version : ''));
    } catch (e) {
      showError(e.message || String(e));
    }
  }

  async function refreshTabs() {
    if (!S.space) return;
    // 轮询与操作可能同时要标签：正在请求就记一笔，结束后补一次。
    if (S.tabsBusy) { S.tabsDirty = true; return; }
    S.tabsBusy = true;
    try {
      const res = await call('GET', 'browser.tabs', { space: S.space });
      S.tabs = res.tabs || [];
      const active = S.tabs.filter((t) => t.active)[0];
      if (active) applyTab(active);
      renderTabs();
    } catch (e) {
      // 引擎会回收空任务空间；关掉最后一个标签后，空间和会话都不在了。
      if (String(e.message || '').indexOf('EGO_TASK_SPACE_NOT_FOUND') >= 0) recoverSpace();
    }
    S.tabsBusy = false;
    if (S.tabsDirty) { S.tabsDirty = false; refreshTabs(); }
  }

  async function startWatch() {
    if (!S.space) return;
    const w = stage.clientWidth;
    const hgt = stage.clientHeight;
    if (!w || !hgt) return;
    S.width = w; S.height = hgt;
    // 起泵会让 seq 归零；先放低水位，避免被旧序号挡住。
    S.seq = -1;
    S.seqAt = Date.now();
    S.frameAt = 0;
    S.pump = '';
    setStatus('正在启动画面泵…');
    try {
      await call('POST', 'browser.watch', { space: S.space, width: w, height: hgt });
      S.paused = false;
      setStatus(S.title || shortURL(S.url), 'WebView' + (S.version ? ' ' + S.version : ''));
      startFrames();
    } catch (e) {
      // 没有 PTY 的平台没有画面泵，退回命令截图（约 1 fps）。
      S.paused = true;
      setStatus(S.title || shortURL(S.url), '兼容模式：截图轮询');
      startFallback();
    }
  }

  function startFrames() {
    if (frameTimer) clearInterval(frameTimer);
    S.loadingFrame = false;
    shot.onload = () => { S.frameAt = Date.now(); S.loadingFrame = false; };
    // 取帧失败（服务器重启、连接被切）时把水位清掉，下一轮重新要一张。
    shot.onerror = () => { S.loadingFrame = false; S.seq = -1; };
    frameTimer = setInterval(() => {
      if (destroyed || !S.space || document.visibilityState !== 'visible') return;
      // 上一帧还没解码完就跳过，避免在慢设备上堆请求。
      if (S.loadingFrame && Date.now() - S.frameAt < 900) return;
      // 先问序号，只有新帧才换 img.src：静止页面不再每 320ms 重解码一张 JPEG。
      const head = new XMLHttpRequest();
      head.open('HEAD', '/browser/frame?space=' + S.space + '&_=' + Date.now(), true);
      head.timeout = 4000;
      head.onload = () => {
        const pump = head.getResponseHeader('X-Frame-Pump') || '';
        if (pump && pump !== S.pump) { S.pump = pump; S.seq = -1; S.seqAt = Date.now(); }
        const seqHdr = head.getResponseHeader('X-Frame-Seq');
        if (seqHdr === null) {
          // 泵被内核或宿主回收了：连续收不到帧就重建一次，避免画面永久冻住。
          S.frameMiss = (S.frameMiss || 0) + 1;
          if (S.frameMiss >= 10 && Date.now() - (S.lastRecover || 0) > 15000) {
            S.frameMiss = 0;
            S.lastRecover = Date.now();
            startWatch();
          }
          return;
        }
        S.frameMiss = 0;
        const seq = parseInt(seqHdr || '0', 10);
        if (seq > S.seq) {
          S.seq = seq;
          S.seqAt = Date.now();
          S.loadingFrame = true;
          shot.src = '/browser/frame?space=' + S.space + '&_=' + Date.now();
        } else if (Date.now() - (S.seqAt || 0) > 12000 && Date.now() - (S.lastRecover || 0) > 15000) {
          // 序号存在但十几秒不涨：泵进程还在、截图却卡死了。
          // 这种情况 frameMiss 不会累加，必须按“序号停滞”单独恢复。
          S.lastRecover = Date.now();
          S.seqAt = Date.now();
          startWatch();
        }
        if (S.frameAt) {
          const age = Math.round((Date.now() - S.frameAt) / 100) / 10;
          statusMeta.textContent = 'WebView' + (S.version ? ' ' + S.version : '') + ' · ' + age + 's 前';
        }
      };
      head.onerror = () => { S.loadingFrame = false; };
      head.send();
    }, 320);
    timers.push(frameTimer);
  }

  function startFallback() {
    if (frameTimer) clearInterval(frameTimer);
    frameTimer = setInterval(async () => {
      if (destroyed || !S.space || document.visibilityState !== 'visible') return;
      try {
        const res = await call('GET', 'browser.screenshot', {
          space: S.space, format: 'jpeg', quality: '55',
          width: S.width, height: S.height,
        });
        if (res.data_b64) shot.src = 'data:image/jpeg;base64,' + res.data_b64;
      } catch (e) { /* 下一轮再试 */ }
    }, 1200);
    timers.push(frameTimer);
  }

  function startLoops() {
    if (tabsTimer) clearInterval(tabsTimer);
    tabsTimer = setInterval(refreshTabs, 3000);
    timers.push(tabsTimer);
    // ResizeObserver 在后台标签页里不派发（没有渲染帧）；尺寸轮询兜住这种情况，
    // 也覆盖没有 ResizeObserver 的老 WebView。
    if (sizeTimer) clearInterval(sizeTimer);
    sizeTimer = setInterval(() => {
      if (destroyed || !S.ready) return;
      const w = stage.clientWidth;
      const hgt = stage.clientHeight;
      if (w && hgt && (w !== S.width || hgt !== S.height)) startWatch();
    }, 1200);
    timers.push(sizeTimer);
  }

  async function navigate(raw) {
    const url = (raw || '').trim();
    addrDirty = false;
    if (!url || !S.space) return;
    setStatus('正在打开 ' + url);
    try {
      const res = await call('POST', 'browser.navigate', { space: S.space, url: url });
      S.url = res.url || url;
      S.title = res.title || '';
      addr.value = S.url;
      statusUrl.textContent = S.title ? (S.title + ' — ' + shortURL(S.url)) : shortURL(S.url);
      refreshTabs();
    } catch (e) {
      setStatus(e.message || '打开失败');
    }
  }

  async function hop(delta) {
    if (!S.space) return;
    try {
      const res = await call('POST', 'browser.history', { space: S.space, delta: delta });
      S.url = res.url || S.url;
      S.title = res.title || S.title;
      addr.value = S.url;
      statusUrl.textContent = S.title ? (S.title + ' — ' + shortURL(S.url)) : shortURL(S.url);
      refreshTabs();
    } catch (e) {
      setStatus(e.message || '没有更多历史');
    }
  }

  async function reload() {
    if (!S.space) return;
    try {
      await call('POST', 'browser.reload', { space: S.space });
      refreshTabs();
    } catch (e) {
      setStatus(e.message || '刷新失败');
    }
  }

  async function newTab(url) {
    if (!S.space) return;
    try {
      const tab = await call('POST', 'browser.tab.create', { space: S.space, url: url || HOME });
      S.target = tab.targetId || '';
      await refreshTabs();
      await startWatch();
    } catch (e) {
      setStatus(e.message || '新建标签页失败');
    }
  }

  async function closeTab(targetId) {
    if (!S.space || !targetId) return;
    try {
      // 最后一个标签先建后关：空任务空间会被引擎回收，窗口就再也连不上。
      if (S.tabs.length <= 1) {
        await call('POST', 'browser.tab.create', { space: S.space, url: HOME });
        await refreshTabs();
      }
      await call('POST', 'browser.tab.close', { space: S.space, targetId: targetId });
      await refreshTabs();
      if (!S.tabs.length) {
        await newTab(HOME);
      } else {
        const active = S.tabs.filter((t) => t.active)[0] || S.tabs[0];
        await call('POST', 'browser.tab.activate', { space: S.space, targetId: active.targetId });
        applyTab(active);
        await startWatch();
      }
    } catch (e) {
      setStatus(e.message || '关闭失败');
    }
  }

  // recoverSpace 在任务空间消失后重建同名空间，并把窗口带回首页。
  async function recoverSpace() {
    if (S.recovering) return;
    S.recovering = true;
    setStatus('任务空间已回收，正在重建…');
    try {
      const sp = await call('POST', 'browser.space.create', { name: S.spaceName });
      S.space = sp.id;
      S.tabs = [];
      S.target = '';
      S.url = '';
      S.title = '';
      S.tabsSig = '';
      await newTab(HOME);
    } catch (e) {
      setStatus(e.message || '重建任务空间失败');
    }
    S.recovering = false;
  }

  async function switchTab(targetId) {
    if (!S.space) return;
    try {
      await call('POST', 'browser.tab.activate', { space: S.space, targetId: targetId });
      S.target = targetId;
      await refreshTabs();
      await startWatch();
    } catch (e) {
      setStatus(e.message || '切换失败');
    }
  }

  async function sendText(enter) {
    const text = compose.value;
    if (!S.space || (!text && !enter)) return;
    compose.value = '';
    try {
      if (text) await call('POST', 'browser.type', { space: S.space, text: text, enter: enter ? '1' : '' });
      else await call('POST', 'browser.key', { space: S.space, key: 'Enter' });
    } catch (e) {
      setStatus(e.message || '输入失败');
      compose.value = text;
    }
  }

  async function sendKey(key) {
    if (!S.space) return;
    try { await call('POST', 'browser.key', { space: S.space, key: key }); }
    catch (e) { setStatus(e.message || '按键发送失败'); }
  }

  /* ------------------------------ 页面输入 ------------------------------ */

  function pointOf(e) {
    const r = hit.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - r.left) * S.width / Math.max(1, r.width)),
      y: Math.round((e.clientY - r.top) * S.height / Math.max(1, r.height)),
    };
  }

  async function cdp(method, params) {
    return call('POST', 'browser.cdp', {
      space: S.space, method: method, params: JSON.stringify(params || {}),
    });
  }

  hit.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    hit.focus();
    flushTyping();
    const p = pointOf(e);
    const now = Date.now();
    const clicks = now - lastClick < 380 ? 2 : 1;
    lastClick = now;
    S.pendingClicks = clicks;
    cdp('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: p.x, y: p.y,
      button: e.button === 2 ? 'right' : 'left', clickCount: clicks,
    }).catch(() => {});
  });

  hit.addEventListener('pointerup', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    const p = pointOf(e);
    cdp('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: p.x, y: p.y,
      button: e.button === 2 ? 'right' : 'left', clickCount: S.pendingClicks,
    }).catch(() => {});
  });

  hit.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - wheelAt < 90) return;
    wheelAt = now;
    const p = pointOf(e);
    cdp('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: p.x, y: p.y, deltaX: Math.round(e.deltaX), deltaY: Math.round(e.deltaY),
    }).catch(() => {});
  }, { passive: false });

  hit.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Tab' || e.key === 'Escape' ||
        e.key.indexOf('Arrow') === 0 || e.key === 'PageUp' || e.key === 'PageDown' ||
        e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      flushTyping();
      sendKey(e.key);
      return;
    }
    if (e.key.length === 1) {
      S.typing += e.key;
      if (textTimer) clearTimeout(textTimer);
      textTimer = setTimeout(flushTyping, 320);
      e.preventDefault();
    }
  });

  function flushTyping() {
    if (!S.typing || !S.space) { S.typing = ''; return; }
    const text = S.typing;
    S.typing = '';
    call('POST', 'browser.type', { space: S.space, text: text }).catch(() => {});
  }

  hit.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ------------------------------ 尺寸 ------------------------------ */

  function scheduleWatch() {
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      if (destroyed || !S.ready) return;
      const w = stage.clientWidth;
      const hgt = stage.clientHeight;
      if (w === S.width && hgt === S.height) return;
      startWatch();
    }, 500);
  }

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(scheduleWatch);
    ro.observe(stage);
  } else {
    window.addEventListener('resize', scheduleWatch);
  }

  /* ------------------------------ 外链投递 ------------------------------ */

  // 外壳把扫码 / 应用内链接交进来：空间未就绪先暂存，就绪后直接打开。
  let pendingToken = '';
  let pendingUrl = '';
  function consumeExternal(payload) {
    if (!payload || typeof payload.url !== 'string') return;
    const url = payload.url;
    if (!/^https?:\/\//i.test(url)) return;
    const token = String(payload.token || url);
    if (token === pendingToken) return;
    pendingToken = token;
    try { sessionStorage.removeItem('nexlos.browser.pending'); } catch (e) { /* 隐私模式 */ }
    if (!S.space) { pendingUrl = url; return; }
    navigate(url);
  }
  function takePending() {
    let raw = '';
    try { raw = sessionStorage.getItem('nexlos.browser.pending') || ''; } catch (e) { return; }
    if (!raw) return;
    let payload = null;
    try { payload = JSON.parse(raw); } catch (e) { payload = { url: raw }; }
    consumeExternal(payload);
  }
  const onExternal = (e) => {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'nexlos.browser.openUrl') consumeExternal(e.data);
  };
  window.addEventListener('message', onExternal);
  takePending();

  /* ------------------------------ 启动 ------------------------------ */

  boot();

  return {
    destroy() {
      destroyed = true;
      timers.forEach((t) => clearInterval(t));
      window.removeEventListener('message', onExternal);
      if (watchTimer) clearTimeout(watchTimer);
      if (textTimer) clearTimeout(textTimer);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', scheduleWatch);
      if (S.space) {
        // 关窗即停泵；失败也不阻塞退出。
        call('POST', 'browser.watch.stop', { space: S.space }).catch(() => {});
      }
      clear(host);
    },
  };
}

// 探测内核是否带原生 Surface（只有 macOS -tags shell 构建才有）。
function surfaceReady() {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/c/surface.status', true);
    xhr.timeout = 2500;
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch (e) { body = null; }
      resolve(!!(body && body.ok !== false && body.detail && body.detail.available));
    };
    xhr.onerror = () => resolve(false);
    xhr.ontimeout = () => resolve(false);
    xhr.send();
  });
}

// 首选原生 Surface：页面由系统合成器直接出画，滚动/视频/输入法都走原生。
// 没有原生 Surface 时退回兼容引擎，保证 headless 与其它平台仍能用。
export function mountBrowser(host) {
  let impl = null;
  let destroyed = false;
  surfaceReady().then((ok) => {
    if (destroyed) return;
    impl = ok ? mountBrowserSurface(host) : mountEgoBrowser(host);
  });
  return {
    destroy() {
      destroyed = true;
      if (impl) impl.destroy();
      else clear(host);
    },
  };
}
