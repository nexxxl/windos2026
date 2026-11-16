// 矢量与版面族：VectorCraft（矢量）、CADCraft（工程图）、
// DesignCraft（版面）、FigCraft（界面原型）、DeckCraft（幻灯片）。
// 界面参照的工作流类型见 docs/artcraftport/ATTRIBUTION.md。
import {
  h, clear, craft, craftShell, createCanvas, saveCanvas, pickImage, pickFile, readFileText, download,
  icon, iconButton, panel, sectionLabel, sliderRow, colorRow, colorField,
  numberField, selectField, textField, toastIn, commandScope, clamp, uid,
} from './kernel.js';
import { drawGradient } from './engine/gradient.js';
import { smoothPath, pathToD } from './engine/curve.js';
import { loadDoc, saveDoc, parseDoc } from './engine/doc.js';
import { svgDocument, dxfDocument, projectJson } from './export.js';

const FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

function makeCanvas(host, w, h, cls) {
  return h('canvas', { class: cls || 'ag-canvas', width: w, height: h });
}

function hexToRgb(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}

/* ============================ VectorCraft：矢量 ============================ */

craft({
  id: 'vectorcraft', name: 'VectorCraft', up: '矢量 · 路径', group: 'vector', tag: '矢量',
  blurb: '矩形、椭圆、自由笔与文字，拖动排列，导出 SVG / PNG。',
  hint: 'V 选择 · M 矩形 · L 椭圆 · P 钢笔 · T 文字',
  mount(host) {
    const shell = craftShell(host, {
      name: 'VectorCraft', file: '未命名-1.ai', up: '矢量 · 路径', tag: 'RGB',
      theme: 'dark', layout: 'illustrator',
    });
    const W = 900, H = 620;
    const cols = h('div', { class: 'ag-ai-cols' });
    const rail = h('aside', { class: 'ag-rail wide' });
    const center = h('div', { class: 'ag-canvas-center' });
    const ws = h('div', { class: 'ag-workspace' });
    const right = h('aside', { class: 'ag-right-panels' });
    center.append(ws);
    cols.append(rail, center, right);
    shell.body.append(cols);

    // 文档标签
    shell.sub.append(h('div', { class: 'ag-doctabs' },
      h('button', { class: 'ag-doctab active', type: 'button' }, '未命名-1.ai @ 100% (RGB)'),
      h('button', { class: 'ag-doctab', type: 'button', onclick: () => shell.setStatus('单文档工作区') }, '+')));

    const view = createCanvas(ws, W, H);
    const ctx = view.ctx;
    const objects = [];
    const past = [];
    let selected = -1;
    let tool = 'select';
    let dragging = null;

    // 工程存档：对象数组是纯数据；图片只保存 data: URL，外部 URL 无法离线还原。
    let saveTimer = 0;
    function persist() {
      saveTimer = 0;
      saveDoc('vectorcraft', {
        objects: objects.map((o) => {
          const copy = {};
          Object.keys(o).forEach((k) => { if (k !== 'img') copy[k] = o[k]; });
          if (o.type === 'image' && o.img && /^data:image\//.test(o.img.src || '')) copy.src = o.img.src;
          return copy;
        }),
        selected: selected,
      });
    }
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 600);
    }
    function applyDoc(doc) {
      if (!doc || !Array.isArray(doc.objects)) return false;
      objects.length = 0;
      doc.objects.forEach((raw) => {
        if (!raw || typeof raw.type !== 'string' || !isFinite(raw.x) || !isFinite(raw.y)) return;
        const o = {};
        Object.keys(raw).forEach((k) => { o[k] = raw[k]; });
        if (o.type === 'image') {
          o.img = null;
          if (typeof o.src === 'string' && /^data:image\//.test(o.src)) {
            const img = new Image();
            img.onload = () => paint();
            img.src = o.src;
            o.img = img;
          }
        }
        objects.push(o);
      });
      selected = -1;
      return true;
    }

    function pushHistory() {
      past.push(objects.map((o) => {
        const copy = {};
        Object.keys(o).forEach((k) => { if (k !== 'img') copy[k] = o[k]; });
        if (o.points) copy.points = o.points.map((p) => ({ x: p.x, y: p.y }));
        return copy;
      }));
      if (past.length > 30) past.shift();
    }

    const TOOLS = [
      { group: '选择', items: [{ id: 'select', icon: 'cursor', label: '选择 V' }, { id: 'direct', icon: 'pen', label: '直接选择 A' }] },
      { group: '形状', items: [{ id: 'rect', icon: 'square', label: '矩形 M' }, { id: 'ellipse', icon: 'circle', label: '椭圆 L' }, { id: 'line', icon: 'line', label: '直线 \\' }] },
      { group: '绘制', items: [{ id: 'pen', icon: 'pen', label: '钢笔 P' }, { id: 'text', icon: 'text', label: '文字 T' }] },
    ];
    const toolBtns = {};
    TOOLS.forEach((g) => {
      const wrap = h('div', { class: 'ag-rail-group' }, h('div', { class: 'ag-rail-title' }, g.group));
      const grid = h('div', { class: 'ag-rail-grid' });
      g.items.forEach((t) => {
        toolBtns[t.id] = iconButton(t.icon, t.label, () => setTool(t.id), { size: 17 });
        grid.append(toolBtns[t.id]);
      });
      wrap.append(grid);
      rail.append(wrap);
    });
    rail.append(h('div', { class: 'ag-rail-group' },
      h('div', { class: 'ag-rail-grid' },
        iconButton('image', '置入图片', importImage, { size: 17 }),
        iconButton('download', '导出 SVG', exportSvg, { size: 17 }))));

    const floatBar = h('div', { class: 'ag-float-toolbar', hidden: true });
    ws.append(floatBar);
    const FL = [
      { icon: 'undo', title: '撤销', fn: undo },
      { icon: 'trash', title: '删除', fn: remove },
      { sep: true },
      { icon: 'square', title: '置顶', fn: () => arrange(1) },
      { icon: 'square', title: '置底', fn: () => arrange(-1) },
      { sep: true },
      { icon: 'alignLeft', title: '左对齐', fn: () => align('left') },
      { icon: 'alignCenter', title: '居中', fn: () => align('center') },
      { icon: 'alignRight', title: '右对齐', fn: () => align('right') },
    ];
    FL.forEach((b) => {
      if (b.sep) floatBar.append(h('span', { class: 'ag-float-sep' }));
      else floatBar.append(iconButton(b.icon, b.title, b.fn, { size: 15 }));
    });

    function setTool(id) {
      tool = id;
      Object.keys(toolBtns).forEach((k) => toolBtns[k].classList.toggle('active', k === id));
      ws.style.cursor = id === 'select' ? 'default' : 'crosshair';
      shell.setStatus('工具：' + id);
    }

    function drawObject(o) {
      ctx.save();
      ctx.globalAlpha = o.opacity == null ? 1 : o.opacity;
      if (o.type === 'rect') {
        ctx.fillStyle = o.fill;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        if (o.stroke && o.strokeWidth) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeWidth; ctx.strokeRect(o.x, o.y, o.w, o.h); }
      } else if (o.type === 'ellipse') {
        ctx.fillStyle = o.fill;
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.abs(o.w / 2), Math.abs(o.h / 2), 0, 0, Math.PI * 2);
        ctx.fill();
        if (o.stroke && o.strokeWidth) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeWidth; ctx.stroke(); }
      } else if (o.type === 'line') {
        ctx.strokeStyle = o.stroke || o.fill;
        ctx.lineWidth = o.strokeWidth || 2;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + o.w, o.y + o.h); ctx.stroke();
      } else if (o.type === 'path') {
        ctx.strokeStyle = o.stroke || '#1c1917';
        ctx.lineWidth = o.strokeWidth || 2;
        // 自由笔采样点先转三次贝塞尔，避免折线感；SVG 导出用同一组控制点。
        const curve = smoothPath(o.points || [], 1);
        ctx.beginPath();
        ctx.moveTo(curve.start.x, curve.start.y);
        curve.segments.forEach((s) => ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p.x, s.p.y));
        ctx.stroke();
      } else if (o.type === 'text') {
        ctx.fillStyle = o.fill;
        ctx.font = (o.weight || 500) + ' ' + (o.size || 36) + 'px ' + FONT;
        ctx.textBaseline = 'top';
        String(o.text || '').split('\n').forEach((line, i) => ctx.fillText(line, o.x, o.y + i * (o.size || 36) * 1.3));
      } else if (o.type === 'image') {
        // 存档恢复的图片异步加载；未完成时跳过，避免 drawImage 抛错。
        if (o.img && o.img.complete && o.img.naturalWidth !== 0) ctx.drawImage(o.img, o.x, o.y, o.w, o.h);
      }
      ctx.restore();
    }

    function bounds(o) {
      if (o.type === 'text') {
        ctx.save();
        ctx.font = (o.weight || 500) + ' ' + (o.size || 36) + 'px ' + FONT;
        let w = 0;
        String(o.text || '').split('\n').forEach((line) => { w = Math.max(w, ctx.measureText(line).width); });
        ctx.restore();
        return { x: o.x, y: o.y, w: Math.max(24, w), h: String(o.text || '').split('\n').length * (o.size || 36) * 1.3 };
      }
      if (o.type === 'path') {
        const pts = o.points || [];
        if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
        let x0 = pts[0].x, y0 = pts[0].y, x1 = x0, y1 = y0;
        pts.forEach((p) => {
          if (p.x < x0) x0 = p.x;
          if (p.x > x1) x1 = p.x;
          if (p.y < y0) y0 = p.y;
          if (p.y > y1) y1 = p.y;
        });
        const pad = (o.strokeWidth || 2) / 2;
        return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
      }
      return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) };
    }

    function paint() {
      view.clear('#ffffff');
      objects.forEach(drawObject);
      const o = objects[selected];
      if (o) {
        const b = bounds(o);
        ctx.save();
        ctx.strokeStyle = '#4a9eff'; ctx.lineWidth = 1;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#4a9eff';
        [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].forEach((p) => ctx.fillRect(p[0] - 3, p[1] - 3, 6, 6));
        ctx.restore();
      }
      floatBar.hidden = !o;
      shell.setStatus(objects.length + ' 对象 · ' + (o ? '已选 ' + (selected + 1) : '未选中') + ' · ' + W + '×' + H);
      shell.setInfo('RGB/8 · ' + W + ' × ' + H + ' px');
      syncHint();
      scheduleSave();
    }

    let hint = null;
    function syncHint() {
      if (objects.length) { if (hint) { hint.remove(); hint = null; } return; }
      if (hint) return;
      hint = h('div', { class: 'ag-stage-hint' },
        h('div', { class: 'ag-stage-hint-card' },
          h('div', { class: 'ag-stage-hint-eyebrow' }, '快速开始'),
          h('h3', { class: 'ag-stage-hint-title' }, '画第一块图形'),
          h('p', { class: 'ag-stage-hint-text' }, '拖出矩形或椭圆，也可以直接写字。选中后底部浮动条可以复制、置顶、对齐。'),
          h('div', { class: 'ag-stage-hint-actions' },
            h('button', { class: 'ag-btn primary', type: 'button', onclick: () => addShape('rect') }, '矩形'),
            h('button', { class: 'ag-btn', type: 'button', onclick: () => addShape('ellipse') }, '椭圆'),
            h('button', { class: 'ag-btn', type: 'button', onclick: () => addText('Pathfinder') }, '文字'))));
      ws.append(hint);
    }

    function addShape(type) {
      pushHistory();
      const o = {
        id: uid(), type, x: W / 2 - 120, y: H / 2 - 80, w: 240, h: 160,
        fill: type === 'ellipse' ? '#7c3aed' : '#f2b544', stroke: '#1c1917', strokeWidth: 0, opacity: 1,
      };
      objects.push(o); selected = objects.length - 1;
      paint(); renderRight();
    }
    function addText(t) {
      pushHistory();
      const o = { id: uid(), type: 'text', text: t || '文字', x: 120, y: 140, size: 48, fill: '#1c1917', opacity: 1 };
      objects.push(o); selected = objects.length - 1;
      paint(); renderRight();
    }
    function remove() {
      if (selected < 0) return;
      pushHistory();
      objects.splice(selected, 1);
      selected = Math.min(selected, objects.length - 1);
      paint(); renderRight();
    }
    function duplicate() {
      const o = objects[selected];
      if (!o) return;
      pushHistory();
      const copy = {};
      Object.keys(o).forEach((k) => { if (k !== 'img') copy[k] = o[k]; });
      copy.id = uid(); copy.x = o.x + 20; copy.y = o.y + 20;
      if (o.points) copy.points = o.points.map((p) => ({ x: p.x + 20, y: p.y + 20 }));
      objects.push(copy);
      selected = objects.length - 1;
      paint(); renderRight();
    }
    function arrange(dir) {
      if (selected < 0) return;
      pushHistory();
      const item = objects.splice(selected, 1)[0];
      if (dir > 0) objects.push(item); else objects.unshift(item);
      selected = dir > 0 ? objects.length - 1 : 0;
      paint(); renderRight();
    }
    function align(mode) {
      const o = objects[selected];
      if (!o) return;
      const b = bounds(o);
      if (mode === 'left') o.x = 40;
      if (mode === 'center') o.x = Math.round((W - b.w) / 2);
      if (mode === 'right') o.x = W - b.w - 40;
      paint(); renderRight();
    }
    function undo() {
      if (!past.length) return toastIn(shell.root, '没有可撤销的操作');
      const snap = past.pop();
      objects.length = 0;
      snap.forEach((o) => objects.push(o));
      selected = Math.min(selected, objects.length - 1);
      paint(); renderRight();
    }

    function hit(p) {
      for (let i = objects.length - 1; i >= 0; i--) {
        const b = bounds(objects[i]);
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return i;
      }
      return -1;
    }

    view.onDrag((p) => {
      if (tool === 'rect' || tool === 'ellipse' || tool === 'line') {
        pushHistory();
        const o = {
          id: uid(), type: tool, x: p.x, y: p.y, w: 0, h: 0,
          fill: tool === 'line' ? 'none' : (tool === 'ellipse' ? '#7c3aed' : '#f2b544'),
          stroke: '#1c1917', strokeWidth: tool === 'line' ? 3 : 0, opacity: 1,
        };
        objects.push(o); selected = objects.length - 1;
        dragging = { mode: 'create', o, sx: p.x, sy: p.y };
        return dragging;
      }
      if (tool === 'pen') {
        pushHistory();
        const o = { id: uid(), type: 'path', points: [{ x: p.x, y: p.y }], stroke: '#1c1917', strokeWidth: 3, opacity: 1 };
        objects.push(o); selected = objects.length - 1;
        dragging = { mode: 'pen', o };
        return dragging;
      }
      if (tool === 'text') { addText('文字'); return false; }
      const i = hit(p);
      selected = i;
      paint(); renderRight();
      if (i < 0) { dragging = null; return false; }
      pushHistory();
      const b = bounds(objects[i]);
      const near = objects[i].type !== 'path' && p.x > b.x + b.w - 10 && p.y > b.y + b.h - 10;
      dragging = {
        mode: near ? 'resize' : 'move', o: objects[i], sx: p.x, sy: p.y, ox: b.x, oy: b.y, ow: b.w, oh: b.h,
        // 路径没有 x/y，拖动时按采样点整体平移，松手后仍是一份干净的 points 数组。
        pts: objects[i].type === 'path' ? objects[i].points.map((q) => ({ x: q.x, y: q.y })) : null,
      };
      return dragging;
    }, (p) => {
      if (!dragging) return;
      const o = dragging.o;
      if (dragging.mode === 'create') {
        o.x = Math.min(dragging.sx, p.x); o.y = Math.min(dragging.sy, p.y);
        o.w = Math.abs(p.x - dragging.sx); o.h = Math.abs(p.y - dragging.sy);
        if (o.type === 'line') { o.x = dragging.sx; o.y = dragging.sy; o.w = p.x - dragging.sx; o.h = p.y - dragging.sy; }
      } else if (dragging.mode === 'pen') {
        o.points.push({ x: p.x, y: p.y });
      } else if (dragging.mode === 'move') {
        if (o.type === 'path') {
          const dx = p.x - dragging.sx, dy = p.y - dragging.sy;
          o.points = dragging.pts.map((q) => ({ x: q.x + dx, y: q.y + dy }));
        } else {
          o.x = dragging.ox + (p.x - dragging.sx);
          o.y = dragging.oy + (p.y - dragging.sy);
        }
      } else if (dragging.mode === 'resize') {
        o.x = dragging.ox; o.y = dragging.oy;
        o.w = Math.max(6, p.x - dragging.ox);
        o.h = Math.max(6, p.y - dragging.oy);
      }
      paint();
    }, () => { dragging = null; renderRight(); });

    function importImage() {
      pickImage((img) => {
        if (!img) return;
        const w = Math.min(420, img.width);
        objects.push({ id: uid(), type: 'image', img, x: 120, y: 100, w, h: w * img.height / img.width, opacity: 1 });
        selected = objects.length - 1;
        paint(); renderRight();
      });
    }

    function svgText() {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      const body = objects.map((o) => {
        if (o.type === 'rect') return '<rect x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + o.h + '" fill="' + o.fill + '"/>';
        if (o.type === 'ellipse') return '<ellipse cx="' + (o.x + o.w / 2) + '" cy="' + (o.y + o.h / 2) + '" rx="' + Math.abs(o.w / 2) + '" ry="' + Math.abs(o.h / 2) + '" fill="' + o.fill + '"/>';
        if (o.type === 'line') return '<line x1="' + o.x + '" y1="' + o.y + '" x2="' + (o.x + o.w) + '" y2="' + (o.y + o.h) + '" stroke="' + (o.stroke || o.fill) + '" stroke-width="' + (o.strokeWidth || 2) + '"/>';
        if (o.type === 'path') return '<path d="' + pathToD(o.points || [], 1) + '" fill="none" stroke="' + o.stroke + '" stroke-width="' + o.strokeWidth + '"/>';
        if (o.type === 'text') {
          const lines = String(o.text || '').split('\n');
          return '<text x="' + o.x + '" y="' + (o.y + (o.size || 36)) + '" font-size="' + (o.size || 36) + '" fill="' + o.fill + '">'
            + lines.map((l, i) => '<tspan x="' + o.x + '" dy="' + (i ? (o.size || 36) * 1.3 : 0) + '">' + esc(l) + '</tspan>').join('')
            + '</text>';
        }
        if (o.type === 'image' && o.img) return '<image x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + o.h + '" href="' + o.img.src + '"/>';
        return '';
      }).join('\n');
      return svgDocument(W, H, body);
    }
    function exportSvg() {
      download('vectorcraft.svg', svgText(), 'image/svg+xml');
      toastIn(shell.root, 'SVG 已导出');
    }
    function exportPng() {
      const prev = selected;
      selected = -1;            // 导出时去掉选框与手柄
      paint();
      saveCanvas(view.canvas, 'vectorcraft.png');
      selected = prev;
      paint();
      toastIn(shell.root, 'PNG 已导出');
    }

    function renderRight() {
      clear(right);
      const tabs = h('div', { class: 'ag-tabrow' },
        h('button', { class: 'ag-tab active', type: 'button' }, '属性'),
        h('button', { class: 'ag-tab', type: 'button', onclick: () => shell.setStatus('图层面板在下方') }, '图层'));
      right.append(tabs);
      const body = h('div', { class: 'ag-panel-body' });
      const o = objects[selected];
      if (o) {
        body.append(sectionLabel(o.type.toUpperCase()));
        const bw = h('div', { class: 'ag-frow' },
          h('span', { class: 'ag-frow-label' }, '位置'),
          h('input', { type: 'number', value: Math.round(o.x), style: 'width:64px;margin-right:4px', onchange(e) { o.x = Number(e.target.value); paint(); } }),
          h('input', { type: 'number', value: Math.round(o.y), style: 'width:64px', onchange(e) { o.y = Number(e.target.value); paint(); } }));
        body.append(bw);
        if (o.type !== 'line' && o.type !== 'path' && o.type !== 'text') {
          body.append(h('div', { class: 'ag-frow' },
            h('span', { class: 'ag-frow-label' }, '尺寸'),
            h('input', { type: 'number', value: Math.round(o.w), style: 'width:64px;margin-right:4px', onchange(e) { o.w = Number(e.target.value); paint(); } }),
            h('input', { type: 'number', value: Math.round(o.h), style: 'width:64px', onchange(e) { o.h = Number(e.target.value); paint(); } })));
        }
        if (o.type === 'text') {
          body.append(textField('内容', o.text, (v) => { o.text = v; paint(); }, { multiline: true, rows: 3 }));
          body.append(numberField('字号', o.size || 36, { min: 8, max: 300, onInput: (v) => { o.size = clamp(v, 8, 300); paint(); } }));
        }
        if (o.type !== 'image') body.append(colorRow('填充', o.fill === 'none' ? '#000000' : o.fill, (v) => { o.fill = v; paint(); }));
        if (o.type === 'rect' || o.type === 'ellipse' || o.type === 'line' || o.type === 'path') {
          body.append(colorRow('描边', o.stroke || '#000000', (v) => { o.stroke = v; paint(); }));
          body.append(sliderRow('描边宽度', 0, 20, 1, o.strokeWidth || 0, (v) => v + ' pt', (v) => { o.strokeWidth = v; paint(); }));
        }
        body.append(sliderRow('不透明度', 0, 1, 0.01, o.opacity == null ? 1 : o.opacity, (v) => Math.round(v * 100) + '%', (v) => { o.opacity = v; paint(); }));
        body.append(h('div', { class: 'ag-row' },
          h('button', { class: 'ag-btn', type: 'button', onclick: duplicate }, '复制'),
          h('button', { class: 'ag-btn danger', type: 'button', onclick: remove }, '删除')));
      } else {
        body.append(h('p', { class: 'ag-hint' }, '选择对象后显示变换与外观。'));
      }
      right.append(body);

      // 图层
      const lp = h('div', { style: 'border-top:1px solid var(--ag-line);flex:1 1 auto;overflow-y:auto' },
        h('div', { class: 'ag-panel-head' }, h('span', {}, '图层'), h('span', { class: 'ag-panel-caret' }, objects.length + '')),
        h('div', { class: 'ag-panel-body' }, objects.map((ob, i) => h('button', {
          class: 'ag-list-item' + (i === selected ? ' active' : ''),
          type: 'button', onclick: () => { selected = i; paint(); renderRight(); },
        }, h('span', { class: 'ag-list-name' }, (ob.type === 'text' ? ob.text : ob.type) + ' ' + (i + 1)),
        h('span', { class: 'ag-list-meta' }, Math.round((ob.opacity == null ? 1 : ob.opacity) * 100) + '%')))));
      right.append(lp);
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '保存到本机', onClick: persist },
        { label: '置入图片…', onClick: importImage },
        { label: '导出 SVG', shortcut: '⌘S', onClick: exportSvg },
        { label: '导出 PNG', onClick: exportPng },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '对象', items: [
        { label: '复制', shortcut: '⌘D', disabled: selected < 0, onClick: duplicate },
        { label: '删除', shortcut: 'Del', disabled: selected < 0, onClick: remove },
        { sep: true },
        { label: '置顶', disabled: selected < 0, onClick: () => arrange(1) },
        { label: '置底', disabled: selected < 0, onClick: () => arrange(-1) },
      ] },
      { label: '文字', items: [
        { label: '添加文字', onClick: () => addText('Pathfinder · exact booleans') },
      ] },
      { label: '帮助', items: [{ label: '快捷键', onClick: () => toastIn(shell.root, 'V 选择 · M 矩形 · L 椭圆 · P 钢笔 · T 文字') }] },
    ]);

    const scope = commandScope();
    scope.add('vectorcraft.addRect', '添加矩形', () => addShape('rect'));
    scope.add('vectorcraft.addText', '添加文字 {text}', (a) => addText(a.text || 'artcraftport'));
    scope.add('vectorcraft.save', '保存画板到本机', persist);
    scope.add('vectorcraft.export', '导出 SVG', exportSvg);

    function onKey(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selected >= 0) { e.preventDefault(); remove(); } return; }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
      const map = { v: 'select', m: 'rect', l: 'ellipse', p: 'pen', t: 'text' };
      if (!mod && map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
    }
    document.addEventListener('keydown', onKey);

    (function restore() {
      const saved = loadDoc('vectorcraft');
      if (saved && saved.doc) applyDoc(saved.doc);
    })();
    setTool('select');
    paint();
    renderRight();
    return { destroy() {
      if (saveTimer) { clearTimeout(saveTimer); persist(); }
      document.removeEventListener('keydown', onKey);
      scope.dispose();
    } };
  },
});

