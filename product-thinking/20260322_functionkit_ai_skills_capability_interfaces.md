# Function Kit AI 接入方案（Chat / Agent 二分版，修订）

> 编码：UTF-8
> 修订时间：2026-03-24T11:03:27+08:00
> 适用范围：Function Kit Runtime SDK、Android Host、Windows Host、PC Companion、Agent Provider

## 0. 核心结论

AI 能力现在应该明确拆成两层：

1. **Chat**
2. **Agent**

这两层的职责必须写死：

- **Chat 是手机端基础 AI 能力**
- **Agent 是宿主注册的扩展执行能力**

因此，功能件侧最终只需要理解这几个入口：

- `client.ai.chat()`
- `client.ai.getChatStatus()`
- `client.ai.listAgents()`
- `client.ai.runAgent()`

同时再把另外几条边界写死：

- **Chat 默认在 Android 完成**
- **Chat 依赖用户在本机配置的全局 AI 设置**
- **全局 AI 配置由宿主管理，Android 是默认配置源**
- **Agent 可以跑在 Android，也可以跑在 PC companion**
- **PC companion 只是某些已注册 agent 的 runner，不是新的 connector 平面**
- **文件系统、微信、QQ、浏览器、桌面软件，不设计成功能件公共 API**
- **这些能力都藏在已注册 agent 的 skills 里，由 agent 自己实现**

所以之前那个 `host.invoke()` 不适合作为功能件公共能力模型。

---

## 1. 为什么必须拆成 Chat 和 Agent

因为这两类事情根本不是一回事。

### 1.1 Chat 是什么

Chat 解决的是：

- 改写
- 润色
- 翻译
- 摘要
- 生成回复
- 提取结构化结果

它本质上是：

- **一次模型调用**

这种能力完全可以：

- Android 直连云模型
- Android 直连用户自配的大模型 API

不需要默认依赖电脑。

### 1.2 Agent 是什么

Agent 解决的是：

- 多步处理
- 调用 skills / tools
- 访问文件系统
- 访问微信或 QQ
- 访问浏览器上下文
- 调用桌面软件

它本质上不是一次简单模型调用，而是：

- **一个已经注册好的执行体**

这种东西可能：

- 跑在 Android
- 也可能只能跑在 PC companion

所以必须跟 Chat 分开。

---

## 2. 和现有仓库协议怎么对齐

这一点必须提前写清，不然落地时会出现两套 AI 词汇互相打架。

SDK 面向功能件作者，可以用更简单的词：

- `chat`
- `agent`

但宿主、manifest、AI backend protocol 继续沿用仓库里已有的路由语义：

- `chat` 对应 `direct-model`
- `agent` 对应：
  - `bounded-tool-calling-agent`
  - 或 `external-agent-adapter`

换句话说：

- **`chat / agent` 是功能件侧概念**
- **`executionMode / backendHints / backendClass` 是宿主侧概念**

两层都保留，但不要混着给功能件作者看。

---

## 3. 全局 AI 配置：用户配一次，功能件直接调用

这是这次必须补上的核心。

### 3.1 为什么一定要有全局 AI 配置

如果没有全局配置，那么每个功能件都要自己处理：

- base URL
- API key
- model
- timeout
- provider 兼容性

这会直接导致：

1. 敏感信息散落在各个功能件里
2. 功能件作者重复造轮子
3. 用户切换模型时要逐个功能件重配
4. 安全边界非常差

所以必须改成：

- **用户在宿主里统一配置一次**
- **功能件只管发起 Chat 请求**

### 3.2 全局 AI 配置放在哪里

默认应放在：

- Android 输入法宿主设置

Windows 端可以有自己的本地配置。

但主线必须是：

- **Android-first**
- **每台设备各自持有自己的 AI 配置**
- **不要把 Android 主线设计成默认读取 PC companion 上的 AI 配置**

后面如果要做配置同步，可以再加：

- 加密导入导出
- 账号同步

但这不是 MVP 前提。

### 3.3 全局 AI 配置至少包含什么

最少需要这些字段：

```json
{
  "chat": {
    "enabled": true,
    "providerType": "openai-compatible",
    "baseUrl": "https://api.example.com/v1",
    "apiKeyRef": "keystore://ai/default",
    "model": "deepseek-chat",
    "timeoutMs": 15000,
    "extraHeaders": {},
    "maxContextChars": 12000
  }
}
```

