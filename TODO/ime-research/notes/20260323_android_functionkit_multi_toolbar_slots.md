# Android Function Kit 多工具栏槽位基线

日期：2026-03-23  
编码：UTF-8

## 背景

在注册表基线落地之后，Android 侧已经能：

- 同步多个功能件到 assets
- 通过注册表发现多个功能件
- 在 `More` 面板里按 `kitId` 打开具体功能件

但主工具栏仍然只有一个总入口按钮，这和“多个固定 Function Kit 与剪贴板、文本编辑并列”这条体验目标仍有差距。

## 本轮目标

把主工具栏结构改造成“动态功能件按钮 + 固定工具按钮”的组合式布局。这样即使当前 catalog 里只有一个功能件，后续新增第二个功能件时也不需要再重写工具栏容器。

## 实现内容

### 1. `ButtonsBarUi` 改为支持多个 Function Kit 按钮

此前 `ButtonsBarUi` 只内置一个固定的 `functionKitButton`。  
现在改为：

- 接收一组 `FunctionKitToolbarButtonEntry`
- 为每个功能件生成一个独立 `ToolButton`
- 将这些按钮统一暴露为 `functionKitButtons`

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/ui/idle/ButtonsBarUi.kt`

### 2. 工具栏布局改成动态功能件优先

`FunctionKitQuickAccessSpec` 现在不再假设只有一个 `Function Kit` 槽位，而是：

- 先插入所有动态功能件按钮
- 再追加固定工具：
  - `Clipboard`
  - `Text Editing`
  - `Undo`
  - `Redo`
  - `More`

这样只要 catalog 中注册了多个功能件，它们在布局上就已经能与剪贴板、编辑工具并列，而不是只能共享一个总入口。

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitQuickAccessSpec.kt`

### 3. `KawaiiBarComponent` 按注册表绑定动态按钮

`KawaiiBarComponent` 现在会：

- 通过 `FunctionKitRegistry` 读取已安装功能件
- 为每个功能件生成一条工具栏按钮 entry
- 为每个动态按钮分别绑定：
  - 点击：打开对应 `kitId` 的 `FunctionKitWindow`
  - 长按：进入 `Function Kit` 设置
- `showToolbarButton` 开关也会统一控制所有功能件按钮的显隐

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/KawaiiBarComponent.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/ui/IdleUi.kt`

## 单元测试

更新 JVM 单元测试，覆盖：

- 多个功能件按钮会排在固定工具按钮之前
- 固定工具顺序仍保持稳定
- `More` 按钮仍保持原有状态区语义

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/test/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitQuickAccessSpecTest.kt`

## 验证

在 `TODO/ime-research/repos/fcitx5-android` 下执行：

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitQuickAccessSpecTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitRegistryTest --tests org.fcitx.fcitx5.android.ui.main.settings.behavior.FunctionKitSettingsStatusResolverTest :app:compileDebugKotlin --console=plain --warning-mode=all
```

结果：

- `BUILD SUCCESSFUL`
- 多工具栏槽位相关 JVM 单测通过
- 注册表与设置状态单测通过
- `:app:compileDebugKotlin` 通过

## 当前边界

这轮解决的是“工具栏容器已经可以承载多个功能件按钮”，但当前工作区 catalog 实际上仍只有一个样板功能件 `chat-auto-reply`。  
所以当前真机上你看到的按钮数量仍然不会立刻变多，但结构已经不再卡死在“只允许一个 Function Kit 按钮”。
