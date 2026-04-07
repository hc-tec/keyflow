# Windows Function Kit Host PoC（2026-03-21）

> 编码：UTF-8
> 创建时间：2026-03-21T23:05:00+08:00
> 目标：把浏览器式功能件运行时在 Windows 侧做成真正可跑的 WebView2 宿主 PoC。

## 1. 这次新增了什么

- 新增独立 PoC 目录：`TODO/ime-research/windows-functionkit-host/`
- 新增解决方案：`TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost.sln`
- 新增固定脚本：`TODO/ime-research/scripts/run_windows_functionkit_host.ps1`
- 新增真正的 Windows WebView2 宿主：
  - 左侧：宿主上下文、权限策略、目标输入框模拟
  - 右侧：真实加载 `chat-auto-reply` 浏览器式功能件 UI

## 2. 已经跑通的能力

这个 PoC 当前已经不是“文档设想”，而是实际可运行：

- `bridge.ready -> bridge.ready.ack`
- `permissions.sync`
- `context.request -> context.sync`
- `candidates.render`
- `candidate.insert`
- `candidate.replace`
- `storage.get / storage.set / storage.sync`
- `panel.state.update / panel.state.ack`
- `settings.open`
- `host.state.update`
- `bridge.error`

## 3. 固定怎么跑

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_functionkit_host.ps1 -Mode build
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_functionkit_host.ps1 -Mode smoke -SnapshotPath 'TODO/ime-research/logs/20260321_windows_functionkit_host_smoke_snapshot.json'
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_functionkit_host.ps1 -Mode run
```

## 4. 当前验证证据

- build / smoke 入口脚本：`TODO/ime-research/scripts/run_windows_functionkit_host.ps1`
- smoke 快照：`TODO/ime-research/logs/20260321_windows_functionkit_host_smoke_snapshot.json`
- smoke build log：`TODO/ime-research/logs/20260321_windows_functionkit_host_smoke.log`
- smoke run log：`TODO/ime-research/logs/20260321_windows_functionkit_host_smoke.smoke.log`

当前 smoke 快照已经证明：

- `WebView2` 本地资源映射成功
- UI 已完成握手
- UI 已主动请求 `context.request`
- 宿主已完成首轮 `candidates.render`

## 5. 这对后续有什么意义

- Windows 侧“浏览器式功能件运行时”已经不再停留在协议层。
- 后续只需要把左侧“目标输入框模拟”替换成真实 IME commit 链路。
- 这条线与 `WindowsImeTestHost` 分离，避免 IME 真打字 E2E 与功能件运行时互相污染。

## 6. 当前仍然保留的现实问题

- `Microsoft.Web.WebView2` 当前仍带来一个 `MSB3277` 的 `WindowsBase` 版本冲突警告，但不影响当前项目构建与 smoke。
- 这个 PoC 还没有接入真实 `rime-weasel` / `FcitxInputMethodService`，目前仍是宿主模拟输入框。
- OpenClaw 真实模型调用仍然受 auth 阻塞，所以候选结果目前仍由宿主预览引擎生成。
