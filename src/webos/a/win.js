// 窗口几何：纯函数，视口与尺寸全部作为参数传入。
// 浏览器、iframe 与 node:test 共用同一份数学，这里不读 window。
// 借鉴 daedalOS 的 Window/functions.ts（MIT）与 OWD 的 computeSnapRect（MIT）。

export const LAYOUT = Object.freeze({
  menubarH: 0,        // 0.5.0 起取消顶部菜单栏：工作区从视口顶端开始
  mobileMenubarH: 0,  // 窄屏同理
  // 现代主题的任务栏是一条浮空胶囊：58px 胶囊 + 14px 底部留白。
  // 高度必须按整块留白算，否则容器底部会露出旧任务栏的深色底色（视觉上是一条黑缝）。
  dockH: 78,          // 任务栏占用的底部高度（与 app.css 的 --os-dock-h 一致）
  mobileDockH: 68,    // 窄屏胶囊压扁一档（52 + 14 留白 + 2 余量）
  mobileMax: 760,     // 与 app.css 的移动端断点保持一致
  inset: 8,           // 浮动窗口与工作区边缘的间距
  mobileTopSafe: 32,  // 手机顶部留给系统状态栏下拉手势，窗口标题栏别贴在最上沿
  titleBarH: 32,      // 标题栏高度：拖出屏幕时至少要露出其中一部分
  grabX: 44,          // 窗口横向越界后仍留在屏幕内的可抓宽度（对齐观音签便签的 44）
  grabY: 28,          // 标题栏纵向越界后仍留在屏幕内的可抓高度（对齐便签的 28）
  tuckPeek: 18,       // 双击桌面收边时露在屏幕边缘的宽度
  cascade: 26,        // 同尺寸窗口的层叠错位
  edgeSnap: 8,        // 指针进入边缘多少像素内触发贴边
});

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

// 工作区 = 菜单栏以下、程序坞以上。移动端程序坞浮在底部，不占窗口区域。
export function metrics(viewport) {
  const width = Math.max(1, Math.round(viewport.width));
  const height = Math.max(1, Math.round(viewport.height));
  const mobile = width <= LAYOUT.mobileMax;
  const classic = viewport.appearance === 'win98';
  const touch = mobile || !!viewport.coarse;
  const fontSize = clamp(Math.round(Number(viewport.retroFontSize) || 12), 12, 24);
  const titleBarH = classic ? Math.max(touch ? 36 : 32, fontSize + 10) : (mobile ? 44 : 40);
  const grabY = classic ? Math.min(LAYOUT.grabY, titleBarH) : LAYOUT.grabY;
  const menubarH = mobile ? LAYOUT.mobileMenubarH : LAYOUT.menubarH;
  // dockExtra 是 iOS 安全区：任务栏本身要更高，工作区相应变矮。
  const dockExtra = Math.max(0, Number(viewport.dockExtra) || 0);
  const dockH = (classic ? Math.max(touch ? 52 : 44, fontSize + 22) : (mobile ? LAYOUT.mobileDockH : LAYOUT.dockH)) + dockExtra;
  return {
    mobile,
    classic,
    touch,
    titleBarH,
    grabY,
    controlW: classic ? (touch ? 40 : 24) : 46,
    controlH: classic ? (touch ? 30 : 22) : titleBarH,
    menubarH,
    dockH,
    // 手机顶部让出系统下拉手势区，否则标题栏贴顶时单指拖拽会被通知栏抢走。
    topSafe: mobile ? LAYOUT.mobileTopSafe : 0,
    work: {
      left: 0,
      top: menubarH,
      width,
      height: Math.max(160, height - menubarH - dockH),
    },
  };
}

// 把任意矩形收回工作区：浮动窗口四周留 inset，最大化走 snapRect。
export function clampRect(rect, win, viewport) {
  const m = metrics(viewport);
  const inset = LAYOUT.inset;
  const maxW = Math.max(1, m.work.width - inset * 2);
  const maxH = Math.max(1, m.work.height - inset * 2);
  const minW = Math.min(win.minWidth, maxW);
  const minH = Math.min(win.minHeight, maxH);
  const width = clamp(rect.width, minW, maxW);
  const height = clamp(rect.height, minH, maxH);
  const left = clamp(rect.left, inset, Math.max(inset, m.work.width - width - inset));
  const topMin = m.work.top + Math.max(inset, m.topSafe);
  const topMax = Math.max(topMin, m.work.top + m.work.height - height - inset);
  return { left, top: clamp(rect.top, topMin, topMax), width, height };
}

