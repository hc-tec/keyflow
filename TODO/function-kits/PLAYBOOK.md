# Function Kit 制作流程总手册（Playbook）

> 编码：UTF-8  
> 目标：把“做什么 / 怎么做 / 怎么验收 / 怎么推广 / 怎么维护 SDK 文档”整理成一套可复用流程。  
> 重要输入：`product-thinking/doubao-thread-wce998b8e58c59ca0.md`（核心材料，含大量场景与宣发策略）。  

## 0. 先看这些索引（省时间）

- 选题与优先级：`TODO/function-kits/IDEA_BANK.md`
- 新功能件写之前先填：`TODO/function-kits/BRIEF_TEMPLATE.md`
- 宣发与增长：`TODO/function-kits/LAUNCH_PLAYBOOK.md`
- 功能件目录与约定：`TODO/function-kits/INDEX.md`
- 功能件开发者手册（WebView 约束/打包/导包/Bindings/结果呈现/生命周期）：`TODO/function-kits/DEVELOPER_GUIDE.md`
- Host Bridge 协议：`TODO/function-kits/host-bridge/README.md`
- Runtime SDK（浏览器式 UI 统一接法）：`TODO/function-kit-runtime-sdk/README.md`
- Runtime SDK 文档索引（维护入口）：`TODO/function-kit-runtime-sdk/docs/INDEX.md`
- IME 端到端/验证/脚本索引：`TODO/ime-research/notes/INDEX.md`
- Doubao 产品设计“可执行提炼”：  
  - `product-thinking/20260327_doubao_thread_product_design_extracted.md`  
  - `product-thinking/20260327_functionkit_next_product_design_from_doubao_thread.md`

## 1. 我们在做什么（避免心智漂移）

一句话：我们不是“带 AI 的输入法”，而是在做 **以输入法为无摩擦入口的插件化表达增强层（Function Kit Platform）**。

Function Kit 的定义（按本仓库落地）：

- **像浏览器插件**：轻量、可插拔、按需启用，用完即走。
- **像输入法能力的延伸**：在“表达链路”里（复制→粘贴、编辑→改写、发送前最后一秒）完成闭环。
- **UI 形态**：浏览器式面板（WebView2 / Android WebView），统一通过 `FunctionKitRuntimeSDK.createKit(...)` 接宿主。
- **通信形态**：统一 Host Bridge envelope（见 `TODO/function-kits/host-bridge/README.md`）。

## 2. 两条红线 + 「1-1-1」硬约束（所有功能件必须服从）

两条红线（来自核心产品思考的共识）：

1. **不要把“功能件商店/管理页”当日常入口**：商店只负责发现/安装/管理；日常调用必须在输入流里 1 步完成。
2. **默认极简，按需扩展**：默认只预装/暴露少量尖刀功能件；其余由用户自主启用/固定/授权。

「1-1-1」硬约束：

- **1 步唤起**：`/` 斜杠、工具栏按钮、选中文本菜单、复制后 chip（用户点）四选一或并行提供。
- **1 步执行**：打开就给“最优默认”，用户点一次就出结果；复杂配置放到“高级”，默认不出现。
- **1 步返回**：执行完能一键回到输入，且不阻塞继续输入。

## 3. 能力分层（决定“这功能件到底能不能做”）

优先做“输入法载体独有/体验碾压”的能力，否则独立 App/AI 工具会更好用：

- **Clipboard 闭环**：复制→处理→一键插入/替换（零切换）。
- **App-aware 适配**：同一段内容，在不同宿主场景（聊天/邮件/表单/工单）一键变成“合适的格式/语气/长度”。
- **Send intercept**：发送/提交前最后一道防线（合规/情绪/敏感信息），必须可解释、可忽略、默认克制。
- **输入过程上下文（可选/谨慎）**：`input.observe.best_effort` 这类动态能力只做“主动触发做不到”的真痛点，且默认关闭。

把“能做什么”映射到 SDK 能力（权限名）：

- 权限与映射：`TODO/function-kit-runtime-sdk/docs/CAPABILITIES_AND_PERMISSIONS.md`
- 安全红线：`TODO/function-kit-runtime-sdk/docs/SECURITY_MODEL.md`

### 3.1 不同“技能组合”的功能件类型（选对类型，少走弯路）

这里的“技能”指你在功能件里实际要用到的能力组合（纯本地 / 网络 / AI / Agent / 拦截等），不是 UI 框架。

- **纯本地文本处理**  
  - 适合：格式清理、标点/空格规范化、模板/短语、简单脱敏  
  - 权限：`context.read` + `input.insert|replace` + `storage.read|write`（可选）  
  - 参考：`TODO/function-kits/quick-phrases/`
