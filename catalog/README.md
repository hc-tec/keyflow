# Catalog（功能件目录）设计：官方 + 社区两条路

目标：让功能件“可发现 + 可一键安装”，同时不强依赖 VPS/域名。

## 1) 两种 Catalog

### A. 官方 Catalog（官网默认）

- 由 `keyflow2` 组织维护
- 内容是一个 JSON：`catalog/official.catalog.json`
- 下载前 logo 不写进 JSON 正文，而是放在 sidecar 目录：`catalog/official.catalog.assets/icons/...`
- catalog sidecar 只推荐放一张 `128px` 预览图；功能件安装包内部仍可保留多规格图标
- `catalog.json` 条目会包含 `downloads_last_week`（npm 近 7 天下载量，用于下载中心排序/筛选；不是安装量）
- 由 npm 分发成一个“catalog 包”：`@keyflow2/keyflow-kit-catalog`

这样用户侧即使访问不到 GitHub raw，也可以通过 npm registry / 国内镜像拿到官方目录。

### B. 社区/个人 Catalog（用户自由发布）

任何开发者都可以：

1. 把自己的 kit 发布到 npm（例如 `@yourname/keyflow-kit-xxx`）
2. 生成一个自己的 `catalog.json` 和 sidecar icons
3. 把 `catalog.json + icons/` 再发布成 npm 包（例如 `@yourname/keyflow-kit-catalog`）

最终用户只需要添加/订阅这个 catalog（未来 Host 支持 `npm:` source 后可以做到“只粘贴包名”）。

## 2) 如何更新官方 Catalog

1. 更新包列表：编辑 `catalog/official.packages.json`
2. 生成目录：运行

   ```bash
   node scripts/npm/generate-catalog-from-registry.mjs --packages-file catalog/official.packages.json --out-file catalog/official.catalog.json
   ```

   这一步会同时生成 `catalog/official.catalog.assets/icons/...`，用于下载前展示 logo，不需要 VPS/CDN，也不把 base64 图片塞进 JSON。默认只复制一张 `128px` 预览图，避免 catalog 包因为多规格图标变大。

3. 发布目录包（推荐一键）：

   ```bash
   node scripts/npm/sync-official-catalog.mjs --packages-file catalog/official.packages.json --out-file catalog/official.catalog.json --catalog-name @keyflow2/keyflow-kit-catalog --token-file tmp/npm-token.txt
   ```

   或拆开手动发布：

   ```bash
   node scripts/npm/publish-catalog-package.mjs --catalog catalog/official.catalog.json --name @keyflow2/keyflow-kit-catalog --token-file tmp/npm-token.txt
   ```

4. 发布后验证：

   ```bash
   node scripts/npm/verify-npm-catalog.mjs --pkg @keyflow2/keyflow-kit-catalog@<version>
   ```

## 3) 开发者如何“提交上架”到官方 Catalog（让官方知道你发布了）

推荐两种方式（二选一）：

> 重要：请尽量使用**全局唯一**的 `kitId`（`manifest.id`），推荐格式：`"<npmScope>.<kitSlug>"`，避免用户同时订阅多个 catalog 时发生冲突。

### A. 提交 PR（推荐，自动化最好）

1. 先把 kit 发布到 npm（你的包名通常类似：`@<your-scope>/keyflow-kit-<kitId>@<version>`）
2. Fork 本仓库
3. 在你的 PR 里只改一个文件：`catalog/official.packages.json`，新增一行包版本
4. PR 描述里附上：kit 的简介、截图/录屏（可选）、以及 runtime permissions（让审核更快）

维护者合并后，会按 `official.packages.json` 重新生成官方目录并发布到：`@keyflow2/keyflow-kit-catalog`

### B. 提交 Issue（更轻量，但需要人工补写）

如果你不想改 JSON，可以在 GitHub 里用 “Kit Submission” 模板提 Issue：

- 填写 npm 包名+版本
- 填写 kitId / 权限 / 简介
- 维护者确认无误后再把它补进 `official.packages.json`

## 4) 如果你没有 npm 账号怎么办？

- 方案 1（推荐）：注册 npm 账号（免费）→ 自己发布（流程最顺，后续更新也最轻）
- 方案 2：先把 kit 以源码仓库形式发布（GitHub 等）→ 你可以先让用户侧手动安装 ZIP（Host 已支持），等生态成熟再迁移到 npm 分发