// 保持尺寸、只保证位置与上限合法。用于从最大化还原或视口变化：
// 贴边后的窗口可以窄于应用最小宽度，也可以贴着工作区边缘，还原时不该被撑大或缩进。
export function fitRect(rect, viewport) {
  const m = metrics(viewport);
  const { work } = m;
  const width = Math.min(Math.max(1, rect.width), work.width);
  const height = Math.min(Math.max(1, rect.height), Math.max(1, work.height - m.topSafe));
  const leftMax = Math.max(work.left, work.left + work.width - width);
  const topMax = Math.max(work.top, work.top + work.height - height);
  return {
    left: clamp(rect.left, work.left, leftMax),
    top: clamp(rect.top, work.top + m.topSafe, topMax),
    width,
    height,
  };
}

// 从最大化/收边还原、以及会话恢复：只把尺寸收回工作区，位置沿用用户拖出来的坐标。
// 拖动允许窗口压到任务栏下面（dragRect 的下界是整个视口），这类位置用 clampRect
// 会被顶回工作区，表现就是「还原时整扇窗往上跳」。这里只保证标题栏还留得住。
export function restoreRect(rect, viewport, zoom) {
  const m = metrics(viewport);
  const { work } = m;
  const z = clamp(Number(zoom) || 1, 0.6, 2);
  const width = Math.min(Math.max(1, rect.width), work.width);
  const height = Math.min(Math.max(1, rect.height), Math.max(1, work.height - m.topSafe));
  const leftMin = work.left + LAYOUT.grabX - width * z;
  const leftMax = work.left + viewport.width - LAYOUT.grabX;
  const topMin = m.grabY - m.titleBarH * z;
  const topMax = work.top + viewport.height - m.grabY;
  return {
    left: clamp(rect.left, leftMin, leftMax),
    top: clamp(rect.top, topMin, topMax),
    width,
    height,
  };
}

// 新窗口：按应用声明尺寸居中，按已开窗口数做层叠错位，再收回工作区。
export function defaultRect(win, index, viewport) {
  const m = metrics(viewport);
  const inset = LAYOUT.inset;
  const availableW = m.work.width - inset * 2;
  const availableH = m.work.height - inset * 2;
  // 窄屏给窗口留出可拖动的边距：贴满屏幕时单指拖拽与“还原”都看不出效果。
  const widthRatio = m.mobile ? 0.92 : 0.84;
  const width = Math.min(win.width, Math.round(m.work.width * widthRatio), availableW);
  const height = Math.min(win.height, Math.round(availableH * 0.88));
  const step = (Math.max(0, index) % 5) * LAYOUT.cascade;
  // 在工作区里真正居中：以前用 availableH 再减 12，窗口会整体偏上，
  // 在任务栏较高的屏幕上尤其明显。层叠错位只往下、往右加。
  return clampRect({
    left: Math.round((m.work.width - width) / 2) + step,
    top: m.work.top + Math.max(inset, m.topSafe, Math.round((m.work.height - height) / 2)) + step,
    width,
    height,
  }, win, viewport);
}

// 拖动只改位置：允许窗口越过四边、压到任务栏后面，
// 但始终留下可抓的标题栏条（横向 grabX、纵向 grabY 视觉像素）。
// 窗口用 transform: scale(zoom) 缩放，left/top 与 dx/dy 都是视觉像素；
// 可视尺寸 = 布局尺寸 × zoom（对齐观音签便签的视觉坐标）。
export function dragRect(start, dx, dy, viewport) {
  const m = metrics(viewport);
  const z = clamp(Number(start.zoom) || 1, 0.6, 2);
  const width = Math.max(1, start.width);
  const vw = Math.max(1, Math.round(viewport.width));
  const vh = Math.max(1, Math.round(viewport.height));
  // 窗口右缘至少留 grabX 在屏幕内；左缘同理，反向推出 left 的上下界。
  const leftMin = m.work.left + LAYOUT.grabX - width * z;
  const leftMax = m.work.left + vw - LAYOUT.grabX;
  // 标题栏底部至少留 grabY 在屏幕内；顶部可以探出屏幕。
  // 下界按整个视口算：窗口可以滑到任务栏后面，至少留 grabY 在屏幕里。
  const topMin = m.grabY - m.titleBarH * z;
  const topMax = m.work.top + vh - m.grabY;
  return {
    left: clamp(start.left + dx, leftMin, leftMax),
    top: clamp(start.top + dy, topMin, topMax),
  };
}

// 8 方向缩放：先改被拖动的边，再按最小尺寸回推，最后收回工作区。
export function resizeRect(start, dx, dy, dir, win, viewport) {
  const m = metrics(viewport);
  const inset = LAYOUT.inset;
  const maxRight = m.work.width - inset;
  const maxBottom = m.work.top + m.work.height - inset;
  const minLeft = m.work.left + inset;
  const minTop = m.work.top + Math.max(inset, m.topSafe);
  const minW = Math.min(win.minWidth, Math.max(1, maxRight - minLeft));
  const minH = Math.min(win.minHeight, Math.max(1, maxBottom - minTop));

  let left = start.left;
  let top = start.top;
  let right = start.left + start.width;
  let bottom = start.top + start.height;

  if (dir.includes('e')) right = clamp(right + dx, Math.min(left + minW, maxRight), maxRight);
  if (dir.includes('s')) bottom = clamp(bottom + dy, Math.min(top + minH, maxBottom), maxBottom);
  if (dir.includes('w')) left = clamp(left + dx, minLeft, Math.max(minLeft, right - minW));
  if (dir.includes('n')) top = clamp(top + dy, minTop, Math.max(minTop, bottom - minH));

  return { left, top, width: right - left, height: bottom - top };
}

