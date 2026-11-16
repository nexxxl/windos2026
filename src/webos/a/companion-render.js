// 桌面伴侣的渲染器：优先 WebGL2 着色器，失败时退回 Canvas2D。
//
// 为什么要自己写着色器：生命包里的图是扁平 PNG，直接 drawImage 会像贴纸。
// 这里把 alpha 轮廓当几何来重新打光——外发光、轮廓光、纸纹、墨粒——同一张图
// 在 60fps 下看起来像活的。GPU 路径把逐像素工作交给显卡，CPU 只更新几个 uniform。

function hexRGB(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return [1.0, 0.71, 0.42];
  var n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// 画布固定留出 11% 横向、6% 纵向的透明边：外发光和墨粒需要溢出空间，
// 否则会被画布边缘整齐地切掉，一眼看出是贴图。
var MARGIN_X = 0.11;
var MARGIN_Y = 0.06;
var BOX_X = 1 + MARGIN_X * 2;
var BOX_Y = 1 + MARGIN_Y * 2;

function spriteBox(cssW, cssH) {
  return {
    x: cssW * MARGIN_X / BOX_X,
    y: cssH * MARGIN_Y / BOX_Y,
    w: cssW / BOX_X,
    h: cssH / BOX_Y,
  };
}

// ---------- 粒子：主线程只维护 30 个浮点数，真正的像素混合在 GPU 上 ----------
function makeParticles() {
  return { list: [], ready: false };
}

function seedParticles(parts, count) {
  parts.list = [];
  for (var i = 0; i < count; i++) {
    parts.list.push({
      x: Math.random(),
      y: Math.random(),
      vy: 0.012 + Math.random() * 0.03,
      sway: Math.random() * Math.PI * 2,
      size: 0.6 + Math.random() * 1.8,
      alpha: 0.07 + Math.random() * 0.20,
      phase: Math.random() * 100,
    });
  }
  parts.ready = true;
}

function stepParticles(parts, dt, time) {
  var list = parts.list;
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    p.y -= p.vy * dt;
    p.x += Math.sin(time * 0.5 + p.phase) * 0.0007 * dt;
    if (p.y < -0.05) {
      p.y = 1.08 + Math.random() * 0.06;
      p.x = Math.random();
    }
    if (p.x < -0.05) p.x = 1.05;
    if (p.x > 1.05) p.x = -0.05;
  }
}

// ---------- WebGL2 ----------

var SPRITE_VS = [
  '#version 300 es',
  'in vec2 aPos;',
  'uniform vec4 uRect;',
  'uniform vec2 uScale;',
  'uniform float uRot;',
  'uniform vec2 uShift;',
  'out vec2 vUv;',
  'void main() {',
  '  vec2 q = aPos;',
  '  q.x *= uScale.x;',
  '  q.y = -1.0 + (q.y + 1.0) * uScale.y;',
  '  vec2 r = vec2(q.x, q.y + 1.0);',
  '  float c = cos(uRot);',
  '  float s = sin(uRot);',
  '  r = vec2(r.x * c - r.y * s, r.x * s + r.y * c);',
  '  q = vec2(r.x, r.y - 1.0) + uShift;',
  '  vec2 ndc = uRect.xy + vec2((q.x + 1.0) * 0.5, (q.y + 1.0) * 0.5) * uRect.zw;',
  '  gl_Position = vec4(ndc, 0.0, 1.0);',
  '  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);',
  '}',
].join('\n');

