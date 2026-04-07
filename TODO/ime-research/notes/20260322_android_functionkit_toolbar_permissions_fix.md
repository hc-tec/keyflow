# Android Function Kit Toolbar / Permissions Fix

> 编码：UTF-8  
> 更新时间：2026-03-22T14:05:05+08:00  
> 作用仓库：`TODO/ime-research/repos/fcitx5-android`  
> 对应功能件：`TODO/function-kits/chat-auto-reply`

## 1. 本次解决的问题

1. Function Kit 入口埋得太深，只能从【更多】里继续点进去。
2. 工具栏默认不展开，新用户很容易完全看不到入口。
3. 自动回复功能件像“坏了”，实际根因不是网络故障，而是当前 Android 宿主仍是本地示例宿主。
4. Function Kit 没有独立设置入口，也没有可见的权限开关。
5. 功能件入口没有浏览器插件式图标，不够直观。

## 2. 已落地改动

- 把 `expand_toolbar_by_default` 默认值从 `false` 改为 `true`。
- 在工具栏直接新增“聊天自动回复”按钮，和剪贴板/文本编辑/更多并列。
- 工具栏按钮图标改用 `ic_baseline_auto_awesome_24`，更接近浏览器插件入口感知。
- 新增 `功能件` 设置页，放到 Android 主设置列表里。
- 新增功能件权限开关：
  - 读取上下文
  - 插入候选文本
  - 替换当前文本
  - 重新生成候选
  - 打开功能件设置
  - 读取/写入功能件存储
  - 保存面板状态
- Function Kit 面板顶部新增设置按钮，可直接跳到功能件设置页。
- `chat-auto-reply` UI 现在会明确显示“本地示例模式”，说明当前不会连接远程 Agent / 主机服务 / 网络推理。
- Android 宿主握手信息与 host state 会显式带出 `executionMode=local-demo`。

## 3. 现在应该如何理解“自动回复不工作”

当前并不是网络偶发故障，也不是远程连接没打通导致的“坏了”。

当前 Android 端 `FunctionKitWindow` 仍然是 **本地示例宿主**：

- 会读取当前输入框附近文本、选中文本、光标位置等上下文；
- 但候选回复仍由本地 Kotlin 代码按预设模板生成；
- 不会主动访问远程 OpenClaw、不会访问你的主机服务、也不会联网推理。

所以现在看到的正确定位应该是：

**它是一个可交互的功能件面板 + 权限宿主 + 写回链路验证版，不是真正的 AI 自动回复正式版。**

## 4. 本次验证结果

- Docker 构建命令：`powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_debug_docker.ps1 -Abi arm64-v8a`
- 构建结果：成功
- 构建日志：`TODO/ime-research/logs/20260322_fcitx5-android_app_assembleDebug_docker_arm64-v8a_rerun.log`
- APK 原始输出：`TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/debug/org.fcitx.fcitx5.android-fe3a618-arm64-v8a-debug.apk`
- 归档 APK：`TODO/ime-research/artifacts/apks/20260322_140505_fcitx5-android_fe3a618_arm64-v8a_debug_functionkit_toolbar.apk`
- SHA256：见 `TODO/ime-research/artifacts/apks/20260322_140505_fcitx5-android_fe3a618_arm64-v8a_debug_functionkit_toolbar.apk.sha256.txt`
- 模拟器安装验证：已在 `emulator-5554` 卸载旧签名包后重新安装成功
- 模拟器版本复核：`versionCode=102`，`versionName=fe3a618`
- 模拟器启动验证：`org.fcitx.fcitx5.android.ui.main.MainActivity` 启动成功

## 5. 当前设备连接状态

2026-03-22 14:05（Asia/Shanghai）检查 `adb devices` 时，当前只看到：

- `emulator-5554`

也就是说，这一刻 **没有检测到物理手机**。所以这次我完成了 APK 构建与归档，但没有直接推送到你的真机。

如果你重新接上手机并在电脑上确认 USB 调试授权弹窗，我下一步可以直接把这个 APK 安装到真机并继续回归测试。