// 贴边分区：八分区加最大化，全部落在工作区内。
export function snapRect(zone, viewport) {
  const { work } = metrics(viewport);
  const halfW = Math.floor(work.width / 2);
  const halfH = Math.floor(work.height / 2);
  const left = work.left;
  const top = work.top;

  switch (zone) {
    case 'maximize':
      return { left, top, width: work.width, height: work.height };
    case 'left-half':
      return { left, top, width: halfW, height: work.height };
    case 'right-half':
      return { left: left + halfW, top, width: work.width - halfW, height: work.height };
    case 'top-half':
      return { left, top, width: work.width, height: halfH };
    case 'bottom-half':
      return { left, top: top + halfH, width: work.width, height: work.height - halfH };
    case 'top-left':
      return { left, top, width: halfW, height: halfH };
    case 'top-right':
      return { left: left + halfW, top, width: work.width - halfW, height: halfH };
    case 'bottom-left':
      return { left, top: top + halfH, width: halfW, height: work.height - halfH };
    case 'bottom-right':
      return {
        left: left + halfW,
        top: top + halfH,
        width: work.width - halfW,
        height: work.height - halfH,
      };
    default:
      return null;
  }
}

// 窗口中心离哪条工作区边最近。zoom 参与计算，缩小的窗口按视觉中心判定。
// allowed 用来排除某几条边：桌面双击收边只认上/左/右，底部留给任务栏。
export function nearestEdge(rect, viewport, zoom, allowed) {
  const m = metrics(viewport);
  const z = Number(zoom) || 1;
  // left/top 是视觉坐标，只有宽高需要乘 zoom。
  const cx = rect.left + (rect.width * z) / 2;
  const cy = rect.top + (rect.height * z) / 2;
  const dist = {
    left: cx - m.work.left,
    right: m.work.left + m.work.width - cx,
    top: cy - m.work.top,
    bottom: m.work.top + m.work.height - cy,
  };
  const keys = allowed && allowed.length ? allowed : ['left', 'top', 'right', 'bottom'];
  let edge = keys[0];
  for (let i = 1; i < keys.length; i += 1) {
    if (dist[keys[i]] < dist[edge]) edge = keys[i];
  }
  return edge;
}

// 桌面双击收边：把窗口推到最近的边，只露 tuckPeek 像素，仿拍立得照片的收角。
// 垂直/水平另一个轴收回工作区，避免窗口同时越出两条边后找不到。
export function tuckRect(rect, edge, viewport, zoom) {
  const m = metrics(viewport);
  const z = Number(zoom) || 1;
  const peek = LAYOUT.tuckPeek;
  const w = rect.width * z;
  const h = rect.height * z;
  const workLeft = m.work.left;
  const workTop = m.work.top;
  const workRight = workLeft + m.work.width;
  const workBottom = workTop + m.work.height;
  // left/top 本身就是视觉坐标，只需要把另一轴收回工作区。
  const leftVis = clamp(rect.left, Math.min(workLeft, workRight - w), Math.max(workLeft, workRight - w));
  const topVis = clamp(rect.top, Math.min(workTop, workBottom - h), Math.max(workTop, workBottom - h));
  let left = leftVis;
  let top = topVis;
  switch (edge) {
    case 'left':
      left = workLeft - w + peek;
      break;
    case 'right':
      left = workRight - peek;
      break;
    case 'top':
      top = workTop - h + peek;
      break;
    case 'bottom':
      top = workBottom - peek;
      break;
    default:
      return null;
  }
  return { left, top, width: rect.width, height: rect.height };
}

// 指针靠近哪条边：先判四角，再判四边；远离边缘返回 null。
export function snapZone(pointer, viewport) {
  const m = metrics(viewport);
  if (m.mobile) return null;
  const edge = LAYOUT.edgeSnap;
  const leftZone = pointer.x <= m.work.left + edge;
  const rightZone = pointer.x >= m.work.left + m.work.width - edge;
  const topZone = pointer.y <= m.work.top + edge;
  const bottomZone = pointer.y >= m.work.top + m.work.height - edge;

  if (topZone && leftZone) return 'top-left';
  if (topZone && rightZone) return 'top-right';
  if (bottomZone && leftZone) return 'bottom-left';
  if (bottomZone && rightZone) return 'bottom-right';
  if (topZone) return 'maximize';
  if (bottomZone) return 'bottom-half';
  if (leftZone) return 'left-half';
  if (rightZone) return 'right-half';
  return null;
}
