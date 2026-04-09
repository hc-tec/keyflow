[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ApkVersion,
    [string]$WorkspaceRoot,
    [string]$ReleaseRepo = 'hc-tec/keyflow',
    [string]$SourceRepo = 'fcitx5-android',
    [string]$SourceRepoSlug = 'hc-tec/fcitx5-android',
    [string]$SourceLicense = 'LGPL-2.1-or-later',
    [ValidateSet('formal', 'debug')][string]$SigningMode = 'formal',
    [switch]$PreRelease,
    [string]$Tag,
    [string]$ReleaseName,
    [string]$RootCommit,
    [string]$SourceCommit,
    [string]$ApkDirectory,
    [string]$ReleaseAssetPrefix = 'keyflow',
    [string]$SourceApkPrefix = 'org.fcitx.fcitx5.android',
    [string[]]$ExpectedBundledKitIds = @('kit-store', 'shared'),
    [switch]$SkipBundledKitVerification,
    [switch]$MakeLatest = $true
)

$ErrorActionPreference = 'Stop'

function Resolve-WorkspaceRoot {
    param([string]$ExplicitWorkspaceRoot)

    if ($ExplicitWorkspaceRoot) {
        return (Resolve-Path $ExplicitWorkspaceRoot).Path
    }
    return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryPath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = & git -C $RepositoryPath @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ("git failed in {0}: {1}" -f $RepositoryPath, ($output -join [Environment]::NewLine))
    }
    return ($output -join [Environment]::NewLine).Trim()
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

function Read-DotProperties {
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
        $value = $trimmed.Substring($separator + 1).Trim()
        $values[$key] = $value
    }
    return $values
}

function Unescape-JavaPropertiesValue {
    param([Parameter(Mandatory = $true)][string]$Value)

    return $Value.Replace('\:', ':').Replace('\\', '\')
}

function Resolve-ApkSignerPath {
    param(
        [Parameter(Mandatory = $true)][string]$AndroidRepoPath
    )

    $fromPath = Get-Command apksigner.bat -ErrorAction SilentlyContinue
    if ($fromPath) {
        return $fromPath.Source
    }

    $localPropertiesPath = Join-Path $AndroidRepoPath 'local.properties'
    if (-not (Test-Path $localPropertiesPath)) {
        throw "Cannot locate apksigner.bat because local.properties is missing: $localPropertiesPath"
    }

    $properties = Read-DotProperties -Path $localPropertiesPath
    $sdkDirRaw = [string]$properties['sdk.dir']
    if (-not $sdkDirRaw) {
        throw "sdk.dir is missing in $localPropertiesPath"
    }
    $sdkDir = Unescape-JavaPropertiesValue -Value $sdkDirRaw
    $buildToolsRoot = Join-Path $sdkDir 'build-tools'
    if (-not (Test-Path $buildToolsRoot)) {
        throw "Android SDK build-tools directory not found: $buildToolsRoot"
    }
    $latestBuildTools = Get-ChildItem $buildToolsRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latestBuildTools) {
        throw "No Android build-tools versions found under $buildToolsRoot"
    }
    $apksignerPath = Join-Path $latestBuildTools.FullName 'apksigner.bat'
    if (-not (Test-Path $apksignerPath)) {
        throw "apksigner.bat not found: $apksignerPath"
    }
    return $apksignerPath
}

function Get-ApkSignerDigest {
    param(
        [Parameter(Mandatory = $true)][string]$ApkSignerPath,
        [Parameter(Mandatory = $true)][string]$ApkPath
    )

    $output = & $ApkSignerPath verify --print-certs $ApkPath | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "apksigner verify failed for $ApkPath"
    }
    $sha256Match = [regex]::Match($output, 'Signer #1 certificate SHA-256 digest:\s*([0-9a-f:]+)', 'IgnoreCase')
    if (-not $sha256Match.Success) {
        throw "Unable to parse signer SHA-256 digest from apksigner output for $ApkPath"
    }
    return $sha256Match.Groups[1].Value.ToUpperInvariant()
}

function Normalize-Digest {
    param([string]$Digest)

    if (-not $Digest) {
        return ''
    }
    return ($Digest -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
}

function Get-ApkBundledKitIds {
    param([Parameter(Mandatory = $true)][string]$ApkPath)

    $entries = & tar -tf $ApkPath
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to read APK contents via tar: $ApkPath"
    }
    $kitIds = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
    foreach ($entry in $entries) {
        $match = [regex]::Match($entry, '^assets/function-kits/([^/]+)/')
        if ($match.Success) {
            [void]$kitIds.Add($match.Groups[1].Value)
        }
    }
    return @($kitIds | Sort-Object)
}

