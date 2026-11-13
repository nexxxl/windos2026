# 第三方与来源声明

这是 NexlOS 插件版的集成源码基线。过滤研究材料与参考仓库不改变已集成代码、算法和素材的来源；它不构成“所有代码从零原创”的声明。

| 组件或实现 | 保留的来源与许可 |
|---|---|
| `vendor/readability.js` | 原文件保留 Arc90 版权、Apache-2.0 声明 |
| `vendor/nexl-l1.js` | NEXL-HTML L1-DOM-JIT；见 `vendor/NEXL-L1-NOTICE.md` 的 Apache-2.0 来源说明 |
| `webos/a/vendor/xterm*` | xterm 4.19.0、fit 0.5.0、WebGL addon 0.12.0；保留文件头 MIT 声明 |
| `webos/a/vendor/jsQR.js` | jsQR 1.4.0；Apache-2.0 文件头 |
| 字体 | `webos/a/vendor/retro-font/`、`space-grotesk/` 与 `webos/a/office/fonts/` 保存各自的 OFL、CC BY-SA 或许可证记录 |
| ArtCraft 算法与结构 | [逐文件归属](docs/artcraft/ATTRIBUTION.md)，既有源码记录采用 MIT；未带入上游 Rust/Tauri 项目 |
| 画板笔迹算法 | `webos/a/draw/board.js` 保留 perfect-freehand 的移植出处；MIT 全文见 `webos/a/draw/perfect-freehand-LICENSE.txt`；固定版本仍待补核 |
| 桌面窗口、会话与经典控件 | `webos/a/win.js`、`session.js`、`win98.css` 保留 daedalOS、OWD、OS.js 与 98.css 等出处；对应可用许可随字体/控件资源保存 |
| 球体伴侣 | `webos/a/orb.js` 保留 NovaVia-app 迁移说明及 grok-ball 的 MIT 眼环几何出处 |
| JPEG 解码 | npm `jpeg-js` 0.4.4，BSD-3-Clause；由 `package-lock.json` 固定版本，安装后许可证随 npm 依赖提供 |

DSH/DeepSeek Harness 是运行宿主，并非本目录复制的参考仓库。宿主注入模块、可选 Agent Teams、Chromium 与系统软件仍遵循各自许可。

当前壁纸来源与授权记录以 `webos/a/wallpapers/NOTICE.md` 和 `LICENSE-PHOTOS.md` 为准。两张照片按其自身许可使用，不在 Apache-2.0 覆盖范围内；历史素材记录保存在 `docs/project-history/`，不代表它们仍随本版分发。

部分既有移植注释仅标记来源，未包含完整上游许可文本或固定版本。正式对外发行前应完成版本、完整许可与权利链的核对；此文件如实保留该未验证边界。

## MIT License — ArtCraft

按随工程保存的归属记录，以下条款用于 ArtCraft 相关移植部分：

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

## 随附配套源码

`applications/reader/` 与 `tools/` 是本版独立维护的配套源码副本，保持自身来源与许可声明，不因本版拆分自动获得 Apache-2.0 授权。默认 npm 运行包与公开源码候选目录不包含它们。
