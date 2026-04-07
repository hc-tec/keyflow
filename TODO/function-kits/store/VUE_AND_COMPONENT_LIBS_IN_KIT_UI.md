# 在 Function Kit UI 中使用 Vue / 组件库：可行性调研与落地方案

> 编码：UTF-8  
> 创建时间：2026-04-01  
> 结论：**可以用 Vue / 组件库，但必须“构建后随 Kit 打包为本地资源（self）”。不要依赖 CDN 直接在 WebView 里拉远程脚本。**

## TL;DR（先说结论）

- **能用 Vue**：Kit UI 本质就是 WebView 里的 HTML/CSS/JS，Vue 在浏览器能跑，就能在 Kit 里跑。
- **不需要“运行时 webpack 环境”**：webpack/vite 是构建工具；运行时只要是浏览器即可。你需要的是“把依赖打包成静态资源”，而不是让 WebView 里存在 webpack。
- **当前 Host 默认 CSP 会拦截远程脚本**：`script-src 'self' ...`（不含 `https:`），所以 **`<script src="https://...">` 的 Vue CDN 用不了**；但图片/CSS/字体默认允许 `https:`（见下文）。
- **组件库可用，但不建议重**：输入法面板对体积/启动速度/内存更敏感；优先“轻量 UI + 自己的少量组件”，而不是把 Element/Vuetify 整套搬进来。

## 约束来自哪里（本项目的事实）

### 1) CSP：远程脚本默认不允许

Host 在返回 HTML 时注入 CSP（仅对 `.html` 生效）：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`
  - `DefaultContentSecurityPolicy` 中 `script-src 'self' 'unsafe-inline' 'unsafe-eval';`（**没有 `https:`**）
  - 但 `style-src/img-src/font-src` 默认包含 `https:`（外链样式/图片/字体可用）

这意味着：

- Vue/React 这类 **JS 框架必须打包进 Kit 本地文件**（例如 `ui/app/vendor/vue.global.prod.js` 或 `ui/app/dist/app.js`）。
- 外链 JS（CDN）除非改 CSP，否则会被浏览器直接拦截。

### 2) 外部资源是否能加载：Host 侧可控，默认允许“子资源外网”

- `FunctionKitWebViewHost.Config.allowExternalResources = true`（默认）
- `shouldInterceptRequest`：外部子资源在 `allowExternalResources=true` 时放行；但 **主框架跳转**到外网会被拦截（并尝试用系统浏览器打开）。

### 3) WebView 特性：DOM Storage 默认关闭

Host 初始化 WebView：

- `settings.domStorageEnabled = false`

影响：

- `localStorage/sessionStorage/indexedDB` 这类能力不可用（Vue 本身不依赖，但很多组件库/插件可能默认用本地存储做缓存/持久化）。
- Kit 需要持久化应走 `kit.storage.*`（宿主侧命名空间隔离）。

## 可选落地方式（按推荐度排序）

### 方案 A（推荐）：Vite + Vue（或任意框架）“构建后输出 dist”

思路：开发时用 npm + Vite；发布时产物是静态文件（`index.html` + `dist/*.js` + `dist/*.css`），随 Kit ZIP 一起打包。

要点：

- `vite build` 输出必须用**相对路径**（典型：`base: "./"`），否则在 `https://function-kit.local/assets/...` 下会找不到资源。
- 把 `dist/` 放进 Kit 的 `ui/app/`（或 `ui/app/dist/`）并在 `ui/app/index.html` 引用。
- 不走 CDN；全部走本地 `self` 资源，完全符合当前 CSP。

优点：

- 现代前端体验（SFC、热更新在 KitStudio/本地调试阶段解决）
- 产物可控（体积/拆包/压缩/树摇）

风险/成本：

- 引入构建链路与依赖管理；Kit 体积可能变大（需要预算与约束）。

### 方案 B（也可用）：直接引入 Vue 的本地“全局构建（UMD/Global build）”

思路：不搭建构建链路，直接把 `vue.global.prod.js` 作为静态文件放进 kit，然后 `<script src="./vendor/vue.global.prod.js"></script>`。

优点：

- 最简单，理解成本最低。

缺点：

- 没有树摇；随着页面变复杂，代码组织与性能会更差。
- 组件库依赖（很多库只提供 ESM + 构建）会更难接。

### 方案 C：用更轻的“微框架/轻量渲染”

如果下载中心/设置类 UI 只是列表、筛选、详情、弹窗：

- 更建议用 vanilla + 少量组件（现在的 store kit 即是此路线）
- 或选择非常轻量的方案（例如 preact/lit/petite-vue），同样“构建后打包本地”

收益：更快、更省内存，更符合“输入法面板”场景。

## 组件库能不能用？（能，但要选对）

结论：**能用，但要“构建后本地打包”，并且强烈建议控制体积与交互复杂度。**

建议的筛选标准：

- 首选：无重依赖、可按需引入、样式可裁剪、移动端友好
- 避免：整套 Material/企业级大而全组件库（体积大、CSS/动效多、输入法面板容易卡）
- 必做：限制 bundle size（建议把“首次加载 JS”控制在一个可接受的阈值内），并确保离线可用

## 如果一定要用 CDN（不推荐）：需要改 Host 的 CSP

要用 `<script src="https://unpkg.com/vue@...">` 这类做法，必须满足：

- CSP 的 `script-src` 放开 `https:`（或更细的白名单域名）
- 并重新评估安全面：远程脚本执行 = 宿主在输入法里执行第三方 JS，风险极高

因此默认不建议。

## 最终建议（按当前项目目标）

- Store / 下载中心这类 UI：继续保持“轻量原生 HTML/CSS/JS”，足够好、易控、性能稳。
- 真要上框架：走 **方案 A（Vite 构建 + 本地打包）**，不要在 WebView 里现场拉 CDN。
- 组件库：除非明确能显著节省开发成本且体积可控，否则不要引入“大而全”。

## 附：无构建（本地 `.js/.css` 直引）可选清单

> 重点：Kit WebView 默认会拦外链脚本（CSP `script-src 'self' ...`），所以就算这些库提供 CDN，用法也应改为“下载到 kit 内再引用”。

### 轻量响应式 / 模板绑定

- `petite-vue`：IIFE/浏览器单文件（已在本仓库落地为 vendor，适合 panel 小 UI）。
- `alpinejs`：单文件直引（更偏 “HTML 驱动” 交互）。
- `mithril`：单文件直引（小而全，组件化/路由能力更强）。

### 传统大框架（也能直引，但更重）

- Vue 3：官方提供 `vue.global.prod.js` 这类 Global build（直引可跑，但生态很多库只提供 ESM/需要构建）。
- React：官方提供 UMD（可跑，但体积与工程复杂度明显更高，不太适合 IME panel）。

### 纯 CSS / 轻量样式库（最适合“无构建”）

- `pico.css` / `bulma` / `spectre.css`：纯 CSS，直接复制进 kit 即可用（但视觉风格不是 shadcn）。
- `bootstrap`：CSS + JS bundle（无构建可用，但依赖其组件结构，整体偏“传统网页”风格）。

### 关于 shadcn/ui

- `shadcn/ui` **不是**可直引的浏览器组件库：它更像“把 React + Tailwind + Radix 的组件源码拷进你的项目”的脚手架/代码仓库。
- 如果目标是“shadcn 的视觉风格”，推荐做法是：**复用其主题 token（CSS variables）与交互态规范**，在 kit 内自己实现一套轻量组件样式（本仓库的 `shared/ui/kit-shadcn.css` 即是这条路）。
