# Development Setup (Workspace)

这个项目是一个「Function Kit 生态」的多仓工程。为了让开发者可以从零跑起来，这里把本仓 + KitStudio + Android IME 宿主的完整搭建流程写成一条线。

## 你会用到哪些仓库

- 本仓（Function Kits + Runtime SDK）：
  - Kits：`TODO/function-kits/`
  - Runtime SDK：`TODO/function-kit-runtime-sdk/`
- KitStudio（单独仓库）：本地调试器/开发者工具
- Android IME 宿主（单独仓库）：`fcitx5-android`（含 Function Kit 集成）

## 0. 依赖准备

- Git
- Node.js（建议 LTS，例如 20+）+ npm
- Android 宿主（可选）：Android Studio + SDK/NDK/CMake + `extra-cmake-modules` + `gettext`  
  具体依赖与版本以 `fcitx5-android` 的 `README.md` 为准。

## 1. 推荐目录结构

### 方案 A：本仓 + 两个外部仓（当前最常用）

```
<workspace>/
  keyflow/                    # 本仓（目录名可不同；下文以 keyflow 为例）
  kit-studio/                 # KitStudio 仓库
  fcitx5-android/             # Android IME 宿主仓库
```

### 方案 B：完全拆分为 4 个并列仓库（更贴近开源协作）

```
<workspace>/
  function-kits/
  function-kit-runtime-sdk/
  kit-studio/
  fcitx5-android/
```

> 本仓当前仍是方案 A 的形态（Kits/SDK 在 `TODO/` 下）。如果你采用方案 B，请在各仓 README 的 “Workspace / mounts / env” 小节按需设置环境变量即可。

## 2. Runtime SDK（本仓）

```bash
cd TODO/function-kit-runtime-sdk
npm ci
npm test
```

## 3. KitStudio（单独仓库）

如果你的 workspace 不是「并列四仓」布局，需要用环境变量把 KitStudio 指到本仓的 Kits/SDK 路径。

### Windows（PowerShell）

```powershell
$env:KITSTUDIO_FUNCTION_KITS_ROOT = (Resolve-Path .\\keyflow\\TODO\\function-kits).Path
$env:KITSTUDIO_RUNTIME_SDK_ROOT   = (Resolve-Path .\\keyflow\\TODO\\function-kit-runtime-sdk).Path

cd .\\kit-studio
npm ci
npm run dev
```

打开：

- `http://127.0.0.1:39001/`

### macOS / Linux

```bash
export KITSTUDIO_FUNCTION_KITS_ROOT="$(cd ./keyflow/TODO/function-kits && pwd)"
export KITSTUDIO_RUNTIME_SDK_ROOT="$(cd ./keyflow/TODO/function-kit-runtime-sdk && pwd)"

cd ./kit-studio
npm ci
npm run dev
```

> 具体以 KitStudio 仓库的 README 为准（不同分支/阶段可能脚本名略有差异）。

## 4. Android IME 宿主（fcitx5-android）

`fcitx5-android` 的 Function Kit 打包逻辑会尝试从 workspace 中找到：

- `function-kits/`
- `function-kit-runtime-sdk/`

如果你采用方案 A（本仓路径为 `TODO/...`），需要把 `FUNCTION_KIT_WORKSPACE_ROOT` 指向包含这两个目录的根（也就是本仓的 `TODO/`）。

### Windows（PowerShell）

```powershell
$env:FUNCTION_KIT_WORKSPACE_ROOT = (Resolve-Path .\\keyflow\\TODO).Path

cd .\\fcitx5-android
.\\gradlew.bat :app:assembleDebug
```

> 如果没有配置 workspace（或缺少 kits/runtime），构建仍会成功并自动打包一个 placeholder kit，保证 CI 与新贡献者可直接 build（详见 `fcitx5-android/docs/FUNCTION_KITS.md`）。

## 5. 我应该往哪个仓库提 PR？

- Kit/文档：本仓 `TODO/function-kits/`
- Runtime SDK：本仓 `TODO/function-kit-runtime-sdk/`
- KitStudio：KitStudio 仓库
- Android IME 宿主（Function Kit 集成）：`fcitx5-android` 仓库
