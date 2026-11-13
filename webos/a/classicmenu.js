import { h, clear } from './can.js';
import { pixelIcon } from './classicicons.js';
import { classicStartIcon } from './classicstarticons.js';

// The classic menu owns menu navigation only. Application launching, desktop
// state and restoring focus to the Start button remain the shell's responsibility.
export function placeClassicSubmenu(anchor, size, viewport) {
  const margin = 4;
  const width = Math.min(size.width, Math.max(0, viewport.width - margin * 2));
  const height = Math.min(size.height, Math.max(0, viewport.height - margin * 2));
  let left = anchor.right - 3;
  let opensLeft = false;
  if (left + width > viewport.width - margin) {
    left = anchor.left - width + 3;
    opensLeft = true;
  }
  left = Math.max(margin, Math.min(left, viewport.width - width - margin));
  const top = Math.max(margin, Math.min(anchor.top - 3, viewport.height - height - margin));
  return { left, top, opensLeft };
}

export function createClassicStart(options) {
  const element = h('div', {
    class: 'c98-start', role: 'menu', 'aria-label': '开始菜单', tabindex: '-1', hidden: true,
  });
  const rail = h('div', { class: 'c98-rail', 'aria-hidden': 'true' },
    h('span', {}, 'Windos', h('b', {}, '2026')));
  element.append(rail);

  let rootMenu = null;
  let selected = null;
  let isOpen = false;
  let destroyed = false;
  let hoverTimer = 0;
  let typeTimer = 0;
  let typed = '';
  const allItems = [];

  function cancelHover() {
    clearTimeout(hoverTimer);
    hoverTimer = 0;
  }

  function closeBranch(item) {
    if (!item.submenu) return;
    const restoreSelection = selected && item.submenu.element.contains(selected.button);
    const restoreFocus = item.submenu.element.contains(document.activeElement);
    for (const child of item.submenu.items) closeBranch(child);
    item.submenu.element.hidden = true;
    item.host.classList.remove('open', 'opens-left');
    item.button.setAttribute('aria-expanded', 'false');
    if (restoreSelection && isOpen) select(item, restoreFocus);
  }

  function closeSiblings(item) {
    for (const sibling of item.menu.items) {
      if (sibling !== item) closeBranch(sibling);
    }
  }

  function select(item, focus) {
    if (!item) return;
    if (selected) {
      selected.button.classList.remove('selected');
      selected.button.tabIndex = -1;
    }
    selected = item;
    item.button.classList.add('selected');
    item.button.tabIndex = 0;
    if (focus) item.button.focus({ preventScroll: true });
  }

  function positionSubmenu(item) {
    const menu = item.submenu;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    menu.element.style.maxWidth = `${Math.max(0, viewport.width - 8)}px`;
    menu.content.style.maxHeight = `${Math.max(0, viewport.height - 16)}px`;
    menu.content.style.overflowY = 'auto';
    const size = menu.element.getBoundingClientRect();
    const position = placeClassicSubmenu(item.button.getBoundingClientRect(), size, viewport);
    menu.element.style.left = `${position.left}px`;
    menu.element.style.top = `${position.top}px`;
    item.host.classList.toggle('opens-left', position.opensLeft);
  }

  function openSubmenu(item, focus) {
    if (!item.submenu || !isOpen) return;
    cancelHover();
    closeSiblings(item);
    item.host.classList.add('open');
    item.button.setAttribute('aria-expanded', 'true');
    item.submenu.element.hidden = false;
    positionSubmenu(item);
    if (focus) select(item.submenu.items[0], true);
  }

  function requestClose() {
    close();
    if (typeof options.onClose === 'function') options.onClose();
  }

  function activate(item) {
    if (!item) return;
    if (item.submenu) {
      openSubmenu(item, true);
      return;
    }
    requestClose();
    if (typeof item.spec.action === 'function') item.spec.action();
  }

  function makeMenu(specs, parentItem) {
    const content = h('div', { class: 'c98-menu', role: 'presentation' });
    const menuElement = parentItem
      ? h('div', {
        class: 'c98-submenu', role: 'menu', 'aria-label': parentItem.spec.label,
        hidden: true, style: 'position:fixed',
      }, content)
      : content;
    const menu = { element: menuElement, content, items: [], parentItem };
    for (const spec of specs) {
      if (spec.separator) {
        content.append(h('div', { class: 'c98-separator', role: 'separator' }));
        continue;
      }
      if (spec.group) {
        content.append(h('div', { class: 'c98-group-label', 'aria-hidden': 'true' }, spec.group));
        continue;
      }
      const label = h('span', { class: 'c98-label' }, spec.label);
      if (spec.key) label.append(' (', h('u', {}, spec.key.toUpperCase()), ')');
      const button = h('button', {
        class: 'c98-item', role: 'menuitem', type: 'button', tabindex: '-1',
      }, h('span', { class: 'c98-glyph', 'aria-hidden': 'true' }, (!parentItem && classicStartIcon(spec.icon)) || pixelIcon(spec.icon || 'folder', parentItem ? 16 : 32)), label);
      const item = { button, spec, menu, submenu: null, host: button };
      if (spec.items) {
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.append(h('span', { class: 'c98-arrow', 'aria-hidden': 'true' }));
        item.host = h('div', { class: 'c98-submenu-host' }, button);
        item.submenu = makeMenu(spec.items, item);
        item.host.append(item.submenu.element);
        item.host.addEventListener('pointerleave', () => {
          cancelHover();
          hoverTimer = setTimeout(() => { closeBranch(item); }, 180);
        });
        item.submenu.element.addEventListener('pointerenter', cancelHover);
      }
      button.addEventListener('pointerenter', () => {
        cancelHover();
        select(item, true);
        closeSiblings(item);
        if (item.submenu) hoverTimer = setTimeout(() => openSubmenu(item, false), 150);
      });
      button.addEventListener('focus', () => select(item, false));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        cancelHover();
        select(item, false);
        activate(item);
      });
      content.append(item.host);
      menu.items.push(item);
      allItems.push(item);
    }
    if (!menu.items.length) content.append(h('div', { class: 'c98-empty' }, '暂无应用'));
    return menu;
  }

  function appEntry(app) {
    return { label: app.name, icon: app.id, action: () => options.onOpen(app.id) };
  }

  function appGroup(app) {
    if (/创作|写作/.test(app.category || '')) return '创作';
    if (/媒体|影音|娱乐/.test(app.category || '') || /^(music|video|scan)$/.test(app.id)) return '媒体';
    if (/系统/.test(app.category || '') || /^(pc|settings|system|term)$/.test(app.id)) return '系统';
    return '其他';
  }

  function buildSpecs() {
    const available = typeof options.getApps === 'function' ? options.getApps() : [];
    const seen = new Set();
    const apps = (Array.isArray(available) ? available : []).filter((app) => {
      if (!app || typeof app.id !== 'string' || typeof app.name !== 'string' || seen.has(app.id)) return false;
      seen.add(app.id);
      return true;
    });
    const programs = [];
    for (const group of ['创作', '系统', '媒体', '其他']) {
      const members = apps.filter(app => appGroup(app) === group);
      if (!members.length) continue;
      if (programs.length) programs.push({ separator: true });
      programs.push({ group });
      programs.push(...members.map(appEntry));
    }
    const documents = apps.filter(app => app.id === 'shelf' || app.id === 'memory').map(appEntry);
    const settings = apps.filter(app => app.id === 'settings').map(appEntry);
    settings.push({ label: 'NEXL现代主题', icon: 'theme', action: options.onTheme });
    settings.push({ label: '重播开机画面与音效', icon: 'run', action: options.onStartup });
    settings.push({ label: '声音…', icon: 'music', action: options.onSounds });
    return [
      { label: '程序', key: 'p', icon: 'programs', items: programs },
      { label: '文档', key: 'd', icon: 'documents', items: documents },
      { label: '设置', key: 's', icon: 'settings', items: settings },
      { label: '查找', key: 'f', icon: 'search', action: options.onFind },
      { label: '帮助', key: 'h', icon: 'help', action: options.onAbout },
      { label: '运行…', key: 'r', icon: 'run', action: options.onRun || options.onFind },
      { separator: true },
      { label: '关闭桌面…', key: 'u', icon: 'shutdown', action: options.onShutdown },
    ];
  }

  function refresh() {
    if (destroyed) return;
    cancelHover();
    const hadFocus = element.contains(document.activeElement);
    if (rootMenu) rootMenu.element.remove();
    selected = null;
    allItems.length = 0;
    rootMenu = makeMenu(buildSpecs(), null);
    element.append(rootMenu.element);
    if (isOpen && hadFocus) element.focus({ preventScroll: true });
  }

  function open(config = {}) {
    if (destroyed) return;
    refresh();
    isOpen = true;
    element.hidden = false;
    element.classList.add('open');
    // Focus the menu without making Programs a permanent default selection.
    if (config.focus !== false) element.focus({ preventScroll: true });
  }

  function close() {
    cancelHover();
    clearTimeout(typeTimer);
    typed = '';
    isOpen = false;
    element.classList.remove('open');
    element.hidden = true;
    if (rootMenu) for (const item of rootMenu.items) closeBranch(item);
    if (selected) {
      selected.button.classList.remove('selected');
      selected.button.tabIndex = -1;
    }
    selected = null;
  }

  function onKey(event) {
    if (!isOpen || event.ctrlKey || event.metaKey || event.altKey) return;
    const item = selected || rootMenu.items[0];
    if (!item) return;
    const menu = item.menu;
    const index = menu.items.indexOf(item);
    const key = event.key;
    const navigation = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' ', 'Escape', 'Tab'];
    if (navigation.indexOf(key) < 0 && key.length !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    cancelHover();
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      const offset = key === 'ArrowDown' ? 1 : -1;
      const next = !selected
        ? menu.items[key === 'ArrowDown' ? 0 : menu.items.length - 1]
        : menu.items[(index + offset + menu.items.length) % menu.items.length];
      closeSiblings(next);
      select(next, true);
    } else if (key === 'Home' || key === 'End') {
      const next = key === 'Home' ? menu.items[0] : menu.items[menu.items.length - 1];
      closeSiblings(next);
      select(next, true);
    } else if (key === 'ArrowRight') openSubmenu(item, true);
    else if (key === 'ArrowLeft' || key === 'Escape') {
      if (menu.parentItem) {
        closeBranch(menu.parentItem);
        select(menu.parentItem, true);
      } else if (item.submenu && !item.submenu.element.hidden) {
        closeBranch(item);
        select(item, true);
      } else if (key === 'Escape') requestClose();
    } else if (key === 'Enter' || key === ' ') activate(item);
    else if (key === 'Tab') requestClose();
    else {
      const access = menu.items.find(entry => entry.spec.key === key.toLowerCase());
      if (access) {
        select(access, true);
        activate(access);
      } else {
        clearTimeout(typeTimer);
        typed += key.toLocaleLowerCase();
        const match = menu.items.find(entry => entry.spec.label.toLocaleLowerCase().indexOf(typed) === 0);
        if (match) { closeSiblings(match); select(match, true); }
        typeTimer = setTimeout(() => { typed = ''; }, 600);
      }
    }
  }

  function reposition() {
    if (!isOpen) return;
    for (const item of allItems) {
      if (item.submenu && !item.submenu.element.hidden) positionSubmenu(item);
    }
  }

  function leaveMenu(event) {
    if (!isOpen || element.contains(event.relatedTarget)) return;
    cancelHover();
    for (const item of rootMenu.items) closeBranch(item);
    if (selected) {
      selected.button.classList.remove('selected');
      selected.button.tabIndex = -1;
      selected = null;
    }
    if (element.contains(document.activeElement)) element.focus({ preventScroll: true });
  }

  element.addEventListener('keydown', onKey);
  element.addEventListener('pointerleave', leaveMenu);
  window.addEventListener('resize', reposition);
  refresh();
  return {
    element, open, close, refresh,
    contains(node) { return !!node && element.contains(node); },
    destroy() {
      close();
      destroyed = true;
      window.removeEventListener('resize', reposition);
      element.removeEventListener('keydown', onKey);
      element.removeEventListener('pointerleave', leaveMenu);
      clear(element);
      element.remove();
    },
  };
}
