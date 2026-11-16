import { h } from './can.js';
import { PIXEL_SPARK_16 } from './pixel-spark.js';

// Original NexlOS pixel artwork, drawn on a 16×16 logical grid. Coordinates are
// doubled into a 32×32 viewBox: both 16px and 32px render on whole pixel edges.
// These are independent drawings, not extracted Microsoft/Windows assets.
// Font and artwork provenance: vendor/retro-font/README.md.
const C = {
  ink: '#161616', shadow: '#686868', gray: '#a0a0a0', silver: '#c0c0c0',
  light: '#e0e0e0', white: '#ffffff', navy: '#000080', blue: '#0078d7',
  cyan: '#00b8c8', ice: '#80e0e8', green: '#008040', lime: '#80c860',
  yellow: '#ffe080', gold: '#e8b038', brown: '#906020', red: '#c04030',
  violet: '#785898', pink: '#d0b0d8',
};

function rect(x, y, width, height, color) {
  return `<rect x="${x * 2}" y="${y * 2}" width="${width * 2}" height="${height * 2}" fill="${C[color] || color}"/>`;
}

// A small raised surface: 1-pixel dark edge, white top/left, shaded bottom/right.
function panel(x, y, width, height, face = 'silver') {
  if (height < 3) {
    return rect(x, y, width, height, 'ink') + rect(x + 1, y, width - 2, 1, 'white');
  }
  return rect(x, y, width, height, 'ink')
    + rect(x + 1, y + 1, width - 2, height - 2, face)
    + rect(x + 1, y + 1, width - 2, 1, 'white')
    + rect(x + 1, y + 1, 1, height - 2, 'white')
    + rect(x + 1, y + height - 2, width - 2, 1, 'shadow')
    + rect(x + width - 2, y + 1, 1, height - 2, 'shadow');
}

function paper() {
  return rect(4, 1, 7, 1, 'ink') + rect(3, 2, 10, 13, 'ink')
    + rect(4, 2, 6, 12, 'white') + rect(10, 5, 2, 9, 'white')
    + rect(10, 2, 1, 1, 'silver') + rect(10, 3, 2, 2, 'silver')
    + rect(11, 2, 1, 1, 'ink') + rect(12, 3, 1, 2, 'ink');
}

function folder() {
  return rect(1, 4, 6, 1, 'ink') + rect(0, 5, 9, 8, 'ink')
    + rect(1, 5, 6, 7, 'gold') + rect(2, 6, 12, 1, 'ink')
    + rect(1, 7, 14, 7, 'ink') + rect(2, 7, 12, 6, 'yellow')
    + rect(2, 7, 12, 1, 'white') + rect(2, 12, 12, 1, 'gold')
    + rect(13, 8, 1, 4, 'gold');
}

function monitor() {
  return panel(1, 1, 14, 10) + rect(3, 3, 10, 6, 'ink')
    + rect(4, 4, 8, 4, 'blue') + rect(4, 4, 8, 1, 'cyan')
    + rect(5, 5, 2, 1, 'ice') + rect(5, 6, 1, 1, 'ice')
    + rect(7, 11, 3, 2, 'shadow') + panel(4, 13, 9, 2)
    + rect(11, 9, 1, 1, 'green');
}

function gear() {
  return rect(6, 0, 4, 16, 'ink') + rect(0, 6, 16, 4, 'ink')
    + rect(2, 2, 4, 4, 'ink') + rect(10, 2, 4, 4, 'ink')
    + rect(2, 10, 4, 4, 'ink') + rect(10, 10, 4, 4, 'ink')
    + rect(3, 4, 10, 8, 'silver') + rect(4, 3, 8, 10, 'silver')
    + rect(7, 1, 2, 14, 'silver') + rect(1, 7, 14, 2, 'silver')
    + rect(3, 3, 2, 2, 'white') + rect(11, 3, 2, 2, 'white')
    + rect(3, 11, 2, 2, 'shadow') + rect(11, 11, 2, 2, 'shadow')
    + rect(5, 5, 6, 6, 'ink') + rect(6, 6, 4, 4, 'shadow')
    + rect(6, 6, 3, 3, 'white');
}

