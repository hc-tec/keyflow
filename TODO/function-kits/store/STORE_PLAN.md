# Function Kit Store（真正商店）方案与路线

> 编码：UTF-8  
> 创建时间：2026-03-31T18:30:00+08:00  
> 范围：公共商店（用户发现/安装/更新）+ 开发者发布/审核 + 安全与签名  

## 1. 真问题是什么（不要做“表面商店”）

用户的真实行为约束（来自你指出的摩擦）：

- 用户不会去“商店里一个个翻”，更不可能靠搜索插件名解决日常需求。
- 商店的角色应当是：**发现/安装/管理/更新**；日常入口必须在输入流里（bindings/toolbar/chip）。

所以“真正商店”必须同时解决两件事：

1) **分发基础设施**：稳定提供可安装 Kit（ZIP）与可拉取目录（Catalog）
2) **治理与信任**：谁能上架/下架、内容是否被篡改、出了问题如何撤回

## 2. 商店 MVP（P0）范围定义

P0 目标：让“第三方 Kit”能被普通用户**可靠发现并安装**，且具备最小治理能力。

### P0 必须具备

- 目录（Catalog）：可被 Host 拉取并展示安装项
- ZIP 托管：每个 Kit 版本一个可下载 zip
- 完整性：提供 sha256，Host 下载后校验
- 上架/下架流程：最小治理（PR 审核、合并即上架、撤回即下架）

### P0 暂不做（避免一上来就重）

- 账号体系/支付/分成
- 在线评分/评论（P1/P2 做；需要账号 + 反作弊 + 审核。P0 先做“精选/编辑推荐”与安装量等只读指标即可）
- 端内自动更新策略（先手动“检查更新”即可）
- 深度安全扫描（先做 schema 校验 + 权限透明 + 黑名单/下架）

## 3. 数据与规范（与现有 Host 对齐）

现有 Host 已具备：

- URL 安装 zip
- Catalog URL 拉取 packages 列表并一键安装（含 sha256 校验）

因此商店必须至少产出两类数据：

1) `catalog.json`：给 Host（Android）直接消费，遵循 `KIT_CATALOG_SPEC`
2) `store-index.json`：给 Web/端内商店 UI 消费（含更丰富的描述、截图、作者信息等）

### 3.1 `catalog.json`（Host 安装用）

规范：`TODO/function-kits/KIT_CATALOG_SPEC.md`

重点：

- `packages[].kitId / zipUrl / sha256 / sizeBytes / version`
- `zipUrl` 必须可公网访问（或在同局域网内可访问）

### 3.2 `store-index.json`（商店 UI 用，建议）

建议字段（示意，最终可演进）：

```jsonc
{
  "generatedAt": "2026-03-31T18:30:00+08:00",
  "kits": [
    {
      "kitId": "chat-auto-reply",
      "name": "Chat Auto Reply",
      "shortDescription": "One-tap replies for chat apps.",
      "categories": ["writing", "chat"],
      "tags": ["wechat", "support"],
      "developer": {
        "id": "acme",
        "name": "Acme",
        "website": "https://example.com",
        "supportEmail": "support@example.com",
        "verified": true,
        "verification": { "issuer": "official-store", "verifiedAt": "2026-03-31T00:00:00+08:00" }
      },
      "policies": {
        "privacyPolicyUrl": "https://example.com/privacy",
        "termsUrl": "https://example.com/terms"
      },
      "media": {
        "iconUrl": "https://store.example.com/assets/chat-auto-reply/icon.png",
        "screenshots": [
          { "url": "https://store.example.com/assets/chat-auto-reply/1.png", "width": 1080, "height": 2400 }
        ]
      },
      "permissions": ["context.read", "input.replace", "ai.request"],
      "risk": { "level": "medium", "reasons": ["network", "ai", "replace"] },
      "bindings": [
        { "id": "selection.rewrite", "title": "Rewrite Selection", "categories": ["writing","rewrite"] }
      ],
      "latest": { "version": "0.1.0", "zipUrl": "...", "sha256": "...", "sizeBytes": 123, "publishedAt": "2026-03-31T00:00:00+08:00" },
      "compat": { "platforms": ["android", "windows"], "minHostVersion": "0.0.0" },
      "stats": { "installCount": 1234, "activeDevices": 456, "updatedAt": "2026-03-31T00:00:00+08:00" },
      "ratings": { "avg": 4.6, "count": 203 }
    }
  ]
}
```

