param(
  [string]$RepoDir = "TODO/ime-research/repos/fcitx5-android",
  [Parameter(Mandatory = $true)]
  [string]$Serial,
  [string]$Abi = "arm64-v8a",
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

function Format-Command([string]$Command, [string[]]$Arguments) {
  $parts = @($Command)
  foreach ($argument in $Arguments) {
    if ($argument -match '\s') {
      $escaped = $argument.Replace('"', '\"')
      $parts += '"' + $escaped + '"'
    } else {
      $parts += $argument
    }
  }
  return ($parts -join " ")
}

function Invoke-LoggedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$Arguments = @(),
    [string]$OutputPath = "",
    [switch]$AllowFailure
  )

  $commandText = Format-Command -Command $Command -Arguments $Arguments
  Add-Content -Path $script:CommandsPath -Value $commandText -Encoding Ascii
  Write-Host ">> $commandText"

  # Native apps that write to stderr produce PowerShell error records, which would terminate under
  # $ErrorActionPreference = Stop. We treat stderr as log output and decide failure by exit code.
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $Command @Arguments 2>&1 | ForEach-Object { $_.ToString() }
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $exitCode = $LASTEXITCODE

  if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $output | Tee-Object -FilePath $OutputPath | Out-Host
  } else {
    $output | Out-Host
  }

  if (-not $AllowFailure -and $exitCode -ne 0) {
    throw "Command failed with exit code ${exitCode}: $commandText"
  }

  return [pscustomobject]@{
    Output = $output
    ExitCode = $exitCode
  }
}

function Start-LogcatCapture {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DeviceSerial,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
  )

  $writer = New-Object System.IO.StreamWriter($OutputPath, $false, [System.Text.UTF8Encoding]::new($false))
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "adb"
  $psi.Arguments = "-s $DeviceSerial logcat -v threadtime"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi

  $handler = [System.Diagnostics.DataReceivedEventHandler]{
    param($sender, $eventArgs)
    if ($null -ne $eventArgs.Data) {
      $writer.WriteLine($eventArgs.Data)
      $writer.Flush()
    }
  }

  $process.add_OutputDataReceived($handler)
  $process.add_ErrorDataReceived($handler)

  if (-not $process.Start()) {
    $writer.Dispose()
    throw "Failed to start adb logcat process."
  }

  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()

  return [pscustomobject]@{
    Process = $process
    Writer = $writer
  }
}

function Stop-LogcatCapture($Capture) {
  if ($null -eq $Capture) {
    return
  }

  try {
    if ($Capture.Process -and -not $Capture.Process.HasExited) {
      $Capture.Process.Kill()
      [void]$Capture.Process.WaitForExit(5000)
    }
  } catch {
    Write-Warning "Stopping logcat capture failed: $($_.Exception.Message)"
  } finally {
    if ($Capture.Writer) {
      $Capture.Writer.Dispose()
    }
  }
}

$workspaceRoot = Resolve-WorkspaceRoot
$repoAbs = (Resolve-Path (Join-Path $workspaceRoot $RepoDir)).Path

$appPkg = "org.fcitx.fcitx5.android.debug"
$testPkg = "org.fcitx.fcitx5.android.debug.test"
$runner = "$testPkg/androidx.test.runner.AndroidJUnitRunner"
$imeId = "$appPkg/org.fcitx.fcitx5.android.input.FcitxInputMethodService"
$playgroundComponent = "$appPkg/org.fcitx.fcitx5.android.input.functionkit.FunctionKitImeE2EPlaygroundActivity"

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$artifactsDir = Join-Path $workspaceRoot "TODO/ime-research/artifacts/device/$stamp"
Ensure-Dir $artifactsDir

$script:CommandsPath = Join-Path $artifactsDir "commands.txt"
New-Item -ItemType File -Path $script:CommandsPath -Force | Out-Null

$sessionInfoPath = Join-Path $artifactsDir "session.txt"
@(
  "timestamp=$stamp"
  "repo=$repoAbs"
  "serial=$Serial"
  "abi=$Abi"
  "appPkg=$appPkg"
  "testPkg=$testPkg"
  "imeId=$imeId"
  "playgroundComponent=$playgroundComponent"
  "testClass=$TestClass"
) | Set-Content -Path $sessionInfoPath -Encoding Ascii

Write-Host "Workspace: $workspaceRoot"
Write-Host "Repo: $repoAbs"
Write-Host "Serial: $Serial"
Write-Host "ABI: $Abi"
Write-Host "Artifacts: $artifactsDir"

