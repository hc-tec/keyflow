# Function Kit 的 contextmenu / 剪贴板触发 / 快捷入口机制（Android-first）

> 编码：UTF-8  
> 日期：2026-03-25  
> 最后更新：2026-03-30  
> 状态：DRAFT  
> 范围：Android-first 的 Function Kit 触发发现层，不依赖长期在线电脑宿主。

## 0. 结论先行

Android 上不应照搬桌面浏览器的“右键菜单扩展”心智，而应落成一套由 IME 宿主控制的 `binding` 机制：

- `selection`：用户正在输入，且当前**输入框**存在可读选择区或附近文本（`InputConnection` 可读）。
- `clipboard`：用户刚复制了内容，宿主检测到新剪贴板项。
- `manual`：用户主动从工具栏 / More / 面板快捷入口进入。

2026-03-30（实装口径更新）：

- `Bindings` 作为 **工具栏一级入口**（魔棒按钮），用于“主动触发”。
- 点击某个 binding 后，默认 **不再打开 kit 面板**，而是让 kit 在后台处理（headless），尽量保持用户留在当前输入框。
- 为避免“切换窗口导致拿不到 selection/上下文”，binding 触发时由宿主先 **抓取一次 InputConnection 上下文快照**，随 `binding.invoke` 一起下发。

重要澄清：

- 这里的 `selection` **只指输入框内部 selection**（IME 通过 `InputConnection` 能读到的那种），不是“App 页面/网页正文里用户手指划选的任意文字”。
- 对于“正文 selection”的处理，Android IME 正常权限模型下**拿不到**。现实可行的主线只有两条：
  - 用户执行“复制”后走 `clipboard` 触发；
  - 或引入无障碍（Accessibility）/截图/OCR 等高权限方案（隐私与审核成本高，不建议做主线）。

核心原则只有三条：

1. Function Kit 只负责声明“我可以处理什么”，不直接偷读选择区或剪贴板。
2. 真正的数据读取、入口呈现、触发确认全部由宿主完成。
3. Android **没有输入焦点时无法可靠“强行弹出 IME 并注入到某个输入框”**；因此无焦点场景必须走“通知/宿主 Activity/等待用户点输入框”的路径，悬浮窗（overlay）只能作为可选实验项。

### 0.1 对齐：你想要的“复制 → 提示 → 动作菜单”体验

你描述的目标体验更像“浏览器右键菜单/网页 contextmenu”，但在 Android IME 上需要换成“剪贴板触发的动作菜单”。目标心智如下：

1. 用户在聊天记录/网页等区域 **复制** 一段文本（IME 未必处于激活态）。
2. 宿主在 **5 秒内**给用户一个“可处理剪贴板内容”的提示入口（理想是悬浮提示；现实默认是通知 / 下一次唤起 IME 时提示）。
3. 用户点击提示后：
   - 若当前已有输入焦点：直接在 IME 内进入一个“动作菜单页面”，列出所有 kit 注册的 clipboard bindings（一个 kit 可以有多个 binding）。
   - 若当前没有输入焦点：无法直接把 IME 插进 QQ/网页输入框，只能：
     - 打开宿主 Activity 让用户先选 binding 处理；结果写回剪贴板；用户回到 App 再粘贴；或
     - “武断地”要求用户先点输入框，IME 出现后自动进入动作菜单（推荐的默认策略）。

### 0.2 可行性快查（你问的两个关键点）

你关心的其实是两件事：

1. 复制后能不能“像悬浮窗一样”提示用户？
2. 用户点了提示后，能不能在“没有任何输入框激活”的情况下弹出 IME？

结论先写死：

- **提示可以做**，但默认主线更像 “5 秒 heads-up 通知” 而不是 overlay 悬浮窗。
- **无输入焦点弹 IME 基本不可行**（除非你愿意把体验改成“打开宿主 Activity/overlay UI”，而不是“把 IME 塞进当前 App”）。

