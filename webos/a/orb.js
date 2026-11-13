/**
 * NEXLOS 任务栏情绪球。
 *
 * 源码移植自 NovaVia-app 的 src/orbFace.ts / src/orbEyeRings.ts / src/orbLife.ts，
 * 只做两件事：把 TypeScript 改成 Chrome 72 可直接加载的 ES2017，并把
 * 「点开三个入口的抽屉」换成「点开全部应用面板」。球的点击、拖拽、回弹、
 * 呼吸、眨眼、待机小动作与情绪脸沿用同一套逻辑和参数。
 *
 * 表情约束：差异只能来自眼形 / 视线 / 身体 / 体色，
 * 不加嘴、眉、高光、描边。眼睛是近黑实心 #17181d。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 与球直径一致：路径坐标就是 CSS 像素，缩放时不会出现半像素毛边 */
const VIEW = 46;
const EYE_FILL = '#17181d';

/** 弹簧：ω=30 时约 260ms 收敛，阻尼比 .86 留一次极小的过冲（眼睛「弹」一下） */
const OMEGA = 30;
const ZETA = 0.86;
const MAX_STEP_S = 0.048;

/* 眼环几何取自 tycoding/grok-ball（MIT License）的 EB_RINGS，与 NEXL 底栏同源。 */
const EYE_RINGS = {
  e1: [[[17.59,25.87],[18.11,25.89],[18.61,26.04],[19.06,26.3],[19.44,26.67],[19.72,27.12],[19.9,27.61],[20,28.13],[20.08,28.66],[20.16,29.19],[20.25,29.71],[20.34,30.23],[20.44,30.75],[20.54,31.27],[20.64,31.8],[20.75,32.31],[20.87,32.83],[20.99,33.35],[21.11,33.87],[21.14,34.4],[21.02,34.91],[20.74,35.35],[20.33,35.69],[19.85,35.89],[19.34,35.98],[18.82,35.94],[18.31,35.8],[17.85,35.55],[17.44,35.21],[17.13,34.79],[16.93,34.3],[16.81,33.79],[16.69,33.27],[16.58,32.75],[16.47,32.23],[16.36,31.71],[16.26,31.19],[16.17,30.66],[16.07,30.14],[15.99,29.62],[15.9,29.1],[15.82,28.57],[15.76,28.04],[15.78,27.51],[15.94,27.01],[16.22,26.56],[16.6,26.21],[17.07,25.97]], [[29.51,23.45],[30.01,23.5],[30.49,23.68],[30.9,23.99],[31.22,24.4],[31.44,24.89],[31.57,25.4],[31.69,25.92],[31.8,26.44],[31.91,26.96],[32.01,27.49],[32.11,28.01],[32.21,28.53],[32.3,29.06],[32.39,29.58],[32.47,30.11],[32.55,30.64],[32.62,31.17],[32.62,31.7],[32.49,32.21],[32.25,32.68],[31.92,33.09],[31.52,33.42],[31.07,33.66],[30.57,33.78],[30.07,33.77],[29.58,33.61],[29.17,33.31],[28.88,32.87],[28.73,32.36],[28.65,31.84],[28.57,31.31],[28.48,30.78],[28.4,30.26],[28.3,29.73],[28.21,29.21],[28.11,28.68],[28,28.16],[27.9,27.64],[27.78,27.12],[27.67,26.6],[27.56,26.08],[27.54,25.55],[27.64,25.02],[27.85,24.54],[28.16,24.12],[28.55,23.78],[29.01,23.55]]],
  e2: [[[21.15,21.01],[22.05,21.17],[22.9,21.54],[23.63,22.1],[24.21,22.81],[24.61,23.64],[24.79,24.55],[24.74,25.47],[24.53,26.37],[24.29,27.26],[24.04,28.15],[23.8,29.04],[23.56,29.94],[23.32,30.83],[23.08,31.72],[22.85,32.62],[22.62,33.51],[22.4,34.41],[22.18,35.31],[21.95,36.21],[21.57,37.05],[20.94,37.71],[20.14,38.15],[19.24,38.37],[18.32,38.37],[17.42,38.17],[16.58,37.81],[15.82,37.29],[15.19,36.62],[14.74,35.81],[14.52,34.92],[14.6,34],[14.82,33.1],[15.04,32.2],[15.26,31.31],[15.5,30.41],[15.73,29.51],[15.96,28.62],[16.2,27.73],[16.44,26.84],[16.69,25.94],[16.93,25.05],[17.18,24.16],[17.47,23.28],[17.93,22.49],[18.57,21.83],[19.36,21.34],[20.23,21.07]], [[34.32,23.37],[35.09,23.57],[35.76,24.03],[36.29,24.69],[36.63,25.49],[36.79,26.36],[36.78,27.24],[36.68,28.12],[36.56,28.99],[36.43,29.87],[36.28,30.74],[36.11,31.6],[35.92,32.46],[35.71,33.32],[35.48,34.16],[35.23,35.01],[34.97,35.84],[34.68,36.67],[34.36,37.48],[33.95,38.23],[33.42,38.89],[32.8,39.44],[32.11,39.88],[31.36,40.18],[30.58,40.33],[29.79,40.28],[29.05,39.99],[28.48,39.38],[28.25,38.54],[28.36,37.67],[28.66,36.85],[28.96,36.03],[29.24,35.2],[29.5,34.36],[29.73,33.52],[29.95,32.66],[30.15,31.81],[30.33,30.94],[30.49,30.08],[30.63,29.2],[30.75,28.33],[30.86,27.45],[30.99,26.58],[31.23,25.74],[31.63,24.97],[32.16,24.31],[32.8,23.8],[33.53,23.46]]],
  e4: [[[18.21,19.98],[18.75,19.98],[19.28,20.09],[19.8,20.19],[20.33,20.29],[20.87,20.4],[21.39,20.5],[21.92,20.6],[22.45,20.71],[22.98,20.81],[23.51,20.92],[24.04,21.03],[24.57,21.13],[25.1,21.24],[25.63,21.35],[26.16,21.46],[26.69,21.56],[27.22,21.67],[27.71,21.88],[28.08,22.27],[28.27,22.77],[28.26,23.31],[28.05,23.81],[27.68,24.19],[27.18,24.38],[26.64,24.38],[26.11,24.27],[25.58,24.15],[25.05,24.04],[24.52,23.94],[23.99,23.83],[23.47,23.72],[22.94,23.62],[22.4,23.52],[21.88,23.41],[21.34,23.31],[20.81,23.21],[20.29,23.1],[19.75,23],[19.22,22.9],[18.7,22.79],[18.17,22.68],[17.67,22.47],[17.3,22.09],[17.12,21.58],[17.13,21.05],[17.33,20.55],[17.71,20.17]], [[31.28,22.66],[31.68,22.68],[32.08,22.78],[32.47,22.87],[32.87,22.97],[33.26,23.07],[33.66,23.17],[34.05,23.27],[34.44,23.37],[34.84,23.47],[35.23,23.58],[35.63,23.68],[36.02,23.78],[36.42,23.89],[36.81,23.99],[37.2,24.09],[37.6,24.19],[37.98,24.35],[38.25,24.68],[38.38,25.12],[38.4,25.59],[38.32,26.05],[38.14,26.47],[37.87,26.81],[37.49,26.96],[37.09,26.91],[36.7,26.79],[36.31,26.68],[35.92,26.58],[35.52,26.48],[35.13,26.37],[34.73,26.27],[34.34,26.17],[33.94,26.07],[33.55,25.97],[33.15,25.88],[32.76,25.78],[32.36,25.68],[31.97,25.58],[31.57,25.48],[31.18,25.37],[30.81,25.19],[30.53,24.86],[30.36,24.44],[30.32,23.97],[30.4,23.51],[30.59,23.11],[30.9,22.81]]],
  e8: [[[13.12,17.37],[13.51,17.49],[13.84,17.74],[14.1,18.11],[14.25,18.54],[14.29,19.01],[14.24,19.48],[14.09,19.91],[13.87,20.3],[13.61,20.66],[13.35,21.02],[13.09,21.39],[12.84,21.75],[12.59,22.12],[12.34,22.5],[12.1,22.87],[11.86,23.25],[11.63,23.64],[11.4,24.02],[11.17,24.42],[10.95,24.81],[10.74,25.21],[10.47,25.56],[10.12,25.79],[9.72,25.83],[9.34,25.68],[9.03,25.39],[8.79,25.01],[8.64,24.57],[8.58,24.1],[8.59,23.64],[8.69,23.18],[8.87,22.76],[9.08,22.36],[9.31,21.97],[9.54,21.58],[9.77,21.2],[10,20.81],[10.24,20.43],[10.49,20.06],[10.73,19.69],[10.99,19.32],[11.24,18.95],[11.5,18.59],[11.76,18.23],[12.03,17.88],[12.35,17.59],[12.72,17.41]], [[21.09,19.4],[21.57,19.52],[22,19.78],[22.34,20.15],[22.57,20.6],[22.71,21.08],[22.84,21.57],[22.97,22.05],[23.1,22.54],[23.23,23.02],[23.37,23.51],[23.51,23.99],[23.64,24.48],[23.78,24.96],[23.92,25.45],[24.06,25.93],[24.2,26.41],[24.34,26.9],[24.4,27.39],[24.33,27.89],[24.11,28.34],[23.78,28.71],[23.35,28.98],[22.88,29.13],[22.38,29.15],[21.89,29.03],[21.46,28.77],[21.11,28.41],[20.88,27.96],[20.73,27.48],[20.59,27],[20.45,26.52],[20.32,26.03],[20.18,25.55],[20.04,25.06],[19.91,24.58],[19.77,24.1],[19.64,23.61],[19.51,23.13],[19.37,22.64],[19.24,22.15],[19.11,21.67],[19.05,21.17],[19.13,20.67],[19.35,20.22],[19.69,19.85],[20.11,19.58],[20.59,19.42]]],
  e10: [[[20.77,16.49],[21.33,16.51],[21.86,16.67],[22.34,16.96],[22.71,17.38],[22.97,17.88],[23.08,18.43],[23.05,18.99],[22.92,19.53],[22.79,20.08],[22.66,20.63],[22.53,21.17],[22.4,21.72],[22.27,22.27],[22.15,22.82],[22.03,23.37],[21.9,23.92],[21.79,24.47],[21.68,25.02],[21.56,25.57],[21.37,26.1],[21.06,26.57],[20.65,26.94],[20.15,27.18],[19.6,27.28],[19.04,27.24],[18.51,27.06],[18.05,26.76],[17.67,26.35],[17.4,25.85],[17.28,25.31],[17.28,24.74],[17.37,24.19],[17.49,23.64],[17.61,23.09],[17.73,22.54],[17.85,21.99],[17.98,21.44],[18.1,20.9],[18.23,20.35],[18.36,19.8],[18.49,19.25],[18.63,18.71],[18.76,18.16],[18.97,17.64],[19.29,17.18],[19.72,16.83],[20.23,16.6]], [[32.12,19.17],[32.62,19.25],[33.09,19.47],[33.48,19.82],[33.8,20.25],[34,20.76],[34.1,21.3],[34.08,21.85],[34,22.39],[33.91,22.94],[33.81,23.48],[33.71,24.02],[33.61,24.56],[33.49,25.1],[33.38,25.64],[33.25,26.17],[33.13,26.71],[32.99,27.24],[32.86,27.77],[32.71,28.3],[32.5,28.8],[32.2,29.25],[31.82,29.61],[31.36,29.86],[30.87,29.98],[30.36,29.95],[29.88,29.76],[29.47,29.43],[29.17,28.99],[29,28.47],[28.96,27.92],[29.05,27.37],[29.19,26.84],[29.33,26.31],[29.46,25.78],[29.59,25.25],[29.71,24.71],[29.83,24.17],[29.94,23.64],[30.05,23.1],[30.15,22.55],[30.24,22.01],[30.33,21.47],[30.42,20.92],[30.55,20.39],[30.81,19.92],[31.17,19.53],[31.62,19.27]]],
  e11: [[[10.46,18.36],[11.21,18.64],[11.84,19.21],[12.3,19.96],[12.6,20.82],[12.75,21.73],[12.87,22.64],[13.02,23.56],[13.18,24.47],[13.36,25.37],[13.56,26.27],[13.78,27.16],[14.02,28.05],[14.28,28.93],[14.56,29.8],[14.85,30.66],[15.17,31.51],[15.5,32.35],[15.76,33.23],[15.84,34.15],[15.69,35.06],[15.27,35.84],[14.62,36.37],[13.85,36.58],[13.06,36.51],[12.31,36.21],[11.63,35.73],[11.04,35.11],[10.55,34.38],[10.18,33.56],[9.86,32.71],[9.55,31.85],[9.26,30.99],[8.99,30.11],[8.74,29.23],[8.51,28.34],[8.3,27.45],[8.1,26.55],[7.93,25.64],[7.78,24.73],[7.64,23.82],[7.53,22.9],[7.51,21.97],[7.64,21.06],[7.92,20.19],[8.35,19.42],[8.94,18.8],[9.67,18.42]], [[21.91,14.77],[22.89,14.82],[23.82,15.1],[24.64,15.61],[25.31,16.32],[25.77,17.18],[26.08,18.1],[26.36,19.04],[26.64,19.97],[26.92,20.91],[27.2,21.84],[27.48,22.78],[27.76,23.71],[28.04,24.65],[28.31,25.58],[28.59,26.52],[28.87,27.46],[29.13,28.4],[29.27,29.36],[29.15,30.32],[28.79,31.22],[28.2,32],[27.44,32.61],[26.56,33.02],[25.6,33.22],[24.63,33.18],[23.7,32.9],[22.87,32.39],[22.2,31.69],[21.76,30.82],[21.47,29.89],[21.2,28.95],[20.92,28.01],[20.64,27.08],[20.37,26.14],[20.09,25.21],[19.81,24.27],[19.53,23.33],[19.25,22.4],[18.97,21.46],[18.69,20.53],[18.41,19.6],[18.27,18.63],[18.38,17.67],[18.74,16.76],[19.32,15.98],[20.08,15.37],[20.96,14.96]]],
  e13: [[[17.41,26.44],[17.85,26.51],[18.24,26.75],[18.53,27.12],[18.7,27.57],[18.72,28.06],[18.58,28.52],[18.28,28.88],[17.88,29.08],[17.44,29.18],[16.99,29.25],[16.55,29.33],[16.11,29.4],[15.66,29.47],[15.22,29.54],[14.77,29.61],[14.33,29.68],[13.88,29.75],[13.44,29.81],[12.99,29.88],[12.55,29.93],[12.1,29.99],[11.65,30.04],[11.21,30.08],[10.76,30.12],[10.32,30.04],[9.95,29.77],[9.68,29.38],[9.51,28.93],[9.46,28.44],[9.57,27.97],[9.86,27.61],[10.28,27.46],[10.73,27.42],[11.18,27.37],[11.63,27.32],[12.07,27.26],[12.52,27.21],[12.96,27.15],[13.41,27.09],[13.85,27.02],[14.3,26.96],[14.74,26.88],[15.19,26.81],[15.63,26.74],[16.08,26.67],[16.52,26.59],[16.96,26.51]], [[30.76,23.52],[31.26,23.69],[31.63,24.07],[31.82,24.56],[31.82,25.1],[31.64,25.6],[31.29,25.99],[30.82,26.23],[30.31,26.37],[29.79,26.5],[29.28,26.63],[28.77,26.76],[28.26,26.9],[27.74,27.02],[27.23,27.15],[26.71,27.28],[26.2,27.4],[25.68,27.52],[25.17,27.65],[24.65,27.76],[24.13,27.88],[23.62,27.99],[23.1,28.09],[22.58,28.2],[22.05,28.2],[21.56,28],[21.19,27.63],[20.97,27.15],[20.94,26.61],[21.14,26.12],[21.51,25.75],[22,25.54],[22.52,25.43],[23.03,25.32],[23.55,25.21],[24.07,25.09],[24.59,24.98],[25.1,24.86],[25.62,24.74],[26.13,24.62],[26.65,24.49],[27.16,24.37],[27.68,24.24],[28.19,24.11],[28.7,23.98],[29.22,23.84],[29.73,23.71],[30.24,23.56]]],
  e12s: [[[17.08,19.35],[17.51,19.41],[17.94,19.52],[18.35,19.68],[18.74,19.9],[19.11,20.17],[19.45,20.49],[19.75,20.85],[20.01,21.25],[20.21,21.69],[20.37,22.15],[20.46,22.63],[20.5,23.13],[20.47,23.62],[20.38,24.11],[20.22,24.57],[20.01,25.01],[19.75,25.4],[19.44,25.75],[19.09,26.05],[18.7,26.29],[18.3,26.47],[17.87,26.59],[17.44,26.65],[17,26.65],[16.57,26.59],[16.14,26.48],[15.73,26.31],[15.33,26.1],[14.96,25.83],[14.63,25.51],[14.33,25.15],[14.07,24.75],[13.86,24.31],[13.71,23.85],[13.61,23.37],[13.58,22.87],[13.61,22.38],[13.7,21.89],[13.85,21.43],[14.06,20.99],[14.33,20.6],[14.64,20.25],[14.99,19.95],[15.37,19.71],[15.78,19.53],[16.21,19.41],[16.64,19.35]], [[28.92,19.35],[28.49,19.41],[28.06,19.52],[27.65,19.68],[27.26,19.9],[26.89,20.17],[26.55,20.49],[26.25,20.85],[25.99,21.25],[25.79,21.69],[25.63,22.15],[25.54,22.63],[25.5,23.13],[25.53,23.62],[25.62,24.11],[25.78,24.57],[25.99,25.01],[26.25,25.4],[26.56,25.75],[26.91,26.05],[27.3,26.29],[27.7,26.47],[28.13,26.59],[28.56,26.65],[29,26.65],[29.43,26.59],[29.86,26.48],[30.27,26.31],[30.67,26.1],[31.04,25.83],[31.37,25.51],[31.67,25.15],[31.93,24.75],[32.14,24.31],[32.29,23.85],[32.39,23.37],[32.42,22.87],[32.39,22.38],[32.3,21.89],[32.15,21.43],[31.94,20.99],[31.67,20.6],[31.36,20.25],[31.01,19.95],[30.63,19.71],[30.22,19.53],[29.79,19.41],[29.36,19.35]]],
};

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function randomBetween(low, high) {
  return low + Math.random() * (high - low);
}

