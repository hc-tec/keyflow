# Create Function Kit

一个面向开发者的脚手架命令：把官方 Function Kit starter 解到本地目录，并直接改成你自己的 kitId。

## 先看前置条件

- `open:kitstudio` 需要你本机已经有 `kit-studio` 仓库；默认找目标项目同级目录 `../kit-studio`，也可以改用 `KITSTUDIO_ROOT`，必要时再配 `KITSTUDIO_HOST` / `KITSTUDIO_PORT`
- `publish:npm` 不是“生成项目后任何人都能直接发包”；你仍然需要 npm 账号，以及 `--token-file` / `NPM_TOKEN` / `NODE_AUTH_TOKEN` / `npm login` 之一；只有当你真的要发 `@org/...` scoped 包时，才额外需要那个 org/scope 的发布权限
- 生成后的 starter 默认不会附带 `.env` 来配置 AI provider；`ai.request` 的真实 `Base URL / API key / model` 是在 KitStudio 或 Android Host 的共享 AI 配置里完成的
- `--kit-id` 推荐用全局唯一前缀，例如 `myname.launchpad`；这里的 `myname` 只是 kitId 命名空间，不是 npm scope / 组织名
- 如果你只想先做本地或真机验收，不需要先配 npm；先走 `doctor -> pack:zip -> Android Host` 就够了

## 用法

```powershell
npx @keyflow2/create-function-kit my-launchpad --kit-id myname.launchpad --name "Launchpad"
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
npm run pack:npm
npm run publish:npm -- --dry-run
npm run catalog:check
npm run catalog:entry
```

真正发布到 npm 前，建议先单独确认：

```powershell
npm whoami
npm run publish:npm -- --dry-run
```

`npm whoami` 通过只代表当前机器有认证。默认不传 `--scope` 时，starter 会生成 unscoped 包名 `keyflow-kit-<kitId>`；如果你已经有 npm 组织，后面再改成 `--scope myorg` 或 `--package-name @myorg/my-kit` 即可。

官方 catalog 上架不是提交 starter 生成的 JSON。真实顺序是：先把 kit 发布到 npm，确认 `npm view <package>@<version>` 能查到，再跑 `npm run catalog:check`。通过后，如果走 PR，只在官方仓库的 `catalog/official.packages.json` 增加一条 `"<真实 npm 包名>@<version>"` 字符串；`npm run catalog:entry` 生成的 JSON 只是 PR / Issue 描述辅助信息，不要提交到官方仓库。

也就是说，开发者不需要先 clone `keyflow` 仓库，当前工作区自己就带着：

- KitStudio 启动脚本
- 本地自检脚本
- ZIP / npm 打包脚本
- npm 发布脚本
- catalog 提交前检查脚本
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
npx @keyflow2/create-function-kit my-launchpad --kit-id myname.launchpad --name "Launchpad" --open
```

## 官方 starter

当前这条 CLI 主要面向两类 starter：

- `starter` / `petite-vue`
  - 默认模板
  - 适合通用面板、动作型、设置型 Function Kit
  - 对应 npm 包：`@keyflow2/function-kit-template-petite-vue`
- `preview-rewrite`
  - 适合纠错 / 润色 / 翻译 / 摘要这类“先生成预览，再确认替换”的正文型 AI Function Kit
  - 对应 npm 包：`@keyflow2/function-kit-template-preview-rewrite`

查看当前内置别名：

```powershell
npx @keyflow2/create-function-kit --list-templates
```

## 常用参数

- `--kit-id <id>`：目标 kitId，推荐用全局唯一风格，例如 `myname.launchpad`
- `--name <label>`：展示名称
- `--description <text>`：覆盖 starter 默认描述
- `--template <name|npm-ref>`：改用官方模板别名或自定义 npm starter 包
- `--list-templates`：列出官方 starter 别名
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
npm run pack:npm
npm run publish:npm -- --dry-run
npm run catalog:check
npm run catalog:entry
```

这里的 `catalog:check` 依赖已发布到真实 npm registry 的包；`publish:npm --dry-run` 或 `pack:npm` 通过，不代表可以提交官方 catalog。

如果你已经有 npm 组织，想发 `@myorg/...` 包，再额外使用：

```powershell
npm run pack:npm -- --scope myorg
npm run publish:npm -- --scope myorg --dry-run
```

如果你要做正文预览型 AI kit，后续发布前还应该再看：

- `docs/ANDROID_HOST_RUNBOOK.md`

## 维护者本地开发

如果你在 `keyflow` 仓库里调这个 CLI，不想真的从 npm 拉 starter，可以直接指向本地模板目录：

```powershell
node .\templates\create-function-kit\bin\create-function-kit.mjs .\artifacts\smoke\launchpad `
  --template-dir .\templates\function-kit-template-petite-vue `
  --kit-id myname.launchpad `
  --name "Launchpad"
```

正文预览 starter 的本地路径用法：

```powershell
node .\templates\create-function-kit\bin\create-function-kit.mjs .\artifacts\smoke\proofreader `
  --template-dir .\templates\function-kit-template-preview-rewrite `
  --kit-id myname.proofreader `
  --name "Proofreader"
```
