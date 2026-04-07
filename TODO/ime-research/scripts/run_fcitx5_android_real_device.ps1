param(
  [ValidateSet("doctor", "run")]
  [string]$Mode = "run",
  [string]$DeviceId = "",
  [string]$BuildAbi = "",
  [string]$AndroidSdkRoot = "",
  [string]$BuildScriptPath = "",
  [string]$MainApkPath = "TODO/ime-research/repos/fcitx5-android/app/build/outputs/apk/debug/org.fcitx.fcitx5.android-fe3a618-arm64-v8a-debug.apk",
  [string]$ArtifactApkDir = "TODO/ime-research/artifacts/apks",
  [string]$PackageId = "org.fcitx.fcitx5.android.debug",
  [string]$ImeServiceClass = "org.fcitx.fcitx5.android.input.FcitxInputMethodService",
  [string]$MainActivityClass = "org.fcitx.fcitx5.android.ui.main.MainActivity",
  [string]$BuildLogPath = "",
  [string]$LogPath = "",
  [switch]$SkipBuild,
  [switch]$SkipInstall,
  [switch]$SkipCoreDataSelfHeal,
  [int]$CoreDataSelfHealTimeoutSeconds = 30,
  [switch]$SkipImeEnable,
  [switch]$SkipImeSet,
  [switch]$SkipLaunchMainActivity,
  [switch]$OpenInputMethodSettings,
  [switch]$CaptureLogcatSnapshot,
  [switch]$ConfigureFunctionKitRemote,
  [switch]$EnableFunctionKitRemoteInference,
  [string]$FunctionKitRemoteBaseUrl = "",
  [string]$FunctionKitRemoteAuthToken = "",
  [int]$FunctionKitRemoteTimeoutSeconds = 20
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

function Resolve-AdbPath([string]$SdkRoot) {
  $adbCommand = Get-Command adb.exe -ErrorAction SilentlyContinue
  $resolved = Resolve-ExistingPath -Candidates @(
    (Join-Path $SdkRoot "platform-tools\adb.exe"),
    $(if ($null -ne $adbCommand) { $adbCommand.Source } else { "" })
  )
  if ([string]::IsNullOrWhiteSpace($resolved)) {
    throw "adb.exe not found. Install Android platform-tools or set ANDROID_SDK_ROOT."
  }
  return $resolved
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

function Append-LogText(
  [string]$ResolvedLogPath,
  [string]$Text
) {
  $payload = if ($null -eq $Text) { [Environment]::NewLine } else { $Text + [Environment]::NewLine }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::AppendAllText($ResolvedLogPath, $payload, $utf8)
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

function Write-LogHeader(
  [string]$ResolvedLogPath,
  [string]$Title
) {
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ""
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("=== {0} ===" -f $Title)
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
  [string[]]$Arguments
) {
  if ($null -eq $Arguments) {
    $Arguments = @()
  }

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $FilePath @Arguments 2>&1
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
  [switch]$AllowFailure
) {
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ""
  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text ("--- {0}" -f (Format-NativeCommand -FilePath $FilePath -Arguments $Arguments))

  $result = Invoke-NativeCommand -FilePath $FilePath -Arguments $Arguments
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

function Resolve-TargetDevice(
  [object[]]$DeviceStates,
  [string]$RequestedDeviceId
) {
  $connectedDevices = @($DeviceStates | Where-Object { $_.State -eq "device" } | ForEach-Object { $_.Serial })
  if (-not [string]::IsNullOrWhiteSpace($RequestedDeviceId)) {
    if ($connectedDevices -notcontains $RequestedDeviceId) {
      throw "Requested adb device not connected: $RequestedDeviceId"
    }
    return $RequestedDeviceId
  }

  if ($connectedDevices.Count -eq 0) {
    throw "No adb device detected. Connect your phone and confirm USB debugging authorization."
  }

  $physicalDevices = @($connectedDevices | Where-Object { $_ -notmatch '^emulator-\d+$' })
  if ($physicalDevices.Count -eq 1) {
    return $physicalDevices[0]
  }
  if ($connectedDevices.Count -eq 1) {
    return $connectedDevices[0]
  }
  if ($physicalDevices.Count -gt 1) {
    throw "Multiple physical Android devices detected: $($physicalDevices -join ', '). Use -DeviceId to choose one."
  }
  throw "Multiple adb devices detected: $($connectedDevices -join ', '). Use -DeviceId to choose one."
}

function Get-AdbPrefix([string]$ResolvedDeviceId) {
  if ([string]::IsNullOrWhiteSpace($ResolvedDeviceId)) {
    return @()
  }
  return @("-s", $ResolvedDeviceId)
}

function Get-DevicePrimaryAbi(
  [string]$AdbPath,
  [string]$DeviceId,
  [string]$ResolvedLogPath
) {
  $primaryResult = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments @("-s", $DeviceId, "shell", "getprop", "ro.product.cpu.abi") -ResolvedLogPath $ResolvedLogPath -AllowFailure
  if ($primaryResult.ExitCode -eq 0) {
    $abi = ($primaryResult.Output -join "").Trim()
    if (-not [string]::IsNullOrWhiteSpace($abi)) {
      return $abi
    }
  }

  $listResult = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments @("-s", $DeviceId, "shell", "getprop", "ro.product.cpu.abilist") -ResolvedLogPath $ResolvedLogPath -AllowFailure
  if ($listResult.ExitCode -eq 0) {
    $abilist = ($listResult.Output -join "").Trim()
    if (-not [string]::IsNullOrWhiteSpace($abilist)) {
      return ($abilist.Split(",") | Select-Object -First 1).Trim()
    }
  }

  throw "Could not determine device ABI for $DeviceId."
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

function Find-LatestBuildOutputApk(
  [string]$BuildOutputDirAbs,
  [string]$Abi
) {
  if ([string]::IsNullOrWhiteSpace($BuildOutputDirAbs) -or -not (Test-Path $BuildOutputDirAbs)) {
    return ""
  }

  $filter = if ([string]::IsNullOrWhiteSpace($Abi)) { "*-debug.apk" } else { "*-$Abi-debug.apk" }
  $candidates =
    Get-ChildItem -Path $BuildOutputDirAbs -File -Filter $filter -ErrorAction SilentlyContinue | Where-Object {
      $_.Name -match '^org\.fcitx\.fcitx5\.android-.*-debug\.apk$'
    } | Sort-Object LastWriteTime -Descending

  $candidate = $candidates | Select-Object -First 1
  if ($null -eq $candidate) {
    return ""
  }

  return $candidate.FullName
}

function Find-LatestArtifactApk(
  [string]$ArtifactDirAbs,
  [string]$Abi
) {
  if (-not (Test-Path $ArtifactDirAbs)) {
    return ""
  }

  $candidates = Get-ChildItem -Path $ArtifactDirAbs -File -Filter "*.apk" | Where-Object {
    $_.Name -match 'fcitx5-android' -and
    $_.Name -match [regex]::Escape($Abi) -and
    $_.Name -match 'debug' -and
    $_.Name -match 'functionkit'
  } | Sort-Object LastWriteTime -Descending

  $candidate = $candidates | Select-Object -First 1
  if ($null -eq $candidate) {
    return ""
  }
  return $candidate.FullName
}

function Resolve-InstallApkPath(
  [string]$WorkspaceRoot,
  [string]$TemplateMainApkPath,
  [string]$ArtifactApkDir,
  [string]$Abi
) {
  $resolvedBuildApk = Get-AbsolutePath -WorkspaceRoot $WorkspaceRoot -Path (Resolve-MainApkPathForAbi -TemplatePath $TemplateMainApkPath -Abi $Abi)
  if (Test-Path $resolvedBuildApk) {
    return $resolvedBuildApk
  }

  $latestBuildOutput = Find-LatestBuildOutputApk -BuildOutputDirAbs (Split-Path $resolvedBuildApk -Parent) -Abi $Abi
  if (-not [string]::IsNullOrWhiteSpace($latestBuildOutput)) {
    return $latestBuildOutput
  }

  $artifactDirAbs = Get-AbsolutePath -WorkspaceRoot $WorkspaceRoot -Path $ArtifactApkDir
  $latestArtifact = Find-LatestArtifactApk -ArtifactDirAbs $artifactDirAbs -Abi $Abi
  if (-not [string]::IsNullOrWhiteSpace($latestArtifact)) {
    return $latestArtifact
  }

  return $resolvedBuildApk
}

function Install-AdbPackage(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$PackageId,
  [string]$ApkPath,
  [string]$ResolvedLogPath
) {
  $installArguments = New-Object System.Collections.Generic.List[string]
  foreach ($part in $AdbPrefix) {
    $installArguments.Add($part)
  }
  $installArguments.Add("install")
  $installArguments.Add("--no-incremental")
  $installArguments.Add("-r")
  $installArguments.Add("-d")
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
  }

  throw "adb install failed: $ApkPath"
}

function Get-FcitxCoreDataStatus(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$PackageId
) {
  $idResult = Invoke-NativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "run-as", $PackageId, "id"))
  if ($idResult.ExitCode -ne 0) {
    return [pscustomobject]@{
      checkable = $false
      present = $null
      error = ($idResult.Output -join "`n").Trim()
    }
  }

  $sentinelPaths = @(
    "/data/user_de/0/$PackageId/usr/share/fcitx5/addon/androidfrontend.conf",
    "/data/user_de/0/$PackageId/usr/share/fcitx5/addon/androidkeyboard.conf"
  )

  foreach ($path in $sentinelPaths) {
    $result = Invoke-NativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "run-as", $PackageId, "ls", $path))
    if ($result.ExitCode -ne 0) {
      return [pscustomobject]@{
        checkable = $true
        present = $false
        error = ""
      }
    }
  }

  return [pscustomobject]@{
    checkable = $true
    present = $true
    error = ""
  }
}

