# Function Kit 产品调研包（20 个候选功能件）

> 编码：UTF-8  
> 日期：2026-03-31  
> 背景约束（你明确强调过的）：  
> - 不做“发布型长内容（小红书/抖音长文排版）”作为核心功能件，因为真实创作通常在专业编辑器里完成。  
> - 不做过于专业/小众的功能；优先“人人都在输入框里现写”的高频场景：聊天、邮件、表单、搜索框、工作沟通。  
> - 功能件形态偏“浏览器插件”：用户主动触发为主，默认克制、用完即走。  

## 1. 这 20 个候选的共同标准（硬门槛）

- **输入法独有性**：必须吃到至少一个输入法优势：`剪贴板闭环` / `发送前最后一米` / `输入框内原位改写` / `宿主场景识别（弱依赖）`
- **1-1-1**：1 步唤起、1 步执行、1 步返回（不阻塞继续输入）
- **合规与信任优先**：不做灰产、不做脆弱爬虫；默认本地优先；联网/AI 必须可解释、可关闭、可降级

## 2. 评分标尺（用于你明天拍板“先做哪个”）

每个候选按 6 维打分（0~5），总分 30：

1. **输入法独占优势**：离开输入法就显著变差吗？
2. **高频程度**：普通用户能否“每天多次”用到？
3. **零切换爽感**：是否明显替代“复制→切 App→粘贴→再复制回来”的路径？
4. **风险与信任**：隐私/打扰/误伤风险越低分越高
5. **工程复杂度**：越容易交付 MVP 分越高
6. **增长钩子**：用户是否愿意分享/安利？（或能做出强演示）

> 备注：你要的是“尖刀爆款”，因此 **1+2+3** 权重更高；4 是生死线；5 决定迭代速度；6 决定冷启动成本。

## 3. 20 个候选功能件清单（先看名字，再点进去看完整调研）

| ID | 名称（建议） | 方向 | 典型入口 | 主要权限（最小集） | 优先级建议 |
|---:|---|---|---|---|---|
| 01 | 一键净化粘贴（清格式+规范化） | 剪贴板闭环 | 复制后 chip / `/粘贴` | `context.read` `input.replace` | P0 |
| 02 | 链接净化粘贴（去追踪参数） | 剪贴板闭环 | 复制后 chip | `context.read` `input.replace` | P0 |
| 03 | 一键脱敏粘贴（隐私打码） | 剪贴板闭环 | 复制后 chip / 发送前 | `context.read` `input.replace` | P0 |
| 04 | 列表去重/规整（清单秒变干净） | 剪贴板闭环 | 复制后 chip | `context.read` `input.replace` | P1 |
| 05 | 复制长文→一键总结后粘贴 | 剪贴板闭环+AI | 复制后 chip | `ai.request` `input.replace` | P1 |
| 06 | 翻译后粘贴（带语气） | 剪贴板闭环+AI | 复制后 chip | `ai.request` `input.replace` | P1 |
| 07 | 结构化提取粘贴（姓名/电话/时间/地址→规范行） | 剪贴板闭环 | 复制后 chip | `context.read` `input.replace` | P1 |
| 08 | Snippet Vault（常用块搜索插入） | 个人效率 | `/短语` / 工具栏 | `storage.read` `storage.write` `input.insert` | P1 |
| 09 | 文本扩展器（带变量的快捷短语） | 个人效率 | 输入触发 / `/模板` | `storage.*` `input.insert` | P1 |
| 10 | 文本转图片卡片并插入 | 破圈工具 | 工具栏 / `/卡片` | `input.commitImage` `context.read` | P2 |
| 11 | 发送前敏感信息守门员 | 发送前最后一米 | 发送拦截 | `send.intercept.ime_action` | P0 |
| 12 | 情绪降温/冲动发送冷静 | 发送前最后一米 | 发送拦截 | `send.intercept.ime_action` (+`ai.request`) | P1 |
| 13 | 过度承诺/绝对化措辞提醒（生活版） | 发送前最后一米 | 发送拦截 | `send.intercept.ime_action` | P2 |
| 14 | 三档语气改写（礼貌/坚定/简短） | 输入框原位改写 | `/改写` | `ai.request` `input.replace` | P0 |
| 15 | “一句话变清楚”（把碎句整理成可发送短消息） | 输入框原位改写 | 工具栏 / `/清楚` | `ai.request` `input.replace` | P0 |
| 16 | 问题优化器（让问题更好被回答） | 输入框原位改写 | `/提问` | `ai.request` `input.replace` | P2 |
| 17 | 澄清问题生成器（3 个澄清问题+推荐回复） | 输入框原位改写 | `/澄清` | `ai.request` `input.insert` | P2 |
| 18 | 道歉/修复关系助手（极克制版） | 输入框原位改写 | `/道歉` | `ai.request` `input.replace` | P2 |
| 19 | 数字/日期/单位助手（本地优先） | 输入框小工具 | `/日期` `/数字` | `context.read` `input.replace` | P1 |
| 20 | TL;DR/主题句生成（把长段话变一句总结） | 输入框原位改写 | `/一句话` | `ai.request` `input.replace` | P2 |

### 每个候选的完整调研文档

