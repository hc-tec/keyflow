# Function Kit 项目查漏补缺审计（Android-first）

> 编码：UTF-8  
> 日期：2026-03-25  
> 范围：Android IME 宿主 + Function Kit WebView runtime + runtime SDK + 示例功能件  
> 目标：不新增功能，盘点“现存问题 / 缺失能力 / 文档与测试缺口”，给出下一步修复优先级。

## 0. TL;DR（最关键的几条）

- **Manifest 与权限模型目前不构成安全边界**：Android host 侧把“kit manifest 声明的权限”与“宿主支持的权限”做了 union，导致 kit 可以在不声明的情况下请求到额外权限（尤其当 UI 发送空 `requestedPermissions` 时会退化为全量）。这在第三方 kit 进入后会直接变成高危漏洞。
- **同源 + DOM storage 使 kit 隔离破功**：Android WebView `domStorageEnabled=true` 且所有 kit 同源 `https://function-kit.local`，本地持久化与静态资源访问可以绕过 `storage.*` 权限与 kit 隔离。详见已产出文档：`TODO/ime-research/notes/20260325_functionkit_storage_and_file_upload_gaps.md`。

- **宿主元数据暴露与权限校验不一致**：`ai.chat.status.request`、`ai.agent.list` 等路径在 Android 侧存在“未按权限门控/对 UI 过度暴露配置元数据”的风险（例如 baseUrl/model/routing）。
- **状态保活目前是“多处各自缓存”**：不同入口（工具条/StatusArea/Bindings）各自维护 `FunctionKitWindow` cache，可能导致同一 `kitId` 出现多个 WebView 实例，用户感知为“状态丢失/清空/不一致”。
- **Host->UI 传输仍偏向 `evaluateJavascript`**：一旦 payload 变大（尤其 base64），容易卡顿/丢消息/崩溃，需要尽早规划“大数据通道”（file handle / bodyRef）。

## 1. 当前架构快照（便于对齐语义）

- UI：功能件是本地 HTML/CSS/JS（browser-app），Android 用 `WebViewAssetLoader` 加载 `https://function-kit.local/assets/...`。
- 桥：UI <-> Host 通过统一 envelope 消息（Host Bridge）。
- SDK：`TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js` 注入浏览器页面；业务代码通过 `createKit()` 使用 `kit.context.refresh / kit.input.insert / kit.ai.chat ...`。
- 宿主写回：最终写回目标 App 输入框仍由宿主显式提交（InputConnection）。

## 2. P0（必须优先修，否则越做越危险/越难收口）

### P0-1 Manifest 权限不构成约束（kit 可“蹭权限”）

现状证据：

- Android host 侧的“支持权限”是 union，而不是交集：
  - `supportedRuntimePermissions = (functionKitManifest.runtimePermissions + FunctionKitDefaults.supportedPermissions).distinct()`
  - 文件：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
- 握手时若 UI 传空 `requestedPermissions`，宿主会退化到 `supportedRuntimePermissions`（全量）：
  - `requestedPermissions = payload.requestedPermissions.filter { it in supportedRuntimePermissions }.ifEmpty { supportedRuntimePermissions }`

风险：

- 恶意/非 SDK 的 kit UI 可以请求未在自身 manifest 声明的权限（例如 `network.fetch`、`ai.chat` 等）。
- 功能开发阶段看似“更省事”，但一旦第三方 kit 进入，这就是实打实的越权。

建议（不在本次实现，作为修复方向）：

- 把 manifest `runtimePermissions` 变成 **上限 allowlist**（必须是交集）：
  - `effectiveSupported = hostSupported ∩ kitManifestDeclared`
  - `effectiveRequested = uiRequested ∩ kitManifestDeclared`（uiRequested 为空则用 kitManifestDeclared）
- 如需“可选权限”，单独建模（例如 `optionalRuntimePermissions`），并要求显式用户确认。

### P0-2 HostInfo 里覆盖了 manifest 的 runtimePermissions（语义混乱）

现状证据：

