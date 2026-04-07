# OpenClaw DeepSeek 接入记录（2026-03-22）

> 编码：UTF-8  
> 创建时间：2026-03-22T15:10:00+08:00  
> 更新时间：2026-03-22T15:56:00+08:00  
> 范围：`TODO/ime-research/repos/openclaw` 的 Agent-only 主线鉴权切换到 `DeepSeek`

## 1. 本次变更解决了什么

- 之前 `main` agent 默认落在 `anthropic/claude-opus-4-6`，但本机没有对应 provider auth。
- `OpenClaw` 的真实阻塞点不是 CLI、不是 Node、不是 gateway，而是默认模型和 auth 没就位。
- 这次把默认模型切到 `deepseek/deepseek-chat`，并把 `deepseek-reasoner` 一起注册进本地 provider catalog，后续自动回复功能件终于可以接真实 Agent 结果，而不是继续停在本地 demo。
- Windows 侧 `run_openclaw_agent_only.ps1` 也补了直接走 `node scripts/run-node.mjs` 的调用方式，避免 `pnpm openclaw ...` 在当前环境下对机器可读输出与退出码造成干扰。

## 2. 本地固定入口

- 配置脚本：`TODO/ime-research/scripts/configure_openclaw_deepseek.ps1`
- 底层配置器：`TODO/ime-research/scripts/configure_openclaw_deepseek.mjs`
- Agent-only 运行脚本：`TODO/ime-research/scripts/run_openclaw_agent_only.ps1`

## 3. 本地状态文件

- OpenClaw 配置：`<USER_HOME>\.openclaw\openclaw.json`
- 本机 DeepSeek 密钥文件：`<USER_HOME>\.openclaw\.env`

`.env` 里当前至少需要这两个键：

```dotenv
OPENCLAW_DEEPSEEK_API_KEY=***
OPENCLAW_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

说明：

- `OPENCLAW_DEEPSEEK_BASE_URL` 留空时，脚本默认回退到 `https://api.deepseek.com/v1`
- 默认主模型是 `deepseek/deepseek-chat`
- 可切换到 `deepseek/deepseek-reasoner`

## 4. 固定运行方式

### 4.1 重写 / 修复本机 OpenClaw DeepSeek 配置

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\configure_openclaw_deepseek.ps1
```

如果要把主模型切成推理版：

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\configure_openclaw_deepseek.ps1 -PrimaryModel deepseek-reasoner
```

### 4.2 检查当前 model/auth 状态

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode status -SkipInstall
```

预期重点：

- `defaultModel=deepseek/deepseek-chat`
- `missingProvidersInUse=[]`

### 4.3 做最小 smoke

```powershell
powershell -ExecutionPolicy Bypass -File TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode smoke -SkipInstall -Message "Reply with exact ASCII text OK only."
```

这一步打通后，Android / Windows Function Kit host 才值得继续接远程 AI 候选。

## 5. 本次实测结果

- 配置落盘：`TODO/ime-research/logs/20260322_openclaw_deepseek_config.json`
- `status` 结果：`TODO/ime-research/logs/20260322_openclaw_models_status_main_after_deepseek.json`
- `smoke` 结果：`TODO/ime-research/logs/20260322_openclaw_smoke_main_after_deepseek.log`
- 脚本版 `smoke` 结果：`TODO/ime-research/logs/20260322_openclaw_smoke_script_debug.log`
- Function Kit host service 健康检查：`TODO/ime-research/logs/20260322_functionkit_host_service_health.json`
- Function Kit host service OpenClaw 状态：`TODO/ime-research/logs/20260322_functionkit_host_service_openclaw_status.json`
- Function Kit host service 自动回复 smoke：`TODO/ime-research/logs/20260322_functionkit_host_service_render_smoke.json`

关键结论：

- `defaultModel` 已变成 `deepseek/deepseek-chat`
- `missingProvidersInUse=[]`
- 最小 smoke 已拿到精确返回 `OK`
- 当前真实 provider 是 `deepseek`
- `Function Kit host service` 已经可以经由 `OpenClaw main agent` 返回真实 DeepSeek 候选

## 6. 当前已知坑

- `openclaw` 的 `run-node.mjs` 会在启动时写 runtime build artifacts。
- 如果同时并发跑多个 `pnpm openclaw ...` 进程，偶发会撞上 bundled plugin runtime deps staging 失败，例如：
  - `failed to stage bundled runtime deps for discord`
  - `failed to stage bundled runtime deps for feishu`
- 所以当前这条主线里，`OpenClaw` 的 `status / smoke / gateway` 先按 **串行** 跑，不要并发起多个 CLI 进程。

## 7. 为什么不再把密钥留在仓库文本里

- 仓库里的 `TODO/TODO.md` 只是任务跟踪文件，不应该继续承载真实 provider key。
- 真实密钥已经迁到本机 `<USER_HOME>\.openclaw\.env`，避免再次扩散到版本库和后续日志。
- 如果这把 key 曾经被提交过或同步过，最稳妥的做法仍然是后续主动轮换一次。

## 8. 对下一步工作的直接意义

- `OpenClaw` 的 auth 阻塞一旦消失，Android `chat-auto-reply` 就可以从“本地示例候选生成器”切到真实宿主调用链：
  - Android IME
  - Windows host service
  - `node scripts/run-node.mjs agent --local --agent main --json`
  - 候选 JSON 返回 Function Kit 面板

- 这一步不等于功能件已经完成，只是把“根本跑不通”的 auth 问题先闭环。

