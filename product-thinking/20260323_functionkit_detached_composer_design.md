# Function Kit 独立编辑框设计（Detached Composer）

> 编码：UTF-8
> 创建时间：2026-03-23T02:45:00+08:00
> 更新时间：2026-03-23T03:10:00+08:00
> 适用范围：Android IME / Windows IME / Function Kit Runtime / Host Bridge
> 状态：ARCHIVED（2026-03-25）：Detached Composer（可见草稿 UI）已从主线撤回，`composer.apply.*` 也已移除。
> 最新输入方案：Embedded Input Bridge（功能件 Web 输入框自动桥接宿主键盘输入）：`TODO/ime-research/notes/20260325_functionkit_input_bridge.md`
> 关联文档：
> - `product-thinking/ime-plugin-ecosystem.md`
> - `TODO/function-kits/chat-auto-reply/ui/README.md`
> - `TODO/ime-research/windows-testhost/README.md`

## 0. 核心结论

功能件里可以有“输入框”，但不能把它理解成：

- 再打开一个新的输入法
- 或让 WebView 里的 `<input>` 直接接管输入链路

正确做法是：

- **仍然只有一个输入法实例**
- **输入法内部切换当前输入目标**
- **功能件自己的输入框应该提升成一个宿主拥有的独立编辑框**
- **这个独立编辑框位于键盘上方，但仍属于当前输入法会话**
- **功能件内部 input 聚焦后，系统输入法仍然继续工作；只是当前输入目标切到 `kit_draft`**

这个能力可以命名为：

- **Detached Composer**
- 中文可以叫：**独立编辑框** 或 **悬浮编辑器**

一句话定义：

- **Detached Composer 是 IME 自己拥有的原生编辑区，不是第二个输入法，也不是普通应用悬浮窗。**

---

## 1. 为什么这个问题必须单独设计

如果不单独设计，功能件输入框很容易落入两种错误做法：

### 1.1 错误做法 A：直接用 WebView 输入框

问题：

- 焦点容易乱
- WebView 输入法行为不稳定
- 外部目标输入框和功能件输入框容易互相污染
- 很难做“像原生输入框一样”的体验

### 1.2 错误做法 B：起一个新的 Activity / 全局悬浮窗

问题：

- 抢走当前 App 焦点
- 很容易丢失原输入目标
- Android 平台限制多
- 体验上像“跳出去开了另一个界面”

用户真正想要的其实是：

- 功能件的输入框像原生输入框一样好用
- 键盘还在下面正常工作
- 输入框可以从面板中独立出来
- 输入法收起后，这个编辑框不一定立刻消失
- 但它仍然属于当前输入任务，不是一个完全独立的新系统

---

## 2. 设计目标

这个能力的目标应该写死：

1. **输入体验接近原生输入框**
2. **不再依赖 WebView 内部输入控件承载主编辑职责**
3. **键盘仍然是同一个输入法实例**
4. **功能件输入区和外部目标输入框严格分离**
5. **写回外部目标必须显式**
6. **允许功能件从面板形态提升为独立编辑框形态**

非目标：

- 不做系统级永久悬浮窗
- 不做跨输入会话长期驻留
- 不允许偷偷双向同步外部输入框

---

## 3. 核心模型：一个 IME，两个输入目标

这是最重要的概念。

不是两个输入法，而是同一个输入法里存在两个输入目标：

### A. `external_editor`

也就是当前 App 的真实输入框。

特点：

- 由系统 `InputConnection` 代表
- 是最终文本提交目标
- 可能随 App 焦点变化而失效

### B. `kit_draft`

也就是功能件自己的草稿输入目标。

特点：

- 由 IME 宿主自己维护
- 不直接等同于外部输入框
- 可以被 Detached Composer 显示和编辑

关键原则：

- **同一时刻只有一个当前输入目标**
- **键盘始终只有一个**
- **用户点进功能件输入框时，按键写入 `kit_draft`**
- **用户点回原输入框时，按键写回 `external_editor`**

所以这不是“打开第二个输入法”。
而是：

- **同一个输入法切换了写入目标。**

---

## 4. Detached Composer 的正确定位

Detached Composer 不是普通面板里的一个输入框。

它应该被定义成：

- **从功能件面板中提升出来的独立原生编辑层**

建议视觉位置：

- 位于键盘上方
- 独立于功能件 WebView 面板
- 可收起、最小化、关闭

但它和普通全局悬浮窗不同：

- 它属于 IME
- 它属于当前输入会话
- 它并不默认跨应用长期存活

换句话说：

- **它独立于功能件面板**
- **但不独立于输入法会话**

---

## 5. 为什么不能把 WebView 输入框当主方案

