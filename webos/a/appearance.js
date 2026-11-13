import { api } from './can.js';

// settings.json is authoritative; this cache only paints the last appearance
// before the first request returns. Never reload an application to change skin.
const CACHE = 'nexlos.appearance.v1';
const TYPOGRAPHY_CACHE = 'nexlos.typography.v1';
let revision = 0;
const typography = { retroFont: 'pixel', retroFontSize: 12 };

export const RETRO_FONTS = [
  { id: 'pixel', name: 'Source Sans 3 + Pixel', family: '"Source Sans 3", "NexlOS Fusion Pixel", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif' },
  { id: 'sans', name: 'Source Sans 3', family: '"Source Sans 3", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif' },
  { id: 'serif', name: '宋体', family: 'SimSun, "Songti SC", "Noto Serif CJK SC", serif' },
  { id: 'mono', name: '等宽', family: 'Consolas, "SFMono-Regular", "Noto Sans Mono CJK SC", monospace' },
];
export const RETRO_FONT_SIZES = Array.from({ length: 13 }, (_, i) => 12 + i);

export const RETRO_BACKGROUNDS = [
  { id: 'default', name: '湖畔公园', image: '/a/wallpapers/meadow.webp' },
  { id: 'teal', name: '经典青绿', color: '#008080' },
  { id: 'slate', name: '经典灰', color: '#808080' },
];

export function wallpaperField(appearance) { return appearance === 'win98' ? 'retroWallpaper' : 'wallpaper'; }
export function wallpaperKey(appearance) { return appearance === 'win98' ? 'nexlos.os.win98.wallpaper' : 'nexlos.os.wallpaper'; }

export function applyAppearance(value) {
  if (value !== 'current' && value !== 'win98') return;
  revision += 1;
  document.documentElement.dataset.appearance = value;
  try { localStorage.setItem(CACHE, value); } catch (e) { /* Storage may be unavailable in private browsing. */ }
}

// The font IDs are a whitelist, never CSS received from settings or a message.
// Variables live on each document; only the Windos2026 stylesheet consumes them.
export function applyTypography(patch) {
  if (!patch || typeof patch !== 'object') return;
  let changed = false;
  if (RETRO_FONTS.some((font) => font.id === patch.retroFont)) {
    typography.retroFont = patch.retroFont;
    changed = true;
  }
  if (Number.isInteger(patch.retroFontSize) && patch.retroFontSize >= 12 && patch.retroFontSize <= 24) {
    typography.retroFontSize = patch.retroFontSize;
    changed = true;
  }
  if (!changed) return;
  revision += 1;
  const root = document.documentElement;
  const font = RETRO_FONTS.find((item) => item.id === typography.retroFont);
  root.style.setProperty('--retro-font-family', font.family);
  root.style.setProperty('--retro-font-size', `${typography.retroFontSize}px`);
  root.style.setProperty('--retro-font-smoothing', 'auto');
  root.dataset.retroFont = typography.retroFont;
  try { localStorage.setItem(TYPOGRAPHY_CACHE, JSON.stringify(typography)); } catch (e) { /* The authoritative preference remains in settings.json. */ }
}

export function initAppearance(onPrefs) {
  try {
    const cached = localStorage.getItem(TYPOGRAPHY_CACHE);
    applyTypography(cached ? JSON.parse(cached) : typography);
  } catch (e) { applyTypography(typography); }
  const requestedAt = revision;
  api('settings.get').then((r) => {
    if (revision !== requestedAt) return;
    const prefs = r.detail || {};
    applyAppearance(prefs.appearance || 'current');
    applyTypography({ retroFont: prefs.retroFont || 'pixel', retroFontSize: prefs.retroFontSize || 12 });
    if (onPrefs) onPrefs(prefs);
  }).catch(() => { /* Keep the cached skin while the local kernel is unavailable. */ });

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== window.parent || !e.data) return;
    if (e.data.type === 'nexlos.settings' && e.data.patch) {
      applyAppearance(e.data.patch.appearance);
      applyTypography(e.data.patch);
      if (onPrefs) onPrefs(e.data.patch);
    }
  });
}
