import { h, clear, api } from './can.js';
import { icon } from './icons.js';
import { appIcon } from './appicons.js';
import { LAYOUT, clampRect, defaultRect, dragRect, fitRect, restoreRect, nearestEdge, resizeRect, snapRect, snapZone, tuckRect, metrics } from './win.js';
import { readSession, writeSession, clearSession, normalizeAppId, legacyAppId } from './session.js';
import { pulse, rafThrottle, watchViewport, bindTitleGestures, isCoarse } from './mai.js';
import { applyAppearance, applyTypography, RETRO_BACKGROUNDS, wallpaperField, wallpaperKey } from './appearance.js';
import { LANGUAGES, availableLanguages, systemLanguage, setLanguage, getLanguage, localizeDoc, localizeFrames, observeDoc, t, formatDate, formatTime } from './i18n.js';
import { starAsk, starFinished, starOpen } from './star.js';
import { createClassicStart } from './classicmenu.js';
import { pixelIcon } from './classicicons.js';
import { mountClassicDateTime, classicDateTimeTitle } from './classic-datetime.js';
import { startClassicBoot, replayClassicBoot, stopClassicStartupSound } from './classic-boot.js';
import { createClassicContextMenu } from './classic-contextmenu.js';
import { playClassicSound, stopClassicSounds } from './classic-sound-engine.js';
import { mountClassicSounds, classicSoundsTitle } from './classic-sounds.js';
import { startOrb } from './orb.js';
import { openByok } from './byok.js';
import { createStickyLayer } from './sticky.js';
import { createCompanionLayer } from './companion.js';

// 桌面外壳的分层：壁纸 → 桌面图标 → 窗口层 → 任务栏 → 开始菜单。
// 窗口是常驻 DOM，交互只改 transform/opacity，绝不触发整页重渲染。
//
// 应用清单以 /c/app.list 为唯一来源（id/icon/kind/route/window/dock/desktop）。
// 这里的 FALLBACK 只在接口短暂不可用时兜底，不带尺寸，避免两处维护。
const FALLBACK = [
  { id: 'pc', name: '此电脑', kind: 'internal', icon: 'pc', route: '#/pc', category: '系统' },
  { id: 'term', name: '终端', kind: 'internal', icon: 'term', route: '#/term', category: '系统' },
  { id: 'memory', name: '记忆', kind: 'internal', icon: 'memory', route: '#/memory', category: '创作' },
  { id: 'shelf', name: '书房', kind: 'internal', icon: 'shelf', route: '#/shelf', category: '创作' },
  { id: 'graph', name: '关系图谱', kind: 'internal', icon: 'graph', route: '#/graph', category: '创作' },
  { id: 'settings', name: '设置', kind: 'internal', icon: 'settings', route: '#/settings', category: '系统' },
  { id: 'sticky', name: '便利贴', kind: 'internal', icon: 'sticky', route: '#/sticky', category: '工具' },
  { id: 'minesweeper', name: '扫雷', kind: 'internal', icon: 'minesweeper', route: '#/minesweeper', category: '游戏' },
  { id: 'system', name: '系统', kind: 'internal', icon: 'system', route: '#/system', category: '系统' },
];

const STORE = 'nexlos.os.';
const SESSION_DEBOUNCE_MS = 400;
// 开窗不做淡入：窗口首帧就是完整内容，只补间 110ms 的 6px 收边。
// 位移全程走合成器，主线程可以同时挂 iframe；再长用户就开始“等动画”了。
const EASE = 'cubic-bezier(.2,.9,.2,1)';
const OPEN_MS = 110;
// 关闭没有时长：closeWin 同步摘除元素。旧窗口多留一帧就会和新内容叠成残影，
// 多留一百毫秒用户就会觉得“关窗要等”。
// 现代主题多一拍 90ms 的左右震动（见 app.css 的 os-win-close-shake）：只是情绪反馈，
// 结束时窗口已经消失，总时长仍在一瞬间的阈值内。
const CLOSE_SHAKE_MS = 90;
// iframe 只延后两帧再挂：等开窗那一次 reflow 落定，内容就在收边过程中填进来。
const IFRAME_DELAY_MS = 60;
// 预热池：关掉的窗口留在内存里（display:none），重开时零启动。
// 只保最近一扇（手机上内存紧，直接关掉），且不让握着手柄/pty 的应用赖着不走。
const WARM_BUDGET = () => (isCoarse() ? 0 : 1);
const WARM_DENY = ['term', 'music', 'video', 'media', 'scan'];
const COARSE = isCoarse;
const MOBILE_BREAKPOINT = 760;
// 手机同时活着的 iframe 越多，内存越先见底。超出预算的窗口降级为“已挂起”：
// 先把状态发给应用（释放摄像头/音频），再卸载 iframe；点回来时按原地址重建。
const SURFACE_BUDGET = () => (isCoarse() ? 6 : 14);
// 这几类应用握着摄像头、播放器或未保存正文，绝不为了省内存卸载。
const NEVER_SUSPEND = ['shelf', 'memory', 'term', 'music', 'video', 'scan'];

let singleton = null;

export function mountOS(host) {
  if (singleton) singleton.destroy();
  singleton = createOS(host);
  return singleton;
}

