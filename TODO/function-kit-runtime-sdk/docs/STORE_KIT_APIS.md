# Store Kit APIs（下载中心/商店做成 Kit 的运行时能力）

> 编码：UTF-8  
> 创建时间：2026-04-01T10:30:00+08:00  
> 目标：为“内置 Store Kit（Web UI）”提供一组稳定、可跨平台的 Runtime API：列出/安装/卸载/更新/启用/权限管理 + 资源下载代理。  

相关方案背景：`TODO/function-kits/store/DOWNLOAD_CENTER_AS_KIT.md`

---

## 1. 安全边界（必须先读）

1) Store Kit 只是 **UI**，所有高风险动作必须由 Host 接管：

- 安装/卸载/更新/权限变更：Host 强制校验、强制确认、强制任务化

2) 新增特权能力建议采用：

- `kits.manage`：Kit 管理（install/uninstall/settings/sync/catalog）
- `files.download`：把远程资源下载到 Host 本地缓存/FileStore，并返回可被 WebView 加载的本地 URL

3) Android 的 Function Kit Host 现在允许 WebView 加载外网图片/样式等子资源（但仍不在 WebView 内打开外网页面，并通过 CSP 默认禁止外链脚本）。因此商店页可以直接 `<img src="https://...">`；`files.download/getUrl` 主要用于缓存/离线/限流/审计/哈希校验（可选但很有价值）。

---

## 2. 协议（Host Bridge message types）

### 2.1 Kits（安装/卸载/管理）

UI → Host（需 `kits.manage`）：

- `kits.sync.request`
- `kits.open`
- `kits.install`
- `kits.uninstall`
- `kits.settings.update`

Host → UI：

- `kits.sync`
- `kits.open.result`
- `kits.install.result`
- `kits.uninstall.result`
- `kits.settings.update.result`

> 推荐：Host 在 install/uninstall/settings 成功后主动推送一次 `kits.sync`，让 UI 立刻刷新。

### 2.2 Catalog（目录源，可选但推荐）

UI → Host（建议同样归入 `kits.manage`）：

- `catalog.sources.get`
- `catalog.sources.set`
- `catalog.refresh`

Host → UI：

- `catalog.sources.sync`
- `catalog.sync`

### 2.3 Files（资源下载代理）

UI → Host（需 `files.download`）：

- `files.download`
- `files.getUrl`

Host → UI：

- `files.download.result`
- `files.getUrl.result`

---

## 3. Runtime SDK（Browser-style APIs）

> 这些 API 已在 `FunctionKitRuntimeSDK.createKit()` 中提供（`kit.kits.* / kit.catalog.* / kit.files.download/getUrl`）。

### 3.1 已安装 Kits：同步与读取

```js
const kit = FunctionKitRuntimeSDK.createKit({ kitId: "store", surface: "panel" });
await kit.connect();

// 拉一次快照（Host 回 `kits.sync`）
await kit.kits.sync({ includeDisabled: true });

// 读聚合后的状态（SDK 会把 `kits.sync` 写入 state）
const installed = kit.kits.list();
const one = kit.kits.get("chat-auto-reply");
```

打开某个已安装功能件（从下载中心一键跳转到目标 kit 面板）：

```js
await kit.kits.open({ kitId: "chat-auto-reply", task: { title: "打开：chat-auto-reply" } });
```

事件（可选）：

```js
kit.on("kits.sync", ({ kits }) => {
  console.log("kits updated", kits.length);
});
```

### 3.2 安装（URL / fileId / catalog）

建议 payload（示意，Host 可扩展字段，但应保持向后兼容）：

```js
await kit.kits.install({
  task: { title: "安装：Chat Auto Reply" },
  source: { kind: "url", url: "https://example.com/chat-auto-reply.zip", sha256: "..." },
  options: { allowReplace: true, requireUserConfirmation: true }
});
```

本地 ZIP（配合 `files.pick`）：

```js
const pick = await kit.files.pick({ acceptMimeTypes: ["application/zip"], multiple: false });
const fileId = pick.files?.[0]?.fileId;
await kit.kits.install({
  task: { title: "安装：本地 ZIP" },
  source: { kind: "file", fileId }
});
```

Catalog 安装（若 Host 支持）：

```js
await kit.kits.install({
  task: { title: "安装：chat-auto-reply" },
  source: { kind: "catalog", catalogUrl: "https://store.example.com/catalog.json", kitId: "chat-auto-reply" }
});
```

### 3.3 卸载 / 启用 / 权限开关

```js
await kit.kits.uninstall({ task: { title: "卸载：chat-auto-reply" }, kitId: "chat-auto-reply" });

await kit.kits.updateSettings({
  task: { title: "禁用：chat-auto-reply" },
  kitId: "chat-auto-reply",
  patch: {
    enabled: false,
    pinned: true,
    permissionOverrides: { "network.fetch": null, "ai.request": false }
  }
});
```

约定：

- `permissionOverrides[perm]=null` 表示清除 override（回到 host-level 默认）
- Host 必须校验 `patch` 字段白名单（防止任意写 prefs）

### 3.4 Catalog（目录源管理，可选）

```js
await kit.catalog.getSources();
await kit.catalog.setSources({ sources: [{ url: "https://store.example.com/catalog.json", enabled: true }] });
await kit.catalog.refresh({ url: "https://store.example.com/catalog.json" });
```

### 3.5 资源下载代理（图标/截图/README）

推荐流程（缓存/离线/审计/校验场景）：

1) `files.download(url)` → Host 下载并落盘，返回 `fileId`（可选返回 `localUrl`）
2) `files.getUrl(fileId)` → 返回可在 kit 页面直接加载的 `https://function-kit.local/assets/...` URL

```js
const downloaded = await kit.files.download({
  task: { title: "下载图标" },
  url: "https://store.example.com/assets/icon.png",
  maxBytes: 2 * 1024 * 1024
});

const resolved = await kit.files.getUrl(downloaded.fileId);
const img = document.querySelector("#icon");
img.src = resolved.url;
```

### 3.6 开发者信息 / 评分等“商店数据”怎么拿

这类数据一般来自商店后端（或静态生成的 `store-index.json`），不建议做成 Host Bridge 专用消息（否则宿主背业务演进成本）。

- JSON/文本：用 `kit.fetch(...)`（`network.fetch`）读取商店 API 或 `store-index.json`
- 图片/截图：用 `kit.files.download(...)` + `kit.files.getUrl(...)` 转成 WebView 可加载的本地 URL

---

## 4. Host 侧实现注意（给宿主做接口的人）

- 这些 API 建议全部任务化（Task Center），并鼓励 UI 提供 `task.title`，避免用户看到接口名。
- 安装/更新必须做：大小限制、sha256 校验、路径穿越拦截、zip bomb 防护、权限差异确认弹窗。
- `kits.manage` 必须只授予可信 kit（例如内置 store kitId allowlist / 签名可信）。
