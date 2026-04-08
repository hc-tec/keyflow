# Contributing

感谢你愿意为本项目贡献！

## 提交前检查

### Runtime SDK

```bash
cd TODO/function-kit-runtime-sdk
npm test
```

### Developer Starter Template

如果你改了 starter 模板、vendored runtime 资源，或 starter 的 npm 分发脚本，请至少跑：

```bash
node scripts/npm/build-starter-template.mjs
node scripts/npm/verify-starter-template.mjs
```

## 开发环境（完整 workspace）

如果你需要 KitStudio / Android IME 宿主一起联调，请先按 `docs/DEVELOPMENT.md` 搭好完整环境。

如果你在改开发者 starter，建议再用本机的 KitStudio 跑一次：

```bash
cd templates/function-kit-template-petite-vue
npm run open:kitstudio -- --dry-run
```

## PR 约定

- 说明清楚动机、取舍与风险（最好附截图/录屏/日志片段）。
- 尽量把变更拆成可独立回滚的小 PR。
- 不要提交任何密钥、token、个人隐私信息或内部地址（如需示例，请用占位符）。

## 风格与工程约定

- 文档/脚本/代码一律使用 UTF-8 编码。
- 变更涉及新能力/新接口时，请同步更新对应文档（优先放在 `TODO/function-kits/` 或 `TODO/function-kit-runtime-sdk/docs/`）。
- 如果你改了 `TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js`、`TODO/function-kits/shared/vendor/petite-vue/` 或 `TODO/function-kits/shared/ui/kit-shadcn.css`，请同步更新 starter 包里的 vendored 副本：
  - `templates/function-kit-template-petite-vue/workspace/function-kits/starter-showcase/ui/vendor/`
