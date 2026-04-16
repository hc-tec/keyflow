# Preview Rewrite Starter

这个 kit 是正文预览型 AI 功能件 starter。

建议使用顺序：

1. 运行 `npm run open:kitstudio`
2. 打开后确认输入框内容已自动带入；如果为空，直接粘贴一段文本
3. 点击 `Generate preview`
4. 确认预览符合预期后点击 `Replace input`
5. 改成自己的产品逻辑前先运行 `npm run rename:starter -- --kit-id yourscope.proofreader --name "Proofreader"`

最常改的文件：

- `manifest.json`
- `ui/app/index.html`
- `ui/app/main.js`
- `ui/app/styles.css`

发布前至少跑：

```powershell
npm run doctor
npm run pack:zip
```
