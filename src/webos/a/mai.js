// 脉语言 · Web 运行时切片
// 分层职责：
//   L0 Pulse / PulsePipe     流动的值，而不是回调参数
//   L1 Context               版本化快照 + 监听
//   L2 Kernel                事件总线（Worker 留给重活）
//   Web host                 VDOM、手势、震动、视口
// 这是外壳的运行时切片，不是完整的 MAI 语言实现；没有语法、编译器与 capability 沙箱。

// ---------- L0：Pulse ----------

let pulseSeq = 0;
let logicalClock = 0;

export class Pulse {
  constructor(kind, payload, meta) {
    const m = meta || {};
    this.id = (++pulseSeq).toString(36) + '-' + Date.now().toString(36);
    this.schema = 'mai/pulse@0.1';
    this.kind = kind;
    this.payload = payload == null ? null : payload;
    this.source = m.source || 'ui';
    this.target = m.target || '';
    this.causationId = m.causationId || '';
    this.correlationId = m.correlationId || '';
    this.logicalTime = ++logicalClock;
    this.observedAt = new Date().toISOString();
  }
}

export class PulsePipe {
  constructor(name) {
    this.name = name || 'pipe';
    this.handlers = [];
    this.sinks = [];
  }
  flowTo(fn) { this.handlers.push(fn); return this; }
  fork(fns) { this.sinks = this.sinks.concat(fns || []); return this; }
  emit(kind, payload, meta) {
    let p = new Pulse(kind, payload, meta);
    for (const fn of this.handlers) {
      p = fn(p);
      if (!p) return null;
    }
    for (const fn of this.sinks) {
      try { fn(p); } catch (e) { console.error('[mai] sink error', e); }
    }
    return p;
  }
}

// ---------- L1：Context ----------

export function createContext(name, initial, parent) {
  const inherited = parent ? parent.snapshot().state : {};
  let state = Object.assign({}, inherited, initial || {});
  let version = 1;
  const watchers = {};
  const ctx = {
    name,
    get(key) { return state[key]; },
    snapshot() { return { name, version, state: Object.assign({}, state) }; },
    set(patch) {
      const prev = state;
      state = Object.assign({}, state, patch);
      version++;
      Object.keys(patch).forEach((key) => {
        const list = watchers[key];
        if (list) list.slice().forEach((fn) => fn(state[key], prev[key]));
      });
      return ctx.snapshot();
    },
    watch(key, fn) {
      (watchers[key] = watchers[key] || []).push(fn);
      return () => { watchers[key] = watchers[key].filter((f) => f !== fn); };
    },
    spawn(childName, childInitial) {
      return createContext(childName, childInitial || {}, ctx);
    }
  };
  return ctx;
}

// ---------- L2：Kernel ----------

const channels = {};

export const Kernel = {
  on(channel, fn) {
    (channels[channel] = channels[channel] || []).push(fn);
    return () => Kernel.off(channel, fn);
  },
  off(channel, fn) {
    if (channels[channel]) channels[channel] = channels[channel].filter((f) => f !== fn);
  },
  once(channel, fn) {
    const wrap = (data) => { fn(data); Kernel.off(channel, wrap); };
    Kernel.on(channel, wrap);
  },
  emit(channel, data) {
    const list = channels[channel];
    if (!list) return;
    list.slice().forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[mai] channel error', channel, e); }
    });
  }
};

// ---------- 追踪：最近 200 个 Pulse ----------

const traceLog = [];

function remember(p) {
  traceLog.push(p);
  if (traceLog.length > 200) traceLog.shift();
}

export function trace() { return traceLog.slice(); }
export function lastPulse() { return traceLog[traceLog.length - 1] || null; }

// ---------- L3：Effect（显式能力） ----------

const effects = {};
const capabilities = { dom: true, storage: true, haptic: true, net: false, ai: false, device: false };

export function defineEffect(name, capability, fn) {
  effects[name] = { capability, fn };
}

export function runEffect(name, payload) {
  const e = effects[name];
  if (!e) throw new Error('unknown effect: ' + name);
  if (!capabilities[e.capability]) throw new Error('capability denied: ' + e.capability);
  return e.fn(payload);
}

export function allowCapability(name, on) { capabilities[name] = !!on; }
export function capabilitySnapshot() { return Object.assign({}, capabilities); }

// ---------- Web host：震动 ----------

const HAPTIC = {
  tap: 8,
  open: 10,
  close: 12,
  snap: 16,
  error: [18, 28, 18]
};