- **网络/文件闭环**  
  - 适合：文件选择、上传、用公开 API 做查询（必须合规、可替换、可降级）  
  - 权限：`network.fetch`、`files.pick`  
  - 参考：`TODO/function-kits/file-upload-lab/`
- **AI 轻调用（request）**  
  - 适合：改写/总结/翻译等“单步生成”，要求不阻塞输入、可取消/可忽略  
  - 权限：`ai.request`（通常还会配 `tasks` 体验）  
  - 参考：`TODO/function-kits/runtime-lab/`
- **Agent 工具调用（runAgent + skills/tools）**  
  - 适合：需要工具链/多步规划/外置执行的复杂任务（通常异步）  
  - 权限：`ai.agent.run`  
  - 参考：`TODO/function-kits/chat-auto-reply/`（含 `skills/`、`tools/`、schema 与 fixtures）
- **发送拦截（send intercept）**  
  - 适合：发送前最后一秒的风险提示/确认（合规/情绪/敏感信息）  
  - 权限：`send.intercept.ime_action`  
  - 注意：必须可解释、可忽略、默认克制

## 4. 制作流程（从想法到上线的一条龙）

### 4.1 选题定案（先收敛，不写代码）

1. 从 `TODO/function-kits/IDEA_BANK.md` 里挑 1 个候选
2. 用 `TODO/function-kits/BRIEF_TEMPLATE.md` 写一页 Brief（必须包含：触发入口、权限、数据边界、DoD、指标）
3. 用「1-1-1」和“输入法独有性”做压力测试：如果做不到，立刻换题

> 你确定要做什么之后，我再开始写功能件代码（按你的要求）。

### 4.2 创建功能件骨架（目录/清单/图标/测试夹具）

最低目录约定见 `TODO/function-kits/INDEX.md`。建议从现有样板复制起步：

- 纯本地样板：`TODO/function-kits/quick-phrases/`
- AI/候选渲染样板：`TODO/function-kits/chat-auto-reply/`
- 最近改动回归样板：`TODO/function-kits/runtime-lab/`
- 文件/网络闭环样板：`TODO/function-kits/file-upload-lab/`

### 4.3 写 UI（只写业务，不写协议）

强制要求：

- UI 只依赖 `FunctionKitRuntimeSDK.createKit(...)`
- 不允许在 kit 里手写平台私有桥（WebView2/Android 注入对象）
- 不依赖 DOM Storage（隔离与安全原因，持久化走 `kit.storage.*`）

参考：

- 工程落地手册（WebView 约束/零构建导包/Bindings/结果呈现/生命周期）：`TODO/function-kits/DEVELOPER_GUIDE.md`
- SDK 入口：`TODO/function-kit-runtime-sdk/README.md`
- API 设计文档（浏览器插件式）：`TODO/function-kit-runtime-sdk/docs/BROWSER_EXTENSION_STYLE_API_V2.md`

### 4.4 权限与数据边界（先做最小可用）

实践规则：

- **最小权限**：只申请这次功能必须的能力（否则用户不信任、也会影响上架/审核逻辑）。
- **本地优先**：能离线做就离线做；需要云端也要有弱网/失败降级，不阻塞输入。
- **显式写回**：最终写回输入框必须是用户点击 `insert/replace`（或明确的发送拦截确认）。

### 4.5 验收与回归（让“能用”变成“可持续迭代”）

至少要覆盖：

- Host Bridge 握手、权限、context、渲染、写回（insert/replace）
- 错误与恢复：`permission.denied` / `bridge.error`
- 弱网/超时：`network.fetch`、`ai.request` 的超时与失败
- Android 资产打包：不要使用以下划线开头的共享目录名（历史坑：`_shared` 会被忽略）

相关工具与脚本索引：

- `TODO/ime-research/notes/INDEX.md`

## 5. Definition of Done（DoD）清单

- 1 步入口可达（至少一个：`/`、工具栏、选中菜单、复制后 chip）
- 1 步执行（默认最优方案）+ 1 步返回（不阻塞输入）
- 权限最小必要，且 UI 能明确展示“拿了什么/没拿到什么”
- 完整错误路径可恢复（可取消/可忽略/可重试）
- 有最小测试资产（fixtures 或 contract runner 覆盖关键消息序列）
- 文档齐：kit `README.md` + UI `README.md` + Brief（落到 `TODO/function-kits/`）

## 6. 常见坑（写之前先看一遍）

- Android 资产打包会忽略以下划线开头目录：共享资源请用 `shared/`，不要用 `_shared/`
- UI 里不要自己维护 `replyTo`：优先用 `createKit()` 的高层 API；必要时用 `kit.raw`
- 不要把功能做成“弹窗怪”：默认静默，用户主动触发才出现
- 任何“动态监听”都默认关闭 + 白名单 + 频率上限 + 可解释（否则必翻车）
