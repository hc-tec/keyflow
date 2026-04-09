# Function Kit 开发者手册（Android WebView Host + Runtime SDK + 零构建 UI）

> 编码：UTF-8  
> 创建时间：2026-04-02  
> 更新时间：2026-04-08  
> 目标：给“功能件（Function Kit）开发者”一份**可直接照做**的手册：从目录结构、导包方式、WebView 约束、安全模型、权限与 binding、到结果呈现与生命周期，尽量把坑一次讲清。

本手册以 **Android Host（fcitx5-android）** 为事实来源，同时尽量保持“跨平台（Windows/Android）一致”的 kit 写法：**UI 只依赖 `FunctionKitRuntimeSDK.createKit()`**，宿主差异留在 Host Adapter。

---

## 0. 先读什么（最低阅读路径）

如果你只想“最快写出一个可跑的 kit”，按顺序读：

1. Starter 模板（npm 包 + KitStudio 开箱预览）：`TODO/function-kits/STARTER_TEMPLATE.md`
2. 本手册：`TODO/function-kits/DEVELOPER_GUIDE.md`
3. Runtime SDK 总览：`TODO/function-kit-runtime-sdk/README.md`
4. 权限与能力清单：`TODO/function-kit-runtime-sdk/docs/CAPABILITIES_AND_PERMISSIONS.md`
5. Bindings 语义（`binding.invoke`）：`TODO/function-kit-runtime-sdk/docs/BINDINGS.md`
6. Host Bridge 协议（想看底层再读）：`TODO/function-kits/host-bridge/README.md`

---

## 1. 你在写什么（概念与边界）

### 1.1 三个角色

- **Kit（功能件）**：一个目录，包含 `manifest.json` + Web UI（HTML/CSS/JS）+ 静态资源。
- **Kit UI（浏览器式页面）**：在 Android 的 `WebView` / Windows 的 `WebView2` 中运行。
- **Host（宿主）**：输入法侧的原生容器；负责安全隔离、权限、上下文捕获、最终写回输入框、任务中心、安装/卸载等。

### 1.2 两条红线（必须遵守）

1. **UI 不能直接触碰高权限原生对象**（例如 InputConnection）。  
   你只能通过 Runtime SDK 走 Host Bridge，由宿主执行最终动作。
2. **不要依赖 DOM Storage**（Android Host 默认禁用 `localStorage/sessionStorage/IndexedDB`）。  
   任何持久化都必须走 `kit.storage.*`（宿主按 kitId 做隔离与权限控制）。

事实来源：
- 安全模型：`TODO/function-kit-runtime-sdk/docs/SECURITY_MODEL.md`
- Android WebView 设置：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`

---

## 2. 目录结构（Kit 该怎么放）

### 2.1 最低目录约定（推荐）

> 你可以不完全一样，但**强烈建议**遵循：现成样板、相对路径、打包脚本、测试夹具都会更顺。

```
TODO/function-kits/<kitId>/
  manifest.json
  ui/
    README.md
    app/
      index.html
      main.js
      styles.css
  icons/
    icon-48.png
    icon-64.png
    icon-96.png
    icon-128.png
    icon-256.png
  tests/
    fixtures/
      *.json
