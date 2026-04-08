# Function Kit Starter Template（npm + KitStudio）

> 编码：UTF-8  
> 创建时间：2026-04-08  
> 目标：给开发者一个**拿下来就能在 KitStudio 里看到效果**的 Function Kit starter，而不是只有空白目录和几行导包说明。

## 1. 它解决什么问题

过去的新手路径是：

1. 先理解 workspace mounts
2. 再理解 Runtime SDK 的 bundle 路径
3. 再理解 petite-vue / shadcn 风格 CSS 要放哪
4. 最后才能在 KitStudio 里看到一个能跑的页面

这个 starter 把前 3 步直接吸收进模板包里：

- `runtime.js` 直接 vendored 到 `ui/vendor/`
- `petite-vue.iife.js` 直接 vendored 到 `ui/vendor/`
- `kit-shadcn.css` 直接 vendored 到 `ui/vendor/`
- 包里自带一个 `starter-showcase` 示例页，直接演示 `context.read` / `input.insert` / `input.replace` / `storage.*` / `settings.open`

## 2. 源码与包名

- 模板包源码：`templates/function-kit-template-petite-vue/`
- npm 包名：`@keyflow2/function-kit-template-petite-vue`
- 默认示例 kit：`templates/function-kit-template-petite-vue/workspace/function-kits/starter-showcase/`

开发者实际拿项目时，入口要分开看：

- 要直接开始做 kit：从 npm 拉 `@keyflow2/function-kit-template-petite-vue`
- 要本地预览 starter：再 clone `https://github.com/hc-tec/kitstudio.git`
- 要看 starter 的原始源码/提 PR：clone `https://github.com/hc-tec/keyflow.git`，然后进入 `templates/function-kit-template-petite-vue/`

## 3. 开发者拿到包之后怎么用

### 3.1 下载并直接打开 KitStudio

推荐目录：

```text
<workspace>/
  package/       # npm pack 解出来的 starter
  kit-studio/    # KitStudio 仓库
```

然后在 starter 目录执行：

```powershell
npm run open:kitstudio
```

这个脚本会：

- 把 `KITSTUDIO_FUNCTION_KITS_ROOT` 指到当前 starter 包里的 `workspace/function-kits`
- 启动 KitStudio
- 因为当前 mount 里只有一个 kit，KitStudio 会直接落到 starter 示例页

### 3.2 先重命名，再写业务

```powershell
npm run rename:starter -- --kit-id yourscope.launchpad --name "Launchpad"
```

它会同步更新：

- `manifest.json`
- `ui/app/main.js`
- kit 目录名

## 4. 本仓库里如何构建 / 校验 / 发布

在仓库根目录执行：

```bash
node scripts/npm/build-starter-template.mjs
node scripts/npm/verify-starter-template.mjs
node scripts/npm/publish-starter-template.mjs --dry-run
```

产物位置：

- tarball：`artifacts/npm/templates/function-kit-template-petite-vue/`
- metadata：`artifacts/npm/templates/function-kit-template-petite-vue/starter-template.json`

## 5. 维护约定

### 5.1 vendored 资产的事实来源

- runtime bundle：`TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js`
- petite-vue：`TODO/function-kits/shared/vendor/petite-vue/petite-vue.iife.js`
- shadcn 风格 CSS：`TODO/function-kits/shared/ui/kit-shadcn.css`

### 5.2 什么时候必须同步 starter

- Runtime SDK bundle 更新后
- petite-vue 版本更新后
- `kit-shadcn.css` token / primitive 有行为变化后
- 开发者 onboarding 流程变化后（例如 KitStudio 启动方式、推荐目录结构）

### 5.3 这个 starter 的定位

它不是“最终最佳实践”的唯一答案，而是：

- 第一次打开就能看懂
- 第一次修改就不会迷路
- 第一次接 KitStudio 就能看到真实效果

等开发者进入稳定开发阶段，再决定是否把 vendored 资源切回 shared/workspace 版本。
