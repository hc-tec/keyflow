# wx-reply UI

当前版本按「选联系人 → 看最近一句 → 一键写回候选回复」重构。

技术栈：

- `petite-vue`：`TODO/function-kits/shared/vendor/petite-vue/petite-vue.iife.js`
- `shadcn-css tokens`：`TODO/function-kits/shared/ui/kit-shadcn.css`
- IME 面板基线样式：`TODO/function-kits/shared/ui/ime-panel.css`

主要界面：

- 选人页：最近使用、最近会话、联系人搜索
- 服务配置页：Base URL 保存 + 探活结果提示
- 回复页：两条候选、底部高级配置、换一批

真实数据来源：

- `GET /api/v1/state`
- `GET /api/v1/recent_contacts`
- `GET /api/v1/sessions`
- `GET /api/v1/contacts`
- `GET /api/v1/chats/{username}/history`
- `GET /api/v1/people/{username}/profile`

入口：

- `ui/app/index.html`
