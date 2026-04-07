# Function Kit Slash Trigger 与发现层设计（决策版）

> 编码：UTF-8
> 创建时间：2026-03-22
> 更新时间：2026-03-22T21:10:00+08:00
> 版本：v3
> 范围：Windows + Android 输入法宿主、Function Kit 发现层、slash 触发、结果排序、权限与回退

## 0. 这份文档现在要拍板什么

这份文档不是再讨论“`/` 看起来酷不酷”，而是要把下面几件事定死：

1. slash trigger 到底是不是产品主线入口，还是只是实验功能。
2. 当前 SDK 已有的 deterministic discovery 骨架，应该如何变成真正可用的宿主能力。
3. 固定功能件、最近使用、slash 搜索结果三者如何共存，而不是互相打架。
4. 功能件作者能声明什么，不能声明什么，冲突时谁赢。
5. 搜索阶段、预览阶段、执行阶段的权限与风险边界是什么。

先给结论：

- **要做 `/query`，但它是 Function Kit command palette，不是“正则输入法”。**
- **第一版必须建立在当前 deterministic discovery 实现之上，不引入 AI 语义搜索。**
- **slash 搜索阶段只做本地解析、匹配、排序，不联网、不调 AI、不读敏感上下文。**
- **真正跨平台共享的是 parser、matcher、ranking、manifest 语义；不是整个 UI 细节。**

---

## 1. 当前仓库现状

先把现实摆清楚，避免方案写成空想。

### 1.1 已经存在的 discovery 骨架

`TODO/function-kit-runtime-sdk/src/discovery.mjs` 和 `TODO/function-kit-runtime-sdk/src/index.js` 已经暴露了这一组共享函数：

- `parseSlashTrigger(...)`
- `normalizeDiscoveryManifest(...)`
- `buildDiscoveryIndex(...)`
- `matchDiscoveryEntries(...)`
- `rankDiscoveryMatches(...)`
- `resolveDiscoveryQuery(...)`

`TODO/function-kit-runtime-sdk/README.md` 也已经把这一层明确叫做 shared discovery / trigger skeleton。

### 1.2 当前 manifest 已有的字段

`TODO/function-kits/chat-auto-reply/manifest.json` 已经落了这批 discovery 元数据：

- `discovery.launchMode`
- `discovery.pinnable`
- `discovery.recentEnabled`
- `discovery.slash.commands`
- `discovery.slash.aliases`
- `discovery.slash.tags`
- `discovery.slash.matchers`
- `discovery.ranking`

这意味着 slash trigger 不再是一个“以后再设计的概念”，而是已经有 manifest contract 的功能。

### 1.3 当前 parser 的真实行为

`parseSlashTrigger(...)` 当前不是任意文本解析器，而是一个非常明确的 token parser：

- 只看 caret 附近 token
- token 起点必须在 separator 后
- `/` 后只允许 `[a-z0-9_-]`
- `//` 直接拒绝
- query 中只要再出现 `/` 就拒绝
- 空 query 的 `/` 会进入 `slash-detecting`
- 非空 query 的 `/reply` 会进入 `slash-searching`

当前 separator 集合来自：

```js
/[\s()[\]{}"'`.,!?;:<>|\\]/
```

当前 command char 集合来自：

```js
/^[a-z0-9_-]$/i
```

所以现在的真实能力已经天然规避了这些典型误触：

- `https://example.com`
- `C:/Users/...`
- `/sdcard/Download`
- `//comment`

### 1.4 当前 matcher 的真实顺序

`matchDiscoveryEntries(...)` 当前已经固定了这条 deterministic 顺序：

1. command exact
2. alias exact
3. command prefix
4. alias prefix
5. tag exact
6. tag prefix
7. name substring
8. description substring
9. regex matcher

空 query 时，当前行为不是“无结果”，而是 `browse` match。

### 1.5 当前 ranking 的真实因子

SDK 当前已经不是零散排序，而是明确的得分模型：

