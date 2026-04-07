# Function Kit 能力供给：让 Android 端 Agent 直接使用各功能件（产品方案）

> 编码：UTF-8  
> 创建时间：2026-03-26  
> 适用范围：Android IME 宿主 + Function Kit 生态（Windows 后续对齐）  
> 要回答的问题：未来 agent 可以直接运行在 Android 端时，各功能件如何把能力“提供给 AI 使用”？这是否要求功能件提供原子化能力？如何设计才可规模化、可控、可维护？

---

## 0. TL;DR（结论先行）

1. **对 AI 暴露的能力要“原子化”，但功能件内部实现不必过度碎片化**  
   原子化的是“可调用工具（Tool）”的边界与 I/O 协议，而不是把业务拆到不可维护。
2. **推荐产品抽象：One Planner, Many Tools**  
   - Agent（规划器）尽量只有一个（Android 宿主内的统一 Planner/Router）  
   - 功能件提供工具（tools/bindings），Agent 负责组合与编排  
   - 宿主是唯一执行与安全边界：权限、网络、日志、二次确认都收口在宿主
3. **“AI 能力”必须拆成两层并写死边界：Chat / Agent**  
   - Chat：一次模型调用（Android 端基础能力）  
   - Agent：多步执行 + skills/tools（可在 Android 或 PC companion，但必须是“已注册执行体”）
4. **功能件向 AI 供给能力的正确方式不是“让 kit 随便联网/随便执行代码”**  
   而是：kit 静态声明能力与数据边界，宿主动态授予并统一治理。

---

## 1. 你真正要决策的不是“要不要原子化”，而是“能力供给的安全与可规模化形态”

“功能件如何提供给 AI 使用”在产品落地时会变成三件事：

1. **供给形态**：功能件到底提供的是“模型/提示词/知识库”，还是“可执行动作（工具）”？  
2. **边界与信任**：输入法属于高敏感软件，第三方功能件一旦能执行高权限动作，风险会指数级上升。谁是安全边界？  
3. **可规模化**：功能件数量上来后，如何做到可发现、可授权、可审计、可组合、可回归测试？

这三个问题的共同答案是：**把能力供给做成“工具目录（tool catalog）”，并由宿主统一治理。**

---

## 2. 产品原则（必须写死，否则后面一定失控）

### 2.1 IME 是快系统，AI/Agent 是慢系统

- 输入手感（10~50ms）是底线：**AI/Agent 永远不能阻塞按键主链路**。
- AI 只能走“慢路径”：显式触发、异步回填、可取消、可降级（失败就当没发生）。

### 2.2 宿主是唯一安全边界（功能件默认不可信）

与现有 Function Kit 安全模型一致：

- 功能件页面只加载本地资源（固定 origin）
- 宿主只暴露受控 Host Bridge
- **最终文本写回必须由宿主执行**（功能件/AI 只能给“候选/动作”）

### 2.3 供给“能力”要可声明、可授权、可撤销

像浏览器扩展一样：

- 能力必须能在 manifest 中静态列出（可审计）
- 首次使用必须有清晰授权（可拒绝）
- 之后随时可撤销

---

## 3. 原子化怎么拿捏：原子化的是“AI 可调用接口”

### 3.1 原子能力（Tool）的定义

一个“给 AI 用的能力”建议满足：

- **单一职责**：一次调用表达一个清晰意图（不要“一次调用做十件事”）
- **强结构化输入/输出**：schema 固定，可回归测试
- **可标注副作用**：只读 / 写回输入框 / 外部副作用（发送、日历写入、上传等）
- **可标注确认策略**：自动执行 / 仅建议（suggest-only）/ 必须二次确认

> 这解决的是 Agent“选择与组合能力”的稳定性问题，而不是要求把功能件业务拆成细碎函数。

### 3.2 允许“宏工具”（避免 tool-call 爆炸）

如果严格原子化导致：

- tool-call 数量爆炸（性能、成本、上下文膨胀）
- 需要跨多步才能得到一个用户可见结果

就允许 kit 提供“宏工具”，但必须：

- 仍然强结构化 I/O
- 明确副作用边界与确认策略
- 把外部副作用拆成可确认的独立 action（例如“生成草稿”与“发送消息”分开）

---

## 4. 推荐架构：One Planner, Many Tools（Android-first）

### 4.1 角色与组件

- **Android IME 宿主（Host）**：权限与执行边界；聚合工具目录；提供统一 AI 路由；负责最终写回
- **Function Kit（功能件）**：提供 UI（可选）+ 静态声明（manifest）+ 工具描述（tools/bindings）
- **Tool Catalog（工具目录）**：宿主从所有已安装 kit 的 manifest 聚合出的“可发现能力列表”
- **Agent Runtime（规划器）**：运行在 Android 端（未来）；从 catalog 选工具并编排；输出候选/动作

### 4.2 用户体验闭环（最重要）

