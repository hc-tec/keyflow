# Fcitx5-Android（小企鹅输入法）开源性与可定制性审计（2026-03-20）

> 编码：UTF-8  
> 审计时间：2026-03-20T22:45:00+08:00  
> 聚焦平台：Android（主）+ Windows（延伸）  
> 审计对象（本地）：`TODO/ime-research/repos/fcitx5-android`（commit `fe3a618c8fd18842305d2f8ec2880fcc67ec1679`）  
> 问题：1）“源码是否全都开源？” 2）“后面定制化是否可以？”  

## 1. 结论先行（TL;DR）

### 1.1 “源码是否全都开源？”

如果你说的“全开源”是**源码都能拿到**：基本可以认为是（主仓库 + 大多数依赖都在 GitHub 公开仓库、子模块也都可拉取）。

但如果你说的“全开源”是**每个部分都带有明确的开源许可证 + 可合规再分发**：目前不能简单回答“是”。我在 `fe3a618c...` 这个版本里看到至少三类需要你额外把关的风险点：

1. **预编译依赖/数据（`prebuilt/` 子模块）大量存在**：包含很多 `.a`、头文件、词典/数据文件，但仓库本身几乎不提供“第三方许可证归档/源码获取说明”。做产品分发必须补齐 `THIRD_PARTY_NOTICES`、源码/对象文件提供方式等合规材料。
2. **用于生成预编译依赖的构建工具仓库缺少明确 LICENSE**：  
   - `https://github.com/fcitx5-android/prebuilder`（我本地克隆：`TODO/ime-research/repos/fcitx5-android-prebuilder`，commit `1b8e547b436ee7db4bdc1d45daef8d073beb0511`）未发现 `LICENSE/COPYING` 或 SPDX 声明。  
   - `https://github.com/fcitx5-android/anthy-cmake`（对应子模块路径：`TODO/ime-research/repos/fcitx5-android/plugin/anthy/src/main/cpp/anthy-cmake`）同样未发现 `LICENSE/COPYING` 或 SPDX 声明。  
   **没有明确许可证 ≠ 开源**（法律默认通常是“保留所有权利”）。这两者虽然更像“构建工具/胶水”，但如果你后续要重用/改造它们，必须先解决许可问题（联系作者补 LICENSE、或你自己重写替代）。
3. **中文词典/语言模型数据的许可需要单独确认**：`libime` 的数据构建脚本会从 `https://download.fcitx-im.org/data/` 下载 `dict-*.tar.zst`、`lm_sc.arpa-*.tar.zst`、`table-*.tar.zst` 再生成 `sc.dict`/`zh_CN.lm` 等（见 `TODO/ime-research/repos/fcitx5-android/lib/libime/src/main/cpp/libime/data/CMakeLists.txt`）。数据不是“代码”，但分发同样受许可约束。

### 1.2 “后面定制化是否可以？”

可以定制，但要接受现实：

- **轻度定制**（品牌/主题/默认输入方案/资源打包）可行，且工程链路已经被 F-Droid/Jenkins 等打通。
- **深度产品定制**（键盘布局系统、候选交互、语音/AI、跨端同步）也可行，但需要你维护一个长期分叉，并投入 Kotlin/Android IME + Native(C/C++) + 数据工程（词典/语言模型）三个方向的人力。
- README 明确写了：**Virtual Keyboard 的 layout “not customizable yet”**，并把“Customizable keyboard layout”列为 Planned Features（见 `TODO/ime-research/repos/fcitx5-android/README.md`）。也就是说：想做“可配置的键盘布局”要么等上游实现，要么你自己做。

## 2. 我对“全开源”的判定口径（避免自嗨）

我把“全开源”拆成三问（建议你以后也按这个口径判断任何输入法项目）：

1. **可获得性**：源码能否从公开渠道获得（GitHub/GitLab/自建 git 等）。
2. **许可明确性**：每个可分发部分是否有明确开源许可证（SPDX/`LICENSE`/`COPYING`/REUSE）。
3. **分发构成**：APK 里是否包含预编译二进制/数据（以及是否能履行 LGPL/GPL/数据许可义务）。

只有 1）满足不等于“真开源”；2）和 3）决定你后续能否“放心定制并分发”。

## 3. 关键组件与许可证线索（以本地仓库为证）

> 说明：这里只列“对你做产品/合规最关键”的部分；完整子模块列表见 `TODO/ime-research/repos/fcitx5-android/.gitmodules`。

