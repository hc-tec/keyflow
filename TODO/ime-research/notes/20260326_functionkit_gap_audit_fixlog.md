# Function Kit Gap Audit Fixlog（执行记录）

> 编码：UTF-8  
> 日期：2026-03-26  
> 依据审计：`TODO/ime-research/notes/20260325_functionkit_project_gap_audit.md`  
> 目标：不新增功能，优先收口安全边界、可观测性与稳定性；每个改动需写清“现状/改动/验证/风险”。

## 0. 工作约束（写死）

- Android-first；真机入口优先：`adb connect <DEVICE_SERIAL> `V2244A`）
- 安装禁用增量：`adb -s <DEVICE_SERIAL> install --no-incremental -r -d <apk>`
- 不做脚本式端到端自动化；只做单测 + 手动验收（必要时 `logcat`）

## 1. 执行清单（与 TODO 对齐）

- P0-1/P0-2：权限模型收口 + manifestSnapshot 语义修正（交集 allowlist、requestedPermissions 回退 manifest、hostSupported 单独字段）
- P0-3：隔离策略收口（关闭 DOM storage 或 per-kit origin）+ `SECURITY_MODEL.md` 同步
- P0-5：`host.state.update` 限流/轻量化 + 大字段上限与错误码（避免 evaluateJavascript 大 payload 不稳）
- P0-6：AI/Agent 相关 handler 权限门控 + 元数据最小化（不泄露 baseUrl/model/routing/token 状态）
- P1-4：Bridge Debugger 可观测性闭环（最近 N 条 envelope / ready / timeout / permissions / 去重策略）
- P1-5：宿主级统一 `FunctionKitWindow/WebView` 池（同 kitId 唯一实例 + 回收策略）
- P1-7：Built-in kit UI 移除 `innerHTML` 拼接（改 `textContent` + DOM 组装）

## 2. 过程记录

### 2026-03-26

#### 2.1 准备：读审计文档并把待办拆解写回 TODO

- 已完成：将 P0/P1 的可执行收口项写入 `TODO/TODO.md`（见“根据审计文档收口现有实现”条目）。
- 当前 workspace 状态：存在未提交改动（root repo + `fcitx5-android`），后续会按任务切分提交，避免混入无关变更。

#### 2.2 P0-1/P0-2：权限模型改为 manifest allowlist + 修正 manifestSnapshot 语义（Done）

改动动机：
- 之前宿主把 `kit manifest 声明的 runtimePermissions` 与 `宿主支持权限` 做 union，且握手 `requestedPermissions` 为空会回退全量，导致 manifest 不构成权限上限。

已做改动（Android Host）：
- 新增纯函数 resolver（便于单测与后续复用）：`FunctionKitRuntimePermissionResolver`
- `supportedRuntimePermissions` 改为 `manifestDeclared ∩ hostSupported`（不再 union）
- 握手 `bridge.ready`：UI requested 为空时回退 effective allowlist；UI requested 非空但全无效则返回空（不再回退全量）
- `ensureManifestStateInitialized()`：grantedPermissions 改为按 `FunctionKitPermissionPolicy` + prefs 计算
- `manifestSnapshot` 不再覆盖 `runtimePermissions`
- `FunctionKitRegistry` 不再用宿主全量权限作为 manifest 缺失时的 fallback（fallback 置空）

涉及文件：
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitRuntimePermissionResolver.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitRegistry.kt`

单测：
- `TODO/ime-research/repos/fcitx5-android/app/src/test/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitRuntimePermissionResolverTest.kt`

验证：
- `./gradlew.bat :app:testDebugUnitTest` 已通过（包含新增 resolver 单测）
- 真机 smoke（建议）：打开内建 kit（chat-auto-reply / quick-phrases / ime-hooks / bridge-debugger）确认握手仍正常、权限条目不异常

风险：
- 若存在旧 kit manifest 未声明 `runtimePermissions`，将默认无权限（需要补 manifest）。

进度：
- fcitx5-android 已提交：`a555f89`（FunctionKit: enforce manifest permission allowlist; disable DOM storage）
- 已通过：`./gradlew.bat :app:testDebugUnitTest`

#### 2.3 P0-3：收口隔离策略（关闭 DOM Storage）（Done）

改动：
- Android WebView：`domStorageEnabled=false`，避免同 origin 下 kit 之间通过 DOM storage 绕过 `storage.*` 权限与 namespace。
- 同步更新 SDK 安全模型文档：写死“同 origin -> 必须禁用 DOM Storage，持久化走 storage.*”。

