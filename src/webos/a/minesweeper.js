import { h, clear } from './can.js';
import { t, setLanguage } from './i18n.js';
import { MinesweeperGame, MINE_PRESETS, validMineBoard } from './minesweeper-engine.js';

const PREF_KEY = 'nexlos.minesweeper.v1';
const LEVEL_NAMES = { beginner: '初级', intermediate: '中级', expert: '高级', custom: '自定义' };
const SEGMENTS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };

function preferences() {
  try {
    const data = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (data.level === 'custom' && data.board && validMineBoard(data.board.cols, data.board.rows, data.board.mines)) return data;
    if (MINE_PRESETS[data.level]) return { level: data.level, board: MINE_PRESETS[data.level] };
  } catch (error) { /* An unavailable preference store must not block playing. */ }
  return { level: 'beginner', board: MINE_PRESETS.beginner };
}

function ledDisplay(label) {
  const digits = Array.from({ length: 3 }, () => {
    const digit = h('span', { class: 'ms-digit', 'aria-hidden': 'true' });
    for (const segment of 'abcdefg') digit.append(h('i', { class: `ms-segment s-${segment}` }));
    return digit;
  });
  const element = h('div', { class: 'ms-led', role: 'img', 'aria-label': label, 'data-i18n-skip': '' }, digits);
  let last = '';
  return {
    element,
    update(value) {
      const bounded = Math.max(-99, Math.min(999, value));
      const text = bounded < 0 ? '-' + String(-bounded).padStart(2, '0') : String(bounded).padStart(3, '0');
      element.setAttribute('aria-label', `${t(label)}: ${value}`);
      if (text === last) return;
      last = text;
      digits.forEach((digit, index) => {
        const active = SEGMENTS[text[index]] || '';
        Array.from(digit.children).forEach((segment, i) => segment.classList.toggle('lit', active.indexOf('abcdefg'[i]) >= 0));
      });
    },
  };
}