现有仓库已经有两个很正确的约束：

- 面板内自己的输入框不直接复用外部目标输入连接  
  见：`TODO/function-kits/chat-auto-reply/ui/README.md`
- “当前焦点”和“最后提交目标”需要分离  
  见：`TODO/ime-research/windows-testhost/README.md`

继续往前推，结论就会更明确：

- **WebView 输入框可以作为视觉占位**
- **但不应该作为权威输入源**

原因：

1. Android WebView 的焦点与 IME 交互不够稳
2. 它会诱导你把功能件输入框做成“普通 App 输入框”
3. 后面很难处理原目标输入框、写回目标、异步结果等边界

所以更稳的做法是：

- WebView 里显示一个“可编辑区域”或“点击编辑”
- 真正的输入发生在宿主原生 Detached Composer 里

---

## 6. Android 主线实现建议

Android 上应该优先做成：

- **IME-owned native composer**

也就是：

1. 输入法下半部分仍然是正常键盘
2. 键盘上方新增一个原生编辑面板
3. 这个面板使用原生输入控件
   - `EditText`
   - 或 Compose `TextField` / `BasicTextField`
4. 功能件 WebView 不直接承载主输入框

这条路的好处：

- 输入体验更接近原生
- 焦点模型可控
- 同一个输入法继续给它输入
- 不需要再起一个“新输入法”

### 6.1 不建议作为主线的方案

不建议把主线做成：

- 普通应用悬浮窗
- 另起一个 Activity
- 依赖 WebView `<input>` 承担核心输入

这些都不够稳。

### 6.2 关键要求：功能件内部聚焦后，系统输入法必须继续可用

这条要求必须单独写死，因为它是 Detached Composer 成败的核心。

正确语义不是：

- 点击功能件输入位后，WebView DOM input 自己接管系统输入
- 或者系统再弹出一套“新的输入法”

正确语义是：

- **点击功能件输入位，只是通知宿主把当前输入目标切到 `kit_draft`**
- **真正承接系统输入的是 IME-owned native composer**
- **下方键盘仍然是同一个系统输入法实例**
- **拼写中、联想、候选、提交动作继续沿用同一条 IME 输入链**

推荐的事件流应当是：

1. 用户点击功能件里的“输入位”或“展开编辑”
2. WebView 发送 `composer.open` / `composer.focus`
3. 宿主打开并聚焦原生 Detached Composer
4. 宿主把当前输入目标切换为 `kit_draft`
5. 系统输入法继续把 composing / commit 文本送入这个原生 composer
6. WebView 只接收状态同步，不直接成为权威输入源

所以这里真正要解决的不是“让 WebView input 拿到焦点”，而是：

- **让宿主拥有的 composer 成为新的 IME 输入目标**
- **同时保证系统输入法不用退出，也不用切换实例**

---

## 7. 触发方式

Detached Composer 至少支持两种触发：

### 7.1 焦点触发

当功能件里某个“输入位”被点击时：

- 宿主收到 `composer.open`
- Detached Composer 打开并获取输入目标
- WebView 内的输入位只作为触发点，不作为真实系统输入承载点

### 7.2 显式按钮触发

例如：

- “独立编辑”
- “展开编辑框”
- “全屏编辑”

这样即使 WebView 内没有真实输入控件，也能触发独立编辑。

建议两种都支持。

---

## 8. 生命周期与状态机

Detached Composer 至少要有下面几个状态：

### 8.1 `hidden`

- 未显示
- `kit_draft` 可能为空

### 8.2 `visible_unfocused`

- 编辑框可见
- 当前输入目标不是它

### 8.3 `visible_focused`

- 编辑框可见
- 当前输入目标切到 `kit_draft`
- 键盘输入全部进入 Detached Composer

### 8.4 `minimized`

- 编辑框缩成一个条或卡片
- 内容仍然保留

### 8.5 `target_lost`

- 原目标输入框已经失效
- Detached Composer 可以只保留本地草稿
- 但写回按钮必须禁用

### 8.6 `closed`

- 编辑框关闭
- 如果没有保存，草稿按策略丢弃或暂存

---

## 9. 写回规则

这部分必须足够严格。

Detached Composer 的内容不能自动同步到外部输入框。

正确规则只有三条：

1. **插入**
   - 将草稿插入到当前外部目标光标处
2. **替换**
   - 用草稿替换当前目标输入框选区或候选区域
3. **复制 / 导出**
   - 用户自己决定后续怎么用

必须禁止：

- 用户在 Detached Composer 里打字时，外部输入框偷偷同步变化
- 外部输入框变化时，Detached Composer 自动强耦合跟随

这是为了避免：

