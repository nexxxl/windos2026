# 贡献指南

本目录维护独立的 NexlOS 插件版。本仓源码按 [Apache-2.0](LICENSE) 授权；从 Releases 下载的通用版二进制另受 [NexlOS Binary License 1.0](LICENSE-BINARY.md) 约束，二进制内嵌的桌面层仍按 Apache-2.0 授权。逐文件地图见 [LICENSING.md](LICENSING.md)，两条发行轨道的步骤见 [docs/releasing.md](docs/releasing.md)。工作区里的 `applications/`、`tools/` 不进公开仓，其许可以各自声明为准。

## 开发与验证

需要 Node.js 22+。从本目录执行：

```sh
npm ci
npm run check
npm test
python3 scripts/check-source.py
```

配套 Python 工具各自有 README 和可选依赖，不属于插件运行依赖。不要提交 `node_modules/`、产物、日志、密钥或个人工作区。`docs/project-history/` 是历史快照，其旧路径不是当前运行入口。

## 提交规则

- 标识符、文件名和 API 字段使用英文；用户文案走现有 i18n。
- JS/JSON/CSS/Markdown 沿用格式配置，Python 沿用 Ruff 配置；不为目录拆分重写业务代码。
- 新功能和修复说明触发条件、行为和验证结果；UI 修改需说明实际浏览器链路。
- 新第三方材料必须保留来源、版本和许可证，未确认权利的素材不提交。
- 每次提交按 [DCO](DCO) 使用 `git commit -s`，只提交自己有权按对应许可贡献的内容。
- 安全问题按 [SECURITY.md](SECURITY.md) 报告，不在公开 issue 中粘贴凭证或个人数据。

参与行为遵循 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
