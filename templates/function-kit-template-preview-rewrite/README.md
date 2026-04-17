# Preview Rewrite Function Kit Starter

一个面向正文类 AI 功能件的 starter：读取当前输入，生成可审阅预览，再由用户确认是否替换。

适合直接改成：

- 纠错 / 校对
- 润色 / 语气调整
- 翻译
- 摘要 / 提炼

## 快速开始

先确认这几个前提：

- `npm run open:kitstudio` 需要本机已有 `kit-studio`；默认找同级 `../kit-studio`，也可以通过 `KITSTUDIO_ROOT` 指定，必要时再配 `KITSTUDIO_HOST` / `KITSTUDIO_PORT`
- `npm run publish:npm` 不是开箱即发；你仍然需要 npm 账号、目标 package 或 scope 的发布权限，以及 `--token-file` / `NPM_TOKEN` / `NODE_AUTH_TOKEN` / `npm login` 之一
- 这个 starter 默认不带 `.env` 来配置 AI provider；`ai.request` 的真实 `Base URL / API key / model` 是在 KitStudio 或 Android Host 的共享 AI 配置里完成的
- 如果你只是先做功能闭环，先跑 `doctor`、`pack:zip` 和 Android Host 验收，不需要先准备 npm 发布凭据

这个 starter 已经在仓库里就绪；对外 npm 包发布后，就可以通过 create CLI 直接使用：

```powershell
npx @keyflow2/create-function-kit my-proofreader --template preview-rewrite --kit-id yourscope.proofreader --name "Proofreader"
cd .\my-proofreader
npm run open:kitstudio
npm run doctor
```

当前仓库内维护者可直接指向本目录：

```powershell
node .\templates\create-function-kit\bin\create-function-kit.mjs .\artifacts\smoke\preview-rewrite `
  --template-dir .\templates\function-kit-template-preview-rewrite `
  --kit-id keyflow2.preview-smoke `
  --name "Preview Smoke" `
  --force
```

## 这个 starter 已经包含

- `context.read`：读取当前选中文本 / 输入上下文
- `ai.request`：请求 `response.type = "text"`
- `input.replace`：用户确认后替换到输入框
- 一个线性的 `edit -> preview -> confirm` UI 骨架

核心文件：

- `workspace/function-kits/preview-rewrite-starter/manifest.json`
- `workspace/function-kits/preview-rewrite-starter/ui/app/index.html`
- `workspace/function-kits/preview-rewrite-starter/ui/app/main.js`
- `workspace/function-kits/preview-rewrite-starter/ui/app/styles.css`

## 开发与发布

生成后的工作区自带：

```powershell
npm run doctor
npm run pack:zip
npm run pack:npm -- --scope yourscope
npm run publish:npm -- --scope yourscope --dry-run
npm run catalog:check -- --scope yourscope
npm run catalog:entry -- --scope yourscope
```

真正发布前，建议先单独确认：

```powershell
npm whoami
npm run publish:npm -- --scope yourscope --dry-run
```

`npm whoami` 通过只代表当前机器已有认证；如果目标包是 `@scope/...`，当前账号还必须已经拥有该 scope 的发布权限。

`doctor` 不只是检查文件缺失；它还会提示：

- `manifest` 关键信息缺失
- 漏声明 `runtimePermissions`
- 误用 `localStorage/sessionStorage/indexedDB/document.cookie`
- 外链 `<script src="https://...">`
- 直接使用 `fetch/XMLHttpRequest/WebSocket/window.open/eval`

发布 npm 之后，先跑：

- `npm run catalog:check -- --scope yourscope`

它会直接验证已发布包的 tarball / integrity / manifest 是否真的可用于官方 catalog 收录。

完整流程见：

- `docs/WORKFLOW.md`
- `docs/PLATFORM_COMPATIBILITY.md`
- `docs/ANDROID_HOST_RUNBOOK.md`