/** 两眼的包围盒纵向中心：眨眼的压扁轴心。 */
function centerY(ring) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const y = ring[i][1];
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return (min + max) / 2;
}

/** 48 点折线；0.1px 精度足够。 */
function toPath(pts) {
  const x = Math.round(pts[0][0] * 10) / 10;
  const y = Math.round(pts[0][1] * 10) / 10;
  let d = 'M' + x + ' ' + y;
  for (let i = 1; i < pts.length; i += 1) {
    d += 'L' + Math.round(pts[i][0] * 10) / 10 + ' ' + Math.round(pts[i][1] * 10) / 10;
  }
  return d + 'Z';
}

function cloneRing(ring) {
  return ring.map(function (point) { return [point[0], point[1]]; });
}

function blankVel(ring) {
  return ring.map(function () { return [0, 0]; });
}

function reducedMotion() {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 情绪球的脸：48 点眼环 + 弹簧插值。
 * 形变停下来以后不再写 DOM；视线用 <g translate>，眨眼绕本眼重心压扁。
 */
class OrbFace {
  constructor() {
    const ring = EYE_RINGS.e10;
    this.host = null;
    this.svg = null;
    this.group = null;
    this.paths = [];
    this.state = ring.map(function (side) { return { pts: cloneRing(side), vel: blankVel(side) }; });
    this.target = 'e10';
    this.cy = [centerY(EYE_RINGS.e10[0]), centerY(EYE_RINGS.e10[1])];
    this.gazeX = 0;
    this.gazeY = 0;
    this.open = 1;
    this.painted = { d: ['', ''], gaze: '', blink: ['', ''] };
  }

  /** 挂到球里的 .os-orb-face 容器；DOM 重渲染后调用方需要重新挂。 */
  mount(host) {
    if (this.host === host && this.svg && this.svg.isConnected) return;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VIEW + ' ' + VIEW);
    svg.setAttribute('class', 'os-orb-face-art');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const group = document.createElementNS(SVG_NS, 'g');
    this.paths = this.state.map(function (eye, index) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'os-orb-eye');
      path.setAttribute('fill', EYE_FILL);
      path.setAttribute('d', toPath(eye.pts));
      path.setAttribute('data-eye', index === 0 ? 'l' : 'r');
      group.appendChild(path);
      return path;
    });
    svg.appendChild(group);

    host.textContent = '';
    host.appendChild(svg);
    this.host = host;
    this.svg = svg;
    this.group = group;
    this.painted = { d: ['', ''], gaze: '', blink: ['', ''] };
    this.flush(true);
  }

  /** 表情目标：弹簧会从现在这套眼环长到目标眼环，不打断进行中的形变。 */
  setExpression(key) {
    if (this.target === key || !EYE_RINGS[key]) return;
    this.target = key;
    this.cy = [centerY(EYE_RINGS[key][0]), centerY(EYE_RINGS[key][1])];
  }

  setGaze(x, y) {
    this.gazeX = x;
    this.gazeY = y;
  }

  /** 1 = 完全睁开，0 = 闭上；压扁轴在每只眼自己的纵向重心。 */
  setBlink(open) {
    this.open = open;
  }

  /** 每帧推进弹簧；只有真的还在动时才重写 d。 */
  step(dtMs) {
    if (!this.svg || !this.group) return;
    let dt = Math.min(Math.max(dtMs, 0), MAX_STEP_S * 1000) / 1000;
    if (dt <= 0) {
      this.flush(false);
      return;
    }
    // 半隐式欧拉在 dt >= 30.6ms 时特征根 |lambda| > 1，30fps 的 33ms 正好越界，
    // 一次大步会指数发散（眼睛飞出 viewBox 后不再绘制）。按 <= 1/120s 切子步即可稳定。
    const sub = 1 / 120;
    let moving = false;
    while (dt > 1e-9) {
      const h = Math.min(dt, sub);
      if (this.advance(h)) moving = true;
      dt -= h;
    }
    if (moving) this.paintEyes();
    this.flush(false);
  }

  /** 单个子步的弹簧积分；dt 必须 <= 1/120s，返回是否仍在动。 */
  advance(dt) {
    const target = EYE_RINGS[this.target] || EYE_RINGS.e10;
    const k = OMEGA * OMEGA;
    const c = 2 * ZETA * OMEGA;
    let moving = false;

    for (let e = 0; e < this.state.length; e += 1) {
      const pts = this.state[e].pts;
      const vel = this.state[e].vel;
      const want = target[e];
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const v = vel[i];
        const wx = want[i][0];
        const wy = want[i][1];
        // 半隐式欧拉：先更新速度再更新位置
        v[0] += (k * (wx - p[0]) - c * v[0]) * dt;
        v[1] += (k * (wy - p[1]) - c * v[1]) * dt;
        p[0] += v[0] * dt;
        p[1] += v[1] * dt;
        if (!moving && (Math.abs(p[0] - wx) > 0.02 || Math.abs(p[1] - wy) > 0.02)) moving = true;
      }
    }
    return moving;
  }

  /** 每帧只写一次 d；子步之间不做 DOM 写入。 */
  paintEyes() {
    for (let e = 0; e < this.paths.length; e += 1) {
      const d = toPath(this.state[e].pts);
      if (d !== this.painted.d[e]) {
        this.painted.d[e] = d;
        this.paths[e].setAttribute('d', d);
      }
    }
  }

  /** 视线与眨眼：量化后写属性，静止时一个字节都不写。 */
  flush(force) {
    if (!this.svg || !this.group) return;
    const gx = Math.round(this.gazeX * 20) / 20;
    const gy = Math.round(this.gazeY * 20) / 20;
    const gaze = gx + ' ' + gy;
    if (force || gaze !== this.painted.gaze) {
      this.painted.gaze = gaze;
      this.group.setAttribute('transform', 'translate(' + gaze + ')');
    }

    const open = Math.max(0, Math.min(1.08, this.open));
    for (let e = 0; e < this.paths.length; e += 1) {
      const o = Math.round(open * 100) / 100;
      const cy = Math.round(this.cy[e] * 100) / 100;
      // y' = o*y + cy*(1-o)：绕本眼重心压扁，闭眼时收成一条线而不是掉到底
      const blink = 'translate(0 ' + Math.round(cy * (1 - o) * 100) / 100 + ') scale(1 ' + o + ')';
      if (force || blink !== this.painted.blink[e]) {
        this.painted.blink[e] = blink;
        this.paths[e].setAttribute('transform', blink);
      }
    }
  }

  /** 重置到目标形状（球节点被替换、或从后台回来时用）。 */
  snap() {
    const target = EYE_RINGS[this.target] || EYE_RINGS.e10;
    this.state = target.map(function (side) { return { pts: cloneRing(side), vel: blankVel(side) }; });
    this.painted.d = ['', ''];
    for (let e = 0; e < this.paths.length; e += 1) {
      const d = toPath(this.state[e].pts);
      this.painted.d[e] = d;
      this.paths[e].setAttribute('d', d);
    }
    this.flush(true);
  }

  snapshot() {
    return {
      target: this.target,
      mounted: Boolean(this.svg && this.svg.isConnected),
      gazeX: +this.gazeX.toFixed(2),
      gazeY: +this.gazeY.toFixed(2),
      open: +this.open.toFixed(2),
    };
  }
}

/* 46px 小脸/小球要「看得出活着」，幅度按球的可见像素标定。 */
const MOODS = {
  calm: { breathPeriod: 4200, breathAmp: 0.028, dim: 1, droop: 0, follow: 1, bob: 1, antics: true, tilt: 0 },
  curious: { breathPeriod: 3400, breathAmp: 0.02, dim: 1.03, droop: 0, follow: 1.45, bob: 1.2, antics: false, tilt: 4 },
  excited: { breathPeriod: 1600, breathAmp: 0.04, dim: 1.07, droop: 0, follow: 0.8, bob: 1.6, antics: false, tilt: -2.5 },
  eager: { breathPeriod: 2600, breathAmp: 0.008, dim: 1.04, droop: 0, follow: 0.4, bob: 0, antics: false, tilt: 0 },
  sleepy: { breathPeriod: 6200, breathAmp: 0.016, dim: 0.9, droop: 1.2, follow: 0.45, bob: 1.4, antics: false, tilt: -3 },
  asleep: { breathPeriod: 8400, breathAmp: 0.01, dim: 0.82, droop: 1.6, follow: 0, bob: 0.8, antics: false, tilt: -4 },
};

const STANDBY_AFTER_MS = 60000;
const SLEEP_AFTER_MS = 180000;
const TILT_SMOOTH_MS = 140;
const CURIOUS_TILT = 0.22;
const CURIOUS_HOLD_MS = 220;
const CURIOUS_FORGET_MS = 1600;
const EXCITED_MS = 1400;
const ANTIC_MIN_MS = 4600;
const ANTIC_MAX_MS = 8400;
const ANTIC_ESCALATED_MIN_MS = 3200;
const ANTIC_ESCALATED_MAX_MS = 6200;

/* 「挣扎出液面」：三次往上挣，一次比一次更用力，最后一次收小。
   NEXLOS 任务栏是固定高度的胶囊（58px，球 46px），上抬幅度收在上下各 4px 余量内，
   否则会被 .os-tb-main 的 overflow 裁掉。 */
const EAGER_CYCLE_MS = 560;
const EAGER_CYCLES = 3;
const EAGER_RISE_PX = 11; // 与 NEXL orbLife 同值：冲出液面的幅度
const EAGER_MS = EAGER_CYCLE_MS * EAGER_CYCLES + 240;
const EAGER_COOLDOWN_MS = 3000;
const EAGER_REOPEN_DELAY_MS = 900;

/* 脸部：眨眼间隔与时长。 */
const BLINK_MIN_MS = 4200;
const BLINK_MAX_MS = 9000;
const BLINK_CLOSE_MS = 80;
const BLINK_HOLD_MS = 30;
const BLINK_OPEN_MS = 90;
const BLINK_TOTAL_MS = BLINK_CLOSE_MS + BLINK_HOLD_MS + BLINK_OPEN_MS;

/* 眼环池：平静时每 9–15s 换一组眼形。 */
const CALM_FACE_POOL = ['e10', 'e8', 'e1'];
const MOOD_FACE = {
  curious: 'e12s',
  excited: 'e2',
  eager: 'e11',
  sleepy: 'e13',
  asleep: 'e4',
};

/**
 * 小黄球的情绪层。
 * 身体姿态与体色写 CSS 变量；眼睛的 48 点弹簧只在真的形变时写 d。
 */
class OrbLife {
  constructor() {
    this.started = false;
    this.orb = null;
    this.orbCheckedAt = 0;
    this.reduce = false;

    this.raf = 0;
    this.lastFrameAt = 0;
    this.phase = 0;

    this.tiltX = 0;
    this.tiltY = 0;
    this.rawX = 0;
    this.rawY = 0;

    this.pointerX = 0;
    this.pointerY = 0;
    this.pointerAt = 0;
    this.pointerMeasureAt = 0;
    this.pointerNear = false;

    this.swayPending = false;
    this.lastInteractAt = 0;
    this.curiousSince = 0;
    this.curiousUntil = 0;
    this.excitedUntil = 0;
    this.antic = null;
    this.nextAnticAt = 0;
    this.anticCycles = 0;
    this.drawerOpen = false;
    this.drawerCheckedAt = 0;

    this.eagerStart = 0;
    this.eagerUntil = 0;
    this.pendingSignal = null;
    this.pendingAt = 0;

    this.vars = {};
    this.paintedMood = null;

    this.gazeX = 0;
    this.gazeY = 0;
    this.eyeOpen = 1;
    this.nextBlinkAt = 0;
    this.blinkStart = -1;
    this.blinkQueued = 0;
    this.poolIndex = 0;
    this.nextPoolAt = 0;
    this.paintedPool = null;

    this.moodTilt = 0;
    this.face = null;
    this.faceHost = null;

    this.tick = this.tickFn.bind(this);
  }

  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    this.reduce = reducedMotion();
    const now = performance.now();
    this.lastInteractAt = now;
    this.lastFrameAt = now;
    this.nextPoolAt = now + randomBetween(9000, 15000);
    this.scheduleAntic(now, 0);
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.started = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** 桌面端没有陀螺仪：光标靠近球时把它当作「注意力」，离开后缓慢回正。 */
  setPointer(x, y) {
    this.pointerX = x;
    this.pointerY = y;
    this.pointerAt = performance.now();
  }

  /** 面板开合、点击等显式交互：重置 idle，唤醒球。 */
  notify(kind) {
    const now = performance.now();
    this.wake(now);
    if (kind === 'open') {
      this.drawerOpen = true;
      this.antic = null;
      this.endEager();
    } else if (kind === 'close') {
      this.drawerOpen = false;
      if (this.pendingSignal) this.pendingAt = now + EAGER_REOPEN_DELAY_MS;
    }
    if (kind === 'tap') this.anticCycles = 0;
  }

  /** 收到通知：球往上挣，试图钻出液面。 */
  signal() {
    if (this.reduce) return;
    const now = performance.now();
    if (this.drawerOpen) {
      this.pendingSignal = 'messages';
      return;
    }
    if (now < this.eagerUntil + EAGER_COOLDOWN_MS) {
      if (!this.pendingSignal) {
        this.pendingSignal = 'messages';
        this.pendingAt = Math.max(now + 240, this.eagerUntil + EAGER_REOPEN_DELAY_MS);
      }
      return;
    }
    this.startEager(now);
  }

  isEager(now) {
    return now < this.eagerUntil;
  }

  startEager(now) {
    this.eagerStart = now;
    this.eagerUntil = now + EAGER_MS;
    this.lastInteractAt = now;
    this.antic = null;
  }

  endEager() {
    this.eagerStart = 0;
    this.eagerUntil = 0;
  }

  /**
   * 单次挣扎的位移与形变：
   * 0–.16 蓄力下沉 → .16–.4 冲出液面 → .4–.52 悬停
   * → .52–.76 回落并落地挤压 → .76–1 回稳。
   */
  eagerPose(elapsed) {
    const total = EAGER_CYCLE_MS * EAGER_CYCLES;
    if (elapsed >= total) {
      const u = clamp((elapsed - total) / 240, 0, 1);
      return { dy: 1.4 * (1 - u), sy: 0.94 + 0.06 * u, sx: 1.02 - 0.02 * u };
    }
    const cycle = elapsed / EAGER_CYCLE_MS;
    const index = Math.min(EAGER_CYCLES - 1, Math.floor(cycle));
    const peak = EAGER_RISE_PX * ([0.72, 1, 0.82][index] || 0.82);
    const t = cycle - Math.floor(cycle);
    let dy = 0;
    let sy = 1;
    let sx = 1;
    if (t < 0.16) {
      const u = t / 0.16;
      dy = 2.4 * u;
      sy = 1 - 0.05 * u;
      sx = 1 + 0.03 * u;
    } else if (t < 0.4) {
      const u = (t - 0.16) / 0.24;
      const e = 1 - Math.pow(1 - u, 3);
      dy = 2.4 - (peak + 2.4) * e;
      sy = 0.95 + 0.11 * e;
      sx = 1.03 - 0.06 * e;
    } else if (t < 0.52) {
      const u = (t - 0.4) / 0.12;
      dy = -peak + 0.8 * u;
      sy = 1.06;
      sx = 0.97;
    } else if (t < 0.76) {
      const u = (t - 0.52) / 0.24;
      const e = u * u;
      dy = (-peak + 0.8) + (peak - 0.8 + 1.4) * e;
      sy = 1.06 - 0.12 * e;
      sx = 0.97 + 0.05 * e;
    } else {
      const u = (t - 0.76) / 0.24;
      dy = 1.4 * (1 - u);
      sy = 0.94 + 0.06 * u;
      sx = 1.02 - 0.02 * u;
    }
    return { dy: dy, sy: sy, sx: sx };
  }

