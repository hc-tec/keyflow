# Kit Catalog Spec（npm 分发版）

> 编码：UTF-8  
> 创建时间：2026-04-07  
> 范围：Keyflow Function Kit 生态的 “npm 分发 + Catalog JSON” 方案

## 目标

- 在没有 VPS/域名的情况下，仍然能提供一个 **可发现、可校验、可更新** 的功能件目录（catalog）。
- 让目录本身也能通过 npm 分发（以及镜像），规避 `raw.github` 等不可达问题。
- 目录只负责“引用”，不托管源码；真正的 kit 以 npm package 分发（`.tgz`）。

## Catalog JSON（`keyflow.npm.catalog.v0`）

### 1) 顶层结构

```json
{
  "kind": "keyflow.npm.catalog.v0",
  "generatedAt": "2026-04-07T12:00:00.000Z",
  "registry": "https://registry.npmjs.org/",
  "packages": []
}
```

- `kind`（string，必填）：固定为 `keyflow.npm.catalog.v0`
- `generatedAt`（string，必填）：ISO8601 时间
- `registry`（string，必填）：生成目录时所使用的 npm registry（用于调试/追踪）
- `packages`（array，必填）：功能件包列表

> 兼容性：消费者应忽略未知字段，以便未来扩展。

### 2) `packages[]` 条目结构

```json
{
  "kitId": "tone-rewrite",
  "name": "语气改写",
  "description": "一键把聊天内容改成更短、更长、更礼貌、更口语，或加上合适 emoji。",
  "version": "0.2.0",
  "npm": {
    "name": "@keyflow2/keyflow-kit-tone-rewrite",
    "version": "0.2.0",
    "scope": "keyflow2",
    "keywords": ["keyflow", "function-kit", "ime", "webview"],
    "publisher": "ncu-titto",
    "maintainers": ["ncu-titto"],
    "publishedAt": "2026-04-07T12:40:25.132Z"
  },
  "platforms": ["android"],
  "runtimePermissions": ["context.read", "input.replace", "ai.request"],
  "categories": ["chat", "rewrite", "tone", "writing"],
  "tag": "chat",
  "tags": ["chat", "rewrite", "tone", "writing", "ai"],
  "icons": {
    "128": "icons/tone-rewrite/icon-128.png"
  },
  "icon": "icons/tone-rewrite/icon-128.png",
  "bindingCount": 6,
  "links": {
    "homepage": "https://github.com/hc-tec/keyflow#readme",
    "repository": "git+https://github.com/hc-tec/keyflow.git",
    "bugs": "https://github.com/hc-tec/keyflow/issues"
  },
  "dist": {
    "tarball": "https://registry.npmjs.org/@keyflow2/keyflow-kit-tone-rewrite/-/keyflow-kit-tone-rewrite-0.2.0.tgz",
    "integrity": "sha512-...",
    "sha256": "64-hex...",
    "sizeBytes": 20610,
    "unpackedSize": 63826,
    "fileCount": 7
  }
}
```

- `kitId`（string，必填）：功能件 id（应与 kit 的 `manifest.json` 中 `id` 一致）
- `name`（string，可选）：展示名（通常来自 `manifest.name`）
- `description`（string，可选）：一句话简介（通常来自 `manifest.description`，可用于列表展示/搜索）
- `version`（string，必填）：版本号（应与 npm 包版本一致）
- `npm`（object，必填）
  - `name`（string，必填）：npm 包名
  - `version`（string，必填）：npm 版本（建议固定版本，避免 `latest` 引起不可预期更新）
