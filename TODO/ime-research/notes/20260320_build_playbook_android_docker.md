# Android 输入法项目：Docker 构建 Playbook（可复用）

> 编码：UTF-8  
> 创建时间：2026-03-20T18:30:00+08:00  
> 目标：把“我今天怎么把这些 IME 项目在 Docker 里跑起来”的步骤固化下来，方便日后复现/排错  

## 1. 统一约定

- Docker 镜像：`ghcr.io/cirruslabs/android-sdk:34`
- 代码目录（不进 git）：`TODO/ime-research/repos/<repo>`
- 日志目录（进 git）：`TODO/ime-research/logs/`
- Gradle 缓存（不进 git）：`TODO/ime-research/.cache/gradle-<name>`，并在容器内映射为 `/gradle-cache`
- 容器环境变量：
  - `GRADLE_USER_HOME=/gradle-cache`

## 2. 通用“最小可运行”命令模板

> 注意：PowerShell 双引号会展开 `$PATH`，因此不要在 docker 命令字符串里直接写 `$PATH`；要么用固定 PATH，要么用单引号包裹并转义。

```bash
docker run --rm \
  -e GRADLE_USER_HOME=/gradle-cache \
  -v "<host_gradle_cache>:/gradle-cache" \
  -v "<host_repo_dir>:/work" \
  -w /work \
  ghcr.io/cirruslabs/android-sdk:34 \
  bash -lc "set -eux; \
    tr -d '\r' < ./gradlew > ./gradlew.tmp && mv ./gradlew.tmp ./gradlew; chmod +x ./gradlew; \
    yes | /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'cmake;3.31.6'; \
    export PATH=/opt/android-sdk-linux/cmake/3.31.6/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; \
    ./gradlew :app:assembleDebug --console=plain --stacktrace"
```

## 3. Trime（osfans/trime）专用注意事项

仓库：`TODO/ime-research/repos/osfans-trime`

1. **必须初始化子模块**（否则会缺 OpenCC 数据目录）：
   ```bash
   git submodule update --init --recursive
   ```
2. 如果报 “CMake x.y.z not found”，在容器里用 `sdkmanager` 安装指定版本（本次需要 `3.31.6`）。
3. **ABI 选择**：该项目支持通过 `BUILD_ABI`（环境变量）或 `-PbuildABI=...`（Gradle 属性）覆盖 ABIs。
   - 实测默认包含 `armeabi-v7a` 时可能在 NDK/CMake 阶段失败；可以先只构建 `arm64-v8a` 跑通链路：
     - Docker 传参：`-e BUILD_ABI=arm64-v8a`

对应日志：
- `TODO/ime-research/logs/20260320_trime_assembleDebug_docker.log`
- `TODO/ime-research/logs/20260320_trime_assembleDebug_docker_with-submodules.log`
- `TODO/ime-research/logs/20260320_trime_assembleDebug_docker_fix-cmake2_live.log`
- `TODO/ime-research/logs/20260320_trime_assembleDebug_docker_arm64_live.log`

## 4. Fcitx5-Android（fcitx5-android/fcitx5-android）专用注意事项

仓库：`TODO/ime-research/repos/fcitx5-android`

1. `gradlew` 在 Windows 克隆后常见 CRLF 问题：建议用 `tr -d '\r' < ./gradlew > ./gradlew.tmp && mv ./gradlew.tmp ./gradlew`（比 sed 更不易误伤）
2. 构建过程中需要 **extra-cmake-modules（ECM）** 与 `gettext`（属于宿主工具链，不是 Android SDK 自带）：
   ```bash
   apt-get update
   apt-get install -y extra-cmake-modules gettext
   ```
3. **ABI 选择**：支持 `BUILD_ABI`（环境变量）或 `-PbuildABI=...`（Gradle 属性），可用来只构建 `arm64-v8a` 先跑通：
   - Docker 传参：`-e BUILD_ABI=arm64-v8a`
