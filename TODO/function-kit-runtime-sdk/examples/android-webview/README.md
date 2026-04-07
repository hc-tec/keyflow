# Android WebView Host Example

> 编码：UTF-8
> 创建时间：2026-03-21T21:20:00+08:00
> 更新时间：2026-03-21T23:55:00+08:00
> 目标：给 Android 宿主一个最小可执行且带安全基线的 `WebView + FunctionKitRuntimeSDK` 接法。

## 1. 依赖

- Android `WebView`
- AndroidX `androidx.webkit:webkit`
- `WebViewAssetLoader`
- `WebViewCompat.addWebMessageListener(...)`
- `WebViewCompat.postWebMessage(...)`

## 2. 宿主职责

Android 宿主只需要做这几件事：

1. 创建 `WebView`
2. 用固定本地 origin 加载功能件页面
3. 只暴露 Host Bridge，不暴露高权限原生对象
4. 校验 UI 发回的 envelope 后再路由到宿主逻辑
5. 在需要时把 envelope 再发回页面

## 3. 当前安全基线

当前示例不是“能跑就行”，而是直接带上了 Android 侧最起码该做的约束：

- 固定 origin：`https://function-kit.local/...`
- 固定资源根：`/assets/...`
- 只允许本地资源加载，不允许远程导航 / 远程子资源
- 默认不用 `addJavascriptInterface`
- Host -> UI 走 `postWebMessage(...)`
- UI -> Host 走 `addWebMessageListener(...)`
- 禁用 `file://` / `content://` / 混合内容
- 拒绝下载与 Web 权限请求
- 收到 UI envelope 后先校验 `version/source/target/kitId/surface/payload`

## 4. 建议加载方式

推荐用：

- `WebViewAssetLoader.Builder().setDomain("function-kit.local")`
- `https://function-kit.local/assets/...`

这样 Android 端就和 Windows 端一样，都是“固定本地域名 + 浏览器容器”，而不是一端走虚拟主机、一端走 `file://`。

## 5. 最小接法

```kotlin
val config = FunctionKitWebViewHost.Config(expectedKitId = "chat-auto-reply")
val assetLoader = FunctionKitWebViewHost.createDefaultAssetLoader(context, config)
val host = FunctionKitWebViewHost(webView, assetLoader, onUiEnvelope = ::handleEnvelope, config = config)
host.initialize("function-kits/chat-auto-reply/ui/app/index.html")
```

前提是对应功能件静态资源已经被打包进 Android `assets/`。

## 6. 建议对接点

- Android 输入法主线：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/FcitxInputMethodService.kt`
- 当前最现实的挂载点不是整个键盘，而是 `InputView -> InputWindowManager` 这条现成扩展面板链路
- 建议新增 `InputWindow.ExtendedInputWindow`，再从 `KawaiiBarComponent` 或 `StatusAreaWindow` 打开
- 最终文本提交仍应回到 `FcitxInputMethodService.commitText(...)`，不要让 WebView 直接碰 `currentInputConnection`
- 详细挂载分析：`TODO/ime-research/notes/20260321_android_fcitx5_functionkit_mount_points.md`

## 7. 示例代码

- `TODO/function-kit-runtime-sdk/examples/android-webview/FunctionKitWebViewHost.kt`

当前示例已经直接包含：

- `createDefaultAssetLoader(...)`
- `dispatchReadyAck(...)`
- `dispatchPermissionsSync(...)`
- `dispatchContextSync(...)`
- `dispatchCandidatesRender(...)`
- `dispatchStorageSync(...)`
- `dispatchPanelStateAck(...)`
- `dispatchHostStateUpdate(...)`
- `dispatchPermissionDenied(...)`
- `dispatchBridgeError(...)`
