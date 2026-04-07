# 输入法 Function Kit 的 AI Backend Strategy（决策版）

> 编码：UTF-8
> 创建时间：2026-03-22T16:35:00+08:00
> 更新时间：2026-03-23T02:13:25+08:00
> 版本：v4
> 适用范围：Windows + Android 输入法宿主、Function Kit、AI Router、OpenClaw/nanobot/自定义后端

## 0. 这份文档现在要拍板什么

这份文档不是再比较“OpenClaw 重不重”或“nanobot 轻不轻”，而是要把下面几件事定死：

1. 输入法里的 AI 任务应该如何分层。
2. 宿主、Function Kit 前端、AI Router、后端 adapter 的边界是什么。
3. 哪些任务默认走 `direct-model`，哪些走 `bounded-tool-calling-agent`，哪些才值得接 `external-agent-adapter`。
4. 当前仓库已经落了哪些协议和 PoC，哪些仍然只是目标态。
5. 生产主线和研究支线应该怎么拆，避免产品被某一个框架绑死。

先给结论：

- **输入法不绑定 OpenClaw，也不绑定 nanobot。**
- **输入法绑定的是 host-owned AI Backend Protocol。**
- **浏览器式 Function Kit 前端绝不能持有 API key，也不应直连外部模型。**
- **Android 是默认 AI 执行面；全局 AI 配置与密钥默认由 Android 宿主管理。**
- **默认主线是 `direct-model`，不是 OpenClaw。**
- **高频 chat / `direct-model` 主线默认先在 Android 完成。**
- **PC host 只承接手机确实做不了的能力，不应退化成通用 AI connector。**
- **OpenClaw 是高级 adapter；nanobot 是候选 adapter，不抢当前主线。**
- **输入法适合 bounded、JSON-first、user-confirmed 的 session agent，不适合自治 agent。**

---

## 1. 当前仓库现状

先看现实，不然方案会继续飘。

### 1.1 已经存在的协议与 schema

`TODO/function-kit-runtime-sdk` 里已经有一套宿主侧 AI 协议骨架：

- `schemas/ai-backend-common.schema.json`
- `schemas/ai-backend-request.schema.json`
- `schemas/ai-backend-response.schema.json`
- `docs/AI_BACKEND_PROTOCOL.md`

协议里已经明确了这些 backend classes：

- `direct-model`
- `bounded-tool-calling-agent`
- `external-agent-adapter`
- `local-demo`

execution mode 里还保留了兼容别名：

- `remote-openclaw`

### 1.2 已经存在的 manifest 语义

`TODO/function-kits/chat-auto-reply/manifest.json` 已经落了：

- `ai.executionMode = "direct-model"`
- `ai.backendHints.preferredBackendClass = "direct-model"`
- `ai.backendHints.latencyBudgetMs = 1200`
- `ai.backendHints.allowFallbacks = true`
- `ai.backendHints.maxToolCalls = 0`
- `ai.backendHints.maxReasoningSteps = 0`

这说明产品层其实已经做了第一次判断：

- 自动回复候选属于高频文本增强
- 理想默认路由应当是 `direct-model`

### 1.3 当前 host service 的真实状态

`TODO/function-kit-host-service/src/server.js` 当前跑通的是一条 OpenClaw-backed host route：

- `/v1/openclaw/status`
- `/v1/function-kits/chat-auto-reply/render`

这条路由的返回里已经明确写了：

- `resolvedExecutionMode: "remote-openclaw"`
- `backendClass: "external-agent-adapter"`

也就是说，当前仓库真实状态不是“默认 direct model 已经落地”，而是：

- **协议和 manifest 已经为 direct-model 做了目标设计**
- **现有可运行 host service 仍然主要是 OpenClaw adapter PoC**

### 1.4 当前阶段真正缺的不是“再选框架”

当前最缺的是：

1. 统一 AI Router
2. `direct-model` 真正实现
3. `bounded-tool-calling-agent` 的正式实现
4. host 对 request/response schema 的强校验
5. fallback / 熔断 / 观测规范