var SPRITE_FS = [
  '#version 300 es',
  'precision highp float;',
  'uniform sampler2D uTex;',
  'uniform sampler2D uTex2;',
  'uniform sampler2D uEdge;',
  'uniform float uMix;',
  'uniform float uHasEdge;',
  'uniform vec2 uTexel;',
  'uniform vec2 uRes;',
  'uniform float uTime;',
  'uniform float uAlpha;',
  'uniform float uRim;',
  'uniform float uWarm;',
  'uniform float uSad;',
  'uniform vec3 uTint;',
  'uniform float uTintAmt;',
  'uniform vec3 uGlow;',
  'in vec2 vUv;',
  'out vec4 outColor;',
  'float hash(vec2 p) {',
  '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
  '}',
  'void main() {',
  '  vec4 a = texture(uTex, vUv);',
  '  vec4 b = texture(uTex2, vUv);',
  '  vec4 c = mix(a, b, uMix);',
  '  float alpha = c.a * uAlpha;',
  '  if (alpha < 0.004) { discard; }',
  '  vec3 col = c.rgb / max(c.a, 0.001);',
  '  vec4 e = texture(uEdge, vUv);',
  '  float sd = (e.r * 255.0 - 128.0) / 127.0;',
  '  float grad = e.g;',
  '  if (uHasEdge < 0.5) {',
  '    float gx = texture(uTex, vUv + vec2(uTexel.x, 0.0)).a - texture(uTex, vUv - vec2(uTexel.x, 0.0)).a;',
  '    float gy = texture(uTex, vUv + vec2(0.0, uTexel.y)).a - texture(uTex, vUv - vec2(0.0, uTexel.y)).a;',
  '    grad = clamp(length(vec2(gx, gy)) * 2.0, 0.0, 1.0);',
  '    sd = 0.0;',
  '  }',
  '  // 轮廓光：贴着边界的窄亮带，像纸片被侧光照到。',
  '  float rim = pow(clamp(1.0 - abs(sd), 0.0, 1.0), 6.0) * grad;',
  '  // 外发光：从轮廓向外衰减，给扁平色块一点空气感。',
  '  float halo = smoothstep(-0.55, -0.02, sd) * (1.0 - smoothstep(-0.02, 0.05, sd));',
  '  // 体积：上亮下暗，再给左上角一点暖色高光，扁平色块才有厚度。',
  '  float form = clamp(vUv.y * 0.55 + (1.0 - vUv.x) * 0.25, 0.0, 1.0);',
  '  col *= mix(0.90, 1.06, form);',
  '  float lift = smoothstep(0.28, 0.0, distance(vUv, vec2(0.34, 0.28)));',
  '  col += vec3(1.0, 0.86, 0.66) * lift * 0.06;',
  '  // 内部压暗：让轮廓内侧有一点体积，而不是纯色贴纸。',
  '  col *= 1.0 - rim * 0.16;',
  '  col = mix(col, col * vec3(1.06, 1.0, 0.90) + vec3(0.020, 0.012, 0.0), uWarm);',
  '  float gray = dot(col, vec3(0.299, 0.587, 0.114));',
  '  col = mix(col, gray * vec3(0.84, 0.93, 1.08), uSad);',
  '  // 状态色：错误偏红、睡眠偏冷、完成偏暖；只染身体，不染外发光。',
  '  col = mix(col, col * uTint, uTintAmt);',
  '  float grain = hash(floor(gl_FragCoord.xy) + floor(uTime * 4.0)) - 0.5;',
  '  col += grain * 0.045;',
  '  float glowA = clamp(halo * 0.75 + rim * 0.78, 0.0, 1.0) * uAlpha;',
  '  vec3 lit = col * alpha + uGlow * glowA;',
  '  outColor = vec4(lit, clamp(alpha + glowA, 0.0, 1.0));',
  '}',
].join('\n');

var POINT_VS = [
  '#version 300 es',
  'in vec2 aPos;',
  'in vec2 aMeta;',
  'uniform float uDPR;',
  'out float vA;',
  'void main() {',
  '  gl_Position = vec4(aPos, 0.0, 1.0);',
  '  gl_PointSize = aMeta.x * uDPR;',
  '  vA = aMeta.y;',
  '}',
].join('\n');

var POINT_FS = [
  '#version 300 es',
  'precision mediump float;',
  'uniform vec3 uGlow;',
  'in float vA;',
  'out vec4 outColor;',
  'void main() {',
  '  vec2 p = gl_PointCoord * 2.0 - 1.0;',
  '  float r = length(p);',
  '  float a = 1.0 - smoothstep(0.0, 1.0, r);',
  '  a *= a;',
  '  outColor = vec4(uGlow * a * vA, a * vA);',
  '}',
].join('\n');

