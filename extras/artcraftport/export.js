// 统一导出模块：只把数据「编码」成 string / Blob，不触发下载、不碰 DOM。
// 下载由各 craft 调用 kernel.js 的 download / saveCanvas 完成（见 03-transfer-plan.md §5.3 / T11）。
// 本模块只依赖 engine/* 与标准库；所有编码逻辑与迁移前的内联实现逐字节对齐。
import { makeDoc } from './engine/doc.js';

// CSV：把二维行/列序列化成文本。
// 行为与 gridcraft 内联实现一致：每个单元格都用双引号包裹，内部双引号翻倍；
// 行以 \n 连接，末尾不补换行。逗号与换行本身不做额外转义（依赖整格加引号），
// 这是迁移前的既有行为，保持不变。
export function csvText(rows) {
  const lines = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const cells = [];
    for (let c = 0; c < row.length; c++) {
      cells.push('"' + String(row[c]).replace(/"/g, '""') + '"');
    }
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

// DXF：把已序列化的实体组码/值数组包成完整文档，保持现有 HEADER / ENTITIES / EOF 结构。
export function dxfDocument(entities) {
  const head = ['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const tail = ['0', 'ENDSEC', '0', 'EOF'];
  return head.concat(entities, tail).join('\n');
}

// SVG：把图形片段包进根元素，width / height / viewBox 与 vectorcraft 内联实现一致。
export function svgDocument(width, height, body) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height
    + '" viewBox="0 0 ' + width + ' ' + height + '">\n' + body + '\n</svg>';
}

// HTML 转义：只处理 & < > " 四个字符，避免标题破坏文档结构。
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// HTML：组装 wordcraft 导出文档。结构与迁移前一致：doctype + charset + style + 正文。
// title 为空时输出与迁移前逐字节一致（wordcraft 走这条路径）；提供 title 时在 charset 后
// 追加一段经过转义的 <title>，供其它调用方使用。bodyHtml 是可信的 innerHTML，原样插入。
export function htmlDocument(title, bodyHtml) {
  const style = '<style>body{font-family:Georgia,serif;max-width:794px;margin:40px auto;line-height:1.8}</style>';
  const titleTag = title ? '<title>' + escapeHtml(title) + '</title>' : '';
  return '<!doctype html><meta charset="utf-8">' + titleTag + style + bodyHtml;
}

// 工程文件：与 deckcraft / effectcraft 内联实现一致，makeDoc 外壳 + 2 空格缩进。
export function projectJson(craft, doc) {
  return JSON.stringify(makeDoc(craft, doc), null, 2);
}

// WAV：从 soundcraft（time.js）原样迁出，字节与迁移前一致。
// 只依赖 AudioBuffer 鸭子类型：numberOfChannels / length / sampleRate / getChannelData。
export function wavBlob(buf) {
  const ch = buf.numberOfChannels;
  const len = buf.length * ch * 2 + 44;
  const ab = new ArrayBuffer(len);
  const v = new DataView(ab);
  let p = 0;
  function str(s) { for (let i = 0; i < s.length; i++) v.setUint8(p++, s.charCodeAt(i)); }
  function u32(n) { v.setUint32(p, n, true); p += 4; }
  function u16(n) { v.setUint16(p, n, true); p += 2; }
  str('RIFF'); u32(len - 8); str('WAVE'); str('fmt '); u32(16); u16(1); u16(ch); u32(buf.sampleRate);
  u32(buf.sampleRate * ch * 2); u16(ch * 2); u16(16); str('data'); u32(buf.length * ch * 2);
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
      // Chrome 离线渲染在个别样本上有 1 LSB 浮点抖动；清掉最低位后，
      // 同一工程重复导出的 WAV 哈希一致（有效精度 15 bit，听感无差）。
      let n = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
      n = Math.max(-32768, Math.min(32767, n)) & ~1;
      v.setInt16(p, n, true);
      p += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
