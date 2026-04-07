param(
  [string]$RepoDir = "TODO/ime-research/repos/fcitx5-android",
  [string]$Abi = "arm64-v8a",
  [string]$AndroidSdkRoot = "",
  [string]$GradleBinDir = "",
  [string]$GradleExecutable = "",
  [string]$DebugKeystorePath = "",
  [string]$DebugKeystorePassword = "android",
  [string]$DebugKeyAlias = "androiddebugkey",
  [string]$GradleTasks = ":app:assembleDebug",
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

function Get-FirstNonBlank([string[]]$Candidates) {
  foreach ($candidate in $Candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      return $candidate.Trim()
    }
  }
  return ""
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
    $candidates.Add((Join-Path $env:USERPROFILE ".android\\debug.keystore"))
  }
  return Resolve-ExistingPath -Candidates @($candidates)
}

function Read-DotEnvFile([string]$EnvFilePath) {
  $values = @{}
  if ([string]::IsNullOrWhiteSpace($EnvFilePath) -or -not (Test-Path $EnvFilePath)) {
    return $values
  }

  foreach ($rawLine in (Get-Content -Encoding UTF8 $EnvFilePath)) {
    if ($null -eq $rawLine) {
      continue
    }
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
      continue
    }
    $separator = $line.IndexOf("=")
    if ($separator -lt 1) {
      continue
    }
    $key = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim().Trim("'").Trim('"')
    if (-not [string]::IsNullOrWhiteSpace($key)) {
      $values[$key] = $value
    }
  }

  return $values
}

function Resolve-AiBootstrapEnvPath {
  $candidates = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($env:FCITX5_ANDROID_AI_BOOTSTRAP_ENV_PATH)) {
    $candidates.Add($env:FCITX5_ANDROID_AI_BOOTSTRAP_ENV_PATH)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:OPENCLAW_DEEPSEEK_ENV_PATH)) {
    $candidates.Add($env:OPENCLAW_DEEPSEEK_ENV_PATH)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $candidates.Add((Join-Path $env:USERPROFILE ".openclaw\.env"))
  }
  return Resolve-ExistingPath -Candidates @($candidates)
}

function Resolve-AiBootstrapConfigPath {
  $candidates = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($env:FCITX5_ANDROID_AI_BOOTSTRAP_CONFIG_PATH)) {
    $candidates.Add($env:FCITX5_ANDROID_AI_BOOTSTRAP_CONFIG_PATH)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:OPENCLAW_CONFIG_PATH)) {
    $candidates.Add($env:OPENCLAW_CONFIG_PATH)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $candidates.Add((Join-Path $env:USERPROFILE ".openclaw\openclaw.json"))
  }
  return Resolve-ExistingPath -Candidates @($candidates)
}

function Get-AiBootstrapValue(
  [hashtable]$DotEnv,
  [string[]]$Names,
  [string]$Fallback = ""
) {
  foreach ($name in $Names) {
    $envValue = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($envValue)) {
      return $envValue.Trim()
    }
    if ($DotEnv.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($DotEnv[$name])) {
      return "$($DotEnv[$name])".Trim()
    }
  }
  return $Fallback
}

function Read-OpenClawBootstrap([string]$ConfigPath) {
  $result = @{
    ProviderId = ""
    BaseUrl = ""
    ApiKey = ""
    Model = ""
  }
  if ([string]::IsNullOrWhiteSpace($ConfigPath) -or -not (Test-Path $ConfigPath)) {
    return $result
  }

  try {
    $json = Get-Content -Raw -Encoding utf8 $ConfigPath | ConvertFrom-Json
    $primaryRef = "$($json.agents.defaults.model.primary)".Trim()
    if (-not [string]::IsNullOrWhiteSpace($primaryRef)) {
      $segments = $primaryRef.Split("/", 2)
      if ($segments.Count -ge 2) {
        $result.ProviderId = $segments[0].Trim()
        $result.Model = $segments[1].Trim()
      } else {
        $result.Model = $primaryRef
      }
    }
    if (-not [string]::IsNullOrWhiteSpace($result.ProviderId)) {
      $provider = $json.models.providers.($result.ProviderId)
      if ($null -ne $provider) {
        $result.BaseUrl = "$($provider.baseUrl)".Trim()
        $result.ApiKey = "$($provider.apiKey)".Trim()
      }
    }
  }
  catch {
    Write-Host "AI bootstrap config parse warning: $ConfigPath ($($_.Exception.Message))"
  }

  return $result
}

