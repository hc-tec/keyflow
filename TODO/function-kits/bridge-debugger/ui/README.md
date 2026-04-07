# Bridge Debugger（桥接调试器）

> 编码：UTF-8  
> 用途：为 Function Kit Host Bridge 能力提供一个可交互的“验收/回归面板”。

## 支持验证的能力

- `binding.invoke`：从宿主触发 binding 后，UI 展示最近一次 payload（含 `clipboardText`/`context` 等）。
- `input.observe.best_effort`：启动后，宿主会更频繁推送 `context.sync`（节流 + 去重，非严格实时）。
- `send.intercept.ime_action`：注册后，当用户按下 IME 自己的“回车/发送 action”时，功能件可决定 `allow=true/false`。

## 如何在 Android 上测试

1. 打开输入法，进入 **More / 状态区** → `Function Kit Actions`。
2. 选择 `Bridge Debugger` 的任意 action（一个功能件可绑定多个 action）。
3. 在面板里：
   - 点击 `Start` 启动 `input.observe.best_effort`，然后在目标 App 的输入框里打字/移动光标，观察 `context.sync` 计数与 JSON 变化。
   - 点击 `Register` 注册 `send.intercept.ime_action`，然后在输入框里按回车/发送键，观察 intent 日志与放行/阻断结果。
4. `Inspect Clipboard`：复制一段文本后，工具栏剪贴板 chip 会出现入口（若宿主已实现），点击后应收到 `binding.invoke` 并显示 `clipboardText`。

## 重要限制（写死）

- `selection.*` 仅指 `InputConnection` 可读的输入框选区/光标附近文本；无法获取 App 网页正文 selection。
- `send.intercept.ime_action` 只能覆盖 IME 自己控制的回车/editorAction 路径；无法保证拦截 App 内“发送按钮”。

