# Windows IME E2E 基线（2026-03-21）

> 编码：UTF-8
> 创建时间：2026-03-21T16:50:00+08:00
> 更新时间：2026-03-21T20:05:00+08:00
> 范围：Windows 真打字 E2E、实时快照、当前真实阻塞

## 1. 这次补了什么

这次不是停留在“能构建 / 能安装 / 能 smoke”，而是把 Windows 侧真正打字 E2E 的骨架补出来了：

- 新增固定入口脚本：`TODO/ime-research/scripts/run_windows_ime_e2e.ps1`
- 新增自动化 runner：`TODO/ime-research/windows-testhost/WindowsImeTestHost.Automation`
- `TestHost` 新增：
  - `--live-snapshot-file`
  - `--startup-focus`
  - 键盘事件诊断字段：`last_key_event` / `key_event_count`

这意味着后续哪怕上下文清空，也能直接从脚本和日志恢复：

1. 先切默认 IME 到小狼毫
2. 启动专用宿主并自动聚焦单行输入框
3. 持续把宿主快照写到 JSON
4. 自动化 runner 做真实键盘注入尝试
5. 最后落下 JSON 结果和每轮 live snapshot 证据

## 2. 固定怎么跑

### 2.1 只构建

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_ime_e2e.ps1 -Mode build
```

### 2.2 跑完整 E2E

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_ime_e2e.ps1 -Mode run
```

### 2.3 当前为了提速，只跳过安装复核

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_ime_e2e.ps1 -Mode run -SkipInstallValidation
```

## 3. 当前关键文件

- 入口脚本：`TODO/ime-research/scripts/run_windows_ime_e2e.ps1`
- 自动化项目：`TODO/ime-research/windows-testhost/WindowsImeTestHost.Automation/WindowsImeTestHost.Automation.csproj`
- 自动化主程序：`TODO/ime-research/windows-testhost/WindowsImeTestHost.Automation/Program.cs`
- IME 激活 helper（当前仍需继续修正）：`TODO/ime-research/windows-testhost/WindowsImeTestHost.Automation/WeaselImeProfileActivator.cs`
- TestHost 选项：`TODO/ime-research/windows-testhost/WindowsImeTestHost/TestHostOptions.cs`
- TestHost 主窗体：`TODO/ime-research/windows-testhost/WindowsImeTestHost/MainForm.cs`

## 4. 这次真实跑出了什么

### 4.1 产出日志

- build：`TODO/ime-research/logs/20260321_windows_ime_e2e_build.log`
- run：`TODO/ime-research/logs/20260321_windows_ime_e2e_run.log`
- 主结果：`TODO/ime-research/logs/20260321_windows_ime_e2e_result.json`
- 应用小狼毫默认覆盖：`TODO/ime-research/logs/20260321_windows_ime_e2e_apply_weasel.json`
- 恢复默认输入法：`TODO/ime-research/logs/20260321_windows_ime_e2e_restore_default.json`

### 4.2 每轮 live snapshot

- `TODO/ime-research/logs/20260321_windows_ime_e2e_result.keybd-direct-number-1.live-snapshot.json`
- `TODO/ime-research/logs/20260321_windows_ime_e2e_result.keybd-direct-space.live-snapshot.json`
- `TODO/ime-research/logs/20260321_windows_ime_e2e_result.keybd-toggle-shift-number-1.live-snapshot.json`
- `TODO/ime-research/logs/20260321_windows_ime_e2e_result.keybd-toggle-shift-space.live-snapshot.json`
- `TODO/ime-research/logs/20260321_windows_ime_e2e_result.sendkeys-direct-number-1.live-snapshot.json`
- `TODO/ime-research/logs/20260321_windows_ime_e2e_result.sendkeys-direct-space.live-snapshot.json`
- `TODO/ime-research/logs/20260321_windows_ime_e2e_result.sendkeys-toggle-shift-number-1.live-snapshot.json`
- `TODO/ime-research/logs/20260321_windows_ime_e2e_result.sendkeys-toggle-shift-space.live-snapshot.json`

## 5. 当前最重要的结论

### 5.0 人工验证已经成立

用户已明确确认：

- 已切换到小狼毫
- 当前后续消息已经通过小狼毫输入

这说明：

- “输入法本身不可用”不是当前问题
- 当前没闭环的是自动化 E2E，不是人工真实打字

### 5.1 宿主链路已经成立

`TestHost` 已经不只是 smoke：

- 能自动启动
- 能自动聚焦单行输入框
- 能持续把实时状态写到 JSON
- 能记录是否真的收到了键盘事件

### 5.2 当前会话里的“真键盘注入”没有打到宿主

这是这次最关键的发现，而且是有证据的，不是猜的。

以 `keybd-direct-number-1` 为例：

- ready snapshot 已显示 `active_host = single-line`
- 但 final snapshot 仍然：
  - `single_line_text = ""`
  - `last_key_event = "none"`
  - `key_event_count = 0`

也就是说：

- 宿主焦点链路是通的
- 但自动化注入的按键没有进入宿主控件

这说明当前会话环境下，**“真实键盘模拟”本身就是阻塞点**，而不是 TestHost 文本框不工作。

### 5.3 `SendKeys` 也不可靠

`sendkeys-direct-number-1` 出现 `System.Windows.Forms.SendKeys.SendInput(...)` 异常；
`sendkeys-toggle-shift-*` 还触发了 `SHIFT` 关键字异常。

所以当前不能把希望寄托在 `SendKeys` 上。

### 5.4 当前 TSF 激活 helper 还没真正闭环

当前 `WeaselImeProfileActivator.cs` 返回的是：

- `HRESULT = 0x80070057`

而且 `GetActiveProfile` 返回的数据明显不可信（`GUID` 全零、`LANGID` 异常），这说明当前这版 COM interop 定义还不对，**还不能把它当成真正可用的精确激活 helper**。

## 6. 我对当前问题的判断

这里我不接受“可能是小狼毫不行”这种模糊说法。

现在更合理的判断是：

1. 小狼毫安装 / 注册 / 默认覆盖没有问题
2. TestHost 聚焦和实时快照没有问题
3. 真正的问题在于 **当前自动化运行环境没有把合成键盘输入送进目标窗口**
4. 同时，TSF 精确激活 helper 的 interop 还没定义对

所以当前 TODO 还不能勾掉，但问题边界已经被显式缩小了。

## 7. 下一步必须怎么做

优先级按这个顺序继续：

1. 修正 TSF COM helper
   - 参考官方 `ITfInputProcessorProfileMgr::ActivateProfile`
   - 先把“当前会话 active profile 真能读对”跑通
2. 替换当前键盘注入策略
   - 优先尝试更贴近真实桌面会话的方案：`WinAppDriver` / `FlaUI` / AutoHotkey / UIAccess 路线
   - 不要再把普通 `SendKeys` 当主路径
3. 如果当前 CLI 会话天然拿不到桌面输入权限
   - 就把这一点明确记录成环境约束
   - 后续改成在真正交互桌面会话中跑 E2E

## 8. 当前结论一句话

Windows 真打字 E2E 的“脚手架 + 持续快照 + 证据链”已经补齐；当前未闭环的核心，不再是宿主或安装，而是 **桌面级输入注入能力** 和 **TSF 精确激活 helper**。
