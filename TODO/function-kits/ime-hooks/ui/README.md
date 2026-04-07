# IME Hooks (Function Kit)

> 编码：UTF-8  
> 创建时间：2026-03-25T00:00:00+08:00  
> 目的：提供一个最小可用的调试功能件，用于验证 `input.observe.best_effort` 与 `send.intercept.ime_action`。

## 1. 能力覆盖

- 输入监听（best-effort）
  - `kit.input.observeBestEffort({ throttleMs, maxChars })`
  - 通过 `context.sync` 更新 UI（并在日志中标注 `request.reason/trigger`）
- 发送前拦截（IME action）
  - `kit.send.registerImeActionInterceptor({ timeoutMs })`
  - `kit.send.onImeActionIntent(handler)`：支持
    - 全部放行
    - 全部拦截
    - 正则拦截（匹配 `beforeCursor` 则拦截）
    - 手动确认（超时默认放行）

## 2. 使用说明（Android 真机/模拟器）

1. 打开 IME 状态区的功能件入口（扩展图标），选择 `IME Hooks`。
2. 进入 `监听`：
   - 点击 `开始监听`，在任意输入框内移动光标/输入，观察上下文快照与日志更新。
3. 进入 `拦截`：
   - 点击 `注册拦截`，切换到聊天 App 输入框。
   - 按键盘右下角回车/发送（IME action），观察是否触发 intent 与决策。

注意事项：

- `send.intercept.ime_action` 只覆盖 IME 自己的回车/editorAction 路径，不保证拦截 App 内“发送按钮”。
- 手动确认模式需要更大的 `timeoutMs`，否则宿主会 fail-open 放行。

## 3. 文件入口

- Manifest：`TODO/function-kits/ime-hooks/manifest.json`
- UI：
  - `TODO/function-kits/ime-hooks/ui/app/index.html`
  - `TODO/function-kits/ime-hooks/ui/app/main.js`
  - `TODO/function-kits/ime-hooks/ui/app/styles.css`