function Ensure-FcitxCoreDataPresent(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$PackageId,
  [string]$MainActivityClass,
  [int]$TimeoutSeconds,
  [string]$ResolvedLogPath,
  [bool]$ShouldForceStopAfterWarmUp
) {
  $status = Get-FcitxCoreDataStatus -AdbPath $AdbPath -AdbPrefix $AdbPrefix -PackageId $PackageId
  if (-not $status.checkable) {
    Append-LogText -ResolvedLogPath $ResolvedLogPath -Text "Core data self-heal skipped: adb run-as is not available (device locked or ROM restrictions)."
    if (-not [string]::IsNullOrWhiteSpace($status.error)) {
      Append-LogText -ResolvedLogPath $ResolvedLogPath -Text $status.error
    }
    return [pscustomobject]@{ present = $null; repaired = $false }
  }

  if ($status.present) {
    Append-LogText -ResolvedLogPath $ResolvedLogPath -Text "Core data is present."
    return [pscustomobject]@{ present = $true; repaired = $false }
  }

  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text "Core data is missing; attempting self-heal (delete descriptor/usr and warm up once)."

  $null = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "am", "force-stop", $PackageId)) -ResolvedLogPath $ResolvedLogPath -AllowFailure
  $null = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "run-as", $PackageId, "rm", "-f", "/data/user_de/0/$PackageId/descriptor.json")) -ResolvedLogPath $ResolvedLogPath -AllowFailure
  $null = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "run-as", $PackageId, "rm", "-rf", "/data/user_de/0/$PackageId/usr")) -ResolvedLogPath $ResolvedLogPath -AllowFailure
  # Best-effort: clean credential-encrypted copy too (some Android versions previously used it).
  $null = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "run-as", $PackageId, "rm", "-f", "/data/user/0/$PackageId/descriptor.json")) -ResolvedLogPath $ResolvedLogPath -AllowFailure
  $null = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "run-as", $PackageId, "rm", "-rf", "/data/user/0/$PackageId/usr")) -ResolvedLogPath $ResolvedLogPath -AllowFailure

  if (-not [string]::IsNullOrWhiteSpace($MainActivityClass)) {
    $null = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "am", "start", "-W", "-n", "$PackageId/$MainActivityClass")) -ResolvedLogPath $ResolvedLogPath -AllowFailure
  }

  $deadline = [DateTimeOffset]::UtcNow.AddSeconds([Math]::Max($TimeoutSeconds, 1))
  while ([DateTimeOffset]::UtcNow -lt $deadline) {
    $poll = Get-FcitxCoreDataStatus -AdbPath $AdbPath -AdbPrefix $AdbPrefix -PackageId $PackageId
    if ($poll.checkable -and $poll.present) {
      Append-LogText -ResolvedLogPath $ResolvedLogPath -Text "Core data self-heal succeeded."
      if ($ShouldForceStopAfterWarmUp) {
        $null = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "am", "force-stop", $PackageId)) -ResolvedLogPath $ResolvedLogPath -AllowFailure
      }
      return [pscustomobject]@{ present = $true; repaired = $true }
    }
    Start-Sleep -Seconds 1
  }

  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text "Core data self-heal timed out."
  return [pscustomobject]@{ present = $false; repaired = $true }
}

