// 图像族：PhotoCraft（位图）、GenCraft（AI 画布）、LightCraft（显影）、
// TextureCraft（贴图）、MaterialCraft（材质节点）。
// 每个都按自己的工作流搭界面，只共用命令总线与画布/文件工具。
// 界面参照的工作流类型见 docs/artcraftport/ATTRIBUTION.md。
import {
  h, clear, craft, craftShell, createCanvas, saveCanvas, pickImage, download,
  slider, sliderRow, colorField, colorRow, selectField, textField, numberField,
  icon, iconButton, panel, panelStack, sectionLabel, fieldRow,
  toastIn, commandScope, clamp, stageHint,
} from './kernel.js';
import { blurRGBA, intensityToSigma } from './engine/blur.js';

const FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

function drawCover(ctx, img, x, y, w, h) {
  if (!img || !img.width) return;
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function optionHTML(label, node) {
  return h('label', {}, label, node);
}

/* ============================ PhotoCraft：位图 ============================ */

craft({
  id: 'photocraft', name: 'PhotoCraft', up: '位图 · 图层', group: 'image', tag: '位图',
  blurb: '图层、画笔、混合模式与调整图层，画布直接出 PNG。',
  hint: 'V 移动 · B 画笔 · E 橡皮 · T 文字 · ⌘Z 撤销',
  mount(host) {
    const shell = craftShell(host, {
      name: 'PhotoCraft', file: '未命名-1.psd', up: '位图 · 图层', tag: 'RGB/8',
      theme: 'dark', layout: 'photoshop', center: true,
    });
    const W = 960, H = 600;

    const cols = h('div', { class: 'ag-ps-cols' });
    const rail = h('aside', { class: 'ag-rail wide' });
    const center = h('div', { class: 'ag-ps-center' });
    const ws = h('div', { class: 'ag-workspace' });
    const right = h('div', { class: 'ag-ps-right' });
    center.append(ws);
    cols.append(rail, center, right);
    shell.body.append(cols);

    const view = createCanvas(ws, W, H);
    const ctx = view.ctx;
    let layers = [];
    let selected = -1;
    let seq = 0;
    let tool = 'move';
    const adj = { brightness: 1, contrast: 1, saturation: 1 };
    const past = [];
    const future = [];
    let historyLabel = '新建文档';
    let dragDx = 0, dragDy = 0;
    let brush = { size: 22, color: '#d08a4a' };

    function snapshot() {
      return {
        label: historyLabel, selected,
        layers: layers.map((l) => {
          const copy = {};
          Object.keys(l).forEach((k) => { if (k !== '_cache') copy[k] = l[k]; });
          if (l.strokes) copy.strokes = l.strokes.slice();
          return copy;
        }),
      };
    }
    function pushHistory(label) {
      historyLabel = label;
      past.push(snapshot());
      if (past.length > 40) past.shift();
      future.length = 0;
    }
    function restore(snap) {
      layers = snap.layers.map((l) => {
        const copy = {};
        Object.keys(l).forEach((k) => { copy[k] = l[k]; });
        return copy;
      });
      selected = Math.min(snap.selected, layers.length - 1);
      paint(); renderRight();
    }
    function undo() {
      if (!past.length) return toastIn(shell.root, '没有可撤销的操作');
      future.push(snapshot()); restore(past.pop());
    }
    function redo() {
      if (!future.length) return toastIn(shell.root, '没有可重做的操作');
      past.push(snapshot()); restore(future.pop());
    }
    function add(layer, label) {
      pushHistory(label || '新建图层');
      layer.id = ++seq;
      layer.opacity = layer.opacity == null ? 1 : layer.opacity;
      layer.blend = layer.blend || 'source-over';
      layer.hidden = false;
      layers.push(layer);
      selected = layers.length - 1;
      paint(); renderRight();
    }
    function remove() {
      if (selected < 0) return;
      pushHistory('删除图层');
      layers.splice(selected, 1);
      selected = Math.min(selected, layers.length - 1);
      paint(); renderRight();
    }
    function duplicate() {
      const l = layers[selected];
      if (!l) return;
      pushHistory('复制图层');
      const copy = {};
      Object.keys(l).forEach((k) => { if (k !== '_cache') copy[k] = l[k]; });
      copy.id = ++seq; copy.x = l.x + 18; copy.y = l.y + 18;
      if (l.strokes) copy.strokes = l.strokes.slice();
      layers.push(copy);
      selected = layers.length - 1;
      paint(); renderRight();
    }
    function move(dir) {
      if (selected < 0) return;
      pushHistory('调整图层顺序');
      const to = clamp(selected + dir, 0, layers.length - 1);
      const item = layers.splice(selected, 1)[0];
      layers.splice(to, 0, item);
      selected = to;
      paint(); renderRight();
    }

    function bounds(l) {
      if (l.type === 'text') {
        const lines = String(l.text || '').split('\n');
        let w = 0;
        ctx.save();
        ctx.font = (l.weight || 600) + ' ' + l.size + 'px ' + FONT;
        lines.forEach((s) => { w = Math.max(w, ctx.measureText(s).width); });
        ctx.restore();
        return { x: l.x, y: l.y, w: Math.max(40, w), h: lines.length * l.size * 1.32 };
      }
      if (l.type === 'brush') return { x: 0, y: 0, w: W, h: H };
      return { x: l.x, y: l.y, w: l.w || 0, h: l.h || 0 };
    }

    function brushCanvas(l) {
      if (l._cache) return l._cache;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      l._cache = c;
      return c;
    }
    function renderBrush(l) {
      const c = brushCanvas(l);
      const g = c.getContext('2d');
      g.clearRect(0, 0, W, H);
      (l.strokes || []).forEach((s) => {
        g.save();
        g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
        g.fillStyle = s.color;
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fill();
        g.restore();
      });
    }

    function drawLayer(l) {
      if (l.hidden) return;
      ctx.save();
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = l.blend;
      if (l.type === 'image') {
        drawCover(ctx, l.img, l.x, l.y, l.w, l.h);
      } else if (l.type === 'rect') {
        ctx.fillStyle = l.fill; ctx.fillRect(l.x, l.y, l.w, l.h);
      } else if (l.type === 'ellipse') {
        ctx.fillStyle = l.fill;
        ctx.beginPath();
        ctx.ellipse(l.x + l.w / 2, l.y + l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (l.type === 'text') {
        ctx.fillStyle = l.color;
        ctx.font = (l.weight || 600) + ' ' + l.size + 'px ' + FONT;
        ctx.textBaseline = 'top';
        String(l.text || '').split('\n').forEach((line, i) => {
          ctx.fillText(line, l.x, l.y + i * l.size * 1.32);
        });
      } else if (l.type === 'brush') {
        renderBrush(l);
        ctx.drawImage(l._cache, 0, 0);
      }
      ctx.restore();
    }

    function paint() {
      view.clear('#ffffff');
      ctx.save();
      // 调整参数在合成时统一烘焙，不动原图层。
      ctx.filter = 'brightness(' + adj.brightness + ') contrast(' + adj.contrast + ') saturate(' + adj.saturation + ')';
      for (let i = 0; i < layers.length; i++) drawLayer(layers[i]);
      ctx.restore();
      if (selected >= 0 && layers[selected] && layers[selected].type !== 'brush') {
        const b = bounds(layers[selected]);
        ctx.save();
        ctx.strokeStyle = '#4a9eff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.strokeRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
        ctx.restore();
      }
      shell.setStatus(layers.length + ' 图层 · ' + (selected >= 0 ? '已选 ' + (selected + 1) : '未选中') + ' · ' + W + '×' + H + 'px');
      shell.setInfo('RGB/8 · 72 ppi');
      syncHint();
    }

    let hint = null;
    function syncHint() {
      if (layers.length) { if (hint) { hint.remove(); hint = null; } return; }
      if (!hint) {
        hint = stageHint('空白画布', 'V 移动、B 画笔、E 橡皮、T 文字；也可以直接导入图片作为底层。', [
          { label: '导入图片', primary: true, onClick: importImage },
          { label: '新建矩形', onClick: () => add({ type: 'rect', x: 240, y: 160, w: 300, h: 200, fill: '#d08a4a' }, '新建矩形') },
          { label: '新建文字', onClick: () => add({ type: 'text', text: 'artcraftport', x: 240, y: 180, size: 64, color: '#1c1917' }, '新建文字') },
        ]);
        ws.append(hint);
      }
    }

    /* ---- 工具 & 选项栏 ---- */
    const TOOL_DEFS = [
      { id: 'move', label: '移动', icon: 'cursor', key: 'V' },
      { id: 'marquee', label: '选框', icon: 'marquee', key: 'M' },
      { id: 'brush', label: '画笔', icon: 'brush', key: 'B' },
      { id: 'eraser', label: '橡皮', icon: 'eraser', key: 'E' },
      { id: 'text', label: '文字', icon: 'text', key: 'T' },
      { id: 'rect', label: '矩形', icon: 'square', key: 'U' },
      { id: 'ellipse', label: '椭圆', icon: 'circle', key: 'U' },
      { id: 'pick', label: '吸管', icon: 'palette', key: 'I' },
    ];
    const toolBtns = {};
    const toolTop = h('div', { class: 'ag-rail-group' });
    const toolTopGrid = h('div', { class: 'ag-rail-grid' });
    toolTop.append(toolTopGrid);
    TOOL_DEFS.forEach((t) => {
      toolBtns[t.id] = iconButton(t.icon, t.label + ' (' + t.key + ')', () => setTool(t.id), { size: 17 });
      toolTopGrid.append(toolBtns[t.id]);
    });
    const toolBottom = h('div', { class: 'ag-rail-group' });
    toolBottom.append(h('div', { class: 'ag-rail-grid' },
      iconButton('image', '导入图片', importImage, { size: 17 }),
      iconButton('zoom', '缩放画布', () => {
        ws.classList.toggle('ag-actual');
        shell.setStatus(ws.classList.contains('ag-actual') ? '实际像素' : '适应窗口');
      }, { size: 17 }),
      iconButton('eye', '图层显隐', () => {
        const l = layers[selected];
        if (!l) return;
        l.hidden = !l.hidden; paint(); renderRight();
      }, { size: 17 })));
    rail.append(toolTop, toolBottom);

    const optHost = h('div', { class: 'ag-ps-options' });
    shell.sub.append(optHost);

    function setTool(id) {
      tool = id;
      Object.keys(toolBtns).forEach((k) => toolBtns[k].classList.toggle('active', k === id));
      renderOptions();
    }

    function renderOptions() {
      clear(optHost);
      const def = TOOL_DEFS.filter((t) => t.id === tool)[0] || TOOL_DEFS[0];
      optHost.append(h('span', { class: 'ag-tool-name' }, def.label));
      if (tool === 'move') {
        optHost.append(h('label', {}, h('input', { type: 'checkbox' }), '自动选择'));
      }
      if (tool === 'brush' || tool === 'eraser') {
        const size = h('input', { type: 'number', class: 'ag-onum', min: 1, max: 300, value: brush.size });
        size.addEventListener('change', () => { brush.size = clamp(Number(size.value), 1, 300); });
        optHost.append(optionHTML('大小', size));
        const opacity = h('input', { type: 'range', min: 10, max: 100, value: 100, style: 'width:90px' });
        optHost.append(optionHTML('不透明度', opacity));
        if (tool === 'brush') {
          const col = h('input', { type: 'color', value: brush.color, style: 'width:26px;height:20px;border:0;background:none' });
          col.addEventListener('input', () => { brush.color = col.value; });
          optHost.append(optionHTML('颜色', col));
        }
      } else if (tool === 'text') {
        const size = h('input', { type: 'number', class: 'ag-onum', min: 8, max: 300, value: 64 });
        optHost.append(optionHTML('字号', size));
        optHost.append(h('label', {}, '字体', h('select', { class: 'ag-otxt' },
          ['PingFang SC', 'Songti SC', 'Georgia', 'Menlo'].map((f) => h('option', { value: f }, f)))));
      } else if (tool === 'marquee') {
        optHost.append(h('label', {}, '样式', h('select', { class: 'ag-otxt' },
          h('option', {}, '矩形'), h('option', {}, '椭圆'))));
        optHost.append(optionHTML('羽化', h('input', { type: 'number', class: 'ag-onum', value: 0 })));
      } else {
        optHost.append(optionHTML('不透明度', (function () {
          const r = h('input', { type: 'range', min: 0, max: 100, value: selected >= 0 ? Math.round((layers[selected].opacity || 1) * 100) : 100, style: 'width:90px' });
          r.addEventListener('input', () => {
            const l = layers[selected];
            if (!l) return;
            l.opacity = r.value / 100; paint();
          });
          return r;
        })()));
      }
      optHost.append(h('span', { class: 'ag-spacer' }));
      optHost.append(h('label', {}, '适应窗口', h('input', {
        type: 'checkbox', checked: !ws.classList.contains('ag-actual'),
        onchange(e) { ws.classList.toggle('ag-actual', !e.target.checked); },
      })));
    }

    /* ---- 右栏 ---- */
    let tab = 'props';
    function renderRight() {
      clear(right);
      const tabs = h('div', { class: 'ag-tabrow' },
        h('button', { class: 'ag-tab' + (tab === 'props' ? ' active' : ''), type: 'button', onclick: () => { tab = 'props'; renderRight(); } }, '属性'),
        h('button', { class: 'ag-tab' + (tab === 'adjust' ? ' active' : ''), type: 'button', onclick: () => { tab = 'adjust'; renderRight(); } }, '调整'),
        h('button', { class: 'ag-tab' + (tab === 'hist' ? ' active' : ''), type: 'button', onclick: () => { tab = 'hist'; renderRight(); } }, '直方图'));
      right.append(tabs);
      const body = h('div', { class: 'ag-panel-body' });
      right.append(body);
      if (tab === 'adjust') {
        body.append(
          sliderRow('亮度', 0.3, 2, 0.01, adj.brightness, (v) => v.toFixed(2), (v) => { adj.brightness = v; paint(); }),
          sliderRow('对比度', 0.3, 2, 0.01, adj.contrast, (v) => v.toFixed(2), (v) => { adj.contrast = v; paint(); }),
          sliderRow('饱和度', 0, 2, 0.01, adj.saturation, (v) => v.toFixed(2), (v) => { adj.saturation = v; paint(); }),
          h('button', {
            class: 'ag-btn', type: 'button',
            onclick: () => { adj.brightness = 1; adj.contrast = 1; adj.saturation = 1; paint(); renderRight(); },
          }, '复位调整'));
      } else if (tab === 'hist') {
        body.append(h('canvas', { class: 'ag-curves', width: 244, height: 120 }));
        const c = body.querySelector('canvas');
        drawHistogram(c);
        body.append(h('p', { class: 'ag-hint' }, '当前合成结果的亮度分布。'));
      } else {
        const l = layers[selected];
        if (!l) {
          body.append(h('p', { class: 'ag-hint' }, '未选择图层。'));
        } else {
          const names = { rect: '矩形', ellipse: '椭圆', text: '文字', image: '图片', brush: '画笔' };
          body.append(h('div', { class: 'ag-frow' },
            h('span', { class: 'ag-frow-label' }, '类型'), h('span', {}, names[l.type] || l.type)));
          if (l.type === 'text') {
            body.append(textField('内容', l.text, (v) => { l.text = v; paint(); }, { multiline: true, rows: 3 }));
            body.append(numberField('字号', l.size, { min: 8, max: 300, onInput: (v) => { l.size = clamp(v, 8, 300); paint(); } }));
            body.append(colorField('颜色', l.color, (v) => { l.color = v; paint(); }));
          } else if (l.type === 'rect' || l.type === 'ellipse') {
            body.append(colorField('填充', l.fill, (v) => { l.fill = v; paint(); }));
          }
          if (l.type !== 'brush') {
            body.append(sliderRow('不透明度', 0, 1, 0.01, l.opacity, (v) => Math.round(v * 100) + '%', (v) => { l.opacity = v; paint(); }));
          }
          body.append(selectField('混合模式', [
            { value: 'source-over', label: '正常' }, { value: 'multiply', label: '正片叠底' },
            { value: 'screen', label: '滤色' }, { value: 'overlay', label: '叠加' },
            { value: 'lighter', label: '相加' }, { value: 'difference', label: '差值' },
          ], l.blend, (v) => { l.blend = v; paint(); }));
          body.append(h('div', { class: 'ag-row' },
            h('button', { class: 'ag-btn', type: 'button', onclick: () => move(1) }, '上移'),
            h('button', { class: 'ag-btn', type: 'button', onclick: () => move(-1) }, '下移'),
            h('button', { class: 'ag-btn', type: 'button', onclick: duplicate }, '复制'),
            h('button', { class: 'ag-btn danger', type: 'button', onclick: remove }, '删除')));
        }
      }

      // 图层面板固定在右栏底部，和 Photoshop 一致。
      const lp = h('div', { class: 'ag-ps-layers' });
      lp.append(h('div', { class: 'ag-panel-head' },
        h('span', { class: 'ag-panel-title' }, '图层'),
        h('span', { class: 'ag-panel-caret' }, layers.length + ' 层')));
      const list = h('div', { class: 'ag-ps-list' });
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        const kind = { rect: '形状', ellipse: '形状', text: 'T', image: 'IMG', brush: '画笔' }[l.type] || '';
        list.append(h('div', { class: 'ag-layer-row' + (i === selected ? ' active' : ''), onclick: () => { selected = i; paint(); renderRight(); } },
          h('button', {
            class: 'ag-layer-eye' + (l.hidden ? '' : ' on'), type: 'button',
            onclick(e) { e.stopPropagation(); l.hidden = !l.hidden; paint(); renderRight(); },
          }, icon(l.hidden ? 'eye' : 'eye', 13)),
          h('span', { class: 'ag-layer-thumb', style: 'background:' + (l.type === 'text' ? '#fff' : (l.fill || '#fff')) }),
          h('span', { class: 'ag-layer-name' }, (l.name || '') + (l.type === 'text' ? ' ' + l.text.slice(0, 8) : ' 图层 ' + (i + 1))),
          h('span', { class: 'ag-layer-kind' }, kind)));
      }
      lp.append(list);
      right.append(lp);
      renderOptions();
    }

    function drawHistogram(c) {
      const g = c.getContext('2d');
      g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, c.width, c.height);
      const bins = new Array(64).fill(0);
      try {
        const img = ctx.getImageData(0, 0, W, H).data;
        for (let i = 0; i < img.length; i += 160) {
          bins[Math.min(63, ((img[i] + img[i + 1] + img[i + 2]) / 3) >> 2)]++;
        }
      } catch (e) { return; }
      let max = 1;
      bins.forEach((v) => { if (v > max) max = v; });
      g.beginPath();
      g.moveTo(0, c.height);
      bins.forEach((v, i) => g.lineTo((i / 63) * c.width, c.height - (v / max) * (c.height - 4)));
      g.lineTo(c.width, c.height);
      g.closePath();
      g.fillStyle = 'rgba(200,200,200,.55)';
      g.fill();
    }

    /* ---- 画布交互 ---- */
    view.onDrag((p) => {
      if (tool === 'brush' || tool === 'eraser') {
        let l = layers[selected];
        if (!l || l.type !== 'brush') {
          add({ type: 'brush', strokes: [], name: '画笔 ' }, '新建画笔图层');
          l = layers[selected];
        }
        pushHistory(tool === 'eraser' ? '橡皮' : '画笔');
        l.strokes.push({ x: p.x, y: p.y, r: brush.size / 2, color: tool === 'eraser' ? '#000' : brush.color, erase: tool === 'eraser' });
        l._cache = null;
        paint();
        return { drawing: true };
      }
      if (tool === 'pick') {
        try {
          const d = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
          brush.color = '#' + [d[0], d[1], d[2]].map((n) => ('0' + n.toString(16)).slice(-2)).join('');
          shell.setStatus('已取色 ' + brush.color);
          renderOptions();
        } catch (e) {}
        return false;
      }
      if (tool === 'text') {
        pushHistory('新建文字');
        layers.push({ id: ++seq, type: 'text', text: '文字', x: p.x, y: p.y, size: 64, color: '#1c1917', opacity: 1, blend: 'source-over', hidden: false });
        selected = layers.length - 1;
        paint(); renderRight();
        return false;
      }
      if (tool === 'rect' || tool === 'ellipse') {
        pushHistory('绘制形状');
        layers.push({ id: ++seq, type: tool, x: p.x - 90, y: p.y - 65, w: 180, h: 130, fill: brush.color, opacity: 1, blend: 'source-over', hidden: false });
        selected = layers.length - 1;
        paint(); renderRight();
        return false;
      }
      selected = hit(p);
      paint(); renderRight();
      if (selected < 0) return false;
      dragDx = p.x - layers[selected].x;
      dragDy = p.y - layers[selected].y;
      return { dx: dragDx, dy: dragDy };
    }, (p) => {
      const l = layers[selected];
      if (!l) return;
      if (l.type === 'brush') {
        l.strokes.push({ x: p.x, y: p.y, r: brush.size / 2, color: tool === 'eraser' ? '#000' : brush.color, erase: tool === 'eraser' });
        l._cache = null;
        paint();
        return;
      }
      const b = bounds(l);
      l.x = Math.round(clamp(p.x - dragDx, -b.w, W));
      l.y = Math.round(clamp(p.y - dragDy, -b.h, H));
      paint();
    }, () => { dragDx = dragDy = 0; renderRight(); });

    function hit(p) {
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        if (l.hidden || l.type === 'brush') continue;
        const b = bounds(l);
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return i;
      }
      return -1;
    }

    function importImage() {
      pickImage((img) => {
        if (!img) return toastIn(shell.root, '图片读取失败');
        const w = Math.min(W * 0.6, img.width);
        add({ type: 'image', img, name: '图片', x: (W - w) / 2, y: (H - w * img.height / img.width) / 2, w, h: w * img.height / img.width });
      });
    }

    function exportPng() {
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const g = out.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); // 与屏幕一致的白底，避免导出透明
      g.filter = 'brightness(' + adj.brightness + ') contrast(' + adj.contrast + ') saturate(' + adj.saturation + ')';
      layers.forEach((l) => {
        if (l.hidden) return;
        g.globalAlpha = l.opacity;
        g.globalCompositeOperation = l.blend;
        if (l.type === 'image') drawCover(g, l.img, l.x, l.y, l.w, l.h);
        else if (l.type === 'rect') { g.fillStyle = l.fill; g.fillRect(l.x, l.y, l.w, l.h); }
        else if (l.type === 'ellipse') { g.fillStyle = l.fill; g.beginPath(); g.ellipse(l.x + l.w / 2, l.y + l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2); g.fill(); }
        else if (l.type === 'text') {
          g.fillStyle = l.color; g.font = (l.weight || 600) + ' ' + l.size + 'px ' + FONT; g.textBaseline = 'top';
          String(l.text || '').split('\n').forEach((line, i) => g.fillText(line, l.x, l.y + i * l.size * 1.32));
        } else if (l.type === 'brush') { renderBrush(l); g.drawImage(l._cache, 0, 0); }
      });
      saveCanvas(out, 'photocraft.png');
      toastIn(shell.root, 'PNG 已导出');
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '导入图片…', shortcut: '⌘O', onClick: importImage },
        { label: '导出 PNG', shortcut: '⌘S', onClick: exportPng },
        { sep: true }, { label: '回到矩阵', shortcut: 'Esc', onClick: shell.goHome },
      ] },
      { label: '编辑', items: [
        { label: '撤销', shortcut: '⌘Z', onClick: undo },
        { label: '重做', shortcut: '⇧⌘Z', onClick: redo },
        { sep: true },
        { label: '复制图层', shortcut: '⌘D', disabled: selected < 0, onClick: duplicate },
        { label: '删除图层', shortcut: 'Del', disabled: selected < 0, onClick: remove },
      ] },
      { label: '图层', items: [
        { label: '新建矩形', onClick: () => add({ type: 'rect', x: 240, y: 160, w: 300, h: 200, fill: '#d08a4a' }, '新建矩形') },
        { label: '新建椭圆', onClick: () => add({ type: 'ellipse', x: 320, y: 180, w: 260, h: 260, fill: '#241f19' }, '新建椭圆') },
        { label: '新建文字', onClick: () => add({ type: 'text', text: 'artcraftport', x: 240, y: 200, size: 64, color: '#1c1917' }, '新建文字') },
        { label: '新建图片', onClick: importImage },
      ] },
      { label: '视图', items: [
        { label: '适应窗口', onClick: () => ws.classList.remove('ag-actual') },
        { label: '实际大小', onClick: () => ws.classList.add('ag-actual') },
      ] },
      { label: '帮助', items: [{ label: '快捷键', onClick: () => toastIn(shell.root, 'V 移动 · B 画笔 · E 橡皮 · T 文字 · U 形状 · I 取色') }] },
    ]);

    const scope = commandScope();
    scope.add('photocraft.addRect', '添加矩形图层', () => add({ type: 'rect', x: 200, y: 140, w: 280, h: 180, fill: '#d08a4a' }, '新建矩形'));
    scope.add('photocraft.addText', '添加文字图层 {text}', (a) => add({ type: 'text', text: a.text || 'artcraftport', x: 220, y: 180, size: 56, color: '#1c1917' }, '新建文字'));
    scope.add('photocraft.export', '导出 PNG', exportPng);
    scope.add('photocraft.undo', '撤销', undo);

    function onKey(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selected >= 0) { e.preventDefault(); remove(); } return; }
      const map = { v: 'move', b: 'brush', e: 'eraser', t: 'text', u: 'rect', i: 'pick', m: 'marquee' };
      if (!mod && map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
    }
    document.addEventListener('keydown', onKey);

    setTool('move');
    paint();
    renderRight();
    shell.setInfo('RGB/8 · 72 ppi');
    return { destroy() { document.removeEventListener('keydown', onKey); scope.dispose(); } };
  },
});

