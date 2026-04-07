# Android Function Kit 快捷入口重构

日期：2026-03-23  
编码：UTF-8

## 背景

Android 侧虽然已经有 `Function Kit` 工具栏按钮和 `More` 面板入口，但实际体验仍然容易被理解成“藏在更多里”的二级能力：

- 工具栏按钮语义偏向 `send/chat`
- `More` 面板入口标题偏向单一样板 `聊天自动回复`
- 主设置入口摘要没有强调“键盘内快捷入口”这一点

这会让 `Function Kit` 更像某个单独 demo，而不是键盘里的一级工具能力。

## 本轮实现

### 1. 统一快捷入口规格

新增 `FunctionKitQuickAccessSpec`，把以下内容收拢到同一处：

- 工具栏按钮排序
- 工具栏图标/文案
- `More` 面板中的 Function Kit 静态入口图标/文案

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitQuickAccessSpec.kt`

### 2. 提升工具栏中的入口显著性

工具栏按钮顺序调整为：

1. `Function Kit`
2. `Clipboard`
3. `Text Editing`
4. `Undo`
5. `Redo`
6. `More`

这样 `Function Kit` 不再处于弱化位置，而是成为展开工具栏后最先可见的一等入口。

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/ui/idle/ButtonsBarUi.kt`

### 3. 把入口语义从“聊天自动回复”提升为“Function Kit”

调整点：

- 工具栏按钮改用更贴近“功能件/扩展”的统一图标
- `More` 面板首项标题改为 `Function Kit`
- Android 主设置入口图标同步为统一图标
- 设置摘要明确提到“工具栏快捷入口”

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/status/StatusAreaWindow.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/ui/main/MainFragment.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/res/values/strings.xml`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/res/values-zh-rCN/strings.xml`

## 单元测试

新增纯 JVM 单元测试，覆盖：

- 工具栏排序是否仍然把 `Function Kit` 放在前列
- Function Kit 工具栏按钮是否仍然使用统一图标/文案
- `More` 面板静态入口是否仍然以 `Function Kit` + `Function Kit Settings` 开头

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/test/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitQuickAccessSpecTest.kt`

## 验证

在 `TODO/ime-research/repos/fcitx5-android` 下执行：

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitQuickAccessSpecTest --tests org.fcitx.fcitx5.android.ui.main.settings.behavior.FunctionKitSettingsStatusResolverTest :app:compileDebugKotlin --console=plain --warning-mode=all
```

结果：

- `BUILD SUCCESSFUL`
- 相关 JVM 单元测试通过
- `:app:compileDebugKotlin` 通过

## 结果

本轮没有去扩展“多个 Function Kit 动态 pin 到工具栏”的复杂机制，而是先把现有单入口做成真正可感知、可追踪、可回归验证的一等能力。后续若要支持多个固定功能件，可在 `FunctionKitQuickAccessSpec` 的基础上继续演进，而不是回到分散硬编码。
