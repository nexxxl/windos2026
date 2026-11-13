import { h, clear, api, fmt } from './can.js';
import { icon } from './icons.js';
import { renderMarkdown } from './md.js';

// 关系图谱：只读 /nexl交换区 里的 Markdown，把 [[双链]] 画成节点和连线。
// 渲染是纯 Canvas 2D + 自己写的小型力导向（网格去重 + 簇间斥力），
// 不引第三方库，也不碰 GPU；节点上限由后端 graph.index 控制。

const FOLDER_COLORS = [
  '#4a6fd4', '#e0863f', '#5fae72', '#3fa8b8',
  '#8a63f0', '#d95f8a', '#8e8b84', '#a9764a',
];
const GHOST_COLOR = '#b8b2a6';
const MAX_TICKS = 420;

function hashColor(name) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum = (sum * 31 + name.charCodeAt(i)) >>> 0;
  return FOLDER_COLORS[sum % FOLDER_COLORS.length];
}

export function mountGraph(host) {
  const S = {
    nodes: [], links: [], byId: new Map(), byBase: new Map(), clusters: [],
    scale: 1, tx: 0, ty: 0, alpha: 0, ticks: 0,
    hover: null, selected: null, drag: null, pan: null, isolate: '',
    q: '', dark: false, raf: 0, loading: true, error: '', pendingPath: '',
    sx: null, sy: null, near: null, bench: null, job: null,
    px: null, py: null, vx: null, vy: null, linkA: null, linkB: null, linkW: null,
    cellCount: null, cellOff: null, cellFill: null, cellIdx: null, cellOrder: null,
    stats: { notes: 0, links: 0, tags: 0 }, truncated: false, root: '/nexl交换区',
    folderOf: new Map(),
  };
  // 从记忆树或启动器跳过来时带上路径：#/graph/<相对路径>。
  const hashPath = (location.hash.match(/^#\/graph\/(.+)$/) || [])[1];
  if (hashPath) {
    try { S.pendingPath = decodeURIComponent(hashPath); } catch (e) { S.pendingPath = ''; }
  }

  const canvas = h('canvas', { class: 'gp-canvas' });
  const ctx = canvas.getContext('2d');
  // 压力测试和渲染后端开关只从 URL 读，正常运行路径不受影响。
  const params = new URLSearchParams(location.search);
  const benchN = Math.max(0, Number(params.get('bench')) || 0);
  // 默认走 WebGL 批渲染；?engine=2d 用于 A/B 对比，也方便老机器降级。
  const glCanvas = h('canvas', { class: 'gp-canvas gp-canvas-gl' });
  let render = params.get('engine') === '2d' ? null : createGL(glCanvas);
  if (!render) glCanvas.style.display = 'none';
  if (render) {
    // 显卡进程被杀或驱动重置时退回 2D，图还在，只是慢一点。
    glCanvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      render = null;
      glCanvas.style.display = 'none';
      draw();
    });
  }
  const now = () => performance.now();

  // 压测数据只在内存里生成：6 个文件夹、约 1.4 倍边，长尾连到前面的枢纽，
  // 和真实笔记库的度数分布接近，又不碰用户的交换区目录。
  function synthetic(total) {
    const folders = ['项目', '方法', '观察', '资料', '日志', '灵感'];
    const nodes = [];
    for (let i = 0; i < total; i++) {
      const folder = folders[i % folders.length];
      nodes.push({
        id: `${folder}/笔记-${i}.md`, name: `笔记-${i}`, folder,
        tags: [], out: 0, size: 180 + (i % 9) * 12,
      });
    }
    // 真实笔记库的双链以同文件夹为主，只有少量跨库引用；
    // 按跨库全连压测会把六座岛压成一团，量出来的密度和真实场景不符。
    const edges = [];
    const push = (from, to, w) => {
      if (to >= 0 && to < total && to !== from) {
        edges.push({ source: nodes[from].id, target: nodes[to].id, w: w || 1 });
      }
    };
    for (let i = 1; i < total; i++) {
      const slot = i % 6;
      const prev = i - 6;
      push(i, prev, i % 17 === 0 ? 3 : 1);
      if (i % 4 === 0) {
        const earlier = Math.floor(Math.random() * Math.floor(i / 6)) * 6 + slot;
        push(i, earlier, i % 7 === 0 ? 2 : 1);
      }
      if (i % 13 === 0) push(i, Math.floor(Math.random() * i), 1);
    }
    return { notes: total, links: edges.length, tags: 0, nodes, edges };
  }
  const tip = h('div', { class: 'gp-tip', hidden: true });
  const empty = h('div', { class: 'gp-empty' }, '正在读取交换区…');
  const hint = h('div', { class: 'gp-hint' },
    h('span', {}, '滚轮缩放 · 拖拽平移 · 单击查看 · 双击居中'));
  const legend = h('div', { class: 'gp-legend' });
  const countEl = h('span', { class: 'gp-count' }, '正在读取…');
  const search = h('input', {
    class: 'gp-search', type: 'search', placeholder: '搜索笔记…', spellcheck: 'false',
    oninput: () => { S.q = search.value.trim().toLowerCase(); draw(); },
  });
  const canvasWrap = h('div', { class: 'gp-stage' }, glCanvas, canvas, tip, hint, legend, empty);
  const panel = h('aside', { class: 'gp-panel', hidden: true });
  const frame = h('div', { class: 'gp' },
    h('header', { class: 'gp-bar' },
      h('span', { class: 'gp-bar-ic' }, icon('graph')),
      h('b', {}, '关系图谱'),
      countEl,
      h('span', { class: 'gp-spacer' }),
      search,
      h('button', {
        class: 'gp-btn', type: 'button', title: '只看最大的一簇',
        onclick: () => { centerOn(0); },
      }, '归位'),
      h('button', {
        class: 'gp-btn', type: 'button', title: '重新读取交换区',
        onclick: () => load(),
      }, '刷新')),
    h('div', { class: 'gp-main' }, canvasWrap, panel));
  host.append(frame);

  // ---------- 主题 ----------
  function applyPrefs(p) {
    p = p || {};
    S.dark = p.theme === 'dark';
    frame.classList.toggle('gp-dark', S.dark);
    if (p.accent) frame.style.setProperty('--gp-accent', p.accent);
    draw();
  }
  function onPrefs(e) {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'nexlos.settings') applyPrefs(e.data.patch);
    // 桌面外壳点记忆树里的某篇笔记时，直接把那个点选中、居中。
    if (e.data.type === 'nexlos.graph.focus' && e.data.path) {
      S.pendingPath = String(e.data.path);
      focusPath(S.pendingPath);
    }
  }
  window.addEventListener('message', onPrefs);
  api('settings.get').then((r) => applyPrefs(r.detail || {})).catch(() => {});

  // ---------- 尺寸 ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvasWrap.clientWidth || 800;
    const hgt = canvasWrap.clientHeight || 600;
    // 舞台比例变了就重排岛的位置：首帧可能还没量到真实宽高。
    const nextAspect = Math.min(2.2, Math.max(1, w / hgt));
    if (S.clusters.length && Math.abs((S.aspect || 1) - nextAspect) > 0.08) {
      S.w = w; S.h = hgt;
      anchorClusters(false);
      reheat(0.35);
    }
    // 面板开合只改舞台宽度：按差值的半幅平移，图保持视觉居中，
    // 不做重新取景，避免点一个点就整张图跳一下。
    if (S.w && S.h) {
      S.tx += (w - S.w) / 2;
      S.ty += (hgt - S.h) / 2;
    }
    S.w = w; S.h = hgt; S.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hgt}px`;
    // 两张画布同尺寸：WebGL 画点线，2D 画标签和交互反馈。
    glCanvas.width = canvas.width;
    glCanvas.height = canvas.height;
    glCanvas.style.width = `${w}px`;
    glCanvas.style.height = `${hgt}px`;
    draw();
  }
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  // 被遮挡时 rAF 暂停，回到前台再补一次取景，免得看到半张图。
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    if (!S.userMoved) fitView();
    start();
    draw();
  };
  document.addEventListener('visibilitychange', onVisible);
  const ro = window.ResizeObserver ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(canvasWrap);

  // ---------- 数据 ----------
  async function load() {
    S.loading = true;
    empty.hidden = false;
    empty.textContent = '正在读取交换区…';
    if (benchN) {
      build(synthetic(benchN));
      empty.hidden = S.nodes.length > 0;
      S.loading = false;
      return;
    }
    try {
      const r = await api('graph.index');
      const d = r.detail || {};
      build(d);
      empty.hidden = S.nodes.length > 0;
      if (!S.nodes.length) {
        empty.textContent = 'nexl交换区里还没有 Markdown。把笔记放进去，或点右上角刷新。';
      }
    } catch (e) {
      empty.hidden = false;
      empty.textContent = `读不到交换区：${e.message}`;
      countEl.textContent = '未连接';
    } finally {
      S.loading = false;
    }
  }

  function build(d) {
    // 压力测试：每轮重建都重新计时，结果在收敛后挂到 window.__bench。
    S.bench = benchN ? { frames: [], phys: 0, steps: 0, t0: now(), done: false } : null;
    S.job = null;
    // 刷新可能让已选中的笔记消失：先收起旧面板，避免读到过期的节点对象。
    S.selected = null;
    S.hover = null;
    S.isolate = '';
    panel.hidden = true;
    S.stats = { notes: d.notes || 0, links: d.links || 0, tags: d.tags || 0 };
    S.truncated = !!d.truncated;
    S.root = d.root || '/nexl交换区';
    S.byId = new Map();
    S.byBase = new Map();
    S.nodes = (d.nodes || []).map((n, i) => {
      const color = n.ghost ? GHOST_COLOR : hashColor(String(n.folder || ''));
      const node = {
        id: String(n.id || ''),
        name: String(n.name || n.id || ''),
        folder: String(n.folder || ''),
        ghost: !!n.ghost,
        tags: n.tags || [],
        out: Number(n.out || 0),
        size: Number(n.size || 0),
        deg: 0, x: 0, y: 0, vx: 0, vy: 0, r: 3,
        _i: i,
        color,
        // WebGL 顶点要 0..1 的浮点色，解析一次省得每帧再拆字符串。
        rgb: [
          parseInt(color.slice(1, 3), 16) / 255,
          parseInt(color.slice(3, 5), 16) / 255,
          parseInt(color.slice(5, 7), 16) / 255,
        ],
      };
      S.byId.set(node.id, node);
      if (!node.ghost) {
        const base = node.id.split('/').pop().replace(/\.md$/i, '').toLowerCase();
        if (!S.byBase.has(base)) S.byBase.set(base, node);
      }
      return node;
    });
    S.links = [];
    for (const e of (d.edges || [])) {
      const a = S.byId.get(String(e.source));
      const b = S.byId.get(String(e.target));
      if (!a || !b || a === b) continue;
      a.deg++; b.deg++;
      // w = 同一对笔记被引用了几次；平行双链合并成一条带权重的边。
      S.links.push({ a, b, w: Math.max(1, Number(e.w) || 1) });
    }
    // 物理循环用连续内存：下标、权重各存一份，内层不再碰对象。
    const ln = S.links.length;
    S.linkA = new Int32Array(ln);
    S.linkB = new Int32Array(ln);
    S.linkW = new Float32Array(ln);
    for (let i = 0; i < ln; i++) {
      const l = S.links[i];
      S.linkA[i] = l.a._i;
      S.linkB[i] = l.b._i;
      S.linkW[i] = l.w;
    }
    const nn = S.nodes.length;
    S.px = new Float32Array(nn);
    S.py = new Float32Array(nn);
    S.vx = new Float32Array(nn);
    S.vy = new Float32Array(nn);
    // 引用次数也算进点的分量：常被引用的笔记略大一点。
    for (const l of S.links) {
      if (l.w > 1) { l.a.refs = (l.a.refs || 0) + (l.w - 1); l.b.refs = (l.b.refs || 0) + (l.w - 1); }
    }
    // 点和 Obsidian 同一量级：普通笔记是小圆点，枢纽才略大。
    for (const n of S.nodes) n.r = n.ghost ? 1.9 : 2.1 + Math.min(3.6, Math.sqrt(n.deg + (n.refs || 0) * 0.5));
    layout();
    // 宿主把被遮挡的 iframe 当成后台页，rAF 会被暂停。首帧先同步推几十轮，
    // 保证图一露出来就是一张铺满画布的网，而不是随机挤在原点的一撮点。
    const warm = S.nodes.length > 1200 ? 10 : S.nodes.length > 300 ? 26 : 70;
    for (let i = 0; i < warm; i++) {
      const job = beginStep();
      if (!job) break;
      advanceStep(job, Infinity); // 预热不切片：开图前同步把布局推开
    }
    paintLegend();
    const parts = [`${fmt(S.stats.notes)} 篇`, `${fmt(S.stats.links)} 条双链`];
    if (S.stats.tags) parts.push(`${fmt(S.stats.tags)} 个标签`);
    if (S.truncated) parts.push('超出上限已截断');
    // 每段单独成节点：整串一次翻译会把「3 篇」当成名词捕获，单位留在中文。
    clear(countEl);
    parts.forEach((part, index) => {
      if (index) countEl.append(' · ');
      countEl.append(h('span', {}, part));
    });
    S.alpha = 1;
    S.ticks = 0;
    S.fitted = false;
    fitView();
    start();
    draw();
    if (S.pendingPath) focusPath(S.pendingPath);
  }

  function focusPath(path) {
    const n = S.byId.get(path);
    if (!n) return false;
    select(n);
    centerOnNode(n);
    return true;
  }

  function groupOf(n) {
    return n.ghost ? '未创建' : (n.folder || '根目录');
  }

  function paintLegend() {
    clear(legend);
    const counts = new Map();
    for (const n of S.nodes) {
      const key = groupOf(n);
      const row = counts.get(key) || { n: 0, color: n.color, ghost: n.ghost };
      row.n++;
      counts.set(key, row);
    }
    const rows = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    for (const [name, row] of rows) {
      // 点一下只看这一组，再点一次回到全图——和 Obsidian 点分组同理。
      legend.append(h('button', {
        class: 'gp-legend-row' + (S.isolate === name ? ' on' : ''),
        type: 'button',
        title: S.isolate === name ? '显示全部分组' : `只看「${name}」`,
        onclick: () => {
          S.isolate = S.isolate === name ? '' : name;
          paintLegend();
          draw();
        },
      },
        h('i', { style: `background:${row.color}` }),
        h('span', {}, `${name} · ${row.n}`)));
    }
  }

  // ---------- 布局 ----------
  // 「未创建」的点跟着引用它的文件夹走：单独给它们一圈轨道会把整张图撑大，
  // 主簇被压小，取景后看起来就只剩几粒点。
  function layoutKey(n) {
    if (!n.ghost) return groupOf(n);
    for (const l of S.links) {
      if (l.b === n && !l.a.ghost) return groupOf(l.a);
    }
    return '未创建';
  }

  function layout() {
    const groups = new Map();
    for (const n of S.nodes) {
      const key = layoutKey(n);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    }
    // 簇按大小排序，大的靠中心，小的散在外圈——和 Obsidian 的岛状分布一致。
    const keys = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
    // 岛内半径按 sqrt(成员数) 走：单位面积的点数恒定，大库也不会挤成一团。
    // 世界坐标放大后由 fitView 统一缩回画布，屏幕密度不变，物理成本却降一个量级。
    const spreadOf = (m) => 18 + Math.sqrt(m) * 16;
    const spreads = keys.map((k) => spreadOf(groups.get(k).length));
    S.maxSpread = Math.max.apply(null, spreads);
    // 轨道半径 = 各岛半径总和的一部分：岛与岛之间留一条缝，又不至于散得太开。
    const orbitBase = Math.max(70, Math.min(2400, spreads.reduce((x, y) => x + y, 0) * 0.45));
    S.clusters = keys.map((key, i) => {
      const members = groups.get(key);
      const angle = (i / Math.max(1, keys.length)) * Math.PI * 2;
      const orbit = i === 0 ? 0 : orbitBase * (0.6 + 0.4 * ((i % 3) / 2));
      const c = {
        key, members, color: members[0].color, ghost: members[0].ghost,
        // 物理循环按成员下标遍历，避免每个点都走一遍对象属性。
        ix: members.map((m) => m._i),
        // 岛的位置 = 角度 + 轨道半径 × 舞台宽高比；比例在 resize 里重算。
        angle, orbit, tx: 0, ty: 0, cx: 0, cy: 0, vx: 0, vy: 0,
      };
      const spread = spreads[i];
      for (const n of members) {
        n.cx = c.cx; n.cy = c.cy;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * spread;
        n.x = c.cx + Math.cos(a) * r;
        n.y = c.cy + Math.sin(a) * r;
        n.vx = 0; n.vy = 0;
      }
      return c;
    });
    anchorClusters(true);
  }

  // 岛的位置排成 cols×rows 网格，列数由舞台宽高比决定：
  // 圆环在高宽比 1.6 的窗口里永远左右留白，网格才能同时吃满宽和高。
  function anchorClusters(snap) {
    const K = S.clusters.length;
    if (!K) return;
    const aspect = S.w && S.h ? Math.min(2.2, Math.max(1, S.w / S.h)) : 1.6;
    S.aspect = aspect;
    const cols = Math.max(1, Math.min(K, Math.round(Math.sqrt(K * aspect))));
    const rows = Math.ceil(K / cols);
    const gap = (S.maxSpread || 200) * 2.3;
    for (let i = 0; i < K; i++) {
      const c = S.clusters[i];
      c.tx = (i % cols - (cols - 1) / 2) * gap;
      c.ty = (Math.floor(i / cols) - (rows - 1) / 2) * gap;
      if (snap) { c.cx = c.tx; c.cy = c.ty; }
    }
    if (snap) {
      for (let i = 0; i < S.clusters.length; i++) {
        const c = S.clusters[i];
        for (let k = 0; k < c.members.length; k++) {
          const n = c.members[k];
          n.x += c.tx - n.cx;
          n.y += c.ty - n.cy;
          n.cx = c.tx; n.cy = c.ty;
        }
      }
    }
  }

  // 一步布局：同样的力模型，换成连续内存 + 整数网格下标。
  // 4000 点时内层循环每秒要跑几百万次，碰对象属性或拼字符串键都会直接吃掉帧率。
  // 一步布局拆成两段：beginStep 建网格/清零受力，advanceStep 在时间预算内
  // 按批算斥力，最后一次性收尾（弹簧、簇、积分）。这样 4000 点时单帧最多
  // 也只花 7ms 在物理上，剩下的渲染照常 60fps，布局只是多跨几帧。
  function beginStep() {
    const n = S.nodes.length;
    if (!n) return null;
    const px = S.px, py = S.py, vx = S.vx, vy = S.vy;
    for (let i = 0; i < n; i++) {
      const q = S.nodes[i];
      px[i] = q.x; py[i] = q.y; vx[i] = q.vx; vy[i] = q.vy;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (px[i] < minX) minX = px[i];
      if (px[i] > maxX) maxX = px[i];
      if (py[i] < minY) minY = py[i];
      if (py[i] > maxY) maxY = py[i];
    }
    // 格宽从 68 起，遇到被弹飞的极端点就翻倍，把网格压回 20 万格以内。
    let cell = 68;
    let cols = Math.max(1, Math.floor((maxX - minX) / cell) + 1);
    let rows = Math.max(1, Math.floor((maxY - minY) / cell) + 1);
    while (cols * rows > 200000) {
      cell *= 2;
      cols = Math.max(1, Math.floor((maxX - minX) / cell) + 1);
      rows = Math.max(1, Math.floor((maxY - minY) / cell) + 1);
    }
    const cells = cols * rows;
    if (S.bench && cells > (S.bench.cells || 0)) S.bench.cells = cells;
    if (!S.cellCount || S.cellCount.length < cells) {
      S.cellCount = new Int32Array(cells);
      S.cellOff = new Int32Array(cells + 1);
      S.cellFill = new Int32Array(cells);
    } else {
      S.cellCount.fill(0, 0, cells);
    }
    if (!S.cellIdx || S.cellIdx.length < n) {
      S.cellIdx = new Int32Array(n);
      S.cellOrder = new Int32Array(n);
    }
    const ci = S.cellIdx;
    const count = S.cellCount, off = S.cellOff, fill = S.cellFill, order = S.cellOrder;
    for (let i = 0; i < n; i++) {
      const cx = Math.min(cols - 1, Math.floor((px[i] - minX) / cell));
      const cy = Math.min(rows - 1, Math.floor((py[i] - minY) / cell));
      const c = cy * cols + cx;
      ci[i] = c;
      count[c]++;
    }
    let sum = 0;
    for (let c = 0; c < cells; c++) { off[c] = sum; fill[c] = sum; sum += count[c]; }
    off[cells] = sum;
    for (let i = 0; i < n; i++) order[fill[ci[i]]++] = i;

    const fx = S.jobFx && S.jobFx.length === n ? S.jobFx : (S.jobFx = new Float32Array(n));
    const fy = S.jobFy && S.jobFy.length === n ? S.jobFy : (S.jobFy = new Float32Array(n));
    fx.fill(0);
    fy.fill(0);
    return { a: S.alpha, i: 0, n, px, py, vx, vy, minX, minY, cell, cols, rows, off, count, order, fx, fy };
  }

  // 在 deadline 前尽量多算几个点的斥力；返回 true 表示这一步已经收尾。
  function advanceStep(job, deadline) {
    const { a, n, px, py, vx, vy, fx, fy, minX, minY, cell, cols, rows, off, count, order } = job;
    const cutoff = 68 * 68 * 2.2;
    while (job.i < n) {
      const i = job.i;
      const gx = Math.floor((px[i] - minX) / cell);
      const gy = Math.floor((py[i] - minY) / cell);
      const xi = px[i], yi = py[i];
      let ax = 0, ay = 0;
      const x0 = gx > 0 ? gx - 1 : 0;
      const x1 = gx + 1 < cols ? gx + 1 : cols - 1;
      const y0 = gy > 0 ? gy - 1 : 0;
      const y1 = gy + 1 < rows ? gy + 1 : rows - 1;
      for (let ny = y0; ny <= y1; ny++) {
        const row = ny * cols;
        for (let nx = x0; nx <= x1; nx++) {
          const c = row + nx;
          const s = off[c], e = s + count[c];
          if (S.bench) S.bench.cands = (S.bench.cands || 0) + (e - s);
          for (let k = s; k < e; k++) {
            const j = order[k];
            if (j === i) continue;
            const dx = xi - px[j];
            const dy = yi - py[j];
            let d2 = dx * dx + dy * dy;
            if (d2 > cutoff) continue;
            // 距离下限 1：两个点重合时斥力有上界，不会把点弹到天边。
            if (d2 < 1) d2 = 1;
            const f = (46 * a) / d2;
            const inv = f / Math.sqrt(d2);
            ax += dx * inv;
            ay += dy * inv;
          }
        }
      }
      fx[i] = ax;
      fy[i] = ay;
      job.i++;
      // 每 64 个点看一次表：比逐点调用 performance.now() 省得多。
      if ((job.i & 63) === 0 && now() >= deadline) return false;
    }
    finishStep(job);
    return true;
  }

  // 收尾：弹簧、簇、积分、写回对象。这一段的成本是 O(N+E)，不用再切片。
  function finishStep(job) {
    const { a, n, px, py, vx, vy, fx, fy } = job;
    for (let i = 0; i < n; i++) { vx[i] += fx[i]; vy[i] += fy[i]; }

    // ---- 双链弹簧：权重越大越硬、目标距离越短，多次引用的笔记在空间上贴得更近 ----
    const la = S.linkA, lb = S.linkB, lw = S.linkW;
    for (let e = 0; e < la.length; e++) {
      const ia = la[e], ib = lb[e];
      const dx = px[ib] - px[ia];
      const dy = py[ib] - py[ia];
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const w = lw[e];
      const base = 30 + Math.min(20, (S.nodes[ia].r + S.nodes[ib].r) * 1.2);
      const want = base / (1 + 0.22 * (w - 1));
      const f = (d - want) * (0.045 + 0.02 * Math.min(4, w - 1)) * a;
      const ux = (dx / d) * f;
      const uy = (dy / d) * f;
      vx[ia] += ux; vy[ia] += uy;
      vx[ib] -= ux; vy[ib] -= uy;
    }

    // ---- 簇质心回锚点：岛与岛的位置由布局时的轨道决定，稳定且互不挤压 ----
    for (let i = 0; i < S.clusters.length; i++) {
      const c = S.clusters[i];
      c.vx += (c.tx - c.cx) * 0.05 * a;
      c.vy += (c.ty - c.cy) * 0.05 * a;
      c.cx += c.vx; c.cy += c.vy;
      c.vx *= 0.82; c.vy *= 0.82;
      let sx = 0, sy = 0;
      for (let k = 0; k < c.ix.length; k++) { sx += px[c.ix[k]]; sy += py[c.ix[k]]; }
      c.px = sx / c.ix.length;
      c.py = sy / c.ix.length;
    }

    // ---- 向所属簇收拢 + 全局居中 + 阻尼 ----
    const pull = 0.09 * a;
    for (let i = 0; i < S.clusters.length; i++) {
      const c = S.clusters[i];
      const ix = c.ix;
      for (let k = 0; k < ix.length; k++) {
        const t = ix[k];
        vx[t] += (c.cx - px[t]) * pull;
        vy[t] += (c.cy - py[t]) * pull;
        vx[t] += -px[t] * 0.0016;
        vy[t] += -py[t] * 0.0016;
      }
    }
    // 速度限幅 30：正常布局够用，异常受力也不会一步飞出几千单位。
    for (let i = 0; i < n; i++) {
      const sp = vx[i] * vx[i] + vy[i] * vy[i];
      if (sp > 900) { const k = 30 / Math.sqrt(sp); vx[i] *= k; vy[i] *= k; }
      px[i] += vx[i];
      py[i] += vy[i];
      vx[i] *= 0.86;
      vy[i] *= 0.86;
    }

    // 写回对象：渲染、命中测试和面板读的都是节点对象。
    for (let i = 0; i < n; i++) {
      const q = S.nodes[i];
      q.x = px[i]; q.y = py[i]; q.vx = vx[i]; q.vy = vy[i];
    }
    if (S.drag) {
      S.drag.n.x = S.drag.x;
      S.drag.n.y = S.drag.y;
      S.drag.n.vx = 0;
      S.drag.n.vy = 0;
    }
    S.alpha *= 0.982;
    S.ticks++;
  }
  function start() {
    if (S.raf) return;
    const tick = () => {
      S.raf = 0;
      const t0 = S.bench ? now() : 0;
      if (S.alpha > 0.02 && S.ticks < MAX_TICKS) {
        // 物理按 7ms 预算切片：一步跨几帧也没关系，渲染每帧照常。
        const p0 = now();
        if (!S.job) S.job = beginStep();
        if (S.job) {
          const done = advanceStep(S.job, p0 + 7);
          if (S.bench) S.bench.phys += now() - p0;
          if (done) { S.job = null; if (S.bench) S.bench.steps++; }
        }
      }
      // 前 90 轮不自动取景：布局还在展开，取景会一直跳。收敛到一半再定一次。
      if (!S.fitted && S.ticks > 90) { S.fitted = true; if (!S.userMoved) fitView(); }
      draw();
      if (S.bench) S.bench.frames.push(now() - t0);
      if (S.alpha > 0.02 && S.ticks < MAX_TICKS) S.raf = requestAnimationFrame(tick);
      else {
        // 收敛后再取景一次：第 90 轮时外围节点还在外扩，早取景会把比例压小。
        if (S.alpha !== 0 && !S.userMoved) fitView();
        S.alpha = 0;
        draw();
        finishBench();
      }
    };
    S.raf = requestAnimationFrame(tick);
  }

  // 压测汇总：只读不写业务状态，结果挂到 window.__bench 给外部采样。
  function finishBench() {
    const b = S.bench;
    if (!b || b.done) return;
    b.done = true;
    const f = b.frames.slice().sort((x, y) => x - y);
    if (!f.length) return;
    const sum = f.reduce((x, y) => x + y, 0);
    window.__bench = {
      engine: render ? 'webgl' : '2d',
      nodes: S.nodes.length,
      links: S.links.length,
      frames: f.length,
      ticks: S.ticks,
      steps: b.steps,
      cells: b.cells || 0,
      candsPerStep: Math.round((b.cands || 0) / Math.max(1, b.steps)),
      frameAvg: +(sum / f.length).toFixed(2),
      frameP95: +f[Math.floor((f.length - 1) * 0.95)].toFixed(2),
      frameMax: +f[f.length - 1].toFixed(2),
      physAvg: +(b.phys / Math.max(1, b.steps)).toFixed(2),
      settleMs: Math.round(now() - b.t0),
      view: [Math.round(S.w || 0), Math.round(S.h || 0)],
      world: (() => { const r = bounds(); return [Math.round(r.x1 - r.x0), Math.round(r.y1 - r.y0)]; })(),
      scale: +S.scale.toFixed(3),
      centers: S.clusters.map((c) => [Math.round(c.cx), Math.round(c.cy)]),
      targets: S.clusters.map((c) => [Math.round(c.tx), Math.round(c.ty)]),
      orbitBase: S.clusters.length ? Math.round(Math.hypot(S.clusters[1].tx, S.clusters[1].ty)) : 0,
      sample: [0, 500, 2000, 3500].map((i) => { const n = S.nodes[i]; return n ? [i, Math.round(n.x), Math.round(n.y), n.folder] : null; }),
      spreadAvg: (() => { let s = 0, c = 0; for (const cl of S.clusters) for (const i of cl.ix) { const n = S.nodes[i]; s += Math.hypot(n.x - cl.cx, n.y - cl.cy); c++; } return Math.round(s / Math.max(1, c)); })(),
      done: true,
    };
  }

  // 纯渲染成本：不推进物理、不等待 rAF，连续画 N 帧取平均。
  if (benchN) {
    window.__gpRender = (runs) => {
      const n = Math.max(1, runs || 30);
      draw();
      const t = now();
      for (let i = 0; i < n; i++) draw();
      return +((now() - t) / n).toFixed(2);
    };
  }

  function reheat(n) {
    S.alpha = Math.max(S.alpha, n);
    S.ticks = 0;
    start();
  }

  // ---------- 视图 ----------
  function bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of S.nodes) {
      if (n.x < x0) x0 = n.x;
      if (n.y < y0) y0 = n.y;
      if (n.x > x1) x1 = n.x;
      if (n.y > y1) y1 = n.y;
    }
    if (!isFinite(x0)) return { x0: -100, y0: -100, x1: 100, y1: 100 };
    return { x0, y0, x1, y1 };
  }

  function fitView() {
    if (!S.nodes.length) { S.scale = 1; S.tx = (S.w || 800) / 2; S.ty = (S.h || 600) / 2; return; }
    const b = bounds();
    const pad = 70;
    const w = (S.w || 800) - pad * 2;
    const hh = (S.h || 600) - pad * 2;
    const bw = Math.max(40, b.x1 - b.x0);
    const bh = Math.max(40, b.y1 - b.y0);
    // 上限放宽到 8：小图（十几篇笔记）的世界坐标只有几十单位，3.2 会把图压在画布一角。
    // 点的半径在 draw 里单独夹紧，放大不会变成大圆盘。
    S.scale = Math.max(0.08, Math.min(w / bw, hh / bh, 8));
    S.tx = (S.w || 800) / 2 - ((b.x0 + b.x1) / 2) * S.scale;
    S.ty = (S.h || 600) / 2 - ((b.y0 + b.y1) / 2) * S.scale;
  }

  function centerOn(index) {
    const c = S.clusters[Math.max(0, Math.min(index, S.clusters.length - 1))];
    if (!c) { fitView(); draw(); return; }
    const x = c.px || c.cx;
    const y = c.py || c.cy;
    S.scale = 1.1;
    S.tx = (S.w || 800) / 2 - x * S.scale;
    S.ty = (S.h || 600) / 2 - y * S.scale;
    draw();
  }

  function toWorld(px, py) {
    return { x: (px - S.tx) / S.scale, y: (py - S.ty) / S.scale };
  }

  // ---------- 绘制 ----------
  // 屏幕坐标每帧只算一次，WebGL 与 Canvas 2D 两条路径共用同一份投影。
  function project() {
    const k = S.scale, tx = S.tx, ty = S.ty, n = S.nodes.length;
    if (!S.sx || S.sx.length !== n) {
      S.sx = new Float32Array(n);
      S.sy = new Float32Array(n);
    }
    for (let i = 0; i < n; i++) {
      const p = S.nodes[i];
      S.sx[i] = p.x * k + tx;
      S.sy[i] = p.y * k + ty;
    }
  }

  function coldNode(n) { return !!S.isolate && groupOf(n) !== S.isolate; }

  // 当前焦点（悬停优先）的邻居集合：非邻居要压暗，只算一次给两条渲染路径用。
  function nearSet() {
    const focus = S.hover || S.selected;
    if (!focus) return null;
    const set = new Set([focus.id]);
    for (const l of S.links) {
      if (l.a === focus) set.add(l.b.id);
      if (l.b === focus) set.add(l.a.id);
    }
    return set;
  }

  // ---------- WebGL 批渲染 ----------
  // 4000 个点 + 6000 条边也只有 2 个 draw call：连线一次 gl.LINES，
  // 点一次 gl.POINTS（圆的边缘和「未创建」的环在片元里用 gl_PointCoord 裁）。
  // 拿不到上下文就返回 null，由 Canvas 2D 全量兜底，功能不降级。
  function createGL(cv) {
    let gl = null;
    try {
      // 预乘 alpha：着色器输出 color*a，画布合成时不再拿 RGB 除以 a。
      // 之前用直通 alpha，低不透明度的连线在 WKWebView 合成后会被除爆成白线。
      gl = cv.getContext('webgl', {
        alpha: true, antialias: true, premultipliedAlpha: true,
        depth: false, stencil: false, preserveDrawingBuffer: false,
      });
    } catch (e) { gl = null; }
    if (!gl) return null;

    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const link = (vs, fs, names) => {
      const v = shader(gl.VERTEX_SHADER, vs);
      const f = shader(gl.FRAGMENT_SHADER, fs);
      if (!v || !f) return null;
      const p = gl.createProgram();
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
      const out = { p, a: {} };
      for (const n of names) out.a[n] = gl.getAttribLocation(p, n);
      return out;
    };

    // 连线：两个顶点一组，颜色和透明度逐顶点给，隔离分组只改 alpha。
    const lineP = link(
      'attribute vec2 a_pos;attribute vec3 a_color;attribute float a_alpha;' +
      'varying vec3 v_color;varying float v_alpha;uniform vec2 u_res;' +
      'void main(){vec2 q=a_pos/u_res*2.0-1.0;gl_Position=vec4(q.x,-q.y,0.0,1.0);' +
      'v_color=a_color;v_alpha=a_alpha;}',
      'precision mediump float;varying vec3 v_color;varying float v_alpha;' +
      'void main(){gl_FragColor=vec4(v_color*v_alpha,v_alpha);}',
      ['a_pos', 'a_color', 'a_alpha']);
    // 点：a_ring=1 画空心环，否则实心圆；边缘用 smoothstep 抗锯齿。
    const nodeP = link(
      'attribute vec2 a_pos;attribute float a_size;attribute vec3 a_color;' +
      'attribute float a_alpha;attribute float a_ring;' +
      'uniform vec2 u_res;uniform float u_dpr;' +
      'varying vec3 v_color;varying float v_alpha;varying float v_ring;' +
      'void main(){vec2 q=a_pos/u_res*2.0-1.0;gl_Position=vec4(q.x,-q.y,0.0,1.0);' +
      'gl_PointSize=a_size*u_dpr;v_color=a_color;v_alpha=a_alpha;v_ring=a_ring;}',
      'precision mediump float;varying vec3 v_color;varying float v_alpha;varying float v_ring;' +
      'void main(){float r=length(gl_PointCoord-vec2(0.5))*2.0;' +
      'if(r>1.0)discard;if(v_ring>0.5&&r<0.62)discard;' +
      'float a=v_alpha*(1.0-smoothstep(0.88,1.0,r));gl_FragColor=vec4(v_color*a,a);}',
      ['a_pos', 'a_size', 'a_color', 'a_alpha', 'a_ring']);
    if (!lineP || !nodeP) return null;

    const uResL = gl.getUniformLocation(lineP.p, 'u_res');
    const uResN = gl.getUniformLocation(nodeP.p, 'u_res');
    const uDprN = gl.getUniformLocation(nodeP.p, 'u_dpr');
    const linkBuf = gl.createBuffer();
    const nodeBuf = gl.createBuffer();
    let linkArr = new Float32Array(0);
    let nodeArr = new Float32Array(0);

    return {
      paint() {
        const w = S.w, hgt = S.h, dpr = S.dpr || 1;
        gl.viewport(0, 0, cv.width, cv.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        // 预乘 alpha 的混合式：src 已经是 color*a，直接加进屏幕。
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        const focus = S.hover || S.selected;
        const near = S.near;
        const dark = S.dark;
        // 缩到全图时连线退到背景里；跨岛的长线按屏幕长度再压一次，
        // 否则 4000 点时会变成一片白线噪声。放大后恢复正常的可见度。
        const linkFade = Math.min(1, Math.max(0.18, (S.scale - 0.2) / 1.1));

        // 连线：顶点步长 6（x, y, r, g, b, a），所有边一次提交。
        const needL = S.links.length * 12;
        if (linkArr.length < needL) linkArr = new Float32Array(needL + 600);
        let i = 0;
        for (const l of S.links) {
          const on = !focus || l.a === focus || l.b === focus;
          if (!on && dark) continue;
          const hot = focus && on;
          let r, g, b, a;
          if (hot) {
            if (dark) { r = 215; g = 225; b = 255; a = 0.65; } else { r = 40; g = 60; b = 120; a = 0.55; }
          } else if (dark) { r = 255; g = 255; b = 255; a = 0.075; } else { r = 70; g = 70; b = 70; a = 0.13; }
          // 权重画成线的不透明度：多次引用的关系更实，1px 线也看得出粗细层级。
          if (l.w > 1) a = Math.min(0.9, a * (1 + 0.35 * Math.min(4, l.w - 1)));
          if (coldNode(l.a) || coldNode(l.b)) a *= 0.38;
          if (focus && !on) a *= 0.35;
          a *= linkFade;
          const ai = l.a._i, bi = l.b._i;
          const len = Math.abs(S.sx[bi] - S.sx[ai]) + Math.abs(S.sy[bi] - S.sy[ai]);
          if (len > 320) a *= Math.max(0.1, 320 / len);
          linkArr[i++] = S.sx[ai]; linkArr[i++] = S.sy[ai];
          linkArr[i++] = r / 255; linkArr[i++] = g / 255; linkArr[i++] = b / 255;
          linkArr[i++] = a;
          linkArr[i++] = S.sx[bi]; linkArr[i++] = S.sy[bi];
          linkArr[i++] = r / 255; linkArr[i++] = g / 255; linkArr[i++] = b / 255;
          linkArr[i++] = a;
        }
        if (i) {
          gl.useProgram(lineP.p);
          gl.uniform2f(uResL, w, hgt);
          gl.bindBuffer(gl.ARRAY_BUFFER, linkBuf);
          gl.bufferData(gl.ARRAY_BUFFER, linkArr.subarray(0, i), gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(lineP.a.a_pos);
          gl.vertexAttribPointer(lineP.a.a_pos, 2, gl.FLOAT, false, 24, 0);
          gl.enableVertexAttribArray(lineP.a.a_color);
          gl.vertexAttribPointer(lineP.a.a_color, 3, gl.FLOAT, false, 24, 8);
          gl.enableVertexAttribArray(lineP.a.a_alpha);
          gl.vertexAttribPointer(lineP.a.a_alpha, 1, gl.FLOAT, false, 24, 20);
          gl.drawArrays(gl.LINES, 0, i / 6);
        }

        // 点：顶点步长 8（x, y, 直径, r, g, b, alpha, 空心标记）。
        const needN = S.nodes.length * 8;
        if (nodeArr.length < needN) nodeArr = new Float32Array(needN + 600);
        const zoom = Math.min(1.12, Math.max(0.45, S.scale));
        let j = 0;
        for (let k = 0; k < S.nodes.length; k++) {
          const nd = S.nodes[k];
          const x = S.sx[k], y = S.sy[k];
          if (x < -20 || y < -20 || x > w + 20 || y > hgt + 20) continue;
          const cold = coldNode(nd);
          const dim = (focus && !(near && near.has(nd.id))) || cold;
          nodeArr[j++] = x;
          nodeArr[j++] = y;
          nodeArr[j++] = Math.max(1.1, nd.r * zoom) * 2;
          nodeArr[j++] = nd.rgb[0]; nodeArr[j++] = nd.rgb[1]; nodeArr[j++] = nd.rgb[2];
          nodeArr[j++] = cold ? 0.1 : (dim ? 0.2 : 1);
          nodeArr[j++] = nd.ghost ? 1 : 0;
        }
        if (j) {
          gl.useProgram(nodeP.p);
          gl.uniform2f(uResN, w, hgt);
          gl.uniform1f(uDprN, dpr);
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf);
          gl.bufferData(gl.ARRAY_BUFFER, nodeArr.subarray(0, j), gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(nodeP.a.a_pos);
          gl.vertexAttribPointer(nodeP.a.a_pos, 2, gl.FLOAT, false, 32, 0);
          gl.enableVertexAttribArray(nodeP.a.a_size);
          gl.vertexAttribPointer(nodeP.a.a_size, 1, gl.FLOAT, false, 32, 8);
          gl.enableVertexAttribArray(nodeP.a.a_color);
          gl.vertexAttribPointer(nodeP.a.a_color, 3, gl.FLOAT, false, 32, 12);
          gl.enableVertexAttribArray(nodeP.a.a_alpha);
          gl.vertexAttribPointer(nodeP.a.a_alpha, 1, gl.FLOAT, false, 32, 24);
          gl.enableVertexAttribArray(nodeP.a.a_ring);
          gl.vertexAttribPointer(nodeP.a.a_ring, 1, gl.FLOAT, false, 32, 28);
          gl.drawArrays(gl.POINTS, 0, j / 8);
        }
      },
    };
  }

  // Canvas 2D 兜底：没有 WebGL 时画全量（背景 + 连线 + 点），标签和环交给覆盖层。
  function paint2D() {
    const dpr = S.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S.w, S.h);
    ctx.fillStyle = S.dark ? '#17161a' : '#f7f4ee';
    ctx.fillRect(0, 0, S.w, S.h);
    if (!S.nodes.length) return;

    const focus = S.hover || S.selected;
    const near = S.near;
    const linkFade = Math.min(1, Math.max(0.18, (S.scale - 0.2) / 1.1));
    ctx.lineWidth = 1;
    for (const l of S.links) {
      const on = !focus || l.a === focus || l.b === focus;
      if (!on && S.dark) continue;
      const hot = focus && on;
      const wBoost = l.w > 1 ? Math.min(1, 1 + 0.35 * Math.min(4, l.w - 1)) : 1;
      let fade = linkFade * wBoost;
      if (focus && !on) fade *= 0.35;
      const len = Math.abs(S.sx[l.b._i] - S.sx[l.a._i]) + Math.abs(S.sy[l.b._i] - S.sy[l.a._i]);
      if (len > 320) fade *= Math.max(0.1, 320 / len);
      ctx.globalAlpha = (coldNode(l.a) || coldNode(l.b) ? 0.05 : 1) * fade;
      ctx.strokeStyle = hot
        ? (S.dark ? 'rgba(215,225,255,0.65)' : 'rgba(40,60,120,0.55)')
        : (S.dark ? 'rgba(255,255,255,0.075)' : 'rgba(70,70,70,0.13)');
      ctx.beginPath();
      ctx.moveTo(S.sx[l.a._i], S.sy[l.a._i]);
      ctx.lineTo(S.sx[l.b._i], S.sy[l.b._i]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const zoom = Math.min(1.12, Math.max(0.45, S.scale));
    for (let i = 0; i < S.nodes.length; i++) {
      const n = S.nodes[i];
      const x = S.sx[i], y = S.sy[i];
      if (x < -20 || y < -20 || x > S.w + 20 || y > S.h + 20) continue;
      const r = Math.max(1.1, n.r * zoom);
      const dim = (focus && !(near && near.has(n.id))) || coldNode(n);
      ctx.globalAlpha = coldNode(n) ? 0.1 : (dim ? 0.2 : 1);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (n.ghost) {
        ctx.strokeStyle = S.dark ? 'rgba(220,215,205,0.55)' : 'rgba(120,112,100,0.55)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        ctx.fillStyle = n.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // 覆盖层：标签、搜索命中环、选中/悬停环。WebGL 模式下这是唯一要重画的 2D 内容。
  function paintOverlay() {
    const dpr = S.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (render) ctx.clearRect(0, 0, S.w, S.h);
    if (!S.nodes.length) return;

    const focus = S.hover || S.selected;
    const k = S.scale;
    const zoom = Math.min(1.12, Math.max(0.45, k));
    const radius = (n) => Math.max(1.1, n.r * zoom);

    // 搜索命中：黄圈套在点上，和图里的点同尺寸。
    if (S.q) {
      ctx.strokeStyle = S.dark ? '#ffd479' : '#c98a12';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < S.nodes.length; i++) {
        const n = S.nodes[i];
        if (n.name.toLowerCase().indexOf(S.q) < 0) continue;
        ctx.beginPath();
        ctx.arc(S.sx[i], S.sy[i], radius(n) + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 选中/悬停环：只画一两个点，开销可以忽略。
    if (focus) {
      const n = focus;
      const i = n._i;
      const r = radius(n) + (n === S.hover ? 1 : 0);
      if (n.id === (S.selected && S.selected.id) || n === S.hover) {
        ctx.strokeStyle = S.dark ? '#f4f1e8' : '#2b2b2b';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(S.sx[i], S.sy[i], r + 2.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 放大到一定程度显示全部名字：缩略时只留点线，和 Obsidian 一致。
    // 大图不画文字，避免每一帧都在排几千个标签。
    if (k >= 2.4 && S.nodes.length <= 400) {
      const la = Math.min(0.8, (k - 2.4) / 1.2);
      ctx.font = '10.5px "Segoe UI", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = S.dark ? `rgba(232,230,225,${la})` : `rgba(64,58,50,${la})`;
      for (let i = 0; i < S.nodes.length; i++) {
        const n = S.nodes[i];
        if (n.ghost || n === focus) continue;
        const x = S.sx[i], y = S.sy[i];
        if (x < -40 || y < -20 || x > S.w + 40 || y > S.h + 20) continue;
        ctx.globalAlpha = coldNode(n) ? 0.12 : 1;
        ctx.fillText(n.name, x, y + radius(n) + 12);
      }
      ctx.globalAlpha = 1;
    }

    // 选中/悬停的节点单独写名字，位置跟着点的大小走。
    if (focus) {
      const i = focus._i;
      const r = radius(focus) + (focus === S.hover ? 1 : 0);
      ctx.font = '12px "Segoe UI", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = S.dark ? '#f4f1e8' : '#1f1f1f';
      ctx.fillText(focus.name, S.sx[i], S.sy[i] - r - 6);
    }
  }

  function draw() {
    if (!S.w) return;
    project();
    S.near = nearSet();
    if (render) render.paint();
    else paint2D();
    paintOverlay();
  }

  // ---------- 交互 ----------
  function hit(px, py) {
    let best = null;
    let bestD = 14 * 14;
    for (const n of S.nodes) {
      const dx = n.x * S.scale + S.tx - px;
      const dy = n.y * S.scale + S.ty - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function localPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    if (e.button !== 0) return;
    S.userMoved = true;
    const p = localPoint(e);
    const n = hit(p.x, p.y);
    // 合成事件没有真实指针，捕获会抛 NotFoundError；失败也照常拖。
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 无真实指针 */ }
    if (n) {
      S.drag = { n, x: n.x, y: n.y, px: p.x, py: p.y, moved: false };
    } else {
      S.pan = { x: p.x, y: p.y, tx: S.tx, ty: S.ty, moved: false };
    }
  }

  function onMove(e) {
    const p = localPoint(e);
    if (S.drag) {
      const w = toWorld(p.x, p.y);
      S.drag.x = w.x;
      S.drag.y = w.y;
      if (Math.abs(p.x - S.drag.px) + Math.abs(p.y - S.drag.py) > 3) S.drag.moved = true;
      if (S.drag.moved) reheat(0.3);
      return;
    }
    if (S.pan) {
      S.tx = S.pan.tx + (p.x - S.pan.x);
      S.ty = S.pan.ty + (p.y - S.pan.y);
      if (Math.abs(p.x - S.pan.x) + Math.abs(p.y - S.pan.y) > 3) S.pan.moved = true;
      draw();
      return;
    }
    const n = hit(p.x, p.y);
    if (n !== S.hover) {
      S.hover = n;
      canvas.style.cursor = n ? 'pointer' : 'grab';
      if (n) {
        tip.hidden = false;
        tip.textContent = n.ghost ? `${n.name}（未创建）` : `${n.name} · ${n.deg} 条双链`;
        tip.style.left = `${Math.min(S.w - 160, p.x + 14)}px`;
        tip.style.top = `${Math.max(8, p.y - 26)}px`;
      } else {
        tip.hidden = true;
      }
      draw();
    }
  }

  function onUp(e) {
    if (S.drag) {
      const drag = S.drag;
      S.drag = null;
      if (!drag.moved) select(drag.n);
      return;
    }
    if (S.pan) {
      const moved = S.pan.moved;
      S.pan = null;
      if (!moved) select(null);
    }
  }

  function onWheel(e) {
    e.preventDefault();
    S.userMoved = true;
    const p = localPoint(e);
    const before = toWorld(p.x, p.y);
    const factor = Math.exp(-e.deltaY * 0.0016);
    S.scale = Math.min(6, Math.max(0.08, S.scale * factor));
    const after = toWorld(p.x, p.y);
    S.tx += (after.x - before.x) * S.scale;
    S.ty += (after.y - before.y) * S.scale;
    draw();
  }

  function onDbl(e) {
    const p = localPoint(e);
    const n = hit(p.x, p.y);
    if (!n) { fitView(); draw(); return; }
    S.scale = Math.max(S.scale, 1.6);
    S.tx = S.w / 2 - n.x * S.scale;
    S.ty = S.h / 2 - n.y * S.scale;
    draw();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', () => { if (!S.pan && !S.drag) { S.hover = null; tip.hidden = true; draw(); } });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDbl);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Esc 收起阅读面板：Obsidian 的侧栏也是这个习惯。
  const onKey = (e) => {
    if (e.key === 'Escape' && S.selected) {
      select(null);
      draw();
    }
  };
  window.addEventListener('keydown', onKey);

  // ---------- 预览面板 ----------
  function select(n) {
    S.selected = n;
    if (!n) { panel.hidden = true; draw(); return; }
    panel.hidden = false;
    renderPanel(n);
    draw();
  }

  function neighbors(n, dir) {
    const out = [];
    for (const l of S.links) {
      if (dir !== 'in' && l.a === n) out.push(l.b);
      if (dir !== 'out' && l.b === n) out.push(l.a);
    }
    return out;
  }

  function fileName(id) {
    const parts = String(id).split('/');
    return parts[parts.length - 1];
  }

  function renderPanel(n) {
    clear(panel);
    panel.scrollTop = 0;
    const outLinks = neighbors(n, 'out');
    const inLinks = neighbors(n, 'in');
    const head = h('div', { class: 'gp-panel-head' },
      h('i', { class: 'gp-dot', style: `background:${n.color}` }),
      h('b', {}, n.name),
      h('span', { class: 'gp-spacer' }),
      h('button', { class: 'gp-panel-x', type: 'button', title: '关闭（Esc）', onclick: () => select(null) }, '×'));
    const meta = h('div', { class: 'gp-panel-meta' },
      h('span', { class: 'gp-path' }, n.ghost ? '尚未创建' : `${n.folder ? n.folder + ' / ' : ''}${fileName(n.id)}`),
      h('span', {}, n.refs ? `${n.deg} 条双链 · 共 ${n.deg + n.refs} 次引用` : `${n.deg} 条双链`),
      n.size ? h('span', {}, `${Math.max(1, Math.round(n.size / 1024))} KB`) : null);
    const tagRow = n.tags && n.tags.length
      ? h('div', { class: 'gp-tags' }, n.tags.slice(0, 12).map((tag) => h('span', { class: 'gp-tag' }, `#${tag}`)))
      : null;
    const body = h('div', { class: 'gp-note gp-md' });
    const linkList = (title, list) => {
      if (!list.length) return null;
      return h('div', { class: 'gp-rel' },
        h('span', { class: 'gp-rel-title' }, title),
        ...list.slice(0, 40).map((x) => h('button', {
          class: 'gp-rel-item' + (x.ghost ? ' ghost' : ''), type: 'button',
          onclick: () => { select(x); centerOnNode(x); },
        }, x.name)));
    };
    const actions = h('div', { class: 'gp-panel-actions' },
      h('button', { class: 'gp-btn', type: 'button', onclick: () => copyPath(n) }, '复制路径'));
    // 正文在前、关系在后：面板首先是一块阅读区，链接只是脚注。
    panel.append(head, meta, tagRow,
      h('div', { class: 'gp-panel-body' }, body, linkList('出链', outLinks), linkList('反向链接', inLinks)),
      actions);
    if (n.ghost) {
      body.append(h('p', { class: 'gp-cut' }, '这篇笔记还没有被创建。'));
      return;
    }
    body.append(h('p', { class: 'gp-cut' }, '正在读取…'));
    api('graph.note', { query: { path: n.id } })
      .then((r) => {
        if (S.selected !== n) return; // 已经换了一篇，别覆盖新面板
        const text = String((r.detail && r.detail.text) || '');
        const cut = text.slice(0, 60000);
        clear(body);
        body.append(renderMarkdown(cut));
        if (text.length > cut.length) body.append(h('p', { class: 'gp-cut' }, '内容较长，只显示前 60000 字。'));
        wireWiki(body);
      })
      .catch((e) => {
        if (S.selected !== n) return;
        clear(body);
        body.append(h('p', { class: 'gp-cut' }, `读不到：${e.message}`));
      });
  }

  function wireWiki(box) {
    box.addEventListener('click', (e) => {
      const a = e.target.closest ? e.target.closest('a.md-wiki') : null;
      if (!a) return;
      e.preventDefault();
      const target = a.getAttribute('data-wiki') || '';
      const node = wikiNode(target);
      if (node) {
        select(node);
        centerOnNode(node);
      } else {
        toast(`《${target}》还没有创建`);
      }
    });
  }

  function wikiNode(target) {
    const raw = String(target).trim();
    const key = raw.replace(/\.md$/i, '');
    const direct = S.byId.get(key + '.md') || S.byId.get(key);
    if (direct) return direct;
    const base = key.split('/').pop().toLowerCase();
    return S.byBase.get(base) || S.byId.get('?' + base) || null;
  }

  function centerOnNode(n) {
    S.scale = Math.max(S.scale, 1.2);
    S.tx = S.w / 2 - n.x * S.scale;
    S.ty = S.h / 2 - n.y * S.scale;
    draw();
  }

  function copyPath(n) {
    const abs = `${S.root}/${n.id}`;
    // 局域网 http 属于非安全上下文，没有 navigator.clipboard；用 execCommand 兜底。
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(abs).catch(() => {});
      toast(`已复制 ${abs}`);
      return;
    }
    try { legacyCopy(abs); toast(`已复制 ${abs}`); } catch (e) { toast(abs); }
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    try { if (!document.execCommand('copy')) throw new Error('copy failed'); } finally { ta.remove(); }
  }

  let toastTimer = 0;
  function toast(msg) {
    let el = frame.querySelector('.gp-toast');
    if (!el) { el = h('div', { class: 'gp-toast' }); frame.append(el); }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 1600);
  }

  function destroy() {
    window.removeEventListener('message', onPrefs);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
    if (ro) ro.disconnect();
    if (S.raf) cancelAnimationFrame(S.raf);
    clearTimeout(toastTimer);
    clear(host);
  }

  resize();
  load();
  return { destroy };
}
