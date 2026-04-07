# Function Kit 本地存储与文件上传：现状缺陷、真实阻塞与可行演进

> 编码：UTF-8  
> 日期：2026-03-25  
> 状态：DRAFT（已按当前仓库代码补全）  
> 范围：Android-first（Windows 未来对齐）；默认前提：不逼用户依赖电脑常驻；功能件可能增多且存在第三方/不完全可信的可能。

## TL;DR（现在最致命的缺口）

1. **“本地存储”目前实际分裂成两套**：Host `storage.*` 是轻量 KV；但 Android WebView 同时开启了 `domStorageEnabled=true`，而且所有 kit 共用同一 origin（`https://function-kit.local`），这会导致：
   - kit 可以绕过 `storage.read/write`，直接用 `localStorage/IndexedDB` 持久化；
   - 多 kit 之间可能互相读到对方 DOM storage（同源），破坏隔离与权限模型。
2. **“文件上传”在三层都被卡死**：
   - UI 层：WebView 禁止 file/content access（`allowFileAccess=false`、`allowContentAccess=false`）且拒绝 Web 权限申请，`<input type="file">` 等路径不可用；
   - SDK 层：runtime payload 强制 JSON，可直接拒绝 `ArrayBuffer/Blob/FormData`；
   - Host 层：Android `network.fetch` 只支持 UTF-8 字符串 body/response。
3. **“用 base64 硬塞桥消息”的方案在 Android 上也不稳**：Android Host -> UI 当前主要走 `evaluateJavascript` 注入字符串（`FunctionKitWebViewHost.dispatchEnvelopeViaJavascript`），大 payload（尤其 base64）极易触发性能/长度上限/卡顿/崩溃；同时 PC 的 `function-kit-host-service` 默认 JSON body 上限只有 **256KB**。

结论：不扩展 “host-managed file store + handle” 这条链路，后续所有涉及图片/附件/富媒体/大上下文的 kit 都会被永久卡死。

## 0. 结论（先把话说死）

当前 Function Kit 的 `storage.*` 与 `network.fetch` 设计能支撑「小型设置 / 文本候选 / AI chat」这类早期功能，但存在两类**硬缺口**与一个**隐性大坑**：

1. **Host Storage 只能算“轻量 KV”**：适合保存开关、短文本、偏好；不适合存结构化对象/历史记录/索引/大体积数据。
2. **文件上传/二进制流完全不可用**：runtime surface 强制 JSON 可序列化，Android host 的 `network.fetch` 也只支持 UTF-8 字符串 body/response。
3. **DOM Storage 绕过与同源隔离问题（隐性大坑）**：Android WebView 目前开启 DOM storage，且所有 kit 同源，导致权限模型在“本地持久化”维度上很难闭环。

因此，“文件上传 / 发送图片 / 读取媒体”这类能力若不扩展协议，功能件永远做不了。

下面给出：现状事实（以代码为准）、主要风险/阻塞、以及一个分阶段演进路径（先解决 80% 场景，避免 connector 地狱，也避免 base64 把桥炸掉）。

## 1. 现状事实（以代码为准）

### 1.1 storage：Host Bridge 协议

- UI -> Host：`storage.get` / `storage.set`
- Host -> UI：`storage.sync`

浏览器侧（推荐写法）：

- `kit.storage.get(keys) -> values`
- `kit.storage.set(values) -> values`

### 1.2 Android 侧存储实现：SharedPreferences + kitId namespacing

实现落点：

- Android Host：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
- `FunctionKitWindow` 使用 `SharedPreferences("function_kit_storage")`
- 实际 key：`$kitId:$key`

当前支持的 value 类型（写入时）：

- `Boolean / Int / Long / Float`：按对应类型存
- 其他（含 `Double / JSONObject / JSONArray`）：会 `toString()` 后以字符串存入

读回时：

- `storage.get`/`storage.sync` 返回的值不会自动 `JSON.parse`，因此“结构化对象/数组”如果写进去，读出来仍是字符串。

这意味着：

- 功能件若想存对象，只能自行 `JSON.stringify`，再自行 `JSON.parse`。
- host 不理解数据结构，也无法做迁移/部分更新/查询。

另外两个“会在规模化时直接炸”的事实：

