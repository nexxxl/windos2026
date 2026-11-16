# vendor

终端栈（档位 4）：
- `xterm.js` = xterm 4.19.0
- `xterm-addon-webgl.js` = xterm-addon-webgl 0.12.0（WebGL2 渲染器）
- `xterm-addon-fit.js` = xterm-addon-fit 0.5.0
- `xterm.css` 同上

全部用 `esbuild --target=chrome72 --minify` 降级过（内核下限 Chrome 72，
非 bundle 的 UMD，直接 `<script>` 引入，全局名 Terminal / WebglAddon / FitAddon）。
此基线保留这些已构建的供应商文件与现有声明；历史 vendor 构建脚本不在本插件包中。

为什么钉 4.19：它是最后一个带 canvas 渲染器的版本（5/6 只留 DOM 回退）。
实测同一构建里切渲染器，3 栏时 canvas 0.58→WebGL 3.44 MB/s；6 档没有 canvas，
弱 GPU / 虚拟机 / 远程桌面一旦拿不到 GL 上下文就掉到 1/6。4.19 + addon-webgl 0.12
比 6.0 栈小 35%（480 KB vs 740 KB），API 也已验证过。

本地补丁（不在 vendor 文件里改，全部在 `ui/term.js` 的 detachGl 里做）：
- 0.12 的 dispose 只摘 canvas、不还 WebGL2 上下文（上游 #6068，2026-10-29 才修）。
  反复切标签会把浏览器 ~16 个上下文额度用光，之后仍活着的分栏被按“最旧”淘汰，
  表现为别的栏花屏。detachGl 显式调 `WEBGL_lose_context.loseContext()`。
- 0.19 及更早不会停掉光标闪烁定时器，销毁的 Terminal 会被一直拖住（上游 #5817）。
  detachGl 先 dispose `_cursorBlinkStateManager` 再 dispose addon（Tabby 同样处理）。

升级触发条件：确定可以放弃 canvas 兜底（宿主全部有 WebGL2），或 addon 0.20+
同时修掉上面两个问题，再切 6 档并在目标宿主重新进行终端浏览器验收。

其它：
- `jsQR.js`：扫一扫的二维码解码。
- `retro-font/`、`space-grotesk/`：界面字体。

许可：
- `xterm.js`、`xterm-addon-fit.js`、`xterm-addon-webgl.js`、`xterm.css`：MIT，全文见 `xterm-LICENSE.txt`。
- `jsQR.js`：Apache-2.0，全文见 `jsQR-LICENSE.txt`。
- `retro-font/`、`space-grotesk/`：各自目录内保留 OFL 与 CC BY-SA 许可记录。
