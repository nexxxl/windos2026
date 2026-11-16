// 轻量 DOM / 请求原语：给不需要多语言词典的页面用（音乐卡片、图标、媒体库）。
// 与 can.js 的 h/clear/api 保持同一行为；唯一的差别是错误文案不做翻译，
// 这样独立页面不用为了几个字符串加载 110 KB 的 i18n 与十几份语言表。

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs = {}, ...kids) {
  // SVG 必须用命名空间创建，否则 viewBox 与 path 都留在 HTML 命名空间里，图标不会画出来。
  const el = tag === 'svg' ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') {
      if (el.namespaceURI === SVG_NS) el.setAttribute('class', v);
      else el.className = v;
    } else if (k === 'text') el.textContent = v;
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
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
