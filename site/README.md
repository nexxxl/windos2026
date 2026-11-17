# windos2026 官方站点

[![站点](https://img.shields.io/badge/%E7%AB%99%E7%82%B9-nexxxl.github.io%2Fwindos2026-003475)](https://nexxxl.github.io/windos2026/)
[![版本](https://img.shields.io/badge/%E7%89%88%E6%9C%AC-0.6.15-003475)](https://github.com/nexxxl/windos2026/releases)
[![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android-lightgrey)](editions.html)
[![许可](https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF-Apache--2.0%20%2B%20%E4%BA%8C%E8%BF%9B%E5%88%B6-yellow)](https://github.com/nexxxl/windos2026/blob/main/docs/legal/LICENSING.md)

**官方站点：<https://nexxxl.github.io/windos2026/>**。仓库存放的安装包与校验和只从本站和 GitHub Releases 发布。

这是 NexlOS 生态的静态宣传站：一个生态首页加六个分页，覆盖产品、版本、工作方式、开发、博物馆、安装与教程。页面是手写 HTML/CSS/JS，没有构建步骤，仓库根目录就是静态站点根目录。

导航的每一项都是独立页面，点击直接跳转，不做单页长滚动。

## 与仓库 About 的关系

GitHub 仓库 `nexxxl/windos2026` 的 About 栏里有一个 Website 链接，指向本站。它由仓库的 `homepage` 字段驱动，改站点地址时两边一起改：

```sh
gh repo edit nexxxl/windos2026 --homepage "https://nexxxl.github.io/windos2026/"
```

About 里的描述与 topics 也取自仓库设置，不写在本目录里。

## 本地预览

在本目录执行：

```sh
python3 -m http.server 8100
```

打开 <http://127.0.0.1:8100/>。

## 页面

| 路径 | 内容 |
| --- | --- |
| `index.html` | 生态首页：七种装法（DSH / Octop / 包 / npm / 优盘 / Linux / 平板）、系统实录、三种工作方式、文档入口 |
| `system.html` | 系统：为什么给 agent 用、数据与模型归谁、六项能力与 17 个应用、四张界面、八条边界 |
| `editions.html` | 版本：七种装法的对比表与逐项状态（已发布 / 已交付 / 本地候选 / 原型与设计），末节 `#download` 列系统要求、三份制品的文件名与 SHA-256、校验命令、首次打开与更新通道 |
| `workflows.html` | 工作方式：终端多开、蜂群模式（多智能体集群）、Agent 浏览器 |
| `build.html` | 开发：一句话生成应用、应用模型、三层验收的软件工厂、宿主兼容与贡献入口 |
| `docs/beginner.html` | 新手教程：概念、第一次开机、17 个应用、生成与导入、带走应用、25 条命令 |
| `docs/install.html` | 安装指南：DSH 对话、插件管理、安装脚本、Octop、可选包、其他形态、卸载与故障排查 |
| `museum.html` | 操作系统博物馆：1969 UNIX 到 2026 NexlOS，12 件展品、四条线索与索引 |

## 发布

`.github/workflows/pages.yml` 在 `main` 分支变更后把仓库根目录上传并部署到 GitHub Pages。仓库 Settings → Pages 的 Source 需要选择 **GitHub Actions**。发布地址取决于仓库名：

- 项目仓库：`https://<owner>.github.io/<repo>/`
- 用户仓库（仓库名 `<owner>.github.io`）：`https://<owner>.github.io/`

当前线上版本位于 <https://nexxxl.github.io/windos2026/>，由主仓 `nexxxl/windos2026` 的 `.github/workflows/site.yml` 发布：只在 `site/` 变更时触发，只上传 `site/`，源码与构建脚本不进站点。

Pages 的 Source 是 **GitHub Actions**（不是分支）。私有仓库在当前套餐下无法开启 Pages，所以主仓是公开的；站点内容本身也是公开的，两者不冲突。

## 多语言

站点与 NexlOS 的界面语言表一致，支持 8 种：

`zh-CN` · `zh-TW` · `en` · `es` · `fr` · `de` · `ja` · `ko`

- `assets/i18n-data.js`：语言表 `langs`、页面标题与描述 `meta`、词条 `dict`、整段标题 `html`。中文原文是 key。
- `assets/i18n.js`：注入右上角语言切换器，按词条替换文本节点与 `placeholder` / `aria-label` / `title` / `alt`；监听 DOM 变化，博物馆和演示里动态渲染的文案也会跟着翻译。
- 选择结果存在 `localStorage` 的 `nexlos.site.lang`，同时写入 `?lang=`，可直接分享某个语言的链接。
- 行内拼接（例如标题被 `<span>` 拆开）会自动补空格；分行排版不同的标题用 `data-i18n-html` 整段覆盖。
- 新增词条：把中文原文作为 key 加进 `dict[语言]`；新增整段标题：给元素加 `data-i18n-html="键名"`，在 `html[语言][键名]` 写 HTML。

## 素材

- `assets/media/nexlos-firstlook.mp4`：由 `nexl首屏演示.mp4` 转码，H.264/AAC，1280×800，30 fps。
- `assets/media/poster.jpg`：视频封面。
- `assets/img/terminal-multi.gif`：终端三开演示，960×540，10 fps，约 6.8 秒循环。
- `assets/img/`：系统截图与宿主截图。
- `assets/fonts/`：NEXL Serif，许可见 `assets/LICENSE.txt`。
- `assets/icon.svg`：站点图标。

改动页面后请在桌面（1440）和手机（390 / 320）宽度各走一遍：导航与语言切换、生成演示、博物馆筛选与时间线、视频播放、复制按钮；并确认页面没有横向滚动。