1. 用户显式触发（工具栏按钮 / More 面板 / slash 命令）
2. 宿主采集“最小必要上下文快照”（输入框片段、选区、当前 app、用户显式参数）
3. Agent 在 Android 端运行：决定要不要用 Chat、要不要调用某个 kit 工具
4. 宿主执行工具调用（受权限与确认策略约束）
5. 返回候选卡片/动作按钮
6. 用户点击后由宿主执行 `insert/replace`（外部副作用需确认后执行）

---

## 5. 功能件如何“把能力提供给 AI 使用”（能力供给模型）

### 5.1 功能件最少需要供给三类静态声明

1. **工具（Tools）**：给 Agent 调用（强结构化 I/O）
2. **触发（Bindings/Triggers）**：把“场景/入口”与工具关联（例如剪贴板触发、selection 触发）
3. **AI 路由与网络端点声明（Routes/Endpoints）**：若 kit 提供开发者托管 AI 服务，必须静态声明 allowlist 与数据处理信息

### 5.2 每个工具建议具备的元数据（产品层必须要有）

建议在 manifest（或引用的 schema）里为每个 tool 增加/约定：

- `id` / `title` / `description`
- `inputSchema` / `outputSchema`
- `requiredRuntimePermissions[]`（声明上限）
- `sideEffect`：`read_only | writes_input | external_effect`
- `confirmPolicy`：`auto | suggest_only | always_confirm`
- `dataHandling`：会发送的数据类别与保留策略（unknown 也要写）
- `network`：引用 `network.endpoints[]` 的 `endpointId`（由宿主做 allowlist 与授权 UI）
- `availability`：依赖项（是否需要用户配置 AI、是否需要登录、是否需要网络）

这些信息对用户的价值是“可控”，对生态的价值是“可治理”。

---

## 6. 权限与信任：避免“权限洗钱”的关键约束

当 Agent 变成 Android 端一等公民时，最危险的情况是：

- A kit 拿到了一堆权限 → 通过 agent 调用 B kit 的能力 → 组合出用户未授权的行为

建议产品规则（先写死，再逐步实现）：

1. **每次 tool 调用必须具备明确的调用主体（invoker）与权限作用域（scope）**  
   - 从某个 kit 面板触发 → 默认 scope=该 kit  
   - 从全局入口触发（slash/全局 AI）→ scope=host-agent（单独管理权限）
2. **外部副作用默认 suggest-only，必须显式确认**（发送、写日历、上传等）
3. **权限上限来自 manifest 声明（交集原则）**  
   - kit 声明的是上限  
   - 宿主授予的是子集  
   - 不允许宿主“补全”出 kit 未声明的能力

---

## 7. AI 路由：功能件提供“AI 能力”的正确方式

### 7.1 统一原语：宿主提供 `ai.request`（推荐方向）

不要让 kit 直接拼 URL、自己管理跨域/重试；否则：

- 体验碎片化
- 审计与治理困难
- 容易成为数据外流通道

更可控的方式是：kit 只调用 `ai.request/ai.chat`，宿主决定走：

- `host-shared`：用户在宿主配置的 provider（Android 全局 AI）
- `kit-service`：开发者托管服务（必须走 endpoint allowlist + 首次授权）

### 7.2 “开发者自带 AI 服务”必须具备的用户可见性

最小要做到：

- 显示将访问的域名列表
- 显示发送的数据类别
- 可选择：仅本次允许 / 总是允许 / 拒绝
- 随时可撤销（功能件管理页）

---

## 8. MVP 路线（先跑通形态，再扩能力）

### 8.1 MVP：先验证生态形态

目标：在 Android 上让“Agent 能用 kit 能力”跑通闭环，但不引入高风险执行面。

- Agent（Android 端）先收敛为：  
  - 调用 `ai.chat` 生成结构化候选  
  - 调用少量宿主内置确定性工具（模板、格式化、剪贴板管理）  
  - 不默认执行外部副作用（或全部 always-confirm）
- Function Kit 供给先收敛为：  
  - `tools[]` + schemas + `sideEffect/confirmPolicy` 元数据  
  - `bindings[]` 用于入口（剪贴板动作、selection 动作）

### 8.2 下一阶段：可规模化治理

- 推进 `ai.request` + `ai.routes/network.endpoints`（host-shared vs kit-service）
- 补齐授权 UI、撤销 UI、审计日志（最小必要字段）
- 引入 `secrets/credentials`（避免 token 在 JS 里裸奔）

### 8.3 再下一阶段：允许第三方 kit 提供“可执行能力”

如果要允许第三方 kit 提供可执行代码，建议最终形态是：

- 工具实现跑在受限沙箱运行时（Wasm/JS 子集），由宿主统一调度
- 网络只能走宿主代理（host-proxy），并受 endpoint allowlist 约束
- 仍然遵循：强结构化 I/O + 副作用标注 + 确认策略

---

## 9. 一句话对齐团队心智

> **输入法不是全能助手；输入法是“意图入口”。Agent 负责规划，功能件供给工具，宿主负责安全与执行。**

