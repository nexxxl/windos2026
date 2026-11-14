// CSS 渐变：解析 linear/radial、计算几何、归一化色标、画进 Canvas。
// 对齐上游 ArtCraft：video-editor/src/lib/gradients/{parser,canvas}.ts（原 parser 源自
// rafaelcaricio/gradient-parser，MIT）。这里只覆盖 NEXLOS 用得到的子集：
// 角度/方位关键词、circle/ellipse、extent 关键词、at 位置、% 与 px 色标。
// 几何是纯函数；只有 drawGradient 需要传入 ctx。

var SIDES = { top: 0, right: 90, bottom: 180, left: 270 };

// 顶层逗号切分：括号内的逗号（rgb(1,2,3)）不拆。
function splitTopLevel(text) {
  var parts = [];
  var depth = 0;
  var start = 0;
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

// 「to right bottom」这类方位词换算成角度（0° 向上，顺时针）。
export function sideToAngle(text) {
  var words = String(text || '').replace(/^to\s+/i, '').trim().split(/\s+/);
  if (words.length === 1) {
    var a = SIDES[words[0].toLowerCase()];
    if (a === undefined) return null;
    return a;
  }
  if (words.length === 2) {
    var set = {};
    set[words[0].toLowerCase()] = 1;
    set[words[1].toLowerCase()] = 1;
    if (set.top) return set.right ? 45 : 315;
    if (set.bottom) return set.right ? 135 : 225;
    if (set.left) return set.top ? 315 : set.bottom ? 225 : 270;
    if (set.right) return set.top ? 45 : 135;
  }
  return null;
}

function parseAngle(text) {
  var t = String(text || '').trim();
  var m = /^(-?[\d.]+)deg$/i.exec(t);
  if (m) return Number(m[1]);
  var rad = /^(-?[\d.]+)rad$/i.exec(t);
  if (rad) return (Number(rad[1]) * 180) / Math.PI;
  var turn = /^(-?[\d.]+)turn$/i.exec(t);
  if (turn) return Number(turn[1]) * 360;
  return null;
}

// 位置分量：关键词或百分比/像素。返回 {kind:'percent'|'px'|'keyword', value}
function parsePositionPart(text) {
  var t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'left' || t === 'right' || t === 'top' || t === 'bottom' || t === 'center') {
    return { kind: 'keyword', value: t };
  }
  var pct = /^(-?[\d.]+)%$/.exec(t);
  if (pct) return { kind: 'percent', value: Number(pct[1]) / 100 };
  var px = /^(-?[\d.]+)px$/.exec(t);
  if (px) return { kind: 'px', value: Number(px[1]) };
  return null;
}

// 「at 20% 30%」或「at left bottom」→ {x,y}（0..1 的比例 + 可选像素偏移）。
function parseAt(text) {
  var body = String(text || '').replace(/^at\s+/i, '').trim();
  if (!body) return null;
  var parts = body.split(/\s+/);
  var out = { x: { kind: 'percent', value: 0.5 }, y: { kind: 'percent', value: 0.5 } };
  if (parts.length === 1) {
    var only = parsePositionPart(parts[0]);
    if (!only) return null;
    if (only.value === 'top' || only.value === 'bottom') out.y = only;
    else out.x = only;
    return out;
  }
  if (parts.length >= 2) {
    var a = parsePositionPart(parts[0]);
    var b = parsePositionPart(parts[1]);
    if (!a || !b) return null;
    if (a.value === 'top' || a.value === 'bottom') { out.y = a; out.x = b; }
    else { out.x = a; out.y = b; }
    return out;
  }
  return out;
}

function resolvePositionPart(part, axisSize) {
  if (!part) return axisSize / 2;
  if (part.kind === 'percent') return part.value * axisSize;
  if (part.kind === 'px') return part.value;
  if (part.value === 'left' || part.value === 'top') return 0;
  if (part.value === 'right' || part.value === 'bottom') return axisSize;
  return axisSize / 2; // center
}

function parseColor(text) {
  var t = String(text || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(t)) return t;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(t)) return t;
  if (/^[a-z]+$/i.test(t)) return t; // 具名色（red、transparent…）直接交给 canvas
  return null;
}

// 色标：颜色 + 可选位置（% 或 px）。位置缺失时留 null，稍后统一补齐。
function parseStop(text) {
  var t = String(text || '').trim();
  var m = /^(.*?)\s+(-?[\d.]+)(%|px)?$/.exec(t);
  if (m) {
    var color = parseColor(m[1]);
    if (color) {
      // 单位统一成 'percent' / 'px'，避免把 '%' 当成像素再除一次长度。
      var pos = { value: Number(m[2]), unit: m[3] === 'px' ? 'px' : 'percent' };
      return { color: color, position: pos };
    }
  }
  var only = parseColor(t);
  return only ? { color: only, position: null } : null;
}

