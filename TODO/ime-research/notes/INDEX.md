# IME Research Index

> 编码：UTF-8  
> 更新时间：2026-03-25T15:00:43+08:00
> 范围：Windows + Android 输入法（含 AI 输入增强）

## 1. 结论性文档

- 可行性研究（Windows + Android）：`TODO/ime-research/notes/20260320_feasibility_windows_android.md`
- AI 输入法/键盘调研：`TODO/ime-research/notes/20260320_ai_ime_survey.md`
- 语音入口 + 打字不放弃（调研 + 构建证据）：`TODO/ime-research/notes/20260320_voice_typing_keyboards.md`
- Android Docker 构建 Playbook：`TODO/ime-research/notes/20260320_build_playbook_android_docker.md`
- 主线运行/功能件/测试总方案：`TODO/ime-research/notes/20260321_run_baseline_functionkit_testing.md`
- 浏览器式功能件 UI 调研与结论：`TODO/ime-research/notes/20260321_browser_like_functionkit_ui_research.md`
- 功能件 Host Bridge 与测试契约：`TODO/ime-research/notes/20260321_functionkit_bridge_and_test_contracts.md`
- Function Kit Runtime SDK 仓库化方案：`TODO/ime-research/notes/20260321_functionkit_runtime_sdk_repo.md`
- Runtime SDK 宿主适配示例：`TODO/ime-research/notes/20260321_sdk_host_adapter_examples.md`
- Android Function Kit Host 加固：`TODO/ime-research/notes/20260321_android_functionkit_host_hardening.md`
- Android `fcitx5-android` Function Kit 挂载点：`TODO/ime-research/notes/20260321_android_fcitx5_functionkit_mount_points.md`
- Android Function Kit 窗口基线：`TODO/ime-research/notes/20260322_android_functionkit_window_baseline.md`
- Android Function Kit 工具栏/权限修复：`TODO/ime-research/notes/20260322_android_functionkit_toolbar_permissions_fix.md`
- Android Function Kit Contract Runner：`TODO/ime-research/notes/20260322_android_functionkit_contract_runner.md`
- Android Function Kit 共享 AI Chat：`TODO/ime-research/notes/20260323_android_functionkit_shared_ai_chat.md`
- Android Function Kit AI Bootstrap Follow-up：`TODO/ime-research/notes/20260323_android_functionkit_ai_bootstrap_followup.md`
- Function Kit Input Bridge（Embedded Keyboard Routing）：`TODO/ime-research/notes/20260325_functionkit_input_bridge.md`
- Function Kit contextmenu / 剪贴板触发 / 快捷入口机制：`TODO/ime-research/notes/20260325_functionkit_contextmenu_bindings.md`
- Android Detached Composer MVP（ARCHIVED）：`TODO/ime-research/notes/20260323_android_detached_composer_mvp.md`
- Function Kit Runtime Detached Composer Autobind（ARCHIVED）：`TODO/ime-research/notes/20260323_functionkit_runtime_detached_composer_autobind.md`
- Android Function Kit 快捷入口重构：`TODO/ime-research/notes/20260323_android_functionkit_quick_access_refactor.md`
- Android Function Kit 默认展开可见性补强：`TODO/ime-research/notes/20260323_android_functionkit_toolbar_default_visibility.md`
- Android Function Kit 注册表基线：`TODO/ime-research/notes/20260323_android_functionkit_registry_baseline.md`
- Android Function Kit 多工具栏槽位基线：`TODO/ime-research/notes/20260323_android_functionkit_multi_toolbar_slots.md`
- Android Function Kit 多功能件可见性落地：`TODO/ime-research/notes/20260323_android_functionkit_multi_kit_visibility.md`
- Android Function Kit 图标资产支持：`TODO/ime-research/notes/20260323_android_functionkit_icon_assets.md`
- Android 真机运行手册：`TODO/ime-research/notes/20260322_android_real_device_runbook.md`
- Function Kit Host Service + Android 联调验证：`TODO/ime-research/notes/20260322_functionkit_host_service_android_validation.md`
- Function Kit 斜杠触发与搜索编排方案：`TODO/ime-research/notes/20260322_functionkit_slash_trigger_design.md`
- Windows IME E2E Activator 修正记录：`TODO/ime-research/notes/20260322_windows_ime_e2e_activator_fix.md`
- Windows Function Kit Host PoC：`TODO/ime-research/notes/20260321_windows_functionkit_host_poc.md`
- Windows Function Kit Contract Runner：`TODO/ime-research/notes/20260321_windows_functionkit_contract_runner.md`
- Windows + OpenClaw 运行复核：`TODO/ime-research/notes/20260321_windows_openclaw_runtime_recheck.md`
- Windows 安装/注册验证基线：`TODO/ime-research/notes/20260321_windows_install_validation.md`
- Windows TestHost 基线：`TODO/ime-research/notes/20260321_windows_testhost_baseline.md`
- Windows IME E2E 基线：`TODO/ime-research/notes/20260321_windows_ime_e2e_baseline.md`
- Windows IME 焦点就绪修正：`TODO/ime-research/notes/20260322_windows_focus_readiness_fix.md`
- OpenClaw Agent-only 最小调用面：`TODO/ime-research/notes/20260321_openclaw_agent_only_surface.md`
- OpenClaw DeepSeek 接入记录：`TODO/ime-research/notes/20260322_openclaw_deepseek_setup.md`