```text
score =
  match.score
  + baseWeight * 10
  + recentBoost
  + pinnedBoost
  + contextBoost
  - blockedPenalty
```

其中已经存在这些真实因子：

- `baseWeight`
- `recentBoost`
- `pinnedBoost`
- `contextBoost`
- `blockedPenalty`

并且 `blockedPermissions` / `available` 也已经在结果对象里生成了。

### 1.6 当前还缺什么

真正缺的不是 parser，而是宿主层决策：

1. 命令命名规则和冲突治理
2. fixed / recent / search 的布局合并规则
3. 搜索阶段与执行阶段的权限边界
4. slash mode 的平台交互规范
5. pinned / recent / availability cache 的宿主持久化
6. 观测指标与 rollout 标准

本文件就是把这六件事补齐。

### 1.7 当前原生 host 还没有完全吃满 shared SDK

这里必须把“共享能力已存在”和“原生 host 已全部落地”分开说。

当前真实状态是：

- shared SDK 的 slash 模型最完整，已经支持 caret-aware parser、regex matcher、`minQueryLength`、ranking skeleton
- Windows 原生 host 目前还是简化版 slash 解析，尚未完整复用 shared SDK 的 pinned / recent / `minQueryLength` / ranking 语义
- Android 当前更保守，主线更接近 `launchMode + commands + aliases + tags` 的 prefix 匹配，还没有完整吃进 shared SDK 的 regex matcher 和 ranking 细节

因此这份文档的定位必须写清：

- **shared SDK 是 contract 与目标行为的 source of truth**
- **Windows / Android 原生 host 当前只是部分实现，不应被误写成“已完整支持”**

---

## 2. 产品目标与非目标

### 2.1 产品目标

slash trigger 的职责只有三件：

1. 发现功能件
2. 缩短功能件触发路径
3. 让“任务导向”入口进入输入法主链路

它不是另一个独立搜索框，而是输入法里的命令面板。

### 2.2 非目标

第一版明确不做：

- 自然语言万能入口，例如“/帮我回这个客户”
- 每次按键都跑 AI 的语义召回
- 自动执行高风险动作
- 参数复杂的命令 DSL
- 中文命令词自由输入
- 让普通 `/` 输入变得不可预测

### 2.3 为什么必须坚持 deterministic first

输入法的核心要求不是“聪明”，而是“稳定、快、可撤销”。
所以第一版必须满足：

- 结果可解释
- 排序稳定
- 误触可控
- 跨平台一致

AI 语义召回只有在 deterministic 路径成熟之后，才有资格作为第二层增强。

---

## 3. 命令语言与治理

### 3.1 用户语言和作者语言必须拆开

用户看到的是：

- `/reply`
- `/translate`
- `/wx-reply`

功能件作者可以配置的是：

- `commands`
- `aliases`
- `tags`
- `regex matchers`

这里必须定死：

- **用户心智是“命令词 + 搜索”，不是“我在写正则”。**
- **regex 只作为作者侧 fallback matcher，不作为用户侧主语言。**

### 3.2 v1 语法

v1 语法必须与当前 SDK parser 保持一致：

```text
slash-query = "/" [token]
token       = 1*32(command-char)
command-char = ALPHA / DIGIT / "_" / "-"
```

补充决策：

- v1 最大 token 长度按 `32` 处理
- v1 不支持空格参数
- v1 不支持 `:`、`=`、`.` 参数语法
- v1 不支持中文命令词

这不是因为这些能力永远不做，而是因为现在的跨平台 parser 和误触成本都不允许一下子开太多口子。

### 3.3 命名政策

为了保证 discoverability 和可记忆性，作者侧要遵守下面的治理规则。

#### `commands`

用于主命令词，规则如下：

- 全局唯一
- 推荐长度 `2~24`
- 推荐使用 kebab-case
- 推荐直接表达动作，不表达实现

好例子：

- `reply`
- `translate`
- `schedule`
- `contact-card`

坏例子：

