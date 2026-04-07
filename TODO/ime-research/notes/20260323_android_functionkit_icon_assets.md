# Android Function Kit 图标资产支持

日期：2026-03-23  
编码：UTF-8

## 背景

此前 Android 侧所有 Function Kit 原生入口都只显示固定扩展图标：

- 工具栏按钮
- `More` / `Status Area` 面板

这会导致两个问题：

- 多个功能件即使已经并列展示，看起来仍像同一个入口
- 无法使用“浏览器插件式”图标资产表达功能件身份

## 本轮目标

让 Function Kit manifest 可以声明自己的图标资产，并让 Android 宿主原生读取这些图片，优先显示真实图标，失败时再回落到 monogram 或默认扩展图标。

## 支持方式

### 1. Manifest 图标声明

现在 Android 侧 manifest 解析支持：

- `icon: "icons/foo.ico"`
- `icons: { "32": "icons/foo.png", "128": "icons/foo.webp" }`
- `icons: [{ "src": "icons/foo.png", "sizes": "48x48 96x96", "type": "image/png" }]`

这三种写法都会被解析成统一的 icon asset 列表，并按目标尺寸选择更合适的图片。

### 2. 支持的图片格式

当前 Android 原生图标加载器支持：

- `png`
- `jpg` / `jpeg`
- `webp`
- `bmp`
- `ico`

其中 `.ico` 会在宿主侧解析 icon container，并尝试解码其中的：

- PNG frame
- BMP/DIB frame

### 3. 资产同步

Android Gradle 资产同步不再只复制 `manifest.json + ui/app`，而是会把功能件目录中的运行时资产一起带进 APK。  
因此 `icons/` 目录下的图片会和 UI 一样被同步进 `function-kits/<kitId>/...`。

## 样板更新

这轮把两个已有样板都接上了真实图标：

- `chat-auto-reply`：`icons/chat-auto-reply.ico`
- `quick-phrases`：`icons/quick-phrases.png`

这样可以直接验证 `.ico + .png` 两种常见格式。

## 原生渲染行为

### 工具栏

- 优先加载功能件声明的图标图片
- 如果图片加载失败，再回落到功能件 monogram
- monogram 仍然保留，作为损坏资源或缺图时的兜底

### `More` / `Status Area`

- 优先加载功能件声明的图标图片
- 如果图片加载失败，再回落到默认扩展图标
- 原生图片不会再被宿主主题 tint 成单色，尽量保留功能件自己的视觉识别

## 对应代码

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitManifest.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitIconLoader.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/ui/ToolButton.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/ui/idle/ButtonsBarUi.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/status/StatusAreaEntry.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/status/StatusAreaEntryUi.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/status/StatusAreaWindow.kt`
- `TODO/ime-research/repos/fcitx5-android/app/build.gradle.kts`

## 验证

在 `TODO/ime-research/repos/fcitx5-android` 下执行：

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitManifestTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitQuickAccessSpecTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitRegistryTest :app:compileDebugKotlin --console=plain --warning-mode=all
```

结果：

- `syncFunctionKitAssets` 成功同步 `icons/` 目录
- `FunctionKitManifestTest` 通过
- `FunctionKitQuickAccessSpecTest` 通过
- `FunctionKitRegistryTest` 通过
- `:app:compileDebugKotlin` 通过
- `BUILD SUCCESSFUL`

## 当前边界

这轮主要解决的是 Android 原生入口图标。  
如果后续还要把同一套图标继续下发给：

- WebView 内页面
- Windows 宿主
- 设置页中的已安装 Function Kit 列表

则还需要继续把 `icons` 字段纳入跨平台 manifest 契约，但 Android 这一侧的原生读取链已经打通。
