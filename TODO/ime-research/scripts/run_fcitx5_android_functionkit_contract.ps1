param(
  [ValidateSet("doctor", "build", "run")]
  [string]$Mode = "run",
  [string]$BuildScriptPath = "",
  [string]$BuildGradleTasks = ":app:assembleDebug :app:assembleDebugAndroidTest",
  [string]$MainApkPath = "TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/debug/org.fcitx.fcitx5.android-fe3a618-arm64-v8a-debug.apk",
  [string]$AndroidTestApkPath = "TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/androidTest/debug/org.fcitx.fcitx5.android-fe3a618-debug-androidTest.apk",
  [string]$AndroidTestManifestPath = "TODO/ime-research/repos/fcitx5-android/app/build/intermediates/packaged_manifests/debugAndroidTest/processDebugAndroidTestManifest/AndroidManifest.xml",
  [string]$InstrumentationPackage = "org.fcitx.fcitx5.android.debug.test",
  [string]$TargetPackage = "org.fcitx.fcitx5.android.debug",
  [string]$InstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner",
  [string]$TestClass = "org.fcitx.fcitx5.android.input.functionkit.FunctionKitContractInstrumentationTest",
  [string]$RemoteResultRelativePath = "function-kit-contract/chat-auto-reply-contract-result.json",
  [string]$DeviceId = "",
  [string]$BuildAbi = "",
  [string]$AndroidSdkRoot = "",
  [string]$AndroidAvdHome = "",
  [string]$AvdName = "fcitx5-api36_1-google-play-x86_64",
  [string]$PreferredSystemImagePackages = "system-images;android-36.1;google_apis_playstore;x86_64,system-images;android-36;google_apis_playstore;x86_64,system-images;android-36;google_apis;x86_64",
  [int]$EmulatorLaunchTimeoutSeconds = 180,
  [int]$EmulatorBootTimeoutSeconds = 480,
  [string]$BuildLogPath = "",
  [string]$LogPath = "",
  [string]$ResultPath = "",
  [switch]$SkipBuild,
  [switch]$SkipInstall,
  [switch]$SkipResultPull,
  [switch]$SkipEmulatorAutoStart,
  [switch]$KeepEmulatorRunning
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

function Get-AbsolutePath([string]$WorkspaceRoot, [string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) {
    return ""
  }
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return $Path
  }
  return (Join-Path $WorkspaceRoot $Path)
}

function Resolve-ExistingPath([string[]]$Candidates) {
  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }
  return ""
}

function Resolve-AndroidSdkRoot([string]$RequestedPath) {
  $candidates = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    $candidates.Add($RequestedPath)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_SDK_ROOT)) {
    $candidates.Add($env:ANDROID_SDK_ROOT)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_HOME)) {
    $candidates.Add($env:ANDROID_HOME)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $candidates.Add((Join-Path $env:LOCALAPPDATA "Android\\Sdk"))
  }

  $resolved = Resolve-ExistingPath -Candidates @($candidates)
  if ([string]::IsNullOrWhiteSpace($resolved)) {
    throw "Android SDK root not found. Pass -AndroidSdkRoot or set ANDROID_SDK_ROOT."
  }

  return $resolved
}

function Resolve-AndroidAvdHome([string]$RequestedPath) {
  $candidates = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    $candidates.Add($RequestedPath)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_AVD_HOME)) {
    $candidates.Add($env:ANDROID_AVD_HOME)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $candidates.Add((Join-Path $env:USERPROFILE ".android\avd"))
  }

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }

  $fallback = $candidates | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($fallback)) {
    throw "ANDROID_AVD_HOME could not be resolved."
  }

  Ensure-Dir $fallback
  return (Resolve-Path $fallback).Path
}

function Resolve-PowerShellPath {
  $command = Get-Command powershell.exe -ErrorAction SilentlyContinue
  if ($null -ne $command -and -not [string]::IsNullOrWhiteSpace($command.Source)) {
    return $command.Source
  }
  return "powershell.exe"
}

function Resolve-PreferredBuildScriptPath(
  [string]$WorkspaceRoot,
  [string]$RequestedPath
) {
  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    return Get-AbsolutePath -WorkspaceRoot $WorkspaceRoot -Path $RequestedPath
  }

  $localGradleCandidates = @(
    $env:FCITX5_ANDROID_LOCAL_GRADLE_EXECUTABLE,
    $(if (-not [string]::IsNullOrWhiteSpace($env:FCITX5_ANDROID_LOCAL_GRADLE_BIN_DIR)) { Join-Path $env:FCITX5_ANDROID_LOCAL_GRADLE_BIN_DIR "gradle.bat" } else { "" }),
    "D:\edge\gradle-9.3.1-bin\gradle-9.3.1\bin\gradle.bat"
  )
  $resolvedGradle = Resolve-ExistingPath -Candidates $localGradleCandidates
  if (-not [string]::IsNullOrWhiteSpace($resolvedGradle)) {
    return Get-AbsolutePath -WorkspaceRoot $WorkspaceRoot -Path "TODO/ime-research/scripts/run_fcitx5_android_debug_local.ps1"
  }

  return Get-AbsolutePath -WorkspaceRoot $WorkspaceRoot -Path "TODO/ime-research/scripts/run_fcitx5_android_debug_docker.ps1"
}

function Resolve-JavaPath {
  $candidates = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
    $candidates.Add((Join-Path $env:JAVA_HOME "bin\java.exe"))
  }
  $javaCommand = Get-Command java.exe -ErrorAction SilentlyContinue
  if ($null -ne $javaCommand -and -not [string]::IsNullOrWhiteSpace($javaCommand.Source)) {
    $candidates.Add($javaCommand.Source)
  }
  $candidates.Add("D:\Android Studio\jbr\bin\java.exe")
  $candidates.Add("C:\Program Files\Android\Android Studio\jbr\bin\java.exe")

  $resolved = Resolve-ExistingPath -Candidates @($candidates)
  if ([string]::IsNullOrWhiteSpace($resolved)) {
    throw "java.exe not found. Install Android Studio JBR or set JAVA_HOME."
  }

  return $resolved
}