所以现在继续争论“直接绑 OpenClaw 还是切 nanobot”是跑偏的。
当前应该先把宿主协议和路由策略定死。

### 1.5 当前 native host 只消费了 hints 的一部分

这一点必须写清，否则文档会高估现状。

当前 Windows / Android 原生 host 与 host service 并没有完整吃进全部 `backendHints`。
目前更明确被消费的主要是：

- `preferredBackendClass`
- `preferredAdapter`
- `latencyTier`
- `latencyBudgetMs`
- `requireStructuredJson`
- `requiredCapabilities`
- `notes`

而这些字段在 native host 里还没有全面成为正式运行时策略：

- `allowFallbacks`
- `allowBackgroundPreparation`
- `maxToolCalls`
- `maxReasoningSteps`
- `preferredModelFamily`

因此文档必须把它们写成：

- **协议正式字段**
- **路由器最终必须消费的字段**
- **但不是所有宿主当前都已完整实现**

### 1.6 `requestedExecutionMode` 与 `effectiveExecutionMode` 必须分开

manifest 里的 `ai.executionMode` 是请求意图，不等于每次运行时都能原样生效。

真实运行中至少会出现这几种降级：

- Windows preview 场景退回 `local-demo`
- Android 远程推理关闭时退回 `local-demo`
- 当前 OpenClaw host service 兼容链把请求收敛为 `remote-openclaw`

所以产品和工程都必须统一用两层概念：

- `requestedExecutionMode`
- `effectiveExecutionMode`

不允许把 manifest 里的声明直接写成“实际总会按这个后端执行”。

---

## 2. 架构总原则

### 2.1 前端只负责 UI，不负责后端

浏览器式 Function Kit 前端只负责：

- 参数采集
- 候选展示
- 动作展示
- 用户确认
- 状态反馈

前端绝不负责：

- 保存 API key
- 自己决定 provider
- 自己决定走 OpenClaw 还是 nanobot
- 直接联网请求模型

### 2.2 宿主拥有 AI Router

宿主必须拥有并独占这些职责：

- 构造 AI backend request
- 全局 AI 配置管理
- 本地密钥存储
- 上下文裁剪
- 权限交集计算
- backend class 路由
- adapter 选择
- 超时、重试、熔断
- 日志与脱敏
- 结果标准化

### 2.2.1 Android-first 执行基线

这条基线必须单独写死，否则文档很容易滑回“手机 UI + 电脑大脑”的默认思路。

默认规则如下：

- **用户在 Android 端触发的 chat / `direct-model` 请求，默认由 Android 宿主直接完成**
- **Android 宿主默认持有本机全局 AI 配置、provider 选择、base URL 与 key 引用**
- **不依赖 PC 在线，不依赖 companion 常驻，不依赖 connector 协议协商**
- **只有任务确实依赖 PC 本机资源时，才允许转给 PC host service**

这里所谓“PC 确实不可替代”的情况，只包括这类能力：

- 桌面文件系统 / 本地数据库
- 微信 / QQ / 浏览器 / 桌面软件桥接
- 仅电脑所在网络可访问的内网资源
- 必须复用电脑本地 agent runtime 的 workspace / skills 能力

除此之外，不应把 PC host 设计成：

- Android 的默认 AI 出口
- 通用中转层
- 通用 connector / relay / control plane

### 2.3 所有具体后端都只是 adapter

这里必须彻底去框架中心化。
正式支持的角色定义应当是：

1. `DirectModelAdapter`
2. `BoundedAgentAdapter`
3. `OpenClawAdapter`
4. `NanobotAdapter`（研究线）

产品不应该再使用“OpenClaw 模式”这种语言。
产品只应该使用：

- backend class
- execution mode
- adapter hint

### 2.4 信任边界、鉴权与密钥管理

“key 不在前端”还不够，必须继续把信任边界说细。

#### 本地 host service

