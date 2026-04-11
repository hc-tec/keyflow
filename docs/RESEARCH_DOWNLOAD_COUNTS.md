# 下载量展示调研报告

适用范围：Keyflow 的发布与生态统计（APK 分发、npm 功能件/模板下载、仓库访问量）。

目标：

- 明确“下载量”在不同平台的口径、可见性与限制
- 给出 Keyflow 当前分发方案下的最稳展示方式
- 为后续在下载中心/官网/README 增加“热度/下载量”提供可落地的数据源

## 1. 先定义“下载量”的口径

不同平台的“下载”不是同一个指标，常见有三种：

- Release 资产下载次数：某个 APK 附件被下载了多少次（GitHub Releases 常见）
- 仓库访问/克隆：用户打开仓库页面、git clone 的次数（GitHub Traffic）
- 包管理器下载：npm 包被拉取/安装的次数（npm downloads）

注意：这些都不等价于“安装量/活跃用户数”。可能包含重复下载、镜像缓存、CI 拉取、爬虫等噪声。

## 2. GitHub Releases（Keyflow APK 分发入口）

### 2.1 UI 展示

- GitHub Releases 页面会在每个 release asset（例如 `keyflow-0.1.5-arm64-v8a-release.apk`）旁展示下载次数。
- 这个数字是“该 asset 的累计下载次数”，按文件维度计数。

### 2.2 API 能力

GitHub REST API 的 release/release asset 对象中包含 `download_count` 字段，可用于自动化汇总：

- 获取 tag 对应 release：`GET /repos/{owner}/{repo}/releases/tags/{tag}`
- 或列出 releases：`GET /repos/{owner}/{repo}/releases`
- 返回的 assets 中带 `download_count`

参考：

- GitHub REST API Releases 文档：https://docs.github.com/en/rest/releases/releases

### 2.3 适合 Keyflow 的展示建议

Keyflow 的 APK 只挂 `keyflow` 仓库 Releases，因此：

- 对普通用户：直接依赖 GitHub UI 的 per-asset 下载数即可，不需要额外做统计页
- 对 README/官网：可以加 badge（“latest release 下载总数”“总下载数”）降低用户找数据成本

Badge 常见形式（以 shields.io 为例，具体路径按仓库替换）：

```text
https://img.shields.io/github/downloads/<owner>/<repo>/total.svg
https://img.shields.io/github/downloads/<owner>/<repo>/latest/total.svg
```

参考：

- shields.io badge 文档：https://shields.io/badges/git-hub-downloads-all-assets-latest-release

## 3. GitHub Traffic（仓库访问与克隆趋势）

### 3.1 UI 展示

GitHub 仓库 `Insights -> Traffic` 会展示：

- Views（页面访问）
- Clones（克隆）
- Unique（去重）
- Referrers / Popular content 等

### 3.2 API 能力与限制

GitHub REST API 提供 traffic endpoints（views/clones 等），但：

- 需要对仓库有 push 权限才能访问
- 仅保留最近 14 天数据（用于短期趋势分析）

参考：

- Viewing traffic to a repository：https://docs.github.com/github/visualizing-repository-data-with-graphs/accessing-basic-repository-data/viewing-traffic-to-a-repository
- Traffic API：https://docs.github.com/en/rest/metrics/traffic

### 3.3 适合 Keyflow 的使用方式

如果要长期趋势（例如月度报表），需要自己定期抓取并落库（例如写入 `artifacts/stats/*.json` 或外部表），否则 14 天后会丢失历史。

## 4. npm 下载量（功能件/模板/CLI 生态）

Keyflow 的功能件/模板/脚手架发布在 npm（例如 `@keyflow2/*`），npm 有公开的下载统计。

### 4.1 UI 展示

- npmjs.com 页面常见展示 weekly downloads（近 7 天）

### 4.2 API 能力

npm 官方下载统计 API：

- point：`https://api.npmjs.org/downloads/point/last-week/<pkg>`
- range：`https://api.npmjs.org/downloads/range/2026-01-01:2026-01-31/<pkg>`

参考：

- npm/download-counts：https://github.com/npm/download-counts

### 4.3 适合 Keyflow 的展示建议

如果要在 `kit-store` 里显示“下载量/热度”：

- 不建议客户端逐个向 npm API 发请求（耗时、限流、弱网体验差）
- 建议在 catalog 构建/发布时离线抓取统计，把“last-week downloads”写入 catalog（或单独的 sidecar stats 文件），客户端只读 catalog 即可
- UI 上要明确这是“下载量（近 7 天）”而不是“安装量”

## 5. F-Droid（如果未来考虑上架）

F-Droid 强调隐私，客户端/生态通常不以“下载量”作为强展示指标。

参考：

- F-Droid FAQ（客户端）：https://f-droid.org/en/docs/FAQ_-_Client/

## 6. 推荐方案（按 Keyflow 当前分发策略落地）

### 6.1 对用户（Release 页）

- 继续使用 GitHub Releases 自带的 per-asset 下载次数
- Release 说明里不要写死“下载量数字”（会变化，且发布瞬间几乎为 0）
- 如需强调可信：提供 `SHA256SUMS.txt`（已做），并引导用户核对

### 6.2 对开发者（README/官网）

- README 增加：
  - GitHub downloads badge（latest/total）
  - npm weekly downloads badge（功能件/模板/CLI）

npm badge 常见形式：

```text
https://img.shields.io/npm/dw/<package>.svg
```

### 6.3 对产品（下载中心“热度”）

- 热度字段建议以 npm last-week downloads 作为近似指标
- 从 catalog 侧离线生成，避免客户端实时请求
- UI 明确口径，避免用户误解为“安装量/活跃”

## 7. 后续可做（可选）

- 增加 `scripts/stats/`：定时抓取 GitHub release assets `download_count`，输出一份可读报表（例如 `tmp/stats/releases.json`）
- catalog 构建时注入 npm downloads（`downloads_last_week`），并在 kit-store 列表页支持排序/筛选