function createOS(host) {
  const apps = new Map();
  for (const app of FALLBACK) apps.set(app.id, decorate(app));

  const wins = new Map();
  // 预热池：关掉的窗口不销毁，只在 DOM 里 display:none（见 parkWindow）。
  // 元素一挪窝 iframe 就会重载，所以只能原地留着；重开时摘掉 class 就是零启动。
  const parked = new Map();
  // 栈顶在前：z 序由栈位置推导，关闭窗口自然回档，不再单调累加。
  let stack = [];
  let activeId = '';
  let companion = null;
  // 桌面图标可以是多选：框选或 ⌘/Ctrl 点击都往这里加，渲染时按 id 回填。
  const deskSel = new Set();
  let classicIconOrder = readJSON('nexlos.os.classic.icon-order', 'default');
  let startOpen = false;
  let nativeBusy = false;
  let restoring = false;
  let sessionTimer = 0;
  let viewportWatcher = null;
  // 最近一次聚焦时间：内存吃紧时按这个顺序回收最久没看的窗口。
  const lastFocusAt = new Map();
  // env(safe-area-inset-bottom) 的解析缓存；-1 表示下次重读。
  let safeBottomPx = -1;
  // 上一次视口宽度：用来区分「旋转/收窄」和「移动端地址栏伸缩」。
  let lastViewportWidth = window.innerWidth;
  let resizeSettleTimer = 0;
  const bootSession = readSession(localStorage);

  // 桌面设置：NEXLOS_HOME/settings.json 是唯一来源，外壳只保留一份内存副本做即时渲染。
  let prefs = {
    appearance: 'current', retroWallpaper: 'default',
    retroFont: document.documentElement.dataset.retroFont || 'pixel',
    retroFontSize: parseInt(document.documentElement.style.getPropertyValue('--retro-font-size'), 10) || 12,
    theme: 'light', accent: '#0078d4', wallpaper: 'snowfog',
    clock24: false, reduceMotion: false, name: 'NexlOS', language: storedLanguage('en'),
    companion: '', companionSize: 100, companionHidden: false, companionMode: 'desktop',
    // 星标页跳转成功后，桌面右键的常驻入口收起；设置里的入口保持常驻。
    starOpened: false,
  };
  let prefsRevision = 0;

  const root = h('div', { class: 'os' });
  // 桌面亮度是真实效果：滑块直接压暗壁纸并持久化，不做一块“看起来能调”的假控件。
  const BRIGHT_KEY = `${STORE}brightness`;
  let brightness = Number(localStorage.getItem(BRIGHT_KEY));
  if (!Number.isFinite(brightness) || brightness < 0.4 || brightness > 1) brightness = 1;
  root.style.setProperty('--os-brightness', String(brightness));
  // 通知中心只存 Agent 任务的完成/失败汇报，最近 24 条。
  // 启动、换壁纸、刷新应用、切外观这类状态反馈留在 toast，不进通知中心。
  const NOTICE_LIMIT = 24;
  let notices = readJSON(`${STORE}notices`, []);
  if (!Array.isArray(notices)) notices = [];
  // 旧版本把启动/壁纸/外观提示也写进了同一个列表：升级后只留 Agent 汇报。
  notices = notices.filter((n) => n && (n.agent === true || (typeof n.report === 'string' && n.report)));
  let noticesSeenAt = Number(readJSON(`${STORE}notices.seen`, 0)) || 0;
  let appearanceBusy = false;
  // 桌面锁住浏览器级双指缩放：一旦整页被放大，可视宽度只剩几十像素、表头被挤出屏幕，
  // 触摸坐标又会按 1/scale 折算，用户看到的就是“拖拽和双指缩放都失灵”。
  // 只拦两指；窗口自己的缩放走 CSS zoom，iframe 里的画板仍用它的双指手势。
  function blockPageZoom(e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }
  document.addEventListener('touchstart', blockPageZoom, { passive: false });
  document.addEventListener('touchmove', blockPageZoom, { passive: false });
  const wallpaper = h('div', { class: 'os-wallpaper' });
  // 自定义壁纸存本地压缩后的 data URL：换机器不带走，单机体验更像一台自己的电脑。
  const wallInput = h('input', {
    type: 'file', accept: 'image/*', style: 'display:none', 'aria-label': '上传桌面背景',
    onchange: () => { const f = wallInput.files && wallInput.files[0]; if (f) applyWallpaperFile(f); wallInput.value = ''; },
  });
  const savedWall = localStorage.getItem(`${STORE}wallpaper`);
  if (savedWall) wallpaper.style.backgroundImage = `url(${savedWall})`;
  const iconLayer = h('div', { class: 'os-icons' });
  // 桌面右上角嵌入原创「子午流注钟」：离线 HTML 随二进制发布，只有现代主题显示。
  // 时钟自己读本机时间并高亮当前时辰；任务栏胶囊仍负责打开日历。
  // 钟是文化件，标题固定中文：translate="no" 让界面语言切换时也不改写 title。
  const deskClockFrame = h('iframe', {
    class: 'os-deskclock-frame', src: '/a/ziwuliuzhu/clock.html', translate: 'no',
    title: '子午流注钟', loading: 'lazy', scrolling: 'no', tabindex: '-1',
  });
  const deskClock = h('div', { class: 'os-deskclock', title: '子午流注钟', translate: 'no' }, deskClockFrame);
  // 玻璃衬底在 app.css 里跟深浅主题走，iframe 里的钟面也要同步换色。
  function syncClockTheme() {
    if (!deskClockFrame.contentWindow) return;
    // 子午流注钟是中医文化件，语言固定中文：界面切到英文时它也不跟着翻译。
    deskClockFrame.contentWindow.postMessage(
      { type: 'nexlos.clockTheme', dark: prefs.theme === 'dark', language: 'zh-CN' }, location.origin);
  }
  deskClockFrame.addEventListener('load', syncClockTheme);
  const desktop = h('div', { class: 'os-desktop' }, iconLayer, deskClock);
  // 左键拖拽选框：只画在桌面上，窗口和任务栏各自处理自己的手势。
  const deskMarquee = h('div', { class: 'os-marquee', hidden: true });
  desktop.append(deskMarquee);
  const windowsLayer = h('div', { class: 'os-windows' });
  // 贴边预览框：只在拖动时出现，落在工作区内，不参与命中测试。
  const snapHint = h('div', { class: 'os-snap-hint', hidden: true });
  windowsLayer.append(snapHint);

  const startMenu = h('div', { class: 'os-start', role: 'dialog', 'aria-label': '开始菜单' });
  const startPanel = h('div', { class: 'os-start-panel', role: 'dialog', 'aria-label': '开始菜单' });
  startMenu.append(startPanel);

  const taskbar = h('nav', { class: 'os-taskbar', 'aria-label': '任务栏' });
  const ctxMenu = h('div', { class: 'os-ctx', hidden: true, role: 'menu' });
  const classicContext = createClassicContextMenu({ onClose: () => broadcastChrome() });
  // 任务视图 / Alt+Tab 共用一层：Windows 10 里两者是同一张“窗口清单”。
  const switcher = h('div', { class: 'os-switcher', hidden: true, role: 'dialog', 'aria-label': '任务视图' });
  // 任务视窗：把窗口本体缩进屏幕网格，iframe 内容保持活体，不重建也不重排。
  const taskView = h('div', { class: 'os-taskview', hidden: true, 'aria-hidden': 'true' });
  const tvLabels = h('div', { class: 'os-tv-labels', hidden: true, 'aria-hidden': 'true' });
  let taskViewOn = false;
  let tvState = null;
  // 点空白处退出；点窗口由每格的命中层接管。
  taskView.addEventListener('click', () => closeTaskView(true));
  let switchState = null;
  // 时钟日历、快速设置与通知中心都按需创建，避免常驻 DOM。
  const clockPop = h('div', { class: 'os-clockpop', hidden: true });
  const trayPop = h('div', { class: 'os-traypop', hidden: true });
  const notifyPop = h('div', { class: 'os-notifypop', hidden: true });
  let calMonth = new Date();

  const startSearch = h('input', {
    class: 'os-start-search', type: 'search', placeholder: '搜索应用、窗口与设置', autocomplete: 'off',
    oninput: () => renderStartGrid(),
    onkeydown: (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeStart(); }
      if (e.key === 'Enter') {
        const first = startGrid.querySelector('.os-start-app');
        if (first) first.click();
      }
    },
  });
  const startGrid = h('div', { class: 'os-start-grid' });
  const startRecent = h('div', { class: 'os-start-recent' });
  const startHeroDate = h('span', { class: 'os-start-herodate' });
  const startHelloName = h('b', {}, '您好');
  const startAvatar = h('span', { class: 'os-start-avatar' }, 'N');
  const startUserName = h('b', {}, 'NexlOS');

  startPanel.append(
    h('header', { class: 'os-start-hero' },
      h('div', { class: 'os-start-hello' },
        h('i', {}, 'NexlOS'),
        startHelloName),
      startHeroDate),
    h('label', { class: 'os-start-searchbox' }, icon('search'), startSearch),
    h('div', { class: 'os-start-body' },
      h('section', { class: 'os-start-section' },
        h('div', { class: 'os-start-head' },
          h('h2', {}, '全部应用'),
          h('button', { class: 'os-start-link', type: 'button', onclick: () => { closeStart(); toast('应用清单来自 NexlOS 内核：/c/app.list'); } }, '应用清单')),
        startGrid),
      h('section', { class: 'os-start-section recent' },
        h('div', { class: 'os-start-head' }, h('h2', {}, '最近使用')),
        startRecent)),
    h('footer', { class: 'os-start-foot' },
      h('div', { class: 'os-start-user' },
        startAvatar,
        h('div', {}, startUserName, h('i', {}, '本地 · 干净配置'))),
      h('div', { class: 'os-start-foot-actions' },
        h('button', { class: 'os-start-footbtn', type: 'button', title: '设置', onclick: () => { closeStart(); openApp(apps.get('settings')); } }, icon('gear')),
        h('button', { class: 'os-start-footbtn', type: 'button', title: '重新载入桌面', onclick: () => location.reload() }, icon('power')))));

  const classicStart = createClassicStart({
    getApps: () => [...apps.values()].filter(app => app.id !== 'system'),
    onOpen: id => openApp(apps.get(id)),
    onClose: () => { closeStart(); const btn = taskbar.querySelector('.os-tb-start'); if (btn) btn.focus(); },
    onFind: () => showClassicDialog('find'),
    onRun: () => showClassicDialog('run'),
    onAbout: () => showClassicDialog('about'),
    onRefresh: () => refreshApps(true),
    onShutdown: () => showClassicDialog('shutdown'),
    onStartup: () => replayClassicStartup(),
    onSounds: () => showClassicDialog('sounds'),
    onTheme: toggleAppearance,
  });
  startMenu.append(classicStart.element);
  let classicDialog = null;
  let bootController = null;
  let powerOffLayer = null;

  function replayClassicStartup() {
    if (powerOffLayer) { powerOffLayer.remove(); powerOffLayer = null; }
    root.inert = false;
    bootController = replayClassicBoot({ reduceMotion: prefs.reduceMotion });
  }

  function showClassicPowerOff() {
    if (powerOffLayer) powerOffLayer.remove();
    stopClassicStartupSound();
    playClassicSound('logoff');
    root.inert = true;
    powerOffLayer = h('section', { class: 'c98-poweroff', role: 'dialog', 'aria-label': '桌面已关闭' },
      h('strong', {}, '现在可以安全关闭此窗口。'),
      h('button', { type: 'button', onclick: replayClassicStartup }, '重新启动桌面'));
    document.body.append(powerOffLayer);
    localizeDoc(document);
    powerOffLayer.querySelector('button').focus();
  }

  // ---------- Magpie 命令栏 + 运行状态空间 ----------
  // 外壳只做三件事：收一句话、把这次运行的状态摆在桌面上、跑完给一个回执。
  // 对话历史不在外壳里；模型与账号属于模型平面（magpie 网关，见 docs/aios-magpie-2026-11-04.md）。
  const CMD_STORE = `${STORE}cmd.`;
  const CMD_HISTORY_MAX = 30;
  let cmdBusy = false;
  let runningText = ''; // 正在执行的那条命令，用来识别重复提交
  let cmdStopping = false;
  let cmdXhr = null;
  let cmdStartedAt = 0;
  let cmdWarmed = false;
  let cmdHistory = [];
  let cmdHistoryAt = -1;
  let cmdMenuOpen = false;
  let cmdRouteInfo = null; // /agent/status 的最近一份：菜单与芯片共用
  let spaceVisible = false;
  let spacePinned = false; // 用户上滑后冻结自动滚动
  let spaceExpanded = false;
  let spaceTab = 'task';
  let spaceCache = {}; // 操作面各页的最近一份数据
  let wsPath = ''; // 工作区浏览位置（相对工作区根）
  let cmdTimer = null;
  let runsBox = null;
  let autoSeen = {}; // 已提醒过的自动化到点

  const cmdChipLabel = h('b', { class: 'os-cmd-chip-label' }, '本机');
  const cmdChip = h('button', {
    class: 'os-cmd-chip', type: 'button', title: '模型路由', 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
    onclick: (e) => { e.stopPropagation(); toggleCmdMenu(); },
  }, h('span', { class: 'os-cmd-chip-dot' }), cmdChipLabel, h('span', { class: 'os-cmd-chip-caret' }, '▾'));

  const cmdInput = h('input', {
    class: 'os-cmd-input', type: 'text', autocomplete: 'off', spellcheck: 'false',
    placeholder: prefs.appearance === 'win98' ? '查找应用、窗口与设置' : '下命令 · Enter 执行',
    'aria-label': '命令输入',
    onfocus: () => warmCommand(),
    oninput: () => { cmdHistoryAt = -1; syncCmdFill(); },
    onkeydown: (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runCommand(); return; }
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (cmdMenuOpen) { closeCmdMenu(); return; }
        cmdInput.blur();
        return;
      }
      if (e.key === 'ArrowUp' && !cmdInput.value) {
        if (cmdHistory.length) {
          e.preventDefault();
          cmdHistoryAt = cmdHistoryAt < 0 ? cmdHistory.length - 1 : Math.max(0, cmdHistoryAt - 1);
          cmdInput.value = cmdHistory[cmdHistoryAt] || '';
          syncCmdFill();
        }
        return;
      }
      if (e.key === 'ArrowDown' && cmdHistoryAt >= 0) {
        e.preventDefault();
        cmdHistoryAt += 1;
        if (cmdHistoryAt >= cmdHistory.length) { cmdHistoryAt = -1; cmdInput.value = ''; }
        else cmdInput.value = cmdHistory[cmdHistoryAt];
        syncCmdFill();
      }
    },
  });

  const cmdForm = h('form', {
    class: 'os-tb-searchbox os-tb-cmd', role: 'search',
    onsubmit: (e) => { e.preventDefault(); runCommand(); },
  }, cmdChip, cmdInput);

  // 只有输入框里有字时才让胶囊变实；清空（含 Enter 发送）后回到半透明。
  function syncCmdFill() {
    cmdForm.classList.toggle('is-typing', cmdInput.value.length > 0);
  }

  // 路由菜单：现在是本机 dsh 的直达模型；接上 magpie 之后这里列网关的路由与账号。
  const cmdMenu = h('div', { class: 'os-cmd-menu', role: 'listbox', 'aria-label': '模型路由', hidden: true });

  const spaceStatus = h('span', { class: 'os-space-status' }, '空闲');
  const spaceRoute = h('span', { class: 'os-space-route' }, '');
  const spaceStopBtn = h('button', {
    class: 'os-space-stop', type: 'button', title: '停止这一轮', hidden: true, onclick: () => stopCommand(),
  }, '停止');
  const spaceExpandBtn = h('button', {
    class: 'os-space-expand', type: 'button', title: '展开操作面板', 'aria-label': '展开操作面板',
    'aria-expanded': 'false', onclick: () => setSpaceExpanded(!spaceExpanded),
  }, '⤢');
  const spaceCloseBtn = h('button', {
    class: 'os-space-close', type: 'button', title: '收起', 'aria-label': '收起状态空间', onclick: () => closeSpace(),
  }, '×');

  // 紧凑态：一次运行的状态序列（不是聊天记录）。
  // 命令栏既显示用户输入也显示占位词：占位词走 data-i18n-key 交给翻译层，
  // 用户输入的命令与工具参数加 data-i18n-skip，原样保留。
  const spaceCmdText = h('div', { class: 'os-space-cmd', 'data-i18n-key': '待命' }, '待命');
  const spaceTimer = h('span', { class: 'os-space-timer' }, '');
  const spaceAction = h('div', { class: 'os-space-action' }, '待命');
  const spaceFeed = h('div', { class: 'os-space-feed', role: 'log', 'aria-live': 'polite' });
  // 集群条：只有出现子代理时才占一行，回答「几个人、走到哪」。
  const spaceCluster = h('div', { class: 'os-cluster', hidden: true });
  // 成员区：谁的独立一行。它不跟日志一起滚走，蜂群在跑时始终看得见。
  const spaceAgents = h('div', { class: 'os-agents', hidden: true });
  // 团队条：原生 Agent Team 的成员与任务板；没有团队时整块不占位。
  const spaceTeam = h('div', { class: 'os-team', hidden: true });
  // 引一句命令，像终端里的输入块；过程从下一行开始，不再重复命令本身。
  const runCard = h('div', { class: 'os-space-run' },
    h('div', { class: 'os-space-runhead' },
      h('span', { class: 'os-space-prompt', 'aria-hidden': 'true' }, '›'),
      spaceCmdText,
      spaceTimer),
    spaceAction,
    spaceCluster,
    spaceAgents,
    spaceTeam,
    spaceFeed);

  const quickBtn = (label, tab) => h('button', {
    class: 'os-space-quickbtn', type: 'button', onclick: () => openConsoleTab(tab),
  }, label);
  const spaceCompact = h('div', { class: 'os-space-compact' },
    runCard,
    h('div', { class: 'os-space-quick' },
      h('button', { class: 'os-space-quickbtn', type: 'button', onclick: () => newCommandSession() }, '新建任务'),
      quickBtn('工作区', 'workspace'),
      quickBtn('插件', 'plugins'),
      quickBtn('自动化', 'automation')));

  // 展开态：左边一条操作栏（工作面 / 模型面），右边是内容。
  const consoleTitle = h('b', { class: 'os-console-title' }, '任务');
  const consolePane = h('div', { class: 'os-console-pane' });
  const consoleRail = h('nav', { class: 'os-console-rail', 'aria-label': '操作面' });
  const consoleRefresh = h('button', {
    class: 'os-console-refresh', type: 'button', title: '刷新', onclick: () => reloadSection(true),
  }, '刷新');
  const consoleEl = h('div', { class: 'os-console' },
    consoleRail,
    h('div', { class: 'os-console-main' },
      h('header', { class: 'os-console-head' }, consoleTitle, h('span', { class: 'os-console-grow' }), consoleRefresh),
      consolePane));

  const agentSpace = h('section', {
    class: 'os-agentspace', 'aria-hidden': 'true', 'aria-label': '运行状态空间',
  },
  h('header', { class: 'os-space-head' },
    h('b', { class: 'os-space-title' }, '状态空间'),
    h('span', { class: 'os-space-grow' }),
    spaceStatus,
    spaceStopBtn,
    spaceExpandBtn,
    spaceCloseBtn),
  h('div', { class: 'os-space-meta' }, spaceRoute),
  spaceCompact,
  consoleEl);

  spaceFeed.addEventListener('scroll', () => {
    const nearBottom = spaceFeed.scrollHeight - spaceFeed.scrollTop - spaceFeed.clientHeight < 24;
    spacePinned = !nearBottom;
  });

  function cmdSession() {
    let id = '';
    try { id = localStorage.getItem(`${CMD_STORE}session`) || ''; } catch (e) { id = ''; }
    if (!id) id = rotateCmdSession();
    return id;
  }

  function rotateCmdSession() {
    const id = `nexlos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try { localStorage.setItem(`${CMD_STORE}session`, id); } catch (e) { /* 隐私模式不持久化 */ }
    return id;
  }

  function loadCmdHistory() {
    try {
      const raw = localStorage.getItem(`${CMD_STORE}history`);
      const list = raw ? JSON.parse(raw) : [];
      cmdHistory = Array.isArray(list) ? list.slice(-CMD_HISTORY_MAX) : [];
    } catch (e) { cmdHistory = []; }
  }

  function pushCmdHistory(text) {
    cmdHistory = cmdHistory.filter((x) => x !== text);
    cmdHistory.push(text);
    if (cmdHistory.length > CMD_HISTORY_MAX) cmdHistory = cmdHistory.slice(-CMD_HISTORY_MAX);
    cmdHistoryAt = -1;
    try { localStorage.setItem(`${CMD_STORE}history`, JSON.stringify(cmdHistory)); } catch (e) { /* 忽略配额 */ }
  }

  function spaceAutoScroll() {
    if (!spacePinned) spaceFeed.scrollTop = spaceFeed.scrollHeight;
  }

  function trimFeed(box) {
    while (box.children.length > 200) box.removeChild(box.firstChild);
  }

  // 一行一条事件：字形说明状态，正文只留动词与参数，靠留白分隔。
  function lineRow(kind, glyph, label, text, extra) {
    const body = h('span', { class: 'os-line-x' });
    body.append(linkify(text || ''));
    return h('div', { class: `os-line is-${kind}${extra ? ' ' + extra : ''}` },
      h('span', { class: 'os-line-glyph' }, glyph),
      label ? h('span', { class: 'os-line-verb' }, label) : null,
      body);
  }

  function spaceStep(kind, text, label) {
    const glyph = kind === 'error' ? '!' : kind === 'done' ? '✓' : kind === 'ask' ? '?' : '·';
    const row = lineRow(kind, glyph, label || '', text || '');
    spaceFeed.append(row);
    trimFeed(spaceFeed);
    spaceAutoScroll();
    return row;
  }

  // 用户命令原样显示：跳过翻译，命令里的英文/路径不会被改写。
  function setSpaceCmdText(text) {
    spaceCmdText.removeAttribute('data-i18n-key');
    spaceCmdText.setAttribute('data-i18n-skip', '');
    spaceCmdText.textContent = text;
  }

  // 界面自带的占位词（「待命」「接回上一次运行」）走词表，切换语言后跟着变。
  function setSpaceCmdHint(source) {
    spaceCmdText.removeAttribute('data-i18n-skip');
    spaceCmdText.setAttribute('data-i18n-key', source);
    spaceCmdText.textContent = source;
  }

  // 当前动作一句话：不是给用户读的长日志，只回答「它现在在做什么」。
  function setSpaceAction(text, kind) {
    spaceAction.textContent = text || '待命';
    spaceAction.classList.toggle('is-live', !!text);
    spaceAction.setAttribute('data-kind', kind || '');
  }

  const TOOL_LABELS = {
    bash: '运行命令', shell: '运行命令', read: '读取文件', read_file: '读取文件',
    write: '写入文件', write_file: '写入文件', edit: '修改文件', apply_patch: '修改文件',
    grep: '搜索内容', glob: '查找文件', ls: '列目录', web_search: '搜索网页',
    fetch: '抓取网页', task: '子任务', todo_write: '更新任务', image_gen: '生成图片',
  };
  let toolRows = {};
  let agentNodes = {};
  let teamMembers = {};
  let teamTasks = {};
  let cmdAnswer = null;
  let cmdAnswerText = '';

  function toolKey(ev) {
    return `${ev.agent || ''}|${ev.callId || ''}`;
  }

  function toolLabel(name) {
    return TOOL_LABELS[name] || name || '工具';
  }

  function argSummary(raw) {
    if (!raw) return '';
    let out = String(raw);
    try {
      const obj = JSON.parse(raw);
      out = obj.command || obj.path || obj.file || obj.query || obj.pattern
        || obj.description || Object.keys(obj).map((k) => obj[k]).filter((v) => typeof v === 'string')[0] || raw;
    } catch (e) { /* 不是 JSON：按原文截断 */ }
    return out.replace(/\s+/g, ' ').slice(0, 76);
  }

  function prettyArgs(raw) {
    if (!raw) return '';
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch (e) { return raw; }
  }

  function paintCluster() {
    const ids = Object.keys(agentNodes);
    // 有成员时把命令行压成一行，紧凑态的高度留给「谁在做什么」。
    agentSpace.classList.toggle('has-agents', ids.length > 0);
    spaceAgents.hidden = ids.length === 0;
    if (!ids.length) {
      spaceCluster.hidden = true;
      clear(spaceCluster);
      return;
    }
    let steps = 0;
    let live = 0;
    let parked = 0;
    ids.forEach((id) => {
      const node = agentNodes[id];
      const el = node.el;
      steps += node.steps;
      // 主代理这一轮结束、成员仍在后台跑时算「停驻」，不要继续报「运行中」。
      if (!el.classList.contains('is-done') && !el.classList.contains('is-error')) {
        if (node.parked) parked += 1;
        else live += 1;
      }
    });
    const tail = [];
    if (live) tail.push(h('span', { class: 'is-live' }, `${live} 运行中`));
    if (parked) tail.push(h('span', { class: 'is-parked' }, `${parked} 后台继续`));
    if (!tail.length) tail.push(h('span', {}, '全部结束'));
    spaceCluster.hidden = false;
    clear(spaceCluster);
    spaceCluster.append(
      h('span', { class: 'os-cluster-glyph' }, '◇'),
      h('b', {}, `${ids.length} 个子代理`),
      h('span', {}, `${steps} 步`));
    tail.forEach((el) => spaceCluster.append(el));
  }

  // ---------- 原生 Agent Team：成员 + 任务板 ----------
  // 后端把 team/member 与 team/task 的完整快照逐条推来，这里按 id 折叠；
  // 紧凑态只露三行任务，展开态显示全部。DAG 留到展开态再做。
  function teamPhaseLabel(phase) {
    if (phase === 'provisioning') return '创建中';
    if (phase === 'failed') return '失败';
    return '就绪';
  }

  function paintTeam() {
    const members = Object.keys(teamMembers).map((id) => teamMembers[id]);
    const tasks = Object.keys(teamTasks).map((id) => teamTasks[id]);
    if (!members.length && !tasks.length) {
      spaceTeam.hidden = true;
      clear(spaceTeam);
      return;
    }
    const done = tasks.filter((task) => task.status === 'completed').length;
    const head = h('div', { class: 'os-team-head' },
      h('span', { class: 'os-team-glyph', 'aria-hidden': 'true' }, '◈'),
      h('b', {}, `团队 ${members.length}`),
      h('span', { class: 'os-team-count' }, `任务 ${done}/${tasks.length}`));
    const chips = h('div', { class: 'os-team-members' });
    members.forEach((m) => {
      chips.append(h('button', {
        class: `os-team-chip is-${m.phase || 'active'}`, type: 'button',
        title: m.description || m.name || '',
        onclick: () => {
          const node = agentNodes[m.id];
          if (!node || !node.el) return;
          node.el.classList.add('open');
          if (node.el.scrollIntoView) node.el.scrollIntoView({ block: 'nearest' });
        },
      }, h('i', { class: 'os-team-dot', 'aria-hidden': 'true' }), m.name || '成员',
      h('span', { class: 'os-team-phase' }, teamPhaseLabel(m.phase))));
    });
    const limit = spaceExpanded ? 20 : 3;
    const rows = h('div', { class: 'os-team-tasks' });
    tasks.slice(0, limit).forEach((task) => {
      const owner = task.ownerId && teamMembers[task.ownerId] ? teamMembers[task.ownerId].name : '待认领';
      // 依赖只在任务尚未开工时才是阻塞理由；已开工/已完成还显示「阻塞」会自相矛盾。
      const blocked = task.status === 'pending' ? (task.blockedBy || []).length : 0;
      rows.append(h('div', { class: `os-team-task is-${task.status || 'pending'}` },
        h('span', { class: 'os-team-task-mark', 'aria-hidden': 'true' },
          task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▸' : '·'),
        h('span', { class: 'os-team-task-subject' }, task.subject || '（未命名任务）'),
        h('span', { class: 'os-team-task-owner' }, owner),
        blocked ? h('span', { class: 'os-team-task-blocked' }, `阻塞 ${blocked}`) : null));
    });
    if (tasks.length > limit) {
      rows.append(h('div', { class: 'os-team-task is-more' }, `+${tasks.length - limit} 个任务`));
    }
    spaceTeam.hidden = false;
    clear(spaceTeam);
    spaceTeam.append(head, chips, rows);
  }

  function handleTeam(ev) {
    let data = ev.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (!data) return;
    if (ev.phase === 'member' && data.member && data.member.id) {
      teamMembers[data.member.id] = data.member;
    } else if (ev.phase === 'task' && data.task && data.task.id) {
      teamTasks[data.task.id] = data.task;
    } else {
      return;
    }
    paintTeam();
  }

  // ---------- 子代理委派树 ----------
  // dsh 把一次委派拆成独立子会话；这里按 subagent.started/finished 归并成
  // 「主代理 → 子代理 → 子代理」的嵌套树，子会话的工具行缩进挂在节点下面。
  function ensureAgent(ev) {
    const id = ev.agent;
    if (!id) return null;
    if (agentNodes[id]) return agentNodes[id];
    const parent = ev.parent ? agentNodes[ev.parent] : null;
    const host = parent ? parent.body : spaceAgents;
    const label = h('b', { class: 'os-agent-label' }, '子代理');
    const meta = h('span', { class: 'os-agent-meta' }, '运行中');
    const mark = h('span', { class: 'os-agent-mark' }, '⋯');
    const body = h('div', { class: 'os-agent-body' });
    const node = { el: null, body, label, meta, mark, steps: 0, parentId: ev.parent || '' };
    const head = h('button', {
      class: 'os-agent-head', type: 'button', 'aria-expanded': 'false',
      onclick: () => {
        const open = node.el.classList.toggle('open');
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
      },
    },
      h('span', { class: 'os-agent-glyph' }, '◇'),
      label, meta, mark);
    // 过程在右栏里读，追问与完整对话去对话窗口：只读地打开这个子代理，返回键回到队长。
    const openBtn = h('button', {
      class: 'os-agent-open', type: 'button', 'aria-label': '在对话窗口里打开这个子代理',
      title: '在对话窗口里打开',
      onclick: (event) => {
        event.stopPropagation();
        const popup = window.__nxChatPopup;
        if (popup && typeof popup.open === 'function') {
          popup.open({ sessionId: id, title: label.textContent || '子代理', canWrite: false, parentSessionId: node.parentId });
        }
      },
    }, '↗');
    node.el = h('div', { class: 'os-agent' }, h('div', { class: 'os-agent-row' }, head, openBtn), body);
    host.append(node.el);
    agentNodes[id] = node;
    paintCluster();
    return node;
  }

  function bumpAgent(id) {
    const node = agentNodes[id];
    if (!node) return;
    node.steps += 1;
    node.meta.textContent = `${node.steps} 步`;
    paintCluster();
  }

  // 主代理收尾后，后台成员可能还会跑一阵：轮询一次目录直到没有在跑的成员，
  // 把「后台继续」改回「完成」，否则右栏会一直停在旧状态。
  let agentReconcileTimer = 0;
  function reconcileAgents() {
    const first = Object.keys(agentNodes).map((id) => agentNodes[id]).find((node) => node && node.parentId);
    if (!first) return;
    const parentId = first.parentId;
    let tries = 0;
    const step = () => {
      tries += 1;
      fetch(`/agent/agents?sessionId=${encodeURIComponent(parentId)}`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data || !data.ok || !Array.isArray(data.agents)) return;
          // 对账只刷新已在屏上的成员：目录里还有历史，不能借这次轮询把旧的加回来。
          applyAgentRoster(data.agents, { onlyKnown: true });
          const stillRunning = data.agents.some((agent) => agent && agent.status === 'running');
          if (stillRunning && tries < 20 && agentSpace.classList.contains('has-run')) {
            agentReconcileTimer = setTimeout(step, 3000);
          }
        })
        .catch(() => { /* 用最后一次已知状态收尾 */ });
    };
    step();
  }

  // 桌面端的「agents」快照：批量对账子代理状态。主代理这一轮收尾后，
  // 仍在后台跑的成员还能被标成「后台继续」，不靠一串易丢的增量事件。
  function applyAgentRoster(list, options) {
    if (!Array.isArray(list) || !list.length) return;
    const onlyKnown = !!(options && options.onlyKnown);
    list.forEach((agent) => {
      if (!agent || !agent.id) return;
      if (onlyKnown && !agentNodes[agent.id]) return;
      const node = ensureAgent({ agent: agent.id, parent: agent.parentId, label: agent.label });
      if (!node) return;
      if (agent.label) {
        node.label.textContent = agent.label;
        node.label.title = agent.label;
      }
      if (typeof agent.steps === 'number' && agent.steps > node.steps) node.steps = agent.steps;
      const current = agent.current || {};
      if (agent.status === 'running') {
        node.el.classList.remove('is-done', 'is-error');
        node.parked = false;
        node.mark.textContent = '⋯';
        node.meta.textContent = current.kind === 'tool'
          ? `${toolLabel(current.name)}${current.text ? ' · ' + String(current.text).slice(0, 22) : ''}`
          : current.kind === 'message' && current.text
            ? String(current.text).replace(/\s+/g, ' ').slice(0, 26)
            : '思考中';
      } else if (agent.ended || agent.status === 'done') {
        node.el.classList.add('is-done');
        node.mark.textContent = '✓';
        node.meta.textContent = '完成';
      } else {
        node.meta.textContent = `${node.steps} 步`;
      }
    });
    paintCluster();
  }

  function handleSubagent(ev) {
    const node = ensureAgent(ev);
    if (!node) return;
    if (ev.phase === 'label' || (ev.phase === 'start' && ev.label)) {
      node.label.textContent = ev.label || t('子代理');
      node.label.title = ev.label || '';
      // 团队成员会反复收到新任务：新的 start 视为重新开工，撤掉上一轮的完成态。
      node.el.classList.remove('is-done', 'is-error');
      node.mark.textContent = '⋯';
      node.parked = false;
      node.meta.textContent = node.steps ? `${node.steps} 步` : '运行中';
      paintCluster();
      return;
    }
    if (ev.phase === 'end') {
      const failed = /fail|error|cancel|abort|timeout|interrupt/i.test(ev.text || '');
      node.el.classList.add(failed ? 'is-error' : 'is-done');
      node.mark.textContent = failed ? '×' : '✓';
      if (!node.steps) node.meta.textContent = failed ? '失败' : '完成';
      const text = String(ev.detail || '').replace(/\s+/g, ' ').trim();
      if (text) node.body.append(h('p', { class: 'os-agent-result' }, text.slice(0, 220)));
      trimFeed(node.body);
      paintCluster();
      spaceAutoScroll();
    }
  }

  function addToolCall(ev) {
    const host = ev.agent ? ensureAgent(ev).body : spaceFeed;
    const out = h('pre', { class: 'os-line-out' }, '');
    const body = h('div', { class: 'os-line-body' },
      ev.detail ? h('pre', { class: 'os-line-args' }, prettyArgs(ev.detail)) : null,
      out);
    const mark = h('span', { class: 'os-line-mark' }, '⋯');
    // 证据位：同一行右侧补「用时 · 退出码」，让每一步可验收，而不是只有一个对勾。
    const evidence = h('span', { class: 'os-line-ev' }, '');
    const row = h('div', { class: 'os-line is-tool' },
      h('button', { class: 'os-line-head', type: 'button', onclick: () => row.classList.toggle('open') },
        h('span', { class: 'os-line-glyph' }, '✧'),
        h('span', { class: 'os-line-verb' }, toolLabel(ev.text)),
        h('span', { class: 'os-line-arg' }, argSummary(ev.detail)),
        evidence,
        mark),
      body);
    host.append(row);
    toolRows[toolKey(ev)] = { row, mark, out, ev: evidence, startedAt: Date.now() };
    if (ev.agent) bumpAgent(ev.agent);
    trimFeed(host);
    spaceAutoScroll();
  }

  // dsh 的 bash 结果带 [exit code: N]；其他工具没有退出码，就不编一个。
  function exitOf(text) {
    const s = String(text || '');
    const m = /\[exit code:\s*(-?\d+)\]/i.exec(s) || /\bexit code:\s*(-?\d+)/i.exec(s);
    return m ? Number(m[1]) : null;
  }

  function evidenceOf(ms, exit) {
    const parts = [];
    if (ms > 0) parts.push(ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
    if (exit !== null) parts.push(`exit ${exit}`);
    return parts.join(' · ');
  }

  function addToolResult(ev) {
    const failed = ev.ok === false;
    const exit = exitOf(ev.text);
    const rec = toolRows[toolKey(ev)];
    if (!rec) {
      // 没看到调用（例如续接旧线程）：把结果单独收成一行，失败时展开。
      const row = h('div', { class: 'os-line is-tool is-' + (failed || (exit !== null && exit !== 0) ? 'error' : 'done') + ' open' },
        h('div', { class: 'os-line-head' },
          h('span', { class: 'os-line-glyph' }, failed ? '!' : '✓'),
          h('span', { class: 'os-line-verb' }, '工具结果'),
          h('span', { class: 'os-line-arg' }, ''),
          h('span', { class: 'os-line-ev' }, exit === null ? '' : `exit ${exit}`),
          h('span', { class: 'os-line-mark' }, failed ? '×' : '✓')),
        h('div', { class: 'os-line-body' },
          h('pre', { class: 'os-line-out' }, ev.text || t('（无输出）'))));
      spaceFeed.append(row);
      spaceAutoScroll();
      return;
    }
    const bad = failed || (exit !== null && exit !== 0);
    rec.row.classList.add(bad ? 'is-error' : 'is-done');
    rec.mark.textContent = bad ? '×' : '✓';
    rec.ev.textContent = evidenceOf(Date.now() - rec.startedAt, exit);
    clear(rec.out);
    rec.out.append(linkify(ev.text ? String(ev.text).slice(0, 4000) : t('（无输出）')));
    if (bad) rec.row.classList.add('open');
    spaceAutoScroll();
  }

  // 结论里的链接与复制：模型经常会给出网址、报错路径、命令。
  // 整页禁选是为了桌面手势；正文里要能选中、点开、一键复制。
  const LINK_RE = /https?:\/\/[^\s<>"'）)】\]，。；]+/g;

  function openLink(url) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/c/open.url', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
      if (!data || !data.ok) window.open(url, '_blank');
    };
    xhr.onerror = () => window.open(url, '_blank');
    xhr.send(JSON.stringify({ url }));
  }

  function linkify(text) {
    const frag = document.createDocumentFragment();
    const raw = String(text || '');
    let last = 0;
    LINK_RE.lastIndex = 0;
    let m = LINK_RE.exec(raw);
    while (m) {
      const href = m[0].replace(/[.,;:!?]+$/, '');
      if (m.index > last) frag.append(document.createTextNode(raw.slice(last, m.index)));
      frag.append(h('a', {
        class: 'os-link', href: '#', title: href,
        onclick: (e) => { e.preventDefault(); openLink(href); },
      }, href));
      last = m.index + href.length;
      LINK_RE.lastIndex = last;
      m = LINK_RE.exec(raw);
    }
    if (last < raw.length) frag.append(document.createTextNode(raw.slice(last)));
    return frag;
  }

  // Chrome 72 的 navigator.clipboard 在非安全上下文里可能不存在，留一条 execCommand 兜底。
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copyText(text, btn) {
    const done = (ok) => {
      btn.textContent = ok ? '已复制' : '复制失败';
      btn.classList.toggle('is-ok', ok);
      setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('is-ok'); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(fallbackCopy(text)));
      return;
    }
    done(fallbackCopy(text));
  }

  function addAnswer(text) {
    if (!text) return;
    if (!cmdAnswer) {
      const copyBtn = h('button', { class: 'os-copy', type: 'button', title: '复制结论' }, '复制');
      copyBtn.addEventListener('click', () => copyText(cmdAnswerText, copyBtn));
      cmdAnswer = h('article', { class: 'os-space-answer' },
        h('div', { class: 'os-space-answer-head' },
          h('span', { class: 'os-space-answer-mark' }, '◆'),
          h('b', {}, '结论'),
          copyBtn),
        h('div', { class: 'os-space-answer-body' }));
      spaceFeed.append(cmdAnswer);
    }
    // 结论只认最后一条 assistant 消息：dsh 会把分步叙述也发成 assistant/message，
    // 逐条拼接会把同一句结论重复两遍。
    cmdAnswerText = String(text);
    const body = cmdAnswer.querySelector('.os-space-answer-body');
    clear(body);
    body.append(linkify(cmdAnswerText));
    spaceAutoScroll();
  }

  function clearSpace() {
    clear(spaceFeed);
    clear(spaceAgents);
    spaceAgents.hidden = true;
    cmdAnswer = null;
    cmdAnswerText = '';
    toolRows = {};
    agentNodes = {};
    teamMembers = {};
    teamTasks = {};
    // 没有运行过程时把高度还给工作台会话列表（见 dsh-workbench.js 的 has-run 规则）。
    agentSpace.classList.remove('has-run');
    clearTimeout(agentReconcileTimer);
    agentReconcileTimer = 0;
    paintCluster();
    paintTeam();
    setSpaceAction('');
    spacePinned = false;
  }

  function setSpaceStatus(text, kind) {
    spaceStatus.textContent = text;
    agentSpace.classList.toggle('busy', kind === 'busy');
    agentSpace.classList.toggle('failed', kind === 'failed');
    agentSpace.classList.toggle('done', kind === 'done');
  }

  function openSpace() {
    positionSpace();
    if (!spaceVisible) {
      spaceVisible = true;
      agentSpace.classList.add('open');
      agentSpace.setAttribute('aria-hidden', 'false');
    }
    if (!spacePinned) spaceFeed.scrollTop = spaceFeed.scrollHeight;
    if (spaceExpanded) selectSpaceTab(spaceTab);
  }

  /* 紧凑态贴在右栏：钟的下沿到任务栏上沿之间。
     展开态是工作面，允许盖住钟，从菜单栏下沿一直到任务栏。
     位置用实测几何，软键盘压缩视口、页面缩放、钟被放大时都不会跑到屏幕外。 */
  function positionSpace() {
    const vp = viewport();
    const dock = parseFloat(getComputedStyle(root).getPropertyValue('--os-dock-h')) || 78;
    const bottom = Math.round(dock + 12);
    if (vp.width <= 760) {
      agentSpace.style.left = '8px';
      agentSpace.style.right = '8px';
      agentSpace.style.width = 'auto';
      agentSpace.style.bottom = `${Math.round(dock + 10)}px`;
      if (spaceExpanded) {
        agentSpace.style.top = '40px';
        agentSpace.style.height = 'auto';
      } else {
        agentSpace.style.top = 'auto';
        agentSpace.style.height = `${Math.round(Math.max(160, Math.min(420, vp.height * 0.46)))}px`;
      }
      return;
    }
    const clock = deskClock.getBoundingClientRect();
    const topLimit = Math.round(clock.bottom + 12);
    const usable = vp.height - bottom - topLimit;
    const width = spaceExpanded
      ? Math.round(Math.max(360, Math.min(520, vp.width - 44)))
      : Math.round(Math.max(220, Math.min(288, vp.width - 44)));
    agentSpace.style.left = 'auto';
    agentSpace.style.right = '22px';
    agentSpace.style.width = `${width}px`;
    agentSpace.style.bottom = `${bottom}px`;
    if (spaceExpanded) {
      // 工作面要放得下列表与表单：向上盖住钟，直到菜单栏下沿。
      agentSpace.style.top = '44px';
      agentSpace.style.height = 'auto';
      return;
    }
    if (usable >= 200) {
      agentSpace.style.top = `${topLimit}px`;
      agentSpace.style.height = 'auto';
    } else {
      // 钟把右栏占满时（软键盘、极小视口）：贴着任务栏浮起，仍在右侧。
      agentSpace.style.top = 'auto';
      agentSpace.style.height = `${Math.round(Math.max(180, Math.min(360, vp.height * 0.52)))}px`;
    }
  }

  function closeSpace() {
    spaceVisible = false;
    setSpaceExpanded(false);
    agentSpace.classList.remove('open');
    agentSpace.setAttribute('aria-hidden', 'true');
  }

  function toggleSpace() {
    if (spaceVisible) closeSpace(); else openSpace();
  }

  function mountRunCard(host) {
    if (host) {
      if (runCard.parentNode !== host) host.append(runCard);
      return;
    }
    if (runCard.parentNode !== spaceCompact) spaceCompact.insertBefore(runCard, spaceCompact.firstChild);
  }

  function setSpaceExpanded(on) {
    spaceExpanded = !!on;
    agentSpace.classList.toggle('expanded', spaceExpanded);
    // 展开的面板占的就是右上角钟那一栏：把钟收起，避免表盘从面板上沿露出来。
    root.classList.toggle('console-open', spaceExpanded);
    spaceExpandBtn.setAttribute('aria-expanded', spaceExpanded ? 'true' : 'false');
    spaceExpandBtn.title = spaceExpanded ? '收起操作面板' : '展开操作面板';
    if (spaceExpanded) selectSpaceTab(spaceTab);
    else mountRunCard(null);
    positionSpace();
  }

  // 桌面上的快捷入口只负责把状态空间展开到对应页，不再开独立应用。
  function openConsoleTab(tab) {
    openSpace();
    setSpaceExpanded(true);
    selectSpaceTab(tab);
    if (COARSE()) cmdInput.blur();
  }

  function newCommandSession() {
    if (cmdBusy) stopCommand();
    rotateCmdSession();
    clearSpace();
    setSpaceStatus('新会话');
    spaceRoute.textContent = '';
    setSpaceCmdHint('待命');
    stopCmdTimer();
    spaceTimer.textContent = '';
    if (spaceExpanded) selectSpaceTab('task');
    cmdInput.focus();
  }

  function setCmdBusy(on) {
    cmdBusy = on;
    cmdForm.classList.toggle('busy', on);
    spaceStopBtn.disabled = !on;
    spaceStopBtn.hidden = !on;
  }

  // 胶囊芯片只显示「这套运行时实际会用的模型」。magpie 不在时是 dsh 的直达模型。
  function setCmdRoute(text, title) {
    cmdChipLabel.textContent = text || '本机';
    cmdChip.title = title || text || '模型路由';
  }

  // API 模型 id 与用户认得的版本名是两套：deepseek-flash 就是 DeepSeek-V4.1-Flash-1017。
  const MODEL_LABELS = {
    'deepseek-flash': 'v4.1-flash10.17',
    'deepseek-v4-pro': 'v4-pro',
  };

  // 芯片窄，型号只留版本名（deepseek-flash → v4.1-flash10.17），完整值放 tooltip。
  function shortModel(model) {
    const raw = String(model || '');
    if (MODEL_LABELS[raw]) return MODEL_LABELS[raw];
    return raw.indexOf('deepseek-') === 0 ? raw.slice(9) : raw;
  }

  // ---------- 操作面：工作面（dsh 那张脸）+ 模型面（magpie） ----------
  // 与 dsh web 的信息架构对齐：任务 / 工作区 / 插件 / 自动化；记忆接关系图谱；
  // 模型面单独一页，网关不在时如实降级。展开后仍停留在桌面右栏，不开新窗。
  const SPACE_TABS = [
    { id: 'task', label: '任务', icon: 'tasks' },
    { id: 'workspace', label: '工作区', icon: 'folder' },
    { id: 'plugins', label: '插件', icon: 'apps' },
    { id: 'automation', label: '自动化', icon: 'system' },
    { id: 'memory', label: '记忆', icon: 'memory' },
    { id: 'route', label: '模型', icon: 'gear' },
  ];

  function buildRail() {
    clear(consoleRail);
    consoleRail.append(h('p', { class: 'os-rail-group' }, '工作面'));
    SPACE_TABS.forEach((tab) => {
      if (tab.id === 'route') return;
      consoleRail.append(h('button', {
        class: 'os-rail-btn', type: 'button', 'data-tab': tab.id, onclick: () => selectSpaceTab(tab.id),
      }, icon(tab.icon), h('span', { class: 'os-rail-label' }, tab.label)));
    });
    consoleRail.append(h('p', { class: 'os-rail-group' }, '模型面'));
    const routeTab = SPACE_TABS.filter((t) => t.id === 'route')[0];
    consoleRail.append(h('button', {
      class: 'os-rail-btn', type: 'button', 'data-tab': 'route', onclick: () => selectSpaceTab('route'),
    }, icon(routeTab.icon), h('span', { class: 'os-rail-label' }, routeTab.label)));
  }

  function selectSpaceTab(tab) {
    spaceTab = tab;
    const meta = SPACE_TABS.filter((t) => t.id === tab)[0] || SPACE_TABS[0];
    consoleTitle.textContent = meta.label;
    clear(consolePane);
    const buttons = consoleRail.querySelectorAll('.os-rail-btn');
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-active', buttons[i].getAttribute('data-tab') === tab);
    }
    if (tab === 'task') {
      mountRunCard(consolePane);
      consolePane.append(buildRuns());
      return;
    }
    mountRunCard(null);
    const cached = spaceCache[tab];
    if (cached && Date.now() - cached.at < 20000) {
      renderSection(tab, cached.data);
      return;
    }
    consolePane.append(h('p', { class: 'os-console-empty' }, '读取中…'));
    loadSection(tab, false);
  }

  function surfaceURL(tab) {
    if (tab === 'workspace') return `/agent/surface/workspace?path=${encodeURIComponent(wsPath)}`;
    if (tab === 'plugins') return '/agent/surface/plugins';
    if (tab === 'automation') return '/agent/surface/automation';
    if (tab === 'memory') return '/agent/surface/memory';
    if (tab === 'route') return '/agent/surface/route';
    return '';
  }

  function loadSection(tab, force) {
    const url = surfaceURL(tab);
    if (!url) return;
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
      if (!data) {
        if (spaceTab === tab) showSectionError('读不到数据');
        return;
      }
      spaceCache[tab] = { at: Date.now(), data };
      if (spaceTab === tab) renderSection(tab, data);
    };
    xhr.onerror = () => { if (spaceTab === tab) showSectionError('连接断开'); };
    xhr.send();
  }

  function reloadSection(force) {
    if (spaceTab === 'task') { selectSpaceTab('task'); return; }
    spaceCache[spaceTab] = null;
    clear(consolePane);
    consolePane.append(h('p', { class: 'os-console-empty' }, '读取中…'));
    loadSection(spaceTab, true);
  }

  function showSectionError(text) {
    clear(consolePane);
    consolePane.append(h('p', { class: 'os-console-empty' }, text));
  }

  function renderSection(tab, data) {
    clear(consolePane);
    if (tab === 'workspace') renderWorkspace(data);
    else if (tab === 'plugins') renderPlugins(data);
    else if (tab === 'automation') renderAutomation(data);
    else if (tab === 'memory') renderMemory(data);
    else if (tab === 'route') renderRoute(data);
  }

  function fmtSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function fmtWhen(sec) {
    let n = Number(sec) || 0;
    if (!n) return '';
    // 旧记录存的是毫秒，新记录存秒：两种都认。
    if (n > 1e12) n = Math.floor(n / 1000);
    const d = new Date(n * 1000);
    const pad = (x) => String(x).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtClock(sec) {
    const d = new Date(Number(sec) * 1000);
    const pad = (x) => String(x).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function joinPath(base, name) {
    if (!base) return name;
    return `${base.replace(/\/+$/, '')}/${name}`;
  }

  function parentPath(path) {
    const i = String(path).lastIndexOf('/');
    return i <= 0 ? '' : String(path).slice(0, i);
  }

  function consoleRow(name, sub, onclick) {
    return h('button', { class: 'os-console-row', type: 'button', onclick },
      h('span', { class: 'os-console-name' }, name),
      sub ? h('span', { class: 'os-console-sub' }, sub) : null);
  }

  function renderWorkspace(data) {
    const entries = data.entries || [];
    if (wsPath) {
      consolePane.append(h('button', {
        class: 'os-console-back', type: 'button',
        onclick: () => { wsPath = parentPath(wsPath); loadSection('workspace', true); },
      }, '← 上一级'));
    }
    consolePane.append(h('p', { class: 'os-console-note' }, wsPath ? `/${wsPath}` : (data.root || '工作区')));
    if (!entries.length) {
      consolePane.append(h('p', { class: 'os-console-empty' },
        data.error ? `工作区还不可读：${data.error}` : '工作区是空的。Agent 跑过之后，文件会出现在这里。'));
      return;
    }
    entries.forEach((e) => {
      consolePane.append(consoleRow(
        `${e.dir ? '▸ ' : ''}${e.name}`,
        `${e.dir ? '文件夹' : (e.kind || '文件')} · ${e.dir ? fmtWhen(e.mtime) : `${fmtSize(e.size)} · ${fmtWhen(e.mtime)}`}`,
        () => {
          if (e.dir) { wsPath = joinPath(wsPath, e.name); loadSection('workspace', true); return; }
          previewWorkspaceFile(e.name);
        },
      ));
    });
  }

  function previewWorkspaceFile(name) {
    const full = joinPath(wsPath, name);
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `/agent/surface/workspace/file?path=${encodeURIComponent(full)}`, true);
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
      clear(consolePane);
      consolePane.append(h('button', {
        class: 'os-console-back', type: 'button', onclick: () => reloadSection(true),
      }, '← 返回'));
      consolePane.append(h('b', { class: 'os-console-file' }, full));
      consolePane.append(h('pre', { class: 'os-console-pre' },
        data && data.text ? `${data.text}${data.truncated ? '\n' + t('…（已截断）') : ''}` : (data && data.error ? t(data.error) : t('读不到这个文件'))));
    };
    xhr.onerror = () => showSectionError('连接断开');
    xhr.send();
  }

  // 技能包：一个 zip，根目录（或一层同名目录）里放 SKILL.md。
  // 上传后直接出现在 dsh 的技能清单里，下一条命令就能用。
  function skillUploadBar() {
    const note = h('span', { class: 'os-skill-note' }, '');
    const input = h('input', { type: 'file', accept: '.zip,application/zip', class: 'os-skill-file' });
    const pick = h('button', {
      class: 'os-auto-btn is-run', type: 'button',
      onclick: () => { if (!uploading) input.click(); },
    }, '上传技能包 (.zip)');
    let uploading = false;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      uploading = true;
      pick.disabled = true;
      pick.textContent = '安装中…';
      note.textContent = file.name;
      note.classList.remove('is-error');
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/agent/surface/plugins/install', true);
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
        uploading = false;
        pick.disabled = false;
        pick.textContent = '上传技能包 (.zip)';
        input.value = '';
        if (!data || !data.ok) {
          note.textContent = (data && data.error) || '安装失败';
          note.classList.add('is-error');
          return;
        }
        spaceCache.plugins = { at: Date.now(), data };
        renderSection('plugins', data);
        toast(`${data.installed} 已安装`);
      };
      xhr.onerror = () => {
        uploading = false;
        pick.disabled = false;
        pick.textContent = '上传技能包 (.zip)';
        note.textContent = '连接断开';
        note.classList.add('is-error');
      };
      xhr.send(form);
    });
    return h('div', { class: 'os-skill-bar' },
      pick, input, note,
      h('span', { class: 'os-skill-hint' }, 'SKILL.md 放在 zip 根目录或一层同名目录里'));
  }

  function removeSkillBtn(skill) {
    const btn = h('button', { class: 'os-auto-btn is-del', type: 'button' }, '删除');
    let armed = false;
    let timer = 0;
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!armed) {
        armed = true;
        btn.textContent = '确认删除';
        timer = setTimeout(() => { armed = false; btn.textContent = '删除'; }, 4000);
        return;
      }
      clearTimeout(timer);
      btn.disabled = true;
      btn.textContent = '删除中…';
      postSurface('/agent/surface/plugins/remove', { name: skill.dir.split('/').pop() }, (res) => {
        if (res.ok) {
          spaceCache.plugins = { at: Date.now(), data: res };
          renderSection('plugins', res);
          toast(`${res.removed} 已删除`);
          return;
        }
        btn.disabled = false;
        btn.textContent = '删除';
        toast(res.error || '删除失败');
      });
    });
    return btn;
  }

  function renderPlugins(data) {
    const skills = data.skills || [];
    consolePane.append(h('p', { class: 'os-console-note' }, `${skills.length} 个技能 · ${data.root || ''}`));
    consolePane.append(skillUploadBar());
    if (!skills.length) {
      consolePane.append(h('p', { class: 'os-console-empty' }, '还没有安装技能。上传一个 .zip，或把技能目录放进 ~/.dsh/skills。'));
      return;
    }
    skills.forEach((s) => {
      consolePane.append(h('div', { class: 'os-skill-row' },
        consoleRow(s.name, s.description || s.dir, () => {
          consolePane.append(h('pre', { class: 'os-console-pre is-detail' }, `${s.name}\n\n${s.description || t('（没有说明）')}\n\n${s.dir}`));
        }),
        removeSkillBtn(s)));
    });
  }

  function postSurface(url, body, done) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
      done(data || { ok: false, error: '读不到返回' });
    };
    xhr.onerror = () => done({ ok: false, error: '连接断开' });
    xhr.send(JSON.stringify(body));
  }

  function postAutomation(body, done) {
    postSurface('/agent/surface/automation', body, done);
  }

  function renderAutomation(data) {
    const items = data.items || [];
    const now = Number(data.now) || Math.floor(Date.now() / 1000);
    consolePane.append(h('p', { class: 'os-console-note' }, '到点只提醒；点「运行」才交给 Agent，不静默花额度。'));
    if (!items.length) {
      consolePane.append(h('p', { class: 'os-console-empty' }, '还没有自动化任务。下面建一个：一句话 + 间隔。'));
    }
    items.forEach((it) => {
      const next = (Number(it.lastRun) || now) + (Number(it.every) || 60) * 60;
      const due = it.enabled && now >= next;
      const meta = `${it.every} 分钟 · ${it.enabled ? (due ? '到点' : `下次 ${fmtClock(next)}`) : '已暂停'}`;
      const card = h('div', { class: 'os-auto-card' },
        h('b', { class: 'os-auto-title' }, it.title),
        h('span', { class: 'os-auto-meta' }, meta),
        h('p', { class: 'os-auto-prompt' }, it.prompt),
        h('div', { class: 'os-auto-actions' },
          h('button', {
            class: 'os-auto-btn is-run', type: 'button',
            onclick: () => {
              postAutomation({ action: 'run', id: it.id }, () => {});
              runCommand(it.prompt);
            },
          }, '运行'),
          h('button', {
            class: 'os-auto-btn', type: 'button',
            onclick: () => postAutomation({ action: 'toggle', id: it.id }, (res) => {
              if (res.ok) { spaceCache.automation = { at: Date.now(), data: res }; renderSection('automation', res); }
            }),
          }, it.enabled ? '暂停' : '启用'),
          h('button', {
            class: 'os-auto-btn is-del', type: 'button',
            onclick: () => postAutomation({ action: 'delete', id: it.id }, (res) => {
              if (res.ok) { spaceCache.automation = { at: Date.now(), data: res }; renderSection('automation', res); }
            }),
          }, '删除')));
      consolePane.append(card);
    });

    const titleIn = h('input', { class: 'os-console-input', type: 'text', placeholder: '标题（可空）', autocomplete: 'off' });
    const promptIn = h('textarea', { class: 'os-console-input os-console-area', rows: '2', placeholder: '到点后交给 Agent 的一句话' });
    const everyIn = h('select', { class: 'os-console-input' },
      h('option', { value: '15' }, '每 15 分钟'),
      h('option', { value: '60', selected: 'selected' }, '每小时'),
      h('option', { value: '240' }, '每 4 小时'),
      h('option', { value: '1440' }, '每天'));
    const err = h('p', { class: 'os-console-error' }, '');
    consolePane.append(h('div', { class: 'os-auto-form' },
      h('b', { class: 'os-console-subhead' }, '新建自动化'),
      titleIn, promptIn, everyIn,
      h('button', {
        class: 'os-auto-btn is-run', type: 'button',
        onclick: () => {
          const prompt = promptIn.value.trim();
          if (!prompt) { err.textContent = '先写一句要执行的话。'; return; }
          err.textContent = '';
          postAutomation({ action: 'create', title: titleIn.value.trim(), prompt, every: Number(everyIn.value) }, (res) => {
            if (!res.ok) { err.textContent = res.error || '保存失败'; return; }
            spaceCache.automation = { at: Date.now(), data: res };
            renderSection('automation', res);
          });
        },
      }, '保存'),
      err));
  }

  function renderMemory(data) {
    consolePane.append(h('p', { class: 'os-console-note' }, `${data.total || 0} 篇笔记 · ${data.vault || '交换区还没有笔记'}`));
    const recent = data.recent || [];
    if (!recent.length) {
      consolePane.append(h('p', { class: 'os-console-empty' }, '记忆树还是空的。'));
      return;
    }
    recent.forEach((n) => {
      consolePane.append(consoleRow(n.name, `${n.rel} · ${fmtWhen(n.mtime)}`, () => {
        // 笔记只在 NexlOS 里看：拉起关系图谱，再让它选中这一篇。
        focusGraphNote(n.rel);
      }));
    });
  }

  function focusGraphNote(rel) {
    const app = apps.get('graph');
    if (!app) return;
    openApp(app);
    const rec = wins.get('graph');
    if (!rec || !rec.frame) return;
    // iframe 首帧之前发消息会被丢掉：轮询到文档 ready 再发一次。
    let tries = 40;
    const send = () => {
      const win = rec.frame && rec.frame.contentWindow;
      if (win && win.document && win.document.readyState === 'complete') {
        win.postMessage({ type: 'nexlos.graph.focus', path: rel }, location.origin);
        return;
      }
      if (tries-- > 0) setTimeout(send, 100);
    };
    send();
  }

  function renderRoute(data) {
    const on = !!data.gateway;
    consolePane.append(h('p', { class: on ? 'os-console-badge is-on' : 'os-console-badge' },
      on ? `magpie 在线 · ${data.url}` : `magpie 未运行 · ${data.url || ''}`));
    if (!on) {
      consolePane.append(h('p', { class: 'os-console-note' }, data.hint || '网关不在时命令走本机 dsh 直达。'));
      consolePane.append(h('button', {
        class: 'os-console-row', type: 'button',
        onclick: () => window.open('https://github.com/yetone/magpie', '_blank', 'noopener'),
      }, h('span', { class: 'os-console-name' }, '安装 magpie'), h('span', { class: 'os-console-sub' }, 'go install github.com/yetone/magpie@latest')));
    }
    const dsh = data.dsh || {};
    consolePane.append(h('p', { class: 'os-console-subhead' }, '本机运行时'));
    consolePane.append(consoleRow(`${dsh.provider || 'dsh'} · ${dsh.model || ''}`, dsh.workspace || '', null));
    if (on && (data.models || []).length) {
      consolePane.append(h('p', { class: 'os-console-subhead' }, '网关模型'));
      data.models.forEach((m) => consolePane.append(consoleRow(m, '', null)));
    }
  }

  // 最近任务：只存在本机，用来回填命令栏，不合并进会话正文。
  function loadRuns() {
    try {
      const raw = localStorage.getItem(`${CMD_STORE}runs`);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function pushRun(entry) {
    const list = loadRuns();
    list.unshift(entry);
    try { localStorage.setItem(`${CMD_STORE}runs`, JSON.stringify(list.slice(0, 20))); } catch (e) { /* 配额满就只留内存 */ }
  }

  function buildRuns() {
    const list = loadRuns();
    const box = h('div', { class: 'os-console-runs' }, h('p', { class: 'os-console-subhead' }, '最近任务'));
    runsBox = box;
    if (!list.length) {
      box.append(h('p', { class: 'os-console-empty' }, '还没有跑过任务。'));
      return box;
    }
    list.slice(0, 10).forEach((r) => {
      box.append(consoleRow(r.text, `${r.ok ? '完成' : '失败'} · ${r.secs}s · ${fmtWhen(r.at)}`, () => {
        cmdInput.value = r.text;
        cmdInput.focus();
      }));
    });
    return box;
  }

  function startCmdTimer() {
    stopCmdTimer();
    cmdTimer = setInterval(() => {
      if (!cmdBusy) return;
      spaceTimer.textContent = `${((Date.now() - cmdStartedAt) / 1000).toFixed(1)}s`;
    }, 500);
  }

  function stopCmdTimer() {
    if (cmdTimer) clearInterval(cmdTimer);
    cmdTimer = null;
  }

  function toggleCmdMenu() {
    if (cmdMenuOpen) { closeCmdMenu(); return; }
    cmdMenuOpen = true;
    renderCmdMenu();
    cmdMenu.hidden = false;
    cmdMenuOpen = true;
    cmdChip.setAttribute('aria-expanded', 'true');
    const pill = cmdForm.getBoundingClientRect();
    cmdMenu.style.left = `${Math.max(8, Math.round(pill.left))}px`;
    cmdMenu.style.bottom = `${Math.round(window.innerHeight - pill.top + 8)}px`;
    document.addEventListener('pointerdown', onCmdMenuOutside, true);
  }

  function onCmdMenuOutside(e) {
    if (cmdMenu.contains(e.target) || cmdChip.contains(e.target)) return;
    closeCmdMenu();
  }

  function closeCmdMenu() {
    if (!cmdMenuOpen) return;
    cmdMenuOpen = false;
    cmdMenu.hidden = true;
    cmdChip.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onCmdMenuOutside, true);
  }

  function renderCmdMenu() {
    clear(cmdMenu);
    const byok = cmdRouteInfo ? cmdRouteInfo.byok : null;
    const byokOn = !!(cmdRouteInfo && cmdRouteInfo.byokActive);
    cmdMenu.append(
      h('p', { class: 'os-cmd-menu-head' }, '模型路由'),
      h('div', { class: 'os-cmd-menu-row is-current' },
        h('span', { class: 'os-cmd-menu-name' }, cmdChipLabel.textContent || '本机'),
        h('span', { class: 'os-cmd-menu-tag' }, '当前')));
    if (byokOn && byok) {
      cmdMenu.append(h('div', { class: 'os-cmd-menu-row' },
        h('span', { class: 'os-cmd-menu-name' }, byok.modelName || byok.model || '自带模型'),
        h('span', { class: 'os-cmd-menu-tag' }, '自带')));
    }
    cmdMenu.append(
      h('button', {
        class: 'os-cmd-menu-action', type: 'button',
        onclick: () => {
          closeCmdMenu();
          openByok({
            onSaved: (data) => {
              probeRoute();
              // 旧版耐久服务不支持热切换时会带回提醒：如实说，不假装已完全生效。
              if (data && data.warning) toast(data.warning, { ms: 6000 });
              else toast(byokOn ? '自带模型已更新' : '已接入自带模型');
            },
          });
        },
      }, byokOn ? '管理自带模型…' : '接入自己的模型…'),
      h('p', { class: 'os-cmd-menu-note' }, '用你的账号直连服务商，密钥只存本机，不经过第三方网关。'));
  }

  // 路由芯片开局就读一次状态：不拉起 dsh 进程，只问内核现在用哪条路由。
  function probeRoute() {
    const status = new XMLHttpRequest();
    status.open('GET', '/agent/status', true);
    status.onload = () => {
      try {
        const info = JSON.parse(status.responseText);
        cmdRouteInfo = info;
        if (info.available === false) {
          setCmdRoute('未装 dsh', '没有找到 DeepSeek Harness');
          return;
        }
        // DSH 在，但模型运行时或模型选择没就绪：按服务端给的四态显示，不冒充可用。
        if (info.readyState === 'unknown') {
          setCmdRoute('状态未知', '读不到模型目录');
          return;
        }
        if (info.readyState === 'degraded') {
          setCmdRoute('未选模型', '宿主没有默认模型');
          return;
        }
        if (info.ready === false) {
          setCmdRoute('未就绪', '模型服务未就绪');
          return;
        }
        setCmdRoute(shortModel(info.model) || '本机', `${info.provider || 'dsh'} · ${info.model || ''}`);
        // 状态空间头部说明「现在用的是哪条运行时路由」，与 magpie 的模型面分开显示。
        if (!cmdBusy) spaceRoute.textContent = `${info.provider || 'dsh'} · ${info.model || ''}`;
      } catch (e) { /* 状态读不到不影响命令 */ }
    };
    status.send();
  }

  // 首次聚焦输入框再唤醒 dsh：命令栏常驻，不必开机就拉起 Node 进程。
  function warmCommand() {
    if (cmdWarmed) return;
    cmdWarmed = true;
    probeRoute();
    const warm = new XMLHttpRequest();
    warm.open('POST', '/agent/warm', true);
    warm.setRequestHeader('Content-Type', 'application/json');
    warm.send('{}');
  }

  probeRoute();
  buildRail();

  function stopCommand() {
    if (!cmdBusy || cmdStopping) return;
    cmdStopping = true;
    setSpaceStatus('停止中…');
    stopCmdTimer();
    if (companion) companion.signal('idle');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/agent/stop', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send('{}');
    if (cmdXhr) { try { cmdXhr.abort(); } catch (e) { /* 已结束 */ } }
    spaceStep('error', '用户停止', '停止');
    setCmdBusy(false);
    setSpaceStatus('已停止');
    setSpaceAction('已停止');
  }

  // 一行一个 JSON 的流：只处理完整行，半行留到下一次 progress（Chrome 72 没有 fetch 流）。
  function commandPost(url, body, onEvent, onDone) {
    const xhr = new XMLHttpRequest();
    let seen = 0;
    let buf = '';
    const drain = () => {
      const text = xhr.responseText || '';
      if (text.length <= seen) return;
      buf += text.slice(seen);
      seen = text.length;
      let idx = buf.indexOf('\n');
      while (idx >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) {
          let ev = null;
          try { ev = JSON.parse(line); } catch (e) { ev = null; }
          if (ev) onEvent(ev);
        }
        idx = buf.indexOf('\n');
      }
    };
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onprogress = drain;
    xhr.onload = () => {
      if (xhr.status !== 200) {
        let msg = 'Agent 通道不可用';
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) { /* 非 JSON 错误体 */ }
        onDone(msg);
        return;
      }
      drain();
      onDone('');
    };
    xhr.onerror = () => onDone('与 Agent 的连接断开');
    xhr.onabort = () => onDone('已取消');
    xhr.send(JSON.stringify(body));
    return xhr;
  }

  // 外壳自己能办的事不进模型：省一次冷启动，也让 / 动词可预期。
  function runLocalVerb(text) {
    const m = /^\/(\S+)\s*([\s\S]*)$/.exec(text);
    if (!m) return false;
    const verb = m[1].toLowerCase();
    const rest = m[2].trim();
    if (verb === 'stop') { stopCommand(); return true; }
    if (verb === 'clear') { clearSpace(); setSpaceStatus('空闲'); return true; }
    // 命令入口已经先 openSpace()；这里再 toggle 会把刚开的面板关掉。
    if (verb === 'space') { openSpace(); return true; }
    if (verb === 'close') { closeSpace(); return true; }
    if (verb === 'panel') { openConsoleTab('task'); return true; }
    if (verb === 'quota') {
      openSpace();
      spaceStep('info', '未接 magpie 网关：额度由 dsh 直连的厂商账号决定。', '额度');
      return true;
    }
    if (verb === 'open') {
      openSpace();
      const key = rest.toLowerCase();
      let hit = null;
      for (const app of apps.values()) {
        if (app && app.name && app.name.toLowerCase().indexOf(key) >= 0) { hit = app; break; }
      }
      if (!hit) { spaceStep('error', `没有找到应用：${rest || '（空）'}`, '打开'); return true; }
      spaceStep('info', `打开 ${hit.name}`, '打开');
      openApp(hit);
      return true;
    }
    if (verb === 'help') {
      openSpace();
      spaceStep('info', '/panel 展开状态空间 · /space 运行序列 · /open 应用名 · /clear 清空 · /stop 停止 · /quota 额度', '帮助');
      return true;
    }
    return false;
  }

  function runCommand(forced) {
    // 自动化与「最近任务」可以带一句话直接开跑；表单提交传的是事件对象，不能当文本。
    const preset = typeof forced === 'string' ? forced : '';
    const text = (preset || cmdInput.value).trim();
    if (!text) return;
    if (!preset) { cmdInput.value = ''; syncCmdFill(); }
    // 触屏上先收起键盘：状态空间要占的是键盘刚让出来的那块地方。
    if (COARSE()) cmdInput.blur();
    // 千禧主题沿用原来的入口：命令栏只负责打开「查找」对话框。
    if (prefs.appearance === 'win98') { toggleStart(true, true); return; }
    openSpace();
    if (runLocalVerb(text)) return;
    if (cmdBusy) {
      // 回车与表单提交可能各触发一次；同一条命令在运行中重复提交直接忽略。
      if (text === runningText) return;
      spaceStep('error', '上一轮还在运行：先停止，或在状态空间里等它结束。', '忙');
      return;
    }
    runningText = text;
    pushCmdHistory(text);
    clearSpace();
    // 一次运行的过程（运行卡 + 子代理）优先占高度，工作台列表让位。
    agentSpace.classList.add('has-run');
    setSpaceCmdText(text);
    spaceCmdText.title = text;
    spaceRoute.textContent = cmdChipLabel.textContent === '本机' ? '' : `→ ${cmdChipLabel.textContent}`;
    setCmdBusy(true);
    setSpaceStatus('运行中', 'busy');
    if (companion) companion.signal('thinking');
    cmdStopping = false;
    cmdStartedAt = Date.now();
    spaceTimer.textContent = '0.0s';
    startCmdTimer();
    runErrored = false;
    runReason = '';
    runReport = '';
    runText = text;
    // 桌面输入框直接进 dsh：工作区就是 ~/.nexlos/agent-workspace，会话线程由本地 id 续接。
    cmdXhr = commandPost('/agent/chat', { sessionId: cmdSession(), text }, onCommandEvent, onCommandEnd);
  }

  // 一轮运行的状态放在闭包里：正常命令与「接管还在跑的运行」共用同一套收尾。
  let runErrored = false;
  let runReason = '';
  let runReport = '';
  let runText = '';

  function onCommandEvent(ev) {
    if (ev.type === 'status') {
      if (ev.phase === 'resume') {
        spaceStep('info', '这条运行在后台继续过，已接管它的过程', '接管');
        setSpaceStatus('已接管', 'busy');
      } else if (ev.phase === 'wake') {
        setSpaceStatus('唤醒运行时…', 'busy');
        setSpaceAction('唤醒 dsh 运行时', 'busy');
        spaceStep('info', 'dsh 未就绪，正在冷启动', '唤醒');
      } else if (ev.phase === 'running' || ev.phase === 'sent') {
        setSpaceStatus('运行中', 'busy');
        setSpaceAction('思考中', 'busy');
        if (companion) companion.signal('working');
      }
    } else if (ev.type === 'tool') {
      if (ev.phase === 'result') {
        addToolResult(ev);
        setSpaceAction('处理工具结果', 'busy');
      } else {
        addToolCall(ev);
        setSpaceAction(`${toolLabel(ev.text)}${argSummary(ev.detail) ? ' · ' + argSummary(ev.detail) : ''}`, 'busy');
      }
      // 工具调用是「正在执行」的强信号；结果回来后回到持续工作态。
      if (companion) companion.signal(ev.phase === 'result' ? 'working' : 'executing');
      setSpaceStatus('运行中', 'busy');
    } else if (ev.type === 'team') {
      handleTeam(ev);
    } else if (ev.type === 'agents') {
      applyAgentRoster(ev.agents);
    } else if (ev.type === 'subagent') {
      handleSubagent(ev);
      setSpaceAction(ev.phase === 'end' ? '子代理已交付' : '子代理工作中', 'busy');
      setSpaceStatus('运行中', 'busy');
      // 多个子代理并行时演 juggling，优先级高于普通 working。
      if (companion) companion.signal(ev.phase === 'end' ? 'working' : 'juggling');
    } else if (ev.type === 'approval') {
      if (ev.phase === 'asked') {
        spaceStep('ask', `${toolLabel(ev.text)}：${ev.detail || '这一步需要授权'}`, '授权');
        setSpaceAction('等待授权', 'blocked');
        if (companion) companion.signal('attention');
      } else {
        const outcome = ev.text === 'approved' ? '已允许' : ev.text === 'rejected' ? '已拒绝' : '授权已处理';
        spaceStep('info', outcome, '授权');
        setSpaceAction('继续处理', 'busy');
        if (companion) companion.signal('working');
      }
    } else if (ev.type === 'assistant') {
      addAnswer(String(ev.text || ''));
      setSpaceAction('整理结论', 'busy');
      if (companion) companion.signal('working');
    } else if (ev.type === 'error') {
      runErrored = true;
      spaceStep('error', String(ev.text || '未知错误'), '错误');
      setSpaceStatus('出错', 'failed');
      setSpaceAction('运行出错', 'failed');
      if (companion) { companion.signal('error'); companion.signal('settle'); }
    } else if (ev.type === 'done') {
      runReason = ev.reason || '';
      runReport = ev.detail || '';
      finishCommand({ errored: runErrored, reason: runReason, text: runText, report: runReport });
    }
  }

  function onCommandEnd(err) {
    if (cmdStopping) { cmdStopping = false; setCmdBusy(false); setSpaceStatus('已停止'); return; }
    if (err) {
      spaceStep('error', err, '连接');
      setSpaceStatus('连接失败', 'failed');
      finishCommand({ errored: true, reason: 'error', text: runText, report: runReport, notifyUser: true });
    } else if (cmdBusy) {
      finishCommand({ errored: runErrored, reason: runReason || 'done', text: runText, report: runReport });
    }
  }

  // 上次关窗或 NexlOS 重启前还在跑的运行：从 sidecar 接回来，不依赖 localStorage。
  function resumeRunning() {
    fetch('/agent/run/current', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((r) => {
        if (!r || !r.running || cmdBusy) return;
        openSpace();
        clearSpace();
        agentSpace.classList.add('has-run');
        setSpaceCmdHint('接回上一次运行');
        spaceCmdText.title = r.commandId || '';
        spaceRoute.textContent = '';
        setCmdBusy(true);
        cmdStopping = false;
        cmdStartedAt = Date.now();
        spaceTimer.textContent = '0.0s';
        startCmdTimer();
        setSpaceStatus('已接管', 'busy');
        setSpaceAction('接回后台任务', 'busy');
        cmdXhr = commandPost('/agent/attach', { taskId: r.taskId, sessionId: cmdSession() }, onCommandEvent, onCommandEnd);
      })
      .catch(() => { /* 没有耐久通道时静默跳过 */ });
  }

  // 收尾路径的断点标记：页面卡住时，新开一页读 localStorage 就能知道停在哪一步。
  function trace(step) {
    try { localStorage.setItem('nexlos.trace', `${step} @${Date.now()}`); } catch (e) { /* 忽略 */ }
  }

  function finishCommand(state) {
    trace('finish:start');
    if (!cmdBusy) return;
    setCmdBusy(false);
    // 本轮工作结束：清掉 working/executing，让完成/失败的一次性动作演完回 idle。
    if (companion) companion.signal('settle');
    stopCmdTimer();
    const secs = ((Date.now() - cmdStartedAt) / 1000).toFixed(1);
    spaceTimer.textContent = `${secs}s`;
    const ok = !state.errored && state.reason !== 'error' && state.reason !== 'timeout';
    trace('finish:pushRun');
    pushRun({ text: state.text, at: Math.floor(Date.now() / 1000), secs: Number(secs), ok });
    trace('finish:runs');
    // 「最近任务」在任务页底部；跑完就地换掉这一段，不重排整张状态空间。
    if (runsBox && runsBox.parentNode) {
      const old = runsBox;
      const host = old.parentNode;
      host.replaceChild(buildRuns(), old);
    }
    trace('finish:runsDone');
    if (state.reason === 'stopped') {
      setSpaceStatus('已停止');
      setSpaceAction('已停止');
      return;
    }
    // 收尾块：结果 + 动作数 + 用时 + 看报告，一个入口把这段运行交代清楚。
    trace('finish:outcome');
    addOutcome(ok, secs, state.report);
    trace('finish:outcomeDone');
    const openIt = state.report ? () => openReport(state.report) : null;
    if (!ok) {
      playClassicSound('chord');
      setSpaceStatus(state.reason === 'timeout' ? '超时' : '失败', 'failed');
      setSpaceAction('失败', 'failed');
      notify('命令失败', `${state.text.slice(0, 60)} · ${secs}s`, { report: state.report });
      toast(state.report ? `失败 · ${secs}s · 点开看汇报` : `命令失败 · ${secs}s`, { corner: true, onclick: openIt });
      return;
    }
    // 子代理是持久会话：主代理这一轮结束不代表它们结束。这里如实标注，
    // 不让「完成」掩盖仍在后台跑的成员。
    const pending = Object.keys(agentNodes).filter((id) => {
      const el = agentNodes[id].el;
      return !el.classList.contains('is-done') && !el.classList.contains('is-error');
    });
    if (pending.length) {
      pending.forEach((id) => {
        agentNodes[id].parked = true;
        agentNodes[id].meta.textContent = '后台继续';
      });
      paintCluster();
      // 主代理收尾但子代理还在跑：伴侣继续演多线程，而不是假装全部结束。
      if (companion) companion.signal('juggling');
      spaceStep('info', `${pending.length} 个子代理仍在后台运行；本轮汇报只覆盖主代理的这一步。`, '子代理');
      reconcileAgents();
    }
    setSpaceStatus(`完成 · ${secs}s`, 'done');
    setSpaceAction('完成', 'done');
    playClassicSound('chimes');
    const first = (cmdAnswerText || '').replace(/\s+/g, ' ').trim();
    const summary = first ? `${first.slice(0, 80)}${first.length > 80 ? '…' : ''}` : `用时 ${secs}s`;
    trace('finish:notify');
    notify('命令完成', `${state.text.slice(0, 40)} · ${summary}`, { report: state.report });
    trace('finish:toast');
    toast(state.report ? `完成 · ${secs}s · 点开看汇报` : `完成 · ${secs}s · ${summary}`, {
      corner: true, ms: 3800, onclick: openIt,
    });
    // 只有成功的收尾才是一次“把活干完”；询问本身不阻塞收尾。
    void maybeAskForStar();
    trace('finish:end');
  }

  function addOutcome(ok, secs, report) {
    const tools = Object.keys(toolRows).length;
    const failures = spaceFeed.querySelectorAll('.os-line.is-error').length;
    const bits = [ok ? '完成' : '失败', `${tools} 项动作`];
    if (failures) bits.push(`${failures} 处失败`);
    bits.push(`${secs}s`);
    const link = report
      ? h('button', { class: 'os-outcome-link', type: 'button', onclick: () => openReport(report) }, '看报告')
      : null;
    spaceFeed.append(h('footer', { class: 'os-outcome ' + (ok ? 'is-done' : 'is-failed') },
      h('span', { class: 'os-outcome-mark' }, ok ? '■' : '▲'),
      h('span', { class: 'os-outcome-text' }, bits.join(' · ')),
      link));
    spaceAutoScroll();
  }

  // ---------- 运行汇报：Markdown 阅读层 ----------
  // 通知栏只放一行摘要；点开读的是真实落盘的 .md，内容与状态空间同源。
  const reportOverlay = h('div', {
    class: 'os-report', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': '运行汇报',
  });

  function closeReport() {
    reportOverlay.hidden = true;
    clear(reportOverlay);
  }

  function openReport(rel) {
    if (!rel) return;
    reportOverlay.hidden = false;
    clear(reportOverlay);
    const body = h('div', { class: 'os-report-body' }, h('p', { class: 'os-report-loading' }, '正在读取汇报…'));
    const card = h('section', { class: 'os-report-card' },
      h('header', { class: 'os-report-head' },
        h('div', { class: 'os-report-title' },
          h('b', {}, '运行汇报'),
          h('span', {}, rel)),
        h('button', {
          class: 'os-report-close', type: 'button', title: '关闭', 'aria-label': '关闭',
          onclick: () => closeReport(),
        }, '×')),
      body);
    reportOverlay.append(card);
    fetch('/agent/surface/workspace/file?path=' + encodeURIComponent(rel))
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || '读取失败');
        clear(body);
        body.append(mdBlocks(d.text || ''));
      })
      .catch((e) => {
        clear(body);
        body.append(h('p', { class: 'os-report-error' }, e.message));
      });
  }

  // 只渲染汇报需要的 Markdown：标题、列表、代码块、引用、粗体与行内代码。
  function mdInline(text) {
    const frag = document.createDocumentFragment();
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.append(document.createTextNode(text.slice(last, m.index)));
      const tok = m[0];
      if (tok.slice(0, 2) === '**') {
        frag.append(h('strong', {}, tok.slice(2, -2)));
      } else if (tok.charAt(0) === '`') {
        frag.append(h('code', {}, tok.slice(1, -1)));
      } else {
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
        if (link && /^https?:\/\//i.test(link[2])) {
          frag.append(h('a', { href: link[2], target: '_blank', rel: 'noopener' }, link[1]));
        } else {
          frag.append(document.createTextNode(link ? link[1] : tok));
        }
      }
      last = m.index + tok.length;
    }
    if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
    return frag;
  }

  function mdBlocks(text) {
    const box = h('div', { class: 'os-report-md' });
    const lines = String(text || '').split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        const lang = line.slice(3).trim();
        const buf = [];
        i += 1;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i += 1; }
        i += 1;
        box.append(h('pre', { class: 'os-report-code' }, h('code', { 'data-lang': lang }, buf.join('\n'))));
        continue;
      }
      if (/^#{1,3} /.test(line)) {
        const level = Math.min(3, line.match(/^#+/)[0].length);
        const text2 = line.replace(/^#{1,3} /, '');
        box.append(h(`h${level}`, {}, mdInline(text2)));
        i += 1;
        continue;
      }
      if (/^[-*] /.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*] /.test(lines[i])) {
          items.push(h('li', {}, mdInline(lines[i].slice(2))));
          i += 1;
        }
        box.append(h('ul', {}, items));
        continue;
      }
      if (/^\d+\. /.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) {
          items.push(h('li', {}, mdInline(lines[i].replace(/^\d+\. /, ''))));
          i += 1;
        }
        box.append(h('ol', {}, items));
        continue;
      }
      if (/^> /.test(line)) {
        const buf = [];
        while (i < lines.length && /^> /.test(lines[i])) { buf.push(lines[i].slice(2)); i += 1; }
        box.append(h('blockquote', {}, mdInline(buf.join(' '))));
        continue;
      }
      if (/^---+$/.test(line.trim())) {
        box.append(h('hr'));
        i += 1;
        continue;
      }
      if (!line.trim()) { i += 1; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,3} |[-*] |\d+\. |> |---+$)/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      box.append(h('p', {}, mdInline(buf.join(' '))));
    }
    return box;
  }

  reportOverlay.addEventListener('click', (e) => {
    // 点遮罩关闭；点卡片内部不关闭。
    if (e.target === reportOverlay) closeReport();
  });

  // 全屏时胶囊藏在屏幕外；底边这条 8px 感应带负责把它叫回来。
  const dockHot = h('div', { class: 'os-dock-hot', 'aria-hidden': 'true' });
  let dockHideTimer = 0;
  const hideDockSoon = () => {
    clearTimeout(dockHideTimer);
    dockHideTimer = setTimeout(() => root.classList.remove('os-dock-peek'), 180);
  };
  dockHot.addEventListener('pointerenter', () => {
    clearTimeout(dockHideTimer);
    root.classList.add('os-dock-peek');
  });
  dockHot.addEventListener('pointerleave', hideDockSoon);
  taskbar.addEventListener('pointerenter', () => clearTimeout(dockHideTimer));
  taskbar.addEventListener('pointerleave', hideDockSoon);

  root.append(wallpaper, desktop, windowsLayer, startMenu, agentSpace, taskbar, dockHot, ctxMenu,
    taskView, tvLabels, switcher, clockPop, trayPop, notifyPop, reportOverlay, wallInput);
  // 便利贴住在窗口层之上、任务栏之下：永远浮在应用窗口上，又不挡底栏。
  // 它不参加窗口会话恢复，内容与位置都从「文稿/便利贴」里的文件读回来。
  const stickies = createStickyLayer(root, {
    onError: (e) => toast(`便利贴未保存：${e.message}`),
    onNotify: (msg) => toast(msg),
    openOffice: (id) => openOfficeDoc(id),
    onState: () => paintTaskbar(),
  });
  // 上次退出时应用还开着，就把纸按原位置、颜色、内容贴回来；关掉过的不打扰桌面。
  if (stickies.wasOpen()) stickies.openApp();
  // 桌面伴侣住在窗口之上、任务栏之下：透明区域不挡点击，角色身体上才接管指针。
  companion = createCompanionLayer({ mount: root, api, toast });
  // 验收钩子：自动化用它读表演状态、触发指定状态；不新增任何行为。
  window.__nexlosCompanion = {
    status: () => (companion ? companion.status() : null),
    signal: (kind) => { if (companion) companion.signal(kind); },
  };
  host.append(root);
  document.body.classList.add('os-mode');

  // 桌面右键：系统级菜单，补上取消菜单栏后缺少的入口。
  desktop.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.os-icon')) return;
    e.preventDefault();
    if (prefs.appearance === 'win98') { showClassicDesktopContext(e.clientX, e.clientY); return; }
    showCtx(e.clientX, e.clientY, desktopMenuItems());
  });

  // 任务栏空白处的右键菜单：Windows 的肌肉记忆入口。
  taskbar.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.os-tb-app')) return;
    e.preventDefault();
    showCtx(e.clientX, e.clientY, [
      ['系统面板', () => openApp(apps.get('system'))],
      ['显示桌面', () => { for (const [id, rec] of wins) if (!rec.minimized) minimizeWin(id); }],
      ['任务栏设置', () => openApp(apps.get('settings'))],
    ]);
  });

  // 点空白处取消图标选中，和桌面系统的习惯一致。
  desktop.addEventListener('click', (e) => {
    // 框选松手后浏览器还会补一个 click，不能让它把刚选中的图标清掉。
    if (deskDragged) { deskDragged = false; return; }
    if (e.target.closest('.os-icon')) return;
    if (deskSel.size) { deskSel.clear(); paintDeskSel(); }
  });

  // ---------- 桌面框选：左键拖拽画圈 ----------
  // 只处理鼠标主键；触屏没有悬停，保留点按与长按逻辑。
  let deskBand = null;
  let deskDragged = false;

  function deskBandUpdate() {
    const d = desktop.getBoundingClientRect();
    const l = Math.min(deskBand.x0, deskBand.x) - d.left;
    const t = Math.min(deskBand.y0, deskBand.y) - d.top;
    const w = Math.abs(deskBand.x - deskBand.x0);
    const hgt = Math.abs(deskBand.y - deskBand.y0);
    deskMarquee.style.left = l + 'px';
    deskMarquee.style.top = t + 'px';
    deskMarquee.style.width = w + 'px';
    deskMarquee.style.height = hgt + 'px';
    const x1 = l;
    const x2 = l + w;
    const y1 = t;
    const y2 = t + hgt;
    deskSel.clear();
    for (const k of deskBand.base) deskSel.add(k);
    for (const el of iconLayer.children) {
      const r = el.getBoundingClientRect();
      const a = r.left - d.left;
      const b = r.right - d.left;
      const c = r.top - d.top;
      const e2 = r.bottom - d.top;
      if (a < x2 && b > x1 && c < y2 && e2 > y1) deskSel.add(el.dataset.app);
    }
    paintDeskSel();
  }

  desktop.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return;
    if (e.target.closest('.os-icon, .os-deskclock')) return;
    deskDragged = false;
    const add = e.metaKey || e.ctrlKey;
    deskBand = {
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      base: add ? new Set(deskSel) : new Set(),
      id: e.pointerId, moved: false,
    };
    if (!add && deskSel.size) { deskSel.clear(); paintDeskSel(); }
  });

  desktop.addEventListener('pointermove', (e) => {
    if (!deskBand || e.pointerId !== deskBand.id) return;
    if (!deskBand.moved) {
      if (Math.abs(e.clientX - deskBand.x0) < 4 && Math.abs(e.clientY - deskBand.y0) < 4) return;
      deskBand.moved = true;
      deskMarquee.hidden = false;
      try { desktop.setPointerCapture(e.pointerId); } catch (err) { /* 老内核不支持捕获 */ }
    }
    deskBand.x = e.clientX;
    deskBand.y = e.clientY;
    deskBandUpdate();
  });

  function deskBandEnd() {
    if (!deskBand) return;
    if (deskBand.moved) {
      deskDragged = true;
      // 松手落在图标上时，图标自己的 click 会把框选改成单选；吞掉这一次 click。
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 0);
    }
    deskBand = null;
    deskMarquee.hidden = true;
  }
  desktop.addEventListener('pointerup', deskBandEnd);
  desktop.addEventListener('pointercancel', deskBandEnd);

  // 双击桌面：窗口全部收边 / 全部展开。仿海南浏览器的拍立得相片：
  // 双击把窗口推到最近的边，只露一条边；再双击恢复。触屏没有可靠的 dblclick，
  // 所以另做 400ms / 25px 的双击检测，并让随后的 dblclick 不重复触发。
  let deskTapAt = 0;
  let deskTapX = 0;
  let deskTapY = 0;
  let lastTuckToggle = 0;
  function deskDoubleTap(x, y) {
    const now = Date.now();
    const dx = Math.abs(x - deskTapX);
    const dy = Math.abs(y - deskTapY);
    if (dx > 25 || dy > 25) {
      deskTapAt = now;
    } else if (now - deskTapAt < 400) {
      deskTapAt = 0;
      lastTuckToggle = now;
      toggleTuckAll();
    } else {
      deskTapAt = now;
    }
    deskTapX = x;
    deskTapY = y;
  }
  desktop.addEventListener('dblclick', (e) => {
    if (e.target.closest('.os-icon')) return;
    if (Date.now() - lastTuckToggle < 500) return;
    toggleTuckAll();
  });
  desktop.addEventListener('touchend', (e) => {
    if (e.target.closest('.os-icon')) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (t) deskDoubleTap(t.clientX, t.clientY);
  }, { passive: true });

  document.addEventListener('pointerdown', onDocPointer);
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);

  // visualViewport 比 window.resize 更早、更准地报告软键盘与地址栏变化。
  viewportWatcher = watchViewport(onResize);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flushSession);
  window.addEventListener('blur', cancelSwitcher);

  function decorate(raw) {
    const merged = { ...raw };
    const w = merged.window || {};
    return {
      ...merged,
      internal: merged.kind === 'internal',
      native: merged.kind === 'native',
      icon: merged.icon || merged.id,
      window: {
        width: w.width || 1100,
        height: w.height || 720,
        minWidth: w.minWidth || 680,
        minHeight: w.minHeight || 480,
      },
      route: merged.route || (merged.id === 'shelf' ? '#/shelf' : merged.id === 'system' ? '#/system' : ''),
      dock: merged.dock !== false,
      desktop: merged.desktop !== false,
    };
  }

  // 任务栏与桌面入口都由清单派生，不再单独维护两个 id 数组。
  function dockApps() {
    return [...apps.values()].filter((app) => app.dock).map((app) => app.id);
  }

  // 桌面只留“此电脑”：其余应用都能从左下角开始菜单进入，桌面保持干净。
  // 应用清单仍保留 desktop 字段，后续要放回桌面只改这一处白名单。
  const DESKTOP_PINNED = new Set(['pc']);
  const CLASSIC_DESKTOP_PINNED = new Set(['pc', 'shelf', 'memory', 'minesweeper', 'settings']);
  function desktopApps() {
    const pinned = prefs.appearance === 'win98' ? CLASSIC_DESKTOP_PINNED : DESKTOP_PINNED;
    const visible = [...apps.values()].filter((app) => app.desktop && pinned.has(app.id));
    if (prefs.appearance === 'win98' && classicIconOrder !== 'default') visible.sort((a, b) => {
      if (classicIconOrder === 'type' && a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return t(a.name).localeCompare(t(b.name), getLanguage());
    });
    return visible.map(app => app.id);
  }

  function statusOf(app) {
    const rec = wins.get(app.id);
    if (rec) return rec.minimized ? '已最小化' : '运行中';
    if (app.id === 'sticky' && stickies.isOpen()) return stickies.isVisible() ? '运行中' : '已最小化';
    return app.statusLabel || app.status || '';
  }

  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function isRunning(id) {
    const app = apps.get(id);
    return wins.has(id) || (app && app.status === 'running') || (id === 'sticky' && stickies.isOpen());
  }

  function paintClock() {
    const d = new Date();
    // 手动拼时间：Chrome 72 的 toLocaleTimeString 在部分 Android 机型上不带“上午/下午”。
    // 走 formatTime 的 locale 映射，时间与日期的数字体系保持一致（阿语两端都用本地数字）。
    const time = formatTime(d, { hour12: !prefs.clock24 });
    const date = formatDate(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (taskbarClock) {
      taskbarClockTime.textContent = time;
      taskbarClockDate.textContent = date;
      taskbarClock.title = formatDate(d, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    }
  }

  // ---------- 桌面图标 ----------

  // 只切 class，不重建 DOM：框选时每帧都要调用。
  function paintDeskSel() {
    for (const el of iconLayer.children) {
      const on = deskSel.has(el.dataset.app);
      if (on !== el.classList.contains('selected')) el.classList.toggle('selected', on);
    }
  }

  function renderIcons() {
    clear(iconLayer);
    for (const id of desktopApps()) {
      const app = apps.get(id);
      if (!app) continue;
      const running = isRunning(id);
      const button = h('button', {
        class: `os-icon${deskSel.has(id) ? ' selected' : ''}${running ? ' running' : ''}`,
        dataset: { app: id },
        title: app.description || app.name,
        onclick: (e) => {
          if (e.metaKey || e.ctrlKey) {
            if (deskSel.has(id)) deskSel.delete(id); else deskSel.add(id);
          } else {
            deskSel.clear();
            deskSel.add(id);
          }
          paintDeskSel();
          if (COARSE()) openApp(app);
        },
        ondblclick: () => openApp(app),
        onkeydown: (e) => { if (e.key === 'Enter') openApp(app); },
        oncontextmenu: (e) => {
          e.preventDefault();
          showCtx(e.clientX, e.clientY, [
            ['打开', () => openApp(app)],
            ['系统面板', () => openApp(apps.get('system'))],
            ['应用说明', () => toast(app.description || app.name)],
          ]);
        },
      },
      h('span', { class: 'os-icon-art' }, appIcon(app.id)),
      h('span', { class: 'os-icon-label' }, app.name),
      h('span', { class: 'os-icon-dot' }));
      iconLayer.append(button);
    }
  }

  // ---------- 任务栏 ----------

  let taskbarClock = null;
  let taskbarClockTime = null;
  let taskbarClockDate = null;

  function renderTaskbar() {
    hidePeekNow();
    clear(taskbar);
    taskbarClock = null;

    // Win10 任务栏：任务视图孤悬左侧，开始 + 搜索 + 应用居中，托盘与时钟靠右。
    const left = h('div', { class: 'os-tb-left' },
      h('button', {
        class: 'os-tb-btn os-tb-view', type: 'button', title: '任务视图', 'aria-label': '任务视图',
        onclick: () => toggleTaskView(),
      }, icon('taskview')));

    const center = h('div', { class: 'os-tb-center' });
    // 「开始」换成 NEXL 底栏同源的情绪球：球的按压、拖拽、回弹、呼吸与眨眼
    // 全部来自 ./orb.js；区别只在点开后展开 NexlOS 的「全部应用」面板。
    const startBtn = h('button', {
      class: 'os-tb-btn os-tb-start', type: 'button', title: '开始（F4 / Ctrl+Esc）', 'aria-label': '开始',
      'aria-expanded': startOpen ? 'true' : 'false', 'aria-haspopup': 'true',
      onclick: () => startOrb.click(),
      // 悬停就开始预拍：点击时快照已经在原生缓存里，开始菜单不必等一次捕获。
      onmouseenter: () => { if (window.__nexlosWarm) window.__nexlosWarm(); },
      onfocus: () => { if (window.__nexlosWarm) window.__nexlosWarm(); },
      oncontextmenu: (e) => { e.preventDefault(); toggleStart(true); },
    }, h('span', { class: 'os-tb-flag' },
      h('span', { class: 'nexlos-modern-icon' },
        h('span', { class: 'os-orb', role: 'presentation' },
          h('span', { class: 'os-orb-face', 'aria-hidden': 'true' }))),
      h('span', { class: 'nexlos-classic-icon' }, pixelIcon('start', 16))),
      h('span', { class: 'os-classic-start-label' }, '开始'));
    center.append(startBtn);

    // 任务栏胶囊就是命令面：左边芯片选模型路由，右边一句话直接执行。
    // 没有聊天框；一次运行的过程开在右栏状态空间，结果落到右下角回执。
    center.append(cmdForm);
    // 菜单挂在 .os 内部：面板与文字用 --nx-* token，亮/暗偏好才能跟着切换。
    root.append(cmdMenu);

    const quick = h('div', { class: 'os-classic-quicklaunch', 'aria-label': '快速启动' });
    quick.append(h('button', {
      class: 'os-classic-quickbtn', type: 'button', title: '显示桌面', 'aria-label': '显示桌面',
      onclick: () => { for (const id of wins.keys()) minimizeWin(id); },
    }, pixelIcon('pc', 16)));
    for (const id of ['shelf', 'settings']) {
      const app = apps.get(id);
      if (app) quick.append(h('button', {
        class: 'os-classic-quickbtn', type: 'button', title: app.name, 'aria-label': `快速打开${app.name}`,
        onclick: () => openApp(apps.get(id)),
      }, pixelIcon(id, 16)));
    }
    center.append(quick);

    for (const id of dockApps()) {
      const app = apps.get(id);
      if (!app) continue;
      const rec = wins.get(id);
      const stickyApp = id === 'sticky';
      const stickyOpen = stickyApp && stickies.isOpen();
      const running = !!rec || stickyOpen;
      const btn = h('button', {
        class: `os-tb-btn os-tb-app${running ? ' running' : ''}${(stickyApp ? stickyOpen && stickies.isVisible() : activeId === id) ? ' active' : ''}`,
        type: 'button', title: `${app.name} · ${statusOf(app)}`, dataset: { app: id },
        onclick: () => {
          // 便利贴没有窗口：开着时按钮负责隐藏/显示，关着时打开应用。
          if (stickyApp) {
            if (!stickies.isOpen()) stickies.openApp({ create: true });
            else if (!stickies.count()) stickies.newNote();
            else stickies.toggleVisible();
            return;
          }
          const rec = wins.get(id);
          if (!rec) { openApp(app); return; }
          if (rec.minimized) { restoreWin(id); return; }
          if (activeId === id) minimizeWin(id);
          else focusWin(id);
        },
        oncontextmenu: (e) => {
          e.preventDefault();
          if (stickyApp) {
            if (!stickies.isOpen()) { stickies.openApp({ create: true }); return; }
            showCtx(e.clientX, e.clientY, [
              ['新建便利贴', () => stickies.newNote()],
              [stickies.isVisible() ? '隐藏全部便利贴' : '显示全部便利贴', () => stickies.toggleVisible()],
              ['关闭应用（便利贴保留）', () => stickies.closeApp()],
            ]);
            return;
          }
          const rec = wins.get(id);
          if (!rec) { openApp(app); return; }
          showCtx(e.clientX, e.clientY, [
            [rec.minimized ? '还原' : '最小化', () => (rec.minimized ? restoreWin(id) : minimizeWin(id))],
            ['关闭窗口', () => closeWin(id)],
          ]);
        },
      }, h('span', { class: 'os-tb-art' }, appIcon(app.id)),
      h('span', { class: 'os-tb-app-label' }, app.name), h('span', { class: 'os-tb-dot' }));
      // 悬停出预览卡：这是“这台电脑有窗口在跑”的最直接证据。
      // 便利贴没有窗口，不给窗口预览，避免一张假截图。
      if (!stickyApp && !COARSE()) {
        btn.addEventListener('pointerenter', () => showPeek(id, btn));
        btn.addEventListener('pointerleave', () => scheduleHidePeek());
      }
      center.append(btn);
    }

    taskbarClockTime = h('span', { class: 'os-tb-time' });
    taskbarClockDate = h('span', { class: 'os-tb-date' });
    taskbarClock = h('button', {
      class: 'os-tb-clock', type: 'button', title: '日期和时间',
      // 单击即开：经典主题弹出「日期/时间 属性」，现代主题展开日历。
      // 双击的第二次按下也走同一条路径，由 toggleClockPop 内部去重。
      onclick: () => toggleClockPop(),
    }, taskbarClockTime, taskbarClockDate);
    const trayButton = (name, title, ...kids) => h('button', {
      class: 'os-tb-tray', type: 'button', title, dataset: { tray: name },
      // Windos2026的托盘继续只做状态展示，避免改动另一位工程师负责的外观。
      onclick: () => { if (prefs.appearance === 'win98') return; toggleTrayPop(); },
    }, ...kids);

    const right = h('div', { class: 'os-tb-right' },
      // 托盘图标本身就是入口：Windows 里点网络/音量/电池会弹出快速设置。
      trayButton('wifi', '网络与快速设置', icon('wifi')),
      trayButton('volume', '音量与快速设置', icon('volume')),
      trayButton('battery', '电池与快速设置', icon('battery'), h('i', { class: 'os-tb-battery' }, '—')),
      taskbarClock,
      // Windos2026保留旧行为（铃铛打开日历）；现代主题打开真正的通知中心。
      h('button', {
        class: 'os-tb-traybtn os-tb-bell', type: 'button', title: '通知中心',
        onclick: () => (prefs.appearance === 'win98' ? toggleClockPop() : toggleNotifyPop()),
      }, icon('bell')),
      h('button', {
        class: 'os-tb-showdesk', type: 'button', title: '显示桌面',
        onclick: () => { for (const id of wins.keys()) minimizeWin(id); },
      }));

    // 现代主题把“任务视图 + 开始 + 搜索 + 应用”包成一块浮空玻璃胶囊；
    // Windos2026用 display:contents 让这层容器透明，保留原来的平铺任务栏。
    const main = h('div', { class: 'os-tb-main' }, left, center);

    taskbar.append(main, right);
    startOrb.mount(startBtn, {
      isOpen: () => startOpen,
      onToggle: (force) => toggleStart(force),
      // 液面要量胶囊与面板，任务栏每次重绘都把新节点交回去。
      taskbar: taskbar,
      main: main,
      panel: startPanel,
    });
    paintAppearanceToggle();
    paintClock();
    paintBell();
    syncBattery();
    paintTaskbar();
  }

  function paintTaskbar() {
    for (const btn of taskbar.querySelectorAll('[data-app]')) {
      const id = btn.dataset.app;
      const rec = wins.get(id);
      const stickyOpen = id === 'sticky' && stickies.isOpen();
      // 任务栏只承载“已最小化”的窗口。便利贴没有窗口，规则同样按最小化算：
      // 纸贴在桌面上时不占底栏，点最小化收起后才出现图标。
      const show = id === 'sticky'
        ? stickyOpen && !stickies.isVisible()
        : !!(rec && (prefs.appearance === 'win98' || rec.minimized));
      btn.style.display = show ? '' : 'none';
      btn.classList.toggle('running', !!(rec || stickyOpen));
      if (id === 'sticky') {
        btn.classList.toggle('active', stickyOpen && stickies.isVisible());
        btn.title = `便利贴 · ${stickyOpen ? (stickies.isVisible() ? '运行中' : '已最小化') : '未运行'}`;
      } else {
        btn.classList.toggle('active', id === activeId);
      }
      btn.classList.toggle('suspended', !!(rec && rec.suspended));
    }
  }

  let batteryRef = null;
  function paintBattery() {
    const el = taskbar.querySelector('.os-tb-battery');
    if (el && batteryRef) el.textContent = `${Math.round(batteryRef.level * 100)}%`;
    // 快速设置开着时同步百分比，不让面板里的电量停在打开那一刻。
    if (!trayPop.hidden) renderTrayPop();
  }
  function syncBattery() {
    if (batteryRef) { paintBattery(); return; }
    if (!navigator.getBattery) return;
    navigator.getBattery().then((b) => {
      batteryRef = b;
      b.addEventListener('levelchange', paintBattery);
      paintBattery();
    }).catch(() => { /* 不支持时保留占位 */ });
  }

  // ---------- 开始菜单 ----------

  let startSig = '';

  // 情绪球点开的面板是「临时状态」：2 秒内没有手势就自己合上，
  // 不把桌面一直占着。鼠标移动、滚轮、键盘输入都会重新计时。
  const START_IDLE_MS = 2000;
  let startIdleTimer = 0;

  function armStartIdle() {
    clearTimeout(startIdleTimer);
    startIdleTimer = setTimeout(() => {
      if (startOpen) closeStart();
    }, START_IDLE_MS);
  }

  function clearStartIdle() {
    clearTimeout(startIdleTimer);
    startIdleTimer = 0;
  }

  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'input']) {
    startMenu.addEventListener(ev, () => { if (startOpen) armStartIdle(); }, { passive: true });
  }

  function renderStartGrid(force) {
    const q = startSearch.value.trim().toLowerCase();
    const recent = readRecentApps();
    // 顺序跟着 app.list 走（和桌面、任务栏一致）；“系统”是维护者面板，不占开始菜单。
    const all = [...apps.values()].filter((app) => {
      if (app.id === 'system') return false;
      if (!q) return true;
      return [app.id, app.name, app.description || '', app.category || '', t(app.name), t(app.description || ''), t(app.category || '')].join(' ').toLowerCase().includes(q);
    });
    // 打开开始菜单时重复重建会带来一次 100ms 级的首次绘制；内容没变就直接复用。
    const sig = `${q}|${[...apps.keys()].join(',')}|${[...wins.keys()].join(',')}|${recent.join(',')}`;
    if (!force && sig === startSig) return;
    startSig = sig;

    clear(startGrid);
    if (!all.length) {
      startGrid.append(h('p', { class: 'os-start-empty' }, '没有匹配的应用'));
    } else {
      for (const app of all) {
        startGrid.append(h('button', {
          class: `os-start-app${isRunning(app.id) ? ' running' : ''}`,
          dataset: { app: app.id }, type: 'button',
          onclick: () => { closeStart(); openApp(app); },
        },
        h('span', { class: 'os-start-art' }, appIcon(app.id)),
        h('span', { class: 'os-start-name' }, app.name),
        h('span', { class: 'os-start-dot' })));
      }
    }
    syncStartFocus();
    clear(startRecent);
    const recents = recent.map((id) => apps.get(id)).filter(Boolean).slice(0, 4);
    if (!recents.length) {
      startRecent.append(h('p', { class: 'os-start-empty' }, '打开过的应用会出现在这里'));
    } else {
      for (const app of recents) {
        startRecent.append(h('button', {
          class: 'os-start-recent-item', type: 'button', onclick: () => { closeStart(); openApp(app); },
        }, h('span', { class: 'os-start-recent-art' }, appIcon(app.id)),
        h('span', {}, h('b', {}, app.name), h('i', {}, app.description || '')),
        icon('chevron')));
      }
    }
  }

  // 面板靠透明度隐藏，DOM 一直在；把看不见的控件移出 Tab 序列，键盘焦点不会落进关闭的菜单。
  function syncStartFocus() {
    startMenu.setAttribute('aria-hidden', startOpen ? 'false' : 'true');
    const items = startPanel.querySelectorAll('button, input, a');
    for (const el of items) {
      if (startOpen && prefs.appearance !== 'win98') el.removeAttribute('tabindex');
      else el.tabIndex = -1;
    }
  }

  function toggleStart(force, focusSearch) {
    const next = force == null ? !startOpen : force;
    if (next) {
      if (prefs.appearance === 'win98') playClassicSound('click');
      closeCtx();
      cancelSwitcher();
      closeClockPop();
      closeTrayPop();
      closeCmdMenu();
      hidePeekNow();
      renderStartGrid();
      const now = new Date();
      startHeroDate.textContent = formatDate(now, { month: 'long', day: 'numeric', weekday: 'short' });
      // 强制一次布局再切类：背景标签页里 rAF 会被节流，同步 reflow 更可靠。
      void startMenu.offsetWidth;
      startOpen = true;
      startMenu.classList.add('open');
      syncStartFocus();
      startOrb.setOpen(true);
      // 现代主题的球面板是临时状态，2 秒不动就收起；经典开始菜单要留到用户选完，
      // 否则看菜单超过两秒它会自己消失。
      if (prefs.appearance !== 'win98') armStartIdle();
      if (prefs.appearance === 'win98') {
        if (focusSearch) showClassicDialog('find');
        else classicStart.open({ focus: true });
      } else if (focusSearch) setTimeout(() => startSearch.focus(), 60);
    } else {
      closeStart();
    }
    pulse('start.toggle', { open: next }, 'start');
  }

  function closeStart() {
    if (!startOpen) return;
    startOpen = false;
    clearStartIdle();
    startMenu.classList.remove('open');
    classicStart.close();
    syncStartFocus();
    startSearch.value = '';
    startOrb.setOpen(false);
  }

  // 启动阶段（还在开机遮罩下面）先真实显示一帧面板，让浏览器把整块内容栅格化。
  // 之后每次打开只切 class，走合成器，不再付首帧绘制的钱。
  function warmStartPanel() {
    startMenu.classList.add('open');
    void startMenu.offsetWidth;
    requestAnimationFrame(() => {
      if (!startOpen) startMenu.classList.remove('open');
    });
  }

  // 经典属性表可以拖表头移动：第一次按下时把居中布局钉成视口坐标，
  // 之后整框跟指针走。标题栏至少留 48px 在视口内，拖丢了也抓得回来。
  function wireDialogDrag(box, bar) {
    let drag = null;
    function move(e) {
      if (!drag) return;
      const left = Math.max(48 - drag.width, Math.min(drag.left + e.clientX - drag.x, window.innerWidth - 48));
      const top = Math.max(0, Math.min(drag.top + e.clientY - drag.y, window.innerHeight - 32));
      box.style.left = Math.round(left) + 'px';
      box.style.top = Math.round(top) + 'px';
    }
    function end() {
      drag = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    }
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const rect = box.getBoundingClientRect();
      // 图层是居中的 flex 容器；固定定位后拖动不会和居中互相拉扯。
      box.style.position = 'fixed';
      box.style.margin = '0';
      box.style.left = Math.round(rect.left) + 'px';
      box.style.top = Math.round(rect.top) + 'px';
      drag = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, width: rect.width };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      try { bar.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有真实指针，忽略 */ }
      e.preventDefault();
    });
  }

  // A small application launcher, not a host-shell command runner. Menu entries
  // invoke the same app registry and lifecycle as the existing desktop.
  function showClassicDialog(mode) {
    closeStart();
    if (classicDialog) classicDialog.close();
    const previousFocus = document.activeElement;
    const title = mode === 'sounds' ? classicSoundsTitle() : mode === 'datetime' ? classicDateTimeTitle() : mode === 'shutdown' ? '关闭 Windos2026' : mode === 'about' ? '关于 Windos2026' : (mode === 'find' ? '查找应用' : '运行');
    const layer = h('div', { class: 'c98-dialog-layer' });
    const box = h('section', { class: 'c98-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    let contentController = null;
    const close = () => {
      if (contentController) { contentController.destroy(); contentController = null; }
      layer.remove();
      classicDialog = null;
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    };
    const x = h('button', { class: 'c98-dialog-close', type: 'button', 'aria-label': '关闭对话框', onclick: close }, '×');
    const titleBar = h('header', { class: 'c98-dialog-title' }, h('strong', {}, title), x);
    box.append(titleBar);
    const body = h('div', { class: 'c98-dialog-body' });
    if (mode === 'sounds') {
      box.classList.add('c98-dialog-sounds');
      box.append(body);
      contentController = mountClassicSounds(body, { onClose: close, onTitle: value => {
        box.querySelector('strong').textContent = value;
        box.setAttribute('aria-label', value);
        x.setAttribute('aria-label', t('关闭对话框'));
      } });
    } else if (mode === 'datetime') {
      box.classList.add('c98-dialog-date');
      box.append(body);
      contentController = mountClassicDateTime(body, { onClose: close, clock24: prefs.clock24, onTitle: value => {
        box.querySelector('strong').textContent = value;
        box.setAttribute('aria-label', value);
        x.setAttribute('aria-label', t('关闭对话框'));
      } });
    } else if (mode === 'shutdown') {
      const restart = h('input', { type: 'radio', name: 'c98-power', value: 'restart', checked: true });
      const shut = h('input', { type: 'radio', name: 'c98-power', value: 'close' });
      body.append(pixelIcon('pc', 32), h('p', {}, '你希望桌面执行什么操作？'),
        h('label', { class: 'c98-power-choice' }, restart, h('span', {}, '重新启动桌面')),
        h('label', { class: 'c98-power-choice' }, shut, h('span', {}, '关闭桌面')));
      box.append(body, h('footer', { class: 'c98-dialog-actions' },
        h('button', { class: 'c98-button default', type: 'button', onclick: () => {
          const restartSelected = restart.checked;
          close();
          if (restartSelected) replayClassicStartup(); else showClassicPowerOff();
        } }, '确定'), h('button', { class: 'c98-button', type: 'button', onclick: close }, '取消')));
    } else if (mode === 'about') {
      body.append(pixelIcon('pc', 32), h('b', {}, 'NexlOS · Windos2026'),
        h('p', {}, '熟悉的经典桌面，继续你的创作。'),
        h('p', {}, 'F4 或 Ctrl+Esc 打开开始菜单（macOS 的 F4 归启动台，用 Ctrl+Esc）；Alt+Tab 切换窗口；Ctrl / ⌘ + S 保存正文。'),
        h('p', {}, '主题、背景与配色可以在“设置 → 个性化”中切换。'));
      box.append(body, h('footer', { class: 'c98-dialog-actions' }, h('button', { class: 'c98-button default', type: 'button', onclick: close }, '确定')));
    } else {
      const input = h('input', { type: 'text', autocomplete: 'off', 'aria-label': '应用名称', placeholder: '例如：此电脑、书房、设置' });
      const results = h('div', { class: 'c98-run-results', 'aria-label': '匹配的应用' });
      const note = h('p', { class: 'c98-dialog-note', role: 'status' }, '输入名称，打开 NexlOS 中的应用。');
      function matchingApps() {
        const q = input.value.trim().toLowerCase();
        return [...apps.values()].filter(app => app.id !== 'system' && (!q || `${app.name} ${app.id} ${t(app.name)}`.toLowerCase().includes(q)));
      }
      function launch(app) { close(); openApp(app); }
      const run = () => {
        const matches = matchingApps();
        if (matches.length) launch(matches[0]);
        else { note.textContent = '没有找到这个应用，请检查名称。'; input.focus(); }
      };
      function paintResults() {
        clear(results);
        const matches = matchingApps();
        for (const app of matches) results.append(h('button', {
          class: 'c98-result', type: 'button', onclick: () => launch(app),
        }, pixelIcon(app.id, 16), h('span', {}, app.name)));
        if (!matches.length) results.append(h('p', { class: 'c98-dialog-note' }, '没有匹配的应用'));
      }
      input.addEventListener('input', paintResults);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
      body.append(h('label', { class: 'c98-field' }, h('span', {}, mode === 'find' ? '查找：' : '打开：'), input), note, results);
      box.append(body, h('footer', { class: 'c98-dialog-actions' },
        h('button', { class: 'c98-button default', type: 'button', onclick: run }, '打开'),
        h('button', { class: 'c98-button', type: 'button', onclick: close }, '取消')));
      paintResults();
      requestAnimationFrame(() => input.focus());
    }
    layer.append(box);
    root.append(layer);
    wireDialogDrag(box, titleBar);
    classicDialog = { close, mode };
    layer.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.altKey && e.key === 'F4') { e.preventDefault(); close(); return; }
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Enter' && ['about', 'shutdown'].includes(mode) && e.target.tagName !== 'BUTTON') {
        e.preventDefault(); box.querySelector('.default').click(); return;
      }
      if (e.key !== 'Tab') return;
      const controls = [...box.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter(el => el.tabIndex !== -1 && el.getClientRects().length);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    if (mode === 'about' || mode === 'shutdown') requestAnimationFrame(() => { if (layer.isConnected) box.querySelector('.default').focus(); });
    if (mode === 'datetime' || mode === 'sounds') requestAnimationFrame(() => {
      if (!layer.isConnected) return;
      const first = body.querySelector('input:not(:disabled),select:not(:disabled),button:not(:disabled)');
      if (first) first.focus();
    });
  }

  // ---------- 右键菜单 ----------

  // 桌面右键主体；星标入口固定在最底部，跳转成功后撤掉。
  function desktopMenuItems() {
    const items = [
      ['刷新应用状态', () => refreshApps(true)],
      ['新建便利贴', () => stickies.newNote()],
      ['显示设置', () => openApp(apps.get('settings'))],
      ['个性化', () => openApp(apps.get('settings'))],
      ['切换 NEXL现代 / Windos2026', () => toggleAppearance()],
      ['更换壁纸…', () => wallInput.click()],
      ['恢复默认壁纸', () => resetWallpaper()],
      ['窗口收边 / 展开', () => toggleTuckAll()],
      ['快捷键', () => toast('⌘/Ctrl+W 关闭 · ⌘/Ctrl+M 最小化 · ⌘/Ctrl+←/→ 半屏 · ⌘/Ctrl+↑ 最大化 · ⌘/Ctrl+↓ 还原 · Alt+Tab 切换 · F4 / Ctrl+Esc 开始菜单')],
      ['重置桌面布局', () => resetDesktop()],
      ['重新载入桌面', () => location.reload()],
    ];
    const star = starMenuEntry();
    if (star) items.push(star);
    return items;
  }

  function starMenuEntry() {
    if (prefs.starOpened) return null;
    return ['在 GitHub 上点星标', openStarPage];
  }

  async function openStarPage() {
    if (await starOpen()) {
      prefs.starOpened = true;
      return;
    }
    toast('打不开项目主页');
  }

  function showCtx(x, y, items) {
    closeStart();
    if (prefs.appearance === 'win98') {
      playClassicSound('click');
      classicContext.show(x, y, items.map(item => Array.isArray(item) ? { label: item[0], action: item[1], disabled: item[2] === false } : item));
      broadcastChrome();
      return;
    }
    clear(ctxMenu);
    for (const [label, action, enabled] of items) {
      ctxMenu.append(h('button', {
        class: 'os-ctx-item', type: 'button', disabled: enabled === false,
        onclick: () => { closeCtx(); action(); },
      }, label));
    }
    ctxMenu.hidden = false;
    // 先量尺寸再夹回视口，避免菜单贴着右/下边缘被截断。
    const r = ctxMenu.getBoundingClientRect();
    ctxMenu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    ctxMenu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
    broadcastChrome();
  }

  function closeCtx() {
    classicContext.close();
    ctxMenu.hidden = true;
    clear(ctxMenu);
    broadcastChrome();
  }

  function showClassicDesktopContext(x, y) {
    const order = value => {
      classicIconOrder = value;
      try { localStorage.setItem('nexlos.os.classic.icon-order', value); } catch (e) { /* Keep the current session order. */ }
      renderIcons();
    };
    const items = [
      { label: '排列图标', key: 'i', items: [
        { label: '按名称', key: 'n', checked: classicIconOrder === 'name', action: () => order('name') },
        { label: '按类型', key: 't', checked: classicIconOrder === 'type', action: () => order('type') },
        { separator: true },
        { label: '自动排列', key: 'a', checked: true, disabled: true },
      ] },
      { label: '对齐图标', key: 'u', action: () => renderIcons() },
      { label: '刷新', key: 'e', shortcut: 'F5', action: () => refreshApps(true) },
      { separator: true },
      { label: '粘贴', key: 'p', shortcut: 'Ctrl+V', disabled: true },
      { label: '粘贴快捷方式', key: 's', disabled: true },
      { separator: true },
      { label: '新建', key: 'w', items: [
        { label: '文件夹…', key: 'f', action: () => createDesktopFile(true) },
        { label: '文本文档…', key: 't', action: () => createDesktopFile(false) },
      ] },
      { separator: true },
      { label: '属性', key: 'r', shortcut: 'Alt+Enter', action: () => openApp(apps.get('settings')) },
      { separator: true },
      { label: '个性化', key: 'o', action: openPersonalization },
      { label: '声音…', key: 's', action: () => showClassicDialog('sounds') },
      { label: '切换为 NEXL现代主题', key: 'm', action: toggleAppearance },
    ];
    const star = starMenuEntry();
    if (star) items.push({ label: star[0], key: 'g', action: star[1] });
    showCtx(x, y, items);
  }

  async function openPersonalization() {
    await openApp(apps.get('settings'));
    const rec = wins.get('settings');
    if (!rec) return;
    rec.settingsPage = 'personal';
    if (rec.frame && rec.frame.contentWindow) rec.frame.contentWindow.postMessage({ type: 'nexlos.settings.page', page: 'personal' }, location.origin);
  }

  async function createDesktopFile(folder) {
    const name = window.prompt(t('名称'), t(folder ? '新建文件夹' : '新建文本文档.txt'));
    if (name === null) return;
    if (!name.trim() || name === '.' || name === '..' || /[/\\<>:"|?*\x00-\x1f]/.test(name)) { toast('名称包含不支持的字符'); return; }
    try {
      const listing = await api('fs.list', { query: { path: '/' } });
      const entries = Array.isArray(listing.append) ? listing.append : [];
      if (entries.some(entry => entry.name.toLowerCase() === name.toLowerCase())) { toast('已经有同名的项目'); return; }
      if (folder) await api('fs.mkdir', { method: 'POST', fields: { path: '/', name } });
      else await api('fs.write', { method: 'POST', fields: { path: '/' + name, text: '', createOnly: true } });
      await openApp(apps.get('pc'));
      const rec = wins.get('pc');
      if (rec && rec.frame) rec.frame.contentWindow.postMessage({ type: 'nexlos.fs.refresh', path: '/' }, location.origin);
      toast('已创建');
    } catch (e) { toast(e.message); }
  }

  function showClassicWindowContext(rec, x, y) {
    showCtx(x, y, [
      { label: '还原', key: 'r', disabled: !rec.maximized && !rec.minimized && !rec.tucked, action: () => {
        if (rec.minimized) restoreWin(rec.id);
        else if (rec.tucked) restoreTuck(rec);
        else toggleMax(rec.id, false);
      } },
      { label: '移动', key: 'm', disabled: rec.maximized, action: () => keyboardAdjustWindow(rec, false) },
      { label: '大小', key: 's', disabled: rec.maximized, action: () => keyboardAdjustWindow(rec, true) },
      { label: '最小化', key: 'n', action: () => minimizeWin(rec.id) },
      { label: '最大化', key: 'x', disabled: rec.maximized, action: () => toggleMax(rec.id, true) },
      { separator: true },
      { label: '关闭', key: 'c', shortcut: 'Alt+F4', action: () => closeWin(rec.id) },
    ]);
  }

  let stopKeyboardAdjust = null;
  function keyboardAdjustWindow(rec, resize) {
    if (stopKeyboardAdjust) stopKeyboardAdjust(false);
    if (rec.maximized || rec.minimized) return;
    const original = rectOf(rec);
    rec.bar.tabIndex = -1;
    rec.bar.focus();
    const finish = cancel => {
      document.removeEventListener('keydown', adjust, true);
      document.removeEventListener('pointerdown', commit, true);
      stopKeyboardAdjust = null;
      if (cancel) applyRect(rec, original);
      rec.normal = rectOf(rec); saveRect(rec);
    };
    const commit = () => finish(false);
    const adjust = event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape' || event.key === 'Enter') { finish(event.key === 'Escape'); return; }
      const step = event.shiftKey ? 1 : 8;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      const current = rectOf(rec);
      applyRect(rec, resize ? resizeRect(current, dx, dy, 'se', rec.app.window, viewport()) : { ...current, ...dragRect(current, dx, dy, viewport()) });
    };
    stopKeyboardAdjust = finish;
    document.addEventListener('keydown', adjust, true);
    document.addEventListener('pointerdown', commit, true);
  }

  // ---------- 系统级浮层：任务视图、任务栏预览、日历 ----------

  let peekEl = null;
  let peekTimer = 0;

  function switchIds() {
    return stack.filter((id) => wins.has(id));
  }

  // 任务视窗：与 Alt+Tab 的画廊不同，它把每个窗口直接铺满整块屏幕。
  // 窗口本体只改 transform，iframe 不搬家，所以看到的是活页面而不是截图。
  function toggleTaskView() {
    if (taskViewOn) { closeTaskView(true); return; }
    openTaskView();
  }

  function openTaskView() {
    if (taskViewOn) return;
    if (switchState) cancelSwitcher();
    if (startOpen) closeStart();
    hidePeekNow();
    const ids = switchIds();
    // 便利贴不挂在窗口层里，任务视图要单独把它收进拼图。
    const noteRecs = stickies.isVisible() ? stickies.items() : [];
    if (!ids.length && !noteRecs.length) { toast('还没有打开的窗口'); return; }
    const vp = viewport();
    const items = ids.map((id) => {
      const rec = wins.get(id);
      // 收边窗口的布局盒只有一条边，先临时恢复原尺寸才能量出完整预览。
      const savedRect = rec.tucked ? rectOf(rec) : null;
      if (rec.tucked && rec.tucked.normal) applyRect(rec, fitRect(rec.tucked.normal, vp));
      // 最小化窗口平时 display:none，进任务视窗前先让它参与布局。
      if (rec.minimized) rec.el.classList.add('tv-live');
      return { kind: 'window', rec, el: rec.el, wasMin: rec.minimized, savedRect, wasTucked: !!rec.tucked };
    });
    for (const rec of noteRecs) {
      items.push({ kind: 'sticky', rec, el: rec.el });
    }
    taskViewOn = true;
    root.classList.add('os-taskview-on');
    taskView.hidden = false;
    tvLabels.hidden = false;
    // 先通知再缩窗口：原生页面收起来需要一轮往返，等动画开始才发，
    // 旧页面会以原尺寸在屏幕上多停一两帧。
    for (const rec of wins.values()) postChrome(rec);
    // 进入时先清掉可能残留的 FLIP 变换，再按纯布局盒测量。
    // 收边便利贴的位移写在 transform 上，先清掉才能量到纸本来所在的位置。
    for (const it of items) {
      it.el.style.transition = 'none';
      it.el.style.transform = '';
      it.el.style.transformOrigin = '0 0';
    }
    for (const it of items) {
      const r = it.el.getBoundingClientRect();
      const fallback = it.kind === 'sticky'
        ? { width: it.rec.meta.w, height: it.rec.meta.h }
        : { width: it.rec.normal ? it.rec.normal.width : 720, height: it.rec.normal ? it.rec.normal.height : 520 };
      it.rect = {
        left: r.left, top: r.top,
        width: r.width || fallback.width,
        height: r.height || fallback.height,
      };
    }
    const n = items.length;
    const pad = 18;
    const gap = 12;
    const availW = Math.max(240, vp.width - pad * 2);
    const availH = Math.max(160, vp.height - pad * 2);
    // 列数按窗口数量分档，行内再按各自宽高比做「对齐铺满」（justified layout）：
    // 每行等高、横向占满整宽，最后一行不足时居中对齐，不留半块空洞。
    const cols = n <= 2 ? n
      : n <= 4 ? 2
        : n <= 9 ? 3
          : n <= 16 ? 4
            : Math.min(6, Math.ceil(Math.sqrt(n)));
    const rowCount = Math.ceil(n / cols);
    const counts = [];
    const base = Math.floor(n / rowCount);
    const extra = n % rowCount;
    for (let r = 0; r < rowCount; r += 1) counts.push(base + (r < extra ? 1 : 0));
    const rows = [];
    let at = 0;
    for (const count of counts) {
      const rowItems = items.slice(at, at + count);
      at += count;
      const aspect = rowItems.reduce((sum, it) => sum + Math.max(0.5, it.rect.width / it.rect.height), 0);
      // 只有一张卡的收尾行按两列算宽度，避免它被拉成一整屏的巨幅海报。
      const eff = Math.max(count, 2);
      rows.push({ items: rowItems, target: (availW - gap * (eff - 1)) / Math.max(0.5, aspect) });
    }
    // 每张卡最多按 1:1 摆放：单窗（例如音乐卡片）保持当前大小，
    // 窗口再多也只缩小，不把原来的窗口放大成海报。
    for (const row of rows) {
      row.cards = row.items.map((it) => {
        const k = Math.min(1, row.target / it.rect.height);
        return { it, k, w: it.rect.width * k, h: it.rect.height * k };
      });
      row.height = Math.max.apply(null, row.cards.map((c) => c.h));
    }
    // 先按 1:1 量出真实高度，再把放不下的部分整块等比缩小；
    // 不能拿「铺满宽度的目标高」求和，否则单张矮便利贴会把别的行一起缩掉。
    let sumH = rows.reduce((sum, r) => sum + r.height, 0);
    const shrink = Math.min(1, (availH - gap * (rows.length - 1)) / Math.max(1, sumH));
    if (shrink < 1) {
      for (const row of rows) {
        row.cards.forEach((c) => { c.k *= shrink; c.w *= shrink; c.h *= shrink; });
        row.height = Math.max.apply(null, row.cards.map((c) => c.h));
      }
      sumH = rows.reduce((sum, r) => sum + r.height, 0);
    }
    // 剩余高度摊进行距（最多 60px），整块在屏幕里垂直居中。
    const free = Math.max(0, availH - sumH - gap * (rows.length - 1));
    const vGap = rows.length > 1 ? Math.min(60, gap + free / (rows.length - 1)) : 0;
    const blockH = sumH + vGap * (rows.length - 1);
    let y = pad + Math.max(0, (availH - blockH) / 2);
    clear(tvLabels);
    tvState = { items };
    rows.forEach((row, rowIndex) => {
      const lastRow = rowIndex === rows.length - 1;
      const rowW = row.cards.reduce((sum, c) => sum + c.w, 0) + gap * (row.cards.length - 1);
      let x = pad + Math.max(0, (availW - rowW) / 2);
      row.cards.forEach((card) => {
        const it = card.it;
        const z = it.kind === 'window' ? (it.rec.zoom || 1) : 1;
        const el = it.el;
        const name = it.kind === 'sticky' ? stickies.title(it.rec) : it.rec.app.name;
        el.classList.add('tv-target');
        el.style.willChange = 'transform';
        el.style.transition = `transform 260ms ${EASE}`;
        el.style.transform = `translate(${x - it.rect.left}px, ${y - it.rect.top}px) scale(${card.k * z})`;
        // 标题栏会跟着缩到几像素，另铺一层不缩放的名称条。
        // 最后一行脚下通常还有空间，名称条放外面，不压住卡片底部控件。
        const labelTop = ((vGap >= 24 || lastRow) && y + row.height + 30 <= pad + availH)
          ? y + row.height + 6 : y + row.height - 22;
        tvLabels.append(h('div', {
          class: 'os-tv-label',
          style: `left:${Math.round(x + 8)}px;top:${Math.round(labelTop)}px`,
        }, h('span', { class: 'os-tv-label-icon' }, appIcon(it.kind === 'sticky' ? 'sticky' : it.rec.app.id)),
        h('b', {}, name)));
        el.append(h('button', {
          class: 'os-tv-hit', type: 'button', 'aria-label': `进入 ${name}`,
          onclick: (e) => { e.stopPropagation(); pickTaskItem(it); },
        }));
        x += card.w + gap;
      });
      y += row.height + vGap;
    });
    // 原生 Surface 必须等通知到位才会让开，立即补发一次。
    for (const rec of wins.values()) postChrome(rec);
  }

  function finishTaskWindow(it) {
    const rec = it.rec;
    const el = rec.el;
    el.style.transition = '';
    el.style.transformOrigin = '';
    el.style.willChange = '';
    el.style.transform = '';
    el.classList.remove('tv-live');
    if (it.savedRect) applyRect(rec, it.savedRect);
  }

  function closeTaskView(animate) {
    if (!taskViewOn || !tvState) return;
    taskViewOn = false;
    root.classList.remove('os-taskview-on');
    taskView.hidden = true;
    tvLabels.hidden = true;
    const items = tvState.items;
    tvState = null;
    for (const it of items) {
      const hit = it.el.querySelector('.os-tv-hit');
      if (hit) hit.remove();
      it.el.classList.remove('tv-target');
      const finish = () => (it.kind === 'sticky' ? finishSticky(it) : finishTaskWindow(it));
      if (animate) {
        it.el.style.transition = `transform 260ms ${EASE}`;
        it.el.style.transform = '';
        setTimeout(finish, 280);
      } else {
        it.el.style.transition = 'none';
        it.el.style.transform = '';
        finish();
      }
    }
    for (const rec of wins.values()) postChrome(rec);
  }

  // 便利贴预览结束后把纸交还桌面：收边的纸重新移回边缘外。
  function finishSticky(it) {
    const el = it.el;
    el.style.transition = '';
    el.style.transformOrigin = '';
    el.style.willChange = '';
    el.style.transform = '';
    if (it.rec.tuck) it.rec.placeTuck(it.rec.tuck.edge);
  }

  function pickTaskItem(it) {
    const rec = it.rec;
    closeTaskView(false);
    if (it.kind === 'sticky') { stickies.focus(rec); return; }
    if (rec.tucked) restoreTuck(rec);
    else if (rec.minimized) restoreWin(rec.id);
    else focusWin(rec.id);
  }

  function openSwitcher(dir) {
    const ids = switchIds();
    if (!ids.length) return;
    if (!switchState || switchState.mode !== 'cycle') {
      switchState = { ids, index: 0, mode: 'cycle' };
    } else if (switchState.ids.length !== ids.length) {
      switchState.ids = ids;
    }
    const n = switchState.ids.length;
    switchState.index = ((switchState.index + dir) % n + n) % n;
    renderSwitcher();
  }

  // 任务视图：把打开的应用摊成一张 3D 画展长廊。
  // 选中的窗口居中正面，两侧按距离后退、侧转、变暗，像翻卡一样换焦点。
  function buildSwitcher(st) {
    clear(switcher);
    st.key = st.mode + '|' + st.ids.join('|');
    st.stage = h('div', { class: 'os-switch-stage' });
    st.cards = [];
    st.ids.forEach((id, i) => {
      const app = apps.get(id);
      const rec = wins.get(id);
      if (!app || !rec) return;
      const card = h('button', {
        class: 'os-switch-card', type: 'button', dataset: { app: id },
        onclick: () => {
          if (i !== st.index) { st.index = i; renderSwitcher(); return; }
          commitSwitcher();
        },
      },
      h('span', { class: 'os-switch-shot' },
        h('span', { class: 'os-switch-shotbar' }, h('i'), h('i'), h('i')),
        h('span', { class: 'os-switch-shotbody' },
          h('span', { class: 'os-switch-art', dataset: { app: id } }, appIcon(app.id)),
          h('span', { class: 'os-switch-glyph' }, app.name))),
      h('span', { class: 'os-switch-name' }, app.name),
      h('span', { class: 'os-switch-sub' }, ''));
      st.cards.push({ el: card, id });
      st.stage.append(card);
    });
    if (st.mode === 'view') {
      const move = (dir) => {
        const n = st.ids.length;
        st.index = ((st.index + dir) % n + n) % n;
        renderSwitcher();
      };
      const prev = h('button', {
        class: 'br-btn os-switch-navbtn', type: 'button', 'aria-label': '上一个',
        onclick: () => move(-1),
      }, '‹');
      const next = h('button', {
        class: 'br-btn os-switch-navbtn', type: 'button', 'aria-label': '下一个',
        onclick: () => move(1),
      }, '›');
      st.count = h('span', { class: 'os-switch-count' }, '');
      st.stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) move(e.deltaY > 0 ? 1 : -1);
        else move(e.deltaX > 0 ? 1 : -1);
      }, { passive: false });
      switcher.append(
        h('div', { class: 'os-switch-head' },
          h('h2', {}, '任务视图'),
          h('span', {}, '滚轮或 ← → 翻卡 · 点选中卡片进入 · Esc 关闭')),
        st.stage,
        h('div', { class: 'os-switch-nav' }, prev, st.count, next));
    } else {
      switcher.append(st.stage);
    }
  }

  // 翻卡只改已有卡片的位姿：重建 DOM 会丢掉过渡，看起来是跳而不是滑。
  function renderSwitcher() {
    const st = switchState;
    if (!st) return;
    const key = st.mode + '|' + st.ids.join('|');
    if (st.key !== key || !st.cards) buildSwitcher(st);
    st.cards.forEach(({ el, id }, i) => {
      const rec = wins.get(id);
      el.classList.toggle('on', i === st.index);
      const sub = el.querySelector('.os-switch-sub');
      if (sub) {
        sub.textContent = rec && rec.suspended ? '已挂起 · 点按恢复'
          : rec && rec.minimized ? '已最小化'
            : activeId === id ? '当前窗口' : '运行中';
      }
      const off = i - st.index;
      const abs = Math.abs(off);
      el.style.transform = `translate(-50%, -50%) translateX(${off * 210}px)`
        + ` translateZ(${-abs * 150}px) rotateY(${off * -34}deg) scale(${1 - abs * 0.02})`;
      el.style.zIndex = String(100 - abs);
      el.style.opacity = abs > 3 ? '0' : String(Math.max(0.18, 1 - abs * 0.22));
      el.style.pointerEvents = abs > 3 ? 'none' : '';
    });
    if (st.count) st.count.textContent = `${st.index + 1} / ${st.ids.length}`;
    switcher.hidden = false;
  }

  function commitSwitcher() {
    const st = switchState;
    switchState = null;
    switcher.hidden = true;
    clear(switcher);
    if (!st) return;
    const rec = wins.get(st.ids[st.index]);
    if (!rec) return;
    if (rec.minimized) restoreWin(rec.id);
    else focusWin(rec.id);
  }

  function cancelSwitcher() {
    switchState = null;
    switcher.hidden = true;
    clear(switcher);
  }

  function hidePeekNow() {
    clearTimeout(peekTimer);
    if (peekEl) { peekEl.remove(); peekEl = null; }
  }

  function scheduleHidePeek() {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(hidePeekNow, 180);
  }

  function showPeek(id, btn) {
    clearTimeout(peekTimer);
    hidePeekNow();
    const app = apps.get(id);
    const rec = wins.get(id);
    if (!app) return;
    const card = h('div', { class: 'os-tb-peek', role: 'tooltip' },
      h('div', { class: 'os-peek-head' },
        h('span', { class: 'os-peek-art', dataset: { app: id } }, appIcon(app.id)),
        h('div', { class: 'os-peek-meta' },
          h('b', {}, app.name),
          h('i', {}, rec ? (rec.minimized ? '已最小化' : '运行中') : '未打开')),
        rec ? h('button', {
          class: 'os-peek-x', type: 'button', title: '关闭', 'aria-label': '关闭',
          onclick: (e) => { e.stopPropagation(); hidePeekNow(); closeWin(id); },
        }, icon('close')) : null),
      h('div', { class: 'os-peek-shot' },
        h('span', { class: 'os-peek-shotbar' }),
        h('span', { class: 'os-peek-glyph' }, appIcon(app.id))),
      h('div', { class: 'os-peek-foot' },
        rec ? (rec.minimized ? '点击还原窗口' : '点击切换到该窗口') : '点击打开应用'));
    card.addEventListener('pointerenter', () => clearTimeout(peekTimer));
    card.addEventListener('pointerleave', scheduleHidePeek);
    if (!rec) card.addEventListener('click', () => { hidePeekNow(); openApp(app); });
    root.append(card);
    peekEl = card;
    const br = btn.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    // 预览卡居中对齐按钮，再夹回视口，避免最左/最右的应用被截断。
    const left = Math.max(10 + cr.width / 2, Math.min(window.innerWidth - 10 - cr.width / 2, br.left + br.width / 2));
    card.style.left = `${Math.round(left)}px`;
    card.style.bottom = `${Math.round(window.innerHeight - br.top + 8)}px`;
  }

  function closeTrayPop() {
    trayPop.hidden = true;
    clear(trayPop);
  }

  // 快速设置：网络、电池、深色模式、减少动画、亮度。每一项都绑定真实状态。
  function renderTrayPop() {
    clear(trayPop);
    const batt = batteryRef ? `${Math.round(batteryRef.level * 100)}%` : '本机供电';
    const charging = !!(batteryRef && batteryRef.charging);
    const dark = prefs.theme === 'dark';
    const tile = (ico, title, detail, on, onclick) => h('button', {
      class: `os-quick-tile${on ? ' on' : ''}`, type: 'button',
      'aria-pressed': on == null ? null : String(!!on),
      onclick: onclick || null,
    },
    h('span', { class: 'os-quick-ico' }, icon(ico)),
    h('span', { class: 'os-quick-copy' }, h('b', {}, title), h('i', {}, detail)));
    trayPop.append(
      h('header', { class: 'os-tray-head' }, h('b', {}, '快速设置'), h('span', {}, 'NexlOS · 本机')),
      h('div', { class: 'os-quick-grid' },
        tile('wifi', 'Wi-Fi', navigator.onLine ? '已连接' : '未连接', navigator.onLine,
          () => { closeTrayPop(); openApp(apps.get('settings')); }),
        tile('battery', '电池', `${batt}${charging ? ' · 充电中' : ''}`, null, null),
        tile('moon', '深色模式', dark ? '已开启' : '已关闭', dark,
          () => quickPref({ theme: dark ? 'light' : 'dark' })),
        tile('sun', '减少动画', prefs.reduceMotion ? '已开启' : '跟随系统', !!prefs.reduceMotion,
          () => quickPref({ reduceMotion: !prefs.reduceMotion }))),
      h('label', { class: 'os-quick-bright' },
        h('span', { class: 'os-quick-bright-head' },
          icon('sun'), h('b', {}, '亮度'), h('i', { class: 'os-quick-bright-val' }, `${Math.round(brightness * 100)}%`)),
        h('input', {
          type: 'range', min: '40', max: '100', step: '1', value: String(Math.round(brightness * 100)),
          'aria-label': '桌面亮度', oninput: (e) => setBrightness(Number(e.target.value) / 100),
        })),
      h('footer', { class: 'os-tray-foot' },
        h('button', {
          class: 'ghost', type: 'button',
          onclick: () => { closeTrayPop(); openApp(apps.get('settings')); },
        }, '所有设置')));
  }

  function toggleTrayPop() {
    if (!trayPop.hidden) { closeTrayPop(); return; }
    closeClockPop();
    closeNotifyPop();
    renderTrayPop();
    trayPop.hidden = false;
  }

  function setBrightness(value) {
    brightness = Math.min(1, Math.max(0.4, Number(value) || 1));
    root.style.setProperty('--os-brightness', String(brightness));
    try { localStorage.setItem(BRIGHT_KEY, String(brightness)); } catch (e) { /* 隐私模式不阻塞亮度调整 */ }
    const out = trayPop.querySelector('.os-quick-bright-val');
    if (out) out.textContent = `${Math.round(brightness * 100)}%`;
  }

  async function quickPref(fields) {
    try {
      const r = await api('settings.set', { method: 'POST', fields });
      applyPrefs(r.detail);
      broadcastPrefs(r.detail);
      if (!trayPop.hidden) renderTrayPop();
    } catch (e) { toast(`设置未保存：${e.message}`); }
  }

  // 系统语言建议：只提示一次，标记在 localStorage；真正的语言选择仍写 settings.json。
  // 设置页的「时间和语言」一直保留同一建议，错过这条 toast 也找得到。
  const LANG_PROMPT_KEY = `${STORE}langPromptSeen`;
  function maybeSuggestSystemLanguage() {
    try {
      if (localStorage.getItem(LANG_PROMPT_KEY) === '1') return;
      localStorage.setItem(LANG_PROMPT_KEY, '1');
    } catch (e) { return; }
    const detected = systemLanguage();
    if (!detected || detected === prefs.language) return;
    if (!availableLanguages().some(l => l.code === detected)) return;
    const match = LANGUAGES.filter(l => l.code === detected)[0];
    const label = match ? match.label : detected;
    toast(`检测到系统语言：${label}。点此切换。`, {
      ms: 7000,
      hint: '', // 这句话本身就说清了动作，不再叠一行「打开汇报」
      title: '',
      onclick: () => { quickPref({ language: detected }); },
    });
  }

  // 星标询问：判定在 Go 内核，前端只上报“成功了一次”并渲染一次。
  // 无论用户点星还是拒绝，内核都会把这次询问永久关闭。
  let starChecked = false;
  async function maybeAskForStar() {
    if (starChecked) return;
    starChecked = true;
    try {
      if (!(await starFinished())) return;
      spaceFeed.append(starAsk({ onOpened: () => { prefs.starOpened = true; } }));
      spaceAutoScroll();
    } catch (e) { /* 询问失败不打断收尾 */ }
  }

  // ---------- 通知中心 ----------

  function saveNotices() {
    try { localStorage.setItem(`${STORE}notices`, JSON.stringify(notices)); } catch (e) { /* 忽略配额错误 */ }
  }

  // 只有 Agent 任务的收尾走这里：通知中心是任务报告箱，不是系统状态流。
  function notify(title, detail, opts) {
    const o = opts || {};
    notices.unshift({
      id: `n${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
      title, detail, at: Date.now(), report: o.report || '', agent: true,
    });
    notices = notices.slice(0, NOTICE_LIMIT);
    saveNotices();
    paintBell();
    // 伴侣只借一句台词回应任务完成/失败；没有写对应台词的包保持安静。
    if (companion) companion.react(String(title || '').includes('失败') ? 'noticeFail' : 'notice');
    // 与 NEXL 一致：新通知进来时球往上挣一次，提醒「有东西想出来」。
    // 开机播报用 signal:false 跳过：球的第一帧必须稳稳坐在液面里。
    if (o.signal !== false) startOrb.signal('messages');
    if (!notifyPop.hidden) renderNotifyPop();
  }

  function paintBell() {
    const btn = taskbar.querySelector('.os-tb-bell');
    if (!btn) return;
    const unread = notices.some((n) => Number(n.at) > noticesSeenAt);
    btn.classList.toggle('has-unread', unread);
    btn.title = unread ? '通知中心 · 有未读通知' : '通知中心';
  }

  function closeNotifyPop() {
    notifyPop.hidden = true;
    clear(notifyPop);
  }

  function toggleNotifyPop() {
    if (!notifyPop.hidden) { closeNotifyPop(); return; }
    closeClockPop();
    closeTrayPop();
    // 打开即视为已读：铃铛上的红点只提示“有新的”，不累计成永久角标。
    noticesSeenAt = Date.now();
    try { localStorage.setItem(`${STORE}notices.seen`, String(noticesSeenAt)); } catch (e) { /* 忽略 */ }
    renderNotifyPop();
    notifyPop.hidden = false;
    paintBell();
  }

  function noticeTime(at) {
    const sec = Math.max(0, Math.round((Date.now() - Number(at || 0)) / 1000));
    if (sec < 60) return '刚刚';
    if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
    return formatDate(new Date(Number(at)));
  }

  function renderNotifyPop() {
    clear(notifyPop);
    const list = h('div', { class: 'os-notice-list' },
      notices.length
        ? notices.map((n) => h('article', {
          class: 'os-notice' + (n.report ? ' is-actionable' : ''),
          // 有报告的通知就是入口：点开直接读这次运行的 Markdown 汇报。
          onclick: n.report ? () => { closeNotifyPop(); openReport(n.report); } : null,
        },
        h('span', { class: 'os-notice-ico' }, icon('bell')),
        h('div', { class: 'os-notice-copy' },
          h('b', {}, n.title || '通知'),
          n.detail ? h('p', {}, n.detail) : null,
          h('i', {}, noticeTime(n.at) + (n.report ? ' · 打开汇报' : '')))))
        : h('div', { class: 'os-notice-empty' },
          icon('bell'), h('b', {}, '没有新的任务报告'), h('span', {}, 'Agent 完成或失败的任务报告会出现在这里')));
    notifyPop.append(
      h('header', { class: 'os-notify-head' },
        h('div', {}, h('b', {}, '通知中心'), h('span', {}, notices.length ? `${notices.length} 条通知` : '暂无通知')),
        notices.length ? h('button', {
          class: 'os-notify-clear', type: 'button',
          onclick: () => {
            notices = [];
            saveNotices();
            noticesSeenAt = Date.now();
            try { localStorage.setItem(`${STORE}notices.seen`, String(noticesSeenAt)); } catch (e) { /* 忽略 */ }
            renderNotifyPop();
            paintBell();
          },
        }, '全部清除') : null),
      list,
      h('footer', { class: 'os-notify-foot' },
        h('button', {
          class: 'ghost', type: 'button',
          // 状态空间是右栏的运行面板：从通知直接展开，省掉先回命令栏这一步。
          onclick: () => { closeNotifyPop(); openSpace(); },
        }, '状态空间'),
        h('button', {
          class: 'ghost', type: 'button',
          onclick: () => { closeNotifyPop(); openApp(apps.get('settings')); },
        }, '通知设置')));
  }

  function closeClockPop() {
    clockPop.hidden = true;
    clear(clockPop);
  }

  function toggleClockPop(anchor) {
    if (prefs.appearance === 'win98' && !COARSE()) {
      closeClockPop();
      // 双击会在单击之后再触发一次：属性表已经开着就不再重建，否则会闪一下。
      if (classicDialog && classicDialog.mode === 'datetime') return;
      showClassicDialog('datetime');
      return;
    }
    if (!clockPop.hidden) { closeClockPop(); return; }
    closeTrayPop();
    closeNotifyPop();
    // 桌面右上角的大钟从自己下方展开；任务栏时间仍贴着右下角。
    clockPop.classList.toggle('at-desk', !!(anchor && anchor.closest('.os-deskclock')));
    calMonth = new Date();
    calMonth.setDate(1);
    renderClockPop();
    clockPop.hidden = false;
  }

  function renderClockPop() {
    clear(clockPop);
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    const firstDay = (new Date(y, m, 1).getDay() + 6) % 7; // 周一为一周起点
    const days = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    const grid = h('div', { class: 'os-cal-grid' });
    for (let weekday = 1; weekday <= 7; weekday += 1) grid.append(h('span', { class: 'os-cal-wd' }, formatDate(new Date(2024, 0, weekday), { weekday: 'narrow' })));
    for (let i = 0; i < firstDay; i += 1) grid.append(h('span', { class: 'os-cal-day out' }));
    for (let d = 1; d <= days; d += 1) {
      const cur = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
      grid.append(h('span', { class: `os-cal-day${cur ? ' today' : ''}` }, String(d)));
    }
    clockPop.append(
      h('header', { class: 'os-cal-head' },
        h('b', {}, formatDate(calMonth, { year: 'numeric', month: 'long' })),
        h('div', { class: 'os-cal-nav' },
          h('button', { class: 'os-cal-btn', type: 'button', 'aria-label': '上个月', onclick: () => { calMonth = new Date(y, m - 1, 1); renderClockPop(); } }, '‹'),
          h('button', { class: 'os-cal-btn', type: 'button', 'aria-label': '下个月', onclick: () => { calMonth = new Date(y, m + 1, 1); renderClockPop(); } }, '›'))),
      h('div', { class: 'os-cal-now' }, formatTime(new Date(), { hour12: !prefs.clock24 })),
      grid,
      h('footer', { class: 'os-cal-foot' },
        h('button', { class: 'ghost', type: 'button', onclick: () => { closeClockPop(); openApp(apps.get('settings')); } }, '设置')));
  }

  // ---------- 窗口 ----------

  // 读内联几何而非 getBoundingClientRect：打开/还原动画期间窗口带 scale 变换，
  // 用视觉矩形会把缩放写进会话和“最大化前尺寸”。
  function rectOf(rec) {
    const style = rec.el.style;
    const px = (value, fallback) => {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : fallback;
    };
    const r = rec.el.getBoundingClientRect();
    return {
      left: px(style.left, r.left),
      top: px(style.top, r.top),
      width: px(style.width, r.width),
      height: px(style.height, r.height),
    };
  }

  function applyRect(rec, r) {
    rec.el.style.left = `${Math.round(r.left)}px`;
    rec.el.style.top = `${Math.round(r.top)}px`;
    rec.el.style.width = `${Math.round(r.width)}px`;
    rec.el.style.height = `${Math.round(r.height)}px`;
  }

  // 应用可以让窗口向右长出去（曲库抽屉）：左边界钉住，只推右边界。
  // 屏幕右边放不下时改向左长，卡片在 iframe 里靠右，屏幕上仍停在原位。
  // 展开前的矩形存进 rec.winGrow，收起时按「当前」位置还原（展开期间用户可能拖过窗）。
  // 不做宽度补间：一帧到位，不生成合成层。
  function postToFrame(rec, msg) {
    if (!rec.frame || !rec.frame.contentWindow) return;
    try { rec.frame.contentWindow.postMessage(msg, location.origin); } catch (e) { /* 未挂载 */ }
  }
  function roomFor(base) {
    const vp = viewport();
    return {
      right: Math.max(0, vp.width - (base.left + base.width) - 8),
      left: Math.max(0, base.left - 8),
    };
  }
  // 应用展开前先问方向：卡片在 405 宽时左右对齐没有差别，先切对齐再长窗口就不会跳。
  function planGrow(rec, delta) {
    const base = rec.winGrow ? rec.winGrow.rect : rectOf(rec);
    const room = roomFor(base);
    const side = room.right >= delta || room.right >= room.left ? 'right' : 'left';
    postToFrame(rec, { type: 'nexlos.win.plan', side });
  }
  function growWindow(rec, open, delta, side) {
    if (rec.maximized) return;
    if (!open) {
      if (!rec.winGrow) return;
      const g = rec.winGrow;
      const live = rectOf(rec);
      if (g.side === 'left') {
        // 右边缘钉住：宽度收回卡片宽，窗口位置跟着回来。
        const right = live.left + live.width;
        applyRect(rec, { left: Math.max(8, right - g.rect.width), top: live.top, width: g.rect.width, height: live.height });
      } else {
        applyRect(rec, { left: live.left, top: live.top, width: g.rect.width, height: live.height });
      }
      delete rec.winGrow;
      postToFrame(rec, { type: 'nexlos.win.closed' });
      scheduleSession();
      return;
    }
    if (!(delta > 0)) return;
    if (!rec.winGrow) rec.winGrow = { rect: rectOf(rec), side: side === 'left' ? 'left' : 'right' };
    const base = rec.winGrow.rect;
    const room = roomFor(base);
    const useLeft = side === 'left' && room.left > room.right;
    rec.winGrow.side = useLeft ? 'left' : 'right';
    const grow = Math.min(delta, useLeft ? room.left : room.right);
    applyRect(rec, {
      left: useLeft ? base.left - grow : base.left,
      top: base.top,
      width: base.width + grow,
      height: base.height,
    });
    scheduleSession();
  }

  // 窗口缩放用 transform: scale()：合成器只搬图层，iframe 内部视口不变，
  // Chrome 72 也不会在松手时把内容按 100% 重排（CSS zoom 会）。
  // 上限 2 / 下限 0.6，既能让小屏看清，也不至于把窗口缩成一条线。
  function clampZoom(z) {
    return Math.max(0.6, Math.min(2, Number(z) || 1));
  }
  // 收到 Chrome 布局单位（1/64 px）就把亚像素误差压到看不见，同时保留缩放落点。
  function roundPx(v) {
    return Math.round(v * 64) / 64;
  }
  function setZoom(rec, z) {
    const next = clampZoom(z);
    rec.zoom = next;
    // CSS 里的 transform: scale(var(--os-z)) 负责实际缩放；打开/拖动/FLIP
    // 的内联 transform 会覆盖它，所以这些地方都要把 zoom 一起带上。
    rec.el.style.setProperty('--os-z', String(next));
    return next;
  }

  // 窗口可以越过四边、压到任务栏后面，但至少留一块可抓的标题栏。
  // left/top 是视觉坐标；可视宽高 = 布局宽高 × zoom（对齐观音签便签）。
  function grabLimits(width, height, z) {
    const m = metrics(viewport());
    const vp = viewport();
    return {
      leftMin: m.work.left + LAYOUT.grabX - width * z,
      leftMax: m.work.left + vp.width - LAYOUT.grabX,
      topMin: m.grabY - m.titleBarH * z,
      // 下界用整个视口高度，窗口可以滑到任务栏后面；否则松手会被拉回程序坞上沿。
      topMax: m.work.top + vp.height - m.grabY,
    };
  }
  function keepVisible(rec) {
    const r = rectOf(rec);
    const z = rec.zoom || 1;
    const lim = grabLimits(r.width, r.height, z);
    const left = Math.min(Math.max(r.left, lim.leftMin), lim.leftMax);
    const top = Math.min(Math.max(r.top, lim.topMin), lim.topMax);
    if (left !== r.left) rec.el.style.left = `${roundPx(left)}px`;
    if (top !== r.top) rec.el.style.top = `${roundPx(top)}px`;
  }

  function viewport() {
    // 外观以实际渲染的 dataset 为准：缓存主题可能先于 settings 生效，
    // 若几何仍读 prefs，Win98 会沿用现代主题的 78px 任务栏，变成一条过高的灰带。
    const applied = document.documentElement.dataset.appearance;
    const retroFontSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--retro-font-size'), 10);
    return {
      width: window.innerWidth, height: window.innerHeight, dockExtra: safeBottom(),
      appearance: applied || prefs.appearance,
      retroFontSize: Number.isFinite(retroFontSize) ? retroFontSize : prefs.retroFontSize,
      coarse: COARSE(),
    };
  }

  // 读取 CSS 里的 env(safe-area-inset-bottom)：iOS 独立窗口的底部横条要让出来。
  function safeBottom() {
    if (safeBottomPx < 0) {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--os-safe-b');
      safeBottomPx = parseFloat(raw) || 0;
    }
    return safeBottomPx;
  }

  // 任务栏高度写进 CSS 变量，几何与样式共用一个来源。
  function syncMetrics() {
    const m = metrics(viewport());
    root.style.setProperty('--os-menubar-h', `${m.menubarH}px`);
    root.style.setProperty('--os-dock-h', `${m.dockH}px`);
    root.style.setProperty('--os-titlebar-h', `${m.titleBarH}px`);
    root.style.setProperty('--os-control-w', `${m.controlW}px`);
    root.style.setProperty('--os-control-h', `${m.controlH}px`);
    root.classList.toggle('classic-touch', m.classic && m.touch);
    positionSpace();
  }

  function loadRect(app) {
    const saved = bootSession && bootSession.windows.find((w) => w.app === app.id);
    if (saved) return restoreRect(saved.rect, viewport(), saved.zoom);
    // 0.4.0 之前的单窗口矩形，读一次即可，后续统一写会话快照。
    // 应用改名前写下的旧 rect 键仍认，避免升级后窗口回到默认尺寸。
    const oldId = legacyAppId(app.id);
    const legacy = readJSON(`${STORE}rect.${app.id}`, null)
      || (oldId ? readJSON(`${STORE}rect.${oldId}`, null) : null);
    if (legacy && typeof legacy.width === 'number') return fitRect(legacy, viewport());
    return defaultRect(app.window, wins.size, viewport());
  }

  function saveRect(rec) {
    if (rec.tucked) { scheduleSession(); return; }
    if (!rec.maximized) rec.normal = rectOf(rec);
    scheduleSession();
  }

  function scheduleSession() {
    if (restoring) return;
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(flushSession, SESSION_DEBOUNCE_MS);
  }

  function flushSession() {
    clearTimeout(sessionTimer);
    sessionTimer = 0;
    if (restoring) return;
    if (!wins.size) {
      clearSession(localStorage);
      return;
    }
    const list = [...wins.values()].map((rec) => ({
      app: rec.app.id,
      rect: rec.winGrow ? rec.winGrow.rect : (rec.maximized ? rec.normal : (rec.tucked ? rec.tucked.normal : rectOf(rec))),
      maximized: rec.maximized,
      minimized: rec.minimized,
      zoom: rec.zoom || 1,
      focused: rec.app.id === activeId,
    }));
    // 焦点窗口放最后，恢复时它自然成为栈顶。
    list.sort((a, b) => Number(a.focused) - Number(b.focused));
    writeSession(localStorage, { version: 1, windows: list });
  }

  function windowControls(rec) {
    // 标题栏按钮用自绘提示条（data-tip）：系统原生 tooltip 会飘到按钮右下方，
    // 最大化后还盖住关闭按钮，和 98 皮肤也对不上。
    return h('div', { class: 'os-win-controls' },
      h('button', { class: 'os-win-ctl min', 'data-tip': '最小化', 'aria-label': '最小化', onclick: () => minimizeWin(rec.app.id) }, icon('minimize')),
      h('button', { class: 'os-win-ctl max', 'data-tip': '最大化', 'aria-label': '最大化', onclick: () => toggleMax(rec.app.id) }, icon('maximize')),
      h('button', { class: 'os-win-ctl close', 'data-tip': '关闭', 'aria-label': '关闭', onclick: () => closeWin(rec.app.id) }, icon('close')));
  }

  function openWindow(app, opts = {}) {
    opts = opts || {};
    if (wins.has(app.id)) return wins.get(app.id);
    const saved = opts.restore;
    const rect = saved ? restoreRect(saved.rect, viewport(), saved.zoom) : loadRect(app);
    // 音乐窗口多出来的宽度只可能是抽屉展开时让出去的，属于临时状态；
    // 旧会话如果记着这块宽窗，打开时收回声明宽度，卡片留在左边原位。
    if (app.id === 'music' && app.window && rect.width > app.window.Width) {
      rect.width = app.window.Width;
    }

    const barTitle = h('div', { class: 'os-win-title' }, app.name);
    const body = h('div', { class: 'os-win-body' });
    // 手势浮层：手指按住标题栏时临时盖住应用内容。iframe 是独立文档，
    // 不收它这一层，第二根手指就会掉进 iframe，双指永远配不成一对。
    const shield = h('div', { class: 'os-win-shield', 'aria-hidden': 'true' });
    body.append(shield);
    const controls = windowControls({ app });
    const bar = h('header', { class: 'os-win-bar' },
      h('span', { class: 'os-win-appicon' }, appIcon(app.id)),
      barTitle, controls);
    const el = h('section', {
      class: 'os-window', 'data-app': app.id, role: 'dialog', 'aria-label': app.name,
      style: `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`,
    }, bar, body);

    const rec = {
      id: app.id, app, el, body, bar, shield, frame: null,
      minimized: false, maximized: false, normal: rect, zoom: 1, tucked: null,
      state: '', suspended: false, suspendedSrc: '', freeze: null, gestureOff: null, overlayTimer: 0,
      showLoading(text) {
        clearTimeout(rec.overlayTimer);
        overlay.show(text);
      },
      // 本地页面通常几十毫秒就绪：先等一会儿再盖加载层，
      // 否则用户看到的是一闪而过的「正在打开」，反而像卡了一下。
      showLoadingSoon(text) {
        clearTimeout(rec.overlayTimer);
        rec.overlayTimer = setTimeout(() => overlay.show(text || '正在打开…'), 300);
      },
      ready() {
        clearTimeout(rec.overlayTimer);
        overlay.hide();
      },
      setSrc(url) {
        if (!rec.frame) {
          // 签名包来自任意 GitHub 仓库：给它们不透明源，收掉摄像头/麦克风；
          // 剪辑板只在 manifest 显式声明时才放行。内置应用仍保持同源。
          const bundled = app.kind === 'bundle';
          const perms = app.permissions || {};
          const allow = bundled
            ? ['fullscreen', 'autoplay', 'encrypted-media']
            : ['clipboard-read', 'clipboard-write', 'fullscreen', 'camera', 'microphone', 'autoplay', 'encrypted-media'];
          if (bundled && perms.clipboard) allow.push('clipboard-read', 'clipboard-write');
          const attrs = { class: 'os-frame', title: app.name, allow: allow.join('; ') };
          // 便捷办公自带一套办公词表：标记后切语言时 localizeFrames 会重新进入它的文档。
          if (app.id === 'office') attrs['data-i18n-app'] = 'true';
          if (bundled) {
            attrs.sandbox = 'allow-scripts allow-forms allow-popups allow-downloads allow-modals';
          }
          rec.frame = h('iframe', attrs);
          // 签名包的能力只能经宿主转发：登记帧 + 清单能力，客户端随后 ping 完成握手。
          if (bundled && window.NexlOSHost) {
            rec.bridge = window.NexlOSHost.attach(rec.frame, {
              id: app.id, digest: app.digest, name: app.name,
              capabilities: app.capabilities, permissions: app.permissions,
            });
          }
          rec.frame.addEventListener('load', () => {
            rec.ready();
            // New and restored NexlOS frames receive the current skin as well.
            if (app.internal) rec.frame.contentWindow.postMessage({ type: 'nexlos.settings', patch: prefs }, location.origin);
            if (app.id === 'settings' && rec.settingsPage) rec.frame.contentWindow.postMessage({ type: 'nexlos.settings.page', page: rec.settingsPage }, location.origin);
            // 同源应用加载完与异步首屏渲染后各补一次语言，避免半截中文。
            if (app.internal) {
              try { localizeDoc(rec.frame.contentDocument); } catch (e) { /* 跨源 */ }
              setTimeout(function () {
                try { localizeDoc(rec.frame.contentDocument); } catch (e) { /* 跨源 */ }
              }, 500);
            }
            // iframe 晚于窗口创建：加载完成后补发当前生命周期状态。
            // active 也要补：窗口通常在 iframe 挂载前就已经聚焦。
            if (rec.state) postLifecycle(rec, rec.state);
            // 原生 Surface 需要知道父层浮层是否打开（开始菜单/任务视图等）。
            postChrome(rec);
            // 同时补一次工作区底边：窗口恢复时页面才知道该裁到哪条线。
            postFrame(rec);
            // 同源应用把双指手势转给窗口层，双指落在应用内容上也能缩放窗口。
            wireFramePinch(rec);
            wireClassicFrameKeys(rec);
          });
          body.append(rec.frame);
        }
        rec.frame.src = url;
        rec.showLoadingSoon();
      },
      setError(msg) {
        overlay.error(msg, () => { closeWin(app.id); openApp(app); });
      },
      setNotice(msg) {
        overlay.notice(msg);
      },
      renderNative() {
        clear(body);
        // 重绘原生面板时把加载/错误层一起挂回去，否则后续错误提示没有宿主。
        body.append(nativePanel(app, rec), overlay);
      },
    };

    const overlay = h('div', { class: 'os-win-overlay' });
    overlay.show = (text) => {
      clear(overlay);
      overlay.className = 'os-win-overlay show';
      overlay.append(h('span', { class: 'os-spinner' }), h('span', {}, text || '正在打开…'));
    };
    overlay.hide = () => { overlay.className = 'os-win-overlay'; clear(overlay); };
    overlay.error = (msg, retry) => {
      clear(overlay);
      overlay.className = 'os-win-overlay show error';
      overlay.append(h('p', {}, msg), h('button', { class: 'ghost', onclick: retry }, '重试'));
    };
    overlay.notice = (msg) => {
      clear(overlay);
      overlay.className = 'os-win-overlay show';
      overlay.append(h('span', {}, msg));
    };
    // 会话恢复时不自动拉起 sidecar：先给一张占位卡，用户点了再冷启动。
    overlay.wait = (msg, label, action) => {
      clear(overlay);
      overlay.className = 'os-win-overlay show';
      overlay.append(h('p', {}, msg), h('button', { class: 'ghost', onclick: action }, label));
    };
    body.append(overlay);

    // 挂起遮罩盖住整个窗口：iframe 被卸载后用户看到的是一张可点的“海报”，
    // 不是白屏。点击恢复时才重建 iframe。
    const freeze = h('button', {
      class: 'os-win-freeze', type: 'button', hidden: true,
      onclick: () => resumeSurface(rec),
    },
    h('span', { class: 'os-win-freeze-icon' }, appIcon(app.id)),
    h('b', {}, app.name),
    h('span', { class: 'os-win-freeze-sub' }, '已挂起 · 内存已释放'),
    h('em', {}, '点击恢复'));
    el.append(freeze);
    rec.freeze = freeze;
    el.setAttribute('data-state', 'background');

    if (saved) {
      if (app.internal) {
        // 静态 entry（例如画板）优先：会话恢复也必须回到原版页面，不能退回 #/route 包装层。
        rec.setSrc(app.entry || `/?embed=1${app.route}`);
      } else if (app.native) {
        rec.renderNative();
        overlay.hide();
      } else if (app.kind === 'bundle' && app.route && (!app.runtime || app.runtime.kind === 'static')) {
        // 静态签名包没有 sidecar 需要冷启动：会话恢复直接把页面挂回帧里，别让用户先看一张「重新启动」。
        rec.setSrc(app.route);
      } else {
        overlay.wait(`${app.name} 上次打开着`, '重新启动', () => startWeb(rec, app));
      }
    } else if (opts.src) {
      // 内部页面同样要在开窗动画结束后再挂，避免首帧和动画抢同一个 60Hz 帧。
      setTimeout(() => {
        if (wins.get(app.id) === rec) rec.setSrc(opts.src);
      }, IFRAME_DELAY_MS);
      rec.showLoadingSoon(opts.loading);
    } else if (opts.native) {
      rec.renderNative();
      overlay.hide();
    } else {
      overlay.show(opts.loading || '正在打开…');
    }

    // Win10 的标题栏只有最小化/最大化/关闭三颗按钮；重载、外开这类动作放进标题栏右键菜单。
    rec.bar.addEventListener('contextmenu', (e) => {
      if (e.target.closest('button, a, input, select')) return;
      e.preventDefault();
      if (prefs.appearance === 'win98') { focusWin(rec.id); showClassicWindowContext(rec, e.clientX, e.clientY); return; }
      const items = [];
      if (rec.frame) {
        items.push(['重新载入', () => { if (confirmWindowDiscard(rec)) rec.setSrc(rec.frame.src); }]);
        items.push(['在新标签页打开', () => window.open(rec.frame.src, '_blank', 'noopener')]);
      }
      if (app.native) items.push(['打开库文件夹', () => revealApp(app.id)]);
      items.push([rec.minimized ? '还原' : '最小化', () => (rec.minimized ? restoreWin(app.id) : minimizeWin(app.id))]);
      items.push(['关闭窗口', () => closeWin(app.id)]);
      showCtx(e.clientX, e.clientY, items);
    });

    rec.maxBtn = controls.querySelector('.max');
    windowsLayer.append(el);
    wins.set(app.id, rec);
    stack = [app.id, ...stack.filter((id) => id !== app.id)];
    setSurfaceState(rec, saved && saved.minimized ? 'sleep' : 'background');
    if (saved && saved.maximized) {
      rec.maximized = true;
      rec.normal = rect;
      el.classList.add('maximized');
      setMaxButton(rec);
    }
    if (saved && saved.minimized) {
      rec.minimized = true;
      el.classList.add('minimized');
    }
    if (saved && saved.zoom && saved.zoom !== 1) setZoom(rec, saved.zoom);
    wireDrag(rec);
    wireResize(rec);
    el.addEventListener('pointerdown', () => focusWin(app.id), true);
    // 打开动画：先以最终布局挂载，reflow 后再切到 open，浏览器才能补间。
    // 只补间 transform，不碰 opacity——窗口从第一帧起就是完整内容。
    void el.offsetWidth;
    if (INSTANT_WINDOWS()) {
      // 主题不做窗口补间，也就不需要把整扇窗提前升成合成层。
      if (!rec.minimized) el.classList.add('open');
    } else {
      const token = beginMotion(rec);
      el.style.willChange = 'transform';
      if (!rec.minimized) el.classList.add('open');
      setTimeout(() => resetMotion(rec, token), OPEN_MS + 20);
    }
    if (rec.minimized) {
      applyStack();
      paintTaskbar();
    } else {
      focusWin(app.id);
    }
    return rec;
  }

  function setMaxButton(rec) {
    rec.maxBtn.innerHTML = '';
    rec.maxBtn.append(icon(rec.maximized ? 'restore' : 'maximize'));
    rec.maxBtn.setAttribute('aria-label', rec.maximized ? '还原' : '最大化');
    // 自绘提示条跟着状态换字；系统 tooltip 已停用。
    rec.maxBtn.setAttribute('data-tip', rec.maximized ? '还原' : '最大化');
  }

  function nativePanel(app, rec) {
    return h('div', { class: 'os-native' },
      h('div', { class: 'os-native-icon' }, appIcon(app.id)),
      h('p', { class: 'os-native-eyebrow' }, '本机应用 · 独立配置'),
      h('h2', {}, app.name),
      h('p', { class: 'os-native-lede' }, app.description || ''),
      h('dl', { class: 'os-native-meta' },
        h('div', {}, h('dt', {}, '状态'), h('dd', {}, nativeBusy ? '正在打开…' : statusOf(app))),
        h('div', {}, h('dt', {}, '独立库'), h('dd', {}, app.vault || '首次打开时创建'))),
      h('div', { class: 'os-native-actions' },
        h('button', { class: 'primary', disabled: nativeBusy, onclick: () => launchNative(app, rec) }, nativeBusy ? '打开中…' : '再次打开'),
        h('button', { class: 'ghost', onclick: () => revealApp(app.id) }, '打开库文件夹')));
  }

  async function launchNative(app, rec) {
    if (nativeBusy) return;
    nativeBusy = true;
    if (rec) rec.renderNative();
    try {
      const r = await api('app.open', { method: 'POST', fields: { app: app.id } });
      const d = r.detail || {};
      app.status = 'running';
      app.statusLabel = '运行中';
      if (d.vault) app.vault = d.vault;
      toast(d.message || '已打开');
      if (rec) rec.renderNative();
      syncSurfaces();
    } catch (e) {
      toast(e.message, 'error');
      if (rec) rec.setError(e.message);
    } finally {
      nativeBusy = false;
      if (rec) rec.renderNative();
    }
  }

  // 便利贴附件点开时把文档号交给便捷办公；已经开着就换掉 iframe 的地址。
  function openOfficeDoc(id) {
    const app = apps.get('office');
    if (!app) return;
    const src = `/a/office/?doc=${encodeURIComponent(id)}`;
    const rec = wins.get('office');
    if (rec) {
      if (rec.minimized) restoreWin('office');
      focusWin('office');
      if (rec.setSrc) {
        let same = false;
        try { same = !!rec.frame && rec.frame.src === new URL(src, location.href).href; } catch (e) { same = false; }
        if (!same) rec.setSrc(src);
      }
      return;
    }
    openApp(app, { src });
  }

  async function openApp(app, opts) {
    if (!app) return;
    closeStart();
    closeCtx();
    // 便利贴是一个常驻桌面应用：打开它把上次的纸贴回来；已经开着时再点一次就加一张新的。
    if (app.id === 'sticky') {
      markRecent(app.id);
      if (!stickies.isOpen()) stickies.openApp({ create: true });
      else if (!stickies.isVisible()) stickies.showApp();
      else stickies.newNote();
      return;
    }
    const existing = wins.get(app.id);
    if (existing) {
      if (opts && opts.src && existing.setSrc) existing.setSrc(opts.src);
      existing.minimized ? restoreWin(app.id) : focusWin(app.id);
      return;
    }
    markRecent(app.id);
    // 关掉不久的应用还热在预热池里：直接亮出来，省掉整个 iframe 启动。
    if (reviveParked(app.id)) {
      pulse('app.open', { app: app.id, kind: app.kind }, app.id);
      return;
    }
    pulse('app.open', { app: app.id, kind: app.kind }, app.id);
    if (app.internal) {
      // entry 是静态页面时直接装进窗口；否则走 #/route 的路由页。
      openWindow(app, { src: (opts && opts.src) || app.entry || `/?embed=1${app.route}`, loading: '正在打开…' });
      return;
    }
    if (app.native) {
      const rec = openWindow(app, { native: true });
      launchNative(app, rec);
      return;
    }
    const rec = openWindow(app, { loading: `正在启动 ${app.name}…` });
    startWeb(rec, app);
  }

  async function startWeb(rec, app) {
    rec.showLoading(`正在启动 ${app.name}…`);
    try {
      const r = await api('app.open', { method: 'POST', fields: { app: app.id, embed: true } });
      const d = r.detail || {};
      if (d.vault) app.vault = d.vault;
      if (d.url) {
        app.url = d.url;
        // 先让开窗动画跑完再挂 iframe：应用首帧很重，早挂会吃掉动画的前几帧。
        setTimeout(() => {
          if (wins.get(app.id) === rec) rec.setSrc(d.url);
        }, IFRAME_DELAY_MS);
      } else {
        rec.setNotice(d.message || '已打开');
      }
      app.status = 'running';
      app.statusLabel = '运行中';
      toast(d.message || '已打开');
      syncSurfaces();
    } catch (e) {
      rec.setError(e.message);
      toast(e.message, 'error');
    }
  }

  function revealApp(id) {
    api('app.reveal', { method: 'POST', fields: { app: id } })
      .then(() => toast('已在文件管理器打开'))
      .catch((e) => toast(e.message, 'error'));
  }

  // ---------- 窗口生命周期：前台 / 后台 / 睡眠 / 挂起 ----------

  // 只发状态，不发数据；跨域应用收到也无害，内部应用据此释放摄像头与播放器。
  function postLifecycle(rec, state) {
    if (!rec.frame || !rec.frame.contentWindow) return;
    try { rec.frame.contentWindow.postMessage({ type: 'nexlos.lifecycle', state }, '*'); } catch (e) { /* iframe 已销毁 */ }
  }

  // 几何正在变：拖窗/缩窗时给应用发一针「跟上」。
  // 浏览器据此重新对齐原生页面视图（iframe 内部收不到父层移动的事件）。
  // 任务栏在 HTML 层压住窗口（z-index 60 高于窗口层 10），原生页面视图却浮在整页之上。
  // 把任务栏顶边作为可见区域底边发下去，应用才能把原生页面裁到任务栏上面。
  function workBottom() {
    const h = window.innerHeight;
    const r = taskbar.getBoundingClientRect();
    // 最大化时任务栏被移出屏幕（top >= 视口底边），页面可用整屏。
    if (r.height > 0 && r.top > 0 && r.top < h) return Math.round(r.top * 100) / 100;
    return h;
  }

  function postFrame(rec) {
    if (!rec || !rec.frame || !rec.frame.contentWindow) return;
    try {
      rec.frame.contentWindow.postMessage({ type: 'nexlos.frame', workBottom: workBottom() }, '*');
    } catch (e) { /* iframe 已销毁 */ }
  }

  // 任务栏的显隐由根节点 class 驱动（最大化、任务视图、贴边预览），并带 280ms
  // 位移动画。动画期间每帧把当前可见底边发下去，原生页面才能贴着任务栏起落。
  let workSyncUntil = 0;
  let workSyncHandle = 0;
  function syncWorkArea(ms) {
    workSyncUntil = Math.max(workSyncUntil, Date.now() + (ms || 360));
    if (workSyncHandle) return;
    const tick = () => {
      workSyncHandle = 0;
      for (const rec of wins.values()) postFrame(rec);
      if (Date.now() < workSyncUntil) workSyncHandle = requestAnimationFrame(tick);
    };
    workSyncHandle = requestAnimationFrame(tick);
  }
  new MutationObserver(() => syncWorkArea(360)).observe(document.documentElement, {
    attributes: true, attributeFilter: ['class'],
  });

  // 原生 Surface 叠在整页之上：父层任何浮层出现时，浏览器必须把页面收起来，
  // 否则开始菜单/右键菜单/任务视图会被原生视图盖住。
  function chromeState() {
    const names = [];
    if (taskViewOn) names.push('taskview');
    if (!switcher.hidden) names.push('switcher');
    // win98 皮肤走独立的老式右键菜单，它不在 ctxMenu 里，要单独算。
    if (!ctxMenu.hidden || classicContext.isOpen()) names.push('ctx');
    if (!clockPop.hidden) names.push('clock');
    if (!trayPop.hidden) names.push('tray');
    if (!notifyPop.hidden) names.push('notify');
    if (cmdMenuOpen) names.push('cmd');
    if (peekEl) names.push('peek');
    if (!reportOverlay.hidden) names.push('report');
    return { start: startOpen, overlay: names.length > 0, names: names.join(',') };
  }

  function postChrome(rec) {
    if (!rec.frame || !rec.frame.contentWindow) return;
    try { rec.frame.contentWindow.postMessage({ type: 'nexlos.chrome', state: chromeState() }, '*'); } catch (e) { /* iframe 已销毁 */ }
  }

  // 浮层开关不等 200ms 轮询：右键菜单一出现就收起原生页面，
  // 否则菜单右半边会被页面盖住。
  function broadcastChrome() {
    for (const rec of wins.values()) postChrome(rec);
  }

  let chromeSig = '';
  setInterval(() => {
    const st = chromeState();
    const sig = (st.start ? 1 : 0) + '' + (st.overlay ? 1 : 0);
    if (sig === chromeSig) return;
    chromeSig = sig;
    for (const rec of wins.values()) postChrome(rec);
  }, 200);

  function setSurfaceState(rec, next) {
    if (!rec || rec.state === next) return;
    rec.state = next;
    rec.el.setAttribute('data-state', next);
    rec.el.classList.toggle('surface-suspended', next === 'suspended');
    postLifecycle(rec, next);
    // 切到后台/休眠/关闭：原生页面必须当场让开。只靠 iframe 收到消息再转一轮，
    // 旧页面会多留一两帧，盖在新窗口或桌面上，就是切换时的残影。
    if (next !== 'active' && rec.surfaceId) {
      api('surface.hide', { method: 'POST', fields: { id: rec.surfaceId } }).catch(() => { /* 已销毁 */ });
    }
  }

  function canSuspend(rec) {
    return !!rec && !!rec.frame && !rec.suspended && rec.id !== activeId
      && NEVER_SUSPEND.indexOf(rec.id) < 0;
  }

  function enforceSurfaceBudget() {
    const budget = SURFACE_BUDGET();
    let live = 0;
    for (const rec of wins.values()) {
      if (rec.frame && !rec.suspended) live++;
    }
    if (live <= budget) return;
    const victims = [...wins.values()]
      .filter(canSuspend)
      .sort((a, b) => (lastFocusAt.get(a.id) || 0) - (lastFocusAt.get(b.id) || 0));
    for (const rec of victims) {
      if (live <= budget) break;
      suspendSurface(rec);
      live--;
    }
  }

  function suspendSurface(rec) {
    if (!canSuspend(rec)) return;
    rec.suspended = true;
    rec.suspendedSrc = rec.frame.src || '';
    setSurfaceState(rec, 'suspended');
    rec.freeze.hidden = false;
    pulse('win.suspend', { app: rec.id }, rec.id);
    // 先给应用 160ms 自行释放摄像头/音频，再卸载 iframe。
    setTimeout(() => {
      if (!rec.suspended || !rec.frame) return;
      try { rec.frame.src = 'about:blank'; } catch (e) { /* 跨域时浏览器会忽略 */ }
    }, 160);
    paintTaskbar();
  }

  function resumeSurface(rec) {
    if (!rec || !rec.suspended) return;
    rec.suspended = false;
    rec.freeze.hidden = true;
    setSurfaceState(rec, rec.id === activeId ? 'active' : 'background');
    const src = rec.suspendedSrc;
    if (src && src !== 'about:blank') {
      rec.setSrc(src);
    } else if (rec.app.internal) {
      rec.setSrc(`/?embed=1${rec.app.route}`);
    } else {
      startWeb(rec, rec.app);
    }
    pulse('win.resume', { app: rec.id }, rec.id);
    paintTaskbar();
  }

  // z 序只由栈位置决定：栈顶在前，关闭/最小化后自动回档。
  function applyStack() {
    for (const [id, rec] of wins) {
      const i = stack.indexOf(id);
      rec.el.style.zIndex = String(10 + (i < 0 ? 0 : stack.length - i));
    }
  }

  // 聚焦只切 class，不重建任务栏 DOM，避免打断过渡和输入焦点。
  function paintSurfaces() {
    paintTaskbar();
    for (const btn of iconLayer.querySelectorAll('[data-app]')) {
      btn.classList.toggle('running', isRunning(btn.dataset.app));
    }
  }

  function focusWin(id) {
    const rec = wins.get(id);
    if (!rec) return;
    if (rec.minimized) {
      restoreWin(id);
      return;
    }
    const prev = activeId;
    activeId = id;
    if (prev && prev !== id) {
      const p = wins.get(prev);
      if (p) setSurfaceState(p, p.minimized ? 'sleep' : 'background');
    }
    lastFocusAt.set(id, Date.now());
    if (rec.suspended) resumeSurface(rec);
    else setSurfaceState(rec, 'active');
    stack = [id, ...stack.filter((x) => x !== id)];
    applyStack();
    for (const [key, r] of wins) r.el.classList.toggle('active', key === id);
    paintSurfaces();
    scheduleSession();
    if (prev !== id) {
      pulse('win.focus', { app: id, from: prev }, id);
      // 新窗口抢到前台后再按预算回收，避免把刚点开的窗口挂起。
      enforceSurfaceBudget();
    }
  }

  // Win98 的窗口即点即到。原生页面视图不能跟着 CSS transform 缩放：
  // 补间期间它只能按视觉矩形反复重排去追，追上之前留在屏幕上的就是残影。
  const INSTANT_WINDOWS = () => prefs.appearance === 'win98';

  function restoreWin(id) {
    const rec = wins.get(id);
    if (!rec) return;
    rec.minimized = false;
    rec.el.classList.remove('minimized');
    // 捏合只锚定中心、不夹边界，窗口可能大半在屏外；从任务栏还原是兜底入口，
    // 先把可抓的标题栏条拉回视口，别让用户还原出一扇找不回来的窗。
    keepVisible(rec);
    // 还原即出现：不做“从任务栏图标长出来”的缩放。页面会在缩略尺寸先闪一下
    // 再跳回原大，那一帧在用户眼里就是残影；直接落到最终矩形反而更干脆。
    resetMotion(rec);
    rec.el.classList.add('open');
    focusWin(id);
    syncDock();
    pumpFrame(rec, 160);
  }

  function targetTransform(rec) {
    const r = rectOf(rec);
    const btn = taskbar.querySelector(`[data-app="${rec.id}"]`);
    const t = btn ? btn.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight, width: 40, height: 40 };
    // 动画 transform 作用在布局盒上并替换基础 scale(zoom)，所以系数直接用布局宽高；
    // 结束后回到 scale(zoom)，窗口从任务栏图标的位置长回视觉尺寸。
    const sx = Math.max(0.06, t.width / Math.max(1, r.width));
    const sy = Math.max(0.06, t.height / Math.max(1, r.height));
    const dx = t.left + t.width / 2 - (r.left + (r.width * sx) / 2);
    const dy = t.top + t.height / 2 - (r.top + (r.height * sy) / 2);
    return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  }

  // 每扇窗一个动画代号。快速连点时，上一次动画的收尾定时器不能清掉新一轮的样式，
  // 否则后一次动画会被前一次抹掉，窗口直接跳到终点，看起来就是一闪的残影。
  function beginMotion(rec) {
    rec.motion = (rec.motion || 0) + 1;
    return rec.motion;
  }

  function resetMotion(rec, token) {
    if (token != null && rec.motion !== token) return;
    rec.el.style.transition = '';
    rec.el.style.transform = '';
    rec.el.style.transformOrigin = '';
    rec.el.style.opacity = '';
    rec.el.style.willChange = '';
  }

  function minimizeWin(id) {
    const rec = wins.get(id);
    if (!rec || rec.minimized) return;
    rec.minimized = true;
    setSurfaceState(rec, 'sleep');
    pulse('win.minimize', { app: id }, id);
    if (INSTANT_WINDOWS()) {
      // 晚一帧再 display:none：浏览器要先按当前尺寸拍下最后一帧，
      // 窗口已经隐藏时 stageRect 是 0×0，快照会直接失败（还原时露白）。
      resetMotion(rec);
      requestAnimationFrame(() => {
        if (wins.get(id) === rec && rec.minimized) rec.el.classList.add('minimized');
      });
    } else {
      const token = beginMotion(rec);
      rec.el.style.transformOrigin = '0 0';
      rec.el.style.willChange = 'transform, opacity';
      rec.el.style.transition = `transform ${OPEN_MS}ms ${EASE}, opacity ${OPEN_MS}ms linear`;
      rec.el.style.transform = targetTransform(rec);
      rec.el.style.opacity = '0';
      setTimeout(() => {
        // 动画结束后隐藏；内联 transform 清掉，还原时从图标位置重新长出来。
        if (!rec.minimized || wins.get(id) !== rec) return;
        rec.el.classList.add('minimized');
        resetMotion(rec, token);
      }, OPEN_MS);
    }
    if (activeId === id) {
      activeId = '';
      const top = topWindow();
      if (top) focusWin(top.id);
    }
    syncDock();
    paintSurfaces();
    scheduleSession();
  }

  // 原生页面叠在壳视图之上，看不到 CSS 过渡。窗口一移动就必须逐帧报位置，
  // 否则页面留在出发地：收边后视频浮在桌面上，双击桌面也点不到，还回不来。
  function pumpFrame(rec, ms) {
    if (!rec || !rec.frame || rec.framePump) return;
    const until = Date.now() + (ms || OPEN_MS + 120);
    const tick = () => {
      rec.framePump = 0;
      if (wins.get(rec.id) !== rec) return;
      postFrame(rec);
      if (Date.now() < until) rec.framePump = requestAnimationFrame(tick);
    };
    rec.framePump = requestAnimationFrame(tick);
  }

  function flip(rec, mutate, ms) {
    const dur = ms || OPEN_MS;
    if (INSTANT_WINDOWS()) {
      // 主题本身即点即到：清掉可能残留的补间，几何一次落位。
      // 原生页面不接受缩放，连发几帧让它直接落到新矩形，比追 300ms 干净。
      beginMotion(rec);
      rec.el.style.transition = 'none';
      rec.el.style.transform = '';
      rec.el.style.transformOrigin = '';
      rec.el.style.willChange = '';
      mutate();
      void rec.el.offsetWidth;
      pumpFrame(rec, 140);
      requestAnimationFrame(() => {
        if (wins.get(rec.id) === rec && !rec.el.classList.contains('dragging')) {
          rec.el.style.transition = '';
        }
      });
      return;
    }
    const token = beginMotion(rec);
    const first = rec.el.getBoundingClientRect();
    mutate();
    const last = rec.el.getBoundingClientRect();
    if (!last.width || !last.height) return;
    // 过渡开始前先把页面拽到起点，再跟着每一帧走。
    pumpFrame(rec, dur + 80);
    // 动画 transform 替换基础 scale(zoom)，结束时再交还给 CSS 变量。
    const z = rec.zoom || 1;
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / last.width;
    const sy = first.height / last.height;
    rec.el.style.transition = 'none';
    rec.el.style.willChange = 'transform';
    rec.el.style.transformOrigin = '0 0';
    rec.el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx * z}, ${sy * z})`;
    void rec.el.offsetWidth;
    rec.el.style.transition = `transform ${dur}ms ${EASE}`;
    rec.el.style.transform = '';
    setTimeout(() => resetMotion(rec, token), dur + 20);
  }

  // 桌面双击：有收边窗口就全部展开，否则把每个窗口推进上/左/右三条边。
  // 不收底部：那里是任务栏，收进去会被胶囊挡住。
  const TUCK_EDGES = ['top', 'left', 'right'];

  // 会话恢复只留下 class、没留下收边记录时，按应用默认尺寸在原处补一份正常矩形。
  // 少了它窗口会卡在边缘：双击桌面既不展开、也不再收边，只能重启。
  function adoptTucked(rec) {
    if (!rec.el.classList.contains('tucked')) return false;
    const vp = viewport();
    const spec = (rec.app && rec.app.window) || {};
    const width = clamp(Math.round(spec.width || 1080), 320, vp.width - 40);
    const height = clamp(Math.round(spec.height || 640), 240, vp.height - 80);
    rec.tucked = {
      edge: rec.el.dataset.tuck || 'top',
      normal: { left: Math.round((vp.width - width) / 2), top: 60, width, height },
      zoom: rec.zoom || 1,
      maximized: false,
    };
    return true;
  }

  function toggleTuckAll() {
    const list = [...wins.values()].filter((r) => !r.minimized);
    const notesLive = stickies.isVisible() && stickies.count() > 0;
    if (!list.length && !notesLive) {
      toast('没有打开的窗口');
      return;
    }
    if ((notesLive && stickies.anyTucked()) || list.some((r) => r.tucked || r.el.classList.contains('tucked'))) {
      for (const rec of list) if (rec.tucked || adoptTucked(rec)) restoreTuck(rec);
      if (notesLive) stickies.untuckAll();
    } else {
      for (const rec of list) tuckWindow(rec);
      if (notesLive) stickies.tuckAll();
    }
  }

  function tuckWindow(rec) {
    if (rec.minimized || rec.tucked || rec.el.classList.contains('tucked')) return;
    const zoom = rec.zoom || 1;
    const wasMax = rec.maximized;
    // 最大化时收边要先退出最大化；恢复时再回到最大化。
    const normal = wasMax ? rec.normal : rectOf(rec);
    const edge = nearestEdge(normal, viewport(), zoom, TUCK_EDGES);
    const target = tuckRect(normal, edge, viewport(), zoom);
    if (!target) return;
    rec.tucked = { edge, normal, zoom, maximized: wasMax };
    // 收边即休眠：原生页面跟着收起。留在屏幕上的页面会盖住桌面，
    // 双击桌面的手势落在网页上，窗口就再也点不回来。
    setSurfaceState(rec, 'sleep');
    if (wasMax) {
      rec.maximized = false;
      rec.el.classList.remove('maximized');
      setMaxButton(rec);
      syncDock();
    }
    // 神灯吸附：窗户先被抽成一道弧再落进边缘。FLIP 负责位移/缩放，
    // clip-path 的关键帧负责「被吸进去」的挤压感。
    rec.el.classList.remove('tucking');
    void rec.el.offsetWidth;
    rec.el.classList.add('tucking');
    rec.el.dataset.tuck = edge;
    flip(rec, () => applyRect(rec, target), 360);
    rec.el.classList.add('tucked');
    setTimeout(() => rec.el.classList.remove('tucking'), 420);
    pulse('win.tuck', { app: rec.id, edge }, rec.id);
    scheduleSession();
  }

  function restoreTuck(rec) {
    if (!rec.tucked) adoptTucked(rec);
    const t = rec.tucked;
    if (!t) return;
    rec.tucked = null;
    rec.el.classList.remove('tucked');
    delete rec.el.dataset.tuck;
    flip(rec, () => {
      if (t.maximized) {
        rec.maximized = true;
        setZoom(rec, 1);
        rec.el.classList.add('maximized');
      } else {
        applyRect(rec, restoreRect(t.normal, viewport(), t.zoom));
        setZoom(rec, t.zoom);
      }
    }, 340);
    setMaxButton(rec);
    syncDock();
    pulse('win.untuck', { app: rec.id, edge: t.edge }, rec.id);
    scheduleSession();
    // 落稳后再叫醒页面。收边时已休眠，动画版提前唤醒会先在屏幕顶边闪一下；
    // 即点即到的主题没有这段位移，等一两帧就够，页面不该白等 360ms。
    setTimeout(() => {
      if (wins.get(rec.id) !== rec || rec.tucked) return;
      setSurfaceState(rec, rec.id === activeId ? 'active' : 'background');
      postFrame(rec);
    }, INSTANT_WINDOWS() ? 80 : 360);
  }

  // 验收钩子：壳内自动化（/c/shell.eval）用它读窗口表、复现收边与展开。
  // 只是把已有的内部状态与入口挂出来，不新增任何行为。
  window.__nexlosWin = {
    list: () => [...wins.values()].map((r) => ({
      id: r.id, state: r.state, tucked: r.tucked ? r.tucked.edge : '',
      minimized: !!r.minimized, maximized: !!r.maximized, cls: r.el.className,
    })),
    tuckAll: () => toggleTuckAll(),
    untuck: (id) => { const r = wins.get(id); if (r) restoreTuck(r); },
  };

  function toggleMax(id, force) {
    const rec = wins.get(id);
    if (!rec) return;
    // 收边状态先回到桌面，再做最大化/还原，避免两个 FLIP 抢同一个 transform。
    if (rec.tucked) { restoreTuck(rec); return; }
    const next = force == null ? !rec.maximized : force;
    if (next === rec.maximized) { focusWin(id); return; }
    if (next) rec.normal = rectOf(rec);
    // 最大化高度依赖 os-maxed（让出任务栏）。先把这个状态落定再量尺寸，
    // 否则动画到一半窗口又长高一个任务栏，底边和页面都会跳一下。
    if (next) { rec.maximized = true; syncDock(); }
    flip(rec, () => {
      if (!next) rec.maximized = false;
      // 最大化时回到 1:1，否则 100% 的窗口再乘 zoom 会溢出屏幕。
      if (next) setZoom(rec, 1);
      rec.el.classList.toggle('maximized', next);
      if (!next) {
        // 还原：先落回自由尺寸，再由 FLIP 补间。
        const r = restoreRect(rec.normal, viewport(), rec.zoom);
        rec.el.style.left = `${Math.round(r.left)}px`;
        rec.el.style.top = `${Math.round(r.top)}px`;
        rec.el.style.width = `${Math.round(r.width)}px`;
        rec.el.style.height = `${Math.round(r.height)}px`;
      }
    });
    setMaxButton(rec);
    focusWin(id);
    syncDock();
    pulse(next ? 'win.maximize' : 'win.restore', { app: id }, id);
    scheduleSession();
  }

  // 有窗口全屏时把底部胶囊推下去；离开全屏再浮上来。
  // 任务栏是液面情绪球的唯一宿主，动的是整条 bar，球跟着一起走。
  function syncDock() {
    let maxed = false;
    for (const rec of wins.values()) {
      if (rec.maximized) { maxed = true; break; }
    }
    root.classList.toggle('os-maxed', maxed);
    if (!maxed) root.classList.remove('os-dock-peek');
  }

  function confirmWindowDiscard(rec) {
    if (rec && rec.unsaved && prefs.appearance === 'win98') playClassicSound('exclamation');
    return !rec || !rec.unsaved || window.confirm(t('有未保存的调整。关闭或重新载入会丢失这些调整，仍要继续吗？'));
  }

  // immediate：批量收桌时跳过震动预热，直接销毁（否则摇完还会进预热池）。
  function closeWin(id, immediate) {
    const rec = wins.get(id);
    if (!rec) return;
    if (!confirmWindowDiscard(rec)) return;
    if (rec.gestureOff) { try { rec.gestureOff(); } catch (e) { /* 已解绑 */ } }
    if (rec.bridge && window.NexlOSHost) window.NexlOSHost.detach(rec.bridge);
    rec.bridge = null;
    wins.delete(id);
    stack = stack.filter((x) => x !== id);
    lastFocusAt.delete(id);
    // 先隐掉原生页面：它浮在整页之上，晚一步收就会在新露出的内容上多停一帧。
    setSurfaceState(rec, 'background');
    pulse('win.close', { app: id }, id);
    if (activeId === id) {
      activeId = '';
      const top = topWindow();
      if (top) focusWin(top.id);
    }
    syncDock();
    paintTaskbar();
    scheduleSession();
    // 关闭即消失：不做淡出，也不做下沉补间。现代主题只给一拍 90ms 的左右震动
    // （情绪反馈：被“抖”走的），震动结束同一帧消失。原生页面视图不跟 CSS transform，
    // 那种窗口直接摘除，否则震的是没内容的空壳。
    if (immediate || INSTANT_WINDOWS() || rec.surfaceId || rec.minimized || !canShake()) {
      finishClose(rec);
      return;
    }
    let done = false;
    const finish = (e) => {
      if (done) return;
      // 窗口里还有别的动画（转圈等），它们的 animationend 会冒泡上来，必须认名字。
      if (e && (e.target !== rec.el || e.animationName !== 'os-win-close-shake')) return;
      done = true;
      rec.el.removeEventListener('animationend', finish);
      finishClose(rec);
    };
    rec.el.addEventListener('animationend', finish);
    // 兜底：动画被系统关掉（减少动态效果）时 animationend 会立刻来；
    // 万一它不来，也不能把元素永远留在屏幕上。
    setTimeout(finish, CLOSE_SHAKE_MS + 60);
    rec.el.classList.add('closing');
  }

  // 减少动态效果时不做震动，窗口直接消失。
  function canShake() {
    return !root.classList.contains('reduce-motion')
      && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // 震动之后的收尾：能进预热池就留着（display:none），否则彻底销毁。
  function finishClose(rec) {
    rec.el.classList.remove('closing');
    if (parkWindow(rec)) return;
    rec.el.remove();
  }

  function parkWindow(rec) {
    const budget = WARM_BUDGET();
    if (budget < 1 || rec.surfaceId || !rec.frame || rec.suspended) return false;
    if (WARM_DENY.indexOf(rec.id) >= 0) return false;
    // 震动期间用户又点开了这个应用：新窗口已经在 wins 里，旧的不能留在池子里。
    if (wins.has(rec.id)) return false;
    while (parked.size >= budget) {
      const oldest = parked.keys().next().value;
      dropParked(oldest);
    }
    rec.parked = true;
    rec.el.classList.remove('active');
    rec.el.classList.add('parked');
    // 预热池里的窗口仍然要通知应用退到后台：视频/摄像头不能因为“关窗”继续跑。
    setSurfaceState(rec, 'background');
    parked.set(rec.id, rec);
    return true;
  }

  function dropParked(id) {
    const rec = parked.get(id);
    if (!rec) return;
    parked.delete(id);
    rec.parked = false;
    setSurfaceState(rec, 'closed');
    rec.el.remove();
  }

  // 重开一个还在预热池里的应用：摘掉 display:none，内容早就在那儿了。
  function reviveParked(id) {
    const rec = parked.get(id);
    if (!rec) return null;
    parked.delete(id);
    rec.parked = false;
    rec.el.classList.remove('parked');
    wins.set(id, rec);
    stack = [id, ...stack.filter((x) => x !== id)];
    keepVisible(rec);
    focusWin(id);
    syncDock();
    paintTaskbar();
    scheduleSession();
    postFrame(rec);
    return rec;
  }

  function topWindow() {
    for (const id of stack) {
      const rec = wins.get(id);
      if (rec && !rec.minimized) return rec;
    }
    return null;
  }

  function showSnapHint(zone) {
    const r = zone ? snapRect(zone, viewport()) : null;
    if (!r) {
      snapHint.hidden = true;
      return;
    }
    snapHint.hidden = false;
    snapHint.style.left = `${r.left}px`;
    snapHint.style.top = `${r.top}px`;
    snapHint.style.width = `${r.width}px`;
    snapHint.style.height = `${r.height}px`;
  }

  // 窗口内布局坐标 → 父页面视觉坐标。
  // transform: scale(z) 以左上角为原点，left/top 本身就是视觉坐标：
  // 视觉点 = (left + lx*z, top + ly*z)。拖动/缩放期间也直接写 left/top 与 --os-z，
  // 不再有“预览 transform”，所以这里不需要额外补偿。
  function visualPoint(rec, lx, ly) {
    const z = rec.zoom || 1;
    const left = parseFloat(rec.el.style.left) || 0;
    const top = parseFloat(rec.el.style.top) || 0;
    return { x: left + z * lx, y: top + z * ly };
  }

  // iframe 内的 client 坐标 → 窗口内布局坐标。iframe 自己的页面缩放会让
  // innerWidth 与元素布局宽不一致，按比例折回去；正常情况下系数是 1。
  function framePoint(rec, t) {
    const fr = rec.frame;
    let ox = 0, oy = 0, node = fr;
    while (node && node !== rec.el) { ox += node.offsetLeft; oy += node.offsetTop; node = node.offsetParent; }
    const win = fr.contentWindow;
    const iw = (win && win.innerWidth) || fr.clientWidth || 1;
    const ih = (win && win.innerHeight) || fr.clientHeight || 1;
    const kx = (fr.clientWidth || iw) / iw;
    const ky = (fr.clientHeight || ih) / ih;
    return { x: ox + t.clientX * kx, y: oy + t.clientY * ky };
  }

  const keyedFrames = new WeakSet();
  function wireClassicFrameKeys(rec) {
    if (!rec.app.internal || !rec.frame) return;
    let doc;
    try { doc = rec.frame.contentDocument; } catch (e) { return; }
    if (!doc || keyedFrames.has(doc)) return;
    keyedFrames.add(doc);
    // Listeners live on the frame document and disappear with it. Only shell
    // navigation keys cross the boundary; application editing shortcuts stay local.
    doc.addEventListener('keydown', e => {
      if (prefs.appearance !== 'win98') return;
      if (e.key !== 'F4' && !(e.altKey && (e.key === 'Tab' || e.code === 'Space'))) return;
      e.preventDefault(); e.stopPropagation();
      onKey(e);
    }, true);
    doc.addEventListener('keyup', e => {
      if (e.key === 'Alt' && switchState) onKeyUp(e);
    }, true);
  }

  // 同源 iframe 的双指手势转发：iframe 是独立文档，父页面收不到它内部的触摸。
  // 只接管“两指”这一种；单指点击、滚动仍归应用自己。画板等自带双指的页面用
  // <html data-own-pinch> 退出接管。
  const pinnedFrames = typeof WeakSet === 'function' ? new WeakSet() : null;
  function wireFramePinch(rec) {
    if (!rec.frame || !rec.gestureOff || !rec.gestureOff.pinchStart) return;
    let doc = null;
    try { doc = rec.frame.contentDocument; } catch (e) { return; }
    if (!doc || !doc.documentElement) return;
    if (doc.documentElement.hasAttribute('data-own-pinch')) return;
    if (pinnedFrames) {
      if (pinnedFrames.has(doc)) return;
      pinnedFrames.add(doc);
    }
    let d0 = 0;
    function points(e) {
      const p0 = framePoint(rec, e.touches[0]);
      const p1 = framePoint(rec, e.touches[1]);
      const a = visualPoint(rec, p0.x, p0.y);
      const b = visualPoint(rec, p1.x, p1.y);
      return { ax: a.x, ay: a.y, bx: b.x, by: b.y, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    }
    doc.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 2 || d0) return;
      const p = points(e);
      if (!rec.gestureOff.pinchStart((p.ax + p.bx) / 2, (p.ay + p.by) / 2, p.d)) return;
      d0 = p.d;
      e.preventDefault();
      // 这里不 stopPropagation：让画板等应用看到“第二根手指落下”，
      // 它们会自行取消已经开始的单指笔画；后续移动再截断，避免应用内部重复缩放。
    }, { passive: false, capture: true });
    doc.addEventListener('touchmove', (e) => {
      if (!d0 || e.touches.length !== 2) return;
      const p = points(e);
      e.preventDefault();
      e.stopPropagation();
      rec.gestureOff.pinchMove(p.d / d0, (p.ax + p.bx) / 2, (p.ay + p.by) / 2);
    }, { passive: false, capture: true });
    const end = (e) => {
      if (e.touches && e.touches.length >= 2) return;
      if (!d0) return;
      d0 = 0;
      rec.gestureOff.pinchEnd();
    };
    doc.addEventListener('touchend', end, { capture: true });
    doc.addEventListener('touchcancel', end, { capture: true });
  }

  function wireDrag(rec) {
    // 触屏窗口：单指拖标题栏移动、双击最大化/还原、双指捏合缩放。
    // 长按仍弹菜单；窗口关闭/最小化都在菜单和任务栏里，不再和拖拽抢同一根手指。
    // 判定用“粗指针”而不是屏宽：平板（Pixel C）同样是手指操作，宁可给它手势，
    // 也不要用桌面拖拽那套鼠标语义。桌面锁了整页缩放后，这里也是平板上唯一的缩放入口。
    if (isCoarse()) {
      let dragState = null;
      let pinchState = null;

      // 从最大化直接拖/捏时，先落回正常尺寸，并把抓取点对到指针下面。
      function unmaximizeUnder(x, y) {
        if (!rec.maximized) return rectOf(rec);
        const base = rectOf(rec);
        rec.maximized = false;
        rec.el.classList.remove('maximized');
        setMaxButton(rec);
        const r = clampRect({
          left: x - base.width * 0.5,
          top: y - 18,
          width: base.width,
          height: base.height,
        }, rec.app.window, viewport());
        applyRect(rec, r);
        rec.normal = r;
        return r;
      }

      rec.gestureOff = bindTitleGestures(rec.bar, rec.el, {
        surface: rec.shield,
        onPressStart: () => {
          // 观音签便签是“一碰就置顶”；窗口在按下瞬间也先抢焦点，
          // 不要等移动超过 8px 才升层。
          focusWin(rec.id);
          rec.shield.classList.add('on');
        },
        onPressEnd: () => rec.shield.classList.remove('on'),
        onLongPress: (x, y) => {
          pulse('win.menu', { app: rec.id }, rec.id);
          showCtx(x, y, [
            [rec.minimized ? '还原' : '最小化', () => (rec.minimized ? restoreWin(rec.id) : minimizeWin(rec.id))],
            ['最大化 / 还原', () => toggleMax(rec.id)],
            ['关闭', () => closeWin(rec.id)],
          ]);
        },
        onDoubleTap: () => {
          pulse('win.doubletap', { app: rec.id }, rec.id);
          toggleMax(rec.id);
        },
        onDragStart: (x, y) => {
          focusWin(rec.id);
          // 收边窗口只露出边缘一条，第一次拖动先把它拉回桌面。
          if (rec.tucked) { restoreTuck(rec); return; }
          const r = unmaximizeUnder(x, y);
          dragState = { x, y, left: r.left, top: r.top, width: r.width, height: r.height, zoom: rec.zoom || 1, moved: false, nextLeft: r.left, nextTop: r.top };
          rec.el.style.transition = 'none';
          rec.el.style.transformOrigin = '0 0';
          rec.el.classList.add('dragging');
        },
        onDrag: (dx, dy) => {
          if (!dragState) return;
          // left/top 与手指位移都是视觉像素；缩放通过基础 transform 叠加。
          const z = rec.zoom || 1;
          const next = dragRect(dragState, dx, dy, viewport());
          dragState.moved = true;
          dragState.nextLeft = next.left;
          dragState.nextTop = next.top;
          // 拖动期间只写 transform：合成器搬现成图层，不重排也不重绘 iframe。
          // 内联 transform 会覆盖 CSS 的 scale(var(--os-z))，所以把 z 一起带上。
          rec.el.style.transform = `translate3d(${next.left - dragState.left}px, ${next.top - dragState.top}px, 0) scale(${z})`;
        },
        onDragEnd: () => {
          if (!dragState) return;
          const st = dragState;
          dragState = null;
          if (!st.moved) {
            rec.el.style.transform = '';
            rec.el.style.transformOrigin = '';
            rec.el.classList.remove('dragging');
            rec.el.style.transition = '';
            return;
          }
          // 先把最终 left/top 写进去，再清 transform：两者必须落在同一帧。
          // 落点用拖动期同一组取整位移，避免松手时 1px 跳动。
          rec.el.style.left = `${roundPx(st.left + Math.round(st.nextLeft - st.left))}px`;
          rec.el.style.top = `${roundPx(st.top + Math.round(st.nextTop - st.top))}px`;
          rec.el.style.transform = '';
          rec.el.style.transformOrigin = '';
          rec.el.classList.remove('dragging');
          // 强制提交一次布局，否则浏览器会拿 CSS 里的 190ms transform 过渡
          // 把“拖动位移”补间回 0，松手时整扇窗会先弹一下再归位。
          void rec.el.offsetWidth;
          requestAnimationFrame(() => { rec.el.style.transition = ''; });
          keepVisible(rec);
          rec.normal = rectOf(rec);
          saveRect(rec);
          pulse('win.drag', { app: rec.id }, rec.id);
        },
        onPinchStart: (cx, cy) => {
          focusWin(rec.id);
          // 若第二根手指是在拖拽途中落下的，先清掉拖拽态；否则松手时会用旧 dragState 回拉。
          dragState = null;
          rec.el.classList.remove('dragging');
          // 收边窗口先拉回桌面，再照常进入缩放，不要吞掉这一次捏合。
          if (rec.tucked) restoreTuck(rec);
          unmaximizeUnder(cx, cy);
          const r = rectOf(rec);
          const z0 = rec.zoom || 1;
          pinchState = {
            z0, left0: r.left, top0: r.top, w: r.width, h: r.height,
            // 缩放圆心 = 窗口中心，逐事件同步写样式：
            // 双指中点只负责触发，不拖着窗口平移，松手后位置可预期。
            cx0: r.left + (r.width * z0) / 2,
            cy0: r.top + (r.height * z0) / 2,
            left: r.left, top: r.top, z: z0, moved: false,
          };
          // 清掉可能残留的拖拽 translate；缩放直接写 left/top + --os-z。
          rec.el.style.transform = '';
          rec.el.style.transformOrigin = '';
          rec.el.style.transition = 'none';
          rec.el.classList.add('zooming');
        },
        onPinch: (scale, cx, cy) => {
          if (!pinchState) return;
          const z = clampZoom(pinchState.z0 * scale);
          // 便签的捏合只锚中心、不夹边界；窗口照搬会出事：577 高的窗口 2 倍就是 1154，
          // 标题栏会被顶出屏幕，拖不回来。这里沿用便签拖拽的 44/28 可见性原则做夹取，
          // 未触边时圆心严格不动，只有会丢掉可抓条时才让圆心让位。
          const lim = grabLimits(pinchState.w, pinchState.h, z);
          const left = Math.min(Math.max(pinchState.cx0 - (pinchState.w * z) / 2, lim.leftMin), lim.leftMax);
          const top = Math.min(Math.max(pinchState.cy0 - (pinchState.h * z) / 2, lim.topMin), lim.topMax);
          // 缩放与位置同帧落地：没有“合成器预览 → 提交 zoom”的切换，松手不会跳。
          setZoom(rec, z);
          rec.el.style.left = `${left}px`;
          rec.el.style.top = `${top}px`;
          pinchState.left = left;
          pinchState.top = top;
          pinchState.z = z;
          pinchState.moved = true;
        },
        onPinchEnd: () => {
          const st = pinchState;
          pinchState = null;
          if (!st) return;
          rec.el.classList.remove('zooming');
          rec.el.style.transition = '';
          if (!st.moved) return;
          // 最后一帧已经是最终视觉状态，只收亚像素；不做二次夹取或补提交。
          rec.el.style.left = `${roundPx(st.left)}px`;
          rec.el.style.top = `${roundPx(st.top)}px`;
          rec.normal = rectOf(rec);
          saveRect(rec);
          pulse('win.zoom', { app: rec.id, zoom: rec.zoom }, rec.id);
        },
      });
      return;
    }

    let drag = null;
    rec.bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button, a, input, select')) return;
      if (rec.tucked) {
        focusWin(rec.id);
        restoreTuck(rec);
        e.preventDefault();
        return;
      }
      const r = rectOf(rec);
      drag = {
        x: e.clientX, y: e.clientY, left: r.left, top: r.top,
        width: r.width, height: r.height, zoom: rec.zoom || 1,
        wasMax: rec.maximized, moved: false, zone: null, tx: 0, ty: 0,
      };
      // 拖动期间关闭过渡：位置由 transform 直接跟手，合成器只搬图层。
      // .dragging 只为这段手势临时升层，松手即撤（app.css）。
      rec.el.classList.add('dragging');
      rec.el.style.transition = 'none';
      try { rec.bar.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有真实指针，忽略 */ }
      // 兜底：指针在窗口外松开也要收尾，否则窗口会带着未提交的 transform 卡住。
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      focusWin(rec.id);
      e.preventDefault();
    });

    // 指针移动按帧合并：一帧最多写一次 transform，和浏览器合成节奏对齐。
    const onMove = rafThrottle((e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      // 从最大化直接拖走时，先还原成正常尺寸，避免窗口被拽成整屏。
      if (drag.wasMax) {
        rec.maximized = false;
        rec.el.classList.remove('maximized');
        setMaxButton(rec);
        const nr = clampRect({
          left: e.clientX - drag.width * 0.5,
          top: e.clientY - 18,
          width: drag.width, height: drag.height,
        }, rec.app.window, viewport());
        applyRect(rec, nr);
        drag = {
          x: e.clientX, y: e.clientY, left: nr.left, top: nr.top,
          width: nr.width, height: nr.height, zoom: rec.zoom || 1,
          wasMax: false, moved: true, zone: null, tx: 0, ty: 0,
        };
        return;
      }
      // 只写 transform：不触发布局，也不重绘 1100×720 的 iframe。
      // 鼠标坐标、left/top 都是视觉像素；基础 scale(zoom) 一起带上。
      const z = drag.zoom || 1;
      const next = dragRect(drag, dx, dy, viewport());
      drag.tx = next.left - drag.left;
      drag.ty = next.top - drag.top;
      rec.el.style.transform = `translate3d(${Math.round(drag.tx)}px, ${Math.round(drag.ty)}px, 0) scale(${z})`;
      drag.zone = snapZone({ x: e.clientX, y: e.clientY }, viewport());
      showSnapHint(drag.zone);
      postFrame(rec);
    });
    rec.bar.addEventListener('pointermove', onMove);

    const end = () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!drag) { onMove.cancel(); return; }
      onMove.flush();
      const d = drag;
      drag = null;
      onMove.cancel();
      showSnapHint(null);
      rec.el.classList.remove('dragging');
      if (!d.moved) {
        // 只是点了一下标题栏：拖动期的过渡设置撤掉即可，不要碰位置。
        rec.el.style.transition = '';
        return;
      }
      // 落点和拖动期最后一帧用同一组取整值，避免松手时 1px 抖动。
      const tx = Math.round(d.tx);
      const ty = Math.round(d.ty);
      // 拖动期渲染的是 d.left + 取整后的位移，落点必须逐像素对齐它。
      const dropLeft = roundPx(d.left + tx);
      const dropTop = roundPx(d.top + ty);
      rec.el.style.left = `${dropLeft}px`;
      rec.el.style.top = `${dropTop}px`;
      rec.el.style.transform = '';
      rec.el.style.transformOrigin = '';
      // 位置与 transform 必须同帧提交，提交前过渡保持 none：否则基类的
      // 190ms transform 过渡会把刚清掉的拖动位移再补间一遍，松手时整扇窗弹一下。
      void rec.el.offsetWidth;
      if (d.zone === 'maximize') {
        rec.el.style.transition = '';
        if (!rec.maximized) toggleMax(rec.id, true);
        return;
      }
      if (d.zone) {
        rec.el.style.transition = '';
        // 贴边前记住自由尺寸，再次拖动或还原时能回到原来的窗口。
        rec.normal = { left: dropLeft, top: dropTop, width: d.width, height: d.height };
        // 贴边矩形按工作区布局算；先回到 1:1，否则视觉尺寸会溢出贴边区域。
        flip(rec, () => { setZoom(rec, 1); applyRect(rec, snapRect(d.zone, viewport())); });
        pulse('win.snap', { app: rec.id, zone: d.zone }, rec.id);
        scheduleSession();
        return;
      }
      requestAnimationFrame(() => {
        // 下一帧可能已经开始下一次拖动：那就把过渡留给那一次手势。
        if (!rec.el.classList.contains('dragging')) rec.el.style.transition = '';
      });
      if (!rec.maximized) rec.normal = rectOf(rec);
      saveRect(rec);
      postFrame(rec);
    };
    rec.bar.addEventListener('pointerup', end);
    rec.bar.addEventListener('pointercancel', end);
    // 双击标题栏最大化/还原，Windows 的肌肉记忆。
    rec.bar.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, a, input, select')) return;
      if (rec.tucked) { restoreTuck(rec); return; }
      toggleMax(rec.id);
    });
  }

  // 手机上横滑标题栏：在已打开的窗口之间循环切换。
  function switchWindow(dir) {
    const order = stack.map((id) => wins.get(id)).filter((r) => r && !r.minimized);
    if (order.length < 2) return;
    const at = order.findIndex((r) => r.id === activeId);
    const next = order[(at + dir + order.length) % order.length];
    if (!next) return;
    focusWin(next.id);
    if (INSTANT_WINDOWS()) { pumpFrame(next, 160); return; }
    // 切窗只给位移，不做透明度渐显：淡入淡出会让用户觉得“还有一个动画在跑”。
    next.el.style.transition = 'none';
    next.el.style.transform = `translate3d(${dir > 0 ? 14 : -14}px,0,0) scale(${next.zoom || 1})`;
    void next.el.offsetWidth;
    next.el.style.transition = `transform ${OPEN_MS}ms ${EASE}`;
    next.el.style.transform = '';
    const token = beginMotion(next);
    setTimeout(() => resetMotion(next, token), OPEN_MS + 20);
    pulse('win.switch', { app: next.id, dir }, next.id);
  }

  function wireResize(rec) {
    for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const handle = h('span', { class: `os-resize ${dir}`, dataset: { dir } });
      rec.el.append(handle);
      let start = null;
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || window.innerWidth <= MOBILE_BREAKPOINT) return;
        e.stopPropagation();
        e.preventDefault();
        start = { x: e.clientX, y: e.clientY, rect: rectOf(rec), dir };
        handle.setPointerCapture(e.pointerId);
        focusWin(rec.id);
      });
      const onMove = rafThrottle((e) => {
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        // 缩放手柄在 scale(zoom) 里，视觉位移要折回布局像素再改宽高。
        const z = rec.zoom || 1;
        applyRect(rec, resizeRect(start.rect, dx / z, dy / z, dir, rec.app.window, viewport()));
        postFrame(rec);
      });
      handle.addEventListener('pointermove', onMove);
      const end = () => {
        if (!start) return;
        onMove.flush();
        start = null;
        onMove.cancel();
        if (!rec.maximized) rec.normal = rectOf(rec);
        saveRect(rec);
        postFrame(rec);
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    }
  }

  function isTyping(e) {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return false;
    return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
  }

  function snapActive(zone) {
    const rec = wins.get(activeId);
    if (!rec) return;
    if (!rec.maximized) rec.normal = rectOf(rec);
    // 最大化状态先退出再贴边，整个变化交给 FLIP 补间，避免瞬间跳一帧。
    flip(rec, () => {
      rec.maximized = false;
      rec.el.classList.remove('maximized');
      setZoom(rec, 1);
      applyRect(rec, snapRect(zone, viewport()));
    });
    setMaxButton(rec);
    pulse('win.snap', { app: rec.id, zone }, rec.id);
    scheduleSession();
  }

  function onKey(e) {
    if (e.defaultPrevented) return;
    // A modal owns shortcuts even when browser chrome or a download has
    // moved focus outside its controls. Never close the desktop behind it.
    if (classicDialog) {
      if (e.key === 'Escape' || e.altKey && e.key === 'F4') {
        e.preventDefault();
        classicDialog.close();
      }
      return;
    }
    if (prefs.appearance === 'win98') {
      if (e.altKey && e.key === 'F4') { e.preventDefault(); if (activeId) closeWin(activeId); else showClassicDialog('shutdown'); return; }
      if (e.altKey && e.code === 'Space') {
        const rec = wins.get(activeId);
        if (rec) { e.preventDefault(); const r = rec.bar.getBoundingClientRect(); showClassicWindowContext(rec, r.left + 3, r.bottom); }
        return;
      }
      if (!isTyping(e) && (e.key === 'ContextMenu' || e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = desktop.getBoundingClientRect(); showClassicDesktopContext(r.left + 16, r.top + 16); return; }
      if (!isTyping(e) && e.key === 'F5') { e.preventDefault(); refreshApps(true); return; }
      if (!isTyping(e) && e.altKey && e.key === 'Enter') { e.preventDefault(); openApp(apps.get('settings')); return; }
    }
    // Ctrl+Esc 是 Windows 的「开始」备用键，也是 macOS 上不被系统占用的等价入口
    // （macOS 把 F4 固定给了启动台，按键到不了应用）。
    if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'Escape') {
      e.preventDefault();
      toggleStart();
      return;
    }
    if (e.key === 'Escape') {
      if (switchState) { cancelSwitcher(); return; }
      if (ctxMenu.hidden === false) { closeCtx(); return; }
      if (clockPop.hidden === false) { closeClockPop(); return; }
      if (trayPop.hidden === false) { closeTrayPop(); return; }
      if (notifyPop.hidden === false) { closeNotifyPop(); return; }
      if (cmdMenuOpen) { closeCmdMenu(); return; }
      if (spaceVisible) { closeSpace(); return; }
      if (startOpen) { closeStart(); return; }
    }
    // 任务视图翻卡：画展长廊靠左右键和滚轮换焦点。
    if (switchState && switchState.mode === 'view') {
      const n = switchState.ids.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        switchState.index = ((switchState.index + (e.key === 'ArrowRight' ? 1 : -1)) % n + n) % n;
        renderSwitcher();
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); commitSwitcher(); return; }
    }
    if (e.key === 'F4' && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleStart(); return; }
    // Alt+Tab 要抢在输入框判断之前：正在写正文时也应该能切走。
    if (e.altKey && e.key === 'Tab') {
      e.preventDefault();
      openSwitcher(e.shiftKey ? -1 : 1);
      return;
    }
    // 便利贴热键：⌘/Ctrl + ⌥/Alt + N，和系统便利贴一样随时往桌面贴一张。
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyN') {
      e.preventDefault();
      stickies.newNote();
      return;
    }
    // 写作区是 textarea：不拦输入框内的按键，否则会毁掉正文编辑。
    if (isTyping(e)) return;
    if (!activeId) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'w') { e.preventDefault(); closeWin(activeId); return; }
    if (mod && e.key.toLowerCase() === 'm') { e.preventDefault(); minimizeWin(activeId); return; }
    if (mod && e.key === 'ArrowLeft') { e.preventDefault(); snapActive('left-half'); return; }
    if (mod && e.key === 'ArrowRight') { e.preventDefault(); snapActive('right-half'); return; }
    if (mod && e.key === 'ArrowUp') { e.preventDefault(); toggleMax(activeId, true); return; }
    if (mod && e.key === 'ArrowDown') {
      e.preventDefault();
      const rec = wins.get(activeId);
      if (rec && rec.maximized) toggleMax(activeId, false);
      else minimizeWin(activeId);
    }
  }

  function onKeyUp(e) {
    // 松开 Alt 才落定，按住期间可以连续 Tab 改选，和 Windows 一致。
    if (e.key === 'Alt' && switchState && switchState.mode === 'cycle') commitSwitcher();
  }

  function onDocPointer(e) {
    // 任务栏的开始/搜索按钮自己负责开合，pointerdown 先关再 click 会变成“关不掉”。
    if (startOpen && !startMenu.contains(e.target) && !e.target.closest('.os-tb-start, .os-tb-searchbox')) closeStart();
    if (ctxMenu.hidden === false && !ctxMenu.contains(e.target)) closeCtx();
    if (switchState && switchState.mode === 'view' && !switcher.contains(e.target)) cancelSwitcher();
    if (clockPop.hidden === false && !clockPop.contains(e.target) && !e.target.closest('.os-tb-clock, .os-tb-bell, .os-deskclock')) closeClockPop();
    if (trayPop.hidden === false && !trayPop.contains(e.target) && !e.target.closest('.os-tb-tray')) closeTrayPop();
    if (notifyPop.hidden === false && !notifyPop.contains(e.target) && !e.target.closest('.os-tb-bell')) closeNotifyPop();
    if (peekEl && !peekEl.contains(e.target) && !e.target.closest('.os-tb-app')) hidePeekNow();
  }

  function onResize(keyboard) {
    safeBottomPx = -1;
    syncMetrics();
    // 网格是按当前视口算的绝对坐标；尺寸一变先退回桌面，避免错位。
    if (taskViewOn && !keyboard) closeTaskView(false);
    // 软键盘弹出时只压缩窗口内容，不重排窗口几何；否则输入框会跟着跳。
    if (keyboard) return;
    // 宽度变化（横竖屏切换、宿主面板收窄）必须把窗口收回工作区；
    // 移动端地址栏伸缩只改高度，保持原几何，免得输入时窗口跳动。
    const widthChanged = Math.abs(window.innerWidth - lastViewportWidth) > 1;
    lastViewportWidth = window.innerWidth;
    const mobileHold = window.innerWidth <= MOBILE_BREAKPOINT && prefs.appearance !== 'win98';
    if (mobileHold && !widthChanged) { enforceSurfaceBudget(); return; }
    if (widthChanged) {
      // 宿主侧栏收起/展开是一段动画，宽度会连续经过多帧；fitRect 只收不放，
      // 按过渡帧收窗会把窗口钉在最窄的一帧（实测 760 → 110）。
      // 等宽度稳定后再收，用的就是最终视口。
      clearTimeout(resizeSettleTimer);
      resizeSettleTimer = setTimeout(refitWindows, 160);
    } else {
      refitWindows();
    }
    // 横竖屏切换会改变“手机 / 平板”的预算档位。
    enforceSurfaceBudget();
  }

  // 收边窗口的位置由 tuckRect 决定：视口变化不能把它拉回屏内，
  // 否则会留下「标记已收边、实际停在桌面」的半状态，下一次双击就对不上。
  function refitWindows() {
    for (const rec of wins.values()) {
      if (rec.tucked || rec.maximized) continue;
      applyRect(rec, fitRect(rectOf(rec), viewport()));
      // iframe 里收不到父层尺寸变化引起的舞台位移，必须显式给一针，
      // 否则原生页面停在旧矩形上，缩窗后画面溢出到桌面。
      postFrame(rec);
    }
  }

  // 页面被切到后台：通知应用暂停取景与画面；不卸载 iframe，音乐可以继续。
  function onVisibility() {
    const hidden = document.visibilityState === 'hidden';
    for (const rec of wins.values()) {
      if (!rec.frame) continue;
      postLifecycle(rec, hidden ? 'hidden' : (rec.id === activeId ? 'active' : 'background'));
    }
    if (hidden) flushSession();
  }

  function restoreSession() {
    if (!bootSession || !bootSession.windows.length) return;
    restoring = true;
    try {
      for (const w of bootSession.windows) {
        const app = apps.get(w.app);
        if (app) openWindow(app, { restore: w });
      }
    } finally {
      restoring = false;
    }
    paintSurfaces();
  }

  async function refreshApps(manual) {
    try {
      const r = await api('app.list');
      // 服务端顺序就是桌面与任务栏顺序。Map 对已存在的键保留插入位置，
      // 所以这里重建一张表，而不是在原表上 set，否则新应用会被旧兜底顺序压在后面。
      const next = new Map();
      for (const raw of r.append || []) {
        const prev = apps.get(raw.id) || {};
        next.set(raw.id, decorate({ ...prev, ...raw }));
      }
      apps.clear();
      for (const [id, app] of next) apps.set(id, app);
      syncSurfaces();
      if (manual) toast(`应用状态已刷新 · 当前可用应用 ${apps.size} 个`);
    } catch (e) {
      if (manual) toast(e.message, 'error');
    }
  }

  function applyWallpaperFile(file) {
    const appearance = prefs.appearance;
    const field = wallpaperField(appearance);
    const key = wallpaperKey(appearance);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      // 统一压到 1920 宽，避免把几 MB 的原图塞进 localStorage。
      const scale = Math.min(1, 1920 / Math.max(1, img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      let previous = null;
      try {
        const data = canvas.toDataURL('image/jpeg', 0.82);
        previous = localStorage.getItem(key);
        localStorage.setItem(key, data);
        const r = await api('settings.set', { method: 'POST', fields: { [field]: 'custom' } });
        applyPrefs(r.detail);
        broadcastPrefs(r.detail);
        toast('壁纸已更换');
      } catch (e) {
        try { if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key, previous); } catch (restoreError) { /* Storage may be unavailable. */ }
        toast(`壁纸未更换：${e.message}`);
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('读不到这张图片'); };
    img.src = url;
  }

  async function resetWallpaper() {
    try {
      const field = wallpaperField(prefs.appearance);
      const r = await api('settings.set', { method: 'POST', fields: { [field]: 'default' } });
      applyPrefs(r.detail);
      broadcastPrefs(r.detail);
      toast('已恢复当前主题的默认壁纸');
    } catch (e) { toast(`壁纸未更换：${e.message}`); }
  }

  function resetDesktop() {
    for (const id of [...wins.keys()]) closeWin(id, true);
    for (const id of [...parked.keys()]) dropParked(id);
    clearSession(localStorage);
    toast('桌面布局已重置');
  }

  // ---------- 设置：主题 / 强调色 / 壁纸 / 时钟 ----------

  function applyPrefs(patch) {
    const previousAppearance = prefs.appearance;
    if (patch) {
      prefsRevision += 1;
      prefs = Object.assign({}, prefs, patch);
    }
    const languageChanged = prefs.language !== getLanguage();
    setLanguage(prefs.language || 'en');
    // 语言也留一份本地缓存：内核不可用时，hello 引导的选择仍能沿用到下次启动。
    try { localStorage.setItem(`${STORE}lang`, prefs.language || 'en'); } catch (e) { /* 隐私模式不持久化 */ }
    applyAppearance(prefs.appearance);
    applyTypography(prefs);
    if (prefs.appearance === 'win98') bootController = startClassicBoot({ reduceMotion: prefs.reduceMotion });
    else {
      if (bootController) bootController.cancel();
      stopClassicStartupSound();
      if (powerOffLayer) { powerOffLayer.remove(); powerOffLayer = null; root.inert = false; }
    }
    if (previousAppearance !== prefs.appearance) {
      closeCtx();
      closeStart();
      renderIcons();
      // 现代主题的日历/快速设置/通知中心不能留在千禧桌面上。
      closeClockPop();
      closeTrayPop();
      closeNotifyPop();
      if (classicDialog) classicDialog.close();
      cmdInput.placeholder = prefs.appearance === 'win98' ? '查找应用、窗口与设置' : '下命令 · Enter 执行';
      closeSpace();
    }
    syncMetrics();
    paintTaskbar();
    for (const rec of wins.values()) {
      if (rec.tucked && previousAppearance !== prefs.appearance) {
        const t = rec.tucked;
        applyRect(rec, tuckRect(t.normal, t.edge, viewport(), t.zoom));
      } else if (!rec.tucked && !rec.maximized) keepVisible(rec);
    }
    root.classList.toggle('dark', prefs.theme === 'dark');
    syncClockTheme();
    root.classList.toggle('reduce-motion', !!prefs.reduceMotion);
    root.style.setProperty('--os-accent', prefs.accent || '#0078d4');
    applyWallpaper();
    const name = prefs.name || 'NexlOS';
    if (startHelloName) startHelloName.textContent = `您好，${name}`;
    if (startUserName) startUserName.textContent = name;
    if (startAvatar) startAvatar.textContent = name.slice(0, 1).toUpperCase();
    paintClock();
    paintAppearanceToggle();
    companion.sync(prefs);
    // 语言是外壳级偏好：只有语言真的变了才重译整棵 DOM。
    // 换主题时也全量遍历 2500 个节点，实测会冻住主线程 0.6–0.7s。
    if (languageChanged) {
      localizeDoc(document, true);
      // localizeDoc 只改文本节点；按钮 title/aria-label 要显式跟一次语言。
      const startButton = document.querySelector('.os-tb-start');
      if (startButton) {
        startButton.title = t('开始') + ' (F4 / Ctrl+Esc)';
        startButton.setAttribute('aria-label', t('开始'));
      }
      localizeFrames(document, true);
    }
  }

  function paintAppearanceToggle() {
    const btn = taskbar.querySelector('.os-theme-toggle');
    if (!btn) return;
    const retro = prefs.appearance === 'win98';
    btn.setAttribute('aria-checked', String(retro));
    btn.disabled = appearanceBusy;
    btn.title = retro ? '切换为 NEXL现代主题' : '切换为 Windos2026';
    btn.querySelector('.os-theme-toggle-label').textContent = retro ? '现代主题' : 'Windos2026';
  }

  function broadcastPrefs(patch) {
    for (const rec of wins.values()) {
      if (!rec.app.internal || !rec.frame || !rec.frame.contentWindow) continue;
      rec.frame.contentWindow.postMessage({ type: 'nexlos.settings', patch }, location.origin);
    }
  }

  async function toggleAppearance() {
    if (appearanceBusy) return;
    appearanceBusy = true;
    paintAppearanceToggle();
    try {
      const appearance = prefs.appearance === 'win98' ? 'current' : 'win98';
      const r = await api('settings.set', { method: 'POST', fields: { appearance } });
      const patch = r.detail || { appearance };
      applyPrefs(patch);
      broadcastPrefs(patch);
      toast(appearance === 'win98' ? '已切换为 Windos2026' : '已切换为 NEXL现代主题');
    } catch (e) {
      toast(`外观未切换：${e.message}`);
    } finally {
      appearanceBusy = false;
      paintAppearanceToggle();
    }
  }

  // 现代主题只保留一张图片壁纸：丹霞碧水。
  // 旧配置里的 default/canyon/valley 在 applyWallpaper 中回退到 snowfog。
  const WALL_IMAGES = {
    snowfog: '/a/wallpapers/galaxy.webp',
  };

  function applyWallpaper() {
    const retro = RETRO_BACKGROUNDS.find(w => w.id === (prefs.retroWallpaper === 'bliss' ? 'default' : prefs.retroWallpaper)) || RETRO_BACKGROUNDS[0];
    root.style.setProperty('--retro-desktop-color', retro.color || '#008080');
    let retroImage = retro.image || '';
    if (prefs.retroWallpaper === 'custom') {
      try { retroImage = localStorage.getItem(wallpaperKey('win98')) || ''; } catch (e) { /* Use classic teal without local storage. */ }
    }
    root.style.setProperty('--retro-wallpaper', retroImage ? `url(${retroImage})` : 'none');
    if (prefs.wallpaper === 'custom') {
      let saved = '';
      try { saved = localStorage.getItem(`${STORE}wallpaper`) || ''; } catch (e) { saved = ''; }
      wallpaper.style.backgroundImage = saved ? `url(${saved})` : '';
      return;
    }
    const image = WALL_IMAGES[prefs.wallpaper] || WALL_IMAGES.snowfog;
    wallpaper.style.backgroundImage = `url("${image}")`;
  }

  // 外链统一走内置浏览器：pending 供新挂载的页面自取，消息供已挂载的页面即时打开；
  // token 保证两条路径先后到达时只开一个标签页。
  function openExternalUrl(url) {
    const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try {
      sessionStorage.setItem('nexlos.browser.pending', JSON.stringify({ url, token }));
    } catch (e) { /* 隐私模式：只靠消息投递 */ }
    const app = apps.get('browser');
    if (!app) return;
    openApp(app);
    let tries = 0;
    const deliver = () => {
      const rec = wins.get('browser');
      if (!rec || !rec.frame || !rec.frame.contentWindow) return false;
      try {
        rec.frame.contentWindow.postMessage({ type: 'nexlos.browser.openUrl', url, token }, location.origin);
        return true;
      } catch (e) {
        return false;
      }
    };
    const pump = () => {
      if (deliver()) return;
      if (++tries < 15) setTimeout(pump, 200);
    };
    pump();
  }

  // 设置窗口是 iframe：它只管写 settings.json，外壳收到补丁后当场应用。
  function onSettingsMessage(e) {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    const d = e.data;
    if (d.type === 'nexlos.clockZoom') {
      // 只认子午流注钟自己发来的双击：放大到 1.3 倍再双击还原。
      if (e.source === deskClockFrame.contentWindow) deskClock.classList.toggle('zoomed');
      return;
    }
    if (d.type === 'nexlos.focus') {
      // iframe 内的点击不冒泡到父页面：由应用主动请求把窗口提到最前。
      for (const rec of wins.values()) {
        if (rec.frame && rec.frame.contentWindow === e.source) { focusWin(rec.id); break; }
      }
      return;
    }
    if (d.type === 'nexlos.win' && typeof d.action === 'string') {
      // 应用请求改窗口外框：音乐曲库的「先问方向，再向右/左展开，收起还原」。
      for (const rec of wins.values()) {
        if (!rec.frame || rec.frame.contentWindow !== e.source) continue;
        if (d.action === 'plan') planGrow(rec, Number(d.delta) || 0);
        else if (d.action === 'growLeft') growWindow(rec, d.open !== false, Number(d.delta) || 0, d.side === 'left' ? 'left' : 'right');
        break;
      }
      return;
    }
    if (d.type === 'nexlos.surface') {
      // 浏览器把当前页面视图的会话标识报上来；切走这扇窗时外壳可以直接收起它。
      for (const rec of wins.values()) {
        if (rec.frame && rec.frame.contentWindow === e.source) { rec.surfaceId = d.id; break; }
      }
      return;
    }
    if (d.type === 'nexlos.wantLifecycle') {
      // 应用挂载晚于 iframe load 时补发一次状态：否则窗口模式下的浏览器
      // 不会认为自己在前台，原生 Surface 永远不会创建。
      for (const rec of wins.values()) {
        if (!rec.frame || rec.frame.contentWindow !== e.source) continue;
        if (!rec.state) rec.state = rec.id === activeId ? 'active' : 'background';
        postLifecycle(rec, rec.state);
        postChrome(rec);
        postFrame(rec);
        break;
      }
      return;
    }
    if (d.type === 'nexlos.settings' && d.patch) {
      applyPrefs(d.patch);
      // Keep live internal frames intact, including unsaved writing buffers.
      broadcastPrefs(d.patch);
    } else if (d.type === 'nexlos.sound' && [...wins.values()].some(rec => rec.app.internal && rec.frame && rec.frame.contentWindow === e.source)) playClassicSound(d.name);
    else if (d.type === 'nexlos.sound.settings' && prefs.appearance === 'win98') showClassicDialog('sounds');
    else if (d.type === 'nexlos.startup' && prefs.appearance === 'win98') replayClassicStartup();
    else if (d.type === 'nexlos.open' && d.app) openApp(apps.get(d.app));
    else if (d.type === 'nexlos.openSystem') openApp(apps.get('system'));
    else if (d.type === 'nexlos.openUrl' && typeof d.url === 'string') {
      // 扫码 / 应用内链接统一交给内置浏览器：外部窗口拿不到 NexlOS 的登录态。
      if (!/^https?:\/\//i.test(d.url)) return;
      openExternalUrl(d.url);
    }
    else if (d.type === 'nexlos.pickWallpaper') wallInput.click();
  }
  window.addEventListener('message', onSettingsMessage);
  const guardUnsavedWindows = (event) => {
    if (![...wins.values()].some(rec => rec.unsaved)) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', guardUnsavedWindows);

  function syncSurfaces() {
    renderIcons();
    renderTaskbar();
    if (startOpen) renderStartGrid();
  }

  syncMetrics();
  renderIcons();
  renderTaskbar();
  // 先按默认语言接管 DOM；settings.get 回来后会按保存的语言重译。
  setLanguage(prefs.language);
  observeDoc(document);
  localizeDoc(document);
  const prefsRequestedAt = prefsRevision;
  api('settings.get').then((r) => {
    if (prefsRevision === prefsRequestedAt) {
      applyPrefs(r.detail || {});
      broadcastPrefs(prefs);
      maybeSuggestSystemLanguage();
    }
  }).catch(() => { if (prefsRevision === prefsRequestedAt) applyPrefs(); });
  refreshApps().then(() => {
    // 应用清单回来后就预填开始菜单，首次打开只剩一次 class 切换。
    renderStartGrid();
    warmStartPanel();
    // 先恢复上次的窗口集合，再处理深链接：外部打开的应用最后聚焦。
    restoreSession();
    resumeRunning();
    const want = new URLSearchParams(location.search).get('open');
    if (want && apps.get(want)) openApp(apps.get(want));
  });

  const clockTimer = setInterval(paintClock, 30000);

  return {
    root,
    destroy() {
      flushSession();
      clearInterval(clockTimer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('touchstart', blockPageZoom);
      document.removeEventListener('touchmove', blockPageZoom);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', guardUnsavedWindows);
      if (viewportWatcher && viewportWatcher.off) viewportWatcher.off();
      clearTimeout(resizeSettleTimer);
      window.removeEventListener('pagehide', flushSession);
      window.removeEventListener('blur', cancelSwitcher);
      window.removeEventListener('message', onSettingsMessage);
      root.classList.remove('dark', 'reduce-motion');
      if (classicDialog) classicDialog.close();
      closeStart();
      classicStart.destroy();
      classicContext.destroy();
      if (stopKeyboardAdjust) stopKeyboardAdjust(false);
      if (bootController) bootController.cancel();
      stopClassicStartupSound();
      stopClassicSounds();
      companion.destroy();
      if (powerOffLayer) powerOffLayer.remove();
      closeCtx();
      for (const rec of wins.values()) {
        if (rec.gestureOff) { try { rec.gestureOff(); } catch (e) { /* 已解绑 */ } }
        if (rec.frame) { try { rec.frame.src = 'about:blank'; } catch (e) { /* ignore */ } }
      }
      wins.clear();
      stack = [];
      root.remove();
      document.body.classList.remove('os-mode');
      if (singleton === this) singleton = null;
    },
  };
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}

function storedLanguage(fallback) {
  try { return localStorage.getItem(`${STORE}lang`) || fallback; } catch (e) { return fallback; }
}

function markRecent(id) {
  const list = readRecentApps();
  const next = [id, ...list.filter((x) => x !== id)].slice(0, 6);
  try { localStorage.setItem(`${STORE}recent`, JSON.stringify(next)); } catch (e) { /* 隐私模式不阻塞桌面 */ }
}

// 最近应用：改名前的旧标识读取即迁到新标识，开始菜单与写回都只见新标识。
function readRecentApps() {
  const list = readJSON(`${STORE}recent`, []);
  return Array.isArray(list) ? list.map(normalizeAppId) : [];
}

function toast(msg, options) {
  const opts = options || {};
  let t = document.querySelector('.toast');
  if (!t) {
    t = h('div', { class: 'toast', 'data-i18n-content': '打开汇报' });
    // 挂在 .os 里才能拿到 --os-dock-h：右下角回执要贴着任务栏上沿。
    const host = document.querySelector('.os') || document.body;
    host.append(t);
  }
  t.textContent = msg;
  t.dataset.kind = 'info';
  t.classList.toggle('is-corner', !!opts.corner);
  t.classList.toggle('is-actionable', !!opts.onclick);
  t.onclick = opts.onclick || null;
  // 回执的第二行与 title 默认指「打开汇报」；调用方给了自己的提示就照用，给空串则收起。
  t.setAttribute('data-i18n-content', typeof opts.hint === 'string' ? opts.hint : '打开汇报');
  t.title = typeof opts.title === 'string' ? opts.title : (opts.onclick ? '点击打开运行汇报' : '');
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), opts.ms || 2800);
}
