# Windows + Android 输入法主线：跑什么、怎么跑、功能件如何落地、测试怎么做

> 编码：UTF-8
> 创建时间：2026-03-21T02:05:00+08:00
> 更新时间：2026-03-22T15:56:00+08:00
> 目标：把当前阶段的主线项目、运行入口、功能件定义与自动化测试方案固化下来。以后就算上下文清空，也可以直接从这份文档恢复工作。

## 0.1 2026-03-21 运行复核更新

这份文档创建时的若干环境判断已经过时，当前请以这次复核为准：

- 复核细节：`TODO/ime-research/notes/20260321_windows_openclaw_runtime_recheck.md`
- 浏览器式功能件 UI 决策：`TODO/ime-research/notes/20260321_browser_like_functionkit_ui_research.md`
- Runtime SDK 仓库化方案：`TODO/ime-research/notes/20260321_functionkit_runtime_sdk_repo.md`
- `node --version` 现在是 `v22.22.1`，`OpenClaw` 已不再卡在 Node 版本
- `OpenClaw` 当前真实阻塞点是 auth，不是 CLI 形态
- Windows SDK 已能从 `D:\Windows Kits\10` 找到
- `rime-weasel` 已完成一次成功的 `release rime weasel` Windows 原生构建验证
- `rime-weasel` 默认不带参数的入口命令也已成功：`TODO/ime-research/logs/20260321_rime-weasel_full_default_after_split.log`
- `rime-weasel` 的 `release installer` 也已成功：`TODO/ime-research/logs/20260321_rime-weasel_installer_recheck.log`
- `rime-weasel` 机器级安装 / 注册验证也已补上：`TODO/ime-research/notes/20260321_windows_install_validation.md`
- Windows `TestHost` 也已补出最小可构建基线：`TODO/ime-research/notes/20260321_windows_testhost_baseline.md`
- Windows WebView2 功能件宿主 PoC 也已补上：`TODO/ime-research/notes/20260321_windows_functionkit_host_poc.md`
- `run_rime_weasel_build.ps1` 已经把短路径、repo 内 Boost 1.84、`VsDevCmd.bat`、Anaconda 过滤、缓存清理等逻辑收进来了
- `run_rime_weasel_build.ps1` 的默认参数已经不再强制 `data`，编译基线和数据下载阶段被拆开了

## 0.2 2026-03-22 Host Service / Android 联调补充

这份文档里关于 `OpenClaw auth` 和 Android 主线的若干状态已经继续前进，当前请额外参考：

- `TODO/ime-research/notes/20260322_openclaw_deepseek_setup.md`
- `TODO/ime-research/notes/20260322_functionkit_host_service_android_validation.md`

新的硬结论：

