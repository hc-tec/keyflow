# Runtime SDK：缺失能力清单（Unknown‑Unknowns 菜单）

> 编码：UTF-8  
> 日期：2026-03-30  
> 状态：DRAFT  
> 目标：把“我不知道我不知道什么”的能力缺口，整理成 **可勾选** 的菜单，你来决定哪些要加进 Runtime SDK / Host Bridge / Host。

---

## 0. 怎么用这份文档

1) 先看 **第 2 节覆盖矩阵**：哪些 Host Bridge message 已经有 `createKit` 的高层 API / state / event。  
2) 再看 **第 3 节能力菜单**：每条都标注了“只改 SDK / 需要改协议 / 需要改宿主”。  
3) 你最后只要回复我：要做哪些条目（用编号即可），我再落地到代码、测试、文档，并写进 `TODO/TODO.md`。

---

## 1. 当前 Runtime SDK 的“稳定入口面”（你现在已经有的）

### 1.1 唯一推荐入口

- browser bundle 全局：`FunctionKitRuntimeSDK.createKit(...)`  
- 低层 escape hatch：`FunctionKitRuntimeSDK.createKit(...).raw`（协议级 envelope 收发）

> 为了杜绝入口混用，browser bundle 的全局 SDK 不再暴露 `createClient`（只保留 ESM export 给内部/测试用）。

### 1.2 `createKit` 已经覆盖的高层能力

（详见：`TODO/function-kit-runtime-sdk/src/index.js`、`TODO/function-kit-runtime-sdk/src/index.d.ts`）

- `kit.connect()` + 自动 retry
- `kit.state`：`connected/permissions/hostInfo/context/candidates/storage/ai/tasks/lastError/...`
- `kit.fetch(...)`（host-proxy）
- `kit.context.refresh(...)`
- `kit.storage.get/set(...)`
- `kit.files.pick(...)`
- `kit.input.insert/replace/commitImage/observeBestEffort(...)`
- `kit.send.registerImeActionInterceptor(...)` + `kit.send.onImeActionIntent(...)`
- `kit.panel.updateState(...)`
- `kit.tasks.sync/cancel(...)` + 本地 tasks store
- `kit.ai.request/listAgents/runAgent(...)`

---

## 2. Host Bridge 覆盖矩阵（message type → SDK 映射）

协议枚举来源：`TODO/function-kits/host-bridge/message-envelope.schema.json`

> 说明：这里的“缺失”不是说 raw 做不到，而是指 **`createKit` 没给浏览器式高层封装 / state / event**，导致 AI/人写 kit 时要回退到 `raw.on("*")`/手工拆 envelope。

