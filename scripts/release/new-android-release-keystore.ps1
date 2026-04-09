[CmdletBinding()]
param(
    [string]$WorkspaceRoot,
    [string]$Alias = 'keyflow-android-release',
    [string]$DName = 'CN=Keyflow Android Release, OU=Release, O=hc-tec, C=CN',
    [string]$KeystoreFileName = 'fcitx5-android-release.keystore',
    [int]$ValidityDays = 9125,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function New-HexSecret {
    param([int]$Bytes = 32)

    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($buffer)
    } finally {
        $rng.Dispose()
    }
    return ([System.BitConverter]::ToString($buffer)).Replace('-', '').ToLowerInvariant()
}

function Write-Utf8File {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $directory = Split-Path -Parent $Path
    if ($directory) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

$resolvedWorkspaceRoot =
if ($WorkspaceRoot) {
    (Resolve-Path $WorkspaceRoot).Path
} else {
    (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}
$workspaceRoot = $resolvedWorkspaceRoot
$secretRoot = Join-Path $workspaceRoot '.local-secrets\android-release'
$keystorePath = Join-Path $secretRoot $KeystoreFileName
$envPath = Join-Path $secretRoot 'signing.env'
$metadataPath = Join-Path $secretRoot 'keystore-metadata.json'
$fingerprintPath = Join-Path $secretRoot 'keystore-fingerprint.txt'
$notesPath = Join-Path $secretRoot 'README.local.txt'
$keytoolCommand = Get-Command keytool.exe -ErrorAction SilentlyContinue
if (-not $keytoolCommand) {
    $keytoolCommand = Get-Command keytool -ErrorAction SilentlyContinue
}
if (-not $keytoolCommand) {
    throw 'keytool was not found in PATH. Install Android Studio / JDK first.'
}

if ((Test-Path $keystorePath) -or (Test-Path $envPath)) {
    if (-not $Force) {
        throw "Release keystore already exists at $secretRoot. Re-run with -Force only if you intentionally want to replace it."
    }
    Remove-Item -Force -ErrorAction SilentlyContinue $keystorePath, $envPath, $metadataPath, $fingerprintPath, $notesPath
}

New-Item -ItemType Directory -Force -Path $secretRoot | Out-Null
$password = New-HexSecret

$keytoolArgs = @(
    '-genkeypair'
    '-storetype', 'PKCS12'
    '-keystore', $keystorePath
    '-storepass', $password
    '-keypass', $password
    '-alias', $Alias
    '-keyalg', 'RSA'
    '-keysize', '4096'
    '-sigalg', 'SHA256withRSA'
    '-validity', $ValidityDays.ToString()
    '-dname', $DName
)

& $keytoolCommand.Source @keytoolArgs

$fingerprintOutput = & $keytoolCommand.Source -list -v -keystore $keystorePath -storepass $password -alias $Alias | Out-String
$sha256Match = [regex]::Match($fingerprintOutput, 'SHA256:\s*([0-9A-F:]+)', 'IgnoreCase')
$sha1Match = [regex]::Match($fingerprintOutput, 'SHA1:\s*([0-9A-F:]+)', 'IgnoreCase')
$sha256Fingerprint = if ($sha256Match.Success) { $sha256Match.Groups[1].Value.ToUpperInvariant() } else { '' }
$sha1Fingerprint = if ($sha1Match.Success) { $sha1Match.Groups[1].Value.ToUpperInvariant() } else { '' }

$envContent = @"
# Android release signing environment
SIGN_KEY_FILE=$keystorePath
SIGN_KEY_ALIAS=$Alias
SIGN_KEY_PWD=$password
"@
Write-Utf8File -Path $envPath -Content ($envContent.Trim() + "`n")

$metadata = [ordered]@{
    createdAt = (Get-Date).ToString('o')
    keystorePath = $keystorePath
    alias = $Alias
    dName = $DName
    storeType = 'PKCS12'
    keyAlgorithm = 'RSA'
    keySize = 4096
    signatureAlgorithm = 'SHA256withRSA'
    validityDays = $ValidityDays
    sha256Fingerprint = $sha256Fingerprint
    sha1Fingerprint = $sha1Fingerprint
}
Write-Utf8File -Path $metadataPath -Content ((($metadata | ConvertTo-Json -Depth 4).Trim()) + "`n")
Write-Utf8File -Path $fingerprintPath -Content ($fingerprintOutput.TrimEnd() + "`n")

$notes = @"
Formal Android release keystore

Files in this directory:
- $(Split-Path -Leaf $keystorePath)
- $(Split-Path -Leaf $envPath)
- $(Split-Path -Leaf $metadataPath)
- $(Split-Path -Leaf $fingerprintPath)

Rules:
1. Back up the keystore file and password together before the first public release.
2. Keep at least two encrypted backups outside this git workspace.
3. Do not rotate this key after users install a public APK, or Android upgrade compatibility will break.

Signer SHA-256:
$sha256Fingerprint
"@
Write-Utf8File -Path $notesPath -Content ($notes.Trim() + "`n")

Write-Host "Created formal Android release keystore:"
Write-Host "  Keystore : $keystorePath"
Write-Host "  Alias    : $Alias"
Write-Host "  SHA-256  : $sha256Fingerprint"
Write-Host "  Env file : $envPath"