function faceArt(state) {
  const outline = '<path fill="#000" d="M6 0h8v1h3v2h2v3h1v8h-1v3h-2v2h-3v1H6v-1H3v-2H1v-3H0V6h1V3h2V1h3z"/><path fill="#ffff00" d="M6 1h8v1h3v2h1v3h1v6h-1v3h-1v2h-3v1H6v-1H3v-2H2v-3H1V7h1V4h1V2h3z"/>';
  let detail = '<path d="M5 5h2v3H5zM13 5h2v3h-2zM5 11h1v2h2v1h4v-1h2v-2h1v3h-2v1H7v-1H5z"/>';
  if (state === 'pressed') detail = '<path d="M5 5h2v3H5zM13 5h2v3h-2zM8 11h4v5H8z"/>';
  if (state === 'lost') detail = '<path d="M4 4h1v1h1V4h1v1H6v1h1v1H6V6H5v1H4V6h1V5H4zM12 4h1v1h1V4h1v1h-1v1h1v1h-1V6h-1v1h-1V6h1V5h-1zM7 12h6v1H7zM5 13h2v1H5zM13 13h2v1h-2z"/>';
  if (state === 'won') detail = '<path d="M3 5h14v2h-1v2h-4V7H8v2H4V7H3zM5 11h1v2h2v1h4v-1h2v-2h1v3h-2v1H7v-1H5z"/>';
  return h('svg', { class: 'ms-face-art', viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': 'true', 'shape-rendering': 'crispEdges', html: outline + detail });
}

function cellArt(type) {
  const mine = '<path d="M7 1h2v3h2V2h1v3h2v2h2v2h-2v2h1v1h-3v2H9v2H7v-2H5v1H4v-3H2V9H0V7h2V5H1V4h3V2h3z"/><path fill="#fff" d="M5 5h2v2H5z"/>';
  const flag = '<path fill="#f00" d="M7 1v7H2V3h2V2h2V1z"/><path d="M7 1h1v10H7zM5 11h5v1H5zM3 12h9v2H3z"/>';
  const wrong = '<path fill="#f00" d="M0 0h2v2h2v2h2v2h2V4h2V2h2V0h2v3h-2v2h-2v2H8v2h2v2h2v2h2v2h-3v-2H9v-2H7v2H5v2H2v-2h2v-2h2V9H4V7H2V5H0z"/>';
  return h('svg', { class: 'ms-cell-art', viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', 'shape-rendering': 'crispEdges', html: type === 'flag' ? flag : mine + (type === 'wrong' ? wrong : '') });
}

export function mountMinesweeper(host) {
  if (!document.querySelector('link[data-nexlos-minesweeper]')) {
    document.head.append(h('link', { rel: 'stylesheet', href: '/a/minesweeper.css', 'data-nexlos-minesweeper': '' }));
  }
  const saved = preferences();
  let level = saved.level;
  let config = saved.board;
  let game;
  let flagMode = false;
  let startedAt = 0;
  let elapsed = 0;
  let timer = 0;
  let pointer = null;
  let ignoreClick = { index: -1, until: 0 };
  let pressed = false;
  let activeMenu = '';
  let destroyed = false;
  let focusIndex = 0;
  let lastStatus = '';
  let announcedGameState = 'ready';
  const buttons = [];
  const visualKeys = [];
  const ariaKeys = [];
  const counter = ledDisplay('剩余地雷');
  const clock = ledDisplay('用时');
  const face = h('button', { class: 'ms-face', type: 'button', title: '新游戏', 'aria-label': '重置游戏', onclick: () => newGame() });
  const grid = h('div', { class: 'ms-grid', role: 'grid', 'aria-label': '棋盘' });
  const status = h('span', { class: 'ms-status-message', role: 'status', 'aria-live': 'polite' });
  const progress = h('span', { class: 'ms-progress', 'data-i18n-skip': '' });
  const dropdown = h('div', { class: 'ms-dropdown', role: 'menu', hidden: true });
  const dialogLayer = h('div', { class: 'ms-dialog-layer', hidden: true });
  const gameButton = h('button', { class: 'ms-menu-button', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => toggleMenu('game', gameButton) }, '游戏');
  const optionsButton = h('button', { class: 'ms-menu-button', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => toggleMenu('options', optionsButton) }, '选项');
  const flagLabel = h('span', {}, '标旗模式');
  const flagButton = h('button', { class: 'ms-flag-mode', type: 'button', 'aria-label': '标旗模式', 'aria-pressed': 'false', onclick: () => toggleMode() }, cellArt('flag'), flagLabel);
  const gameFrame = h('section', { class: 'ms-game', 'aria-label': '扫雷' },
    h('div', { class: 'ms-scoreboard' }, counter.element, face, clock.element), grid);
  const root = h('div', { class: 'ms' },
    h('nav', { class: 'ms-menubar', 'aria-label': '扫雷' },
      gameButton, optionsButton,
      h('button', { class: 'ms-menu-button', type: 'button', onclick: () => showHelp() }, '帮助'), flagButton),
    h('main', { class: 'ms-stage' }, gameFrame),
    h('footer', { class: 'ms-status' }, status, progress), dropdown, dialogLayer);
  host.append(root);

  function savePreferences() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ level, board: config })); } catch (error) { /* Only optional preferences are stored. */ }
  }

  function seconds() { return startedAt ? Math.min(999, Math.floor((performance.now() - startedAt) / 1000)) : elapsed; }
  function stopTimer() {
    elapsed = seconds(); startedAt = 0;
    clearInterval(timer); timer = 0; clock.update(elapsed);
  }
  function updateTimer() {
    if (game.state === 'playing' && !timer) {
      startedAt = performance.now();
      timer = setInterval(() => { if (!destroyed) clock.update(seconds()); }, 1000);
    } else if (game.finished && timer) stopTimer();
    clock.update(seconds());
  }
  function clearPointer() {
    if (pointer) clearTimeout(pointer.timer);
    pointer = null; pressed = false; paintFace();
  }

  function newGame(nextConfig, nextLevel) {
    clearPointer(); stopTimer(); elapsed = 0;
    if (nextConfig) config = nextConfig;
    if (nextLevel) level = nextLevel;
    game = new MinesweeperGame(config);
    focusIndex = 0; ignoreClick = { index: -1, until: 0 };
    savePreferences(); clear(grid); buttons.length = 0; visualKeys.length = 0; ariaKeys.length = 0;
    grid.setAttribute('aria-rowcount', String(game.rows)); grid.setAttribute('aria-colcount', String(game.cols));
    grid.style.setProperty('--ms-cols', String(game.cols));
    for (let y = 0; y < game.rows; y++) {
      const row = h('div', { class: 'ms-row', role: 'row' });
      for (let x = 0; x < game.cols; x++) {
        const index = y * game.cols + x;
        const button = h('button', { class: 'ms-cell', type: 'button', role: 'gridcell', tabindex: index ? '-1' : '0', dataset: { cell: index }, 'aria-rowindex': y + 1, 'aria-colindex': x + 1 });
        buttons.push(button); row.append(button);
      }
      grid.append(row);
    }
    render();
    buttons[0].focus({ preventScroll: true });
  }

  function paintFace() {
    clear(face);
    face.append(faceArt(game && game.finished ? game.state : pressed ? 'pressed' : 'ready'));
  }

  function cellType(cell, index) {
    if (cell.revealed) return cell.mine ? 'exploded' : `number-${cell.adjacent}`;
    if (game.state === 'lost' && cell.flagged && !cell.mine) return 'wrong';
    if (cell.flagged) return 'flag';
    if (game.state === 'lost' && cell.mine) return 'mine';
    return 'covered';
  }

  function render() {
    updateTimer(); counter.update(game.remaining); paintFace();
    game.cells.forEach((cell, index) => {
      const type = cellType(cell, index);
      const button = buttons[index];
      if (visualKeys[index] !== type) {
        visualKeys[index] = type; clear(button);
        button.className = `ms-cell ${type}${cell.revealed || type === 'mine' || type === 'wrong' ? ' open' : ''}`;
        if (type === 'flag') button.append(cellArt('flag'));
        else if (type === 'mine' || type === 'exploded' || type === 'wrong') button.append(cellArt(type));
        else if (cell.revealed && cell.adjacent) button.append(h('span', { class: 'ms-number', 'aria-hidden': 'true', 'data-i18n-skip': '' }, String(cell.adjacent)));
      }
      const label = type === 'flag' ? t('已标旗') : type === 'covered' ? t('未翻开') : cell.mine ? t('地雷')
        : type === 'wrong' ? t('标记错误') : cell.adjacent ? `${t('邻近地雷')} ${cell.adjacent}` : t('空白');
      const aria = `${t('格子')} ${Math.floor(index / game.cols) + 1}, ${index % game.cols + 1}: ${label}`;
      if (ariaKeys[index] !== aria) { button.setAttribute('aria-label', aria); ariaKeys[index] = aria; }
    });
    const statusKey = { ready: '准备开始', playing: '进行中', won: '你赢了！', lost: '踩到地雷，再试一次。' }[game.state];
    status.setAttribute('data-i18n-key', statusKey);
    if (lastStatus !== t(statusKey)) { status.textContent = t(statusKey); lastStatus = t(statusKey); }
    progress.textContent = `${t('已翻开')} ${game.revealed}/${game.cells.length - game.mines}`;
    flagButton.setAttribute('aria-pressed', flagMode ? 'true' : 'false');
    root.classList.toggle('flag-mode', flagMode);
    if (announcedGameState !== game.state) {
      announcedGameState = game.state;
      const sound = game.state === 'won' ? 'tada' : game.state === 'lost' ? 'exclamation' : '';
      if (sound && window.parent !== window) window.parent.postMessage({ type: 'nexlos.sound', name: sound }, location.origin);
    }
  }

  function focusCell(index) {
    if (!game.has(index)) return;
    buttons[focusIndex].tabIndex = -1; focusIndex = index; buttons[index].tabIndex = 0;
    buttons[index].focus({ preventScroll: true });
  }

  function play(index, mark) {
    if (game.finished || !game.has(index)) return;
    const cell = game.cells[index];
    const changed = mark ? game.toggleFlag(index) : cell.revealed ? game.chord(index) : game.reveal(index);
    if (changed) render();
  }

  function toggleMode() { flagMode = !flagMode; closeMenu(); render(); }
  function closeMenu(focus) {
    const owner = activeMenu === 'game' ? gameButton : optionsButton;
    dropdown.hidden = true; activeMenu = '';
    gameButton.setAttribute('aria-expanded', 'false'); optionsButton.setAttribute('aria-expanded', 'false');
    if (focus) owner.focus();
  }
  function toggleMenu(kind, owner) {
    if (activeMenu === kind) { closeMenu(true); return; }
    closeMenu(); activeMenu = kind; clear(dropdown);
    const item = (label, fn, checked) => h('button', {
      class: 'ms-dropdown-item', type: 'button', role: checked === undefined ? 'menuitem' : kind === 'options' ? 'menuitemcheckbox' : 'menuitemradio',
      'aria-checked': checked === undefined ? null : checked ? 'true' : 'false',
      onclick: () => { closeMenu(); fn(); },
    }, checked ? h('span', { class: 'ms-menu-check', 'aria-hidden': 'true' }, '•') : h('span', { class: 'ms-menu-check' }), label);
    if (kind === 'game') {
      dropdown.append(item('新游戏', () => newGame()));
      dropdown.append(h('div', { class: 'ms-menu-separator', role: 'separator' }));
      for (const [key, preset] of Object.entries(MINE_PRESETS)) {
        dropdown.append(item([h('span', {}, LEVEL_NAMES[key]), h('small', {}, `${preset.cols}×${preset.rows} / ${preset.mines}`)], () => newGame(preset, key), level === key));
      }
      dropdown.append(item('自定义', showCustom, level === 'custom'));
    } else {
      dropdown.append(item('标旗模式', toggleMode, flagMode));
      dropdown.append(item('玩法说明', showHelp));
    }
    const rect = owner.getBoundingClientRect(); const bounds = root.getBoundingClientRect();
    dropdown.style.left = `${Math.max(0, rect.left - bounds.left)}px`;
    dropdown.style.top = `${rect.bottom - bounds.top}px`;
    dropdown.hidden = false; owner.setAttribute('aria-expanded', 'true');
    const first = dropdown.querySelector('button'); if (first) first.focus();
  }

  function closeDialog() { clear(dialogLayer); dialogLayer.hidden = true; face.focus(); }
  function dialog(title, content, actions) {
    closeMenu(); clear(dialogLayer); dialogLayer.hidden = false;
    const box = h('section', { class: 'ms-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { class: 'ms-dialog-title' }, h('b', {}, title),
        h('button', { class: 'ms-dialog-close', type: 'button', title: '关闭', 'aria-label': '关闭', onclick: closeDialog }, '×')),
      content, h('footer', { class: 'ms-dialog-actions' }, actions));
    dialogLayer.append(box);
    const first = box.querySelector('input,button:not(.ms-dialog-close)'); if (first) first.focus();
  }
  function showHelp() {
    dialog('玩法说明', h('div', { class: 'ms-dialog-body' },
      h('p', {}, '首步安全，翻开所有非雷格即可获胜。'),
      h('p', {}, '右键或长按标旗；周围旗帜数等于数字时，点击数字翻开相邻格。'),
      h('p', {}, '方向键移动，空格翻开，F 标旗，F2 新游戏。')),
    h('button', { class: 'ms-button default', type: 'button', onclick: closeDialog }, '确定'));
  }
  function showCustom() {
    const fields = {};
    const error = h('p', { class: 'ms-dialog-error', role: 'alert' });
    const form = h('form', { class: 'ms-dialog-body', novalidate: '', onsubmit: (e) => { e.preventDefault(); start(); } });
    for (const [key, label, min, max] of [['rows', '行数', 5, 24], ['cols', '列数', 5, 30], ['mines', '地雷数量', 1, 711]]) {
      fields[key] = h('input', { type: 'number', min, max, value: config[key], required: '', 'aria-label': label, inputmode: 'numeric' });
      form.append(h('label', { class: 'ms-custom-field' },
        h('span', {}, h('span', {}, label), key === 'mines' ? null : h('small', {}, ` (${min}–${max})`)), fields[key]));
    }
    form.append(h('p', { class: 'ms-custom-hint' }, '自定义棋盘至少留出九个安全格。'), error);
    function start() {
      const next = { cols: Number(fields.cols.value), rows: Number(fields.rows.value), mines: Number(fields.mines.value) };
      if (!validMineBoard(next.cols, next.rows, next.mines)) { error.textContent = '棋盘尺寸或雷数无效。'; return; }
      closeDialog(); newGame(next, 'custom');
    }
    dialog('扫雷设置', form, [
      h('button', { class: 'ms-button default', type: 'button', onclick: start }, '开始游戏'),
      h('button', { class: 'ms-button', type: 'button', onclick: closeDialog }, '取消'),
    ]);
  }

  function targetIndex(event) {
    const cell = event.target.closest('.ms-cell');
    return cell && grid.contains(cell) ? Number(cell.dataset.cell) : -1;
  }
  grid.addEventListener('click', (e) => {
    const index = targetIndex(e);
    if (index === ignoreClick.index && Date.now() < ignoreClick.until) { e.preventDefault(); return; }
    play(index, flagMode || e.shiftKey);
  });
  grid.addEventListener('focusin', (e) => {
    const index = targetIndex(e);
    if (!game.has(index)) return;
    buttons[focusIndex].tabIndex = -1; focusIndex = index; buttons[index].tabIndex = 0;
  });
  grid.addEventListener('contextmenu', (e) => {
    e.preventDefault(); const index = targetIndex(e);
    if (index === ignoreClick.index && Date.now() < ignoreClick.until) return;
    play(index, true);
  });
  grid.addEventListener('pointerdown', (e) => {
    const index = targetIndex(e); if (!game.has(index) || game.finished) return;
    clearPointer(); pressed = true; paintFace();
    if (e.buttons === 3 || e.button === 1) {
      e.preventDefault(); ignoreClick = { index, until: Date.now() + 500 }; play(index, false); return;
    }
    pointer = { id: e.pointerId, index, x: e.clientX, y: e.clientY, timer: 0 };
    if (e.pointerType === 'touch' || e.pointerType === 'pen') pointer.timer = setTimeout(() => {
      if (!pointer) return;
      ignoreClick = { index, until: Date.now() + 1000 }; play(index, true); clearPointer();
    }, 450);
  });
  function pointerMove(e) {
    if (!pointer || pointer.id !== e.pointerId) return;
    if (Math.abs(e.clientX - pointer.x) + Math.abs(e.clientY - pointer.y) > 10) clearPointer();
  }
  function onOutside(e) {
    if (!dropdown.hidden && !dropdown.contains(e.target) && !gameButton.contains(e.target) && !optionsButton.contains(e.target)) closeMenu();
  }
  root.addEventListener('keydown', (e) => {
    if (!dialogLayer.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
      if (e.key === 'Tab') {
        const nodes = Array.from(dialogLayer.querySelectorAll('input,button:not(:disabled)'));
        const index = nodes.indexOf(document.activeElement);
        if (nodes.length && ((!e.shiftKey && index === nodes.length - 1) || (e.shiftKey && index === 0))) {
          e.preventDefault(); nodes[e.shiftKey ? nodes.length - 1 : 0].focus();
        }
      }
      return;
    }
    if (e.key === 'F2') { e.preventDefault(); closeMenu(); newGame(); return; }
    if (!dropdown.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); const items = Array.from(dropdown.querySelectorAll('button'));
        const index = items.indexOf(document.activeElement);
        items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
      return;
    }
    const index = targetIndex(e); if (!game.has(index)) return;
    const x = index % game.cols; const y = Math.floor(index / game.cols);
    let next = index;
    if (e.key === 'ArrowLeft') next = y * game.cols + Math.max(0, x - 1);
    else if (e.key === 'ArrowRight') next = y * game.cols + Math.min(game.cols - 1, x + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, y - 1) * game.cols + x;
    else if (e.key === 'ArrowDown') next = Math.min(game.rows - 1, y + 1) * game.cols + x;
    else if (e.key === 'Home') next = y * game.cols;
    else if (e.key === 'End') next = y * game.cols + game.cols - 1;
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); play(index, true); return; }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); play(index, e.shiftKey); return; }
    else return;
    e.preventDefault(); focusCell(next);
  });
  function onPrefs(e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'nexlos.settings') return;
    const patch = e.data.patch || {};
    if (patch.language) { setLanguage(patch.language); render(); }
  }
  window.addEventListener('pointerup', clearPointer);
  window.addEventListener('pointercancel', clearPointer);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('blur', clearPointer);
  window.addEventListener('message', onPrefs);
  document.addEventListener('pointerdown', onOutside, true);
  const languageObserver = new MutationObserver(() => { if (!destroyed && game) render(); });
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  newGame();
  return {
    destroy() {
      destroyed = true; clearPointer(); stopTimer();
      window.removeEventListener('pointerup', clearPointer);
      window.removeEventListener('pointercancel', clearPointer);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('blur', clearPointer);
      window.removeEventListener('message', onPrefs);
      document.removeEventListener('pointerdown', onOutside, true);
      languageObserver.disconnect();
    },
  };
}
