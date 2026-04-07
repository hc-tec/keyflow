# Windows + OpenClaw 运行复核（2026-03-21）

> 编码：UTF-8  
> 创建时间：2026-03-21T04:38:00+08:00  
> 更新时间：2026-03-21T17:05:00+08:00  
> 范围：`rime-weasel` Windows 原生构建 + `openclaw` Agent-only 运行复核

## 1. 这次复核后的结论

### 1.1 OpenClaw 已经不是 Node/CLI 形态问题

- 当前 `node --version` 已是 `v22.22.1`，满足 `OpenClaw` 的 `>= 22.16` 要求。
- `pnpm openclaw agents list` 可以正常工作。
- `run_openclaw_agent_only.ps1` 当前固定保留 `status / smoke / gateway` 三种模式。
- `smoke` 模式的真实命令形态是：

```powershell
pnpm openclaw agent --local --agent main --message "Reply with exact ASCII text OK only." --thinking low --json
```

- 当前不要再把 `pnpm openclaw:rpc` 当成稳定入口：
  - 它现在会直接退出并报 `required option '-m, --message <text>' not specified`
  - 如果后面要常驻后端，应切到 `openclaw gateway run`，并显式设置 `OPENCLAW_SKIP_CHANNELS=1`

- 当前真实阻塞点不是构建，而是鉴权：
  - `No API key found for provider "anthropic"`
  - 鉴权文件路径：`<USER_HOME>\.openclaw\agents\main\agent\auth-profiles.json`
- `models status --agent main --json` 的当前结论已经落盘：
  - `TODO/ime-research/logs/20260321_openclaw_models_status_main.json`
  - `shellEnvFallback.enabled=false`
  - `missingProvidersInUse=["anthropic"]`
  - 当前 `main` agent 没有任何 auth profile

### 1.2 rime-weasel 的 Windows wrapper 已经固化了真实 workaround

`TODO/ime-research/scripts/run_rime_weasel_build.ps1` 现在已经收进了这批实战修正：

1. 默认优先使用 repo 内的 Boost 1.84：
   - `TODO/ime-research/repos/rime-weasel/deps/boost_184_tar2/boost_1_84_0`
2. 自动使用 `subst` 短路径（默认 `W:`）绕开 `MAX_PATH`。
3. 自动重写 Boost 的 `project-config.jam`，固定 `vcvarsall.bat`。
4. 用 `VsDevCmd.bat`，不再误用只会开新 shell 的 `LaunchDevCmd.bat`。
5. 在 wrapper 里过滤 `Anaconda` 污染的 `PATH/CMAKE_PREFIX_PATH/INCLUDE/LIB/LIBPATH/EXTERNAL_INCLUDE`。
6. 清理 `librime` 的分架构缓存目录，避免旧的污染缓存被 `stash_build` 恢复回来。
7. 修复日志/退出码判断，避免“失败却显示成功”。
8. 给 `librime/build.bat` 注入 `CMAKE_GENERATOR_INSTANCE`，强制依赖与主工程使用同一个 VS 实例。
9. 用 `cscript.exe //E:JScript render.js ...` 预生成 `weasel.props`，绕开按扩展名找 `.js` 脚本引擎的老问题。
10. 在缺少 ATL/MFC `afxres.h` 时，本地生成 `winres.h` shim。
11. 默认参数改成 `release boost opencc rime weasel`；当 `output/data/essay.txt` 缺失时，只在 repo 实路径补跑一次 `data` 预阶段。

## 2. 这次实际跑过的命令

### 2.1 OpenClaw smoke

运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_openclaw_agent_only.ps1 -Mode smoke -SkipInstall
```

结果：

- 命令实际进入 `openclaw agent --local ...`
- 最终失败在缺少 Anthropic API key
- 这说明输入法侧接 `OpenClaw Agent-only` 的命令入口已经打通，当前只差 auth

### 2.2 rime-weasel：Boost 阶段

运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1 -BuildArgs 'release boost' -LogPath 'TODO/ime-research/logs/20260321_rime-weasel_script_recheck2.log'
```

结果：

- 成功
- 退出码文件：`TODO/ime-research/logs/20260321_rime-weasel_script_recheck2.exitcode.txt`
- 关键证据：
  - `BOOST_ROOT=W:\deps\boost_184_tar2\boost_1_84_0`
  - `Performing configuration checks`

