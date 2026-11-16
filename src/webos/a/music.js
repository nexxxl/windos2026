// NexlOS 音乐：一张卡片 + 一个曲库抽屉。
//
// 空壳自己只做四件事：管理音源、把「歌」变成「可播放地址」、播放、记状态。
// 曲库、搜索、音源解析全部由插件提供；插件跑在 musicplugin.js 的 Worker 沙箱里。
// 内置源不需要插件：随包的一首《内在之光》与本机文件（nexl交换区）。
//
// 状态只有一份，落在 localStorage；插件脚本也存本地，不上传、不联网校验。
// 零第三方依赖，保持 Chrome 72 可用（不用可选链、不用 ??）。
// 这一页不加载桌面外壳的样式与模块，首帧只依赖本文件与 music.css。

import { h, clear, api } from './dom.js';
import { icon } from './icons.js';
import { onLifecycle } from './mai.js';
import { openMediaBrowser, mediaURL } from './mediafiles.js';
import {
  read, write, clamp, timeText, isAudioName, playSafe, chime, mediaSession, insideExchange,
} from './mediautil.js';
import { createHost, cleanRows, installFromUrl, installFromText } from './musicplugin.js';

const MUSIC_KEY = 'nexlos.media.music.v2';
const LEGACY_KEY = 'nexlos.media.music.v1';
const MAX_PLUGINS = 12;

// 随包内置的唯一一首歌，由项目自行合成，走 /a/ 静态路由；改曲目只需替换这个 mp3。
const BUILTIN_TRACK = {
  id: 'builtin-master-mix',
  name: 'Master Mix',
  artist: 'NexlOS Authors',
  src: '/a/media/master-mix.m4a',
  kind: 'url',
  builtin: true,
  duration: 141.12,
};

function builtinTrack() { return Object.assign({}, BUILTIN_TRACK); }

function emptyState() {
  return {
    tracks: [builtinTrack()],
    index: 0, volume: 0.7, shuffle: false, repeat: 'all', time: 0,
    source: 'local', plugins: [],
  };
}

// 旧版只有一份「本地 + 环境音」列表，升级时把曲目原样接过来。
function loadState() {
  const fresh = read(MUSIC_KEY, emptyState());
  if (!localStorage.getItem(MUSIC_KEY)) {
    const legacy = read(LEGACY_KEY, null);
    if (Array.isArray(legacy.tracks) && legacy.tracks.length) {
      fresh.tracks = legacy.tracks;
      fresh.index = Number(legacy.index) || 0;
      fresh.volume = Number(legacy.volume) || 0.7;
    }
  }
  const oldTracks = Array.isArray(fresh.tracks) ? fresh.tracks : [];
  const oldIndex = clamp(Number(fresh.index) || 0, 0, Math.max(0, oldTracks.length - 1));
  const oldActive = oldTracks[oldIndex] || null;
  // 四段 WebAudio 环境音已下线：升级时清掉，内置歌曲固定第一首。
  // 旧索引按曲目 id 重新对齐，用户原来选中的本机文件不会被换成别的歌。
  const kept = oldTracks.filter((t) => t && t.id !== BUILTIN_TRACK.id && t.kind !== 'synth'
    && (t.kind === 'url' || (t.kind === 'file' && insideExchange(t.path))));
  fresh.tracks = [builtinTrack()].concat(kept);
  const at = oldActive && oldActive.kind !== 'synth' ? kept.findIndex((t) => t.id === oldActive.id) : -1;
  fresh.index = at >= 0 ? at + 1 : 0;
  if (!oldActive || oldActive.kind === 'synth') fresh.time = 0;
  if (fresh.source !== 'local' && String(fresh.source || '').indexOf('plugin:') !== 0) fresh.source = 'local';
  fresh.plugins = (Array.isArray(fresh.plugins) ? fresh.plugins : []).filter((p) => p && p.id && p.script).slice(0, MAX_PLUGINS);
  // 迁移结果直接落盘，下一次启动不再重复清理旧的环境音列表。
  const migrated = oldTracks.some((t) => t && t.kind === 'synth')
    || !oldTracks.some((t) => t && t.id === BUILTIN_TRACK.id);
  if (migrated) write(MUSIC_KEY, fresh);
  return fresh;
}

