# IME Hooks Tests

> 编码：UTF-8

该功能件主要用于手动调试（真机/模拟器），目前不提供独立的 fixtures 测试集。

建议验证路径：

- `input.observe.best_effort`：启用后观察 `context.sync` 的高频更新（节流/去重）。
- `send.intercept.ime_action`：注册后按 IME 回车/发送键，确认 UI 能收到 intent 并回包 allow/block。