function Compare-StringSets {
    param(
        [string[]]$Actual,
        [string[]]$Expected
    )

    $actualSet = @($Actual | Sort-Object -Unique)
    $expectedSet = @($Expected | Sort-Object -Unique)
    if ($actualSet.Count -ne $expectedSet.Count) {
        return $false
    }
    for ($index = 0; $index -lt $actualSet.Count; $index++) {
        if ($actualSet[$index] -ne $expectedSet[$index]) {
            return $false
        }
    }
    return $true
}

function Get-ReleaseAssetName {
    param(
        [Parameter(Mandatory = $true)][string]$OriginalFileName,
        [Parameter(Mandatory = $true)][string]$ReleaseAssetPrefix,
        [Parameter(Mandatory = $true)][string]$SourceApkPrefix,
        [Parameter(Mandatory = $true)][string]$SigningMode
    )

    $renamedFile = $OriginalFileName
    $sourcePrefixPattern = '^{0}-' -f [regex]::Escape($SourceApkPrefix)
    if ($renamedFile -like "$ReleaseAssetPrefix-*") {
        $renamedFile = $renamedFile
    } elseif ($renamedFile -match $sourcePrefixPattern) {
        $renamedFile = [regex]::Replace($renamedFile, $sourcePrefixPattern, "$ReleaseAssetPrefix-")
    } else {
        $renamedFile = '{0}-{1}' -f $ReleaseAssetPrefix, $renamedFile
    }

    if ($SigningMode -eq 'debug' -and $renamedFile -like '*.apk' -and $renamedFile -notlike '*-debug.apk') {
        $baseName = [System.IO.Path]::GetFileNameWithoutExtension($renamedFile)
        $extension = [System.IO.Path]::GetExtension($renamedFile)
        $renamedFile = '{0}-debug{1}' -f $baseName, $extension
    }

    return $renamedFile
}

function Get-GitHubCredential {
    $query = "protocol=https`nhost=github.com`n`n"
    $response = $query | git credential fill
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to resolve GitHub credentials from git credential helper.'
    }
    $map = @{}
    foreach ($line in ($response -split "`r?`n")) {
        if (-not $line) {
            continue
        }
        $separator = $line.IndexOf('=')
        if ($separator -le 0) {
            continue
        }
        $key = $line.Substring(0, $separator)
        $value = $line.Substring($separator + 1)
        $map[$key] = $value
    }
    if (-not $map.username -or -not $map.password) {
        throw 'GitHub credential helper returned incomplete credentials.'
    }
    return $map
}

function New-GitHubHeaders {
    param([Parameter(Mandatory = $true)]$Credential)

    $pair = '{0}:{1}' -f $Credential.username, $Credential.password
    $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
    return @{
        Authorization = "Basic $basic"
        Accept = 'application/vnd.github+json'
        'User-Agent' = 'codex-release-agent'
        'X-GitHub-Api-Version' = '2022-11-28'
    }
}

function Invoke-GitHubJson {
    param(
        [Parameter(Mandatory = $true)]$Headers,
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Uri,
        [object]$Body
    )

    $params = @{
        Headers = $Headers
        Method = $Method
        Uri = $Uri
    }
    if ($null -ne $Body) {
        $params['ContentType'] = 'application/json'
        $params['Body'] = ($Body | ConvertTo-Json -Depth 6)
    }
    return Invoke-RestMethod @params
}

function New-ReleaseBody {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRepoName,
        [Parameter(Mandatory = $true)][string]$SourceRepoUrl,
        [Parameter(Mandatory = $true)][string]$SourceCommitHash,
        [Parameter(Mandatory = $true)][string]$SourceCommitUrl,
        [Parameter(Mandatory = $true)][string]$SourceArchiveUrl,
        [Parameter(Mandatory = $true)][string]$SourceLicenseId,
        [Parameter(Mandatory = $true)][string]$SigningDescription,
        [Parameter(Mandatory = $true)][bool]$IsPreRelease,
        [Parameter(Mandatory = $true)][string[]]$AssetNames,
        [Parameter(Mandatory = $true)][string[]]$BundledKitIds,
        [string]$SignerDigest
    )

    $assetSummary = if ($AssetNames.Count -gt 0) { $AssetNames -join ' / ' } else { 'none' }
    $kitSummary = if ($BundledKitIds.Count -gt 0) { $BundledKitIds -join ' + ' } else { 'none' }
    $releaseType = if ($IsPreRelease) { 'pre-release' } else { 'stable release' }

    $lines = @(
        ('Android APK release for `{0}` {1}.' -f $SourceRepoName, $ApkVersion),
        '',
        ('- Source repo: `{0}`' -f $SourceRepoName),
        ('- Source URL: {0}' -f $SourceRepoUrl),
        ('- Source commit: `{0}`' -f $SourceCommitHash),
        ('- Source commit URL: {0}' -f $SourceCommitUrl),
        ('- Source archive URL: {0}' -f $SourceArchiveUrl),
        ('- License: `{0}`' -f $SourceLicenseId),
        ('- Signing: `{0}`' -f $SigningDescription),
        ('- Release type: {0}' -f $releaseType),
        ('- Attached assets: {0}' -f $assetSummary),
        ('- Bundled Function Kits in release APK: `{0}`' -f $kitSummary)
    )
    if ($SignerDigest) {
        $lines += ('- Signer SHA-256: `{0}`' -f $SignerDigest)
    }
    if ($IsPreRelease) {
        $lines += '- This build is for install/testing only.'
    }
    return $lines -join "`n"
}

