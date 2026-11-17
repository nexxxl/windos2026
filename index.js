/**
 * NexlOS Host half — the DSH-native replacement for the Go kernel.
 *
 * The browser half serves NexlOS WebOS from the bundled `src/webos/` tree and
 * implements the kernel contract that UI already speaks:
 *   - `/a/*`     static WebOS assets (the real app.css / os.js / app.js graph)
 *   - `/c/*`     four-part command envelope, backed by this Host
 *   - `/s/*`     space-scoped commands
 *   - `/agent/*` the AI command bar, backed by DSH sessions in-process
 *
 * DSH owns the agent sessions and PTY services. This plugin owns the desktop,
 * local files, command adapters, browser bridge and application endpoints.
 *
 * @module @nexlos/os
 */

import { promises as fsp } from 'node:fs'
import http from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { inflateRawSync } from 'node:zlib'

import { createBrowserBridge } from './src/browser-bridge.js'
import { compileAppSpec, renderAppTemplate, validateGeneratedHtml } from './src/app-templates.js'
import { verifyAppHtml } from './src/app-verifier.js'
import { capabilityList, capabilityOf, unsupportedCapability } from './src/capabilities.js'

/** Plugin name; the Loader row, the bundle and the client entry share it. */
export const name = 'nexlos-os'

/** Wait for the HTTP carrier; this Host half only exists to serve the WebOS. */
export const inject = ['webServer']

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEBOS_ROOT = path.join(HERE, 'src', 'webos')
const ASSET_ROOT = path.join(WEBOS_ROOT, 'a')
const INDEX_FILE = path.join(WEBOS_ROOT, 'index.html')
// 健康检查报告安装包自己的版本；写死会和 package.json 漂移。
const PLUGIN_VERSION = (() => {
  try { return JSON.parse(readFileSync(path.join(HERE, 'package.json'), 'utf8')).version || '0.0.0' } catch (_error) { return '0.0.0' }
})()
const TEAM_STARTED_AT = Date.now()
const execFile = promisify(execFileCallback)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
}

const HIDDEN_DIRS = new Set(['.git', 'node_modules', '.cache', '.DS_Store', '.nexlos'])
const HIDDEN_FILES = new Set(['settings.json', 'workspace.json', 'cluster.json'])
const TEXT_EXT = new Set([
  '.md', '.txt', '.json', '.js', '.mjs', '.css', '.html', '.go', '.log',
  '.csv', '.yml', '.yaml', '.sh', '.toml', '.ini', '.reg',
])
const KIND_LABELS = {
  '.md': 'Markdown', '.txt': '文本', '.json': 'JSON', '.js': '脚本', '.mjs': '脚本',
  '.css': '样式', '.html': '网页', '.go': 'Go', '.log': '日志', '.csv': '表格',
  '.yml': 'YAML', '.yaml': 'YAML', '.sh': '脚本', '.toml': 'TOML', '.ini': '配置',
  '.png': '图片', '.jpg': '图片', '.jpeg': '图片', '.webp': '图片', '.gif': '图片',
  '.mp3': '音频', '.wav': '音频', '.mp4': '视频', '.webm': '视频', '.pdf': 'PDF',
}

const SETTINGS_DEFAULTS = {
  appearance: 'current',
  retroWallpaper: 'default',
  retroFont: 'pixel',
  retroFontSize: 12,
  theme: 'light',
  accent: '#0078d4',
  wallpaper: 'snowfog',
  clock24: false,
  reduceMotion: false,
  name: 'NexlOS',
  language: 'en',
  onboarded: false,
  companion: '',
  companionSize: 100,
  companionHidden: false,
  companionMode: 'desktop',
  starOpened: false,
  browserProvider: 'sidecar',
  browserAttachUrl: 'http://127.0.0.1:9222',
  browserProfile: 'default',
}

const WALLPAPERS = new Set(['default', 'snowfog', 'canyon', 'valley', 'dusk', 'slate', 'custom'])
const RETRO_WALLPAPERS = new Set(['default', 'bliss', 'teal', 'slate', 'custom'])
const RETRO_FONTS = new Set(['pixel', 'song', 'kai', 'hei'])
const LANGUAGES = new Set(['zh-CN', 'zh-TW', 'en', 'es', 'fr', 'de', 'ja', 'ko', 'ar', 'cs', 'it', 'pt-BR', 'ru', 'tr', 'vi'])

/* ------------------------------------------------------------------ */
/* Small filesystem helpers                                            */
/* ------------------------------------------------------------------ */

function isoTime(date) {
  return new Date(date).toISOString().replace(/\.(\d{3})Z$/u, '.$1Z')
}

function isoNow() {
  return isoTime(Date.now())
}

function countWords(text) {
  if (!text) return 0
  const cjk = text.match(/[\u3400-\u9fff]/gu)
  const latin = text.match(/[A-Za-z0-9]+/g)
  return (cjk ? cjk.length : 0) + (latin ? latin.length : 0)
}

function titleOf(markdown, fallback) {
  for (const line of String(markdown || '').split('\n')) {
    const matched = /^#\s+(.+)$/u.exec(line.trim())
    if (matched) return matched[1].trim()
  }
  return fallback
}

function slugify(input, fallback) {
  let value = String(input || '').trim()
  value = value.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, ' ')
  value = value.replace(/\s+/gu, '-')
  value = value.replace(/^[-.]+|[-.]+$/gu, '')
  if (value.length > 40) value = Array.from(value).slice(0, 40).join('')
  return value === '' ? fallback : value
}

function isoDir(date) {
  return new Date(date).toISOString().replace(/[:.]/gu, '-')
}

async function writeAtomic(file, content) {
  const dir = path.dirname(file)
  await fsp.mkdir(dir, { recursive: true })
  const temp = path.join(dir, `.${path.basename(file)}.tmp-${randomUUID()}`)
  await fsp.writeFile(temp, content)
  await fsp.chmod(temp, 0o644)
  await fsp.rename(temp, file)
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch (_error) {
    return fallback
  }
}

async function writeJson(file, value) {
  await writeAtomic(file, JSON.stringify(value, null, 2) + '\n')
}

function inside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}

function resolveVirtual(home, virtualPath) {
  let clean = String(virtualPath || '/').replace(/\\/gu, '/')
  if (!clean.startsWith('/')) clean = '/' + clean
  const parts = clean.split('/').filter(Boolean)
  if (parts.some(part => part === '..' || part === '.')) throw new Error('路径不合法')
  const absolute = path.join(home, ...parts)
  if (!inside(home, absolute)) throw new Error('路径越界')
  return { vpath: '/' + parts.join('/'), absolute }
}

function parentVPath(vpath) {
  if (vpath === '/' || vpath === '') return '/'
  const parts = vpath.split('/').filter(Boolean)
  parts.pop()
  return parts.length === 0 ? '/' : '/' + parts.join('/')
}

function crumbsOf(vpath) {
  const parts = vpath.split('/').filter(Boolean)
  const rows = [{ name: '此电脑', path: '/' }]
  let walked = ''
  for (const part of parts) {
    walked += '/' + part
    rows.push({ name: part, path: walked })
  }
  return rows
}

async function pathStat(file) {
  try {
    return await fsp.stat(file)
  } catch (_error) {
    return undefined
  }
}

async function dirUsage(root) {
  let bytes = 0
  let files = 0
  let entries
  try {
    entries = await fsp.readdir(root, { withFileTypes: true })
  } catch (_error) {
    return { bytes, files }
  }
  for (const entry of entries) {
    const child = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (HIDDEN_DIRS.has(entry.name)) continue
      const nested = await dirUsage(child)
      bytes += nested.bytes
      files += nested.files
    } else if (entry.isFile()) {
      const info = await pathStat(child)
      if (info !== undefined) {
        bytes += info.size
        files += 1
      }
    }
  }
  return { bytes, files }
}

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

function settingsFile(home) {
  return path.join(home, 'settings.json')
}

async function loadSettings(home) {
  const stored = await readJson(settingsFile(home), {})
  return { ...SETTINGS_DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) }
}

function pickSettings(fields, current) {
  const next = { ...current }
  if (typeof fields.appearance === 'string' && (fields.appearance === 'current' || fields.appearance === 'win98')) {
    next.appearance = fields.appearance
  }
  if (typeof fields.theme === 'string' && (fields.theme === 'light' || fields.theme === 'dark')) next.theme = fields.theme
  if (typeof fields.accent === 'string' && /^#[0-9a-fA-F]{6}$/u.test(fields.accent)) next.accent = fields.accent
  if (typeof fields.wallpaper === 'string' && WALLPAPERS.has(fields.wallpaper)) next.wallpaper = fields.wallpaper
  if (typeof fields.retroWallpaper === 'string' && RETRO_WALLPAPERS.has(fields.retroWallpaper)) next.retroWallpaper = fields.retroWallpaper
  if (typeof fields.retroFont === 'string' && RETRO_FONTS.has(fields.retroFont)) next.retroFont = fields.retroFont
  if (Number.isInteger(fields.retroFontSize) && fields.retroFontSize >= 12 && fields.retroFontSize <= 24) {
    next.retroFontSize = fields.retroFontSize
  }
  if (typeof fields.clock24 === 'boolean') next.clock24 = fields.clock24
  if (typeof fields.reduceMotion === 'boolean') next.reduceMotion = fields.reduceMotion
  if (typeof fields.name === 'string' && fields.name.trim() !== '') next.name = fields.name.trim().slice(0, 40)
  if (typeof fields.language === 'string' && LANGUAGES.has(fields.language)) next.language = fields.language
  if (typeof fields.onboarded === 'boolean') next.onboarded = fields.onboarded
  if (typeof fields.companion === 'string') next.companion = fields.companion
  if (Number.isInteger(fields.companionSize) && fields.companionSize >= 60 && fields.companionSize <= 220) {
    next.companionSize = fields.companionSize
  }
  if (typeof fields.companionHidden === 'boolean') next.companionHidden = fields.companionHidden
  if (typeof fields.companionMode === 'string') next.companionMode = fields.companionMode
  if (typeof fields.starOpened === 'boolean') next.starOpened = fields.starOpened
  if (fields.browserProvider === 'sidecar' || fields.browserProvider === 'attach') next.browserProvider = fields.browserProvider
  if (typeof fields.browserProfile === 'string' && /^[a-z0-9_-]{1,32}$/u.test(fields.browserProfile)) next.browserProfile = fields.browserProfile
  if (typeof fields.browserAttachUrl === 'string') {
    try {
      const parsed = new URL(fields.browserAttachUrl.trim())
      if (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) && parsed.username === '' && parsed.password === '') {
        next.browserAttachUrl = parsed.origin
      }
    } catch (_error) { /* keep previous */ }
  }
  return next
}

/* ------------------------------------------------------------------ */
/* Workspace book store (faithful to the Go store's on-disk layout)    */
/* ------------------------------------------------------------------ */

function spacesRoot(home) {
  // The Go kernel treats NEXLOS_HOME itself as the space root: books are direct
  // children (`<home>/<book>/book.json`), never `<home>/spaces/<book>`.
  return home
}

function bookId(id) {
  const value = String(id || '').trim()
  if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(value)) throw new Error('space id 不合法')
  return value
}

function bookDir(home, id) {
  return path.join(spacesRoot(home), bookId(id))
}

async function readBook(home, id) {
  const dir = bookDir(home, id)
  const book = await readJson(path.join(dir, 'book.json'), undefined)
  if (book === undefined || book === null) throw new Error('space not found: ' + id)
  return book
}

async function chapterRows(home, id) {
  const dir = path.join(bookDir(home, id), 'chapters')
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch (_error) {
    return []
  }
  const names = entries.filter(entry => entry.isFile() && entry.name.endsWith('.md')).map(entry => entry.name).sort()
  const rows = []
  for (const file of names) {
    const target = path.join(dir, file)
    let text = ''
    try {
      text = await fsp.readFile(target, 'utf8')
    } catch (_error) {
      continue
    }
    const info = await pathStat(target)
    const fallback = file.replace(/\.md$/u, '').replace(/^\d{4}-/u, '')
    rows.push({
      file,
      title: titleOf(text, fallback),
      words: countWords(text),
      updatedAt: info ? isoTime(info.mtimeMs) : '',
    })
  }
  return rows
}

async function listBooks(home) {
  const root = spacesRoot(home)
  let entries
  try {
    entries = await fsp.readdir(root, { withFileTypes: true })
  } catch (_error) {
    return []
  }
  const rows = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[\p{L}\p{N}_-]{1,64}$/u.test(entry.name)) continue
    try {
      const book = await readBook(home, entry.name)
      const chapters = await chapterRows(home, entry.name)
      const words = chapters.reduce((sum, chapter) => sum + chapter.words, 0)
      rows.push({ ...book, id: entry.name, chapters: chapters.length, words })
    } catch (_error) {
      /* not a book */
    }
  }
  rows.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
  return rows
}

async function createBook(home, fields) {
  const title = String(fields.title || fields.name || '未命名').trim()
  const name = String(fields.name || title).trim()
  const author = String(fields.author || '').trim()
  let id = slugify(name || title, 'untitled')
  for (let index = 2; existsSync(path.join(spacesRoot(home), id)); index += 1) id = slugify(name || title, 'untitled') + '-' + index
  if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(id)) throw new Error('书名无法作为目录名')
  const dir = path.join(spacesRoot(home), id)
  await fsp.mkdir(path.join(dir, 'chapters'), { recursive: true })
  const now = isoNow()
  const book = { id, title, author, premise: '', tags: [], createdAt: now, updatedAt: now }
  await writeJson(path.join(dir, 'book.json'), book)
  await writeAtomic(path.join(dir, 'outline.md'), '# ' + title + ' · 总纲\n\n## 一句话\n\n\n## 三幕\n\n### 第一幕\n\n### 第二幕\n\n### 第三幕\n\n')
  await writeJson(path.join(dir, 'cast.json'), { cast: [] })
  return book
}

async function toucBook(home, id) {
  const file = path.join(bookDir(home, id), 'book.json')
  const book = await readJson(file, undefined)
  if (book === undefined || book === null) return
  book.updatedAt = isoNow()
  await writeJson(file, book)
}

async function createChapter(home, id, title) {
  const dir = path.join(bookDir(home, id), 'chapters')
  await fsp.mkdir(dir, { recursive: true })
  let entries = []
  try {
    entries = await fsp.readdir(dir)
  } catch (_error) {
    entries = []
  }
  const numbered = entries.filter(name => /^\d{4}-.*\.md$/u.test(name)).length
  const name = String(title || '新章').trim() || '新章'
  const file = String(numbered + 1).padStart(4, '0') + '-' + slugify(name, 'untitled') + '.md'
  await writeAtomic(path.join(dir, file), '# ' + name + '\n\n')
  return { file, title: name }
}

function validChapterFile(file) {
  return /^[A-Za-z0-9_\u3400-\u9fff.-]+\.md$/u.test(String(file || ''))
}

async function readChapter(home, id, file) {
  if (!validChapterFile(file)) throw new Error('章节文件名不合法')
  const text = await fsp.readFile(path.join(bookDir(home, id), 'chapters', String(file)), 'utf8')
  return { file, text, words: countWords(text) }
}

async function saveChapter(home, id, file, text) {
  if (!validChapterFile(file)) throw new Error('章节文件名不合法')
  await writeAtomic(path.join(bookDir(home, id), 'chapters', String(file)), String(text || ''))
  await toucBook(home, id)
  return { file, words: countWords(text), title: titleOf(text, String(file).replace(/\.md$/u, '')) }
}

async function outlineText(home, id) {
  await readBook(home, id)
  try {
    return await fsp.readFile(path.join(bookDir(home, id), 'outline.md'), 'utf8')
  } catch (_error) {
    return ''
  }
}

async function saveOutline(home, id, text) {
  await readBook(home, id)
  await writeAtomic(path.join(bookDir(home, id), 'outline.md'), String(text || ''))
  await toucBook(home, id)
  return countWords(text)
}

async function castRows(home, id) {
  await readBook(home, id)
  const raw = await readJson(path.join(bookDir(home, id), 'cast.json'), { cast: [] })
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.cast)) return raw.cast
  return []
}

async function saveCast(home, id, cast) {
  await readBook(home, id)
  const rows = Array.isArray(cast) ? cast : []
  await writeJson(path.join(bookDir(home, id), 'cast.json'), { cast: rows })
  await toucBook(home, id)
  return rows.length
}

async function exportMarkdown(home, id) {
  const book = await readBook(home, id)
  const chapters = await chapterRows(home, id)
  const cast = await castRows(home, id)
  const outline = await outlineText(home, id)
  const parts = []
  parts.push('# ' + (book.title || id) + '\n')
  if (book.author) parts.push('作者：' + book.author + '\n')
  if (book.premise) parts.push('> ' + String(book.premise).replace(/\n/gu, '\n> ') + '\n')
  if (outline.trim() !== '') parts.push('\n---\n\n## 总纲\n\n' + outline.trim() + '\n')
  if (cast.length > 0) {
    parts.push('\n---\n\n## 人物\n\n')
    for (const person of cast) {
      if (person && typeof person === 'object') {
        const line = [person.name, person.role, person.note].filter(value => typeof value === 'string' && value !== '').join(' · ')
        if (line) parts.push('- ' + line + '\n')
      }
    }
  }
  for (const chapter of chapters) {
    const raw = await fsp.readFile(path.join(bookDir(home, id), 'chapters', chapter.file), 'utf8')
    parts.push('\n---\n\n' + raw.trim() + '\n')
  }
  const filename = (book.title || id) + '.md'
  return { filename, markdown: parts.join(''), chapters: chapters.length }
}

/* ------------------------------------------------------------------ */
/* Portable GraphService (Phase 1: graph.index / graph.note)            */
/* ------------------------------------------------------------------ */

const GRAPH_MAX_NOTES = 3000
const GRAPH_MAX_LINKS = 12000
const GRAPH_MAX_NOTE_BYTES = 256 * 1024
const GRAPH_SKIP_DIRS = new Set(['.git', 'node_modules', '回收站', '.trash', 'cache', 'appdata', 'companions', 'companiondata', 'outbox', 'inbox', 'logs'])

function graphRootOf(home) {
  return path.join(home, 'nexl交换区')
}

function graphPathId(value) {
  return String(value || '').replace(/\\/gu, '/').replace(/^\/+/u, '')
}

function graphNorm(value) {
  return String(value || '').normalize('NFC')
}

