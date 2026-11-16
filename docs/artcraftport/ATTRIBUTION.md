# ArtCraft 移植版（ArtCraft for NexlOS）· 移植实现说明

## 1. 这是什么

ArtCraft 移植版是 NexlOS 内置「应用生成」的一个示例案例（入口 `#/store`，实现见仓库根 `appgen.js`（运行时路径 `/nexlos/appgen.js`））：一组零依赖的创作工具，覆盖位图、矢量、时间线、文档与净室分析工作台。工程上它同时承担两件事：

- 作为「应用生成」的样板产物：应用清单、命令总线、文档状态与面板组织由同一套契约驱动；
- 作为一次公开的上游移植练习：结构与部分算法来自 storytold 的 ArtCraft，改写成没有构建步骤的 ES Module 实现。

换句话说，它不是从零写的创作套件，而是 **ArtCraft 在 NexlOS 里的一次安装**：结构与可移植算法来自上游，装配方式、命令约定与界面实现属于本项目。

> **署名与关系**：上游是 storytold 的 ArtCraft（`github.com/storytold/artcraft`，官网 `getartcraft.com`），MIT / Apache-2.0 双许可。ArtCraft 移植版是独立的非官方移植，不是 ArtCraft 的官方发行物，与上游团队没有隶属、赞助、认证或背书关系；上游也不对本移植版的正确性、安全性或可用性负责。
>
> 上游版权声明（`LICENSE-MIT` 原文）：`Copyright (c) 2026 ArtCraft Team and the ArtCraft contributors`

## 2. 为什么保留上游名字

这个模块就是「把 ArtCraft 装进 NexlOS」：上游是 storytold 的 ArtCraft（Rust 引擎 + Tauri 宿主 + React 前端），本项目把它的编辑器结构与可独立移植的算法搬进 WebOS，再用自己的契约重新装配。名字因此保留 ArtCraft，并加限定词 **ArtCraft 移植版 / ArtCraft for NexlOS**：

- 对人：看到名字就知道它是什么、从哪里来，不会被当成又一个原创套件；
- 对上游：始终标明「非官方」，不主张商标，不使用上游图标与素材，并完整保留 MIT 声明；
- 对内：应用 id、路由与目录使用 `artcraftport`，与上游仓库名区分；旧标识 `artcraft`、`artgrft` 与 `baigong` 只在会话迁移里保留映射，用于读取旧 localStorage 键。

早期曾改用中性名「百工 / Baigong」，但这个名字既不说明它是 ArtCraft 的移植，也容易被误读为独立产品，因此回到带限定词的上游名。这个用法属于指名性使用（nominative use），规则写在 `docs/legal/TRADEMARK.md` 第 6.1 节。

## 3. 移植实现的思路

**第一步，先定契约再取内容。** 上游是 Rust 引擎 + Tauri 宿主 + React 前端的三层结构；本项目没有构建步骤，也没有后端。所以先把「一个 craft 需要什么」定成三件事：命令（注册表 + 运行期面板）、文档状态（单一可序列化对象）、面板挂载（`mount(host)` 返回 `destroy`）。契约定死之后，上游的东西只能以「公式」或「接口形态」进来。

**第二步，把上游内容分成三类处理。**

- **公式移植**：能写成数学表达式或参数表的，按公式重写，并在注释里写明出处。贝塞尔求值与反解、de Casteljau 分割、可分离卷积的 pass 规划、音频分桶与限幅参数属于这一类。这类最容易被误认为抄代码，所以逐条列在第 4 节。
- **结构转译**：命令命名、面板分区、文档外壳字段这类组织方式，按本项目的 DOM 与状态模型重写，不保留上游代码形态。
- **不复用**：Rust 渲染器、Tauri 宿主、AI 生成与计费、云端素材、React 组件，全部不进来。

**第三步，零依赖约束倒逼实现。** 不引入 npm 运行时依赖（宿主已有的 `jpeg-js` 除外），画布、滤镜、导出走浏览器原生 API（Canvas2D、WebAudio、`Blob`）。这条约束决定了移植只能取算法与结构，取不了上游组件。

**第四步，留下可验证的痕迹。** 每个算法移植配一条固定输入的断言，放在通用版的 `test/artcraftport-*.test.mjs`（本树不随附算法测试）。来源表格与代码同仓：新增一条移植，就在第 4 节补一行，同时补许可全文。

## 4. 逐文件对应

本树路径：加载器是 `webos/a/artcraftport.js`；工作区模块作为可选包随仓库分发，源在 `extras/artcraftport/`，安装到 `webos/extras/artcraftport/` 后由 `/extras/` 路径加载。

