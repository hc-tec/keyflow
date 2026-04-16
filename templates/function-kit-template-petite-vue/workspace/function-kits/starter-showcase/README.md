# Starter Showcase

这个 kit 是模板包里的默认示例，也是你第一次用 KitStudio 打开时会直接看到的页面。

建议的使用顺序：

1. 先运行 `npm run open:kitstudio`
2. 看看页面里的 runtime 动作是否正常：`Refresh context` / `Insert pitch` / `Replace draft`
3. 改完之后先运行 `npm run doctor`
4. 再运行 `npm run rename:starter -- --kit-id yourscope.launchpad --name "Launchpad"`
5. rename 之后可以继续直接运行 `npm run open:kitstudio`
6. 准备发布时回到工作区根目录，用 `npm run pack:zip` / `npm run pack:npm`

最常改的文件：

- `manifest.json`
- `ui/app/index.html`
- `ui/app/main.js`
- `ui/app/styles.css`
- `ui/vendor/` 里的 vendored 依赖
