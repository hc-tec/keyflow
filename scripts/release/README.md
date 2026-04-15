# Android Release Signing Helpers

These scripts standardize how the workspace creates and uses the formal Android release keystore.

## Files

- `new-android-release-keystore.ps1`
  - one-time keystore generation into `.local-secrets/android-release/`
- `build-fcitx5-android-release.ps1`
  - loads `SIGN_KEY_*` from `signing.env` and runs `:app:assembleRelease` (which will aggregate all configured release flavors)
- `export-android-signing-env.ps1`
  - prints the current signing env block, optionally including `SIGN_KEY_BASE64`
- `publish-keyflow-android-release.ps1`
  - creates or updates the `keyflow` Android GitHub Release, verifies signer + bundled kits, scans AGP `output-metadata.json` to collect all matching APK variants, rewrites uploaded APK asset names to the `keyflow-` prefix, writes source/license metadata, uploads APKs and `SHA256SUMS.txt`

## Recommended Flow

1. Generate the keystore once:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\release\new-android-release-keystore.ps1
   ```

2. Build a formally signed APK:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\release\build-fcitx5-android-release.ps1 -VersionName 0.1.3
   ```

3. Publish the Android release to `keyflow`:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\release\publish-keyflow-android-release.ps1 -ApkVersion 0.1.3 -ReleaseNotesPath .\docs\release-notes\android\0.1.3.md
   ```

   Uploaded APK assets will be renamed like:
   - `keyflow-0.1.3-arm64-v8a-release.apk`
   - `keyflow-0.1.3-arm64-v8a-release-debug.apk`
   - if multiple package variants are built in the same release:
     - `keyflow-0.1.3-standard-arm64-v8a-release.apk`
     - `keyflow-0.1.3-voice-arm64-v8a-release.apk`

   The release note will include:
   - source repo URL
   - source commit URL
   - source archive URL
   - `LGPL-2.1-or-later`
   - `## 更新内容` from `-ReleaseNotesPath`
   - `## 下载哪个 APK？` guide inferred from attached ABI assets

   If you need to update the release note body only (no asset delete/upload), pass `-SkipAssetUpload`.

4. If CI needs the same key, export the env block:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\release\export-android-signing-env.ps1 -Format dotenv -IncludeBase64
   ```
