param(
  # Replace internal-only values before publishing a public repo.
  [string]$RepoRoot = $(Resolve-Path (Join-Path $PSScriptRoot "..\\..")),
  [string]$WorkspaceRootPlaceholder = "<WORKSPACE_ROOT>",
  [string]$DevicePlaceholder = "<DEVICE_SERIAL>",
  [string]$HostPortPlaceholder = "<HOST:PORT>"
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $RepoRoot

Write-Host "[oss] redact: scanning tracked text files..." -ForegroundColor Cyan

$repoRootResolved = (Resolve-Path -LiteralPath $RepoRoot).Path
$repoRootLongPath = "\\?\\" + $repoRootResolved
$repoRootForward = $repoRootResolved.Replace('\', '/')
$repoRootLongForward = $repoRootLongPath.Replace('\', '/')
$repoRootEscaped2 = $repoRootResolved.Replace('\', '\\')
$repoRootEscaped4 = $repoRootEscaped2.Replace('\', '\\')

$files = git ls-files
$updated = 0

foreach ($f in $files) {
  # Avoid self-corruption (this script contains patterns like "adb -s ...").
  if ($f -ieq "scripts/oss/redact-private.ps1") {
    continue
  }

  # Best-effort text-only redaction: skip common binary formats.
  if ($f -match "\\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|apk|jar|keystore|jks)$") {
    continue
  }

  $path = Join-Path $RepoRoot $f
  if (-not (Test-Path -LiteralPath $path)) {
    continue
  }

  try {
    $raw = Get-Content -Encoding utf8 -LiteralPath $path -Raw
  } catch {
    continue
  }

  $new = $raw

  # 1) Local absolute paths (Windows / POSIX-style)
  $new = $new.Replace($repoRootLongPath, $WorkspaceRootPlaceholder)
  $new = $new.Replace($repoRootLongForward, $WorkspaceRootPlaceholder)
  $new = $new.Replace($repoRootResolved, $WorkspaceRootPlaceholder)
  $new = $new.Replace($repoRootForward, $WorkspaceRootPlaceholder)
  $new = $new.Replace($repoRootEscaped2, $WorkspaceRootPlaceholder)
  $new = $new.Replace($repoRootEscaped4, $WorkspaceRootPlaceholder)
  $new = [regex]::Replace($new, '(?i)\b[A-Z]:\\Users\\[^\\/\s`"''`]+', '<USER_HOME>')
  $new = [regex]::Replace($new, '\b(?:/Users|/home)/[^/\s`"''`]+', '<USER_HOME>')

  # 2) ADB device identifiers in commands
  #    - adb -s <serial> ...
  #    - adb connect <host:port>
  $new = [regex]::Replace($new, '\badb\s+-s\s+[^\s"''`)]+', "adb -s $DevicePlaceholder")
  $new = [regex]::Replace($new, '\badb\s+connect\s+[^\s"''`)]+', "adb connect $DevicePlaceholder")

  # 3) Remaining IP:PORT strings (keep localhost / bind-all examples)
  $new = [regex]::Replace(
    $new,
    '(?<!\d)(?<host>(?:\d{1,3}\.){3}\d{1,3}):(?<port>\d{2,5})(?!\d)',
    {
      param($m)
      $matchedHost = $m.Groups["host"].Value
      $matchedPort = $m.Groups["port"].Value
      if ($matchedHost -eq "127.0.0.1" -or $matchedHost -eq "0.0.0.0") { return $m.Value }
      if ($matchedPort -eq "5555") { return $DevicePlaceholder }
      return $HostPortPlaceholder
    }
  )

  if ($new -ne $raw) {
    Set-Content -Encoding utf8 -LiteralPath $path -Value $new
    $updated++
    Write-Host "[oss] redacted: $f" -ForegroundColor Yellow
  }
}

Write-Host "[oss] done: updated $updated file(s)" -ForegroundColor Green
