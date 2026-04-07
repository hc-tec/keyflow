# OpenClaw Agent-only 最小调用面（2026-03-21）

> 编码：UTF-8  
> 创建时间：2026-03-21T17:05:00+08:00  
> 更新时间：2026-03-21T17:05:00+08:00  
> 范围：`openclaw` 在当前输入法主线里的最小配置、最小命令面、已知失效入口

## 1. 当前主线里，OpenClaw 的职责要说准

当前主线里，`openclaw` 只承担：

1. Agent 能力
2. Skills / Tool 编排能力

它不是聊天入口，不接 channel。输入法自己就是入口。

所以当前真正要固定的是：

- 机器上到底依赖哪些文件 / 凭据
- 现在哪些命令稳定
- 哪些命令看起来像能用，其实现在不能当主线

## 2. 当前最小运行链路依赖什么

### 2.1 关键路径

- 仓库：`TODO/ime-research/repos/openclaw`
- 入口脚本：`TODO/ime-research/scripts/run_openclaw_agent_only.ps1`
- 当前 agent：`main`
- 当前 agentDir：`<USER_HOME>\.openclaw\agents\main\agent`
- 当前 auth store：`<USER_HOME>\.openclaw\agents\main\agent\auth-profiles.json`

### 2.2 当前机器上的真实文件状态

这台机器当前已确认：

- `<USER_HOME>\.openclaw\openclaw.json`：不存在
- `<USER_HOME>\.openclaw\.env`：不存在
- `<USER_HOME>\.openclaw\agents\main\agent\auth-profiles.json`：不存在

这说明：

- 现在还没有持久化的 OpenClaw 本地配置
- 现在也没有 provider key 的持久化入口
- `main` agent 当前没有可用 auth profile

### 2.3 真正卡住的不是工程链，而是凭据

当前 `models status --agent main --json` 的关键信息已经很清楚：

- 默认模型：`anthropic/claude-opus-4-6`
- `shellEnvFallback.enabled=false`
- `missingProvidersInUse=["anthropic"]`

所以当前真实阻塞只有一个：

- 缺 Anthropic 凭据

最短修复路径仍然只有两种：

1. 在网关主机写：`<USER_HOME>\.openclaw\.env`
   - `ANTHROPIC_API_KEY=...`
2. 或执行：
   - `openclaw models auth paste-token --provider anthropic`

## 3. 现在哪些命令稳定，哪些不要再误用

### 3.1 稳定可用：状态检查

固定命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode status -SkipInstall
```

它实际执行：

```powershell
pnpm openclaw models status --agent main --json
```

这条链路当前稳定可用，适合做：

- 主机状态快照
- auth 缺失诊断
- agentDir / auth store / 默认模型确认

### 3.2 稳定可用：一次性本地 agent 调用

固定命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode smoke -SkipInstall -Message "Reply with exact ASCII text OK only."
```

它实际执行：

```powershell
pnpm openclaw agent --local --agent main --message "Reply with exact ASCII text OK only." --thinking low --json
```

这条链路当前最适合输入法功能件 MVP：

- 进程形态最简单
- 输入输出最明确
- 一旦失败，定位路径也最短

### 3.3 可以作为后续常驻后端：本地 gateway，但显式跳过 channels

固定命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode gateway -SkipInstall
```

脚本会显式设置：

- `OPENCLAW_SKIP_CHANNELS=1`
- `CLAWDBOT_SKIP_CHANNELS=1`

然后执行：

```powershell
pnpm openclaw gateway run --allow-unconfigured --force
```

这条链路的定位不是“接 channel”，而是给后续输入法常驻本地后端留入口。

### 3.4 当前不要再把 `openclaw:rpc` 当主线

这点必须写死。

当前 commit `93fbe26adbbcf15fec0b2ddd395478e9100de41e` 下，`package.json` 里的：

```text
pnpm openclaw:rpc
```

实际会走：

```text
node scripts/run-node.mjs agent --mode rpc --json
```

但当前实测结果不是“稳定启动一个长期 RPC 后端”，而是直接退出并报：

- `error: required option '-m, --message <text>' not specified`

所以当前不能把它继续写进主线 runbook，更不能把它当输入法 Agent 后端的稳定接口。

当前主线要改成：

- `status`
- `smoke`
- `gateway`

而不是：

- `status`
- `smoke`
- `rpc`

## 4. 无 key 时，现在能做什么 / 不能做什么

### 4.1 还能做的

1. 跑 `models status`
2. 确认默认模型、agentDir、auth store 路径
3. 固化调用协议与功能件宿主接口
4. 继续做输入法侧 mock / fixture / contract 测试

### 4.2 不能做的

1. 不能完成真实 `agent --local` 推理
2. 不能验证真实模型输出驱动的候选生成
3. 不能做依赖真实 Agent 回复的功能件 E2E

所以当前 `OpenClaw` 的阻塞不是工程跑不起来，而是 provider 凭据没有就位。

## 5. 给输入法功能件的最小接入建议

当前最务实的方案，不是先追求常驻 RPC，而是分两步：

### 阶段 A：先用一次性 CLI 跑通协议

Host Adapter 先只做：

1. 组装 prompt / 上下文 / Tool 参数
2. 调用：
   - `openclaw agent --local --agent main --message ... --json`
3. 把结果转换成：
   - 候选展示
   - 按钮动作
   - 插入文本

原因：

- 最少依赖
- 最容易定位错误
- 不需要先解决常驻进程、重连、端口占用、守护进程生命周期

### 阶段 B：协议稳定后，再切常驻后端

如果后面觉得一次一进程太慢，再切到：

- `openclaw gateway run --allow-unconfigured --force`
- 并持续保持 `OPENCLAW_SKIP_CHANNELS=1`

也就是：

- 先把功能做对
- 再把进程形态做快

## 6. 以后从哪里继续

上下文清空后，先看这 4 个入口：

1. 状态：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode status -SkipInstall
```

2. 最小自检：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode smoke -SkipInstall -Message "Reply with exact ASCII text OK only."
```

3. 如需常驻后端：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode gateway -SkipInstall
```

4. 当前状态说明：

- `TODO/ime-research/notes/20260321_windows_openclaw_runtime_recheck.md`

## 7. 当前结论

关于 `OpenClaw`，当前最重要的事实只有 5 条：

1. `status` 已通
2. `smoke` 的真实阻塞是 Anthropic 凭据缺失
3. `openclaw:rpc` 当前不能当稳定入口
4. 输入法功能件 MVP 应先走一次性 `agent --local --json`
5. 真正常驻化时，再转 `gateway run + skip channels`