const glyphs = {
  pc: monitor(),
  folder: folder(),
  document: paper() + rect(5, 7, 6, 1, 'navy') + rect(5, 9, 6, 1, 'shadow')
    + rect(5, 11, 4, 1, 'shadow'),
  apps: panel(1, 2, 14, 12) + rect(2, 3, 12, 2, 'navy')
    + rect(3, 6, 3, 3, 'blue') + rect(9, 6, 3, 3, 'green')
    + rect(3, 10, 3, 2, 'gold') + rect(9, 10, 3, 2, 'red')
    + rect(12, 3, 1, 1, 'white'),
  settings: gear(),
  system: panel(1, 2, 14, 12) + rect(2, 3, 12, 2, 'navy')
    + rect(3, 6, 4, 5, 'ink') + rect(4, 7, 2, 3, 'silver')
    + rect(9, 6, 3, 1, 'blue') + rect(9, 8, 3, 1, 'shadow')
    + rect(9, 10, 3, 1, 'shadow') + rect(3, 12, 9, 1, 'white'),
  term: panel(0, 2, 16, 12) + rect(2, 4, 12, 8, 'ink')
    + rect(3, 5, 1, 1, 'white') + rect(4, 6, 1, 1, 'white')
    + rect(3, 7, 1, 1, 'white') + rect(6, 8, 4, 1, 'white'),
  memory: paper() + rect(7, 5, 1, 7, 'green') + rect(6, 5, 3, 2, 'ink')
    + rect(6, 5, 2, 1, 'lime') + rect(5, 8, 6, 1, 'green')
    + rect(4, 9, 3, 3, 'ink') + rect(9, 9, 3, 3, 'ink')
    + rect(4, 9, 2, 2, 'lime') + rect(9, 9, 2, 2, 'lime'),
  shelf: rect(1, 3, 4, 11, 'ink') + rect(2, 4, 2, 9, 'red')
    + rect(5, 1, 5, 13, 'ink') + rect(6, 2, 3, 11, 'blue')
    + rect(10, 4, 4, 10, 'ink') + rect(11, 5, 2, 8, 'green')
    + rect(2, 5, 2, 1, 'yellow') + rect(6, 4, 3, 1, 'white')
    + rect(11, 6, 2, 1, 'yellow') + panel(0, 13, 16, 3, 'brown'),
  draw: paper() + rect(4, 9, 4, 4, 'blue') + rect(7, 10, 4, 3, 'cyan')
    + rect(10, 3, 2, 3, 'ink') + rect(9, 5, 2, 3, 'brown')
    + rect(8, 7, 2, 3, 'gold') + rect(7, 9, 2, 2, 'ink')
    + rect(11, 3, 1, 2, 'light'),
  // 关系图谱：像素连线图，四点一中心。
  graph: rect(2, 2, 1, 1, 'ink') + rect(1, 3, 3, 3, 'ink') + rect(2, 3, 1, 1, 'yellow')
    + rect(12, 1, 1, 1, 'ink') + rect(11, 2, 3, 3, 'ink') + rect(12, 2, 1, 1, 'ice')
    + rect(2, 12, 1, 1, 'ink') + rect(1, 11, 3, 3, 'ink') + rect(2, 11, 1, 1, 'cyan')
    + rect(12, 11, 1, 1, 'ink') + rect(11, 10, 3, 3, 'ink') + rect(12, 10, 1, 1, 'blue')
    + rect(7, 7, 2, 2, 'ink') + rect(7, 7, 1, 1, 'white')
    + rect(4, 5, 4, 1, 'shadow') + rect(5, 9, 3, 1, 'shadow')
    + rect(10, 4, 2, 3, 'shadow') + rect(8, 8, 3, 3, 'shadow')
    + rect(4, 11, 3, 2, 'shadow') + rect(9, 11, 2, 2, 'shadow'),
  video: panel(0, 2, 16, 12, 'ink') + rect(2, 5, 12, 6, 'navy')
    + rect(2, 3, 2, 1, 'white') + rect(6, 3, 2, 1, 'white')
    + rect(10, 3, 2, 1, 'white') + rect(2, 12, 2, 1, 'white')
    + rect(6, 12, 2, 1, 'white') + rect(10, 12, 2, 1, 'white')
    + rect(6, 6, 1, 4, 'yellow') + rect(7, 7, 1, 2, 'yellow')
    + rect(8, 8, 1, 1, 'yellow'),
  music: rect(7, 2, 7, 2, 'ink') + rect(6, 3, 2, 9, 'ink')
    + rect(12, 3, 2, 8, 'ink') + rect(2, 10, 6, 4, 'ink')
    + rect(9, 9, 5, 4, 'ink') + rect(3, 11, 3, 2, 'blue')
    + rect(10, 10, 2, 2, 'blue') + rect(7, 3, 5, 1, 'cyan')
    + rect(7, 4, 1, 6, 'shadow') + rect(13, 4, 1, 5, 'shadow'),
  scan: panel(0, 3, 16, 11) + rect(3, 1, 5, 3, 'ink')
    + rect(4, 2, 3, 1, 'silver') + rect(5, 5, 7, 7, 'ink')
    + rect(6, 6, 5, 5, 'blue') + rect(7, 7, 3, 3, 'navy')
    + rect(7, 7, 1, 1, 'white') + rect(2, 5, 2, 1, 'red')
    + rect(12, 4, 2, 2, 'white'),
  search: rect(3, 1, 6, 1, 'ink') + rect(1, 3, 1, 6, 'ink')
    + rect(2, 2, 8, 8, 'ink') + rect(3, 3, 6, 6, 'ice')
    + rect(4, 4, 4, 4, 'white') + rect(3, 9, 6, 1, 'ink')
    + rect(9, 3, 1, 6, 'ink') + rect(9, 9, 2, 2, 'ink')
    + rect(10, 10, 2, 2, 'brown') + rect(11, 11, 2, 2, 'brown')
    + rect(12, 12, 2, 2, 'ink') + rect(13, 13, 2, 2, 'ink'),
  help: panel(2, 1, 12, 14, 'navy') + rect(6, 4, 4, 1, 'white')
    + rect(5, 5, 1, 2, 'white') + rect(9, 5, 2, 2, 'white')
    + rect(8, 7, 2, 1, 'white') + rect(7, 8, 2, 2, 'white')
    + rect(7, 11, 2, 2, 'white'),
  run: panel(1, 4, 14, 8) + rect(3, 6, 6, 1, 'blue')
    + rect(3, 8, 4, 1, 'blue') + rect(9, 7, 2, 5, 'ink')
    + rect(11, 8, 2, 3, 'ink') + rect(13, 9, 2, 1, 'ink')
    + rect(10, 8, 1, 3, 'green') + rect(11, 9, 2, 1, 'green'),
  refresh: rect(4, 2, 7, 2, 'green') + rect(2, 4, 3, 2, 'green')
    + rect(1, 6, 2, 5, 'green') + rect(3, 11, 3, 2, 'green')
    + rect(6, 12, 5, 2, 'green') + rect(11, 10, 2, 3, 'green')
    + rect(12, 8, 2, 3, 'green') + rect(10, 4, 3, 2, 'green')
    + rect(12, 2, 2, 5, 'ink') + rect(10, 5, 4, 2, 'ink')
    + rect(4, 2, 6, 1, 'lime') + rect(2, 5, 1, 4, 'lime'),
  network: panel(0, 2, 7, 6) + rect(2, 4, 3, 2, 'blue')
    + rect(3, 8, 2, 3, 'shadow') + rect(3, 10, 9, 1, 'ink')
    + rect(10, 8, 2, 4, 'shadow') + panel(8, 5, 8, 7)
    + rect(10, 7, 4, 3, 'blue') + panel(8, 12, 8, 2)
    + rect(10, 7, 4, 1, 'cyan'),
  trash: rect(4, 1, 7, 1, 'ink') + panel(2, 3, 12, 3)
    + rect(3, 6, 10, 8, 'ink') + rect(4, 6, 8, 7, 'silver')
    + rect(4, 6, 1, 7, 'white') + rect(5, 7, 1, 5, 'shadow')
    + rect(8, 7, 1, 5, 'shadow') + rect(11, 7, 1, 5, 'shadow'),
  // Shared B clipped-corner bands and open rotating ring, on 16 logical pixels.
  start: PIXEL_SPARK_16,
};