可行性矩阵（建议的产品策略）：

| 场景 | 能否提示 | 建议提示形态 | 点击后能否进入 IME 面板 | 结果写回哪里 |
| --- | --- | --- | --- | --- |
| IME 已显示（用户在输入框） | 能 | IME 内 chip/动作条 | 能 | `InputConnection`（直接上屏） |
| IME 未显示（无输入焦点） | 能，但有代价 | heads-up 通知（5s）或宿主 Activity | 不能稳定“塞回原 App” | 剪贴板（用户回去粘贴） |
| IME 未显示 + 允许 overlay（实验） | 能，但重权限 | 5s overlay chip（可选） | 仍不能“塞回原 App” | 剪贴板（或打开宿主 Activity） |

## 1. 背景与问题定义

当前 Function Kit 已经有：

- 工具栏入口
- More 面板入口
- 面板式 Web UI
- Embedded Input Bridge（点击 kit 内输入框后，面板在上、键盘在下）

但仍缺一层“用户发现能力”的机制：

- 用户复制了一段内容，不知道哪个 kit 能处理。
- 用户选中了一段输入框文本，不会主动去翻所有 kit。
- 某些 kit 有多个动作，不只是“打开面板”。

所以需要一层统一的 `binding` 发现层，让 kit 能声明：

- 我能处理哪些来源
- 我希望如何被宿主呈现
- 我拿到什么数据
- 用户触发后，是打开面板，还是执行一个明确 action

这层机制的目标不是“让 kit 获得更多后台读取权”，而是“让宿主更好地把可用能力呈现给用户”。

## 2. 目标

### 2.1 要解决的问题

- 让 Function Kit 不再只靠“用户记得去点工具栏按钮”才能被发现。
- 让常见来源（选择区、剪贴板、手动入口）都能进入同一个发现层。
- 保持 Android-first：大部分能力在手机上可独立工作。
- 保持权限边界清晰：kit 不应私自读取敏感内容。

### 2.2 明确不做的事

- 不做桌面浏览器式全局右键菜单注入。
- 不做默认悬浮窗打断用户。
- 不做 kit 自己注册后台监听器、自己读剪贴板、自己扫选择区。
- 不做“无焦点时强行弹出 IME 面板”的黑魔法。

## 3. 触发来源模型

### 3.1 `selection`

定义：

- 当前有激活的输入连接（`InputConnection`）
- 用户正在某个输入框中
- 宿主可读到：
  - `selectedText`
  - 或者 `beforeCursor/afterCursor`
  - 或者当前输入框上下文快照

适合场景：

- 改写选中文本
- 翻译 / 总结 / 润色
- 保存到笔记 / 待办
- 生成回复候选

关键限制：

- **selection 仅限输入框**：IME 无法拿到非输入框的 selection（例如网页正文/聊天记录区域/阅读器正文），不要把它当浏览器右键菜单的“任意文本右键扩展点”。
- Android IME 并不保证所有 App 都能返回完整选中文本。
- 某些输入框只给出光标附近文本，不给 selection。
- 所以 `selection` 触发必须接受“选区为空，但仍有附近文本”的降级情况。

### 3.2 `clipboard`

定义：

- 用户复制了新内容
- 宿主检测到新的剪贴板项
- 宿主决定是否提示“可处理此内容的 Function Kit”

适合场景：

- 剪贴板翻译
- 总结 / 提炼 / 转格式
- 保存到知识库
- 发给 AI 继续处理

关键限制：

- 剪贴板天然敏感，不能让 kit 持续读取。
- 即使宿主已经启用了剪贴板监听，也不等于 kit 自动获得读取权。
- 无焦点时 IME 面板通常不能直接作为主入口弹出。

### 3.3 `manual`

定义：

- 用户主动点入口

入口形态：

- 工具栏固定入口（`Bindings` 一级按钮）
- More 面板
- kit 面板内部快捷动作
- 将来的“最近使用绑定”