```

更多约定与索引：`TODO/function-kits/INDEX.md`

### 2.2 共享目录（不要用 `_shared/`）

Android 打包时会把共享资源同步到 APK assets；目录名不要以下划线开头（历史坑：Android assets 可能忽略）。

- 共享目录：`TODO/function-kits/shared/`
  - UI 共享样式：`TODO/function-kits/shared/ui/`
  - 第三方库（已下载到本地）：`TODO/function-kits/shared/vendor/`

事实来源（Gradle 同步任务）：`TODO/ime-research/repos/fcitx5-android/app/build.gradle.kts`（`syncFunctionKitAssets`）

---

## 3. 支持哪些“打包/分发方式”（非常重要）

### 3.1 方式 A：随 APK 内置（开发/预装）

Android app 构建时会把 workspace 里的 kit 目录同步进 APK 的 assets：

- `TODO/function-kit-runtime-sdk/dist/` → `assets/function-kit-runtime-sdk/dist/`
- `TODO/function-kits/shared/` → `assets/function-kits/shared/`
- `TODO/function-kits/<kitId>/`（含 `manifest.json`）→ `assets/function-kits/<kitId>/`

同步规则（会排除一些目录，避免把开发材料塞进 APK）：

- 每个 kit 会排除：`README.md`、`skills/**`、`tools/**`、`tests/**`
- `bridge-debugger` kit 被排除（不内置分发）

事实来源：`TODO/ime-research/repos/fcitx5-android/app/build.gradle.kts`（`functionKitExcludedIds` + `exclude(...)`）

> 这意味着：**UI 运行时需要的静态资源，请放在 `ui/**` 或你确定不会被排除的路径下**。  
> 不要指望在 APK 内置模式下还能读取 `tests/fixtures` 或 `tools`。

### 3.2 方式 B：用户安装 ZIP（Download Center / Store）

Android Host 支持从 ZIP 安装 kit（解压到应用内部存储），并通过 WebViewAssetLoader 加载。

你必须遵守 ZIP 规范：

- 规范：`TODO/function-kits/KIT_PACKAGE_SPEC.md`
- Android 安装器实现：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitPackageManager.kt`

关键规则（务必知道）：

- ZIP 内必须存在 `manifest.json`（根目录或子目录均可）
- 若 ZIP 有多个 `manifest.json`：Host 选择“目录层级最浅”的那个
- Host 会做路径穿越拦截、entry 数量/体积限制、zip bomb 防护（见实现）

### 3.3 资源加载“优先级”（用户安装覆盖内置）

同一个 `kitId`：

1. **优先加载用户安装目录**（内部存储 `filesDir/function-kits/<kitId>/...`）
2. 否则回退到 APK assets 内置（`assets/function-kits/<kitId>/...`）

事实来源：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`（`FunctionKitInstalledFirstPathHandler`）

### 3.4 方式 C：npm package（实验 / 推荐用于分发）

> 背景：国内常见网络环境下，GitHub raw / Vercel 等分发链路不稳定；npm（及国内镜像）更容易“可达”。

核心思路：把 kit 目录做成一个 **npm package**，用 `npm pack` 生成 `.tgz`，并用 `dist.integrity`/sha256 做完整性校验。

- 包名建议：`@keyflow2/keyflow-kit-<kitId>`（官方）或 `@<your-scope>/keyflow-kit-<kitId>`（社区）
- 包内容建议：只包含运行必需文件（`manifest.json` + `ui/**` + 静态资源），不要带 `node_modules`
- 工具脚本（本仓库）：`scripts/npm/README.md`
- 官方/社区 catalog（JSON + npm 分发）：`catalog/README.md`
- npm catalog 规范：`TODO/function-kits/KIT_CATALOG_NPM_SPEC.md`
- 开发者 starter 模板（vendored runtime/petite-vue/shadcn.css + KitStudio 启动脚本）：`TODO/function-kits/STARTER_TEMPLATE.md`
- 没有 npm 账号怎么办：
  - 最快：注册 npm 账号（免费）后自己发布
  - 或者：先按 ZIP 分发（Host 已支持），等官方/社区渠道成熟后再迁移到 npm

---

## 4. Android WebView 环境：到底支持什么 / 禁什么

这一节是“你写 UI 时一定会踩到的限制”。

### 4.1 固定 origin 与 URL 形态

Android Host 将所有 kit 放到同一固定 origin 下：

- Local origin：`https://function-kit.local`
- 资产前缀：`/assets/`

实际加载 URL（示例）：

- Kit 入口页：`https://function-kit.local/assets/function-kits/<kitId>/ui/app/index.html`
- Shared CSS：`https://function-kit.local/assets/function-kits/shared/ui/kit-shadcn.css`
- Runtime SDK：`https://function-kit.local/assets/function-kit-runtime-sdk/dist/function-kit-runtime.js`

事实来源：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`（`DefaultLocalDomain` / `DefaultAssetPathPrefix` / `createDefaultAssetLoader`）

### 4.2 默认 CSP（你能加载哪些外部资源）

Android Host 会给 HTML 注入 CSP（仅对 HTML 响应生效）：

```
default-src 'self';
base-uri 'none';
object-src 'none';
frame-src 'none';
form-action 'none';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' https: 'unsafe-inline';
img-src 'self' https: data: blob:;
media-src 'self' https: data: blob:;
font-src 'self' https: data:;
```

结论（最重要的几条）：

- **外链脚本（https://...js）默认不允许**：`script-src` 没有 `https:`  
  → 你想用 Vue/组件库/第三方库，必须把 `.js` 下载到本地并用 `<script src="...">` 引入。
- **外链 CSS/图片/字体**：CSP 允许 `https:`（但仍建议本地化/走 Host 代理，见 4.5）。
- **允许 inline script / eval**：为了兼容某些“浏览器整包”库（例如 runtime-compiler、模板编译器）。  
  → 允许不等于推荐：业务代码仍建议放在单独的 `main.js`。

事实来源：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`（`DefaultContentSecurityPolicy`）

### 4.3 WebView Settings（会直接影响你的代码）

Android Host 初始化 WebView 时的关键设置：

- ✅ `javaScriptEnabled = true`
- ❌ `domStorageEnabled = false`（`localStorage/sessionStorage/IndexedDB` 全禁）
- ❌ `allowFileAccess = false` / `allowContentAccess = false`（不能 `file://` 读盘，也不能直接读 `content://`）
- ❌ `mixedContentMode = NEVER_ALLOW`（https 页面不能加载 http 子资源）
- ❌ Cookie 全禁（含 third-party）
- ❌ 下载全禁（`setDownloadListener` 直接拦截）
- ❌ Web 权限申请默认 `deny`（摄像头/麦克风/地理位置等）
- ❌ `window.open`/多窗口不支持（`setSupportMultipleWindows(false)` + `onCreateWindow=false`）
- ✅ `mediaPlaybackRequiresUserGesture = true`（音视频必须用户手势触发）
- ✅ `isLongClickable = true`（长按可出系统复制/粘贴菜单）

事实来源：同上（`initialize(...)`）

### 4.4 导航策略（外链怎么处理）

- 允许加载本地 assets（`https://function-kit.local/assets/...`）
- 主框架（main frame）导航到 `http/https`：
  - 不在 WebView 内打开
  - 交给系统浏览器 `Intent.ACTION_VIEW`
- 其它 scheme / 非法导航：直接拦截

事实来源：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`（`shouldOverrideUrlLoading`）

### 4.5 外部子资源（图片/CSS/字体）到底能不能用？

当前 Android Host **默认允许** WebView 加载外部子资源（但仍受 CSP 约束，且不允许外链脚本）：

- 允许：`<img src="https://...">`、`<link rel="stylesheet" href="https://...">` 等
- 不允许：`<script src="https://...">`（CSP 禁）

事实来源：
- CSP：`DefaultContentSecurityPolicy`
- WebViewClient：`shouldInterceptRequest`（当 `allowExternalResources=true` 且非 main frame 时放行）

工程口径（建议）：

- **业务 kit 尽量不依赖外网静态资源**（隐私、稳定性、可审计、离线、未来策略收紧）。  
- 如果你需要“商店/下载中心”那种展示远程图标/截图：可以先直接用 https 图片；更严谨的做法是走 Host 代理缓存（见 Store Kit API 文档）。  

参考：`TODO/function-kit-runtime-sdk/docs/STORE_KIT_APIS.md`

> 注意：`files.download / files.getUrl` 在 SDK 中存在，但 **Android Host 目前尚未实现**（会返回 `bridge.error`）。  
> 事实来源：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`（`files_download_not_implemented` / `files_get_url_not_implemented`）

### 4.6 WebView 内输入（Composer Bridge）：你只写普通输入控件即可

在 IME 场景里，一个常见坑是：“WebView 里的 `<input>` 能不能正常打字/选中/删改？”  
本项目的结论是：**能**，但靠的是 SDK 内置的 *composer bridge*（宿主接管输入路由）。

你需要知道的事实：

- 当用户在 kit 页面聚焦 `<input>/<textarea>/<contenteditable>` 时，SDK 会自动用 `composer.*` 消息把焦点/文本/选区同步给宿主。
- 宿主会把真实键盘输入路由到一个“草稿缓冲区”，再用 `composer.state.sync` 回填给页面，让你看到一致的输入效果。
- kit 作者无需调用任何“特殊输入 API”，**写正常的表单控件即可**。

开发建议（能避免 80% 的输入异常）：

- 不要在输入控件上全局 `preventDefault()` 关键键盘事件（尤其是 `keydown`），除非你真的要做自定义编辑器。
- 用 `<textarea>` 承载多行编辑，不要自己模拟。
- 对 `contenteditable` 要更谨慎：尽量限制为简单富文本，且真机验证。

事实来源：
- SDK 说明：`TODO/function-kit-runtime-sdk/README.md`（Composer Bridge (Internal)）
- Host 处理：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`（`composer.*` handlers）

---

## 5. UI 技术路线：不走 Vite/Webpack 的“零构建”怎么选

### 5.1 结论（推荐路线）

在当前约束下（固定 origin + CSP 禁外链脚本 + DOM Storage 禁用），最稳的路线是：

- **纯 HTML/CSS/JS**
- 可选：**petite-vue（IIFE）** 做轻量响应式
- 样式：使用仓库内置的 **shadcn 风格 CSS 基线**（不是 shadcn-ui 组件代码）

本仓库已经准备好的东西：

- Runtime SDK bundle：`TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js`
- petite-vue（IIFE）：`TODO/function-kits/shared/vendor/petite-vue/petite-vue.iife.js`
- shadcn 风格 CSS tokens + primitives：`TODO/function-kits/shared/ui/kit-shadcn.css`
  - token 来源：`TODO/function-kits/tmp/shadcn-ui-1/apps/v4/public/r/themes.css`（`theme-zinc`）
- IME 面板布局 helper：`TODO/function-kits/shared/ui/ime-panel.css`
- 开发者 starter 包源码（已经把这三样 vendored 到包内，并附带 KitStudio 启动脚本）：`templates/function-kit-template-petite-vue/`

### 5.2 Vue/React 之类能不能用？

能，但要看“你具体想怎么用”：

- ✅ **Vue 3 的浏览器整包（IIFE/UMD）**：只要你把 `vue.global.prod.js` 下载到本地，用 `<script src="./vendor/vue.global.prod.js">` 引入，然后写纯浏览器模板（不是 SFC）即可。  
  - 代价：体积更大、心智更重、也更容易引入需要构建链的生态（组件库多半需要 bundler）。
- ⚠️ React + JSX：没构建链就很难舒服地写；你可以用 `preact + htm` 这种无 JSX 写法，但依旧建议先用更轻量方案。

### 5.3 组件库能不能“直接导入就用”？

取决于组件库是否提供 **可离线引入的浏览器产物**（`.js/.css`）：

- ✅ **CSS-only**：Pico.css、Bulma、sanitize.css……（但你现在想要 shadcn 风格，所以不推荐直接用它们的原生样式）
- ✅ **Web Components**：很多库可以“下载产物后本地引用”，但体积与浏览器兼容性要评估。
- ✅ **Bootstrap**：可下载 `bootstrap.min.css` + `bootstrap.bundle.min.js`（本地引入），但风格不 shadcn。
- ❌ **shadcn-ui**：它本质是“React + Tailwind 的组件代码生成方案”，不是一个提供 UMD/IIFE 的浏览器组件库。  
  → 你要的是“shadcn 的样式语言”，本仓库用 `kit-shadcn.css` 解决“视觉基线”，而不是导入 shadcn-ui 组件代码。

---

## 6. “导包方式”写法：本地 `.js/.css` 怎么引（不构建）

### 6.1 标准入口页（推荐：`ui/app/index.html`）

你在 `ui/app/index.html` 里按顺序引：

1. 共享面板布局：`ime-panel.css`
2. 共享 shadcn 基线：`kit-shadcn.css`
3. 你自己的 `styles.css`
4. Runtime SDK bundle：`function-kit-runtime.js`
5. petite-vue（可选）
6. 你自己的 `main.js`

以标准目录结构为例（你可以直接照抄）：

```html
<link rel="stylesheet" href="../../../shared/ui/ime-panel.css" />
<link rel="stylesheet" href="../../../shared/ui/kit-shadcn.css" />
<link rel="stylesheet" href="./styles.css" />

<script src="../../../../function-kit-runtime-sdk/dist/function-kit-runtime.js"></script>
<script src="../../../shared/vendor/petite-vue/petite-vue.iife.js"></script>
<script src="./main.js"></script>
```

参考样板：
- `TODO/function-kits/quick-phrases/ui/app/index.html`
- `TODO/function-kits/runtime-lab/ui/app/index.html`

### 6.2 第三方库怎么放（两种选择）

**选择 1（推荐）：放到 shared/vendor，多个 kit 复用**

```
TODO/function-kits/shared/vendor/<lib>/<lib>.min.js
TODO/function-kits/shared/vendor/<lib>/<lib>.min.css
```

然后在 kit 的 `index.html` 里用相对路径引入。

**选择 2：放到 kit 自己目录里（更独立）**

```
TODO/function-kits/<kitId>/ui/vendor/<lib>.min.js
```

### 6.3 远程 CDN 可不可以用？

- 对 **脚本**：不可以（CSP `script-src` 禁 `https:`）。  
- 对 **图片/CSS/字体**：当前 Android Host 允许，但仍建议本地化，除非你就是“商店/下载中心”这类展示型 kit。

---

## 7. `manifest.json`：宿主到底读哪些字段（写法 + 注意事项）

Android Host 当前解析的核心字段：

- `id`（必填）
- `name` / `description`
- `icon` / `icons`（多种写法都支持；推荐明确给多规格）
- `entry.bundle.html`（你的入口 HTML）
- `runtimePermissions`（**强制的权限 allowlist**）
- `ai.executionMode` / `ai.backendHints.*`（给宿主 AI Router 的提示）
- `bindings[]`（动作入口 + `binding.invoke`）
- `discovery.launchMode` / `discovery.slash.*`（斜杠/发现元数据）

事实来源：
- Manifest 解析：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitManifest.kt`
- SDK schema（更全的字段）：`TODO/function-kit-runtime-sdk/schemas/function-kit-manifest.schema.json`

### 7.1 最小可用 manifest 示例

```jsonc
{
  "id": "quick-phrases",
  "name": "常用短语",
  "description": "本地短语槽位样板（storage + insert/replace）",

  "icons": {
    "48": "icons/icon-48.png",
    "64": "icons/icon-64.png",
    "96": "icons/icon-96.png",
    "128": "icons/icon-128.png",
    "256": "icons/icon-256.png"
  },

  "entry": {
    "bundle": { "html": "ui/app/index.html" }
  },

  "runtimePermissions": [
    "context.read",
    "input.insert",
    "input.replace",
    "storage.read",
    "storage.write",
    "settings.open"
  ],

  "bindings": [
    {
      "id": "phrases.insert",
      "title": "插入常用短语（最近一次）",
      "triggers": ["manual"],
      "preferredPresentation": "headless",
      "requestedPayloads": []
    }
  ],

  "discovery": {
    "launchMode": "panel-first",
    "slash": {
      "enabled": true,
      "commands": ["phrases"],
      "aliases": ["cp"],
      "tags": ["paste", "local"]
    }
  },

  "ai": {
    "executionMode": "local-demo",
    "backendHints": {
      "preferredBackendClass": null,
      "preferredAdapter": null,
      "latencyTier": null,
      "latencyBudgetMs": null,
      "requireStructuredJson": false,
      "requiredCapabilities": [],
      "notes": []
    }
  }
}
```

### 7.2 `runtimePermissions` 的关键语义（别漏）

`runtimePermissions` 是 **manifest 侧的 allowlist**：

- Host 只会在你声明的权限范围内进行授予/同步。
- 你不写（空数组/缺省），基本等于“这个 kit 没有可用能力”。

事实来源：
- 解析：`FunctionKitManifest.runtimePermissions`
- allowlist resolver：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitRuntimePermissionResolver.kt`

权限名字列表见：`TODO/function-kit-runtime-sdk/docs/CAPABILITIES_AND_PERMISSIONS.md`

### 7.3 `entry.bundle.html` 怎么解析

- Host 会把 `entry.bundle.html` 作为入口 HTML 路径
- 路径按“相对 manifest 所在目录”解析

例如：

- manifest：`function-kits/quick-phrases/manifest.json`
- `entry.bundle.html = "ui/app/index.html"`
- 实际加载：`function-kits/quick-phrases/ui/app/index.html`

事实来源：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitManifest.kt`（`resolveAssetPath`）

---

## 8. Runtime SDK：你应该怎么写（高层 API + 事件）

### 8.1 引入与初始化（最小样板）

在 `index.html` 引入：

- `function-kit-runtime.js`（全局对象：`FunctionKitRuntimeSDK`）

在 `main.js`：

```js
const kit = globalThis.FunctionKitRuntimeSDK.createKit({
  kitId: "quick-phrases",
  surface: "panel",
  debug: true,
  connect: { timeoutMs: 20000, retries: 3 },
  // 可选：浏览器里直接打开 index.html 时，用 preview 提供 mock host
  preview: { grantAll: true }
});

kit.connect().catch(() => {});
```

事实来源（API 定义）：
- 类型：`TODO/function-kit-runtime-sdk/src/index.d.ts`
- 实现：`TODO/function-kit-runtime-sdk/src/index.js`

### 8.2 你最常用的 API（浏览器插件式）

> 注意：下列 API 是否能用，还取决于你是否在 manifest 里声明了对应 `runtimePermissions`，并且用户已授权。

- 权限检查：`kit.hasPermission("input.insert")`
- 获取上下文快照：`await kit.context.refresh()`
- 写回输入框：
  - `kit.input.insert("text")`
  - `kit.input.replace("text")`
  - `kit.input.commitImage({ dataUrl, fileName, mimeType })`
- 存储（替代 localStorage）：
  - `await kit.storage.get(["k1","k2"])`
  - `await kit.storage.set({ k1: "v1" })`
  - `kit.storage.watch(keys, handler)`
- 网络（宿主代理）：`await kit.fetch(url, init)`
- AI（宿主路由）：`await kit.ai.request(options)`
- Bindings：`kit.bindings.onInvoke(handler)`
- 任务中心：
  - `await kit.tasks.sync()`
  - `await kit.tasks.cancel({ taskId, reason })`
- 发送拦截（高级）：`await kit.send.registerImeActionInterceptor(...)`
- kit 间消息（高级）：`await kit.runtime.sendMessage(...)`

权限清单与映射：`TODO/function-kit-runtime-sdk/docs/CAPABILITIES_AND_PERMISSIONS.md`

### 8.3 事件模型（你应该订阅哪些）

SDK 会把底层 envelope 归一成事件（常用）：

- `kit.on("ready", ({ sessionId, permissions }) => {})`
- `kit.on("permissions", ({ permissions }) => {})`
- `kit.on("context", ({ context }) => {})`
- `kit.on("storage", ({ values }) => {})`
- `kit.bindings.onInvoke(({ invocation }) => {})`
- `kit.runtime.onIntent(({ intent }) => {})`
- `kit.runtime.onMessage(({ message }) => {})`
- `kit.on("task", ({ task }) => {})`
- `kit.on("tasks.sync", ({ running, history }) => {})`
- `kit.on("ai.delta", ({ deltaText }) => {})`
- `kit.on("error", ({ error }) => {})`

事件映射事实来源：`TODO/function-kit-runtime-sdk/src/index.js`（`emit(...)` 相关逻辑）

### 8.4 “低层逃生舱”：`kit.raw`

当你需要完整 envelope、或需要 Host Bridge 的更底层控制时：

- `kit.raw.on(type, handler)`（监听原始 message type）
- `kit.raw.send(type, payload)`（发送原始消息）

⚠️ Android Host 有 **message type allowlist**：不在 allowlist 的 type 会被丢弃。  
事实来源：`AllowedInboundTypes` / `AllowedOutboundTypes`（`FunctionKitWebViewHost.kt`）

### 8.5 `kit.state` / `kit.subscribe`：把 UI 写成“状态驱动”

`createKit()` 内部维护一个最小状态聚合（不是 UI 框架），你可以把 UI 写成“由 state 推导”：

- 只读快照：`kit.state`
- 订阅变化：`kit.subscribe((state) => { ... })`

当前快照里常用字段（不完全列表）：

- `state.connected` / `state.sessionId`
- `state.permissions`（已授予权限列表）
- `state.hostInfo`（宿主信息与调试信息）
- `state.context`（输入上下文快照）
- `state.storage`（存储快照）
- `state.tasks`（任务中心快照：running/history/byId）
- `state.lastInvocation`（最近一次 `binding.invoke`）
- `state.lastIntent`（最近一次 host intent，例如 `open_invocation`）
- `state.lastError`（最近一次错误）

事实来源：`TODO/function-kit-runtime-sdk/src/index.d.ts`（`FunctionKitStateSnapshot`）

### 8.6 上下文：`kit.context.refresh()` 与 `kit.app.*` 快捷访问

两种用法：

1) 主动刷新：`await kit.context.refresh()`（等价于请求一次上下文快照）

2) 直接从本地 state 读（快，但可能不是最新）：

- `kit.app.getActivePackageName()`
- `kit.app.getSelection()` → `{ start, end, text } | null`

这些是 SDK 从 `state.context` 派生的便捷访问器，适合做 UI 展示/默认值。

### 8.7 存储：`kit.storage.*` 的数据类型与最佳实践

Android Host 的存储实现是 per-kit namespace 的 SharedPreferences（不是 DOM Storage）：

- key 会被宿主自动加前缀：`<kitId>:<key>`
- 值类型建议只用：`string/number/boolean/null`
- 复杂对象：宿主会把它们转成字符串保存（你再读出来就是字符串）  
  → 建议你自己 `JSON.stringify` / `JSON.parse`，并约定版本字段（方便迁移）

监听变化：

```js
kit.storage.watch(["k1", "k2"], ({ values, changedKeys }) => {
  // values 只包含你关心的 keys（或 null=全量）
});
```

事实来源：宿主存储落地逻辑在 `FunctionKitWindow.kt`（`writeStorageValue/readAllStorageValues`）

### 8.8 网络：`kit.fetch`（推荐）与 `kit.raw.fetch`（拿完整 envelope）

权限：`network.fetch`

最常用：

```js
const response = await kit.fetch("https://httpbin.org/get", {
  task: { title: "拉取示例数据" },
  method: "GET",
  timeoutMs: 20000,
  headers: { "Accept": "application/json" }
});
```

更底层（需要完整 `request/response/taskId` 结构时）：

```js
const envelope = await kit.raw.fetch("https://httpbin.org/get", {
  task: { title: "拉取示例数据" },
  timeoutMs: 20000
});
```

Android Host 当前返回结构（简化）：

```jsonc
{
  "taskId": "task-...",
  "request": { "url": "...", "method": "GET" },
  "response": {
    "ok": true,
    "status": 200,
    "headers": { "Content-Type": "..." },
    "body": "...",
    "bodyBytes": 1234,
    "bodyTruncated": false
  }
}
```

事实来源：`FunctionKitWindow.executeNetworkFetch(...)`

#### 文件上传（无构建场景的正确姿势）

由于 WebView 禁止 `allowContentAccess`，UI **不能直接读取** `content://` 文件内容。正确闭环是：

1) `kit.files.pick(...)` 拿到 `fileId`  
2) `network.fetch` 里用 `init.bodyRef = { type: "file", fileId }` 让宿主读取并上传

参考实现：`TODO/function-kits/file-upload-lab/ui/app/main.js`

Android Host 限制（当前）：

- `bodyRef` 最大约 25MB（超过会报 `network_fetch_body_too_large`）

事实来源：同函数（`maxUploadBytes`）

### 8.9 文件选择：`kit.files.pick`（Android 已实现）

权限：`files.pick`

```js
const result = await kit.files.pick({
  multiple: false,
  acceptMimeTypes: ["application/zip", "image/png"]
});

// result.files = [{ fileId, name, mimeType, sizeBytes }]
```

注意：

- `files.getUrl` 在 Android Host 暂未实现，所以你暂时不能用 `fileId` 直接在 `<img>` 里展示本地文件。
- `fileId` 的主要用途是配合 `network.fetch` 做上传，或配合 Store Kit `kits.install` 做本地 ZIP 安装。

### 8.10 AI：`kit.ai.request`（任务中心 + 可取消）

权限：`ai.request`

建议每次请求都提供可读的任务名：

```js
const result = await kit.ai.request({
  task: { title: "总结当前选中文本" },
  input: { /* 你的请求 payload */ }
});
```

SDK 会在两条路径给你结果：

- 最终结果：`await kit.ai.request(...)`
- （可选）流式增量：`kit.on("ai.delta", ({ deltaText }) => {})`

事实来源：
- SDK 事件：`TODO/function-kit-runtime-sdk/src/index.js`
- Host bridge types：`TODO/function-kits/host-bridge/README.md`（`ai.response` / `ai.response.delta`）

### 8.11 Task Center：让“耗时操作”可见、可取消

宿主会把 `network.fetch / ai.request / kits.install ...` 这类操作记录到任务中心，并推送：

- `task.update`（单任务变化）
- `tasks.sync`（running/history 快照）

你在 kit 里可以：

```js
await kit.tasks.sync({ includeHistory: true, historyLimit: 30 });
await kit.tasks.cancel({ taskId, reason: "user" });
```

更多口径：`TODO/function-kit-runtime-sdk/docs/CAPABILITIES_AND_PERMISSIONS.md`（Task Center）

### 8.12 发送拦截（高级）：`send.intercept.ime_action`

适合做“发送前最后一秒”的风险提示/确认（必须克制、可解释、可忽略）。

1) 注册拦截（权限：`send.intercept.ime_action`）：

```js
await kit.send.registerImeActionInterceptor({ timeoutMs: 800 });
```

2) 处理 intent（SDK 会自动回 `send.intercept.ime_action.result`，你只需要返回 allow/deny）：

```js
kit.send.onImeActionIntent(async ({ intent, context }) => {
  // intent.kind / intent.actionId / intent.actionLabel
  // context: best-effort 快照
  return { allow: true }; // 或 false
});
```

宿主策略：

- UI 超时/异常会 **fail-open（放行发送）**，避免卡住用户

事实来源：
- Host：`FunctionKitWindow.maybeInterceptImeActionSend(...)`
- SDK：`TODO/function-kit-runtime-sdk/src/index.js`（`send.onImeActionIntent`）

### 8.13 Kit 间消息（高级）：`runtime.message.*`

你可以让一个 kit 给另一个 kit 发消息（例如：下载中心通知目标 kit 刷新数据）。

权限要求（两端都要考虑）：

- 发送方：`runtime.message.send`
- 接收方：声明并授予 `runtime.message.receive`

SDK 写法：

```js
kit.runtime.onMessage("demo", ({ message }) => {
  console.log("got message", message.data);
});