这里最重要的约束是：

- `apiKey` 不直接给功能件
- 宿主只暴露 `available / unavailable / reason`
- 真实密钥只放在宿主安全存储里

### 3.4 功能件如何使用全局 AI 配置

功能件不需要传：

- base URL
- API key
- model 认证信息

功能件只需要：

```js
const result = await client.ai.chat({
  prompt: "根据聊天内容生成 3 条简短回复",
  input: { messages },
  format: "json"
});
```

宿主负责：

- 读取全局 AI 配置
- 构造真正的模型请求
- 发起网络调用
- 返回标准化结果

### 3.5 Chat 不可用时怎么处理

不能只返回一个简单的 `false`。

建议返回：

```js
const status = await client.ai.getChatStatus();
```

返回结构至少应包含：

```json
{
  "available": false,
  "reason": "not_configured"
}
```

推荐 reason：

- `ready`
- `not_configured`
- `disabled_by_user`
- `network_unavailable`
- `quota_exceeded`
- `host_error`

如果是 `not_configured`，功能件可以引导用户打开：

- `client.settings.open({ section: "ai" })`

---

## 4. Chat 的设计：安卓优先，直连用户配置的大模型 API

### 4.1 Chat 的定位

Chat 就是功能件的基础 AI 能力。

原则：

- **默认不依赖电脑**
- **默认由 Android host 发起请求**
- **依赖用户在手机端配置好的全局 AI 设置**

这样就能直接在手机上完成：

- 回复生成
- 改写润色
- 翻译
- 摘要
- JSON 提取

### 4.2 Chat 接口

建议只保留一个主接口：

```js
const result = await client.ai.chat({
  prompt: "根据聊天内容生成 3 条简短回复",
  input: {
    messages,
    tone: "friendly"
  },
  format: "json"
});
```

文本输出：

```js
const result = await client.ai.chat({
  prompt: "把这段话润色得更礼貌",
  input: {
    text
  },
  format: "text"
});
```

结构化输出：

```js
const result = await client.ai.chat({
  prompt: "提取待办事项",
  input: {
    text
  },
  format: "json",
  schema: {
    type: "object",
    properties: {
      todos: {
        type: "array"
      }
    }
  }
});
```

### 4.3 Chat 接口形状

```ts
client.ai.chat({
  prompt: string,
  input?: any,
  format?: "text" | "json",
  schema?: any,
  system?: string,
  timeoutMs?: number
}): Promise<{
  text?: string,
  json?: any,
  raw?: any
}>
```

功能件作者只需要关心：

- 任务描述
- 输入
- 输出格式

不要关心：

- OpenClaw 参数
- provider 私有参数
- agent 运行时参数

---

## 5. Agent 的设计：注册制，不是公共 API 制

### 5.1 为什么不能把文件系统 / 微信 / QQ 设计成公共 API

因为这些能力天然不稳定。

例如：

- 今天用户想读微信消息
- 明天用户可能改成 QQ
- 后天可能又变成企业微信

如果把这些直接设计成功能件公共 API，例如：

- `wechat.readMessages`
- `qq.readMessages`
- `file.readText`

那问题就来了：

1. 功能件作者要知道每一种实现差异
2. 平台要维护一堆不稳定的适配接口
3. 日后换宿主、换 agent、换 app，全都要重写

这条路明显不对。

### 5.2 正确做法：Agent 内部自己持有 skills

更合理的做法是：

- 平台只注册 agent
- agent 自己声明和绑定 skills
- agent 自己决定如何访问文件、微信、QQ、浏览器、桌面软件

也就是说：

- **功能件不直接调用文件系统**
- **功能件不直接调用微信 API**
- **功能件不直接调用 QQ API**

功能件只做一件事：

- **调用一个满足目标意图的已注册 agent**

至于这个 agent 内部到底是：

- 调微信 skill
- 调 QQ skill
- 调文件系统 skill
- 调浏览器 skill

这不应该暴露给功能件层。

---

## 6. Agent 注册与能力发现

这是第二个必须补上的核心。

### 6.1 为什么 Agent 不能只注册一个名字

如果注册信息只有：

- `id`
- `title`
- `runner`