- 仅绑定 loopback
- 只接受本机宿主进程调用
- 不应暴露到公网接口

#### Android 到 PC 的桥接

当前 `adb reverse` 是调试可行路径，但不是生产级鉴权方案。
生产要求必须是：

- 用户显式开启 remote inference
- 设备配对后拿到每设备 secret 或短期 token
- 局域网访问必须带认证，而不是裸 HTTP 开放

#### adapter 身份

每个 adapter 都必须有：

- adapter id
- 版本信息
- capability 声明
- 可观测的健康状态

#### 密钥归属

密钥只能存在于：

- 宿主
- 本地 host service
- 受控 adapter 进程

不允许存在于：

- WebView 页面
- kit manifest
- 远程静态资源

#### 密钥轮换

最少要支持：

- 按用户 / 设备隔离
- 手动更新和失效
- 配置变更后即时重载
- 日志中完全脱敏

---

## 3. 任务分层与默认路由

### 3.1 Class A：高频文本增强

典型任务：

- 自动回复候选
- 改写
- 翻译
- 润色
- 摘要

特征：

- 高频
- 单轮或极少轮
- 不依赖复杂工具
- 输出天然适合候选列表
- 时延预算极紧

默认路由：

- `direct-model`

硬约束：

- `latencyBudgetMs <= 1500`
- `maxToolCalls = 0`
- `maxReasoningSteps = 0`

### 3.2 Class B：有限工具调用任务

典型任务：

- 创建日程
- 记录待办
- 保存到知识库
- 查询联系人画像
- 生成结构化动作建议

特征：

- 显式触发
- 需要 1~3 个工具
- 需要结果确认
- 时延可放宽

默认路由：

- `bounded-tool-calling-agent`

硬约束：

- 必须有工具白名单
- 必须限制 reasoning step
- 高风险动作必须要求确认

### 3.3 Class C：workspace / skills 重场景

典型任务：

- Codex CLI
- OpenClaw skills
- 项目工作区技能
- 多步知识任务

特征：

- 依赖 workspace
- 依赖外部 agent runtime
- 可接受更高时延
- 更适合 panel-first

默认路由：

- `external-agent-adapter`
- `backendHints.preferredAdapter = "openclaw"` 可作为首选

### 3.4 当前阶段明确不支持的任务

当前阶段至少不做：

- 自治式后台 agent
- 输入法每次按键都触发 AI
- 未经确认的跨应用自动动作
- 浏览器 Function Kit UI 直接保管 key
- “看起来轻就直接绑进主线”的框架押注

---

## 4. 路由决策树

### 4.1 决策树的正式版本

宿主路由应当按照这棵树执行，而不是按具体框架 hardcode：

```text
if executionMode == "local-demo":
  route -> local-demo

else if preferredBackendClass == "direct-model"
  and latencyBudgetMs <= 1500
  and maxToolCalls == 0
  and maxReasoningSteps == 0:
    route -> direct-model

else if preferredBackendClass == "bounded-tool-calling-agent"
  or requiredCapabilities contains "tool-calling":
    route -> bounded-tool-calling-agent

else if preferredBackendClass == "external-agent-adapter"
  or preferredAdapter is set
  or requiredCapabilities contains "workspace-access":
    route -> external-agent-adapter

else:
  fallback to backend class chosen by scene policy
```

### 4.2 路由表

| 任务类型 | 默认 backend class | 常见 hints | 是否允许自动 fallback |
| --- | --- | --- | --- |
| 自动回复候选 | `direct-model` | `low-latency`, `structured-output` | 是，但只在 direct-model 家族内部 |
| 翻译 / 改写 / 润色 | `direct-model` | `structured-output` | 是 |
| 日程 / 待办 / 知识写入 | `bounded-tool-calling-agent` | `tool-calling`, `requiresConfirmation` | 是，可降级为文本建议 |
| 联系人画像 / 中风险助手任务 | `bounded-tool-calling-agent` | `memory-read`, `tool-calling` | 是，但不得越权 |
| Codex / workspace / skills | `external-agent-adapter` | `preferredAdapter=openclaw`, `workspace-access` | 否，失败时以错误和建议收口 |

