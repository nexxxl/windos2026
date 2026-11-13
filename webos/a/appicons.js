import { h } from './can.js';
import { icon } from './icons.js';
import { pixelMarkup } from './classicicons.js';

// 液态多巴胺图标：一层高饱和渐变体积 + 左上高光 + 底部压暗，
// 没有描边。所有图形都按 48×48 画，缩到 16px 仍保留大轮廓。
// 渐变 id 统一 lq 前缀，避免和页面里其他 SVG defs 撞车。
export const APP_ICONS = {
  // 扫雷：深蓝炸弹 + 琥珀引信火花。
  minesweeper: `
    <defs>
      <radialGradient id="lqMs1" cx="34%" cy="28%" r="78%"><stop offset="0" stop-color="#7E93AC"/><stop offset=".55" stop-color="#40536B"/><stop offset="1" stop-color="#1D2733"/></radialGradient>
      <radialGradient id="lqMs2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".58"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="lqMs3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#F08A1C"/></radialGradient>
    </defs>
    <path d="M31.5 14 38 7.5" stroke="#D9B06A" stroke-width="3.6" stroke-linecap="round"/>
    <circle cx="39" cy="7" r="3.6" fill="url(#lqMs3)"/>
    <circle cx="23" cy="27" r="16" fill="url(#lqMs1)"/>
    <ellipse cx="17" cy="20" rx="9" ry="5.6" fill="url(#lqMs2)"/>
    <circle cx="24" cy="27" r="4.8" fill="#0D131B" opacity=".5"/>
  `,
  // 书房：蓝 folder + 白色书签条。
  shelf: `
    <defs>
      <linearGradient id="lqSh1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9FC2FF"/><stop offset=".55" stop-color="#5B84EC"/><stop offset="1" stop-color="#3358C6"/></linearGradient>
      <linearGradient id="lqSh2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C6DBFF"/><stop offset="1" stop-color="#7AA2F7"/></linearGradient>
      <radialGradient id="lqSh3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <path fill="url(#lqSh1)" d="M4.5 15.5a6 6 0 0 1 6-6h8.6l4.6 5.2H37.5a6 6 0 0 1 6 6v19.8a6 6 0 0 1-6 6h-27a6 6 0 0 1-6-6z"/>
    <path fill="url(#lqSh2)" d="M4.5 22.6h39v12.7a6 6 0 0 1-6 6h-27a6 6 0 0 1-6-6z"/>
    <rect x="10.8" y="23.6" width="26.4" height="6" rx="3" fill="#FFF8E8"/>
    <ellipse cx="15.5" cy="12.6" rx="12" ry="5.2" fill="url(#lqSh3)"/>
  `,
  // Office：奶油白纸页 + 蓝色折角与文字线。
  office: `
    <defs>
      <linearGradient id="lqOf1" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DDE7F8"/></linearGradient>
      <linearGradient id="lqOf2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FB8FF"/><stop offset="1" stop-color="#3F6BD8"/></linearGradient>
      <radialGradient id="lqOf3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <path fill="url(#lqOf1)" d="M10 5.5h20.5L38.5 14v24.5a3.5 3.5 0 0 1-3.5 3.5H10a3.5 3.5 0 0 1-3.5-3.5V9A3.5 3.5 0 0 1 10 5.5z"/>
    <path fill="url(#lqOf2)" d="M10 5.5h20.5L38.5 14v2.8H6.5V9A3.5 3.5 0 0 1 10 5.5z"/>
    <path d="M13.5 23h17M13.5 28.5h17M13.5 34h10.5" fill="none" stroke="#5C86E4" stroke-width="3" stroke-linecap="round" opacity=".9"/>
    <ellipse cx="15" cy="10.5" rx="7" ry="2.6" fill="url(#lqOf3)"/>
  `,
  // 便利贴：亮黄纸片 + 右下折角 + 三条手写线，桌面上一眼能认出来。
  sticky: `
    <defs>
      <linearGradient id="lqSt1" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#FFF6B8"/><stop offset=".55" stop-color="#FBE27A"/><stop offset="1" stop-color="#E9C64A"/></linearGradient>
      <linearGradient id="lqSt2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFDF0"/><stop offset="1" stop-color="#F2DE96"/></linearGradient>
      <radialGradient id="lqSt3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <path fill="url(#lqSt1)" d="M8 6.5h32v24.8L29.6 41.5H8z"/>
    <path fill="url(#lqSt2)" d="M40 31.3v2.4l-9.6 7.8v-6.6a3.6 3.6 0 0 1 3.6-3.6z"/>
    <path d="M13.5 14h20M13.5 20h20M13.5 26h12.5" fill="none" stroke="#9C7B1E" stroke-width="2.6" stroke-linecap="round" opacity=".62"/>
    <ellipse cx="16" cy="11" rx="9" ry="3.4" fill="url(#lqSt3)"/>
  `,
  // 关系图谱：靛蓝底 + 发光的双链星座。
  graph: `
    <defs>
      <linearGradient id="lqGp1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#93A9FF"/><stop offset=".5" stop-color="#4A6FD4"/><stop offset="1" stop-color="#243C96"/></linearGradient>
      <radialGradient id="lqGp2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect x="5" y="5" width="38" height="38" rx="10" fill="url(#lqGp1)"/>
    <g fill="none" stroke="#E8EEFF" stroke-width="1.7" stroke-linecap="round" opacity=".72">
      <path d="M15 15 24 24M24 24 33 14M24 24 30 34M24 24 16 33M15 15 16 33M33 14 30 34"/>
    </g>
    <circle cx="24" cy="24" r="4.4" fill="#FFFFFF"/>
    <circle cx="15" cy="15" r="3" fill="#FFD479"/>
    <circle cx="33" cy="14" r="3" fill="#8FE3D2"/>
    <circle cx="30" cy="34" r="2.8" fill="#C6DBFF"/>
    <circle cx="16" cy="33" r="2.6" fill="#FFFFFF" opacity=".9"/>
    <ellipse cx="16" cy="12" rx="9" ry="4" fill="url(#lqGp2)"/>
  `,
  // 此电脑：亮面显示器，蓝屏 + 银灰机身。
  pc: `
    <defs>
      <linearGradient id="lqPc1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2F5FC"/><stop offset="1" stop-color="#BAC5DA"/></linearGradient>
      <linearGradient id="lqPc2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A6CCFF"/><stop offset=".52" stop-color="#5D8AF0"/><stop offset="1" stop-color="#3358C8"/></linearGradient>
      <radialGradient id="lqPc3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect x="3.5" y="6" width="41" height="27" rx="7" fill="url(#lqPc1)"/>
    <rect x="6.4" y="9" width="35.2" height="21" rx="4.4" fill="url(#lqPc2)"/>
    <ellipse cx="18" cy="14.5" rx="13" ry="6.2" fill="url(#lqPc3)"/>
    <path d="M6.4 25.5h35.2v4.5H6.4z" fill="#1E3E96" opacity=".16"/>
    <rect x="20.5" y="33" width="7" height="6" rx="2" fill="#AEB9CD"/>
    <rect x="12" y="38.4" width="24" height="4.8" rx="2.4" fill="url(#lqPc1)"/>
  `,
  // 设置：紫罗兰齿轮。
  settings: `
    <defs>
      <radialGradient id="lqSe1" gradientUnits="userSpaceOnUse" cx="15" cy="13" r="36"><stop offset="0" stop-color="#C3B2FF"/><stop offset=".55" stop-color="#8A72F0"/><stop offset="1" stop-color="#5B3FC4"/></radialGradient>
      <radialGradient id="lqSe2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="lqSe3" cx="38%" cy="32%" r="80%"><stop offset="0" stop-color="#F7F1FF"/><stop offset="1" stop-color="#FFFFFF"/></radialGradient>
    </defs>
    <g fill="url(#lqSe1)">
      <circle cx="24" cy="24" r="14.6"/>
      <circle cx="24" cy="7.8" r="6.3"/>
      <circle cx="24" cy="40.2" r="6.3"/>
      <circle cx="7.8" cy="24" r="6.3"/>
      <circle cx="40.2" cy="24" r="6.3"/>
      <circle cx="12.6" cy="12.6" r="6.3"/>
      <circle cx="35.4" cy="12.6" r="6.3"/>
      <circle cx="12.6" cy="35.4" r="6.3"/>
      <circle cx="35.4" cy="35.4" r="6.3"/>
    </g>
    <ellipse cx="17" cy="14" rx="11" ry="6" fill="url(#lqSe2)"/>
    <circle cx="24" cy="24" r="6.2" fill="url(#lqSe3)"/>
  `,
  // 系统：同结构的蓝色齿轮，和设置区分色相。
  system: `
    <defs>
      <radialGradient id="lqSy1" gradientUnits="userSpaceOnUse" cx="15" cy="13" r="36"><stop offset="0" stop-color="#AFD4FF"/><stop offset=".55" stop-color="#5C8FF0"/><stop offset="1" stop-color="#2A55C0"/></radialGradient>
      <radialGradient id="lqSy2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="lqSy3" cx="38%" cy="32%" r="80%"><stop offset="0" stop-color="#F5FAFF"/><stop offset="1" stop-color="#FFFFFF"/></radialGradient>
    </defs>
    <g fill="url(#lqSy1)">
      <circle cx="24" cy="24" r="14.6"/>
      <circle cx="24" cy="7.8" r="6.3"/>
      <circle cx="24" cy="40.2" r="6.3"/>
      <circle cx="7.8" cy="24" r="6.3"/>
      <circle cx="40.2" cy="24" r="6.3"/>
      <circle cx="12.6" cy="12.6" r="6.3"/>
      <circle cx="35.4" cy="12.6" r="6.3"/>
      <circle cx="12.6" cy="35.4" r="6.3"/>
      <circle cx="35.4" cy="35.4" r="6.3"/>
    </g>
    <ellipse cx="17" cy="14" rx="11" ry="6" fill="url(#lqSy2)"/>
    <circle cx="24" cy="24" r="6.2" fill="url(#lqSy3)"/>
  `,
  // 任务：绿色写字板 + 琥珀夹子。
  tasks: `
    <defs>
      <linearGradient id="lqTk1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FEBAE"/><stop offset=".55" stop-color="#3FBE72"/><stop offset="1" stop-color="#1E8A50"/></linearGradient>
      <linearGradient id="lqTk2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE58F"/><stop offset="1" stop-color="#F2A81C"/></linearGradient>
      <radialGradient id="lqTk3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect x="6" y="7" width="36" height="37" rx="9" fill="url(#lqTk1)"/>
    <ellipse cx="18" cy="14" rx="12" ry="6" fill="url(#lqTk3)"/>
    <rect x="16" y="3.4" width="16" height="9.2" rx="4.4" fill="url(#lqTk2)"/>
    <path d="M13.6 21.6l2.9 2.9 4.6-5.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.6 31.6l2.9 2.9 4.6-5.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M26 23.4h9M26 33.4h9" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".92"/>
  `,
  // 记忆：薄荷绿节点连成的分子团。
  memory: `
    <defs>
      <radialGradient id="lqMe1" cx="34%" cy="26%" r="80%"><stop offset="0" stop-color="#C2FFE8"/><stop offset=".5" stop-color="#4FD9A8"/><stop offset="1" stop-color="#178F68"/></radialGradient>
      <radialGradient id="lqMe2" cx="34%" cy="26%" r="80%"><stop offset="0" stop-color="#DDFFF3"/><stop offset="1" stop-color="#63CBAA"/></radialGradient>
      <radialGradient id="lqMe3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <path d="M14 15 24 24l10-9M14 33l10-9 10 9" fill="none" stroke="#3FAE87" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>
    <circle cx="24" cy="24" r="7.6" fill="url(#lqMe1)"/>
    <circle cx="13.5" cy="14" r="5.5" fill="url(#lqMe2)"/>
    <circle cx="34.5" cy="13.5" r="5" fill="url(#lqMe1)"/>
    <circle cx="13.5" cy="34" r="5" fill="url(#lqMe1)"/>
    <circle cx="34.5" cy="34" r="5.5" fill="url(#lqMe2)"/>
    <ellipse cx="21" cy="20.5" rx="4.4" ry="2.8" fill="url(#lqMe3)"/>
  `,
  // 终端：炭黑玻璃屏 + 荧光绿提示符。
  term: `
    <defs>
      <linearGradient id="lqTe1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B4252"/><stop offset=".6" stop-color="#22262F"/><stop offset="1" stop-color="#12141A"/></linearGradient>
      <radialGradient id="lqTe2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="lqTe3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#8CFFBE"/><stop offset="1" stop-color="#2FD873"/></radialGradient>
    </defs>
    <rect x="4" y="7" width="40" height="34" rx="9" fill="url(#lqTe1)"/>
    <ellipse cx="17" cy="13" rx="13" ry="6.6" fill="url(#lqTe2)"/>
    <circle cx="10.5" cy="12.5" r="1.8" fill="#FF6B64"/>
    <circle cx="15.5" cy="12.5" r="1.8" fill="#FFC93C"/>
    <circle cx="20.5" cy="12.5" r="1.8" fill="#4FD68A"/>
    <path d="M11 21.5 17.5 27l-6.5 5.5" fill="none" stroke="url(#lqTe3)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20.5 32.5h12" stroke="#E8EEF8" stroke-width="3.1" stroke-linecap="round" opacity=".88"/>
  `,
  // 视频：靛蓝玻璃屏 + 白色播放三角。
  video: `
    <defs>
      <linearGradient id="lqVi1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9AA8FF"/><stop offset=".5" stop-color="#5D6BE8"/><stop offset="1" stop-color="#3340B8"/></linearGradient>
      <radialGradient id="lqVi2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect x="4" y="9" width="40" height="30" rx="9" fill="url(#lqVi1)"/>
    <ellipse cx="17" cy="15" rx="13" ry="6.4" fill="url(#lqVi2)"/>
    <circle cx="24" cy="24" r="9.6" fill="#fff" opacity=".16"/>
    <path d="M20.4 18.2v11.6L31 24z" fill="#fff"/>
  `,
  // 音乐：橙红唱片 + 奶油轴心。
  music: `
    <defs>
      <radialGradient id="lqMu1" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="#FFB07A"/><stop offset=".5" stop-color="#E86A3A"/><stop offset="1" stop-color="#B23A1C"/></radialGradient>
      <radialGradient id="lqMu2" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="#FF9C64"/><stop offset="1" stop-color="#C24A24"/></radialGradient>
      <radialGradient id="lqMu3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <circle cx="24" cy="24" r="19" fill="url(#lqMu1)"/>
    <circle cx="24" cy="24" r="14.6" fill="url(#lqMu2)"/>
    <circle cx="24" cy="24" r="8.8" fill="#F6A277"/>
    <circle cx="24" cy="24" r="3.6" fill="#FFF4EA"/>
    <ellipse cx="16" cy="13" rx="10" ry="5.4" fill="url(#lqMu3)"/>
  `,
  // 画板：琥珀笔杆 + 青毫笔头。
  draw: `
    <defs>
      <linearGradient id="lqDr1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFD98A"/><stop offset="1" stop-color="#D98F1E"/></linearGradient>
      <linearGradient id="lqDr2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FF2F0"/><stop offset="1" stop-color="#178C9C"/></linearGradient>
      <linearGradient id="lqDr3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F2F5FA"/><stop offset="1" stop-color="#A9B4C6"/></linearGradient>
    </defs>
    <g transform="rotate(-38 24 24)">
      <rect x="20" y="2.6" width="8" height="17.6" rx="4" fill="url(#lqDr1)"/>
      <rect x="18.4" y="19.4" width="11.2" height="5.2" rx="2" fill="url(#lqDr3)"/>
      <path d="M18.4 24.6h11.2c0 7.2-2.6 11.4-5.6 13.8-3-2.4-5.6-6.6-5.6-13.8z" fill="url(#lqDr2)"/>
      <ellipse cx="22.2" cy="7.6" rx="2.1" ry="4" fill="#fff" opacity=".5"/>
    </g>
  `,
  // 扫一扫：青绿取景框 + 亮线。
  scan: `
    <defs>
      <linearGradient id="lqSc1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7FF3D8"/><stop offset=".5" stop-color="#22BCA6"/><stop offset="1" stop-color="#0C7C77"/></linearGradient>
      <radialGradient id="lqSc2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect x="4.5" y="4.5" width="39" height="39" rx="11" fill="url(#lqSc1)"/>
    <ellipse cx="16" cy="12" rx="12" ry="6" fill="url(#lqSc2)"/>
    <path d="M12.5 18v-3a2.5 2.5 0 0 1 2.5-2.5h3M29 12.5h3a2.5 2.5 0 0 1 2.5 2.5v3M35.5 29v3a2.5 2.5 0 0 1-2.5 2.5h-3M19 34.5h-3a2.5 2.5 0 0 1-2.5-2.5v-3" fill="none" stroke="#EAFFF9" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M13 24h22" stroke="#9FFFF0" stroke-width="3" stroke-linecap="round"/>
  `,
  // 浏览器：蓝色玻璃地球 + 琥珀太阳（参考图的地球+圆点组合）。
  browser: `
    <defs>
      <radialGradient id="lqBr1" cx="32%" cy="24%" r="82%"><stop offset="0" stop-color="#B3DCFF"/><stop offset=".5" stop-color="#5B93F2"/><stop offset="1" stop-color="#2A4FBE"/></radialGradient>
      <radialGradient id="lqBr2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".72"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="lqBr3" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#FFEDA6"/><stop offset="1" stop-color="#F2A81C"/></radialGradient>
    </defs>
    <circle cx="23" cy="24" r="18" fill="url(#lqBr1)"/>
    <path fill="#8CE9CF" opacity=".92" d="M11.5 15.5c4.6-3.4 9.4-2.2 11 1.4s-.8 7-4.8 7.2-9.4-3.5-6.2-8.6z"/>
    <path fill="#8CE9CF" opacity=".8" d="M27 32.5c3.4-2.4 7-1.2 7.4 1.8s-2.4 5.4-6 4.6-4.6-4-1.4-6.4z"/>
    <ellipse cx="16" cy="12.5" rx="11" ry="6.2" fill="url(#lqBr2)"/>
    <circle cx="38.5" cy="37.5" r="6.4" fill="url(#lqBr3)"/>
    <ellipse cx="36.4" cy="35.2" rx="3" ry="1.9" fill="url(#lqBr2)" opacity=".85"/>
  `,
  // artcraft：紫水晶棱镜 + 琥珀切面。
  artcraft: `
    <defs>
      <linearGradient id="lqAr1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D2B6FF"/><stop offset=".5" stop-color="#8A63F0"/><stop offset="1" stop-color="#5B34C8"/></linearGradient>
      <linearGradient id="lqAr2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFEDB0"/><stop offset="1" stop-color="#F2A81C"/></linearGradient>
      <radialGradient id="lqAr3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <path fill="url(#lqAr1)" d="M10.5 33.5 24 10.5l13.5 23z"/>
    <path fill="url(#lqAr2)" d="M18.5 33.5 24 24l5.5 9.5z"/>
    <ellipse cx="19" cy="18" rx="7" ry="4" fill="url(#lqAr3)"/>
  `,
  // 应用生成 / 应用商店：靛蓝货架 + 奶油色提袋，和“生成应用”动作一致。
  store: `
    <defs>
      <linearGradient id="lqSto1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B8D4FF"/><stop offset=".55" stop-color="#6288F2"/><stop offset="1" stop-color="#3048B8"/></linearGradient>
      <linearGradient id="lqSto2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFDF4"/><stop offset="1" stop-color="#F4D98F"/></linearGradient>
      <radialGradient id="lqSto3" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <path fill="url(#lqSto1)" d="M7 17.5h34v20a4.5 4.5 0 0 1-4.5 4.5h-25A4.5 4.5 0 0 1 7 37.5z"/>
    <path fill="#FFFDF4" opacity=".92" d="M14 17.5h20l-3.2 23.8h-13.6z"/>
    <path fill="url(#lqSto2)" d="M22 12.5a2 2 0 0 1 4 0v9h-4z"/>
    <path d="M14.5 25.5h19M14.5 30.5h19M14.5 35.5h12" stroke="#5877D8" stroke-width="1.8" stroke-linecap="round" opacity=".65"/>
    <ellipse cx="17" cy="13" rx="9" ry="3.2" fill="url(#lqSto3)"/>
  `,
  // 生成应用兜底：四颗糖果色圆点。
  apps: `
    <defs>
      <radialGradient id="lqAp1" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="#BFD9FF"/><stop offset="1" stop-color="#3F6BD8"/></radialGradient>
      <radialGradient id="lqAp2" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="#FFE9A8"/><stop offset="1" stop-color="#F2A81C"/></radialGradient>
      <radialGradient id="lqAp3" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="#FFB3AD"/><stop offset="1" stop-color="#D94034"/></radialGradient>
      <radialGradient id="lqAp4" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="#B3F5CB"/><stop offset="1" stop-color="#22A06B"/></radialGradient>
    </defs>
    <rect x="5" y="5" width="38" height="38" rx="13" fill="#F3F4F8"/>
    <circle cx="17" cy="17" r="7" fill="url(#lqAp1)"/>
    <circle cx="31" cy="17" r="7" fill="url(#lqAp2)"/>
    <circle cx="17" cy="31" r="7" fill="url(#lqAp3)"/>
    <circle cx="31" cy="31" r="7" fill="url(#lqAp4)"/>
  `,
};