适合场景：

- 打开完整 kit 面板
- 用户主动选择要处理哪类内容
- 作为 `selection/clipboard` 发现层的兜底入口

## 4. 宿主 UI 呈现：候选栏 / 工具栏 / 浮窗 / 通知 的取舍

这里不能把所有来源都塞进同一种 UI。Android 上要按“当前是否有焦点”来分层。

### 4.1 候选栏

优点：

- 离用户当前输入位置最近
- 适合展示 1 到 3 个高相关动作
- 适合 selection 场景

缺点：

- 空间非常有限
- 适合短动作，不适合承载大量 kit
- 与输入法候选词共享注意力，不能过载

结论：

- `selection` 的首选呈现层。
- 只展示高置信度、短文案动作。
- 更像“Action Strip”，不是传统浏览器右键菜单。

### 4.2 工具栏

优点：

- 稳定、可预期、用户可主动找回
- 适合固定入口和最近使用入口
- 不依赖系统通知权限

缺点：

- 需要用户已经打开 IME
- 显著性弱于“刚复制就出现提示”

结论：

- `manual` 的主入口。
- `selection` 的候选栏 fallback。
- `clipboard` 在 IME 已激活时可作为提示入口。

### 4.3 浮窗 / 悬浮窗

优点：

- 理论上最显眼

缺点：

- 需要额外 overlay 权限
- 容易打扰用户
- 系统行为与 ROM 差异大
- 与“输入法宿主应该克制”这条原则冲突

结论：

- 不作为 v0 主线（默认关闭）。
- 若做（实验项）：只能作为“提示/入口”，点击后进入宿主 Activity，或设置短时 pending 标记等待用户点输入框唤起 IME 后再进入动作菜单。

### 4.4 通知

优点：

- 无焦点时仍可工作
- 适合 `clipboard` 触发
- 系统级、可回看、可撤销

缺点：

- Android 13+ 受通知权限影响
- 响应路径比工具栏更长
- 不适合高频刷屏

结论：

- `clipboard` 在“当前没有输入焦点”时的首选提示层。
- 仅用于“新剪贴板内容可被处理”的轻提示，不直接执行。

### 4.5 最终取舍

- `selection`：候选栏优先，工具栏兜底
- `clipboard`：IME 激活时走工具栏提示；IME 不活跃时走通知
- `manual`：工具栏 + More 面板
- `浮窗`：拒绝作为主线

## 5. 权限模型：避免 kit 私自读取

这是整套机制最重要的部分。

### 5.1 三层边界

第一层：`声明`

- kit 在 manifest 中声明自己支持哪些 `bindings`
- 例如支持 `selection`、`clipboard`、`manual`

第二层：`宿主启用`

- 宿主为每个 kit 单独控制：
  - 是否允许 selection bindings
  - 是否允许 clipboard bindings
  - 是否显示 manual 入口

第三层：`一次性数据授予`

- 真正触发时，宿主只把本次触发的数据作为 invocation payload 发给 kit
- 而不是给 kit 一个长期 `selection.read` 或 `clipboard.read` 后台能力

### 5.2 推荐权限语义

不要把这套能力设计成“kit 可以随时调用的原始读取 API”，而应拆成：

- `binding.selection`
  - 允许该 kit 注册 selection 触发
  - 不等于 kit 可以随时读取当前输入框
- `binding.clipboard`
  - 允许该 kit 出现在剪贴板相关提示中
  - 不等于 kit 可以后台轮询剪贴板
- `binding.manual`
  - 允许该 kit 出现在工具栏 / More / 快捷入口中

真正的数据以一次性 payload 下发，例如：

- `selection.text`
- `selection.beforeCursor`
- `selection.afterCursor`
- `clipboard.text`
- `clipboard.timestamp`

如果需要在“无焦点 clipboard 场景”完成闭环（处理后让用户去粘贴），建议额外提供一个更安全的能力：