- `OpenClaw main agent` 已切到 `deepseek/deepseek-chat`
- `Function Kit host service` 已经能返回真实 DeepSeek 候选 JSON
- `fcitx5-android` 已在 Docker 下再次实测通过 `arm64-v8a` 与 `x86_64` Debug 构建
- Android 接入脚本已经在模拟器上实测通过“启用输入法 -> 设为默认输入法 -> 启动主界面”
- PowerShell 主线入口脚本已经补齐对 `Microsoft.PowerShell.Core\FileSystem::` 与 `\\?\` 路径前缀的正规化处理

## 0. 当前主线，不再含糊

这一阶段只保留 3 条主线，其他仓库都降级为对照样本：

1. Android 输入法主线：`TODO/ime-research/repos/fcitx5-android`
   - commit：`fe3a618c8fd18842305d2f8ec2880fcc67ec1679`
   - 角色：当前 Android 端中文输入的主基座，后续 Fork 与定制开发从这里开始。
2. Windows 输入法主线：`TODO/ime-research/repos/rime-weasel`
   - commit：`93eec2dc33dfcf04c356cce87732b638888fff4d`
   - 角色：当前 Windows 端“可用中文输入”的现实基座。不是因为它最统一，而是因为它是当前最成熟、最接近可用的 Windows 中文 IME。
3. Agent / Skills 主线：`TODO/ime-research/repos/openclaw`
   - commit：`93fbe26adbbcf15fec0b2ddd395478e9100de41e`
   - 角色：只使用 Agent + Skills 能力，不接任何 Channel。输入法本身就是入口。

明确排除出主线的项目：

- `TODO/ime-research/repos/fcitx5-windows`
  - 原因：当前更像 TSF PoC，不是可立即承载中文输入产品的 Windows 主线。
- `TODO/ime-research/repos/osfans-trime`
  - 原因：保留为 Rime Android 对照样本，不作为现在的 Android 定制主线。
- `TODO/ime-research/repos/anysoftkeyboard`
- `TODO/ime-research/repos/heliboard`
- `TODO/ime-research/repos/futo-android-keyboard`
  - 原因：保留为交互/语音/功能参考样本。

## 1. 术语先统一

为了避免混淆，这里以后统一用下面 4 个词：

- 输入法插件：指输入法框架自身的扩展点，例如 Fcitx5-Android 的插件 APK。
- 功能件：你要做的“类似浏览器插件”的上层能力单元。它可以有自己的 UI、自己的执行逻辑、自己的 Skills。
- Tool：功能件暴露给 Agent 的结构化工具接口，输入输出必须有 JSON Schema。
- Skill：面向 Agent 的用法说明与调度规则，采用 `SKILL.md` 形态。

一句话：

- 输入法插件是底层装配方式。
- 功能件是产品能力单元。
- Tool 是手。
- Skill 是教 Agent 怎么用这只手。

## 2. 当前机器的真实状态

这台机器当前已经具备的前置环境：

- Docker：`28.3.2`
- `adb`：`36.0.0`
- Visual Studio Build Tools：`D:\vs\buildtools`
- Visual Studio Community：`D:\VisualStudio`
- Windows SDK：`D:\Windows Kits\10`
- Node：`v22.22.1`
- MSYS2 clang64：`C:\msys64\clang64\bin\clang.exe`，版本 `21.1.8`

这台机器当前仍然缺少或不满足的前置条件：

- `OpenClaw` 还缺 agent auth：`<USER_HOME>\.openclaw\agents\main\agent\auth-profiles.json`
- `OpenClaw` 当前 `models status` 已明确显示：
  - `storePath=<USER_HOME>\.openclaw\agents\main\agent\auth-profiles.json`
  - `shellEnvFallback.enabled=false`
  - `missingProvidersInUse=["anthropic"]`
- `rime-weasel` 的系统注册和 E2E 验证还没完成

这意味着：

- Android 主线现在就能跑。
- Windows 主线已经能完成 `release rime weasel`、默认命令与 `release installer`，详细证据见复核笔记。
- OpenClaw 命令链已经打通，当前只差 auth。

## 3. 主线怎么跑

### 3.1 Android：`fcitx5-android`

规范入口脚本：

- `TODO/ime-research/scripts/run_fcitx5_android_debug_docker.ps1`
- `TODO/ime-research/scripts/run_fcitx5_android_real_device.ps1`

它的职责：

- 用 Docker 跑 Android 构建，不污染本机开发环境。
- 默认只构建 `arm64-v8a`。
- 自动把日志写入 `TODO/ime-research/logs/`。

默认运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_debug_docker.ps1
```

构建成功后应关注：

- 日志：`TODO/ime-research/logs/*fcitx5-android*`
- APK：`TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/debug/`
- 当前已验证成功的 Debug 构建日志：`TODO/ime-research/logs/20260321_fcitx5-android_assembleDebug_docker_arm64_functionkit_validation_rerun.log`
- 当前已归档的可安装 APK：`TODO/ime-research/artifacts/apks/20260322_fcitx5-android_fe3a618_arm64-v8a_debug_functionkit.apk`

安装到 Android 设备：

```powershell
adb install -r TODO\ime-research\repos\fcitx5-android\app\build\outputs\apk\debug\<apk文件名>.apk
```

Android Function Kit 现在还补了一条真实体验链：

- 接入说明：`TODO/ime-research/notes/20260322_android_functionkit_window_baseline.md`
- Contract runner 说明：`TODO/ime-research/notes/20260322_android_functionkit_contract_runner.md`
- 入口位置：`StatusAreaWindow -> Function Kit`
- 当前功能件：`chat-auto-reply`
- 构建时会自动执行 `syncFunctionKitAssets`，把 Runtime SDK bundle 与功能件 UI 一起打进 APK