## 2. 仓库清单与复现工具

- 仓库盘点清单（自动生成）：`TODO/ime-research/notes/20260320_repo_inventory.md`
- 生成脚本：`TODO/ime-research/scripts/gen_repo_inventory.py`
- 命令执行+落盘日志：`TODO/ime-research/scripts/run_and_log.py`
- Android 真机部署/调试主线脚本：`TODO/ime-research/scripts/run_fcitx5_android_real_device.ps1`
- Android 构建后端（一般不直接运行）：
  - 本地 Gradle：`TODO/ime-research/scripts/run_fcitx5_android_debug_local.ps1`
  - Docker：`TODO/ime-research/scripts/run_fcitx5_android_debug_docker.ps1`
- Windows 主线构建脚本：`TODO/ime-research/scripts/run_rime_weasel_build.ps1`
- Windows 安装验证脚本：`TODO/ime-research/scripts/verify_rime_weasel_install.ps1`
- Windows TestHost 入口脚本：`TODO/ime-research/scripts/run_windows_testhost.ps1`
- Windows Function Kit Host 入口脚本：`TODO/ime-research/scripts/run_windows_functionkit_host.ps1`
- Windows IME E2E 入口脚本：`TODO/ime-research/scripts/run_windows_ime_e2e.ps1`
- OpenClaw Agent-only 运行脚本：`TODO/ime-research/scripts/run_openclaw_agent_only.ps1`
- OpenClaw DeepSeek 配置脚本：`TODO/ime-research/scripts/configure_openclaw_deepseek.ps1`
- Function Kit Host Service 入口脚本：`TODO/ime-research/scripts/run_functionkit_host_service.ps1`
- Android Function Kit 桥接消息风暴修复记录：`TODO/ime-research/notes/20260323_android_functionkit_bridge_message_storm_fix.md`

## 3. 关键构建日志（可复现证据）

- Trime（失败→arm64 成功）：
  - `TODO/ime-research/logs/20260320_trime_assembleDebug_docker_fix-cmake2_live.log`
  - `TODO/ime-research/logs/20260320_trime_assembleDebug_docker_arm64_live.log`
  - `TODO/ime-research/logs/20260320_trime_assembleDebug_docker_arm64_exitcode.txt`
- Fcitx5-Android（依赖修复→arm64 成功）：
  - `TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_fix-cmake6.log`
  - `TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_fix-ecm2_live.log`
  - `TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_arm64_fix-boostinclude2_live.log`
  - `TODO/ime-research/logs/20260320_fcitx5-android_assembleDebug_docker_arm64_fix-boostinclude2_exitcode.txt`

- AnySoftKeyboard（语音+打字，Docker 成功构建）：
  - `TODO/ime-research/logs/20260320_anysoftkeyboard_ime-app_assembleDebug_docker_volume-cache_live.log`
  - `TODO/ime-research/logs/20260320_anysoftkeyboard_ime-app_assembleDebug_docker_volume-cache_live_exitcode.txt`

- HeliBoard（语音快捷键切换到语音 IME，Docker 成功构建）：
  - `TODO/ime-research/logs/20260320_heliboard_assembleDebug_docker_live.log`
  - `TODO/ime-research/logs/20260320_heliboard_assembleDebug_docker_live_exitcode.txt`

