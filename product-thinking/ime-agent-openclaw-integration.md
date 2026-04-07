# AI Agent × 输入法：OpenClaw 集成方式、Skills→插件映射与场景设计

> 编码：UTF-8  
> 创建时间：2026-03-21T01:05:00+08:00  
> 关注平台：Windows + Android（优先）  
> 上下文来源：  
> - 你在 PDF 里的追问（“能不能把 OpenClaw 当机架/机架生态？”）：`product-thinking/20260320_pdf_text_extract_ime-cross-platform_raw-v1.md`（约 p20 起）  
> - OpenClaw 公开仓库/文档（用于理解“它到底怎么集成、Skills 怎么组织”）：`TODO/ime-research/repos/openclaw`（本地克隆，忽略入 git，commit `93fbe26adbbcf15fec0b2ddd395478e9100de41e`）  

## 0. 先把“我忘了什么”说清楚（我的主见）

我之前写的 `product-thinking/ime-plugin-cross-platform.md` 把“插件”主要当成 **Wasm/JS 运行时里的可控扩展**，但对你最早强调的 **AI Agent 入口 + Skills 生态（OpenClaw）** 没有单独拉出来论证。

这会导致两个问题：

1. **插件被我写成了“功能扩展”，而不是“意图→计划→执行”的工作流系统**（也就是你说的 Agent 魔力）。
2. **没把 Skills 这种“自然语言能力封装”映射进插件体系**：你关心的是“能不能复用生态/标准”，而不仅是“能不能跑代码”。

下面我补上这块，并把它落到 **Windows + Android 可做的架构** 与 **可验证的场景** 上。

---

## 1. 从你最初的讨论里提炼出来的关键判断（别再跑偏）

在 PDF 的对话里，你问的是：

- OpenClaw 把入口放在聊天软件里，输入法是不是也能成为同类入口？  
- 能不能直接把 OpenClaw 当“机架”，复用它的 Skills 生态？

当时对话里已经给出了一个非常重要的结论（我认可并沿用）：

> **不要把 OpenClaw 直接塞进输入法当“机架/核心基座”**；  
> 更合理的是把它当“互补系统/外置大脑”，输入法保留实时轻量，复杂任务异步派发。

我把它翻译成工程语言就是：

- **输入法 = 快系统（10~50ms 交互）**
- **Agent/Skills = 慢系统（秒级推理/多步执行）**
- 正确的耦合方式是：**慢系统只走“显式触发 + 异步回填 + 可撤销/可审计”**

---

## 2. OpenClaw 集成到底“怎么工作”（你要的事实层，按“只用 Agent”来讲）

OpenClaw 的核心不是“一个模型”，而是一套 **Agent（执行）+ Skills（能力包）** 为中心、并可选配 **Gateway（网关）/Channel（入口适配）** 的组合。

- **Agent**：负责“意图理解→计划→工具调用→结果输出”。
- **Skills**：把能力与用法沉淀成可复用的技能包（目录 + `SKILL.md`），教会 Agent 何时/如何使用工具（以及边界）。
- **Gateway/Channel**：是“多入口”时代的配套设施；但你完全可以不接它们——因为**你的输入法本身就是入口**。

对你来说最关键的是：你不需要 OpenClaw 的 Channel 体系。  
你要的是：**输入法（入口/UI）↔ OpenClaw（Agent+Skills）** 之间有一个稳定的“请求-响应”接口。

### 2.1 你关心的“集成抓手”是什么（对 IME 最有用的部分）

从集成角度看，你可以把 OpenClaw 当作一个“本地/自托管的 Agent 服务”。它最适合被输入法消费的特征是：

- **常驻服务**：输入法不需要自己承担 Agent 的生命周期。
- **单端口复用**：同一端口同时承载 WebSocket 控制/RPC + HTTP API + 控制 UI（这类模式很适合做“外置大脑”）。
- **默认只绑定回环（loopback）+ 必须鉴权**：这让“键盘本体不暴露公网服务”成为默认安全姿态。

工程上，你可以把它理解成：