| 本项目文件 | 上游出处（完整路径） | 性质 |
|---|---|---|
| `extras/artcraftport/engine/keyframe.js` | `frontend/libs/components/video-editor/src/lib/animation/interpolation.ts`、`bezier.ts`、`keyframes.ts` | 公式移植：三次贝塞尔求值与反解、de Casteljau 分割、通道求值与外插 |
| `extras/artcraftport/engine/blur.js` | `frontend/libs/components/video-editor/src/lib/effects/definitions/blur.ts` | 公式移植：多 pass 规划与可分离卷积参数 |
| `extras/artcraftport/engine/gradient.js` | `frontend/libs/components/video-editor/src/lib/gradients/parser.ts`、`canvas.ts` | 公式移植：CSS 渐变语法解析与 stop 归一化 |
| `extras/artcraftport/engine/audio.js` | `frontend/libs/components/video-editor/src/lib/media/audio-mastering.ts`、`waveform-summary.ts` | 公式移植：峰值/RMS 分桶、母线限幅参数（阈值 −1 dB、ratio 20、attack 1 ms、release 120 ms、headroom 0.98） |
| `extras/artcraftport/engine/doc.js`、`extras/artcraftport/export.js` | `frontend/libs/components/video-editor/src/lib/services/storage/serialization.ts` | 结构转译：文档外壳字段与导出 MIME/编码的接口形态 |
| `extras/artcraftport/engine/curve.js` | 无直接对应 | 本项目新增：Catmull-Rom → 三次贝塞尔 |
| `extras/artcraftport/engine/timeline.js`、`paginate.js` | 无直接对应 | 本项目新增：时间轴刻度与分页 |
| `extras/artcraftport/kernel.js`、`image.js`、`vector.js`、`time.js`、`docs.js` | `frontend/apps/artcraft/app/src/` 的应用清单、顶层菜单与面板组织 | 结构转译：交互结构与命令命名，代码按本项目契约重写 |

## 5. 未移植的部分

- Rust 引擎、Tauri 2 宿主、`artcraft-native`（egui）桌面端。
- AI 生成、provider 登录、计费、任务队列与云端素材。
- 上游的 React/TypeScript 组件：本项目没有构建步骤，界面按自己的 `craftShell` 契约重写。

## 6. 许可

本移植版中来自上游的部分按 **MIT** 条款使用，版权与许可声明完整保留：

```
Copyright (c) 2026 ArtCraft Team and the ArtCraft contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

许可证不授予商标权。产品名中的 ArtCraft 只用于指出上游来源，并始终带「移植版 / for NexlOS」限定与「非官方」标注；本项目不使用上游的标志、图标或界面素材作为自身标识，也不主张该商标的任何权利。详见 `docs/legal/TRADEMARK.md` 第 6.1 节。

## 7. 界面参照

这些应用没有复制上游代码。菜单分区、面板布局与快捷键取舍参考的是同类工具链的通用工作流；下表只写工作流类型，不写产品名。

| ArtCraft 移植版应用 | 参照的工作流 |
|---|---|
| WordCraft | 长文档编辑：功能区、页面视图、标题导航 |
| GridCraft | 表格：公式栏、单元格网格、区域引用 |
| PhotoCraft | 位图：图层、混合模式、非破坏调整 |
| GenCraft | 提示词生成：候选帧、画幅比例、单帧导出 |
| LightCraft | 显影：曝光/对比/色温参数与直方图 |
| VectorCraft | 矢量：路径、锚点、对象层级 |
| CADCraft | 工程图：图纸空间、尺寸标注 |
| DesignCraft | 版面：主页、分栏、文本绕排 |
| FigCraft | 界面设计：画板、组件、原型连线 |
| DeckCraft | 幻灯：母版、占位符、放映 |
| TextureCraft | 贴图绘制：笔刷、通道、图层 |
| MaterialCraft | 材质：节点图与参数联动 |
| FilmCraft | 剪辑：时间线、素材箱、入出点 |
| EffectCraft | 合成：关键帧、图层、特效栈 |
| AniCraft | 逐帧动画：洋葱皮、时间轴 |
| SoundCraft | 多轨：混音台、声像、自动化 |
| Craft Anything | 本项目自有：字节启发式分析工作台 |

## 8. 维护约定

新增从上游移植的算法时，在第 4 节补一行，写清「公式移植」还是「结构转译」。只参考公开文档与接口形态、没有复制代码的部分标为「结构转译」，不随附上游许可全文；整段搬入上游代码时，必须在同一提交里补版权行与许可全文。新增 craft 时，如果在第 7 节参照了别人的工作流，就补一行。
