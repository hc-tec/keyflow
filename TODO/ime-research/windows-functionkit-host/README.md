# Windows Function Kit Host

> 编码：UTF-8
> 创建时间：2026-03-21T22:55:00+08:00
> 目标：提供一个真正加载浏览器式功能件 UI 的 Windows WebView2 宿主 PoC。

## 作用

这个目录不再是“只看协议”的示意代码，而是一个可直接运行的宿主侧 PoC：

- 左侧维护宿主上下文、权限策略、目标输入框模拟
- 右侧通过 `WebView2` 真正加载 `chat-auto-reply` 浏览器式 UI
- UI 与宿主之间只通过 Host Bridge envelope 通信
- 宿主可实际响应：
  - `bridge.ready`
  - `context.request`
  - `candidates.regenerate`
  - `candidate.insert`
  - `candidate.replace`
  - `storage.get`
  - `storage.set`
  - `panel.state.update`
  - `settings.open`

## 目录

- 解决方案：`TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost.sln`
- 项目：`TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost/WindowsFunctionKitHost.csproj`
- 主窗体：`TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost/MainForm.cs`
- 固定脚本：`TODO/ime-research/scripts/run_windows_functionkit_host.ps1`

## 怎么跑

构建：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_functionkit_host.ps1 -Mode build
```

Smoke：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_functionkit_host.ps1 -Mode smoke -SnapshotPath 'TODO/ime-research/logs/20260321_windows_functionkit_host_smoke_snapshot.json'
```

运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_functionkit_host.ps1 -Mode run
```

## 关键判断

- 这个 PoC 的目标不是替代真实 IME，而是先把“浏览器式功能件运行时”真正跑起来。
- 它与 `WindowsImeTestHost` 分开，避免把 IME 真打字 E2E 与功能件运行时耦在一起。
- 后续 Windows 输入法侧只需要把“目标输入框模拟”替换成真实 IME 文本提交链路。