/* ============================ CADCraft：工程图 ============================ */

craft({
  id: 'cadcraft', name: 'CADCraft', up: '图纸 · 尺寸', group: 'vector', tag: 'DWG',
  blurb: '毫米网格、捕捉、直线/圆/矩形与命令行，导出 DXF。',
  hint: '命令行输入 LINE / CIRCLE / RECT，回车执行',
  mount(host) {
    const shell = craftShell(host, {
      name: 'CADCraft', file: 'Drawing1.dwg', up: '图纸 · 尺寸', tag: '2D 线框',
      theme: 'dark', layout: 'autocad',
    });
    const W = 980, H = 660, SCALE = 2; // 1mm = 2px
    const palettes = h('aside', { class: 'ag-acad-palettes' });
    const center = h('div', { class: 'ag-canvas-center' });
    const ws = h('div', { class: 'ag-workspace', style: 'cursor:crosshair' });
    const props = h('aside', { class: 'ag-acad-props' });
    center.append(ws);
    shell.body.append(palettes, center, props);

    const view = createCanvas(ws, W, H);
    const ctx = view.ctx;
    view.canvas.style.background = '#212428';
    const objects = [];
    let selected = -1;
    let tool = 'select';
    let snap = true;
    let cursor = { x: 0, y: 0 };
    let pending = null;

    // 图纸存档：CAD 实体都是纯数据，整表落盘；保存只写模型，不存光标/拖拽。
    let saveTimer = 0;
    function persist() {
      saveTimer = 0;
      saveDoc('cadcraft', { objects: objects, snap: snap });
    }
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 600);
    }
    function applyDoc(doc) {
      if (!doc || !Array.isArray(doc.objects)) return false;
      objects.length = 0;
      doc.objects.forEach((raw) => {
        if (!raw || typeof raw.type !== 'string') return;
        const copy = {};
        Object.keys(raw).forEach((k) => { copy[k] = raw[k]; });
        objects.push(copy);
      });
      if (typeof doc.snap === 'boolean') snap = doc.snap;
      selected = -1;
      return true;
    }

    const GROUPS = [
      { name: '绘图', items: [
        { id: 'line', icon: 'line', label: '直线' }, { id: 'pline', icon: 'pen', label: '多段线' },
        { id: 'circle', icon: 'circle', label: '圆' }, { id: 'rect', icon: 'square', label: '矩形' },
        { id: 'arc', icon: 'redo', label: '圆弧' }, { id: 'text', icon: 'text', label: '文字' },
      ] },
      { name: '修改', items: [
        { id: 'move', icon: 'cursor', label: '移动' }, { id: 'copy', icon: 'layers', label: '复制' },
        { id: 'erase', icon: 'trash', label: '删除' }, { id: 'offset', icon: 'square', label: '偏移' },
      ] },
      { name: '注释', items: [
        { id: 'dim', icon: 'alignLeft', label: '线性标注' }, { id: 'leader', icon: 'link', label: '引线' },
      ] },
    ];
    const palBtns = {};
    GROUPS.forEach((g) => {
      const wrap = h('div', { class: 'ag-pal-group' });
      wrap.append(h('div', { class: 'ag-pal-group-head' }, h('span', {}, g.name), h('span', {}, '−')));
      const grid = h('div', { class: 'ag-pal-grid' });
      g.items.forEach((it) => {
        palBtns[it.id] = h('button', { class: 'ag-pal-btn', type: 'button', title: it.label, onclick: () => startTool(it.id) }, icon(it.icon, 17));
        grid.append(palBtns[it.id]);
      });
      wrap.append(grid);
      palettes.append(wrap);
    });

    function startTool(id) {
      tool = id;
      Object.keys(palBtns).forEach((k) => palBtns[k].classList.toggle('active', k === id));
      pending = (id === 'line' || id === 'pline' || id === 'rect' || id === 'circle' || id === 'dim' || id === 'leader')
        ? { start: null, pts: [] } : null;
      const hints = {
        line: '指定第一点', pline: '指定起点，双击结束', rect: '指定第一个角点',
        circle: '指定圆心', dim: '指定标注第一点', leader: '指定引线起点',
        move: '选择要移动的对象', copy: '选择要复制的对象', offset: '选择要偏移的对象',
      };
      shell.setStatus('命令：' + id.toUpperCase() + ' · ' + (hints[id] || '选择对象'));
      if (id === 'erase') { remove(); tool = 'select'; }
    }

    function snapPt(p) {
      const mm = { x: p.x / SCALE, y: p.y / SCALE };
      if (!snap) return mm;
      return { x: Math.round(mm.x / 5) * 5, y: Math.round(mm.y / 5) * 5 };
    }

    function drawGrid() {
      const g = ctx;
      g.fillStyle = '#212428';
      g.fillRect(0, 0, W, H);
      if (snap) {
        g.strokeStyle = 'rgba(255,255,255,.05)';
        g.lineWidth = 1;
        for (let x = 0; x <= W; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
        for (let y = 0; y <= H; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      }
      g.strokeStyle = 'rgba(255,255,255,.13)';
      for (let x = 0; x <= W; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y <= H; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    }

    // UCS 图标
    function drawUcs() {
      ctx.strokeStyle = '#9fb3c8';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(18, H - 18); ctx.lineTo(58, H - 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, H - 18); ctx.lineTo(18, H - 58); ctx.stroke();
      ctx.fillStyle = '#9fb3c8';
      ctx.font = '9px "SF Mono", monospace';
      ctx.fillText('X', 62, H - 15);
      ctx.fillText('Y', 13, H - 62);
    }

    function drawObject(o, ghost) {
      ctx.save();
      ctx.strokeStyle = ghost ? '#6f8b63' : (o.color || '#e6e6e6');
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.4;
      if (o.type === 'line') {
        ctx.beginPath(); ctx.moveTo(o.x1 * SCALE, o.y1 * SCALE); ctx.lineTo(o.x2 * SCALE, o.y2 * SCALE); ctx.stroke();
      } else if (o.type === 'poly') {
        ctx.beginPath();
        (o.pts || []).forEach((p, i) => { if (i === 0) ctx.moveTo(p.x * SCALE, p.y * SCALE); else ctx.lineTo(p.x * SCALE, p.y * SCALE); });
        ctx.stroke();
      } else if (o.type === 'circle') {
        ctx.beginPath(); ctx.arc(o.cx * SCALE, o.cy * SCALE, o.r * SCALE, 0, Math.PI * 2); ctx.stroke();
      } else if (o.type === 'rect') {
        ctx.strokeRect(o.x * SCALE, o.y * SCALE, o.w * SCALE, o.h * SCALE);
      } else if (o.type === 'text') {
        ctx.font = '12px "SF Mono", monospace';
        ctx.fillText(o.text, o.x * SCALE, o.y * SCALE);
      } else if (o.type === 'dim') {
        const x1 = o.x1 * SCALE, y1 = o.y1 * SCALE, x2 = o.x2 * SCALE, y2 = o.y2 * SCALE;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        // 端点斜杠：AutoCAD 线性标注的拾取记号
        const nx = -(y2 - y1), ny = x2 - x1;
        const nl = Math.sqrt(nx * nx + ny * ny) || 1;
        const ux = nx / nl * 5, uy = ny / nl * 5;
        ctx.beginPath();
        ctx.moveTo(x1 - ux, y1 - uy); ctx.lineTo(x1 + ux, y1 + uy);
        ctx.moveTo(x2 - ux, y2 - uy); ctx.lineTo(x2 + ux, y2 + uy);
        ctx.stroke();
        const mm = Math.sqrt(Math.pow(o.x2 - o.x1, 2) + Math.pow(o.y2 - o.y1, 2));
        ctx.fillStyle = '#9fb3c8';
        ctx.font = '11px "SF Mono", monospace';
        ctx.fillText(mm.toFixed(1) + ' mm', (x1 + x2) / 2 + 4, (y1 + y2) / 2 - 4);
      } else if (o.type === 'leader') {
        const x1 = o.x1 * SCALE, y1 = o.y1 * SCALE, x2 = o.x2 * SCALE, y2 = o.y2 * SCALE;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2 + 40, y2); ctx.stroke();
        ctx.fillStyle = '#9fb3c8';
        ctx.font = '10px "SF Mono", monospace';
        ctx.fillText(o.text || 'NOTE', x2 + 44, y2 + 4);
      }
      ctx.restore();
    }

    function paint() {
      drawGrid();
      objects.forEach((o) => drawObject(o));
      // 已经落下的第一点
      if (pending && pending.start) {
        ctx.fillStyle = '#f0c060';
        ctx.fillRect(pending.start.x * SCALE - 3, pending.start.y * SCALE - 3, 6, 6);
        if (pending.pts.length) {
          ctx.strokeStyle = '#8fae7a';
          ctx.beginPath();
          ctx.moveTo(pending.start.x * SCALE, pending.start.y * SCALE);
          pending.pts.forEach((p) => ctx.lineTo(p.x * SCALE, p.y * SCALE));
          ctx.lineTo(cursor.x * SCALE, cursor.y * SCALE);
          ctx.stroke();
        }
      }
      const o = objects[selected];
      if (o) {
        ctx.save();
        ctx.strokeStyle = '#4a9eff';
        ctx.setLineDash([4, 3]);
        const b = objBounds(o);
        ctx.strokeRect(b.x * SCALE - 4, b.y * SCALE - 4, b.w * SCALE + 8, b.h * SCALE + 8);
        ctx.restore();
      }
      drawUcs();
      // 十字光标
      ctx.save();
      ctx.strokeStyle = 'rgba(220,230,240,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cursor.x * SCALE - 14, cursor.y * SCALE); ctx.lineTo(cursor.x * SCALE + 14, cursor.y * SCALE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cursor.x * SCALE, cursor.y * SCALE - 14); ctx.lineTo(cursor.x * SCALE, cursor.y * SCALE + 14); ctx.stroke();
      ctx.restore();
      shell.setStatus('模型 · ' + objects.length + ' 对象 · ' + (snap ? '捕捉 5mm' : '自由'));
      shell.setInfo('X ' + cursor.x.toFixed(1) + '  Y ' + cursor.y.toFixed(1) + '  mm');
      renderProps();
      scheduleSave();
    }

    function objBounds(o) {
      if (o.type === 'line') return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
      if (o.type === 'circle') return { x: o.cx - o.r, y: o.cy - o.r, w: o.r * 2, h: o.r * 2 };
      if (o.type === 'dim' || o.type === 'leader') {
        return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
      }
      if (o.type === 'rect') return { x: o.x, y: o.y, w: o.w, h: o.h };
      if (o.type === 'poly') {
        const xs = (o.pts || []).map((p) => p.x), ys = (o.pts || []).map((p) => p.y);
        return { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
      }
      return { x: o.x, y: o.y, w: 40, h: 12 };
    }

    function hit(p) {
      for (let i = objects.length - 1; i >= 0; i--) {
        const b = objBounds(objects[i]);
        if (p.x >= b.x - 3 && p.x <= b.x + b.w + 3 && p.y >= b.y - 3 && p.y <= b.y + b.h + 3) return i;
      }
      return -1;
    }

    // CAD 图元没有统一原点，移动/复制/偏移都按类型改字段。
    function translateObject(o, dx, dy) {
      if (o.type === 'line' || o.type === 'dim' || o.type === 'leader') {
        o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy;
      } else if (o.type === 'circle') { o.cx += dx; o.cy += dy; }
      else if (o.type === 'rect') { o.x += dx; o.y += dy; }
      else if (o.type === 'poly') { o.pts = o.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })); }
      else if (o.type === 'text') { o.x += dx; o.y += dy; }
    }
    function cloneObject(o) { return JSON.parse(JSON.stringify(o)); }
    let dragObj = null;
    function endDrag() { dragObj = null; }
    // 偏移：圆同心放大、矩形外扩、直线/多段线整体平移（AutoCAD 的平行偏移近似）。
    function offsetObject(o, dist) {
      const copy = cloneObject(o);
      if (copy.type === 'circle') copy.r = Math.max(1, copy.r + dist);
      else if (copy.type === 'rect') { copy.x -= dist; copy.y -= dist; copy.w += dist * 2; copy.h += dist * 2; }
      else if (copy.type === 'poly') copy.pts = copy.pts.map((p) => ({ x: p.x + dist, y: p.y + dist }));
      else translateObject(copy, dist, dist);
      return copy;
    }
    window.addEventListener('pointerup', endDrag);

    ws.addEventListener('pointermove', (e) => {
      const p = view.point(e);
      cursor = snapPt(p);
      if (dragObj) {
        const dx = cursor.x - dragObj.start.x;
        const dy = cursor.y - dragObj.start.y;
        // 从快照重算，避免逐帧累加带来漂移。
        Object.keys(dragObj.orig).forEach((k) => { dragObj.o[k] = dragObj.orig[k]; });
        dragObj.o.pts = dragObj.orig.pts ? dragObj.orig.pts.map((q) => ({ x: q.x, y: q.y })) : undefined;
        translateObject(dragObj.o, dx, dy);
      }
      paint();
    });
    ws.addEventListener('pointerdown', (e) => {
      if (e.target !== view.canvas) return;
      const p = snapPt(view.point(e));
      cursor = p;
      if (tool === 'select') {
        selected = hit(p);
        paint();
        return;
      }
      if (tool === 'move') {
        const i = hit(p);
        selected = i;
        if (i >= 0) dragObj = { o: objects[i], start: p, orig: cloneObject(objects[i]) };
        paint();
        return;
      }
      if (tool === 'copy' || tool === 'offset') {
        const i = hit(p);
        if (i < 0) { paint(); return; }
        const copy = tool === 'copy' ? cloneObject(objects[i]) : offsetObject(objects[i], 5);
        if (tool === 'copy') translateObject(copy, 10, 10);
        objects.push(copy);
        selected = objects.length - 1;
        paint();
        return;
      }
      if (tool === 'text') {
        objects.push({ type: 'text', x: p.x, y: p.y, text: 'TEXT' });
        startTool('select');
        paint();
        return;
      }
      if (!pending) return;
      if (tool === 'dim') {
        if (!pending.start) pending.start = p;
        else {
          objects.push({ type: 'dim', x1: pending.start.x, y1: pending.start.y, x2: p.x, y2: p.y });
          pending.start = null;
        }
        paint();
        return;
      }
      if (tool === 'leader') {
        if (!pending.start) pending.start = p;
        else {
          objects.push({ type: 'leader', x1: pending.start.x, y1: pending.start.y, x2: p.x, y2: p.y, text: 'NOTE' });
          pending.start = null;
        }
        paint();
        return;
      }
      if (tool === 'line') {
        if (!pending.start) pending.start = p;
        else { objects.push({ type: 'line', x1: pending.start.x, y1: pending.start.y, x2: p.x, y2: p.y }); pending.start = null; }
      } else if (tool === 'pline') {
        if (!pending.start) { pending.start = p; pending.pts = []; }
        else pending.pts.push(p);
      } else if (tool === 'rect') {
        if (!pending.start) pending.start = p;
        else {
          objects.push({ type: 'rect', x: Math.min(pending.start.x, p.x), y: Math.min(pending.start.y, p.y), w: Math.abs(p.x - pending.start.x), h: Math.abs(p.y - pending.start.y) });
          pending.start = null;
        }
      } else if (tool === 'circle') {
        if (!pending.start) pending.start = p;
        else {
          const r = Math.sqrt(Math.pow(p.x - pending.start.x, 2) + Math.pow(p.y - pending.start.y, 2));
          objects.push({ type: 'circle', cx: pending.start.x, cy: pending.start.y, r });
          pending.start = null;
        }
      }
      paint();
    });
    ws.addEventListener('dblclick', () => {
      if (tool === 'pline' && pending && pending.start) {
        pending.pts.push(pending.start);
        objects.push({ type: 'poly', pts: pending.pts.slice() });
        pending = { start: null, pts: [] };
        paint();
      }
    });

    function remove() {
      if (selected < 0) return;
      objects.splice(selected, 1); // CADCraft 没有全局撤销栈，直接删
      selected = -1;
      paint();
    }

    function renderProps() {
      if (props.dataset.n === String(objects.length + '|' + selected)) return;
      props.dataset.n = objects.length + '|' + selected;
      clear(props);
      props.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '图层'), h('span', { class: 'ag-panel-caret' }, '0'))); 
      const o = objects[selected];
      props.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '特性'), h('span', { class: 'ag-panel-caret' }, o ? o.type : '未选择')));
      const b = h('div', { class: 'ag-panel-body' });
      if (o) {
        const bb = objBounds(o);
        b.append(h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, '几何'), h('span', {}, Math.round(bb.w) + ' × ' + Math.round(bb.h) + ' mm')));
        b.append(h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, '图层'), h('span', {}, '0')));
        b.append(h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, '颜色'), h('span', {}, 'ByLayer')));
      } else {
        b.append(h('p', { class: 'ag-hint' }, '未选择对象。'));
      }
      props.append(b);
    }

    // 命令行
    const cmd = h('input', { class: 'ag-cmd', type: 'text', placeholder: '输入命令' });
    const cmdline = h('div', { class: 'ag-cmdline' }, h('span', { class: 'ag-cmd-prompt' }, '命令:'), cmd);
    center.append(cmdline);
    const acadStatus = h('div', { class: 'ag-acad-status' },
      h('span', { style: 'margin-right:12px' }, '模型'), h('span', { style: 'margin-right:12px' }, '栅格'),
      h('span', { style: 'margin-right:12px' }, '捕捉'), h('span', { style: 'margin-right:12px' }, '正交'), h('span', {}, '对象捕捉'));
    center.append(acadStatus);

    cmd.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = cmd.value.trim().toUpperCase();
      cmd.value = '';
      if (!v) return;
      if (v === 'LINE' || v === 'L') startTool('line');
      else if (v === 'CIRCLE' || v === 'C') startTool('circle');
      else if (v === 'RECT' || v === 'REC') startTool('rect');
      else if (v === 'PLINE' || v === 'PL') startTool('pline');
      else if (v === 'ERASE' || v === 'E') startTool('erase');
      else if (v === 'TEXT' || v === 'T') startTool('text');
      else if (v === 'SNAP') { snap = !snap; paint(); }
      else if (v === 'UNDO' || v === 'U') { objects.pop(); paint(); }
      else if (v === 'ZOOM' || v === 'Z') { startTool('select'); shell.setStatus('缩放到范围'); }
      else shell.setStatus('未知命令：' + v);
    });

    function exportDxf() {
      const body = [];
      objects.forEach((o) => {
        if (o.type === 'line') body.push('0', 'LINE', '8', '0', '10', String(o.x1), '20', String(o.y1), '11', String(o.x2), '21', String(o.y2));
        else if (o.type === 'circle') body.push('0', 'CIRCLE', '8', '0', '10', String(o.cx), '20', String(o.cy), '40', String(o.r));
        else if (o.type === 'rect') {
          const pts = [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]];
          pts.forEach((p, i) => {
            const q = pts[(i + 1) % 4];
            body.push('0', 'LINE', '8', '0', '10', String(p[0]), '20', String(p[1]), '11', String(q[0]), '21', String(q[1]));
          });
        } else if (o.type === 'poly') {
          for (let i = 1; i < o.pts.length; i++) {
            body.push('0', 'LINE', '8', '0', '10', String(o.pts[i - 1].x), '20', String(o.pts[i - 1].y), '11', String(o.pts[i].x), '21', String(o.pts[i].y));
          }
        } else if (o.type === 'text') {
          body.push('0', 'TEXT', '8', '0', '10', String(o.x), '20', String(o.y), '40', '3', '1', String(o.text || 'TEXT'));
        } else if (o.type === 'dim') {
          body.push('0', 'LINE', '8', '0', '10', String(o.x1), '20', String(o.y1), '11', String(o.x2), '21', String(o.y2));
          const mm = Math.sqrt(Math.pow(o.x2 - o.x1, 2) + Math.pow(o.y2 - o.y1, 2));
          body.push('0', 'TEXT', '8', '0', '10', String((o.x1 + o.x2) / 2), '20', String((o.y1 + o.y2) / 2 + 2), '40', '3', '1', mm.toFixed(1) + ' mm');
        } else if (o.type === 'leader') {
          body.push('0', 'LINE', '8', '0', '10', String(o.x1), '20', String(o.y1), '11', String(o.x2), '21', String(o.y2));
          body.push('0', 'LINE', '8', '0', '10', String(o.x2), '20', String(o.y2), '11', String(o.x2 + 20), '21', String(o.y2));
          body.push('0', 'TEXT', '8', '0', '10', String(o.x2 + 22), '20', String(o.y2 + 2), '40', '3', '1', String(o.text || 'NOTE'));
        }
      });
      download('cadcraft.dxf', dxfDocument(body), 'application/dxf');
      toastIn(shell.root, 'DXF 已导出');
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '保存到本机', onClick: persist },
        { label: '导出 DXF', shortcut: '⌘S', onClick: exportDxf },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '绘图', items: [
        { label: '直线', onClick: () => startTool('line') },
        { label: '圆', onClick: () => startTool('circle') },
        { label: '矩形', onClick: () => startTool('rect') },
        { label: '文字', onClick: () => startTool('text') },
      ] },
      { label: '修改', items: [
        { label: '删除所选', shortcut: 'Del', disabled: selected < 0, onClick: remove },
        { label: '清除全部', onClick: () => { objects.length = 0; selected = -1; dragObj = null; paint(); } },
      ] },
      { label: '状态', items: [
        { label: '捕捉 5mm', checked: snap, onClick: () => { snap = !snap; paint(); } },
      ] },
    ]);

    const scope = commandScope();
    scope.add('cadcraft.line', '画一条示例直线', () => { objects.push({ type: 'line', x1: 80, y1: 120, x2: 320, y2: 120 }); paint(); });
    scope.add('cadcraft.circle', '画一个半径 60mm 的圆', () => { objects.push({ type: 'circle', cx: 300, cy: 200, r: 60 }); paint(); });
    scope.add('cadcraft.dim', '添加一段 200mm 线性标注', () => { objects.push({ type: 'dim', x1: 80, y1: 320, x2: 280, y2: 320 }); paint(); });
    scope.add('cadcraft.save', '保存图纸到本机', persist);
    scope.add('cadcraft.export', '导出 DXF', exportDxf);

    function onKey(e) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected >= 0) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT') return;
        e.preventDefault(); remove();
      }
      if (e.key === 'Escape') { pending = null; startTool('select'); }
    }
    document.addEventListener('keydown', onKey);

    (function restore() {
      const saved = loadDoc('cadcraft');
      if (saved && saved.doc) applyDoc(saved.doc);
    })();
    startTool('select');
    paint();
    return { destroy() {
      if (saveTimer) { clearTimeout(saveTimer); persist(); }
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerup', endDrag);
      scope.dispose();
    } };
  },
});

