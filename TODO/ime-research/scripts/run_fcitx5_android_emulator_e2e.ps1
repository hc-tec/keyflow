param(
  [string]$RepoDir = "TODO/ime-research/repos/fcitx5-android",
  [string]$DeviceSerial = "emulator-5554",
  [string]$Abi = "x86_64",
  [string]$GradleTasks = ":app:assembleDebug :app:assembleDebugAndroidTest",
  [string]$TestClass = "org.fcitx.fcitx5.android.input.functionkit.FunctionKitImeEndToEndInstrumentationTest",
  [switch]$SkipBuild,
  [switch]$SkipUninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
  $scriptRoot = $PSScriptRoot
  if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
    $scriptRoot = (Get-Location).Path
  }
  $candidate = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($scriptRoot, "..", "..", ".."))
  return (Resolve-Path $candidate).Path
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Resolve-FirstFile([string]$Dir, [string]$Pattern) {
  $match = Get-ChildItem -Path $Dir -File -Filter $Pattern -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -eq $match) {
    throw "Expected file not found under $Dir (pattern=$Pattern)"
  }
  return $match.FullName
}

$workspaceRoot = Resolve-WorkspaceRoot
$repoAbs = (Resolve-Path (Join-Path $workspaceRoot $RepoDir)).Path

Write-Host "Workspace: $workspaceRoot"
Write-Host "Repo: $repoAbs"
Write-Host "Device: $DeviceSerial"
Write-Host "ABI: $Abi"

if (-not $SkipBuild) {
  $buildScript = Join-Path $workspaceRoot "TODO/ime-research/scripts/run_fcitx5_android_debug_local.ps1"
  Write-Host "Building: $GradleTasks"
  powershell -ExecutionPolicy Bypass -File $buildScript -RepoDir $RepoDir -Abi $Abi -GradleTasks $GradleTasks | Out-Host
}

$debugApkDir = Join-Path $repoAbs "app/build/outputs/apk/debug"
$testApkDir = Join-Path $repoAbs "app/build/outputs/apk/androidTest/debug"
$debugApk = Resolve-FirstFile $debugApkDir "*-$Abi-debug.apk"
$testApk = Resolve-FirstFile $testApkDir "*-debug-androidTest.apk"

$appPkg = "org.fcitx.fcitx5.android.debug"
$testPkg = "org.fcitx.fcitx5.android.debug.test"
$imeId = "$appPkg/org.fcitx.fcitx5.android.input.FcitxInputMethodService"

if (-not $SkipUninstall) {
  Write-Host "Uninstalling: $testPkg (ignore failures)"
  adb -s <DEVICE_SERIAL> uninstall $testPkg | Out-Null
  Write-Host "Uninstalling: $appPkg (ignore failures)"
  adb -s <DEVICE_SERIAL> uninstall $appPkg | Out-Null
}

Write-Host "Installing app: $debugApk"
adb -s <DEVICE_SERIAL> install --no-incremental -r -d $debugApk | Out-Host
Write-Host "Installing androidTest: $testApk"
adb -s <DEVICE_SERIAL> install --no-incremental -r -d -t $testApk | Out-Host

Write-Host "Enabling IME: $imeId"
adb -s <DEVICE_SERIAL> shell ime enable $imeId | Out-Host
adb -s <DEVICE_SERIAL> shell ime set $imeId | Out-Host

$artifactsDir = Join-Path $workspaceRoot "TODO/ime-research/artifacts/emulator"
Ensure-Dir $artifactsDir
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$resultPath = Join-Path $artifactsDir "instrument_$stamp.txt"
$logcatPath = Join-Path $artifactsDir "logcat_$stamp.txt"

Write-Host "Running instrumentation: $TestClass"
& adb -s <DEVICE_SERIAL> shell am instrument -w -r -e class $TestClass "$testPkg/androidx.test.runner.AndroidJUnitRunner" 2>&1 `
  | Tee-Object -FilePath $resultPath `
  | Out-Host

Write-Host "Capturing logcat: $logcatPath"
adb -s <DEVICE_SERIAL> logcat -d > $logcatPath

$rawOutput = Get-Content -Encoding UTF8 $resultPath -Raw
if ($rawOutput -match "FAILURES!!!") {
  throw "Instrumentation failed. See: $resultPath"
}

Write-Host "E2E OK. Result: $resultPath"

