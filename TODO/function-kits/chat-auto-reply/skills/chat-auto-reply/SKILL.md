---
name: chat-auto-reply
description: Generate safe, persona-aware candidate replies for the active chat compose box.
metadata: {"openclaw":{"requires":{"os":["windows","android"]},"produces":"reply-generator.output","tool":"reply-generator"}}
---

# Chat Auto Reply

## Purpose

Use this skill when the user is composing or replying to a chat message and wants candidate replies instead of a single final answer.

## Use When

- 当前上下文是聊天或回复消息
- 用户想要多条可选回复
- 需要结合联系人画像、全局 persona、最近上下文

## Do Not Use When

- 用户只是在做普通搜索
- 当前内容不是会话式消息
- 用户要求直接自动发送

## Required Output Shape

Always produce structured data that conforms to `tools/reply-generator/output.schema.json`.

## Decision Rules

1. 优先生成 3 到 5 条候选回复。
2. 每条候选都给出简短 rationale。
3. 标出风险：`low` / `medium` / `high`。
4. 如果上下文不足，明确说明缺什么，不要假装知道。
5. 不直接调用外部 channel；输入法本身就是入口。

## Style Rules

- 回复要自然、可直接插入输入框。
- 允许语气差异化，但不要编造事实。
- 不要替用户做不可逆承诺。
