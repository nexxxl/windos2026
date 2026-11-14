// 文档与元工具族：WordCraft（长文档）、GridCraft（表格）、Craft Anything（逆向工作台）。
// 界面参照的工作流类型见 docs/artcraftport/ATTRIBUTION.md。
import {
  h, clear, craft, craftShell, icon, iconButton, ribbonBar, panel, sectionLabel,
  toastIn, commandScope, clamp, download, pickFile, readFileText, parseHex,
} from './kernel.js';
import { htmlDocument, csvText } from './export.js';
import { loadDoc, saveDoc } from './engine/doc.js';
import { PAGE_HEIGHT, PAGE_WIDTH, pageCount, currentPage } from './engine/paginate.js';

const FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

/* ============================ WordCraft：长文档 ============================ */

craft({
  id: 'wordcraft', name: 'WordCraft', up: '文档 · 富文本', group: 'docs', tag: '文档',
  blurb: '浅色功能区、A4 页面、标题导航与真正的富文本编辑。',
  hint: '直接点纸张输入；功能区改样式',
  mount(host) {
    const shell = craftShell(host, {
      name: 'WordCraft', file: 'The Open Studio Handbook — 未保存', up: '文档 · 富文本', tag: '编辑',
      theme: 'light', layout: 'word', center: true,
    });

    const page = h('div', { class: 'ag-word-page', contenteditable: 'true', spellcheck: 'false' });
    page.innerHTML = [
      '<h1>The Open Studio Handbook</h1>',
      '<p><em>A shared room puts your work next to work you would never have seen otherwise.</em></p>',
      '<h2>Why share a studio?</h2>',
      '<p>Rent is the obvious reason, but it is not the best one. A shared room puts your work next to work you would never have seen otherwise. A ceramicist explains glaze chemistry to a comic artist; a photographer borrows a weaver\'s loom for a still life.</p>',
      '<h2>What we agree on</h2>',
      '<ul><li><strong>Clean as you go.</strong> Leave a table the way you would like to find it.</li>',
      '<li><strong>Label what is yours.</strong> Unlabelled supplies on the commons shelf are fair game.</li>',
      '<li><strong>Ask before you borrow.</strong> Even from the shelf, a quick note helps everyone keep track.</li></ul>',
      '<h2>Opening the studio</h2>',
      '<p>Every Thursday the old print shop on Alder Street fills with people who make things. The routines that keep it pleasant are small: a shared calendar, a box for offcuts, and thirty strangers who become a crew.</p>',
    ].join('');

    const nav = h('aside', { class: 'ag-word-nav' });
    const main = h('div', { class: 'ag-word-main' });
    const ruler = h('div', { class: 'ag-word-ruler' });
    const scroll = h('div', { class: 'ag-word-scroll', style: 'position:relative' });
    // 分页虚线覆盖层是 page 的兄弟节点，绝不塞进 contenteditable，
    // 否则会污染 page.innerHTML 而改变导出 HTML 的字节。
    const breakLayer = h('div', { class: 'ag-word-breaklayer' });
    scroll.append(page, breakLayer);
    main.append(ruler, scroll);
    shell.body.append(nav, main);

    const status = h('div', { class: 'ag-word-status' });
    shell.sub.append(status);

    // 文档存档：正文 HTML + 页面样式。恢复前过滤脚本/事件属性，
    // 因为 contenteditable 的内容也可能被外部命令写入。
    let saveTimer = 0;
    function wordDoc() {
      return {
        html: page.innerHTML,
        padding: page.style.padding,
        width: page.style.width,
        minHeight: page.style.minHeight,
        zoom: page.style.zoom,
      };
    }
    function persist() {
      saveTimer = 0;
      saveDoc('wordcraft', wordDoc());
    }
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 600);
    }
    function safeWordHtml(html) {
      return String(html || '')
        .replace(/<\s*(script|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript\s*:/gi, '');
    }

    // 标尺按厘米刻度，和 Word 的横向标尺一致。
    for (let i = 0; i < 18; i++) ruler.append(h('span', {}, String(i)));
    for (let i = 1; i < 18; i++) {
      const tick = h('i', { style: 'position:absolute;left:' + (i / 18 * 100) + '%;top:12px;width:1px;height:' + (i % 2 ? 4 : 7) + 'px;background:#a6a6a6' });
      ruler.append(tick);
    }

    function refreshNav() {
      clear(nav);
      nav.append(h('h4', {}, '导航'));
      const heads = page.querySelectorAll('h1, h2, h3');
      if (!heads.length) nav.append(h('p', { class: 'ag-hint' }, '还没有标题。'));
      for (let i = 0; i < heads.length; i++) {
        const el = heads[i];
        nav.append(h('a', {
          style: 'padding-left:' + ({ H1: 4, H2: 12, H3: 20 }[el.tagName] || 4) + 'px',
          onclick() { el.scrollIntoView({ block: 'center' }); page.focus(); },
        }, el.textContent));
      }
    }

    // 分页计算全部走纯函数 engine/paginate.js；这里只读 DOM 量。
    function computeInfo() {
      const text = page.innerText || '';
      const words = (text.match(/[\u4e00-\u9fa5]|[A-Za-z0-9']+/g) || []).length;
      const contentH = page.scrollHeight;
      const pages = pageCount(contentH, PAGE_HEIGHT);
      let cur = currentPage(scroll.scrollTop, PAGE_HEIGHT, pages);
      // 触底时视口必然落在最后一页；公式的 +200 偏置对「不满一整页」的末页会
      // 欠拟合到 pages-1，这里把触底情形显式夹到 pages。纯函数 currentPage 仍严格
      // 实现文档公式，此夹取只是 UI 层对触底语义的补充。
      const maxScroll = scroll.scrollHeight - scroll.clientHeight;
      if (maxScroll > 0 && scroll.scrollTop >= maxScroll - 2) cur = pages;
      return { words: words, contentH: contentH, pages: pages, page: cur };
    }

    // 在纸张内按页高画虚线：每页顶部一条（共 pages 条），右侧小字「第 N 页」。
    // 覆盖层 pointer-events:none，且是 page 的兄弟节点，不进导出内容。
    function renderBreaks(pages, contentH) {
      clear(breakLayer);
      breakLayer.style.left = page.offsetLeft + 'px';
      breakLayer.style.top = page.offsetTop + 'px';
      breakLayer.style.width = (page.offsetWidth || PAGE_WIDTH) + 'px';
      breakLayer.style.height = contentH + 'px';
      for (let k = 1; k <= pages; k++) {
        breakLayer.append(h('div', {
          class: 'ag-word-break',
          style: 'top:' + ((k - 1) * PAGE_HEIGHT) + 'px',
        }, h('span', { class: 'ag-word-break-label' }, '第 ' + k + ' 页')));
      }
    }

    function refreshStatus() {
      const info = computeInfo();
      clear(status);
      status.append(
        h('span', { class: 'ag-word-pagecount' }, '第 ' + info.page + ' 页，共 ' + info.pages + ' 页'),
        h('span', {}, info.words + ' 个字'),
        h('span', {}, '中文（中国）'),
        h('span', { class: 'ag-spacer' }),
        h('span', {}, '100%'));
      shell.setStatus(info.pages + ' 页 · 共 ' + info.words + ' 字');
      shell.setInfo('A4 · 21 × 29.7 cm');
      renderBreaks(info.pages, info.contentH);
    }

    // 滚动只更新页码显示；pageInfo 直接读 live scrollTop。
    function onScroll() {
      const info = computeInfo();
      const pc = status.querySelector('.ag-word-pagecount');
      if (pc) pc.textContent = '第 ' + info.page + ' 页，共 ' + info.pages + ' 页';
    }

    // 粘贴统一转纯文本，杜绝富文本标签污染文档与导出。
    function onPaste(ev) {
      ev.preventDefault();
      const cd = ev.clipboardData || window.clipboardData;
      const text = cd ? (cd.getData('text/plain') || '') : '';
      let inserted = false;
      if (document.execCommand) {
        try { inserted = document.execCommand('insertText', false, text); } catch (e) { inserted = false; }
      }
      if (!inserted) {
        // 无 execCommand（或插入失败）时，降级为 Range 插入纯文本节点。
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      refreshNav();
      refreshStatus();
      scheduleSave();
    }

    function onResize() { refreshStatus(); }

    page.addEventListener('input', () => { refreshNav(); refreshStatus(); scheduleSave(); });
    page.addEventListener('keyup', (e) => { if (e.key === 'Enter') refreshNav(); });
    page.addEventListener('paste', onPaste);
    scroll.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onResize);

    function cmd(c, arg) {
      page.focus();
      try { document.execCommand(c, false, arg || null); } catch (e) { toastIn(shell.root, '当前浏览器不支持该命令'); }
      refreshNav();
      scheduleSave();
    }

    const rb = ribbonBar([
      { id: 'home', label: '开始', groups: [
        { label: '剪贴板', items: [
          { label: '粘贴', icon: 'save', onClick: () => cmd('paste') },
          { label: '剪切', icon: 'scissors', onClick: () => cmd('cut') },
          { label: '复制', icon: 'layers', onClick: () => cmd('copy') },
        ] },
        { label: '字体', items: [
          { label: 'B', icon: 'bold', onClick: () => cmd('bold') },
          { label: 'I', icon: 'italic', onClick: () => cmd('italic') },
          { label: 'U', icon: 'underline', onClick: () => cmd('underline') },
        ], groups: [
          [{ label: '字号 +', icon: 'plus', onClick: () => cmd('fontSize', '5') }, { label: '字号 −', icon: 'minus', onClick: () => cmd('fontSize', '2') }],
          [{ label: '标题 1', onClick: () => cmd('formatBlock', 'H1') }, { label: '标题 2', onClick: () => cmd('formatBlock', 'H2') }],
        ] },
        { label: '段落', items: [
          { label: '左对齐', icon: 'alignLeft', onClick: () => cmd('justifyLeft') },
          { label: '居中', icon: 'alignCenter', onClick: () => cmd('justifyCenter') },
          { label: '右对齐', icon: 'alignRight', onClick: () => cmd('justifyRight') },
          { label: '项目符号', icon: 'list', onClick: () => cmd('insertUnorderedList') },
        ] },
        { label: '样式', items: [
          { label: '正文', icon: 'text', onClick: () => cmd('formatBlock', 'P') },
          { label: '引用', icon: 'text', onClick: () => cmd('formatBlock', 'BLOCKQUOTE') },
        ] },
      ] },
      { id: 'insert', label: '插入', groups: [
        { label: '对象', items: [
          { label: '分页', icon: 'download', large: true, onClick: () => cmd('insertHorizontalRule') },
          { label: '表格', icon: 'table', large: true, onClick: insertTable },
          { label: '链接', icon: 'link', onClick: () => cmd('createLink', prompt('链接地址') || '') },
        ] },
      ] },
      { id: 'layout', label: '布局', groups: [
        { label: '页面设置', items: [
          { label: '常规边距', icon: 'square', large: true, onClick: () => setPad(96, 84) },
          { label: '窄边距', icon: 'square', large: true, onClick: () => setPad(48, 48) },
          { label: '宽边距', icon: 'square', onClick: () => setPad(120, 132) },
          { label: '横向', icon: 'square', onClick: () => toggleLandscape() },
        ] },
        { label: '显示', items: [
          { label: '100%', onClick: () => setZoom(1) },
          { label: '80%', onClick: () => setZoom(0.8) },
          { label: '125%', onClick: () => setZoom(1.25) },
        ] },
      ] },
      { id: 'review', label: '审阅', groups: [
        { label: '校对', items: [
          { label: '字数统计', icon: 'search', large: true, onClick: refreshStatus },
          { label: '导出 HTML', icon: 'download', large: true, onClick: exportHtml },
        ] },
      ] },
    ]);
    shell.sub.insertBefore(rb.el, status);

    function setPad(v, hpad) {
      page.style.padding = v + 'px ' + hpad + 'px';
      shell.setStatus('页边距已更新');
      scheduleSave();
    }
    function setZoom(z) {
      page.style.zoom = String(z);
      shell.setStatus('显示比例 ' + Math.round(z * 100) + '%');
      scheduleSave();
    }
    function toggleLandscape() {
      const on = page.style.width === '1050px';
      page.style.width = on ? '794px' : '1050px';
      page.style.minHeight = on ? '1050px' : '794px';
      shell.setStatus(on ? '纵向' : '横向');
      scheduleSave();
    }
    function insertTable() {
      cmd('insertHTML', '<table style="border-collapse:collapse;width:100%"><tr><td style="border:1px solid #999;padding:4px">单元格</td><td style="border:1px solid #999;padding:4px">单元格</td></tr><tr><td style="border:1px solid #999;padding:4px">&nbsp;</td><td style="border:1px solid #999;padding:4px">&nbsp;</td></tr></table><p><br></p>');
    }
    function exportHtml() {
      // title 传空串：走 export.js 的旧字节路径，保证迁移前后 wordcraft.html 逐字节一致。
      download('wordcraft.html', htmlDocument('', page.innerHTML), 'text/html');
      toastIn(shell.root, 'HTML 已导出');
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '保存到本机', onClick: persist },
        { label: '导出 HTML', shortcut: '⌘S', onClick: exportHtml },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '编辑', items: [
        { label: '撤销', shortcut: '⌘Z', onClick: () => cmd('undo') },
        { label: '重做', shortcut: '⇧⌘Z', onClick: () => cmd('redo') },
        { sep: true }, { label: '全选', shortcut: '⌘A', onClick: () => cmd('selectAll') },
      ] },
      { label: '插入', items: [
        { label: '表格', onClick: insertTable },
        { label: '链接', onClick: () => cmd('createLink', prompt('链接地址') || '') },
      ] },
      { label: '视图', items: [
        { label: '100%', onClick: () => setZoom(1) },
        { label: '125%', onClick: () => setZoom(1.25) },
      ] },
    ]);

    const scope = commandScope();
    scope.add('wordcraft.setText', '替换正文 {text}', (a) => { page.innerHTML = '<p>' + String(a.text || '') + '</p>'; refreshNav(); refreshStatus(); scheduleSave(); });
    scope.add('wordcraft.save', '保存文档到本机', persist);
    scope.add('wordcraft.export', '导出 HTML', exportHtml);
    scope.add('wordcraft.pageInfo', '返回 {pages, page, words}', () => {
      const info = computeInfo();
      return { pages: info.pages, page: info.page, words: info.words };
    });

    (function restore() {
      const saved = loadDoc('wordcraft');
      if (!saved || !saved.doc || typeof saved.doc.html !== 'string') return;
      const clean = safeWordHtml(saved.doc.html);
      if (!clean) return;
      page.innerHTML = clean;
      ['padding', 'width', 'minHeight', 'zoom'].forEach((k) => {
        if (typeof saved.doc[k] === 'string' && saved.doc[k]) page.style[k] = saved.doc[k];
      });
    })();
    refreshNav();
    refreshStatus();
    // 首帧布局可能还没稳定，下一帧再量一次，保证虚线与页码对齐。
    if (window.requestAnimationFrame) window.requestAnimationFrame(refreshStatus);
    return { destroy() {
      if (saveTimer) { clearTimeout(saveTimer); persist(); }
      window.removeEventListener('resize', onResize); scope.dispose();
    } };
  },
});