export function haptic(kind) {
  const pattern = HAPTIC[kind];
  if (pattern == null) return;
  try {
    if (window.webosBridge && window.webosBridge.vibrate) {
      window.webosBridge.vibrate(kind);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* iOS Safari 没有震动，静默降级 */ }
}

// ---------- Web host：rAF 合并 ----------

export function rafThrottle(fn) {
  let scheduled = false;
  let frame = 0;
  let lastArgs = null;
  let lastThis = null;

  function run() {
    scheduled = false;
    frame = 0;
    fn.apply(lastThis, lastArgs);
  }

  function throttled() {
    lastArgs = arguments;
    lastThis = this;
    if (scheduled) return;
    scheduled = true;
    frame = requestAnimationFrame(run);
  }

  // 收尾时立刻吃掉最后一帧：指针抬起前的那次移动不能丢。
  throttled.flush = () => {
    if (!scheduled) return;
    cancelAnimationFrame(frame);
    run();
  };
  throttled.cancel = () => {
    if (!scheduled) return;
    cancelAnimationFrame(frame);
    scheduled = false;
    frame = 0;
  };
  return throttled;
}

export function afterPaint(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

export function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

// ---------- Web host：视口与键盘 ----------

export function isCoarse() {
  try { return window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760; } catch (e) { return false; }
}

export function watchViewport(onChange) {
  let lastH = 0;
  const apply = () => {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    if (Math.abs(h - lastH) < 1) return;
    lastH = h;
    document.documentElement.style.setProperty('--os-vv-h', h + 'px');
    // 软键盘会把可视区压掉一大截；120px 是区分“键盘”与“地址栏收缩”的经验线。
    const keyboard = vv ? h < window.innerHeight - 120 : false;
    document.documentElement.classList.toggle('os-keyboard', keyboard);
    if (onChange) onChange(keyboard, h);
  };
  const onWin = () => apply();
  const onVV = () => apply();
  window.addEventListener('resize', onWin, { passive: true });
  window.addEventListener('orientationchange', onWin, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onVV, { passive: true });
    window.visualViewport.addEventListener('scroll', onVV, { passive: true });
  }
  apply();
  apply.off = () => {
    window.removeEventListener('resize', onWin);
    window.removeEventListener('orientationchange', onWin);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', onVV);
      window.visualViewport.removeEventListener('scroll', onVV);
    }
  };
  return apply;
}

// ---------- Web host：移动端标题栏手势 ----------

