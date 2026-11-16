// FilmCraft 时间线的纯计算：吸附、夹取、命中判定、裁切、跨轨道与重叠检查。
// 不碰 DOM，浏览器与 node --test 共用同一份实现。
// 片段结构：{ media, start, track, in, out }；in/out 是相对素材的秒数，
// 片段在时间线上的可见时长固定为 out - in。

export const TRACKS = ['V2', 'V1', 'A1'];
export const SNAP = 0.1;       // 吸附步长（秒）
export const MIN_DUR = 0.5;    // 片段最短时长（秒）
export const EDGE_HOT = 6;     // 左右边缘热区宽度（像素）

// 四舍五入到 step 的倍数；末尾用 1e6 再归一次，消掉 0.1 步长的浮点尾巴
// （例如 1.2000000000000002 → 1.2），便于严格相等断言。
export function snap(value, step) {
  const s = step > 0 ? step : SNAP;
  const n = Math.round((Number(value) || 0) / s);
  // + 0 把 -0 归成 0，便于严格相等断言。
  return Math.round(n * s * 1e6) / 1e6 + 0;
}

// 片段可见时长。
export function clipDur(clip) {
  return clip.out - clip.in;
}

// start 合法区间是 [0, DUR - dur]，保证片段不会越过序列右端。
export function clampStart(start, DUR, dur) {
  const hi = Math.max(0, DUR - dur);
  const v = Number(start) || 0;
  if (v < 0) return 0;
  if (v > hi) return hi;
  return v;
}

// 横向拖动：先把位移吸附到 0.1s，再移动并夹取，最后对结果再吸附一次。
export function moveStart(origStart, deltaT, DUR, dur) {
  const moved = (Number(origStart) || 0) + snap(deltaT, SNAP);
  return clampStart(snap(moved, SNAP), DUR, dur);
}

// 命中判定：localX 是相对片段左边缘的像素坐标，widthPx 是片段像素宽度。
// 命中左 6px → 'left'，右 6px → 'right'，其余 → 'move'。
export function hitEdge(localX, widthPx, hot) {
  const hz = hot > 0 ? hot : EDGE_HOT;
  const x = Number(localX) || 0;
  const w = Number(widthPx) || 0;
  if (x <= hz) return 'left';
  if (x >= w - hz) return 'right';
  return 'move';
}

// 左边缘裁切：只改 in（并让 start 同步平移以保持右边缘不动），out 不变。
// in 夹取到 [0, out - MIN_DUR]，同时保证 start 不为负。
export function trimLeft(origStart, origIn, out, deltaT, minDur) {
  const md = minDur > 0 ? minDur : MIN_DUR;
  const maxIn = out - md;                       // in 不得把片段压到短于最小时长
  const minIn = Math.max(0, origIn - origStart); // start = origStart + (in - origIn) >= 0
  let nextIn = (Number(origIn) || 0) + (Number(deltaT) || 0);
  if (nextIn < minIn) nextIn = minIn;
  if (nextIn > maxIn) nextIn = maxIn;
  const nextStart = origStart + (nextIn - origIn);
  return { start: nextStart, in: nextIn, out: out };
}

// 右边缘裁切：只改 out（start / in 不动），out 夹取到 [in + MIN_DUR, mediaDur]。
export function trimRight(inPoint, origOut, deltaT, mediaDur, minDur) {
  const md = minDur > 0 ? minDur : MIN_DUR;
  const minOut = inPoint + md;
  const maxOut = Number(mediaDur) || 0;
  let nextOut = (Number(origOut) || 0) + (Number(deltaT) || 0);
  if (nextOut < minOut) nextOut = minOut;
  if (nextOut > maxOut) nextOut = maxOut;
  // 素材比最小时长还短时，上界优先，避免出现 out - in < 0 的反向片段。
  if (minOut > maxOut) nextOut = maxOut;
  return { in: inPoint, out: nextOut };
}

// 跨轨道：把任意（可能越界的）轨道序号夹到合法轨道列表内并返回轨道名。
export function legalTrack(tracks, index) {
  const list = Array.isArray(tracks) ? tracks : TRACKS;
  if (!list.length) return '';
  let i = Math.round(Number(index) || 0);
  if (i < 0) i = 0;
  if (i > list.length - 1) i = list.length - 1;
  return list[i];
}

// 同轨道重叠检查：把 moveIndex 排除后，看候选区间 [start, start+dur)
// 是否与任一其它片段的 [c.start, c.start+dur) 相交。
// 1e-9 容差让「首尾相接」（如 [0,4) 与 [4,9)）不算重叠。
export function overlaps(clips, moveIndex, start, track, dur) {
  for (let i = 0; i < clips.length; i++) {
    if (i === moveIndex) continue;
    const c = clips[i];
    if (c.track !== track) continue;
    const cd = clipDur(c);
    if (start < c.start + cd - 1e-9 && start + dur > c.start + 1e-9) return true;
  }
  return false;
}
