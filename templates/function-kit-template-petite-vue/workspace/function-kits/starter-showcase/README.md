# Starter Showcase

这个 kit 是模板包里的默认示例，也是你第一次用 KitStudio 打开时会直接看到的页面。

建议的使用顺序：

1. 先运行 `npm run open:kitstudio`
2. 看看页面里的 runtime 动作是否正常：`Refresh context` / `Insert pitch` / `Replace draft`
3. 再运行 `npm run rename:starter -- --kit-id yourscope.launchpad --name "Launchpad"`
4. rename 之后可以继续直接运行 `npm run open:kitstudio`
5. 然后开始删示例文案、换成你的真实工作流

最常改的文件：

- `manifest.json`
- `ui/app/index.html`
- `ui/app/main.js`
- `ui/app/styles.css`
- `ui/vendor/` 里的 vendored 依赖
