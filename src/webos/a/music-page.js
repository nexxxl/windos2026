// 音乐独立入口：只挂一张卡片，不引入桌面外壳的模块图。
// 外壳仍然负责窗口、抽屉让宽与主题消息，页面这边只做播放。
import { mountMusic } from './music.js';

const host = document.getElementById('host');
const app = mountMusic(host);
window.addEventListener('pagehide', () => {
  try { app.destroy(); } catch (e) { /* 页面已在卸载 */ }
});
