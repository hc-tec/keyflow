# Android Release Signing Helpers

These scripts standardize how the workspace creates and uses the formal Android release keystore.

## Files

- `new-android-release-keystore.ps1`
  - one-time keystore generation into `.local-secrets/android-release/`
- `build-fcitx5-android-release.ps1`
  - loads `SIGN_KEY_*` from `signing.env` and runs `:app:assembleRelease`
- `export-android-signing-env.ps1`
  - prints the current signing env block, optionally including `SIGN_KEY_BASE64`

## Recommended Flow

1. Generate the keystore once:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\release\new-android-release-keystore.ps1
   ```

2. Build a formally signed APK:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\release\build-fcitx5-android-release.ps1 -VersionName 0.1.3
   ```

3. If CI needs the same key, export the env block:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\release\export-android-signing-env.ps1 -Format dotenv -IncludeBase64
   ```