/* ============================ GenCraft：全屏 AI 画布 ============================ */

craft({
  id: 'gencraft', name: 'GenCraft', up: '生成 · 外部模型', group: 'image', tag: 'AI',
  blurb: '提示词生成画面，4 张候选，保存单帧 PNG。',
  hint: '输入提示词，回车生成；点击候选切换主画面',
  mount(host) {
    const shell = craftShell(host, {
      name: 'GenCraft', file: 'untitled', up: '生成 · 外部模型', tag: '生成',
      theme: 'dark', layout: 'prompt',
    });
    const state = { aspect: '16:9', frames: [], active: 0, busy: false };

    const canvasHost = h('div', { class: 'ag-ai-canvas' });
    const grid = h('div', { class: 'ag-gen-grid' });
    canvasHost.append(grid);
    const topTools = h('div', { class: 'ag-ai-topbar' },
      h('button', { class: 'ag-chip-btn active', type: 'button', title: '移动', 'data-mode': 'move', onclick: () => moveMode('move') }, icon('cursor', 13), ' 移动'),
      h('button', { class: 'ag-chip-btn', type: 'button', title: '旋转', 'data-mode': 'rotate', onclick: () => moveMode('rotate') }, icon('redo', 13), ' 旋转'),
      h('button', { class: 'ag-chip-btn', type: 'button', title: '缩放', 'data-mode': 'scale', onclick: () => moveMode('scale') }, icon('zoom', 13), ' 缩放'),
      h('span', { class: 'ag-float-sep' }),
      h('button', { class: 'ag-chip-btn active', type: 'button' }, '世界'));
    const doneBtn = h('button', { class: 'ag-ai-done', type: 'button', onclick: () => setStatus('已完成当前画面') }, '✓ 完成');

    const prompt = h('input', {
      class: 'ag-prompt-input', type: 'text',
      placeholder: '描述你的画面…（例：黄昏的雪山湖泊，胶片质感）',
    });
    const go = h('button', { class: 'ag-prompt-go', type: 'button', onclick: generate }, '生成');
    const aspectSel = h('select', {
      class: 'ag-prompt-pill', style: 'background:#2b2927;color:#d8d2c8',
      onchange(e) { state.aspect = e.target.value; },
    }, h('option', { value: '16:9' }, '16:9 宽幅'), h('option', { value: '1:1' }, '1:1 方形'), h('option', { value: '9:16' }, '9:16 竖屏'));
    const frameCount = h('span', { class: 'ag-hint', style: 'color:#8f8a82;margin:0' }, '0 帧');
    const promptBar = h('div', { class: 'ag-promptbar' },
      h('div', { class: 'ag-prompt-row' },
        h('button', { class: 'ag-icbtn', type: 'button', title: '添加参考图', onclick: addRef }, icon('image', 16)),
        prompt, go),
      h('div', { class: 'ag-prompt-tools' },
        aspectSel,
        h('button', { class: 'ag-prompt-pill', type: 'button', onclick: () => pickRatio('main') }, '主视图'),
        h('button', { class: 'ag-prompt-pill', type: 'button', onclick: saveFrame }, '↓ 保存帧'),
        h('span', { class: 'ag-spacer' }),
        frameCount));

    canvasHost.append(topTools, doneBtn, promptBar);
    shell.body.append(canvasHost);

    let refImg = null;

    function setStatus(t) { shell.setStatus(t); }
    function moveMode(mode) {
      const btns = topTools.querySelectorAll('.ag-chip-btn');
      for (let i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === mode);
      }
      setStatus('变换模式：' + ({ move: '移动', rotate: '旋转', scale: '缩放' }[mode]));
    }

    function sizeFor(aspect) {
      if (aspect === '1:1') return { w: 640, h: 640 };
      if (aspect === '9:16') return { w: 540, h: 960 };
      return { w: 960, h: 540 };
    }

    function hash(s) {
      let n = 7;
      for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
      return n;
    }
    function rnd(seed) {
      let t = seed >>> 0;
      return function () {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    }

    const PALETTES = [
      ['#1b2440', '#3f5c94', '#e0a56b', '#f2e2c4'],
      ['#2b1a1a', '#7a3b2e', '#d98c4a', '#f4ddb0'],
      ['#10261f', '#2f6b52', '#9bc48a', '#e8f0d8'],
      ['#241b2f', '#5b3a72', '#b06fa8', '#f0d6e8'],
      ['#101820', '#264a5e', '#6fa6b8', '#e2eef2'],
    ];

    // 本地生成：按提示词里的关键词决定构图与配色，不调用外部模型。
    function compose(text, seed, w, h) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      const rand = rnd(seed);
      const pal = PALETTES[hash(text) % PALETTES.length];
      const dim = /夜|night|黑|dark/i.test(text);
      const g1 = g.createLinearGradient(0, 0, w * 0.4, h);
      g1.addColorStop(0, dim ? '#070a12' : pal[0]);
      g1.addColorStop(0.55, pal[1]);
      g1.addColorStop(1, pal[2]);
      g.fillStyle = g1;
      g.fillRect(0, 0, w, h);

      if (/山|mountain|峰/i.test(text)) {
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.moveTo(0, h);
          const base = h * (0.55 + k * 0.12);
          for (let x = 0; x <= w; x += 12) {
            const y = base - Math.abs(Math.sin((x / w) * 6 + k * 2)) * h * (0.16 - k * 0.03) - rand() * 6;
            g.lineTo(x, y);
          }
          g.lineTo(w, h);
          g.closePath();
          g.fillStyle = k === 0 ? 'rgba(20,24,32,.55)' : k === 1 ? 'rgba(40,44,54,.6)' : 'rgba(12,14,18,.7)';
          g.fill();
        }
      }
      if (/海|wave|水|湖|lake/i.test(text)) {
        g.fillStyle = 'rgba(30,70,100,.45)';
        g.fillRect(0, h * 0.72, w, h * 0.28);
        for (let i = 0; i < 14; i++) {
          g.strokeStyle = 'rgba(230,240,255,' + (0.05 + rand() * 0.14).toFixed(2) + ')';
          g.lineWidth = 1 + rand() * 2;
          g.beginPath();
          const y = h * (0.74 + rand() * 0.24);
          g.moveTo(0, y);
          for (let x = 0; x <= w; x += 18) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
          g.stroke();
        }
      }
      if (/星|star|银河|galaxy/i.test(text)) {
        for (let i = 0; i < 260; i++) {
          const x = rand() * w, y = rand() * h * 0.7;
          g.fillStyle = 'rgba(255,255,240,' + (0.25 + rand() * 0.75).toFixed(2) + ')';
          g.fillRect(x, y, rand() < 0.9 ? 1 : 2, 1);
        }
      }
      if (/人|portrait|人物|剪影/i.test(text)) {
        const cx = w * (0.35 + rand() * 0.3), cy = h * 0.5;
        g.fillStyle = 'rgba(18,16,14,.82)';
        g.beginPath();
        g.arc(cx, cy - h * 0.16, h * 0.075, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(cx, cy + h * 0.05, h * 0.13, h * 0.2, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (!/山|海|人|星|mountain|wave|portrait/i.test(text)) {
        for (let i = 0; i < 24; i++) {
          g.beginPath();
          g.arc(rand() * w, rand() * h, (0.03 + rand() * 0.2) * Math.min(w, h), 0, Math.PI * 2);
          g.fillStyle = pal[2 + Math.floor(rand() * 2)];
          g.globalAlpha = 0.12 + rand() * 0.3;
          g.fill();
          g.globalAlpha = 1;
        }
      }
      if (refImg) {
        g.globalAlpha = 0.35;
        drawCover(g, refImg, 0, 0, w, h);
        g.globalAlpha = 1;
      }
      // 胶片颗粒
      for (let i = 0; i < 900; i++) {
        g.fillStyle = 'rgba(255,255,255,' + (rand() * 0.05).toFixed(3) + ')';
        g.fillRect(rand() * w, rand() * h, 1, 1);
      }
      return c;
    }

    function generate() {
      if (state.busy) return;
      const text = prompt.value.trim();
      if (!text) { prompt.focus(); return setStatus('先写一句提示词'); }
      state.busy = true;
      go.disabled = true;
      go.textContent = '生成中…';
      setStatus('正在生成 4 张候选…');
      setTimeout(() => {
        const size = sizeFor(state.aspect);
        const base = hash(text + Date.now());
        const batch = [];
        for (let i = 0; i < 4; i++) batch.push(compose(text, base + i * 977, size.w, size.h));
        state.frames = batch;
        state.active = 0;
        state.busy = false;
        go.disabled = false;
        go.textContent = '生成';
        renderFrames();
        setStatus('已生成 4 张 · ' + size.w + '×' + size.h);
      }, 120);
    }

    function renderFrames() {
      frameCount.textContent = state.frames.length + ' 帧';
      clear(grid);
      if (!state.frames.length) {
        grid.append(h('div', { class: 'ag-stage-hint-card', style: 'pointer-events:auto' },
          h('div', { class: 'ag-stage-hint-eyebrow' }, '快速开始'),
          h('h3', { class: 'ag-stage-hint-title' }, '一句话开始'),
          h('p', { class: 'ag-stage-hint-text' }, '试试「黄昏的雪山湖泊，胶片质感」或「星夜下的剪影人物」。画面在本地合成，不上传任何内容。'),
          h('div', { class: 'ag-stage-hint-actions' },
            h('button', { class: 'ag-btn primary', type: 'button', onclick: () => { prompt.value = '黄昏的雪山湖泊，胶片质感'; generate(); } }, '示例：雪山湖泊'),
            h('button', { class: 'ag-btn', type: 'button', onclick: () => { prompt.value = '星夜下的剪影人物'; generate(); } }, '示例：星夜剪影'))));
        return;
      }
      state.frames.forEach((c, i) => {
        const item = h('div', {
          class: 'ag-gen-card' + (i === state.active ? ' active' : ''), onclick: () => { state.active = i; renderFrames(); },
        }, c);
        grid.append(item);
      });
    }

    function saveFrame() {
      const c = state.frames[state.active];
      if (!c) return setStatus('还没有可保存的画面');
      saveCanvas(c, 'artcraftport-' + (state.active + 1) + '.png');
      toastIn(shell.root, '已保存当前帧');
    }
    function addRef() {
      pickImage((img) => {
        if (!img) return;
        refImg = img;
        shell.setStatus('已加入参考图；下次生成会叠在画面里');
      });
    }
    function pickRatio() {
      state.aspect = state.aspect === '16:9' ? '1:1' : state.aspect === '1:1' ? '9:16' : '16:9';
      aspectSel.value = state.aspect;
      shell.setStatus('画幅 ' + state.aspect);
    }
    prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(); });

    shell.setMenus([
      { label: '文件', items: [
        { label: '保存当前帧', shortcut: '⌘S', onClick: saveFrame },
        { label: '加入参考图…', onClick: addRef },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '生成', items: [
        { label: '四张候选', onClick: generate },
        { label: '切换画幅', onClick: pickRatio },
      ] },
      { label: '帮助', items: [{ label: '本地合成说明', onClick: () => toastIn(shell.root, '画面由本地 Canvas 按关键词合成，不调用云端模型') }] },
    ]);

    const scope = commandScope();
    scope.add('artcraftport.generate', '按提示词生成 {prompt}', (a) => { prompt.value = a.prompt || '黄昏的雪山湖泊'; generate(); });
    scope.add('artcraftport.save', '保存当前帧', saveFrame);

    renderFrames();
    shell.setInfo('GenCraft · 本地合成');
    return { destroy() { scope.dispose(); } };
  },
});

