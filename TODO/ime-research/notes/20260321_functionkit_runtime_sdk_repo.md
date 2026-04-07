# Function Kit Runtime SDK 仓库化方案

> 编码：UTF-8
> 创建时间：2026-03-21T21:05:00+08:00
> 更新时间：2026-03-30T02:20:01+08:00
> 目标：把浏览器式功能件运行时抽成一个可独立演进的 SDK 仓库项目。

## 1. 结论

这个 runtime 不应该继续只是零散文档或某个功能件里的工具脚本。

更合适的形态是：

- 一个独立仓库项目
- 对外提供 SDK
- 功能件浏览器页面通过 SDK 接宿主

当前仓库里的落点是：

- `TODO/function-kit-runtime-sdk/`

这就是后续可直接拆仓的种子目录。

## 2. 为什么要 SDK 化

如果不 SDK 化，后面很容易退化成：

- Windows 页面里写一份桥接代码
- Android 页面里再写一份桥接代码

这会直接导致：

- 两套协议心智
- 两套 bug
- 两套测试资产

SDK 化之后，前端页面只认一套高层入口：

- `FunctionKitRuntimeSDK.createKit(...)`

需要低层协议能力（envelope 收发、`replyTo`、超时/AbortSignal 等）时，使用 `FunctionKitRuntimeSDK.createKit(...).raw`。

> 为了避免入口混用，browser bundle 的全局 `FunctionKitRuntimeSDK` 不再暴露 `createClient`。

## 3. 当前已经落地的内容

- SDK 说明：`TODO/function-kit-runtime-sdk/README.md`
- 包描述：`TODO/function-kit-runtime-sdk/package.json`
- SDK 源码：`TODO/function-kit-runtime-sdk/src/index.js`
- SDK 类型：`TODO/function-kit-runtime-sdk/src/index.d.ts`
- 浏览器 bundle：`TODO/function-kit-runtime-sdk/dist/function-kit-runtime.js`
- Manifest schema：`TODO/function-kit-runtime-sdk/schemas/function-kit-manifest.schema.json`
- 安全模型：`TODO/function-kit-runtime-sdk/docs/SECURITY_MODEL.md`
- 能力与权限：`TODO/function-kit-runtime-sdk/docs/CAPABILITIES_AND_PERMISSIONS.md`

## 4. 与 Host Bridge 的关系

- Host Bridge 是协议
- Runtime SDK 是协议在浏览器端的统一实现

所以这两层要分开：

1. 协议规范继续放在 `TODO/function-kits/host-bridge/`
2. SDK 负责把协议变成浏览器页面可直接调用的 API

## 5. 现在的接法

`chat-auto-reply` 已切到 SDK 接入：

- `TODO/function-kits/chat-auto-reply/ui/app/index.html`
- `TODO/function-kits/chat-auto-reply/ui/app/main.js`
- `TODO/function-kits/chat-auto-reply/manifest.json`

## 6. 后续规则

以后凡是新的浏览器式功能件：

1. 先复用这个 SDK
2. 如果协议不够，再扩 SDK 和 Host Bridge 规范
3. 不允许在某个功能件里单独发明第二套宿主桥接逻辑
