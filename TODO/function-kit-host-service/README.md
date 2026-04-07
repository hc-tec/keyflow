# Function Kit Host Service

> 编码：UTF-8
> 创建时间：2026-03-22T00:00:00+08:00
> 更新时间：2026-03-22T22:05:00+08:00

## 作用

- 提供本地 HTTP 服务，给 Windows / Android Function Kit Host 统一调用。
- 当前实现覆盖 `chat-auto-reply` 渲染链路。
- 服务内部调用 `TODO/ime-research/repos/openclaw` 的本地 `pnpm openclaw ...` 命令。

## 默认配置

- 监听：`127.0.0.1:18789`
- OpenClaw 仓库：`TODO/ime-research/repos/openclaw`
- Agent：`main`
- 鉴权：loopback 默认不需要；若绑定到非 loopback 地址，则必须配置 token

## 运行

```powershell
node .\TODO\function-kit-host-service\src\server.js
```

或：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_functionkit_host_service.ps1
```

## 可选环境变量

- `FUNCTION_KIT_HOST_HOST`
- `FUNCTION_KIT_HOST_PORT`
- `FUNCTION_KIT_HOST_AUTH_TOKEN`
- `FUNCTION_KIT_OPENCLAW_REPO`
- `FUNCTION_KIT_OPENCLAW_AGENT_ID`
- `FUNCTION_KIT_OPENCLAW_RENDER_TIMEOUT_MS`
- `FUNCTION_KIT_OPENCLAW_STATUS_TIMEOUT_MS`
- `FUNCTION_KIT_HOST_BODY_LIMIT_BYTES`

## 接口

- `GET /health`
- `GET /v1/openclaw/status`
- `POST /v1/function-kits/chat-auto-reply/render`

## 示例

```powershell
$body = @{
  preferredTone = "professional-friendly"
  modifiers = @("如果给时间就要具体")
  context = @{
    sourceMessage = "今晚方便把方案发我吗？"
    conversationSummary = "对方在追要方案，希望今晚同步。"
    personaChips = @("同事沟通", "明确时间", "简洁")
  }
  constraints = @{
    candidateCount = 3
    maxCharsPerCandidate = 60
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:18789/v1/function-kits/chat-auto-reply/render' `
  -ContentType 'application/json; charset=utf-8' `
  -Body $body
```

## Android 访问主机服务

### USB / `adb reverse`

- 启动 host service：`127.0.0.1:18789`
- 执行：`adb reverse tcp:18789 tcp:18789`
- Android 侧 base URL 使用：`http://127.0.0.1:18789`

### 局域网直连

推荐直接用脚本开启：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_functionkit_host_service.ps1 -ExposeToLan
```

脚本会：

- 把服务监听到 `0.0.0.0`
- 自动生成 host token
- 输出可供 Android 填写的局域网 URL

Android 侧需要填写：

- `Enable remote inference = on`
- `Remote host service base URL = http://<PC-LAN-IP>:18789`
- `Remote host service token = <脚本输出的 token>`

这里的 `<PC-LAN-IP>` 也可以直接换成：

- Tailscale IPv4
- 局域网 IPv4
- 其他你手机可直连的受信 VPN 地址

HTTP 请求支持以下鉴权头之一：

- `Authorization: Bearer <token>`
- `X-Function-Kit-Token: <token>`

## 前提

- 已安装 `node`
- 已安装 `pnpm`
- `TODO/ime-research/repos/openclaw` 已完成依赖安装并可执行 `pnpm openclaw ...`
