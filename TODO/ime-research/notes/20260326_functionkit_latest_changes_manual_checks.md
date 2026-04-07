# Function Kit Latest Changes Manual Checks (2026-03-26)

> 编码：UTF-8
> 目标：只验收“最近改动”，避免重复测旧功能件。

## 关注点（最近改动）

1. `ai.request` / `ai.response`：Android host-shared AI 路由可用，且支持 `response.type = "json"` 结构化输出。
2. Tasks tracking：`task.update` / `tasks.sync` / `task.cancel` 协议在 Android 宿主侧可用，能追踪 `ai.request`、`network.fetch` 等异步路径。
3. WebView/WindowPool：同 `kitId` 在不同入口打开时复用同一实例，避免“切换/失焦就清空状态”。
4. 输入写回：`input.insert` / `input.replace` 写回外部输入框语义正确。

## 验收功能件

- Runtime Lab：`TODO/function-kits/runtime-lab/README.md`

> 注：Bridge Debugger 不再作为 Android 内置功能件分发。

## 手动验收步骤（建议顺序）

### 1) 基础连通

- 在可输入的 App 中（或 Playground Activity）弹出输入法。
- 打开 **Runtime Lab**，确认状态栏从“等待宿主握手”变为“宿主握手完成”，并出现 `build=...`。
- 记录：截图 1 张（含 statusbar + instance badge）。

### 2) WindowPool / 状态不清空

- 记下 UI 里的 `instance=<id>`。
- 切到别的功能件，再切回 Runtime Lab（或从另一个入口再次打开同一 kit）。
- 期望：`instance=<id>` 不变化；AI 输出 / logs / tasks 仍在（不被清空）。
- 记录：截图 1 张（对比同一个 instance）。

### 3) AI 链路（结构化 JSON）

- 在 Runtime Lab 的 **AI** 页点击 **AI 生成**。
- 期望：
  - `aiBadge` 变为 succeeded/ok（或至少不再显示失败）
  - `AI 输出（raw）` 中出现 `output.type=json` 且包含 `output.json.candidates[]`
- 点击 **插入第 1 条 / 替换第 1 条**：
  - 期望：内容写回外部输入框，而不是写进功能件自己的输入框。
- 记录：截图 1-2 张（AI 输出 JSON + 写回效果）。

### 4) Tasks tracking（ai.request）

- 切到 **Tasks** 页。
- 期望：AI 生成期间出现 running task（kind=`ai.request`），完成后进入 history。
- 点击 **Sync**：
  - 期望：running/history 列表刷新，`lastSyncAt` 更新（如有显示）。
- 记录：截图 1 张（running/history JSON）。

### 5) Tasks tracking（network.fetch，可选）

- 在 **Tasks** 页点击 **Slow Fetch**（默认 URL：`https://httpbin.org/delay/2`）。
- 期望：出现 running task（kind=`network.fetch`），完成后进入 history。
- 如需：点击 **Cancel Running** 验证 cancel 能 ack。
- 记录：截图 1 张。

## 产物与留证

建议每次手动验收都在以下目录新建一个 run 目录并留证：

- `TODO/ime-research/artifacts/manual/emulator/<runId>/`
- `TODO/ime-research/artifacts/manual/device/<runId>/`（真机）

最少包含：

- `NOTES.md`（写明本次验证的 build / 设备 / 结论）
- `screenshots/`（至少 3-6 张关键截图）
- `logcat_full.txt`
- `logcat_functionkit.txt`（建议用 tag 过滤 `FunctionKit*`、`FcitxInputMethodService`）
- `logcat_crash.txt`（若有）