- `do-reply-now`
- `kit1`
- `wechat_plugin_reply`
- `ai`

#### `aliases`

用于兼容旧习惯或短名称，规则如下：

- 可以更短，但仍然只能使用 `[a-z0-9_-]`
- 不保证全局唯一
- 允许作为搜索入口，但不应该比主命令更重要

#### `tags`

用于分类和长尾召回，规则如下：

- 允许重名
- 不作为主触发词治理
- 只用于补充搜索，不承担肌肉记忆

#### `regex matchers`

规则如下：

- 只能补充匹配，不得替代 command
- 不能用于高风险自动执行
- 必须能被 manifest reviewer 读懂
- 权重不得超过 explicit command exact/prefix

### 3.4 冲突治理

这一段如果不定死，功能件一多就会烂掉。

#### command 冲突

如果两个 kit 的 `commands[]` 完全一样：

- 后安装或后启用的 kit 不得注册该 slash command
- 宿主记录冲突日志
- kit 本身仍可通过图标、更多、面板入口打开

也就是说，**command conflict 阻断的是 slash 注册，不是整个 kit 安装。**

#### alias 冲突

如果 alias 冲突：

- 不阻断 kit 安装
- 冲突 alias 从 discovery index 中丢弃
- kit 仍保留 command、tag、name 等其他匹配路径

#### tag 冲突

tag 天然允许重合，不视为冲突。

### 3.5 保留命名空间

宿主保留以下前缀，不允许普通 kit 占用：

- `ime-`
- `sys-`
- `debug-`

这样后续系统级命令才不会和第三方 kit 混在一起。

---

## 4. 触发、取消与原文提交

### 4.1 进入 slash mode 的条件

只有同时满足下面条件时才进入：

1. `/` 位于新 token 起点
2. 当前没有更高优先级的中文 preedit 组合需要继续
3. `/` 后 token 仍然满足 command-char 规则
4. 它不是 URL、路径、双斜杠或 path-like token

### 4.2 绝不进入 slash mode 的情况

下面这些情况必须按普通文本处理：

- `https://`
- `http://`
- `/sdcard/...`
- `C:/...`
- `1/2`
- `abc/reply`
- 中文 preedit 正在高优先级组合且 `/` 只是普通字符

### 4.3 取消规则

slash mode 必须可撤销，取消条件如下：

- `Esc`
- Android 返回或显式关闭按钮
- `Backspace` 删空整个 slash token
- 输入非法 command-char
- 输入框失焦且宿主决定退出组合态

### 4.4 原文提交规则

用户必须永远可以把 `/query` 当普通文本发出去。
最少提供三种路径：

1. 搜索无结果时按 `Enter` 原文提交
2. 有结果但用户显式选择“按原文发送”
3. 取消搜索后恢复普通输入，再提交原文

### 4.5 slash token 的边界

slash token 必须是 IME 内部组合态，不应在搜索阶段提前上屏。
原因很简单：

- 避免目标应用看到半成品 `/re`
- 避免 Android `InputConnection` 和 Windows TSF 被频繁污染
- 避免用户取消时还要反向擦除目标文本

---

## 5. 匹配、排序与分段布局

### 5.1 匹配顺序的正式定义

产品侧必须直接承认 SDK 当前顺序，而不是再造一套“理想顺序”：

1. command exact
2. alias exact
3. command prefix
4. alias prefix
5. tag exact
6. tag prefix
7. name substring
8. description substring
9. regex

这条顺序在 Phase 1 不修改。
任何变化都必须先改 shared SDK，再改平台宿主。

### 5.2 排序的正式定义

Phase 1 直接使用当前 SDK score 模型，不在产品层额外偷偷加维度：

```text
finalScore =
  match.score
  + baseWeight * 10
  + recentBoost * decay
  + pinnedBoost * 10
  + contextBoost * 10
  - blockedPenalty * 10 * blockedPermissionCount
```

当前匹配分值的真实顺序是：