也就是说，Android 端现在已经不只是“输入法本体能跑”，而是已经有了一个真正可打开的浏览器式功能件窗口基线。

Android contract runner 当前也已经补出第一版构建基线：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_debug_docker.ps1 -GradleTasks ':app:assembleDebugAndroidTest'
```

现在也有一键执行脚本：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_functionkit_contract.ps1 -Mode run
```

这条脚本现在已经不只是“包一下 adb 命令”，而是会在没有设备时自动：

- 安装 `cmdline-tools`
- 创建 / 启动 `fcitx5-api36_1-google-play-x86_64`
- 按设备 ABI 选择 `x86_64` 构建
- 安装失败时自动卸载旧签名包后重试
- 执行 instrumentation 并把结果 JSON 拉回本地

如果只想先做环境体检：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_functionkit_contract.ps1 -Mode doctor
```

如果是接自己的真机做真实体验，而不是跑模拟器 automation，现在固定入口是：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_fcitx5_android_real_device.ps1 -Mode run -DeviceId <你的手机序列号>
```

对应手册：

- `TODO/ime-research/notes/20260322_android_real_device_runbook.md`

当前已验证成功的 contract runner 测试 APK 构建：

- 日志：`TODO/ime-research/logs/20260322_fcitx5-android_functionkit_contract_assembleDebugAndroidTest_retry2_docker_arm64.log`
- 测试 APK：`TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/androidTest/debug/org.fcitx.fcitx5.android-fe3a618-debug-androidTest.apk`
- instrumentation 包名：`org.fcitx.fcitx5.android.debug.test`
- target 包名：`org.fcitx.fcitx5.android.debug`

当前还补出了本机真实跑通的 `x86_64` 自动化证据：

- `doctor`：`TODO/ime-research/logs/20260322_013016_fcitx5-android_functionkit_contract_doctor.log`
- `x86_64` build：`TODO/ime-research/logs/20260322_030629_fcitx5-android_functionkit_contract_build.log`
- 自动 run：`TODO/ime-research/logs/20260322_031725_fcitx5-android_functionkit_contract_run.log`
- 拉回结果：`TODO/ime-research/logs/20260322_031725_fcitx5-android_functionkit_contract_result.json`

当前这份结果 JSON 已明确证明 Android 自动化不是空壳：

- `render_snapshot_matched=true`
- `candidate_insert_observed=true`
- `permission_denied_handled=true`
- `bridge_error_handled=true`

边界也要说清楚：这条链路现在已经是“真实可执行的 Android instrumentation + headless emulator contract automation”，但还不是“启用输入法 -> 切换输入法 -> 在外部目标 App 真上屏”的完整系统级 E2E。完整 IME E2E 仍然要继续补。

后续在真机或模拟器上执行时，应使用：

```powershell
adb install -r TODO\ime-research\artifacts\apks\20260322_fcitx5-android_fe3a618_arm64-v8a_debug_functionkit.apk
adb install -r -t TODO\ime-research\repos\fcitx5-android\app\build\outputs\apk\androidTest\debug\org.fcitx.fcitx5.android-fe3a618-debug-androidTest.apk
adb shell am instrument -w -e class org.fcitx.fcitx5.android.input.functionkit.FunctionKitContractInstrumentationTest org.fcitx.fcitx5.android.debug.test/androidx.test.runner.AndroidJUnitRunner
```

Android contract result 当前会写到目标 App 的外部文件目录：

- `/sdcard/Android/data/org.fcitx.fcitx5.android.debug/files/function-kit-contract/chat-auto-reply-contract-result.json`

### 3.2 Windows：`rime-weasel`

规范入口脚本：

- `TODO/ime-research/scripts/run_rime_weasel_build.ps1`
- `TODO/ime-research/scripts/verify_rime_weasel_install.ps1`
- `TODO/ime-research/scripts/run_windows_testhost.ps1`
- `TODO/ime-research/scripts/run_windows_functionkit_host.ps1`

它的职责：

