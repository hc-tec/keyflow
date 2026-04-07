# Android Function Kit 窗口基线（`fcitx5-android`）

> 编码：UTF-8
> 创建时间：2026-03-22T00:45:00+08:00
> 更新时间：2026-03-22T01:15:17+08:00
> 范围：`TODO/ime-research/repos/fcitx5-android`

## 1. 这次真正落地了什么

这次不是只做 Android WebView 示例，而是把浏览器式 Function Kit 真正接进了 `fcitx5-android` 的输入法窗口体系里。

当前已经落地的内容：

- `StatusAreaWindow` 新增 `Function Kit` 入口
- 点击后会打开一个真实 `ExtendedInputWindow`
- 窗口内部加载本地浏览器式功能件 UI：`chat-auto-reply`
- 功能件静态资源通过 Gradle 自动同步进 Android `assets`
- Android 侧 Host Bridge 已接入真实输入法宿主
- 点击候选后会真正调用 `FcitxInputMethodService.commitText(...)`
- `storage.get / storage.set / panel.state.update / settings.open` 已有宿主侧实现

## 2. 关键落点

- Android Function Kit 宿主桥：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`
- Android Function Kit 窗口：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
- 状态区入口：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/status/StatusAreaWindow.kt`
- 状态区类型扩展：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/status/StatusAreaEntry.kt`
- Android 构建接入：`TODO/ime-research/repos/fcitx5-android/app/build.gradle.kts`
- 版本目录：`TODO/ime-research/repos/fcitx5-android/gradle/libs.versions.toml`

## 3. 现在怎么跑

仍然沿用 Android 主线固定入口：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_debug_docker.ps1
```

这次已经完成的真实构建验证：

- Debug APK Docker 构建成功
  - 日志：`TODO/ime-research/logs/20260321_fcitx5-android_assembleDebug_docker_arm64_functionkit_validation_rerun.log`
  - 输出：`TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/debug/org.fcitx.fcitx5.android-fe3a618-arm64-v8a-debug.apk`
- 已收集到统一产物目录
  - 归档：`TODO/ime-research/artifacts/apks/20260322_fcitx5-android_fe3a618_arm64-v8a_debug_functionkit.apk`
  - 校验：`TODO/ime-research/artifacts/apks/20260322_fcitx5-android_fe3a618_arm64-v8a_debug_functionkit.sha256.txt`

这次新增的关键点是：

- Gradle 会在 `preBuild` 前自动执行 `syncFunctionKitAssets`
- 自动把这两块内容打进 APK：
  - `TODO/function-kit-runtime-sdk/dist/`
  - `TODO/function-kits/chat-auto-reply/ui/app/`

安装 APK 后，Android 端实际体验路径是：

1. 切到 `fcitx5-android`
2. 打开工具栏的“更多 / Status Area”
3. 点击 `Function Kit`
4. 打开浏览器式 `chat-auto-reply` 面板
5. 点候选的 `插入` 或 `替换`
6. 文本写回当前输入框

## 4. 当前能力边界

这条 Android 基线现在已经不是“只显示网页”：

- 有真实宿主握手
- 有权限同步
- 有上下文请求
- 有候选渲染
- 有本地存储
- 有面板状态确认
- 有显式文本写回

但它仍然只是第一阶段：

- 当前候选还是宿主内置的示例生成逻辑
- 还没真正接 OpenClaw Agent
- 还没把 fcitx 自身候选和 Function Kit 候选做联合编排
- 还没补 Android 端输入法启用 / 切换 / 真正上屏级 E2E 自动化

## 5. 这次的设计判断

这次 Android 端故意走了 `StatusAreaWindow -> FunctionKitWindow` 这条路径，而不是直接改主键盘视图，原因很直接：

- 改动面更小
- 更贴近 `ExtendedInputWindow` 现有模型
- 能先验证“浏览器式面板真实可用”
- 后续如果要保活，再演进到 `EssentialWindow`

这一步是为了先把“真能打开、真能渲染、真能上屏”跑通。

## 6. 当前验证状态

这一条 Android 基线现在已经完成了真实 Docker 编译校验，不再停留在“代码已改但没编过”。

本轮已确认：

- `FunctionKitWebViewHost.kt` 的 Kotlin 编译错误已修复
- `:app:assembleDebug` 已在 Docker 内成功通过
- 浏览器式功能件资产同步链路已生效
- `chat-auto-reply` 面板对应的 Debug APK 已实际产出

这一步的结论现在应该写成：

- Android Function Kit 窗口基线已落地
- Android Debug APK 已完成 Docker 构建验证
- 当前后续重点不再是“先把它编过”，而是补自动化 contract / E2E

## 7. 下一阶段

下一阶段已经不再是纯说明文档，而是开始把 Windows 那套 contract runner 语义往 Android `WebView` 对齐：

- 说明文档：`TODO/ime-research/notes/20260322_android_functionkit_contract_runner.md`
- 当前目标：同样回放 host->ui fixtures、抓 UI snapshot、记录 `candidate.insert`、产出 contract result