export const PIXEL_ICONS = Object.freeze({
  ...glyphs,
  minesweeper: panel(1, 1, 14, 14) + rect(4, 4, 8, 8, 'ink')
    + rect(7, 2, 2, 12, 'ink') + rect(2, 7, 12, 2, 'ink')
    + rect(3, 3, 2, 2, 'ink') + rect(11, 3, 2, 2, 'ink')
    + rect(3, 11, 2, 2, 'ink') + rect(11, 11, 2, 2, 'ink')
    + rect(5, 5, 2, 2, 'white'),
  // 浏览器：Win98 式窗口 + 一枚地球，和现代图标讲同一件事。
  browser: panel(1, 2, 14, 12) + rect(2, 3, 12, 2, 'navy')
    + rect(3, 3, 1, 1, 'white') + rect(5, 3, 1, 1, 'white')
    + rect(5, 6, 7, 7, 'ink') + rect(6, 7, 5, 5, 'cyan')
    + rect(8, 6, 1, 7, 'blue') + rect(5, 9, 7, 1, 'blue')
    + rect(6, 7, 5, 1, 'ice') + rect(11, 6, 2, 2, 'white'),
  programs: glyphs.apps,
  documents: glyphs.document,
  theme: glyphs.settings,
});

export function pixelMarkup(id) {
  return PIXEL_ICONS[id] || PIXEL_ICONS.document;
}

export function pixelIcon(id, size = 16) {
  return h('svg', {
    class: 'nexlos-pixel-icon', width: size, height: size, viewBox: '0 0 32 32',
    'shape-rendering': 'crispEdges', 'aria-hidden': 'true', focusable: 'false',
    html: pixelMarkup(id),
  });
}
