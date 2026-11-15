/**
 * NexlOS 桌面入口注入器 —— 由 `nexlos install` 写进 Octop Dashboard 的静态目录，
 * 通过 index.html 的一个 <script> 标签加载。
 *
 * 只做三件事：
 *   1. 在左侧导航里放一个「NexlOS 桌面」项，样式从宿主现有按钮克隆，跟随主题；
 *   2. 点击时在右侧主工作区盖一层 iframe，加载独立 Node 服务上的 NexlOS WebOS；
 *   3. 切换回宿主其它导航时自动收起，重复点击复用同一个 iframe。
 *
 * 不覆盖 Octop 的全局 CSS，不改 React 状态，不接管登录。卸载时整段移除。
 * 依赖 DOM 锚点是兼容实验：宿主改版后需要重新核对锚点，见 README「已知边界」。
 */
(function () {
  'use strict';

  // 用 localhost 而不是 127.0.0.1：宿主在 127.0.0.1:8088，两者同站会被 Chrome
  // 放进同一个渲染进程，Octop 的长任务会直接卡住桌面的主线程。换个站点名后
  // 浏览器按跨站 iframe 处理，桌面拿到独立进程与主线程。
  var IFRAME_URL = window.__NEXLOS_DESKTOP_URL__ || 'http://localhost:8090/';
  var LABEL = 'NexlOS 桌面';
  var ENTRY_ID = 'nexlos-entry-item';
  var OVERLAY_ID = 'nexlos-desktop-overlay';
  var ICON_PATHS = [
    ['#EF4B23', 'M33.92,16 105.6,16 105.6,33.92 123.52,33.92 123.52,51.84 141.44,51.84 141.44,87.68 105.6,87.68 105.6,69.76 87.68,69.76 87.68,51.84 51.84,51.84 51.84,98.56 16,98.56 16,33.92 33.92,33.92Z'],
    ['#73B534', 'M240,33.92 240,105.6 222.08,105.6 222.08,123.52 204.16,123.52 204.16,141.44 168.32,141.44 168.32,105.6 186.24,105.6 186.24,87.68 204.16,87.68 204.16,51.84 157.44,51.84 157.44,16 222.08,16 222.08,33.92Z'],
    ['#F4D632', 'M222.08,240 150.4,240 150.4,222.08 132.48,222.08 132.48,204.16 114.56,204.16 114.56,168.32 150.4,168.32 150.4,186.24 168.32,186.24 168.32,204.16 204.16,204.16 204.16,157.44 240,157.44 240,222.08 222.08,222.08Z'],
    ['#438FD2', 'M16,222.08 16,150.4 33.92,150.4 33.92,132.48 51.84,132.48 51.84,114.56 87.68,114.56 87.68,150.4 69.76,150.4 69.76,168.32 51.84,168.32 51.84,204.16 98.56,204.16 98.56,240 33.92,240 33.92,222.08Z'],
  ];

  function brandIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    // 与宿主导航图标同尺寸（16px），文字因此和「对话 / 自动化」落在同一列
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.flex = '0 0 auto';
    svg.style.display = 'block';
    for (var i = 0; i < ICON_PATHS.length; i++) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('fill', ICON_PATHS[i][0]);
      p.setAttribute('d', ICON_PATHS[i][1]);
      svg.appendChild(p);
    }
    return svg;
  }

  /** 找一个可克隆的导航按钮：优先顶层「对话」，退回「自动化」「专家」。 */
  function findAnchor() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
    var pick = function (text) {
      return buttons.find(function (b) {
        return (b.innerText || '').trim() === text && b.offsetParent !== null;
      });
    };
    // 优先克隆未选中的导航项，避免入口一出现就带着宿主的选中底色
    return pick('对话') || pick('自动化') || pick('专家') || null;
  }

  function isEntry(node) {
    return node && node.id === ENTRY_ID;
  }

  function buildEntry(anchor) {
    var clone = anchor.cloneNode(false);
    clone.id = ENTRY_ID;
    clone.type = 'button';
    clone.setAttribute('aria-label', LABEL);
    clone.setAttribute('title', LABEL);
    clone.innerHTML = '';
    // 继承宿主的按钮类名，字体 / 内边距 / 悬停 / 焦点态都跟着主题走
    clone.className = anchor.className;
    var iconWrap = document.createElement('span');
    iconWrap.style.display = 'inline-flex';
    iconWrap.style.alignItems = 'center';
    iconWrap.appendChild(brandIcon());
    clone.appendChild(iconWrap);
    var text = document.createElement('span');
    text.textContent = LABEL;
    text.style.whiteSpace = 'nowrap';
    clone.appendChild(text);
    clone.style.cssText = anchor.style.cssText;
    // 克隆来的按钮宽度跟内容走；入口文字更长，强制撑满侧栏避免被裁成 "NexlOS"
    clone.style.setProperty('width', '100%', 'important');
    clone.style.setProperty('max-width', 'none', 'important');
    clone.style.setProperty('min-width', '0', 'important');
    clone.style.setProperty('box-sizing', 'border-box', 'important');
    clone.style.setProperty('overflow', 'visible', 'important');
    clone.style.setProperty('white-space', 'nowrap', 'important');
    clone.style.setProperty('margin', '0', 'important');
    clone.style.setProperty('justify-content', 'flex-start', 'important');

    // 宿主导航行按短标签（2 字）排版，按钮只有约 96px；入口文字更长，
    // 包一层整行容器再撑满，避免被裁成 "NexlOS"。
    var wrap = document.createElement('div');
    wrap.id = ENTRY_ID + '-row';
    wrap.style.cssText = 'display:flex;width:100%;align-items:center;flex:0 0 auto;';
    wrap.appendChild(clone);
    clone.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openDesktop();
    });
    return wrap;
  }

  function ensureEntry() {
    if (document.getElementById(ENTRY_ID)) return;
    var anchor = findAnchor();
    if (!anchor || !anchor.parentElement || !anchor.parentElement.parentElement) return;
    var row = anchor.parentElement;
    var entry = buildEntry(anchor);
    // 与宿主导航行同层、同 class：左侧缩进由容器统一给，图标与文字因此落在
    // 和「对话 / 自动化」相同的列上。
    entry.className = row.className;
    row.parentElement.insertBefore(entry, row.nextSibling);
  }

  function overlay() {
    return document.getElementById(OVERLAY_ID);
  }

  /** 主工作区几何：避开左侧导航和顶栏。 */
  function mountRect() {
    var entry = document.getElementById(ENTRY_ID);
    var best = 0;
    var node = entry;
    // 从入口往上找宽度像侧栏（48–460px）且够高的容器，取它的右边界
    while (node && node !== document.body) {
      var r = node.getBoundingClientRect();
      if (r.width > 48 && r.width < 460 && r.height > 200) best = Math.max(best, r.right);
      node = node.parentElement;
    }
    return { left: Math.round(best), top: 0 };
  }

  function openDesktop() {
    // React 还没渲染完侧栏时先等入口出现，否则量不到主工作区左边界
    if (!document.getElementById(ENTRY_ID)) {
      if ((openDesktop.retries = (openDesktop.retries || 0) + 1) < 20) {
        setTimeout(openDesktop, 300);
        return;
      }
      openDesktop.retries = 0;
    }
    var existing = overlay();
    if (existing) {
      existing.style.display = 'block';
      existing.querySelector('iframe').focus();
      markActive(true);
      return;
    }
    var frame = document.createElement('iframe');
    frame.src = IFRAME_URL;
    frame.title = LABEL;
    frame.setAttribute('allow', 'clipboard-read; clipboard-write');
    frame.style.cssText = 'border:0;width:100%;height:100%;display:block;background:transparent';

    var box = document.createElement('div');
    box.id = OVERLAY_ID;
    var rect = mountRect();
    box.style.cssText = [
      'position:fixed',
      'left:' + rect.left + 'px',
      'top:0',
      'right:0',
      'bottom:0',
      'z-index:20',
      'background:#f5efe4',
    ].join(';');
    box.appendChild(frame);
    document.body.appendChild(box);
    markActive(true);
    document.documentElement.setAttribute('data-nexlos-open', '1');
  }

  function closeDesktop() {
    var box = overlay();
    if (box) box.style.display = 'none';
    markActive(false);
    document.documentElement.removeAttribute('data-nexlos-open');
  }

  function markActive(on) {
    var entry = document.getElementById(ENTRY_ID);
    if (!entry) return;
    entry.setAttribute('aria-current', on ? 'page' : 'false');
    entry.style.outline = on ? '2px solid var(--ant-color-primary, #1677ff)' : '';
    entry.style.outlineOffset = on ? '-2px' : '';
  }

  // 用户点了宿主其它导航 -> 收起桌面；窗口尺寸变化 -> 重新对齐左侧边界
  document.addEventListener(
    'click',
    function (event) {
      var box = overlay();
      if (!box || box.style.display === 'none') return;
      var target = event.target;
      if (box.contains(target)) return;
      var hitNav = target && target.closest && target.closest('button, a');
      if (hitNav && !isEntry(hitNav) && !hitNav.closest('#' + OVERLAY_ID)) closeDesktop();
    },
    true,
  );

  window.addEventListener('resize', requestGeometrySync);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeDesktop();
  });

  // 侧栏折叠、对话历史面板展开都会改主工作区左边界；用 ResizeObserver 跟随
  function syncGeometry() {
    var box = overlay();
    if (!box || box.style.display === 'none') return;
    box.style.left = mountRect().left + 'px';
  }

  // MutationObserver 在整棵 body 上监听，宿主流式输出时每秒能触发上百次；
  // 每次都量 getBoundingClientRect 会强制同步布局，把宿主和桌面一起拖慢。
  // 合并到下一帧只量一次。
  var geometryQueued = false;
  function requestGeometrySync() {
    if (geometryQueued) return;
    geometryQueued = true;
    requestAnimationFrame(function () {
      geometryQueued = false;
      syncGeometry();
    });
  }

  // React 每次重渲染都可能替换侧栏节点；观察 body，缺了就补回来（幂等）
  var observer = new MutationObserver(function () {
    if (!document.getElementById(ENTRY_ID)) ensureEntry();
    requestGeometrySync();
  });

  var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(syncGeometry) : null;

  function boot() {
    ensureEntry();
    observer.observe(document.body, { childList: true, subtree: true });
    if (ro && document.body.firstElementChild) ro.observe(document.body.firstElementChild);
    // 支持 `nexlos open`：带 ?nexlos=1 打开时直接进桌面
    if (new URLSearchParams(location.search).get('nexlos') === '1') openDesktop();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.__NEXLOS__ = {
    open: openDesktop,
    close: closeDesktop,
    installed: true,
  };
})();
