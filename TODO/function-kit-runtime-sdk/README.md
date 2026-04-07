# Function Kit Runtime SDK

> 编码：UTF-8
> 创建时间：2026-03-21T21:05:00+08:00
> 更新时间：2026-03-25T00:00:00+08:00
> 目标：把浏览器式功能件运行时抽成可独立拆分的 SDK 项目，供 Windows / Android 的浏览器容器统一接入。

## 1. 定位

这个目录按“独立仓库种子项目”来设计。

后续可以直接拆出去，成为单独仓库，例如：

- 仓库名：`function-kit-runtime-sdk`
- 包名：`@ime/function-kit-runtime-sdk`

它负责的不是业务功能件，而是：

- 浏览器式功能件前端的统一 SDK
- Host Bridge 协议落地
- WebView2 / Android WebView 的浏览器侧统一接法

## 2. 为什么要单独拆

这样可以强制做到：

- Windows 不写一套前端桥接
- Android 不再写另一套前端桥接
- 所有功能件浏览器 UI 都只依赖一份 SDK

也就是说：

- 平台差异放在宿主端
- SDK 负责把浏览器端接口统一掉

## 3. 当前内容

- 包描述：`TODO/function-kit-runtime-sdk/package.json`
- SDK 源码：`TODO/function-kit-runtime-sdk/src/index.js`
- 类型声明：`TODO/function-kit-runtime-sdk/src/index.d.ts`
- 浏览器直出 bundle：`TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js`
- SDK 文档索引：`TODO/function-kit-runtime-sdk/docs/INDEX.md`
- Windows 宿主示例：`TODO/function-kit-runtime-sdk/examples/windows-webview2/README.md`
- Android 宿主示例：`TODO/function-kit-runtime-sdk/examples/android-webview/README.md`

## 4. 接入方式

### 浏览器式功能件页面

直接引入：

```html
<script src="../../../function-kit-runtime-sdk/dist/function-kit-runtime.js"></script>
```

然后初始化：

```js
const kit = globalThis.FunctionKitRuntimeSDK.createKit({
  kitId: "chat-auto-reply",
  surface: "panel"
});

kit.connect().catch(() => {});
```

### Windows / Android 宿主

宿主只做两件事：

1. 把消息送进页面
2. 接收页面发回来的统一 envelope

宿主不需要知道具体功能件页面内部状态机。

## 5. 宿主适配示例

### Windows

- `WebView2` 示例说明：`TODO/function-kit-runtime-sdk/examples/windows-webview2/README.md`
- 示例代码：`TODO/function-kit-runtime-sdk/examples/windows-webview2/FunctionKitWebView2Host.cs`

### Android

- `WebView` 示例说明：`TODO/function-kit-runtime-sdk/examples/android-webview/README.md`
- 示例代码：`TODO/function-kit-runtime-sdk/examples/android-webview/FunctionKitWebViewHost.kt`

Android 示例现在明确按“受控浏览器容器”实现，不再只停留在最小桥接：

- `WebViewAssetLoader + function-kit.local`
- `addWebMessageListener(...)` 接收 UI 消息
- `postWebMessage(...)` 发送宿主消息
- 默认阻断远程导航（外链交给系统浏览器）/ 允许外网子资源（图片/样式）/ 下载默认阻断 / Web 权限请求默认 deny
- 收到 UI envelope 后先做协议字段校验

这两个示例故意保持同一个原则：

- 页面都只认 `FunctionKitRuntimeSDK`
- 宿主都只转发 envelope
- 平台差异只留在容器与最终文本提交

现在 Windows 示例已经不只是 `ready.ack`，还补到了：

- `permissions.sync`
- `context.sync`
- `candidates.render`
- `storage.sync`
- `panel.state.ack`
- `host.state.update`
- `bridge.error`

Android 示例现在也已经补齐同一批 envelope 下发能力，并且和 Windows 一样走固定本地 origin。

## 6. 现在已经具备的运行时能力

- 握手与会话：
  - `runtime.connect()`
  - `replyTo`
- 权限同步：
  - `permissions.sync`
  - `permission.denied`
- 请求 / 响应：
  - request timeout
  - Promise 化调用
- 浏览器式 API：
  - `context`
  - `input`
  - `candidates`
  - `fetch`
  - `files`（`pick/download/getUrl`）
  - `ai`
  - `settings`
  - `storage`
  - `panel`
  - `tasks`（Task Center）
  - `kits`（Store Kit：安装/卸载/启用/权限）
  - `catalog`（Store Kit：目录源管理与刷新）
  - `app`（由结构化 context 快照派生的便捷访问器）
