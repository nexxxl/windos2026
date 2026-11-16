// 高斯模糊：多 pass 规划 + 可分离卷积。
// 对齐上游 ArtCraft：video-editor/src/lib/effects/definitions/blur.ts:10-74。
// 纯函数：输入 RGBA 像素数组，输出新数组；不碰 DOM。

// 单 pass 的有效 σ 上限与步长上限；两者相乘得到单次迭代能覆盖的最大 σ。
export var MAX_SINGLE_PASS_SIGMA = 10;
export var MAX_STEP = 4;
export var MAX_EFFECTIVE_SIGMA = MAX_SINGLE_PASS_SIGMA * MAX_STEP;
export var MAX_ITERATIONS = 8;
export var INTENSITY_TO_SIGMA_DIVISOR = 5;

// σ → 迭代次数：迭代数 = ceil(σ² / 40²)，夹到 [1, 8]。
// 每次迭代拆成水平、垂直两个 pass，per-pass σ = σ / √iterations。
export function planBlur(sigmaX, sigmaY) {
  var maxSigma = Math.max(sigmaX, sigmaY);
  if (!(maxSigma >= 0.001)) return [];
  var iterations = Math.min(
    MAX_ITERATIONS,
    Math.max(1, Math.ceil((maxSigma * maxSigma) / (MAX_EFFECTIVE_SIGMA * MAX_EFFECTIVE_SIGMA)))
  );
  var perPassSigmaX = sigmaX / Math.sqrt(iterations);
  var perPassSigmaY = sigmaY / Math.sqrt(iterations);
  var stepX = Math.max(1, perPassSigmaX / MAX_SINGLE_PASS_SIGMA);
  var stepY = Math.max(1, perPassSigmaY / MAX_SINGLE_PASS_SIGMA);
  var passes = [];
  for (var i = 0; i < iterations; i++) {
    passes.push({ sigma: perPassSigmaX, step: stepX, direction: 'x' });
    passes.push({ sigma: perPassSigmaY, step: stepY, direction: 'y' });
  }
  return passes;
}

// 强度 → σ：σ = (intensity / 5) × (resolution / reference)（上游 blur.ts:62）。
export function intensityToSigma(intensity, resolution, reference) {
  return (intensity / INTENSITY_TO_SIGMA_DIVISOR) * (resolution / reference);
}

// 一维高斯权重：按 step 抽样，半径截断到 3σ（覆盖 99.7% 能量）。
export function gaussianKernel(sigma, step) {
  if (!(sigma > 0)) return { radius: 0, weights: [1] };
  var s = step > 0 ? step : 1;
  var radius = Math.max(0, Math.ceil((3 * sigma) / s));
  var weights = [];
  var total = 0;
  for (var i = -radius; i <= radius; i++) {
    var d = i * s;
    var w = Math.exp(-(d * d) / (2 * sigma * sigma));
    weights.push(w);
    total += w;
  }
  for (var j = 0; j < weights.length; j++) weights[j] /= total;
  return { radius: radius, weights: weights };
}

function blurAxis(src, dst, width, height, sigma, step, horizontal) {
  var kernel = gaussianKernel(sigma, step);
  var radius = kernel.radius;
  var weights = kernel.weights;
  var stride = horizontal ? 4 : width * 4;
  var limit = horizontal ? width : height;
  var lineJump = horizontal ? width * 4 : 4;
  for (var line = 0; line < (horizontal ? height : width); line++) {
    var base = line * lineJump;
    for (var pos = 0; pos < limit; pos++) {
      var r = 0, g = 0, b = 0, a = 0;
      for (var k = -radius; k <= radius; k++) {
        // 边界钳制：越界采样取最近的边缘像素，避免暗边。
        var at = pos + k * step;
        if (at < 0) at = 0;
        else if (at >= limit) at = limit - 1;
        var idx = base + at * stride;
        var w = weights[k + radius];
        r += src[idx] * w;
        g += src[idx + 1] * w;
        b += src[idx + 2] * w;
        a += src[idx + 3] * w;
      }
      var out = base + pos * stride;
      dst[out] = r; dst[out + 1] = g; dst[out + 2] = b; dst[out + 3] = a;
    }
  }
}

// 按 planBlur 的 pass 序列做可分离卷积，返回新的 Uint8ClampedArray。
export function blurRGBA(data, width, height, sigmaX, sigmaY) {
  var passes = planBlur(sigmaX, sigmaY);
  if (passes.length === 0) return new Uint8ClampedArray(data);
  var a = new Uint8ClampedArray(data);
  var b = new Uint8ClampedArray(data.length);
  for (var i = 0; i < passes.length; i++) {
    var p = passes[i];
    blurAxis(a, b, width, height, p.sigma, p.step, p.direction === 'x');
    var swap = a; a = b; b = swap;
  }
  return a;
}
