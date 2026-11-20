/*
 * DOCX → 办公文档模型 的离线解析（零依赖）。
 *
 * 目标不是“把文字捞出来”，而是尽量还原 Word 的实际版式：
 * 表格列宽/横纵合并/单元格四边/内边距/表头、段落缩进与间距、
 * docDefaults 与样式链里的字体字号、主题字体、Wingdings 勾选框。
 *
 * 解析顺序与 Go 版 modules/office/docx.go 对齐；模型字段见同目录
 * webos/a/office/editors.js 的 tableHTML / 分页器。
 */

const NS = /^[A-Za-z_][\w.-]*:/u

/** 去掉命名空间前缀：w:p → p。 */
function local(name) {
  return name.replace(NS, '')
}

/** 解 XML 实体。数值实体按码位还原。 */
function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#x([0-9a-f]+);/giu, (_m, code) => {
      const n = parseInt(code, 16)
      return Number.isFinite(n) ? String.fromCodePoint(n) : ''
    })
    .replace(/&#(\d+);/gu, (_m, code) => {
      const n = Number(code)
      return Number.isFinite(n) ? String.fromCodePoint(n) : ''
    })
    .replace(/&amp;/gu, '&')
}

/**
 * 极简 XML → 树。只处理 OOXML 用得到的部分：
 * 元素、属性、文本、注释、CDATA、处理指令。DTD 直接跳过。
 * 文本节点是 { text }，元素节点是 { name, attrs, children }。
 */
function parseXml(input) {
  const root = { name: '#root', attrs: {}, children: [] }
  const stack = [root]
  const text = String(input || '')
  const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<(\/?)([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gu
  let cursor = 0
  let match
  const pushText = (value) => {
    if (value === '') return
    stack[stack.length - 1].children.push({ text: decodeXml(value) })
  }
  while ((match = tagRe.exec(text)) !== null) {
    if (match.index > cursor) pushText(text.slice(cursor, match.index))
    cursor = tagRe.lastIndex
    if (match[1] !== undefined) {
      // CDATA 内容按原样进入文本节点。
      stack[stack.length - 1].children.push({ text: match[1] })
      continue
    }
    const name = match[3]
    if (!name) continue // 注释、PI、DTD
    if (match[2] === '/') {
      // 闭合标签：找到最近的同名元素再弹栈，容忍个别未闭合节点。
      const target = local(name)
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (local(stack[i].name) === target) {
          stack.length = i
          break
        }
      }
      continue
    }
    const node = { name, attrs: parseAttrs(match[4] || ''), children: [] }
    stack[stack.length - 1].children.push(node)
    if (match[5] !== '/') stack.push(node)
  }
  if (cursor < text.length) pushText(text.slice(cursor))
  return root
}

function parseAttrs(source) {
  const attrs = {}
  const re = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu
  let m
  while ((m = re.exec(source)) !== null) {
    attrs[local(m[1])] = decodeXml(m[2] !== undefined ? m[2] : m[3])
  }
  return attrs
}

function elements(node, name) {
  if (!node) return []
  const out = []
  for (const child of node.children || []) {
    if (child.name && (name === undefined || local(child.name) === name)) out.push(child)
  }
  return out
}

function element(node, name) {
  return elements(node, name)[0] || null
}

function descendant(node, name, maxDepth = 6) {
  if (!node || maxDepth < 0) return null
  for (const child of node.children || []) {
    if (!child.name) continue
    if (local(child.name) === name) return child
    const found = descendant(child, name, maxDepth - 1)
    if (found) return found
  }
  return null
}

function textOf(node) {
  if (!node) return ''
  if (node.text !== undefined) return node.text
  let out = ''
  for (const child of node.children || []) out += textOf(child)
  return out
}

function attr(node, name) {
  return node && node.attrs ? (node.attrs[name] !== undefined ? node.attrs[name] : '') : ''
}

function intAttr(node, name) {
  const value = Number.parseInt(attr(node, name), 10)
  return Number.isFinite(value) ? value : 0
}

/** OOXML 开关属性：没有 val 就是开；0/false/off 是关。 */
function onOff(node) {
  if (!node) return false
  const value = String(attr(node, 'val') || '').toLowerCase()
  return value !== '0' && value !== 'false' && value !== 'off'
}

function val(node) {
  return node ? String(attr(node, 'val') || '') : ''
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value) !== '') return String(value)
  }
  return ''
}

