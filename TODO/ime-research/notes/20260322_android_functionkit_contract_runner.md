# Android Function Kit Contract Runner（`fcitx5-android`）

> 编码：UTF-8
> 创建时间：2026-03-22T01:15:17+08:00
> 更新时间：2026-03-22T03:35:00+08:00
> 范围：`TODO/ime-research/repos/fcitx5-android`

## 1. 这次补了什么

这次不是只把 Android 端 `Function Kit` 编过，而是补出了一条真正可复用的 Android contract runner 基线。

当前已落地：

- 一个测试专用的 `FunctionKitContractTestActivity`
- 真实 `WebView + FunctionKitWebViewHost` 载入本地功能件 UI
- 与 Windows `TestHost` 对齐的 UI snapshot 数据模型
- 与 Windows `TestHost` 对齐的 contract result 数据模型
- Android 侧 replay 同一套 `chat-auto-reply` fixtures
- 记录真实 `candidate.insert` 上报，而不是伪造结果
- 结果 JSON 持久化到目标 App 外部文件目录

## 1.1 2026-03-22 自动化补齐更新

这份文档创建后，Android 端自动化又补了 4 个关键点：

- `run_fcitx5_android_functionkit_contract.ps1` 现在会自动安装 `cmdline-tools`、创建 / 启动 `fcitx5-api36_1-google-play-x86_64` headless 模拟器，并在没有设备时自动接管
- 脚本会读取当前设备 ABI；连到模拟器时自动切到 `x86_64`，不再硬编码 `arm64-v8a`
- 安装 APK 时遇到 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` 会自动 `adb uninstall` 后重试
- instrumentation 的文本失败现在会被当作真正失败处理，不再只看 adb exit code

这次还顺手修掉了两处真实阻塞：

- `FunctionKitContractTestActivity` 与 `FunctionKitUiContractModels` 已移到 `app/src/debug/`，避免 `ActivityScenario` 落到 test process
- Docker 构建脚本现在会把通用 Boost headers overlay 到 ABI include 目录，`x86_64` 构建已可通过

## 2. 设计原则

这次 Android contract runner 的设计没有另起一套协议，而是尽量对齐 Windows：

- `bridge.ready.ack` 仍由宿主实时生成
- `permissions.sync / storage.sync / candidates.render / permission.denied / bridge.error` 仍走同一套 fixtures
- UI 断言仍落到 `FunctionKitUiSnapshot`
- 最终结果仍落到 `FunctionKitUiContractResult`

也就是说，Windows 与 Android 后续真正要共享的是：

- 同一套 host bridge envelope 语义
- 同一套 fixtures
- 同一套 snapshot/result 结构

平台差异只放在：

- Web 宿主实现
- 真实输入回写方式
- 自动化驱动方式

## 3. 关键文件

- Android 调试 Activity：`TODO/ime-research/repos/fcitx5-android/app/src/debug/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitContractTestActivity.kt`
- Android 调试 manifest：`TODO/ime-research/repos/fcitx5-android/app/src/debug/AndroidManifest.xml`
- Android contract 测试：`TODO/ime-research/repos/fcitx5-android/app/src/androidTest/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitContractInstrumentationTest.kt`
- Android snapshot/result 模型：`TODO/ime-research/repos/fcitx5-android/app/src/debug/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitUiContractModels.kt`
- Android test manifest：`TODO/ime-research/repos/fcitx5-android/app/src/androidTest/AndroidManifest.xml`
- Android test 资源占位：`TODO/ime-research/repos/fcitx5-android/app/src/androidTest/res/values/function_kit_contract_placeholders.xml`
- Function Kit test fixture 同步：`TODO/ime-research/repos/fcitx5-android/app/build.gradle.kts`
- Docker 构建入口：`TODO/ime-research/scripts/run_fcitx5_android_debug_docker.ps1`
- Docker 构建脚本：`TODO/ime-research/scripts/docker_build_fcitx5_android.sh`
- 一键执行脚本：`TODO/ime-research/scripts/run_fcitx5_android_functionkit_contract.ps1`

## 4. 当前 replay 的 fixture

当前 Android runner 与 Windows 一样，回放这几类 host->ui fixture：

- `bridge.host-to-ui.permissions.basic.json`
- `bridge.host-to-ui.storage-sync.basic.json`
- `bridge.host-to-ui.render.basic.json`
- `bridge.host-to-ui.permission-denied.basic.json`
- `bridge.host-to-ui.error.basic.json`

而 `bridge.ready.ack` 仍是宿主实时生成，不直接从 fixture 硬回放。

## 5. 当前验证状态

这次已经完成的不是“代码静态写好”，而是当前 Windows 主机上的真实自动化验证：

- `doctor` 成功：`TODO/ime-research/logs/20260322_013016_fcitx5-android_functionkit_contract_doctor.log`
- `x86_64` 构建成功：`TODO/ime-research/logs/20260322_030629_fcitx5-android_functionkit_contract_build.log`
- headless emulator + instrumentation 成功：`TODO/ime-research/logs/20260322_031725_fcitx5-android_functionkit_contract_run.log`
- contract result 已拉回：`TODO/ime-research/logs/20260322_031725_fcitx5-android_functionkit_contract_result.json`

对应输出：

- Debug APK：`TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/debug/org.fcitx.fcitx5.android-fe3a618-x86_64-debug.apk`
- AndroidTest APK：`TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/androidTest/debug/org.fcitx.fcitx5.android-fe3a618-debug-androidTest.apk`

结果 JSON 的关键断言也已经通过：

- `render_snapshot_matched=true`
- `candidate_insert_observed=true`
- `permission_denied_handled=true`
- `bridge_error_handled=true`

这里要严格区分两个层次：

- 现在已经跑通的是：真实 `WebView` 宿主、真实 instrumentation、真实 headless emulator、真实结果回传
- 现在还没跑通的是：系统级 IME 启用 / 切换 / 外部目标输入框真上屏 E2E

所以结论应该是：Android 端“自动化测试”已经成立，但当前成立的是 Function Kit contract automation，不是完整输入法系统级 E2E。

## 6. 现在怎么跑

现在推荐直接用一键脚本：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_functionkit_contract.ps1 -Mode run
```

