# Android Function Kit 多功能件可见性落地

日期：2026-03-23  
编码：UTF-8

## 背景

前一轮已经把 Android 工具栏改造成“动态 Function Kit 按钮 + 固定工具按钮”的组合式结构，但仍存在两个实际问题：

- catalog 里只有一个真实样板功能件，真机上看不到“多个 Function Kit 并列”
- 即使后续加了第二个功能件，工具栏按钮仍会全部显示成同一个扩展图标，用户很难区分

所以这轮要解决的不是“再写一层抽象”，而是把多功能件体验真正推到可见状态。

## 本轮实现

### 1. 新增第二个真实 Function Kit 样板 `quick-phrases`

新增一个纯本地功能件：

- 目录：`TODO/function-kits/quick-phrases/`
- 能力：
  - 读取当前输入上下文
  - 保存 3 个本地短语槽位
  - 对任一短语执行显式 `Insert / Replace`
- 不依赖：
  - `network.fetch`
  - `ai.chat`
  - `ai.agent.*`
  - `skills/*`
  - `tools/*`

它的定位很明确：不是复杂 AI 功能件，而是“第二个真实可用 kit”，用于证明 Android 多功能件入口已经真正成形。

### 2. 工具栏 Function Kit 按钮增加可区分 monogram

仅仅把第二个 kit 放进 catalog 还不够，因为工具栏按钮之前都会共用同一个扩展图标。  
这轮把 Android 侧按钮表现改成：

- 固定工具按钮继续显示原始 icon
- Function Kit 按钮改为根据显示名称生成 1 到 2 个字符的 monogram

例如：

- `Chat Auto Reply` -> `CA`
- `Quick Phrases` -> `QP`

这样在真机上即使两个按钮都还是同一类“功能件入口”，用户也能直接区分是哪一个 kit。

### 3. 目录约定从“强依赖 AI/skills”修正成“本地 kit 可独立存在”

`TODO/function-kits/INDEX.md` 原先把 `skills/`、`tools/`、`tests/fixtures/` 写成每个 kit 都必须具备。  
这不符合现在的实际设计，因为像 `quick-phrases` 这种本地功能件根本不需要 Agent、skills 或 tool schema。

这轮把约定改成：

- 每个 kit 至少要有 `manifest.json` 和浏览器式 UI 入口
- AI / Agent 型功能件才额外要求 `skills/`、`tools/`、`fixtures`

## 对应代码

Android 内仓库：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/ui/ToolButton.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/ui/idle/ButtonsBarUi.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitQuickAccessSpec.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/test/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitQuickAccessSpecTest.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/test/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitRegistryTest.kt`

外仓库功能件目录：

- `TODO/function-kits/quick-phrases/manifest.json`
- `TODO/function-kits/quick-phrases/ui/app/index.html`
- `TODO/function-kits/quick-phrases/ui/app/main.js`
- `TODO/function-kits/quick-phrases/ui/app/styles.css`
- `TODO/function-kits/quick-phrases/README.md`
- `TODO/function-kits/quick-phrases/ui/README.md`
- `TODO/function-kits/INDEX.md`

## 验证

### 1. 前端脚本语法

在仓库根目录执行：

```powershell
node --check TODO/function-kits/quick-phrases/ui/app/main.js
```

结果：

- 无语法错误

### 2. Android 单元测试 + 编译

在 `TODO/ime-research/repos/fcitx5-android` 下执行：

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitQuickAccessSpecTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitRegistryTest --tests org.fcitx.fcitx5.android.ui.main.settings.behavior.FunctionKitSettingsStatusResolverTest :app:compileDebugKotlin --console=plain --warning-mode=all
```

结果：

- `syncFunctionKitAssets` 成功把 `quick-phrases` 同步进 Android assets
- `FunctionKitQuickAccessSpecTest` 通过
- `FunctionKitRegistryTest` 通过
- `FunctionKitSettingsStatusResolverTest` 通过
- `:app:compileDebugKotlin` 通过
- `BUILD SUCCESSFUL`

## 提交记录

- inner repo `fcitx5-android`: `76d122f` `feat: distinguish function kit toolbar buttons`
- outer repo root: `bce997b` `feat: add quick phrases function kit sample`

## 当前边界

这轮已经把“多工具栏槽位”推进到了“真机上能看到至少两个真实 Function Kit，并且按钮能区分”的阶段。  
下一步真正剩下的，不再是“有没有多个按钮”，而是：

- pinning / ordering / recent 使用策略
- 更多真实业务 kit
- 多 kit 间的权限、发现和状态管理细化