if (-not $SkipBuild) {
  $buildScript = Join-Path $workspaceRoot "TODO/ime-research/scripts/run_fcitx5_android_debug_local.ps1"
  $buildLogRelativePath = "TODO/ime-research/artifacts/device/$stamp/build.txt"
  $buildCommand = Format-Command -Command "powershell" -Arguments @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $buildScript,
    "-RepoDir",
    $RepoDir,
    "-Abi",
    $Abi,
    "-GradleTasks",
    $GradleTasks,
    "-LogPath",
    $buildLogRelativePath
  )
  Add-Content -Path $script:CommandsPath -Value $buildCommand -Encoding Ascii
  Write-Host ">> $buildCommand"
  powershell -ExecutionPolicy Bypass -File $buildScript -RepoDir $RepoDir -Abi $Abi -GradleTasks $GradleTasks -LogPath $buildLogRelativePath | Out-Host
}

$debugApkDir = Join-Path $repoAbs "app/build/outputs/apk/debug"
$testApkDir = Join-Path $repoAbs "app/build/outputs/apk/androidTest/debug"
$debugApk = Resolve-FirstFile -Dir $debugApkDir -Pattern "*-$Abi-debug.apk"
$testApk = Resolve-FirstFile -Dir $testApkDir -Pattern "*-debug-androidTest.apk"

$installAppPath = Join-Path $artifactsDir "install_app.txt"
$installTestPath = Join-Path $artifactsDir "install_androidTest.txt"
$imeEnablePath = Join-Path $artifactsDir "ime_enable.txt"
$imeSetPath = Join-Path $artifactsDir "ime_set.txt"
$launchPath = Join-Path $artifactsDir "launch_playground.txt"
$instrumentationPath = Join-Path $artifactsDir "instrumentation.txt"
$logcatPath = Join-Path $artifactsDir "logcat.txt"
$logcatDumpPath = Join-Path $artifactsDir "logcat_dump.txt"

$logcatCapture = $null

try {
  Invoke-LoggedCommand -Command "adb" -Arguments @("-s", $Serial, "wait-for-device") | Out-Null

  if (-not $SkipUninstall) {
    Invoke-LoggedCommand -Command "adb" -Arguments @("-s", $Serial, "uninstall", $testPkg) -AllowFailure | Out-Null
    Invoke-LoggedCommand -Command "adb" -Arguments @("-s", $Serial, "uninstall", $appPkg) -AllowFailure | Out-Null
  }

  Invoke-LoggedCommand -Command "adb" -Arguments @("-s", $Serial, "install", "--no-incremental", "-r", "-d", $debugApk) -OutputPath $installAppPath | Out-Null
  Invoke-LoggedCommand -Command "adb" -Arguments @("-s", $Serial, "install", "--no-incremental", "-r", "-d", "-t", $testApk) -OutputPath $installTestPath | Out-Null

  Invoke-LoggedCommand -Command "adb" -Arguments @("-s", $Serial, "logcat", "-c") | Out-Null
  $logcatCapture = Start-LogcatCapture -DeviceSerial $Serial -OutputPath $logcatPath

  Invoke-LoggedCommand -Command "adb" -Arguments @("-s", $Serial, "shell", "ime", "enable", $imeId) -OutputPath $imeEnablePath | Out-Null
  Invoke-LoggedCommand -Command "adb" -Arguments @("-s", $Serial, "shell", "ime", "set", $imeId) -OutputPath $imeSetPath | Out-Null
  Invoke-LoggedCommand -Command "adb" -Arguments @("-s", $Serial, "shell", "am", "start", "-W", "-n", $playgroundComponent) -OutputPath $launchPath -AllowFailure | Out-Null

  $instrumentationArgs = @(
    "-s",
    $Serial,
    "shell",
    "am",
    "instrument",
    "-w",
    "-r",
    "-e",
    "class",
    $TestClass,
    $runner
  )
  $instrumentationCommand = Format-Command -Command "adb" -Arguments $instrumentationArgs
  Add-Content -Path $script:CommandsPath -Value $instrumentationCommand -Encoding Ascii
  Write-Host ">> $instrumentationCommand"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & adb @instrumentationArgs 2>&1 `
      | ForEach-Object { $_.ToString() } `
      | Tee-Object -FilePath $instrumentationPath `
      | Out-Host
    $instrumentExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($instrumentExitCode -ne 0) {
    throw "Instrumentation command failed with exit code ${instrumentExitCode}. See $instrumentationPath"
  }

  Invoke-LoggedCommand -Command "adb" -Arguments @("-s", $Serial, "logcat", "-d") -OutputPath $logcatDumpPath | Out-Null

  $rawInstrumentation = Get-Content -Encoding UTF8 $instrumentationPath -Raw
  if ($rawInstrumentation -match "FAILURES!!!") {
    throw "Instrumentation failed. See $instrumentationPath"
  }
} finally {
  Stop-LogcatCapture -Capture $logcatCapture
}

Write-Host "Device E2E OK. Artifacts: $artifactsDir"