- `platforms`（string[]，可选）：支持平台（通常来自 `manifest.platforms`）
- `runtimePermissions`（string[]，可选）：运行时权限（来自 `manifest.runtimePermissions`，强烈建议在 UI 中展示）
- `categories`（string[]，可选）：分类/标签（推荐从 `manifest.bindings[].categories` 聚合去重；也可由 catalog 维护者补充/覆盖）
- `tag`（string，可选）：单个主标签，给只能展示一个 chip 的消费者用；通常取 `tags[0]`
- `tags`（string[]，可选）：展示/搜索用标签；推荐由 `discovery.slash.tags`、`categories`、以及必要的能力标签（如 `ai`）聚合而来
- `icons`（object，可选）：下载前展示用图标；建议只携带一张 `128` 预览图，值是 catalog npm 包内的相对路径（sidecar file），不要使用 base64/data URL
- `icon`（string，可选）：默认图标路径；值同样是 catalog npm 包内的相对路径，通常指向 `128` 或最适合列表展示的图
- `bindingCount`（number/int，可选）：该 kit 暴露的 binding 数量（便于在目录中快速评估“有多少动作”）
- `links`（object，可选）：相关链接（通常来自 npm 元数据 `homepage/repository/bugs`）
- `dist`（object，可选但强烈建议）
  - `tarball`（string，必填）：可下载的 `.tgz` URL
  - `integrity`（string，必填）：npm `dist.integrity`（SRI，sha512-base64）
  - `sha256`（string，必填）：对 `.tgz` 文件内容计算的 sha256（hex）
  - `sizeBytes`（number，必填）：`.tgz` 文件大小
  - `unpackedSize`（number，可选）：npm 元数据中的解包大小（展示用）
  - `fileCount`（number，可选）：文件数量（展示用）

### 3) `kitId` 的唯一性与命名（强烈建议）

`kitId` 一旦发布就应该视为**永久标识**（会被用于安装目录、配置/缓存键、UI 展示等）。如果 `kitId` 重复，会带来：覆盖安装、更新混乱、用户难以分辨来源等问题。

建议规则：

- **全局唯一**：把 `kitId` 当成 “包名级别” 的唯一键来设计。
- **推荐命名**：`"<npmScope>.<kitSlug>"`（scope 来自 npm scope/账号名；slug 用 kebab-case）。
  - 例：`keyflow2.tone-rewrite`、`alice.clipboard-tools`
- **字符约束（跨平台/Windows 安全）**：只用小写字母/数字/`.`/`_`/`-`，且不包含 `/`、`\\`、`..`、`:`、`@`。
- **不要改 id**：如果要做重大重构，请通过版本号演进；`kitId` 改动会导致“新 kit”被当成另一个包。

## Catalog 的分发方式（无 VPS）

### A) 目录 JSON 作为 npm 包发布（推荐）

把 `catalog.json` 发布为一个 npm 包（例如官方：`@keyflow2/keyflow-kit-catalog`），包内包含：

- `package.json`
- `catalog.json`
- `icons/<kitId>/...`（可选，sidecar 图标文件；推荐只放 1 张 `128px` 预览图）

消费者（Host / 工具）可通过下载 tarball → 校验 `dist.integrity` → 解包 `catalog.json` 和 sidecar icons 来获取目录。

图标不要内嵌到 `catalog.json`：

- 不要使用 `data:image/png;base64,...`
- 避免 catalog JSON 体积膨胀和编辑/渲染卡顿
- 无 VPS/域名时，使用 npm catalog 包内的 sidecar icon 文件即可

本仓库提供脚本：

- 生成：`scripts/npm/generate-catalog-from-registry.mjs`
- 发布：`scripts/npm/publish-catalog-package.mjs`
- 一键：`scripts/npm/sync-official-catalog.mjs`

### B) 作为静态 JSON URL（可选）

如果你有可用的静态托管（自建、对象存储等），也可以把 `catalog.json` 直接作为 URL 提供。

> 国内环境下不推荐依赖 `raw.github`/Vercel。

## 开发者如何加入生态

开发者可选择两条路：

1. **自建 catalog**：发布自己的 kit 包到 npm → 生成并发布自己的 catalog 包（`@your-scope/keyflow-kit-catalog`）→ 让用户添加这个源。
2. **上架官方 catalog**：发布 kit 包到 npm → 通过 PR/Issue 提交包名+版本 → 维护者审核后合入官方列表并发布官方 catalog。

官方/社区流程说明：`catalog/README.md`
