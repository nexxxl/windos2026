# windos2026

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

7.95 MiB，一台 2026 年的 AI 超轻原生操作系统：回到千禧年是外星科技，留在今天是你的私人软件工厂。Bring anything. Leave with an HTML app.

如果回到千禧年，你的电脑意外打开一个2026年的AI原生操作系统，你会用来干嘛？

windos2026 是 NexlOS 的 DSH 插件版。它把一台完整的桌面装进 DSH：17 个应用、25 条命令、8 种内置界面语言，压缩包 7.95 MiB，只有一个运行时依赖。生成的应用就是 `apps/<id>/index.html` 加一份 `app.json`；17 个内置应用以代码形式放在 `webos/`。

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
