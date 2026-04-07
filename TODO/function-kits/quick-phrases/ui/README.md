# Quick Phrases UI Runtime

> 编码：UTF-8
> 创建时间：2026-03-23T20:50:00+08:00

## 1. 目标

这个 UI 只做一件事：把常用短语管理和写回动作跑通。

## 2. 交互

- 宿主连上后读取当前输入上下文
- 从功能件存储里拉取 3 个短语槽位
- 每个槽位都支持：
  - 直接插入
  - 直接替换
  - 覆写保存
- 自定义草稿支持手动插入或替换

## 3. 预览

页面自带 mock host：

- 不依赖真实 Windows / Android 宿主也能预览
- 会模拟 `bridge.ready.ack`
- 会模拟 `context.sync`
- 会模拟 `storage.sync`
- 会模拟 `candidate.insert` / `candidate.replace` 的完成状态
