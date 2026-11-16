# Value: what NexlOS can be

> The model is becoming a commodity. The app format, the permission contract and
> the verification loop are not.

This page answers the searches this project attracts. It leads with what the
architecture makes possible, then says what exists today. Every answer separates
three things:

- **Today** — shipped in this repository or the edition named.
- **Next** — reachable from a primitive that already exists; the work is packaging,
  not invention.
- **Boundary** — what this project will not claim, even when the search phrase asks
  for it.

## Seven capability bets

| Bet | Why it matters in 2026 | Primitive that exists | What it unlocks |
| --- | --- | --- | --- |
| A portable app format for agents | Apps are trapped in hosted stores and account walls | `apps/<id>/index.html` plus `app.json` | Copy, sign, remix and run an app anywhere |
| A software factory with evidence | Generation is cheap; verification is the scarce part | Headless Chromium check, one repair pass, check record | Reconstruction of web software at the browser surface, with proof it runs |
| A 3D content line | Three.js and WebGPU made browser 3A cheap to produce | Universal edition: Three.js author layer, glTF/GLB with KTX2/Draco/meshopt, WebGL2/WebGPU | Interactive scenes shipped as apps, checked frame by frame |
| Agent-readable surfaces | Computer use is stuck on screenshots and pixel guessing | Pad surface API reads the foreground window as an action list | Agents operate apps by reference, at a fraction of the tokens |
| A host-agnostic OS layer | Agents run in many harnesses, each with its own UI | The same `webos/` tree under DSH, Octop and a native shell | One desktop that follows the agent across hosts |
| A local-first personal cloud | Buyers ask for BYOK, no telemetry and no vendor lock-in | No key, no account, no telemetry; model comes from the host profile | A private workspace that travels by file, not by account |
| A verified app exchange | Supply-chain risk moved from packages to skills and apps | Signed manifests and trust in the universal edition | Remix lineage and attribution without a central store |

## Is NexlOS an AI-native operating system?

**Today.** An operating-system layer for agents: shell, 17 apps, 25 commands,
settings, storage and a window manager, running inside DSH or Octop. The universal
edition adds its own native window shell.

**Next.** The same payload already runs across hosts. Once the host adapter is the
only variable, the desktop becomes a runtime that follows an agent from one harness
to another, and from one machine to another.

**Boundary.** It is a layer above the OS, not a kernel or a Linux distribution.

## Can an agent have its own computer?

**Today.** A host session gets a live workspace with a desktop, apps and files.
Generated apps are written to `apps/<id>/` and survive the session.

**Next.** The pieces for a durable per-agent computer already exist separately: a
surface API that reads a window as an action list, signed app packages, and an
app format that is just files. Combining them gives an agent a workspace it can
snapshot, hand off and reopen.

**Boundary.** Isolation, credentials and model access stay with the host. That is
where those boundaries belong.

## What can the software factory become?

**Today.** One sentence becomes a single-file app; a temporary Chromium checks
console errors and declared interactions; one repair pass; only a passing app gets
a desktop icon. The pipeline is described in [factory.md](factory.md).

**Next.** The same loop generalizes from "write a new app" to "rebuild a web app":
capture behavior, write a spec, rebuild, compare against a target you have the
right to run. Each run leaves a check record, so the library compounds into
verified templates instead of prompts.

**Boundary.** The factory works at the browser surface. It does not decompile,
disassemble or patch binaries, and it does not copy third-party code or assets.

## Can apps travel between hosts and machines?

**Today.** Copy `apps/<id>/` to any static server and it still runs; zip and upload
to another instance; signed packages install only after the author key is trusted.

**Next.** The manifest already carries identity and provenance. Adding attribution
(`author`, `remixedFrom`, `license`) turns a folder of apps into a remix lineage
that survives the move.

**Boundary.** Cross-machine signed packages are denied by default. That is a design
choice, not a missing feature.

## Will it run 3D, Three.js and WebGPU content?

**Today.** The universal edition adopts Three.js as its only 3D author layer, with
glTF/GLB plus KTX2, Draco or meshopt assets, rendered on our own WebGL2/WebGPU
surface. The plugin edition ships a WebGL graph view and a WebGL2 shader companion.

