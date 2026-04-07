# Browser-Extension-Style Runtime API (vNext)

> 编码：UTF-8  
> 创建时间：2026-03-25T00:40:00+08:00  
> 目标：把 Function Kit 的 runtime 注入 API 设计得更像浏览器插件（WebExtension）的开发体验：默认简单、事件驱动、强约束但不失灵活；把“协议耦合/样板代码”从 kit 业务代码里拿掉。

## 1. 现状问题（为什么“杂乱且强耦合”）

以当前两个样板 kit 为例：

- `TODO/function-kits/chat-auto-reply/ui/app/main.js`：约 **760 LOC**
- `TODO/function-kits/quick-phrases/ui/app/main.js`：约 **357 LOC**

其中相当一部分不是“业务 UI”，而是每个 kit 都在重复做的 runtime/bridge 样板：

- 手写 `connectWithRetry`（握手超时、重试策略）。
- 每次 outbound 都要手写 `{ replyTo: runtimeClient.getLastHostMessageId() }`。
- `switch(envelope.type)` 处理一堆协议消息（`bridge.ready.ack / permissions.sync / context.sync / storage.sync / host.state.update / bridge.error ...`）。
- 预览用 mock host 逻辑每个 kit 都复制一份（不稳定且容易漂移）。

这些导致：

- kit 业务代码直接耦合到 Host Bridge 协议细节（消息类型、payload 结构）。
- kit 作者不得不理解“协议/会话/权限/错误码/回包时序”，而不是只关心 “context / storage / candidates / ai” 这些高层概念。
- 维护成本指数上升：协议字段变动、增加新消息类型，会逼着每个 kit 都改 `switch`。

## 2. 浏览器插件 API 借鉴点（WebExtension）

WebExtension（`chrome.*`/`browser.*`）对开发者友好的关键点：

1. **命名空间 + 小而稳的对象模型**
   - `chrome.storage.local.get/set`
   - `chrome.runtime.sendMessage`
   - `chrome.tabs.query`
2. **“返回值是业务结果”，而不是“返回原始消息 envelope”**
   - 开发者拿到的是对象/数组，不需要自己解包 `payload`。
3. **事件模型统一**
   - `onMessage.addListener`
   - `storage.onChanged.addListener`
4. **权限声明在 manifest，运行时仅做检查**
   - 页面不需要把 permission list 再发给浏览器。
5. **保持逃生舱（escape hatch）**
   - 既有高层 API，也允许用低层 `sendMessage` 自定义协议/扩展。

## 3. vNext 设计目标

- **默认简单**：做常规事情（握手、同步上下文、读写存储、写回输入框、触发候选、AI 生成）不需要写协议级 switch。
- **强一致**：Android/Windows 的 kit UI 代码完全一样；平台差异只在宿主端。
- **可观测**：状态与错误能统一呈现（类似 `chrome.runtime.lastError` 的体验），但仍以 Promise reject 为主。
- **保留灵活性**：任何时候都能退回到“原始 envelope + 自定义 message type”。

非目标：

- 不在 runtime SDK 里做 UI 框架（React/Vue 等）。
- 不把宿主“高权限技能”直接暴露为 `host.invoke(...)` 这种粗暴 API（仍遵循权限模型与安全边界）。

## 4. 分层方案（核心：把“协议耦合”从 kit 里抽走）

### 4.1 低层逃生舱：`kit.raw`（Raw Client）

低层 Raw Client 继续存在，用于协议级收发 envelope：

- 负责 envelope 校验、request/reply 关联、超时/AbortSignal、权限集合维护。
- 提供 `raw.on(type, handler)` / `raw.send(type, payload)` / `raw.runtime.connect(...)` 等。

为了避免入口混用，browser bundle 的全局 `FunctionKitRuntimeSDK` **不再暴露 `createClient`**；需要低层能力时使用 `createKit(...).raw`。

### 4.2 新增高层：`createKit(...)`（Browser-style Kit Runtime）

新增一个更像浏览器插件的入口（名字可定为 `createKit` 或 `createApp`），内部包一层 store + typed wrappers。

核心变化：

1. **握手/重试内置**
2. **默认 replyTo 内置**
3. **把协议消息归一成事件与状态**
4. **API 返回业务结果，不返回 envelope**

#### 4.2.1 建议的对象模型

