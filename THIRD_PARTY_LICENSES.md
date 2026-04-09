# Third-Party And Separate Licenses

This repository uses `Apache-2.0` as its default top-level license for `keyflow` code and documentation, unless a file or subproject says otherwise.

This document clarifies the main exceptions and separately licensed materials that matter for distribution.

## Android APK Releases

Android APK artifacts published from `keyflow` GitHub Releases are **not** licensed under this repository's root `Apache-2.0` license.

They are built from the Android host source repository below and remain under that project's license:

- source repo: `https://github.com/hc-tec/fcitx5-android`
- Android package name: `io.github.hctec.keyflow`
- license: `LGPL-2.1-or-later`

For release-specific source links and commit links, see:

- `docs/RELEASING.md`
- `scripts/release/publish-keyflow-android-release.ps1`

## Vendored Assets

### petite-vue

Vendored copies of `petite-vue` are included here:

- `TODO/function-kits/shared/vendor/petite-vue/petite-vue.iife.js`
- `templates/function-kit-template-petite-vue/workspace/function-kits/starter-showcase/ui/vendor/petite-vue.iife.js`

License:

- `MIT`
- copyright: `Copyright (c) 2021-present, Yuxi (Evan) You`
- local license file: `TODO/function-kits/shared/vendor/petite-vue/LICENSE`

### shadcn-style CSS Baseline

This repository includes a local CSS baseline inspired by `shadcn/ui` token values and visual conventions:

- `TODO/function-kits/shared/ui/kit-shadcn.css`
- `templates/function-kit-template-petite-vue/workspace/function-kits/starter-showcase/ui/vendor/kit-shadcn.css`

This is **not** a vendored copy of the official `shadcn/ui` React component source. It is a repository-maintained CSS layer that references the upstream token source in comments.

Upstream project referenced for token provenance:

- project: `https://github.com/shadcn-ui/ui`
- upstream license: `MIT`

## Notes

- `TODO/ime-research/repos/` contains local research clones and forks; it is not part of the tracked contents of this repository unless specific files are copied into version control elsewhere.
- If a subdirectory ships its own `LICENSE`, `package.json` `license`, or SPDX header, treat that more specific declaration as authoritative for that material.
