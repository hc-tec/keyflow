# Function Kit 异步任务追踪（Task Tracking）机制（设计稿）

更新时间：2026-03-25  
范围：Function Kit runtime（宿主侧）与 Function Kit UI（kit 侧）的消息协议与 UI 约定（不涉及实现）

## 背景与动机

Function Kit 里很多能力天然是异步的，例如：

- `ai.chat`（Android 直连模型推理）
- `network.fetch`（HTTP 请求）
- `ai.agent.*`（未来可能走桌面/远端 adapter）
- `candidates.regenerate`（可能触发推理或远端 render）

当前常见做法是宿主用 `host.state.update` 推送“文字状态”，kit 用状态栏展示。但它缺少：

- 可关联的 `taskId`（无法把一堆状态更新串成同一个任务）
- 进度与阶段（只能“请求中/完成/失败”）
- 可取消（用户点错、网络慢、切换场景）
- 可回溯日志（定位“为什么失败/卡住”）
- 历史与恢复（WebView reload、切换功能件、失焦导致 UI 重建）

因此需要一个最小的、可增量演进的“异步任务追踪”机制。

## 目标与非目标

目标：

- 让 kit 能以统一方式追踪宿主执行的异步任务：状态、进度、日志、取消、结果。
- 保持与现有 `host.state.update` 兼容：旧 kit 不炸，新 kit 能更好展示。
- 支持重连/重建：kit 重新握手后能同步当前进行中的任务与最近历史。
- 协议最小化：不引入复杂 connector，不绑定特定 AI/agent 实现。

非目标：

- 不设计“跨设备/跨重启”的可靠队列（可后续扩展）。
- 不要求所有宿主能力都必须改成 task 模式；允许逐步迁移。
- 不在本文实现任何代码。

## 任务模型（Task Model）

任务是“宿主侧执行的、可追踪的异步操作”的抽象。它必须是可关联、可增量更新、可取消（如果宿主支持）的。

### 核心字段

- `taskId: string`
- `kitId: string`
- `surface: string`  
  例如 `panel`、`bar`、`keyboard`。任务更新需要路由到正确的 kit + surface。
- `kind: string`  
  例如 `ai.chat`、`network.fetch`、`candidates.regenerate`、`ai.agent.run`。
- `status: "queued" | "running" | "succeeded" | "failed" | "canceling" | "canceled"`
- `createdAt: string`（ISO8601）
- `updatedAt: string`（ISO8601）
- `seq: number`  
  单调递增，用于 kit 做幂等与乱序处理（只接受更大的 seq）。

### 进度（Progress）

- `progress?: {`
- `ratio?: number`（0.0 - 1.0）
- `current?: number`
- `total?: number`
- `unit?: string`（例如 `tokens`、`steps`、`bytes`）
- `stage?: string`（例如 `prepare`、`request`、`decode`、`render`）
- `message?: string`（面向用户的短文本）
- `etaMs?: number`（可选）
- `}`

### 日志（Logs）

日志用于调试与回溯，必须支持“增量追加”。

- `logs?: Array<{`
- `ts: string`（ISO8601）
- `level: "debug" | "info" | "warn" | "error"`
- `message: string`
- `data?: any`（结构化数据，需可 JSON 序列化）
- `}>`

约束建议：

- 宿主只保留最近 N 条（例如 200），避免内存膨胀。
- 大字段（例如 HTTP body、模型原文）建议截断或只给 hash/摘要，避免泄露与卡顿。

### 取消（Cancel）

- `cancellable: boolean`
- `cancelRequested?: boolean`
- `cancelRequestedAt?: string`

语义：

- kit 只能“请求取消”；是否能取消由宿主决定（例如 HTTP/推理是否支持中断）。
- 被取消的任务最终状态应为 `canceled`（成功进入取消）或 `failed`（取消失败或已不可取消）。

### 结果（Result）与错误（Error）

- `result?: { summary?: string, payload?: any }`  
  建议只放摘要与可安全展示的小对象；大结果继续走原业务消息（例如 `ai.chat.result`）。
- `error?: { code: string, message: string, retryable?: boolean, details?: any }`

## 宿主与 kit 的职责边界

### 宿主（Host）职责

- 任务 ID 与状态权威：生成 `taskId`，维护 `status/seq/updatedAt`。
- 权限与安全：在创建任务前做 permission 检查；拒绝要给明确错误。
- 执行与资源管理：并发限制、超时、取消、失败重试策略（若有）。
- 事件推送：在任务生命周期内发送 `task.update` 与可选的 `task.log.append`。
- 重连同步：kit 重新 `bridge.ready` 后，能提供“进行中任务 + 最近历史”的同步能力。
- 与现有业务消息共存：例如仍然发送 `ai.chat.result` / `candidates.render`，并在其中携带 `taskId` 便于关联。

### Kit（功能件 UI）职责

- 发起任务：通过业务消息（如 `ai.chat`）或 task 协议发起，并记录期望的 `taskId`（若宿主回传）。
- 展示与交互：进度条、状态条、错误详情、取消按钮、历史列表。
- 幂等与容错：按 `seq` 合并更新；乱序与重复消息不应导致 UI 抖动或状态倒退。
- 不做权威决策：不要在 UI 侧“伪造任务完成”；仅依据宿主事件。
- 回退策略：宿主不支持 task 协议时，至少还能用 `host.state.update` + 业务消息维持基本体验。