function Find-CmdlineTool(
  [string]$SdkRoot,
  [string]$ToolName
) {
  $latestDirect = Join-Path $SdkRoot "cmdline-tools\latest\bin\$ToolName"
  if (Test-Path $latestDirect) {
    return (Resolve-Path $latestDirect).Path
  }

  $latestNested = Join-Path $SdkRoot "cmdline-tools\latest\cmdline-tools\bin\$ToolName"
  if (Test-Path $latestNested) {
    return (Resolve-Path $latestNested).Path
  }

  $cmdlineToolsRoot = Join-Path $SdkRoot "cmdline-tools"
  if (-not (Test-Path $cmdlineToolsRoot)) {
    return ""
  }

  $directories = Get-ChildItem -Path $cmdlineToolsRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
  foreach ($directory in $directories) {
    $candidate = Join-Path $directory.FullName "bin\$ToolName"
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }

    $nestedCandidate = Join-Path $directory.FullName "cmdline-tools\bin\$ToolName"
    if (Test-Path $nestedCandidate) {
      return (Resolve-Path $nestedCandidate).Path
    }
  }

  return ""
}

function Resolve-AndroidToolchain([string]$SdkRoot) {
  $adbCommand = Get-Command adb.exe -ErrorAction SilentlyContinue
  $adbPath = Resolve-ExistingPath -Candidates @(
    (Join-Path $SdkRoot "platform-tools\adb.exe"),
    $(if ($null -ne $adbCommand) { $adbCommand.Source } else { "" })
  )
  if ([string]::IsNullOrWhiteSpace($adbPath)) {
    throw "adb.exe not found. Install Android platform-tools under $SdkRoot."
  }

  $emulatorPath = Resolve-ExistingPath -Candidates @(
    (Join-Path $SdkRoot "emulator\emulator.exe")
  )
  if ([string]::IsNullOrWhiteSpace($emulatorPath)) {
    throw "emulator.exe not found under $SdkRoot\emulator."
  }

  $emulatorCheckPath = Resolve-ExistingPath -Candidates @(
    (Join-Path $SdkRoot "emulator\emulator-check.exe")
  )

  $javaPath = Resolve-JavaPath
  $sdkManagerPath = Find-CmdlineTool -SdkRoot $SdkRoot -ToolName "sdkmanager.bat"
  $avdManagerPath = Find-CmdlineTool -SdkRoot $SdkRoot -ToolName "avdmanager.bat"

  return [pscustomobject]@{
    AdbPath = $adbPath
    EmulatorPath = $emulatorPath
    EmulatorCheckPath = $emulatorCheckPath
    JavaPath = $javaPath
    SdkManagerPath = $sdkManagerPath
    AvdManagerPath = $avdManagerPath
  }
}

function Write-LogHeader(
  [string]$ResolvedLogPath,
  [string]$Title
) {
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ""
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("=== {0} ===" -f $Title)
}

function Append-LogText(
  [string]$ResolvedLogPath,
  [string]$Text
) {
  $payload = if ($null -eq $Text) { [Environment]::NewLine } else { $Text + [Environment]::NewLine }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  for ($attempt = 0; $attempt -lt 5; $attempt++) {
    try {
      [System.IO.File]::AppendAllText($ResolvedLogPath, $payload, $utf8)
      return
    } catch {
      if ($attempt -ge 4) {
        throw
      }
      Start-Sleep -Milliseconds 200
    }
  }
}

function Append-LogLines(
  [string]$ResolvedLogPath,
  [string[]]$Lines
) {
  if ($null -eq $Lines -or $Lines.Count -eq 0) {
    return
  }

  $payload = [string]::Join([Environment]::NewLine, $Lines)
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text $payload
}

function Format-NativeCommand(
  [string]$FilePath,
  [string[]]$Arguments
) {
  $parts = New-Object System.Collections.Generic.List[string]
  $parts.Add($FilePath)
  foreach ($argument in $Arguments) {
    if ([string]::IsNullOrWhiteSpace($argument)) {
      $parts.Add('""')
      continue
    }
    if ($argument.Contains(" ")) {
      $parts.Add(('"{0}"' -f $argument.Replace('"', '\"')))
    } else {
      $parts.Add($argument)
    }
  }
  return ($parts -join " ")
}

function Invoke-NativeCommand(
  [string]$FilePath,
  [string[]]$Arguments,
  [string[]]$InputLines
) {
  if ($null -eq $Arguments) {
    $Arguments = @()
  }
  if ($null -eq $InputLines) {
    $InputLines = @()
  }

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    if ($InputLines.Count -gt 0) {
      $output = $InputLines | & $FilePath @Arguments 2>&1
    } else {
      $output = & $FilePath @Arguments 2>&1
    }
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $exitCode = $LASTEXITCODE
  if ($null -eq $exitCode) {
    $exitCode = 0
  }

  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($item in $output) {
    if ($null -eq $item) {
      continue
    }
    $lines.Add($item.ToString())
  }

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = $lines.ToArray()
  }
}

function Invoke-LoggedNativeCommand(
  [string]$FilePath,
  [string[]]$Arguments,
  [string]$ResolvedLogPath,
  [switch]$AllowFailure,
  [string[]]$InputLines
) {
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ""
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("--- {0}" -f (Format-NativeCommand -FilePath $FilePath -Arguments $Arguments))

  $result = Invoke-NativeCommand -FilePath $FilePath -Arguments $Arguments -InputLines $InputLines
  Append-LogLines -ResolvedLogPath $ResolvedLogPath -Lines $result.Output

  if (-not $AllowFailure -and $result.ExitCode -ne 0) {
    throw "Command failed (exit code: $($result.ExitCode)): $(Format-NativeCommand -FilePath $FilePath -Arguments $Arguments)"
  }

  return $result
}

function Get-AdbDeviceStates(
  [string]$AdbPath,
  [string]$ResolvedLogPath
) {
  $result = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments @("devices") -ResolvedLogPath $ResolvedLogPath
  $devices = New-Object System.Collections.Generic.List[object]
  foreach ($line in $result.Output) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed -eq "List of devices attached") {
      continue
    }
    if ($trimmed -match '^([^\s]+)\s+([^\s]+)$') {
      $devices.Add([pscustomobject]@{
        Serial = $Matches[1]
        State = $Matches[2]
      })
    }
  }
  return $devices.ToArray()
}

function Get-AdbConnectedDevices(
  [string]$AdbPath,
  [string]$ResolvedLogPath
) {
  $states = Get-AdbDeviceStates -AdbPath $AdbPath -ResolvedLogPath $ResolvedLogPath
  return @($states | Where-Object { $_.State -eq "device" } | ForEach-Object { $_.Serial })
}

