// 关键帧引擎：三次贝塞尔求值/反解、通道求值（含边界外插）、CSS 语义缓动、轨道采样。
// 纯函数模块：不碰 window/document/localStorage，时间单位由调用方决定（NEXLOS 统一用毫秒）。
// 语义对齐上游 ArtCraft：frontend/libs/components/video-editor/src/lib/animation/{bezier,interpolation}.ts
// 与 pagescene/src/lib/engine/timeline/interpolation.ts。

// 二分次数：上游 bezier.ts:10 取 20，时间轴尺度下可达亚像素精度。
export var BEZIER_SOLVE_ITERATIONS = 20;

// 三次贝塞尔单点求值：B(t) = Σ C(3,i)·(1-t)^(3-i)·t^i·p_i
export function bezierPoint(progress, p0, p1, p2, p3) {
  var mt = 1 - progress;
  return mt * mt * mt * p0 +
    3 * mt * mt * progress * p1 +
    3 * mt * progress * progress * p2 +
    progress * progress * progress * p3;
}

// 默认右手柄：指向下一键方向的 span/3（上游 bezier.ts:34）
export function defaultRightHandle(leftKey, rightKey) {
  var span = rightKey.time - leftKey.time;
  return { dt: span / 3, dv: (rightKey.value - leftKey.value) / 3 };
}

// 默认左手柄：镜像，dt 为负（上游 bezier.ts:49）
export function defaultLeftHandle(leftKey, rightKey) {
  var span = rightKey.time - leftKey.time;
  return { dt: -span / 3, dv: -(rightKey.value - leftKey.value) / 3 };
}

// 时间 → 曲线进度：贝塞尔在时间轴上不可闭式求逆，用二分（上游 bezier.ts:66）。
export function solveProgress(time, leftKey, rightKey) {
  var lower = 0;
  var upper = 1;
  var rightHandle = leftKey.rightHandle || defaultRightHandle(leftKey, rightKey);
  var leftHandle = rightKey.leftHandle || defaultLeftHandle(leftKey, rightKey);
  var p1 = leftKey.time + rightHandle.dt;
  var p2 = rightKey.time + leftHandle.dt;
  for (var i = 0; i < BEZIER_SOLVE_ITERATIONS; i++) {
    var mid = (lower + upper) / 2;
    var estimate = bezierPoint(mid, leftKey.time, p1, p2, rightKey.time);
    if (estimate < time) lower = mid;
    else upper = mid;
  }
  return (lower + upper) / 2;
}

// 通道规范化：排序 + 补默认段类型 + 手柄 dt 夹到本段跨度内（上游 interpolation.ts:60-160）。
// 注意：上游时间单位是整数 tick，夹取下界写死 1；NEXLOS 用毫秒/秒，夹取必须单位无关，
// 否则 1 个"单位"会把 0.4 秒的手柄撑到 1 秒，控制点越过右键导致曲线非单调。
export function normalizeChannel(channel) {
  if (!channel || !channel.keys) return { keys: [], extrapolation: channel && channel.extrapolation };
  var keys = channel.keys.slice().sort(function (a, b) { return a.time - b.time; });
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var next = keys[i + 1];
    var prev = keys[i - 1];
    // 右手柄属于「本键 → 下一键」段，左手柄属于「上一键 → 本键」段，各自按本段跨度夹取。
    var rightLimit = next ? Math.max(0, next.time - key.time) : 0;
    var leftLimit = prev ? Math.max(0, key.time - prev.time) : 0;
    var right = key.rightHandle;
    var left = key.leftHandle;
    if (right) right = { dt: Math.min(rightLimit, Math.max(0, right.dt)), dv: right.dv };
    if (left) left = { dt: Math.max(-leftLimit, Math.min(0, left.dt)), dv: left.dv };
    out.push({
      time: key.time,
      value: key.value,
      segmentToNext: key.segmentToNext || 'linear',
      tangentMode: key.tangentMode || 'flat',
      rightHandle: right,
      leftHandle: left
    });
  }
  return { keys: out, extrapolation: channel.extrapolation };
}

// 边界外插：hold 取端点值，linear 用相邻键的斜率外推（上游 interpolation.ts:215）。
function extrapolateEdge(mode, edgeKey, neighborKey, time) {
  if (mode === 'hold' || !neighborKey) return edgeKey.value;
  var span = neighborKey.time - edgeKey.time;
  if (span === 0) return edgeKey.value;
  return edgeKey.value + ((time - edgeKey.time) / span) * (neighborKey.value - edgeKey.value);
}