那功能件其实还是不知道：

- 这个 agent 能做什么（意图）
- 可能会用到哪类数据访问（例如消息读取/文件读取）
- 风险高不高

所以 agent 注册必须带最少能力元数据。

### 6.2 Agent 注册信息至少包含什么

建议每个 agent 至少声明：

```json
{
  "id": "openclaw-chat-reply",
  "title": "OpenClaw Chat Reply",
  "runner": "pc-companion",
  "available": true,
  "intents": ["chat.reply", "message.reply.with-history"],
  "dataAccess": ["messaging.read", "filesystem.read"],
  "inputSchema": "agent://schemas/reply-input",
  "outputSchema": "agent://schemas/reply-output",
  "riskLevel": "medium",
  "requiresConfirmation": true
}
```

最关键的字段是：

- `id`
- `runner`
- `available`
- `intents`
- `dataAccess`
- `riskLevel`
- `requiresConfirmation`

### 6.3 这里的 dataAccess 是做什么用的

这里的 `dataAccess` 不是给功能件直接调用的 API。

它的作用是：

- 让宿主做能力发现
- 让宿主做缺失依赖检查
- 让 UI 做风险提示
- 让用户知道这个 agent 可能会用到哪些能力

也就是说：

- **功能件只看到高层摘要（intent / runner / dataAccess / 风险）**
- **skills / tools 的细节默认只在宿主内部（或诊断面板）可见**

### 6.4 Agent 的 availability 不能只用布尔值

同样不能只给一个 `available: true/false`。

建议至少返回：

- `ready`
- `not_registered`
- `runner_offline`
- `missing_dependencies`
- `missing_auth`
- `requires_companion`
- `disabled_by_user`

### 6.5 Agent 注册表的边界：发现元数据，不暴露 connector 平面

Agent 注册表的职责必须保持克制。

宿主注册表应该只负责：

- 记录 agent id、runner、intent、availability、riskLevel（以及高层 dataAccess 摘要）
- 告诉功能件“有哪些 agent 可选”
- 告诉宿主“这次应该路由到哪个 runner”

不应该继续膨胀成：

- 功能件直连 PC 的 connector 协议
- runner profile / channel / session bus 抽象
- skills 的远程执行 API 面向功能件开放

换句话说：

- **功能件看到的是 agent 元数据**
- **宿主内部维护的是 agent -> runner 的映射**
- **PC companion 只是某些 agent 的执行位置，不是功能件编程模型的一部分**

这样功能件和宿主 UI 才能正确降级。

---

## 7. Agent 调用模型：优先按 intent，不要默认绑死 agentId

这一点必须修正。

如果功能件直接写：

```js
await client.ai.runAgent("openclaw-chat-reply", input)
```

那功能件还是被绑死到某个 agent 名字上了。

更合理的默认模式应当是：

```js
const agents = await client.ai.listAgents({
  intent: "chat.reply"
});
```

```js
const result = await client.ai.runAgent({
  intent: "chat.reply",
  input: {
    context,
    task: "根据上下文生成回复，并在必要时读取最近消息"
  }
});
```

宿主负责：

- 在已注册 agent 里选择满足 intent 的 agent
- 检查 agent 当前 availability
- 检查依赖 skills 是否满足

### 7.1 什么时候才允许直接传 agentId

只有在这些场景下，才适合直接指定 `agentId`：

- 用户手动选了某个 agent
- 功能件是面向单一私有环境
- 调试或研究模式

默认主线不应强依赖具体 agentId。

---

## 8. Agent 的运行位置

Agent 可以有两类：

### A. Android Agent

适用：

- 纯 HTTP agent
- 纯云端 agent
- 不依赖电脑本机资源的 agent

### B. PC Companion Agent

适用：

- 依赖电脑文件系统
- 依赖微信 / QQ / 浏览器 / 桌面软件
- 依赖电脑本地 agent runtime

所以 Agent 本身不是“必须跑在电脑上”。
而是：

- **能在 Android 跑的 agent，就在 Android 跑**
- **只有必须依赖电脑资源的 agent，才跑到 companion**
- **companion 是补位 runner，不是默认执行面**

---

## 9. 功能件层到底应该知道什么

功能件层只需要知道三件事：

### 9.1 Chat 是否可用

