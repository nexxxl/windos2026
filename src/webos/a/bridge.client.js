// nexlos.bridge/1 应用侧客户端。
// 编码器会把它内联进入口 HTML；也可以作为同源脚本 /a/bridge.client.js 加载。
// 只做三件事：握手、把能力调用发给宿主、把结果/事件交给应用。
// 应用本身运行在 sandbox 不透明源里，没有别的通道能触达宿主。
(function () {
  'use strict';
  if (window.NexlOS) return;

  var pending = {};
  var seq = 0;
  var session = null;
  var listeners = [];
  var readyResolve;
  var ready = new Promise(function (resolve) { readyResolve = resolve; });
  // 顶层打开时不存在宿主，握手永远不会来。直接放行 ready，
  // 让能力调用立刻以“尚未握手”失败，应用可以自己降级。
  var hostless = window.parent === window;
  if (hostless) readyResolve();

  function post(msg) {
    // 不透明源下没有可用的目标 origin，身份完全由宿主的 event.source 判定。
    try { window.parent.postMessage(msg, '*'); } catch (e) { /* 顶层打开时没有可用的 parent */ }
  }

  function bridgeError(info) {
    var err = new Error((info && info.message) || 'bridge error');
    err.code = (info && info.code) || 'E_BRIDGE';
    return err;
  }

  function fail(id, code, message) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    clearTimeout(p.timer);
    p.reject(bridgeError({ code: code, message: message }));
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.v !== 1) return;
    if (d.type === 'nexlos.bridge.hello') {
      session = { app: d.app, token: d.token };
      readyResolve();
      post({ v: 1, type: 'nexlos.bridge.ready', app: d.app, token: d.token, op: 'ready', id: 'ready' });
      return;
    }
    if (d.type === 'nexlos.bridge.event') {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](d.event, d.data); } catch (e) { /* 一个监听器出错不影响其他 */ }
      }
      return;
    }
    if (!d.id || !pending[d.id]) return;
    var p = pending[d.id];
    delete pending[d.id];
    clearTimeout(p.timer);
    if (d.ok) p.resolve(d.data);
    else p.reject(bridgeError(d.error));
  });

  function request(op, cmd, args, timeoutMs) {
    return ready.then(function () {
      if (!session) throw bridgeError({ code: 'E_TOKEN', message: '尚未与宿主握手' });
      return new Promise(function (resolve, reject) {
        var id = 'req-' + (++seq);
        var timer = setTimeout(function () {
          if (!pending[id]) return;
          delete pending[id];
          reject(bridgeError({ code: 'E_TIMEOUT', message: cmd + ' 超时' }));
        }, timeoutMs || 5000);
        pending[id] = { resolve: resolve, reject: reject, timer: timer };
        post({ v: 1, id: id, app: session.app, token: session.token, op: op, cmd: cmd, args: args || {} });
      });
    });
  }

  function call(cmd, args, timeoutMs) { return request('call', cmd, args, timeoutMs); }

  // 大文件不能一次塞进消息：base64 后单请求受内核 8 MiB 体积限制。
  // 3 MiB 原始字节 → 4 MiB base64，留出 JSON 包装的余量。
  var FILE_CHUNK = 3 * 1024 * 1024;

  function bytesToBase64(view) {
    var out = '';
    for (var i = 0; i < view.length; i += 0x8000) {
      out += String.fromCharCode.apply(null, view.subarray(i, i + 0x8000));
    }
    return btoa(out);
  }

  function base64ToBytes(raw) {
    var bin = atob(String(raw || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  window.NexlOS = {
    version: 1,
    hostless: hostless,
    ready: ready,
    call: call,
    storage: {
      get: function (key) { return call('app.storage.get', { key: key }).then(function (d) { return d ? d.value : null; }); },
      set: function (key, value) { return call('app.storage.set', { key: key, value: String(value) }); },
      remove: function (key) { return call('app.storage.remove', { key: key }); },
      keys: function () { return call('app.storage.keys', {}).then(function (d) { return (d && d.keys) || []; }); },
    },
    files: {
      put: function (name, bytes) {
        var view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        var one = view.length ? null : call('app.files.put', { name: name, data: '', done: true }, 60000);
        if (one) return one.then(function () { return { name: name, bytes: 0 }; });
        var chain = Promise.resolve();
        for (var off = 0; off < view.length; off += FILE_CHUNK) {
          (function (start) {
            var end = Math.min(start + FILE_CHUNK, view.length);
            var last = end >= view.length;
            chain = chain.then(function () {
              return call('app.files.put', {
                name: name,
                data: bytesToBase64(view.subarray(start, end)),
                append: start > 0,
                done: last,
              }, 60000);
            });
          })(off);
        }
        return chain.then(function () { return { name: name, bytes: view.length }; });
      },
      get: function (name) {
        return call('app.files.get', { name: name }, 120000).then(function (d) {
          return { name: name, bytes: (d && d.bytes) || 0, data: base64ToBytes(d && d.data) };
        });
      },
      list: function () {
        return call('app.files.list', {}, 15000).then(function (d) { return (d && d.files) || []; });
      },
      remove: function (name) { return call('app.files.remove', { name: name }, 15000); },
    },
    clipboard: {
      read: function () { return call('app.clipboard.read', {}).then(function (d) { return d ? d.text : ''; }); },
      write: function (text) { return call('app.clipboard.write', { text: String(text) }); },
    },
    notify: function (title, body) { return call('app.notify', { title: title, body: body }); },
    open: function (url) { return call('app.open', { url: url }); },
    theme: {
      get: function () { return call('app.theme.get', {}); },
      onChange: function (fn) {
        if (typeof fn !== 'function') return function () {};
        function wrapped(name, data) { if (name === 'theme.changed') fn(data); }
        listeners.push(wrapped);
        return function () {
          var i = listeners.indexOf(wrapped);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
    },
    invoke: function (name, args) { return request('invoke', name, args); },
  };

  // 先报到：宿主可能在客户端脚本执行前就发过 hello，用 ping 补一次握手。
  post({ v: 1, type: 'nexlos.bridge.ping' });
})();
