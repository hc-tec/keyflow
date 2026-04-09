# Releasing

## Scope

- `keyflow` GitHub Releases is the only binary distribution entry for this workspace.
- `fcitx5-android` remains source-only. Do not upload APK assets to the `fcitx5-android` GitHub repository.
- Keep tooling/source releases and Android APK releases separate.

## Release Types

### 1. Tooling / Source Release

Use this for starter templates, create CLI, docs, catalog/runtime changes, and other `keyflow` deliverables.

- Tag format: `v*` (example: `v0.1.0`)
- Repository: `keyflow`
- Assets: npm packages, docs links, source-oriented notes
- Do not attach Android APKs here

### 2. Android APK Release

Use this when publishing installable `fcitx5-android` builds through `keyflow`.

- Repository: `keyflow`
- Source repo: `fcitx5-android`
- Tag formats:
  - Formal signing: `fcitx5-android-<apkVersion>`
  - Debug keystore / test build: `fcitx5-android-<apkVersion>-debug`

## Required Metadata

Every Android APK release note should state:

- APK version (example: `0.1.3`)
- source commit from `fcitx5-android`
- signing type:
  - `formal release keystore`
  - or `local debug.keystore`
- whether it is a normal release or a pre-release
- attached ABI assets

If the APK is signed with `debug.keystore`, mark the GitHub Release as `pre-release` and say it is for install/testing only.

## Minimal Checklist

1. Build APKs from `fcitx5-android`.
2. Sign APKs.
3. Verify signatures and basic metadata.
4. Publish APK assets only to `keyflow` Release.
5. Keep the release tag/name aligned with the APK version and signing level.
6. Keep `fcitx5-android` GitHub repo source-only.

## Formal Android Keystore

Use one long-lived release keystore for all public Android APK releases. Do not switch keys after users have installed a public build, or Android will treat later APKs as a different signer and block in-place upgrades.

### Local Secret Layout

Keep signing material under the workspace root:

- `.local-secrets/android-release/fcitx5-android-release.keystore`
- `.local-secrets/android-release/signing.env`
- `.local-secrets/android-release/keystore-metadata.json`
- `.local-secrets/android-release/keystore-fingerprint.txt`

This directory is gitignored on purpose.

### One-Time Generation

Generate the keystore once:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release\new-android-release-keystore.ps1
```

The script will:

- create a 4096-bit RSA keystore
- generate a strong random password
- save `SIGN_KEY_FILE`, `SIGN_KEY_ALIAS`, `SIGN_KEY_PWD` into `signing.env`
- record SHA-256 fingerprint and metadata for later verification

Current defaults are chosen to match the existing Gradle signing wiring:

- alias: `keyflow-android-release`
- same password for store and key
- store type: `PKCS12`

### Build With The Formal Keystore

Use the helper so Gradle always receives the same signing env:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release\build-fcitx5-android-release.ps1 -VersionName 0.1.3
```

The helper reads `.local-secrets/android-release/signing.env`, exports `SIGN_KEY_*` for the build process, adds `gettext` to `PATH` on Windows when available, and runs `:app:assembleRelease` in `fcitx5-android`.

### Publish The Android Release

After the formally signed APKs are built, publish them to `keyflow` with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release\publish-keyflow-android-release.ps1 -ApkVersion 0.1.3
```

The publisher script will:

- resolve GitHub auth from the existing git credential helper
- create or update the target GitHub Release by tag
- verify that all APKs have the same signer SHA-256 digest
- verify bundled Function Kits against the expected release set (`kit-store` + `shared` by default)
- write Android source metadata into the release note:
  - source repo URL
  - source commit URL
  - source archive URL
  - `LGPL-2.1-or-later`
- generate `SHA256SUMS.txt`
- upload all ABI APKs plus `SHA256SUMS.txt`

For the current fork, the Android APK source-of-truth is:

- repo: `https://github.com/hc-tec/fcitx5-android`
- license: `LGPL-2.1-or-later`

Do not present `keyflow`'s root `Apache-2.0` license as the APK license. The APK release note must point back to the Android fork and its LGPL terms.

For debug-signed test builds, switch the tag/release mode:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release\publish-keyflow-android-release.ps1 -ApkVersion 0.1.3 -SigningMode debug -PreRelease
```

### Export For CI Or Another Machine

If you later need GitHub Actions or another machine to use the same keystore, export the current env block:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release\export-android-signing-env.ps1 -Format dotenv
powershell -ExecutionPolicy Bypass -File .\scripts\release\export-android-signing-env.ps1 -Format powershell -IncludeBase64
```

`SIGN_KEY_BASE64` matches the env path already supported by the current Gradle build logic.

### Backup Rules

- Back up the keystore file and the password together before the first public release.
- Keep at least two encrypted backups outside the git workspace.
- Record the SHA-256 signer fingerprint wherever release operations are tracked.
- Never delete or rotate this keystore unless you are intentionally abandoning upgrade compatibility for `org.fcitx.fcitx5.android`.