- 自动解析 repo 内 Boost 1.84、Windows SDK、VS 命令环境。
- 在需要时用 `subst` 建短路径，避免 `MAX_PATH`。
- 通过 `VsDevCmd.bat` 进入 VS 构建环境，并清理 `Anaconda` 污染。
- 调用上游 `build.bat`，并把日志落盘。
- 在构建完成后，额外用安装验证脚本核对 installer、文件落盘、注册表视图、`CTF\TIP` 与用户语言列表。

默认运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_rime_weasel_build.ps1
```

如果需要单独刷新 Rime 数据包：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_rime_weasel_build.ps1 -BuildArgs 'release data'
```

如果需要重跑安装包：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_rime_weasel_build.ps1 -BuildArgs 'release installer'
```

如果需要复核安装 / 注册结果：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\verify_rime_weasel_install.ps1
```

如果需要构建 / smoke / 打开 Windows `TestHost`：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode build
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode smoke -SnapshotPath 'TODO/ime-research/logs/20260321_windows_testhost_smoke_snapshot.json'
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode contract -SnapshotPath 'TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_host_snapshot.json' -ContractResultPath 'TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_result.json'
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode run
```

如果需要构建 / smoke / 打开 Windows Function Kit Host：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_windows_functionkit_host.ps1 -Mode build
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_windows_functionkit_host.ps1 -Mode smoke -SnapshotPath 'TODO/ime-research/logs/20260321_windows_functionkit_host_smoke_snapshot.json'
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_windows_functionkit_host.ps1 -Mode run
```

构建成功后应关注：

- clean build 日志：`TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only4.log`
- clean build 退出码：`TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only4.exitcode.txt`
- 默认命令日志：`TODO/ime-research/logs/20260321_rime-weasel_full_default_after_split.log`
- 默认命令退出码：`TODO/ime-research/logs/20260321_rime-weasel_full_default_after_split.exitcode.txt`
- installer 日志：`TODO/ime-research/logs/20260321_rime-weasel_installer_recheck.log`
- installer 退出码：`TODO/ime-research/logs/20260321_rime-weasel_installer_recheck.exitcode.txt`
- install validation log：`TODO/ime-research/logs/20260321_rime-weasel_install_validation.log`
- install validation json：`TODO/ime-research/logs/20260321_rime-weasel_install_validation.json`
- Windows TestHost build log：`TODO/ime-research/logs/20260321_windows_testhost_build.log`
- Windows TestHost smoke snapshot：`TODO/ime-research/logs/20260321_windows_testhost_smoke_snapshot.json`
- Windows TestHost function kit contract result：`TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_result.json`
- Windows TestHost function kit contract host snapshot：`TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_host_snapshot.json`
- Windows TestHost recheck build log：`TODO/ime-research/logs/20260321_windows_testhost_recheck.log`
- Windows TestHost recheck smoke snapshot：`TODO/ime-research/logs/20260321_windows_testhost_recheck_snapshot.json`
- 关键产物：
  - `TODO/ime-research/repos/rime-weasel/output/WeaselServer.exe`
  - `TODO/ime-research/repos/rime-weasel/output/WeaselDeployer.exe`
  - `TODO/ime-research/repos/rime-weasel/output/WeaselSetup.exe`
  - `TODO/ime-research/repos/rime-weasel/output/rime.dll`
  - `TODO/ime-research/repos/rime-weasel/output/archives/weasel-0.17.4.0.93eec2d-installer.exe`
  - `TODO/ime-research/windows-testhost/WindowsImeTestHost.sln`
  - `TODO/ime-research/windows-testhost/WindowsImeTestHost/WindowsImeTestHost.csproj`

当前主机的现实情况：

- `release boost` 已经能跑通
- `release rime weasel` 已成功跑通：
  - 日志：`TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only4.log`
  - 退出码：`TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only4.exitcode.txt`
- 默认不带参数的入口命令也已成功跑通：
  - 日志：`TODO/ime-research/logs/20260321_rime-weasel_full_default_after_split.log`
  - 退出码：`TODO/ime-research/logs/20260321_rime-weasel_full_default_after_split.exitcode.txt`
