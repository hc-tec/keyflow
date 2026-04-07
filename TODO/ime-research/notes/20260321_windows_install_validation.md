# Windows 安装/注册验证基线（rime-weasel）

> 编码：UTF-8  
> 创建时间：2026-03-21T16:35:00+08:00  
> 更新时间：2026-03-21T16:35:00+08:00  
> 范围：`rime-weasel` installer 安装、注册表视图、TSF TIP、用户输入法列表

## 1. 这次补的不是“构建”，而是“安装验证脚本”

新脚本：

- `TODO/ime-research/scripts/verify_rime_weasel_install.ps1`

用途：

1. 找到最新 `weasel-*-installer.exe`
2. 校验安装目录中的关键文件
3. 校验 `System32` / `SysWOW64` 里的 `weasel.dll`
4. 分别检查 64 位与 32 位注册表视图
5. 检查 TSF TIP 与 `zh-CN` 语言 profile
6. 检查当前用户语言列表里是否已经出现 Weasel InputTip

默认命令：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\verify_rime_weasel_install.ps1
```

如果需要脚本自己重跑静默安装：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\verify_rime_weasel_install.ps1 -RunInstall
```

## 2. 当前已确认的事实

### 2.1 安装并没有丢，只是注册表落在 32 位视图

这次把之前“好像没写 uninstall key”的疑点查清了：

- `HKLM\SOFTWARE\Rime\Weasel` 的 64 位视图确实为空
- 但 `HKLM\SOFTWARE\WOW6432Node\Rime\Weasel` 存在，包含：
  - `InstallDir = C:\Program Files\Rime`
  - `WeaselRoot = C:\Program Files\Rime\weasel-0.17.4`
  - `ServerExecutable = WeaselServer.exe`
- `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Weasel` 的 64 位视图为空
- 但 `HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Weasel` 存在

这说明：

- 之前不是“安装器没写注册表”
- 而是 **NSIS x86 安装器触发了 WOW64 注册表重定向**

所以以后看安装状态，不能只看 64 位视图。

### 2.2 TSF 注册是成立的

当前已确认：

- `HKLM\SOFTWARE\Microsoft\CTF\TIP\{A3F4CDED-B1E9-41EE-9CA6-7B4D0DE6CB0A}` 存在
- 32 位镜像视图也存在
- `LanguageProfile\0x00000804\{3D02CAB6-2B8E-4781-BA20-1C9267529467}` 已启用

这意味着系统层的 TIP 注册不是空想，Windows 已认识到这个输入法。

### 2.3 当前用户输入法列表里已经出现 Weasel

`Get-WinUserLanguageList` 当前结果：

- `zh-Hans-CN`
- `InputMethodTips` 包含：
  - `0804:{A3F4CDED-B1E9-41EE-9CA6-7B4D0DE6CB0A}{3D02CAB6-2B8E-4781-BA20-1C9267529467}`

这说明：

- 用户态输入法列表已经能看到 Weasel
- “是否已加入输入法列表”这个问题，当前答案是 **已加入**

## 3. 现在仍然没有闭环的地方

这次验证解决的是：

- 安装产物是否存在
- 注册表是否成立
- InputTip 是否进入当前用户语言列表

这次**没有**解决的是：

1. 当前登录会话里，是否能稳定切换到 Weasel 并开始真实汉字输入
2. 在不同宿主控件中，候选窗、焦点、上屏、回删是否稳定
3. 功能件面板接入后，真实输入链路是否还稳定

所以接下来的重点不再是“查注册表”，而是：

- Windows `TestHost`
- 自动切换输入法
- 真实输入 E2E

## 4. 一个重要的工程判断

现在可以明确：

- Windows 主线的下一个阻塞 **不是安装器**
- 也不是“系统是否认识这个输入法”
- 而是 **如何把真实输入行为自动化测起来**

这会直接决定后面功能件、Agent 接入、候选插入、焦点切换能不能持续回归。
