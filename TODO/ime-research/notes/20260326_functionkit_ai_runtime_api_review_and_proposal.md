# Function Kit：AI Runtime API 复核与改造方案（候选解耦 / 并发 / 多 schema）

更新时间：2026-03-26  
范围：Function Kit Host Bridge / Runtime SDK / Android Host（只做设计审计与方案，不改实现）

## TL;DR（先把结论说清楚）

当前项目里 **“AI”其实有两条完全不同的链路**，但文档与返回结构把它们搅到一起了，导致“AI = candidates”的错觉：

1) **IME/候选链路（候选优先）**：`candidates.regenerate -> candidates.render`  
   - 这条链路可以由 AI 生成候选，也可以由本地 demo/规则生成候选  
   - 该链路对应的 `AI_BACKEND_PROTOCOL` 本质是 **host->backend 的候选/动作协议**（candidate/action 导向），不是 kit 的通用 AI API

2) **Kit 通用 AI 链路（模型调用优先）**：`ai.chat -> ai.chat.result`  
   - 这条链路应该是 “kit 想用模型做任意事” 的最小原语  
   - 但 Android 当前 `ai.chat.result` 里带了 `candidates` 字段（并且 SDK 文档也把它写成固定返回），等于把“聊天自动回复样板”的输出形式推广成了通用 AI API 的默认输出

因此你指出的担忧成立：**目前 AI runtime API 的语义边界不够硬**，并且 `createKit().state.ai` 是 “最后一次结果覆盖”，对并发/多请求并不友好。

本方案建议：**把 candidates 彻底从 AI 通用 API 的“默认语义”里剥离**，同时补齐“多请求并发 + 多 schema + 多模态”的扩展点，并给“开发者自带 AI 服务”留出可控入口。

---

## 1. 你提出的真实需求（我按工程约束重述一遍）

### 1.1 多请求 / 并发

- 一个 kit 可能同时发起多个 AI 请求（并行、交错返回），不能假设串行
- 不能用“全局 busy + lastResult”来建模（至少 SDK store 不能只留 1 个槽位）

### 1.2 多 prompt / 多 schema / 多输出形态

- 不同请求可能有不同 prompt、不同结构化 schema（甚至同一次交互中多个 schema）
- 输出不一定是 candidates：可能是
  - 单段文本（翻译/润色/扩写）
  - 结构化 JSON（提取字段、生成表格数据）
  - 工具调用/动作列表（让用户确认后执行）
  - 多模态资源（图片/视频/音频）——至少要在协议上预留

### 1.3 candidates 不是 AI 的同义词

- candidates 是 IME 场景非常重要的 UI 产物，但它 **不应该成为 AI API 的中心语义**
- “候选”可以由 AI 生成，也可以由规则/模板/检索生成；反过来 AI 也可以完全不产出候选

---

## 2. 现状审计（对应到当前仓库的具体实现/文档）

### 2.1 Runtime SDK 的现状（kit 侧）

- SDK 文档把 `kit.ai.chat()` 的返回写成固定包含 `candidates`：  
  - `TODO/function-kit-runtime-sdk/docs/BROWSER_EXTENSION_STYLE_API_V2.md`
- `createKit()` 的 store 里，`state.ai` 只是一个槽位，收到 `ai.chat.result` 就覆盖：  
  - `TODO/function-kit-runtime-sdk/src/index.js`（`case "ai.chat.result": setState({ ai: payload })`）

影响：

- 并发多个 `ai.chat` 时，`state.ai` 天然会“最后写入覆盖前面”，kit 若依赖 `state.ai` 会丢上下文  
  （虽然 Promise 级别仍可并发，但 store/事件语义没有明确鼓励这种用法）

### 2.2 Android Host 的现状（host 侧）

