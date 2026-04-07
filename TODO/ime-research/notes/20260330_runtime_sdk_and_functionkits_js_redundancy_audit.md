# Runtime SDK & Function Kits：JS 冗余/不必要写法审计（以 SDK/协议层为主）

> 编码：UTF-8  
> 日期：2026-03-30  
> 状态：DRAFT（根据反馈已调整重点）  
> 范围：`TODO/function-kit-runtime-sdk/` + `TODO/function-kits/*/ui/app/main.js`  
> 目标：识别 **Runtime SDK / 协议层** 的冗余与易误用点，给出“该删什么/该收敛什么/该如何让 AI 更容易稳定地产出 kit 代码”的建议。  
> 重要前提：当前 `TODO/function-kits/*` 大多是验收/测试载体（可随时删除），因此本报告**不建议投入建设 Function Kits 的共享 UI JS**。

---

## 0. 结论（你真正关心的点）

1) **UI 冗余不用管**：这些 kit 本身是验收/实验性质，删了就没了；UI 层用 JS 改是常态，而且后续多数代码会由 AI 生成。  
2) 真正值得收敛的是 **Runtime SDK 的“接口面”与“契约一致性”**：让 AI/人写 kit 时不需要知道协议细节，也不容易写出“看似能跑但长期难维护”的代码。  
3) 当前最主要的冗余/误导来源：
   - **`createClient` 的 API 面混杂（namespaced API + legacy alias 同时存在）**，会诱发混用；
   - **文档漂移**（能力列表落后于实际实现），属于“隐性冗余”；
   - **握手里 permissions 的来源与职责边界**需要产品决策并写进契约（否则两端迟早不一致）。

---

## 1. 现状定位：哪些东西是“要长期维护”的

### 1.1 会长期存在（必须干净）

- Host Bridge 协议（envelope 类型、payload 结构、错误模型）
- `manifest.json`（runtimePermissions / discovery / ai backend hints 等）
- Runtime SDK（浏览器端统一入口：`createKit`）
- Host 侧适配器（Android/Windows 的 WebView 容器与权限/存储/上下文/网络/AI 路由）

### 1.2 可随时删除（不值得做“共享库”）

- `TODO/function-kits/*/ui/app/main.js` 这些“验收 kit”
- 各种 UI 层 helper（除非它直接沉淀为 SDK 的稳定能力）

> 这意味着：我们不做 “shared/ui/kit-ui.js”，因为它本质是给“长期维护的大量 kit”服务的；而你现在的策略是“kit 是内部产物 + AI 生成 + 快速迭代/随时替换”。

---

## 2. Runtime SDK 冗余/不必要写法清单（最重要）

### 2.1 `createClient` 的 API 面“重复命名/双入口”会误导

在类型声明 `TODO/function-kit-runtime-sdk/src/index.d.ts` 里，`FunctionKitClient` 同时暴露两套语义高度重合的入口：

- namespaced：
  - `runtime.connect(...)`
  - `context.requestSnapshot(...)`
  - `input.insertText/replaceText/commitImage(...)`
  - `candidates.regenerate(...)`
  - `settings.open(...)`
- legacy alias（同语义不同命名）：
  - `ready(...)`
  - `requestContext(...)`
  - `insertText/replaceText/commitImage(...)`
  - `regenerateCandidates(...)`
  - `openSettings(...)`

这类重复会带来：

- **AI 容易混用**（不同 kit 生成不同风格），导致“读代码像读多种方言”；
- 文档要解释两套，长期必然漂移；
- 后续重构/新增能力时，要维护两套入口，成本翻倍。

建议（不涉及 UI，不影响你“kit 可删”的策略）：

- **文档只推荐 `createKit`**，并且在 `createKit` 文档中明确：不要直接用 `createClient`；
- `createClient` 保留为 escape hatch（`raw.send/raw.on`），但把 legacy alias 标注为 deprecated（至少先从 docs/示例里移除）。

### 2.2 `createKit.connect()` 的 requestedPermissions：职责边界需要明确

当前 `createKit.connect()` 会：

1) 从缓存/显式 options/读取 manifest 得到 `requestedPermissions`
2) 把 `requestedPermissions` 一起作为握手 payload 发给宿主

但在你的产品模型里，**权限属于宿主管理页面**（像浏览器扩展），宿主本来就能从 manifest 推导权限。

这里有两种策略（需要你拍板选一个，然后写进契约/文档）：

- **策略 A（更干净/更像浏览器）**：UI 不发送 `requestedPermissions`；宿主只按 manifest + 用户授权矩阵决定 `grantedPermissions`。  
  - 优点：UI 更少耦合，AI 写 kit 更简单；更符合“权限是宿主的事”。  
  - 代价：preview/mock host 需要单独入口（但这本来就该由 KitStudio/测试工具承担）。
