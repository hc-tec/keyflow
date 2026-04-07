# Function Kit Host Service + Android 联调验证记录（2026-03-22）

> 编码：UTF-8
> 创建时间：2026-03-22T15:56:00+08:00
> 更新时间：2026-03-22T22:05:00+08:00
> 范围：`OpenClaw` Agent-only、`TODO/function-kit-host-service`、`fcitx5-android`

## 1. 这次实际解决了什么

- 修复了一批 PowerShell 入口脚本在当前工作区路径前缀 `Microsoft.PowerShell.Core\FileSystem::\\?\D:\...` 下的根路径解析问题。
- `run_openclaw_agent_only.ps1` 现在在 Windows 上直接走 `node scripts/run-node.mjs ...`，不再依赖 `pnpm openclaw ...` 的外层包装。
- `run_fcitx5_android_real_device.ps1` 现在允许“设备已装 APK，只想复用现有安装做启用/切换/启动”这条路径，不再在 `-SkipInstall` 时强制要求本地 APK 仍存在。
- `OpenClaw -> Function Kit host service -> Android/Emulator` 这条链路现在至少已经完成了：
  - Host service 健康检查
  - Host service 调 `OpenClaw main agent`
  - Host service 返回真实 DeepSeek 候选 JSON
  - Android `fcitx5-android` Debug 包构建
  - Android 设备（本次实际是模拟器）启用/切换/启动

## 2. 本次实际验证结果

### 2.1 OpenClaw / Host Service

- Host service 健康检查：`TODO/ime-research/logs/20260322_functionkit_host_service_health.json`
- Host service 查询 `OpenClaw` 状态：`TODO/ime-research/logs/20260322_functionkit_host_service_openclaw_status.json`
- Host service 自动回复 smoke：`TODO/ime-research/logs/20260322_functionkit_host_service_render_smoke.json`
- `OpenClaw` 最小 smoke（脚本版）：`TODO/ime-research/logs/20260322_openclaw_smoke_script_debug.log`

关键结论：

- Host service 默认监听 `127.0.0.1:18789`
- 现在已经补上 LAN 暴露方案：绑定非 loopback 时必须配 token
- 当前 `main` agent 默认模型是 `deepseek/deepseek-chat`
- `missingProvidersInUse=[]`
- 自动回复接口已经返回真实 DeepSeek 候选，不再是本地固定模板

### 2.2 Android 构建

- `arm64-v8a` Docker Debug 构建成功：
  - `TODO/ime-research/logs/20260322_fcitx5-android_app_assembleDebug_docker_arm64-v8a_rerun.log`
- `x86_64` Docker Debug 构建成功：
  - `TODO/ime-research/logs/20260322_fcitx5-android_app_assembleDebug_docker_x86_64_rerun.log`

这说明当前主线脚本已经能在 Docker 下稳定重跑两个关键 ABI：

- 真机常用：`arm64-v8a`
- 模拟器常用：`x86_64`

### 2.3 Android 设备接入

- 设备体检：`TODO/ime-research/logs/20260322_154448_fcitx5-android_real_device_doctor.json`
- 运行摘要（启用 / 切换 / 启动）：`TODO/ime-research/logs/20260322_155630_fcitx5-android_real_device_run.json`

本次 `doctor` 的真实结果要说清楚：

- 2026-03-22 15:44:48 +08:00 这次检测到的不是手机，而是 `emulator-5554`
- 当前没有检测到物理真机

但模拟器链路已经跑通：

- `fcitx_registered=true`
- `fcitx_enabled=true`
- `fcitx_selected=true`
- `default_input_method=org.fcitx.fcitx5.android.debug/org.fcitx.fcitx5.android.input.FcitxInputMethodService`

也就是说，当前这台机器已经实证了“装上 Debug 包 -> 启用输入法 -> 切成默认输入法 -> 拉起主界面”。

## 3. 本次固定复现步骤

### 3.1 OpenClaw + Host Service

1. 先确认 `OpenClaw` DeepSeek 配置已经写好：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\configure_openclaw_deepseek.ps1
```

2. 检查 `OpenClaw` 当前状态：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode status -SkipInstall
```

3. 启动本地 host service：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_functionkit_host_service.ps1
```

4. 健康检查：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:18789/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:18789/v1/openclaw/status
```

### 3.2 Android 模拟器 / 真机

1. 按设备 ABI 构建 Debug APK：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_debug_docker.ps1 -Abi arm64-v8a
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_debug_docker.ps1 -Abi x86_64
```

2. 体检设备：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode doctor
```

3. 如果走 USB / 模拟器链路，让 Android 访问本机 host service，先做端口反向映射：

```powershell
adb -s <DEVICE_SERIAL> reverse tcp:18789 tcp:18789
```

4. 如果走局域网直连，直接把 host service 暴露到 LAN：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_functionkit_host_service.ps1 -ExposeToLan
```

脚本现在会输出：

- 可填写到 Android 的 `Remote host service base URL`
- `Remote host service token`

5. 部署 / 启用 / 切换 / 启动：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode run -DeviceId <deviceId>
```

6. 如果设备上已经装过 APK，只想复用现有安装状态：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode run -DeviceId <deviceId> -SkipBuild -SkipInstall
```

## 4. Android 端接远程推理的现实边界

当前 Android 代码已经有远程推理入口，但还没达到“默认即真实可用”的程度：

- `remote inference` 默认仍是关闭
- 真正要走宿主链路，还需要在 Function Kit 设置里开启：
  - `function_kit_remote_inference_enabled=true`
  - USB / 模拟器链路：`function_kit_remote_base_url=http://127.0.0.1:18789`
  - 局域网 / Tailscale / VPN 链路：`function_kit_remote_base_url=http://<PC-LAN-IP>:18789`
  - 如果 host service 开在 LAN 模式，还要设置：
    - `function_kit_remote_auth_token=<host token>`
- 在真机上，`127.0.0.1` 只有在做了 `adb reverse tcp:18789 tcp:18789` 后才成立；否则必须改用 PC 局域网地址

所以当前产品状态要说实话：

- PC 端 host service + OpenClaw：已经真实可用
- Android 输入法本体：已经可构建、可安装、可切换、可启动
- Android 面板是否命中真实远程 AI：当前取决于你有没有打开远程推理设置，以及设备到主机的网络链路和 token 有没有配好

## 5. 还剩下的关键缺口

- 当前检测到的只有模拟器，没有物理真机；真机链路还需要再留一份新的 2026-03-22 之后的实际日志
- Android Function Kit 仍默认走本地 demo 候选，远程推理不是默认路径
- `candidate.replace` 目前仍然和 `candidate.insert` 复用同一条 `commitText()` 路径，语义上还不够硬
- Android 真正的“打开外部 App 输入框 -> 调起 Function Kit -> 拿远程候选 -> 点击插入 -> 断言上屏” 仍没形成一条系统级自动化 E2E

## 6. 当前可以直接下的结论

到 2026-03-22 15:56 +08:00 为止，可以明确说：

- `OpenClaw` 已经切到本机 DeepSeek provider，并且 `main` agent 可用
- `Function Kit host service` 已经能返回真实 AI 候选
- `fcitx5-android` 当前 Debug 主线可以在 Docker 下稳定重建 `arm64-v8a` 与 `x86_64`
- Android 侧至少在模拟器上已经完成“安装 -> 启用 -> 设为默认 -> 启动主界面”
- 后续继续做 Android 真机远程 Function Kit 调试时，不需要重新摸索路径，直接按这份文档走就行

