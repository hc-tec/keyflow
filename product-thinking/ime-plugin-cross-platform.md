# 跨平台输入法插件系统：一套插件，Windows + Android 都能用（方案草案）

> 编码：UTF-8  
> 创建时间：2026-03-20T23:30:00+08:00  
> 背景：已确认“插件生态”场景可行（见 `product-thinking/ime-plugin-ecosystem.md`），本文件回答下一问：**如何做跨平台，避免一个插件开发两次**。

## 0. 结论先行（我的主见）

1. **“一套插件两端通用”能做到，但前提是把插件能力收敛成少数稳定原语**：例如“读选中文本/当前句”“生成替换建议”“插入文本”“打开面板”。  
   一旦插件想做“深度系统集成”（读取微信聊天记录、操作系统日程、跨应用自动化），跨平台就必然出现大量平台特化代码。
2. **我最推荐的跨平台插件落地形态是：插件运行在统一的沙箱运行时（Wasm/JS），通过统一协议与输入法宿主通信**；UI 要么走 WebView（快），要么走声明式 UI Schema（稳）。  
3. **IME 是“快系统”，插件/AI 是“慢系统”**：插件必须默认异步、可取消、永不阻塞按键链路；否则输入手感会直接崩。
4. **AI Agent 与 Skills 生态应该作为“慢系统外置大脑”接入，而不是塞进 IME 内核**：输入法负责高频交互与安全边界，复杂任务交给 Agent Gateway（例如 OpenClaw）异步执行（详见 `product-thinking/ime-agent-openclaw-integration.md`）。

---

## 1. 目标与约束（先把边界写死）

### 1.1 目标（MVP）

- 插件开发者只写一次逻辑（同一份 `plugin.wasm` 或 `plugin.js`），即可在 Windows/Android 端复用。
- 插件可以被输入法“显式触发”（按钮/快捷键/选中文本菜单/候选栏动作），返回：
  - 文本建议（替换/追加/改写/翻译/润色/格式化）
  - 可点击动作（复制、插入、追加到词库、创建任务等）
- 插件对输入法拥有**最小必要权限**，可配置且可审计。

### 1.2 不能做/不建议做（至少 MVP 不做）

- 不做“每次按键都调用插件”的同步链路（性能与稳定性不可控）。
- 不把插件当成“全权限系统助手”（这会把输入法变成高风险入口，工程与合规一起爆炸）。

---

## 2. 两种跨平台方案对比（我建议先选 A）

### 方案 A：统一插件运行时 + 统一协议（推荐）

**核心思想**：每个平台的输入法只做“宿主（Host）”，插件跑在统一 Runtime 里，通过消息协议交互。

- 插件语言/运行时：
  - **Wasm**（推荐：Rust/AssemblyScript 编译）：性能稳定、易沙箱化、跨端一致性强。
  - **JS（QuickJS/JSCore/V8 子集）**：开发门槛低，但资源与隔离难度更高。
- Host ↔ Runtime：本地 IPC（Windows Named Pipe / TCP loopback；Android Binder/Unix domain socket/loopback）。
- UI：
  - **WebView 模式**：插件带一套 HTML/JS UI，Windows 用 WebView2，Android 用 WebView。优点：开发快；缺点：安全/性能/一致性要额外治理。
  - **UI Schema 模式**：插件返回 JSON Schema（类似“表单/卡片”），由宿主原生渲染。优点：一致、可控；缺点：表达能力有限但更适合输入法场景。

我认为输入法插件的“高频 UI”并不复杂，**UI Schema 更像最终归宿**；但为了快速试错，MVP 可以先用 WebView。

### 方案 B：依赖各端原生插件机制（不推荐做跨平台）

- Android：每个插件是一个 APK（Fcitx5-Android 现有机制偏这个方向）。
- Windows：COM/TSF 扩展或 DLL 插件。

优点：贴近平台；缺点：**跨平台基本等于两套插件**，且安全模型复杂。

---

## 3. 一个“可落地”的跨平台插件最小协议（建议从这里开始）

### 3.1 插件包结构（示例）

```
plugin.zip
  manifest.json
  main.wasm            # 或 main.js
  assets/...           # 可选：图标、UI 资源
```

`manifest.json` 关键字段（建议）：

- `id` / `version` / `min_host_version`
- `entry`：`main.wasm` / `main.js`
- `permissions`：例如 `read_selection`、`read_context(<=200chars)`、`network`、`clipboard_write`、`open_url`
- `triggers`：`manual_button`、`hotkey`、`selection_menu`

