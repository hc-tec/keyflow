# 语音入口 + 打字不放弃：开源/可源码构建输入法（Windows + Android）调研与构建记录

> 编码：UTF-8  
> 创建时间：2026-03-20T21:15:00+08:00  
> 关注范围：以 Android 为主（Windows 仅做入口/架构对照）  
> 目标：找出“既支持语音，又不放弃打字”的输入法/键盘，并给出可复现的 Docker 构建证据与我的判断  

## 0. 结论先行（我自己的主见）

1. **真正做到“同一个键盘里，语音+打字都强”的开源实现并不多**：开源键盘多数要么只做打字、要么把语音当作“切换到语音 IME 的快捷键”。  
2. **两种成熟路线**（都能做到“不放弃打字”）：
   - **路线 A：键盘内置语音听写**（一个 APK 内既能打字也能语音听写）：例如 AnySoftKeyboard、FUTO Keyboard（但 FUTO 为 source-available，非 OSI 开源）。
   - **路线 B：打字键盘 + 语音 IME 组合**（体验上看似“一体”，实现上是可插拔）：例如 HeliBoard/FlorisBoard/OpenBoard 提供“语音快捷键/动作”，快速切换到已安装的语音 IME（如 whisperIME、FUTO Voice Input、Sayboard 等）。
3. **对你的产品路线建议**：先用路线 B 把“语音入口”做成能力接口与 UX 规则，再决定是否把离线语音模型“内置”到同一个 APK（路线 A）——后者会显著放大体积、耗电、性能与合规压力。

## 1. 方法（GitHub 调研 + 本地证据）

### 1.1 GitHub 搜索（2026-03-20）

使用 GitHub Search API（无鉴权，少量查询）得到的关键发现：

- `futo-org/android-keyboard`：FUTO Keyboard 源码镜像（星标较高），**键盘内置离线语音能力（Whisper/ggml）**，但许可为 **FUTO Source First License**（非 OSI 开源）。本地已克隆为 `TODO/ime-research/repos/futo-android-keyboard`。
- `AnySoftKeyboard/AnySoftKeyboard`：老牌开源键盘，README 明确 “Voice input”，并包含 `ime/voiceime` 模块（触发系统语音识别 Intent）。
- 语音 IME（多为“只语音不打字”）：`woheller69/whisperIME`、`futo-org/voice-input`、`ElishaAz/Sayboard`、`j3soon/whisper-to-input` 等。

### 1.2 本地 repo 扫描（证据点）

- AnySoftKeyboard：`TODO/ime-research/repos/anysoftkeyboard/README.md` 与 `TODO/ime-research/repos/anysoftkeyboard/ime/voiceime/.../IntentApiTrigger.java`（`RecognizerIntent.ACTION_RECOGNIZE_SPEECH`）。
- HeliBoard：`TODO/ime-research/repos/heliboard/app/src/main/java/.../LatinIME.java` 里对 `KeyCode.VOICE_INPUT` 的处理是 `switchToShortcutIme`（**切到“快捷/语音 IME”**，自身不做识别）。
- FlorisBoard：`TODO/ime-research/repos/florisboard/app/src/main/kotlin/.../FlorisImeService.kt` 存在 `switchToVoiceInputMethod()`（**切换到 voice subtype 的 IME**）。
- OpenBoard：同 AOSP/LatinIME 逻辑，存在 `RichInputMethodManager.switchToShortcutIme()`（但 repo 较旧）。
- FUTO Keyboard：`TODO/ime-research/repos/futo-android-keyboard/native/jni/org_futo_voiceinput_WhisperGGML.cpp` 等（**内置 whisper.cpp/ggml**）。

## 2. “语音 + 打字”项目清单（按实现模式分类）

> 说明：这里的“开源”包含两类：**OSI 开源** 与 **source-available**（代码公开但许可限制更强）。我会在表里标明许可差异。

| 项目 | 语音实现模式 | 是否同 APK 内语音+打字 | 是否离线语音 | 许可 | 维护活跃度（直观） | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| AnySoftKeyboard | 键盘内触发 `RecognizerIntent`（依赖系统/第三方语音识别提供者） | 是 | 取决于提供者 | OSI 开源（见 LICENSE） | 活跃 | 最接近“传统键盘+语音听写”的开源实现 |
| HeliBoard | 语音按键=切换到“快捷/语音 IME” | 否（组合式） | 取决于语音 IME | GPLv3 | 活跃 | 自身无网络权限，适合作为“打字键盘基座” |
| FlorisBoard | 快捷动作=切换到 voice IME | 否（组合式） | 取决于语音 IME | Apache-2.0 | 活跃 | 设计上就把语音当“外部提供者” |
| OpenBoard | 语音按键=切换到“快捷/语音 IME” | 否（组合式） | 取决于语音 IME | GPLv3 | 低（较旧） | 更像 AOSP 派生的历史参考 |
| FUTO Keyboard | 键盘内置离线语音（Whisper/ggml） | 是 | 是 | **Source-available（FUTO Source First）** | 活跃 | 体积/性能/模型分发是关键难点；许可需重点评估 |