function Resolve-ImeId(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$PackageId,
  [string]$ImeServiceClass,
  [string]$ResolvedLogPath
) {
  $expectedId = "$PackageId/$ImeServiceClass"
  $ids = Get-AllInputMethodIds -AdbPath $AdbPath -AdbPrefix $AdbPrefix -ResolvedLogPath $ResolvedLogPath
  if ($ids -contains $expectedId) {
    return $expectedId
  }

  $matchingId = $ids | Where-Object {
    $_ -like "$PackageId/*" -or $_ -like "*/$ImeServiceClass"
  } | Select-Object -First 1

  if (-not [string]::IsNullOrWhiteSpace($matchingId)) {
    return $matchingId
  }

  return $expectedId
}

function Get-DefaultSharedPreferencesFileName([string]$PackageId) {
  return "{0}_preferences.xml" -f $PackageId
}

function Invoke-NativeCommandChecked(
  [string]$FilePath,
  [string[]]$Arguments,
  [string]$FailureMessage
) {
  $result = Invoke-NativeCommand -FilePath $FilePath -Arguments $Arguments
  if ($result.ExitCode -ne 0) {
    $detail = ($result.Output -join [Environment]::NewLine).Trim()
    if ([string]::IsNullOrWhiteSpace($detail)) {
      throw $FailureMessage
    }
    throw "{0}`n{1}" -f $FailureMessage, $detail
  }
  return $result
}