/* ============================ LightCraft：显影 ============================ */

craft({
  id: 'lightcraft', name: 'LightCraft', up: '显影 · 非破坏', group: 'image', tag: 'RAW',
  blurb: '曝光、高光、阴影、曲线与暗角，实时显影后导出。',
  hint: '拖右侧滑块调整；胶片条切换照片',
  mount(host) {
    const shell = craftShell(host, {
      name: 'LightCraft', file: '未命名.jpg', up: '显影 · 非破坏', tag: '修改照片',
      theme: 'dark', layout: 'lightroom',
    });
    const W = 900, H = 600;
    const main = h('div', { class: 'ag-lr-main' });
    const canvasHost = h('div', { class: 'ag-lr-canvas' });
    const strip = h('div', { class: 'ag-lr-strip' });
    main.append(canvasHost, strip);
    const right = h('div', { class: 'ag-lr-right' });
    const toolrail = h('aside', { class: 'ag-lr-toolrail' },
      iconButton('image', '图库', () => shell.setStatus('图库'), {}),
      iconButton('cropMark', '裁剪', () => shell.setStatus('裁剪'), {}),
      iconButton('palette', '颜色', () => shell.setStatus('颜色'), {}),
      iconButton('search', '搜索', () => shell.setStatus('搜索'), {}));
    shell.body.append(main, right, toolrail);

    const view = createCanvas(canvasHost, W, H);
    view.canvas.style.maxHeight = '100%';
    const adj = {
      exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
      temp: 0, tint: 0, vibrance: 0, saturation: 0,
      texture: 0, clarity: 0, dehaze: 0, vignette: 0, blur: 0, mono: false,
    };
    let photos = [];
    let cur = 0;
    let source = null;

    // 四张本地样本：不用外部图，离线也能试全套滑块。
    function samplePhotos() {
      const defs = [
        { name: 'Teton_dawn.jpg', sky: ['#1b2b45', '#7d93b8', '#f0c48a'], ridge: '#2b2f3a' },
        { name: 'Coast_dusk.jpg', sky: ['#221a2e', '#8a5a6a', '#f0a060'], ridge: '#241f2a' },
        { name: 'Alpine_noon.jpg', sky: ['#1b3b63', '#6fa3cf', '#e8f2fa'], ridge: '#33414d' },
        { name: 'Desert_plain.jpg', sky: ['#4a2f22', '#c98a55', '#f4ddb0'], ridge: '#5b3a26' },
      ];
      return defs.map((d, i) => {
        const c = document.createElement('canvas');
        c.width = 480; c.height = 320;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, c.height);
        grad.addColorStop(0, d.sky[0]); grad.addColorStop(0.55, d.sky[1]); grad.addColorStop(1, d.sky[2]);
        g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
        // 远山
        g.beginPath(); g.moveTo(0, c.height);
        for (let x = 0; x <= c.width; x += 8) {
          g.lineTo(x, c.height * 0.62 - Math.abs(Math.sin(x * 0.012 + i)) * 64 - (i === 3 ? 0 : Math.sin(x * 0.05) * 8));
        }
        g.lineTo(c.width, c.height); g.closePath();
        g.fillStyle = d.ridge; g.fill();
        // 前景
        g.fillStyle = 'rgba(20,22,26,.75)';
        g.beginPath(); g.moveTo(0, c.height);
        for (let x = 0; x <= c.width; x += 16) g.lineTo(x, c.height * 0.84 + Math.sin(x * 0.02 + i) * 12);
        g.lineTo(c.width, c.height); g.closePath(); g.fill();
        return { name: d.name, canvas: c };
      });
    }

    photos = samplePhotos();
    source = photos[0].canvas;
    photos.forEach((p, i) => {
      const t = h('div', { class: 'ag-lr-thumb' + (i === 0 ? ' active' : ''), onclick: () => selectPhoto(i) });
      const thumb = document.createElement('canvas');
      thumb.width = 76; thumb.height = 58;
      thumb.getContext('2d').drawImage(p.canvas, 0, 0, 76, 58);
      t.append(thumb, h('span', {}, p.name));
      strip.append(t);
    });

    function selectPhoto(i) {
      cur = i;
      source = photos[i].canvas;
      const ts = strip.querySelectorAll('.ag-lr-thumb');
      for (let k = 0; k < ts.length; k++) ts[k].classList.toggle('active', k === i);
      shell.setTitle(photos[i].name);
      paint();
      renderRight();
    }

    // 真正的像素处理：先建 256 级 LUT，再逐像素套色温/饱和/暗角。
    function process() {
      const c = document.createElement('canvas');
      c.width = source.width; c.height = source.height;
      const g = c.getContext('2d');
      g.drawImage(source, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height);
      const px = data.data;
      // 高斯模糊先作用在源像素上；后续 LUT、色温、暗角再逐像素处理。
      let srcPx = px;
      if (adj.blur > 0.5) {
        const sigma = intensityToSigma(adj.blur, c.width, 1920);
        srcPx = blurRGBA(px, c.width, c.height, sigma, sigma);
      }
      const lut = new Uint8ClampedArray(256);
      const e = Math.pow(2, adj.exposure / 100);
      const con = adj.contrast / 100;
      const hi = adj.highlights / 100;
      const sh = adj.shadows / 100;
      const wh = adj.whites / 100;
      const bl = adj.blacks / 100;
      for (let i = 0; i < 256; i++) {
        let v = i / 255;
        v = Math.pow(v, 1 / (0.6 + e * 0.6));
        v = (v - 0.5) * (1 + con) + 0.5;
        if (v > 0.5) v += hi * (v - 0.5) * 0.9 + wh * 0.16;
        else v += sh * (0.5 - v) * 0.9 + bl * 0.16;
        lut[i] = clamp(Math.round(v * 255), 0, 255);
      }
      const warmth = adj.temp / 100;
      const tint = adj.tint / 100;
      const sat = adj.mono ? -1 : (adj.saturation / 100) + (adj.vibrance / 200);
      const cx = c.width / 2, cy = c.height / 2;
      const maxD = Math.sqrt(cx * cx + cy * cy);
      const vig = adj.vignette / 100;
      const clarity = adj.clarity / 100;
      const dehaze = adj.dehaze / 100;
      // 清晰度用 3×3 均值做非锐化掩模；去朦胧压低空气光并补对比
      let blur = null;
      if (clarity > 0.001) {
        blur = new Uint8ClampedArray(px.length);
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            let r = 0, g2 = 0, b2 = 0, n = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || yy >= c.height || xx < 0 || xx >= c.width) continue;
              const j = (yy * c.width + xx) * 4;
              r += lut[srcPx[j]]; g2 += lut[srcPx[j + 1]]; b2 += lut[srcPx[j + 2]]; n++;
            }
            blur[i] = r / n; blur[i + 1] = g2 / n; blur[i + 2] = b2 / n; blur[i + 3] = 255;
          }
        }
      }
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          let r = lut[srcPx[i]], gg = lut[srcPx[i + 1]], b = lut[srcPx[i + 2]];
          r = clamp(r + warmth * 28 - tint * 6, 0, 255);
          b = clamp(b - warmth * 28 + tint * 6, 0, 255);
          gg = clamp(gg + tint * 10, 0, 255);
          if (dehaze > 0.001) {
            // 去雾：减去空气光底色，再按强度回拉对比
            r = clamp((r - 34 * dehaze) / (1 - 0.22 * dehaze), 0, 255);
            gg = clamp((gg - 34 * dehaze) / (1 - 0.22 * dehaze), 0, 255);
            b = clamp((b - 34 * dehaze) / (1 - 0.22 * dehaze), 0, 255);
          }
          if (blur && clarity > 0.001) {
            r = clamp(r + (r - blur[i]) * clarity * 0.9, 0, 255);
            gg = clamp(gg + (gg - blur[i + 1]) * clarity * 0.9, 0, 255);
            b = clamp(b + (b - blur[i + 2]) * clarity * 0.9, 0, 255);
          }
          const lum = r * 0.299 + gg * 0.587 + b * 0.114;
          r = clamp(lum + (r - lum) * (1 + sat), 0, 255);
          gg = clamp(lum + (gg - lum) * (1 + sat), 0, 255);
          b = clamp(lum + (b - lum) * (1 + sat), 0, 255);
          if (vig > 0) {
            const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD;
            const k = 1 - vig * Math.max(0, d - 0.45) * 1.7;
            r *= k; gg *= k; b *= k;
          }
          px[i] = r; px[i + 1] = gg; px[i + 2] = b;
        }
      }
      g.putImageData(data, 0, 0);
      return c;
    }

    function paint() {
      view.clear('#111111');
      const out = process();
      const r = Math.min(W / out.width, H / out.height);
      const dw = out.width * r, dh = out.height * r;
      view.ctx.drawImage(out, (W - dw) / 2, (H - dh) / 2, dw, dh);
      shell.setStatus(photos[cur].name + ' · 曝光 ' + (adj.exposure > 0 ? '+' : '') + adj.exposure + ' · 对比 ' + (adj.contrast > 0 ? '+' : '') + adj.contrast + ' · 饱和 ' + (adj.saturation > 0 ? '+' : '') + adj.saturation + (adj.blur > 0 ? ' · 模糊 ' + adj.blur : ''));
      shell.setInfo('sRGB · 8 bit');
      drawHistogram();
    }

    let histCanvas = null;
    function drawHistogram() {
      if (!histCanvas) return;
      const g = histCanvas.getContext('2d');
      g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, histCanvas.width, histCanvas.height);
      const bins = [new Array(64).fill(0), new Array(64).fill(0), new Array(64).fill(0)];
      const tmp = document.createElement('canvas');
      tmp.width = 160; tmp.height = 100;
      const tg = tmp.getContext('2d');
      tg.drawImage(source, 0, 0, 160, 100);
      const d = tg.getImageData(0, 0, 160, 100).data;
      for (let i = 0; i < d.length; i += 4) {
        bins[0][d[i] >> 2]++; bins[1][d[i + 1] >> 2]++; bins[2][d[i + 2] >> 2]++;
      }
      let max = 1;
      bins.forEach((b) => b.forEach((v) => { if (v > max) max = v; }));
      const colors = ['rgba(220,80,70,.62)', 'rgba(90,190,110,.55)', 'rgba(80,140,230,.55)'];
      bins.forEach((b, k) => {
        g.beginPath();
        g.moveTo(0, histCanvas.height);
        b.forEach((v, i) => g.lineTo((i / 63) * histCanvas.width, histCanvas.height - (v / max) * (histCanvas.height - 4)));
        g.lineTo(histCanvas.width, histCanvas.height);
        g.closePath();
        g.fillStyle = colors[k]; g.fill();
      });
    }

    function renderRight() {
      clear(right);
      histCanvas = h('canvas', { class: 'ag-lr-hist', width: 264, height: 84 });
      right.append(histCanvas);
      drawHistogram();
      const head = h('div', { style: 'display:flex;align-items:center;padding:6px 8px;border-bottom:1px solid var(--ag-line)' },
        h('span', { style: 'flex:1 1 auto;font-size:11px;font-weight:600' }, '编辑'),
        h('button', { class: 'ag-btn', type: 'button', style: 'margin:0 4px 0 0', onclick: autoTone }, '自动'),
        h('button', { class: 'ag-btn', type: 'button', style: 'margin:0', onclick: toggleMono }, adj.mono ? '彩色' : '黑白'));
      right.append(head);

      const stack = h('div', { class: 'ag-panel-stack' });
      const light = panel('光线');
      light.body.append(
        sliderRow('曝光', -100, 100, 1, adj.exposure, v => (v > 0 ? '+' : '') + v, v => { adj.exposure = v; paint(); }),
        sliderRow('对比度', -100, 100, 1, adj.contrast, v => (v > 0 ? '+' : '') + v, v => { adj.contrast = v; paint(); }),
        sliderRow('高光', -100, 100, 1, adj.highlights, v => (v > 0 ? '+' : '') + v, v => { adj.highlights = v; paint(); }),
        sliderRow('阴影', -100, 100, 1, adj.shadows, v => (v > 0 ? '+' : '') + v, v => { adj.shadows = v; paint(); }),
        sliderRow('白色', -100, 100, 1, adj.whites, v => (v > 0 ? '+' : '') + v, v => { adj.whites = v; paint(); }),
        sliderRow('黑色', -100, 100, 1, adj.blacks, v => (v > 0 ? '+' : '') + v, v => { adj.blacks = v; paint(); }));
      const color = panel('颜色');
      color.body.append(
        sliderRow('色温', -100, 100, 1, adj.temp, v => (v > 0 ? '+' : '') + v, v => { adj.temp = v; paint(); }),
        sliderRow('色调', -100, 100, 1, adj.tint, v => (v > 0 ? '+' : '') + v, v => { adj.tint = v; paint(); }),
        sliderRow('自然饱和度', -100, 100, 1, adj.vibrance, v => (v > 0 ? '+' : '') + v, v => { adj.vibrance = v; paint(); }),
        sliderRow('饱和度', -100, 100, 1, adj.saturation, v => (v > 0 ? '+' : '') + v, v => { adj.saturation = v; paint(); }));
      const fx = panel('效果');
      fx.body.append(
        sliderRow('清晰度', -100, 100, 1, adj.clarity, v => (v > 0 ? '+' : '') + v, v => { adj.clarity = v; paint(); }),
        sliderRow('去朦胧', -100, 100, 1, adj.dehaze, v => (v > 0 ? '+' : '') + v, v => { adj.dehaze = v; paint(); }),
        sliderRow('模糊', 0, 100, 1, adj.blur, v => v, v => { adj.blur = v; paint(); }),
        sliderRow('暗角', -100, 100, 1, adj.vignette, v => (v > 0 ? '+' : '') + v, v => { adj.vignette = v; paint(); }));
      stack.append(light.el, color.el, fx.el, h('div', { style: 'padding:8px' },
        h('button', { class: 'ag-btn', type: 'button', onclick: resetAll }, '复位所有参数'),
        h('button', { class: 'ag-btn primary', type: 'button', onclick: exportPng }, '导出 PNG')));
      right.append(stack);
    }

    function toggleMono() { adj.mono = !adj.mono; paint(); renderRight(); }
    function autoTone() {
      adj.exposure = 12; adj.contrast = 10; adj.highlights = -20; adj.shadows = 18; adj.whites = 8; adj.blacks = -6;
      paint(); renderRight();
    }
    function resetAll() {
      Object.keys(adj).forEach((k) => { adj[k] = 0; });
      adj.mono = false;
      paint(); renderRight();
    }
    function exportPng() {
      const out = process();
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.getContext('2d').drawImage(out, 0, 0, W, H);
      saveCanvas(c, 'lightcraft-' + photos[cur].name.replace(/\.jpg$/, '') + '.png');
      toastIn(shell.root, 'PNG 已导出');
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '导入照片…', onClick: () => pickImage((img) => {
          if (!img) return;
          const c = document.createElement('canvas');
          c.width = Math.min(1200, img.width); c.height = Math.round(c.width * img.height / img.width);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          photos.push({ name: '导入-' + photos.length + '.jpg', canvas: c });
          selectPhoto(photos.length - 1);
        }) },
        { label: '导出 PNG', shortcut: '⌘S', onClick: exportPng },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '照片', items: [
        { label: '自动色调', onClick: autoTone },
        { label: adj.mono ? '切回彩色' : '黑白', onClick: toggleMono },
        { sep: true }, { label: '复位所有参数', onClick: resetAll },
      ] },
      { label: '视图', items: [
        { label: '适应窗口', onClick: () => { view.canvas.style.maxWidth = '100%'; view.canvas.style.maxHeight = '100%'; } },
      ] },
    ]);

    const scope = commandScope();
    scope.add('lightcraft.reset', '复位显影参数', resetAll);
    scope.add('lightcraft.export', '导出 PNG', exportPng);

    paint();
    renderRight();
    shell.setInfo('sRGB · 8 bit');
    return { destroy() { scope.dispose(); } };
  },
});

