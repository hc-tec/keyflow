# Platform Compatibility Notes

这个表只回答一个问题：

> 在 KitStudio 里跑通了，到了 Android Host 会不会还一样？

结论先写在前面：

- `KitStudio` 适合开发和快速验收
- `Android Host` 才是当前发布口径的事实来源
- 真正跨平台稳定的写法，是只依赖 `FunctionKitRuntimeSDK`，并且严格声明 `runtimePermissions`

## 1. 核心矩阵

| 能力 | KitStudio | Android Host | 开发建议 |
| --- | --- | --- | --- |
| `context.read` / `input.insert` / `input.replace` | 支持 | 支持 | 两边都要声明对应 `runtimePermissions`，不要只在 KitStudio 里测 happy path。 |
| `storage.get/set/watch` | 支持 | 支持 | 永远用 `kit.storage.*`，不要改用 DOM Storage。 |
| `settings.open` | 支持（模拟跳转） | 支持 | 适合做权限引导；不要把业务状态绑在这个动作上。 |
| `panel.state.update` | 支持 `ack` | 支持 `ack` | 只当短期 UI patch 信号，不要把它当持久化。 |
| `network.fetch` | 支持（Host Simulator / Node 代理） | 支持（宿主代理） | 两边都要声明 `network.fetch`；发布前要测真实网络和错误态。 |
| `files.pick` | 支持 | 支持 | 文件上传路径可在两边开发；仍要在 Android 真机上确认权限和文件大小边界。 |
| `files.download` / `files.getUrl` | 支持 | 当前不建议依赖 | 如果你要做“下载后再展示”，当前要先确认 Android 侧是否真的提供了等价能力。 |
| `ai.request` | 支持 `demo / real / replay` | 支持真实共享 AI | KitStudio 里的 AI 更适合开发闭环，不等于用户设备上的 provider 配置与结果质量。 |
| 任务中心 / 取消任务 | 支持 | 支持 | 适合拿来包住 `network.fetch` / `ai.request` 这类耗时操作。 |

## 2. 最容易误判的地方

### DOM Storage

浏览器环境里你可能会以为 `localStorage` 能用，但 Android Host 默认禁用 `localStorage / sessionStorage / IndexedDB`。

结论：

- 持久化只用 `kit.storage.*`
- 不要把草稿、配置、缓存放进 DOM Storage

### 外链脚本

KitStudio 跑在正常浏览器里，外链脚本有时看起来“能加载”；Android Host 的 CSP 不接受这种路径。

结论：

- 脚本依赖一律本地化或 vendored
- 图片 / CSS / 字体即使能外链，也优先本地化

### AI 结果

KitStudio 的 `AI` 面板已经有 `demo / real / replay` 三种模式，但它仍然是开发者工具能力，不是用户设备上的真实共享 AI 设置。

结论：

- 在 KitStudio 里验证链路和回放
- 在 Android Host 上验证真实权限、共享 AI 配置和结果边界

## 3. 发布前最低验收

至少走一遍：

1. `npm run doctor`
2. `npm run open:kitstudio`
3. `npm run pack:zip`
4. 在 Android Host 安装 ZIP 后验证一次核心路径

如果你的 kit 用到了：

- `network.fetch`
- `files.pick`
- `ai.request`
- `bindings`

那就不要只看 KitStudio 结果直接发布。