### 3.1 主仓库

- `fcitx5-android`：根目录 `LICENSE` 为 **LGPL-2.1**（`TODO/ime-research/repos/fcitx5-android/LICENSE`）。

### 3.2 内置中文（主 APK 内）的关键库

- `fcitx5`（核心框架）：`TODO/ime-research/repos/fcitx5-android/lib/fcitx5/src/main/cpp/fcitx5/`（有 `LICENSES/` 目录，REUSE 风格）。
- `libime`（拼音/词典/LM 工具链）：`TODO/ime-research/repos/fcitx5-android/lib/libime/src/main/cpp/libime/`（有 `LICENSES/` 目录）。
- `fcitx5-chinese-addons`（拼音/双拼/码表等）：`TODO/ime-research/repos/fcitx5-android/lib/fcitx5-chinese-addons/src/main/cpp/fcitx5-chinese-addons/`  
  - 线索：根有 `COPYING`（LGPL-2.1 文本）+ `LICENSES/`（包含 `GPL-2.0-or-later.txt`、`LGPL-2.1-or-later.txt`）。  
  - 需要你注意的细节：存在文件级 GPL 标注，例如 `TODO/ime-research/repos/fcitx5-android/lib/fcitx5-chinese-addons/src/main/cpp/fcitx5-chinese-addons/im/pinyin/pinyin.lua` 的 SPDX 是 `GPL-2.0-or-later`。

### 3.3 预编译依赖/数据（`prebuilt` 子模块）

- 子模块路径：`TODO/ime-research/repos/fcitx5-android/lib/fcitx5/src/main/cpp/prebuilt`（commit `31a2970338ba45ce3dc02e4a36edea924cae867d`）。  
- 内容形态：大量按 ABI 分类的静态库（例如 `prebuilt/boost/arm64-v8a/lib/libboost_*.a`）+ 各类数据。  
- 许可证归档现状（我本地看到的）：`prebuilt` 内存在少量 `LICENSE` 文件（例如 `libuv/*/share/doc/libuv/LICENSE`），但**远不足以覆盖所有第三方组件**。如果你要做正式分发，务必补齐第三方组件清单与许可证文本/链接。
- 预编译产物来源线索：`toolchain-versions.json` 记录了 `prebuilder` 的 commit：`TODO/ime-research/repos/fcitx5-android/lib/fcitx5/src/main/cpp/prebuilt/toolchain-versions.json`。

### 3.4 `prebuilder`（生成 `prebuilt/` 的工具链）

- 仓库：`https://github.com/fcitx5-android/prebuilder`  
  - 本地路径：`TODO/ime-research/repos/fcitx5-android-prebuilder`  
  - commit：`1b8e547b436ee7db4bdc1d45daef8d073beb0511`（与 `toolchain-versions.json` 一致）  
  - **问题：缺少明确 LICENSE**（也没有 SPDX 头；`nix/default.nix` 里甚至写了 `license = "unknown";`）。  
  - README 给出了其构建的第三方库来源清单：`TODO/ime-research/repos/fcitx5-android-prebuilder/README.md`（这能帮助你补第三方 notices，但不等于“该仓库自身可被合法复用/改造”）。

### 3.5 插件 APK（可与主 APK 解耦分发）

Fcitx5-Android 的一大优势是 **插件系统**：插件通常是独立 APK（独立 `applicationId`），因此可以在“功能/许可/分发节奏”上与主 APK 解耦。

举例：

- `plugin/rime` 是独立应用模块（见 `TODO/ime-research/repos/fcitx5-android/plugin/rime/build.gradle.kts` 的 `applicationId = "org.fcitx.fcitx5.android.plugin.rime"`）。  
- 插件源码中能看到混合的 SPDX（例如 `fcitx5-rime` 中有 LGPL 与 GPL 文件并存），这意味着：  
  - 你可以**选择不分发某些插件**来降低许可复杂度；  
  - 但如果你要分发插件，必须分别做 NOTICE/源码提供/许可证兼容性核对。

## 4. 为什么“小企鹅”开箱就能中文（你问的核心痛点）

你说“目前也就小企鹅输入法支持中文”，根因通常不是“别的项目不会中文”，而是**中文输入依赖大体积词典/语言模型/转换数据**，很多开源键盘默认不内置（体积、维护、许可、更新策略都会卡住）。

