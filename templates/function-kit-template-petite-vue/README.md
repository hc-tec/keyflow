# Function Kit Starter Template

一个可直接下到本地、直接挂到 KitStudio 里看的 Function Kit starter。

这个模板包内置了：

- vendored `function-kit-runtime.js`
- vendored `petite-vue.iife.js`
- vendored `kit-shadcn.css`
- 一个不是空白页的 `starter-showcase` 示例：它本身就是一个小型官网式 Function Kit，同时演示 `context.read`、`input.insert`、`input.replace`、`storage.*`、`settings.open`

## 快速开始

开发者要拿的东西分 3 个来源：

- 最短入口：`npx @keyflow2/create-function-kit my-launchpad --kit-id yourscope.launchpad --name "Launchpad"`
- starter 包：从 npm 拉 `@keyflow2/function-kit-template-petite-vue`
- KitStudio：从 GitHub clone `https://github.com/hc-tec/kitstudio.git`
- starter 源码：如果要看模板原始实现，去 `https://github.com/hc-tec/keyflow/tree/main/templates/function-kit-template-petite-vue`

如果你只是想最快开始做 kit，优先用 create CLI：

```powershell
npx @keyflow2/create-function-kit my-launchpad --kit-id yourscope.launchpad --name "Launchpad"
cd .\my-launchpad
npm run open:kitstudio
```

下面这套 `npm pack` 路径更适合你想直接研究 starter 包结构本身时使用。

推荐把 KitStudio clone 成 starter 包的同级目录，这样不用再配路径：

```powershell
mkdir starter-demo
cd starter-demo

npm pack @keyflow2/function-kit-template-petite-vue
tar -xf keyflow2-function-kit-template-petite-vue-*.tgz
cd .\package

git clone https://github.com/hc-tec/kitstudio.git ..\kit-studio
cd ..\kit-studio
npm install
cd ..\package

npm run open:kitstudio
```

`npm run open:kitstudio` 会：

- 把 KitStudio 的 `KITSTUDIO_FUNCTION_KITS_ROOT` 指到当前包里的 `workspace/function-kits`
- 只挂载这一个 starter kit，所以 KitStudio 打开后会自动落到示例页
- 尝试自动打开 `http://127.0.0.1:39001/`

如果你的 KitStudio 不在同级目录，先设置环境变量：

```powershell
$env:KITSTUDIO_ROOT = "D:\dev\kit-studio"
npm run open:kitstudio
```

只想先看命令而不真正启动：

```powershell
npm run open:kitstudio -- --dry-run
```

`--dry-run` 不要求你已经把 KitStudio clone 到本机；它会打印脚本尝试的路径，以及你需要设置的环境变量。

## 改成你自己的 kit

模板默认 kitId 是 `starter-showcase`。先跑一遍 rename 脚本，再开始写业务：

```powershell
npm run rename:starter -- --kit-id yourscope.launchpad --name "Launchpad"
```

这会同步更新：

- `manifest.json` 的 `id/name/description`
- `ui/app/main.js` 里的 starter 元信息
- `ui/app/index.html` 的页面标题
- `icons/` 里的默认 starter 图标文件名与 manifest 引用
- 根 `package.json` 的本地 workspace 名称与 `keyflow.defaultKitId`
- kit 目录名

改完之后，`npm run open:kitstudio` 仍然可用，因为启动脚本会读取根 `package.json` 里的 `keyflow.defaultKitId`。

然后重点改这些文件：

- `workspace/function-kits/yourscope.launchpad/manifest.json`
- `workspace/function-kits/yourscope.launchpad/ui/app/index.html`
- `workspace/function-kits/yourscope.launchpad/ui/app/main.js`
- `workspace/function-kits/yourscope.launchpad/ui/app/styles.css`

## 自检、打包、发布

这个 starter 不只是“能开起来”，也把最基础的开发者闭环带进来了：

- `npm run doctor`
- `npm run pack:zip`
- `npm run pack:npm`
- `npm run publish:npm`
- `npm run catalog:entry`

推荐顺序：

```powershell
npm run doctor
npm run pack:zip
npm run pack:npm -- --scope yourscope
npm run publish:npm -- --scope yourscope --dry-run
npm run catalog:entry -- --scope yourscope
```

这些命令的作用：

- `doctor`：检查 `manifest`、入口文件、图标、vendored 资源、`runtimePermissions`
- `pack:zip`：生成给 Android Host / 下载中心用的 ZIP 安装包
- `pack:npm`：生成 npm tarball 与 metadata
- `publish:npm`：把当前 kit 发布到 npm
- `catalog:entry`：生成官方 catalog 提交流程需要的 JSON / Markdown 片段

详细说明见：

- `docs/WORKFLOW.md`
- `docs/PLATFORM_COMPATIBILITY.md`

## 目录说明

```text
workspace/
  function-kits/
    starter-showcase/
      manifest.json
      icons/starter-showcase.svg
      ui/
        README.md
        app/
          index.html
          main.js
          styles.css
        vendor/
          function-kit-runtime.js
          petite-vue.iife.js
          kit-shadcn.css
```

## 为什么这些依赖直接 vendored

为了让 starter 在 Android WebView Host 和 KitStudio 里表现一致，这个模板故意不依赖外链脚本：

- `runtime.js` 直接放在 `ui/vendor/`
- `petite-vue` 直接放在 `ui/vendor/`
- `kit-shadcn.css` 直接放在 `ui/vendor/`

这样开发者第一次打开模板时，不需要先理解 workspace mounts、shared 目录或 CDN/CSP 限制。

## 接下来做什么

1. 先在 KitStudio 里确认 starter 展示和 runtime 动作都正常。
2. 把 `starter-showcase` 重命名成自己的 kitId。
3. 每次改动后先跑 `npm run doctor`。
4. 删掉不需要的营销文案，保留你需要的 runtime 调用样板。
5. 再决定要不要把 vendored 资源切回 shared/workspace 版本。
6. 发布前至少再用真实 Android Host 验一次核心路径，不要只看 KitStudio。
