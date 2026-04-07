# Function Kit 特殊接口可行性研究：实时监听输入、发送前拦截

> 编码：UTF-8  
> 日期：2026-03-25  
> 范围：Android IME / Function Kit / 实时输入观察 / 发送前拦截  
> 结论级别：产品设计 + 技术边界研究，不代表这些接口已经进入主线实现

## 1. 结论

- “实时监听输入”在 Android IME 层可以做出一条 **best-effort** 能力，但不能承诺为“完整、连续、权威”的文本流。
- “发送前拦截”在 Android 通用 IME 层 **很难做到 100%**。IME 能控制的是自己发出的动作，无法通吃所有 App 的“发送”按钮、手势、脚本、WebView 内按钮、语音发送、硬件键盘发送。
- 真机实测补充（QQ）：聊天输入框里 IME 右下角常是“换行”而不是“发送”，真正的发送发生在 App 内部的发送按钮上；因此 `send.intercept.ime_action` 这类能力最多只能拦截“回车/EditorAction（IME action key）”，无法拦截“点击 App 发送按钮”。
- 因此 Function Kit 不应该直接承诺：
  - “全局实时监听所有输入”
  - “全局 100% 发送前拦截，返回 true 才允许发送”
- 可行主线应该是：
  - 把“实时监听”定义成 **当前活动输入框的最佳努力观察**
  - 把“发送前拦截”定义成 **IME 自己控制的发送路径** 或 **显式确认式工作流**
  - 对必须强控的场景，转到 **App 专项适配 / Accessibility / 宿主 Agent**，而不是假装通用 IME API 能解决

## 2. Android IME 的技术边界

### 2.1 IME 实际能拿到什么

Android IME 宿主主要通过 `InputMethodService` 与当前编辑目标通信，核心接口是：

- `InputConnection`
  - 读取类：
    - `getTextBeforeCursor()`
    - `getTextAfterCursor()`
    - `getSelectedText()`
    - `getExtractedText()`
  - 写入类：
    - `commitText()`
    - `setComposingText()`
    - `finishComposingText()`
    - `deleteSurroundingText()`
    - `setSelection()`
  - 动作类：
    - `performEditorAction()`
    - `sendKeyEvent()`
- `EditorInfo`
  - 输入框类型：`inputType`
  - 动作提示：`imeOptions`
  - 自定义 `actionId`
  - 目标包名：`packageName`
- IME 生命周期 / 回调
  - `onStartInput()`
  - `onStartInputView()`
  - `onFinishInput()`
  - `onUpdateSelection()`

### 2.2 IME 拿不到什么

IME 并不是目标 App 输入框内部的 `TextWatcher`，也不是宿主 App 页面逻辑本身。它通常拿不到：

- App 内部的每一次原始文本变更事件
- App 自己点击“发送”按钮前的统一回调
- WebView / React Native / Flutter / 自绘输入框内部的完整事件流
- App 程序化修改文本时的所有中间态
- 所有发送路径的单一入口

### 2.3 `EditorAction` 的边界

`EditorAction` 很重要，但它不是“发送拦截万能入口”。

- 它只描述“当前编辑器建议 IME 提供什么动作”，例如 `send / search / done / next`
- IME 可以根据 `EditorInfo.imeOptions` 在键盘上显示“发送”或“完成”
- IME 也可以调用 `performEditorAction()`
- 但很多 App：
  - 根本不用 `EditorAction`
  - 用自定义按钮发送
  - 用 WebView 内按钮发送
  - 用手势 / 浮层 / JS 逻辑发送
  - 把 `send` 语义实现成非标准 UI 操作

所以 `EditorAction` 适合做“IME 自己的发送路径”，不适合被吹成“App 发送前统一拦截点”。

## 3. 为什么很难做到 100% 拦截

### 3.1 发送动作并不统一

Android 上的“发送”可能来自：

- 键盘右下角 action key
- App 内部按钮
- 聊天页浮动按钮
- WebView 内 HTML 按钮
- 硬件回车
- 蓝牙键盘
- 语音输入完成后的自动发送
- 无障碍脚本或自动化脚本

IME 只能稳定控制自己那部分，不能天然覆盖全部。

### 3.2 输入变化并不总经过 IME

“实时监听输入”也存在同样问题。输入框内容可能被以下来源改变：

