# UI Notes

这个 starter 故意把依赖都放在本地：

- `vendor/function-kit-runtime.js`
- `vendor/petite-vue.iife.js`
- `vendor/kit-shadcn.css`

因此 `ui/app/index.html` 可以直接这样引入：

```html
<link rel="stylesheet" href="../vendor/kit-shadcn.css" />
<script src="../vendor/function-kit-runtime.js"></script>
<script src="../vendor/petite-vue.iife.js"></script>
```

这样做的目的不是长期强制 vendored，而是让开发者第一次拿到模板时，不需要先理解 shared mounts、CSP 和 runtime SDK 目录映射，就能直接看到效果。