function Resolve-AiBootstrapConfig {
  $envFilePath = Resolve-AiBootstrapEnvPath
  $configPath = Resolve-AiBootstrapConfigPath
  $dotEnv = Read-DotEnvFile -EnvFilePath $envFilePath
  $openClaw = Read-OpenClawBootstrap -ConfigPath $configPath

  $baseUrl = Get-AiBootstrapValue -DotEnv $dotEnv -Names @(
    "FCITX5_ANDROID_AI_CHAT_BASE_URL",
    "FCITX5_ANDROID_AI_BASE_URL",
    "OPENCLAW_DEEPSEEK_BASE_URL"
  ) -Fallback $openClaw.BaseUrl
  $apiKey = Get-AiBootstrapValue -DotEnv $dotEnv -Names @(
    "FCITX5_ANDROID_AI_CHAT_API_KEY",
    "FCITX5_ANDROID_AI_API_KEY",
    "OPENCLAW_DEEPSEEK_API_KEY"
  ) -Fallback $openClaw.ApiKey
  $model = Get-AiBootstrapValue -DotEnv $dotEnv -Names @(
    "FCITX5_ANDROID_AI_CHAT_MODEL",
    "FCITX5_ANDROID_AI_MODEL",
    "OPENCLAW_DEEPSEEK_MODEL"
  ) -Fallback $openClaw.Model
  if ([string]::IsNullOrWhiteSpace($baseUrl) -and -not [string]::IsNullOrWhiteSpace($apiKey)) {
    $baseUrl = "https://api.deepseek.com/v1"
  }
  if ([string]::IsNullOrWhiteSpace($model) -and (-not [string]::IsNullOrWhiteSpace($baseUrl) -or -not [string]::IsNullOrWhiteSpace($apiKey))) {
    $model = "deepseek-chat"
  }

  $timeoutSecondsText = Get-AiBootstrapValue -DotEnv $dotEnv -Names @(
    "FCITX5_ANDROID_AI_CHAT_TIMEOUT_SECONDS",
    "FCITX5_ANDROID_AI_TIMEOUT_SECONDS"
  )
  $timeoutSeconds = 20
  if (-not [string]::IsNullOrWhiteSpace($timeoutSecondsText)) {
    $parsedTimeout = 0
    if ([int]::TryParse($timeoutSecondsText, [ref]$parsedTimeout)) {
      $timeoutSeconds = [Math]::Min([Math]::Max($parsedTimeout, 1), 300)
    }
  }

  $providerType = Get-AiBootstrapValue -DotEnv $dotEnv -Names @(
    "FCITX5_ANDROID_AI_CHAT_PROVIDER_TYPE"
  ) -Fallback "openai-compatible"
  $enabledOverride = Get-AiBootstrapValue -DotEnv $dotEnv -Names @(
    "FCITX5_ANDROID_AI_BOOTSTRAP_ENABLED"
  )
  $enabled =
    if (-not [string]::IsNullOrWhiteSpace($enabledOverride)) {
      $enabledOverride.Trim().ToLowerInvariant() -eq "true"
    } else {
      (-not [string]::IsNullOrWhiteSpace($baseUrl)) -and (-not [string]::IsNullOrWhiteSpace($model))
    }

  return [pscustomobject]@{
    BaseUrl = $baseUrl
    ApiKey = $apiKey
    Model = $model
    ProviderType = $providerType
    TimeoutSeconds = $timeoutSeconds
    Enabled = $enabled
    EnvPath = $envFilePath
    ConfigPath = $configPath
  }
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

function Resolve-GradleExecutable(
  [string]$RequestedExecutable,
  [string]$RequestedBinDir
) {
  $candidates = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($RequestedExecutable)) {
    $candidates.Add($RequestedExecutable)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:FCITX5_ANDROID_LOCAL_GRADLE_EXECUTABLE)) {
    $candidates.Add($env:FCITX5_ANDROID_LOCAL_GRADLE_EXECUTABLE)
  }

  $binDirs = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($RequestedBinDir)) {
    $binDirs.Add($RequestedBinDir)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:FCITX5_ANDROID_LOCAL_GRADLE_BIN_DIR)) {
    $binDirs.Add($env:FCITX5_ANDROID_LOCAL_GRADLE_BIN_DIR)
  }
  $binDirs.Add("D:\edge\gradle-9.3.1-bin\gradle-9.3.1\bin")

  foreach ($binDir in $binDirs) {
    if ([string]::IsNullOrWhiteSpace($binDir)) {
      continue
    }
    $candidates.Add((Join-Path $binDir "gradle.bat"))
    $candidates.Add((Join-Path $binDir "gradle"))
  }

  $resolved = Resolve-ExistingPath -Candidates @($candidates)
  if ([string]::IsNullOrWhiteSpace($resolved)) {
    throw "Local Gradle executable not found. Pass -GradleExecutable or -GradleBinDir."
  }

  return $resolved
}