- IME 自己提交文本
- App 自己自动填充或改写
- 粘贴
- 撤销重做
- 程序化替换
- WebView 脚本改 DOM

IME 最多只能观察到一部分结果状态，不能保证拿到所有增量事件。

### 3.3 不同输入框实现差异极大

Android 上存在大量非标准编辑器：

- 原生 `EditText`
- WebView
- React Native
- Flutter
- 游戏内自绘输入框
- 各种厂商 ROM 特殊行为

这些实现对 `InputConnection` 的支持质量差异很大。某些 App 连 `getSelectedText()` 都未必稳定，指望它们统一支持“实时观察 + 发送拦截”是不现实的。

### 3.4 100% 拦截会逼近高风险能力

如果真的想做到“无论用户怎么发，Function Kit 先审核，返回 true 才能发”，通常就要进入这些高风险路径：

- Accessibility 全局事件监听
- 悬浮层 / 叠层引导
- App 专项自动化适配
- Root / hook / 注入

这已经不是普通 Android IME 能干净承载的能力了，风险、兼容性、审核压力都会陡增。

## 4. 可行的替代交互

### 4.1 IME 自己提供发送按钮

这是最干净的方案之一。

- 前提：当前输入框 `EditorInfo` 暴露出 `send`/`done` 类 action，或者 IME 自己在工具栏提供“发送”
- 交互：
  - 用户在 IME 里点击“发送”
  - 宿主先走 Function Kit / 规则判断
  - 允许后再执行 `performEditorAction()` 或等效动作
- 优点：
  - 宿主可控
  - 权限边界清晰
  - 用户心智明确
- 缺点：
  - 只能覆盖“从 IME 发起的发送”
  - 覆盖不了 App 自己的独立发送按钮

### 4.2 确认层

这不是“硬拦截”，而是“显式确认”。

- 用户在 IME 的发送按钮上触发发送
- Function Kit 返回：
  - 允许发送
  - 拒绝发送
  - 建议改写
  - 需要二次确认
- 若需要确认：
  - IME 显示一个轻量确认层
  - 用户再点一次“确认发送”

这条链路非常适合：

- 语气检查
- 敏感词提醒
- 发送前二次润色
- 低成本 AI 审核

### 4.3 候选替换式工作流

这是当前 Function Kit 最稳的主线之一。

- 不试图控制“发送”
- 只控制“发送前文本长什么样”
- Function Kit 提供：
  - 插入候选
  - 替换候选
  - 继续润色
  - 回滚

最终仍由用户点击 App 自己的发送按钮。

优点：

- 兼容性最好
- 风险最小
- 不需要假装自己能拦截所有发送

缺点：

- 不能做强制审查
- 只能做“发送前建议”，不能做“发送前硬闸门”

### 4.4 明确的“处理后再发”模式

对高价值场景，可以引导用户采用显式流程：

1. 用户输入原文
2. 打开 Function Kit
3. 选择“润色后发送”或“审查后发送”
4. Function Kit 返回候选或风险结论
5. 用户确认写回
6. 由用户自己发送，或者由 IME 自己的发送按钮继续完成

这比“全局静默拦截”更真实，也更容易解释给用户。

## 5. 权限与隐私风险

这类能力如果做错，会迅速从“输入法辅助”变成“持续监控”。

### 5.1 风险点

- 持续读取用户正在输入的内容
- 可能覆盖密码、验证码、身份证、银行卡等敏感字段
- 可能上传用户未明确同意发送到网络的草稿文本
- 功能件开发者可能借“实时监听”收集行为数据
- “发送前拦截”可能被滥用成强制修改用户内容

### 5.2 必须遵守的约束

- 默认关闭
- 按功能件单独授权，而不是全局一刀切
- 按 App 维度授权
- 对密码类 / 敏感类输入框默认禁用
- 功能件不可在后台持续监听，只能在当前会话、当前输入框内工作
- 默认不持久化完整原文
- 默认不写日志，不把原文打进诊断信息
- 若要联网，必须额外经过 `network.fetch` / `ai.chat` / Agent 授权链

### 5.3 产品文案必须说清楚

不能写成含糊的“帮助优化输入体验”，而必须明确：

- 这是读取当前输入框内容的能力
- 这是在你点击 IME 发送按钮时才会参与判断的能力
- 它不能自动控制所有 App 的发送按钮
- 它不能保证拦截所有发送路径

