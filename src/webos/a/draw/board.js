(function(){
'use strict';
/* ═══════════════════════════════════════════════════
   宋韵画笺 — Song-style Whiteboard
   无限画布 + 双指缩放平移（通用交互范式，无外部实现）
   中国传统色：古画设色32色
   宋式画框：宣和装/绫裱/卷轴/扇面
   ═══════════════════════════════════════════════════ */

var board = document.getElementById('song-board');
var canvas = document.getElementById('sb-canvas');
var ctx = canvas ? canvas.getContext('2d') : null;
if (!board || !canvas || !ctx) return;

/* ── 中国传统色 · 宋韵设色64色 ── */
var COLORS = {
  '朱墨': [
    {name:'胭脂',hex:'#9D2933'},{name:'朱砂',hex:'#FF461F'},{name:'赭石',hex:'#845A33'},
    {name:'妃红',hex:'#ED5736'},{name:'桃红',hex:'#F47983'},{name:'海棠',hex:'#DB5A6B'},
    {name:'檀色',hex:'#B36D61'},{name:'榴花',hex:'#F20C00'},
    {name:'茜色',hex:'#CB3A56'},{name:'殷红',hex:'#BE002F'},{name:'酡红',hex:'#DC3023'},
    {name:'绯红',hex:'#C83C23'},{name:'绛',hex:'#8B2323'},{name:'绛唇',hex:'#F00056'}
  ],
  '缃琥': [
    {name:'藤黄',hex:'#FFB61E'},{name:'鹅黄',hex:'#FFF143'},{name:'缃色',hex:'#F0C239'},
    {name:'琥珀',hex:'#CA6924'},{name:'杏黄',hex:'#FFA631'},{name:'黄栌',hex:'#E29C45'},
    {name:'秋香',hex:'#D9B611'},{name:'姜黄',hex:'#FFC773'},{name:'茶色',hex:'#B35C44'},
    {name:'枯黄',hex:'#D3B17D'},{name:'昏黄',hex:'#C89B40'},{name:'赤',hex:'#C32136'}
  ],
  '翠碧': [
    {name:'石绿',hex:'#16A951'},{name:'松花',hex:'#BCE672'},{name:'竹青',hex:'#789262'},
    {name:'葱绿',hex:'#9ED900'},{name:'翡翠',hex:'#3DE1AD'},{name:'碧色',hex:'#1BD1A5'},
    {name:'铜绿',hex:'#549688'},{name:'柳绿',hex:'#AFDD22'},{name:'松柏',hex:'#21A675'},
    {name:'艾绿',hex:'#A4E2C6'},{name:'葱倩',hex:'#40DE5A'},{name:'苍绿',hex:'#519A73'}
  ],
  '青霭': [
    {name:'石青',hex:'#1685A9'},{name:'花青',hex:'#003472'},
    {name:'天青',hex:'#70F3FF'},{name:'月白',hex:'#D6ECF0'},
    {name:'群青',hex:'#4C8DAE'},{name:'藏青',hex:'#2E4E7E'},{name:'湖蓝',hex:'#30DFF3'},
    {name:'苍青',hex:'#7397AB'},{name:'靛青',hex:'#4B5CC4'}
  ],
  '紫霞': [
    {name:'青莲',hex:'#801DAE'},{name:'紫棠',hex:'#56004F'},{name:'丁香',hex:'#CCA4E3'},
    {name:'雪青',hex:'#B0A4E3'},{name:'酱紫',hex:'#815476'},{name:'藕荷',hex:'#E4C6D0'},
    {name:'黛紫',hex:'#574266'},{name:'魏紫',hex:'#7E167F'}
  ],
  '玄素': [
    {name:'墨色',hex:'#50616D'},{name:'胡粉',hex:'#FFF2DF'},
    {name:'玄色',hex:'#622A1D'},{name:'漆黑',hex:'#161823'},{name:'缁色',hex:'#493131'},
    {name:'黧',hex:'#5D513C'},{name:'铅粉',hex:'#E9E7EF'},
    {name:'精白',hex:'#FFFFFF'},{name:'鸦青',hex:'#424C50'}
  ]
};

/* ── 状态 ── */
var state = {
  tool: 'brush',        // brush | pencil | spray | eraser | line | rect | circle | lasso
  brushType: 'ink',     // ink | watercolor | crayon  (毛笔子类型：液态墨水/水彩/蜡笔)
  color: '#50616D',     // 当前色（默认墨色）
  colorName: '墨色',
  lineWidth: 2,
  frame: 'none',
  drawing: false,
  lastX: 0, lastY: 0,
  lastTime: 0,
  currentWidth: 2,      // 毛笔动态宽度（Perfect Freehand速度模拟）
  strokePoints: [],     // 毛笔笔触路径点 [{x,y,pressure}]（Perfect Freehand输入点）
  strokeSnapshot: null, // 毛笔起笔前的canvas快照（用于每帧重绘整条笔画）
  // 形状工具
  shapeStartX: 0, shapeStartY: 0,
  shapeSnapshot: null,
  // 套索工具 — Excalidraw风格浮动选区
  lassoPath: [],
  lassoSnapshot: null,       // 选区前的画布快照（用于commit前恢复）
  _lassoActive: false,       // 是否存在浮动选区
  _lassoFloatCanvas: null,   // 浮动选区内容（临时canvas）
  _lassoFloatX: 0, _lassoFloatY: 0,     // 浮动选区位置（CSS像素）
  _lassoFloatW: 0, _lassoFloatH: 0,     // 浮动选区当前尺寸
  _lassoFloatOrigW: 0, _lassoFloatOrigH: 0, // 浮动选区原始尺寸
  _lassoFloatOrigX: 0, _lassoFloatOrigY: 0, // 浮动选区原始位置
  _lassoScaleX: 1, _lassoScaleY: 1,     // 当前缩放
  _lassoMarchOffset: 0,      // 蚁行线动画偏移
  _lassoMarchTimer: null,    // 蚁行线动画定时器
  _lassoInteraction: null,   // null | 'drag' | 'handle-nw'|'handle-n'|'handle-ne'|'handle-e'|'handle-se'|'handle-s'|'handle-sw'|'handle-w' | 'liquify'
  _lassoDragStartX: 0, _lassoDragStartY: 0,
  _lassoDragStartFX: 0, _lassoDragStartFY: 0, // drag开始时的float位置
  _lassoHandleAnchorX: 0, _lassoHandleAnchorY: 0, // resize锚点
  _lassoLiquifyLastX: 0, _lassoLiquifyLastY: 0,
  _lassoLiquifyBrushR: 25,   // 液化笔刷半径
  _lassoPinchDist: 0,        // 双指缩放起始距离
  _lassoPinchStartScaleX: 1, _lassoPinchStartScaleY: 1, // pinch开始时的缩放
  isLassoPinching: false,
  _clipboard: null,          // 剪贴板 { canvas, w, h }
  // pinch-zoom / pan — 整体画板变换（CSS transform on #song-board）
  boardScale: 1,
  boardOffX: 0, boardOffY: 0,
  pinchDist: 0,
  pinchMidX: 0, pinchMidY: 0,
  isPinching: false,
  // history
  history: [],
  historyIdx: -1,
  // panels
  activePanel: null,
  // text
  textEl: null,
  textX: 0, textY: 0,
  // window
  minimized: false,
  maximized: false,
  visible: false
};

/* ═══════════════════════════════════════════════════
   Perfect Freehand — 极致流畅变宽笔触算法
   算法移植自 perfect-freehand 1.2.x（MIT）
   https://github.com/steveruizok/perfect-freehand
   许可全文见同目录 perfect-freehand-LICENSE.txt
   核心思路：收集压力点→计算左右轮廓→填充闭合多边形
   彻底消除逐段stroke的宽度跳变锯齿
   ═══════════════════════════════════════════════════ */
var PF = (function() {
  'use strict';
  // ── 向量工具 ──
  function vAdd(a,b){return[a[0]+b[0],a[1]+b[1]]}
  function vSub(a,b){return[a[0]-b[0],a[1]-b[1]]}
  function vMul(a,n){return[a[0]*n,a[1]*n]}
  function vDiv(a,n){return[a[0]/n,a[1]/n]}
  function vLen(a){return Math.hypot(a[0],a[1])}
  function vUni(a){var l=vLen(a);return l>0?vDiv(a,l):[0,0]}
  function vPerp(a){return[a[1],-a[0]]}  // 顺时针旋转90°
  function vDot(a,b){return a[0]*b[0]+a[1]*b[1]}
  function vLrp(a,b,t){return[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]}
  function vDist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])}
  function vDist2(a,b){var dx=a[0]-b[0],dy=a[1]-b[1];return dx*dx+dy*dy}
  function vRotAround(a,c,r){var s=Math.sin(r),co=Math.cos(r),px=a[0]-c[0],py=a[1]-c[1];return[px*co-py*s+c[0],px*s+py*co+c[1]]}

  // ── 常量 ──
  var FIXED_PI = Math.PI + 0.0001;
  var RATE_OF_PRESSURE_CHANGE = 0.275;
  var START_CAP_SEGS = 13;
  var END_CAP_SEGS = 29;
  var CORNER_CAP_SEGS = 13;
  var END_NOISE_THRESHOLD = 3;
  var MIN_STREAMLINE_T = 0.15;
  var STREAMLINE_T_RANGE = 0.85;
  var MIN_RADIUS = 0.01;

  // ── 压力模拟 ──
  function simulatePressure(prevPressure, distance, size) {
    var sp = Math.min(1, distance / size);
    var rp = Math.min(1, 1 - sp);
    return Math.min(1, prevPressure + (rp - prevPressure) * (sp * RATE_OF_PRESSURE_CHANGE));
  }

  // ── 半径计算 ──
  function getStrokeRadius(size, thinning, pressure, easing) {
    if (!easing) easing = function(t){return t};
    return size * easing(0.5 - thinning * (0.5 - pressure));
  }

  // ── getStrokePoints：输入点→平滑压力点 ──
  function getStrokePoints(points, options) {
    if (!options) options = {};
    var streamline = options.streamline != null ? options.streamline : 0.5;
    var size = options.size != null ? options.size : 16;
    var isComplete = !!options.last;
    if (points.length === 0) return [];
    var t = MIN_STREAMLINE_T + (1 - streamline) * STREAMLINE_T_RANGE;
    // 统一为数组格式 [x,y,pressure]
    var pts = points;
    // 只有两个点时，插值扩展避免虚线
    if (pts.length === 2) {
      var last = pts[1];
      pts = pts.slice(0, -1);
      for (var i = 1; i < 5; i++) {
        pts.push(vLrp(pts[0], last, i / 4).concat(pts[0].slice(2)));
      }
    }
    if (pts.length === 1) {
      // 单点：添加偏移点 [x+1, y+1] 避免零长度笔画
      var p0 = pts[0];
      pts = [[p0[0], p0[1], p0[2] != null ? p0[2] : 0.5],
             [p0[0] + 1, p0[1] + 1, p0[2] != null ? p0[2] : 0.5]];
    }
    var strokePoints = [{
      point: [pts[0][0], pts[0][1]],
      pressure: pts[0][2] != null && pts[0][2] >= 0 ? pts[0][2] : 0.25,
      vector: [1, 1],
      distance: 0,
      runningLength: 0
    }];
    var hasReachedMin = false;
    var runningLength = 0;
    var prev = strokePoints[0];
    var max = pts.length - 1;
    for (var i = 1; i < pts.length; i++) {
      var point = isComplete && i === max
        ? [pts[i][0], pts[i][1]]
        : vLrp(prev.point, pts[i], t);
      if (prev.point[0] === point[0] && prev.point[1] === point[1]) continue;
      var distance = vDist(point, prev.point);
      runningLength += distance;
      if (i < max && !hasReachedMin) {
        if (runningLength < size) continue;
        hasReachedMin = true;
      }
      var diff = vSub(prev.point, point);
      prev = {
        point: point,
        pressure: pts[i][2] != null && pts[i][2] >= 0 ? pts[i][2] : 0.5,
        vector: vUni(diff),
        distance: distance,
        runningLength: runningLength
      };
      strokePoints.push(prev);
    }
    if (strokePoints.length > 1) {
      strokePoints[0].vector = strokePoints[1].vector;
    }
    return strokePoints;
  }

  // ── getStrokeOutlinePoints：压力点→轮廓多边形 ──
  function getStrokeOutlinePoints(points, options) {
    if (!options) options = {};
    var size = options.size != null ? options.size : 16;
    var smoothing = options.smoothing != null ? options.smoothing : 0.5;
    var thinning = options.thinning != null ? options.thinning : 0.5;
    var shouldSimPressure = options.simulatePressure !== false;
    var easing = options.easing || function(t){return t};
    var startOpt = options.start || {};
    var endOpt = options.end || {};
    var isComplete = options.last !== false;
    var capStart = startOpt.cap !== false;
    var capEnd = endOpt.cap !== false;
    var taperStartEase = startOpt.easing || function(t){return t*(2-t)};
    var taperEndEase = endOpt.easing || function(t){return --t*t*t+1};
    if (points.length === 0 || size <= 0) return [];
    var totalLength = points[points.length - 1].runningLength;
    var taperStart = startOpt.taper === true ? Math.max(size, totalLength) : (startOpt.taper || 0);
    var taperEnd = endOpt.taper === true ? Math.max(size, totalLength) : (endOpt.taper || 0);
    var minDistance = Math.pow(size * smoothing, 2);
    var leftPts = [], rightPts = [];
    // 初始压力（前10点平均，防止起笔过粗）
    var prevPressure = points.slice(0, 10).reduce(function(acc, curr) {
      var p = curr.pressure;
      if (shouldSimPressure) p = simulatePressure(acc, curr.distance, size);
      return (acc + p) / 2;
    }, points[0].pressure);
    var radius = getStrokeRadius(size, thinning, points[points.length-1].pressure, easing);
    var firstRadius;
    var prevVector = points[0].vector;
    var prevLeftPoint = points[0].point;
    var prevRightPoint = prevLeftPoint;
    var isPrevSharpCorner = false;
    for (var i = 0; i < points.length; i++) {
      var pressure = points[i].pressure;
      var point = points[i].point;
      var vector = points[i].vector;
      var distance = points[i].distance;
      var runningLength = points[i].runningLength;
      var isLastPoint = i === points.length - 1;
      if (!isLastPoint && totalLength - runningLength < END_NOISE_THRESHOLD) continue;
      // 计算半径
      if (thinning) {
        if (shouldSimPressure) {
          pressure = simulatePressure(prevPressure, distance, size);
        }
        radius = getStrokeRadius(size, thinning, pressure, easing);
      } else {
        radius = size / 2;
      }
      if (firstRadius === undefined) firstRadius = radius;
      // 锥度
      var taperStartStr = runningLength < taperStart ? taperStartEase(runningLength / taperStart) : 1;
      var taperEndStr = totalLength - runningLength < taperEnd ? taperEndEase((totalLength - runningLength) / taperEnd) : 1;
      radius = Math.max(MIN_RADIUS, radius * Math.min(taperStartStr, taperEndStr));
      // 检测锐角
      var nextVector = (!isLastPoint ? points[i+1] : points[i]).vector;
      var nextDpr = !isLastPoint ? vDot(vector, nextVector) : 1.0;
      var prevDpr = vDot(vector, prevVector);
      var isSharpCorner = prevDpr < 0 && !isPrevSharpCorner;
      var isNextSharpCorner = nextDpr !== null && nextDpr < 0;
      if (isSharpCorner || isNextSharpCorner) {
        var offset = vMul(vPerp(prevVector), radius);
        var step = 1 / CORNER_CAP_SEGS;
        for (var ct = 0; ct <= 1; ct += step) {
          leftPts.push(vRotAround(vSub(point, offset), point, FIXED_PI * ct));
          rightPts.push(vRotAround(vAdd(point, offset), point, FIXED_PI * -ct));
        }
        prevLeftPoint = leftPts[leftPts.length - 1];
        prevRightPoint = rightPts[rightPts.length - 1];
        if (isNextSharpCorner) isPrevSharpCorner = true;
        continue;
      }
      isPrevSharpCorner = false;
      // 最后一个点
      if (isLastPoint) {
        var offEnd = vMul(vPerp(vector), radius);
        leftPts.push(vSub(point, offEnd));
        rightPts.push(vAdd(point, offEnd));
        continue;
      }
      // 常规点：左右偏移
      var offsetR = vMul(vPerp(vLrp(nextVector, vector, nextDpr)), radius);
      var tempLeft = vSub(point, offsetR);
      if (i <= 1 || vDist2(prevLeftPoint, tempLeft) > minDistance) {
        leftPts.push(tempLeft);
        prevLeftPoint = tempLeft;
      }
      var tempRight = vAdd(point, offsetR);
      if (i <= 1 || vDist2(prevRightPoint, tempRight) > minDistance) {
        rightPts.push(tempRight);
        prevRightPoint = tempRight;
      }
      prevPressure = pressure;
      prevVector = vector;
    }
    // 起始/结束端帽
    var firstPoint = [points[0].point[0], points[0].point[1]];
    var lastPoint = points.length > 1
      ? [points[points.length-1].point[0], points[points.length-1].point[1]]
      : vAdd(points[0].point, [1, 1]);
    var startCap = [], endCap = [];
    if (points.length === 1) {
      // 单点 → 画圆点
      if (!(taperStart || taperEnd) || isComplete) {
        var dotR = firstRadius || radius;
        var offPt = vAdd(firstPoint, [1, 1]);
        var startDot = vAdd(firstPoint, vMul(vUni(vPerp(vSub(firstPoint, offPt))), -dotR));
        var dotPts = [];
        var stepD = 1 / START_CAP_SEGS;
        for (var dt = stepD; dt <= 1; dt += stepD) {
          dotPts.push(vRotAround(startDot, firstPoint, FIXED_PI * 2 * dt));
        }
        return dotPts;
      }
    } else {
      // 起始端帽
      if (!taperStart && capStart && rightPts.length > 0) {
        var stepS = 1 / START_CAP_SEGS;
        for (var st = stepS; st <= 1; st += stepS) {
          startCap.push(vRotAround(rightPts[0], firstPoint, FIXED_PI * st));
        }
      }
      // 结束端帽
      var dir = vPerp([-points[points.length-1].vector[0], -points[points.length-1].vector[1]]);
      if (!taperEnd && capEnd) {
        var endStart = vAdd(lastPoint, vMul(dir, radius));
        var stepE = 1 / END_CAP_SEGS;
        for (var et = stepE; et < 1; et += stepE) {
          endCap.push(vRotAround(endStart, lastPoint, FIXED_PI * 3 * et));
        }
      } else if (taperEnd) {
        endCap.push(lastPoint);
      }
    }
    // 左侧 + 端帽 + 右侧反转 + 起始端帽
    return leftPts.concat(endCap, rightPts.reverse(), startCap);
  }

  // ── getStroke：一键完成 ──
  function getStroke(points, options) {
    return getStrokeOutlinePoints(getStrokePoints(points, options), options);
  }

  // ── outline→Canvas Path ──
  function drawOutlineOnCtx(ctx, outline) {
    if (outline.length < 3) return;
    var avg = function(a,b){return(a+b)/2};
    var a = outline[0], b = outline[1], c = outline[2];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(b[0], b[1], avg(b[0], c[0]), avg(b[1], c[1]));
    for (var i = 2; i < outline.length - 1; i++) {
      a = outline[i];
      b = outline[i + 1];
      ctx.quadraticCurveTo(a[0], a[1], avg(a[0], b[0]), avg(a[1], b[1]));
    }
    ctx.closePath();
  }

  return {
    getStrokePoints: getStrokePoints,
    getStrokeOutlinePoints: getStrokeOutlinePoints,
    getStroke: getStroke,
    drawOutlineOnCtx: drawOutlineOnCtx
  };
})();
function resizeCanvas() {
  var wrap = canvas.parentElement;
  var dpr = window.devicePixelRatio || 1;
  canvas.width = wrap.clientWidth * dpr;
  canvas.height = wrap.clientHeight * dpr;
  canvas.style.width = wrap.clientWidth + 'px';
  canvas.style.height = wrap.clientHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawFromHistory();
}

/* ── 历史记录 ── */
function saveState() {
  // trim future
  state.history = state.history.slice(0, state.historyIdx + 1);
  state.history.push(canvas.toDataURL());
  state.historyIdx = state.history.length - 1;
  // cap at 30
  if (state.history.length > 30) {
    state.history.shift();
    state.historyIdx--;
  }
}

function undo() {
  if (state.historyIdx <= 0) return;
  state.historyIdx--;
  restoreState(state.historyIdx);
}
function redo() {
  if (state.historyIdx >= state.history.length - 1) return;
  state.historyIdx++;
  restoreState(state.historyIdx);
}

