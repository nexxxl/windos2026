# windos2026

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

7 MB，一台 2026 年的 AI 超轻原生操作系统：回到千禧年是外星科技，留在今天是你的私人软件工厂。Bring anything. Leave with an HTML app.

如果回到千禧年，你的电脑意外打开一个2026年的AI原生操作系统，你会用来干嘛？

windos2026 是 NexlOS 的 DSH 插件版。它把一台完整的桌面装进 DSH：17 个应用、25 条命令、8 种内置界面语言，压缩包 7.31 MiB，只有一个运行时依赖。桌面上的每个应用都是 `apps/<id>/index.html` 加一份 `app.json`，可以直接读、直接改、直接带走。

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

需要 Node.js 22+ 和可加载本地 bundle 的 DSH。npm 包尚未发布，`npm install @nexlos/os` 目前会返回 404。

## 用

- **打开桌面**：装好后进入 Web 桌面；首次会先过一次 hello 引导，选好界面语言再进系统。
- **说一句话造应用**：在 DSH 里描述你要的东西，它会生成一个内嵌应用，落到桌面上。
- **把仓库搬进来**：给一个 GitHub 地址，它克隆、找入口，装成桌面应用。
- **带走**：应用就是文件。复制 `apps/<id>/`，换一台机器照样能跑。

## 里面有什么

| 项目 | 数字 |
| --- | --- |
| 压缩包 | 7.31 MiB |
| 解包 | 11.2 MB / 260 文件 |
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
- 不捆绑 CJK 字体、通用版二进制和内部历史；这些不在这个仓库里。
- 不声称 Windows 已完整验证；已知边界写在 [Windows 验证](docs/windows-validation.md)。

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

插件源代码与文档按 [Apache-2.0](LICENSE) 提供。商标不随 Apache-2.0 授予，第三方素材按各自许可，见 [NOTICE](NOTICE)、[TRADEMARK.md](TRADEMARK.md)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
