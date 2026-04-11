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
    [string]$ReleaseNotesPath,
    [switch]$AllowEmptyReleaseNotes,
    [string]$RootCommit,
    [string]$SourceCommit,
    [string]$ApkDirectory,
    [string]$ReleaseAssetPrefix = 'keyflow',
    [string]$SourceApkPrefix = 'io.github.hctec.keyflow',
    [string[]]$ExpectedBundledKitIds = @('kit-store', 'shared'),
    [switch]$SkipBundledKitVerification,
    [switch]$SkipAssetUpload,
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
        # Windows PowerShell 5.1 can send string bodies as UTF-16; GitHub expects UTF-8 JSON.
        $params['ContentType'] = 'application/json; charset=utf-8'
        $json = ($Body | ConvertTo-Json -Depth 6)
        $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes($json)
    }
    return Invoke-RestMethod @params
}

function Upload-GitHubReleaseAsset {
    param(
        [Parameter(Mandatory = $true)]$Headers,
        [Parameter(Mandatory = $true)][string]$UploadUrl,
        [Parameter(Mandatory = $true)][string]$AssetPath
    )

    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) {
        Invoke-RestMethod -Headers $Headers -Uri $UploadUrl -Method Post -ContentType 'application/octet-stream' -InFile $AssetPath | Out-Null
        return
    }

    $curlArgs = @(
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        '--request', 'POST',
        '--header', ('Authorization: {0}' -f $Headers.Authorization),
        '--header', ('Accept: {0}' -f $Headers.Accept),
        '--header', ('User-Agent: {0}' -f $Headers.'User-Agent'),
        '--header', ('X-GitHub-Api-Version: {0}' -f $Headers.'X-GitHub-Api-Version'),
        '--header', 'Content-Type: application/octet-stream',
        '--data-binary', ('@{0}' -f $AssetPath),
        $UploadUrl
    )
    $output = & $curl.Source @curlArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ("GitHub asset upload failed for {0}: {1}" -f $AssetPath, ($output -join [Environment]::NewLine))
    }
}

function Read-Utf8TextFileOrEmpty {
    param([string]$Path)

    if (-not $Path) {
        return ''
    }
    if (-not (Test-Path $Path)) {
        throw "Release notes file not found: $Path"
    }
    return (Get-Content -Encoding UTF8 -Raw $Path).Trim()
}

function Build-DownloadGuide {
    param(
        [Parameter(Mandatory = $true)][string]$ApkVersion,
        [Parameter(Mandatory = $true)][string[]]$AssetNames
    )

    $apkNames = @($AssetNames | Where-Object { $_ -like '*.apk' })
    if (-not $apkNames) {
        return ''
    }

    $hasUniversal = $apkNames | Where-Object { $_ -match '(^|-)universal(-|\\.)' } | Select-Object -First 1
    $hasArm64 = $apkNames | Where-Object { $_ -match '(^|-)arm64-v8a(-|\\.)' } | Select-Object -First 1
    $hasArm32 = $apkNames | Where-Object { $_ -match '(^|-)armeabi-v7a(-|\\.)' } | Select-Object -First 1
    $hasX8664 = $apkNames | Where-Object { $_ -match '(^|-)x86_64(-|\\.)' } | Select-Object -First 1
    $hasX86 = $apkNames | Where-Object { $_ -match '(^|-)x86(-|\\.)' } | Select-Object -First 1

    $lines = @(
        '## 下载哪个 APK？',
        '',
        '按设备 CPU 架构选择：'
    )

    if ($hasUniversal) {
        $lines += ('- 优先推荐：`keyflow-{0}-universal-release.apk`（体积更大，但兼容性最好）' -f $ApkVersion)
    } elseif ($hasArm64) {
        $lines += ('- 大多数安卓手机/平板：`keyflow-{0}-arm64-v8a-release.apk`' -f $ApkVersion)
    }

    if ($hasArm64) {
        $lines += ('- `arm64-v8a`：主流安卓手机（2018+ 基本都是 64 位）' )
    }
    if ($hasArm32) {
        $lines += ('- `armeabi-v7a`：较老的 32 位设备' )
    }
    if ($hasX8664) {
        $lines += ('- `x86_64`：大多数 Android 模拟器 / 部分 x86_64 设备' )
    }
    if ($hasX86) {
        $lines += ('- `x86`：较老的 x86 模拟器 / 设备' )
    }

    $lines += ''
    $lines += '不确定架构时：'
    $lines += '- 电脑连接手机后执行：`adb shell getprop ro.product.cpu.abi`'
    $lines += '- 或在手机上用 CPU-Z / DevCheck 查看 ABI'

    return ($lines -join "`n")
}