4. **Windows symlink 问题**：`lib/fcitx5/src/main/cpp/prebuilt/boost/<abi>/include` 在上游是 symlink；Windows 默认可能 checkout 成“文本文件（内容为 ../include）”，导致 CMake include 路径失效。
   - 可在容器内将其“还原成目录 + 拷贝 headers”（见脚本 `TODO/ime-research/scripts/docker_build_fcitx5_android.sh`）

对应日志：
- `TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker.log`
- `TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_fix-cmake6.log`（缺 ECM 的失败记录）
- `TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_fix-ecm2_live.log`（Boost include 失败记录）
- `TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_arm64_fix-boostinclude2_live.log`（arm64 成功构建）

## 5. 一个真实踩坑：PowerShell 把 `$PATH` 提前展开为空

现象：
- 容器里执行 `./gradlew` 报：`/usr/bin/env: 'sh': No such file or directory`

根因：
- PowerShell 双引号字符串会展开 `$PATH`（这不是 bash 的 `$PATH`，而是 PowerShell 自己的变量展开），导致传入容器的命令变成：
  - `export PATH=/opt/android-sdk-linux/cmake/3.31.6/bin:`（把系统 PATH 覆盖掉了）

规避方式：
- **不要在 PowerShell 双引号里写 `$PATH`**；用固定 PATH（推荐）或改用单引号并正确转义。

对应记录（失败容器日志，不再作为主链路）：`TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_fix-ecm_live.log`

补充（重要）：
- 上面那条 `sed -i 's/\r$//'` 在不同 sed 行为下可能会“误删行尾字符 r”，导致 `gradlew` 被悄悄改坏（例如把 `gradle-wrapper.jar` 变成 `gradle-wrapper.ja`）。
- 更稳的做法是：`tr -d '\r' < ./gradlew > ./gradlew.tmp && mv ./gradlew.tmp ./gradlew`（只删真正的 CR 字符，不会误伤普通文本）。

## 6. 两个新坑：Java IPv6 与 Windows bind mount 下的 Gradle transforms

### 6.1 Java 访问 Maven Central：`Network is unreachable`（优先走 IPv6）

现象（AnySoftKeyboard 构建中遇到）：
- Gradle 解析依赖访问 `https://repo1.maven.org/maven2/...` 报 `java.net.SocketException: Network is unreachable`

推断根因：
- 容器内 Java 网络栈可能优先选择 IPv6 地址，但当前环境没有可用 IPv6 路由（curl 往往会自动回退 IPv4，因此容易“curl 正常、Java 失败”）。

规避方式（推荐）：
- 在容器内设置：`JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true`

### 6.2 Windows 主机 bind mount 的 Gradle cache：`AccessDeniedException`（Gradle 9 更容易触发）

现象（AnySoftKeyboard 使用 Gradle 9.3.1 时遇到）：
- `java.nio.file.AccessDeniedException` 出现在 `/gradle-cache/.../transforms/... -> /gradle-cache/.../transforms/...` 的原子移动阶段

推断根因：
- Docker Desktop（Windows → Linux 容器）对 bind mount 的文件系统语义与 Linux 原生 FS 不完全一致；Gradle 9 的 transforms/caches 目录对原子移动/重命名更敏感。

规避方式（推荐，不污染本地环境且可复用缓存）：
- **把 `GRADLE_USER_HOME` 挂载为 Docker named volume**，而不是 Windows 路径 bind mount：

```bash
docker run --rm \
  -e GRADLE_USER_HOME=/gradle-cache \
  -v anysoftkeyboard-gradle-cache:/gradle-cache \
  -v "<host_repo_dir>:/work" \
  -v "<host_scripts_dir>:/scripts" \
  -w /work \
  ghcr.io/cirruslabs/android-sdk:34 \
  bash -lc "set -eux; /scripts/docker_build_anysoftkeyboard.sh"
```
