# 下载中心（Function Kit Download Center）需要的能力清单 v0

> 编码：UTF-8  
> 创建时间：2026-04-01T11:10:00+08:00  
> 范围：端内「发现/安装/更新/卸载/管理」的最小闭环能力；可由“内置 Store Kit（Web UI）”承载，但关键安全动作必须由 Host 接管。  

关联文档：

- 方案调研：`TODO/function-kits/store/DOWNLOAD_CENTER_AS_KIT.md`
- Store Kit Runtime APIs：`TODO/function-kit-runtime-sdk/docs/STORE_KIT_APIS.md`
- Catalog API 规范：`TODO/function-kits/KIT_CATALOG_SPEC.md`
- ZIP 包规范：`TODO/function-kits/KIT_PACKAGE_SPEC.md`
- 分发/IP 现实与口径：`TODO/function-kits/DISTRIBUTION_AND_IP.md`

---

## 0. 定义：下载中心 vs 商店 vs 功能件中心

为了避免需求漂移，先把三个东西分清：

- **下载中心（Download Center）**：解决“怎么把 Kit 安装到本机、怎么更新、怎么卸载、怎么启用/禁用、怎么看权限”。它是端内必需品。
- **商店（Store）**：解决“怎么发现好用的 Kit（搜索/分类/榜单/编辑推荐/截图详情）”。它可以先弱、再强。
- **功能件中心（Manager/Settings）**：解决“本机已安装的 Kit 管理入口”。它可以是下载中心的一部分，也可以分成两个 tab。

本清单主要覆盖 **下载中心必须能力**，商店能力用 P1/P2 标注。

---

## 1. 角色与安全边界（必须坚持）

### 1.1 Store Kit 负责 UI，Host 负责安全与执行

对标浏览器扩展：

- 商店页/管理页可以是 Web UI（我们这里是 Store Kit）
- **安装/卸载/更新/权限确认/完整性校验**必须由 Host 执行并强制确认

### 1.2 特权权限（必须有）

下载中心要替代原生界面，必须有“特权能力”：

- `kits.manage`：允许 kit 发起 kit 管理动作（sync/install/uninstall/settings/catalog）
- `files.download`：允许 kit 让 Host 代下远程资源并转换为“本地可加载 URL”（用于图标/截图/README）

原则：

- 仅授予**内置 Store Kit（allowlist kitId）**或后续“签名可信系统 kit”
- 任意第三方 kit **禁止**拿到 `kits.manage`（否则变成装卸载后门）

---

## 2. P0（必须具备）：下载中心最小闭环能力

### 2.1 安装（3 种来源）

1) **从 URL 安装 ZIP**
- 输入：zipUrl（可选 sha256/sizeBytes）
- 输出：安装成功/失败 + kitId + replaced（是否覆盖升级）
- 强制：大小限制、超时、sha256（若提供）、路径穿越拦截、zip bomb 防护

2) **从本地 ZIP 安装**
- UI 侧用 `files.pick` 选 zip
- Host 从 fileId/Uri 读取并安装

3) **从 Catalog 安装（目录模式）**
- Catalog URL 拉取 `packages[]`（见 `KIT_CATALOG_SPEC`）
- 列表展示 + 一键安装某条 entry

> 备注：P0 的“发现”可以很弱（只有 Catalog 列表 + URL/ZIP 安装），但“安装闭环”必须稳。

### 2.2 卸载（必须）

- 仅允许卸载 **user-installed** kits（内置 assets 的 kit 不可卸载）
- 卸载前确认（避免误触）
- 卸载后触发 `kits.sync` 刷新 UI

### 2.3 启用/禁用（必须）

因为用户安装后不一定想立即出现在 bindings 入口里：

- enabled=true/false
- 禁用后：不出现在入口/动作列表里（或进入“已禁用”分组）

### 2.4 权限透明与权限开关（必须）

下载中心必须让用户在安装/更新前后清楚看到：

- kit 声明的 `runtimePermissions[]`
- Host 实际授予的 permissions（可能更少）
- 用户对单 kit 的 permissionOverrides（允许/拒绝/恢复默认）

并支持：

- 安装时：展示权限清单 + 确认
- 更新时：若权限有变化，展示“权限 diff” + 确认
- 安装后：在 kit 详情页随时可关闭某个 permission（override=false）或恢复默认（override=null）

### 2.5 任务化进度与错误反馈（必须）