- `clipboard.write`（宿主写剪贴板）
  - 仅允许在“用户点了某个 binding 动作”之后调用
  - 必要时让宿主弹一次确认（或提供撤销）
  - **不建议提供** `clipboard.read` 这种可随时调用的原始读取 API（隐私边界会被做烂）

### 5.3 明确禁止

- kit 自己发起“读取当前剪贴板”的通用 API
- kit 在没有用户触发时主动读取 selection/context
- kit 通过后台常驻逻辑监听敏感来源

### 5.4 用户视角

用户看到的权限文案不应是技术名词，而应是：

- 允许此功能件出现在“选中文本可处理”入口中
- 允许此功能件出现在“剪贴板可处理”提示中
- 允许此功能件固定显示在快捷入口中

这比“允许读取剪贴板”更准确，因为真正读取动作仍由宿主在用户触发后执行。

## 6. 调用链设计

完整调用链应当是：

1. kit 注册
2. host 展示
3. 用户触发
4. host 打开 kit 或执行 action

### 6.1 kit 注册

建议采用静态 manifest 注册，最小结构如下：

```json
{
  "bindings": [
    {
      "id": "rewrite-selection",
      "title": "改写选中文本",
      "triggers": ["selection"],
      "entry": "panel",
      "requestedPayloads": ["selection.text"],
      "preferredPresentation": "candidate-strip"
    },
    {
      "id": "process-clipboard",
      "title": "处理剪贴板",
      "triggers": ["clipboard"],
      "entry": "panel",
      "requestedPayloads": ["clipboard.text"],
      "preferredPresentation": "notification"
    },
    {
      "id": "open-assistant",
      "title": "打开助手",
      "triggers": ["manual"],
      "entry": "panel",
      "requestedPayloads": []
    }
  ]
}
```

v0 不建议让 kit 在运行时动态注册 bindings。静态 manifest 更稳定、更可审计。

### 6.2 host 展示

宿主将全部 kit bindings 编译成一个 `BindingRegistry`，按来源维护索引：

- `selection -> bindings[]`
- `clipboard -> bindings[]`
- `manual -> bindings[]`

宿主在运行时做过滤：

- 该 kit 是否启用
- 该 binding 权限是否启用
- 当前来源是否可用
- 当前 App/输入场景是否匹配
- 是否达到最小文案/优先级阈值

### 6.3 用户触发

来源分别是：

- `selection`
  - 宿主在候选栏或工具栏显示动作
  - 用户点击动作
- `clipboard`
  - 宿主显示工具栏提示或通知
  - 用户点击动作
- `manual`
  - 用户主动点工具栏 / More

### 6.4 打开 kit / 执行 action

宿主生成一次 invocation：

```json
{
  "bindingId": "rewrite-selection",
  "trigger": "selection",
  "payload": {
    "selection": {
      "text": "原始文本"
    }
  }
}
```

然后有两种结果：

- `open-kit`
  - 打开该 kit 面板
  - kit 用 payload 初始化 UI
- `execute-action`
  - 执行一个轻量动作
  - 再将结果写回候选、输入框、剪贴板或通知结果页

### 6.5 Android-first 的建议

v0 不做真正 headless action。统一先走 `open-kit`：

- 设计简单
- 权限清晰
- 易于调试
- 能利用现有 panel/runtime

`execute-action` 可以放到 v1。

## 7. Android 可行性限制：无焦点时 IME 能做什么、不能做什么

这里必须说清楚，否则方案会跑偏。

### 7.1 有输入焦点时，IME 能做什么

- 读取当前输入框的一部分上下文
- 读取选择区（如果目标 App 愿意提供）
- 展示 IME 面板、候选栏、工具栏
- 通过当前 `InputConnection` 写回文本
- 打开 Function Kit 面板，并在同一个 IME 里完成交互

### 7.2 无输入焦点时，IME 不能稳定做什么

