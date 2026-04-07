# Function Kit Runtime Input Bridge Autobind（Archived）

> 编码：UTF-8
> 日期：2026-03-23
> 状态：ARCHIVED（2026-03-25）：Detached Composer（可见草稿 UI）已从主线撤回；当前主线是 Embedded Input Bridge。
> 最新说明：`TODO/ime-research/notes/20260325_functionkit_input_bridge.md`

## 目标

让功能件页面里的普通输入控件在 Android 宿主里自动接入“输入桥接”，不再要求每个功能件作者都手写一套 `composer.open/focus/update/close` 样板代码。

## 本轮改动

- Runtime 源码：
  - `TODO/function-kit-runtime-sdk/src/index.js`
- 浏览器产物：
  - `TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js`
- 测试：
  - `TODO/function-kit-runtime-sdk/tests/client-api.test.mjs`
  - `TODO/function-kit-runtime-sdk/tests/browser-bundle.test.mjs`

## 行为

- 自动识别并桥接：
  - `textarea`
  - `input[type=text|search|url|tel|email|number]`
  - 纯文本 `contenteditable`
- 在 `focusin` / `input` / `selectionchange` / `focusout` 时自动发送：
  - `composer.open`
  - `composer.focus`
  - `composer.update`
  - `composer.close`
- 收到宿主 `composer.state.sync` 后，把文本和选区回写到当前绑定输入框。
- 默认跳过：
  - `password`
  - `disabled`
  - `readonly`
- 可显式关闭自动桥接：
  - `data-function-kit-composer="off"`

## 验证

- `node --test tests/client-api.test.mjs`
- `node --test tests/browser-bundle.test.mjs`
- `node --check TODO/function-kits/chat-auto-reply/ui/app/main.js`

## 当前预期

- Android 功能件页面点击普通输入框后，应自动唤起宿主键盘，并把输入路由到该 Web 输入框。
- 宿主修改草稿后，页面输入框应同步显示新文本与光标。
- `chat-auto-reply`、`quick-phrases` 这类功能件不再需要额外手搓输入桥接按钮才能打字。
