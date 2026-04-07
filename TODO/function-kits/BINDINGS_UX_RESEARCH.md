# Bindings 优先：快速入口、分类与结果呈现（调研与方案）

> 编码：UTF-8  
> 日期：2026-03-31  
> 目标：让 **Binding 成为主要入口**，解决“功能/功能件多了以后用户根本不会翻找/搜索”的摩擦；并让 **开发者在 manifest 里就能声明分类与呈现方式**，从而把“结果呈现（前后对比/确认/撤销/错误/进度）”做成可持续扩展的体系，而不是每个功能件各自硬凑。

## 0. 问题定义（你指出的核心矛盾）

当功能件数量上来后，用户在需要的时候：

- **不会**进“功能件页面/商店”一个个翻
- **不会**搜索插件（即使在输入法内也依然摩擦很大）

因此必须满足三条：

1. **Binding 是快速入口**：Binding 列表里就应该能“把能干的事情列出来”（像浏览器扩展的 commands/context menu）。
2. **功能件页面是深水区**：功能件面板负责更复杂的能力与可视化（预览、前后对比、批处理、历史、设置），而不是日常入口。
3. **需要“可筛选的分类”**：因为 Binding 多了以后，用户同样不会逐个看；必须让开发者给 binding 打上类别（可多选），Host 用类别做低摩擦筛选。

矛盾在于：Binding 若只做“点一下执行”，很多常见功能会遇到**结果呈现**问题（前后对比、确认、撤销、进度、错误）。

## 1. 现状调研：我们当前 Binding 的行为是什么

### 1.1 协议层（已固定）

- manifest：`bindings[]`（一个功能件可以有 **多个 binding**；触发源 `manual/selection/clipboard`；可选 `requestedPayloads`、`preferredPresentation`、`entry` 等）
- 运行时：Host -> UI `binding.invoke`（一次性上下文 payload，带 `invocationId`）
- 文档：`TODO/function-kit-runtime-sdk/docs/BINDINGS.md`

### 1.2 Android Host 侧（关键事实）

当前 Binding 点击后默认走的是 **headless 后台执行**：

- `FunctionKitBindingsWindow` 点击 binding：调用 `FunctionKitWindow.enqueueBindingInvocation(... startHeadless = true)`，然后立刻回到 `KeyboardWindow`，只弹一个 Toast（显示 binding.title）。  
  - 代码：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitBindingsWindow.kt`
- `startHeadless = true` 会初始化后台 WebView（不打开面板）并向 UI 派发 `binding.invoke`。  
  - 代码：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`

这意味着：

- Binding **能做事**（Kit 收到 invoke 后可以 `input.insert/replace`），但
- **默认没有结果 UI**：看不到“处理前/处理后”，也没有“确认/撤销/详情/错误/进度”的标准呈现
- AI/网络类 Binding 很容易出现“用户以为没反应”的体验（因为后台跑，用户只看到一个 Toast）

> 额外观察：WebView 是被缓存保活的（pool 不销毁），所以“后台执行后再打开功能件面板继续展示结果”在技术上是可行的——关键是**要有一个低摩擦的“打开详情”入口**。

## 2. 结论：不要用 1 种呈现方式硬吃所有 Binding

Binding 的本质是“快速入口”，但不同动作的**风险/不确定性/反馈需求**不同：

- 纯本地、确定性、低风险（如：清格式、去 UTM）→ 适合 **后台执行 + 最小反馈**
- 有误伤风险、用户需要确认（如：脱敏、删参数可能影响链接可用）→ 适合 **打开面板做预览确认**
- 多步交互或需要复杂 UI（如：Snippet 搜索插入、文本转卡片）→ 适合 **打开面板进入工作台**

因此建议把 Binding 的呈现拆成两层：

1. **Host 只处理“最小的两种启动模式”**：后台执行（headless） vs 打开面板（panel）。
2. **具体呈现细节完全由开发者决定**：通过 manifest 里的 `preferredPresentation`（字符串，可扩展）+ `entry`（对象，可携参/路由）来表达。

> 这样做的好处是：Host 不需要实现无限多 UI 形态；但开发者仍然可以声明“要不要预览/怎么预览/完成后怎么收起/有没有撤销”等策略，并由 Kit 自己决定最终体验。

## 3. “处理前后对比”到底怎么做：两种路线对比

### 路线 A：Host 提供通用前后对比 UI（平台做）

**做法**：Kit 执行后把结果回传给 Host（例如新增 `binding.result`），Host 弹一个通用的“前/后对比 + 应用/撤销”面板。

优点：

- 统一 UX，适合大量“文本变换”类功能
- 不必打开完整功能件面板，快

缺点：

- 需要新增协议/SDK API（Kit -> Host 的标准结果回包）
- 复杂功能无法表达（非纯文本、需要复杂交互）
- Host 维护成本会上升（各种 edge cases：selection/replace、输入法桥接、撤销策略）

适用：**大量同构的、纯文本、可逆的** quick-action。

### 路线 B：跳转到对应功能件，让功能件自己呈现（Kit 做）