function Ensure-PreferencesXmlDocument([string]$RawXml) {
  $content = if ([string]::IsNullOrWhiteSpace($RawXml)) { "<map />" } else { $RawXml }
  [xml]$document = $content
  if ($null -eq $document.DocumentElement -or $document.DocumentElement.Name -ne "map") {
    $document = New-Object System.Xml.XmlDocument
    $null = $document.AppendChild($document.CreateXmlDeclaration("1.0", "utf-8", "yes"))
    $null = $document.AppendChild($document.CreateElement("map"))
  } elseif ($null -eq $document.FirstChild -or $document.FirstChild.NodeType -ne [System.Xml.XmlNodeType]::XmlDeclaration) {
    $declaration = $document.CreateXmlDeclaration("1.0", "utf-8", "yes")
    $null = $document.InsertBefore($declaration, $document.DocumentElement)
  }
  return $document
}

function Set-SharedPreferenceValue(
  [xml]$Document,
  [string]$Type,
  [string]$Name,
  [object]$Value
) {
  $root = $Document.DocumentElement
  $existingNodes = @($root.ChildNodes | Where-Object {
      $_.NodeType -eq [System.Xml.XmlNodeType]::Element -and
      $_.Attributes["name"] -and
      $_.Attributes["name"].Value -eq $Name
    })
  foreach ($node in $existingNodes) {
    $null = $root.RemoveChild($node)
  }

  if ($null -eq $Value) {
    return
  }

  $element = $Document.CreateElement($Type)
  $nameAttribute = $Document.CreateAttribute("name")
  $nameAttribute.Value = $Name
  $null = $element.Attributes.Append($nameAttribute)

  switch ($Type) {
    "boolean" {
      $valueAttribute = $Document.CreateAttribute("value")
      $valueAttribute.Value = if ([bool]$Value) { "true" } else { "false" }
      $null = $element.Attributes.Append($valueAttribute)
    }
    "int" {
      $valueAttribute = $Document.CreateAttribute("value")
      $valueAttribute.Value = [string]([int]$Value)
      $null = $element.Attributes.Append($valueAttribute)
    }
    "string" {
      $element.InnerText = [string]$Value
    }
    default {
      throw "Unsupported SharedPreferences XML node type: $Type"
    }
  }

  $null = $root.AppendChild($element)
}