- `buildManifestSnapshot()` 会把 `functionKitManifest.toJson()` 再 `.put("runtimePermissions", JSONArray(supportedRuntimePermissions))`，等于覆盖 kit 自己声明的 `runtimePermissions`。
  - 文件：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`

风险：

- UI/调试信息中看到的 manifest 与仓库里的 `manifest.json` 不一致，排查时会被误导。

建议：

- `manifestSnapshot` 保持“原样”输出；若要展示宿主支持能力，使用 `hostInfo.supportedRuntimePermissions` 单独字段。

### P0-3 同源 + DOM Storage + 资产路径不隔离（隔离与权限模型破功）

现状证据与建议详见：

- `TODO/ime-research/notes/20260325_functionkit_storage_and_file_upload_gaps.md`

本审计额外补充（非重复）：

- 安全模型文档 `TODO/function-kit-runtime-sdk/docs/SECURITY_MODEL.md` 当前强调“origin 固定”，但如果要支持第三方 kit，必须明确选择：
  - 每 kit 独立 origin（例如 `https://<kitId>.function-kit.local`），或
  - 关闭 DOM storage 并强制所有持久化走 `storage.*`
  - 这条需要在文档里写死，否则 kit 作者会自然走 `localStorage/IndexedDB`，权限模型将不可控。


### P0-5 `host.state.update` 可能过于频繁且携带重 payload（性能/卡顿风险）

现状证据：

