# Function Kit Store（功能件商店）索引

> 编码：UTF-8  
> 创建时间：2026-03-31T18:30:00+08:00  
> 目标：把“发现/搜索/下载/更新/审核/签名/分发”整理成可落地方案，并与当前 Host 的 Catalog/ZIP 规范对齐。  

## 先读结论（P0 推荐路线）

在不买 VPS 的前提下，最快落地“真正能用的商店”：

1) 用 **GitHub Repo + Pull Request** 作为“提交/审核/下架”的治理机制  
2) 用 **GitHub Actions** 做打包校验（manifest/schema/权限/哈希）并生成 `catalog.json`  
3) 用 **GitHub Pages** 托管：
   - `catalog.json`（给 Host 安装/更新用）
   - `store-index.json`（给 Web/端内商店 UI 做搜索/分类用）
   - 静态商店页面（可选）
4) 用 **GitHub Releases（或 Pages 静态目录）** 托管 kit ZIP（`zipUrl` 指向这里）

这已经具备：

- 有“商店入口”的**可安装列表**（catalog）
- 有“发布/审核”的**治理机制**（PR review）
- 有“内容指纹”的**完整性校验**（sha256）

后续要做更强的“真正商店”能力（榜单/搜索排序/统计/分发控制/签名信任链），再升级到 serverless（Cloudflare/Supabase）即可，不需要推倒重来。

## 规范与对接

- Catalog API（Host 拉取可安装列表）：`TODO/function-kits/KIT_CATALOG_SPEC.md`
- Kit ZIP 包格式（Host 安装/解包规则）：`TODO/function-kits/KIT_PACKAGE_SPEC.md`
- 分发与 IP（“zip 可读”的现实 + 风险口径）：`TODO/function-kits/DISTRIBUTION_AND_IP.md`

## 商店方案（细化）

- 商店 MVP / 数据模型 / API / 无 VPS 发布流程 / 风险与签名路线：`TODO/function-kits/store/STORE_PLAN.md`
- 下载中心/商店 UI 改成“内置 Store Kit（Web UI）”的可行性与接口提案：`TODO/function-kits/store/DOWNLOAD_CENTER_AS_KIT.md`
- 下载中心需要的能力清单（P0/P1/P2 + API 映射 + 验收）：`TODO/function-kits/store/DOWNLOAD_CENTER_CAPABILITIES.md`
- WebView 外部资源加载调研（WebView 能 vs 宿主策略）：`TODO/function-kits/store/WEBVIEW_EXTERNAL_RESOURCES_RESEARCH.md`
- 在 Kit UI 中使用 Vue / 组件库：可行性调研与落地方案：`TODO/function-kits/store/VUE_AND_COMPONENT_LIBS_IN_KIT_UI.md`