/* ============================ TextureCraft：贴图 ============================ */

craft({
  id: 'texturecraft', name: 'TextureCraft', up: '贴图 · 手绘', group: 'image', tag: '贴图',
  blurb: '程序纹理层、3D 球面预览与 2D 平铺，导出 PNG。',
  hint: '左栏换材质，右栏调图案与颜色',
  mount(host) {
    const shell = craftShell(host, {
      name: 'TextureCraft', file: 'plastic-shell', up: '贴图 · 手绘', tag: 'Painting',
      theme: 'dark', layout: 'substance',
    });
    const S = 512;
    const assets = h('aside', { class: 'ag-sp-assets' });
    const views = h('div', { class: 'ag-sp-views' });
    const v3 = h('div', { class: 'ag-sp-view' });
    const v2 = h('div', { class: 'ag-sp-view' });
    const view3 = h('div', { class: 'ag-sp-viewbody' });
    const view2 = h('div', { class: 'ag-sp-viewbody' });
    v3.append(h('div', { class: 'ag-sp-viewhead' }, '3D 视图 · 球面'), view3);
    v2.append(h('div', { class: 'ag-sp-viewhead' }, '2D 视图 · UV 平铺'), view2);
    views.append(v3, v2);
    const right = h('aside', { class: 'ag-sp-right' });
    shell.body.append(assets, views, right);

    const tex = document.createElement('canvas');
    tex.width = S; tex.height = S;
    const tg = tex.getContext('2d');
    const c3 = h('canvas', { class: 'ag-canvas', width: 420, height: 420 });
    const c2 = h('canvas', { class: 'ag-canvas', width: 360, height: 360 });
    view3.append(c3); view2.append(c2);
    const g3 = c3.getContext('2d');

    const st = { kind: 'bricks', scale: 8, a: '#8a5a3a', b: '#d8c2a0', accent: '#c0392b', seed: 7 };
    const mats = [
      { name: '塑料白', kind: 'dots', a: '#e8e0d0', b: '#c0392b', scale: 12 },
      { name: '砖墙', kind: 'bricks', a: '#8a5a3a', b: '#c9b090', scale: 8 },
      { name: '拉丝金属', kind: 'stripes', a: '#8d939a', b: '#c9ced4', scale: 26 },
      { name: '粗糙铁', kind: 'noise', a: '#6a5a4a', b: '#a89070', scale: 20 },
      { name: '棋盘', kind: 'checker', a: '#2b2b2b', b: '#e4e4e4', scale: 10 },
      { name: '布纹', kind: 'stripes', a: '#5a6a7a', b: '#8a9aaa', scale: 34 },
    ];
    const layers = [
      { name: '底色层', color: '#8a5a3a', on: true },
      { name: '图案层', color: '#c9b090', on: true },
      { name: '细节层', color: '#c0392b', on: true },
    ];

    function rnd(seed) {
      let t = seed >>> 0;
      return function () {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    }

    function paintTexture() {
      const n = Math.round(clamp(st.scale, 2, 40));
      tg.fillStyle = layers[0].on ? layers[0].color : '#3a3a3a';
      tg.fillRect(0, 0, S, S);
      if (layers[1].on) {
      tg.fillStyle = st.b;
      if (st.kind === 'bricks') {
        const bh = S / n, bw = bh * 2;
        for (let row = 0; row < n; row++) {
          const off = row % 2 ? -bw / 2 : 0;
          for (let x = off; x < S; x += bw) tg.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
        }
      } else if (st.kind === 'checker') {
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          tg.fillStyle = (x + y) % 2 ? st.b : st.a;
          tg.fillRect(x * S / n, y * S / n, S / n + 1, S / n + 1);
        }
      } else if (st.kind === 'stripes') {
        for (let i = 0; i < n; i++) tg.fillRect(i * S / n, 0, S / n / 2, S);
      } else if (st.kind === 'dots') {
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          tg.beginPath();
          tg.arc((x + .5) * S / n, (y + .5) * S / n, S / n * .28, 0, Math.PI * 2);
          tg.fill();
        }
      } else {
        const rand = rnd(st.seed);
        const img = tg.getImageData(0, 0, S, S);
        const ca = hex(st.a), cb = hex(st.b);
        for (let i = 0; i < img.data.length; i += 4) {
          const k = rand();
          img.data[i] = ca[0] + (cb[0] - ca[0]) * k;
          img.data[i + 1] = ca[1] + (cb[1] - ca[1]) * k;
          img.data[i + 2] = ca[2] + (cb[2] - ca[2]) * k;
          img.data[i + 3] = 255;
        }
        tg.putImageData(img, 0, 0);
      }
      }
      if (layers[2].on) {
        // 细节层：稀疏的亮色颜料点，模拟手绘痕迹。
        const rand = rnd(st.seed + 31);
        tg.fillStyle = st.accent;
        for (let i = 0; i < 60; i++) {
          tg.globalAlpha = 0.15 + rand() * 0.4;
          tg.beginPath();
          tg.arc(rand() * S, rand() * S, 1 + rand() * 3, 0, Math.PI * 2);
          tg.fill();
        }
        tg.globalAlpha = 1;
      }
    }

    function hex(s) {
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    }

    function paint3d() {
      const w = c3.width, h = c3.height;
      g3.clearRect(0, 0, w, h);
      g3.fillStyle = '#161616'; g3.fillRect(0, 0, w, h);
      const R = 150, cx = w / 2, cy = h / 2;
      // 先把纹理压进球面，再叠一层光照与边缘光，得到可读的材质预览。
      const pat = g3.createPattern(tex, 'repeat');
      g3.save();
      g3.beginPath();
      g3.arc(cx, cy, R, 0, Math.PI * 2);
      g3.clip();
      g3.fillStyle = pat;
      g3.fillRect(cx - R, cy - R, R * 2, R * 2);
      const shade = g3.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.15);
      shade.addColorStop(0, 'rgba(255,255,255,.55)');
      shade.addColorStop(0.45, 'rgba(255,255,255,.05)');
      shade.addColorStop(0.8, 'rgba(0,0,0,.35)');
      shade.addColorStop(1, 'rgba(0,0,0,.82)');
      g3.fillStyle = shade;
      g3.fillRect(cx - R, cy - R, R * 2, R * 2);
      g3.restore();
      g3.beginPath();
      g3.arc(cx, cy, R, 0, Math.PI * 2);
      g3.strokeStyle = 'rgba(255,255,255,.18)';
      g3.stroke();
      g3.fillStyle = 'rgba(220,220,220,.7)';
      g3.font = '10px "SF Mono", monospace';
      g3.fillText(st.kind + ' · ' + Math.round(st.scale) + '×', 12, h - 12);
    }

    function paint2d() {
      const g = c2.getContext('2d');
      g.clearRect(0, 0, c2.width, c2.height);
      g.drawImage(tex, 0, 0, c2.width, c2.height);
      g.strokeStyle = 'rgba(255,255,255,.2)';
      g.strokeRect(0.5, 0.5, c2.width - 1, c2.height - 1);
    }

    function paint() {
      paintTexture();
      paint3d();
      paint2d();
      shell.setStatus(st.kind + ' · ' + st.scale + ' 单元 · ' + S + '×' + S + ' · 3 层');
      shell.setInfo('RGB · 8 bit · UV');
    }

    function renderAssets() {
      clear(assets);
      assets.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '资产'), h('span', { class: 'ag-panel-caret' }, '材质')));
      const grid = h('div', { class: 'ag-sp-matgrid' });
      mats.forEach((m, i) => {
        const sphere = h('div', {
          class: 'ag-sp-sphere',
          style: 'background:radial-gradient(circle at 34% 30%, #fff 0%, ' + m.a + ' 45%, #111 100%)',
        });
        const b = h('button', { class: 'ag-sp-mat' + (st.kind === m.kind && st.scale === m.scale ? ' active' : ''), type: 'button', onclick: () => {
          st.kind = m.kind; st.a = m.a; st.b = m.b; st.scale = m.scale;
          layers[0].color = m.a; layers[1].color = m.b;
          paint(); renderRight(); renderAssets();
        } }, sphere, h('span', {}, m.name));
        grid.append(b);
      });
      assets.append(grid);
      assets.append(h('div', { class: 'ag-panel-body' },
        h('button', { class: 'ag-btn', type: 'button', onclick: () => { st.seed = Math.floor(Math.random() * 99999); paint(); } }, '重新随机')));
    }

    function renderRight() {
      clear(right);
      right.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '纹理集列表'), h('span', { class: 'ag-panel-caret' }, '1')));
      const ts = h('div', { class: 'ag-panel-body' });
      ts.append(h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, 'plastic-shell'), h('span', { class: 'ag-hint', style: 'margin:0' }, '2048×2048')));
      right.append(ts);

      const lp = panel('图层');
      const ll = h('div', { class: 'ag-sp-layers' });
      layers.forEach((l) => {
        ll.append(h('div', { class: 'ag-sp-layer' },
          h('span', { class: 'ag-sp-swatch', style: 'background:' + l.color }),
          h('span', { style: 'flex:1 1 auto' }, l.name),
          h('button', {
            class: 'ag-icbtn', type: 'button', title: l.on ? '隐藏' : '显示',
            onclick() { l.on = !l.on; paint(); renderRight(); },
          }, icon('eye', 12))));
      });
      lp.body.append(ll);
      right.append(lp.el);

      const pp = panel('属性 · 填充');
      pp.body.append(
        h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, '投影'), h('span', {}, 'UV 投影')),
        h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, '缩放 / 平铺'), h('span', {}, '1.00')),
        colorRow('基础色', st.a, (v) => { st.a = v; layers[0].color = v; paint(); }),
        colorRow('图案色', st.b, (v) => { st.b = v; layers[1].color = v; paint(); }),
        colorRow('细节色', st.accent, (v) => { st.accent = v; paint(); }),
        sliderRow('密度', 2, 40, 1, st.scale, (v) => v + '×', (v) => { st.scale = v; paint(); }),
        h('div', { class: 'ag-row' },
          h('button', { class: 'ag-btn', type: 'button', onclick: () => { st.kind = 'bricks'; paint(); renderRight(); renderAssets(); } }, '砖墙'),
          h('button', { class: 'ag-btn', type: 'button', onclick: () => { st.kind = 'noise'; paint(); renderRight(); renderAssets(); } }, '噪声'),
          h('button', { class: 'ag-btn primary', type: 'button', onclick: exportPng }, '导出 PNG')));
      right.append(pp.el);
    }

    function exportPng() {
      const out = document.createElement('canvas');
      out.width = S; out.height = S;
      out.getContext('2d').drawImage(tex, 0, 0);
      saveCanvas(out, 'texture-' + st.kind + '.png');
      toastIn(shell.root, 'PNG 已导出');
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '导出 PNG', shortcut: '⌘S', onClick: exportPng },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '纹理', items: [
        { label: '砖墙', checked: st.kind === 'bricks', onClick: () => { st.kind = 'bricks'; paint(); renderRight(); } },
        { label: '噪声', checked: st.kind === 'noise', onClick: () => { st.kind = 'noise'; paint(); renderRight(); } },
        { label: '棋盘', checked: st.kind === 'checker', onClick: () => { st.kind = 'checker'; paint(); renderRight(); } },
        { label: '条纹', checked: st.kind === 'stripes', onClick: () => { st.kind = 'stripes'; paint(); renderRight(); } },
        { label: '圆点', checked: st.kind === 'dots', onClick: () => { st.kind = 'dots'; paint(); renderRight(); } },
      ] },
      { label: '帮助', items: [{ label: '说明', onClick: () => toastIn(shell.root, '3D 预览把同一张纹理压进球面，导出为 2D 平铺 PNG') }] },
    ]);

    const scope = commandScope();
    scope.add('texturecraft.export', '导出 PNG', exportPng);
    scope.add('texturecraft.random', '重新随机纹理', () => { st.seed = Math.floor(Math.random() * 99999); paint(); });

    renderAssets();
    renderRight();
    paint();
    return { destroy() { scope.dispose(); } };
  },
});

