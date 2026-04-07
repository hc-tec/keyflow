# Android Function Kit 注册表基线

日期：2026-03-23  
编码：UTF-8

## 背景

此前 Android 侧 `Function Kit` 运行链路有两个核心硬编码：

1. Gradle 只会把 `chat-auto-reply` 同步进 Android assets
2. 运行时只会从固定路径 `function-kits/chat-auto-reply/manifest.json` 加载功能件

这意味着即使工作区以后新增第二个功能件，Android 侧也既不会打包进去，也不会发现它。

## 本轮目标

先建立最小可用的多 Function Kit 注册/发现基线，把 Android 从“单一样板运行时”改成“目录注册表驱动”，为后续多个功能件并列入口做准备。

## 实现内容

### 1. Gradle 资产同步改为同步整个功能件目录

`app/build.gradle.kts` 不再只同步 `chat-auto-reply`，而是：

- 扫描 `TODO/function-kits/*/manifest.json`
- 将每个功能件的 `manifest.json` 与 `ui/app` 同步进 Android 主 assets
- 将每个功能件存在的 `tests/fixtures` 同步进 Android test assets

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/build.gradle.kts`

### 2. 新增运行时注册表

新增 `FunctionKitRegistry`：

- 从 Android assets 的 `function-kits/` 目录扫描已安装功能件
- 按 `manifest.json` 解析功能件清单
- 支持：
  - 显式按 `kitId` 解析
  - 优先解析默认样板 `chat-auto-reply`
  - 当默认样板不存在时退回首个可用功能件

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitRegistry.kt`

### 3. Manifest 结构补上显示名

`FunctionKitManifest` 现在额外保留：

- `name`
- `description`

这样状态区和窗口标题以后就可以基于 manifest 自己的元数据展示，而不是继续靠散落的字符串硬编码。

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitManifest.kt`

### 4. Window / Settings / More 面板改为使用注册表

`FunctionKitWindow` 现在支持按 `kitId` 打开指定功能件，默认则由注册表决定首选功能件。  
`FunctionKitSettingsFragment` 也不再直接读固定 manifest 路径，而是改为读取注册表选出的默认功能件。  
`StatusAreaWindow` 的 `More` 面板入口则改为根据注册表列出已安装功能件，并在点击时把具体 `kitId` 传给 `FunctionKitWindow`。

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/ui/main/settings/behavior/FunctionKitSettingsFragment.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/status/StatusAreaWindow.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/status/StatusAreaEntry.kt`

### 5. 当前样板功能件显示名做本地化兜底

虽然注册表已经能读取 manifest 里的 `name`，但当前样板 manifest 的名字仍是英文 `Chat Auto Reply`。  
为了不让中文界面退回英文显示，本轮对默认样板做了一个最小本地化兜底：

- `chat-auto-reply` 仍优先显示现有字符串资源 `聊天自动回复`
- 其他未来功能件则先显示 manifest 自带名称

## 单元测试

新增 JVM 单元测试，固定注册表的选择策略：

- 显式请求 `kitId` 时优先命中
- 未显式指定时优先默认样板 `chat-auto-reply`
- 默认样板不存在时回退到首个可用功能件
- 无可用功能件时返回 `null`

对应文件：

- `TODO/ime-research/repos/fcitx5-android/app/src/test/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitRegistryTest.kt`

## 验证

在 `TODO/ime-research/repos/fcitx5-android` 下执行：

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitRegistryTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitQuickAccessSpecTest --tests org.fcitx.fcitx5.android.ui.main.settings.behavior.FunctionKitSettingsStatusResolverTest :app:compileDebugKotlin --console=plain --warning-mode=all
```

结果：

- `BUILD SUCCESSFUL`
- 注册表选择逻辑单测通过
- 快捷入口与设置状态相关单测通过
- `:app:compileDebugKotlin` 通过

## 当前边界

这轮解决的是“打包进来”和“被发现”的问题，不等于已经完成“多个功能件在工具栏中并列固定显示”。

现在的真实状态是：

- `More` 面板已经具备按注册表列出多个功能件的基础
- 主工具栏仍然只有一个总入口按钮
- 下一步需要继续做“多个固定功能件与剪贴板/文本编辑并列”的入口层设计与实现
