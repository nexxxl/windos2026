# NexlOS 千禧主题字体与素材来源

核验日期：2026-11-04。

## Windows2026 工作界面字体

2026-11-05 补充 Adobe 官方开源字体，保留上游原始字节，未子集化或重新命名字体：

- **Source Sans 3**：`source-sans-3-variable.woff2`，164,736 字节。
  原文件 `WOFF2/VF/SourceSans3VF-Upright.otf.woff2`，来自
  [adobe-fonts/source-sans](https://github.com/adobe-fonts/source-sans)，固定提交
  `87b37a2daaed80fcb8e8ccb0085c4d72ddade12e`。
  同一份可变字体提供真实的 400 / 600 界面字重，避免分别加载两份静态字体。

字体增量 **164,736 字节（约 161 KiB）**，小于约 200 KB 的初始目标；
相比两个静态字重合计 218,532 字节更小。无需为减小文件而生成派生子集。

字体使用 **SIL Open Font License 1.1**，完整上游版权与许可保存在
`source-sans-LICENSE.md`，原始 README 同时随附。
`sources.json` 为每个文件保留固定版本 URL、Git blob SHA、字节数与 SHA-256。
加载声明可全局发现；界面选择仍只在 Windows2026 主题作用域内应用。
Source 字体未覆盖的中文、日文、韩文由主题中的系统字族回退显示；不宣称完整 CJK 覆盖。
融合模式 `Source Sans 3 + Pixel` 使用 Source Sans 3 显示拉丁字符，并由下文 Fusion Pixel
接续支持的 CJK 字符；平滑模式 `Source Sans 3` 直接使用系统中文后备字体。
启动字标单独使用下节的 Libre Franklin 直立粗黑字体，不额外加载斜体字体。

## 直立粗黑启动字标

2026-11-05 补充 **Libre Franklin Black**，用于启动画面 `Nexl` 与 `WINDOS2026`
的同一套直立粗黑字形。CSS family 为 `Libre Franklin`，准确字重为 **900**，
`font-style: normal`；静态 WOFF2 文件 `libre-franklin-black.woff2` 为 **53,516 字节**。

来源为[官方 impallari/Libre-Franklin 仓库](https://github.com/impallari/Libre-Franklin)，
固定提交 `5e76d2f48045806a2d6827622df023aec97cd59e`，原路径
`fonts/webfonts/LibreFranklin-Black.woff2`。文件保留上游原字节，未子集化、转换或修改。
字体版本为 3.000，解析确认其为非可变、非斜体的 900 字重，并覆盖两个启动字标所用字符。

Libre Franklin 是对 Franklin 系列经典字形的开源诠释；此处用作启动字标的视觉方向。
完整 **SIL Open Font License 1.1** 与上游说明分别随附于
`libre-franklin-OFL.txt` / `libre-franklin-README.md`，固定来源与哈希列于 `sources.json`。
该字体仅供启动画面引用，工作界面继续使用上一节的 Source Sans 3 字族设置。

## 字体

`ms_sans_serif.woff2` 与 `ms_sans_serif_bold.woff2` 是 FontStruct 用户 **lou**
制作的像素字体再创作，分别名为 “MS Sans Serif” 与 “MS Sans Serif Bold”。
它们不是从 Windows 安装包中提取的 Microsoft 原版字体。

- Regular：[FontStruction 1384746](https://fontstruct.com/fontstructions/show/1384746)
- Bold：请参见原始 [source/bold/license.txt](source/bold/license.txt) 中的字体主页。
- 字体许可：Creative Commons Attribution Share Alike 3.0，
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。
- 分发来源：[jdan/98.css](https://github.com/jdan/98.css)，固定提交
  `b1d7a907371bbe523d6f64e3af97f714fdbd6d6a`。
- WOFF2 与原始 TTF 均按上游原字节保存，没有修改字形、转换格式或重新子集化。
- `source/regular/` 与 `source/bold/` 保留上游字体源目录的 TTF、许可与 readme。
  再分发字体时应同时保留这些归属、许可与说明；派生字体适用相同许可要求。
- `sources.json` 记录每个上游文件的路径、固定版本 URL、Git blob SHA、字节数和 SHA-256，
  可据此复核；两个 WOFF2 文件已验证文件头为 `wOF2`。

98.css 仓库本身使用 MIT 许可，完整原文保存在 `98.css-LICENSE.txt`。
该许可不替代字体自己的 CC BY-SA 3.0 许可。NexlOS 仅使用这里列出的字体资源，
没有整体导入 98.css 的组件 CSS；`ui/win98.css` 的部分控件及边框规则经作用域改编，
保留上述 MIT 归属。整套桌面尺寸另参照 wieslawsoltes/Win98，相关代码许可随附于
`Win98-LICENSE.txt`；没有导入它的窗口运行时、虚拟盘或历史图标。
`retro-font.css` 是 NexlOS 的本地加载声明，
为避免与系统字体混淆，CSS family 名称使用 `NexlOS MS Sans Serif`。

本字体主要覆盖拉丁字符，中文由主题声明的后备字体显示。像素字形适合 11px 原始字号
及整数倍显示；浏览器缩放、设备像素比与中文后备字体会影响最终栅格效果。

## 中文像素字体

`fusion-pixel-12px-proportional-zh_hans.otf.woff2` 使用
[缝合像素字体 / Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)，
作者为 TakWolf 及上游字体贡献者，字体许可为 **SIL Open Font License 1.1**。
完整声明见 `fusion-pixel-LICENSE-OFL.txt`；该许可独立于前述 MS Sans Serif 的许可。

- 使用官方 12px 比例模式简体中文字形版本，CSS family 为 `NexlOS Fusion Pixel`。
- 从[官方演示站](https://fusion-pixel-font.takwolf.com/)取得原始 WOFF2，未修改字形或子集化。
- 内部字体版本已解析核实为 `2026.10.25`；对应官方 release 标签 `2026.10.25`，
  源码 commit 为 `3266d59c25c3fa8f8b5e163b29736a706fd9ab6f`。
- 许可文件取自上述固定源码 commit；`sources.json` 分别记录字体实际下载来源、
  版本、字节数与 SHA-256。尚未把演示站字体冒称为已与 release 压缩包逐字节比对的文件。
- 字体文件为 691,364 字节，解析得到 38,133 个映射码点；所检查的 NexlOS 中文界面标签
  均有字形，但此结果不保证任意用户姓名、文件名、正文或全部 CJK 字符均被覆盖。
  缺失字符仍使用系统中文后备字体。
- 使用 12px 原始字号与适当行高，避免把 12px 字形缩成 11px；复杂汉字可能受设备像素比、
  浏览器缩放与字体栅格器影响。这是开源像素字体重现，不是 Windows 原版中文字体。

## 图标

`../../classicicons.js` 中的图形为 NexlOS 独立绘制的像素 SVG：使用 16 格逻辑像素，
映射到 32×32 viewBox，支持 16px / 32px 的整数像素显示。显示器、文件夹、纸页、
书本和齿轮等均使用新编写的几何形状与配色；没有从 Microsoft DLL、ICO、Windows
安装介质或第三方图标包中提取或复制图标，也没有使用 Windows 标志。

图标属于 NexlOS 本地源代码，字体的 CC BY-SA 3.0 许可不适用于这些独立绘制的图标。
“Windos2026”是 NexlOS 的界面主题名称，不表示 Microsoft 官方产品、授权或背书。