let appIconSeq = 0;

export function appIcon(id, cls = '') {
  // 生成应用统一用糖果色应用格，其他未知 id 仍退回线稿。
  const body = APP_ICONS[id] || (id.indexOf('app-') === 0 ? APP_ICONS.apps : null);
  if (!body) return icon(id, cls);
  // Every inline SVG shares the document ID namespace. Reusing the same
  // gradient IDs in the launcher, desktop, taskbar and title bar makes
  // Chrome resolve url(#...) against the first copy, which can render the
  // blue globe as transparent (only solid teal blobs remain visible).
  // Scope every gradient/filter ID to this icon instance.
  const suffix = '-' + (++appIconSeq);
  const scoped = body
    .replace(/\bid="(lq[^"]+)"/gu, (_, name) => `id="${name}${suffix}"`)
    .replace(/url\(#(lq[^)]+)\)/gu, (_, name) => `url(#${name}${suffix})`);
  return h('svg', {
    class: `appicon ${cls}`.trim(),
    viewBox: '0 0 48 48',
    'aria-hidden': 'true',
    html: `<g class="nexlos-modern-icon" transform="translate(-1.2 -1.2) scale(1.05)">${scoped}</g><g class="nexlos-classic-icon" transform="scale(1.5)">${pixelMarkup(id)}</g>`,
  });
}