// 标量通道求值：段内支持 step/linear/bezier 三种，边界默认 hold。
export function sampleChannel(channel, time, fallbackValue) {
  var normalized = normalizeChannel(channel);
  var keys = normalized.keys;
  var fallback = fallbackValue === undefined ? 0 : fallbackValue;
  if (keys.length === 0) return fallback;

  var first = keys[0];
  var last = keys[keys.length - 1];
  var before = (normalized.extrapolation && normalized.extrapolation.before) || 'hold';
  var after = (normalized.extrapolation && normalized.extrapolation.after) || 'hold';

  if (time <= first.time) {
    if (time < first.time) return extrapolateEdge(before, first, keys[1], time);
    return first.value;
  }
  if (time >= last.time) {
    if (time > last.time) return extrapolateEdge(after, last, keys[keys.length - 2], time);
    return last.value;
  }

  for (var i = 0; i < keys.length - 1; i++) {
    var leftKey = keys[i];
    var rightKey = keys[i + 1];
    if (time === rightKey.time) return rightKey.value;
    if (time < leftKey.time || time > rightKey.time) continue;
    if (leftKey.segmentToNext === 'step') return leftKey.value;

    var span = rightKey.time - leftKey.time;
    if (span === 0) return rightKey.value;
    var progress = Math.min(1, Math.max(0, (time - leftKey.time) / span));
    if (leftKey.segmentToNext === 'linear') {
      return leftKey.value + (rightKey.value - leftKey.value) * progress;
    }

    var curveProgress = solveProgress(time, leftKey, rightKey);
    var rightHandle = leftKey.rightHandle || defaultRightHandle(leftKey, rightKey);
    var leftHandle = rightKey.leftHandle || defaultLeftHandle(leftKey, rightKey);
    return bezierPoint(
      curveProgress,
      leftKey.value,
      leftKey.value + rightHandle.dv,
      rightKey.value + leftHandle.dv,
      rightKey.value
    );
  }
  return last.value;
}

// 离散通道求值：逐步 hold，取最后一个 time <= 目标值的键（上游 interpolation.ts:360）。
export function sampleDiscreteChannel(channel, time, fallbackValue) {
  if (!channel || !channel.keys || channel.keys.length === 0) return fallbackValue;
  var keys = channel.keys.slice().sort(function (a, b) { return a.time - b.time; });
  var current = fallbackValue;
  for (var i = 0; i < keys.length; i++) {
    if (time < keys[i].time) break;
    current = keys[i].value;
  }
  return current;
}

// CSS cubic-bezier() 语义：端点固定 (0,0)/(1,1)，控制点由 preset 给出。
export var EASING = {
  LINEAR: { p1x: 0, p1y: 0, p2x: 1, p2y: 1 },
  EASE_IN: { p1x: 0.42, p1y: 0, p2x: 1, p2y: 1 },
  EASE_OUT: { p1x: 0, p1y: 0, p2x: 0.58, p2y: 1 },
  EASE_IN_OUT: { p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 }
};

// 单轴求值：B(t) = ((a·t + b)·t + c)·t，其中 c=3a1, b=3(a2-a1)-c, a=1-c-b。
function bezierAxis(t, a1, a2) {
  var c = 3 * a1;
  var b = 3 * (a2 - a1) - c;
  var a = 1 - c - b;
  return ((a * t + b) * t + c) * t;
}

function bezierAxisDerivative(t, a1, a2) {
  var c = 3 * a1;
  var b = 3 * (a2 - a1) - c;
  var a = 1 - c - b;
  return (3 * a * t + 2 * b) * t + c;
}

// 给定归一化进度 x 求缓动后的 y：牛顿迭代解 x(t)=x，再读 y(t)（上游 pagescene interpolation.ts:25）。
export function easeY(easing, x) {
  var spec = easing || EASING.LINEAR;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  var t = x;
  for (var i = 0; i < 8; i++) {
    var err = bezierAxis(t, spec.p1x, spec.p2x) - x;
    if (Math.abs(err) < 1e-5) break;
    var d = bezierAxisDerivative(t, spec.p1x, spec.p2x);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  t = Math.min(1, Math.max(0, t));
  return bezierAxis(t, spec.p1y, spec.p2y);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpVec3(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

// 轨道采样：键外 clamp 到端点，段内按该键的 easing 逐分量插值（上游 sampleTrackAt）。
// keys: [{time, transform:{position,rotation,scale}, easing}]
export function sampleTrack(keys, time) {
  if (!keys || keys.length === 0) return null;
  if (keys.length === 1 || time <= keys[0].time) return keys[0].transform;
  var last = keys[keys.length - 1];
  if (time >= last.time) return last.transform;

  for (var i = 0; i < keys.length - 1; i++) {
    var a = keys[i];
    var b = keys[i + 1];
    if (time < a.time || time > b.time) continue;
    var span = b.time - a.time;
    var x = span <= 0 ? 0 : (time - a.time) / span;
    var eased = easeY(a.easing, x);
    return {
      position: lerpVec3(a.transform.position, b.transform.position, eased),
      rotation: lerpVec3(a.transform.rotation, b.transform.rotation, eased),
      scale: lerpVec3(a.transform.scale, b.transform.scale, eased)
    };
  }
  return last.transform;
}