/* ============================ DesignCraft：版面 ============================ */

craft({
  id: 'designcraft', name: 'DesignCraft', up: '版面 · 分栏', group: 'vector', tag: '版面',
  blurb: '对开页、页边距与分栏参考线，文字与图形排版后导出 PNG。',
  hint: '右侧 Pages 换页；蓝框内拖对象',
  mount(host) {
    const shell = craftShell(host, {
      name: 'DesignCraft', file: 'Quarterly — Spring Issue', up: '版面 · 分栏', tag: '印刷',
      theme: 'dark', layout: 'indesign',
    });
    const PW = 420, PH = 594; // A4 @ 72dpi 的一半比例
    const pages = [{ objects: [], title: '封面' }, { objects: [], title: '内页' }];
    let pageIndex = 0;
    let selected = -1;
    let tool = 'select';
    let drag = null;

    const rail = h('aside', { class: 'ag-rail' });
    const center = h('div', { class: 'ag-canvas-center' });
    const ws = h('div', { class: 'ag-workspace', style: 'padding:30px' });
    const right = h('aside', { class: 'ag-right-panels' });
    center.append(ws);
    shell.body.append(rail, center, right);

    const TOOLS = [
      { id: 'select', icon: 'cursor', label: '选择' }, { id: 'text', icon: 'text', label: '文字' },
      { id: 'rect', icon: 'square', label: '矩形' }, { id: 'ellipse', icon: 'circle', label: '椭圆' },
      { id: 'image', icon: 'image', label: '图片' }, { id: 'hand', icon: 'hand', label: '抓手' },
    ];
    const toolBtns = {};
    const grid = h('div', { class: 'ag-rail-grid' });
    TOOLS.forEach((t) => {
      toolBtns[t.id] = iconButton(t.icon, t.label, () => { tool = t.id; syncTools(); }, { size: 16 });
      grid.append(toolBtns[t.id]);
    });
    rail.append(h('div', { class: 'ag-rail-group' }, grid));
    rail.append(h('div', { class: 'ag-rail-group' }, h('div', { class: 'ag-rail-grid' },
      iconButton('square', '填色', () => shell.setStatus('填色：黑'), { size: 16 }),
      iconButton('line', '描边', () => shell.setStatus('描边：无'), { size: 16 }))));
    function syncTools() { Object.keys(toolBtns).forEach((k) => toolBtns[k].classList.toggle('active', k === tool)); }

    const spread = h('div', { class: 'ag-spread' });
    ws.append(spread);

    function pageEl(i) {
      const p = h('div', { class: 'ag-page', style: 'width:' + PW + 'px;height:' + PH + 'px', 'data-page': String(i) });
      const pg = pages[i];
      pg.objects.forEach((o, oi) => p.append(renderObject(o, i, oi)));
      p.append(h('div', { class: 'ag-margin-box', style: 'left:46px;right:46px;top:52px;bottom:52px' }));
      for (let c = 1; c < 3; c++) {
        p.append(h('div', { class: 'ag-col-line', style: 'left:' + (46 + ((PW - 92) / 3) * c) + 'px' }));
      }
      // 版面工具：在页面上点按即按当前工具落对象
      p.addEventListener('pointerdown', (e) => {
        if (tool === 'select' || tool === 'hand') return;
        const r = p.getBoundingClientRect();
        const x = Math.round(e.clientX - r.left), y = Math.round(e.clientY - r.top);
        if (tool === 'image') { pageIndex = i; importImage(); return; }
        const type = tool === 'text' ? 'text' : tool === 'ellipse' ? 'ellipse' : 'rect';
        pages[i].objects.push({
          type, x, y, w: type === 'text' ? 260 : 140, h: type === 'text' ? 80 : 120,
          color: type === 'text' ? '#1c1917' : type === 'rect' ? '#b45309' : '#6a4a8a',
          size: 14, text: type === 'text' ? '在这里输入正文。' : '',
        });
        pageIndex = i; selected = pages[i].objects.length - 1;
        tool = 'select'; syncTools(); render();
      });
      return p;
    }

    // 页面对象用绝对定位的 DOM 呈现，文字可直接编辑，和 InDesign 的文本框体验一致。
    function renderObject(o, pi, oi) {
      const el = h('div', {
        style: 'position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;width:' + o.w + 'px;height:' + o.h + 'px;'
          + (o.type === 'text' ? 'color:' + o.color + ';font-size:' + o.size + 'px;line-height:1.35;overflow:hidden;padding:2px;'
            : o.type === 'rect' ? 'background:' + o.color + ';'
              : o.type === 'image' ? 'background:#d8d0c2;overflow:hidden;' : 'border-radius:50%;background:' + o.color + ';')
          + (pi === pageIndex && oi === selected ? 'outline:2px solid #4a9eff;' : ''),
        'data-obj': String(oi),
      }, o.type === 'image' && o.img ? h('img', { src: o.img, style: 'width:100%;height:100%;object-fit:cover' }) : null,
        o.type === 'text' ? o.text : null);
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        pageIndex = pi; selected = oi;
        const r = el.getBoundingClientRect();
        drag = { o, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        render();
      });
      return el;
    }

    function onMove(e) {
      if (!drag) return;
      drag.o.x = Math.round(drag.ox + e.clientX - drag.sx);
      drag.o.y = Math.round(drag.oy + e.clientY - drag.sy);
      render();
    }
    function onUp() {
      drag = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }

    function render() {
      clear(spread);
      spread.append(pageEl(0), pageEl(1));
      shell.setStatus('第 ' + (pageIndex + 1) + ' 页 · ' + pages[pageIndex].objects.length + ' 对象 · 对开页 2 / 2');
      shell.setInfo('A4 · 210 × 297 mm · 3 栏');
      renderRight();
    }

    function addObject(type) {
      const pg = pages[pageIndex];
      pg.objects.push({
        type, x: 70, y: 90, w: type === 'text' ? 280 : 160, h: type === 'text' ? 80 : 160,
        color: type === 'text' ? '#1c1917' : type === 'rect' ? '#b45309' : '#6a4a8a',
        size: 14, text: type === 'text' ? '在这里输入正文。' : '',
      });
      selected = pg.objects.length - 1;
      tool = 'select'; syncTools();
      render();
    }

    function importImage() {
      pickImage((img) => {
        if (!img) return;
        const pg = pages[pageIndex];
        pg.objects.push({ type: 'image', x: 70, y: 90, w: 240, h: 180, img: img.src, _img: img, color: '#d8d0c2' });
        selected = pg.objects.length - 1;
        render();
      });
    }

    function renderRight() {
      clear(right);
      right.append(h('div', { class: 'ag-tabrow' },
        h('button', { class: 'ag-tab active', type: 'button' }, '属性'),
        h('button', { class: 'ag-tab', type: 'button', onclick: () => shell.setStatus('页面面板见下方') }, '页面'),
        h('button', { class: 'ag-tab', type: 'button', onclick: () => shell.setStatus('图层：文字 / 图形 / 背景') }, '图层')));
      const list = h('div', { class: 'ag-panel-body' });
      list.append(sectionLabel('页面'));
      pages.forEach((p, i) => list.append(h('button', {
        class: 'ag-list-item' + (i === pageIndex ? ' active' : ''),
        type: 'button', onclick: () => { pageIndex = i; selected = -1; render(); },
      }, h('span', { class: 'ag-list-name' }, '第 ' + (i + 1) + ' 页 · ' + p.title), h('span', { class: 'ag-list-meta' }, p.objects.length + ' 项'))));
      list.append(h('div', { class: 'ag-row', style: 'margin-top:6px' },
        h('button', { class: 'ag-btn', type: 'button', onclick: () => addObject('text') }, '＋ 文本框'),
        h('button', { class: 'ag-btn', type: 'button', onclick: () => addObject('rect') }, '＋ 图形'),
        h('button', { class: 'ag-btn', type: 'button', onclick: importImage }, '＋ 图片')));

      const o = pages[pageIndex].objects[selected];
      if (o) {
        list.append(sectionLabel('所选对象'));
        if (o.type === 'text') {
          list.append(textField('内容', o.text, (v) => {
            o.text = v;
            // 只改当前页对应文字节点，重建右栏会打断输入
            const pgEl = spread.children[pageIndex];
            const node = pgEl && pgEl.querySelector('[data-obj="' + selected + '"]');
            if (node) node.textContent = v;
          }, { multiline: true, rows: 3 }));
          list.append(numberField('字号', o.size, { min: 8, max: 72, onInput: (v) => { o.size = clamp(v, 8, 72); render(); } }));
        }
        list.append(colorRow('颜色', o.color, (v) => { o.color = v; render(); }));
        list.append(numberField('X', o.x, { onInput: (v) => { o.x = v; render(); } }));
        list.append(numberField('Y', o.y, { onInput: (v) => { o.y = v; render(); } }));
        list.append(h('button', { class: 'ag-btn danger', type: 'button', onclick: () => { pages[pageIndex].objects.splice(selected, 1); selected = -1; render(); } }, '删除对象'));
      }
      right.append(list);
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '导出当前页 PNG', shortcut: '⌘S', onClick: exportPng },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '版面', items: [
        { label: '添加文本框', onClick: () => addObject('text') },
        { label: '添加图形', onClick: () => addObject('rect') },
        { label: '置入图片…', onClick: importImage },
      ] },
      { label: '页面', items: pages.map((p, i) => ({ label: '第 ' + (i + 1) + ' 页', onClick: () => { pageIndex = i; selected = -1; render(); } })) },
    ]);

    function exportPng() {
      const c = document.createElement('canvas');
      c.width = PW * 2; c.height = PH * 2;
      const g = c.getContext('2d');
      g.scale(2, 2);
      g.fillStyle = '#fff'; g.fillRect(0, 0, PW, PH);
      pages[pageIndex].objects.forEach((o) => {
        if (o.type === 'text') {
          g.fillStyle = o.color; g.font = o.size + 'px ' + FONT; g.textBaseline = 'top';
          const maxW = o.w - 4;
          let ty = o.y;
          String(o.text || '').split('\n').forEach((par) => {
            let line = '';
            for (let i = 0; i < par.length; i++) {
              const test = line + par.charAt(i);
              if (g.measureText(test).width > maxW && line) { g.fillText(line, o.x + 2, ty); ty += o.size * 1.35; line = par.charAt(i); }
              else line = test;
            }
            g.fillText(line, o.x + 2, ty);
            ty += o.size * 1.35;
          });
        }
        else if (o.type === 'rect') { g.fillStyle = o.color; g.fillRect(o.x, o.y, o.w, o.h); }
        else if (o.type === 'ellipse') { g.fillStyle = o.color; g.beginPath(); g.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2); g.fill(); }
        else if (o.type === 'image' && o._img) { g.drawImage(o._img, o.x, o.y, o.w, o.h); }
      });
      saveCanvas(c, 'designcraft-p' + (pageIndex + 1) + '.png');
      toastIn(shell.root, '当前页已导出');
    }

    const scope = commandScope();
    scope.add('designcraft.addText', '添加文本框', () => addObject('text'));
    scope.add('designcraft.export', '导出当前页', exportPng);

    syncTools();
    render();
    shell.sub.append(h('div', { class: 'ag-doctabs' },
      h('button', { class: 'ag-doctab active', type: 'button' }, 'Quarterly — Spring Issue @ 83%')));
    return { destroy() { scope.dispose(); } };
  },
});