  snapshot() {
    return {
      mood: this.resolveMood(performance.now()),
      tiltX: +this.tiltX.toFixed(3),
      tiltY: +this.tiltY.toFixed(3),
      open: this.drawerOpen,
      eager: this.isEager(performance.now()),
      pending: this.pendingSignal,
      gazeX: +this.gazeX.toFixed(2),
      gazeY: +this.gazeY.toFixed(2),
      eyeOpen: +this.eyeOpen.toFixed(2),
      face: this.face ? this.face.snapshot() : null,
      antic: this.antic ? this.antic.kind : null,
    };
  }

  wake(now) {
    const wasIdle = now - this.lastInteractAt > 1500;
    this.lastInteractAt = now;
    this.anticCycles = 0;
    if (wasIdle) {
      this.blinkQueued = 1;
      this.nextBlinkAt = now + 120;
      if (!this.antic) {
        this.antic = { kind: 'nod', start: now, duration: 900, dir: this.rawX >= 0 ? 1 : -1, strength: 1 };
      }
    }
    const mood = this.resolveMood(now);
    if (mood === 'asleep' || mood === 'sleepy') this.curiousUntil = now + 900;
  }

  /** 视线与眨眼：每帧算 gazeX/gazeY/eyeOpen，交给 OrbFace 写进 SVG。 */
  updateFace(now, mood, eager, glanceX) {
    if (mood === 'asleep') {
      this.gazeX = 0;
      this.gazeY = 1.2;
    } else if (mood === 'sleepy') {
      this.gazeX = clamp(this.tiltX * 0.8, -0.8, 0.8);
      this.gazeY = clamp(this.tiltY * 0.6, -0.6, 0.6) + 0.8;
    } else if (eager) {
      this.gazeX = clamp(this.tiltX * 1.2, -1.4, 1.4);
      this.gazeY = -1.6;
    } else if (mood === 'curious') {
      this.gazeX = clamp(this.tiltX * 2.4, -2.2, 2.2);
      this.gazeY = clamp(this.tiltY * 1.8, -1.6, 1.6);
    } else if (this.drawerOpen) {
      this.gazeX = clamp(this.tiltX * 0.8, -0.8, 0.8);
      this.gazeY = -1;
    } else {
      this.gazeX = clamp(this.tiltX * 1.6, -1.8, 1.8);
      this.gazeY = clamp(this.tiltY * 1.2, -1.4, 1.4);
    }
    if (glanceX) this.gazeX = clamp(this.gazeX + glanceX, -2.6, 2.6);

    if (mood === 'calm' && now >= this.nextPoolAt) {
      this.poolIndex = (this.poolIndex + 1) % 3;
      this.nextPoolAt = now + randomBetween(9000, 15000);
    }
    if (this.orb && this.paintedPool !== this.poolIndex) {
      this.paintedPool = this.poolIndex;
      this.orb.dataset.orbPool = String(this.poolIndex);
    }

    if (!this.nextBlinkAt) {
      this.nextBlinkAt = now + randomBetween(BLINK_MIN_MS, BLINK_MAX_MS);
    }
    if (this.blinkStart < 0 && now >= this.nextBlinkAt) this.blinkStart = now;
    if (this.blinkStart < 0) return;

    const t = now - this.blinkStart;
    if (t >= BLINK_TOTAL_MS) {
      this.blinkStart = -1;
      this.eyeOpen = 1;
      if (this.blinkQueued > 0) {
        this.blinkQueued -= 1;
        this.nextBlinkAt = now + 150;
      } else {
        this.nextBlinkAt = now + randomBetween(BLINK_MIN_MS, BLINK_MAX_MS);
      }
      return;
    }
    if (t < BLINK_CLOSE_MS) {
      this.eyeOpen = 1 - t / BLINK_CLOSE_MS;
    } else if (t < BLINK_CLOSE_MS + BLINK_HOLD_MS) {
      this.eyeOpen = 0.06;
    } else {
      const u = (t - BLINK_CLOSE_MS - BLINK_HOLD_MS) / BLINK_OPEN_MS;
      const ease = 1 - Math.pow(1 - u, 2);
      this.eyeOpen = 0.06 + 0.94 * ease + 0.07 * Math.sin(Math.PI * u);
    }
  }

  /** 当前情绪对应的眼环：只挑数据里的表情，不新增图形元素。 */
  faceKey() {
    const mood = this.paintedMood || 'calm';
    const fixed = MOOD_FACE[mood];
    if (fixed) return fixed;
    if (this.drawerOpen) return 'e10';
    return CALM_FACE_POOL[this.poolIndex] || 'e10';
  }

  /** 挂载/同步/推进眼睛。DOM 重渲染会换掉 .os-orb-face，这里靠 isConnected 自愈。 */
  syncFace(dt) {
    const orb = this.orb;
    if (!orb) return;
    let host = this.faceHost;
    if (!host || !host.isConnected) {
      host = orb.querySelector('.os-orb-face');
      if (!host) return;
      this.faceHost = host;
      if (!this.face) this.face = new OrbFace();
      this.face.mount(host);
      this.face.setExpression(this.faceKey());
      this.face.setGaze(this.gazeX, this.gazeY);
      this.face.setBlink(this.eyeOpen);
      this.face.snap();
    }
    const face = this.face;
    if (!face) return;
    face.setExpression(this.faceKey());
    face.setGaze(this.gazeX, this.gazeY);
    face.setBlink(this.eyeOpen);
    face.step(dt);
  }

  resolveMood(now) {
    const idleFor = now - this.lastInteractAt;
    if (now < this.eagerUntil) return 'eager';
    if (idleFor >= SLEEP_AFTER_MS) return 'asleep';
    if (idleFor >= STANDBY_AFTER_MS) return 'sleepy';
    if (now < this.excitedUntil) return 'excited';
    if (now < this.curiousUntil) return 'curious';
    return 'calm';
  }

  scheduleAntic(now, cycles) {
    const escalated = cycles >= 2;
    this.nextAnticAt = now + (escalated
      ? randomBetween(ANTIC_ESCALATED_MIN_MS, ANTIC_ESCALATED_MAX_MS)
      : randomBetween(ANTIC_MIN_MS, ANTIC_MAX_MS));
  }

  tickFn(now) {
    if (!this.started) return;
    this.raf = requestAnimationFrame(this.tick);
    if (document.visibilityState === 'hidden') {
      this.lastFrameAt = now;
      return;
    }
    // window2026由另一位工程师接管：球不参与渲染，rAF 保留以便切回现代主题时立刻复活。
    if (document.documentElement.getAttribute('data-appearance') === 'win98') {
      this.lastFrameAt = now;
      return;
    }

    const dt = clamp(now - this.lastFrameAt, 0, 64);
    this.lastFrameAt = now;
    if (this.reduce) {
      this.phase += (dt / 6200) * Math.PI * 2;
      this.moodTilt += (0 - this.moodTilt) * (1 - Math.exp(-dt / 220));
      const breath = Math.sin(this.phase) * 0.012;
      this.updateFace(now, 'calm', false, 0);
      this.paint(0, 0, 0, 1 - breath * 0.55, 1 + breath, 0, 0, 1 + breath * 1.2, 'calm');
      this.currentOrb(now);
      this.syncFace(dt);
      return;
    }

    const orb = this.currentOrb(now);
    if (!orb) return;

    // 自愈：面板状态可能被别的路径直接重置，未必经过 setOpen。
    if (now - this.drawerCheckedAt > 400) {
      this.drawerCheckedAt = now;
      const openNow = !!document.querySelector('.os-tb-start.is-launcher-open');
      if (openNow !== this.drawerOpen) {
        this.drawerOpen = openNow;
        if (openNow) this.endEager();
        else if (this.pendingSignal) this.pendingAt = now + EAGER_REOPEN_DELAY_MS;
      }
    }

    if (this.pendingSignal && !this.drawerOpen && now >= this.pendingAt) {
      this.pendingSignal = null;
      this.startEager(now);
    }
    const eager = now < this.eagerUntil;
    const eagerPose = eager ? this.eagerPose(now - this.eagerStart) : { dy: 0, sy: 1, sx: 1 };

    /* 光标当作桌面端的「重力」：只在球周围 220px 内生效，
       离开后 650ms 时间常数回正，球不会一直歪着。 */
    if (this.pointerAt && now - this.pointerAt < 1500) {
      if (now - this.pointerMeasureAt > 120) {
        this.pointerMeasureAt = now;
        const rect = orb.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const pdx = this.pointerX - cx;
        const pdy = this.pointerY - cy;
        if (pdx * pdx + pdy * pdy <= 220 * 220) {
          this.rawX = clamp(pdx / 150, -1, 1);
          this.rawY = clamp(pdy / 150, -1, 1);
          this.pointerNear = true;
          if (Math.max(Math.abs(this.rawX), Math.abs(this.rawY)) >= CURIOUS_TILT) this.wake(now);
        } else {
          this.pointerNear = false;
        }
      }
    } else {
      this.pointerNear = false;
    }
    if (!this.pointerNear) {
      const decay = 1 - Math.exp(-dt / 650);
      this.rawX += (0 - this.rawX) * decay;
      this.rawY += (0 - this.rawY) * decay;
    }

    // 好奇：光标停在球附近（倾斜 0.22）持续 220ms 就算「在看」，离开 1.6s 后回到平静。
    const tilt = Math.max(Math.abs(this.rawX), Math.abs(this.rawY));
    if (tilt >= CURIOUS_TILT) {
      if (!this.curiousSince) this.curiousSince = now;
      if (now - this.curiousSince >= CURIOUS_HOLD_MS) {
        if (now >= this.curiousUntil) this.swayPending = true;
        this.curiousUntil = now + CURIOUS_FORGET_MS;
      }
    } else if (tilt < CURIOUS_TILT * 0.45) {
      this.curiousSince = 0;
      if (now > this.curiousUntil) this.curiousUntil = 0;
    }

    const mood = this.resolveMood(now);
    const profile = MOODS[mood];

    // 待机小动作：探头、歪头、扫视、点头、轻摇头。
    if (profile.antics && !this.drawerOpen && !this.antic && now >= this.nextAnticAt) {
      const roll = Math.random();
      const dir = Math.random() < 0.5 ? -1 : 1;
      if (roll < 0.34) {
        this.antic = { kind: 'peek', start: now, duration: randomBetween(900, 1300), dir: dir };
      } else if (roll < 0.56) {
        this.antic = { kind: 'sway', start: now, duration: randomBetween(900, 1300), dir: dir };
      } else if (roll < 0.74) {
        this.antic = { kind: 'glance', start: now, duration: randomBetween(900, 1300), dir: dir };
      } else if (roll < 0.9) {
        this.antic = { kind: 'nod', start: now, duration: randomBetween(950, 1250), dir: dir, strength: 0.85 };
      } else {
        this.antic = { kind: 'shake', start: now, duration: randomBetween(1000, 1300), dir: dir, strength: 0.5 };
      }
      this.anticCycles += 1;
    }
    if (this.swayPending && !this.antic) {
      this.swayPending = false;
      this.antic = { kind: 'sway', start: now, duration: 950, dir: this.rawX >= 0 ? 1 : -1 };
    }
    let anticDy = 0;
    let anticDx = 0;
    let anticRot = 0;
    let anticGazeX = 0;
    if (this.antic) {
      const progress = (now - this.antic.start) / this.antic.duration;
      if (progress >= 1) {
        this.antic = null;
        this.scheduleAntic(now, this.anticCycles);
      } else {
        const envelope = Math.sin(Math.PI * clamp(progress, 0, 1));
        const dir = this.antic.dir;
        const strength = this.antic.strength || 1;
        if (this.antic.kind === 'peek') {
          anticDy = -4.4 * envelope;
          anticRot = 3.4 * envelope;
        } else if (this.antic.kind === 'sway') {
          anticDx = dir * 3.2 * envelope;
          anticRot = dir * 6 * envelope;
        } else if (this.antic.kind === 'nod') {
          const beat = Math.sin(progress * Math.PI * 4);
          anticDy = -3.4 * strength * envelope * beat;
          anticRot = 1.2 * strength * envelope * beat;
        } else if (this.antic.kind === 'shake') {
          const swing = Math.sin(progress * Math.PI * 6);
          anticRot = dir * 12 * strength * envelope * swing;
          anticDx = dir * 2.4 * strength * envelope * swing;
        } else {
          anticGazeX = dir * 2.4 * envelope;
          anticRot = dir * 1.8 * envelope;
        }
      }
    }

    const k = 1 - Math.exp(-dt / TILT_SMOOTH_MS);
    this.tiltX += (clamp(this.rawX, -1, 1) - this.tiltX) * k;
    this.tiltY += (clamp(this.rawY, -1, 1) - this.tiltY) * k;

    this.phase += (dt / profile.breathPeriod) * Math.PI * 2;
    const breath = Math.sin(this.phase) * profile.breathAmp;

    // 面板打开时球被「占用」，只保留呼吸，不做邀约动作。
    const follow = this.drawerOpen ? profile.follow * 0.35 : profile.follow;
    const bob = Math.sin(this.phase * 0.5 + 0.9) * profile.bob;
    const dx = this.tiltX * 2.6 * follow + anticDx;
    let dy = this.tiltY * 2.8 * follow + profile.droop + anticDy + bob;
    this.moodTilt += (profile.tilt - this.moodTilt) * (1 - Math.exp(-dt / 220));
    const rot = this.tiltX * 8 * follow + anticRot + this.moodTilt;
    let scaleY = 1 + breath;
    let scaleX = 1 - breath * 0.55; // 体积守恒，挤压才像液体
    const glossX = this.tiltX * 7;
    const glossY = this.tiltY * 5.5;
    const bright = profile.dim * (1 + breath * 1.4);

    if (eager) {
      dy += eagerPose.dy;
      scaleY *= eagerPose.sy;
      scaleX *= eagerPose.sx;
    }

    /* 单向依赖：球的位置从胶囊几何算出来，胶囊不回读球的姿态。
       球浮、挣扎、呼吸都只改它自己的 transform，任务栏保持静止。 */
    this.updateFace(now, mood, eager, anticGazeX);
    this.paint(dx, dy, rot, scaleX, scaleY, glossX, glossY, bright, mood);
    this.syncFace(dt);
  }