- Windows：IME（快） ↔ 本地 OpenClaw（慢）
- Android：IME（快） ↔（同机或远端）OpenClaw（慢）

> 注：即使你最终仍然选择“跑一个 Gateway 进程”，也只是把它当成 OpenClaw 的运行载体；你不需要接入任何聊天渠道或外部 Channel。

### 2.2 Skills 系统的“硬事实”（这部分直接抄作业就行）

下面这些并不是我臆想，而是 OpenClaw 自己在文档与仓库里明确固化的约定（本地可查）：

1. **Skills 是目录 + `SKILL.md`**：每个 Skill 目录里用 `SKILL.md`（YAML frontmatter + 说明）来“教会智能体如何用工具”。  
   例子：`TODO/ime-research/repos/openclaw/skills/summarize/SKILL.md`
2. **Skills 的加载位置与优先级是明确且可叠加的**：  
   - 内置 Skills（随安装包发布）  
   - `~/.openclaw/skills`（托管/本地）  
   - `<workspace>/skills`（工作区）  
   - 以及 `skills.load.extraDirs`（额外目录，最低优先级）  
   这套优先级非常适合“团队共享 + 个人覆盖 + 项目覆盖”的生态形态。
3. **门控（gating）是 Skills 生态能规模化的前提**：`SKILL.md` frontmatter 里允许写 `metadata`（要求单行 JSON），并通过 `metadata.openclaw.requires` 做加载时过滤：  
   - `os`（darwin/linux/win32）  
   - `bins` / `anyBins`（PATH 中必须存在的二进制）  
   - `env`（必须具备的环境变量或配置项）  
   - `config`（`openclaw.json` 里必须为真的开关）  
   例子：`TODO/ime-research/repos/openclaw/docs/zh-CN/tools/skills.md`
4. **“斜杠命令”是 Skills 变成入口的关键机制**：frontmatter 支持 `user-invocable`，并支持 `command-dispatch: tool` 直接把命令绕过模型、调度到确定性工具（非常适合“输入法里那些必须稳定/低风险”的技能）。
5. **插件可以携带 Skills**：通过 `openclaw.plugin.json` 的 `skills` 字段列出相对路径的 skills 目录，启用插件时自动加载进技能快照与优先级体系。  
   文档：`TODO/ime-research/repos/openclaw/docs/zh-CN/plugins/manifest.md`、`TODO/ime-research/repos/openclaw/docs/zh-CN/tools/skills.md`

---

## 3. Skills 如何适配进“输入法插件系统”（我建议的映射）

### 3.1 概念统一：Plugin vs Skill 的职责边界

我建议你把两者明确区分：

- **Plugin（插件）**：可执行代码/服务，提供**稳定 API**（可版本化、可鉴权、可限权）。  
  例：`translate(text)->text`、`create_task(title,due)->taskId`、`save_note(text,tags)->url`
- **Skill（技能）**：面向 Agent 的“说明书 + 编排提示”，把 **何时用、怎么用、注意什么** 写清楚。  
  它可以调用一个或多个 Plugin（工具），也可以只做纯文本生成（但最好仍有结构化输出约束）。

一句话：**Plugin 是“手”，Skill 是“使用手的方法”。**

这能解释为什么 OpenClaw 的 `SKILL.md` 形式很重要：它本质上是“把能力变成生态”的载体。

### 3.2 我建议的最小统一格式（兼容 OpenClaw 的思路）

为了让 Skills 能“无痛进入”你的输入法插件系统，我建议你的插件包同时包含两层信息：

1. **机器可验证的 manifest（强约束）**  
   - `id/version/api_version/permissions/triggers`  
   - `tools[]`：每个 tool 的输入/输出 JSON Schema（强类型）
2. **人类可读 + Agent 可读的 SKILL.md（软约束）**  
   - 用自然语言讲场景、边界、例子、失败兜底  
   - 但必须明确：输出必须符合某个 schema（否则键盘 UI 没法可靠渲染）

这样做的好处是：

