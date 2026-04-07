# Windows Function Kit Contract Runner

> 编码：UTF-8
> 创建时间：2026-03-21T23:35:00+08:00
> 更新时间：2026-03-21T23:35:00+08:00
> 目标：把 Windows 端浏览器式功能件 UI 的 fixture 回放、UI 快照断言、候选插入和错误展示固定成可重复执行的合同测试。

## 1. 结论

现在 `WindowsImeTestHost` 不只是 smoke 宿主，还新增了一条固定的 Function Kit contract 运行入口：

```powershell
powershell -ExecutionPolicy Bypass -File .\TODO\ime-research\scripts\run_windows_testhost.ps1 -Mode contract
```

它当前会自动完成：

1. 启动 `WindowsImeTestHost`
2. 聚焦单行输入框作为提交目标
3. 加载 `chat-auto-reply` 浏览器式功能件 UI
4. 回放 manifest 中登记的 fixture：
   - `bridge.host-to-ui.permissions.basic.json`
   - `bridge.host-to-ui.storage-sync.basic.json`
   - `bridge.host-to-ui.render.basic.json`
   - `bridge.host-to-ui.permission-denied.basic.json`
   - `bridge.host-to-ui.error.basic.json`
5. 抓取真实 `WebView2` UI 快照，并与 `runtime.snapshot.panel.basic.json` 比对
6. 点击首条候选的“插入”，验证 `candidate.insert` + 目标输入框写回
7. 断言 `permission.denied` 与 `bridge.error` 的错误条展示

## 2. 固定证据

- 入口脚本：`TODO/ime-research/scripts/run_windows_testhost.ps1`
- 合同结果：
  - `TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_result.json`
- 宿主快照：
  - `TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_host_snapshot.json`
- 执行日志：
  - `TODO/ime-research/logs/20260321_windows_testhost_contract.contract.log`

当前结果已经满足：

- `render_snapshot_matched=true`
- `candidate_insert_observed=true`
- `permission_denied_handled=true`
- `bridge_error_handled=true`

## 3. 角色划分

为了避免后面继续把两条 Windows 线混在一起，这里固定角色：

- `TODO/ime-research/windows-functionkit-host/`
  - 角色：Windows Function Kit Host / Runtime 参考实现
  - 重点：Host Bridge、权限、存储、安全策略、浏览器宿主行为
- `TODO/ime-research/windows-testhost/`
  - 角色：Windows IME 集成 / E2E 宿主
  - 重点：真实提交目标、焦点分离、live snapshot、功能件写回、IME 自动化

也就是说：

- 浏览器式运行时的协议与宿主模型，优先在 `windows-functionkit-host` 和 `TODO/function-kit-runtime-sdk/` 收口
- `windows-testhost` 负责把这套运行时放进“真实 IME 邻接场景”里验证

## 4. 这次顺手补上的约束

- `FunctionKitRuntimeSDK` 现在会校验：
  - `version`
  - `source`
  - `target`
  - `kitId`
  - `surface`
  - `payload`
- `chat-auto-reply` UI 现在会真正消费候选里的 `actions[]`，不再硬编码总是显示 `insert/replace`
- `WindowsImeTestHost` 现在会校验 UI -> Host envelope 的关键字段
- `WebView2` 侧新增：
  - 权限请求默认拒绝
  - 下载默认阻断

## 5. 下一步

1. 把同一套 contract runner 语义落到 Android `WebView`
2. 把 Android WebView 示例补成与 Windows 相同的本地资源 / 拒绝远程加载策略
3. 把 `windows-testhost` 里的功能件桥接逐步收敛到 shared runtime host，而不是继续手写双份
