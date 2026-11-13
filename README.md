# NexlOS 插件版公开源码候选

独立的 DSH 插件源码：Node Host、Client、WebOS、办公界面、浏览器桥和测试均位于本目录。生成这个候选目录不等于执行公开发布。

```sh
npm ci
npm run check
npm test
npm pack --pack-destination /absolute/path/to/artifacts
python3 scripts/check-source.py
bash scripts/stage-public-repo.sh --check .
```

使用 DSH 插件管理器将本目录作为 bundle 安装；包名 `@nexlos/os`，配置 `cordis.patch.yml`。宿主服务、模型、PTY 和 Chromium 由部署环境提供。

本候选目录不包含通用版源码、配套应用、制作工具或内部历史审计。插件源代码与既有公开文档按 [Apache-2.0](LICENSE) 提供；第三方素材按自身许可，商标权不包含在 Apache-2.0 中。见 [NOTICE](NOTICE)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [TRADEMARK.md](TRADEMARK.md)。

功能与平台边界见 [验证记录](docs/validation.md)、[Windows 验证](docs/windows-validation.md)、[拆分验证](docs/split-validation.md) 和 [命名迁移](docs/naming-migration.md)。插件的部分伴侣和高级办公能力仍未实现，不能从源码打包成功推导为功能可用。
