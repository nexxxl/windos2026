# 第三方来源与许可

本文件按 Godot 工程 `COPYRIGHT.txt` 的组织方式写：每个文件组一段，记清 **覆盖哪些文件 / 来自哪里 / 实际取用了什么 / 我们重写了什么 / 版权行 / 许可与全文位置**。许可全文集中在第 8 节和随附的 `*LICENSE.txt` 里。

本文件只记录来源与许可，不改变各组件的授权范围，也不构成「全部代码从零原创」的声明。

## 1. 直接集成（上游代码原样或仅做打包处理）

### 1.1 xterm.js 终端

- **Files**：`webos/a/vendor/xterm.js`、`xterm-addon-fit.js`、`xterm-addon-webgl.js`、`xterm.css`
- **Origin**：xterm.js 4.19.0、xterm-addon-fit 0.5.0、xterm-addon-webgl 0.12.0（`github.com/xtermjs/xterm.js`）
- **Taken**：库文件与样式
- **Rewritten**：无。终端外观、快捷键与命令接口由 `webos/a/term.js` 提供
- **Copyright**：`Copyright (c) 2017-2019, The xterm.js authors`、`Copyright (c) 2014-2016, SourceLair Private Company`、`Copyright (c) 2012-2013, Christopher Jeffrey`
- **License**：MIT，全文 `webos/a/vendor/xterm-LICENSE.txt`

### 1.2 jsQR 二维码解码

- **Files**：`webos/a/vendor/jsQR.js`
- **Origin**：jsQR 1.4.0（`github.com/cozmo/jsQR`）
- **Taken**：解码库
- **Rewritten**：无
- **License**：Apache-2.0，全文 `webos/a/vendor/jsQR-LICENSE.txt`

### 1.3 Readability 正文提取

- **Files**：`vendor/readability.js`
- **Origin**：Arc90 Readability（`github.com/mozilla/readability`，源头为 Arc90 的 readability.js 1.7.1）
- **Taken**：正文与元数据提取实现
- **Rewritten**：无
- **Copyright**：`Copyright (c) 2010 Arc90 Inc`（见文件头）
- **License**：Apache-2.0，全文 `vendor/readability-LICENSE.txt`

### 1.4 jpeg-js

- **Files**：npm 运行时依赖，随 `package-lock.json` 安装
- **Origin**：jpeg-js 0.4.4（`github.com/eugeneware/jpeg-js`）
- **Taken**：JPEG 编解码
- **License**：BSD-3-Clause，全文随依赖安装，版本由 `package-lock.json` 固定

### 1.5 字体

- **Files**：`webos/a/vendor/retro-font/`、`webos/a/vendor/space-grotesk/`、`webos/a/office/fonts/`
- **Origin**：各字体上游项目
- **Taken**：字体文件及随附说明
- **License**：OFL 1.1（多数）、CC BY-SA 3.0（个别）；原版权与许可随字体保留，见目录内 `LICENSE` / `LICENSES.md`

### 1.6 Nayuki 二维码生成

- **Files**：`webos/a/office/tools/qrcode.html`
- **Origin**：Nayuki 的 QR Code generator（`github.com/nayuki/QR-Code-generator`）
- **Taken**：算法与实现片段
- **Copyright**：`Copyright (c) Project Nayuki`
- **License**：MIT，完整文本在对应 HTML 内

### 1.7 98.css 与 Win98 控件参考

- **Files**：`webos/a/win98.css`
- **Origin**：98.css（Jordan Scales，`github.com/jdan/98.css`）与 Win98 控件视觉参考
- **Taken**：控件样式规则
- **Rewritten**：按本项目的主题变量与布局重排
- **License**：MIT，全文 `webos/a/vendor/retro-font/98.css-LICENSE.txt`、`webos/a/vendor/retro-font/Win98-LICENSE.txt`

## 2. 算法移植（按上游公式或结构重写，未整段复制代码）

### 2.1 perfect-freehand 变宽笔迹

- **Files**：`webos/a/draw/board.js`（`PF` 模块）
- **Origin**：perfect-freehand 1.2.x（`github.com/steveruizok/perfect-freehand`）
- **Taken**：压力点 → 左右轮廓 → 闭合多边形的算法步骤与参数含义
- **Rewritten**：按本项目画板结构重写
- **Copyright**：`Copyright (c) 2021 Stephen Ruiz Ltd`
- **License**：MIT，全文 `webos/a/draw/perfect-freehand-LICENSE.txt`

### 2.2 grok-ball 眼环几何

- **Files**：`webos/a/orb.js`
- **Origin**：自有应用 NovaVia-app 的 `orbFace.ts` / `orbEyeRings.ts` / `orbLife.ts` 移植；其中眼环几何常量 `EYE_RINGS` 取自 `tycoding/grok-ball`
- **Taken**：仅 `EYE_RINGS` 常量表
- **Rewritten**：其余为自有实现，版权归 NexlOS Authors
- **Copyright**：`Copyright (c) 2026 tycoding`（仅常量部分）
- **License**：MIT，全文 `webos/a/orb-LICENSE.txt`

### 2.3 ArtCraft 移植版（ArtCraft for NexlOS）——上游 ArtCraft 的结构与算法