function Configure-FunctionKitRemotePreferences(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$PackageId,
  [bool]$RemoteInferenceEnabled,
  [string]$RemoteBaseUrl,
  [string]$RemoteAuthToken,
  [int]$RemoteTimeoutSeconds,
  [string]$ResolvedLogPath
) {
  $prefsFileName = Get-DefaultSharedPreferencesFileName -PackageId $PackageId
  $sharedPrefsPath = "shared_prefs/$prefsFileName"
  $remoteTempPath = "/data/local/tmp/$prefsFileName"
  $localTempPath = [System.IO.Path]::Combine(
    [System.IO.Path]::GetTempPath(),
    ("fcitx5_android_functionkit_{0}" -f $prefsFileName)
  )

  Append-LogText -ResolvedLogPath $ResolvedLogPath -Text (
    "Configuring Function Kit remote prefs: enabled={0}; baseUrl={1}; tokenConfigured={2}; timeoutSeconds={3}" -f
    $RemoteInferenceEnabled,
    $RemoteBaseUrl,
    (-not [string]::IsNullOrWhiteSpace($RemoteAuthToken)),
    $RemoteTimeoutSeconds
  )

  try {
    $null = Invoke-NativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "am", "force-stop", $PackageId))

    $readResult = Invoke-NativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "run-as", $PackageId, "cat", $sharedPrefsPath))
    $rawXml = if ($readResult.ExitCode -eq 0) { [string]::Join([Environment]::NewLine, $readResult.Output) } else { "" }

    $document = Ensure-PreferencesXmlDocument -RawXml $rawXml
    Set-SharedPreferenceValue -Document $document -Type "boolean" -Name "function_kit_remote_inference_enabled" -Value $RemoteInferenceEnabled
    Set-SharedPreferenceValue -Document $document -Type "string" -Name "function_kit_remote_base_url" -Value $RemoteBaseUrl
    Set-SharedPreferenceValue -Document $document -Type "string" -Name "function_kit_remote_auth_token" -Value $RemoteAuthToken
    Set-SharedPreferenceValue -Document $document -Type "int" -Name "function_kit_remote_timeout_seconds" -Value $RemoteTimeoutSeconds

    $settings = New-Object System.Xml.XmlWriterSettings
    $settings.Encoding = New-Object System.Text.UTF8Encoding($false)
    $settings.Indent = $true
    $settings.OmitXmlDeclaration = $false

    $writer = [System.Xml.XmlWriter]::Create($localTempPath, $settings)
    try {
      $document.Save($writer)
    } finally {
      $writer.Dispose()
    }

    Invoke-NativeCommandChecked -FilePath $AdbPath -Arguments ($AdbPrefix + @("push", $localTempPath, $remoteTempPath)) -FailureMessage "Failed to push SharedPreferences XML to device." | Out-Null
    $null = Invoke-NativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "run-as", $PackageId, "mkdir", "shared_prefs"))
    Invoke-NativeCommandChecked -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "run-as", $PackageId, "cp", $remoteTempPath, $sharedPrefsPath)) -FailureMessage "Failed to write Function Kit remote prefs into app sandbox." | Out-Null

    $verifyResult = Invoke-NativeCommandChecked -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "run-as", $PackageId, "cat", $sharedPrefsPath)) -FailureMessage "Failed to verify Function Kit remote prefs after write."
    $verifiedXml = [string]::Join([Environment]::NewLine, $verifyResult.Output)
    if ($verifiedXml -notmatch 'function_kit_remote_inference_enabled' -or $verifiedXml -notmatch 'function_kit_remote_base_url') {
      throw "Function Kit remote prefs verification failed because required keys are still missing."
    }
  } finally {
    if (Test-Path $localTempPath) {
      Remove-Item -Force $localTempPath
    }
    $null = Invoke-NativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "rm", "-f", $remoteTempPath))
  }

  return [pscustomobject]@{
    configured = $true
    remote_inference_enabled = $RemoteInferenceEnabled
    remote_base_url = $RemoteBaseUrl
    remote_auth_token_configured = (-not [string]::IsNullOrWhiteSpace($RemoteAuthToken))
    remote_timeout_seconds = $RemoteTimeoutSeconds
  }
}

function Get-DefaultInputMethodId(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$ResolvedLogPath
) {
  $result = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "settings", "get", "secure", "default_input_method")) -ResolvedLogPath $ResolvedLogPath -AllowFailure
  if ($result.ExitCode -ne 0) {
    return ""
  }
  return ($result.Output -join "").Trim()
}

function Get-AllInputMethodIds(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$ResolvedLogPath
) {
  $result = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "ime", "list", "-a")) -ResolvedLogPath $ResolvedLogPath -AllowFailure
  if ($result.ExitCode -ne 0) {
    return @()
  }

  $ids = New-Object System.Collections.Generic.List[string]
  foreach ($line in $result.Output) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^([^\s:]+/[^\s:]+):$') {
      $ids.Add($Matches[1])
      continue
    }
    if ($trimmed -match '^mId=([^\s]+)') {
      $ids.Add($Matches[1])
    }
  }
  return @($ids | Sort-Object -Unique)
}

function Get-EnabledInputMethodIds(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$ResolvedLogPath
) {
  $result = Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "ime", "list", "-s")) -ResolvedLogPath $ResolvedLogPath -AllowFailure
  if ($result.ExitCode -ne 0) {
    return @()
  }
  return @($result.Output | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Start-MainActivity(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$PackageId,
  [string]$MainActivityClass,
  [string]$ResolvedLogPath
) {
  $component = "$PackageId/$MainActivityClass"
  Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "am", "start", "-n", $component)) -ResolvedLogPath $ResolvedLogPath | Out-Null
}

function Open-InputMethodSettings(
  [string]$AdbPath,
  [string[]]$AdbPrefix,
  [string]$ResolvedLogPath
) {
  Invoke-LoggedNativeCommand -FilePath $AdbPath -Arguments ($AdbPrefix + @("shell", "am", "start", "-a", "android.settings.INPUT_METHOD_SETTINGS")) -ResolvedLogPath $ResolvedLogPath -AllowFailure | Out-Null
}

function Save-JsonUtf8(
  [string]$Path,
  [object]$Value
) {
  $json = $Value | ConvertTo-Json -Depth 8
  Set-Content -Path $Path -Encoding utf8 -Value $json
}