  currentOrb(now) {
    if (this.orb && this.orb.isConnected) return this.orb;
    if (now - this.orbCheckedAt < 400) return null;
    this.orbCheckedAt = now;
    const next = document.querySelector('.os-tb-start .os-orb');
    if (next !== this.orb) {
      // 重渲染后的新节点没有内联变量，签名要作废，否则会被误判成「已写过」
      this.vars = {};
      this.paintedMood = null;
      this.paintedPool = null;
      this.orb = next;
    }
    return next;
  }

  paint(dx, dy, rot, scaleX, scaleY, glossX, glossY, bright, mood) {
    const orb = this.orb;
    if (!orb) return;
    const next = {
      dx: [dx.toFixed(2), 'px'],
      dy: [dy.toFixed(2), 'px'],
      rot: [(Math.round(rot * 20) / 20).toFixed(2), 'deg'],
      sx: [scaleX.toFixed(3), ''],
      sy: [scaleY.toFixed(3), ''],
      gx: [(Math.round(glossX * 4) / 4).toFixed(2), 'px'],
      gy: [(Math.round(glossY * 4) / 4).toFixed(2), 'px'],
      bright: [(Math.round(bright * 50) / 50).toFixed(2), ''],
    };
    const keys = Object.keys(next);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = next[key][0];
      if (this.vars[key] === value) continue;
      this.vars[key] = value;
      orb.style.setProperty('--orb-' + key, value + next[key][1]);
    }
    if (this.paintedMood !== mood) {
      this.paintedMood = mood;
      orb.dataset.orbMood = mood;
    }
  }
}

/* ------------------------------------------------------------------ */
/* 交互：按压、橡皮筋拖拽、甩手回弹、开合动画                            */
/* ------------------------------------------------------------------ */

const ORB_TAP_PX = 10;
const ORB_DRAG_SOFT_PX = 26;
const ORB_DRAG_MAX_PX = 40;
const ORB_PULL_PX = 24;

const SNAPPY = { stiffness: 340, damping: 30, mass: 1 };

let orbPress = null;
let orbGrabX = 0;
let orbGrabY = 0;
/** 已经由抬手直接处理过的那一下；紧随其后的合成 click 要吞掉，否则一按两开。 */
let orbTapHandledAt = -1e9;
let orbGrabRelease = null;
/** 当前任务栏液面；抓球时把位移交给它，水面才有反作用力。 */
let orbLiquid = null;

function haptic(ms) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms);
  }
}

function clampFling(v) {
  return Math.max(-0.9, Math.min(0.9, v * 3));
}

function activeOrb() {
  if (orbPress && orbPress.el && orbPress.el.isConnected) return orbPress.el;
  return document.querySelector('.os-tb-start .os-orb');
}

/** 写球的抓取位移；位移为 0 时把变量撤掉，免得常驻一个 calc。 */
function setOrbGrab(x, y) {
  orbGrabX = x;
  orbGrabY = y;
  if (orbLiquid) orbLiquid.setTouch(x, y);
  const orb = activeOrb();
  if (!orb) return;
  if (x || y) {
    orb.style.setProperty('--orb-grab-x', x.toFixed(2) + 'px');
    orb.style.setProperty('--orb-grab-y', y.toFixed(2) + 'px');
  } else {
    orb.style.removeProperty('--orb-grab-x');
    orb.style.removeProperty('--orb-grab-y');
  }
}

