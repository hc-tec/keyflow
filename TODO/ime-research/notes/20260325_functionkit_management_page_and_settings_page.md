# Function Kit：管理页面（权限）与功能件设置页面（Options）

> 编码：UTF-8  
> 日期：2026-03-25  
> 更新时间：2026-03-29  
> 状态：DRAFT  
> 目标：对齐浏览器插件（WebExtension）的开发体验与用户心智：宿主负责“安装/启用/权限”，功能件负责“自己的设置与 UI”。

## 0. 背景与动机

用户反馈点（核心）：

- 不想写一堆 connector；希望能力以少量、稳定、浏览器插件式 API 暴露。
- 权限必须可见、可控、可撤销，而且这应该属于“宿主的管理页面”，不是功能件自己管。
- 功能件自身的设置（例如语气、persona、模板、布局）应由功能件自己决定，不应挤在宿主设置里。

## 1. 目标定义（像浏览器一样）

### 1.1 管理页面（Host-owned）

等价于 Chrome 的 `chrome://extensions`：

- 列出已安装的 Function Kits（名称/图标/版本/来源）
- 启用/禁用
- 展示并管理 runtime permissions（按 kit 粒度）
- 查看运行时状态（最近错误、最近调用、host build）
- 卸载（未来）

关键：权限的“真开关”在宿主，不在功能件。

### 1.2 设置页面（Kit-owned）

等价于浏览器插件的 “Options page”：

- 由功能件自己提供 UI 与存储逻辑
- 可使用 `kit.storage.*` 持久化
- 宿主只负责“打开/承载”，不理解其业务配置含义

## 2. 现状盘点（当前代码已经具备的基石）

- 每个 kit 有自己的 `manifest.json`，包含 `runtimePermissions`。
- runtime SDK 的 `createKit()` 已经做到了：
  - permissions 由宿主下发/同步
  - `kit.hasPermission()` 决定 UI 可用性
- Android 宿主已经有：
  - Function Kit Manager（列表 + kit 详情）：启用/禁用、固定到工具栏、per-kit 权限覆盖
  - `settings.open` runtime 能力：供 kit 打开宿主侧设置（例如 AI 设置 / kit 管理页）
- Kit UI（chat-auto-reply / quick-phrases）已经内置 “设定” tab，属于 kit-owned settings 的雏形。

缺口：需要把“管理页面（宿主）”与“设置页面（功能件）”的边界彻底产品化：入口、命名、用户心智都要像浏览器插件一样明确。

## 3. 最小可行方案（不新增复杂协议）

### 3.1 管理页面：Android Function Kit Manager

宿主提供一个明确入口（主设置或键盘设置）：

- Function Kits 列表
  - 每项展示：图标、名称、kitId、版本号、最近使用（未来）、固定（未来）
- 进入某个 kit 的详情页：
  - Enabled toggle
  - Permissions matrix（由 manifest.runtimePermissions 决定候选项）
  - “固定到工具栏”开关（Pinned）

### 3.2 功能件设置页面：先复用 panel 的 settings tab

为了避免引入新 surface/新 bundle，先采取最简单路径：

- 功能件把设置 UI 放在自己的 panel 内（例如 `tab=settings`）
- 宿主“打开功能件设置（Options）”的含义是：打开该 kit 的 panel，并默认切到“功能件自定义的设置 UI”
  - 推荐约定：kit 提供 `settings` view/tab；如果 kit 没有 settings tab，则自行决定把 options UI 放在哪里（best-effort）

实现方式（逐步演进）：

- v0：宿主仅打开 panel；用户手动点 settings tab
- v1：宿主在打开时向 kit 注入 “open options intent”（不新增 message type，复用 `host.state.update.details.intent`）
  - 宿主发送：`host.state.update`，`details.intent.kind=open_options`
  - kit 侧收到后：切换到自己的 options UI（例如 `setActiveTab("settings", { persist: false })`）
- v2：若 kit 在 manifest 里声明独立 `options` surface，再由宿主打开 `surface=options`

这个顺序能保证：

- 现在就能落地“管理页 vs 设置页”的产品心智
- 不需要立刻扩展桥协议或 SDK

### 3.3 IME 入口：对齐浏览器插件“图标长按菜单”

浏览器的对齐点不只是 `chrome://extensions`，还有：**插件图标的右键菜单**（打开选项/管理/固定等）。

在 IME 工具栏中，对齐为：

- 点击：打开该 kit 面板（panel）
- 长按：弹出菜单
  - 打开设置（Options，kit-owned）
  - 固定/取消固定（Pinned）
  - 管理权限（跳转到宿主的 kit 管理页）

这能解决用户“找不到入口/入口太深”的问题，同时把宿主与 kit 的职责边界变得非常清晰：

- **管理页面**：宿主提供（权限/启用/固定）
- **设置页面**：功能件提供（业务配置 UI）

## 4. 未来扩展（可选，但保持简单）

### 4.1 独立 Options surface（更像浏览器插件）

manifest 可选声明：

- `entry.surfaces.options`（Android: bottom-sheet/full-screen；Windows: side-panel/popup）

宿主打开时：

- `kitId=...`
- `surface=options`

bridge envelope 已经有 `surface` 字段，SDK 也支持任意 surface 名称，因此这个扩展对协议冲击很小。

### 4.2 权限申请流（避免功能件私自宣称）

原则：

- 功能件不“申请权限”，它只能“声明自己需要什么”（manifest.runtimePermissions）
- 真正授予与撤销由宿主管理页面做

如果以后需要“运行时临时提升”（类似浏览器弹窗请求权限）：

- 也应由宿主弹窗提示用户确认
- 确认后写入宿主权限策略（而不是由 kit 自己保存）

## 5. 与当前 composer/input bridge 的关系

- `composer.*` 是内部输入桥接协议，不是 runtime permission，不应该出现在管理页的权限开关中。
- 管理页只暴露面向业务的权限（context/input/candidates/network/ai/storage/panel.settings 等）。

## 6. 下一步（可执行拆分）

- [ ] 文档：在 Function Kit 总文档中明确区分：
  - Host-owned Manager（权限/启用/卸载）
  - Kit-owned Settings（options UI）
- [ ] Android：补一个“Function Kit Manager”入口文案与结构（若现有设置页已覆盖，可只重命名与重排信息架构）
- [x] Android：为“打开功能件设置（Options）”增加宿主 -> kit 的 intent 约定（v1）
- [ ] Manifest：可选增加 `options` surface（v2）
- [ ] Android（可选）：在 App 的 kit 详情页中提供“打开功能件设置”按钮（需要一个可承载 kit panel/options 的入口，例如专用 launcher activity 或独立 options activity）
