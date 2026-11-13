import { rows as shell } from './shell-extra.js';
import { rows as media } from './media-extra.js';
import { rows as game } from './game-extra.js';
import { rows as backend } from './backend-extra.js';
import { rows as workspace } from './workspace.js';
import { templates } from './dynamic.js';
import { rows as final } from './final-extra.js';
import { templates as finalTemplates } from './final-dynamic.js';
import { rows as qa, templates as qaTemplates } from './qa-extra.js';
import { rows as artDocs, templates as artDocsTemplates } from './art-docs-extra.js';
import { rows as artImage, templates as artImageTemplates } from './art-image-extra.js';
import { rows as artVectorTime, templates as artVectorTimeTemplates } from './art-vector-time-extra.js';
import { rows as star, templates as starTemplates } from './star-extra.js';
import { rows as coverage, templates as coverageTemplates } from './coverage-extra.js';
import { rows as coverageBrowser } from './coverage-browser-extra.js';
import { rows as coverageMusic } from './coverage-music-extra.js';
import { rows as coverageByok, templates as coverageByokTemplates } from './coverage-byok-extra.js';
import { rows as coverageOs, templates as coverageOsTemplates } from './coverage-os-extra.js';
import { rows as coverageArtImage } from './coverage-art-image.js';
import { rows as coverageArtTime } from './coverage-art-time.js';
import { rows as coverageArtVector } from './coverage-art-vector.js';
import { rows as coverageArtDocs } from './coverage-art-docs.js';
import { rows as coverageBoard } from './coverage-board.js';
import { rows as coverageCommands } from './coverage-commands.js';
import { rows as coverageCraftStatus, templates as coverageCraftStatusTemplates } from './coverage-craft-status.js';
import { rows as coverageStore, templates as coverageStoreTemplates } from './coverage-store.js';
// 扩展语言用「中文原文 → 译文」的独立覆盖层，避免为每种新语言重写全部 8 列。
// 覆盖层只登记译文；源串、槽位与完整性闸门仍由主词表统一管理。
// 扩展语言是可选包：极致版默认只带 8 种内置语言，额外语言由 installed-packs.js 声明。
// 顶层 await 让缺包在装载期被跳过，不会因为 import 失败把整个桌面拖成白屏。
import { INSTALLED_PACKS } from './installed-packs.js';

const CODES = ['zh-CN', 'zh-TW', 'en', 'es', 'fr', 'de', 'ja', 'ko'];
function uniqueSources(rows) {
  const seen = new Set();
  return rows.filter(row => { if (seen.has(row[0])) return false; seen.add(row[0]); return true; });
}
export const CATALOG_ROWS = uniqueSources(shell.concat(workspace, media, game, backend, final, qa, artDocs, artImage, artVectorTime, star, coverage, coverageBrowser, coverageMusic, coverageByok, coverageOs, coverageArtImage, coverageArtTime, coverageArtVector, coverageArtDocs, coverageBoard, coverageCommands, coverageCraftStatus, coverageStore));
export const EXTRA_TRANSLATIONS = {};
for (const code of CODES.slice(1)) EXTRA_TRANSLATIONS[code] = {};
for (const row of CATALOG_ROWS) {
  if (row.length !== 8 || row.some(value => typeof value !== 'string' || !value.trim())) throw new Error('Invalid locale row: ' + row[0]);
  for (let index = 1; index < CODES.length; index += 1) {
    EXTRA_TRANSLATIONS[CODES[index]][row[0]] = row[index];
    // DOM text nodes preserve their surrounding whitespace separately.
    if (row[0] !== row[0].trim()) EXTRA_TRANSLATIONS[CODES[index]][row[0].trim()] = row[index].trim();
  }
}
export const MESSAGE_TEMPLATES = uniqueSources(templates.concat(finalTemplates, qaTemplates, artDocsTemplates, artImageTemplates, artVectorTimeTemplates, starTemplates, coverageTemplates, coverageByokTemplates, coverageOsTemplates, coverageCraftStatusTemplates, coverageStoreTemplates)).sort((a, b) => b[0].length - a[0].length);

// 扩展语言覆盖层：rows 与 templates 都是 [中文源串, 译文] 的二元组。
export const OVERLAY_TRANSLATIONS = Object.create(null);
export const OVERLAY_TEMPLATES = Object.create(null);
const OVERLAY_SOURCES = [];
for (const code of INSTALLED_PACKS) {
  try {
    const pack = await import(`./lang-${code}.js`);
    OVERLAY_SOURCES.push([code, pack.rows, pack.templates]);
  } catch (error) {
    // 缺包只少一门语言，不影响桌面启动；非缺包错误留给控制台排查。
    console.warn('[nexlos] 语言包未安装：' + code);
  }
}
for (const overlay of OVERLAY_SOURCES) {
  const code = overlay[0];
  const table = Object.create(null);
  for (const row of overlay[1]) {
    if (row.length !== 2 || typeof row[0] !== 'string' || !row[0].trim() || typeof row[1] !== 'string' || !row[1].trim()) {
      throw new Error('Invalid overlay row: ' + code + ' ' + row[0]);
    }
    table[row[0]] = row[1];
    // 与主词表一致：文本节点两侧空白由 DOM 单独保存，去空白后的源串也要能查到。
    if (row[0] !== row[0].trim()) table[row[0].trim()] = row[1].trim();
  }
  OVERLAY_TRANSLATIONS[code] = table;
  OVERLAY_TEMPLATES[code] = overlay[2];
}

// 槽位编号必须是 0…n-1 的排列：重复编号会让同一次捕获填进两个位置，
// 例如「任务 {0}/{0}」会把「3/5」写成「3/3」。在装载期直接拦下。
function templateSlots(value) {
  return [...value.matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]));
}
function validateTemplate(value, source) {
  const slots = templateSlots(value);
  if (new Set(slots).size !== slots.length || slots.sort().join(',') !== source) {
    throw new Error('Message template slots must be a permutation of the source: ' + value);
  }
}
for (const row of MESSAGE_TEMPLATES) {
  if (row.length < 8 || row.slice(0, 8).some(value => typeof value !== 'string' || !value.trim())) throw new Error('Invalid message template: ' + row[0]);
  const source = templateSlots(row[0]).sort().join(',');
  for (const value of row.slice(0, 8)) validateTemplate(value, source);
}
for (const code of Object.keys(OVERLAY_TEMPLATES)) {
  for (const row of OVERLAY_TEMPLATES[code]) {
    if (row.length !== 2 || !row[0].trim() || !row[1].trim()) throw new Error('Invalid overlay template: ' + code + ' ' + row[0]);
    validateTemplate(row[1], templateSlots(row[0]).sort().join(','));
  }
}