function createGL(canvas, glowHex) {
  var gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function program(vsSrc, fsSrc) {
    var vs = compile(gl.VERTEX_SHADER, vsSrc);
    var fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    return p;
  }

  var spriteProg = program(SPRITE_VS, SPRITE_FS);
  var pointProg = program(POINT_VS, POINT_FS);
  if (!spriteProg || !pointProg) {
    if (spriteProg) gl.deleteProgram(spriteProg);
    if (pointProg) gl.deleteProgram(pointProg);
    return null;
  }

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var quadLoc = gl.getAttribLocation(spriteProg, 'aPos');
  gl.enableVertexAttribArray(quadLoc);
  gl.vertexAttribPointer(quadLoc, 2, gl.FLOAT, false, 0, 0);

  var pointBuf = gl.createBuffer();
  var pointLoc = gl.getAttribLocation(pointProg, 'aPos');
  var metaLoc = gl.getAttribLocation(pointProg, 'aMeta');

  var spriteU = {};
  ['uRect', 'uScale', 'uRot', 'uShift', 'uTex', 'uTex2', 'uEdge', 'uMix', 'uHasEdge',
    'uTexel', 'uRes', 'uTime', 'uAlpha', 'uRim', 'uWarm', 'uSad', 'uTint', 'uTintAmt', 'uGlow'].forEach(function (name) {
    spriteU[name] = gl.getUniformLocation(spriteProg, name);
  });
  var pointU = {
    uDPR: gl.getUniformLocation(pointProg, 'uDPR'),
    uGlow: gl.getUniformLocation(pointProg, 'uGlow'),
  };

  var textures = {};
  var edgeTextures = {};
  var layers = [];
  var parts = makeParticles();
  var size = { w: 0, h: 0, dpr: 1, cssW: 1, cssH: 1, box: spriteBox(1, 1) };
  var frame = { key: '', prev: '', changedAt: -1 };
  var lastTime = 0;
  var glow = hexRGB(glowHex);

  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  function textureFor(layer) {
    if (!layer || !layer.img) return null;
    var key = layer.key;
    if (textures[key]) return textures[key];
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    textures[key] = { tex: tex, w: layer.img.naturalWidth || layer.img.width, h: layer.img.naturalHeight || layer.img.height };
    return textures[key];
  }

  function edgeFor(key) {
    return edgeTextures[key] || null;
  }

  function resize() {
    var cssW = Math.max(1, canvas.clientWidth || 1);
    var cssH = Math.max(1, canvas.clientHeight || 1);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(cssW * dpr));
    var h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    size = { w: w, h: h, dpr: dpr, cssW: cssW, cssH: cssH, box: spriteBox(cssW, cssH) };
    gl.viewport(0, 0, w, h);
    if (!parts.ready) seedParticles(parts, 30);
    return size;
  }

  function drawSprite(layer, prevLayer, mix, state, alpha) {
    var t1 = textureFor(layer);
    if (!t1) return;
    var t2 = prevLayer ? textureFor(prevLayer) : t1;
    var edge = edgeFor(layer.edgeKey || layer.key);
    var box = size.box;
    var sx = box.x / size.cssW * 2;
    var sw = box.w / size.cssW * 2;
    var sy = box.y / size.cssH * 2;
    var sh = box.h / size.cssH * 2;
    var rectX = -1 + sx;
    var rectY = 1 - sy - sh;
    gl.useProgram(spriteProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(quadLoc);
    gl.vertexAttribPointer(quadLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(spriteU.uRect, rectX, rectY, sw, sh);
    var breath = state.breath || 0;
    var sxq = 1 + breath * 0.25;
    var syq = 1 - breath * 0.55;
    gl.uniform2f(spriteU.uScale, sxq, syq);
    gl.uniform1f(spriteU.uRot, state.rot || 0);
    gl.uniform2f(spriteU.uShift, state.shiftX || 0, state.shiftY || 0);
    gl.uniform2f(spriteU.uRes, size.w, size.h);
    gl.uniform1f(spriteU.uTime, state.time || 0);
    gl.uniform1f(spriteU.uAlpha, alpha);
    gl.uniform1f(spriteU.uRim, state.rim);
    gl.uniform1f(spriteU.uWarm, state.warm);
    gl.uniform1f(spriteU.uSad, state.sad);
    var tint = state.tint || [1, 1, 1];
    gl.uniform3f(spriteU.uTint, tint[0], tint[1], tint[2]);
    gl.uniform1f(spriteU.uTintAmt, state.tintAmount == null ? 0 : state.tintAmount);
    gl.uniform3f(spriteU.uGlow, glow[0], glow[1], glow[2]);
    gl.uniform1f(spriteU.uMix, mix);
    gl.uniform1f(spriteU.uHasEdge, edge ? 1 : 0);
    gl.uniform2f(spriteU.uTexel, 1 / Math.max(1, t1.w), 1 / Math.max(1, t1.h));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t1.tex);
    gl.uniform1i(spriteU.uTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, t2.tex);
    gl.uniform1i(spriteU.uTex2, 1);
    gl.activeTexture(gl.TEXTURE2);
    if (edge) {
      gl.bindTexture(gl.TEXTURE_2D, edge.tex);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, t1.tex);
    }
    gl.uniform1i(spriteU.uEdge, 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function drawPoints(state, dense) {
    if (!parts.ready) seedParticles(parts, dense ? 30 : 16);
    var count = parts.list.length;
    var arr = new Float32Array(count * 4);
    var box = size.box;
    for (var i = 0; i < count; i++) {
      var p = parts.list[i];
      // 粒子只在角色附近漂浮：横向限制在立绘范围内，纵向从脚底升到头顶。
      var px = box.x + (p.x * 0.92 + 0.04) * box.w;
      var py = box.y + (p.y * 0.94 + 0.03) * box.h;
      arr[i * 4] = px / size.cssW * 2 - 1;
      arr[i * 4 + 1] = 1 - py / size.cssH * 2;
      arr[i * 4 + 2] = p.size * (dense ? 1 : 0.72);
      arr[i * 4 + 3] = p.alpha * (state.particleAlpha == null ? 1 : state.particleAlpha);
    }
    gl.useProgram(pointProg);
    gl.uniform1f(pointU.uDPR, size.dpr);
    gl.uniform3f(pointU.uGlow, glow[0], glow[1], glow[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(pointLoc);
    gl.vertexAttribPointer(pointLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(metaLoc);
    gl.vertexAttribPointer(metaLoc, 2, gl.FLOAT, false, 16, 8);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  return {
    kind: 'webgl2',
    resize: resize,
    setLayers: function (list) {
      layers = list || [];
      var keep = {};
      for (var i = 0; i < layers.length; i++) {
        keep[layers[i].key] = true;
        textureFor(layers[i]);
      }
      Object.keys(textures).forEach(function (k) {
        if (!keep[k]) {
          gl.deleteTexture(textures[k].tex);
          delete textures[k];
        }
      });
    },
    setEdge: function (key, data, w, h) {
      if (!data || !w || !h) return;
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, w, h, 0, gl.RG, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (edgeTextures[key]) gl.deleteTexture(edgeTextures[key].tex);
      edgeTextures[key] = { tex: tex, w: w, h: h };
    },
    draw: function (state) {
      if (!size.cssW) resize();
      gl.clear(gl.COLOR_BUFFER_BIT);
      var dt = lastTime ? clamp(state.time - lastTime, 0, 0.12) : 0.016;
      lastTime = state.time;
      stepParticles(parts, dt, state.time);
      // 帧动画：新帧淡入 80ms，避免 8fps 的硬切。
      var frameLayer = null;
      if (state.frame) {
        for (var i = 0; i < layers.length; i++) {
          if (layers[i].mode === 'frame' && layers[i].frame === state.frame) { frameLayer = layers[i]; break; }
        }
      }
      var prevLayer = null;
      var mix = 0;
      if (frameLayer) {
        if (frame.key !== frameLayer.key) {
          frame.prev = frame.key;
          frame.key = frameLayer.key;
          frame.changedAt = state.time;
        }
        if (frame.prev && state.time - frame.changedAt < 0.1) {
          for (var j = 0; j < layers.length; j++) {
            if (layers[j].key === frame.prev) { prevLayer = layers[j]; break; }
          }
          mix = 1 - clamp((state.time - frame.changedAt) / 0.1, 0, 1);
        }
        drawSprite(frameLayer, prevLayer, mix, state, 1);
      } else {
        var ordered = layers.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
        for (var k = 0; k < ordered.length; k++) {
          var row = ordered[k];
          if (row.mode === 'blink') {
            if (state.blink) drawSprite(row, null, 0, state, 1);
          } else {
            drawSprite(row, null, 0, state, 1);
          }
        }
      }
      drawPoints(state, state.dense !== false);
    },
    dispose: function () {
      Object.keys(textures).forEach(function (k) { gl.deleteTexture(textures[k].tex); });
      Object.keys(edgeTextures).forEach(function (k) { gl.deleteTexture(edgeTextures[k].tex); });
      gl.deleteBuffer(quad);
      gl.deleteBuffer(pointBuf);
      gl.deleteProgram(spriteProg);
      gl.deleteProgram(pointProg);
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    },
  };
}

// ---------- Canvas2D 回退 ----------

function createCanvas2D(canvas, glowHex) {
  var ctx = canvas.getContext('2d');
  if (!ctx) return null;
  var glow = hexRGB(glowHex);
  var glowCss = 'rgba(' + Math.round(glow[0] * 255) + ',' + Math.round(glow[1] * 255) + ',' + Math.round(glow[2] * 255);
  var layers = [];
  var parts = makeParticles();
  var size = { dpr: 1, cssW: 1, cssH: 1, box: spriteBox(1, 1) };
  var glowCache = {};
  var frame = { key: '', prev: '', changedAt: -1 };
  var lastTime = 0;

  function glowFor(layer) {
    if (glowCache[layer.key]) return glowCache[layer.key];
    var w = Math.max(1, Math.round(layer.img.width / 3));
    var h = Math.max(1, Math.round(layer.img.height / 3));
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    if (!g) return null;
    // 缩小三倍再高斯模糊：在低分辨率上做柔光，成本只有全尺寸的九分之一。
    g.filter = 'blur(5px)';
    g.drawImage(layer.img, 0, 0, w, h);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = glowCss + ',1)';
    g.fillRect(0, 0, w, h);
    glowCache[layer.key] = c;
    return c;
  }

  function resize() {
    var cssW = Math.max(1, canvas.clientWidth || 1);
    var cssH = Math.max(1, canvas.clientHeight || 1);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(cssW * dpr));
    var h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { dpr: dpr, cssW: cssW, cssH: cssH, box: spriteBox(cssW, cssH) };
    if (!parts.ready) seedParticles(parts, 24);
    return size;
  }

  function drawLayer(layer, state, alpha) {
    var img = layer.img;
    if (!img) return;
    var box = size.box;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 外发光：低分辨率柔光图放大后叠加，模拟 GPU 的 halo。
    var halo = glowFor(layer);
    if (halo) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.42;
      ctx.drawImage(halo, box.x - box.w * 0.04, box.y - box.h * 0.03, box.w * 1.08, box.h * 1.06);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }
    ctx.translate(box.x + box.w / 2 + (state.shiftX || 0) * box.w * 0.5, box.y + box.h + (state.shiftY || 0) * box.h);
    ctx.rotate(state.rot || 0);
    ctx.scale(1 + (state.breath || 0) * 0.25, 1 - (state.breath || 0) * 0.55);
    ctx.translate(-box.w / 2, -box.h);
    ctx.drawImage(img, 0, 0, box.w, box.h);
    ctx.restore();
  }

  return {
    kind: 'canvas2d',
    resize: resize,
    setLayers: function (list) {
      layers = list || [];
      glowCache = {};
    },
    setEdge: function () { /* 2D 回退用缓存柔光，不需要距离场 */ },
    draw: function (state) {
      if (!size.cssW) resize();
      ctx.clearRect(0, 0, size.cssW, size.cssH);
      var dt = lastTime ? clamp(state.time - lastTime, 0, 0.12) : 0.016;
      lastTime = state.time;
      stepParticles(parts, dt, state.time);
      var frameLayer = null;
      if (state.frame) {
        for (var i = 0; i < layers.length; i++) {
          if (layers[i].mode === 'frame' && layers[i].frame === state.frame) { frameLayer = layers[i]; break; }
        }
      }
      if (frameLayer) {
        if (frame.key !== frameLayer.key) {
          frame.prev = frame.key;
          frame.key = frameLayer.key;
          frame.changedAt = state.time;
        }
        var prevLayer = null;
        var mix = 0;
        if (frame.prev && state.time - frame.changedAt < 0.1) {
          for (var j = 0; j < layers.length; j++) {
            if (layers[j].key === frame.prev) { prevLayer = layers[j]; break; }
          }
          mix = 1 - clamp((state.time - frame.changedAt) / 0.1, 0, 1);
        }
        if (prevLayer) drawLayer(prevLayer, state, 1);
        drawLayer(frameLayer, state, prevLayer ? 1 - mix : 1);
      } else {
        var ordered = layers.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
        for (var k = 0; k < ordered.length; k++) {
          var row = ordered[k];
          if (row.mode === 'blink') {
            if (state.blink) drawLayer(row, state, 1);
          } else {
            drawLayer(row, state, 1);
          }
        }
      }
      // 墨粒：预先渲染一颗径向渐变，逐帧只做 drawImage。
      var box = size.box;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var p = 0; p < parts.list.length; p++) {
        var pt = parts.list[p];
        var px = box.x + (pt.x * 0.92 + 0.04) * box.w;
        var py = box.y + (pt.y * 0.94 + 0.03) * box.h;
        var r = pt.size * 2.6;
        var grd = ctx.createRadialGradient(px, py, 0, px, py, r);
        grd.addColorStop(0, 'rgba(' + Math.round(glow[0] * 255) + ',' + Math.round(glow[1] * 255) + ',' + Math.round(glow[2] * 255) + ',' + pt.alpha + ')');
        grd.addColorStop(1, 'rgba(' + Math.round(glow[0] * 255) + ',' + Math.round(glow[1] * 255) + ',' + Math.round(glow[2] * 255) + ',0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    dispose: function () {
      layers = [];
      glowCache = {};
    },
  };
}

export function createCompanionRenderer(canvas, glowHex) {
  var gl = null;
  try { gl = createGL(canvas, glowHex); } catch (e) { gl = null; }
  if (gl) return gl;
  try { return createCanvas2D(canvas, glowHex); } catch (e) { return null; }
}