- command exact = 100
- alias exact = 96
- command prefix = 82
- alias prefix = 78
- tag exact = 64
- tag prefix = 58
- regex = 52 + `matcher.weight * 10`
- name substring = 42
- description substring = 24
- browse = 0

### 5.3 同分时的稳定规则

当前 SDK tie-break 顺序应被正式采用：

1. `score`
2. `match.score`
3. manifest 进入 index 的 `order`
4. `kitId` 字典序

必须保证同一 query 在同一环境下排序稳定，不允许列表抖动。

### 5.4 上下文信号的正式边界

`contextBoost` 不能是一个模糊黑箱，允许使用的信号必须很克制。

Phase 1 允许参与 `contextBoost` 的只有：

- 当前输入 surface 类型，例如 chat / editor / form
- 当前是否存在选中文本
- 当前 app 的粗粒度类别，例如 chat-app / code-editor / browser
- 当前 locale
- 用户最近 7 天内对 kit 的显式使用记录

Phase 1 明确不允许直接进入 `contextBoost` 的内容：

- 联系人画像
- 长会话历史
- 语义 embedding 召回结果
- 任意联网或 AI 推断结果
- 未授权的跨 App 私密数据

冷启动时规则也必须简单：

- 没有上下文就不给 `contextBoost`
- 绝不为了补 `contextBoost` 去联网或调 AI

### 5.5 常态布局

非 slash mode 时：

- 固定功能件
- 最近使用
- 更多

建议配额：

- Android：固定 4，最近 2
- Windows：固定 6，最近 3

### 5.6 slash mode 布局

slash mode 不是把整个功能件栏换掉，而是按下面的规则合并：

#### `/` 空 query，处于 `slash-detecting`

展示：

1. 固定功能件
2. browse 结果
3. 当前 query 状态

此时的 browse 结果不是“全部 kit”，而是：

- 由 `resolveDiscoveryQuery(..., "/")` 得到的空 query 匹配
- 结合 pinned / recent / context / availability 排序
- 去除已出现在固定栏里的重复 kit

#### `/rep` 非空 query，处于 `slash-searching`

展示：

1. 固定功能件
2. 搜索结果
3. 当前 query 状态

这里“最近使用”不再作为独立 section 展示，而是：

- 继续影响搜索结果排序
- 在结果项上显示 recent badge

这是更实用的方案，因为 slash mode 的用户心智是“我在搜”，不是“我在看三段独立菜单”。

### 5.7 去重规则

同一个 kit 只能在当前视图里出现一次：

- 已在固定栏出现的 kit，不再在搜索结果区重复出现
- 同一个 kit 通过 command、alias、tag 多路命中时，只保留最高分那条

### 5.8 无结果状态

无结果时必须显示：

- 原文提交 `/query`
- 返回更多或固定功能件
- 可选的“查看全部功能件”

不允许只显示一片空白。

---

## 6. `launchMode`、预览与执行安全

### 6.1 三种 `launchMode` 的正式语义

当前 SDK 已支持三种类型，这里要把行为定死：

#### `quick-action`

适合：

- 自动回复
- 改写
- 翻译

行为：

- 进入轻量 preview 或直接生成候选
- 结果必须回到候选区或轻量卡片
- 不得在搜索命中瞬间自动写回目标输入框

#### `panel-first`

适合：

- Codex / workspace 任务
- 联系人画像
- 知识看板

行为：

- 命中后先打开完整面板
- 面板内再做参数补全、工具调用或执行确认

#### `hybrid`

适合：

- 先看摘要或 preview，再决定是否展开完整 UI 的 kit

行为：

- 先出轻量 preview
- 用户再显式跳入 panel

### 6.2 搜索阶段零越权

slash 搜索阶段允许做的只有：

- token 解析
- manifest 匹配
- pinned / recent / availability cache 读取
- 排序与结果渲染

不允许：

- 联网
- 调模型
- 调 skills
- 读取联系人画像
- 读取长会话历史

### 6.3 执行阶段再做权限门控