- 不能指望直接弹出输入法面板并接管当前界面
- 不能访问当前输入框 selection/context，因为没有活跃 `InputConnection`
- 不能向任意 App 静默注入文本
- 不能实现桌面浏览器那种全局右键菜单扩展点

### 7.3 无输入焦点时，IME 仍然能做什么

- 如果应用进程仍存活，可维护本地配置、binding 注册表、最近使用记录
- 可监听宿主自己已经启用的剪贴板历史能力（但要意识到：**Clipboard 变化没有系统广播**，监听器需要进程存活）
- 可发通知，引导用户回到 app 或打开宿主 Activity 处理剪贴板（Android 13+ 需要通知权限）
- 可启动宿主自己的 Activity / 设置页

补充一个经常被忽略的“工程现实”：

- **想做到“任何 App 里一复制就 5 秒提示”**，你需要一个“总能活着”的监听点。
- Android 不会在每次剪贴板变化时拉起你的进程；`ClipboardManager.OnPrimaryClipChangedListener` 只在进程已运行时生效。
- 结论是：如果不引入更重的机制（前台常驻/无障碍等），就必须接受“提示并非 100% 出现”的现实，并把兜底放在 IME 内（下次用户点输入框时提示）。

### 7.4 现实结论

所以“用户复制之后，没有点击任何输入框，就让输入法自己弹出来”这件事，不应该是主线设计。

Android-first 的正确做法是：

- 有焦点：候选栏 / 工具栏 / kit 面板
- 无焦点：通知（点击后进入宿主 Activity，或设置短时 pending 标记等待用户点输入框唤起 IME 再进入动作菜单）

而不是靠悬浮窗或强行拉起 IME。

### 7.5 关于“复制后无输入框激活，弹出 IME 面板”的结论（写死）

这件事在 Android 上**不可靠、也不应作为主线**。

原因很直接：

- IME 的 UI（候选栏/键盘/Function Kit 面板）本质上依附于“当前有焦点的 editor（`InputConnection`）”。
- 没有 editor 焦点时：
  - 你拿不到 `InputConnection`，所以不能读写输入框，也无法把 kit 结果“直接上屏”；
  - 你也很难在系统层面“强行把 IME 叫出来并覆盖当前应用 UI”，除非走 overlay/Activity 这种完全不同的 UI 形态。

把话说得更直白一点：**Android 没有一个“把键盘塞进当前 App 但又不需要任何输入框 focus”的官方能力**。
你能做到的，只是：

- 用户自己点一个输入框，系统拉起 IME；
- 或你打开自己的 Activity/overlay（这已经不是“弹出 IME”，而是“你自己画 UI”）。

因此无焦点 clipboard 场景的正确产品路线只能是：

1. **通知（推荐主线）**：提示“新剪贴板可处理”，用户点进来再处理。
2. **宿主 Activity（可选）**：打开一个独立页面（不需要输入框焦点）来展示可用 bindings、运行处理，并把结果写回剪贴板；用户回到目标 App 后再手动粘贴。
3. **把结果“挂起到 IME”**：当用户之后再次聚焦任意输入框、IME 出现时，在工具栏/候选栏显示“刚处理好的剪贴板结果 · 一键粘贴”，实现闭环。

### 7.6 如果坚持做“复制后 5 秒悬浮窗提示”（实验项）

可以做，但必须把限制写清楚：

- 需要额外 overlay 权限（`SYSTEM_ALERT_WINDOW` / `TYPE_APPLICATION_OVERLAY`），ROM 差异和用户信任成本都很高。
- 悬浮窗只能作为“提示/入口”，**不能绕过 editor 焦点直接把结果写进目标 App**。
- 建议形态：
  - 仅在检测到新剪贴板内容后出现；
  - 自动 5 秒消失（用户未点击则不再打扰）；
  - 点击后只做两件事之一：打开“宿主 Activity 版剪贴板处理页”，或打开 Function Kit 管理页（让用户随后在输入框内使用）。
