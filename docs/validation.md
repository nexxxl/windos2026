# 插件版整理验证

日期：2026-11-11。环境：macOS / x86-64、Node.js v26.8.1。验证对象为当前 `plugin/` 目录及其 npm 打包解包文件集。

| 检查 | 结果与范围 |
|---|---|
| `npm run check` | 142 个 JavaScript/ESM 文件通过 `node --check`；不执行宿主 Client 运行时 |
| `npm test` | 9/9 通过；真实 loopback HTTP + 临时工作区，最小 DSH Host fixture |
| `npm pack` | 成功，约 30.24 MB 压缩、34.94 MB 展开；精确大小以当次打包清单为准 |
| 解包后 HTTP 测试 | 同一外部测试 runner 设置 `NEXLOS_TEST_PACKAGE` 指向临时解包目录，9/9 通过；未依赖通用版或旧工程位置 |
| 命名/路径扫描 | 当前源码未发现旧名称、个人绝对源码路径、原工程目录名；第三方归属与真实 DSH 接口名保留 |

HTTP 覆盖：探活和工作区隔离；WebOS、`app.js/os.js` 与 Office 静态资源；设置写读及磁盘内容；新建书目、章节保存读回；工作区路径越界与跨域请求拒绝；Office 版本递增、重复 token 幂等重放与过期版本 409；DSH `connection.requestRejection` 的鉴权转接。另有新建 `NEXLOS_HOME` 尚无设置文件时仍选中该目录的回归测试。

已修正的交付问题：不再隐式发现父目录 UI；显式 `config.ui`/`NEXLOS_UI` 继续可用；新 `NEXLOS_HOME` 不再要求预先存在设置文件；打包白名单剔除旧截图/研究报告，并包含依赖注入所需供应商脚本和归属材料。

截至本节记录时未安装到真实个人 DSH（后续复验见文末），也未重新验证 Client 面板、真实 Agent 会话、PTY、团队插件、模型调用、Chromium CDP、WebRTC 扩展和浏览器交互。HTTP fixture 的成功不等同于这些真实宿主能力已验收；Windows/Linux 宿主未实测。语法检查不覆盖 HTML 内联脚本的浏览器兼容性。

测试使用临时目录，结束后关闭本次服务并清理临时工作区；npm 包与解包验证产物位于系统临时目录，不混入源码基线。没有复制个人工作区、模型密钥、浏览器 profile 或 DSH 会话，也没有进行公开发布。

首次在受限环境监听 loopback 端口被 sandbox 拒绝；按工具权限流程升级后完成真实 HTTP 验证。该环境限制与产品测试结果分开记录。

## 2026-11-11 真实 DSH 宿主复验

此前「未安装到真实个人 DSH」的结论已被本次复验覆盖。环境：DSH 0.2.1-rc.2（`~/.dsh/profiles/node_modules/@deepseek-ai/dsh`），新建独立 profile `nexlwall`（由随包 `web` 模板复制，不动原有 `web`/`sdk` profile），用 `dsh plugin --profile nexlwall add` 以 link 方式装入本目录，`config.home` 指向 `/tmp/nexlos-dsh-home`，`--no-open --port 8891` 启动。

| 检查 | 结果与证据 |
|---|---|
| 插件装入 | profile 的 `bundles` 追加 `@nexlos/os`；宿主正常启动并输出带 token 的地址 |
| Client 面板 | 侧栏出现「NexlOS 桌面」，面板 iframe 指向 `/nexlos/`；桌面 DOM 正常渲染 |
| 现代主题壁纸 | `#/desktop` 的 `.os-wallpaper` 为 `/a/wallpapers/galaxy.jpg`；个性化页只有「丹霞碧水」与上传项 |
| Windos2026 主题 | 切换后 `data-appearance=win98`，`.os-wallpaper` 为 `/a/wallpapers/meadow.jpg`，背景列表为「湖畔公园 / 经典青绿 / 经典灰 / 上传」 |
| 静态资源 | `galaxy.jpg`、`meadow.jpg`、`master-mix.mp3` 均 HTTP 200；`ridge.jpg`、`canyon.jpg`、`starfield.jpg` 均 404 |
| 数据隔离 | 设置写入 `/tmp/nexlos-dsh-home`，未读写个人工作区与旧插件目录 |

未验证：真实 Agent 会话与模型调用、PTY、AgentTeams、Chromium CDP/WebRTC 扩展、Windows/Linux 宿主。测试用 profile 与临时数据目录保留在本机，可按需删除。

Windows 宿主实测另见 [windows-validation.md](windows-validation.md)：记录了 pnpm 前置缺失、客户端品牌槽位冲突（已修复）与各功能实测结果。
