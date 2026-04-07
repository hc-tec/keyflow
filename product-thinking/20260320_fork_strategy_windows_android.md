# Windows + Android 输入法：Fork 与定制化开发策略（2026-03-20）

> 编码：UTF-8  
> 更新时间：2026-03-20T23:15:00+08:00  
> 目标：从“能快速进入定制开发 + 可长期维护”的角度，给出 Fork 策略与 Windows/Android 的落地路径  

## 0. 你现在的判断（我同意，但要加边界）

你说“可以先 Fork 小企鹅输入法开始定制开发，暂时不用非常详细考虑合规性”，这在**原型期/自用测试期**是成立的。

但我建议你至少保留 3 条“最低限度的合规卫生”（不会拖慢研发，但能显著减少未来返工）：

1. 不删除/不改动上游 `LICENSE`、不隐藏第三方来源（哪怕暂时不写完整 NOTICE）。
2. 不把任何产物用于对外分发/商业上架（内部测试 OK）。
3. 尽量把高风险模块做成“可拆卸”（例如：把 AI/语音/联网能力做成可选插件或可编译开关；把词典/LM 数据更新管线做可替换实现）。

## 1. Android：建议直接 Fork `fcitx5-android` 进入定制开发

原因很简单：你已经实机验证“目前最接近你目标的中文体验”，并且我们也已经在 Docker 内可复现构建出 APK（见 `TODO/ime-research/notes/INDEX.md` 的日志索引）。

建议的 Fork 方式（工程层面）：

- 你自己的仓库：`your-org/fcitx5-android`（fork 后保持能同步上游）
- 本地配置：
  - `origin` 指向你的 fork
  - `upstream` 指向 `fcitx5-android/fcitx5-android`
- 子模块策略：
  - **先不改** `prebuilt/`（否则你会被“依赖链+体积+合规”一起拖下水）
  - 优先在 Kotlin/UI 层做差异化（候选栏、面板、主题、交互、账号同步、AI 入口）
  - 引擎/数据层的修改放到第二阶段（libime/rime）

## 2. Windows：不要指望 `fcitx5-windows` 立刻给你“可用中文输入”

我刚在本地 `TODO/ime-research/repos/fcitx5-windows` 里做了快速源码核对，结论是：

- 这个仓库里确实有 TSF 的骨架（`win32/tsf` + `win32/dll`），并且提供了 `regsvr32` 安装脚本。
- 但当前实现更像 PoC：按键处理会启动 Composition，然后写入一个硬编码字符 **“哈”**（见 `win32/tsf/EditSession.cpp`）。
- 没看到与 Fcitx5 引擎的 IPC/嵌入式对接逻辑，因此它离“完整输入法（候选、上屏、状态、配置、词库）”还很远。

因此：**Windows 端如果你想尽快可用中文输入**，更现实的路线是：

### 路线 W1（最快可用）：先采用成熟的 Windows 中文 IME 项目做原型

典型候选（我们本地已拉取）：Rime/Weasel（小狼毫）、PIME 等。

优点：你能立刻进入“体验与产品”迭代；缺点是许可证/架构与 Android 侧不一定一致（但原型期可以先不纠结）。

### 路线 W2（统一底座，长期工程）：自研/半自研 TSF 前端 + 复用引擎

如果你执意要“Windows 与 Android 共用同一套引擎/词库/配置”，你最终基本会走到：

- Windows：TSF 前端（候选 UI + 上屏 + 状态管理）  
- 引擎：要么嵌入（C++ 静态/动态链接），要么守护进程 + IPC  
- 数据：词典/LM/用户词库的同步与合并策略

这条路能做到产品级体验，但周期和风险都显著更高。

## 3. Windows 的构建环境：不建议 Docker，建议 MSYS2 + clang64（可脚本化）

Windows 输入法（TSF/COM 注册）这类事情，在 Docker 里做并不自然：即便能编译，**安装/注册/实际输入体验**仍然必须在真实 Windows 上做。

就 `fcitx5-windows` 这个仓库而言，它已经提供了一个工具链文件：`windows-cross/msys2.toolchain.cmake`，明确指向：

- `C:/msys64/clang64` 与 `C:/msys64/clangarm64`
- `extra-cmake-modules`（ECM）与 `gettext`（msgfmt/msgmerge）

这意味着：**它更像是为 MSYS2 clang64 生态准备的**，不依赖 Visual Studio/MSBuild。

后续我会把“MSYS2 安装 + 依赖安装 + CMake/Ninja 构建 + 产物收集”的完整流程写进 `TODO/ime-research/notes/`，并尽量脚本化，做到一键复现。

## 4. 我建议的阶段性落地顺序

1. **先把 Android Fork 开发跑起来**：确定你要做的第一批差异化能力（语音/AI/同步/候选交互）。
2. **Windows 先拿成熟方案做“可用原型”**（Rime/Weasel 或 PIME），快速验证跨端体验与同步需求。
3. 并行推进 Windows “统一底座”可行性：评估 TSF 前端要做的工作量，并决定是否投入（或是否接受 Windows/Android 使用不同引擎但统一账号与云能力）。