- Android 的 `storage.set` 之后会回传 **该 kit 的全量 KV**（不是 diff）：`storage.sync { values: readAllStorageValues() }`。
- 当前没有任何 **单 key / 单 kit 总量** 的上限与稳定错误码（写入过大时更可能表现为卡顿/崩溃，而不是可控失败）。

### 1.3 network.fetch：仅文本 body，不支持二进制

落点：

- Runtime SDK：`TODO/function-kit-runtime-sdk/src/index.js`（`normalizeTransportValue` / `normalizeFetchInit`）
- Android Host：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`（`executeNetworkFetch`）

1. Runtime SDK 明确拒绝：

- `ArrayBuffer / TypedArray`
- `Blob`
- `FormData`

2. Android host 的 `network.fetch`：

- request body：`init.body?.toString()`，UTF-8 写入
- response body：读取为字符串回传（`response.body`）

因此：

- 不能上传文件（二进制）
- 不能可靠下载二进制（比如图片、音频、PDF）
- 即便 UI 侧能把文件转成 base64，目前也没有“host 端解码并写入 bytes”的协议字段

### 1.4 Android WebView 的“本地存储现实”：DOM storage 开启且同源

落点：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`。

关键事实：

- `settings.domStorageEnabled = true`：启用 `localStorage`/IndexedDB 等 DOM storage。
- 所有 kit 都加载在同一个 origin：`https://function-kit.local`（路径不同但同源）。
- 资源访问白名单按 “`/assets/` 前缀” 放行，不按 kit 目录隔离：任何 kit 都可读取 `https://function-kit.local/assets/...` 下的其他 kit 静态资源。

影响：

- kit 可以绕过 Host `storage.*` 权限与实现限制，自行持久化任意结构化数据；
- 多 kit 同源意味着 DOM storage 天然共享，kit 之间可能读到彼此数据；
- 宿主无法对 DOM storage 做 quota/迁移/清理/可观测性管理（除非额外实现 origin 隔离或统一清理策略）。

### 1.5 Android Host -> UI 分发链路对“大 payload”不友好

