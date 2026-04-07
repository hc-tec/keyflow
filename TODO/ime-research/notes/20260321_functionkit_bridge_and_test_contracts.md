# 功能件 Host Bridge 与测试契约（2026-03-21）

> 编码：UTF-8
> 创建时间：2026-03-21T20:50:00+08:00
> 更新时间：2026-03-21T21:05:00+08:00
> 范围：浏览器式功能件 UI、Windows + Android Host Adapter、桥接协议、fixture、snapshot、runtime tests

## 1. 结论先说死

这一层现在不再模糊。

固定下来的是：

1. 浏览器式功能件 UI 和宿主之间只走 **Host Bridge**
2. Host Bridge 的所有消息都必须包在统一 **envelope**
3. Tool schema 继续约束业务输入输出
4. Host Bridge 约束的是 **UI <-> Host** 通信，而不是 Agent 结果本身
5. Windows / Android 共享同一套消息类型和 fixture 语义
6. 浏览器页面通过 `FunctionKitRuntimeSDK` 调宿主，而不是各端各写一套桥接代码

一句话：

- Tool 负责“算什么”
- Host Bridge 负责“怎么把结果送到 UI、怎么把用户动作送回宿主”

## 2. 已固定的协议资产

### 2.1 通用协议

- 协议说明：`TODO/function-kits/host-bridge/README.md`
- 消息 schema：`TODO/function-kits/host-bridge/message-envelope.schema.json`
- 错误 schema：`TODO/function-kits/host-bridge/error.schema.json`
- SDK 仓库种子：`TODO/function-kit-runtime-sdk/README.md`

### 2.2 当前样板功能件

- 功能件说明：`TODO/function-kits/chat-auto-reply/README.md`
- UI 运行时说明：`TODO/function-kits/chat-auto-reply/ui/README.md`
- 浏览器式面板脚本：`TODO/function-kits/chat-auto-reply/ui/app/main.js`
- 测试说明：`TODO/function-kits/chat-auto-reply/tests/README.md`

## 3. 标准消息类型

### UI -> Host

- `bridge.ready`
- `context.request`
- `candidate.insert`
- `candidate.replace`
- `candidates.regenerate`
- `settings.open`

### Host -> UI

- `bridge.ready.ack`
- `context.sync`
- `candidates.render`
- `host.state.update`
- `bridge.error`

这里我刻意没有让 UI 直接发：

- “直接改目标输入框”
- “直接自动发送消息”
- “直接自己拉远程页面”

这些都必须经过宿主。

## 4. Envelope 为什么必须统一

如果不统一 envelope，后面一定会出 3 个问题：

1. Windows / Android 宿主各自发不同消息格式
2. Web UI 运行时要写两套甚至三套适配代码
3. 自动化测试没法做共用回放

统一 envelope 后，共用层可以直接复用：

- fixture
- snapshot
- runtime replay
- 错误处理

这就是跨平台真正能省下来的地方。

## 5. `chat-auto-reply` 现在怎么接

这次已经把 `chat-auto-reply` 接到统一协议上：

- `manifest.json` 明确引用通用 Host Bridge schema
- `ui/app/main.js` 改成按 envelope 收发消息
- UI 内部固定处理：
  - `bridge.ready.ack`
  - `context.sync`
  - `candidates.render`
  - `host.state.update`
  - `bridge.error`
- UI 发回固定动作：
  - `candidate.insert`
  - `candidate.replace`
  - `candidates.regenerate`
  - `settings.open`

也就是说，Windows / Android 只要把本地宿主接到这套消息上，就能共用同一个浏览器式 UI。

## 6. 这次新增的 fixture

### Tool 层

- `TODO/function-kits/chat-auto-reply/tests/fixtures/request.basic.json`
- `TODO/function-kits/chat-auto-reply/tests/fixtures/response.basic.json`

### Bridge 层

- `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.host-to-ui.ready-ack.basic.json`
- `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.host-to-ui.render.basic.json`
- `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.ui-to-host.insert.basic.json`
- `TODO/function-kits/chat-auto-reply/tests/fixtures/bridge.host-to-ui.error.basic.json`

### Runtime snapshot

- `TODO/function-kits/chat-auto-reply/tests/fixtures/runtime.snapshot.panel.basic.json`

这里的关系很关键：

- `response.basic.json` 是 Tool 输出
- `bridge.host-to-ui.render.basic.json` 是 Host 真正送给 UI 的消息
- `runtime.snapshot.panel.basic.json` 是 UI 渲染后的断言面

这能把 Tool 测试、桥接测试、UI 测试串起来。

## 7. Runtime tests 现在应该怎么做

最低必须有 4 类：

### 7.1 Envelope contract tests

断言：

- 所有消息都符合 `message-envelope.schema.json`
- 错误都符合 `error.schema.json`

### 7.2 Replay tests

做法：

1. 回放 `bridge.ready.ack`
2. 回放 `candidates.render`
3. 断言页面状态与 `runtime.snapshot.panel.basic.json` 一致

### 7.3 Action emission tests

做法：

1. 点击候选“插入”
2. 断言 UI 发出 `candidate.insert`
3. 点击“换一批”
4. 断言 UI 发出 `candidates.regenerate`

### 7.4 Error state tests

做法：

1. 注入 `bridge.error`
2. 断言错误条展示 code / message
3. 断言 UI 不会自己直接改目标输入框

## 8. Windows / Android 真正共用什么

共用：

- 浏览器式前端 bundle
- Host Bridge 消息类型
- Tool I/O fixture
- Bridge fixture
- Runtime snapshot
- 错误码

不共用：

- Web UI 注入方式
  - Windows：`WebView2`
  - Android：`WebView`
- 最终写回目标输入框的原生实现
- 焦点恢复与安全边界

这就是我认为现实可行的拆法。

## 9. 还没闭环的阻塞

当前这条线仍然有 3 个明确阻塞：

1. 还没有真正的 Windows Host Adapter 实现去消费这些 envelope
2. 还没有真正的 Android Host Adapter 实现去消费这些 envelope
3. 还没有把 runtime replay 跑成自动化测试脚本，只是先把协议和 fixture 固定了

这不是坏事。

现在的价值在于：**协议已经定死，后面的宿主实现不会再各搞各的。**

## 10. 我的判断

这里最重要的不是“多写几个文档”，而是现在开始能避免两个典型错误：

1. Windows 和 Android 各自发一套桥接消息，后面根本合不起来
2. UI 代码先随手写，最后测试根本没法做稳定回放

我现在的判断很明确：

- 这次固定下来的 Host Bridge 足够支撑第一批功能件
- `chat-auto-reply` 已经可以作为 Windows / Android 共用桥接样板
- 下一阶段最该做的是两个宿主各自接上这套 envelope，然后跑真实 replay / commit 链路