**Next.** 3D verification is a factory problem: reference frames, contact sheets and
silhouette differences, with performance budgets. The renderer and the checks
already exist on separate sides; connecting them turns a scene into a shippable app.

**Boundary.** The plugin tarball has no scene graph or browser game runtime, and
headless frame rates are not presented as real-hardware performance.

## Can agents use apps without screenshots?

**Today.** The pad surface API reads the foreground window into a stable action
list (`e12 btn 个性化 @140,180`) and acts by reference, with a receipt. One screen
reads in about 8 ms and uses a fraction of the tokens of raw DOM.

**Next.** Generated apps can carry a machine contract in `app.json`, so the same
surface works for third-party apps without reverse-engineering their markup.

**Boundary.** Today this covers built-in apps on the pad edition. It is not a
general screen reader for arbitrary native software.

## Can I keep my own model and my own data?

**Today.** The bundle ships no key and no default provider; it reads the model in
your DSH profile and answers `501` with a reason when it cannot see one. No account,
no telemetry, no hosted store.

**Next.** Per-app model policy and local-model routing are configuration work on
top of the same capability layer, not a new architecture.

**Boundary.** We do not ship a model, and we do not proxy your prompts.

## Is this a reverse-engineering tool?

**Today.** No. There is no decompiler, disassembler, patcher or DRM circumvention.
The factory reconstructs at the browser surface: capture behavior, write a spec,
rebuild, compare.

**Next.** That loop is the honest half of "reverse engineer anything" for web
software. It can grow into a case library of verified reconstructions, each with
its own check record and rights statement.

**Boundary.** Binaries and closed native software stay out of scope. Use a
reverse-engineering tool for those.

## Can a team build a business on it?

**Today.** The plugin source is Apache-2.0; universal binaries have a separate
licence; third-party assets keep their own terms. Apps are files, so there is no
platform tax to run them.

**Next.** Signed packages, trust and attribution make a paid or internal exchange
possible without a central store. The permission contract travels with the app.

**Boundary.** Read [research-use.md](research-use.md) and
[LICENSING.md](../LICENSING.md); neither is legal advice.

## How do I know which parts are real today?

Every capability page in this repository uses the same three labels: **Today**,
**Next**, **Boundary**. The edition map in [factory.md](factory.md) says which
edition owns which row. If a claim has no label, treat it as unverified and check
the file it cites.

## Signals that we are on track

- The app format stays runnable on a plain static server after every release.
- The factory's check records accumulate, and repaired apps pass on the second run.
- A 3D scene ships as an app with reference frames and a performance budget.
- An agent completes a task through the surface API without a screenshot.
- A signed app moves between two machines with attribution intact.

---

# 价值：NexlOS 可以是什么

> 模型会商品化，应用格式、权限契约与验收闭环不会。

这一页回答本项目会遇到的搜索，但先讲这套架构**可以长出什么**，再讲今天已经有什么。每个回答分三层：

- **今天**：本仓库或所指版本里已经跑得起来的部分。
- **下一步**：已经有原语，剩下的是封装，不是重新发明。
- **边界**：即使搜索词这么问，我们也不这么宣称。

## 七个能力赌注

| 赌注 | 为什么 2026 年重要 | 已经存在的原语 | 它能长出什么 |
| --- | --- | --- | --- |
| 给 agent 的可携带应用格式 | 应用被困在托管商店与账号墙里 | `apps/<id>/index.html` + `app.json` | 复制、签名、remix、到处运行 |
| 带证据的软件工厂 | 生成很便宜，验收才是稀缺 | 无头 Chromium 验收、一次修复、检查记录 | 在浏览器表面重建 Web 软件，并留下它能跑的证明 |
| 3D 内容产线 | Three.js 与 WebGPU 让浏览器 3A 变便宜 | 通用版：Three.js 作者层、glTF/GLB 配 KTX2/Draco/meshopt、WebGL2/WebGPU | 互动场景以应用形式交付，逐帧验收 |
| Agent 可读的界面 | 电脑操作还卡在截图与猜像素 | pad 表面 API 把前台窗口读成可操作清单 | agent 按引用操作应用，token 成本降一个量级 |
| 宿主无关的操作系统层 | agent 跑在多种宿主里，各有各的界面 | 同一份 `webos/` 跑在 DSH、Octop 与原生壳 | 桌面跟着 agent 跨宿主走 |
| 本地优先的个人云 | 买家要 BYOK、无遥测、无锁定 | 不带 key、无账号、无遥测；模型来自宿主档案 | 靠文件迁移的私有工作区，不靠账号 |
| 可验证的应用交换 | 供应链风险从包转到了 skill 与应用 | 通用版的签名清单与信任 | 没有中心商店的 remix 谱系与署名 |