function Resolve-TargetDevice(
  [string[]]$ConnectedDevices,
  [string]$RequestedDeviceId,
  [string]$Mode
) {
  if ($null -eq $ConnectedDevices) {
    $ConnectedDevices = @()
  }

  if (-not [string]::IsNullOrWhiteSpace($RequestedDeviceId)) {
    if ($ConnectedDevices -notcontains $RequestedDeviceId) {
      throw "Requested adb device not connected: $RequestedDeviceId"
    }
    return $RequestedDeviceId
  }

  if ($Mode -eq "doctor") {
    if ($ConnectedDevices.Count -eq 1) {
      return $ConnectedDevices[0]
    }
    return ""
  }

  if ($ConnectedDevices.Count -eq 0) {
    throw "No adb device detected. Re-run without -SkipEmulatorAutoStart, connect a phone, or create an emulator."
  }

  if ($ConnectedDevices.Count -gt 1) {
    throw "Multiple adb devices detected: $($ConnectedDevices -join ', '). Use -DeviceId to choose one."
  }

  return $ConnectedDevices[0]
}

function Get-AdbPrefix([string]$ResolvedDeviceId) {
  if ([string]::IsNullOrWhiteSpace($ResolvedDeviceId)) {
    return @()
  }
  return @("-s", $ResolvedDeviceId)
}

function Resolve-MainApkPathForAbi(
  [string]$TemplatePath,
  [string]$Abi
) {
  if ([string]::IsNullOrWhiteSpace($Abi)) {
    return $TemplatePath
  }

  $fileName = Split-Path $TemplatePath -Leaf
  $updatedFileName = $fileName -replace '(arm64-v8a|armeabi-v7a|x86_64|x86|universal)', $Abi
  if ($updatedFileName -eq $fileName) {
    return $TemplatePath
  }

  return (Join-Path (Split-Path $TemplatePath -Parent) $updatedFileName)
}

function Get-DevicePrimaryAbi(
  [string]$AdbPath,
  [string]$DeviceId,
  [string]$ResolvedLogPath
) {
  $abi = ""
  $primaryResult = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments @("-s", $DeviceId, "shell", "getprop", "ro.product.cpu.abi") -ResolvedLogPath $ResolvedLogPath -AllowFailure
  if ($primaryResult.ExitCode -eq 0) {
    $abi = ($primaryResult.Output -join "").Trim()
  }

  if ([string]::IsNullOrWhiteSpace($abi)) {
    $listResult = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments @("-s", $DeviceId, "shell", "getprop", "ro.product.cpu.abilist") -ResolvedLogPath $ResolvedLogPath -AllowFailure
    if ($listResult.ExitCode -eq 0) {
      $abilist = ($listResult.Output -join "").Trim()
      if (-not [string]::IsNullOrWhiteSpace($abilist)) {
        $abi = ($abilist.Split(",") | Select-Object -First 1).Trim()
      }
    }
  }

  if ([string]::IsNullOrWhiteSpace($abi)) {
    throw "Could not determine device ABI for $DeviceId."
  }

  return $abi
}

function Install-AdbPackage(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$PackageId,
  [string]$ApkPath,
  [string]$ResolvedLogPath,
  [switch]$TestOnly
) {
  $installArguments = New-Object System.Collections.Generic.List[string]
  foreach ($part in $AdbPrefix) {
    $installArguments.Add($part)
  }
  $installArguments.Add("install")
  $installArguments.Add("-r")
  if ($TestOnly) {
    $installArguments.Add("-t")
  }
  $installArguments.Add($ApkPath)

  $result = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments $installArguments.ToArray() -ResolvedLogPath $ResolvedLogPath -AllowFailure
  if ($result.ExitCode -eq 0) {
    return
  }

  $outputText = $result.Output -join "`n"
  if ($outputText -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' -and -not [string]::IsNullOrWhiteSpace($PackageId)) {
    Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("uninstall", $PackageId)) -ResolvedLogPath $ResolvedLogPath -AllowFailure | Out-Null
    $retry = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments $installArguments.ToArray() -ResolvedLogPath $ResolvedLogPath -AllowFailure
    if ($retry.ExitCode -eq 0) {
      return
    }
    throw "adb install failed after uninstall retry: $ApkPath"
  }

  throw "adb install failed: $ApkPath"
}

function Resolve-InstrumentationMetadata(
  [string]$ManifestPath,
  [string]$FallbackInstrumentationPackage,
  [string]$FallbackTargetPackage
) {
  $resolvedInstrumentationPackage = $FallbackInstrumentationPackage
  $resolvedTargetPackage = $FallbackTargetPackage

  if (Test-Path $ManifestPath) {
    $raw = Get-Content -Path $ManifestPath -Encoding utf8 -Raw
    if ($raw -match '<manifest[^>]*\spackage="([^"]+)"') {
      $resolvedInstrumentationPackage = $Matches[1]
    }
    if ($raw -match '<instrumentation[^>]*android:targetPackage="([^"]+)"') {
      $resolvedTargetPackage = $Matches[1]
    }
  }

  return [pscustomobject]@{
    InstrumentationPackage = $resolvedInstrumentationPackage
    TargetPackage = $resolvedTargetPackage
  }
}

