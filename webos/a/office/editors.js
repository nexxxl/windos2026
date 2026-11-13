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
        if (r.font) st += 'font-family:' + r.font + ';';
        s = '<span style="' + escAttr(st) + '">' + s + '</span>';
      }
      out += s;
    }
    return out || '<br>';
  }

  function blockHTML(b) {
    if (b.type === 'hr') return '';
    if (b.type === 'table') {
      var t = '<table contenteditable="false"><tbody>';
      var rows = b.rows || [];
      for (var i = 0; i < rows.length; i++) {
        t += '<tr>';
        for (var j = 0; j < rows[i].length; j++) {
          t += '<td contenteditable="true">' + escapeHTML(runsText(rows[i][j].runs || [])) + '</td>';
        }
        t += '</tr>';
      }
      return t + '</tbody></table>';
    }
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

  function makeBlockEl(b) {
    var el = document.createElement('div');
    el.className = 'blk';
    el.setAttribute('data-id', b.id || '');
    el.setAttribute('data-type', b.type || 'p');
    if (b.align) el.setAttribute('data-align', b.align);
    if (b.indent) el.setAttribute('data-indent', String(b.indent));
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
      if (b.align && b.align !== 'left') body.style.textAlign = b.align;
      if (b.indent) body.style.marginLeft = (Math.min(8, b.indent) * 24) + 'px';
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

  function zoomScale(el) {
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
    var scale = zoomScale(blk) || 1;
    var top = table.getBoundingClientRect().top;
    var limit = top + spaceLeft * scale;
    var fit = 0;
    for (var i = 0; i < trs.length; i++) {
      if (trs[i].getBoundingClientRect().bottom <= limit) fit = i + 1;
    }
    if (fit <= 0 || fit >= trs.length) return false;

    var tbody = table.querySelector('tbody');
    var tailTable = table.cloneNode(false);
    var tailBody = tbody ? tbody.cloneNode(false) : document.createElement('tbody');
    for (var r = fit; r < trs.length; r++) {
      tailBody.appendChild(trs[r].cloneNode(true));
      trs[r].parentNode.removeChild(trs[r]);
    }
    tailTable.appendChild(tailBody);

    var newId = 't' + Date.now() + '-' + (++splitSeq);
    var groupId = blk.getAttribute('data-cont-group') || newId;
    var tail = makeBlockEl({ id: newId, type: 'table', rows: [] });
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

  ED.applyZoom = function () {
    var host = docHost();
    if (!host) return;
    var pages = pagesNow();
    var mode = storedZoom();
    var sel = document.getElementById('docZoom');
    if (sel && sel.value !== mode) sel.value = mode;
    host.className = 'doc-pages';
    if (!pages.length) return;
    if (window.innerWidth <= 900) {
      for (var m = 0; m < pages.length; m++) pages[m].style.zoom = '';
      return;
    }

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
    for (var i = 0; i < pages.length; i++) pages[i].style.zoom = scale;
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
      // 段落级属性跟着块走：对齐、缩进与列表类型都要写回模型。
      var align = el.getAttribute('data-align') || '';
      if (align && align !== 'left') b.align = align;
      var indent = parseInt(el.getAttribute('data-indent') || '0', 10) || 0;
      if (indent > 0) b.indent = Math.min(8, indent);
      if (el.getAttribute('data-ordered') === '1') b.ordered = true;
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
        var rows = [];
        var trs = body.querySelectorAll('tr');
        for (var r = 0; r < trs.length; r++) {
          var tds = trs[r].querySelectorAll('td,th');
          var row = [];
          for (var c = 0; c < tds.length; c++) {
            var txt = tds[c].textContent;
            row.push({ runs: txt ? [{ t: txt }] : [] });
          }
          rows.push(row);
        }
        b.rows = rows;
      } else if (type === 'passthrough') {
        // 原样保留，runs 为空。
      } else {
        b.runs = serializeRuns(body);
      }
      // 分页拆出来的后半段按 group 合并回第一段；模型里仍然是一个段落，
      // 这样保存和导出 DOCX 都不会多出段落分隔。
      var group = el.getAttribute('data-cont-group') || '';
      if (group && el.getAttribute('data-cont') !== '1') groupIndex[group] = blocks.length;
      if (group && el.getAttribute('data-cont') === '1' && groupIndex[group] != null) {
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

  // PDF 只读：页码与缩放交给 Chrome 内置查看器，外层只做导航与原文件出口。
  // 保留查看器自带的搜索、旋转、下载、连续滚动，流畅度和功能都交给浏览器。
  var pdfState = { page: 1, zoom: 'page-width' };

  function pdfName(doc) {
    var title = String(doc.title || '').trim();
    if (title) return /\.pdf$/i.test(title) ? title : title + '.pdf';
    return doc.source ? doc.source.name : 'PDF';
  }

  ED.pdfUrl = function (doc) {
    var parts = ['zoom=' + pdfState.zoom];
    if (pdfState.page > 1) parts.push('page=' + pdfState.page);
    // Chrome 内置 PDF 阅读器只在文档加载时读取 #page/#zoom；同一 URL 只改 hash 不会翻页。
    // 查询串里带导航戳，让 iframe 重新加载同一份字节后再落到目标页。
    return API.rawUrl(doc.id) + '?nav=' + pdfState.page + '-' + encodeURIComponent(pdfState.zoom) + '#' + parts.join('&');
  };

  function pdfPages(doc) {
    return doc.pdf && doc.pdf.pages ? doc.pdf.pages : 0;
  }

  function paintPdf(doc, reset) {
    var pages = pdfPages(doc);
    if (reset) { pdfState.page = 1; pdfState.zoom = 'page-width'; }
    if (pages > 0) pdfState.page = Math.min(Math.max(1, pdfState.page), pages);
    var frame = document.getElementById('pdfFrame');
    var meta = document.getElementById('pdfMeta');
    var input = document.getElementById('pdfPage');
    var count = document.getElementById('pdfCount');
    var thumbs = document.getElementById('pdfThumbs');
    var zoom = document.getElementById('pdfZoom');
    var open = document.getElementById('pdfOpen');
    var name = pdfName(doc);
    if (meta) {
      meta.textContent = '';
      // 文件名是用户内容，单独一个节点跳过翻译；页数与「只读」交给词表。
      var nameEl = document.createElement('span');
      nameEl.setAttribute('data-i18n-skip', '');
      nameEl.textContent = name;
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
    if (zoom) zoom.value = pdfState.zoom;
    if (open) open.href = API.rawUrl(doc.id);
    if (thumbs) {
      thumbs.innerHTML = '';
      var limit = Math.min(pages, 400);
      for (var i = 1; i <= limit; i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pdf-thumb' + (i === pdfState.page ? ' active' : '');
        b.setAttribute('data-page', String(i));
        b.textContent = String(i);
        thumbs.appendChild(b);
      }
    }
    var next = ED.pdfUrl(doc);
    if (frame && frame.getAttribute('src') !== next) frame.src = next;
  }

  ED.renderPDF = function (doc) { paintPdf(doc, true); };
  ED.setPdfPage = function (n) {
    if (!global.__edDoc || global.__edDoc.kind !== 'pdf') return;
    var pages = pdfPages(global.__edDoc);
    pdfState.page = pages ? Math.min(Math.max(1, n), pages) : 1;
    paintPdf(global.__edDoc, false);
  };
  ED.movePdfPage = function (delta) {
    if (!global.__edDoc || global.__edDoc.kind !== 'pdf') return;
    ED.setPdfPage(pdfState.page + delta);
  };
  ED.setPdfZoom = function (z) {
    pdfState.zoom = z || 'page-width';
    if (global.__edDoc && global.__edDoc.kind === 'pdf') paintPdf(global.__edDoc, false);
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