function New-ReleaseBody {
    param(
        [Parameter(Mandatory = $true)][string]$ApkVersion,
        [Parameter(Mandatory = $true)][string]$SourceRepoName,
        [Parameter(Mandatory = $true)][string]$SourceRepoUrl,
        [Parameter(Mandatory = $true)][string]$SourceCommitHash,
        [Parameter(Mandatory = $true)][string]$SourceCommitUrl,
        [Parameter(Mandatory = $true)][string]$SourceArchiveUrl,
        [Parameter(Mandatory = $true)][string]$SourceLicenseId,
        [Parameter(Mandatory = $true)][string]$SigningDescription,
        [Parameter(Mandatory = $true)][bool]$IsPreRelease,
        [string]$ReleaseNotes,
        [string]$DownloadGuide,
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
    if ($ReleaseNotes) {
        $lines += ''
        $lines += '## 更新内容'
        $lines += ''
        $lines += $ReleaseNotes
    }
    if ($DownloadGuide) {
        $lines += ''
        $lines += $DownloadGuide
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
    $Tag = if ($SigningMode -eq 'formal') { "keyflow-$ApkVersion" } else { "keyflow-$ApkVersion-debug" }
}
if (-not $ReleaseName) {
    $ReleaseName = $Tag
}
$effectivePreRelease = $PreRelease.IsPresent -or ($SigningMode -ne 'formal')
$effectiveMakeLatest = ([bool]$MakeLatest) -and (-not $effectivePreRelease)
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
$releaseNotes = Read-Utf8TextFileOrEmpty -Path $ReleaseNotesPath
if (-not $effectivePreRelease -and -not $releaseNotes) {
    if ($AllowEmptyReleaseNotes.IsPresent) {
        Write-Warning 'Release notes are empty. Provide -ReleaseNotesPath to include what changed in this release.'
    } else {
        throw 'Release notes are required for stable releases. Provide -ReleaseNotesPath, or pass -AllowEmptyReleaseNotes to bypass.'
    }
}
$downloadGuide = Build-DownloadGuide -ApkVersion $ApkVersion -AssetNames $assetNames
$releaseBody =
    New-ReleaseBody `
        -ApkVersion $ApkVersion `
        -SourceRepoName $SourceRepo `
        -SourceRepoUrl $sourceRepoUrl `
        -SourceCommitHash $SourceCommit `
        -SourceCommitUrl $sourceCommitUrl `
        -SourceArchiveUrl $sourceArchiveUrl `
        -SourceLicenseId $SourceLicense `
        -SigningDescription $signingDescription `
        -IsPreRelease $effectivePreRelease `
        -ReleaseNotes $releaseNotes `
        -DownloadGuide $downloadGuide `
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
        prerelease = $effectivePreRelease
        make_latest = ($(if ($effectiveMakeLatest) { 'true' } else { 'false' }))
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
        prerelease = $effectivePreRelease
        make_latest = ($(if ($effectiveMakeLatest) { 'true' } else { 'false' }))
    }
}

if (-not $SkipAssetUpload) {
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
        Upload-GitHubReleaseAsset -Headers $headers -UploadUrl $uploadUrl -AssetPath $assetPath
    }
} else {
    Write-Warning 'SkipAssetUpload enabled: updated release metadata only (no asset upload/deletion).'
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