- `release installer` 也已成功跑通：
  - 日志：`TODO/ime-research/logs/20260321_rime-weasel_installer_recheck.log`
  - 退出码：`TODO/ime-research/logs/20260321_rime-weasel_installer_recheck.exitcode.txt`
- 机器级安装 / 注册验证也已通过：
  - 说明文档：`TODO/ime-research/notes/20260321_windows_install_validation.md`
  - JSON 证据：`TODO/ime-research/logs/20260321_rime-weasel_install_validation.json`
- Windows `TestHost` 已可构建并完成一次 smoke：
  - 说明文档：`TODO/ime-research/notes/20260321_windows_testhost_baseline.md`
  - 运行说明：`TODO/ime-research/windows-testhost/README.md`
  - smoke 快照：`TODO/ime-research/logs/20260321_windows_testhost_smoke_snapshot.json`
- `HKLM\SOFTWARE\Rime\Weasel` 与 `Uninstall\Weasel` 当前不是“完全缺失”，而是落在 32 位注册表视图 `WOW6432Node`
- 当前用户语言列表已经包含小狼毫 `InputMethodTip`
- 当前默认输入法覆盖仍是搜狗，所以“可见 / 可选”已经成立，但“默认就是小狼毫”还没成立
- 用户已明确确认：当前会话后续消息已经通过小狼毫输入，这说明人工真实打字链路可用；当前缺的是自动化闭环
- 默认命令现在刻意不再强制 `data`，避免把网络下载阶段和 Windows 原生编译绑死在一起
- 冷启动时如果 `output/data/essay.txt` 缺失，wrapper 仍会自动补一次 `data` 预阶段
- `release data` 仍可单独执行；它解决的是刷新数据包，而不是验证 `rime-weasel` 能否编译
- `NSIS` 已安装到 `C:\Program Files (x86)\NSIS\Bin\makensis.exe`
- Windows Function Kit Host 已可构建并完成一次 smoke：
  - 说明文档：`TODO/ime-research/notes/20260321_windows_functionkit_host_poc.md`
  - 运行说明：`TODO/ime-research/windows-functionkit-host/README.md`
  - smoke 快照：`TODO/ime-research/logs/20260321_windows_functionkit_host_smoke_snapshot.json`

所以 Windows 主线当前的状态是：

- **项目已定为 `rime-weasel`**
- **运行路径已固定**
- **Windows 编译基线、installer 打包、机器级安装 / 注册验证都已打通**
- **Windows `TestHost` 也已经有最小可构建基线**
- **Windows `TestHost` 现在已经有固定的 Function Kit contract runner**
- **Windows WebView2 Function Kit Host 也已经有最小可运行 PoC**
- **下一阶段是 IME 激活 helper + 真正打字上屏 E2E**

### 3.3 Agent / Skills：`openclaw`（只用 Agent，不接 Channel）

规范入口脚本：

- `TODO/ime-research/scripts/run_openclaw_agent_only.ps1`

支持 3 种模式：

1. `status`
   - 查看当前 agent 的 provider / auth 状态，先判断是不是卡在 key。
2. `smoke`
   - 用一条消息做最小自检。
3. `gateway`
   - 启动本地 Gateway，但显式跳过 Channel，只保留以后常驻后端可能需要的最小控制面。

先看 auth 状态：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode status -SkipInstall
```

默认运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode smoke -Message "Summarize this draft"
```

当前主机的现实情况：

- `status` 模式已经能直接进入 `pnpm openclaw models status --agent main --json`
- 这条脚本已经能进入真实 `agent --local` 调用
- `models status` 当前结果已经落盘：
  - `TODO/ime-research/logs/20260321_openclaw_models_status_main.json`
  - `TODO/ime-research/logs/20260321_openclaw_models_status_main.exitcode.txt`
- `smoke` 当前结果已经落盘：
  - `TODO/ime-research/logs/20260321_openclaw_smoke_main.log`
  - `TODO/ime-research/logs/20260321_openclaw_smoke_main.exitcode.txt`
- 当前报错是缺少 provider auth，而不是 Node 版本不足
- 当前 `main` agent 的真实状态是：
  - `auth-profiles.json` 不存在
  - 默认模型是 `anthropic/claude-opus-4-6`
  - `shellEnvFallback` 当前没启用，所以 shell 里的临时环境变量不会自动兜底
