# Function Kit Workspace Workflow

这个工作区已经把“开发一个可运行的 Keyflow Function Kit”最容易缺的本地工具带进来了。你不需要先 clone `keyflow` 仓库，直接在当前目录就能走完开发、自检、打包、发布的主流程。

## 0. 先决条件

- `open:kitstudio` 依赖本机已有 `kit-studio` 仓库；默认找当前项目同级目录 `../kit-studio`
- 如果默认路径不对，用 `KITSTUDIO_ROOT` 指向你的 KitStudio 根目录；如需改监听地址，再设置 `KITSTUDIO_HOST` / `KITSTUDIO_PORT`
- `publish:npm` 不会绕过 npm 权限模型；你仍然需要 npm 账号、目标 package 或 scope 的发布权限，以及 `--token-file` / `NPM_TOKEN` / `NODE_AUTH_TOKEN` / `npm login` 之一
- 当前 starter 默认不创建 `.env` 来配置 AI provider；如果你的 kit 依赖 `ai.request`，真实的 `Base URL / API key / model` 要在 KitStudio 或 Android Host 的共享 AI 设置里完成
- 如果你现在只是要做本地闭环，不需要先准备 npm 发布凭据；先走 `doctor -> pack:zip -> Android Host` 即可

## 1. 推荐工作流

### 1.1 本地预览

```powershell
npm run open:kitstudio
```

如果 `KitStudio` 不在当前项目同级目录 `../kit-studio`，先指定它的路径：

```powershell
$env:KITSTUDIO_ROOT = "D:\dev\kit-studio"
npm run open:kitstudio
```

如果你还要改本机监听地址，可以一起设置：

```powershell
$env:KITSTUDIO_HOST = "127.0.0.1"
$env:KITSTUDIO_PORT = "39001"
npm run open:kitstudio
```

### 1.2 每次改动后先自检

```powershell
npm run doctor
```

`doctor` 会检查：

- `manifest.json` 是否和目录名一致
- `manifest.name/version/description/entry.type/platforms` 是否完整
- `entry.bundle.html/script/style` 是否存在
- 图标路径是否存在
- vendored `ui/vendor/*` 资源是否齐全
- `runtimePermissions` 是否遗漏了常见 API 对应权限
- 是否误用了 `localStorage/sessionStorage/indexedDB/document.cookie`
- 是否加载了外链 `<script src="https://...">`
- 是否直接用了 `fetch/XMLHttpRequest/WebSocket/window.open/eval`

如果你的工作区里有多个 kit，用 `--kit` 指定目标：

```powershell
npm run doctor -- --kit yourscope.proofreader
```

## 2. 打包与分发

### 2.1 生成 ZIP 安装包

```powershell
npm run pack:zip
```

输出：

- `artifacts/zip/<kitId>/<kitId>-<version>.zip`
- `artifacts/zip/<kitId>/<kitId>-<version>.json`

适合场景：

- 本地直接安装到 Android Host / 下载中心
- 用 KitStudio 或其他静态服务托管 ZIP
- 先做私有测试，不急着上 npm

### 2.2 生成 npm 包 tarball

```powershell
npm run pack:npm -- --scope yourscope
```

输出：

- `artifacts/npm/build/<kitId>/`
- `artifacts/npm/tarballs/<kitId>/*.tgz`
- `artifacts/npm/kit-packages.json`

PowerShell 下建议写 `--scope keyflow2`，不要直接裸写 `@keyflow2`。

### 2.3 发布到 npm

真正发布前，建议先单独确认两件事：

```powershell
npm whoami
npm run publish:npm -- --scope yourscope --dry-run
```

`npm whoami` 通过只代表当前机器已有认证；如果目标包是 `@scope/...`，当前账号还必须已经拥有该 scope 的发布权限。

先准备 npm token，推荐放到本地临时文件：

```powershell
npm run publish:npm -- --scope yourscope --token-file .\tmp\npm-token.txt
```

也可以使用已有的 `NPM_TOKEN` / `NODE_AUTH_TOKEN` 环境变量，或本机 `~/.npmrc` 登录态。

现在 `publish:npm` 在非 `--dry-run` 下会先跑一次 `npm whoami` 预检；如果认证缺失，会在真正 `npm publish` 前直接失败，并明确提示需要补齐账号、权限和 token/login。

先演练不真正发布：

```powershell
npm run publish:npm -- --scope yourscope --dry-run
```

### 2.4 先做官方 catalog 提交前检查

```powershell
npm run catalog:check -- --scope yourscope
```

输出：

- `artifacts/catalog/<kitId>.catalog-check.json`
- `artifacts/catalog/<kitId>.catalog-entry.md`

这一步会直接到 npm registry 检查：

- 目标包和版本是否真的已发布
- `dist.tarball` / `dist.integrity` 是否可用
- tarball 里的 `manifest.json` / `package.json` 是否和本地 kit 对得上
- bundle 文件和图标文件是否真的被打进包里

### 2.5 生成官方 catalog 提交片段

```powershell
npm run catalog:entry -- --scope yourscope
```

输出：

- `artifacts/catalog/<kitId>.catalog-entry.json`

这个文件会给出：

- npm 包名与版本
- `runtimePermissions`
- 官方 catalog PR / Issue 可直接复制的 Markdown 片段

## 3. 什么时候用 ZIP，什么时候用 npm

- 只想本机或小范围测试：优先 `pack:zip`
- 想让用户通过 `npm:` 安装或做版本更新检查：用 `pack:npm` / `publish:npm`
- 想进官方 catalog：先发布 npm，再跑 `catalog:check`，通过后再跑 `catalog:entry`

如果你要给 Android 用户长期分发，通常顺序是：

1. `npm run doctor`
2. `npm run pack:zip` 做真机安装验收
3. `npm run pack:npm` / `npm run publish:npm`
4. `npm run catalog:check`
5. `npm run catalog:entry`

## 4. 版本管理提醒

- 每次重新发布前记得修改 kit 的 `manifest.json -> version`
- ZIP 文件名和 npm 包版本都来自 `manifest.version`
- 同一个 npm 包版本不能重复发布

## 5. 平台边界

KitStudio 能把开发效率拉起来，但它不是 Android Host 的 1:1 等价物。发布前至少再看一遍：

- `docs/PLATFORM_COMPATIBILITY.md`
- `docs/ANDROID_HOST_RUNBOOK.md`

尤其注意这些点：

- 不要用 `localStorage/sessionStorage/IndexedDB` 做持久化
- 不要依赖外链脚本
- `files.getUrl` / `files.download` 在 Android Host 仍不是通用能力
- `ai.request` 在 KitStudio 里有 `demo / real / replay` 模式，不等于设备上的共享 AI 环境
