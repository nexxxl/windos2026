# Questions people search for

Short answers to the queries this project tends to attract. Each answer names the
boundary as well as the capability, so a reader can decide in one screen whether
this is the right repository.

## Is windos2026 an AI-native operating system?

It is an operating-system layer built for agents: a shell, 17 apps, 25 commands,
settings, storage and a window manager. It runs inside a host, DSH or Octop. The
universal edition adds its own native window shell. It sits on top of your existing
operating system.

## Can it give an AI agent its own computer?

Yes. A host session gets a live workspace with a desktop, apps and files. Generated
apps are written to `apps/<id>/` and survive the session. Isolation, credentials and
model access stay with the host, which is where those boundaries belong.

## Does it replace Linux, macOS or Windows?

No. It is a layer above the OS. The plugin edition runs inside DSH or Octop; the
universal edition ships a native window shell and still runs on macOS, Linux or
Windows.

## What is the software factory?

A production line that turns one sentence into a verified app. The generator writes
a single-file app, a temporary Chromium loads it, checks console errors and declared
interactions, repairs once if needed, then installs the app on the desktop. The
record that the app passed is part of the artifact. Full pipeline:
[factory.md](factory.md).

## Does it reverse-engineer or decompile applications?

No. There is no decompiler, disassembler or binary patcher, and no Rust reverse
engineering engine. The factory works at the browser surface: capture behavior,
write a spec, rebuild, compare against a target you have the right to run. That is
[browser-surface reconstruction](factory.md), and it stops at the browser.

## Can I import an existing GitHub repository as an app?

Yes. Give the desktop a `github.com` URL; it clones the repository with
`--depth 1`, looks for a root `index.html`, or runs `npm install` and `npm run build`
when the repository declares a build script, then mounts `dist`, `build` or `out`.
Imported repositories are untrusted code, so run them in a sandbox.

## Can I use my own model?

Yes. The bundle ships no key and sets no default provider. It reads the model already
configured in your DSH profile. When it cannot see one, the capability layer answers
`501` with a reason instead of pretending to be ready.

## Does it require an account or collect telemetry?

No account, no hosted app store, no telemetry. Apps, code and data stay on your
machine.

## How large is it?

7.95 MiB packed, 12.6 MiB unpacked, 293 files, one runtime dependency (`jpeg-js`),
Node.js 22 or newer.

## Does it support 3D, Three.js or WebGPU?

The universal edition does: Three.js is its only 3D author layer, with glTF/GLB and
KTX2, Draco or meshopt assets, rendered on our own WebGL2/WebGPU surface. The plugin
edition in this tarball ships the app layer, a WebGL graph view and a WebGL2 shader
companion. It has no scene graph or browser game runtime.

## What does "Bring anything. Leave with an app." mean?

Three things: bring any repository you have the rights to; run it as a desktop app;
take the generated app away as plain files that work on any static server.

## Can I use it commercially?

The plugin source is Apache-2.0. The universal binaries have a separate licence.
Third-party assets keep their own terms. Read [research-use.md](research-use.md) and
[LICENSING.md](../LICENSING.md); neither is legal advice.

## What is DSH?

DeepSeek Harness. This repository is packaged as a DSH bundle and installed with
`plugin_manager install_bundle`. Octop is the other supported host.

---

# 中文问答

## windos2026 是 AI 原生操作系统吗？

它是一层为 agent 准备的操作系统界面：外壳、17 个应用、25 条命令、设置、存储与窗口
管理。它运行在 DSH 或 Octop 宿主里；通用版另带原生窗口壳。它建立在现有操作系统之上。

## 它能让 agent 有自己的电脑吗？

可以。宿主会话会拿到一个带桌面、应用与文件的工作区。生成的应用写到 `apps/<id>/`，
会话结束后仍然存在。隔离、凭据与模型访问由宿主负责，这些边界留在宿主更合适。

## 它会替代 Linux、macOS 或 Windows 吗？

不会。它是操作系统之上的一层。插件版跑在 DSH 或 Octop 里；通用版自带原生窗口壳，
仍然运行在 macOS、Linux 或 Windows 上。

## 什么是软件工厂？

把一句话变成可验证应用的产线：生成单文件应用，临时 Chromium 打开页面，检查控制台
错误与声明的交互，不过就修一次，通过后装到桌面。应用通过验收的记录本身就是产物的
一部分。完整产线见 [factory.md](factory.md)。

## 它会逆向或反编译应用吗？

不会。这里没有反编译器、反汇编器、二进制补丁工具，也没有 Rust 逆向引擎。工厂工作在
浏览器表面：采集行为、写规格、重建、与你有权运行的目标比对。这就是
[浏览器表面重建](factory.md)，边界停在浏览器。

## 能把现有 GitHub 仓库导入成应用吗？

可以。给桌面一个 `github.com` 地址，它用 `--depth 1` 克隆，找根目录 `index.html`；
仓库声明了构建脚本时执行 `npm install` 与 `npm run build`，再挂载 `dist`、`build` 或
`out`。导入的仓库属于不可信代码，请放进沙箱。

## 可以用自己的模型吗？

可以。插件不带 key，也不设默认 provider，读取你当前 DSH 档案里已有的模型；看不到
模型时能力层返回 `501` 并附原因，不假装就绪。

## 需要账号或会上报遥测吗？

不需要账号，没有托管应用商店，没有遥测。应用、代码与数据都在你自己的机器上。

## 它有多大？

压缩包 7.95 MiB，解包 12.6 MiB，293 个文件，1 个运行时依赖（`jpeg-js`），需要
Node.js 22 或更高版本。

## 支持 3D、Three.js 或 WebGPU 吗？

通用版支持：Three.js 是唯一的 3D 作者层，资产用 glTF/GLB 配 KTX2、Draco 或 meshopt，
渲染走自有的 WebGL2/WebGPU 表面。本压缩包里的插件版提供应用层、WebGL 关系图与
WebGL2 着色器伴侣，没有场景图，也没有浏览器游戏运行时。

## 「Bring anything. Leave with an app.」是什么意思？

三件事：带进任何你有权的仓库；把它跑成桌面应用；把生成的应用以普通文件带走，放到
任何静态服务器都能跑。

## 可以商用吗？

插件源码是 Apache-2.0；通用版二进制另有许可；第三方素材保留各自条款。请读
[research-use.md](research-use.md) 与 [LICENSING.md](../LICENSING.md)，两者都不构成
法律意见。

## DSH 是什么？

DeepSeek Harness。本仓库以 DSH bundle 形式打包，用 `plugin_manager install_bundle`
安装；Octop 是另一个受支持的宿主。