落点：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`。

关键事实：

- 在收到第一条合法 UI 入站消息后（`hasReceivedUiEnvelope=true`），Host -> UI 默认走：
  - `dispatchEnvelopeViaJavascript` -> `webView.evaluateJavascript(...)` 注入一段包含完整 envelope 字符串的脚本。

这意味着：

- “把二进制转 base64 放进 envelope”的方案天然不稳（长度/性能/卡顿风险很高）。
- 设计上应尽量避免 **大体积数据进入 bridge envelope**；更适合采用 **handle 引用 + host 侧流式处理**。

### 1.6 Windows 侧当前状态（对齐提醒）

- Windows WebView2 Host PoC：`TODO/ime-research/windows-functionkit-host/`
- 目前已实现 `storage.get/set`（落到 `JsonFileFunctionKitStorage`），但 `network.fetch`/文件能力尚未对齐 Android。

### 1.7 PC Function Kit Host Service 的 JSON body 上限（附件会被直接限死）

落点：`TODO/function-kit-host-service/src/server.js`

- 默认 body 上限：`FUNCTION_KIT_HOST_BODY_LIMIT_BYTES`，默认值 `262144`（256KB）
- 当前读取逻辑是 JSON-only（`readJsonBody`），不支持 multipart/流式上传

## 2. 主要缺陷与风险（为什么这会卡死功能拓展）

### 2.1 本地存储缺陷

- **结构化数据不可用**：没有 JSON typed storage，导致 kit 代码到处 `stringify/parse`，还容易版本漂移。
- **容量与性能无护栏**：SharedPreferences 不适合大数据；`storage.set` 目前会回传“该 kit 全量 KV”，大了会拖垮 UI/IPC/序列化。
- **无 schema / 无迁移机制**：一旦 key 语义变化，旧值没有可控迁移入口。
- **安全性弱**：SharedPreferences 默认明文，理论上不应存敏感 token（这也是“AI 配置应由宿主统一管理”的原因）。
- **权限模型可被绕过（Android）**：DOM storage 开启且同源，kit 可以不走 `storage.*` 直接持久化；多 kit 间还可能互相读写。
- **隔离性不足（Android）**：资源根是 `/assets/`，不按 kit 目录隔离；会限制未来做“第三方 kit/市场化”。

### 2.2 文件上传缺陷

如果不解决二进制，下面这类功能永远做不了：

- AI 表情包生成（生成图片并发送）
- AI 绘画（图生图/上传参考图）
- OCR（上传截图）
- 把文件交给本地/远程 agent 处理
- 任何 “multipart/form-data” API

并且不仅是“network.fetch 不支持 bytes”，还存在更底层的阻塞：

- **UI 根本拿不到文件**：Android WebView 禁用 file/content access，且拒绝 Web 权限申请，`<input type="file">` 这类浏览器默认路径不可用。
- **Host -> UI 分发不适合 base64 大 payload**：即便做 `bodyBase64` 字段，也会在 Android 的 `evaluateJavascript` 分发链路上放大为稳定性问题。
- **PC Host Service 默认 body 上限 256KB**：即便 Android 走远程推理链路（到 PC），附件也会被 HTTP 层限死（`FUNCTION_KIT_HOST_BODY_LIMIT_BYTES` 默认 262144）。
- **网络域名策略缺失**：manifest 已有 `network.*` 字段，但 Android Host 目前未基于 manifest 做 allowlist/denylist；`network.fetch` 对任何绝对 http/https URL 都可用。一旦补齐“上传/下载二进制”，外泄与滥用风险会成倍放大。
- **权限粒度不足（现状）**：Android 的 Function Kit 权限开关目前是全局开关（不是 per-kit）。文件能力上来后，若仍然全局开关，用户很难信任“只给某一个 kit 文件权限”的需求。

## 3. 最小可行演进（不要 connector 地狱）

下面的方案设计原则：

- Android-first：默认用户没有电脑常驻
- 简单：先把“上传/下载二进制”打通，别上来就搞复杂生态
- 可控：必须有权限与大小上限，避免 host 被一把梭 DOS
- 不塞大 payload：避免把 base64 大串塞进 bridge envelope（尤其 Android 侧 `evaluateJavascript` 分发）

### 3.1 存储演进（建议）

阶段 A（马上可做，低风险）：

- 文档层明确：`storage.*` 是轻量 KV（仅适合短文本/设置）
- 增加 SDK 辅助：`kit.storage.getJson(key)` / `kit.storage.setJson(key, obj)`
  - 实现策略：SDK 自动 `JSON.stringify/parse`，host 不变
  - 价值：减少 kit 侧样板代码，不破坏兼容

阶段 B（隔离与容量护栏）：

- Android：明确选择其一，并写死成规范（否则 kit 作者会走歪路）：
  1. **强隔离路线（推荐，面向第三方 kit）**：每个 kit 独立 origin（例如 `https://<kitId>.function-kit.local`），资源访问只允许该 kit 的目录根；这样 DOM storage 也自然按 kit 隔离。
  2. **强约束路线**：关闭 `domStorageEnabled`，强制所有持久化走 `storage.*`；代价是前端生态受限，但换来权限模型闭环。

- Host 对 `storage.set` 增加限制：
  - 单 key 最大长度（例如 8KB / 32KB）
  - 单 kit 总量上限（例如 256KB / 1MB）
  - 超限返回稳定错误码（例如 `storage_quota_exceeded` / `storage_key_too_large`）

- `storage.sync` 支持 diff：
  - `changedKeys` 或 `{ changes: { key: value|null } }`
  - 避免每次 `set` 都回传“全量 KV”

阶段 C（大对象/历史记录）：

- 引入 host-managed blob/file store（**这是文件上传能力的基石**）：
  - UI 只拿 handle，不直接拿 bytes
  - 仍保持协议少：`files.put/get/delete/list` 或 `storage.file.*`

### 3.2 文件上传/下载演进（建议）

阶段 A（推荐先做：文件 handle + host 侧流式上传）

目标：让 UI **不需要**把 bytes 塞进 bridge envelope；UI 只负责拿到 “file handle”，上传由 host 直接完成。

新增最小 API 面（建议）：

- `files.pick`：宿主弹系统文件选择器，返回 `{ fileId, name, mime, size, lastModified? }`
- `files.release(fileId)`：释放临时文件（或由 host 做 TTL）
- `files.stat(fileId)`：可选，便于 UI 展示/校验
- （可选）`files.url(fileId)`：返回一个 **本地 origin** 可访问的 URL（例如 `https://function-kit.local/files/<id>`），用于 UI 预览 `<img>`/下载链接；注意必须加权限与仅该 kit 可访问。

