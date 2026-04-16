# Function Kits Index

> 编码：UTF-8
> 创建时间：2026-03-21T17:05:00+08:00
> 更新时间：2026-03-31T00:00:00+08:00
> 范围：输入法上层功能件骨架、协议、测试资产

## 当前功能件

- 聊天自动回复 MVP：`TODO/function-kits/chat-auto-reply/README.md`
- 常用短语本地样板：`TODO/function-kits/quick-phrases/README.md`
- Runtime Lab（最近改动手动验收）：`TODO/function-kits/runtime-lab/README.md`
- File Upload Lab（文件选择 + 上传验收）：`TODO/function-kits/file-upload-lab/ui/README.md`
- IME Hooks（输入监听/拦截验收）：`TODO/function-kits/ime-hooks/`

## 制作流程（你要写新功能件先看这里）

- Starter 模板（npm 包 + KitStudio 一键预览）：`TODO/function-kits/STARTER_TEMPLATE.md`
- 开发者平台缺口与优先级：`TODO/function-kits/DEVELOPER_PLATFORM_GAPS.md`
- 功能件开发者手册（WebView 约束/打包/导包/Bindings/结果呈现/生命周期）：`TODO/function-kits/DEVELOPER_GUIDE.md`
- 平台差异短表（给 starter / 外部开发者看的简版）：`templates/function-kit-template-petite-vue/docs/PLATFORM_COMPATIBILITY.md`
- 总手册（做什么/怎么做/怎么验收/怎么推广/怎么维护 SDK 文档）：`TODO/function-kits/PLAYBOOK.md`
- Bindings 调研与方案（解决“入口与结果呈现”的矛盾）：`TODO/function-kits/BINDINGS_UX_RESEARCH.md`
- 场景与选题库（用于选下一件做什么）：`TODO/function-kits/IDEA_BANK.md`
- 功能件产品调研索引（含 20 个候选包）：`TODO/function-kits/product-research/INDEX.md`
- Brief 模板（写代码前必填）：`TODO/function-kits/BRIEF_TEMPLATE.md`
- 宣发与增长：`TODO/function-kits/LAUNCH_PLAYBOOK.md`

## 分发与安装

- Kit 安装包 ZIP 规范：`TODO/function-kits/KIT_PACKAGE_SPEC.md`
- Kit 目录（Catalog）API 规范：`TODO/function-kits/KIT_CATALOG_SPEC.md`
- 功能件商店（真正 Store）方案与路线：`TODO/function-kits/store/INDEX.md`
- 下载中心/商店 UI 作为“内置 Store Kit（Web UI）”的调研与接口提案：`TODO/function-kits/store/DOWNLOAD_CENTER_AS_KIT.md`
- 分发/IP（zip 可读的现实 + 对标浏览器扩展 + 建议路线）：`TODO/function-kits/DISTRIBUTION_AND_IP.md`

## 共享 SDK

- SDK 仓库种子：`TODO/function-kit-runtime-sdk/README.md`
- SDK 包描述：`TODO/function-kit-runtime-sdk/package.json`
- SDK 浏览器 bundle：`TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js`
- Windows WebView2 Host PoC：`TODO/ime-research/windows-functionkit-host/README.md`

## 通用协议

- Host Bridge 协议：`TODO/function-kits/host-bridge/README.md`
- Host Bridge 消息 schema：`TODO/function-kits/host-bridge/message-envelope.schema.json`
- Host Bridge 错误 schema：`TODO/function-kits/host-bridge/error.schema.json`

## 约定

- 功能件目录至少应包含：
  - `manifest.json`
  - `ui/app/index.html`
  - `ui/app/main.js`
  - `ui/app/styles.css`
  - `ui/README.md`
- 功能件图标建议使用浏览器插件风格的 `icons` 字段声明，当前 Android 宿主已支持从功能件目录加载：
  - `png`
  - `jpg` / `jpeg`
  - `webp`
  - `bmp`
  - `ico`
- 建议直接准备一套固定规格，至少：
  - `48`
  - `64`
  - `96`
  - `128`
  - `256`
- 示例：
  - `"icons": { "48": "icons/icon-48.png", "64": "icons/icon-64.png", "96": "icons/icon-96.png", "128": "icons/icon-128.png", "256": "icons/icon-256.png" }`
- 批量生成可直接用：
  - `python tmp/build_function_kit_icon_set.py --src tmp/my-kit-logo.png --kit-dir TODO/function-kits/<kitId>`
- AI / Agent 型功能件应额外提供：
  - `skills/<name>/SKILL.md`
  - `tools/<tool-name>/input.schema.json`
  - `tools/<tool-name>/output.schema.json`
  - `tests/fixtures/`
- 纯本地功能件可以不依赖 skills / tools；例如 `quick-phrases` 只验证本地存储、上下文读取与输入回写。
- 功能件 UI 与宿主统一通过 Host Bridge 消息桥交互，消息外层使用统一 envelope。
- Tool 输入输出继续用 schema；UI 不再走 schema-first，而是走本地 HTML/CSS/JS 浏览器式面板。
- 功能件层尽量保持跨平台，平台差异压到 Windows / Android Host Adapter。
- 浏览器式功能件前端应统一接入 `FunctionKitRuntimeSDK`，避免 Windows / Android 各维护一套桥接逻辑。