- **策略 B（更严格的一致性校验）**：UI 发送 `requestedPermissions`，但宿主要校验它必须是 manifest 的子集；最终 `grantedPermissions` 仍由宿主决定。  
  - 优点：可以早发现“UI/manifest 漂移”问题。  
  - 代价：协议复杂度上升；AI 生成代码时又多一个“必须填正确”的坑。

本次审计不替你选策略，但建议：**不要保持“现在这种既发送又不明确谁是权威”的模糊状态**。

### 2.3 SDK 内置 preview polyfill：可以保留，但要明确“它不是长期产品能力”

`createKit` 支持 `preview.installIfMissing(...)` 的 mock host，这对验收/测试很方便；但从你的方向看，未来应该由 **KitStudio（开发者工具）** 来承担“无真机运行”。

建议：

- 继续保留 preview（方便单元测试/最小可运行示例），但在 docs 明确它是 dev-only；
- 或者后续把 preview 拆成独立 bundle（production runtime 更小、更干净）。

### 2.4 文档漂移属于“冗余/误导”

`TODO/function-kit-runtime-sdk/docs/CAPABILITIES_AND_PERMISSIONS.md` 仍停留在早期能力列表，没有覆盖后来新增的：

- `network.fetch`
- `ai.request` / `ai.agent.run`
- `files.pick`
- `tasks.*`
- `send.intercept.ime_action`

这不是“写少了点文档”这么简单，而是会直接导致：

- AI/人生成的 kit 代码出现“重复防御性逻辑”（因为不确定能力是否存在）
- 业务/宿主两端对能力的理解不一致

建议把该文档视为“契约的一部分”，必须与 types/schema 同步（最好有 CI 校验或从单一来源生成）。

---

## 3. “功能件 JS 写法”层面的冗余：只给规则，不建共享库

你说得对：UI 层用 JS 改是正常的，而且这些 kit 会删。这里给的不是“做共享 UI JS”，而是给 AI/内部写 kit 的 **最小规则**：

1) **永远用 `FunctionKitRuntimeSDK.createKit(...)`**，不要再写协议级 `switch(envelope.type)`。  
2) **不要显式写 `connect: { timeoutMs: 20000, retries: 3 }`**（SDK 已默认）。  
3) **不要维护一份“复制的宿主状态”**（permissions/hostInfo/context/candidates 这类尽量从 `kit.state` 读；业务只保存 UI 派生态）。  
4) `open_options` 这类 intent 的解析要统一写法（否则 AI 会生成五花八门的判断）。

---

## 4. 面向 AI 的“最小可用 kit 写法”（建议作为模板/提示词基线）

下面是一份 **尽量短、尽量少坑** 的骨架示例（强调：这是写法约束，不是 UI 共享库）：

```js
const kit = globalThis.FunctionKitRuntimeSDK.createKit({ kitId, surface: "panel", debug: true });

function render() {
  const { connected, permissions, hostInfo, context, lastError } = kit.state;
  // 这里直接用 kit.state 做 UI 渲染，不要复制一份 state.permissions/state.hostInfo...
}

kit.subscribe(render);

kit.on("host.update", ({ details }) => {
  const intent = details?.intent;
  if (intent?.kind === "open_options") {
    // 切到 options UI（kit 自己决定如何实现）
  }
});

kit.connect().catch(() => {});
```

这份骨架的价值：让 AI 生成 kit 时把精力花在“业务 UI/交互”上，而不是重复造协议轮子。

---

## 5. 建议的下一步（真正有用、且不浪费在“会删的 kit”上）

1) **拍板权限握手策略 A/B**，写进协议文档并让 host/UI/KitStudio 对齐。  
2) **把 `createKit` 作为唯一推荐入口**：示例/README/文档全部只写 `createKit`。  
3) **给 `createClient` 的 legacy alias 做降权**：不出现在文档/示例，必要时标注 deprecated。  
4) **修正文档漂移**：让能力列表与 types/schema 同步，避免 AI/人重复写防御性代码。

---

## 6. 参考路径（本次审计涉及的关键文件）

- Runtime SDK：
  - `TODO/function-kit-runtime-sdk/README.md`
  - `TODO/function-kit-runtime-sdk/src/index.js`
  - `TODO/function-kit-runtime-sdk/src/index.d.ts`
  - `TODO/function-kit-runtime-sdk/docs/CAPABILITIES_AND_PERMISSIONS.md`
  - `TODO/function-kit-runtime-sdk/docs/BROWSER_EXTENSION_STYLE_API_V2.md`
- 验收 kits（仅用于观察写法趋势，不建议为其建设共享库）：
  - `TODO/function-kits/chat-auto-reply/ui/app/main.js`
  - `TODO/function-kits/quick-phrases/ui/app/main.js`
  - `TODO/function-kits/runtime-lab/ui/app/main.js`
  - `TODO/function-kits/file-upload-lab/ui/app/main.js`
  - `TODO/function-kits/ime-hooks/ui/app/main.js`
  - `TODO/function-kits/bridge-debugger/ui/app/main.js`
