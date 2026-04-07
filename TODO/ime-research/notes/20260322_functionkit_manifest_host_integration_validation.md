# Function Kit Manifest 宿主接入与验证记录（2026-03-22）

> 编码：UTF-8
> 创建时间：2026-03-22T18:19:42+08:00
> 更新时间：2026-03-22T18:19:42+08:00
> 范围：`WindowsFunctionKitHost`、`WindowsImeTestHost`、`fcitx5-android`、`function-kit-host-service`

## 1. 这次实际完成了什么

- Windows 宿主不再只靠硬编码入口，已经开始读取功能件 manifest：
  - `runtimePermissions`
  - `ai.executionMode`
  - `ai.backendHints`
  - `discovery.launchMode`
  - `discovery.slash.commands / aliases / tags / matchers`
- Android 宿主同样切到了 manifest 驱动：
  - 资产入口改成从 `manifest.json` 解析
  - 远程推理请求开始携带 `manifest` / `routing` / `slash`
  - debug contract activity 也同步迁移到了新 manifest API
- host service 现在能消费更完整的宿主上下文：
  - `manifest`
  - `routing`
  - `slash`

## 2. 关键代码落点

- Windows：
  - `TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost/FunctionKitManifestMetadata.cs`
  - `TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost/MainForm.cs`
  - `TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost/FunctionKitHostSnapshot.cs`
- Android：
  - `TODO/ime-research/repos/fcitx5-android/app/build.gradle.kts`
  - `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitManifest.kt`
  - `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
  - `TODO/ime-research/repos/fcitx5-android/app/src/debug/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitContractTestActivity.kt`
- Host service：
  - `TODO/function-kit-host-service/src/server.js`
- SDK 文档：
  - `TODO/function-kit-runtime-sdk/README.md`

## 3. 本次真实验证命令

### 3.1 Windows

```powershell
dotnet build TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost/WindowsFunctionKitHost.csproj
dotnet build TODO/ime-research/windows-testhost/WindowsImeTestHost/WindowsImeTestHost.csproj
node --check TODO/function-kit-host-service/src/server.js
```

结果：

- `WindowsFunctionKitHost`：构建通过
- `WindowsImeTestHost`：构建通过
- `function-kit-host-service`：语法检查通过

### 3.2 Android

当前机器已经存在 Android SDK：

- `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`

Gradle wrapper 默认走 `services.gradle.org` 时会因为 10 秒下载超时失败，所以这次实际采用了本机临时 Gradle：

1. 直接从 `https://downloads.gradle.org/distributions/gradle-9.3.1-bin.zip` 下载发行版
2. 解压到 `%TEMP%\gradle-9.3.1`
3. 用本地 Gradle 执行 Kotlin 编译

本次实际可复用命令：

```powershell
$sdk = Join-Path $env:LOCALAPPDATA "Android\\Sdk"
$env:ANDROID_HOME=$sdk
$env:ANDROID_SDK_ROOT=$sdk
cmd /c "%TEMP%\gradle-9.3.1\bin\gradle.bat :app:compileDebugKotlin"
```

结果：

- `:app:compileDebugKotlin` 通过

## 4. 这次修掉的真实问题

- Windows `FunctionKitManifestMetadata.Load(...)` 存在重复签名，导致宿主项目无法编译
- Windows `BuildRoutingSnapshot(...)` 返回匿名 `object`，后续直接访问 `EffectiveExecutionMode` 会编译失败
- Windows manifest discovery 未解析 regex matcher，但宿主状态快照已经在引用它
- Android `FunctionKitWindow` 仍引用旧的 `FunctionKitManifestLoader` / `entryAssetPath`
- Android manifest 解析后返回的是相对 `ui/app/index.html`，宿主实际需要的是资产路径 `function-kits/chat-auto-reply/ui/app/index.html`
- Android `syncFunctionKitAssets` 重复复制 `manifest.json`，导致 Gradle `duplicate entry` 失败
- Android debug contract activity 仍引用旧 manifest API，导致 `compileDebugKotlin` 失败

## 5. 当前仍然要记住的现实边界

- Windows 两个项目现在都有 `WindowsBase` 版本冲突 warning，但当前不阻塞构建
- Android `FunctionKitWebViewHost.kt` 里 `allowFileAccessFromFileURLs` / `allowUniversalAccessFromFileURLs` 有 deprecation warning，但当前不阻塞构建
- Android slash UI 真正挂到输入栏的交互层，仍应继续接 `KawaiiBarComponent` / `IdleUi`，这次还只是把 manifest / routing / AI 元数据接到了宿主执行层

## 6. 当前可以直接下的结论

- Windows / Android 两端宿主已经开始消费同一份浏览器式功能件 manifest
- AI 路由不再是平台各自随手拼字段，而是有统一 manifest 语义和统一请求快照
- 当前这条主线至少已经被真实编译验证过，不是纸面设计
- 后续如果上下文清空，重新恢复时先看这份文档，再看 `TODO/function-kit-runtime-sdk/README.md`，就能很快知道宿主接入现在处在什么阶段
