[CmdletBinding()]
param(
    [string]$WorkspaceRoot,
    [ValidateSet('dotenv', 'powershell')][string]$Format = 'dotenv',
    [switch]$IncludeBase64
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

function Quote-PowerShell {
    param([Parameter(Mandatory = $true)][string]$Value)

    return "'" + $Value.Replace("'", "''") + "'"
}

$resolvedWorkspaceRoot =
if ($WorkspaceRoot) {
    (Resolve-Path $WorkspaceRoot).Path
} else {
    (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}
$workspaceRoot = $resolvedWorkspaceRoot
$envPath = Join-Path $workspaceRoot '.local-secrets\android-release\signing.env'
if (-not (Test-Path $envPath)) {
    throw "Signing env file not found: $envPath"
}

$values = Read-DotEnv -Path $envPath
$keystorePath = $values['SIGN_KEY_FILE']
if (-not $keystorePath -or -not (Test-Path $keystorePath)) {
    throw "SIGN_KEY_FILE is missing or unreadable: $keystorePath"
}

if ($IncludeBase64) {
    $bytes = [System.IO.File]::ReadAllBytes($keystorePath)
    $values['SIGN_KEY_BASE64'] = [Convert]::ToBase64String($bytes)
}

$lines = foreach ($entry in $values.GetEnumerator()) {
    if ($Format -eq 'powershell') {
        "`$env:$($entry.Key)=$(Quote-PowerShell -Value ([string]$entry.Value))"
    } else {
        "$($entry.Key)=$($entry.Value)"
    }
}

Write-Output ($lines -join [Environment]::NewLine)