## 6. 建议的能力模型

## 6.1 不要直接暴露“全局强拦截”

不要上来就给 Function Kit 一个看起来很强的：

- `send.intercept = true`

因为这会误导开发者，以为宿主真的能兜底所有发送路径。

更合理的做法是拆成三类能力：

- 读取当前输入状态
- 观察当前输入状态变化（best-effort）
- 参与 IME 自己控制的发送流程

### 6.2 能力命名建议

- `input.snapshot.read`
- `input.observe.best_effort`
- `send.intercept.ime_action`
- `send.execute.ime_action`

命名里直接体现边界，避免误解。

## 7. 分阶段 API 草案

### Phase 0：继续坚持当前稳定主线

目标：先不承诺强监听/强拦截。

已有主线：

- `context.read`
- `input.insert`
- `input.replace`
- 候选替换式工作流
- IME 内嵌输入桥接（embedded input bridge）

建议：

- 继续把“发送前处理”产品化为候选替换、确认层、显式发送按钮
- 不暴露“全局发送钩子”

### Phase 1：输入快照读取

目标：先做最稳的一层。

建议 API：

```ts
kit.input.getSnapshot(): Promise<{
  available: boolean
  packageName?: string
  inputType?: string
  imeAction?: string
  beforeCursor?: string
  selectedText?: string
  afterCursor?: string
  selectionStart?: number
  selectionEnd?: number
  bestEffort: true
}>
```

说明：

- 这不是全文镜像
- 这是“当前时刻快照”
- 适合 slash 触发、润色、语义判断、规则判断

### Phase 2：最佳努力输入观察

目标：让 Function Kit 能在当前可见会话中拿到“尽量连续”的输入变化。

建议 API：

```ts
const stop = await kit.input.observe({
  mode: "session",
  maxChars: 256,
  includeSelection: true
})

kit.on("input.update", (event) => {
  // event = {
  //   available,
  //   source,
  //   beforeCursor,
  //   selectedText,
  //   afterCursor,
  //   selectionStart,
  //   selectionEnd,
  //   bestEffort: true,
  //   confidence: "low" | "medium" | "high"
  // }
})
```

边界必须写死：

- 仅当前会话有效
- 仅当前活动输入框有效
- `bestEffort=true`
- 可能丢事件
- 可能只有快照，没有真实 delta
- 当目标 App / 输入框不配合时，只能退化成轮询式快照同步

### Phase 3：IME 自己的发送拦截

目标：只拦截 IME 自己控制的发送路径。

建议 API：

```ts
await kit.send.registerInterceptor({
  mode: "ime-action",
  timeoutMs: 1200
})

kit.on("send.intent", async (event) => {
  // event = {
  //   packageName,
  //   action: "send" | "done" | "enter",
  //   snapshot,
  //   canExecute: true
  // }
  return {
    decision: "allow" | "block" | "replace" | "confirm",
    replacementText?: string,
    reason?: string
  }
})
```

执行语义：

- `allow`：宿主继续执行 `performEditorAction()` 或等效 IME 发送动作
- `block`：本次 IME 发送不执行，向用户显示原因
- `replace`：先替换文本，再等待用户再次确认发送
- `confirm`：打开宿主确认层，用户确认后再发送

边界必须明确：

- 只覆盖 IME action key / IME 工具栏发送按钮
- 不覆盖 App 自己的发送按钮
- 不覆盖硬件键盘或 App 内自定义逻辑，除非宿主能明确识别并接管

### Phase 4：App 专项增强路径

目标：处理真正需要“更强控制”的场景，但不污染通用 API。

这类场景应单独建模为：

- App 适配器
- Accessibility 支持模块
- Agent / Skill 驱动的外部控制链

而不是继续往通用 IME runtime 里塞一个虚假的万能开关。

建议能力：

- `host.adapter.capabilities.list`
- `host.adapter.invoke`

并要求返回：

- 当前适配的是哪个 App
- 适配器能观察什么
- 适配器能拦截什么
- 可靠性等级

## 8. 推荐产品策略

### 8.1 对外承诺

可以承诺：

- 读取当前输入框快照
- 在 IME 自己的发送按钮上做发送前确认
- 在发送前提供候选替换与风险提示

不要承诺：

- 全局实时监听所有输入
- 全局发送前统一硬拦截
- 对所有 App、所有输入框、所有发送路径都生效