### 4.3 manifest 字段如何参与路由

宿主必须至少读取这些字段：

- `ai.executionMode`
- `ai.backendHints.preferredBackendClass`
- `ai.backendHints.preferredAdapter`
- `ai.backendHints.requiredCapabilities`
- `ai.backendHints.latencyBudgetMs`
- `ai.backendHints.allowFallbacks`
- `ai.backendHints.maxToolCalls`
- `ai.backendHints.maxReasoningSteps`

这不是“参考建议”，而是路由策略的正式输入。

### 4.4 两个代表性 manifest 模式

#### 高频文本增强

```json
{
  "ai": {
    "executionMode": "direct-model",
    "backendHints": {
      "preferredBackendClass": "direct-model",
      "requiredCapabilities": ["structured-output", "low-latency"],
      "latencyBudgetMs": 1200,
      "allowFallbacks": true,
      "maxToolCalls": 0,
      "maxReasoningSteps": 0
    }
  }
}
```

#### workspace / skills 重任务

```json
{
  "ai": {
    "executionMode": "external-agent-adapter",
    "backendHints": {
      "preferredBackendClass": "external-agent-adapter",
      "preferredAdapter": "openclaw",
      "requiredCapabilities": ["tool-calling", "workspace-access"],
      "latencyBudgetMs": 6000,
      "allowFallbacks": false,
      "maxToolCalls": 6,
      "maxReasoningSteps": 8
    }
  }
}
```

---

## 5. 上下文裁剪与权限边界

### 5.1 最小必要上下文原则

后端永远不应该直接拿到完整输入法环境。
宿主必须先裁剪，再构造 `ai-backend-request`。

### 5.2 不同任务层级的推荐上下文

| 任务层级 | 建议传入内容 | 明确不要默认传入的内容 |
| --- | --- | --- |
| Class A | `primaryText`、选中文本、光标附近短上下文、tone/persona tag | 长会话历史、联系人画像、跨 App 历史 |
| Class B | Class A + `scene` + 受限 persona context + `allowedTools` | 全量知识库、未授权记忆 |
| Class C | Class B + 显式确认后的 workspace / skill 引用 | 全量工作区快照、宿主 secrets |

### 5.3 权限是三层交集，不是一层开关

真正可用权限必须同时满足：

1. kit 声明的 `runtimePermissions`
2. 用户当前授予的宿主权限
3. 当前 backend / tool 允许使用的权限

也就是说：

- kit 有 `context.read`，不代表 OpenClaw adapter 就能读全部联系人画像
- kit 有 `input.replace`，不代表 bounded agent 能自动替换文本
- tool 可调用，不代表 tool 参数可以无限制

### 5.4 前端永远不持有 secret

必须定死：

- API key 只在宿主、本地 host service、或受控 adapter 进程中存在
- Function Kit UI 不保存 provider key
- Android WebView / Windows WebView2 页面都不应直接访问第三方模型 API

### 5.5 会话生命周期与状态归属

如果不定义 session 生命周期，重试、取消、并发都会变得含糊。

正式建议如下：

#### Class A

- 每次请求就是一次短会话
- 无长期记忆
- 新请求到来时直接取消旧请求
- 可使用短 TTL 结果缓存

#### Class B

- 从用户显式触发开始，到确认 / 取消结束
- host 负责 session id 与状态机
- adapter 只拿到执行所需的最小状态

#### Class C

- 可以有显式 panel session
- session 可被用户关闭、恢复或重试
- 长时状态由 host 或外部 agent runtime 管理，但宿主必须知道 session id

统一规则：

- 一个 surface + 一个 kit 同时只允许一个活动请求
- 新请求默认取消旧请求
- cancel 必须可传播到 adapter

### 5.6 工具能力分级与确认矩阵

`bounded-tool-calling-agent` 要可控，关键在工具分类。