/** 半隐式欧拉弹簧；返回取消函数。 */
function springXY(options) {
  const config = options.config || SNAPPY;
  const mass = Math.max(0.0001, config.mass);
  const stiffness = Math.max(0, config.stiffness);
  const damping = Math.max(0, config.damping);
  const fromX = options.fromX - options.toX;
  const fromY = options.fromY - options.toY;
  const vx = (options.velocityX || 0) * 1000;
  const vy = (options.velocityY || 0) * 1000;
  let x = options.fromX;
  let y = options.fromY;
  let velX = vx;
  let velY = vy;
  let raf = 0;
  let last = performance.now();
  let done = false;

  const step = function (now) {
    const dt = Math.min(Math.max(now - last, 0), 48) / 1000;
    last = now;
    // 解析解在小阻尼下比逐帧欧拉更稳，dt 波动不会改变轨迹
    const ax = -stiffness * (x - options.toX) - damping * velX;
    const ay = -stiffness * (y - options.toY) - damping * velY;
    velX += (ax / mass) * dt;
    velY += (ay / mass) * dt;
    x += velX * dt;
    y += velY * dt;
    options.onUpdate(x, y);
    if (Math.abs(x - options.toX) < 0.2 && Math.abs(y - options.toY) < 0.2
      && Math.abs(velX) < 4 && Math.abs(velY) < 4) {
      done = true;
      options.onUpdate(options.toX, options.toY);
      if (options.onComplete) options.onComplete();
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return function () {
    if (!done) {
      done = true;
      cancelAnimationFrame(raf);
    }
  };
}

function releaseOrbGrab(vx, vy) {
  if (orbGrabRelease) orbGrabRelease();
  orbGrabRelease = springXY({
    fromX: orbGrabX,
    fromY: orbGrabY,
    toX: 0,
    toY: 0,
    velocityX: vx,
    velocityY: vy,
    config: SNAPPY,
    onUpdate: setOrbGrab,
    onComplete: function () {
      orbGrabRelease = null;
      setOrbGrab(0, 0);
    },
  });
}

function beginOrbPress(el, event) {
  if (!event.isPrimary || event.button !== 0) return;
  endOrbPress(null);
  // 上一记回弹还没播完就再次按下：掐掉它，让这一下从压扁开始
  el.classList.remove('is-orb-kick');
  el.classList.add('is-pressing');
  if (orbLiquid) orbLiquid.stopSplash();
  if (orbGrabRelease) {
    orbGrabRelease();
    orbGrabRelease = null;
  }
  orbPress = {
    pointerId: event.pointerId,
    x0: event.clientX,
    y0: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    lastT: performance.now(),
    vx: 0,
    vy: 0,
    pulled: false,
    pulledTick: false,
    el: el,
  };
  try {
    el.setPointerCapture(event.pointerId);
  } catch (err) { /* 老内核不支持捕获时仍能靠 window 监听收尾 */ }
  haptic(8);
}

function moveOrbPress(event) {
  const press = orbPress;
  if (!press || press.pointerId !== event.pointerId) return;
  const now = performance.now();
  const dt = Math.max(8, now - press.lastT);
  press.vx = (event.clientX - press.lastX) / dt;
  press.vy = (event.clientY - press.lastY) / dt;
  press.lastX = event.clientX;
  press.lastY = event.clientY;
  press.lastT = now;

  const rawX = event.clientX - press.x0;
  const rawY = event.clientY - press.y0;
  const dist = Math.hypot(rawX, rawY);
  /* 橡皮筋：26px 内跟着手指 1:1，再往外每 1px 只走 .55px，
     到 44px 左右基本拽不动。 */
  const scale = dist <= ORB_DRAG_SOFT_PX
    ? 1
    : Math.min(ORB_DRAG_MAX_PX, ORB_DRAG_SOFT_PX + (dist - ORB_DRAG_SOFT_PX) * 0.55) / dist;
  const x = rawX * scale;
  const y = rawY * scale;
  setOrbGrab(x, y);
  if (dist > ORB_TAP_PX && press.pulled !== 'drag') {
    press.pulled = 'drag';
    press.el.classList.remove('is-pressing');
    haptic(4);
  }
  if (press.pulled === 'drag' && !press.pulledTick && Math.abs(y) >= ORB_PULL_PX) {
    press.pulledTick = true;
    haptic(12);
  }
}

/**
 * 结束手势。点 / 轻拽 / 甩手都收在同一件事上：开关全部应用面板。
 * 手势只决定球怎么离开原位——拽到哪里就从哪里弹回去，甩得多快就弹得多狠。
 */
function endOrbPress(event) {
  const press = orbPress;
  if (!press) return;
  if (event && press.pointerId !== event.pointerId) return;
  orbPress = null;
  press.el.classList.remove('is-pressing');
  try {
    press.el.releasePointerCapture(press.pointerId);
  } catch (err) { /* 指针已经释放 */ }

  if (!event || event.type !== 'pointerup') {
    releaseOrbGrab(0, 0);
    return;
  }
  const travelled = Math.hypot(event.clientX - press.x0, event.clientY - press.y0);
  // 只要这一次手势碰过球，浏览器随后补发的 click 都必须吞掉
  orbTapHandledAt = performance.now();
  haptic(travelled < ORB_TAP_PX ? 14 : 16);
  if (press.onToggle) press.onToggle();
  /* 反作用力：横向拽得越多，水面往反侧甩得越狠；甩手速度追加一截。
     先记下松手瞬间的横向位移，弹簧回位会立刻改写 orbGrabX。 */
  const dx = orbGrabX;
  releaseOrbGrab(clampFling(press.vx), clampFling(press.vy));
  if (orbLiquid) orbLiquid.playSplash(-dx * 0.45 - press.vx * 14);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', moveOrbPress, { passive: true });
  window.addEventListener('pointerup', endOrbPress, true);
  window.addEventListener('pointercancel', endOrbPress, true);
  window.addEventListener('pointermove', function (event) {
    startOrb.life.setPointer(event.clientX, event.clientY);
  }, { passive: true });
}

/* ------------------------------------------------------------------ */
/* 任务栏液面：闭合成水包、打开成凹口，抽屉底边沿同一条弧               */
/* ------------------------------------------------------------------ */

/** 与水包相关的基准尺寸取自 NEXL 46px 球；NEXLOS 窄屏 38px 球按同比缩放。 */
const LIQUID_REF_SIZE = 46;
const LIQUID_PAD_FALLBACK = 42;
/* 以下四个数逐个取自 Pixel 真机 NEXL 底栏（46px 球、54px 栏）：
   闭合态球心在栏顶下 9px，水包半径 29 = 球半径 +6，顶点高出球顶 6px，
   两侧从球轮廓后面露出来；打开态球心抬到栏顶上方 2px，球浮起 11px，
   凹口半径 32.5 = 球半径 + 9.5，与抽屉玻璃舌的弧平行。 */
const LIQUID_SINK = 9;
const LIQUID_POUCH_WRAP = 29;
const LIQUID_NOTCH_LIFT = 2;
const LIQUID_NOTCH_WRAP = 32.5;
const LIQUID_SHOULDER = 18;
const LIQUID_ANGLE = (50 * Math.PI) / 180;
const LIQUID_CORNER = 20;

function liquidNumber(value) {
  return Math.round(value * 100) / 100;
}

/** 球被横向滚出胶囊时退回普通圆角胶囊，不留一个没有球的鼓包。 */
function capsuleShape(width, height, top, corner) {
  const bottom = top + height;
  const n = liquidNumber;
  return [
    'M ' + n(corner) + ' ' + n(top),
    'L ' + n(width - corner) + ' ' + n(top),
    'A ' + n(corner) + ' ' + n(corner) + ' 0 0 1 ' + n(width) + ' ' + n(top + corner),
    'L ' + n(width) + ' ' + n(bottom - corner),
    'A ' + n(corner) + ' ' + n(corner) + ' 0 0 1 ' + n(width - corner) + ' ' + n(bottom),
    'L ' + n(corner) + ' ' + n(bottom),
    'A ' + n(corner) + ' ' + n(corner) + ' 0 0 1 0 ' + n(bottom - corner),
    'L 0 ' + n(top + corner),
    'A ' + n(corner) + ' ' + n(corner) + ' 0 0 1 ' + n(corner) + ' ' + n(top),
    'Z',
  ].join(' ');
}

/**
 * 一条路径描述整族水面：t=0 是闭合态的水包，t=1 是打开态的凹口。
 * 闭合态水面从栏顶「鼓起来」包住球的下缘，顶点被球挡住、两侧露出鼓包；
 * 打开态水面反过来「凹下去」给抽屉的玻璃舌让位。
 * 两种形态共用同一条圆弧，只插值圆弧的开口方向与弧心高度，看起来是同一片水在动。
 * 几何照抄 NEXL 真机源码 `navLiquidPath`：闭合半径 29、打开半径 32.5，
 * 开口高度线性穿过 0——水包先摊平成一条平边，再翻成凹口。
 */
function liquidShape(width, height, t, geo) {
  const top = geo.top;
  const bottom = top + height;
  const mid = width / 2;
  const corner = geo.corner || LIQUID_CORNER;
  const touch = geo.touch || { x: 0, y: 0, splash: 0 };
  const scale = geo.scale || 1;
  const closed = 1 - t;
  /* 水面的反作用力：手把球往左拽，水被推去右边；开口态按 t 衰减。
     幅度与钳位照抄 NEXL navLiquidPath：±6px、横向系数 0.12。 */
  const tilt = clamp(-touch.x * 0.12 + touch.splash, -6, 6) * (1 - t * 0.55);
  const slope = function (x) { return (-tilt * (x - mid)) / mid; };
  const topAt = function (x) { return top + slope(x); };
  const cx = geo.cx + touch.x * 0.4 * closed;
  const n = liquidNumber;

  /* 往下按：球压进水里，包角变宽兜住它；往上拎：水面拉起一根颈追球，包角收窄。
     只改包角，不改半径——半径一旦超过球，水包顶点就会从球顶露出来变成圆顶。 */
  const swell = clamp(touch.y * 0.22, -3.5, 4.5) * closed;
  const neck = clamp(-touch.y * 0.5, 0, 11) * closed;
  const angle = clamp(50 + swell * 2.2 - neck, 36, 62) * (Math.PI / 180);

  /* 弧心就是球心：闭合在栏顶下 9px，打开抬到栏顶上方 2px，跟球的 top 同一帧走。 */
  const ballY = geo.ballY == null ? top + geo.sink : geo.ballY;
  const cy = ballY - (geo.sink + LIQUID_NOTCH_LIFT * scale) * t;
  /* 开口相对圆心：闭合 −29（圆心上方的水包），打开 +32.5（圆心下方的凹口）。
     线性插值会经过 0，水面在那里摊平成一条平边再翻向，是同一片水在动。 */
  const pouch = (LIQUID_POUCH_WRAP + swell + neck) * scale;
  const notchWrap = LIQUID_NOTCH_WRAP * scale;
  const lift = -pouch + (pouch + notchWrap) * t;
  const wrap = Math.abs(lift);
  const dir = lift >= 0 ? 1 : -1;
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  const ex = wrap * sinA;
  const ey = cy + dir * wrap * cosA;
  const poleY = cy + dir * wrap;
  const k = (4 / 3) * Math.tan(angle / 4) * wrap;

  const shoulder = geo.shoulder || LIQUID_SHOULDER * scale;
  const eLx = Math.max(corner + 1, cx - ex);
  const eRx = Math.min(width - corner - 1, cx + ex);
  const sL = Math.max(2, Math.min(shoulder, eLx - corner));
  const sR = Math.max(2, Math.min(shoulder, width - corner - eRx));
  const yLeftEnd = topAt(eLx - sL);
  const yRightEnd = topAt(eRx + sR);
  const yLeftCorner = topAt(0);
  const yRightCorner = topAt(width);
  const tx = cosA;
  const tyL = dir * sinA;
  const cL = sL * 0.62;
  const cR = sR * 0.62;

  return [
    'M ' + n(corner) + ' ' + n(topAt(corner)),
    'L ' + n(eLx - sL) + ' ' + n(yLeftEnd),
    /* 平边 → 圆弧：两端切线对齐，接缝不出现折角。 */
    'C ' + n(eLx - sL + sL * 0.62) + ' ' + n(yLeftEnd) + ' '
      + n(eLx - tx * cL) + ' ' + n(ey - tyL * cL) + ' '
      + n(eLx) + ' ' + n(ey),
    /* 左半圆弧：等曲率，贴着球走。 */
    'C ' + n(eLx + tx * k) + ' ' + n(ey + tyL * k) + ' '
      + n(cx - k) + ' ' + n(poleY) + ' ' + n(cx) + ' ' + n(poleY),
    'C ' + n(cx + k) + ' ' + n(poleY) + ' '
      + n(eRx - tx * k) + ' ' + n(ey + tyL * k) + ' ' + n(eRx) + ' ' + n(ey),
    'C ' + n(eRx + tx * cR) + ' ' + n(ey - tyL * cR) + ' '
      + n(eRx + sR - sR * 0.62) + ' ' + n(yRightEnd) + ' '
      + n(eRx + sR) + ' ' + n(yRightEnd),
    'L ' + n(width - corner) + ' ' + n(topAt(width - corner)),
    'A ' + n(corner) + ' ' + n(corner) + ' 0 0 1 ' + n(width) + ' ' + n(yRightCorner + corner),
    'L ' + n(width) + ' ' + n(bottom - corner),
    'A ' + n(corner) + ' ' + n(corner) + ' 0 0 1 ' + n(width - corner) + ' ' + n(bottom),
    'L ' + n(corner) + ' ' + n(bottom),
    'A ' + n(corner) + ' ' + n(corner) + ' 0 0 1 0 ' + n(bottom - corner),
    'L 0 ' + n(yLeftCorner + corner),
    'A ' + n(corner) + ' ' + n(corner) + ' 0 0 1 ' + n(corner) + ' ' + n(topAt(corner)),
    'Z',
  ].join(' ');
}

/**
 * 抽屉底边：平底中段向下长出与凹口同弧的玻璃舌，向上平移固定间距。
 * 两条弧平行，缝隙全程等宽；底边不再围着球单独画第二个圆。
 */
function tongueShape(width, cx, wrap, lift, shoulder) {
  const angle = LIQUID_ANGLE;
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  const ex = wrap * sinA;
  const dE = wrap * cosA - lift;
  const dP = wrap - lift;
  const k = (4 / 3) * Math.tan(angle / 4) * wrap;
  const S = shoulder;
  const n = liquidNumber;
  const base = 2;
  return [
    'M 0 ' + base,
    'L ' + n(cx - ex - S) + ' ' + base,
    'C ' + n(cx - ex - S * 0.38) + ' ' + base + ' '
      + n(cx - ex - cosA * S * 0.62) + ' ' + n(base + dE - sinA * S * 0.62) + ' '
      + n(cx - ex) + ' ' + n(base + dE),
    'C ' + n(cx - ex + cosA * k) + ' ' + n(base + dE + sinA * k) + ' '
      + n(cx - k) + ' ' + n(base + dP) + ' ' + n(cx) + ' ' + n(base + dP),
    'C ' + n(cx + k) + ' ' + n(base + dP) + ' '
      + n(cx + ex - cosA * k) + ' ' + n(base + dE + sinA * k) + ' '
      + n(cx + ex) + ' ' + n(base + dE),
    'C ' + n(cx + ex + cosA * S * 0.62) + ' ' + n(base + dE - sinA * S * 0.62) + ' '
      + n(cx + ex + S * 0.38) + ' ' + base + ' ' + n(cx + ex + S) + ' ' + base,
    'L ' + n(width) + ' ' + base,
  ].join(' ');
}

function svgElement(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      if (attrs[key] == null || attrs[key] === false) continue;
      el.setAttribute(key, attrs[key] === true ? '' : attrs[key]);
    }
  }
  return el;
}

