# Chat Auto Reply Tests

> 编码：UTF-8
> 创建时间：2026-03-21T20:45:00+08:00
> 更新时间：2026-03-21T23:35:00+08:00
> 目标：固定 `chat-auto-reply` 的桥接、运行时和快照测试资产。

## 1. 测试层

1. Tool contract tests
   - `request.basic.json`
   - `response.basic.json`
2. Bridge contract tests
   - `bridge.host-to-ui.ready-ack.basic.json`
   - `bridge.host-to-ui.permissions.basic.json`
   - `bridge.host-to-ui.render.basic.json`
   - `bridge.ui-to-host.insert.basic.json`
   - `bridge.host-to-ui.storage-sync.basic.json`
   - `bridge.host-to-ui.permission-denied.basic.json`
   - `bridge.host-to-ui.error.basic.json`
3. Runtime snapshot tests
   - `runtime.snapshot.panel.basic.json`

当前 UI 还额外覆盖：

- `storage.get / storage.set / storage.sync`
- `panel.state.update / panel.state.ack`
- 页签切换状态恢复

运行时实现统一来自：`TODO/function-kit-runtime-sdk/README.md`

当前已经有一个可执行的 Windows 合同回放入口：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode contract
```

它会在真实 `WebView2` 里回放这些 fixture，并写出：

- `TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_result.json`
- `TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_host_snapshot.json`

## 2. 最小回放顺序

1. 把 `bridge.host-to-ui.ready-ack.basic.json` 注入 Web UI
2. 注入 `bridge.host-to-ui.permissions.basic.json`
3. 断言 UI 发出 `context.request`
4. 把 `bridge.host-to-ui.render.basic.json` 注入 Web UI
5. 断言页面渲染结果与 `runtime.snapshot.panel.basic.json` 一致
6. 点击首条候选的“插入”
7. 断言 UI 发出 `bridge.ui-to-host.insert.basic.json`
8. 注入 `bridge.host-to-ui.storage-sync.basic.json`
9. 注入 `bridge.host-to-ui.permission-denied.basic.json`
10. 注入 `bridge.host-to-ui.error.basic.json`
11. 断言错误条展示正确

## 3. Windows / Android 共用面

- 共用 bridge envelope
- 共用 `candidates.render` payload 结构
- 共用 runtime snapshot
- 共用错误码和错误展示逻辑

平台差异只留在：

- Host Adapter 如何把 envelope 送进 Web UI
- Host Adapter 如何执行最终 `insert/replace`