- 当前 `pnpm openclaw:rpc` 不能继续当主线：
  - 在当前 commit 上它会直接退出并报 `required option '-m, --message <text>' not specified`
  - 所以后面不要再把 `rpc` 写进固定入口
- 最短修复路径只有两种：
  - 在网关主机的 `<USER_HOME>\.openclaw\.env` 写入 `ANTHROPIC_API_KEY=...`
  - 或者准备好 Anthropic token，再执行 `openclaw models auth paste-token --provider anthropic`

## 4. 功能件应该长什么样

以后统一把“浏览器插件式能力”叫功能件，不再和输入法框架插件混淆。

一个功能件至少包含 5 个部分：

1. `manifest`
   - 版本、权限、触发方式、支持平台、浏览器式 UI 入口、Host Bridge 约定。
2. `ui`
   - 本地打包的 HTML / CSS / JS 面板、候选卡片、设置页、状态提示。
3. `tools`
   - 真正执行工作的结构化接口，输入输出必须是 JSON Schema。
4. `skills`
   - `SKILL.md`，告诉 Agent 在什么场景下调什么 tools。
5. `tests`
   - contract tests、fixture tests、UI tests、E2E tests。

建议的功能件目录骨架：

```text
feature-kit/
  manifest.json
  skills/
    auto-reply/SKILL.md
  tools/
    reply-generator/
  ui/
    app/
      index.html
      main.js
      styles.css
    README.md
  tests/
```

### 4.1 微信自动回复功能件的推荐拆法

这个例子以后会反复出现，所以先拆清楚：

1. 消息获取能力
   - 不要一开始就幻想输入法直接偷看微信聊天记录。
   - 要先做成单独的消息接入 Tool，来源可以是：
     - 官方 API
     - 用户主动分享
     - 企业内受控接入
     - 后续再讨论高风险方案
2. 个性化能力
   - 拆成两个层次：
     - 全局个性化：用户总体语气、偏好、禁忌
     - 联系人个性化：和某个人聊天时的特定风格与上下文
3. 回复生成能力
   - 输入：当前消息、上下文摘要、全局画像、联系人画像
   - 输出：`candidates[]`
4. 输入法侧 UI
   - 把 `candidates[]` 渲染成候选按钮
   - 用户点击后，只是写入输入框，不自动发送

这正是功能件的形态：

- Tool 负责拿数据、算结果。
- Skill 负责告诉 Agent 什么时候用哪几个 Tool。
- 输入法只负责展示候选与最终 commit。

## 5. 跨平台问题怎么解

当前只考虑 Windows + Android。

结论不变：

- 功能件本体应尽量跨平台。
- 平台差异应收敛在 Host Adapter 层。

推荐拆法：

1. 跨平台层
   - `manifest`
   - `skills`
   - `tools` 协议
   - 浏览器式 UI bundle
   - Host Bridge 协议
   - JSON fixtures
2. 平台适配层
   - Android Host Adapter
   - Windows Host Adapter
   - 输入框上下文接入
   - 面板渲染
   - 本地权限能力

也就是说：

- 不要求“一行代码不改就跨平台”
- 要求“80% 的功能件逻辑、协议、测试资产是共享的”

## 6. 功能件如果自己也有输入框，怎么处理

这是必须提前定死的设计点，否则你会掉进“输入法里再套一个输入法”的坑。

我的建议是双输入域模型：

1. 目标输入域
   - 指当前外部 App 的输入框。
   - 最终上屏永远写到这里。
2. 功能件本地输入域
   - 指功能件面板内部自己的小输入框、搜索框、过滤框、提示词编辑框。

规则：

1. 两个输入域任何时刻只能有一个处于活动态。
2. 功能件本地输入域默认不走外部目标输入连接，避免递归与串字。
3. 小型本地输入框优先用功能件自己的轻量文本缓冲，不复用系统 IME 主链路。
4. 大段文本编辑不要塞在输入法面板里，直接弹出独立编辑器页或全屏 sheet。
5. 最终写回外部输入框必须是显式动作，例如：
   - `插入`
   - `替换`
   - `追加`