建议把工具分成四类：

1. `read-only`
   - 只读查询
2. `draft-only`
   - 生成草稿、候选、建议
3. `reversible-write`
   - 可撤销的本地写入
4. `external-side-effect`
   - 发消息、写远端系统、跨 App 动作

确认规则：

- `read-only`：可自动执行
- `draft-only`：可自动执行，但结果必须可见
- `reversible-write`：默认需要确认
- `external-side-effect`：必须显式确认

工具 contract 还应包含：

- 输入 / 输出 schema
- 幂等键
- 是否支持 dry-run
- 是否支持补偿动作

### 5.7 数据留存、日志与合规

隐私不能只停留在“少给上下文”。

最低要求：

- 传输链路加密
- 本地缓存有 TTL
- 默认不把原始敏感上下文写永久日志
- vendor 侧若不能关闭训练 / 长期留存，就不能成为默认后端

建议的缓存策略：

- 高频候选缓存 TTL：`5 min`
- adapter 错误降级缓存 TTL：`30s`
- 长会话敏感中间结果：默认不持久化

审计日志最少保留：

- request id
- backend class
- adapter id
- latency
- error code

但不保留：

- 完整原文内容
- 明文 secret
- 未脱敏 persona 私密字段

---

## 6. 各类 adapter 的正确位置

### 6.1 DirectModelAdapter

这是默认主线后端，原因不是“它先进”，而是：

- 最符合输入法时延预算
- 最容易返回结构化候选
- 最容易做 provider 级 fallback
- 不会把键盘体验变成慢任务面板

### 6.2 BoundedAgentAdapter

输入法真正适合的 agent 形态是这种：

- 生命周期短
- 工具白名单固定
- 推理步数上限明确
- 高风险动作要确认
- 输出必须能结构化回 UI

这才是“输入法里的 agent”，而不是自治助理。

### 6.3 OpenClawAdapter

OpenClaw 的正确位置是：

- `external-agent-adapter` 的一种实现
- workspace / skills / 重任务的高级后端
- panel-first 或慢任务场景

不应该让它承担：

- 高频候选主链路
- 每次 slash 搜索的语义召回
- 所有 kit 的默认底层

### 6.4 NanobotAdapter

nanobot 现在的正确位置是：

- 研究线候选 adapter
- 轻量 agent 对照组
- 成本和复杂度 benchmark 对象

不是当前生产主线。

### 6.5 Provider / Model Portfolio 与 benchmark 规则

`direct-model` 和 `bounded-tool-calling-agent` 不能只是抽象名字，还需要准入标准。

#### Class A 默认后端准入条件

- 结构化 JSON 通过率高
- 中英混合输入质量稳定
- P95 时延满足 `<= 1.2s`
- 至少有主备两条同类 provider / model 路径

#### Class B 默认后端准入条件

- tool call schema 通过率稳定
- 对 confirmation / blocked / error 能返回结构化结果
- 失败可降级为文本建议

#### Class C 后端准入条件

- 明确 adapter 健康状态
- session 可取消
- workspace / skills 行为可观测

benchmark 维度必须统一：

- schema conformance
- P50 / P95 latency
- token / cost
- multilingual quality
- failure recoverability
- operator complexity

### 6.6 Adapter capability negotiation 与版本约束

host 不能假设所有 adapter 都支持所有能力。

每个 adapter 启动或注册时至少要声明：

- protocol version
- supported backend class
- supported capabilities
- limits，例如最大 tool calls、最大 payload

不兼容时的规则：

- host 直接判定不可路由
- 不做“先发过去再看能不能跑”的盲试
- 协议升级必须有兼容窗口

### 6.7 OpenClaw 与 nanobot 的客观对比

