param(
  [ValidateSet("build", "smoke", "contract", "run")]
  [string]$Mode = "build",
  [string]$SolutionPath = "TODO/ime-research/windows-testhost/WindowsImeTestHost.sln",
  [string]$ProjectPath = "TODO/ime-research/windows-testhost/WindowsImeTestHost/WindowsImeTestHost.csproj",
  [string]$Configuration = "Debug",
  [string]$LogPath = "",
  [string]$SnapshotPath = "",
  [string]$ContractResultPath = "",
  [string]$StartupFocus = "",
  [switch]$DisableFunctionKit,
  [string]$FunctionKitRoot = "",
  [string]$FunctionKitEntry = "",
  [string]$FunctionKitManifest = "",
  [string]$FunctionKitStorageFile = ""
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
  $LogPath = "TODO/ime-research/logs/${stamp}_windows_testhost_${Mode}.log"
}
$logAbs = Join-Path $workspaceRoot $LogPath
$exitAbs = [System.IO.Path]::ChangeExtension($logAbs, ".exitcode.txt")
Ensure-Dir (Split-Path -Parent $logAbs)

if ($Mode -eq "build") {
  Invoke-LoggedDotnetCommand -Arguments @("build", $solutionAbs, "-c", $Configuration, "--nologo") -ResolvedLogPath $logAbs -ResolvedExitPath $exitAbs
  Write-Host "Windows TestHost build succeeded. Log: $logAbs"
  return
}

Invoke-LoggedDotnetCommand -Arguments @("build", $solutionAbs, "-c", $Configuration, "--nologo") -ResolvedLogPath $logAbs -ResolvedExitPath $exitAbs

$appArgs = @()
if (-not [string]::IsNullOrWhiteSpace($StartupFocus)) {
  $appArgs += @("--startup-focus", $StartupFocus)
}
if ($DisableFunctionKit) {
  $appArgs += "--disable-function-kit"
}
if (-not [string]::IsNullOrWhiteSpace($FunctionKitRoot)) {
  $appArgs += @("--function-kit-root", (Join-Path $workspaceRoot $FunctionKitRoot))
}
if (-not [string]::IsNullOrWhiteSpace($FunctionKitEntry)) {
  $appArgs += @("--function-kit-entry", $FunctionKitEntry)
}
if (-not [string]::IsNullOrWhiteSpace($FunctionKitManifest)) {
  $appArgs += @("--function-kit-manifest", (Join-Path $workspaceRoot $FunctionKitManifest))
}
if (-not [string]::IsNullOrWhiteSpace($FunctionKitStorageFile)) {
  $appArgs += @("--function-kit-storage-file", (Join-Path $workspaceRoot $FunctionKitStorageFile))
}

if ($Mode -eq "smoke") {
  if ([string]::IsNullOrWhiteSpace($SnapshotPath)) {
    $SnapshotPath = "TODO/ime-research/logs/${stamp}_windows_testhost_smoke_snapshot.json"
  }

  $snapshotAbs = Join-Path $workspaceRoot $SnapshotPath
  Ensure-Dir (Split-Path -Parent $snapshotAbs)

  $smokeLogAbs = [System.IO.Path]::ChangeExtension($logAbs, ".smoke.log")
  $smokeExitAbs = [System.IO.Path]::ChangeExtension($smokeLogAbs, ".exitcode.txt")
  $smokeArgs = @(
    "run",
    "--project",
    $projectAbs,
    "-c",
    $Configuration,
    "--no-build",
    "--",
    "--smoke",
    "--snapshot-file",
    $snapshotAbs
  ) + $appArgs
  Invoke-LoggedDotnetCommand -Arguments $smokeArgs -ResolvedLogPath $smokeLogAbs -ResolvedExitPath $smokeExitAbs

  Write-Host "Windows TestHost smoke succeeded. Snapshot: $snapshotAbs"
  Write-Host "Smoke log: $smokeLogAbs"
  return
}

$contractMode = $Mode -eq "contract"
if ($contractMode) {
  if ([string]::IsNullOrWhiteSpace($StartupFocus)) {
    $StartupFocus = "single-line"
    $appArgs += @("--startup-focus", $StartupFocus)
  }

  if ([string]::IsNullOrWhiteSpace($SnapshotPath)) {
    $SnapshotPath = "TODO/ime-research/logs/${stamp}_windows_testhost_functionkit_contract_host_snapshot.json"
  }
  if ([string]::IsNullOrWhiteSpace($ContractResultPath)) {
    $ContractResultPath = "TODO/ime-research/logs/${stamp}_windows_testhost_functionkit_contract_result.json"
  }

  $snapshotAbs = Join-Path $workspaceRoot $SnapshotPath
  $contractResultAbs = Join-Path $workspaceRoot $ContractResultPath
  Ensure-Dir (Split-Path -Parent $snapshotAbs)
  Ensure-Dir (Split-Path -Parent $contractResultAbs)

  $contractLogAbs = [System.IO.Path]::ChangeExtension($logAbs, ".contract.log")
  $contractExitAbs = [System.IO.Path]::ChangeExtension($contractLogAbs, ".exitcode.txt")
  $contractArgs = @(
    "run",
    "--project",
    $projectAbs,
    "-c",
    $Configuration,
    "--no-build",
    "--",
    "--smoke",
    "--function-kit-contract-test",
    "--snapshot-file",
    $snapshotAbs,
    "--function-kit-contract-result-file",
    $contractResultAbs
  ) + $appArgs
  Invoke-LoggedDotnetCommand -Arguments $contractArgs -ResolvedLogPath $contractLogAbs -ResolvedExitPath $contractExitAbs

  Write-Host "Windows TestHost contract run succeeded. Result: $contractResultAbs"
  Write-Host "Host snapshot: $snapshotAbs"
  Write-Host "Contract log: $contractLogAbs"
  return
}

$runArgs = @(
  "run",
  "--project",
  $projectAbs,
  "-c",
  $Configuration,
  "--no-build",
  "--"
) + $appArgs
$process = Start-Process -FilePath "dotnet" -ArgumentList $runArgs -WorkingDirectory $workspaceRoot -PassThru

Set-Content -Path $logAbs -Encoding utf8 -Value "Started Windows TestHost PID=$($process.Id) at $(Get-Date -Format o)"
Set-Content -Path $exitAbs -Encoding ascii -Value 0
Write-Host "Windows TestHost started. PID: $($process.Id)"