/** 任务栏液面 + 开始面板底边：几何、开合驱动、拖拽反作用力都在这里。 */
class TaskbarLiquid {
  constructor(taskbar, panel) {
    this.taskbar = taskbar;
    this.panel = panel;
    this.main = null;
    this.btn = null;
    this.orb = null;
    this.halo = null;
    this.svg = null;
    this.paths = [];
    this.tongue = null;
    this.tonguePaths = [];
    this.tongueGeo = null;
    this.metrics = null;
    this.t = 0;
    this.touch = { x: 0, y: 0, splash: 0 };
    this.splash = 0;
    this.splashRaf = 0;
    this.orbVisible = true;
    this.raf = 0;
    this.touchRaf = 0;
    this.scrollRaf = 0;
    this.observer = null;
    this.resizeObserver = null;
    this.settleTimer = 0;
    this.onResize = this.handleResize.bind(this);
    this.onScroll = this.handleScroll.bind(this);
    this.osEl = null;
    this.onOsSettle = null;
  }

  build() {
    if (!this.taskbar) return;
    if (this.halo && this.halo.parentNode) this.halo.parentNode.removeChild(this.halo);
    if (this.svg && this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
    this.halo = document.createElement('div');
    this.halo.className = 'os-tb-halo';
    this.halo.setAttribute('aria-hidden', 'true');

    const svg = svgElement('svg', {
      class: 'os-tb-liquid',
      'aria-hidden': 'true',
      focusable: 'false',
      preserveAspectRatio: 'none',
    });
    const defs = svgElement('defs');
    const sheen = svgElement('linearGradient', {
      id: 'nexlos-liquid-sheen', x1: '0', y1: '0', x2: '0', y2: '1',
    });
    const sheenStops = [
      ['0', 'var(--nx-sheen-0)'],
      ['0.34', 'var(--nx-sheen-1)'],
      ['0.62', 'var(--nx-sheen-2)'],
      ['1', 'var(--nx-sheen-3)'],
    ];
    for (const stop of sheenStops) {
      sheen.append(svgElement('stop', { offset: stop[0], 'stop-color': stop[1] }));
    }
    const glow = svgElement('radialGradient', {
      id: 'nexlos-liquid-glow', cx: '9%', cy: '-10%', r: '70%',
    });
    glow.append(svgElement('stop', { offset: '0', 'stop-color': 'var(--nx-glow-0)' }));
    glow.append(svgElement('stop', { offset: '1', 'stop-color': 'var(--nx-glow-1)' }));
    defs.append(sheen, glow);
    svg.append(defs);

    this.paths = [];
    const addPath = (cls) => {
      const path = svgElement('path', { class: cls });
      svg.append(path);
      this.paths.push(path);
      return path;
    };
    addPath('os-tb-liquid-tint');
    addPath('os-tb-liquid-glow');
    addPath('os-tb-liquid-sheen');
    addPath('os-tb-liquid-line');
    this.svg = svg;

    if (this.panel) {
      const old = this.panel.querySelector('.os-start-tongue');
      if (old) old.parentNode.removeChild(old);
      const tongue = svgElement('svg', {
        class: 'os-start-tongue',
        'aria-hidden': 'true',
        focusable: 'false',
        preserveAspectRatio: 'none',
      });
      this.tonguePaths = [];
      for (const cls of ['os-start-tongue-base', 'os-start-tongue-foot', 'os-start-tongue-line']) {
        const path = svgElement('path', { class: cls });
        tongue.append(path);
        this.tonguePaths.push(path);
      }
      this.panel.insertBefore(tongue, this.panel.firstChild);
      this.panel.classList.add('has-orb-tongue');
      this.tongue = tongue;
    }

    this.taskbar.insertBefore(this.halo, this.taskbar.firstChild);
    this.taskbar.insertBefore(this.svg, this.halo.nextSibling);
  }

  attach(main, btn, orb) {
    if (this.main && this.main !== main) {
      this.main.removeEventListener('scroll', this.onScroll);
    }
    this.main = main;
    this.btn = btn;
    this.orb = orb;
    if (this.svg && this.svg.parentNode !== this.taskbar) this.build();
    if (!this.svg) this.build();
    main.classList.add('has-orb-liquid');
    main.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize);
    /* 开机遮罩把 .os 整体缩到 1.04 再放大回来；过渡结束才是最终几何。
       不补这一次测量，缓存里会留下被放大的胶囊尺寸。 */
    if (!this.osEl) {
      this.osEl = document.querySelector('.os');
      if (this.osEl && typeof this.osEl.addEventListener === 'function') {
        this.onOsSettle = () => {
          if (!this.main || !this.main.isConnected) return;
          this.metrics = null;
          this.sync(true);
        };
        this.osEl.addEventListener('transitionend', this.onOsSettle);
      }
    }
    if (!this.observer && typeof MutationObserver === 'function') {
      this.observer = new MutationObserver(() => {
        this.metrics = null;
        this.sync(true);
      });
      this.observer.observe(document.documentElement, {
        attributes: true, attributeFilter: ['data-appearance'],
      });
    }
    /* 胶囊宽度会随运行中的应用增减、断点切换而变；ResizeObserver 比 resize 事件准。 */
    if (typeof ResizeObserver === 'function') {
      if (!this.resizeObserver) {
        this.resizeObserver = new ResizeObserver(() => {
          this.metrics = null;
          this.sync(true);
        });
      }
      this.resizeObserver.disconnect();
      this.resizeObserver.observe(main);
    }
    this.metrics = null;
    this.sync(true);
    /* 首次挂载时媒体查询与 flex 宽度可能还在落位：两帧后再量一次，
       之后窗口 resize 会正常接管。 */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.main || !this.main.isConnected) return;
        this.metrics = null;
        this.sync(true);
      });
    });
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      if (!this.main || !this.main.isConnected) return;
      this.metrics = null;
      this.sync(true);
    }, 220);
  }

  destroy() {
    if (this.main) this.main.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    if (this.osEl && this.onOsSettle) this.osEl.removeEventListener('transitionend', this.onOsSettle);
    this.osEl = null;
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
    window.clearTimeout(this.settleTimer);
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.touchRaf) cancelAnimationFrame(this.touchRaf);
    if (this.scrollRaf) cancelAnimationFrame(this.scrollRaf);
    if (this.splashRaf) cancelAnimationFrame(this.splashRaf);
    this.raf = 0; this.touchRaf = 0; this.scrollRaf = 0; this.splashRaf = 0;
    this.splash = 0;
    if (this.halo && this.halo.parentNode) this.halo.parentNode.removeChild(this.halo);
    if (this.svg && this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
    if (this.tongue && this.tongue.parentNode) this.tongue.parentNode.removeChild(this.tongue);
    this.halo = null; this.svg = null; this.tongue = null; this.tongueGeo = null;
  }

  measure() {
    if (!this.main || !this.btn || !this.main.isConnected) return false;
    const orb = this.orb && this.orb.isConnected ? this.orb : null;
    const orbSize = orb ? orb.offsetWidth : LIQUID_REF_SIZE;
    if (!orbSize) return false;
    const scale = orbSize / LIQUID_REF_SIZE;
    /* 胶囊的尺寸只由 CSS 决定，这里只读不回写。
       以前会把算出来的 --os-liquid-pad 写回胶囊，那一写会改布局，
       任务栏被 ResizeObserver 再量一次，于是球动一下、任务栏也跟着挪一点。 */
    const width = this.main.offsetWidth;
    const layoutH = this.main.offsetHeight;
    if (!width || !layoutH) return false;
    const cs = getComputedStyle(this.main);
    const padNow = parseFloat(cs.paddingTop) || LIQUID_PAD_FALLBACK;
    const capsuleH = layoutH - padNow;
    if (capsuleH <= 0) return false;
    const sink = LIQUID_SINK * scale;
    const notchLift = LIQUID_NOTCH_LIFT * scale;
    /* 凹口半径 32.5：比球大 9.5px，抽屉的玻璃舌正好落在球和水面之间那道缝里。 */
    const notch = LIQUID_NOTCH_WRAP * scale;
    const pouch = LIQUID_POUCH_WRAP * scale;
    const shoulder = LIQUID_SHOULDER * scale;
    /* 球心相对胶囊：闭合在顶下 sink，打开在顶上方 LIQUID_NOTCH_LIFT。
       CSS 的 top 是球心位（再靠 margin-top 拉回半径），两处用同一组变量。 */
    const liftClosed = capsuleH / 2 - sink;
    const liftOpen = capsuleH / 2 + notchLift;
    if (orb) {
      orb.style.setProperty('--os-orb-lift-closed', liftClosed.toFixed(2) + 'px');
      orb.style.setProperty('--os-orb-lift-open', liftOpen.toFixed(2) + 'px');
    }
    const corner = parseFloat(cs.borderTopLeftRadius) || LIQUID_CORNER;
    const cxRaw = this.ballCenterX();
    const cx = clamp(cxRaw, corner + 6, width - corner - 6);
    this.orbVisible = cxRaw > corner + 4 && cxRaw < width - corner - 4
      && this.btn.offsetWidth > 0 && this.btn.offsetHeight > 0;
    this.metrics = {
      width: width,
      height: capsuleH,
      top: padNow,
      totalH: padNow + capsuleH,
      /* 全都用布局偏移量：没有 rect、没有 transform、也没有一帧延迟。
         偏移量相对任务栏的 padding 盒，和 .os-tb-liquid 的绝对定位同一坐标原点。 */
      left: this.main.offsetLeft,
      y: this.main.offsetTop,
      cx: cx,
      sink: sink,
      ballY: padNow + sink,
      pouch: pouch,
      notch: notch,
      notchLift: notchLift,
      shoulder: shoulder,
      scale: scale,
      corner: corner,
    };
    this.position();
    return true;
  }

  /** 球心在胶囊里的横向位置：只用布局值，不跟 rect/变换走。 */
  ballCenterX() {
    const border = parseFloat(getComputedStyle(this.main).borderLeftWidth) || 0;
    return border + this.btn.offsetLeft + this.btn.offsetWidth / 2 - this.main.scrollLeft;
  }

  position() {
    const m = this.metrics;
    if (!m || !this.halo || !this.svg) return;
    this.halo.style.left = m.left + 'px';
    /* m.y 是外框（含液面留白）的顶；胶囊本体在它下面 m.top。 */
    this.halo.style.top = (m.y + m.top) + 'px';
    this.halo.style.width = m.width + 'px';
    this.halo.style.height = m.height + 'px';
    this.halo.style.borderRadius = getComputedStyle(this.main).borderRadius;
    this.svg.style.left = m.left + 'px';
    this.svg.style.top = m.y + 'px';
    this.svg.style.width = m.width + 'px';
    this.svg.style.height = m.totalH + 'px';
    this.svg.setAttribute('viewBox', '0 0 ' + liquidNumber(m.width) + ' ' + liquidNumber(m.totalH));
  }

  sync(force) {
    if (!this.main) return;
    if (force || !this.metrics) {
      if (!this.measure()) return;
    } else {
      /* 只跟布局走的量：球被横向滚出胶囊时收回液面，其余一概不量。 */
      const width = this.main.offsetWidth || this.metrics.width;
      const corner = this.metrics.corner || LIQUID_CORNER;
      const raw = this.ballCenterX();
      this.metrics.cx = clamp(raw, corner + 6, width - corner - 6);
      this.orbVisible = raw > corner + 4 && raw < width - corner - 4
        && this.btn.offsetWidth > 0 && this.btn.offsetHeight > 0;
      this.position();
    }
    this.syncTongue();
    this.write(this.t);
  }

  handleResize() {
    this.metrics = null;
    this.sync(true);
  }

  handleScroll() {
    if (this.scrollRaf) return;
    this.scrollRaf = requestAnimationFrame(() => {
      this.scrollRaf = 0;
      this.sync(false);
    });
  }

  /** 量一次玻璃舌的横向位置；形状交给 writeTongue 每帧跟水面走。 */
  syncTongue() {
    if (!this.tongue || !this.panel || !this.btn || !this.metrics) return;
    /* 球滚出胶囊时不画玻璃舌：否则面板底下会多出一块没有对应凹口的凸起。 */
    this.tongue.style.display = this.orbVisible ? '' : 'none';
    if (!this.orbVisible) { this.tongueGeo = null; return; }
    const panelRect = this.panel.getBoundingClientRect();
    if (!panelRect.width) { this.tongueGeo = null; return; }
    const btnRect = this.btn.getBoundingClientRect();
    const m = this.metrics;
    const half = m.notch * Math.sin(LIQUID_ANGLE) + m.shoulder;
    /* 只在面板平底的中段铺玻璃舌：左右各让开圆角，避免在圆角外多出小方角。 */
    const corner = parseFloat(getComputedStyle(this.panel).borderTopLeftRadius) || 22;
    const inner = panelRect.width - corner * 2;
    if (inner <= half * 2 + 8) { this.tongueGeo = null; return; }
    const cx = clamp(
      btnRect.left + btnRect.width / 2 - panelRect.left - corner,
      half + 4,
      inner - half - 4,
    );
    this.tongueGeo = { inner: inner, cx: cx, corner: corner };
    this.tongue.style.left = liquidNumber(corner) + 'px';
    this.tongue.style.width = liquidNumber(inner) + 'px';
    /* 盒子按最深的一帧定死：平底贴在面板底边，以后每帧只改 d。
       盒子高度跟 t 走会逐帧触发一次布局，动画期间没必要付这份钱。 */
    const deepest = m.notch - m.notchLift;
    const height = deepest + 4;
    const width = liquidNumber(inner);
    this.tongue.style.height = liquidNumber(height) + 'px';
    this.tongue.style.bottom = liquidNumber(-(deepest + 2)) + 'px';
    this.tongue.setAttribute('viewBox', '0 0 ' + width + ' ' + liquidNumber(height));
    this.tongue.setAttribute('width', width);
    this.tongue.setAttribute('height', liquidNumber(height));
    this.writeTongue(this.t);
  }

  /**
   * 玻璃舌的弧跟水面同半径、全程平行：水面还没凹下去（t<0.5）时它是平的，
   * 凹口成形的后半程才跟着水面一起往下潜，缝宽不会先宽后窄。
   */
  writeTongue(t) {
    const g = this.tongueGeo;
    if (!this.tongue || !g || !this.metrics) return;
    const s = clamp(2 * t - 1, 0, 1);
    const wrap = this.metrics.notch * s;
    const lift = this.metrics.notchLift * s;
    const d = tongueShape(g.inner, g.cx, wrap, lift, this.metrics.shoulder);
    for (const path of this.tonguePaths) path.setAttribute('d', d);
  }

  setTouch(x, y) {
    this.touch.x = x;
    this.touch.y = y;
    if (this.touchRaf) return;
    this.touchRaf = requestAnimationFrame(() => {
      this.touchRaf = 0;
      if (!this.raf) this.write(this.t);
    });
  }

  /** 打断余振：下一次按下时水面必须从静止形重新起算。 */
  stopSplash() {
    if (!this.splashRaf) return;
    cancelAnimationFrame(this.splashRaf);
    this.splashRaf = 0;
    this.splash = 0;
  }

  /**
   * 释手后的水面余振：560ms 衰减正弦，把「反作用力还在还手」演完。
   * 与 NEXL playWaterSplash 同参：三段振荡 × (1-p)² 衰减。
   * 开合驱动正在写 d 时让路，等它收尾后余振继续。
   */
  playSplash(amp) {
    this.stopSplash();
    if (Math.abs(amp) < 0.4) return;
    const t0 = performance.now();
    const tick = () => {
      const p = (performance.now() - t0) / 560;
      if (p >= 1) {
        this.splashRaf = 0;
        this.splash = 0;
        if (!this.raf) this.write(this.t);
        return;
      }
      const decay = (1 - p) * (1 - p);
      this.splash = amp * Math.sin(p * Math.PI * 3) * decay;
      if (!this.raf) this.write(this.t);
      this.splashRaf = requestAnimationFrame(tick);
    };
    this.splashRaf = requestAnimationFrame(tick);
  }

  write(t) {
    const m = this.metrics;
    if (!m || !this.paths.length) return;
    const d = this.orbVisible
      ? liquidShape(m.width, m.height, t, {
        top: m.top,
        cx: m.cx,
        sink: m.sink,
        /* 水面固定在球的静止位：球的上浮/挣扎不再牵动整条胶囊。 */
        ballY: m.ballY,
        shoulder: m.shoulder,
        corner: m.corner,
        scale: m.scale,
        touch: { x: this.touch.x, y: this.touch.y, splash: this.splash },
      })
      : capsuleShape(m.width, m.height, m.top, m.corner);
    for (const path of this.paths) path.setAttribute('d', d);
    this.writeTongue(t);
  }

  setOpen(open, instant) {
    this.open = !!open;
    if (!this.main) return;
    // 断点切换可能让主胶囊变宽/变窄；开合时顺手校准一次。
    const liveWidth = this.main.offsetWidth;
    if (this.metrics && liveWidth && Math.abs(liveWidth - this.metrics.width) > 0.5) {
      this.metrics = null;
    }
    if (!this.metrics && !this.measure()) return;
    /* 开合会重排任务栏中间那一块（芯片文案、搜索提示），球跟着横移；
       横向中心只在开合时对齐一次，不逐帧量布局。 */
    this.sync(false);
    if (instant) {
      this.t = open ? 1 : 0;
      this.write(this.t);
      return;
    }
    this.drive(!!open);
  }

  /** 水面跟着球的真实 top 走：球到哪儿，水就到哪儿，不各跑一段定时过渡。 */
  drive(open) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!this.metrics && !this.measure()) return;
    const btnH = this.btn.offsetHeight || 54;
    const capsuleH = this.metrics.height;
    const closedTop = btnH / 2 - (capsuleH / 2 - this.metrics.sink);
    const openTop = btnH / 2 - (capsuleH / 2 + this.metrics.notchLift);
    const span = openTop - closedTop;
    if (!span) return;
    let t = this.t;
    const deadline = performance.now() + 900;
    const step = () => {
      this.raf = 0;
      const raw = parseFloat(getComputedStyle(this.orb).top);
      const next = isNaN(raw) ? (open ? 1 : 0) : (raw - closedTop) / span;
      const clamped = clamp(next, 0, 1);
      t = open ? Math.max(t, clamped) : Math.min(t, clamped);
      this.t = t;
      this.write(t);
      const settled = open ? t >= 1 : t <= 0;
      if (!settled && performance.now() < deadline) {
        this.raf = requestAnimationFrame(step);
        return;
      }
      this.t = open ? 1 : 0;
      this.write(this.t);
    };
    this.raf = requestAnimationFrame(step);
  }
}

