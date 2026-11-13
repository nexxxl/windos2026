/* Plugin-edition Nexl browser.
 *
 * Sites such as GitHub send X-Frame-Options: deny / frame-ancestors 'none', so
 * the old iframe fallback can never work. The Host now owns a real Chromium
 * through CDP (browser-bridge.js) and this component renders that page as a
 * frame stream. User input and the DSH agent share the same live page.
 */
import { h, clear } from '/a/can.js';
import { initAppearance } from '/a/appearance.js';

const SEARCH_ENGINES = {
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
  baidu: { label: '百度', url: 'https://www.baidu.com/s?wd=' },
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  duck: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
};
const SEARCH_KEY = 'nexlos.browser.search';
const HOME = 'https://github.com/';

function looksLikeUrl(value) {
  const text = String(value || '').trim();
  if (text === '') return '';
  if (/^https?:\/\//iu.test(text)) return text;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/u.test(text)) return 'https://' + text;
  return '';
}

export function mountNexlBrowser(host) {
  // Inherit Windos2026/NEXL skin inside the app iframe, not just the shell.
  initAppearance();
  if (!document.querySelector('link[data-nexlos-browser-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/nexlos/browser.css';
    link.setAttribute('data-nexlos-browser-css', 'css');
    document.head.append(link);
  }

  if (!document.querySelector('style[data-nexlos-browser-simple]')) {
    const style = document.createElement('style');
    style.setAttribute('data-nexlos-browser-simple', '1');
    style.textContent = `
      .nxwb-human { position:absolute; inset:0; background:#fff; z-index:2; }
      .nxwb-human-frame { width:100%; height:100%; border:0; display:block; background:#fff; }
      .nxwb-human-notice { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:32px; background:#111318; color:#e8e6e3; text-align:center; z-index:3; }
      .nxwb-human-notice h3 { margin:0; font-size:20px; }
      .nxwb-human-notice p { margin:0; max-width:560px; color:#aaa; line-height:1.6; }
      .nxwb-human-actions { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
      .nxwb-human-actions button { border:1px solid #3a3f4a; background:#1c1f26; color:#e8e6e3; border-radius:10px; padding:9px 14px; cursor:pointer; }
      .nxwb-human-actions button.is-primary { background:#e8e6e3; color:#111; border-color:#e8e6e3; }
      .nxwb-human-welcome { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; background:#0f1115; color:#ddd; text-align:center; padding:30px; z-index:4; }
      .nxwb-human-welcome h3 { margin:0; font-size:22px; }
      .nxwb-human-welcome p { margin:0; max-width:560px; color:#9aa3af; line-height:1.6; }
      .nxwb-agent { position:absolute; inset:0; padding:22px; overflow:auto; background:#0f1115; color:#ddd; z-index:2; }
      .nxwb-agent h3 { margin:0 0 10px; }
      .nxwb-agent pre { white-space:pre-wrap; font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; color:#b9c2cf; }
      .nxwb-agent-url { display:block; margin:4px 0 12px; color:#8fd3ff; font:12px/1.5 ui-monospace,Menlo,monospace; word-break:break-all; text-decoration:underline; cursor:pointer; }
      .nxwb-agent-links { margin:10px 0 16px; padding:10px 12px; border:1px solid #2b3038; border-radius:10px; background:#14171d; }
      .nxwb-agent-links h4 { margin:0 0 8px; font-size:12px; color:#9aa3af; font-weight:600; }
      .nxwb-agent-links a { display:block; padding:5px 0; color:#8fd3ff; font:12px/1.5 -apple-system,sans-serif; text-decoration:none; border-bottom:1px solid #1f242c; }
      .nxwb-agent-links a:last-child { border-bottom:0; }
      .nxwb-agent-links a:hover { color:#c8ecff; text-decoration:underline; }
      .nxwb-agent-links span { color:#6f7a88; font-size:11px; margin-left:6px; }
      .nxwb-mode { border:1px solid #3a3f4a; background:transparent; color:#aaa; border-radius:8px; padding:5px 9px; cursor:pointer; font-size:12px; }
      .nxwb-mode.is-on { background:#e8e6e3; color:#111; border-color:#e8e6e3; }
    `;
    document.head.append(style);
  }

  const state = {
    mode: 'human',
    humanEmbed: true,
    humanUrl: '',
    history: [],
    at: -1,
    url: '',
    title: '',
    engine: '',
    available: null,
    running: false,
    started: false,
    stream: null,
    retryTimer: 0,
    blobUrl: '',
    composing: false,
    lastMove: 0,
    lastWheel: 0,
    frameW: 1280,
    frameH: 800,
    viewportTimer: 0,
    dpr: Math.min(2, window.devicePixelRatio || 1),
    search: 'bing',
    navTimer: 0,
    provider: 'sidecar',
    attached: false,
    attachUrl: 'http://127.0.0.1:9222',
    profile: 'default',
    contextOpen: false,
    context: null,
    contextBusy: false,
    navigating: false,
    hostVisible: false,
    nativeActive: false,
    nativeMode: '',
    nativeToken: '',
    h264: null,
    preferH264: false,
    mjpeg: null,
    nativeTimer: 0,
    nativePc: null,
    semanticTimer: 0,
    lastSemantic: '',
  };
  try { state.search = localStorage.getItem(SEARCH_KEY) || 'bing'; } catch (_error) { /* ignore */ }

  function embedCacheKey(url) { try { return 'nexlos.browser.embed.' + new URL(url).host } catch (_error) { return '' } }
  function readEmbedCache(url) {
    const key = embedCacheKey(url);
    if (!key) return null;
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value && Date.now() - value.at < 10 * 60 * 1000 ? value.value : null; } catch (_error) { return null; }
  }
  function writeEmbedCache(url, value) {
    const key = embedCacheKey(url);
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch (_error) { /* quota */ }
  }
  async function checkEmbed(url) {
    const cached = readEmbedCache(url);
    if (cached) return { ...cached, cached: true };
    const response = await fetch('/nexlos/browser/embed-check', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
    });
    const value = await response.json().catch(() => ({}));
    writeEmbedCache(url, value);
    return value;
  }
  let embedPrefetchTimer = 0;
  function prefetchEmbed() {
    if (embedPrefetchTimer) clearTimeout(embedPrefetchTimer);
    embedPrefetchTimer = window.setTimeout(() => {
      const url = looksLikeUrl(addr.value);
      if (url) void checkEmbed(url).catch(() => {});
    }, 450);
  }

  const addr = h('input', {
    class: 'nxwb-addr', type: 'text', spellcheck: 'false', autocomplete: 'off',
    placeholder: '输入网址或 GitHub 搜索；回车打开',
    onkeydown: (event) => {
      if (event.key === 'Enter') { event.preventDefault(); void navigate(addr.value); }
      if (event.key === 'Escape') addr.blur();
    },
  });
  addr.addEventListener('input', prefetchEmbed);
  const back = h('button', { class: 'nxwb-btn', type: 'button', title: '后退', 'aria-label': '后退', disabled: true, onclick: () => void hop(-1) }, '‹');
  const forward = h('button', { class: 'nxwb-btn', type: 'button', title: '前进', 'aria-label': '前进', disabled: true, onclick: () => void hop(1) }, '›');
  const reload = h('button', {
    class: 'nxwb-btn', type: 'button', title: '刷新', 'aria-label': '刷新',
    onclick: () => void reloadPage(),
  }, '⟳');
  const go = h('button', { class: 'nxwb-go', type: 'button', onclick: () => void navigate(addr.value) }, '前往');
  const stopBtn = h('button', {
    class: 'nxwb-btn is-stop', type: 'button', title: '停止加载', 'aria-label': '停止加载', hidden: true,
    onclick: () => void stopLoading(),
  }, '×');
  const search = h('select', {
    class: 'nxwb-search', title: '搜索 provider',
    onchange: () => {
      state.search = search.value;
      try { localStorage.setItem(SEARCH_KEY, state.search); } catch (_error) { /* ignore */ }
      setStatus('搜索使用 ' + (SEARCH_ENGINES[state.search] || SEARCH_ENGINES.bing).label, '');
    },
  }, Object.keys(SEARCH_ENGINES).map(key => h('option', { value: key }, SEARCH_ENGINES[key].label)));
  search.value = state.search;
  const profiles = h('select', {
    class: 'nxwb-profile', title: '浏览器空间/身份（独立 cookie 与历史）',
    onchange: () => void switchProfile(profiles.value),
  }, ['default', 'work', 'research'].map(key => h('option', { value: key }, key === 'default' ? '默认' : (key === 'work' ? '工作' : '研究'))));
  profiles.value = state.profile;
  const external = h('button', {
    class: 'nxwb-external', type: 'button', title: '在系统浏览器打开',
    onclick: () => openExternal(),
  }, '系统浏览器 ↗');
  const status = h('span', { class: 'nxwb-status' }, '原生浏览器 · 正在检查 Chromium');
  const dot = h('span', { class: 'nxwb-dot' });

  const contextBtn = h('button', {
    class: 'nxwb-context-btn', type: 'button', title: 'DSH 上下文舱', 'aria-label': 'DSH 上下文舱',
    onclick: () => toggleContext(),
  }, '✦');
  const contextTitle = h('b', { class: 'nxwb-context-title' }, 'DSH 上下文舱');
  const contextDomain = h('span', { class: 'nxwb-context-domain' }, '打开一个页面');
  const contextSelection = h('div', { class: 'nxwb-context-selection' }, '选中网页文字后，可摘录或交给 DSH。');
  const contextQuestion = h('textarea', {
    class: 'nxwb-context-input', rows: '3', placeholder: '问 DSH：这个页面值不值得读？关键结论是什么？',
    onkeydown: (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void askBrowser(); }
    },
  });
  const contextStatus = h('div', { class: 'nxwb-context-status' }, '未读取页面');
  const contextPanel = h('aside', { class: 'nxwb-context', hidden: true },
    h('header', { class: 'nxwb-context-head' },
      h('div', { class: 'nxwb-context-heading' }, contextTitle, contextDomain),
      h('button', { class: 'nxwb-context-close', type: 'button', title: '关闭', 'aria-label': '关闭', onclick: () => toggleContext(false) }, '×'),
    ),
    h('div', { class: 'nxwb-context-actions' },
      h('button', { type: 'button', class: 'nxwb-context-action', onclick: () => void refreshContext() }, '读取选区'),
      h('button', { type: 'button', class: 'nxwb-context-action', onclick: () => void askBrowser('请总结当前页面，列出关键结论、值得继续阅读的部分和下一步可执行动作。') }, '总结此页'),
      h('button', { type: 'button', class: 'nxwb-context-action', onclick: () => void saveBrowserNote() }, '摘录到记忆'),
    ),
    contextSelection,
    contextQuestion,
    h('div', { class: 'nxwb-context-footer' },
      h('button', { type: 'button', class: 'nxwb-context-send', onclick: () => void askBrowser() }, '交给 DSH'),
      h('span', { class: 'nxwb-context-cmd' }, '⌘/Ctrl + Enter'),
    ),
    contextStatus,
  );

  const perf = (window.__nxPerf = window.__nxPerf || { startedAt: Date.now(), frames: 0, bytes: 0, intervals: [], inputAt: 0, latencies: [], lastFrameAt: 0 });
  const image = h('img', { class: 'nxwb-screen', alt: '原生浏览器画面', draggable: 'false' });
  const nativeVideo = h('video', { class: 'nxwb-native', autoplay: true, playsinline: true, muted: true, hidden: true });
  const h264Video = h('video', { class: 'nxwb-h264', autoplay: true, playsinline: true, muted: true, hidden: true });
  const loadingText = h('div', { class: 'nxwb-loading-text' }, '正在启动 Chromium…');
  const loading = h('div', { class: 'nxwb-loading' }, h('span', { class: 'nxwb-spinner' }), loadingText);
  const hint = h('div', { class: 'nxwb-hint' }, '点击画面聚焦，然后直接输入 · 本地 Chromium 渲染');
  const view = h('div', {
    class: 'nxwb-view', tabindex: '0', hidden: true,
    onmousedown: () => view.focus(),
  }, image, nativeVideo, h264Video, loading, hint);
  const start = h('div', { class: 'nxwb-start' });
  const humanFrame = h('iframe', {
    class: 'nxwb-human-frame',
    title: '人类浏览',
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals',
    allow: 'clipboard-read; clipboard-write; fullscreen; autoplay',
    referrerpolicy: 'no-referrer',
    onload: () => {
      if (state.embedTimer) { clearTimeout(state.embedTimer); state.embedTimer = 0; }
      loading.hidden = true;
      humanNotice.hidden = true;
      setStatus((state.title || shortUrl(state.humanUrl || state.url)) + ' · 原生 iframe', '');
    },
  });
  const humanNoticeTitle = h('h3', null, '该站点不允许内嵌显示');
  const humanNoticeText = h('p', null, '请使用独立 Chrome 打开。');
  const humanWelcome = h('div', { class: 'nxwb-human-welcome' }, h('h3', null, 'Nexl 人类浏览'), h('p', null, '输入网址，优先使用原生 iframe。站点禁止内嵌或加载超时时，才使用独立 Chrome。'));
  const humanNotice = h('div', { class: 'nxwb-human-notice', hidden: true },
    humanNoticeTitle, humanNoticeText,
    h('div', { class: 'nxwb-human-actions' },
      h('button', { type: 'button', class: 'is-primary', onclick: () => void openDedicated() }, '在独立 Chrome 打开'),
      h('button', { type: 'button', onclick: () => { humanNotice.hidden = true; humanFrame.hidden = false; humanFrame.src = state.humanUrl || state.url; } }, '仍然尝试内嵌'),
    ),
  );
  const humanPane = h('div', { class: 'nxwb-human', hidden: true }, humanWelcome, humanFrame, humanNotice);
  const agentOutput = h('pre', null, '等待独立 Chrome 页面…');
  const agentUrl = h('a', { class: 'nxwb-agent-url', href: '#', title: '在独立 Chrome 打开当前 URL', onclick: (event) => { event.preventDefault(); const target = agentUrl.dataset.url; if (target) void openDedicatedUrl(target); } }, '');
  agentUrl.hidden = true;
  const agentLinks = h('div', { class: 'nxwb-agent-links', hidden: true });
  const agentPane = h('div', { class: 'nxwb-agent', hidden: true },
    h('h3', null, 'Agent 浏览器 · 语义采集'),
    agentUrl,
    agentLinks,
    agentOutput,
  );
  const humanTab = h('button', { class: 'nxwb-mode is-on', type: 'button', onclick: () => setMode('human') }, '人类浏览');
  const agentTab = h('button', { class: 'nxwb-mode', type: 'button', onclick: () => setMode('agent') }, 'Agent 采集');
  const embedToggle = h('button', { class: 'nxwb-mode is-on', type: 'button', title: '内嵌优先', onclick: () => { state.humanEmbed = !state.humanEmbed; embedToggle.classList.toggle('is-on', state.humanEmbed); setStatus(state.humanEmbed ? '内嵌优先已开启' : '直接使用独立 Chrome', ''); } }, '内嵌优先');
  const body = h('div', { class: 'nxwb-body' }, start, view, agentPane, contextPanel);
  const shell = h('div', { class: 'nxwb' },
    h('div', { class: 'nxwb-head' }, back, forward, reload, stopBtn, addr, go, contextBtn),
    h('div', { class: 'nxwb-bar' }, dot, status),
    body,
  );

  function toggleContext(force) {
    state.contextOpen = force === undefined ? !state.contextOpen : force === true;
    contextPanel.hidden = !state.contextOpen;
    contextBtn.classList.toggle('is-on', state.contextOpen);
    if (state.contextOpen) void refreshContext();
  }

  async function readRemoteContext() {
    try {
      const response = await fetch('/nexlos/browser/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'eval',
          expression: `(() => {
            const selected = window.getSelection ? String(window.getSelection().toString() || '') : '';
            const headings = [...document.querySelectorAll('h1,h2,h3')].slice(0, 16).map(el => String(el.innerText || '').replace(/\\s+/g,' ').trim()).filter(Boolean);
            return { title: document.title, url: location.href, selection: selected.slice(0, 20000), headings };
          })()`,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.ok === false) throw new Error((data && data.error) || '读取页面失败');
      const value = data.result && data.result.value;
      if (!value || typeof value !== 'object') throw new Error('页面上下文为空');
      state.context = value;
      return value;
    } catch (error) {
      state.context = null;
      throw error;
    }
  }

  async function refreshContext() {
    if (!state.contextOpen || state.contextBusy) return;
    state.contextBusy = true;
    contextStatus.textContent = '读取当前页面…';
    try {
      const value = await readRemoteContext();
      contextTitle.textContent = value.title || '未命名页面';
      try { contextDomain.textContent = new URL(value.url).hostname; } catch (_error) { contextDomain.textContent = value.url || ''; }
      contextSelection.textContent = value.selection
        ? '选区：' + value.selection.replace(/\s+/gu, ' ').slice(0, 220)
        : '没有选区。选中网页文字后可摘录，或直接总结整页。';
      contextStatus.textContent = '已读取页面上下文';
    } catch (error) {
      contextStatus.textContent = error.message || '页面上下文不可用';
    } finally {
      state.contextBusy = false;
    }
  }

  function currentUiSession() {
    try { return window.parent.localStorage.getItem('nexlos.os.cmd.session') || ''; } catch (_error) { return ''; }
  }

  async function handToDsh() {
    const target = state.humanUrl || state.url || looksLikeUrl(addr.value);
    if (!target) { setStatus('先打开一个页面，再交给 DSH', 'warn'); return; }
    setStatus('正在把页面交给 DSH…', 'warn');
    try {
      // The DSH context agent reads through its own headless browser. For an
      // embedded iframe this also gives DSH a readable page instead of an
      // opaque cross-origin frame.
      await fetch('/nexlos/browser/open', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: target }),
      });
      await askBrowser('请读取并总结当前页面。重点说明这是什么页面、关键结论、值得继续阅读的内容。');
    } catch (error) {
      setStatus('交给 DSH 失败：' + (error.message || String(error)), 'bad');
    }
  }

  async function askBrowser(defaultQuestion) {
    if (state.contextBusy) return;
    state.contextBusy = true;
    contextStatus.textContent = '正在把页面上下文交给 DSH…';
    try {
      const value = await readRemoteContext();
      const question = String(contextQuestion.value || '').trim() || defaultQuestion || '请总结当前页面。';
      const prompt = [
        '来自 NexlOS 浏览器上下文舱。',
        '请使用 nexlos_browser 工具读取当前浏览器页面，不要凭空猜测页面内容。',
        '',
        '页面：' + (value.title || '未命名'),
        'URL：' + (value.url || ''),
        value.selection ? '\n选中文本：\n' + value.selection.slice(0, 12000) : '',
        value.headings && value.headings.length ? '\n页面标题结构：\n- ' + value.headings.slice(0, 12).join('\n- ') : '',
        '',
        '问题：' + question,
      ].join('\n');
      const response = await fetch('/nexlos/browser/ask', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uiSessionId: currentUiSession(), prompt }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.ok === false) throw new Error((data && data.error) || 'DSH 没有接收上下文');
      contextStatus.textContent = '已交给 DSH · 会话 ' + String(data.sessionId || '').slice(-8);
      try {
        if (window.parent.__nxChatPopup && typeof window.parent.__nxChatPopup.open === 'function') {
          window.parent.__nxChatPopup.open({ sessionId: data.sessionId, title: '浏览器 · ' + (value.title || '页面'), canWrite: true });
        }
      } catch (_error) { /* transcript is still readable from DSH */ }
    } catch (error) {
      contextStatus.textContent = error.message || '交给 DSH 失败';
    } finally {
      state.contextBusy = false;
    }
  }

  async function saveBrowserNote() {
    if (state.contextBusy) return;
    state.contextBusy = true;
    contextStatus.textContent = '正在写入记忆树…';
    try {
      const value = state.context || await readRemoteContext();
      const response = await fetch('/nexlos/browser/note', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: value.title || '浏览器摘录',
          url: value.url || '',
          selection: value.selection || '',
          note: String(contextQuestion.value || '').trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.ok === false) throw new Error((data && data.error) || '写入记忆失败');
      contextStatus.textContent = '已写入 ' + data.path;
    } catch (error) {
      contextStatus.textContent = error.message || '写入记忆失败';
    } finally {
      state.contextBusy = false;
    }
  }

  function shortUrl(url) {
    return String(url || '').replace(/^https?:\/\//u, '').replace(/\/$/u, '');
  }

  function setNavigating(on) {
    stopBtn.hidden = !on;
  }

  async function stopLoading() {
    state.navigating = false;
    setNavigating(false);
    setStatus('已停止加载', 'warn');
    try {
      await fetch('/nexlos/browser/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
    } catch (_error) { /* browser may already be idle */ }
  }

  function setStatus(text, tone) {
    status.textContent = text;
    dot.classList.toggle('bad', tone === 'bad');
    dot.classList.toggle('warn', tone === 'warn');
  }

  function showStart() {
    view.hidden = true;
    start.hidden = false;
    pauseStream();
    void checkStatus();
  }

  function showView() {
    start.hidden = true;
    view.hidden = false;
    loading.hidden = false;
    window.setTimeout(syncViewport, 0);
  }

  function syncViewport() {
    if (view.hidden) return;
    const rect = view.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 80) return;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let quality = 86;
    try {
      const count = window.parent.document.querySelectorAll('.os-window').length;
      // More windows means more compositor pressure. Drop the browser stream
      // to 1x after four windows; restore on the next resize/navigation.
      if (count > 3) { dpr = 1; quality = 70; }
      else if (count > 2) quality = 78;
    } catch (_error) { /* parent unavailable */ }
    state.dpr = dpr;
    if (state.viewportTimer) clearTimeout(state.viewportTimer);
    state.viewportTimer = window.setTimeout(() => {
      state.viewportTimer = 0;
      void fetch('/nexlos/browser/viewport', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ width: Math.round(rect.width), height: Math.round(rect.height), dpr: state.dpr, quality }),
      }).then(response => response.json()).then(value => {
        if (value && value.width && value.height) {
          state.frameW = value.width;
          state.frameH = value.height;
        }
      }).catch(() => {});
    }, 120);
  }

  async function switchProfile(profile) {
    if (profile === state.profile) return;
    state.navigating = true;
    setNavigating(true);
    setStatus('切换浏览器空间：' + profile + '…', 'warn');
    try {
      const response = await fetch('/nexlos/browser/profile', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok || value.ok === false) throw new Error(value.error || ('HTTP ' + response.status));
      state.profile = value.profileId || profile;
      state.attached = value.attached === true;
      state.provider = value.provider || state.provider;
      if (value.url) { state.url = value.url; addr.value = value.url; }
      if (value.title) state.title = value.title;
      state.navigating = false;
      setNavigating(false);
      setStatus((value.title || '新空间') + ' · ' + (value.attached ? '宿主 Chrome' : 'Chromium'), '');
    } catch (error) {
      state.navigating = false;
      setNavigating(false);
      setStatus(error.message || '切换空间失败', 'bad');
    }
  }

  function newHostToken() {
    if (state.nativeToken) return state.nativeToken;
    state.nativeToken = 'nx' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem('nexlos.browser.hostToken', state.nativeToken); } catch (_error) { /* ignore */ }
    return state.nativeToken;
  }

  async function launchHost() {
    setStatus('正在启动/连接本机 Chrome…', 'warn');
    try {
      const response = await fetch('/nexlos/browser/host', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok || value.ok === false) throw new Error(value.error || ('HTTP ' + response.status));
      state.provider = value.provider || 'attach';
      state.attached = value.attached === true;
      state.engine = value.engine || state.engine;
      await checkStatus();
      startPage();
      setStatus(value.attached ? '宿主 Chrome · 已连接' : '宿主 Chrome · 已连接', '');
    } catch (error) {
      setStatus(error.message || '启动本机 Chrome 失败', 'bad');
      startPage();
    }
  }

  async function switchProvider(provider) {
    setStatus(provider === 'attach' ? '正在连接本机 Chrome…' : '正在切换隔离浏览器…', 'warn');
    try {
      const response = await fetch('/nexlos/browser/provider', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok || value.ok === false) throw new Error(value.error || ('HTTP ' + response.status));
      state.provider = value.provider || provider;
      state.attached = value.attached === true;
      state.engine = value.engine || state.engine;
      await checkStatus();
      startPage();
      setStatus(state.attached ? '宿主 Chrome · 已连接' : (state.engine || 'Chromium') + ' · 隔离浏览器', '');
    } catch (error) {
      setStatus(error.message || '切换浏览器失败', 'bad');
      startPage();
    }
  }

  function refreshProviderCard() {
    const stateEl = start.querySelector('.nxwb-provider-state');
    if (!stateEl) return;
    stateEl.textContent = state.attached ? '宿主 Chrome' : '隔离 Chromium';
    const hint = start.querySelector('.nxwb-provider-hint');
    if (hint) hint.textContent = state.attached
      ? '当前连接本机 Chrome 调试端口，共享这个 Chrome 的登录态和 GPU。'
      : '默认隔离浏览器；连接本机 Chrome 可复用真实登录态和视频解码。';
  }

  function startPage() {
    clear(start);
    const providerCard = h('div', { class: 'nxwb-provider-card' },
      h('div', { class: 'nxwb-provider-head' },
        h('b', null, '浏览器归属'),
        h('span', { class: 'nxwb-provider-state' }, state.attached ? '宿主 Chrome' : '隔离 Chromium'),
      ),
      h('p', { class: 'nxwb-provider-hint' },
        state.attached
          ? '当前连接本机 Chrome 调试端口，共享这个 Chrome 的登录态和 GPU。'
          : '默认隔离浏览器；连接本机 Chrome 可复用真实登录态和视频解码。'),
      h('div', { class: 'nxwb-provider-actions' },
        h('button', { type: 'button', class: 'nxwb-provider-btn', onclick: () => void switchProvider('sidecar') }, '隔离浏览器'),
        h('button', { type: 'button', class: 'nxwb-provider-btn is-primary', onclick: () => void launchHost() }, '启动/连接本机 Chrome'),
      ),
      h('code', { class: 'nxwb-provider-cmd' }, 'Chrome --remote-debugging-port=9222 --user-data-dir=~/.nx-host-chrome'),
    );
    start.append(
      h('div', { class: 'nxwb-start-mark' }, 'N'),
      h('b', { class: 'nxwb-start-title' }, 'Nexl 浏览器'),
      h('p', { class: 'nxwb-start-sub' }, '由 DSH 宿主里的 Chromium 原生渲染，不再是 iframe。GitHub、登录页、搜索引擎这些拒绝被嵌入的站点现在可以正常打开。'),
      providerCard,
      h('div', { class: 'nxwb-links' }, [
        ['GitHub', 'https://github.com/'],
        ['Wikipedia', 'https://www.wikipedia.org/'],
        ['example.com', 'https://www.example.com/'],
        ['MDN', 'https://developer.mozilla.org/'],
      ].map(([label, url]) => h('button', {
        class: 'nxwb-link', type: 'button',
        onclick: () => void navigate(url),
      }, label))),
      h('p', { class: 'nxwb-start-note' }, '这个页面由本机 Chromium 实际访问并渲染；用户输入与 DSH Agent 共用同一个页面。关闭窗口后 Chromium 仍在后台复用。'),
    );
  }

  function updateNav() {
    back.disabled = state.at <= 0;
    forward.disabled = state.at >= state.history.length - 1;
  }

  function pushHistory(url) {
    if (state.history[state.at] === url) return;
    state.history = state.history.slice(0, state.at + 1);
    state.history.push(url);
    state.at = state.history.length - 1;
    updateNav();
  }

  function disposeStream() {
    if (state.stream) {
      try { state.stream.close(); } catch (_error) { /* ignore */ }
      state.stream = null;
    }
  }

  function pauseStream() {
    disposeStream();
    disposeH264();
    disposeMjpeg();
    if (state.blobUrl) { try { URL.revokeObjectURL(state.blobUrl); } catch (_error) {} state.blobUrl = null; }
    if (state.retryTimer) { clearTimeout(state.retryTimer); state.retryTimer = 0; }
  }

  function resumeStream() {
    // Human/Agent modes do not use the legacy pixel stream. Kept as a no-op
    // so visibility/focus handlers cannot accidentally start MJPEG again.
    return;
  }

  async function checkStatus() {
    try {
      const response = await fetch('/nexlos/browser/status', { cache: 'no-store' });
      const value = await response.json();
      state.available = value.available !== false;
      state.running = value.running === true;
      state.engine = value.engine || '';
      state.provider = value.provider || state.provider;
      state.attached = value.attached === true;
      state.attachUrl = value.attachUrl || state.attachUrl;
      if (typeof value.profileId === 'string' && value.profileId !== '') state.profile = value.profileId;
      if (profiles) profiles.value = state.profile;
      refreshProviderCard();
      if (!state.available) {
        setStatus(value.hint || value.error || '未找到 Chrome / Chromium', 'bad');
        loadingText.textContent = value.hint || value.error || '未找到浏览器引擎';
      } else if (state.running) {
        if (value.title) state.title = value.title;
        if (value.url) state.url = value.url;
        if (!state.navigating) {
          setStatus((state.title || shortUrl(state.url) || (state.engine || 'Chromium')) + ' · ' + (state.attached ? '宿主 Chrome' : (state.profile && state.profile !== 'default' ? state.profile : 'Chromium')), '');
        }
      } else if (!state.navigating) {
        setStatus((state.engine || 'Chromium') + ' · 就绪', '');
      }
    } catch (_error) {
      state.available = false;
      setStatus('浏览器服务不可用', 'bad');
    }
  }

  function disposeMjpeg() {
    const m = state.mjpeg;
    if (!m) return;
    try { m.controller.abort(); } catch (_error) { /* ignore */ }
    state.mjpeg = null;
  }

  function startMjpegStream() {
    if (state.mjpeg) return;
    disposeH264();
    disposeStream();
    const controller = new AbortController();
    const handle = { controller };
    state.mjpeg = handle;
    fetch('/nexlos/browser/mjpeg', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) throw new Error('mjpeg unavailable');
        const reader = response.body.getReader();
        let pending = new Uint8Array(0);
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (state.mjpeg !== handle) break;
          const next = new Uint8Array(pending.length + chunk.value.length);
          next.set(pending, 0);
          next.set(chunk.value, pending.length);
          pending = next;
          while (pending.length >= 4) {
            const size = new DataView(pending.buffer, pending.byteOffset, 4).getUint32(0);
            if (pending.length < 4 + size) break;
            const jpeg = pending.slice(4, 4 + size);
            pending = pending.slice(4 + size);
            const now = performance.now();
            perf.frames += 1;
            perf.bytes += jpeg.length;
            if (perf.lastFrameAt) perf.intervals.push(Math.round(now - perf.lastFrameAt));
            perf.lastFrameAt = now;
            if (perf.inputAt) { perf.latencies.push(Math.round(now - perf.inputAt)); perf.inputAt = 0; }
            const blob = new Blob([jpeg], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            const old = state.blobUrl;
            state.blobUrl = url;
            image.src = url;
            if (old) setTimeout(() => { try { URL.revokeObjectURL(old); } catch (_error) {} }, 1500);
            image.hidden = false;
            loading.hidden = true;
            state.started = true;
            if (!state.navigating) setStatus((state.title || shortUrl(state.url)) + ' · 二进制流', '');
          }
        }
      })
      .catch(() => { if (state.mjpeg) { disposeMjpeg(); connectStream(); } });
  }

  function disposeH264() {
    const h = state.h264;
    if (!h) return;
    if (h.active && h.controller) { try { h.controller.abort(); } catch (_error) { /* ignore */ } }
    if (h.sb) { try { h.sb.aborted = true; } catch (_error) { /* ignore */ } }
    state.h264 = null;
  }

  function h264Pump() {
    const h = state.h264;
    if (!h || !h.sb || h.busy || h.queue.length === 0) return;
    h.busy = true;
    h.sb.appendBuffer(h.queue.shift());
  }

  function fallbackToJpeg() {
    disposeH264();
    setStatus('H.264 不可用，回退二进制流', 'warn');
    startMjpegStream();
  }

  function startH264Stream() {
    if (state.h264 && state.h264.active) return;
    if (typeof MediaSource !== 'function') { connectStream(); return; }
    disposeH264();
    const ms = new MediaSource();
    const url = URL.createObjectURL(ms);
    h264Video.src = url;
    const h = { active: true, ms, queue: [], busy: false, controller: new AbortController(), sb: null };
    state.h264 = h;
    window.__nxH264 = { open: false, status: 0, chunks: 0, bytes: 0, error: '' };
    ms.addEventListener('sourceopen', () => {
      try {
        window.__nxH264.open = true;
        const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.42E01F"');
        h.sb = sb;
        sb.addEventListener('updateend', () => { h.busy = false; h264Pump(); });
        sb.addEventListener('error', () => { if (state.h264 === h) fallbackToJpeg(); });
        fetch('/nexlos/browser/h264', { signal: h.controller.signal })
          .then(async (response) => {
            window.__nxH264.status = response.status;
            window.setTimeout(() => {
              if (state.h264 === h && (!window.__nxH264 || window.__nxH264.chunks === 0)) fallbackToJpeg();
            }, 7000);
            if (!response.ok || !response.body) throw new Error('h264 stream unavailable');
            const reader = response.body.getReader();
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) break;
              if (state.h264 !== h) break;
              window.__nxH264.chunks += 1;
              window.__nxH264.bytes += chunk.value ? chunk.value.length : 0;
              h.queue.push(chunk.value);
              h264Pump();
              if (!state.started) {
                state.started = true;
                loading.hidden = true;
                h264Video.hidden = false;
                image.hidden = true;
                setStatus((state.title || shortUrl(state.url)) + ' · H.264', '');
              }
            }
          })
          .catch((error) => { window.__nxH264.error = String(error && error.message || error); if (state.h264 === h) fallbackToJpeg(); });
      } catch (error) { window.__nxH264.error = String(error && error.message || error); if (state.h264 === h) fallbackToJpeg(); }
    });
  }

  function startStream() {
    if (state.nativeActive) return;
    // Binary MJPEG over HTTP is the reliable automatic path today. The H.264
    // path stays behind its own code until the WebCodecs transport is proven.
    startMjpegStream();
  }

  function connectStream() {
    if (view.hidden || document.hidden) return;
    if (state.mjpeg) return;
    if (state.h264 && state.h264.active) return;
    if (state.stream) return;
    if (state.available === false) {
      loading.hidden = false;
      loadingText.textContent = '未找到 Chrome / Edge / Chromium；请安装 Chrome 后重试。';
      return;
    }
    const stream = new EventSource('/nexlos/browser/stream');
    state.stream = stream;
    stream.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch (_error) { return; }
      if (message.type === 'status') {
        state.available = message.available !== false;
        state.running = message.running === true;
        if (message.engine) state.engine = message.engine;
        if (message.provider) state.provider = message.provider;
        if (message.attached !== undefined) state.attached = message.attached === true;
        if (state.available) setStatus((state.attached ? '宿主 Chrome' : '隔离浏览器') + ' · ' + (state.engine || 'Chromium'), '');
        else setStatus(message.error || message.hint || '浏览器不可用', 'bad');
      } else if (message.type === 'frame') {
        applyFrame(message);
      } else if (message.type === 'error') {
        loading.hidden = false;
        loadingText.textContent = message.error || '浏览器加载失败';
        setStatus(message.error || '浏览器加载失败', 'bad');
      }
    };
    stream.onerror = () => {
      if (state.retryTimer) return;
      setStatus('原生浏览器连接中断，正在重连…', 'warn');
      disposeStream();
      state.retryTimer = window.setTimeout(() => {
        state.retryTimer = 0;
        if (!view.hidden) connectStream();
      }, 1800);
    };
  }

  function applyFrame(message) {
    if (!message || !message.jpeg) return;
    perf.frames += 1;
    perf.bytes += message.jpeg.length;
    if (state.frameUrl !== message.url) {
      state.frameUrl = message.url || '';
      state.url = message.url || state.url;
      state.title = message.title || '';
      if (Number(message.width) > 0) state.frameW = Number(message.width);
      if (Number(message.height) > 0) state.frameH = Number(message.height);
      // state.dpr is the local authoritative value (syncViewport recomputes it)
      if (document.activeElement !== addr && state.url) addr.value = state.url;
      if (state.url && state.history[state.at] !== state.url) pushHistory(state.url);
      if (state.navTimer) { clearTimeout(state.navTimer); state.navTimer = 0; }
      setStatus((state.title || shortUrl(state.url)) + ' · ' + (state.attached ? '宿主 Chrome' : 'Chromium') + (state.dpr > 1 ? ' 2x' : ''), '');
    }
    try {
      const binary = atob(message.jpeg);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      const next = URL.createObjectURL(blob);
      const old = state.blobUrl;
      state.blobUrl = next;
      image.src = next;
      // Revoke the previous frame on a timer, never in image.onload: a new
      // frame can replace src before the previous load fires, which used to
      // leak one Blob URL per frame until the DSH renderer was OOM-killed.
      if (old) setTimeout(() => { try { URL.revokeObjectURL(old); } catch (_error) {} }, 1500);
      image.hidden = false;
      loading.hidden = true;
      state.started = true;
    } catch (_error) {
      loadingText.textContent = '浏览器画面解码失败';
    }
  }

  function setMode(mode) {
    state.mode = mode === 'agent' ? 'agent' : 'human';
    humanTab.classList.toggle('is-on', state.mode === 'human');
    agentTab.classList.toggle('is-on', state.mode === 'agent');
    humanPane.hidden = state.mode !== 'human';
    agentPane.hidden = state.mode !== 'agent';
    view.hidden = true;
    start.hidden = true;
    humanNotice.hidden = true;
    if (state.mode === 'human') {
      humanFrame.hidden = !state.humanUrl;
      humanWelcome.hidden = !!state.humanUrl;
      loading.hidden = true;
      if (state.humanUrl) {
        humanFrame.src = state.humanUrl;
        setStatus(shortUrl(state.humanUrl) + ' · 原生 iframe', '');
      } else {
        setStatus('人类浏览：输入网址，或点击“独立 Chrome”', '');
      }
    } else {
      setStatus('Agent 采集：headless Chromium，无实时画面', '');
      if (state.url) void collectAgentPage();
    }
  }

  async function openDedicatedUrl(target) {
    if (!target) return;
    setStatus('正在打开独立 Chrome…', 'warn');
    try {
      const response = await fetch('/nexlos/browser/human', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok || value.ok === false) throw new Error(value.error || ('HTTP ' + response.status));
      setStatus('已在独立 Chrome 打开 ' + shortUrl(target), '');
    } catch (error) {
      setStatus('独立 Chrome 启动失败：' + (error.message || String(error)), 'bad');
    }
  }

  function openDedicated() {
    const target = state.humanUrl || state.url || looksLikeUrl(addr.value);
    void openDedicatedUrl(target);
  }

  async function navigateHuman(value) {
    const text = String(value || '').trim();
    if (text === '') return;
    const directUrl = looksLikeUrl(text);
    const isSearch = directUrl === '';
    let url = directUrl;
    const provider = SEARCH_ENGINES[state.search] || SEARCH_ENGINES.bing;
    if (url === '') url = provider.url + encodeURIComponent(text);
    state.humanUrl = url;
    state.url = url;
    addr.value = url;
    pushHistory(url);
    start.hidden = true;
    humanPane.hidden = false;
    agentPane.hidden = true;
    view.hidden = true;
    humanWelcome.hidden = true;
    humanNotice.hidden = true;
    loading.hidden = false;
    humanFrame.hidden = true;
    loadingText.textContent = '检查嵌入策略…';
    setStatus('检查 ' + shortUrl(url) + ' 是否允许内嵌…', 'warn');
    try {
      const value = await checkEmbed(url);
      if (value.embeddable === false) {
        humanNoticeTitle.textContent = '该站点不允许内嵌显示';
        humanNoticeText.textContent = value.reason || 'X-Frame-Options / CSP 阻止 iframe。';
        humanNotice.hidden = false;
        loading.hidden = true;
        if (state.embedTimer) { clearTimeout(state.embedTimer); state.embedTimer = 0; }
        setStatus(shortUrl(url) + ' · 禁止内嵌，已自动使用独立 Chrome', 'warn');
        void openDedicatedUrl(url);
        return;
      }
      humanFrame.src = url;
      humanFrame.hidden = false;
      loading.hidden = true;
      setStatus(shortUrl(url) + ' · 原生 iframe', '');
      if (state.embedTimer) clearTimeout(state.embedTimer);
      state.embedTimer = window.setTimeout(() => {
        if (humanFrame.hidden || humanNotice.hidden === false) return;
        humanNoticeTitle.textContent = '页面内嵌加载超时';
        humanNoticeText.textContent = '该页面可能禁止 iframe，或加载过慢。建议使用独立 Chrome。';
        humanNotice.hidden = false;
        humanFrame.hidden = true;
        setStatus(shortUrl(url) + ' · 内嵌超时，已自动使用独立 Chrome', 'warn');
        void openDedicatedUrl(url);
      }, 12000);
    } catch (error) {
      // 检测失败时仍然尝试 iframe；onload 会给出最终状态。
      humanFrame.src = url;
      humanFrame.hidden = false;
      loading.hidden = true;
      setStatus(shortUrl(url) + ' · 尝试内嵌', 'warn');
    }
  }

  function renderSemantic(data) {
    if (data.url) {
      agentUrl.hidden = false;
      agentUrl.dataset.url = data.url;
      agentUrl.textContent = '↗ ' + data.url;
    } else {
      agentUrl.hidden = true;
    }
    clear(agentLinks);
    if (Array.isArray(data.links) && data.links.length) {
      agentLinks.hidden = false;
      agentLinks.append(h('h4', null, '链接（点击用独立 Chrome 跳转）'));
      for (const link of data.links.slice(0, 80)) {
        if (!link || !/^https?:\/\//u.test(String(link.href || ''))) continue;
        const label = String(link.text || '').trim() || String(link.href);
        const anchor = h('a', {
          href: '#', title: link.href,
          onclick: (event) => { event.preventDefault(); void openDedicatedUrl(link.href); },
        }, label.length > 120 ? label.slice(0, 120) + '…' : label, h('span', null, shortUrl(link.href)));
        agentLinks.append(anchor);
      }
    } else {
      agentLinks.hidden = true;
    }
    const out = [];
    out.push('AGENT VIEW · structure-first');
    out.push('NEXL-AgentView: ' + (data.nexl?.mode || 'pixel'));
    out.push('标题: ' + (data.title || '(无标题)'));
    out.push('URL: ' + (data.url || ''));
    if (data.description) out.push('描述: ' + data.description);
    if (data.readability && !data.readability.error) {
      out.push('Readability: ' + (data.readability.length || 0) + ' 字符' + (data.readability.byline ? ' · ' + data.readability.byline : ''));
    }
    if (data.bytecode && !data.bytecode.error) {
      out.push('NEXL-Bytecode: ' + (data.bytecode.nodeCount || 0) + ' nodes / ' + (data.bytecode.bytes || 0) + ' B / ' + (data.bytecode.magic || '') + (data.bytecode.digest ? ' / sha256 ' + data.bytecode.digest.slice(0, 16) + '…' : ''));
    }
    if (data.geo) {
      out.push('GEO / Extractability: ' + data.geo.score + '/100');
      if (data.geo.missing?.length) out.push('缺项: ' + data.geo.missing.join('、'));
    }
    if (data.schema?.types?.length) out.push('Schema.org: ' + data.schema.types.join(', '));
    const meta = data.metadata || {};
    if (meta.canonical) out.push('Canonical: ' + meta.canonical);
    if (meta.author) out.push('Author: ' + meta.author);
    if (meta.published) out.push('Published: ' + meta.published);
    if (data.repository) {
      const repo = data.repository;
      out.push('');
      out.push('── GitHub Repository ──');
      const langNames = Object.entries(repo.languages || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
      out.push(repo.fullName + '  ★' + repo.stars + '  ' + (repo.language || '') + '  ' + (repo.license || '') + (repo.archived ? '  [archived]' : ''));
      if (repo.description) out.push(repo.description);
      if (repo.topics?.length) out.push('topics: ' + repo.topics.join(', '));
      if (langNames.length) out.push('languages: ' + langNames.join(', '));
      if (repo.latestRelease?.tag) out.push('latest release: ' + repo.latestRelease.tag + (repo.latestRelease.publishedAt ? ' · ' + repo.latestRelease.publishedAt.slice(0, 10) : ''));
      if (repo.pushedAt) out.push('pushed: ' + repo.pushedAt.slice(0, 10) + ' · open issues: ' + (repo.openIssues || 0));
      if (repo.fileCount) out.push('files: ' + repo.fileCount + ' · dirs: ' + (repo.directories || []).slice(0, 12).join(', '));
      if (repo.manifests?.length) out.push('manifests/docs: ' + repo.manifests.slice(0, 14).join(', '));
      if (repo.installCommands?.length) { out.push('install:'); for (const cmd of repo.installCommands.slice(0, 6)) out.push('  ' + cmd); }
      if (repo.readmeOutline?.length) { out.push('README outline:'); for (const h of repo.readmeOutline.slice(0, 14)) out.push('  ' + '  '.repeat(Math.max(0, h.level - 1)) + '#' + h.level + ' ' + h.text); }
      if (repo.entryPoints?.length) out.push('entry points: ' + repo.entryPoints.slice(0, 10).join(', '));
      if (repo.codeBlocks?.length) { out.push('code examples: ' + repo.codeBlocks.length); out.push(repo.codeBlocks[0].code.slice(0, 1200)); }
      if (repo.readmeExcerpt) { out.push(''); out.push('README 摘录：'); out.push(repo.readmeExcerpt.slice(0, 2500)); }
    }
    out.push('');
    if (Array.isArray(data.nexl?.actionSpace) && data.nexl.actionSpace.length) {
      out.push('── NEXL Action Space（可执行语义）──');
      for (const node of data.nexl.actionSpace.slice(0, 80)) out.push('• ' + node.role + ': ' + (node.name || '(无名称)') + (node.actions?.length ? ' [' + node.actions.join(',') + ']' : ''));
      out.push('');
    }
    out.push('── 语义树 ──');
    if (Array.isArray(data.ax) && data.ax.length) {
      for (const node of data.ax.slice(0, 120)) out.push('• ' + node.role + ': ' + node.name);
    } else out.push('(无 ARIA 节点)');
    out.push('');
    out.push('── 标题结构 ──');
    for (const h of data.headings || []) out.push('  '.repeat(Math.max(0, Math.min(4, h.level - 1))) + '#'.repeat(h.level) + ' ' + h.text);
    out.push('');
    out.push('── 正文语料 ──');
    out.push(String(data.mainText || '').slice(0, 12000));
    if (Array.isArray(data.code) && data.code.length) {
      out.push('');
      out.push('── 代码块 ──');
      for (const code of data.code.slice(0, 12)) out.push(code.slice(0, 3000));
    }
    if (Array.isArray(data.tables) && data.tables.length) {
      out.push('');
      out.push('── 表格数据 ──');
      for (const table of data.tables.slice(0, 6)) out.push(table.map(row => row.join(' | ')).join('\n'));
    }
    agentOutput.textContent = out.join('\n');
  }

  function stopSemanticSync() {
    if (state.semanticTimer) { clearTimeout(state.semanticTimer); state.semanticTimer = 0; }
  }

  function startSemanticSync() {
    stopSemanticSync();
    const tick = async () => {
      try {
        const response = await fetch('/nexlos/browser/agent', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'human-semantic' }),
        });
        const value = await response.json().catch(() => ({}));
        if (!response.ok || value.ok === false) throw new Error(value.error || ('HTTP ' + response.status));
        const data = value.result || {};
        const contentHint = String(data.mainText || '').slice(0, 500);
        const signature = [data.url, data.title, contentHint, data.ax?.length, data.links?.length, data.nexl?.actionSpace?.length].join('|');
        if (signature !== state.lastSemantic) {
          state.lastSemantic = signature;
          renderSemantic(data);
          state.url = data.url || state.url;
          if (document.activeElement !== addr && data.url) addr.value = data.url;
          setStatus('Agent 同步人类 Chrome · ' + (data.title || shortUrl(data.url)), '');
        }
      } catch (_error) {
        if (!state.lastSemantic) agentOutput.textContent = '等待独立 Chrome 页面…';
      } finally {
        state.semanticTimer = window.setTimeout(tick, 1500);
      }
    };
    void tick();
  }

  async function collectAgentPage() {
    startSemanticSync();
  }

  async function navigateAgent(value) {
    const raw = String(value || '').trim();
    if (raw === '') return;
    let url = looksLikeUrl(raw);
    const provider = SEARCH_ENGINES[state.search] || SEARCH_ENGINES.bing;
    if (url === '') url = provider.url + encodeURIComponent(raw);
    state.url = url;
    addr.value = url;
    pushHistory(url);
    start.hidden = true;
    humanPane.hidden = true;
    agentPane.hidden = false;
    view.hidden = true;
    // A human typing into the Agent browser is, by definition, human intent:
    // open the pixel browser for them and collect semantics in parallel.
    setStatus('人类浏览 · 独立 Chrome 打开；Agent 同步采集语义', 'warn');
    void openDedicatedUrl(url);
    await collectAgentPage();
  }

  async function navigate(value) {
    if (state.mode === 'human') return navigateHuman(value);
    if (state.mode === 'agent') return navigateAgent(value);
    const text = String(value || '').trim();
    if (text === '') return;
    let url = looksLikeUrl(text);
    const provider = SEARCH_ENGINES[state.search] || SEARCH_ENGINES.bing;
    if (url === '') url = provider.url + encodeURIComponent(text);
    state.url = url;
    state.frameUrl = '';
    state.navigating = true;
    setNavigating(true);
    addr.value = url;
    pushHistory(url);
    showView();
    if (!state.nativeActive) startStream();
    if (state.nativeActive && state.nativeMode === 'extension') {
      void fetch('/nexlos/browser/bhost/ui?token=' + encodeURIComponent(state.nativeToken), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'command', payload: { type: 'open', url } }),
      }).then(() => {
        state.navigating = false;
        setNavigating(false);
        setStatus('宿主扩展 · 正在打开 ' + shortUrl(url), '');
      }).catch(() => { state.navigating = false; setNavigating(false); });
      return;
    }
    setStatus('正在打开 ' + shortUrl(url) + '…', 'warn');
    loading.hidden = false;
    loadingText.textContent = '正在打开页面…';
    connectStream();
    try {
      const response = await fetch('/nexlos/browser/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || '打开页面失败');
      if (result.url && document.activeElement !== addr) addr.value = result.url;
      state.navigating = false;
      setNavigating(false);
      if (result.title) { state.title = result.title; setStatus(result.title + ' · Chromium', ''); }
    } catch (error) {
      state.navigating = false;
      setNavigating(false);
      setStatus(error.message || '打开页面失败', 'bad');
      loading.hidden = false;
      loadingText.textContent = error.message || '打开页面失败';
    }
  }

  async function reloadPage() {
    try {
      await fetch('/nexlos/browser/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reload' }),
      });
    } catch (_error) { /* status stream reports it */ }
  }

  async function hop(delta) {
    if (delta < 0 && state.at <= 0) return;
    if (delta > 0 && state.at >= state.history.length - 1) return;
    const action = delta < 0 ? 'back' : 'forward';
    try {
      const response = await fetch('/nexlos/browser/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || '历史导航失败');
      state.at += delta;
      updateNav();
    } catch (error) {
      setStatus(error.message || '历史导航失败', 'bad');
    }
  }

  function openExternal() {
    void openDedicated();
  }

  function mapPoint(event) {
    const rect = view.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (state.nativeMode === 'rtc' && nativeVideo.videoWidth > 0) {
      state.frameW = nativeVideo.videoWidth;
      state.frameH = nativeVideo.videoHeight;
    }
    const x = (event.clientX - rect.left) * state.frameW / rect.width;
    const y = (event.clientY - rect.top) * state.frameH / rect.height;
    if (x < 0 || y < 0 || x > state.frameW || y > state.frameH) return null;
    return { x: Math.round(x), y: Math.round(y) };
  }

  async function sendInput(payload) {
    try {
      await fetch('/nexlos/browser/input', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_error) {
      setStatus('输入没有送达浏览器', 'warn');
    }
  }

  view.addEventListener('click', (event) => {
    const point = mapPoint(event);
    if (point) void sendInput({ type: 'click', ...point });
  });
  view.addEventListener('dblclick', (event) => {
    const point = mapPoint(event);
    if (point) void sendInput({ type: 'dblclick', ...point });
  });
  view.addEventListener('mousemove', (event) => {
    if (Date.now() - state.lastMove < 90) return;
    const point = mapPoint(event);
    if (!point) return;
    state.lastMove = Date.now();
    void sendInput({ type: 'mousemove', ...point });
  });
  view.addEventListener('wheel', (event) => {
    const point = mapPoint(event);
    if (!point) return;
    event.preventDefault();
    if (Date.now() - state.lastWheel < 45) return;
    state.lastWheel = Date.now();
    const unit = event.deltaMode === 1 ? 16 : 1;
    void sendInput({ type: 'wheel', ...point, deltaX: event.deltaX * unit, deltaY: event.deltaY * unit });
  }, { passive: false });
  view.addEventListener('keydown', (event) => {
    if (event.isComposing || state.composing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      const modifiers = (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
      void sendInput({ type: 'key', key: event.key, code: event.code, modifiers });
      return;
    }
    const special = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
    if (special.has(event.key)) {
      event.preventDefault();
      void sendInput({ type: 'key', key: event.key, code: event.code });
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      void sendInput({ type: 'text', text: event.key });
    }
  });
  view.addEventListener('compositionstart', () => { state.composing = true; });
  view.addEventListener('compositionend', (event) => {
    state.composing = false;
    if (event.data) void sendInput({ type: 'text', text: event.data });
  });
  view.addEventListener('paste', (event) => {
    const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
    if (text === '') return;
    event.preventDefault();
    void sendInput({ type: 'text', text });
  });

  const onResize = () => { syncViewport(); };
  window.addEventListener('resize', onResize);
  const onVisibility = () => { if (document.hidden) pauseStream(); };
  document.addEventListener('visibilitychange', onVisibility);
  let hadFocus = false;
  const focusTimer = window.setInterval(() => {
    if (!hadFocus) return;
    if (document.hasFocus()) resumeStream();
    else pauseStream();
  }, 900);
  const statusTimer = window.setInterval(() => {
    if (state.hostVisible && !document.hidden) void checkStatus();
  }, 5000);
  const streamObserver = new IntersectionObserver((entries) => {
    const visible = entries.some(entry => entry.isIntersecting);
    state.hostVisible = visible;
    if (visible) { void checkStatus(); } else pauseStream();
  }, { threshold: 0 });
  const onFocus = () => { hadFocus = true; void checkStatus(); };
  const onBlur = () => { if (hadFocus) pauseStream(); };
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  streamObserver.observe(host);
  host.append(shell);
  startPage();
  state.mode = 'agent';
  agentPane.hidden = false;
  start.hidden = true;
  setStatus('输入即人类浏览：自动打开独立 Chrome；Agent 同步采集语义', '');
  void checkStatus().then(() => {
    if (state.available === false) {
      setStatus('原生浏览器不可用：请安装 Chrome / Edge / Chromium', 'bad');
    }
  });
  void fetch('/nexlos/browser/preflight', { cache: 'no-store' }).then(r => r.json()).then((value) => {
    if (value.lowMemory) setStatus('低内存模式 · Agent 浏览器按需启动', 'warn');
  }).catch(() => {});

  return {
    destroy() {
      pauseStream();
      if (state.h264) disposeH264();
      disposeMjpeg();
      streamObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      if (state.retryTimer) clearTimeout(state.retryTimer);
      if (state.viewportTimer) clearTimeout(state.viewportTimer);
      clearInterval(statusTimer);
      clearInterval(focusTimer);
      if (state.nativeTimer) { clearInterval(state.nativeTimer); state.nativeTimer = 0; }
      if (state.semanticTimer) { clearTimeout(state.semanticTimer); state.semanticTimer = 0; }
      if (state.nativePc) { try { state.nativePc.close(); } catch (_error) { /* ignore */ } state.nativePc = null; }
      if (state.navTimer) { clearTimeout(state.navTimer); state.navTimer = 0; }
      if (state.blobUrl) { try { URL.revokeObjectURL(state.blobUrl); } catch (_error) { /* ignore */ } }
      clear(shell);
      clear(host);
    },
  };
}