$workspaceRoot = Resolve-WorkspaceRoot
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = "TODO/ime-research/logs/${stamp}_fcitx5-android_real_device_${Mode}.log"
}
if ([string]::IsNullOrWhiteSpace($BuildLogPath)) {
  $BuildLogPath = "TODO/ime-research/logs/${stamp}_fcitx5-android_real_device_build.log"
}

$logAbs = Get-AbsolutePath -WorkspaceRoot $workspaceRoot -Path $LogPath
$buildLogAbs = Get-AbsolutePath -WorkspaceRoot $workspaceRoot -Path $BuildLogPath
$summaryAbs = [System.IO.Path]::ChangeExtension($logAbs, ".json")
$exitAbs = [System.IO.Path]::ChangeExtension($logAbs, ".exitcode.txt")
$logcatAbs = [System.IO.Path]::ChangeExtension($logAbs, ".logcat.txt")

Ensure-Dir (Split-Path -Parent $logAbs)
Ensure-Dir (Split-Path -Parent $buildLogAbs)
Set-Content -Path $logAbs -Encoding utf8 -Value ""
Set-Content -Path $exitAbs -Encoding ascii -Value 1

$resolvedSdkRoot = Resolve-AndroidSdkRoot -RequestedPath $AndroidSdkRoot
$adbPath = Resolve-AdbPath -SdkRoot $resolvedSdkRoot
$powerShellPath = Resolve-PowerShellPath
$buildScriptAbs = Resolve-PreferredBuildScriptPath -WorkspaceRoot $workspaceRoot -RequestedPath $BuildScriptPath
$shouldConfigureFunctionKitRemote =
  $ConfigureFunctionKitRemote.IsPresent -or
  $EnableFunctionKitRemoteInference.IsPresent -or
  (-not [string]::IsNullOrWhiteSpace($FunctionKitRemoteBaseUrl)) -or
  (-not [string]::IsNullOrWhiteSpace($FunctionKitRemoteAuthToken))

if (-not (Test-Path $buildScriptAbs)) {
  throw "Missing build script: $buildScriptAbs"
}

Write-LogHeader -ResolvedLogPath $logAbs -Title "Android Real Device Runner"
Append-LogText -ResolvedLogPath $logAbs -Text ("Android SDK root: {0}" -f $resolvedSdkRoot)
Append-LogText -ResolvedLogPath $logAbs -Text ("adb: {0}" -f $adbPath)

$deviceStates = Get-AdbDeviceStates -AdbPath $adbPath -ResolvedLogPath $logAbs
$resolvedDeviceId = Resolve-TargetDevice -DeviceStates $deviceStates -RequestedDeviceId $DeviceId
$adbPrefix = Get-AdbPrefix -ResolvedDeviceId $resolvedDeviceId
$resolvedBuildAbi = if ([string]::IsNullOrWhiteSpace($BuildAbi)) {
  Get-DevicePrimaryAbi -AdbPath $adbPath -DeviceId $resolvedDeviceId -ResolvedLogPath $logAbs
} else {
  $BuildAbi
}
$resolvedApkAbs = Resolve-InstallApkPath -WorkspaceRoot $workspaceRoot -TemplateMainApkPath $MainApkPath -ArtifactApkDir $ArtifactApkDir -Abi $resolvedBuildAbi
$imeId = "$PackageId/$ImeServiceClass"

Append-LogText -ResolvedLogPath $logAbs -Text ("Resolved device: {0}" -f $resolvedDeviceId)
Append-LogText -ResolvedLogPath $logAbs -Text ("Resolved ABI: {0}" -f $resolvedBuildAbi)
Append-LogText -ResolvedLogPath $logAbs -Text ("Resolved APK path: {0}" -f $resolvedApkAbs)
Append-LogText -ResolvedLogPath $logAbs -Text ("Resolved build script: {0}" -f $buildScriptAbs)

