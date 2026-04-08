# 开发者平台缺口（Function Kit）

> 编码：UTF-8  
> 创建时间：2026-04-08  
> 目标：把“开发者拿到 starter 后哪里还会卡住”压成一份可执行的优先级清单，避免下一轮继续凭感觉补功能。

## 已补上的基础件

- starter npm 包：`@keyflow2/function-kit-template-petite-vue`
- starter 开箱预览：`templates/function-kit-template-petite-vue/scripts/open-in-kitstudio.mjs`
- starter 重命名：`templates/function-kit-template-petite-vue/scripts/rename-starter.mjs`
- create CLI 包源码：`templates/create-function-kit/`
  - 目标是提供 `npx @keyflow2/create-function-kit ...` 这类入口
  - 当前源码已在仓库内，是否发布到 npm 由维护者单独执行

## P0：还应该优先补什么

### 1. developer doctor / validate

现状：

- 维护者有 `build/verify` 脚本
- kit 作者还没有一个“我这项目为什么跑不起来”的一键自检命令

建议补：

- `manifest.json` schema 校验
- `runtimePermissions` 与常见 API 使用的缺项提醒
- `entry.bundle.html` / `script` / `style` 路径存在性检查
- starter vendored 依赖齐全性检查
- Android Host / KitStudio 能力差异提示

### 2. 平台能力兼容矩阵

现状：

- 事实散在 `DEVELOPER_GUIDE.md`
- 开发者最容易误判的是“KitStudio 可跑 = Android Host 也都支持”

建议补一张短表：

- capability
- KitStudio
- Android Host
- 当前限制
- 推荐替代方案

### 3. 官方模板矩阵

现状：

- 现在只有一个 panel-first 的 landing-page 风格 starter

建议再补至少 3 个官方 starter：

- `headless-action`
- `preview-rewrite`
- `file-upload`

## P1：值得继续做，但不必先做

### 4. 外部开发者发布闭环

把“做完 kit 以后怎么发出去”继续产品化：

- 一键 pack
- 一键 publish
- 一键生成 catalog entry
- 最短官方 catalog 提交流程

### 5. vendored 资产同步自动化

现状：

- 目前主要靠 `CONTRIBUTING.md` 人工提醒

建议补：

- CI 检查 starter vendored 副本是否落后于事实来源
- 必要时自动同步脚本

### 6. 更多真实样例

除了 starter 本身，再挑几类“开发者最可能照抄”的官方样板继续整理成可直接 fork 的目录：

- 本地存储型
- AI 改写型
- 发送拦截型
- Store/catalog 型

## 判断标准

只看一个问题：

> 一个第一次接触 Keyflow Function Kit 的开发者，能不能在 15 分钟内完成：
> 创建项目 → 看见真实效果 → 改出自己的第一个动作 → 知道怎么继续发布

只要这条链路上还有明显问号，上面的 P0 就还没做完。
