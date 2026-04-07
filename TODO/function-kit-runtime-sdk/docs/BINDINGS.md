# Function Kit Bindings（触发绑定）与 `binding.invoke`

> 编码：UTF-8  
> 创建时间：2026-03-30T19:30:00+08:00  
> 目标：固定 `manifest.bindings[]` 与 `binding.invoke` 的语义，避免 host / kit 漂移。  

## 1. Binding 是什么

Binding 是“用户显式点击触发的一次性动作入口”（类似浏览器插件的 context menu / commands）。

- Host 负责：发现入口、渲染入口、在触发时抓取输入上下文快照、下发 `binding.invoke`
- Kit 负责：监听 `kit.bindings.onInvoke(...)`，用一次性 payload 做动作（可选择 headless 或打开 UI）

## 2. manifest 侧字段（`bindings[]`）

一个 kit 可以声明**多个 bindings**，Host 会把它们聚合成“可点击的动作入口列表”。

每个 binding 至少包含：

- `id`：稳定标识（kit 内路由用）
- `title`：给用户看的文案
- `triggers[]`：开发者声明的主要触发来源（`manual` / `selection` / `clipboard`）

可选：

- `requestedPayloads[]`：声明“希望 host 按次授予哪些一次性 payload”
- `categories[]`：开发者声明的分类（可多选），用于 Host 做低摩擦筛选/分组（例如 `["paste","privacy"]`）
- `preferredPresentation`：开发者声明“呈现意图”。**不限制固定枚举**；Host 只需识别最小启动模式（如 `headless` vs `panel.*`），其余细节由 kit 决定
- `entry`：开发者自定义的透传对象（Host 不解释），用于把路由/参数交给 kit（例如 `{"view":"preview"}`）

## 3. requestedPayloads（标准枚举）

当前允许的值：

- `selection.text`
- `selection.beforeCursor`
- `selection.afterCursor`
- `clipboard.text`

说明：这些 payload 都由 host 捕获并通过 `binding.invoke` 下发；Kit 不需要（也不应该）自行读取原始系统来源。

## 4. Host 默认策略（避免漏配导致“没内容”）

Host 侧区分两种情况：

- `requestedPayloads` **缺省（字段不存在）**：按 trigger 使用默认集合
- `requestedPayloads: []` **显式空数组**：不请求任何额外 payload（只下发基础 meta）

默认集合（Host 侧）：

- **文本型 binding**（声明了任意文本 payload，或声明了 `selection/clipboard` trigger）：
  - 默认三入口都可见：`manual + selection + clipboard`
  - 默认按次同时提供：`["selection.text", "selection.beforeCursor", "selection.afterCursor", "clipboard.text"]`
- **非文本型 binding**：
  - 仍按 manifest 中声明的 trigger 暴露
  - 若 `requestedPayloads` 缺省，则不自动补文本 payload

也就是说，`trigger` 表示“这次是从哪里进来的”，不再表示“这个 binding 只能从哪里进来”。

## 5. 权限对齐（避免绕开授权开关）

Host 在下发一次性文本类 payload 前，会对齐 runtime permission：

- `selection.*` / `clipboard.text` 需要 Kit 被授予 `context.read`
- 若权限不满足，Host 会跳过对应 payload，并在 `binding.invoke` 中填充 `missingPermissions`，同时 `providedPayloads` 不包含被跳过项

## 6. `binding.invoke`（Host -> UI）payload

Host 下发的 payload（SDK 会做归一化）：

```jsonc
{
  "invocationId": "invk-uuid",
  "trigger": "clipboard|selection|manual",
  "binding": {
    "id": "clipboard.summarize",
    "title": "Summarize Clipboard",
    "preferredPresentation": "panel.preview",
    "categories": ["paste", "writing"],
    "entry": { "view": "preview", "defaultAction": "replace" }
  },
  "context": {
    "sourcePackage": "com.example.app",
    "selectionStart": 0,
    "selectionEnd": 0,
    "inputType": 1,
    "candidateCount": 0,
    "selectedText": "…",     // optional, gated by permission + requested/provided payloads
    "beforeCursor": "…",     // optional, gated by permission + requested/provided payloads
    "afterCursor": "…"       // optional, gated by permission + requested/provided payloads
  },
  "clipboardText": "…",      // optional, gated by permission + requested/provided payloads
  "requestedPayloads": ["clipboard.text"],
  "providedPayloads": ["clipboard.text"],
  "payloadLimits": { "cursorContextChars": 256, "selectionTextMaxChars": 8192, "clipboardTextMaxChars": 8192 },
  "payloadTruncated": false,
  "missingPermissions": [],
  "createdAtEpochMs": 1711370000000
}
```

## 7. SDK 侧 API

- 监听：`kit.bindings.onInvoke(({ invocation, envelope }) => { ... })`
- 最近一次事件：`kit.state.lastInvocation`

## 8. 多页面/结果呈现建议（Kit 侧）

Bindings 触发后，“结果怎么展示”应尽量由 Kit 决定：

- 推荐用 **单 HTML + Kit 内部路由（SPA）** 来承载多屏（预览/对比/历史/设置），避免 Host 频繁 reload 导致状态丢失。
- 用 `binding.entry` 作为“路由参数/初始视图”，在 `onInvoke` 里决定跳转到哪一屏。
- 需要从 host 的“打开详情”入口定位到某次执行时，可监听 `kit.runtime.onIntent(...)`（Host 可能会下发携带 `invocationId` 的 intent）。