安装/更新/下载资源都属于耗时操作，必须统一进入 Task Center：

- UI 发起请求时可提供 `task.title`（用户可读）
- Host 推送 `task.update`（queued/running/succeeded/failed + progress + error）
- UI 能看到“正在安装/失败原因/重试”

### 2.6 Kit 详情页（必须）

每个 kit 需要一个详情页，最少展示：

- name / kitId / version / description
- source：bundled / user-installed（以及来自哪个 catalog source，可选）
- 开发者信息（至少展示“发布者/来源标识”，并区分 claimed vs verified，避免用户被 kit 自报信息欺骗）
- 支持与政策链接（至少能放：官网/问题反馈入口/隐私政策；P0 可以先只展示占位与链接）
- runtimePermissions（声明）+ permissionOverrides（实际）
- bindings 列表（用于理解“装了能干啥”，并利于入口配置）

### 2.7 兜底与恢复（必须）

为了避免“把管理入口做成 kit 后把自己锁死”：

- Host 必须提供一个**原生兜底入口**：
  - 重置 Store Kit（删除 user-installed 覆盖版，回退到 assets 内置）
  - 紧急安装（从 URL/ZIP 安装）或至少能打开旧原生下载中心

---

## 3. P1（应该具备）：变成“好用的商店/下载中心”

### 3.1 多 Catalog 源 + 优先级 + 缓存

- sources 列表：新增/禁用/删除/排序
- 每个 source 可刷新、显示最后错误
- Host 缓存 packages（离线仍能看上次列表）

### 3.2 更新策略（检查更新 / 一键更新 / 回滚）

- 检查更新：对比 installed version vs catalog latest
- 一键更新：走 install(replace) 但必须做权限 diff 确认
- 回滚：保留上一个版本的备份（或至少能“卸载覆盖版回退到内置版本”）

### 3.3 图标/截图/README 展示（建议资源代理）

即使 Host 允许 WebView 直接外链图片/样式，为了做到“像商店”（更快、更省流量、可离线、可审计、可校验），仍然强烈建议提供：

- `files.download(url)`：Host 下载并落盘，返回 `fileId`（可做大小限制/域名白名单/缓存）
- `files.getUrl(fileId)`：返回可在 WebView 加载的本地 URL（`https://function-kit.local/assets/...`）
- 缓存策略：ETag/TTL/按 url 去重（避免每次进商店都重下）

### 3.4 搜索/分类/筛选（商店体验）

- 支持按 categories/tags/权限筛选
- 支持搜索 name/description/tags
- 支持“已安装/可更新/已禁用”等快速筛选

### 3.5 开发者信息与支持（商店信任的基本盘）

必须能展示并区分：

- **发布者（Developer/Publisher）**：名称、主页、联系方式（至少一个）、所属组织（可选）
- **验证状态**：未验证 / 已验证（由商店背书）/ 官方（平台内置）
- **支持入口**：问题反馈（issues/工单/邮箱）、FAQ（可选）
- **政策链接**：隐私政策、使用条款（尤其是涉及网络/AI 的 kit）

设计注意：

- 不要信任 kit 自己在 manifest 里填的“作者”，商店页展示必须优先使用 **商店侧元数据**（store-index / store API），并把 kit 自报信息标为 *claimed*。

### 3.6 版本、更新日志与兼容性

- 版本历史（至少 latest + 上一个版本）
- 更新日志（changelog）展示
- 兼容性提示：platforms、最低 Host 版本、破坏性变更提示（可选）
- 更新策略 UI：
  - 自动更新（开关，P1 可先不实现自动下载）
  - 仅 Wi‑Fi 更新（移动端）
  - 更新前“权限变化确认”（必须）

### 3.7 评分与评价（需要多想几步：反作弊 + 治理）

展示（只读）能力：

- 平均分、评分数、版本分布（可选）
- 评价列表：按“最新/最有帮助/版本”排序
- 评价与版本绑定：避免旧版本差评永久污染新版本

写入（可选，通常 P2 做）能力：

- 登录/身份（否则一定被刷）
- 限流与反作弊：设备指纹/账号冷启动限制/同一 kit 频控
- 举报与审核：垃圾评价、辱骂、钓鱼链接
- 开发者回复（可选）

### 3.8 举报、下架与安全反馈入口（用户侧必须可达）