- 01：`TODO/function-kits/product-research/20260331/01_smart_paste_clean_normalize.md`
- 02：`TODO/function-kits/product-research/20260331/02_smart_paste_link_cleaner.md`
- 03：`TODO/function-kits/product-research/20260331/03_smart_paste_privacy_redactor.md`
- 04：`TODO/function-kits/product-research/20260331/04_smart_paste_dedup_formatter.md`
- 05：`TODO/function-kits/product-research/20260331/05_smart_paste_summarize.md`
- 06：`TODO/function-kits/product-research/20260331/06_smart_paste_translate_tone.md`
- 07：`TODO/function-kits/product-research/20260331/07_smart_paste_structured_extract.md`
- 08：`TODO/function-kits/product-research/20260331/08_snippet_vault_search_insert.md`
- 09：`TODO/function-kits/product-research/20260331/09_text_expander_macros.md`
- 10：`TODO/function-kits/product-research/20260331/10_text_to_image_card.md`
- 11：`TODO/function-kits/product-research/20260331/11_send_guard_sensitive_leak.md`
- 12：`TODO/function-kits/product-research/20260331/12_send_guard_emotion_cooldown.md`
- 13：`TODO/function-kits/product-research/20260331/13_send_guard_overpromise.md`
- 14：`TODO/function-kits/product-research/20260331/14_tone_rewrite_three_modes.md`
- 15：`TODO/function-kits/product-research/20260331/15_make_it_clear_rewrite.md`
- 16：`TODO/function-kits/product-research/20260331/16_question_optimizer.md`
- 17：`TODO/function-kits/product-research/20260331/17_clarify_question_generator.md`
- 18：`TODO/function-kits/product-research/20260331/18_apology_repair_assistant.md`
- 19：`TODO/function-kits/product-research/20260331/19_numbers_dates_helper.md`
- 20：`TODO/function-kits/product-research/20260331/20_tldr_subject_generator.md`

## 4. 初版打分与推荐（用于你明天快速拍板）

> 说明：这是我按你强调的约束（不做长内容发布、不过度专业、优先输入框高频、默认克制）做的**初版估算**。  
> 你可以按真实体验把分数改掉：这个表的目的只是让你明天 10 分钟内完成决策。

| ID | 独占 | 高频 | 零切换 | 风险 | 工程 | 增长 | 总分 | 一句话备注 |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 01 | 4 | 5 | 5 | 5 | 4 | 3 | 26 | 纯本地、稳、每天都痛 |
| 02 | 4 | 4 | 5 | 5 | 5 | 3 | 26 | “去追踪链接”口碑强、实现快 |
| 03 | 5 | 4 | 5 | 4 | 4 | 4 | 26 | 脱敏是刚需，适合做“救命”叙事 |
| 04 | 4 | 3 | 5 | 5 | 4 | 2 | 23 | 适合补齐 Smart Paste 系列能力 |
| 05 | 3 | 3 | 4 | 3 | 3 | 3 | 19 | 引入 AI 后价值明显，但要控隐私与成本 |
| 06 | 3 | 3 | 4 | 3 | 3 | 2 | 18 | 体验好但同质化，需要差异化入口/语气 |
| 07 | 4 | 3 | 5 | 5 | 3 | 2 | 22 | “复制一坨信息→变成规范行”爽感强 |
| 08 | 3 | 4 | 4 | 5 | 3 | 2 | 21 | 高频但偏个人效率，冷启动演示弱 |
| 09 | 3 | 4 | 4 | 4 | 3 | 2 | 20 | 经典刚需，但要小心做复杂变成“专业工具” |
| 10 | 3 | 2 | 3 | 4 | 2 | 4 | 18 | 适合做破圈 demo，但不一定是日常高频 |
| 11 | 5 | 4 | 5 | 4 | 3 | 4 | 25 | 输入法独占：发送前最后一米（强口碑） |
| 12 | 5 | 2 | 5 | 4 | 3 | 3 | 22 | 价值大但频次低，适合作为 11 的扩展 |
| 13 | 5 | 2 | 5 | 4 | 4 | 2 | 22 | 规则型可本地化，但需要避免“说教感” |
| 14 | 4 | 4 | 4 | 3 | 4 | 3 | 22 | AI 改写最泛用，但要克制别变聊天机器人 |
| 15 | 4 | 4 | 4 | 3 | 4 | 3 | 22 | 适合“碎句→可发送短消息”的强对比 demo |
| 16 | 3 | 2 | 4 | 3 | 4 | 2 | 18 | 更像“效率小助手”，不一定是爆款尖刀 |
| 17 | 3 | 2 | 4 | 3 | 3 | 2 | 17 | 适合做配套能力，不建议先做 |
| 18 | 3 | 2 | 4 | 3 | 3 | 2 | 17 | 同上（场景不高频） |
| 19 | 4 | 3 | 4 | 5 | 4 | 2 | 22 | 本地优先、低风险，适合补齐工具箱 |
| 20 | 3 | 3 | 4 | 3 | 4 | 2 | 19 | 可用但同质化，建议做“极克制版本” |

**我建议你明天优先看这 6 个候选**（从“爆款尖刀”角度）：`01/02/03/11/14/15`。

## 5. 我建议你明天醒来先做的决策（只需要 10 分钟）

1. 你要的“第一爆款”属于哪条主线？  
   - **剪贴板闭环**（更稳、更像插件、更容易形成肌肉记忆）  
   - **发送前最后一米**（更独占、更容易形成“救我一命”的口碑）  
   - **输入框原位改写**（更泛用，但要克制避免“又一个 ChatGPT”）  
2. 你愿意第一阶段引入 AI 吗？  
   - 允许：选 14/15/05/06  
   - 先不允许：选 01/02/03/11  

## 6. 额外调研（Skills 与方法论）

- Claude Skills（产品设计/增长/用户研究）调研：`TODO/function-kits/product-research/20260331/00_product_design_skills_survey.md`