if ($Mode -eq "doctor") {
  $registeredImeIds = Get-AllInputMethodIds -AdbPath $adbPath -AdbPrefix $adbPrefix -ResolvedLogPath $logAbs
  $enabledImeIds = Get-EnabledInputMethodIds -AdbPath $adbPath -AdbPrefix $adbPrefix -ResolvedLogPath $logAbs
  $defaultImeId = Get-DefaultInputMethodId -AdbPath $adbPath -AdbPrefix $adbPrefix -ResolvedLogPath $logAbs
  $packagePathResult = Invoke-LoggedNativeCommand -FilePath $adbPath -Arguments ($adbPrefix + @("shell", "pm", "path", $PackageId)) -ResolvedLogPath $logAbs -AllowFailure
  $resolvedImeId = Resolve-ImeId -AdbPath $adbPath -AdbPrefix $adbPrefix -PackageId $PackageId -ImeServiceClass $ImeServiceClass -ResolvedLogPath $logAbs

  $summary = [pscustomobject]@{
    mode = $Mode
    generated_at = (Get-Date).ToString("o")
    connected_devices = @($deviceStates)
    selected_device = $resolvedDeviceId
    selected_device_abi = $resolvedBuildAbi
    apk_exists = (Test-Path $resolvedApkAbs)
    apk_path = $resolvedApkAbs
    package_id = $PackageId
    ime_id = $resolvedImeId
    package_installed = ($packagePathResult.ExitCode -eq 0 -and ($packagePathResult.Output -join "").Contains("package:"))
    registered_input_methods = @($registeredImeIds)
    enabled_input_methods = @($enabledImeIds)
    default_input_method = $defaultImeId
    fcitx_registered = ($registeredImeIds -contains $resolvedImeId)
    fcitx_enabled = ($enabledImeIds -contains $resolvedImeId)
    fcitx_selected = ($defaultImeId -eq $resolvedImeId)
    manual_enable_required = (($registeredImeIds -contains $resolvedImeId) -and ($enabledImeIds -notcontains $resolvedImeId))
  }
  Save-JsonUtf8 -Path $summaryAbs -Value $summary
  Append-LogText -ResolvedLogPath $logAbs -Text ""
  Append-LogText -ResolvedLogPath $logAbs -Text ($summary | ConvertTo-Json -Depth 8)
  Set-Content -Path $exitAbs -Encoding ascii -Value 0
  Write-Host ($summary | ConvertTo-Json -Depth 8)
  return
}

if (-not $SkipBuild) {
  $buildScriptArguments = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $buildScriptAbs,
    "-Abi", $resolvedBuildAbi,
    "-LogPath", $BuildLogPath
  )
  if ($buildScriptAbs -like "*run_fcitx5_android_debug_local.ps1") {
    $buildScriptArguments += @("-AndroidSdkRoot", $resolvedSdkRoot)
  }

  Invoke-LoggedNativeCommand -FilePath $powerShellPath -Arguments $buildScriptArguments -ResolvedLogPath $logAbs | Out-Null
  $resolvedApkAbs = Resolve-InstallApkPath -WorkspaceRoot $workspaceRoot -TemplateMainApkPath $MainApkPath -ArtifactApkDir $ArtifactApkDir -Abi $resolvedBuildAbi
}

if (-not $SkipInstall -and -not (Test-Path $resolvedApkAbs)) {
  throw "Missing APK for install: $resolvedApkAbs"
}

if (-not $SkipInstall) {
  Install-AdbPackage -AdbPath $adbPath -AdbPrefix $adbPrefix -PackageId $PackageId -ApkPath $resolvedApkAbs -ResolvedLogPath $logAbs
}

$functionKitRemoteConfig = $null
if ($shouldConfigureFunctionKitRemote) {
  $functionKitRemoteConfig =
    Configure-FunctionKitRemotePreferences `
      -AdbPath $adbPath `
      -AdbPrefix $adbPrefix `
      -PackageId $PackageId `
      -RemoteInferenceEnabled $EnableFunctionKitRemoteInference.IsPresent `
      -RemoteBaseUrl $FunctionKitRemoteBaseUrl.Trim() `
      -RemoteAuthToken $FunctionKitRemoteAuthToken.Trim() `
      -RemoteTimeoutSeconds $FunctionKitRemoteTimeoutSeconds `
      -ResolvedLogPath $logAbs
}

