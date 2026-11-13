// 媒体文件浏览器：视频与音乐共用的一套“本机文件”选择器。
//
// 只读取工作区的 nexl交换区：媒体不进系统目录扫描，播放器也不用遍历整棵树。
// 从设备选取的文件会先上传到 nexl交换区，再按普通本机文件播放，避免直接吃设备 IO。
// 交互按 Windows 资源管理器：位置入口 → 地址路径 → 文件夹/文件列表 → 底部动作。

import { h, clear, api } from './dom.js';
import { icon } from './icons.js';

export const MEDIA_ROOT = '/nexl交换区';

const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|ogg|mov|mkv|avi)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|avif|heic|heif)$/i;

const PLACES = [{ path: MEDIA_ROOT, label: 'nexl交换区' }];

function joinPath(dir, name) {
  return (dir === '/' ? '' : dir) + '/' + name;
}

function parentPath(path) {
  if (!path || path === '/') return '/';
  const cut = path.replace(/\/+$/, '').lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
}

function sizeText(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb.toFixed(mb < 10 ? 1 : 0) + ' MB';
}

function inRoot(path) {
  return path === MEDIA_ROOT || (path || '').indexOf(MEDIA_ROOT + '/') === 0;
}

function clampPath(path) {
  return inRoot(path) ? path : MEDIA_ROOT;
}

function isMediaName(name, media) {
  if (media === 'video') return VIDEO_EXT.test(name);
  if (media === 'image') return IMAGE_EXT.test(name);
  return AUDIO_EXT.test(name);
}

function matches(entry, media) {
  if (entry.kind === 'folder') return true;
  return isMediaName(entry.name, media);
}

export function mediaURL(path) {
  // inline=1 让内核用 inline 而不是 attachment 返回，媒体元素可以直接边下边播。
  return '/d?path=' + encodeURIComponent(path) + '&inline=1';
}

