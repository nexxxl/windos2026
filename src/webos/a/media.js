// NexlOS 内置媒体：视频与音乐。
//
// 第一性原理（来自脉语言）：
//   1. 状态只有一份，渲染是它的投影；播放位置、音量、曲库都落在同一个快照里。
//   2. 能力显式：音频必须由用户手势解锁，摄像头/画中画/Media Session 全部先探测再使用。
//   3. 生命周期由外壳驱动：窗口切到后台就暂停画面，升级为 suspend 时先释放资源。
//   4. 零第三方依赖：音频可视化用 WebAudio AnalyserNode，环境音用振荡器与噪声合成。
//
// 这个文件不碰 Go 内核，纯前端；本地文件用 object URL，不落盘、不上传。

import { h, clear, esc } from './can.js';
import { icon } from './icons.js';
import { onLifecycle, rafThrottle, haptic, reducedMotion } from './mai.js';
import { openMediaBrowser, mediaURL } from './mediafiles.js';
import { read, write, clamp, timeText, sizeText, isVideoName, revoke, playSafe, mediaSession, insideExchange } from './mediautil.js';

const VIDEO_KEY = 'nexlos.media.video.v1';

// ---------- 视频 ----------

export function mountVideo(host) {
  const state = read(VIDEO_KEY, { src: '', path: '', name: '', time: 0, volume: 0.8, muted: false, rate: 1, embed: '', embedTitle: '' });
  let objectURL = '';
  let hideTimer = 0;
  let saveAt = 0;
  let dragging = false;

  const video = h('video', {
    class: 'mv-video', playsinline: true, 'webkit-playsinline': 'true',
    preload: 'metadata', 'aria-label': '视频画面',
  });
  video.volume = clamp(Number(state.volume) || 0.8, 0, 1);
  video.muted = !!state.muted;
  video.playbackRate = Number(state.rate) || 1;

  const empty = h('div', { class: 'mv-empty' },
    h('div', { class: 'mv-empty-icon' }, icon('video')),
    h('b', {}, state.path ? '上次的视频找不到了' : '打开本机的视频'),
    h('p', {}, state.path ? `${state.name || state.path} 不在原来的位置了；从 nexl交换区里重新选一个。` : '只读工作区的 nexl交换区。把视频移进去，或从设备导入时自动复制进来。也可以拖进来或粘贴直链。'),
    h('div', { class: 'mv-empty-actions' },
      h('button', { class: 'mv-btn primary', type: 'button', onclick: browse }, '打开本机视频'),
      h('button', { class: 'mv-btn', type: 'button', onclick: () => urlInput.focus() }, '粘贴地址')));

  const bigPlay = h('button', {
    class: 'mv-bigplay', type: 'button', 'aria-label': '播放',
    onclick: () => toggle(),
  }, icon('play'));

  const badge = h('div', { class: 'mv-badge', hidden: true });
  // 平台页面（YouTube / B 站 / Vimeo）用官方嵌入播放器；直链仍走 <video>。
  const frame = h('iframe', {
    class: 'mv-frame', hidden: true, allow: 'autoplay; fullscreen; picture-in-picture',
    allowfullscreen: '', referrerpolicy: 'no-referrer-when-downgrade',
    // 平台嵌入页可以弹登录窗，但无权把整个 WebOS 顶层导航走。
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-popups-to-escape-sandbox',
  });
  const stage = h('div', { class: 'mv-stage' }, video, frame, empty, bigPlay, badge);

  const seek = h('input', {
    class: 'mv-seek', type: 'range', min: '0', max: '0', step: '0.01', value: '0',
    'aria-label': '播放进度',
    oninput: () => {
      dragging = true;
      if (isFinite(video.duration)) video.currentTime = Number(seek.value) || 0;
      cur.textContent = timeText(Number(seek.value) || 0);
    },
    onchange: () => { dragging = false; remember(true); },
  });
  const cur = h('span', { class: 'mv-time' }, '00:00');
  const dur = h('span', { class: 'mv-time' }, '00:00');
  const playBtn = h('button', { class: 'mv-btn mv-play', type: 'button', 'aria-label': '播放', onclick: () => toggle() }, icon('play'));
  const muteBtn = h('button', { class: 'mv-btn', type: 'button', 'aria-label': '静音', onclick: () => { video.muted = !video.muted; state.muted = video.muted; remember(true); paint(); } }, icon('volume'));
  const vol = h('input', {
    class: 'mv-vol', type: 'range', min: '0', max: '1', step: '0.01', value: String(video.volume),
    'aria-label': '音量',
    oninput: () => { video.volume = Number(vol.value) || 0; video.muted = video.volume === 0; state.volume = video.volume; state.muted = video.muted; paint(); },
    onchange: () => remember(true),
  });
  const rateBtn = h('button', { class: 'mv-btn mv-rate', type: 'button', 'aria-label': '播放速度', onclick: () => cycleRate() }, '1×');
  const pipBtn = h('button', { class: 'mv-btn', type: 'button', 'aria-label': '画中画', onclick: () => pip() }, icon('pip'));
  const fsBtn = h('button', { class: 'mv-btn', type: 'button', 'aria-label': '全屏', onclick: () => fullscreen() }, icon('expand'));

  const bar = h('div', { class: 'mv-bar' },
    playBtn,
    h('span', { class: 'mv-times' }, cur, h('i', {}, '/'), dur),
    seek,
    h('div', { class: 'mv-right' }, muteBtn, vol, rateBtn, pipBtn, fsBtn));

  const urlInput = h('input', {
    class: 'mv-url', type: 'url', inputmode: 'url', placeholder: '粘贴视频链接（YouTube / B 站 / Vimeo / mp4 直链）', spellcheck: 'false',
    onkeydown: (e) => { if (e.key === 'Enter') useURL(); },
  });
  const note = h('span', { class: 'mv-note' });
  const srcRow = h('div', { class: 'mv-srcrow' },
    h('span', { class: 'mv-srcicon' }, icon('link')),
    urlInput,
    h('button', { class: 'mv-btn', type: 'button', onclick: useURL }, '打开'),
    h('button', { class: 'mv-btn', type: 'button', onclick: browse }, icon('folder'), '本机'),
    note);

  const el = h('div', { class: 'mv' }, stage, bar, srcRow);
  host.append(el);

  function flash(msg, kind) {
    note.textContent = msg || '';
    note.dataset.kind = kind || '';
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { note.textContent = ''; }, 4200);
  }

  function paint() {
    const playing = !video.paused && !video.ended;
    playBtn.innerHTML = '';
    playBtn.append(icon(playing ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
    bigPlay.hidden = !!state.embed || playing || !video.src;
    bigPlay.innerHTML = '';
    bigPlay.append(icon(playing ? 'pause' : 'play'));
    muteBtn.innerHTML = '';
    muteBtn.append(icon(video.muted || video.volume === 0 ? 'volume-off' : 'volume'));
    vol.value = String(video.muted ? 0 : video.volume);
    rateBtn.textContent = String(video.playbackRate) + '×';
    el.classList.toggle('is-playing', playing);
    el.classList.toggle('is-idle', !playing);
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    if (playing) {
      hideTimer = setTimeout(() => el.classList.add('controls-hidden'), 2600);
    } else {
      el.classList.remove('controls-hidden');
    }
  }

  function remember(force) {
    const now = Date.now();
    if (!force && now - saveAt < 1500) return;
    saveAt = now;
    state.time = isFinite(video.currentTime) ? video.currentTime : 0;
    state.volume = video.volume;
    state.muted = video.muted;
    state.rate = video.playbackRate;
    // 本地 blob 只记名字；下次打开提示重新选择，避免写入一个失效地址。
    if (video.src && video.src.indexOf('blob:') !== 0) state.src = video.src;
    write(VIDEO_KEY, state);
  }

  function toggle() {
    if (!video.src) return;
    if (video.paused || video.ended) {
      playSafe(video).catch(() => flash('浏览器拒绝了播放，请再点一次', 'error'));
    } else {
      video.pause();
    }
  }

  // 媒体源只接受 blob:、video/audio 的 data:、http(s) 与站内绝对路径。
  // 其余 scheme（javascript:、file: 等）直接丢弃，避免把未知串交给 <video src>。
  function mediaSrc(url) {
    const s = String(url === null || url === undefined ? '' : url);
    if (/^blob:/i.test(s)) return s;
    if (/^data:/i.test(s)) return /^data:(?:video|audio)\//i.test(s) ? s : '';
    if (/^https?:\/\//i.test(s) || s.charAt(0) === '/') return s;
    return '';
  }

  function setSource(src, name, persist, filePath) {
    const safe = mediaSrc(src);
    if (!safe) return;
    // 从嵌入播放器切回直链时，先把 iframe 卸掉，避免它在后台继续加载。
    if (!frame.hidden) { frame.hidden = true; frame.removeAttribute('src'); }
    video.hidden = false;
    bar.hidden = false;
    state.embed = '';
    state.embedTitle = '';
    revoke(objectURL);
    objectURL = '';
    if (safe.indexOf('blob:') === 0) objectURL = safe;
    video.src = safe;
    video.load();
    state.time = 0;
    state.name = name || '';
    state.path = filePath || '';
    if (persist && safe.indexOf('blob:') !== 0) state.src = safe;
    empty.hidden = true;
    badge.hidden = false;
    badge.textContent = name || '';
    note.textContent = '';
    paint();
    playSafe(video).catch(() => { /* 自动播放被拦，保留大按钮 */ });
  }

  function fileName(path) {
    const parts = String(path || '').split('/');
    return parts[parts.length - 1] || path;
  }

  function browse() {
    openMediaBrowser({
      media: 'video',
      onPick: (paths) => {
        const p = paths[0];
        if (!p) return;
        setSource(mediaURL(p), fileName(p), true, p);
        flash('已打开 ' + fileName(p));
      },
    });
  }

  function useFile(file) {
    if (!file) return;
    if (!isVideoName(file.name)) flash('这个文件看起来不是视频', 'error');
    setSource(URL.createObjectURL(file), file.name, false, '');
    flash(`${file.name}${file.size ? ' · ' + sizeText(file.size) : ''}`);
  }

  function setEmbed(src, title) {
    revoke(objectURL);
    objectURL = '';
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
    empty.hidden = true;
    bigPlay.hidden = true;
    bar.hidden = true;
    badge.hidden = false;
    badge.textContent = title || '嵌入播放器';
    frame.hidden = false;
    frame.src = src;
    state.src = '';
    state.path = '';
    state.name = title || '';
    state.embed = src;
    state.embedTitle = title || '';
    remember(true);
    note.textContent = '';
    flash(title ? '已载入：' + title : '已载入嵌入播放器');
  }

  let resolving = false;

  // 页面链接先问内核：平台页走官方嵌入，直链或页面声明的片源走 <video>。
  function resolveLink(url) {
    if (resolving) return;
    resolving = true;
    flash('正在解析链接…');
    fetch('/c/media.resolve?url=' + encodeURIComponent(url))
      .then((r) => r.json())
      .then((body) => {
        const info = body && body.detail && body.detail.result;
        if (!body || !body.ok || !info) {
          flash((body && body.error) || '这个链接解析不到可播放的片源', 'error');
        } else if (info.kind === 'embed') {
          setEmbed(info.url, info.title);
        } else if (info.kind === 'direct') {
          setSource(info.url, info.title || info.url.split('/').pop() || info.url, true);
          flash(info.title ? '已解析：' + info.title : '已解析直链');
        } else if (info.kind === 'hls') {
          flash('这是 HLS 流，内置播放器暂不支持；可先在浏览器打开', 'error');
        } else {
          flash(info.reason || '没有找到可直接播放的片源', 'error');
        }
      })
      .catch(() => flash('解析失败：检查网络，或直接粘贴 mp4 直链', 'error'))
      .then(() => { resolving = false; });
  }

  function useURL() {
    const raw = (urlInput.value || '').trim();
    if (!raw) { urlInput.focus(); return; }
    let url = raw;
    if (!/^[a-z]+:\/\//i.test(url) && !url.startsWith('blob:') && !url.startsWith('/')) url = 'https://' + url;
    try { new URL(url, location.href); } catch (e) { flash('地址格式不对', 'error'); return; }
    urlInput.value = '';
    // 明确的媒体后缀直接播，省一次往返；页面链接交给内核解析。
    if (/\.(mp4|m4v|webm|ogv|ogg|mov|mp3|m4a|wav|flac)(\?|#|$)/i.test(url)) {
      setSource(url, url.split('/').pop() || url, true);
      return;
    }
    resolveLink(url);
  }

  function cycleRate() {
    const list = [1, 1.25, 1.5, 2, 0.75];
    const i = list.indexOf(video.playbackRate);
    video.playbackRate = list[(i + 1) % list.length];
    remember(true);
    paint();
  }

  function pip() {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
      return;
    }
    if (!video.requestPictureInPicture) { flash('这个浏览器不支持画中画', 'error'); return; }
    video.requestPictureInPicture().catch(() => flash('画中画被拒绝', 'error'));
  }

  function fullscreen() {
    const node = el;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
        return;
      }
      const req = node.requestFullscreen || node.webkitRequestFullscreen;
      if (!req) { flash('这个浏览器不支持全屏', 'error'); return; }
      const p = req.call(node);
      if (p && p.catch) p.catch(() => flash('全屏被拒绝', 'error'));
    } catch (e) { flash('全屏被拒绝', 'error'); }
  }

  video.addEventListener('loadedmetadata', () => {
    badge.hidden = !video.videoWidth;
    if (!badge.hidden) badge.textContent = `${video.videoWidth}×${video.videoHeight} · ${timeText(video.duration)}`;
    dur.textContent = timeText(video.duration);
    seek.max = String(isFinite(video.duration) ? video.duration : 0);
    // 恢复上次位置，但别落在片尾。
    if (state.time > 1 && isFinite(video.duration) && state.time < video.duration - 2) {
      try { video.currentTime = state.time; } catch (e) { /* 未就绪 */ }
    }
    paint();
  });
  video.addEventListener('durationchange', () => { dur.textContent = timeText(video.duration); seek.max = String(isFinite(video.duration) ? video.duration : 0); });
  video.addEventListener('timeupdate', () => {
    if (!dragging) {
      cur.textContent = timeText(video.currentTime);
      seek.value = String(video.currentTime || 0);
    }
    remember(false);
  });
  video.addEventListener('play', () => { paint(); saveMediaSession(); remember(true); });
  video.addEventListener('pause', () => { paint(); saveMediaSession(); remember(true); });
  video.addEventListener('ended', () => { paint(); remember(true); });
  video.addEventListener('volumechange', paint);
  video.addEventListener('error', () => {
    const code = video.error && video.error.code;
    const msg = code === 4 ? '这个地址或格式浏览器放不了（可能是 MKV / HEVC）' : '视频加载失败';
    flash(msg, 'error');
    empty.hidden = false;
    empty.querySelector('b').textContent = '这段视频打不开';
    empty.querySelector('p').textContent = msg;
    bigPlay.hidden = true;
    paint();
  });

  function saveMediaSession() {
    const playing = !video.paused && !video.ended;
    mediaSession(state.name || '视频', 'NexlOS 视频', playing, {
      play: () => playSafe(video),
      pause: () => video.pause(),
      stop: () => { video.pause(); video.currentTime = 0; },
    });
  }

  // 点击画面切换播放；双击全屏。小屏上大按钮本身就是点击区。
  stage.addEventListener('click', (e) => {
    if (e.target.closest('button, input')) return;
    toggle();
  });
  stage.addEventListener('dblclick', (e) => { if (!e.target.closest('button, input')) fullscreen(); });
  el.addEventListener('pointermove', () => {
    el.classList.remove('controls-hidden');
    if (!video.paused) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => el.classList.add('controls-hidden'), 2200);
    }
  }, { passive: true });

  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drop'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('drop');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) useFile(f);
  });

  function onKey(e) {
    if (e.target.closest('input, textarea')) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); remember(true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); remember(true); }
    else if (e.key === 'm') { video.muted = !video.muted; state.muted = video.muted; remember(true); paint(); }
    else if (e.key === 'f') { fullscreen(); }
  }
  window.addEventListener('keydown', onKey);

  const offLifecycle = onLifecycle((s) => {
    if (s === 'background' || s === 'hidden' || s === 'suspend') {
      if (!video.paused) { video.pause(); remember(true); }
    }
    if (s === 'suspend') { video.removeAttribute('src'); video.load(); }
  });
  window.addEventListener('pagehide', () => remember(true));

  // 旧会话可能记着交换区之外的路径：按新策略直接忽略，避免播放器扫描整棵工作区。
  if (state.path && insideExchange(state.path)) {
    setSource(mediaURL(state.path), state.name || fileName(state.path), true, state.path);
  } else if (state.embed) {
    setEmbed(state.embed, state.embedTitle || '');
  } else if (state.src && state.src.indexOf('/d?path=') < 0) {
    setSource(state.src, state.name || state.src.split('/').pop(), true, '');
  } else { empty.hidden = false; paint(); }

  return {
    destroy() {
      remember(true);
      offLifecycle();
      window.removeEventListener('keydown', onKey);
      clearTimeout(hideTimer);
      video.pause();
      revoke(objectURL);
      video.removeAttribute('src');
      video.load();
      frame.removeAttribute('src');
    },
  };
}

export { mountMusic } from './music.js';
export { chime } from './mediautil.js';
