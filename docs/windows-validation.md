# Windows 宿主实测记录

日期：2026-11-11。目标机：Alienware，Windows 10 22H2（19044.7663，AMD64），Node v22.23.2，npm 10.9.8，git 2.53.0。接入方式：局域网 SSH（OpenSSH for Windows 9.5，密钥登录），全程没有使用 RustDesk 画面。

## 1. 部署路径（可复现）

```powershell
npm i -g @deepseek-ai/dsh@0.2.1-rc.2   # 615 个包，本机耗时 26 分钟
npm i -g pnpm                           # `dsh plugin add` 的硬性前置
dsh --profile nexlwin --from-default-profile web --dump-config
dsh plugin --profile nexlwin add C:\path\to\plugin
```

profile 覆盖层把数据目录指向独立位置：

```yaml
- id: nexlos-os
  config:
    home: C:/Users/<user>/nexl/home
```

启动：`dsh --profile nexlwin --no-open --port 8891`。Windows 上没有 systemd，用计划任务（`schtasks /create` + `/run`）或服务包装器才能脱离 SSH 会话存活。

## 2. 问题与处置

### P0：客户端品牌槽位冲突导致整个插件激活失败（已修复）

现象：DSH 首屏显示 `Failed to load plugins`，`@nexlos/os: failed`，桌面面板不出现。

真实异常（需要临时给 `apply` 包 try/catch 才能读到）：

```text
Error: single slot "sidebar.brand.mark" already has a registration at priority 0
(registered by Kb) — register at a different priority to shadow it (lowest renders)
```

`client.js` 注册 `sidebar.brand.mark` 与 `sidebar.brand.name` 时用了默认优先级 0，和 DSH 自带的品牌插件同槽同位。加载顺序在 Windows 上与 macOS 不同，于是必现。

修复：两处注册改为 `priority: -10`（数值低者渲染，属于遮蔽而非冲突）。修复后 Windows 与 macOS 均正常激活，品牌显示 `NEXLOS`。

教训：单槽位（`single`）不能用默认优先级去覆盖宿主自带内容；插件应默认使用负优先级，并在 CI 里覆盖「宿主品牌插件先加载」的顺序。

### P1：`dsh plugin add` 隐式依赖 pnpm

Windows 上没有 pnpm 时，命令只报 `'pnpm' 不是内部或外部命令`，并在 `.plugin-manager/logs/` 留下一条 pnpm.log，部署文档未提前说明。macOS 开发机装了 pnpm，所以此前没暴露。

处置：补进 `README.md` 前置条件；建议插件包附带 `scripts/doctor.mjs` 自检 Node/pnpm/DSH 版本/数据目录可写性。

### P1：Windows 下 npm 安装耗时 26 分钟

`registry.npmjs.org` 直连，615 个包耗时 26 分钟；pnpm 单包另有 9 分钟。对首发用户体验是硬伤，应在文档里给出镜像或离线包方案。

### P2：宿主缓存客户端包，改代码必须重启

修改 `client.js` 后重新加载页面仍返回旧包（rev 未变），必须重启 `dsh web`。调试时要按「改文件 → 重启 → 新 token」的节奏走，否则会误判修复无效。

### P2：后台启动方式

`Start-Process cmd /c "dsh ... > out"` 与 LF 换行的 `.bat` 都失败且没有可见错误；改用 CRLF 批处理 + `schtasks /run` 才稳定。宿主自身启动到可服务约 45 秒。

## 3. 功能实测

| 能力 | 结果 | 证据 |
| --- | --- | --- |
| 插件装入与激活 | 通过 | profile bundles 追加 `@nexlos/os`；侧栏「NexlOS 桌面」出现，无加载失败提示 |
| 桌面面板 | 通过 | `/nexlos/` iframe 挂载，桌面图标与任务栏渲染 |
| 主题与壁纸 | 通过 | 现代主题 `galaxy.webp`；切 Windos2026 后 `meadow.webp`，列表为「湖畔公园 / 经典青绿 / 经典灰 / 上传」 |
| 设置落盘 | 通过 | `C:/Users/<user>/nexl/home/settings.json` 写入 `appearance: win98`、`wallpaper: snowfog` |
| 终端 / PTY | 通过 | `cmd.exe` 提示符出现，工作目录 `C:\Users\<user>\nexl\home`，多窗格可用 |
| 文件浏览 | 通过 | 「此电脑」显示宿主工作区，路径 `C:\Users\<user>\nexl\home` |
| 音乐 | 通过 | `master-mix.mp3` 播放，`duration=141.118662`，`readyState=4` |
| 办公 | 通过 | `/a/office/` 加载，新建入口齐全 |
| Agent 浏览器 | 通过 | 输入 `https://example.com` 后返回语义视图（Readability 907 字符、动作空间） |
| 插件自测 | 通过 | `npm test` 9/9；`npm run check` 142 文件 0 失败；`npm run pack:check` 25.2 MB |
| 已移除素材 | 通过 | `ridge.jpg`、`canyon.jpg`、`starfield.jpg` 返回 404 |