export function openMediaBrowser(opts) {
  const media = opts.media === 'video' || opts.media === 'image' ? opts.media : 'audio';
  const multi = !!opts.multi;
  const onPick = typeof opts.onPick === 'function' ? opts.onPick : function () {};
  const label = media === 'video' ? '视频' : media === 'image' ? '照片' : '音乐';
  const title = opts.title || (multi ? '选择本机' + label : '打开本机' + label);

  let path = MEDIA_ROOT;
  let entries = [];
  let selected = {};
  let busy = false;
  let closed = false;

  const crumb = h('div', { class: 'mf-crumb', title: path });
  const places = h('div', { class: 'mf-places' });
  const list = h('div', { class: 'mf-list', role: 'listbox', 'aria-label': title });
  const status = h('span', { class: 'mf-status' }, '正在读取…');
  const openBtn = h('button', { class: 'mf-btn primary', type: 'button', disabled: true }, multi ? '加入曲库' : '打开');
  const importBtn = h('button', { class: 'mf-btn', type: 'button', onclick: () => importInput.click() }, '从设备导入');
  const importInput = h('input', {
    type: 'file', hidden: true,
    accept: media === 'video' ? 'video/*,.mkv' : media === 'image' ? 'image/*' : 'audio/*,.flac',
    multiple: true,
    onchange: () => { importFiles(importInput.files); importInput.value = ''; },
  });
  const upBtn = h('button', { class: 'mf-icon', type: 'button', title: '上一级', 'aria-label': '上一级', onclick: () => navigate(parentPath(path)) }, icon('chevron-up'));
  const closeBtn = h('button', { class: 'mf-icon', type: 'button', title: '关闭', 'aria-label': '关闭', onclick: () => close() }, icon('close'));

  const box = h('div', { class: 'mf-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'mf-head' },
      h('div', { class: 'mf-headtop' },
        h('span', { class: 'mf-title' }, title),
        h('div', { class: 'mf-headtools' }, upBtn, closeBtn)),
      places,
      crumb),
    list,
    h('footer', { class: 'mf-foot' }, status,
      importBtn,
      h('button', { class: 'mf-btn', type: 'button', onclick: () => close() }, '取消'),
      openBtn),
    importInput);

  const el = h('div', { class: 'mf', 'data-media': media }, box);

  function paintPlaces() {
    clear(places);
    PLACES.forEach((p) => {
      places.append(h('button', {
        class: 'mf-place' + (path === p.path || path.indexOf(p.path + '/') === 0 ? ' on' : ''),
        type: 'button',
        onclick: () => navigate(p.path),
      }, p.label));
    });
  }

  function selectedPaths() {
    return Object.keys(selected).filter((p) => selected[p]);
  }

  function paintSelection() {
    const n = selectedPaths().length;
    upBtn.disabled = path === MEDIA_ROOT;
    openBtn.disabled = busy || n === 0;
    importBtn.disabled = busy;
    openBtn.textContent = multi ? (n > 1 ? '加入曲库 · ' + n : '加入曲库') : '打开';
    const files = entries.filter((e) => e.kind === 'file').length;
    status.textContent = busy ? '正在处理…' : (n ? '已选 ' + n + ' 个 · ' : '') + '本层 ' + files + ' 个' + label + '文件';
    Array.prototype.forEach.call(list.querySelectorAll('.mf-row'), (row) => {
      const p = row.getAttribute('data-path');
      row.classList.toggle('on', !!selected[p]);
      row.setAttribute('aria-selected', selected[p] ? 'true' : 'false');
    });
  }

  function choose(entry) {
    const p = joinPath(path, entry.name);
    if (entry.kind === 'folder') { navigate(p); return; }
    if (multi) {
      selected[p] = !selected[p];
      paintSelection();
    } else {
      pick([p]);
    }
  }

  function pick(paths) {
    if (!paths.length) return;
    onPick(paths);
    close();
  }

  function renderList() {
    clear(list);
    if (!entries.length) {
      list.append(h('p', { class: 'mf-empty' }, busy
        ? '正在读取…'
        : 'nexl交换区里还没有' + label + '。把文件移进这个文件夹，或用“从设备导入”复制进来。'));
      paintSelection();
      return;
    }
    entries.forEach((entry) => {
      const p = joinPath(path, entry.name);
      // 用 div 而不是 button：Chrome 72 不给 <button> 应用 display:grid，
      // 行尾的箭头会抻成整列宽，旋转后盖住整个列表。
      const row = h('div', {
        class: 'mf-row' + (entry.kind === 'folder' ? ' folder' : ''),
        'data-path': p,
        'data-kind': entry.kind,
        role: 'option',
        tabindex: '0',
        'aria-selected': 'false',
        onclick: () => choose(entry),
        ondblclick: () => { if (entry.kind === 'file') pick([p]); },
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(entry); }
        },
      },
      h('span', { class: 'mf-rowicon' }, icon(entry.kind === 'folder' ? 'folder' : (media === 'video' ? 'video' : media === 'image' ? 'image' : 'music'))),
      h('span', { class: 'mf-rowtext' },
        h('b', { 'data-i18n-skip': true }, entry.name),
        h('i', {}, entry.kind === 'folder' ? '文件夹' : (entry.kindLabel || label))),
      h('span', { class: 'mf-rowsize' }, entry.kind === 'file' ? sizeText(entry.size) : ''),
      entry.kind === 'folder' ? h('span', { class: 'mf-rowgo' }, icon('chevron-up')) : null);
      list.append(row);
    });
    paintSelection();
  }

  async function navigate(next) {
    if (closed) return;
    path = clampPath(next);
    selected = {};
    busy = true;
    crumb.textContent = path;
    crumb.title = path;
    paintPlaces();
    renderList();
    try {
      const r = await api('fs.list', { query: { path: path } });
      entries = (r.append || []).filter((e) => matches(e, media));
      path = clampPath((r.detail && r.detail.path) || path);
      crumb.textContent = path;
      crumb.title = path;
      busy = false;
      renderList();
    } catch (e) {
      busy = false;
      clear(list);
      list.append(h('p', { class: 'mf-empty error' }, e.message || '读不到这个文件夹'));
      status.textContent = '读取失败';
    }
  }

  async function importFiles(files) {
    const list0 = Array.prototype.slice.call(files || []);
    if (!list0.length || busy) return;
    busy = true;
    selected = {};
    paintSelection();
    const uploaded = [];
    let failed = 0;
    for (let i = 0; i < list0.length; i++) {
      status.textContent = '正在导入 ' + (i + 1) + ' / ' + list0.length + '…';
      const fd = new FormData();
      fd.append('file', list0[i], list0[i].name);
      try {
        const res = await fetch('/u?path=' + encodeURIComponent(path), {
          method: 'POST',
          headers: { 'X-NEXLOS-Upload': '1' },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        if (data.detail && data.detail.path && isMediaName(list0[i].name, media)) uploaded.push(data.detail.path);
      } catch (e) {
        failed += 1;
      }
    }
    busy = false;
    // 导入完成直接交回调用方：文件已经在 nexl交换区，后续播放不再碰设备。
    if (uploaded.length) { pick(uploaded); return; }
    await navigate(path);
    status.textContent = failed ? '有 ' + failed + ' 个文件没有导入成功' : '没有识别到' + label + '文件';
  }

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    el.remove();
    if (opts.onClose) opts.onClose();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Backspace' && !e.target.closest('input')) { e.preventDefault(); navigate(parentPath(path)); }
    else if (e.key === 'Enter' && selectedPaths().length) { e.preventDefault(); pick(selectedPaths()); }
  }

  openBtn.addEventListener('click', () => pick(selectedPaths()));
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', onKey, true);

  // 触屏没有“双击打开”的惯例：单击文件直接播放，文件夹仍然单击进入。
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    box.classList.add('coarse');
  }

  document.body.append(el);
  navigate(path);
  return { close: close, el: el };
}

export { VIDEO_EXT, AUDIO_EXT, IMAGE_EXT };