$resolvedWorkspaceRoot = Resolve-WorkspaceRoot -ExplicitWorkspaceRoot $WorkspaceRoot
$rootRepoPath = $resolvedWorkspaceRoot
$androidRepoPath = Join-Path $resolvedWorkspaceRoot 'TODO\ime-research\repos\fcitx5-android'
if (-not (Test-Path $androidRepoPath)) {
    throw "Android source repo not found: $androidRepoPath"
}

if (-not $Tag) {
    $Tag = if ($SigningMode -eq 'formal') { "fcitx5-android-$ApkVersion" } else { "fcitx5-android-$ApkVersion-debug" }
}
if (-not $ReleaseName) {
    $ReleaseName = $Tag
}
if (-not $RootCommit) {
    $RootCommit = Invoke-Git -RepositoryPath $rootRepoPath -Arguments @('rev-parse', 'HEAD')
}
if (-not $SourceCommit) {
    $SourceCommit = Invoke-Git -RepositoryPath $androidRepoPath -Arguments @('rev-parse', 'HEAD')
}
$sourceRepoUrl = 'https://github.com/{0}' -f $SourceRepoSlug
$sourceCommitUrl = '{0}/commit/{1}' -f $sourceRepoUrl, $SourceCommit
$sourceArchiveUrl = '{0}/archive/{1}.tar.gz' -f $sourceRepoUrl, $SourceCommit
if (-not $ApkDirectory) {
    $ApkDirectory = Join-Path $androidRepoPath 'app\build\outputs\apk\release'
}
if (-not (Test-Path $ApkDirectory)) {
    throw "APK directory not found: $ApkDirectory"
}

$apkFiles = Get-ChildItem $ApkDirectory -Filter '*.apk' | Sort-Object Name
if (-not $apkFiles) {
    throw "No APK files found under $ApkDirectory"
}

$bundledKitIds = @()
if (-not $SkipBundledKitVerification) {
    $expectedKitIds = @($ExpectedBundledKitIds | Sort-Object -Unique)
    foreach ($apkFile in $apkFiles) {
        $actualKitIds = Get-ApkBundledKitIds -ApkPath $apkFile.FullName
        if (-not (Compare-StringSets -Actual $actualKitIds -Expected $expectedKitIds)) {
            throw ("Bundled kit mismatch in {0}. Expected [{1}] but found [{2}]." -f $apkFile.Name, ($expectedKitIds -join ', '), ($actualKitIds -join ', '))
        }
        $bundledKitIds = $actualKitIds
    }
} else {
    $bundledKitIds = @($ExpectedBundledKitIds | Sort-Object -Unique)
}

$apksignerPath = Resolve-ApkSignerPath -AndroidRepoPath $androidRepoPath
$signerDigest = $null
foreach ($apkFile in $apkFiles) {
    $currentDigest = Get-ApkSignerDigest -ApkSignerPath $apksignerPath -ApkPath $apkFile.FullName
    if (-not $signerDigest) {
        $signerDigest = $currentDigest
        continue
    }
    if ($currentDigest -ne $signerDigest) {
        throw ("Signer digest mismatch across APKs. {0} != {1}" -f $currentDigest, $signerDigest)
    }
}

if ($SigningMode -eq 'formal') {
    $metadataPath = Join-Path $resolvedWorkspaceRoot '.local-secrets\android-release\keystore-metadata.json'
    if (Test-Path $metadataPath) {
        $metadata = Get-Content -Encoding UTF8 $metadataPath | ConvertFrom-Json
        $expectedDigest = Normalize-Digest -Digest ([string]$metadata.sha256Fingerprint)
        if ($expectedDigest -and $expectedDigest -ne (Normalize-Digest -Digest $signerDigest)) {
            throw ("Signer digest from APKs does not match formal keystore metadata. APK={0}, metadata={1}" -f $signerDigest, $expectedDigest)
        }
    }
}

