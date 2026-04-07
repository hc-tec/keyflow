# 浏览器式功能件 UI 调研与结论（Windows + Android）

> 编码：UTF-8
> 创建时间：2026-03-21T20:05:00+08:00
> 更新时间：2026-03-21T20:05:00+08:00
> 范围：输入法功能件 UI、Windows + Android、Host Adapter、测试

## 1. 先说结论

我不建议继续走 `UI schema` 这条路。

更合适的主线是：

- **功能件 UI = 本地打包的浏览器式前端 bundle**
  - `HTML`
  - `CSS`
  - `JavaScript`
- **宿主 = 输入法 Host Adapter**
  - Windows：原生壳 + `WebView2`
  - Android：原生键盘壳 + 扩展面板 `WebView`
- **数据契约继续结构化**
  - Tool 输入输出继续用 JSON Schema
  - Skill 继续用 `SKILL.md`
  - 但 UI 布局本身不再用 schema 描述

一句话：**结构化的是数据，不是界面。**

## 2. 为什么我否掉 UI schema

`UI schema` 适合做：

- 配置页
- 很浅的表单
- 低交互密度的后台管理界面

但你要的不是这个。

你要的是：

- 像浏览器扩展侧边栏那样的 UI
- 能有工具栏、标签页、卡片、局部状态、滚动区域
- 能承载后续很多功能件
- 能逐步长成“输入法里的 mini app 平台”

这种东西如果继续用 `panel.schema.json` 去描述，后面一定会遇到这几个问题：

1. 交互能力会越来越别扭
   - 拖拽、局部刷新、复杂状态管理、动画、富交互卡片都会很快失控
2. 视觉自由度太低
   - 一开始你会觉得 schema 很快，后面会发现每加一种交互都要扩 schema
3. 测试面会变差
   - 你不是在测试真正的 UI，而是在测一个“schema 解释器”
4. 跨平台并没有真的更简单
   - 你只是把复杂度从前端实现，转移到了 schema renderer

所以我的判断很明确：**不要把 UI 当声明式布局 DSL 去设计。**

## 3. 外部资料给出的强信号

### 3.1 浏览器扩展本身就不是 schema-first

Chrome 扩展给的是：

- Side Panel
- Popup
- Options Page
- Messaging
- Native Messaging
- Permissions / Manifest

也就是说，浏览器扩展的成熟模式从来不是“把 UI 写成 schema”，而是：

- UI 是真正的网页
- 宿主负责权限、生命周期、消息桥

这和你现在要做的输入法功能件平台非常像。

### 3.2 Android IME 官方模型允许宿主定义输入视图

Android 官方输入法模型本来就是：

- `InputMethodService`
- `onCreateInputView()`
- `onCreateCandidatesView()`
- 通过 `InputConnection.commitText()` 写回目标输入框

这说明 Android 端本来就有：

- 输入区视图
- 候选区视图
- 写回目标输入框的官方链路

但这里我要强调一个自己的判断：

- **Android 适合把“扩展功能件面板”做成浏览器式 UI**
- **不适合把“整个键盘主输入区”都做成 WebView**

原因很简单：IME 的主输入区对时延、焦点和稳定性要求过高。

### 3.3 Windows 端更适合用 WebView2 承载浏览器式面板

WebView2 的官方思路非常直接：

- 用 Edge Runtime 承载嵌入式 Web UI
- 原生宿主和网页之间可以双向通信
- 可以加载本地内容

这非常适合 Windows 功能件面板：

- 候选侧栏
- 功能件抽屉
- 全屏编辑页
- 调试页

Windows 这边我没有太多犹豫：**WebView2 是现在最现实的方向。**

### 3.4 `fcitx5-android` 现有插件模型也支持继续往上抽象

本地代码已经证明 `fcitx5-android` 的插件模型是：

- 插件 APK 带 `plugin.xml`
- 可以声明 `hasService`
- 主程序通过插件 Service 做 IPC

也就是说，Android 主线底层已经天然具备：

- manifest / descriptor
- 宿主发现
- IPC service

它离“功能件宿主”只差一层更高阶的 UI/runtime 约定。

## 4. 我给你的架构建议

### 4.1 三层模型

#### A. 基础输入层

负责：

- 键盘按键
- 候选条
- 上屏
- 中文输入主链路

这一层必须保持原生，不能搞花。

#### B. 功能件宿主层

负责：

- 打开 / 关闭功能件
- 提供当前输入上下文
- 提供权限门控
- 负责最终 `insert` / `replace`
- 桥接 Agent / Tool / Skill

这一层像浏览器本体。

#### C. 功能件前端层

负责：

- HTML / CSS / JS UI
- 卡片
- 按钮
- 面板状态
- 局部交互

这一层像浏览器扩展页面。

### 4.2 三种 UI Surface

我建议固定成 3 类 surface：

1. `inline`
   - 原生最小入口
   - 例如候选条上的一个按钮或 chip
2. `panel`
   - 浏览器式主界面
   - Windows 偏 `side-panel`
   - Android 偏 `bottom-sheet`
3. `editor`
   - 全屏页或独立窗口
   - 用于长文本和复杂设置

