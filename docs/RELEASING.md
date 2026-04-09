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
