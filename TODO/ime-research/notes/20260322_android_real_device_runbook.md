# Android 真机运行手册（`fcitx5-android`）

> 编码：UTF-8
> 创建时间：2026-03-22T04:15:00+08:00
> 更新时间：2026-03-22T15:56:00+08:00
> 范围：`TODO/ime-research/repos/fcitx5-android`

## 1. 目标

把 Android 端“真机接入、构建、安装、切输入法、启动 App”这条链路固化成固定入口，避免每次都手工拼命令。

固定脚本：

- `TODO/ime-research/scripts/run_fcitx5_android_real_device.ps1`

## 2. 适用场景

这条脚本针对的是**接了自己手机**后的真实调试，不是模拟器。

它解决的事情是：

- 自动选择真机（当同时连着模拟器和手机时，优先真机）
- 按真机 ABI 选择对应 APK
- 构建 Debug APK（优先本地 Gradle；否则回退到 Docker）
- 安装 Debug APK 到手机
- 安装后 core data 自检自愈（避免“键盘不可用/core data missing”）
- 尝试启用并切换到 `fcitx5-android`
- 启动 App 主界面
- 必要时打开系统输入法设置页做最后确认

## 3. 现在怎么跑

先看当前设备状态：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode doctor
```

如果当前只连了一台真机，直接完整跑：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode run
```

如果同时连着模拟器和真机，明确指定手机序列号：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode run -DeviceId <你的手机序列号>
```

如果当前 APK 已经存在，不想重复构建：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode run -DeviceId <你的手机序列号> -SkipBuild
```

如果设备上已经装过 APK，只想复用现有安装状态做启用 / 切换 / 启动：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode run -DeviceId <你的手机序列号> -SkipBuild -SkipInstall
```

如果你明确不想让脚本做 core data 自检自愈（不推荐）：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode run -DeviceId <你的手机序列号> -SkipCoreDataSelfHeal
```

如果你想强制打开系统输入法设置页做人工确认：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode run -DeviceId <你的手机序列号> -OpenInputMethodSettings
```

## 4. 脚本会做什么

`run` 模式默认顺序是：

1. 识别当前真机
2. 读取 `ro.product.cpu.abi`
3. 构建对应 ABI 的 Debug APK（优先本地 Gradle；否则 Docker；除非 `-SkipBuild`）
4. 安装 `org.fcitx.fcitx5.android.debug`
5. 安装后 core data 自检自愈（必要时会删除 `descriptor.json`/`usr` 并 warm up 一次）
6. 尝试启用输入法
7. 尝试设为当前默认输入法
8. 启动 `MainActivity`
9. 如果系统没有真正切过去，则自动打开系统输入法设置页

这里固定使用的包名 / 组件是：

- Debug 包名：`org.fcitx.fcitx5.android.debug`
- IME Service：`org.fcitx.fcitx5.android.input.FcitxInputMethodService`
- MainActivity：`org.fcitx.fcitx5.android.ui.main.MainActivity`

## 5. 跑完以后怎么验证

脚本结束后会落下：

- 文本日志：`TODO/ime-research/logs/*_fcitx5-android_real_device_run.log`
- JSON 摘要：`TODO/ime-research/logs/*_fcitx5-android_real_device_run.json`

重点看 JSON 里的几个字段：

- `fcitx_registered`
- `package_installed`
- `fcitx_enabled`
- `fcitx_selected`
- `manual_enable_required`
- `default_input_method`
- `core_data_present`
- `core_data_repaired`

如果 `fcitx_selected=true`，说明手机当前默认输入法已经切到这份 Debug 包。

如果出现下面这种状态：

- `fcitx_registered=true`
- `fcitx_enabled=false`
- `manual_enable_required=true`

就说明系统已经识别到这个 IME，但 OEM ROM 不允许仅靠 `adb shell ime enable/set` 把它重新启用。这时脚本会自动打开系统输入法设置页，你需要在手机上手动把它重新勾上一次。

### 5.1 当前机器的实际验证痕迹

这台机器上已经留下了一次真实真机验证痕迹：

- 首次真机部署日志：`TODO/ime-research/logs/20260322_132406_fcitx5-android_real_device_run.log`
- 首次真机部署摘要：`TODO/ime-research/logs/20260322_132406_fcitx5-android_real_device_run.json`
- 重新确认成功状态：`TODO/ime-research/logs/20260322_132646_fcitx5-android_real_device_doctor.json`

这组证据说明两件事：

- 真机部署脚本本身已经在当前主机上实际跑过
- 这台手机在重装后确实出现过 OEM 侧“重新启用输入法”的限制，但最终状态已经被恢复为 `fcitx_selected=true`

## 6. 真机完整体验路径

如果你的目标不是本地 demo，而是让 Function Kit 面板真正打到本机 `OpenClaw` / Host Service，先补一条网络链路：

```powershell
adb -s <DEVICE_SERIAL> reverse tcp:18789 tcp:18789
```

然后再保证 Windows 侧本地服务已经启动：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_functionkit_host_service.ps1
```

再到 Android 的 `Function Kit` 设置页中确认：

- `Enable remote inference` 已打开
- `Remote host service base URL` 为 `http://127.0.0.1:18789`

脚本完成部署后，实际体验链路是：

1. 打开任意有输入框的 App
2. 调起键盘
3. 确认当前输入法是 `fcitx5-android`
4. 打开工具栏里的 `更多 / Status Area`
5. 点击 `Function Kit`
6. 进入 `chat-auto-reply`
7. 确认当前不是 `local demo`，而是已经接到远程 host service
8. 点击 `插入` 或 `替换`
9. 看文本是否回写到目标输入框

## 7. 自动化怎么接到真机

真机部署脚本解决的是“装起来、切上去、跑起来”。

如果还要在真机上跑当前 Android `Function Kit` contract automation，固定命令是：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_functionkit_contract.ps1 -Mode run -DeviceId <你的手机序列号> -BuildAbi arm64-v8a -SkipEmulatorAutoStart
```

这一步和真机部署是两条链路：

- 真机部署：面向真实体验
- contract automation：面向浏览器式功能件契约验证

## 8. 边界

这条真机脚本已经把“部署与切换输入法”收起来了，但还不是系统级完整 E2E。

还没自动化掉的部分仍然包括：

- 在外部目标 App 中自动打开真实输入框
- 自动调起键盘并完成真正上屏断言
- 完整系统级 IME E2E 回归

另外，真机上的 OEM ROM 可能会有额外限制。当前已经实测到的一类情况是：

- 重装 Debug APK 后，系统会把该 IME 从“已启用输入法”列表里移除
- 包虽然已经注册成功，但 `adb shell ime enable/set` 仍然返回失败
- 这类场景不能假装“自动化已经全搞定”，只能回退到“脚本自动拉起设置页 + 用户手动勾选一次”

另外，2026-03-22 这次最新验证里，`doctor` 实际检测到的只有 `emulator-5554`，没有物理真机。不要把模拟器验证误当成真机闭环。