function Get-PreferredPackageList([string]$CsvValue) {
  if ([string]::IsNullOrWhiteSpace($CsvValue)) {
    return @()
  }
  return @($CsvValue.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Get-InstalledSystemImagePackages([string]$SdkRoot) {
  $packages = New-Object System.Collections.Generic.List[string]
  $systemImagesRoot = Join-Path $SdkRoot "system-images"
  if (-not (Test-Path $systemImagesRoot)) {
    return @()
  }

  $packageXmlFiles = Get-ChildItem -Path $systemImagesRoot -Recurse -Filter package.xml -ErrorAction SilentlyContinue
  foreach ($packageXmlFile in $packageXmlFiles) {
    $raw = Get-Content -Path $packageXmlFile.FullName -Encoding utf8 -Raw
    if ($raw -match '<localPackage path="([^"]+)"') {
      $packages.Add($Matches[1])
    }
  }

  return @($packages | Sort-Object -Unique)
}

function Get-SystemImageRank([string]$PackagePath) {
  $apiLevel = 0.0
  if ($PackagePath -match '^system-images;android-([^;]+);') {
    [double]::TryParse($Matches[1], [ref]$apiLevel) | Out-Null
  }
  $isPlayStore = if ($PackagePath -match ';google_apis_playstore;') { 1 } else { 0 }
  $isGoogleApis = if ($PackagePath -match ';google_apis;') { 1 } else { 0 }
  $isX86_64 = if ($PackagePath -match ';x86_64$') { 1 } else { 0 }

  return [pscustomobject]@{
    ApiLevel = $apiLevel
    IsPlayStore = $isPlayStore
    IsGoogleApis = $isGoogleApis
    IsX86_64 = $isX86_64
  }
}

function Resolve-SystemImageSelection(
  [string[]]$InstalledPackages,
  [string[]]$PreferredPackages
) {
  foreach ($preferredPackage in $PreferredPackages) {
    if ($InstalledPackages -contains $preferredPackage) {
      return [pscustomobject]@{
        SelectedPackage = $preferredPackage
        InstallNeeded = $false
        SelectedFrom = "installed-preferred"
      }
    }
  }

  if ($InstalledPackages.Count -gt 0) {
    $bestInstalled = $InstalledPackages |
      Sort-Object `
        @{ Expression = { (Get-SystemImageRank -PackagePath $_).ApiLevel }; Descending = $true }, `
        @{ Expression = { (Get-SystemImageRank -PackagePath $_).IsPlayStore }; Descending = $true }, `
        @{ Expression = { (Get-SystemImageRank -PackagePath $_).IsGoogleApis }; Descending = $true }, `
        @{ Expression = { (Get-SystemImageRank -PackagePath $_).IsX86_64 }; Descending = $true } |
      Select-Object -First 1

    return [pscustomobject]@{
      SelectedPackage = $bestInstalled
      InstallNeeded = $false
      SelectedFrom = "installed-fallback"
    }
  }

  if ($PreferredPackages.Count -eq 0) {
    throw "No installed Android system image found, and no preferred package was provided."
  }

  return [pscustomobject]@{
    SelectedPackage = $PreferredPackages[0]
    InstallNeeded = $true
    SelectedFrom = "preferred-install"
  }
}

function Get-RepositoryRemotePackages([xml]$RepositoryXml) {
  return $RepositoryXml.SelectNodes("//*[local-name()='remotePackage']")
}

function Get-LatestCmdlineToolsArchiveInfo([string]$RepositoryUrl) {
  $response = Invoke-WebRequest -Uri $RepositoryUrl -UseBasicParsing
  [xml]$repositoryXml = $response.Content

  $candidates = New-Object System.Collections.Generic.List[object]
  foreach ($remotePackage in (Get-RepositoryRemotePackages -RepositoryXml $repositoryXml)) {
    $packagePath = $remotePackage.GetAttribute("path")
    if ($packagePath -notlike "cmdline-tools;*") {
      continue
    }

    $majorNode = $remotePackage.SelectSingleNode(".//*[local-name()='revision']/*[local-name()='major']")
    $minorNode = $remotePackage.SelectSingleNode(".//*[local-name()='revision']/*[local-name()='minor']")
    $microNode = $remotePackage.SelectSingleNode(".//*[local-name()='revision']/*[local-name()='micro']")
    $major = if ($null -ne $majorNode) { [int]$majorNode.InnerText } else { 0 }
    $minor = if ($null -ne $minorNode) { [int]$minorNode.InnerText } else { 0 }
    $micro = if ($null -ne $microNode) { [int]$microNode.InnerText } else { 0 }
    $revision = [version]("{0}.{1}.{2}" -f $major, $minor, $micro)

    $archives = $remotePackage.SelectNodes(".//*[local-name()='archive']")
    foreach ($archive in $archives) {
      $hostOsNode = $archive.SelectSingleNode(".//*[local-name()='host-os']")
      if ($null -eq $hostOsNode -or $hostOsNode.InnerText.Trim().ToLowerInvariant() -ne "windows") {
        continue
      }

      $urlNode = $archive.SelectSingleNode(".//*[local-name()='complete']/*[local-name()='url']")
      if ($null -eq $urlNode) {
        continue
      }

      $checksumNode = $archive.SelectSingleNode(".//*[local-name()='complete']/*[local-name()='checksum']")
      $sizeNode = $archive.SelectSingleNode(".//*[local-name()='complete']/*[local-name()='size']")

      $candidates.Add([pscustomobject]@{
        PackagePath = $packagePath
        Revision = $revision
        ArchiveUrl = $urlNode.InnerText.Trim()
        Checksum = if ($null -ne $checksumNode) { $checksumNode.InnerText.Trim() } else { "" }
        Size = if ($null -ne $sizeNode) { [int64]$sizeNode.InnerText.Trim() } else { 0 }
      })
    }
  }

  if ($candidates.Count -eq 0) {
    throw "Could not find a Windows Android cmdline-tools archive in $RepositoryUrl."
  }

  return $candidates | Sort-Object Revision -Descending | Select-Object -First 1
}

function Install-AndroidCmdlineTools(
  [string]$SdkRoot,
  [string]$ResolvedLogPath
) {
  Write-LogHeader -ResolvedLogPath $ResolvedLogPath -Title "Install Android cmdline-tools"
  $repositoryUrl = "https://dl.google.com/android/repository/repository2-1.xml"
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("Repository: {0}" -f $repositoryUrl)

  $archiveInfo = Get-LatestCmdlineToolsArchiveInfo -RepositoryUrl $repositoryUrl
  $archiveUrl = if ($archiveInfo.ArchiveUrl.StartsWith("http", [System.StringComparison]::OrdinalIgnoreCase)) {
    $archiveInfo.ArchiveUrl
  } else {
    "https://dl.google.com/android/repository/$($archiveInfo.ArchiveUrl)"
  }
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("Selected package: {0}" -f $archiveInfo.PackagePath)
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("Selected revision: {0}" -f $archiveInfo.Revision)
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("Archive URL: {0}" -f $archiveUrl)

  $scratchBase = if (-not [string]::IsNullOrWhiteSpace($env:SystemDrive)) { $env:SystemDrive } else { $env:TEMP }
  $tempRoot = Join-Path $scratchBase ("f5ct-{0}" -f ([Guid]::NewGuid().ToString("N").Substring(0, 12)))
  $tempZip = Join-Path $tempRoot "commandlinetools-win.zip"
  $extractRoot = Join-Path $tempRoot "extract"
  Ensure-Dir $tempRoot
  Ensure-Dir $extractRoot

  try {
    $curlCommand = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($null -ne $curlCommand -and -not [string]::IsNullOrWhiteSpace($curlCommand.Source)) {
      Invoke-LoggedNativeCommand -FilePath $curlCommand.Source -Arguments @("-L", "--fail", "--silent", "--show-error", "--output", $tempZip, $archiveUrl) -ResolvedLogPath $ResolvedLogPath | Out-Null
    } else {
      Append-LogText -ResolvedLogPath $ResolvedLogPath -Text "curl.exe not found; fallback to Invoke-WebRequest."
      Invoke-WebRequest -Uri $archiveUrl -OutFile $tempZip -UseBasicParsing
    }

    if (-not [string]::IsNullOrWhiteSpace($archiveInfo.Checksum)) {
      $actualHash = (Get-FileHash -Path $tempZip -Algorithm SHA1).Hash.ToLowerInvariant()
      $expectedHash = $archiveInfo.Checksum.ToLowerInvariant()
      Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("SHA1 expected: {0}" -f $expectedHash)
      Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("SHA1 actual:   {0}" -f $actualHash)
      if ($actualHash -ne $expectedHash) {
        throw "Downloaded cmdline-tools checksum mismatch."
      }
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($tempZip, $extractRoot)
    $sdkManagerCandidate = Get-ChildItem -Path $extractRoot -Recurse -Filter sdkmanager.bat -ErrorAction Stop | Select-Object -First 1
    if ($null -eq $sdkManagerCandidate) {
      throw "sdkmanager.bat was not found inside the downloaded cmdline-tools archive."
    }

    $cmdlineToolsRoot = Split-Path -Parent (Split-Path -Parent $sdkManagerCandidate.FullName)
    $latestDir = Join-Path $SdkRoot "cmdline-tools\latest"
    Ensure-Dir (Split-Path -Parent $latestDir)
    if (Test-Path $latestDir) {
      Remove-Item -Path $latestDir -Recurse -Force
    }
    Ensure-Dir $latestDir
    Copy-Item -Path (Join-Path $cmdlineToolsRoot "*") -Destination $latestDir -Recurse -Force
  } finally {
    if (Test-Path $tempRoot) {
      Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Ensure-AndroidCmdlineTools(
  [string]$SdkRoot,
  [string]$ResolvedLogPath
) {
  $toolchain = Resolve-AndroidToolchain -SdkRoot $SdkRoot
  if (-not [string]::IsNullOrWhiteSpace($toolchain.SdkManagerPath) -and -not [string]::IsNullOrWhiteSpace($toolchain.AvdManagerPath)) {
    return $toolchain
  }

  Install-AndroidCmdlineTools -SdkRoot $SdkRoot -ResolvedLogPath $ResolvedLogPath
  $toolchain = Resolve-AndroidToolchain -SdkRoot $SdkRoot
  if ([string]::IsNullOrWhiteSpace($toolchain.SdkManagerPath) -or [string]::IsNullOrWhiteSpace($toolchain.AvdManagerPath)) {
    throw "Android cmdline-tools installation completed, but sdkmanager/avdmanager are still missing."
  }

  return $toolchain
}

function Ensure-SdkLicenses(
  [string]$SdkManagerPath,
  [string]$SdkRoot,
  [string]$ResolvedLogPath
) {
  $acceptLines = 1..40 | ForEach-Object { "y" }
  Invoke-LoggedNativeCommand -FilePath $SdkManagerPath -Arguments @("--sdk_root=$SdkRoot", "--licenses") -ResolvedLogPath $ResolvedLogPath -AllowFailure -InputLines $acceptLines | Out-Null
}

function Ensure-SystemImageInstalled(
  [string]$SdkRoot,
  [string]$SdkManagerPath,
  [string]$PackagePath,
  [string]$ResolvedLogPath
) {
  $installedPackages = Get-InstalledSystemImagePackages -SdkRoot $SdkRoot
  if ($installedPackages -contains $PackagePath) {
    return
  }

  Write-LogHeader -ResolvedLogPath $ResolvedLogPath -Title "Install Android system image"
  Ensure-SdkLicenses -SdkManagerPath $SdkManagerPath -SdkRoot $SdkRoot -ResolvedLogPath $ResolvedLogPath
  Invoke-LoggedNativeCommand -FilePath $SdkManagerPath -Arguments @("--sdk_root=$SdkRoot", $PackagePath) -ResolvedLogPath $ResolvedLogPath -InputLines (1..40 | ForEach-Object { "y" }) | Out-Null

  $installedPackages = Get-InstalledSystemImagePackages -SdkRoot $SdkRoot
  if ($installedPackages -notcontains $PackagePath) {
    throw "System image install did not produce the expected package: $PackagePath"
  }
}

function Get-ExistingAvds(
  [string]$EmulatorPath,
  [string]$ResolvedLogPath
) {
  $result = Invoke-LoggedNativeCommand -FilePath $EmulatorPath -Arguments @("-list-avds") -ResolvedLogPath $ResolvedLogPath -AllowFailure
  if ($result.ExitCode -ne 0) {
    return @()
  }

  return @($result.Output | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Set-AvdConfigValue(
  [string]$ConfigPath,
  [string]$Key,
  [string]$Value
) {
  if (-not (Test-Path $ConfigPath)) {
    return
  }

  $lines = Get-Content -Path $ConfigPath -Encoding utf8
  $updated = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match ("^{0}=" -f [regex]::Escape($Key))) {
      $lines[$index] = "{0}={1}" -f $Key, $Value
      $updated = $true
      break
    }
  }
  if (-not $updated) {
    $lines += "{0}={1}" -f $Key, $Value
  }
  Set-Content -Path $ConfigPath -Encoding utf8 -Value $lines
}

function Ensure-AvdExists(
  [string]$AvdName,
  [string]$SystemImagePackage,
  [string]$AndroidAvdHome,
  [string]$AvdManagerPath,
  [string]$EmulatorPath,
  [string]$ResolvedLogPath
) {
  $existingAvds = Get-ExistingAvds -EmulatorPath $EmulatorPath -ResolvedLogPath $ResolvedLogPath
  if ($existingAvds -contains $AvdName) {
    return
  }

  Write-LogHeader -ResolvedLogPath $ResolvedLogPath -Title "Create Android AVD"
  Ensure-Dir $AndroidAvdHome
  $env:ANDROID_AVD_HOME = $AndroidAvdHome
  Invoke-LoggedNativeCommand -FilePath $AvdManagerPath -Arguments @("create", "avd", "-n", $AvdName, "-k", $SystemImagePackage, "--force") -ResolvedLogPath $ResolvedLogPath -InputLines @("no") | Out-Null

  $configPath = Join-Path (Join-Path $AndroidAvdHome ("{0}.avd" -f $AvdName)) "config.ini"
  if (Test-Path $configPath) {
    Set-AvdConfigValue -ConfigPath $configPath -Key "hw.keyboard" -Value "yes"
    Set-AvdConfigValue -ConfigPath $configPath -Key "disk.dataPartition.size" -Value "2048M"
    Set-AvdConfigValue -ConfigPath $configPath -Key "showDeviceFrame" -Value "no"
  }

  $existingAvds = Get-ExistingAvds -EmulatorPath $EmulatorPath -ResolvedLogPath $ResolvedLogPath
  if ($existingAvds -notcontains $AvdName) {
    throw "AVD creation finished but $AvdName is still missing."
  }
}

function Get-RunningEmulatorSerials(
  [string]$AdbPath
) {
  $result = Invoke-NativeCommand -FilePath $AdbPath -Arguments @("devices") -InputLines @()
  $serials = New-Object System.Collections.Generic.List[string]
  foreach ($line in $result.Output) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^(emulator-\d+)\s+(device|offline|unauthorized)$') {
      $serials.Add($Matches[1])
    }
  }
  return $serials.ToArray()
}

function Wait-ForEmulatorSerial(
  [string]$AdbPath,
  [string[]]$BeforeSerials,
  [int]$TimeoutSeconds
) {
  $beforeSerials = @($BeforeSerials)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $currentSerials = @(Get-RunningEmulatorSerials -AdbPath $AdbPath)
    $newSerial = @($currentSerials | Where-Object { $beforeSerials -notcontains $_ } | Select-Object -First 1)
    if ($newSerial.Count -gt 0) {
      return $newSerial[0]
    }
    if ($currentSerials.Count -eq 1 -and $beforeSerials.Count -eq 0) {
      return $currentSerials[0]
    }
    Start-Sleep -Seconds 3
  }
  throw "Timed out waiting for emulator serial to appear in adb."
}

function Wait-ForAndroidBoot(
  [string]$AdbPath,
  [string]$DeviceId,
  [int]$TimeoutSeconds,
  [string]$ResolvedLogPath
) {
  Write-LogHeader -ResolvedLogPath $ResolvedLogPath -Title ("Wait for Android boot ({0})" -f $DeviceId)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $boot = Invoke-NativeCommand -FilePath $AdbPath -Arguments @("-s", $DeviceId, "shell", "getprop", "sys.boot_completed") -InputLines @()
    $bootCompleted = ($boot.ExitCode -eq 0 -and (($boot.Output -join "").Trim() -eq "1"))

    $bootAnimation = Invoke-NativeCommand -FilePath $AdbPath -Arguments @("-s", $DeviceId, "shell", "getprop", "init.svc.bootanim") -InputLines @()
    $bootAnimationStopped = ($bootAnimation.ExitCode -eq 0 -and (($bootAnimation.Output -join "").Trim() -eq "stopped" -or [string]::IsNullOrWhiteSpace(($bootAnimation.Output -join "").Trim())))

    if ($bootCompleted -and $bootAnimationStopped) {
      Append-LogText -ResolvedLogPath $ResolvedLogPath -Text "Boot completed."
      return
    }

    Start-Sleep -Seconds 5
  }

  throw "Timed out waiting for Android emulator boot to complete."
}

function Start-AndroidEmulator(
  [string]$EmulatorPath,
  [string]$AdbPath,
  [string]$AvdName,
  [string]$ResolvedLogPath,
  [int]$LaunchTimeoutSeconds,
  [int]$BootTimeoutSeconds
) {
  Write-LogHeader -ResolvedLogPath $ResolvedLogPath -Title ("Start Android emulator ({0})" -f $AvdName)

  $beforeSerials = Get-RunningEmulatorSerials -AdbPath $AdbPath
  $emulatorLogPath = [System.IO.Path]::ChangeExtension($ResolvedLogPath, ".emulator.log")
  $emulatorErrorLogPath = [System.IO.Path]::ChangeExtension($ResolvedLogPath, ".emulator.stderr.log")
  $arguments = @(
    "-avd", $AvdName,
    "-no-window",
    "-no-boot-anim",
    "-gpu", "swiftshader_indirect",
    "-netdelay", "none",
    "-netspeed", "full",
    "-noaudio",
    "-no-snapshot-load",
    "-no-snapshot-save"
  )

  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("Emulator command: {0}" -f (Format-NativeCommand -FilePath $EmulatorPath -Arguments $arguments))

  $process = Start-Process -FilePath $EmulatorPath -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $emulatorLogPath -RedirectStandardError $emulatorErrorLogPath
  $serial = Wait-ForEmulatorSerial -AdbPath $AdbPath -BeforeSerials $beforeSerials -TimeoutSeconds $LaunchTimeoutSeconds
  Wait-ForAndroidBoot -AdbPath $AdbPath -DeviceId $serial -TimeoutSeconds $BootTimeoutSeconds -ResolvedLogPath $ResolvedLogPath

  Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments @("-s", $serial, "shell", "input", "keyevent", "KEYCODE_WAKEUP") -ResolvedLogPath $ResolvedLogPath -AllowFailure | Out-Null
  Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments @("-s", $serial, "shell", "wm", "dismiss-keyguard") -ResolvedLogPath $ResolvedLogPath -AllowFailure | Out-Null

  return [pscustomobject]@{
    Serial = $serial
    ProcessId = $process.Id
    StdOutLogPath = $emulatorLogPath
    StdErrLogPath = $emulatorErrorLogPath
  }
}

function Stop-AndroidEmulator(
  [string]$AdbPath,
  [string]$DeviceId,
  [string]$ResolvedLogPath
) {
  if ([string]::IsNullOrWhiteSpace($DeviceId)) {
    return
  }
  Write-LogHeader -ResolvedLogPath $ResolvedLogPath -Title ("Stop Android emulator ({0})" -f $DeviceId)
  Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments @("-s", $DeviceId, "emu", "kill") -ResolvedLogPath $ResolvedLogPath -AllowFailure | Out-Null
}

$workspaceRoot = Resolve-WorkspaceRoot
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = "TODO/ime-research/logs/${stamp}_fcitx5-android_functionkit_contract_${Mode}.log"
}
if ([string]::IsNullOrWhiteSpace($BuildLogPath)) {
  $BuildLogPath = "TODO/ime-research/logs/${stamp}_fcitx5-android_functionkit_contract_build.log"
}
if ([string]::IsNullOrWhiteSpace($ResultPath)) {
  $ResultPath = "TODO/ime-research/logs/${stamp}_fcitx5-android_functionkit_contract_result.json"
}

$logAbs = Get-AbsolutePath -WorkspaceRoot $workspaceRoot -Path $LogPath
$buildLogAbs = Get-AbsolutePath -WorkspaceRoot $workspaceRoot -Path $BuildLogPath
$resultAbs = Get-AbsolutePath -WorkspaceRoot $workspaceRoot -Path $ResultPath
$exitAbs = [System.IO.Path]::ChangeExtension($logAbs, ".exitcode.txt")
$buildScriptAbs = Resolve-PreferredBuildScriptPath -WorkspaceRoot $workspaceRoot -RequestedPath $BuildScriptPath
$mainApkAbs = Get-AbsolutePath -WorkspaceRoot $workspaceRoot -Path $MainApkPath
$androidTestApkAbs = Get-AbsolutePath -WorkspaceRoot $workspaceRoot -Path $AndroidTestApkPath
$androidTestManifestAbs = Get-AbsolutePath -WorkspaceRoot $workspaceRoot -Path $AndroidTestManifestPath

Ensure-Dir (Split-Path -Parent $logAbs)
Ensure-Dir (Split-Path -Parent $buildLogAbs)
Ensure-Dir (Split-Path -Parent $resultAbs)
Set-Content -Path $logAbs -Encoding utf8 -Value ""
Set-Content -Path $exitAbs -Encoding ascii -Value 1

$powerShellPath = Resolve-PowerShellPath
if (-not (Test-Path $buildScriptAbs)) {
  throw "Missing build script: $buildScriptAbs"
}

$resolvedSdkRoot = Resolve-AndroidSdkRoot -RequestedPath $AndroidSdkRoot
$resolvedAvdHome = Resolve-AndroidAvdHome -RequestedPath $AndroidAvdHome
$env:ANDROID_SDK_ROOT = $resolvedSdkRoot
$env:ANDROID_HOME = $resolvedSdkRoot
$env:ANDROID_AVD_HOME = $resolvedAvdHome

$toolchain = Resolve-AndroidToolchain -SdkRoot $resolvedSdkRoot
$javaHome = Split-Path -Parent (Split-Path -Parent $toolchain.JavaPath)
$env:JAVA_HOME = $javaHome

$preferredPackageList = Get-PreferredPackageList -CsvValue $PreferredSystemImagePackages
$installedSystemImages = Get-InstalledSystemImagePackages -SdkRoot $resolvedSdkRoot
$systemImageSelection = Resolve-SystemImageSelection -InstalledPackages $installedSystemImages -PreferredPackages $preferredPackageList

Write-LogHeader -ResolvedLogPath $logAbs -Title "Function Kit Contract Runner"
Append-LogText -ResolvedLogPath $logAbs -Text ("Android SDK root: {0}" -f $resolvedSdkRoot)
Append-LogText -ResolvedLogPath $logAbs -Text ("ANDROID_AVD_HOME: {0}" -f $resolvedAvdHome)
Append-LogText -ResolvedLogPath $logAbs -Text ("adb: {0}" -f $toolchain.AdbPath)
Append-LogText -ResolvedLogPath $logAbs -Text ("emulator: {0}" -f $toolchain.EmulatorPath)
Append-LogText -ResolvedLogPath $logAbs -Text ("sdkmanager: {0}" -f $(if ([string]::IsNullOrWhiteSpace($toolchain.SdkManagerPath)) { "<missing>" } else { $toolchain.SdkManagerPath }))
Append-LogText -ResolvedLogPath $logAbs -Text ("avdmanager: {0}" -f $(if ([string]::IsNullOrWhiteSpace($toolchain.AvdManagerPath)) { "<missing>" } else { $toolchain.AvdManagerPath }))
Append-LogText -ResolvedLogPath $logAbs -Text ("java: {0}" -f $toolchain.JavaPath)

$metadata = Resolve-InstrumentationMetadata -ManifestPath $androidTestManifestAbs -FallbackInstrumentationPackage $InstrumentationPackage -FallbackTargetPackage $TargetPackage
$resolvedInstrumentationPackage = $metadata.InstrumentationPackage
$resolvedTargetPackage = $metadata.TargetPackage
$remoteResultPath = "/sdcard/Android/data/$resolvedTargetPackage/files/$RemoteResultRelativePath"

$existingAvds = Get-ExistingAvds -EmulatorPath $toolchain.EmulatorPath -ResolvedLogPath $logAbs
$deviceStates = @()
$connectedDevices = @()
$resolvedDeviceId = ""
$autoStartedEmulator = $null
$resolvedBuildAbi = if ([string]::IsNullOrWhiteSpace($BuildAbi)) { "arm64-v8a" } else { $BuildAbi }
$resolvedMainApkAbs = Resolve-MainApkPathForAbi -TemplatePath $mainApkAbs -Abi $resolvedBuildAbi

if ($Mode -eq "doctor" -or $Mode -eq "run") {
  $deviceStates = Get-AdbDeviceStates -AdbPath $toolchain.AdbPath -ResolvedLogPath $logAbs
  $connectedDevices = @($deviceStates | Where-Object { $_.State -eq "device" } | ForEach-Object { $_.Serial })
}

if ($Mode -eq "doctor") {
  $accelCheckOutput = @()
  if (-not [string]::IsNullOrWhiteSpace($toolchain.EmulatorCheckPath)) {
    $accelCheck = Invoke-LoggedNativeCommand -FilePath $toolchain.EmulatorCheckPath -Arguments @("accel") -ResolvedLogPath $logAbs -AllowFailure
    $accelCheckOutput = @($accelCheck.Output)
  }

  $summary = [pscustomobject]@{
    connected_devices = @($connectedDevices)
    device_states = @($deviceStates)
    selected_device = $(Resolve-TargetDevice -ConnectedDevices $connectedDevices -RequestedDeviceId $DeviceId -Mode $Mode)
    main_apk_exists = (Test-Path $mainApkAbs)
    android_test_apk_exists = (Test-Path $androidTestApkAbs)
    android_test_manifest_exists = (Test-Path $androidTestManifestAbs)
    instrumentation_package = $resolvedInstrumentationPackage
    target_package = $resolvedTargetPackage
    instrumentation_runner = $InstrumentationRunner
    test_class = $TestClass
    remote_result_path = $remoteResultPath
    build_script = $buildScriptAbs
    build_gradle_tasks = $BuildGradleTasks
    android_sdk_root = $resolvedSdkRoot
    android_avd_home = $resolvedAvdHome
    adb_path = $toolchain.AdbPath
    emulator_path = $toolchain.EmulatorPath
    sdkmanager_path = $toolchain.SdkManagerPath
    avdmanager_path = $toolchain.AvdManagerPath
    java_path = $toolchain.JavaPath
    installed_system_images = @($installedSystemImages)
    preferred_system_images = @($preferredPackageList)
    selected_system_image = $systemImageSelection.SelectedPackage
    selected_system_image_source = $systemImageSelection.SelectedFrom
    existing_avds = @($existingAvds)
    auto_start_enabled = (-not $SkipEmulatorAutoStart)
    resolved_build_abi = $resolvedBuildAbi
    emulator_accel_check = @($accelCheckOutput)
  }
  $doctorJson = $summary | ConvertTo-Json -Depth 6
  Append-LogText -ResolvedLogPath $logAbs -Text ""
  Append-LogText -ResolvedLogPath $logAbs -Text $doctorJson
  Write-Host $doctorJson
  Set-Content -Path $exitAbs -Encoding ascii -Value 0
  return
}

if ($Mode -eq "run") {
  if ($connectedDevices.Count -eq 0 -and [string]::IsNullOrWhiteSpace($DeviceId) -and -not $SkipEmulatorAutoStart) {
    $toolchain = Ensure-AndroidCmdlineTools -SdkRoot $resolvedSdkRoot -ResolvedLogPath $logAbs
    $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $toolchain.JavaPath)

    Ensure-SystemImageInstalled -SdkRoot $resolvedSdkRoot -SdkManagerPath $toolchain.SdkManagerPath -PackagePath $systemImageSelection.SelectedPackage -ResolvedLogPath $logAbs
    Ensure-AvdExists -AvdName $AvdName -SystemImagePackage $systemImageSelection.SelectedPackage -AndroidAvdHome $resolvedAvdHome -AvdManagerPath $toolchain.AvdManagerPath -EmulatorPath $toolchain.EmulatorPath -ResolvedLogPath $logAbs
    $existingAvds = Get-ExistingAvds -EmulatorPath $toolchain.EmulatorPath -ResolvedLogPath $logAbs
    $autoStartedEmulator = Start-AndroidEmulator -EmulatorPath $toolchain.EmulatorPath -AdbPath $toolchain.AdbPath -AvdName $AvdName -ResolvedLogPath $logAbs -LaunchTimeoutSeconds $EmulatorLaunchTimeoutSeconds -BootTimeoutSeconds $EmulatorBootTimeoutSeconds
    $deviceStates = Get-AdbDeviceStates -AdbPath $toolchain.AdbPath -ResolvedLogPath $logAbs
    $connectedDevices = @($deviceStates | Where-Object { $_.State -eq "device" } | ForEach-Object { $_.Serial })
  }

  $resolvedDeviceId = Resolve-TargetDevice -ConnectedDevices $connectedDevices -RequestedDeviceId $DeviceId -Mode $Mode
  if ([string]::IsNullOrWhiteSpace($BuildAbi)) {
    $resolvedBuildAbi = Get-DevicePrimaryAbi -AdbPath $toolchain.AdbPath -DeviceId $resolvedDeviceId -ResolvedLogPath $logAbs
  }
  $resolvedMainApkAbs = Resolve-MainApkPathForAbi -TemplatePath $mainApkAbs -Abi $resolvedBuildAbi
}

