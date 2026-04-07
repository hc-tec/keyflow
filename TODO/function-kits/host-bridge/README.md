# Function Kit Host Bridge Protocol

> 编码：UTF-8
> 创建时间：2026-03-21T20:45:00+08:00
> 更新时间：2026-04-01T00:00:00+08:00
> 目标：固定浏览器式功能件 UI 与 Windows / Android Host Adapter 共用的消息桥协议。

## 1. 结论

- 所有浏览器式功能件 UI 都走统一 Host Bridge。
- 所有消息都必须包在统一 envelope 中。
- Tool schema 约束“业务数据”；Host Bridge 约束“宿主与 UI 的通信形态”。
- 浏览器页面不直接手写平台桥接，统一通过 `TODO/function-kit-runtime-sdk/` 暴露的 SDK 调用 Host Bridge。

## 2. Envelope

每条消息都必须长这样：

```json
{
  "version": "1.0.0",
  "messageId": "msg-001",
  "timestamp": "2026-03-21T20:45:00+08:00",
  "kitId": "chat-auto-reply",
  "surface": "panel",
  "source": "function-kit-ui",
  "target": "host-adapter",
  "type": "bridge.ready",
  "payload": {}
}
```

固定字段：

- `version`
- `messageId`
- `timestamp`
- `kitId`
- `surface`
- `source`
- `target`
- `type`
- `payload`

可选字段：

- `replyTo`
- `error`

## 3. 标准消息类型

### UI -> Host

- `bridge.ready`
- `context.request`
- `candidate.insert`
- `candidate.replace`
- `input.commitImage`
- `candidates.regenerate`
- `network.fetch`
- `files.pick`
- `files.download`
- `files.getUrl`
- `ai.request`
- `ai.agent.list`
- `ai.agent.run`
- `kits.sync.request`
- `kits.install`
- `kits.uninstall`
- `kits.settings.update`
- `catalog.sources.get`
- `catalog.sources.set`
- `catalog.refresh`
- `tasks.sync.request`
- `task.cancel`
- `composer.open`
- `composer.focus`
- `composer.update`
- `composer.close`
- `settings.open`
- `storage.get`
- `storage.set`
- `panel.state.update`

### Host -> UI

- `bridge.ready.ack`
- `binding.invoke`
- `context.sync`
- `candidates.render`
- `network.fetch.result`
- `files.pick.result`
- `files.download.result`
- `files.getUrl.result`
- `ai.response`
- `ai.agent.list.result`
- `ai.agent.run.result`
- `kits.sync`
- `kits.install.result`
- `kits.uninstall.result`
- `kits.settings.update.result`
- `catalog.sources.sync`
- `catalog.sync`
- `task.update`
- `tasks.sync`
- `task.cancel.ack`
- `composer.state.sync`
- `storage.sync`
- `panel.state.ack`
- `permissions.sync`
- `permission.denied`
- `host.state.update`
- `bridge.error`

## 4. 交互顺序

1. UI 启动后发送 `bridge.ready`
2. Host 返回 `bridge.ready.ack`
3. UI 发送 `context.request`
4. Host 发送 `context.sync`
5. Host 拿到 Tool 结果后发送 `candidates.render`
6. UI 如需网络 / AI 等能力，继续发送对应请求消息
7. Host 通过 `network.fetch.result` / `ai.*` / `composer.*` / `host.state.update` / `bridge.error` 回传状态

## 4.1 binding.invoke（Host -> UI）

宿主把“一次性上下文 payload”注入到 Kit（类似浏览器插件的 context menu action）。

payload 最小形态：

```jsonc
{
  "invocationId": "invk-uuid",
  "trigger": "clipboard|selection|manual",
  "binding": { "id": "clipboard.summarize", "title": "Summarize Clipboard" },
  "context": { "sourcePackage": "com.example.app" },
  "requestedPayloads": ["clipboard.text"],
  "providedPayloads": ["clipboard.text"],
  "payloadLimits": { "cursorContextChars": 256, "selectionTextMaxChars": 8192, "clipboardTextMaxChars": 8192 },
  "payloadTruncated": false,
  "missingPermissions": [],
  "clipboardText": "…",
  "createdAtEpochMs": 1711370000000
}
```

## 4.2 Tasks（任务中心）

宿主会把“耗时任务”归一到 Task Center：

- `task.update`：宿主推送单个 task 的状态变化
- `tasks.sync.request` / `tasks.sync`：UI 主动拉取 task 列表快照（running + history）
- `task.cancel` / `task.cancel.ack`：UI 请求取消一个 task

task 对象里建议包含：

- `taskId`：唯一 id
- `kind`：机器可读的任务类型（开发者信息里可见）
- `title`：**用户可读的任务名称**（强烈建议功能件提供，避免用户看到 `ai.request/network.fetch` 这类接口名）
- `status`：`queued|running|canceling|succeeded|failed|canceled`
- `progress/result/error`：可选，给 UI/日志用

## 5. 错误约定

- 所有错误都用 `bridge.error`
- `error.code` 必须稳定，可用于自动化断言
- `error.message` 给人看
- `error.retryable` 决定 UI 是否展示“重试”
- `error.details` 仅用于调试和日志

## 6. 会话与权限

- `bridge.ready.ack` 应返回：
  - `sessionId`
  - `grantedPermissions[]`
  - `hostInfo`
- UI 只能调用被授予的能力
- 未授予能力统一返回 `permission.denied`

建议权限粒度：

- `context.read`
- `input.insert`
- `input.replace`
- `input.commitImage`
- `candidates.regenerate`
- `settings.open`
- `storage.read`
- `storage.write`
- `panel.state.write`
- `network.fetch`
- `ai.request`
- `ai.agent.run`

注意：

- `composer.*` 是内部输入桥接协议（用于 WebView 内部输入框与宿主键盘路由），不作为功能件可声明/可授权的 runtime permission。

## 7. 平台要求

Windows 与 Android 都必须满足：

- 都能把宿主消息注入 Web UI
- 都能接收 UI 发回的 envelope
- 都能基于 `candidate.insert` / `candidate.replace` 执行显式写回
- 都不能让功能件 UI 直接绕开宿主改目标输入框

## 8. 自动化测试最低要求

- 消息 envelope 结构校验
- `bridge.ready -> bridge.ready.ack` 握手校验
- `context.sync -> candidates.render` 回放测试
- `candidate.insert` / `candidate.replace` 输出断言
- `storage.get/set -> storage.sync` 回放测试
- `permission.denied` 恢复与提示断言
- `bridge.error` 展示与恢复断言
