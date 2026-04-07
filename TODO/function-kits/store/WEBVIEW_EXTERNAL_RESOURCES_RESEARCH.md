# WebView 能不能加载外部资源？（调研结论 + 对本项目的影响）

> 编码：UTF-8  
> 创建时间：2026-04-01T11:20:00+08:00  
> 目标：把“WebView 外部资源加载”从事实层讲清楚，避免把“宿主安全策略”误认为“WebView 做不到”。  

---

## 1. 结论（先说人话）

1) **Android WebView 本身当然能加载外部资源**（https 页面、图片、脚本、CSS、XHR/fetch 等），这是它的本职能力。  
2) **外网资源能不能加载 = 事实问题**；“要不要让 kit 直接外链图片/样式/脚本 = 宿主策略问题”。  
3) **本项目当前策略（2026-04-01）**：Host **允许 WebView 加载外网子资源**（图片/样式等），但仍然：
   - 不在 WebView 内打开外网页面（外链在系统浏览器打开）
   - 对 HTML 响应注入 CSP：默认 **禁止外链脚本**，允许外链样式与图片（避免“远程脚本 = 远程代码执行面”）
4) 因此：Store Kit 展示远程 icon/screenshot 可以直接 `<img src="https://...">`；`files.download/getUrl` 变成 **可选能力**（用于缓存/离线/限流/审计/哈希校验），而非“必须绕一圈才能显示图片”。

---

## 2. WebView 的“事实能力”：它能加载外部资源

### 2.1 证据点：Android 官方明确写了“Remote URLs”

Android Developers 在 “Embedding web content into your app …” 中，直接把 `WebView` 的能力写成：

- Remote URLs：可以从互联网抓取并展示网页（像浏览器一样）

参考：
https://developer.android.com/develop/ui/views/layout/webapps/embed-web-content-in-app

### 2.2 证据点：官方教程直接 `loadUrl("http(s)://...")`

“Build web apps in WebView” 的官方教程直接用 `loadUrl("http://www.example.com")` / `loadUrl("https://www.example.com")` 作为例子，且明确写了：如果要联网加载页面，你的 app 需要在 manifest 里申请 `android.permission.INTERNET`。

参考：
https://developer.android.com/develop/ui/views/layout/webapps/webview

### 2.3 证据点：`shouldInterceptRequest` 的语义

`WebViewClient.shouldInterceptRequest(...)` 的官方语义是：你可以“拦截请求并返回自定义响应”；如果你返回 `null`，WebView 会自己去加载该请求。  
这意味着 WebView 默认具备“发网络请求加载资源”的能力，而是否放行是你的 `WebViewClient` 策略问题。

> 你可以用它做 allowlist/denylist、强制走本地缓存、或把某些 URL 重写到本地资源。

参考：
https://developer.android.com/reference/android/webkit/WebViewClient#shouldInterceptRequest(android.webkit.WebView,%20android.webkit.WebResourceRequest)

### 2.4 证据点：`WebViewAssetLoader` 也明确写了“fall back to network”

AndroidX `WebViewAssetLoader.PathHandler.handle(...)` 的文档明确写了：如果 handler 返回 `null`，`WebViewAssetLoader` 会尝试下一个 handler；否则就交给 WebView，**会回退到网络（fall back to network）去解析 URL**。

参考：
https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader.PathHandler#handle(java.lang.String)

---

## 3. 哪些情况下“看起来像不能加载外网”

这通常不是 WebView 做不到，而是被以下因素限制：

### 3.1 宿主拦截（本项目就是这个）

我们在 Android 的 `FunctionKitWebViewHost` 里做了严格拦截：

- 仅允许固定域名与路径前缀的本地资源
- 其它资源一律 403

实现入口：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`

### 3.2 Mixed Content（https 页面加载 http 子资源）

如果页面是 https，但图片/脚本等子资源是 http，WebView 的 mixed content 策略可能会阻止它。  
我们当前设置为最严格：`MIXED_CONTENT_NEVER_ALLOW`。

### 3.3 Cleartext HTTP（Android 9+ 默认禁用）

从 Android 9（API 28）开始，明文 HTTP 默认会被系统网络策略阻止，除非你显式允许（Network Security Config / manifest 配置）。  
这会让很多 `http://` 资源“加载不了”，但 `https://` 不受影响。

### 3.4 WebSettings 直接禁用网络加载（`setBlockNetworkLoads(true)`）

`WebSettings.setBlockNetworkLoads(true)` 可以让 WebView 不加载任何网络资源。官方文档也写了：

- 如果 app 没有 `INTERNET` 权限，尝试把它设为 `false` 会抛 `SecurityException`
- 默认值：有 `INTERNET` 权限则为 `false`（不阻止），否则为 `true`（阻止）

参考：
https://developer.android.com/reference/android/webkit/WebSettings#setBlockNetworkLoads(boolean)

---

## 4. 对 Download Center / Store Kit 的直接影响（怎么做才对）

### 4.1 不建议：无约束放开外链脚本

如果允许加载外链脚本，会带来：

- 远程脚本 = 远程代码执行面（供应链/劫持风险）
- 跟踪像素与隐私泄露（商店页最容易被埋点）
- kit 隔离更难（当前所有 kit 同一 origin，DOM storage 还禁用；放开外网会让“跨 kit 资源”更复杂）

因此推荐做法是：允许外链 **图片/样式**，但通过 CSP 禁掉外链脚本，并保留 Host 代理下载作为“更稳的可选项”。

### 4.2 可选：资源代理（缓存/离线/审计/校验）

做法：

1) Store Kit 需要图片/截图时：请求 Host `files.download(url)`  
2) Host 下载并落盘（cache/FileStore），返回 `fileId`  
3) Store Kit 再调用 `files.getUrl(fileId)` 得到一个可在 WebView 内加载的本地 URL  

好处：

- 仍然是“本地 origin + 宿主可控”
- Host 可做大小限制、缓存、hash 校验、域名 allowlist、审计日志

相关 SDK/API 文档：`TODO/function-kit-runtime-sdk/docs/STORE_KIT_APIS.md`

---

## 5. 建议你怎么决策（一句话）

把“WebView 能不能加载外网”当作事实：**能**。  
把“我们要不要让 Function Kit 默认加载外网”当作安全策略：**允许图片/样式、禁止外链脚本**，必要时再用 `files.download/getUrl` 做缓存与审计。

---

## 6. 参考资料（官方优先）

- Android Developers：`WebViewClient.shouldInterceptRequest`（拦截/返回自定义响应；返回 `null` 则由 WebView 正常加载）  
  https://developer.android.com/reference/android/webkit/WebViewClient#shouldInterceptRequest(android.webkit.WebView,%20android.webkit.WebResourceRequest)
- Android Developers：`WebResourceResponse`（用于 `shouldInterceptRequest` 的返回类型）  
  https://developer.android.com/reference/android/webkit/WebResourceResponse
- Android Developers：`WebSettings.setMixedContentMode`（mixed content 策略）  
  https://developer.android.com/reference/android/webkit/WebSettings#setMixedContentMode(int)
- Android Developers：Network Security Config（cleartext traffic 配置入口）  
  https://developer.android.com/privacy-and-security/security-config
- Android Developers：Load in-app content（推荐用 `WebViewAssetLoader` 以 https 映射本地 assets）  
  https://developer.android.com/develop/ui/views/layout/webapps/load-local-content
- AndroidX：`WebViewAssetLoader` reference  
  https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader
