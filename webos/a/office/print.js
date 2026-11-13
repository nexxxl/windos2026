/* 打印的浏览器兜底通道：window.print() + 专用打印视图。
 * ES5，Chrome 72 可用。它不替代服务端的 CUPS 打印（POST /api/print），
 * 而是保证任何环境（含没配打印机的机器、iPad、嵌入 WebOS 的 iframe）都能出纸。
 *
 * 用法（见 docs/06-save-recovery-print.md 的接线说明）：
 *   <script src="print.js"></script>
 *   <button id="btnPrint">打印</button>          → 自动绑定 Print.printView()
 *   <button data-print="export">打印导出版</button> → 打印服务端渲染的 HTML
 *   Print.printViaServer(id, printer, opts)      → 走 CUPS，返回 {jobId,…}
 */
(function (global) {
  'use strict';

  // 资源根，与 api.js 同一套推导规则：独立运行是 ''，挂 /a/office/ 下是 '/a/office'。
  var ASSET = (function () {
    var s = global.NEXL_OFFICE_PRINT_ASSET;
    if (s !== undefined && s !== null) return String(s).replace(/\/+$/, '');
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && /print\.js(\?|$)/.test(all[i].src)) {
        var href = all[i].src;
        var origin = global.location.origin || '';
        if (origin && href.indexOf(origin) === 0) href = href.slice(origin.length);
        return href.replace(/\/[^\/]*$/, '');
      }
    }
    return '';
  })();

  // 打印专用 CSS：去掉屏幕外壳，只留内容；A4 与分页规则按 Office 的习惯。
  var CSS = [
    '@page { size: A4; margin: 18mm 16mm; }',
    'html, body { margin: 0; padding: 0; background: #fff; color: #111; }',
    'body { font: 12pt/1.65 -apple-system, "PingFang SC", "Songti SC", Georgia, serif; }',
    'a { color: inherit; text-decoration: none; }',
    /* 屏幕外壳一律不打印 */
    '.ribbon, .doc-toolbar, .sheet-toolbar, .md-toolbar, .formula-bar, .topbar, .side,',
    '.sidebar, .save-state, .toast, .doc-ruler, .sheet-gutter, .menu, .print-hide { display: none !important; }',
    /* 纸张：打印时不要阴影、缩放与固定宽度 */
    '.doc-pages { padding: 0 !important; background: #fff !important; }',
    '.doc-page, .page { box-shadow: none !important; margin: 0 !important; width: auto !important;',
    '  min-height: 0 !important; padding: 0 !important; background: #fff !important; border: 0 !important; }',
    '.doc-page + .doc-page { page-break-before: always; }',
    /* 表格与图片不要被撕开 */
    'table { border-collapse: collapse; page-break-inside: auto; }',
    'tr, img, thead { page-break-inside: avoid; }',
    'thead { display: table-header-group; }',
    'h1, h2, h3, h4 { page-break-after: avoid; }',
    /* 演示：一页一张 */
    '.slide-stage { background: #fff !important; padding: 0 !important; }',
    '.slide-canvas { transform: none !important; }',
    '.slide, .slide-page { page-break-after: always; box-shadow: none !important; margin: 0 auto 12mm !important; }'
  ].join('\n');

  var VIEW_CONTENT = {
    viewDoc: 'docEditor',
    viewSheet: 'sheetScroll',
    viewSlide: 'slideStage',
    viewMarkdown: 'mdPreview',
    viewHtml: 'htmlPreview',
    viewPdf: 'pdfFrame'
  };

  function frameHTML(inner) {
    var css = ASSET + '/app.css';
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<title>' + OT('打印') + '</title>' +
      '<link rel="stylesheet" href="' + css + '">' +
      '<style>' + CSS + '</style></head><body>' + inner + '</body></html>';
  }

  function makeFrame() {
    var f = document.createElement('iframe');
    f.setAttribute('title', OT('打印'));
    f.setAttribute('aria-hidden', 'true');
    f.style.position = 'fixed';
    f.style.right = '0';
    f.style.bottom = '0';
    f.style.width = '1px';
    f.style.height = '1px';
    f.style.opacity = '0';
    f.style.border = '0';
    f.style.pointerEvents = 'none';
    document.body.appendChild(f);
    return f;
  }

  function removeFrame(f, delay) {
    setTimeout(function () {
      if (f && f.parentNode) f.parentNode.removeChild(f);
    }, delay || 0);
  }

  // 打印一个已加载完成的 iframe。调用方负责在打印结束后清理。
  function printFrame(f) {
    try {
      f.contentWindow.focus();
      f.contentWindow.print();
      return true;
    } catch (e) {
      if (global.console && console.warn) console.warn('打印失败：' + e.message);
      return false;
    }
  }

  function printHTML(html, done) {
    var f = makeFrame();
    var doc = f.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    var fired = false;
    function fire() {
      if (fired) return;
      fired = true;
      var ok = printFrame(f);
      // 打印对话框是异步的，立刻移除 iframe 会让部分浏览器打出空白页。
      removeFrame(f, ok ? 60000 : 0);
      if (done) done(ok);
    }
    // 样式与字体加载完成后再打印；离线或资源缺失时最多等 400ms。
    var started = new Date().getTime();
    (function poll() {
      if (fired) return;
      var ready = false;
      try {
        ready = doc.readyState === 'complete' && doc.body && doc.body.childNodes.length > 0;
      } catch (e) {
        ready = true;
      }
      if (ready || new Date().getTime() - started > 400) {
        fire();
        return;
      }
      setTimeout(poll, 50);
    })();
  }

  function visibleView() {
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) {
      if (!views[i].hidden) return views[i];
    }
    return null;
  }

  function printNode(node, done) {
    if (!node) return false;
    printHTML(frameHTML(node.outerHTML), done);
    return true;
  }

  // 打印当前视图（本地 DOM，最快、所见即所得）。
  function printView(done) {
    var view = visibleView();
    if (!view) return false;
    var id = VIEW_CONTENT[view.id];
    var node = id ? document.getElementById(id) : null;
    if (view.id === 'viewHtml' && node) {
      // HTML 预览本身是 iframe，取它的文档太脆，直接打印导出的 HTML。
      return false;
    }
    if (!node) node = view;
    return printNode(node, done);
  }

  // 打印服务端渲染的 HTML（版式更接近导出件，适合正式出纸）。
  function printExport(id, format, done) {
    if (!id || !global.API || !global.API.exportUrl) return false;
    var f = makeFrame();
    f.onload = function () {
      setTimeout(function () {
        var ok = printFrame(f);
        removeFrame(f, ok ? 60000 : 0);
        if (done) done(ok);
      }, 150);
    };
    f.src = global.API.exportUrl(id, format || 'html');
    return true;
  }

  // 走本机 CUPS（WiFi/蓝牙打印机由 macOS 统一管理）。不重试。
  function printViaServer(id, printer, opts) {
    opts = opts || {};
    if (!global.API || !global.API.printDocument) {
      return Promise.reject(new Error(OT('API 未就绪')));
    }
    var token = opts.token || ('p-' + new Date().getTime() + '-' + Math.random().toString(36).slice(2, 8));
    return global.API.printDocument({
      id: id,
      printer: printer || '',
      format: opts.format || 'auto',
      copies: opts.copies || 1,
      pages: opts.pages || '',
      title: opts.title || '',
      landscape: !!opts.landscape,
      token: token
    });
  }

  function listPrinters() {
    if (!global.API || !global.API.printers) return Promise.resolve({ printers: [], available: false });
    return global.API.printers();
  }

  function bind() {
    var btn = document.getElementById('btnPrint');
    if (btn && !btn.__nexlPrintBound) {
      btn.__nexlPrintBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        printView();
      });
    }
    var menu = document.getElementById('printMenu');
    if (menu && !menu.__nexlPrintBound) {
      menu.__nexlPrintBound = true;
      menu.addEventListener('click', function (e) {
        var t = e.target;
        while (t && t !== menu && !t.getAttribute('data-print')) t = t.parentNode;
        if (!t || t === menu) return;
        var mode = t.getAttribute('data-print');
        var docId = t.getAttribute('data-id') || '';
        if (mode === 'export' && docId) printExport(docId, 'html');
        else printView();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  global.Print = {
    css: CSS,
    frameHTML: frameHTML,
    printHTML: printHTML,
    printNode: printNode,
    printView: printView,
    printExport: printExport,
    printViaServer: printViaServer,
    listPrinters: listPrinters,
    bind: bind
  };
})(window);
