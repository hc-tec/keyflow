# Windows + Android 输入法：开源方案可行性研究（可复现记录）

> 编码：UTF-8  
> 创建时间：2026-03-20T18:20:00+08:00  
> 聚焦平台：Windows（桌面）+ Android（移动）  
> 目标：在“能拉取到本地 + 能构建/运行（尽量用 Docker）+ 许可证可接受”的约束下，判断最可行的技术路线  

## 0. 我对“可行性”的定义（先对齐标准）

我把可行性拆成三层，必须逐层过：

1. **工程可行**：仓库可拉取；依赖可装；能构建出产物（Windows 可编译出可安装 IME；Android 能出 APK/AAB）。
2. **产品可行**：输入延迟、候选交互、兼容性达标；能分发/升级；能解释权限；用户敢用。
3. **商业/合规可行**：许可证允许你想要的分发方式；上架/签名/隐私/政策风险可控。

## 1. 候选开源路线（按“共享引擎 + 多前端”组织）

### 路线 A：Rime 引擎（librime）+ Windows/Android 前端

本地仓库（已拉取）：
- `TODO/ime-research/repos/rime-librime`（引擎，BSD-3-Clause）
- `TODO/ime-research/repos/rime-weasel`（Windows 前端，小狼毫，GPL-3.0）
- `TODO/ime-research/repos/osfans-trime`（Android 前端，同文，GPL-3.0）
- `TODO/ime-research/repos/gurecn-yuyanime`（Android 前端，语燕，GPL-3.0，基于 Rime）

优点：
- 中文输入生态成熟（方案/词库/社区经验多）
- “引擎与方案”逻辑清晰，适合做跨端一致性（同词库、同配置）

硬伤（我认为是决定性的）：
- **Windows/Android 主流前端是 GPL-3.0**：如果你希望做闭源或商业分发，必须非常谨慎（通常意味着要么开源你的派生作品，要么换路线/重写前端）

### 路线 B：Fcitx5 栈（核心 + Android/Windows 适配）

本地仓库（已拉取）：
- `TODO/ime-research/repos/fcitx-fcitx5`（核心框架，LGPL-2.1-or-later，REUSE 结构在 `LICENSES/`）
- `TODO/ime-research/repos/fcitx5-android`（Android 前端/发行版，LGPL-2.1）
- `TODO/ime-research/repos/fcitx5-windows`（Windows 适配/发行版，LICENSE 在根目录；需进一步审计）

优点：
- 许可证整体更偏“可商用/可闭源协作”（仍需逐模块审计）
- 框架化更强，适合多语言、插件化

挑战：
- 对“只做中文拼音”的项目来说，工程体量更大
- Windows 端生态与稳定性（TSF/兼容/分发）仍是硬仗

### 路线 C：Windows TSF 自研/半自研 + Android 键盘自研

本地仓库（已拉取）：
- `TODO/ime-research/repos/pime`（Windows TSF/IME 相关，多个子模块许可证混合：LGPL 2.0 + 其他）

优点：
- 你可以完全掌控 Windows 侧 TSF/兼容性细节（不被上游限制）

挑战：
- 跨端共享“引擎/词库/方案”的复用度反而下降
- 工期与维护成本明显更高

## 2. “拉取 + 本地构建/运行”现状（以日志为证）

> 说明：源码仓库放在 `TODO/ime-research/repos/`（不进 git），构建日志归档在 `TODO/ime-research/logs/`（进 git，UTF-8）。

### 2.1 Android：同文 Trime（Rime 前端）

- 关键日志：
  - 初次失败（缺少 OpenCC 子模块数据）：`TODO/ime-research/logs/20260320_trime_assembleDebug_docker.log`
  - 初始化子模块后再次失败（缺 CMake）：`TODO/ime-research/logs/20260320_trime_assembleDebug_docker_with-submodules.log`
  - 构建失败（默认包含 `armeabi-v7a`，在 `librime-lua` 第三方 Lua 代码处编译报错）：`TODO/ime-research/logs/20260320_trime_assembleDebug_docker_fix-cmake2_live.log`
  - 构建成功（仅构建 arm64-v8a，`BUILD_ABI=arm64-v8a`）：`TODO/ime-research/logs/20260320_trime_assembleDebug_docker_arm64_live.log`
  - arm64 构建 exit code：`TODO/ime-research/logs/20260320_trime_assembleDebug_docker_arm64_exitcode.txt`

