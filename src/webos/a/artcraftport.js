// artcraftport 入口：一个矩阵页 + 若干 craft 工作区。
// 路由固定为 #/artcraftport，craft 切换走内存状态，避免每次换工具都重建整个应用。
// 画板内核是可选包：模块本身随主包发布，重量级工作区在首次打开时才拉取。
const ART_BASE = (typeof window !== 'undefined' && window.NEXLOS_PACKS_BASE) || '/extras/';
// 系统应用路由直接 import 本模块，不经过 app.js 的 openArtCraftPort；
// 样式表在这里装载，两条入口都能拿到布局与滚动容器。缺包时继续挂载，只少样式。
await new Promise((resolve) => {
  if (document.querySelector('link[href$="artcraftport.css"]')) { resolve(); return; }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = ART_BASE + 'artcraftport.css';
  link.onload = link.onerror = () => resolve();
  document.head.append(link);
});
const kernel = await import(ART_BASE + 'artcraftport/kernel.js');
await import(ART_BASE + 'artcraftport/image.js');
await import(ART_BASE + 'artcraftport/vector.js');
await import(ART_BASE + 'artcraftport/time.js');
await import(ART_BASE + 'artcraftport/docs.js');
const { h, clear, CRAFTS, findCraft } = kernel;

const GLYPHS = {
  photocraft: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
  lightcraft: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  vectorcraft: '<path d="M4 19 19 4"/><rect x="2" y="17" width="4" height="4"/><rect x="18" y="2" width="4" height="4"/><path d="M4 4h6M14 20h6"/>',
  cadcraft: '<path d="M3 21 21 3"/><path d="M3 15v6h6M15 3h6v6"/><circle cx="12" cy="12" r="2.5"/>',
  designcraft: '<rect x="4" y="2.5" width="16" height="19" rx="1"/><path d="M8 7h8M8 10.5h8M8 14h5M8 17.5h6"/>',
  figcraft: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 7h4v6"/>',
  deckcraft: '<rect x="2.5" y="4" width="19" height="13" rx="1.5"/><path d="M12 17v4M8 21h8M6 8h7M6 11h4"/>',
  filmcraft: '<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="M7 4v16M17 4v16M2.5 9h4.5M2.5 15h4.5M17 9h4.5M17 15h4.5"/>',
  effectcraft: '<path d="M12 2.5 14.4 9l6.6 2.4-6.6 2.4L12 21l-2.4-7.2L3 11.4 9.6 9z"/>',
  anicraft: '<rect x="3" y="4" width="12" height="12" rx="1"/><path d="M18 7v10a2 2 0 0 1-2 2H7"/><path d="m8 8 4 2.5L8 13z"/>',
  soundcraft: '<path d="M3 12h2l2-5 3 10 3-14 3 18 2-9h3"/>',
  texturecraft: '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  materialcraft: '<circle cx="12" cy="12" r="9"/><path d="M5 8c4 2 10 2 14 0M5 16c4-2 10-2 14 0M12 3c-3 5-3 13 0 18"/>',
  wordcraft: '<path d="M6 2.5h8l5 5v14H6z"/><path d="M14 2.5v5h5M9 12h7M9 15.5h7M9 19h4"/>',
  gridcraft: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  'craft-anything': '<path d="M4 4h16l-6 8v6l-4 2v-8z"/><path d="M8 8h8"/>',
  artcraftport: '<path d="M12 3 4 8v8l8 5 8-5V8z"/><path d="M4 8l8 5 8-5M12 13v8"/><path d="m17 2 .8 2.2L20 5l-2.2.8L17 8l-.8-2.2L14 5l2.2-.8z"/>',
};

const GROUPS = [
  { id: 'image', label: '图像与材质' },
  { id: 'vector', label: '矢量与版面' },
  { id: 'time', label: '时间与声音' },
  { id: 'docs', label: '文档与元工具' },
];

function glyph(id) {
  return h('svg', {
    class: 'ag-glyph-svg', viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: GLYPHS[id] || GLYPHS.artcraftport,
  });
}

