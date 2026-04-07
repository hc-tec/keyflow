# Quick Phrases Function Kit

> 编码：UTF-8
> 创建时间：2026-03-23T20:50:00+08:00
> 目标：提供一个纯本地、无 AI 依赖的第二样板 Function Kit，让 Android 多功能件入口真正可见。

## 1. 这是什么

`quick-phrases` 是一个极简本地功能件：

- 读取当前输入上下文
- 展示 3 个可编辑的常用短语槽位
- 支持一键插入或替换到目标输入框
- 使用功能件本地存储保存短语，不依赖远程服务或 Agent

它的价值不是“功能复杂”，而是给多 Function Kit 工具栏提供第二个真实样板。

## 2. 为什么现在先做它

- 结构上已经支持多个 Function Kit，但 catalog 之前只有一个 `chat-auto-reply`
- 仅靠一个功能件，工具栏多槽位在真机上无法真正体现出来
- 这个样板能验证本地存储、上下文读取、显式写回输入框三条基础链路
- 它也顺便证明：不是所有功能件都要依赖 AI、Agent、skills 或 connector

## 3. 目录

- 清单：`TODO/function-kits/quick-phrases/manifest.json`
- UI 说明：`TODO/function-kits/quick-phrases/ui/README.md`
- 浏览器式面板入口：`TODO/function-kits/quick-phrases/ui/app/index.html`
- 浏览器式面板脚本：`TODO/function-kits/quick-phrases/ui/app/main.js`
- 浏览器式面板样式：`TODO/function-kits/quick-phrases/ui/app/styles.css`
- 测试说明：`TODO/function-kits/quick-phrases/tests/README.md`

## 4. 运行时能力

- `context.read`
- `input.insert`
- `input.replace`
- `settings.open`
- `storage.read`
- `storage.write`

它刻意不申请：

- `network.fetch`
- `ai.chat`
- `ai.agent.list`
- `ai.agent.run`
- `composer.*`

## 5. 当前边界

- 现在没有接远程短语库同步
- 现在没有做多级分组或云端模板
- 现在只验证“第二个真实 kit 能显示、能打开、能写回”