**做法**：点击 Binding 后直接打开该 Kit 面板（或一个“预览型面板”），Kit 自己显示 before/after、差异高亮、应用/取消/撤销。

优点：

- 表达力最强（Kit 想怎么展示都行）
- 不需要 Host 实现复杂通用 UI
- 非纯文本输出也能处理（图片卡片、结构化表格等）

缺点：

- 每次都打开面板会增加打扰（对低风险动作不划算）
- 需要 Kit 多做 UI（成本转移到 Kit 作者）

适用：**需要解释/确认/复杂 UI** 的动作。

### 推荐：二者混合（结果呈现优先让 Kit 控制，Host 只做最低反馈）

更现实的最优解是混合：

- **headless**：Host 提供“最小反馈 + 打开详情”的通用 UI（不做复杂 diff）；撤销优先由 Kit 自己提供（例如另一个 `undo` binding）。
- **panel**：直接打开 Kit，让 Kit 做“前后对比/解释/确认/撤销/高级设置”。

这样能同时解决：

- 快动作不打扰（依然 1-1-1）
- 复杂动作有地方展示结果（也不需要 Host 变成富编辑器）

## 4. 具体方案（建议落地顺序）

### 4.1 Binding 可以有多个：把“功能列表”下沉到 bindings[]

不要默认“一个功能件一个入口”。一个 kit 应该能通过 bindings[] 把它能做的事全部列出来（像命令面板一样），并且：

- 每个 binding 有稳定 `id`，用于 UI 侧路由
- 绑定的标题必须“动词开头 + 结果明确”，否则用户点不下去
- bindings 数量上来后，必须配合下一条的“分类”

### 4.2 开发者声明分类：`categories[]`（可多选）

为每个 binding 增加 `categories`（数组），例如：

- `["paste", "cleanup"]`
- `["paste", "privacy"]`
- `["writing", "tone"]`

Host 用它来做“低摩擦筛选”（例如：先给你几个类别按钮/Tab，再进入绑定列表），避免用户在几十个动作里翻找。

> 类别必须由开发者决定，因为只有开发者知道自己这条 binding 的心智分类；Host 只负责展示与筛选，不负责发明类别体系。

### 4.3 开发者决定呈现效果：`preferredPresentation` + `entry`

你说得对：不应该把呈现方式限制成固定三类值。更合理的做法是：

- Host 只识别 **最小启动模式**：`headless` vs `panel`
- 具体细节（预览/差异/确认/是否自动收起/用哪个页面展示）交给 kit 自己实现

建议把 `preferredPresentation` 作为**开发者自定义的“呈现意图字符串”**，并约定一种可扩展写法：

- `headless`：后台执行
- `panel.*`：打开面板（点号后是开发者自定义 variant，例如 `panel.preview` / `panel.workbench`）

同时用 `entry` 传递 kit 内部路由/参数（Host 不解释，只透传给 UI）：

```jsonc
{
  "id": "paste.redact",
  "title": "脱敏后再粘贴…",
  "triggers": ["clipboard"],
  "categories": ["paste", "privacy"],
  "preferredPresentation": "panel.preview",
  "entry": { "view": "preview", "defaultAction": "replace" }
}
```

> 关键点：**开发者决定呈现**；Host 只需要做到“看到 `panel.*` 就打开 kit”这一条即可。其余展示效果由 kit 自己写 UI。

### 4.4 headless 也必须有最小反馈（否则用户不信任）

Toast 只能提示“你点了什么”，不能提示“发生了什么”。headless 类建议最小反馈包含：

- **一句话结果**：例如“已净化链接（移除 3 个跟踪参数）”
- **撤销**：优先通过“另一个 undo binding”实现（Host 很难通用撤销所有文本写回）
- **打开详情**：一键打开对应 Kit 面板查看前后对比与解释（可选）

实现注意（重要现实约束）：

- Host 很难在所有场景下实现通用撤销（尤其是 replace 全输入框）；因此撤销更适合做成：
  - Kit 在本地 `storage` 里记录 lastChange（invocationId + before/after + applyMode），并提供一个 `undo.last` binding
  - 或者仅对“selection/clipboard 变换”提供通用撤销（因为 before 明确存在于 invocation payload）

### 4.5 panel 预览确认的关键：先预览后写回，写回后回到输入

`panel.preview` 的推荐交互（仍然符合 1-1-1 的精神）：

1. 点击 binding → 直接打开 Kit（面板可做成紧凑样式）
2. Kit 立即展示 before/after（用 invocation payload 计算）
3. 用户点一次“应用（插入/替换）” → 写回 → 面板自动收起回到输入

这条路径天然解决“前后对比/误伤/解释”。

### 4.6 panel 工作台的关键：Binding 只是路由，不承担结果呈现

`panel.workbench` 的定位是：让用户快速到达“这个功能件的工作台”，例如：

- Snippet Vault（搜索/管理/插入）
- 文本转图片卡片（样式选择、预览）

Binding 不应试图在一屏内塞下所有功能，只做“进入正确的工作台”。

## 5. 把这个方案映射到我们 20 个候选功能件（示例推荐）

（只列高优先级/高争议的）

