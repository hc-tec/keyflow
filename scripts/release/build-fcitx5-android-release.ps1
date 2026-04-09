[CmdletBinding()]
param(
    [string]$WorkspaceRoot,
    [string]$VersionName,
    [string[]]$GradleTasks = @(':app:assembleRelease')
)

$ErrorActionPreference = 'Stop'

function Read-DotEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    $values = [ordered]@{}
    foreach ($line in Get-Content -Encoding UTF8 $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }
        $separator = $trimmed.IndexOf('=')
        if ($separator -le 0) {
            continue
        }
        $key = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim().Trim("'").Trim('"')
        if ($key) {
            $values[$key] = $value
        }
    }
    return $values
}

$resolvedWorkspaceRoot =
if ($WorkspaceRoot) {
    (Resolve-Path $WorkspaceRoot).Path
} else {
    (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}
$workspaceRoot = $resolvedWorkspaceRoot
$envPath = Join-Path $workspaceRoot '.local-secrets\android-release\signing.env'
$androidRepo = Join-Path $workspaceRoot 'TODO\ime-research\repos\fcitx5-android'
$gradlew = Join-Path $androidRepo 'gradlew.bat'
if (-not (Test-Path $envPath)) {
    throw "Signing env file not found: $envPath"
}
if (-not (Test-Path $gradlew)) {
    throw "gradlew.bat not found: $gradlew"
}

$values = Read-DotEnv -Path $envPath
foreach ($requiredKey in 'SIGN_KEY_FILE', 'SIGN_KEY_ALIAS', 'SIGN_KEY_PWD') {
    if (-not $values[$requiredKey]) {
        throw "Missing $requiredKey in $envPath"
    }
    Set-Item -Path "Env:$requiredKey" -Value ([string]$values[$requiredKey])
}

if (-not (Test-Path $env:SIGN_KEY_FILE)) {
    throw "Keystore file not found: $($env:SIGN_KEY_FILE)"
}

if ($VersionName) {
    $env:BUILD_VERSION_NAME = $VersionName
}

$gettextDir = 'C:\msys64\usr\bin'
if ((Test-Path $gettextDir) -and -not (($env:PATH -split ';') -contains $gettextDir)) {
    $env:PATH = "$gettextDir;$($env:PATH)"
}

Push-Location $androidRepo
try {
    & $gradlew @GradleTasks --console=plain --warning-mode=all
} finally {
    Pop-Location
}
