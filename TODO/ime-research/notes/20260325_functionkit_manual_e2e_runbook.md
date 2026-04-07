# Function Kit 手动 E2E Runbook（Emulator + 真机远程 ADB）

> 编码：UTF-8  
> 创建时间：2026-03-25T00:00:00+08:00  
> 范围：`TODO/ime-research/repos/fcitx5-android` 的 Function Kit（WebView runtime + host bridge）  
> 原则：不写脆弱脚本 E2E；每一步都要“亲力亲为”截图 + logcat 留痕，靠证据推进。

---

## 0. 约定与目录

### 0.1 固定路径

- Workspace 根：`<WORKSPACE_ROOT>`
- Android 项目：`<WORKSPACE_ROOT>/TODO/ime-research/repos/fcitx5-android`
- 手工验证产物：
  - Emulator：`<WORKSPACE_ROOT>/TODO/ime-research/artifacts/manual/emulator/<runId>/`
  - 真机（建议）：`<WORKSPACE_ROOT>/TODO/ime-research/artifacts/manual/real-device/<runId>/`

### 0.2 runId 命名

推荐：`YYYYMMDD_HHMMSS_<short_slug>`  
例：`20260325_003012_autoreply_ai`

### 0.3 设备序列号变量

下文用：

- Emulator：`<EMU>`（例如 `emulator-5554`）
- 真机远程：`<DEV>`（固定为 `<DEVICE_SERIAL>`）

所有 adb 命令都强制带 `-s <serial>`，避免装错设备。

---

## 1. 构建与安装（通用）

### 1.1 确认设备 ABI（决定 buildABI）

```powershell
adb devices -l
adb -s <DEVICE_SERIAL> shell getprop ro.product.cpu.abi
adb -s <DEVICE_SERIAL> shell getprop ro.product.cpu.abi
```

常见：

- Emulator 多数是 `x86_64`
- 真机多为 `arm64-v8a`

### 1.2 构建 Debug APK（按 ABI）

```powershell
cd <WORKSPACE_ROOT>\TODO\ime-research\repos\fcitx5-android
.\gradlew.bat :app:assembleDebug -PbuildABI=<abi>
```

APK 输出目录：