function graphTitleAndTags(text) {
  let title = ''
  let body = String(text || '')
  let front = ''
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(body)
  if (fm) {
    front = fm[1]
    body = body.slice(fm[0].length)
  }
  const tags = new Set()
  let inTags = false
  for (const line of front.split(/\r?\n/u)) {
    const hit = /^title\s*:\s*(.+)$/iu.exec(line)
    if (hit) title = hit[1].trim().replace(/^["']|["']$/gu, '')
    const tagLine = /^tags\s*:\s*(.+)$/iu.exec(line)
    if (tagLine) {
      inTags = true
      const raw = tagLine[1].trim()
      if (raw.startsWith('[')) {
        for (const item of raw.replace(/^\[|\]$/gu, '').split(',')) {
          const tag = item.trim().replace(/^["']|["']$/gu, '').replace(/^#/u, '')
          if (tag !== '') tags.add(tag)
        }
        inTags = false
      }
      continue
    }
    if (inTags) {
      const item = /^\s*-\s*(.+)$/u.exec(line)
      if (item) {
        const tag = item[1].trim().replace(/^["']|["']$/gu, '').replace(/^#/u, '')
        if (tag !== '') tags.add(tag)
        continue
      }
      inTags = false
    }
  }
  if (title === '') {
    const heading = /^#\s+(.+)$/mu.exec(body)
    if (heading) title = heading[1].trim()
  }
  // Inline #tags outside code fences and ATX headings.
  let visible = body.replace(/```[\s\S]*?```/gu, '').replace(/~~~[\s\S]*?~~~/gu, '')
  for (const line of visible.split(/\r?\n/u)) {
    if (/^\s*#{1,6}\s/u.test(line)) continue
    for (const match of line.matchAll(/(^|[\s(])#([\p{L}\p{N}_-]{1,48})/gu)) tags.add(match[2])
  }
  return { title: title.trim(), tags: [...tags].slice(0, 64), body }
}

function graphLinksOf(body) {
  const visible = body.replace(/```[\s\S]*?```/gu, '').replace(/~~~[\s\S]*?~~~/gu, '')
  const links = []
  for (const match of visible.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/gu)) {
    const target = match[1].trim()
    if (target !== '') links.push({ target, alias: (match[2] || '').trim() })
  }
  for (const match of visible.matchAll(/(^|[^!])\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu)) {
    const target = match[3].trim().replace(/^<|>$/gu, '').split('#')[0]
    if (target === '' || /^[a-z][a-z0-9+.-]*:/iu.test(target)) continue
    if (!/\.md$/iu.test(target)) continue
    links.push({ target: decodeURIComponentSafe(target), alias: match[2].trim() })
  }
  return links
}

function decodeURIComponentSafe(value) {
  try { return decodeURIComponent(value) } catch (_error) { return value }
}

async function graphFiles(root) {
  const files = []
  let truncated = false
  async function walk(dir, relative) {
    if (files.length >= GRAPH_MAX_NOTES) { truncated = true; return }
    let entries
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch (_error) { return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (files.length >= GRAPH_MAX_NOTES) { truncated = true; return }
      if (entry.name.startsWith('.') || GRAPH_SKIP_DIRS.has(entry.name)) continue
      if (entry.isSymbolicLink()) continue
      const child = path.join(dir, entry.name)
      const rel = relative === '' ? entry.name : relative + '/' + entry.name
      if (entry.isDirectory()) { await walk(child, rel); continue }
      if (!entry.name.toLowerCase().endsWith('.md')) continue
      files.push({ abs: child, rel: graphPathId(rel) })
    }
  }
  await walk(root, '')
  return { files, truncated }
}

async function graphIndex(home) {
  const root = graphRootOf(home)
  if (!existsSync(root)) return { root: '/nexl交换区', absRoot: root, notes: 0, links: 0, tags: 0, truncated: false, nodes: [], edges: [] }
  const walked = await graphFiles(root)
  const notes = new Map()
  const tagSet = new Set()
  for (const file of walked.files) {
    let info
    try { info = await fsp.stat(file.abs) } catch (_error) { continue }
    if (!info.isFile() || info.size > GRAPH_MAX_NOTE_BYTES) continue
    let text
    try { text = await fsp.readFile(file.abs, 'utf8') } catch (_error) { continue }
    const parsed = graphTitleAndTags(text)
    for (const tag of parsed.tags) tagSet.add(tag)
    notes.set(file.rel, {
      id: file.rel,
      name: parsed.title || path.posix.basename(file.rel).replace(/\.md$/iu, ''),
      folder: path.posix.dirname(file.rel) === '.' ? '' : path.posix.dirname(file.rel),
      size: info.size,
      tags: parsed.tags,
      out: 0,
      text: parsed.body,
    })
  }
  const byExact = new Map()
  const byBase = new Map()
  for (const id of notes.keys()) {
    byExact.set(graphNorm(id), id)
    byExact.set(graphNorm(id.replace(/\.md$/iu, '')), id)
    const base = graphNorm(path.posix.basename(id).replace(/\.md$/iu, '')).toLocaleLowerCase()
    if (!byBase.has(base)) byBase.set(base, [])
    byBase.get(base).push(id)
  }
  function resolveLink(source, raw) {
    let target = String(raw || '').trim().replace(/^<|>$/gu, '').split('#')[0]
    if (target === '' || /^[a-z][a-z0-9+.-]*:/iu.test(target)) return null
    target = decodeURIComponentSafe(target).replace(/\\/gu, '/').replace(/^\/+/u, '')
    const candidates = []
    if (String(raw).startsWith('/')) candidates.push(target)
    else candidates.push(path.posix.join(path.posix.dirname(source), target))
    candidates.push(target)
    for (const candidate of candidates) {
      const normalized = path.posix.normalize(candidate).replace(/^\.\//u, '')
      if (normalized === '' || normalized.startsWith('..')) continue
      for (const key of [normalized, normalized.replace(/\.md$/iu, ''), normalized + '.md']) {
        const exact = byExact.get(graphNorm(key))
        if (exact !== undefined) return exact
      }
    }
    const base = graphNorm(path.posix.basename(target).replace(/\.md$/iu, '')).toLocaleLowerCase()
    const matches = byBase.get(base)
    if (matches && matches.length > 0) return matches[0]
    return null
  }
  const ghostNodes = new Map()
  const edges = new Map()
  for (const [source, note] of notes) {
    for (const link of graphLinksOf(note.text)) {
      let target = resolveLink(source, link.target)
      if (target === null) {
        const key = graphNorm(link.target).replace(/\\/gu, '/').replace(/^\/+/u, '')
        target = '?' + key
        if (!ghostNodes.has(target)) {
          ghostNodes.set(target, {
            id: target, name: key.replace(/\.md$/iu, ''), folder: '', size: 0,
            tags: [], out: 0, ghost: true,
          })
        }
      }
      const key = source + '\u0000' + target
      const edge = edges.get(key)
      if (edge === undefined) {
        if (edges.size >= GRAPH_MAX_LINKS) { walked.truncated = true; continue }
        edges.set(key, { source, target, w: 1 })
      } else {
        edge.w += 1
      }
    }
  }
  for (const edge of edges.values()) {
    const source = notes.get(edge.source)
    if (source) source.out += 1
  }
  const nodes = [...notes.values()].map(({ text: _text, ...node }) => node)
  for (const ghost of ghostNodes.values()) nodes.push(ghost)
  nodes.sort((a, b) => a.id.localeCompare(b.id))
  return {
    root: '/nexl交换区',
    absRoot: root,
    notes: notes.size,
    links: edges.size,
    tags: tagSet.size,
    truncated: walked.truncated,
    nodes,
    edges: [...edges.values()],
  }
}

async function graphNote(home, rawPath) {
  let rel = graphPathId(rawPath).trim()
  if (rel === '' || rel.includes('..')) throw new Error('路径不合法')
  if (!rel.toLowerCase().endsWith('.md')) throw new Error('只能读取 Markdown')
  const root = graphRootOf(home)
  const abs = path.resolve(root, rel)
  if (!inside(root, abs)) throw new Error('路径不合法')
  let info
  try { info = await fsp.stat(abs) } catch (_error) { throw new Error('读不到这篇笔记') }
  if (!info.isFile()) throw new Error('读不到这篇笔记')
  if (info.size > GRAPH_MAX_NOTE_BYTES) throw new Error('这篇笔记超过 256 KB')
  const text = await fsp.readFile(abs, 'utf8')
  return { path: '/' + graphPathId(rel), text, bytes: info.size, mod: isoTime(info.mtimeMs) }
}

/* ------------------------------------------------------------------ */
/* Memory tree (NexlOS home/nexl交换区/记忆树)                          */
/* ------------------------------------------------------------------ */

function containerRootOf(home) {
  return path.join(home, 'containers')
}

function memoryRootOf(home) {
  return path.join(home, 'nexl交换区', '记忆树')
}

const MEMORY_AREAS = ['topics', 'observations', 'projects']

async function ensureMemoryTree(home) {
  const root = memoryRootOf(home)
  await fsp.mkdir(root, { recursive: true })
  for (const area of MEMORY_AREAS) await fsp.mkdir(path.join(root, area), { recursive: true })
  const index = path.join(root, 'INDEX.md')
  if (!existsSync(index)) {
    await writeAtomic(index, '# 记忆索引\n\n> 由 NexlOS 自动登记。人写或 agent 写，都是同一批 Markdown。\n\n## 主题\n\n## 观察\n\n## 项目\n')
  }
  return root
}

function memoryVirtualPath(value) {
  let clean = String(value || '').trim().replace(/\\/gu, '/')
  if (!clean.startsWith('/memory')) throw new Error('记忆路径必须以 /memory 开头')
  clean = clean.slice('/memory'.length)
  if (!clean.startsWith('/')) clean = '/' + clean
  const parts = clean.split('/').filter(Boolean)
  if (parts.some(part => part === '..' || part === '.')) throw new Error('记忆路径不合法')
  if (parts.length === 1 && parts[0] === 'INDEX.md') return 'INDEX.md'
  if (parts.length === 2 && MEMORY_AREAS.includes(parts[0]) && parts[1].endsWith('.md')) {
    return parts[0] + '/' + parts[1]
  }
  throw new Error('记忆树只收 INDEX.md 与 topics/observations/projects 下的 Markdown')
}

async function memoryRows(home) {
  const root = await ensureMemoryTree(home)
  const rows = []
  async function walk(dir, relative) {
    let entries
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch (_error) { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const child = path.join(dir, entry.name)
      const rel = relative === '' ? entry.name : relative + '/' + entry.name
      if (entry.isDirectory()) {
        if (relative === '' && !MEMORY_AREAS.includes(entry.name)) continue
        if (relative !== '' && MEMORY_AREAS.includes(relative)) continue
        await walk(child, rel)
        continue
      }
      if (!entry.name.toLowerCase().endsWith('.md')) continue
      let name = rel
      if (name !== 'INDEX.md') {
        const parts = name.split('/')
        if (parts.length !== 2 || !MEMORY_AREAS.includes(parts[0])) continue
      }
      const info = await pathStat(child)
      let text = ''
      try { text = await fsp.readFile(child, 'utf8') } catch (_error) { continue }
      const area = name === 'INDEX.md' ? 'index' : name.split('/')[0]
      rows.push({
        path: '/memory/' + name,
        name,
        area,
        title: titleOf(text, entry.name),
        bytes: info ? info.size : Buffer.byteLength(text),
        mod: info ? isoTime(info.mtimeMs) : '',
      })
    }
  }
  await walk(root, '')
  rows.sort((a, b) => {
    const order = { index: 0, topics: 1, observations: 2, projects: 3, other: 4 }
    if (order[a.area] !== order[b.area]) return order[a.area] - order[b.area]
    return a.path.localeCompare(b.path)
  })
  return rows
}

async function registerMemoryIndex(home, area, file, title) {
  const root = await ensureMemoryTree(home)
  const index = path.join(root, 'INDEX.md')
  let text = ''
  try { text = await fsp.readFile(index, 'utf8') } catch (_error) { text = '# 记忆索引\n' }
  const link = '- [' + title + '](/' + area + '/' + file + ')'
  if (text.includes('(/' + area + '/' + file + ')')) return
  const headings = { topics: '## 主题', observations: '## 观察', projects: '## 项目' }
  const heading = headings[area]
  if (heading && text.includes(heading)) {
    text = text.replace(heading, heading + '\n\n' + link + '\n')
  } else {
    text = text.trimEnd() + '\n\n' + (heading || '## ' + area) + '\n\n' + link + '\n'
  }
  await writeAtomic(index, text)
}

/* ------------------------------------------------------------------ */
/* Run reports                                                         */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/gu, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]))
}

function truncateText(value, max) {
  const text = String(value == null ? '' : value)
  return text.length > max ? text.slice(0, max) + '…' : text
}

function runReportMarkdown(input) {
  const lines = []
  lines.push('# NexlOS 运行汇报', '')
  lines.push('- 命令：' + (input.command || '（无）'))
  lines.push('- 状态：' + (input.ok ? '完成' : '失败') + (input.reason ? ' · ' + input.reason : ''))
  lines.push('- 开始：' + new Date(input.startedAt).toLocaleString('zh-CN'))
  lines.push('- 用时：' + ((input.endedAt - input.startedAt) / 1000).toFixed(1) + 's')
  if (input.sessionId) lines.push('- 会话：`' + input.sessionId + '`')
  if (input.model) lines.push('- 模型：`' + input.model + '`')
  lines.push('', '## 结论', '')
  lines.push((input.assistantText || input.errorText || '（本轮没有产生文字结论）').trim())
  if (input.tools && input.tools.length > 0) {
    lines.push('', '## 过程', '')
    for (const tool of input.tools.slice(-40)) {
      const args = tool.arguments ? ' ' + truncateText(tool.arguments, 220) : ''
      const result = tool.result ? ' → ' + truncateText(tool.result, 320) : ''
      lines.push('- `' + (tool.name || 'tool') + '`' + args + result)
    }
  }
  lines.push('', '---', '', '由 NexlOS 在 DeepSeek Harness 会话中生成。完整 HTML 版本与本文件同目录。')
  return lines.join('\n')
}

function runReportHtml(markdown) {
  const escaped = escapeHtml(markdown)
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>NexlOS 运行汇报</title>' +
    '<style>body{font:14px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:860px;margin:40px auto;padding:0 22px;color:#1d2430;background:#f5efe4}' +
    'pre{white-space:pre-wrap;background:#fffdf7;border:1px solid #e4dccd;border-radius:10px;padding:16px}</style></head><body><pre>' + escaped + '</pre></body></html>'
}

function eventMessageText(data) {
  if (!data) return ''
  const content = data.message && data.message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(block => block && block.type === 'text').map(block => block.text || '').join('')
}

function transcriptFromEvents(events) {
  const items = []
  const openCalls = {}
  for (const event of events || []) {
    const type = event && event.type
    const data = event && event.data
    if (type === 'user/message') {
      const text = eventMessageText(data)
      if (text.trim() !== '') items.push({ role: 'user', text, seq: event.seq })
    } else if (type === 'assistant/message') {
      const text = eventMessageText(data)
      if (text.trim() !== '') items.push({ role: 'assistant', text, seq: event.seq })
    } else if (type === 'tool/call') {
      const call = { role: 'tool', name: (data && data.name) || 'tool', arguments: (data && data.arguments) || '', text: '', ok: true, seq: event.seq }
      if (data && data.callId) openCalls[data.callId] = call
      items.push(call)
    } else if (type === 'tool/result') {
      const callId = data && data.message && data.message.toolCallId
      const call = callId ? openCalls[callId] : undefined
      const text = data && data.error
        ? ((data.error.name || 'tool') + ': ' + (data.error.code || '') + (data.error.reason ? ' · ' + data.error.reason : ''))
        : eventMessageText(data)
      if (call) {
        call.text = text
        call.ok = !(data && (data.error || (data.message && data.message.isError)))
      } else {
        items.push({ role: 'tool', name: 'tool', arguments: '', text, ok: !(data && data.error), seq: event.seq })
      }
    }
  }
  return items.slice(-180)
}

async function writeRunReport(home, input) {
  const dir = path.join(home, '.nexlos', 'reports')
  await fsp.mkdir(dir, { recursive: true })
  const stamp = new Date(input.startedAt).toISOString().replace(/[:.]/gu, '-')
  const slug = slugify(input.command || 'run', 'run').slice(0, 32)
  const base = stamp + '-' + slug
  const markdown = runReportMarkdown(input)
  await writeAtomic(path.join(dir, base + '.md'), markdown + '\n')
  await writeAtomic(path.join(dir, base + '.html'), runReportHtml(markdown))
  return path.relative(home, path.join(dir, base + '.md')).split(path.sep).join('/')
}

/* ------------------------------------------------------------------ */
/* App manifest (the Go app.list surface, without native bundles)      */
/* ------------------------------------------------------------------ */

function appWindow(width, height, minWidth, minHeight) {
  return { width, height, minWidth, minHeight }
}

function internalApp(id, title, icon, route, description, category, window) {
  return {
    id, name: title, title, kind: 'internal', icon, route, description, category,
    status: 'ready', statusLabel: '内置', clean: true, dock: true, desktop: true,
    singleton: true, window,
  }
}

function appManifest() {
  const apps = [
    internalApp('pc', '此电脑', 'pc', '#/pc', '浏览 NexlOS 目录：空间、应用、库与日志。', '系统', appWindow(1080, 700, 760, 480)),
    internalApp('term', '终端', 'term', '#/term', '在宿主电脑上跑 shell：git、npm、构建脚本。', '系统', appWindow(920, 600, 620, 400)),
    internalApp('memory', '记忆', 'memory', '#/memory', '宿主工作区的记忆树：主题、观察与项目。', '创作', appWindow(1000, 680, 720, 480)),
    internalApp('shelf', '书房', 'shelf', '#/shelf', '书目、正文、总纲、人物、任务与导出。', '创作', appWindow(1180, 780, 820, 560)),
    (() => {
      const app = internalApp('draw', '画板', 'draw', '#/draw', '宋韵画笺：毛笔、水彩、蜡笔、画框、套索与拍立得，导出 PNG 到工作区。', '创作', appWindow(1100, 780, 560, 460))
      app.entry = '/a/draw/board.html'
      return app
    })(),
    (() => {
      const app = internalApp('office', '便捷办公', 'office', '#/office', 'Word、Excel、PPT、Markdown、HTML 与 PDF：文件统一存进「文稿」。', '办公', appWindow(1200, 820, 760, 520))
      app.entry = '/a/office/'
      return app
    })(),
    (() => {
      const app = internalApp('sticky', '便利贴', 'sticky', '#/sticky', '桌面便利贴：Markdown / HTML 直接贴在桌面上，双击折叠，纯文本保存。', '工具', appWindow(260, 240, 190, 120))
      app.singleton = false
      return app
    })(),
    internalApp('artcraftport', 'ArtCraft 移植版', 'artcraftport', '#/artcraftport', 'ArtCraft 移植版：图像、矢量、时间线、文档与净室工作台。', '创作', appWindow(1280, 820, 900, 600)),
    internalApp('graph', '关系图谱', 'graph', '#/graph', '把 nexl交换区 里的 Markdown 连成关系网：双链、标签与反向链接。', '创作', appWindow(1180, 820, 900, 600)),
    internalApp('video', '视频', 'video', '#/video', '本地或网络视频：拖入即播，支持画中画与全屏。', '媒体', appWindow(960, 640, 620, 420)),
    internalApp('browser', 'Agent 浏览器', 'browser', '#/browser', 'Agent 浏览器：结构优先（盲人浏览器方式）读取网页语义、正文、链接、代码与表格；说“人类阅读”时同时在独立 Chrome 打开人类视图。', '工具', appWindow(1280, 860, 900, 600)),
    internalApp('scan', '扫一扫', 'scan', '#/scan', '摄像头扫码：二维码、网址与 NexlOS 应用链接。', '工具', appWindow(520, 780, 380, 560)),
    internalApp('minesweeper', '扫雷', 'minesweeper', '#/minesweeper', '经典扫雷：首步安全、标旗、和弦与三档难度。', '游戏', appWindow(300, 340, 240, 280)),
    internalApp('settings', '设置', 'settings', '#/settings', '主题、壁纸、颜色、应用与更新。', '系统', appWindow(1020, 700, 760, 500)),
    internalApp('store', '应用生成', 'apps', '#/store', '用一句话让 DSH 生成 NexlOS 内嵌应用，或从 GitHub 导入并构建开源项目。', '系统', appWindow(1120, 800, 760, 520)),
  ]
  apps.push({
    ...internalApp('music', '音乐', 'music', '#/music', '曲库、环境音与后台播放：手机锁屏也能继续。', '媒体', appWindow(405, 504, 405, 448)),
    entry: '/a/music.html',
  })
  const system = internalApp('system', '系统', 'system', '#/system', '内核版本、命令目录与运行状态。', '系统', appWindow(900, 650, 640, 460))
  system.dock = false
  system.desktop = false
  apps.push(system)
  return apps
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

function sendText(res, status, text, contentType) {
  res.writeHead(status, {
    'content-type': contentType || 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(text)
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

function notFound(res) {
  if (res.writableEnded) return
  sendText(res, 404, 'not found')
}

async function readJsonBody(req, limit = 8 * 1024 * 1024) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > limit) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  const parsed = JSON.parse(text)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

function sameOrigin(req) {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.origin
  const host = req.headers.host
  if (typeof origin === 'string' && typeof host === 'string') {
    try {
      if (new URL(origin).host !== host) return false
    } catch (_error) {
      return false
    }
  }
  return true
}

/* ------------------------------------------------------------------ */
/* Portable Office import helpers (OOXML)                              */
/* ------------------------------------------------------------------ */

function zipEntries(buffer) {
  const entries = new Map()
  let eocd = -1
  for (let offset = Math.max(0, buffer.length - 22); offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP/OOXML 文件')
  const count = buffer.readUInt16LE(eocd + 10)
  let pointer = buffer.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) throw new Error('ZIP 中央目录损坏')
    const method = buffer.readUInt16LE(pointer + 10)
    const compressed = buffer.readUInt32LE(pointer + 20)
    const nameLength = buffer.readUInt16LE(pointer + 28)
    const extraLength = buffer.readUInt16LE(pointer + 30)
    const commentLength = buffer.readUInt16LE(pointer + 32)
    const localOffset = buffer.readUInt32LE(pointer + 42)
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength)
    pointer += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) continue
    const localName = buffer.readUInt16LE(localOffset + 26)
    const localExtra = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localName + localExtra
    const data = buffer.subarray(dataStart, dataStart + compressed)
    try {
      entries.set(name, method === 8 ? inflateRawSync(data) : data)
    } catch (_error) { /* skip unreadable member */ }
  }
  return entries
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/gu, '&')
}

function xmlTitle(entries, fallback) {
  try {
    const core = entries.get('docProps/core.xml')
    if (core) {
      const matched = /<dc:title>([\s\S]*?)<\/dc:title>/u.exec(core.toString('utf8'))
      if (matched && decodeXml(matched[1]).trim() !== '') return decodeXml(matched[1]).trim().slice(0, 160)
    }
  } catch (_error) { /* fallback */ }
  return fallback
}

function importDocxEntries(entries, fallbackTitle) {
  const raw = entries.get('word/document.xml')
  if (!raw) throw new Error('DOCX 缺少 word/document.xml')
  const xml = raw.toString('utf8')
  const blocks = []
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/gu) || []
  let index = 0
  for (const paragraph of paragraphs) {
    const style = /<w:pStyle[^>]*w:val="([^"]+)"/u.exec(paragraph)
    const styleName = style ? style[1].toLowerCase() : ''
    let type = 'p'
    if (/title/u.test(styleName)) type = 'h1'
    else if (/heading1/u.test(styleName)) type = 'h1'
    else if (/heading2/u.test(styleName)) type = 'h2'
    else if (/heading3/u.test(styleName)) type = 'h3'
    const runs = []
    const texts = paragraph.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/gu) || []
    for (const node of texts) {
      const value = decodeXml(node.replace(/^<w:t\b[^>]*>/u, '').replace(/<\/w:t>$/u, ''))
      if (value !== '') runs.push({ t: value })
    }
    if (runs.length === 0) continue
    index += 1
    blocks.push({ id: 'b' + index, type, runs })
  }
  if (blocks.length === 0) blocks.push({ id: 'b1', type: 'p', runs: [{ t: '（空白 DOCX）' }] })
  return { kind: 'doc', title: xmlTitle(entries, fallbackTitle), doc: { blocks } }
}

function importXlsxEntries(entries, fallbackTitle) {
  const sharedRaw = entries.get('xl/sharedStrings.xml')
  const shared = []
  if (sharedRaw) {
    const xml = sharedRaw.toString('utf8')
    for (const item of xml.match(/<si\b[\s\S]*?<\/si>/gu) || []) {
      const texts = item.match(/<t\b[^>]*>[\s\S]*?<\/t>/gu) || []
      shared.push(texts.map(node => decodeXml(node.replace(/^<t\b[^>]*>/u, '').replace(/<\/t>$/u, ''))).join(''))
    }
  }
  const sheetPath = [...entries.keys()].find(name => /^xl\/worksheets\/sheet\d+\.xml$/u.test(name))
  if (!sheetPath) throw new Error('XLSX 缺少工作表')
  const sheetXml = entries.get(sheetPath).toString('utf8')
  const cells = {}
  for (const cell of sheetXml.match(/<c\b[^>]*>[\s\S]*?<\/c>/gu) || []) {
    const refMatch = /<c\b[^>]*\br="([A-Z]+\d+)"/u.exec(cell)
    if (!refMatch) continue
    const ref = refMatch[1]
    const valueMatch = /<v>([\s\S]*?)<\/v>/u.exec(cell)
    let value = valueMatch ? decodeXml(valueMatch[1]) : ''
    if (/t="s"/u.test(cell)) value = shared[Number(value)] || ''
    else if (/t="inlineStr"/u.test(cell)) {
      const inline = cell.match(/<t\b[^>]*>[\s\S]*?<\/t>/u)
      value = inline ? decodeXml(inline[0].replace(/^<t\b[^>]*>/u, '').replace(/<\/t>$/u, '')) : ''
    }
    if (value !== '') cells[ref] = { v: value }
  }
  return {
    kind: 'sheet', title: xmlTitle(entries, fallbackTitle),
    sheet: { sheets: [{ id: 's1', name: 'Sheet1', rows: 200, cols: 26, cells }] },
  }
}

function importPptxEntries(entries, fallbackTitle) {
  const slideNames = [...entries.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).sort((a, b) => {
    return Number(a.match(/(\d+)\.xml$/u)[1]) - Number(b.match(/(\d+)\.xml$/u)[1])
  })
  if (slideNames.length === 0) throw new Error('PPTX 缺少幻灯片')
  const slides = slideNames.map((name, index) => {
    const xml = entries.get(name).toString('utf8')
    const texts = (xml.match(/<a:t\b[^>]*>[\s\S]*?<\/a:t>/gu) || []).map(node => decodeXml(node.replace(/^<a:t\b[^>]*>/u, '').replace(/<\/a:t>$/u, ''))).filter(Boolean)
    return {
      id: 'p' + (index + 1), bg: '#ffffff',
      elements: [{ id: 'e1', type: 'text', text: texts.join('\n') || ' ', x: 80, y: 70, w: 1120, h: 560, size: 28, bold: false, color: '#1c1917', align: 'left' }],
    }
  })
  return { kind: 'slide', title: xmlTitle(entries, fallbackTitle), deck: { w: 1280, h: 720, slides } }
}

function multipartFile(buffer, contentType) {
  const matched = /boundary=(?:"([^"]+)"|([^;]+))/iu.exec(String(contentType || ''))
  const boundary = matched ? (matched[1] || matched[2]).trim() : ''
  if (boundary === '') throw new Error('缺少 multipart boundary')
  const delimiter = Buffer.from('--' + boundary)
  let cursor = 0
  while (cursor < buffer.length) {
    const start = buffer.indexOf(delimiter, cursor)
    if (start < 0) break
    let from = start + delimiter.length
    if (buffer[from] === 13 && buffer[from + 1] === 10) from += 2
    if (buffer[from] === 45 && buffer[from + 1] === 45) break
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), from)
    if (headerEnd < 0) break
    const next = buffer.indexOf(delimiter, headerEnd + 4)
    if (next < 0) break
    const headers = buffer.subarray(from, headerEnd).toString('utf8')
    const name = /filename="([^"]*)"/iu.exec(headers)
    if (name) {
      let dataEnd = next
      if (buffer[dataEnd - 2] === 13 && buffer[dataEnd - 1] === 10) dataEnd -= 2
      return { filename: name[1], data: buffer.subarray(headerEnd + 4, dataEnd) }
    }
    cursor = next
  }
  throw new Error('multipart 里没有文件')
}

/* ------------------------------------------------------------------ */
/* Plugin-edition delivery transforms                                  */
/* ------------------------------------------------------------------ */

// Bump when any delivery transform changes so cached app/catalog bodies invalidate.
const TRANSFORM_VERSION = 'nx-plugin-2026-11-11-4'

const OVERLAY_LANGUAGES = {
  ar: '/extras/langs/lang-ar.js',
  cs: '/extras/langs/lang-cs.js',
  it: '/extras/langs/lang-it.js',
  'pt-BR': '/extras/langs/lang-pt-BR.js',
  ru: '/extras/langs/lang-ru.js',
  tr: '/extras/langs/lang-tr.js',
  vi: '/extras/langs/lang-vi.js',
}

/**
 * The stock WebOS imports all seven overlay locale packs eagerly. In the
 * plugin edition they are loaded only when the active language needs one,
 * after first paint, so a Chinese/English desktop does not parse ~1.4 MB of
 * Russian/Arabic/Vietnamese tables in every app iframe.
 */
function transformPluginCatalog(text) {
  let next = text.replace(/^import \{ rows as lang[A-Za-z]+, templates as lang[A-Za-z]+ \} from '\.\/lang-[^']+\.js';\n/gmu, '')
  const start = next.indexOf('const OVERLAY_SOURCES = [')
  const end = next.indexOf('\nfunction templateSlots(', start)
  if (start < 0 || end < 0) return text
  const loader = `const OVERLAY_FILES = ${JSON.stringify(OVERLAY_LANGUAGES)}\n` +
    'export async function loadOverlay(code) {\n' +
    '  if (OVERLAY_TRANSLATIONS[code]) return\n' +
    '  const file = OVERLAY_FILES[code]\n' +
    '  if (!file) return\n' +
    '  const module = await import(file)\n' +
    '  const table = Object.create(null)\n' +
    '  for (const row of module.rows) {\n' +
    "    if (row.length !== 2 || typeof row[0] !== 'string' || !row[0].trim() || typeof row[1] !== 'string' || !row[1].trim()) {\n" +
    "      throw new Error('Invalid overlay row: ' + code + ' ' + row[0])\n" +
    '    }\n' +
    '    table[row[0]] = row[1]\n' +
    "    if (row[0] !== row[0].trim()) table[row[0].trim()] = row[1].trim()\n" +
    '  }\n' +
    '  OVERLAY_TRANSLATIONS[code] = table\n' +
    '  OVERLAY_TEMPLATES[code] = module.templates\n' +
    '}\n'
  next = next.slice(0, start) + loader + next.slice(end)
  return next
}

/**
 * app.js imports every system app eagerly, so a Settings window also parses
 * the terminal, media, graph and store modules. In the plugin edition a route
 * imports only the app it mounts; the desktop imports os.js on demand and the
 * terminal pulls the xterm vendor scripts when it is first opened.
 */
function transformPluginApp(text) {
  let next = text.replace(/^import \{ mount[A-Za-z]+(?:, mount[A-Za-z]+)? \} from '\.\/[^']+\.js';\n/gmu, '')
  if (next === text) return text
  const loader = `
var SYSTEM_APP_MODULES = {
  pc: ['./pc.js', 'mountPC'],
  settings: ['./settings.js', 'mountSettings'],
  term: ['./term.js', 'mountTerm'],
  memory: ['./memory.js', 'mountMemory'],
  video: ['./media.js', 'mountVideo'],
  music: ['./media.js', 'mountMusic'],
  scan: ['./scan.js', 'mountScan'],
  draw: ['./draw.js', 'mountDraw'],
  office: ['./office.js', 'mountOffice'],
  artcraftport: ['./artcraftport.js', 'mountArtCraftPort'],
  minesweeper: ['./minesweeper.js', 'mountMinesweeper'],
  browser: ['/nexlos/browser.js', 'mountNexlBrowser'],
  graph: ['./graph.js', 'mountGraph'],
  store: ['/nexlos/appgen.js', 'mountAppGen'],
}
var xtermLoading = null
function loadScriptOnce(src) {
  return new Promise(function (resolve, reject) {
    var script = document.createElement('script')
    script.src = src
    script.async = false
    script.onload = resolve
    script.onerror = function () { reject(new Error('failed to load ' + src)) }
    document.head.append(script)
  })
}
function loadXterm() {
  if (window.Terminal && window.FitAddon) return Promise.resolve()
  if (xtermLoading !== null) return xtermLoading
  xtermLoading = loadScriptOnce('/a/vendor/xterm.js')
    .then(function () { return loadScriptOnce('/a/vendor/xterm-addon-fit.js') })
    .then(function () { return loadScriptOnce('/a/vendor/xterm-addon-webgl.js').catch(function () { /* WebGL addon is optional */ }) })
    .then(function () { xtermLoading = null })
  return xtermLoading
}
async function mountSystemApp(id, wrap) {
  var entry = SYSTEM_APP_MODULES[id]
  if (!entry) throw new Error('unknown system app: ' + id)
  if (id === 'term') await loadXterm()
  var module = await import(entry[0])
  return module[entry[1]](wrap)
}
`
  next = next.replace('\ninitAppearance((prefs) => {', loader + '\ninitAppearance((prefs) => {')
  next = next.replace('function renderDesktop() {', 'async function renderDesktop() {')
  next = next.replace('  currentOS = mountOS(app);', "  currentOS = (await import('./os.js')).mountOS(app);")
  next = next.replace('      renderDesktop();\n      return;', '      await renderDesktop();\n      return;')
  // 等值是后续可能加上的 await；只按固定文本找会漏掉，留下已删 import 的 mounts 表。
  const mountsStart = next.indexOf('      const mounts = {')
  if (mountsStart >= 0) {
    const assignment = /^ {6}currentApp = (?:await )?mounts\[parts\[0\]\]\(wrap\);$/mu.exec(next.slice(mountsStart))
    if (assignment === null) {
      throw new Error('plugin transform: system-app mounts block does not match')
    }
    const after = mountsStart + assignment.index + assignment[0].length
    next = next.slice(0, mountsStart) + '      currentApp = await mountSystemApp(parts[0], wrap);' + next.slice(after)
  }
  return next
}

/** Remove the eager xterm bundle; the terminal route loads it on demand. */
function transformPluginHtml(html, language) {
  let next = html
    // DSH 的连接鉴权不覆盖 PWA manifest 的取数请求：保留引用会让每次载入都刷一条 401。
    // 插件宿主里 PWA 身份由 DSH 决定，桌面文档不需要这份 manifest。
    .replace(/<link rel="manifest" href="\/a\/manifest\.webmanifest">\s*/gu, '')
    .replace(/<script src="\/a\/vendor\/xterm\.js"><\/script>\s*/gu, '')
    .replace(/<script src="\/a\/vendor\/xterm-addon-fit\.js"><\/script>\s*/gu, '')
    .replace(/<script src="\/a\/vendor\/xterm-addon-webgl\.js"><\/script>\s*/gu, '')
  if (next.indexOf('/a/app.js') >= 0 && next.indexOf('rel="modulepreload" href="/a/app.js"') < 0) {
    next = next.replace('</head>', '<link rel="modulepreload" href="/a/app.js"></head>')
  }
  const overlay = OVERLAY_LANGUAGES[language] === undefined ? '' : language
  if (overlay !== '' && next.indexOf('data-nexlos-overlay') < 0) {
    next = next.replace('</body>', `<script type="module" data-nexlos-overlay>
import { loadOverlay } from '/a/locales/catalog.js';
import { localizeDoc, localizeFrames } from '/a/i18n.js';
var run = function () { loadOverlay(${JSON.stringify(overlay)}).then(function () { localizeDoc(document, true); localizeFrames(document, true); }).catch(function () {}); };
if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2500 }); else setTimeout(run, 1200);
</script></body>`)
  }
  return next
}

function chineseCatalog() {
  return `export const CATALOG_ROWS = [];
export const EXTRA_TRANSLATIONS = { en: {} };
export const MESSAGE_TEMPLATES = [];
export const OVERLAY_TRANSLATIONS = Object.create(null);
export const OVERLAY_TEMPLATES = Object.create(null);
export async function loadOverlay() {}
`
}

let pluginHomeResolver = null
let uiLanguageCache = { at: 0, value: 'zh-CN' }
function currentUiLanguage() {
  if (pluginHomeResolver === null) return 'zh-CN'
  if (Date.now() - uiLanguageCache.at < 3000) return uiLanguageCache.value
  try {
    const raw = JSON.parse(readFileSync(path.join(pluginHomeResolver(), 'settings.json'), 'utf8'))
    if (raw && typeof raw.language === 'string' && raw.language !== '') uiLanguageCache = { at: Date.now(), value: raw.language }
  } catch (_error) {
    /* keep the last value */
  }
  return uiLanguageCache.value
}

/**
 * The native WebOS treats 760px as the phone breakpoint. A DSH panel with the
 * sidebar expanded is 758px, i.e. just below it, so every app would fall into
 * its phone layout even on a desktop. The plugin delivery shifts only that
 * breakpoint to 700px; real phone widths still get the mobile layout.
 */
function transformViewportCss(text) {
  return text
    .replace(/max-width\s*:\s*760px/gu, 'max-width: 700px')
    .replace(/max-width\s*:\s*760\.0px/gu, 'max-width: 700px')
}

function transformViewportJs(text) {
  return text
    .replace(/window\.innerWidth\s*<=\s*760\b/gu, 'window.innerWidth <= 700')
    .replace(/const MOBILE_BREAKPOINT = 760;/gu, 'const MOBILE_BREAKPOINT = 700;')
}

/**
 * Serve one file from a root with containment, MIME, Range and small caches.
 * @param {import('node:http').IncomingMessage} req - incoming request (Range honored)
 * @param {import('node:http').ServerResponse} res - owned response
 * @param {string} root - absolute directory the URL may not escape
 * @param {string} relative - URL sub-path below root
 */
async function serveFile(req, res, root, relative, options) {
  let decoded
  try {
    decoded = decodeURIComponent(String(relative || '').split('?')[0])
  } catch (_error) {
    return sendText(res, 400, 'bad path')
  }
  const target = path.resolve(root, '.' + path.sep + decoded.replace(/^\/+/u, ''))
  if (target !== root && !inside(root, target)) return notFound(res)
  let info
  try {
    info = await fsp.stat(target)
  } catch (_error) {
    return notFound(res)
  }
  if (info.isDirectory()) {
    const index = path.join(target, 'index.html')
    if (!existsSync(index)) return notFound(res)
    return serveFile(req, res, root, path.relative(root, index))
  }
  if (!info.isFile()) return notFound(res)
  const ext = path.extname(target).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'
  const rel = decoded.replace(/^\/+/, '')
  const transforms = !(options && options.pluginTransforms === false)
  const pluginTransformed = transforms && (rel === 'app.js' || rel === 'locales/catalog.js')
  const viewportTransformed = transforms && (ext === '.css' || ext === '.js' || ext === '.mjs')
  const transformKey = rel === 'app.js'
    ? TRANSFORM_VERSION
    : rel === 'locales/catalog.js' ? TRANSFORM_VERSION + '-' + currentUiLanguage() : ''
  const etag = '"' + info.size.toString(16) + '-' + info.mtimeMs.toString(16)
    + (pluginTransformed ? '-' + transformKey : '')
    + (viewportTransformed ? '-' + TRANSFORM_VERSION + '-vp' : '') + '"'
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': 'no-cache' })
    return res.end()
  }
  const range = req.headers.range
  let start = 0
  let end = info.size - 1
  let status = 200
  if (typeof range === 'string') {
    const matched = /^bytes=(\d*)-(\d*)$/u.exec(range.trim())
    if (matched) {
      if (matched[1] !== '') start = Number(matched[1])
      if (matched[2] !== '') end = Number(matched[2])
      if (matched[1] === '' && matched[2] !== '') {
        start = Math.max(0, info.size - Number(matched[2]))
        end = info.size - 1
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= info.size || start > end) {
        res.writeHead(416, { 'content-range': 'bytes */' + info.size })
        return res.end()
      }
      status = 206
    }
  }
  const headers = {
    'content-type': type,
    'cache-control': ext === '.html' ? 'no-store' : 'no-cache',
    etag,
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    ...((options && options.headers) || {}),
  }
  if (status === 206) {
    headers['content-range'] = 'bytes ' + start + '-' + end + '/' + info.size
    headers['content-length'] = String(end - start + 1)
    res.writeHead(206, headers)
    if (req.method === 'HEAD') return res.end()
    const buffer = await fsp.readFile(target)
    res.end(buffer.subarray(start, end + 1))
    return undefined
  }
  if (req.method === 'HEAD') {
    headers['content-length'] = String(info.size)
    res.writeHead(200, headers)
    return res.end()
  }
  let body = await fsp.readFile(target)
  if (ext === '.css') {
    body = Buffer.from(transformViewportCss(body.toString('utf8')), 'utf8')
  }
  if (ext === '.js' || ext === '.mjs') {
    // The WebOS opens its internal app pages at the origin root (`/?embed=1#/route`).
    // Inside DSH the origin root belongs to the Harness, so point those pages at
    // the WebOS mount while leaving every other absolute `/a/`, `/c/`, `/agent/`
    // URL untouched.
    let text = body.toString('utf8')
    text = text.split('/?embed=1').join('/nexlos/?embed=1')
    text = text.split("location.origin + '/?").join("location.origin + '/nexlos/?")
    if (transforms && rel === 'app.js') text = transformPluginApp(text)
    else if (transforms && rel === 'locales/catalog.js') text = currentUiLanguage() === 'zh-CN' ? chineseCatalog() : transformPluginCatalog(text)
    if (transforms) {
      if (ext === '.css') text = transformViewportCss(text)
      else if (ext === '.js' || ext === '.mjs') text = transformViewportJs(text)
    }
    body = Buffer.from(text, 'utf8')
  }
  headers['content-length'] = String(body.byteLength)
  res.writeHead(200, headers)
  res.end(body)
  return undefined
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

/**
 * Mount the NexlOS kernel: static WebOS, command envelope and agent bridge.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host plugin context
 * @param {{ home?: string, ui?: string }} config - optional data and WebOS roots
 */
