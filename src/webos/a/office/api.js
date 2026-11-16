/* 与 Go 服务通信的唯一出口。UI 不直接拼 fetch，方便以后换传输层。 */
(function (global) {
  'use strict';

  // 后端根路径。默认从 api.js 自己的 <script src> 推导：
  //   - 独立运行（/app.js）→ 空，请求同源 /api/…
  //   - 挂在 NEXLOS 的 /a/office/ 下 → /a/office，请求 /a/office/api/…
  // 需要指向别的进程时，在页面里先设 window.NEXL_OFFICE_API。
  var BASE = (function () {
    if (global.NEXL_OFFICE_API !== undefined && global.NEXL_OFFICE_API !== null) {
      return String(global.NEXL_OFFICE_API).replace(/\/+$/, '');
    }
    var s = document.currentScript;
    if (!s || !s.src) {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src) { s = all[i]; break; }
      }
    }
    if (!s || !s.src) return '';
    var href = s.src;
    var origin = global.location.origin || '';
    if (origin && href.indexOf(origin) === 0) href = href.slice(origin.length);
    return href.replace(/\/[^\/]*$/, '');
  })();

  function u(path) { return BASE + path; }

  function request(method, url, body) {
    var opts = {
      method: method,
      headers: {},
      credentials: 'same-origin'
    };
    if (body !== undefined && body !== null) {
      if (body instanceof Blob) {
        opts.body = body;
      } else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    return fetch(u(url), opts).then(function (res) {
      var ct = res.headers.get('Content-Type') || '';
      var parse = ct.indexOf('application/json') >= 0 ? res.json() : res.text();
      return parse.then(function (data) {
        if (!res.ok) {
          var msg = data && data.error ? data.error : ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          // 409 时服务端会带上当前 rev / savedAt，前端不必再发一次 GET。
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  global.API = {
    base: BASE,
    health: function () { return request('GET', '/api/health'); },
    capabilities: function () { return request('GET', '/api/capabilities'); },
    list: function () { return request('GET', '/api/files'); },
    get: function (id) { return request('GET', '/api/files/' + encodeURIComponent(id)); },
    create: function (kind, title) {
      return request('POST', '/api/files', { kind: kind, title: title || '' });
    },
    save: function (doc, rev) {
      return request('PUT', '/api/files/' + encodeURIComponent(doc.id), { doc: doc, rev: rev });
    },
    // 自动保存：token 是幂等键，同一 token 重试不会变成 409。
    saveAuto: function (doc, rev, token) {
      return request('POST', '/api/files/' + encodeURIComponent(doc.id) + '/autosave', {
        doc: doc, rev: rev, token: token || ''
      });
    },
    remove: function (id, rev) {
      return request('DELETE', '/api/files/' + encodeURIComponent(id) + (rev ? '?rev=' + rev : ''));
    },
    importFile: function (file) {
      return request('POST', '/api/import?name=' + encodeURIComponent(file.name), file);
    },
    exportUrl: function (id, format) {
      return u('/api/export/' + encodeURIComponent(id) + '?format=' + encodeURIComponent(format));
    },
    // 另存为：saveAs(id, 文件名, 格式) 生成工作区副本（返回 {id, title, doc}）。
    // 需要直接下载字节时用 saveAsDownload / exportUrl。
    saveAs: function (id, title, format, mode) {
      return request('POST', '/api/files/' + encodeURIComponent(id) + '/save-as', {
        format: format || '', mode: mode || 'copy', title: title || ''
      });
    },
    saveAsDownload: function (id, format) {
      return request('POST', '/api/files/' + encodeURIComponent(id) + '/save-as', {
        format: format || '', mode: 'export'
      });
    },
    rawUrl: function (id) {
      return u('/api/raw/' + encodeURIComponent(id));
    },
    recovery: function () { return request('GET', '/api/recovery'); },
    resolveRecovery: function (txn, action, force) {
      return request('POST', '/api/recovery', { txn: txn, action: action, force: !!force });
    },
    recoveryAudit: function (limit) {
      return request('GET', '/api/recovery/audit' + (limit ? '?limit=' + limit : ''));
    },
    printers: function () { return request('GET', '/api/printers'); },
    // 打印：服务端只提交一次，绝不自动重试（重复提交会重复出纸）。
    // token 每次点击生成一次；同一个 token 重发（例如用户手滑双击）只算一次作业。
    print: function (id, printer, format, opts) {
      opts = opts || {};
      return request('POST', '/api/print', {
        id: id,
        printer: printer || '',
        format: format || 'auto',
        copies: opts.copies || 1,
        pages: opts.pages || '',
        title: opts.title || '',
        landscape: !!opts.landscape,
        token: opts.token || ('p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
      });
    },
    printDocument: function (payload) { return request('POST', '/api/print', payload); }
  };
})(window);
