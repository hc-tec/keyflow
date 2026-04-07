# 下载中心 / 商店 UI 做成一个 Function Kit（Web UI）可行性调研与接口提案

> 编码：UTF-8  
> 创建时间：2026-04-01T10:00:00+08:00  
> 结论优先：**可行、值得做**，但必须补齐一组“特权管理接口”与“二进制下载/资源代理”能力，并保留 **原生安全兜底入口**（避免把自己锁死）。

---

## 0. TL;DR（你明天醒来先看这一段就够）

把“功能件下载中心（安装/卸载/更新/启用/权限）”的 UI 改成一个 **内置的 Store Kit**（HTML/CSS/JS）是可行的，并且长期更稳：

- UI 复杂、迭代快、跨平台复用（Android/Windows 同一套前端）→ **Web UI 最划算**
- Host 继续做“下载/校验/解包/权限确认/任务追踪”→ **宿主强一致**

但要做成“真正可用”，必须新增两类接口：

1) **Kit 管理接口（特权）**：列出已安装、安装/卸载/更新、启用/置顶、权限开关等  
2) **资源下载/代理接口（可选，特权或受限）**：为了缓存/离线/限流/审计/哈希校验，Store Kit 可能仍需要让 Host 代为下载远程资源并映射为本地 URL（例如图标/截图/README）。

同时必须保留一个最小的原生兜底：

- “恢复/重置 Store Kit（回退到 assets 内置版本）”
- “从 URL/ZIP 安装（紧急修复通道）”

对标浏览器扩展：Chrome Web Store 是“发现页”，但 **安装/卸载/权限弹窗**都由浏览器接管；我们也要保持这个边界。

---

## 1. 现状事实（决定了能不能做、怎么做）

### 1.1 我们已经具备的“安装基础设施”

Android Host 已实现：

- ZIP 安装/卸载（解压到 device-protected internal storage）
- Catalog URL 拉取 packages 列表并一键安装（含 sha256 校验）
- 已安装版本优先加载 UI（installed-first），失败可回退到 assets 内置版本

相关规范与实现入口：

- Catalog 规范：`TODO/function-kits/KIT_CATALOG_SPEC.md`
- ZIP 规范：`TODO/function-kits/KIT_PACKAGE_SPEC.md`
- 分发/IP：`TODO/function-kits/DISTRIBUTION_AND_IP.md`
- Android 下载中心（原生 UI）：`TODO/ime-research/repos/fcitx5-android/.../FunctionKitDownloadCenterFragment.kt`
- Android 安装器：`TODO/ime-research/repos/fcitx5-android/.../FunctionKitPackageManager.kt`

### 1.2 关键约束：主页面固定本地 origin，但对外链做“可用 + 可控”

Android 的 **Function Kit Host（`FunctionKitWebViewHost`）** 会拦截外链导航，避免在 WebView 内打开外网页面；外链会交给系统浏览器打开。

同时为了降低“展示图片/样式很麻烦”的成本，Host 已允许 WebView 加载外网子资源（图片/样式等），但对 HTML 响应注入 CSP：默认禁止外链脚本，降低供应链风险。

