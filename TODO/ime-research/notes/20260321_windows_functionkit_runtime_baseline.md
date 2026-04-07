# Windows 浏览器式功能件运行时基线（2026-03-21）

> 编码：UTF-8
> 创建时间：2026-03-21T19:58:00+08:00
> 更新时间：2026-03-21T19:58:00+08:00
> 范围：`WindowsImeTestHost` 中的 `WebView2` 功能件运行时、固定运行方式、当前验证证据

## 1. 这次真正落地了什么

这次不是只写协议文档，也不是只做 SDK 种子，而是把一个**真正可运行的 Windows 浏览器式功能件宿主**接进了现有 `TestHost`。

当前基线已经具备：

- 独立 `WebView2` 功能件面板
- 本地静态资源映射
- 统一 Host Bridge envelope
- `bridge.ready -> bridge.ready.ack`
- `context.request -> context.sync -> candidates.render`
- `candidate.insert` / `candidate.replace` 显式写回宿主输入框
- 本地 JSON 存储
- `panel.state.update` / `storage.get` / `storage.set` 的宿主侧处理骨架
- smoke 模式下的浏览器功能件自动点击候选回放

## 2. 具体落点

- Windows 宿主主工程：`TODO/ime-research/windows-testhost/WindowsImeTestHost/WindowsImeTestHost.csproj`
- 主窗体：`TODO/ime-research/windows-testhost/WindowsImeTestHost/MainForm.cs`
- 布局拆分：`TODO/ime-research/windows-testhost/WindowsImeTestHost/MainForm.Layout.cs`
- 功能件宿主逻辑：`TODO/ime-research/windows-testhost/WindowsImeTestHost/MainForm.FunctionKit.cs`
- `WebView2` 宿主桥：`TODO/ime-research/windows-testhost/WindowsImeTestHost/FunctionKitPanelHost.cs`
- envelope 工厂：`TODO/ime-research/windows-testhost/WindowsImeTestHost/FunctionKitEnvelopeFactory.cs`
- 存储：`TODO/ime-research/windows-testhost/WindowsImeTestHost/FunctionKitStorageStore.cs`
- 固定入口脚本：`TODO/ime-research/scripts/run_windows_testhost.ps1`

## 3. 关键设计判断

### 3.1 不替换旧网页 fallback

旧 `WebBrowser` 测试区继续保留，只负责 IME 网页输入 fallback。

新的浏览器式功能件运行时放到独立 `WebView2` 面板里。

原因：

- 不破坏现有 Windows IME 测试基线
- 可以先把“插件 UI 呈现正确、候选可点击、文本可显式提交”单独跑通
- 后续 Android `WebView` 宿主能对齐同一套桥接模型

### 3.2 当前焦点 != 最终提交目标

这是当前实现里最重要的设计点。

功能件面板自己获得焦点后，目标输入框会失焦，所以宿主必须单独维护：

- 当前焦点：`active_host`
- 最后提交目标：`last_commit_target`

候选按钮点击后，文本按 `last_commit_target` 显式写回，而不是按“当前焦点控件”写回。

### 3.3 安全基线

当前 Windows 宿主明确做了 4 件事：

- 只映射本地目录 `TODO/`
- `WebView2` 禁用默认右键菜单与 DevTools
- 拦截新窗口
- 拦截非 `function-kit.local` 资源请求

所以这不是“网页随便开”，而是一个受控浏览器容器。

## 4. 这次踩到的真实坑

最大的真实问题不是协议，而是资源路径。

`chat-auto-reply` 页面里的 SDK 路径最初写错了，导致：

- 页面本身能打开
- `document.readyState=complete`
- `chrome.webview` 可用
- 但 `FunctionKitRuntimeSDK` 根本没加载进来

这次通过宿主侧 probe 直接查出了实际解析结果：

- 错误路径曾被解析成 `https://function-kit.local/function-kits/function-kit-runtime-sdk/dist/function-kit-runtime.js`

最终修正后的入口页是：

- `TODO/function-kits/chat-auto-reply/ui/app/index.html`

当前固定脚本引用是：

- `../../../../../function-kit-runtime-sdk/dist/function-kit-runtime.js`

## 5. 固定怎么跑

### 5.1 构建

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode build
```

### 5.2 浏览器功能件基础 smoke

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode smoke -SnapshotPath 'TODO/ime-research/logs/20260321_windows_testhost_functionkit_smoke_snapshot.json'
```

### 5.3 浏览器功能件提交 smoke

这个命令会：

1. 启动 `TestHost`
2. 预聚焦单行输入框
3. 等功能件面板握手与候选渲染完成
4. 宿主通过脚本点击第一个 `插入` 按钮
5. 把结果写回单行输入框
6. 输出最终快照

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode smoke -StartupFocus single-line -SnapshotPath 'TODO/ime-research/logs/20260321_windows_testhost_functionkit_commit_smoke_snapshot.json'
```

### 5.4 打开长期运行的调试宿主

```powershell
dotnet run --project TODO\ime-research\windows-testhost\WindowsImeTestHost\WindowsImeTestHost.csproj -- --live-snapshot-file TODO\ime-research\logs\windows_testhost_functionkit_live_snapshot.json --startup-focus single-line
```

## 6. 当前证据

### 6.1 基础 smoke

文件：

- `TODO/ime-research/logs/20260321_windows_testhost_functionkit_smoke_snapshot.json`

关键状态：

- `function_kit_ready=true`
- `function_kit_last_message_type=context.request`
- `function_kit_last_error=none`

说明：

- 页面已握手成功
- UI 已真正向宿主请求上下文

### 6.2 提交 smoke

文件：

- `TODO/ime-research/logs/20260321_windows_testhost_functionkit_commit_smoke_snapshot.json`

关键状态：

- `active_host=single-line`
- `last_commit_target=single-line`
- `function_kit_ready=true`
- `function_kit_last_message_type=candidate.insert`
- `single_line_text` 已写入候选内容

说明：

- 这已经不是“页面显示了”，而是**浏览器式功能件 UI -> Host Bridge -> 目标输入框提交**整条链路真的跑通了

## 7. 仍然没解决的事

这次解决的是“浏览器式功能件运行时能不能实用”，不是全部问题都解决了。

当前还没解决的重点有：

- Android `WebView` 宿主还没接入真实 `fcitx5-android`
- `OpenClaw` 真实 provider auth 仍没打通
- Windows 真正的小狼毫自动打字 E2E 仍缺输入注入链路
- 当前候选仍是宿主 mock 生成，不是真实 Agent 结果

## 8. 下一步建议

继续时按这个顺序：

1. 先把这套 Windows Host Runtime 逻辑抽成可独立仓库化的 Host 层
2. 再把同一套 envelope / permission / storage / panel-state 模型对接 Android `WebView`
3. 然后把 `OpenClaw agent-only` 真正接进 `candidates.render`
4. 最后再把“小狼毫真实上屏”和浏览器式功能件放进一个 Windows E2E 场景里
