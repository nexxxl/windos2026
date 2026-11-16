# windos2026

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

7.95 MiB，一台 2026 年的 AI 超轻原生操作系统：回到千禧年是外星科技，留在今天是你的私人软件工厂。Bring anything. Leave with an HTML app.

如果回到千禧年，你的电脑意外打开一个2026年的AI原生操作系统，你会用来干嘛？

windos2026 是 NexlOS 的 DSH 插件版。它把一台完整的桌面装进 DSH：17 个应用、25 条命令、8 种内置界面语言，压缩包 7.95 MiB，只有一个运行时依赖。生成的应用就是 `apps/<id>/index.html` 加一份 `app.json`；17 个内置应用以代码形式放在 `webos/`。

你还记得你用过的第一台电脑桌面长什么样吗？这一台可以完全是你自己的：一句话生一个应用，每个应用都以文件的形式跟你走。Linux 给了每个程序一台机器；NexlOS 给了每个 agent 一台电脑。

## 三样东西始终是你的

**你的模型。** 插件不带 key，也不设默认 provider。它读的是你当前 DSH 档案里已有的东西；看不到模型时它直说：能力层返回 `501` 并附原因，模型状态显示 `unavailable`，不假装就绪。

**你的应用。** 在 DSH 里说一句话：生成器写出 `apps/<id>/index.html` 和 `app.json`，用浏览器打开页面做验收，验收不过就自动修一次，然后把图标放上桌面。把这个目录拷到任何静态服务器上，它照样能跑；给它一个 GitHub 地址，`importGithubApp` 会克隆仓库、找到构建后的入口，挂成应用。

**你的机器。** 7.95 MiB 换来 17 个应用、25 条命令、8 种界面语言，装在你在跑的宿主里：不用再部署一套控制面，没有账号，没有遥测。把同一个 bundle 装进另一个 DSH 档案，它用的是那个档案的模型，不是我们的。

## 两种发行，两套许可

| 形态 | 你拿到的东西 | 许可 |
| --- | --- | --- |
| **插件版**（本仓源码） | 下文所述的 7.95 MiB 插件包 | [Apache-2.0](LICENSE) |
| **通用版**（Releases） | 自带原生窗口壳的独立二进制 | 闭源内核与窗口壳按 [NexlOS Binary License 1.0](docs/LICENSE-BINARY.md)；内置桌面层保持 Apache-2.0 |

逐文件、逐产物的权威映射见 [LICENSING.md](LICENSING.md)。

通用版还没有发布：在它的资产授权复核完成之前，Releases 不会挂出二进制。

## 安装

把仓库地址发给 DSH，再说一句：

```text
https://github.com/nexxxl/windos2026
安装 windos2026
```

DSH 会克隆仓库，再用 `plugin_manager install_bundle` 装进当前档案。也可以直接指向本地目录：

```text
plugin_manager install_bundle target=/absolute/path/to/windos2026
```

或者不经过会话，用脚本装进本机 profile：

