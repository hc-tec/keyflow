# Kit Catalog Spec（功能件目录 API 规范）

> 编码：UTF-8  
> 创建时间：2026-03-31T17:40:00+08:00  
> 范围：Android Host「下载中心」Catalog 模式 & KitStudio `serve` 对接

## 目标

- 解决“用户不可能一个个翻找/搜索功能件”的摩擦：提供一个**可粘贴 URL 的目录入口**，让 Host 直接拉取可安装 Kit 列表并一键安装。
- 让 KitStudio（或任何服务器）能稳定地向 Host 提供：**列表 + 安装包 ZIP 下载链接 + 完整性校验**。

## Host 现状（实现参考）

- Android：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/ui/main/settings/functionkit/FunctionKitDownloadCenterFragment.kt`
- Host 拉取与解析：`GET <catalogUrl>`，读取 JSON 的 `packages[]`。
- 若条目提供 `sha256`（hex），Host 会对下载到的 ZIP 做 SHA-256 校验（不匹配则拒绝安装）。

## API

### 1) Catalog Index（必选）

**请求**

- `GET <catalogUrl>`
- Header（Host 会带，但服务端可不强依赖）：
  - `Accept: application/json`

**响应（JSON）**

```json
{
  "packages": [
    {
      "kitId": "chat-auto-reply",
      "name": "Chat Auto Reply",
      "version": "0.1.0",
      "sizeBytes": 1234567,
      "sha256": "0f3a... (64 hex chars)",
      "zipUrl": "./chat-auto-reply.zip"
    }
  ]
}
```

#### `packages[]` 字段定义

每个 package 对象支持以下字段（未知字段 Host 会忽略，方便扩展）：

- `kitId`（string，**必填**）
  - 语义：包标识；Host 用于展示、错误提示、以及在 `zipUrl` 缺省时拼接默认下载地址。
  - 约束：建议与 ZIP 中 `manifest.json` 的 `id` 保持一致（否则安装完成后 UI 展示会出现“kitId 与实际 id 不一致”的困惑）。
- `name`（string，可选）：展示名。
- `version`（string，可选）：展示用版本号。
- `sizeBytes`（number/int，可选）：展示用体积（字节）。
- `sha256`（string，可选）
  - 语义：**ZIP 文件内容**的 SHA-256（hex，大小写不敏感）。
  - 作用：Host 下载后做完整性校验，不匹配则拒绝安装。
- `zipUrl`（string，可选）
  - 语义：ZIP 下载地址，支持绝对 URL 或相对 URL。
  - 相对 URL 解析：以 `catalogUrl` 作为 base（等价于 `new URL(catalogUrl + "/")`）。
  - 缺省行为：若未提供 `zipUrl`，Host 会退化为：`{catalogUrl.trimEnd("/")}/{kitId}.zip`。

#### 错误处理约定

- 非 2xx：Host 会显示 `HTTP <status>` 的错误摘要（并保留原目录 URL）。
- JSON 缺失 `packages[]`：Host 显示 `Missing packages[]`。

### 2) ZIP 下载（推荐）

Catalog index 中每个条目最终都会落到一个 zip 下载 URL（`zipUrl` 或 Host 默认拼接）。

**建议**

- `Content-Type`：`application/zip` 或 `application/octet-stream`
- 支持 `ETag` / `If-None-Match`（可选）：减少重复下载
- HTTPS：生产环境建议使用 HTTPS（真实性与中间人攻击风险）

## 安全/完整性建议（P0）

- `sha256`：强烈建议提供（Host 会验证），用于：
  - 防止缓存污染/下载中断导致的坏包被安装
  - 给用户/开发者可核对的“内容指纹”
- “防源码泄露”的现实口径：参见 `TODO/function-kits/DISTRIBUTION_AND_IP.md`
  - ZIP 本质上可读（对标浏览器扩展）；若需更强保护，应将核心逻辑移到服务端/宿主能力侧，或做签名+鉴权+按账号发包等工程化方案。

## KitStudio 对接建议

KitStudio `serve` 建议实现（已写入其 TODO）：

- `GET /api/kit-packages` → 返回本规范的 index JSON（`packages[]`）
- `GET /api/kit-packages/<kitId>.zip` → 对应 ZIP
- `GET /api/kit-packages/<kitId>.json` → 单个条目的 metadata（可选）

并复用 ZIP 规范：`TODO/function-kits/KIT_PACKAGE_SPEC.md`