// 一套手势同时覆盖三件事：
//   1. 单指拖拽 = 移动窗口（跟手写 left/top，rAF 合并）
//   2. 双击标题栏 = 最大化 / 还原
//   3. 双指捏合 = 窗口缩放（transform: scale，锚定窗口中心；事件到达即落地）
// 长按仍然弹菜单。触屏没有鼠标的 hover 与右键，这些是它的替代入口。
export function bindTitleGestures(title, win, opts) {
  const o = opts || {};
  // 手势面默认是标题栏；浮层（shield）是第二块面：第一根手指按下标题栏后，
  // 它临时盖住应用内容，让第二根手指落在同一个文档里，双指才能配对。
  const surfaces = o.surface && o.surface !== title ? [title, o.surface] : [title];
  const pointers = new Map();
  let start = null;
  let pinch = null;
  let moved = false;
  let longTimer = 0;
  let tapTimer = 0;
  let lastTap = 0;
  let frame = 0;
  let pendingDrag = null;
  // 缩放也按帧合并：触摸事件的频率高于刷新率，逐事件写样式会把主线程压满。
  // 海南浏览器的做法是 touchmove 只记录位置，rAF 里算一次、写一次。
  // iframe 里发起的双指手势：iframe 是独立文档，父页面收不到它内部的触摸，
  // 同源应用由 os.js 转发进来，走同一套 onPinchStart / onPinch / onPinchEnd。
  let outer = null;

  function clearLong() {
    if (longTimer) { clearTimeout(longTimer); longTimer = 0; }
  }
  function clearTap() {
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = 0; }
  }
  function cancelFrame() {
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
  }
  function points() {
    const out = [];
    pointers.forEach((p) => out.push(p));
    return out;
  }

  function down(e) {
    if (e.pointerType === 'mouse') return;
    if (e.target.closest('button, a, input, select, textarea')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // 指针捕获必须落在真正收到事件的那块面上：标题栏或临时浮层。
    const host = e.currentTarget || title;
    try { host.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件 */ }
    if (pointers.size === 1 && o.onPressStart) o.onPressStart();

    if (pointers.size === 2) {
      // 第二根手指落下：放弃拖拽与长按，进入缩放。
      clearLong();
      clearTap();
      cancelFrame();
      start = null;
      moved = false;
      pendingDrag = null;
      const pts = points();
      const d0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      pinch = {
        d0,
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
      };
      if (o.onPinchStart) o.onPinchStart(pinch.cx, pinch.cy);
      e.preventDefault();
      return;
    }
    if (pointers.size > 2) return;

    start = { x: e.clientX, y: e.clientY };
    moved = false;
    clearLong();
    longTimer = setTimeout(() => {
      longTimer = 0;
      if (!start || moved || pointers.size !== 1) return;
      const s = start;
      start = null;
      haptic('tap');
      if (o.onLongPress) o.onLongPress(s.x, s.y);
    }, 520);
  }

  function move(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && pointers.size >= 2) {
      e.preventDefault();
      const pts = points();
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      // 双指缩放同步落地：pointermove 逐事件写样式。
      // 中间隔一层 rAF 会晚一帧，快速捏合时手感发飘。
      if (o.onPinch) o.onPinch(d / pinch.d0, cx, cy);
      return;
    }

    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!moved && Math.abs(dx) + Math.abs(dy) > 8) {
      moved = true;
      clearLong();
      if (o.onDragStart) o.onDragStart(start.x, start.y);
    }
    if (!moved) return;
    e.preventDefault();
    pendingDrag = { dx, dy };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!pendingDrag || !moved) return;
      if (o.onDrag) o.onDrag(pendingDrag.dx, pendingDrag.dy);
    });
  }

  function up(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    // 最后一根手指离开就先撤浮层，后面各分支只做手势收尾。
    if (pointers.size === 0 && o.onPressEnd) o.onPressEnd();

    if (pinch) {
      if (pointers.size < 2) {
        pinch = null;
        if (o.onPinchEnd) o.onPinchEnd();
      }
      return;
    }
    if (!start) return;

    const s = start;
    start = null;
    clearLong();
    cancelFrame();
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const wasMoved = moved;
    moved = false;
    pendingDrag = null;

    if (wasMoved) {
      // 最后一帧同步落地：快速一划可能整个手势都在同一帧内结束，
      // rAF 里的位移还没执行就收尾会把窗口留在起点。观音签的拖拽是逐事件同步的。
      if (o.onDrag) o.onDrag(dx, dy);
      if (o.onDragEnd) o.onDragEnd();
      lastTap = 0;
      clearTap();
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) > 10) return;

    // 双击判定放在 tap 之后：第一次 tap 不做事，第二次在 320ms 内到达才算双击。
    const t = Date.now();
    if (t - lastTap < 320) {
      lastTap = 0;
      clearTap();
      if (o.onDoubleTap) o.onDoubleTap(e.clientX, e.clientY);
      return;
    }
    lastTap = t;
    clearTap();
    tapTimer = setTimeout(() => { lastTap = 0; tapTimer = 0; }, 340);
    if (o.onTap) o.onTap(e.clientX, e.clientY);
  }

  function cancel() {
    clearLong();
    clearTap();
    cancelFrame();
    const pending = pendingDrag;
    start = null;
    pinch = null;
    moved = false;
    pendingDrag = null;
    pointers.clear();
    if (o.onPressEnd) o.onPressEnd();
    if (o.onPinchEnd) o.onPinchEnd();
    // 被系统打断也先落地最后一帧，再由 onDragEnd 收尾。
    if (pending && o.onDrag) o.onDrag(pending.dx, pending.dy);
    if (o.onDragEnd) o.onDragEnd();
  }

  // 同源 iframe 转发进来的双指手势：父文档没有指针，单独记一份外部捏合状态。
  function outerStart(cx, cy, dist) {
    if (pointers.size) return false;
    if (outer) return true;
    outer = { d0: Math.max(1, Number(dist) || 1) };
    if (o.onPinchStart) o.onPinchStart(cx, cy);
    return true;
  }
  function outerMove(scale, cx, cy) {
    if (!outer) return;
    // 与直连指针同一节奏：事件到达即写样式，不隔帧。
    if (o.onPinch) o.onPinch(scale, cx, cy);
  }
  function outerEnd() {
    if (!outer) return;
    outer = null;
    if (o.onPinchEnd) o.onPinchEnd();
  }

  for (const surface of surfaces) {
    surface.addEventListener('pointerdown', down);
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', cancel);
    // 宿主 WebView（N Station 等）可能在半途夺走指针，只发 lostpointercapture。
    // 当成松手收尾，避免窗口停在 dragging 和未提交的 transform 上。
    surface.addEventListener('lostpointercapture', up);
  }
  const off = () => {
    clearLong();
    clearTap();
    cancelFrame();
    if (o.onPinchEnd) o.onPinchEnd();
    if (o.onPressEnd) o.onPressEnd();
    outer = null;
    for (const surface of surfaces) {
      surface.removeEventListener('pointerdown', down);
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', up);
      surface.removeEventListener('pointercancel', cancel);
      surface.removeEventListener('lostpointercapture', up);
    }
  };
  // os.js 通过这三个方法把 iframe 内的双指手势接进同一套回调。
  off.pinchStart = outerStart;
  off.pinchMove = outerMove;
  off.pinchEnd = outerEnd;
  return off;
}

