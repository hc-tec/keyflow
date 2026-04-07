# 并行工作流（2026-03-21）

> 编码：UTF-8
> 创建时间：2026-03-21T20:25:00+08:00
> 更新时间：2026-03-21T20:25:00+08:00
> 目标：把当前阶段适合并行推进的工作流固定下来，避免后续上下文丢失。

## 当前并行主线

### 1. Windows 浏览器式功能件宿主

- 目标：在 Windows 侧验证 `WebView2` 承载功能件面板的现实接法
- 范围：
  - `TODO/ime-research/windows-testhost/`
  - `TODO/function-kits/chat-auto-reply/ui/`
- 核心问题：
  - 侧边栏/弹出层怎么挂进当前宿主
  - Host Bridge 怎么接 `insert/replace/regenerate`
  - 不破坏当前 IME 测试宿主

### 2. Android 浏览器式功能件宿主

- 目标：在 `fcitx5-android` 主线上确认扩展面板 `WebView` 的落点
- 范围：
  - `TODO/ime-research/repos/fcitx5-android/`
  - `TODO/function-kits/chat-auto-reply/ui/`
- 核心问题：
  - 哪个面板/页面最适合承载功能件 UI
  - 如何避免和主键盘输入链路互相抢焦点
  - 宿主与功能件之间的消息桥落在哪里

### 3. 功能件桥接与测试契约

- 目标：把浏览器式 UI 的 Host Bridge、fixture、测试面固定下来
- 范围：
  - `TODO/function-kits/`
  - `TODO/ime-research/notes/`
- 核心问题：
  - Web UI 和宿主的消息格式
  - 可复用的 fixture / snapshot / runtime tests
  - Windows / Android 共用什么，平台特化什么

## 当前状态

- 已完成：浏览器式 UI 方向调研、功能件前端骨架、TODO 更新
- 正在进行：并行分派 3 条子任务
- 下一步：回收子任务结论，合并进总方案与实现计划

## 当前 agent 分工

### Windows 浏览器式宿主

- agent：`019d0ff2-ddd3-7a01-a31a-3d7ad21b3574`
- 昵称：`Laplace`
- 负责范围：
  - `TODO/ime-research/windows-testhost/`
  - `TODO/ime-research/notes/20260321_windows_webview2_functionkit_host.md`

### Android 浏览器式宿主

- agent：`019d0ff2-df69-71e3-bf5b-cd2846d0d281`
- 昵称：`Dalton`
- 负责范围：
  - `TODO/ime-research/repos/fcitx5-android/` 内新增文档
  - `TODO/ime-research/notes/20260321_android_functionkit_host.md`

### 功能件桥接与测试契约

- agent：`019d0ff2-e106-7821-ad11-7c9a92233581`
- 昵称：`Huygens`
- 负责范围：
  - `TODO/function-kits/`
  - `TODO/ime-research/notes/20260321_functionkit_bridge_and_test_contracts.md`
