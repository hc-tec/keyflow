# Runtime SDK 宿主适配示例（Windows + Android）

> 编码：UTF-8
> 创建时间：2026-03-21T21:20:00+08:00
> 更新时间：2026-03-21T23:55:00+08:00
> 目标：把 `FunctionKitRuntimeSDK` 在 Windows / Android 两端的接法固定成一致模型。

## 1. 一致模型

两端都按同一个模型接：

1. 宿主创建浏览器容器
2. 宿主加载本地功能件页面
3. 页面通过 `FunctionKitRuntimeSDK` 发 envelope
4. 宿主接收 envelope
5. 宿主根据消息类型执行：
   - 拉上下文
   - 渲染候选
   - 插入文本
   - 替换文本
6. 宿主把新的 envelope 发回页面

## 2. Windows 示例

- 说明：`TODO/function-kit-runtime-sdk/examples/windows-webview2/README.md`
- 代码：`TODO/function-kit-runtime-sdk/examples/windows-webview2/FunctionKitWebView2Host.cs`

关键点：

- `WebView2`
- `SetVirtualHostNameToFolderMapping`
- `WebMessageReceived`
- `PostWebMessageAsJson`

## 3. Android 示例

- 说明：`TODO/function-kit-runtime-sdk/examples/android-webview/README.md`
- 代码：`TODO/function-kit-runtime-sdk/examples/android-webview/FunctionKitWebViewHost.kt`

关键点：

- `WebView`
- `WebViewAssetLoader`
- `WebViewCompat.addWebMessageListener`
- `WebViewCompat.postWebMessage`
- 固定 origin：`https://function-kit.local`
- 拦截非本地导航 / 子资源 / 下载 / Web 权限

## 4. 必须保持一致的地方

- envelope 结构
- 消息类型
- SDK 浏览器入口
- 页面状态机
- fixture / replay tests
- 本地 origin 约束
- UI envelope 校验边界

## 5. 只允许不同的地方

- 容器创建 API
- 宿主原生桥实现
- 最终文本提交 API

这就是以后避免写两份浏览器功能件代码的关键边界。