涉及文件：
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`
- `TODO/function-kit-runtime-sdk/docs/SECURITY_MODEL.md`

待办：
- 真机确认：built-in kits 不依赖 DOM storage（当前代码搜索未发现 `localStorage/indexedDB` 使用）。

进度：
- Android 侧实现已随 `a555f89` 落地（`domStorageEnabled=false`）
- 文档已同步并提交：`TODO/function-kit-runtime-sdk/docs/SECURITY_MODEL.md`

#### 2.4 P0-6：AI/Agent handler 权限门控 + 元数据最小化（Done）

目标：
- 不让 kit 通过 `hostInfo` / `ai.chat.status.*` / `candidates.render` / `host.state.update` 等通道推断宿主的 baseUrl/model/routing/token 配置。

已做改动（Android Host）：
- `hostInfo` / `host.details` 移除敏感字段（baseUrl、endpoint、routing hints、model 等）。
- `ExecutionConfig.modeMessage` 不再包含具体 endpoint URL。
- `resolveFunctionKitEffectiveMode()`（local AI）不再把 endpoint/baseUrl 拼进 `modeMessage`。
- `ai.chat.result` / 本地 AI `candidates.render`：移除 `routing/hostInfo/model` 等附带信息。
- `ai.chat.status.sync`：无 `ai.chat` 授权时只返回 `permission_denied`，不暴露配置细节。
- `ai.agent.list`：新增 `ensurePermission(..., \"ai.agent.list\")` 门控；payload 不再带 routing/hostInfo。
- 远程/本地 AI 错误 details：移除 baseUrl 回退（避免错误信息里意外带出 URL）。

涉及文件：
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitEffectiveMode.kt`

单测：
- 更新：`TODO/ime-research/repos/fcitx5-android/app/src/test/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitEffectiveModeTest.kt`

进度：
- fcitx5-android 已提交：`95e5625`（FunctionKit: minimize AI/agent metadata exposure）
- 已通过：`./gradlew.bat :app:testDebugUnitTest`

#### 2.5 P0-5：`host.state.update` 限流 + 轻量化（Done）

改动动机：
- `host.state.update` 在输入变化时可能非常频繁；如果每次都携带完整 host details，会放大卡顿、消息不稳定与调试噪音。

已做改动（Android Host）：
- `host.state.update` 的 `details` 默认改为轻量快照（sessionId/selection/package/grantedPermissions/build 等），不再构建完整 `buildHostDetails()`。
- `onSelectionUpdate` 的 host update 做节流（同 label 250ms 以内只发一次）。

涉及文件：
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`

进度：
- fcitx5-android 已提交：`d35e092`（FunctionKit: throttle and slim host.state.update）
- 已通过：`./gradlew.bat :app:testDebugUnitTest`

备注：
- 执行过程中发现 `FunctionKitTaskTracker.kt`（WIP）存在编译问题，已先修复以恢复可构建：`919c216`。

#### 2.6 P1-4：Bridge Debugger 可观测性闭环（Done）

改动动机：
- 之前 Bridge Debugger 主要只能看到 `host->ui` 的入站消息；定位 bridge 问题时，“出站到底发没发出去、在等谁、等了多久、为什么被丢/被去重”无法闭环。

落地（不改 wire protocol，仅增强 debug 可观测性）：
- Runtime SDK（`createClient`，仅 `debug:true` 时）新增本地 debug telemetry envelopes：
  - `debug.envelope`：记录 `ui->host` 的 send/request（含原始 envelope）
  - `debug.request`：记录 request 生命周期（`pending/resolved/rejected`，含 timeout/abort/bridge.error/permission.denied 等）
  - `debug.drop`：记录 inbound 被丢弃原因（duplicate-message/invalid-* 等）
- `createKit` 侧忽略 `source!=host-adapter` 的 envelopes，避免 debug telemetry 影响 kit 的业务状态机。
- Bridge Debugger 的 Trace 摘要增强：能直接看到出站、回包、RTT、drop reason。

涉及文件：
- `TODO/function-kit-runtime-sdk/src/index.js`
- `TODO/function-kit-runtime-sdk/tests/client-api.test.mjs`
- `TODO/function-kits/bridge-debugger/ui/app/main.js`

验证：
- `Set-Location <WORKSPACE_ROOT>\\TODO\\function-kit-runtime-sdk; npm test` 已通过（含新增 debug 单测）。

#### 2.7 P1-5：宿主级统一 `FunctionKitWindow/WebView` 池（Done）

改动动机：

- 之前工具条/StatusArea/Bindings 等入口各自维护 `FunctionKitWindow` cache，同一 `kitId` 可能出现多个 WebView 实例。
- 用户体验会直接表现为：切换入口后“状态丢失/清空”、上下文/权限/候选不一致、握手重来。

落地（Android Host）：

- 新增宿主级统一池：`FunctionKitWindowPool`
  - key 为 `kitId`，保证同一 `kitId` 复用唯一 `FunctionKitWindow/WebView` 实例。
  - 提供简单的回收策略：当窗口不再 attach 且超过上限时，从池中移除（避免无限增长）。
- 各入口统一改为从 pool 获取 window（删除各自的私有 cache）：
  - 工具条入口：`KawaiiBarComponent`
  - StatusArea：`StatusAreaWindow`
  - Bindings：`FunctionKitBindingsWindow`

涉及文件（fcitx5-android）：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindowPool.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/KawaiiBarComponent.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/status/StatusAreaWindow.kt`
- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitBindingsWindow.kt`

验证：

- `Set-Location <WORKSPACE_ROOT>\\TODO\\ime-research\\repos\\fcitx5-android; .\\gradlew.bat :app:testDebugUnitTest`
- 手动验收建议（真机/模拟器均可）：
  - 同一 `kitId` 分别从工具条、StatusArea、Bindings 打开，确认不会重新握手导致 UI 状态清空（storage/context/candidates 能保持一致）。

风险与后续：

- pool 回收目前以“移除引用”为主，尚未显式 `WebView.destroy()`（需要一个明确的 `dispose` 生命周期以避免误删正在使用的窗口）。若后续发现内存压力，可补 `FunctionKitWindow.dispose()` 并在回收时调用。

#### 2.8 P1-7：Built-in kit UI 收口 XSS 面（Done）

改动：
- 内建 kit UI 全面移除 `innerHTML` / 模板拼接，改用 `textContent` + DOM 组装（避免宿主/kit 边界数据落入 HTML 解析路径）。

涉及文件：
- `TODO/function-kits/chat-auto-reply/ui/app/main.js`
- `TODO/function-kits/quick-phrases/ui/app/main.js`
- `TODO/function-kits/ime-hooks/ui/app/main.js`
- `TODO/function-kits/bridge-debugger/ui/app/main.js`

验证：
- 代码库搜索 `innerHTML/insertAdjacentHTML/outerHTML` 无命中。