export function apply(ctx, config = {}) {
  const web = ctx.get('webServer')
  if (web === undefined) return

  let homeCache
  let homeLayoutReady = false
  const home = () => {
    if (homeCache !== undefined) return homeCache
    if (typeof config.home === 'string' && config.home.trim() !== '') {
      homeCache = path.resolve(config.home.trim())
    } else {
      const envHome = typeof process.env.NEXLOS_HOME === 'string' ? process.env.NEXLOS_HOME.trim() : ''
      const appSupport = process.env.HOME
        ? path.join(process.env.HOME, 'Library', 'Application Support')
        : ''
      const nativeHomes = [
        appSupport ? path.join(appSupport, 'NexlOS') : '',
      ].filter(Boolean)
      const native = envHome || nativeHomes.find(dir => existsSync(path.join(dir, 'settings.json')))
      if (native !== undefined) {
        homeCache = path.resolve(native)
      } else {
        const working = ctx.get('workingDirectory')
        const base = working && typeof working.defaultDirectory === 'string'
          ? path.resolve(working.defaultDirectory)
          : process.cwd()
        const nested = path.join(base, 'spaces')
        if (existsSync(path.join(nested, 'settings.json'))) homeCache = nested
        else if (existsSync(path.join(base, 'settings.json'))) homeCache = base
        else homeCache = nested
      }
    }
    try {
      mkdirSync(homeCache, { recursive: true })
    } catch (_error) {
      /* a read-only home still serves the static OS */
    }
    // 资源管理器左侧的常驻位置必须真的存在，否则新装的机器点进去就是 ENOENT。
    // 目录集合与通用版内核保持一致；已存在时 mkdir 是空操作。
    if (!homeLayoutReady) {
      for (const dir of ['apps', 'logs', 'vaults', '文稿', 'nexl交换区', 'inbox', 'outbox', '.trash']) {
        try { mkdirSync(path.join(homeCache, dir), { recursive: true }) } catch (_error) { /* 只读 home */ }
      }
      homeLayoutReady = true
    }
    return homeCache
  }
  pluginHomeResolver = home


  // Installed generated apps run on a dedicated loopback origin. They get real
  // localStorage/IndexedDB/Worker capability, while the OS remains cross-origin
  // and cannot be reached via window.parent. All durable app data still goes
  // through the Host capability broker so uninstall can delete it.
  let appOriginServer = null
  let appOriginPort = 0
  let appOriginToken = ''

  async function ensureAppOrigin() {
    if (appOriginServer !== null) return 'http://127.0.0.1:' + appOriginPort
    appOriginToken = randomUUID().replace(/-/gu, '').slice(0, 24)
    appOriginServer = http.createServer((req, res) => {
      void (async () => {
        try {
          const url = new URL(req.url || '/', 'http://127.0.0.1')
          const prefix = '/' + appOriginToken + '/app/'
          if (!url.pathname.startsWith(prefix)) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
            return res.end('not found')
          }
          const rest = url.pathname.slice(prefix.length)
          const slash = rest.indexOf('/')
          const id = slash < 0 ? rest : rest.slice(0, slash)
          if (!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(id)) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
            return res.end('not found')
          }
          const root = path.join(home(), 'apps', id)
          let relative = slash < 0 ? '' : decodeURIComponent(rest.slice(slash + 1))
          if (relative === 'bridge.js') {
            const bridge = await fsp.readFile(path.join(HERE, 'src', 'app-storage-client.js'))
            res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
            return res.end(bridge)
          }
          if (relative === '' || relative.endsWith('/')) relative += 'index.html'
          const target = path.resolve(root, '.' + path.sep + relative.replace(/^\/+/u, ''))
          if (!inside(root, target)) {
            res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
            return res.end('forbidden')
          }
          const info = await fsp.stat(target)
          if (info.isDirectory()) {
            relative = relative.replace(/\/?$/u, '/index.html')
            return res.writeHead(302, { location: url.pathname.replace(/\/*$/u, '/') + 'index.html' }).end()
          }
          if (req.method === 'HEAD') {
            res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
            return res.end()
          }
          if (path.extname(target).toLowerCase() === '.html') {
            let html = await fsp.readFile(target, 'utf8')
            if (html.indexOf('app-storage-client.js') < 0) {
              const tag = '<script src="bridge.js"></script>'
              if (/<\/head>/iu.test(html)) html = html.replace(/<\/head>/iu, tag + '</head>')
              else html = tag + html
            }
            res.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
              'content-security-policy': "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-ancestors *",
            })
            return res.end(html)
          }
          const body = await fsp.readFile(target)
          res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
          return res.end(body)
        } catch (_error) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('not found')
        }
      })()
    })
    await new Promise((resolve, reject) => {
      appOriginServer.once('error', reject)
      appOriginServer.listen(0, '127.0.0.1', () => {
        appOriginPort = appOriginServer.address().port
        resolve()
      })
    })
    return 'http://127.0.0.1:' + appOriginPort
  }

  async function generatedAppEntry(id, entry) {
    const origin = await ensureAppOrigin()
    const rel = String(entry || 'index.html').replace(/^\/+/u, '')
    return origin + '/' + appOriginToken + '/app/' + id + '/' + rel
  }

  const browserBridge = createBrowserBridge({ home, logger: ctx.logger, getConfig: () => loadSettings(home()) })

  // Host-extension signaling mailbox. The decisive performance fix is to stop
  // re-rendering pages in a headless process: a Chrome MV3 extension running
  // inside the user's own browser captures the tab via tabCapture/WebRTC and
  // NexlOS receives a native MediaStream. These endpoints only relay
  // SDP/ICE/commands between the extension and the NexlOS page.
  const browserHostTokens = new Set()
  const browserHostMail = new Map()

  function bhostBox(token) {
    if (!browserHostMail.has(token)) browserHostMail.set(token, { ui: [], ext: [] })
    return browserHostMail.get(token)
  }

  function bhostJson(res, status, value) {
    const headers = {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    }
    res.writeHead(status, headers)
    res.end(JSON.stringify(value))
  }

  async function handleBrowserHost(req, res, url) {
    if (req.method === 'OPTIONS') return bhostJson(res, 204, {})
    const kind = url.pathname.split('/').pop()
    const token = String(url.searchParams.get('token') || '')
    if (!/^[a-z0-9-]{12,64}$/u.test(token)) return bhostJson(res, 400, { ok: false, error: 'bad token' })
    if (kind === 'poll') {
      const side = url.searchParams.get('side')
      if (side !== 'ui' && side !== 'ext') return bhostJson(res, 400, { ok: false, error: 'bad side' })
      if (!browserHostTokens.has(token)) return bhostJson(res, 404, { ok: false, error: '未配对：先在 NexlOS 浏览器里点“宿主扩展”生成配对码' })
      const box = bhostBox(token)
      const queue = side === 'ui' ? box.ui : box.ext
      return bhostJson(res, 200, { ok: true, items: queue.splice(0, queue.length) })
    }
    if (kind === 'register') {
      if (req.method !== 'POST') return bhostJson(res, 405, { ok: false })
      browserHostTokens.add(token)
      bhostBox(token)
      return bhostJson(res, 200, { ok: true, registered: true })
    }
    if (req.method !== 'POST') return bhostJson(res, 405, { ok: false })
    let body
    try { body = await readJsonBody(req, 1024 * 1024) } catch (error) { return bhostJson(res, 400, { ok: false, error: error.message }) }
    if (kind === 'ui') {
      if (!browserHostTokens.has(token)) { browserHostTokens.add(token); bhostBox(token) }
      const item = { kind: body.kind, payload: body.payload }
      bhostBox(token).ext.push(item)
      return bhostJson(res, 200, { ok: true, queued: true })
    }
    if (kind === 'ext') {
      if (!browserHostTokens.has(token)) return bhostJson(res, 404, { ok: false, error: 'token 未注册' })
      bhostBox(token).ui.push({ kind: body.kind, payload: body.payload })
      return bhostJson(res, 200, { ok: true, queued: true })
    }
    return bhostJson(res, 404, { ok: false, error: 'unknown' })
  }

  let uiRootsCache
  /**
   * Resolve an explicit development override, then the bundled WebOS. Never
   * discover a neighboring checkout implicitly: an installed package must be
   * self-contained and reproducible.
   */
  const uiRoots = () => {
    if (uiRootsCache !== undefined) return uiRootsCache
    const candidates = [
      typeof config.ui === 'string' && config.ui.trim() !== '' ? path.resolve(config.ui.trim()) : '',
      typeof process.env.NEXLOS_UI === 'string' && process.env.NEXLOS_UI.trim() !== '' ? path.resolve(process.env.NEXLOS_UI) : '',
      WEBOS_ROOT,
    ].filter(Boolean)
    for (const dir of candidates) {
      if (existsSync(path.join(dir, 'index.html')) && (existsSync(path.join(dir, 'app.js')) || existsSync(path.join(dir, 'a', 'app.js')))) {
        // The bundled src/webos/ layout is index.html + a/app.js: /a/* maps into
        // src/webos/a. The live ui/ layout is flat and maps into ui/.
        const assets = existsSync(path.join(dir, 'app.js')) ? dir : path.join(dir, 'a')
        uiRootsCache = { index: path.join(dir, 'index.html'), assets }
        return uiRootsCache
      }
    }
    uiRootsCache = { index: INDEX_FILE, assets: ASSET_ROOT }
    return uiRootsCache
  }

  const agentSessions = new Map()
  const OFFICE_KINDS = new Set(['doc', 'sheet', 'slide', 'markdown', 'html', 'pdf'])
  const OFFICE_ID_RE = /^[a-z0-9][a-z0-9-]{5,79}$/u
  const officeRoot = () => path.join(home(), '文稿', 'Office')
  let officeRootReady

  async function ensureOfficeRoot() {
    if (officeRootReady !== undefined) return officeRootReady
    officeRootReady = officeRoot()
    await fsp.mkdir(officeRootReady, { recursive: true })
    return officeRootReady
  }

  function officeTitle(kind, title) {
    const trimmed = String(title || '').trim()
    if (trimmed !== '') return trimmed.slice(0, 160)
    return { doc: '未命名文档', sheet: '未命名表格', slide: '未命名演示', markdown: '未命名 Markdown', html: '未命名 HTML', pdf: '未命名 PDF' }[kind] || '未命名'
  }

  function officeNow() { return new Date().toISOString() }

  function officeDefault(kind, title) {
    const now = officeNow()
    const doc = { schema: 'nexl.office/1', id: '', kind, title, createdAt: now, updatedAt: now, rev: 1, savedAt: now, saveSeq: 1 }
    if (kind === 'doc') {
      doc.doc = { blocks: [
        { id: 'b1', type: 'h1', runs: [{ t: title, b: true, size: 40 }] },
        { id: 'b2', type: 'p', runs: [{ t: '从这里开始写。' }] },
      ] }
    } else if (kind === 'sheet') {
      doc.sheet = { sheets: [{ id: 's1', name: 'Sheet1', rows: 200, cols: 26, cells: {} }] }
    } else if (kind === 'slide') {
      doc.deck = { w: 1280, h: 720, slides: [{ id: 'p1', bg: '#ffffff', elements: [{ id: 'e1', type: 'text', text: title, x: 80, y: 70, w: 1120, h: 130, size: 54, bold: true, color: '#1c1917', align: 'left' }] }] }
    } else if (kind === 'markdown') {
      doc.markdown = '# ' + title + '\n\n从这里开始写。\n'
    } else if (kind === 'html') {
      doc.html = '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>' + title + '</title></head><body><h1>' + title + '</h1></body></html>\n'
    } else if (kind === 'pdf') {
      doc.pdf = {}
    }
    return doc
  }

  async function officeList() {
    const root = await ensureOfficeRoot()
    const files = []
    for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.office.json')) continue
      try {
        const raw = await fsp.readFile(path.join(root, entry.name), 'utf8')
        const doc = JSON.parse(raw)
        if (!doc || !OFFICE_ID_RE.test(String(doc.id || ''))) continue
        files.push({
          id: doc.id, title: doc.title || '', kind: doc.kind || 'doc', updatedAt: doc.updatedAt || '',
          rev: Number(doc.rev) || 0, size: Buffer.byteLength(raw),
          ...(doc.source && doc.source.format ? { sourceFormat: doc.source.format } : {}),
        })
      } catch (_error) { /* skip corrupt file */ }
    }
    files.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    return files
  }

  async function officeLoad(id) {
    if (!OFFICE_ID_RE.test(String(id || ''))) return undefined
    try {
      const raw = await fsp.readFile(path.join(await ensureOfficeRoot(), id + '.office.json'), 'utf8')
      return JSON.parse(raw)
    } catch (_error) {
      return undefined
    }
  }

  async function officeWrite(doc) {
    const root = await ensureOfficeRoot()
    await writeAtomic(path.join(root, doc.id + '.office.json'), JSON.stringify(doc, null, 2) + '\n')
    return doc
  }

  async function officeCreate(kind, title) {
    if (!OFFICE_KINDS.has(kind)) throw new Error('unknown kind: ' + kind)
    const id = new Date().toISOString().slice(0, 10).replace(/-/gu, '') + '-' + randomUUID().slice(0, 8)
    const doc = officeDefault(kind, officeTitle(kind, title))
    doc.id = id
    await officeWrite(doc)
    return doc
  }

  async function officeSave(input, expectedRev, token) {
    if (!input || !OFFICE_ID_RE.test(String(input.id || ''))) throw new Error('invalid document id')
    const current = await officeLoad(input.id)
    if (current === undefined) throw new Error('not found')
    if (token && current.saveToken === token) return { doc: current, idempotent: true }
    if (expectedRev && Number(current.rev) !== Number(expectedRev)) {
      const error = new Error('revision conflict')
      error.status = 409
      error.current = current
      throw error
    }
    const next = { ...input, id: current.id, schema: 'nexl.office/1', kind: current.kind, createdAt: current.createdAt, updatedAt: officeNow(), savedAt: officeNow(), rev: Number(current.rev) + 1, saveSeq: Number(current.saveSeq || 0) + 1, ...(token ? { saveToken: token } : {}) }
    await officeWrite(next)
    return { doc: next, idempotent: false }
  }

  function officeMarkdown(doc) {
    if (doc.kind === 'markdown') return String(doc.markdown || '')
    if (doc.kind === 'html') return String(doc.html || '').replace(/<[^>]+>/gu, '')
    if (doc.kind === 'sheet') {
      const sheet = doc.sheet && doc.sheet.sheets && doc.sheet.sheets[0]
      const cells = (sheet && sheet.cells) || {}
      return Object.keys(cells).sort().map(ref => ref + ': ' + cells[ref].v).join('\n')
    }
    if (doc.kind === 'slide') {
      const slides = (doc.deck && doc.deck.slides) || []
      return slides.map((slide, index) => '## Slide ' + (index + 1) + '\n' + (slide.elements || []).map(el => el.text || '').join('\n')).join('\n\n')
    }
    const blocks = (doc.doc && doc.doc.blocks) || []
    return blocks.map(block => {
      if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') return '#'.repeat(Number(block.type.slice(1))) + ' ' + (block.runs || []).map(run => run.t || '').join('')
      if (block.type === 'li') return '- ' + (block.runs || []).map(run => run.t || '').join('')
      if (block.type === 'quote') return '> ' + (block.runs || []).map(run => run.t || '').join('')
      return (block.runs || []).map(run => run.t || '').join('')
    }).join('\n\n')
  }

  function officeHtml(doc) {
    if (doc.kind === 'html') return String(doc.html || '')
    const title = String(doc.title || 'Office')
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + title + '</title></head><body><pre>' + officeMarkdown(doc).replace(/[&<>]/gu, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])) + '</pre></body></html>'
  }

  function officeCsv(doc) {
    const sheet = doc.sheet && doc.sheet.sheets && doc.sheet.sheets[0]
    const cells = (sheet && sheet.cells) || {}
    const rows = new Map()
    for (const [ref, cell] of Object.entries(cells)) {
      const matched = /^([A-Z]+)(\d+)$/u.exec(ref)
      if (!matched) continue
      const row = Number(matched[2])
      if (!rows.has(row)) rows.set(row, new Map())
      let col = 0
      for (const char of matched[1]) col = col * 26 + (char.charCodeAt(0) - 64)
      rows.get(row).set(col, String(cell.v == null ? '' : cell.v))
    }
    return [...rows.keys()].sort((a, b) => a - b).map(row => {
      const values = rows.get(row)
      return [...values.keys()].sort((a, b) => a - b).map(col => '"' + values.get(col).replace(/"/gu, '""') + '"').join(',')
    }).join('\n')
  }

  function officeError(res, status, message, extra) {
    sendJson(res, status, { error: message, ...(extra || {}) })
  }

  async function officeApi(req, res, url, rest) {
    if (!sameOrigin(req)) return officeError(res, 403, 'cross-origin request rejected')
    const method = req.method || 'GET'
    try {
      if (rest === '/api/health') return sendJson(res, 200, { ok: true, version: '0.5.0', workspace: await ensureOfficeRoot(), time: officeNow() })
      if (rest === '/api/capabilities') {
        return sendJson(res, 200, {
          version: '0.5.0',
          kinds: ['doc', 'sheet', 'slide', 'markdown', 'html', 'pdf'],
          import: ['docx', 'xlsx', 'pptx', 'pdf', 'md', 'html', 'csv', 'txt'],
          export: ['md', 'html', 'csv'],
          saveAs: { mode: ['copy', 'export'], native: ['doc', 'sheet', 'slide', 'markdown', 'html'], export: ['md', 'html', 'csv'] },
          autosave: { endpoint: 'POST /api/files/{id}/autosave', idempotentToken: true },
          recovery: { endpoint: 'GET /api/recovery', actions: ['restore', 'discard'] },
          print: { backend: 'none', formats: [], fallback: 'window.print()' },
          limits: { uploadBytes: 8 * 1024 * 1024, jsonBytes: 8 * 1024 * 1024 },
          aiConfigured: false,
        })
      }
      if (rest === '/api/files' && method === 'GET') return sendJson(res, 200, { files: await officeList() })
      if (rest === '/api/files' && method === 'POST') {
        const body = await readJsonBody(req, 1024 * 1024)
        const doc = await officeCreate(String(body.kind || 'doc'), body.title)
        return sendJson(res, 201, doc)
      }
      const match = /^\/api\/files\/([^/]+)(?:\/(autosave|save-as))?$/u.exec(rest)
      if (match) {
        const id = decodeURIComponent(match[1])
        const action = match[2]
        if (action === 'autosave' && method === 'POST') {
          const body = await readJsonBody(req, 16 * 1024 * 1024)
          if (!body.doc) return officeError(res, 400, 'missing doc')
          try {
            const saved = await officeSave(body.doc, Number(body.rev) || 0, String(body.token || ''))
            return sendJson(res, 200, { doc: saved.doc, rev: saved.doc.rev, savedAt: saved.doc.savedAt, saveSeq: saved.doc.saveSeq, idempotent: saved.idempotent })
          } catch (error) {
            if (error.status === 409) return officeError(res, 409, error.message, { conflict: true, rev: error.current.rev, savedAt: error.current.savedAt, updatedAt: error.current.updatedAt })
            throw error
          }
        }
        if (action === 'save-as' && method === 'POST') {
          const body = await readJsonBody(req, 1024 * 1024)
          const source = await officeLoad(id)
          if (!source) return officeError(res, 404, 'not found')
          const mode = String(body.mode || 'copy')
          if (mode === 'copy') {
            const copy = await officeCreate(source.kind, body.title || (source.title + ' 副本'))
            copy.doc = source.doc
            copy.sheet = source.sheet
            copy.deck = source.deck
            copy.markdown = source.markdown
            copy.html = source.html
            copy.pdf = source.pdf
            await officeWrite(copy)
            return sendJson(res, 200, { id: copy.id, title: copy.title, doc: copy })
          }
          return officeExport(res, source, String(body.format || 'md'))
        }
        if (method === 'GET') {
          const doc = await officeLoad(id)
          if (!doc) return officeError(res, 404, 'not found')
          return sendJson(res, 200, doc)
        }
        if (method === 'PUT') {
          const body = await readJsonBody(req, 16 * 1024 * 1024)
          if (!body.doc) return officeError(res, 400, 'missing doc')
          try {
            const saved = await officeSave({ ...body.doc, id }, Number(body.rev) || 0, '')
            return sendJson(res, 200, saved.doc)
          } catch (error) {
            if (error.status === 409) return officeError(res, 409, error.message, { conflict: true, rev: error.current.rev, savedAt: error.current.savedAt, updatedAt: error.current.updatedAt })
            throw error
          }
        }
        if (method === 'DELETE') {
          const doc = await officeLoad(id)
          if (!doc) return officeError(res, 404, 'not found')
          const rev = Number(url.searchParams.get('rev') || 0)
          if (rev && rev !== Number(doc.rev)) return officeError(res, 409, 'revision conflict')
          try { await fsp.unlink(path.join(await ensureOfficeRoot(), id + '.office.json')) } catch (_error) { /* already gone */ }
          return sendJson(res, 200, { deleted: true, id })
        }
      }
      if (rest === '/api/import' && method === 'POST') {
        const name = url.searchParams.get('name') || ''
        const ext = path.extname(name).toLowerCase()
        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > 8 * 1024 * 1024) return officeError(res, 413, 'file too large')
          chunks.push(chunk)
        }
        const data = Buffer.concat(chunks)
        if (ext === '.md' || ext === '.markdown') {
          const doc = await officeCreate('markdown', path.basename(name, ext))
          doc.markdown = data.toString('utf8')
          await officeWrite(doc)
          return sendJson(res, 201, { doc, loss: [] })
        }
        if (ext === '.html' || ext === '.htm') {
          const doc = await officeCreate('html', path.basename(name, ext))
          doc.html = data.toString('utf8')
          await officeWrite(doc)
          return sendJson(res, 201, { doc, loss: [] })
        }
        if (ext === '.csv') {
          const doc = await officeCreate('sheet', path.basename(name, ext))
          const sheet = doc.sheet.sheets[0]
          String(data.toString('utf8')).split(/\r?\n/u).forEach((line, rowIndex) => {
            if (line === '') return
            line.split(',').forEach((value, colIndex) => {
              const ref = String.fromCharCode(65 + (colIndex % 26)) + (rowIndex + 1)
              sheet.cells[ref] = { v: value.replace(/^"|"$/gu, '').replace(/""/gu, '"') }
            })
          })
          await officeWrite(doc)
          return sendJson(res, 201, { doc, loss: [] })
        }
        if (ext === '.txt') {
          const doc = await officeCreate('doc', path.basename(name, ext))
          const text = data.toString('utf8')
          doc.doc.blocks = [{ id: 'b1', type: 'h1', runs: [{ t: doc.title, b: true, size: 40 }] }, { id: 'b2', type: 'p', runs: [{ t: text }] }]
          await officeWrite(doc)
          return sendJson(res, 201, { doc, loss: [] })
        }
        if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx') {
          let entries
          try { entries = zipEntries(data) } catch (error) { return officeError(res, 400, error.message) }
          let parsed
          if (ext === '.docx') parsed = importDocxEntries(entries, path.basename(name, ext))
          else if (ext === '.xlsx') parsed = importXlsxEntries(entries, path.basename(name, ext))
          else parsed = importPptxEntries(entries, path.basename(name, ext))
          const doc = await officeCreate(parsed.kind, parsed.title || path.basename(name, ext))
          if (parsed.doc) doc.doc = parsed.doc
          if (parsed.sheet) doc.sheet = parsed.sheet
          if (parsed.deck) doc.deck = parsed.deck
          const originalDir = path.join(await ensureOfficeRoot(), 'originals')
          await fsp.mkdir(originalDir, { recursive: true })
          await fsp.writeFile(path.join(originalDir, doc.id + ext), data)
          doc.source = { format: ext.slice(1), name, stored: 'originals/' + doc.id + ext }
          await officeWrite(doc)
          return sendJson(res, 201, { doc, loss: [] })
        }
        if (ext === '.pdf') {
          const doc = await officeCreate('pdf', path.basename(name, ext))
          const originalDir = path.join(await ensureOfficeRoot(), 'originals')
          await fsp.mkdir(originalDir, { recursive: true })
          await fsp.writeFile(path.join(originalDir, doc.id + '.pdf'), data)
          doc.source = { format: 'pdf', name, stored: 'originals/' + doc.id + '.pdf' }
          doc.pdf = {}
          await officeWrite(doc)
          return sendJson(res, 201, { doc, loss: [] })
        }
        return officeError(res, 415, '暂不支持导入 .' + ext.replace(/^\./u, '') + '；支持 DOCX / XLSX / PPTX / PDF / Markdown / HTML / CSV / TXT')
      }
      if (rest.startsWith('/api/export/')) {
        const id = decodeURIComponent(rest.slice('/api/export/'.length))
        const doc = await officeLoad(id)
        if (!doc) return officeError(res, 404, 'not found')
        return officeExport(res, doc, url.searchParams.get('format') || 'md')
      }
      if (rest.startsWith('/api/raw/')) {
        const id = decodeURIComponent(rest.slice('/api/raw/'.length))
        const doc = await officeLoad(id)
        if (!doc || !doc.source || !doc.source.stored) return officeError(res, 404, 'not found')
        const stored = path.resolve(await ensureOfficeRoot(), 'originals', path.basename(String(doc.source.stored)))
        try {
          const bytes = await fsp.readFile(stored)
          const ext = path.extname(stored).toLowerCase()
          res.writeHead(200, {
            'content-type': MIME[ext] || 'application/octet-stream',
            'content-disposition': 'inline',
            'content-length': String(bytes.length),
            'cache-control': 'no-store',
          })
          return res.end(bytes)
        } catch (_error) { return officeError(res, 404, 'not found') }
      }
      if (rest === '/api/recovery' && method === 'GET') return sendJson(res, 200, { items: [] })
      if (rest === '/api/recovery' && method === 'POST') return sendJson(res, 200, { ok: true })
      if (rest === '/api/recovery/audit') return sendJson(res, 200, { events: [] })
      if (rest === '/api/printers') return sendJson(res, 200, { printers: [] })
      if (rest === '/api/print') return officeError(res, 501, '插件版不直接调用宿主打印队列；请在浏览器中打印')
      if (rest === '/api/ai/chat') return officeError(res, 501, 'Office AI 尚未接入当前 DSH 模型；请用 NexlOS 命令栏')
      return officeError(res, 404, 'unknown office route')
    } catch (error) {
      return officeError(res, 400, error && error.message ? error.message : String(error))
    }
  }

  async function officeExport(res, doc, format) {
    const kind = String(format || 'md').toLowerCase()
    let body
    let type
    let ext
    if (kind === 'md' || kind === 'markdown') { body = officeMarkdown(doc); type = 'text/markdown; charset=utf-8'; ext = 'md' }
    else if (kind === 'html') { body = officeHtml(doc); type = 'text/html; charset=utf-8'; ext = 'html' }
    else if (kind === 'csv') { body = officeCsv(doc); type = 'text/csv; charset=utf-8'; ext = 'csv' }
    else if (kind === 'txt') { body = officeMarkdown(doc); type = 'text/plain; charset=utf-8'; ext = 'txt' }
    else return officeError(res, 501, '插件版暂不支持导出 .' + kind + '；可导出 Markdown / HTML / CSV')
    const buffer = Buffer.from(body, 'utf8')
    res.writeHead(200, {
      'content-type': type,
      'content-disposition': 'attachment; filename="' + encodeURIComponent((doc.title || 'document') + '.' + ext) + '"',
      'content-length': String(buffer.length),
    })
    res.end(buffer)
  }

  function officeBlocksFromText(text, title) {
    const lines = String(text || '').replace(/\r\n/gu, '\n').replace(/\r/gu, '\n').split('\n')
    const blocks = [{ id: 'b1', type: 'h1', runs: [{ t: title, b: true, size: 40 }] }]
    let paragraph = []
    let seq = 1
    const flush = () => {
      if (paragraph.length === 0) return
      const value = paragraph.join(' ').trim()
      paragraph = []
      if (value !== '') blocks.push({ id: 'b' + (++seq), type: 'p', runs: [{ t: value }] })
    }
    for (const line of lines) {
      if (line.trim() === '') { flush(); continue }
      const heading = /^(#{1,3})\s+(.+)$/u.exec(line)
      if (heading) {
        flush()
        blocks.push({ id: 'b' + (++seq), type: 'h' + heading[1].length, runs: [{ t: heading[2].trim() }] })
        continue
      }
      const list = /^[-*]\s+(.+)$/u.exec(line)
      if (list) { flush(); blocks.push({ id: 'b' + (++seq), type: 'li', runs: [{ t: list[1].trim() }] }); continue }
      const quote = /^>\s?(.+)$/u.exec(line)
      if (quote) { flush(); blocks.push({ id: 'b' + (++seq), type: 'quote', runs: [{ t: quote[1].trim() }] }); continue }
      paragraph.push(line.trim())
    }
    flush()
    return blocks
  }

  function officeApplyText(doc, text, mode) {
    const body = String(text || '')
    if (doc.kind === 'doc') {
      let blocks = officeBlocksFromText(body, doc.title)
      if (mode === 'append') blocks = [...((doc.doc && doc.doc.blocks) || []), ...blocks.slice(1)]
      doc.doc = { ...(doc.doc || {}), blocks }
    } else if (doc.kind === 'markdown') {
      doc.markdown = mode === 'append' ? String(doc.markdown || '') + '\n\n' + body : body
    } else if (doc.kind === 'html') {
      doc.html = mode === 'append' ? String(doc.html || '') + '\n' + body : body
    } else if (doc.kind === 'sheet') {
      const sheet = doc.sheet && doc.sheet.sheets && doc.sheet.sheets[0]
      if (!sheet) throw new Error('表格缺少工作表')
      if (mode !== 'append') sheet.cells = {}
      const rows = body.split(/\r?\n/gu).filter(line => line.trim() !== '')
      rows.forEach((line, rowIndex) => {
        const cells = line.includes('\t') ? line.split('\t') : line.split(',')
        cells.forEach((value, colIndex) => {
          let col = ''
          let n = colIndex + 1
          while (n > 0) { const rem = (n - 1) % 26; col = String.fromCharCode(65 + rem) + col; n = Math.floor((n - 1) / 26) }
          sheet.cells[col + (rowIndex + 1)] = { v: value.trim() }
        })
      })
    } else if (doc.kind === 'slide') {
      const slides = body.split(/\n\s*---\s*\n/gu).filter(Boolean)
      const existing = mode === 'append' ? ((doc.deck && doc.deck.slides) || []) : []
      const next = slides.map((slideText, index) => {
        const lines = slideText.split(/\r?\n/gu).filter(line => line.trim() !== '')
        return {
          id: 'p' + (existing.length + index + 1), bg: '#ffffff',
          elements: [{ id: 'e1', type: 'text', text: lines.join('\n') || ' ', x: 80, y: 70, w: 1120, h: 560, size: 28, bold: false, color: '#1c1917', align: 'left' }],
        }
      })
      doc.deck = { w: 1280, h: 720, ...(doc.deck || {}), slides: [...existing, ...next] }
    } else {
      throw new Error('PDF 文档不能直接写入，请用文档/表格/演示')
    }
    return doc
  }

  async function officeToolAction(args) {
    const action = String(args.action || '')
    const kind = OFFICE_KINDS.has(String(args.kind)) ? String(args.kind) : 'doc'
    if (action === 'list') {
      return { files: (await officeList()).slice(0, 30), root: '/文稿/Office' }
    }
    if (action === 'create' || action === 'compose') {
      const doc = await officeCreate(kind, String(args.title || ''))
      if (args.text !== undefined && String(args.text) !== '') officeApplyText(doc, String(args.text), 'replace')
      doc.updatedAt = officeNow()
      doc.rev = Number(doc.rev || 1) + 1
      await officeWrite(doc)
      return { id: doc.id, title: doc.title, kind: doc.kind, rev: doc.rev, url: '#/office', text: officeMarkdown(doc).slice(0, 20000) }
    }
    if (action === 'write' || action === 'append') {
      const doc = await officeLoad(String(args.id || ''))
      if (!doc) throw new Error('找不到这篇文档')
      if (args.title !== undefined && String(args.title).trim() !== '') doc.title = officeTitle(doc.kind, String(args.title))
      officeApplyText(doc, String(args.text || ''), action === 'append' ? 'append' : 'replace')
      doc.updatedAt = officeNow()
      doc.rev = Number(doc.rev || 1) + 1
      await officeWrite(doc)
      return { id: doc.id, title: doc.title, kind: doc.kind, rev: doc.rev, url: '#/office', text: officeMarkdown(doc).slice(0, 20000) }
    }
    if (action === 'read') {
      const doc = await officeLoad(String(args.id || ''))
      if (!doc) throw new Error('找不到这篇文档')
      return { id: doc.id, title: doc.title, kind: doc.kind, text: officeMarkdown(doc).slice(0, 40000) }
    }
    if (action === 'export') {
      const doc = await officeLoad(String(args.id || ''))
      if (!doc) throw new Error('找不到这篇文档')
      const format = String(args.format || 'md').toLowerCase()
      let body
      let ext
      if (format === 'md' || format === 'markdown') { body = officeMarkdown(doc); ext = 'md' }
      else if (format === 'html') { body = officeHtml(doc); ext = 'html' }
      else if (format === 'csv') { body = officeCsv(doc); ext = 'csv' }
      else if (format === 'txt') { body = officeMarkdown(doc); ext = 'txt' }
      else throw new Error('目前支持导出 md / html / csv / txt')
      const outDir = path.join(home(), 'outbox')
      await fsp.mkdir(outDir, { recursive: true })
      const base = String(doc.title || 'document').replace(/[\\/:*?"<>|]/gu, '-').slice(0, 100)
      const filename = base + '.' + ext
      await writeAtomic(path.join(outDir, filename), body)
      return { id: doc.id, path: '/outbox/' + filename, bytes: Buffer.byteLength(body), format }
    }
    throw new Error('office 动作支持 create / compose / write / append / read / export / list')
  }

  async function memoryToolAction(args) {
    const action = String(args.action || '')
    if (action === 'list') {
      const rows = await memoryRows(home())
      return { root: '/memory', files: rows.slice(0, 80) }
    }
    if (action === 'read') {
      const rel = memoryVirtualPath(args.path)
      const absolute = path.join(memoryRootOf(home()), rel)
      const info = await pathStat(absolute)
      if (!info || info.isDirectory()) throw new Error('读不到这篇记忆')
      if (info.size > 256 * 1024) throw new Error('这篇记忆超过 256 KB')
      return { path: '/memory/' + rel, text: await fsp.readFile(absolute, 'utf8'), bytes: info.size }
    }
    if (action === 'write' || action === 'append') {
      const rel = memoryVirtualPath(args.path)
      const absolute = path.join(memoryRootOf(home()), rel)
      const text = String(args.text || '')
      let next = text
      if (action === 'append') {
        let old = ''
        try { old = await fsp.readFile(absolute, 'utf8') } catch (_error) { old = '' }
        next = old.trimEnd() + '\n\n' + text
      }
      if (Buffer.byteLength(next) > 1024 * 1024) throw new Error('单篇记忆不能超过 1 MB')
      await writeAtomic(absolute, next)
      return { path: '/memory/' + rel, bytes: Buffer.byteLength(next), text: next.slice(0, 20000) }
    }
    if (action === 'create') {
      const area = MEMORY_AREAS.includes(String(args.area)) ? String(args.area) : 'topics'
      const title = String(args.title || '').trim()
      if (title === '') throw new Error('标题不能为空')
      if (Array.from(title).length > 80) throw new Error('标题太长')
      const slug = slugify(title, 'untitled').toLowerCase()
      const dir = path.join(memoryRootOf(home()), area)
      await fsp.mkdir(dir, { recursive: true })
      let file = (area === 'observations' ? new Date().toISOString().slice(0, 10) + '-' : '') + slug + '.md'
      for (let index = 2; existsSync(path.join(dir, file)); index += 1) {
        file = (area === 'observations' ? new Date().toISOString().slice(0, 10) + '-' : '') + slug + '-' + index + '.md'
      }
      let body = String(args.text || '').trim()
      if (body === '') body = '# ' + title
      else if (!body.startsWith('#')) body = '# ' + title + '\n\n' + body
      await writeAtomic(path.join(dir, file), body + '\n')
      await registerMemoryIndex(home(), area, file, title)
      return { path: '/memory/' + area + '/' + file, area, title }
    }
    if (action === 'search') {
      const query = String(args.query || '').toLowerCase()
      if (query === '') return { results: [] }
      const rows = await memoryRows(home())
      const results = []
      for (const row of rows.slice(0, 200)) {
        try {
          const rel = memoryVirtualPath(row.path)
          const text = await fsp.readFile(path.join(memoryRootOf(home()), rel), 'utf8')
          const at = text.toLowerCase().indexOf(query)
          if (at >= 0) results.push({ path: row.path, name: row.name, snippet: text.slice(Math.max(0, at - 80), at + 200) })
        } catch (_error) { /* skip */ }
      }
      return { results: results.slice(0, 30) }
    }
    throw new Error('memory 动作支持 list / read / write / append / create / search')
  }

  async function drawToolAction(args) {
    const title = String(args.title || 'AI 画稿').trim().slice(0, 120)
    let svg = String(args.svg || '').trim()
    if (svg === '') {
      const safe = title.replace(/[&<>"]/gu, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><rect width="1280" height="800" fill="#f8f3e8"/><circle cx="640" cy="330" r="150" fill="none" stroke="#1d2430" stroke-width="4"/><text x="640" y="340" font-family="serif" font-size="42" text-anchor="middle" fill="#1d2430">' + safe + '</text><text x="640" y="540" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#7a8492">NexlOS · vector sketch</text></svg>'
    }
    if (!/^<svg[\s>]/iu.test(svg)) throw new Error('svg 必须以 <svg 开头')
    const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d+Z$/u, 'Z')
    const outDir = path.join(home(), 'outbox')
    await fsp.mkdir(outDir, { recursive: true })
    const filename = '画板-' + stamp + '.svg'
    await writeAtomic(path.join(outDir, filename), svg + '\n')
    const pendingDir = path.join(home(), '.nexlos')
    await fsp.mkdir(pendingDir, { recursive: true })
    await writeAtomic(path.join(pendingDir, 'draw-pending.json'), JSON.stringify({ title, svg, path: '/outbox/' + filename, createdAt: new Date().toISOString() }, null, 2) + '\n')
    return {
      path: '/outbox/' + filename, kind: 'svg', bytes: Buffer.byteLength(svg),
      open: '#/draw',
      note: '已写入画板待载入队列。打开（或已打开）NexlOS 画板会自动导入到画布历史，可继续手绘并点保存。',
    }
  }

  async function officeRequest(req, res, url) {
    const rest = url.pathname.replace(/^\/a\/office/u, '') || '/'
    if (rest.startsWith('/api/')) return officeApi(req, res, url, rest)
    const officeDir = path.join(HERE, 'src', 'webos', 'a', 'office')
    if (rest === '/editors.js') {
      // The plugin window is narrower than the native NexlOS window, but it is
      // still a desktop. Keep A4 pagination instead of the mobile continuous
      // paper. The source UI is untouched; only this delivery is transformed.
      try {
        const raw = await fsp.readFile(path.join(officeDir, 'editors.js'), 'utf8')
        const text = raw.split('window.innerWidth <= 900').join('false')
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        })
        return res.end(text)
      } catch (error) {
        return sendText(res, 500, 'office editors unavailable: ' + error.message)
      }
    }
    const relative = decodeURIComponent((rest === '/' ? 'index.html' : rest).replace(/^\/+/u, '')) || 'index.html'
    const target = path.resolve(officeDir, relative)
    if (target !== officeDir && !inside(officeDir, target)) return notFound(res)
    if (!existsSync(target) || (await fsp.stat(target)).isDirectory()) {
      return serveFile(req, res, officeDir, 'index.html', { pluginTransforms: false })
    }
    return serveFile(req, res, officeDir, relative, { pluginTransforms: false })
  }

  const APPGEN_SYSTEM = [
    'You are the NexlOS embedded-app generator. Produce exactly one complete HTML document.',
    'Rules: no markdown fences, no explanation, no external network requests, no imports from the host app.',
    'Put all CSS and JavaScript inline in the single file. Use a clean, modern, simplified-Chinese UI that fits an 800x600 iframe.',
    'The app must be immediately usable and avoid touching window.parent or privileged OS APIs. Installed apps run on a dedicated app origin and may use localStorage/Worker; prefer window.nexlOS.storage when the same HTML must also work in the sandboxed preview.',
    'Keep the complete file under 350 lines, omit comments, and ALWAYS finish with </html>. If the request is large, implement a smaller complete version instead of truncating.',
    'Return only <!doctype html>...</html>.',
  ].join('\n')

  async function generatedApps() {
    const root = path.join(home(), 'apps')
    await fsp.mkdir(root, { recursive: true })
    const apps = []
    for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const metaFile = path.join(root, entry.name, 'app.json')
      try {
        const meta = JSON.parse(await fsp.readFile(metaFile, 'utf8'))
        if (!meta || typeof meta.id !== 'string' || !/^[a-z0-9][a-z0-9-]{2,63}$/u.test(meta.id)) continue
        const base = '/a/generated/' + meta.id + '/'
        let entry = base + String(meta.entry || 'index.html').replace(/^\/+/u, '')
        try { entry = await generatedAppEntry(meta.id, meta.entry || 'index.html') } catch (_error) { /* keep sandboxed preview URL */ }
        apps.push({
          id: meta.id,
          name: String(meta.name || '生成应用').slice(0, 80),
          title: String(meta.name || '生成应用').slice(0, 80),
          kind: 'web',
          icon: 'apps',
          entry,
          route: base,
          description: String(meta.description || '').slice(0, 300),
          category: '生成',
          status: 'ready',
          dock: false,
          desktop: false,
          singleton: true,
          window: { width: 1100, height: 760, minWidth: 620, minHeight: 460 },
        })
      } catch (_error) { /* skip incomplete app */ }
    }
    apps.sort((a, b) => a.id.localeCompare(b.id))
    return apps
  }

  async function saveGeneratedApp(id, html, name, description, spec) {
    const safeId = String(id).replace(/[^a-z0-9-]/gu, '-').slice(0, 64) || ('gen-' + randomUUID().slice(0, 8))
    const dir = path.join(home(), 'apps', safeId)
    await fsp.mkdir(dir, { recursive: true })
    await writeAtomic(path.join(dir, 'index.html'), html)
    await writeAtomic(path.join(dir, 'app.json'), JSON.stringify({
      id: safeId, name: name.slice(0, 80), description: description.slice(0, 300), entry: 'index.html',
      spec: spec || undefined, capabilities: (spec && spec.capabilities) || ['storage'],
      createdAt: new Date().toISOString(),
    }, null, 2) + '\n')
    return { id: safeId, name: name.slice(0, 80), description: description.slice(0, 300), entry: '/a/generated/' + safeId + '/', spec: spec || undefined }
  }

  function extractHtml(text) {
    let body = String(text || '').trim()
    body = body.replace(/^```(?:html)?\s*/iu, '').replace(/\s*```$/u, '').trim()
    const start = body.search(/<!doctype html|<html/iu)
    const end = body.toLowerCase().lastIndexOf('</html>')
    if (start >= 0 && end > start) body = body.slice(start, end + 7)
    if (!/^<!doctype html|<html/iu.test(body)) throw new Error('模型没有返回完整 HTML')
    return body
  }

  function appTemplateForPrompt(prompt) {
    if (/番茄|pomodoro|focus\s*timer|专注计时/iu.test(String(prompt))) return 'pomodoro'
    return ''
  }

  function validateAppHtml(html) {
    const text = String(html || '')
    if (!/<!doctype html|<html/iu.test(text) || !/<\/html>\s*$/iu.test(text.trim())) throw new Error('应用 HTML 不完整')
    if (!/<title[^>]*>[\s\S]*?<\/title>/iu.test(text)) throw new Error('应用缺少 title')
    if (/window\.parent|parent\.document/iu.test(text)) throw new Error('生成应用不能访问父窗口')
    if (/(?:src|href)\s*=\s*["']https?:\/\//iu.test(text)) throw new Error('生成应用不能依赖外部资源')
  }

  function pomodoroTemplateHtml(prompt) {
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>番茄钟</title>
<style>
:root{--paper:#f8f2e8;--card:#fffaf1;--ink:#1f2430;--muted:#84796c;--tomato:#df4a35;--tomato-soft:#f8dfd7;--line:#eaded0;--green:#2f7d5b}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif}
body{display:grid;place-items:center;padding:24px}
.app{width:min(760px,100%);background:var(--card);border:1px solid var(--line);border-radius:28px;padding:26px 30px 24px;box-shadow:0 24px 70px rgba(60,42,24,.12)}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:14px}
.brand{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:800;letter-spacing:.02em}
.pip{width:13px;height:13px;border-radius:50%;background:var(--tomato)}
.sub{color:var(--muted);font-size:12px}
.modes{display:flex;justify-content:center;gap:8px;margin:21px 0 16px}
.mode{border:1px solid var(--line);background:#fffdf8;color:var(--muted);border-radius:999px;padding:7px 15px;font:inherit;font-size:12px;cursor:pointer}
.mode.active{background:var(--tomato-soft);border-color:#e7b6a7;color:var(--tomato);font-weight:700}
.stage{display:grid;grid-template-columns:1fr 210px;gap:22px;align-items:center}
.ring{position:relative;width:min(320px,100%);aspect-ratio:1;margin:0 auto}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring .bg{fill:none;stroke:#f0e5d8;stroke-width:10}
.ring .fg{fill:none;stroke:var(--tomato);stroke-width:10;stroke-linecap:round;transition:stroke-dashoffset .25s linear}
.ring .center{position:absolute;inset:0;display:grid;place-content:center;text-align:center}
.ring .time{font-size:clamp(43px,8vw,64px);font-weight:800;letter-spacing:-.05em;font-variant-numeric:tabular-nums}
.ring .state{font-size:12px;color:var(--muted);margin-top:3px}
.controls{display:flex;justify-content:center;gap:9px;margin-top:16px}
.btn{border:1px solid var(--line);border-radius:999px;background:#fffdf8;color:var(--ink);padding:10px 22px;font:inherit;font-size:13px;cursor:pointer}
.btn.primary{background:var(--tomato);border-color:var(--tomato);color:#fff;font-weight:700;min-width:110px}
.btn:hover{filter:brightness(.97)}
.stats{display:grid;gap:11px}
.stat{border:1px solid var(--line);background:#fffdf8;border-radius:15px;padding:13px 14px}
.stat b{display:block;font-size:24px;letter-spacing:-.03em;color:var(--tomato)}
.stat span{display:block;margin-top:3px;color:var(--muted);font-size:11px}
.note{text-align:center;color:var(--muted);font-size:11px;margin-top:16px;line-height:1.6}
@media(max-width:600px){.app{padding:20px 16px}.stage{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.sub{display:none}}
</style>
</head>
<body>
<main class="app">
  <header><div class="brand"><span class="pip"></span>番茄钟</div><span class="sub">专注 25 分钟 · 休息 5 分钟</span></header>
  <div class="modes" role="tablist" aria-label="阶段">
    <button class="mode active" data-mode="focus" type="button" data-testid="mode-focus">专注 25</button>
    <button class="mode" data-mode="short" type="button" data-testid="mode-short">短休 5</button>
    <button class="mode" data-mode="long" type="button" data-testid="mode-long">长休 15</button>
  </div>
  <div class="stage">
    <section class="ring">
      <svg viewBox="0 0 220 220" aria-hidden="true"><circle class="bg" cx="110" cy="110" r="96"></circle><circle id="ringFg" class="fg" cx="110" cy="110" r="96"></circle></svg>
      <div class="center"><div class="time" id="time" data-testid="time">25:00</div><div class="state" id="state">准备专注</div></div>
    </section>
    <aside class="stats">
      <div class="stat"><b id="done" data-testid="done">0</b><span>今日完成 · 个番茄</span></div>
      <div class="stat"><b id="minutes">0</b><span>累计专注 · 分钟</span></div>
    </aside>
  </div>
  <div class="controls">
    <button class="btn primary" id="toggle" type="button" data-testid="toggle">开始</button>
    <button class="btn" id="reset" type="button" data-testid="reset">重置</button>
  </div>
  <p class="note">空格键 开始 / 暂停 · R 重置 · 专注结束后自动进入休息，休息结束后需手动开始专注</p>
</main>
<script>
(function(){
  var durations = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  var labels = { focus: '准备专注', short: '短休息', long: '长休息' };
  var mode = 'focus', remaining = durations.focus, running = false, timer = 0;
  var done = 0, minutes = 0, rounds = 0;
  var timeEl = document.getElementById('time'), stateEl = document.getElementById('state');
  var toggleEl = document.getElementById('toggle'), ring = document.getElementById('ringFg');
  var doneEl = document.getElementById('done'), minutesEl = document.getElementById('minutes');
  ring.style.strokeDasharray = String(2 * Math.PI * 96);
  function render() {
    var text = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
    timeEl.textContent = text;
    stateEl.textContent = running ? (mode === 'focus' ? '专注中' : '休息中') : labels[mode];
    toggleEl.textContent = running ? '暂停' : '开始';
    doneEl.textContent = done; minutesEl.textContent = minutes;
    var ratio = remaining / durations[mode];
    ring.style.strokeDashoffset = String((2 * Math.PI * 96) * (1 - ratio));
    document.querySelectorAll('.mode').forEach(function(btn){ btn.classList.toggle('active', btn.dataset.mode === mode); });
  }
  function localDate() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function save() {
    try { if (window.nexlOS && window.nexlOS.storage) window.nexlOS.storage.set('stats', { done: done, minutes: minutes, date: localDate() }); } catch (_) {}
  }
  function load() {
    try {
      if (!window.nexlOS || !window.nexlOS.storage) return;
      window.nexlOS.storage.get('stats').then(function(value){
        if (!value) return;
        var today = localDate();
        if (value.date === today) { done = Number(value.done) || 0; minutes = Number(value.minutes) || 0; render(); }
      }).catch(function(){});
    } catch (_) {}
  }
  function stop() { if (timer) { clearInterval(timer); timer = 0; } running = false; render(); }
  function switchMode(next) { stop(); mode = next; remaining = durations[mode]; render(); }
  function complete() {
    stop();
    if (mode === 'focus') { done += 1; minutes += 25; rounds += 1; save(); switchMode(rounds % 4 === 0 ? 'long' : 'short'); }
    else { switchMode('focus'); }
  }
  function tick() {
    if (remaining <= 0) { complete(); return; }
    remaining -= 1;
    if (remaining <= 0) complete(); else render();
  }
  function toggle() {
    if (running) { stop(); return; }
    running = true;
    timer = setInterval(tick, 1000);
    render();
  }
  document.getElementById('toggle').addEventListener('click', toggle);
  document.getElementById('reset').addEventListener('click', function(){ remaining = durations[mode]; stop(); render(); });
  document.querySelectorAll('.mode').forEach(function(btn){ btn.addEventListener('click', function(){ switchMode(btn.dataset.mode); }); });
  document.addEventListener('keydown', function(event){
    if (event.code === 'Space' && event.target.tagName !== 'INPUT') { event.preventDefault(); toggle(); }
    if (event.key === 'r' || event.key === 'R') { remaining = durations[mode]; stop(); render(); }
  });
  render(); load();
})();
</script>
</body>
</html>`
  }

  // 模型偶尔漏写 <title>，验收与开始菜单都靠它认名字；落盘前统一补上。
  function ensureHtmlTitle(html, title) {
    const safe = String(title || '生成应用').replace(/[<>&]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 60) || '生成应用'
    if (/<title>[^<]*\S[^<]*<\/title>/iu.test(html)) return html
    if (/<title>\s*<\/title>/iu.test(html)) return html.replace(/<title>\s*<\/title>/iu, '<title>' + safe + '</title>')
    if (/<\/head>/iu.test(html)) return html.replace(/<\/head>/iu, '<title>' + safe + '</title></head>')
    if (/<html[^>]*>/iu.test(html)) return html.replace(/<html[^>]*>/iu, m => m + '<head><title>' + safe + '</title></head>')
    return '<title>' + safe + '</title>' + html
  }

  async function generateAppFromPrompt(prompt) {
    const spec = compileAppSpec(prompt)
    if (spec.kind !== 'generic') {
      const html = ensureHtmlTitle(renderAppTemplate(spec), spec.title)
      validateGeneratedHtml(html)
      const verification = await verifyAppHtml(html, spec)
      if (!verification.ok) {
        const failed = verification.checks.filter(check => !check.ok).map(check => check.name).join('、')
        throw new Error('模板应用未通过运行时验收：' + (verification.errors.join('；') || failed || '未知错误'))
      }
      const id = 'gen-' + new Date().toISOString().slice(0, 10).replace(/-/gu, '') + '-' + randomUUID().slice(0, 8)
      return saveGeneratedApp(id, html, spec.title, '模板生成：' + String(prompt).slice(0, 160), spec)
    }
    const llm = ctx.get('llm')
    if (llm === undefined || typeof llm.stream !== 'function') throw new Error('当前 DSH 没有可用的模型运行时')
    let selection
    try {
      const fallback = ctx.get('agentDefaultModel')
      if (fallback && typeof fallback.currentSelection === 'function') selection = fallback.currentSelection()
    } catch (_error) { selection = undefined }
    if (!selection || typeof selection.provider !== 'string' || typeof selection.model !== 'string') {
      const sc = ctx.get('sessionController')
      const catalog = sc === undefined ? undefined : await sc.modelCatalog()
      if (catalog && catalog.default) selection = catalog.default
    }
    if (!selection || typeof selection.provider !== 'string' || typeof selection.model !== 'string') throw new Error('无法确定 DSH 默认模型')
    async function streamOnce(system, userText) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(new Error('生成超时')), 180000)
      let text = ''
      try {
        const stream = llm.stream({
          provider: selection.provider,
          model: selection.model,
          system,
          messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
          maxTokens: 16000,
          signal: controller.signal,
        })
        for await (const chunk of stream) {
          if (!chunk || typeof chunk !== 'object') continue
          if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
          if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') throw new Error('模型生成失败')
        }
      } finally {
        clearTimeout(timeout)
      }
      return text
    }
    let text = await streamOnce(APPGEN_SYSTEM, '生成一个内嵌应用：' + prompt)
    let html
    try {
      html = extractHtml(text)
    } catch (_firstError) {
      // A detailed design prompt can make the model truncate the HTML. Retry
      // once with an explicit compact repair instruction instead of surfacing
      // an opaque "not complete HTML" error.
      const repair = await streamOnce(APPGEN_SYSTEM, '上一条输出被截断。请只返回一个完整、紧凑的单文件 HTML，最多 250 行，必须包含 </html>，不要解释。原始需求：' + prompt)
      html = extractHtml(repair)
    }
    html = ensureHtmlTitle(html, String(prompt).slice(0, 40))
    validateGeneratedHtml(html)
    if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error('生成结果过大')
    let verification = await verifyAppHtml(html, spec)
    if (!verification.ok) {
      const failedChecks = verification.checks.filter(check => !check.ok).map(check => check.name + ': ' + JSON.stringify(check)).join('\n')
      const errorText = (verification.errors || []).join('\n') || '运行时验收失败'
      const repairPrompt = `应用运行时验收失败。错误：\n${errorText}\n未通过检查：\n${failedChecks}\n请修复并重新返回完整单文件 HTML，最多 250 行，必须闭合 </html>，不要解释。原始需求：${prompt}\n当前 HTML（可能需重写）：\n${html.slice(0, 9000)}`
      const repairedText = await streamOnce(APPGEN_SYSTEM, repairPrompt)
      const repaired = ensureHtmlTitle(extractHtml(repairedText), String(prompt).slice(0, 40))
      validateGeneratedHtml(repaired)
      verification = await verifyAppHtml(repaired, spec)
      if (!verification.ok) {
        const failed = verification.checks.filter(check => !check.ok).map(check => check.name + (check.text !== undefined ? '（正文 ' + check.text + ' 字 / ' + check.nodes + ' 个节点）' : '')).join('、')
        throw new Error('生成应用未通过运行时验收：' + ((verification.errors || []).join('；') || failed || '未知错误'))
      }
      html = repaired
    }
    const name = String(prompt).replace(/\s+/gu, ' ').trim().slice(0, 40) || '生成应用'
    const id = 'gen-' + new Date().toISOString().slice(0, 10).replace(/-/gu, '') + '-' + randomUUID().slice(0, 8)
    return saveGeneratedApp(id, html, name, 'DSH 根据：' + String(prompt).slice(0, 160), spec)
  }

  async function importGithubApp(repoUrl) {
    const parsed = new URL(repoUrl)
    if (!/^https?:$/u.test(parsed.protocol) || parsed.hostname !== 'github.com') throw new Error('只接受 github.com 仓库地址')
    const parts = parsed.pathname.replace(/^\/+/u, '').replace(/\.git$/u, '').split('/').filter(Boolean)
    if (parts.length < 2) throw new Error('GitHub 地址需要 owner/repo')
    // owner/repo 只允许 GitHub 实际支持的字符；路径段一旦被拼进 git 参数，
    // 这里就是唯一能把 ".."、空格和 shell 元字符挡在外面的地方。
    if (!/^[A-Za-z0-9._-]+$/u.test(parts[0]) || !/^[A-Za-z0-9._-]+$/u.test(parts[1])) {
      throw new Error('仓库路径只允许字母、数字、点、下划线和连字符')
    }
    const id = 'gh-' + new Date().toISOString().slice(0, 10).replace(/-/gu, '') + '-' + randomUUID().slice(0, 6)
    const dir = path.join(home(), 'apps', id)
    await fsp.mkdir(dir, { recursive: true })
    try {
      await execFile('git', ['clone', '--depth', '1', 'https://github.com/' + parts[0] + '/' + parts[1] + '.git', dir], { timeout: 180000, maxBuffer: 16 * 1024 * 1024 })
      let entry = ''
      if (existsSync(path.join(dir, 'index.html'))) entry = 'index.html'
      if (entry === '' && existsSync(path.join(dir, 'package.json'))) {
        const pkg = JSON.parse(await fsp.readFile(path.join(dir, 'package.json'), 'utf8'))
        if (!pkg.scripts || typeof pkg.scripts.build !== 'string') throw new Error('仓库有 package.json 但没有 build 脚本；只能导入含根 index.html 的静态项目')
        const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
        await execFile(npm, ['install', '--no-audit', '--no-fund'], { cwd: dir, timeout: 300000, maxBuffer: 32 * 1024 * 1024 })
        await execFile(npm, ['run', 'build'], { cwd: dir, timeout: 300000, maxBuffer: 32 * 1024 * 1024 })
        for (const candidate of ['dist/index.html', 'build/index.html', 'out/index.html']) {
          if (existsSync(path.join(dir, candidate))) { entry = candidate; break }
        }
        if (entry === '') throw new Error('构建完成但没有找到 dist/index.html、build/index.html 或 out/index.html')
      }
      if (entry === '') throw new Error('仓库没有根 index.html，也没有可构建的 build 脚本')
      const name = parts[1].replace(/[-_]/gu, ' ').slice(0, 60)
      await writeAtomic(path.join(dir, 'app.json'), JSON.stringify({
        id, name, description: 'GitHub 导入：' + repoUrl, entry, createdAt: new Date().toISOString(),
      }, null, 2) + '\n')
      return { id, name, entry: '/a/generated/' + id + '/' + entry, source: repoUrl }
    } catch (error) {
      try { await fsp.rm(dir, { recursive: true, force: true }) } catch (_cleanup) { /* best effort */ }
      throw error
    }
  }

  async function handleAppData(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
    let body
    try { body = await readJsonBody(req, 128 * 1024) } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }) }
    const id = String(body.id || '')
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(id)) return sendJson(res, 400, { ok: false, error: 'invalid app id' })
    const dir = path.join(home(), 'apps', id)
    if (!existsSync(dir)) return sendJson(res, 404, { ok: false, error: '应用不存在' })
    let meta = {}
    try { meta = JSON.parse(await fsp.readFile(path.join(dir, 'app.json'), 'utf8')) } catch (_error) { meta = {} }
    const capabilities = Array.isArray(meta.capabilities) ? meta.capabilities : ['storage']
    if (!capabilities.includes('storage')) return sendJson(res, 403, { ok: false, error: '应用未申请 storage 能力' })
    const file = path.join(dir, 'data.json')
    let data = {}
    try { data = JSON.parse(await fsp.readFile(file, 'utf8')) } catch (_error) { data = {} }
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {}
    const op = String(body.op || '')
    try {
      if (op === 'get') return sendJson(res, 200, { ok: true, value: body.key === undefined ? data : data[String(body.key)] })
      if (op === 'set') {
        const key = String(body.key || '')
        if (key === '' || key.length > 128) return sendJson(res, 400, { ok: false, error: 'invalid key' })
        const value = body.value
        const encoded = JSON.stringify({ key, value })
        if (Buffer.byteLength(encoded) > 64 * 1024) return sendJson(res, 413, { ok: false, error: 'value too large' })
        data[key] = value
        await writeAtomic(file, JSON.stringify(data, null, 2) + '\n')
        return sendJson(res, 200, { ok: true, value })
      }
      if (op === 'remove') {
        const key = String(body.key || '')
        delete data[key]
        await writeAtomic(file, JSON.stringify(data, null, 2) + '\n')
        return sendJson(res, 200, { ok: true })
      }
      if (op === 'clear') {
        await fsp.rm(file, { force: true })
        return sendJson(res, 200, { ok: true })
      }
      return sendJson(res, 400, { ok: false, error: 'unknown op' })
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error && error.message ? error.message : String(error) })
    }
  }

  async function handleAppGen(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
    if (req.method === 'GET') return sendJson(res, 200, { ok: true, apps: await generatedApps() })
    if (req.method === 'DELETE') {
      const id = String(url.searchParams.get('id') || '')
      if (!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(id)) return sendJson(res, 400, { ok: false, error: 'invalid app id' })
      await fsp.rm(path.join(home(), 'apps', id), { recursive: true, force: true })
      return sendJson(res, 200, { ok: true, uninstalled: id, apps: await generatedApps() })
    }
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'GET/POST/DELETE only' })
    let body
    try { body = await readJsonBody(req, 128 * 1024) } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }) }
    try {
      if (typeof body.uninstall === 'string' && body.uninstall.trim() !== '') {
        const id = body.uninstall.trim()
        if (!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(id)) return sendJson(res, 400, { ok: false, error: 'invalid app id' })
        await fsp.rm(path.join(home(), 'apps', id), { recursive: true, force: true })
        return sendJson(res, 200, { ok: true, uninstalled: id, apps: await generatedApps() })
      }
      if (typeof body.github === 'string' && body.github.trim() !== '') {
        if (body.consent !== true) return sendJson(res, 400, { ok: false, error: '导入 GitHub 项目需要在宿主执行 git/npm，请先确认' })
        const app = await importGithubApp(body.github.trim())
        const apps = await generatedApps()
        return sendJson(res, 200, { ok: true, app: apps.find(item => item.id === app.id) || app, apps })
      }
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
      if (prompt === '') return sendJson(res, 400, { ok: false, error: '先用一句话描述要生成的应用' })
      if (prompt.length > 2000) return sendJson(res, 400, { ok: false, error: '描述过长' })
      const app = await generateAppFromPrompt(prompt)
      const apps = await generatedApps()
      const normalized = apps.find(item => item.id === app.id) || app
      return sendJson(res, 200, { ok: true, app: normalized, apps })
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error && error.message ? error.message : String(error) })
    }
  }

  async function generatedStatic(req, res, url) {
    const rest = url.pathname.replace(/^\/a\/generated\/?/u, '')
    const matched = /^([a-z0-9][a-z0-9-]{2,63})(?:\/(.*))?$/u.exec(rest)
    if (!matched) return notFound(res)
    const root = path.join(home(), 'apps', matched[1])
    if (!existsSync(root)) return notFound(res)
    const relative = decodeURIComponent(matched[2] || 'index.html') || 'index.html'
    const target = path.resolve(root, relative)
    if (target !== root && !inside(root, target)) return notFound(res)
    const headers = {
      'content-security-policy': "sandbox allow-scripts allow-forms allow-popups allow-modals; default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' data: blob:",
      'access-control-allow-origin': '*',
    }
    if (path.extname(relative).toLowerCase() === '.html') {
      try {
        let html = await fsp.readFile(target, 'utf8')
        const bridge = `<script>
(function(){
  window.nexlOS = window.nexlOS || {};
  var seq = 0, waiters = {};
  window.addEventListener('message', function(e){
    var d = e.data;
    if (!d || d.__nexlAppDataResult !== true || !waiters[d.requestId]) return;
    var w = waiters[d.requestId]; delete waiters[d.requestId];
    if (d.ok) w.resolve(d.value); else w.reject(new Error(d.error || 'app storage error'));
  });
  function call(op, key, value){
    return new Promise(function(resolve, reject){
      var requestId = String(++seq);
      waiters[requestId] = { resolve: resolve, reject: reject };
      try { parent.postMessage({ __nexlAppData: true, requestId: requestId, op: op, key: key, value: value }, '*') }
      catch (error) { delete waiters[requestId]; reject(error) }
      setTimeout(function(){ if (waiters[requestId]) { delete waiters[requestId]; reject(new Error('app storage timeout')) } }, 8000);
    });
  }
  window.nexlOS.storage = {
    get: function(key){ return call('get', key) },
    set: function(key, value){ return call('set', key, value) },
    remove: function(key){ return call('remove', key) },
    clear: function(){ return call('clear') }
  };
})();
</script>`
        if (html.indexOf('data-nexl-app-bridge') < 0) {
          const block = '<span data-nexl-app-bridge="1" hidden></span>' + bridge
          if (/<\/head>/iu.test(html)) html = html.replace(/<\/head>/iu, block + '</head>')
          else html = block + html
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers })
        return res.end(html)
      } catch (error) {
        return notFound(res)
      }
    }
    return serveFile(req, res, root, relative, { pluginTransforms: false, headers })
  }

  const terminalSessions = new Map()
  const TERMINAL_BUFFER_MAX = 4 * 1024 * 1024
  let terminalShellCache

  function clampTerminal(value, min, max, fallback) {
    const number = Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.max(min, Math.min(max, Math.round(number)))
  }

  async function terminalShellInfo() {
    if (terminalShellCache !== undefined) return terminalShellCache
    const subprocess = ctx.get('subprocess')
    if (subprocess === undefined || typeof subprocess.spawnTerminal !== 'function') {
      terminalShellCache = { enabled: false, pty: false, shell: '', platform: process.platform, reason: '当前宿主没有提供终端：缺少 PTY/subprocess 服务' }
      return terminalShellCache
    }
    let environment
    try { environment = await subprocess.terminalEnvironment() } catch (_error) { environment = undefined }
    const platform = environment && environment.platform === 'windows' ? 'windows' : environment && environment.platform === 'posix' ? 'posix' : (process.platform === 'win32' ? 'windows' : 'posix')
    let shell = environment && typeof environment.defaultShell === 'string' ? environment.defaultShell : ''
    if (shell === '') shell = platform === 'windows' ? (process.env.ComSpec || 'powershell.exe') : (process.env.SHELL || '/bin/zsh')
    terminalShellCache = { enabled: true, pty: true, shell, platform, argv: platform === 'windows' ? [shell] : [shell, '-l'] }
    return terminalShellCache
  }

  function terminalAuth(fields) {
    const id = fields && typeof fields.id === 'string' ? fields.id : ''
    const token = fields && typeof fields.token === 'string' ? fields.token : ''
    const session = terminalSessions.get(id)
    if (session === undefined || session.token !== token) throw new Error('终端会话已失效')
    return session
  }

  function terminalBroadcast(session, chunk) {
    if (chunk.length === 0) return
    session.total += chunk.length
    session.buffer = Buffer.concat([session.buffer, chunk])
    if (session.buffer.length > TERMINAL_BUFFER_MAX) {
      session.buffer = session.buffer.subarray(session.buffer.length - TERMINAL_BUFFER_MAX)
    }
    session.start = session.total - session.buffer.length
    const data = chunk.toString('base64')
    for (const listener of [...session.listeners]) {
      try { listener({ type: 'out', id: session.id, next: session.total, data }) } catch (_error) { session.listeners.delete(listener) }
    }
  }

  function terminalExit(session, code) {
    if (session.exited) return
    session.exited = true
    session.closed = true
    session.exitCode = typeof code === 'number' ? code : 0
    for (const listener of [...session.listeners]) {
      try { listener({ type: 'exit', id: session.id, code: session.exitCode }) } catch (_error) { session.listeners.delete(listener) }
    }
  }

  async function openTerminalSession(fields) {
    const info = await terminalShellInfo()
    if (!info.enabled || !info.pty) throw new Error(info.reason || '当前宿主没有可用的 PTY')
    const subprocess = ctx.get('subprocess')
    const cols = clampTerminal(fields.cols, 20, 400, 100)
    const rows = clampTerminal(fields.rows, 5, 200, 30)
    let cwd = home()
    if (typeof fields.cwd === 'string' && fields.cwd !== '' && existsSync(fields.cwd)) cwd = fields.cwd
    const handle = await subprocess.spawnTerminal({
      argv: info.argv,
      cwd,
      env: { TERM: 'xterm-256color', COLORTERM: 'truecolor', LANG: process.env.LANG || 'en_US.UTF-8' },
      rows,
      cols,
      terminalType: 'xterm-256color',
      graceMs: 800,
    })
    const id = 'term-' + randomUUID()
    const token = randomUUID()
    const session = {
      id, token, handle, cols, rows, buffer: Buffer.alloc(0), start: 0, total: 0,
      listeners: new Set(), exited: false, closed: false, exitCode: undefined,
      decoder: new TextDecoder('utf-8'),
    }
    terminalSessions.set(id, session)
    handle.output.on('data', (chunk) => {
      try {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
        terminalBroadcast(session, buffer)
      } catch (_error) { /* provider stream errors are reported by done */ }
    })
    handle.output.on('error', () => { /* done reports the provider error */ })
    handle.done.then((outcome) => {
      terminalExit(session, outcome && typeof outcome.code === 'number' ? outcome.code : 0)
    }).catch(() => {
      terminalExit(session, 1)
    })
    return { id, token, shell: info.shell, cwd, pid: handle.pid, cols, rows }
  }

  const embedCheckCache = new Map()
  const EMBED_TTL = 10 * 60 * 1000

  async function handleBrowserRequest(req, res, url) {
    const action = url.pathname.slice('/nexlos/browser/'.length)
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
    try {
      if (action === 'status') {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' })
        return sendJson(res, 200, await browserBridge.status())
      }
      if (action === 'preflight') {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' })
        return sendJson(res, 200, { ok: true, ...(await browserBridge.preflight()) })
      }
      if (action === 'embed-check') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        const body = await readJsonBody(req, 16 * 1024)
        let target
        try { target = new URL(String(body.url || '')) } catch (_error) { return sendJson(res, 400, { ok: false, error: 'bad url' }) }
        if (target.protocol !== 'http:' && target.protocol !== 'https:') return sendJson(res, 400, { ok: false, error: 'http(s) only' })
        if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/u.test(target.hostname)) {
          return sendJson(res, 200, { ok: true, embeddable: false, reason: '本地/内网地址不支持内嵌' })
        }
        const cacheKey = target.protocol + '//' + target.host
        const cached = embedCheckCache.get(cacheKey)
        if (cached && Date.now() - cached.at < EMBED_TTL) return sendJson(res, 200, { ...cached.value, cached: true })
        let response
        try {
          response = await fetch(target.href, {
            redirect: 'follow',
            signal: AbortSignal.timeout(3500),
            headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' },
          })
        } catch (_error) {
          // Header probe failed: try the iframe. A blocked frame will fall
          // back through the explicit notice/timeout instead of being
          // pre-judged as non-embeddable.
          const value = { ok: true, embeddable: true, unknown: true, reason: '无法验证，先尝试内嵌' }
          embedCheckCache.set(cacheKey, { at: Date.now(), value })
          return sendJson(res, 200, value)
        }
        const xfo = String(response.headers.get('x-frame-options') || '').toLowerCase()
        const csp = String(response.headers.get('content-security-policy') || '').toLowerCase()
        let reason = ''
        if (xfo.includes('deny')) reason = 'X-Frame-Options: DENY'
        else if (xfo.includes('sameorigin')) reason = 'X-Frame-Options: SAMEORIGIN'
        const ancestors = csp.match(/frame-ancestors\s+([^;]+)/u)
        if (!reason && ancestors) {
          const value = ancestors[1].trim()
          if (value.includes("'none'") || value.includes("'self'")) reason = 'CSP frame-ancestors ' + value
        }
        const value = { ok: true, embeddable: reason === '', reason: reason || 'allowed', finalUrl: response.url, status: response.status }
        if (embedCheckCache.size > 500) embedCheckCache.clear()
        embedCheckCache.set(cacheKey, { at: Date.now(), value })
        return sendJson(res, 200, value)
      }
      if (action === 'human') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        const body = await readJsonBody(req, 16 * 1024)
        const target = String(body.url || '')
        if (!/^https?:\/\//u.test(target)) return sendJson(res, 400, { ok: false, error: 'bad url' })
        return sendJson(res, 200, await browserBridge.openHumanUrl(target))
      }
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
      const body = await readJsonBody(req, 4 * 1024 * 1024)
      if (action === 'open' || action === 'navigate') {
        const target = typeof body.url === 'string' ? body.url : ''
        if (target === '') return sendJson(res, 400, { ok: false, error: 'url is required' })
        return sendJson(res, 200, { ok: true, ...(await browserBridge.navigate(target)) })
      }
      if (action === 'input') {
        const event = body.event && typeof body.event === 'object' ? body.event : body
        return sendJson(res, 200, { ok: true, ...(await browserBridge.input(event)) })
      }
      if (action === 'viewport') {
        return sendJson(res, 200, { ok: true, ...(await browserBridge.setViewport(body.width, body.height, body.dpr, body.quality)) })
      }
      if (action === 'agent') {
        return sendJson(res, 200, { ok: true, result: await browserBridge.agent(body) })
      }
      if (action === 'ask') {
        const uiSessionId = typeof body.uiSessionId === 'string' && body.uiSessionId.trim() !== '' ? body.uiSessionId.trim().slice(0, 120) : 'browser-' + randomUUID()
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
        if (prompt === '') return sendJson(res, 400, { ok: false, error: 'prompt is required' })
        if (prompt.length > 24000) return sendJson(res, 400, { ok: false, error: 'prompt too long' })
        const sc = ctx.get('sessionController')
        if (sc === undefined) return sendJson(res, 503, { ok: false, error: 'DSH session controller 不可用' })
        const dshSessionId = await ensureDshSession(uiSessionId)
        await sc.prompt({
          requestId: randomUUID(), sessionId: dshSessionId, mode: 'queue',
          content: [{ type: 'text', text: prompt }], clientTimeZone: safeTimeZone(),
        }, AbortSignal.timeout(30000))
        return sendJson(res, 200, { ok: true, sessionId: dshSessionId, uiSessionId })
      }
      if (action === 'note') {
        const title = String(body.title || '浏览器摘录').replace(/\s+/gu, ' ').trim().slice(0, 120) || '浏览器摘录'
        const source = String(body.url || '').trim().slice(0, 1200)
        const selection = String(body.selection || '').trim().slice(0, 30000)
        const note = String(body.note || '').trim().slice(0, 12000)
        if (selection === '' && note === '') return sendJson(res, 400, { ok: false, error: '选中文本或备注不能都为空' })
        const now = new Date()
        const date = now.toISOString().slice(0, 10)
        const clock = now.toTimeString().slice(0, 8).replace(/:/gu, '')
        const slug = slugify(title, 'browser').slice(0, 40) || 'browser'
        const dir = path.join(memoryRootOf(home()), 'observations')
        await fsp.mkdir(dir, { recursive: true })
        let filename = `浏览器-${date}-${clock}-${slug}.md`
        if (existsSync(path.join(dir, filename))) filename = `浏览器-${date}-${clock}-${slug}-${randomUUID().slice(0, 4)}.md`
        const yamlTitle = title.replace(/"/gu, '\\"')
        const yamlSource = source.replace(/"/gu, '\\"')
        const quote = selection ? selection.split('\n').map(line => '> ' + line).join('\n') : ''
        const markdown = [
          '---', `title: "${yamlTitle}"`, `source: "${yamlSource}"`, `created: "${now.toISOString()}"`, 'tags: [browser, capture, nexl]', '---', '',
          `# ${title}`, '', source ? `来源：[${title}](${source})` : '', '', quote, note ? `\n## 备注\n\n${note}` : '', '',
          '---', '由 NexlOS 浏览器上下文舱摘录；可继续手写或在关系图谱中连接。', '',
        ].filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n')
        await writeAtomic(path.join(dir, filename), markdown)
        return sendJson(res, 200, { ok: true, path: '/memory/observations/' + filename, title })
      }
      if (action === 'close') {
        await browserBridge.shutdown()
        return sendJson(res, 200, { ok: true })
      }
      return sendJson(res, 404, { ok: false, error: 'unknown browser route' })
    } catch (error) {
      if (!res.headersSent) return sendJson(res, 500, { ok: false, error: error && error.message ? error.message : String(error) })
      try { res.end() } catch (_error) { /* ignore */ }
    }
  }

  async function handleTerminalCommand(command, fields) {
    const info = await terminalShellInfo()
    if (command === 'term.info') {
      return { detail: {
        enabled: info.enabled,
        pty: info.pty,
        shell: info.shell,
        platform: info.platform,
        reason: info.reason || '',
        cwd: home(),
        home: home(),
      } }
    }
    if (command === 'term.open') {
      return { detail: await openTerminalSession(fields) }
    }
    const session = terminalAuth(fields)
    if (command === 'term.status') {
      return { detail: {
        alive: !session.closed,
        closed: session.closed,
        exitCode: session.exitCode,
        start: session.start,
        total: session.total,
        viewers: session.listeners.size,
        reads: 0,
        unacked: 0,
      } }
    }
    if (command === 'term.input') {
      if (session.closed) throw new Error('终端已关闭')
      const raw = Buffer.from(String(fields.data || ''), 'base64')
      if (raw.length > 64 * 1024) throw new Error('单次输入过长')
      const text = session.decoder.decode(raw, { stream: true })
      if (text !== '') await session.handle.write(text)
      return { detail: { bytes: raw.length } }
    }
    if (command === 'term.resize') {
      const cols = clampTerminal(fields.cols, 20, 400, 100)
      const rows = clampTerminal(fields.rows, 5, 200, 30)
      await session.handle.resize(cols, rows)
      session.cols = cols
      session.rows = rows
      return { detail: { cols, rows } }
    }
    if (command === 'term.ack') {
      return { detail: { ack: Number(fields.bytes) || 0, unacked: 0 } }
    }
    if (command === 'term.close') {
      if (!session.closed) {
        try { await session.handle.terminate() } catch (_error) { /* already gone */ }
        terminalExit(session, 0)
      }
      return { detail: { closed: true, id: session.id } }
    }
    throw new Error('未知终端命令')
  }

  async function terminalToolAction(args) {
    const action = String(args.action || '')
    const title = String(args.title || 'Agent 终端').slice(0, 80)
    const timeoutMs = Math.max(1000, Math.min(120000, Number(args.timeoutMs) || 30000))
    if (action === 'run') {
      const command = typeof args.command === 'string' ? args.command.trim() : ''
      if (command === '') throw new Error('run 需要 command')
      const cwd = typeof args.cwd === 'string' && args.cwd !== '' && existsSync(args.cwd) ? args.cwd : home()
      const isWindows = process.platform === 'win32'
      const shell = isWindows ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || '/bin/zsh')
      const argv = isWindows ? ['/d', '/s', '/c', command] : ['-lc', command]
      try {
        const result = await execFile(shell, argv, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true })
        return { output: String(result.stdout || '') + String(result.stderr || ''), exitCode: 0, cwd, command }
      } catch (error) {
        return {
          output: String(error && error.stdout ? error.stdout : '') + String(error && error.stderr ? error.stderr : '') + (error && error.message ? '\n' + error.message : ''),
          exitCode: typeof error.code === 'number' ? error.code : 1,
          cwd, command,
          timedOut: !!(error && (error.killed || error.signal)),
        }
      }
    }
    if (action === 'open') {
      const detail = await openTerminalSession({
        cols: 120, rows: 32,
        cwd: typeof args.cwd === 'string' && args.cwd !== '' ? args.cwd : home(),
      })
      const session = terminalSessions.get(detail.id)
      if (!session) throw new Error('终端会话创建失败')
      const pendingFile = path.join(home(), '.nexlos', 'terminal-pending.json')
      await fsp.mkdir(path.dirname(pendingFile), { recursive: true })
      await writeAtomic(pendingFile, JSON.stringify({
        session: { id: detail.id, token: detail.token, title, cwd: detail.cwd },
        createdAt: new Date().toISOString(),
      }, null, 2) + '\n')
      const command = typeof args.command === 'string' ? args.command.trim() : ''
      if (command !== '') {
        await new Promise(resolve => setTimeout(resolve, 350))
        await session.handle.write(command)
        await session.handle.write('\r')
      }
      await new Promise(resolve => setTimeout(resolve, 700))
      return {
        sessionId: detail.id, title, cwd: detail.cwd, pending: true,
        screen: terminalVisibleText(session).slice(-8000),
        note: '已把会话交给 NexlOS 终端；打开终端窗口会接上这个 tab，可继续输入并保存。',
      }
    }
    if (action === 'read') {
      const id = String(args.sessionId || '')
      const session = terminalSessions.get(id)
      if (!session) throw new Error('找不到这个终端会话')
      return { sessionId: id, exited: session.closed, output: terminalVisibleText(session).slice(-20000) }
    }
    if (action === 'input') {
      const id = String(args.sessionId || '')
      const session = terminalSessions.get(id)
      if (!session) throw new Error('找不到这个终端会话')
      const text = String(args.text || '')
      if (text === '') throw new Error('text 不能为空')
      await session.handle.write(text)
      if (args.enter === true) await session.handle.write('\r')
      return { sessionId: id, sent: text.length }
    }
    if (action === 'close') {
      const id = String(args.sessionId || '')
      const session = terminalSessions.get(id)
      if (session) {
        try { await session.handle.terminate() } catch (_error) { /* already gone */ }
      }
      return { sessionId: id, closed: true }
    }
    throw new Error('terminal 动作支持 open / run / read / input / close')
  }

  function terminalVisibleText(session) {
    let text = session && session.buffer ? session.buffer.toString('utf8') : ''
    text = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, '').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/gu, '')
    text = text.replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '')
    return text
  }

  function terminalStream(req, res) {
    if (!sameOrigin(req)) return sendText(res, 403, 'forbidden')
    const url = new URL(req.url || '/', 'http://x')
    let spec
    try {
      const raw = String(url.searchParams.get('q') || '').replace(/-/gu, '+').replace(/_/gu, '/')
      const padded = raw + '='.repeat((4 - raw.length % 4) % 4)
      spec = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    } catch (_error) {
      return sendText(res, 400, 'bad terminal spec')
    }
    if (!Array.isArray(spec) || spec.length === 0) return sendText(res, 400, 'empty terminal spec')
    const selected = []
    for (const item of spec.slice(0, 16)) {
      if (!item || typeof item.id !== 'string' || typeof item.token !== 'string') continue
      const session = terminalSessions.get(item.id)
      if (session === undefined || session.token !== item.token) continue
      selected.push({ session, since: Number(item.since) || 0, tail: clampTerminal(item.tail, 1024, 1024 * 1024, 131072) })
    }
    if (selected.length === 0) return sendText(res, 403, 'no terminal session')
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const send = (event) => {
      if (res.writableEnded) return
      try {
        res.write('event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n')
      } catch (_error) { /* peer closed */ }
    }
    const close = () => {
      for (const entry of selected) entry.session.listeners.delete(listener)
      clearInterval(heartbeat)
    }
    const listener = (event) => {
      if (event.id === undefined) return
      if (selected.some(entry => entry.session.id === event.id)) send(event)
    }
    for (const entry of selected) entry.session.listeners.add(listener)
    for (const entry of selected) {
      const session = entry.session
      const from = Math.max(session.start, entry.since || 0)
      let offset = from
      while (offset < session.total) {
        const sliceStart = offset - session.start
        const slice = session.buffer.subarray(sliceStart, Math.min(session.buffer.length, sliceStart + Math.min(entry.tail, 64 * 1024)))
        offset += slice.length
        send({ type: 'out', id: session.id, next: offset, data: slice.toString('base64') })
        if (slice.length === 0) break
      }
      if (session.closed) send({ type: 'exit', id: session.id, code: session.exitCode || 0 })
    }
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': keepalive\n\n')
    }, 20000)
    res.on('close', close)
  }

  ctx.effect(() => () => {
    for (const session of terminalSessions.values()) {
      try { void session.handle.terminate() } catch (_error) { /* ignore */ }
    }
    terminalSessions.clear()
  }, 'nexlos terminal sessions')

  const activeChats = new Map()

  function sessionMapFile() {
    return path.join(home(), '.nexlos', 'agent-sessions.json')
  }

  async function loadSessionMap() {
    if (agentSessions.size > 0) return agentSessions
    const stored = await readJson(sessionMapFile(), {})
    if (stored && typeof stored === 'object') {
      for (const [key, value] of Object.entries(stored)) if (typeof value === 'string') agentSessions.set(key, value)
    }
    return agentSessions
  }

  async function saveSessionMap() {
    try {
      await writeJson(sessionMapFile(), Object.fromEntries(agentSessions))
    } catch (_error) {
      /* session continuity degrades to one process */
    }
  }

  let agentPrefsCache
  async function loadAgentPrefs() {
    if (agentPrefsCache !== undefined) return agentPrefsCache
    const stored = await readJson(path.join(home(), '.nexlos', 'agent-prefs.json'), {})
    agentPrefsCache = stored && typeof stored === 'object' ? stored : {}
    return agentPrefsCache
  }

  async function saveAgentPrefs() {
    try {
      await writeJson(path.join(home(), '.nexlos', 'agent-prefs.json'), agentPrefsCache || {})
    } catch (_error) {
      /* preference persistence is best-effort */
    }
  }

  function prefsOf(prefs, uiSessionId) {
    const entry = prefs[uiSessionId]
    return entry && typeof entry === 'object' ? entry : {}
  }

  async function applyAgentPrefs(dshSessionId, pref) {
    if (!pref || typeof pref !== 'object') return
    const sc = ctx.get('sessionController')
    if (sc !== undefined && pref.model && typeof pref.model.provider === 'string' && typeof pref.model.model === 'string') {
      try {
        await sc.selectModel({
          sessionId: dshSessionId,
          provider: pref.model.provider,
          model: pref.model.model,
          ...(typeof pref.model.reasoningEffort === 'string' ? { reasoningEffort: pref.model.reasoningEffort } : {}),
        })
      } catch (_error) {
        /* the next explicit switch can retry */
      }
    }
    const permission = ctx.get('permissionPresets')
    if (permission !== undefined && typeof pref.permission === 'string' && pref.permission !== '') {
      try {
        const resolved = await sc.resolveAgent(dshSessionId)
        if (resolved && resolved.agent) permission.set(resolved.agent.session, pref.permission)
      } catch (_error) {
        /* the next explicit switch can retry */
      }
    }
  }

  async function ensureDshSession(uiSessionId) {
    const sc = ctx.get('sessionController')
    if (sc === undefined) throw new Error('DSH session controller 不可用')
    const map = await loadSessionMap()
    const existing = map.get(uiSessionId)
    if (typeof existing === 'string') return existing
    const prefs = await loadAgentPrefs()
    const pref = prefsOf(prefs, uiSessionId)
    const cwd = typeof pref.container === 'string' && pref.container !== '' && existsSync(pref.container)
      ? pref.container
      : home()
    const created = await sc.create({ cwd })
    map.set(uiSessionId, created.sessionId)
    await saveSessionMap()
    await applyAgentPrefs(created.sessionId, pref)
    return created.sessionId
  }

  function assistantText(data) {
    const content = data && data.message && data.message.content
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content.filter(block => block && block.type === 'text').map(block => block.text || '').join('')
  }

  function toolResultText(data) {
    let text = ''
    const content = data && data.message && data.message.content
    if (typeof content === 'string') text = content
    else if (Array.isArray(content)) text = content.filter(block => block && block.type === 'text').map(block => block.text || '').join('')
    if (data && data.error) text = (data.error.name || 'tool') + ': ' + (data.error.code || '') + (data.error.reason ? ' · ' + data.error.reason : '')
    return text.slice(0, 4000)
  }

  /** True when the event belongs to a turn that was already complete before this prompt. */
  function staleTurn(event, baselineTurn) {
    const turn = event && event.data && event.data.turn
    return typeof turn === 'number' && typeof baselineTurn === 'number' && turn <= baselineTurn
  }

  /** Emit the UI's NDJSON vocabulary for one durable Session event. */
  function translateEvent(uiSessionId, event, emit, capture) {
    const type = event && event.type
    const data = event && event.data
    if (type === 'user/message' || type === 'turn/start') return false
    if (type === 'tool/call') {
      const call = { id: data && data.callId, name: (data && data.name) || 'tool', arguments: (data && data.arguments) || '', result: '' }
      if (capture) {
        capture.tools = capture.tools || []
        capture.tools.push(call)
        capture.openCalls = capture.openCalls || {}
        if (call.id) capture.openCalls[call.id] = call
      }
      emit({ type: 'tool', phase: 'call', callId: data && data.callId, text: call.name, detail: call.arguments })
      return false
    }
    if (type === 'tool/result') {
      const ok = !(data && (data.error || (data.message && data.message.isError)))
      const callId = data && data.message && data.message.toolCallId
      const result = toolResultText(data)
      if (capture) {
        const call = callId && capture.openCalls ? capture.openCalls[callId] : undefined
        if (call) {
          call.result = result
          call.failed = !ok
        }
      }
      emit({ type: 'tool', phase: 'result', callId, ok, text: result, detail: result })
      return false
    }
    if (type === 'assistant/message') {
      const text = assistantText(data)
      if (capture) capture.assistantText = text
      if (text.trim() !== '') emit({ type: 'assistant', text })
      return false
    }
    if (type === 'turn/end') {
      const reason = data && data.reason ? data.reason : { kind: 'completed' }
      if (capture) {
        capture.doneReason = reason.kind || 'completed'
        capture.errorText = reason.error ? (reason.error.message || '') : capture.errorText
      }
      return true
    }
    if (type === 'turn/error' || type === 'agent/error') {
      const message = (data && (data.message || data.error)) || '未知错误'
      if (capture) capture.errorText = message
      emit({ type: 'error', text: message })
      return false
    }
    return false
  }

  async function handleAgentChat(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'agent request rejected' })
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message })
    }
    const uiSessionId = typeof body.sessionId === 'string' && body.sessionId !== '' ? body.sessionId : randomUUID()
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (text === '') return sendJson(res, 400, { ok: false, error: '指令为空' })
    const sc = ctx.get('sessionController')
    if (sc === undefined) return sendJson(res, 503, { ok: false, error: 'DSH session controller 不可用' })
    if (activeChats.has(uiSessionId)) return sendJson(res, 409, { ok: false, error: '上一轮仍在运行，请先停止或等待完成' })

    res.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    let closed = false
    const emit = (event) => {
      if (closed || res.writableEnded) return
      try {
        res.write(JSON.stringify(event) + '\n')
      } catch (_error) {
        closed = true
      }
    }
    const heartbeat = setInterval(() => emit({ type: 'status', phase: 'running' }), 15000)
    const controller = new AbortController()
    activeChats.set(uiSessionId, { controller, sessionId: undefined, emit })
    res.on('close', () => {
      if (!res.writableEnded) {
        try { controller.abort() } catch (_error) { /* already aborted */ }
      }
    })
    let dshSessionId
    let stopWatch = () => {}
    const startedAt = Date.now()
    try {
      emit({ type: 'status', phase: 'sent' })
      dshSessionId = await ensureDshSession(uiSessionId)
      const active = activeChats.get(uiSessionId)
      if (active) active.sessionId = dshSessionId
      let baselineSeq = 0
      let baselineTurn = 0
      try {
        const before = await sc.inspect(dshSessionId)
        for (const event of (before && before.events) || []) {
          if (typeof event.seq === 'number' && event.seq > baselineSeq) baselineSeq = event.seq
          const turn = event && event.data && event.data.turn
          if (typeof turn === 'number' && turn > baselineTurn) baselineTurn = turn
        }
      } catch (_error) {
        baselineSeq = 0
        baselineTurn = 0
      }
      await sc.prompt({
        requestId: randomUUID(),
        sessionId: dshSessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
        clientTimeZone: safeTimeZone(),
      }, controller.signal)
      emit({ type: 'status', phase: 'running' })
      // Child agents are ordinary Sessions under this captain; watch them for
      // the life of this response so the status surface shows real work.
      // `since` keeps the trace to this turn: the catalog also holds older runs.
      stopWatch = watchAgentTree(dshSessionId, emit, controller.signal, { since: startedAt })
      let finished = false
      const capture = { tools: [], assistantText: '', errorText: '', doneReason: '', openCalls: {}, baselineTurn }
      const selectionPromise = currentSelectionOf(dshSessionId).catch(() => undefined)
      const finishRun = async (reason) => {
        const selection = await selectionPromise
        let report = ''
        try {
          report = await writeRunReport(home(), {
            command: text,
            startedAt,
            endedAt: Date.now(),
            ok: reason === 'completed' && capture.errorText === '',
            reason: capture.errorText || reason,
            sessionId: dshSessionId,
            model: selection ? selection.provider + '/' + selection.model + (selection.reasoningEffort ? ' · ' + selection.reasoningEffort : '') : '',
            assistantText: capture.assistantText,
            errorText: capture.errorText,
            tools: capture.tools,
          })
        } catch (_error) {
          report = ''
        }
        emit({ type: 'done', reason, detail: report })
      }
      const stream = sc.follow({ address: { kind: 'session', sessionId: dshSessionId } }, controller.signal)
      for await (const frame of stream) {
        if (controller.signal.aborted) break
        if (frame.type === 'snapshot') {
          const records = Array.isArray(frame.records) ? frame.records : []
          for (const record of records) {
            if (!record || record.type !== 'event' || !record.event) continue
            if (typeof record.event.seq === 'number' && record.event.seq <= baselineSeq) continue
            if (staleTurn(record.event, baselineTurn)) continue
            if (translateEvent(uiSessionId, record.event, emit, capture)) {
              finished = true
              break
            }
          }
          if (finished) break
          continue
        }
        if (frame.type === 'event' && frame.event) {
          if (typeof frame.event.seq === 'number' && frame.event.seq <= baselineSeq) continue
          if (staleTurn(frame.event, baselineTurn)) continue
          if (translateEvent(uiSessionId, frame.event, emit, capture)) {
            finished = true
            break
          }
        }
      }
      // A final snapshot keeps parked children visible after the captain's
      // turn closes (their own sessions may still be settling). Same turn
      // filter as the watcher, so older runs do not reappear at the finish line.
      try {
        const roster = await collectAgentRoster(dshSessionId, { fresh: true, since: startedAt })
        emit({ type: 'agents', agents: (roster.agents || []).map(agent => publicAgent(agent)) })
      } catch (_error) {
        /* the popup can still poll the roster route */
      }
      stopWatch()
      if (!finished) await finishRun(capture.doneReason || (controller.signal.aborted ? 'aborted' : 'completed'))
      else await finishRun(capture.doneReason || 'completed')
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error && error.message ? error.message : String(error)
        emit({ type: 'error', text: message })
        try {
          const report = await writeRunReport(home(), {
            command: text, startedAt, endedAt: Date.now(), ok: false, reason: 'error',
            sessionId: dshSessionId, model: '', assistantText: '', errorText: message, tools: [],
          })
          emit({ type: 'done', reason: 'error', detail: report })
        } catch (_error) {
          emit({ type: 'done', reason: 'error', detail: '' })
        }
      }
    } finally {
      stopWatch()
      clearInterval(heartbeat)
      activeChats.delete(uiSessionId)
      try {
        res.end()
      } catch (_error) {
        /* already closed */
      }
    }
  }

  async function currentSelectionOf(sessionId) {
    const sc = ctx.get('sessionController')
    if (sc === undefined) return undefined
    try {
      const projections = ctx.get('sessionProjections')
      if (projections !== undefined) {
        const resolved = await sc.resolveAgent(sessionId)
        if (resolved && resolved.agent) {
          const snapshot = projections.snapshot(resolved.agent.session, ['modelSelection'])
          const selection = snapshot.values.modelSelection
          if (selection) return selection.next || selection.lastUsed || undefined
          const header = resolved.agent.session.requestHeader()
          if (header && header.config) return header.config
        }
      }
    } catch (_error) {
      /* report falls back to the global default */
    }
    try {
      const fallback = ctx.get('agentDefaultModel')
      if (fallback && typeof fallback.currentSelection === 'function') return fallback.currentSelection()
    } catch (_error) {
      /* no selection */
    }
    return undefined
  }

  function safeTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (_error) {
      return undefined
    }
  }

  async function handleAgentStatus(res) {
    // 就绪与否看的是「能不能真跑模型」，不是「DSH 装没装」：
    // 以前无条件 ready:true，宿主缺模型服务时界面仍然显示就绪，属于误报。
    const llm = ctx.get('llm')
    const sc = ctx.get('sessionController')
    const hasRuntime = (llm !== undefined && typeof llm.stream === 'function') || sc !== undefined
    let provider = ''
    let model = ''
    let catalogReadable = false
    try {
      const fallback = ctx.get('agentDefaultModel')
      if (fallback && typeof fallback.currentSelection === 'function') {
        const current = fallback.currentSelection()
        if (current && typeof current.provider === 'string') provider = current.provider
        if (current && typeof current.model === 'string') model = current.model
      }
    } catch (_error) {
      /* 读不到选择就按未解析处理，不猜默认值 */
    }
    if ((provider === '' || model === '') && sc !== undefined && typeof sc.modelCatalog === 'function') {
      try {
        const catalog = await sc.modelCatalog()
        const fallbackSelection = catalog && catalog.default
        if (fallbackSelection && typeof fallbackSelection.provider === 'string') provider = fallbackSelection.provider
        if (fallbackSelection && typeof fallbackSelection.model === 'string') model = fallbackSelection.model
        catalogReadable = true
      } catch (_error) {
        /* 目录读不到就保持未解析，并按「未知」报告，不猜默认值 */
      }
    }
    const resolved = provider !== '' && model !== ''
    // 两态布尔会把「读不到」说成「不可用」。这里给四态，界面按状态说话：
    // unavailable 没运行时 / ready 有且有模型 / degraded 有运行时但没有默认模型 / unknown 问不到
    let readyState = 'ready'
    let reason = ''
    if (!hasRuntime) {
      readyState = 'unavailable'
      reason = 'model-service-missing'
    } else if (!resolved) {
      readyState = catalogReadable ? 'degraded' : 'unknown'
      reason = catalogReadable ? 'model-selection-unresolved' : 'model-catalog-unavailable'
    }
    sendJson(res, 200, {
      ok: true,
      available: hasRuntime,
      ready: readyState === 'ready',
      readyState,
      reason,
      provider,
      model,
      workspace: home(),
      last_error: reason,
      byok: null,
      byokActive: false,
      // BYOK 由宿主配置页承担，插件不保存也不回显密钥。
      byokStatus: 'unavailable',
    })
  }

  async function handleWorkspaceFile(req, res, url) {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' })
    const requested = url.searchParams.get('path') || ''
    if (requested === '') return sendJson(res, 400, { ok: false, error: 'path is required' })
    let resolved
    try {
      resolved = resolveVirtual(home(), requested)
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message })
    }
    try {
      const info = await fsp.stat(resolved.absolute)
      if (!info.isFile()) return sendJson(res, 400, { ok: false, error: 'not a file' })
      if (info.size > 2 * 1024 * 1024) return sendJson(res, 400, { ok: false, error: 'file too large' })
      const text = await fsp.readFile(resolved.absolute, 'utf8')
      sendJson(res, 200, { ok: true, path: resolved.vpath, text })
    } catch (error) {
      sendJson(res, 404, { ok: false, error: error && error.message ? error.message : 'not found' })
    }
  }

  const conversationCache = new Map()

  /* ------------------------------------------------------------------ */
  /* Live subagent roster                                                */
  /*                                                                     */
  /* DSH keeps every delegation in the parent's durable `subagentCatalog` */
  /* projection, and each child is an ordinary Session. That gives the    */
  /* status surface two truthful layers: who exists (catalog) and what    */
  /* they are doing now (the child's own last events + live Agent state). */
  /* ------------------------------------------------------------------ */
  const agentRosterCache = new Map(); // rootSessionId -> { at, value }
  const agentSnapshotCache = new Map(); // childSessionId -> { at, value }
  const swarmRuns = new Map(); // swarmId -> { at, text, members: [{ id, name }] }

  function shortAgentId(id) {
    return String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || '—';
  }

  function agentToolDetail(raw) {
    if (!raw) return '';
    let text = String(raw);
    try {
      const obj = JSON.parse(text);
      text = obj.command || obj.path || obj.file || obj.query || obj.pattern || obj.description
        || Object.keys(obj).map((key) => obj[key]).find((value) => typeof value === 'string')
        || text;
    } catch (_error) {
      /* not JSON: keep the raw argument text */
    }
    return String(text).replace(/\s+/gu, ' ').slice(0, 160);
  }

  /* Fold a child Session's event tail into one "what is it doing" answer.
     The window is bounded: enough to see the open tool call and the last
     sentence, never the whole transcript. */
  function agentDigestFromEvents(events) {
    const rows = Array.isArray(events) ? events : [];
    const start = Math.max(0, rows.length - 200);
    const open = new Map();
    let steps = 0;
    let lastAssistant = '';
    let turnStart = 0;
    let stopReason = '';
    let lastEventAt = 0;
    let lastSeq = 0;
    for (let index = start; index < rows.length; index += 1) {
      const event = rows[index];
      if (!event) continue;
      const data = event.data;
      if (typeof event.seq === 'number' && event.seq > lastSeq) lastSeq = event.seq;
      if (typeof event.time === 'number' && event.time > lastEventAt) lastEventAt = event.time;
      if (event.type === 'turn/start') {
        turnStart = event.time || turnStart;
      } else if (event.type === 'tool/call') {
        steps += 1;
        const call = {
          id: (data && data.callId) || '',
          name: (data && data.name) || 'tool',
          detail: agentToolDetail(data && data.arguments),
          at: event.time || Date.now(),
          seq: event.seq || 0,
        };
        if (call.id) open.set(call.id, call);
      } else if (event.type === 'tool/result') {
        const callId = data && data.message && data.message.toolCallId;
        if (callId) open.delete(callId);
      } else if (event.type === 'assistant/message') {
        const text = eventMessageText(data);
        if (text.trim() !== '') lastAssistant = text.trim();
      } else if (event.type === 'turn/end') {
        stopReason = (data && data.reason && data.reason.kind) || 'completed';
      }
    }
    const pending = [...open.values()].sort((a, b) => b.seq - a.seq)[0] || null;
    return { steps, pending, lastAssistant, turnStart, stopReason, lastEventAt, lastSeq };
  }

  async function agentEventsOf(sessionId) {
    const sc = ctx.get('sessionController');
    if (sc === undefined || typeof sc.inspect !== 'function') return { events: [], meta: null };
    try {
      const inspection = await sc.inspect(sessionId);
      return {
        events: (inspection && inspection.events) || [],
        meta: inspection && inspection.meta ? inspection.meta : null,
      };
    } catch (_error) {
      return { events: [], meta: null };
    }
  }

  function liveAgentStatus(sessionId) {
    let agent;
    try {
      const registry = ctx.get('agents');
      agent = registry && typeof registry.get === 'function' ? registry.get(sessionId) : undefined;
    } catch (_error) {
      agent = undefined;
    }
    if (agent === undefined) return { live: false, running: false };
    return { live: true, running: agent.status === 'running' };
  }

  /* One roster row. `label` prefers the durable catalog label; `current`
     answers the only question the status popup asks: what now? */
  async function describeAgentRow(row) {
    const now = Date.now();
    const id = row.id;
    const cached = agentSnapshotCache.get(id);
    if (cached !== undefined && now - cached.at < 800) return cached.value;
    const { events, meta } = await agentEventsOf(id);
    const digest = agentDigestFromEvents(events);
    const live = liveAgentStatus(id);
    const running = live.live ? live.running : false;
    const lastTurnClosed = digest.stopReason !== '' && digest.lastEventAt > 0;
    const ended = !running && (live.live ? lastTurnClosed : true);
    let current;
    if (running && digest.pending) {
      current = {
        kind: 'tool',
        name: digest.pending.name,
        text: digest.pending.detail ? digest.pending.detail : '',
        at: digest.pending.at,
      };
    } else if (running) {
      current = { kind: 'thinking', text: '', at: digest.turnStart || now };
    } else if (digest.lastAssistant) {
      current = { kind: 'message', text: digest.lastAssistant.slice(0, 200), at: digest.lastEventAt || now };
    } else {
      current = { kind: 'idle', text: '', at: now };
    }
    const startedAt = digest.turnStart || row.createdAt || now;
    const title = meta && typeof meta.title === 'string' && meta.title.trim() !== '' ? meta.title.trim() : '';
    const label = row.label || title || '子代理 · ' + shortAgentId(id);
    const value = {
      id,
      parentId: row.parentId || '',
      depth: typeof row.depth === 'number' ? row.depth : 1,
      mode: row.mode || 'continuable',
      label,
      // 子会话的创建时刻是「哪一轮派的」唯一可靠依据：一轮的轨迹只收本轮的子代理。
      createdAt: typeof row.createdAt === 'number' ? row.createdAt : startedAt,
      status: running ? 'running' : ended ? 'done' : 'idle',
      running,
      ended,
      startedAt,
      elapsedMs: Math.max(0, now - startedAt),
      steps: digest.steps,
      current,
      lastText: digest.lastAssistant.slice(0, 400),
      stopReason: digest.stopReason || '',
      lastEventAt: digest.lastEventAt,
      canWrite: false,
      seq: digest.lastSeq,
      events,
    };
    agentSnapshotCache.set(id, { at: now, value });
    if (agentSnapshotCache.size > 80) {
      const oldest = [...agentSnapshotCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) agentSnapshotCache.delete(oldest[0]);
    }
    return value;
  }

  function publicAgent(agent, withEvents) {
    const out = {
      id: agent.id,
      parentId: agent.parentId,
      depth: agent.depth,
      mode: agent.mode,
      label: agent.label,
      createdAt: agent.createdAt,
      status: agent.status,
      running: agent.running,
      ended: agent.ended,
      startedAt: agent.startedAt,
      elapsedMs: agent.elapsedMs,
      steps: agent.steps,
      current: agent.current,
      lastText: agent.lastText,
      stopReason: agent.stopReason,
      lastEventAt: agent.lastEventAt,
      canWrite: false,
      seq: agent.seq,
    };
    if (withEvents) out.events = agent.events;
    return out;
  }

  async function listChildRows(subs, rootSessionId, since) {
    // Prefer the direct-child catalog walk: `listChildren` rows keep
    // `createdAt`, which is how a turn tells its own children from history.
    // `listDescendants` is the fallback, and it drops that timestamp.
    if (typeof subs.listChildren === 'function') {
      const out = [];
      const queue = [{ id: rootSessionId, depth: 0 }];
      while (queue.length > 0 && out.length < 80) {
        const item = queue.shift();
        let children = [];
        try {
          children = await subs.listChildren(item.id, AbortSignal.timeout(2000));
        } catch (_error) {
          children = [];
        }
        for (const child of Array.isArray(children) ? children : []) {
          if (!child || typeof child.id !== 'string') continue;
          // 只走本轮的子代理：历史子会话不进队列，避免为一次轮询读十几个日志；
          // 仍在后台跑的老成员例外，它们还在做事。
          if (item.depth === 0 && since > 0 && typeof child.createdAt === 'number' && child.createdAt < since) {
            if (!liveAgentStatus(child.id).running) continue;
          }
          out.push({ ...child, kind: 'child', parentId: item.id, depth: item.depth + 1 });
          queue.push({ id: child.id, depth: item.depth + 1 });
        }
      }
      return out;
    }
    if (typeof subs.listDescendants === 'function') {
      const rows = await subs.listDescendants(rootSessionId, AbortSignal.timeout(4000));
      return Array.isArray(rows) ? rows : [];
    }
    return [];
  }

  async function collectAgentRoster(rootSessionId, options) {
    const now = Date.now();
    const since = options && typeof options.since === 'number' ? options.since : 0;
    const key = String(rootSessionId || '') + '|' + since;
    if (!options || !options.fresh) {
      const cached = agentRosterCache.get(key);
      if (cached !== undefined && now - cached.at < 700) return cached.value;
    }
    const subs = ctx.get('subagents');
    if (subs === undefined) {
      return { supported: false, agents: [], diagnostics: [], updatedAt: now };
    }
    let rows = [];
    let failure = '';
    try {
      rows = await listChildRows(subs, rootSessionId, since);
    } catch (error) {
      failure = error && error.message ? error.message : String(error);
    }
    const agents = [];
    const diagnostics = [];
    for (const row of rows) {
      if (!row || typeof row.id !== 'string') continue;
      if (row.kind !== 'child') {
        diagnostics.push({ id: row.id || '', parentId: row.parentId || '', depth: row.depth || 0, reason: row.reason || '' });
        continue;
      }
      // 先按轮次筛选，再读子会话日志：一轮的状态弹窗只付本轮子代理的钱。
      if (since > 0 && typeof row.createdAt === 'number' && row.createdAt < since) {
        const live = liveAgentStatus(row.id);
        if (!live.running) continue;
      }
      const agent = await describeAgentRow(row);
      agents.push(agent);
      if (agents.length >= 40) break;
    }
    agents.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    const value = {
      supported: true,
      agents,
      diagnostics: diagnostics.slice(0, 20),
      error: failure,
      updatedAt: now,
    };
    agentRosterCache.set(key, { at: now, value });
    if (agentRosterCache.size > 24) {
      const oldest = [...agentRosterCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) agentRosterCache.delete(oldest[0]);
    }
    return value;
  }

  /* Sessions listed outside any captain's catalog (the standalone swarm
     roster): describe each by its own log so the panel can still show
     what it is doing. */
  async function describeLooseSession(sessionId, labelHint) {
    const cached = agentSnapshotCache.get(sessionId);
    if (cached !== undefined && Date.now() - cached.at < 800) return cached.value;
    const agent = await describeAgentRow({
      id: sessionId,
      label: labelHint || '',
      mode: 'continuable',
      parentId: '',
      depth: 1,
      createdAt: Date.now(),
    });
    return agent;
  }

  function rememberSwarm(text, members) {
    const swarmId = 'swarm-' + randomUUID().slice(0, 8);
    swarmRuns.set(swarmId, { at: Date.now(), text, members: members.slice(0, 30) });
    if (swarmRuns.size > 30) {
      const oldest = [...swarmRuns.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) swarmRuns.delete(oldest[0]);
    }
    return swarmId;
  }

  async function swarmRoster(swarmId) {
    const run = swarmRuns.get(swarmId);
    if (run === undefined) return { ok: false, error: '蜂群任务不存在或已过期', agents: [] };
    if (Date.now() - run.at > 30 * 60 * 1000) {
      swarmRuns.delete(swarmId);
      return { ok: false, error: '蜂群任务已过期', agents: [] };
    }
    const agents = [];
    for (const member of run.members) {
      agents.push(await describeLooseSession(member.id, member.name));
    }
    return { ok: true, swarmId, text: run.text, agents, updatedAt: Date.now() };
  }

  async function allSessionRoster() {
    const sc = ctx.get('sessionController');
    if (sc === undefined || typeof sc.list !== 'function') return { ok: false, agents: [] };
    let items = [];
    try {
      const value = await sc.list({}, AbortSignal.timeout(5000));
      items = (value && value.items) || [];
    } catch (_error) {
      items = [];
    }
    const agents = [];
    for (const item of items.slice(0, 24)) {
      const id = item && (item.sessionId || item.id);
      if (typeof id !== 'string') continue;
      const label = item.title || item.summary || '';
      agents.push(await describeLooseSession(id, label));
    }
    return { ok: true, agents, updatedAt: Date.now() };
  }

  function publicRoster(roster, withEvents) {
    return {
      ok: true,
      supported: roster.supported !== false,
      agents: (roster.agents || []).map((agent) => publicAgent(agent, withEvents)),
      diagnostics: roster.diagnostics || [],
      error: roster.error || '',
      updatedAt: roster.updatedAt || Date.now(),
    };
  }

  async function handleAgentRoster(req, res, url) {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' });
    const sessionId = (url.searchParams.get('sessionId') || '').trim();
    const swarmId = (url.searchParams.get('swarmId') || '').trim();
    const scope = (url.searchParams.get('scope') || '').trim();
    const ids = (url.searchParams.get('ids') || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^[a-zA-Z0-9._:-]{1,80}$/u.test(id))
      .slice(0, 30);
    try {
      if (swarmId !== '') {
        const roster = await swarmRoster(swarmId);
        return sendJson(res, roster.ok ? 200 : 404, roster);
      }
      if (sessionId !== '') {
        const roster = await collectAgentRoster(sessionId, { fresh: url.searchParams.get('fresh') === '1' });
        return sendJson(res, 200, publicRoster(roster, url.searchParams.get('events') === '1'));
      }
      if (ids.length > 0) {
        const agents = [];
        for (const id of ids) agents.push(publicAgent(await describeLooseSession(id, '')));
        return sendJson(res, 200, { ok: true, agents, updatedAt: Date.now() });
      }
      if (scope === 'all') {
        const roster = await allSessionRoster();
        return sendJson(res, roster.ok ? 200 : 503, {
          ok: roster.ok,
          agents: (roster.agents || []).map((agent) => publicAgent(agent)),
          updatedAt: roster.updatedAt || Date.now(),
          error: roster.ok ? '' : 'DSH session controller 不可用',
        });
      }
      return sendJson(res, 400, { ok: false, error: 'sessionId, swarmId, ids or scope is required' });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error && error.message ? error.message : String(error), agents: [] });
    }
  }

  /* Translate child Session events into the same NDJSON vocabulary the
     desktop already renders for the captain. `agent` carries the child id
     so tools land under that node instead of the main feed. */
  function emitChildEvent(agentId, event, emit) {
    if (!event) return;
    const data = event.data;
    if (event.type === 'tool/call') {
      emit({
        type: 'tool',
        phase: 'call',
        agent: agentId,
        callId: (data && data.callId) || '',
        text: (data && data.name) || 'tool',
        detail: (data && data.arguments) || '',
      });
      return;
    }
    if (event.type === 'tool/result') {
      const ok = !(data && (data.error || (data.message && data.message.isError)));
      emit({
        type: 'tool',
        phase: 'result',
        agent: agentId,
        callId: data && data.message ? data.message.toolCallId : '',
        ok,
        text: toolResultText(data),
        detail: toolResultText(data),
      });
    }
  }

  /* Follow the captain's descendant forest while its turn runs. Start and
     end edges come from the roster's live state; tool traffic comes from
     each child's own event tail. The watcher never outlives the response. */
  function watchAgentTree(rootSessionId, emit, signal, options) {
    const states = new Map();
    let stopped = false;
    let rosterHash = '';
    // 子代理目录是整条会话的历史；运行轨迹只收这一轮派的，或者此刻还在跑的。
    const since = options && typeof options.since === 'number' ? options.since : 0;
    const deadline = Date.now() + 15 * 60 * 1000;
    const tick = async () => {
      if (stopped || signal.aborted) return;
      let roster;
      try {
        roster = await collectAgentRoster(rootSessionId, { fresh: true, since });
      } catch (_error) {
        return;
      }
      const agents = (roster.agents || []).filter((agent) => (
        since === 0 || agent.status === 'running' || !agent.createdAt || agent.createdAt >= since
      ));
      const runningCount = agents.filter((agent) => agent.status === 'running').length;
      for (const agent of agents) {
        const previous = states.get(agent.id);
        const agentId = agent.id;
        if (previous === undefined) {
          emit({
            type: 'subagent',
            phase: 'start',
            agent: agentId,
            parent: agent.parentId,
            label: agent.label,
            mode: agent.mode,
            depth: agent.depth,
          });
          states.set(agentId, {
            label: agent.label,
            status: agent.status,
            seq: 0,
            ended: agent.ended,
            steps: agent.steps,
          });
          const state = states.get(agentId);
          for (const event of (agent.events || []).slice(-40)) {
            if (typeof event.seq === 'number' && event.seq <= state.seq) continue;
            emitChildEvent(agentId, event, emit);
            if (typeof event.seq === 'number' && event.seq > state.seq) state.seq = event.seq;
          }
          continue;
        }
        if (previous.label !== agent.label) {
          previous.label = agent.label;
          emit({
            type: 'subagent',
            phase: 'label',
            agent: agentId,
            parent: agent.parentId,
            label: agent.label,
          });
        }
        for (const event of (agent.events || []).slice(-60)) {
          if (typeof event.seq === 'number' && event.seq <= previous.seq) continue;
          emitChildEvent(agentId, event, emit);
          if (typeof event.seq === 'number' && event.seq > previous.seq) previous.seq = event.seq;
        }
        const wasRunning = previous.status === 'running';
        if (agent.status === 'running') {
          previous.status = 'running';
          previous.ended = false;
        } else if (wasRunning || (!previous.ended && agent.ended)) {
          previous.status = agent.status;
          previous.ended = agent.ended;
          emit({
            type: 'subagent',
            phase: 'end',
            agent: agentId,
            parent: agent.parentId,
            label: agent.label,
            text: agent.stopReason || (agent.status === 'done' ? 'completed' : ''),
            detail: agent.lastText || '',
          });
        }
      }
      const hash = agents
        .map((agent) => [agent.id, agent.status, agent.steps, agent.current && agent.current.kind, agent.current && agent.current.text].join(':'))
        .join('|');
      if (hash !== rosterHash) {
        rosterHash = hash;
        emit({ type: 'agents', agents: agents.map((agent) => publicAgent(agent)) });
      }
      // The captain's response usually closes before background children do.
      // Keep observing while the response is open: a child may start after a
      // quiet tick, and that late start is exactly what the rail must show.
      if (runningCount === 0 && Date.now() > deadline) stop();
    };
    const timer = setInterval(() => { void tick(); }, 1200);
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    };
    void tick();
    return stop;
  }

  async function handleAgentConversation(req, res, url) {
    const sessionId = (url.searchParams.get('sessionId') || '').trim()
    if (sessionId === '') return sendJson(res, 400, { ok: false, error: 'sessionId is required' })
    const requestedTitle = (url.searchParams.get('title') || '').trim()
    const sc = ctx.get('sessionController')
    if (sc === undefined) return sendJson(res, 503, { ok: false, error: 'DSH session controller 不可用' })
    try {
      const cached = conversationCache.get(sessionId)
      let snapshot
      if (cached !== undefined && Date.now() - cached.at < 1000) {
        snapshot = cached.snapshot
      } else {
        const inspection = await sc.inspect(sessionId)
        const events = (inspection && inspection.events ? inspection.events : []).slice(-800)
        const items = transcriptFromEvents(events)
        const last = events[events.length - 1]
        const recent = last && typeof last.time === 'number' && Date.now() - last.time < 15000
        // 这一轮的起点：状态弹窗只回答「本轮派的子代理」，历史留在会话本身里。
        let turnStartAt = 0
        for (const event of events) {
          if (event && event.type === 'turn/start' && typeof event.time === 'number' && event.time > turnStartAt) turnStartAt = event.time
        }
        snapshot = {
          items,
          running: !!(last && last.type !== 'turn/end' && recent),
          updatedAt: last && last.time ? last.time : Date.now(),
          turnStartAt,
        }
        conversationCache.set(sessionId, { at: Date.now(), snapshot })
        if (conversationCache.size > 12) {
          const oldest = [...conversationCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
          if (oldest) conversationCache.delete(oldest[0])
        }
      }
      const items = snapshot.items
      const firstUser = items.find(item => item.role === 'user')
      // The popup's status drawer reads the same durable catalog as the
      // desktop rail, so both surfaces answer from one source.
      let agents = []
      try {
        const since = typeof snapshot.turnStartAt === 'number' ? snapshot.turnStartAt : 0
        const roster = await collectAgentRoster(sessionId, { since })
        agents = (roster.agents || []).map(agent => publicAgent(agent))
      } catch (_error) {
        agents = []
      }
      sendJson(res, 200, {
        ok: true,
        sessionId,
        title: requestedTitle || (firstUser ? truncateText(firstUser.text.replace(/\s+/gu, ' '), 40) : 'DSH 会话'),
        items,
        agents,
        running: snapshot.running || agents.some(agent => agent.running),
        updatedAt: snapshot.updatedAt,
      })
    } catch (error) {
      sendJson(res, 404, { ok: false, error: error && error.message ? error.message : 'session unavailable' })
    }
  }

  async function handleSwarm(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
    let body
    try { body = await readJsonBody(req, 512 * 1024) } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }) }
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (text === '') return sendJson(res, 400, { ok: false, error: '指令为空' })
    if (text.length > 16000) return sendJson(res, 400, { ok: false, error: '指令过长' })
    const sc = ctx.get('sessionController')
    if (sc === undefined) return sendJson(res, 503, { ok: false, error: 'DSH session controller 不可用' })
    const captainSessionId = typeof body.captainSessionId === 'string' ? body.captainSessionId.trim() : ''
    let captain
    const subagents = ctx.get('subagents')
    if (subagents !== undefined && captainSessionId !== '') {
      try {
        const resolved = await sc.resolveAgent(captainSessionId)
        if (resolved && resolved.agent) captain = resolved.agent
      } catch (_error) {
        captain = undefined
      }
    }
    const seen = new Set()
    const members = []
    for (const item of Array.isArray(body.members) ? body.members : []) {
      if (!item || typeof item.id !== 'string' || item.id.trim() === '' || seen.has(item.id)) continue
      seen.add(item.id)
      members.push({ id: item.id.trim(), name: typeof item.name === 'string' ? item.name : '' })
      if (members.length >= 30) break
    }
    if (members.length === 0) return sendJson(res, 400, { ok: false, error: '没有可接收的成员' })
    const delivered = []
    const failed = []
    await Promise.all(members.map(async (member) => {
      try {
        if (subagents !== undefined && captain !== undefined && typeof subagents.sendMessage === 'function') {
          await subagents.sendMessage(captain, member.id, [{ type: 'text', text }], {})
        } else {
          await sc.prompt({
            requestId: randomUUID(),
            sessionId: member.id,
            mode: 'queue',
            content: [{ type: 'text', text }],
            clientTimeZone: safeTimeZone(),
          }, AbortSignal.timeout(30000))
        }
        delivered.push(member.name || member.id)
      } catch (error) {
        failed.push({ name: member.name || member.id, error: error && error.message ? error.message : String(error) })
      }
    }))
    // Remember the fan-out so the cluster panel can poll live worker activity
    // without pretending these sessions are an AgentTeams team.
    const swarmId = rememberSwarm(text, members)
    sendJson(res, 200, { ok: true, swarmId, delivered, failed, total: members.length })
  }

  async function handleAgentSend(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
    let body
    try { body = await readJsonBody(req, 512 * 1024) } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }) }
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (sessionId === '' || text === '') return sendJson(res, 400, { ok: false, error: 'sessionId and text are required' })
    const sc = ctx.get('sessionController')
    if (sc === undefined) return sendJson(res, 503, { ok: false, error: 'DSH session controller 不可用' })
    try {
      await sc.prompt({
        requestId: randomUUID(),
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
        clientTimeZone: safeTimeZone(),
      }, AbortSignal.timeout(30000))
      sendJson(res, 200, { ok: true, accepted: true })
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error && error.message ? error.message : String(error) })
    }
  }

  async function handleContainers(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
    let body
    try { body = await readJsonBody(req, 256 * 1024) } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }) }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name === '') return sendJson(res, 400, { ok: false, error: '容器名称不能为空' })
    let slug = slugify(name, 'container').toLowerCase()
    if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(slug)) slug = 'container'
    const root = containerRootOf(home())
    let dir = path.join(root, slug)
    for (let index = 2; existsSync(dir); index += 1) dir = path.join(root, slug + '-' + index)
    try {
      await fsp.mkdir(dir, { recursive: true })
      await writeAtomic(path.join(dir, 'README.md'), '# ' + name + '\n\nNexlOS 容器空间：由 DSH 工作区承载，供 agent 与用户共同读写。\n')
      let workspace = null
      const registry = ctx.get('workspaceRegistry')
      if (registry !== undefined) {
        try { workspace = await registry.create(dir, name) } catch (_error) { workspace = null }
      }
      const uiSessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      if (uiSessionId !== '') {
        const prefs = await loadAgentPrefs()
        const from = typeof body.copyFrom === 'string' ? prefsOf(prefs, body.copyFrom) : {}
        const pref = { ...from, container: dir }
        prefs[uiSessionId] = pref
        await saveAgentPrefs()
      }
      pickerStaticCache = { at: 0 }
      sendJson(res, 200, {
        ok: true,
        name,
        path: dir,
        workspace: workspace ? { id: workspace.id, title: workspace.title, path: workspace.path } : null,
        containers: {
          current: dir,
          root,
          workspaces: registry === undefined ? [] : registry.list().map(item => ({ id: item.id, title: item.title, path: item.path })),
        },
      })
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error && error.message ? error.message : String(error) })
    }
  }

  async function handleContainerSelect(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
    let body
    try { body = await readJsonBody(req, 64 * 1024) } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }) }
    const target = typeof body.path === 'string' ? path.resolve(body.path) : ''
    if (target === '' || !existsSync(target)) return sendJson(res, 400, { ok: false, error: '容器目录不存在' })
    const root = containerRootOf(home())
    let allowed = inside(root, target) || target === home()
    if (!allowed) {
      try {
        const registry = ctx.get('workspaceRegistry')
        const rows = registry === undefined ? [] : registry.list()
        allowed = rows.some(item => path.resolve(item.path) === target)
      } catch (_error) {
        allowed = false
      }
    }
    if (!allowed) return sendJson(res, 403, { ok: false, error: '只能选择 NexlOS 容器或已注册的 DSH 工作区' })
    const uiSessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    if (uiSessionId !== '') {
      const prefs = await loadAgentPrefs()
      const from = typeof body.copyFrom === 'string' ? prefsOf(prefs, body.copyFrom) : {}
      prefs[uiSessionId] = { ...from, container: target }
      await saveAgentPrefs()
    }
    sendJson(res, 200, { ok: true, current: target })
  }

  let pickerStaticCache = { at: 0 }
  const pickerAgentCache = new Map()

  async function resolveAgentCached(sc, sessionId) {
    const hit = pickerAgentCache.get(sessionId)
    if (hit !== undefined && Date.now() - hit.at < 5000) return hit.value
    const value = await sc.resolveAgent(sessionId)
    pickerAgentCache.set(sessionId, { at: Date.now(), value })
    return value
  }

  async function pickerStatic(sc, permissions, registry) {
    if (Date.now() - pickerStaticCache.at < 30000) return pickerStaticCache
    let modelCatalog
    let permissionCatalog
    let workspaces = []
    try { modelCatalog = sc === undefined ? undefined : await sc.modelCatalog() } catch (_error) { modelCatalog = undefined }
    try { permissionCatalog = permissions === undefined ? undefined : permissions.catalog() } catch (_error) { permissionCatalog = undefined }
    try { workspaces = registry === undefined ? [] : registry.list().map(item => ({ id: item.id, title: item.title, path: item.path })) } catch (_error) { workspaces = [] }
    pickerStaticCache = { at: Date.now(), modelCatalog, permissionCatalog, workspaces }
    return pickerStaticCache
  }

  async function handleAgentPicker(req, res, url) {
    const uiSessionId = url.searchParams.get('sessionId') || ''
    const map = await loadSessionMap()
    const dshSessionId = map.get(uiSessionId)
    const sc = ctx.get('sessionController')
    const permissions = ctx.get('permissionPresets')
    const projections = ctx.get('sessionProjections')
    let agent
    let sessionPresent = false
    if (dshSessionId !== undefined && sc !== undefined) {
      try {
        const resolved = await resolveAgentCached(sc, dshSessionId)
        if (resolved && resolved.agent) {
          agent = resolved.agent
          sessionPresent = true
        }
      } catch (_error) {
        sessionPresent = false
      }
    }
    const staticData = await pickerStatic(sc, permissions, ctx.get('workspaceRegistry'))
    const modelCatalog = staticData.modelCatalog
    const permissionCatalog = staticData.permissionCatalog
    let currentModel
    if (agent) {
      if (projections !== undefined) {
        try {
          const snapshot = projections.snapshot(agent.session, ['modelSelection'])
          const selection = snapshot.values.modelSelection
          if (selection) currentModel = selection.next || selection.lastUsed || undefined
        } catch (_error) { currentModel = undefined }
      }
      if (currentModel === undefined) {
        try {
          const header = agent.session.requestHeader()
          if (header && header.config) currentModel = { ...header.config }
        } catch (_error) { currentModel = undefined }
      }
    }
    let currentPermission
    if (agent && permissions !== undefined) {
      try { currentPermission = permissions.current(agent.session) } catch (_error) { currentPermission = undefined }
    }
    const prefs = await loadAgentPrefs()
    const pref = prefsOf(prefs, uiSessionId)
    if (!sessionPresent && pref.model) currentModel = pref.model
    if (!sessionPresent && typeof pref.permission === 'string') currentPermission = pref.permission
    if (currentModel === undefined) {
      try {
        const fallback = ctx.get('agentDefaultModel')
        if (fallback && typeof fallback.currentSelection === 'function') currentModel = fallback.currentSelection()
      } catch (_error) { currentModel = undefined }
    }
    if (currentModel === undefined && modelCatalog) currentModel = modelCatalog.default
    if (currentPermission === undefined && permissionCatalog) currentPermission = permissionCatalog.defaultPreset
    const registry = ctx.get('workspaceRegistry')
    const workspaces = staticData.workspaces
    const containerPref = prefsOf(prefs, uiSessionId)
    sendJson(res, 200, {
      ok: true,
      sessionPresent,
      dshSessionPresent: dshSessionId !== undefined,
      modelCatalog: modelCatalog || null,
      currentModel: currentModel || null,
      permissionCatalog: permissionCatalog || null,
      currentPermission: currentPermission || null,
      containers: {
        root: containerRootOf(home()),
        home: home(),
        current: typeof containerPref.container === 'string' && containerPref.container !== '' ? containerPref.container : home(),
        workspaces,
      },
    })
  }

  async function handleAgentModel(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
    let body
    try { body = await readJsonBody(req, 256 * 1024) } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }) }
    const uiSessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const provider = typeof body.provider === 'string' ? body.provider.trim() : ''
    const model = typeof body.model === 'string' ? body.model.trim() : ''
    const reasoningEffort = typeof body.reasoningEffort === 'string' && body.reasoningEffort !== '' ? body.reasoningEffort : undefined
    if (provider === '' || model === '') return sendJson(res, 400, { ok: false, error: 'provider and model are required' })
    const prefs = await loadAgentPrefs()
    const pref = prefsOf(prefs, uiSessionId)
    const selection = { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
    pref.model = selection
    prefs[uiSessionId] = pref
    await saveAgentPrefs()
    const sc = ctx.get('sessionController')
    const map = await loadSessionMap()
    const dshSessionId = map.get(uiSessionId)
    let applied = false
    let warning = ''
    if (sc !== undefined && dshSessionId !== undefined) {
      try {
        await sc.selectModel({ sessionId: dshSessionId, ...selection })
        applied = true
      } catch (error) {
        warning = error && error.message ? error.message : String(error)
      }
    }
    sendJson(res, 200, { ok: true, applied, warning, selected: selection })
  }

  async function handleAgentPermission(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
    let body
    try { body = await readJsonBody(req, 256 * 1024) } catch (error) { return sendJson(res, 400, { ok: false, error: error.message }) }
    const uiSessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const preset = typeof body.preset === 'string' ? body.preset.trim() : ''
    if (preset === '') return sendJson(res, 400, { ok: false, error: 'preset is required' })
    const prefs = await loadAgentPrefs()
    const pref = prefsOf(prefs, uiSessionId)
    pref.permission = preset
    prefs[uiSessionId] = pref
    await saveAgentPrefs()
    const permissions = ctx.get('permissionPresets')
    const sc = ctx.get('sessionController')
    const map = await loadSessionMap()
    const dshSessionId = map.get(uiSessionId)
    let applied = false
    let warning = ''
    if (permissions !== undefined && sc !== undefined && dshSessionId !== undefined) {
      try {
        const resolved = await sc.resolveAgent(dshSessionId)
        if (resolved && resolved.agent) {
          permissions.set(resolved.agent.session, preset)
          applied = true
        }
      } catch (error) {
        warning = error && error.message ? error.message : String(error)
      }
    }
    sendJson(res, 200, { ok: true, applied, warning, preset })
  }

  async function handleStop(req, res) {
    let body = {}
    try {
      body = await readJsonBody(req, 64 * 1024)
    } catch (_error) {
      body = {}
    }
    const uiSessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    let stopped = false
    for (const [key, active] of activeChats) {
      if (uiSessionId !== '' && key !== uiSessionId) continue
      const sc = ctx.get('sessionController')
      if (sc !== undefined && typeof active.sessionId === 'string') {
        try {
          sc.cancel({ sessionId: active.sessionId })
          stopped = true
        } catch (_error) {
          /* fall through to the abort */
        }
      }
      active.controller.abort()
    }
    sendJson(res, 200, { ok: true, durable: false, stopped })
  }

  async function runCommand(cmd, context) {
    const fields = context.fields || {}
    const query = context.query || {}
    const space = context.space || ''
    const root = home()
    switch (cmd) {
      case 'settings.get': {
        return { detail: await loadSettings(root) }
      }
      case 'settings.set': {
        const current = await loadSettings(root)
        const next = pickSettings(fields, current)
        await writeJson(settingsFile(root), next)
        if (fields.language !== undefined) uiLanguageCache.at = 0
        return { detail: next }
      }
      case 'app.list': {
        const generated = await generatedApps()
        const apps = appManifest().concat(generated)
        return { append: apps, detail: { count: apps.length } }
      }
      case 'app.open': {
        const id = String(fields.app || query.app || '')
        if (id === '') throw new Error('missing app id')
        const app = (await generatedApps()).find(item => item.id === id)
        if (!app) throw new Error('找不到这个生成应用')
        return { detail: {
          embed: true, url: app.entry, name: app.name, window: app.window,
          message: '已打开 ' + app.name,
        } }
      }
      case 'system.status': {
        const books = await listBooks(root)
        return {
          detail: {
            version: 'NexlOS-On-DSH',
            home: root,
            uptime_s: Math.round((Date.now() - TEAM_STARTED_AT) / 1000),
            runtime: 'DeepSeek Harness ' + process.versions.node,
            platform: process.platform + '/' + process.arch,
            commands: COMMAND_HELP.length,
            spaces: books.length,
          },
          append: COMMAND_HELP,
        }
      }
      case 'workspace.info': {
        const configFile = path.join(root, 'workspace.json')
        let workspace = await readJson(configFile, undefined)
        if (workspace === undefined || workspace === null) {
          workspace = { id: 'nexlos-on-dsh', createdAt: isoNow(), device: 'DSH', platform: process.platform, quotaBytes: 1024 * 1024 * 1024 }
          await writeJson(configFile, workspace)
        }
        const usage = await dirUsage(root)
        const quota = Number(workspace.quotaBytes) || 1024 * 1024 * 1024
        return {
          detail: {
            root,
            config: configFile,
            id: workspace.id || 'nexlos-on-dsh',
            createdAt: workspace.createdAt || isoNow(),
            device: workspace.device || 'DSH',
            platform: workspace.platform || process.platform,
            quotaBytes: quota,
            usedBytes: usage.bytes,
            files: usage.files,
            freeBytes: Math.max(0, quota - usage.bytes),
            totalBytes: quota,
            dirs: [{ path: '/', exists: true }],
          },
        }
      }
      case 'workspace.quota': {
        const quotaFile = path.join(root, 'workspace.json')
        const workspace = await readJson(quotaFile, { id: 'nexlos-on-dsh', createdAt: isoNow(), device: 'DSH', platform: process.platform, quotaBytes: 1024 * 1024 * 1024 })
        const mb = Number(fields.mb)
        if (!Number.isInteger(mb) || mb <= 0) throw new Error('mb 必须是正整数')
        workspace.quotaBytes = mb * 1024 * 1024
        await writeJson(quotaFile, workspace)
        return { detail: { quotaBytes: workspace.quotaBytes, mb } }
      }
      case 'workspace.repair': {
        await fsp.mkdir(root, { recursive: true })
        return { detail: { root, layout: ['.'] } }
      }
      case 'workspace.reveal': {
        return { detail: { root, revealed: false } }
      }
      case 'fs.list': {
        const { vpath, absolute } = resolveVirtual(root, query.path || fields.path || '/')
        const showHidden = fields.hidden === true || query.hidden === '1' || query.hidden === 'true'
        const soft = fields.soft === true || query.soft === '1' || query.soft === 'true'
        let entries
        try {
          entries = await fsp.readdir(absolute, { withFileTypes: true })
        } catch (error) {
          if (soft && error.code === 'ENOENT') return { fields: { exists: false }, append: [], detail: { path: vpath } }
          throw new Error('读不到这个文件夹：' + error.message)
        }
        const rows = []
        let folders = 0
        let files = 0
        let bytes = 0
        for (const entry of entries) {
          const name = entry.name
          if (HIDDEN_DIRS.has(name)) continue
          if (!showHidden && (name.startsWith('.') || HIDDEN_FILES.has(name))) continue
          if (showHidden && HIDDEN_FILES.has(name)) continue
          const child = path.join(absolute, name)
          const info = await pathStat(child)
          if (info === undefined) continue
          const ext = path.extname(name).toLowerCase()
          const row = { name, mod: isoTime(info.mtimeMs), size: info.size, ext }
          if (entry.isDirectory()) {
            row.kind = 'folder'
            row.kindLabel = '文件夹'
            row.size = 0
            folders += 1
          } else {
            row.kind = 'file'
            row.kindLabel = KIND_LABELS[ext] || '文件'
            files += 1
            bytes += info.size
          }
          rows.push(row)
        }
        rows.sort((left, right) => {
          if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
          return left.name.toLowerCase().localeCompare(right.name.toLowerCase())
        })
        return {
          append: rows,
          detail: { path: vpath, parent: parentVPath(vpath), crumbs: crumbsOf(vpath), folders, files, bytes, hiddenShown: showHidden },
        }
      }
      case 'fs.read': {
        const { vpath, absolute } = resolveVirtual(root, query.path || fields.path || '')
        const info = await pathStat(absolute)
        if (info === undefined || info.isDirectory()) throw new Error('这不是一个文件')
        const ext = path.extname(absolute).toLowerCase()
        const detail = {
          path: vpath,
          name: path.basename(absolute),
          size: info.size,
          mod: isoTime(info.mtimeMs),
          ext,
          kindLabel: KIND_LABELS[ext] || '文件',
          text: '',
          textual: TEXT_EXT.has(ext),
        }
        if (!TEXT_EXT.has(ext)) return { detail }
        if (info.size > 256 * 1024) throw new Error('文件超过 256KB，NexlOS 不在这里打开')
        detail.text = await fsp.readFile(absolute, 'utf8')
        return { detail }
      }
      case 'fs.write': {
        const { vpath, absolute } = resolveVirtual(root, fields.path)
        if (vpath.endsWith('/')) throw new Error('这是一个文件夹')
        const ext = path.extname(absolute).toLowerCase()
        if (!TEXT_EXT.has(ext)) throw new Error('NexlOS 只在这里保存文本文件')
        const text = String(fields.text || '')
        if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('文本超过 1MB')
        await writeAtomic(absolute, text)
        return { detail: { path: vpath, bytes: Buffer.byteLength(text) } }
      }
      case 'fs.mkdir': {
        const parent = query.path || fields.path || '/'
        const name = String(fields.name || query.name || '').trim()
        if (!validChildName(name)) throw new Error('文件夹名不合法')
        const { vpath, absolute } = resolveVirtual(root, parent)
        const target = path.join(absolute, name)
        if (existsSync(target)) throw new Error('已经有同名的项目')
        await fsp.mkdir(target, { recursive: false })
        return { detail: { path: vpath === '/' ? '/' + name : vpath + '/' + name, created: true } }
      }
      case 'fs.put': {
        const { vpath, absolute } = resolveVirtual(root, fields.path)
        if (vpath.endsWith('/')) throw new Error('这是一个文件夹')
        const text = String(fields.base64 || '')
        if (text === '') throw new Error('没有收到文件内容')
        const buffer = Buffer.from(text, 'base64')
        if (buffer.byteLength > 6 * 1024 * 1024) throw new Error('文件超过 6MB')
        await fsp.mkdir(path.dirname(absolute), { recursive: true })
        await fsp.writeFile(absolute, buffer)
        return { detail: { path: vpath, bytes: buffer.byteLength } }
      }
      case 'fs.base64': {
        const { vpath, absolute } = resolveVirtual(root, query.path || fields.path)
        const info = await pathStat(absolute)
        if (info === undefined || info.isDirectory()) throw new Error('这不是一个文件')
        if (info.size > 6 * 1024 * 1024) throw new Error('文件超过 6MB')
        const buffer = await fsp.readFile(absolute)
        return { detail: { path: vpath, name: path.basename(absolute), size: info.size, base64: buffer.toString('base64') } }
      }
      case 'fs.rename': {
        const from = resolveVirtual(root, fields.from)
        const to = resolveVirtual(root, fields.to)
        if (from.vpath === '/' || to.vpath === '/') throw new Error('不能移动工作区根目录')
        if (from.absolute === to.absolute) return { detail: { from: from.vpath, to: to.vpath } }
        if (existsSync(to.absolute)) throw new Error('目标已存在，先换个名字')
        await fsp.rename(from.absolute, to.absolute)
        return { detail: { from: from.vpath, to: to.vpath } }
      }
      case 'fs.copy': {
        const from = resolveVirtual(root, fields.from)
        const to = resolveVirtual(root, fields.to)
        await fsp.cp(from.absolute, to.absolute, { recursive: true, errorOnExist: true, force: false })
        return { detail: { from: from.vpath, to: to.vpath } }
      }
      case 'fs.delete': {
        const list = Array.isArray(fields.paths) ? fields.paths : [fields.path || query.path]
        const trash = fields.trash !== false
        let deleted = 0
        for (const item of list) {
          if (typeof item !== 'string' || item === '') continue
          const { vpath, absolute } = resolveVirtual(root, item)
          if (vpath === '/') throw new Error('不能删除工作区根目录')
          if (!existsSync(absolute)) continue
          if (trash) {
            const target = path.join(root, '.trash', isoDir(Date.now()) + '-' + path.basename(absolute))
            await fsp.mkdir(path.dirname(target), { recursive: true })
            await fsp.rename(absolute, target)
          } else {
            await fsp.rm(absolute, { recursive: true, force: true })
          }
          deleted += 1
        }
        return { detail: { deleted } }
      }
      case 'fs.usage': {
        let entries
        try {
          entries = await fsp.readdir(root, { withFileTypes: true })
        } catch (error) {
          throw new Error('读不到 NexlOS 目录：' + error.message)
        }
        const rows = []
        let grand = 0
        let count = 0
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.') || HIDDEN_DIRS.has(entry.name)) continue
          const usage = await dirUsage(path.join(root, entry.name))
          grand += usage.bytes
          count += usage.files
          rows.push({ name: entry.name, bytes: usage.bytes, files: usage.files })
        }
        rows.sort((left, right) => right.bytes - left.bytes)
        return { append: rows, detail: { home: root, bytes: grand, files: count } }
      }
      case 'novel.list': {
        const books = await listBooks(root)
        return {
          append: books,
          detail: { count: books.length, words: books.reduce((sum, book) => sum + (Number(book.words) || 0), 0) },
        }
      }
      case 'novel.create': {
        const book = await createBook(root, fields)
        return { append: [book], detail: { created: book.id } }
      }
      case 'novel.open': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const book = await readBook(root, id)
        const chapters = await chapterRows(root, id)
        const outline = await outlineText(root, id)
        const cast = await castRows(root, id)
        return {
          fields: { book: { ...book, id } },
          append: chapters,
          detail: {
            outlineWords: countWords(outline),
            cast: cast.length,
            words: chapters.reduce((sum, chapter) => sum + chapter.words, 0),
          },
        }
      }
      case 'novel.update': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const current = await readBook(root, id)
        const next = { ...current }
        for (const key of ['title', 'author', 'premise', 'tags']) if (key in fields) next[key] = fields[key]
        next.updatedAt = isoNow()
        await writeJson(path.join(bookDir(root, id), 'book.json'), next)
        return { fields: { book: next } }
      }
      case 'chapter.list': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const chapters = await chapterRows(root, id)
        return { append: chapters, detail: { count: chapters.length, words: chapters.reduce((sum, chapter) => sum + chapter.words, 0) } }
      }
      case 'chapter.create': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const chapter = await createChapter(root, id, fields.title || fields.name)
        return { append: [chapter], detail: { created: chapter.file } }
      }
      case 'chapter.read': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const file = query.chapter || fields.chapter
        const chapter = await readChapter(root, id, file)
        return { fields: { chapter }, detail: { words: chapter.words } }
      }
      case 'chapter.save': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const file = fields.chapter || query.chapter
        if (fields.snapshot === '1') {
          try {
            const old = await readChapter(root, id, file)
            const snapshots = path.join(bookDir(root, id), 'snapshots')
            await fsp.mkdir(snapshots, { recursive: true })
            const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace('T', 'T').replace('Z', '')
            await writeAtomic(path.join(snapshots, stamp + '-' + String(file)), old.text)
          } catch (_error) {
            /* first save has no snapshot */
          }
        }
        const saved = await saveChapter(root, id, file, fields.text)
        return { fields: { saved }, detail: { words: saved.words, title: saved.title } }
      }
      case 'chapter.remove': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const file = fields.chapter || query.chapter
        if (!validChapterFile(file)) throw new Error('章节文件名不合法')
        await fsp.rm(path.join(bookDir(root, id), 'chapters', String(file)))
        await toucBook(root, id)
        return { detail: { file } }
      }
      case 'outline.read': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const text = await outlineText(root, id)
        return { text, detail: { words: countWords(text) } }
      }
      case 'outline.save': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const words = await saveOutline(root, id, fields.text)
        return { detail: { words } }
      }
      case 'cast.list': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const cast = await castRows(root, id)
        return { append: cast, detail: { count: cast.length } }
      }
      case 'cast.save': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const count = await saveCast(root, id, fields.cast)
        return { detail: { count } }
      }
      case 'export.markdown': {
        const id = context.space || query.space || fields.space
        if (!id) throw new Error('missing space')
        const exported = await exportMarkdown(root, id)
        if (query.download === '1') {
          return {
            text: exported.markdown,
            detail: { filename: exported.filename, chapters: exported.chapters, bytes: Buffer.byteLength(exported.markdown) },
            download: { filename: exported.filename, content: exported.markdown, contentType: 'text/markdown; charset=utf-8' },
          }
        }
        return {
          text: exported.markdown,
          detail: { filename: exported.filename, chapters: exported.chapters, bytes: Buffer.byteLength(exported.markdown) },
        }
      }
      case 'media.resolve': {
        const raw = query.url || fields.url || ''
        let parsed
        try { parsed = new URL(raw) } catch (_error) { throw new Error('地址格式不对') }
        if (!/^https?:$/u.test(parsed.protocol)) throw new Error('只支持 http/https 媒体链接')
        const target = parsed.toString()
        const lower = target.toLowerCase()
        if (/\.(m3u8)(\?|#|$)/u.test(lower)) return { detail: { result: { kind: 'hls', url: target } } }
        if (/\.(mp4|m4v|webm|ogv|ogg|mov|mp3|m4a|wav|flac|aac|opus)(\?|#|$)/u.test(lower)) {
          return { detail: { result: { kind: 'direct', url: target, title: decodeURIComponent(target.split('/').pop() || '') } } }
        }
        let matched = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/u.exec(target)
        if (matched) return { detail: { result: { kind: 'embed', url: 'https://www.youtube.com/embed/' + matched[1], title: 'YouTube' } } }
        matched = /vimeo\.com\/(?:video\/)?(\d+)/u.exec(target)
        if (matched) return { detail: { result: { kind: 'embed', url: 'https://player.vimeo.com/video/' + matched[1], title: 'Vimeo' } } }
        matched = /bilibili\.com\/video\/(BV[\w]+)/u.exec(target)
        if (matched) return { detail: { result: { kind: 'embed', url: 'https://player.bilibili.com/player.html?bvid=' + matched[1] + '&autoplay=0', title: '哔哩哔哩' } } }
        throw new Error('这个链接解析不到可播放的片源；可直接粘贴 mp4/mp3 直链，或使用受支持的平台页面')
      }
      case 'term.info':
      case 'term.open':
      case 'term.status':
      case 'term.input':
      case 'term.resize':
      case 'term.ack':
      case 'term.close': {
        return await handleTerminalCommand(cmd, fields)
      }
      case 'graph.index': {
        return { detail: await graphIndex(root) }
      }
      case 'graph.note': {
        const rel = fields.path || query.path || ''
        return { detail: await graphNote(root, rel) }
      }
      case 'memory.tree': {
        const rows = await memoryRows(root)
        const areas = {}
        for (const row of rows) areas[row.area] = (areas[row.area] || 0) + 1
        return { append: rows, detail: { root: '/memory', absRoot: memoryRootOf(root), count: rows.length, areas } }
      }
      case 'memory.read': {
        const rel = memoryVirtualPath(query.path || fields.path)
        const absolute = path.join(memoryRootOf(root), rel)
        const info = await pathStat(absolute)
        if (info === undefined || info.isDirectory()) throw new Error('读不到这篇记忆')
        if (info.size > 256 * 1024) throw new Error('这篇记忆超过 256 KB')
        const text = await fsp.readFile(absolute, 'utf8')
        return { detail: { path: '/memory/' + rel, text, bytes: info.size, mod: isoTime(info.mtimeMs) } }
      }
      case 'memory.write': {
        const rel = memoryVirtualPath(fields.path)
        const text = String(fields.text || '')
        if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('单篇记忆不能超过 1 MB')
        const absolute = path.join(memoryRootOf(root), rel)
        await writeAtomic(absolute, text)
        return { detail: { path: '/memory/' + rel, bytes: Buffer.byteLength(text) } }
      }
      case 'memory.create': {
        const area = MEMORY_AREAS.includes(fields.area) ? fields.area : 'topics'
        const title = String(fields.title || '').trim()
        if (title === '') throw new Error('标题不能为空')
        if (Array.from(title).length > 80) throw new Error('标题太长')
        const slug = slugify(title, 'untitled').toLowerCase()
        const dir = path.join(memoryRootOf(root), area)
        await fsp.mkdir(dir, { recursive: true })
        let file = (area === 'observations' ? new Date().toISOString().slice(0, 10) + '-' : '') + slug + '.md'
        for (let index = 2; existsSync(path.join(dir, file)); index += 1) {
          file = (area === 'observations' ? new Date().toISOString().slice(0, 10) + '-' : '') + slug + '-' + index + '.md'
        }
        let body = String(fields.text || '').trim()
        if (body === '') body = '# ' + title
        else if (!body.startsWith('#')) body = '# ' + title + '\n\n' + body
        await writeAtomic(path.join(dir, file), body + '\n')
        await registerMemoryIndex(root, area, file, title)
        return { detail: { path: '/memory/' + area + '/' + file, area, name: file, title } }
      }
      case 'browser.status': {
        return { detail: await browserBridge.status() }
      }
      case 'browser.navigate': {
        return { detail: await browserBridge.agent({ action: 'navigate', url: fields.url || query.url }) }
      }
      case 'browser.snapshot': {
        return { detail: await browserBridge.agent({ action: 'snapshot' }) }
      }
      case 'browser.screenshot': {
        return { detail: await browserBridge.agent({ action: 'screenshot' }) }
      }
      case 'browser.back':
      case 'browser.forward':
      case 'browser.reload':
      case 'browser.click':
      case 'browser.type':
      case 'browser.key':
      case 'browser.eval':
      case 'browser.scroll': {
        const action = cmd.replace(/^browser\./u, '')
        return { detail: await browserBridge.agent({ ...fields, action }) }
      }
      case 'task.list': {
        // 以前返回 { append: [], count: 0 }：形状合法，语义是假的。
        // 界面会显示「0 个任务」，用户分不清「没有任务」和「本版没有任务库」。
        throw unsupportedCapability('task.list')
      }
      case 'companion.list': {
        throw unsupportedCapability('companion.list')
      }
      case 'companion.get': {
        // The plugin edition does not ship companion life-packs. A null manifest
        // makes the stock companion module unload silently instead of showing
        // "DSH 内核暂未实现命令：companion.get" on the desktop.
        // unsupported 字段让调用方能分清「本版没有」和「还没加载」。
        const entry = capabilityOf('companion.get')
        return { detail: { manifest: null, mood: 'calm', state: null, unsupported: true, reason: entry.reason } }
      }
      case 'capability.list': {
        const entries = capabilityList()
        return { append: entries, detail: { count: entries.length } }
      }
      case 'clip.set': {
        return { detail: { copied: false } }
      }
      case 'surface.hide':
      case 'star.open':
      case 'star.finished':
      case 'star.dismiss': {
        return { detail: {} }
      }
      default:
        throw Object.assign(new Error('DSH 内核暂未实现命令：' + cmd), { status: 404 })
    }
  }

  // Book commands carry the current space in the URL (`/s/<space>/c/...`),
  // matching the Go kernel. `runCommand` reads it from `context.space`.
  function commandHandler(req, res, url, space) {
    void (async () => {
      try {
        if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
        const matched = space === null
          ? /^\/c\/([A-Za-z0-9_.-]+)$/u.exec(url.pathname)
          : null
        const cmd = space === null ? (matched ? matched[1] : '') : (url.pathname.split('/').pop() || '')
        if (cmd === '') return notFound(res)
        let fields = {}
        if (req.method === 'POST' || req.method === 'PUT') {
          try {
            fields = await readJsonBody(req)
          } catch (error) {
            return sendJson(res, 400, { ok: false, error: error.message })
          }
        }
        const query = Object.fromEntries(url.searchParams.entries())
        const output = await runCommand(cmd, { fields, query, space: space === null ? (query.space || '') : space })
        const envelope = { ok: true, command: cmd }
        if (output.append !== undefined) envelope.append = output.append
        if (output.fields !== undefined) envelope.fields = output.fields
        if (output.detail !== undefined) envelope.detail = output.detail
        if (output.text !== undefined) envelope.text = output.text
        sendJson(res, 200, envelope)
      } catch (error) {
        const body = { ok: false, error: error && error.message ? error.message : String(error) }
        // 机器可判的失败要能分辨：不支持的能力、缺服务、参数错，都是 400 但含义不同。
        if (error && error.code) body.code = error.code
        if (error && error.capability) body.capability = error.capability
        if (error && error.detail) body.detail = error.detail
        sendJson(res, error && error.status ? error.status : 400, body)
      }
    })()
  }

  /**
   * Apply the Harness's own browser/API authentication to every NexlOS route.
   * The WebOS assets are served outside the frontend-static fallback, so without
   * this check a LAN client could read the OS shell or call `/c/fs.read` with no
   * launch cookie. `requestRejection` returns 401/403 only for unauthenticated
   * requests and undefined for the signed browser cookie or an API credential.
   */
  function authorized(req, res) {
    const connection = ctx.get('connection')
    if (connection === undefined || typeof connection.requestRejection !== 'function') return true
    let rejection
    try {
      rejection = connection.requestRejection({ headers: req.headers })
    } catch (_error) {
      rejection = 401
    }
    if (rejection === undefined) return true
    sendJson(res, rejection, { ok: false, error: rejection === 403 ? 'forbidden' : 'dsh authentication required' })
    return false
  }

  const disposers = []
  const register = (kind, routePath, handler) => {
    try {
      disposers.push(web.register({ kind, path: routePath, handler }))
    } catch (error) {
      ctx.logger?.warn?.(`nexlos-os: route ${routePath} not registered: ${String(error)}`)
    }
  }

  ctx.effect(() => () => {
    void browserBridge.shutdown()
    if (appOriginServer) {
      try { appOriginServer.close() } catch (_error) { /* already closed */ }
      appOriginServer = null
    }
  }, 'nexlos-os: browser shutdown')

  ctx.effect(() => {
    register('prefix', '/a', (req, res) => {
      if (!authorized(req, res)) return
      const url = new URL(req.url || '/', 'http://x')
      if (url.pathname === '/a/term.js') {
        return void (async () => {
          try {
            const file = path.join(uiRoots().assets, 'term.js')
            let text = await fsp.readFile(file, 'utf8')
            const injection = `
  // NexlOS plugin bridge: agent-created PTY tabs attach without a page reload.
  async function takePendingTerminal() {
    try {
      const response = await fetch('/nexlos/terminal/pending', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (!data || data.pending !== true || !data.session || !data.session.id) return;
      if (sessions.some((s) => s.sessionId === data.session.id)) {
        await fetch('/nexlos/terminal/consumed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        return;
      }
      const s = makeSession(data.session.title || 'Agent 终端', 0);
      s.sessionId = data.session.id;
      s.token = data.session.token;
      s.cwd = data.session.cwd || '';
      const tb = makeTab(0);
      tb.root = newLeaf(s);
      syncPanes(tb);
      s.tab = tb;
      tb.active = s;
      renderTree(tb);
      renderTabs();
      await attachSaved(s);
      activateTab(tb);
      fitTab(tb);
      await fetch('/nexlos/terminal/consumed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    } catch (error) { /* terminal keeps its current tabs */ }
  }
  setTimeout(takePendingTerminal, 250);
  setInterval(takePendingTerminal, 1400);
`
            const marker = '  return { destroy };'
            const at = text.lastIndexOf(marker)
            if (at >= 0) text = text.slice(0, at) + injection + text.slice(at)
            res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
            res.end(text)
          } catch (error) {
            sendText(res, 500, 'terminal engine unavailable: ' + error.message)
          }
        })()
      }
      if (url.pathname === '/a/draw/board.js') {
        return void (async () => {
          try {
            const file = path.join(uiRoots().assets, 'draw', 'board.js')
            let text = await fsp.readFile(file, 'utf8')
            const method = `
/* NexlOS plugin delivery bridge: imports an SVG into the real drawboard history. */
window.SongBoard.importSvg = function (svgText) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      try {
        if (!canvas.width || !canvas.height) return reject(new Error('画布尚未就绪'));
        state.history = [];
        state.redoStack = [];
        state.historyIdx = -1;
        var dpr = window.devicePixelRatio || 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#F9F5EB';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        var scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        var w = img.width * scale;
        var h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        saveState();
        state.historyIdx = state.history.length - 1;
        resolve({ width: canvas.width, height: canvas.height });
      } catch (error) { reject(error) }
    };
    img.onerror = function () { reject(new Error('SVG 无法解码')) };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  });
};
`
            const marker = '\n})();'
            const at = text.lastIndexOf(marker)
            if (at >= 0) text = text.slice(0, at) + method + text.slice(at)
            res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
            res.end(text)
          } catch (error) {
            sendText(res, 500, 'draw board unavailable: ' + error.message)
          }
        })()
      }
      if (url.pathname === '/a/draw/board.html') {
        return void (async () => {
          try {
            const file = path.join(uiRoots().assets, 'draw', 'board.html')
            let html = await fsp.readFile(file, 'utf8')
            if (html.indexOf('data-nexlos-draw-bridge') < 0) {
              html = html.replace('</body>', '<script src="/nexlos/draw-bridge.js" data-nexlos-draw-bridge="js"></script></body>')
            }
            res.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
              // Tell Chromium this origin wants its own agent cluster. It does
              // not split a same-origin iframe today, but it keeps the door open
              // for the wildcard-subdomain OOPIF split without another flag day.
              'origin-agent-cluster': '?1',
            })
            res.end(html)
          } catch (error) {
            sendText(res, 500, 'draw board unavailable: ' + error.message)
          }
        })()
      }
      if (url.pathname === '/a/office' || url.pathname.startsWith('/a/office/')) {
        return void officeRequest(req, res, url)
      }
      if (url.pathname === '/a/generated' || url.pathname.startsWith('/a/generated/')) {
        return void generatedStatic(req, res, url)
      }
      void serveFile(req, res, uiRoots().assets, url.pathname.slice(2))
    })
    // 可选包（ArtCraft、CJK 字体、扩展语言）只在 src/extras/ 里；没有这条路由时
    // /extras/artcraftport/kernel.js 会 404，画板只剩错误页。
    register('prefix', '/extras', (req, res) => {
      if (!authorized(req, res)) return
      const url = new URL(req.url || '/', 'http://x')
      return void serveFile(req, res, path.join(HERE, 'src', 'extras'), url.pathname.slice('/extras'.length), { pluginTransforms: false })
    })
    register('exact', '/nexlos', (req, res) => {
      if (!authorized(req, res)) return
      res.writeHead(302, { location: '/nexlos/' })
      res.end()
    })
    register('prefix', '/nexlos', (req, res) => {
      if (!authorized(req, res)) return
      const url = new URL(req.url || '/', 'http://x')
      if (url.pathname === '/nexlos/health') {
        return sendJson(res, 200, { ok: true, name: 'nexlos-os', version: PLUGIN_VERSION, home: home(), engine: 'dsh' })
      }
      if (url.pathname.startsWith('/nexlos/browser/')) {
        return void handleBrowserRequest(req, res, url)
      }
      if (url.pathname === '/nexlos/app-storage-client.js') {
        return void serveFile(req, res, HERE, 'src/app-storage-client.js', { pluginTransforms: false })
      }
      if (url.pathname === '/nexlos/browser-frame-worker.js') {
        return void serveFile(req, res, HERE, 'src/browser-frame-worker.js', { pluginTransforms: false })
      }
      if (url.pathname === '/nexlos/perf.js') {
        return void serveFile(req, res, HERE, 'src/nexlos-perf.js', { pluginTransforms: false })
      }
      if (url.pathname === '/nexlos/dsh-workbench.js') {
        return void serveFile(req, res, HERE, 'src/dsh-workbench.js', { pluginTransforms: false })
      }
      if (url.pathname === '/nexlos/appdata-bridge.js') {
        return void serveFile(req, res, HERE, 'src/appdata-bridge.js', { pluginTransforms: false })
      }
      if (url.pathname === '/nexlos/terminal-pending.js') {
        return void serveFile(req, res, HERE, 'src/terminal-pending.js', { pluginTransforms: false })
      }
      if (url.pathname === '/nexlos/terminal/pending' || url.pathname === '/nexlos/terminal/consumed') {
        return void (async () => {
          try {
            if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
            const pendingFile = path.join(home(), '.nexlos', 'terminal-pending.json')
            if (url.pathname === '/nexlos/terminal/pending') {
              if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' })
              try {
                const data = JSON.parse(await fsp.readFile(pendingFile, 'utf8'))
                if (data && data.session && data.session.id) return sendJson(res, 200, { ok: true, pending: true, session: data.session })
              } catch (_error) { /* no pending */ }
              return sendJson(res, 200, { ok: true, pending: false })
            }
            if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
            await fsp.rm(pendingFile, { force: true })
            return sendJson(res, 200, { ok: true, consumed: true })
          } catch (error) {
            return sendJson(res, 500, { ok: false, error: error && error.message ? error.message : String(error) })
          }
        })()
      }
      if (url.pathname === '/nexlos/draw-bridge.js') {
        return void serveFile(req, res, HERE, 'src/draw-bridge.js', { pluginTransforms: false })
      }
      if (url.pathname === '/nexlos/draw/pending' || url.pathname === '/nexlos/draw/consumed') {
        return void (async () => {
          try {
            if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
            const pendingFile = path.join(home(), '.nexlos', 'draw-pending.json')
            if (url.pathname === '/nexlos/draw/pending') {
              if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' })
              try {
                const raw = await fsp.readFile(pendingFile, 'utf8')
                const data = JSON.parse(raw)
                if (data && typeof data.svg === 'string') return sendJson(res, 200, { ok: true, pending: true, title: data.title || '', svg: data.svg })
              } catch (_error) { /* no pending */ }
              return sendJson(res, 200, { ok: true, pending: false })
            }
            if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
            await fsp.rm(pendingFile, { force: true })
            return sendJson(res, 200, { ok: true, consumed: true })
          } catch (error) {
            return sendJson(res, 500, { ok: false, error: error && error.message ? error.message : String(error) })
          }
        })()
      }
      if (url.pathname === '/nexlos/cluster.js' || url.pathname === '/nexlos/cluster.css'
        || url.pathname === '/nexlos/router.js' || url.pathname === '/nexlos/router.css'
        || url.pathname === '/nexlos/chatpopup.js' || url.pathname === '/nexlos/chatpopup.css'
        || url.pathname === '/nexlos/appgen.js' || url.pathname === '/nexlos/appgen.css') {
        return void serveFile(req, res, HERE, 'src/' + url.pathname.slice('/nexlos/'.length))
      }
      if (url.pathname === '/nexlos/browser.js' || url.pathname === '/nexlos/browser.css') {
        const file = url.pathname.endsWith('.js') ? 'src/nexlos-browser.js' : 'src/nexlos-browser.css'
        return void serveFile(req, res, HERE, file)
      }
      if (url.pathname === '/nexlos/' || url.pathname === '/nexlos/index.html') {
        return void (async () => {
          try {
            let html = await fsp.readFile(uiRoots().index, 'utf8')
            const language = currentUiLanguage()
            html = transformPluginHtml(html, language)
            const embedded = url.searchParams.get('embed') === '1'
            if (!embedded && html.indexOf('data-nexlos-lang-reload') < 0) {
              html = html.replace('</body>', `<script data-nexlos-lang-reload>
(function () {
  var rendered = ${JSON.stringify(language)};
  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin) return;
    var data = event.data;
    if (!data || data.type !== 'nexlos.settings' || !data.patch || typeof data.patch.language !== 'string') return;
    if (data.patch.language === rendered) return;
    // The delivery transform depends on the active language (fast zh catalog,
    // full catalog, overlay pack), so apply the switch with one clean reload.
    setTimeout(function () { location.reload(); }, 450);
  });
})();
</script></body>`)
            }
            // The cluster floater belongs to the desktop document only. Embedded
            // app windows (`?embed=1#/route`) reuse the same index and must not
            // grow a second floater inside every window.
            if (!embedded && html.indexOf('data-nexlos-cluster') === -1) {
              html = html.replace('</body>', '<link rel="stylesheet" href="/nexlos/cluster.css" data-nexlos-cluster="css"><link rel="stylesheet" href="/nexlos/router.css" data-nexlos-router="css"><link rel="stylesheet" href="/nexlos/chatpopup.css" data-nexlos-chat="css"><script defer src="/nexlos/cluster.js" data-nexlos-cluster="js"></script><script defer src="/nexlos/router.js" data-nexlos-router="js"></script><script defer src="/nexlos/chatpopup.js" data-nexlos-chat="js"></script></body>')
            }
            if (html.indexOf('data-nexlos-terminal-pending') < 0) {
              html = html.replace('</body>', '<script defer src="/nexlos/terminal-pending.js" data-nexlos-terminal-pending="js"></script></body>')
            }
            if (html.indexOf('data-nexlos-appdata-bridge') < 0) {
              html = html.replace('</body>', '<script defer src="/nexlos/appdata-bridge.js" data-nexlos-appdata-bridge="js"></script></body>')
            }
            if (html.indexOf('data-nexlos-dsh-workbench') < 0) {
              html = html.replace('</body>', '<script defer src="/nexlos/dsh-workbench.js" data-nexlos-dsh-workbench="js"></script></body>')
            }
            if (html.indexOf('data-nexlos-perf') < 0) {
              html = html.replace('</body>', '<script defer src="/nexlos/perf.js" data-nexlos-perf="js"></script></body>')
            }
            res.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
              // Tell Chromium this origin wants its own agent cluster. It does
              // not split a same-origin iframe today, but it keeps the door open
              // for the wildcard-subdomain OOPIF split without another flag day.
              'origin-agent-cluster': '?1',
            })
            res.end(html)
          } catch (error) {
            sendText(res, 500, 'nexlos index unavailable: ' + error.message)
          }
        })()
      }
      return notFound(res)
    })
    register('prefix', '/c', (req, res) => {
      if (!authorized(req, res)) return
      const url = new URL(req.url || '/', 'http://x')
      return commandHandler(req, res, url, null)
    })
    register('prefix', '/s', (req, res) => {
      if (!authorized(req, res)) return
      const url = new URL(req.url || '/', 'http://x')
      const matched = /^\/s\/([^/]+)\/c\/([A-Za-z0-9_.-]+)$/u.exec(url.pathname)
      if (!matched) return notFound(res)
      return commandHandler(req, res, url, decodeURIComponent(matched[1]))
    })
    register('prefix', '/d', (req, res) => {
      if (!authorized(req, res)) return
      const url = new URL(req.url || '/', 'http://x')
      if (url.pathname !== '/d') return notFound(res)
      const requested = url.searchParams.get('path') || ''
      let resolved
      try { resolved = resolveVirtual(home(), requested) } catch (error) { return sendText(res, 400, error.message) }
      const relative = path.relative(home(), resolved.absolute).split(path.sep).join('/')
      return void serveFile(req, res, home(), relative, { pluginTransforms: false })
    })
    register('prefix', '/u', (req, res) => {
      if (!authorized(req, res)) return
      void (async () => {
        try {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
          if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'request rejected' })
          const url = new URL(req.url || '/', 'http://x')
          const requested = url.searchParams.get('path') || '/outbox'
          const resolved = resolveVirtual(home(), requested)
          const chunks = []
          let total = 0
          for await (const chunk of req) {
            total += chunk.length
            if (total > 64 * 1024 * 1024) return sendJson(res, 413, { ok: false, error: '文件过大' })
            chunks.push(chunk)
          }
          const file = multipartFile(Buffer.concat(chunks), req.headers['content-type'])
          const safeName = path.basename(String(file.filename || 'upload.bin')).replace(/[\u0000-\u001f]/gu, '').slice(0, 180) || 'upload.bin'
          await fsp.mkdir(resolved.absolute, { recursive: true })
          const target = path.resolve(resolved.absolute, safeName)
          if (!inside(resolved.absolute, target)) return sendJson(res, 400, { ok: false, error: '文件名不合法' })
          await fsp.writeFile(target, file.data)
          return sendJson(res, 200, { ok: true, path: resolved.vpath.replace(/\/$/u, '') + '/' + safeName, bytes: file.data.length })
        } catch (error) {
          return sendJson(res, 400, { ok: false, error: error && error.message ? error.message : String(error) })
        }
      })()
    })
    register('prefix', '/tm', (req, res) => {
      if (!authorized(req, res)) return
      terminalStream(req, res)
    })
    register('prefix', '/agent', (req, res) => {
      if (!authorized(req, res)) return
      const url = new URL(req.url || '/', 'http://x')
      const rest = url.pathname.replace(/^\/agent/u, '')
      if (rest === '/status') return void handleAgentStatus(res)
      if (rest === '/picker') return void handleAgentPicker(req, res, url)
      if (rest === '/agents') return void handleAgentRoster(req, res, url)
      if (rest === '/conversation') return void handleAgentConversation(req, res, url)
      if (rest === '/containers') return void handleContainers(req, res)
      if (rest === '/swarm') return void handleSwarm(req, res)
      if (rest === '/appgen') return void handleAppGen(req, res)
      if (rest === '/appdata') return void handleAppData(req, res)
      if (rest === '/container') return void handleContainerSelect(req, res)
      if (rest === '/send') return void handleAgentSend(req, res)
      if (rest === '/surface/workspace/file') return void handleWorkspaceFile(req, res, url)
      if (rest === '/model') return void handleAgentModel(req, res)
      if (rest === '/permission') return void handleAgentPermission(req, res)
      if (rest === '/chat') return void handleAgentChat(req, res)
      if (rest === '/stop') return void handleStop(req, res)
      if (rest === '/warm') return sendJson(res, 200, { ok: true, warming: true })
      if (rest === '/run/current') {
        // 没有运行项索引就别假装「有索引且为空」。
        const entry = capabilityOf('agent.run.current')
        return sendJson(res, 200, { running: false, taskId: '', unsupported: true, reason: entry.reason })
      }
      if (rest === '/byok') {
        const entry = capabilityOf('agent.byok')
        return sendJson(res, 200, { ok: true, config: null, active: false, unsupported: true, reason: entry.reason })
      }
      return sendJson(res, 404, { ok: false, error: 'unknown agent route' })
    })
    register('prefix', '/p', (req, res) => {
      if (!authorized(req, res)) return
      const url = new URL(req.url || '/', 'http://x')
      const relative = decodeURIComponent(url.pathname.replace(/^\/p/u, ''))
      void serveFile(req, res, home(), relative)
    })
    return () => {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch (_error) {
          /* route already gone */
        }
      }
      disposers.length = 0
    }
  }, 'nexlos-os: web routes')

  // Expose the same live page to the DSH agent. This is deliberately a single
  // tool with a small action enum: the agent and the user share one Chromium
  // page, so navigation/observation/input stay coherent.
  ctx.inject(['tools'], (scope) => {
    try {
      scope.effect(() => scope.tools.register({
        name: 'nexlos_browser',
        description: 'Default browser tool for the DSH command bar: an independent Agent browser with structured page inspection. Use navigate/snapshot/click/type/scroll for autonomous browsing. When a site needs a human login or captcha, call handoff to open a separate Chrome sharing this Agent profile; after the human finishes, call resume to return to Agent browsing. Never use the Human iframe/browser for command-bar work.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: { type: 'string', enum: ['navigate', 'state', 'snapshot', 'click', 'type', 'key', 'back', 'forward', 'reload', 'screenshot', 'eval', 'scroll', 'handoff', 'resume'], description: 'Browser operation.' },
            url: { type: 'string', description: 'For navigate: an HTTP(S) URL.' },
            selector: { type: 'string', description: 'CSS selector for click/type/scroll.' },
            text: { type: 'string', description: 'For type: text to insert after focusing the page or selector.' },
            x: { type: 'number', description: 'Viewport x coordinate for click/scroll.' },
            y: { type: 'number', description: 'Viewport y coordinate for click/scroll.' },
            key: { type: 'string', description: 'For key: Enter, Backspace, Tab, Escape, ArrowLeft, etc.' },
            code: { type: 'string', description: 'For key: KeyboardEvent.code.' },
            expression: { type: 'string', description: 'For eval: JavaScript evaluated in the page; result is returned as JSON.' },
            deltaY: { type: 'number', description: 'For scroll: vertical wheel delta.' },
            enter: { type: 'boolean', description: 'For type: press Enter after inserting text.' },
          },
          required: ['action'],
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, execution) {
          execution.signal.throwIfAborted()
          const action = String(args.action || '')
          if (action === 'screenshot') {
            const shot = await browserBridge.agent({ action: 'screenshot' })
            return { url: shot.url, title: shot.title, width: shot.width, height: shot.height, jpegBytes: String(shot.jpeg || '').length }
          }
          const result = await browserBridge.agent({ ...args, action })
          return result && typeof result === 'object' ? result : { result }
        },
      }), 'nexlos-os: browser tool')
    } catch (error) {
      ctx.logger?.warn?.('nexlos-os: browser tool not registered: ' + String(error))
    }
  })

  // App-level tools for the NexlOS command box. The model chooses these to
  // create artifacts in the same apps the user sees; files stay in the user's
  // NexlOS home and the tool result names the real path.
  ctx.inject(['tools'], (scope) => {
    try {
      scope.effect(() => scope.tools.register({
        name: 'nexlos_office',
        description: 'Create, read, update, or export a document in NexlOS 便捷办公 (Office). Use compose for an article/report in one call: kind=doc and title+text. Use sheet for tables, slide for slide decks, markdown/html for code or HTML. Export writes to /outbox. This writes the same documents the user sees in the Office app.',
        parameters: {
          type: 'object', additionalProperties: false,
          properties: {
            action: { type: 'string', enum: ['create', 'compose', 'write', 'append', 'read', 'export', 'list'], description: 'Office operation.' },
            id: { type: 'string', description: 'Document id from create/list.' },
            title: { type: 'string', description: 'Document title.' },
            kind: { type: 'string', enum: ['doc', 'sheet', 'slide', 'markdown', 'html'], description: 'Document kind; defaults to doc.' },
            text: { type: 'string', description: 'Article body, table rows (tab/comma separated), slides separated by ---, or raw Markdown/HTML.' },
            format: { type: 'string', enum: ['md', 'html', 'csv', 'txt'], description: 'Export format.' },
          },
          required: ['action'],
        },
        output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        async execute(args, execution) {
          execution.signal.throwIfAborted()
          return officeToolAction(args)
        },
      }), 'nexlos-os: office tool')
      scope.effect(() => scope.tools.register({
        name: 'nexlos_memory',
        description: 'Read, write, append, create, list, or search the Obsidian-compatible NexlOS memory tree at home/nexl交换区/记忆树. Use it to persist durable facts and decisions from a long conversation. Markdown wiki links and #tags written here become nodes/edges in the relationship graph (graph.index).',
        parameters: {
          type: 'object', additionalProperties: false,
          properties: {
            action: { type: 'string', enum: ['list', 'read', 'write', 'append', 'create', 'search'], description: 'Memory operation.' },
            path: { type: 'string', description: 'For read/write/append: /memory/… path.' },
            area: { type: 'string', enum: ['topics', 'observations', 'projects'], description: 'For create: memory area.' },
            title: { type: 'string', description: 'For create: note title.' },
            text: { type: 'string', description: 'Markdown body; use [[wiki-links]] or [text](path.md) to connect the graph.' },
            query: { type: 'string', description: 'For search.' },
          },
          required: ['action'],
        },
        output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        async execute(args, execution) {
          execution.signal.throwIfAborted()
          return memoryToolAction(args)
        },
      }), 'nexlos-os: memory tool')
      scope.effect(() => scope.tools.register({
        name: 'nexlos_terminal',
        description: 'Open a real PTY in the NexlOS terminal app, run a command or interactive CLI, read the visible screen, and hand the tab back to the user. Use open for interactive tools (claude/grok/opencode); use run for a bounded command. The created tab appears in the visible terminal via /nexlos/terminal/pending.',
        parameters: {
          type: 'object', additionalProperties: false,
          properties: {
            action: { type: 'string', enum: ['open', 'run', 'read', 'input', 'close'], description: 'Terminal operation.' },
            command: { type: 'string', description: 'For open/run: command to type after the shell starts.' },
            title: { type: 'string', description: 'Tab title.' },
            cwd: { type: 'string', description: 'Initial working directory; defaults to the NexlOS home.' },
            sessionId: { type: 'string', description: 'Session id from open/run, for read/input/close.' },
            text: { type: 'string', description: 'For input: literal text to send.' },
            enter: { type: 'boolean', description: 'For input: press Enter after text.' },
            timeoutMs: { type: 'number', description: 'For run: max wait before returning the current screen.' },
          },
          required: ['action'],
        },
        output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        async execute(args, execution) {
          execution.signal.throwIfAborted()
          return terminalToolAction(args)
        },
      }), 'nexlos-os: terminal tool')
      scope.effect(() => scope.tools.register({
        name: 'nexlos_draw',
        description: 'Create a vector SVG artwork and deliver it into the real NexlOS 画板 app (pending import + visible canvas history). Use it for diagrams, posters, illustrations, and painting-style homages. For painting style, compose layered SVG paths with varied stroke widths, opacity, gradients and repeated brush-like strokes; avoid flat clipart. The user can continue hand-drawing and press Save.',
        parameters: {
          type: 'object', additionalProperties: false,
          properties: {
            action: { type: 'string', enum: ['create'], description: 'Draw operation.' },
            title: { type: 'string', description: 'Sketch title/label.' },
            svg: { type: 'string', description: 'Optional complete SVG markup; if omitted, a simple vector placeholder is created.' },
          },
          required: ['action'],
        },
        output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        async execute(args, execution) {
          execution.signal.throwIfAborted()
          return drawToolAction(args)
        },
      }), 'nexlos-os: draw tool')
    } catch (error) {
      ctx.logger?.warn?.('nexlos-os: app tools not registered: ' + String(error))
    }
  })

  // Prompt the model with the desktop's own vocabulary. The WebOS command bar
  // reaches the same agent, so a sentence in the OS is a prompt in DSH.
  const prompt = ctx.get('systemPrompt')
  if (prompt !== undefined && typeof prompt.section === 'function') {
    ctx.effect(() => prompt.section({
      name: 'nexlos-os',
      order: 900,
      text: 'NexlOS layer: this Harness is presented as the NexlOS desktop. A "space"/"空间" is a workspace directory, a "process"/"进程" is a DSH session, the "kernel"/"内核" is you, and the "system terminal"/"系统终端" is the DSH terminal. When the user speaks in OS terms, act with workspace, session, file and terminal tools; keep file operations inside the NexlOS home unless an absolute path is named. The desktop command bar and DSH share the same sessions, so continue the session you are given rather than inventing a parallel one. For any browser task started from the desktop command bar, always use nexlos_browser (the independent Agent browser, structure-first), never the Human iframe. If a site needs human login/captcha, call nexlos_browser with action handoff, ask the user to finish it in the opened Chrome, then call resume. For OS creation requests, use nexlos_office for documents, nexlos_draw for vector sketches; create real artifacts and report their NexlOS paths. For long conversations, persist durable facts/decisions with nexlos_memory and use [[wiki-links]] so graph.index connects them. For nexlos_draw, produce layered brush-like SVG (multiple strokes, gradients, opacity), not flat clipart, then tell the user to open 画板. For terminal/CLI work, use nexlos_terminal: open for interactive claude/grok/opencode, run for bounded commands, then read/input before handing the tab back.',
    }), 'nexlos-os: prompt section')
  }
}


