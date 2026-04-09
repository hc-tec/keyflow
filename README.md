# IME Function Kit Research & Prototypes

这个仓库用于沉淀「输入法（IME）功能件 / Function Kit」生态相关的调研、SDK、样例功能件，以及与宿主（Android IME）对接过程中形成的验证材料与运行手册。

## 仓库内容

- `TODO/function-kits/`：样例 Function Kits + 面向开发者的文档（Playbook / Developer Guide / Catalog Spec 等）。
- `TODO/function-kit-runtime-sdk/`：Function Kit Browser Runtime SDK（用于 kit 的 UI/host bridge、manifest 约束等）。
- `TODO/ime-research/notes/`：输入法/插件系统的研究笔记与验收 runbook。
- `TODO/ime-research/logs/`：构建与排障日志（用于可复现性记录）。

说明：

- `TODO/ime-research/repos/` 是本地调研时拉取的第三方开源项目/fork 工作区，默认不纳入本仓库版本控制（见 `.gitignore`）。

## 快速开始（Runtime SDK）

```bash
cd TODO/function-kit-runtime-sdk
npm test
```

## 完整环境搭建（KitStudio + Android IME 宿主）

如果你希望从零搭起「KitStudio 调试 + Android IME 宿主运行 + Kits/SDK 开发」的一整套环境，见：

- `docs/DEVELOPMENT.md`

## 开发与贡献

- 贡献指南：`CONTRIBUTING.md`
- 安全问题：`SECURITY.md`
- 支持与反馈：`SUPPORT.md`

## 发布约定

- `keyflow` GitHub Releases 用于发布本项目对外分发物。
- Android APK 只挂在 `keyflow` Releases；`fcitx5-android` 仓库只保留源码与构建说明，不再上传 APK assets。
- `keyflow` 工具链/模板发布继续使用 `v*` tag（例如 `v0.1.0`），不要混挂 Android APK。
- Android APK 发布在 `keyflow` 上使用单独 tag，并显式写明 APK 版本与签名级别：
  - 正式签名：`fcitx5-android-<apkVersion>`
  - debug keystore 测试包：`fcitx5-android-<apkVersion>-debug`
- 正式签名 keystore 的本地生成与保存流程见 `docs/RELEASING.md` 与 `scripts/release/`。
- 具体流程见 `docs/RELEASING.md`。
