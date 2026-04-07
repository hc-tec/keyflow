# Windows IME E2E Activator 修正记录（2026-03-22）

> 编码：UTF-8
> 创建时间：2026-03-22T19:15:00+08:00
> 范围：`WindowsImeTestHost.Automation` / `run_windows_ime_e2e.ps1`

## 1. 这次实际修掉了什么

`WeaselImeProfileActivator.cs` 之前不是“还不稳定”这么简单，而是有两个明确的实现错误：

1. `TF_IPPMF_*` 常量值写错了
   - 代码里原先把：
     - `TF_IPPMF_DONTCARECURRENTINPUTLANGUAGE`
     - `TF_IPPMF_ENABLEPROFILE`
     - `TF_IPPMF_FORSESSION`
     都写成了错误的值
   - 直接后果就是 `ActivateProfile(...)` 返回 `0x80070057`
2. `ITfInputProcessorProfileMgr` 的 COM interop 定义不完整
   - 代码里直接从 `DeactivateProfile` 跳到了 `EnumProfiles` / `GetActiveProfile`
   - 但本机 Windows SDK `msctf.h` 明确表明中间还存在：
     - `GetProfile`
     - `ReleaseInputProcessor`
     - `RegisterProfile`
     - `UnregisterProfile`
   - 这会让 `GetActiveProfile(...)` 读错 vtable 槽位，导致之前日志里出现：
     - `GUID` 全零
     - `CategoryId` 全零
     - profile 数据明显不可信

这次已经按本机 Windows SDK 头文件修正：

- 参考：`D:\Windows Kits\10\Include\10.0.22621.0\um\msctf.h`
- 修正文件：`TODO/ime-research/windows-testhost/WindowsImeTestHost.Automation/WeaselImeProfileActivator.cs`

## 2. 本次验证命令

### 2.1 构建

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_windows_ime_e2e.ps1 `
  -Mode build `
  -LogPath TODO/ime-research/logs/20260322_windows_ime_e2e_build_after_activator_fix.log `
  -ResultPath TODO/ime-research/logs/20260322_windows_ime_e2e_result_after_activator_fix.json
```

### 2.2 完整 E2E

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_windows_ime_e2e.ps1 `
  -Mode run `
  -SkipInstallValidation `
  -LogPath TODO/ime-research/logs/20260322_windows_ime_e2e_run_after_activator_fix.log `
  -ResultPath TODO/ime-research/logs/20260322_windows_ime_e2e_result_after_activator_fix.json
```

## 3. 新的硬结果

### 3.1 TSF 激活 helper 已从红变绿

`TODO/ime-research/logs/20260322_windows_ime_e2e_result_after_activator_fix.json` 现在明确显示：

- `activation_before_launch.Succeeded = true`
- `activation_before_launch.HResultHex = 0x00000000`
- `activation_after_focus.Succeeded = true`
- `activation_after_focus.HResultHex = 0x00000000`

而且 profile 数据现在终于可信了：

- 激活前是搜狗：
  - `Clsid = e7ea138e-69f8-11d7-a6ea-00065b844310`
  - `GuidProfile = e7ea138f-69f8-11d7-a6ea-00065b844311`
- 激活后是小狼毫：
  - `Clsid = a3f4cded-b1e9-41ee-9ca6-7b4d0de6cb0a`
  - `GuidProfile = 3d02cab6-2b8e-4781-ba20-1c9267529467`

也就是说：

- `WeaselImeProfileActivator` 这个 helper 不再是“错误实现”
- Windows IME 闭环的主阻塞已经不再是 TSF COM interop

### 3.2 键盘注入结论也更新了

这次和 2026-03-21 的旧结果相比，有一个重要变化：

- `keybd_event` 路线不再是“完全打不到宿主”
- 至少部分尝试已经能让 `TestHost` 收到按键事件

新的证据：

- `keybd-toggle-shift-number-1`
  - `key_event_count = 4`
  - `last_key_event = single-line:KeyPress:1`
  - `single_line_text = "1"`
- `keybd-toggle-shift-space`
  - `key_event_count = 4`
  - `last_key_event = multi-line:KeyPress: `
  - `multi_line_text = " "`

这说明：

- 当前 runner 已经不再是“完全没有把键盘事件送进宿主”
- 但它仍然没有形成 `nihao -> 你好` 的真实上屏闭环

### 3.3 真正剩下的阻塞被进一步收缩

当前未闭环的点，已经缩小为下面几类：

1. IME 组合输入没有稳定形成汉字候选/上屏
   - 当前看到的是原始字符或空结果，不是 `你好`
2. 焦点仍有漂移
   - 某些尝试里 `last_commit_target` 从 `single-line` 飘到了 `multi-line`
   - 某些最终快照里 `active_host = none`
3. `SendKeys` 的 `SHIFT` 路线仍是脚本错误
   - 当前仍报：
     - `System.ArgumentException: 关键字“SHIFT”无效。`
   - 这条分支现在不应继续作为主路径

## 4. 当前结论

到 2026-03-22 19:08 +08:00 为止，可以明确下结论：

- `WeaselImeProfileActivator` 已修正并验证通过
- `0x80070057` 不再是当前阻塞
- `GetActiveProfile()` 现在返回的是可信 profile，而不是错位垃圾数据
- Windows IME E2E 还没闭环，但剩余问题已经收缩到：
  - 前台焦点稳定性
  - 组合输入/候选上屏
  - 自动化注入策略本身

## 5. 下一步建议

下一轮不要再重复怀疑 TSF helper；继续时直接做这几件事：

1. 把 `SendKeys` 的 `SHIFT` 尝试从主路径里移除或改成合法输入策略
2. 针对 `keybd_event` 已能到达宿主的情况，补更细的焦点/控件句柄诊断
3. 引入更稳定的桌面输入驱动方案：
   - `SendInput`
   - `FlaUI`
   - 或真正交互桌面会话内的自动化代理
4. 如果要验证候选是否出现，需要补“候选窗 / 组合态”可观测证据，而不只看文本框结果
