param(
  [string]$RepoDir = "TODO/ime-research/repos/fcitx5-android",
  [string]$Abi = "arm64-v8a",
  [string]$Image = "ghcr.io/cirruslabs/android-sdk:34",
  [string]$CacheVolume = "fcitx5-android-gradle-cache",
  [string]$GradleTasks = ":app:assembleDebug",
  [string]$DebugKeystorePath = "",
  [string]$DebugKeystorePassword = "android",
  [string]$DebugKeyAlias = "androiddebugkey",
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

function Resolve-DebugKeystorePath([string]$RequestedPath) {
  $candidates = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    $candidates.Add($RequestedPath)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:FCITX5_ANDROID_DEBUG_KEYSTORE_PATH)) {
    $candidates.Add($env:FCITX5_ANDROID_DEBUG_KEYSTORE_PATH)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $candidates.Add((Join-Path $env:USERPROFILE ".android\debug.keystore"))
  }
  return $candidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1
}

function Get-FirstNonBlank([string[]]$Candidates) {
  foreach ($candidate in $Candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      return $candidate.Trim()
    }
  }
  return ""
}

function Get-EnvFileValue(
  [string]$EnvFilePath,
  [string]$Key
) {
  if ([string]::IsNullOrWhiteSpace($EnvFilePath) -or -not (Test-Path $EnvFilePath)) {
    return ""
  }

  foreach ($rawLine in (Get-Content -Encoding UTF8 $EnvFilePath)) {
    if ($null -eq $rawLine) {
      continue
    }
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
      continue
    }
    $prefix = "$Key="
    if ($line.StartsWith($prefix)) {
      return $line.Substring($prefix.Length).Trim().Trim("'").Trim('"')
    }
  }

  return ""
}

function Resolve-AiBootstrapConfig {
  $envFilePath = ""
  if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $candidate = Join-Path $env:USERPROFILE ".openclaw\.env"
    if (Test-Path $candidate) {
      $envFilePath = $candidate
    }
  }

  $baseUrl = Get-FirstNonBlank @(
    $env:FCITX5_ANDROID_AI_BASE_URL,
    $env:OPENCLAW_DEEPSEEK_BASE_URL,
    $(Get-EnvFileValue -EnvFilePath $envFilePath -Key "OPENCLAW_DEEPSEEK_BASE_URL")
  )
  $apiKey = Get-FirstNonBlank @(
    $env:FCITX5_ANDROID_AI_API_KEY,
    $env:OPENCLAW_DEEPSEEK_API_KEY,
    $(Get-EnvFileValue -EnvFilePath $envFilePath -Key "OPENCLAW_DEEPSEEK_API_KEY")
  )
  $model = Get-FirstNonBlank @(
    $env:FCITX5_ANDROID_AI_MODEL,
    $env:OPENCLAW_DEEPSEEK_MODEL
  )
  if ([string]::IsNullOrWhiteSpace($model) -and (-not [string]::IsNullOrWhiteSpace($baseUrl) -or -not [string]::IsNullOrWhiteSpace($apiKey))) {
    $model = "deepseek-chat"
  }
  $timeoutSecondsText = Get-FirstNonBlank @(
    $env:FCITX5_ANDROID_AI_TIMEOUT_SECONDS
  )
  $timeoutSeconds = 20
  if (-not [string]::IsNullOrWhiteSpace($timeoutSecondsText)) {
    $parsedTimeout = 0
    if ([int]::TryParse($timeoutSecondsText, [ref]$parsedTimeout)) {
      $timeoutSeconds = [Math]::Min([Math]::Max($parsedTimeout, 1), 300)
    }
  }

  return [pscustomobject]@{
    BaseUrl = $baseUrl
    ApiKey = $apiKey
    Model = $model
    TimeoutSeconds = $timeoutSeconds
    Enabled = (-not [string]::IsNullOrWhiteSpace($baseUrl)) -and (-not [string]::IsNullOrWhiteSpace($apiKey)) -and (-not [string]::IsNullOrWhiteSpace($model))
  }
}

