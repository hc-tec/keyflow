# 下载中心（Store Kit）

> 编码：UTF-8  
> 说明：这是一个“内置 Store/下载中心”Function Kit 的 UI。  
> 目标：把“发现/安装/卸载/管理/设置源”等复杂 UI 放在 Web 层实现，宿主只负责校验与执行高风险动作。

## 运行时依赖

- SDK：`FunctionKitRuntimeSDK`（由 manifest `entry.sdk.browserBundle` 注入）
- 关键能力（权限）：
  - `kits.manage`：安装/卸载/启用等管理能力（特权，仅建议授予内置 Store Kit）
  - `files.download`：资源代理下载（可选，用于缓存/离线/审计/校验）
  - `network.fetch`：拉取 catalog / store index（可选）
  - `storage.read/write`：保存 sources / UI 偏好

## 设计稿 / 还原目标

截图位于：`TODO/function-kits/store/images/`

