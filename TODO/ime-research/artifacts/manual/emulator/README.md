# Emulator 手动验证产物目录规范

> 编码：UTF-8  
> 目标：每次“亲力亲为”的手动 E2E 验证，都能留下可复现的证据（截图 + logcat），避免口头描述。

## 1. 目录命名

在 `TODO/ime-research/artifacts/manual/emulator/` 下为每一轮验证新建目录：

- `YYYYMMDD_HHMMSS_<short_slug>`

例：

- `20260325_003012_autoreply_ai`
- `20260325_004500_replace_semantics`

## 2. 目录内容建议

每个 run 目录建议包含：

- `NOTES.md`：手工 checklist 的勾选记录，写清楚“截图/日志文件名”对应哪一步
- `logcat_full.txt`：整份 logcat（用于回溯）
- `logcat_functionkit.txt`：只过滤 FunctionKit 关键 tag 的日志（用于快速定位）
- `logcat_crash.txt`：crash buffer
- `screen_*.png`：关键步骤截图（命名带步骤含义）

## 3. 采集命令（PowerShell 友好）

先清空日志（每轮必做）：

```powershell
adb -s <DEVICE_SERIAL> logcat -c
adb -s <DEVICE_SERIAL> logcat -b crash -c
```

导出 logcat：

```powershell
adb -s <DEVICE_SERIAL> logcat -d -v threadtime > logcat_full.txt
adb -s <DEVICE_SERIAL> logcat -d -v threadtime | findstr /i "FunctionKitWindow FunctionKitWebViewHost" > logcat_functionkit.txt
adb -s <DEVICE_SERIAL> logcat -d -b crash -v threadtime > logcat_crash.txt
```

截图：必须用 `adb exec-out screencap -p`。注意 PowerShell 的 `>` 可能会写坏二进制 PNG，推荐用 `cmd /c` 执行重定向：

```powershell
cmd /c "adb -s <DEVICE_SERIAL> exec-out screencap -p > screen_010_handshake_ok.png"
cmd /c "adb -s <DEVICE_SERIAL> exec-out screencap -p > screen_020_permissions.png"
```


