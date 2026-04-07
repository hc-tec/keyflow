# Function Kit Runtime SDK Docs Index

> 编码：UTF-8  
> 目标：给 SDK 文档一个稳定入口，并明确“哪些文档跟着哪些代码/协议更新”。  

## 1. 你应该先读哪些

- SDK 总览与接入：`TODO/function-kit-runtime-sdk/README.md`
- Host Bridge 协议（SDK 依赖它）：`TODO/function-kits/host-bridge/README.md`
- 功能件开发者手册（Android WebView 约束/打包/导包/Bindings/结果呈现/生命周期）：`TODO/function-kits/DEVELOPER_GUIDE.md`

按主题：

- Browser 插件式 API（高层封装设计与示例）：`TODO/function-kit-runtime-sdk/docs/BROWSER_EXTENSION_STYLE_API_V2.md`
- Bindings（`binding.invoke` / `requestedPayloads`）：`TODO/function-kit-runtime-sdk/docs/BINDINGS.md`
- 能力与权限清单（manifest/runtime permission 名字）：`TODO/function-kit-runtime-sdk/docs/CAPABILITIES_AND_PERMISSIONS.md`
- Store Kit APIs（下载中心/商店作为 Kit 的管理与资源代理能力）：`TODO/function-kit-runtime-sdk/docs/STORE_KIT_APIS.md`
- 安全模型（固定 origin、禁远程、禁 DOM Storage 等）：`TODO/function-kit-runtime-sdk/docs/SECURITY_MODEL.md`
- AI 后端协议（宿主侧路由契约）：`TODO/function-kit-runtime-sdk/docs/AI_BACKEND_PROTOCOL.md`

## 2. “文档的事实来源”（Source of Truth）

避免文档漂移：更新时以这些为准，再回写到文档。

- SDK 代码：`TODO/function-kit-runtime-sdk/src/index.js`
- Host Bridge schema：  
  - `TODO/function-kits/host-bridge/message-envelope.schema.json`  
  - `TODO/function-kits/host-bridge/error.schema.json`
- AI backend schemas：`TODO/function-kit-runtime-sdk/schemas/`

## 3. 维护规则（什么时候必须更新文档）

### 3.1 改了权限/能力

同时更新：

- `TODO/function-kit-runtime-sdk/docs/CAPABILITIES_AND_PERMISSIONS.md`
- 相关 kit 的 `manifest.json` 示例（如有）

### 3.2 改了 Host Bridge 消息类型或 payload

同时更新：

- `TODO/function-kits/host-bridge/README.md`
- 对应 schema（如有）+ SDK `src/index.js` 的封装

### 3.3 改了 `createKit(...)` 高层 API（方法名/事件/返回值）

同时更新：

- `TODO/function-kit-runtime-sdk/docs/BROWSER_EXTENSION_STYLE_API_V2.md`
- `TODO/function-kit-runtime-sdk/README.md` 的最小示例（如有）

### 3.4 改了安全默认值（origin、导航、DOM Storage、下载、权限请求）

同时更新：

- `TODO/function-kit-runtime-sdk/docs/SECURITY_MODEL.md`
