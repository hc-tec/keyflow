# Android Function Kit AI Bootstrap Follow-up

> 编码：UTF-8
> 日期：2026-03-23

## 背景

`0323-2205` 版本里，`chat-auto-reply` 仍然停留在本地 demo 候选，没有真正走到 Android 端共享 AI chat。
用户已经明确允许先用模拟消息/模拟上下文，当前目标是先把真实模型执行链路接通。

## 根因

1. Android 侧虽然已经支持 `direct-model` 路由，但调试包并不会自动继承主机上的 DeepSeek 配置。
2. `chat-auto-reply/ui/app/main.js` 在 `bridge.ready` 时没有申请 `ai.chat`，宿主即使具备本地 AI 配置，也不会把该功能件判定为可走本地 AI 候选生成。
3. `ai.chat.status.request` 在 Android 权限策略中没有映射，导致这条能力无法被正常授予。
4. Runtime 首条 outbound（尤其是 `bridge.ready`）存在 Android JS bridge 时序风险。如果页面脚本先跑、宿主 bridge 稍后才可用，旧实现会直接丢掉这条握手消息，结果就是功能件只能收到宿主主动推送的 `host.state.update`，却永远拿不到 `bridge.ready.ack / permissions.sync / context.sync`。

## 本轮改动

- Android 调试包增加 shared AI bootstrap：
  - `TODO/ime-research/repos/fcitx5-android/app/build.gradle.kts`
  - `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitAiChatBackend.kt`
  - `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/ui/main/settings/behavior/AiSettingsFragment.kt`
- Android 构建脚本会从本机配置解析 DeepSeek：
  - `.openclaw/.env`
  - `.openclaw/openclaw.json`
  - 固定脚本：
    - `TODO/ime-research/scripts/run_fcitx5_android_debug_local.ps1`
    - `TODO/ime-research/scripts/run_fcitx5_android_debug_docker.ps1`
- `chat-auto-reply` 握手权限补齐：
  - `TODO/function-kits/chat-auto-reply/ui/app/main.js`
  - 新增 `ai.chat`
  - 新增 `ai.chat.status.request`
- Android 权限策略补齐：
  - `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitPermissionPolicy.kt`
- Runtime outbound 队列兜底：
  - `TODO/function-kit-runtime-sdk/src/index.js`
  - `TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js`
  - 当 `AndroidFunctionKitHost` 尚未可用时，先缓存 outbound envelope，稍后自动 flush，而不是直接丢失 `bridge.ready`
- `quick-phrases` ready-ack 补同步：
  - `TODO/function-kits/quick-phrases/ui/app/main.js`
  - 在 `bridge.ready.ack` 到达时立即写入授权能力并触发首次 storage/context bootstrap

## 验证

- Android 单测/编译：
  - `powershell -ExecutionPolicy Bypass -File "<WORKSPACE_ROOT>\TODO\ime-research\scripts\run_fcitx5_android_debug_local.ps1" -GradleTasks "clean :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitAiChatBackendTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitPermissionPolicyTest --tests org.fcitx.fcitx5.android.ui.main.settings.behavior.FunctionKitSettingsStatusResolverTest :app:compileDebugKotlin"`
- Runtime 单测：
  - `node --test TODO/function-kit-runtime-sdk/tests/client-api.test.mjs`
  - 新增覆盖：`outbound requests queue until the Android host bridge becomes available`
- Runtime bundle 重建：
  - `node scripts/build-browser-bundle.mjs`
- Docker clean build：
  - `powershell -ExecutionPolicy Bypass -File "<WORKSPACE_ROOT>\TODO\ime-research\scripts\run_fcitx5_android_debug_docker.ps1" -Abi arm64-v8a -GradleTasks "clean :app:assembleDebug"`
  - 日志：`TODO/ime-research/logs/20260323_fcitx5-android_clean_app_assembleDebug_docker_arm64-v8a_rerun.log`
- 真机安装：
  - APK：`TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/debug/org.fcitx.fcitx5.android-9fa072d-arm64-v8a-debug.apk`
  - 命令：`adb -s <DEVICE_SERIAL> install --no-incremental -r -d ...`

## 当前预期

- `chat-auto-reply` 打开后，若 Android 侧共享 AI bootstrap 生效，宿主模式应不再显示 `local-demo`，而应切到 `direct-model`。
- 即使没有真实聊天消息接入，候选生成也应基于模拟/通用上下文走真实 DeepSeek 请求。
- 若 AI 仍未生效，下一步优先看功能件面板里的 host mode / routing 信息，而不是先怀疑消息接入。

## 附记

本机直接 `clean :app:assembleDebug` 会因为缺少 `Gettext` 卡在 `:lib:fcitx5:configureCMakeDebug[arm64-v8a]`，所以完整 APK 仍以 Docker clean build 为主线。