### 2.3 rime-weasel：早期默认全量失败样本（历史记录）

运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1 -LogPath 'TODO/ime-research/logs/20260321_rime-weasel_full_recheck.log'
```

结果：

- 失败
- 日志：`TODO/ime-research/logs/20260321_rime-weasel_full_recheck.log`
- 当时暴露了两类问题：
  1. `data` 阶段在 `W:` 短路径下的 WSL/`bash` 翻译问题
  2. `render.js` / `weasel.props` 的 `.js` 脚本引擎问题

这个失败样本保留的意义是：

- 说明后续 wrapper 修正确实针对了真实阻塞
- 也解释了为什么后续要把 `data` 预阶段与主构建拆开

### 2.4 rime-weasel：早期 `release rime weasel` 失败样本（历史记录）

运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1 -BuildArgs 'release rime weasel' -LogPath 'TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only2.log'
```

结果：

- 失败
- 日志：`TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only2.log`
- 当时暴露了：
  - `___std_*` 链接错误
  - `render.js` / `weasel.props` 问题
  - `MSB4019`

这个失败样本保留的意义是：

- 说明当前成功不是“从来没失败过”，而是确实经过了依赖、缓存与工具链一致性修复

### 2.5 rime-weasel：只跑 `weasel`

运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1 -BuildArgs 'release weasel' -LogPath 'TODO/ime-research/logs/20260321_rime-weasel_weasel_only_after_shim.log'
```

结果：

- 成功
- 退出码文件：`TODO/ime-research/logs/20260321_rime-weasel_weasel_only_after_shim.exitcode.txt`
- 说明 `weasel.props` 预生成与 `afxres.h` shim 已经生效

### 2.6 rime-weasel：`release rime weasel` clean rebuild

运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1 -BuildArgs 'release rime weasel' -LogPath 'TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only4.log'
```

结果：

- 成功
- 退出码文件：`TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only4.exitcode.txt`
- 已产出：
  - `TODO/ime-research/repos/rime-weasel/output/weasel.dll`
  - `TODO/ime-research/repos/rime-weasel/output/weaselx64.dll`
  - `TODO/ime-research/repos/rime-weasel/output/Win32/rime.dll`
  - `TODO/ime-research/repos/rime-weasel/output/Win32/WeaselServer.exe`
  - `TODO/ime-research/repos/rime-weasel/output/Win32/WeaselDeployer.exe`
  - `TODO/ime-research/repos/rime-weasel/output/WeaselSetup.exe`

这说明：

- 之前的 `___std_*` 链接错误已经被清理缓存 + 固定 VS 实例的组合修复掉了
- `render.js` 相关问题不再阻塞
- `rime + weasel` 的 clean rebuild 已闭环

### 2.7 rime-weasel：默认不带参数的入口命令