- 默认应关闭，且必须有“最近一次触发来源/频率”可观测，避免变成骚扰源。

## 8. 宿主呈现模型建议

### 8.1 `selection` 触发：Action Strip

不是传统右键菜单，而是 IME 候选栏附近的一排动作：

- 最多 3 个
- 文案短
- 点击后直接打开 kit 面板

示例：

- 改写
- 总结
- 翻译

### 8.2 `clipboard` 触发：Clipboard Suggestion

有焦点时：

- 在工具栏显示一个短横幅或 chip
- 文案类似：`检测到新剪贴板内容 · 可用功能件 2 个`

无焦点时：

- 发通知（推荐；必要时可做“5 秒自动撤销”，避免刷屏）
- 点击后进入“剪贴板可处理项”页面（宿主 Activity），在该页面里选择 binding 并处理
- 或者：点击后仅设置一个 5 秒有效的 pending 标记；用户随后点输入框唤起 IME 时，直接打开 clipboard bindings 动作菜单（更贴近“点击提示后进入 IME 菜单”的心智）
- 处理结果写回剪贴板，并记录为 `pendingPaste`；等用户下次聚焦输入框、IME 出现时再提示“一键粘贴”

无焦点时（实验项）：

- 若用户授予 overlay 权限，可显示 5 秒悬浮提示 chip；点击后同样只进入宿主 Activity（不直接弹 IME 面板）

### 8.3 `manual` 触发：Quick Access

入口层级：

1. 工具栏固定入口
2. More 面板
3. 最近使用绑定（未来）

## 9. 最小可落地版本

### 9.1 v0

目标：先把发现层跑起来，不引入复杂后台执行。

范围：

- 支持静态 manifest `bindings`
- 支持三种触发来源：`selection / clipboard / manual`
- 仅支持 `open-kit`，不支持 headless `execute-action`
- `selection`
  - 有焦点时在候选栏附近显示 1 到 3 个动作
- `clipboard`
  - IME 已激活时：在候选栏/工具栏提供“剪贴板可处理”入口，点击进入动作菜单页面（clipboard bindings）
  - 无焦点时：不试图强行弹 IME（Android 不可靠）；v0 可先不提示（后续在 v1 用通知/Activity 补齐）
- `manual`
  - 工具栏与 More 面板都能看到入口
- 权限全部由宿主管理，kit 只拿一次性 payload

为什么先这样：

- 完全复用现有 Function Kit 面板和 runtime
- 不需要 overlay
- 不需要通知权限
- 调试最简单

### 9.2 v1

目标：补足你想要的“复制后可发现”的体验（但遵守 Android 无焦点限制）。

新增：

- `clipboard` 无焦点提示的两条实现（可二选一或同时提供）：
  - A) 通知提示（Android 13+ 需要 `POST_NOTIFICATIONS`）：点击后进入宿主 Activity 版“剪贴板动作菜单”
  - B) “武断提示 + 下一次唤起 IME 自动进入动作菜单”：用户点击通知后，宿主只设置一个 5 秒有效的 pending 标记；等用户下一次点输入框唤起 IME 时，直接打开 clipboard bindings 页面
- `pendingPaste`：无焦点处理后的结果可挂起，等下次 IME 出现时提示“一键粘贴”
- 最近使用 bindings
- binding 排序与去重
- App 包名过滤 / 场景过滤
- 允许少量 `execute-action`
  - 前提仍然是用户显式点击
  - 默认结果仍需展示或确认

v1 仍不建议做：

- 悬浮窗主线
- kit 原始剪贴板读取 API
- 无焦点强行弹 IME

### 9.3 v2（可选实验项）

仅在用户明确启用时考虑：

- 复制后 5 秒悬浮提示 chip（需要 overlay 权限）
- 更强的“正文 selection”能力（例如 Accessibility/截图/OCR 路线）——高权限、高风险，不建议成为默认体验

## 10. 需要提前约定的数据结构