/* ============================ FigCraft：界面原型 ============================ */

craft({
  id: 'figcraft', name: 'FigCraft', up: '界面 · 原型', group: 'vector', tag: '界面稿',
  blurb: '手机画板、图层树与设计面板，拖拽移动并导出画板 PNG。',
  hint: '点画板选中；拖元素移动',
  mount(host) {
    const shell = craftShell(host, {
      name: 'FigCraft', file: 'Ridgeline app', up: '界面 · 原型', tag: '草稿',
      theme: 'dark', layout: 'figma', search: '搜索命令和工具',
    });
    const W = 1120, H = 660;
    const left = h('aside', { class: 'ag-fig-left' });
    const center = h('div', { class: 'ag-canvas-center' });
    const ws = h('div', { class: 'ag-workspace', style: 'background:#2c2c2c' });
    const right = h('aside', { class: 'ag-fig-right' });
    center.append(ws);
    shell.body.append(left, center, right);

    const view = createCanvas(ws, W, H);
    const ctx = view.ctx;
    view.canvas.style.boxShadow = 'none';
    view.canvas.style.border = '0';
    view.canvas.style.background = '#2c2c2c';

    const frames = [
      { name: 'Home — Light', x: 60, y: 90, w: 320, h: 560, bg: '#f7f4ee', dark: false },
      { name: 'Trail — Light', x: 420, y: 90, w: 320, h: 560, bg: '#ffffff', dark: false },
      { name: 'Home — Dark', x: 780, y: 90, w: 320, h: 560, bg: '#111827', dark: true },
    ];
    frames.forEach((f, fi) => {
      f.objects = [
        { type: 'text', x: 24, y: 24, w: 240, h: 22, text: fi === 2 ? '你好，Maya' : '早上好，Maya', size: 14, color: f.dark ? '#e8eaf0' : '#1c1917' },
        { type: 'text', x: 24, y: 52, w: 250, h: 34, text: '今天去哪？', size: 24, color: f.dark ? '#fff' : '#111' },
        { type: 'rect', x: 24, y: 100, w: 272, h: 34, fill: f.dark ? '#1f2937' : '#ffffff', radius: 17, stroke: f.dark ? '#374151' : '#e5e0d6' },
        { type: 'text', x: 38, y: 110, w: 220, h: 16, text: '搜索步道、山峰、湖泊', size: 11, color: f.dark ? '#9ca3af' : '#9a8f7d' },
        { type: 'rect', x: 24, y: 160, w: 272, h: 190, fill: f.dark ? '#0f766e' : '#dfe9dd', radius: 14 },
        { type: 'text', x: 38, y: 300, w: 240, h: 20, text: 'Larch Valley Loop', size: 15, color: f.dark ? '#e8f5f0' : '#1b3b34' },
        { type: 'text', x: 38, y: 324, w: 240, h: 16, text: '8.6 km · 535 m · 3h 10m', size: 10, color: f.dark ? '#9fd3c8' : '#4f6b5f' },
        { type: 'rect', x: 24, y: 372, w: 272, h: 64, fill: f.dark ? '#1f2937' : '#ffffff', radius: 12, stroke: f.dark ? '#374151' : '#e5e0d6' },
        { type: 'text', x: 38, y: 388, w: 220, h: 16, text: '附近 · Lake Agnes 茶屋', size: 11, color: f.dark ? '#d1d5db' : '#3b342a' },
        { type: 'rect', x: 24, y: 470, w: 272, h: 42, fill: '#0f766e', radius: 21 },
        { type: 'text', x: 118, y: 483, w: 180, h: 18, text: '开始徒步', size: 13, color: '#ffffff' },
      ];
    });
    let selected = 0;
    let selObj = -1;
    let tool = 'move';
    let drag = null;

    const TOOLBAR = [
      { id: 'move', icon: 'cursor', label: '移动' }, { id: 'frame', icon: 'square', label: '画板' },
      { id: 'rect', icon: 'square', label: '矩形' }, { id: 'text', icon: 'text', label: '文字' },
      { id: 'ellipse', icon: 'circle', label: '椭圆' },
    ];
    const toolBtns = {};
    const floatBar = h('div', { class: 'ag-fig-toolbar' });
    TOOLBAR.forEach((t) => {
      toolBtns[t.id] = iconButton(t.icon, t.label, () => { tool = t.id; syncTools(); }, { size: 16 });
      floatBar.append(toolBtns[t.id]);
    });
    floatBar.append(h('span', { class: 'ag-float-sep' }));
    floatBar.append(iconButton('plus', '放大', () => shell.setStatus('缩放 100%'), { size: 16 }));
    floatBar.append(iconButton('minus', '缩小', () => shell.setStatus('缩放 75%'), { size: 16 }));
    ws.append(floatBar);
    function syncTools() { Object.keys(toolBtns).forEach((k) => toolBtns[k].classList.toggle('active', k === tool)); }

    function paint() {
      ctx.fillStyle = '#2c2c2c'; ctx.fillRect(0, 0, W, H);
      frames.forEach((f, fi) => {
        ctx.fillStyle = f.bg;
        ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.strokeStyle = fi === selected ? '#0d99ff' : 'rgba(255,255,255,.18)';
        ctx.lineWidth = fi === selected ? 2 : 1;
        ctx.strokeRect(f.x - 0.5, f.y - 0.5, f.w + 1, f.h + 1);
        ctx.fillStyle = fi === selected ? '#0d99ff' : '#9a9a9a';
        ctx.font = '11px ' + FONT;
        ctx.fillText(f.name, f.x, f.y - 6);
        f.objects.forEach((o, oi) => drawObj(o, f, fi === selected && oi === selObj));
      });
      const cf = frames[selected] || frames[0];
      shell.setStatus((selObj >= 0 && cf.objects[selObj] ? '已选 ' + cf.objects[selObj].type : cf.name) + ' · ' + cf.w + '×' + cf.h);
      shell.setInfo('缩放 100%');
    }

    function drawObj(o, f, active) {
      ctx.save();
      if (o.type === 'rect') {
        ctx.fillStyle = o.fill;
        roundRect(ctx, f.x + o.x, f.y + o.y, o.w, o.h, o.radius || 0);
        ctx.fill();
        if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 1; ctx.stroke(); }
      } else if (o.type === 'text') {
        ctx.fillStyle = o.color;
        ctx.font = '500 ' + o.size + 'px ' + FONT;
        ctx.fillText(o.text, f.x + o.x, f.y + o.y + o.size);
      } else if (o.type === 'ellipse') {
        ctx.fillStyle = o.fill;
        ctx.beginPath();
        ctx.ellipse(f.x + o.x + o.w / 2, f.y + o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (active) {
        ctx.strokeStyle = '#0d99ff'; ctx.lineWidth = 1.5;
        ctx.strokeRect(f.x + o.x - 1, f.y + o.y - 1, o.w + 2, o.h + 2);
      }
      ctx.restore();
    }

    function roundRect(g, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + rr, y);
      g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr);
      g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr);
      g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y);
      g.closePath();
    }

    function frameAt(p) {
      for (let i = frames.length - 1; i >= 0; i--) {
        const f = frames[i];
        if (p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) return i;
      }
      return -1;
    }
    function objAt(f, p) {
      for (let i = f.objects.length - 1; i >= 0; i--) {
        const o = f.objects[i];
        if (o.type === 'text') continue;
        if (p.x >= f.x + o.x && p.x <= f.x + o.x + o.w && p.y >= f.y + o.y && p.y <= f.y + o.y + o.h) return i;
      }
      return -1;
    }

    view.onDrag((p) => {
      const fi = frameAt(p);
      if (fi < 0) { selObj = -1; paint(); renderRight(); return false; } // 画板外点击只清对象选择，保留当前画板
      selected = fi;
      const f = frames[fi];
      if (tool === 'rect' || tool === 'ellipse' || tool === 'text') {
        const o = {
          type: tool === 'text' ? 'text' : tool, x: p.x - f.x, y: p.y - f.y,
          w: tool === 'text' ? 200 : 120, h: tool === 'text' ? 20 : 90,
          fill: tool === 'ellipse' ? '#0f766e' : '#e5e0d6', text: '文字', size: 14, color: '#111',
        };
        f.objects.push(o); selObj = f.objects.length - 1;
        paint(); renderRight();
        return false;
      }
      const oi = objAt(f, p);
      selObj = oi;
      paint(); renderRight();
      if (oi < 0) return false;
      const o = f.objects[oi];
      drag = { o, sx: p.x, sy: p.y, ox: o.x, oy: o.y };
      return drag;
    }, (p) => {
      if (!drag) return;
      drag.o.x = Math.round(drag.ox + p.x - drag.sx);
      drag.o.y = Math.round(drag.oy + p.y - drag.sy);
      paint();
    }, () => { drag = null; renderRight(); });

    function renderLeft() {
      clear(left);
      left.append(h('div', { class: 'ag-panel-head' }, h('span', {}, 'Ridgeline app'), h('span', { class: 'ag-panel-caret' }, '草稿')));
      const body = h('div', { class: 'ag-panel-body' });
      body.append(sectionLabel('页面'));
      body.append(h('div', { class: 'ag-list-item active' }, h('span', { class: 'ag-list-name' }, 'App')));
      body.append(sectionLabel('图层'));
      frames.forEach((f, i) => {
        body.append(h('button', {
          class: 'ag-list-item' + (i === selected ? ' active' : ''), type: 'button',
          onclick: () => { selected = i; selObj = -1; paint(); renderLeft(); renderRight(); },
        }, h('span', { class: 'ag-list-name' }, f.name), h('span', { class: 'ag-list-meta' }, f.objects.length + '')));
        if (i === selected) {
          f.objects.forEach((o, oi) => body.append(h('button', {
            class: 'ag-list-item' + (oi === selObj ? ' active' : ''),
            type: 'button', style: 'padding-left:20px',
            onclick: () => { selObj = oi; paint(); renderRight(); },
          }, h('span', { class: 'ag-list-name' }, o.type === 'text' ? o.text.slice(0, 14) : o.type))));
        }
      });
      left.append(body);
    }

    let rightTab = 'design';
    function renderRight() {
      clear(right);
      right.append(h('div', { class: 'ag-tabrow' },
        h('button', { class: 'ag-tab' + (rightTab === 'design' ? ' active' : ''), type: 'button', onclick: () => { rightTab = 'design'; renderRight(); } }, '设计'),
        h('button', { class: 'ag-tab' + (rightTab === 'proto' ? ' active' : ''), type: 'button', onclick: () => { rightTab = 'proto'; renderRight(); } }, '原型')));
      const body = h('div', { class: 'ag-panel-body' });
      const rf = frames[selected] || frames[0];
      body.append(h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, '画板'), h('span', {}, rf.w + ' × ' + rf.h)));
      if (rightTab === 'proto') {
        body.append(h('p', { class: 'ag-hint' }, '原型连线在本地不跳转；这里保留交互参数的位置。'));
      } else if (selObj >= 0) {
        const o = rf.objects[selObj];
        body.append(sectionLabel(o.type.toUpperCase()));
        body.append(h('div', { class: 'ag-frow' },
          h('span', { class: 'ag-frow-label' }, '位置'),
          h('input', { type: 'number', value: Math.round(o.x), style: 'width:60px;margin-right:4px', onchange(e) { o.x = Number(e.target.value); paint(); } }),
          h('input', { type: 'number', value: Math.round(o.y), style: 'width:60px', onchange(e) { o.y = Number(e.target.value); paint(); } })));
        body.append(h('div', { class: 'ag-frow' },
          h('span', { class: 'ag-frow-label' }, '尺寸'),
          h('input', { type: 'number', value: Math.round(o.w), style: 'width:60px;margin-right:4px', onchange(e) { o.w = Number(e.target.value); paint(); } }),
          h('input', { type: 'number', value: Math.round(o.h), style: 'width:60px', onchange(e) { o.h = Number(e.target.value); paint(); } })));
        if (o.type === 'text') body.append(textField('文字', o.text, (v) => { o.text = v; paint(); }));
        if (o.type === 'rect') body.append(colorRow('填充', o.fill, (v) => { o.fill = v; paint(); }));
        body.append(h('button', { class: 'ag-btn danger', type: 'button', onclick: () => { frames[selected].objects.splice(selObj, 1); selObj = -1; paint(); renderLeft(); renderRight(); } }, '删除'));
      } else {
        body.append(h('p', { class: 'ag-hint' }, '点画板内的元素查看尺寸与填充。'));
      }
      right.append(body);
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '导出画板 PNG', shortcut: '⌘S', onClick: exportPng },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '对象', items: [
        { label: '添加矩形', onClick: () => { frames[selected].objects.push({ type: 'rect', x: 40, y: 240, w: 160, h: 80, fill: '#e5e0d6' }); selObj = frames[selected].objects.length - 1; paint(); renderLeft(); renderRight(); } },
        { label: '添加文字', onClick: () => { frames[selected].objects.push({ type: 'text', x: 40, y: 220, w: 200, h: 20, text: '文字', size: 14, color: '#111' }); selObj = frames[selected].objects.length - 1; paint(); renderLeft(); renderRight(); } },
      ] },
    ]);

    function exportPng() {
      const f = frames[selected];
      const c = document.createElement('canvas');
      c.width = f.w * 2; c.height = f.h * 2;
      const g = c.getContext('2d');
      g.scale(2, 2);
      g.fillStyle = f.bg; g.fillRect(0, 0, f.w, f.h);
      f.objects.forEach((o) => {
        if (o.type === 'rect') { g.fillStyle = o.fill; roundRect(g, o.x, o.y, o.w, o.h, o.radius || 0); g.fill(); }
        else if (o.type === 'text') { g.fillStyle = o.color; g.font = '500 ' + o.size + 'px ' + FONT; g.fillText(o.text, o.x, o.y + o.size); }
        else if (o.type === 'ellipse') { g.fillStyle = o.fill; g.beginPath(); g.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2); g.fill(); }
      });
      saveCanvas(c, f.name.replace(/[^\w]+/g, '-') + '.png');
      toastIn(shell.root, '画板已导出');
    }

    const scope = commandScope();
    scope.add('figcraft.export', '导出画板 PNG', exportPng);

    syncTools();
    paint();
    renderLeft();
    renderRight();
    return { destroy() { scope.dispose(); } };
  },
});