### 8.2 首批应该支持的场景

- 聊天自动回复：读取快照，生成候选，用户替换后自己发送
- 敏感词提醒：在 IME 自己的发送按钮上做“确认层”
- 语气检查：给出“建议发送版本”，不硬拦截 App 原生发送按钮
- 模板化回复：候选替换，不碰发送控制

### 8.3 暂时不要做的场景

- 承诺 100% 发送审核闸门
- 后台持续监听所有输入框
- 默认把实时输入上传给远程 AI
- 对第三方功能件开放强制自动发送

## 9. 最关键的技术坑

### 坑 1：误把 `InputConnection` 当成输入框内部事件总线

它不是。它更像“IME 与当前编辑器之间的一层桥”，不是 App 内部文本事件源。

### 坑 2：误把 `EditorAction` 当成所有发送动作的统一入口

它只覆盖一部分发送路径，尤其只对 IME 自己控制的 action key 最可靠。

### 坑 3：一旦上“实时监听”，隐私与权限模型会立刻变重

如果不做会话限制、App 级授权、敏感输入框禁用、默认不持久化，就很容易从“输入辅助”滑向“持续监控”。

## 10. 最终建议

- 主线先做：
  - `input.snapshot.read`
  - `input.observe.best_effort`
  - `send.intercept.ime_action`
  - 候选替换 + 确认层
- 不要做：
  - `send.intercept` 的虚假全局承诺
- 必要时另开：
  - App 专项增强链路
  - Accessibility / Agent / 宿主适配能力

这样设计，既不把 Android IME 能力吹过头，也能给 Function Kit 留下一条可持续演进的接口路线。

---

## 11. 2026-03-25 落地实现记录（WIP）

> 目标：把 4.1/4.2/6.1 提到的“best-effort 输入观察”和“IME 自己的发送拦截”做成可用的最小闭环，并把边界写死。

### 11.1 关键边界（写死）

- `input.observe.best_effort`：
  - 不是 keypress 事件流，不保证每次变更都通知。
  - 本质是让宿主更频繁地推送 `context.sync` 快照（节流 + 去重）。
  - 仅作用于当前 IME 会话与当前活动输入框（依赖 `InputConnection`）。
- `send.intercept.ime_action`：
  - 只拦截 IME 自己控制的“回车 / editorAction”路径（`performEditorAction` 或 `KEYCODE_ENTER`）。
  - 不承诺拦截 App 内“发送按钮”或 WebView 内按钮。
  - Fail-open：超时/异常默认放行，避免键盘把用户“卡死”。

### 11.2 Runtime 权限（新增）

- `input.observe.best_effort`
- `send.intercept.ime_action`

注意：Android 侧为这两项新增了设置开关（默认开启，可在 Function Kit 设置中关闭）。

### 11.3 Host-Bridge 协议（新增消息）

输入观察（best-effort）：

- UI -> Host：
  - `input.observe.best_effort.start`（payload 支持 `throttleMs`/`maxChars`）
  - `input.observe.best_effort.stop`
- Host -> UI：
  - `input.observe.best_effort.ack`
  - 输入变化本身不新增 update 消息，而是复用 `context.sync`（payload 中附带 `request.reason = "input.observe.best_effort"` 与 `observe{...}` 元数据）

发送拦截（IME action）：

- UI -> Host：
  - `send.intercept.ime_action.register`（payload 支持 `timeoutMs`）
  - `send.intercept.ime_action.unregister`
  - `send.intercept.ime_action.result`（payload: `{ allow: boolean }`；通过 `replyTo` 关联 intent）
- Host -> UI：
  - `send.intercept.ime_action.ack`
  - `send.intercept.ime_action.intent`（payload: `{ intent, context, bestEffort: true }`）

### 11.4 SDK 对功能件开发者的用法（优化前后对比）

旧思路（没有专门 API）：

- 功能件只能靠 `context.refresh()` / 手动刷新获取快照，或自己做轮询与各种状态管理。
- 发送前拦截也没有入口，只能做“候选替换式工作流”，无法参与 IME action。

新思路（SDK 提供高层 API，细节在 Host/Bridge 内部解决）：

#### 11.4.1 实时监听输入（best-effort）

