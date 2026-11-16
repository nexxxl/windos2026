// 前端原语：只做 DOM、请求、格式化三件事。
import { getLanguage, t } from './i18n.js';
const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs = {}, ...kids) {
  // SVG 必须用命名空间创建，否则 viewBox 与 path 都留在 HTML 命名空间里，图标不会画出来。
  const el = tag === 'svg' ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') {
      if (el.namespaceURI === SVG_NS) el.setAttribute('class', v);
      else el.className = v;
    }
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    // textarea 的 value 只能走属性，setAttribute 不会回填内容
    else if (k === 'value' && tag === 'textarea') el.value = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(9)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

// 拼 HTML 片段时必须先转义：媒体库的曲名、扫码结果都来自用户。
export function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function fmt(n) { return Number(n || 0).toLocaleString(getLanguage()); }

export function debounce(fn, ms = 800) {
  let t = 0;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.flush = (...args) => { clearTimeout(t); return fn(...args); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export async function api(cmd, { method = 'GET', fields = null, space = null, query = {} } = {}) {
  const qs = new URLSearchParams(query);
  if (space && !qs.has('space')) qs.set('space', space);
  const base = space ? `/s/${encodeURIComponent(space)}/c/${cmd}` : `/c/${cmd}`;
  const url = `${base}${qs.toString() ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: fields ? { 'Content-Type': 'application/json' } : undefined,
    body: fields ? JSON.stringify(fields) : undefined,
  });
  const data = await res.json().catch(() => ({ ok: false, error: `bad response ${res.status}` }));
  if (!res.ok || data.ok === false) throw new Error(t(data.error || `HTTP ${res.status}`));
  return data;
}
