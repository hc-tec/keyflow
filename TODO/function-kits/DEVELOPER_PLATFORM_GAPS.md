# 开发者平台缺口（Function Kit）

> 编码：UTF-8  
> 创建时间：2026-04-08  
> 目标：把“开发者拿到 starter 后哪里还会卡住”压成一份可执行的优先级清单，避免下一轮继续凭感觉补功能。

## 已补上的基础件

- starter npm 包：`@keyflow2/function-kit-template-petite-vue`
- starter 开箱预览：`templates/function-kit-template-petite-vue/scripts/open-in-kitstudio.mjs`
- starter 重命名：`templates/function-kit-template-petite-vue/scripts/rename-starter.mjs`
- developer doctor / validate：
  - `templates/function-kit-template-petite-vue/scripts/doctor.mjs`
  - 现在外部开发者不需要先回到仓库根目录找 verify 脚本
- 外部开发者打包 / 发布闭环：
  - `templates/function-kit-template-petite-vue/scripts/pack-kit-zip.mjs`
  - `templates/function-kit-template-petite-vue/scripts/pack-kit-npm.mjs`
  - `templates/function-kit-template-petite-vue/scripts/publish-kit-npm.mjs`
  - `templates/function-kit-template-petite-vue/scripts/generate-catalog-entry.mjs`
- 平台能力短文档：
  - `templates/function-kit-template-petite-vue/docs/PLATFORM_COMPATIBILITY.md`
  - `templates/function-kit-template-petite-vue/docs/WORKFLOW.md`
- create CLI 包源码：`templates/create-function-kit/`
  - 目标是提供 `npx @keyflow2/create-function-kit ...` 这类入口
  - 当前源码已在仓库内，是否发布到 npm 由维护者单独执行

## P0：还应该优先补什么

### 1. 官方模板矩阵

现状：

- 现在只有一个 panel-first 的 landing-page 风格 starter

建议再补至少 3 个官方 starter：

- `headless-action`
- `preview-rewrite`
- `file-upload`

## P1：值得继续做，但不必先做

### 2. vendored 资产同步自动化

现状：

- 目前主要靠 `CONTRIBUTING.md` 人工提醒

建议补：

- CI 检查 starter vendored 副本是否落后于事实来源
- 必要时自动同步脚本

### 3. 更多真实样例

除了 starter 本身，再挑几类“开发者最可能照抄”的官方样板继续整理成可直接 fork 的目录：

- 本地存储型
- AI 改写型
- 发送拦截型
- Store/catalog 型

## 判断标准

只看一个问题：

> 一个第一次接触 Keyflow Function Kit 的开发者，能不能在 15 分钟内完成：
> 创建项目 → 看见真实效果 → 改出自己的第一个动作 → 知道怎么继续发布

当前这条链路的基础闭环已经具备，但“更适合不同场景的官方 starter 模板”仍然没补齐。
