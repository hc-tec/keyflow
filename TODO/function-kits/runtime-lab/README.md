# Runtime Lab

> 编码：UTF-8

Runtime Lab 是一个更轻量的 Function Kit，用来替代「Bridge Debugger」做最近改动的手动验收与回归。

主要入口：

- Manifest：`TODO/function-kits/runtime-lab/manifest.json`
- UI：`TODO/function-kits/runtime-lab/ui/app/`

验收建议：

- 在输入框内打开 Runtime Lab，点击 **AI 生成**，确认能收到结构化 JSON，并可 **插入/替换** 写回外部输入框。
- 切到 **Tasks**，观察 `ai.request` / `network.fetch` 期间是否出现 running task，完成后进入 history，并可 cancel。
- 在不同入口反复打开同一个 kit（同 `kitId`），确认 WebView 复用后状态不被清空（可观察 UI 的 `instance=<id>` 是否保持不变）。

