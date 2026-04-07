# Function Kit Input Bridge（Embedded Keyboard Routing）

> 编码：UTF-8  
> 日期：2026-03-25  
> 状态：ACTIVE  
> 目标：让功能件页面里的输入框在 IME 内可用，但不引入“Detached Composer（可见原生草稿箱）”这种额外 UI 概念。

## 结论

- 功能件 UI（WebView）里允许出现输入框（`textarea / input[type=text...] / contenteditable`）。
- 点击输入框后，宿主 IME 仍然是同一个键盘实例：键盘显示在下方，功能件面板在上方，输入内容进入该 Web 输入框。
- 不需要也不再提供“Detached Composer”的可见原生编辑区/草稿箱 UI。
- 为了实现“Web 输入框可输入”，仍然保留 `composer.*` 作为**内部输入桥接协议**，但它：
  - 不是功能件可声明的 `runtimePermissions`
  - 不会出现在“已授权能力”chips
  - 不提供公开 `client.composer.*` 高层 API

## 机制（内部输入桥接协议）

### Runtime SDK（Web）

Runtime SDK 自动识别可桥接的输入目标：

- `textarea`
- `input[type=text|search|url|tel|email|number]`
- 纯文本 `contenteditable`

并在以下事件触发时自动发送桥接消息：

- `focusin` / `input` / `selectionchange` / `focusout`

对应消息：

- UI -> Host：`composer.open` / `composer.focus` / `composer.update` / `composer.close`
- Host -> UI：`composer.state.sync`

Host 回传的 `composer.state.sync` 会被 SDK 写回当前绑定的 Web 输入框（文本与选区）。

### 宿主 IME（Android）

- 收到 `composer.*` 后，Android 宿主更新内部 composer 状态，并将键盘输入路由到“当前绑定的 Web 输入框”。
- 当输入框失焦或关闭时，键盘按常规行为收起或回到外部目标输入框。

## 开发者可控项

### 关闭自动桥接

对某个输入控件禁用桥接：

- `data-function-kit-composer="off"`

### 指定稳定的 composerId（可选）

默认情况下 SDK 会为输入框生成一个稳定的 `composerId`（基于元素 id/name 等）。
如果你希望显式指定：

- `data-function-kit-composer-id="my-input"`

## 已移除能力（不再存在）

以下能力/概念已从主线撤回：

- 可见原生草稿 UI 的 “Detached Composer”
- `composer.apply.insert` / `composer.apply.replace` / `composer.apply.result`
- `needsDetachedComposer` manifest 字段
- `composer.*` 作为 `runtimePermissions`

## 验证

- Runtime SDK：
  - `npm test`（会重新生成 `dist/function-kit-runtime.js` 并跑 node tests）
- Android：
  - `.\gradlew.bat :app:compileDebugKotlin --console=plain --warning-mode=all`
  - `.\gradlew.bat :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitAiChatBackendCandidatesTest --console=plain --warning-mode=all`