if (-not $SkipCoreDataSelfHeal) {
  $coreDataResult =
    Ensure-FcitxCoreDataPresent `
      -AdbPath $adbPath `
      -AdbPrefix $adbPrefix `
      -PackageId $PackageId `
      -MainActivityClass $MainActivityClass `
      -TimeoutSeconds $CoreDataSelfHealTimeoutSeconds `
      -ResolvedLogPath $logAbs `
      -ShouldForceStopAfterWarmUp $SkipLaunchMainActivity.IsPresent

  if ($coreDataResult.present -eq $false) {
    throw "Core data is still missing after self-heal. Unlock device and rerun, or uninstall the app to clear /data/user_de."
  }
} else {
  $coreDataResult = [pscustomobject]@{ present = $null; repaired = $false }
}

$imeId = Resolve-ImeId -AdbPath $adbPath -AdbPrefix $adbPrefix -PackageId $PackageId -ImeServiceClass $ImeServiceClass -ResolvedLogPath $logAbs

if (-not $SkipImeEnable) {
  $imeEnableResult = Invoke-LoggedNativeCommand -FilePath $adbPath -Arguments ($adbPrefix + @("shell", "ime", "enable", $imeId)) -ResolvedLogPath $logAbs -AllowFailure
} else {
  $imeEnableResult = [pscustomobject]@{ ExitCode = 0; Output = @() }
}
if (-not $SkipImeSet) {
  $imeSetResult = Invoke-LoggedNativeCommand -FilePath $adbPath -Arguments ($adbPrefix + @("shell", "ime", "set", $imeId)) -ResolvedLogPath $logAbs -AllowFailure
} else {
  $imeSetResult = [pscustomobject]@{ ExitCode = 0; Output = @() }
}

$registeredImeIds = Get-AllInputMethodIds -AdbPath $adbPath -AdbPrefix $adbPrefix -ResolvedLogPath $logAbs
$enabledImeIds = Get-EnabledInputMethodIds -AdbPath $adbPath -AdbPrefix $adbPrefix -ResolvedLogPath $logAbs
$defaultImeId = Get-DefaultInputMethodId -AdbPath $adbPath -AdbPrefix $adbPrefix -ResolvedLogPath $logAbs
$packagePathResult = Invoke-LoggedNativeCommand -FilePath $adbPath -Arguments ($adbPrefix + @("shell", "pm", "path", $PackageId)) -ResolvedLogPath $logAbs -AllowFailure
$openedInputMethodSettings = $false
$manualEnableRequired = (($registeredImeIds -contains $imeId) -and ($enabledImeIds -notcontains $imeId))

if ($OpenInputMethodSettings -or ($defaultImeId -ne $imeId)) {
  Open-InputMethodSettings -AdbPath $adbPath -AdbPrefix $adbPrefix -ResolvedLogPath $logAbs
  $openedInputMethodSettings = $true
}

if (-not $SkipLaunchMainActivity) {
  Start-MainActivity -AdbPath $adbPath -AdbPrefix $adbPrefix -PackageId $PackageId -MainActivityClass $MainActivityClass -ResolvedLogPath $logAbs
}

if ($CaptureLogcatSnapshot) {
  Invoke-LoggedNativeCommand -FilePath $adbPath -Arguments ($adbPrefix + @("logcat", "-d")) -ResolvedLogPath $logAbs -AllowFailure | Out-Null
  $logcatResult = Invoke-NativeCommand -FilePath $adbPath -Arguments ($adbPrefix + @("logcat", "-d"))
  Set-Content -Path $logcatAbs -Encoding utf8 -Value $logcatResult.Output
}

$summary = [pscustomobject]@{
  mode = $Mode
  generated_at = (Get-Date).ToString("o")
  selected_device = $resolvedDeviceId
  selected_device_abi = $resolvedBuildAbi
  apk_path = $resolvedApkAbs
  package_id = $PackageId
  ime_id = $imeId
  package_installed = ($packagePathResult.ExitCode -eq 0 -and ($packagePathResult.Output -join "").Contains("package:"))
  registered_input_methods = @($registeredImeIds)
  enabled_input_methods = @($enabledImeIds)
  default_input_method = $defaultImeId
  fcitx_registered = ($registeredImeIds -contains $imeId)
  fcitx_enabled = ($enabledImeIds -contains $imeId)
  fcitx_selected = ($defaultImeId -eq $imeId)
  manual_enable_required = $manualEnableRequired
  opened_input_method_settings = $openedInputMethodSettings
  launched_main_activity = (-not $SkipLaunchMainActivity)
  ime_enable_exit_code = $imeEnableResult.ExitCode
  ime_set_exit_code = $imeSetResult.ExitCode
  function_kit_remote_config = $functionKitRemoteConfig
  core_data_present = $coreDataResult.present
  core_data_repaired = $coreDataResult.repaired
  build_log_path = $buildLogAbs
  log_path = $logAbs
  logcat_path = $(if ($CaptureLogcatSnapshot) { $logcatAbs } else { "" })
}

Save-JsonUtf8 -Path $summaryAbs -Value $summary
Append-LogText -ResolvedLogPath $logAbs -Text ""
Append-LogText -ResolvedLogPath $logAbs -Text ($summary | ConvertTo-Json -Depth 8)

Set-Content -Path $exitAbs -Encoding ascii -Value 0

Write-Host "Android real-device run completed."
Write-Host "Device: $resolvedDeviceId"
Write-Host "ABI: $resolvedBuildAbi"
Write-Host "APK: $resolvedApkAbs"
Write-Host "IME ID: $imeId"
Write-Host "Default IME: $defaultImeId"
Write-Host "Summary: $summaryAbs"
