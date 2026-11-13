// 音乐插件运行时：空壳播放器的「音源」都从这里来。
//
// 插件是一段声明 + 一段脚本；脚本跑在 Blob Worker 沙箱里：
//   • 没有 DOM、没有 localStorage、没有 fetch，拿不到宿主页面
//   • 出网只能调 api.http()，由主线程转给内核 music.fetch（内网/协议/体积都受限）
//   • 超时、异常、死循环都由主线程兜住，最坏情况是这一个源不可用
//
// 清单格式（也接受 MusicFree 风格里带 scriptUrl 的写法）：
//   { "name": "示例源", "version": "1.0.0", "author": "…",
//     "description": "…", "script": "self.plugin = { search: ... }" }
//   { "name": "…", "scriptUrl": "https://…/plugin.js" }
//
// 插件脚本必须暴露 self.plugin：
//   search(query, page) -> Promise<[{id, title, artist, album, duration, cover}]>
//   getMedia(id)        -> Promise<{url, headers?, mime?, title?, artist?}>
//   hot(page)           -> 可选，空搜索时的推荐列表

import { api } from './dom.js';

export const PROVIDER_API = 1;

const MAX_ROWS = 200;
const CALL_TIMEOUT = 20000;

// Worker 里的那层胶水：只暴露 api.http 和 api.log，其余一律不给。
const RUNTIME = [
  'var pending = {};',
  'var seq = 0;',
  'function bridge(payload) {',
  '  return new Promise(function(resolve, reject) {',
  '    var id = "r" + (++seq);',
  '    pending[id] = { resolve: resolve, reject: reject };',
  '    self.postMessage({ id: id, op: "http", payload: payload || {} });',
  '  });',
  '}',
  'var api = {',
  '  http: function(opts) { return bridge(opts); },',
  '  log: function() {',
  '    var args = Array.prototype.slice.call(arguments).map(function(v) { return String(v); });',
  '    self.postMessage({ op: "log", args: args });',
  '  },',
  '};',
  'self.api = api;',
  'self.module = { exports: {} };',
  'var plugin = null;',
  'try {',
  '/*__PLUGIN__*/',
  '  plugin = (self.module.exports && typeof self.module.exports.search === "function")',
  '    ? self.module.exports',
  '    : (self.plugin || self.default || null);',
  '} catch (err) {',
  '  self.postMessage({ op: "fatal", message: String(err && err.message || err) });',
  '}',
  'self.onmessage = function(e) {',
  '  var m = e.data || {};',
  '  if (m.op === "res") {',
  '    var p = pending[m.id];',
  '    if (!p) return;',
  '    delete pending[m.id];',
  '    if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error || "请求失败"));',
  '    return;',
  '  }',
  '  if (m.op !== "call") return;',
  '  var fn = plugin && plugin[m.fn];',
  '  if (typeof fn !== "function") {',
  '    self.postMessage({ id: m.id, ok: false, error: "插件没有实现 " + m.fn });',
  '    return;',
  '  }',
  '  Promise.resolve().then(function() {',
  '    return fn.apply(plugin, m.args || []);',
  '  }).then(function(value) {',
  '    self.postMessage({ id: m.id, ok: true, value: value });',
  '  }, function(err) {',
  '    self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) });',
  '  });',
  '};',
].join('\n');

function slug(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return 'p' + h.toString(36);
}

// 清单只取白名单字段，脚本长度也设上限：插件是外部输入，不能当代码库塞。
export function normalizeManifest(raw, base) {
  if (!raw || typeof raw !== 'object') throw new Error('插件清单不是对象');
  const name = String(raw.name || '').trim();
  if (!name) throw new Error('插件清单缺少 name');
  const script = typeof raw.script === 'string' ? raw.script : '';
  const scriptUrl = typeof raw.scriptUrl === 'string' ? raw.scriptUrl : (typeof raw.src === 'string' ? raw.src : '');
  if (!script && !scriptUrl) throw new Error('插件清单缺少 script 或 scriptUrl');
  if (script.length > 400000) throw new Error('插件脚本超过 400 KB');
  const abs = (u) => {
    try { return new URL(u, base || location.href).toString(); } catch (e) { return ''; }
  };
  return {
    id: slug(name + '|' + (script || scriptUrl)),
    name,
    version: String(raw.version || '0').slice(0, 20),
    author: String(raw.author || '').slice(0, 60),
    description: String(raw.description || '').slice(0, 200),
    homepage: abs(String(raw.homepage || '')),
    script,
    scriptUrl: scriptUrl ? abs(scriptUrl) : '',
  };
}