const COMMAND_HELP = [
  { name: 'settings.get', help: '桌面设置', group: 'settings', method: 'GET' },
  { name: 'settings.set', help: '写入桌面设置', group: 'settings', method: 'POST' },
  { name: 'app.list', help: '本机应用清单', group: 'app', method: 'GET' },
  { name: 'app.open', help: '打开生成应用', group: 'app', method: 'POST' },
  { name: 'fs.list', help: '列目录', group: 'fs', method: 'GET' },
  { name: 'fs.read', help: '读文本文件', group: 'fs', method: 'GET' },
  { name: 'fs.write', help: '保存文本文件', group: 'fs', method: 'POST' },
  { name: 'fs.mkdir', help: '新建文件夹', group: 'fs', method: 'POST' },
  { name: 'fs.rename', help: '移动 / 重命名', group: 'fs', method: 'POST' },
  { name: 'fs.delete', help: '删除', group: 'fs', method: 'POST' },
  { name: 'fs.usage', help: '工作区占用', group: 'fs', method: 'GET' },
  { name: 'novel.list', help: '列出全部书目', group: 'novel', method: 'GET' },
  { name: 'novel.create', help: '新建一本书', group: 'novel', method: 'POST' },
  { name: 'novel.open', help: '打开一本书', group: 'novel', method: 'GET' },
  { name: 'chapter.list', help: '章节目录', group: 'chapter', method: 'GET' },
  { name: 'chapter.create', help: '新建一章', group: 'chapter', method: 'POST' },
  { name: 'chapter.read', help: '读取正文', group: 'chapter', method: 'GET' },
  { name: 'chapter.save', help: '保存正文', group: 'chapter', method: 'POST' },
  { name: 'outline.read', help: '读取总纲', group: 'outline', method: 'GET' },
  { name: 'outline.save', help: '保存总纲', group: 'outline', method: 'POST' },
  { name: 'cast.list', help: '人物表', group: 'cast', method: 'GET' },
  { name: 'cast.save', help: '保存人物表', group: 'cast', method: 'POST' },
  { name: 'export.markdown', help: '合并导出 Markdown', group: 'export', method: 'GET' },
  { name: 'system.status', help: '内核状态与命令目录', group: 'system', method: 'GET' },
  { name: 'workspace.info', help: '工作区状态', group: 'workspace', method: 'GET' },
]
