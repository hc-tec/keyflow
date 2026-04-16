# keyflow

`keyflow` 是一个围绕输入法（IME）功能件 / Function Kit 生态构建的项目。

这个仓库主要沉淀：

- Function Kits 与开发者文档
- Runtime SDK
- 与宿主（Android IME）对接时形成的验证材料与运行手册

Android 宿主仓库在：

- [hc-tec/fcitx5-android](https://github.com/hc-tec/fcitx5-android)

## 仓库内容

- `TODO/function-kits/`：样例 Function Kits + 面向开发者的文档（Playbook / Developer Guide / Catalog Spec 等）。
- `TODO/function-kit-runtime-sdk/`：Function Kit Browser Runtime SDK（用于 kit 的 UI/host bridge、manifest 约束等）。
- `TODO/ime-research/notes/`：输入法/插件系统的研究笔记与验收 runbook。
- `TODO/ime-research/logs/`：构建与排障日志（用于可复现性记录）。

说明：

- `TODO/ime-research/repos/` 是本地调研时拉取的第三方开源项目/fork 工作区，默认不纳入本仓库版本控制（见 `.gitignore`）。

## Function Kits（功能件）开发入口

如果你打开这个仓库是为了「写一个功能件」，从这几个入口开始最不容易迷路：

- 功能件索引（现有 kits + 下一步该做什么）：[TODO/function-kits/INDEX.md](TODO/function-kits/INDEX.md)
- 从 0 创建一个 kit：`npx @keyflow2/create-function-kit <dir> --kit-id <scope>.<slug> --name "..."`（详见 [templates/create-function-kit/README.md](templates/create-function-kit/README.md)）
- 开发手册（manifest / host bridge / lifecycle / 打包）：[TODO/function-kits/DEVELOPER_GUIDE.md](TODO/function-kits/DEVELOPER_GUIDE.md)
- 选题与待办（不知道做什么就从这里挑）：[TODO/function-kits/IDEA_BANK.md](TODO/function-kits/IDEA_BANK.md)、[TODO/function-kits/DEVELOPER_PLATFORM_GAPS.md](TODO/function-kits/DEVELOPER_PLATFORM_GAPS.md)
- 发布与上架（npm + 官方 catalog）：[scripts/npm/README.md](scripts/npm/README.md)、[catalog/README.md](catalog/README.md)

如果你是外部开发者，不打算 clone `keyflow` 仓库，当前推荐路径就是：

```powershell
npx @keyflow2/create-function-kit my-launchpad --kit-id yourscope.launchpad --name "Launchpad"
cd .\my-launchpad
npm run open:kitstudio
npm run doctor
```

生成后的工作区已经自带完整的本地入口：

- `npm run doctor`
- `npm run pack:zip`
- `npm run pack:npm`
- `npm run publish:npm`
- `npm run catalog:entry`

也就是说，starter + KitStudio 已经覆盖：

- 本地预览
- 本地自检
- ZIP 打包
- npm 打包 / 发布
- 官方 catalog 提交片段生成

对应说明在生成项目内的：

- `docs/WORKFLOW.md`
- `docs/PLATFORM_COMPATIBILITY.md`

## 快速开始（Runtime SDK）

```bash
cd TODO/function-kit-runtime-sdk
npm test
```

## 完整环境搭建（KitStudio + Android IME 宿主）

如果你希望从零搭起「KitStudio 调试 + Android IME 宿主运行 + Kits/SDK 开发」的一整套环境，见：

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- Android IME 宿主仓库：[hc-tec/fcitx5-android](https://github.com/hc-tec/fcitx5-android)

## 开发与贡献

- 贡献指南：`CONTRIBUTING.md`
- 安全问题：`SECURITY.md`
- 支持与反馈：`SUPPORT.md`

## License Scope

- 除非另有说明，`keyflow` 根仓库的代码与文档使用 `Apache-2.0`，见 [LICENSE](LICENSE)。
- Android APK release 仍然回指 `hc-tec/fcitx5-android` 源码仓库，并按 `LGPL-2.1-or-later` 处理；不要把根仓库的 `Apache-2.0` 误认为 APK 许可证。
- 第三方 vendored 资产与单独许可边界见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。

## 发布约定

- `keyflow` GitHub Releases 用于发布本项目对外分发物。
- Android APK 只挂在 `keyflow` Releases；`fcitx5-android` 仓库（[hc-tec/fcitx5-android](https://github.com/hc-tec/fcitx5-android)）只保留源码与构建说明，不再上传 APK assets。
- `keyflow` 工具链/模板发布继续使用 `v*` tag（例如 `v0.1.0`），不要混挂 Android APK。
- Android APK 发布在 `keyflow` 上使用 `keyflow-` 开头的单独 tag，并显式写明 APK 版本与签名级别：
  - 正式签名：`keyflow-<apkVersion>`
  - debug keystore 测试包：`keyflow-<apkVersion>-debug`
- Android APK assets 的文件名前缀统一使用 `keyflow-`，例如：
  - 正式签名：`keyflow-<apkVersion>-<abi>-release.apk`
  - debug keystore 测试包：`keyflow-<apkVersion>-<abi>-release-debug.apk`
  - 如果一个 release 同时发布多个包型，请保留包型 slug：
    - `keyflow-<apkVersion>-standard-<abi>-release.apk`
    - `keyflow-<apkVersion>-voice-<abi>-release.apk`
- 正式签名 keystore 的本地生成与保存流程见 [docs/RELEASING.md](docs/RELEASING.md) 与 `scripts/release/`。
- 具体流程见 [docs/RELEASING.md](docs/RELEASING.md)。

## 致谢

本项目受 [LINUX DO](https://linux.do/) 社区启发和支持。
