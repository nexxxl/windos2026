import { h, clear } from './can.js';

// 办公应用由内核内嵌提供（/a/office/），这里只做承载：
// 直接打开 #/office 时用 iframe 装下整站；从桌面开窗时走 app.entry，连这层也省掉。
//
// 系统视图会盖住 WebOS 外壳，所以这里自带一条细标题栏，
// 保证深链接进来的人有可见的返回路径（Escape 在 iframe 里收不到）。
export function mountOffice(host) {
  const frame = h('iframe', {
    class: 'of-frame',
    title: 'Office',
    src: '/a/office/',
    allow: 'clipboard-read; clipboard-write; fullscreen',
    'data-i18n-app': 'true',
  });
  const bar = h('div', { class: 'of-bar' },
    h('button', {
      class: 'of-back', type: 'button', title: '回到桌面',
      onclick: () => { location.hash = '#/desktop'; },
    }, '← 桌面'),
    h('span', { class: 'of-title' }, 'Office'));
  host.append(bar, frame);
  return {
    destroy() {
      frame.remove();
      bar.remove();
      clear(host);
    },
  };
}