```ts
const kit = FunctionKitRuntimeSDK.createKit({
  kitId: "chat-auto-reply",
  surface: "panel",
  debug: true,
  connect: { timeoutMs: 20000, retries: 3 },
  // permissions 可选：默认由 host 从 manifest 推导；preview 模式可由 SDK polyfill 提供
  permissions: undefined
});

await kit.connect();           // => SessionInfo
kit.state;                     // => read-only snapshot
kit.subscribe((state) => {});  // => unsubscribe

// 注意：当前事件回调入参是对象（建议用解构拿你关心的字段）
kit.on("context", ({ context }) => {});
kit.on("candidates", ({ candidates, result }) => {});
kit.on("permissions", ({ permissions }) => {});
kit.on("host", ({ hostInfo }) => {});
kit.on("host.update", ({ label, details }) => {});
kit.runtime.onIntent(({ intent }) => {});
kit.runtime.onIntent("open_options", ({ intent }) => {});
kit.runtime.onMessage(({ message }) => {});
kit.runtime.onMessage("demo", ({ message }) => {});
kit.bindings.onInvoke(({ invocation }) => {});
kit.on("task", ({ task }) => {});
kit.on("tasks.sync", ({ running, history }) => {});
kit.on("ai.delta", ({ deltaText }) => {});
kit.on("error", ({ error }) => {});

await kit.storage.get(keys);   // => values
await kit.storage.set(values); // => values (echo)
kit.storage.watch(keys, ({ values }) => {});
const ctx = await kit.context.refresh(); // => context snapshot

await kit.input.insert(text, { candidateId });
await kit.input.replace(text, { candidateId });
await kit.input.commitImage({ dataUrl, fileName, mimeType });

// Store Kit / 下载中心（特权能力，通常仅授予内置 Store Kit）
await kit.kits.sync();
await kit.kits.install({ task: { title: "安装：chat-auto-reply" }, source: { kind: "url", url: "..." } });
await kit.kits.updateSettings({ kitId: "chat-auto-reply", patch: { enabled: false } });

await kit.catalog.getSources();
await kit.catalog.refresh({ url: "https://store.example.com/catalog.json" });

// 资源下载代理（用于缓存/离线/审计/哈希校验等场景）
const downloaded = await kit.files.download({ url: "https://store.example.com/icon.png" });
const resolved = await kit.files.getUrl(downloaded.fileId);

const ai = await kit.ai.request({...}); // => { requestId, status, output: { type, text, json? }, usage? }
await kit.runtime.sendMessage({ toKitId: "quick-phrases", channel: "demo", data: { ok: true } });

// Task Center：建议为耗时请求提供用户可读任务名
await kit.ai.request({ task: { title: "生成候选回复" }, ... });
await kit.fetch(url, { task: { title: "上传文件" }, method: "POST" });

// escape hatch
kit.raw.send("some.future.message", {...});
kit.raw.on("host.state.update", (env) => {});
```

#### 4.2.2 事件与状态归一（把 switch 干掉）

SDK 维护一个最小 store（不是 UI 框架，只是状态聚合）：

- `state.kitId` / `state.surface`
- `state.sessionId` / `state.connected`
- `state.permissions` / `state.permissionsKnown`
- `state.hostInfo`
- `state.context`
- `state.candidates`
- `state.storage`
- `state.ai`
- `state.tasks`
- `state.lastInvocation`：最近一次 `binding.invoke` 的归一化 payload
- `state.lastIntent`：最近一次 `host.state.update.details.intent` 的归一化 payload
- `state.lastMessage`：最近一次 `runtime.message` 的归一化 payload
- `state.lastError`：最后一个 `bridge.error / permission.denied` 归一后的错误对象

然后把协议消息映射为高层事件：

- `bridge.ready.ack` -> `ready` + state 填充
- `permissions.sync` -> `permissions` + state 更新
- `context.sync` -> `context` + state 更新
- `candidates.render` -> `candidates` + state 更新
- `binding.invoke` -> `binding.invoke` + state 更新
- `ai.response` -> `ai.response` / `ai` + state 更新
- `ai.response.delta` -> `ai.delta` + state 更新
- `runtime.message` -> `runtime.message` + state 更新
- `task.update` -> `task` + state 更新
- `tasks.sync` -> `tasks.sync` + state 更新
- `host.state.update` -> `host.update` + state 更新
- `bridge.error / permission.denied` -> `error` + state 更新

kit 作者只关心 `kit.on("candidates", ...)` 之类，不需要关心 envelope 类型。

#### 4.2.3 “默认 replyTo”策略（消灭大量重复参数）

当前写法里大量出现：

```js
{ replyTo: runtimeClient.getLastHostMessageId() }
```

vNext：在 `kit.raw.send/request` 的 wrapper 里默认注入：