- FUTO Keyboard（离线语音+打字，Docker 成功构建）：
  - `TODO/ime-research/logs/20260320_futo-android-keyboard_assembleUnstableDebug_docker_live.log`
  - `TODO/ime-research/logs/20260320_futo-android-keyboard_assembleUnstableDebug_docker_live_exitcode.txt`

- rime-weasel / OpenClaw（2026-03-21 复核）：
  - `TODO/ime-research/logs/20260321_rime-weasel_script_recheck2.log`
  - `TODO/ime-research/logs/20260321_rime-weasel_script_recheck2.exitcode.txt`
  - `TODO/ime-research/logs/20260321_rime-weasel_full_recheck.log`
  - `TODO/ime-research/logs/20260321_rime-weasel_full_recheck.exitcode.txt`
  - `TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only2.log`
  - `TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only2.exitcode.txt`
  - `TODO/ime-research/logs/20260321_rime-weasel_weasel_only_after_shim.log`
  - `TODO/ime-research/logs/20260321_rime-weasel_weasel_only_after_shim.exitcode.txt`
  - `TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only4.log`
  - `TODO/ime-research/logs/20260321_rime-weasel_rime_weasel_only4.exitcode.txt`
  - `TODO/ime-research/logs/20260321_rime-weasel_full_default_after_split.log`
  - `TODO/ime-research/logs/20260321_rime-weasel_full_default_after_split.exitcode.txt`
  - `TODO/ime-research/logs/20260321_rime-weasel_installer_recheck.log`
  - `TODO/ime-research/logs/20260321_rime-weasel_installer_recheck.exitcode.txt`
  - `TODO/ime-research/logs/20260321_rime-weasel_install_validation.log`
  - `TODO/ime-research/logs/20260321_rime-weasel_install_validation.json`
  - `TODO/ime-research/logs/20260321_windows_testhost_build.log`
  - `TODO/ime-research/logs/20260321_windows_testhost_smoke_snapshot.json`
  - `TODO/ime-research/logs/20260321_windows_testhost_recheck.log`
  - `TODO/ime-research/logs/20260321_windows_testhost_recheck.smoke.log`
  - `TODO/ime-research/logs/20260321_windows_testhost_recheck_snapshot.json`
  - `TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_result.json`
  - `TODO/ime-research/logs/20260321_windows_testhost_functionkit_contract_host_snapshot.json`
  - `TODO/ime-research/logs/20260321_windows_testhost_contract.contract.log`
  - `TODO/ime-research/logs/20260321_windows_functionkit_host_smoke.log`
  - `TODO/ime-research/logs/20260321_windows_functionkit_host_smoke.smoke.log`
  - `TODO/ime-research/logs/20260321_windows_functionkit_host_smoke_snapshot.json`
  - `TODO/ime-research/logs/20260321_windows_ime_e2e_build.log`
  - `TODO/ime-research/logs/20260321_windows_ime_e2e_run.log`
  - `TODO/ime-research/logs/20260321_windows_ime_e2e_result.json`
  - `TODO/ime-research/logs/20260321_openclaw_models_status_main.json`
  - `TODO/ime-research/logs/20260321_openclaw_models_status_main.exitcode.txt`
  - `TODO/ime-research/logs/20260321_openclaw_smoke_main.log`
  - `TODO/ime-research/logs/20260321_openclaw_smoke_main.exitcode.txt`
  - `TODO/ime-research/logs/20260322_functionkit_host_service_health.json`
  - `TODO/ime-research/logs/20260322_functionkit_host_service_openclaw_status.json`
  - `TODO/ime-research/logs/20260322_functionkit_host_service_render_smoke.json`
  - `TODO/ime-research/logs/20260322_openclaw_smoke_script_debug.log`
  - `TODO/ime-research/logs/20260322_fcitx5-android_app_assembleDebug_docker_arm64-v8a_rerun.log`
  - `TODO/ime-research/logs/20260322_fcitx5-android_app_assembleDebug_docker_x86_64_rerun.log`
  - `TODO/ime-research/logs/20260322_154448_fcitx5-android_real_device_doctor.json`
  - `TODO/ime-research/logs/20260322_155630_fcitx5-android_real_device_run.json`
  - `TODO/ime-research/logs/20260323_fcitx5-android_clean_app_testDebugUnitTest_tests_org_fcitx_fcitx5_android_input_functionkit_FunctionKitHostDiag_local_arm64-v8a.log`
  - `TODO/ime-research/logs/20260323_fcitx5-android_clean_app_assembleDebug_docker_arm64-v8a_rerun.log`