扩展 `network.fetch`（不破坏现有语义，只加可选字段）：

- request 支持 `init.bodyRef`：
  - `{ type: "file", fileId }`
  - `{ type: "bytes", dataBase64 }`（仅用于小 payload 逃生舱）
- response 支持 `response.bodyRef`（当响应是二进制/过大时）：
  - `{ type: "file", fileId, mime, size }`
  - 仍保留 `response.body`（文本）

宿主实现要点（Android）：

- `network.fetch` 发现 `bodyRef.type=file` 时，宿主从自身 file store 读取 bytes 并写入连接 output stream（multipart 也在宿主侧组装）。
- UI 不需要读 bytes，也就不会遇到 WebView 禁 file/content access 的硬阻塞。

配套措施（必须）：

- 权限：引入 `files.pick`/`files.read`（或 `files.access`）权限；并建议“每次 pick 都用户手势触发 + 可选一次性授权”。
- 隔离：fileId 必须绑定 `kitId`，跨 kit 不可用。
- 大小限制：限制 pick 最大 size、限制单次上传 bytes、限制并发。
- 错误码：稳定区分 `file_not_found` / `file_too_large` / `file_permission_denied` / `network_fetch_body_too_large`。

阶段 B（小补丁：base64 逃生舱，仅限小文件）

在阶段 A 基础上可再补一个“非常小的逃生舱”，用于 demo/小图标：

- request：`init.bodyBase64`（或 `bodyRef.type=bytes`）
- response：`response.bodyBase64`

但必须写死限制：

- `maxInlineBase64Bytes`（例如 64KB/256KB），超限直接错误；
- Android Host -> UI 不应把大 base64 走 `evaluateJavascript`（超过阈值强制改走 `postWebMessage` 或直接返回 `bodyRef`）。

阶段 C（发送图片到目标 app）

增加一个非常明确的宿主能力（不走网络）：

- `input.commitImage({ mime, dataBase64 | fileId, label? })`

Android 侧实现方向：

- 优先走 `InputConnection#commitContent`（目标 app 支持富内容时）
- 否则 fallback：
  - 把图片写入剪贴板（若 Android 版本/权限允许）
  - 或提示用户“目标 app 不支持图片插入”

阶段 D（PC Host Service 的附件通道）

如果“Android -> PC host service -> OpenClaw/模型”要支持附件：

- 不能继续只用 JSON body（默认 256KB 会被打爆）。
- 需要新增独立的文件上传接口（例如 `POST /v1/files` 支持 multipart 或分块），返回 fileId，再在 `/render` 调用里引用 fileId。
- 仍需鉴权（token）与限流（bytes/s、并发、单文件上限）。

## 4. 建议的文档与产品约束（避免以后返工）

- 在 Function Kit 文档里把能力分层写清楚：
  - `storage.*` 仅保证轻量设置（明确 quota）
  - DOM storage 是否允许、是否隔离（必须写死，不留灰区）
  - 大数据/二进制必须走 `files.*`（或未来 `storage.file`）
- 把“AI 密钥 / host token”等敏感信息收口在宿主全局配置（必要时加密存储），不允许 kit 自己存 `apiKey`
- 给每个“高风险能力”配套：
  - 权限开关
  - 大小上限
  - 明确的错误码与 UI 提示
  - （涉及文件时）明确的生命周期/清理策略（TTL、用户可清理）

## 5. 对应 TODO（可执行拆分）

- [ ] SDK：新增 `storage.getJson/setJson` helper（只在 SDK 层做 stringify/parse）
- [ ] Android Host：明确 DOM storage 策略（关闭 or 每 kit 独立 origin），并补“按 kit 目录隔离资源根”的约束
- [ ] Android Host：为 `storage.set` 增加单 key 与总量限制，支持 diff sync，并返回稳定错误码
- [ ] 协议：新增 `files.pick/stat/release`，并为 `network.fetch` 增加 `bodyRef/response.bodyRef`（阶段 A）
- [ ] Android Host：实现 host-managed file store（kitId 隔离 + TTL + 限制），并让 `network.fetch` 能直接用 `bodyRef` 上传
- [ ] Android Host：实现 `input.commitImage`（阶段 C）
- [ ] Host Service：若要走“Android -> PC”附件，新增文件上传接口并调整 body 限制（阶段 D）