function hub(host, showCraft) {
  const search = h('input', {
    class: 'ag-search', type: 'search', placeholder: '搜索 craft、功能或能力…',
    'aria-label': '搜索 craft',
  });
  const grid = h('div', { class: 'ag-grid' });
  const count = h('span', { class: 'ag-count' }, `${CRAFTS.length} crafts`);
  const empty = h('p', { class: 'ag-empty', hidden: true }, '没有匹配的 craft。');
  let filter = 'all';
  const chips = h('div', { class: 'ag-chips' },
    [{ id: 'all', label: '全部' }].concat(GROUPS).map((g) => h('button', {
      class: 'ag-chip' + (g.id === 'all' ? ' active' : ''), type: 'button',
      'data-filter': g.id,
      onclick(e) {
        filter = g.id;
        const all = chips.querySelectorAll('.ag-chip');
        for (let i = 0; i < all.length; i++) {
          all[i].classList.toggle('active', all[i].getAttribute('data-filter') === filter);
        }
        paint();
        e.stopPropagation();
      },
    }, g.label)));

  function paint() {
    clear(grid);
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    GROUPS.forEach((g) => {
      if (filter !== 'all' && filter !== g.id) return;
      const items = CRAFTS.filter((c) => c.group === g.id
        && (!q || (c.name + ' ' + c.up + ' ' + c.blurb + ' ' + c.id).toLowerCase().indexOf(q) >= 0));
      if (!items.length) return;
      shown += items.length;
      grid.append(h('h2', { class: 'ag-group' }, g.label));
      items.forEach((c) => {
        grid.append(h('button', {
          class: 'ag-card', type: 'button', 'data-craft': c.id,
          onclick: () => showCraft(c.id),
        },
        h('span', { class: 'ag-card-icon', 'data-app': c.id }, glyph(c.id)),
        h('span', { class: 'ag-card-body' },
          h('span', { class: 'ag-card-name' }, c.name),
          h('span', { class: 'ag-card-up' }, c.up),
          h('span', { class: 'ag-card-blurb' }, c.blurb)),
        h('span', { class: 'ag-card-tag' }, c.tag || '可用')));
      });
    });
    empty.hidden = shown > 0;
    count.textContent = shown === CRAFTS.length ? `${CRAFTS.length} crafts` : `${shown} / ${CRAFTS.length} crafts`;
  }
  search.addEventListener('input', paint);

  const page = h('div', { class: 'ag-hub' },
    h('header', { class: 'ag-hub-head' },
      h('div', { class: 'ag-brand' }, 'ArtCraft 移植版'),
      h('p', { class: 'ag-brand-sub' }, '上游 ArtCraft 的浏览器移植 · 非官方 · 装在 NexlOS 里'),
      h('div', { class: 'ag-hub-stats' },
        h('span', {}, '17 crafts'),
        h('span', {}, '0 dependencies'),
        h('span', {}, '100% local'))),
    h('div', { class: 'ag-hub-tools' },
      search,
      count,
      h('span', { class: 'ag-hub-note' }, '所有内容留在本机，导出走浏览器下载')),
    chips,
    grid,
    empty,
    h('footer', { class: 'ag-hub-foot' },
      h('span', {}, '本套工具是内置「应用生成」的示例产物：共享原子命令、单一文档状态、多入口派生。'),
      ' ',
      h('span', {}, 'ArtCraft 由 storytold 开发（MIT / Apache-2.0）；本移植版与上游无隶属或背书关系，也不代表上游立场。移植思路见 docs/artcraftport/ATTRIBUTION.md。')));
  host.append(page);
  paint();
}

export function mountArtCraftPort(host) {
  let current = null;
  let currentId = '';
  let lastLanguage = document.documentElement.lang;
  const localeObserver = new MutationObserver(() => {
    if (lastLanguage === document.documentElement.lang) return;
    lastLanguage = document.documentElement.lang;
    const active = host.querySelector('.ag-craft');
    if (active) active.dispatchEvent(new Event('nexlos.localechange'));
  });
  localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  function destroyCraft() {
    if (current && current.destroy) current.destroy();
    current = null;
    currentId = '';
  }

  function showHub() {
    destroyCraft();
    // 深链接进入过 #/artcraftport/<id> 时把地址归位，刷新后仍回到矩阵。
    if (location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)[1]) {
      history.replaceState(null, '', '#/artcraftport');
    }
    clear(host);
    hub(host, showCraft);
  }

  function showCraft(id) {
    const def = findCraft(id);
    if (!def) { showHub(); return; }
    destroyCraft();
    clear(host);
    currentId = id;
    current = def.mount(host) || null;
  }

  window.__artcraftportShow = showCraft;
  window.__artcraftportHome = showHub;

  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[1] && findCraft(parts[1])) showCraft(parts[1]);
  else showHub();

  return {
    destroy() {
      localeObserver.disconnect();
      destroyCraft();
      delete window.__artcraftportShow;
      delete window.__artcraftportHome;
      clear(host);
    },
  };
}