/* ============================ GridCraft：表格 ============================ */

craft({
  id: 'gridcraft', name: 'GridCraft', up: '表格 · 公式', group: 'docs', tag: '表格',
  blurb: '公式栏、单元格编辑、SUM/AVG 公式与图表、CSV 导出。',
  hint: '点单元格输入；=SUM(A1:A3) 立即计算',
  mount(host) {
    const shell = craftShell(host, {
      name: 'GridCraft', file: '季度销售 — 未保存', up: '表格 · 公式', tag: '就绪',
      theme: 'light', layout: 'excel', center: true,
    });
    const COLS = 10, ROWS = 22;
    const cells = {
      A1: '季度销售', B1: '', C1: '', D1: '',
      A3: '区域', B3: 'Q1', C3: 'Q2', D3: '合计',
      A4: '北区', B4: '48200', C4: '51340',
      A5: '南区', B5: '39150', C5: '37980',
      A6: '东区', B6: '55300', C6: '55890',
      A7: '西区', B7: '61020', C7: '62400',
      A8: '中区', B8: '28740', C8: '31260',
      A9: '合计', B9: '=SUM(B4:B8)', C9: '=SUM(C4:C8)',
      D4: '=B4+C4', D5: '=B5+C5', D6: '=B6+C6', D7: '=B7+C7', D8: '=B8+C8', D9: '=SUM(D4:D8)',
    };
    let active = 'A1';
    let chart = null;

    // 工作表存档：单元格是纯字符串/公式，直接整表落盘；图表可见性一并恢复。
    let saveTimer = 0;
    function persist() {
      saveTimer = 0;
      saveDoc('gridcraft', { cells: cells, active: active, chart: chart });
    }
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 600);
    }
    function applyDoc(doc) {
      if (!doc || !doc.cells || typeof doc.cells !== 'object') return false;
      Object.keys(cells).forEach((k) => { delete cells[k]; });
      Object.keys(doc.cells).forEach((k) => {
        const v = doc.cells[k];
        if (typeof v === 'string' || typeof v === 'number') cells[k] = String(v);
      });
      if (typeof doc.active === 'string' && inputMap[doc.active]) active = doc.active;
      return true;
    }

    const nameBox = h('input', { class: 'ag-xl-name', style: 'border:1px solid var(--ag-input-line);height:18px;background:var(--ag-input-bg);color:var(--ag-text)', value: 'A1' });
    const fx = h('input', { class: 'ag-xl-finput', type: 'text' });
    const formulaBar = h('div', { class: 'ag-xl-formula' }, nameBox, h('span', { class: 'ag-xl-fx' }, 'fx'), fx);
    shell.sub.append(formulaBar);

    const gridHost = h('div', { class: 'ag-xl-grid' });
    const sheetTabs = h('div', { class: 'ag-xl-tabs' },
      h('button', { class: 'ag-xl-tab active', type: 'button' }, 'Sales'),
      h('button', { class: 'ag-xl-tab', type: 'button', onclick: () => shell.setStatus('单个工作表') }, '＋'));
    shell.body.append(gridHost);
    shell.sub.append(sheetTabs);

    const table = h('table', { class: 'ag-xl-table' });
    const colName = (i) => String.fromCharCode(65 + i);
    const headRow = h('tr', {}, h('th', { style: 'width:34px;background:#e8e8e8' }, ''));
    for (let c = 0; c < COLS; c++) headRow.append(h('th', { style: 'width:86px' }, colName(c)));
    table.append(headRow);
    const inputMap = {};
    for (let r = 1; r <= ROWS; r++) {
      const tr = h('tr', {}, h('th', { style: 'background:#e8e8e8' }, String(r)));
      for (let c = 0; c < COLS; c++) {
        const ref = colName(c) + r;
        const input = h('input', {
          type: 'text', value: cells[ref] || '', 'data-ref': ref,
          onfocus() { select(ref); input.value = cells[ref] == null ? '' : String(cells[ref]); },
          onblur() { paintCell(ref); },
          oninput(e) { cells[ref] = e.target.value; recalc(); scheduleSave(); },
          onkeydown(e) { navKey(e, r, c); },
        });
        inputMap[ref] = input;
        tr.append(h('td', { 'data-ref': ref, class: 'num' }, input));
      }
      table.append(tr);
    }
    gridHost.append(table);

    const chartCard = h('div', {
      style: 'position:absolute;left:520px;top:64px;width:360px;height:240px;background:#fff;border:1px solid #bbb;box-shadow:0 4px 14px rgba(0,0,0,.12);display:none;z-index:6',
    });
    gridHost.style.position = 'relative';
    gridHost.append(chartCard);

    const evaluating = {};
    function num(ref, depth) {
      const v = cells[ref];
      if (v == null || v === '') return 0;
      if (String(v).charAt(0) === '=') {
        if (evaluating[ref]) return 0; // 检测自引用 / 互相引用，避免无限递归
        evaluating[ref] = 1;
        const out = evalFormula(String(v).slice(1), (depth || 0) + 1);
        delete evaluating[ref];
        return out;
      }
      const n = parseFloat(String(v).replace(/,/g, ''));
      return isFinite(n) ? n : 0;
    }

    function expandRanges(expr) {
      return expr.replace(/([A-Z]+\d+):([A-Z]+\d+)/g, (m, a, b) => {
        const ca = a.charCodeAt(0) - 65, ra = parseInt(a.slice(1), 10);
        const cb = b.charCodeAt(0) - 65, rb = parseInt(b.slice(1), 10);
        const refs = [];
        for (let r = Math.min(ra, rb); r <= Math.max(ra, rb); r++) {
          for (let c = Math.min(ca, cb); c <= Math.max(ca, cb); c++) refs.push(colName(c) + r);
        }
        return refs.join(',');
      });
    }

    function evalFormula(expr, depth) {
      if (depth > 8) return 0;
      let x = expandRanges(expr);
      // 先把函数调用替换成数字
      x = x.replace(/(SUM|AVG|AVERAGE|MIN|MAX|COUNT)\(([^()]*)\)/gi, (m, fn, args) => {
        const refs = args.split(',').map((s) => s.trim()).filter(Boolean);
        const vals = refs.map((ref) => (/^[A-Z]+\d+$/.test(ref) ? num(ref, depth) : parseFloat(ref) || 0));
        const f = fn.toUpperCase();
        if (f === 'SUM') return String(vals.reduce((a, b) => a + b, 0));
        if (f === 'AVG' || f === 'AVERAGE') return String(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
        if (f === 'MIN') return String(vals.length ? Math.min.apply(null, vals) : 0);
        if (f === 'MAX') return String(vals.length ? Math.max.apply(null, vals) : 0);
        return String(vals.length);
      });
      // 单元格引用换成当前值
      x = x.replace(/[A-Z]+\d+/g, (ref) => String(num(ref, depth)));
      if (!/^[0-9+\-*/().\s]+$/.test(x)) return 0;
      try { return Function('"use strict";return (' + x + ')')(); } catch (e) { return 0; }
    }

    function display(ref) {
      const v = cells[ref];
      if (v == null || v === '') return '';
      if (String(v).charAt(0) === '=') {
        const n = evalFormula(String(v).slice(1), 0);
        return Number.isFinite(n) ? (Math.round(n * 100) / 100).toLocaleString('zh-CN') : '#ERR';
      }
      return v;
    }

    function paintCell(ref) {
      const el = inputMap[ref];
      if (!el || document.activeElement === el) return;
      el.value = display(ref);
    }
    function recalc() {
      Object.keys(inputMap).forEach((ref) => paintCell(ref));
      updateStatus();
      if (chart) drawChart();
    }

    function select(ref) {
      active = ref;
      nameBox.value = ref;
      fx.value = cells[ref] || '';
      const tds = table.querySelectorAll('td');
      for (let i = 0; i < tds.length; i++) tds[i].classList.toggle('active', tds[i].getAttribute('data-ref') === ref);
      updateStatus();
    }

    function navKey(e, r, c) {
      if (e.key === 'Enter') {
        e.preventDefault();
        // 输入框聚焦时已切成原始内容；只有真改过才写回，避免把显示值覆盖公式
        if (inputMap[active].value !== String(cells[active] == null ? '' : cells[active])) {
          cells[active] = inputMap[active].value;
          scheduleSave();
        }
        const next = colName(c) + Math.min(ROWS, r + 1);
        inputMap[next].focus();
        return;
      }
      if (e.key === 'ArrowDown' && r < ROWS) { e.preventDefault(); inputMap[colName(c) + (r + 1)].focus(); }
      if (e.key === 'ArrowUp' && r > 1) { e.preventDefault(); inputMap[colName(c) + (r - 1)].focus(); }
      if (e.key === 'ArrowRight' && c < COLS - 1) { e.preventDefault(); inputMap[colName(c + 1) + r].focus(); }
      if (e.key === 'ArrowLeft' && c > 0) { e.preventDefault(); inputMap[colName(c - 1) + r].focus(); }
      if (e.key === 'Tab' && c < COLS - 1) { e.preventDefault(); inputMap[colName(c + 1) + r].focus(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!inputMap[active].value) return;
      }
    }

    fx.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      cells[active] = fx.value;
      inputMap[active].value = fx.value;
      recalc();
      scheduleSave();
      const m = /^([A-Z]+)(\d+)$/.exec(active);
      if (m) {
        const r = parseInt(m[2], 10) + 1;
        if (r <= ROWS) inputMap[m[1] + r].focus();
      }
    });

    function updateStatus() {
      const n = num('B9') + num('C9');
      shell.setStatus('就绪 · 活动单元格 ' + active + ' · 合计 ' + Math.round(n).toLocaleString('zh-CN'));
      shell.setInfo('平均值 ' + (n ? Math.round(n / 2) : 0) + ' · 计数 10');
    }

    /* ---- 图表 ---- */
    function drawChart() {
      clear(chartCard);
      const c = h('canvas', { width: 360, height: 240 });
      chartCard.append(c);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 360, 240);
      g.fillStyle = '#333'; g.font = '600 12px ' + FONT;
      g.fillText('按区域销售额', 14, 20);
      const vals = [num('B4'), num('B5'), num('B6'), num('B7'), num('B8')];
      const names = ['北区', '南区', '东区', '西区', '中区'];
      const max = Math.max.apply(null, vals.concat([1]));
      const baseY = 200, hMax = 140;
      vals.forEach((v, i) => {
        const x = 34 + i * 62;
        const bh = v / max * hMax;
        g.fillStyle = ['#3b6fd8', '#4a9e6a', '#d08a4a', '#9a5ac0', '#c04a4a'][i];
        g.fillRect(x, baseY - bh, 40, bh);
        g.fillStyle = '#555'; g.font = '10px ' + FONT;
        g.fillText(names[i], x + 6, baseY + 14);
        g.fillText(String(Math.round(v / 1000)) + 'k', x + 8, baseY - bh - 5);
      });
      g.strokeStyle = '#ccc'; g.beginPath(); g.moveTo(20, baseY); g.lineTo(344, baseY); g.stroke();
    }
    function toggleChart() {
      chart = !chart;
      chartCard.style.display = chart ? 'block' : 'none';
      if (chart) drawChart();
      shell.setStatus(chart ? '已插入柱状图' : '图表已隐藏');
      scheduleSave();
    }

    function exportCsv() {
      const rows = [];
      for (let r = 1; r <= ROWS; r++) {
        const row = [];
        let any = false;
        for (let c = 0; c < COLS; c++) {
          const v = display(colName(c) + r);
          if (v) any = true;
          row.push(v);
        }
        if (any) rows.push(row);
      }
      download('gridcraft.csv', csvText(rows), 'text/csv;charset=utf-8');
      toastIn(shell.root, 'CSV 已导出');
    }

    const rb = ribbonBar([
      { id: 'home', label: '开始', groups: [
        { label: '剪贴板', items: [{ label: '粘贴', icon: 'save', onClick: () => shell.setStatus('粘贴：用 ⌘V') }] },
        { label: '字体', items: [
          { label: 'B', icon: 'bold', onClick: () => shell.setStatus('加粗由单元格样式控制') },
          { label: 'I', icon: 'italic', onClick: () => shell.setStatus('斜体由单元格样式控制') },
          { label: 'U', icon: 'underline', onClick: () => shell.setStatus('下划线由单元格样式控制') },
        ] },
        { label: '对齐', items: [
          { label: '左', icon: 'alignLeft', onClick: () => shell.setStatus('左对齐') },
          { label: '中', icon: 'alignCenter', onClick: () => shell.setStatus('居中') },
          { label: '右', icon: 'alignRight', onClick: () => shell.setStatus('右对齐') },
        ] },
        { label: '编辑', items: [
          { label: '求和', icon: 'plus', large: true, onClick: () => { cells[active] = '=SUM(B4:B8)'; inputMap[active].value = display(active); recalc(); scheduleSave(); } },
          { label: '清除', icon: 'trash', onClick: () => { cells[active] = ''; inputMap[active].value = ''; recalc(); scheduleSave(); } },
        ] },
      ] },
      { id: 'insert', label: '插入', groups: [
        { label: '图表', items: [
          { label: '柱状图', icon: 'chart', large: true, onClick: toggleChart },
        ] },
        { label: '表格', items: [{ label: '数据表', icon: 'table', onClick: () => shell.setStatus('当前区域 A1:D9') }] },
      ] },
      { id: 'formulas', label: '公式', groups: [
        { label: '函数库', items: [
          { label: 'SUM', icon: 'plus', large: true, onClick: () => { fx.value = '=SUM(B4:B8)'; fx.focus(); } },
          { label: 'AVERAGE', icon: 'chart', large: true, onClick: () => { fx.value = '=AVERAGE(B4:B8)'; fx.focus(); } },
          { label: 'MAX', icon: 'chart', onClick: () => { fx.value = '=MAX(B4:B8)'; fx.focus(); } },
        ] },
      ] },
      { id: 'data', label: '数据', groups: [
        { label: '导出', items: [{ label: 'CSV', icon: 'download', large: true, onClick: exportCsv }] },
      ] },
    ]);
    shell.sub.insertBefore(rb.el, formulaBar);

    shell.setMenus([
      { label: '文件', items: [
        { label: '保存到本机', onClick: persist },
        { label: '导出 CSV', shortcut: '⌘S', onClick: exportCsv },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '插入', items: [{ label: '柱状图', onClick: toggleChart }] },
      { label: '帮助', items: [{ label: '公式', onClick: () => toastIn(shell.root, '支持 SUM / AVERAGE / MIN / MAX / COUNT 与加减乘除') }] },
    ]);

    const scope = commandScope();
    scope.add('gridcraft.set', '设置单元格 {ref} {value}', (a) => {
      if (!a.ref) return;
      cells[a.ref] = a.value == null ? '' : String(a.value);
      if (inputMap[a.ref]) inputMap[a.ref].value = display(a.ref);
      recalc();
      scheduleSave();
    });
    scope.add('gridcraft.save', '保存工作表到本机', persist);
    scope.add('gridcraft.export', '导出 CSV', exportCsv);

    (function restore() {
      const saved = loadDoc('gridcraft');
      if (saved && saved.doc && applyDoc(saved.doc)) {
        if (saved.doc.chart) { chart = true; chartCard.style.display = 'block'; }
      }
    })();
    select(active && inputMap[active] ? active : 'A1');
    recalc();
    return { destroy() {
      if (saveTimer) { clearTimeout(saveTimer); persist(); }
      scope.dispose();
    } };
  },
});

