// NexlOS 扫一扫：摄像头二维码。
//
// 第一性原理：
//   1. 摄像头是“能力”，不是默认权限。只有用户点“开始”才申请，窗口一关就释放轨道。
//   2. 局域网 HTTP 不是安全上下文，getUserMedia 会被浏览器拒绝；
//      这时退回系统相机/相册（input capture），解码仍然在本地完成，不上传任何一帧。
//   3. 解码器按需加载：不打开扫码时，jsQR 不进入首屏解析。
//   4. 结果只有三种动作：打开网址、打开 NexlOS 应用、复制文本。

import { h, clear } from './can.js';
import { icon } from './icons.js';
import { onLifecycle, tellShell, haptic } from './mai.js';
import { chime } from './media.js';

const HISTORY_KEY = 'nexlos.scan.history.v1';
const SCAN_INTERVAL_MS = 120;

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(0, 8) : [];
  } catch (e) { return []; }
}

function writeHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 8))); } catch (e) { /* 隐私模式 */ }
}

function classify(text) {
  const value = String(text || '').trim();
  if (!value) return { kind: 'empty', label: '空内容', value };
  if (/^nexlos:\/\/app\//i.test(value)) {
    return { kind: 'nexlos', label: 'NexlOS 应用', value, app: value.replace(/^nexlos:\/\/app\//i, '').split(/[/?#]/)[0] };
  }
  if (/^https?:\/\//i.test(value)) return { kind: 'url', label: '网址', value };
  if (/^mailto:/i.test(value)) return { kind: 'mail', label: '邮件', value };
  if (/^tel:/i.test(value)) return { kind: 'tel', label: '电话', value };
  if (/^wifi:/i.test(value)) return { kind: 'wifi', label: 'Wi-Fi 配置', value };
  return { kind: 'text', label: '文本', value };
}

function isSecure() {
  if (window.isSecureContext) return true;
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function mountScan(host) {
  let stream = null;
  let raf = 0;
  let lastTick = 0;
  let facing = 'environment';
  let decoding = false;
  let decoder = null;
  let torchOn = false;
  let state = 'idle';
  let current = null;

  const video = h('video', {
    class: 'sc-video', playsinline: true, 'webkit-playsinline': 'true',
    muted: true, autoplay: true, 'aria-label': '摄像头画面',
  });
  const canvas = h('canvas', { class: 'sc-canvas', width: '480', height: '480', hidden: true });
  const frame = h('div', { class: 'sc-frame' }, h('i'), h('i'), h('i'), h('i'), h('span', { class: 'sc-line' }));
  const status = h('p', { class: 'sc-status' }, '准备就绪');
  const stage = h('div', { class: 'sc-stage' }, video, canvas, frame, status);

  const resultTitle = h('h2', { class: 'sc-result-title' }, '');
  const resultBody = h('p', { class: 'sc-result-body', 'data-i18n-skip': true }, '');
  const resultActs = h('div', { class: 'sc-result-acts' });
  const result = h('section', { class: 'sc-result', hidden: true }, resultTitle, resultBody, resultActs);

  const startBtn = h('button', { class: 'sc-btn primary', type: 'button', onclick: () => start() }, icon('camera'), '开始扫码');
  const stopBtn = h('button', { class: 'sc-btn', type: 'button', onclick: () => stop(true) }, icon('stop'), '停止');
  const switchBtn = h('button', { class: 'sc-btn', type: 'button', onclick: () => switchCamera() }, icon('flip'), '切换');
  const torchBtn = h('button', { class: 'sc-btn', type: 'button', hidden: true, onclick: () => toggleTorch() }, icon('torch'), '手电筒');
  const pickBtn = h('button', { class: 'sc-btn', type: 'button', onclick: () => fileInput.click() }, icon('image'), '照片识别');

  const fileInput = h('input', {
    type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
    onchange: () => { const f = fileInput.files && fileInput.files[0]; if (f) decodeFile(f); fileInput.value = ''; },
  });

  const historyEl = h('div', { class: 'sc-history' });
  const note = h('p', { class: 'sc-note' }, '');

  const security = h('div', { class: 'sc-security', hidden: true },
    h('b', {}, '这个地址不能直接开摄像头'),
    h('p', {}, '浏览器只允许 HTTPS 或 localhost 使用实时摄像头。你现在用的是局域网 HTTP，可以点“照片识别”，用系统相机拍一张二维码。'),
    h('button', { class: 'sc-btn', type: 'button', onclick: () => fileInput.click() }, icon('image'), '用系统相机拍一张'));

  const el = h('div', { class: 'sc' },
    h('header', { class: 'sc-head' },
      h('div', {}, h('p', { class: 'sc-eyebrow' }, 'NexlOS 摄像头'), h('h1', {}, '扫一扫')),
      h('span', { class: 'sc-badge', 'aria-hidden': 'true' }, 'QR')),
    stage,
    h('div', { class: 'sc-actions' }, startBtn, stopBtn, switchBtn, torchBtn, pickBtn),
    security,
    result,
    h('section', { class: 'sc-recent' }, h('div', { class: 'sc-recent-head' }, h('b', {}, '最近扫描'), h('button', { class: 'sc-clear', type: 'button', onclick: clearHistory }, '清空')), historyEl),
    note,
    fileInput);
  host.append(el);

  if (!isSecure()) security.hidden = false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    security.hidden = false;
    security.querySelector('b').textContent = '这个浏览器没有摄像头接口';
    security.querySelector('p').textContent = '仍然可以用“照片识别”扫二维码：相机会由系统接管。';
  }

  function say(text) { status.textContent = text; }

  function applyState(next) {
    state = next;
    el.dataset.state = next;
    startBtn.disabled = next === 'starting' || next === 'scanning';
    stopBtn.disabled = next === 'idle' || next === 'error';
    switchBtn.disabled = next !== 'scanning';
    pickBtn.disabled = next === 'starting';
  }
  applyState('idle');

  function ensureDecoder() {
    if (decoder) return Promise.resolve(decoder);
    return import('/a/vendor/jsQR.js').then(() => {
      // UMD 包在模块作用域里会把导出挂到 self.jsQR。
      decoder = window.jsQR;
      if (!decoder) throw new Error('解码器未加载');
      return decoder;
    });
  }

  async function start() {
    if (state === 'scanning' || state === 'starting') return;
    if (!isSecure() || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      security.hidden = false;
      say('请用照片识别');
      return;
    }
    applyState('starting');
    result.hidden = true;
    say('正在申请摄像头…');
    try {
      await ensureDecoder();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      video.srcObject = stream;
      await video.play();
      applyState('scanning');
      say('把二维码放进框内');
      detectTorch();
      schedule();
    } catch (err) {
      const name = err && err.name ? err.name : '';
      const msg = name === 'NotAllowedError' ? '摄像头权限被拒绝，可以在浏览器地址栏重新允许'
        : name === 'NotFoundError' ? '没有找到摄像头'
          : name === 'NotReadableError' ? '摄像头正被其他应用占用'
            : '摄像头启动失败：' + (err && err.message ? err.message : name || '未知错误');
      stop(false);
      applyState('error');
      say(msg);
      chime('error');
      haptic('error');
    }
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(tick);
  }

  function tick(ts) {
    raf = 0;
    if (state !== 'scanning') return;
    raf = requestAnimationFrame(tick);
    if (ts - lastTick < SCAN_INTERVAL_MS) return;
    lastTick = ts;
    if (decoding || !video.videoWidth) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const scale = Math.min(1, 480 / video.videoWidth);
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const hgt = Math.max(1, Math.round(video.videoHeight * scale));
    if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt; }
    ctx.drawImage(video, 0, 0, w, hgt);
    let image = null;
    try { image = ctx.getImageData(0, 0, w, hgt); } catch (e) { return; }
    decoding = true;
    try {
      const code = decoder(image.data, w, hgt, { inversionAttempts: 'dontInvert' });
      if (code && code.data) found(code.data);
    } catch (e) { /* 单帧解码失败不影响下一帧 */ }
    decoding = false;
  }

  function found(text) {
    if (!text) return;
    stop(false);
    chime('ok');
    haptic('open');
    try { if (navigator.vibrate) navigator.vibrate([14, 36, 14]); } catch (e) { /* 没有马达 */ }
    show(text);
  }

  function show(text) {
    const info = classify(text);
    current = info;
    result.hidden = false;
    result.dataset.kind = info.kind;
    resultTitle.textContent = info.label;
    resultBody.textContent = info.value;
    clear(resultActs);

    if (info.kind === 'url' || info.kind === 'mail' || info.kind === 'tel') {
      resultActs.append(
        h('button', { class: 'sc-btn primary', type: 'button', onclick: () => openValue(info) }, icon('link'), info.kind === 'url' ? '打开网址' : '打开'),
        h('button', { class: 'sc-btn', type: 'button', onclick: () => copy(info.value) }, icon('copy'), '复制'));
    } else if (info.kind === 'nexlos') {
      resultActs.append(
        h('button', { class: 'sc-btn primary', type: 'button', onclick: () => openValue(info) }, icon('apps'), '打开应用'),
        h('button', { class: 'sc-btn', type: 'button', onclick: () => copy(info.value) }, icon('copy'), '复制'));
    } else {
      resultActs.append(
        h('button', { class: 'sc-btn primary', type: 'button', onclick: () => copy(info.value) }, icon('copy'), '复制文本'));
      if (info.kind === 'wifi') {
        resultActs.append(h('span', { class: 'sc-warn' }, 'Wi-Fi 配置请手动输入，NexlOS 不会自动改网络。'));
      }
    }

    const list = readHistory().filter((x) => x.value !== info.value);
    list.unshift({ value: info.value, kind: info.kind, label: info.label, at: Date.now() });
    writeHistory(list);
    renderHistory();
    say('已识别 · ' + info.label);
    result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function openValue(info) {
    if (info.kind === 'nexlos') {
      tellShell('nexlos.open', { app: info.app });
      say('正在打开 ' + info.app);
      return;
    }
    if (info.kind === 'url' || info.kind === 'mail' || info.kind === 'tel') {
      // 优先交给外壳开一个新窗口；在顶层页面里才直接开标签页。
      if (window.parent && window.parent !== window) {
        tellShell('nexlos.openUrl', { url: info.value });
        return;
      }
      const win = window.open(info.value, '_blank', 'noopener');
      if (!win) copy(info.value);
    }
  }

  function copy(text) {
    function fallback() {
      const ta = h('textarea', { class: 'sc-copysrc' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try { document.execCommand('copy'); note.textContent = '已复制'; } catch (e) { note.textContent = '复制失败，请长按选择'; }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => { note.textContent = '已复制'; }, fallback);
    } else fallback();
  }

  function detectTorch() {
    torchBtn.hidden = true;
    torchOn = false;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return;
    try {
      const caps = track.getCapabilities();
      if (caps && caps.torch) torchBtn.hidden = false;
    } catch (e) { /* 部分机型不暴露能力 */ }
  }

  function toggleTorch() {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track || !track.applyConstraints) return;
    torchOn = !torchOn;
    track.applyConstraints({ advanced: [{ torch: torchOn }] }).then(() => {
      torchBtn.classList.toggle('on', torchOn);
      haptic('tap');
    }).catch(() => { torchOn = false; torchBtn.hidden = true; });
  }

  function switchCamera() {
    facing = facing === 'environment' ? 'user' : 'environment';
    video.classList.toggle('mirror', facing === 'user');
    stop(false);
    start();
  }

  function stop(showIdle) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    decoding = false;
    if (stream) {
      stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* 已停止 */ } });
      stream = null;
    }
    try { video.pause(); } catch (e) { /* 未播放 */ }
    video.srcObject = null;
    torchBtn.hidden = true;
    torchBtn.classList.remove('on');
    torchOn = false;
    if (showIdle) {
      applyState('idle');
      say('已停止 · 摄像头已释放');
      haptic('close');
    } else {
      applyState('idle');
    }
  }

  async function decodeFile(file) {
    if (!file) return;
    stop(false);
    applyState('starting');
    result.hidden = true;
    say('正在识别照片…');
    try {
      await ensureDecoder();
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('图片读不出来'));
        img.src = url;
      });
      const max = 1400;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const hgt = Math.max(1, Math.round(img.height * scale));
      canvas.width = w;
      canvas.height = hgt;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, hgt);
      URL.revokeObjectURL(url);
      const image = ctx.getImageData(0, 0, w, hgt);
      // 照片可能反色或对比度低，两种都试。
      const code = decoder(image.data, w, hgt, { inversionAttempts: 'attemptBoth' });
      if (code && code.data) {
        applyState('idle');
        found(code.data);
      } else {
        applyState('error');
        say('这张照片里没有读到二维码，换一张更清晰的');
        chime('error');
        haptic('error');
      }
    } catch (err) {
      applyState('error');
      say(err && err.message ? err.message : '照片识别失败');
      chime('error');
      haptic('error');
    }
  }

  function renderHistory() {
    clear(historyEl);
    const list = readHistory();
    if (!list.length) {
      historyEl.append(h('p', { class: 'sc-empty' }, '还没有扫描记录'));
      return;
    }
    list.forEach((item) => {
      const info = classify(item.value);
      historyEl.append(h('button', {
        class: 'sc-chip', type: 'button', title: item.value,
        onclick: () => show(item.value),
      },
      h('span', { class: 'sc-chip-kind' }, info.label),
      h('span', { class: 'sc-chip-text' }, item.value)));
    });
  }

  function clearHistory() {
    writeHistory([]);
    renderHistory();
    note.textContent = '记录已清空';
  }

  renderHistory();

  // 窗口被挂起/关闭时立刻释放摄像头，绝不把取景留在后台。
  const offLifecycle = onLifecycle((s) => {
    if (s === 'background' || s === 'hidden' || s === 'suspend') {
      if (stream) stop(false);
    }
  });
  function onPageHide() { stop(false); }
  window.addEventListener('pagehide', onPageHide);

  // 打开即申请会显得唐突；但如果用户是从“扫一扫”图标进来的，直接给一次启动。
  // 仍然需要用户手势：这里只做提示，不自动调用 getUserMedia。
  say(isSecure() ? '点“开始扫码”授权摄像头' : '当前地址不支持实时摄像头');

  return {
    destroy() {
      offLifecycle();
      window.removeEventListener('pagehide', onPageHide);
      stop(false);
    },
  };
}
