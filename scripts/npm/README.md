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
- `--scope @hc-tec`：生成 scoped 包名（例如 `@hc-tec/keyflow-kit-tone-rewrite`）
- `--prefix keyflow-kit-`：包名前缀
- `--out artifacts/npm`：输出目录

## 2) 校验本地 `.tgz`（是否包含 manifest、可解包）

```bash
node scripts/npm/verify-kit-tgz.mjs --tgz artifacts/npm/tarballs/tone-rewrite/*.tgz
```

## 3) 生成“npm catalog”（先管好 JSON）

```bash
node scripts/npm/generate-catalog.mjs
```

输出：`artifacts/npm/catalog.npm.json`

## 4) 发布到 npm（需要 token）

先在本机配置好 npm token（不要把 token 写进仓库）：

- 在 npm 官网生成 token（需要 `publish` 权限）
- 设置环境变量：`NPM_TOKEN`

然后执行：

```bash
node scripts/npm/publish-kits.mjs --registry https://registry.npmjs.org/
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
node scripts/npm/verify-npm-kit.mjs --pkg @hc-tec/keyflow-kit-tone-rewrite@0.2.0
```

国内网络建议在“下载/验证”阶段使用镜像 registry（发布仍必须走 npmjs.org）：

```bash
node scripts/npm/verify-npm-kit.mjs --registry https://registry.npmmirror.com/ --pkg <name>@<version>
```

## 6) 一键本地 Smoke Test（build + verify + npm install）

```bash
node scripts/npm/smoke-local.mjs --kit tone-rewrite --scope @hc-tec
```