如果只想看本机当前状态，不真正安装和执行：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_functionkit_contract.ps1 -Mode doctor
```

如果只想补构建产物，不连接设备：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_functionkit_contract.ps1 -Mode build
```

如果你明确要给当前 `x86_64` 模拟器复用现有产物：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_functionkit_contract.ps1 -Mode build -BuildAbi x86_64
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_functionkit_contract.ps1 -Mode run -SkipBuild
```

脚本默认会：

- 自动检测 / 启动模拟器，并按设备 ABI 选择 `arm64-v8a` 或 `x86_64`
- 缺少 `cmdline-tools` 时自动从官方仓库补装
- 用 Docker 构建 `:app:assembleDebug :app:assembleDebugAndroidTest`
- 安装主 APK 与 AndroidTest APK
- 遇到签名不匹配时自动卸载旧包后重装
- 执行 instrumentation
- 把 instrumentation 文本失败当作真实失败
- 拉回 contract result 到本地日志目录

如果你只想看底层分步命令，仍然是下面这些：

先构建主 APK：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_debug_docker.ps1
```

再构建 contract runner 对应的 AndroidTest APK：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_debug_docker.ps1 -GradleTasks ':app:assembleDebugAndroidTest'
```

真机或模拟器执行顺序：

```powershell
adb install -r TODO\ime-research\artifacts\apks\20260322_fcitx5-android_fe3a618_arm64-v8a_debug_functionkit.apk
adb install -r -t TODO\ime-research\repos\fcitx5-android\app\build\outputs\apk\androidTest\debug\org.fcitx.fcitx5.android-fe3a618-debug-androidTest.apk
adb shell am instrument -w -e class org.fcitx.fcitx5.android.input.functionkit.FunctionKitContractInstrumentationTest org.fcitx.fcitx5.android.debug.test/androidx.test.runner.AndroidJUnitRunner
```

当前 instrumentation 包：

- `org.fcitx.fcitx5.android.debug.test`

当前 target 包：

- `org.fcitx.fcitx5.android.debug`

## 7. Contract Result 在哪里

当前 Android contract result 会写到目标 App 的外部文件目录：

- `/sdcard/Android/data/org.fcitx.fcitx5.android.debug/files/function-kit-contract/chat-auto-reply-contract-result.json`

一键脚本默认会把它拉回本地：

- `TODO/ime-research/logs/<timestamp>_fcitx5-android_functionkit_contract_result.json`

这意味着后续完全可以再补一个 `adb pull` 包装脚本，把结果统一拉回 `TODO/ime-research/logs/`。

## 8. 还没解决的部分

这次是第一版 contract runner，不是终局。

当前还没补：

- 从 `manifest.json` 动态发现 fixture，而不是测试里写死文件名
- 自动拉取 contract result 与失败截图
- 输入法启用 / 切换 / 真正目标输入框上屏的 E2E

所以这一步的真实意义是：

- Android 端终于不再只有“可编译面板”
- 已经有了第一条可扩展的浏览器式功能件 contract automation 基线
