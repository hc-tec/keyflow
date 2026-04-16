# Create Function Kit

一个面向开发者的脚手架命令：把 `@keyflow2/function-kit-template-petite-vue` 解到本地目录，并直接改成你自己的 kitId。

## 用法

```powershell
npx @keyflow2/create-function-kit my-launchpad --kit-id yourscope.launchpad --name "Launchpad"
```

执行后会：

- 下载 starter 包（默认：`@keyflow2/function-kit-template-petite-vue`）
- 解到 `my-launchpad/`
- 运行 starter 自带的 `rename-starter`，同步修改：
  - `manifest.json`
  - `ui/app/main.js`
  - `ui/app/index.html`
  - `icons/*`
  - 根 `package.json` 的 `keyflow.defaultKitId`

然后你可以直接：

```powershell
cd .\my-launchpad
npm run open:kitstudio
```

生成后的项目还会自带这些命令：

```powershell
npm run doctor
npm run pack:zip
npm run pack:npm -- --scope yourscope
npm run publish:npm -- --scope yourscope --dry-run
npm run catalog:entry -- --scope yourscope
```

也就是说，开发者不需要先 clone `keyflow` 仓库，当前工作区自己就带着：

- KitStudio 启动脚本
- 本地自检脚本
- ZIP / npm 打包脚本
- npm 发布脚本
- catalog 提交片段生成脚本
- 平台差异说明文档

如果你看到 `[starter] Could not locate KitStudio.`，说明脚本没找到你的 KitStudio 仓库位置。你可以：

- 把 KitStudio clone 到工作区同级目录：`..\kit-studio`
- 或设置环境变量（一次性 / 长期都行）：

```powershell
$env:KITSTUDIO_ROOT = "D:\dev\kit-studio"
npm run open:kitstudio
```

如果你已经有可用的 KitStudio，也可以创建完成后直接打开：

```powershell
npx @keyflow2/create-function-kit my-launchpad --kit-id yourscope.launchpad --name "Launchpad" --open
```

## 常用参数

- `--kit-id <id>`：目标 kitId，推荐用全局唯一风格，例如 `yourscope.launchpad`
- `--name <label>`：展示名称
- `--description <text>`：覆盖 starter 默认描述
- `--template <npm-ref>`：改用其它 starter 包，默认 `@keyflow2/function-kit-template-petite-vue`
- `--kit-studio-root <path>`：配合 `--open` 使用，显式指定 KitStudio 仓库目录
- `--force`：覆盖已存在的目标目录
- `--dry-run`：只打印计划动作，不落盘

## 生成后建议顺序

```powershell
cd .\my-launchpad
npm run open:kitstudio
npm run doctor
npm run pack:zip
```

确认真机闭环后，再继续：

```powershell
npm run pack:npm -- --scope yourscope
npm run publish:npm -- --scope yourscope --dry-run
npm run catalog:entry -- --scope yourscope
```

## 维护者本地开发

如果你在 `keyflow` 仓库里调这个 CLI，不想真的从 npm 拉 starter，可以直接指向本地模板目录：

```powershell
node .\templates\create-function-kit\bin\create-function-kit.mjs .\artifacts\smoke\launchpad `
  --template-dir .\templates\function-kit-template-petite-vue `
  --kit-id keyflow2.launchpad `
  --name "Launchpad"
```
