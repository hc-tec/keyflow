# KitStudio：Function Kit / IME 调试器（类似微信开发者工具）的架构与路线

> 编码：UTF-8  
> 创建时间：2026-03-30T00:00:00+08:00  
> 目标：在不依赖真机 IME 的前提下，让功能件（Function Kits）能在桌面端“像小程序一样”跑起来，并提供可观测、可复现、可回放的调试体验。

## 0. 背景：为什么必须做“开发者工具”

我们现在的现状类似微信小程序：

- 小程序 UI 看起来像网页，但 runtime 不是浏览器；需要宿主提供上下文、权限、存储、输入提交等能力。
- 我们的 Function Kit UI 也是浏览器式（WebView2 / Android WebView），但它依赖 IME 宿主上下文 + Host Bridge 协议 + Runtime SDK。

如果每次开发/调试都在真实 IME + 真机上跑：

- 反馈慢（安装、切换 App、复现输入焦点、触发桥接消息）
- 定位困难（“到底宿主发了什么 / UI 发了什么”缺少统一抓包）
- 可复现性差（context/permission/storage 都是现场态，不稳定）

结论：要做一个“像微信开发者工具”的东西，把 **运行时模拟器** 与 **桥接抓包/回放** 做成一等公民。

## 1. 现有项目已经具备的“可复用地基”

当前项目并不是从 0 开始，已经有几块关键基建（路径见本文末尾）：

1) **统一协议**：Host Bridge envelope + JSON schema  
2) **浏览器侧统一 SDK**：`function-kit-runtime-sdk`（支持 request/response、permissions、context、storage、network、ai、composer bridge、tasks…）  
3) **Windows WebView2 宿主 PoC / TestHost**：已经能跑真实 kit UI，并做握手、上下文、候选写回、fixture/contract 回放  
4) **Host Service**：可在 PC 上提供统一 HTTP 服务给宿主调用（目前覆盖 `chat-auto-reply` 渲染链路并驱动 OpenClaw）

这些说明：我们缺的不是“再写一套协议/SDK”，而是缺一个 **开发体验容器**（DevTools）把它们串成“可调试系统”。

## 2. KitStudio 的目标定义（对标微信开发者工具）

### 2.1 必须具备（MVP）

- **Kit 运行**：加载本地 Function Kit（类似“打开小程序项目”）
- **Host 模拟器**：可编辑 context/permissions/storage/输入目标，驱动 kit UI
- **Bridge Inspector**：抓取 UI↔Host envelopes，支持过滤/搜索/导出
- **可复现**：保存/加载一次会话的 context + permissions + storage + envelopes（用于回放）

### 2.2 进阶能力（Phase 1~3）

- **Contract Runner（录制/回放）**：复用现有 contract 思路，做到“回放 fixture → UI 快照/候选插入断言”
- **Network/AI/File 虚拟化**：
  - `network.fetch`：本地代理 + 可注入 mock 响应 + 记录/重放
  - `ai.*`：对接本地 Host Service / OpenClaw / mock-agent
  - `files.pick`：桌面文件选择 + bodyRef（大文件不走 bridge 消息）
- **Remote Attach（真机/真实 IME）**：从 Android/Windows 宿主侧把 envelope 打到调试器里（类似“真机调试”）
- **安全沙箱**：强约束 kit 只能走 host bridge，不允许任意远程导航/下载/权限请求

## 3. 架构：分层把“可控性”和“可观测性”做实

一句话：**KitStudio = Runner + Host Core + Debugger UI**。

### 3.1 Runner（运行容器）

目标：承载 Function Kit 的浏览器式 UI，尽量与真实宿主一致。

- Phase 0：浏览器 + iframe（最快落地，验证主链路）
- Phase 1：Electron（提供一致的桌面 App 体验，并可集成更强的文件/进程能力）
- Phase 2：对齐 Windows WebView2 / Android WebView 的安全策略（origin、导航限制、权限拒绝）

### 3.2 Host Core（宿主核心）

把“真机 IME 宿主”拆成一组可替换的能力模块：

- `PermissionsStore`：基于 manifest requestedPermissions 授权/拒绝
- `ContextProvider`：可编辑、可快照、可回放（reason/modifiers/preferredTone）
- `StorageStore`：key/value（支持导入导出、隔离不同 kit）
- `CandidatesEngine`：本地 demo / 真实 AI / host-service 三种路由
- `InputTarget`：模拟目标输入框（插入/替换/commitImage）
- `TasksStore`：`task.update` + `tasks.sync`（进度/取消/历史）
- `NetworkProxy`：`network.fetch` 代理与抓包（可注入 mock）
- `FileStore`：`files.pick` + bodyRef 管理

所有模块都只通过 Host Bridge envelope 与 UI 交互，确保一致性与可观测性。

### 3.3 Debugger UI（开发者工具界面）

核心不是“好看”，而是“快定位”：

- Session 面板：kitId/surface/sessionId/hostInfo
- Context 面板：可编辑 + 一键 `context.sync`
- Permissions 面板：manifest requestedPermissions → 勾选授予
- Storage 面板：查看/编辑/导出
- Input 面板：目标输入框（观察 insert/replace 结果）
- Bridge Inspector：时间线 + messageId/replyTo 串联 request/response
- Export：保存会话快照（context/permissions/storage/envelopes）

## 4. 最小可运行原型（Phase 0）怎么做

优先落地一条“能跑 + 能抓包 + 能模拟宿主”的主链路：

1) 本地 HTTP server 同时挂载：
   - `function-kits/`（kit 资源）
   - `function-kit-runtime-sdk/`（浏览器 bundle）
2) devtools 页面用 iframe 加载 kit 的 `ui/app/index.html`
3) server 对 kit HTML 做最小注入：在 kit window 中注入 `FunctionKitHost.postMessage/addEventListener`，把 envelopes 通过 `postMessage` 发给 devtools
4) devtools 侧实现 Host Core 的最小子集：
   - `bridge.ready` → `bridge.ready.ack`
   - `context.request` → `context.sync`
   - `storage.get/set` → `storage.sync`
   - `candidates.regenerate` → `candidates.render`（本地 demo）
   - `candidate.insert/replace` → 更新模拟输入框 + `host.state.update`
   - `ai.request` → `ai.response`（本地 demo）

这条链路的价值：**不改 kit 代码**，也不依赖真机 IME，就能把“宿主↔UI 协议”跑通并可观测。

## 5. 新仓库落点

本项目已初始化一个独立 git 仓库作为 KitStudio 的代码载体：

- `TODO/ime-research/repos/kit-studio/`

它会逐步承接：

- Host Simulator（本地宿主核心）
- Bridge Inspector（抓包/导出/回放）
- 未来 Electron 封装与 Remote Attach

## 6. 相关现有基建路径（便于回溯）

- Host Bridge 协议：`TODO/function-kits/host-bridge/README.md`
- Host Bridge schema：`TODO/function-kits/host-bridge/message-envelope.schema.json`
- Runtime SDK：`TODO/function-kit-runtime-sdk/README.md`
- Windows Function Kit Host PoC：`TODO/ime-research/windows-functionkit-host/README.md`
- Windows IME TestHost：`TODO/ime-research/windows-testhost/README.md`
- Host Service：`TODO/function-kit-host-service/README.md`