| Host Bridge type | 方向（常见） | 现在的 `createKit` 映射 | 备注/缺口 |
|---|---|---|---|
| `bridge.ready` | UI→Host | `kit.connect()` / `kit.raw.runtime.connect()` | OK |
| `bridge.ready.ack` | Host→UI | `kit.on("ready")` + `kit.state.connected` | OK |
| `permissions.sync` | Host→UI | `kit.on("permissions")` + `kit.state.permissions` | OK |
| `context.request` | UI→Host | `kit.context.refresh()` | OK |
| `context.sync` | Host→UI | `kit.on("context")` + `kit.state.context` | OK |
| `candidates.render` | Host→UI | `kit.on("candidates")` + `kit.state.candidates` | OK |
| `candidate.insert` | UI→Host | `kit.input.insert(...)` | OK |
| `candidate.replace` | UI→Host | `kit.input.replace(...)` | OK |
| `input.commitImage` | UI→Host | `kit.input.commitImage(...)` | OK |
| `input.observe.best_effort.start/stop` | UI→Host | `kit.input.observeBestEffort(...)` | OK（但 ack 没有高层事件） |
| `input.observe.best_effort.ack` | Host→UI | （无专门事件） | **缺：高层 event/state**（可选） |
| `candidates.regenerate` | UI→Host | `kit.candidates.regenerate(...)` | OK |
| `settings.open` | UI→Host | `kit.settings.open(...)` | OK（当前打开的是宿主设置页，不是 kit 自己的 options UI） |
| `storage.get/set` | UI→Host | `kit.storage.get/set(...)` | OK |
| `storage.sync` | Host→UI | `kit.on("storage")` + `kit.state.storage` | OK |
| `panel.state.update` | UI→Host | `kit.panel.updateState(...)` | OK（但本地不维护 panel state） |
| `panel.state.ack` | Host→UI | Promise resolve（不进 state） | **缺：可选 state** |
| `network.fetch` | UI→Host | `kit.fetch(...)` / `kit.raw.fetch(...)` | OK |
| `network.fetch.result` | Host→UI | Promise resolve（不进 state） | OK |
| `files.pick` | UI→Host | `kit.files.pick(...)` | OK |
| `files.pick.result` | Host→UI | Promise resolve（不进 state） | OK |
| `ai.request` | UI→Host | `kit.ai.request(...)` | OK（非 streaming） |
| `ai.response` | Host→UI | `kit.on("ai")` + `kit.state.ai` | OK |
| `ai.agent.list/run` | UI→Host | `kit.ai.listAgents/runAgent(...)` | OK |
| `ai.agent.list.result/run.result` | Host→UI | Promise resolve（不进 state） | OK |
| `tasks.sync.request` | UI→Host | `kit.tasks.sync(...)` | OK |
| `tasks.sync` | Host→UI | `kit.on("tasks.sync")` + `kit.state.tasks` | OK |
| `task.update` | Host→UI | `kit.on("task")` + merge 到 `kit.state.tasks` | OK |
| `task.cancel` | UI→Host | `kit.tasks.cancel(...)` | OK |
| `task.cancel.ack` | Host→UI | `kit.on("task.cancel.ack")` | OK |
| `send.intercept.ime_action.*` | 双向 | `kit.send.*` | OK（ack 未单独暴露） |
| `host.state.update` | Host→UI | `kit.on("host.update")` | OK（但 intent 语义目前靠约定） |
| `binding.invoke` | Host→UI | （无高层 API/state） | **缺：bindings 高层 API**（强烈建议补） |
| `composer.*` / `composer.state.sync` | 双向 | 自动 composer bridge（内部逻辑） | **缺：可选对外状态/事件** |
| `permission.denied` / `bridge.error` | Host→UI | `kit.on("error")` + `kit.state.lastError` | OK |

---

## 3. 你可以考虑补齐的能力菜单（按优先级分组）

下面每条都给：**为什么缺** → **建议 API** → **需要改哪些层**。

### P0（强烈建议尽快补：缺了会让“插件生态”变脆）

#### 3.1 `bindings` 高层 API（解决 `binding.invoke` 只能 raw 处理）

- **问题**：宿主已经会发 `binding.invoke`（见 Android：`FunctionKitWindow.flushPendingBindingInvocations()`），但 `createKit` 没有高层封装；AI/人只能 `kit.raw.on("binding.invoke", ...)` 或 `kit.on("envelope")` 手拆 payload。  
- **建议 API**（只示意）：
  - `kit.bindings.onInvoke((event) => { ... })`
  - `event.binding` / `event.trigger` / `event.context` / `event.clipboardText` 等做字段归一化
  - 可选：`kit.state.lastInvocation`
- **改动层**：**SDK-only**（不需要改协议/宿主，只是把既有 message 做成高层事件/状态）。

#### 3.2 Runtime permissions 契约对齐（schema/doc/host policy 三方一致）

- **问题**：当前 manifest schema 的 `runtimePermissions` 枚举与实际宿主/SDK能力不完全一致（例如 `ai.agent.list` 已在 Android 权限策略里出现，但 schema 未列出）。  
- **你需要做决策**：
  1) 是否把 `ai.agent.list` 纳入 `runtimePermissions`（建议：是）  
  2) 是否为 `files.pick` 单独设 runtime permission（建议：是；否则只能复用 `storage.read`，权限语义会越来越糊）
- **改动层**：**协议契约层（schema/doc）+ 宿主权限策略**（Android/Windows/Host service 需要对齐）。

#### 3.3 Host intent 机制“显式化”（从“约定 details.intent”变成稳定 API）

- **问题**：目前用 `host.state.update` 携带 `details.intent` 来做 UI intent（例如 `open_options`），语义靠约定，AI 生成代码容易分叉。  
- **建议 API**：
  - `kit.runtime.onIntent((intent) => ...)`（内部监听 `host.state.update` 并规范化）
  - 或新增协议 type：`intent.dispatch`（更干净，但要改协议/宿主）
