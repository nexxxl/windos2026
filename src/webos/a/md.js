import { h } from './can.js';

// 极简 Markdown → HTML：只覆盖笔记里常见的语法，原文一律转义，
// 不执行内嵌 HTML，也不引第三方解析器。Chrome 72 可用。

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

function inline(s) {
  let out = esc(s);
  // 行内代码先抽出来，避免里面的星号、井号被当成强调或标签。
  const codes = [];
  out = out.replace(/`([^`\n]+)`/g, (m, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  // 图片不在这里真的加载：交换区里的相对路径解析不了，显示占位最省。
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt) => `<span class="md-img">${alt || '图片'}</span>`);
  out = out.replace(/\[\[([^\[\]|#]{1,200})(?:[|#][^\[\]]*)?\]\]/g,
    (m, target) => `<a class="md-wiki" data-wiki="${target}">${target}</a>`);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (m, text, href) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`);
  out = out.replace(/(^|[\s(（【])#([\p{L}\p{N}_/-]{1,40})/gu,
    (m, pre, tag) => `${pre}<span class="md-tag">#${tag}</span>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  out = out.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[Number(i)]}</code>`);
  return out;
}

export function mdToHtml(src) {
  src = String(src || '').replace(/^\uFEFF/, '');
  // 去掉 YAML frontmatter：图谱已经把标签抽走了，正文里不必再显示。
  src = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const lines = src.split(/\r?\n/);
  const out = [];
  let i = 0;
  let list = '';

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = '';
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    let m = line.match(/^\s*(```|~~~)\s*([\w+#.-]*)\s*$/);
    if (m) {
      closeList();
      const fence = m[1];
      const lang = m[2];
      const close = new RegExp('^\\s*' + fence);
      i++;
      const buf = [];
      while (i < lines.length && !close.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过收尾围栏
      out.push(`<pre${lang ? ` class="lang-${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      i++;
      continue;
    }
    m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      closeList();
      const n = m[1].length;
      out.push(`<h${n}>${inline(m[2])}</h${n}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      closeList();
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeList();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }
    m = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (m) {
      const kind = /\d+\./.test(m[1]) ? 'ol' : 'ul';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(m[2])}</li>`);
      i++;
      continue;
    }
    // 段落：连续非空、且不是另一种块的行合成一段。
    closeList();
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() &&
      !/^(#{1,6}\s|```|~~~|>\s?|\s*([-*+]|\d+\.)\s+)/.test(lines[i]) &&
      !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  closeList();
  return out.join('\n');
}

// 直接把一段 Markdown 渲染进容器：供关系图谱的阅读面板使用。
export function renderMarkdown(text) {
  const box = h('div', { class: 'md' });
  box.innerHTML = mdToHtml(text);
  return box;
}