function Prepend-ToPath([string[]]$Directories) {
  $entries = New-Object System.Collections.Generic.List[string]
  foreach ($directory in $Directories) {
    if ([string]::IsNullOrWhiteSpace($directory) -or -not (Test-Path $directory)) {
      continue
    }
    $entries.Add((Resolve-Path $directory).Path)
  }
  if ($entries.Count -eq 0) {
    return @()
  }
  $env:PATH = (($entries + @($env:PATH)) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join ";"
  return $entries.ToArray()
}

$workspaceRoot = Resolve-WorkspaceRoot
$repoAbs = Normalize-PathText ((Resolve-Path (Join-Path $workspaceRoot $RepoDir)).Path)
$resolvedSdkRoot = Normalize-PathText (Resolve-AndroidSdkRoot -RequestedPath $AndroidSdkRoot)
$resolvedGradleExe = Normalize-PathText (Resolve-GradleExecutable -RequestedExecutable $GradleExecutable -RequestedBinDir $GradleBinDir)
$resolvedAiBootstrap = Resolve-AiBootstrapConfig
$resolvedDebugKeystorePath = Normalize-PathText (Resolve-DebugKeystorePath -RequestedPath $DebugKeystorePath)
$addedToolDirs = Prepend-ToPath -Directories @(
  "C:\msys64\usr\bin",
  "C:\msys64\clang64\bin",
  "C:\msys64\ucrt64\bin"
)

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $stamp = Get-Date -Format "yyyyMMdd"
  $sanitizedTasks = ($GradleTasks -replace '[^A-Za-z0-9]+', '_').Trim('_')
  if ([string]::IsNullOrWhiteSpace($sanitizedTasks)) {
    $sanitizedTasks = "gradle"
  }
  if ($sanitizedTasks.Length -gt 96) {
    $sanitizedTasks = $sanitizedTasks.Substring(0, 96).TrimEnd('_')
  }
  $LogPath = "TODO/ime-research/logs/${stamp}_fcitx5-android_${sanitizedTasks}_local_${Abi}.log"
}

$logAbs = Join-Path $workspaceRoot $LogPath
$exitAbs = [System.IO.Path]::ChangeExtension($logAbs, ".exitcode.txt")
Ensure-Dir (Split-Path -Parent $logAbs)