运行命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1 -LogPath 'TODO/ime-research/logs/20260321_rime-weasel_full_default_after_split.log'
```

结果：

- 成功
- 退出码文件：`TODO/ime-research/logs/20260321_rime-weasel_full_default_after_split.exitcode.txt`
- `output/data` 中这些文件被正常更新：
  - `TODO/ime-research/repos/rime-weasel/output/data/default.yaml`
  - `TODO/ime-research/repos/rime-weasel/output/data/key_bindings.yaml`
  - `TODO/ime-research/repos/rime-weasel/output/data/punctuation.yaml`
  - `TODO/ime-research/repos/rime-weasel/output/data/symbols.yaml`

这说明：

- 当前默认入口命令已经可以作为 Windows 主线的基线复现入口
- `data` 预阶段拆分后，即使冷启动缺数据，也不再因为 `W:` 短路径而直接阻塞
- 数据同步阶段仍可能打印 WSL 本地环境噪音，但不影响最终退出码

### 2.8 rime-weasel：`release installer`

运行命令：

```powershell
choco install nsis -y
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1 -BuildArgs 'release installer' -LogPath 'TODO/ime-research/logs/20260321_rime-weasel_installer_recheck.log'
```

结果：

- 成功
- 退出码文件：`TODO/ime-research/logs/20260321_rime-weasel_installer_recheck.exitcode.txt`
- `makensis.exe` 安装路径：
  - `C:\Program Files (x86)\NSIS\Bin\makensis.exe`
- 产物：
  - `TODO/ime-research/repos/rime-weasel/output/archives/weasel-0.17.4.0.93eec2d-installer.exe`

补充说明：

- `NSIS` 阶段有 4 个 warning，但不影响最终退出：
  - `weaselARM.dll`
  - `weaselARM64.dll`
  - `weaselARM64X.dll`
  - `data\*.gram`
- 这说明 Windows 安装包打包链路已经闭环

## 3. 当前未闭环点

### 3.1 OpenClaw：auth 阻塞

当前唯一真实阻塞：

- `<USER_HOME>\.openclaw\agents\main\agent\auth-profiles.json` 不存在或未配置可用的 provider key
- 当前落盘证据：
  - `TODO/ime-research/logs/20260321_openclaw_models_status_main.json`
  - `TODO/ime-research/logs/20260321_openclaw_smoke_main.log`

最短修复路径：

1. 在网关主机的 `<USER_HOME>\.openclaw\.env` 中写入 `ANTHROPIC_API_KEY=...`
2. 或者拿到 Anthropic token 后执行 `openclaw models auth paste-token --provider anthropic`

补充判断：

- 现在不是“OpenClaw 不能跑”，而是“`main` agent 没有可用 Anthropic 凭据”
- 由于 `shellEnvFallback.enabled=false`，当前更稳妥的做法是直接写 `~/.openclaw/.env` 或写入 auth store

### 3.2 Windows：源码 baseline、installer 与安装验证都已通，剩下的是测试基建

按优先级排序，当前剩余事项如下：

1. **还没有 Windows 端的真实输入框测试宿主与 UI 自动化**
   - 现在已经能证明“源码能构建、安装包能打、机器级安装 / 注册验证基本成立”
   - 但还不能证明“安装后在真实输入框里可稳定工作”

2. **仍需要把“成功构建”转成“可安装、可回归、可持续验证”**
   - 基线构建已经闭环
   - installer 打包已经闭环
   - 安装 / 注册验证脚本也已经闭环
   - 下一阶段重点应转到测试宿主、输入法切换、端到端自动化

## 4. 已经被排除掉的旧阻塞

下面这些问题，已经不再是当前主阻塞：

1. `OpenClaw` 的 Node 版本过低
2. `OpenClaw` 的 CLI 形态不对
3. `rime-weasel` 的 Boost 1.78 默认路径
4. `rime-weasel` 的 Boost.Build 自动探测 `vcvarsall.bat` 错乱
5. `run_rime_weasel_build.ps1` 的假成功退出码问题
6. `Anaconda` 抢 Boost / 抢 `stdbool.h` 的早期污染问题
7. `build data` 在 `W:` 短路径下的 WSL/`bash` 翻译失败
8. `render.js` / `weasel.props` 阶段的 `.js` 脚本引擎问题
9. 缺少 `afxres.h`
10. `___std_*` 链接错误
11. `NSIS` 缺失导致无法打 installer

## 5. 现在应该怎么继续

后续继续时，不要再回到“重新猜项目”阶段，直接按这个顺序推进：

1. 先给 `OpenClaw` 的 `main` agent 配好 auth
2. Windows 侧保留这 4 条固定复核命令：
   - `powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1 -BuildArgs 'release boost'`
   - `powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1 -BuildArgs 'release rime weasel'`
   - `powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1`
   - `powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_rime_weasel_build.ps1 -BuildArgs 'release installer'`
3. 先复用 `verify_rime_weasel_install.ps1` 保持安装 / 注册验证稳定
4. 开始做 Windows `TestHost`
5. 开始做自动化安装/切换/E2E 脚本

如果以后上下文清空，优先看这几份文件：

- `TODO/ime-research/notes/20260321_run_baseline_functionkit_testing.md`
- `TODO/ime-research/notes/20260321_windows_openclaw_runtime_recheck.md`
- `TODO/ime-research/scripts/run_rime_weasel_build.ps1`
- `TODO/ime-research/scripts/run_openclaw_agent_only.ps1`
- `TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only4.log`
- `TODO/ime-research/logs/20260321_rime-weasel_full_default_after_split.log`
- `TODO/ime-research/logs/20260321_rime-weasel_installer_recheck.log`
- `TODO/ime-research/logs/20260321_openclaw_models_status_main.json`
- `TODO/ime-research/logs/20260321_openclaw_smoke_main.log`