/* ============================ Craft Anything：逆向工作台 ============================ */

craft({
  id: 'craft-anything', name: 'Craft Anything', up: 'craft-anything', group: 'docs', tag: '分析',
  blurb: '字节、函数、字符串与证据台账；粘贴十六进制即可分析。',
  hint: '粘贴 hex 或上传文件；右侧记录证据',
  mount(host) {
    const shell = craftShell(host, {
      name: 'Craft Anything', file: 'calculator', up: 'Craft Anything', tag: '分析',
      theme: 'dark', layout: 'workbench', search: '搜索函数或证据',
    });
    const files = h('aside', { class: 'ag-re-functions' });
    const center = h('div', { class: 'ag-re-center' });
    const right = h('aside', { class: 'ag-re-right' });
    shell.body.append(files, center, right);

    const tabs = h('div', { class: 'ag-re-tabs' });
    const code = h('div', { class: 'ag-re-code' });
    const agentBar = h('div', { class: 'ag-re-agent' });
    center.append(tabs, code, agentBar);

    let view = 'pseudo';
    let bytes = sampleBytes();
    let functions = [];
    let selected = 0;
    let entries = [];
    let log = [];

    // 一小段可分析的示例字节：里面埋了可读字符串，方便演示十六进制与字符串视图。
    function sampleBytes() {
      const text = 'percent_key_pressed display_value update_check http_get https://example.com/update';
      const arr = [];
      const ops = [0x55, 0x48, 0x89, 0xe5, 0x48, 0x83, 0xec, 0x20, 0x89, 0x7d, 0xfc, 0x8b, 0x45, 0xfc, 0x99, 0xb9, 0x64, 0x00, 0x00, 0x00, 0xf7, 0xf9, 0x89, 0x45, 0xf8, 0xc9, 0xc3];
      for (let i = 0; i < 160; i++) arr.push(ops[i % ops.length]);
      for (let i = 0; i < text.length; i++) arr.push(text.charCodeAt(i));
      return new Uint8Array(arr);
    }

    function hex(n) { return ('0' + n.toString(16)).slice(-2); }

    function parse() {
      functions = [];
      const fnCount = Math.max(1, Math.floor(bytes.length / 72));
      for (let i = 0; i < fnCount; i++) {
        const start = i * 72;
        const size = Math.min(72, bytes.length - start);
        functions.push({
          addr: '0x' + (0x401000 + i * 0x48).toString(16),
          name: i === 0 ? '_start' : 'sub_' + (0x401000 + i * 0x48).toString(16),
          size: size,
          offset: start,
        });
      }
      // 从字节里抽可读字符串
      const strs = [];
      let run = '';
      for (let i = 0; i < bytes.length; i++) {
        const ch = bytes[i];
        if (ch >= 32 && ch < 127) run += String.fromCharCode(ch);
        else {
          if (run.length >= 5) strs.push({ text: run, offset: i - run.length });
          run = '';
        }
      }
      if (run.length >= 5) strs.push({ text: run, offset: bytes.length - run.length });
      entries = [];
      if (strs.length) {
        entries.push({ title: '可读字符串 ' + strs.length, tag: '已查明', text: strs.slice(0, 6).map((s) => s.text).join(' · ') });
      }
      const urls = strs.filter((s) => /https?:\/\//.test(s.text));
      if (urls.length) entries.push({ title: '内嵌 URL', tag: '已查明', text: urls[0].text + '（偏移 0x' + urls[0].offset.toString(16) + '）' });
      entries.push({ title: '函数候选 ' + functions.length, tag: '推断', text: '按 72 字节切分的入口候选；仅用于导航，不代表真实函数边界。' });
      entries.push({ title: '字节熵', tag: '已查明', text: entropy().toFixed(2) + ' bits/byte · 共 ' + bytes.length + ' 字节' });
      entries.push({ title: '未知项', tag: '待查', text: '真实指令解码、重定位与符号表需要可执行文件格式解析；当前视图是启发式的。' });
    }

    function entropy() {
      const bins = new Array(256).fill(0);
      for (let i = 0; i < bytes.length; i++) bins[bytes[i]]++;
      let e = 0;
      for (let i = 0; i < 256; i++) {
        if (!bins[i]) continue;
        const p = bins[i] / bytes.length;
        e -= p * Math.log2(p);
      }
      return e;
    }

    function pseudo(fn) {
      const lines = [];
      lines.push('<span class="c">// 启发式伪代码 · ' + fn.addr + ' · ' + fn.size + ' 字节</span>');
      lines.push('<span class="k">void</span> ' + fn.name + '(<span class="k">void</span>) {');
      for (let i = 0; i < Math.min(fn.size, 48); i += 4) {
        const b = bytes[fn.offset + i] || 0;
        if (b % 7 === 0) lines.push('  var_' + (i / 4 | 0) + ' = mem[<span class="n">0x' + hex(b) + '</span>];');
        else if (b % 5 === 0) lines.push('  mem[<span class="n">0x' + hex(b) + '</span>] = var_' + ((i / 4 | 0) + 1) + ';');
        else if (b % 3 === 0) lines.push('  <span class="k">if</span> (var_' + (i / 4 | 0) + ' == <span class="n">0x' + hex(b) + '</span>) goto L' + (i / 4 | 0) + ';');
        else lines.push('  var_' + (i / 4 | 0) + ' += <span class="n">0x' + hex(b) + '</span>;');
      }
      lines.push('  <span class="k">return</span>;');
      lines.push('}');
      return lines.join('\n');
    }

    const MNEM = ['mov', 'add', 'sub', 'cmp', 'jmp', 'call', 'push', 'pop', 'ret', 'lea', 'test', 'xor'];
    function disasm(fn) {
      const out = [];
      out.push('<span class="c">; 启发式反汇编 · ' + fn.addr + '</span>');
      for (let i = 0; i < Math.min(fn.size, 40); i++) {
        const b = bytes[fn.offset + i] || 0;
        const m = MNEM[b % MNEM.length];
        out.push('<span class="n">' + (0x401000 + fn.offset + i).toString(16) + '</span>  ' + hex(b) + '  <span class="k">' + m + '</span>  ' +
          (m === 'jmp' || m === 'call' ? '0x' + (0x401000 + fn.offset + ((b % 32) + 2)).toString(16) : 'r' + (b % 16) + ', 0x' + hex(b)));
      }
      return out.join('\n');
    }

    function hexView() {
      const out = [];
      for (let i = 0; i < Math.min(bytes.length, 512); i += 16) {
        let line = '<span class="n">' + (0x401000 + i).toString(16) + '</span>  ';
        let ascii = '';
        for (let k = 0; k < 16; k++) {
          const b = bytes[i + k];
          if (b == null) { line += '   '; continue; }
          line += hex(b) + ' ';
          ascii += (b >= 32 && b < 127) ? String.fromCharCode(b) : '.';
        }
        line += ' <span class="s">' + ascii.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</span>';
        out.push(line);
      }
      return out.join('\n');
    }

    function graphView() {
      // 调用图：函数节点 + 根据字节里的地址低位建立边。
      const W = 760, H = 420;
      code.innerHTML = '<canvas width="' + W + '" height="' + H + '" style="background:#171717;display:block;width:100%;max-width:760px"></canvas>';
      const c = code.querySelector('canvas');
      const g = c.getContext('2d');
      g.fillStyle = '#171717'; g.fillRect(0, 0, W, H);
      const cols = Math.ceil(Math.sqrt(functions.length));
      const nodes = functions.slice(0, 24).map((f, i) => ({
        x: 70 + (i % cols) * (660 / Math.max(1, cols)), y: 50 + Math.floor(i / cols) * 74, f,
      }));
      g.strokeStyle = '#3f5d7a';
      nodes.forEach((n, i) => {
        if (i === 0) return;
        const p = nodes[Math.max(0, i - 1)];
        g.beginPath(); g.moveTo(p.x + 60, p.y + 16); g.lineTo(n.x, n.y + 16); g.stroke();
      });
      nodes.forEach((n, i) => {
        g.fillStyle = i === 0 ? '#26456b' : '#2b2b2b';
        g.fillRect(n.x, n.y, 120, 32);
        g.strokeStyle = i === 0 ? '#4a9eff' : '#4a4a4a';
        g.strokeRect(n.x + 0.5, n.y + 0.5, 119, 31);
        g.fillStyle = '#d6d6d6'; g.font = '9px "SF Mono", monospace';
        g.fillText(n.f.addr, n.x + 6, n.y + 13);
        g.fillStyle = '#9a9a9a';
        g.fillText(n.f.name.slice(0, 16), n.x + 6, n.y + 25);
      });
    }

    function renderCode() {
      if (!functions.length) { code.innerHTML = '<span class="c">// 没有输入。粘贴十六进制或上传二进制文件。</span>'; return; }
      const fn = functions[Math.min(selected, functions.length - 1)];
      if (view === 'graph') { graphView(); return; }
      if (view === 'hex') { code.innerHTML = hexView(); return; }
      code.innerHTML = view === 'disasm' ? disasm(fn) : pseudo(fn);
    }

    function renderFiles() {
      clear(files);
      files.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '函数'), h('span', { class: 'ag-panel-caret' }, functions.length + ' 项')));
      files.append(h('div', { style: 'padding:5px' },
        h('input', {
          type: 'search', placeholder: '过滤函数…', class: 'ag-search',
          style: 'width:100%;height:24px;font-size:10px',
          oninput(e) {
            const q = e.target.value.toLowerCase();
            const btns = files.querySelectorAll('.ag-re-fn');
            for (let i = 0; i < btns.length; i++) btns[i].style.display = btns[i].textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
          },
        })));
      const list = h('div', { class: 'ag-re-fnlist' });
      functions.forEach((f, i) => {
        list.append(h('button', {
          class: 'ag-re-fn' + (i === selected ? ' active' : ''), type: 'button',
          onclick() { selected = i; renderFiles(); renderCode(); shell.setStatus('函数 ' + f.name + ' · ' + f.addr); },
        }, h('span', {}, f.addr + '  ' + f.name), h('em', {}, String(f.size))));
      });
      files.append(list);
      files.append(h('div', { style: 'padding:6px' },
        h('button', { class: 'ag-btn', type: 'button', style: 'width:100%', onclick: upload }, '上传二进制…')));
    }

    function renderTabs() {
      clear(tabs);
      [['pseudo', 'Pseudo-C'], ['disasm', '反汇编'], ['hex', '十六进制'], ['graph', '调用图']].forEach(([id, label]) => {
        tabs.append(h('button', {
          class: 'ag-re-tab' + (view === id ? ' active' : ''), type: 'button',
          onclick() { view = id; renderTabs(); renderCode(); },
        }, label));
      });
      tabs.append(h('span', { class: 'ag-spacer' }));
      tabs.append(h('span', { style: 'font:9px var(--ag-mono);color:var(--ag-muted);padding:0 8px' }, '启发式视图'));
    }

    function renderRight() {
      clear(right);
      right.append(h('div', { class: 'ag-tabrow' },
        h('button', { class: 'ag-tab active', type: 'button' }, '证据台账'),
        h('button', { class: 'ag-tab', type: 'button', onclick: () => shell.setStatus('未知项在证据下方') }, '未知项')));
      const ev = h('div', { class: 'ag-re-evidence' });
      entries.forEach((e) => ev.append(h('div', { class: 'ag-re-card' },
        h('h4', {}, e.title, h('em', {}, e.tag)),
        h('p', {}, e.text))));
      right.append(ev);
      const lg = h('div', { class: 'ag-re-log' });
      log.slice(-6).forEach((l) => lg.append(h('div', {}, l)));
      right.append(lg);
    }

    const ask = h('input', { type: 'text', placeholder: '问点什么…例：哪里用了 http_get？' });
    agentBar.append(ask);
    ask.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = ask.value.trim();
      if (!q) return;
      ask.value = '';
      answer(q);
    });

    function answer(q) {
      const lower = q.toLowerCase();
      let reply = '';
      const found = functions.filter((f) => f.name.toLowerCase().indexOf(lower) >= 0)[0] || functions[0];
      if (/http|url|网络|请求/.test(lower)) {
        reply = '在字节偏移 0x' + Math.max(0, bytes.length - 48).toString(16) + ' 附近有 URL 字符串；它出现在函数 ' + functions[functions.length - 1].name + ' 的尾部。启发式判断：该函数可能负责更新检查。';
      } else if (/函数|function|入口/.test(lower)) {
        reply = '共切出 ' + functions.length + ' 个入口候选，首个为 ' + functions[0].name + '。真实边界需要解析可执行文件头与符号表。';
      } else if (found) {
        reply = found.name + ' @ ' + found.addr + ' 占 ' + found.size + ' 字节；在 Hex 视图可看到它的原始字节，在 Pseudo-C 视图可看到按字节生成的语句。';
      } else {
        reply = '当前工作台只分析已载入的字节。可以试试「字符串」「URL」或某个函数名。';
      }
      log.push('Q: ' + q);
      log.push('A: ' + reply);
      renderRight();
      shell.setStatus('已记录一条问答');
    }

    function upload() {
      pickFile('', (file) => {
        const r = new FileReader();
        r.onload = () => {
          bytes = new Uint8Array(r.result);
          parse(); selected = 0; renderFiles(); renderTabs(); renderCode(); renderRight();
          shell.setStatus('已载入 ' + file.name + ' · ' + bytes.length + ' 字节');
        };
        r.readAsArrayBuffer(file);
      });
    }

    function loadHex(text) {
      bytes = new Uint8Array(parseHex(text));
      parse(); selected = 0;
      renderFiles(); renderTabs(); renderCode(); renderRight();
      shell.setStatus('已载入 ' + bytes.length + ' 字节');
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '上传二进制…', onClick: upload },
        { label: '载入示例', onClick: () => { bytes = sampleBytes(); parse(); selected = 0; renderFiles(); renderTabs(); renderCode(); renderRight(); } },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '视图', items: [
        { label: 'Pseudo-C', onClick: () => { view = 'pseudo'; renderTabs(); renderCode(); } },
        { label: '反汇编', onClick: () => { view = 'disasm'; renderTabs(); renderCode(); } },
        { label: '十六进制', onClick: () => { view = 'hex'; renderTabs(); renderCode(); } },
        { label: '调用图', onClick: () => { view = 'graph'; renderTabs(); renderCode(); } },
      ] },
      { label: '帮助', items: [{ label: '分析边界', onClick: () => toastIn(shell.root, '这是启发式分析工作台，不做真实反编译；结论标了「已查明 / 推断 / 待查」') }] },
    ]);

    const scope = commandScope();
    scope.add('craft-anything.loadHex', '载入十六进制 {hex}', (a) => loadHex(a.hex || ''));
    scope.add('craft-anything.ask', '提问 {q}', (a) => answer(a.q || '字符串'));

    parse();
    renderFiles();
    renderTabs();
    renderCode();
    renderRight();
    return { destroy() { scope.dispose(); } };
  },
});
