# 2026-03-24 Android Startup Crash Real-Device Diagnosis

## Device

- Remote adb: `<DEVICE_SERIAL>`
- Model: `V2244A`

## What was happening

- Earlier real-device crash log showed native startup crash in `Java_org_fcitx_fcitx5_android_core_Fcitx_startupFcitx`
- The old stack pointed at `fcitx::AddonInstance::findCall(...)`
- Symbolication mapped the immediate crash site to `native-lib.cpp:713`, i.e. callback registration on `androidfrontend`
- That meant the crash path was `androidfrontend->call(...)` on a null addon instance, not a Function Kit UI crash

## Diagnostics added

- `native-lib.cpp`
  - log `Global/Fresh pkgdata dirs`
  - log `Global/Fresh addon dirs`
  - log expected addon config / addon library existence
  - log loaded addon names and resolved addon instances
  - guard against null `androidfrontend` during callback setup so startup no longer segfaults immediately
- `androidaddonloader.cpp`
  - log addon dir resolution, attempted library paths, load success, instance creation
- `addonmanager.cpp`
  - log addon config scan dirs and resolved addon config count
- `inputmethodmanager.cpp`
  - log inputmethod config scan dirs and resolved config count

## Real-device result after rebuild + reinstall

- Built with local Gradle:
  - `powershell -ExecutionPolicy Bypass -File "<WORKSPACE_ROOT>\TODO\ime-research\scripts\run_fcitx5_android_debug_local.ps1" -Abi arm64-v8a -GradleTasks ":app:assembleDebug"`
- Because direct remote `adb install` was unstable over TCP, used:
  - `adb -s <DEVICE_SERIAL> push "...org.fcitx.fcitx5.android-9fa072d-arm64-v8a-debug.apk" /data/local/tmp/fcitx-debug.apk`
  - `adb -s <DEVICE_SERIAL> shell pm install -r -d /data/local/tmp/fcitx-debug.apk`

## Key log evidence on the real device

- `Resolved addon config count in 'addon': 16`
- `Loaded addons after initialize: [imselector, quickphrase, androidfrontend, clipboard, pinyinhelper, androidkeyboard, unicode, luaaddonloader, imeapi, notifications]`
- `Known input method addons after initialize: {androidkeyboard, table, pinyin}`
- `Resolved addon instance androidfrontend=...`
- `Setting up callback`
- `Finishing startup`

## Current conclusion

- On the rebuilt package now installed to `<DEVICE_SERIAL>`, the previous native startup crash is no longer reproduced
- Real-device logs now show addon config discovery, addon library loading, and `androidfrontend` instance creation all succeeding
- This means:
  - plain reinstall of the same broken package was not the real fix
  - reinstalling the rebuilt package does resolve the specific startup crash path that was previously observed

## StandardPaths hypothesis status

- Current evidence does **not** support `StandardPaths::global()` stale-cache as the primary cause on the rebuilt package
- On Android logs, `Global pkgdata dirs` and `Fresh pkgdata dirs` are aligned enough to discover the addon configs
- The rebuilt package can discover addon configs and instantiate `androidfrontend` on both emulator and real device

## What remains

- User still needs to re-test the Function Kit flows that were failing after startup:
  - Function Kit panel behavior
  - chat auto reply flow
  - in-kit input / detached composer behavior


