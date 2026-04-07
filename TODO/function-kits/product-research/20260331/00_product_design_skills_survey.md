# Claude Code Skills 调研：产品设计 / 增长 / 用户研究（SKILL.md）

> 编码：UTF-8  
> 日期：2026-03-31（Asia/Shanghai）  
> 目标：找到可复用的“产品设计/增长/用户研究”相关 Claude Skills（SKILL.md），辅助你把“做什么功能件”这件事做对、做快、做可重复。  
>
> 注意：这些 skills 主要是“提示词与工作流模板”，用于**方法论固化**；安装/执行脚本前必须逐个审计（安全与外联）。  

## 0. 约束与方法（按 `search-skill` 的规则）

仅从以下来源检索（不扩网）：

- `github.com/anthropics/skills`
- `github.com/ComposioHQ/awesome-claude-skills`
- `github.com/travisvn/awesome-claude-skills`
- `skills.sh`
- `skillsmp.com`

筛选硬门槛（建议）：

- 有 `SKILL.md`
- GitHub Stars ≥ 10（社区验证）
- 最近更新 ≤ 6 个月（避免过期）
- 无可疑代码/不必要的敏感权限

## 1. 找到的高相关 Skills（8 个）

> Stars 与更新时间已在 2026-03-31 通过 GitHub API 复核（用于排序与筛选）；安装/执行脚本前仍建议你再点一次链接复核与审计。

| Skill（name） | 用途（简述） | 一句话适用场景 | 来源 | Stars（repo） | 最后更新（约） | 链接（SKILL.md） |
|---|---|---|---|---:|---|---|
| `lead-research-assistant` | 种子用户/合作对象研究与触达 | “帮我找到 20 个最可能用的人/社区，并给触达策略” | Composio curated | 49450 | 2025-10-17 | `https://github.com/ComposioHQ/awesome-claude-skills/blob/master/lead-research-assistant/SKILL.md` |
| `competitive-ads-extractor` | 竞品广告与 messaging 拆解 | “拆竞品怎么卖痛点/怎么命名/怎么做对比” | Composio curated | 49450 | 2025-10-17 | `https://github.com/ComposioHQ/awesome-claude-skills/blob/master/competitive-ads-extractor/SKILL.md` |
| `internal-comms` | 周报/月报/FAQ/里程碑模板 | “把本周进展写成对外/对内都能用的更新稿” | Composio curated | 49450 | 2025-10-22 | `https://github.com/ComposioHQ/awesome-claude-skills/blob/master/internal-comms/SKILL.md` |
| `brand-guidelines` | 品牌规范（视觉与表达一致性） | “做落地页/截图/文案时统一风格” | Composio curated | 49450 | 2025-10-22 | `https://github.com/ComposioHQ/awesome-claude-skills/blob/master/brand-guidelines/SKILL.md` |
| `domain-name-brainstormer` | 命名 + 域名候选检查 | “起名并给域名候选，减少人工查找” | Composio curated | 49450 | 2025-10-17 | `https://github.com/ComposioHQ/awesome-claude-skills/blob/master/domain-name-brainstormer/SKILL.md` |
| `deep-research` | 市场/竞品/趋势深研（脚本化） | “快速生成带引用的研究报告（注意成本）” | Composio curated（外链） | 183 | 2026-02-19 | `https://github.com/sanjay3290/ai-skills/blob/main/skills/deep-research/SKILL.md` |
| `csv-data-summarizer` | CSV 自动分析（问卷/反馈表） | “把用户反馈 CSV 自动出结论与图” | Composio curated（外链） | 318 | 2025-10-16 | `https://github.com/coffeefuelbump/csv-data-summarizer-claude-skill/blob/main/SKILL.md` |
| `ship-learn-next` | 把调研变成可执行迭代循环 | “读完材料后直接给下一步怎么做+怎么复盘” | Composio curated（外链） | 305 | 2025-10-24 | `https://github.com/michalparkola/tapestry-skills/blob/main/ship-learn-next/SKILL.md` |

对应 commit history（用于你复核更新时间）：

- `https://github.com/ComposioHQ/awesome-claude-skills/commits/master/lead-research-assistant`
- `https://github.com/ComposioHQ/awesome-claude-skills/commits/master/competitive-ads-extractor`
- `https://github.com/ComposioHQ/awesome-claude-skills/commits/master/internal-comms`
- `https://github.com/ComposioHQ/awesome-claude-skills/commits/master/brand-guidelines`
- `https://github.com/ComposioHQ/awesome-claude-skills/commits/master/domain-name-brainstormer`
- `https://github.com/sanjay3290/ai-skills/commits/main/skills/deep-research`
- `https://github.com/coffeefuelbump/csv-data-summarizer-claude-skill/commits/main/`
- `https://github.com/michalparkola/tapestry-skills/commits/main/ship-learn-next`

## 2. 安全 / 质量过滤说明（为什么选它们）

硬过滤（不满足就淘汰）：

- Stars < 10：淘汰（缺少社区验证）
- 最近更新 > 6 个月：淘汰（可能过期）
- 无 `SKILL.md`：淘汰（非标准 skill）
- 文档过于稀薄：淘汰（不可复用/不可审计）

安全注意（能用，但执行前必须审计）：

- `deep-research`：需要 `GEMINI_API_KEY`，会执行脚本并联网；SKILL.md 自带成本提示，属于“高产出/高外部依赖”。
- `csv-data-summarizer`：会执行本地 Python 读取 CSV；适合你做用户调研数据分析，但要确认脚本不做不必要外联/上传。
- `competitive-ads-extractor`：可能涉及抓取/截图竞品广告库；建议先把它当“拆解模板与输出格式”，不要盲目自动化抓取以免触 ToS。

## 3. 如何用到 Function Kit（最重要：把它们变成你的流水线）

你的目标是：**20 个候选功能件 → 选 3 个尖刀 → 做出第一个可复用闭环**。这些 skills 的作用是把“调研→决策→输出→迭代”模板化。

### 3.1 推荐阅读顺序（从“做决定”到“做传播”）

1. `ship-learn-next`：把你已有材料（doubao-thread + 现有运行时能力 + 你对“非专业/合规”的约束）直接变成“下一步迭代清单 + 复盘循环”
2. `deep-research`：补齐竞品/趋势/风险对照（尤其在你要做 20 个候选时）
3. `lead-research-assistant`：找最可能成为种子用户的社区与场景（比“功能更酷”更重要）
4. `csv-data-summarizer`：你后续做问卷/反馈表时，用它快速得到“Top 场景/Top 流失原因/Top 改进”
5. `internal-comms`：把你的每周进展写成对外可发布的更新，形成持续节奏（非常关键）

### 3.2 把 skills 直接映射到我们的文档产物

- 选题与优先级：输出到 `TODO/function-kits/product-research/20260331/*.md`（每个 kit 1 份）
- 决策与里程碑：回填到 `TODO/TODO.md`
- 对外叙事与周更：用 `internal-comms` 输出，挂到你未来的发布渠道（后续再定）

## 4. 下一步建议（你醒来只做 2 个决定）

1. 你要先打穿哪条主线：**剪贴板闭环** / **发送前最后一米** / **输入框原位改写**？
2. 你第一阶段是否允许 AI：允许就选 14/15/05/06，不允许就选 01/02/03/11。
