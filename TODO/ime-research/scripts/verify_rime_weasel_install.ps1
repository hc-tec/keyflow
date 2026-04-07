param(
  [string]$InstallerPath = "",
  [string]$InstallRoot = "",
  [switch]$RunInstall,
  [string]$SilentArgs = "/S",
  [int]$InstallSettleSeconds = 15,
  [bool]$StopServerAfterInstall = $true,
  [bool]$RestartServerAfterValidation = $false,
  [string]$LogPath = "",
  [string]$JsonPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tipGuid = "{A3F4CDED-B1E9-41EE-9CA6-7B4D0DE6CB0A}"
$profileGuid = "{3D02CAB6-2B8E-4781-BA20-1C9267529467}"
$weaselInputTip = "0804:{A3F4CDED-B1E9-41EE-9CA6-7B4D0DE6CB0A}{3D02CAB6-2B8E-4781-BA20-1C9267529467}"

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

function Normalize-AbsolutePath([string]$Path) {
  return ([System.IO.Path]::GetFullPath((Resolve-Path $Path).Path)).TrimEnd('\')
}

function Resolve-LatestInstaller([string]$WorkspaceRoot) {
  $archivesDir = Join-Path $WorkspaceRoot "TODO\\ime-research\\repos\\rime-weasel\\output\\archives"
  if (-not (Test-Path $archivesDir)) {
    throw "Missing archives directory: $archivesDir"
  }

  $candidate = Get-ChildItem -Path $archivesDir -Filter "weasel-*-installer.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $candidate) {
    throw "No rime-weasel installer found under $archivesDir"
  }

  return $candidate.FullName
}

function Get-RegistryHive([Microsoft.Win32.RegistryHive]$Hive, [Microsoft.Win32.RegistryView]$View, [string]$SubKey) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($Hive, $View)
  return $base.OpenSubKey($SubKey)
}

function Get-RegistrySnapshot([Microsoft.Win32.RegistryHive]$Hive, [Microsoft.Win32.RegistryView]$View, [string]$SubKey) {
  $viewName = $View.ToString()
  $key = Get-RegistryHive -Hive $Hive -View $View -SubKey $SubKey
  if ($null -eq $key) {
    return [pscustomobject]@{
      exists = $false
      hive = $Hive.ToString()
      view = $viewName
      sub_key = $SubKey
      values = @{}
      sub_keys = @()
    }
  }

  $values = [ordered]@{}
  foreach ($name in $key.GetValueNames()) {
    $valueName = if ([string]::IsNullOrEmpty($name)) { "(Default)" } else { $name }
    $values[$valueName] = $key.GetValue($name)
  }

  return [pscustomobject]@{
    exists = $true
    hive = $Hive.ToString()
    view = $viewName
    sub_key = $SubKey
    values = $values
    sub_keys = @($key.GetSubKeyNames())
  }
}

function Get-RegistryValueText([pscustomobject]$Snapshot, [string]$Name) {
  if (-not $Snapshot.exists) {
    return ""
  }
  if ($Snapshot.values.Contains($Name)) {
    return [string]$Snapshot.values[$Name]
  }
  return ""
}

function Resolve-InstallRoot([string]$ExplicitInstallRoot, [pscustomobject]$Config32, [pscustomobject]$Config64) {
  if (-not [string]::IsNullOrWhiteSpace($ExplicitInstallRoot)) {
    if (-not (Test-Path $ExplicitInstallRoot)) {
      throw "InstallRoot does not exist: $ExplicitInstallRoot"
    }
    return (Normalize-AbsolutePath $ExplicitInstallRoot)
  }

  foreach ($snapshot in @($Config64, $Config32)) {
    $value = Get-RegistryValueText -Snapshot $snapshot -Name "WeaselRoot"
    if (-not [string]::IsNullOrWhiteSpace($value) -and (Test-Path $value)) {
      return (Normalize-AbsolutePath $value)
    }
  }

  $candidate = Get-ChildItem -Path "C:\\Program Files\\Rime" -Directory -Filter "weasel-*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($candidate) {
    return $candidate.FullName.TrimEnd('\')
  }

  return ""
}

function Stop-WeaselServer {
  $stopped = New-Object System.Collections.Generic.List[int]
  $processes = @(Get-Process -Name "WeaselServer" -ErrorAction SilentlyContinue)
  foreach ($process in $processes) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
      $stopped.Add($process.Id)
    }
    catch {
      Write-Warning "Failed to stop WeaselServer PID $($process.Id): $($_.Exception.Message)"
    }
  }
  return @($stopped)
}

