import { h, clear } from './can.js';

// 画板是海南浏览器里那块宋韵画笺的原始实现（ui/draw/board.*）。
// 这里只做承载：直接 URL 打开 #/draw 时用 iframe 装下原页面，
// WebOS 打开应用时走 app.entry，连这层 iframe 也省掉。
export function mountDraw(host) {
  const frame = h('iframe', {
    class: 'dr-frame',
    title: '宋韵画笺',
    src: '/a/draw/board.html',
    allow: 'camera; microphone; fullscreen; autoplay',
  });
  host.append(frame);
  return {
    destroy() {
      frame.remove();
      clear(host);
    },
  };
}