## UI 呈现建议

### 1) 状态条（Status Bar）

展示当前“最相关任务”的摘要（通常是最近一次 `running/canceling` 的任务）：

- 左侧：状态（Running/Failed/Done）
- 中间：`kind + stage + message`（例如 `ai.chat · request · 生成中...`）
- 右侧：进度（例如 `42%`）或短 taskId（例如 `t_7d3a…`）

交互建议：

- 点击状态条可打开任务详情抽屉（或跳转到 History 视图）。
- `failed` 时高亮并展示“查看详情/复制错误/重试”。

### 2) 通知（Notification / Toast）

在 IME 场景建议优先“面板内通知”，避免频繁系统通知打扰：

- 任务完成：toast “已生成 3 条候选”
- 任务失败：toast “AI 生成失败（点开看详情）”

系统通知可作为可选项（由宿主决定是否启用）。

### 3) 历史（History）

至少提供最近 N 条任务的列表（建议按 kitId + surface 过滤）：

- 每条：`kind`、耗时、状态、简短摘要、可展开日志
- 支持：复制日志、复制错误详情、重新触发（由 kit 调用原业务动作）

## 与现有 `host.state.update` 的关系

现状：`host.state.update` 通常包含：

- `label`（短文字）
- `details`（结构化对象，可能含 `reason`、`model`、`error`、`composer` 等）

建议的兼容策略：

1. `host.state.update` 保留不变，继续作为“即时状态提示/调试信息”通道。
2. 当宿主支持 task tracking 时，`host.state.update.details` 可以附带：

- `taskId`（若此状态属于某个任务）
- `taskPatch`（可选，等价于一次 `task.update` 的 patch）

3. Kit 的融合策略：

- 优先消费 `task.update`（结构化、可关联）。
- 若只收到 `host.state.update`，仍照旧更新状态栏。
- 若 `host.state.update` 带 `taskId`，kit 可把它当成该 task 的一条 log 或一次 patch 更新，以保证“状态栏与任务详情一致”。

## 最小消息协议草案（不实现）

以下协议草案沿用现有 runtime envelope（`type/payload/replyTo/error`）风格。

### 1) 任务增量更新（Host -> Kit）

`type: "task.update"`

payload：

- `task: { ...TaskModel }`  
  允许完整快照，也允许只传 patch（但必须包含 `taskId/seq/status/updatedAt`）。

### 2) 任务日志追加（Host -> Kit，可选）

`type: "task.log.append"`

payload：

- `taskId: string`
- `seq: number`（task 维度单调递增）
- `logs: Array<LogEntry>`

### 3) 任务取消（Kit -> Host）

`type: "task.cancel"`

payload：

- `taskId: string`
- `reason?: string`

回复（Host -> Kit）：

- `type: "task.cancel.ack"`（可选）  
  也可以不发 ack，仅通过后续 `task.update` 推进到 `canceling/canceled/failed`。

### 4) 任务同步（Kit -> Host）

用于重连/页面刷新后恢复现场。

请求：`type: "tasks.sync.request"`

payload：

- `includeHistory?: boolean`（默认 true）
- `historyLimit?: number`（默认 30）

响应：`type: "tasks.sync"`

payload：

- `running: Array<TaskModel>`
- `history: Array<TaskModel>`

### 5) 与业务消息的关联（推荐做法）

业务请求（例如 `ai.chat`、`network.fetch`、`candidates.regenerate`）允许携带：

- `taskTracking?: { enabled: true, clientTag?: string }`

宿主回传：

- 在 `task.update` 中创建任务并持续更新
- 在最终业务响应（例如 `ai.chat.result`）中携带 `taskId`

这样 kit 能把“结果渲染”与“任务追踪”关联起来。

## 典型流程示例

### AI 生成候选（kit 按钮触发）

1. kit 发送 `context.request` 获取上下文（可选）
2. kit 发送 `ai.chat`（带 `taskTracking.enabled=true`）
3. host 创建 task，发送 `task.update(status=running)`
4. host 在关键阶段追加 `task.log.append`
5. host 完成后：

- 发送 `ai.chat.result`（带 `taskId` + `candidates`）
- 发送 `task.update(status=succeeded, result.summary=...)`

失败时：

- 发送 `task.update(status=failed, error=...)`
- 可选：发送 `bridge.error`（保持旧 kit 兼容）

### 取消

1. kit 发送 `task.cancel(taskId)`
2. host 若支持中断则更新为 `canceling`，随后 `canceled`
3. 若不支持则返回 `task.update(status=failed, error.code=cancel_not_supported)` 或忽略取消请求

## 边界情况与建议

- WebView reload：kit 应在 `bridge.ready.ack` 后调用 `tasks.sync.request`（或宿主主动 `tasks.sync`）。
- 乱序与重复：kit 按 `seq` 丢弃旧更新。
- 并发任务：UI 只在状态条展示“当前任务”，历史保留全部；候选区只绑定最近一次生成任务的 `taskId`。
- 性能：`task.update` 频率建议节流（例如每 200ms 或 stage 变化时发一次），日志追加合并批量发送。
- 隐私：默认不要把敏感内容（消息全文、API Key、HTTP body）塞进日志与错误 details；需要调试时仅在 debug 开启。