- 01 净化粘贴：`preferredPresentation: "headless"`；另提供一个 `panel.preview` 入口用于复杂文本
- 02 链接净化：`preferredPresentation: "headless"`；显示“移除参数数目”，并提供“恢复原链接/打开详情”
- 03 脱敏粘贴：强烈建议 `preferredPresentation: "panel.preview"`（误伤风险高，必须可确认）
- 11 发送前敏感信息守门员：不走 binding（走 send intercept），但可以提供 `panel` 入口给用户查看“本次拦截原因/规则/白名单”
- 14 三档语气改写：建议 `preferredPresentation: "panel.preview"`（用户想看到三档差异再应用）
- 15 一句话变清楚：建议 `preferredPresentation: "panel.preview"`（用户常想确认再发）

## 6.（可选）协议/SDK 的后续增强方向（等你拍板后再做）

如果你想把 headless 的体验做到更像浏览器扩展（既快又有反馈），建议下一步做协议增强：

1. 新增 `binding.result`（UI -> Host）  
   - 让 Kit 在后台执行后，向 Host 报告：成功/失败、摘要文案、是否可撤销、是否建议打开面板、可选的 before/after（用于 Host 弹轻量预览）
2. 新增 Host 侧统一“操作结果条（snackbar）”  
   - 支持：Undo / Open / Retry

这样 headless 类 Binding 就不会再“默默做完或默默失败”。

---

## 7. 你现在最该做的决策（10 分钟内）

1. 你希望 Host 默认怎么处理“没填 preferredPresentation 的 binding”？  默认 headless
   - 默认 headless（更快，但开发者要对“需要预览”的 binding 明确标注 `panel.*`）   
   - 默认 panel（更稳，但会更打扰）
2. 你允许 P0 做一个“统一结果条（snackbar）”吗？  允许
   - 允许：headless 的体验会立刻上一个台阶（否则永远像没反馈）

---

## 8. 多页面 / 多 HTML：值不值得做（对标浏览器插件）

你提的“结果怎么呈现”本质是在问：**Kit UI 需要多屏/多状态**，Host 要不要直接支持“多个 HTML 入口”。

### 8.1 浏览器插件是怎么做的（关键点）

浏览器扩展并不是“在一个 UI 里解析多个 HTML”，而是：

- **多种 UI surface 各自一个 HTML**：如 `popup`、`options`、`side panel` 等（按需打开）。
- **状态共享靠“后台” + 消息**：`popup/options` 通常只是 view；真正的长生命周期状态在 `background`（或 service worker）里，通过 message 传递。
- 单个 surface 内的复杂流程，现实里多数还是 **SPA/路由**（不会为了多一步确认就拆成多个 HTML 文件）。

### 8.2 放到 Function Kit 上：P0 不建议做“宿主级多 HTML”

原因是它带来的平台成本很高、收益不稳定：

- **多 HTML 往往意味着多 WebView/context**（或频繁 `loadUrl` reload）：状态丢失、性能抖动、内存压力都会变大。
- **输入法场景对抖动更敏感**：reload 带来的白屏/卡顿，会直接破坏“点一下就能用”的心智。
- Android 目前已经做到 **同一个 kitId 只有一个 WebView**（`FunctionKitWindowPool`），并支持“后台执行后再打开面板继续展示结果”。在这种结构下，多 HTML 的核心价值（跨 context 的多入口）反而变小。

结论：P0 最划算的路线是 **单 HTML + Kit 内部多页面（SPA/路由）**，Host 只负责“怎么打开/怎么给最小反馈”。

### 8.3 推荐落地方式：单 HTML + `binding.entry` 路由 + `intent` 辅助定位结果

- **单 HTML**：manifest 里仍然只有一个 `entry.bundle.html`。
- **多页面**：Kit 自己做 router（hash/history 都行），用 tab / 二级页 / modal 来承载“预览确认/前后对比/历史/设置”。
- **路由参数**：用 `binding.entry` 透传 `{ view, route, mode, ... }`，在 `kit.bindings.onInvoke(...)` 里决定跳哪一屏。
- **结果定位（可选增强）**：当用户从 snackbar 点“打开”进入面板时，Host 可以额外发一个 `host.state.update.details.intent`（例如携带 `invocationId`），Kit 看到 intent 后直接切到“结果页/详情页”。

这套方式的关键收益：

- Host 不需要理解“预览/对比/撤销”的 UI 细节；Kit 想怎么展示都行。
- headless 执行也能自然过渡到可视化结果（打开同一个 WebView 的面板）。
- 复杂功能无需拆多 HTML，也不需要 Host 维护 tabs、多页面容器等高耦合 UI。

### 8.4 P1（真的需要多 HTML）应该怎么做

如果未来确实出现“必须隔离页面/必须完全不同的加载入口”的需求，建议只做**多 surface**（而不是在一个面板里解析多个 HTML）：

- `panel`：输入法上方嵌入（popup 类）
- `page`：全屏/Activity（options/workbench 类）
- `headless`：后台执行（background 类）

然后像浏览器扩展一样，用 message/intent 做状态同步。这样边界清晰、平台也更可控。