```js
await client.ai.getChatStatus();
```

### 9.2 当前有哪些满足目标 intent 的 agent

```js
await client.ai.listAgents({
  intent: "chat.reply"
});
```

### 9.3 如何按 intent 运行 agent

```js
await client.ai.runAgent({
  intent: "chat.reply",
  input: {...}
});
```

功能件不应该直接知道：

- 微信 skill 的名字
- QQ skill 的名字
- 文件系统接口长什么样
- 浏览器接口长什么样

这些都属于 agent 内部实现。

---

## 10. 网络、Chat、Agent 三者的关系

现在整个模型可以收敛成三层：

### 10.1 普通网络能力

```js
client.fetch()
```

默认 Android 本地执行。

### 10.2 基础 AI 能力

```js
client.ai.chat()
```

默认 Android 本地执行，调用用户在手机端配置好的全局 AI 设置。

### 10.3 高级自动化 / skills 能力

```js
client.ai.runAgent()
```

由宿主侧已注册 agent 来完成，可能跑在 Android，也可能跑在 PC companion。

这样层次就清楚了。

---

## 11. 还必须提前说好的点

这些是最容易被忽略、但不提前约定就一定会出问题的。

### 11.1 权限与用户确认

如果 agent 会：

- 读消息
- 读文件
- 调桌面软件
- 发请求到企业系统

那必须支持：

- 风险等级
- 用户确认
- 最少权限提示

### 11.2 上下文范围

功能件发给 Chat / Agent 的上下文必须可控。

至少要明确：

- 当前输入框文本
- 选区文本
- 最近消息摘要
- persona / memory

分别哪些默认可发，哪些需要额外授权。

### 11.3 异步任务与取消

`chat()` 可以是短请求。

但 `runAgent()` 很可能不是。

所以至少要有：

- 任务中状态
- 取消
- 超时
- 失败原因

否则一旦 agent 超时，输入法体验会很差。

### 11.4 成本与配额

Chat 和 Agent 都可能烧钱。

宿主至少要能控制：

- 默认超时
- 单次最大输入大小
- 单次最大推理步数
- 每日或每会话预算

### 11.5 版本兼容

Agent 注册时必须带版本信息。

否则以后：

- skill 升级
- runner 升级
- schema 变更

会直接把功能件调用打崩。

### 11.6 离线与降级

如果：

- Chat 未配置
- 网络断开
- companion 不在线
- agent 缺依赖

功能件应该怎么降级，这件事要提前想清。

---

## 12. 对当前仓库最现实的落地

如果现在开始做代码，我建议 AI 侧先做这些：

1. SDK 增加 `client.ai.chat()`
2. SDK 增加 `client.ai.getChatStatus()`
3. SDK 增加 `client.ai.listAgents(filter)`
4. SDK 增加 `client.ai.runAgent(options)`
5. Android host 增加全局 AI 配置存储
6. Chat 默认读取 Android 本地全局 AI 配置
7. 宿主支持 Agent 注册表
8. Agent 注册表至少返回 intents / dataAccess / availability / riskLevel
9. Companion 只承接那些必须依赖电脑资源的 Agent

先别做：

- `host.invoke()` 公共能力体系
- connector / channel / runner profile 抽象
- 一堆文件 / 微信 / QQ 的公共 API
- 复杂 capability plane

---

## 13. 最终判断

当前阶段，最清楚的 AI 接入方式就是：

- **Chat 和 Agent 分开**
- **Chat 依赖宿主全局 AI 配置，功能件不碰密钥**
- **Android 是默认 AI 执行面；PC companion 只作为少数 agent 的补位 runner**
- **Agent 采用注册制，并显式声明 intents / dataAccess / availability（skills/tools 细节只在宿主内部维护）**
- **功能件优先按 intent 发现和调用 agent，而不是默认绑死某个 agentId**
- **文件系统 / 微信 / QQ / 浏览器这些，不作为功能件公共 API 暴露，而是放进已注册 agent 的 skills 里**

所以最终功能件层只需要理解这几件事：

- `client.fetch()`
- `client.ai.chat()`
- `client.ai.getChatStatus()`
- `client.ai.listAgents()`
- `client.ai.runAgent()`

这样既清楚，也不会把敏感信息和未来的适配复杂度压到功能件作者头上。