/* ============================ MaterialCraft：材质节点 ============================ */

craft({
  id: 'materialcraft', name: 'MaterialCraft', up: '材质 · 节点', group: 'image', tag: '节点',
  blurb: '节点图生成砖墙材质，3D 立方体与 2D 视图实时联动。',
  hint: '拖动节点；点选节点在右栏改参数',
  mount(host) {
    const shell = craftShell(host, {
      name: 'MaterialCraft', file: 'Brick_wall', up: '材质 · 节点', tag: 'GPU',
      theme: 'dark', layout: 'designer',
    });
    const explorer = h('aside', { class: 'ag-sp-assets' });
    const center = h('div', { class: 'ag-sd-top' });
    const graph = h('div', { class: 'ag-sd-graph' });
    const views = h('div', { class: 'ag-sd-views' });
    center.append(graph, views);
    const right = h('aside', { class: 'ag-sp-right' });
    shell.body.append(explorer, center, right);

    const st = {
      width: 1, height: 1, bricksX: 6, bricksY: 12, offset: 0.5, gap: 0.03, bevel: 0.3, seed: 3, selected: 'brick',
      noiseScale: 10, noiseSeed: 9, blend: 'overlay', mix: 0.3,
    };
    const nodes = [
      { id: 'noise', title: '噪声', x: 30, y: 34, kind: 'noise' },
      { id: 'brick', title: '砖块生成器', x: 210, y: 100, kind: 'brick' },
      { id: 'blend', title: '混合', x: 400, y: 70, kind: 'blend' },
      { id: 'out', title: '输出', x: 570, y: 150, kind: 'out' },
    ];
    const links = [['noise', 'blend'], ['brick', 'blend'], ['blend', 'out']];

    const tex = document.createElement('canvas');
    tex.width = 512; tex.height = 512;
    const tg = tex.getContext('2d');
    const cube = h('canvas', { class: 'ag-canvas', width: 440, height: 300 });
    const flat = h('canvas', { class: 'ag-canvas', width: 360, height: 300 });
    const v3 = h('div', { class: 'ag-sd-view' },
      h('div', { class: 'ag-sd-view-head' }, 'ROUNDED CUBE · 3D 视图'),
      h('div', { class: 'ag-sd-view-body' }, cube));
    const v2 = h('div', { class: 'ag-sd-view' },
      h('div', { class: 'ag-sd-view-head' }, 'BRICK WALL · 2D 视图'),
      h('div', { class: 'ag-sd-view-body' }, flat));
    views.append(v3, v2);

    function hex(s) {
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    }
    function rnd(seed) {
      let t = seed >>> 0;
      return function () {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    }

    function paintTexture() {
      const S = 512;
      const rand = rnd(st.seed);
      tg.fillStyle = '#2a211c';
      tg.fillRect(0, 0, S, S);
      const bx = Math.round(clamp(st.bricksX, 1, 16));
      const by = Math.round(clamp(st.bricksY, 1, 30));
      const bw = S / bx, bh = S / by;
      const gap = st.gap * Math.min(bw, bh);
      for (let row = 0; row < by; row++) {
        const off = (row % 2) * st.offset * bw;
        for (let col = -1; col <= bx; col++) {
          const x = col * bw + off + gap;
          const y = row * bh + gap;
          const shade = 0.62 + rand() * 0.3;
          tg.fillStyle = 'rgb(' + Math.round(168 * shade) + ',' + Math.round(98 * shade) + ',' + Math.round(62 * shade) + ')';
          roundRect(tg, x, y, bw - gap * 2, bh - gap * 2, st.bevel * 4);
          tg.fill();
          // 高光与阴影给砖块一点厚度
          tg.fillStyle = 'rgba(255,220,190,.17)';
          tg.fillRect(x, y, bw - gap * 2, 2);
          tg.fillStyle = 'rgba(0,0,0,.22)';
          tg.fillRect(x, y + bh - gap * 2 - 2, bw - gap * 2, 2);
        }
      }
      // 砂浆颗粒
      for (let i = 0; i < 2600; i++) {
        tg.fillStyle = 'rgba(255,255,255,' + (rand() * 0.05).toFixed(3) + ')';
        tg.fillRect(rand() * S, rand() * S, 1, 1);
      }
      // 噪声节点经混合节点进入输出：按当前模式与强度叠一层灰度噪点。
      if (st.mix > 0) {
        const nr = rnd(st.noiseSeed);
        const step = Math.max(1, Math.round(64 / Math.max(1, st.noiseScale)));
        tg.save();
        tg.globalAlpha = clamp(st.mix, 0, 1);
        tg.globalCompositeOperation = st.blend === 'normal' ? 'source-over' : st.blend;
        for (let y = 0; y < S; y += step) {
          for (let x = 0; x < S; x += step) {
            const v = Math.round(nr() * 255);
            tg.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
            tg.fillRect(x, y, step, step);
          }
        }
        tg.restore();
      }
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

    function paintCube() {
      const g = cube.getContext('2d');
      g.clearRect(0, 0, cube.width, cube.height);
      g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, cube.width, cube.height);
      const cx = cube.width / 2, cy = cube.height / 2 + 16, s = 92, d = 48;
      const top = [[cx, cy - s - d], [cx + s, cy - s / 2 - d], [cx, cy - d], [cx - s, cy - s / 2 - d]];
      const left = [[cx - s, cy - s / 2 - d], [cx, cy - d], [cx, cy + s - d], [cx - s, cy + s / 2 - d]];
      const rightF = [[cx, cy - d], [cx + s, cy - s / 2 - d], [cx + s, cy + s / 2 - d], [cx, cy + s - d]];

      function face(pts, shade) {
        g.save();
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
        g.clip();
        const pat = g.createPattern(tex, 'repeat');
        g.fillStyle = pat;
        g.fillRect(0, 0, cube.width, cube.height);
        g.fillStyle = 'rgba(0,0,0,' + shade + ')';
        g.fillRect(0, 0, cube.width, cube.height);
        g.restore();
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
        g.strokeStyle = 'rgba(255,255,255,.12)';
        g.stroke();
      }
      face(top, 0.05);
      face(left, 0.45);
      face(rightF, 0.2);
      g.fillStyle = 'rgba(230,230,230,.6)';
      g.font = '10px "SF Mono", monospace';
      g.fillText('Rounded cube · 92 px', 12, cube.height - 10);
    }

    function paintFlat() {
      const g = flat.getContext('2d');
      g.clearRect(0, 0, flat.width, flat.height);
      g.drawImage(tex, 0, 0, flat.width, flat.height);
    }

    function paint() {
      paintTexture(); paintCube(); paintFlat();
      shell.setStatus('砖块生成器 · ' + st.bricksX + '×' + st.bricksY + ' · 间隙 ' + st.gap.toFixed(2) + ' · seed ' + st.seed);
      shell.setInfo('GPU · 预览 512×512');
    }

    /* 节点图 */
    function renderGraph() {
      clear(graph);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ag-sd-links');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.style.position = 'absolute';
      svg.style.left = '0';
      svg.style.top = '0';
      svg.style.pointerEvents = 'none';
      graph.append(svg);
      links.forEach((pair) => {
        const a = nodes.filter((n) => n.id === pair[0])[0];
        const b = nodes.filter((n) => n.id === pair[1])[0];
        if (!a || !b) return;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const x1 = a.x + 116, y1 = a.y + 60, x2 = b.x, y2 = b.y + 60;
        line.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + (x1 + 50) + ' ' + y1 + ' ' + (x2 - 50) + ' ' + y2 + ' ' + x2 + ' ' + y2);
        line.setAttribute('stroke', '#6a6a6a');
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke-width', '1.5');
        svg.append(line);
      });
      nodes.forEach((n) => {
        const node = h('div', {
          class: 'ag-sd-node' + (st.selected === n.id ? ' active' : ''),
          style: 'left:' + n.x + 'px;top:' + n.y + 'px',
          onclick() { st.selected = n.id; renderGraph(); renderRight(); },
        },
        h('div', { class: 'ag-sd-node-head' }, n.title),
        h('div', { class: 'ag-sd-node-body' }, h('canvas', { width: 100, height: 58, class: n.kind })));
        // 节点缩略图：把当前纹理按节点类型做不同取样。
        const c = node.querySelector('canvas');
        const g = c.getContext('2d');
        if (n.kind === 'out') g.drawImage(tex, 0, 0, 100, 58);
        else if (n.kind === 'brick') g.drawImage(tex, 60, 40, 100, 58, 0, 0, 100, 58);
        else if (n.kind === 'noise') {
          const r = rnd(st.noiseSeed);
          const step = Math.max(2, Math.round(40 / Math.max(1, st.noiseScale)));
          for (let y = 0; y < 58; y += step) for (let x = 0; x < 100; x += step) {
            const v = Math.round(r() * 255);
            g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
            g.fillRect(x, y, step, step);
          }
        } else g.drawImage(tex, 0, 0, 100, 58);
        node.addEventListener('pointerdown', (ev) => {
          // 选中态就地切换：重建节点图会移除当前节点，click 就永远到不了它。
          st.selected = n.id;
          const all = graph.querySelectorAll('.ag-sd-node');
          for (let i = 0; i < all.length; i++) all[i].classList.toggle('active', all[i] === node);
          renderRight();
          if (ev.target.tagName === 'CANVAS' && n.kind !== 'out') return;
          ev.preventDefault();
          const startX = ev.clientX, startY = ev.clientY, ox = n.x, oy = n.y;
          const move = (e) => {
            n.x = Math.max(0, ox + e.clientX - startX);
            n.y = Math.max(0, oy + e.clientY - startY);
            node.style.left = n.x + 'px';
            node.style.top = n.y + 'px';
            const line = svg.querySelectorAll('path');
            line.forEach(() => {});
            // 连接线在拖动结束后统一重画，避免每帧重建节点。
          };
          const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            renderGraph();
          };
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
        });
        graph.append(node);
      });
    }

    function renderExplorer() {
      clear(explorer);
      explorer.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '资源管理器'), h('span', { class: 'ag-panel-caret' }, 'Brick_wall')));
      const body = h('div', { class: 'ag-panel-body' });
      body.append(h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, '图形'), h('span', {}, '4 节点')));
      body.append(h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, '输出'), h('span', {}, 'Base Color')));
      body.append(h('button', { class: 'ag-btn', type: 'button', onclick: () => { st.seed = Math.floor(Math.random() * 9999); paint(); renderGraph(); } }, '随机种子'));
      explorer.append(body);
      explorer.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '库'), h('span', { class: 'ag-panel-caret' }, '过滤')));
      const lib = h('div', { class: 'ag-panel-body' });
      [['砖块生成器', 'brick'], ['噪波', 'noise'], ['混合', 'blend'], ['渐变', 'blend']].forEach(([label, kind]) => {
        lib.append(h('button', {
          class: 'ag-list-item', type: 'button',
          onclick() {
            nodes.push({ id: kind + nodes.length, title: label, x: 40 + nodes.length * 26, y: 170 + (nodes.length % 3) * 30, kind: kind });
            renderGraph();
            shell.setStatus('已添加节点：' + label);
          },
        }, h('span', { class: 'ag-list-name' }, label)));
      });
      explorer.append(lib);
    }

    function appendViewPanel() {
      const q = panel('视图');
      q.body.append(h('button', { class: 'ag-btn primary', type: 'button', onclick: exportPng }, '导出 2D PNG'));
      right.append(q.el);
    }

    function renderRight() {
      clear(right);
      const sel = nodes.filter((n) => n.id === st.selected)[0];
      const kind = sel ? sel.kind : 'brick';

      if (kind === 'noise') {
        const p = panel('噪声 · 属性');
        p.body.append(h('p', { class: 'ag-hint' }, '分形噪声驱动砖面颗粒，也作为混合节点的输入。'));
        p.body.append(
          sliderRow('缩放', 1, 40, 1, st.noiseScale, (v) => '× ' + v, (v) => { st.noiseScale = v; paint(); renderGraph(); }),
          numberField('随机种子', st.noiseSeed, { min: 0, max: 9999, onInput: (v) => { st.noiseSeed = Math.round(v); paint(); renderGraph(); } }));
        right.append(p.el);
        appendViewPanel();
        return;
      }
      if (kind === 'blend') {
        const p = panel('混合 · 属性');
        p.body.append(h('p', { class: 'ag-hint' }, '把噪声叠加到砖块输出；模式与强度实时生效。'));
        p.body.append(selectField('混合模式', [
          { value: 'overlay', label: '叠加 Overlay' },
          { value: 'multiply', label: '正片叠底 Multiply' },
          { value: 'screen', label: '滤色 Screen' },
          { value: 'normal', label: '正常 Normal' },
        ], st.blend, (v) => { st.blend = v; paint(); }));
        p.body.append(sliderRow('强度', 0, 1, 0.01, st.mix, (v) => Math.round(v * 100) + '%', (v) => { st.mix = v; paint(); }));
        right.append(p.el);
        appendViewPanel();
        return;
      }
      if (kind === 'out') {
        const p = panel('输出 · 属性');
        p.body.append(h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, '通道'), h('span', {}, 'Base Color')));
        p.body.append(h('div', { class: 'ag-frow' }, h('span', { class: 'ag-frow-label' }, '尺寸'), h('span', {}, '512 × 512')));
        p.body.append(h('p', { class: 'ag-hint' }, '输出节点聚合混合结果；导出的是当前 2D 纹理。'));
        right.append(p.el);
        appendViewPanel();
        return;
      }

      const p = panel('砖块生成器 · 属性');
      const b = p.body;
      b.append(h('p', { class: 'ag-hint' }, '砖墙由错缝的砖块与随机灰缝组成。'));
      b.append(sectionLabel('基本参数'));
      b.append(
        sliderRow('宽度', 1, 16, 1, st.bricksX, v => '× ' + v, (v) => { st.bricksX = v; paint(); }),
        sliderRow('高度', 1, 30, 1, st.bricksY, v => '× ' + v, (v) => { st.bricksY = v; paint(); }),
        sliderRow('行偏移', 0, 1, 0.01, st.offset, v => v.toFixed(2), (v) => { st.offset = v; paint(); }),
        sliderRow('间隙', 0, 0.2, 0.005, st.gap, v => v.toFixed(3), (v) => { st.gap = v; paint(); }),
        sliderRow('倒角', 0, 1, 0.01, st.bevel, v => v.toFixed(2), (v) => { st.bevel = v; paint(); }),
        numberField('随机种子', st.seed, { min: 0, max: 9999, onInput: (v) => { st.seed = Math.round(v); paint(); } }));
      right.append(p.el);
      appendViewPanel();
    }

    function exportPng() {
      saveCanvas(tex, 'brick-wall.png');
      toastIn(shell.root, '2D 纹理已导出');
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '导出 2D 纹理', shortcut: '⌘S', onClick: exportPng },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '图形', items: [
        { label: '添加噪波节点', onClick: () => { nodes.push({ id: 'noise' + nodes.length, title: '噪声', x: 60, y: 180, kind: 'noise' }); renderGraph(); } },
        { label: '添加混合节点', onClick: () => { nodes.push({ id: 'blend' + nodes.length, title: '混合', x: 90, y: 200, kind: 'blend' }); renderGraph(); } },
        { sep: true }, { label: '随机种子', onClick: () => { st.seed = Math.floor(Math.random() * 9999); paint(); renderGraph(); } },
      ] },
      { label: '视图', items: [
        { label: '适配节点图', onClick: () => { nodes.forEach((n, i) => { n.x = 30 + i * 120; n.y = 40 + (i % 2) * 70; }); renderGraph(); } },
      ] },
    ]);

    const scope = commandScope();
    scope.add('materialcraft.export', '导出 2D PNG', exportPng);

    renderExplorer();
    renderRight();
    paint();          // 先画纹理，节点缩略图才能取到像素
    renderGraph();
    return { destroy() { scope.dispose(); } };
  },
});
