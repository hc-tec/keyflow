# Publishing to GitHub (Checklist)

> 编码：UTF-8  
> 目标：把本项目涉及的若干仓库以「可公开维护」的状态发布到 GitHub。

## 0. 先做关键决策

- 仓库列表（哪些 repo 要发布、哪些只是本地调研 clone 不发布）
- 每个 repo 的开源协议（建议统一，除非存在上游协议约束）
- 是否需要脱敏（例如真机 ADB 序列号、内部 IP、内部域名、内部路径）

## 1. 发布前自检（每个 repo 都做）

1) 工作区干净：

```bash
git status -sb
```

2) 扫描常见密钥模式（本仓库提供脚本）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\oss\scan-secrets.ps1
```

3) （可选）脱敏内部值：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\oss\redact-private.ps1
```

说明：该脚本会对 **tracked** 文本文件做 best-effort 脱敏，包括：

- 本机绝对路径（替换为 `<WORKSPACE_ROOT>`）
- `adb -s <DEVICE_SERIAL> / `adb connect <DEVICE_SERIAL> `<DEVICE_SERIAL>`）
- 非 localhost 的 `IP:PORT`（替换为 `<HOST:PORT>`；端口为 `5555` 的会替换为 `<DEVICE_SERIAL>`）

4) GitHub “社区健康文件”齐全：

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `.github/`（issue template / PR template / CI）

## 2. 创建 GitHub 仓库并推送

（二选一）

- 方式 A：网页创建仓库后，把仓库 URL 作为 origin
- 方式 B：使用 `gh`（需要你本机已登录）

推送示例：

```bash
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin master
```

如需改默认分支为 `main`，建议在发布前完成并统一各 repo：

```bash
git branch -M main
git push -u origin main
```

## 3. GitHub 仓库设置建议

- 开启：Issues / Discussions（可选）/ Security Advisories
- 配置 Branch protection：
  - require PR
  - require status checks（CI）
- 开启 Dependabot（如是 Node/Gradle 依赖）

## 4. （强烈建议）历史脱敏/压缩

如果你在历史提交里写过内部地址、设备序列号、token、截图等，**仅修改当前文件是不够的**：推到 GitHub 仍然会把历史一并公开。

两种常见做法：

- 方案 A（最简单，推荐）：发布一个「无历史」的新分支/新仓库（orphan commit）。
- 方案 B：用 `git filter-repo` 重写历史（更强但更危险，需备份）。

如你希望我直接在本地帮你生成一个 `public` 分支（只有最新快照、无历史），告诉我你希望保留哪些目录、需要删掉/脱敏哪些内容。

