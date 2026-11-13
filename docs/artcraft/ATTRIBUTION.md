# 上游出处与许可（artcraft）

NEXLOS artcraft 的**结构**与部分**算法**来自上游 ArtCraft（`github.com/storytold/artcraft`，官网 `gitartcraft.com`）。上游是双许可：

- MIT（`LICENSE-MIT`）
- Apache License 2.0（`LICENSE-APACHE`）

上游版权声明（`LICENSE-MIT` 原文）：

```
Copyright (c) 2026 ArtCraft Team and the ArtCraft contributors
```

NEXLOS 选择按 **MIT** 条款使用，并在本文件保留版权与许可声明。上游的 Rust 渲染器、Tauri 宿主、AI 模型调用与生成任务没有进入 NEXLOS；artcraft 只用零依赖 ES Module 在浏览器里重写了下列可离线运行的部分。

## 对应关系

| NEXLOS 文件 | 上游出处 | 性质 |
|---|---|---|
| `webos/a/artcraft/engine/keyframe.js` | `engine/animation/interpolation.ts`、`bezier.ts`、`keyframes.ts` | 三次贝塞尔求值与反解、de Casteljau 分割、通道求值与外插的公式移植 |
| `webos/a/artcraft/engine/blur.js` | `engine/effects/definitions/blur.ts` | 多 pass 规划与可分离卷积的参数移植 |
| `webos/a/artcraft/engine/gradient.js` | `engine/gradients/parser.ts`、`canvas.ts` | CSS 渐变语法解析与 stop 归一化 |
| `webos/a/artcraft/engine/curve.js` | 无直接对应 | 为 NEXLOS 矢量工具新增的 Catmull-Rom → 三次贝塞尔 |
| `webos/a/artcraft/engine/audio.js` | `engine/audio-mastering.ts`、`waveform-summary.ts` | 峰值/RMS 分桶、母线限幅参数（阈值 −1 dB、ratio 20、attack 1 ms、release 120 ms、headroom 0.98） |
| `webos/a/artcraft/engine/doc.js`、`webos/a/artcraft/export.js` | `engine/serialization.ts` 等 | 文档外壳约定与导出 MIME/编码的接口形态 |
| `webos/a/artcraft/kernel.js`、`image.js`、`vector.js`、`time.js`、`docs.js` | `frontend/apps/artcraft/app/` 的 app 清单、命令总线、面板组织 | 交互结构与命令命名的转译，代码为 NEXLOS 重写 |

迁移后的算法归属保存在此表；原研究笔记与历史测量未作为当前版本的验证证据分发。

## 未使用的部分

- Rust 引擎、Tauri 2 宿主、`artcraft-native`（egui）桌面端。
- AI 生成、provider 登录、计费、任务队列与云端素材。
- 上游的 React/TypeScript 组件代码：NEXLOS 没有构建步骤，界面按 `craftShell` 契约重写。

## 维护约定

新增从上游移植的算法时，在本表补一行，并写清「公式移植」还是「结构转译」。只参考公开文档与接口形态、未复制代码的部分标为「结构转译」。
