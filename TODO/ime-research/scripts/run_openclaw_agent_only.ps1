param(
  [string]$RepoDir = "TODO/ime-research/repos/openclaw",
  [ValidateSet("status", "smoke", "gateway")]
  [string]$Mode = "smoke",
  [string]$AgentId = "main",
  [string]$Message = "Reply with exact ASCII text OK only.",
  [switch]$FullBuild,
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [string]$LogPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-PathText([string]$PathText) {
  if ([string]::IsNullOrWhiteSpace($PathText)) {
    return $PathText
  }
  $fileSystemPrefix = "Microsoft.PowerShell.Core\FileSystem::"
  if ($PathText.StartsWith($fileSystemPrefix)) {
    $PathText = $PathText.Substring($fileSystemPrefix.Length)
  }
  if ($PathText.StartsWith("\\?\")) {
    return $PathText.Substring(4)
  }
  return $PathText
}

function Resolve-WorkspaceRoot {
  $scriptRoot = Normalize-PathText $PSScriptRoot
  if ([string]::IsNullOrWhiteSpace($scriptRoot) -and -not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
    $scriptRoot = Normalize-PathText (Split-Path -Parent $PSCommandPath)
  }
  if ([string]::IsNullOrWhiteSpace($scriptRoot) -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
    $scriptRoot = Normalize-PathText (Split-Path -Parent $MyInvocation.MyCommand.Path)
  }
  if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
    $scriptRoot = Normalize-PathText ((Get-Location).Path)
  }

  $workspaceCandidate = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($scriptRoot, "..", "..", ".."))
  return (Resolve-Path $workspaceCandidate).Path
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Assert-NodeVersion {
  $raw = (& node --version).Trim()
  if (-not $raw.StartsWith("v")) {
    throw "Unrecognized node version: $raw"
  }
  $parts = $raw.TrimStart("v").Split(".")
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  if (-not (($major -gt 22) -or ($major -eq 22 -and $minor -ge 16))) {
    throw "OpenClaw requires Node >= 22.16 or 24.x. Current version: $raw"
  }
}

function Invoke-PnpmCommand {
  param(
    [string[]]$Arguments,
    [string]$ResolvedLogPath,
    [string]$ResolvedExitPath
  )

  if ([string]::IsNullOrWhiteSpace($ResolvedLogPath)) {
    & pnpm @Arguments
    return $LASTEXITCODE
  }

  $commandOutput = & pnpm @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $rendered = ($commandOutput | Out-String).TrimEnd()
  Set-Content -Path $ResolvedLogPath -Encoding utf8 -Value $rendered
  Set-Content -Path $ResolvedExitPath -Encoding ascii -Value $exitCode
  if (-not [string]::IsNullOrWhiteSpace($rendered)) {
    Write-Host $rendered
  }
  return $exitCode
}

function Invoke-OpenClawCliCommand {
  param(
    [string[]]$Arguments,
    [string]$ResolvedLogPath,
    [string]$ResolvedExitPath
  )

  $runnerArgs = @("scripts/run-node.mjs") + $Arguments

  if ([string]::IsNullOrWhiteSpace($ResolvedLogPath)) {
    & node @runnerArgs
    return $LASTEXITCODE
  }

  $commandOutput = & node @runnerArgs 2>&1
  $exitCode = $LASTEXITCODE
  $rendered = ($commandOutput | Out-String).TrimEnd()
  Set-Content -Path $ResolvedLogPath -Encoding utf8 -Value $rendered
  Set-Content -Path $ResolvedExitPath -Encoding ascii -Value $exitCode
  if (-not [string]::IsNullOrWhiteSpace($rendered)) {
    Write-Host $rendered
  }
  return $exitCode
}

$workspaceRoot = Resolve-WorkspaceRoot
$repoAbs = Normalize-PathText ((Resolve-Path (Join-Path $workspaceRoot $RepoDir)).Path)
$resolvedLogPath = ""
$resolvedExitPath = ""

if (-not [string]::IsNullOrWhiteSpace($LogPath)) {
  $resolvedLogPath = Join-Path $workspaceRoot $LogPath
  Ensure-Dir (Split-Path -Parent $resolvedLogPath)
  $resolvedExitPath = [System.IO.Path]::ChangeExtension($resolvedLogPath, ".exitcode.txt")
}

Assert-Command "node"
Assert-Command "pnpm"
Assert-NodeVersion

Push-Location $repoAbs
try {
  if (-not $SkipInstall) {
    & pnpm install
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm install failed"
    }
  }

  if ($FullBuild -and -not $SkipBuild) {
    & pnpm build
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm build failed"
    }
  }

  switch ($Mode) {
    "status" {
      $exitCode = Invoke-OpenClawCliCommand -Arguments @("models", "status", "--agent", $AgentId, "--json") -ResolvedLogPath $resolvedLogPath -ResolvedExitPath $resolvedExitPath
    }
    "smoke" {
      $exitCode = Invoke-OpenClawCliCommand -Arguments @("agent", "--local", "--agent", $AgentId, "--message", $Message, "--thinking", "low", "--json") -ResolvedLogPath $resolvedLogPath -ResolvedExitPath $resolvedExitPath
    }
    "gateway" {
      $env:OPENCLAW_SKIP_CHANNELS = "1"
      $env:CLAWDBOT_SKIP_CHANNELS = "1"
      $exitCode = Invoke-OpenClawCliCommand -Arguments @("gateway", "run", "--allow-unconfigured", "--force") -ResolvedLogPath $resolvedLogPath -ResolvedExitPath $resolvedExitPath
    }
  }

  if ($exitCode -ne 0) {
    throw "OpenClaw mode '$Mode' failed"
  }
}
finally {
  Pop-Location
}
