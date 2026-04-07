param(
  [ValidateSet("build", "run")]
  [string]$Mode = "build",
  [string]$SolutionPath = "TODO/ime-research/windows-testhost/WindowsImeTestHost.sln",
  [string]$AutomationProjectPath = "TODO/ime-research/windows-testhost/WindowsImeTestHost.Automation/WindowsImeTestHost.Automation.csproj",
  [string]$AutomationExePath = "TODO/ime-research/windows-testhost/WindowsImeTestHost.Automation/bin/Debug/net9.0-windows/WindowsImeTestHost.Automation.exe",
  [string]$TestHostExePath = "TODO/ime-research/windows-testhost/WindowsImeTestHost/bin/Debug/net9.0-windows/WindowsImeTestHost.exe",
  [string]$Configuration = "Debug",
  [string]$Pinyin = "nihao",
  [string]$ExpectedText = "你好",
  [string]$LogPath = "",
  [string]$ResultPath = "",
  [switch]$SkipInstallValidation,
  [switch]$SkipDefaultImeApply,
  [switch]$NoRestoreIme
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
  & dotnet @Arguments 2>&1 | Tee-Object -FilePath $ResolvedLogPath -Append
  $exitCode = $LASTEXITCODE
  Set-Content -Path $ResolvedExitPath -Encoding ascii -Value $exitCode
  if ($exitCode -ne 0) {
    throw "dotnet command failed (exit code: $exitCode), see $ResolvedLogPath"
  }
}

function Invoke-LoggedPowershellFile(
  [string]$ScriptPath,
  [string[]]$Arguments,
  [string]$ResolvedLogPath
) {
  Add-Content -Path $ResolvedLogPath -Encoding utf8 -Value ""
  Add-Content -Path $ResolvedLogPath -Encoding utf8 -Value ("`n--- powershell -ExecutionPolicy Bypass -File {0} {1}" -f $ScriptPath, ($Arguments -join " "))
  & powershell -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1 | Tee-Object -FilePath $ResolvedLogPath -Append
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "powershell script failed (exit code: $exitCode): $ScriptPath"
  }
}

$workspaceRoot = Resolve-WorkspaceRoot
$solutionAbs = Join-Path $workspaceRoot $SolutionPath
$automationProjectAbs = Join-Path $workspaceRoot $AutomationProjectPath
$automationExeAbs = Join-Path $workspaceRoot $AutomationExePath
$testHostExeAbs = Join-Path $workspaceRoot $TestHostExePath

if (-not (Test-Path $solutionAbs)) {
  throw "Missing solution: $solutionAbs"
}
if (-not (Test-Path $automationProjectAbs)) {
  throw "Missing automation project: $automationProjectAbs"
}

$stamp = Get-Date -Format "yyyyMMdd"
if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = "TODO/ime-research/logs/${stamp}_windows_ime_e2e_${Mode}.log"
}
if ([string]::IsNullOrWhiteSpace($ResultPath)) {
  $ResultPath = "TODO/ime-research/logs/${stamp}_windows_ime_e2e_result.json"
}

$logAbs = Join-Path $workspaceRoot $LogPath
$resultAbs = Join-Path $workspaceRoot $ResultPath
$exitAbs = [System.IO.Path]::ChangeExtension($logAbs, ".exitcode.txt")
Ensure-Dir (Split-Path -Parent $logAbs)
Ensure-Dir (Split-Path -Parent $resultAbs)

$verifyScriptAbs = Join-Path $workspaceRoot "TODO/ime-research/scripts/verify_rime_weasel_install.ps1"
$defaultImeScriptAbs = Join-Path $workspaceRoot "TODO/ime-research/scripts/set_windows_default_ime.ps1"
$verifyJsonRel = "TODO/ime-research/logs/${stamp}_windows_ime_e2e_install_validation.json"
$applyJsonRel = "TODO/ime-research/logs/${stamp}_windows_ime_e2e_apply_weasel.json"
$restoreJsonRel = "TODO/ime-research/logs/${stamp}_windows_ime_e2e_restore_default.json"
$defaultImeApplied = $false

try {
  Invoke-LoggedDotnetCommand -Arguments @("build", $solutionAbs, "-c", $Configuration, "--nologo") -ResolvedLogPath $logAbs -ResolvedExitPath $exitAbs

  if ($Mode -eq "build") {
    Write-Host "Windows IME E2E build succeeded. Log: $logAbs"
    return
  }

  if (-not $SkipInstallValidation) {
    Invoke-LoggedPowershellFile -ScriptPath $verifyScriptAbs -Arguments @(
      "-JsonPath", $verifyJsonRel,
      "-LogPath", ([System.IO.Path]::ChangeExtension($verifyJsonRel, ".log"))
    ) -ResolvedLogPath $logAbs
  }

  if (-not $SkipDefaultImeApply) {
    Invoke-LoggedPowershellFile -ScriptPath $defaultImeScriptAbs -Arguments @(
      "-Mode", "apply",
      "-LogPath", $applyJsonRel
    ) -ResolvedLogPath $logAbs
    $defaultImeApplied = $true
  }

  if ($ExpectedText -ne "你好") {
    throw "run_windows_ime_e2e.ps1 currently fixes the expected text to the automation runner default `你好` to avoid PowerShell argv encoding issues. Extend the runner before overriding -ExpectedText."
  }

  Get-Process -Name "WindowsImeTestHost" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

  if (-not (Test-Path $automationExeAbs)) {
    throw "Missing automation executable after build: $automationExeAbs"
  }

  Add-Content -Path $logAbs -Encoding utf8 -Value ("`n--- " + $automationExeAbs)
  $automationProcess = Start-Process -FilePath $automationExeAbs -ArgumentList @(
    "--testhost-exe", $testHostExeAbs,
    "--result-file", $resultAbs,
    "--pinyin", $Pinyin
  ) -PassThru -Wait
  $exitCode = $automationProcess.ExitCode
  Set-Content -Path $exitAbs -Encoding ascii -Value $exitCode
  if ($exitCode -ne 0) {
    throw "automation executable failed (exit code: $exitCode), see $resultAbs and $logAbs"
  }

  Write-Host "Windows IME E2E completed. Result: $resultAbs"
  Write-Host "Log: $logAbs"
}
finally {
  if ($Mode -eq "run" -and $defaultImeApplied -and -not $NoRestoreIme) {
    try {
      Invoke-LoggedPowershellFile -ScriptPath $defaultImeScriptAbs -Arguments @(
        "-Mode", "restore",
        "-RestoreLogPath", $applyJsonRel,
        "-LogPath", $restoreJsonRel
      ) -ResolvedLogPath $logAbs
    }
    catch {
      Add-Content -Path $logAbs -Encoding utf8 -Value ("`nWARN restore default IME failed: " + $_.Exception.Message)
    }
  }
}