export function mountMusic(host) {
  const state = loadState();

  let active = String(state.source || 'local');
  // 旧状态里的 source 可能还写着已下线的 ambient，统一退回本地曲库。
  if (active !== 'local' && active.indexOf('plugin:') !== 0) active = 'local';
  let plugList = [];
  let listIndex = clamp(Number(state.index) || 0, 0, Math.max(0, state.tracks.length - 1));
  let playing = false;
  let busy = false;
  let playSeq = 0;
  const hosts = {};

  let saveAt = 0;

  if (active.indexOf('plugin:') === 0 && !pluginById(active.slice(7))) active = 'local';

  const audio = h('audio', { preload: 'metadata', 'aria-label': '音频' });
  audio.volume = clamp(Number(state.volume) || 0.7, 0, 1);

  // ---------- 卡片 ----------

  const coverImg = h('img', { alt: '', hidden: true });
  const coverGlyph = h('span', { class: 'ma-coveryph' }, icon('music'));
  const cover = h('button', {
    class: 'ma-cover', type: 'button', 'aria-label': '播放或暂停',
    onclick: () => (track() ? toggle() : setLib(true)),
  }, coverImg, coverGlyph);
  coverImg.addEventListener('error', () => {
    coverImg.hidden = true;
    coverGlyph.hidden = false;
  });

  const titleEl = h('h1', { class: 'ma-title' }, '未选择');
  const artistEl = h('p', { class: 'ma-artist' }, '打开曲库选择一个音源');
  const seek = h('input', {
    class: 'ma-seek', type: 'range', min: '0', max: '0', step: '0.01', value: '0',
    'aria-label': '播放进度',
    oninput: () => { if (track()) audio.currentTime = Number(seek.value) || 0; },
    onchange: () => remember(true),
  });
  const cur = h('span', { class: 'ma-time' }, '00:00');
  const dur = h('span', { class: 'ma-time' }, '00:00');
  const playBtn = h('button', { class: 'ma-play', type: 'button', 'aria-label': '播放', onclick: () => toggle() }, icon('play'));
  const prevBtn = h('button', { class: 'ma-btn', type: 'button', 'aria-label': '上一首', onclick: () => move(-1) }, icon('prev'));
  const nextBtn = h('button', { class: 'ma-btn', type: 'button', 'aria-label': '下一首', onclick: () => move(1) }, icon('next'));
  const shuffleBtn = h('button', {
    class: 'ma-btn', type: 'button', 'aria-label': '随机播放',
    onclick: () => { state.shuffle = !state.shuffle; remember(true); paint(); },
  }, icon('shuffle'));
  const repeatBtn = h('button', { class: 'ma-btn', type: 'button', 'aria-label': '循环模式', onclick: cycleRepeat }, icon('repeat'));
  const vol = h('input', {
    class: 'ma-vol', type: 'range', min: '0', max: '1', step: '0.01', value: String(audio.volume),
    'aria-label': '音量',
    oninput: () => setVolume(Number(vol.value) || 0),
    onchange: () => remember(true),
  });
  const libBtn = h('button', {
    class: 'ma-btn ma-libbtn', type: 'button', title: '曲库', 'aria-label': '曲库',
    'aria-expanded': 'false',
    onclick: () => setLib(!el.classList.contains('ma-lib-open')),
  }, icon('outline'));
  const note = h('span', { class: 'ma-note' });

  const main = h('div', { class: 'ma-main' },
    cover,
    h('div', { class: 'ma-meta' }, titleEl, artistEl),
    h('div', { class: 'ma-seekrow' }, cur, seek, dur),
    h('div', { class: 'ma-transport' }, prevBtn, playBtn, nextBtn),
    h('div', { class: 'ma-bottom' },
      libBtn, shuffleBtn, repeatBtn,
      h('span', { class: 'ma-volwrap' }, icon('volume'), vol)));

  // ---------- 曲库抽屉 ----------

  const countEl = h('span', { class: 'ma-count' }, '');
  const sourcesEl = h('div', { class: 'ma-sources', role: 'list' });
  const searchInput = h('input', {
    class: 'ma-search', type: 'search', placeholder: '搜索这个音源…', spellcheck: 'false',
    oninput: () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(searchInput.value), 380); },
    onkeydown: (e) => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(searchInput.value); } },
  });
  const searchWrap = h('div', { class: 'ma-searchwrap', hidden: true }, searchInput);
  const listEl = h('div', { class: 'ma-list', role: 'list' });
  const urlInput = h('input', {
    class: 'ma-url', type: 'url', inputmode: 'url', placeholder: '粘贴音频直链，回车添加', spellcheck: 'false',
    onkeydown: (e) => { if (e.key === 'Enter') addURL(); },
  });
  const addRow = h('div', { class: 'ma-add' }, urlInput,
    h('button', { class: 'ma-addbtn', type: 'button', onclick: addURL }, '添加'));

  const pluginListEl = h('div', { class: 'ma-pluginlist' });
  const sheetNote = h('p', { class: 'ma-sheetnote' }, '粘贴插件清单地址（.json），脚本落在本机。');
  const installInput = h('input', { class: 'ma-url', type: 'url', placeholder: 'https://…/plugin.json', spellcheck: 'false' });
  const installBtn = h('button', { class: 'ma-addbtn', type: 'button', onclick: () => installURL() }, '安装');
  const demoBtn = h('button', { class: 'ma-ghostbtn', type: 'button', onclick: () => installDemo() }, '装示例插件');
  const sheet = h('section', { class: 'ma-sheet', hidden: true },
    h('div', { class: 'ma-sheetpanel' },
      h('header', { class: 'ma-sheethead' },
        h('b', {}, '音源插件'),
        h('button', { class: 'ma-panelx', type: 'button', 'aria-label': '关闭', onclick: () => { sheet.hidden = true; } }, icon('close'))),
      sheetNote,
      h('div', { class: 'ma-install' }, installInput, installBtn),
      h('div', { class: 'ma-installrow' }, demoBtn,
        h('span', { class: 'ma-sameline' }, '示例现场生成两段测试音，验证装插件、搜索、播放。')),
      pluginListEl));

  const managerBtn = h('button', {
    class: 'ma-iconbtn', type: 'button', title: '音源插件', 'aria-label': '音源插件',
    onclick: () => openSheet(),
  }, icon('gear'));
  const pickerBtn = h('button', {
    class: 'ma-iconbtn', type: 'button', title: '添加本机文件', 'aria-label': '添加本机文件',
    onclick: () => openMediaBrowser({ media: 'audio', multi: true, onPick: (paths) => addPaths(paths) }),
  }, icon('plus'));
  const closeLibBtn = h('button', {
    class: 'ma-iconbtn', type: 'button', title: '收起曲库', 'aria-label': '收起曲库',
    onclick: () => setLib(false),
  }, icon('close'));

  const aside = h('aside', { class: 'ma-lib' },
    h('div', { class: 'ma-libhead' },
      h('h2', {}, '曲库'), countEl,
      h('div', { class: 'ma-libacts' }, managerBtn, pickerBtn, closeLibBtn)),
    sourcesEl,
    searchWrap,
    listEl,
    addRow);

  const el = h('div', { class: 'ma' }, aside, main, note, audio, sheet);
  host.append(el);

  // ---------- 源与列表 ----------

  function pluginById(id) {
    for (let i = 0; i < state.plugins.length; i++) if (state.plugins[i].id === id) return state.plugins[i];
    return null;
  }

  function localTracks() { return state.tracks; }

  function curList() {
    if (active.indexOf('plugin:') === 0) return plugList;
    return localTracks();
  }

  function track() { return curList()[listIndex] || null; }

  function hostFor(id) {
    if (hosts[id]) return hosts[id];
    const p = pluginById(id);
    if (!p) throw new Error('插件不在了');
    hosts[id] = createHost(p, null);
    return hosts[id];
  }

  function dropHost(id) {
    if (!hosts[id]) return;
    hosts[id].destroy();
    delete hosts[id];
  }

  function sourceName(id) {
    if (id === 'local') return '本地';
    const p = pluginById(String(id).slice(7));
    return p ? p.name : '插件';
  }

  function paintSources() {
    clear(sourcesEl);
    sourcesEl.append(sourceRow('local', '本地', icon('folder'), localTracks().length + ' 首'));
    state.plugins.forEach((p) => {
      if (!p.enabled) return;
      sourcesEl.append(sourceRow('plugin:' + p.id, p.name, icon('link'), p.version || ''));
    });
    sourcesEl.append(h('button', {
      class: 'ma-source ma-sourceadd', type: 'button', onclick: () => openSheet(),
    }, icon('plus'), h('span', {}, '安装音源插件')));
  }

  function sourceRow(id, name, ic, meta) {
    return h('button', {
      class: 'ma-source' + (active === id ? ' on' : ''), type: 'button', role: 'listitem',
      onclick: () => selectSource(id),
    }, ic, h('span', {}, name), h('i', {}, meta || ''));
  }

  function selectSource(id) {
    if (id === active) return;
    stopAll();
    active = id;
    state.source = id;
    plugList = [];
    listIndex = 0;
    searchInput.value = '';
    paintSources();
    paintChrome();
    renderList();
    paint();
    remember(true);
  }

  function paintChrome() {
    const isPlugin = active.indexOf('plugin:') === 0;
    searchWrap.hidden = !isPlugin;
    addRow.hidden = isPlugin;
    pickerBtn.hidden = active !== 'local';
  }

  function renderList() {
    const list = curList();
    clear(listEl);
    countEl.textContent = active.indexOf('plugin:') === 0 ? plugList.length + ' 条' : list.length + ' 首';
    if (!list.length) {
      listEl.append(h('div', { class: 'ma-empty' },
        active.indexOf('plugin:') === 0
          ? (busy ? '正在搜索…' : '这个音源还没有结果，在上面搜索。')
          : '还没有曲目，点右上角的 + 添加。'));
      return;
    }
    list.forEach((t, i) => {
      const meta = t.artist || (t.kind === 'plugin' ? '插件音源' : '音频');
      listEl.append(h('div', {
        class: 'ma-row' + (i === listIndex ? ' on' : ''), role: 'listitem', dataset: { id: t.id },
        onclick: () => playIndex(i),
      },
      h('span', { class: 'ma-rowicon' }, icon('music')),
      h('span', { class: 'ma-rowtext' }, h('b', {}, t.name), h('i', {}, meta)),
      h('span', { class: 'ma-rowtime' }, durationText(t.duration)),
      t.kind === 'plugin' || t.builtin ? null : h('button', {
        class: 'ma-rowdel', type: 'button', title: '移除', 'aria-label': '移除 ' + t.name,
        onclick: (e) => { e.stopPropagation(); removeTrack(t.id); },
      }, icon('close'))));
    });
  }

  function durationText(d) {
    const sec = Number(d) || 0;
    if (!sec) return '';
    return timeText(sec > 10000 ? sec / 1000 : sec);
  }

  // ---------- 播放 ----------

  function playIndex(i) {
    if (i < 0 || i >= curList().length) return;
    listIndex = i;
    state.time = 0;
    renderList();
    startTrack(true);
    setLib(false);
  }

  // 曲库向窗口外展开：外壳把窗口右边缘往右推，卡片留在原位。
  // 282 面板 + 左右各 12 缝 = 要让出的 306，扣掉窗口原本 2px 余量取 304。
  const LIB_GROW = 304;
  function postWin(msg) {
    if (window.parent === window) return;
    window.parent.postMessage(msg, location.origin);
  }

  // 展开前先问外壳哪边有空间，先换对齐再长窗口，卡片在屏幕上就不会跳。
  function setLib(open) {
    open = !!open;
    libBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open === el.classList.contains('ma-lib-open')) return;
    if (window.parent === window) {
      el.classList.toggle('ma-lib-open', open);
      return;
    }
    if (open) {
      postWin({ type: 'nexlos.win', action: 'plan', delta: LIB_GROW });
      return;
    }
    el.classList.remove('ma-lib-open');
    postWin({
      type: 'nexlos.win', action: 'growLeft', open: false, delta: LIB_GROW,
      side: el.getAttribute('data-lib-side') || 'right',
    });
  }

  function move(dir) {
    const list = curList();
    if (!list.length) return;
    if (state.shuffle && list.length > 1) {
      let next = listIndex;
      while (next === listIndex) next = Math.floor(Math.random() * list.length);
      listIndex = next;
    } else {
      listIndex = (listIndex + dir + list.length) % list.length;
    }
    state.time = 0;
    renderList();
    startTrack(true);
  }

  function cycleRepeat() {
    state.repeat = state.repeat === 'all' ? 'one' : state.repeat === 'one' ? 'off' : 'all';
    remember(true);
    paint();
    flash(state.repeat === 'all' ? '列表循环' : state.repeat === 'one' ? '单曲循环' : '播完停止');
  }

  function toggle() {
    if (!track()) { flash('先在曲库里选一个音源'); return; }
    if (playing) { stopAll(); return; }
    startTrack(true);
  }

  function stopAll() {
    playSeq++;
    audio.pause();
    playing = false;
    paint();
    saveMediaSession();
  }

  async function startTrack(autoplay) {
    const t = track();
    if (!t) return;
    if (t.kind === 'plugin') {
      const seq = ++playSeq;
      playing = false;
      paint();
      flash('正在解析音源…');
      let url = '';
      try { url = await resolvePlugin(t); } catch (e) {
        if (seq === playSeq) { flash('解析失败：' + e.message, 'error'); paint(); }
        return;
      }
      if (seq !== playSeq) return; // 用户已经切歌
      flash('');
      setSrc(url, 0, autoplay);
      return;
    }
    setSrc(t.src, t.kind === 'file' ? 0 : (state.time || 0), autoplay);
  }

  async function resolvePlugin(t) {
    if (t.src) return t.src;
    const r = await hostFor(t.plugin).call('getMedia', [t.pid], 25000);
    const url = r && (typeof r === 'string' ? r : r.url);
    if (!url || !/^(https?|data|blob):/i.test(String(url))) throw new Error('插件没有给出可播放地址');
    t.src = String(url);
    return t.src;
  }

  function setSrc(src, at, autoplay) {
    if (audio.src !== src) {
      audio.src = src;
      audio.load();
      try { audio.currentTime = at || 0; } catch (e) { /* 未就绪 */ }
    }
    if (autoplay) {
      playSafe(audio).then(() => { playing = true; paint(); saveMediaSession(); })
        .catch(() => { playing = false; paint(); flash('浏览器拒绝了播放，再点一次播放键', 'error'); });
    } else {
      playing = false;
      paint();
    }
  }

  function setVolume(v) {
    audio.volume = clamp(v, 0, 1);
    state.volume = audio.volume;
    vol.value = String(audio.volume);
  }

  // ---------- 搜索 ----------

  let searchTimer = 0;

  async function runSearch(q) {
    const p = active.indexOf('plugin:') === 0 ? pluginById(active.slice(7)) : null;
    if (!p) return;
    const query = String(q || '').trim();
    if (!query) { plugList = []; listIndex = 0; renderList(); return; }
    if (busy) return;
    busy = true;
    listIndex = 0;
    renderList();
    const started = Date.now();
    try {
      const rows = await hostFor(p.id).call('search', [query, 1], 25000);
      plugList = cleanRows(rows, p.id);
      busy = false;
      renderList();
      if (!plugList.length) flash('这个源没有结果', 'error');
      else flash('找到 ' + plugList.length + ' 条 · ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
      paint();
    } catch (e) {
      busy = false;
      plugList = [];
      renderList();
      flash('搜索失败：' + e.message, 'error');
    }
  }

  // ---------- 本地曲库 ----------

  function addPaths(paths) {
    if (!paths || !paths.length) return;
    let added = 0;
    const have = {};
    state.tracks.forEach((t) => { if (t.src) have[t.src] = true; });
    paths.forEach((p, i) => {
      const name = String(p || '').split('/').pop() || p;
      if (!isAudioName(name)) return;
      const src = mediaURL(p);
      if (have[src]) return;
      have[src] = true;
      state.tracks.push({ id: 'file-' + Date.now() + '-' + i, name: name, artist: '本机文件', src: src, path: p, kind: 'file' });
      added++;
    });
    if (!added) { flash('这些文件已经在曲库里了'); return; }
    remember(true);
    if (active !== 'local') selectSource('local');
    listIndex = localTracks().length - 1;
    renderList();
    startTrack(true);
    flash('已加入 ' + added + ' 首');
  }

  function addURL() {
    const raw = (urlInput.value || '').trim();
    if (!raw) { urlInput.focus(); return; }
    let url = raw;
    if (!/^[a-z]+:\/\//i.test(url) && !url.startsWith('/')) url = 'https://' + url;
    try { new URL(url, location.href); } catch (e) { flash('地址格式不对', 'error'); return; }
    state.tracks.push({ id: 'url-' + Date.now(), name: decodeURIComponent((url.split('/').pop() || url).split('?')[0]), artist: '网络音频', src: url, kind: 'url' });
    urlInput.value = '';
    remember(true);
    if (active !== 'local') selectSource('local');
    listIndex = localTracks().length - 1;
    renderList();
    startTrack(true);
    flash('已添加网络音频');
  }

  function removeTrack(id) {
    const i = state.tracks.findIndex((t) => t.id === id);
    if (i < 0) return;
    if (state.tracks[i].builtin) { flash('内置曲目不能删除'); return; }
    const remove = state.tracks[i];
    const wasCurrent = track() === remove;
    state.tracks.splice(i, 1);
    if (!state.tracks.length) state.tracks = emptyState().tracks;
    if (wasCurrent) stopAll();
    listIndex = clamp(listIndex, 0, Math.max(0, curList().length - 1));
    remember(true);
    renderList();
    paint();
    paintSources();
  }

  // ---------- 插件安装与管理 ----------

  function openSheet() {
    sheet.hidden = false;
    renderPlugins();
    installInput.focus();
  }

  function renderPlugins() {
    clear(pluginListEl);
    if (!state.plugins.length) {
      pluginListEl.append(h('p', { class: 'ma-empty' }, '还没有插件。'));
      return;
    }
    state.plugins.forEach((p) => {
      const on = !!p.enabled;
      pluginListEl.append(h('div', { class: 'ma-plug' },
        h('div', { class: 'ma-plugmain' },
          h('b', {}, p.name),
          h('span', {}, [p.version ? 'v' + p.version : '', p.author, on ? '已启用' : '已停用'].filter(Boolean).join(' · ')),
          p.description ? h('em', {}, p.description) : null),
        h('div', { class: 'ma-plugacts' },
          h('button', {
            class: 'ma-chip' + (on ? ' on' : ''), type: 'button',
            onclick: () => togglePlugin(p.id),
          }, on ? '停用' : '启用'),
          h('button', { class: 'ma-chip danger', type: 'button', onclick: () => removePlugin(p.id) }, '删除'))));
    });
  }

  function savePlugins() {
    state.plugins = state.plugins.slice(0, MAX_PLUGINS);
    remember(true);
    paintSources();
  }

  function addPlugin(p) {
    const i = state.plugins.findIndex((x) => x.id === p.id);
    const rec = {
      id: p.id, name: p.name, version: p.version, author: p.author, description: p.description,
      homepage: p.homepage, script: p.script, enabled: true, installedAt: Date.now(),
    };
    if (i >= 0) {
      dropHost(p.id);
      state.plugins[i] = rec;
      flash('已更新「' + p.name + '」');
    } else {
      state.plugins.push(rec);
      flash('已安装「' + p.name + '」');
    }
    savePlugins();
    renderPlugins();
    chime('ok');
  }

  async function installURL() {
    const url = (installInput.value || '').trim();
    if (!url) { installInput.focus(); return; }
    installBtn.disabled = true;
    sheetNote.textContent = '正在读取插件清单…';
    try {
      addPlugin(await installFromUrl(url));
      installInput.value = '';
      sheetNote.textContent = '粘贴插件清单地址（.json），脚本落在本机。';
    } catch (e) {
      sheetNote.textContent = '安装失败：' + e.message;
      chime('error');
    } finally {
      installBtn.disabled = false;
    }
  }

  async function installDemo() {
    sheetNote.textContent = '正在安装示例…';
    try {
      // 示例清单是应用自带的静态文件；安装走和外部插件一样的解析与沙箱流程。
      const res = await fetch('/a/music-demo-plugin.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      addPlugin(await installFromText(await res.text()));
      sheetNote.textContent = '示例已安装。选它作为音源，搜索「示例」。';
    } catch (e) {
      sheetNote.textContent = '示例安装失败：' + e.message;
    }
  }

  function togglePlugin(id) {
    const p = pluginById(id);
    if (!p) return;
    p.enabled = !p.enabled;
    dropHost(id);
    if (!p.enabled && active === 'plugin:' + id) selectSource('local');
    savePlugins();
    renderPlugins();
    paintChrome();
  }

  function removePlugin(id) {
    const p = pluginById(id);
    if (!p) return;
    dropHost(id);
    state.plugins = state.plugins.filter((x) => x.id !== id);
    if (active === 'plugin:' + id) selectSource('local');
    savePlugins();
    renderPlugins();
    flash('已删除「' + p.name + '」');
  }

  // ---------- 状态 ----------

  function remember(force) {
    const now = Date.now();
    if (!force && now - saveAt < 1500) return;
    saveAt = now;
    state.volume = audio.volume;
    if (track() && !audio.paused) state.time = audio.currentTime;
    // 插件结果可能是临时直链，不落盘；本地曲目只写回 nexl交换区里的文件。
    const safe = state.tracks.filter((t) => t.kind === 'url' || (t.kind === 'file' && insideExchange(t.path)));
    const srcOk = !(active.indexOf('plugin:') === 0) || pluginById(active.slice(7));
    write(MUSIC_KEY, {
      tracks: safe, index: listIndex, volume: audio.volume, shuffle: state.shuffle,
      repeat: state.repeat, time: state.time, source: srcOk ? active : 'local',
      plugins: state.plugins,
    });
  }

  function paint() {
    const t = track();
    titleEl.textContent = t ? t.name : '未选择';
    artistEl.textContent = t ? (t.artist || sourceName(active)) : '打开曲库选择一个音源';
    playBtn.innerHTML = '';
    playBtn.append(icon(playing ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
    shuffleBtn.classList.toggle('on', !!state.shuffle);
    repeatBtn.classList.toggle('on', state.repeat !== 'off');
    el.classList.toggle('is-playing', playing);
    seek.disabled = !t;
    dur.textContent = t && t.kind === 'plugin' ? durationText(t.duration) : timeText(audio.duration);
    cur.textContent = timeText(audio.currentTime);
    const rows = listEl.querySelectorAll('.ma-row');
    Array.prototype.forEach.call(rows, (row, i) => row.classList.toggle('on', i === listIndex));
    paintCover(t);
  }

  function paintCover(t) {
    const src = t && t.cover ? t.cover : '';
    if (src) {
      if (coverImg.getAttribute('src') !== src) coverImg.setAttribute('src', src);
      coverImg.hidden = false;
      coverGlyph.hidden = true;
    } else {
      if (coverImg.getAttribute('src')) coverImg.removeAttribute('src');
      coverImg.hidden = true;
      coverGlyph.hidden = false;
    }
    cover.setAttribute('aria-label', t ? (playing ? '暂停' : '播放') : '打开曲库');
  }

  function saveMediaSession() {
    const t = track();
    mediaSession(t ? t.name : 'NexlOS 音乐', t ? (t.artist || sourceName(active)) : 'NexlOS', playing, {
      play: () => toggle(),
      pause: () => stopAll(),
      previoustrack: () => move(-1),
      nexttrack: () => move(1),
      stop: () => stopAll(),
    });
  }

  function flash(msg, kind) {
    note.textContent = msg || '';
    note.dataset.kind = kind || '';
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { note.textContent = ''; }, 4200);
  }

  // ---------- 事件 ----------

  audio.addEventListener('play', () => { playing = true; paint(); saveMediaSession(); });
  audio.addEventListener('pause', () => { if (audio.currentTime > 0 && !audio.ended) { playing = false; paint(); } });
  audio.addEventListener('timeupdate', () => {
    if (!seek.disabled) {
      cur.textContent = timeText(audio.currentTime);
      seek.value = String(audio.currentTime || 0);
    }
    remember(false);
  });
  audio.addEventListener('loadedmetadata', () => {
    dur.textContent = timeText(audio.duration);
    seek.max = String(isFinite(audio.duration) ? audio.duration : 0);
    paint();
  });
  audio.addEventListener('ended', () => {
    if (state.repeat === 'one') { audio.currentTime = 0; playSafe(audio); return; }
    const list = curList();
    if (state.repeat === 'off' && listIndex === list.length - 1) { playing = false; paint(); return; }
    move(1);
  });
  audio.addEventListener('error', () => {
    if (audio.src) flash('这首音频加载失败（地址失效或跨域）', 'error');
  });

  function onKey(e) {
    if (e.target.closest('input, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight' && e.shiftKey) move(1);
    else if (e.key === 'ArrowLeft' && e.shiftKey) move(-1);
    else if (e.key === 'm') { setVolume(audio.volume > 0 ? 0 : 0.7); remember(true); }
  }
  window.addEventListener('keydown', onKey);

  const offLifecycle = onLifecycle((s) => {
    if (s === 'suspend') stopAll();
  });
  window.addEventListener('pagehide', () => remember(true));

  function applyTheme(patch) {
    if (!patch) return;
    document.documentElement.setAttribute('data-theme', patch.theme === 'dark' ? 'dark' : 'light');
    document.documentElement.setAttribute('data-appearance', patch.appearance === 'win98' ? 'win98' : 'current');
  }

  function onPrefs(e) {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'nexlos.win.plan') {
      // 外壳定了方向：先换对齐（窄窗下看不出变化），再让它长窗口，最后露抽屉。
      const side = e.data.side === 'left' ? 'left' : 'right';
      el.setAttribute('data-lib-side', side);
      postWin({ type: 'nexlos.win', action: 'growLeft', open: true, delta: LIB_GROW, side });
      el.classList.add('ma-lib-open');
      return;
    }
    if (e.data.type === 'nexlos.win.closed') {
      el.removeAttribute('data-lib-side');
      return;
    }
    if (e.data.type === 'nexlos.settings') applyTheme(e.data.patch);
  }
  window.addEventListener('message', onPrefs);
  api('settings.get').then((r) => applyTheme(r.detail || {})).catch(() => {});

  // ---------- 启动 ----------

  paintSources();
  paintChrome();
  renderList();
  paint();
  setVolume(state.volume);
  if (state.time > 0 && track()) {
    try { audio.currentTime = state.time; } catch (e) { /* 未就绪 */ }
  }

  return {
    destroy() {
      remember(true);
      offLifecycle();
      // 关窗时若抽屉还开着，把外壳让出去的那块宽度收回来。
      if (el.classList.contains('ma-lib-open')) {
        postWin({
          type: 'nexlos.win', action: 'growLeft', open: false, delta: LIB_GROW,
          side: el.getAttribute('data-lib-side') || 'right',
        });
      }
      window.removeEventListener('message', onPrefs);
      window.removeEventListener('keydown', onKey);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      Object.keys(hosts).forEach((id) => dropHost(id));
    },
  };
}

