# Android Function Kit Host 加固记录

> 编码：UTF-8
> 创建时间：2026-03-21T23:55:00+08:00
> 更新时间：2026-03-21T23:55:00+08:00
> 范围：`TODO/function-kit-runtime-sdk/examples/android-webview/FunctionKitWebViewHost.kt`

## 1. 这次解决了什么

Android 侧原先只有一个“能通消息”的最小例子，但安全边界太松，不足以作为后续 `fcitx5-android` 或独立 Android IME 的基线。

这次把 Android 示例改成了真正可拿来做宿主基线的版本，重点补了：

- 固定本地 origin：`https://function-kit.local`
- 固定资源根：`/assets/`
- `WebViewAssetLoader` 只服务本地功能件资源
- `addWebMessageListener(...)` 替代默认 `addJavascriptInterface`
- `postWebMessage(...)` 做 Host -> UI 消息下发
- 阻断远程导航、远程子资源、下载、Web 权限申请
- UI 发来的 envelope 先做协议字段校验

## 2. 为什么要这样做

之前 Android 例子最大的问题，不是“功能少”，而是“边界太松”：

- 如果页面可以自由跳到远程 URL，那么输入法里的功能件 UI 就不再是受控代码
- 如果桥直接暴露给任意页面，后续权限模型就没有意义
- 如果 UI 消息不做最小协议校验，Host Bridge 会被错误输入直接污染

Windows 侧已经把 `function-kit.local + 本地资源映射 + 非本地请求阻断` 固定下来了，Android 侧必须收敛到同一个模型，否则跨平台 runtime 会从第一天开始分叉。

## 3. 当前 Android 示例的边界

当前示例明确要求：

- AndroidX `webkit` 能力可用
- `WEB_MESSAGE_LISTENER`
- `POST_WEB_MESSAGE`

也就是说，它默认站在“现代 Android WebView”这条线上，不再为了兼容旧桥接方式而无条件降级。

这是刻意选择，因为这里先要固定安全边界，而不是为了兼容把模型做松。

## 4. 还没完成的事

这次完成的是“Android runtime 参考宿主加固”，还不是“Android IME 真集成完成”。

后续仍要补：

- 把这套 Host 接进 `fcitx5-android` 的实际扩展面板
- Android 侧补 contract runner / replay runner
- Android 侧把候选提交最终接回 `commitText(...)`
- Android 侧增加 E2E 自动化，而不是只停在宿主适配示例

## 5. 当前相关文件

- Android 示例代码：`TODO/function-kit-runtime-sdk/examples/android-webview/FunctionKitWebViewHost.kt`
- Android 示例说明：`TODO/function-kit-runtime-sdk/examples/android-webview/README.md`
- SDK 仓库种子说明：`TODO/function-kit-runtime-sdk/README.md`
- 安全模型：`TODO/function-kit-runtime-sdk/docs/SECURITY_MODEL.md`
- 跨平台宿主适配说明：`TODO/ime-research/notes/20260321_sdk_host_adapter_examples.md`