$workspaceRoot = Resolve-WorkspaceRoot
$functionKitWorkspaceAbs = Normalize-PathText ((Resolve-Path (Join-Path $workspaceRoot "TODO")).Path)
$repoAbs = Normalize-PathText ((Resolve-Path (Join-Path $workspaceRoot $RepoDir)).Path)
$scriptsAbs = Normalize-PathText ((Resolve-Path $PSScriptRoot).Path)
$resolvedDebugKeystorePath = Resolve-DebugKeystorePath -RequestedPath $DebugKeystorePath
$resolvedAiBootstrap = Resolve-AiBootstrapConfig
$debugKeystoreBase64 = ""
$sanitizedAbi = ($Abi -replace '[^A-Za-z0-9_.-]+', '_')
if ([string]::IsNullOrWhiteSpace($sanitizedAbi)) {
  $sanitizedAbi = "default"
}
$containerName = "fcitx5-android-build-$sanitizedAbi"
$gradleUserHome = "/gradle-cache/$sanitizedAbi"

if (-not [string]::IsNullOrWhiteSpace($resolvedDebugKeystorePath) -and (Test-Path $resolvedDebugKeystorePath)) {
  $debugKeystoreBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($resolvedDebugKeystorePath))
}

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $stamp = Get-Date -Format "yyyyMMdd"
  $sanitizedTasks = ($GradleTasks -replace '[^A-Za-z0-9]+', '_').Trim('_')
  if ([string]::IsNullOrWhiteSpace($sanitizedTasks)) {
    $sanitizedTasks = "gradle"
  }
  if ($sanitizedTasks.Length -gt 96) {
    $sanitizedTasks = $sanitizedTasks.Substring(0, 96).TrimEnd('_')
  }
  $LogPath = "TODO/ime-research/logs/${stamp}_fcitx5-android_${sanitizedTasks}_docker_${Abi}_rerun.log"
}

$logAbs = Join-Path $workspaceRoot $LogPath
$exitAbs = [System.IO.Path]::ChangeExtension($logAbs, ".exitcode.txt")
Ensure-Dir (Split-Path -Parent $logAbs)

$dockerArgs = @(
  "run",
  "--rm",
  "--name", $containerName,
  "-e", "GRADLE_USER_HOME=$gradleUserHome",
  "-e", "BUILD_ABI=$Abi",
  "-e", "GRADLE_TASKS=$GradleTasks",
  "-e", "FUNCTION_KIT_WORKSPACE_ROOT=/workspace-todo",
  "-e", "SIGN_KEY_BASE64=$debugKeystoreBase64",
  "-e", "SIGN_KEY_PWD=$DebugKeystorePassword",
  "-e", "SIGN_KEY_ALIAS=$DebugKeyAlias",
  "-e", "FCITX5_ANDROID_AI_BASE_URL=$($resolvedAiBootstrap.BaseUrl)",
  "-e", "FCITX5_ANDROID_AI_API_KEY=$($resolvedAiBootstrap.ApiKey)",
  "-e", "FCITX5_ANDROID_AI_MODEL=$($resolvedAiBootstrap.Model)",
  "-e", "FCITX5_ANDROID_AI_TIMEOUT_SECONDS=$($resolvedAiBootstrap.TimeoutSeconds)",
  "-v", "${CacheVolume}:/gradle-cache",
  "-v", "${functionKitWorkspaceAbs}:/workspace-todo",
  "-v", "${repoAbs}:/work",
  "-v", "${scriptsAbs}:/scripts",
  "-w", "/work",
  $Image,
  "bash", "-lc", "set -eux; /scripts/docker_build_fcitx5_android.sh"
)

if (-not [string]::IsNullOrWhiteSpace($debugKeystoreBase64)) {
  Write-Host "Using stable debug keystore: $resolvedDebugKeystorePath"
} else {
  Write-Host "Stable debug keystore not found; Docker build will fall back to container-generated debug signing."
}
if ($resolvedAiBootstrap.Enabled) {
  Write-Host "Using debug AI bootstrap: $($resolvedAiBootstrap.BaseUrl) ($($resolvedAiBootstrap.Model))"
}

$null = & cmd.exe /d /c "docker rm -f $containerName >nul 2>&1"

try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & docker @dockerArgs 2>&1 | Tee-Object -FilePath $logAbs
  $exitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
}

Set-Content -Path $exitAbs -Encoding ascii -Value $exitCode

if ($exitCode -ne 0) {
  throw "fcitx5-android docker build failed, see $logAbs"
}

Write-Host "Build succeeded. Log: $logAbs"