- **Files**：`webos/a/artcraftport.js`（加载器）、`extras/artcraftport/`（可选包源，安装后位于 `webos/extras/artcraftport/`）
- **Origin**：storytold 的 ArtCraft（`github.com/storytold/artcraft`，官网 `getartcraft.com`），MIT / Apache-2.0 双许可，本项目按 MIT 使用
- **Taken**：贝塞尔求值与反解、de Casteljau 分割、可分离卷积参数、CSS 渐变解析、音频分桶与限幅参数、文档外壳字段、应用清单与面板组织
- **Rewritten**：全部实现按零依赖 ES Module 重写；Rust 引擎、Tauri 宿主、AI 生成与 React 组件均未带入
- **Copyright**：`Copyright (c) 2026 ArtCraft Team and the ArtCraft contributors`
- **License**：MIT，全文见第 8.1 节；逐文件对应关系见 `docs/artcraftport/ATTRIBUTION.md`

## 3. 自有实现（无第三方代码）

### 3.1 NEXL-HTML L1 DOM 解释器

- **Files**：`vendor/nexl-l1.js`
- **Origin**：本项目自有组件，由本仓库 `core/` 构建
- **License**：Apache-2.0，见 `vendor/nexl-l1-LICENSE.txt` 与 `vendor/NEXL-L1-NOTICE.md`

### 3.2 便捷办公

- **Files**：`webos/a/office/`
- **Origin**：本项目自写前端；格式解析在同版本 Go 模块 `modules/office/`
- **Taken**：无第三方办公库
- **License**：随本项目；依据见 `docs/office-provenance.md`

## 4. 机制参考（只参考接口形态，未复制实现）

`webos/a/win.js` 与 `webos/a/session.js` 的注释记录了几家开源桌面项目的窗口几何与会话模型：daedalOS（MIT）、OWD（MIT）、OS.js（BSD-2）。这些代码按本项目结构重写成纯函数，没有复制上游实现，因此不随附上游许可全文。若后续把上游代码整段搬入，必须在同一提交里补版权行与许可全文，并在第 1 节新增一段。

## 5. 界面命名

应用名 **ArtCraft 移植版 / ArtCraft for NexlOS** 中的 ArtCraft 指上游项目，用来说明本模块的来源与移植关系，属于指名性使用（nominative use）：名称始终带「移植版 / for NexlOS」限定，界面与文档同时标注「非官方」，不使用上游的标志、图标或界面素材。其余功能名一律使用能力描述（「位图 · 图层」「剪辑 · 时间线」「文档 · 富文本」等），不使用第三方产品名。详见 `TRADEMARK.md` 第 6.1 节。

## 6. 宿主与素材

DSH / DeepSeek Harness 是运行宿主，并非本目录复制的参考仓库；宿主注入模块、可选 Agent Teams、Chromium 与系统软件遵循各自许可。

壁纸来源与授权记录以 `webos/a/wallpapers/NOTICE.md` 和 `webos/a/wallpapers/LICENSE-PHOTOS.md` 为准，不在 Apache-2.0 覆盖范围内。

拆分前的完整来源清单保留在 `docs/project-history/`，该目录与 `docs/import-manifest.json`、`docs/baseline-manifest.json` 不随公开产物分发。

## 7. 免责声明

1. **按现状提供**：本项目与随附的第三方组件均按「现状」提供，不附带任何明示或默示担保，包括适销性、特定用途适用性与不侵权担保。
2. **无隶属关系**：NexlOS、Windos2026 与 ArtCraft 移植版是独立项目。上文提到的上游项目、公司与产品名称归各自权利人所有；提及它们只为事实性署名与来源说明，不表示任何隶属、赞助、认证或背书关系。
3. **第三方组件责任**：第三方组件的问题由各自上游负责。本项目不为其安全性、正确性或合规性作任何承诺；升级或替换前请自行评估。
4. **移植实现的差异**：ArtCraft 移植版是重写实现，行为与上游不完全一致，也不承诺与上游任何版本兼容。上游不为本项目的改动负责，本项目也不代表上游的立场。
5. **完整条款**：责任限制、AI 生成内容、第三方应用与出口管制等条款见 `DISCLAIMER.md`。

## 8. 许可全文

### 8.1 MIT — ArtCraft（ArtCraft 移植版的移植部分）

```
Copyright (c) 2026 ArtCraft Team and the ArtCraft contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### 8.2 其他组件

xterm.js、perfect-freehand、Project Nayuki、98.css 与 grok-ball 均为 MIT，全文分别在 `webos/a/vendor/xterm-LICENSE.txt`、`webos/a/draw/perfect-freehand-LICENSE.txt`、`webos/a/vendor/retro-font/98.css-LICENSE.txt`、`webos/a/orb-LICENSE.txt` 与对应 HTML 内。jsQR 与 Readability 为 Apache-2.0，全文在 `webos/a/vendor/jsQR-LICENSE.txt`、`vendor/readability-LICENSE.txt`。jpeg-js 为 BSD-3-Clause。字体按其各自 OFL / CC BY-SA 文件授权。全文与组件同目录分发，不在本文件重复贴出。

## 9. 随附配套源码

`applications/reader/` 与 `tools/` 是本版独立维护的配套源码副本，保持自身来源与许可声明，不因本版拆分自动获得 Apache-2.0 授权。默认 npm 运行包与公开源码候选目录不包含它们。