| 维度 | OpenClaw | nanobot | 当前建议 |
| --- | --- | --- | --- |
| 当前仓库已有接入证据 | 有，host service 已连通 | 无正式接入 | OpenClaw 先保留 |
| 适合高频候选主链路 | 低 | 中，但未验证 | 两者都不默认承担 |
| 适合 skills / workspace | 高 | 中，需验证 | OpenClaw 更适合当前重场景 |
| 代码与部署复杂度 | 较高 | 较低 | nanobot 值得研究但不应抢主线 |
| 现在是否应该绑定为输入法核心 | 否 | 否 | 都不绑定，只做 adapter |

---

## 7. fallback、熔断与失败模型

### 7.1 fallback 规则

这里必须严格，不能“能跑就偷偷切后端”。

#### `direct-model` 失败

允许：

- fallback 到同类备用 model/provider
- fallback 到本地 demo 或缓存候选

不允许：

- 默认自动升级到 OpenClaw 重 agent

#### `bounded-tool-calling-agent` 失败

允许：

- 降级成纯文本建议
- 返回需要手动完成的 action card

不允许：

- 越权改用未授权工具

#### `external-agent-adapter` 失败

允许：

- 返回明确错误
- 给出重试、切回轻量模式、打开设置等建议

不允许：

- 悄悄切到另一个重 agent

### 7.2 熔断规则

建议当前阶段直接定一个简单可实施的规则：

- 同一 adapter 在 60 秒内连续失败 3 次
- 将其标记为 `degraded` 5 分钟
- degraded 期间不再作为默认路由首选
- UI 必须显示“当前已降级”而不是假装正常

### 7.3 标准错误分类

宿主对外只暴露归一化错误：

1. `auth_missing`
2. `network_unreachable`
3. `timeout`
4. `provider_overloaded`
5. `tool_denied`
6. `unsafe_action_requires_confirmation`
7. `invalid_response_schema`
8. `adapter_unavailable`

### 7.4 容量、限流与回压

输入法场景最怕的不是单次失败，而是卡住主链路。

建议默认策略：

- 每个用户的 Class A 请求并发上限：`1`
- 每个用户的 Class B 请求并发上限：`1`
- Class C 允许长任务，但同一 kit panel session 仍以 `1` 为上限

回压策略：

- 新的 Class A 请求到来时取消旧的同类请求
- Class B / C 若已有运行中任务，直接提示“当前任务处理中”
- adapter 处于 `degraded` 时不再进入默认路由

限流策略：

- 交互型请求优先
- workspace 重任务不得挤占高频候选主链路
- overload 时优先保住 `direct-model`

### 7.5 用户侧错误文案原则

不能只给 technical error。
至少要告诉用户：

- 发生了什么
- 当前是否已降级
- 有没有本地候选或缓存候选
- 下一步该怎么做

例如：

- “远程 AI 未连接，当前已切回本地示例候选”
- “该功能需要联系人画像权限，当前未授权”
- “OpenClaw 当前不可用，建议稍后重试或切回标准回复候选”

---

## 8. 运行拓扑

### 8.1 Windows

推荐拓扑：

```text
IME Host
  -> local host service
    -> AI Router
      -> DirectModelAdapter
      -> BoundedAgentAdapter
      -> OpenClawAdapter
      -> future NanobotAdapter
```

要求：

- key/token 只在宿主或本地 host service
- adapter 细节留在 host 内部
- Function Kit UI 只接收结构化结果

### 8.2 Android

Android 端必须是默认 AI 执行面，而不是“只负责把请求转出去的壳”。

推荐三层路径：

#### 主线：Android 宿主直接完成 chat / `direct-model`

```text
Android IME Host
  -> host-owned global AI config
    -> DirectModelAdapter
      -> provider API
```

这条链路对应：

- 高频回复候选
- 改写 / 润色 / 翻译 / 摘要
- 结构化 JSON 提取

要求：

- 默认不依赖 PC
- 默认不依赖 companion
- key 与 provider 配置只保留在 Android 宿主

#### 次主线：Android 宿主运行已注册的本机 agent

```text
Android IME Host
  -> Agent Registry
    -> AndroidAgentRunner / BoundedAgentAdapter
```

这条链路适用于：