## 3. 构建结果（Docker 可复现证据）

### 3.1 AnySoftKeyboard（成功）

- 构建脚本（容器内）：`TODO/ime-research/scripts/docker_build_anysoftkeyboard.sh`
- 日志：
  - 失败记录（IPv6/网络不可达）：`TODO/ime-research/logs/20260320_anysoftkeyboard_ime-app_assembleDebug_docker_live.log`
  - 失败记录（Windows bind mount 的 Gradle transforms 原子移动权限问题）：`TODO/ime-research/logs/20260320_anysoftkeyboard_ime-app_assembleDebug_docker_ipv4_live.log`
  - **成功记录（Gradle cache 改用 Docker named volume + IPv4 优先）**：`TODO/ime-research/logs/20260320_anysoftkeyboard_ime-app_assembleDebug_docker_volume-cache_live.log`
  - 对应 exitcode：`TODO/ime-research/logs/20260320_anysoftkeyboard_ime-app_assembleDebug_docker_volume-cache_live_exitcode.txt`
- 产物（Debug APK）：`TODO/ime-research/repos/anysoftkeyboard/ime/app/build/outputs/apk/debug/app-debug.apk`

关键经验：
- `repo1.maven.org` 在容器 Java 网络栈上可能优先走 IPv6，出现 `Network is unreachable`；通过 `JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true` 规避。
- 在 Windows 主机 bind mount 下，Gradle 9 的 transforms 目录原子移动可能触发 `AccessDeniedException`；通过 **Docker named volume 作为 `GRADLE_USER_HOME`** 规避（不污染本地环境，也能复用缓存）。

### 3.2 HeliBoard（成功）

- 构建脚本（容器内）：`TODO/ime-research/scripts/docker_build_heliboard.sh`
- 日志：`TODO/ime-research/logs/20260320_heliboard_assembleDebug_docker_live.log`
- exitcode：`TODO/ime-research/logs/20260320_heliboard_assembleDebug_docker_live_exitcode.txt`
- 产物（Debug APK）：`TODO/ime-research/repos/heliboard/app/build/outputs/apk/debug/HeliBoard_3.9-beta1-debug.apk`

### 3.3 FUTO Keyboard（构建中/结果待补）

- 构建脚本（容器内）：`TODO/ime-research/scripts/docker_build_futo_android_keyboard.sh`
- 日志：`TODO/ime-research/logs/20260320_futo-android-keyboard_assembleUnstableDebug_docker_live.log`
- exitcode：`TODO/ime-research/logs/20260320_futo-android-keyboard_assembleUnstableDebug_docker_live_exitcode.txt`
- 产物（Unstable Debug APK）：`TODO/ime-research/repos/futo-android-keyboard/build/outputs/apk/unstable/debug/work-unstable-debug.apk`

## 4. Windows 端对照（语音 + 打字怎么落地更现实）

在 Windows 上，“语音+打字”最现实的组合通常不是“同一个 IME”：

- 打字 IME：Rime（`rime-weasel`）/ PIME 等（成熟、可定制）。
- 语音输入：更可行的是独立的语音听写工具把识别结果注入当前窗口（例如 `whisper-to-input` 一类），而不是把语音模型硬塞进 TSF/COM IME 内核里。

原因：TSF/COM 输入法工程复杂度高、工具链/签名/安装流程重，且语音链路更适合独立进程（崩溃/资源隔离/权限边界更清晰）。

## 5. “最大挑战”清单（从工程到产品）

- **体验一致性**：语音输出的断句、标点、数字与中英混输，和“按键编辑/撤销/候选纠错”的耦合非常深。
- **低延迟与资源隔离**：IMEs 不能卡顿；离线 ASR 常常吃 CPU/RAM，必须隔离到独立线程/进程并做 QoS。
- **模型分发与更新**：离线语音模型体积大、更新频繁；需可控下载、断点续传、版本兼容、存储空间管理。
- **隐私与合规**：语音比文本更敏感；无论云端还是离线，都要把权限、数据流向、开关、日志策略做到可审计。
- **可观测性**：需要把“识别耗时、首字延迟、纠错率、崩溃率、电量影响”做成持续指标，否则很难迭代到可用水平。
