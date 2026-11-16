// 便捷办公（/a/office/）的英文界面词表。
//
// 办公应用是独立 iframe，自带 300 余条界面文案；第一版 GitHub 发布要求全英文，
// 这里只登记「中文原文 → English」的覆盖层，由 i18n.js 的 officeTranslate 使用。
// 词条不并进主词表：办公里的「应用」是 Apply、「页面」是 Page，与桌面外壳同名不同义，
// 全局合并会污染其他应用。
//
// 非中文语言走既有回退链：办公词表未命中 → 主词表英文 → 中文原文。
// 新增文案时只补这里；zh-CN 永远显示原文。
export const rows = `便捷办公|Office
工作区|Workspace
回首页|Home
菜单栏|Menu bar
文件列表|Files
导入文件|Import file
最近|Recent
新建文档|New document
新建表格|New spreadsheet
新建演示文稿|New presentation
新建 Markdown|New Markdown file
新建 HTML|New HTML file
打开 PDF|Open PDF
文件|File
编辑|Edit
视图|View
格式|Format
工具|Tools
帮助|Help
保存|Save
另存为|Save as
另存为…|Save as…
打印…|Print…
打印|Print
撤销|Undo
重做|Redo
剪切|Cut
复制|Copy
粘贴|Paste
全选|Select all
删除|Delete
重命名|Rename
重命名…|Rename…
关闭|Close
关闭工具|Close tools
确定|OK
取消|Cancel
确认|Confirm
确认删除|Confirm delete
删除文件|Delete file
文件名|File name
文件名不能为空|File name cannot be empty
另存为会生成一个新文件，原文件保持不变。|Save as creates a new file and leaves the original unchanged.
PDF 文件不需要另存为|PDF files do not need Save as
（副本）| (copy)
未命名文件|Untitled file
（无标题）|(Untitled)
就绪|Ready
已保存|Saved
保存中…|Saving…
保存失败，重试中…|Save failed, retrying…
未保存|Unsaved
磁盘有更新|New version on disk
磁盘上已有新版本，点状态栏重载|A newer version is on disk. Click the status bar to reload.
已删除|Deleted
已导入|Imported
导入中…|Importing…
导出中…|Exporting…
已导出所选格式|Exported the selected format
已生成副本|Copy created
已恢复|Restored
恢复|Restore
放弃|Discard
刚刚|just now
分钟前|min ago
小时前|h ago
加粗|Bold
斜体|Italic
下划线|Underline
删除线|Strikethrough
上标|Superscript
下标|Subscript
字体|Font
字号|Size
增大字号|Increase font size
减小字号|Decrease font size
字体颜色|Font color
文字颜色|Text color
突出显示|Highlight
突出显示颜色|Highlight color
左对齐|Align left
居中|Center
右对齐|Align right
两端对齐|Justify
项目符号|Bullets
编号|Numbering
减少缩进|Decrease indent
增加缩进|Increase indent
清除格式|Clear formatting
格式刷|Format painter
格式刷：复制当前格式后选中目标文字|Format painter: copy the current format, then select the target text
已复制格式：选中目标文字后点格式刷图标|Format copied: select the target text, then click the format painter
段落样式|Paragraph style
样式|Styles
正文|Body
标题 1|Heading 1
标题 2|Heading 2
标题 3|Heading 3
标题 4|Heading 4
段落|Paragraph
插入|Insert
表格|Table
插入表格|Insert table
插入 3 × 3 表格|Insert 3 × 3 table
插入链接|Insert link
链接…|Link…
链接地址|Link address
先填链接地址|Enter a link address first
插入分隔线|Insert divider
分隔线|Divider
插入分页符|Insert page break
分页符|Page break
在末尾添加段落|Add paragraph at end
插入文本框|Insert text box
对象|Object
复制选中对象|Duplicate object
删除选中对象|Delete object
排列|Arrange
上移一层|Bring forward
下移一层|Send backward
艺术字|Text effects
朱红标题|Vermilion title
海蓝粗黑|Marine bold
金色楷体|Golden Kai
淡雅引文|Elegant quote
先选中要应用艺术字的文字|Select the text for text effects first
目录|Contents
目录（标题 1–3）|Table of contents (Headings 1–3)
目录（标题 1–4）|Table of contents (Headings 1–4)
更新目录|Update table of contents
大纲|Outline
显示大纲|Show outline
关闭大纲|Close outline
还没有标题。把段落样式设为「标题 1–4」后，大纲会自动出现。|No headings yet. Set a paragraph style to Heading 1–4 and the outline appears automatically.
大纲只用于 文档。|The outline applies to Documents only.
页面设置…|Page setup…
页面设置：页边距、页眉页脚|Page setup: margins, header and footer
页面设置已应用，导出文档时写入|Page setup applied; written when exporting to Word
快速页边距|Quick margins
页边距（厘米）|Margins (cm)
左边距|Left margin
右边距|Right margin
上边距|Top margin
下边距|Bottom margin
左|Left
右|Right
上|Top
下|Bottom
拖动调整左边距，方向键微调|Drag to adjust the left margin; arrow keys fine-tune
拖动调整右边距，方向键微调|Drag to adjust the right margin; arrow keys fine-tune
页眉|Header
页眉文字|Header text
页脚|Footer
页脚文字|Footer text
显示页码|Show page numbers
页码|Page number
纸张：A4（21 × 29.7 厘米）|Paper: A4 (21 × 29.7 cm)
应用|Apply
宽|Wide
常规|Normal
窄|Narrow
适中|Moderate
页边距：常规|Margins: Normal
页边距：窄|Margins: Narrow
页边距：适中|Margins: Moderate
页边距：宽|Margins: Wide
阅读比例：100%|Zoom: 100%
阅读比例：页宽|Zoom: page width
阅读比例：整页|Zoom: whole page
阅读比例：双页|Zoom: two pages
阅读比例：四页|Zoom: four pages
显示比例|Zoom
显示比例：可选择百分比、页宽、整页，或双页 / 四页同时阅览|Zoom: choose a percentage, page width, whole page, or two/four pages at once
百分比|Percent
页宽|Page width
整页|Whole page
双页|Two pages
四页|Four pages
页面|Page
页面列表|Pages
上一页|Previous page
下一页|Next page
页面视图与分页说明|Page view and pagination
页面视图按 A4 自动分页；状态栏可切换页宽、整页、双页、四页|Page view paginates to A4 automatically; the status bar switches page width, whole page, two pages, or four pages
工作表|Sheet
单元格|Cell
数字格式|Number format
数值 0.00|Number 0.00
百分比格式|Percent format
货币格式|Currency format
保留两位小数|Two decimal places
数字|Number
日期|Date
货币|Currency
自动求和|AutoSum
升序|Sort ascending
降序|Sort descending
冻结窗格|Freeze panes
冻结 / 取消冻结首行|Freeze / unfreeze top row
边框|Borders
边框：无 / 细线 / 粗线|Borders: none / thin / thick
插入行|Insert row
删除行|Delete row
插入列|Insert column
删除列|Delete column
在上方插入行|Insert row above
在左侧插入列|Insert column left
增加 20 行|Add 20 rows
增加 5 列|Add 5 columns
输入值或 =SUM(A1:A9)|Enter a value or =SUM(A1:A9)
先拖选要排序的多行|Select the rows to sort first
先拖选两个以上的单元格|Select at least two cells first
把光标放到数字下方，或先选中要合计的区域|Place the cursor below the numbers, or select the range to total
合并单元格|Merge cells
合并后居中 / 取消合并|Merge and center / Unmerge
对齐方式|Alignment
顶端对齐|Top
垂直居中|Middle
底端对齐|Bottom
文本框底色|Text box fill
填充颜色|Fill color
新建幻灯片|New slide
删除幻灯片|Delete slide
双击输入文字|Double-click to add text
预览|Preview
刷新预览|Refresh preview
Markdown 源码|Markdown source
HTML 源码|HTML source
HTML 预览|HTML preview
PDF 预览|PDF preview
新窗口打开|Open in new window
代码块|Code block
引用|Quote
只读|Read-only
· 只读|· Read-only
API 未就绪|API not ready
原始内容（图片 / 域 / 图形）已保留，保存时按原字节写回。|Raw content (images / fields / shapes) is preserved and written back byte for byte.
还没有文件。新建一个，或从磁盘导入 DOCX / XLSX / PPTX。|No files yet. Create one, or import a DOCX / XLSX / PPTX from disk.
最近没有文件。|No recent files.
先打开一个文件|Open a file first
文件超过 128 MB|File is larger than 128 MB
有未保存的修改，请先处理保存错误|You have unsaved changes. Resolve the save error first.
磁盘上的版本已经变了，仍要用恢复内容覆盖吗？|The version on disk has changed. Overwrite it with the recovered content?
正在查找打印机…|Finding printers…
打印机|Printer
打印设置…|Print settings…
浏览器打印 / 系统打印对话框|Browser print / system print dialog
未检测到网络打印机。可用浏览器打印对话框选择系统打印机（Wi-Fi / 蓝牙配对后由系统管理）。|No network printer found. Use the browser print dialog to pick a system printer (the system manages it after Wi-Fi/Bluetooth pairing).
已发送到打印机|Sent to printer
自动保存已开启：停止输入 1.2 秒后写盘|Autosave is on: writes to disk 1.2 s after you stop typing
自动保存：开|Autosave: on
关于便捷办公|About Office
便捷办公 · NexlOS 内置 Office|Office · built into NexlOS
便捷办公工具|Office tools
快捷键：Ctrl+S 保存 / Ctrl+P 打印 / Ctrl+Shift+S 另存为|Shortcuts: Ctrl+S Save / Ctrl+P Print / Ctrl+Shift+S Save as
Ctrl+S 保存，Ctrl+Shift+S 另存为，Ctrl+P 打印|Ctrl+S Save, Ctrl+Shift+S Save as, Ctrl+P Print
Markdown 转 X 线程|Markdown to X thread
Markdown 转公众号排版|Markdown to WeChat article
二维码生成|QR code generator
中文|Chinese
西文无衬线|Latin sans
西文衬线|Latin serif
手写与装饰|Handwriting & decorative
等宽|Monospace
系统字体|System fonts
默认字体|Default font
苹方|PingFang
宋体|Songti
黑体|Heiti
楷体|Kaiti
微软雅黑|Microsoft YaHei
思源黑体|Noto Sans SC
思源宋体|Noto Serif SC
霞鹜文楷|LXGW WenKai
霞鹜新致宋|LXGW Neo ZhiSong
得意黑|Smiley Sans
二维码生成器|QR code generator
离线运行 · 内容不会上传|Works offline · content stays on this device
内容|Content
0 字节|0 bytes
粘贴网址或输入任意文字|Paste a URL or type any text
纠错级别|Error correction
级别越高越抗污损，容量越小|Higher levels resist damage better and hold less data
L · 低|L · Low
M · 中|M · Medium
Q · 较高|Q · Quartile
H · 高|H · High
输出尺寸|Output size
下载的 PNG 按此像素输出|The downloaded PNG uses this pixel size
颜色|Colors
前景色|Foreground color
背景色|Background color
前景|Foreground
背景|Background
中心 Logo|Center logo
可选，会自动加底色与圆角|Optional. Adds a backing plate and rounded corners.
选择图片|Choose image
未选择|No file
移除|Remove
Logo 占比|Logo size
在左侧输入内容，这里会生成二维码|Type on the left and the QR code appears here
下载 PNG|Download PNG
复制图片|Copy image
复制后直接粘贴到公众号编辑器，样式随内容走|Copy, then paste into the WeChat editor. Styling travels with the content.
导出 HTML|Export HTML
复制富文本|Copy rich text
主题|Theme
行距|Line spacing
Markdown 原文|Markdown source
0 字|0 words
公众号预览|WeChat preview
左侧输入后，这里实时显示公众号样式|Type on the left to see the WeChat styling here
阅读（浅底）|Reading (light)
纸感（米色）|Paper (cream)
极简（无装饰）|Minimal (plain)
墨色（深标题）|Ink (dark headings)
导出|Export
先粘贴 Markdown 内容。|Paste some Markdown first.
已复制富文本，去公众号编辑器粘贴即可。|Rich text copied. Paste it into the WeChat editor.
当前浏览器不支持富文本复制，已复制纯文本，需要手动排版。|This browser cannot copy rich text. Plain text was copied and needs styling by hand.
复制被浏览器拦截。可以改用「导出 HTML」，或手动全选预览区按 Ctrl/Cmd+C。|The browser blocked the copy. Use Export HTML, or select the preview and press Ctrl/Cmd+C.
已导出 HTML 文件。|HTML file exported.
在这里粘贴 Markdown。支持：# 标题、列表、表格、引用、代码块（带语言名会高亮）、图片、链接、粗体斜体删除线。|Paste Markdown here. Headings, lists, tables, quotes, code blocks (add a language name to highlight), images, links, bold, italic, and strikethrough are supported.
按 280 字符自动分条，URL 一律按 23 字符计|Splits at 280 characters; every URL counts as 23
重新拆分|Split again
复制全部|Copy all
每条加上「1/n」编号|Number each post with “1/n”
计数口径：ASCII 计 1，中文、日文、韩文与 emoji 计 2，链接计 23（与 X 一致）|How counting works: ASCII 1, CJK and emoji 2, links 23 (the same as X)
线程预览|Thread preview
左侧输入后，这里自动分成多条|Type on the left to split the text into posts
复制这条|Copy post
在此拆分|Split here
删除这条|Delete post
复制被浏览器拦截，请手动选中文本复制。|The browser blocked the copy. Select the text and copy it by hand.
还没有内容。|Nothing to copy yet.
在这里粘贴 Markdown。标题、列表、引用、代码块、表格都会转成纯文本。|Paste Markdown here. Headings, lists, quotes, code blocks, and tables become plain text.`.split('\n').map(line => {
  const cut = line.indexOf('|');
  return [line.slice(0, cut), line.slice(cut + 1)];
});