// ---------- 应用生命周期：外壳与应用之间只传状态，不传数据 ----------

// 状态只有四个：active / background / hidden / suspend。
// active   窗口在前台，可以跑动画与摄像头
// background 窗口还活着但不在前台，暂停取景、压低动画频率
// hidden   整个页面被切走（换到别的 App），音乐可继续，视频应暂停
// suspend  外壳要回收 iframe，应用先自行释放摄像头/音频，随后被卸载
export function onLifecycle(fn) {
  function onMessage(e) {
    // 只有父窗口能改生命周期；应用内嵌的 iframe 不能替外壳发指令。
    if (e.source !== window.parent) return;
    const d = e.data;
    if (!d || d.type !== 'nexlos.lifecycle') return;
    if (typeof d.state === 'string') fn(d.state, d);
  }
  function onVisibility() {
    fn(document.visibilityState === 'hidden' ? 'hidden' : 'visible');
  }
  window.addEventListener('message', onMessage);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('message', onMessage);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function tellShell(type, payload) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(Object.assign({ type }, payload || {}), '*');
    }
  } catch (e) { /* 顶层窗口没有父级，忽略 */ }
}

// ---------- Web host：增量 DOM ----------

const streams = new WeakMap();

export const VDOM = {
  // 只改变化的文本，不重写整个节点。
  text(el, value) {
    const s = value == null ? '' : String(value);
    if (el.textContent !== s) el.textContent = s;
  },

  // 追加 HTML 片段；调用方保证内容已转义。
  append(container, html) {
    if (!html) return;
    container.insertAdjacentHTML('beforeend', html);
  },

  // 键值列表差异：创建、移动、删除，未变化的节点不重建。
  list(container, items, opts) {
    const o = opts || {};
    const keyOf = o.key || ((item) => item.id);
    const render = o.render || ((item) => String(item));
    const tag = o.tag || 'div';
    const cls = o.cls || '';
    const existing = {};
    Array.prototype.forEach.call(container.children, (child) => {
      const k = child.getAttribute('data-mai-key');
      if (k != null) existing[k] = child;
    });

    const seen = {};
    let cursor = container.firstElementChild;
    items.forEach((item) => {
      const k = String(keyOf(item));
      seen[k] = true;
      let node = existing[k];
      const html = render(item);
      if (!node) {
        node = document.createElement(tag);
        node.setAttribute('data-mai-key', k);
        if (cls) node.className = cls;
        node.innerHTML = html;
      } else if (node.__maiHtml !== html) {
        node.innerHTML = html;
      }
      node.__maiHtml = html;
      if (node === cursor) {
        cursor = cursor.nextElementSibling;
      } else {
        container.insertBefore(node, cursor);
      }
    });

    Array.prototype.slice.call(container.children).forEach((child) => {
      const k = child.getAttribute('data-mai-key');
      if (k != null && !seen[k]) container.removeChild(child);
    });
  },

  // 流式文本：同一帧内的片段合并成一次写入。
  stream(container, chunk) {
    let s = streams.get(container);
    if (!s) { s = { text: '', scheduled: false }; streams.set(container, s); }
    s.text += chunk;
    if (s.scheduled) return;
    s.scheduled = true;
    requestAnimationFrame(() => {
      s.scheduled = false;
      const text = s.text;
      s.text = '';
      if (text) container.appendChild(document.createTextNode(text));
    });
  }
};

// ---------- 一步到位：发一个脉冲 ----------

const PULSE_HAPTIC = {
  'app.open': 'open',
  'win.close': 'close',
  'win.minimize': 'tap',
  'win.maximize': 'snap',
  'win.restore': 'tap',
  'win.snap': 'snap',
  'win.switch': 'snap',
  'win.suspend': 'tap',
  'win.resume': 'tap',
  'win.swipe-close': 'close',
  'start.toggle': 'tap',
  'scan.hit': 'open',
  'scan.error': 'error'
};

export function pulse(kind, payload, target) {
  const p = new Pulse(kind, payload, { source: 'ui', target: target || '' });
  remember(p);
  Kernel.emit('pulse', p);
  Kernel.emit(kind, p);
  const h = PULSE_HAPTIC[kind];
  if (h) haptic(h);
  return p;
}

// 调试入口：控制台里 `__nexlosPulse` 能看到最近 100 个系统动作的因果链。
if (typeof window !== 'undefined') {
  Kernel.on('pulse', (p) => {
    try {
      const log = window.__nexlosPulse || (window.__nexlosPulse = []);
      log.push(p);
      if (log.length > 100) log.shift();
    } catch (e) { /* 只读沙箱忽略 */ }
  });
}
