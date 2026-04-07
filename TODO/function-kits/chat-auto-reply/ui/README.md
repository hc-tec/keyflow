# Chat Auto Reply UI Runtime

> 编码：UTF-8
> 创建时间：2026-03-21T20:05:00+08:00
> 更新时间：2026-03-25T00:00:00+08:00
> 目标：把功能件 UI 从 schema-first 改成浏览器式本地前端 bundle。

## 1. 结论

- UI 不再由 `panel.schema.json` 描述。
- UI 采用本地打包的 HTML / CSS / JS。
- Windows 用原生壳承载 `WebView2`。
- Android 用原生键盘壳承载扩展面板 `WebView`。
- Tool 的输入输出 schema 继续保留，它负责数据契约，不负责视觉布局。
- 浏览器页面统一通过 SDK 接宿主：`TODO/function-kit-runtime-sdk/README.md`

## 2. 三层表面

1. `inline`
   - 原生候选条。
   - 只放最小操作，例如“打开自动回复”。
2. `panel`
   - 浏览器式主面板。
   - 承载候选卡片、上下文摘要、语气切换、换一批。
3. `editor`
   - 全屏编辑或独立页。
   - 用于长文本、复杂设置、调试信息。

## 3. Host Bridge

浏览器式面板与宿主之间只通过消息桥交互：

- 通用协议说明：`TODO/function-kits/host-bridge/README.md`
- 通用 envelope schema：`TODO/function-kits/host-bridge/message-envelope.schema.json`
- SDK 浏览器 bundle：`TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js`
- SDK 安全模型：`TODO/function-kit-runtime-sdk/docs/SECURITY_MODEL.md`

业务消息：

- 宿主 -> 面板
  - `bridge.ready.ack`
  - `context.sync`
  - `candidates.render`
  - `ai.response`
  - `storage.sync`
  - `panel.state.ack`
  - `permissions.sync`
  - `permission.denied`
  - `host.state.update`
  - `bridge.error`
- 面板 -> 宿主
  - `bridge.ready`
  - `context.request`
  - `candidate.insert`
  - `candidate.replace`
  - `candidates.regenerate`
  - `ai.request`
  - `settings.open`
  - `storage.get`
  - `storage.set`
  - `panel.state.update`

内部输入桥接消息（SDK 自动处理，业务代码无需关心）：

- 面板 -> 宿主
  - `composer.open`
  - `composer.focus`
  - `composer.update`
  - `composer.close`
- 宿主 -> 面板
  - `composer.state.sync`

`candidates.render` 的 `payload` 固定包含：

- `requestContext`
- `result`
- `uiHints`

其中 `result` 必须符合 `tools/reply-generator/output.schema.json`。

## 4. 关键约束

- 不加载远程 UI 代码。
- 不把整个键盘主输入区做成 `WebView`。
- 面板内自己的输入框不直接复用外部目标输入连接。
- 真正写回目标 App 输入框时，必须是显式动作。
- 不允许在业务页面里再写第二套平台桥接；统一通过 SDK 调用宿主。

## 5. 预览入口

- HTML：`TODO/function-kits/chat-auto-reply/ui/app/index.html`
- Script：`TODO/function-kits/chat-auto-reply/ui/app/main.js`
- Style：`TODO/function-kits/chat-auto-reply/ui/app/styles.css`
- Bridge fixture：`TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.host-to-ui.render.basic.json`

## 6. 当前 UI 已覆盖的运行时能力

- 真页签切换：
  - `候选`
  - `上下文`
  - `设定`
- 面板内输入框：
  - 由 runtime 自动桥接（`composer.*` 协议仅作为内部实现），无需样板 UI 再提供“独立编辑框/草稿箱”入口
- 面板状态同步：
  - `panel.state.update`
  - `panel.state.ack`
- 功能件存储：
  - `storage.get`
  - `storage.set`
  - `storage.sync`
- 宿主权限控制：
  - 动态渲染授权 chip
  - 未授权能力自动禁用
- 浏览器预览 mock host：
  - 不依赖真实宿主也能跑完整交互链路