function upperHex(value) {
  return String(value || '').trim().replace(/^#/u, '').toUpperCase()
}

function round2(value) {
  return Math.round(value * 100) / 100
}

/* ------------------------------------------------------------------ */
/* 样式表                                                              */
/* ------------------------------------------------------------------ */

function parseFonts(node) {
  if (!node) return null
  return {
    ascii: attr(node, 'ascii'),
    hAnsi: attr(node, 'hAnsi'),
    eastAsia: attr(node, 'eastAsia'),
    asciiTheme: attr(node, 'asciiTheme'),
    hAnsiTheme: attr(node, 'hAnsiTheme'),
    eastAsiaTheme: attr(node, 'eastAsiaTheme'),
  }
}

function parseRPr(node) {
  if (!node) return null
  const out = {
    style: null, b: null, i: null, u: null, strike: null,
    color: null, sz: null, shd: null, vert: null, fonts: null,
  }
  for (const child of node.children || []) {
    if (!child.name) continue
    switch (local(child.name)) {
      case 'rStyle': out.style = val(child); break
      case 'b': out.b = onOff(child); break
      case 'i': out.i = onOff(child); break
      case 'u': out.u = val(child).toLowerCase(); break
      case 'strike': out.strike = onOff(child); break
      case 'color': out.color = attr(child, 'val'); break
      case 'sz': out.sz = intAttr(child, 'val'); break
      case 'shd': out.shd = attr(child, 'fill'); break
      case 'vertAlign': out.vert = val(child).toLowerCase(); break
      case 'rFonts': out.fonts = parseFonts(child); break
      default: break
    }
  }
  return out
}

function mergeFonts(a, b) {
  if (!a && !b) return null
  if (!a) return { ...b }
  if (!b) return a
  const out = { ...a }
  for (const key of Object.keys(out)) out[key] = firstNonEmpty(out[key], b[key])
  return out
}

function mergeRPr(...lists) {
  const out = {
    style: null, b: null, i: null, u: null, strike: null,
    color: null, sz: null, shd: null, vert: null, fonts: null,
  }
  for (const item of lists) {
    if (!item) continue
    for (const key of ['style', 'b', 'i', 'u', 'strike', 'color', 'sz', 'shd', 'vert']) {
      if (out[key] === null && item[key] !== null && item[key] !== undefined) out[key] = item[key]
    }
    out.fonts = mergeFonts(out.fonts, item.fonts)
  }
  return out
}

function parseInd(node) {
  if (!node) return null
  return {
    left: intAttr(node, 'left'),
    right: intAttr(node, 'right'),
    firstLine: intAttr(node, 'firstLine'),
    hanging: intAttr(node, 'hanging'),
    leftChars: intAttr(node, 'leftChars'),
    firstLineChars: intAttr(node, 'firstLineChars'),
  }
}

function parseSpacing(node) {
  if (!node) return null
  return {
    before: intAttr(node, 'before'),
    after: intAttr(node, 'after'),
    line: intAttr(node, 'line'),
    lineRule: attr(node, 'lineRule'),
  }
}

function parseNumPr(node) {
  if (!node) return null
  return {
    numId: intAttr(element(node, 'numId'), 'val'),
    ilvl: intAttr(element(node, 'ilvl'), 'val'),
  }
}

function parsePPr(node) {
  if (!node) return null
  const out = {
    style: null, jc: null, numPr: null, outline: null,
    ind: null, spacing: null, keepNext: null, pageBreakBefore: null,
  }
  for (const child of node.children || []) {
    if (!child.name) continue
    switch (local(child.name)) {
      case 'pStyle': out.style = val(child); break
      case 'jc': out.jc = val(child); break
      case 'numPr': out.numPr = parseNumPr(child); break
      case 'outlineLvl': out.outline = intAttr(child, 'val'); break
      case 'ind': out.ind = parseInd(child); break
      case 'spacing': out.spacing = parseSpacing(child); break
      case 'keepNext': out.keepNext = onOff(child); break
      case 'pageBreakBefore': out.pageBreakBefore = onOff(child); break
      default: break
    }
  }
  return out
}

function mergeInd(a, b) {
  if (!a && !b) return null
  if (!a) return { ...b }
  if (!b) return a
  const out = { ...a }
  for (const key of Object.keys(out)) if (!out[key]) out[key] = b[key]
  return out
}

function mergeSpacing(a, b) {
  if (!a && !b) return null
  if (!a) return { ...b }
  if (!b) return a
  const out = { ...a }
  for (const key of ['before', 'after', 'line']) if (!out[key]) out[key] = b[key]
  if (!out.lineRule) out.lineRule = b.lineRule
  return out
}

function mergePPr(...lists) {
  const out = {
    style: null, jc: null, numPr: null, outline: null,
    ind: null, spacing: null, keepNext: null, pageBreakBefore: null,
  }
  for (const item of lists) {
    if (!item) continue
    for (const key of ['style', 'jc', 'numPr', 'outline', 'keepNext', 'pageBreakBefore']) {
      if (out[key] === null && item[key] !== null && item[key] !== undefined) out[key] = item[key]
    }
    out.ind = mergeInd(out.ind, item.ind)
    out.spacing = mergeSpacing(out.spacing, item.spacing)
  }
  return out
}

function buildStyleSheet(entries) {
  const sheet = {
    defRPr: null,
    defPPr: null,
    byID: new Map(),
    major: { latin: '', ea: '' },
    minor: { latin: '', ea: '' },
  }
  const stylesRaw = entries.get('word/styles.xml')
  if (stylesRaw) {
    const stylesRoot = parseXml(stylesRaw.toString('utf8'))
    const stylesNode = descendant(stylesRoot, 'styles', 3)
    const defaults = element(stylesNode, 'docDefaults')
    if (defaults) {
      sheet.defRPr = parseRPr(descendant(element(defaults, 'rPrDefault'), 'rPr', 3))
      sheet.defPPr = parsePPr(descendant(element(defaults, 'pPrDefault'), 'pPr', 3))
    }
    for (const st of elements(stylesNode, 'style')) {
      const id = attr(st, 'styleId')
      if (id) sheet.byID.set(id, st)
    }
  }
  const themeRaw = entries.get('word/theme/theme1.xml')
  if (themeRaw) {
    const themeRoot = parseXml(themeRaw.toString('utf8'))
    const scheme = descendant(themeRoot, 'fontScheme', 6)
    const read = (kind) => {
      const fonts = descendant(scheme, kind, 2)
      return {
        latin: attr(descendant(fonts, 'latin', 2), 'typeface'),
        ea: attr(descendant(fonts, 'ea', 2), 'typeface'),
      }
    }
    if (scheme) {
      sheet.major = read('majorFont')
      sheet.minor = read('minorFont')
    }
  }
  return sheet
}

function styleChain(sheet, id) {
  const out = []
  const seen = new Set()
  let current = id
  while (current && out.length < 12 && !seen.has(current)) {
    seen.add(current)
    const st = sheet.byID.get(current)
    if (!st) break
    out.push(st)
    const based = element(st, 'basedOn')
    current = based ? val(based) : ''
  }
  return out
}

function styleRPr(st) {
  return parseRPr(element(st, 'rPr'))
}

function stylePPr(st) {
  return parsePPr(element(st, 'pPr'))
}

function resolveRPr(sheet, styleId, direct) {
  const lists = []
  if (direct && direct.style) {
    for (const st of styleChain(sheet, direct.style)) lists.push(styleRPr(st))
  }
  lists.push(direct)
  for (const st of styleChain(sheet, styleId)) lists.push(styleRPr(st))
  lists.push(sheet.defRPr)
  return mergeRPr(...lists)
}

function resolvePPr(sheet, styleId, direct) {
  const lists = [direct]
  for (const st of styleChain(sheet, styleId)) lists.push(stylePPr(st))
  lists.push(sheet.defPPr)
  return mergePPr(...lists)
}

function defaultParagraphStyle(sheet) {
  for (const [id, st] of sheet.byID) {
    if (attr(st, 'type') === 'paragraph' && (attr(st, 'default') === '1' || attr(st, 'default').toLowerCase() === 'true')) return id
  }
  return ''
}

function fontName(sheet, fonts) {
  if (!fonts) return ''
  const direct = firstNonEmpty(fonts.eastAsia, fonts.ascii, fonts.hAnsi)
  if (direct) return direct
  const theme = firstNonEmpty(fonts.eastAsiaTheme, fonts.asciiTheme, fonts.hAnsiTheme).toLowerCase()
  switch (theme) {
    case 'minoreastasia': return firstNonEmpty(sheet.minor.ea, '宋体')
    case 'majoreastasia': return firstNonEmpty(sheet.major.ea, '宋体')
    case 'minorhansi':
    case 'minorascii': return firstNonEmpty(sheet.minor.latin, 'Calibri')
    case 'majorhansi':
    case 'majorascii': return firstNonEmpty(sheet.major.latin, 'Calibri Light')
    default: return ''
  }
}

function defaultsOf(sheet) {
  const rpr = resolveRPr(sheet, defaultParagraphStyle(sheet), null)
  return {
    font: rpr ? fontName(sheet, rpr.fonts) : '',
    size: rpr && rpr.sz ? rpr.sz : 0,
  }
}

/* ------------------------------------------------------------------ */
/* 边框                                                                */
/* ------------------------------------------------------------------ */

function borderSpec(node) {
  if (!node) return ''
  const v = attr(node, 'val').toLowerCase().trim()
  if (v === '' || v === 'nil' || v === 'none') return ''
  const sz = intAttr(node, 'sz') > 0 ? intAttr(node, 'sz') : 4
  const color = upperHex(attr(node, 'color')) || '000000'
  return `single:${sz}:${color}`
}

function tableBordersString(node) {
  if (!node) return 'none'
  const edges = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  let first = null
  for (const edge of edges) {
    first = element(node, edge)
    if (first) break
  }
  if (!first) return 'none'
  const v = attr(first, 'val').toLowerCase()
  if (v === 'nil' || v === 'none') return 'none'
  const sz = intAttr(first, 'sz') > 0 ? intAttr(first, 'sz') : 4
  const color = upperHex(attr(first, 'color')) || '000000'
  return `single:${sz}:${color}`
}

function cellBordersFrom(node) {
  if (!node) return null
  const out = {
    top: borderSpec(element(node, 'top')),
    left: borderSpec(element(node, 'left')),
    bottom: borderSpec(element(node, 'bottom')),
    right: borderSpec(element(node, 'right')),
  }
  if (!out.top && !out.left && !out.bottom && !out.right) return null
  return out
}

function tableBorders(sheet, tblPr) {
  if (tblPr) {
    const direct = element(tblPr, 'tblBorders')
    if (direct) return tableBordersString(direct)
    const style = element(tblPr, 'tblStyle')
    if (style) {
      for (const st of styleChain(sheet, val(style))) {
        const borders = descendant(element(st, 'tblPr'), 'tblBorders', 2)
        if (borders) return tableBordersString(borders)
      }
    }
  }
  return 'none'
}

function tableCellPad(sheet, tblPr) {
  if (!tblPr) return 0
  const direct = descendant(element(tblPr, 'tblCellMar'), 'left', 2)
  if (direct && intAttr(direct, 'w') > 0) return intAttr(direct, 'w')
  const style = element(tblPr, 'tblStyle')
  if (style) {
    for (const st of styleChain(sheet, val(style))) {
      const mar = descendant(element(st, 'tblPr'), 'tblCellMar', 3)
      const left = mar ? element(mar, 'left') : null
      if (left && intAttr(left, 'w') > 0) return intAttr(left, 'w')
    }
  }
  return 108 // Word 默认单元格左右边距 0.19cm
}

/* ------------------------------------------------------------------ */
/* 运行块                                                              */
/* ------------------------------------------------------------------ */

function headingLevel(value) {
  const s = String(value || '').trim().toLowerCase()
  for (let i = 1; i <= 9; i += 1) {
    if (s === `heading ${i}` || s === `heading${i}` || s === String(i)) return i
  }
  return 0
}

function jcValue(value) {
  switch (String(value || '').toLowerCase()) {
    case 'center': return 'center'
    case 'right':
    case 'end': return 'right'
    case 'both':
    case 'justify':
    case 'distribute': return 'justify'
    default: return 'left'
  }
}

/** Wingdings / Wingdings 2 的方框与勾选字符映射成 Unicode。 */
function symChar(font, code) {
  let v = Number.parseInt(String(code || '').trim(), 16)
  if (!Number.isFinite(v)) return ''
  // 有的生成器把符号写成 F0FE（私有区前缀），实际字形仍是低 8 位。
  if (v > 0xff && (v & 0xff) !== 0) v &= 0xff
  switch (String(font || '').trim().toLowerCase()) {
    case 'wingdings':
      switch (v) {
        case 0xfe: return '☑'
        case 0xfd: return '☒'
        case 0xa8: return '☐'
        case 0xfc: return '✓'
        case 0x6f: case 0x71: case 0x72: case 0x73:
        case 0x74: case 0x75: case 0x76: case 0x77: return '□'
        default: return ''
      }
    case 'wingdings 2':
      switch (v) {
        case 0x50: case 0x51: case 0x52: case 0x53: return '☑'
        case 0xa3: return '☐'
        default: return ''
      }
    default: return ''
  }
}

function runText(node) {
  let out = ''
  for (const child of node.children || []) {
    if (!child.name) continue
    switch (local(child.name)) {
      case 't': out += textOf(child); break
      case 'br':
      case 'cr': out += '\n'; break
      case 'tab': out += '\t'; break
      case 'sym': out += symChar(attr(child, 'font'), attr(child, 'char')); break
      case 'noBreakHyphen': out += '-'; break
      default: break
    }
  }
  return out
}

function sameRunStyle(a, b) {
  return a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s &&
    a.color === b.color && a.hl === b.hl && a.vert === b.vert &&
    a.size === b.size && a.font === b.font && a.code === b.code
}

function appendRun(dst, node, link, base, sheet) {
  const direct = parseRPr(element(node, 'rPr'))
  const lists = []
  // run 自己的 rStyle 先展开，再叠直接格式与段落基线。
  if (direct && direct.style) {
    for (const st of styleChain(sheet, direct.style)) lists.push(styleRPr(st))
  }
  lists.push(direct, base)
  const properties = mergeRPr(...lists)
  const run = { t: runText(node) }
  if (link) run.link = link
  if (properties) {
    if (properties.b) run.b = true
    if (properties.i) run.i = true
    if (properties.u && properties.u !== 'none') run.u = true
    if (properties.strike) run.s = true
    const color = upperHex(properties.color)
    if (color) run.color = color
    if (properties.sz) run.size = properties.sz
    const font = fontName(sheet, properties.fonts)
    if (font) run.font = font
    const hl = upperHex(properties.shd)
    if (hl && hl.toLowerCase() !== 'auto') run.hl = hl
    if (properties.vert) run.vert = properties.vert
  }
  const previous = dst[dst.length - 1]
  if (previous && previous.link === run.link && sameRunStyle(previous, run)) {
    previous.t += run.t
    return
  }
  dst.push(run)
}

/* ------------------------------------------------------------------ */
/* 段落                                                                */
/* ------------------------------------------------------------------ */

function parseParagraph(node, rels, sheet) {
  const block = { type: 'p' }
  const pprNode = element(node, 'pPr')
  const ppr = parsePPr(pprNode)
  const styleId = ppr && ppr.style ? ppr.style : ''
  const base = resolveRPr(sheet, styleId, null)
  let drawing = false
  for (const child of node.children || []) {
    if (!child.name) continue
    switch (local(child.name)) {
      case 'r':
        appendRun(block.runs || (block.runs = []), child, '', base, sheet)
        break
      case 'hyperlink': {
        const link = rels.get(attr(child, 'id')) || ''
        for (const r of elements(child, 'r')) appendRun(block.runs || (block.runs = []), r, link, base, sheet)
        break
      }
      case 'drawing':
      case 'pict':
      case 'object':
        drawing = true
        break
      default: break
    }
  }
  if (drawing) {
    block.type = 'passthrough'
    block.text = '[图片 / 嵌入对象]'
    return block
  }
  const eff = resolvePPr(sheet, styleId, ppr)
  if (ppr) {
    const name = String(ppr.style || '').toLowerCase()
    if (headingLevel(name) > 0) block.type = `h${headingLevel(name)}`
    if (name.includes('quote')) block.type = 'quote'
    if (name.includes('list') && ppr.numPr) {
      block.type = 'li'
      block.ordered = name.includes('number')
    }
  }
  if (eff) {
    if (eff.outline !== null && eff.outline >= 0 && eff.outline <= 8 && block.type === 'p') {
      block.type = `h${eff.outline + 1}`
    }
    if (eff.numPr && eff.numPr.numId && block.type === 'p') block.type = 'li'
    if (eff.jc) block.align = jcValue(eff.jc)
    if (eff.ind) {
      block.indentLeft = eff.ind.left
      if (eff.ind.left === 0 && eff.ind.leftChars > 0) {
        block.indentLeft = charsToTwips(eff.ind.leftChars, base && base.sz ? base.sz : 0)
      }
      if (eff.ind.hanging > 0) block.indentFirst = -eff.ind.hanging
      else if (eff.ind.firstLine > 0) block.indentFirst = eff.ind.firstLine
      else if (eff.ind.firstLineChars > 0) {
        block.indentFirst = charsToTwips(eff.ind.firstLineChars, base && base.sz ? base.sz : 0)
      }
    }
    if (eff.spacing) {
      block.spaceBefore = eff.spacing.before
      block.spaceAfter = eff.spacing.after
      block.lineHeight = eff.spacing.line
      block.lineRule = String(eff.spacing.lineRule || '').toLowerCase()
    }
  }
  if (!block.runs) block.runs = []
  return block
}

/** 字符缩进 → twips；1 字符约等于字号，字号按 half-point 存。 */
function charsToTwips(chars, halfPoints) {
  const size = halfPoints > 0 ? halfPoints : 21
  return Math.round((chars / 100) * size * 10)
}

/* ------------------------------------------------------------------ */
/* 表格                                                                */
/* ------------------------------------------------------------------ */

function parseCellRuns(cell, sheet) {
  const runs = []
  let align = ''
  const paragraphs = elements(cell, 'p')
  paragraphs.forEach((p, index) => {
    if (index > 0) runs.push({ t: '\n' })
    const ppr = parsePPr(element(p, 'pPr'))
    const styleId = ppr && ppr.style ? ppr.style : ''
    const base = resolveRPr(sheet, styleId, null)
    for (const r of elements(p, 'r')) appendRun(runs, r, '', base, sheet)
    for (const h of elements(p, 'hyperlink')) {
      for (const r of elements(h, 'r')) appendRun(runs, r, '', base, sheet)
    }
    if (!align && ppr && ppr.jc) align = jcValue(ppr.jc)
  })
  return { runs, align }
}

function parseTable(node, sheet) {
  const block = { type: 'table', borders: 'none', rows: [], headerRows: 0 }
  const tblPr = element(node, 'tblPr')
  if (tblPr) {
    const width = element(tblPr, 'tblW')
    const wtype = attr(width, 'type')
    if (width && (wtype === '' || wtype === 'dxa')) block.tableWidth = intAttr(width, 'w')
    const jc = element(tblPr, 'jc')
    if (jc) block.tableAlign = jcValue(val(jc))
  }
  block.borders = tableBorders(sheet, tblPr)
  block.cellPad = tableCellPad(sheet, tblPr)
  const grid = descendant(node, 'tblGrid', 2)
  if (grid) {
    for (const col of elements(grid, 'gridCol')) {
      const w = intAttr(col, 'w')
      if (w > 0) (block.colWidths || (block.colWidths = [])).push(w)
    }
  }

  let owners = new Map()
  for (const row of elements(node, 'tr')) {
    const cells = []
    const curOwners = new Map()
    const trPr = element(row, 'trPr')
    const header = !!(trPr && onOff(element(trPr, 'tblHeader')))
    let col = 0
    for (const cell of elements(row, 'tc')) {
      const tcPr = element(cell, 'tcPr')
      const span = tcPr && element(tcPr, 'gridSpan') && intAttr(element(tcPr, 'gridSpan'), 'val') > 1
        ? intAttr(element(tcPr, 'gridSpan'), 'val')
        : 1
      const vmerge = tcPr ? element(tcPr, 'vMerge') : null
      if (vmerge && String(attr(vmerge, 'val')).toLowerCase() !== 'restart') {
        const owner = owners.get(col)
        if (owner) {
          block.rows[owner.row][owner.cell].rowspan += 1
          for (let k = 0; k < span; k += 1) curOwners.set(col + k, owner)
        }
        col += span
        continue
      }
      const { runs, align } = parseCellRuns(cell, sheet)
      const item = { runs, colspan: span, rowspan: 1 }
      if (align) item.align = align
      if (tcPr) {
        const tcw = element(tcPr, 'tcW')
        const wtype = attr(tcw, 'type')
        if (tcw && (wtype === '' || wtype === 'dxa')) item.width = intAttr(tcw, 'w')
        const valign = element(tcPr, 'vAlign')
        if (valign) item.valign = val(valign).toLowerCase()
        const shd = element(tcPr, 'shd')
        if (shd) {
          const fill = upperHex(attr(shd, 'fill'))
          if (fill && fill.toLowerCase() !== 'auto') item.bg = fill
        }
        const borders = cellBordersFrom(element(tcPr, 'tcBorders'))
        if (borders) item.borders = borders
        const mar = element(tcPr, 'tcMar')
        if (mar) {
          const left = element(mar, 'left')
          const right = element(mar, 'right')
          if (left && intAttr(left, 'w') > 0) item.pad = intAttr(left, 'w')
          else if (right && intAttr(right, 'w') > 0) item.pad = intAttr(right, 'w')
        }
      }
      const modelRow = block.rows.length
      for (let k = 0; k < span; k += 1) curOwners.set(col + k, { row: modelRow, cell: cells.length })
      cells.push(item)
      col += span
    }
    if (cells.length > 0) {
      block.rows.push(cells)
      if (header && block.headerRows === block.rows.length - 1) block.headerRows = (block.headerRows || 0) + 1
      owners = curOwners
    } else {
      owners = new Map()
    }
  }
  return block
}

/* ------------------------------------------------------------------ */
/* 页面设置与标题                                                      */
/* ------------------------------------------------------------------ */

const TWIPS_PER_CM = 566.9291338582677

function parsePageSetup(body) {
  const sect = element(body, 'sectPr')
  if (!sect) return null
  const size = element(sect, 'pgSz')
  const margin = element(sect, 'pgMar')
  if (!size && !margin) return null
  const page = { width: 21, height: 29.7, top: 2.54, right: 3.17, bottom: 2.54, left: 3.17 }
  if (size) {
    if (attr(size, 'w') !== '') page.width = round2(intAttr(size, 'w') / TWIPS_PER_CM)
    if (attr(size, 'h') !== '') page.height = round2(intAttr(size, 'h') / TWIPS_PER_CM)
  }
  if (margin) {
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      if (attr(margin, edge) !== '') page[edge] = round2(intAttr(margin, edge) / TWIPS_PER_CM)
    }
  }
  return page
}