function Get-FileSnapshot([string]$Path) {
  $exists = [System.IO.File]::Exists($Path)
  if (-not $exists) {
    return [pscustomobject]@{
      path = $Path
      exists = $false
      length = 0
      last_write_time = $null
    }
  }

  $item = Get-Item $Path
  return [pscustomobject]@{
    path = $item.FullName
    exists = $true
    length = $item.Length
    last_write_time = $item.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:sszzz")
  }
}

function Get-WinUserLanguageSnapshot {
  $languageRows = New-Object System.Collections.Generic.List[object]
  try {
    $languageList = Get-WinUserLanguageList
    foreach ($language in $languageList) {
      $languageRows.Add([pscustomobject]@{
        language_tag = $language.LanguageTag
        input_method_tips = @($language.InputMethodTips | ForEach-Object { [string]$_ })
      })
    }
  }
  catch {
    Write-Warning "Get-WinUserLanguageList failed: $($_.Exception.Message)"
  }

  $defaultInputOverride = ""
  try {
    $override = Get-WinDefaultInputMethodOverride
    if ($null -ne $override) {
      if ($override -is [string]) {
        $defaultInputOverride = $override
      }
      elseif ($override.PSObject.Properties.Name -contains "InputMethodTip") {
        $defaultInputOverride = [string]$override.InputMethodTip
      }
      elseif ($override.PSObject.Properties.Name -contains "InputTip") {
        $defaultInputOverride = [string]$override.InputTip
      }
      else {
        $defaultInputOverride = ($override | Out-String).Trim()
      }
    }
  }
  catch {
    Write-Warning "Get-WinDefaultInputMethodOverride failed: $($_.Exception.Message)"
  }

  return [pscustomobject]@{
    languages = @($languageRows.ToArray())
    default_input_override = $defaultInputOverride
  }
}

function Start-SilentInstall([string]$InstallerAbs, [string]$Arguments, [int]$SettleSeconds, [bool]$StopServerAfterInstall) {
  $process = Start-Process -FilePath $InstallerAbs -ArgumentList $Arguments -PassThru
  Start-Sleep -Seconds $SettleSeconds

  $stoppedPids = @()
  if ($StopServerAfterInstall) {
    $stoppedPids = Stop-WeaselServer
  }

  $timedOut = $false
  try {
    Wait-Process -Id $process.Id -Timeout 90 -ErrorAction Stop
  }
  catch {
    $timedOut = $true
  }

  return [pscustomobject]@{
    process_id = $process.Id
    exit_code = if ($process.HasExited) { $process.ExitCode } else { $null }
    stopped_server_pids = @($stoppedPids)
    wait_timed_out = $timedOut
  }
}

$workspaceRoot = Resolve-WorkspaceRoot
$stamp = Get-Date -Format "yyyyMMdd"
if ([string]::IsNullOrWhiteSpace($JsonPath) -and -not [string]::IsNullOrWhiteSpace($LogPath) -and $LogPath.EndsWith(".json", [System.StringComparison]::OrdinalIgnoreCase)) {
  $JsonPath = $LogPath
  $LogPath = [System.IO.Path]::ChangeExtension($LogPath, ".log")
}
if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = "TODO/ime-research/logs/${stamp}_rime-weasel_install_validation.log"
}
if ([string]::IsNullOrWhiteSpace($JsonPath)) {
  $JsonPath = "TODO/ime-research/logs/${stamp}_rime-weasel_install_validation.json"
}

$logAbs = Join-Path $workspaceRoot $LogPath
$jsonAbs = Join-Path $workspaceRoot $JsonPath
$exitAbs = [System.IO.Path]::ChangeExtension($logAbs, ".exitcode.txt")
Ensure-Dir (Split-Path -Parent $logAbs)
Ensure-Dir (Split-Path -Parent $jsonAbs)

Start-Transcript -Path $logAbs -Force | Out-Null