await kit.runtime.sendMessage({
  toKitId: "other-kit",
  channel: "demo",
  data: { hello: "world" },
  toSurface: "panel"
});
```

宿主行为：

- 若接收方尚未初始化，Host 可能会把它以 headless 方式拉起以投递消息

事实来源：`FunctionKitWindow.handleRuntimeMessageSend(...)` / `receiveRuntimeMessage(...)`

### 8.14 `kit.panel.updateState`：当前 Android 仅 ACK，不做持久化

权限：`panel.state.write`

Android Host 目前对 `panel.state.update` 的处理是：

- 校验权限
- 返回 `panel.state.ack`（回显 patch）
- **不持久化、不恢复 UI 状态**

因此：

- 需要持久化 UI 状态 → 用 `kit.storage.*`
- `panel.updateState` 暂时只适合作为“宿主确认你发了 patch”的信号

事实来源：`FunctionKitWindow.handlePanelStateUpdate(...)`

---

## 9. Bindings：怎么写、怎么拿 payload、怎么展示结果

Bindings 是 “用户显式点击触发的一次性动作入口”（类似浏览器插件 context menu）。

### 9.1 manifest：声明 bindings

一个 kit 可以声明多个 binding：

```jsonc
{
  "bindings": [
    {
      "id": "clipboard.summarize",
      "title": "总结剪贴板",
      "triggers": ["clipboard"],
      "requestedPayloads": ["clipboard.text"],
      "categories": ["paste", "writing"],
      "preferredPresentation": "panel.preview",
      "entry": { "view": "preview", "defaultAction": "replace" }
    }
  ]
}
```

字段语义与 Host 默认策略（缺省 requestedPayloads 的行为）详见：  
`TODO/function-kit-runtime-sdk/docs/BINDINGS.md`

### 9.2 UI：监听 `binding.invoke`

```js
kit.bindings.onInvoke(({ invocation }) => {
  // invocation.trigger: "clipboard" | "selection" | "manual"
  // invocation.clipboardText / invocation.context.selectedText / beforeCursor / afterCursor
  // invocation.missingPermissions: ["context.read"] 等
});
```

SDK 会把最近一次 invocation 放到：`kit.state.lastInvocation`（可用于 UI 恢复/路由）。

### 9.3 权限与 payload gating（为什么你拿不到文本）

Host 下发 payload 前会对齐权限：

- `selection.*` / `clipboard.text` 需要 `context.read`
- 若权限不足：payload 会缺失，并在 `invocation.missingPermissions` 里标记

因此你必须：

1. 在 manifest `runtimePermissions` 里声明 `context.read`
2. 在 UI 里处理“没权限”分支（提示用户去设置页授权）

打开设置页：

```js
kit.settings.open();          // 默认打开当前 kit 详情页
kit.settings.open({ section: "ai" }); // 打开 AI 设置（如果你需要）
```

事实来源：`FunctionKitWindow.handleSettingsOpen(...)`

### 9.4 结果呈现：三种推荐模式（按你要的体验选）

> 详细调研与建议：`TODO/function-kits/BINDINGS_UX_RESEARCH.md`

#### 模式 1：Headless（无 UI / 直接闭环）

适合：一键格式化、脱敏、简单改写、插入模板等。

- binding 触发后，后台执行逻辑
- 直接 `kit.input.insert/replace(...)` 写回
- Host 会用 snackbar 提供“打开详情”的入口（用户想看再看）

你需要做的：

- 把 `binding.preferredPresentation` 设为 `headless`（或不以 `panel` 开头）
- 在 `onInvoke` 里完成动作并写回
- （可选）把执行结果记录到 `kit.storage`，以便用户点“打开”后能看到这次执行详情

事实来源（Host 行为）：`TODO/ime-research/repos/fcitx5-android/.../FunctionKitBindingsWindow.kt`（`shouldOpenPanel` + snackbar “打开”）

#### 模式 2：Panel Preview（先预览/确认再写回）

适合：会改动较大文本、需要用户确认“插入/替换/复制”的场景。

你需要做的：

- `preferredPresentation: "panel.preview"`（Host 会直接打开面板）
- UI 内做一个 preview view：
  - 展示原文（来自 invocation payload）
  - 展示生成结果（本地或 AI）
  - 给出按钮：`插入` / `替换` / `取消`

#### 模式 3：Panel Workbench（工具台，多页面/多步）

适合：历史记录、复杂设置、多步操作（但仍要尽量保持 1-1-1 的入口与执行体验）。

强烈建议：

- **单 HTML + kit 内部路由（SPA）**：避免 Host 频繁 reload 造成状态丢失
- 用 `binding.entry` 作为路由参数（例如 `{"view":"history"}`）
- 同时监听 Host intent：`open_invocation`，把用户从 snackbar “打开”带到这次执行详情

Host intent 事实来源：`FunctionKitWindow.requestOpenInvocation(...)` + `host.state.update.details.intent`

### 9.5 “打开详情”如何定位到那次执行

Android Host 在 headless 模式下，会在 snackbar 的“打开”回调里：

1. 调用 `window.requestOpenInvocation(invocationId, bindingId)`
2. 打开该 kit 的面板
3. 通过 `host.state.update.details.intent` 下发：
   - `intent.kind = "open_invocation"`
   - `invocationId`
   - （可选）`bindingId`

SDK 会把它映射为：

```js
kit.runtime.onIntent("open_invocation", ({ intent }) => {
  // intent.invocationId / intent.bindingId
});
```

---

## 10. 结果写回：你能怎么把结果“放进输入框”

### 10.1 文本写回（最常用）

- 插入：`kit.input.insert("...")`（需要 `input.insert`）
- 替换选区：`kit.input.replace("...")`（需要 `input.replace`）

注意：

- Host 会在权限不足时返回 `permission.denied`（SDK 会抛错/触发 `error`）
- 建议所有“最终写回”都是用户显式点击触发（或 binding 本身就是显式点击）

### 10.2 图片写回（`commitImage`）

`kit.input.commitImage({ dataUrl, fileName, mimeType })`

Host 有大小上限（避免 bridge payload 过大）：

- Android Host inline image 约束：`MaxInlineImageBytes = 2MB`

事实来源：`TODO/ime-research/repos/fcitx5-android/.../FunctionKitWindow.kt`

### 10.3 候选（Candidates）相关

如果你的 kit 走“候选条/候选卡片”路径（例如 chat-auto-reply）：

- 触发生成：`kit.candidates.regenerate(...)`（需要 `candidates.regenerate`）
- UI 渲染：监听 `kit.on("candidates", ...)`（SDK 从 `candidates.render` 归一）

样板：`TODO/function-kits/chat-auto-reply/`

---

## 11. 生命周期：功能件到底什么时候启动、会不会每次 IME 启动都跑？

你关心的核心问题：**不会**。Kit WebView 是按需启动/复用的。

### 11.1 “是否所有 kit 会随 IME 启动？”

不会。

- IME 启动时只会创建 `FunctionKitWindowPool`（一个池）
- 只有在用户触发（打开面板 / 点击 binding / 运行后台 headless）时，才会 `require(kitId)` 并创建对应 `FunctionKitWindow`（含一个 WebView）

事实来源：
- 池创建：`TODO/ime-research/repos/fcitx5-android/.../InputView.kt`（`functionKitWindowPool = FunctionKitWindowPool()`）
- 按需创建：`TODO/ime-research/repos/fcitx5-android/.../FunctionKitWindowPool.kt`（`require(...)`）

### 11.2 attach/detach（面板打开/关闭）时发生什么

每个 kitId 对应一个 `FunctionKitWindow`（内部持有一个 WebView），行为：

- 第一次 attach：
  - `host.initialize(entryHtml)` 加载入口 HTML（只做一次）
  - `webView.onResume()`
  - Host 发送 `host.state.update`（用于 UI 显示/调试）
- detach（用户关闭面板/切回键盘）：
  - `webView.onPause()`
  - **不 destroy WebView**
  - 强制关闭 composer（避免下一次打开时输入焦点错乱）

事实来源：`TODO/ime-research/repos/fcitx5-android/.../FunctionKitWindow.kt`（`onAttached` / `onDetached`）

### 11.3 Headless（后台执行）是怎么跑的

当你点了一个 binding 且宿主决定 headless 执行时：

- Host 会调用 `ensureHeadlessPanelInitialized(...)`
  - 若还没初始化，会加载入口 HTML
  - `webView.onResume()`（即便不 attach 到界面）
  - 下发 `host.state.update`（label 会带“后台运行中”）

这让 kit 在没有 UI 的情况下也能接收 `binding.invoke` 并执行逻辑。

事实来源：同文件（`ensureHeadlessPanelInitialized`）

### 11.4 “销毁”机制：什么时候会真的释放 WebView？

Android Host 目前的策略是“尽量复用、少 destroy”：

- `FunctionKitWindowPool` 会保留最多 6 个 kit window（LRU）
- 超过后会释放最久未使用且未 attach 的 window（从 scope 移除）
- **不会显式调用 `WebView.destroy()`**（尽量减少耦合，交给 GC）

事实来源：`TODO/ime-research/repos/fcitx5-android/.../FunctionKitWindowPool.kt`

对 kit 作者的含义：

- 你的页面可能会长期驻留内存，也可能在某次 LRU 淘汰后被回收并重新加载。
- 任何“重要状态”都不应只放内存，必须落到 `kit.storage`（或由宿主提供的持久层）。

---

## 12. 调试与验收（你怎么知道是 kit 的锅还是宿主的锅）

### 12.1 浏览器本地预览（不装 APK）

多数 kit 都内置了 preview/mock host：

```js
const kit = FunctionKitRuntimeSDK.createKit({
  kitId,
  surface: "panel",
  preview: { grantAll: true, storage: { /* defaults */ } }
});
```

这样你可以直接在桌面浏览器打开 `ui/app/index.html` 做 UI 联调（不依赖真实宿主）。

参考：`TODO/function-kits/file-upload-lab/ui/app/main.js`（`preview` 用法）

### 12.2 Android 真机验收（装 APK）

- 内置 assets：走 `syncFunctionKitAssets`（构建时自动）
- 用户安装：走 Download Center（ZIP/URL）

打包/分发规范：
- ZIP：`TODO/function-kits/KIT_PACKAGE_SPEC.md`
- Catalog：`TODO/function-kits/KIT_CATALOG_SPEC.md`

### 12.3 看日志：WebView console 会被宿主转发

Android Host 会捕获 WebView `console` 输出，并以 host event 的形式记录（便于定位）。

事实来源：`FunctionKitWebViewHost.kt`（`onConsoleMessage`）

> 小技巧：在 `main.js` 把关键状态打印出来（权限、invocation、intent、错误码），比肉眼猜快很多。

### 12.4 常用回归 kit（别自己造轮子）

- `runtime-lab`（最近改动手动验收）：`TODO/function-kits/runtime-lab/`
- `quick-phrases`（纯本地闭环）：`TODO/function-kits/quick-phrases/`
- `chat-auto-reply`（AI/候选/任务/复杂状态）：`TODO/function-kits/chat-auto-reply/`
- `file-upload-lab`（files.pick + network.fetch 上传）：`TODO/function-kits/file-upload-lab/`

---

## 13. 常见坑与排查清单（遇到问题先对照）

### 13.1 页面无法滚动

先排查：

- 是否在 CSS 里把 `body/html` 设成了 `overflow: hidden` 或固定高度？
- 是否做了“全屏 fixed 容器”把滚动吃掉了？
- 是否用了嵌套滚动并且每层都没给 `overflow:auto`？

建议：

- 让页面用自然滚动（body 滚动）最稳
- 布局参考 `quick-phrases`（`shell kit-shell` + `main.views`）

### 13.2 点击按钮没反应

先排查：

- 按钮是不是在 `<form>` 里没写 `type="button"` 导致触发表单默认行为？
- 是否有透明层/容器盖住按钮（CSS `position` / `z-index`）？
- 是否把点击事件写成了绑定但没 mount（例如 petite-vue 没 `createApp(...).mount(...)`）？

### 13.3 `localStorage` 报错 / 不工作

这是设计使然（DOM Storage 禁用）。

- 用 `kit.storage.get/set/watch` 替代
- 不要试图绕过（同 origin 下开启 DOM Storage 会破坏 kit 隔离）

### 13.4 `binding.invoke` 收到了但没有文本

排查顺序：

1. manifest `runtimePermissions` 是否包含 `context.read`？
2. binding 是否声明了正确的 `requestedPayloads`（或依赖 Host 默认）？
3. `invocation.missingPermissions` 是否包含 `context.read`？

详见：`TODO/function-kit-runtime-sdk/docs/BINDINGS.md`

### 13.5 `files.download / files.getUrl` 为什么一直报错？

Android Host 目前未实现（会返回 `bridge.error`）：

- `files_download_not_implemented`
- `files_get_url_not_implemented`

事实来源：`FunctionKitWindow.kt`（对应 handler）

如果你要做“文件上传/下载”：

- 上传：用 `files.pick` 选文件 → 在 `network.fetch` 里用 `bodyRef: { type:"file", fileId }`（参考 file-upload-lab）
- 下载：目前建议由宿主侧能力提供或由 `kits.install` 等特权 API 承担（Store Kit 场景）

---

## 14. 你可以从这里继续（面向更复杂的 kit）

- 功能件制作流程（Brief/验收/宣发/维护）：`TODO/function-kits/PLAYBOOK.md`
- Bindings 结果呈现调研：`TODO/function-kits/BINDINGS_UX_RESEARCH.md`
- 分发/IP（现实约束）：`TODO/function-kits/DISTRIBUTION_AND_IP.md`
- Store Kit（下载中心做成 kit）的路线：`TODO/function-kits/store/INDEX.md`
