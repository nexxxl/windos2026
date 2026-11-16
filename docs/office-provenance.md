# 便携办公来源说明

插件版的办公应用是本地实现的前端，通过 `src/webos/a/office/api.js` 与本机服务通信。写这份说明是为了回答一个具体问题：这里有没有第三方代码。答案是除下表列出的资源外没有。

## 实现范围

| 位置 | 内容 | 依据 |
| --- | --- | --- |
| `src/webos/a/office/editors.js` | 六个编辑器共用一份文档模型 | 自写，不引用前端框架 |
| `src/webos/a/office/formula.js` | 表格公式：词法 → 递归下降 → 求值 | 自写 |
| `src/webos/a/office/print.js` | 打印与分页视图 | 自写 |
| `src/webos/a/office/api.js` | 与本机服务的唯一出口 | 自写 |
| `src/webos/a/office/ui/tools/qrcode.html` | 二维码生成 | Nayuki QR Code generator，MIT，完整文本在 HTML 内 |
| `src/webos/a/office/fonts/` | 文档字体 | 各字体上游许可，见 `fonts/LICENSES.md` |

格式解析与导出（DOCX / XLSX / PPTX / PDF / HTML / Markdown）由浏览器侧的 `src/webos/a/office/` 实现，落盘与版本号由 `index.js` 的 office 路由负责；实现依据是 ECMA-376 / ISO/IEC 29500 与 ISO 32000-1 公开规范。本发行版不包含 Go 模块。

## 没有带入的东西

- 历史调研、竞品拆解与逆向笔记没有作为代码或依赖进入本应用。
- 没有链接 `excelize`、`unioffice`、Apache POI、docx4j 等第三方办公库。
- 没有复制其他办公软件的模板、图标或界面素材。

## 以后如果引入第三方库

在同一提交里做三件事：固定版本、在 `docs/legal/THIRD_PARTY_NOTICES.md` 加一行、把许可全文放进对应目录。只改代码不登记，视为未完成。
