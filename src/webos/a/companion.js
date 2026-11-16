import { h, api } from './can.js';
import { createCompanionRenderer } from './companion-render.js';
import { createCompanionState, STATE_LABEL } from './companion-state.js';

// 桌面伴侣外壳：加载生命包、画在桌面或刘海胶囊里、判断指针是否落在角色身上、
// 把触碰变成内稳态变化，以及接住用户拖进来的文件当场读。
//
// 生命感来自三层叠乘，而不是循环播放一张 GIF：
//   L0 自主生理：噪声呼吸 + 泊松眨眼
//   L1 环境伴随：指针视线弹簧 + 漂泊微倾
//   L2 语义情绪：内稳态 mood 决定轮廓光、色温与粒子
//
// 渲染优先 WebGL2（逐像素打光/发光/纸纹），失败时退回 Canvas2D。
// 边缘距离场在 Worker 里预处理：1024² 的图不会卡住主线程。
const POS_KEY = 'nexlos.os.companion.pos';
const READ_KEY = 'nexlos.os.companion.read.';
const BLINK_MIN = 2.2;
const BLINK_SPAN = 4.2;
const READ_TEXT_MAX = 1 << 20;
const READ_IMAGE_MAX = 16 << 20;
const TEXT_EXT = /\.(txt|md|markdown|json|jsonl|csv|tsv|log|ya?ml|toml|ini|conf|xml|html?|css|js|mjs|ts|tsx|jsx|go|py|rs|java|c|h|cpp|sh|sql|tex)$/i;
// 表演状态对应的 CSS 类：applyState 与卸载清理共用同一张表。
const STATE_CLASSES = ['thinking', 'working', 'executing', 'juggling', 'attention',
  'notification', 'error', 'yawning', 'dozing', 'sleeping', 'waking'].map(function (s) { return 'oc-st-' + s; });

function readPos() {
  try {
    const raw = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return { x: raw.x, y: raw.y };
  } catch (e) { /* 没有记录就从右下角开始 */ }
  return null;
}

function savePos(pos) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) })); } catch (e) { /* 隐私模式只影响记忆位置 */ }
}

function readLast(id) {
  if (!id) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(READ_KEY + id) || 'null');
    if (raw && typeof raw.name === 'string') return raw;
  } catch (e) { /* 坏掉的缓存当作没读过 */ }
  return null;
}

function saveLast(id, value) {
  if (!id) return;
  try {
    if (value) localStorage.setItem(READ_KEY + id, JSON.stringify(value));
    else localStorage.removeItem(READ_KEY + id);
  } catch (e) { /* 配额不足时只是不跨刷新保留 */ }
}

function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 值噪声：比正弦波少一点机械感，且不用引入任何库。
function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash01(i) * (1 - u) + hash01(i + 1) * u;
}

function moodLabel(mood) {
  if (mood === 'tired') return '困了';
  if (mood === 'lonely') return '想人陪';
  if (mood === 'attached') return '很亲近';
  return '安静';
}

