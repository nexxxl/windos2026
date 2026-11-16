import { h } from './dom.js';

// 图标只在这里维护：老侧栏、启动台、桌面和窗口标题栏共用同一套路径。
export const ICONS = {
  apps: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  // 关系图谱：四个节点用细线连起来，和画布上的点线同构。
  graph: '<circle cx="6" cy="7" r="2.1"/><circle cx="18" cy="8.6" r="2.1"/><circle cx="8" cy="17.6" r="2.1"/><circle cx="17.4" cy="18.2" r="1.9"/><path d="M7.9 8.3l8.2 .2M6.9 9l.8 6.7M9.6 16.9l5.9 .8M16.4 10.6l.8 5.8M9.4 15.9l6.4-5.6"/>',
  shelf: '<path d="M4 5.5h5.2v13H4zM11.4 4h4.2v14.5h-4.2zM17.2 7l3.2.9-4 13-3.2-.9z"/>',
  chapter: '<path d="M5 3.8h8.4L19 9.4v10.8H5zM13 4v6h5.5"/>',
  tasks: '<path d="M4 5.5h16v13H4zM4 10h16M9 5.5v13"/><path d="M12.5 8h4M12.5 12h4M12.5 15.5h3"/>',
  outline: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  cast: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 20c.6-3.4 2.8-5.3 5.5-5.3s4.9 1.9 5.5 5.3M16 6.2a3 3 0 0 1 0 5.8M17.5 20c-.2-2-.7-3.5-1.6-4.6"/>',
  export: '<path d="M12 3v12m0 0 4.2-4.2M12 15 7.8 10.8M4 17v3.2h16V17"/>',
  system: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>',
  // Win10 设置用的齿轮：区别于“系统”的太阳形线稿。
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l1.8-1.3-1.9-3.3-2.1.8a7.7 7.7 0 0 0-2.6-1.5L14.3 3h-3.8l-.3 2.2a7.7 7.7 0 0 0-2.6 1.5l-2.1-.8L3.6 9.2l1.8 1.3a7.8 7.8 0 0 0 0 3l-1.8 1.3 1.9 3.3 2.1-.8a7.7 7.7 0 0 0 2.6 1.5l.3 2.2h3.8l.3-2.2a7.7 7.7 0 0 0 2.6-1.5l2.1.8 1.9-3.3z"/>',
  // 终端：方框里一个提示符，和 Win10 控制台的 `>_` 对应。
  term: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="m7 9.5 3 2.8-3 2.8M13 15.4h4"/>',
  memory: '<circle cx="6.2" cy="6" r="2.1"/><circle cx="17.8" cy="8.6" r="2.1"/><circle cx="9" cy="18" r="2.1"/><path d="M8 7.2 15.7 8.3M15.6 10.5 10.7 16.2"/>',
  launchpad: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  folder: '<path d="M3.5 6.5h6l1.8 2.2h9.2v10.8h-17z"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 6.4M20 4.5V11h-6.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5.5H4.5V6H10"/>',
  minimize: '<path d="M5 12h14"/>',
  maximize: '<path d="M5 5h14v14H5z"/>',
  restore: '<path d="M8 8h11v11H8zM5 16V5h11"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  power: '<path d="M12 3v9M6.4 6.4a8 8 0 1 0 11.2 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  wifi: '<path d="M3.2 9.2a13 13 0 0 1 17.6 0M6.2 12.5a8.6 8.6 0 0 1 11.6 0M9.2 15.8a4.2 4.2 0 0 1 5.6 0"/><circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none"/>',
  volume: '<path d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4zM15.6 9a4.2 4.2 0 0 1 0 6M18.2 6.6a8 8 0 0 1 0 10.8"/>',
  battery: '<rect x="2.5" y="8" width="17" height="8" rx="2"/><path d="M21.5 10.6v2.8"/><rect x="4.5" y="10" width="11" height="4" rx="1" fill="currentColor" stroke="none"/>',
  // Win10 任务栏：开始旗帜、任务视图、盾牌、通知铃、隐藏图标箭头。
  flag: '<path d="M3.2 6.2 10.3 5.1v6.2H3.2zM11.6 4.9 20.8 3.5v7.8h-9.2zM3.2 12.6h7.1V19l-7.1-1.2zM11.6 12.6h9.2v7.9l-9.2-1.4z" fill="currentColor" stroke="none"/>',
  taskview: '<rect x="3" y="4.5" width="18" height="15" rx="1.6"/><path d="M12 4.5v15"/>',
  shield: '<path d="M12 3.2 19 6v5.4c0 4.3-2.9 7.8-7 9.4-4.1-1.6-7-5.1-7-9.4V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  bell: '<path d="M6 16.5h12l-1.4-2.2V10a4.6 4.6 0 0 0-9.2 0v4.3zM10 19a2 2 0 0 0 4 0"/>',
  'chevron-up': '<path d="m7.5 14.5 4.5-4.5 4.5 4.5"/>',
  // 快速设置：亮度（太阳）与深色模式（月亮）。
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4"/>',
  moon: '<path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4z"/>',
  disk: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h10M7 14h6"/>',
  // 内置媒体与摄像头：线稿和系统图标同粗，标题栏与开始菜单都用这一套。
  video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  // 画板：斜握的毛笔，和“笔”这个动作直接对应。
  draw: '<path d="M15 3.5 20.5 9 10.5 19l-4.6 1 1-4.6zM4.2 19.8l2-2M13.6 6.4l4 4"/>',
  // 便利贴与编辑：纸片折角 + 铅笔，和桌面纸条的形状对应。
  sticky: '<path d="M5 4.5h9.5L19 9v10.5H5zM14.5 4.5V9H19"/><path d="M8 12h6M8 15.5h4"/>',
  pencil: '<path d="M15.2 4.6 19.4 8.8 9.4 18.8l-4.6 1 1-4.6zM13.6 6.2l4.2 4.2"/>',
  paperclip: '<path d="M19 11.5 12 18.5a4.2 4.2 0 0 1-6-6l7.4-7.4a3 3 0 0 1 4.3 4.3l-7.3 7.3a1.8 1.8 0 0 1-2.6-2.6l6.9-6.9"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 4.5h3.6v15H7zM13.4 4.5H17v15h-3.6z" fill="currentColor" stroke="none"/>',
  prev: '<path d="M18 5v14L8 12z" fill="currentColor" stroke="none"/><path d="M6 5v14"/>',
  next: '<path d="M6 5v14l10-7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.6" fill="currentColor" stroke="none"/>',
  'volume-off': '<path d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4zM16 9l5 5M21 9l-5 5"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  pip: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>',
  torch: '<path d="M9 3h6l1 5H8zM10 8h4v4l2 3v6H8v-6l2-3z"/>',
  flip: '<path d="M4 9a8 8 0 0 1 13.2-3.2L20 8M20 4v4h-4M20 15a8 8 0 0 1-13.2 3.2L4 16M4 20v-4h4"/>',
  shuffle: '<path d="M4 7h3l4 5 4 5h5M4 17h3l3-3.5M15 7h5M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  repeat: '<path d="M4 11V9a4 4 0 0 1 4-4h12M20 13v2a4 4 0 0 1-4 4H4M17 2l3 3-3 3M7 22l-3-3 3-3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-10A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17H8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.4 7M14 10a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="10" r="1.8"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
};

export function icon(id, cls = '') {
  // APPS 里存的是路径本身，应用卡片传的是键；两种都接受。
  const body = ICONS[id] || id;
  return h('svg', { class: `icon ${cls}`, viewBox: '0 0 24 24', 'aria-hidden': 'true', html: body });
}
