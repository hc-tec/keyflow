# Android Detached Composer MVP（2026-03-23）

> 范围：`fcitx5-android` Function Kit、Detached Composer、`kit_draft` 本地草稿目标、Android IME 输入重定向
> 关联设计：`product-thinking/20260323_functionkit_detached_composer_design.md`
> 状态：ARCHIVED（2026-03-25）：Detached Composer（可见草稿 UI + apply 写回）已从主线撤回；当前主线为 Embedded Input Bridge（功能件输入框可输入但不额外引入原生草稿面板）。
> 最新说明：`TODO/ime-research/notes/20260325_functionkit_input_bridge.md`

## 1. 这次真正落地的点

这次不是只把 `composer.*` 消息做成状态同步假动作，而是让 Android 宿主里真的出现了一个可见、可编辑、可写回的 Detached Composer MVP。

当前 `FunctionKitWindow` 已新增：

- 位于功能件 `WebView` 上方的原生草稿编辑区
- 本地 `kit_draft` 文本缓冲
- 显式 `Insert / Replace / Close` 动作
- 原目标失效后的写回禁用态

## 2. 关键实现

### 2.1 一个输入法实例，两类输入目标

这次没有尝试再起一个新的输入法，也没有让 `WebView <input>` 去直接承接系统输入。

实际做法是：

- 外部目标仍然是当前 App 的 `InputConnection`
- 功能件草稿目标变成宿主维护的 `kit_draft`
- 当 Detached Composer 处于 `open + focused` 时，键盘输入被重定向到 `kit_draft`

### 2.2 Android 输入重定向

`FcitxInputMethodService` 现在新增了 `LocalInputTarget` 钩子。

当 Function Kit composer 聚焦时，下面这些动作不再直接落到外部 `InputConnection`：

- `commitText`
- `deleteSurrounding`
- `backspace`
- `enter`
- 左右移动
- 选择区删除/收起

而是先写入 `FunctionKitComposerDraftBuffer`。

### 2.3 真实草稿缓冲

新增的 `FunctionKitComposerDraftBuffer` 负责：

- 插入/替换选区
- `backspace`
- `deleteSurrounding`
- 选择区偏移
- 选择区收起

这让 Detached Composer 至少具备了最小可用的本地编辑行为，而不是只存一段字符串。

## 3. 当前用户可感知行为

现在只要功能件触发：

- `composer.open`
- `composer.focus`
- `composer.update`
- `composer.close`

宿主就会同步一块真实原生编辑区，而不是只在桥里回个 JSON 状态。

当 composer 处于聚焦态时：

- 下方还是同一个输入法键盘
- 键盘提交内容进入本地草稿
- 插入/替换必须显式点击
- 如果原目标输入框失效，写回按钮会禁用

## 4. 还没有做的部分

这版明确还是 MVP，不要误判成“完整 detached composer”：

- 还没有 `composer.minimize`
- 还没有 `composer.target.status` 独立消息
- 还没有跨输入会话保留
- `chat-auto-reply` 前端现在只有基础入口，还没有围绕草稿做更深的工作流编排
- 还没有处理更复杂的预编辑可视化同步

但关键的结构已经成立了：

- 宿主原生编辑区存在
- 键盘输入目标可切到 `kit_draft`
- 写回外部目标仍然显式

## 5. 验证

已在 `fcitx5-android` 仓库完成：

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitComposerDraftBufferTest --tests org.fcitx.fcitx5.android.input.functionkit.FunctionKitAiChatBackendTest --tests org.fcitx.fcitx5.android.ui.main.settings.behavior.FunctionKitSettingsStatusResolverTest --console=plain --warning-mode=all
.\gradlew.bat :app:compileDebugKotlin --console=plain --warning-mode=all
```

两条均已通过。
