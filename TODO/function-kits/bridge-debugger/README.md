# Bridge Debugger

> 编码：UTF-8  
> 定位：用于测试/回归 Function Kit Host Bridge 能力的调试功能件（非业务功能）。
> 状态：ARCHIVED（Android 端不再内置分发；最近改动的手动验收改用 `runtime-lab`）。

## 主要用途

- 验证 `binding.invoke`（一个功能件绑定多个 action）
- 验证 `input.observe.best_effort`（best-effort 输入观察 → `context.sync`）
- 验证 `send.intercept.ime_action`（IME action 发送拦截）
- 捕获/复制宿主 raw envelopes（握手/权限/上下文/错误等），用于定位“到底宿主发了什么”

## 快速验收（clipboard bindings）

1. 在任意 App 复制一段文字
2. 点输入框唤起 IME，点击剪贴板提示入口进入“剪贴板动作”菜单
3. 选择 `Bridge Debugger · Inspect Clipboard`
4. 在 Bridge Debugger 内确认：`binding.invoke` 到达，且“测试文本”会自动填充为 `clipboardText`（然后点“插入/替换”验证回写）

## 入口

- Manifest：`TODO/function-kits/bridge-debugger/manifest.json`
- UI 说明：`TODO/function-kits/bridge-debugger/ui/README.md`
