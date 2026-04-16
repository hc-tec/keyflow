# Preview Rewrite UI

这个 UI 演示正文类 AI 功能件最常见的闭环：

1. 读取当前输入
2. 请求 AI 生成单段正文
3. 展示预览
4. 用户确认后替换原文

默认不包含模式切换、debug strip 或持久化状态。需要这些能力时，再显式加入对应 UI 和 `runtimePermissions`。