- 你可以**兼容 OpenClaw 的生态表达方式**（SKILL.md 的作者体验很好）。
- 同时避免“纯 prompt 技能”不可控：IME 端只接受 schema 产物。

### 3.2.1 直接借用 OpenClaw 的几个“成熟约定”（强烈建议）

OpenClaw 对 Skills 的组织方式，其实已经把你要踩的坑踩过一遍了，最值得你直接借用的是：

- **技能目录约定**：一个 skill = 一个目录，里面至少一个 `SKILL.md`（带 YAML frontmatter）。
- **多层加载与优先级**：全局技能包 + 工作区技能包 + 本地覆盖（支持团队/个人差异化）。
- **加载时 gating**：根据 OS、依赖二进制、所需 env/config 决定是否对当前设备启用（否则“装了但不能用”会很痛）。
- **插件可携带 skills**：插件不仅带可执行代码，也能带 skills 目录，让“能力 + 使用说明”作为一个发布单元传播。

> 这也意味着：你未来的“输入法插件市场”，本质会变成“插件（工具）+ skills（用法）”的组合市场，而不是纯代码商店。

### 3.2.2 把 OpenClaw 的门控/命令调度映射到 IME（落地建议）

我建议你把 OpenClaw 的两项能力“原封不动”搬到输入法插件体系里：

- **门控（requires）**：把 `requires.bins/env/config/os` 翻译成 IME 世界的门控条件：  
  - `os`：Android/Windows  
  - `bins`：本地服务是否已安装（例如离线 ASR 引擎、OCR 引擎）  
  - `env/config`：用户是否授权了网络、是否开启了“允许将选中文本发送给 Agent”、是否绑定了某个账号等  
  这样你就能避免“装了但是永远失败”的技能体验。
- **命令调度（command-dispatch: tool）**：对“确定性技能”（模板/片段/格式化/单位换算/金额大写）直接走工具，不让模型参与。  
  这会显著降低幻觉风险，也更符合输入法的“稳定性底线”。

### 3.3 “把 OpenClaw Skills 直接复用”有两种模式（选 B 更现实）

**模式 A：把 OpenClaw 当机架（强耦合）**  
输入法内置/捆绑 OpenClaw Runtime + Gateway + Skills。  
我不推荐：重、难升级、风险面巨大、而且 Windows/Android 的常驻稳定性会被拖垮。

**模式 B：把 OpenClaw 当外置大脑（弱耦合，推荐）**  
输入法只实现一个“Agent Bridge 插件”：

- UI：在键盘工具栏提供“Agent/Skills 面板”
- 触发：用户显式选择 skill 或输入 `/` 命令
- 传参：仅发送用户明确同意的上下文（选中文本/当前句/手动粘贴）
- 回填：返回 `suggestions/actions`，用户点一下才执行敏感动作

这样你既能复用 Skills 生态，又不把输入法变成“高权限自动化平台”。

### 3.4 一个很实用的“中间态”：你的插件体系兼容 OpenClaw/Codex/Claude 的 bundle 结构

OpenClaw 生态里已经出现了一个趋势：**插件/技能包开始兼容多种宿主的 bundle 布局**（例如 Codex/Claude/Cursor 的插件目录结构）。

对你这类“想做生态”的产品来说，这是黄金机会：

- 你可以把自己的输入法插件包设计成一种 bundle（例如 `.ime-plugin/`），但内部同时支持：
  - `skills/<name>/SKILL.md`（AgentSkills 风格）
  - `manifest.json`（你自己的强约束 schema）
  - `runtime/`（Wasm/JS/native tool）

这样未来就有可能出现“一份能力包，多入口复用”：  
同一个技能既能在聊天里用（OpenClaw），也能在键盘里用（你的 IME）。

---

## 4. 场景的魔力：把 Agent/Skills 放进输入法的“高频瞬间”

我把“输入法 Agent”能成立的场景，压成 3 个可通用、可跨端、可持续维护的主场景（每个都能自然承载 Skills 生态）：

### 场景 1：选中文本 → 一键变换（最通用的 Agent 落点）