- 共享 discovery / trigger 骨架：
  - `parseSlashTrigger(...)`
  - `normalizeDiscoveryManifest(...)`
  - `buildDiscoveryIndex(...)`
  - `matchDiscoveryEntries(...)`
  - `resolveDiscoveryQuery(...)`

### 6.1 Discovery / Trigger Skeleton

第一版只做确定性 discovery 层，不直接接平台输入事件，也不做 AI 语义检索。

```js
import {
  buildDiscoveryIndex,
  matchDiscoveryEntries,
  parseSlashTrigger
} from "@ime/function-kit-runtime-sdk/discovery";

const slashToken = parseSlashTrigger("Need a quick draft /reply");
const index = buildDiscoveryIndex([manifestA, manifestB]);
const matches = matchDiscoveryEntries(index, slashToken, {
  contextType: "chat",
  pinnedKitIds: ["chat-auto-reply"],
  recentKitIds: ["chat-auto-reply"],
  availablePermissions: ["context.read", "input.insert"]
});
```

当前 shared model 覆盖：
- manifest `discovery` 元数据归一化
- slash token 解析
- command / alias / tag / regex / name / description 的确定性匹配
- pinned / recent / context / permission availability 的基础排序骨架

### 6.2 AI Backend Protocol Skeleton

这一层明确是宿主侧 AI Router / Adapter 的共享契约，不是浏览器 UI 直连外部模型。

当前浏览器 SDK 对 Function Kit 作者暴露的最小 API 是：

- `client.ai.request(options)`
- `client.ai.listAgents(filter?)`
- `client.ai.runAgent(options)`

协议层对应的 bridge message family 是：

- `ai.request` / `ai.response`
- `ai.agent.list` / `ai.agent.list.result`
- `ai.agent.run` / `ai.agent.run.result`

这里刻意保持 `ai.request / agent` 二分，不对外暴露 `host.invoke()` 这类宿主能力面。

### 6.2.1 Network Surface

当前最小网络能力是：

- `client.fetch(url, init?)`

协议层对应：

- `network.fetch` / `network.fetch.result`

这是 Android-first / host-proxy 的最小面，不再引入 connector-first 设计。

### 6.2.2 Composer Bridge (Internal)

为了让功能件面板里的 `<textarea>/<input/contenteditable>` 在 IME 自己的窗口内也能稳定输入，SDK 内置了 *composer bridge*：

- 用户聚焦/编辑 WebView 内输入控件时，SDK 会自动用 `composer.*` 消息把输入状态同步到宿主。
- 宿主再用 `composer.state.sync` 把草稿状态回流到 WebView，使页面输入框能反映真实的键盘输入。

这是一种内部实现细节：功能件只需要写普通的输入控件即可，不需要额外的“宿主草稿框”或显式的 composer API。

- 共享 schema：
  - `TODO/function-kit-runtime-sdk/schemas/ai-backend-common.schema.json`
  - `TODO/function-kit-runtime-sdk/schemas/ai-backend-request.schema.json`
  - `TODO/function-kit-runtime-sdk/schemas/ai-backend-response.schema.json`
- 协议说明：
  - `TODO/function-kit-runtime-sdk/docs/AI_BACKEND_PROTOCOL.md`
- manifest 集成：
  - `ai.executionMode`
  - `ai.backendHints`

推荐路由原则：

- 高频文本增强：`direct-model`
- 有限工具调用：`bounded-tool-calling-agent`
- workspace / skills 重场景：`external-agent-adapter`

### 6.3 Host-side Manifest Routing Integration

当前已经不是“只在 SDK 文档里定义 schema”，而是两端宿主都开始吃这份 manifest 元数据：

- Windows 宿主：
  - `TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost/FunctionKitManifestMetadata.cs`
  - `TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost/MainForm.cs`
- Android 宿主：
  - `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitManifest.kt`
  - `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`

当前共享的宿主侧输入已经覆盖：

- manifest `runtimePermissions`
- manifest `discovery.launchMode`
- manifest `discovery.slash.commands / aliases / tags / matchers`
- manifest `ai.executionMode`
- manifest `ai.backendHints`
- 远程请求里的 `manifest` / `routing` / `slash` 快照

这意味着后续再接新的浏览器式功能件时，不需要每个平台各写一套 AI 路由字段解释器，宿主可以直接复用同一套 manifest 语义。

## 7. 协议来源

SDK 依赖的 Host Bridge 协议文档仍放在：

- `TODO/function-kits/host-bridge/README.md`
- `TODO/function-kits/host-bridge/message-envelope.schema.json`
- `TODO/function-kits/host-bridge/error.schema.json`

## 8. 测试

```bash
cd TODO/function-kit-runtime-sdk
npm run build:browser
npm test
```
