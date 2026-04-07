# Function Kit Task Center（用户任务中心）与 Taskification 现状审计（Android）

> 编码：UTF-8  
> 日期：2026-03-26  
> 状态：DRAFT（等你审核后再动代码）  
> 关联：`TODO/ime-research/notes/20260325_functionkit_async_task_tracking.md`（协议设计稿）

## 0. 你要的结论（先写死）

你提的两点都成立：

1. **所有“面向用户”的异步操作都应该被封装成 Task**：否则没有可观测性、不能取消、没历史、也没统一错误与结果入口。
2. **IME 必须提供一个“任务入口（Task Center）”**：不能把任务只藏在某个 kit 的页面里，否则用户看不到“刚才我点的 AI/网络请求/远端推理到底在干嘛、成功没、结果在哪”。

当前实现已经完成了 Task 的协议与部分落地，但 **Task Center（IME 入口 + 跨 kit 汇总 + 结果查看）仍缺失**。

---

## 1. “面向用户的异步任务”到底指什么

这里建议把“Taskification 的范围”写成可执行的规则，而不是靠感觉：

### 1.1 用户任务（必须 Task）

满足任一条件就必须是 Task：

- 由用户显式点击触发（例如：AI 生成、换一批、远端渲染、发送前拦截执行、文件上传）
- 平均耗时可能超过 200ms（网络/AI/IO/远端）
- 可能失败且用户需要知道失败原因（401/超时/配置缺失/权限拒绝/路由不可达）
- 结果对用户有意义且需要可回溯（例如生成的候选、网络响应、上传后的文件引用）

### 1.2 调试任务（可选 Task）

比如 WebView handshake、kit manifest load、asset sync。这些可以作为 debug-only 的 Task（默认不显示给普通用户），避免任务中心被“噪声任务”淹没。

---

## 2. 当前已实现到什么程度（真实现状）

### 2.1 协议层（Host Bridge + SDK）已具备最小闭环

已存在 message types：

- `task.update`
- `tasks.sync.request` / `tasks.sync`
- `task.cancel` / `task.cancel.ack`

位置：

- Bridge schema：`TODO/function-kits/host-bridge/message-envelope.schema.json`
- Runtime SDK：`TODO/function-kit-runtime-sdk/src/index.js`、`TODO/function-kit-runtime-sdk/src/index.d.ts`
  - SDK 内部有 tasks store（`byId/runningIds/historyIds`），按 `seq` 做幂等合并
  - 提供 API：`kit.tasks.sync()`、`kit.tasks.cancel()`

### 2.2 Android Host 已将关键异步路径“任务化”

宿主侧目前是 **per-kit 的 TaskTracker**，并会在任务生命周期里推送 `task.update`：

- Task tracker：`TODO/ime-research/repos/fcitx5-android/.../FunctionKitTaskTracker.kt`
  - `maxHistory=50`（内存内保留）
  - `buildSyncPayload(surface, includeHistory, limit)`（按 surface 过滤 running/history）
  - cancel 通过 `Future.cancel(true)` 尝试中断（非 100% 可取消）

已接入的用户异步路径（都有 `taskTracker.create/update`，并在结果消息里携带 `taskId`）：

- `network.fetch`：`TODO/ime-research/repos/fcitx5-android/.../FunctionKitWindow.kt`
- `ai.request`（目前仅 `route.kind=host-shared`）：同上
- `candidates.regenerate`（本地 direct-model + 远端 remote render）：同上

此外：

- kit 可发 `tasks.sync.request` 拉取 running/history：`FunctionKitWindow.handleTasksSyncRequest`
- kit 可发 `task.cancel` 请求取消：`FunctionKitWindow.handleTaskCancel`

### 2.3 Kit 侧已有一个“任务面板”用于回归（但它不是 Task Center）

Runtime Lab 已有 Tasks tab，可以 Sync/Cancel，并展示 running/history：

- `TODO/function-kits/runtime-lab/ui/app/main.js`

这能证明协议闭环 OK，但它的问题是：

- 只在某个 kit 里可见
- 只看到“这个 kit + 这个 surface”的任务
- 对普通用户而言，入口太隐蔽，也不符合“系统级任务中心”的直觉

---

## 3. 当前最大缺口（为什么你会觉得“还没做完”）

### 3.1 没有 IME 级 Task Center 入口

现状：任务只能在 kit UI 内看到（如果 kit 自己做了展示）。  
用户视角：我点了 AI/网络/远端推理，没反应或很慢时不知道去哪看。

### 3.2 Task 的可见范围是 “per-kit + per-surface”

现状：`tasks.sync` 的 payload 是按 **kitId + surface** 过滤的（TaskTracker 也按 surface 过滤返回）。  
这不满足“IME 内查询所有任务”的要求。

### 3.3 结果“可查看”仍偏弱

现状：

- Task 有 `result.summary` / `error`，但最终业务结果仍分散在：
  - `ai.response`
  - `network.fetch.result`
  - `candidates.render`
- 如果用户在 Task Center 里点开某条历史任务，应该能看到：
  - 结果摘要（已具备）
  - 关键 payload 的“可复制/可重用”视图（目前没有统一规范）

