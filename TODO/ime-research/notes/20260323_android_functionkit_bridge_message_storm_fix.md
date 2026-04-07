# 2026-03-23 Android Function Kit Bridge Message Storm Fix

## 问题现象

- 用户仍然反馈两个 Function Kit 看起来和之前“一模一样”。
- 设备 `logcat` 中能看到 `bridge.ready.ack`、`permissions.sync`，说明 UI -> Host 握手其实已经到达。
- 同时 `logcat` 充满了 `FunctionKitRuntimeSDK:duplicate-message` 与大量 `host.state.update`。

## 根因

这次真正的主因不是 AI bootstrap，也不是 APK 没更新，而是 Android 宿主自己的消息风暴：

1. `FunctionKitWebViewHost.dispatchEnvelope()` 同时使用：
   - `WebViewCompat.postWebMessage(...)`
   - `evaluateJavascript(...)` 直接把同一 envelope 再送一次
2. runtime 收到重复的 host 消息后会输出 `duplicate-message` console 调试日志。
3. `FunctionKitWindow.handleHostEvent()` 又把 `WebView console[...]` 反向包装成新的 `host.state.update` 发回页面。
4. 于是形成：
   - host 重复发消息
   - runtime 报重复
   - WebView console 记录
   - host 再把 console 变成状态消息
   - 再次进入页面

最终导致面板被高频噪音淹没，用户看到的状态会非常不稳定，也难以判断真实握手是否完成。

## 修复

### 1. Host -> UI 只保留单一有效分发路径

- 文件：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`
- 调整：
  - 在收到第一条合法 UI 入站消息后，认为 JS bridge 已经可用。
  - bridge ready 之后改为只走 `evaluateJavascript` 直发，不再和 `postWebMessage` 双发。
  - pre-handshake 仍保留 `postWebMessage` 作为早期通道。

### 2. WebView console 不再回灌到 UI 状态流

- 文件：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
- 文件：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitHostDiagnostics.kt`
- 调整：
  - `WebView console[...]` 只写入 Android `logcat`
  - 不再包装成新的 `host.state.update` 推回功能件页面

### 3. Debug 版本标识必须可见

- 文件：`TODO/ime-research/repos/fcitx5-android/app/build.gradle.kts`
- 调整：
  - debug `app_name` 改为包含 `versionName + short git hash`
- 文件：
  - `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
  - `TODO/function-kits/chat-auto-reply/ui/app/main.js`
  - `TODO/function-kits/quick-phrases/ui/app/main.js`
- 调整：
  - Host `hostInfo/details` 新增 `build` 字段
  - Function Kit 面板 meta 中显示 `build=<version/hash>`
  - 面板初次打开时状态文案直接带上 build 标识

## 验证

- JS 语法检查：
  - `node --check TODO/function-kits/chat-auto-reply/ui/app/main.js`
  - `node --check TODO/function-kits/quick-phrases/ui/app/main.js`
- Android 本地定向编译/单测：
  - `powershell -ExecutionPolicy Bypass -File "<WORKSPACE_ROOT>\TODO\ime-research\scripts\run_fcitx5_android_debug_local.ps1" -GradleTasks "clean :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitHostDiagnosticsTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitPermissionPolicyTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitAiChatBackendTest :app:compileDebugKotlin"`
  - 日志：`TODO/ime-research/logs/20260323_fcitx5-android_clean_app_testDebugUnitTest_tests_org_fcitx_fcitx5_android_input_functionkit_FunctionKitHostDiag_local_arm64-v8a.log`
- Android Docker clean build：
  - `powershell -ExecutionPolicy Bypass -File "<WORKSPACE_ROOT>\TODO\ime-research\scripts\run_fcitx5_android_debug_docker.ps1" -Abi arm64-v8a -GradleTasks "clean :app:assembleDebug"`
  - 日志：`TODO/ime-research/logs/20260323_fcitx5-android_clean_app_assembleDebug_docker_arm64-v8a_rerun.log`
- 真机非增量安装：
  - `adb -s <DEVICE_SERIAL> install --no-incremental -r -d "<WORKSPACE_ROOT>\TODO\ime-research\repos\fcitx5-android\app\build\outputs\apk\debug\org.fcitx.fcitx5.android-9fa072d-arm64-v8a-debug.apk"`
  - 结果：`Success`

## 当前交付状态

- 新包已安装到设备 `<DEVICE_SERIAL>`
- 当前调试包实际包名：`org.fcitx.fcitx5.android.debug`
- debug 安装包与 Function Kit 面板都应当能直接观察到当前构建号
- 下一步只剩用户在手机上复测：
  - `chat-auto-reply` 是否脱离消息风暴并进入真实可用状态
  - `quick-phrases` 是否恢复正常上下文/权限显示
  - 功能件内部输入框是否能正常通过 detached composer 输入


