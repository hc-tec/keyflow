# Windows IME TestHost

> 编码：UTF-8
> 创建时间：2026-03-21T17:20:00+08:00
> 更新时间：2026-03-21T23:35:00+08:00

## 作用

这个目录现在是 **Windows IME 集成 / E2E 宿主**，并且内嵌一套浏览器式功能件验证面：

- IME 输入宿主基线
  - 单行 `TextBox`
  - 多行 `TextBox`
  - `RichTextBox`
  - 旧网页输入 fallback（WinForms `WebBrowser`）
- 浏览器式功能件集成验证
  - 独立 `WebView2` 面板
  - 本地静态资源加载
  - Host Bridge 握手 / 上下文 / 候选 / 显式提交
  - fixture 回放 / UI 快照 / 候选插入 / 错误条断言

角色边界固定如下：

- `TODO/ime-research/windows-functionkit-host/`
  - 更偏 Windows Function Kit Host / Runtime 参考实现
- `TODO/ime-research/windows-testhost/`
  - 更偏真实输入面、提交目标、live snapshot、IME 自动化、功能件写回

这里的关键设计是：

- 不替换现有网页 fallback 测试区
- 额外新增一个独立 `WebView2` 面板来承载功能件 UI
- “当前焦点”和“最后提交目标”分离，避免功能件面板获得焦点后无法写回目标输入框

## 目录

- 解决方案：`TODO/ime-research/windows-testhost/WindowsImeTestHost.sln`
- 项目：`TODO/ime-research/windows-testhost/WindowsImeTestHost/WindowsImeTestHost.csproj`
- 主窗体：`TODO/ime-research/windows-testhost/WindowsImeTestHost/MainForm.cs`
- 功能件宿主桥：`TODO/ime-research/windows-testhost/WindowsImeTestHost/FunctionKitPanelHost.cs`
- Envelope 工厂：`TODO/ime-research/windows-testhost/WindowsImeTestHost/FunctionKitEnvelopeFactory.cs`
- 功能件存储：`TODO/ime-research/windows-testhost/WindowsImeTestHost/FunctionKitStorageStore.cs`
- 入口脚本：`TODO/ime-research/scripts/run_windows_testhost.ps1`

## 依赖

- .NET SDK：当前已用 `9.0.101` 验证
- Edge WebView2 Runtime
- NuGet 包：`Microsoft.Web.WebView2`

备注：

- 当前 `dotnet build` 会出现 `WindowsBase` 版本冲突警告，但不阻塞构建与运行
- 功能件页面只加载本地资源，不依赖远程站点

## 直接命令

构建：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode build
```

基础 smoke：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode smoke -SnapshotPath 'TODO/ime-research/logs/20260321_windows_testhost_functionkit_smoke_snapshot.json'
```

功能件提交 smoke（自动聚焦单行框，并通过 `WebView2` 面板点击首个候选插入）：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode smoke -StartupFocus single-line -SnapshotPath 'TODO/ime-research/logs/20260321_windows_testhost_functionkit_commit_smoke_snapshot.json'
```

功能件 contract 回放（真实 `WebView2` 中回放 fixture、比对 UI 快照、点击首条候选、断言错误条）：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode contract -SnapshotPath 'TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_host_snapshot.json' -ContractResultPath 'TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_result.json'
```

打开宿主并持续写 live snapshot：

```powershell
dotnet run --project TODO\ime-research\windows-testhost\WindowsImeTestHost\WindowsImeTestHost.csproj -- --live-snapshot-file TODO\ime-research\logs\windows_testhost_functionkit_live_snapshot.json --startup-focus single-line
```

禁用功能件面板，仅保留旧 IME 宿主：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode run -DisableFunctionKit
```

## 当前已验证结果

- `WebView2` 功能件面板已经能够：
  - 加载 `TODO/function-kits/chat-auto-reply/ui/app/index.html`
  - 通过 `FunctionKitRuntimeSDK` 发出 `bridge.ready`
  - 收到宿主 `bridge.ready.ack`
  - 触发 `context.request`
  - 渲染候选
  - 点击候选后回传 `candidate.insert`
  - 由宿主显式写回目标输入框
- 固定证据：
  - 基础 smoke：`TODO/ime-research/logs/20260321_windows_testhost_functionkit_smoke_snapshot.json`
  - 提交 smoke：`TODO/ime-research/logs/20260321_windows_testhost_functionkit_commit_smoke_snapshot.json`
  - contract 结果：`TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_result.json`
  - contract 宿主快照：`TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_host_snapshot.json`

其中提交 smoke 的关键断言是：

- `function_kit_ready=true`
- `function_kit_last_message_type=candidate.insert`
- `single_line_text` 已被候选内容写入

其中 contract 的关键断言是：

- `render_snapshot_matched=true`
- `candidate_insert_observed=true`
- `permission_denied_handled=true`
- `bridge_error_handled=true`

## 自动化接入建议

- Windows IME 自动化继续用这个宿主，不必另起一个壳
- 浏览器式功能件自动化优先断言 live snapshot 文件，而不是只看 UIA 控件树
- 当前已经补出一条固定 contract runner，可直接回放 fixture 并断言 UI 快照
- 如果要继续做更强的自动化，优先补这 3 件事：
  - Android `WebView` 侧的同构 contract runner
  - `FlaUI` 驱动真实聚焦与截图
  - 小狼毫真实上屏与功能件面板串联 E2E

## 下一步

1. 把 Android `WebView` 宿主补成与 Windows 相同的本地资源 / 权限拒绝策略
2. 把 `TestHost` 里的功能件桥接继续往 shared runtime host 收敛
3. 把同一套 Host Bridge / 权限 / 存储 / contract runner 语义落到 Android `WebView`
