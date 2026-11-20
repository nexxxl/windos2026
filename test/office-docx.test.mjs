import test from 'node:test'
import assert from 'node:assert/strict'

import { importDocxEntries } from '../src/office-docx.js'

// zip 成员直接用 Map 提供：解析器只读 Buffer，不关心压缩层。
function docx({ document, styles = '', theme = '', rels = '' }) {
  const entries = new Map()
  entries.set('word/document.xml', Buffer.from(document))
  if (styles) entries.set('word/styles.xml', Buffer.from(styles))
  if (theme) entries.set('word/theme/theme1.xml', Buffer.from(theme))
  if (rels) entries.set('word/_rels/document.xml.rels', Buffer.from(rels))
  return entries
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

test('表格：列宽、横纵合并、单元格边框、内边距与表头', () => {
  const document = `<?xml version="1.0"?><w:document ${NS}><w:body>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="8000" w:type="dxa"/>
        <w:jc w:val="center"/>
        <w:tblCellMar><w:left w:w="120" w:type="dxa"/></w:tblCellMar>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="5000"/></w:tblGrid>
      <w:tr>
        <w:trPr><w:tblHeader/></w:trPr>
        <w:tc><w:tcPr><w:gridSpan w:val="2"/><w:shd w:fill="EEEEEE"/></w:tcPr><w:p><w:r><w:t>标题</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcBorders><w:top w:val="single" w:sz="8" w:color="FF0000"/></w:tcBorders>
            <w:tcMar><w:left w:w="200" w:type="dxa"/></w:tcMar>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p><w:r><w:t>姓名</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>合并</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>年龄</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
      </w:tr>
    </w:tbl>
  </w:body></w:document>`
  const { doc } = importDocxEntries(docx({ document }), '报名表')
  const table = doc.blocks.find((block) => block.type === 'table')
  assert.ok(table, '应解析出表格')
  assert.deepEqual(table.colWidths, [3000, 5000])
  assert.equal(table.tableWidth, 8000)
  assert.equal(table.tableAlign, 'center')
  assert.equal(table.cellPad, 120)
  assert.equal(table.headerRows, 1)
  assert.equal(table.rows.length, 3)
  assert.equal(table.rows[0][0].colspan, 2)
  assert.equal(table.rows[0][0].bg, 'EEEEEE')
  assert.equal(table.rows[1][0].borders.top, 'single:8:FF0000')
  assert.equal(table.rows[1][0].pad, 200)
  assert.equal(table.rows[1][0].valign, 'center')
  assert.equal(table.rows[1][1].rowspan, 2)
  assert.equal(table.rows[2].length, 1, '纵向合并的后续行不再生成新格')
})

test('段落：docDefaults、主题字体、字符缩进与间距', () => {
  const document = `<?xml version="1.0"?><w:document ${NS}><w:body>
    <w:p><w:pPr><w:jc w:val="center"/><w:ind w:leftChars="200" w:firstLineChars="200"/><w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>正文</w:t></w:r></w:p>
  </w:body></w:document>`
  const styles = `<?xml version="1.0"?><w:styles ${NS}>
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:eastAsiaTheme="minorEastAsia"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  </w:styles>`
  const theme = `<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <a:themeElements><a:fontScheme><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="宋体"/></a:minorFont></a:fontScheme></a:themeElements>
  </a:theme>`
  const { doc } = importDocxEntries(docx({ document, styles, theme }), '正文')
  assert.equal(doc.defaultFont, '宋体')
  assert.equal(doc.defaultSize, 24)
  const block = doc.blocks[0]
  assert.equal(block.type, 'p')
  assert.equal(block.align, 'center')
  assert.equal(block.indentLeft, 480, '2 字符 × 12pt = 480 twips')
  assert.equal(block.indentFirst, 480)
  assert.equal(block.spaceBefore, 240)
  assert.equal(block.spaceAfter, 120)
  assert.equal(block.lineHeight, 360)
  assert.equal(block.lineRule, 'auto')
  assert.equal(block.runs[0].b, true)
})

test('Wingdings 勾选框与超链接', () => {
  const document = `<?xml version="1.0"?><w:document ${NS}><w:body>
    <w:p>
      <w:r><w:sym w:font="Wingdings" w:char="00FE"/></w:r>
      <w:hyperlink r:id="rId7" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:r><w:t>链接</w:t></w:r></w:hyperlink>
    </w:p>
  </w:body></w:document>`
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
  </Relationships>`
  const { doc } = importDocxEntries(docx({ document, rels }), '符号')
  const runs = doc.blocks[0].runs
  assert.equal(runs[0].t, '☑')
  assert.equal(runs[1].t, '链接')
  assert.equal(runs[1].link, 'https://example.com')
})

test('页面设置按 twips 换成厘米', () => {
  const document = `<?xml version="1.0"?><w:document ${NS}><w:body>
    <w:p><w:r><w:t>x</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>
  </w:body></w:document>`
  const { doc } = importDocxEntries(docx({ document }), '页面')
  assert.deepEqual(doc.page, { width: 21, height: 29.7, top: 2.54, right: 3.18, bottom: 2.54, left: 3.18 })
})
