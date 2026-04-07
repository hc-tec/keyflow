# Function Kit Runtime SDK Capabilities

> 编码：UTF-8
> 创建时间：2026-03-21T21:35:00+08:00
> 更新时间：2026-03-30T17:40:16+08:00

## 当前能力

- `context.read`
- `input.insert`
- `input.replace`
- `input.commitImage`
- `input.observe.best_effort`
- `candidates.regenerate`
- `settings.open`
- `storage.read`
- `storage.write`
- `files.pick`
- `files.download`
- `panel.state.write`
- `runtime.message.send`
- `runtime.message.receive`
- `network.fetch`
- `ai.request`
- `kits.manage`
- `send.intercept.ime_action`
- `ai.agent.list`
- `ai.agent.run`

说明：

- `kits.manage` / `files.download` 属于“商店/下载中心”级别的特权能力，建议仅授予内置 Store Kit（或签名可信的系统 kit）。

## 浏览器式 API 映射

- `kit.context.refresh(...)`
- `kit.input.insert(...)`
- `kit.input.replace(...)`
- `kit.input.commitImage(...)`
- `kit.input.observeBestEffort(...)`
- `kit.candidates.regenerate(...)`
- `kit.settings.open(...)`
- `kit.storage.get(...)`
- `kit.storage.set(...)`
- `kit.panel.updateState(...)`
- `kit.fetch(...)`
- `kit.files.pick(...)`
- `kit.files.download(...)`
- `kit.files.getUrl(...)`
- `kit.ai.request(...)`
- `kit.kits.sync(...)`
- `kit.kits.install(...)`
- `kit.kits.uninstall(...)`
- `kit.kits.updateSettings(...)`
- `kit.catalog.getSources(...)`
- `kit.catalog.setSources(...)`
- `kit.catalog.refresh(...)`
- `kit.runtime.sendMessage(...)` / `kit.runtime.onMessage(...)`
- `kit.send.registerImeActionInterceptor(...)` / `kit.send.onImeActionIntent(...)`
- `kit.ai.listAgents(...)`
- `kit.ai.runAgent(...)`

## Task Center（任务名称）

宿主会把部分耗时操作（例如 `ai.request` / `network.fetch`）作为 task 记录到 **任务中心**。

为了让用户看到“有意义的任务名称”，功能件应在请求里主动提供：

- `task.title`：用户可读的任务名称（短、明确、可本地化）

示例：

```js
await kit.ai.request({
  task: { title: "生成候选回复" },
  // ...
});

await kit.fetch(url, {
  task: { title: "上传文件" },
  method: "POST"
});
```