### 3.2 事件与调用（只保留“慢路径”）

输入法 Host 只在这些时机调用插件：

- `onActivate(trigger, context)`：用户显式打开插件（按钮/热键/菜单）。
- `onSelectionChanged(selection)`：可选（仅当插件声明需要）。

插件只返回两类结果：

- `suggestions[]`：`{title, preview, applyAction}`
- `actions[]`：`{title, actionType, payload}`

Host 提供的最小动作 API：

- `insertText(text)` / `replaceSelection(text)`
- `copyToClipboard(text)`
- `openPanel(schemaOrUrl)`
- `toast(message)`

> 关键点：协议必须可版本化（`api_version`），否则你两端同时演进会把插件生态直接搞死。

---

## 4. “同一插件”为什么仍可能要写平台特化（提前说清楚，避免自嗨）

即使插件逻辑跨平台，下面这些能力**天然更像平台能力**：

- 读取微信聊天记录：Android 可能需要辅助功能/通知监听/无障碍；Windows 需要注入/抓 UIA/本地数据库解析；几乎不可能“一套代码”搞定。
- 日程/待办：Android 是 Calendar Provider；Windows 是 Outlook/Graph/本地日历；权限/账号体系完全不同。

我建议把这类能力拆成两层：

1. **插件逻辑层（跨平台）**：只会调用 `host.getTimeline()`、`host.getPersonProfile()` 这类抽象 API。  
2. **平台适配层（各端实现）**：由宿主（或一个“跨端伴随服务”）去做真实集成。

这样做的结果不是“完全不用写两次”，而是**把两次写的部分收敛到宿主适配层**，插件本体仍可复用。

---

## 5. 最大挑战（我认为真正会卡死你的点）

1. **安全与信任是第一性**：输入法能看到你输入的一切。只要允许第三方插件执行代码，你就等于引入“键盘级权限”的供应链风险。  
   MVP 就应该至少具备：权限声明、默认禁用网络、日志脱敏、可一键禁用/卸载、崩溃隔离。
2. **性能与稳定性**：插件不能阻塞按键链路；最稳的做法是 Runtime 独立进程 + 超时取消 + 降级（失败就当没发生）。
3. **跨端 UI 一致性**：WebView 省事但坑很多；Schema 受限但可控。输入法场景“可控”更重要。
4. **协议演进与兼容**：插件生态一旦形成，API 变更成本极高。必须从第一天就做版本号与兼容策略。

---

## 6. 我建议的实施路线（Windows + Android 聚焦）

1. **先做“Text Action 插件”闭环**：选中文本 -> 打开插件 -> 返回替换建议 -> 一键应用（两端一致）。  
2. Runtime 先选 **Wasm**：
   - Windows：独立 `plugin-runtime.exe`（Wasm 运行 + 权限控制 + HTTP 代理）。
   - Android：独立进程 `:plugin_runtime`（同样的运行内核，JNI/NDK or Kotlin 包装）。
3. UI 先用 **Schema**（少量组件：文本、按钮、列表、输入框），避免 WebView 的重量级依赖；必要时再给少数插件开放 WebView。
4. 再逐步扩展能力：
   - LLM（慢路径按钮触发）
   - 语音（ASR 单独服务，不放进按键链路）
   - 词库/用户画像等（强隐私、需要严控权限）

---

## 7. 与现有开源底座的关系（避免走弯路）

- **Fcitx5-Android 的“插件 APK”机制**适合做“功能模块化与可选安装”，但它不是“跨平台插件一次开发”。  
  你可以继续把它当 Android 端的模块化手段，但跨平台插件建议另起一套“Runtime + 协议”。
- 如果你最终选择 **Rime 引擎作为跨端事实标准**，也可以把一部分“插件”下沉到 Rime 的配置/脚本体系（更接近“输入逻辑插件”），再用上面的 Runtime 体系补齐“产品插件”（面板、工作流）。

---

## 8. Agent 与 Skills（别忘了你最初想要的“入口魔力”）

如果你要的是“输入法作为 AI 入口/工作流入口”，插件系统不应只解决“扩展功能”，还要解决：

- **意图 → 计划 → 执行 → 回填** 的闭环（这就是 Agent/Skills 的价值）
- 但前提是：Agent 永远走 **显式触发 + 异步回填 + 可撤销/可审计**，不能进入每键主链路

把 OpenClaw 这类系统当作“外置大脑”的集成方式与 Skills→插件映射建议，见：`product-thinking/ime-agent-openclaw-integration.md`。