未验证：真实模型会话与 Agent 工具链（本机未配置凭据）、应用生成、通知与系统托盘、Windows 服务化安装、Windows 10 以外的版本。

## 4. 对插件包构建的反推

1. **激活自愈**：品牌类装饰槽位失败不应拖垮整个插件。改为逐个 `try/catch` 注册装饰项，失败时记录并继续；桌面面板本身保持可用。
2. **显式前置**：`README` 与 `package.json` 写明 Node 22+、pnpm 12+、DSH 版本下限；随包提供 `doctor` 自检脚本。
3. **激活期诊断**：DSH 只在页面显示 `failed`，不显示原因。插件侧可在 `apply` 最外层捕获异常，把堆栈写入数据目录的 `logs/client-boot.log` 并渲染可复制的错误面板，便于用户回报。
4. **CI 矩阵**：`npm test` 与 `npm run check` 增加 `windows-latest`，并加一条「宿主品牌插件先加载」的客户端顺序用例。
5. **安装体积与时延**：304 个文件、29.8 MB；考虑拆分 `webos/` 静态资源为按需包，或提供 zip 离线安装，避免用户等 26 分钟。
6. **服务化**：给 Windows 提供 `install-service.ps1`（计划任务或 NSSM），把「重启后自动可用」变成一条命令；当前需要手工 `schtasks`。

## 5. 第二轮内测（2026-11-12）

同一台机器、同一宿主版本（DSH 0.2.1-rc.2），通过 CDP（`9222` 隧道）驱动真实页面，测量值取自 `getBoundingClientRect` / `getComputedStyle`，不是目测。

### 5.1 已修复

| 问题 | 根因 | 处置 |
| --- | --- | --- |
| 应用生成页头、按钮、空态叠在一起 | `appgen.css` 用 `.ag-*` 前缀，与 `artcraft.css` 的 277 条 `.ag-*` 规则撞名（`.ag-stage` 被改成居中 flex） | 全量改名 `forge-*`，并钉死 `.forge-stage { display:block }` |
| 应用生成页出现 `[Image #1]` 占位 | 页头整块是多余的装饰 | 删除页头（eyebrow / h1 / 副标题），只留两栏卡片 |
| OreVein 仍出现在桌面与应用库 | 插件版清单未清理 | 从 `appManifest()` 与相关 UI 资源中移除，`grep -ri orevein plugin/` 为 0 |
| 极简应用（单按钮、时钟）生成被判失败 | 验收要求正文 ≥20 字且必须有 `<title>` | 正文改为「有内容即可」，标题降级为警告；落盘前 `ensureHtmlTitle` 补齐标题 |
| 新装机器点「记忆树 / inbox / vaults / logs」全部 ENOENT | 插件从未创建 Go 内核那套 home 目录；记忆树真实位置在 `home/nexl交换区/记忆树` | `home()` 首次调用时补建标准目录；侧栏路径改为 `/nexl交换区/记忆树` |
| 宿主从宽变窄后，普通窗口保持原宽度，最多 496px 跑到屏幕外 | `onResize` 在 ≤760px 且非 win98 时直接跳过重排 | 宽度变化时重排窗口；宿主侧栏收起是动画，宽度会连续经过多帧，改为 160ms 稳定后再重排（否则窗口会被钉在最窄一帧，实测 760 → 110） |

### 5.2 本轮实测结果

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 此电脑导航 | 通过 | `/nexl交换区/记忆树`、`/inbox`、`/outbox`、`/vaults`、`/logs`、`/.trash`、`/文稿` 均可打开，空目录正常显示 |
| Agent 浏览器 | 通过 | `https://example.com` → 语义视图（Readability 156 字符、NEXLC 字节码哈希、可抽取性 19/100） |
| 视频播放 | 通过 | `mov_bbb.mp4`，`readyState=4`，时长 10s，播放推进到 6.7s，UI 显示 `0:06/0:10` |
| ArtCraft（PhotoCraft） | 通过 | 选中「画笔」后在 960×600 画布拖动：图层 `0 → 1`，轨迹像素为默认色 `#d08a4a`，Ctrl+Z 后回到白底，无页面异常 |
| 窄视口 390×760 | 通过（修复后） | 桌面无横向溢出；`.forge-grid` 单列 281.6px；任务栏与时钟可见；974px 宽窗口缩到 390 后自动收成 334px、`overflow=0` |
| 宽屏回归 1440 / 900 / 390 / 1440 | 通过 | 全程 `scrollWidth == clientWidth`，无控制台异常 |

补充说明：ArtCraft 默认工具是「移动」，不先点画笔直接拖动不会落笔；这是设计，不是缺陷。

### 5.3 仍待确认

- 真实模型会话与应用生成（需要宿主侧凭据）只在本地验证过，Windows 上未跑完整链路。
- 移动端软键盘弹出、地址栏伸缩未在真机验证；本轮只验证了视口宽度变化的处理。

## 6. 第三轮调优（2026-11-12）

