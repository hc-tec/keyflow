# Android `fcitx5-android` Function Kit 挂载点分析

> 编码：UTF-8
> 创建时间：2026-03-22T00:05:00+08:00
> 更新时间：2026-03-22T00:45:00+08:00
> 范围：`TODO/ime-research/repos/fcitx5-android`

## 1. 最现实的挂载路径

浏览器式 Function Kit 面板，当前最现实的接入路径不是直接改 `FcitxInputMethodService` 的视图树，而是复用现成输入法窗口链路：

- Service 入口：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/FcitxInputMethodService.kt:559`
- Service 入口：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/FcitxInputMethodService.kt:565`
- 面板容器：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/InputView.kt:231`
- 窗口挂载：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/wm/InputWindowManager.kt:114`

结论是：新增一个 `InputWindow.ExtendedInputWindow`，比直接改键盘主视图更稳。

这条路径现在已经有了第一版真实落地：

- `TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/functionkit/FunctionKitWindow.kt`
- `TODO/ime-research/notes/20260322_android_functionkit_window_baseline.md`

## 2. 为什么选 `ExtendedInputWindow`

这个类型天然更适合作为浏览器式功能件容器：

- 定义位置：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/wm/InputWindow.kt:69`
- 扩展标题栏位：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/wm/InputWindow.kt:73`
- 顶部扩展区接入：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/KawaiiBarComponent.kt:472`
- 顶部扩展区接入：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/KawaiiBarComponent.kt:476`

这意味着 Function Kit 面板可以先作为“按需打开的扩展窗口”存在，不需要第一天就侵入整个键盘布局。

## 3. 文本提交边界

最终文本提交必须回到 `FcitxInputMethodService.commitText(...)`：

- 提交实现：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/FcitxInputMethodService.kt:409`
- 事件最终落点：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/FcitxInputMethodService.kt:228`

不要让 WebView 桥直接调用 `currentInputConnection.commitText()`，原因很直接：

- `FcitxInputMethodService` 已经处理 composing 区与选区替换
- 现有窗口也是统一走这层，不是各自直连 `InputConnection`

参考现有实现：

- `ClipboardWindow`：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/clipboard/ClipboardWindow.kt:125`
- `KawaiiBarComponent`：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/KawaiiBarComponent.kt:323`

如果 Function Kit 提交发生在 fcitx 仍有 preedit 的状态，建议先走“提交并重置”语义链：

- 语义入口：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/keyboard/CommonKeyActionListener.kt:68`
- 提交与重置：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/keyboard/CommonKeyActionListener.kt:99`

## 4. 最小改动方案

如果现在目标是尽快做出真实可用基线，建议把改动收敛成下面几块：

1. 新增一个 `BrowserWindow`，继承 `InputWindow.ExtendedInputWindow`
2. `BrowserWindow` 内部持有 `WebView + FunctionKitWebViewHost`
3. 如需 EditorInfo / 选区 / 候选态同步，则实现 `InputBroadcastReceiver`
4. 从工具栏或状态区加一个入口按钮打开 `BrowserWindow`

相关文件：

- 广播接口：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/broadcast/InputBroadcastReceiver.kt:18`
- 广播器：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/broadcast/InputBroadcaster.kt:27`
- 工具栏入口：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/KawaiiBarComponent.kt:310`
- “更多”入口：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/bar/KawaiiBarComponent.kt:316`
- 状态区窗口：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/input/status/StatusAreaWindow.kt:48`

其中最保守的做法，是先复用“更多”入口或状态区入口，不急着侵入主键盘视图。

## 5. 哪些地方先不要动

当前阶段不建议动下面这些模块：

- `FcitxRemoteService`
- `FcitxPluginService`
- `FcitxPluginServices`

原因是它们属于现有插件 / IPC 体系，不是浏览器式 Function Kit 面板的首选挂载路径。

## 6. 额外边界

- 如果只做本地功能件页面，不需要 Android `INTERNET` 权限
- 如果未来要加载远程网页，再评估 `AndroidManifest.xml` 的网络权限与远程代码风险
- 如果要让窗口常驻保活，再考虑 `InputView.addEssentialWindow(...)` 这条注册路径
