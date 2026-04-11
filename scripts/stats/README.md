# Stats Scripts

## GitHub Release Asset Downloads

Fetch `download_count` for GitHub release assets and write a JSON report:

```bash
node scripts/stats/fetch-github-release-downloads.mjs --repo hc-tec/keyflow --out tmp/stats/releases.json
```

Notes:

- Uses `GITHUB_TOKEN` (or `GH_TOKEN`) if present to avoid GitHub API rate limits.
- Defaults:
  - excludes draft releases
  - includes prereleases (use `--no-include-prereleases` to exclude)

