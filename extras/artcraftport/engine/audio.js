// 音频母线：限幅参数、峰值检测、RMS 分桶、导出钳制。
// 对齐上游 ArtCraft：video-editor/src/lib/media/{audio-mastering,waveform-summary}.ts。
// 纯函数 + 一个建图函数（接受 AudioContext），不碰 DOM。

export var MASTER_LIMITER_THRESHOLD_DB = -1;
export var MASTER_LIMITER_KNEE_DB = 0;
export var MASTER_LIMITER_RATIO = 20;
export var MASTER_LIMITER_ATTACK_SECONDS = 0.001;
export var MASTER_LIMITER_RELEASE_SECONDS = 0.12;
export var MASTER_OUTPUT_HEADROOM = 0.98;

export var RMS_ANALYSIS_WINDOW_SECONDS = 0.02;
export var DEFAULT_WAVEFORM_BUCKET_SIZE = 128;

// 多声道峰值：返回绝对值最大者（上游 audio-mastering.ts:22）。
export function bufferPeak(channels) {
  var peak = 0;
  for (var c = 0; c < channels.length; c++) {
    var data = channels[c];
    for (var i = 0; i < data.length; i++) {
      var m = Math.abs(data[i]);
      if (m > peak) peak = m;
    }
  }
  return peak;
}

// 峰值未超 headroom 时无需限幅（上游 applyAudioMasteringToBuffer 的短路条件）。
export function needsLimiting(channels) {
  return bufferPeak(channels) > MASTER_OUTPUT_HEADROOM;
}

// 就地钳制到 ±maxPeak，导出后兜底防削波。
export function clampPeak(channels, maxPeak) {
  var limit = maxPeak === undefined ? MASTER_OUTPUT_HEADROOM : maxPeak;
  for (var c = 0; c < channels.length; c++) {
    var data = channels[c];
    for (var i = 0; i < data.length; i++) {
      if (data[i] > limit) data[i] = limit;
      else if (data[i] < -limit) data[i] = -limit;
    }
  }
  return channels;
}

// 每个桶取桶内所有 20ms 窗口的最大均方根（上游 waveform-summary.ts:189）。
// 分桶后缩放视图不必重算整段音频。
export function rmsBuckets(channels, sampleRate, bucketCount) {
  var total = channels.length > 0 ? channels[0].length : 0;
  var count = Math.max(1, Math.floor(bucketCount));
  var maxWindow = Math.max(1, Math.floor(sampleRate * RMS_ANALYSIS_WINDOW_SECONDS));
  var out = [];
  for (var b = 0; b < count; b++) {
    var start = Math.floor((b * total) / count);
    var end = Math.floor(((b + 1) * total) / count);
    var bucketLength = end - start;
    if (bucketLength <= 0) { out.push(0); continue; }
    var windowLength = Math.max(1, Math.min(bucketLength, maxWindow));
    var maxMeanSquare = 0;
    for (var winStart = start; winStart < end;) {
      var winEnd = Math.min(winStart + windowLength, end);
      var n = winEnd - winStart;
      if (n > 0) {
        var sum = 0;
        for (var c = 0; c < channels.length; c++) {
          var data = channels[c];
          for (var j = winStart; j < winEnd; j++) sum += data[j] * data[j];
        }
        var meanSquare = sum / (n * channels.length);
        if (meanSquare > maxMeanSquare) maxMeanSquare = meanSquare;
      }
      winStart = winEnd;
    }
    out.push(Math.sqrt(maxMeanSquare));
  }
  return out;
}

// 每个桶的峰值振幅（上游 computePeakBuckets），用于波形轮廓。
export function peakBuckets(channels, bucketCount) {
  var total = channels.length > 0 ? channels[0].length : 0;
  var count = Math.max(1, Math.floor(bucketCount));
  var out = [];
  for (var b = 0; b < count; b++) {
    var start = Math.floor((b * total) / count);
    var end = Math.floor(((b + 1) * total) / count);
    var peak = 0;
    for (var c = 0; c < channels.length; c++) {
      var data = channels[c];
      for (var j = start; j < end; j++) {
        var m = Math.abs(data[j]);
        if (m > peak) peak = m;
      }
    }
    out.push(peak);
  }
  return out;
}

// 确定性噪声：导出的 WAV 必须逐字节可复现，不能用 Math.random()。
// mulberry32 只有 32 位状态，跨浏览器结果一致，足够做打击乐噪声。
export function hashSeed(text) {
  var h = 2166136261;
  var s = String(text == null ? '' : text);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 就地填充 [-1,1) 白噪声；同一 seedText 永远得到同一段样本。
export function fillNoise(data, seedText) {
  var rnd = mulberry32(hashSeed(seedText));
  for (var i = 0; i < data.length; i++) data[i] = rnd() * 2 - 1;
  return data;
}

// 母线图：输入 → 限幅器 → 输出增益（0.98）。每帧共用一个实例。
export function createMasteringChain(ctx, destination) {
  var input = ctx.createGain();
  var limiter = ctx.createDynamicsCompressor();
  var output = ctx.createGain();
  limiter.threshold.value = MASTER_LIMITER_THRESHOLD_DB;
  limiter.knee.value = MASTER_LIMITER_KNEE_DB;
  limiter.ratio.value = MASTER_LIMITER_RATIO;
  limiter.attack.value = MASTER_LIMITER_ATTACK_SECONDS;
  limiter.release.value = MASTER_LIMITER_RELEASE_SECONDS;
  output.gain.value = MASTER_OUTPUT_HEADROOM;
  input.connect(limiter);
  limiter.connect(output);
  output.connect(destination);
  return { input: input, limiter: limiter, output: output };
}