/** 任务栏「开始」槽位里的情绪球：负责挂载、开合同步与手势绑定。 */
class StartOrb {
  constructor() {
    this.life = new OrbLife();
    this.btn = null;
    this.orb = null;
    this.open = false;
    this.onToggle = null;
    this.kickTimer = 0;
    this.liquid = null;
    this.liquidTaskbar = null;
  }

  mount(btn, options) {
    this.btn = btn;
    this.orb = btn ? btn.querySelector('.os-orb') : null;
    this.onToggle = options.onToggle;
    if (!this.orb) return;
    this.life.start();

    // 新节点没有旧的抓取位移：手势状态一起清掉
    orbPress = null;
    orbGrabX = 0;
    orbGrabY = 0;
    if (orbGrabRelease) {
      orbGrabRelease();
      orbGrabRelease = null;
    }

    // 任务栏液面：容器每次重绘都会换新节点，液面跟着重新挂载。
    if (options.taskbar && options.main) {
      if (this.liquid && this.liquidTaskbar !== options.taskbar) {
        this.liquid.destroy();
        this.liquid = null;
      }
      if (!this.liquid) this.liquid = new TaskbarLiquid(options.taskbar, options.panel);
      this.liquidTaskbar = options.taskbar;
      this.liquid.attach(options.main, btn, this.orb);
      orbLiquid = this.liquid;
    }

    this.bindOrb(this.orb);
    this.applyOpen(!!options.isOpen(), true);
  }

  bindOrb(orb) {
    const self = this;
    orb.addEventListener('pointerdown', function (event) {
      beginOrbPress(orb, event);
      if (orbPress) orbPress.onToggle = self.onToggle;
    });
    orb.addEventListener('contextmenu', function (event) {
      event.preventDefault();
      if (self.onToggle) self.onToggle(true);
    });
  }

  /** 合成 click：抬手已经处理过的 700ms 内直接吞掉；键盘激活仍走这里。 */
  click() {
    if (performance.now() - orbTapHandledAt < 700) return;
    if (this.onToggle) this.onToggle();
  }

  setOpen(open) {
    this.applyOpen(!!open, false);
  }

  applyOpen(open, instant) {
    const changed = this.open !== open;
    this.open = open;
    if (this.btn) this.btn.classList.toggle('is-launcher-open', open);
    const orb = this.orb;
    if (!orb) return;
    orb.setAttribute('aria-expanded', String(open));
    orb.setAttribute('aria-label', open ? '关闭全部应用' : '打开全部应用');
    orb.classList.toggle('is-open', open);
    if (this.liquid) this.liquid.setOpen(open, !!instant);
    if (instant || !changed) return;

    this.life.notify(open ? 'open' : 'close');
    // 只保留挤压回弹：先摘掉，重排一次再挂，连续点击也能从头播。
    // 不再让球额外上冲 7px——液面按 top 过渡跟随，球冲出这个范围接缝就会张开。
    orb.classList.remove('is-orb-kick');
    void orb.offsetWidth;
    orb.classList.add('is-orb-kick');
    window.clearTimeout(this.kickTimer);
    this.kickTimer = window.setTimeout(function () {
      orb.classList.remove('is-orb-kick');
    }, 540);
  }

  signal(kind) {
    this.life.signal(kind);
  }

  snapshot() {
    return {
      open: this.open,
      life: this.life.snapshot(),
      orbMood: this.orb ? this.orb.dataset.orbMood || null : null,
      liquid: this.liquid ? {
        t: this.liquid.t,
        splash: this.liquid.splash,
        touch: this.liquid.touch,
        metrics: this.liquid.metrics,
        paths: this.liquid.paths.length,
        tongue: this.liquid.tonguePaths.length,
      } : null,
    };
  }
}

export const startOrb = new StartOrb();

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__NEXLOS_ORB__', {
    configurable: true,
    value: {
      snapshot: function () { return startOrb.snapshot(); },
      signal: function (kind) { startOrb.signal(kind); },
      setOpen: function (open) { startOrb.setOpen(open); },
      // 验收用：停掉情绪层的 rAF，量出「有球 / 无球」的帧间隔差。
      stop: function () { startOrb.life.stop(); },
      start: function () { startOrb.life.start(); },
    },
  });
}