- `ai.chat.result` payload 目前会带一个宿主侧“候选提取”后的 `candidates` 字段：  
  - `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
- `chat-auto-reply` 样板里依赖 `kit.ai.chat(...).candidates` 来渲染候选：  
  - `TODO/function-kits/chat-auto-reply/ui/app/main.js`

这会把“聊天自动回复”这个场景的输出结构，变成了 “ai.chat 的默认输出结构”，从而误导后续 kit。

### 2.3 AI Backend Protocol 的定位（host->backend 边界）

`AI_BACKEND_PROTOCOL` 明确说它不是 Host Bridge，而是 host/router 与 backend adapter 之间的协议，并且 response `mode` 里天然包含 `candidate-list/action-list/...`：

- `TODO/function-kit-runtime-sdk/docs/AI_BACKEND_PROTOCOL.md`
- `TODO/function-kit-runtime-sdk/schemas/ai-backend-response.schema.json`

问题不在这里；问题在于：**该候选导向协议的存在，会进一步强化“AI 就是候选”的心理预期**。因此需要在“kit 通用 AI API”层面做强隔离。

---

## 3. 发现的问题（按“缺陷”而不是“偏好”来写）

### P0：AI 通用 API 的语义被 candidates 污染

表现：

- 文档与样板把 `ai.chat` 的输出写成天然带 candidates
- 宿主默认对 `ai.chat` 的文本结果做了候选提取并下发

风险：

- 后续 kit 会被迫“围绕 candidates 组织 UI/逻辑”，限制用例空间
- 不同 kit 的 AI 输出 schema 被迫向候选 JSON 对齐，反而降低自由度

### P0：SDK 的状态模型对并发 AI 不友好

表现：

- `state.ai` 是“最后一次结果覆盖”  
  - 并发时没有 requestId->result 的持久映射

风险：

- kit 开发者写错很容易（例如 UI 组件订阅 state.ai，结果被别的并发请求覆盖）

### P1：AI 请求/响应合同缺失（payload 缺少最小规范）

表现：

- TS 类型 `AiChatOptions`/`AiApi.chat` 没有明确字段规范（`[key: string]: unknown`）
- host 侧对 payload 的支持是“隐式”的（`systemPrompt/messages/prompt/format/input/...`）

风险：

- 多 schema、多模态、工具调用等能力无法在协议层演进，只能靠“约定俗成”

---

## 4. 方案：把 AI 通用原语与 candidates 彻底解耦

这里给出两档方案：**最小修复（不新增 message type）** 与 **推荐方案（新增通用 AI message type）**。

### 4.1 最小修复（不新增 message type，优先收口语义）

目标：先把 “ai.chat 默认返回 candidates” 这个暗示拿掉，让后续 kit 不被误导。

建议：

1) **把 `ai.chat.result.candidates` 定位为“可选的宿主便捷字段”**  
   - 文档改为：`ai.chat` 的主要输出是 `text` 与 `structured`（若请求 json）  
   - `candidates` 仅当输出结构满足某种约定（例如 `{candidates:[...]}`）时才可能出现  
2) `chat-auto-reply` 样板改用 `structured.candidates`（或自己解析）而不是依赖宿主“候选提取”  
3) SDK 文档把 `ai.chat` 返回从 `({text, structured, candidates, usage})` 改成 `({text, structured, usage, ...})`，并将 candidates 放入“可选字段/样板特化”

这档方案不改协议，只改语义与样板依赖，能最快止血。

### 4.2 推荐方案（新增通用 AI 原语：`ai.request` / `ai.response`）

目标：给 kit 一个真正可演进的“通用 AI 调用协议”，支持并发、多 schema、多模态、工具调用，同时不绑定 candidates。

#### 4.2.1 新增 message types（Host Bridge）

- `ai.request`（UI -> Host，request/ack 模式）
- `ai.response`（Host -> UI，响应）
- （可选）`ai.response.delta`（Host -> UI，流式增量）

#### 4.2.2 `ai.request` 建议 payload（最小但可扩展）

```json
{
  "requestId": "client-generated-id",
  "operation": "chat.completions",
  "input": {
    "messages": [{ "role": "user", "content": "..." }],
    "text": "...",
    "attachments": [{ "type": "image", "uri": "content://..." }]
  },
  "response": {
    "type": "text | json | json-schema | image | video",
    "schema": { "type": "object", "properties": { } }
  },
  "options": {
    "temperature": 0.7,
    "maxTokens": 800
  },
  "routing": {
    "latencyTier": "interactive",
    "latencyBudgetMs": 1200,
    "allowFallbacks": true
  },
  "taskTracking": { "enabled": true, "clientTag": "optional" }
}
```

关键点：

- **requestId 必须由 kit 侧生成**：并发时用它稳定关联 UI 状态（而不是靠“最后一次结果”）
- `response.schema` 是“可选”：当 type=json-schema 时才需要
- `taskTracking` 与你刚加的 task 机制天然可对齐（每个 AI 请求一个 task）

#### 4.2.3 `ai.response` 建议 payload

```json
{
  "requestId": "echo",
  "taskId": "t-...",
  "status": "succeeded | failed | canceled",
  "output": {
    "type": "text | json | image | video",
    "text": "...",
    "json": { }
  },
  "usage": { },
  "warnings": ["..."],
  "error": { "code": "...", "message": "...", "retryable": false }
}
```

说明：

- **不出现 candidates**；候选属于另一个域（见 4.3）
- `taskId` 让 UI 可以把 `kit.tasks` 的生命周期与 AI 调用关联起来

#### 4.2.4 并发语义（必须在文档里写死）

- Host 必须允许同一 kit 同时存在多个 in-flight `ai.request`
- SDK `createKit()` 不应该只提供 `state.ai = lastResult` 的模型；应当鼓励 kit 用：
  - `requestId` 自己维护 view state
  - 或者用 task tracking store（按 taskId 聚合）

---

## 5. candidates 的正确定位（防止再次混淆）

建议把 candidates 定义为：

- **一种 UI 产物类型（文本建议 + 动作）**  
- 其来源可以是：AI、模板、检索、规则、历史、上下文推断
- 它与 AI 的关系应该是“可选生产者”，不是“一一绑定”

因此建议后续把“候选生成”明确叫成 `candidates.*` 或 `suggestions.*`，并在文档里强调：

- `AI_BACKEND_PROTOCOL` 是 “候选/动作” 后端协议  
- `ai.request/response`（或 `ai.chat`）是 “通用模型调用” 协议

---

## 6. 迁移策略（不把现有样板砸掉）

1) 保留 `ai.chat`（兼容）  
2) 新增 `ai.request/response`（推荐）  
3) `chat-auto-reply` 先迁移到 `ai.request`（或至少不依赖 `ai.chat.result.candidates`）  
4) SDK 文档把 candidates 从 AI 默认返回里移除，避免误导新 kit

---

## 7. 下一步（需要你审核后再动代码）

- 你先审核：你希望 “通用 AI 原语” 采用 `ai.request/response` 还是继续扩展 `ai.chat`（但把 candidates 彻底降级为可选/样板字段）？
- 你确认后我再：
  - 补齐 message types/schema
  - 补 Android host 路由与最小 provider adapter
  - 更新样板 kit 与 SDK 文档，确保不会再出现“AI=候选”的默认暗示

