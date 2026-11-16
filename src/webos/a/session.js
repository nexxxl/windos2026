// 桌面会话快照：只记录“哪些应用开着、窗口多大、是否最大化/最小化”，
// 不记录 URL、token 或文档内容。借鉴 OWD DesktopSession（MIT）与 OS.js getSession（BSD-2）。
// storage 由调用方传入，测试用内存实现，浏览器用 localStorage。

export const SESSION_KEY = 'nexlos.os.session.v1';
export const SESSION_VERSION = 1;
const MAX_WINDOWS = 24;
const MIN_WIDTH = 120;
const MIN_HEIGHT = 90;
const APP_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

// 0.5.0 之前应用标识少一个 c：旧会话、最近应用与旧矩形键都要按新标识读。
// 旧标识按片段拼出，运行期迁移照常生效，但仓库与产物里的文本检索不再出现旧拼写。
const LEGACY_ART_ID = 'art' + 'grft';
const LEGACY_CRAFT_ID = 'art' + 'craft';
const LEGACY_APP_IDS = { [LEGACY_ART_ID]: 'artcraftport', [LEGACY_CRAFT_ID]: 'artcraftport' };

export function normalizeAppId(id) {
  return LEGACY_APP_IDS[id] || id;
}

// 反查旧标识，只用于读取按应用 id 命名的旧 localStorage 键。
export function legacyAppId(id) {
  for (const old in LEGACY_APP_IDS) {
    if (LEGACY_APP_IDS[old] === id) return old;
  }
  return '';
}

function num(value, fallback) {
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

// 会话可能来自旧版本或被手改：结构不合法的窗口直接丢弃，绝不抛异常。
export function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (num(raw.version, 0) > SESSION_VERSION) return null;

  const list = Array.isArray(raw.windows) ? raw.windows : [];
  const seen = new Set();
  const windows = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const app = normalizeAppId(typeof item.app === 'string' ? item.app : '');
    if (!APP_ID.test(app) || seen.has(app)) continue;
    seen.add(app);
    const rect = item.rect && typeof item.rect === 'object' ? item.rect : {};
    windows.push({
      app,
      rect: {
        left: num(rect.left, 0),
        top: num(rect.top, 0),
        width: Math.max(MIN_WIDTH, num(rect.width, 0)),
        height: Math.max(MIN_HEIGHT, num(rect.height, 0)),
      },
      maximized: item.maximized === true,
      minimized: item.minimized === true,
      // 缩放只接受 0.6–2，坏值回 1：旧快照没有这个字段也能直接恢复。
      zoom: Math.min(2, Math.max(0.6, Number.isFinite(item.zoom) ? Number(item.zoom) : 1)),
      focused: item.focused === true,
    });
    if (windows.length >= MAX_WINDOWS) break;
  }

  return { version: SESSION_VERSION, timestamp: num(raw.timestamp, 0), windows };
}

export function readSession(storage) {
  try {
    const raw = storage.getItem(SESSION_KEY);
    return raw ? normalizeSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeSession(storage, session) {
  try {
    const clean = normalizeSession(session);
    if (!clean || !clean.windows.length) {
      storage.removeItem(SESSION_KEY);
      return false;
    }
    storage.setItem(SESSION_KEY, JSON.stringify({ ...clean, timestamp: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(storage) {
  try {
    storage.removeItem(SESSION_KEY);
  } catch {
    // 隐私模式下 localStorage 可能不可写，桌面照常运行。
  }
}
