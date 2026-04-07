# Windows IME E2E 焦点就绪修正（2026-03-22）

> 编码：UTF-8  
> 更新时间：2026-03-22T19:35:00+08:00  
> 范围：`WindowsImeTestHost` / `WindowsImeTestHost.Automation`

## 1. 这次确认的真实问题

之前 Windows 自动化里最大的误判，不是“完全没有请求焦点”，而是：

- runner 只要看到 `last_focus_request == startupFocusTarget` 就继续往下跑；
- 但这只能证明“请求过焦点”，不能证明“窗口仍然持有真实输入焦点”；
- 同时 `WebBrowser / Function Kit` 还在继续初始化，后续初始化过程会把焦点再次抢走。

所以旧链路会出现一种假阳性：

- `ready_snapshot.active_host = single-line`
- 但几秒后 `final_snapshot.form_contains_focus = false`
- 最终 `key_event_count = 0`

## 2. 这次落地的修正

代码落点：

- `TODO/ime-research/windows-testhost/WindowsImeTestHost/HostSnapshot.cs`
- `TODO/ime-research/windows-testhost/WindowsImeTestHost/MainForm.cs`
- `TODO/ime-research/windows-testhost/WindowsImeTestHost.Automation/Program.cs`

本次改动包含：

1. 宿主快照新增真实焦点诊断：
   - `form_contains_focus`
   - `active_control_name`
2. `MainForm` 启动阶段不再只尝试一次聚焦：
   - 在 `Activated` 和初始化末尾再次确认 startup focus
   - `FocusHost(...)` 会显式 `Activate()` / `BringToFront()` / `ActiveControl = control`
3. automation runner 的 ready 判定改成“稳定就绪”：
   - 必须 `browser_ready = true`
   - 如果启用了 Function Kit，则必须等到 `function_kit_ready = true` 或已进入错误态
   - 必须 `form_contains_focus = true`
   - 必须 `active_host == startupFocusTarget`
4. runner 在实际发键前再次 `BringWindowToForeground(...)`

## 3. 实测结果

### 3.1 轻量焦点 smoke

命令：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode smoke -StartupFocus single-line -DisableFunctionKit -SnapshotPath 'TODO/ime-research/logs/20260322_windows_testhost_focus_smoke_snapshot.json'
```

结果：

- `active_host = single-line`
- `form_contains_focus = true`
- `active_control_name = singleLineInputTextBox`

这说明最小宿主启动后已经能稳定拿到单行输入框焦点。

### 3.2 不切换 IME 的注入验证

命令：

```powershell
TODO/ime-research/windows-testhost/WindowsImeTestHost.Automation/bin/Debug/net9.0-windows/WindowsImeTestHost.Automation.exe --testhost-exe TODO/ime-research/windows-testhost/WindowsImeTestHost/bin/Debug/net9.0-windows/WindowsImeTestHost.exe --result-file TODO/ime-research/logs/20260322_windows_testhost_focus_injection_result_v2.json --pinyin nihao --expected-text nihao1 --no-activate-weasel
```

关键结果：

- 所有 attempt 的 `ready_snapshot` 现在都已经满足：
  - `browser_ready = true`
  - `form_contains_focus = true`
  - `active_host = single-line`
- `sendkeys-direct-number-1` 这条路径已经不再是空打：
  - `final_focus = true`
  - `final_active = single-line`
  - `final_keys = 18`
  - `final_text = 你好`

这说明：

- 焦点竞态确实是旧链路里的主要问题之一；
- 等初始化稳定后，至少有一条真实按键路径已经能把字符送进 `TestHost`。

## 4. 还没完成的部分

这次并不等于 Windows IME E2E 已经闭环。

当前剩余问题仍然存在：

- `keybd_event` 系列 attempt 仍会在最终快照掉成 `form_contains_focus = false`
- `sendkeys-direct-space` 仍不稳定
- `SendKeys` 的 `SHIFT` 语法仍报：
  - `关键字“SHIFT”无效`

所以现阶段最准确的结论是：

- 焦点问题已经被显式定位并部分收住；
- runner 不会再在“初始化未完成 + 焦点可能被抢走”的状态下盲打；
- 下一步应继续收敛：
  - 只保留稳定输入路径
  - 替换 `SHIFT` 相关 `SendKeys` 分支
  - 再把 Weasel 真正的 `nihao -> 你好` 自动化闭环补齐
