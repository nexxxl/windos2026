// 媒体公共件：视频（media.js）与音乐（music.js）共用的小工具。
// 只放无状态的纯函数，播放器各自持有自己的状态。

import { MEDIA_ROOT } from './mediafiles.js';

export function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? Object.assign({}, fallback, JSON.parse(raw)) : Object.assign({}, fallback);
  } catch (e) { return Object.assign({}, fallback); }
}

export function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 隐私模式不拦播放 */ }
}

export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// 媒体策略：工作区里只认 nexl交换区；其余路径不列、不播、不写回会话。
export function insideExchange(path) {
  return path === MEDIA_ROOT || (path || '').indexOf(MEDIA_ROOT + '/') === 0;
}

export function timeText(sec) {
  if (!isFinite(sec) || sec < 0) return '--:--';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const hh = Math.floor(sec / 3600);
  const mm = hh ? String(m).padStart(2, '0') : String(m);
  return (hh ? hh + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}

export function sizeText(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb.toFixed(mb < 10 ? 1 : 0) + ' MB';
}

export function isVideoName(name) { return /\.(mp4|m4v|webm|ogv|ogg|mov|mkv|avi)$/i.test(name || ''); }
export function isAudioName(name) { return /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i.test(name || ''); }

export function revoke(url) {
  if (url && url.indexOf('blob:') === 0) {
    try { URL.revokeObjectURL(url); } catch (e) { /* 已释放 */ }
  }
}

export function playSafe(node) {
  let p = null;
  try { p = node.play(); } catch (e) { return Promise.reject(e); }
  return p && p.then ? p : Promise.resolve();
}

// 一次“叮”：扫码成功与错误提示共用，短、轻、不刺耳。
export function chime(kind) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = chime.ctx || (chime.ctx = new Ctx());
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(kind === 'error' ? 220 : 880, t);
    if (kind !== 'error') osc.frequency.exponentialRampToValueAtTime(1320, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.28);
  } catch (e) { /* 没有音频设备时静默 */ }
}

export function mediaSession(title, artist, playing, handlers) {
  try {
    if (!('mediaSession' in navigator)) return;
    if (window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'NexlOS',
        artist: artist || 'NexlOS 媒体',
        album: 'NexlOS',
      });
    }
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    const map = {
      play: handlers && handlers.play,
      pause: handlers && handlers.pause,
      previoustrack: handlers && handlers.prev,
      nexttrack: handlers && handlers.next,
      stop: handlers && handlers.stop,
    };
    Object.keys(map).forEach((action) => {
      if (!map[action]) return;
      try { navigator.mediaSession.setActionHandler(action, map[action]); } catch (e) { /* 动作不支持 */ }
    });
  } catch (e) { /* Chrome 72 上部分动作不存在 */ }
}
