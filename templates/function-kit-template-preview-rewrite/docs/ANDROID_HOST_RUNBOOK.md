# Android Host ZIP Runbook

这个 runbook 只回答一个问题：

> 你当前生成出来的 starter，能不能真的从 ZIP 安装到 Android Host，并完成一次最核心的用户路径？

## 1. 目标效果

验收通过至少要满足下面 4 条：

1. `npm run pack:zip` 能生成当前 kit 的 ZIP 安装包。
2. Android 设备里的下载中心能成功安装这个 ZIP。
3. 安装后能在功能件入口里打开它，而不是只停留在已安装列表。
4. 你这个 starter 最关键的按钮能在真机上完成一次闭环。

对 `preview-rewrite` starter，最低闭环是：

1. 读取当前输入
2. 生成预览
3. 替换原文

## 2. 先决条件

- 你的工作区已经完成至少一次重命名：
  - `npm run rename:starter -- --kit-id myname.proofreader --name "Proofreader"`
- 已通过本地自检：
  - `npm run doctor`
- 设备上已经安装带下载中心的 Keyflow Android Host

## 3. 生成 ZIP

在工作区根目录执行：

```powershell
npm run pack:zip
```

产物默认在：

- `artifacts/zip/<kitId>/<kitId>-<version>.zip`
- `artifacts/zip/<kitId>/<kitId>-<version>.json`

先确认 3 个事实：

1. 文件名里的 `version` 就是 `manifest.json -> version`
2. ZIP 里包含当前 kit 的 `manifest.json`
3. 你这次验收用的就是刚生成的 ZIP，不是旧产物

## 4. 把 ZIP 交给 Android Host

现在有两条推荐路径，任选其一：

### 路径 A：从本地选择 ZIP

1. 把 ZIP 传到手机本地
2. 在 Keyflow 里打开下载中心
3. 进入“导入外部功能”
4. 点击“从本地选择 ZIP”
5. 选中刚才生成的 ZIP

### 路径 B：通过 URL 安装 ZIP

1. 把 ZIP 放到一个手机能访问的 HTTP 地址
2. 在 Keyflow 里打开下载中心
3. 进入“导入外部功能”
4. 粘贴 `https://.../<kitId>-<version>.zip`
5. 点击“验证并安装”

如果你只是做真机验收，优先本地 ZIP，变量更少。

## 5. 安装后检查什么

安装完成后，不要只看“已安装”提示。至少再做下面这些检查：

1. 已安装列表里出现你的 kit 名称和版本
2. 图标、标题、简介不是 starter 默认残留
3. 打开后首页能正常渲染
4. 不出现白屏、权限报错、资源 404

## 6. Preview-Rewrite 最低验收

对这个 starter，至少做下面一轮：

1. 聚焦到一个可编辑输入框
2. 打开你的 kit
3. 确认原文被自动读取到面板中；如果为空，手动粘贴一段文本
4. 点击 `Generate preview`
5. 确认预览区拿到结果
6. 点击 `Replace input`
7. 回到输入框，确认文本被替换

如果你的 kit 依赖共享 AI，再额外确认：

1. Android Host 已配置共享 AI
2. 返回结果不是只在 KitStudio 里成立的 demo/replay 行为
3. 错误态文案在真机上也能解释清楚

## 7. 常见失败点

- `runtimePermissions` 漏声明，KitStudio 里看着能跑，真机上直接缺权限
- 资源路径仍然指向旧 starter 名称
- 只在 KitStudio 验过，没在 Android Host 验共享 AI 或真实网络
- `manifest.version` 没更新，误把旧 ZIP 当新包安装

## 8. 通过标准

以下都满足，才算 ZIP 安装链路通过：

- ZIP 安装成功
- 功能件能从列表真正打开
- 核心主路径能走通一次
- 权限 / AI / 网络失败态不会直接把用户卡死

通过后，再继续 `npm run pack:npm` / `npm run publish:npm` 会更稳。
