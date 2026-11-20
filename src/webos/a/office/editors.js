/* 六个编辑器共享一个模型：所有编辑都写回 Document，保存时统一收集。
   这里不引用任何框架，Chrome 72 可直接运行。 */
(function (global) {
  'use strict';

  var ED = {
    onChange: function () {},
    onSelect: function () {}
  };

  function changed() {
    ED.onChange();
    // 只对 Word 文档做版面重排；其他编辑器不参与分页。
    var d = global.__edDoc;
    if (d && d.kind === 'doc' && ED.schedulePaginate) ED.schedulePaginate();
  }

  function escapeHTML(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(s) { return escapeHTML(s).replace(/'/g, '&#39;'); }

  // 文档地址只可能是同源的 .../api/raw/<encoded-id>（可带 ?nav=… 与 #page=…）。
  // 先剥掉本机 origin，再要求「站内绝对路径」前缀；//host 与任意 scheme 一律丢掉。
  function rawDocUrl(url) {
    var s = String(url === null || url === undefined ? '' : url);
    var origin = String((global.location && global.location.origin) || '');
    if (origin && s.indexOf(origin + '/') === 0) s = s.slice(origin.length);
    if (!s.startsWith('/') || s.startsWith('//')) return '';
    var ok = /^\/api\/raw\/[^\/?#]+(?:[?#].*)?$/.test(s) || /^\/[A-Za-z0-9._~-]+\/api\/raw\/[^\/?#]+(?:[?#].*)?$/.test(s);
    return ok ? s : '';
  }

  /* ---------- 字体与度量：把 Office 的字体名折回内置字库 ---------- */

  // 原件里的字体名往往在目标机器上不存在，直接写 font-family 会回退成默认无衬线，
  // 字宽一变，表格列宽和换行位置全跟着漂。这里按字形把常见 Office 字体
  // 映射到随包分发的开源字体，未知字体保留原名并补一条中文兜底。
  var FONT_STACKS = {
    '宋体': '"Noto Serif SC", "Songti SC", serif',
    'simsun': '"Noto Serif SC", "Songti SC", serif',
    '新宋体': '"Noto Serif SC", "Songti SC", serif',
    'nsimsun': '"Noto Serif SC", "Songti SC", serif',
    '方正书宋': '"Noto Serif SC", serif',
    '仿宋': '"Noto Serif SC", "FangSong", serif',
    'fangsong': '"Noto Serif SC", "FangSong", serif',
    '楷体': '"LXGW WenKai", "KaiTi", serif',
    'kaiti': '"LXGW WenKai", "KaiTi", serif',
    '楷体_gb2312': '"LXGW WenKai", "KaiTi", serif',
    '微软雅黑': '"Noto Sans SC", "PingFang SC", sans-serif',
    'microsoft yahei': '"Noto Sans SC", "PingFang SC", sans-serif',
    '等线': '"Noto Sans SC", "PingFang SC", sans-serif',
    'dengxian': '"Noto Sans SC", "PingFang SC", sans-serif',
    '黑体': '"Noto Sans SC", "PingFang SC", sans-serif',
    'simhei': '"Noto Sans SC", "PingFang SC", sans-serif',
    '思源黑体': '"Noto Sans SC", sans-serif',
    'calibri': '"Inter", "Noto Sans SC", sans-serif',
    'calibri light': '"Inter", "Noto Sans SC", sans-serif',
    'arial': '"Inter", "Noto Sans SC", sans-serif',
    'helvetica': '"Inter", "Noto Sans SC", sans-serif',
    'segoe ui': '"Inter", "Noto Sans SC", sans-serif',
    'times new roman': '"Libre Baskerville", "Noto Serif SC", serif',
    'cambria': '"Libre Baskerville", "Noto Serif SC", serif',
    'georgia': '"Libre Baskerville", "Noto Serif SC", serif',
    'garamond': '"EB Garamond", "Noto Serif SC", serif',
    'consolas': '"JetBrains Mono", monospace',
    'courier new': '"Source Code Pro", monospace',
    'monospace': '"JetBrains Mono", monospace'
  };

  function fontStack(name) {
    var raw = String(name || '').trim();
    if (!raw) return '';
    return FONT_STACKS[raw.toLowerCase()] ||
      ('"' + raw.replace(/"/g, '') + '", "Noto Serif SC", serif');
  }

  // twips → CSS px：1 英寸 = 1440 twips = 96px。
  function twipPx(tw) { return (Number(tw) || 0) / 15; }

  function cssBorder(spec) {
    if (!spec) return '';
    if (spec === 'none') return 'none';
    var p = String(spec).split(':');
    if (p.length !== 3) return '';
    var pt = Math.max(0.5, (parseInt(p[1], 10) || 4) / 8);
    return pt + 'pt solid #' + p[2];
  }

  // Word 的 vAlign 用 center/both；CSS vertical-align 对应 middle，直接写 center 无效。
  function cssVAlign(v) {
    var s = String(v || '').toLowerCase();
    if (s === 'center' || s === 'both' || s === 'middle') return 'middle';
    if (s === 'bottom') return 'bottom';
    if (s === 'top') return 'top';
    return '';
  }

  function docTextWidthTwips() {
    var d = global.__edDoc;
    var p = (d && d.doc && d.doc.page) || {};
    var w = parseFloat(p.width) || 21;
    var l = parseFloat(p.left);
    var r = parseFloat(p.right);
    if (!isFinite(l)) l = 3.17;
    if (!isFinite(r)) r = 3.17;
    return Math.max(1, (w - l - r) * 566.9291338582677);
  }

  /* ==================== 文档 ==================== */

  function runsHTML(runs) {
    var out = '';
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (!r.t) continue;
      var s = escapeHTML(r.t).replace(/\n/g, '<br>');
      if (r.code) s = '<code>' + s + '</code>';
      if (r.s) s = '<s>' + s + '</s>';
      if (r.u) s = '<u>' + s + '</u>';
      if (r.i) s = '<em>' + s + '</em>';
      if (r.b) s = '<strong>' + s + '</strong>';
      if (r.link) s = '<a href="' + escAttr(r.link) + '" target="_blank" rel="noopener noreferrer">' + s + '</a>';
      if (r.vert === 'sup') s = '<sup>' + s + '</sup>';
      if (r.vert === 'sub') s = '<sub>' + s + '</sub>';
      if (r.color || r.size || r.font || r.hl) {
        var st = '';
        if (r.color) st += 'color:' + r.color + ';';
        if (r.hl) st += 'background-color:' + r.hl + ';';
        if (r.size) st += 'font-size:' + Math.max(6, r.size / 2) + 'pt;';
        if (r.font) st += 'font-family:' + fontStack(r.font) + ';';
        // data-font 保留原件字体名，保存时不会把映射后的字体栈写回模型。
        s = '<span' + (r.font ? ' data-font="' + escAttr(r.font) + '"' : '') +
          ' style="' + escAttr(st) + '">' + s + '</span>';
      }
      out += s;
    }
    return out || '<br>';
  }

  function tableHTML(b) {
    var rows = b.rows || [];
    var cols = b.colWidths || [];
    var sum = 0;
    for (var i = 0; i < cols.length; i++) sum += (Number(cols[i]) || 0);
    var textTw = docTextWidthTwips();
    var tableTw = Number(b.tableWidth) > 0 ? Number(b.tableWidth) : sum;
    var pct = tableTw > 0 ? Math.min(100, tableTw / textTw * 100) : 100;
    if (pct < 10) pct = 100;
    var style = ['width:' + pct.toFixed(2) + '%'];
    if ((b.tableAlign || '') === 'center') { style.push('margin-left:auto'); style.push('margin-right:auto'); }
    if ((b.tableAlign || '') === 'right') { style.push('margin-left:auto'); style.push('margin-right:0'); }
    var border = cssBorder(b.borders);
    if (border) style.push('--cell-border:' + border);
    if (Number(b.cellPad) > 0) style.push('--cell-pad:' + (twipPx(b.cellPad)).toFixed(1) + 'px');
    var attrs = ' data-col-widths="' + escAttr(cols.join(',')) + '"' +
      ' data-table-width="' + (Number(b.tableWidth) || 0) + '"' +
      ' data-table-align="' + escAttr(b.tableAlign || '') + '"' +
      ' data-borders="' + escAttr(b.borders || '') + '"' +
      ' data-cell-pad="' + (Number(b.cellPad) || 0) + '"' +
      ' data-header-rows="' + (Number(b.headerRows) || 0) + '"';
    var html = '<table contenteditable="false"' + (cols.length ? ' class="has-cols"' : '') +
      ' style="' + escAttr(style.join(';')) + '"' + attrs + '>';
    if (cols.length && sum > 0) {
      html += '<colgroup>';
      for (var c = 0; c < cols.length; c++) {
        html += '<col style="width:' + ((Number(cols[c]) || 0) / sum * 100).toFixed(3) + '%">';
      }
      html += '</colgroup>';
    }
    html += '<tbody>';
    var hdr = Number(b.headerRows) || 0;
    for (var r = 0; r < rows.length; r++) {
      html += '<tr' + (r < hdr ? ' data-header="1"' : '') + '>';
      for (var j = 0; j < rows[r].length; j++) {
        var cell = rows[r][j] || {};
        var ca = '';
        if (Number(cell.colspan) > 1) ca += ' colspan="' + Number(cell.colspan) + '"';
        if (Number(cell.rowspan) > 1) ca += ' rowspan="' + Number(cell.rowspan) + '"';
        ca += ' data-colspan="' + (Number(cell.colspan) || 1) + '"';
        ca += ' data-rowspan="' + (Number(cell.rowspan) || 1) + '"';
        ca += ' data-w="' + (Number(cell.width) || 0) + '"';
        if (cell.bg) ca += ' data-bg="' + escAttr(cell.bg) + '"';
        if (cell.align) ca += ' data-align="' + escAttr(cell.align) + '"';
        if (cell.valign) ca += ' data-valign="' + escAttr(cell.valign) + '"';
        var cs = '';
        // 单元格级四边：WPS 模板常把表格级边框设为 none，网格线只在这里。
        if (cell.borders) {
          var edges = ['top', 'left', 'bottom', 'right'];
          for (var e = 0; e < edges.length; e++) {
            var edge = edges[e];
            var spec = cell.borders[edge];
            if (!spec) continue;
            var bv = cssBorder(spec);
            if (bv) cs += 'border-' + edge + ':' + bv + ';';
            ca += ' data-b' + edge.charAt(0) + '="' + escAttr(spec) + '"';
          }
        }
        if (Number(cell.pad) > 0) {
          var padPx = twipPx(cell.pad).toFixed(1);
          cs += 'padding-left:' + padPx + 'px;padding-right:' + padPx + 'px;';
          ca += ' data-pad="' + Number(cell.pad) + '"';
        }
        if (cell.bg) cs += 'background-color:#' + cell.bg + ';';
        if (cell.align) cs += 'text-align:' + cell.align + ';';
        var va = cssVAlign(cell.valign);
        if (va) cs += 'vertical-align:' + va + ';';
        if (cs) ca += ' style="' + escAttr(cs) + '"';
        html += '<td contenteditable="true"' + ca + '>' + runsHTML(cell.runs || []) + '</td>';
      }
      html += '</tr>';
    }
    return html + '</tbody></table>';
  }

  function attachCellModels(table, rows) {
    if (!table || !rows) return;
    var tds = table.querySelectorAll('td');
    var k = 0;
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].length; c++) {
        if (tds[k]) tds[k].__model = rows[r][c];
        k++;
      }
    }
  }

  function blockHTML(b) {
    if (b.type === 'hr') return '';
    if (b.type === 'table') return tableHTML(b);
    if (b.type === 'passthrough') {
      return '<div class="passthrough">原始内容（图片 / 域 / 图形）已保留，保存时按原字节写回。</div>';
    }
    return runsHTML(b.runs || []);
  }

  function runsText(runs) {
    var s = '';
    for (var i = 0; i < runs.length; i++) s += runs[i].t || '';
    return s;
  }

  /* ---------- 目录块：条目来自标题，页码来自分页结果 ---------- */

  function tocEntryHTML(text, lv, id, page) {
    var l = Math.max(1, Math.min(9, lv || 1));
    return '<div class="toc-entry lv' + l + '" data-lv="' + l +
      '" data-id="' + escAttr(id || '') + '" data-text="' + escAttr(text || '') + '"' +
      (page ? ' data-page="' + page + '"' : '') + '>' +
      '<span class="toc-title" data-i18n-skip>' + escapeHTML(text || '') + '</span>' +
      '<span class="toc-dots"></span>' +
      '<span class="toc-page">' + (page ? String(page) : '') + '</span>' +
      '</div>';
  }

  function tocHTML(b) {
    var out = '';
    var entries = b.entries || [];
    if (entries.length) out = '<div class="toc-heading">目录</div>';
    for (var i = 0; i < entries.length; i++) {
      out += tocEntryHTML(entries[i].t, entries[i].lv, entries[i].id, entries[i].page);
    }
    if (!out) {
      out = '<div class="toc-heading">目录</div><div class="toc-empty">目录为空：把章节文本设为「标题 1–' +
        (b.levels || 3) + '」，再点「更新目录」。</div>';
    }
    return out;
  }

  // 以当前 DOM 里的标题为准重建条目；页码随后由 fillTocPages 回填。
  function refreshTocEntries() {
    var host = docHost();
    if (!host) return;
    var tocs = host.querySelectorAll('.blk[data-type="toc"]');
    if (!tocs.length) return;
    var heads = [];
    var blocks = host.querySelectorAll('.blk');
    for (var i = 0; i < blocks.length; i++) {
      var m = /^h([1-9])$/.exec(blocks[i].getAttribute('data-type') || '');
      if (!m) continue;
      var body = blocks[i].querySelector('.blk-body');
      var text = body ? body.textContent.replace(/\s+/g, ' ').trim() : '';
      heads.push({
        id: blocks[i].getAttribute('data-id') || '',
        lv: parseInt(m[1], 10),
        t: text
      });
    }
    for (var k = 0; k < tocs.length; k++) {
      var levels = parseInt(tocs[k].getAttribute('data-levels') || '3', 10) || 3;
      var bodyEl = tocs[k].querySelector('.toc-body');
      if (!bodyEl) continue;
      var html = '';
      for (var j = 0; j < heads.length; j++) {
        if (heads[j].lv > levels || !heads[j].t) continue;
        html += tocEntryHTML(heads[j].t, heads[j].lv, heads[j].id, 0);
      }
      bodyEl.innerHTML = '<div class="toc-heading">目录</div>' + (html ||
        '<div class="toc-empty">目录为空：把章节文本设为「标题 1–' + levels + '」，再点「更新目录」。</div>');
    }
  }

  function fillTocPages() {
    var host = docHost();
    if (!host) return;
    var pages = host.querySelectorAll('.doc-page');
    var pageOf = {};
    for (var p = 0; p < pages.length; p++) {
      var blocks = pages[p].querySelectorAll('.blk');
      for (var i = 0; i < blocks.length; i++) {
        if (!/^h[1-9]$/.test(blocks[i].getAttribute('data-type') || '')) continue;
        var id = blocks[i].getAttribute('data-id');
        if (id && pageOf[id] === undefined) pageOf[id] = p + 1;
      }
    }
    var entries = host.querySelectorAll('.blk-toc .toc-entry');
    for (var k = 0; k < entries.length; k++) {
      var eid = entries[k].getAttribute('data-id');
      var pg = eid && pageOf[eid] ? pageOf[eid] : 0;
      var span = entries[k].querySelector('.toc-page');
      if (span) span.textContent = pg ? String(pg) : '';
      if (pg) entries[k].setAttribute('data-page', String(pg));
      else entries[k].removeAttribute('data-page');
    }
  }

  function applyBlockMetrics(el, body, b) {
    if (b.align) body.style.textAlign = b.align;
    if (b.indent) body.style.marginLeft = (Math.min(8, b.indent) * 24) + 'px';
    if (Number(b.indentLeft)) body.style.marginLeft = twipPx(b.indentLeft) + 'px';
    if (Number(b.indentFirst)) body.style.textIndent = twipPx(b.indentFirst) + 'px';
    if (Number(b.spaceBefore)) el.style.marginTop = twipPx(b.spaceBefore) + 'px';
    if (Number(b.spaceAfter)) el.style.marginBottom = twipPx(b.spaceAfter) + 'px';
    if (Number(b.lineHeight)) {
      var rule = b.lineRule || 'auto';
      body.style.lineHeight = rule === 'auto'
        ? String(Math.max(0.8, b.lineHeight / 240))
        : twipPx(b.lineHeight) + 'px';
    }
  }

  function makeBlockEl(b) {
    var el = document.createElement('div');
    el.className = 'blk';
    el.setAttribute('data-id', b.id || '');
    el.setAttribute('data-type', b.type || 'p');
    el.__block = b;
    if (b.align) el.setAttribute('data-align', b.align);
    if (b.indent) el.setAttribute('data-indent', String(b.indent));
    if (Number(b.indentLeft)) el.setAttribute('data-indent-left', String(b.indentLeft));
    if (Number(b.indentFirst)) el.setAttribute('data-indent-first', String(b.indentFirst));
    if (Number(b.spaceBefore)) el.setAttribute('data-space-before', String(b.spaceBefore));
    if (Number(b.spaceAfter)) el.setAttribute('data-space-after', String(b.spaceAfter));
    if (Number(b.lineHeight)) el.setAttribute('data-line-height', String(b.lineHeight));
    if (b.lineRule) el.setAttribute('data-line-rule', b.lineRule);
    if (b.ordered) el.setAttribute('data-ordered', '1');
    if (b.anchor && b.anchor.raw) el.setAttribute('data-anchor', '1');
    if (b.hash) el.setAttribute('data-hash', b.hash);
    if (b.type === 'toc') {
      el.className = 'blk blk-toc';
      el.setAttribute('data-levels', String(b.levels || 3));
    }

    var tools = document.createElement('div');
    tools.className = 'blk-tools';
    tools.innerHTML = '<button data-act="up" title="上移">↑</button>' +
      '<button data-act="down" title="下移">↓</button>' +
      '<button data-act="del" title="删除">✕</button>';
    el.appendChild(tools);

    if (b.type === 'table' || b.type === 'passthrough') {
      var wrap = document.createElement('div');
      wrap.className = 'blk-body';
      wrap.innerHTML = blockHTML(b);
      if (b.type === 'table') attachCellModels(wrap.querySelector('table'), b.rows || []);
      applyBlockMetrics(el, wrap, b);
      el.appendChild(wrap);
    } else if (b.type === 'toc') {
      // 目录由分页器生成：条目文本来自标题块，页码来自这一轮分页结果。
      var tocBody = document.createElement('div');
      tocBody.className = 'blk-body toc-body';
      tocBody.setAttribute('contenteditable', 'false');
      tocBody.innerHTML = tocHTML(b);
      el.appendChild(tocBody);
    } else if (b.type === 'hr') {
      el.style.borderTop = '1px solid #ded6c8';
      el.style.margin = '18px 0';
    } else if (b.type === 'pagebreak') {
      // 分页符只做视觉标记；真正的 w:br 由导出时生成。
      el.className = 'blk blk-pagebreak';
      var mark = document.createElement('div');
      mark.className = 'blk-body pagebreak-mark';
      mark.textContent = '分页符';
      el.appendChild(mark);
    } else {
      var body = document.createElement('div');
      body.className = 'blk-body';
      body.setAttribute('contenteditable', 'true');
      body.setAttribute('spellcheck', 'true');
      body.innerHTML = blockHTML(b);
      applyBlockMetrics(el, body, b);
      el.appendChild(body);
    }
    return el;
  }

  /* ==================== 文档分页 ==================== */

  // 分页只改视图，不改模型：块仍然按顺序保存在 doc.doc.blocks 里，
  // 页面只是把块按 A4 可用高度装进多张纸。Word / WPS / OnlyOffice 的
  // 页面视图也是这个结构：内容流 + 排版器 + 纸张投影。
  var paginateTimer = null;
  var composing = false;
  var splitSeq = 0;
  var splitMap = {};
  var CM_PX = 96 / 2.54; // 1cm 在 96dpi 下的 CSS 像素数，与 A4 794×1123 对齐

  function docHost() { return document.getElementById('docEditor'); }

  function currentDoc() {
    var d = global.__edDoc;
    return d && d.kind === 'doc' ? d : null;
  }

  function pagesNow() {
    var host = docHost();
    return host ? host.querySelectorAll('.doc-page') : [];
  }

  function createPageEl() {
    var page = document.createElement('div');
    page.className = 'doc-page';
    var head = document.createElement('div');
    head.className = 'page-head';
    head.hidden = true;
    var body = document.createElement('div');
    body.className = 'doc-body';
    var foot = document.createElement('div');
    foot.className = 'page-foot';
    foot.hidden = true;
    page.appendChild(head);
    page.appendChild(body);
    page.appendChild(foot);
    return page;
  }

  function bodyOf(page) { return page ? page.querySelector('.doc-body') : null; }

  function ensurePage(index) {
    var host = docHost();
    var pages = pagesNow();
    while (pages.length <= index) {
      host.appendChild(createPageEl());
      pages = pagesNow();
    }
    return pages[index];
  }

  function findBlock(id) {
    var host = docHost();
    if (!host) return null;
    var els = host.querySelectorAll('.blk');
    if (!id) return els.length ? els[0] : null;
    for (var i = 0; i < els.length; i++) {
      if (els[i].getAttribute('data-id') === id) return els[i];
    }
    return null;
  }

  function canSplit(blk) {
    var type = blk.getAttribute('data-type') || 'p';
    // 标题和代码块整块换页，避免把标题留在上一页末尾；表格单独按行拆。
    return type === 'p' || type === 'li' || type === 'quote';
  }

  // 当前显示比例。缩放放在 .doc-pages 容器上而不是每张纸上：
  // WebKit 对 grid 子项的 zoom 有兼容问题，会让纸张宽度变了、文字不跟着变。
  var activeScale = 1;

  function zoomScale(el) {
    if (activeScale) return activeScale;
    var page = el && el.closest ? el.closest('.doc-page') : null;
    if (!page) return 1;
    var rect = page.getBoundingClientRect();
    return page.offsetWidth ? rect.width / page.offsetWidth : 1;
  }

  function blockOuterHeight(blk) {
    var cs = window.getComputedStyle(blk);
    return blk.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
  }

  function bodyAvailable(body) {
    var cs = window.getComputedStyle(body);
    var n = body.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    return n > 0 ? n : 0;
  }

  function textOffsetTo(body, node, off) {
    var r = document.createRange();
    try {
      r.selectNodeContents(body);
      r.setEnd(node, off);
    } catch (e) { return -1; }
    return r.toString().length;
  }

  function pointInBlock(node, off) {
    var el = node;
    if (el.nodeType === 3) el = el.parentNode;
    var blk = el && el.closest ? el.closest('.blk') : null;
    if (!blk) return null;
    var body = blk.querySelector('.blk-body');
    if (!body) return null;
    var n = textOffsetTo(body, node, off);
    if (n < 0) return null;
    return { id: blk.getAttribute('data-id') || '', off: n };
  }

  function saveDocSelection() {
    var host = docHost();
    var sel = window.getSelection();
    if (!host || !sel || !sel.rangeCount) return null;
    var r = sel.getRangeAt(0);
    var c = r.commonAncestorContainer;
    var el = c.nodeType === 3 ? c.parentNode : c;
    if (!host.contains(el)) return null;
    var start = pointInBlock(r.startContainer, r.startOffset);
    var end = pointInBlock(r.endContainer, r.endOffset);
    if (!start || !end) return null;
    return {
      start: start, end: end, collapsed: r.collapsed,
      focused: !!(document.activeElement && host.contains(document.activeElement))
    };
  }

  // 拆分后块会变成两块：原 id 保留前半段，新 id 承接后半段。
  // 光标偏移量通过 splitMap 顺着链往下找，跨一次或多次拆分都能落回原位置。
  function resolvePoint(p) {
    var id = p.id, off = p.off, guard = 0;
    while (splitMap[id] && guard++ < 200) {
      var sm = splitMap[id];
      if (off <= sm.offset) break;
      id = sm.tailId;
      off -= sm.offset;
    }
    var blk = findBlock(id);
    if (!blk) return null;
    return { blk: blk, off: off };
  }

  function rangeAtPoint(blk, off) {
    var body = blk.querySelector('.blk-body[contenteditable]');
    if (!body) return null;
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
    var left = off, node;
    while ((node = walker.nextNode())) {
      var len = node.nodeValue ? node.nodeValue.length : 0;
      if (left <= len) {
        var r = document.createRange();
        r.setStart(node, left);
        r.collapse(true);
        return r;
      }
      left -= len;
    }
    var r2 = document.createRange();
    r2.selectNodeContents(body);
    r2.collapse(false);
    return r2;
  }

  function restoreDocSelection(saved) {
    if (!saved) return;
    var a = resolvePoint(saved.start);
    var b = resolvePoint(saved.end);
    if (!a || !b) return;
    var ra = rangeAtPoint(a.blk, a.off);
    var rb = rangeAtPoint(b.blk, b.off);
    if (!ra || !rb) return;
    if (saved.focused) {
      var body = a.blk.querySelector('.blk-body[contenteditable]');
      if (body) body.focus();
    }
    var sel = window.getSelection();
    if (!sel) return;
    var out = document.createRange();
    out.setStart(ra.startContainer, ra.startOffset);
    if (saved.collapsed) out.collapse(true);
    else out.setEnd(rb.startContainer, rb.startOffset);
    sel.removeAllRanges();
    sel.addRange(out);
  }

  function revealCaret() {
    var sel = window.getSelection();
    var scroll = document.querySelector('.doc-scroll');
    if (!sel || !sel.rangeCount || !scroll) return;
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return;
    var sr = scroll.getBoundingClientRect();
    if (rect.top < sr.top + 8) scroll.scrollTop -= (sr.top + 8 - rect.top);
    else if (rect.bottom > sr.bottom - 8) scroll.scrollTop += (rect.bottom - sr.bottom + 8);
  }

  function textNodesOf(body) {
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
    var out = [], total = 0, n;
    while ((n = walker.nextNode())) {
      var len = n.nodeValue ? n.nodeValue.length : 0;
      if (!len) continue;
      out.push({ node: n, start: total, end: total + len, len: len });
      total += len;
    }
    return { nodes: out, total: total };
  }

  function locateOffset(nodes, off) {
    for (var i = 0; i < nodes.length; i++) {
      if (off <= nodes[i].end) return { node: nodes[i].node, off: off - nodes[i].start };
    }
    var last = nodes[nodes.length - 1];
    return { node: last.node, off: last.len };
  }

  function bottomAt(body, nodes, off) {
    var pos = locateOffset(nodes, off);
    var r = document.createRange();
    try {
      r.selectNodeContents(body);
      r.setEnd(pos.node, pos.off);
    } catch (e) { return 0; }
    return r.getBoundingClientRect().bottom;
  }

  // 按“行”拆分段落：二分找到最后一行能完整放下文字的位置，再把后半段
  // 搬进一个新块。Word 的分页器也是先做行盒，再决定在哪个行盒换页。
  function splitTextBlock(blk, spaceLeft) {
    // 不足一行的高度不拆：拆出来也只有一两行，反而在下一页顶部留下碎片。
    if (!canSplit(blk) || spaceLeft < 30) return false;
    var body = blk.querySelector('.blk-body[contenteditable="true"]');
    if (!body) return false;
    var info = textNodesOf(body);
    if (!info.total) return false;
    var scale = zoomScale(blk) || 1;
    // 从块自身顶部量剩余空间：块可能已被移动到另一张纸，绝对坐标不可靠，
    // 但“这块还能放多高”与它当前所在的纸无关。
    var blockTop = blk.getBoundingClientRect().top;
    var limit = blockTop + spaceLeft * scale;
    var nodes = info.nodes;

    var lo = 1, hi = info.total, fit = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (bottomAt(body, nodes, mid) <= limit) { fit = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (!fit) return false;
    // 同一行字符的 bottom 相同，往前推到本行末尾，避免把一行从中间切开。
    while (fit < info.total && bottomAt(body, nodes, fit + 1) <= limit) fit++;
    if (fit >= info.total) return false;

    var pos = locateOffset(nodes, fit);
    var tailRange = document.createRange();
    tailRange.setStart(pos.node, pos.off);
    tailRange.setEnd(body, body.childNodes.length);
    var frag = tailRange.extractContents();

    var oldId = blk.getAttribute('data-id') || '';
    if (!oldId) {
      oldId = 'b' + Date.now() + '-' + (++splitSeq);
      blk.setAttribute('data-id', oldId);
    }
    var newId = 's' + Date.now() + '-' + (++splitSeq);
    var type = blk.getAttribute('data-type') || 'p';
    var model = { id: newId, type: type, runs: [] };
    var align = blk.getAttribute('data-align');
    if (align) model.align = align;
    var indent = parseInt(blk.getAttribute('data-indent') || '0', 10) || 0;
    if (indent) model.indent = indent;
    if (blk.getAttribute('data-ordered') === '1') model.ordered = true;

    var tail = makeBlockEl(model);
    var tailBody = tail.querySelector('.blk-body');
    tailBody.innerHTML = '';
    while (frag.firstChild) tailBody.appendChild(frag.firstChild);

    blk.parentNode.insertBefore(tail, blk.nextSibling);
    // 分页拆出来的后半段只是视图投影：保存时按 group 合并回一个段落，
    // 否则导出 DOCX 会把分页处写成真正的段落分隔。多次拆分沿用同一个 group。
    var groupId = blk.getAttribute('data-cont-group') || oldId;
    blk.setAttribute('data-cont-group', groupId);
    tail.setAttribute('data-cont', '1');
    tail.setAttribute('data-cont-group', groupId);
    blk.__tail = tail;
    splitMap[oldId] = { offset: fit, tailId: newId };
    return true;
  }

  // 表格按行拆页：能放下的行留在本页，其余行复制到下一张纸。
  function splitTableBlock(blk, spaceLeft) {
    var table = blk.querySelector('table');
    if (!table || spaceLeft < 30) return false;
    var trs = table.querySelectorAll('tbody > tr');
    if (trs.length < 2) return false;
    var headerRows = parseInt(table.getAttribute('data-header-rows') || '0', 10) || 0;
    var scale = zoomScale(blk) || 1;
    var top = table.getBoundingClientRect().top;
    var limit = top + spaceLeft * scale;
    var fit = 0;
    for (var i = 0; i < trs.length; i++) {
      if (trs[i].getBoundingClientRect().bottom <= limit) fit = i + 1;
    }
    // 纵向合并跨过页边界时，把切点前移到合并区起始行，避免把一格切成两半。
    var moved = true;
    while (moved && fit > 0) {
      moved = false;
      for (var r = 0; r < fit; r++) {
        var tds = trs[r].querySelectorAll('td');
        for (var k = 0; k < tds.length; k++) {
          if (tds[k].rowSpan > 1 && r + tds[k].rowSpan > fit) {
            fit = r;
            moved = true;
            break;
          }
        }
        if (moved) break;
      }
    }
    if (fit <= headerRows || fit >= trs.length) return false;

    var tbody = table.querySelector('tbody');
    var tailTable = table.cloneNode(false);
    var colgroup = table.querySelector('colgroup');
    if (colgroup) tailTable.appendChild(colgroup.cloneNode(true));
    var tailBody = tbody ? tbody.cloneNode(false) : document.createElement('tbody');

    function cloneRow(src) {
      var row = src.cloneNode(true);
      var from = src.querySelectorAll('td');
      var to = row.querySelectorAll('td');
      for (var n = 0; n < from.length && n < to.length; n++) to[n].__model = from[n].__model;
      return row;
    }

    // 跨页后重复表头（Word 的 tblHeader 语义）。
    for (var h = 0; h < headerRows && h < trs.length; h++) {
      tailBody.appendChild(cloneRow(trs[h]));
    }
    for (var m = fit; m < trs.length; m++) {
      tailBody.appendChild(cloneRow(trs[m]));
      trs[m].parentNode.removeChild(trs[m]);
    }
    tailTable.appendChild(tailBody);

    var newId = 't' + Date.now() + '-' + (++splitSeq);
    var groupId = blk.getAttribute('data-cont-group') || newId;
    var tail = makeBlockEl({ id: newId, type: 'table', rows: [] });
    tail.__block = blk.__block ? { id: newId, type: 'table', rows: [] } : tail.__block;
    var tailBodyEl = tail.querySelector('.blk-body');
    tailBodyEl.innerHTML = '';
    tailBodyEl.appendChild(tailTable);
    blk.parentNode.insertBefore(tail, blk.nextSibling);
    // 表格同样按行合并回一张表，保存时不会变成两张独立的表。
    blk.setAttribute('data-cont-group', groupId);
    tail.setAttribute('data-cont', '1');
    tail.setAttribute('data-cont-group', groupId);
    blk.__tail = tail;
    return true;
  }

  ED.renderDoc = function (doc, host) {
    host.innerHTML = '';
    // 导入件沿用原件的默认字体/字号；新建件保持编辑器主题。
    var body0 = (doc && doc.doc) || {};
    if (doc && doc.source && body0.defaultFont) {
      host.classList.add('doc-imported');
      host.style.setProperty('--doc-font', fontStack(body0.defaultFont));
    } else {
      host.classList.remove('doc-imported');
      host.style.removeProperty('--doc-font');
    }
    if (doc && doc.source && Number(body0.defaultSize) > 0) {
      host.style.setProperty('--doc-size', (Number(body0.defaultSize) / 2) + 'pt');
    } else {
      host.style.removeProperty('--doc-size');
    }
    var blocks = (doc.doc && doc.doc.blocks) || [];
    var first = createPageEl();
    host.appendChild(first);
    var body = bodyOf(first);
    if (!blocks.length) {
      // 空文档也要有一个可编辑段落：打开就落在纸上，和 Word 的空白页一致。
      body.appendChild(makeBlockEl({ id: '', type: 'p', runs: [] }));
    } else {
      for (var i = 0; i < blocks.length; i++) body.appendChild(makeBlockEl(blocks[i]));
    }
    ED.paginate(doc);
  };

  // 页边距与纸张尺寸写在模型里；这里只把它们映射成纸张的 CSS 变量。
  ED.applyPage = function (doc) {
    var host = docHost();
    if (!host) return;
    var p = (doc && doc.doc && doc.doc.page) || {};
    function cm(v, fallback) {
      var n = parseFloat(v);
      return isFinite(n) && n >= 0 ? n : fallback;
    }
    host.style.setProperty('--page-w', cm(p.width, 21) + 'cm');
    host.style.setProperty('--page-h', cm(p.height, 29.7) + 'cm');
    host.style.setProperty('--m-top', cm(p.top, 2.54) + 'cm');
    host.style.setProperty('--m-bottom', cm(p.bottom, 2.54) + 'cm');
    host.style.setProperty('--m-left', cm(p.left, 3.17) + 'cm');
    host.style.setProperty('--m-right', cm(p.right, 3.17) + 'cm');
  };

  // 把插入光标放到第一个段落开头，打开文档即可直接打字。
  ED.focusDoc = function () {
    var body = document.querySelector('#docEditor .blk-body[contenteditable]');
    if (!body) return;
    body.focus();
    var range = document.createRange();
    range.selectNodeContents(body);
    range.collapse(true);
    var sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // 页眉页脚是文档级属性：编辑器只做可见预览，导出时写进 sectPr。
  // 分页后每一张纸都重复页眉，页脚带自己的页码。
  ED.renderPageFrame = function (doc) {
    var d = (doc && doc.doc) || {};
    var pages = pagesNow();
    for (var i = 0; i < pages.length; i++) {
      var head = pages[i].querySelector('.page-head');
      var foot = pages[i].querySelector('.page-foot');
      if (head) {
        head.textContent = d.header || '';
        head.hidden = !d.header;
      }
      if (foot) {
        var parts = [];
        if (d.footer) parts.push(d.footer);
        if (d.pageNum) parts.push('第 ' + (i + 1) + ' 页');
        foot.textContent = parts.join('　·　');
        foot.hidden = !parts.length;
      }
    }
  };

  /* ---------- 排版：把块装进一张张纸 ---------- */

  ED.paginate = function (doc) {
    doc = doc || currentDoc();
    var host = docHost();
    if (!doc || !host) return;
    if (window.innerWidth <= 900) { ED.unpaginate(); return; }

    var saved = saveDocSelection();
    splitMap = {};
    splitSeq = 0;

    // 目录先按当前标题重建条目（页码稍后回填），这样它的高度参与本轮排版。
    refreshTocEntries();

    var pages = pagesNow();
    if (!pages.length) {
      host.appendChild(createPageEl());
      pages = pagesNow();
    }
    var blocks = [];
    var all = host.querySelectorAll('.blk');
    for (var i = 0; i < all.length; i++) blocks.push(all[i]);

    var pageIndex = 0;
    var page = pages[0];
    var body = bodyOf(page);
    var available = bodyAvailable(body);
    var used = 0;
    var cursor = null;
    var lastUsed = 0;
    var pendingBreak = false;

    function nextPage() {
      pageIndex++;
      page = ensurePage(pageIndex);
      body = bodyOf(page);
      available = bodyAvailable(body);
      used = 0;
      cursor = null;
    }

    if (!blocks.length && !body.querySelector('.blk')) {
      body.appendChild(makeBlockEl({ id: '', type: 'p', runs: [] }));
    }

    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b];

      if (pendingBreak) {
        nextPage();
        pendingBreak = false;
      }

      var h = blockOuterHeight(blk);
      // 一块可能跨多页：拆出后半段后继续判断，直到这一块本身能落在当前页。
      var guard = 0;
      while (used + h > available + 0.5 && guard++ < 200) {
        var tail = null;
        if (canSplit(blk)) {
          if (splitTextBlock(blk, available - used)) tail = blk.__tail;
        } else if ((blk.getAttribute('data-type') || '') === 'table') {
          if (splitTableBlock(blk, available - used)) tail = blk.__tail;
        }
        if (tail) {
          // 后半段作为新的块紧接着参与排版。
          blocks.splice(b + 1, 0, tail);
          h = blockOuterHeight(blk);
        } else if (used > 0) {
          nextPage();
          h = blockOuterHeight(blk);
        } else {
          // used === 0 时仍放不下：单块比一页还高且不可拆，留在本页溢出。
          break;
        }
      }

      // 只做必要的 DOM 移动，避免每次输入都整篇重排、打断光标。
      if (blk.parentNode !== body) {
        body.appendChild(blk);
      } else if (cursor ? blk.previousElementSibling !== cursor : body.firstElementChild !== blk) {
        body.insertBefore(blk, cursor ? cursor.nextSibling : body.firstElementChild);
      }

      used += h;
      cursor = blk;
      lastUsed = pageIndex;
      if (blk.getAttribute('data-type') === 'pagebreak') pendingBreak = true;
    }

    // 末尾是分页符：保留一张空白纸并放一个空段落，用户可以接着写。
    if (pendingBreak) {
      lastUsed = pageIndex + 1;
      var lastBody = bodyOf(ensurePage(lastUsed));
      if (!lastBody.querySelector('.blk')) {
        lastBody.appendChild(makeBlockEl({ id: '', type: 'p', runs: [] }));
      }
    }

    // 删除多余尾页；至少保留一页。
    var after = pagesNow();
    for (var p = after.length - 1; p > Math.max(0, lastUsed); p--) {
      if (after[p].parentNode) after[p].parentNode.removeChild(after[p]);
    }

    // 最后一页被清空时补一个落笔点。
    var finalPages = pagesNow();
    var finalBody = bodyOf(finalPages[finalPages.length - 1]);
    if (finalBody && !finalBody.querySelector('.blk')) {
      finalBody.appendChild(makeBlockEl({ id: '', type: 'p', runs: [] }));
    }

    ED.renderPageFrame(doc);
    ED.applyZoom();
    fillTocPages();
    restoreDocSelection(saved);
    if (saved && saved.focused) revealCaret();
    ED.updatePageStat();
    ED.updateRuler();
  };

  // 窄屏不做固定 A4 分页：把所有块合并回一张连续纸。
  ED.unpaginate = function () {
    var host = docHost();
    if (!host) return;
    var pages = pagesNow();
    if (!pages.length) {
      host.appendChild(createPageEl());
      pages = pagesNow();
    }
    var firstBody = bodyOf(pages[0]);
    for (var i = 1; i < pages.length; i++) {
      var b = bodyOf(pages[i]);
      while (b && b.firstChild) firstBody.appendChild(b.firstChild);
      if (pages[i].parentNode) pages[i].parentNode.removeChild(pages[i]);
    }
    if (!firstBody.querySelector('.blk')) {
      firstBody.appendChild(makeBlockEl({ id: '', type: 'p', runs: [] }));
    }
    var left = pagesNow();
    for (var j = 0; j < left.length; j++) left[j].style.zoom = '';
    ED.renderPageFrame(currentDoc());
    ED.updatePageStat();
    ED.updateRuler();
  };

  /* ---------- 显示比例：百分比 / 页宽 / 整页 / 双页 / 四页 ---------- */

  function storedZoom() {
    try { return localStorage.getItem('office.docZoom') || '100'; } catch (e) { return '100'; }
  }

  function pageMetrics() {
    var host = docHost();
    var cs = host ? window.getComputedStyle(host) : null;
    var w = parseFloat(host && host.style.getPropertyValue('--page-w')) ||
      (cs ? parseFloat(cs.getPropertyValue('--page-w')) : 0) || 21;
    var h = parseFloat(host && host.style.getPropertyValue('--page-h')) ||
      (cs ? parseFloat(cs.getPropertyValue('--page-h')) : 0) || 29.7;
    return { w: w * CM_PX + 2, h: h * CM_PX + 2 };
  }

  ED.setZoom = function (mode) {
    try { localStorage.setItem('office.docZoom', mode); } catch (e) {}
    ED.applyZoom();
    ED.updatePageStat();
    ED.updateRuler();
  };

  // 当前实际显示比例：数值模式直接读，页宽/整页等模式按纸张宽度反算。
  function zoomPercent() {
    var n = parseFloat(storedZoom());
    if (isFinite(n)) return n;
    var page = pagesNow()[0];
    if (!page || !page.offsetWidth) return 100;
    return page.getBoundingClientRect().width / page.offsetWidth * 100;
  }

  // 以指针位置为锚点缩放：先记录指针下的文档坐标，缩放后把它滚回原位。
  function setZoomAt(percent, cx, cy) {
    var scroll = document.querySelector('.doc-scroll');
    var host = docHost();
    if (!scroll || !host || !pagesNow().length || window.innerWidth <= 900) return;
    var before = zoomPercent();
    var next = Math.max(25, Math.min(400, Math.round(percent)));
    if (!isFinite(next) || Math.abs(next - before) < 0.5) return;
    var rect = scroll.getBoundingClientRect();
    var px = (cx == null ? rect.left + rect.width / 2 : cx) - rect.left;
    var py = (cy == null ? rect.top + rect.height / 2 : cy) - rect.top;
    var ax = (scroll.scrollLeft + px) / (before / 100);
    var ay = (scroll.scrollTop + py) / (before / 100);
    ED.setZoom(String(next));
    scroll.scrollLeft = ax * (next / 100) - px;
    scroll.scrollTop = ay * (next / 100) - py;
  }

  ED.zoomPercent = zoomPercent;
  ED.zoomBy = function (factor, cx, cy) {
    setZoomAt(zoomPercent() * factor, cx, cy);
  };

  // 触控板捏合、Safari gesture 与双指触摸统一到同一条缩放路径。
  function installPinchZoom() {
    var scroll = document.querySelector('.doc-scroll');
    if (!scroll || scroll.__pinchBound) return;
    scroll.__pinchBound = true;

    // Chromium 把触控板捏合转成 ctrl+wheel；deltaY 连续，指数映射更接近手感。
    scroll.addEventListener('wheel', function (e) {
      if (!e.ctrlKey || e.metaKey || window.innerWidth <= 900) return;
      e.preventDefault();
      // 鼠标滚轮一格是 ±120，触控板捏合每帧只有个位数；先按行数归一，再限幅，
      // 避免 ctrl+滚轮一格直接跳到 300%。
      var step = -e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      var factor = Math.exp(step * 0.0025);
      factor = Math.max(0.85, Math.min(1.2, factor));
      ED.zoomBy(factor, e.clientX, e.clientY);
    }, { passive: false });

    // Safari / WKWebView 的捏合走 gesture 事件，scale 是相对手势起点的倍数。
    var gBase = 100;
    scroll.addEventListener('gesturestart', function (e) {
      if (window.innerWidth <= 900) return;
      e.preventDefault();
      gBase = zoomPercent();
    }, { passive: false });
    scroll.addEventListener('gesturechange', function (e) {
      if (window.innerWidth <= 900) return;
      e.preventDefault();
      setZoomAt(gBase * (e.scale || 1), e.clientX, e.clientY);
    }, { passive: false });
    scroll.addEventListener('gestureend', function (e) {
      if (window.innerWidth > 900) e.preventDefault();
    }, { passive: false });

    // 触屏双指：按两指距离比例缩放，锚点取两指中点。
    var tDist = 0, tBase = 100;
    function touchDist(t) {
      var dx = t[0].clientX - t[1].clientX;
      var dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    scroll.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2 && window.innerWidth > 900) {
        tDist = touchDist(e.touches);
        tBase = zoomPercent();
      }
    }, { passive: true });
    scroll.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2 || window.innerWidth <= 900) return;
      if (!tDist) { tDist = touchDist(e.touches); tBase = zoomPercent(); return; }
      e.preventDefault();
      var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setZoomAt(tBase * touchDist(e.touches) / tDist, midX, midY);
    }, { passive: false });
    scroll.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) tDist = 0;
    }, { passive: true });

    // 键盘兜底：部分原生壳不会把触控板捏合转成 DOM 事件。
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      // currentDoc() 只认 Word；PDF 也要走同一组快捷键。
      var doc = global.__edDoc;
      if (!doc) return;
      var pdf = doc.kind === 'pdf';
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        if (pdf) setPdfZoomAt((pdfState.percent || 100) * 1.1);
        else ED.zoomBy(1.1);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        if (pdf) setPdfZoomAt((pdfState.percent || 100) / 1.1);
        else ED.zoomBy(1 / 1.1);
      } else if (e.key === '0') {
        e.preventDefault();
        if (pdf) { pdfState.zoom = 'page-width'; ED.setPdfZoom('page-width'); }
        else ED.setZoom('100');
      }
    });
  }

  function installZoomSurfaces() {
    installPinchZoom();
    installPdfZoom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installZoomSurfaces);
  } else {
    installZoomSurfaces();
  }

  // 清掉上一轮缩放写在容器上的内联尺寸。
  function resetZoomBox(host, box) {
    host.style.transform = '';
    host.style.transformOrigin = '';
    host.style.width = '';
    host.style.height = '';
    host.style.minHeight = '';
    if (box) { box.style.width = ''; box.style.height = ''; }
  }

  // 量未缩放时所有纸张的并集，再把容器固定成这个尺寸并 transform。
  // WebKit 的 CSS zoom 在 grid 子项上不生效，transform 是两种引擎都可靠的路径。
  function fitZoomBox(host, box, scale, pages) {
    if (!(scale > 0) || scale === 1) return false;
    var minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
    for (var i = 0; i < pages.length; i++) {
      var r = pages[i].getBoundingClientRect();
      if (!r.width) continue;
      minL = Math.min(minL, r.left);
      minT = Math.min(minT, r.top);
      maxR = Math.max(maxR, r.right);
      maxB = Math.max(maxB, r.bottom);
    }
    var contentW = maxR - minL;
    var contentH = maxB - minT;
    if (!(contentW > 0) || !(contentH > 0)) return false;
    host.style.width = contentW + 'px';
    host.style.height = contentH + 'px';
    host.style.minHeight = '0';
    host.style.transformOrigin = 'top left';
    host.style.transform = 'scale(' + scale + ')';
    if (box) {
      box.style.width = (contentW * scale).toFixed(2) + 'px';
      box.style.height = (contentH * scale).toFixed(2) + 'px';
    }
    return true;
  }

  ED.applyZoom = function () {
    var host = docHost();
    if (!host) return;
    var pages = pagesNow();
    var mode = storedZoom();
    var sel = document.getElementById('docZoom');
    if (sel) {
      // 捏合会产生任意百分比；给单选组补一个临时选项，状态栏才能显示真实值。
      var dyn = sel.querySelectorAll('option[data-dyn="1"]');
      for (var di = 0; di < dyn.length; di++) dyn[di].parentNode.removeChild(dyn[di]);
      if (/^\d+$/.test(mode) && !sel.querySelector('option[value="' + mode + '"]')) {
        var opt = document.createElement('option');
        opt.value = mode;
        opt.textContent = mode + '%';
        opt.setAttribute('data-dyn', '1');
        sel.appendChild(opt);
      }
      if (sel.value !== mode) sel.value = mode;
    }
    // 重置缩放布局类时保留“导入件”标记，否则默认字体规则会被一起清掉。
    var imported = host.classList.contains('doc-imported');
    host.className = 'doc-pages' + (imported ? ' doc-imported' : '');
    var box = document.getElementById('docZoomBox');
    resetZoomBox(host, box);
    activeScale = 1;
    if (!pages.length) return;
    if (window.innerWidth <= 900) return;

    var scale = 1;
    var dims = pageMetrics();
    var numeric = parseFloat(mode);
    if (isFinite(numeric)) {
      scale = numeric / 100;
    } else {
      var scroll = document.querySelector('.doc-scroll');
      var availW = Math.max(180, (scroll ? scroll.clientWidth : window.innerWidth) - 36);
      var availH = Math.max(180, (scroll ? scroll.clientHeight : window.innerHeight) - 36);
      if (mode === 'pagewidth') {
        scale = availW / dims.w;
      } else if (mode === 'pageheight') {
        scale = Math.min(availW / dims.w, availH / dims.h);
      } else if (mode === 'twopage') {
        host.classList.add('mode-two');
        scale = Math.min((availW - 18) / (dims.w * 2), availH / dims.h);
      } else if (mode === 'fourpage') {
        host.classList.add('mode-four');
        scale = Math.min((availW - 18) / (dims.w * 2), (availH - 18) / (dims.h * 2));
      }
    }
    scale = Math.max(0.1, Math.min(3, scale));
    // 放大到超过视口宽度时靠左排，否则居中的超宽纸张左侧会滚不到。
    var scrollEl = document.querySelector('.doc-scroll');
    var avail = Math.max(1, (scrollEl ? scrollEl.clientWidth : window.innerWidth) - 36);
    var cols = (mode === 'twopage' || mode === 'fourpage') ? 2 : 1;
    var total = dims.w * scale * cols + (cols === 2 ? 18 : 0);
    if (total > avail + 1) host.classList.add('align-start');
    if (scale === 1) return;
    if (!fitZoomBox(host, box, scale, pages)) return;
    activeScale = scale;
  };

  ED.updatePageStat = function () {
    var stat = document.getElementById('docPageStat');
    if (!stat) return;
    var pages = pagesNow();
    if (!pages.length) { stat.textContent = ''; return; }
    var scroll = document.querySelector('.doc-scroll');
    var current = 1;
    if (scroll) {
      var sr = scroll.getBoundingClientRect();
      var bestTop = Infinity;
      for (var i = 0; i < pages.length; i++) {
        var r = pages[i].getBoundingClientRect();
        if (r.bottom <= sr.top + 4) continue; // 已滚出视口上方
        if (r.top >= sr.bottom) break;        // 还在视口下方
        if (r.top < bestTop) { bestTop = r.top; current = i + 1; }
      }
    }
    stat.textContent = '第 ' + current + ' 页，共 ' + pages.length + ' 页';
  };

  /* ---------- 页面标尺：白底对齐纸张，刻度按 1cm 缩放 ---------- */

  // 标尺只做投影，不改模型；拖动边距由 app.js 写回 doc.page 后再分页。
  ED.updateRuler = function () {
    var wrap = document.getElementById('docRuler');
    var track = document.getElementById('rulerPage');
    if (!wrap || !track) return;
    var host = docHost();
    var first = pagesNow()[0];
    if (!host || !first || window.innerWidth <= 900) {
      wrap.hidden = true;
      return;
    }
    var pr = first.getBoundingClientRect();
    var wr = wrap.getBoundingClientRect();
    if (!pr.width) { wrap.hidden = true; return; }
    wrap.hidden = false;

    // 页面在滚动容器里的横向位置换算到标尺坐标系，横向滚动也能对齐。
    track.style.left = Math.round(pr.left - wr.left) + 'px';
    track.style.width = Math.round(pr.width) + 'px';

    var scale = zoomScale(first) || 1;
    var pageCm = parseFloat(host.style.getPropertyValue('--page-w')) || 21;
    var ml = parseFloat(host.style.getPropertyValue('--m-left')) || 3.17;
    var mr = parseFloat(host.style.getPropertyValue('--m-right')) || 3.17;
    var cmPx = CM_PX * scale;
    // +1px 是纸张边框，正文从边框内侧起算，和 CSS 的 padding 对齐。
    var textLeft = (ml * CM_PX + 1) * scale;
    var textW = Math.max(8, pr.width - textLeft - ((mr * CM_PX + 1) * scale));

    var ticks = document.getElementById('rulerTicks');
    var shadeL = document.getElementById('rulerShadeLeft');
    var shadeR = document.getElementById('rulerShadeRight');
    var hl = document.getElementById('rulerHandleLeft');
    var hr = document.getElementById('rulerHandleRight');
    if (ticks) {
      ticks.style.left = textLeft + 'px';
      ticks.style.width = textW + 'px';
      // 标签太密时降频：满格 1cm，缩到 75% 以下 2cm，50% 左右 5cm。
      var step = cmPx >= 26 ? 1 : (cmPx >= 15 ? 2 : 5);
      var showHalf = cmPx >= 18;
      var textCm = textW / cmPx;
      var html = '';
      var total = Math.floor(textCm * 2 + 0.001);
      for (var i = 0; i <= total; i++) {
        var cm = i / 2;
        var major = i % 2 === 0;
        if (!major && !showHalf) continue;
        var x = (cm * cmPx).toFixed(2);
        html += '<span class="rt' + (major ? ' rt-major' : '') + '" style="left:' + x + 'px"></span>';
        if (major && Math.round(cm) % step === 0) {
          html += '<span class="rt-num" style="left:' + x + 'px">' + Math.round(cm) + '</span>';
        }
      }
      if (ticks.innerHTML !== html) ticks.innerHTML = html;
    }
    if (shadeL) shadeL.style.width = textLeft + 'px';
    if (shadeR) {
      shadeR.style.left = (textLeft + textW) + 'px';
      shadeR.style.right = '0';
    }
    if (hl) hl.style.left = textLeft + 'px';
    if (hr) hr.style.left = (textLeft + textW) + 'px';
  };

  // 拖动时把屏幕像素差换算成厘米；缩放变化由每次拖动起点重新取值。
  ED.rulerCmPx = function () {
    var first = pagesNow()[0];
    if (!first || !first.offsetWidth) return CM_PX;
    return CM_PX * (zoomScale(first) || 1);
  };

  ED.schedulePaginate = function () {
    if (paginateTimer) clearTimeout(paginateTimer);
    // 输入优先：停手约 0.4 秒再重排，长文档不会每个键都做一次全量测量。
    paginateTimer = setTimeout(function () {
      paginateTimer = null;
      if (composing) return;
      var run = function () {
        var d = currentDoc();
        if (d) ED.paginate(d);
      };
      // 浏览器空闲时再排版；没有 requestIdleCallback 的环境直接跑。
      if (global.requestIdleCallback) global.requestIdleCallback(run, { timeout: 600 });
      else run();
    }, 420);
  };

  ED.docTools = function (host) {
    // 中文输入法组合期间不重排：DOM 移动会让候选框丢位置。
    host.addEventListener('compositionstart', function () { composing = true; });
    host.addEventListener('compositionend', function () {
      composing = false;
      ED.schedulePaginate();
    });
    host.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.blk-tools button') : null;
      if (!btn) return;
      var blk = btn.closest('.blk');
      if (!blk) return;
      var act = btn.getAttribute('data-act');
      if (act === 'del') {
        blk.parentNode.removeChild(blk);
      } else if (act === 'up' && blk.previousElementSibling) {
        blk.parentNode.insertBefore(blk, blk.previousElementSibling);
      } else if (act === 'down' && blk.nextElementSibling) {
        blk.parentNode.insertBefore(blk.nextElementSibling, blk);
      }
      changed();
    });
    host.addEventListener('input', changed);
    host.addEventListener('paste', function (e) {
      var body = e.target.closest ? e.target.closest('.blk-body') : null;
      if (!body) return;
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  };

  // CSSOM 会把 #b45309 读成 rgb(180, 83, 9)、把无引号字体名加上引号；
  // 模型统一存 #rrggbb 与裸字体名，导出 OOXML 才不会写进非法值。
  function normColor(v) {
    if (!v) return '';
    var m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/.exec(String(v).trim());
    if (!m) return String(v).charAt(0) === '#' ? v : '';
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return '';
    var out = '#';
    for (var i = 1; i <= 3; i++) {
      var n = parseInt(m[i], 10).toString(16);
      out += n.length < 2 ? '0' + n : n;
    }
    return out;
  }

  // 系统默认字体栈不是可移植的字体名，不能写进模型或 DOCX。
  var SYSTEM_FONTS = {
    '-apple-system': 1, 'blinkmacsystemfont': 1, 'system-ui': 1,
    'sans-serif': 1, 'serif': 1, 'monospace': 1,
    'ui-sans-serif': 1, 'ui-serif': 1, 'ui-monospace': 1
  };

  function normFont(v) {
    if (!v) return '';
    var first = String(v).split(',')[0].replace(/["']/g, '').trim();
    if (!first || SYSTEM_FONTS[first.toLowerCase()]) return '';
    return first;
  }

  function styleOf(el, st) {
    var tag = el.tagName.toLowerCase();
    var out = {
      b: st.b || tag === 'b' || tag === 'strong',
      i: st.i || tag === 'i' || tag === 'em',
      u: st.u || tag === 'u',
      s: st.s || tag === 's' || tag === 'strike' || tag === 'del',
      code: st.code || tag === 'code',
      vert: st.vert || (tag === 'sup' ? 'sup' : tag === 'sub' ? 'sub' : ''),
      link: st.link || '',
      color: st.color || '',
      hl: st.hl || '',
      size: st.size || 0,
      font: st.font || ''
    };
    if (tag === 'a') out.link = el.getAttribute('href') || '';
    var css = el.style;
    if (css) {
      if (css.fontWeight === '700' || css.fontWeight === 'bold') out.b = true;
      if (css.fontStyle === 'italic') out.i = true;
      if (css.textDecoration && css.textDecoration.indexOf('underline') >= 0) out.u = true;
      if (css.textDecoration && css.textDecoration.indexOf('line-through') >= 0) out.s = true;
      if (css.color) out.color = normColor(css.color);
      if (css.backgroundColor && css.backgroundColor !== 'transparent') out.hl = normColor(css.backgroundColor);
      if (css.verticalAlign === 'super' || css.verticalAlign === 'sub') out.vert = css.verticalAlign;
      if (css.fontFamily) out.font = normFont(css.fontFamily);
      if (css.fontSize) {
        var fs = parseFloat(css.fontSize);
        // 有的浏览器把内联 pt 归一成 px；两种写法都要折回半磅。
        if (css.fontSize.indexOf('px') > 0) out.size = Math.round(fs * 1.5);
        else if (css.fontSize.indexOf('pt') > 0) out.size = Math.round(fs * 2);
      }
    }
    // 渲染时把原件字体名存在 data-font；计算样式里的字体栈只是显示层。
    if (el.getAttribute) {
      var df = el.getAttribute('data-font');
      if (df) out.font = df;
    }
    return out;
  }

  function sameStyle(a, b) {
    return a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s &&
      a.code === b.code && a.link === b.link && a.color === b.color &&
      a.hl === b.hl && a.vert === b.vert &&
      a.size === b.size && a.font === b.font;
  }

  // 从 DOM 反向生成 runs：格式来自标签与内联样式，文字来自文本节点。
  function serializeRuns(root) {
    var runs = [];
    var base = { b: false, i: false, u: false, s: false, code: false, link: '', color: '', hl: '', vert: '', size: 0, font: '' };

    function push(text, st) {
      if (!text) return;
      var last = runs[runs.length - 1];
      if (last && sameStyle(last.__st, st)) {
        last.t += text;
        return;
      }
      var r = { t: text };
      if (st.b) r.b = true;
      if (st.i) r.i = true;
      if (st.u) r.u = true;
      if (st.s) r.s = true;
      if (st.code) r.code = true;
      if (st.link) r.link = st.link;
      if (st.color) r.color = st.color;
      if (st.hl) r.hl = st.hl;
      if (st.vert) r.vert = st.vert;
      if (st.size) r.size = st.size;
      if (st.font) r.font = st.font;
      r.__st = st;
      runs.push(r);
    }

    function walk(node, st) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var child = node.childNodes[i];
        if (child.nodeType === 3) {
          push(child.nodeValue, st);
          continue;
        }
        if (child.nodeType !== 1) continue;
        var tag = child.tagName.toLowerCase();
        if (tag === 'br') { push('\n', st); continue; }
        if (tag === 'script' || tag === 'style') continue;
        walk(child, styleOf(child, st));
      }
    }
    walk(root, base);
    for (var j = 0; j < runs.length; j++) delete runs[j].__st;
    return runs;
  }

  ED.collectDoc = function (doc) {
    var host = document.getElementById('docEditor');
    // 自动保存可能抢在分页前面：保存前先把目录条目和页码对齐当前 DOM，
    // 否则模型里会留下「有条目、无页码」的目录。
    if (host.querySelector('.blk-toc')) {
      refreshTocEntries();
      fillTocPages();
    }
    var els = host.querySelectorAll('.blk');
    var blocks = [];
    var groupIndex = {};
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = el.getAttribute('data-type') || 'p';
      var b = { id: el.getAttribute('data-id') || ('b' + (i + 1)), type: type };
      var body = el.querySelector('.blk-body');
      var orig = el.__block || null;
      // 段落级属性跟着块走：对齐、缩进与列表类型都要写回模型。
      var align = el.getAttribute('data-align') || '';
      if (align && align !== 'left') b.align = align;
      var indent = parseInt(el.getAttribute('data-indent') || '0', 10) || 0;
      if (indent > 0) b.indent = Math.min(8, indent);
      if (el.getAttribute('data-ordered') === '1') b.ordered = true;
      // 导入件的 twips 版式没有编辑入口，保存时从原模型带回，避免自动保存抹平。
      if (orig) {
        var metrics = ['indentLeft', 'indentFirst', 'spaceBefore', 'spaceAfter', 'lineHeight'];
        for (var mk = 0; mk < metrics.length; mk++) {
          if (orig[metrics[mk]]) b[metrics[mk]] = orig[metrics[mk]];
        }
        if (orig.lineRule) b.lineRule = orig.lineRule;
      }
      if (type === 'hr' || type === 'pagebreak') {
        blocks.push(b);
        continue;
      }
      if (type === 'toc') {
        // 目录只存层级和条目快照；页码是分页产物，随保存一起落盘，
        // 这样导出的 DOCX / HTML 不必再跑一次排版。
        b.levels = parseInt(el.getAttribute('data-levels') || '3', 10) || 3;
        b.entries = [];
        var nodes = el.querySelectorAll('.toc-entry');
        for (var e = 0; e < nodes.length; e++) {
          var entry = {
            t: nodes[e].getAttribute('data-text') || '',
            lv: parseInt(nodes[e].getAttribute('data-lv'), 10) || 1
          };
          var hid = nodes[e].getAttribute('data-id');
          if (hid) entry.id = hid;
          var pg = parseInt(nodes[e].getAttribute('data-page'), 10);
          if (pg > 0) entry.page = pg;
          b.entries.push(entry);
        }
        blocks.push(b);
        continue;
      }
      if (!body) continue;
      if (type === 'table') {
        var tableEl = body.querySelector('table');
        var rows = [];
        var trs = body.querySelectorAll('tr');
        for (var r = 0; r < trs.length; r++) {
          var tds = trs[r].querySelectorAll('td,th');
          var row = [];
          for (var c = 0; c < tds.length; c++) {
            var td = tds[c];
            var txt = td.textContent;
            var model = td.__model;
            // 没改过的单元格沿用原模型，保住字体、颜色、合并与底纹；
            // 改过文字才按纯文本重建（编辑器的富文本选区是唯一真相）。
            if (model && runsText(model.runs || []) === txt) {
              row.push(model);
              continue;
            }
            var cell = { runs: txt ? [{ t: txt }] : [] };
            var cs = parseInt(td.getAttribute('data-colspan') || '1', 10) || 1;
            var rs = parseInt(td.getAttribute('data-rowspan') || '1', 10) || 1;
            var w = parseInt(td.getAttribute('data-w') || '0', 10) || 0;
            if (cs > 1) cell.colspan = cs;
            if (rs > 1) cell.rowspan = rs;
            if (w > 0) cell.width = w;
            if (td.getAttribute('data-bg')) cell.bg = td.getAttribute('data-bg');
            if (td.getAttribute('data-align')) cell.align = td.getAttribute('data-align');
            if (td.getAttribute('data-valign')) cell.valign = td.getAttribute('data-valign');
            var bd = {};
            var bkeys = { top: 'data-bt', left: 'data-bl', bottom: 'data-bb', right: 'data-br' };
            for (var bk in bkeys) {
              if (!Object.prototype.hasOwnProperty.call(bkeys, bk)) continue;
              var bspec = td.getAttribute(bkeys[bk]);
              if (bspec) bd[bk] = bspec;
            }
            if (bd.top || bd.left || bd.bottom || bd.right) cell.borders = bd;
            var pd = parseInt(td.getAttribute('data-pad') || '0', 10) || 0;
            if (pd > 0) cell.pad = pd;
            row.push(cell);
          }
          rows.push(row);
        }
        b.rows = rows;
        if (tableEl) {
          var widths = (tableEl.getAttribute('data-col-widths') || '').split(',');
          var list = [];
          for (var wi = 0; wi < widths.length; wi++) {
            var n = parseInt(widths[wi], 10);
            if (n > 0) list.push(n);
          }
          if (list.length) b.colWidths = list;
          var tw = parseInt(tableEl.getAttribute('data-table-width') || '0', 10) || 0;
          if (tw > 0) b.tableWidth = tw;
          if (tableEl.getAttribute('data-table-align')) b.tableAlign = tableEl.getAttribute('data-table-align');
          if (tableEl.getAttribute('data-borders')) b.borders = tableEl.getAttribute('data-borders');
          var pad = parseInt(tableEl.getAttribute('data-cell-pad') || '0', 10) || 0;
          if (pad > 0) b.cellPad = pad;
          var hdr = parseInt(tableEl.getAttribute('data-header-rows') || '0', 10) || 0;
          if (hdr > 0) b.headerRows = hdr;
        }
      } else if (type === 'passthrough') {
        // 原样保留，runs 为空。
      } else {
        b.runs = serializeRuns(body);
      }
      // 分页拆出来的后半段按 group 合并回第一段；模型里仍然是一个段落，
      // 这样保存和导出 DOCX 都不会多出段落分隔。
      var group = el.getAttribute('data-cont-group') || '';
      var isTail = el.getAttribute('data-cont') === '1';
      // 跨页重复的表头只是视图投影，合并回原表前要丢掉，否则每次分页都会
      // 往模型里多插一行表头。
      if (isTail && b.type === 'table' && b.headerRows > 0) {
        b.rows = b.rows.slice(Math.min(b.headerRows, b.rows.length));
      }
      if (group && !isTail) groupIndex[group] = blocks.length;
      if (group && isTail && groupIndex[group] != null) {
        var prev = blocks[groupIndex[group]];
        if (prev && prev.type === b.type) {
          if (b.type === 'table') prev.rows = (prev.rows || []).concat(b.rows || []);
          else prev.runs = (prev.runs || []).concat(b.runs || []);
          continue;
        }
      }
      blocks.push(b);
    }
    if (!doc.doc) doc.doc = { blocks: [] };
    doc.doc.blocks = blocks;
  };

  ED.addDocBlock = function (type) {
    var host = docHost();
    if (!host) return;
    var pages = pagesNow();
    if (!pages.length) {
      host.appendChild(createPageEl());
      pages = pagesNow();
    }
    var pageBody = bodyOf(pages[pages.length - 1]);
    if (!pageBody) return;
    var el = makeBlockEl({ id: 'b' + Date.now(), type: type || 'p', runs: [{ t: '' }] });
    pageBody.appendChild(el);
    var body = el.querySelector('.blk-body');
    if (body) body.focus();
    changed();
  };

  ED.newEmptyBlock = function () {
    return makeBlockEl({ id: 'b' + Date.now(), type: 'p', runs: [{ t: '' }] });
  };

  ED.setBlockType = function (type) {
    var blk = ED.currentBlock();
    if (!blk) return;
    blk.setAttribute('data-type', type);
    changed();
  };

  // 选区在点下拉框时会离开正文；这时退回最后一次落在编辑器里的 Range，
  // 否则“段落样式 / 对齐 / 列表”会对空操作。
  ED.currentBlock = function () {
    var host = document.getElementById('docEditor');
    if (!host) return null;
    var node = null;
    var sel = window.getSelection();
    if (sel && sel.anchorNode) {
      var a = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : sel.anchorNode;
      if (host.contains(a)) node = sel.anchorNode;
    }
    if (!node && lastRange) {
      var b = lastRange.startContainer.nodeType === 3 ? lastRange.startContainer.parentNode : lastRange.startContainer;
      if (host.contains(b)) node = lastRange.startContainer;
    }
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentNode;
    return node.closest ? node.closest('.blk') : null;
  };

  // 选区在点工具栏时会丢失；记住编辑器内的最后一个 Range，执行命令前恢复。
  var lastRange = null;
  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var node = sel.anchorNode;
    if (!node) return;
    var host = document.getElementById('docEditor');
    if (host && host.contains(node.nodeType === 3 ? node.parentNode : node)) {
      lastRange = sel.getRangeAt(0).cloneRange();
    }
  });

  /* ---------- 富文本：选区包裹、对齐、缩进、插入 ---------- */

  // 取当前选区，并确认它落在文档编辑器里。工具栏按钮会让焦点离开正文，
  // 所以先用 selectionchange 里记住的 lastRange 复原。
  function selectionInDoc() {
    var sel = window.getSelection();
    if (!sel) return null;
    if ((!sel.rangeCount || sel.isCollapsed) && lastRange) {
      sel.removeAllRanges();
      sel.addRange(lastRange);
    }
    if (!sel.rangeCount) return null;
    var host = docHost();
    var r = sel.getRangeAt(0);
    if (!host || !host.contains(r.commonAncestorContainer)) return null;
    return r;
  }

  // 给选区套一层 span：逐个文本节点包裹，跨节点也不会抛异常。
  ED.applyStyle = function (styles) {
    var range = selectionInDoc();
    if (!range || range.collapsed) return false;
    var host = docHost();
    var nodes = [];
    var walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && range.intersectsNode(n)) nodes.push(n);
    }
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var start = 0, end = node.nodeValue.length;
      if (node === range.startContainer) start = range.startOffset;
      if (node === range.endContainer) end = range.endOffset;
      if (end <= start) continue;
      var mid = node;
      if (start > 0) mid = mid.splitText(start);
      if (end - start < mid.nodeValue.length) mid.splitText(end - start);
      var span = document.createElement('span');
      for (var k in styles) {
        if (styles.hasOwnProperty(k)) span.style[k] = styles[k];
      }
      mid.parentNode.insertBefore(span, mid);
      span.appendChild(mid);
    }
    changed();
    return true;
  };

  ED.setAlign = function (a) {
    var blk = ED.currentBlock();
    if (!blk) return;
    var body = blk.querySelector('.blk-body');
    if (!body) return;
    body.style.textAlign = (a === 'left') ? '' : a;
    blk.setAttribute('data-align', a);
    changed();
  };

  ED.setList = function (ordered) {
    var blk = ED.currentBlock();
    if (!blk) return;
    var isList = blk.getAttribute('data-type') === 'li';
    var isOrdered = blk.getAttribute('data-ordered') === '1';
    if (isList && isOrdered === !!ordered) {
      blk.setAttribute('data-type', 'p');
      blk.removeAttribute('data-ordered');
    } else {
      blk.setAttribute('data-type', 'li');
      if (ordered) blk.setAttribute('data-ordered', '1');
      else blk.removeAttribute('data-ordered');
    }
    changed();
  };

  ED.adjustIndent = function (delta) {
    var blk = ED.currentBlock();
    if (!blk) return;
    var n = parseInt(blk.getAttribute('data-indent') || '0', 10) || 0;
    n = Math.max(0, Math.min(8, n + delta));
    blk.setAttribute('data-indent', String(n));
    var body = blk.querySelector('.blk-body');
    if (body) body.style.marginLeft = n ? (n * 24) + 'px' : '';
    changed();
  };

  ED.clearFormat = function () {
    var range = selectionInDoc();
    if (!range || range.collapsed) return;
    document.execCommand('removeFormat', false, null);
    var host = docHost();
    var nodes = [];
    var walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && range.intersectsNode(n)) nodes.push(n);
    }
    // removeFormat 不清背景色、上下标和字号，补一遍。
    for (var i = 0; i < nodes.length; i++) {
      var p = nodes[i].parentNode;
      while (p && p !== host && p.style) {
        p.style.backgroundColor = '';
        p.style.color = '';
        p.style.verticalAlign = '';
        p.style.fontSize = '';
        p.style.fontFamily = '';
        p = p.parentNode;
      }
    }
    changed();
  };

  ED.insertTable = function (n) {
    var host = docHost();
    if (!host) return;
    n = Math.max(1, Math.min(10, n || 3));
    var rows = [];
    for (var i = 0; i < n; i++) {
      var row = [];
      for (var j = 0; j < n; j++) row.push({ runs: [] });
      rows.push(row);
    }
    var el = makeBlockEl({ id: 't' + Date.now(), type: 'table', rows: rows });
    var cur = ED.currentBlock();
    var parent = cur ? cur.parentNode : null;
    if (parent && parent.classList && parent.classList.contains('doc-body')) {
      parent.insertBefore(el, cur.nextSibling);
    } else {
      var pages = pagesNow();
      var pageBody = pages.length ? bodyOf(pages[pages.length - 1]) : null;
      if (pageBody) pageBody.appendChild(el);
      else host.appendChild(el);
    }
    changed();
  };

  ED.insertSimpleBlock = function (type, text) {
    var host = docHost();
    if (!host) return;
    var el = makeBlockEl({ id: type + Date.now(), type: type, runs: text ? [{ t: text }] : [] });
    var cur = ED.currentBlock();
    var parent = cur ? cur.parentNode : null;
    if (parent && parent.classList && parent.classList.contains('doc-body')) {
      parent.insertBefore(el, cur.nextSibling);
    } else {
      var pages = pagesNow();
      var pageBody = pages.length ? bodyOf(pages[pages.length - 1]) : null;
      if (pageBody) pageBody.appendChild(el);
      else host.appendChild(el);
    }
    changed();
  };

  // 插入目录块：位置跟随光标，条目在下一轮分页时生成，页码紧接着回填。
  ED.insertToc = function (levels) {
    var host = docHost();
    if (!host) return;
    var el = makeBlockEl({ id: 'toc' + Date.now(), type: 'toc', levels: levels || 3, entries: [] });
    var cur = ED.currentBlock();
    var parent = cur ? cur.parentNode : null;
    if (parent && parent.classList && parent.classList.contains('doc-body')) {
      parent.insertBefore(el, cur.nextSibling);
    } else {
      var pages = pagesNow();
      var pageBody = pages.length ? bodyOf(pages[0]) : null;
      // 没有光标时放到文档最前：目录通常就是第一页的内容。
      if (pageBody) pageBody.insertBefore(el, pageBody.firstChild);
      else host.appendChild(el);
    }
    changed();
    ED.paginate(currentDoc());
  };

  // F9 / 菜单「更新目录」：重算条目与页码。分页器每次都会做，这里只是显式入口。
  ED.updateToc = function () {
    var d = currentDoc();
    if (d) ED.paginate(d);
  };

  ED.insertLink = function (href) {
    if (!href) return;
    var range = selectionInDoc();
    if (!range || range.collapsed) {
      document.execCommand('insertHTML', false, '<a href="' + escAttr(href) + '">' + escapeHTML(href) + '</a>');
    } else {
      document.execCommand('createLink', false, href);
    }
    changed();
  };

  var ART_PRESETS = {
    gold: { fontFamily: 'Kaiti SC', fontSize: '26pt', color: '#b45309', fontWeight: '700' },
    blue: { fontFamily: 'Microsoft YaHei', fontSize: '24pt', color: '#1d4ed8', fontWeight: '700' },
    red: { fontFamily: 'Heiti SC', fontSize: '26pt', color: '#b91c1c', fontWeight: '700' },
    soft: { fontFamily: 'Songti SC', fontSize: '22pt', color: '#57534e', backgroundColor: '#fdf0dd' }
  };

  ED.applyArt = function (name) {
    var p = ART_PRESETS[name];
    return p ? ED.applyStyle(p) : false;
  };

  // 格式刷：记下光标处的实际样式，下一次选区内应用一次。
  var paintedFormat = null;

  function formatAtCaret() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var node = sel.anchorNode;
    if (!node) return null;
    var el = node.nodeType === 3 ? node.parentNode : node;
    if (!el || !el.nodeType) return null;
    var cs = window.getComputedStyle(el);
    var td = cs.textDecorationLine || cs.textDecoration || '';
    return {
      bold: parseInt(cs.fontWeight, 10) >= 600,
      italic: cs.fontStyle === 'italic',
      underline: td.indexOf('underline') >= 0,
      strike: td.indexOf('line-through') >= 0,
      color: cs.color,
      hl: cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? '' : cs.backgroundColor,
      font: String(cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(),
      size: Math.round(parseFloat(cs.fontSize) * 0.75)
    };
  }

  // 工具栏回显用：光标处的实际样式（只读）。
  ED.caretStyle = function () { return formatAtCaret(); };

  ED.pickFormat = function () {
    paintedFormat = formatAtCaret();
    return !!paintedFormat;
  };

  ED.hasPaintedFormat = function () { return !!paintedFormat; };

  ED.paintFormat = function () {
    if (!paintedFormat) return false;
    var f = paintedFormat;
    var sel = window.getSelection();
    if (lastRange && sel) {
      sel.removeAllRanges();
      sel.addRange(lastRange);
    }
    // execCommand 是切换语义，先看当前状态，只在需要时切换，避免把已加粗的文字取消掉。
    var wanted = [['bold', f.bold], ['italic', f.italic], ['underline', f.underline], ['strikeThrough', f.strike]];
    for (var i = 0; i < wanted.length; i++) {
      var on = false;
      try { on = document.queryCommandState(wanted[i][0]); } catch (e) { on = false; }
      if (on !== !!wanted[i][1]) document.execCommand(wanted[i][0], false, null);
    }
    ED.applyStyle({
      color: f.color,
      backgroundColor: f.hl || '',
      fontFamily: f.font || '',
      fontSize: f.size ? f.size + 'pt' : ''
    });
    paintedFormat = null;
    return true;
  };

  ED.exec = function (cmd) {
    var sel = window.getSelection();
    if (lastRange && sel) {
      sel.removeAllRanges();
      sel.addRange(lastRange);
    } else {
      var blk = ED.currentBlock();
      if (blk) {
        var body = blk.querySelector('.blk-body');
        if (body) body.focus();
      }
    }
    document.execCommand(cmd, false, null);
    changed();
  };

  /* ==================== 表格 ==================== */

  var sheetState = { id: '', rows: 40, cols: 12, active: 'A1', cache: null };

  function colName(n) {
    var s = '';
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function colIndex(name) {
    var n = 0;
    for (var i = 0; i < name.length; i++) n = n * 26 + (name.charCodeAt(i) - 64);
    return n;
  }

  function refParts(ref) {
    var m = /^([A-Z]{1,3})([0-9]{1,7})$/.exec(ref);
    if (!m) return null;
    return { col: colIndex(m[1]), row: parseInt(m[2], 10), colName: m[1] };
  }

  function sheetByName(doc, name) {
    var sheets = (doc.sheet && doc.sheet.sheets) || [];
    for (var i = 0; i < sheets.length; i++) {
      if (!name || sheets[i].name === name || String(i + 1) === name) return sheets[i];
    }
    return sheets[0];
  }

  function cellRaw(doc, sheet, ref) {
    if (!sheet || !sheet.cells) return null;
    return sheet.cells[ref] || null;
  }

  function evalCell(doc, sheet, ref, depth) {
    if (depth > 30) return '#REF!';
    var cell = cellRaw(doc, sheet, ref);
    if (!cell) return '';
    if (cell.f) {
      var res = Formula.evaluate(cell.f, makeCtx(doc, sheet, depth + 1));
      return res.error ? res.error : res.value;
    }
    if (cell.t === 'b') return cell.v === '1' || cell.v === 'true';
    return cell.v;
  }

  function makeCtx(doc, sheet, depth) {
    return {
      cell: function (sheetName, ref) {
        var sh = sheetName ? sheetByName(doc, sheetName) : sheet;
        return evalCell(doc, sh, ref, depth);
      },
      range: function (sheetName, a, b) {
        var sh = sheetName ? sheetByName(doc, sheetName) : sheet;
        var pa = refParts(a.col + a.row);
        var pb = refParts(b.col + b.row);
        if (!pa || !pb) return '#REF!';
        var out = [];
        var r1 = Math.min(pa.row, pb.row), r2 = Math.max(pa.row, pb.row);
        var c1 = Math.min(pa.col, pb.col), c2 = Math.max(pa.col, pb.col);
        if ((r2 - r1 + 1) * (c2 - c1 + 1) > 20000) return '#REF!';
        for (var r = r1; r <= r2; r++) {
          for (var c = c1; c <= c2; c++) out.push(evalCell(doc, sh, colName(c) + r, depth));
        }
        return out;
      }
    };
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  // 数字格式只影响显示；模型里始终保留原始值，编辑时会切回原值。
  function applyFmt(v, fmt) {
    if (!fmt || v === '' || v === null || v === undefined) return v;
    var n = parseFloat(String(v).replace(/[¥,\s]/g, ''));
    if (fmt === '0.00') return isNaN(n) ? v : n.toFixed(2);
    if (fmt === '0%') return isNaN(n) ? v : (Math.round(n * 1000) / 10) + '%';
    if (fmt === '¥#,##0.00') {
      return isNaN(n) ? v : '¥' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    if (fmt === 'yyyy-mm-dd') {
      var d = new Date(v);
      if (isNaN(d.getTime())) return v;
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    return v;
  }

  function cellDisplay(doc, sheet, ref) {
    var raw = cellRaw(doc, sheet, ref);
    if (!raw) return '';
    var fmt = raw.s && raw.s.fmt;
    if (raw.f) {
      var res = Formula.evaluate(raw.f, makeCtx(doc, sheet, 0));
      return applyFmt(res.display, fmt);
    }
    return applyFmt(raw.v || '', fmt);
  }

  function parseRangeRef(ref) {
    var parts = String(ref || '').split(':');
    var a = refParts(parts[0]);
    var b = refParts(parts[1] || parts[0]);
    if (!a || !b) return null;
    return {
      r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col),
      r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col)
    };
  }

  function rangeRefOf(r) {
    var a = colName(r.c1) + r.r1;
    var b = colName(r.c2) + r.r2;
    return a === b ? a : a + ':' + b;
  }

  function sheetRange() {
    var base = refParts(sheetState.active) || { row: 1, col: 1 };
    var r = sheetState.range;
    if (!r) r = { r1: base.row, c1: base.col, r2: base.row, c2: base.col };
    return r;
  }

  // 合并区域在渲染时折叠成一个带 colspan/rowspan 的单元格，其余格子跳过。
  function mergeSpans(sheet) {
    var span = {}, covered = {};
    (sheet.merges || []).forEach(function (m) {
      var r = parseRangeRef(m);
      if (!r) return;
      span[colName(r.c1) + r.r1] = { cols: r.c2 - r.c1 + 1, rows: r.r2 - r.r1 + 1 };
      for (var rr = r.r1; rr <= r.r2; rr++) {
        for (var cc = r.c1; cc <= r.c2; cc++) {
          if (rr !== r.r1 || cc !== r.c1) covered[colName(cc) + rr] = true;
        }
      }
    });
    return { span: span, covered: covered };
  }

  function cellCss(st) {
    var out = '';
    if (!st) return out;
    if (st.b) out += 'font-weight:700;';
    if (st.i) out += 'font-style:italic;';
    if (st.u) out += 'text-decoration:underline;';
    if (st.bg) out += 'background:' + st.bg + ';';
    if (st.color) out += 'color:' + st.color + ';';
    if (st.align) out += 'text-align:' + st.align + ';';
    if (st.valign) out += 'vertical-align:' + st.valign + ';';
    if (st.font) out += 'font-family:' + st.font + ';';
    if (st.size) out += 'font-size:' + st.size + 'px;';
    if (st.border === 'thin') out += 'box-shadow:inset 0 0 0 1px #9A9A9A;';
    if (st.border === 'medium') out += 'box-shadow:inset 0 0 0 2px #57534E;';
    return out;
  }

  ED.renderSheet = function (doc, host) {
    var sheet = sheetByName(doc, null);
    if (!sheet) return;
    if (sheetState.id !== doc.id) {
      sheetState = { id: doc.id, rows: 40, cols: 12, active: 'A1', cache: null, range: null, anchor: null, dragging: false };
    }
    sheetState.rows = Math.min(Math.max(sheetState.rows, 24), sheet.rows);
    sheetState.cols = Math.min(Math.max(sheetState.cols, 8), sheet.cols);
    var spans = mergeSpans(sheet);
    var sel = sheetRange();
    var freeze = Math.min(sheet.freezeRows || 0, sheetState.rows);

    var html = '<thead><tr><th class="corner"></th>';
    for (var c = 1; c <= sheetState.cols; c++) html += '<th>' + colName(c) + '</th>';
    html += '</tr></thead><tbody>';
    for (var r = 1; r <= sheetState.rows; r++) {
      html += '<tr><td class="rowhead">' + r + '</td>';
      for (var cc = 1; cc <= sheetState.cols; cc++) {
        var ref = colName(cc) + r;
        if (spans.covered[ref]) continue;
        var raw = cellRaw(doc, sheet, ref);
        var cls = 'cell';
        var val = cellDisplay(doc, sheet, ref);
        if (raw && raw.s) {
          if (raw.s.b) cls += ' bold';
          if (raw.s.align === 'center') cls += ' center';
          if (raw.s.align === 'right') cls += ' num';
        }
        if (val !== '' && /^-?[0-9.]+$/.test(val)) cls += ' num';
        if (r >= sel.r1 && r <= sel.r2 && cc >= sel.c1 && cc <= sel.c2) cls += ' sel';
        var style = cellCss(raw && raw.s);
        // 冻结行用 sticky 定位：行高固定 27px，表头也占 27px。
        if (r <= freeze) style += 'position:sticky;top:' + (r * 27) + 'px;z-index:2;background:#FBFAF7;';
        var span = spans.span[ref];
        var attrs = '';
        if (span && span.cols > 1) attrs += ' colspan="' + span.cols + '"';
        if (span && span.rows > 1) attrs += ' rowspan="' + span.rows + '"';
        html += '<td class="' + cls + '" data-ref="' + ref + '" role="gridcell" aria-label="单元格 ' + ref + '"' +
          attrs + ' contenteditable="true" style="' + escAttr(style) + '">' + escapeHTML(val) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody>';
    host.innerHTML = html;
    host.setAttribute('data-cols', sheetState.cols);
    host.setAttribute('data-rows', sheetState.rows);
    ED.updateCellRef(sheetState.active);
  };

  ED.bindSheet = function (doc, host) {
    if (host.__bound) return;
    host.__bound = true;

    function paintRange() {
      var table = document.getElementById('sheetTable');
      if (!table) return;
      var r = sheetRange();
      var tds = table.querySelectorAll('td.cell');
      for (var i = 0; i < tds.length; i++) {
        var p = refParts(tds[i].getAttribute('data-ref'));
        if (!p) continue;
        tds[i].classList.toggle('sel', p.row >= r.r1 && p.row <= r.r2 && p.col >= r.c1 && p.col <= r.c2);
      }
      ED.updateCellRef(sheetState.active);
    }

    // 拖选区域：按下一个格子定锚点，划过的格子实时扩展，松开即定稿。
    host.addEventListener('mousedown', function (e) {
      var td = e.target.closest ? e.target.closest('td.cell') : null;
      if (!td) return;
      var p = refParts(td.getAttribute('data-ref'));
      if (!p) return;
      sheetState.anchor = p;
      sheetState.dragging = true;
      sheetState.range = { r1: p.row, c1: p.col, r2: p.row, c2: p.col };
      paintRange();
    });

    host.addEventListener('mouseover', function (e) {
      if (!sheetState.dragging || !sheetState.anchor) return;
      var td = e.target.closest ? e.target.closest('td.cell') : null;
      if (!td) return;
      var p = refParts(td.getAttribute('data-ref'));
      if (!p) return;
      sheetState.range = {
        r1: Math.min(sheetState.anchor.row, p.row), c1: Math.min(sheetState.anchor.col, p.col),
        r2: Math.max(sheetState.anchor.row, p.row), c2: Math.max(sheetState.anchor.col, p.col)
      };
      paintRange();
    });

    document.addEventListener('mouseup', function () {
      if (!sheetState.dragging) return;
      sheetState.dragging = false;
      ED.updateCellRef(sheetState.active);
    });

    host.addEventListener('focusin', function (e) {
      var td = e.target.closest ? e.target.closest('td.cell') : null;
      if (!td) return;
      var ref = td.getAttribute('data-ref');
      sheetState.active = ref;
      if (!sheetState.dragging) {
        var p = refParts(ref);
        sheetState.range = p ? { r1: p.row, c1: p.col, r2: p.row, c2: p.col } : null;
      }
      ED.updateCellRef(ref);
      var sheet = sheetByName(doc, null);
      var raw = cellRaw(doc, sheet, ref);
      // 进入编辑态时切回原值：公式显示公式原文，带格式的数字显示未格式化的数。
      if (raw && raw.f) td.textContent = '=' + raw.f;
      else if (raw && raw.s && raw.s.fmt) td.textContent = raw.v || '';
      setTimeout(function () {
        if (document.activeElement !== td) return;
        var range = document.createRange();
        range.selectNodeContents(td);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }, 0);
    });

    host.addEventListener('input', function (e) {
      var td = e.target.closest ? e.target.closest('td.cell') : null;
      if (!td) return;
      var fi = document.getElementById('formulaInput');
      if (fi && document.activeElement === td) fi.value = td.textContent;
      changed();
    });

    host.addEventListener('blur', function (e) {
      var td = e.target.closest ? e.target.closest('td.cell') : null;
      if (!td) return;
      ED.commitCell(doc, td);
    }, true);

    host.addEventListener('keydown', function (e) {
      var td = e.target.closest ? e.target.closest('td.cell') : null;
      if (!td) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        ED.commitCell(doc, td);
        var p = refParts(td.getAttribute('data-ref'));
        if (p && p.row < sheetState.rows) {
          var next = host.querySelector('td[data-ref="' + colName(p.col) + (p.row + 1) + '"]');
          if (next) next.focus();
        }
      } else if (e.key === 'Escape') {
        td.blur();
      }
    });
  };

  ED.updateCellRef = function (ref) {
    var e = document.getElementById('cellRef');
    if (e) {
      var r = sheetRange();
      e.textContent = (r.r1 !== r.r2 || r.c1 !== r.c2) ? rangeRefOf(r) : (ref || sheetState.active);
    }
    var fi = document.getElementById('formulaInput');
    if (fi) {
      var doc = global.__edDoc;
      if (!doc) return;
      var sheet = sheetByName(doc, null);
      var raw = cellRaw(doc, sheet, ref);
      fi.value = raw ? (raw.f ? '=' + raw.f : (raw.v || '')) : '';
    }
  };

  ED.commitCell = function (doc, td) {
    var ref = td.getAttribute('data-ref');
    if (!ref) return;
    var sheet = sheetByName(doc, null);
    if (!sheet) return;
    if (!sheet.cells) sheet.cells = {};
    var text = td.textContent;
    if (text === '') {
      delete sheet.cells[ref];
    } else {
      var cell = sheet.cells[ref] || { v: '' };
      if (text.charAt(0) === '=') {
        cell.f = text.slice(1);
        cell.v = '';
        cell.t = 'n';
      } else {
        cell.f = '';
        cell.v = text;
        cell.t = isNumeric(text) ? 'n' : 's';
      }
      cell.raw = '';
      sheet.cells[ref] = cell;
    }
    td.textContent = cellDisplay(doc, sheet, ref);
    ED.refreshSheetValues(doc);
    changed();
  };

  // 保存前把正在编辑的单元格落进模型，避免最后一次输入随光标丢失。
  ED.flushSheet = function (doc) {
    var td = document.activeElement;
    if (td && td.classList && td.classList.contains('cell')) {
      ED.commitCell(doc, td);
    }
  };

  function isNumeric(s) {
    return /^-?[0-9]+(\.[0-9]+)?$/.test(String(s).trim());
  }

  ED.refreshSheetValues = function (doc) {
    var table = document.getElementById('sheetTable');
    if (!table) return;
    var sheet = sheetByName(doc, null);
    var tds = table.querySelectorAll('td.cell');
    for (var i = 0; i < tds.length; i++) {
      var td = tds[i];
      if (document.activeElement === td) continue;
      var ref = td.getAttribute('data-ref');
      td.textContent = cellDisplay(doc, sheet, ref);
    }
  };

  ED.activeCell = function () { return sheetState.active; };

  ED.commitFormula = function (doc, ref, text) {
    var td = document.querySelector('#sheetTable td[data-ref="' + ref + '"]');
    if (!td) return;
    td.textContent = text;
    ED.commitCell(doc, td);
  };

  // 选区内的每个格子都套同一套样式；只有样式没有内容的格子也要落模型，
  // 否则边框和底色在保存后会消失。
  ED.applySheetStyle = function (doc, fn) {
    var sheet = sheetByName(doc, null);
    if (!sheet) return;
    if (!sheet.cells) sheet.cells = {};
    var r = sheetRange();
    for (var row = r.r1; row <= r.r2; row++) {
      for (var col = r.c1; col <= r.c2; col++) {
        var ref = colName(col) + row;
        var cell = sheet.cells[ref] || { v: '', t: 's' };
        cell.s = cell.s || {};
        fn(cell.s);
        if (!cell.s.b && !cell.s.i && !cell.s.u && !cell.s.bg && !cell.s.color &&
            !cell.s.align && !cell.s.valign && !cell.s.font && !cell.s.size &&
            !cell.s.border && !cell.s.fmt) {
          delete cell.s;
          if (!cell.v && !cell.f) { delete sheet.cells[ref]; continue; }
        }
        sheet.cells[ref] = cell;
      }
    }
    ED.renderSheet(doc, document.getElementById('sheetTable'));
    changed();
  };

  ED.expandSheet = function (doc, rows, cols) {
    var sheet = sheetByName(doc, null);
    if (!sheet) return;
    if (rows) { sheet.rows = Math.min(5000, sheet.rows + rows); sheetState.rows = Math.min(sheet.rows, sheetState.rows + rows); }
    if (cols) { sheet.cols = Math.min(200, sheet.cols + cols); sheetState.cols = Math.min(sheet.cols, sheetState.cols + cols); }
    ED.renderSheet(doc, document.getElementById('sheetTable'));
    changed();
  };

  ED.rangeNow = function () { return sheetRange(); };

  ED.activeCellStyle = function () {
    var doc = global.__edDoc;
    var sheet = sheetByName(doc, null);
    var cell = cellRaw(doc, sheet, sheetState.active);
    return (cell && cell.s) || {};
  };
  ED.rangeLabel = function () { return rangeRefOf(sheetRange()); };

  // 合并 / 取消合并：同一区域再按一次就拆开。
  ED.mergeCells = function (doc) {
    var sheet = sheetByName(doc, null);
    if (!sheet) return false;
    var r = sheetRange();
    if (r.r1 === r.r2 && r.c1 === r.c2) return false;
    var target = rangeRefOf(r);
    sheet.merges = sheet.merges || [];
    var at = sheet.merges.indexOf(target);
    if (at >= 0) {
      sheet.merges.splice(at, 1);
    } else {
      sheet.merges = sheet.merges.filter(function (m) {
        var q = parseRangeRef(m);
        if (!q) return false;
        return q.r2 < r.r1 || q.r1 > r.r2 || q.c2 < r.c1 || q.c1 > r.c2;
      });
      sheet.merges.push(target);
    }
    ED.renderSheet(doc, document.getElementById('sheetTable'));
    changed();
    return true;
  };

  // 行 / 列结构调整：整体搬移引用键，公式里的引用保持原样。
  // 合并区域跨过插入点时不再安全，统一解除，避免留下坏范围。
  function shiftSheetCells(sheet, fn) {
    var next = {};
    Object.keys(sheet.cells).forEach(function (ref) {
      var p = refParts(ref);
      if (!p) return;
      var q = fn(p);
      if (!q) return;
      next[colName(q.col) + q.row] = sheet.cells[ref];
    });
    sheet.cells = next;
  }

  ED.sheetOp = function (doc, op) {
    var sheet = sheetByName(doc, null);
    if (!sheet || !sheet.cells) return;
    var r = sheetRange();
    var row = r.r2;
    var col = r.c2;
    if (op === 'insert-row') {
      shiftSheetCells(sheet, function (p) { return { col: p.col, row: p.row >= row ? p.row + 1 : p.row }; });
      sheet.rows = Math.min(5000, sheet.rows + 1);
    } else if (op === 'delete-row') {
      shiftSheetCells(sheet, function (p) {
        if (p.row === row) return null;
        return { col: p.col, row: p.row > row ? p.row - 1 : p.row };
      });
      sheet.rows = Math.max(1, sheet.rows - 1);
    } else if (op === 'insert-col') {
      shiftSheetCells(sheet, function (p) { return { col: p.col >= col ? p.col + 1 : p.col, row: p.row }; });
      sheet.cols = Math.min(200, sheet.cols + 1);
    } else if (op === 'delete-col') {
      shiftSheetCells(sheet, function (p) {
        if (p.col === col) return null;
        return { col: p.col > col ? p.col - 1 : p.col, row: p.row };
      });
      sheet.cols = Math.max(1, sheet.cols - 1);
    }
    sheet.merges = [];
    sheetState.range = { r1: row, c1: col, r2: row, c2: col };
    sheetState.active = colName(col) + row;
    ED.renderSheet(doc, document.getElementById('sheetTable'));
    changed();
  };

  ED.toggleFreeze = function (doc) {
    var sheet = sheetByName(doc, null);
    if (!sheet) return;
    var r = sheetRange();
    sheet.freezeRows = sheet.freezeRows ? 0 : Math.max(1, r.r1 - 1);
    ED.renderSheet(doc, document.getElementById('sheetTable'));
    changed();
  };

  // Σ：选中区域就求整块的和，放在区域下方；只选一格时向上找连续数字。
  ED.autoSum = function (doc) {
    var sheet = sheetByName(doc, null);
    if (!sheet) return false;
    var r = sheetRange();
    var col = colName(r.c1);
    var formula, target;
    if (r.r1 !== r.r2 || r.c1 !== r.c2) {
      formula = 'SUM(' + colName(r.c1) + r.r1 + ':' + colName(r.c2) + r.r2 + ')';
      target = col + (r.r2 + 1);
    } else {
      var top = r.r1;
      while (top > 1) {
        var prev = cellRaw(doc, sheet, col + (top - 1));
        if (!prev || !isNumeric(evalCell(doc, sheet, col + (top - 1), 0))) break;
        top--;
      }
      if (top === r.r1) return false;
      formula = 'SUM(' + col + top + ':' + col + (r.r1 - 1) + ')';
      target = col + r.r1;
    }
    sheet.cells[target] = { v: '', f: formula, t: 'n' };
    sheetState.active = target;
    sheetState.range = null;
    ED.renderSheet(doc, document.getElementById('sheetTable'));
    changed();
    return true;
  };

  // 排序：按选区第一列排序整行，数字优先、空值垫底。
  // 公式随单元格一起搬走，公式里的引用保持字面值。
  ED.sortRange = function (doc, asc) {
    var sheet = sheetByName(doc, null);
    if (!sheet) return false;
    var r = sheetRange();
    if (r.r1 === r.r2) return false;
    var keyCol = r.c1;
    var rows = [];
    for (var row = r.r1; row <= r.r2; row++) {
      var cells = {};
      for (var col = r.c1; col <= r.c2; col++) {
        var ref = colName(col) + row;
        if (sheet.cells[ref]) cells[col] = sheet.cells[ref];
      }
      var key = cellDisplay(doc, sheet, colName(keyCol) + row);
      rows.push({ cells: cells, key: key, num: isNumeric(key) ? parseFloat(key) : null });
    }
    rows.sort(function (a, b) {
      if (a.num !== null && b.num !== null) return asc ? a.num - b.num : b.num - a.num;
      if (a.num !== null) return -1;
      if (b.num !== null) return 1;
      var x = String(a.key), y = String(b.key);
      if (x === y) return 0;
      if (!x) return 1;
      if (!y) return -1;
      return asc ? (x < y ? -1 : 1) : (x < y ? 1 : -1);
    });
    for (var i = 0; i < rows.length; i++) {
      for (var c2 = r.c1; c2 <= r.c2; c2++) delete sheet.cells[colName(c2) + (r.r1 + i)];
      for (var c3 in rows[i].cells) {
        if (!rows[i].cells.hasOwnProperty(c3)) continue;
        sheet.cells[colName(parseInt(c3, 10)) + (r.r1 + i)] = rows[i].cells[c3];
      }
    }
    ED.renderSheet(doc, document.getElementById('sheetTable'));
    changed();
    return true;
  };

  ED.collectSheet = function (doc) { /* 单元格已即时写入模型 */ };

  /* ==================== 演示 ==================== */

  var slideState = { index: 0, selected: null, dragging: null, scale: 1 };

  function slideOf(doc) {
    var slides = (doc.deck && doc.deck.slides) || [];
    if (slideState.index >= slides.length) slideState.index = slides.length - 1;
    if (slideState.index < 0) slideState.index = 0;
    return slides[slideState.index];
  }

  ED.renderSlides = function (doc, stage, canvas) {
    var slide = slideOf(doc);
    if (!slide) { canvas.innerHTML = ''; return; }
    canvas.style.background = slide.bg || '#ffffff';
    canvas.innerHTML = '';
    var els = slide.elements || [];
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      var div = document.createElement('div');
      div.className = 'el' + (slideState.selected === e.id ? ' selected' : '') + (e.bullet ? ' bullet' : '');
      div.setAttribute('data-id', e.id);
      div.style.left = e.x + 'px';
      div.style.top = e.y + 'px';
      div.style.width = e.w + 'px';
      div.style.height = e.h + 'px';
      if (e.size) div.style.fontSize = e.size + 'px';
      if (e.bold) div.style.fontWeight = '700';
      if (e.italic) div.style.fontStyle = 'italic';
      if (e.underline) div.style.textDecoration = 'underline';
      if (e.color) div.style.color = e.color;
      if (e.fill) div.style.background = e.fill;
      if (e.align) div.style.textAlign = e.align;
      if (e.font) div.style.fontFamily = e.font;
      var txt = document.createElement('div');
      txt.className = 'el-text';
      txt.setAttribute('contenteditable', 'true');
      // 项目符号只在编辑态显示为前缀；模型里存的是干净文本，导出走 buChar。
      txt.textContent = e.bullet ? bulletize(e.text) : (e.text || '');
      div.appendChild(txt);
      canvas.appendChild(div);
    }
    fitSlide(stage, canvas);
    var count = document.getElementById('slideCount');
    if (count) count.textContent = (slideState.index + 1) + ' / ' + ((doc.deck && doc.deck.slides.length) || 1);
  };

  function fitSlide(stage, canvas) {
    var avail = Math.max(320, stage.clientWidth - 52);
    var scale = Math.min(1, avail / 1280);
    slideState.scale = scale;
    canvas.style.transform = 'scale(' + scale + ')';
    stage.style.minHeight = (720 * scale + 52) + 'px';
  }

  ED.bindSlides = function (doc, stage, canvas) {
    if (canvas.__bound) return;
    canvas.__bound = true;

    canvas.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('.el') : null;
      if (!el) return;
      slideState.selected = el.getAttribute('data-id');
      var all = canvas.querySelectorAll('.el');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('selected');
      el.classList.add('selected');
      ED.updateElemToolbar(doc);
    });

    canvas.addEventListener('input', function () { changed(); });

    canvas.addEventListener('mousedown', function (e) {
      var el = e.target.closest ? e.target.closest('.el') : null;
      if (!el) return;
      var startX = e.clientX, startY = e.clientY;
      var left = parseFloat(el.style.left) || 0, top = parseFloat(el.style.top) || 0;
      var moved = false;
      function move(ev) {
        var dx = (ev.clientX - startX) / slideState.scale;
        var dy = (ev.clientY - startY) / slideState.scale;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        moved = true;
        el.style.left = Math.round(left + dx) + 'px';
        el.style.top = Math.round(top + dy) + 'px';
        canvas.classList.add('dragging');
      }
      function up() {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        canvas.classList.remove('dragging');
        if (moved) {
          var el2 = elementById(doc, el.getAttribute('data-id'));
          if (el2) {
            el2.x = parseFloat(el.style.left) || 0;
            el2.y = parseFloat(el.style.top) || 0;
          }
          changed();
        }
      }
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  };

  function elementById(doc, id) {
    var slide = slideOf(doc);
    if (!slide) return null;
    for (var i = 0; i < slide.elements.length; i++) if (slide.elements[i].id === id) return slide.elements[i];
    return null;
  }

  ED.updateElemToolbar = function (doc) {
    var e = elementById(doc, slideState.selected);
    if (!e) return;
    var size = document.getElementById('elemSize');
    if (size) size.value = e.size || 32;
  };

  ED.collectSlides = function (doc) {
    var canvas = document.getElementById('slideCanvas');
    if (!canvas) return;
    var slide = slideOf(doc);
    if (!slide) return;
    var els = canvas.querySelectorAll('.el');
    var next = [];
    for (var i = 0; i < els.length; i++) {
      var div = els[i];
      var id = div.getAttribute('data-id');
      var old = elementById(doc, id) || { id: id, type: 'text' };
      var txt = div.querySelector('.el-text');
      old.text = txt ? (div.classList.contains('bullet') ? debullet(txt.textContent) : txt.textContent) : '';
      old.x = parseFloat(div.style.left) || 0;
      old.y = parseFloat(div.style.top) || 0;
      old.w = parseFloat(div.style.width) || 400;
      old.h = parseFloat(div.style.height) || 100;
      // 画布元素按 px 存、按 px 画，这里保持同一单位。
      old.size = parseFloat(div.style.fontSize) || old.size || 32;
      old.bold = div.style.fontWeight === '700';
      old.italic = div.style.fontStyle === 'italic';
      old.underline = (div.style.textDecoration || '').indexOf('underline') >= 0;
      // 浏览器把颜色统一读成 rgb()；OOXML 只接受 #rrggbb，落模型前先归一化。
      old.color = normColor(div.style.color) || old.color || '';
      old.align = div.style.textAlign || old.align || 'left';
      old.fill = normColor(div.style.backgroundColor) || old.fill || '';
      var fam = normFont(div.style.fontFamily);
      if (fam) old.font = fam;
      old.bullet = div.classList.contains('bullet');
      next.push(old);
    }
    slide.elements = next;
  };

  function bulletize(t) {
    return String(t || '').split('\n').map(function (line) { return '• ' + line; }).join('\n');
  }

  function debullet(t) {
    return String(t || '').split('\n').map(function (line) { return line.replace(/^•\s?/, ''); }).join('\n');
  }

  ED.duplicateElement = function (doc) {
    var slide = slideOf(doc);
    if (!slide || !slideState.selected) return;
    var src = elementById(doc, slideState.selected);
    if (!src) return;
    var copy = JSON.parse(JSON.stringify(src));
    copy.id = 'e' + Date.now();
    copy.x = Math.min(1280 - 40, copy.x + 26);
    copy.y = Math.min(720 - 40, copy.y + 26);
    delete copy.anchor;
    delete copy.hash;
    slide.elements.push(copy);
    slideState.selected = copy.id;
    ED.renderSlides(doc, document.getElementById('slideStage'), document.getElementById('slideCanvas'));
    changed();
  };

  // 数组顺序就是层叠顺序：往后挪是上移，往前挪是下移。
  ED.moveElement = function (doc, dir) {
    var slide = slideOf(doc);
    if (!slide || !slideState.selected) return;
    var i = -1;
    for (var k = 0; k < slide.elements.length; k++) {
      if (slide.elements[k].id === slideState.selected) { i = k; break; }
    }
    if (i < 0) return;
    var j = i + dir;
    if (j < 0 || j >= slide.elements.length) return;
    var tmp = slide.elements[i];
    slide.elements[i] = slide.elements[j];
    slide.elements[j] = tmp;
    ED.renderSlides(doc, document.getElementById('slideStage'), document.getElementById('slideCanvas'));
    changed();
  };

  ED.addTextElement = function (doc) {
    var slide = slideOf(doc);
    if (!slide) return;
    slide.elements = slide.elements || [];
    var id = 'e' + Date.now();
    slide.elements.push({ id: id, type: 'text', text: OT('双击输入文字'), x: 120, y: 120, w: 640, h: 120, size: 36, color: '#1c1917', align: 'left' });
    slideState.selected = id;
    ED.renderSlides(doc, document.getElementById('slideStage'), document.getElementById('slideCanvas'));
    changed();
  };

  ED.deleteElement = function (doc) {
    var slide = slideOf(doc);
    if (!slide || !slideState.selected) return;
    slide.elements = slide.elements.filter(function (e) { return e.id !== slideState.selected; });
    slideState.selected = null;
    ED.renderSlides(doc, document.getElementById('slideStage'), document.getElementById('slideCanvas'));
    changed();
  };

  ED.addSlide = function (doc) {
    if (!doc.deck) doc.deck = { w: 1280, h: 720, slides: [] };
    doc.deck.slides.push({ id: 'p' + Date.now(), bg: '#ffffff', elements: [] });
    slideState.index = doc.deck.slides.length - 1;
    ED.renderSlides(doc, document.getElementById('slideStage'), document.getElementById('slideCanvas'));
    changed();
  };

  ED.deleteSlide = function (doc) {
    if (!doc.deck || doc.deck.slides.length <= 1) return;
    doc.deck.slides.splice(slideState.index, 1);
    slideState.index = Math.max(0, slideState.index - 1);
    ED.renderSlides(doc, document.getElementById('slideStage'), document.getElementById('slideCanvas'));
    changed();
  };

  ED.gotoSlide = function (doc, delta) {
    if (!doc.deck) return;
    slideState.index += delta;
    if (slideState.index < 0) slideState.index = 0;
    if (slideState.index >= doc.deck.slides.length) slideState.index = doc.deck.slides.length - 1;
    ED.renderSlides(doc, document.getElementById('slideStage'), document.getElementById('slideCanvas'));
  };

  ED.setElemStyle = function (doc, fn) {
    var e = elementById(doc, slideState.selected);
    if (!e) return;
    fn(e);
    ED.renderSlides(doc, document.getElementById('slideStage'), document.getElementById('slideCanvas'));
    changed();
  };

  /* ==================== Markdown / HTML ==================== */

  function mdToHTML(md) {
    var lines = String(md || '').split(/\r?\n/);
    var out = [];
    var inCode = false, code = [], inList = false, inQuote = false;

    function inline(s) {
      s = escapeHTML(s);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      return s;
    }
    function closeList() { if (inList) { out.push('</ul>'); inList = false; } }
    function closeQuote() { if (inQuote) { out.push('</blockquote>'); inQuote = false; } }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^```/.test(line)) {
        if (inCode) { out.push('<pre><code>' + escapeHTML(code.join('\n')) + '</code></pre>'); code = []; inCode = false; }
        else { inCode = true; }
        continue;
      }
      if (inCode) { code.push(line); continue; }

      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { closeList(); closeQuote(); out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); continue; }
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { closeList(); closeQuote(); out.push('<hr>'); continue; }

      var q = /^>\s?(.*)$/.exec(line);
      if (q) {
        closeList();
        if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
        out.push('<p>' + inline(q[1]) + '</p>');
        continue;
      }
      closeQuote();

      var li = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (li) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + inline(li[1]) + '</li>');
        continue;
      }
      closeList();

      if (/^\s*$/.test(line)) continue;

      if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1])) {
        var head = splitPipe(line);
        i++;
        out.push('<table><thead><tr>');
        for (var hc = 0; hc < head.length; hc++) out.push('<th>' + inline(head[hc]) + '</th>');
        out.push('</tr></thead><tbody>');
        i++;
        while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
          var row = splitPipe(lines[i]);
          out.push('<tr>');
          for (var rc = 0; rc < row.length; rc++) out.push('<td>' + inline(row[rc]) + '</td>');
          out.push('</tr>');
          i++;
        }
        i--;
        out.push('</tbody></table>');
        continue;
      }

      out.push('<p>' + inline(line) + '</p>');
    }
    if (inCode) out.push('<pre><code>' + escapeHTML(code.join('\n')) + '</code></pre>');
    closeList(); closeQuote();
    return out.join('\n');
  }

  function splitPipe(line) {
    var s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    return s.split('|').map(function (x) { return x.trim(); });
  }

  ED.renderMarkdown = function (doc) {
    var input = document.getElementById('mdInput');
    var preview = document.getElementById('mdPreview');
    input.value = doc.markdown || '';
    preview.innerHTML = mdToHTML(input.value);
  };

  ED.bindMarkdown = function (doc) {
    var input = document.getElementById('mdInput');
    if (input.__bound) return;
    input.__bound = true;
    var timer = null;
    input.addEventListener('input', function () {
      doc.markdown = input.value;
      changed();
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        document.getElementById('mdPreview').innerHTML = mdToHTML(input.value);
      }, 120);
    });
  };

  ED.renderHTML = function (doc) {
    var input = document.getElementById('htmlInput');
    var frame = document.getElementById('htmlPreview');
    input.value = doc.html || '';
    frame.srcdoc = input.value;
  };

  ED.bindHTML = function (doc) {
    var input = document.getElementById('htmlInput');
    if (input.__bound) return;
    input.__bound = true;
    var timer = null;
    input.addEventListener('input', function () {
      doc.html = input.value;
      changed();
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        document.getElementById('htmlPreview').srcdoc = input.value;
      }, 320);
    });
  };

  ED.openHTML = function (doc) {
    var blob = new Blob([doc.html || ''], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  };

  // PDF 只读：用 pdf.js 自己渲染到 canvas。以前把 PDF 塞进 iframe 交给浏览器
  // 内置查看器，触控板捏合被 iframe 吞掉，缩放只能点它自己的菜单；现在页面
  // 在应用内，缩放与 Word 共用 transform 路径。
  var pdfState = {
    docId: '', page: 1, zoom: 'page-width', scale: 1, percent: 100,
    pdf: null, pages: [], baseW: 0, baseH: 0, token: 0, observer: null, reTimer: null
  };
  var pdfjsPromise = null;
  var PDF_MAX_CANVAS_PX = 12e6;
  var PDF_THUMB_LIMIT = 400;

  function ensurePdfJs() {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = new Promise(function (resolve, reject) {
      if (global.pdfjsLib) { resolve(global.pdfjsLib); return; }
      var s = document.createElement('script');
      s.src = 'vendor/pdfjs/pdf.min.js';
      s.onload = function () {
        if (!global.pdfjsLib) { reject(new Error('pdf.js 未就绪')); return; }
        // worker 走同目录，离线可用，不从 CDN 拉。
        global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
        resolve(global.pdfjsLib);
      };
      s.onerror = function () { reject(new Error('pdf.js 加载失败')); };
      document.head.appendChild(s);
    });
    return pdfjsPromise;
  }

  function pdfName(doc) {
    var title = String(doc.title || '').trim();
    if (title) return /\.pdf$/i.test(title) ? title : title + '.pdf';
    return doc.source ? doc.source.name : 'PDF';
  }

  function pdfPages(doc) {
    return doc.pdf && doc.pdf.pages ? doc.pdf.pages : 0;
  }

  function pdfPageEls() {
    var host = document.getElementById('pdfPages');
    return host ? Array.prototype.slice.call(host.querySelectorAll('.pdf-page')) : [];
  }

  function syncPdfZoomControl() {
    var sel = document.getElementById('pdfZoom');
    if (!sel) return;
    var mode = pdfState.zoom;
    var dyn = sel.querySelectorAll('option[data-dyn="1"]');
    for (var i = 0; i < dyn.length; i++) dyn[i].parentNode.removeChild(dyn[i]);
    if (/^\d+$/.test(mode) && !sel.querySelector('option[value="' + mode + '"]')) {
      var opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = mode + '%';
      opt.setAttribute('data-dyn', '1');
      sel.appendChild(opt);
    }
    if (sel.value !== mode) sel.value = mode;
  }

  function paintPdfChrome(doc) {
    // pdf.js 读完后页数在 pdfState.pages；doc.pdf.pages 只是导入件的历史字段。
    var pages = pdfState.docId === doc.id && pdfState.pages.length ? pdfState.pages.length : pdfPages(doc);
    var meta = document.getElementById('pdfMeta');
    var input = document.getElementById('pdfPage');
    var count = document.getElementById('pdfCount');
    var thumbs = document.getElementById('pdfThumbs');
    var open = document.getElementById('pdfOpen');
    if (meta) {
      meta.textContent = '';
      // 文件名是用户内容，单独一个节点跳过翻译；页数与「只读」交给词表。
      var nameEl = document.createElement('span');
      nameEl.setAttribute('data-i18n-skip', '');
      nameEl.textContent = pdfName(doc);
      meta.appendChild(nameEl);
      if (pages) meta.appendChild(document.createTextNode(' · ' + pages + ' 页'));
      meta.appendChild(document.createTextNode(' · 只读'));
    }
    if (input) {
      input.max = pages || '';
      input.value = pdfState.page;
      input.disabled = !pages;
    }
    if (count) count.textContent = '/ ' + (pages || '?');
    if (open) { var rawHref = rawDocUrl(API.rawUrl(doc.id)); if (rawHref) open.href = rawHref; }
    syncPdfZoomControl();
    if (!thumbs) return;
    thumbs.innerHTML = '';
    var limit = Math.min(pages, PDF_THUMB_LIMIT);
    for (var i = 1; i <= limit; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pdf-thumb' + (i === pdfState.page ? ' active' : '');
      b.setAttribute('data-page', String(i));
      b.textContent = String(i);
      thumbs.appendChild(b);
    }
  }

  // 先只取页对象（不画），用来确定每页的原始尺寸和占位高度。
  function loadPdf(doc) {
    var token = ++pdfState.token;
    var host = document.getElementById('pdfPages');
    if (host) host.innerHTML = '<div class="pdf-hint">正在读取 PDF…</div>';
    return ensurePdfJs().then(function (lib) {
      // getDocument 返回 LoadingTask，真正的文档在它的 promise 上。
      return lib.getDocument({
        url: API.rawUrl(doc.id),
        disableRange: true,
        disableStream: true,
        isEvalSupported: false
      }).promise;
    }).then(function (pdf) {
      if (token !== pdfState.token) { try { pdf.destroy(); } catch (e) {} return null; }
      var jobs = [];
      for (var i = 1; i <= pdf.numPages; i++) jobs.push(pdf.getPage(i));
      return Promise.all(jobs).then(function (list) {
        if (token !== pdfState.token) { try { pdf.destroy(); } catch (e) {} return null; }
        pdfState.pdf = pdf;
        pdfState.pages = list;
        var vp = list[0].getViewport({ scale: 1 });
        pdfState.baseW = vp.width;
        pdfState.baseH = vp.height;
        return pdf;
      });
    });
  }

  function buildPdfPages() {
    var host = document.getElementById('pdfPages');
    if (!host) return;
    if (pdfState.observer) { pdfState.observer.disconnect(); pdfState.observer = null; }
    host.innerHTML = '';
    host.className = 'pdf-pages';
    for (var i = 0; i < pdfState.pages.length; i++) {
      var vp = pdfState.pages[i].getViewport({ scale: 1 });
      var el = document.createElement('div');
      el.className = 'pdf-page';
      el.setAttribute('data-page', String(i + 1));
      el.style.width = Math.ceil(vp.width) + 'px';
      el.style.height = Math.ceil(vp.height) + 'px';
      el.__vp1 = vp;
      el.__at = 0;
      host.appendChild(el);
    }
    observePdfPages();
  }

  function observePdfPages() {
    var host = document.getElementById('pdfPages');
    var scroll = document.getElementById('pdfScroll');
    if (!host || !scroll) return;
    if (!global.IntersectionObserver) {
      // 老引擎没有观察器就整段渲染，靠页数上限兜住。
      pdfPageEls().forEach(function (el) { renderPdfPage(el); });
      return;
    }
    if (pdfState.observer) pdfState.observer.disconnect();
    pdfState.observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) renderPdfPage(entries[i].target);
      }
    }, { root: scroll, rootMargin: '700px 0px' });
    pdfPageEls().forEach(function (el) { pdfState.observer.observe(el); });
  }

  // 画一页。canvas 的 CSS 尺寸固定为 1:1，清晰度由 backing store 决定；
  // 缩放交给容器 transform，所以放大后按新比例重画当前视口附近的页。
  function renderPdfPage(el) {
    if (!el || el.__busy) return Promise.resolve();
    var idx = parseInt(el.getAttribute('data-page'), 10) - 1;
    var page = pdfState.pages[idx];
    if (!page) return Promise.resolve();
    var want = Math.max(1, Math.min(2, pdfState.scale || 1));
    if (el.__at && Math.abs(el.__at - want) / want < 0.2) return Promise.resolve();
    el.__busy = true;
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    var vp1 = el.__vp1 || page.getViewport({ scale: 1 });
    var s = dpr * want;
    if (vp1.width * vp1.height * s * s > PDF_MAX_CANVAS_PX) {
      s = Math.sqrt(PDF_MAX_CANVAS_PX / (vp1.width * vp1.height));
    }
    var vp = page.getViewport({ scale: s });
    var canvas = el.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      el.appendChild(canvas);
    }
    if (el.__task) { try { el.__task.cancel(); } catch (e) {} el.__task = null; }
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = Math.ceil(vp1.width) + 'px';
    canvas.style.height = Math.ceil(vp1.height) + 'px';
    var task;
    try {
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    } catch (e) {
      el.__busy = false;
      return Promise.resolve();
    }
    el.__task = task;
    return task.promise.then(function () {
      el.__at = want;
      el.classList.add('ready');
    }).catch(function () {}).then(function () {
      el.__task = null;
      el.__busy = false;
    });
  }

  // 缩放停下后，把视口附近的页按新比例重画一遍，放大不会糊。
  function schedulePdfRerender() {
    if (pdfState.reTimer) clearTimeout(pdfState.reTimer);
    pdfState.reTimer = setTimeout(function () {
      pdfState.reTimer = null;
      var scroll = document.getElementById('pdfScroll');
      if (!scroll) return;
      var sr = scroll.getBoundingClientRect();
      var ok = false;
      pdfPageEls().forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom > sr.top - 700 && r.top < sr.bottom + 700) {
          ok = true;
          renderPdfPage(el);
        }
      });
      if (!ok) renderPdfPage(pdfPageEls()[0]);
    }, 160);
  }

  function pdfScaleFor(mode) {
    var scroll = document.getElementById('pdfScroll');
    var availW = Math.max(180, (scroll ? scroll.clientWidth : global.innerWidth) - 36);
    var availH = Math.max(180, (scroll ? scroll.clientHeight : global.innerHeight) - 36);
    var n = parseFloat(mode);
    if (isFinite(n)) return n / 100;
    if (mode === 'page-fit') {
      return Math.min(availW / (pdfState.baseW || 1), availH / (pdfState.baseH || 1));
    }
    return availW / (pdfState.baseW || 1);
  }

  ED.applyPdfZoom = function () {
    var host = document.getElementById('pdfPages');
    var box = document.getElementById('pdfZoomBox');
    var scroll = document.getElementById('pdfScroll');
    if (!host || !pdfState.pages.length) return;
    resetZoomBox(host, box);
    host.classList.remove('align-start');
    pdfState.scale = 1;
    pdfState.percent = 100;
    // 窄屏 Word 走连续纸不缩放；PDF 仍按页宽压进屏幕，否则 842px 的纸会横向溢出。
    var narrow = global.innerWidth <= 900;
    var scale = Math.max(0.1, Math.min(4, pdfScaleFor(narrow ? 'page-width' : pdfState.zoom)));
    var avail = Math.max(1, (scroll ? scroll.clientWidth : global.innerWidth) - 36);
    if ((pdfState.baseW || 0) * scale > avail + 1) host.classList.add('align-start');
    if (scale > 1 || scale < 1) fitZoomBox(host, box, scale, pdfPageEls());
    pdfState.scale = scale;
    pdfState.percent = Math.round(scale * 100);
    schedulePdfRerender();
  };

  // 与 Word 的 setZoomAt 同一套锚点算法：先记指针下的文档坐标，缩放后滚回原位。
  function setPdfZoomAt(percent, cx, cy) {
    var scroll = document.getElementById('pdfScroll');
    if (!scroll || !pdfState.pages.length || global.innerWidth <= 900) return;
    var before = pdfState.percent || 100;
    var next = Math.max(25, Math.min(400, Math.round(percent)));
    if (!isFinite(next) || Math.abs(next - before) < 0.5) return;
    var rect = scroll.getBoundingClientRect();
    var px = (cx == null ? rect.left + rect.width / 2 : cx) - rect.left;
    var py = (cy == null ? rect.top + rect.height / 2 : cy) - rect.top;
    var ax = (scroll.scrollLeft + px) / (before / 100);
    var ay = (scroll.scrollTop + py) / (before / 100);
    pdfState.zoom = String(next);
    ED.applyPdfZoom();
    syncPdfZoomControl();
    scroll.scrollLeft = ax * (next / 100) - px;
    scroll.scrollTop = ay * (next / 100) - py;
  }

  function syncPdfPageFromScroll() {
    var scroll = document.getElementById('pdfScroll');
    if (!scroll || !pdfState.pages.length) return;
    var sr = scroll.getBoundingClientRect();
    var best = 1, bestD = Infinity;
    pdfPageEls().forEach(function (el) {
      var r = el.getBoundingClientRect();
      var d = Math.abs(r.top - sr.top);
      if (d < bestD) { bestD = d; best = parseInt(el.getAttribute('data-page'), 10) || 1; }
    });
    if (best === pdfState.page) return;
    pdfState.page = best;
    var input = document.getElementById('pdfPage');
    if (input) input.value = best;
    var thumbs = document.getElementById('pdfThumbs');
    if (thumbs) {
      var active = thumbs.querySelector('.pdf-thumb.active');
      if (active) active.classList.remove('active');
      var next = thumbs.querySelector('.pdf-thumb[data-page="' + best + '"]');
      if (next) next.classList.add('active');
    }
  }

  function installPdfZoom() {
    var scroll = document.getElementById('pdfScroll');
    if (!scroll || scroll.__pinchBound) return;
    scroll.__pinchBound = true;
    scroll.addEventListener('wheel', function (e) {
      if (!e.ctrlKey || e.metaKey || global.innerWidth <= 900) return;
      e.preventDefault();
      var step = -e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      var factor = Math.max(0.85, Math.min(1.2, Math.exp(step * 0.0025)));
      setPdfZoomAt((pdfState.percent || 100) * factor, e.clientX, e.clientY);
    }, { passive: false });
    var gBase = 100;
    scroll.addEventListener('gesturestart', function (e) {
      if (global.innerWidth <= 900) return;
      e.preventDefault();
      gBase = pdfState.percent || 100;
    }, { passive: false });
    scroll.addEventListener('gesturechange', function (e) {
      if (global.innerWidth <= 900) return;
      e.preventDefault();
      setPdfZoomAt(gBase * (e.scale || 1), e.clientX, e.clientY);
    }, { passive: false });
    scroll.addEventListener('gestureend', function (e) {
      if (global.innerWidth > 900) e.preventDefault();
      schedulePdfRerender();
    }, { passive: false });

    var tDist = 0, tBase = 100;
    function touchDist(t) {
      var dx = t[0].clientX - t[1].clientX;
      var dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    scroll.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2 && global.innerWidth > 900) {
        tDist = touchDist(e.touches);
        tBase = pdfState.percent || 100;
      }
    }, { passive: true });
    scroll.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2 || global.innerWidth <= 900) return;
      if (!tDist) { tDist = touchDist(e.touches); tBase = pdfState.percent || 100; return; }
      e.preventDefault();
      var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setPdfZoomAt(tBase * touchDist(e.touches) / tDist, midX, midY);
    }, { passive: false });
    scroll.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) { tDist = 0; schedulePdfRerender(); }
    }, { passive: true });

    scroll.addEventListener('scroll', syncPdfPageFromScroll);
  }

  ED.renderPDF = function (doc) {
    paintPdfChrome(doc);
    if (pdfState.docId === doc.id && pdfState.pages.length) {
      ED.applyPdfZoom();
      return;
    }
    pdfState.docId = doc.id;
    pdfState.page = 1;
    pdfState.zoom = 'page-width';
    pdfState.pages = [];
    if (pdfState.pdf) { try { pdfState.pdf.destroy(); } catch (e) {} pdfState.pdf = null; }
    loadPdf(doc).then(function (pdf) {
      if (!pdf) return;
      buildPdfPages();
      paintPdfChrome(doc);
      ED.applyPdfZoom();
      var scroll = document.getElementById('pdfScroll');
      // 打开文档总是从第一页开始；原生壳偶尔会在布局完成后自己滚一段，
      // 这里在头两秒内把仍停在第 1 页的视角按回顶部。
      function backToTop() {
        if (pdfState.docId !== doc.id || pdfState.page !== 1) return;
        var s = document.getElementById('pdfScroll');
        if (s) { s.scrollTop = 0; s.scrollLeft = 0; }
      }
      backToTop();
      setTimeout(backToTop, 400);
      setTimeout(backToTop, 1200);
      renderPdfPage(pdfPageEls()[0]);
    }).catch(function (e) {
      var host = document.getElementById('pdfPages');
      if (host) host.innerHTML = '<div class="pdf-hint">PDF 读取失败：' + (e && e.message ? e.message : '未知错误') + '</div>';
    });
  };

  ED.pdfPage = function () { return pdfState.page; };

  ED.setPdfPage = function (n) {
    if (!global.__edDoc || global.__edDoc.kind !== 'pdf') return;
    var total = pdfState.pages.length || pdfPages(global.__edDoc);
    var page = total ? Math.min(Math.max(1, n), total) : 1;
    // 页码输入框的 change 可能由程序写值引发；同页不重新定位，避免打开文档时被拽走。
    if (page === pdfState.page) return;
    pdfState.page = page;
    var el = document.querySelector('#pdfPages .pdf-page[data-page="' + page + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
    paintPdfChrome(global.__edDoc);
  };

  ED.movePdfPage = function (delta) {
    if (!global.__edDoc || global.__edDoc.kind !== 'pdf') return;
    ED.setPdfPage(pdfState.page + delta);
  };

  ED.setPdfZoom = function (z) {
    pdfState.zoom = z || 'page-width';
    if (global.__edDoc && global.__edDoc.kind === 'pdf') {
      ED.applyPdfZoom();
      syncPdfZoomControl();
    }
  };

  /* 入口：按种类分派。 */
  ED.render = function (doc) {
    global.__edDoc = doc;
    var map = {
      doc: 'viewDoc', sheet: 'viewSheet', slide: 'viewSlide',
      markdown: 'viewMarkdown', html: 'viewHtml', pdf: 'viewPdf', home: 'viewHome'
    };
    for (var k in map) {
      if (!map.hasOwnProperty(k)) continue;
      var el = document.getElementById(map[k]);
      if (el) el.hidden = (k !== doc.kind);
    }
    if (doc.kind === 'doc') {
      // 先写纸张几何，再渲染块并分页；否则第一轮会按默认 A4 量错高度。
      ED.applyPage(doc);
      ED.renderDoc(doc, document.getElementById('docEditor'));
      ED.renderPageFrame(doc);
      ED.applyZoom();
      ED.updatePageStat();
    }
    if (doc.kind === 'sheet') {
      ED.renderSheet(doc, document.getElementById('sheetTable'));
      ED.bindSheet(doc, document.getElementById('sheetTable'));
    }
    if (doc.kind === 'slide') {
      ED.renderSlides(doc, document.getElementById('slideStage'), document.getElementById('slideCanvas'));
      ED.bindSlides(doc, document.getElementById('slideStage'), document.getElementById('slideCanvas'));
    }
    if (doc.kind === 'markdown') { ED.renderMarkdown(doc); ED.bindMarkdown(doc); }
    if (doc.kind === 'html') { ED.renderHTML(doc); ED.bindHTML(doc); }
    if (doc.kind === 'pdf') ED.renderPDF(doc);
  };

  global.ED = ED;
})(window);