### 10.1 manifest 侧

- `bindings[]`
- `binding.id`
- `binding.title`
- `binding.triggers[]`
- `binding.requestedPayloads[]`
- `binding.preferredPresentation`
- `binding.entry`

建议的最小 JSON（v0 实装口径；仅用于“打开 kit + 传一次性 payload”）：

```jsonc
{
  "bindings": [
    {
      "id": "clipboard.summarize",
      "title": "总结剪贴板",
      "triggers": ["clipboard", "manual"],
      "requestedPayloads": ["clipboard.text"],
      "preferredPresentation": "clipboard-chip"
      // "entry": { "bundle": { "html": "ui/app/index.html" } } // 可选：未来允许覆盖打开页面
    }
  ]
}
```

### 10.2 host 侧

- `BindingRegistry`
- `BindingInvocation`
- `BindingPermissionState`
- `RecentBindings`

### 10.3 runtime 侧

建议新增一条统一入口，而不是暴露原始读取 API：

- `binding.invoke`（host -> kit）

kit 只处理 invocation payload，不直接主动读来源。

`binding.invoke`（host -> kit）payload（v0 建议形态）：

```jsonc
{
  "invocationId": "invk-uuid",
  "trigger": "clipboard",
  "binding": { "id": "clipboard.summarize", "title": "总结剪贴板" },
  "clipboardText": "…",
  "context": {
    "sourcePackage": "com.example.app",
    "selectionStart": 0,
    "selectionEnd": 0,
    "selectedText": "",
    "beforeCursor": "…",
    "afterCursor": "…",
    "inputType": 1,
    "candidateCount": 0
  },
  "createdAtEpochMs": 1711370000000
}
```

## 11. 风险与提醒

### 11.1 风险

- selection 在不同 App 中可读性不一致
- clipboard 过于积极会打扰用户
- “复制即提示”如果要做到接近 100% 命中，可能会被迫引入更重的常驻机制（前台常驻/无障碍），产品与隐私成本很高
- 如果 binding 太多，候选栏会被挤爆
- 如果允许 kit 自己申请原始读取 API，权限模型会迅速失控
- Android 13+ 通知权限可能导致 clipboard 入口“看不见”，必须有 IME 内兜底入口
- 如果权限开关仍是全局粒度（而不是 per-kit/per-binding），用户会不敢开“剪贴板相关能力”
- overlay 权限（若做悬浮窗实验）在国内 ROM 上体验与稳定性差异极大
- Android 13+ 系统自带剪贴板浮层提示，叠加你自己的提示可能会显得“过度打扰”，需要节制（频率、去重、仅在匹配 binding 时提示）
- 剪贴板不止文本：URL/富文本/图片/文件 URI 等，数据结构与权限（URI 权限、临时授权）会把“可处理”复杂度拉高

### 11.2 设计提醒

- Android 上“contextmenu”应该翻译成“触发绑定 / 可处理动作”，不要真的照搬桌面右键菜单词汇。
- `clipboard` 一定要坚持“宿主读，按次授予”。
- `manual` 一定要保留，因为它是发现层的最终兜底。
- v0 就应该允许 **后台直接执行**（headless），否则“快速选择功能”的价值会被“被迫打开 kit 面板”抵消；打开 kit 面板应该是显式动作（例如工具栏 kit 按钮 / More）。

## 12. 最终建议

这套机制最合理的产品名字，不应叫“右键菜单”，而应叫：

- `Function Kit Bindings`
- 或 `可处理动作`

它的本质不是一个菜单控件，而是一层宿主管理的“发现与触发”系统。

Android-first 下的正确路线是：

- 把 `selection` 做成候选栏附近的动作条
- 把 `manual` 做成稳定快捷入口
- 把 `clipboard` 做成宿主控制的提示机制
- 把所有敏感数据读取都收回宿主，只做一次性授予

这样既不依赖电脑，也不会把权限边界做烂。
