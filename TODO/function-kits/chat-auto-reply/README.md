# Chat Auto Reply Function Kit

> 编码：UTF-8
> 创建时间：2026-03-21T17:05:00+08:00
> 更新时间：2026-03-21T23:35:00+08:00
> 目标：给输入法的第一个功能件提供可持续扩展的骨架、协议与测试资产。

## 1. 这是什么

这是第一个固定功能件骨架，目标不是“现在就接微信”，而是先把最小协议定死：

- 输入：当前收到的消息、最近上下文、联系人画像、全局画像、回复约束
- 输出：多条候选回复、每条候选的理由、风险标签、后续动作

它是一个**通用聊天自动回复功能件**，不是绑定某个具体聊天 App。

## 2. 为什么先做这个

这是当前最通用、最接近杀手场景的功能件：

- 用户直接感知价值
- 非常适合候选栏展示
- 天然适合 Agent + Skills + Tool 的组合
- Windows 和 Android 都需要它

## 3. 目录

- 清单：`TODO/function-kits/chat-auto-reply/manifest.json`
- Skill：`TODO/function-kits/chat-auto-reply/skills/chat-auto-reply/SKILL.md`
- Tool 输入 schema：`TODO/function-kits/chat-auto-reply/tools/reply-generator/input.schema.json`
- Tool 输出 schema：`TODO/function-kits/chat-auto-reply/tools/reply-generator/output.schema.json`
- 通用 Host Bridge：`TODO/function-kits/host-bridge/README.md`
- 共享运行时 SDK：`TODO/function-kit-runtime-sdk/README.md`
- UI 运行时说明：`TODO/function-kits/chat-auto-reply/ui/README.md`
- 浏览器式面板入口：`TODO/function-kits/chat-auto-reply/ui/app/index.html`
- 浏览器式面板脚本：`TODO/function-kits/chat-auto-reply/ui/app/main.js`
- 浏览器式面板样式：`TODO/function-kits/chat-auto-reply/ui/app/styles.css`
- 测试说明：`TODO/function-kits/chat-auto-reply/tests/README.md`
- 测试夹具：
  - `TODO/function-kits/chat-auto-reply/tests/fixtures/request.basic.json`
  - `TODO/function-kits/chat-auto-reply/tests/fixtures/response.basic.json`
  - `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.host-to-ui.ready-ack.basic.json`
  - `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.host-to-ui.permissions.basic.json`
  - `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.host-to-ui.render.basic.json`
  - `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.ui-to-host.insert.basic.json`
  - `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.host-to-ui.storage-sync.basic.json`
  - `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.host-to-ui.permission-denied.basic.json`
  - `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.host-to-ui.error.basic.json`
  - `TODO/function-kits/chat-auto-reply/tests/fixtures/runtime.snapshot.panel.basic.json`

## 4. Host Adapter 该怎么接

Windows / Android 输入法 Host Adapter 后续统一按这个顺序：

1. 取当前目标输入框上下文
2. 打开浏览器式功能件面板：
   - Windows：原生壳 + `WebView2`
   - Android：原生键盘壳 + 扩展面板 `WebView`
3. 组装 `reply-generator` 的输入 JSON
4. 调用 Agent-only `openclaw agent --local --json`
5. 把 Agent 返回结果映射成 `reply-generator` 输出 JSON
6. 通过 Host Bridge 把结果推给浏览器式面板
7. 用户点击其中一个候选后，显式插入目标输入框

固定的 Host Bridge 消息序列：

1. UI -> Host：`bridge.ready`
2. Host -> UI：`bridge.ready.ack`
3. UI -> Host：`context.request`
4. Host -> UI：`context.sync`
5. Host -> UI：`candidates.render`
6. UI -> Host：`candidate.insert` / `candidate.replace` / `candidates.regenerate`
7. Host -> UI：`host.state.update` 或 `bridge.error`

这里的关键约束是：

- 两端都必须通过同一套 `FunctionKitRuntimeSDK`
- 两端都必须收发同一套 Host Bridge 消息
- 业务前端不允许直接依赖 `WebView2` 或 Android 专有注入对象

## 5. 当前边界

- 现在还不直接接真实微信消息拉取
- 现在还不自动发送
- 现在只定义协议、浏览器式 UI 容器、Skill 和测试资产
- 当前 OpenClaw auth 没就位，所以这一层先以 fixture 驱动
- 当前浏览器式 UI 已经实际跑通：
  - 页签切换
  - `storage.get/set`
  - `panel.state.update`
  - 浏览器预览 mock host
  - 候选 `actions[]` 驱动按钮渲染
  - Windows `WebView2` contract runner

## 6. 后续怎么扩

优先扩这 4 个方向：

1. 联系人差异化语气
2. 全局 persona / 禁忌词 / 绝不承诺清单
3. 风险分级（过度承诺、情绪失控、泄露隐私）
4. “换一批候选”与“改短一点 / 改强硬一点 / 改温柔一点”

## 7. 关键判断

- Tool 输出必须结构化；这仍然保留 schema。
- UI 不再定义成 `panel.schema.json` 这种声明式布局文件。
- 真正要跨平台复用的是：浏览器式前端 bundle + Host Bridge 协议。
- Android 不应把整个键盘做成 `WebView`；只把功能件扩展面板做成浏览器式 UI。
- Windows / Android 的前端代码必须保持一份，统一通过 `TODO/function-kit-runtime-sdk/` 接宿主。

## 8. Bridge 与测试最小闭环

- `request.basic.json` 是 Tool 输入 fixture
- `response.basic.json` 是 Tool 输出 fixture
- `bridge.host-to-ui.render.basic.json` 把 Tool 输出包装成真正的宿主消息
- `bridge.ui-to-host.insert.basic.json` 固定点击候选后的上行消息形态
- `runtime.snapshot.panel.basic.json` 固定浏览器式面板渲染后的断言面
- `TODO/ime-research/scripts/run_windows_testhost.ps1 -Mode contract` 会把这些 fixture 真正回放到 `WebView2`
