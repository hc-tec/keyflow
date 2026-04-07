param(
  [ValidateSet("build", "smoke", "run")]
  [string]$Mode = "build",
  [string]$SolutionPath = "TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost.sln",
  [string]$ProjectPath = "TODO/ime-research/windows-functionkit-host/WindowsFunctionKitHost/WindowsFunctionKitHost.csproj",
  [string]$Configuration = "Debug",
  [string]$LogPath = "",
  [string]$SnapshotPath = "",
  [string]$HostServiceBaseUrl = "http://127.0.0.1:18789"
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

function Invoke-LoggedDotnetCommand(
  [string[]]$Arguments,
  [string]$ResolvedLogPath,
  [string]$ResolvedExitPath
) {
  Set-Content -Path $ResolvedLogPath -Encoding utf8 -Value ""
  & dotnet @Arguments 2>&1 | Tee-Object -FilePath $ResolvedLogPath
  $exitCode = $LASTEXITCODE
  Set-Content -Path $ResolvedExitPath -Encoding ascii -Value $exitCode
  if ($exitCode -ne 0) {
    throw "dotnet command failed (exit code: $exitCode), see $ResolvedLogPath"
  }
}

$workspaceRoot = Resolve-WorkspaceRoot
$solutionAbs = Join-Path $workspaceRoot $SolutionPath
$projectAbs = Join-Path $workspaceRoot $ProjectPath

if (-not (Test-Path $solutionAbs)) {
  throw "Missing solution: $solutionAbs"
}
if (-not (Test-Path $projectAbs)) {
  throw "Missing project: $projectAbs"
}

$stamp = Get-Date -Format "yyyyMMdd"
if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = "TODO/ime-research/logs/${stamp}_windows_functionkit_host_${Mode}.log"
}
$logAbs = Join-Path $workspaceRoot $LogPath
$exitAbs = [System.IO.Path]::ChangeExtension($logAbs, ".exitcode.txt")
Ensure-Dir (Split-Path -Parent $logAbs)

Invoke-LoggedDotnetCommand -Arguments @("build", $solutionAbs, "-c", $Configuration, "--nologo") -ResolvedLogPath $logAbs -ResolvedExitPath $exitAbs

if ($Mode -eq "build") {
  Write-Host "Windows Function Kit Host build succeeded. Log: $logAbs"
  return
}

if ($Mode -eq "smoke") {
  if ([string]::IsNullOrWhiteSpace($SnapshotPath)) {
    $SnapshotPath = "TODO/ime-research/logs/${stamp}_windows_functionkit_host_smoke_snapshot.json"
  }

  $snapshotAbs = Join-Path $workspaceRoot $SnapshotPath
  Ensure-Dir (Split-Path -Parent $snapshotAbs)

  $smokeLogAbs = [System.IO.Path]::ChangeExtension($logAbs, ".smoke.log")
  $smokeExitAbs = [System.IO.Path]::ChangeExtension($smokeLogAbs, ".exitcode.txt")
  Invoke-LoggedDotnetCommand -Arguments @(
    "run",
    "--project",
    $projectAbs,
    "-c",
    $Configuration,
    "--no-build",
    "--",
    "--workspace-root",
    $workspaceRoot,
    "--smoke",
    "--preview-only",
    "--host-service-base-url",
    $HostServiceBaseUrl,
    "--snapshot-file",
    $SnapshotPath
  ) -ResolvedLogPath $smokeLogAbs -ResolvedExitPath $smokeExitAbs

  Write-Host "Windows Function Kit Host smoke succeeded. Snapshot: $snapshotAbs"
  Write-Host "Smoke log: $smokeLogAbs"
  return
}

$process = Start-Process -FilePath "dotnet" -ArgumentList @(
  "run",
  "--project",
  $projectAbs,
  "-c",
  $Configuration,
  "--no-build",
  "--",
  "--workspace-root",
  $workspaceRoot,
  "--host-service-base-url",
  $HostServiceBaseUrl
) -WorkingDirectory $workspaceRoot -PassThru

Set-Content -Path $logAbs -Encoding utf8 -Value "Started Windows Function Kit Host PID=$($process.Id) at $(Get-Date -Format o)"
Set-Content -Path $exitAbs -Encoding ascii -Value 0
Write-Host "Windows Function Kit Host started. PID: $($process.Id)"