```js
// 1) 启动 best-effort 观察（宿主会更频繁 push context.sync）
const stop = await kit.input.observeBestEffort({ throttleMs: 120, maxChars: 256 });

// 2) 监听 context.sync 的状态变化（推荐 subscribe）
const unsubscribe = kit.subscribe((state) => {
  // state.context 是宿主快照（beforeCursor/afterCursor/selection/preedit 等）
  // 当 request.reason === "input.observe.best_effort" 时，说明是观察触发的同步
  console.log("context", state.context);
});

// 3) 需要时停止
await stop();
unsubscribe();
```

说明：

- `observeBestEffort` 仅负责开关，不负责回调；变化通过 `context.sync` 进入 `kit.state.context`。
- `throttleMs` 范围建议：`16..2000`；`maxChars` 建议：`16..1024`。

#### 11.4.2 发送前拦截（IME action）

```js
await kit.send.registerImeActionInterceptor({ timeoutMs: 800 });

// 当用户按下 IME 的回车 / 发送 action 时触发
const off = kit.send.onImeActionIntent(async ({ intent, context }) => {
  // intent.kind: "key.enter" | "editorAction"
  // intent.actionId / intent.actionLabel: 仅 editorAction 场景可能存在

  const text = context?.beforeCursor ?? "";
  const shouldBlock = /泄密|转账/.test(text);
  return { allow: !shouldBlock };
});

// off() 可移除监听；也可调用 unregister
```

说明：

- SDK 会自动回发 `send.intercept.ime_action.result`，功能件只需要返回 `boolean` 或 `{allow}`。
- 宿主超时/异常默认放行；若 UI 想更强控制，需要在产品层做“确认层/二次发送”，而不是假装全局强拦截。

### 11.5 功能件 Manifest 需要怎么写

- `runtimePermissions` 里显式声明：
  - `input.observe.best_effort`
  - `send.intercept.ime_action`
- `hostBridge.uiToHost/hostToUi` 列表中声明新增的 message type（否则属于“未声明协议”）。

### 11.6 Android 侧实现点（落地细节）

输入观察：

- `input.observe.best_effort.start/stop` 在 `FunctionKitWindow` 内处理：
  - 读取 `throttleMs/maxChars`
  - 节流（按上次发送时间）
  - 去重（签名：包名 + selection + before/after/selected/preedit）
  - 触发后用 `dispatchContextSync(...)` 推送 `context.sync`

发送拦截：

- IME 回车/动作键入口在 `FcitxInputMethodService.handleReturnKey()`：
  - 解析 `FunctionKitImeSendIntent`：
    - `kind = "key.enter"`（直接 enter）
    - `kind = "editorAction"`（带 `actionId/actionLabel`）
  - 若当前 `localInputTarget` 是 `FunctionKitWindow` 且已注册拦截，则先发起 intent，等待 allow 决策
  - 失败/超时默认放行

权限与设置：

- Android 增加开关项：
  - `function_kit_permission_input_observe_best_effort`
  - `function_kit_permission_send_intercept_ime_action`

### 11.7 过程记录（补全现状与真实阻塞）

阅读/核对（关键文件）：

- Runtime SDK：
  - `TODO/function-kit-runtime-sdk/src/index.js`
  - `TODO/function-kit-runtime-sdk/src/index.d.ts`
  - `TODO/function-kit-runtime-sdk/schemas/function-kit-manifest.schema.json`
  - `TODO/function-kit-runtime-sdk/tests/*`
- Host-Bridge：
  - `TODO/function-kits/host-bridge/message-envelope.schema.json`
- Android Host（fcitx5-android）：
  - `.../input/functionkit/FunctionKitWebViewHost.kt`
  - `.../input/functionkit/FunctionKitWindow.kt`
  - `.../input/FcitxInputMethodService.kt`
  - `.../data/prefs/AppPrefs.kt`
  - `.../input/functionkit/FunctionKitPermissionPolicy.kt`
  - `.../ui/main/settings/behavior/FunctionKitSettingsFragment.kt`
  - `.../res/values/strings.xml`、`.../res/values-zh-rCN/strings.xml`

当前状态（2026-03-25）：

- 协议/SDK/Android 侧代码已完成落地（WIP），但仍需要：
  - 跑通 `:app:testDebugUnitTest` 并真机验证拦截路径（避免 UI 未回包导致阻塞）。
  - 在示例功能件里补齐 `runtimePermissions` 与 `hostBridge` 消息声明（否则开发者会“看不到该能力”）。