这能解决两个核心问题：

- 防止功能件自己抢输入法焦点。
- 防止用户分不清“我现在在改的是功能件参数，还是最终要发出去的文本”。

## 7. 自动化测试必须怎么做

这里只讨论“真能持续找 bug”的测试，不讨论只有形式的测试。

### 7.1 测试分层

必须同时有 5 层：

1. Tool contract tests
   - 校验 JSON 输入输出 schema
   - 校验 deterministic tools 的边界
2. Skill gating / prompt tests
   - 校验 `SKILL.md` frontmatter
   - 校验 `requires.os/bins/env/config`
   - 校验命令调度规则
3. Agent bridge tests
   - 用固定 fixture 模拟 OpenClaw 响应
   - 校验输入法收到的 `suggestions/actions/json` 能正确渲染与 commit
4. Browser runtime tests
   - 校验功能件 Web UI 的路由、按钮、状态同步、消息桥
5. Host integration tests
    - Android Host Adapter / Windows Host Adapter 的焦点、上下文、权限桥接
6. 真正的 E2E tests
   - 从“安装 -> 启用输入法 -> 打开目标输入框 -> 调起功能件 -> 生成候选 -> 点击插入 -> 断言结果”全链路跑通

### 7.2 Android 端 E2E 怎么做

推荐组合：

- Android Emulator
- 专用 IME Testbed App
- `adb`
- `UIAutomator` / `Maestro` / `Espresso-Web`

必须自建一个最小测试宿主 App，至少包含：

- 普通 `EditText`
- 多行文本框
- 光标移动
- 选中文本
- 富文本/emoji 场景

E2E 流程应能自动完成：

1. 安装 APK
2. 启用输入法
3. 切换到该输入法
4. 在 Testbed 中输入
5. 打开功能件面板
6. 模拟 Agent 返回 fixture
7. 点击候选
8. 断言最终文本

### 7.3 Windows 端 E2E 怎么做

推荐组合：

- 一台可重置的 Windows VM
- 专用 TestHost 桌面程序
- `FlaUI` 或 `WinAppDriver`
- 自动安装/卸载脚本

Windows 端不要指望“只跑单元测试”就知道 IME 真没问题。真正要测的是：

- 安装与注册
- 切换输入法
- 标准文本框
- 浏览器输入框
- 候选选择
- 焦点切换
- 功能件面板打开与插入

TestHost 至少要覆盖：

- 标准 Win32 Edit
- WPF TextBox / RichTextBox
- WebView2 输入框

### 7.4 功能件的测试资产必须跨平台复用

功能件层的下面这些东西必须共享：

- fixture JSON
- tool contract tests
- skill metadata tests
- browser runtime snapshots

这样 Windows 与 Android 真正不同的，只剩 Host Adapter 和最终 E2E 驱动。

## 8. 这一阶段的固定执行顺序

以后从这里继续，不要每次重新想：

1. 先跑 Android 主线：`fcitx5-android`
2. Windows 端先跑 `release boost` 健康检查
3. Windows 端再跑 `release rime weasel` clean build
4. Windows 端再跑默认入口命令，确认 baseline 仍可复现
5. Windows 端按需重跑 `release installer`
6. 如果需要数据包，再单独跑 `release data`
7. 先跑 `openclaw` 的 `status`，确认当前到底缺什么 auth
8. 给 `openclaw` 的 `main` agent 配 auth，再跑 `smoke`
9. 如果需要常驻本地后端，再切 `gateway`
10. 验证 Windows 安装/注册链路
11. 开始定义第一个功能件骨架
12. 同时开始搭测试宿主：
   - Android `IME Testbed App`
   - Windows `TestHost`（已出最小基线，继续补自动化驱动）

## 9. 当前最重要的结论

现在不要再发散。

当前真正要持续跑的只有：

- Android：`fcitx5-android`
- Windows：`rime-weasel`
- Agent：`openclaw`（Agent-only）

当前真正要尽快补齐的只有：

- OpenClaw 的 auth
- Windows IME 激活 helper + 真实输入 E2E
- 功能件协议
- E2E 测试宿主

