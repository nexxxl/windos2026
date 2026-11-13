// nexlos.bridge/1 宿主侧。
// 由 WebOS 的两个壳（ui/app.js 的小说壳、ui/os.js 的桌面）共用。
// 宿主是唯一能替应用说话的同源页面：它用自己记录的 app id 调内核，
// 绝不采信应用消息里的 id。
(function () {
  'use strict';
  if (window.NexlOSHost) return;

  var frames = [];
  var stats = { attached: 0, messages: 0, pings: 0, calls: 0, errors: [] };

  function randomToken() {
    var buf = new Uint8Array(32);
    window.crypto.getRandomValues(buf);
    var out = '';
    for (var i = 0; i < buf.length; i++) out += (buf[i] < 16 ? '0' : '') + buf[i].toString(16);
    return out;
  }

  function bridgeError(info) {
    var err = new Error((info && info.message) || 'bridge error');
    err.code = (info && info.code) || 'E_BRIDGE';
    return err;
  }

  function findByWindow(win) {
    if (!win) return null;
    for (var i = 0; i < frames.length; i++) {
      var rec = frames[i];
      if (rec.win === win) return rec;
      // attach 可能发生在 iframe 插入文档之前，缓存的 contentWindow 还是 null；
      // 这里以 frame.contentWindow 为准再比一次（同一帧导航后代理对象保持不变）。
      try {
        if (rec.frame.contentWindow === win) {
          rec.win = win;
          return rec;
        }
      } catch (e) { /* 帧已销毁 */ }
    }
    return null;
  }

  function post(win, msg) {
    if (!win) return;
    try { win.postMessage(msg, '*'); } catch (e) { /* 帧已经销毁 */ }
  }

  function hello(rec) {
    if (!rec.win) {
      try { rec.win = rec.frame.contentWindow; } catch (e) { /* 帧已销毁 */ }
    }
    if (!rec.win) return;
    post(rec.win, {
      v: 1, type: 'nexlos.bridge.hello',
      app: rec.id, digest: rec.digest, token: rec.token, origin: location.origin,
    });
  }

  function respond(win, id, data) {
    if (!id) return;
    post(win, { v: 1, id: id, ok: true, data: data || {} });
  }

  function respondError(win, id, code, message) {
    if (!id) return;
    post(win, { v: 1, id: id, ok: false, error: { code: code, message: message } });
  }

  // 内核命令：宿主与内核同源，能直接走 /c/；应用做不到。
  function kernelEnvelope(cmd, fields) {
    return fetch('/c/' + cmd, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields || {}),
    }).then(function (res) {
      return res.json().then(function (env) {
        if (!res.ok || !env || env.ok === false) {
          throw bridgeError({ code: 'E_KERNEL', message: (env && env.error) || ('HTTP ' + res.status) });
        }
        return env;
      });
    });
  }

  function kernel(cmd, fields) {
    return kernelEnvelope(cmd, fields).then(function (env) { return env.detail || {}; });
  }

  function allowed(rec, cmd) {
    return rec.capabilities.indexOf(cmd) >= 0;
  }

  function permission(rec, name) {
    var p = rec.permissions || {};
    return !!p[name];
  }

  function themeSnapshot() {
    var root = document.documentElement;
    var accent = '';
    try { accent = getComputedStyle(root).getPropertyValue('--accent').trim(); } catch (e) { /* 旧引擎 */ }
    return {
      theme: root.dataset.theme || document.body.dataset.theme || '',
      accent: accent,
      language: root.lang || navigator.language || 'zh',
    };
  }

  function handle(rec, win, msg) {
    var args = msg.args;
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw bridgeError({ code: 'E_ARGS', message: 'args 必须是对象' });
    }
    var cmd = String(msg.cmd || '');
    if (!cmd || cmd.length > 64) throw bridgeError({ code: 'E_ARGS', message: '命令名不合法' });
    // 能力是清单授权的闭集；宿主再做一次判定，避免内核被绕过。
    if (!allowed(rec, cmd)) throw bridgeError({ code: 'E_NOT_ALLOWED', message: '未声明能力 ' + cmd });

    switch (cmd) {
      case 'app.storage.get':
        if ((rec.permissions || {}).storage !== 'app') throw bridgeError({ code: 'E_PERMISSION', message: '未声明 storage 权限' });
        return kernel('app.storage.get', { id: rec.id, key: String(args.key || '') });
      case 'app.storage.set':
        if ((rec.permissions || {}).storage !== 'app') throw bridgeError({ code: 'E_PERMISSION', message: '未声明 storage 权限' });
        return kernel('app.storage.set', { id: rec.id, key: String(args.key || ''), value: String(args.value == null ? '' : args.value) });
      case 'app.storage.remove':
        if ((rec.permissions || {}).storage !== 'app') throw bridgeError({ code: 'E_PERMISSION', message: '未声明 storage 权限' });
        return kernel('app.storage.remove', { id: rec.id, key: String(args.key || '') });
      case 'app.storage.keys':
        if ((rec.permissions || {}).storage !== 'app') throw bridgeError({ code: 'E_PERMISSION', message: '未声明 storage 权限' });
        return kernel('app.storage.keys', { id: rec.id });
      case 'app.files.put':
        if ((rec.permissions || {}).storage !== 'app') throw bridgeError({ code: 'E_PERMISSION', message: '未声明 storage 权限' });
        return kernel('app.files.put', {
          id: rec.id, name: String(args.name || ''), data: String(args.data || ''),
          append: !!args.append, done: args.done !== false,
        });
      case 'app.files.get':
        if ((rec.permissions || {}).storage !== 'app') throw bridgeError({ code: 'E_PERMISSION', message: '未声明 storage 权限' });
        return kernel('app.files.get', { id: rec.id, name: String(args.name || '') });
      case 'app.files.list':
        if ((rec.permissions || {}).storage !== 'app') throw bridgeError({ code: 'E_PERMISSION', message: '未声明 storage 权限' });
        return kernelEnvelope('app.files.list', { id: rec.id }).then(function (env) {
          return { files: env.append || [], total: (env.detail && env.detail.bytes) || 0, quota: (env.detail && env.detail.quota) || 0 };
        });
      case 'app.files.remove':
        if ((rec.permissions || {}).storage !== 'app') throw bridgeError({ code: 'E_PERMISSION', message: '未声明 storage 权限' });
        return kernel('app.files.remove', { id: rec.id, name: String(args.name || '') });
      case 'app.clipboard.read':
        if (!permission(rec, 'clipboard')) throw bridgeError({ code: 'E_PERMISSION', message: '未声明 clipboard 权限' });
        // 非安全上下文（局域网 http）没有 clipboard API，直接给出可读错误，别让应用卡在未捕获异常。
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          throw bridgeError({ code: 'E_PERMISSION', message: '当前环境不支持剪贴板，请用 localhost 或 https 打开' });
        }
        return navigator.clipboard.readText().then(function (text) { return { text: text }; });
      case 'app.clipboard.write':
        if (!permission(rec, 'clipboard')) throw bridgeError({ code: 'E_PERMISSION', message: '未声明 clipboard 权限' });
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          throw bridgeError({ code: 'E_PERMISSION', message: '当前环境不支持剪贴板，请用 localhost 或 https 打开' });
        }
        return navigator.clipboard.writeText(String(args.text || '')).then(function () { return { ok: true }; });
      case 'app.notify':
        if (!permission(rec, 'notifications')) throw bridgeError({ code: 'E_PERMISSION', message: '未声明 notifications 权限' });
        if (typeof Notification === 'undefined') throw bridgeError({ code: 'E_PERMISSION', message: '当前环境不支持通知' });
        if (Notification.permission !== 'granted') throw bridgeError({ code: 'E_PERMISSION', message: '通知未授权' });
        new Notification(String(args.title || rec.name || rec.id).slice(0, 80), { body: String(args.body || '').slice(0, 500) });
        return Promise.resolve({ ok: true });
      case 'app.open':
        return kernel('open.url', { url: String(args.url || '') });
      case 'app.theme.get':
        return Promise.resolve(themeSnapshot());
      default:
        throw bridgeError({ code: 'E_NOT_ALLOWED', message: '宿主不支持的桥命令 ' + cmd });
    }
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.v !== 1) return;
    stats.messages += 1;
    var rec = findByWindow(ev.source);
    if (!rec) { stats.errors.push('unregistered frame'); return; } // 只接受已登记的帧

    if (d.type === 'nexlos.bridge.ping') { stats.pings += 1; hello(rec); return; }
    if (d.type === 'nexlos.bridge.ready') return;
    if (d.op !== 'call' && d.op !== 'invoke') return;
    stats.calls += 1;

    if (!d.id || String(d.id).length > 64) return;
    // 令牌 + 应用 id 双绑定：换了文档或换了应用都不再匹配。
    if (d.app !== rec.id || d.token !== rec.token) {
      respondError(ev.source, d.id, 'E_TOKEN', '令牌无效或已失效');
      return;
    }
    if (d.op === 'invoke') {
      respondError(ev.source, d.id, 'E_NOT_ALLOWED', '应用自有命令尚未开放');
      return;
    }
    try {
      var result = handle(rec, ev.source, d);
      Promise.resolve(result).then(function (data) {
        respond(ev.source, d.id, data);
      }, function (err) {
        respondError(ev.source, d.id, (err && err.code) || 'E_BRIDGE', (err && err.message) || '桥调用失败');
      });
    } catch (err) {
      respondError(ev.source, d.id, (err && err.code) || 'E_BRIDGE', (err && err.message) || '桥调用失败');
    }
  });

  window.NexlOSHost = {
    // attach 必须在 iframe 的 load 之前或之后都能工作：客户端会主动 ping。
    attach: function (frame, opts) {
      opts = opts || {};
      var rec = {
        frame: frame,
        win: frame.contentWindow,
        id: String(opts.id || ''),
        digest: String(opts.digest || ''),
        name: String(opts.name || opts.id || ''),
        capabilities: Array.isArray(opts.capabilities) ? opts.capabilities : [],
        permissions: opts.permissions || {},
        token: randomToken(),
      };
      frames.push(rec);
      stats.attached += 1;
      frame.addEventListener('load', function () {
        rec.win = frame.contentWindow;
        // 空 src 的 iframe 插入文档会先加载 about:blank，那不是应用导航。
        // 只有带 src 的 load 才算第一份文档，之后的 load 才轮换令牌。
        if (frame.getAttribute('src')) {
          if (rec.loaded) rec.token = randomToken();
          rec.loaded = true;
        }
        hello(rec);
      });
      return rec;
    },
    detach: function (rec) {
      var i = frames.indexOf(rec);
      if (i >= 0) frames.splice(i, 1);
    },
    debug: function () { return { stats: stats, frames: frames.length }; },
    broadcast: function (event, data) {
      for (var i = 0; i < frames.length; i++) {
        post(frames[i].win, { v: 1, type: 'nexlos.bridge.event', event: event, data: data });
      }
    },
  };
})();