Append-LogText -ResolvedLogPath $logAbs -Text ("Resolved build ABI: {0}" -f $resolvedBuildAbi)
Append-LogText -ResolvedLogPath $logAbs -Text ("Resolved main APK path: {0}" -f $resolvedMainApkAbs)
Append-LogText -ResolvedLogPath $logAbs -Text ("Resolved build script: {0}" -f $buildScriptAbs)

if (-not $SkipBuild -and ($Mode -eq "build" -or $Mode -eq "run")) {
  $buildScriptArguments = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $buildScriptAbs,
    "-Abi", $resolvedBuildAbi,
    "-GradleTasks", $BuildGradleTasks,
    "-LogPath", $BuildLogPath
  )
  if ($buildScriptAbs -like "*run_fcitx5_android_debug_local.ps1") {
    $buildScriptArguments += @("-AndroidSdkRoot", $resolvedSdkRoot)
  }

  Invoke-LoggedNativeCommand -FilePath $powerShellPath -Arguments $buildScriptArguments -ResolvedLogPath $logAbs | Out-Null
}

if (-not (Test-Path $resolvedMainApkAbs)) {
  throw "Missing main APK: $resolvedMainApkAbs"
}
if (-not (Test-Path $androidTestApkAbs)) {
  throw "Missing AndroidTest APK: $androidTestApkAbs"
}

