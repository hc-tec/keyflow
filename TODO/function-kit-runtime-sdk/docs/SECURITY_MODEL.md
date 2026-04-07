# Function Kit Runtime SDK Security Model

> 编码：UTF-8
> 创建时间：2026-03-21T21:35:00+08:00
> 更新时间：2026-03-21T23:55:00+08:00

## 基线

- 功能件页面只加载本地资源
- 需要展示远程图片/资源时，必须由宿主代理下载并映射为本地可加载 URL（例如 `files.download` / `files.getUrl`）
- 宿主只暴露 Host Bridge，不直接暴露高权限原生对象
- 所有能力都经过显式权限授予
- 最终文本写回必须走宿主

## 必须做的事

1. 本地资源 origin 固定
   - Windows：虚拟主机映射
   - Android：`WebViewAssetLoader` + 固定域名 `function-kit.local`
2. 关闭远程代码加载
3. 握手返回 `sessionId` 与 `grantedPermissions`
4. 未授权调用统一返回 `permission.denied`
5. 宿主记录稳定错误码
6. Android 默认使用 `WebMessageListener` / `postWebMessage`
7. Android 默认拒绝 Web 权限申请、下载、跨 origin 导航
8. Android 默认禁用 DOM Storage（`localStorage` / `sessionStorage` / `IndexedDB`）
   - 目前所有 kit 共用同一 origin（`https://function-kit.local`），启用 DOM Storage 会直接破坏 kit 隔离
   - 持久化必须走 `storage.*`（宿主做 per-kit namespace + 权限控制）

## 不允许做的事

1. 让功能件页面直接拿到 `InputConnection`
2. 让页面自己直接自动发送消息
3. 从远程 URL 动态执行未审核 UI 代码
4. 把平台私有桥直接暴露成业务 API
5. Android 侧无条件退回到宽松 `addJavascriptInterface`