这比“一个 schema 同时描述所有面板”合理得多。

### 4.3 Host Bridge 不要太花，直接消息驱动

我建议宿主和功能件前端只走消息桥，保持类似浏览器扩展的心智模型：

- 面板 -> 宿主
  - `ready`
  - `requestContext`
  - `insertText`
  - `replaceText`
  - `regenerate`
  - `openSettings`
- 宿主 -> 面板
  - `contextChanged`
  - `renderCandidates`
  - `themeChanged`
  - `safeAreaChanged`
  - `keyboardStateChanged`

这里也要非常明确：

- **消息桥传结构化数据**
- **前端自己决定怎么渲染**

这才是“浏览器 UI”的核心。

## 5. 最大挑战是什么

最大的挑战不是画 UI。

最大的挑战是：**输入焦点与输入连接管理。**

### 5.1 Android 最大坑

如果功能件面板自己也有输入框，而它又跑在 IME 里，会出现：

- 焦点切换混乱
- 面板内输入和目标 App 输入串线
- WebView 内文本输入与外部 `InputConnection` 互相抢占

所以我的结论很硬：

- 小输入框可以有
- 但必须是功能件本地输入域
- 不能默认复用目标输入连接
- 大文本编辑直接走 `editor` surface

### 5.2 Windows 最大坑

Windows 当前已经证明：

- 中文输入主链路可用
- 人工真实打字已经成立
- 自动化 E2E 还卡在桌面级输入注入

如果再把功能件面板叠进去，你会多出两个问题：

- 面板焦点与目标输入框焦点怎么共存
- 插入动作如何既稳定又不打断用户输入

所以 Windows 上也不能偷懒，必须把“功能件面板焦点”和“目标输入域焦点”分开设计。

## 6. 我不建议做的事情

1. 不要把整个输入法 UI 都做成 WebView
2. 不要让功能件 UI 从远程 URL 动态加载
3. 不要把复杂交互继续塞回 `UI schema`
4. 不要让功能件直接自动发送消息
5. 不要把平台差异假装不存在

第 2 条尤其重要。

如果你以后允许远程加载功能件 UI，那安全面会瞬间扩大：

- 供应链风险
- 权限越权
- 本地数据窃取
- 测试不可复现

我建议第一阶段只允许：

- 本地打包资源
- 审核过的能力声明
- 白名单式 Host Bridge

## 7. 当前最合理的落地顺序

1. **先把浏览器式 UI runtime 定死**
   - 功能件入口改为本地 `index.html + main.js + styles.css`
2. **先做 `chat-auto-reply` 的浏览器式面板 MVP**
   - 只做候选卡片
   - 只做 `insert/replace/regenerate`
3. **Windows 先证明 WebView2 side panel 可跑**
4. **Android 先证明扩展面板 WebView 可跑**
   - 不是整键盘 WebView
5. **随后再做自动化测试**
   - Windows：WebView2 + 桌面自动化
   - Android：`UIAutomator` / `Espresso-Web`

## 8. 对现有方案的修正

旧方案里“UI schema”这件事我认为应该降级成历史草稿，不再作为主线。

保留的只有两部分：

- Tool I/O schema
- Skill 规则

真正上主线的应该是：

- 浏览器式 UI bundle
- Host Bridge
- Surface 模型

## 9. 参考资料

### 官方资料

- Chrome Extensions Side Panel API：<https://developer.chrome.com/docs/extensions/reference/api/sidePanel>
- Chrome Extensions Messaging：<https://developer.chrome.com/docs/extensions/develop/concepts/messaging>
- Chrome Extensions Native Messaging：<https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging>
- Android Creating an Input Method：<https://developer.android.com/guide/topics/text/creating-input-method>
- Android `InputConnection.commitText`：<https://developer.android.com/reference/android/view/inputmethod/InputConnection#commitText(java.lang.CharSequence,%20int)>
- Android WebView local content / `WebViewAssetLoader`：<https://developer.android.com/develop/ui/views/layout/webapps/load-local-content>
- Android Espresso-Web：<https://developer.android.com/training/testing/espresso/web>
- Microsoft WebView2 WinForms getting started：<https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/winforms>
- Microsoft WebView2Browser sample：<https://learn.microsoft.com/en-us/microsoft-edge/webview2/samples/webview2browser>
- Microsoft Edge WebDriver / WebView2 automation：<https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver>

### 本地代码 / 仓库证据

- `fcitx5-android` 插件描述：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/core/data/PluginDescriptor.kt`
- `fcitx5-android` 插件 Service IPC：`TODO/ime-research/repos/fcitx5-android/app/src/main/java/org/fcitx/fcitx5/android/core/FcitxPluginServices.kt`
- `fcitx5-android` 插件样例：`TODO/ime-research/repos/fcitx5-android/plugin/clipboard-filter/src/main/res/xml/plugin.xml`
- 当前功能件骨架：`TODO/function-kits/chat-auto-reply/README.md`

## 10. 一句话结论

**后续功能件 UI 主线改成“浏览器式本地前端 + 宿主消息桥”，不要再把 UI 当 schema 来设计。**
