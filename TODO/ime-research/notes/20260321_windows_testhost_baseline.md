# Windows TestHost 基线（2026-03-21）

> 编码：UTF-8
> 创建时间：2026-03-21T18:05:00+08:00
> 更新时间：2026-03-21T18:05:00+08:00
> 范围：Windows 输入法 E2E 宿主、固定入口、当前 smoke 结果

## 1. 为什么现在必须补这个宿主

截至当前阶段，`rime-weasel` 已经完成：

- 源码构建
- installer 打包
- 机器级安装 / 注册验证
- 输入法列表可见性验证

真正缺的已经不再是“装没装上”，而是：

- 能不能在真实桌面输入框里稳定切换到小狼毫
- 输入拼音后能不能稳定候选 / 上屏
- 富文本和网页输入场景会不会有焦点或候选问题

所以现在必须补一个专用 Windows `TestHost`。

## 2. 这次新增了什么

新增目录：

- `TODO/ime-research/windows-testhost`

关键文件：

- 解决方案：`TODO/ime-research/windows-testhost/WindowsImeTestHost.sln`
- 项目：`TODO/ime-research/windows-testhost/WindowsImeTestHost/WindowsImeTestHost.csproj`
- 主窗体：`TODO/ime-research/windows-testhost/WindowsImeTestHost/MainForm.cs`
- 运行说明：`TODO/ime-research/windows-testhost/README.md`
- 固定脚本：`TODO/ime-research/scripts/run_windows_testhost.ps1`

## 3. 当前宿主覆盖了哪些输入场景

当前 UI 已覆盖：

1. 单行 `TextBox`
2. 多行 `TextBox`
3. `RichTextBox`
4. 网页输入 fallback 场景
   - `input`
   - `textarea`
   - `contenteditable`

网页部分当前刻意用 WinForms 自带 `WebBrowser`，不是 WebView2。

原因不是“更先进”，而是：

- 先把 Windows IME 自动化链路做稳
- 避免把额外 runtime / 包依赖引成新阻塞
- 让这台机器现在就能稳定构建、稳定 smoke

后面如果需要更贴近真实浏览器，再加 WebView2 专项宿主。

## 4. 固定怎么跑

### 4.1 只构建

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode build
```

### 4.2 跑 smoke

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode smoke -SnapshotPath 'TODO/ime-research/logs/20260321_windows_testhost_smoke_snapshot.json'
```

### 4.3 真正打开宿主

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode run
```

## 5. 这次已经跑过的验证

### 5.1 直接 `dotnet build`

已成功：

- `dotnet build TODO\ime-research\windows-testhost\WindowsImeTestHost.sln`

### 5.2 固定脚本 `smoke`

已成功：

- 构建日志：`TODO/ime-research/logs/20260321_windows_testhost_build.log`
- recheck 构建日志：`TODO/ime-research/logs/20260321_windows_testhost_recheck.log`
- recheck smoke 日志：`TODO/ime-research/logs/20260321_windows_testhost_recheck.smoke.log`
- smoke 快照：`TODO/ime-research/logs/20260321_windows_testhost_smoke_snapshot.json`
- recheck smoke 快照：`TODO/ime-research/logs/20260321_windows_testhost_recheck_snapshot.json`

当前 smoke 快照表明：

- 主窗体能拉起
- 网页 fallback 场景已 ready
- 快照输出链路可用

## 6. 宿主对后续自动化有什么帮助

这个宿主现在已经具备 3 个关键特征：

1. 左侧有显式“聚焦哪个输入控件”的按钮
2. 右侧有持续更新的快照框
3. 网页场景不要求自动化脚本直接读 DOM，可以先断言快照框

这意味着后续 `FlaUI` / `WinAppDriver` 可以先用最短路径：

1. 打开宿主
2. 点击左侧某个聚焦按钮
3. 切换到小狼毫
4. 输入拼音
5. 选词
6. 断言右侧快照文本

## 7. 还没完成的部分

这次只解决了“宿主存在且可构建 / 可启动”的问题，还没解决：

1. 精确激活小狼毫的 helper
2. 真正的 Windows E2E 驱动
3. 用宿主自动验证 `nihao -> 你好`
4. 网页场景换成 WebView2 的专门对照宿主

## 8. 下一步怎么继续

继续时按这个顺序：

1. 先跑 `verify_rime_weasel_install.ps1`
2. 再跑 `run_windows_testhost.ps1 -Mode smoke`
3. 再补 IME 激活 helper
4. 再接 `FlaUI` 或 `WinAppDriver`
5. 最后把“小狼毫真实上屏”变成固定回归测试