实现入口（便于你核对/改策略）：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`

### 1.3 关键约束：`network.fetch` 不是下载器

当前 `network.fetch`：

- 只回传 UTF-8 文本（不是二进制流）
- 响应 body 有大小上限（用于避免把 bridge 撑爆）

所以 Store Kit 不能靠 `network.fetch` 把 ZIP/图片下载回来再用。

> 结论：要做“商店体验”，必须让 Host 提供“下载到文件/缓存，并给 WebView 一个可加载的本地 URL”的能力。

---

## 2. 对标浏览器插件：它们怎么解决“发现 vs 安装 vs 管理”

浏览器扩展的分层非常清晰：

- **商店页面（发现）**：是普通网页，负责搜索/分类/详情/截图/评分等
- **安装/卸载/权限确认（治理）**：由浏览器原生 UI 强制接管（用户确认、权限透明、可撤回）
- **管理页（启用/权限/更新）**：也是浏览器内置页面（chrome://extensions）

我们要学的是“边界”，不是 UI 形态：

- Store Kit 可以承担“商店页 + 管理页”的 UI  
- 但 **安装/卸载/权限弹窗/签名校验** 必须由 Host 强一致执行（Store Kit 只是发起请求 & 展示结果）

---

## 3. 三种可落地架构（推荐 B）

### 方案 A：继续用原生下载中心，只把“商店发现页”做成 Kit

优点：最省事；不需要特权接口太多。  
缺点：管理/安装仍丑；两套 UI 心智割裂。

### 方案 B（推荐）：做一个“内置 Store Kit”，原生只做薄壳 + 安全兜底

原生做：

- 提供特权接口（安装/卸载/更新/启用/权限）
- 权限确认弹窗（不可绕过）
- 下载与解包（不可绕过）
- 任务中心（task）记录与取消
- 兜底入口（Reset/Recovery）

Store Kit（Web UI）做：

- 搜索/分类/详情/安装按钮/更新按钮
- 已安装列表管理（启用/卸载/权限开关/置顶）
- 安装进度与结果展示（订阅 task.update）

优点：体验统一、跨平台复用、长期维护成本最低。  
缺点：需要设计一组“kits.manage”特权 API。

### 方案 C：把商店做成外部网页（系统浏览器打开）

优点：Web 能力最强（图片/视频/AB/搜索）。  
缺点：与 Host 的安装/管理链路割裂；安全与可信更难统一；离线/回退也弱。  
适合：P2 以后作为“外部宣传/落地页”，不适合作为端内唯一入口。

---

## 4. 安全模型（必须先定，否则等于给任意 Kit 开“装卸载后门”）

### 4.1 新的特权能力：`kits.manage`

建议新增 runtime permission：`kits.manage`，仅授予：

- 内置 Store Kit（按 `kitId` allowlist）
- 或“签名可信”的系统 Kit（后续做商店签名时再启用）

任何第三方 Kit：

- 可以打开商店/推荐某个 kit（通过 intent/deeplink）
- **不能直接 install/uninstall/enable 其它 kit**

### 4.2 Host 强制确认（对标浏览器扩展安装弹窗）

即使 Store Kit 可信，Host 仍应对这些动作强制弹确认：

- 安装新 kit（展示权限清单）
- 更新且权限有变化（展示差异）
- 卸载 kit（确认）

Store Kit 只负责“把用户点的按钮”变成请求；最终结果由 Host 决定并回传。

### 4.3 “把自己锁死”的风险与兜底

因为 Store Kit 将承担管理入口，一旦它坏了，用户就会卡死。必须保证：

- Store Kit 永远有 **assets 内置版本**可用（且不可卸载内置）
- 若用户安装的 Store Kit 覆盖版崩溃/空白：
  - Host 自动回退到内置版本，或
  - 提供原生按钮“重置 Store Kit（删除 user-installed 覆盖版）”

---

## 5. 需要新增哪些 Host Bridge / Runtime SDK 接口（提案 v0）

> 目标：让 Store Kit 能完整替代“下载中心/管理中心”的 UI，但不破坏安全边界。

### 5.1 Kit 列表与状态同步

新增：

- `kits.sync.request`（UI → Host，需 `kits.manage`）
- `kits.sync`（Host → UI，可主动推送）

`kits.sync` payload 建议包含（最小够用）：

```jsonc
{
  "kits": [
    {
      "kitId": "chat-auto-reply",
      "name": "Chat Auto Reply",
      "version": "0.1.0",
      "description": "...",
      "source": "bundled|user",
      "enabled": true,
      "pinned": false,
      "runtimePermissions": ["context.read", "input.replace", "ai.request"],
      "permissionOverrides": { "network.fetch": false },
      "categories": ["writing", "chat"],
      "bindings": [
        { "id": "selection.rewrite", "title": "Rewrite Selection", "categories": ["writing","rewrite"], "preferredPresentation": "panel.preview" }
      ]
    }
  ],
  "updatedAtEpochMs": 0
}
```

> 注意：`categories` 可以来自 kit 级别，也可以仅由 bindings 聚合（两者都支持更好）。

### 5.2 安装（从 URL / Catalog / 本地 ZIP）

新增：

- `kits.install`（UI → Host，需 `kits.manage`）
- `kits.install.result`（Host → UI）

请求形态建议做成 union（后续可扩展）：

```jsonc
{
  "task": { "title": "安装：Chat Auto Reply" },
  "source": {
    "kind": "url",
    "url": "https://example.com/chat-auto-reply.zip",
    "sha256": "..."
  },
  "options": {
    "allowReplace": true,
    "requireUserConfirmation": true
  }
}
```

本地 ZIP 安装（配合现有 `files.pick`）：

```jsonc
{
  "source": { "kind": "file", "fileId": "file-xxx" }
}
```

Catalog 安装（给 UI 做“选择源/一键安装”）：

```jsonc
{
  "source": {
    "kind": "catalog",
    "catalogUrl": "https://store.example.com/catalog.json",
    "kitId": "chat-auto-reply",
    "zipUrl": "./chat-auto-reply.zip",
    "sha256": "..."
  }
}
```

响应建议回传：

```jsonc
{ "ok": true, "taskId": "task-xxx", "kitId": "chat-auto-reply", "replaced": false }
```

进度与结果统一走 `task.update`（Store Kit 只订阅并渲染）。

### 5.3 卸载 / 启用 / 置顶 / 权限开关

新增（都需要 `kits.manage`）：

- `kits.uninstall` / `kits.uninstall.result`
- `kits.settings.update` / `kits.settings.update.result`

`kits.settings.update` 建议用 patch，避免接口爆炸：

```jsonc
{
  "kitId": "chat-auto-reply",
  "patch": {
    "enabled": false,
    "pinned": true,
    "permissionOverrides": { "network.fetch": null, "ai.request": false }
  }
}
```

规则：

- `null` 表示清除 override（回到 host-level 默认）
- Host 必须校验 patch 只包含允许字段

### 5.4 Catalog（目录源）管理（可选但强烈建议）

如果你希望 Store Kit 也承担“目录源管理”（不让用户再进原生页面输 URL），建议新增：

- `catalog.sources.get` / `catalog.sources.set`
- `catalog.refresh`（Host 拉取并缓存）/ `catalog.sync`（回传 packages）

原因：

- 让 Catalog 拉取走 Host（统一网络、缓存、错误提示、大小限制）
- 避免 Store Kit 自己用 `network.fetch` 处理各种边界

### 5.5 资源下载 / 图片展示（可选但很有价值）

即使 Host 允许外链图片，Store Kit 想展示：

- kit 图标
- 截图
- README/长描述（可能很大）

仍然建议具备“下载到本地并提供可加载 URL”的能力（用于缓存/离线/审计/校验），推荐做法：

- `files.download`（或 `resources.download`）：Host 下载 URL → 落盘到 fileStore/cache → 返回 `fileId`
- `files.getUrl(fileId)`：返回一个 `https://function-kit.local/assets/files/<fileId>` 的本地 URL（WebView 允许加载）