- 举报 kit（恶意/侵权/欺诈/隐私风险）
- 报告安全漏洞（security contact）
- 下架/撤回后的展示策略：
  - 已安装用户：显示“已下架原因 + 建议卸载/禁用”
  - 未安装用户：不可安装，但可查看说明（避免黑盒）

### 3.9 信任与风险提示（把“权限”翻译成人话）

- 权限徽标与解释（例如：可读上下文/可改输入/可联网/可用 AI/可拦截发送）
- 风险分级（由商店计算）：例如低/中/高（基于权限 + 行为声明）
- 安装/更新确认页展示：权限清单 + 差异 + 变更原因（可选）

### 3.10 推荐与运营位（不靠搜索也能发现）

- 精选集合（Collections）：例如“写作/隐私/粘贴增强/聊天效率”
- 编辑推荐（Editor’s pick）与原因（短文案）
- 趋势/热门（需要统计，P2 更合理）

---

## 4. P2（可选）：治理与信任锚

- 商店签名/验签（信任锚）
- 黑名单/下架/撤回（治理）
- 安装统计/下载统计（匿名化，serverless）
- 开发者身份与发布体系：账号、组织、权限、2FA（否则评分/发布都会被滥用）
- 开发者发布工作流（PR 审核、自动生成 catalog/store-index）
- 审核与扫描：schema 校验、权限过度提醒、基本静态扫描（可选）
- 评分/评论写入：账号绑定、反作弊、审核、开发者回复
- 举报与合规：侵权/钓鱼/隐私风险的处理流程与可追溯记录
- 商业化（可选）：付费/订阅/分成/退款（强依赖账号与支付体系）

---

## 5. 下载中心需要的 Runtime/Host API 映射（v0）

> 这是“Store Kit 想替代原生下载中心 UI”必须具备的接口面；目前 SDK 已补齐，但 Host 侧仍需实现这些 message types。

### 5.1 Kits 管理（需要 `kits.manage`）

- `kits.sync.request` → `kits.sync`
- `kits.open` → `kits.open.result`
- `kits.install` → `kits.install.result`（并持续 `task.update`）
- `kits.uninstall` → `kits.uninstall.result`
- `kits.settings.update` → `kits.settings.update.result`

SDK 对应：

- `kit.kits.sync/open/install/uninstall/updateSettings`

### 5.2 Catalog 源管理（建议也归入 `kits.manage`）

- `catalog.sources.get|set` → `catalog.sources.sync`
- `catalog.refresh` → `catalog.sync`

SDK 对应：

- `kit.catalog.getSources/setSources/refresh`

### 5.3 资源代理（需要 `files.download`）

- `files.download` → `files.download.result`
- `files.getUrl` → `files.getUrl.result`

SDK 对应：

- `kit.files.download/getUrl`

> Android 侧要能把 `files.getUrl` 返回的 URL 映射到 WebViewAssetLoader 允许的路径前缀（例如新增 `/assets/files/` path handler）。

### 5.4 商店元数据 / 评分等“读写能力”的承载方式（重要）

下载中心/商店 UI 里你提到的：开发者信息、评分、评价、集合推荐等，通常不应该走 Host Bridge 扩展消息（否则宿主要背太多业务演进成本）。更合理的分层：

- **读（展示）**：Store Kit 通过 `catalog.refresh` 拿到 packages 列表；再通过 `network.fetch`（或未来 `store.*` 专用 API）读取 `store-index.json` / 详情 API / 评分 API。
- **图像资源**：通过 `files.download` → `files.getUrl` 变成本地可加载 URL（缓存/离线/审计/校验；也便于未来策略收紧时不改前端）。
- **写（评价/评分/举报）**：走商店后端 API（serverless），必须有账号/反作弊/审核；不建议让 Host “代发评价”。

---

## 6. 验收清单（P0）

1) 从 URL 安装 zip：成功安装并能打开 kit  
2) 从本地 zip 安装：成功安装并能打开 kit  
3) 设置 Catalog URL：能拉到 packages 列表并一键安装  
4) 卸载 user-installed kit：卸载后 kit 不再出现在已安装列表  
5) 启用/禁用：禁用后不出现在 bindings 入口（或明确标识禁用）  
6) 权限：安装时能看到权限清单；安装后能关闭某个 permission 并立即生效  
7) 任务中心：安装/更新有 task；失败能看到错误并可重试  
8) 兜底：Store Kit 挂了仍能通过原生入口重置/恢复
