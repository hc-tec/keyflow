param(
  [string]$RepoRoot = $(Resolve-Path (Join-Path $PSScriptRoot "..\\..")),
  [switch]$IncludeUntracked
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $RepoRoot

Write-Host "[oss] scanning for common secret patterns..." -ForegroundColor Cyan

$patterns = [ordered]@{
  "OpenAI-style key"        = "(?<![A-Za-z0-9])sk-[A-Za-z0-9]{20,}(?![A-Za-z0-9])"
  "GitHub PAT (classic)"    = "(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{30,}(?![A-Za-z0-9])"
  "GitHub PAT (fine-grain)" = "(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{20,}(?![A-Za-z0-9])"
  "Google API key"          = "(?<![A-Za-z0-9])AIza[0-9A-Za-z\\-_]{30,}(?![A-Za-z0-9])"
  "Slack token"             = "(?<![A-Za-z0-9])xox[baprs]-[0-9A-Za-z-]{10,}(?![A-Za-z0-9])"
  "AWS access key id"       = "(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])"
  "Private key header"      = "-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----"
}

$unionRegex = [regex]::new(($patterns.Values -join "|"), [System.Text.RegularExpressions.RegexOptions]::Compiled)

$files = @()
$files += git ls-files
if ($IncludeUntracked) {
  $files += git ls-files --others --exclude-standard
}

$binaryExt = @(
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
  ".pdf",
  ".zip", ".apk", ".jar",
  ".keystore", ".jks",
  ".so", ".dll", ".exe",
  ".ttf", ".otf", ".woff", ".woff2"
)

$hits = New-Object System.Collections.Generic.List[string]

foreach ($f in $files) {
  if (-not $f) { continue }
  $full = Join-Path $RepoRoot $f
  if (-not (Test-Path -LiteralPath $full)) { continue }

  $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
  if ($binaryExt -contains $ext) { continue }

  $raw = $null
  try {
    $raw = Get-Content -Encoding utf8 -LiteralPath $full -Raw
  } catch {
    continue
  }

  if (-not $unionRegex.IsMatch($raw)) {
    continue
  }

  foreach ($kv in $patterns.GetEnumerator()) {
    if ([regex]::IsMatch($raw, $kv.Value)) {
      $hits.Add(("{0}: {1}" -f $f, $kv.Key))
    }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "[oss] potential secrets detected (please review and redact):" -ForegroundColor Red
  $hits | Sort-Object -Unique | ForEach-Object { Write-Host ("- " + $_) }
  exit 1
}

Write-Host "[oss] OK: no matches in tracked files" -ForegroundColor Green