说明：

- `permissions` 可从 kit `manifest.json` 推导（用于“商店详情页透明展示”）
- `bindings/categories` 用于商店内筛选与推荐（但**日常入口仍靠 bindings**）
- `developer/verified` 等信任信息必须以 **商店侧元数据**为准；不要把“kit 自报信息”当真（最多作为 claimed 展示）。
- `media.*` 的远程资源在 Android 端内可以直接外链加载（Host 已允许 WebView 外网子资源）；若你需要缓存/离线/限流/审计/哈希校验，再用宿主代理（`files.download`/`files.getUrl`）。

## 4. 无 VPS 的“真正商店”发布方案（推荐）

核心思路：把“商店”拆成 **静态可分发产物 + 审核工作流**，避免自建服务器。

### 方案 A（P0 推荐）：GitHub Store Repo（PR 审核）+ Actions + Pages + Releases

你需要一个独立仓库（例如 `function-kit-store`），作为“官方商店源”：

- **提交/审核**：开发者发 PR（新增 kit zip 或新增发布配置），你 review 合并
- **CI 校验**（Actions）：
  - 解压 zip，按 `KIT_PACKAGE_SPEC` 找 manifest
  - 校验 manifest schema（避免 host 崩）
  - 计算 zip 的 sha256/sizeBytes
  - 生成 `catalog.json` 与 `store-index.json`
- **托管**：
  - `catalog.json` / `store-index.json` / 静态页面：GitHub Pages
  - zip：优先 GitHub Releases（或 Pages 静态目录）

好处：

- 0 运维、0 VPS
- PR 就是审核与下架机制（可追溯）
- 版本与回滚简单

不足：

- 统计/个性化推荐能力弱（可后续补 serverless）

### 方案 B（P1 升级）：Cloudflare Pages + Workers + D1 + R2（依然 0 VPS）

适合你要做：

- 更强搜索与排序（server-side）
- 下载统计/安装统计（匿名化）
- 开发者资料与验证（publisher profile / verified badge）
- 评分/评论/举报（写接口 + 反作弊 + 审核）
- 灰度/区域/黑名单（运营能力）
- 更严谨的鉴权（开发者发布）

仍然不需要 VPS，但需要 Cloudflare 账号与少量配置。

### 方案 C（不推荐作为商店主方案）：npm + unpkg/jsDelivr

能做，但会遇到：

- npm 的包治理与商店治理不完全匹配
- zip/大资源/截图/审核流程会变别扭

更适合作为“开发依赖分发”，不是“用户商店”。

## 5. 安全与信任（从 P0 到 P1 的路线）

### P0（已具备/最小可行）

- `sha256` 校验：防止下载损坏/缓存污染
- PR 审核：防止明显恶意内容进入官方目录

> 注意：sha256 不能独立解决“来源可信”。catalog 被劫持时，sha256 也会被同步替换。

### P1（真正商店的关键）：商店签名（信任锚）

建议引入“商店签名”：

- 商店对每个包（或 catalog）做签名
- Host 内置商店公钥（或用户手动信任某些公钥）
- Host 安装前验证签名

效果类似浏览器扩展商店（“来源可信 + 内容未被篡改”）。

参考口径：`TODO/function-kits/DISTRIBUTION_AND_IP.md`

## 6. 客户端集成（Host/端内商店 UI）

短期（立刻可用）：

- Android 下载中心支持 Catalog URL：直接对接商店 `catalog.json`

中期（真正商店体验）：

- Android 增加“商店页”：
  - 搜索/分类/榜单（读取 `store-index.json` 或 store API）
  - 详情页：截图、权限、更新日志、安装/更新按钮
  - 与“功能件中心（管理）”区分：商店=发现安装；中心=管理/权限/卸载

## 7. 下一步（把任务拆成可追踪清单）

建议把“商店”拆成 4 组任务：

1) 商店数据规范（catalog + store-index）
2) 发布与审核流程（PR/CI）
3) 托管与域名（Pages/Releases 或 serverless）
4) Host 侧商店 UI + 更新策略（后做）

对应工程追踪请看：`TODO/TODO.md`（会新增 Kit Store 任务块）
