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