```sh
./scripts/install-posix.sh
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

需要 Node.js 22+ 和可加载本地 bundle 的 DSH。没有 npm 发布，请用上面的仓库安装或本地脚本。

![NexlOS 在 DSH 里](docs/images/host-dsh.jpg)

### Octop（工作台）

桌面不依赖 DSH。同一份 `webos/` 和 `index.js` 也能作为独立宿主运行，一条命令把它挂进 Octop：

```bash
git clone https://github.com/nexxxl/windos2026.git
cd windos2026
./bin/octop-install install
```

Octop 左侧会多出常驻的 **NexlOS 桌面**，点开占满右侧主工作区；命令栏回答用的是你自己的 Octop agent。`./bin/octop-install status|up|down|uninstall` 负责管理。需要 Node.js 22+ 和装在 `~/.octop` 的 Octop。宿主差异、边界与回滚见 [docs/octop.md](docs/octop.md)。

![NexlOS 在 Octop 里](docs/images/host-octop.jpg)

## 用

- **打开桌面**：装好后进入 Web 桌面；首次会先过一次 hello 引导，选好界面语言再进系统。
- **说一句话造应用**：在 DSH 里描述你要的东西，它会生成一个内嵌应用，落到桌面上。
- **把仓库搬进来**：给一个 GitHub 地址，它克隆、找入口，装成桌面应用。
- **带走**：生成的应用就是文件。复制 `apps/<id>/`，换一台机器照样能跑。

## 里面有什么

| 项目 | 数字 |
| --- | --- |
| 压缩包 | 7.95 MiB |
| 解包 | 12.6 MiB / 293 文件 |
| 应用 | 17 |
| 命令 | 25 |
| 界面语言 | 8 种内置，7 种可选语言包 |
| 主题 | 2 套（NEXL 现代 / Windos2026） |
| 运行时依赖 | 1（`jpeg-js`） |
| 许可 | Apache-2.0（商标与第三方素材除外） |

## 2026 年它站在哪里

如果你是从「AI 原生操作系统」「给 agent 一台电脑」「软件工厂」「本地优先 / BYOK 运行时」这些词搜过来的，这里是诚实的对应：一个 7.95 MiB 的外壳，17 个应用、25 条命令，跑在 DSH 或 Octop 里；一句话变成一个可带走的 HTML 应用；agent 拿到的是一个能留下来的工作区。

- **Agent 原生**：桌面是界面，生成的应用才是产物。
- **软件工厂**：一句话、一个应用，用浏览器打开验收，不过就修一次。
- **小且可带**：7.95 MiB、293 个文件、1 个运行时依赖。
- **本地优先**：无账号、无遥测、不设默认模型。
- **GPU 绘制的界面**：WebGL 关系图与 WebGL2 着色器伴侣，均带 Canvas2D 降级。

每个搜索词到底对应什么、以及本项目明确**不**宣称什么：见 [docs/highlights.md](docs/highlights.md)。使用与再分发边界：见 [docs/research-use.md](docs/research-use.md)。

## 它不做什么

- 不需要第三方账号，不需要托管的应用商店；应用、代码和数据都在你自己的机器上。
- 不收集遥测。
- 不改系统设置；安装脚本只写 DSH profile 的依赖与链接，卸载只摘这些。
- 发布的压缩包与公开源码候选不含 CJK 办公字体包、通用版二进制和内部项目历史；包内唯一的中文字面是 THIRD_PARTY_NOTICES 里声明的 OFL 像素字体。
- 不声称 Windows 已完整验证；Windows 路径按 alpha 对待，发现问题请提 issue。

## 开发

```sh
npm ci
npm run check
npm test
npm pack --pack-destination /absolute/path/to/artifacts
```

体积门禁：

```sh
./scripts/verify-lite.sh
```

## 许可

本仓库的插件源码按 Apache-2.0 提供；通用版的 Release 二进制另按一套许可，映射见 [LICENSING.md](LICENSING.md)，条款见 [LICENSE-BINARY.md](docs/LICENSE-BINARY.md)。

插件源代码与文档按 [Apache-2.0](LICENSE) 提供。商标不随 Apache-2.0 授予，第三方素材按各自许可。来源、许可全文位置与移植说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，商标规则见 [TRADEMARK.md](TRADEMARK.md)，担保与责任条款见 [DISCLAIMER.md](DISCLAIMER.md)。

ArtCraft 移植版（ArtCraft for NexlOS）是内置「应用生成」的示例案例，也是唯一从上游项目移植算法的模块：它把上游 ArtCraft 的编辑器结构与可独立移植的算法装进 NexlOS，再按本项目「命令 + 单一文档状态 + 面板挂载」的契约重新装配。移植思路与逐文件对应关系见 [docs/artcraftport/ATTRIBUTION.md](docs/artcraftport/ATTRIBUTION.md)：上游是 storytold 的 ArtCraft（`github.com/storytold/artcraft`，MIT / Apache-2.0），本项目按 MIT 重写为零依赖 ES Module，未带入上游的 Rust 渲染器、Tauri 宿主与 AI 调用。本移植版是**非官方**移植，与上游没有隶属或背书关系；应用名里的 ArtCraft 只用于指出来源，并始终带「移植版 / for NexlOS」限定。应用 id、路由与目录为 `artcraftport`。