只有从搜索结果进入 preview / panel / running 之后，才允许检查或申请：

- `context.read`
- `input.insert`
- `input.replace`
- `network.request`
- `skills.invoke`
- `storage.read/write`

### 6.4 不可执行但可展示

如果 kit 被匹配到了，但当前不可执行：

- 允许展示
- 必须标明不可用原因
- 允许进入说明页或设置页
- 不允许假装成功

例如：

- 缺权限
- 当前平台不支持
- 当前网络不可用
- 依赖宿主服务未连接

### 6.5 焦点所有权与文本交接

这一段必须写清，不然自动化、手测、原生 host 接入都会反复出问题。

#### slash 搜索阶段

- IME 仍然拥有文本输入焦点
- slash token 保留在 IME 组合态
- 方向键、Tab、上下滑仅用于结果列表导航
- 目标应用输入框此时不应收到半成品 `/re`

#### 进入 preview 阶段

- 结果列表仍由 IME 宿主控制
- kit preview 只接收选择事件和必要上下文
- 如果用户取消，slash query 应可恢复或原样提交

#### 进入 panel 阶段

- 只有 panel-first 或用户显式展开时，焦点才允许进入 kit 自己的表单控件
- kit 面板内部输入框只影响 kit 内部状态，不直接写目标应用输入框
- 用户点击“插入”或“替换”前，不发生对目标文本的真实提交

#### 文本写回语义

- `insert`：在当前光标处插入候选
- `replace`：替换宿主记录的明确范围，不允许猜测性替换
- `commit raw`：原样提交 `/query`
- `cancel`：不修改目标应用文本

### 6.6 参数采集与 preview contract

不是所有 kit 都是“一点就出结果”，所以必须给多一步交互留标准位。

如果 kit 需要参数、实体选择或二次确认，标准流程应为：

1. slash 结果命中 kit
2. 进入 preview 或 panel
3. kit 在受控 UI 中收集参数
4. 宿主再触发真实执行
5. 结果回到候选、动作卡片或确认卡片

标准要求：

- 参数输入发生在 kit 受控 UI 内，不发生在目标应用输入框
- 必须支持 `confirm / retry / cancel`
- `cancel` 后不得遗留半成品写回
- 如果需要实体消歧，必须先完成消歧，再做执行

---

## 7. 平台落地规范

### 7.1 Android

Android 端要重点防止输入链路被破坏：

- slash 结果不应覆盖主候选栏到无法退出
- 功能件栏保持“固定骨架 + 动态结果”
- slash token 仍然停留在 IME 本地组合态
- 如果 kit 自己有搜索框或表单输入，必须走 kit 内部本地输入缓冲，不直接抢目标输入框

### 7.2 Windows

Windows 端空间更大，可以做三段式：

1. 固定图标条
2. 搜索结果区
3. 预览或面板区

但行为原则不能和 Android 分叉：

- 相同 parser
- 相同 ranking
- 相同 launchMode 语义
- 相同原文提交规则

### 7.3 共享层与宿主层边界

以下能力必须放在 shared layer：

- slash token parser
- discovery manifest normalization
- match / rank / resolve
- launchMode 语义

以下能力必须放在 host layer：

- pinned / recent 持久化
- availability cache
- 平台输入事件接入
- UI 具体布局
- 失焦与返回键策略

### 7.4 Discovery Index 生命周期

discovery index 不是一次性构建后就永远不变，宿主必须定义更新规则。

必须触发 index rebuild 或 invalidate 的事件：

- kit 安装
- kit 卸载
- kit 启用 / 禁用
- manifest 版本变化
- locale 变化
- 用户 pinned 配置变化

必须触发 availability cache 刷新的事件：

- 权限变化
- 网络状态变化
- 宿主服务连接状态变化
- kit 依赖的 adapter 状态变化

建议策略：

- manifest index 常驻内存，事件驱动刷新
- availability cache 走短 TTL，默认 `30s`
- recent / pinned 走用户态持久化
- 发现 stale kit id 时在下一次刷新中自动清理