触发：
- 用户在任意 App 选中一段文字（或输入框内的一句）
- 打开键盘工具栏 → 选择技能：`润色/翻译/总结/改写为邮件`

为什么是“魔力”：
- 输入法是“原位入口”，用户不需要切 App
- Agent 的延迟可被接受（因为这是显式动作，不是每键预测）

关键产品点：
- 输出必须是 **可撤销** 的（替换前保留原文）
- 给“多候选”，而不是单一结果（降低幻觉伤害）

### 场景 2：`/` 命令面板 → 结构化动作（把技能变成工作流）

触发：
- 用户输入 `/todo 明天 10 点 和张三对齐需求`
- 或 `/meet 下周二下午 2 点 30 分 讨论输入法插件`

Agent 做的事：
- 解析自然语言 → 调用 `calendar.create_event` / `task.create`
- 回填确认文本/链接到输入框（让用户“看得见发生了什么”）

为什么是“魔力”：
- 用户的意图本来就在“打字那一瞬间”
- 你把“想法→落地”路径从 30 秒缩到 3 秒

边界：
- 敏感操作必须二次确认（尤其是跨账号/跨租户）

### 场景 3：知识捕获 → 个人记忆（让 Skills 长期有复利）

触发：
- 用户在聊天/邮件里输入一段关键结论
- 键盘点一下“存为笔记/存为要点”

Agent 做的事：
- 自动打标签、抽取要点、关联到项目/联系人
- 下次用户输入同一联系人/同一项目时，在键盘工具栏提示相关记忆（但必须克制、可关闭）

为什么是“魔力”：
- 这是“输入法作为神经系统”的最贴近现实版本：**不自动执行，只做记忆与建议**

---

## 5. 输入法场景下，Agent 最容易犯的错 & 你需要的硬约束

1. **提示词注入/上下文投毒**：输入法拿到的文本来自任何 App，本质上都是不可信输入。  
   - 对策：敏感工具默认禁用；工具调用必须显示“将要做什么”；可配置 allowlist。
2. **错误不可见**：Agent 很容易“看起来合理但其实错”。  
   - 对策：多候选 + 可撤销 + 引用来源（至少显示“基于哪些文本片段生成”）。
3. **实时性幻觉**：想把 Agent 放进每键预测会直接毁掉手感。  
   - 对策：Agent 只走慢路径；快路径仍由传统引擎/词典/小模型承担。

---

## 6. 对你的插件系统文档的“补丁”（我建议这样改）

为了把 Agent/Skills 明确纳入体系，我建议你把整体架构写成三层：

1. **IME Host（快）**：只做输入与 UI，绝不阻塞
2. **Plugin Runtime（可控扩展）**：Wasm/JS，提供工具（tools）与面板（panel）
3. **Agent Gateway（慢）**：OpenClaw/自研 Agent/云端，负责计划与编排

下一步最务实的工程闭环：

- 先实现一个跨端的 `Agent Bridge` 插件（只做“选中文本→改写建议→替换”）
- 同时定义“工具 schema”与“技能说明（SKILL.md）”的最小规范

---

## 7. 一个“技能→插件”的具体例子（避免只停留在口号）

假设你要做一个最通用的技能：`polish`（润色/改写）。

### 7.1 插件（工具）manifest（强约束）

你可以把它定义成“文本变换工具”，输入输出都强类型：

- 输入：`{ text, tone?, length? }`
- 输出：`{ candidates: [{ title, text }] }`

IME 只关心：能不能把 `candidates` 可靠渲染出来、能不能一键替换/撤销。

### 7.2 Skill（说明书）SKILL.md（软约束）

SKILL.md 负责告诉 Agent：

- 什么时候该建议用户用这个技能（例如“写邮件/写汇报/写回复”）
- 输出必须是 JSON（严格遵循 schema）
- 如果输入文本包含敏感信息，必须先提示用户确认再调用网络（或优先离线模型）

这样，你就把“能力”拆成了：

- **插件工具**：可审计、可限权、可测
- **技能说明**：可迭代、可调优、可生态化