同一台外星人（Windows 10 / Chrome 151.0.7922.174 / DSH 0.2.1-rc.2），测量仍走 CDP `9222`。本轮分四块：界面细节、性能、兼容性、插件安装。

### 6.1 界面与交互

| 问题 | 根因 | 处置 |
| --- | --- | --- |
| 开始菜单能透到后面窗口的正文 | 现代主题玻璃 `--nx-glass-strong` 是 0.94 透明度，又刻意不用 `backdrop-filter` | 提到 0.98（亮/暗两套），保留壁纸色偏，透字消失 |
| 「Agent 浏览器」折成两行，运行点与同行错位 | 82px 列宽在 680px 面板排 7 列，名字可用宽度 76px，实际需要 78px | 列宽改 92px → 6 列；名字强制单行 + 省略号，行高一律 16px |
| 150% 缩放（CSS 视口 853×533）时开始面板顶部被挤出屏幕 | 面板 `min-height: 512px` 大于 `max-height: calc(100vh - dock - 24px)=431px`，min 胜出 | 改为 `min-height: min(512px, calc(...))`，实测面板 432px、`top=22` |

### 6.2 性能

冷启动（禁用缓存、连续 5 次取中位数）在插件自己的 iframe 文档内测量：

| 指标 | 调优前 | 调优后 |
| --- | --- | --- |
| iframe 资源字节 | 1675 KB | 1244 KB（-26%） |
| DOMContentLoaded | 402 ms | 364–376 ms |
| load | 405 ms | 395–403 ms |
| 首次绘制 FCP | 236 ms | 同量级（受宿主导入影响，噪声大于收益） |

改动两项：

1. 壁纸 `galaxy.jpg` 1178 KB → `galaxy.webp` 590 KB（2560×1600，q80 + sharp_yuv）；`meadow.jpg` 1486 KB → 901 KB。壁纸原本占 iframe 冷启动字节的 70%，是最大单项。
2. `xterm.js` / fit / webgl 三个 389 KB 级脚本改为 `defer`，不再阻塞首帧解析；顺序仍早于模块入口。

宿主自身的 `/plugins/??` bundle 单条 4.2 MB 且无压缩，占整页冷启动 6.95 MB 的六成，属于 DSH 侧，插件无法处理；已记录，不作为本版指标。

### 6.3 兼容性

- **非安全上下文剪贴板**：局域网 `http://` 打开时 `navigator.clipboard` 不存在。`graph.js` 复制路径、`app.js` 复制全文加了 `execCommand` 兜底；`bridge.host.js` 的应用剪贴板接口改为返回 `E_PERMISSION` 可读错误，避免未捕获异常。
- **特性基线**：全库检索确认未使用 `:has()`、`@container`、`color-mix()`、`dvh/svh/lvh`、`structuredClone`、`Array.at`、`toSorted`、`Promise.withResolvers`、`<dialog>`；基线下限可定在 Chromium 100+ / Safari 15.4+。
- **DPI**：模拟 100%（1280×800）、125%（1024×640）、150%（853×533）三档，桌面与开始菜单均无横向溢出；150% 档修复了上面的面板顶部溢出。原生 DPI 切换未重启系统验证。

### 6.4 插件安装

新脚本把原来的「复制目录 + 手写 profile JSON + 建链接 + 重启」并成一条命令：

```sh
# macOS / Linux
./scripts/install-posix.sh [--profile 档案] [--uninstall]

# Windows
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 [-Profile 档案] [-Uninstall] [-Restart -TaskName nexlwin-dsh]
```

脚本行为：校验来源是 `@nexlos/os` → 复制插件（排除 `node_modules/.git/.github`）→ 在 profile `dependencies` 写 `link:<目录>` → 向 `dsh.profile.bundles` 追加 `@nexlos/os` → 建 junction（Windows，无需管理员）或符号链接。不跑 `npm install`：唯一运行期依赖 `jpeg-js` 本来就是可选加载。

实测（外星人）：

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 全新 profile 安装 | 通过 | 新建 `nexltest`（只有 base + web-app），脚本复制到 `nexl\plugin-test`，profile 写入 link 依赖与 bundles，junction 生效 |
| 启动加载 | 通过 | `dsh --profile nexltest --port 8893` 启动后 `/nexlos/` 挂载，任务栏出现，开始菜单 16 个应用，壁纸为 `galaxy.webp` |
| 卸载 | 通过 | `-Uninstall` 移除依赖与 bundles 项，删除链接，保留插件文件；macOS 侧同一路径用假 HOME 验证 |

### 6.5 已知问题与未验证

- DSH 宿主的黄色助手气泡固定在页面底部中央，在本机会压住插件悬浮任务栏的左段（开始按钮右侧）。该元素属于宿主文档，插件无法抬升；建议宿主侧允许关闭或改为可拖动。
- 真实模型会话、应用生成完整链路仍未在 Windows 跑通（需要宿主凭据）。
- 原生 100%/150% DPI 切换（需要重启会话）与多显示器混合 DPI 未验证。