function restoreState(idx) {
  var img = new Image();
  img.onload = function() {
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  img.src = state.history[idx];
}

function redrawFromHistory() {
  if (state.historyIdx >= 0) restoreState(state.historyIdx);
}

/* ── 绘制坐标变换 ── */
function screenToCanvas(sx, sy) {
  // ★ 当画板被CSS scale缩放时，视觉坐标需要除以scale才是canvas内部坐标
  var s = state.boardScale || 1;
  if (s !== 1) {
    return { x: sx / s, y: sy / s };
  }
  return { x: sx, y: sy };
}

/* ── 画板整体变换（双指缩放+移动 #song-board） ── */
function applyBoardTransform() {
  var s = state.boardScale;
  var dx = state.boardOffX;
  var dy = state.boardOffY;
  // 组合居中偏移 + 用户平移 + 缩放
  // 初始居中: translate(-50%, -50%)，缩放时需要保持中心
  board.style.transformOrigin = '50% 50%';
  board.style.transform = 'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + ' + dy.toFixed(1) + 'px)) scale(' + s.toFixed(4) + ')';
}

/* ── 绘画 ── */
function startDraw(x, y) {
  state.drawing = true;
  state.lastX = x;
  state.lastY = y;
  state.lastTime = Date.now();
  state.currentWidth = state.lineWidth;
  // ★ 形状工具：记录起点，保存当前canvas快照
  if (state.tool === 'line' || state.tool === 'rect' || state.tool === 'circle') {
    state.shapeStartX = x;
    state.shapeStartY = y;
    state.shapeSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return;
  }
  // ★ 套索工具 — Excalidraw风格浮动选区
  if (state.tool === 'lasso') {
    // ★ 如果已有浮动选区，检测交互类型
    if (state._lassoActive) {
      var handle = hitTestLassoHandle(x, y);
      if (handle) {
        // 点击了缩放手柄
        state._lassoInteraction = 'handle-' + handle;
        // 锚点=对角/对边
        var fx = state._lassoFloatX, fy = state._lassoFloatY;
        var fw = state._lassoFloatW, fh = state._lassoFloatH;
        var anchors = {
          'nw': {x: fx+fw, y: fy+fh}, 'n': {x: fx+fw/2, y: fy+fh},
          'ne': {x: fx, y: fy+fh}, 'e': {x: fx, y: fy+fh/2},
          'se': {x: fx, y: fy}, 's': {x: fx+fw/2, y: fy},
          'sw': {x: fx+fw, y: fy}, 'w': {x: fx+fw, y: fy+fh/2}
        };
        var a = anchors[handle] || {x: fx+fw/2, y: fy+fh/2};
        state._lassoHandleAnchorX = a.x;
        state._lassoHandleAnchorY = a.y;
        state._lassoDragStartX = x;
        state._lassoDragStartY = y;
        return;
      }
      // 检测是否点在选区内 → 拖拽或液化
      if (x >= state._lassoFloatX && x <= state._lassoFloatX + state._lassoFloatW &&
          y >= state._lassoFloatY && y <= state._lassoFloatY + state._lassoFloatH) {
        if (state._lassoMode === 'liquify') {
          // 液化模式：在浮动canvas上推拉像素
          state._lassoInteraction = 'liquify';
          state._lassoLiquifyLastX = x;
          state._lassoLiquifyLastY = y;
        } else {
          state._lassoInteraction = 'drag';
          state._lassoDragStartX = x;
          state._lassoDragStartY = y;
          state._lassoDragStartFX = state._lassoFloatX;
          state._lassoDragStartFY = state._lassoFloatY;
        }
        return;
      }
      // 点在选区外 → 提交当前选区，开始新套索
      commitLasso();
    }
    // 开始新的套索路径
    state.lassoPath = [{x: x, y: y}];
    state.lassoSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return;
  }

  // ★ 毛笔：Perfect Freehand式起笔
  if (state.tool === 'brush') {
    var maxW = state.lineWidth * 2.5;
    state.strokePoints = [[x, y]];  // PF格式：[x, y]，压力由PF内部模拟
    state.currentWidth = maxW;
    // ★ 保存起笔前快照，每帧重绘整条笔画
    state.strokeSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  // ★ 铅笔：PF起笔（细线+速写质感）
  else if (state.tool === 'pencil') {
    state.strokePoints = [[x, y]];
    state.strokeSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  // ★ 喷枪：起始喷洒
  else if (state.tool === 'spray') {
    sprayAt(x, y);
  }
  // ★ 橡皮：擦除起始点
  else if (state.tool === 'eraser') {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, state.lineWidth * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ★ 喷枪效果 — 随机散点 */
function sprayAt(x, y) {
  var density = Math.max(8, state.lineWidth * 3);
  var radius = state.lineWidth * 2.5;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = state.color;
  for (var i = 0; i < density; i++) {
    var angle = Math.random() * Math.PI * 2;
    var dist = Math.random() * radius;
    var dx = Math.cos(angle) * dist;
    var dy = Math.sin(angle) * dist;
    var dotSize = Math.random() * 1.2 + 0.3;
    ctx.globalAlpha = Math.random() * 0.5 + 0.2;
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, dotSize, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function moveDraw(x, y) {
  if (!state.drawing) return;
  // ★ 套索工具 — Excalidraw风格浮动选区交互
  if (state.tool === 'lasso') {
    // ★ 浮动选区交互：拖拽/缩放/液化
    if (state._lassoActive && state._lassoInteraction) {
      // 恢复到快照（不含浮选叠加层）
      if (state.lassoSnapshot) ctx.putImageData(state.lassoSnapshot, 0, 0);
      if (state._lassoInteraction === 'drag') {
        state._lassoFloatX = state._lassoDragStartFX + (x - state._lassoDragStartX);
        state._lassoFloatY = state._lassoDragStartFY + (y - state._lassoDragStartY);
        renderFloatingSelection();
        return;
      }
      if (state._lassoInteraction === 'liquify') {
        liquifyStroke(x, y);
        state._lassoLiquifyLastX = x;
        state._lassoLiquifyLastY = y;
        renderFloatingSelection();
        return;
      }
      if (state._lassoInteraction.indexOf('handle-') === 0) {
        var handleName = state._lassoInteraction.substring(7);
        resizeLassoByHandle(handleName, x, y);
        renderFloatingSelection();
        return;
      }
      return;
    }
    // ★ 绘制新套索路径（实时虚线预览）
    state.lassoPath.push({x: x, y: y});
    if (state.lassoSnapshot) ctx.putImageData(state.lassoSnapshot, 0, 0);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#F08060';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var i = 0; i < state.lassoPath.length; i++) {
      if (i === 0) ctx.moveTo(state.lassoPath[i].x, state.lassoPath[i].y);
      else ctx.lineTo(state.lassoPath[i].x, state.lassoPath[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  // ★ 形状工具：实时预览（恢复快照+画形状）
  if (state.tool === 'line' || state.tool === 'rect' || state.tool === 'circle') {
    if (state.shapeSnapshot) {
      ctx.putImageData(state.shapeSnapshot, 0, 0);
    }
    drawShapePreview(state.shapeStartX, state.shapeStartY, x, y, state.tool);
    return;
  }
  // ★ rAF节流：同一帧内只绘一次
  state._pendingX = x;
  state._pendingY = y;
  if (!state._rafPending) {
    state._rafPending = true;
    requestAnimationFrame(function() {
      state._rafPending = false;
      if (!state.drawing) return;
      var px = state._pendingX, py = state._pendingY;
      var now = Date.now();
      var dt = Math.max(1, now - state.lastTime);
      var dx = px - state.lastX;
      var dy = py - state.lastY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var speed = dist / dt; // px/ms

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (state.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = state.lineWidth * 4;
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.beginPath();
        ctx.moveTo(state.lastX, state.lastY);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.restore();
        state.lastX = px; state.lastY = py;
        return;
      }
      // ★★★ 毛笔：Perfect Freehand — 变宽笔触（轮廓填充法，彻底消除锯齿）
      else if (state.tool === 'brush') {
        ctx.globalCompositeOperation = 'source-over';
        // ★ Perfect Freehand：直接收集原始坐标，由PF内部模拟压力
        state.strokePoints.push([px, py]);
        state.lastX = px; state.lastY = py; state.lastTime = now;

        // ★★★ 每帧重绘整条笔画：恢复快照→计算PF轮廓→艺术化填充 ★★★
        if (state.strokeSnapshot) {
          ctx.putImageData(state.strokeSnapshot, 0, 0);
        }
        var pfSize = state.lineWidth * 5;  // PF size是直径
        var pts = state.strokePoints;

        // ═══════════════════════════════════════════════════════
        //  墨 INK — 浓淡干湿，宋人墨韵
        //  核心原理：宣纸吸墨→中心浓、边缘淡（径向渐变）
        //           慢笔浓墨饱满、快笔枯笔飞白
        // ═══════════════════════════════════════════════════════
        if (state.brushType === 'ink') {
          var inkOutline = PF.getStroke(pts, {
            size: pfSize, thinning: 0.55, smoothing: 0.5,
            streamline: 0.5, simulatePressure: true, last: false
          });
          if (inkOutline.length >= 3) {
            ctx.save();
            // ★ 墨晕扩散：shadowBlur 实现数学级平滑高斯衰减
            //   宣纸吸墨→中心浓边缘淡，是连续渐变而非离散阶梯
            ctx.shadowColor = state.color;
            ctx.shadowBlur = pfSize * 0.6;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillStyle = state.color;
            ctx.globalAlpha = 0.28;
            PF.drawOutlineOnCtx(ctx, inkOutline);
            ctx.fill();
            // ★ 主笔触：在shadow渐变基础上叠加核心墨体
            //   shadow已提供外→内平滑过渡，此处补足中心浓度
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 0.72;
            PF.drawOutlineOnCtx(ctx, inkOutline);
            ctx.fill();
            // ★ 浓墨中锋：毛笔按压处最浓的细线
            var coreOutline = PF.getStroke(pts, {
              size: pfSize * 0.38, thinning: 0.65, smoothing: 0.4,
              streamline: 0.5, simulatePressure: true, last: false
            });
            if (coreOutline.length >= 3) {
              ctx.globalAlpha = 0.25;
              PF.drawOutlineOnCtx(ctx, coreOutline);
              ctx.fill();
            }
            // ★ 枯笔飞白：沿笔触边缘散落墨粒
            var sp4 = pts;
            for (var ki = 0; ki < sp4.length; ki += 2) {
              var kprob = 0.10 + (1.0 - 0.5) * 0.15;
              if (Math.random() < kprob) {
                var kAngle = ki > 0 ? Math.atan2(sp4[ki][1] - sp4[ki-1][1], sp4[ki][0] - sp4[ki-1][0]) : 0;
                var kPerpAngle = kAngle + Math.PI / 2;
                var kDist = pfSize * 0.3 + Math.random() * pfSize * 0.35;
                for (var kd = -1; kd <= 1; kd += 2) {
                  if (Math.random() < 0.35) {
                    ctx.globalAlpha = 0.06 + Math.random() * 0.10;
                    ctx.fillStyle = state.color;
                    ctx.beginPath();
                    var kx = sp4[ki][0] + Math.cos(kPerpAngle) * kDist * kd + (Math.random() - 0.5) * 3;
                    var ky = sp4[ki][1] + Math.sin(kPerpAngle) * kDist * kd + (Math.random() - 0.5) * 3;
                    ctx.arc(kx, ky, 0.5 + Math.random() * 1.5, 0, Math.PI * 2);
                    ctx.fill();
                  }
                }
              }
            }
            // ★ 墨渍沉淀：慢笔处墨汁聚集成深色斑点
            for (var mi = 2; mi < sp4.length; mi += 4) {
              var mdist = mi > 0 ? Math.hypot(sp4[mi][0]-sp4[mi-1][0], sp4[mi][1]-sp4[mi-1][1]) : 10;
              if (mdist < 8 && Math.random() < 0.22) {
                ctx.globalAlpha = 0.08 + Math.random() * 0.12;
                ctx.fillStyle = state.color;
                ctx.beginPath();
                ctx.arc(
                  sp4[mi][0] + (Math.random() - 0.5) * pfSize * 0.15,
                  sp4[mi][1] + (Math.random() - 0.5) * pfSize * 0.15,
                  pfSize * 0.05 + Math.random() * pfSize * 0.06,
                  0, Math.PI * 2
                );
                ctx.fill();
              }
            }
            ctx.globalAlpha = 1.0;
            ctx.restore();
          }
        }

        // ═══════════════════════════════════════════════════════
        //  水 WATERCOLOR — 水渍渲润，江南烟雨
        //  核心原理：水分蒸发→颜料向边缘迁移（水痕效应）
        //           湿中湿：颜色在水中扩散、融合
        //           纸张纹理：颜料颗粒在纸纹中沉淀
        // ═══════════════════════════════════════════════════════
        else if (state.brushType === 'watercolor') {
          var wcOutline = PF.getStroke(pts, {
            size: pfSize, thinning: 0.6, smoothing: 0.55,
            streamline: 0.45, simulatePressure: true, last: false
          });
          if (wcOutline.length >= 3) {
            ctx.save();
            // ★ 层1：湿中湿扩散（大范围低透明度，模拟水分扩散范围）
            ctx.shadowColor = state.color;
            ctx.shadowBlur = pfSize * 0.4;
            ctx.fillStyle = state.color;
            ctx.globalAlpha = 0.06;
            var wetOutline = PF.getStroke(pts, {
              size: pfSize * 2.2, thinning: 0.3, smoothing: 0.7,
              streamline: 0.35, simulatePressure: true, last: false
            });
            if (wetOutline.length >= 3) {
              PF.drawOutlineOnCtx(ctx, wetOutline);
              ctx.fill();
            }
            ctx.shadowBlur = 0;
            // ★ 层2：水彩基底（中等宽度，柔和边缘）
            ctx.shadowColor = state.color;
            ctx.shadowBlur = pfSize * 0.15;
            ctx.globalAlpha = 0.14;
            var baseOutline = PF.getStroke(pts, {
              size: pfSize * 1.5, thinning: 0.4, smoothing: 0.6,
              streamline: 0.4, simulatePressure: true, last: false
            });
            if (baseOutline.length >= 3) {
              PF.drawOutlineOnCtx(ctx, baseOutline);
              ctx.fill();
            }
            ctx.shadowBlur = 0;
            // ★ 层3：水痕效应（边缘沉淀——用composite 'multiply'加深边缘）
            //   先画边缘带，再画中心浅色
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = state.color;
            ctx.globalAlpha = 0.18;
            var edgeOutline = PF.getStroke(pts, {
              size: pfSize * 1.15, thinning: 0.55, smoothing: 0.5,
              streamline: 0.5, simulatePressure: true, last: false
            });
            if (edgeOutline.length >= 3) {
              PF.drawOutlineOnCtx(ctx, edgeOutline);
              ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
            // ★ 层4：中心高光（水彩中心偏淡——水把颜料推向边缘）
            ctx.fillStyle = '#F9F5EB'; // 宣纸色
            ctx.globalAlpha = 0.08;
            var innerOutline = PF.getStroke(pts, {
              size: pfSize * 0.6, thinning: 0.6, smoothing: 0.5,
              streamline: 0.5, simulatePressure: true, last: false
            });
            if (innerOutline.length >= 3) {
              PF.drawOutlineOnCtx(ctx, innerOutline);
              ctx.fill();
            }
            // ★ 层5：颜料颗粒沉淀（granulation——不规则小点）
            ctx.fillStyle = state.color;
            var sp5 = pts;
            for (var gi = 0; gi < sp5.length; gi += 3) {
              if (Math.random() < 0.3) {
                ctx.globalAlpha = 0.04 + Math.random() * 0.08;
                ctx.beginPath();
                ctx.arc(
                  sp5[gi][0] + (Math.random() - 0.5) * pfSize * 0.7,
                  sp5[gi][1] + (Math.random() - 0.5) * pfSize * 0.7,
                  0.5 + Math.random() * 1.2, 0, Math.PI * 2
                );
                ctx.fill();
              }
            }
            // ★ 层6：水渍光斑（水膜反光点）
            for (var hi = 1; hi < sp5.length; hi += 5) {
              if (Math.random() < 0.15) {
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.04 + Math.random() * 0.06;
                ctx.beginPath();
                ctx.arc(
                  sp5[hi][0] + (Math.random() - 0.5) * pfSize * 0.4,
                  sp5[hi][1] + (Math.random() - 0.5) * pfSize * 0.4,
                  0.8 + Math.random() * 2, 0, Math.PI * 2
                );
                ctx.fill();
              }
            }
            ctx.globalAlpha = 1.0;
            ctx.restore();
          }
        }

        // ═══════════════════════════════════════════════════════
        //  蜡 CRAYON — 蜡质肌理，粗犷质朴
        //  核心原理：蜡在纸面摩擦→有留白间隙（纸纹漏白）
        //           蜡层叠加→颜色逐渐浓厚
        //           边缘粗糙→蜡不均匀附着
        // ═══════════════════════════════════════════════════════
        else if (state.brushType === 'crayon') {
          var crayOutline = PF.getStroke(pts, {
            size: pfSize * 0.85, thinning: 0.35, smoothing: 0.35,
            streamline: 0.55, simulatePressure: true, last: false
          });
          if (crayOutline.length >= 3) {
            ctx.save();
            // ★ 层1：蜡笔底色（实心填充，带微弱阴影模拟蜡层厚度）
            ctx.shadowColor = 'rgba(0,0,0,0.15)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetY = 1;
            ctx.fillStyle = state.color;
            ctx.globalAlpha = 0.7;
            PF.drawOutlineOnCtx(ctx, crayOutline);
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            // ★ 层2：纸纹漏白（destination-out 挖去蜡层，露出宣纸底色）
            //   用随机小方块模拟纸纹纤维
            ctx.globalCompositeOperation = 'destination-out';
            var sp6 = pts;
            for (var ci = 0; ci < sp6.length; ci++) {
              // 沿笔触路径在宽度和长度方向随机挖洞
              var cAngle = ci > 0 ? Math.atan2(sp6[ci][1]-sp6[ci-1][1], sp6[ci][0]-sp6[ci-1][0]) : 0;
              var cPerpX = -Math.sin(cAngle);
              var cPerpY = Math.cos(cAngle);
              // 横向3-5个位置
              var cCount = 3 + Math.floor(Math.random() * 3);
              for (var cj = 0; cj < cCount; cj++) {
                if (Math.random() < 0.35) {
                  var coffX = cPerpX * (Math.random() - 0.5) * pfSize * 0.7;
                  var coffY = cPerpY * (Math.random() - 0.5) * pfSize * 0.7;
                  ctx.globalAlpha = 0.15 + Math.random() * 0.3;
                  ctx.beginPath();
                  var cw = 1 + Math.random() * 2.5;
                  var ch = 0.5 + Math.random() * 1.5;
                  ctx.rect(sp6[ci][0] + coffX - cw/2, sp6[ci][1] + coffY - ch/2, cw, ch);
                  ctx.fill();
                }
              }
            }
            ctx.globalCompositeOperation = 'source-over';
            // ★ 层3：蜡质浓色覆盖（小尺寸再覆盖一层，只在部分区域叠加）
            ctx.fillStyle = state.color;
            var crayCore = PF.getStroke(pts, {
              size: pfSize * 0.5, thinning: 0.3, smoothing: 0.3,
              streamline: 0.6, simulatePressure: true, last: false
            });
            if (crayCore.length >= 3) {
              ctx.globalAlpha = 0.25;
              PF.drawOutlineOnCtx(ctx, crayCore);
              ctx.fill();
            }
            // ★ 层4：边缘粗糙碎屑（蜡笔边缘不规则碎屑）
            for (var ei = 1; ei < sp6.length; ei += 2) {
              if (Math.random() < 0.2) {
                var eAngle = Math.atan2(sp6[ei][1]-sp6[ei-1][1], sp6[ei][0]-sp6[ei-1][0]);
                var ePerpX = -Math.sin(eAngle);
                var ePerpY = Math.cos(eAngle);
                var eSide = Math.random() < 0.5 ? 1 : -1;
                var eDist = pfSize * 0.3 + Math.random() * pfSize * 0.2;
                ctx.globalAlpha = 0.15 + Math.random() * 0.2;
                ctx.fillStyle = state.color;
                ctx.beginPath();
                ctx.arc(
                  sp6[ei][0] + ePerpX * eDist * eSide,
                  sp6[ei][1] + ePerpY * eDist * eSide,
                  0.5 + Math.random() * 1.5, 0, Math.PI * 2
                );
                ctx.fill();
              }
            }
            ctx.globalAlpha = 1.0;
            ctx.restore();
          }
        }

        ctx.restore();  // 恢复外层ctx.save()
        return;
      }
      // ★ 铅笔：PF轮廓填充（速写质感·石墨铅笔）
      else if (state.tool === 'pencil') {
        state.strokePoints.push([px, py]);
        var pts = state.strokePoints;
        var pfSize = state.lineWidth * 1.2;  // 铅笔基础尺寸

        // ★ 铅笔需要至少3个点才有轮廓
        if (pts.length >= 2) {
          ctx.putImageData(state.strokeSnapshot, 0, 0);
          ctx.save();

          // ★ 层1：石墨晕影（shadowBlur模拟石墨在纸面的自然晕散）
          ctx.shadowColor = state.color;
          ctx.shadowBlur = pfSize * 0.5;
          ctx.fillStyle = state.color;
          ctx.globalAlpha = 0.12;
          var glowOutline = PF.getStroke(pts, {
            size: pfSize * 1.4, thinning: 0.5, smoothing: 0.6,
            streamline: 0.45, simulatePressure: true, last: false
          });
          if (glowOutline.length >= 3) {
            PF.drawOutlineOnCtx(ctx, glowOutline);
            ctx.fill();
          }
          ctx.shadowBlur = 0;

          // ★ 层2：铅芯主体（中等宽度，模拟铅笔笔迹核心）
          ctx.globalAlpha = 0.65;
          var mainOutline = PF.getStroke(pts, {
            size: pfSize, thinning: 0.55, smoothing: 0.5,
            streamline: 0.45, simulatePressure: true, last: false
          });
          if (mainOutline.length >= 3) {
            PF.drawOutlineOnCtx(ctx, mainOutline);
            ctx.fill();
          }

          // ★ 层3：浓芯线（细而深，模拟铅笔硬芯留下的深色中心线）
          ctx.globalAlpha = 0.4;
          var coreOutline = PF.getStroke(pts, {
            size: pfSize * 0.4, thinning: 0.6, smoothing: 0.55,
            streamline: 0.4, simulatePressure: true, last: false
          });
          if (coreOutline.length >= 3) {
            PF.drawOutlineOnCtx(ctx, coreOutline);
            ctx.fill();
          }

          ctx.restore();
        }
        state.lastX = px; state.lastY = py; state.lastTime = now;
        return;
      }
      // ★ 喷枪：沿路径喷洒
      else if (state.tool === 'spray') {
        ctx.restore();
        // 沿路径插值喷洒
        var steps = Math.max(1, Math.floor(dist / 4));
        for (var i = 0; i < steps; i++) {
          var t = i / steps;
          var sx = state.lastX + dx * t;
          var sy = state.lastY + dy * t;
          sprayAt(sx, sy);
        }
        state.lastX = px;
        state.lastY = py;
        state.lastTime = now;
        return;
      }

      // 兜底（不应到达此处）
      ctx.restore();
      state.lastX = px;
      state.lastY = py;
      state.lastTime = now;
    });
  }
}

/* ★ 形状预览绘制 */
function drawShapePreview(x1, y1, x2, y2, shape) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = state.color;
  ctx.lineWidth = state.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (shape === 'line') {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  } else if (shape === 'rect') {
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
  } else if (shape === 'circle') {
    var cx = (x1 + x2) / 2;
    var cy = (y1 + y2) / 2;
    var rx = Math.abs(x2 - x1) / 2;
    var ry = Math.abs(y2 - y1) / 2;
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

function endDraw() {
  if (!state.drawing) return;
  state.drawing = false;
  // ★ 套索工具 — Excalidraw风格
  if (state.tool === 'lasso') {
    // 如果已有浮动选区在交互中，结束交互
    if (state._lassoActive) {
      state._lassoInteraction = null;
      // 保存当前画布快照（不含浮动选区叠加层）
      return;
    }
    // 新套索闭合：创建浮动选区
    if (state.lassoPath.length > 5) {
      state.lassoPath.push(state.lassoPath[0]); // 闭合路径
      if (state.lassoSnapshot) ctx.putImageData(state.lassoSnapshot, 0, 0);
      // 计算路径包围盒
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      state.lassoPath.forEach(function(p) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
      var dpr = window.devicePixelRatio || 1;
      var fw = Math.ceil(maxX - minX) + 2;
      var fh = Math.ceil(maxY - minY) + 2;
      // 裁剪选区内容到浮动canvas
      var tmpCvs = document.createElement('canvas');
      tmpCvs.width = Math.ceil(fw * dpr);
      tmpCvs.height = Math.ceil(fh * dpr);
      var tmpCtx = tmpCvs.getContext('2d');
      tmpCtx.scale(dpr, dpr);
      tmpCtx.beginPath();
      state.lassoPath.forEach(function(p, i) {
        if (i === 0) tmpCtx.moveTo(p.x - minX + 1, p.y - minY + 1);
        else tmpCtx.lineTo(p.x - minX + 1, p.y - minY + 1);
      });
      tmpCtx.closePath();
      tmpCtx.clip();
      tmpCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, -minX + 1, -minY + 1, canvas.width / dpr, canvas.height / dpr);
      // 从主画布中挖空选区
      ctx.save();
      ctx.beginPath();
      state.lassoPath.forEach(function(p, i) {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.clip();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      // 保存挖空后的画布快照
      state.lassoSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // 设置浮动选区状态
      state._lassoFloatCanvas = tmpCvs;
      state._lassoFloatX = minX - 1;
      state._lassoFloatY = minY - 1;
      state._lassoFloatOrigX = minX - 1;
      state._lassoFloatOrigY = minY - 1;
      state._lassoFloatW = fw;
      state._lassoFloatH = fh;
      state._lassoFloatOrigW = fw;
      state._lassoFloatOrigH = fh;
      state._lassoScaleX = 1;
      state._lassoScaleY = 1;
      state._lassoActive = true;
      state._lassoInteraction = null;
      // 渲染浮动选区（含蚁行线+手柄）
      renderFloatingSelection();
      startMarchingAnts();
      showLassoMenu();
    } else {
      if (state.lassoSnapshot) ctx.putImageData(state.lassoSnapshot, 0, 0);
      state._lassoActive = false;
    }
    saveState();
    return;
  }

  // ★ 毛笔收笔：Perfect Freehand式收尾（用last:true封端 + 收笔锥度）
  if (state.tool === 'brush' && state.strokePoints.length > 2) {
    var pts = state.strokePoints;

    // ★ 最终渲染：用last:true封端（含收笔锥度）
    if (state.strokeSnapshot) {
      ctx.putImageData(state.strokeSnapshot, 0, 0);
    }
    var pfSize = state.lineWidth * 5;
    // 收笔锥度：墨/水收笔长，蜡笔收笔短
    var taperDist = state.brushType === 'crayon' ? pfSize : pfSize * 1.5;
    var startTaper = pfSize * 0.5;

    // ═══════════════════════════════════════════════════════
    //  收笔渲染：每种笔触独立的艺术效果 + last:true封端
    // ═══════════════════════════════════════════════════════

    if (state.brushType === 'ink') {
      // ═══ 墨·收笔 ═══
      var inkFinal = PF.getStroke(pts, {
        size: pfSize, thinning: 0.55, smoothing: 0.5,
        streamline: 0.5, simulatePressure: true, last: true,
        start: { cap: true, taper: startTaper },
        end: { cap: true, taper: taperDist }
      });
      if (inkFinal.length >= 3) {
        ctx.save();
        // ★ 墨晕扩散：shadowBlur 实现数学级平滑高斯衰减
        ctx.shadowColor = state.color;
        ctx.shadowBlur = pfSize * 0.7;
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = state.color;
        PF.drawOutlineOnCtx(ctx, inkFinal);
        ctx.fill();
        ctx.shadowBlur = 0;
        // 主笔触
        ctx.fillStyle = state.color;
        ctx.globalAlpha = 0.88;
        PF.drawOutlineOnCtx(ctx, inkFinal);
        ctx.fill();
        // 浓墨中锋
        var coreFinal = PF.getStroke(pts, {
          size: pfSize * 0.45, thinning: 0.6, smoothing: 0.4,
          streamline: 0.5, simulatePressure: true, last: true,
          start: { cap: true, taper: startTaper * 0.6 },
          end: { cap: true, taper: taperDist * 0.8 }
        });
        if (coreFinal.length >= 3) {
          ctx.globalAlpha = 0.3;
          PF.drawOutlineOnCtx(ctx, coreFinal);
          ctx.fill();
        }
        // 枯笔飞白
        for (var ki = 0; ki < pts.length; ki += 2) {
          if (Math.random() < 0.12) {
            var kAngle = ki > 0 ? Math.atan2(pts[ki][1]-pts[ki-1][1], pts[ki][0]-pts[ki-1][0]) : 0;
            var kPerpAngle = kAngle + Math.PI / 2;
            var kDist = pfSize * 0.3 + Math.random() * pfSize * 0.35;
            for (var kd = -1; kd <= 1; kd += 2) {
              if (Math.random() < 0.4) {
                ctx.globalAlpha = 0.08 + Math.random() * 0.12;
                ctx.fillStyle = state.color;
                ctx.beginPath();
                ctx.arc(
                  pts[ki][0] + Math.cos(kPerpAngle) * kDist * kd + (Math.random() - 0.5) * 3,
                  pts[ki][1] + Math.sin(kPerpAngle) * kDist * kd + (Math.random() - 0.5) * 3,
                  0.5 + Math.random() * 1.5, 0, Math.PI * 2
                );
                ctx.fill();
              }
            }
          }
        }
        // 墨渍沉淀
        for (var mi = 2; mi < pts.length; mi += 4) {
          var mdist = Math.hypot(pts[mi][0]-pts[mi-1][0], pts[mi][1]-pts[mi-1][1]);
          if (mdist < 8 && Math.random() < 0.25) {
            ctx.globalAlpha = 0.1 + Math.random() * 0.15;
            ctx.fillStyle = state.color;
            ctx.beginPath();
            ctx.arc(
              pts[mi][0] + (Math.random() - 0.5) * pfSize * 0.2,
              pts[mi][1] + (Math.random() - 0.5) * pfSize * 0.2,
              pfSize * 0.06 + Math.random() * pfSize * 0.08,
              0, Math.PI * 2
            );
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1.0;
        ctx.restore();
      }
    }
    else if (state.brushType === 'watercolor') {
      // ═══ 水·收笔 ═══
      var wcFinal = PF.getStroke(pts, {
        size: pfSize, thinning: 0.6, smoothing: 0.55,
        streamline: 0.45, simulatePressure: true, last: true,
        start: { cap: true, taper: startTaper },
        end: { cap: true, taper: taperDist }
      });
      if (wcFinal.length >= 3) {
        ctx.save();
        // 湿中湿扩散
        ctx.shadowColor = state.color;
        ctx.shadowBlur = pfSize * 0.4;
        ctx.fillStyle = state.color;
        ctx.globalAlpha = 0.06;
        var wetFinal = PF.getStroke(pts, {
          size: pfSize * 2.2, thinning: 0.3, smoothing: 0.7,
          streamline: 0.35, simulatePressure: true, last: true,
          start: { cap: true, taper: startTaper },
          end: { cap: true, taper: taperDist }
        });
        if (wetFinal.length >= 3) { PF.drawOutlineOnCtx(ctx, wetFinal); ctx.fill(); }
        ctx.shadowBlur = 0;
        // 水彩基底
        ctx.shadowColor = state.color;
        ctx.shadowBlur = pfSize * 0.15;
        ctx.globalAlpha = 0.14;
        var baseFinal = PF.getStroke(pts, {
          size: pfSize * 1.5, thinning: 0.4, smoothing: 0.6,
          streamline: 0.4, simulatePressure: true, last: true,
          start: { cap: true, taper: startTaper },
          end: { cap: true, taper: taperDist }
        });
        if (baseFinal.length >= 3) { PF.drawOutlineOnCtx(ctx, baseFinal); ctx.fill(); }
        ctx.shadowBlur = 0;
        // 水痕边缘沉淀（multiply）
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = state.color;
        ctx.globalAlpha = 0.18;
        var edgeFinal = PF.getStroke(pts, {
          size: pfSize * 1.15, thinning: 0.55, smoothing: 0.5,
          streamline: 0.5, simulatePressure: true, last: true,
          start: { cap: true, taper: startTaper },
          end: { cap: true, taper: taperDist }
        });
        if (edgeFinal.length >= 3) { PF.drawOutlineOnCtx(ctx, edgeFinal); ctx.fill(); }
        ctx.globalCompositeOperation = 'source-over';
        // 中心浅色
        ctx.fillStyle = '#F9F5EB';
        ctx.globalAlpha = 0.08;
        var innerFinal = PF.getStroke(pts, {
          size: pfSize * 0.6, thinning: 0.6, smoothing: 0.5,
          streamline: 0.5, simulatePressure: true, last: true,
          start: { cap: true, taper: startTaper * 0.6 },
          end: { cap: true, taper: taperDist * 0.8 }
        });
        if (innerFinal.length >= 3) { PF.drawOutlineOnCtx(ctx, innerFinal); ctx.fill(); }
        // 颗粒沉淀
        ctx.fillStyle = state.color;
        for (var gi = 0; gi < pts.length; gi += 3) {
          if (Math.random() < 0.3) {
            ctx.globalAlpha = 0.04 + Math.random() * 0.08;
            ctx.beginPath();
            ctx.arc(
              pts[gi][0] + (Math.random() - 0.5) * pfSize * 0.7,
              pts[gi][1] + (Math.random() - 0.5) * pfSize * 0.7,
              0.5 + Math.random() * 1.2, 0, Math.PI * 2
            );
            ctx.fill();
          }
        }
        // 水渍光斑
        for (var hi = 1; hi < pts.length; hi += 5) {
          if (Math.random() < 0.15) {
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.04 + Math.random() * 0.06;
            ctx.beginPath();
            ctx.arc(
              pts[hi][0] + (Math.random() - 0.5) * pfSize * 0.4,
              pts[hi][1] + (Math.random() - 0.5) * pfSize * 0.4,
              0.8 + Math.random() * 2, 0, Math.PI * 2
            );
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1.0;
        ctx.restore();
      }
    }
    else if (state.brushType === 'crayon') {
      // ═══ 蜡·收笔 ═══
      var crayFinal = PF.getStroke(pts, {
        size: pfSize * 0.85, thinning: 0.35, smoothing: 0.35,
        streamline: 0.55, simulatePressure: true, last: true,
        start: { cap: true, taper: startTaper },
        end: { cap: true, taper: taperDist }
      });
      if (crayFinal.length >= 3) {
        ctx.save();
        // 蜡笔底色
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = state.color;
        ctx.globalAlpha = 0.7;
        PF.drawOutlineOnCtx(ctx, crayFinal);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        // 纸纹漏白
        ctx.globalCompositeOperation = 'destination-out';
        for (var ci = 0; ci < pts.length; ci++) {
          var cAngle = ci > 0 ? Math.atan2(pts[ci][1]-pts[ci-1][1], pts[ci][0]-pts[ci-1][0]) : 0;
          var cPerpX = -Math.sin(cAngle);
          var cPerpY = Math.cos(cAngle);
          var cCount = 3 + Math.floor(Math.random() * 3);
          for (var cj = 0; cj < cCount; cj++) {
            if (Math.random() < 0.35) {
              var coffX = cPerpX * (Math.random() - 0.5) * pfSize * 0.7;
              var coffY = cPerpY * (Math.random() - 0.5) * pfSize * 0.7;
              ctx.globalAlpha = 0.15 + Math.random() * 0.3;
              ctx.beginPath();
              var cw = 1 + Math.random() * 2.5;
              var ch = 0.5 + Math.random() * 1.5;
              ctx.rect(pts[ci][0] + coffX - cw/2, pts[ci][1] + coffY - ch/2, cw, ch);
              ctx.fill();
            }
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        // 蜡质浓色
        ctx.fillStyle = state.color;
        var crayCoreF = PF.getStroke(pts, {
          size: pfSize * 0.5, thinning: 0.3, smoothing: 0.3,
          streamline: 0.6, simulatePressure: true, last: true,
          start: { cap: true, taper: startTaper * 0.5 },
          end: { cap: true, taper: taperDist * 0.6 }
        });
        if (crayCoreF.length >= 3) {
          ctx.globalAlpha = 0.25;
          PF.drawOutlineOnCtx(ctx, crayCoreF);
          ctx.fill();
        }
        // 边缘碎屑
        for (var ei = 1; ei < pts.length; ei += 2) {
          if (Math.random() < 0.2) {
            var eAngle = Math.atan2(pts[ei][1]-pts[ei-1][1], pts[ei][0]-pts[ei-1][0]);
            var ePerpX = -Math.sin(eAngle);
            var ePerpY = Math.cos(eAngle);
            var eSide = Math.random() < 0.5 ? 1 : -1;
            var eDist = pfSize * 0.3 + Math.random() * pfSize * 0.2;
            ctx.globalAlpha = 0.15 + Math.random() * 0.2;
            ctx.fillStyle = state.color;
            ctx.beginPath();
            ctx.arc(
              pts[ei][0] + ePerpX * eDist * eSide,
              pts[ei][1] + ePerpY * eDist * eSide,
              0.5 + Math.random() * 1.5, 0, Math.PI * 2
            );
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1.0;
        ctx.restore();
      }
    }

    state.strokePoints = [];
    state.strokeSnapshot = null;
  }
  // ★ 铅笔收笔：PF式收尾
  else if (state.tool === 'pencil' && state.strokePoints && state.strokePoints.length > 2) {
    var pts = state.strokePoints;
    if (state.strokeSnapshot) {
      ctx.putImageData(state.strokeSnapshot, 0, 0);
    }
    var pfSize = state.lineWidth * 1.2;
    var startTaper = pfSize * 0.3;
    var endTaper = pfSize * 0.8;

    ctx.save();
    // 石墨晕影
    ctx.shadowColor = state.color;
    ctx.shadowBlur = pfSize * 0.5;
    ctx.fillStyle = state.color;
    ctx.globalAlpha = 0.12;
    var glowF = PF.getStroke(pts, {
      size: pfSize * 1.4, thinning: 0.5, smoothing: 0.6,
      streamline: 0.45, simulatePressure: true, last: true,
      start: { cap: true, taper: startTaper },
      end: { cap: true, taper: endTaper }
    });
    if (glowF.length >= 3) { PF.drawOutlineOnCtx(ctx, glowF); ctx.fill(); }
    ctx.shadowBlur = 0;

    // 铅芯主体
    ctx.globalAlpha = 0.65;
    var mainF = PF.getStroke(pts, {
      size: pfSize, thinning: 0.55, smoothing: 0.5,
      streamline: 0.45, simulatePressure: true, last: true,
      start: { cap: true, taper: startTaper },
      end: { cap: true, taper: endTaper }
    });
    if (mainF.length >= 3) { PF.drawOutlineOnCtx(ctx, mainF); ctx.fill(); }

    // 浓芯线
    ctx.globalAlpha = 0.4;
    var coreF = PF.getStroke(pts, {
      size: pfSize * 0.4, thinning: 0.6, smoothing: 0.55,
      streamline: 0.4, simulatePressure: true, last: true,
      start: { cap: true, taper: startTaper * 0.5 },
      end: { cap: true, taper: endTaper * 0.6 }
    });
    if (coreF.length >= 3) { PF.drawOutlineOnCtx(ctx, coreF); ctx.fill(); }

    ctx.globalAlpha = 1.0;
    ctx.restore();

    state.strokePoints = [];
    state.strokeSnapshot = null;
  }
  state.shapeSnapshot = null;
  saveState();
}

/* ── Touch事件 ── */
/* ★ 套索操作菜单 */
function showLassoMenu() {
  var existing = document.getElementById('sb-lasso-menu');
  if (existing) existing.remove();
  var menu = document.createElement('div');
  menu.id = 'sb-lasso-menu';
  menu.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:25;display:flex;gap:6px;padding:8px 12px;background:rgba(6,82,121,.95);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:12px;border:1px solid rgba(255,255,255,.1);box-shadow:0 6px 20px rgba(0,0,0,.3)';
  var hasClip = !!state._clipboard;
  var actions = [
    {label:'描边',icon:'◎',fn:lassoStroke},
    {label:'填充',icon:'◆',fn:lassoFill},
    {label:'复制',icon:'⎘',fn:lassoCopy},
    {label:'粘贴',icon:'📋',fn:lassoPaste,disabled:!hasClip},
    {label:'液化',icon:'~',fn:lassoLiquify},
    {label:'删除',icon:'🗑',fn:lassoDelete},
    {label:'取消',icon:'✕',fn:lassoCancel}
  ];
  actions.forEach(function(a) {
    var btn = document.createElement('div');
    btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 8px;border-radius:8px;cursor:pointer;color:#F9F5EB;font-size:10px;';
    btn.innerHTML = '<span style="font-size:18px">' + a.icon + '</span>' + a.label;
    if (a.disabled) {
      btn.style.opacity = '0.3';
      btn.style.cursor = 'not-allowed';
    } else {
      var _fired = false;
      var _fn = function(ev) { if(_fired) return; _fired = true; if(ev) ev.preventDefault(); a.fn(); };
      btn.addEventListener('touchend', function(ev) { _fn(ev); }, {passive:false});
      btn.addEventListener('click', function() { _fn(); });
    }
    menu.appendChild(btn);
  });
  board.appendChild(menu);
}

/* ★ 蚁行线动画 */
var _marchOffset = 0;
var _marchTimer = null;
function startMarchingAnts() {
  stopMarchingAnts();
  _marchTimer = setInterval(function() {
    _marchOffset = (_marchOffset + 1) % 16;
    if (state._lassoActive) {
      // 恢复快照 → 重绘浮选内容+UI
      if (state.lassoSnapshot) ctx.putImageData(state.lassoSnapshot, 0, 0);
      renderFloatingSelection();
    }
  }, 60);
}
function stopMarchingAnts() {
  if (_marchTimer) { clearInterval(_marchTimer); _marchTimer = null; }
}

/* ★ 绘制套索叠加层（虚线+半透明+8手柄），不保存snapshot */
function _drawLassoOverlay() {
  if (!state._lassoActive || state.lassoPath.length < 3) return;
  var bb = lassoCalcBBox();
  ctx.save();
  // 半透明填充
  ctx.beginPath();
  for (var i = 0; i < state.lassoPath.length; i++) {
    if (i === 0) ctx.moveTo(state.lassoPath[i].x, state.lassoPath[i].y);
    else ctx.lineTo(state.lassoPath[i].x, state.lassoPath[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(240,128,96,0.06)';
  ctx.fill();
  // 蚁行线
  ctx.beginPath();
  for (var i2 = 0; i2 < state.lassoPath.length; i2++) {
    if (i2 === 0) ctx.moveTo(state.lassoPath[i2].x, state.lassoPath[i2].y);
    else ctx.lineTo(state.lassoPath[i2].x, state.lassoPath[i2].y);
  }
  ctx.closePath();
  ctx.strokeStyle = '#F08060';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -_marchOffset;
  ctx.stroke();
  ctx.setLineDash([]);
  // 8个缩放手柄（矩形选区的4角+4边中点）
  var hs = 5; // 手柄半径
  var handles = lassoGetHandles(bb);
  for (var hi = 0; hi < handles.length; hi++) {
    var h = handles[hi];
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#4A7BA5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(h.x, h.y, hs, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/* ★ 重绘套索叠加层（先保存snapshot再绘制视觉） */
function redrawLassoOverlay() {
  if (!state._lassoActive || state.lassoPath.length < 3) return;
  state.lassoSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  _drawLassoOverlay();
  startMarchingAnts();
}

/* ★ 获取8个缩放手柄的位置 */
function lassoGetHandles(bb) {
  var mx = (bb.x1 + bb.x2) / 2, my = (bb.y1 + bb.y2) / 2;
  return [
    {x: bb.x1, y: bb.y1, cursor: 'nw'},   // 0: 左上
    {x: mx,    y: bb.y1, cursor: 'n'},      // 1: 上中
    {x: bb.x2, y: bb.y1, cursor: 'ne'},     // 2: 右上
    {x: bb.x2, y: my,    cursor: 'e'},      // 3: 右中
    {x: bb.x2, y: bb.y2, cursor: 'se'},     // 4: 右下
    {x: mx,    y: bb.y2, cursor: 's'},      // 5: 下中
    {x: bb.x1, y: bb.y2, cursor: 'sw'},     // 6: 左下
    {x: bb.x1, y: my,    cursor: 'w'}       // 7: 左中
  ];
}

/* ★ 检测点是否在某个手柄上，返回手柄索引或-1 */
function lassoHitHandle(px, py) {
  var bb = lassoCalcBBox();
  var handles = lassoGetHandles(bb);
  var hr = 12; // 手柄点击热区半径
  for (var i = 0; i < handles.length; i++) {
    var dx = px - handles[i].x, dy = py - handles[i].y;
    if (dx * dx + dy * dy <= hr * hr) return i;
  }
  return -1;
}

/* ★ 检测点是否在选区内部 */
function lassoHitInside(px, py) {
  if (state.lassoPath.length < 3) return false;
  // 射线法判断点是否在多边形内
  var inside = false;
  for (var i = 0, j = state.lassoPath.length - 1; i < state.lassoPath.length; j = i++) {
    var xi = state.lassoPath[i].x, yi = state.lassoPath[i].y;
    var xj = state.lassoPath[j].x, yj = state.lassoPath[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/* ★ 检测点是否在选区边缘（用于液化） */
function lassoHitEdge(px, py) {
  if (state.lassoPath.length < 3) return -1;
  var threshold = 15;
  for (var i = 0; i < state.lassoPath.length; i++) {
    var j = (i + 1) % state.lassoPath.length;
    var d = pointToSegDist(px, py, state.lassoPath[i].x, state.lassoPath[i].y, state.lassoPath[j].x, state.lassoPath[j].y);
    if (d < threshold) return i;
  }
  return -1;
}

function pointToSegDist(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  var projX = ax + t * dx, projY = ay + t * dy;
  return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

function lassoStroke() {
  if (!state._lassoActive || state.lassoPath.length < 3) return;
  // 先恢复快照
  if (state.lassoSnapshot) {
    ctx.putImageData(state.lassoSnapshot, 0, 0);
  }
  // 描边
  ctx.save();
  ctx.beginPath();
  state.lassoPath.forEach(function(p, i) {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.strokeStyle = state.color;
  ctx.lineWidth = state.lineWidth;
  ctx.stroke();
  ctx.restore();
  // 更新快照
  state.lassoSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  renderFloatingSelection();
  saveState();
  showLassoMenu();
}

function lassoCopyInner() {
  if (state.lassoPath.length < 3 || !state._lassoActive) return;
  var bb = lassoCalcBBox();
  var dpr = window.devicePixelRatio || 1;
  var w = Math.ceil((bb.x2 - bb.x1) * dpr);
  var h = Math.ceil((bb.y2 - bb.y1) * dpr);
  if (w < 1 || h < 1) return;
  var tmpCvs = document.createElement('canvas');
  tmpCvs.width = w;
  tmpCvs.height = h;
  var tmpCtx = tmpCvs.getContext('2d');
  tmpCtx.beginPath();
  state.lassoPath.forEach(function(p, i) {
    if (i === 0) tmpCtx.moveTo((p.x - bb.x1) * dpr, (p.y - bb.y1) * dpr);
    else tmpCtx.lineTo((p.x - bb.x1) * dpr, (p.y - bb.y1) * dpr);
  });
  tmpCtx.closePath();
  tmpCtx.clip();
  tmpCtx.drawImage(canvas, bb.x1 * dpr, bb.y1 * dpr, w, h, 0, 0, w, h);
  state._clipboard = { canvas: tmpCvs, x: bb.x1, y: bb.y1, w: bb.x2 - bb.x1, h: bb.y2 - bb.y1 };
}

function lassoCopy() {
  if (!state._lassoActive) return;
  lassoCopyInner();
  // 复制后保持选区，重新显示菜单
  showLassoMenu();
}

function lassoPaste() {
  if (!state._clipboard) return;
  // 先提交当前浮动选区
  if (state._lassoActive) {
    commitLasso();
  }
  var clip = state._clipboard;
  var dpr = window.devicePixelRatio || 1;
  // 在画布中心偏移位置粘贴
  var ox = (state.lastX || clip.x + clip.w / 2) - clip.w / 2;
  var oy = (state.lastY || clip.y + clip.h / 2) - clip.h / 2;
  // 创建浮动选区
  var fc = document.createElement('canvas');
  fc.width = clip.canvas.width;
  fc.height = clip.canvas.height;
  fc.getContext('2d').drawImage(clip.canvas, 0, 0);
  state._lassoFloatCanvas = fc;
  state._lassoFloatX = ox;
  state._lassoFloatY = oy;
  state._lassoFloatW = clip.w;
  state._lassoFloatH = clip.h;
  state._lassoFloatOrigW = clip.w;
  state._lassoFloatOrigH = clip.h;
  state._lassoScaleX = 1;
  state._lassoScaleY = 1;
  state._lassoActive = true;
  state._lassoClosed = true;
  state._lassoMode = 'select';
  state._lassoInteraction = null;
  // 粘贴区域路径（矩形）
  state.lassoPath = [
    {x: ox, y: oy}, {x: ox + clip.w, y: oy},
    {x: ox + clip.w, y: oy + clip.h}, {x: ox, y: oy + clip.h}
  ];
  state._lassoOrigPath = state.lassoPath.map(function(p) { return {x:p.x, y:p.y}; });
  state._lassoOrigBB = lassoCalcBBox();
  // 保存快照
  state.lassoSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  renderFloatingSelection();
  startMarchingAnts();
  showLassoMenu();
}

function lassoFill() {
  if (!state._lassoActive || state.lassoPath.length < 3) return;
  // 保存路径副本
  var savedPath = state.lassoPath.slice();
  // 先提交浮动选区（烘焙到画布），这样画布恢复完整内容
  commitLasso();
  // 现在画布内容完整，在选区路径内填充颜色
  ctx.save();
  ctx.beginPath();
  savedPath.forEach(function(p, i) {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = state.color;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1.0;
  ctx.restore();
  // 重建选区路径并创建新的浮动选区
  state.lassoPath = savedPath;
  var bb = lassoCalcBBox();
  state._lassoFloatX = bb.x; state._lassoFloatY = bb.y;
  state._lassoFloatW = bb.w; state._lassoFloatH = bb.h;
  state._lassoFloatOrigX = bb.x; state._lassoFloatOrigY = bb.y;
  state._lassoFloatOrigW = bb.w; state._lassoFloatOrigH = bb.h;
  var dpr = window.devicePixelRatio || 1;
  var tmpCvs = document.createElement('canvas');
  tmpCvs.width = Math.ceil(bb.w * dpr);
  tmpCvs.height = Math.ceil(bb.h * dpr);
  var tmpCtx = tmpCvs.getContext('2d');
  tmpCtx.scale(dpr, dpr);
  // 裁剪到套索路径
  tmpCtx.beginPath();
  savedPath.forEach(function(p, i) {
    if (i === 0) tmpCtx.moveTo(p.x - bb.x, p.y - bb.y);
    else tmpCtx.lineTo(p.x - bb.x, p.y - bb.y);
  });
  tmpCtx.closePath();
  tmpCtx.clip();
  // 从主画布读取填充后的内容
  tmpCtx.drawImage(canvas, -bb.x, -bb.y);
  state._lassoFloatCanvas = tmpCvs;
  state._lassoActive = true;
  // 在主画布上挖空选区
  state.lassoSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  savedPath.forEach(function(p, i) {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  state.lassoSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  renderFloatingSelection();
  saveState();
  showLassoMenu();
}

function lassoDelete() {
  if (!state._lassoActive) return;
  // 快照已包含挖空区域，直接恢复快照并清除选区即可
  lassoCleanup();
  saveState();
}

/* ★ 液化模式：进入液化状态 */
function lassoLiquify() {
  if (!state._lassoActive || state.lassoPath.length < 3) return;
  state._lassoMode = 'liquify';
  state._lassoLiquifying = true;
  // 保存原始路径和边界框
  state._lassoOrigPath = state.lassoPath.map(function(p) { return {x:p.x, y:p.y}; });
  state._lassoOrigBB = lassoCalcBBox();
  // 关闭菜单，用户直接在画布上拖拽
  var menu = document.getElementById('sb-lasso-menu');
  if (menu) menu.remove();
  renderFloatingSelection();
}

/* ★ 从剪贴板重新构建浮动选区 */
/* ★ Excalidraw式浮动选区渲染：浮选内容+蚁行线+8手柄 */
function renderFloatingSelection() {
  if (!state._lassoActive || !state._lassoFloatCanvas) return;
  var dpr = window.devicePixelRatio || 1;
  ctx.save();
  // 1. 绘制浮动选区内容（缩放绘制）
  var fx = state._lassoFloatX, fy = state._lassoFloatY;
  var fw = state._lassoFloatW, fh = state._lassoFloatH;
  ctx.drawImage(state._lassoFloatCanvas,
    0, 0, state._lassoFloatCanvas.width, state._lassoFloatCanvas.height,
    fx, fy, fw, fh
  );
  // 2. 绘制蚁行线选区边框（围绕浮选区域）
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -(_marchOffset || 0);
  ctx.strokeStyle = '#4A7BA5';
  ctx.lineWidth = 1.5 / dpr;
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.setLineDash([]);
  // 3. 液化模式：显示光标半径圈
  if (state._lassoMode === 'liquify') {
    var radius = Math.min(fw, fh) * 0.2;
    if (radius < 12) radius = 12;
    if (state._lassoLiquifyLastX) {
      ctx.beginPath();
      ctx.arc(state._lassoLiquifyLastX, state._lassoLiquifyLastY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(240,128,96,0.6)';
      ctx.lineWidth = 1.5 / dpr;
      ctx.setLineDash([]);
      ctx.stroke();
    }
  }
  // 4. 8个缩放手柄（非液化模式下）
  if (state._lassoMode !== 'liquify') {
    var handles = lassoGetHandles({x1: fx, y1: fy, x2: fx + fw, y2: fy + fh});
    for (var h = 0; h < handles.length; h++) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#4A7BA5';
      ctx.lineWidth = 1.5 / dpr;
      ctx.beginPath();
      ctx.arc(handles[h].x, handles[h].y, 5 / dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ★ 手柄命中测试 — 返回手柄方向名或null */
function hitTestLassoHandle(x, y) {
  if (!state._lassoActive) return null;
  var fx = state._lassoFloatX, fy = state._lassoFloatY;
  var fw = state._lassoFloatW, fh = state._lassoFloatH;
  var handles = lassoGetHandles({x1: fx, y1: fy, x2: fx + fw, y2: fy + fh});
  var hr = 18; // 手柄点击热区半径（稍大，方便触摸）
  var dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  for (var i = 0; i < handles.length; i++) {
    var dx = x - handles[i].x, dy = y - handles[i].y;
    if (dx * dx + dy * dy <= hr * hr) return dirs[i];
  }
  return null;
}

/* ★ 通过手柄缩放选区 — Excalidraw式8点自由缩放 */
function resizeLassoByHandle(handleDir, mx, my) {
  if (!state._lassoActive || !state._lassoFloatCanvas) return;
  var fx = state._lassoFloatX, fy = state._lassoFloatY;
  var fw = state._lassoFloatW, fh = state._lassoFloatH;
  var ax = state._lassoHandleAnchorX, ay = state._lassoHandleAnchorY;
  // 根据手柄方向计算新的边界
  var nx1 = fx, ny1 = fy, nx2 = fx + fw, ny2 = fy + fh;
  if (handleDir.indexOf('w') >= 0) nx1 = mx;
  if (handleDir.indexOf('e') >= 0) nx2 = mx;
  if (handleDir.indexOf('n') >= 0) ny1 = my;
  if (handleDir.indexOf('s') >= 0) ny2 = my;
  // 防止翻转（保证最小尺寸）
  if (nx2 - nx1 < 10) { if (handleDir.indexOf('w') >= 0) nx1 = nx2 - 10; else nx2 = nx1 + 10; }
  if (ny2 - ny1 < 10) { if (handleDir.indexOf('n') >= 0) ny1 = ny2 - 10; else ny2 = ny1 + 10; }
  state._lassoFloatX = nx1;
  state._lassoFloatY = ny1;
  state._lassoFloatW = nx2 - nx1;
  state._lassoFloatH = ny2 - ny1;
  state._lassoScaleX = state._lassoFloatW / (state._lassoFloatOrigW || state._lassoFloatW);
  state._lassoScaleY = state._lassoFloatH / (state._lassoFloatOrigH || state._lassoFloatH);
}

/* ★ 液化变形 — 在浮动选区canvas上沿拖拽方向推拉像素，改变胖瘦 */
function liquifyStroke(mx, my) {
  if (!state._lassoActive || !state._lassoFloatCanvas) return;
  var dpr = window.devicePixelRatio || 1;
  var fw = state._lassoFloatW, fh = state._lassoFloatH;
  // 液化笔刷半径
  var radius = Math.min(fw, fh) * 0.2;
  if (radius < 12) radius = 12;
  // 计算拖拽方向
  var dx = mx - (state._lassoLiquifyLastX || mx);
  var dy = my - (state._lassoLiquifyLastY || my);
  state._lassoLiquifyLastX = mx;
  state._lassoLiquifyLastY = my;
  var dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.3) return;
  // 转换到浮动canvas局部坐标（设备像素）
  var cx = (mx - state._lassoFloatX) * dpr;
  var cy = (my - state._lassoFloatY) * dpr;
  var rDpr = radius * dpr;
  var fc = state._lassoFloatCanvas;
  var fctx = fc.getContext('2d');
  var fcW = fc.width, fcH = fc.height;
  // 读取当前浮动canvas全像素
  var imgData = fctx.getImageData(0, 0, fcW, fcH);
  var src = new Uint8ClampedArray(imgData.data);
  var dst = imgData.data;
  // 只遍历笔刷影响范围内的像素
  var bx0 = Math.max(0, Math.floor(cx - rDpr));
  var by0 = Math.max(0, Math.floor(cy - rDpr));
  var bx1 = Math.min(fcW - 1, Math.ceil(cx + rDpr));
  var by1 = Math.min(fcH - 1, Math.ceil(cy + rDpr));
  var shiftX = dx * dpr, shiftY = dy * dpr;
  for (var py = by0; py <= by1; py++) {
    for (var px = bx0; px <= bx1; px++) {
      var ddx = px - cx, ddy = py - cy;
      var dd = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dd >= rDpr) continue;
      // 高斯衰减权重
      var t = dd / rDpr;
      var weight = Math.exp(-t * t * 3);
      // 位移源坐标
      var sx = Math.round(px - shiftX * weight);
      var sy = Math.round(py - shiftY * weight);
      if (sx < 0 || sx >= fcW || sy < 0 || sy >= fcH) continue;
      var di = (py * fcW + px) * 4;
      var si = (sy * fcW + sx) * 4;
      dst[di]     = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  fctx.putImageData(imgData, 0, 0);
}

/* ★ 提交选区 — 将浮动选区内容烘焙到画布，清除选区状态 */
function commitLasso() {
  if (!state._lassoActive) return;
  stopMarchingAnts();
  // 恢复到挖空后的画布
  if (state.lassoSnapshot) ctx.putImageData(state.lassoSnapshot, 0, 0);
  // 将浮动选区内容绘制到主画布上
  if (state._lassoFloatCanvas) {
    ctx.drawImage(state._lassoFloatCanvas,
      0, 0, state._lassoFloatCanvas.width, state._lassoFloatCanvas.height,
      state._lassoFloatX, state._lassoFloatY, state._lassoFloatW, state._lassoFloatH
    );
  }
  // 清除所有选区状态
  state._lassoActive = false;
  state._lassoFloatCanvas = null;
  state._lassoFloatX = 0;
  state._lassoFloatY = 0;
  state._lassoFloatW = 0;
  state._lassoFloatH = 0;
  state._lassoFloatOrigW = 0;
  state._lassoFloatOrigH = 0;
  state._lassoFloatOrigX = 0;
  state._lassoFloatOrigY = 0;
  state._lassoScaleX = 1;
  state._lassoScaleY = 1;
  state._lassoInteraction = null;
  state._lassoHandleIdx = -1;
  state._lassoLiquifying = false;
  state._lassoClosed = false;
  state._lassoDragging = false;
  state._lassoMode = 'select';
  state.lassoPath = [];
  state.lassoSnapshot = null;
  state._lassoOrigPath = null;
  state._lassoOrigBB = null;
  state.isLassoPinching = false;
  state._lassoScale = 1;
  // 移除套索菜单
  var menu = document.getElementById('sb-lasso-menu');
  if (menu) menu.remove();
  saveState();
}

function lassoCalcBBox() {
  var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (var i = 0; i < state.lassoPath.length; i++) {
    var p = state.lassoPath[i];
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  state._lassoBBox = {x1: x1, y1: y1, x2: x2, y2: y2, cx: (x1+x2)/2, cy: (y1+y2)/2};
  return state._lassoBBox;
}

function lassoCleanup() {
  stopMarchingAnts();
  if (state.lassoSnapshot) {
    ctx.putImageData(state.lassoSnapshot, 0, 0);
    state.lassoSnapshot = null;
  }
  state._lassoActive = false;
  state._lassoFloatCanvas = null;
  state._lassoFloatX = 0;
  state._lassoFloatY = 0;
  state._lassoFloatW = 0;
  state._lassoFloatH = 0;
  state._lassoFloatOrigW = 0;
  state._lassoFloatOrigH = 0;
  state._lassoScaleX = 1;
  state._lassoScaleY = 1;
  state._lassoInteraction = null;
  state._lassoClosed = false;
  state._lassoDragging = false;
  state._lassoMode = 'select';
  state._lassoHandleIdx = -1;
  state._lassoLiquifying = false;
  state.isLassoPinching = false;
  state._lassoScale = 1;
  state.lassoPath = [];
  state._lassoOrigPath = null;
  state._lassoOrigBB = null;
  var menu = document.getElementById('sb-lasso-menu');
  if (menu) menu.remove();
}

function lassoCancel() {
  // 取消时：将浮动选区内容回写原始位置（填回挖空区域），然后清除选区
  if (state._lassoActive && state._lassoFloatCanvas) {
    // 恢复快照（挖空状态）
    if (state.lassoSnapshot) ctx.putImageData(state.lassoSnapshot, 0, 0);
    // 将浮动内容绘制回原始位置
    ctx.drawImage(state._lassoFloatCanvas,
      0, 0, state._lassoFloatCanvas.width, state._lassoFloatCanvas.height,
      state._lassoFloatOrigX, state._lassoFloatOrigY, state._lassoFloatOrigW, state._lassoFloatOrigH
    );
  }
  lassoCleanup();
  saveState();
}

function getTouchDist(t1, t2) {
  var dx = t1.clientX - t2.clientX;
  var dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
function getTouchMid(t1, t2) {
  return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
}

canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.touches.length === 2) {
    // ★ 双指：套索选区缩放 vs 画板整体缩放
    if (state._lassoClosed && state.lassoPath.length > 2) {
      // ★ 套索缩放模式
      state.isLassoPinching = true;
      state._lassoPinchDist = getTouchDist(e.touches[0], e.touches[1]);
      state._lassoPinchStartScale = state._lassoScale;
    } else {
      // ★ 画板整体缩放+移动
      if (state.drawing) {
        state.drawing = false;
        if (state.strokeSnapshot) {
          ctx.putImageData(state.strokeSnapshot, 0, 0);
          state.strokeSnapshot = null;
        }
        state.strokePoints = [];
      }
      state.isPinching = true;
      state.pinchDist = getTouchDist(e.touches[0], e.touches[1]);
      var mid = getTouchMid(e.touches[0], e.touches[1]);
      state.pinchMidX = mid.x;
      state.pinchMidY = mid.y;
      state._pinchStart = { scale: state.boardScale, offX: state.boardOffX, offY: state.boardOffY, midX: mid.x, midY: mid.y, dist: state.pinchDist };
    }
  } else if (e.touches.length === 1) {
    state.isPinching = false;
    state.isLassoPinching = false;
    var rect = canvas.getBoundingClientRect();
    var cx = e.touches[0].clientX - rect.left;
    var cy = e.touches[0].clientY - rect.top;
    var p = screenToCanvas(cx, cy);
    startDraw(p.x, p.y);
  }
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.touches.length === 2 && state._lassoActive) {
    // ★ Excalidraw-style浮动选区双指缩放
    var newDist = getTouchDist(e.touches[0], e.touches[1]);
    if (!state.isLassoPinching) {
      state.isLassoPinching = true;
      state._lassoPinchDist = newDist;
      state._lassoPinchStartScaleX = state._lassoScaleX;
      state._lassoPinchStartScaleY = state._lassoScaleY;
    }
    var ratio = newDist / Math.max(state._lassoPinchDist, 1);
    var nsx = Math.max(0.2, Math.min(5.0, state._lassoPinchStartScaleX * ratio));
    var nsy = Math.max(0.2, Math.min(5.0, state._lassoPinchStartScaleY * ratio));
    state._lassoScaleX = nsx;
    state._lassoScaleY = nsy;
    state._lassoFloatW = state._lassoFloatOrigW * nsx;
    state._lassoFloatH = state._lassoFloatOrigH * nsy;
    renderFloatingSelection();
  } else if (e.touches.length === 2 && state.isPinching && state._pinchStart) {
    var ps = state._pinchStart;
    var newDist = getTouchDist(e.touches[0], e.touches[1]);
    var mid = getTouchMid(e.touches[0], e.touches[1]);
    // ★ 缩放比：基于初始距离
    var ratio = newDist / Math.max(ps.dist, 1);
    var newScale = Math.max(0.5, Math.min(2.5, ps.scale * ratio));
    // ★ 平移量：双指中心相对初始中心的偏移
    var dx = mid.x - ps.midX;
    var dy = mid.y - ps.midY;
    // 保存新的board状态
    state.boardScale = newScale;
    state.boardOffX = ps.offX + dx;
    state.boardOffY = ps.offY + dy;
    // ★ 对整个画板应用CSS transform（GPU加速，整个画板一起缩放+移动）
    applyBoardTransform();
  } else if (e.touches.length === 1 && !state.isPinching) {
    var rect2 = canvas.getBoundingClientRect();
    var cx2 = e.touches[0].clientX - rect2.left;
    var cy2 = e.touches[0].clientY - rect2.top;
    var p2 = screenToCanvas(cx2, cy2);
    moveDraw(p2.x, p2.y);
  }
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.touches.length === 0) {
    // 结束Excalidraw-style套索交互
    if (state._lassoInteraction) {
      state._lassoInteraction = null;
      state._lassoHandleIdx = -1;
      state._lassoLiquifying = false;
    }
    if (state.isLassoPinching) {
      state.isLassoPinching = false;
    }
    endDraw();
    state.isPinching = false;
  } else if (e.touches.length === 1) {
    // 从2指变为1指 — 结束pinch
    state.isPinching = false;
    state.isLassoPinching = false;
    // 如果套索活跃，不开始绘画
  }
  state._pinchStart = null;
}, { passive: false });

/* ── Mouse事件（PC） ── */
canvas.addEventListener('mousedown', function(e) {
  e.stopPropagation();
  var rect = canvas.getBoundingClientRect();
  var cx = e.clientX - rect.left;
  var cy = e.clientY - rect.top;
  var p = screenToCanvas(cx, cy);
  startDraw(p.x, p.y);
});
canvas.addEventListener('mousemove', function(e) {
  var rect = canvas.getBoundingClientRect();
  var cx = e.clientX - rect.left;
  var cy = e.clientY - rect.top;
  var p = screenToCanvas(cx, cy);
  moveDraw(p.x, p.y);
});
canvas.addEventListener('mouseup', function() { endDraw(); });
canvas.addEventListener('mouseleave', function() { endDraw(); });
// scroll zoom — 画板整体缩放
canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  e.stopPropagation();
  var factor = e.deltaY > 0 ? 0.9 : 1.1;
  var newScale = Math.max(0.5, Math.min(2.5, state.boardScale * factor));
  state.boardScale = newScale;
  applyBoardTransform();
}, { passive: false });

/* ── 文字输入 ── */
var textInput = document.getElementById('sb-text-input');
function showTextInput(cx, cy, canvasX, canvasY) {
  state.textX = canvasX;
  state.textY = canvasY;
  textInput.style.left = cx + 'px';
  textInput.style.top = cy + 'px';
  textInput.style.color = state.color;
  textInput.style.fontSize = '16px';
  textInput.value = '';
  textInput.classList.add('sb-show');
  setTimeout(function() { textInput.focus(); }, 50);
}
textInput.addEventListener('blur', commitText);
textInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
});
function commitText() {
  var txt = textInput.value.trim();
  textInput.classList.remove('sb-show');
  if (!txt) return;
  ctx.save();
  ctx.font = '16px "STKaiti","Kaiti SC","Noto Serif SC",serif';
  ctx.fillStyle = state.color;
  ctx.textBaseline = 'top';
  // multi-line
  var lines = txt.split('\n');
  for (var i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], state.textX, state.textY + i * 20);
  }
  ctx.restore();
  saveState();
}

/* ── 工具栏 ── */
var toolbar = document.getElementById('sb-toolbar');
var sizeFloat = document.getElementById('sb-size-float');
var sizeSlider = document.getElementById('sb-size-slider');
var sizeVal = document.getElementById('sb-size-val');
var _sizeHideTimer = null;

function showSizeFloat() {
  sizeFloat.classList.add('sb-show');
  clearTimeout(_sizeHideTimer);
  _sizeHideTimer = setTimeout(function() { sizeFloat.classList.remove('sb-show'); }, 3000);
}

toolbar.addEventListener('click', function(e) {
  var btn = e.target.closest('.sb-tool');
  if (!btn) return;
  var tool = btn.dataset.tool;
  if (tool === 'brush' || tool === 'pencil' || tool === 'spray' || tool === 'eraser' || tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'lasso') {
    state.tool = tool;
    updateToolActive();
    closePanels();
    // 切换到笔/铅/雾/擦 → 提交并清除浮动选区
    if ((tool === 'brush' || tool === 'pencil' || tool === 'spray' || tool === 'eraser') && state._lassoActive) {
      commitLasso();
    }
    // 再次点击套索按钮 → 提交旧浮动选区，开始新套索
    if (tool === 'lasso' && state._lassoActive) {
      commitLasso();
    }
    // 绘画/擦除工具自动浮现粗细调节杆
    if (tool === 'brush' || tool === 'pencil' || tool === 'spray' || tool === 'eraser') { showSizeFloat(); }
    else { sizeFloat.classList.remove('sb-show'); clearTimeout(_sizeHideTimer); }
    // 毛笔工具显示笔触类型选择
    if (tool === 'brush') { showBrushFloat(); }
    else { brushFloat.classList.remove('sb-show'); clearTimeout(_brushHideTimer); }
  } else if (tool === 'color') {
    togglePanel('color');
  } else if (tool === 'frame') {
    togglePanel('frame');
  } else if (tool === 'undo') {
    undo();
  } else if (tool === 'redo') {
    redo();
  } else if (tool === 'clear') {
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.history = [];
    state.redoStack = [];
    saveState();
  }
});

sizeSlider.addEventListener('input', function() {
  state.lineWidth = parseInt(this.value);
  sizeVal.textContent = this.value;
  showSizeFloat(); // 重置3秒计时
});

// ★ 笔触类型浮层
var brushFloat = document.getElementById('sb-brush-float');
var _brushHideTimer = null;
function showBrushFloat() {
  brushFloat.classList.add('sb-show');
  clearTimeout(_brushHideTimer);
  _brushHideTimer = setTimeout(function() { brushFloat.classList.remove('sb-show'); }, 3000);
}
brushFloat.addEventListener('click', function(e) {
  var opt = e.target.closest('.sb-brush-opt');
  if (!opt) return;
  state.brushType = opt.dataset.brush;
  // 更新active状态
  var opts = brushFloat.querySelectorAll('.sb-brush-opt');
  for (var i = 0; i < opts.length; i++) opts[i].classList.toggle('active', opts[i] === opt);
  showBrushFloat(); // 重置3秒计时
});

function updateToolActive() {
  var tools = toolbar.querySelectorAll('.sb-tool[data-tool]');
  for (var i = 0; i < tools.length; i++) {
    var t = tools[i];
    var dt = t.dataset.tool;
    if (dt === 'color' || dt === 'frame' || dt === 'undo' || dt === 'redo' || dt === 'clear') continue;
    t.classList.toggle('active', dt === state.tool);
  }
  // color tool swatch dot
  var colorBtn = toolbar.querySelector('.sb-tool[data-tool="color"]');
  if (colorBtn) {
    var isActive = (state.tool === 'brush' || state.tool === 'pencil' || state.tool === 'spray');
    colorBtn.style.background = isActive ? state.color + '33' : '';
  }
}

/* ── 面板 ── */
var colorPanel = document.getElementById('sb-color-panel');
var framePanel = document.getElementById('sb-frame-panel');

function togglePanel(name) {
  if (state.activePanel === name) { closePanels(); return; }
  closePanels();
  state.activePanel = name;
  if (name === 'color') {
    // ★ 初始化色板位置（居中于画板底部上方）
    var boardRect = document.getElementById('song-board').getBoundingClientRect();
    var panelW = 280 * (colorPanel._cpScale || 1);
    var initLeft = (boardRect.width - panelW) / 2;
    var initTop = boardRect.height - 64 - 10 - (colorPanel._cpScale || 1) * 280;
    colorPanel._cpX = colorPanel._cpX != null ? colorPanel._cpX : initLeft;
    colorPanel._cpY = colorPanel._cpY != null ? colorPanel._cpY : initTop;
    colorPanel._cpScale = colorPanel._cpScale || 1;
    applyPanelTransform();
    colorPanel.classList.add('sb-show');
  }
  else if (name === 'frame') framePanel.classList.add('sb-show');
}
function closePanels() {
  state.activePanel = null;
  colorPanel.classList.remove('sb-show');
  framePanel.classList.remove('sb-show');
}

/* ── 色彩面板渲染 ── */
function buildColorPanel() {
  var html = '';
  var groups = Object.keys(COLORS);
  for (var g = 0; g < groups.length; g++) {
    var groupName = groups[g];
    var colors = COLORS[groupName];
    html += '<div class="sb-color-group"><div class="sb-color-group-label">' + groupName + '</div><div class="sb-color-row">';
    for (var c = 0; c < colors.length; c++) {
      var col = colors[c];
      html += '<div class="sb-swatch' + (col.hex === state.color ? ' active' : '') + '" data-hex="' + col.hex + '" data-name="' + col.name + '" style="background:' + col.hex + '"><span class="sb-swatch-name">' + col.name + '</span></div>';
    }
    html += '</div></div>';
  }
  colorPanel.innerHTML = html;
}
buildColorPanel();

colorPanel.addEventListener('click', function(e) {
  var sw = e.target.closest('.sb-swatch');
  if (!sw) return;
  state.color = sw.dataset.hex;
  state.colorName = sw.dataset.name;
  // update active
  var all = colorPanel.querySelectorAll('.sb-swatch');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
  sw.classList.add('active');
  updateToolActive();
  // if eraser or shape, switch to brush
  if (state.tool === 'eraser' || state.tool === 'line' || state.tool === 'rect' || state.tool === 'circle') { state.tool = 'brush'; updateToolActive(); }
});

/* ── 色板拖拽+双指缩放 ── */
colorPanel._cpX = null;
colorPanel._cpY = null;
colorPanel._cpScale = 1;
function applyPanelTransform() {
  var s = colorPanel._cpScale || 1;
  var x = colorPanel._cpX || 0;
  var y = colorPanel._cpY || 0;
  colorPanel.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  colorPanel.style.left = '0';
  colorPanel.style.bottom = 'auto';
}
var _cpTwoFinger = null; // { ids, dist0, scale0, cx0, cy0, ox, oy }
colorPanel.addEventListener('touchstart', function(e) {
  e.stopPropagation();
  if (e.touches.length === 2) {
    var t0 = e.touches[0], t1 = e.touches[1];
    var dx = t1.clientX - t0.clientX, dy = t1.clientY - t0.clientY;
    _cpTwoFinger = {
      ids: [t0.identifier, t1.identifier],
      dist0: Math.max(1, Math.sqrt(dx*dx+dy*dy)),
      scale0: colorPanel._cpScale || 1,
      cx0: (t0.clientX + t1.clientX) / 2,
      cy0: (t0.clientY + t1.clientY) / 2,
      ox: colorPanel._cpX || 0,
      oy: colorPanel._cpY || 0
    };
  }
}, { passive: false });
colorPanel.addEventListener('touchmove', function(e) {
  e.stopPropagation();
  e.preventDefault();
  if (_cpTwoFinger && e.touches.length >= 2) {
    var t0 = null, t1 = null;
    for (var i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === _cpTwoFinger.ids[0]) t0 = e.touches[i];
      if (e.touches[i].identifier === _cpTwoFinger.ids[1]) t1 = e.touches[i];
    }
    if (t0 && t1) {
      var dx = t1.clientX - t0.clientX, dy = t1.clientY - t0.clientY;
      var dist = Math.sqrt(dx*dx+dy*dy);
      var cx = (t0.clientX + t1.clientX) / 2;
      var cy = (t0.clientY + t1.clientY) / 2;
      colorPanel._cpScale = Math.max(0.5, Math.min(2.5, _cpTwoFinger.scale0 * dist / _cpTwoFinger.dist0));
      colorPanel._cpX = _cpTwoFinger.ox + (cx - _cpTwoFinger.cx0);
      colorPanel._cpY = _cpTwoFinger.oy + (cy - _cpTwoFinger.cy0);
      applyPanelTransform();
    }
  }
}, { passive: false });
colorPanel.addEventListener('touchend', function(e) {
  e.stopPropagation();
  if (_cpTwoFinger) {
    var still = false;
    for (var i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === _cpTwoFinger.ids[0] || e.touches[i].identifier === _cpTwoFinger.ids[1]) still = true;
    }
    if (!still) _cpTwoFinger = null;
  }
});

var sizeSlider = document.getElementById('sb-size-slider');
var sizeVal = document.getElementById('sb-size-val');
sizeSlider.addEventListener('input', function() {
  state.lineWidth = parseInt(sizeSlider.value, 10);
  sizeVal.textContent = state.lineWidth;
});

/* ── 画框 ── */
var frameEl = document.getElementById('sb-frame');
framePanel.addEventListener('click', function(e) {
  var opt = e.target.closest('.sb-frame-opt');
  if (!opt) return;
  var frame = opt.dataset.frame;
  state.frame = frame;
  // update frame
  frameEl.className = 'sb-frame sb-frame-' + frame;
  // 卷轴/扇面：外白内做旧
  var canvasWrap = board.querySelector('.sb-canvas-wrap');
  var agedMat = document.getElementById('sb-aged-mat');
  if (frame === 'juanzhou') {
    canvasWrap.classList.add('sb-aged');
    agedMat.className = 'sb-aged-mat show mat-juanzhou';
  } else if (frame === 'shanmian') {
    canvasWrap.classList.add('sb-aged');
    agedMat.className = 'sb-aged-mat show mat-shanmian';
  } else {
    canvasWrap.classList.remove('sb-aged');
    agedMat.className = 'sb-aged-mat';
  }
  // update active
  var all = framePanel.querySelectorAll('.sb-frame-opt');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
  opt.classList.add('active');
});

/* ── 窗口控制 ── */
document.getElementById('sb-close').addEventListener('click', function(e) {
  e.stopPropagation();
  SongBoard.hide();
});
document.getElementById('sb-min').addEventListener('click', function(e) {
  e.stopPropagation();
  SongBoard.minimize();
});
document.getElementById('sb-max').addEventListener('click', function(e) {
  e.stopPropagation();
  SongBoard.maximize();
});

/* ── 阻止touch穿透到桌面 ── */
function _sbBlockTouch(e) { e.stopPropagation(); }
board.addEventListener("touchstart", _sbBlockTouch, { passive: false });
board.addEventListener("touchmove", _sbBlockTouch, { passive: false });
board.addEventListener("touchend", _sbBlockTouch, { passive: false });

/* ═══════════════════════════════════════════════
   复古相机模块 — 取景→拍照→拍立得→拖拽摆放
   ═══════════════════════════════════════════════ */
var _rcPhotos = [];    // 拍立得照片数组
var _rcNextZ = 100;    // 照片z-index计数器
var _rcDrag = null;    // 当前拖拽的照片
var _rcStream = null;  // 摄像头流
var _rcZoom = 1.2;     // 当前焦距倍率（默认1.2x）
var _rcZoomMin = 1.0;  // 最小焦距
var _rcZoomMax = 5.0;  // 最大焦距
var _rcPinchStart = 0; // 双指缩放起始距离

// 快门音效（AudioContext合成）
function _rcShutterSfx(){
  try{
    var ac=new(window.AudioContext||window.webkitAudioContext)();
    var len=ac.sampleRate*0.12;
    var buf=ac.createBuffer(1,len,ac.sampleRate);
    var d=buf.getChannelData(0);
    for(var i=0;i<len;i++){
      var t=i/len;
      d[i]=(Math.random()*2-1)*Math.exp(-t*18)*0.4;
      if(t<0.02) d[i]+=(Math.random()*2-1)*0.8;
    }
    var src=ac.createBufferSource();src.buffer=buf;
    var flt=ac.createBiquadFilter();flt.type='bandpass';flt.frequency.value=1800;flt.Q.value=0.8;
    src.connect(flt);flt.connect(ac.destination);src.start();
  }catch(x){}
}

// ═══ 滤镜引擎 — 集大成：glfx.js曲线+web-photo-filter色矩阵+CCD胶片色科学 ═══
var _rcFilter='original'; // 当前选中滤镜
// 滤镜预设定义：name=显示名, css=实时预览CSS, fn=Canvas处理函数名
var RC_FILTERS=[
  {id:'original', name:'本色',  desc:'自然原片', css:''},
  {id:'xuanhe',   name:'宣和',  desc:'Classic Chrome·宣和画院', css:'contrast(.92) saturate(.78) brightness(1.02) sepia(.06) hue-rotate(-4deg)'},
  {id:'ruyao',    name:'汝窑',  desc:'Velvia·雨过天青', css:'contrast(1.12) saturate(1.35) brightness(1.01)'},
  {id:'tianqing', name:'天青',  desc:'Provia·云破处', css:'contrast(1.02) saturate(.95) brightness(1.01) sepia(.02)'},
  {id:'juansu',   name:'绢素',  desc:'Astia·生绢温润', css:'contrast(.88) saturate(.82) brightness(1.06) sepia(.05)'},
  {id:'moyun',    name:'墨韵',  desc:'Acros·墨分五色', css:'grayscale(1) contrast(1.15) brightness(1.02)'},
  {id:'changjuan',name:'长卷',  desc:'Eterna·千里江山', css:'contrast(.82) saturate(.7) brightness(1.06) sepia(.08)'},
  {id:'jiujian',  name:'旧笺',  desc:'Vintage·尺素情怀', css:'sepia(.35) contrast(1.06) brightness(1.03) saturate(.82)'},
  {id:'tuizhu',   name:'褪朱',  desc:'Faded·丹青褪去', css:'contrast(.78) saturate(.55) brightness(1.1) sepia(.1)'},
  {id:'hantan',   name:'寒潭',  desc:'Cool·清冷深潭', css:'saturate(.72) brightness(1.04) hue-rotate(15deg) contrast(1.06)'},
  {id:'mushan',   name:'暮山',  desc:'Warm·暮山紫烟', css:'saturate(1.2) sepia(.1) brightness(1.02) hue-rotate(-6deg) contrast(1.08)'},
  {id:'huanguang',name:'幻光',  desc:'Technicolor·浮光幻影', css:'saturate(1.4) contrast(1.18) hue-rotate(22deg) brightness(.94)'},
  {id:'liuying',  name:'留影',  desc:'Polaroid·光影留念', css:'contrast(1.04) saturate(.76) brightness(1.04) sepia(.08)'}
];

// ══════════════════════════════════════════════════════════════
//  专业滤镜引擎 — LUT管线（集大成自Fujilab/glfx.js/web-photo-filter/CCD色科学）
//  架构：色彩矩阵 → S曲线映射 → 黑点/白点 → 颗粒 → 暗角 → 柔光
//  每个滤镜预计算3×256通道LUT，拍照时一次遍历完成
// ══════════════════════════════════════════════════════════════

// ── S曲线插值（自glfx.js spline思路简化）──
function _rcSpline(pts){
  // pts: [[x0,y0],[x1,y1],...] 归一化0~1，首尾必须为[0,0][1,1]
  var n=pts.length;
  var segs=[];
  for(var i=0;i<n-1;i++){
    var dx=pts[i+1][0]-pts[i][0], dy=pts[i+1][1]-pts[i][1];
    segs.push({x0:pts[i][0],y0:pts[i][1],dx:dx,dy:dy,k:dy/dx});
  }
  var lut=new Uint8Array(256);
  for(var i=0;i<256;i++){
    var t=i/255, v=t;
    for(var s=0;s<segs.length;s++){
      if(t>=segs[s].x0&&t<=segs[s].x0+segs[s].dx){
        var lt=(t-segs[s].x0)/segs[s].dx;
        // smoothstep缓动
        lt=lt*lt*(3-2*lt);
        v=segs[s].y0+segs[s].dy*lt;
        break;
      }
    }
    lut[i]=Math.min(255,Math.max(0,Math.round(v*255)));
  }
  return lut;
}

// ── 色彩矩阵变换（4x5，集自web-photo-filter）──
function _rcColorMatrix(d,m){
  for(var i=0;i<d.length;i+=4){
    var r=d[i],g=d[i+1],b=d[i+2];
    d[i]  =Math.min(255,Math.max(0,r*m[0]+g*m[1]+b*m[2]+m[3]*255+m[4]*255));
    d[i+1]=Math.min(255,Math.max(0,r*m[5]+g*m[6]+b*m[7]+m[8]*255+m[9]*255));
    d[i+2]=Math.min(255,Math.max(0,r*m[10]+g*m[11]+b*m[12]+m[13]*255+m[14]*255));
  }
}

// ── 通道LUT映射 ──
function _rcMapChannels(d,rL,gL,bL){
  for(var i=0;i<d.length;i+=4){
    d[i]=rL[d[i]]; d[i+1]=gL[d[i+1]]; d[i+2]=bL[d[i+2]];
  }
}

// ── 胶片颗粒（曝光相关：暗部粗颗粒+亮部细颗粒，自Fujilab GLSL grain算法）──
function _rcGrain(d,amount,seed){
  var s=seed||42;
  function prng(){s=(s*16807)%2147483647;return(s-1)/2147483646;}
  for(var i=0;i<d.length;i+=4){
    var lum=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)/255;
    var w=0.4+0.9*(1-lum); // 暗部颗粒权重更大
    var noise=(prng()-0.5)*amount*w;
    d[i]=Math.min(255,Math.max(0,d[i]+noise));
    d[i+1]=Math.min(255,Math.max(0,d[i+1]+noise));
    d[i+2]=Math.min(255,Math.max(0,d[i+2]+noise));
  }
}

// ── 暗角（径向渐变暗化）──
function _rcVignette(cvs,amount){
  var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
  var grd=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.28,w/2,h/2,Math.max(w,h)*0.72);
  grd.addColorStop(0,'rgba(0,0,0,0)');
  grd.addColorStop(1,'rgba(0,0,0,'+amount+')');
  ctx.fillStyle=grd; ctx.fillRect(0,0,w,h);
}

// ── 柔光bloom（模拟CCD/胶片高光溢出）──
function _rcBloom(cvs,amount){
  var ctx=cvs.getContext('2d');
  ctx.globalCompositeOperation='screen';
  ctx.filter='blur(6px) brightness('+amount+')';
  ctx.globalAlpha=0.15;
  ctx.drawImage(cvs,0,0);
  ctx.globalAlpha=1; ctx.filter='none';
  ctx.globalCompositeOperation='source-over';
}

// ── 黑点提拉+白点压缩（胶片fade效果，自Fujilab fade算法）──
function _rcFade(d,blackPt,whitePt){
  var range=whitePt-blackPt;
  var inv=1/Math.max(0.01,range);
  for(var i=0;i<d.length;i+=4){
    d[i]=Math.min(255,Math.max(0,((d[i]/255-blackPt)*inv)*255));
    d[i+1]=Math.min(255,Math.max(0,((d[i+1]/255-blackPt)*inv)*255));
    d[i+2]=Math.min(255,Math.max(0,((d[i+2]/255-blackPt)*inv)*255));
  }
}

// ── 高光滑落（自Fujilab highlight rolloff算法）──
function _rcHighlightRolloff(d,amount){
  if(amount<=0)return;
  for(var i=0;i<d.length;i+=4){
    var lum=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)/255;
    if(lum>0.7){
      var excess=lum-0.7;
      var soft=0.3*amount;
      var compressed=0.7+soft*(1-Math.exp(-excess/soft));
      var ratio=compressed/lum;
      d[i]=Math.min(255,Math.round(d[i]*ratio));
      d[i+1]=Math.min(255,Math.round(d[i+1]*ratio));
      d[i+2]=Math.min(255,Math.round(d[i+2]*ratio));
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  12个宋式滤镜实现
//  命名体系：宋式美学雅称替代日式/西式名称
//  每个滤镜基于Fujifilm胶片模拟+专业色科学
// ══════════════════════════════════════════════════════════════

var _rcFilterFns={
  // ── 宣和：Fujifilm Classic Chrome ──
  // 暗部暖调+高光冷调+低饱和+高对比，如宣和画院克制用色
  xuanhe:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // Classic Chrome色矩阵：降饱和+暖阴影+冷高光
    _rcColorMatrix(d,[1.05,0.08,-0.04,0,-0.01, 0.02,0.88,0.06,0,0.01, -0.06,-0.04,0.92,0,0.06]);
    // S曲线：暗部微提(暖感)+高光柔和压低
    var rL=_rcSpline([[0,0],[.08,.06],[.35,.32],[.65,.68],[.92,.96],[1,1]]);
    var gL=_rcSpline([[0,0],[.08,.05],[.35,.31],[.65,.67],[.92,.95],[1,1]]);
    var bL=_rcSpline([[0,0],[.08,.04],[.35,.29],[.65,.65],[.92,.94],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcHighlightRolloff(d,0.35);
    _rcGrain(d,22,137);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.32);
  },

  // ── 汝窑：Fujifilm Velvia ──
  // 高饱和+高对比+深色如汝窑天青釉，风景神器
  ruyao:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // Velvia：大幅提饱和+微暖
    _rcColorMatrix(d,[1.18,0.02,-0.04,0,0.02, -0.02,1.14,0.02,0,-0.01, -0.04,-0.02,1.12,0,0.01]);
    // 强S曲线：深黑+亮白
    var rL=_rcSpline([[0,0],[.1,.04],[.3,.22],[.7,.78],[.9,.96],[1,1]]);
    var gL=_rcSpline([[0,0],[.1,.05],[.3,.24],[.7,.76],[.9,.95],[1,1]]);
    var bL=_rcSpline([[0,0],[.1,.06],[.3,.26],[.7,.74],[.9,.94],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,16,256);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.28);
  },

  // ── 天青：Fujifilm Provia ──
  // 自然均衡，如"雨过天青云破处"的温润
  tianqing:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // Provia：微暖+微提饱和
    _rcColorMatrix(d,[1.04,0.02,0,0,0.01, 0,1.02,0.02,0,0, -0.01,-0.01,1.02,0,0.01]);
    // 轻微S曲线
    var L=_rcSpline([[0,0],[.15,.1],[.5,.48],[.85,.92],[1,1]]);
    _rcMapChannels(d,L,L,L);
    _rcGrain(d,14,512);
    ctx.putImageData(imgData,0,0);
  },

  // ── 绢素：Fujifilm Astia ──
  // 柔和低对比+温暖肤色，如生绢的温润质感
  juansu:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // Astia：降饱和+暖偏+提黑点
    _rcColorMatrix(d,[1.02,0.04,0,0,0.02, 0.02,0.94,0.04,0,0.02, 0,0.02,0.9,0,0.03]);
    _rcFade(d,0.04,0.98);
    // 柔和曲线
    var rL=_rcSpline([[0,0],[.2,.16],[.5,.48],[.8,.84],[1,1]]);
    var gL=_rcSpline([[0,0],[.2,.15],[.5,.47],[.8,.83],[1,1]]);
    var bL=_rcSpline([[0,0],[.2,.13],[.5,.45],[.8,.81],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcHighlightRolloff(d,0.45);
    _rcGrain(d,12,789);
    ctx.putImageData(imgData,0,0);
    _rcBloom(cvs,1.2);
    _rcVignette(cvs,0.18);
  },

  // ── 墨韵：Fujifilm Acros ──
  // 丰富黑白+颗粒质感，"墨分五色"
  moyun:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // Acros风格黑白：红通道偏轻（肤色明亮）、绿通道权重高
    for(var i=0;i<d.length;i+=4){
      var r=d[i],g=d[i+1],b=d[i+2];
      // Acros用不同通道权重模拟滤色镜
      var lum=r*0.25+g*0.60+b*0.15;
      var v=lum/255;
      // 高对比S曲线
      v=v<0.5?2*v*v:1-2*(1-v)*(1-v);
      var g2=Math.round(v*255);
      d[i]=g2; d[i+1]=g2; d[i+2]=g2;
    }
    // 微暖调（硒调色）
    _rcColorMatrix(d,[1.02,0,0,0,0.01, 0,1.0,0,0,0, 0,0,0.96,0,0.01]);
    _rcGrain(d,26,333);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.30);
  },

  // ── 长卷：Fujifilm Eterna ──
  // 电影感+低对比+褪色，如千年长卷的素雅
  changjuan:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // Eterna：降对比+降饱和+微暖偏移
    _rcColorMatrix(d,[0.96,0.06,0.02,0,0.02, 0.02,0.88,0.04,0,0.02, 0,0.02,0.82,0,0.04]);
    // 提黑点+压白点（电影fade）
    _rcFade(d,0.06,0.95);
    // 平缓曲线
    var L=_rcSpline([[0,0],[.15,.12],[.5,.48],[.85,.88],[1,1]]);
    _rcMapChannels(d,L,L,L);
    _rcHighlightRolloff(d,0.5);
    _rcGrain(d,20,1024);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.22);
  },

  // ── 旧笺：Kodak Vintage ──
  // 温暖怀旧+暗部提亮，如旧日书信的纸色
  jiujian:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // VINTAGE色矩阵（集自web-photo-filter）
    _rcColorMatrix(d,[0.63,0.32,-0.04,0,0.04, 0.03,0.64,0.03,0,0.03, 0.05,-0.08,0.52,0,0.02]);
    // 暗部提亮+温暖曲线
    var rL=_rcSpline([[0,0],[.1,.08],[.35,.32],[.65,.68],[.9,.94],[1,1]]);
    var gL=_rcSpline([[0,0],[.1,.06],[.35,.30],[.65,.66],[.9,.92],[1,1]]);
    var bL=_rcSpline([[0,0],[.1,.04],[.35,.27],[.65,.62],[.9,.89],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,30,512);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.38);
  },

  // ── 褪朱：Faded Vermillion ──
  // 大幅褪色+丹砂残韵，如古画褪去朱色
  tuizhu:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // 褪朱：强降饱和+红通道保留+暖底
    _rcColorMatrix(d,[0.82,0.08,0.04,0,0.04, 0.06,0.76,0.08,0,0.03, 0.04,0.08,0.72,0,0.05]);
    _rcFade(d,0.08,0.94);
    var rL=_rcSpline([[0,0],[.2,.15],[.5,.48],[.8,.84],[1,1]]);
    var gL=_rcSpline([[0,0],[.2,.13],[.5,.44],[.8,.80],[1,1]]);
    var bL=_rcSpline([[0,0],[.2,.11],[.5,.40],[.8,.76],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,18,2048);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.20);
  },

  // ── 寒潭：Cool Tone ──
  // 深蓝冷调+暗部偏青，如寒潭映月
  hantan:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // 冷调：蓝提+红压+微青
    _rcColorMatrix(d,[0.82,0.04,0.06,0,-0.02, 0.02,0.92,0.06,0,-0.01, 0.06,0.1,1.1,0,0.02]);
    var rL=_rcSpline([[0,0],[.15,.08],[.4,.32],[.7,.72],[.9,.94],[1,1]]);
    var bL=_rcSpline([[0,0],[.1,.06],[.35,.30],[.65,.70],[.9,.96],[1,1]]);
    _rcMapChannels(d,rL,rL,bL);
    _rcGrain(d,16,333);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.30);
  },

  // ── 暮山：Warm Cinematic ──
  // 暖金色调+高光红移，如暮山紫烟
  mushan:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // 日落暖调矩阵
    _rcColorMatrix(d,[1.18,0.06,-0.04,0,0.03, -0.02,1.02,0.02,0,0.01, -0.1,-0.06,0.86,0,0.06]);
    var rL=_rcSpline([[0,0],[.08,.05],[.35,.3],[.65,.7],[.92,.97],[1,1]]);
    var gL=_rcSpline([[0,0],[.1,.06],[.35,.3],[.65,.68],[.92,.95],[1,1]]);
    var bL=_rcSpline([[0,0],[.12,.04],[.35,.24],[.65,.6],[.92,.9],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,20,777);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.35);
    _rcBloom(cvs,1.25);
  },

  // ── 幻光：Technicolor ──
  // 强对比+色相偏移，如浮光幻影
  huanguang:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // TECHNICOLOR色矩阵（集自web-photo-filter）+青品偏移
    _rcColorMatrix(d,[1.12,-0.18,-0.02,0,0.02, -0.04,1.1,-0.04,0,-0.01, -0.02,-0.1,1.22,0,0.02]);
    var rL=_rcSpline([[0,0],[.08,.02],[.3,.18],[.7,.82],[.92,.98],[1,1]]);
    var gL=_rcSpline([[0,0],[.1,.04],[.3,.2],[.7,.8],[.92,.96],[1,1]]);
    var bL=_rcSpline([[0,0],[.06,.02],[.3,.16],[.7,.78],[.92,.97],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,24,666);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.35);
  },

  // ── 留影：Polaroid ──
  // 提黑点+微褪色+颗粒，如光影留念
  liuying:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // POLAROID色矩阵（集自web-photo-filter）
    _rcColorMatrix(d,[1.44,-0.06,-0.06,0,0.01, -0.12,1.38,-0.12,0,0.01, -0.02,-0.02,1.48,0,0.01]);
    _rcFade(d,0.04,0.97);
    var L=_rcSpline([[0,0],[.15,.12],[.5,.48],[.85,.88],[1,1]]);
    _rcMapChannels(d,L,L,L);
    _rcGrain(d,25,4096);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.28);
  }
};

// 统一滤镜入口
function _rcApplyFilter(cvs,filterId){
  var fn=_rcFilterFns[filterId];
  if(fn) fn(cvs);
}

// 生成拍立得DOM（独立于画板，fixed定位覆盖在页面上）
  function _rcUpdateCornerDot(){
    var dot=document.getElementById('rc-corner-dot');
    if(!dot)return;
    var hasCorner=_rcPhotos.some(function(p){return p.corner;});
    dot.style.display=hasCorner?'inline-block':'none';
  }
function _rcCreatePolaroid(dataUrl){
  var pw=120,ph=148;
  var vw=window.innerWidth, vh=window.innerHeight;
  var el=document.createElement('div');
  el.className='sb-photo';
  el.style.position='fixed';
  el.style.left=(vw/2-pw/2+(Math.random()*60-30))+'px';
  el.style.top=(vh/2-ph/2+(Math.random()*60-30))+'px';
  el.style.width=pw+'px';
  el.style.height=ph+'px';
  el.style.zIndex=++_rcNextZ;
  el.style.transform='rotate('+((Math.random()*6-3).toFixed(1))+'deg)';
  var img=document.createElement('img');
  img.src=dataUrl;
  img.draggable=false;
  var now=new Date();
  var dateStr=now.getFullYear()+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+String(now.getDate()).padStart(2,'0');
  var cap=document.createElement('div');
  cap.className='sb-photo-cap';
  cap.textContent=dateStr;
  // ★ 删除按钮（用touchend，因为照片touchstart会preventDefault导致click无法触发）
  var del=document.createElement('div');
  del.className='sb-photo-del';
  del.textContent='✕';
  del.addEventListener('touchend',function(e){
    e.stopPropagation(); e.preventDefault();
    el.style.transition='transform .25s,opacity .25s';
    el.style.transform+=' scale(0.3)';
    el.style.opacity='0';
    setTimeout(function(){
      el.remove();
      var idx=_rcPhotos.findIndex(function(p){return p.el===el;});
      if(idx>=0)_rcPhotos.splice(idx,1);
    },260);
  });
  // 桌面端click兜底
  del.addEventListener('click',function(e){
    e.stopPropagation();
    el.style.transition='transform .25s,opacity .25s';
    el.style.transform+=' scale(0.3)';
    el.style.opacity='0';
    setTimeout(function(){
      el.remove();
      var idx=_rcPhotos.findIndex(function(p){return p.el===el;});
      if(idx>=0)_rcPhotos.splice(idx,1);
    },260);
  });
  el.appendChild(img);
  el.appendChild(cap);
  el.appendChild(del);
  document.body.appendChild(el);
  // 弹出动画
  el.style.transition='transform .3s cubic-bezier(.34,1.56,.64,1),opacity .2s';
  el.style.opacity='0';
  requestAnimationFrame(function(){
    el.style.opacity='1';
  });
  var pobj={el:el,x:parseInt(el.style.left),y:parseInt(el.style.top),w:pw,h:ph,corner:null,savedLeft:null,savedTop:null,savedTransform:''};
  _rcPhotos.push(pobj);
  // ★ 双击：飞入四角隐藏 / 再次双击呼出
  function _toggleCorner(){
    var W=window.innerWidth, H=window.innerHeight;
    if(!pobj.corner){
      // ★ 隐藏：缩到最近角落（Mac 四指推边效果）
      var cx=pobj.x+pobj.w/2, cy=pobj.y+pobj.h/2;
      var peek=16;
      var corners=[
        {name:'tl',dist:cx+cy,       lx:peek-pobj.w, ly:peek-pobj.h, rot:-6},
        {name:'tr',dist:(W-cx)+cy,   lx:W-peek,      ly:peek-pobj.h, rot:6},
        {name:'bl',dist:cx+(H-cy),   lx:peek-pobj.w, ly:H-peek,      rot:6},
        {name:'br',dist:(W-cx)+(H-cy),lx:W-peek,     ly:H-peek,      rot:-6}
      ];
      corners.sort(function(a,b){return a.dist-b.dist;});
      var c=corners[0];
      pobj.corner=c.name;
      pobj.savedLeft=el.style.left;
      pobj.savedTop=el.style.top;
      pobj.savedTransform=el.style.transform||'';
      el.style.transition='transform .4s cubic-bezier(.4,0,.2,1),left .35s cubic-bezier(.4,0,.2,1),top .35s cubic-bezier(.4,0,.2,1)';
      el.style.left=c.lx+'px';
      el.style.top=c.ly+'px';
      el.style.transform='scale(.35) rotate('+c.rot+'deg)';
      el.style.transformOrigin='center center';
      el.style.zIndex='49999';
      del.classList.remove('sb-del-show');
      del.style.display='none';
      cap.style.display='none';
      el.setAttribute('data-corner',c.name);
      _rcUpdateCornerDot();
    }else{
      // ★ 呼出：弹回原位
      el.style.transition='transform .4s cubic-bezier(.34,1.56,.64,1),left .35s cubic-bezier(.4,0,.2,1),top .35s cubic-bezier(.4,0,.2,1)';
      el.style.left=pobj.savedLeft;
      el.style.top=pobj.savedTop;
      el.style.transform=pobj.savedTransform||'none';
      el.style.zIndex='50001';
      del.classList.remove('sb-del-show');
      del.style.display='';
      cap.style.display='';
      el.removeAttribute('data-corner');
      pobj.x=parseInt(pobj.savedLeft)||pobj.x;
      pobj.y=parseInt(pobj.savedTop)||pobj.y;
      delete pobj.corner;
      _rcUpdateCornerDot();
      delete pobj.savedLeft;
      delete pobj.savedTop;
      delete pobj.savedTransform;
    }
  }
  var _tapTimer=0,_tapX=0,_tapY=0;
  function _handleTap(e){
    if(e.target.closest('.sb-photo-del'))return;
    var now=Date.now();
    var t=e.changedTouches?e.changedTouches[0]:null;
    // ★ 仅在有待确认的第一击时校验移动距离；超限则把当前击当新一轮首击
    if(_tapTimer&&t){
      var dx=Math.abs(t.clientX-_tapX),dy=Math.abs(t.clientY-_tapY);
      if(dx>20||dy>20){_tapTimer=now;_tapX=t.clientX;_tapY=t.clientY;return;}
    }
    if(_tapTimer&&now-_tapTimer<380){
      e.stopPropagation();e.preventDefault();
      _toggleCorner();
      _tapTimer=0;
    }else{
      _tapTimer=now;
    }
    if(t){_tapX=t.clientX;_tapY=t.clientY;}
  }
  el.addEventListener('touchend',_handleTap);
  el.addEventListener('touchcancel',function(){_tapTimer=0;});
  el.addEventListener('dblclick',function(e){
    e.stopPropagation();e.preventDefault();_toggleCorner();
  });
  el._toggleCornerFn=_toggleCorner; // expose for desktop double-tap
  // ★ 单击浮现删除按钮1.8秒后消失
  var _delTimer=0;
  el.addEventListener('touchstart',function(e){
    if(e.target.closest('.sb-photo-del'))return;
    if(pobj.corner)return;
    del.classList.add('sb-del-show');
    clearTimeout(_delTimer);
    _delTimer=setTimeout(function(){del.classList.remove('sb-del-show');},1800);
  },{passive:true});
  el.addEventListener('click',function(e){
    if(e.target.closest('.sb-photo-del'))return;
    if(pobj.corner)return;
    del.classList.add('sb-del-show');
    clearTimeout(_delTimer);
    _delTimer=setTimeout(function(){del.classList.remove('sb-del-show');},1800);
  });

  el.addEventListener('touchstart',function(e){
    // ★ 点到删除按钮时不启动拖拽，让删除按钮自己处理
    if(e.target.closest('.sb-photo-del'))return;
    // ★ 隐藏在角落的照片不允许拖拽，只响应双击呼出
    if(pobj.corner){e.stopPropagation();e.preventDefault();return;}
    e.stopPropagation(); e.preventDefault();
    var t=e.touches[0];
    _rcDrag={pobj:pobj,sx:t.clientX,sy:t.clientY,ox:pobj.x,oy:pobj.y};
    el.style.zIndex=++_rcNextZ;
    el.style.transition='none';
  },{passive:false});
}

// 拍照
function _rcTakePhoto(){
  var video=document.getElementById('rc-video');
  var flash=document.getElementById('rc-flash');
  if(!video||!video.videoWidth||!video.videoHeight)return;
  flash.classList.add('rc-flash-on');
  setTimeout(function(){ flash.classList.remove('rc-flash-on'); },180);
  _rcShutterSfx();
  var vW=video.videoWidth, vH=video.videoHeight;
  var zoom=Math.max(1,_rcZoom||1.2);
  // align with viewfinder: object-fit:cover + scale(zoom)
  var srcSide=Math.min(vW,vH)/zoom;
  var sx=(vW-srcSide)/2;
  var sy=(vH-srcSide)/2;
  var cvs=document.createElement('canvas');
  cvs.width=400;cvs.height=400;
  var ctx=cvs.getContext('2d');
  if(!_rcRear){ctx.translate(cvs.width,0);ctx.scale(-1,1);}
  ctx.drawImage(video,sx,sy,srcSide,srcSide,0,0,400,400);
  _rcApplyFilter(cvs,_rcFilter);
  _rcApplyFilm(cvs,_rcFilm);
  var dataUrl=cvs.toDataURL('image/jpeg',0.88);
  _rcCloseViewfinder();
  setTimeout(function(){ _rcCreatePolaroid(dataUrl); },350);
}

// 点击对焦动画 + 硬件对焦
function _rcFocusPoint(px,py){
  // 对焦动画：黄色方框
  var vp=document.getElementById('rc-viewport');
  if(!vp)return;
  var ring=document.createElement('div');
  ring.className='rc-vf-focus rc-focus-on';
  ring.style.left=(px*100)+'%';
  ring.style.top=(py*100)+'%';
  vp.appendChild(ring);
  setTimeout(function(){ring.classList.remove('rc-focus-on');},600);
  setTimeout(function(){if(ring.parentNode)ring.parentNode.removeChild(ring);},900);
  // 硬件对焦（如果支持）
  try{
    if(_rcStream){
      var track=_rcStream.getVideoTracks()[0];
      if(track&&track.getCapabilities){
        var cap=track.getCapabilities();
        if(cap.focusMode){
          track.applyConstraints({advanced:[{focusMode:'continuous',pointsOfInterest:[{x:px,y:py}]}]}).catch(function(){});
        }
      }
    }
  }catch(x){}
}

// 取景框布局 — 1:1方形匹配拍立得相纸
var _rcVF={t:0,l:0,s:0}; // 记忆取景窗位置
function _rcLayoutViewfinder(){
  var vf=document.getElementById('rc-viewfinder');
  if(!vf||vf.style.display==='none')return;
  var W=vf.clientWidth, H=vf.clientHeight;
  // 取景窗：1:1方形，宽度=min(W*0.84, H*0.50)，垂直居中（留出下方控制区）
  var side=Math.min(Math.round(W*0.84), Math.round(H*0.50));
  var left=Math.round((W-side)/2);
  // 下方控制区高度：变焦条28+滤镜条56+胶片条56+快门80≈220px
  var ctrlH=220;
  var top=Math.round(Math.max(10,(H-ctrlH-side)/2));
  _rcVF={t:top,l:left,s:side};
  // 定位取景视口
  var vp=document.getElementById('rc-viewport');
  if(vp){vp.style.top=top+'px';vp.style.left=left+'px';vp.style.width=side+'px';vp.style.height=side+'px';}
  // 四块遮罩
  var mt=document.getElementById('rc-mask-top');
  var mb=document.getElementById('rc-mask-bottom');
  var ml=document.getElementById('rc-mask-left');
  var mr=document.getElementById('rc-mask-right');
  if(mt){mt.style.height=top+'px';}
  if(mb){var bt=H-top-side; mb.style.height=Math.max(0,bt)+'px';}
  if(ml){ml.style.top=top+'px';ml.style.height=side+'px';ml.style.width=left+'px';}
  if(mr){mr.style.top=top+'px';mr.style.height=side+'px';mr.style.width=Math.max(0,W-left-side)+'px';}
  // 右上角按钮组 — 取景窗右上角外侧
  var tr=document.getElementById('rc-topright');
  if(tr){tr.style.top=Math.max(4,top-46)+'px';tr.style.right=Math.max(4,W-left-side-2)+'px';}
  // 变焦拖杆 — 取景窗正下方
  var zBar=document.getElementById('rc-zoom-bar');
  if(zBar){zBar.style.top=(top+side+8)+'px';zBar.style.left=left+'px';zBar.style.width=side+'px';}
  // 滤镜条 — 变焦拖杆下方
  var fs=document.getElementById('rc-filter-strip');
  if(fs){fs.style.top=(top+side+40)+'px';fs.style.left=left+'px';fs.style.width=side+'px';}
  // 胶片模拟条 — 滤镜条下方
  var fm=document.getElementById('rc-film-strip');
  if(fm){fm.style.top=(top+side+96)+'px';fm.style.left=left+'px';fm.style.width=side+'px';}
  // 底部快门
  var bt2=document.getElementById('rc-btn-shutter');
  // 快门位置不变，用bottom定位
  _rcUpdateZoomThumb();
}

// 变焦拖杆交互
var _rcZoomMin=1.0, _rcZoomMax=5.0;
var _rcZoomDragging=false;
function _rcZoomFromPos(clientX){
  var track=document.getElementById('rc-zoom-track');
  if(!track)return _rcZoom;
  var rect=track.getBoundingClientRect();
  var ratio=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
  return _rcZoomMin+ratio*(_rcZoomMax-_rcZoomMin);
}
function _rcUpdateZoomThumb(){
  var fill=document.getElementById('rc-zoom-fill');
  var thumb=document.getElementById('rc-zoom-thumb');
  var label=document.getElementById('rc-zoom-val');
  var ratio=(_rcZoom-_rcZoomMin)/(_rcZoomMax-_rcZoomMin);
  var pct=(ratio*100).toFixed(1)+'%';
  if(fill){fill.style.width=pct;}
  if(thumb){thumb.style.left=pct;}
  if(label){label.textContent=_rcZoom.toFixed(1)+'×';}
}
function _rcInitZoomBar(){
  var thumb=document.getElementById('rc-zoom-thumb');
  var track=document.getElementById('rc-zoom-track');
  if(!thumb||!track)return;
  // 拖拽滑块
  thumb.addEventListener('touchstart',function(e){
    e.stopPropagation(); e.preventDefault();
    _rcZoomDragging=true;
  },{passive:false});
  // 点击轨道跳转
  track.addEventListener('touchstart',function(e){
    e.stopPropagation(); e.preventDefault();
    _rcZoom=_rcZoomFromPos(e.touches[0].clientX);
    _rcUpdateZoom(); _rcUpdateZoomThumb();
    _rcZoomDragging=true;
  },{passive:false});
  track.addEventListener('click',function(e){
    e.stopPropagation();
    _rcZoom=_rcZoomFromPos(e.clientX);
    _rcUpdateZoom(); _rcUpdateZoomThumb();
  });
  // document级拖动
  document.addEventListener('touchmove',function(e){
    if(!_rcZoomDragging)return;
    e.stopPropagation(); e.preventDefault();
    _rcZoom=_rcZoomFromPos(e.touches[0].clientX);
    _rcUpdateZoom(); _rcUpdateZoomThumb();
  },{passive:false});
  document.addEventListener('touchend',function(){
    _rcZoomDragging=false;
  });
  // 任何非滑块的touchstart都重置拖拽态（防止滑动LUT串扰）
  document.addEventListener('touchstart',function(e){
    if(!e.target.closest('#rc-zoom-thumb')&&!e.target.closest('#rc-zoom-track')){
      _rcZoomDragging=false;
    }
  },{passive:true});
  // 鼠标兜底
  thumb.addEventListener('mousedown',function(e){
    e.stopPropagation(); e.preventDefault();
    _rcZoomDragging=true;
  });
  document.addEventListener('mousemove',function(e){
    if(!_rcZoomDragging)return;
    _rcZoom=_rcZoomFromPos(e.clientX);
    _rcUpdateZoom(); _rcUpdateZoomThumb();
  });
  document.addEventListener('mouseup',function(){
    _rcZoomDragging=false;
  });
}

// 打开取景器
var _rcRear=true; // 默认后置摄像头
var _rcZoom=1.2; // 默认1.2x焦距
var _rcBaseFit=1; // video object-fit:cover基础缩放比
function _rcOpenViewfinder(){
  var vf=document.getElementById('rc-viewfinder');
  if(!vf)return;
  vf.style.display='flex';
  _rcLayoutViewfinder();
  // 首次初始化变焦拖杆
  if(!window.__rcZoomBarInit){_rcInitZoomBar();window.__rcZoomBarInit=true;}
  // 重置滤镜选择
  _rcFilter='original';
  _rcFilm='ccd';
  _rcZoom=1.2; // 重置焦距
  _rcUpdateZoom(); _rcUpdateZoomThumb();
  var vfVid=document.getElementById('rc-video');
  if(vfVid) vfVid.style.filter='';
  var bar=document.getElementById('rc-filter-strip');
  if(bar) bar.querySelectorAll('.rc-filter-item').forEach(function(el){
    el.classList.toggle('rc-filter-active',el.getAttribute('data-fid')==='original');
  });
  var fmBar=document.getElementById('rc-film-strip');
  if(fmBar) fmBar.querySelectorAll('.rc-film-item').forEach(function(el){
    el.classList.toggle('rc-film-active',el.getAttribute('data-fid')==='ccd');
  });
  _rcStartCamera();
}
// resize重排取景框
window.addEventListener('resize',function(){setTimeout(_rcLayoutViewfinder,50);});
window.addEventListener('orientationchange',function(){setTimeout(_rcLayoutViewfinder,100);});
function _rcUpdateZoom(){
  var v=document.getElementById('rc-video');
  if(v)v.style.transform='scale('+(_rcZoom/_rcBaseFit)+')'+(_rcRear?'':' scaleX(-1)');
  var d=document.getElementById('rc-zoom-val');
  if(d)d.textContent=_rcZoom.toFixed(1)+'×';
  _rcUpdateZoomThumb();
}
function _rcStartCamera(){
  var video=document.getElementById('rc-video');
  if(_rcStream){_rcStream.getTracks().forEach(function(t){t.stop();});_rcStream=null;}
  if(video)video.srcObject=null;
  if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia){
    navigator.mediaDevices.getUserMedia({video:{facingMode:_rcRear?'environment':'user',width:{ideal:1280},height:{ideal:720}},audio:false}).then(function(stream){
      _rcStream=stream;
      if(video){video.srcObject=stream;video.play().catch(function(){});}
      _rcUpdateZoom();
    }).catch(function(err){
      console.warn('[RetroCamera] 摄像头不可用:',err);
      _rcCloseViewfinder();
    });
  }
}

// 关闭取景器
function _rcCloseViewfinder(){
  _rcZoomDragging=false;
  var vf=document.getElementById('rc-viewfinder');
  if(vf)vf.style.display='none';
  var video=document.getElementById('rc-video');
  if(video)video.srcObject=null;
  if(_rcStream){
    _rcStream.getTracks().forEach(function(t){t.stop();});
    _rcStream=null;
  }
  _rcZoom=1.2;_rcUpdateZoom();
}

// 相机按钮
var rcBtn=document.getElementById('di-btn-camera');
if(rcBtn) rcBtn.addEventListener('click',function(){ _rcOpenViewfinder(); });

// 取景器按钮
var rcShutter=document.getElementById('rc-btn-shutter');
if(rcShutter) rcShutter.addEventListener('click',function(){ _rcTakePhoto(); });
// 相册上传按钮
var rcUpload=document.getElementById('rc-btn-upload');
var rcFileInput=document.getElementById('rc-file-input');
if(rcUpload&&rcFileInput){
  rcUpload.addEventListener('click',function(){ rcFileInput.click(); });
  rcFileInput.addEventListener('change',function(e){
    var file=e.target.files&&e.target.files[0];
    if(!file)return;
    rcFileInput.value='';
    var reader=new FileReader();
    reader.onload=function(ev){
      var img=new Image();
      img.onload=function(){
        // 1:1 中心裁剪 + 当前滤镜 + 生成拍立得
        var side=Math.min(img.width,img.height);
        var sx=(img.width-side)/2, sy=(img.height-side)/2;
        var cvs=document.createElement('canvas');
        cvs.width=400; cvs.height=400;
        var ctx=cvs.getContext('2d');
        ctx.drawImage(img,sx,sy,side,side,0,0,400,400);
        _rcApplyFilter(cvs,_rcFilter);
        _rcApplyFilm(cvs,_rcFilm);
        var dataUrl=cvs.toDataURL('image/jpeg',0.88);
        _rcCloseViewfinder();
        setTimeout(function(){ _rcCreatePolaroid(dataUrl); },350);
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
var rcClose=document.getElementById('rc-btn-close');
if(rcClose) rcClose.addEventListener('click',function(){ _rcCloseViewfinder(); });
var rcFlip=document.getElementById('rc-btn-switch');
if(rcFlip) rcFlip.addEventListener('click',function(){
  _rcRear=!_rcRear;
  _rcStartCamera();
});

// 滤镜选择条初始化
(function(){
  var bar=document.getElementById('rc-filter-strip');
  if(!bar)return;
  RC_FILTERS.forEach(function(f){
    var item=document.createElement('div');
    item.className='rc-filter-item'+(f.id==='original'?' rc-filter-active':'');
    item.setAttribute('data-fid',f.id);
    // 缩略图 — 热带海景+椰树剪影
    var thumb=document.createElement('div');
    thumb.className='rc-filter-thumb';
    if(f.css) thumb.style.filter=f.css;
    // 椰树剪影SVG
    thumb.innerHTML='<svg viewBox="0 0 40 40" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" preserveAspectRatio="xMidYMid slice"><path d="M22 38Q22 30 22 24Q18 18 13 16Q17 17 21 20Q19 14 14 10Q19 13 21.5 17Q21 11 20 6Q22 10 22.5 16Q25 12 28 8Q25 13 23 18Q27 16 30 14Q27 17 23 20Q23 26 23 38Z" fill="rgba(0,0,0,.35)" stroke="none"/></svg>';
    item.appendChild(thumb);
    // 滤镜名称
    var label=document.createElement('span');
    label.className='rc-filter-label';
    label.textContent=f.name;
    item.appendChild(label);
    item.addEventListener('click',function(){
      _rcFilter=f.id;
      // 更新选中态
      bar.querySelectorAll('.rc-filter-item').forEach(function(el){el.classList.remove('rc-filter-active');});
      item.classList.add('rc-filter-active');
      // 实时预览：合并LUT+胶片CSS应用到video
      var vf=document.getElementById('rc-video');
      if(vf){
        var filmCss='';
        var filmItem=document.querySelector('.rc-film-item.rc-film-active');
        if(filmItem){var fid2=filmItem.getAttribute('data-fid');var ff=RC_FILMS.find(function(x){return x.id===fid2;});if(ff)filmCss=ff.css;}
        vf.style.filter=(f.css+' '+filmCss).trim();
      }
    });
    bar.appendChild(item);
  });
})();

// ══════════════════════════════════════════════════════════════
//  胶片模拟条 — Fujifilm命名体系
//  叠加在LUT滤镜之上，模拟真实胶片颗粒/光晕/色偏/暗角
// ══════════════════════════════════════════════════════════════
var _rcFilm='ccd'; // 当前胶片模拟
var RC_FILMS=[
  {id:'ccd',      name:'CCD',    desc:'旧数码·低保真', css:'contrast(1.1) saturate(1.18) brightness(.97) sepia(.04) hue-rotate(-2deg)'},
  {id:'holga',    name:'Holga',  desc:'玩具相机·漏光', css:'saturate(1.5) contrast(1.08) brightness(.94) sepia(.08) hue-rotate(-5deg)'},
  {id:'instax',   name:'Instax', desc:'即影即有·柔光', css:'contrast(.88) saturate(.82) brightness(1.08) sepia(.05) hue-rotate(5deg)'},
  {id:'natura',   name:'Natura', desc:'高感金调·暖夜', css:'sepia(.1) brightness(1.04) contrast(1.02) saturate(.9) hue-rotate(-6deg)'},
  {id:'acros',    name:'Acros',  desc:'黑白颗粒·墨分五色', css:'grayscale(1) contrast(1.18) brightness(1.02)'},
  {id:'eterna',   name:'Eterna', desc:'电影影调·宽动态', css:'contrast(.82) saturate(.72) brightness(1.06) sepia(.06) hue-rotate(2deg)'},
  {id:'leak',     name:'漏光',   desc:'暖光溢出·胶片漏光', css:'sepia(.14) saturate(1.25) brightness(1.06) hue-rotate(-10deg)'},
  {id:'expired',  name:'过期卷', desc:'褪色偏移·过期胶卷', css:'sepia(.18) contrast(.82) saturate(.55) brightness(1.1) hue-rotate(12deg)'},
  {id:'cross',    name:'冲洗',   desc:'交叉冲洗·青橙', css:'saturate(1.35) contrast(1.12) hue-rotate(18deg) brightness(.96)'},
  {id:'velvia',   name:'Velvia', desc:'艳丽正片·饱和极致', css:'contrast(1.16) saturate(1.45) brightness(.96)'},
  {id:'polaroid', name:'Polaroid',desc:'宝丽来·褪色留影', css:'contrast(.92) saturate(.78) brightness(1.06) sepia(.1) hue-rotate(3deg)'}
];

var _rcFilmFns={
  // ── CCD：旧数码相机·低保真质感 ──
  // 模拟早期CCD传感器：略冷偏色+粗颗粒+硬暗角+轻微色块
  ccd:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // CCD色偏：暗部微青+高光偏暖
    _rcColorMatrix(d,[1.06,0.04,-0.04,0,0.01, -0.04,0.94,0.06,0,0.01, -0.02,-0.06,0.98,0,0.02]);
    // 硬对比S曲线
    var rL=_rcSpline([[0,0],[.08,.03],[.25,.16],[.5,.48],[.75,.8],[.92,.96],[1,1]]);
    var gL=_rcSpline([[0,0],[.08,.03],[.25,.15],[.5,.46],[.75,.78],[.92,.95],[1,1]]);
    var bL=_rcSpline([[0,0],[.08,.04],[.25,.17],[.5,.5],[.75,.82],[.92,.96],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    // CCD粗颗粒
    _rcGrain(d,35,128);
    ctx.putImageData(imgData,0,0);
    // 硬暗角
    _rcVignette(cvs,0.35);
  },
  // ── Holga：玩具相机·漏光+重暗角+糖果色 ──
  holga:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // 玩具色：大幅增饱和+暖偏
    _rcColorMatrix(d,[1.15,0.08,-0.04,0,0.02, -0.04,1.0,0.08,0,0.02, -0.08,-0.06,0.92,0,0.04]);
    var rL=_rcSpline([[0,0],[.1,.08],[.35,.35],[.65,.7],[.9,.94],[1,1]]);
    var gL=_rcSpline([[0,0],[.1,.06],[.35,.32],[.65,.67],[.9,.92],[1,1]]);
    var bL=_rcSpline([[0,0],[.1,.05],[.35,.28],[.65,.63],[.9,.89],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,28,256);
    ctx.putImageData(imgData,0,0);
    // 重暗角 — 玩具相机标志性效果
    _rcVignette(cvs,0.5);
    // 暖色漏光叠加
    var grd=ctx.createLinearGradient(0,0,w*0.6,h);
    grd.addColorStop(0,'rgba(255,180,80,0.12)');
    grd.addColorStop(0.5,'rgba(255,120,60,0.06)');
    grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd; ctx.fillRect(0,0,w,h);
  },
  // ── Instax：即影即有·柔光粉彩 ──
  instax:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // 柔粉：降对比+微粉偏
    _rcColorMatrix(d,[0.94,0.04,0.04,0,0.01, -0.02,0.9,0.08,0,0.02, 0.02,0.02,0.88,0,0.04]);
    _rcFade(d,0.06,0.96);
    var rL=_rcSpline([[0,0],[.1,.08],[.35,.34],[.65,.68],[.9,.94],[1,1]]);
    var gL=_rcSpline([[0,0],[.1,.06],[.35,.32],[.65,.66],[.9,.93],[1,1]]);
    var bL=_rcSpline([[0,0],[.1,.05],[.35,.3],[.65,.64],[.9,.92],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,16,1024);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.15);
    _rcBloom(cvs,1.08);
  },
  // ── Natura 1600：高感金调·夜色暖光 ──
  natura:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    _rcColorMatrix(d,[1.08,0.06,-0.02,0,0.03, -0.02,0.88,0.08,0,0.02, -0.08,-0.06,0.86,0,0.06]);
    var rL=_rcSpline([[0,0],[.1,.08],[.35,.34],[.65,.68],[.9,.93],[1,1]]);
    var gL=_rcSpline([[0,0],[.1,.06],[.35,.31],[.65,.66],[.9,.92],[1,1]]);
    var bL=_rcSpline([[0,0],[.1,.04],[.35,.28],[.65,.62],[.9,.89],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    // 高感粗颗粒
    _rcGrain(d,34,64);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.28);
    _rcBloom(cvs,1.12);
  },
  // ── Acros：黑白颗粒·墨分五色 ──
  acros:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // 转灰：加权亮度
    for(var i=0;i<d.length;i+=4){
      var lum=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114;
      d[i]=d[i+1]=d[i+2]=lum;
    }
    // 高对比S曲线
    var L=_rcSpline([[0,0],[.06,.01],[.2,.12],[.4,.38],[.6,.62],[.8,.88],[.94,.99],[1,1]]);
    _rcMapChannels(d,L,L,L);
    _rcGrain(d,20,512);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.22);
  },
  // ── Eterna：电影影调·宽动态范围 ──
  eterna:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    _rcColorMatrix(d,[1.0,0.04,-0.02,0,0.01, -0.02,0.88,0.06,0,0.01, -0.04,-0.04,0.92,0,0.03]);
    _rcFade(d,0.04,0.97);
    var rL=_rcSpline([[0,0],[.1,.07],[.35,.32],[.65,.68],[.9,.93],[1,1]]);
    var gL=_rcSpline([[0,0],[.1,.06],[.35,.31],[.65,.66],[.9,.92],[1,1]]);
    var bL=_rcSpline([[0,0],[.1,.05],[.35,.3],[.65,.65],[.9,.91],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcHighlightRolloff(d,0.5);
    _rcGrain(d,10,4096);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.2);
    // 电影青色阴影染
    ctx.globalCompositeOperation='multiply';
    ctx.globalAlpha=0.06;
    ctx.fillStyle='#1a3040'; ctx.fillRect(0,0,w,h);
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  },
  // ── 漏光：暖光溢出·胶片漏光 ──
  leak:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // 暖色偏移
    _rcColorMatrix(d,[1.1,0.06,-0.04,0,0.03, -0.02,0.88,0.08,0,0.02, -0.08,-0.08,0.82,0,0.06]);
    _rcFade(d,0.03,0.97);
    var rL=_rcSpline([[0,0],[.12,.1],[.35,.34],[.65,.68],[.9,.93],[1,1]]);
    var gL=_rcSpline([[0,0],[.12,.07],[.35,.31],[.65,.66],[.9,.91],[1,1]]);
    var bL=_rcSpline([[0,0],[.12,.04],[.35,.24],[.65,.58],[.9,.86],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,22,512);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.18);
    // 漏光：橙红渐变从右上角
    var grd=ctx.createLinearGradient(w,0,0,h);
    grd.addColorStop(0,'rgba(255,140,40,0.18)');
    grd.addColorStop(0.3,'rgba(255,100,30,0.1)');
    grd.addColorStop(0.6,'rgba(255,60,20,0.04)');
    grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd; ctx.fillRect(0,0,w,h);
    // 第二道漏光：左侧微红
    var grd2=ctx.createLinearGradient(0,h,w*0.3,0);
    grd2.addColorStop(0,'rgba(220,60,80,0.08)');
    grd2.addColorStop(0.5,'rgba(255,80,60,0.04)');
    grd2.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd2; ctx.fillRect(0,0,w,h);
  },
  // ── 过期卷：褪色偏移·过期胶卷 ──
  expired:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // 过期卷色偏：大幅偏青绿+褪色
    _rcColorMatrix(d,[0.85,0.04,0.08,0,0.02, 0.06,0.88,0.1,0,0.02, 0.08,0.06,0.78,0,0.04]);
    _rcFade(d,0.08,0.94);
    var rL=_rcSpline([[0,0],[.12,.1],[.35,.34],[.65,.68],[.9,.93],[1,1]]);
    var gL=_rcSpline([[0,0],[.12,.09],[.35,.33],[.65,.67],[.9,.92],[1,1]]);
    var bL=_rcSpline([[0,0],[.12,.1],[.35,.35],[.65,.7],[.9,.94],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    // 过期卷粗颗粒
    _rcGrain(d,38,128);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.3);
    // 过期卷漏光斑点
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=0.08;
    ctx.fillStyle='#ff8844'; ctx.fillRect(w*0.6,0,w*0.4,h*0.4);
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  },
  // ── 冲洗：交叉冲洗·青橙对比 ──
  cross:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    // 交叉冲洗：阴影偏青绿+高光偏橙黄
    _rcColorMatrix(d,[1.15,0.02,-0.1,0,0.02, -0.08,1.1,0.08,0,0, 0.1,-0.06,0.88,0,0.02]);
    // 硬S曲线
    var rL=_rcSpline([[0,0],[.05,.01],[.15,.08],[.35,.28],[.55,.55],[.75,.78],[.9,.93],[1,1]]);
    var gL=_rcSpline([[0,0],[.05,.02],[.15,.1],[.35,.3],[.55,.56],[.75,.8],[.9,.94],[1,1]]);
    var bL=_rcSpline([[0,0],[.05,.02],[.15,.1],[.35,.32],[.55,.58],[.75,.82],[.9,.95],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,26,256);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.22);
    _rcBloom(cvs,1.06);
  },
  // ── Velvia：艳丽正片·饱和极致 ──
  velvia:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    _rcColorMatrix(d,[1.12,0.02,-0.06,0,0, -0.06,1.12,0.02,0,0, -0.02,-0.06,1.14,0,0]);
    var rL=_rcSpline([[0,0],[.06,.02],[.25,.18],[.5,.48],[.75,.78],[.94,.97],[1,1]]);
    var gL=_rcSpline([[0,0],[.06,.02],[.25,.17],[.5,.46],[.75,.76],[.94,.96],[1,1]]);
    var bL=_rcSpline([[0,0],[.06,.01],[.25,.15],[.5,.44],[.75,.74],[.94,.95],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,10,4096);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.1);
  },
  // ── Polaroid：宝丽来·褪色留影 ──
  polaroid:function(cvs){
    var ctx=cvs.getContext('2d'),w=cvs.width,h=cvs.height;
    var imgData=ctx.getImageData(0,0,w,h),d=imgData.data;
    _rcColorMatrix(d,[1.02,0.04,0.02,0,0.02, -0.02,0.9,0.06,0,0.02, 0.02,-0.02,0.84,0,0.04]);
    _rcFade(d,0.06,0.95);
    var rL=_rcSpline([[0,0],[.15,.12],[.35,.34],[.65,.68],[.85,.88],[1,1]]);
    var gL=_rcSpline([[0,0],[.15,.1],[.35,.32],[.65,.66],[.85,.86],[1,1]]);
    var bL=_rcSpline([[0,0],[.15,.08],[.35,.28],[.65,.62],[.85,.84],[1,1]]);
    _rcMapChannels(d,rL,gL,bL);
    _rcGrain(d,20,512);
    ctx.putImageData(imgData,0,0);
    _rcVignette(cvs,0.2);
    _rcBloom(cvs,1.05);
  }
};

// 胶片模拟统一入口
function _rcApplyFilm(cvs,filmId){
  var fn=_rcFilmFns[filmId];
  if(fn) fn(cvs);
}

// 胶片模拟条初始化
(function(){
  var bar=document.getElementById('rc-film-strip');
  if(!bar)return;
  RC_FILMS.forEach(function(f){
    var item=document.createElement('div');
    item.className='rc-film-item'+(f.id==='ccd'?' rc-film-active':'');
    item.setAttribute('data-fid',f.id);
    var thumb=document.createElement('div');
    thumb.className='rc-film-thumb';
    if(f.css) thumb.style.filter=f.css;
    // 胶卷齿孔+椰树剪影
    thumb.innerHTML='<svg viewBox="0 0 40 40" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" preserveAspectRatio="xMidYMid slice"><rect x="1" y="1" width="38" height="38" rx="4" fill="none" stroke="rgba(255,255,255,.12)" stroke-width=".8"/><circle cx="6" cy="10" r="2" fill="rgba(255,255,255,.1)"/><circle cx="6" cy="20" r="2" fill="rgba(255,255,255,.1)"/><circle cx="6" cy="30" r="2" fill="rgba(255,255,255,.1)"/><path d="M22 38Q22 30 22 24Q18 18 13 16Q17 17 21 20Q19 14 14 10Q19 13 21.5 17Q21 11 20 6Q22 10 22.5 16Q25 12 28 8Q25 13 23 18Q27 16 30 14Q27 17 23 20Q23 26 23 38Z" fill="rgba(0,0,0,.35)" stroke="none"/></svg>';
    item.appendChild(thumb);
    var label=document.createElement('span');
    label.className='rc-film-label';
    label.textContent=f.name;
    item.appendChild(label);
    item.addEventListener('click',function(){
      _rcFilm=f.id;
      bar.querySelectorAll('.rc-film-item').forEach(function(el){el.classList.remove('rc-film-active');});
      item.classList.add('rc-film-active');
      // 实时预览：合并LUT+胶片CSS应用到video
      var vf=document.getElementById('rc-video');
      if(vf){
        var lutCss='';
        var lutItem=document.querySelector('.rc-filter-item.rc-filter-active');
        if(lutItem){var fid=lutItem.getAttribute('data-fid');var lf=RC_FILTERS.find(function(x){return x.id===fid;});if(lf)lutCss=lf.css;}
        vf.style.filter=(lutCss+' '+f.css).trim();
      }
    });
    bar.appendChild(item);
  });
})();

// 取景器内阻止触摸事件冒泡到桌面滑动系统 + 双指缩放焦距 + 点击对焦
(function(){
  var vf=document.getElementById('rc-viewfinder');
  if(!vf)return;
  var pinchStart=0,pinchZoom=1;
  vf.addEventListener('touchstart',function(e){
    e.stopPropagation();
    // 双指缩放
    if(e.touches.length===2){
      var dx=e.touches[0].clientX-e.touches[1].clientX;
      var dy=e.touches[0].clientY-e.touches[1].clientY;
      pinchStart=Math.sqrt(dx*dx+dy*dy);
      pinchZoom=_rcZoom;
      e.preventDefault();
    }
  },{passive:false});
  vf.addEventListener('touchmove',function(e){
    // 变焦拖杆拖拽时放行，让document级touchmove处理
    if(_rcZoomDragging){return;}
    // 双指缩放焦距
    if(e.touches.length===2&&pinchStart>0){
      e.preventDefault();
      e.stopPropagation();
      var dx=e.touches[0].clientX-e.touches[1].clientX;
      var dy=e.touches[0].clientY-e.touches[1].clientY;
      var dist=Math.sqrt(dx*dx+dy*dy);
      var ratio=dist/pinchStart;
      _rcZoom=Math.max(1,Math.min(5,pinchZoom*ratio));
      _rcZoom=Math.round(_rcZoom*10)/10;
      _rcUpdateZoom(); _rcUpdateZoomThumb();
      return;
    }
    e.stopPropagation();
  },{passive:false});
  vf.addEventListener('touchend',function(e){
    if(_rcZoomDragging){_rcZoomDragging=false;} // ★ 确保变焦拖拽态重置
    e.stopPropagation();
    // 单指点击对焦
    if(e.changedTouches.length===1&&e.touches.length===0){
      var vp=document.getElementById('rc-viewport');
      if(!vp)return;
      var rect=vp.getBoundingClientRect();
      var tx=e.changedTouches[0].clientX;
      var ty=e.changedTouches[0].clientY;
      if(tx>=rect.left&&tx<=rect.right&&ty>=rect.top&&ty<=rect.bottom){
        var px=(tx-rect.left)/rect.width;
        var py=(ty-rect.top)/rect.height;
        _rcFocusPoint(px,py);
      }
    }
    if(e.touches.length<2)pinchStart=0;
  },{passive:false});
})();

// 照片拖拽 move/end（全局document，因为照片是fixed定位）
document.addEventListener('touchmove',function(e){
  if(!_rcDrag||_rcZoomDragging)return;
  e.preventDefault();
  e.stopPropagation();
  var t=e.touches[0];
  var dx=t.clientX-_rcDrag.sx;
  var dy=t.clientY-_rcDrag.sy;
  _rcDrag.pobj.x=_rcDrag.ox+dx;
  _rcDrag.pobj.y=_rcDrag.oy+dy;
  _rcDrag.pobj.el.style.left=_rcDrag.pobj.x+'px';
  _rcDrag.pobj.el.style.top=_rcDrag.pobj.y+'px';
},{passive:false});
document.addEventListener('touchend',function(e){
  if(_rcDrag){if(_rcDrag.el)_rcDrag.el.style.transition='';_rcDrag=null;e.stopPropagation();}
});

// 照片双指缩放
var _rcPinch=null;
document.addEventListener('touchstart',function(e){
  if(e.touches.length===2){
    for(var i=0;i<_rcPhotos.length;i++){
      var p=_rcPhotos[i];
      var r=p.el.getBoundingClientRect();
      var cx=(e.touches[0].clientX+e.touches[1].clientX)/2;
      var cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
      if(cx>=r.left&&cx<=r.right&&cy>=r.top&&cy<=r.bottom){
        var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        _rcPinch={photo:p,startDist:d,startW:p.w,startH:p.h};
        e.preventDefault();e.stopPropagation();
        break;
      }
    }
  }
},{passive:false});
document.addEventListener('touchmove',function(e){
  if(!_rcPinch||e.touches.length!==2)return;
  e.preventDefault();e.stopPropagation();
  var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  var scale=d/_rcPinch.startDist;
  var nw=Math.round(_rcPinch.startW*scale);
  var nh=Math.round(_rcPinch.startH*scale);
  nw=Math.max(60,Math.min(300,nw));
  nh=Math.max(74,Math.min(370,nh));
  _rcPinch.photo.w=nw;
  _rcPinch.photo.h=nh;
  _rcPinch.photo.el.style.width=nw+'px';
  _rcPinch.photo.el.style.height=nh+'px';
},{passive:false});
document.addEventListener('touchend',function(e){
  if(_rcPinch){_rcPinch=null;e.stopPropagation();}
});

/* ── 双击桌面：呼出/隐藏四角拍立得 ── */
var _deskTapTime=0,_deskTapX=0,_deskTapY=0;
document.addEventListener('touchend',function(e){
  if(e.target.closest('.sb-photo')||e.target.closest('#rc-viewfinder')||
     e.target.closest('#dock')||e.target.closest('#menubar')||
     e.target.closest('.win')||e.target.closest('#ps-creator')||
     e.target.closest('#ps-chat-overlay')||e.target.closest('.finder')||
     e.target.closest('.sb-btn')||e.target.closest('button')||
     e.target.closest('input')||e.target.closest('textarea')||
     e.target.closest('a')||e.target.closest('select'))return;
  var t=e.changedTouches&&e.changedTouches[0];
  if(!t)return;
  var now=Date.now();
  var dx=Math.abs(t.clientX-_deskTapX),dy=Math.abs(t.clientY-_deskTapY);
  if(dx>25||dy>25){_deskTapTime=0;_deskTapX=t.clientX;_deskTapY=t.clientY;return;}
  if(now-_deskTapTime<400){
    _deskTapTime=0;
    var hasHidden=_rcPhotos.some(function(p){return p.corner;});
    for(var i=0;i<_rcPhotos.length;i++){
      var p=_rcPhotos[i];
      if(hasHidden){
        if(p.corner)p.el._toggleCornerFn&&p.el._toggleCornerFn();
      _rcUpdateCornerDot();
      }else{
        if(!p.corner)p.el._toggleCornerFn&&p.el._toggleCornerFn();
      _rcUpdateCornerDot();
      }
    }
  }else{
    _deskTapTime=now;
  }
  _deskTapX=t.clientX;_deskTapY=t.clientY;
});
document.addEventListener('dblclick',function(e){
  if(e.target.closest('.sb-photo')||e.target.closest('#rc-viewfinder')||
     e.target.closest('#dock')||e.target.closest('#menubar')||
     e.target.closest('.win')||e.target.closest('button')||
     e.target.closest('input')||e.target.closest('a'))return;
  var hasHidden=_rcPhotos.some(function(p){return p.corner;});
  for(var i=0;i<_rcPhotos.length;i++){
    var p=_rcPhotos[i];
    if(hasHidden){
      if(p.corner)p.el._toggleCornerFn&&p.el._toggleCornerFn();
      _rcUpdateCornerDot();
    }else{
      if(!p.corner)p.el._toggleCornerFn&&p.el._toggleCornerFn();
      _rcUpdateCornerDot();
    }
  }
});

/* ── 全局接口 ── */
window.SongBoard = {
  show: function() {
    state.visible = true;
    state.minimized = false;
    state.maximized = false;
    // ★ 重置画板变换
    state.boardScale = 1;
    state.boardOffX = 0;
    state.boardOffY = 0;
    board.style.transform = '';
    board.style.transformOrigin = '';
    board.classList.add('sb-visible');
    board.classList.remove('sb-minimized');
    board.classList.remove('sb-maximized');
    document.body.classList.add('sb-active');
    document.body.classList.remove('has-maximized');
    resizeCanvas();
    if (state.history.length === 0) saveState();
  },
  hide: function() {
    state.visible = false;
    state.minimized = false;
    state.maximized = false;
    // ★ 重置画板变换
    state.boardScale = 1;
    state.boardOffX = 0;
    state.boardOffY = 0;
    board.style.transform = '';
    board.style.transformOrigin = '';
    board.classList.remove('sb-visible');
    board.classList.remove('sb-minimized');
    board.classList.remove('sb-maximized');
    document.body.classList.remove('sb-active');
    document.body.classList.remove('has-maximized');
  },
  minimize: function() {
    state.minimized = true;
    board.classList.add('sb-minimized');
    board.classList.remove('sb-maximized');
    document.body.classList.remove('has-maximized');
    document.body.classList.remove('sb-active');
    // ★ 在右侧bubble-rail创建气泡
    var rail = document.getElementById('bubble-rail');
    if(rail && !rail.querySelector('[data-win="songboard"]')) {
      var existingCount = rail.children.length;
      var opacity = Math.max(0.25, 0.9 - existingCount * 0.1);
      var svg = (typeof ICON_SVGS !== 'undefined' && ICON_SVGS.songboard) ? ICON_SVGS.songboard : '';
      var bub = document.createElement('div');
      bub.className = 'bubble';
      bub.dataset.win = 'songboard';
      bub.style.setProperty('--bub-opacity', opacity);
      bub.style.setProperty('--bub-ring-alpha', String(opacity * 0.5));
      bub.innerHTML = '<span class="bub-ring"></span>' + svg.replace(/stroke="currentColor"/g, 'stroke="#fff"');
      bub.addEventListener('click', function() { SongBoard.restore(); });
      rail.appendChild(bub);
      requestAnimationFrame(function() { requestAnimationFrame(function() { bub.classList.add('show'); }); });
    }
  },
  maximize: function() {
    state.minimized = false;
    state.maximized = !state.maximized;
    if (state.maximized) {
      board.classList.add('sb-maximized');
      board.classList.remove('sb-minimized');
      document.body.classList.add('has-maximized');
      // ★ 最大化时重置画板变换，清除内联style让CSS transform:none生效
      state.boardScale = 1;
      state.boardOffX = 0;
      state.boardOffY = 0;
      board.style.transform = '';
      board.style.transformOrigin = '';
    } else {
      board.classList.remove('sb-maximized');
      document.body.classList.remove('has-maximized');
      // ★ 退出最大化：恢复居中（不再恢复之前的缩放，避免残留状态）
      state.boardScale = 1;
      state.boardOffX = 0;
      state.boardOffY = 0;
      board.style.transform = '';
      board.style.transformOrigin = '';
    }
    resizeCanvas();
  },
  restore: function() {
    state.minimized = false;
    board.classList.remove('sb-minimized');
    document.body.classList.add('sb-active');
    // ★ 移除右侧气泡
    var rail = document.getElementById('bubble-rail');
    if(rail) {
      var bub = rail.querySelector('[data-win="songboard"]');
      if(bub) {
        bub.classList.remove('show');
        setTimeout(function() { bub.remove(); }, 400);
      }
    }
    resizeCanvas();
  },
  isVisible: function() { return state.visible; },
  openCamera: function() { _rcOpenViewfinder(); },
  closeCamera: function() { _rcCloseViewfinder(); }
};

// resize
window.addEventListener('resize', function() {
  if (state.visible && !state.minimized) resizeCanvas();
});

})();