结论：
- Trime 可以在 Docker 内 **成功构建出 Debug APK（arm64-v8a）**。产物示例：`TODO/ime-research/repos/osfans-trime/app/build/outputs/apk/debug/com.osfans.trime-a2db389-arm64-v8a-debug.apk`（约 15MB）。
- 默认开启 `armeabi-v7a` 时会在 NDK/CMake 阶段失败；项目自身提供 `BUILD_ABI`/`buildABI` 覆盖机制，可作为现实工程的“可控开关”。

### 2.2 Android：Fcitx5-Android

- 关键日志：
  - 初次失败（Gradle wrapper CRLF）：`TODO/ime-research/logs/20260320_fcitx5-android_gradle_tasks_docker.log`
  - 修复 CRLF 后可跑 tasks：`TODO/ime-research/logs/20260320_fcitx5-android_gradle_tasks_docker_fix-crlf.log`
  - assembleDebug 失败：缺 CMake/Ninja：`TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker.log`
  - 安装 CMake 后失败：缺 ECM（extra-cmake-modules）：`TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_fix-cmake6.log`
  - 继续失败（Boost 头文件找不到，根因是 Windows 下 symlink checkout 失败导致 `prebuilt/boost/<abi>/include` 不是目录）：`TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_fix-ecm2_live.log`
  - 修复脚本：`TODO/ime-research/scripts/docker_build_fcitx5_android.sh`
  - 构建成功（仅构建 arm64-v8a，`BUILD_ABI=arm64-v8a`）：`TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_arm64_fix-boostinclude2_live.log`
  - arm64 构建 exit code：`TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_arm64_fix-boostinclude2_exitcode.txt`

结论：
- Fcitx5-Android 可以在 Docker 内 **成功构建出 Debug APK（arm64-v8a）**。产物示例：`TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/debug/org.fcitx.fcitx5.android-fe3a618-arm64-v8a-debug.apk`（约 60MB）。
- 构建链路依赖“宿主工具包”（ECM/gettext），不是纯 Android SDK 即可跑通；但这类依赖可在 Docker 内解决。
- 在 Windows + Docker bind mount 场景下，需要额外处理 **git symlink 失效** 导致的预编译依赖目录结构问题（本次至少影响 Boost 的 include 路径）。

### 2.3 引擎：librime（核心 C++ 引擎）

- 关键日志：
  - `make test` 容器构建失败（Ubuntu apt 502，网络侧问题）：`TODO/ime-research/logs/20260320_librime_make_test_docker.log`

结论：
- 失败原因是镜像源下载 502，不是代码问题；需要重试/换源/增加重试策略。

### 2.4 Windows：在本机环境的现实限制

本机当前只有 Linux 容器环境；未安装 MSVC/VS Build Tools（`cl` 不存在）。因此：
- `rime-weasel` / `PIME` / `fcitx5-windows` 这类 **TSF/COM + Windows 构建链** 的项目，难以在“Linux Docker”里直接编译。
- 如果要做到“从源码构建 Windows IME”，通常需要：
  - 安装 Visual Studio / Build Tools（本机污染较大），或
  - 切换 Docker Desktop 到 **Windows containers** 并准备对应镜像（工程量与环境侵入都很高）

## 3. 关键决策点（我建议你优先回答的 3 个问题）

1. **你是否接受 GPL-3.0？**
   - 如果不接受：Rime 路线在 Windows/Android 的“现成前端”会立刻受限（除非你重写前端或找非 GPL 前端）
2. **你想做“可配置的输入法发行版”，还是“开发一个新输入法产品”？**
   - 前者更像做 Rime/Fcitx 的发行版与同步生态；后者需要更多 UI/交互创新
3. **AI 能力是“必选主线”还是“可选插件”？**
   - 我建议：先做可用的输入法本体，再做慢路径 AI（见 `TODO/ime-research/notes/20260320_ai_ime_survey.md`）

## 4. 我当前的建议（阶段性结论）

在“Windows + Android”且强调长期维护的前提下，我更倾向先用 **Fcitx5 栈** 做可行性打穿：
- 许可证整体更友好（相对 GPL）
- Android 侧工程已有清晰依赖解决路径（Docker 内安装 ECM/gettext/CMake）
- Windows 侧仍需进一步验证（是否能在不污染环境的前提下构建）

但如果你的核心目标是“中文方案/词库/高度可定制”且你能接受 GPL 或愿意开源前端：
- **Rime 栈依然是中文输入体验最稳的底座**，尤其在“方案/词库生态”上。
