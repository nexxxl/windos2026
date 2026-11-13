/* 应用编排：文件列表、打开/保存、导入导出、打印。
   业务状态只有一份：App.doc。编辑器改动统一走 markDirty。 */
(function (global) {
  'use strict';

  var App = {
    files: [],
    doc: null,
    rev: 0,
    dirty: false,
    saving: false,
    timer: null,
    caps: null,
    // 自动保存：同一批内容复用同一个 token，重试不会写成两个版本。
    saveToken: '',
    saveQueued: false,
    saveError: '',
    failures: 0,
    retryTimer: null,
    wordTimer: null,
    outlineTimer: null,
    recovery: null
  };

  // 幂等键：一次内容变更生成一次，失败重试沿用，成功后作废。
  function newSaveToken() {
    return 'a-' + new Date().getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  var el = {};

  function $(id) { return document.getElementById(id); }

  function kindLabel(kind) {
    return ({ doc: 'Word', sheet: 'Excel', slide: 'PPT', markdown: 'Markdown', html: 'HTML', pdf: 'PDF' })[kind] || kind;
  }

  function kindToNewLabel(kind) { return kindLabel(kind); }

  function toast(msg, bad) {
    var t = el.toast;
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(t.__timer);
    t.__timer = setTimeout(function () { t.hidden = true; }, bad ? 4200 : 2200);
  }

  function setState(text, cls) {
    el.saveState.textContent = text || '';
    el.saveState.className = 'status-save' + (cls ? ' ' + cls : '');
  }

  /* ---------------- 首次加载 ---------------- */

  function boot() {
    el = {
      title: $('titleInput'), saveState: $('saveState'), fileList: $('fileList'),
      recent: $('recentGrid'), home: $('viewHome'), exportMenu: $('exportMenu'),
      btnExport: $('btnExport'), btnDelete: $('btnDelete'), toast: $('toast'),
      sidebar: $('sidebar'), statusInfo: $('statusInfo'),
      docPageStat: $('docPageStat'), docZoomWrap: $('docZoomWrap'),
      docWordStat: $('docWordStat'),
      outlinePanel: $('outlinePanel'), outlineList: $('outlineList'),
      mdInput: $('mdInput'), htmlInput: $('htmlInput')
    };
    bindGlobal();
    initMenubar();
    initDialog();
    initRecovery();
    // 大纲高亮跟着滚动走；用短 debounce，避免每次滚动都量一遍所有标题。
    var scroller = document.querySelector('.doc-scroll');
    if (scroller) {
      scroller.addEventListener('scroll', function () {
        clearTimeout(App.outlineTimer);
        App.outlineTimer = setTimeout(highlightOutline, 140);
        // 标尺在滚动区外，横向滚动时把纸张位置重新贴上去。
        // 直接量一次即可：成本只有一次 getBoundingClientRect，刻度没变就不重建 DOM。
        ED.updateRuler();
      });
    }
    bindDocToolbar();
    bindSheetToolbar();
    bindSlideToolbar();
    Promise.all([API.capabilities(), API.list()]).then(function (res) {
      App.caps = res[0];
      App.files = res[1].files || [];
      if (App.caps.version) $('versionText').textContent = 'v' + App.caps.version;
      renderList();
      renderRecent();
      // ?doc=<id> 从「文稿」直接进来；否则回到上次编辑的文件。
      var wanted = '';
      try { wanted = new URLSearchParams(location.search).get('doc') || ''; } catch (e) {}
      var last = '';
      try { last = localStorage.getItem('office.last') || ''; } catch (e) {}
      var target = wanted || last;
      if (target && App.files.some(function (f) { return f.id === target; })) openDoc(target);
    }).catch(function (e) {
      toast('无法连接本地服务：' + e.message, true);
    });
    checkRecovery();
    global.addEventListener('beforeunload', function (e) {
      if (!App.dirty) return;
      // 关标签页时 fetch 会被掐断，用 beacon 把最后一版交给服务端；
      // 幂等 token 保证它和正在进行的保存只会落成一个版本。
      try {
        if (App.doc && navigator.sendBeacon) {
          collect();
          var body = JSON.stringify({ doc: App.doc, rev: App.rev, token: App.saveToken || newSaveToken() });
          navigator.sendBeacon(
            API.base + '/api/files/' + encodeURIComponent(App.doc.id) + '/autosave',
            new Blob([body], { type: 'application/json' })
          );
        }
      } catch (err) {}
      e.preventDefault();
      e.returnValue = '';
    });
    global.addEventListener('resize', function () {
      if (App.doc && App.doc.kind === 'slide') {
        ED.renderSlides(App.doc, $('slideStage'), $('slideCanvas'));
      }
      if (App.doc && App.doc.kind === 'doc') {
        clearTimeout(global.__docResizeTimer);
        global.__docResizeTimer = setTimeout(function () {
          ED.paginate(App.doc);
          ED.applyZoom();
          ED.updateRuler();
        }, 180);
      }
    });
  }

  function bindGlobal() {
    document.addEventListener('click', function (e) {
      var nb = e.target.closest ? e.target.closest('[data-new]') : null;
      if (nb) {
        if (App.dirty) saveNow();
        var kind = nb.getAttribute('data-new');
        // PDF 没有“空白新建”：入口直接打开文件选择器，导入后进入只读页面视图。
        if (kind === 'pdf') { $('pdfInput').click(); return; }
        createDoc(kind);
        return;
      }
      if (!el.exportMenu.hidden && !e.target.closest('.menu-wrap')) el.exportMenu.hidden = true;
      // 工具菜单点在菜单外就收起；菜单项自己在动作后关闭。
      if (!e.target.closest('.menu-wrap')) closeToolMenus();
    });

    $('btnHome').addEventListener('click', function () { saveIfNeeded(); showHome(); });
    $('toolClose').addEventListener('click', closeTool);
    $('toolMask').addEventListener('click', function (e) {
      // 点遮罩空白处关闭；点工具壳内部不关。
      if (e.target === $('toolMask')) closeTool();
    });
    // 焦点在工具页里时 Escape 也要能关：同源 iframe 直接补一个键盘监听。
    $('toolFrame').addEventListener('load', function () {
      try {
        this.contentDocument.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') closeTool();
        });
      } catch (err) {}
    });
    $('fileInput').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importFile(f);
    });
    $('pdfInput').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importFile(f);
    });
    $('pdfPrev').addEventListener('click', function () { ED.movePdfPage(-1); });
    $('pdfNext').addEventListener('click', function () { ED.movePdfPage(1); });
    $('pdfPage').addEventListener('change', function () { ED.setPdfPage(parseInt(this.value, 10) || 1); });
    $('pdfZoom').addEventListener('change', function () { ED.setPdfZoom(this.value); });
    $('pdfThumbs').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-page]') : null;
      if (b) ED.setPdfPage(parseInt(b.getAttribute('data-page'), 10) || 1);
    });
    $('btnSidebar').addEventListener('click', function () { el.sidebar.classList.toggle('open'); });
    $('btnExport').addEventListener('click', function (e) {
      e.stopPropagation();
      el.exportMenu.hidden = !el.exportMenu.hidden;
    });
    $('btnDelete').addEventListener('click', deleteDoc);
    el.title.addEventListener('input', function () {
      if (!App.doc) return;
      App.doc.title = el.title.value;
      markDirty();
    });
    el.title.addEventListener('blur', function () { saveIfNeeded(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeTool();
        return;
      }
      var mod = e.metaKey || e.ctrlKey;
      // F9：更新目录，和 Word 的域更新是同一个键。
      if (e.key === 'F9' && App.doc && App.doc.kind === 'doc') {
        e.preventDefault();
        ED.updateToc();
        return;
      }
      if (!mod) return;
      var k = e.key.toLowerCase();
      if (k === 's' && e.shiftKey) {
        e.preventDefault();
        if (App.doc) openSaveAs();
      } else if (k === 's') {
        e.preventDefault();
        saveNow();
      } else if (k === 'p') {
        e.preventDefault();
        if (App.doc) openPrint();
      } else if (k === 'o') {
        e.preventDefault();
        saveIfNeeded();
        showHome();
      } else if (k === 'n') {
        e.preventDefault();
        createDoc('doc');
      }
    });

    el.saveState.addEventListener('click', function () {
      if (!App.doc || el.saveState.className.indexOf('error') < 0) return;
      if (App.saveError === 'conflict') {
        App.dirty = false;
        openDoc(App.doc.id);
      } else {
        App.saveError = '';
        saveNow();
      }
    });

    $('formulaInput').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !App.doc) return;
      e.preventDefault();
      ED.commitFormula(App.doc, ED.activeCell(), $('formulaInput').value);
    });
  }

  /* ---------------- 工具面板：离线三件套 ---------------- */

  var TOOL_PAGES = {
    qrcode: { title: '二维码生成', file: 'tools/qrcode.html' },
    wechat: { title: 'Markdown 转公众号排版', file: 'tools/md-to-wechat.html' },
    x: { title: 'Markdown 转 X 线程', file: 'tools/md-to-x.html' }
  };

  // 独立运行时页面在 /，内嵌在 /a/office/；以当前文档 URL 为基准都能落到 ui/tools。
  // embed=1 让工具页收起自己的标题栏并换成便捷办公的纸张配色。
  function toolUrl(file, embed) {
    var url = file;
    try { url = new URL(file, location.href).href; } catch (e) {}
    if (!embed) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'embed=1';
  }

  function openTool(key) {
    var t = TOOL_PAGES[key];
    if (!t) return;
    closeMenubarMenus();
    closeToolMenus();
    $('toolTitle').textContent = t.title;
    var plainUrl = toolUrl(t.file, false);
    var url = toolUrl(t.file, true);
    $('toolOpen').href = plainUrl;
    var frame = $('toolFrame');
    // 同一个工具再次打开时保留输入，切换工具才换 src。
    if (frame.getAttribute('src') !== url) frame.src = url;
    $('toolMask').hidden = false;
  }

  function closeTool() {
    var mask = $('toolMask');
    if (!mask || mask.hidden) return;
    mask.hidden = true;
    // 关掉 iframe 释放工具页状态与定时器，下次打开从干净状态开始。
    $('toolFrame').src = 'about:blank';
  }

  /* ---------------- 菜单栏 / 对话框 / 状态栏 ---------------- */

  var menuDefs = [
    { id: 'file', label: '文件', items: [
      { label: '新建 Word', act: function () { createDoc('doc'); } },
      { label: '新建 Excel', act: function () { createDoc('sheet'); } },
      { label: '新建 PPT', act: function () { createDoc('slide'); } },
      { label: '新建 Markdown', act: function () { createDoc('markdown'); } },
      { label: '新建 HTML', act: function () { createDoc('html'); } },
      { sep: true },
      { label: '保存', shortcut: 'Ctrl+S', act: function () { saveNow(); }, needDoc: true },
      { label: '另存为…', shortcut: 'Ctrl+Shift+S', act: openSaveAs, needDoc: true },
      { label: '打印…', shortcut: 'Ctrl+P', act: openPrint, needDoc: true },
      { sep: true },
      { label: '重命名…', act: openRename, needDoc: true },
      { label: '删除文件', act: confirmDeleteDoc, needDoc: true },
      { sep: true },
      { label: '关闭', act: function () { saveIfNeeded(); showHome(); } }
    ] },
    { id: 'edit', label: '编辑', items: [
      { label: '撤销', shortcut: 'Ctrl+Z', act: function () { document.execCommand('undo', false, null); }, needDoc: true },
      { label: '重做', shortcut: 'Ctrl+Y', act: function () { document.execCommand('redo', false, null); }, needDoc: true },
      { sep: true },
      { label: '剪切', shortcut: 'Ctrl+X', act: function () { document.execCommand('cut', false, null); }, needDoc: true },
      { label: '复制', shortcut: 'Ctrl+C', act: function () { document.execCommand('copy', false, null); }, needDoc: true },
      { label: '粘贴', shortcut: 'Ctrl+V', act: function () { document.execCommand('paste', false, null); }, needDoc: true },
      { label: '全选', shortcut: 'Ctrl+A', act: function () { document.execCommand('selectAll', false, null); }, needDoc: true }
    ] },
    { id: 'view', label: '视图', items: [
      { label: '显示大纲', act: toggleOutline, needDoc: true },
      { label: '阅读比例：100%', act: function () { ED.setZoom('100'); } },
      { label: '阅读比例：页宽', act: function () { ED.setZoom('pagewidth'); } },
      { label: '阅读比例：整页', act: function () { ED.setZoom('pageheight'); } },
      { label: '阅读比例：双页', act: function () { ED.setZoom('twopage'); } },
      { label: '阅读比例：四页', act: function () { ED.setZoom('fourpage'); } }
    ] },
    { id: 'insert', label: '插入', items: [
      { label: '表格', act: function () { ED.insertTable(3); }, needDoc: true },
      { label: '链接…', act: function () { $('docLinkBtn').click(); }, needDoc: true },
      { label: '分页符', act: function () { ED.insertSimpleBlock('pagebreak'); }, needDoc: true },
      { label: '分隔线', act: function () { ED.insertSimpleBlock('hr'); }, needDoc: true },
      { sep: true },
      { label: '目录（标题 1–3）', act: function () { ED.insertToc(3); }, needDoc: true },
      { label: '目录（标题 1–4）', act: function () { ED.insertToc(4); }, needDoc: true },
      { label: '更新目录', shortcut: 'F9', act: function () { ED.updateToc(); }, needDoc: true },
      { sep: true },
      { label: '页面设置…', act: function () { $('docPage').click(); }, needDoc: true }
    ] },
    { id: 'format', label: '格式', items: [
      { label: '加粗', shortcut: 'Ctrl+B', act: function () { ED.exec('bold'); }, needDoc: true },
      { label: '斜体', shortcut: 'Ctrl+I', act: function () { ED.exec('italic'); }, needDoc: true },
      { label: '下划线', shortcut: 'Ctrl+U', act: function () { ED.exec('underline'); }, needDoc: true },
      { label: '删除线', act: function () { ED.exec('strikeThrough'); }, needDoc: true },
      { label: '清除格式', act: function () { ED.clearFormat(); }, needDoc: true },
      { sep: true },
      { label: '左对齐', act: function () { ED.setAlign('left'); }, needDoc: true },
      { label: '居中', act: function () { ED.setAlign('center'); }, needDoc: true },
      { label: '右对齐', act: function () { ED.setAlign('right'); }, needDoc: true },
      { label: '两端对齐', act: function () { ED.setAlign('justify'); }, needDoc: true },
      { sep: true },
      { label: '项目符号', act: function () { ED.setList(false); }, needDoc: true },
      { label: '编号', act: function () { ED.setList(true); }, needDoc: true }
    ] },
    { id: 'table', label: '表格', items: [
      { label: '插入 3 × 3 表格', act: function () { ED.insertTable(3); }, needDoc: true },
      { label: '增加 20 行', act: function () { $('btnMoreRows').click(); } },
      { label: '增加 5 列', act: function () { $('btnMoreCols').click(); } }
    ] },
    { id: 'tools', label: '工具', items: [
      { label: '二维码生成', act: function () { openTool('qrcode'); } },
      { label: 'Markdown 转公众号排版', act: function () { openTool('wechat'); } },
      { label: 'Markdown 转 X 线程', act: function () { openTool('x'); } },
      { sep: true },
      { label: '自动保存：开', act: function () { toast('自动保存已开启：停止输入 1.2 秒后写盘'); } },
      { label: '打印设置…', act: openPrint, needDoc: true },
      { label: '关于便捷办公', act: function () { toast('便捷办公 · NexlOS 内置 Office'); } }
    ] },
    { id: 'help', label: '帮助', items: [
      { label: '快捷键：Ctrl+S 保存 / Ctrl+P 打印 / Ctrl+Shift+S 另存为', act: function () { toast('Ctrl+S 保存，Ctrl+Shift+S 另存为，Ctrl+P 打印'); } },
      { label: '页面视图与分页说明', act: function () { toast('页面视图按 A4 自动分页；状态栏可切换页宽、整页、双页、四页'); } }
    ] }
  ];

  var dlgState = { ok: null, body: null };

  function closeMenubarMenus() {
    var menus = document.querySelectorAll('.menubar-menu');
    for (var i = 0; i < menus.length; i++) menus[i].hidden = true;
    var btns = document.querySelectorAll('.menu-btn.open');
    for (var j = 0; j < btns.length; j++) btns[j].classList.remove('open');
  }

  // 菜单只保留 Office 一套；PDF 的阅读控制放在阅读器自己的工具条里。
  function initMenubar() {
    var host = $('menubarMenus');
    if (!host) return;
    host.innerHTML = '';
    menuDefs.forEach(function (def) {
      var wrap = document.createElement('div');
      wrap.className = 'menu-wrap';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-btn';
      btn.textContent = def.label;
      var menu = document.createElement('div');
      menu.className = 'menubar-menu';
      menu.hidden = true;
      def.items.forEach(function (it) {
        if (it.sep) {
          var hr = document.createElement('div');
          hr.className = 'mi-sep';
          menu.appendChild(hr);
          return;
        }
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-need-doc', it.needDoc ? '1' : '0');
        var label = document.createElement('span');
        label.textContent = it.label;
        b.appendChild(label);
        if (it.shortcut) {
          var sc = document.createElement('span');
          sc.className = 'mi-shortcut';
          sc.textContent = it.shortcut;
          b.appendChild(sc);
        }
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          closeMenubarMenus();
          if (it.needDoc && !App.doc) { toast('先打开一个文件', true); return; }
          try { it.act(); } catch (err) { toast('操作失败：' + err.message, true); }
        });
        menu.appendChild(b);
      });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var wasOpen = !menu.hidden;
        closeMenubarMenus();
        if (!wasOpen) {
          menu.hidden = false;
          btn.classList.add('open');
        }
      });
      wrap.appendChild(btn);
      wrap.appendChild(menu);
      host.appendChild(wrap);
    });
    if (!initMenubar.bound) {
      document.addEventListener('click', function () { closeMenubarMenus(); });
      initMenubar.bound = true;
    }
    refreshMenuState();
  }

  function refreshMenuState() {
    var btns = document.querySelectorAll('.menubar-menu button[data-need-doc]');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('data-need-doc') === '1') btns[i].disabled = !App.doc;
    }
  }

  function initDialog() {
    if (document.getElementById('dlgMask')) return;
    var mask = document.createElement('div');
    mask.className = 'dialog-mask';
    mask.id = 'dlgMask';
    mask.hidden = true;
    mask.innerHTML =
      '<div class="dialog" role="dialog" aria-modal="true">' +
      '<div class="dlg-head"><span id="dlgTitle"></span>' +
      '<button class="icon-btn" id="dlgX" aria-label="关闭">✕</button></div>' +
      '<div class="dlg-body" id="dlgBody"></div>' +
      '<div class="dlg-foot"><button class="btn" id="dlgCancel">取消</button>' +
      '<button class="btn btn-primary" id="dlgOk">确定</button></div></div>';
    document.body.appendChild(mask);
    document.getElementById('dlgX').addEventListener('click', closeDialog);
    document.getElementById('dlgCancel').addEventListener('click', closeDialog);
    document.getElementById('dlgOk').addEventListener('click', function () {
      if (dlgState.ok) dlgState.ok();
    });
    mask.addEventListener('mousedown', function (e) {
      if (e.target === mask) closeDialog();
    });
  }

  function openDialog(title, body, onOk, okLabel) {
    initDialog();
    var mask = document.getElementById('dlgMask');
    document.getElementById('dlgTitle').textContent = title;
    var host = document.getElementById('dlgBody');
    host.innerHTML = '';
    if (body) host.appendChild(body);
    document.getElementById('dlgOk').textContent = okLabel || '确定';
    dlgState.ok = onOk || null;
    mask.hidden = false;
    var first = host.querySelector('input, select, textarea');
    if (first) setTimeout(function () { first.focus(); }, 20);
  }

  function closeDialog() {
    var mask = document.getElementById('dlgMask');
    if (mask) mask.hidden = true;
    dlgState.ok = null;
  }

  function dialogField(labelText, control) {
    var label = document.createElement('label');
    label.className = 'dlg-field';
    var span = document.createElement('span');
    span.textContent = labelText;
    label.appendChild(span);
    label.appendChild(control);
    return label;
  }

  function openRename() {
    if (!App.doc) return;
    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'dlgRename';
    input.value = App.doc.title;
    var body = document.createElement('div');
    body.appendChild(dialogField('文件名', input));
    openDialog('重命名', body, function () {
      var v = input.value.trim();
      if (!v) { toast('文件名不能为空', true); return; }
      App.doc.title = v;
      el.title.value = v;
      markDirty();
      saveNow();
      renderList();
      refreshStatus();
      closeDialog();
    });
  }

  function confirmDeleteDoc() {
    if (!App.doc) return;
    var body = document.createElement('div');
    var p = document.createElement('p');
    p.className = 'dlg-hint';
    p.textContent = '确定删除「' + App.doc.title + '」？文件会从工作区移除，不能恢复。';
    body.appendChild(p);
    openDialog('删除文件', body, function () {
      closeDialog();
      var docId = App.doc.id;
      API.remove(docId, App.rev).then(function () {
        toast('已删除');
        App.doc = null;
        App.dirty = false;
        showHome();
        refreshList();
      }).catch(function (e) { toast('删除失败：' + e.message, true); });
    }, '删除');
  }

  function exportFormats(kind) {    return {
      doc: [['docx', 'Word (.docx)'], ['md', 'Markdown (.md)'], ['html', 'HTML (.html)']],
      sheet: [['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV (.csv)']],
      slide: [['pptx', 'PowerPoint (.pptx)']],
      markdown: [['md', 'Markdown (.md)'], ['html', 'HTML (.html)'], ['docx', 'Word (.docx)']],
      html: [['html', 'HTML (.html)'], ['docx', 'Word (.docx)']],
      pdf: []
    }[kind] || [];
  }

  function openSaveAs() {
    if (!App.doc) return;
    var formats = exportFormats(App.doc.kind);
    if (!formats.length) { toast('PDF 文件不需要另存为', true); return; }
    var title = document.createElement('input');
    title.type = 'text';
    title.value = App.doc.title + OT('（副本）');
    var fmt = document.createElement('select');
    formats.forEach(function (f) {
      var o = document.createElement('option');
      o.value = f[0];
      o.textContent = f[1];
      fmt.appendChild(o);
    });
    var body = document.createElement('div');
    body.appendChild(dialogField('文件名', title));
    body.appendChild(dialogField('格式', fmt));
    var hint = document.createElement('p');
    hint.className = 'dlg-hint';
    hint.textContent = '另存为会生成一个新文件，原文件保持不变。';
    body.appendChild(hint);
    openDialog('另存为', body, function () {
      var name = title.value.trim();
      if (!name) { toast('文件名不能为空', true); return; }
      closeDialog();
      saveIfNeeded().then(function () {
        if (API.saveAs) {
          API.saveAs(App.doc.id, name, fmt.value).then(function (res) {
            if (res && res.id) {
              refreshList();
              toast('已另存为「' + (res.title || name) + '」');
            } else {
              toast('已生成副本');
            }
          }).catch(function (e) { toast('另存为失败：' + e.message, true); });
        } else {
          // 后端尚未提供 save-as 时，至少导出一份所选格式。
          doExport(fmt.value);
          toast('已导出所选格式');
        }
      });
    }, '保存');
  }

  function printCss() {
    document.body.classList.add('printing');
    setTimeout(function () { document.body.classList.remove('printing'); }, 800);
  }

  function openPrint() {
    if (!App.doc) return;
    var body = document.createElement('div');
    var sel = document.createElement('select');
    var info = document.createElement('p');
    info.className = 'dlg-hint';
    info.textContent = '正在查找打印机…';
    body.appendChild(dialogField('打印机', sel));
    body.appendChild(info);

    function fill(list) {
      sel.innerHTML = '';
      var local = document.createElement('option');
      local.value = '';
      local.textContent = '浏览器打印 / 系统打印对话框';
      sel.appendChild(local);
      (list || []).forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.name || p;
        o.textContent = p.display || p.name || p;
        sel.appendChild(o);
      });
      info.textContent = (list && list.length)
        ? '检测到 ' + list.length + ' 台打印机。也可以直接使用浏览器打印。'
        : '未检测到网络打印机。可用浏览器打印对话框选择系统打印机（Wi-Fi / 蓝牙配对后由系统管理）。';
    }

    if (API.printers) {
      API.printers().then(function (res) { fill((res && res.printers) || []); })
        .catch(function () { fill([]); });
    } else {
      fill([]);
    }

    openDialog('打印', body, function () {
      var printer = sel.value;
      closeDialog();
      if (printer && API.print) {
        API.print(App.doc.id, printer, 'pdf').then(function (res) {
          toast('已发送到打印机' + (res && res.job ? '：' + res.job : ''));
        }).catch(function (e) { toast('打印失败：' + e.message, true); });
      } else {
        printCss();
        setTimeout(function () { window.print(); }, 30);
      }
    }, '打印');
  }

  function toggleOutline() {
    if (!el.outlinePanel) return;
    el.outlinePanel.hidden = !el.outlinePanel.hidden;
    if (!el.outlinePanel.hidden) refreshOutline();
    try { localStorage.setItem('office.outline', el.outlinePanel.hidden ? '0' : '1'); } catch (e) {}
  }

  // 文档结构图：滚动时高亮光标所在的章节，点条目直接定位。
  function highlightOutline() {
    if (!el.outlinePanel || el.outlinePanel.hidden) return;
    var scroller = document.querySelector('.doc-scroll');
    if (!scroller) return;
    var top = scroller.getBoundingClientRect().top + 8;
    var best = null;
    var blocks = document.querySelectorAll('#docEditor .blk');
    for (var i = 0; i < blocks.length; i++) {
      if (!/^h[1-4]$/.test(blocks[i].getAttribute('data-type') || '')) continue;
      if (blocks[i].getBoundingClientRect().top <= top) best = blocks[i];
      else break;
    }
    var id = best ? best.getAttribute('data-id') : '';
    var items = el.outlineList.querySelectorAll('.outline-item');
    for (var k = 0; k < items.length; k++) {
      items[k].classList.toggle('active', id !== '' && items[k].getAttribute('data-block-id') === id);
    }
  }

  function refreshOutline() {
    if (!el.outlineList) return;
    el.outlineList.innerHTML = '';
    if (!App.doc || App.doc.kind !== 'doc') {
      el.outlineList.innerHTML = '<div class="outline-empty">大纲只用于 Word 文档。</div>';
      return;
    }
    var blocks = document.querySelectorAll('#docEditor .blk');
    var found = 0;
    for (var i = 0; i < blocks.length; i++) {
      var type = blocks[i].getAttribute('data-type') || 'p';
      var lv = { h1: 1, h2: 2, h3: 3, h4: 4 }[type] || 0;
      if (!lv) continue;
      var body = blocks[i].querySelector('.blk-body');
      var text = body ? body.textContent.trim() : '';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'outline-item lv' + lv;
      // 大纲行是文档标题原文，属于用户内容。
      b.setAttribute('data-i18n-skip', '');
      b.textContent = text || '（无标题）';
      b.setAttribute('data-block-id', blocks[i].getAttribute('data-id') || '');
      b.addEventListener('click', function (e) {
        var id = e.currentTarget.getAttribute('data-block-id');
        var target = null;
        var all = document.querySelectorAll('#docEditor .blk');
        for (var k = 0; k < all.length; k++) {
          if (all[k].getAttribute('data-id') === id) { target = all[k]; break; }
        }
        if (target) target.scrollIntoView({ block: 'start' });
      });
      el.outlineList.appendChild(b);
      found++;
    }
    if (!found) {
      el.outlineList.innerHTML = '<div class="outline-empty">还没有标题。把段落样式设为「标题 1–4」后，大纲会自动出现。</div>';
    } else {
      highlightOutline();
    }
  }

  function refreshStatus() {
    if (!el.statusInfo) return;
    var d = App.doc;
    if (!d) {
      el.statusInfo.textContent = '就绪';
      if (el.docPageStat) { el.docPageStat.textContent = ''; el.docPageStat.hidden = true; }
      if (el.docWordStat) { el.docWordStat.textContent = ''; el.docWordStat.hidden = true; }
      if (el.docZoomWrap) el.docZoomWrap.hidden = true;
      return;
    }
    el.statusInfo.textContent = '';
    var kindSpan = document.createElement('span');
    kindSpan.className = 'status-kind';
    kindSpan.textContent = kindLabel(d.kind);
    var titleSpan = document.createElement('span');
    titleSpan.className = 'status-title';
    // 文件名是用户内容：跳过翻译，避免文档名恰好等于某条界面文案时被改写。
    titleSpan.setAttribute('data-i18n-skip', '');
    titleSpan.textContent = ' · ' + d.title;
    el.statusInfo.appendChild(kindSpan);
    el.statusInfo.appendChild(titleSpan);
    var isDoc = d.kind === 'doc';
    if (el.docPageStat) el.docPageStat.hidden = !isDoc;
    if (el.docZoomWrap) el.docZoomWrap.hidden = !isDoc;
    if (el.docWordStat) el.docWordStat.hidden = !isDoc;
    if (isDoc) {
      if (ED.updatePageStat) ED.updatePageStat();
      scheduleWordCount();
    }
  }

  // 字数按 Word 的中文习惯算：汉字按字，连续的英文/数字按词。
  function wordCount() {
    var host = $('docEditor');
    if (!host) return 0;
    var t = host.textContent || '';
    var cjk = (t.match(/[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    var words = (t.replace(/[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/g, ' ')
      .match(/[A-Za-z0-9_'-]+/g) || []).length;
    return cjk + words;
  }

  function scheduleWordCount() {
    clearTimeout(App.wordTimer);
    App.wordTimer = setTimeout(function () {
      if (!el.docWordStat || !App.doc || App.doc.kind !== 'doc') return;
      el.docWordStat.textContent = wordCount().toLocaleString('zh-CN') + ' 字';
    }, 400);
  }

  /* ---------------- 文件列表 ---------------- */

  // 侧栏删除沿用 Arc 的做法：删除按钮只在悬停时出现，点一次进入确认态，
  // 3 秒内再点才真正删除。原生 confirm 在嵌入环境会卡住整页，不用。
  var deleteArmedId = '';
  var deleteArmedAt = 0;

  function renderList() {
    el.fileList.innerHTML = '';
    if (!App.files.length) {
      el.fileList.innerHTML = '<div class="file-empty">还没有文件。新建一个，或从磁盘导入 DOCX / XLSX / PPTX。</div>';
      return;
    }
    App.files.forEach(function (f) {
      var b = document.createElement('button');
      b.className = 'file-item' + (App.doc && App.doc.id === f.id ? ' active' : '');
      b.setAttribute('data-id', f.id);
      var t = document.createElement('span');
      t.className = 'fi-title';
      t.setAttribute('data-i18n-skip', '');
      t.textContent = f.title;
      var m = document.createElement('span');
      m.className = 'fi-meta';
      m.textContent = kindLabel(f.kind) + ' · ' + when(f.updatedAt);
      b.appendChild(t); b.appendChild(m);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'fi-del' + (deleteArmedId === f.id ? ' arm' : '');
      del.textContent = deleteArmedId === f.id ? '确认' : '✕';
      del.title = '删除';
      del.setAttribute('aria-label', '删除 ' + f.title);
      del.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (deleteArmedId === f.id && Date.now() - deleteArmedAt < 3000) {
          deleteArmedId = '';
          removeFile(f);
          return;
        }
        deleteArmedId = f.id;
        deleteArmedAt = Date.now();
        renderList();
        setTimeout(function () {
          if (deleteArmedId === f.id && Date.now() - deleteArmedAt >= 3000) {
            deleteArmedId = '';
            renderList();
          }
        }, 3100);
      });
      b.appendChild(del);

      b.addEventListener('click', function () {
        el.sidebar.classList.remove('open');
        openDoc(f.id);
      });
      el.fileList.appendChild(b);
    });
  }

  function removeFile(f) {
    API.remove(f.id, f.rev).then(function () {
      toast('已删除');
      if (App.doc && App.doc.id === f.id) {
        App.doc = null;
        App.dirty = false;
        showHome();
      }
      refreshList();
    }).catch(function (e) { toast('删除失败：' + e.message, true); });
  }

  function renderRecent() {
    el.recent.innerHTML = '';
    if (!App.files.length) {
      el.recent.innerHTML = '<div class="file-empty">最近没有文件。</div>';
      return;
    }
    App.files.slice(0, 8).forEach(function (f) {
      var b = document.createElement('button');
      b.className = 'card';
      var k = document.createElement('span');
      k.className = 'card-kind';
      k.textContent = kindLabel(f.kind);
      var t = document.createElement('span');
      t.className = 'card-title';
      t.setAttribute('data-i18n-skip', '');
      t.textContent = f.title;
      var m = document.createElement('span');
      m.className = 'card-meta';
      m.textContent = when(f.updatedAt);
      b.appendChild(k); b.appendChild(t); b.appendChild(m);
      b.addEventListener('click', function () { openDoc(f.id); });
      el.recent.appendChild(b);
    });
  }

  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = Date.now() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  function refreshList() {
    return API.list().then(function (res) {
      App.files = res.files || [];
      renderList();
      renderRecent();
    }).catch(function () {});
  }

  /* ---------------- 打开 / 新建 / 删除 ---------------- */

  function showHome() {
    disarmDelete();
    App.doc = null;
    try { localStorage.removeItem('office.last'); } catch (e) {}
    App.dirty = false;
    el.home.hidden = false;
    ['viewDoc', 'viewSheet', 'viewSlide', 'viewMarkdown', 'viewHtml', 'viewPdf'].forEach(function (id) {
      $(id).hidden = true;
    });
    el.title.value = '';
    el.title.disabled = true;
    el.btnExport.disabled = true;
    el.btnDelete.disabled = true;
    setState('');
    initMenubar();
    refreshStatus();
    refreshMenuState();
    refreshOutline();
    renderList();
    renderRecent();
  }

  // 页边距按 Office 2003 中文版默认值起算：上下 2.54cm，左右 3.17cm。
  // 四档预设与 Word「页边距」选项卡一致，单位统一用厘米。
  var MARGIN_PRESETS = {
    normal: { label: '常规', top: 2.54, bottom: 2.54, left: 3.17, right: 3.17 },
    narrow: { label: '窄', top: 1.27, bottom: 1.27, left: 1.27, right: 1.27 },
    moderate: { label: '适中', top: 2.54, bottom: 2.54, left: 1.91, right: 1.91 },
    wide: { label: '宽', top: 2.54, bottom: 2.54, left: 5.08, right: 5.08 }
  };

  function readMargin(id, fallback) {
    var v = parseFloat($(id).value);
    if (!isFinite(v) || v < 0 || v > 10) return fallback;
    return Math.round(v * 100) / 100;
  }

  function syncMarginPresets() {
    var box = $('marginPresets');
    if (!box) return;
    var vals = {
      top: readMargin('docMarginTop', 2.54),
      bottom: readMargin('docMarginBottom', 2.54),
      left: readMargin('docMarginLeft', 3.17),
      right: readMargin('docMarginRight', 3.17)
    };
    var btns = box.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var p = MARGIN_PRESETS[btns[i].getAttribute('data-preset')];
      var on = !!p && Math.abs(vals.top - p.top) < 0.015 &&
        Math.abs(vals.bottom - p.bottom) < 0.015 &&
        Math.abs(vals.left - p.left) < 0.015 &&
        Math.abs(vals.right - p.right) < 0.015;
      btns[i].classList.toggle('on', on);
    }
  }

  function openDoc(id) {
    var token = (App.openToken || 0) + 1;
    App.openToken = token;
    setState('打开中…');
    var wait = App.dirty ? saveNow() : Promise.resolve();
    wait.then(function () {
      if (App.dirty) throw new Error('有未保存的修改，请先处理保存错误');
      return API.get(id);
    }).then(function (d) {
      if (token !== App.openToken) return;
      App.doc = d;
      App.rev = d.rev;
      App.dirty = false;
      App.saveError = '';
      App.saveToken = '';
      App.failures = 0;
      clearTimeout(App.retryTimer);
      disarmDelete();
      el.home.hidden = true;
      el.title.disabled = false;
      el.title.value = d.title;
      el.btnExport.disabled = false;
      el.btnDelete.disabled = false;
      setState('已保存');
      ED.render(d);
      // 阅读 PDF 时把顶栏切到 Acrobat 式菜单；回到其他文档再换回 Office 菜单。
      initMenubar();
      if (d.kind === 'doc') {
        // 页眉页脚与页边距回填到菜单，打开旧文档也能看到当前设置。
        $('docHeaderInput').value = (d.doc && d.doc.header) || '';
        $('docFooterInput').value = (d.doc && d.doc.footer) || '';
        $('docPageNum').checked = !!(d.doc && d.doc.pageNum);
        var pg = (d.doc && d.doc.page) || {};
        $('docMarginTop').value = pg.top != null ? pg.top : 2.54;
        $('docMarginBottom').value = pg.bottom != null ? pg.bottom : 2.54;
        $('docMarginLeft').value = pg.left != null ? pg.left : 3.17;
        $('docMarginRight').value = pg.right != null ? pg.right : 3.17;
        syncMarginPresets();
        // 打开文档就把字号框落到默认 11 磅，避免显示成占位文字。
        $('docSize').value = '11';
        // 触屏设备不自动聚焦，避免一打开就弹出软键盘。
        if (!('ontouchstart' in window)) setTimeout(ED.focusDoc, 0);
      }
      renderList();
      buildExportMenu(d.kind);
      refreshStatus();
      refreshMenuState();
      refreshOutline();
      try { localStorage.setItem('office.last', d.id); } catch (e) {}
      if (d.kind === 'pdf') fitPdf();
    }).catch(function (e) {
      toast('打开失败：' + e.message, true);
      setState('');
    });
  }

  function createDoc(kind) {
    API.create(kind, '').then(function (d) {
      refreshList();
      openDoc(d.id);
    }).catch(function (e) { toast('新建失败：' + e.message, true); });
  }

  // 不用 window.confirm：它会被嵌入容器和自动化环境拦截，整页卡在模态框上。
  // 改成按钮内的二次确认态，3 秒内再点一次才真正删除。
  var deleteArmed = 0;
  function disarmDelete() {
    deleteArmed = 0;
    if (!el || !el.btnDelete) return;
    el.btnDelete.textContent = '✕';
    el.btnDelete.classList.remove('danger');
  }
  function deleteDoc() {
    if (!App.doc) return;
    var now = Date.now();
    if (!deleteArmed || now - deleteArmed > 3000) {
      deleteArmed = now;
      el.btnDelete.textContent = '确认删除';
      el.btnDelete.classList.add('danger');
      setTimeout(function () {
        if (deleteArmed && Date.now() - deleteArmed >= 3000) disarmDelete();
      }, 3100);
      return;
    }
    disarmDelete();
    API.remove(App.doc.id, App.rev).then(function () {
      toast('已删除');
      App.doc = null;
      App.dirty = false;
      showHome();
      refreshList();
    }).catch(function (e) { toast('删除失败：' + e.message, true); });
  }

  function importFile(file) {
    if (file.size > 128 * 1024 * 1024) { toast('文件超过 128 MB', true); return; }
    setState('导入中…');
    API.importFile(file).then(function (res) {
      toast('已导入 ' + file.name);
      refreshList();
      openDoc(res.doc.id);
    }).catch(function (e) {
      setState('');
      toast('导入失败：' + e.message, true);
    });
  }

  /* ---------------- 保存 ---------------- */

  function collect() {
    var d = App.doc;
    if (!d) return;
    d.title = el.title.value;
    if (d.kind === 'doc') ED.collectDoc(d);
    if (d.kind === 'sheet') ED.flushSheet(d);
    if (d.kind === 'slide') ED.collectSlides(d);
  }

  function markDirty() {
    if (!App.doc) return;
    App.dirty = true;
    // 内容变了就换幂等键：同一 token 表示同一份内容，重发才安全。
    App.saveToken = '';
    setState('未保存', 'dirty');
    if (App.doc.kind === 'doc' && el.outlinePanel && !el.outlinePanel.hidden) refreshOutline();
    if (App.doc.kind === 'doc') scheduleWordCount();
    if (App.timer) clearTimeout(App.timer);
    App.timer = setTimeout(saveNow, 1200);
  }
  ED.onChange = markDirty;

  function saveIfNeeded() {
    if (App.dirty) return saveNow();
    return Promise.resolve();
  }

  function saveNow() {
    if (!App.doc) return Promise.resolve();
    if (App.saving) {
      // 保存过程中又有输入：等这一轮结束再补一次，避免丢末尾几个字。
      App.saveQueued = true;
      return App.savingPromise || Promise.resolve();
    }
    if (!App.dirty && !App.saveError) return Promise.resolve();
    collect();
    var docId = App.doc.id;
    var payload;
    try {
      payload = JSON.parse(JSON.stringify(App.doc));
    } catch (e) {
      return Promise.resolve();
    }
    if (!App.saveToken) App.saveToken = newSaveToken();
    var token = App.saveToken;

    // 内容已进入快照，先落下 dirty；请求失败再置回 true 交给退避重试。
    App.dirty = false;
    App.saving = true;
    setState('保存中…');
    App.savingPromise = API.saveAuto(payload, App.rev, token).then(function (saved) {
      App.saveToken = '';
      App.saveError = '';
      App.failures = 0;
      if (App.doc && App.doc.id === docId) {
        App.rev = saved.rev;
        App.doc.rev = saved.rev;
        App.doc.updatedAt = saved.savedAt || saved.updatedAt;
        if (!App.dirty) setState('已保存', 'saved');
      }
      refreshList();
      return saved;
    }).catch(function (e) {
      if (e && e.status === 409) {
        // 冲突重试没有意义：停止退避，等用户选择重载。
        App.saveToken = '';
        App.dirty = true;
        App.saveError = 'conflict';
        var rev = e.data && e.data.rev != null ? e.data.rev : '';
        setState('磁盘有更新' + (rev !== '' ? ' rev ' + rev : ''), 'error');
        toast('磁盘上已有新版本，点状态栏重载', true);
        return;
      }
      App.dirty = true;
      App.saveError = 'failed';
      App.failures += 1;
      if (App.doc && App.doc.id === docId) setState('保存失败，重试中…', 'error');
      // 1s / 2s / 4s / 8s 退避，token 不变，所以重试只会落成一个版本。
      var delay = Math.min(8000, 1000 * Math.pow(2, App.failures - 1));
      clearTimeout(App.retryTimer);
      App.retryTimer = setTimeout(saveNow, delay);
    }).then(function (r) {
      App.saving = false;
      App.savingPromise = null;
      if (App.saveQueued) {
        App.saveQueued = false;
        return saveNow();
      }
      return r;
    });
    return App.savingPromise;
  }

  /* ---------------- 异常关闭恢复 ---------------- */

  function initRecovery() {
    var recover = $('btnRecover');
    var discard = $('btnDiscardRecovery');
    if (recover) recover.addEventListener('click', function () { resolveRecovery('restore'); });
    if (discard) discard.addEventListener('click', function () { resolveRecovery('discard'); });
  }

  function checkRecovery() {
    if (!API.recovery) return;
    API.recovery().then(function (res) {
      App.recovery = (res && res.items) || [];
      showRecovery();
    }).catch(function () {});
  }

  function showRecovery() {
    var bar = $('recoveryBar');
    if (!bar) return;
    var items = App.recovery || [];
    if (!items.length) { bar.hidden = true; return; }
    var f = items[0];
    var name = f.title || f.id || OT('未命名文件');
    // 两种整句分开拼：模板才能按「有无更多候选」各自命中，槽位里的文件名保持原样。
    var more = items.length - 1;
    $('recoveryText').textContent = more > 0
      ? '上次异常关闭时有内容没写入磁盘：' + name +
        '，候选 rev ' + f.candidateRev + ' / 磁盘 rev ' + f.currentRev + '（另有 ' + more + ' 个）。'
      : '上次异常关闭时有内容没写入磁盘：' + name +
        '，候选 rev ' + f.candidateRev + ' / 磁盘 rev ' + f.currentRev + '。';
    bar.hidden = false;
  }

  function resolveRecovery(action, force) {
    var items = App.recovery || [];
    if (!items.length) return;
    var item = items[0];
    API.resolveRecovery(item.txn, action, force).then(function (res) {
      // 恢复/放弃都可能碰到「已经处理过」或「磁盘又变了」，这两种都要收尾。
      if (res && res.state === 'stale' && !force) {
        var ok = global.confirm('磁盘上的版本已经变了，仍要用恢复内容覆盖吗？');
        if (ok) return resolveRecovery(action, true);
        return;
      }
      App.recovery.shift();
      showRecovery();
      refreshList();
      if (action === 'restore' && item.id) openDoc(item.id);
      if (action === 'restore') toast('已恢复 ' + (item.title || item.id || OT('文件')));
    }).catch(function (e) {
      toast('恢复失败：' + e.message, true);
    });
  }

  /* ---------------- 导出 ---------------- */

  function buildExportMenu(kind) {
    var formats = {
      doc: [['docx', 'Word (.docx)'], ['md', 'Markdown (.md)'], ['html', 'HTML (.html)']],
      sheet: [['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV (.csv)']],
      slide: [['pptx', 'PowerPoint (.pptx)']],
      markdown: [['md', 'Markdown (.md)'], ['html', 'HTML (.html)'], ['docx', 'Word (.docx)']],
      html: [['html', 'HTML (.html)'], ['docx', 'Word (.docx)']],
      pdf: []
    }[kind] || [];
    el.exportMenu.innerHTML = '';
    if (!formats.length) {
      el.btnExport.disabled = true;
      return;
    }
    el.btnExport.disabled = false;
    formats.forEach(function (f) {
      var b = document.createElement('button');
      b.textContent = f[1];
      b.addEventListener('click', function () {
        el.exportMenu.hidden = true;
        saveIfNeeded().then(function () { doExport(f[0]); });
      });
      el.exportMenu.appendChild(b);
    });
  }

  function doExport(format) {
    if (!App.doc) return;
    setState('导出中…');
    var url = API.exportUrl(App.doc.id, format);
    var a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { setState('已保存'); }, 900);
  }

  /* ---------------- 文档工具栏 ---------------- */

  var TOOL_MENUS = ['tableMenu', 'artMenu', 'linkMenu', 'pageMenu'];

  function closeToolMenus() {
    for (var i = 0; i < TOOL_MENUS.length; i++) {
      var m = $(TOOL_MENUS[i]);
      if (m) m.hidden = true;
    }
  }

  // 窄屏功能区是横向滚动容器，会把下拉菜单裁掉。
  // 这里在打开时把菜单改成 fixed，按按钮位置贴边展开，仍然留在视口内。
  function placeToolMenu(menu, btn) {
    if (window.innerWidth > 900) {
      menu.style.position = '';
      menu.style.top = '';
      menu.style.left = '';
      menu.style.right = '';
      return;
    }
    var r = btn.getBoundingClientRect();
    var w = menu.offsetWidth || 200;
    var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
    menu.style.position = 'fixed';
    menu.style.left = Math.round(left) + 'px';
    menu.style.right = 'auto';
    menu.style.top = Math.round(r.bottom + 4) + 'px';
  }

  function bindMenu(btnId, menuId) {
    var btn = $(btnId);
    var menu = $(menuId);
    if (!btn || !menu) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.hidden;
      closeToolMenus();
      menu.hidden = !open;
      if (open) placeToolMenu(menu, btn);
    });
  }

  // 工具栏回显：段落样式、对齐、字体字号都跟着光标走，和 Word 的行为一致。
  function syncDocTools() {
    if (!App.doc || App.doc.kind !== 'doc') return;
    var blk = ED.currentBlock();
    if (blk) {
      var t = blk.getAttribute('data-type') || 'p';
      var style = $('docStyle');
      for (var i = 0; i < style.options.length; i++) {
        if (style.options[i].value === t) { style.value = t; break; }
      }
      var a = blk.getAttribute('data-align') || 'left';
      var aligns = document.querySelectorAll('#docToolbar [data-align]');
      for (var j = 0; j < aligns.length; j++) {
        aligns[j].classList.toggle('on', aligns[j].getAttribute('data-align') === a);
      }
    }
    var st = ED.caretStyle ? ED.caretStyle() : null;
    if (!st) return;
    var font = $('docFont'), size = $('docSize');
    var fv = st.font || '', hasFont = false;
    for (var k = 0; k < font.options.length; k++) {
      if (font.options[k].value === fv) { hasFont = true; break; }
    }
    font.value = hasFont ? fv : '';
    // 正文默认 11 磅：Office 的字号框始终显示具体磅值，不留空占位。
    var sv = String(st.size || '11');
    for (var m = 0; m < size.options.length; m++) {
      if (size.options[m].value === sv) { size.value = sv; break; }
    }
  }

  function bindDocToolbar() {
    // 块的输入、上下移、删除、粘贴清洗都挂在 docEditor 容器上。
    // 容器在页面里只存在一份，所以这里绑一次就够；漏掉这一步会让整个文档编辑器只读。
    ED.docTools($('docEditor'));
    $('docStyle').addEventListener('change', function (e) {
      ED.setBlockType(e.target.value);
    });

    var tools = document.querySelectorAll('#docToolbar [data-cmd]');
    for (var i = 0; i < tools.length; i++) {
      tools[i].addEventListener('mousedown', function (e) { e.preventDefault(); });
      tools[i].addEventListener('click', function (e) {
        ED.exec(e.currentTarget.getAttribute('data-cmd'));
      });
    }
    // 其余按钮同样不让焦点离开正文，否则选区会先丢一次。
    var btns = document.querySelectorAll('#docToolbar button');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('mousedown', function (e) {
        if (e.currentTarget.closest('.menu-wrap')) return;
        e.preventDefault();
      });
    }
    $('btnAddBlock').addEventListener('click', function () { ED.addDocBlock('p'); });

    $('docFont').addEventListener('change', function (e) {
      ED.applyStyle({ fontFamily: e.target.value || '' });
    });
    $('docSize').addEventListener('change', function (e) {
      var v = parseInt(e.target.value, 10);
      ED.applyStyle({ fontSize: v ? v + 'pt' : '' });
    });
    $('docColor').addEventListener('change', function (e) {
      ED.applyStyle({ color: e.target.value });
      $('docColorBar').style.background = e.target.value;
    });
    $('docHl').addEventListener('change', function (e) {
      ED.applyStyle({ backgroundColor: e.target.value });
      $('docHlBar').style.background = e.target.value;
    });

    // 增大 / 减小字号按 Word 的常用档位跳，每次改一档而不是逐磅加减。
    var sizeSteps = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 44, 48, 54, 72];
    function bumpSize(dir) {
      var sel = $('docSize');
      var cur = parseInt(sel.value, 10) || 14;
      var idx = 0;
      for (var s = 0; s < sizeSteps.length; s++) {
        if (sizeSteps[s] <= cur) idx = s;
      }
      var next = sizeSteps[Math.max(0, Math.min(sizeSteps.length - 1, idx + dir))];
      sel.value = String(next);
      ED.applyStyle({ fontSize: next + 'pt' });
    }
    $('docGrow').addEventListener('click', function () { bumpSize(1); });
    $('docShrink').addEventListener('click', function () { bumpSize(-1); });
    $('docSup').addEventListener('click', function () { ED.exec('superscript'); });
    $('docSub').addEventListener('click', function () { ED.exec('subscript'); });
    $('docClear').addEventListener('click', function () { ED.clearFormat(); });

    var painter = $('docPainter');
    painter.addEventListener('click', function () {
      if (ED.hasPaintedFormat()) {
        if (ED.paintFormat()) painter.classList.remove('on');
        return;
      }
      if (ED.pickFormat()) {
        painter.classList.add('on');
        toast('已复制格式：选中目标文字后点格式刷图标');
      }
    });

    var aligns = document.querySelectorAll('#docToolbar [data-align]');
    for (var a = 0; a < aligns.length; a++) {
      aligns[a].addEventListener('click', function (e) {
        ED.setAlign(e.currentTarget.getAttribute('data-align'));
        syncDocTools();
      });
    }
    $('docBullet').addEventListener('click', function () { ED.setList(false); });
    $('docNumber').addEventListener('click', function () { ED.setList(true); });
    $('docIndentLess').addEventListener('click', function () { ED.adjustIndent(-1); });
    $('docIndentMore').addEventListener('click', function () { ED.adjustIndent(1); });

    bindMenu('docTable', 'tableMenu');
    bindMenu('docArt', 'artMenu');
    bindMenu('docLinkBtn', 'linkMenu');
    bindMenu('docPage', 'pageMenu');

    var zoomSel = $('docZoom');
    if (zoomSel) {
      try { zoomSel.value = localStorage.getItem('office.docZoom') || '100'; } catch (e) {}
      zoomSel.addEventListener('change', function () { ED.setZoom(zoomSel.value); });
    }

    var cells = document.querySelectorAll('#tableMenu [data-table]');
    for (var t = 0; t < cells.length; t++) {
      cells[t].addEventListener('click', function (e) {
        var n = parseInt(e.currentTarget.getAttribute('data-table'), 10) || 3;
        closeToolMenus();
        ED.insertTable(n);
      });
    }
    var arts = document.querySelectorAll('#artMenu [data-art]');
    for (var r = 0; r < arts.length; r++) {
      arts[r].addEventListener('click', function (e) {
        var name = e.currentTarget.getAttribute('data-art');
        closeToolMenus();
        if (!ED.applyArt(name)) toast('先选中要应用艺术字的文字', true);
      });
    }
    $('docLinkApply').addEventListener('click', function () {
      var href = $('docLinkInput').value.trim();
      if (!href) { toast('先填链接地址', true); return; }
      ED.insertLink(href);
      $('docLinkInput').value = '';
      closeToolMenus();
    });
    $('docBreak').addEventListener('click', function () { ED.insertSimpleBlock('pagebreak'); });
    $('docRule').addEventListener('click', function () { ED.insertSimpleBlock('hr'); });
    // marginsOnly 供快速预设使用：只改四个边距，不碰页眉页脚。
    function applyPageSetup(marginsOnly) {
      if (!App.doc) return false;
      if (!App.doc.doc) App.doc.doc = { blocks: [] };
      if (!marginsOnly) {
        App.doc.doc.header = $('docHeaderInput').value.trim();
        App.doc.doc.footer = $('docFooterInput').value.trim();
        App.doc.doc.pageNum = $('docPageNum').checked;
      }
      var pg = App.doc.doc.page || {};
      pg.top = readMargin('docMarginTop', 2.54);
      pg.bottom = readMargin('docMarginBottom', 2.54);
      pg.left = readMargin('docMarginLeft', 3.17);
      pg.right = readMargin('docMarginRight', 3.17);
      pg.width = pg.width || 21;
      pg.height = pg.height || 29.7;
      App.doc.doc.page = pg;
      ED.applyPage(App.doc);
      // 页边距变了，可用高度随之变化，必须重新分页。
      ED.paginate(App.doc);
      ED.updateRuler();
      syncMarginPresets();
      markDirty();
      return true;
    }

    $('docPageApply').addEventListener('click', function () {
      if (!applyPageSetup(false)) return;
      closeToolMenus();
      toast('页面设置已应用，导出 Word 时写入');
    });

    var presetBtns = document.querySelectorAll('#marginPresets button');
    for (var mb = 0; mb < presetBtns.length; mb++) {
      presetBtns[mb].addEventListener('click', function (e) {
        var p = MARGIN_PRESETS[e.currentTarget.getAttribute('data-preset')];
        if (!p || !App.doc) return;
        $('docMarginTop').value = p.top;
        $('docMarginBottom').value = p.bottom;
        $('docMarginLeft').value = p.left;
        $('docMarginRight').value = p.right;
        applyPageSetup(true);
        // 菜单保持打开，方便连续比较几种比例。
        toast('页边距：' + p.label);
      });
    }

    var marginInputs = ['docMarginTop', 'docMarginBottom', 'docMarginLeft', 'docMarginRight'];
    for (var mi = 0; mi < marginInputs.length; mi++) {
      $(marginInputs[mi]).addEventListener('input', syncMarginPresets);
    }

    /* ---------- 标尺：拖动左右边距（写回 doc.page 后重新分页） ---------- */
    function marginOf(side) {
      var pg = (App.doc && App.doc.doc && App.doc.doc.page) || {};
      var v = parseFloat(pg[side]);
      return isFinite(v) ? v : 3.17;
    }

    function setMarginSide(side, value, repaginate) {
      if (!App.doc) return;
      if (!App.doc.doc) App.doc.doc = { blocks: [] };
      var pg = App.doc.doc.page || {};
      pg.width = pg.width || 21;
      pg.height = pg.height || 29.7;
      pg[side] = Math.round(Math.max(0, value) * 100) / 100;
      App.doc.doc.page = pg;
      $(side === 'left' ? 'docMarginLeft' : 'docMarginRight').value = pg[side];
      // 拖动过程中只改 CSS 边距和标尺，松手后才做一次完整分页。
      ED.applyPage(App.doc);
      ED.updateRuler();
      syncMarginPresets();
      if (repaginate) {
        ED.paginate(App.doc);
        markDirty();
      }
    }

    function bindRulerHandle(handleId, side) {
      var handle = $(handleId);
      if (!handle) return;
      handle.addEventListener('pointerdown', function (e) {
        if (!App.doc || App.doc.kind !== 'doc') return;
        var cmPx = ED.rulerCmPx();
        if (!cmPx) return;
        e.preventDefault();
        var startX = e.clientX;
        var startVal = marginOf(side);
        var other = marginOf(side === 'left' ? 'right' : 'left');
        var pageW = parseFloat((App.doc.doc.page || {}).width) || 21;
        var maxVal = Math.max(0, pageW - other - 1); // 至少留 1 厘米正文
        var moved = false;
        handle.classList.add('dragging');
        document.body.classList.add('ruler-drag');

        function onMove(ev) {
          var delta = (ev.clientX - startX) / cmPx;
          var val = startVal + (side === 'left' ? delta : -delta);
          val = Math.max(0, Math.min(maxVal, val));
          if (!moved && Math.abs(val - startVal) < 0.01) return;
          moved = true;
          setMarginSide(side, val, false);
        }
        function onUp() {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          handle.classList.remove('dragging');
          document.body.classList.remove('ruler-drag');
          if (!moved) return;
          ED.paginate(App.doc);
          markDirty();
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      });

      // 键盘微调：方向键每次 0.1 厘米，Shift 加速到 0.5 厘米。
      handle.addEventListener('keydown', function (e) {
        if (!App.doc || App.doc.kind !== 'doc') return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        var step = e.shiftKey ? 0.5 : 0.1;
        var dir = e.key === 'ArrowRight' ? 1 : -1;
        // 右手柄向左移才是加大右边距，方向与屏幕位移相反。
        if (side === 'right') dir = -dir;
        var other = marginOf(side === 'left' ? 'right' : 'left');
        var pageW = parseFloat((App.doc.doc.page || {}).width) || 21;
        var maxVal = Math.max(0, pageW - other - 1);
        var val = Math.max(0, Math.min(maxVal, marginOf(side) + dir * step));
        setMarginSide(side, val, true);
      });
    }
    bindRulerHandle('rulerHandleLeft', 'left');
    bindRulerHandle('rulerHandleRight', 'right');

    // 点纸张空白处把光标放到该页末尾；空白页会补一个可编辑段落。
    var docScroll = $('docScroll');
    if (docScroll) {
      docScroll.addEventListener('mousedown', function (e) {
        if (e.target.closest('.blk, .page-head, .page-foot')) return;
        var page = e.target.closest('.doc-page');
        if (!page) return;
        var blocks = page.querySelectorAll('.blk-body[contenteditable]');
        if (!blocks.length) {
          var pageBody = page.querySelector('.doc-body');
          if (!pageBody || !ED.newEmptyBlock) return;
          pageBody.appendChild(ED.newEmptyBlock());
          blocks = page.querySelectorAll('.blk-body[contenteditable]');
          markDirty();
        }
        if (!blocks.length) return;
        e.preventDefault();
        var last = blocks[blocks.length - 1];
        last.focus();
        var range = document.createRange();
        range.selectNodeContents(last);
        range.collapse(false);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
    }

    var host = $('docEditor');
    host.addEventListener('mouseup', syncDocTools);
    host.addEventListener('keyup', syncDocTools);
    document.addEventListener('selectionchange', function () {
      if (!App.doc || App.doc.kind !== 'doc') return;
      syncDocTools();
    });
  }

  /* ---------------- 表格工具栏 ---------------- */

  function bindSheetToolbar() {
    function styleCell(fn) {
      if (App.doc) ED.applySheetStyle(App.doc, fn);
    }

    $('sheetFont').addEventListener('change', function (e) {
      styleCell(function (s) { s.font = e.target.value || ''; });
    });
    $('sheetSize').addEventListener('change', function (e) {
      var v = parseInt(e.target.value, 10) || 0;
      styleCell(function (s) { s.size = v; });
    });
    $('btnSheetBold').addEventListener('click', function () {
      styleCell(function (s) { s.b = !s.b; });
    });
    $('btnSheetItalic').addEventListener('click', function () {
      styleCell(function (s) { s.i = !s.i; });
    });
    $('btnSheetUnderline').addEventListener('click', function () {
      styleCell(function (s) { s.u = !s.u; });
    });
    $('sheetColor').addEventListener('change', function (e) {
      styleCell(function (s) { s.color = e.target.value; });
      $('sheetColorBar').style.background = e.target.value;
    });
    $('sheetFill').addEventListener('change', function (e) {
      styleCell(function (s) { s.bg = e.target.value; });
      $('sheetFillBar').style.background = e.target.value;
    });

    // 数字组的三个快捷按钮与下拉框共用一套格式字符串，避免两处规则分叉。
    function quickFormat(fmt) {
      $('sheetFmt').value = fmt;
      styleCell(function (s) { s.fmt = fmt; });
    }
    $('btnFmtCur').addEventListener('click', function () { quickFormat('¥#,##0.00'); });
    $('btnFmtPct').addEventListener('click', function () { quickFormat('0%'); });
    $('btnFmtDec').addEventListener('click', function () { quickFormat('0.00'); });

    var halign = document.querySelectorAll('#viewSheet [data-halign]');
    for (var i = 0; i < halign.length; i++) {
      halign[i].addEventListener('click', function (e) {
        var v = e.currentTarget.getAttribute('data-halign');
        styleCell(function (s) { s.align = v; });
      });
    }
    var valign = document.querySelectorAll('#viewSheet [data-valign]');
    for (var j = 0; j < valign.length; j++) {
      valign[j].addEventListener('click', function (e) {
        var v = e.currentTarget.getAttribute('data-valign');
        styleCell(function (s) { s.valign = v; });
      });
    }

    $('btnSheetMerge').addEventListener('click', function () {
      if (!App.doc) return;
      if (!ED.mergeCells(App.doc)) toast('先拖选两个以上的单元格', true);
    });
    $('sheetFmt').addEventListener('change', function (e) {
      var v = e.target.value;
      styleCell(function (s) { s.fmt = v; });
    });
    $('btnSheetBorder').addEventListener('click', function () {
      if (!App.doc) return;
      var cur = ED.activeCellStyle ? (ED.activeCellStyle().border || '') : '';
      var next = cur === '' ? 'thin' : cur === 'thin' ? 'medium' : '';
      styleCell(function (s) { s.border = next; });
    });

    $('btnSheetRowAdd').addEventListener('click', function () { if (App.doc) ED.sheetOp(App.doc, 'insert-row'); });
    $('btnSheetRowDel').addEventListener('click', function () { if (App.doc) ED.sheetOp(App.doc, 'delete-row'); });
    $('btnSheetColAdd').addEventListener('click', function () { if (App.doc) ED.sheetOp(App.doc, 'insert-col'); });
    $('btnSheetColDel').addEventListener('click', function () { if (App.doc) ED.sheetOp(App.doc, 'delete-col'); });
    $('btnSheetFreeze').addEventListener('click', function () { if (App.doc) ED.toggleFreeze(App.doc); });
    $('btnSheetSum').addEventListener('click', function () {
      if (!App.doc) return;
      if (!ED.autoSum(App.doc)) toast('把光标放到数字下方，或先选中要合计的区域', true);
    });
    $('btnSheetSortAsc').addEventListener('click', function () {
      if (App.doc && !ED.sortRange(App.doc, true)) toast('先拖选要排序的多行', true);
    });
    $('btnSheetSortDesc').addEventListener('click', function () {
      if (App.doc && !ED.sortRange(App.doc, false)) toast('先拖选要排序的多行', true);
    });
    $('btnMoreRows').addEventListener('click', function () { if (App.doc) ED.expandSheet(App.doc, 20, 0); });
    $('btnMoreCols').addEventListener('click', function () { if (App.doc) ED.expandSheet(App.doc, 0, 5); });
  }

  /* ---------------- 演示工具栏 ---------------- */

  function bindSlideToolbar() {
    $('btnAddText').addEventListener('click', function () { if (App.doc) ED.addTextElement(App.doc); });
    $('btnDelElem').addEventListener('click', function () { if (App.doc) ED.deleteElement(App.doc); });
    $('btnDupElem').addEventListener('click', function () { if (App.doc) ED.duplicateElement(App.doc); });
    $('btnAddSlide').addEventListener('click', function () { if (App.doc) ED.addSlide(App.doc); });
    $('btnDelSlide').addEventListener('click', function () { if (App.doc) ED.deleteSlide(App.doc); });
    $('btnPrevSlide').addEventListener('click', function () { if (App.doc) ED.gotoSlide(App.doc, -1); });
    $('btnNextSlide').addEventListener('click', function () { if (App.doc) ED.gotoSlide(App.doc, 1); });

    $('elemFont').addEventListener('change', function (e) {
      if (!App.doc) return;
      var v = e.target.value;
      ED.setElemStyle(App.doc, function (el) { el.font = v; });
    });
    $('elemSize').addEventListener('change', function (e) {
      var v = parseInt(e.target.value, 10);
      if (!App.doc || !v) return;
      ED.setElemStyle(App.doc, function (el) { el.size = v; });
    });
    $('btnElemBold').addEventListener('click', function () {
      if (App.doc) ED.setElemStyle(App.doc, function (el) { el.bold = !el.bold; });
    });
    $('btnElemItalic').addEventListener('click', function () {
      if (App.doc) ED.setElemStyle(App.doc, function (el) { el.italic = !el.italic; });
    });
    $('btnElemUnderline').addEventListener('click', function () {
      if (App.doc) ED.setElemStyle(App.doc, function (el) { el.underline = !el.underline; });
    });
    $('elemColor').addEventListener('change', function (e) {
      if (App.doc) ED.setElemStyle(App.doc, function (el) { el.color = e.target.value; });
      $('elemColorBar').style.background = e.target.value;
    });
    $('elemFill').addEventListener('change', function (e) {
      if (App.doc) ED.setElemStyle(App.doc, function (el) { el.fill = e.target.value; });
      $('elemFillBar').style.background = e.target.value;
    });
    var ealign = document.querySelectorAll('#viewSlide [data-ealign]');
    for (var i = 0; i < ealign.length; i++) {
      ealign[i].addEventListener('click', function (e) {
        var v = e.currentTarget.getAttribute('data-ealign');
        if (App.doc) ED.setElemStyle(App.doc, function (el) { el.align = v; });
      });
    }
    $('btnElemBullet').addEventListener('click', function () {
      if (App.doc) ED.setElemStyle(App.doc, function (el) { el.bullet = !el.bullet; });
    });
    $('btnElemFront').addEventListener('click', function () { if (App.doc) ED.moveElement(App.doc, 1); });
    $('btnElemBack').addEventListener('click', function () { if (App.doc) ED.moveElement(App.doc, -1); });

    $('btnHtmlPreview').addEventListener('click', function () {
      if (App.doc) $('htmlPreview').srcdoc = App.doc.html || '';
    });
    $('btnHtmlOpen').addEventListener('click', function () { if (App.doc) ED.openHTML(App.doc); });
    $('btnMdPreview').addEventListener('click', function () { $('mdPreview').scrollTop = 0; });
  }

  /* ---------------- PDF 自适应 ---------------- */

  function fitPdf() {
    if (!App.doc) return;
    ED.renderPDF(App.doc);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
