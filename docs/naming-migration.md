# 命名基线与旧数据边界

产品显示名称为 **NexlOS**，命令、包、模块和路径使用 `nexlos`，环境变量前缀为 `NEXLOS_`。

本次将旧的 `nnos` / `NNOS` 全量替换，包括文件名、Go 模块、C/Objective-C 符号、环境变量、HTTP 头、消息类型、浏览器存储键和应用包标识。

| 旧名称 | 新名称 |
| --- | --- |
| `nnos`、`nnos.mjs` | `nexlos`、`nexlos.mjs` |
| `NNOS_HOME`、`NNOS_*` | `NEXLOS_HOME`、`NEXLOS_*` |
| `.nnos`、`NNOS-Workspace` | `.nexlos`、`NEXLOS-Workspace` |
| `nnos.app/1`、`nnos.app/2` | `nexlos.app/1`、`nexlos.app/2` |
| `.nnosapp` | `.nexlosapp` |
| `X-NNOS-*` | `X-NEXLOS-*` |
| `nnos.*` 存储键及事件 | `nexlos.*` 存储键及事件 |

新目录按新装基线维护，不生成旧名称的二进制别名。旧源码和已有运行数据没有被就地修改。

旧环境变量、浏览器偏好与跨窗口消息不会自动转换。已有 Markdown、图片和普通文稿可以先复制到备份工作区进行导入验证；涉及带旧 schema 的 JSON、节点协议或应用包时，需要针对格式迁移。不要对用户数据文件执行不加区分的全局字符串替换。

**签名应用包不能只改扩展名或 schema。** schema 属于签名清单内容，修改后必须用可信密钥重新打包、计算文件哈希并签名。跨版本集群节点和父子窗口桥接也应成组升级；新旧协议混用尚未验证。

采用新目录试运行前，显式设置一个新的 `NEXLOS_HOME`，避免复用当前生产工作区。需要保留旧浏览器偏好时，先导出 origin 对应数据，另做一次有备份、可回退的迁移。原版程序与原数据目录可作为回退基线。
