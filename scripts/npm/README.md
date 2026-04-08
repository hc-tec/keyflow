# NPM Distribution Experiments (Function Kits)

这些脚本用于验证：把 Function Kit 作为 **npm package** 分发是否可行（不依赖 GitHub raw / Vercel）。

目标不是马上把 Android Host 改成“从 npm 安装”，而是先证明：

- Kit 体积很小（几十 KB）
- `npm pack` 产物（`.tgz`）可作为“安装包”
- 可用 `dist.integrity`/sha256 做完整性校验

## 1) 打包（本地生成 `.tgz`）

在仓库根目录执行：

```bash
node scripts/npm/build-kits.mjs
```

输出：

- `artifacts/npm/kit-packages.json`
- `artifacts/npm/tarballs/<kitId>/*.tgz`

可选参数：

- `--kit <kitId>`：只打包一个 kit
- `--scope <org>`：生成 scoped 包名（例如 `--scope keyflow2` → `@keyflow2/keyflow-kit-tone-rewrite`）
- `--prefix keyflow-kit-`：包名前缀
- `--out artifacts/npm`：输出目录

> PowerShell 注意：不要直接写 `--scope @keyflow2`，`@xxx` 会被当成 splat；用 `--scope keyflow2` 或 `--scope '@keyflow2'`。

## 2) 校验本地 `.tgz`（是否包含 manifest、可解包）

```bash
node scripts/npm/verify-kit-tgz.mjs --tgz artifacts/npm/tarballs/tone-rewrite/*.tgz
```

## 3) 生成“npm catalog”（先管好 JSON）

```bash
node scripts/npm/generate-catalog.mjs
```

输出：`artifacts/npm/catalog.npm.json`

## 3.1) 从 registry 生成 catalog（给“官方/社区 catalog”用）

把已发布到 npm 的包名列表变成一个 `catalog.json`：

```bash
node scripts/npm/generate-catalog-from-registry.mjs --packages-file catalog/official.packages.json --out-file catalog/official.catalog.json
```

一键生成 + 发布官方 catalog 包：

```bash
node scripts/npm/sync-official-catalog.mjs --packages-file catalog/official.packages.json --out-file catalog/official.catalog.json --catalog-name @keyflow2/keyflow-kit-catalog --token-file tmp/npm-token.txt
```

## 4) 发布到 npm（需要 token）

先在本机配置好 npm token（不要把 token 写进仓库）：

- 在 npm 官网生成 token（需要 `publish` 权限）
- 设置环境变量：`NPM_TOKEN`

然后执行：

```bash
node scripts/npm/publish-kits.mjs --registry https://registry.npmjs.org/
```

如果你不想配置全局环境变量，也可以把 token 放到一个本地文件（建议放在 `tmp/`，已被 `.gitignore` 忽略）：

```bash
node scripts/npm/publish-kits.mjs --kit tone-rewrite --token-file tmp/npm-token.txt
```

只发布一个 kit：

```bash
node scripts/npm/publish-kits.mjs --kit tone-rewrite
```

只做演练（不真正发布）：

```bash
node scripts/npm/publish-kits.mjs --dry-run
```

> 注：`--dry-run` 不要求 `NPM_TOKEN`。

## 5) 从 registry 下载并验证（发布后）

```bash
node scripts/npm/verify-npm-kit.mjs --pkg keyflow-kit-tone-rewrite@0.2.0
node scripts/npm/verify-npm-kit.mjs --pkg @keyflow2/keyflow-kit-tone-rewrite@0.2.0
```

国内网络建议在“下载/验证”阶段使用镜像 registry（发布仍必须走 npmjs.org）：

```bash
node scripts/npm/verify-npm-kit.mjs --registry https://registry.npmmirror.com/ --pkg <name>@<version>
```

## 5.1) 发布 catalog 包到 npm（解决“没 VPS/域名也能分发 catalog.json”）

把一个 `catalog.json` 发布成 npm 包（例如 `@keyflow2/keyflow-kit-catalog`）：

```bash
node scripts/npm/publish-catalog-package.mjs --catalog catalog/official.catalog.json --name @keyflow2/keyflow-kit-catalog --token-file tmp/npm-token.txt
```

发布后验证：

```bash
node scripts/npm/verify-npm-catalog.mjs --pkg @keyflow2/keyflow-kit-catalog@0.0.1
```

## 6) 一键本地 Smoke Test（build + verify + npm install）

```bash
node scripts/npm/smoke-local.mjs --kit tone-rewrite --scope keyflow2
```

## 7) 构建开发者 Starter 模板包（petite-vue + vendored runtime + KitStudio helper）

```bash
node scripts/npm/build-starter-template.mjs
```

输出：

- `artifacts/npm/templates/function-kit-template-petite-vue/*.tgz`
- `artifacts/npm/templates/function-kit-template-petite-vue/starter-template.json`

校验 tarball：

```bash
node scripts/npm/verify-starter-template.mjs
```

## 8) 发布开发者 Starter 模板包到 npm

```bash
node scripts/npm/publish-starter-template.mjs --dry-run
node scripts/npm/publish-starter-template.mjs --token-file tmp/npm-token.txt
```

Starter 包源码在：

- `templates/function-kit-template-petite-vue/`

它包含：

- `workspace/function-kits/starter-showcase/`
- `scripts/open-in-kitstudio.mjs`
- `scripts/rename-starter.mjs`

Starter 的详细说明见：

- `TODO/function-kits/STARTER_TEMPLATE.md`