这样可以：

- 保持“Kit UI 不直连外网”的安全模型
- 允许 Host 做白名单、限速、缓存、大小限制

> P0（仅下载中心）可以先不做图标/截图；P1（真正商店体验）建议做（更快、更省流量、更可控）。

补充调研与官方证据见：`TODO/function-kits/store/WEBVIEW_EXTERNAL_RESOURCES_RESEARCH.md`

---

## 6. UI/交互建议（别再走 Preference 列表那套）

Store Kit（Web UI）建议拆成 3 个主页面（SPA 路由即可，不需要多 HTML）：

1) **Explore**：分类/搜索/榜单（来自 store-index 或 serverless API）
2) **Installed**：已安装列表（启用/卸载/权限/置顶）
3) **Sources**：Catalog 源管理（添加/禁用/刷新/错误）

关键交互细节（对标浏览器扩展）：

- 安装按钮点击后：立刻进入“下载中/校验中/安装中”的任务态
- 安装完成：按钮变“打开/管理”，并提示“已安装”
- 权限变更：更新时 Host 弹“权限变化确认”
- 失败：给“重试/查看错误详情/复制日志”入口

---

## 7. 分阶段落地（建议你按这个节奏排期）

### P0（1~2 天）：把“下载中心 UI”换成 Kit UI（无图标/截图也行）

- 新增 `kits.manage` + `kits.sync` + `kits.install(url/file)` + `kits.uninstall` + `kits.settings.update(enabled)`
- 原生 Settings 页只保留一个入口按钮：“打开 Store Kit”
- 保留原生“恢复/紧急安装”入口（可藏到二级）

### P1（3~7 天）：让它像“真正商店”

- `catalog.*` 接口完善（多源、缓存、错误态）
- `files.download` + `files.getUrl`（支持图标/截图）
- store-index（或 serverless API）对接：搜索/分类/详情页

### P2（后续）：信任锚与治理

- 商店签名验签（Host 内置公钥）
- 下架/黑名单/灰度
- 自动更新策略（后台下载、下次打开生效）

---

## 8. 与现有“无 VPS 商店方案”的关系

本方案并不要求你自建 VPS：

- Catalog 仍然可以用 GitHub Pages 提供（`catalog.json`）
- store-index 也可以静态生成（`store-index.json`）
- 真正要强搜索/排序/统计，再升级到 Cloudflare Workers 等 serverless

详见：`TODO/function-kits/store/STORE_PLAN.md`