### 3.4 Task 历史不持久化

现状：TaskTracker 是内存结构，进程被杀/重启后历史会消失。  
对于“用户任务中心”来说，这会让体验不稳定（但可以分阶段做，见后文计划）。

---

## 4. Task Center（IME 入口）应该长什么样

这里给一个“最小可落地”的 Task Center 产品定义，避免过度设计。

### 4.1 入口（IME 内）

建议至少一个入口：

- 工具栏增加一个“任务”图标（例如时钟/列表）
- 放在 More 面板里也行，但**必须可发现**（不要埋太深）

补充入口（可选）：

- 当存在 running task 时，在工具栏显示一个小 badge（红点/数字）
- 点击 badge 直接打开 Task Center 并定位到 running 列表

### 4.2 页面结构（最小版）

- Tab 1：Running
  - 按 `updatedAt` 倒序
  - 每项显示：`kind`、`kitId`（可读 title）、`stage/message`、耗时、取消按钮（若 cancellable）
- Tab 2：History
  - 只保留最近 N 条（比如 50/100）
  - 每项显示：`kind`、耗时、status（succeeded/failed/canceled）、`result.summary` 或 `error.message`

详情页（点开一条 task）：

- 基本字段：taskId/kind/kitId/surface/时间/耗时
- progress / error / result（JSON 视图 + 复制）
- “打开对应功能件”按钮（把用户带回产生此 task 的 kit）
- “重试”按钮（可选：本质是重新触发同一个业务动作）

### 4.3 无输入焦点时怎么办

IME 面板本质依附输入焦点：**没有输入框焦点时无法稳定“弹出 IME 面板”**。  
因此 Task Center 的“无焦点入口”建议是：

- 打开宿主 Activity（App 内页面）显示同样的 Task Center
- 或仅在有焦点时可用（先做 v0，别卡在系统限制上）

---

## 5. 为了实现 Task Center，需要哪些工程改动（但先不动代码）

### 5.1 引入宿主级 TaskHub（跨 kit 汇总）

当前 TaskTracker 是 per-kit。要做 Task Center，需要一个宿主级聚合层：

- `FunctionKitTaskHub`（建议命名）
  - 全局 `tasksById`
  - 按 `kitId` / `kind` / `status` 建索引
  - 提供 `listRunning()/listHistory()/get(taskId)`
  - 统一 retention（maxHistory）与去重（按 taskId + seq）

各 `FunctionKitWindow`/`FunctionKitTaskTracker` 把 `task.update` 同步写入 TaskHub。

### 5.2 结果规范：Task 里应该存“可查看的结果预览”

建议写死一个约定：

- `task.result.summary` 必须有（面向用户的 1 行）
- `task.result.payload` 可选：只放“安全且小”的结构化结果
- 大 payload 一律走 `ref`（后续与 storage/file upload 的 `bodyRef` 方案合并）

典型 mapping（建议）：

- `ai.request`：可把 `ai.response.output`（截断后）存入 `task.result.payload`
- `candidates.regenerate`：存 `candidateCount` + 首条候选摘要
- `network.fetch`：存 `status` + `contentType` + `bodySnippet`（截断）

### 5.3 Task 与业务消息的强关联

当前 Android 已在 `ai.response/network.fetch.result/candidates.render` payload 中塞 `taskId`，这是正确方向。

建议后续约定：

- 所有宿主发出的“用户可见业务结果消息”都必须带 `taskId`
- 所有 `bridge.error`（用户触发）也必须带 `taskId`

这样 Task Center 才能做到“点一条 task -> 看到对应结果/错误”。

---

## 6. 建议的改进清单（按优先级）

### P0（必须）：Task Center 入口 + 跨 kit 汇总

- IME 工具栏入口（或 More 面板入口）打开 Task Center
- TaskHub 汇总所有 kit 的 running/history
- 详情页至少能看到：progress/error/result（summary + JSON）

### P1（强烈建议）：结果可用性与最小持久化

- 为常见 kind（`ai.request/candidates.regenerate/network.fetch`）补齐 `result.payload` 的预览字段（截断 + 安全）
- 任务耗时、开始/结束时间、来源（用户点击/自动触发）等字段补齐
- history 持久化（哪怕是 SharedPreferences/JSON 文件），至少保留最近 N 条

### P2（可选增强）：统一重试/跳转、日志与通知

- “打开对应 kit 并定位到结果”（需要 kit 支持定位参数）
- `task.log.append`（更完整的调试回溯）
- 任务完成的通知策略（IME 激活时用 IME 内提示；无焦点时用通知或宿主 Activity）

---

## 7. 需要你确认的产品取舍（否则实现会跑偏）

1. Task Center 是 “IME 内窗口” 还是 “宿主 Activity”？
   - 我建议：**先做 IME 内窗口（P0），再补 Activity 入口（P1/P2）**
2. Task Center 是否要对普通用户展示 debug 任务？
   - 我建议：默认只展示“用户任务”，debug 任务仅 debug 开关可见
3. Task Center 里结果展示到什么程度？
   - 我建议：先做到“可复制的 JSON + 一行摘要”，大 payload 走 ref（下一阶段再做 viewer）