- 焦点混乱
- 目标错写
- AI 结果覆盖错误区域

---

## 10. 输入法收起后能不能继续保留

这是一个要提前说清的边界。

用户想要的是：

- 键盘收起后，独立编辑框还在

这个目标可以支持，但不能无限制。

更合理的规则是：

### 10.1 当前输入会话仍然存在

如果：

- 原 App 还在
- 当前可编辑会话还没结束

那么 Detached Composer 可以继续可见。

### 10.2 当前输入会话已经结束

如果：

- 用户切到没有输入框的页面
- 原目标已经失焦
- 系统重建了输入连接

那么 Detached Composer 不应再继续保留“可写回旧目标”的能力。

此时只能二选一：

1. 自动关闭
2. 退化为只保留本地草稿的只读/草稿态

所以不能把它定义成：

- 永久全局悬浮窗

而应该定义成：

- **输入法会话级独立编辑框**

---

## 11. AI / Agent 与 Detached Composer 的关系

这个能力跟前面的 Chat / Agent 设计是天然配套的。

因为功能件以后会出现三种文本来源：

### A. `targetContext`

- 当前外部输入框上下文

### B. `kitDraft`

- Detached Composer 当前草稿

### C. `selectionContext`

- 用户显式选中的内容

所以以后给 Chat / Agent 时，必须明确：

- 当前喂的是哪一份输入

不能再混成一坨“当前文本”。

推荐做法：

- Chat / Agent 调用参数里显式带：
  - `targetContext`
  - `kitDraft`
  - `selectionContext`

这样才能避免：

- AI 改写错对象
- Agent 错把草稿当成真实外部目标文本

---

## 12. Host Bridge 需要新增什么

如果要正式支持 Detached Composer，Host Bridge 至少要新增这些消息：

### UI -> Host

- `composer.open`
- `composer.focus`
- `composer.blur`
- `composer.update`
- `composer.minimize`
- `composer.close`
- `composer.apply.insert`
- `composer.apply.replace`

### Host -> UI

- `composer.state.sync`
- `composer.target.status`
- `composer.apply.result`

### 12.1 为什么要单独一套 composer 协议

因为它不是普通存储，不是普通上下文，也不是普通候选插入。

它本质上是：

- 一个独立输入目标
- 一个独立生命周期
- 一个独立写回桥

所以应该有自己的桥接语义。

---

## 13. 用户会踩到的坑，必须提前防

### 13.1 原目标失效

如果用户：

- 切 App
- 原输入框消失
- 焦点跳走

那 Detached Composer 不能继续往旧目标写。

### 13.2 私密输入框

如果当前是：

- 密码框
- OTP
- 私密输入模式

应该限制：

- 读取上下文
- 弹出 Detached Composer
- 把内容发给 Chat / Agent

### 13.3 异步结果晚到

如果 Chat / Agent 结果晚到：

- 不能自动覆盖用户刚在 Detached Composer 里改过的文本

更稳的做法是：

- 作为候选
- 作为 diff 预览
- 作为显式替换建议

### 13.4 横竖屏 / 分屏

Detached Composer 的位置和尺寸必须可恢复。

否则：

- 一旋转就跑位
- 分屏时遮挡严重

### 13.5 不同 App 的输入连接差异

原目标输入框在不同 App 里行为差异很大。

所以 Detached Composer 必须和外部目标解耦。

不能寄希望于：

- 两边一直强同步

---

## 14. MVP 建议

如果现在开始做，我建议 MVP 只做下面这版：

1. Function Kit 面板里只放“输入位占位”
2. 点击后打开 Detached Composer
3. Detached Composer 用原生控件承载输入
4. 键盘继续保持在下方
5. 当前输入目标切换到 `kit_draft`
6. 支持：
   - 最小化
   - 关闭
   - 插入
   - 替换
7. 原目标失效时，写回动作禁用
8. 输入法会话结束时，Detached Composer 自动关闭或退成草稿态

先不要做：

- 全局永久悬浮
- 自动双向同步
- 让 WebView 输入框直接承担主输入职责

---

## 15. 最终判断

关于“功能件输入框会不会变成再打开一个新输入法”，答案是：

- **不会**

前提是设计正确：

- **仍然只有一个输入法实例**
- **只是当前输入目标从 `external_editor` 切到 `kit_draft`**
- **功能件输入框提升为 IME-owned 的 Detached Composer**
- **功能件内部聚焦后，系统输入法继续给这个 composer 输入**
- **真正写回外部输入框必须是显式动作**

这样才能同时满足：

- 输入体验像原生
- 键盘仍然正常工作
- 功能件可独立出来
- 不把系统焦点模型搞乱

这是当前最值得推进的方向。