---

## 8. MVP、阶段路线与代码落点

### 8.1 Phase 0：当前已经存在

仓库里已经有这些基础能力：

- `TODO/function-kit-runtime-sdk/src/discovery.mjs`
- `TODO/function-kit-runtime-sdk/tests/discovery.test.mjs`
- `TODO/function-kits/chat-auto-reply/manifest.json`
- Windows 示例里的 manifest 读取逻辑
- Android 示例和主线里的 manifest 接法

这意味着 Phase 0 不是“从零开始”，而是“已经有 parser 和 contract，但还没完成宿主整合”。

### 8.2 Phase 1：必须补齐的 MVP

必须做：

1. 宿主层 pinned / recent 持久化
2. slash mode 的 section merge 逻辑
3. fixed / browse / search 结果去重
4. 不可用结果的降级展示
5. Android / Windows 的统一 E2E 路径
6. 埋点

这一阶段不做 AI，不做语义召回。

### 8.3 Phase 2：交互成熟

补：

- `quick-action` / `panel-first` / `hybrid` 的完整视觉标识
- 结果预选
- 设置页里的 slash 开关、固定管理、最近清理
- 更清晰的 unavailable reason

### 8.4 Phase 3：更复杂语法

只有在 Phase 1/2 稳定后，才考虑：

- `/reply:boss`
- `/schedule-30m`
- 多 locale 命令词
- 自适应排序

### 8.5 Phase 4：语义增强实验

如果未来要做语义层，必须遵守：

- deterministic results 仍是主路径
- AI 结果只能作为异步补充层
- 不能改变原文提交和可撤销性

---

## 9. 验收指标

### 9.1 性能指标

- parser + match + rank：P95 < 8ms
- slash UI 刷新：P95 < 16ms
- slash 结果出现总时延：P95 < 50ms

### 9.2 质量指标

必须持续观察：

- `slash_entered`
- `slash_cancelled`
- `slash_submitted_raw`
- `slash_result_selected`
- `slash_no_match`
- `slash_permission_blocked`
- `slash_panel_opened`

重点指标：

- 触发率
- 取消率
- 原文提交率
- 无匹配率
- 首位命中率
- 误触率

### 9.3 风险判断信号

这些指标一旦过高，就说明方案有问题：

- 原文提交率持续偏高
- 取消率持续偏高
- 无匹配率偏高
- 不可用结果点击率偏高

这些都意味着：

- 命令词治理差
- 排序不可信
- 或 slash 误触太多

### 9.4 rollout gate 与 kill switch

正式上线前建议分三步：

1. `shadow mode`
   - 只记录 slash parser / matcher 结果，不实际接管 UI
2. `soft launch`
   - 只对小流量或开发开关开放
3. `default on`
   - 只有在误触率、取消率、原文提交率都达标后才默认开启

宿主必须保留 kill switch：

- 全局关闭 slash discovery
- 仅关闭 regex matcher
- 仅关闭 browse mode

这样出现误触或性能回退时，才能快速止血而不是整包回滚。

---

## 10. 最终决策

这件事可以做，而且值得做，但只能按下面的方式推进：

1. **`/query` 是功能件命令面板，不是“正则产品”。**
2. **第一版完全建立在当前 SDK 的 deterministic discovery 之上。**
3. **搜索阶段零越权，执行阶段再做权限门控。**
4. **固定栏在 slash mode 中仍保留，最近使用转化为排序信号和 badge，而不是独立第三栏。**
5. **command 必须全局唯一，alias 冲突只丢 alias，不丢 kit。**
6. **共享层只负责 parser/matcher/ranking，平台宿主负责持久化、布局和输入事件。**
7. **语义搜索只能晚于 deterministic 路径，不能反过来主导第一版。**

一句话总结：
**Function Kit slash trigger 的正确定位，是“高频、低风险、任务导向的发现层”，而不是另一个会打断输入的花哨入口。**