- 多处调用 `pushHostState(...)`，并且 `details = buildHostDetails()` 内部会读取 `InputConnection`（before/after/selected）并解析 slash。
  - 文件：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`

风险：

- 光标/预编辑频繁变化时，可能导致频繁跨线程/跨 bridge 同步，增加卡顿与日志噪音。

建议：

- `host.state.update` 默认只发轻量字段（label + 最小 meta），重 payload 改成显式 `diagnostics.request` 或在 debug 开关下发送。

### P0-6 `ai.chat.status.request` / `ai.agent.list` 等接口的门控与元数据暴露需要收口

现状证据（只列风险点）：

- Android 侧部分 handler 未按 `ensurePermission(...)` 做门控（与 `FunctionKitPermissionPolicy` 的设计意图不一致）。
- `hostInfo` / `ai.chat.status.sync` / `ai.agent.list.result` 可能携带过多“宿主配置元数据”（baseUrl/model/remote auth/routing/adapter 可用性等）。

风险：

- 第三方 kit 即使拿不到敏感文本，也可能通过元数据推断用户配置、网络环境与宿主形态；也会让权限模型在“能力发现”维度失控。

建议：

- “能力发现”必须与权限模型绑定：默认只给最小摘要（available/unavailable + reason），细节在有权限时再给。
- 下发字段遵循“最小必要”原则：对 UI 不需要的 routing/config 不要下发（尤其是 token 配置状态、局域网地址等）。

### P0-7 Bridge 传输通道与大 payload 风险（需要工程化边界）

现状：

- Android Host->UI 很多路径最终会走 `evaluateJavascript` 注入字符串。

风险：

- 大 payload（例如 base64、长上下文、长日志）会引发明显掉帧与消息不稳定；这会直接放大“手动调试成本”。

建议：

- 在协议层提前设计“大数据不走 JSON”的通道（参见 `storage_and_file_upload_gaps.md` 的 `file handle + bodyRef` 思路）。
- 对所有可能变大的字段设置上限与错误码，并在 UI 显式提示“超限/已截断”。

## 3. P1（重要但可在 P0 收口后推进）

### P1-1 `input.replace` 的“强替换”语义仍有边缘不稳

现状：

- `candidate.replace` 路径会在无 selection 时尝试 `selectAll`，失败后用 `getTextBeforeCursor(10_000)` + `getTextAfterCursor(10_000)` 再 `deleteSurroundingText`。

潜在问题：

- 极长文本（>10k）且 `selectAll` 失败时，可能只删除部分内容，导致“替换不彻底”。
- 依赖 `currentSelectionStart/currentSelectionEnd`（来自窗口回调）可能与 `InputConnection` 实时状态不一致。

建议：

- 明确“替换”策略的降级顺序与边界，并在 UI/日志中把降级路径打出来，便于定位（例如：selectAll 成功/失败、删除长度）。

### P1-2 发送拦截的产品闭环仍欠缺（避免把用户卡死）

现状：

- 已有 `send.intercept.ime_action`（fail-open + timeout）。
- 但用户侧缺乏明确“正在拦截发送”的可见状态入口（除了 kit UI 自己显示）。

建议：

- 需要一套宿主级可见提示/快速关闭入口（例如键盘工具条开关或 toast + action），否则用户一旦被拦截会把锅甩给输入法。


### P1-4 能力发现与调试工具链不足

现状：

- 已新增调试 kit：`TODO/function-kits/ime-hooks/`，用于手动验证 observe/send intercept。

建议：

- 继续补一个“协议/权限/事件”总览的调试面板（可作为 kit 或宿主 debug 页面），用来查看：最近 N 条 envelope、权限变更、bridge ready 状态、超时统计。

### P1-5 “状态保活”需要宿主级统一池，否则同 kit 多 WebView 会反复复发

现状：

- 多个入口各自维护 `FunctionKitWindow` cache，导致同一 `kitId` 可能存在多个 `FunctionKitWindow/WebView`。

影响：

- 用户感知为“切换入口/切换窗口后状态丢了、候选清了、权限/上下文不一致”。

建议：

- 把 cache 提升为 `InputMethodService` 级（或 `Application` 级）的统一池：按 `kitId` 复用唯一实例，并提供显式的回收策略（LRU/上限/内存压力）。

### P1-6 Kit Manifest 与实际运行链路存在漂移（composer/panel-state/fixtures）

已发现的漂移类型：

- 内部输入桥接（`composer.*`）在 Android 上是必需能力，但 kit 的 `hostBridge` 声明未必完整（尤其 `composer.state.sync`）。
- `panel.state.*` 在 manifest/fixtures 中存在，但部分 kit UI 实际不再使用，导致“声明存在但没人消费”。
- fixtures 覆盖与当前 UI 能力不匹配（缺 `ai.chat.result`、`ai.chat.status.sync`、`composer.state.sync` 等合同回放资产）。

建议：

- 先统一定义：哪些消息是“内部协议，不要求 kit 声明”；哪些是“必须在 manifest 中声明才能使用”。
- 把 fixtures 当成 contract 测试资源：每新增一条关键消息链路，都必须补 fixture 与对应断言，否则回归只能靠手点。

### P1-7 Built-in kit UI 的 XSS/注入面需要主动收口

现状：

- 部分 UI 用 `innerHTML` 拼接字符串来渲染错误/提示/标题等内容。

风险：

- 一旦渲染内容包含外部输入（网络错误信息、clipboard、binding 标题等），会形成 XSS；而 XSS 在 kit 上下文里等价于“拿到该 kit 已授权的所有宿主能力”。

建议：

- Built-in kit 统一改为 `textContent` + DOM 拼装；并在 SDK 文档里把这条写成硬约束（第三方 kit 也会踩坑）。

### P1-8 discovery 元数据已存在，但入口未闭环（固定/最近/slash）

现状：

- manifest 与 SDK 已支持 `pinnable/recent/slash` 等 discovery 元数据，但 Android 侧主要入口仍是“静态列出已安装 kits”。

影响：

- 用户无法通过输入（slash）或上下文快速找到对应 kit，安装越多越难用。

建议：

- 建一个宿主级 discovery service：索引、最近、固定、slash 搜索统一收口，不要让 metadata 只存在于 manifest 而无人消费。

## 4. P2（体验与 DX 的持续优化方向）

### P2-1 SDK API 仍显“业务代码样板多、耦合强”

现状：

- 示例 UI（例如 `chat-auto-reply/ui/app/main.js`）存在大量样板：状态机、错误归一化、权限 gating、事件 wiring。

建议：

- 参考浏览器扩展 API（`chrome.runtime`/`chrome.storage`/`chrome.tabs`）思路：
  - 更清晰的 namespace（例如 `kit.permissions`, `kit.diagnostics`, `kit.input.observe`）
  - 统一错误模型（error codes / retryable / userAction）
  - 更少“手写订阅 + 手写状态同步”的样板

### P2-2 文档需要对齐真实实现（避免误导）

已发现的潜在漂移点：

- `SECURITY_MODEL.md` 对“origin 固定”的表述需要补充“隔离策略选择”（见 P0-3）。
- “实时监听输入 / 发送前拦截”文档已补实现记录，但仍需补一个“对外承诺边界”段落，避免开发者误以为可 100% 拦截 App 发送按钮。

### P2-3 预览 mock host 与生产 runtime 混在一起（容易产生“浏览器能跑、真机不行”）

现状：

- SDK 内置 preview host，且示例 kit 的生产入口代码里直接包含 preview 配置。

影响：

- kit 作者容易把 preview 的宽松语义当成真实宿主能力，导致真机调试成本暴涨。

建议：

- 将 preview host 下沉为独立 dev harness（显式开关），并建立“preview host 与 Android/Windows 宿主协议对齐”的回归测试。

### P2-4 TS 类型与 schema 过于宽松（兼容性保护被稀释）

现状：

- message type / permission 在类型层允许任意 string，无法在编译期捕获拼写错误与协议漂移。

建议：

- 对已知协议使用 closed union；扩展能力走显式注册表或前缀命名空间（例如 `x.*`）。

## 5. 仍缺的关键能力清单（不实现，仅列出，便于规划）

> 这部分只列“对 MVP/规模化必需”的能力，且尽量按依赖顺序排列。

- 隔离与配额
  - 每 kit 独立 origin 或关闭 DOM storage（必须二选一写死）
  - `storage.*` quota + diff sync + 稳定错误码
- 文件与二进制（见已产出文档）
  - host-managed file store + handle（`files.pick/stat/release`）
  - `network.fetch` 支持 `bodyRef/response.bodyRef`
- 宿主级可观测性
  - 最近 N 条 envelope ring buffer（debug）
  - 关键指标：bridge ready latency、超时次数、evaluateJavascript payload size
- kit 管理
  - 启用/禁用 kit（按用户）
  - per-kit 权限（类似浏览器插件权限页）
  - per-kit debug 信息（最近错误、最近 envelope、缓存占用）
  - pinned/recent/slash 的真实入口与 UI（目前更多是 manifest 元数据）

## 6. 测试与文档缺口（不实现，仅盘点）

### 6.1 SDK 单测缺口

- `candidates.*` 合同覆盖薄：`candidates.regenerate` 的 envelope 形态、`candidates.render` 下发后的状态更新缺少系统性断言。
- “乱序/重复/迟到消息”的确定性规则未固化：你曾看到过 `duplicate-message`，但缺少对“丢弃/覆盖”策略的测试守护。
- “宿主对象缺失/延迟注入/协议字段缺失”下的降级行为缺少测试：真机 WebView 时序问题会直接变成“卡住等待”。

### 6.2 Android 单测缺口

- `FunctionKitWindow` 的核心分支（握手、权限同步、context payload、AI/网络错误映射、replace 语义降级）大多未被 JVM unit tests 覆盖。
- instrumentation tests 更偏“受控 contract 测试”，不能替代“外部 App（QQ/微信）输入框差异”验证；需要在文档中明确定位，避免误用为完整 E2E。

### 6.3 手动 E2E runbook 缺口

- 建议把“kit 内输入框输入中文并能看到/选择候选词”写成必过项（之前反复栽在这里）。
- emulator 常见坑需要固化：硬件键盘导致 IME/候选不弹的设置项与排查路径（否则会把环境问题误判成 kit bug）。
- 证据留存需要更可追踪：每轮 run 至少把 runId、设备信息、APK 文件名/版本号、结论与证据路径写回 `TODO/TODO.md` 或 notes（仅放 artifacts 目录很容易丢）。

### 6.4 文档/实现漂移点

- `SECURITY_MODEL.md` 与“多 kit 隔离策略”的现实冲突（见 P0-3）。
- 协议声明存在多处复制（schema / d.ts / allowlist / README / kit manifest），容易漂移；需要一个“单一真源”生成或至少一致性校验流程。

## 7. 附录：相关文档索引

- 存储与文件上传缺口：`TODO/ime-research/notes/20260325_functionkit_storage_and_file_upload_gaps.md`
- 实时监听输入/发送拦截：`TODO/ime-research/notes/20260325_functionkit_realtime_input_and_send_intercept.md`
- 手动 E2E runbook：`TODO/ime-research/notes/20260325_functionkit_manual_e2e_runbook.md`
