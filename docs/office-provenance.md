# 便携办公来源说明

插件版的办公应用是本地实现的前端，通过 `webos/a/office/api.js` 与本机服务通信。写这份说明是为了回答一个具体问题：这里有没有第三方代码。答案是除下表列出的资源外没有。

## 实现范围

| 位置 | 内容 | 依据 |
| --- | --- | --- |
| `webos/a/office/editors.js` | 六个编辑器共用一份文档模型 | 自写，不引用前端框架 |
| `webos/a/office/formula.js` | 表格公式：词法 → 递归下降 → 求值 | 自写 |
| `webos/a/office/print.js` | 打印与分页视图 | 自写 |
| `webos/a/office/api.js` | 与本机服务的唯一出口 | 自写 |
| `webos/a/office/ui/tools/qrcode.html` | 二维码生成 | Nayuki QR Code generator，MIT，完整文本在 HTML 内 |
| `webos/a/office/fonts/` | 文档字体 | 各字体上游许可，见 `fonts/LICENSES.md` |

格式解析与导出（DOCX / XLSX / PPTX / PDF / HTML / Markdown）由同版本 Go 模块完成，实现依据是 ECMA-376 / ISO/IEC 29500 与 ISO 32000-1 公开规范，来源说明见该模块的 `modules/office/PROVENANCE.md`。

## 没有带入的东西

- 历史调研、竞品拆解与逆向笔记没有作为代码或依赖进入本应用。
- 没有链接 `excelize`、`unioffice`、Apache POI、docx4j 等第三方办公库。
- 没有复制其他办公软件的模板、图标或界面素材。

## 以后如果引入第三方库

在同一提交里做三件事：固定版本、在 `THIRD_PARTY_NOTICES.md` 加一行、把许可全文放进对应目录。只改代码不登记，视为未完成。
