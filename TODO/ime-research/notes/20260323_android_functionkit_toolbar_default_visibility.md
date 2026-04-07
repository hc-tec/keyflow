# Android Function Kit 默认展开可见性补强

日期：2026-03-23  
编码：UTF-8

## 背景

此前 Android 侧已经具备：

- `Function Kit` 工具栏快捷入口
- `showToolbarButton` 固定开关
- `expandToolbarByDefault` 全局键盘工具栏默认展开开关

但这两个开关分散在不同设置页里，导致一个非常糟糕的体验：

- 用户在 `Function Kit` 设置页里把快捷入口固定好了
- 结果键盘启动时工具栏默认仍然是收起的
- 用户主观感受就会变成“我明明开启了，为什么还是看不到”

## 本轮目标

把“是否固定入口”和“打开键盘时是否立即可见”这两件事在 `Function Kit` 设置页里直接说明，并把默认展开开关直接放进当前页，避免继续绕路。

## 实现内容

### 1. `Function Kit` 设置页新增默认展开代理开关

在 `FunctionKitSettingsFragment` 顶部状态区新增一个直接代理到全局键盘设置 `expandToolbarByDefault` 的开关：

- 标题复用已有文案 `默认展开工具栏`
- 实际写入的仍然是 `keyboard.expandToolbarByDefault`
- 只是把这个全局设置镜像到 `Function Kit` 页面中，方便直接调整

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/ui/main/settings/behavior/FunctionKitSettingsFragment.kt`

### 2. 区分三种键盘入口状态

`Function Kit` 设置页的“键盘入口”状态现在会明确区分：

1. 工具栏快捷入口隐藏
2. 工具栏快捷入口已固定，且键盘启动时立即可见
3. 工具栏快捷入口已固定，但键盘启动时仍因工具栏收起而不可见

其中第 3 种状态是这次重点补上的，因为它正是最容易让用户误以为“入口没生效”的情况。

### 3. 状态解析逻辑补充

`FunctionKitSettingsStatusResolver` 新增以下状态：

- `expandToolbarByDefault`
- `quickAccessVisibleOnKeyboardStart`

这样设置页文案就不再只能回答“入口有没有被固定”，而是能回答“打开键盘时用户到底看不看得到”。

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/ui/main/settings/behavior/FunctionKitSettingsStatusResolver.kt`

## 单元测试

补充 JVM 单元测试，覆盖：

- 当 `showToolbarButton=true` 且 `expandToolbarByDefault=true` 时，快捷入口会在键盘启动时可见
- 当 `showToolbarButton=true` 但 `expandToolbarByDefault=false` 时，快捷入口已固定但启动时仍不可见

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/test/java/org/fcitx/fcitx5/android/ui/main/settings/behavior/FunctionKitSettingsStatusResolverTest.kt`

## 验证

在 `TODO/ime-research/repos/fcitx5-android` 下执行：

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.ui.main.settings.behavior.FunctionKitSettingsStatusResolverTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitQuickAccessSpecTest :app:compileDebugKotlin --console=plain --warning-mode=all
```

结果：

- `BUILD SUCCESSFUL`
- `FunctionKitSettingsStatusResolverTest` 通过
- `FunctionKitQuickAccessSpecTest` 通过
- `:app:compileDebugKotlin` 通过

## 结果

这轮没有去改键盘状态机本身，而是先把“固定入口”和“默认可见”这两个用户最容易混淆的层面在设置页里彻底讲清楚，并提供直接控制入口。这样可以先把体验歧义收掉，再继续做后续的多 Function Kit 并列入口与真实联调。