// 安装入口：URL 由内核代取，绕开跨域；返回可直接落盘的插件对象。
export async function installFromUrl(url) {
  const r = await api('music.fetch', { method: 'POST', fields: { url } });
  const d = r.detail || {};
  if (d.status && d.status >= 400) throw new Error('插件地址返回 ' + d.status);
  let raw = null;
  try { raw = JSON.parse(d.body || ''); } catch (e) { throw new Error('这不是一个 JSON 插件清单'); }
  return prepare(normalizeManifest(raw, d.url || url));
}

export async function installFromText(text) {
  let raw = null;
  try { raw = JSON.parse(text); } catch (e) { throw new Error('这不是一个 JSON 插件清单'); }
  return prepare(normalizeManifest(raw, location.href));
}

// scriptUrl 形式在清单解析后再取一次脚本正文。
async function prepare(m) {
  if (m.script) return m;
  const r = await api('music.fetch', { method: 'POST', fields: { url: m.scriptUrl } });
  const body = (r.detail && r.detail.body) || '';
  if (!body) throw new Error('插件脚本是空的');
  if (body.length > 400000) throw new Error('插件脚本超过 400 KB');
  return Object.assign({}, m, { script: body });
}

// 沙箱句柄：一个插件一个 Worker，用完即弃。
export function createHost(plugin, onLog) {
  let src = RUNTIME.replace('/*__PLUGIN__*/', () => plugin.script);
  const blob = new Blob([src], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  const pending = new Map();
  let seq = 0;
  let dead = '';
  let disposed = false;

  function failAll(message) {
    dead = message;
    pending.forEach((p) => { clearTimeout(p.timer); p.reject(new Error(message)); });
    pending.clear();
  }

  worker.onerror = (e) => {
    failAll('插件崩溃：' + String((e && e.message) || '脚本错误'));
  };

  worker.onmessage = (e) => {
    const m = e.data || {};
    if (m.op === 'fatal') { failAll('插件加载失败：' + m.message); return; }
    if (m.op === 'log') { if (onLog) onLog(m.args); return; }
    if (m.op === 'http') {
      api('music.fetch', { method: 'POST', fields: m.payload || {} }).then((r) => {
        const d = r.detail || {};
        worker.postMessage({ op: 'res', id: m.id, ok: true, value: d });
      }, (err) => {
        worker.postMessage({ op: 'res', id: m.id, ok: false, error: String(err && err.message || err) });
      });
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.value);
    else p.reject(new Error(String(m.error || '插件调用失败')));
  };

  return {
    call(fn, args, timeout) {
      if (dead) return Promise.reject(new Error(dead));
      if (disposed) return Promise.reject(new Error('插件已停止'));
      const id = 'c' + (++seq);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(fn + ' 超时'));
        }, timeout || CALL_TIMEOUT);
        pending.set(id, { resolve: resolve, reject: reject, timer: timer });
        worker.postMessage({ op: 'call', id: id, fn: fn, args: args || [] });
      });
    },
    destroy() {
      disposed = true;
      failAll('插件已停止');
      try { worker.terminate(); } catch (e) { /* 已结束 */ }
      try { URL.revokeObjectURL(url); } catch (e) { /* 已释放 */ }
    },
    get error() { return dead; },
  };
}

// 插件返回的行要做一次清洗：类型、长度、数量都不能信外部输入。
export function cleanRows(rows, pluginId) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (let i = 0; i < rows.length && out.length < MAX_ROWS; i++) {
    const r = rows[i];
    if (!r || typeof r !== 'object') continue;
    const title = String(r.title || r.name || '').trim();
    const id = String(r.id == null ? '' : r.id);
    if (!title || !id) continue;
    out.push({
      id: pluginId + ':' + id,
      pid: id,
      plugin: pluginId,
      name: title.slice(0, 160),
      artist: String(r.artist || r.singer || '').slice(0, 120),
      album: String(r.album || '').slice(0, 120),
      duration: Number(r.duration) || 0,
      cover: /^https?:/i.test(String(r.cover || '')) ? String(r.cover) : '',
      kind: 'plugin',
    });
  }
  return out;
}