// 动态文案：槽位 {0}…{n} 由捕获值原样填回，用户数据不翻译。
export const templates = [
  ['第 {0} 页', 'Page {0}'],
  ['第 {0} 页，共 {1} 页', 'Page {0} of {1}'],
  ['{0} 页', '{0} pages'],
  ['{0} 字', '{0} words'],
  ['{0} 分钟前', '{0} min ago'],
  ['{0} 小时前', '{0} h ago'],
  ['{0} 月 {1} 日', '{0}/{1}'],
  ['阅读比例：{0}', 'Zoom: {0}'],
  ['页边距：{0}', 'Margins: {0}'],
  ['单元格 {0}', 'Cell {0}'],
  ['删除 {0}', 'Delete {0}'],
  ['目录为空：把章节文本设为「标题 1–{0}」，再点「更新目录」。', 'The contents list is empty. Set chapter text to Heading 1–{0}, then click Update table of contents.'],
  ['上次异常关闭时有内容没写入磁盘：{0}，候选 rev {1} / 磁盘 rev {2}。', 'Content was not written to disk when the app closed unexpectedly: {0}, candidate rev {1} / disk rev {2}.'],
  ['上次异常关闭时有内容没写入磁盘：{0}，候选 rev {1} / 磁盘 rev {2}（另有 {3} 个）。', 'Content was not written to disk when the app closed unexpectedly: {0}, candidate rev {1} / disk rev {2} ({3} more).'],
  ['确定删除「{0}」？文件会从工作区移除，不能恢复。', 'Delete “{0}”? The file will be removed from the workspace and cannot be restored.'],
  ['已另存为「{0}」', 'Saved as “{0}”'],
  ['已导入 {0}', 'Imported {0}'],
  ['已恢复 {0}', 'Restored {0}'],
  ['检测到 {0} 台打印机。也可以直接使用浏览器打印。', 'Found {0} printers. You can also print from the browser.'],
  ['已发送到打印机：{0}', 'Sent to printer: {0}'],
  ['无法连接本地服务：{0}', 'Cannot reach the local service: {0}'],
  ['删除失败：{0}', 'Delete failed: {0}'],
  ['打印失败：{0}', 'Print failed: {0}'],
  ['另存为失败：{0}', 'Save as failed: {0}'],
  ['打开失败：{0}', 'Open failed: {0}'],
  ['新建失败：{0}', 'Create failed: {0}'],
  ['导入失败：{0}', 'Import failed: {0}'],
  ['恢复失败：{0}', 'Restore failed: {0}'],
  ['操作失败：{0}', 'Action failed: {0}'],
  ['磁盘有更新{0}', 'New version on disk{0}'],
  // 离线工具页（二维码 / 公众号 / X 线程）。
  ['{0} 字节 / 上限约 {1} 字节', '{0} bytes / about {1} bytes max'],
  ['内容超出容量：当前纠错级别最多约 {0} 字节（UTF-8），请缩短内容或改用更低的纠错级别。', 'Content exceeds capacity. At this error-correction level the limit is about {0} bytes (UTF-8). Shorten the content or pick a lower level.'],
  ['版本 {0} · {1}×{1} 模块 · 纠错 {2} · 输出 {3}×{3} px', 'Version {0} · {1}×{1} modules · correction {2} · output {3}×{3} px'],
  ['前景与背景对比度偏低（{0}:1），部分扫码器可能识别失败，建议加深前景色或提亮背景。', 'Foreground and background contrast is low ({0}:1). Some scanners may fail; darken the foreground or lighten the background.'],
  ['已叠加 Logo。遮挡会吃掉部分码字，建议把纠错级别调到 H 再导出。', 'Logo applied. The overlay hides part of the code; set error correction to H before exporting.'],
  ['Logo 占比较大，建议缩小到 22% 以内，导出后先扫一次确认。', 'The logo takes a large share. Shrink it below 22% and scan the export once to confirm.'],
  ['已叠加 Logo，导出后建议先扫一次确认。', 'Logo applied. Scan the export once to confirm.'],
  ['这个文件无法作为图片读取，请换一张 PNG/JPG。', 'This file cannot be read as an image. Try a PNG or JPG.'],
  ['先输入内容再下载。', 'Enter some content before downloading.'],
  ['已下载 PNG（{0}×{0}）。', 'Downloaded PNG ({0}×{0}).'],
  ['先输入内容再复制。', 'Enter some content before copying.'],
  ['当前浏览器不支持复制图片，请用「下载 PNG」。', 'This browser cannot copy images. Use Download PNG.'],
  ['二维码图片已复制到剪贴板。', 'QR code image copied to the clipboard.'],
  ['浏览器拒绝了剪贴板写入，请用「下载 PNG」。', 'The browser refused the clipboard write. Use Download PNG.'],
  ['{0} 字 · {1} 行', '{0} words · {1} lines'],
  ['第 {0} 条', 'Post {0}'],
  ['{0} 条 · 合计 {1} 字符', 'Posts: {0} · {1} characters'],
  ['已复制第 {0} 条。', 'Post {0} copied.'],
  ['这条太短，没法再拆。', 'This post is too short to split.'],
  ['已拆成两条。', 'Split into two posts.'],
  ['已删除第 {0} 条。', 'Post {0} deleted.'],
  ['有 {0} 条超过 280，请手动精简。', 'Some posts are over 280 characters ({0}). Trim them by hand.'],
  ['已分成 {0} 条。', 'Thread split into {0}.'],
  ['已复制全部 {0} 条，条与条之间空一行。', 'Copied the whole thread, with a blank line between posts.'],
];