- 不依赖 PC 本机资源的 bounded agent
- 纯 HTTP / 云端 agent
- 仅需 Android 侧已授权上下文的轻量 agent

#### 补充路径：仅在确有 PC 依赖时桥接到 PC host

```text
Android IME Host
  -> authenticated bridge
    -> PC host service
      -> external-agent-adapter
```

只在这些条件下进入这条路径：

- Android 当前能力模型确实做不了
- 任务必须读 PC 文件 / 桌面应用 / 浏览器 / 本地 agent runtime
- 或必须访问只有电脑网络能访问的目标

当前仓库里的 `adb reverse` / host service 路径，应被视为：

- 调试与兼容 PoC
- PC 资源依赖场景的补位链路

而不是：

- Android AI 主线
- 默认联网方式
- 通用 connector 基础设施

### 8.3 明确不推荐的拓扑

当前阶段不推荐：

- 浏览器前端直连互联网模型
- OpenClaw 直接嵌进 Android 输入法进程
- 输入法同时承担高频 UI 和重型 agent runtime

---

## 9. 生产主线与研究支线

### 9.1 现在就应该作为生产主线推进的

1. **host-owned AI Backend Protocol**
2. **manifest `ai.executionMode` / `ai.backendHints` 继续作为正式 contract**
3. **现有 OpenClaw host service 仅作为 `external-agent-adapter` PoC 与兼容实现**
4. **优先补齐真正的 `DirectModelAdapter`**
5. **随后补齐 `BoundedAgentAdapter`**

### 9.2 对当前仓库状态的正式判断

必须直说：

- `chat-auto-reply` 的 manifest 已经表达了“默认想走 direct-model”
- 当前 host service 仍然主要返回 `remote-openclaw`

所以现在不能把现状包装成“默认 direct-model 已完成”。
更准确的说法是：

- **当前主线协议已定**
- **当前可运行 AI 路径主要是 OpenClaw adapter 兼容链**
- **默认 direct-model 仍是下一步要补齐的核心工程项**

### 9.3 研究支线

研究线可以继续做，但不能抢生产主线资源：

- `NanobotAdapter`
- on-device 小模型实验
- background preparation
- 语义 slash search
- 更复杂的多 agent 编排

这些都应在协议稳定之后进行。

---

## 10. 验收指标与 SLO

### 10.1 按 backend class 看，而不是按框架看

必须监控：

- P50 / P95 latency by backend class
- error rate by backend class
- fallback rate
- confirmation abandonment rate
- token / cost per successful completion
- invalid schema rate

### 10.2 当前阶段建议 SLO

- `direct-model`：成功率 >= 97%，P95 <= 1.2s
- `bounded-tool-calling-agent`：P95 <= 4s
- `external-agent-adapter`：P95 <= 8s

如果某个 backend class 长期达不到本类任务的 SLO，就不应继续留在默认路由里。

---

## 11. 最终决策

最终决策如下：

1. **输入法绑定协议，不绑定 OpenClaw，也不绑定 nanobot。**
2. **浏览器式 Function Kit 前端不保存 key，不直接联网调模型。**
3. **Android 是默认 AI 执行面；全局 AI 配置和 key 由宿主管理。**
4. **默认主线是 Android 宿主上的 `direct-model` / chat；这与当前 manifest 语义一致。**
5. **PC host 只处理手机确实做不了的能力，不承担默认 AI 中转层。**
6. **OpenClaw 作为 `external-agent-adapter` 的高级实现保留，用于 workspace / skills 重场景。**
7. **nanobot 只作为研究线候选 adapter，不抢当前主线。**
8. **真正适合输入法的是 bounded、可确认、结构化输出的 session agent。**
9. **当前 host service 的 OpenClaw 路由应被视为 PoC / 兼容层，而不是未来唯一命门。**

一句话总结：
**Function Kit 的 AI 架构，先定宿主协议与路由边界，再把 OpenClaw、nanobot、direct model 都降格成可替换实现；这才是不会把产品命脉押在单一框架上的做法。**