- **改动层**：建议先 **SDK-only**（把既有约定封装起来），后续再考虑协议化。

---

### P1（强烈建议：能显著提升“用户体验/开发体验”）

#### 3.4 AI streaming（增量 token / partial results）

- **问题**：`ai.request → ai.response` 目前是“一次性结果”，对聊天/长文本体验差，也难做取消与进度。  
- **建议方向**：
  - 协议：`ai.response.delta` / `ai.response.done`（或统一 `task.update` 里带 delta）
  - SDK：`kit.ai.streamRequest(...)` 返回 `AsyncIterator`，或 `kit.on("ai.delta")`
- **改动层**：**需要改协议 + 宿主实现 + SDK**。

#### 3.5 Background / Triggers（“不打开面板也能跑”的能力）

- **问题**：浏览器扩展的价值很大来自 background/service worker + 各种触发器（定时、事件、上下文）。如果 kit 必须打开 UI 才能跑，很多场景会尴尬。  
- **建议方向**：
  - manifest：声明 `background.entry`、`alarms`、`triggers` 细化
  - 协议：事件派发（例如 `event.dispatch`）
  - SDK：`kit.events.on("clipboard.changed", ...)` / `kit.alarms.create(...)`
- **改动层**：**需要较大改动（协议 + 宿主调度 + SDK + 安全模型）**。

#### 3.6 Inter‑kit messaging（插件之间通信）

- **问题**：很多能力会被抽成“公共 kit/agent”，需要让 kit 之间发消息（类似 `runtime.sendMessage`）。  
- **建议方向**：
  - 协议：`runtime.message`（带 `fromKitId/toKitId`）
  - SDK：`kit.runtime.sendMessage(...)` / `kit.runtime.onMessage(...)`
- **改动层**：**协议 + 宿主路由 + SDK**。

#### 3.7 Storage watch（配置变更实时生效）

- **问题**：现在 `storage.sync` 是宿主推送，但 SDK 没有高层“watch key”的机制；以及缺“写后广播给同 kit 其它 surface”。  
- **建议方向**：
  - SDK：`kit.storage.watch(keys, handler)`（内部基于 `storage.sync`）
  - 协议/宿主：明确什么时候发 `storage.sync`（跨 surface / 跨窗口）
- **改动层**：先 **SDK-only**（watch 封装），再看宿主补广播策略。

---

### P2（高级能力：做对了会很强，但先别全上）

#### 3.8 统一“用户可见提示”能力（toast/snackbar/confirm）

- **问题**：kit 的 UI 在 WebView 内，很多时候需要调用宿主级提示/确认（更像系统 UI）。  
- **建议方向**：
  - 协议：`ui.toast` / `ui.confirm` / `ui.prompt`
  - SDK：`kit.ui.toast(...)` 等
- **改动层**：协议 + 宿主 + SDK。

#### 3.9 Clipboard API（读/写/监听）

- **问题**：很多 IME 场景离不开剪贴板；现在只能靠 binding.invoke 里“宿主帮你带 clipboardText”。  
- **建议方向**：
  - `clipboard.read` / `clipboard.write` / `clipboard.observe`
- **改动层**：协议 + 宿主 + SDK + 权限模型。

#### 3.10 更强的网络能力（WS/SSE、下载、代理策略）

- **问题**：`network.fetch` 足够起步，但长期会遇到 streaming / 大文件 / 重试/限速/代理策略等。  
- **建议方向**：逐步加，不要一口吃成胖子（先从 SSE/streaming 切入）。

#### 3.11 每个 kit 独立 origin / 隔离更彻底

- **问题**：现在所有 kit 共用一个 origin，所以禁了 DOM Storage；长期要做真正生态，最终还是要 per‑kit origin（或更强隔离）。  
- **改动层**：宿主 WebView 容器策略（Android/Windows）为主，SDK 只是配合。

---

## 4. 我建议你先拍板的 3 个问题（最能减少未来返工）

1) **`binding.invoke` 要不要成为 `createKit` 的一等能力？**（我建议：要，且 P0）  
2) **权限枚举要不要补齐 `ai.agent.list` + `files.pick`？**（我建议：补齐，并把 “files.pick 复用 storage.read” 结束掉）  
3) **AI 要不要做 streaming？**（我建议：要；否则 chat 类 kit 体验会长期别扭）

