# Android 访问主机服务（Tailscale 最小闭环）

> 编码：UTF-8
> 修订时间：2026-03-24T11:03:27+08:00
> 目标：让 Android 端（输入法宿主/Function Kit）访问 PC 上跑着的 HTTP 服务，不引入 connector 平面，只用 `client.fetch()`。

## 1. 前提

- 手机和电脑都已登录 Tailscale，并处于同一个 tailnet
- 电脑已在线（tailscale 已启动）
- 已知电脑 Tailscale IP：`100.109.100.33`（来自用户提供）
- 你的服务端口示例用 `<PORT>` 表示

## 2. 关键点（90% 的坑都在这里）

### 2.1 服务必须对外监听

如果你的服务只监听 `127.0.0.1`，那么手机访问 `http://100.109.100.33:<PORT>` 一定失败。

需要改成监听：

- `0.0.0.0:<PORT>`（最常见）
- 或仅监听 Tailscale 网卡对应的地址（更收敛）

### 2.2 Windows 防火墙必须放行

即使服务监听了 `0.0.0.0`，Windows 防火墙没放行也会失败。

最简单原则：

- 放行该端口的入站（仅限 Private 网络或仅限 Tailscale 网卡）

### 2.3 URL 写法

手机端访问的 URL 直接写 Tailscale IP：

- `http://100.109.100.33:<PORT>/...`

如果你用的是 HTTPS，自签名证书会导致 Android `HttpURLConnection` 校验失败；MVP 阶段建议先用 HTTP（走 tailnet 内网）或使用可信证书。

## 3. Function Kit 侧怎么调用（最简单）

功能件前端代码：

```js
const response = await client.fetch("http://100.109.100.33:<PORT>/health", {
  method: "GET",
  timeoutMs: 8000
});

const text = await response.text();
```

说明：

- `client.fetch()` 对应 runtime `network.fetch` 消息
- 请求由 Android 宿主执行（不是 WebView 直接发网络）

## 4. 本地调试的替代路线（可选）

如果你是 USB/本机 adb 调试，有时会更快：

- `adb reverse tcp:<PORT> tcp:<PORT>`
- Android 端用 `http://127.0.0.1:<PORT>` 访问

但这条只适合开发调试，不适合真实用户部署。