$env:ANDROID_HOME = $resolvedSdkRoot
$env:ANDROID_SDK_ROOT = $resolvedSdkRoot
$env:GRADLE_OPTS = (($env:GRADLE_OPTS, "-Djava.net.preferIPv4Stack=true -Djava.net.preferIPv6Addresses=false -Dorg.gradle.internal.http.connectionTimeout=60000 -Dorg.gradle.internal.http.socketTimeout=60000") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join " "
$env:ORG_GRADLE_PROJECT_fcitx5AndroidAiBootstrapEnabled = if ($resolvedAiBootstrap.Enabled) { "true" } else { "false" }
$env:ORG_GRADLE_PROJECT_fcitx5AndroidAiChatProviderType = $resolvedAiBootstrap.ProviderType
$env:ORG_GRADLE_PROJECT_fcitx5AndroidAiChatBaseUrl = $resolvedAiBootstrap.BaseUrl
$env:ORG_GRADLE_PROJECT_fcitx5AndroidAiChatApiKey = $resolvedAiBootstrap.ApiKey
$env:ORG_GRADLE_PROJECT_fcitx5AndroidAiChatModel = $resolvedAiBootstrap.Model
$env:ORG_GRADLE_PROJECT_fcitx5AndroidAiChatTimeoutSeconds = [string]$resolvedAiBootstrap.TimeoutSeconds
if (-not [string]::IsNullOrWhiteSpace($resolvedDebugKeystorePath)) {
  $env:SIGN_KEY_FILE = $resolvedDebugKeystorePath
  $env:SIGN_KEY_PWD = $DebugKeystorePassword
  $env:SIGN_KEY_ALIAS = $DebugKeyAlias
}

$gradleTaskArgs = @()
foreach ($task in ($GradleTasks -split '\s+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
  $gradleTaskArgs += $task
}
$gradlePropertyArgs = @()
if (-not [string]::IsNullOrWhiteSpace($Abi)) {
  $gradlePropertyArgs += "-PbuildABI=$Abi"
}
$gradleArgs = @("-p", $repoAbs) + $gradlePropertyArgs + $gradleTaskArgs + @("--console=plain", "--stacktrace")

Write-Host "Using local Gradle executable: $resolvedGradleExe"
Write-Host "Android SDK root: $resolvedSdkRoot"
Write-Host "Repo: $repoAbs"
Write-Host "ABI hint: $Abi"
Write-Host "Gradle tasks: $GradleTasks"
if ($addedToolDirs.Count -gt 0) {
  Write-Host "Prepended tool dirs: $($addedToolDirs -join ', ')"
}
if (-not [string]::IsNullOrWhiteSpace($resolvedDebugKeystorePath)) {
  Write-Host "Using stable debug keystore: $resolvedDebugKeystorePath"
}
if ($resolvedAiBootstrap.Enabled) {
  Write-Host "Using debug AI bootstrap: $($resolvedAiBootstrap.BaseUrl) ($($resolvedAiBootstrap.Model))"
  if (-not [string]::IsNullOrWhiteSpace($resolvedAiBootstrap.EnvPath)) {
    Write-Host "AI bootstrap env: $($resolvedAiBootstrap.EnvPath)"
  }
  if (-not [string]::IsNullOrWhiteSpace($resolvedAiBootstrap.ConfigPath)) {
    Write-Host "AI bootstrap config: $($resolvedAiBootstrap.ConfigPath)"
  }
}

try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $resolvedGradleExe @gradleArgs 2>&1 | Tee-Object -FilePath $logAbs
  $exitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
}

Set-Content -Path $exitAbs -Encoding ascii -Value $exitCode

if ($exitCode -ne 0) {
  throw "fcitx5-android local build failed, see $logAbs"
}

Write-Host "Build succeeded. Log: $logAbs"