export function createCompanionLayer({ mount, api: call = api, toast = () => {} } = {}) {
  const canvas = h('canvas', { class: 'oc-canvas', 'aria-hidden': 'true' });
  const frame = h('iframe', {
    class: 'oc-frame', hidden: true, title: '桌面伴侣',
    sandbox: 'allow-scripts allow-forms allow-modals', scrolling: 'no',
  });
  const surface = h('div', { class: 'oc-surface' }, canvas, frame);
  // HTML 生命包自己渲染动画：加载完成后补发一次当前状态，避免错过首帧。
  frame.addEventListener('load', function () {
    if (!manifest || !manifest.renderer || manifest.renderer.kind !== 'html' || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage({
        type: 'nexlos.companion.state',
        state: actorState,
        label: STATE_LABEL[actorState] || actorState,
      }, '*');
    } catch (e) { /* iframe 尚未就绪 */ }
  });
  const grip = h('div', { class: 'oc-grip', hidden: true, title: '拖动伴侣' });

  // 表演层：状态不靠换图，而是给同一张立绘加道具与体态。
  // 气泡、代码行、星光、Zzz 都是 DOM，不占 GPU 纹理，也不依赖生命包自带素材。
  const sparkItems = [];
  for (let i = 0; i < 7; i++) sparkItems.push(h('i'));
  const actor = h('div', { class: 'oc-actor', 'aria-hidden': 'true' },
    h('div', { class: 'oc-think' }, h('i'), h('i'), h('i')),
    h('div', { class: 'oc-work' },
      h('b'), h('b'), h('b'), h('span', { class: 'oc-caret' })),
    h('div', { class: 'oc-spark' }, sparkItems),
    h('div', { class: 'oc-alert' }, '!'),
    h('div', { class: 'oc-zzz' }, h('i'), h('i'), h('i')));
  const stage = h('div', { class: 'oc-stage' }, surface, grip, actor);

  // 刘海模式：头像单独裁切，胶囊和展开面板是它的底座。
  const face = h('div', { class: 'oc-face', hidden: true });
  const pillName = h('b', { class: 'oc-pill-name' }, '伴侣');
  const pillDot = h('span', { class: 'oc-pill-dot', 'aria-hidden': 'true' });
  const pill = h('button', {
    class: 'oc-pill', type: 'button', 'aria-expanded': 'false', title: '桌面伴侣',
    onclick: () => togglePanel(),
  },
    h('span', { class: 'oc-pill-glow', 'aria-hidden': 'true' }),
    h('span', { class: 'oc-pill-copy' }, pillName, h('span', { class: 'oc-pill-sub' }, '在刘海里')),
    pillDot);

  const panelName = h('b', { class: 'oc-panel-name' }, '伴侣');
  const panelSub = h('span', { class: 'oc-panel-sub' }, '');
  const meterEnergy = h('i', { class: 'oc-meter-fill' });
  const meterAffection = h('i', { class: 'oc-meter-fill' });
  const meterBoredom = h('i', { class: 'oc-meter-fill' });
  const dropName = h('span', { class: 'oc-drop-name' }, '把文档或图片拖进来');
  const dropHint = h('span', { class: 'oc-drop-hint' }, '文本读摘要，图片看缩略图；不上传。');
  const dropZone = h('label', { class: 'oc-dropzone', title: '选择文件' },
    h('input', {
      class: 'oc-file', type: 'file',
      accept: 'text/*,image/*,.md,.txt,.json,.csv,.log,.js,.ts,.go,.py,.css,.html,.xml,.yaml,.yml',
      onchange: (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (file) handleFile(file);
      },
    }),
    h('span', { class: 'oc-drop-icon', 'aria-hidden': 'true' }, '↧'),
    h('span', { class: 'oc-drop-copy' }, dropName, dropHint));
  const readArea = h('div', { class: 'oc-read-area' });
  const panelFoot = h('div', { class: 'oc-panel-foot' },
    h('span', { class: 'oc-foot-note' }, '拖进来的文件只在本机解析'),
    h('button', {
      class: 'oc-foot-btn', type: 'button', title: '重置桌面位置',
      onclick: () => resetPosition(),
    }, '归位'));
  const panel = h('div', { class: 'oc-panel', hidden: true },
    h('div', { class: 'oc-panel-head' },
      h('span', { class: 'oc-panel-art', 'aria-hidden': 'true' }, '◍'),
      h('div', { class: 'oc-panel-title' }, panelName, panelSub)),
    h('div', { class: 'oc-meters' },
      h('div', { class: 'oc-meter' }, h('span', {}, '精力'), h('span', { class: 'oc-meter-track' }, meterEnergy)),
      h('div', { class: 'oc-meter' }, h('span', {}, '好感'), h('span', { class: 'oc-meter-track' }, meterAffection)),
      h('div', { class: 'oc-meter' }, h('span', {}, '好奇'), h('span', { class: 'oc-meter-track' }, meterBoredom))),
    dropZone,
    readArea,
    panelFoot);
  const notch = h('div', { class: 'oc-notch', hidden: true }, face, pill, panel);

  const cardTitle = h('b', { class: 'oc-card-name' });
  const cardMeta = h('span', { class: 'oc-card-meta' });
  const cardBody = h('div', { class: 'oc-card-body' });
  const readCard = h('div', { class: 'oc-readcard', hidden: true, role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'oc-card-head' },
      cardTitle, cardMeta,
      h('button', {
        class: 'oc-card-close', type: 'button', title: '收起',
        onclick: () => { readCard.hidden = true; },
      }, '×')),
    cardBody);

  const layer = h('div', { class: 'os-companion', hidden: true, 'aria-label': '桌面伴侣' }, stage, notch, readCard);
  const shell = mount || document.querySelector('.os');
  if (shell) shell.append(layer);

  let prefs = {
    companion: '', companionSize: 100, companionHidden: false, companionMode: 'desktop',
    appearance: 'current', reduceMotion: false,
  };
  let manifest = null;
  let images = new Map();
  let blinkImage = null;
  let loadedId = '';
  let loadToken = 0;
  let raf = 0;
  let destroyed = false;
  let hidden = true;
  let naturalW = 0;
  let naturalH = 0;
  let pos = readPos();
  let dragging = null;
  let pendingHit = null;
  let over = false;
  let blinkUntil = 0;
  let nextBlinkAt = 0;
  let doubleBlinkAt = 0;
  let clip = null;
  let mood = 'calm';
  let stats = null;
  let lastInteractAt = 0;
  let lastRead = null;
  let panelPinned = false;
  let panelTimer = 0;
  let pulseTimer = 0;
  let renderer = null;
  let rendererGen = 0;
  let alphaBounds = null;
  let edgeWorker;
  let edgeSeq = 0;
  let pendingEdges = new Map();
  let lastSizeSig = '';
  let actorState = 'idle';
  let actorSince = 0;
  let lastGazeAt = 0;
  const look = { x: 0, v: 0 };
  const pointer = { x: 0, y: 0, seen: false };
  const start = performance.now();

  // 状态机独立于渲染器：即使生命包是静态立绘，也会按真实事件表演。
  const brain = createCompanionState({
    onChange: function (name, info) { applyState(name, info); },
  });

  // 命中检测用离屏画布：只画角色本体，不画气泡和阴影。
  const hitCanvas = document.createElement('canvas');
  const hitCtx = hitCanvas.getContext('2d');

  function viewportSize() { return { w: window.innerWidth, h: window.innerHeight }; }
  function isNotch() { return prefs.companionMode === 'notch'; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function nowS() { return (performance.now() - start) / 1000; }

  function layerScale() {
    const vp = viewportSize();
    const base = (prefs.companionSize || 100) / 100;
    // 手机上同尺寸的伴侣会挡掉半屏；收一档，仍能看清表情。
    const compact = vp.w <= 760 ? 0.72 : 1;
    let hgt = naturalH * base * compact;
    const cap = vp.h * 0.55;
    if (hgt > cap) hgt = cap;
    return naturalH > 0 ? hgt / naturalH : base;
  }

  function faceBox() {
    const n = manifest && manifest.renderer && manifest.renderer.notch;
    if (n && n.size > 0) {
      return { x: n.x, y: n.y, size: n.size };
    }
    // 没有显式裁切框时，从 alpha 包围盒取上半身中间的方块：
    // 立绘四周常有透明留白，按画布比例裁会把脸裁到边缘。
    const b = alphaBounds || { x: 0, y: 0, w: naturalW, h: naturalH };
    const size = Math.max(32, Math.round(Math.min(b.w * 0.72, b.h * 0.5)));
    return {
      x: Math.max(0, Math.round(b.x + (b.w - size) / 2)),
      y: Math.max(0, Math.round(b.y + b.h * 0.005)),
      size: size,
    };
  }

  function measureAlpha(img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    try {
      const scale = Math.min(1, 160 / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, c.width, c.height);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width;
      let minY = c.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (px[(y * c.width + x) * 4 + 3] > 18) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX || maxY < minY) return null;
      const inv = 1 / scale;
      return {
        x: Math.floor(minX * inv),
        y: Math.floor(minY * inv),
        w: Math.max(1, Math.ceil((maxX - minX + 1) * inv)),
        h: Math.max(1, Math.ceil((maxY - minY + 1) * inv)),
      };
    } catch (e) {
      return null;
    }
  }

  function applySize() {
    if (!naturalW || !naturalH) return;
    if (isNotch()) {
      const size = clamp(Math.round(46 * (prefs.companionSize || 100) / 100), 32, 72);
      const box = faceBox();
      // 画布比头像窗口大，留出外发光；再把脸的中心顶到圆心。
      const boxX = 1.22;
      const boxY = 1.12;
      const canvasW = Math.round(size * boxX * naturalW / box.size);
      const canvasH = Math.round(size * boxY * naturalH / box.size);
      const spriteW = canvasW / boxX;
      const spriteH = canvasH / boxY;
      const fx = (box.x + box.size / 2) / naturalW;
      const fy = (box.y + box.size / 2) / naturalH;
      const centerX = (canvasW - spriteW) / 2 + fx * spriteW;
      const centerY = (canvasH - spriteH) / 2 + fy * spriteH;
      notch.style.setProperty('--face', size + 'px');
      face.style.setProperty('--canvas-w', canvasW + 'px');
      face.style.setProperty('--canvas-h', canvasH + 'px');
      face.style.setProperty('--canvas-x', Math.round(size / 2 - centerX) + 'px');
      face.style.setProperty('--canvas-y', Math.round(size / 2 - centerY) + 'px');
      // HTML 包没有 alpha 采样：清单给了取脸框就按画布像素精确裁切，
      // 没给则沿用 CSS 的默认倍率，避免把整张画布缩进 46px 圆里。
      const n = manifest && manifest.renderer && manifest.renderer.notch;
      if (manifest && manifest.renderer.kind === 'html' && n && n.size > 0) {
        const k = size / n.size;
        face.style.setProperty('--frame-w', Math.round(naturalW * k) + 'px');
        face.style.setProperty('--frame-h', Math.round(naturalH * k) + 'px');
        face.style.setProperty('--frame-x', Math.round(-n.x * k) + 'px');
        face.style.setProperty('--frame-y', Math.round(-n.y * k) + 'px');
      } else {
        face.style.removeProperty('--frame-w');
        face.style.removeProperty('--frame-h');
        face.style.removeProperty('--frame-x');
        face.style.removeProperty('--frame-y');
      }
      layer.classList.remove('oc-dragging');
      resizeRenderer(true);
      return;
    }
    const scale = layerScale();
    const w = Math.round(naturalW * scale);
    const hgt = Math.round(naturalH * scale);
    stage.style.width = w + 'px';
    stage.style.height = hgt + 'px';
    layer.style.width = w + 'px';
    layer.style.height = hgt + 'px';
    ensurePosition(w, hgt);
    resizeRenderer(true);
  }

  function resizeRenderer(force) {
    if (!renderer) return;
    const sig = canvas.clientWidth + 'x' + canvas.clientHeight + '@' + (window.devicePixelRatio || 1);
    if (!force && sig === lastSizeSig) return;
    lastSizeSig = sig;
    renderer.resize();
  }

  function defaultPosition(w, hgt) {
    const vp = viewportSize();
    return { x: vp.w - w - (vp.w <= 760 ? 12 : 36), y: vp.h - hgt - (vp.w <= 760 ? 76 : 118) };
  }

  function ensurePosition(w, hgt) {
    const vp = viewportSize();
    // 换屏幕（桌面 → 手机）后旧坐标可能把角色留在屏外：这时回默认右下角。
    const offscreen = pos && (pos.x > vp.w - w * 0.5 || pos.x < -w * 0.5 ||
      pos.y > vp.h - hgt * 0.4 || pos.y < -hgt * 0.2);
    if (!pos || offscreen) pos = defaultPosition(w, hgt);
    pos.x = clamp(pos.x, -w * 0.4, vp.w - w * 0.6);
    pos.y = clamp(pos.y, 0, vp.h - 32);
    layer.style.left = Math.round(pos.x) + 'px';
    layer.style.top = Math.round(pos.y) + 'px';
  }

  function resetPosition() {
    if (isNotch()) {
      pulse();
      return;
    }
    pos = null;
    applySize();
    pulse();
  }

  function pulse() {
    layer.classList.remove('oc-pulse');
    // 强制一次重排，让同一个 pulse 能连续触发。
    void layer.offsetWidth;
    layer.classList.add('oc-pulse');
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => layer.classList.remove('oc-pulse'), 700);
  }

  function setVisible(on) {
    hidden = !on;
    layer.hidden = hidden;
    if (hidden) {
      closePanel(true);
      readCard.hidden = true;
      if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'nexlos.companion.pause' }, location.origin);
    } else {
      over = false;
      stage.classList.remove('oc-over');
      resizeRenderer(true);
    }
  }

  // ---------- 刘海面板 ----------

  function setPanel(open, pin) {
    if (!isNotch() || hidden || !loadedId) { panel.hidden = true; return; }
    if (open) {
      panel.hidden = false;
      if (pin) panelPinned = true;
      layer.classList.add('oc-panel-open');
      pill.setAttribute('aria-expanded', 'true');
      positionPanel();
    } else {
      panel.hidden = true;
      layer.classList.remove('oc-panel-open');
      pill.setAttribute('aria-expanded', 'false');
      panelPinned = false;
    }
  }

  function positionPanel() {
    // CSS 负责居中；这里只在窄屏上把面板宽度夹回视口。
    const vp = viewportSize();
    panel.style.width = Math.min(340, Math.max(220, vp.w - 20)) + 'px';
  }

  function togglePanel() {
    if (panel.hidden) setPanel(true, true);
    else setPanel(false, false);
  }

  function closePanel(force) {
    clearTimeout(panelTimer);
    if (force || !panelPinned) setPanel(false, false);
  }

  function openPanelSoon(pin) {
    clearTimeout(panelTimer);
    if (pin) { setPanel(true, true); return; }
    panelTimer = setTimeout(() => setPanel(true, false), 120);
  }

  function schedulePanelClose() {
    clearTimeout(panelTimer);
    if (panelPinned) return;
    panelTimer = setTimeout(() => setPanel(false, false), 420);
  }

  function paintStats(next) {
    if (next) stats = next;
    if (!stats) return;
    const s = stats;
    meterEnergy.style.width = clamp(s.energy || 0, 0, 100) + '%';
    meterAffection.style.width = clamp(s.affection || 0, 0, 100) + '%';
    meterBoredom.style.width = clamp(s.boredom || 0, 0, 100) + '%';
    pillDot.className = 'oc-pill-dot is-' + (mood || 'calm');
    panelSub.textContent = moodLabel(mood);
  }

  // ---------- 文件阅读 ----------

  function readFileKind(file) {
    if (file && /^image\//.test(file.type)) return 'image';
    if (file && (/^text\//.test(file.type) || TEXT_EXT.test(file.name))) return 'text';
    return 'file';
  }

  function handleFile(file) {
    if (!file || !loadedId) return;
    brain.signal('attention');
    const kind = readFileKind(file);
    if (kind === 'text' && file.size > READ_TEXT_MAX) {
      showRead({ name: file.name, size: file.size, kind: 'error', meta: humanSize(file.size), note: '文本超过 1 MB，先裁一段再拖进来。' });
      return;
    }
    if (kind === 'image' && file.size > READ_IMAGE_MAX) {
      showRead({ name: file.name, size: file.size, kind: 'error', meta: humanSize(file.size), note: '图片超过 16 MB，换一张小一点的。' });
      return;
    }
    if (kind === 'text') readText(file);
    else if (kind === 'image') readImage(file);
    else {
      const ext = (file.name.split('.').pop() || '').toUpperCase();
      showRead({
        name: file.name, size: file.size, kind: 'file', meta: (ext ? ext + ' · ' : '') + humanSize(file.size),
        note: '现在能读文本和图片。PDF / Office 先在「阅读器」里打开，再拖文本过来。',
      });
    }
  }

  function readText(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '').replace(/\u0000/g, '');
      const lines = text.split(/\r?\n/);
      const chars = text.length;
      const excerpt = text.slice(0, 900);
      showRead({
        name: file.name, size: file.size, kind: 'text',
        meta: lines.length + ' 行 · ' + chars.toLocaleString() + ' 字',
        excerpt: excerpt, more: chars > 900,
      });
    };
    reader.onerror = () => showRead({ name: file.name, size: file.size, kind: 'error', meta: '', note: '文件读不出来，可能没有权限。' });
    reader.readAsText(file);
  }

  function readImage(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 220 / Math.max(1, img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const g = c.getContext('2d');
        let thumb = '';
        try {
          g.drawImage(img, 0, 0, c.width, c.height);
          thumb = c.toDataURL('image/jpeg', 0.74);
        } catch (e) { thumb = ''; }
        showRead({
          name: file.name, size: file.size, kind: 'image',
          meta: img.width + '×' + img.height + ' · ' + humanSize(file.size),
          thumb: thumb,
        });
      };
      img.onerror = () => showRead({ name: file.name, size: file.size, kind: 'error', meta: '', note: '这张图解码失败。' });
      img.src = String(reader.result || '');
    };
    reader.onerror = () => showRead({ name: file.name, size: file.size, kind: 'error', meta: '', note: '图片读不出来。' });
    reader.readAsDataURL(file);
  }

  function showRead(data) {
    data.at = Date.now();
    lastRead = data;
    saveLast(loadedId, data);
    renderRead();
    pulse();
    brain.signal(data.kind === 'error' ? 'error' : 'notification');
    if (isNotch()) {
      setPanel(true, false);
      clearTimeout(panelTimer);
      panelTimer = setTimeout(() => { if (!panelPinned) setPanel(false, false); }, 12000);
    } else {
      readCard.hidden = false;
      readCard.classList.toggle('below', layer.offsetTop < 190);
    }
  }

  function clearRead() {
    lastRead = null;
    saveLast(loadedId, null);
    renderRead();
    readCard.hidden = true;
  }

  function readBody(data) {
    if (!data) return [];
    const parts = [];
    if (data.kind === 'image' && data.thumb) {
      parts.push(h('img', { class: 'oc-read-img', src: data.thumb, alt: data.name }));
    }
    if (data.excerpt) {
      parts.push(h('pre', { class: 'oc-read-text' }, data.excerpt));
      if (data.more) parts.push(h('span', { class: 'oc-read-more' }, '（已截断）'));
    }
    if (data.note) parts.push(h('p', { class: 'oc-read-note' }, data.note));
    return parts;
  }

  function renderRead() {
    const data = lastRead;
    if (cardTitle.firstChild) cardTitle.removeChild(cardTitle.firstChild);
    if (cardMeta.firstChild) cardMeta.removeChild(cardMeta.firstChild);
    cardBody.textContent = '';
    readArea.textContent = '';
    if (!data) {
      readCard.hidden = true;
      readArea.append(h('p', { class: 'oc-read-empty' }, '还没有读过东西。'));
      return;
    }
    cardTitle.textContent = data.name;
    cardMeta.textContent = data.meta || humanSize(data.size);
    for (const node of readBody(data)) cardBody.append(node);
    if (lastRead && !isNotch()) readCard.hidden = false;

    const area = h('div', { class: 'oc-read-card' },
      h('div', { class: 'oc-read-head' },
        h('b', {}, data.name),
        h('span', {}, data.meta || humanSize(data.size)),
        h('button', { class: 'oc-read-close', type: 'button', title: '清掉这条', onclick: () => clearRead() }, '×')),
      ...readBody(data));
    readArea.append(area);
  }

  // ---------- 加载 ----------

  function unload() {
    images = new Map();
    blinkImage = null;
    manifest = null;
    naturalW = 0;
    naturalH = 0;
    alphaBounds = null;
    loadedId = '';
    stats = null;
    lastRead = null;
    closePanel(true);
    readCard.hidden = true;
    frame.hidden = true;
    frame.removeAttribute('src');
    canvas.hidden = false;
    grip.hidden = true;
    if (renderer) {
      try { renderer.dispose(); } catch (e) { /* 上下文已丢 */ }
      renderer = null;
    }
    rendererGen++;
    pendingEdges.clear();
    layer.classList.remove('oc-gpu');
    layer.classList.remove('oc-self-act');
    layer.classList.remove('oc-busy');
    for (let i = 0; i < STATE_CLASSES.length; i++) layer.classList.remove(STATE_CLASSES[i]);
    actorState = 'idle';
    pillDot.className = 'oc-pill-dot';
    setVisible(false);
    brain.reset();
  }

  async function load(id) {
    const token = ++loadToken;
    if (!id) { unload(); return; }
    let data;
    try {
      data = await call('companion.get', { query: { id } });
    } catch (e) {
      unload();
      toast(`伴侣没加载：${e.message}`);
      return;
    }
    if (token !== loadToken) return;
    const m = data.detail && data.detail.manifest;
    if (!m) { unload(); return; }
    manifest = m;
    mood = data.detail.mood || 'calm';
    stats = data.detail.state || null;
    loadedId = id;
    actor.style.setProperty('--oc-accent', (m.renderer && m.renderer.glow) || '#ffb46b');
    brain.reset();
    brain.setReducedMotion(!!prefs.reduceMotion);
    naturalW = m.renderer.width || 300;
    naturalH = m.renderer.height || 420;
    hitCanvas.width = naturalW;
    hitCanvas.height = naturalH;
    lastRead = readLast(id);
    pillName.textContent = (m.persona && m.persona.name) || m.name || id;
    panelName.textContent = pillName.textContent;
    panelSub.textContent = (m.persona && m.persona.tagline) || m.description || '';
    paintStats();
    renderRead();
    setVisible(!prefs.companionHidden && prefs.appearance !== 'win98');

    if (m.renderer.kind === 'html') {
      canvas.hidden = true;
      frame.hidden = false;
      grip.hidden = false;
      // HTML 包自己画道具；宿主只负责状态与视线，避免出现两套气泡。
      layer.classList.add('oc-self-act');
      // 版本号进 URL：重装同一个包时 WebView 不会拿旧缓存，界面也容易判断是否换了版本。
      frame.src = `/life/${encodeURIComponent(id)}/${m.renderer.entry || 'index.html'}?v=${encodeURIComponent(m.version || '0')}`;
      if (renderer) { renderer.dispose(); renderer = null; rendererGen++; }
      layer.classList.remove('oc-gpu');
    } else {
      canvas.hidden = false;
      frame.hidden = true;
      grip.hidden = true;
      layer.classList.remove('oc-self-act');
      await loadImages(m, token);
      if (token !== loadToken) return;
    }
    applyMode();
    applySize();
    startLoop();
    maybeGreet(data.detail.state || {});
  }

  async function loadImages(m, token) {
    const map = new Map();
    const load = (src) => new Promise((resolve) => {
      if (!src) { resolve(null); return; }
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `/life/${encodeURIComponent(m.id)}/${src}`;
    });
    const jobs = [];
    for (const row of m.layers || []) jobs.push(load(row.src).then((img) => { if (img) map.set(row.src, img); }));
    for (const st of Object.values(m.states || {})) {
      for (const f of st.frames || []) jobs.push(load(f).then((img) => { if (img) map.set(f, img); }));
    }
    await Promise.all(jobs);
    if (token !== loadToken) return;
    images = map;
    const blinkLayer = (m.layers || []).find((row) => row.mode === 'blink');
    blinkImage = blinkLayer ? images.get(blinkLayer.src) || null : null;
    const first = (m.layers || []).find((row) => row.mode !== 'blink');
    const firstImg = first ? images.get(first.src) : null;
    const idle = m.states && m.states.idle && m.states.idle.frames && m.states.idle.frames[0];
    alphaBounds = measureAlpha(firstImg || (idle ? images.get(idle) : null) || blinkImage);
    nextBlinkAt = nowS() + BLINK_MIN + Math.random() * BLINK_SPAN;
    buildRenderer(m);
  }

  function buildRenderer(m) {
    if (renderer) {
      try { renderer.dispose(); } catch (e) { /* 忽略 */ }
      renderer = null;
    }
    rendererGen++;
    pendingEdges.clear();
    layer.classList.remove('oc-gpu');
    renderer = createCompanionRenderer(canvas, m.renderer.glow || '#ffb46b');
    if (!renderer) return;
    layer.classList.toggle('oc-gpu', renderer.kind === 'webgl2');
    const list = [];
    let baseKey = '';
    if (m.renderer.kind === 'frames') {
      const seen = {};
      const states = m.states || {};
      for (const name of Object.keys(states)) {
        for (const src of states[name].frames || []) {
          if (seen[src] || !images.get(src)) continue;
          seen[src] = true;
          if (!baseKey) baseKey = src;
          list.push({ key: src, img: images.get(src), mode: 'frame', frame: src, z: 0 });
        }
      }
    } else {
      const rows = (m.layers || []).slice().sort((a, c) => (a.z || 0) - (c.z || 0));
      for (const row of rows) {
        const img = images.get(row.src);
        if (!img) continue;
        if (!baseKey && row.mode !== 'blink') baseKey = row.src;
        list.push({ key: row.src, img: img, mode: row.mode || '', z: row.z || 0, edgeKey: baseKey || row.src });
      }
      for (const item of list) item.edgeKey = baseKey || item.key;
    }
    renderer.setLayers(list);
    if (baseKey && images.get(baseKey)) computeEdge(baseKey, images.get(baseKey));
    resizeRenderer(true);
  }

  function ensureEdgeWorker() {
    if (edgeWorker !== undefined) return edgeWorker;
    try {
      edgeWorker = new Worker('/a/companion-worker.js');
      edgeWorker.onmessage = (e) => {
        const d = e.data || {};
        const pending = pendingEdges.get(d.id);
        if (!pending) return;
        pendingEdges.delete(d.id);
        if (pending.gen !== rendererGen || !renderer) return;
        try { renderer.setEdge(pending.src, new Uint8Array(d.buf), d.w, d.h); } catch (err) { /* 上下文丢失 */ }
      };
      edgeWorker.onerror = () => {
        edgeWorker = null;
        pendingEdges.clear();
      };
    } catch (e) {
      edgeWorker = null;
    }
    return edgeWorker;
  }

  function computeEdge(src, img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h || w * h > 1600000) return;
    const worker = ensureEdgeWorker();
    if (!worker) return;
    let data;
    try {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, w, h);
      data = g.getImageData(0, 0, w, h);
    } catch (e) {
      return; // 跨域或画布被污染：着色器会自动退回 alpha 梯度
    }
    const id = ++edgeSeq;
    pendingEdges.set(id, { src: src, gen: rendererGen });
    try {
      worker.postMessage({ id: id, w: w, h: h, px: data.data }, [data.data.buffer]);
    } catch (e) {
      pendingEdges.delete(id);
    }
  }

  function maybeGreet(state) {
    const minutes = (manifest && manifest.behaviors && manifest.behaviors.greetAfterMinutes) || 45;
    const last = Number(state.lastSeen || 0);
    if (!last) return;
    if ((Date.now() / 1000 - last) / 60 < minutes) return;
    interact('greet', false);
  }

  // ---------- 状态与互动 ----------

  async function interact(kind, announce = true) {
    if (!loadedId) return;
    const now = performance.now();
    if (kind === 'drag' && now - lastInteractAt < 800) return;
    lastInteractAt = now;
    try {
      const r = await call('companion.interact', { method: 'POST', fields: { id: loadedId, kind } });
      const d = r.detail || {};
      mood = d.mood || mood;
      paintStats(d.state);
      // 触碰本身是最强的「还活着」信号：先醒，再演互动动作。
      brain.signal(kind === 'tap' ? 'attention' : 'wake');
      if (kind === 'drag' && manifest && manifest.renderer && manifest.renderer.kind === 'html' && frame.contentWindow) {
        try {
          // 拖动时让页面自己演「被拎起来」的反应；只有拖动需要，点击由 tap 消息负责。
          frame.contentWindow.postMessage({ type: 'nexlos.companion.react', kind: 'drag' }, '*');
        } catch (e) { /* iframe 还没就绪 */ }
      }
      if (kind !== 'drag') {
        const target = (manifest && manifest.interactions && manifest.interactions[kind]) || 'tap';
        if (manifest && manifest.states && manifest.states[target]) {
          clip = { name: target, at: nowS() };
        }
        if (announce) pulse();
      }
    } catch (e) { /* 互动失败不打断桌面 */ }
  }

  // ---------- 渲染 ----------

  function currentFrameName() {
    if (!manifest || !manifest.states) return null;
    if (clip) {
      const st = manifest.states[clip.name];
      if (st) {
        const fps = st.fps || 8;
        const index = Math.floor((nowS() - clip.at) * fps);
        if (st.loop || index < st.frames.length) return st.frames[index % st.frames.length];
        clip = null;
      } else clip = null;
    }
    const idle = manifest.states.idle;
    if (!idle || !idle.frames.length) return null;
    const fps = idle.fps || 6;
    return idle.frames[Math.floor(nowS() * fps) % idle.frames.length];
  }

  function motion(t) {
    const b = (manifest && manifest.behaviors) || {};
    const calm = !prefs.reduceMotion;
    const asleep = actorState === 'sleeping' || actorState === 'dozing';
    const waking = actorState === 'waking' || actorState === 'yawning';
    const busy = actorState === 'working' || actorState === 'executing' || actorState === 'juggling';
    const thinking = actorState === 'thinking';
    const attention = actorState === 'attention';
    const tired = mood === 'tired';
    const lonely = mood === 'lonely';
    let breathe = calm ? (b.breath || 0.04) : 0;
    let freq = 0.33;
    if (asleep) { breathe *= 0.55; freq = 0.14; }
    else if (busy) { breathe *= 1.2; freq = 0.85; }
    else if (thinking) { breathe *= 0.8; freq = 0.24; }
    else if (waking) { breathe *= 1.35; freq = 0.52; }
    const swayAmp = calm ? (b.sway || 0.03) : 0;
    let sway = (noise1(t * 0.21 + 13.7) * 2 - 1) * swayAmp * (lonely ? 26 : 18);
    if (busy) sway *= 1.55;
    if (attention) sway = sway * 0.3 - 3.2;
    if (asleep) sway *= 0.55;
    let shiftY = 0;
    if (busy) shiftY = -Math.abs(Math.sin(t * 7.5)) * 0.006;
    else if (thinking) shiftY = 0.004;
    else if (attention) shiftY = -Math.abs(Math.sin(t * 5.2)) * 0.008;
    else if (asleep) shiftY = 0.05;
    else if (waking) shiftY = -Math.abs(Math.sin(t * 3.1)) * 0.012;
    else if (actorState === 'notification') shiftY = -Math.abs(Math.sin(t * 4.4)) * 0.018;
    let shakeX = 0;
    if (actorState === 'error') shakeX = (noise1(t * 38 + 7.1) * 2 - 1) * 0.012;
    const breath = (noise1(t * freq) * 2 - 1) * breathe;
    const drift = (noise1(t * 0.12 + 4.2) * 2 - 1) * (lonely ? 2.4 : 1.2);
    let target = 0;
    if (pointer.seen && !hidden) {
      const r = (isNotch() ? face : stage).getBoundingClientRect();
      target = clamp((pointer.x - (r.left + r.width / 2)) / (window.innerWidth * 0.42), -1, 1);
      if (attention) target = clamp(target * 1.45, -1, 1);
      if (!(b.lookAt === true)) target = 0;
    }
    look.v += (target - look.x) * (calm ? 0.12 : 1);
    look.v *= 0.8;
    look.x += look.v;
    return {
      breath: breath,
      rot: (sway + look.x * 1.4) * Math.PI / 180,
      shiftX: (look.x * 4 + drift) / Math.max(1, naturalW) * 2 + shakeX,
      shiftY: shiftY,
      tired: tired,
    };
  }

  function stateTint() {
    const st = actorState;
    if (st === 'error') return { tint: [1.18, 0.72, 0.72], amount: 0.55, rim: 0.9, warm: 0, sad: 0.2 };
    if (st === 'notification') return { tint: [1.12, 1.04, 0.86], amount: 0.42, rim: 0.9, warm: 0.9, sad: 0 };
    if (st === 'sleeping' || st === 'dozing' || st === 'yawning') {
      return { tint: [0.80, 0.90, 1.08], amount: 0.45, rim: 0.3, warm: 0.15, sad: 0.45 };
    }
    if (st === 'working' || st === 'executing' || st === 'juggling') {
      return { tint: [0.96, 1.02, 1.08], amount: 0.28, rim: 0.85, warm: 0.55, sad: 0 };
    }
    if (st === 'thinking') return { tint: [0.94, 1.0, 1.06], amount: 0.22, rim: 0.62, warm: 0.3, sad: 0 };
    if (st === 'attention') return { tint: [1.04, 1.02, 0.98], amount: 0.14, rim: 0.9, warm: 0.75, sad: 0 };
    return null;
  }

  function applyState(name, info) {
    actorState = name;
    actorSince = (info && info.since) || Date.now();
    const replay = name === 'notification' || name === 'error' || name === 'attention';
    if (replay) {
      layer.classList.remove('oc-st-' + name);
      void layer.offsetWidth;
    }
    const known = STATE_CLASSES;
    for (let i = 0; i < known.length; i++) {
      layer.classList.toggle(known[i], known[i] === 'oc-st-' + name);
    }
    const busy = name === 'thinking' || name === 'working' || name === 'executing' || name === 'juggling';
    layer.classList.toggle('oc-busy', busy);
    let dot = 'oc-pill-dot';
    if (name === 'error') dot += ' is-error';
    else if (name === 'notification') dot += ' is-done';
    else if (busy) dot += ' is-busy';
    else if (name === 'sleeping' || name === 'dozing' || name === 'yawning') dot += ' is-sleep';
    pillDot.className = dot;
    if (manifest && manifest.renderer && manifest.renderer.kind === 'html' && frame.contentWindow) {
      try {
        // iframe 是不透明源（sandbox 没给 allow-same-origin），targetOrigin 必须是 *。
        frame.contentWindow.postMessage({
          type: 'nexlos.companion.state',
          state: name,
          label: STATE_LABEL[name] || name,
        }, '*');
      } catch (e) { /* iframe 还没就绪 */ }
    }
  }

  function draw() {
    if (!manifest || manifest.renderer.kind === 'html' || !naturalW) return;
    if (!renderer) return;
    const t = nowS();
    const move = motion(t);
    const tired = mood === 'tired';
    const tone = stateTint();
    const rim = tone ? tone.rim : (tired ? 0.34 : 0.72);
    const warm = tone ? tone.warm : (mood === 'attached' ? 0.92 : (mood === 'calm' ? 0.4 : 0.2));
    const sad = tone ? tone.sad : (mood === 'lonely' ? 0.72 : (tired ? 0.46 : 0));
    renderer.draw({
      time: t,
      breath: move.breath,
      rot: move.rot,
      shiftX: move.shiftX,
      shiftY: move.shiftY,
      blink: !!(blinkImage && t < blinkUntil),
      frame: currentFrameName(),
      mood: mood,
      rim: rim,
      warm: warm,
      sad: sad,
      tint: tone ? tone.tint : null,
      tintAmount: tone ? tone.amount : 0,
      state: actorState,
      dense: !isNotch(),
      particleAlpha: isNotch() ? 0.62 : (actorState === 'sleeping' ? 0.45 : 1),
    });
  }

  function scheduleBlink(t) {
    if (t > nextBlinkAt && blinkImage) {
      blinkUntil = t + 0.13;
      if (Math.random() < 0.15) doubleBlinkAt = t + 0.3;
      nextBlinkAt = t + BLINK_MIN + Math.random() * BLINK_SPAN;
    }
    if (doubleBlinkAt && t > doubleBlinkAt && blinkImage) {
      blinkUntil = t + 0.11;
      doubleBlinkAt = 0;
    }
  }

  function hitAt(clientX, clientY) {
    if (!manifest || manifest.renderer.kind === 'html' || !images.size) return false;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false;
    // 画布比立绘大一圈：先把指针映射到画布，再去掉透明边。
    const box = { x: r.width * 0.11 / 1.22, y: r.height * 0.06 / 1.12 };
    const w = r.width / 1.22;
    const h = r.height / 1.12;
    if (clientX < r.left + box.x || clientX > r.left + box.x + w ||
      clientY < r.top + box.y || clientY > r.top + box.y + h) return false;
    const nx = Math.floor((clientX - r.left - box.x) / w * naturalW);
    const ny = Math.floor((clientY - r.top - box.y) / h * naturalH);
    hitCtx.clearRect(0, 0, naturalW, naturalH);
    const frameName = currentFrameName();
    if (frameName) {
      const img = images.get(frameName);
      if (img) hitCtx.drawImage(img, 0, 0, naturalW, naturalH);
    } else {
      const rows = (manifest.layers || []).slice().sort((a, c) => (a.z || 0) - (c.z || 0));
      for (const row of rows) {
        if (row.mode === 'blink') continue;
        const img = images.get(row.src);
        if (img) hitCtx.drawImage(img, 0, 0, naturalW, naturalH);
      }
    }
    try {
      return hitCtx.getImageData(nx, ny, 1, 1).data[3] > 18;
    } catch (e) {
      return false;
    }
  }

  function setOver(on) {
    if (on === over) return;
    over = on;
    stage.classList.toggle('oc-over', on);
    layer.classList.toggle('oc-hit', on);
  }

  function tick(ts) {
    if (destroyed) return;
    raf = requestAnimationFrame(tick);
    if (hidden) return;
    const t = (ts - start) / 1000;
    brain.tick();
    scheduleBlink(t);
    if (isNotch()) {
      // 刘海模式没有可拖动的身体，命中检测只用于指针反馈，直接跳过。
      setOver(false);
    } else if (pendingHit) {
      setOver(hitAt(pendingHit.x, pendingHit.y));
      pendingHit = null;
    }
    resizeRenderer(false);
    draw();
  }

  function startLoop() {
    if (raf) return;
    raf = requestAnimationFrame(tick);
  }

  // ---------- 手势 ----------

  function onPointerMove(e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.seen = true;
    if (hidden) return;
    // 任何真实指针活动都把伴侣从睡眠里叫醒；醒着时只刷新闲置计时。
    brain.signal('wake');
    // HTML 生命包自己画眼睛：把指针位置归一化成 -1..1 发过去，限制在 20Hz。
    if (manifest && manifest.renderer && manifest.renderer.kind === 'html' && frame.contentWindow) {
      const r = frame.getBoundingClientRect();
      if (r.width && r.height) {
        const at = performance.now();
        if (at - lastGazeAt > 50) {
          lastGazeAt = at;
          try {
            frame.contentWindow.postMessage({
              type: 'nexlos.companion.gaze',
              x: clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1),
              y: clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1),
            }, '*');
          } catch (err) { /* iframe 还没就绪 */ }
        }
      }
    }
    if (dragging) {
      const dx = e.clientX - dragging.x0;
      const dy = e.clientY - dragging.y0;
      if (!dragging.moved && Math.abs(dx) + Math.abs(dy) > 5) {
        dragging.moved = true;
        layer.classList.add('oc-dragging');
        document.documentElement.style.touchAction = 'none';
      }
      if (dragging.moved) {
        pos.x = dragging.px + dx;
        pos.y = dragging.py + dy;
        ensurePosition(stage.offsetWidth, stage.offsetHeight);
      }
      return;
    }
    if (!pendingHit) pendingHit = { x: e.clientX, y: e.clientY };
  }

  function onPointerDown(e) {
    if (hidden || e.button > 0 || isNotch()) return;
    const target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('.os-taskbar, .os-start, .os-stickies, .toast, .oc-grip')) return;
    if (manifest && manifest.renderer.kind === 'html') return;
    if (!hitAt(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = { x0: e.clientX, y0: e.clientY, px: pos.x, py: pos.y, moved: false };
    setOver(true);
    if (stage.setPointerCapture) {
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 旧内核回退到 window 监听 */ }
    }
  }

  function onPointerUp(e) {
    if (!dragging) return;
    const moved = dragging.moved;
    const d = dragging;
    dragging = null;
    layer.classList.remove('oc-dragging');
    document.documentElement.style.touchAction = '';
    if (moved) {
      savePos(pos);
      interact('drag', false);
    } else {
      interact('tap', true);
    }
    pendingHit = { x: e.clientX, y: e.clientY };
    d.moved = false;
  }

  function onGripDown(e) {
    if (e.button > 0 || isNotch()) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = { x0: e.clientX, y0: e.clientY, px: pos.x, py: pos.y, moved: true };
    layer.classList.add('oc-dragging');
    document.documentElement.style.touchAction = 'none';
    if (stage.setPointerCapture) {
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 旧内核回退 */ }
    }
  }

  function onResize() {
    applySize();
    if (isNotch() && !panel.hidden) positionPanel();
  }

  function onMessage(e) {
    const fromFrame = !!(frame.contentWindow && e.source === frame.contentWindow);
    // html 渲染器是不透明源（origin 为 null）；只允许它请求归位。
    if (e.origin !== location.origin && !(fromFrame && e.origin === 'null')) return;
    const d = e.data || {};
    if (d.type === 'nexlos.companion.reset') resetPosition();
    // HTML 生命包被点了一下：交给宿主记互动，和像素版点击走同一条路径。
    else if (d.type === 'nexlos.companion.tap') interact('tap', true);
    // HTML 包自己收到指针事件，拖动时把屏幕坐标回传给宿主，由宿主移动整层。
    else if (d.type === 'nexlos.companion.drag' && manifest && manifest.renderer.kind === 'html' && !isNotch()) {
      const phase = d.phase;
      const x = Number(d.x);
      const y = Number(d.y);
      if (!isFinite(x) || !isFinite(y)) return;
      if (phase === 'start') {
        if (!pos) return;
        dragging = { x0: x, y0: y, px: pos.x, py: pos.y, moved: false };
        layer.classList.add('oc-dragging');
        document.documentElement.style.touchAction = 'none';
      } else if (phase === 'move' && dragging) {
        const dx = x - dragging.x0;
        const dy = y - dragging.y0;
        if (!dragging.moved && Math.abs(dx) + Math.abs(dy) > 5) dragging.moved = true;
        if (dragging.moved) {
          pos.x = dragging.px + dx;
          pos.y = dragging.py + dy;
          ensurePosition(stage.offsetWidth, stage.offsetHeight);
        }
      } else if (phase === 'end' && dragging) {
        const moved = dragging.moved;
        dragging = null;
        layer.classList.remove('oc-dragging');
        document.documentElement.style.touchAction = '';
        if (moved) {
          savePos(pos);
          interact('drag', false);
        }
      }
    }
  }

  // ---------- 拖文件即读 ----------

  function hasFiles(e) {
    const dt = e.dataTransfer;
    if (!dt) return false;
    if (dt.types) {
      for (let i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
    }
    return false;
  }

  function onDocDrag(e) {
    if (!loadedId || hidden || !hasFiles(e)) return;
    layer.classList.add('oc-drop-ready');
  }

  function onDocDragEnd() {
    layer.classList.remove('oc-drop-ready', 'oc-drop-on');
  }

  function onLayerDragOver(e) {
    if (!loadedId || hidden || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    layer.classList.add('oc-drop-on');
  }

  function onLayerDragLeave(e) {
    if (e.relatedTarget && layer.contains(e.relatedTarget)) return;
    layer.classList.remove('oc-drop-on');
  }

  function onLayerDrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    // 伴侣已经接住这份文件：不再让桌面的“拖入即建便利贴”再处理一次。
    e.stopPropagation();
    layer.classList.remove('oc-drop-ready', 'oc-drop-on');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onKey(e) {
    if (e.key === 'Escape' && isNotch()) closePanel(true);
  }

  pill.addEventListener('mouseenter', () => openPanelSoon(false));
  pill.addEventListener('mouseleave', schedulePanelClose);
  face.addEventListener('mouseenter', () => openPanelSoon(false));
  face.addEventListener('mouseleave', schedulePanelClose);
  panel.addEventListener('mouseenter', () => clearTimeout(panelTimer));
  panel.addEventListener('mouseleave', schedulePanelClose);
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('message', onMessage);
  document.addEventListener('keydown', onKey);
  document.addEventListener('dragenter', onDocDrag, true);
  document.addEventListener('dragover', onDocDrag, true);
  document.addEventListener('dragend', onDocDragEnd, true);
  document.addEventListener('drop', onDocDragEnd, true);
  window.addEventListener('blur', onDocDragEnd);
  layer.addEventListener('dragover', onLayerDragOver);
  layer.addEventListener('dragleave', onLayerDragLeave);
  layer.addEventListener('drop', onLayerDrop);
  grip.addEventListener('pointerdown', onGripDown);

  // ---------- 形态切换 ----------

  function applyMode() {
    const notchOn = isNotch();
    layer.classList.toggle('oc-notch-mode', notchOn);
    stage.hidden = notchOn;
    notch.hidden = !notchOn;
    face.hidden = !notchOn;
    if (notchOn) {
      if (surface.parentNode !== face) face.append(surface);
      // 刘海形态没有身体，但状态道具仍要在胶囊旁边出现。
      if (actor.parentNode !== notch) notch.append(actor);
      layer.style.left = '';
      layer.style.top = '';
      layer.style.width = '';
      layer.style.height = '';
      document.documentElement.classList.add('oc-notch-active');
    } else {
      if (surface.parentNode !== stage) stage.insertBefore(surface, grip);
      if (actor.parentNode !== stage) stage.append(actor);
      layer.style.removeProperty('left');
      layer.style.removeProperty('top');
      document.documentElement.classList.remove('oc-notch-active');
      setPanel(false, false);
      applySize();
    }
    if (notchOn) applySize();
    resizeRenderer(true);
  }

  // ---------- 对外 ----------

  async function sync(next) {
    const before = prefs;
    prefs = Object.assign({}, prefs, next || {});
    brain.setReducedMotion(!!prefs.reduceMotion);
    const visible = !!prefs.companion && !prefs.companionHidden && prefs.appearance !== 'win98';
    if (!prefs.companion) {
      if (loadedId) unload();
      setVisible(false);
      return;
    }
    if (prefs.companion !== loadedId) {
      unload();
      await load(prefs.companion);
      return;
    }
    if (before.companionMode !== prefs.companionMode) applyMode();
    if (manifest) {
      applySize();
      setVisible(visible);
      if (before.companionSize !== prefs.companionSize || before.appearance !== prefs.appearance) {
        startLoop();
      }
    }
  }

  // 系统事件（Agent 任务、命令生命周期）驱动的表演；不弹文字、不打断工作。
  // 对外暴露 signal，让 os.js 能报 thinking/working/executing/juggling 这类过程状态。
  function signal(kind, meta) {
    if (!kind) return;
    brain.signal(kind, meta);
  }

  function react(kind) {
    if (!manifest || hidden) return;
    const k = String(kind || '');
    if (k === 'noticeFail' || k === 'error') brain.signal('error');
    else if (k === 'attention') brain.signal('attention');
    else if (k === 'thinking') brain.signal('thinking');
    else if (k === 'working') brain.signal('working');
    else brain.signal('notification');
    pulse();
    if (manifest.renderer && manifest.renderer.kind === 'html' && frame.contentWindow) {
      try {
        // 生命包页面是不透明源：只能用 * 投递，消息里不放任何隐私数据。
        frame.contentWindow.postMessage({ type: 'nexlos.companion.react', kind: k }, '*');
      } catch (e) { /* iframe 还没就绪 */ }
    }
  }

  function status() {
    return {
      id: loadedId, visible: !hidden, over: over, mood: mood, mode: prefs.companionMode,
      state: actorState, stateSince: actorSince,
      renderer: renderer ? renderer.kind : 'none',
      read: lastRead,
      rect: (isNotch() ? face : stage).getBoundingClientRect(), hitAt: hitAt,
    };
  }

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    clearTimeout(panelTimer);
    clearTimeout(pulseTimer);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerUp, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('message', onMessage);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('dragenter', onDocDrag, true);
    document.removeEventListener('dragover', onDocDrag, true);
    document.removeEventListener('dragend', onDocDragEnd, true);
    document.removeEventListener('drop', onDocDragEnd, true);
    window.removeEventListener('blur', onDocDragEnd);
    layer.removeEventListener('dragover', onLayerDragOver);
    layer.removeEventListener('dragleave', onLayerDragLeave);
    layer.removeEventListener('drop', onLayerDrop);
    grip.removeEventListener('pointerdown', onGripDown);
    if (edgeWorker) { try { edgeWorker.terminate(); } catch (e) { /* 已退出 */ } }
    if (renderer) { try { renderer.dispose(); } catch (e) { /* 已丢上下文 */ } }
    document.documentElement.classList.remove('oc-notch-active');
    layer.remove();
  }

  return { element: layer, sync, status, resetPosition, destroy, react, signal };
}
