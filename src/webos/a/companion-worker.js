// 伴侣离屏预处理：把立绘 alpha 变成“到轮廓的有符号距离 + 边缘强度”。
// 1024² 的立绘在主线程做两遍距离变换会卡掉一帧；放进 Worker 只在加载时算一次。
// Classic Worker，避免 Chrome 72（Pixel C）不支持 module worker。
function distanceField(solid, w, h) {
  var n = w * h;
  var INF = 1e6;
  var d = new Float32Array(n);
  var i, x, y;
  for (i = 0; i < n; i++) d[i] = INF;

  // 种子：与异类相邻（或贴画布边）的像素，距离为 0。
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = y * w + x;
      var s = solid[i];
      var edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        solid[i - 1] !== s || solid[i + 1] !== s ||
        solid[i - w] !== s || solid[i + w] !== s;
      if (edge) d[i] = 0;
    }
  }

  // 两遍 chamfer：正向扫左上，反向扫右下。权重近似欧氏距离。
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = y * w + x;
      var v = d[i];
      if (v === 0) continue;
      if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
      if (y > 0) {
        if (d[i - w] + 1 < v) v = d[i - w] + 1;
        if (x > 0 && d[i - w - 1] + 1.4142 < v) v = d[i - w - 1] + 1.4142;
        if (x < w - 1 && d[i - w + 1] + 1.4142 < v) v = d[i - w + 1] + 1.4142;
      }
      d[i] = v;
    }
  }
  for (y = h - 1; y >= 0; y--) {
    for (x = w - 1; x >= 0; x--) {
      i = y * w + x;
      var u = d[i];
      if (u === 0) continue;
      if (x < w - 1 && d[i + 1] + 1 < u) u = d[i + 1] + 1;
      if (y < h - 1) {
        if (d[i + w] + 1 < u) u = d[i + w] + 1;
        if (x < w - 1 && d[i + w + 1] + 1.4142 < u) u = d[i + w + 1] + 1.4142;
        if (x > 0 && d[i + w - 1] + 1.4142 < u) u = d[i + w - 1] + 1.4142;
      }
      d[i] = u;
    }
  }
  return d;
}

self.onmessage = function (e) {
  var data = e.data || {};
  var w = data.w | 0;
  var h = data.h | 0;
  var px = data.px;
  if (!w || !h || !px || px.length < w * h * 4) return;

  var n = w * h;
  var solid = new Uint8Array(n);
  var i;
  for (i = 0; i < n; i++) solid[i] = px[i * 4 + 3] > 20 ? 1 : 0;

  var dIn = distanceField(solid, w, h);

  // 外部距离：把透明像素当作实体再算一遍，符号取负。
  var inv = new Uint8Array(n);
  for (i = 0; i < n; i++) inv[i] = solid[i] ? 0 : 1;
  var dOut = distanceField(inv, w, h);

  var out = new Uint8Array(n * 2);
  for (i = 0; i < n; i++) {
    var dist = solid[i] ? dIn[i] : -dOut[i];
    // 32px 之外不再需要精度：R 通道 128 是轮廓，>128 在内部，<128 在外部。
    var t = dist / 32;
    if (t > 1) t = 1;
    if (t < -1) t = -1;
    out[i * 2] = Math.max(0, Math.min(255, Math.round(128 + t * 127)));

    // G 通道：alpha 的二维梯度，着色器拿它做轮廓光。
    var x = i % w;
    var y = (i - x) / w;
    var gx = 0;
    var gy = 0;
    if (x > 0 && x < w - 1) gx = solid[i + 1] - solid[i - 1];
    if (y > 0 && y < h - 1) gy = solid[i + w] - solid[i - w];
    var g = Math.sqrt(gx * gx + gy * gy);
    if (g > 1) g = 1;
    out[i * 2 + 1] = Math.round(g * 255);
  }

  self.postMessage({ id: data.id, w: w, h: h, buf: out.buffer }, [out.buffer]);
};
