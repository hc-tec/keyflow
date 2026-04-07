# Function Kit 安装包（ZIP）规范 v0（给 Download Center / KitStudio 用）

> 目标：定义一个**可被 Android Host 的“下载中心”安装**的 Function Kit ZIP 包格式，并给 KitStudio/分发工具实现提供确定的工程口径。

---

## 0. 背景与术语

- **Kit**：一个 Function Kit（目录内包含 `manifest.json` 与 UI 资源等）。
- **Kit ID**：`manifest.json` 的 `id` 字段。
- **Kit 包（ZIP）**：用于“安装/更新/回滚”的分发产物。
- **Host（Android）**：当前实现会把 Kit 解压到应用内部存储（device-protected）并用 WebViewAssetLoader 加载。

对应实现：
- 安装器：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitPackageManager.kt`

---

## 1. ZIP 结构（核心规则）

### 1.1 必须包含 `manifest.json`

ZIP 内**必须**存在至少一个 `manifest.json` 文件：
- 可以位于 ZIP 根目录：`manifest.json`
- 也可以位于某个子目录：`<any-prefix>/manifest.json`

Android Host 的查找规则（重要）：
- 会扫描 ZIP 所有 entry，找出所有 `manifest.json` 候选（`manifest.json` 或 `*/manifest.json`）。
- **选择“目录层级最浅”的那一个**作为最终 manifest（即 `/` 分隔符最少的路径）。
- 然后把该 manifest 所在目录作为 **rootPrefix**，只解压该 rootPrefix 下的文件。

建议打包口径：
- 推荐把整个 Kit 放到一个顶层目录里：`<kitId>/manifest.json` + 其它文件。
  - 好处：ZIP 根目录干净，且 manifest 冲突概率低。

### 1.2 `manifest.json` 必须包含合法 `id`

- `manifest.id` 必须存在且非空。
- 允许字符：`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$`
- Host 以该 `id` 作为安装目录名：`<app-internal>/function-kits/<kitId>/...`

### 1.3 路径必须是“相对路径”，禁止穿越

Host 会拒绝异常路径（示例）：
- 空 segment、`.`、`..`
- 任何企图目录穿越的 entry

---

## 2. 解压后的目录结构（Host 侧约定）

安装成功后，Host 内部存储期望结构为：

```
<filesDir>/function-kits/<kitId>/
  manifest.json
  ui/...
  icons/...
  (其它你打包进去的文件)
```

manifest 内的资源路径（例如 `entry.bundle.html = "ui/app/index.html"`）会被解析为：
- `function-kits/<kitId>/ui/app/index.html`

WebView 最终加载 URL 为：
- `https://function-kit.local/assets/function-kits/<kitId>/ui/app/index.html`

---

## 3. 建议的“打包内容筛选”

Host 当前不会强制白名单目录（只做安全限制与大小限制），但为了体积/隐私/IP 成本，**建议 pack 工具默认排除**：
- `tests/**`
- `tools/**`
- `skills/**`
- `node_modules/**`
- `**/.git/**`
- `README.md`（可选）

建议保留：
- `manifest.json`
- `ui/**`
- `icons/**`
- 任何 manifest/代码实际引用到的静态资源

---

## 4. 安全与 IP（现实约束）

只要你把 UI 以 HTML/JS/CSS 形式分发到客户端，代码就天然可读（zip/crx/apk assets 都一样）。  
正确做法是：
- **不要把 secrets 放进包里**
- 核心逻辑尽量走 **Host 代管能力** 或 **服务端**
- 需要完整性时做 **sha256 / 签名**（解决篡改，不解决可读）

详见：`TODO/function-kits/DISTRIBUTION_AND_IP.md`

---

## 5. 给 KitStudio 的实现建议（最小可用）

KitStudio 作为开发者工具，建议提供：

### 5.1 打包器（pack）
- 输入：workspace 下某个 Kit 目录（含 `manifest.json`）
- 输出：ZIP（顶层目录推荐用 `<kitId>/...`）
- 产物信息：`kitId/name/version/sizeBytes/sha256/updatedAt`

### 5.2 本地分发（serve）
- `GET /api/kit-packages` → 列出所有可打包 kit + 元数据
- `GET /api/kit-packages/<kitId>.zip` → 返回 ZIP（可缓存/ETag）
- `GET /api/kit-packages/<kitId>.json` → 返回 metadata（含 sha256）

### 5.3 UI（复制安装链接）
- UI 展示 `Install URL`（用于 Android 下载中心粘贴）
- （可选）二维码，降低手机输入成本

验收方式：
- Android（fcitx5-android）→ Settings → Function Kit → Download Center → Install from URL
- 粘贴 KitStudio 的 `.../<kitId>.zip` 链接并成功安装