- 如果调用方未显式传 `replyTo`，则自动用 `lastHostMessageId`。

这个策略对业务开发者是透明的，同时仍保留 override（少数调试/特殊路由场景）。

#### 4.2.4 “manifest 驱动权限”（页面不再发 permissions list）

浏览器插件里 permission 属于 manifest，不属于页面脚本。

已实现：UI 握手不再发送 `requestedPermissions`（由宿主按 manifest + 用户授权矩阵决定最终授予）。

- Android/Windows 宿主已经加载 kit manifest，本来就知道“这个 kit 需要什么能力”
- UI 侧不再重复声明 permissions 列表（减少一处耦合与重复）
- preview/mock host 场景由 SDK polyfill 统一提供 “grant all” 或 “按 manifest grant”

## 5. 优化前 vs 优化后：写法对比（示例）

### 5.1 握手（connect + retry）

Raw（`kit.raw`）：

```js
const kit = FunctionKitRuntimeSDK.createKit({ kitId, surface, debug: true });
const runtimeClient = kit.raw;
runtimeClient.on("*", handleBridgeMessage);

function connectWithRetry(attempt = 1) {
  return runtimeClient.runtime
    .connect({ timeoutMs: 20000 })
    .catch((error) => {
      if (attempt >= 3) throw error;
      return new Promise((r) => setTimeout(r, 400 * attempt)).then(() => connectWithRetry(attempt + 1));
    });
}

connectWithRetry();
```

优化后（vNext）：

```js
const kit = FunctionKitRuntimeSDK.createKit({
  kitId,
  surface: "panel",
  debug: true,
  connect: { timeoutMs: 20000, retries: 3 }
});

await kit.connect();
```

### 5.2 storage.get/set（不再解 envelope）

优化前：

```js
const env = await kit.raw.storage.get(keys, { replyTo: kit.raw.getLastHostMessageId() });
applySettings(env.payload?.values ?? {});
```

优化后：

```js
const values = await kit.storage.get(keys);
applySettings(values);
```

### 5.3 写回输入框（insert/replace）

优化前：

```js
kit.raw.input.replaceText(
  { candidateId, text, commitMode: "replace" },
  { replyTo: kit.raw.getLastHostMessageId() }
);
```

优化后：

```js
await kit.input.replace(text, { candidateId });
```

### 5.4 监听更新（不再 switch envelope.type）

优化前：

```js
function handleBridgeMessage(envelope) {
  switch (envelope.type) {
    case "context.sync": ...
    case "candidates.render": ...
    case "storage.sync": ...
    case "bridge.error": ...
  }
}
kit.raw.on("*", handleBridgeMessage);
```

优化后：

```js
kit.on("context", renderContext);
kit.on("candidates", ({ candidates }) => renderCandidates(candidates));
kit.on("permissions", renderPermissions);
kit.on("error", showError);
```

### 5.5 AI chat（返回业务结果，不返回 envelope）

优化前：

```js
const env = await kit.raw.ai.request({ ... });
const text = env.payload?.text ?? "";
```

优化后：

```js
const { output, usage } = await kit.ai.request({ ... });
```

## 6. 代码量缩减（以样板为参考）

当前样板已完成一次迁移（UI glue code 从 kit 迁到 SDK），缩减幅度大致如下：

- 对比基准：迁移前的样板版本（约 2026-03-25 之前的 `main.js`）。
- `chat-auto-reply`：**1393 -> 760 LOC**（减少 **633 LOC**，约 **45%**）
- `quick-phrases`：**565 -> 357 LOC**（减少 **208 LOC**，约 **37%**）

说明：

- 减少的是“每个 kit 都重复的 glue code”，这部分转移到 SDK 后只写一次。
- SDK 本身会增长一些代码量，但总体上 kit 数量越多，收益越大。

## 7. 兼容与迁移策略

1. **Raw API 永远可用**（通过 `kit.raw`）
2. 新增 `createKit`，作为推荐写法（文档与样板逐步迁移）
3. 先做 “薄封装 + 状态聚合”，不引入框架依赖
4. 逐步把样板 kit 的 glue code 迁走，保留相同行为与调试信息

## 8. 关键点总结（保证“简单”且“灵活”）

- 默认用 `createKit`：开发者只接触高层对象模型与事件，不再写协议 switch。
- 始终保留 `kit.raw`：需要时可以直接收发 envelope，自定义扩展协议不被挡住。
- permissions 由 host/manifest 驱动：UI 不再手写 permissions list，减少耦合点。
- replyTo 自动化：把“协议要求”变成 SDK 内部细节，业务代码只关心功能。