- `<WORKSPACE_ROOT>\TODO\ime-research\repos\fcitx5-android\app\build\outputs\apk\debug\`

挑选最新 APK（PowerShell）：

```powershell
cd <WORKSPACE_ROOT>\TODO\ime-research\repos\fcitx5-android
$apk = Get-ChildItem app\build\outputs\apk\debug\org.fcitx.fcitx5.android-*-debug.apk | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$apk.FullName
```

### 1.3 安装（禁止增量安装）

```powershell
adb -s <DEVICE_SERIAL> install --no-incremental -r -d "<apkFullPath>"
```

若 OEM/安全组件拦截 ADB 安装，出现：

- `INSTALL_FAILED_ABORTED: User rejected permissions`

则改用“推送到 Download + 拉起系统安装器 UI”（需要用户在手机上点安装）：

```powershell
adb -s <DEVICE_SERIAL> push "<apkFullPath>" /sdcard/Download/fcitx-debug.apk
adb -s <DEVICE_SERIAL> shell am start -a android.intent.action.VIEW -d file:///sdcard/Download/fcitx-debug.apk -t application/vnd.android.package-archive
```

如果遇到签名不一致导致安装失败：

```powershell
adb -s <DEVICE_SERIAL> uninstall org.fcitx.fcitx5.android.debug
adb -s <DEVICE_SERIAL> install --no-incremental -r -d "<apkFullPath>"
```

---

## 2. 启用 / 切换输入法（通用）

IME id（debug 包）通常为：

`org.fcitx.fcitx5.android.debug/org.fcitx.fcitx5.android.input.FcitxInputMethodService`

### 2.1 用 adb 启用并设为当前 IME

```powershell
adb -s <DEVICE_SERIAL> shell ime list -s
adb -s <DEVICE_SERIAL> shell ime enable org.fcitx.fcitx5.android.debug/org.fcitx.fcitx5.android.input.FcitxInputMethodService
adb -s <DEVICE_SERIAL> shell ime set org.fcitx.fcitx5.android.debug/org.fcitx.fcitx5.android.input.FcitxInputMethodService
adb -s <DEVICE_SERIAL> shell settings get secure default_input_method
```

### 2.2 如果 OEM 限制导致 enable/set 失败（真机常见）

手动路径（不同 ROM 名称可能略有差异）：

1. 打开系统设置
2. 进入“语言和输入法 / 输入法管理 / 键盘管理”
3. 在“已启用输入法/键盘”里打开 `Fcitx5 Debug`
4. 在“当前输入法/默认输入法”选择 `Fcitx5 Debug`

---

## 3. Emulator 手动 E2E（亲力亲为）

### 3.1 启动 Emulator

推荐使用 Android Studio：

1. `Tools` -> `Device Manager`
2. 启动一个 AVD

确认 adb 看到它：

```powershell
adb devices -l
```

### 3.2 安装 + 切输入法

按 **第 1 节** 构建安装，按 **第 2 节** 启用/切换输入法。

### 3.3 打开“E2E Playground”（强烈推荐）

这是 debug-only Activity，用来稳定拉起 IME：

```powershell
adb -s <DEVICE_SERIAL> shell am start -n org.fcitx.fcitx5.android.debug/org.fcitx.fcitx5.android.input.functionkit.FunctionKitImeE2EPlaygroundActivity
```

进入后会自动 focus 输入框并弹出键盘。

### 3.4 打开 Function Kit 面板

1. 确认当前输入法是 `Fcitx5 Debug`（键盘 UI 应该能看出来）
2. 在键盘上方的工具栏中找到 `Function Kit` 入口（或“更多/Status Area”里进入）
3. 打开 `Auto Reply` / `Quick Phrases` 等功能件

### 3.5 产物采集（Emulator）

见 **第 5 节**（截图 + logcat）。产物目录放：

`TODO/ime-research/artifacts/manual/emulator/<runId>/`

---

## 4. 真机远程 ADB 手动 E2E（<DEVICE_SERIAL>）

### 4.1 连接远程设备

```powershell
adb connect <DEVICE_SERIAL>
adb devices -l
```

后续固定序列号：

- `<DEV>` = `<DEVICE_SERIAL>`

### 4.2 安装 Debug APK（禁止增量）

```powershell
adb -s <DEVICE_SERIAL> install --no-incremental -r -d "<apkFullPath>"
```

若遇到 `INSTALL_FAILED_ABORTED: User rejected permissions`，用 **1.3** 的 Download 安装回退路径。

### 4.3 启用并切换 IME

```powershell
adb -s <DEVICE_SERIAL> shell ime list -s
adb -s <DEVICE_SERIAL> shell ime enable org.fcitx.fcitx5.android.debug/org.fcitx.fcitx5.android.input.FcitxInputMethodService
adb -s <DEVICE_SERIAL> shell ime set org.fcitx.fcitx5.android.debug/org.fcitx.fcitx5.android.input.FcitxInputMethodService
adb -s <DEVICE_SERIAL> shell settings get secure default_input_method
```

若失败，按 **2.2** 在手机设置里手动勾选并设为默认输入法。

### 4.4 打开“E2E Playground”

```powershell
adb -s <DEVICE_SERIAL> shell am start -n org.fcitx.fcitx5.android.debug/org.fcitx.fcitx5.android.input.functionkit.FunctionKitImeE2EPlaygroundActivity
```

然后按 Emulator 同样流程打开 Function Kit 面板做验证。

---

## 5. 采集证据（截图 + logcat）

### 5.1 清空日志缓冲区（每轮验证前必做）

```powershell
adb -s <DEVICE_SERIAL> logcat -c
adb -s <DEVICE_SERIAL> logcat -b crash -c
```

### 5.2 过滤关键 tag（两种方式）

方式 A：logcat 直接按 tag 过滤（推荐）

```powershell
adb -s <DEVICE_SERIAL> logcat -v threadtime FunctionKitWindow:D FunctionKitWebViewHost:D *:S
```

方式 B：Windows 侧 findstr 过滤（当 tag 过滤不够用时）

```powershell
adb -s <DEVICE_SERIAL> logcat -v threadtime | findstr /i "FunctionKitWindow FunctionKitWebViewHost"
```

保存到文件（推荐同时留 full + filtered）：

```powershell
adb -s <DEVICE_SERIAL> logcat -d -v threadtime > logcat_full.txt
adb -s <DEVICE_SERIAL> logcat -d -v threadtime | findstr /i "FunctionKitWindow FunctionKitWebViewHost" > logcat_functionkit.txt
adb -s <DEVICE_SERIAL> logcat -d -b crash -v threadtime > logcat_crash.txt
```

### 5.3 截图：adb exec-out screencap -p

注意：PowerShell 的 `>` 可能会把二进制当文本写坏 PNG。最稳妥做法是交给 `cmd /c` 去重定向：

```powershell
cmd /c "adb -s <DEVICE_SERIAL> exec-out screencap -p > screen_001.png"
```

建议每个截图文件名带步骤含义，例如：

- `screen_010_handshake_ok.png`
- `screen_020_permissions.png`
- `screen_030_ai_generate_clicked.png`

---

## 6. 每轮验证 Checklist（必须逐项过）

建议每轮都在产物目录里写一份 `NOTES.md`，逐项打勾并记录“证据文件名”。

### 6.1 握手（bridge.ready）

- 功能件面板显示“宿主握手完成”
- 若失败应显示超时/错误原因（同时抓 logcat）

### 6.2 Permissions 同步

- 面板内“已授权能力”包含（至少）：
  - `context.read`
  - `input.insert`
  - `input.replace`
  - `candidates.regenerate`
  - `ai.request`（用于 Android 直连模型）

### 6.3 Context

- 点击/触发“刷新上下文”
- 能看到：
  - 目标 App（在 Playground 就是本 App）
  - Selection（起止位置）
  - 当前输入框文本为空时，宿主会提示“通用聊天场景示例”也可接受

### 6.4 Candidates 渲染

- 点击“换一批 / 刷新候选”后：
  - 能收到 `candidates.render`
  - 候选卡片可见且可滚动

### 6.5 Input insert / replace

在 Playground 输入框里先打一些文字（例如 `abc` 或中文拼音上屏后得到 `你好`）：

- 点候选“插入”：应在当前光标处插入候选文本
- 点候选“替换”：应替换选区；当没有选区时，应替换整个输入框内容（预期像聊天 app 智能回复）

### 6.6 AI 生成（真实链路）

- 触发 AI（例如 Auto Reply 的“AI 生成/换一批”按钮）
- 观察：
  - 面板出现“Android AI 生成候选中/已更新”之类状态
  - 候选来自真实模型返回，而非固定本地 demo
- 同时抓：
  - `logcat_functionkit.txt`（关键 tag）
  - 至少一张“触发前/触发后”截图

---

## 7. 常见故障定位（只给最短路径）

### 7.1 握手超时

1. 先截屏：面板错误提示
2. 抓 `logcat_functionkit.txt`
3. 重点看：
   - `FunctionKitWebViewHost` 是否初始化成功
   - 是否有 `bridge.ready` request timeout

### 7.2 AI not ready / Android AI chat 失败

1. 打开 App 的 AI 设置页确认状态（debug 默认应自动填好）
2. 抓 `logcat_functionkit.txt`，关注：
   - `ai_chat_not_ready`
   - `ai_chat_http_error / ai_chat_auth_failed / ai_chat_timeout`
3. 确认网络可用（真机/模拟器均需能访问 `https://api.deepseek.com`）

### 6.7 File Upload Lab（files.pick + network.fetch bodyRef）

目标：验证 `files.pick` 选择文件后，`network.fetch` 能携带 `bodyRef` 上传且不出现 SDK 超时。

步骤：

1. 打开 Function Kit：`File Upload Lab`
2. 点击 `Pick File` 选择一个小文件（建议 < 1MB）
3. 点击 `Upload`（默认 `https://httpbin.org/post`）
4. 预期：
   - UI 显示 `network.fetch.result`（而不是 `request timeout`）
   - 输出里能看到 `response.status`、`response.body`（可能被截断）以及 `response.bodyTruncated/response.bodyBytes`
5. 抓证据：截图 + `logcat_functionkit.txt`

---

## 8. 附录：关键组件名

- 包名（debug）：`org.fcitx.fcitx5.android.debug`
- IME Service：`org.fcitx.fcitx5.android.input.FcitxInputMethodService`
- 主界面：`org.fcitx.fcitx5.android.ui.main.MainActivity`
- E2E Playground（debug）：`org.fcitx.fcitx5.android.input.functionkit.FunctionKitImeE2EPlaygroundActivity`



