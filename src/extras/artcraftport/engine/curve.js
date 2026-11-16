// 曲线：把折线采样点转成三次贝塞尔（Catmull-Rom → 贝塞尔控制点）。
// 画布与 SVG 共用同一份控制点，保证两条渲染路径逐像素接近。
export const DEFAULT_TENSION = 1;

// 返回 { start:{x,y}, segments:[{ c1:{x,y}, c2:{x,y}, p:{x,y} }] }。
// 少于两个点时曲线退化为一个点；重合点会产生零长段，由调用方自行忽略。
export function smoothPath(points, tension) {
  const list = Array.isArray(points) ? points : [];
  const start = list.length ? { x: list[0].x, y: list[0].y } : { x: 0, y: 0 };
  const segments = [];
  if (list.length < 2) return { start: start, segments: segments };
  const t = (tension === undefined || tension === null ? DEFAULT_TENSION : tension) / 6;
  for (let i = 0; i < list.length - 1; i++) {
    const p0 = list[Math.max(0, i - 1)];
    const p1 = list[i];
    const p2 = list[i + 1];
    const p3 = list[Math.min(list.length - 1, i + 2)];
    segments.push({
      // 控制点只由相邻点决定，端点用自身补位，曲线自然收在首尾点上。
      c1: { x: p1.x + (p2.x - p0.x) * t, y: p1.y + (p2.y - p0.y) * t },
      c2: { x: p2.x - (p3.x - p1.x) * t, y: p2.y - (p3.y - p1.y) * t },
      p: { x: p2.x, y: p2.y },
    });
  }
  return { start: start, segments: segments };
}

// SVG path 的 d 属性；只有两个点时会生成一条直线三次曲线（C 命令仍在）。
export function pathToD(points, tension) {
  const curve = smoothPath(points, tension);
  const parts = ['M ' + num(curve.start.x) + ' ' + num(curve.start.y)];
  curve.segments.forEach((s) => {
    parts.push('C ' + num(s.c1.x) + ' ' + num(s.c1.y) + ' ' + num(s.c2.x) + ' ' + num(s.c2.y) + ' ' + num(s.p.x) + ' ' + num(s.p.y));
  });
  return parts.join(' ');
}

function num(v) {
  // 控制点常有 1e-14 级噪声；保留两位小数足以覆盖像素精度，同时让导出更短。
  return Math.round(v * 100) / 100;
}