function parseRels(entries) {
  const rels = new Map()
  const raw = entries.get('word/_rels/document.xml.rels')
  if (!raw) return rels
  for (const rel of elements(descendant(parseXml(raw.toString('utf8')), 'Relationships', 3), 'Relationship')) {
    if (attr(rel, 'TargetMode') === 'External') rels.set(attr(rel, 'Id'), attr(rel, 'Target'))
  }
  return rels
}

function coreTitle(entries, fallback) {
  try {
    const core = entries.get('docProps/core.xml')
    if (!core) return fallback
    const node = descendant(parseXml(core.toString('utf8')), 'title', 4)
    const title = textOf(node).trim()
    return title ? title.slice(0, 160) : fallback
  } catch (_error) {
    return fallback
  }
}

function blockText(block) {
  return (block.runs || []).map(run => run.t || '').join('')
}

/**
 * 把 DOCX 的 zip 成员解析成办公模型。
 * @param {Map<string, Buffer>} entries zip 成员
 * @param {string} fallbackTitle 文件主名
 */
export function importDocxEntries(entries, fallbackTitle) {
  const raw = entries.get('word/document.xml')
  if (!raw) throw new Error('DOCX 缺少 word/document.xml')
  const root = parseXml(raw.toString('utf8'))
  const body = descendant(root, 'body', 4)
  if (!body) throw new Error('DOCX 缺少 w:body')
  const rels = parseRels(entries)
  const sheet = buildStyleSheet(entries)
  const blocks = []
  let firstHeading = ''
  let index = 0

  for (const node of body.children || []) {
    if (!node.name) continue
    const name = local(node.name)
    if (name === 'sectPr') continue
    index += 1
    let block
    if (name === 'p') {
      block = parseParagraph(node, rels, sheet)
      if (block.type === 'h1' && !firstHeading) firstHeading = blockText(block).trim()
    } else if (name === 'tbl') {
      block = parseTable(node, sheet)
    } else {
      block = { type: 'passthrough', text: '[嵌入对象]' }
    }
    block.id = `b${index}`
    blocks.push(block)
  }
  if (blocks.length === 0) blocks.push({ id: 'b1', type: 'p', runs: [] })

  const doc = { blocks }
  const defaults = defaultsOf(sheet)
  if (defaults.font) doc.defaultFont = defaults.font
  if (defaults.size) doc.defaultSize = defaults.size
  const page = parsePageSetup(body)
  if (page) doc.page = page

  let title = coreTitle(entries, '')
  if (!title) title = firstHeading
  if (!title) title = fallbackTitle
  return { kind: 'doc', title, doc }
}