try {
  $installerAbs = if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
    Resolve-LatestInstaller -WorkspaceRoot $workspaceRoot
  }
  else {
    Normalize-AbsolutePath (Join-Path $workspaceRoot $InstallerPath)
  }

  if (-not (Test-Path $installerAbs)) {
    throw "Installer not found: $installerAbs"
  }

  $installExecution = $null
  if ($RunInstall) {
    Write-Host "Running installer silently: $installerAbs $SilentArgs"
    $installExecution = Start-SilentInstall -InstallerAbs $installerAbs -Arguments $SilentArgs -SettleSeconds $InstallSettleSeconds -StopServerAfterInstall $StopServerAfterInstall
  }

  $localMachine = [Microsoft.Win32.RegistryHive]::LocalMachine
  $registry64 = [Microsoft.Win32.RegistryView]::Registry64
  $registry32 = [Microsoft.Win32.RegistryView]::Registry32

  $weaselConfig64 = Get-RegistrySnapshot -Hive $localMachine -View $registry64 -SubKey "SOFTWARE\Rime\Weasel"
  $weaselConfig32 = Get-RegistrySnapshot -Hive $localMachine -View $registry32 -SubKey "SOFTWARE\Rime\Weasel"
  $uninstall64 = Get-RegistrySnapshot -Hive $localMachine -View $registry64 -SubKey "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Weasel"
  $uninstall32 = Get-RegistrySnapshot -Hive $localMachine -View $registry32 -SubKey "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Weasel"
  $run64 = Get-RegistrySnapshot -Hive $localMachine -View $registry64 -SubKey "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
  $run32 = Get-RegistrySnapshot -Hive $localMachine -View $registry32 -SubKey "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
  $tip64 = Get-RegistrySnapshot -Hive $localMachine -View $registry64 -SubKey "SOFTWARE\Microsoft\CTF\TIP\$tipGuid"
  $tip32 = Get-RegistrySnapshot -Hive $localMachine -View $registry32 -SubKey "SOFTWARE\Microsoft\CTF\TIP\$tipGuid"
  $langProfile64 = Get-RegistrySnapshot -Hive $localMachine -View $registry64 -SubKey "SOFTWARE\Microsoft\CTF\TIP\$tipGuid\LanguageProfile\0x00000804\$profileGuid"
  $langProfile32 = Get-RegistrySnapshot -Hive $localMachine -View $registry32 -SubKey "SOFTWARE\Microsoft\CTF\TIP\$tipGuid\LanguageProfile\0x00000804\$profileGuid"

  $installRootResolved = Resolve-InstallRoot -ExplicitInstallRoot $InstallRoot -Config32 $weaselConfig32 -Config64 $weaselConfig64
  $fileTargets = New-Object System.Collections.Generic.List[object]
  if (-not [string]::IsNullOrWhiteSpace($installRootResolved)) {
    @(
      (Join-Path $installRootResolved "WeaselServer.exe"),
      (Join-Path $installRootResolved "WeaselSetup.exe"),
      (Join-Path $installRootResolved "uninstall.exe")
    ) | ForEach-Object {
      $fileTargets.Add((Get-FileSnapshot -Path $_))
    }
  }
  @(
    "C:\Windows\System32\weasel.dll",
    "C:\Windows\SysWOW64\weasel.dll"
  ) | ForEach-Object {
    $fileTargets.Add((Get-FileSnapshot -Path $_))
  }

  $languageSnapshot = Get-WinUserLanguageSnapshot
  $containsWeaselInputTip = $false
  foreach ($language in $languageSnapshot.languages) {
    if ($language.language_tag -eq "zh-Hans-CN" -and $language.input_method_tips -contains $weaselInputTip) {
      $containsWeaselInputTip = $true
      break
    }
  }

  $activeServer = @(Get-Process -Name "WeaselServer" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  if ($RestartServerAfterValidation -and -not [string]::IsNullOrWhiteSpace($installRootResolved)) {
    $serverPath = Join-Path $installRootResolved "WeaselServer.exe"
    if (Test-Path $serverPath) {
      Start-Process -FilePath $serverPath | Out-Null
      Start-Sleep -Seconds 2
      $activeServer = @(Get-Process -Name "WeaselServer" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    }
  }

  $passedChecks = New-Object System.Collections.Generic.List[string]
  $failedChecks = New-Object System.Collections.Generic.List[string]
  $warnings = New-Object System.Collections.Generic.List[string]

  if ($weaselConfig32.exists) {
    $passedChecks.Add("HKLM 32-bit view contains Software\\Rime\\Weasel")
  }
  else {
    $failedChecks.Add("HKLM 32-bit view is missing Software\\Rime\\Weasel")
  }

  if ($uninstall32.exists) {
    $passedChecks.Add("HKLM 32-bit view contains Uninstall\\Weasel")
  }
  else {
    $failedChecks.Add("HKLM 32-bit view is missing Uninstall\\Weasel")
  }

  if ($tip64.exists -and $tip32.exists) {
    $passedChecks.Add("TSF TIP registration exists in both 64-bit and 32-bit registry views")
  }
  else {
    $failedChecks.Add("TSF TIP registration is incomplete")
  }

  if ((Get-RegistryValueText -Snapshot $langProfile64 -Name "Enable") -eq "1") {
    $passedChecks.Add("zh-CN language profile is enabled in 64-bit registry view")
  }
  else {
    $failedChecks.Add("zh-CN language profile is not enabled in 64-bit registry view")
  }

  if ($containsWeaselInputTip) {
    $passedChecks.Add("Current user language list contains the Weasel input tip")
  }
  else {
    $failedChecks.Add("Current user language list does not contain the Weasel input tip")
  }

  $missingFiles = @($fileTargets | Where-Object { -not $_.exists })
  if ($missingFiles.Count -eq 0) {
    $passedChecks.Add("Installed binaries and system DLL copies exist")
  }
  else {
    $failedChecks.Add("Some installed binaries are missing")
  }

  if (-not $weaselConfig64.exists -and $weaselConfig32.exists) {
    $warnings.Add("Software\\Rime\\Weasel only exists in the 32-bit registry view because the NSIS installer writes through WOW64 redirection")
  }
  if (-not $uninstall64.exists -and $uninstall32.exists) {
    $warnings.Add("Uninstall\\Weasel only exists in the 32-bit registry view because the NSIS installer is x86")
  }
  if ($installExecution -and $installExecution.wait_timed_out) {
    $warnings.Add("Silent installer did not exit within timeout; this usually means WeaselServer was still running")
  }
  if (@($activeServer).Count -eq 0) {
    $warnings.Add("WeaselServer is not running after validation; active composition still needs a test host or manual restart")
  }

  $result = [pscustomobject]@{
    generated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
    installer = [pscustomobject]@{
      path = $installerAbs
      exists = $true
      last_write_time = (Get-Item $installerAbs).LastWriteTime.ToString("yyyy-MM-ddTHH:mm:sszzz")
    }
    run_install = [bool]$RunInstall
    install_execution = $installExecution
    install_root = $installRootResolved
    files = @($fileTargets.ToArray())
    registry = [pscustomobject]@{
      weasel_config_registry64 = $weaselConfig64
      weasel_config_registry32 = $weaselConfig32
      uninstall_registry64 = $uninstall64
      uninstall_registry32 = $uninstall32
      run_registry64 = $run64
      run_registry32 = $run32
      tip_registry64 = $tip64
      tip_registry32 = $tip32
      zh_cn_profile_registry64 = $langProfile64
      zh_cn_profile_registry32 = $langProfile32
    }
    user_profile = [pscustomobject]@{
      expected_input_tip = $weaselInputTip
      contains_weasel_input_tip = $containsWeaselInputTip
      default_input_override = $languageSnapshot.default_input_override
      languages = @($languageSnapshot.languages)
    }
    processes = [pscustomobject]@{
      weasel_server_pids = @($activeServer)
    }
    summary = [pscustomobject]@{
      passed_checks = @($passedChecks.ToArray())
      failed_checks = @($failedChecks.ToArray())
      warnings = @($warnings.ToArray())
    }
  }

  Set-Content -Path $jsonAbs -Encoding utf8 -Value ($result | ConvertTo-Json -Depth 12)

  Write-Host "Installer:" $installerAbs
  Write-Host "Install root:" $installRootResolved
  Write-Host "JSON report:" $jsonAbs
  Write-Host "Log:" $logAbs
  Write-Host "Passed checks:" $passedChecks.Count
  foreach ($check in $passedChecks) {
    Write-Host "  PASS  $check"
  }
  foreach ($check in $failedChecks) {
    Write-Host "  FAIL  $check"
  }
  foreach ($warning in $warnings) {
    Write-Host "  WARN  $warning"
  }

  $exitCode = if ($failedChecks.Count -eq 0) { 0 } else { 1 }
  Set-Content -Path $exitAbs -Encoding ascii -Value $exitCode
  if ($exitCode -ne 0) {
    throw "rime-weasel install validation failed; see $jsonAbs"
  }
}
finally {
  Stop-Transcript | Out-Null
}