Fcitx5-Android 的做法是把关键数据打包进资产里（来自 `prebuilt/`）并在构建阶段安装到应用可用的目录结构中；其中 `libime` 的 `sc.dict`/`zh_CN.lm` 等数据是中文能用的关键（线索见 `TODO/ime-research/repos/fcitx5-android/lib/libime/src/main/cpp/libime/data/CMakeLists.txt` 里的远程数据下载与生成规则）。

## 5. 定制化能做什么（按投入分层）

### 5.1 L0（几乎不改代码）：做“发行版”

你可以把它当“底座”，主要做：

- 默认主题/默认输入法组合/默认开关策略
- 预置数据更新策略（是否允许在线更新词典、是否允许插件市场）
- 品牌、文案、隐私说明、崩溃收集策略

### 5.2 L1（改 Kotlin/资源）：做差异化交互

你可以改：

- 候选栏交互、浮动候选面板、剪贴板管理、符号/emoji 选择器
- 键盘按键视觉、按键反馈、长按/滑动逻辑

但你会碰到一个“上游已知限制”：键盘布局目前是代码内硬编码常量。比如 `TextKeyboard.Layout` 直接写死在 `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/keyboard/TextKeyboard.kt`。

### 5.3 L2（改 Kotlin + Native + 数据）：做“可配置布局 + 词典/LM 管线”

如果你要做你自己的“键盘布局 DSL/编辑器/导入导出”，需要：

- 把 `TextKeyboard.Layout` 这类硬编码 layout 抽成可序列化配置（JSON/YAML/自定义 DSL）
- 解决布局的版本迁移与兼容（否则一次更新就把用户自定义布局搞崩）
- 对中文：建立“词典/语言模型”更新管线（热更新、增量、用户词库合并、回滚）

### 5.4 L3（跨端一致）：Windows + Android 共享引擎/配置

这一步最大难点不在 Android，而在 Windows TSF/兼容/分发。Fcitx5 有 Windows 适配项目（`fcitx5-windows`），但要做到商用品质需要大量设备/应用矩阵测试（Office/浏览器/IDE/游戏/系统 UWP 等）。

## 6. 我认为最大的挑战（给你“主见”，避免 AI 只讲漂亮话）

1. **许可与分发合规不是“写个 LICENSE”就完事**：LGPL/GPL/第三方依赖/数据许可叠加后，真正麻烦的是“你要怎么向用户提供源码/对象文件/notice/安装信息”，以及你是否能长期维护这套流程。
2. **中文体验取决于数据工程**：词典/语言模型质量、用户词库策略、纠错/联想/热词、同步与隐私，决定了体验上限；光有框架不够。
3. **键盘布局系统是输入法产品的“护城河也是天坑”**：要做到可编辑、可分享、可回滚、可迁移、兼容多语言，还要保证性能与稳定性。
4. **IME 是高敏感软件**：权限解释、隐私合规、用户信任、供应链安全（依赖更新）都比普通 App 更苛刻。

## 7. 建议你下一步怎么做（务实路线）

1. **先明确你未来产品是“闭源商业”还是“开源发行版/服务收费”**。这会直接决定你对 LGPL/GPL 的容忍度与实现路线。
2. **做一次“可分发物料清单（SBOM/NOTICE）”的最小闭环**：哪怕先做 Debug/内部渠道，也要把第三方库与数据许可清点出来。
3. **对中文路线二选一（或并行）**：  
   - `libime`（更像“内置中文拼音/码表引擎”）：你要解决词典/LM 的更新与训练；  
   - `Rime`（更像“可导入的中文方案系统”）：生态强，但许可与插件分发要更谨慎。
4. **键盘布局先不做“全自定义”**：建议先做 2~3 套可切换的固定布局 + 小范围可配置（行高/键宽/符号层），把体验跑通再做编辑器。

## 8. 未确认项（建议你后续人工核对/找律师）

- `prebuilder`、`anthy-cmake` 缺少 LICENSE：是否能在商业项目里合法复用/改造？（建议联系作者补 LICENSE 或替换实现）
- `download.fcitx-im.org` 上 `dict-*.tar.zst` / `lm_sc.arpa-*.tar.zst` / `table-*.tar.zst` 的数据许可与可再分发性
- `prebuilt/` 中每个第三方库的“许可证文本 + 源码获取方式 +（如有）静态链接的 relink 义务”如何闭环
- `fcitx5-chinese-addons` 的文件级 GPL（`pinyin.lua`）对你最终分发许可的影响边界

