# Contributing

感谢你愿意为本项目贡献！

## 提交前检查

### Runtime SDK

```bash
cd TODO/function-kit-runtime-sdk
npm test
```

### Developer Starter Template

如果你改了 starter 模板、create CLI、vendored runtime 资源，或这些 npm 分发脚本，请至少跑：

```bash
node scripts/npm/build-starter-template.mjs
node scripts/npm/verify-starter-template.mjs
node scripts/npm/build-create-function-kit.mjs
node scripts/npm/verify-create-function-kit.mjs
```

## 开发环境（完整 workspace）

如果你需要 KitStudio / Android IME 宿主一起联调，请先按 `docs/DEVELOPMENT.md` 搭好完整环境。

如果你在改开发者 starter，建议再用本机的 KitStudio 跑一次：

```bash
cd templates/function-kit-template-petite-vue
npm run open:kitstudio -- --dry-run
```

如果你在改 create CLI，建议再做一次本地脚手架冒烟：

```bash
node templates/create-function-kit/bin/create-function-kit.mjs artifacts/smoke/create-function-kit --template-dir templates/function-kit-template-petite-vue --kit-id keyflow2.smoke --name "Smoke" --dry-run
```

## PR 约定

- 说明清楚动机、取舍与风险（最好附截图/录屏/日志片段）。
- 尽量把变更拆成可独立回滚的小 PR。
- 不要提交任何密钥、token、个人隐私信息或内部地址（如需示例，请用占位符）。

## 发布约定

- `keyflow` 是对外分发入口；Android APK 只发布到 `keyflow` GitHub Releases。
- `fcitx5-android` 仓库只保留源码与构建流程，不上传 APK assets。
- `v*` tag 只用于 `keyflow` 自身工具链/模板发布，不混挂 Android APK。
- Android APK 发布必须单独命名，并把 APK 版本与签名级别写进 tag / release name：
  - 正式签名：`fcitx5-android-<apkVersion>`
  - debug keystore：`fcitx5-android-<apkVersion>-debug`
- 如果 APK 由 `debug.keystore` 签名，GitHub Release 必须标为 `pre-release`，并在说明里明确写“仅供安装/测试”。
- 正式 Android 签名材料统一放在根目录 `.local-secrets/android-release/`，通过 `scripts/release/` 下的脚本生成和读取；不要自行把 keystore 放进仓库或 `fcitx5-android` 子仓库。

## 风格与工程约定

- 文档/脚本/代码一律使用 UTF-8 编码。
- 变更涉及新能力/新接口时，请同步更新对应文档（优先放在 `TODO/function-kits/` 或 `TODO/function-kit-runtime-sdk/docs/`）。
- 如果你改了 `TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js`、`TODO/function-kits/shared/vendor/petite-vue/` 或 `TODO/function-kits/shared/ui/kit-shadcn.css`，请同步更新 starter 包里的 vendored 副本：
  - `templates/function-kit-template-petite-vue/workspace/function-kits/starter-showcase/ui/vendor/`
- 如果你改了 starter 的目录结构、rename/open helper 或包名，请同时检查 `templates/create-function-kit/` 是否仍然能正确解包并调用 starter helper。