// 解析一条 CSS 渐变字符串。无法识别时返回 null。
export function parseGradient(css) {
  var text = String(css || '').trim();
  var head = /^(repeating-)?(linear|radial)-gradient\(/i.exec(text);
  if (!head) return null;
  if (text.charAt(text.length - 1) !== ')') return null;
  var kind = head[2].toLowerCase();
  var body = text.slice(head[0].length, -1).trim();
  var args = splitTopLevel(body);
  if (args.length === 0) return null;

  var out = { repeat: !!head[1], type: kind, angle: 180, radial: null, stops: [] };
  var stopArgs = args;

  if (kind === 'linear') {
    var first = args[0];
    var angle = parseAngle(first);
    if (angle !== null) { out.angle = angle; stopArgs = args.slice(1); }
    else if (/^to\s+/i.test(first)) {
      var side = sideToAngle(first);
      if (side !== null) { out.angle = side; stopArgs = args.slice(1); }
    }
  } else {
    var spec = args[0];
    var radial = { shape: 'ellipse', extent: 'farthest-corner', at: null };
    var consumed = false;
    if (/(circle|ellipse|closest|farthest|at\s)/i.test(spec) && !parseStop(spec)) {
      var atMatch = /\bat\s+(.+)$/i.exec(spec);
      if (atMatch) { radial.at = parseAt(atMatch[1]); spec = spec.slice(0, atMatch.index).trim(); }
      if (/\bcircle\b/i.test(spec)) radial.shape = 'circle';
      else if (/\bellipse\b/i.test(spec)) radial.shape = 'ellipse';
      var extent = /(closest|farthest)-(side|corner)/i.exec(spec);
      if (extent) radial.extent = extent[0].toLowerCase();
      if (/(^|\s)(\d|left|right|top|bottom|center)/i.test(spec.replace(/circle|ellipse|closest-\w+|farthest-\w+/gi, '').trim())) {
        var bare = parseAt(spec.replace(/circle|ellipse|closest-\w+|farthest-\w+/gi, '').trim());
        if (bare) radial.at = bare;
      }
      consumed = true;
    }
    out.radial = radial;
    if (consumed) stopArgs = args.slice(1);
  }

  for (var i = 0; i < stopArgs.length; i++) {
    var stop = parseStop(stopArgs[i]);
    if (stop) out.stops.push(stop);
  }
  if (out.stops.length < 2) return null;
  return out;
}

// 色标位置归一化：全缺省→均匀；首个已知位置前均分；两个已知位置之间均分；最后夹成单调不减。
export function normalizeStops(stops, length) {
  var n = stops.length;
  var offsets = new Array(n);
  var span = length > 0 ? length : 1;
  var i;
  var known = 0;
  for (i = 0; i < n; i++) {
    offsets[i] = stops[i].position ? stops[i].position.value : null;
    if (stops[i].position) {
      offsets[i] = stops[i].position.unit === 'percent' ? offsets[i] / 100 : offsets[i] / span;
    }
    if (offsets[i] !== null) known++;
  }
  if (known === 0) {
    var step = n === 1 ? 0 : 1 / (n - 1);
    for (i = 0; i < n; i++) offsets[i] = i * step;
  } else {
    var firstKnown = -1;
    for (i = 0; i < n; i++) { if (offsets[i] !== null) { firstKnown = i; break; } }
    if (firstKnown > 0) {
      for (i = 0; i < firstKnown; i++) {
        offsets[i] = (offsets[firstKnown] * i) / firstKnown;
      }
    }
    for (i = firstKnown + 1; i < n; i++) {
      if (offsets[i] !== null) continue;
      var endIndex = i;
      while (endIndex < n && offsets[endIndex] === null) endIndex++;
      if (endIndex >= n) {
        // 尾巴没有已知位置：保持上一个值
        for (var j = i; j < n; j++) offsets[j] = offsets[i - 1];
        break;
      }
      var gap = endIndex - (i - 1);
      var startValue = offsets[i - 1];
      var endValue = offsets[endIndex];
      for (var k = i; k < endIndex; k++) {
        offsets[k] = startValue + ((endValue - startValue) * (k - (i - 1))) / gap;
      }
      i = endIndex;
    }
  }
  // 单调不减
  for (i = 1; i < n; i++) {
    if (offsets[i] < offsets[i - 1]) offsets[i] = offsets[i - 1];
  }
  return offsets;
}

// 线性渐变几何：0° 向上、顺时针；跨度取矩形在方向上的投影长度（canvas.ts:235）。
export function resolveLinearPoints(width, height, angle) {
  var radians = (angle * Math.PI) / 180;
  var dx = Math.sin(radians);
  var dy = -Math.cos(radians);
  var cx = width / 2;
  var cy = height / 2;
  var halfLength = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  return {
    x0: cx - dx * halfLength, y0: cy - dy * halfLength,
    x1: cx + dx * halfLength, y1: cy + dy * halfLength,
    length: halfLength * 2
  };
}

function cornerDistance(cx, cy, width, height, farthest) {
  var xs = [cx, width - cx];
  var ys = [cy, height - cy];
  var best = farthest ? -1 : Infinity;
  for (var i = 0; i < 2; i++) {
    for (var j = 0; j < 2; j++) {
      var d = Math.sqrt(xs[i] * xs[i] + ys[j] * ys[j]);
      if (farthest ? d > best : d < best) best = d;
    }
  }
  return best;
}

// 径向渐变几何：center + rx/ry。extent 按 CSS 语义在「到边/到角」之间取。
export function resolveRadial(width, height, radial) {
  var spec = radial || {};
  var cx = resolvePositionPart(spec.at && spec.at.x, width);
  var cy = resolvePositionPart(spec.at && spec.at.y, height);
  var shape = spec.shape || 'ellipse';
  var extent = spec.extent || 'farthest-corner';
  var left = cx, right = width - cx, top = cy, bottom = height - cy;
  var rx, ry;

  // 圆形只看一个半径：到边取最近/最远边距，到角取最近/最远角距。
  if (shape === 'circle') {
    var r;
    if (extent === 'closest-side') r = Math.min(left, right, top, bottom);
    else if (extent === 'farthest-side') r = Math.max(left, right, top, bottom);
    else if (extent === 'closest-corner') r = cornerDistance(cx, cy, width, height, false);
    else r = cornerDistance(cx, cy, width, height, true);
    return { cx: cx, cy: cy, rx: Math.max(0.001, r), ry: Math.max(0.001, r) };
  }

  if (extent === 'closest-side') {
    rx = Math.min(left, right);
    ry = Math.min(top, bottom);
  } else if (extent === 'farthest-side') {
    rx = Math.max(left, right);
    ry = Math.max(top, bottom);
  } else if (extent === 'closest-corner') {
    // 椭圆穿过最近角：两个方向同比放大到该角落在曲线上。
    rx = Math.min(left, right) * Math.SQRT2;
    ry = Math.min(top, bottom) * Math.SQRT2;
  } else {
    // farthest-corner：椭圆穿过最远角，两个半径按该角的水平/垂直距离等比放大。
    rx = Math.max(left, right) * Math.SQRT2;
    ry = Math.max(top, bottom) * Math.SQRT2;
  }
  return { cx: cx, cy: cy, rx: Math.max(0.001, rx), ry: Math.max(0.001, ry) };
}

function addStops(grad, ast, offsets) {
  for (var i = 0; i < ast.stops.length; i++) {
    grad.addColorStop(Math.min(1, Math.max(0, offsets[i])), ast.stops[i].color);
  }
  return grad;
}

// 在 ctx 上画满整块矩形；radial 用 scale 把圆变换成椭圆（canvas.ts:190）。
export function drawGradient(ctx, width, height, css) {
  var ast = parseGradient(css);
  if (!ast) return false;
  var grad;
  if (ast.type === 'linear') {
    var p = resolveLinearPoints(width, height, ast.angle);
    grad = addStops(ctx.createLinearGradient(p.x0, p.y0, p.x1, p.y1), ast, normalizeStops(ast.stops, p.length));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    return true;
  }
  var r = resolveRadial(width, height, ast.radial);
  var scaleY = r.ry / r.rx;
  // 椭圆：先在缩放后的坐标里建圆形渐变，再填充整块矩形；两者必须同一变换。
  ctx.save();
  ctx.translate(r.cx, r.cy);
  ctx.scale(1, scaleY);
  grad = addStops(ctx.createRadialGradient(0, 0, 0, 0, 0, r.rx), ast, normalizeStops(ast.stops, r.rx));
  ctx.fillStyle = grad;
  ctx.fillRect(-r.cx, -r.cy / scaleY, width, height / scaleY);
  ctx.restore();
  return true;
}
