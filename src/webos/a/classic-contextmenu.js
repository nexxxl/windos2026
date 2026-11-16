import { h, clear } from './can.js';
import { localizeDoc } from './i18n.js';
import { placeClassicSubmenu } from './classicmenu.js';

// A context menu owns its own tree and focus only. It does not share Start's
// navigation state, launch apps or change desktop preferences itself.
export function createClassicContextMenu(options) {
  const opts = options || {};
  if (!document.querySelector('link[data-nexlos-classic-contextmenu]')) {
    document.head.append(h('link', { rel: 'stylesheet', href: '/a/classic-contextmenu.css', 'data-nexlos-classic-contextmenu': '' }));
  }
  const element = h('div', { class: 'c98-context-host', hidden: true, role: 'presentation' });
  let rootMenu = null;
  let selected = null;
  let open = false;
  let destroyed = false;
  let savedFocus = null;
  let hoverTimer = 0;
  let typeTimer = 0;
  let typed = '';
  let origin = { x: 0, y: 0 };
  let allMenus = [];

  function cancelHover() { clearTimeout(hoverTimer); hoverTimer = 0; }
  function enabled(menu) { return menu.items.filter(item => !item.spec.disabled); }
  function resetSelection() {
    if (!selected) return;
    selected.button.classList.remove('selected');
    selected.button.tabIndex = -1;
    selected = null;
  }
  function select(item, focus) {
    if (!item || item.spec.disabled) return;
    resetSelection();
    selected = item;
    item.button.classList.add('selected');
    item.button.tabIndex = 0;
    if (focus) {
      item.button.focus({ preventScroll: true });
      const row = item.button.getBoundingClientRect();
      const pane = item.menu.element.getBoundingClientRect();
      if (row.top < pane.top + 3) item.menu.element.scrollTop -= pane.top + 3 - row.top;
      else if (row.bottom > pane.bottom - 3) item.menu.element.scrollTop += row.bottom - pane.bottom + 3;
    }
  }
  function closeBranch(item) {
    if (!item.submenu) return;
    const hadSelection = selected && item.submenu.element.contains(selected.button);
    const hadFocus = item.submenu.element.contains(document.activeElement);
    for (const child of item.submenu.items) closeBranch(child);
    item.submenu.element.hidden = true;
    item.button.setAttribute('aria-expanded', 'false');
    item.button.classList.remove('submenu-open');
    if (hadSelection && open) select(item, hadFocus);
  }
  function closeSiblings(item) {
    for (const sibling of item.menu.items) if (sibling !== item) closeBranch(sibling);
  }
  function viewport() { return { width: window.innerWidth, height: window.innerHeight }; }
  function constrain(menu) {
    const view = viewport();
    menu.element.style.maxWidth = Math.max(0, view.width - 8) + 'px';
    menu.element.style.maxHeight = Math.max(0, view.height - 8) + 'px';
  }
  function positionRoot() {
    if (!rootMenu) return;
    constrain(rootMenu);
    const view = viewport();
    const rect = rootMenu.element.getBoundingClientRect();
    const width = Math.min(rect.width, Math.max(0, view.width - 8));
    const height = Math.min(rect.height, Math.max(0, view.height - 8));
    let x = origin.x;
    let y = origin.y;
    if (x + width > view.width - 4) x -= width;
    if (y + height > view.height - 4) y -= height;
    rootMenu.element.style.left = Math.max(4, Math.min(x, view.width - width - 4)) + 'px';
    rootMenu.element.style.top = Math.max(4, Math.min(y, view.height - height - 4)) + 'px';
  }
  function positionSubmenu(item) {
    constrain(item.submenu);
    const position = placeClassicSubmenu(item.button.getBoundingClientRect(), item.submenu.element.getBoundingClientRect(), viewport());
    item.submenu.element.style.left = position.left + 'px';
    item.submenu.element.style.top = position.top + 'px';
    item.submenu.element.classList.toggle('opens-left', position.opensLeft);
  }
  function openSubmenu(item, focus) {
    if (!open || !item || item.spec.disabled || !item.submenu) return;
    cancelHover();
    closeSiblings(item);
    item.button.setAttribute('aria-expanded', 'true');
    item.button.classList.add('submenu-open');
    item.submenu.element.hidden = false;
    positionSubmenu(item);
    if (focus) {
      const first = enabled(item.submenu)[0];
      if (first) select(first, true);
    }
  }
  function close(config) {
    const wasOpen = open;
    const settings = config || {};
    open = false;
    cancelHover();
    clearTimeout(typeTimer); typed = '';
    for (const menu of allMenus) {
      menu.element.hidden = true;
      for (const item of menu.items) {
        item.button.classList.remove('submenu-open');
        if (item.submenu) item.button.setAttribute('aria-expanded', 'false');
      }
    }
    resetSelection();
    element.hidden = true;
    if (wasOpen && settings.restoreFocus !== false && savedFocus && typeof savedFocus.focus === 'function' && savedFocus.isConnected !== false) {
      savedFocus.focus({ preventScroll: true });
    }
    savedFocus = null;
    if (wasOpen && settings.notify !== false && typeof opts.onClose === 'function') opts.onClose();
  }
  function activate(item) {
    if (!item || item.spec.disabled || !open) return;
    if (item.submenu) { openSubmenu(item, true); return; }
    const action = item.spec.action;
    close();
    if (typeof action === 'function') action();
  }
  function mark() {
    return h('svg', {
      viewBox: '0 0 9 9', width: '9', height: '9', 'aria-hidden': 'true', 'shape-rendering': 'crispEdges',
      html: '<path fill="currentColor" d="M1 4h1v1h1v1h1V4h1V3h1V2h1V1h1v3H7v1H6v1H5v1H4v1H3V7H2V6H1z"/>',
    });
  }
  function makeMenu(specs, parentItem) {
    const menuElement = h('div', { class: 'c98-context-menu', role: 'menu', tabindex: '-1', hidden: !!parentItem });
    if (parentItem) menuElement.setAttribute('aria-label', parentItem.spec.label || '');
    const menu = { element: menuElement, items: [], parentItem };
    allMenus.push(menu);
    element.append(menuElement);
    for (const spec of Array.isArray(specs) ? specs : []) {
      if (!spec || typeof spec !== 'object') continue;
      if (spec.separator) {
        menuElement.append(h('div', { class: 'c98-context-separator', role: 'separator' }));
        continue;
      }
      const key = typeof spec.key === 'string' ? spec.key.toUpperCase() : '';
      // The label is an exact Chinese source for the global document localizer;
      // the mnemonic is a separate, protected node so its Latin key is stable.
      const label = h('span', { class: 'c98-context-label' }, String(spec.label || ''));
      const button = h('button', {
        class: 'c98-context-item', type: 'button', role: typeof spec.checked === 'boolean' ? 'menuitemcheckbox' : 'menuitem',
        tabindex: '-1', disabled: !!spec.disabled, 'aria-disabled': String(!!spec.disabled),
      }, h('span', { class: 'c98-context-check', 'aria-hidden': 'true' }, spec.checked ? mark() : null), label);
      if (key) label.append(h('span', { class: 'c98-context-key', 'data-i18n-skip': '' }, ' (', h('u', {}, key), ')'));
      if (typeof spec.checked === 'boolean') button.setAttribute('aria-checked', String(spec.checked));
      if (spec.shortcut) button.append(h('span', { class: 'c98-context-shortcut', 'data-i18n-skip': '' }, String(spec.shortcut)));
      const item = { spec, button, menu, submenu: null };
      if (Array.isArray(spec.items)) {
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.append(h('span', { class: 'c98-context-arrow', 'aria-hidden': 'true' }));
        item.submenu = makeMenu(spec.items, item);
      } else button.append(h('span', { class: 'c98-context-tail', 'aria-hidden': 'true' }));
      button.addEventListener('pointerenter', () => {
        if (spec.disabled) {
          cancelHover(); resetSelection(); closeSiblings(item);
          menu.element.focus({ preventScroll: true });
          return;
        }
        cancelHover();
        select(item, true);
        closeSiblings(item);
        if (item.submenu) hoverTimer = setTimeout(() => openSubmenu(item, false), 180);
      });
      button.addEventListener('focus', () => select(item, false));
      button.addEventListener('click', event => {
        event.stopPropagation(); cancelHover(); select(item, false); activate(item);
      });
      menuElement.append(button);
      menu.items.push(item);
    }
    menuElement.addEventListener('pointerenter', cancelHover);
    menuElement.addEventListener('scroll', () => {
      for (const item of menu.items) if (item.submenu && !item.submenu.element.hidden) positionSubmenu(item);
    });
    return menu;
  }
  function onKey(event) {
    if (!open || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    const nav = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' ', 'Escape', 'Tab'];
    if (nav.indexOf(key) < 0 && (!key || key.length !== 1)) return;
    event.preventDefault(); event.stopPropagation(); cancelHover();
    if (key === 'Tab') { close(); return; }
    const currentMenu = selected ? selected.menu : rootMenu;
    const choices = enabled(currentMenu);
    if (key === 'Escape' || key === 'ArrowLeft') {
      if (currentMenu.parentItem) { const parent = currentMenu.parentItem; closeBranch(parent); select(parent, true); }
      else if (selected && selected.submenu && !selected.submenu.element.hidden) closeBranch(selected);
      else if (key === 'Escape') close();
      return;
    }
    if (!choices.length) return;
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      const index = choices.indexOf(selected);
      let next;
      if (key === 'Home') next = choices[0];
      else if (key === 'End') next = choices[choices.length - 1];
      else if (index < 0) next = key === 'ArrowDown' ? choices[0] : choices[choices.length - 1];
      else next = choices[(index + (key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length];
      closeSiblings(next); select(next, true);
    } else if (key === 'ArrowRight') openSubmenu(selected || choices[0], true);
    else if (key === 'Enter' || key === ' ') activate(selected);
    else {
      const access = choices.filter(item => String(item.spec.key || '').toLocaleLowerCase() === key.toLocaleLowerCase());
      if (access.length) {
        const next = access[(access.indexOf(selected) + 1) % access.length];
        closeSiblings(next); select(next, true);
        if (access.length === 1) activate(next);
      } else {
        clearTimeout(typeTimer); typed += key.toLocaleLowerCase();
        const match = choices.find(item => item.button.textContent.trim().toLocaleLowerCase().indexOf(typed) === 0);
        if (match) { closeSiblings(match); select(match, true); }
        typeTimer = setTimeout(() => { typed = ''; }, 600);
      }
    }
  }
  function outside(event) { if (open && !element.contains(event.target)) close({ restoreFocus: false }); }
  function onResize() {
    if (!open) return;
    positionRoot();
    for (const menu of allMenus) {
      if (menu.parentItem && !menu.element.hidden) positionSubmenu(menu.parentItem);
    }
  }
  function onBlur() { if (open) close({ restoreFocus: false }); }
  function show(x, y, items) {
    if (destroyed) return;
    if (open) close({ restoreFocus: false });
    savedFocus = document.activeElement;
    clear(element); allMenus = []; selected = null;
    rootMenu = makeMenu(items, null);
    if (!element.parentNode) document.body.append(element);
    origin = { x: Number.isFinite(Number(x)) ? Number(x) : 0, y: Number.isFinite(Number(y)) ? Number(y) : 0 };
    open = true; element.hidden = false; rootMenu.element.hidden = false;
    localizeDoc(document);
    positionRoot();
    // Pointer invocation starts without a highlighted row, as on the desktop.
    // Down/Up selects the first/last enabled item; access keys work immediately.
    rootMenu.element.focus({ preventScroll: true });
  }
  element.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onBlur);
  return {
    element, show, close,
    // 原生页面视图浮在 HTML 之上：外壳要知道菜单是否展开，才能先收起页面。
    isOpen: () => open,
    destroy() {
      if (destroyed) return;
      close({ notify: false }); destroyed = true;
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onBlur);
      element.removeEventListener('keydown', onKey);
      clear(element); allMenus = []; rootMenu = null; element.remove();
    },
  };
}
