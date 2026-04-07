# Windows WebView2 Host Example

> 编码：UTF-8
> 创建时间：2026-03-21T21:20:00+08:00
> 更新时间：2026-03-21T22:55:00+08:00
> 目标：给 Windows 宿主一个最小可执行的 `WebView2 + FunctionKitRuntimeSDK` 接法。

## 1. 依赖

- NuGet：`Microsoft.Web.WebView2`
- Runtime：Edge WebView2 Runtime

## 2. 宿主职责

Windows 宿主只需要做这几件事：

1. 创建 `WebView2`
2. 把功能件静态资源映射成虚拟主机目录
3. 监听 UI 发回的 envelope
4. 把宿主 envelope 发回浏览器页面
5. 收到 `candidate.insert` / `candidate.replace` 后调用自己的文本提交逻辑

## 3. 建议加载方式

推荐用：

- `SetVirtualHostNameToFolderMapping`
- `Navigate("https://function-kit.local/...")`

这样 Windows / Android 都是“本地资源 + 浏览器容器”，不会变成一端走文件协议、一端走别的奇怪路径。

## 4. 建议对接点

- 当前 Windows 测试宿主基线：`TODO/ime-research/windows-testhost/WindowsImeTestHost/MainForm.cs`
- 如果要先做 PoC，建议先挂在一个单独的侧面板或下方面板，不要先碰现有 IME 输入链路

## 5. 示例代码

- `TODO/function-kit-runtime-sdk/examples/windows-webview2/FunctionKitWebView2Host.cs`

当前示例已经直接包含：

- `DispatchReadyAckAsync(...)`
- `DispatchPermissionsSyncAsync(...)`
- `DispatchContextSyncAsync(...)`
- `DispatchCandidatesRenderAsync(...)`
- `DispatchStorageSyncAsync(...)`
- `DispatchPanelStateAckAsync(...)`
- `DispatchHostStateUpdateAsync(...)`
- `DispatchPermissionDeniedAsync(...)`
- `DispatchBridgeErrorAsync(...)`
