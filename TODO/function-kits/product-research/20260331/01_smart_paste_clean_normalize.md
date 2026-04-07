# 01｜一键净化粘贴（清格式 + 规范化）

> 编码：UTF-8  
> 状态：调研草案（可直接进入 Brief）  
> 关键词：Smart Paste / Paste as plain text / 文本规范化 / 零切换  

## 1. 一句话价值

用户复制任何内容（网页/PDF/聊天/文档），在输入框里**一键变成“干净、可直接发送/提交”的纯文本**：不再需要“先粘贴到记事本清格式”。

## 2. 典型用户场景（高频）

1. 从网页复制一段话 → 粘贴到微信/钉钉/邮件 → 结果带奇怪换行/空格/标点/不可见字符  
2. 从 PDF 复制 → 粘贴到表单/工单 → 中英文空格错乱、全角半角混用  
3. 从聊天里复制多段 → 粘贴到群里 → 出现多余空行、编号乱、emoji/特殊符号导致排版崩  
4. 从 Office/Notion 复制富文本 → 粘贴到纯文本输入框 → 粘贴失败/格式污染  

## 3. 为什么“输入法功能件”独有（独立 AI 工具做不到的体验）

- **场景原位**：用户下一步就是“在当前输入框里粘贴/发送”。输入法在“粘贴前”介入，不需要切到任何 App。  
- **1 步闭环**：独立工具要“复制→切换→粘贴→处理→复制→切回→粘贴”，用户经常嫌麻烦直接放弃。  
- **信任边界清晰**：这类能力可以做到**纯本地**（不联网/不 AI），天然更容易获得授权和口碑。

> 这类产品在桌面端已经被验证有长期需求：例如 Windows 上的 PureText、PowerToys 的 Advanced Paste，macOS 的“粘贴并匹配样式（Paste and Match Style）”等。

## 4. 交互设计（强制 1-1-1）

### 4.1 入口（1 步唤起）

并行提供 2 个入口（覆盖不同习惯）：

1. **复制后 chip**：用户复制文本后，IME 提示“净化粘贴”chip（用户点才执行，默认静默）。  
2. **`/粘贴`**：在输入框输入 `/粘贴`，候选条出现“净化粘贴（替换/插入）”。

### 4.2 默认执行（1 步完成）

点击后直接给出两个按钮：

- **替换输入框内容**（replace）
- **插入到光标处**（insert）

默认预览区域显示“净化后的文本（前 200 字预览）”，并显示“做了哪些处理”（可折叠）。

### 4.3 返回（1 步返回）

执行 insert/replace 后面板自动收起，回到输入。

## 5. 处理规则（MVP 先做确定性、本地规则）

MVP 规则建议（全部可本地实现）：

- 去掉富文本痕迹：统一输出纯文本
- 去不可见字符：`\\u200b`、`\\uFEFF` 等
- 统一换行：多行合并规则（保留段落但压缩连续空行）
- 空格规则：中英文间补空格、连续空格压缩
- 标点规则：全角/半角统一；引号/括号配对修正（轻量）
- 列表规则：复制来的 `1)` `1.` `•` 简单归一（深度列表留到 04）

> 重要：不要“聪明过头”。宁愿少处理，也不要误改用户内容。

## 6. 权限与数据边界（信任优先）

### 6.1 最小权限

- `context.read`：获取输入框内容（用于 replace）与选区（若有）
- `input.insert` / `input.replace`
- （可选）`storage.write`：保存用户偏好（比如“默认插入还是替换”）

### 6.2 明确不做

- 不联网（MVP）
- 不上传任何内容
- 不做动态监听（MVP）

## 7. MVP 范围（建议 1~2 天可交付的切片）

**Must**

- 复制后 chip 触发（或 `/粘贴` 二选一也可先做）
- 纯本地净化规则（上述最小集）
- insert / replace 两个动作
- 可撤销：提供“撤销上次替换”（通过 storage 暂存 lastText）

**Should**

- 显示“本次净化做了哪些操作”的简短清单（增强可解释性）
- 快捷切换“保留换行 / 合并成一段”

**Won’t（先不做）**

- AI 纠错/润色（会拉高成本与隐私顾虑）
- 深度格式化（表格/复杂列表）

## 8. 竞品与参考（用于证明需求与借鉴交互）

- PureText（Windows 粘贴为纯文本小工具）：`https://www.puretext.us/`
- Microsoft PowerToys “Advanced Paste”（高级粘贴）：`https://learn.microsoft.com/en-us/windows/powertoys/advanced-paste`
- WindowsCentral 对 Advanced Paste 的介绍（可借鉴定位/叙事）：`https://www.windowscentral.com/software-apps/powertoys-gets-advanced-paste-with-ai`
- macOS “Paste and Match Style” 概念（系统级纯文本粘贴心智）：`https://support.apple.com/guide/mac-help/copy-and-paste-text-and-images-mh29237/mac`

## 9. 风险与缓解

1. **误改内容导致不信任**：默认只做“确定性净化”，并提供“预览+撤销”。  
2. **打扰**：复制后 chip 必须“克制、可关闭、频率限制”。  
3. **复杂场景不可控**：复杂列表/表格先不碰，逐步引入“高级模式”。  

## 10. 指标（验证是否值得作为 P0）

- 触发：复制后 chip 曝光→点击率
- 成功：净化后 insert/replace 转化率
- 复用：7 日内人均使用次数（目标：≥ 3 次/天/人）
- 负反馈：关闭 chip 的比例、撤销比例（撤销高说明规则误伤）

## 11. 工程对接备注（对应现有 SDK）

- UI 侧：`FunctionKitRuntimeSDK.createKit({ kitId, surface: \"panel\" })`
- 获取上下文：`await kit.context.refresh()`
- 写回：`await kit.input.insert(text)` / `await kit.input.replace(text)`
- 偏好与撤销缓存：`kit.storage.get/set`