if ($Mode -eq "build") {
  Write-Host "Android Function Kit contract build succeeded."
  Write-Host "ABI: $resolvedBuildAbi"
  Write-Host "Main APK: $resolvedMainApkAbs"
  Write-Host "AndroidTest APK: $androidTestApkAbs"
  Set-Content -Path $exitAbs -Encoding ascii -Value 0
  return
}

try {
  $adbPrefix = Get-AdbPrefix -ResolvedDeviceId $resolvedDeviceId

  if (-not $SkipInstall) {
    Install-AdbPackage -AdbPath $toolchain.AdbPath -AdbPrefix $adbPrefix -PackageId $resolvedTargetPackage -ApkPath $resolvedMainApkAbs -ResolvedLogPath $logAbs
    Install-AdbPackage -AdbPath $toolchain.AdbPath -AdbPrefix $adbPrefix -PackageId $resolvedInstrumentationPackage -ApkPath $androidTestApkAbs -ResolvedLogPath $logAbs -TestOnly
  }

  Invoke-LoggedNativeCommand -FilePath $toolchain.AdbPath -Arguments ($adbPrefix + @("shell", "rm", "-f", $remoteResultPath)) -ResolvedLogPath $logAbs -AllowFailure | Out-Null

  $instrumentResult = Invoke-LoggedNativeCommand -FilePath $toolchain.AdbPath -Arguments ($adbPrefix + @(
    "shell", "am", "instrument",
    "-w",
    "-e", "class", $TestClass,
    "$resolvedInstrumentationPackage/$InstrumentationRunner"
  )) -ResolvedLogPath $logAbs

  $instrumentOutputText = $instrumentResult.Output -join "`n"
  if (
    $instrumentResult.ExitCode -ne 0 -or
    $instrumentOutputText -match 'FAILURES!!!' -or
    $instrumentOutputText -match 'INSTRUMENTATION_FAILED' -or
    $instrumentOutputText -match 'Process crashed'
  ) {
    throw "Instrumentation failed, see $logAbs"
  }

  if (-not $SkipResultPull) {
    Invoke-LoggedNativeCommand -FilePath $toolchain.AdbPath -Arguments ($adbPrefix + @("pull", $remoteResultPath, $resultAbs)) -ResolvedLogPath $logAbs | Out-Null
  }

  Set-Content -Path $exitAbs -Encoding ascii -Value 0
  Write-Host "Android Function Kit contract run completed."
  Write-Host "Device: $resolvedDeviceId"
  Write-Host "Log: $logAbs"
  if ($null -ne $autoStartedEmulator) {
    Write-Host "Auto-started emulator: $($autoStartedEmulator.Serial)"
    Write-Host "Emulator stdout log: $($autoStartedEmulator.StdOutLogPath)"
    Write-Host "Emulator stderr log: $($autoStartedEmulator.StdErrLogPath)"
  }
  if (-not $SkipResultPull) {
    Write-Host "Result: $resultAbs"
  } else {
    Write-Host "Remote result: $remoteResultPath"
  }
} finally {
  if ($null -ne $autoStartedEmulator -and -not $KeepEmulatorRunning) {
    Stop-AndroidEmulator -AdbPath $toolchain.AdbPath -DeviceId $autoStartedEmulator.Serial -ResolvedLogPath $logAbs
  }
}
