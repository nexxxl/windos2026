import { h } from './can.js';
import { t } from './i18n.js';
import { PIXEL_SPARK_SVG } from './pixel-spark.js';
import { getClassicSoundPreferences, playClassicSound, stopClassicSounds } from './classic-sound-engine.js';

// NexlOS artwork and procedural audio use local source assets. No historical
// logo, recording, binary resource, or remotely hosted asset is embedded here.
const SESSION_KEY = 'nexlos.window2026.boot.v1';
const BOOT_MS = 3200;
let activeBoot = null;
let disarmSound = null;

function isClassic() {
  return typeof document !== 'undefined' && document.documentElement.dataset.appearance === 'win98';
}

function alreadyShown() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
}

function markShown() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* The in-memory singleton still prevents overlap. */ }
}

function clearPendingSound() {
  if (disarmSound) disarmSound();
}

function deferSound(volume) {
  clearPendingSound();
  const activate = event => {
    if (!event.isTrusted || document.visibilityState === 'hidden' || !isClassic()) return;
    clearPendingSound();
    playClassicStartupSound({ volume, deferUntilGesture: false });
  };
  const expire = setTimeout(clearPendingSound, 30000);
  const cleanup = () => {
    clearTimeout(expire);
    document.removeEventListener('pointerdown', activate, true);
    document.removeEventListener('keydown', activate, true);
    if (disarmSound === cleanup) disarmSound = null;
  };
  document.addEventListener('pointerdown', activate, true);
  document.addEventListener('keydown', activate, true);
  disarmSound = cleanup;
}

/** Stop startup activation deferral and all currently playing classic sounds. */
export function stopClassicStartupSound() {
  clearPendingSound();
  stopClassicSounds();
}

/** Startup alone may wait for the browser's first trusted activation.
 * Short interaction sounds go directly to playClassicSound and never wait. */
export async function playClassicStartupSound(options = {}) {
  if (typeof window === 'undefined' || !isClassic() || document.visibilityState === 'hidden') return false;
  const prefs = getClassicSoundPreferences();
  const volume = options.volume === undefined ? prefs.volume : options.volume;
  if (!prefs.enabled || !Number.isFinite(volume) || volume <= 0 || volume > 1) {
    clearPendingSound();
    return false;
  }
  if (!(window.AudioContext || window.webkitAudioContext)) return false;
  const activation = navigator.userActivation;
  if (options.deferUntilGesture !== false && (!activation || (!activation.hasBeenActive && !activation.isActive))) {
    deferSound(volume);
    return false;
  }
  clearPendingSound();
  return playClassicSound('startup', { volume });
}

function emptyController(reason, onReady) {
  if (typeof onReady === 'function') Promise.resolve().then(() => onReady(reason));
  return { shown: false, finished: Promise.resolve(reason), skip() {}, cancel() {}, playSound: playClassicStartupSound };
}

/**
 * Non-blocking visual startup sequence for Windos2026. Call after the skin has
 * been reconciled with settings.get, and load classic-boot.css with the shell.
 * `force: true` is for a user-requested replay; normal calls show once/session.
 * The returned finished Promise resolves with complete, skipped or cancelled.
 */
export function startClassicBoot(options = {}) {
  if (!isClassic()) return emptyController('modern', options.onReady);
  if (activeBoot) {
    if (!options.force) return activeBoot;
    activeBoot.cancel();
  }
  if (!options.force && alreadyShown()) return emptyController('seen', options.onReady);
  markShown();
  const previousFocus = document.activeElement;
  const reduced = options.reduceMotion === true || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = h('section', { class: `c98-boot${reduced ? ' is-reduced' : ''}`, 'aria-label': t('正在启动 Windos2026…'), 'data-i18n-key': '正在启动 Windos2026…' },
    h('div', { class: 'c98-boot-art', 'aria-hidden': 'true', 'data-i18n-skip': '' },
      h('div', { class: 'c98-boot-composition' },
        h('div', { class: 'c98-boot-mark', html: PIXEL_SPARK_SVG }),
        h('div', { class: 'c98-boot-wordmark' },
          h('span', { class: 'c98-boot-maker' }, 'Nexl'),
          h('span', { class: 'c98-boot-product' }, 'Windos2026')))),
    h('div', { class: 'c98-boot-status', role: 'status', 'aria-live': 'polite', 'data-i18n-key': '正在启动 Windos2026…' }, t('正在启动 Windos2026…')),
    h('div', { class: 'c98-boot-track', 'aria-hidden': 'true' }, h('i')));
  let resolveFinished;
  let timer = 0;
  let settled = false;
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  // 开机画面只读：不放关闭按钮，也不抢焦点（焦点框会印在开场画面上）。
  // 键盘仍可用 Esc 跳过，属于隐藏快捷键。
  const onKey = event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); complete('skipped');
    }
  };
  const observer = new MutationObserver(() => { if (!isClassic()) complete('cancelled'); });
  function complete(reason) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    observer.disconnect();
    document.removeEventListener('keydown', onKey, true);
    if (reason === 'cancelled') stopClassicStartupSound();
    const restoreFocus = el.contains(document.activeElement);
    el.remove();
    if (activeBoot === controller) activeBoot = null;
    if (restoreFocus && previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
    resolveFinished(reason);
    if (typeof options.onReady === 'function') options.onReady(reason);
  }
  const controller = {
    shown: true,
    finished,
    skip: () => complete('skipped'),
    cancel: () => complete('cancelled'),
    playSound: () => playClassicStartupSound({ volume: options.volume }),
  };
  activeBoot = controller;
  document.addEventListener('keydown', onKey, true);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-appearance'] });
  (options.host || document.body).append(el);
  timer = setTimeout(() => complete('complete'), reduced ? 450 : BOOT_MS);
  if (options.sound !== false) controller.playSound();
  return controller;
}

/** A convenient handler for Settings/Start menu replay controls. */
export function replayClassicBoot(options = {}) {
  return startClassicBoot(Object.assign({}, options, { force: true }));
}
