# Android Function Kit Shared AI Chat（2026-03-23）

> 范围：`fcitx5-android` Function Kit、Android 共享 AI 配置、`chat-auto-reply` 本地 chat 路由、权限拆分

## 1. 这次真正补上的东西

这次不是继续把 `chat-auto-reply` 停留在“远程宿主可用、本地只会 demo 候选”的状态，而是把 Android 侧自己的共享 AI chat 路径真正接上了。

现在 Android 端新增了一组全局 AI 配置：

- `Enable shared AI chat`
- `Base URL`
- `API key`
- `Model`
- `Timeout seconds`

这组配置是给 Function Kit 复用的，不要求每个功能件自己再管理一份敏感配置。

## 2. 当前行为

当 `Function Kit` 请求：

- `ai.chat`
- `candidates.regenerate`

宿主现在会按下面顺序路由：

1. 如果远程宿主推理开启，并且当前功能件 manifest 走远程渲染路径，则继续走原来的 remote host。
2. 如果远程宿主没有启用，但 Android 共享 AI chat 已配置完成，并且 `ai.chat` 权限允许，则直接由 Android 通过 OpenAI-compatible `POST /chat/completions` 请求模型。
3. 如果上面两条都不满足，才回退到本地 demo 候选。

也就是说，`chat-auto-reply` 现在不再强依赖电脑常驻的 host service 才能出真实候选。

## 3. 权限模型修正

之前 `network.fetch` 和 `ai.chat` 实际上都被错误地绑在“远程宿主推理是否开启”上，这会让 Android 本地可完成的能力也被电脑依赖绑死。

现在已经拆开：

- `network.fetch` -> 独立权限
- `ai.chat` -> 独立权限
- `ai.agent.list` / `ai.agent.run` -> 仍然要求远程宿主开启，并且显式允许 agent 访问

这个拆分符合现在的产品方向：

- `chat` 优先 Android 直连
- `agent` 允许依赖电脑侧已注册 agent / skills

## 4. 设置与发现

Android 主设置页现在新增了独立 `AI` 入口，Function Kit 也支持：

```json
{
  "type": "settings.open",
  "payload": {
    "section": "ai"
  }
}
```

这样功能件如果发现共享 AI 未就绪，可以直接把用户带到 AI 设置，而不是只告诉用户“没配好”。

## 5. 技术边界

当前这版共享 AI chat 仍然有明确边界：

- 只支持 OpenAI-compatible `chat/completions`
- 只覆盖文本 chat，不覆盖 agent / skills 编排
- API key 仍是普通 Android 偏好存储，没有加密托管
- 没有做 provider catalog / model discovery
- `agent` 能力仍然属于远程宿主能力，不在 Android 本地伪造 API

这几个限制是刻意保守，不再为了“看起来通用”而提前做一大坨抽象。

## 6. 验证

已在 `fcitx5-android` 仓库完成以下验证：

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.ui.main.settings.behavior.FunctionKitSettingsStatusResolverTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitAiChatBackendTest --console=plain --warning-mode=all
.\gradlew.bat :app:compileDebugKotlin --console=plain --warning-mode=all
```

两条均已通过。