## NexlOS 是 AI 原生操作系统吗？

**今天**：一层为 agent 准备的操作系统界面——外壳、17 个应用、25 条命令、设置、存储与窗口管理，跑在 DSH 或 Octop 里；通用版另带原生窗口壳。

**下一步**：同一份载荷已经能跨宿主运行。当宿主适配成为唯一变量，桌面就变成跟着 agent 走的运行时，从一台机器到另一台机器。

**边界**：它是操作系统之上的一层，不是内核，也不是 Linux 发行版。

## agent 能拥有自己的电脑吗？

**今天**：宿主会话会拿到一个带桌面、应用与文件的工作区；生成的应用写到 `apps/<id>/`，会话结束后还在。

**下一步**：一台可持久 agent 电脑的零件已经分别存在：把窗口读成操作清单的表面 API、签名应用包、本身就是文件的应用格式。把它们拼起来，agent 就有了能快照、交接、重开的工作区。

**边界**：隔离、凭据与模型访问由宿主负责，这些边界留在宿主更合适。

## 软件工厂能长成什么？

**今天**：一句话生成单文件应用，临时 Chromium 检查控制台错误与声明的交互，失败修一次，通过才上桌面。产线见 [factory.md](factory.md)。

**下一步**：同一个闭环从“写一个新应用”推广到“重建一个 Web 应用”：采集行为、写规格、重建、与你有权运行的目标比对。每次运行留下检查记录，模板库因此累积成可验证资产。

**边界**：工厂停在浏览器表面，不反编译、不反汇编、不打补丁，也不复制第三方代码与素材。

## 会支持 3D、Three.js 与 WebGPU 吗？

**今天**：通用版把 Three.js 作为唯一 3D 作者层，资产用 glTF/GLB 配 KTX2、Draco 或 meshopt，渲染走自有的 WebGL2/WebGPU 表面。插件版提供 WebGL 关系图与 WebGL2 着色器伴侣。

**下一步**：3D 验收是工厂问题：参考帧、contact sheet、剪影差异，再加性能预算。渲染器和验收工具已经各自存在，接起来就能把场景变成可交付应用。

**边界**：插件压缩包里没有场景图，也没有浏览器游戏运行时；无头渲染的帧率不作为真机性能宣传。

## agent 能不用截图就操作应用吗？

**今天**：pad 表面 API 把前台窗口读成稳定引用清单（`e12 btn 个性化 @140,180`），按引用操作并返回回执；一屏约 8 ms，token 只占原始 DOM 的一小部分。

**下一步**：生成的应用可以在 `app.json` 里带机器契约，同一套表面就能覆盖第三方应用，不需要逆向它们的标记。

**边界**：今天覆盖 pad 版的内置应用，不是任意原生软件的通用读屏器。

## 这是逆向工具吗？

**今天**：不是。没有反编译器、反汇编器、补丁工具，也没有绕过 DRM 的手段。工厂在浏览器表面重建：采集行为、写规格、重建、比对。

**下一步**：这条闭环是“逆向一切”里对 Web 软件诚实的另一半，可以长成带检查记录与权利声明的重建案例库。

**边界**：二进制与闭源原生软件不在范围内，那类目标请用逆向工具。

## 怎么判断哪些是真的？

本仓库每个能力页都用同一组标签：**今天 / 下一步 / 边界**。版本归属见 [factory.md](factory.md) 的版本表。没有标签的说法按未验证处理，去看它引用的文件。
