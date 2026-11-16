// 壳内性能探针：只在 URL 带 ?perf=1 时工作。
//
// 为什么放在页面里：原生壳（WKWebView）没有 CDP，只有页面自己能量到
// “输入事件 → 下一帧”的真实延迟、rAF 掉帧与 DOM 规模。采样每 5 秒写回
// 内核的 perf.report，落盘到 NEXLOS_HOME/perf/web.jsonl，便于壳外分析。
(function () {
  if (!/[?&]perf=1/.test(location.search)) return;

  var hud = document.createElement('div');
  hud.id = 'nexlos-perf';
  hud.style.cssText = 'position:fixed;z-index:2147483647;right:10px;top:10px;' +
    'padding:8px 10px;border-radius:8px;background:rgba(17,17,17,.82);color:#8ef;' +
    'font:11px/1.45 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre;' +
    'text-align:right;box-shadow:0 6px 18px rgba(0,0,0,.28)';
  var ready = function () {
    if (document.body) document.body.appendChild(hud);
    else setTimeout(ready, 50);
  };
  ready();

  var intervals = [];   // 最近 240 帧的帧间隔
  var inputs = [];      // 最近 120 次输入延迟
  var lastFrame = 0;
  var framesThisSecond = 0;
  var fps = 0;
  var longFrames = 0;
  var pendingInput = 0;
  var secondAt = performance.now();
  var lastReport = 0;

  function push(list, value, cap) {
    list.push(value);
    if (list.length > cap) list.shift();
  }

  function percentile(list, p) {
    if (!list.length) return 0;
    var copy = list.slice().sort(function (a, b) { return a - b; });
    var idx = Math.min(copy.length - 1, Math.max(0, Math.round((copy.length - 1) * p)));
    return Math.round(copy[idx] * 10) / 10;
  }

  function markInput() {
    pendingInput = performance.now();
  }
  ['pointerdown', 'keydown', 'click'].forEach(function (name) {
    window.addEventListener(name, markInput, { capture: true, passive: true });
  });

  function tick(now) {
    if (lastFrame) {
      var dt = now - lastFrame;
      push(intervals, dt, 240);
      if (dt > 50) longFrames += 1;
    }
    lastFrame = now;
    framesThisSecond += 1;

    if (pendingInput) {
      push(inputs, now - pendingInput, 120);
      pendingInput = 0;
    }

    if (now - secondAt >= 1000) {
      fps = Math.round(framesThisSecond * 1000 / (now - secondAt) * 10) / 10;
      framesThisSecond = 0;
      secondAt = now;
    }

    if (now - lastReport >= 5000 && intervals.length >= 20) {
      lastReport = now;
      report(now);
    }

    hud.textContent = 'fps ' + fps +
      '  p95 ' + percentile(intervals, 0.95) + 'ms\n' +
      'input ' + percentile(inputs, 0.5) + '/' + percentile(inputs, 0.95) + 'ms\n' +
      'long ' + longFrames + '  nodes ' + document.getElementsByTagName('*').length + '\n' +
      'dpr ' + (window.devicePixelRatio || 1) + '  ' + window.innerWidth + '×' + window.innerHeight;

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function report(now) {
    var payload = JSON.stringify({
      fps: fps,
      frameP50: percentile(intervals, 0.5),
      frameP95: percentile(intervals, 0.95),
      inputP50: percentile(inputs, 0.5),
      inputP95: percentile(inputs, 0.95),
      longFrames: longFrames,
      nodes: document.getElementsByTagName('*').length,
      viewport: [window.innerWidth, window.innerHeight, window.devicePixelRatio || 1],
      hash: location.hash,
      ua: navigator.userAgent,
      t: Math.round(now)
    });
    longFrames = 0;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/c/perf.report', true);
    xhr.timeout = 4000;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ payload: payload }));
  }
})();