/* ============================ DeckCraft：幻灯片 ============================ */

craft({
  id: 'deckcraft', name: 'DeckCraft', up: '幻灯 · 放映', group: 'vector', tag: '演示',
  blurb: '浅色功能区的幻灯片编辑器，拖元素、写备注、全屏放映。',
  hint: '点幻灯片编辑；拖动元素排版',
  mount(host) {
    const shell = craftShell(host, {
      name: 'DeckCraft', file: '未命名演示', up: '幻灯 · 放映', tag: '16:9',
      theme: 'light', layout: 'powerpoint',
    });
    let slideIndex = 0;
    let selected = -1;
    let drag = null;
    let slides = [
      { title: '从太阳到你的天空', notes: '开场：用一张极光的照片抓住注意力。', bg: '#ffffff', els: [
        { type: 'text', x: 60, y: 70, w: 780, h: 90, text: '从太阳到你的天空', size: 44, color: '#111', weight: 700 },
        { type: 'text', x: 60, y: 170, w: 700, h: 50, text: '太阳风如何点亮极光', size: 22, color: '#555' },
      ] },
      { title: '太阳风', notes: '解释太阳风与磁层。', bg: '#f7f9fc', els: [
        { type: 'text', x: 50, y: 40, w: 700, h: 60, text: '太阳风', size: 34, color: '#111', weight: 700 },
        { type: 'rect', x: 70, y: 170, w: 190, h: 110, fill: '#e07a3f', radius: 12 },
        { type: 'text', x: 95, y: 208, w: 150, h: 40, text: '太阳风', size: 22, color: '#fff' },
        { type: 'rect', x: 300, y: 170, w: 190, h: 110, fill: '#3b6fd8', radius: 12 },
        { type: 'text', x: 320, y: 208, w: 160, h: 40, text: '磁层', size: 22, color: '#fff' },
        { type: 'rect', x: 530, y: 170, w: 190, h: 110, fill: '#7a4fd0', radius: 12 },
        { type: 'text', x: 550, y: 208, w: 170, h: 40, text: '粒子碰撞', size: 22, color: '#fff' },
      ] },
      { title: '配色', notes: '三种配色方案。', bg: '#fffdf7', els: [
        { type: 'text', x: 50, y: 40, w: 700, h: 60, text: '光的三原色', size: 34, color: '#111', weight: 700 },
        { type: 'rect', x: 70, y: 160, w: 200, h: 200, fill: '#d94f4f', radius: 6 },
        { type: 'rect', x: 300, y: 160, w: 200, h: 200, fill: '#4f9ad9', radius: 6 },
        { type: 'rect', x: 530, y: 160, w: 200, h: 200, fill: '#6fbf73', radius: 6 },
      ] },
    ];

    // 打开时恢复上次的自动存档；损坏、空档或版本不符时保留默认三页。
    (function restore() {
      const saved = loadDoc('deckcraft');
      if (!saved || !Array.isArray(saved.doc.slides)) return;
      // 脏存档（缺 els 的页）直接丢弃，宁可少一页也不要挂载时崩溃。
      const list = saved.doc.slides.filter((s) => s && Array.isArray(s.els));
      if (!list.length) return;
      slides = list;
      slideIndex = clamp(saved.doc.slideIndex || 0, 0, slides.length - 1);
      // 图片对象不可序列化，落盘只留 data URL；恢复时重建运行时缓存，导出才能继续画图。
      slides.forEach((s) => {
        (s.els || []).forEach((o) => {
          if (o.type === 'image' && o.img && !o._img) {
            const im = new Image();
            im.src = o.img;
            o._img = im;
          }
        });
      });
    })();

    let saveTimer = 0;
    // 拖拽与打字会高频触发，600ms 合并写一次，避免每帧 JSON 序列化。
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = 0;
        saveDoc('deckcraft', { slides: slides, slideIndex: slideIndex });
      }, 600);
    }
    function saveProjectLocal() {
      const ok = saveDoc('deckcraft', { slides: slides, slideIndex: slideIndex });
      toastIn(shell.root, ok ? '工程已保存到本机' : '保存失败：存档过大或浏览器禁写');
      shell.setStatus(ok ? '工程已保存到本机' : '工程保存失败');
    }
    function saveProjectFile() {
      const text = projectJson('deckcraft', { slides: slides, slideIndex: slideIndex });
      download('deckcraft.agrft.json', text, 'application/json');
      toastIn(shell.root, '工程文件已导出');
    }
    function openProjectFile() {
      pickFile('.json,application/json', (file) => {
        if (!file) return;
        readFileText(file, (text) => {
          const shellDoc = parseDoc(text);
          const list = shellDoc && Array.isArray(shellDoc.doc.slides)
            ? shellDoc.doc.slides.filter((s) => s && Array.isArray(s.els)) : [];
          if (!list.length) {
            toastIn(shell.root, '不是有效的 DeckCraft 工程文件');
            return;
          }
          slides = list;
          slideIndex = clamp(shellDoc.doc.slideIndex || 0, 0, slides.length - 1);
          selected = -1;
          render();
          toastIn(shell.root, '工程已打开 · ' + slides.length + ' 张');
        });
      });
    }

    const thumbs = h('aside', { class: 'ag-ppt-thumbs' });
    const main = h('div', { class: 'ag-ppt-main' });
    const stage = h('div', { class: 'ag-ppt-stage' });
    const slideEl = h('div', { class: 'ag-ppt-slide' });
    const wrap = h('div', { class: 'ag-ppt-slide-wrap' }, h('div', { class: 'ag-ppt-ratio' }), slideEl);
    stage.append(wrap);
    const notes = h('div', { class: 'ag-ppt-notes' },
      h('textarea', { placeholder: '单击此处添加备注' }));
    main.append(stage, notes);
    shell.body.append(thumbs, main);

    const ribbon = [
      { id: 'home', label: '开始', groups: [
        { label: '幻灯片', items: [
          { label: '新建', icon: 'plus', large: true, onClick: addSlide },
          { label: '版式', icon: 'slide', onClick: () => shell.setStatus('版式：标题和内容') },
          { label: '重设', icon: 'undo', onClick: resetSlide },
        ] },
        { label: '字体', items: [
          { label: 'B', icon: 'bold', onClick: () => styleSel('bold') },
          { label: 'I', icon: 'italic', onClick: () => styleSel('italic') },
          { label: 'U', icon: 'underline', onClick: () => styleSel('underline') },
          { label: '字号', icon: 'text', onClick: () => shell.setStatus('字号在右侧属性里调整') },
        ] },
        { label: '段落', items: [
          { label: '左', icon: 'alignLeft', onClick: () => shell.setStatus('左对齐') },
          { label: '中', icon: 'alignCenter', onClick: () => shell.setStatus('居中') },
          { label: '右', icon: 'alignRight', onClick: () => shell.setStatus('右对齐') },
        ] },
      ] },
      { id: 'insert', label: '插入', groups: [
        { label: '对象', items: [
          { label: '文本框', icon: 'text', large: true, onClick: () => addEl('text') },
          { label: '形状', icon: 'square', large: true, onClick: () => addEl('rect') },
          { label: '图片', icon: 'image', onClick: importImage },
        ] },
        { label: '演示', items: [
          { label: '放映', icon: 'play', onClick: present },
        ] },
      ] },
      { id: 'design', label: '设计', groups: [
        { label: '主题', items: [
          { label: '浅色', icon: 'palette', large: true, onClick: () => setBg('#ffffff') },
          { label: '纸色', icon: 'palette', onClick: () => setBg('#fffdf7') },
          { label: '冷色', icon: 'palette', onClick: () => setBg('#f7f9fc') },
          { label: '极光', icon: 'palette', onClick: () => setBg('linear-gradient(135deg, #0b1e3a 0%, #1d4e63 45%, #4fb6a5 100%)') },
          { label: '日落', icon: 'palette', onClick: () => setBg('linear-gradient(180deg, #2b1055 0%, #7597de 55%, #ffb86b 100%)') },
          { label: '光晕', icon: 'palette', onClick: () => setBg('radial-gradient(circle at 50% 40%, #f7f3e8 0%, #d8d0c2 60%, #6b6257 100%)') },
        ] },
      ] },
      { id: 'slideshow', label: '幻灯片放映', groups: [
        { label: '开始放映', items: [
          { label: '从头开始', icon: 'play', large: true, onClick: () => { slideIndex = 0; render(); present(); } },
          { label: '从当前', icon: 'skipForward', large: true, onClick: present },
        ] },
      ] },
    ];
    const rb = (function () {
      // 直接复用内核的功能区，保持三个 Office 应用同一套交互。
      const tabs = h('div', { class: 'ag-ribbon-tabs' });
      const content = h('div', { class: 'ag-ribbon-content' });
      const btns = {};
      let active = 'home';
      function renderRibbon() {
        clear(content);
        const tab = ribbon.filter((t) => t.id === active)[0];
        tab.groups.forEach((g) => {
          const body = h('div', { class: 'ag-rgroup-body' });
          g.items.forEach((it) => body.append(h('button', {
            class: 'ag-rbtn' + (it.large ? ' large' : ''), type: 'button', title: it.label, onclick: it.onClick,
          }, icon(it.icon, it.large ? 22 : 15), h('span', { class: 'ag-rbtn-label' }, it.label))));
          content.append(h('div', { class: 'ag-rgroup' }, body, h('div', { class: 'ag-rgroup-label' }, g.label)));
        });
        Object.keys(btns).forEach((k) => btns[k].classList.toggle('active', k === active));
      }
      ribbon.forEach((t) => {
        btns[t.id] = h('button', { class: 'ag-ribbon-tab', type: 'button', onclick() { active = t.id; renderRibbon(); } }, t.label);
        tabs.append(btns[t.id]);
      });
      renderRibbon();
      shell.sub.append(h('div', { class: 'ag-ribbon' }, tabs, content));
      return { refresh: renderRibbon };
    })();

    function render() {
      clear(thumbs);
      slides.forEach((s, i) => {
        const mini = h('div', { class: 'ag-ppt-mini' });
        s.els.forEach((o) => {
          if (o.type === 'rect') mini.append(h('div', { style: 'position:absolute;left:' + (o.x / 840 * 100) + '%;top:' + (o.y / 472 * 100) + '%;width:' + (o.w / 840 * 100) + '%;height:' + (o.h / 472 * 100) + '%;background:' + o.fill + ';border-radius:' + (o.radius || 0) + 'px' }));
          if (o.type === 'text') mini.append(h('div', { style: 'position:absolute;left:' + (o.x / 840 * 100) + '%;top:' + (o.y / 472 * 100) + '%;width:' + (o.w / 840 * 100) + '%;font-size:' + Math.max(4, o.size / 6) + 'px;color:' + o.color + ';font-weight:' + (o.weight || 400) }, o.text));
        });
        thumbs.append(h('button', { class: 'ag-ppt-thumb' + (i === slideIndex ? ' active' : ''), type: 'button', onclick: () => selectSlide(i) },
          h('span', { class: 'ag-ppt-num' }, String(i + 1)), mini));
      });
      renderSlide();
      notes.querySelector('textarea').value = slides[slideIndex].notes || '';
      shell.setStatus('第 ' + (slideIndex + 1) + ' / ' + slides.length + ' 张 · ' + slides[slideIndex].els.length + ' 个对象');
      shell.setInfo('中文（中国）');
      scheduleSave();
    }

    function renderSlide() {
      const s = slides[slideIndex];
      slideEl.style.background = s.bg;
      clear(slideEl);
      const rect = slideEl.getBoundingClientRect();
      const k = rect.width / 840 || 1;
      s.els.forEach((o, i) => {
        const el = h('div', {
          class: 'ag-ppt-el' + (o.type === 'text' ? ' text' : '') + (i === selected ? ' active' : ''),
          style: 'left:' + (o.x / 840 * 100) + '%;top:' + (o.y / 472 * 100) + '%;width:' + (o.w / 840 * 100) + '%;height:' + (o.h / 472 * 100) + '%;'
            + (o.type === 'rect' ? 'background:' + o.fill + ';border-radius:' + (o.radius || 0) + 'px;' : '')
            + (o.type === 'image' && o.img ? 'background-image:url(' + o.img + ');background-size:cover;background-position:center;' : '')
            + (o.type === 'text' ? 'color:' + o.color + ';font-size:' + (o.size * k / 1.0) + 'px;font-weight:' + (o.weight || 400) + ';'
              + (o.italic ? 'font-style:italic;' : '') + (o.underline ? 'text-decoration:underline;' : '') : ''),
        }, o.text || '');
        if (o.type === 'text') {
          // 双击就地改字，失焦写回模型
          el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            el.contentEditable = 'true';
            el.focus();
          });
          el.addEventListener('blur', () => {
            el.contentEditable = 'false';
            o.text = el.textContent;
            render();
          });
        }
        el.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          selected = i;
          // 选中态就地切换，绝不重建 DOM：一旦重建，第二次 pointerdown 会换掉节点，
          // 浏览器找不到稳定的双击目标，双击改字就永远不触发。
          for (let ci = 0; ci < slideEl.children.length; ci++) {
            slideEl.children[ci].classList.toggle('active', ci === i);
          }
          drag = { o, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y };
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
        });
        slideEl.append(el);
      });
    }

    function onMove(e) {
      if (!drag) return;
      const rect = slideEl.getBoundingClientRect();
      drag.o.x = Math.round(clamp(drag.ox + (e.clientX - drag.sx) / rect.width * 840, -100, 820));
      drag.o.y = Math.round(clamp(drag.oy + (e.clientY - drag.sy) / rect.height * 472, -60, 460));
      renderSlide();
    }
    function onUp() { drag = null; document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); scheduleSave(); }

    function selectSlide(i) { slideIndex = i; selected = -1; render(); }
    function addSlide() {
      slides.push({ title: '新幻灯片', notes: '', bg: '#ffffff', els: [
        { type: 'text', x: 60, y: 70, w: 720, h: 70, text: '新幻灯片', size: 40, color: '#111', weight: 700 },
      ] });
      slideIndex = slides.length - 1; selected = -1; render();
    }
    function resetSlide() { slides[slideIndex].els = []; selected = -1; render(); }
    function addEl(type) {
      slides[slideIndex].els.push(type === 'text'
        ? { type: 'text', x: 100, y: 120, w: 320, h: 50, text: '双击右侧改文字', size: 24, color: '#111' }
        : { type: 'rect', x: 140, y: 140, w: 180, h: 120, fill: '#3b6fd8', radius: 8 });
      selected = slides[slideIndex].els.length - 1;
      render();
    }
    function importImage() {
      pickImage((img) => {
        if (!img) return;
        const w = 300, h = Math.round(w * img.height / img.width);
        slides[slideIndex].els.push({ type: 'image', x: 100, y: 100, w, h, img: img.src, _img: img });
        selected = slides[slideIndex].els.length - 1;
        render();
      });
    }
    function styleSel(kind) {
      const o = slides[slideIndex].els[selected];
      if (!o || o.type !== 'text') return shell.setStatus('先选中一个文本框');
      o[kind] = !o[kind];
      o.weight = o.bold ? 700 : 400;
      o.italic = !!o.italic;
      o.underline = !!o.underline;
      render();
    }
    function setBg(c) { slides[slideIndex].bg = c; render(); }

    function present() {
      const mask = h('div', {
        style: 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;background:#000;display:flex;align-items:center;justify-content:center;cursor:pointer',
      });
      let i = slideIndex;
      function show() {
        clear(mask);
        const s = slides[i];
        const el = h('div', { style: 'position:relative;width:92vw;max-width:1280px;height:72vh;max-height:720px;background:' + s.bg + ';overflow:hidden' });
        s.els.forEach((o) => {
          el.append(h('div', {
            style: 'position:absolute;left:' + (o.x / 840 * 100) + '%;top:' + (o.y / 472 * 100) + '%;width:' + (o.w / 840 * 100) + '%;height:' + (o.h / 472 * 100) + '%;'
              + (o.type === 'rect' ? 'background:' + o.fill + ';border-radius:' + (o.radius || 0) + 'px;' : '')
              + (o.type === 'text' ? 'color:' + o.color + ';font-size:' + (o.size / 840 * 100) + 'vw;font-weight:' + (o.weight || 400) + ';line-height:1.2;' : ''),
          }, o.text || ''));
        });
        mask.append(el);
        mask.append(h('div', { style: 'position:absolute;right:16px;bottom:12px;color:#888;font:11px monospace' }, (i + 1) + ' / ' + slides.length + ' · 点击继续，Esc 退出'));
      }
      mask.addEventListener('click', () => {
        if (i < slides.length - 1) { i++; show(); } else close();
      });
      function close() { mask.remove(); document.removeEventListener('keydown', onKey); }
      function onKey(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      document.body.append(mask);
      show();
    }

    notes.querySelector('textarea').addEventListener('input', (e) => { slides[slideIndex].notes = e.target.value; scheduleSave(); });

    shell.setMenus([
      { label: '文件', items: [
        { label: '保存到本机', shortcut: '⌘S', onClick: saveProjectLocal },
        { label: '导出工程文件…', onClick: saveProjectFile },
        { label: '打开工程文件…', onClick: openProjectFile },
        { sep: true },
        { label: '导出当前页 PNG', shortcut: '⌘E', onClick: exportPng },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '插入', items: [
        { label: '文本框', onClick: () => addEl('text') },
        { label: '形状', onClick: () => addEl('rect') },
      ] },
      { label: '放映', items: [{ label: '从当前开始', onClick: present }] },
    ]);

    function exportPng() {
      const s = slides[slideIndex];
      const c = document.createElement('canvas');
      c.width = 1680; c.height = 944;
      const g = c.getContext('2d');
      // 背景可以是纯色，也可以是 CSS 渐变；渐变交给引擎画，纯色走原路径。
      if (!drawGradient(g, c.width, c.height, s.bg)) {
        g.fillStyle = s.bg; g.fillRect(0, 0, c.width, c.height);
      }
      const k = c.width / 840;
      s.els.forEach((o) => {
        if (o.type === 'rect') { g.fillStyle = o.fill; roundRect(g, o.x * k, o.y * k, o.w * k, o.h * k, (o.radius || 0) * k); g.fill(); }
        else if (o.type === 'image' && o._img) { g.drawImage(o._img, o.x * k, o.y * k, o.w * k, o.h * k); }
        else { g.fillStyle = o.color; g.font = (o.weight || 400) + ' ' + (o.size * k) + 'px ' + FONT; g.textBaseline = 'top'; g.fillText(o.text, o.x * k, o.y * k); }
      });
      saveCanvas(c, 'deckcraft-' + (slideIndex + 1) + '.png');
      toastIn(shell.root, '当前幻灯片已导出');
    }
    function roundRect(g, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + rr, y);
      g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr);
      g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr);
      g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y);
      g.closePath();
    }

    const scope = commandScope();
    scope.add('deckcraft.addSlide', '新增幻灯片', addSlide);
    scope.add('deckcraft.export', '导出当前页', exportPng);
    scope.add('deckcraft.save', '保存工程到本机', saveProjectLocal);
    scope.add('deckcraft.exportDoc', '导出工程 JSON 文件', saveProjectFile);
    scope.add('deckcraft.openDoc', '打开工程 JSON 文件', openProjectFile);

    render();
    window.addEventListener('resize', renderSlide);
    function deckKey(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected >= 0) {
        e.preventDefault();
        slides[slideIndex].els.splice(selected, 1);
        selected = -1;
        render();
      }
    }
    document.addEventListener('keydown', deckKey);
    return { destroy() {
      // 卸载前把未落盘的改动补写一次，避免 600ms 防抖窗口内的编辑丢失。
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      saveDoc('deckcraft', { slides: slides, slideIndex: slideIndex });
      scope.dispose();
      window.removeEventListener('resize', renderSlide);
      document.removeEventListener('keydown', deckKey);
    } };
  },
});
