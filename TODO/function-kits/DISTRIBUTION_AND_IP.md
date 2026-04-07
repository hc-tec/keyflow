# Function Kit 分发（下载中心）与“代码泄露/IP”问题处理

## 结论先说

1) **只要 Function Kit 以 HTML/JS/CSS 形式在客户端执行，它就一定可被用户/攻击者提取与阅读**（zip/CRX/apk assets 都一样）。这不是“被强制开源”，而是 **JavaScript 分发天然可见**，浏览器扩展生态也是如此。  
2) 你能做的是：**不把秘密放进包里**、把**核心逻辑放到服务端或 Host 侧**、再用 **签名/哈希** 解决“完整性与可信来源”，并用 **混淆/压缩** 提升复制成本（但不当作安全方案）。

---

## 1. 参考浏览器插件（CRX/zip）的现实情况

- 浏览器扩展（Chrome/Edge/Firefox）本质上也是 **打包文件（zip/crx）**，里面的 JS/HTML/CSS **可以被解包**。  
- 商店签名（例如 CRX 签名）主要解决的是 **“来源可信 + 内容未被篡改”**，并不能阻止代码被阅读。

因此：**“下载到 zip 会泄露源码导致被强制开源”这个担忧，在 Web 技术栈里不可彻底消除。**

---

## 2. 我们把问题拆成两类：机密 vs 版权

### A) 机密（Secrets）保护：必须做到

**任何放进 Function Kit 包里的东西都不应被视为机密**，包括但不限于：
- API Key / Token / 私钥
- 只要被逆向即可滥用的业务逻辑（例如风控策略参数、内部接口签名算法）

推荐策略（可组合）：
- **Host 代管密钥**：UI 只发请求意图，Host 用本地安全存储/系统能力持有 key，向外发起请求（你现在的 `network.fetch` host-proxy、Android 侧 AI 接入就是这个方向）。
- **核心逻辑服务端化**：Kit 变成“UI + 协议”，核心算法在你控制的服务器跑；包里只保留渲染/交互与协议适配。
- **按用户下发短期令牌**：即使被抓包，价值也有限（仍需服务端风控/配额）。

### B) 版权/IP（Copying）保护：只能“提高成本”

- **压缩/混淆/Bundle**：能降低直接阅读/复制成本，但不能防逆向。
- **法律与平台约束**：闭源并不等于代码不可读；你需要的是 **许可证/条款** 与 **分发渠道规则**（商店下架、举报等）。

---

## 3. 平台侧要“处理好”的点：完整性、来源、与默认安全姿势

### 3.1 完整性与来源（对标浏览器商店签名）

建议路线（分 P0/P1）：
- **P0**：catalog（索引）提供 `sha256`，Host 下载 zip 后校验哈希再安装（防止下载过程被篡改/损坏）。
- **P1**：引入“商店签名”：
  - 索引里带 `signature`（例如 ECDSA/RSA/Ed25519），Host 内置官方公钥验证。
  - zip 内可带 `manifest + files hash list`，签名覆盖这些元数据。

注意：签名解决的是 **可信与完整**，不是保密。

### 3.2 默认安全姿势

- “从 URL / zip 安装”应明确提示 **只安装可信来源**。
- Host 必须限制 zip 安装的风险面（zip bomb/路径穿越/超大文件）。  
  目前 Android 侧已在安装器里加入了 **条目数/总大小上限** 与 **路径穿越拦截**（仍可继续加强：仅允许白名单目录、限制单文件大小、校验 manifest 引用资源存在性等）。

---

## 4. 我们当前实现（Android Host）

已落地的能力：
- **安装/卸载（用户安装包）**：Settings → Function Kit → Download Center  
  - 支持从 **zip** 安装、从 **URL** 下载并安装
  - Kit 详情页支持 **卸载**
- **加载**：安装后自动进入 `FunctionKitRegistry.listInstalled(...)`，可被星标动作与面板加载。
- **资源加载优先级**：WebView 资源加载对 `function-kits/<kitId>/...` 采用 **“用户安装版本优先，否则回退 assets 内置版本”**（用于覆盖更新/回滚）。

代码入口（便于后续维护/增强）：
- 安装/卸载：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitPackageManager.kt`
- 注册表合并（assets + user-installed）：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitRegistry.kt`
- WebView 资源加载（installed-first path handler）：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWebViewHost.kt`
- 下载中心 UI：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/ui/main/settings/functionkit/FunctionKitDownloadCenterFragment.kt`

---

## 5. 下一步（建议）

1) **权限审阅体验**：安装完成后，直接跳到 Kit 详情页，让用户一眼看到 runtime permissions，并可一键禁用/卸载。  
2) **哈希/签名链路**：先做 `sha256`，再做“官方公钥签名”。  
3) **自动更新**：有 catalog 后可支持“检查更新/后台下载/下次打开生效”。  
4) **开发者打包工具**：提供 `pack` 脚本生成标准 zip（只包含运行需要的文件），并生成 hash/manifest 快照。

