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
  "version": "0.2.0",
  "npm": {
    "name": "@keyflow2/keyflow-kit-tone-rewrite",
    "version": "0.2.0"
  },
  "dist": {
    "tarball": "https://registry.npmjs.org/@keyflow2/keyflow-kit-tone-rewrite/-/keyflow-kit-tone-rewrite-0.2.0.tgz",
    "integrity": "sha512-...",
    "sha256": "64-hex...",
    "sizeBytes": 20610
  }
}
```

- `kitId`（string，必填）：功能件 id（应与 kit 的 `manifest.json` 中 `id` 一致）
- `name`（string，可选）：展示名（通常来自 `manifest.name`）
- `version`（string，必填）：版本号（应与 npm 包版本一致）
- `npm`（object，必填）
  - `name`（string，必填）：npm 包名
  - `version`（string，必填）：npm 版本（建议固定版本，避免 `latest` 引起不可预期更新）
- `dist`（object，可选但强烈建议）
  - `tarball`（string，必填）：可下载的 `.tgz` URL
  - `integrity`（string，必填）：npm `dist.integrity`（SRI，sha512-base64）
  - `sha256`（string，必填）：对 `.tgz` 文件内容计算的 sha256（hex）
  - `sizeBytes`（number，必填）：`.tgz` 文件大小

## Catalog 的分发方式（无 VPS）

### A) 目录 JSON 作为 npm 包发布（推荐）

把 `catalog.json` 发布为一个 npm 包（例如官方：`@keyflow2/keyflow-kit-catalog`），包内包含：

- `package.json`
- `catalog.json`

消费者（Host / 工具）可通过下载 tarball → 校验 `dist.integrity` → 解包 `catalog.json` 来获取目录。

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