$artifactRoot = Join-Path $resolvedWorkspaceRoot ("tmp\release\{0}" -f $Tag)
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
$stagedApkPaths =
    foreach ($apkFile in $apkFiles) {
        $releaseAssetName =
            Get-ReleaseAssetName `
                -OriginalFileName $apkFile.Name `
                -ReleaseAssetPrefix $ReleaseAssetPrefix `
                -SourceApkPrefix $SourceApkPrefix `
                -SigningMode $SigningMode
        $stagedPath = Join-Path $artifactRoot $releaseAssetName
        Copy-Item -Force $apkFile.FullName $stagedPath
        $stagedPath
    }
$sha256Path = Join-Path $artifactRoot 'SHA256SUMS.txt'
$sha256Lines = foreach ($stagedApkPath in $stagedApkPaths) {
    $hash = (Get-FileHash -Algorithm SHA256 $stagedApkPath).Hash.ToLowerInvariant()
    "{0}  {1}" -f $hash, ([System.IO.Path]::GetFileName($stagedApkPath))
}
Write-Utf8File -Path $sha256Path -Content (($sha256Lines -join [Environment]::NewLine) + [Environment]::NewLine)

$signingDescription = if ($SigningMode -eq 'formal') { 'formal release keystore' } else { 'local debug.keystore' }
$assetPaths = @($stagedApkPaths) + $sha256Path
$assetNames = $assetPaths | ForEach-Object { [System.IO.Path]::GetFileName($_) }
$assetNamesToReplace = (@($apkFiles.Name) + @($assetNames)) | Sort-Object -Unique
$releaseBody =
    New-ReleaseBody `
        -SourceRepoName $SourceRepo `
        -SourceRepoUrl $sourceRepoUrl `
        -SourceCommitHash $SourceCommit `
        -SourceCommitUrl $sourceCommitUrl `
        -SourceArchiveUrl $sourceArchiveUrl `
        -SourceLicenseId $SourceLicense `
        -SigningDescription $signingDescription `
        -IsPreRelease $PreRelease.IsPresent `
        -AssetNames $assetNames `
        -BundledKitIds $bundledKitIds `
        -SignerDigest $signerDigest

$credential = Get-GitHubCredential
$headers = New-GitHubHeaders -Credential $credential
$repoApi = "https://api.github.com/repos/$ReleaseRepo"

try {
    $release = Invoke-GitHubJson -Headers $headers -Method Get -Uri "$repoApi/releases/tags/$Tag"
    $release = Invoke-GitHubJson -Headers $headers -Method Patch -Uri "$repoApi/releases/$($release.id)" -Body @{
        tag_name = $Tag
        target_commitish = $RootCommit
        name = $ReleaseName
        body = $releaseBody
        draft = $false
        prerelease = $PreRelease.IsPresent
        make_latest = ($(if ($MakeLatest) { 'true' } else { 'false' }))
    }
} catch {
    $statusCode = $null
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
    }
    if ($statusCode -ne 404) {
        throw
    }
    $release = Invoke-GitHubJson -Headers $headers -Method Post -Uri "$repoApi/releases" -Body @{
        tag_name = $Tag
        target_commitish = $RootCommit
        name = $ReleaseName
        body = $releaseBody
        draft = $false
        prerelease = $PreRelease.IsPresent
        make_latest = ($(if ($MakeLatest) { 'true' } else { 'false' }))
    }
}

foreach ($asset in @($release.assets)) {
    if ($assetNamesToReplace -contains $asset.name) {
        Invoke-RestMethod -Headers $headers -Uri "$repoApi/releases/assets/$($asset.id)" -Method Delete | Out-Null
    }
}

$release = Invoke-GitHubJson -Headers $headers -Method Get -Uri "$repoApi/releases/$($release.id)"
$uploadBase = $release.upload_url.ToString().Replace('{?name,label}', '')
foreach ($assetPath in $assetPaths) {
    $assetName = [System.IO.Path]::GetFileName($assetPath)
    $uploadUrl = '{0}?name={1}' -f $uploadBase, [Uri]::EscapeDataString($assetName)
    Invoke-RestMethod -Headers $headers -Uri $uploadUrl -Method Post -ContentType 'application/octet-stream' -InFile $assetPath | Out-Null
}

$release = Invoke-GitHubJson -Headers $headers -Method Get -Uri "$repoApi/releases/$($release.id)"
Write-Host ("Published release: {0}" -f $release.html_url)
Write-Host ("Tag: {0}" -f $Tag)
Write-Host ("Source commit: {0}" -f $SourceCommit)
Write-Host ("Source repo URL: {0}" -f $sourceRepoUrl)
Write-Host ("Source archive URL: {0}" -f $sourceArchiveUrl)
Write-Host ("License: {0}" -f $SourceLicense)
Write-Host ("Signer SHA-256: {0}" -f $signerDigest)
Write-Host ("Assets: {0}" -f ($assetNames -join ', '))
