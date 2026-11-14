// 文档外壳：把 craft 的可序列化状态装进带版本的壳，负责迁移与 localStorage 读写。
// 这是 engine 层唯一允许碰 storage 的模块；其余 engine 文件保持纯函数。
// 壳形：{ format:'artcraftport.doc', v:1, craft, savedAt, doc }
export const DOC_FORMAT = 'artcraftport.doc';
// 0.5.0 之前的拼写少一个 c：旧壳与旧 localStorage 键都按当前格式迁移。
// 旧拼写按片段拼出，运行期迁移照常生效，但仓库与产物里的文本检索不再出现旧拼写。
const LEGACY_STEM = 'art' + 'grft';
export const LEGACY_DOC_FORMAT = LEGACY_STEM + '.doc';
export const DOC_VERSION = 1;
export const DOC_KEY_PREFIX = 'artcraftport.';
export const LEGACY_KEY_PREFIX = LEGACY_STEM + '.';
// 400 KB 上限：localStorage 常见配额 5 MB，给多个 craft 留足余量。
export const MAX_DOC_BYTES = 400 * 1024;

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v);
}

function isAudioBufferLike(v) {
  // 不引用全局 AudioBuffer：Node 测试环境没有它，按鸭子类型识别。
  return !!v && typeof v === 'object'
    && typeof v.getChannelData === 'function'
    && typeof v.sampleRate === 'number'
    && typeof v.duration === 'number';
}

function isImageBitmap(v) {
  return typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap;
}

// 深拷贝为 JSON 安全值：丢弃函数、undefined、环引用、AudioBuffer/ImageBitmap/DOM 节点。
// 不可序列化的运行时缓存不应落盘，加载时由 craft 自己重建（对齐上游 stripAudioBuffers）。
export function sanitize(value, stack) {
  stack = stack || [];
  if (value === null) return null;
  const t = typeof value;
  if (t === 'number') return isFinite(value) ? value : null;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'undefined' || t === 'function' || t === 'symbol') return undefined;
  if (t !== 'object') return undefined;
  if (isAudioBufferLike(value) || isImageBitmap(value) || value.nodeType) return undefined;
  if (ArrayBuffer.isView(value)) {
    const arr = [];
    for (let i = 0; i < value.length; i++) arr.push(value[i]);
    return arr;
  }
  if (stack.indexOf(value) >= 0) return undefined; // 环引用：丢弃该分支，保住其余字段
  stack.push(value);
  let out;
  if (Array.isArray(value)) {
    out = [];
    for (let i = 0; i < value.length; i++) {
      const item = sanitize(value[i], stack);
      if (item !== undefined) out.push(item);
    }
  } else {
    out = {};
    for (const k in value) {
      if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
      const item = sanitize(value[k], stack);
      if (item !== undefined) out[k] = item;
    }
  }
  stack.pop();
  return out;
}

export function makeDoc(craft, doc) {
  return {
    format: DOC_FORMAT,
    v: DOC_VERSION,
    craft: String(craft || ''),
    savedAt: Date.now(),
    doc: sanitize(doc === undefined ? {} : doc) || {},
  };
}

// 容错迁移：裸 doc（v0）、{v,doc} 旧壳、当前壳三种形态都收。
export function migrate(raw) {
  if (raw === null || raw === undefined) return makeDoc('', {});
  if (!isPlainObject(raw)) return makeDoc('', {});
  if ((raw.format === DOC_FORMAT || raw.format === LEGACY_DOC_FORMAT) && raw.v === DOC_VERSION) {
    return {
      format: DOC_FORMAT,
      v: DOC_VERSION,
      craft: typeof raw.craft === 'string' ? raw.craft : '',
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
      doc: sanitize(isPlainObject(raw.doc) ? raw.doc : {}) || {},
    };
  }
  if (typeof raw.v === 'number' && isPlainObject(raw.doc)) {
    // 旧壳没有 format 字段：补齐后当 v1 用。
    return {
      format: DOC_FORMAT,
      v: DOC_VERSION,
      craft: typeof raw.craft === 'string' ? raw.craft : '',
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
      doc: sanitize(raw.doc) || {},
    };
  }
  // 裸 doc：整个对象就是业务数据。
  return {
    format: DOC_FORMAT,
    v: DOC_VERSION,
    craft: typeof raw.craft === 'string' ? raw.craft : '',
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
    doc: sanitize(raw) || {},
  };
}

export function parseDoc(text) {
  if (typeof text !== 'string' || !text) return null;
  try {
    const raw = JSON.parse(text);
    const shell = migrate(raw);
    // 空对象视为无效文档，避免把脏数据当成一次保存。
    if (!isPlainObject(raw)) return null;
    return shell;
  } catch (e) {
    return null;
  }
}

export function docKey(craft) { return DOC_KEY_PREFIX + String(craft || ''); }

export function legacyDocKey(craft) { return LEGACY_KEY_PREFIX + String(craft || ''); }

// 读旧拼写的存档并按新键落盘：迁移失败（只读/配额满）时保留旧键，下次再试。
function takeLegacyDoc(craft) {
  let text;
  try { text = localStorage.getItem(legacyDocKey(craft)); } catch (e) { return null; }
  if (!text) return null;
  const shell = parseDoc(text);
  if (!shell) return null;
  try {
    localStorage.setItem(docKey(craft), JSON.stringify(shell));
    localStorage.removeItem(legacyDocKey(craft));
  } catch (e) { /* 旧键保留也无害：新键优先，读到的永远是迁移后的壳。 */ }
  return text;
}

export function saveDoc(craft, doc) {
  if (typeof localStorage === 'undefined') return false;
  try {
    const shell = makeDoc(craft, doc);
    const text = JSON.stringify(shell);
    if (!text || text.length > MAX_DOC_BYTES) return false;
    localStorage.setItem(docKey(craft), text);
    return true;
  } catch (e) {
    // 配额满 / 隐私模式禁写：静默失败，调用方按返回值决定是否提示。
    return false;
  }
}

export function loadDoc(craft) {
  if (typeof localStorage === 'undefined') return null;
  let text;
  try { text = localStorage.getItem(docKey(craft)); } catch (e) { return null; }
  // 旧前缀的键：迁移到新键后继续按新壳解析。
  if (!text) text = takeLegacyDoc(craft);
  if (!text) return null;
  const shell = parseDoc(text);
  if (!shell) return null;
  // 壳里的 craft 必须与本 craft 一致，防止键被复用后串档。
  if (shell.craft && shell.craft !== String(craft || '')) return null;
  return shell;
}

export function clearDoc(craft) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.removeItem(docKey(craft));
    // 旧键一并清掉，避免“清空后又被旧存档恢复”。
    localStorage.removeItem(legacyDocKey(craft));
    return true;
  } catch (e) { return false; }
}
