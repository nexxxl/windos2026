# 贡献指南

本目录维护独立的 NexlOS 插件版。插件源代码和既有公开文档沿用 Apache-2.0；`applications/` 与 `tools/` 仍以各自声明为准，不因复制到这里获得新的整体许可。

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
