param(
  [string]$RepoDir = "TODO/ime-research/repos/rime-weasel",
  [string]$BoostRoot = "",
  [string]$BuildArgs = "release boost opencc rime weasel",
  [string]$PlatformToolset = "v143",
  [string]$BjamToolset = "msvc-14.3",
  [bool]$UseSubst = $true,
  [string]$SubstDrive = "W",
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

function Normalize-ExistingPath([string]$Path) {
  return ([System.IO.Path]::GetFullPath((Resolve-Path $Path).Path)).TrimEnd('\')
}

function Resolve-VsWithAtl {
  $vswhere = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe"
  if (-not (Test-Path $vswhere)) {
    throw "Missing vswhere: $vswhere"
  }

  $json = & $vswhere -products * -format json
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($json)) {
    throw "vswhere failed to enumerate Visual Studio installations"
  }

  $instances = $json | ConvertFrom-Json
  foreach ($instance in $instances) {
    $installPath = [string]$instance.installationPath
    if ([string]::IsNullOrWhiteSpace($installPath)) {
      continue
    }

    $vsDevCmd = Join-Path $installPath "Common7\\Tools\\VsDevCmd.bat"
    $atlPattern = Join-Path $installPath "VC\\Tools\\MSVC\\*\\ATLMFC\\include\\atlbase.h"
    $atlHeader = Get-ChildItem -Path $atlPattern -ErrorAction SilentlyContinue | Select-Object -First 1
    if ((Test-Path $vsDevCmd) -and $atlHeader) {
      return [pscustomobject]@{
        InstallationPath = $installPath
        InstallationVersion = [string]$instance.installationVersion
        VsDevCmd         = $vsDevCmd
      }
    }
  }

  throw "No Visual Studio installation with ATL/MFC headers was found"
}

function Resolve-WindowsSdkRoot {
  $candidates = @(
    "C:\\Program Files (x86)\\Windows Kits\\10",
    "D:\\Windows Kits\\10",
    "C:\\Program Files (x86)\\Microsoft SDKs\\Windows Kits\\10"
  )

  foreach ($candidate in $candidates) {
    if ((Test-Path (Join-Path $candidate "Include")) -and (Test-Path (Join-Path $candidate "Lib"))) {
      return $candidate
    }
  }

  throw "No usable Windows SDK root was found"
}

function Resolve-WindowsSdkVersion([string]$WindowsSdkRoot) {
  $includeRoot = Join-Path $WindowsSdkRoot "Include"
  $versions = Get-ChildItem -Path $includeRoot -Directory -ErrorAction Stop |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
    Sort-Object Name -Descending

  if (-not $versions) {
    throw "No Windows SDK version folders were found under $includeRoot"
  }

  return $versions[0].Name
}

function Resolve-BoostRoot([string]$RepoAbs, [string]$RequestedBoostRoot) {
  $candidates = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($RequestedBoostRoot)) {
    $candidates.Add($RequestedBoostRoot)
  }

  @(
    (Join-Path $RepoAbs "deps\\boost_184_tar2\\boost_1_84_0"),
    (Join-Path $RepoAbs "deps\\boost_1_84_0"),
    (Join-Path $RepoAbs "deps\\boost-1.84.0"),
    (Join-Path $RepoAbs "deps\\boost_1_78_0")
  ) | ForEach-Object { $candidates.Add($_) }

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    if (Test-Path (Join-Path $candidate "boost")) {
      return Normalize-ExistingPath $candidate
    }
  }

  throw "No usable Boost root was found. Pass -BoostRoot explicitly or place Boost 1.84 under $RepoAbs\\deps"
}

function Ensure-SubstDrive([string]$DriveLetter, [string]$TargetPath) {
  $drive = $DriveLetter.TrimEnd(':').ToUpperInvariant()
  if ($drive -notmatch '^[A-Z]$') {
    throw "SubstDrive must be a single drive letter, got '$DriveLetter'"
  }

  $targetNormalized = Normalize-ExistingPath $TargetPath
  $existingMappings = @{}
  $substOutput = & cmd /c subst 2>$null
  foreach ($line in $substOutput) {
    if ($line -match '^([A-Z]):\\: => (.+)$') {
      $existingMappings[$Matches[1].ToUpperInvariant()] = $Matches[2]
    }
  }

  if ($existingMappings.ContainsKey($drive)) {
    $mappedNormalized = Normalize-ExistingPath $existingMappings[$drive]
    if ($mappedNormalized -ne $targetNormalized) {
      throw "Subst drive $drive`: is already mapped to $mappedNormalized"
    }

    return [pscustomobject]@{
      Root    = "${drive}:\"
      Created = $false
    }
  }

  & cmd /c "subst ${drive}: `"$targetNormalized`""
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create subst drive $drive`: for $targetNormalized"
  }

  return [pscustomobject]@{
    Root    = "${drive}:\"
    Created = $true
  }
}

function Remove-SubstDrive([string]$DriveLetter) {
  $drive = $DriveLetter.TrimEnd(':').ToUpperInvariant()
  if ($drive -match '^[A-Z]$') {
    & cmd /c "subst ${drive}: /d" | Out-Null
  }
}

function Convert-ToRepoRuntimePath([string]$Path, [string]$RepoAbs, [string]$RuntimeRepoRoot) {
  $pathNormalized = Normalize-ExistingPath $Path
  $repoNormalized = Normalize-ExistingPath $RepoAbs

  if ($pathNormalized.Length -lt $repoNormalized.Length) {
    return $pathNormalized
  }

  if ($pathNormalized.StartsWith($repoNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    $relative = $pathNormalized.Substring($repoNormalized.Length).TrimStart('\')
    if ([string]::IsNullOrWhiteSpace($relative)) {
      return $RuntimeRepoRoot.TrimEnd('\')
    }
    return Join-Path $RuntimeRepoRoot $relative
  }

  return $pathNormalized
}

function Convert-ToForwardSlashPath([string]$Path) {
  return $Path -replace '\\', '/'
}

function Resolve-VcVarsAllPath([string]$InstallationPath) {
  $vcVarsAll = Join-Path $InstallationPath "VC\\Auxiliary\\Build\\vcvarsall.bat"
  if (-not (Test-Path $vcVarsAll)) {
    throw "Missing vcvarsall.bat under $InstallationPath"
  }
  return $vcVarsAll
}

function Ensure-BoostProjectConfig([string]$BoostRoot, [string]$BjamToolset, [string]$VcVarsAllPath) {
  $toolsetVersion = $BjamToolset
  if ($BjamToolset -match '^msvc-(.+)$') {
    $toolsetVersion = $Matches[1]
  }

  $projectConfigPath = Join-Path $BoostRoot "project-config.jam"
  $vcVarsForwardSlash = Convert-ToForwardSlashPath (Normalize-ExistingPath $VcVarsAllPath)
  $projectConfigLines = @(
    "# Boost.Build Configuration",
    "# Managed by run_rime_weasel_build.ps1",
    "",
    "import option ;",
    "",
    "using msvc : $toolsetVersion : : <setup>`"$vcVarsForwardSlash`" ;",
    "",
    "option.set keep-going : false ;"
  )

  Set-Content -Path $projectConfigPath -Encoding ascii -Value $projectConfigLines
}

function Get-TrustedToolPaths {
  $candidates = @(
    "D:\\Git\\cmd",
    "D:\\Git\\usr\\bin",
    "D:\\perl\\c\\bin",
    "C:\\Python313",
    "C:\\Python313\\Scripts"
  )

  return $candidates | Where-Object { Test-Path $_ } | Select-Object -Unique
}

function Ensure-LibrimeGeneratorInstanceSupport([string]$RepoAbs) {
  $librimeBuildBat = Join-Path $RepoAbs "librime\\build.bat"
  if (-not (Test-Path $librimeBuildBat)) {
    throw "Missing librime build script: $librimeBuildBat"
  }

  $content = Get-Content -Raw -Encoding UTF8 $librimeBuildBat
  if ($content -match 'CMAKE_GENERATOR_INSTANCE:STRING') {
    return
  }

  $pattern = 'if defined CMAKE_GENERATOR \(\r?\n\s*set common_cmake_flags=%common_cmake_flags% -G%CMAKE_GENERATOR%\r?\n\)'
  $replacement = @"
if defined CMAKE_GENERATOR (
  set common_cmake_flags=%common_cmake_flags% -G%CMAKE_GENERATOR%
)
if defined CMAKE_GENERATOR_INSTANCE (
  set common_cmake_flags=%common_cmake_flags% -DCMAKE_GENERATOR_INSTANCE:STRING="%CMAKE_GENERATOR_INSTANCE%"
)
"@

  if ($content -notmatch $pattern) {
    throw "Unable to patch librime/build.bat for CMAKE_GENERATOR_INSTANCE support"
  }

  $updated = [regex]::Replace($content, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement }, 1)
  Set-Content -Path $librimeBuildBat -Encoding ascii -Value $updated
}

function Resolve-WeaselVersionInfo([string]$RepoAbs) {
  $buildBat = Join-Path $RepoAbs "build.bat"
  $content = Get-Content -Raw -Encoding UTF8 $buildBat

  $versionMajor = "0"
  $versionMinor = "17"
  $versionPatch = "4"

  if ($content -match 'VERSION_MAJOR=([0-9]+)') {
    $versionMajor = $Matches[1]
  }
  if ($content -match 'VERSION_MINOR=([0-9]+)') {
    $versionMinor = $Matches[1]
  }
  if ($content -match 'VERSION_PATCH=([0-9]+)') {
    $versionPatch = $Matches[1]
  }

  $productVersion = "$versionMajor.$versionMinor.$versionPatch.0"
  $fileVersion = $productVersion

  return [pscustomobject]@{
    VersionMajor   = $versionMajor
    VersionMinor   = $versionMinor
    VersionPatch   = $versionPatch
    ProductVersion = $productVersion
    FileVersion    = $fileVersion
  }
}

function Ensure-AfxResShim([string]$RepoAbs, [string]$VsInstallPath, [string]$WindowsSdkRoot, [string]$WindowsSdkVersion) {
  $existingAfxRes = Get-ChildItem -Path (Join-Path $VsInstallPath "VC\\Tools\\MSVC\\*\\ATLMFC\\include\\afxres.h") -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existingAfxRes) {
    return
  }

  $winResHeader = Join-Path $WindowsSdkRoot "Include\\$WindowsSdkVersion\\um\\winres.h"
  if (-not (Test-Path $winResHeader)) {
    throw "Missing winres.h at $winResHeader"
  }

  $shimContent = @(
    "#pragma once",
    "#include <winres.h>"
  )

  @(
    (Join-Path $RepoAbs "WeaselTSF\\afxres.h"),
    (Join-Path $RepoAbs "WeaselServer\\afxres.h")
  ) | ForEach-Object {
    Set-Content -Path $_ -Encoding ascii -Value $shimContent
  }
}

function Clear-StaleLibrimeState([string]$RepoAbs) {
  $librimeRoot = Join-Path $RepoAbs "librime"
  if (-not (Test-Path $librimeRoot)) {
    return
  }

  $staleDirectories = @(
    "build",
    "build_x64",
    "build_Win32",
    "dist",
    "dist_x64",
    "dist_Win32",
    "lib",
    "lib_x64",
    "lib_Win32"
  )

  foreach ($relativeDir in $staleDirectories) {
    $fullPath = Join-Path $librimeRoot $relativeDir
    if (Test-Path $fullPath) {
      Remove-Item -Recurse -Force $fullPath
    }
  }

  $dependencyBuildRoots = @(
    "deps\\glog",
    "deps\\googletest",
    "deps\\leveldb",
    "deps\\marisa-trie",
    "deps\\opencc",
    "deps\\yaml-cpp"
  )
  $dependencyBuildNames = @(
    "build",
    "build_x64",
    "build_Win32"
  )

  foreach ($dependencyRoot in $dependencyBuildRoots) {
    foreach ($buildDir in $dependencyBuildNames) {
      $fullPath = Join-Path $librimeRoot (Join-Path $dependencyRoot $buildDir)
      if (Test-Path $fullPath) {
        Remove-Item -Recurse -Force $fullPath
      }
    }
  }
}

$workspaceRoot = Resolve-WorkspaceRoot
$repoAbs = Normalize-ExistingPath (Join-Path $workspaceRoot $RepoDir)
$vsInfo = Resolve-VsWithAtl
$vsDevCmd = $vsInfo.VsDevCmd
$vcVarsAllPath = Resolve-VcVarsAllPath $vsInfo.InstallationPath
$windowsSdkRoot = Resolve-WindowsSdkRoot
$windowsSdkVersion = Resolve-WindowsSdkVersion $windowsSdkRoot
$boostAbs = Resolve-BoostRoot -RepoAbs $repoAbs -RequestedBoostRoot $BoostRoot
$versionInfo = Resolve-WeaselVersionInfo -RepoAbs $repoAbs
$nsis = "C:\\Program Files (x86)\\NSIS\\Bin\\makensis.exe"
$envBatPath = Join-Path $repoAbs "env.bat"
$trustedToolPaths = Get-TrustedToolPaths
$runtimeRepoRoot = $repoAbs
$substWasCreated = $false
$generatorInstance = $vsInfo.InstallationPath
if (-not [string]::IsNullOrWhiteSpace($vsInfo.InstallationVersion)) {
  $generatorInstance = "$($vsInfo.InstallationPath),version=$($vsInfo.InstallationVersion)"
}

if ($UseSubst) {
  $substInfo = Ensure-SubstDrive -DriveLetter $SubstDrive -TargetPath $repoAbs
  $runtimeRepoRoot = $substInfo.Root.TrimEnd('\')
  $substWasCreated = $substInfo.Created
}

$boostRuntime = Convert-ToRepoRuntimePath -Path $boostAbs -RepoAbs $repoAbs -RuntimeRepoRoot $runtimeRepoRoot

if (-not (Test-Path $vsDevCmd)) {
  throw "Missing Visual Studio developer command script: $vsDevCmd"
}
if (-not (Test-Path (Join-Path $boostAbs "boost"))) {
  throw "Missing Boost headers under $boostAbs"
}
if (-not (Test-Path (Join-Path $windowsSdkRoot "Include"))) {
  throw "Missing Windows SDK at $windowsSdkRoot"
}
if ($BuildArgs -match "installer" -and -not (Test-Path $nsis)) {
  throw "NSIS is required for installer builds: $nsis"
}

if ($BuildArgs -match '(^|\s)(rime|librime)(\s|$)') {
  Clear-StaleLibrimeState -RepoAbs $repoAbs
}

Ensure-BoostProjectConfig -BoostRoot $boostAbs -BjamToolset $BjamToolset -VcVarsAllPath $vcVarsAllPath
Ensure-LibrimeGeneratorInstanceSupport -RepoAbs $repoAbs
Ensure-AfxResShim -RepoAbs $repoAbs -VsInstallPath $vsInfo.InstallationPath -WindowsSdkRoot $windowsSdkRoot -WindowsSdkVersion $windowsSdkVersion

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $stamp = Get-Date -Format "yyyyMMdd"
  $LogPath = "TODO/ime-research/logs/${stamp}_rime-weasel_build.log"
}

$logAbs = Join-Path $workspaceRoot $LogPath
$exitAbs = [System.IO.Path]::ChangeExtension($logAbs, ".exitcode.txt")
Ensure-Dir (Split-Path -Parent $logAbs)

$envBatLines = @(
  "rem Generated by run_rime_weasel_build.ps1",
  "set WEASEL_ROOT=%CD%",
  "set BOOST_ROOT=$boostRuntime",
  "set BJAM_TOOLSET=$BjamToolset",
  "set CMAKE_GENERATOR=""Visual Studio 17 2022""",
  "set CMAKE_GENERATOR_INSTANCE=$generatorInstance",
  "set PLATFORM_TOOLSET=$PlatformToolset",
  "rem set DEVTOOLS_PATH=D:\Git\cmd;D:\Git\usr\bin;D:\perl\c\bin;"
)
Set-Content -Path $envBatPath -Encoding ascii -Value $envBatLines

$boostDir = Join-Path $boostRuntime "stage\\lib\\cmake\\Boost-1.84.0"
$buildTokens = @($BuildArgs -split '\s+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$actionTokens = @('boost', 'data', 'opencc', 'rime', 'librime', 'weasel', 'installer', 'arm64', 'all')
$hasExplicitAction = @($buildTokens | Where-Object { $_ -in $actionTokens }).Count -gt 0
$hasWeaselLikeAction = ($buildTokens -contains 'weasel') -or ($buildTokens -contains 'installer') -or ($buildTokens -contains 'all') -or (-not $hasExplicitAction)
$hasExplicitData = ($buildTokens -contains 'data') -or ($buildTokens -contains 'all')
$essayPath = Join-Path $repoAbs "output\\data\\essay.txt"
$runDataPrePhase = $hasExplicitData -or ($hasWeaselLikeAction -and -not (Test-Path $essayPath))
$mainBuildTokens = @($buildTokens)
if ($runDataPrePhase) {
  $mainBuildTokens = @($mainBuildTokens | Where-Object { $_ -ne 'data' })
}
$mainHasExplicitAction = @($mainBuildTokens | Where-Object { $_ -in $actionTokens }).Count -gt 0
$skipMainBuild = $runDataPrePhase -and -not $mainHasExplicitAction
$configTokens = @($buildTokens | Where-Object { $_ -in @('release', 'debug', 'rebuild') })
if (-not $configTokens) {
  $configTokens = @('release')
}
$dataBuildArgs = (($configTokens + @('data')) | Select-Object -Unique) -join ' '
$mainBuildArgs = ($mainBuildTokens -join ' ').Trim()
$tempCmd = Join-Path $env:TEMP "run_rime_weasel_build_$PID.cmd"
$tempWrapper = Join-Path $env:TEMP "run_rime_weasel_build_wrapper_$PID.cmd"
$tempSanitize = Join-Path $env:TEMP "run_rime_weasel_build_sanitize_$PID.ps1"
$tempSanitizeCmd = Join-Path $env:TEMP "run_rime_weasel_build_sanitize_$PID.cmd"
$trustedToolLiteral = ($trustedToolPaths | ForEach-Object { "'$_'" }) -join ", "

$sanitizeLines = @(
  '$variables = @("PATH", "CMAKE_PREFIX_PATH", "INCLUDE", "LIB", "LIBPATH", "EXTERNAL_INCLUDE")',
  '$patterns = @(',
  "  '(?i)[\\/](Anaconda)([\\/]|$)',",
  "  '(?i)[\\/](condabin)([\\/]|$)',",
  "  '(?i)[\\/](conda)([\\/]|$)'",
  ')',
  '$trusted = @(' + $trustedToolLiteral + ')',
  'foreach ($name in $variables) {',
  '  $raw = [Environment]::GetEnvironmentVariable($name, "Process")',
  '  if ($null -eq $raw) {',
  '    Write-Output ("set `"{0}=`"" -f $name)',
  '    continue',
  '  }',
  '  $parts = $raw -split ";" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }',
  '  $filtered = foreach ($part in $parts) {',
  '    $keep = $true',
  '    foreach ($pattern in $patterns) {',
  '      if ($part -match $pattern) {',
  '        $keep = $false',
  '        break',
  '      }',
  '    }',
  '    if ($keep) { $part }',
  '  }',
  '  if ($name -eq "PATH") {',
  '    $trustedExisting = @($trusted) | Where-Object { Test-Path $_ }',
  '    $filtered = @($filtered) + @($trustedExisting)',
  '    $filtered = $filtered | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique',
  '  } else {',
  '    $filtered = @($filtered) | Select-Object -Unique',
  '  }',
  '  Write-Output ("set `"{0}={1}`"" -f $name, ($filtered -join ";"))',
  '}'
)

Set-Content -Path $tempSanitize -Encoding ascii -Value $sanitizeLines

$cmdLines = @(
  "@echo off",
  "call `"$vsDevCmd`" -arch=x64 -host_arch=x64 >nul",
  "if errorlevel 1 exit /b 1",
  "powershell -NoProfile -ExecutionPolicy Bypass -File `"$tempSanitize`" > `"$tempSanitizeCmd`"",
  "if errorlevel 1 exit /b 1",
  "call `"$tempSanitizeCmd`"",
  "if errorlevel 1 exit /b 1"
)

if ($runDataPrePhase) {
  $cmdLines += @(
    "cd /d `"$repoAbs`"",
    "build.bat $dataBuildArgs",
    "if errorlevel 1 exit /b 1"
  )
}

if (-not $skipMainBuild) {
  $cmdLines += @(
    "set `"BOOST_ROOT=$boostRuntime`"",
    "set `"Boost_ROOT=$boostRuntime`"",
    "set `"Boost_DIR=$boostDir`"",
    "set `"PLATFORM_TOOLSET=$PlatformToolset`"",
    "set `"BJAM_TOOLSET=$BjamToolset`"",
    "set `"CMAKE_GENERATOR_INSTANCE=$generatorInstance`"",
    "set `"WindowsSdkDir=$windowsSdkRoot\\`"",
    "set `"SDKVER=$windowsSdkVersion`"",
    "set `"VERSION_MAJOR=$($versionInfo.VersionMajor)`"",
    "set `"VERSION_MINOR=$($versionInfo.VersionMinor)`"",
    "set `"VERSION_PATCH=$($versionInfo.VersionPatch)`"",
    "set `"PRODUCT_VERSION=$($versionInfo.ProductVersion)`"",
    "set `"FILE_VERSION=$($versionInfo.FileVersion)`"",
    "set `"CMAKE_IGNORE_PREFIX_PATH=D:\Anaconda;D:\Anaconda\Library;D:\Anaconda\Library\usr;D:\Anaconda\Library\bin;D:\Anaconda\Library\lib`"",
    "set `"CMAKE_IGNORE_PATH=D:\Anaconda;D:\Anaconda\Library;D:\Anaconda\Library\include;D:\Anaconda\Library\lib;D:\Anaconda\Library\bin`"",
    "if exist `"$repoAbs\weasel.props`" del /f /q `"$repoAbs\weasel.props`"",
    "cd /d `"$runtimeRepoRoot`"",
    "cscript.exe //nologo //E:JScript render.js weasel.props BOOST_ROOT PLATFORM_TOOLSET VERSION_MAJOR VERSION_MINOR VERSION_PATCH PRODUCT_VERSION FILE_VERSION",
    "if errorlevel 1 exit /b 1",
    "build.bat $mainBuildArgs",
    "if errorlevel 1 exit /b 1"
  )
}

Set-Content -Path $tempCmd -Encoding ascii -Value $cmdLines
Set-Content -Path $tempWrapper -Encoding ascii -Value @(
  "@echo off",
  "call `"$tempCmd`" > `"$logAbs`" 2>&1",
  "exit /b %ERRORLEVEL%"
)

try {
  & cmd /c $tempWrapper
  $exitCode = $LASTEXITCODE
  Set-Content -Path $exitAbs -Encoding ascii -Value $exitCode

  if ($exitCode -ne 0) {
    if (Test-Path $logAbs) {
      Get-Content -Tail 120 -Encoding UTF8 $logAbs
    }
    throw "rime-weasel build failed (exit code: $exitCode), see $logAbs"
  }
}
finally {
  if (Test-Path $tempCmd) {
    Remove-Item -Force $tempCmd
  }
  if (Test-Path $tempWrapper) {
    Remove-Item -Force $tempWrapper
  }
  if (Test-Path $tempSanitize) {
    Remove-Item -Force $tempSanitize
  }
  if (Test-Path $tempSanitizeCmd) {
    Remove-Item -Force $tempSanitizeCmd
  }
  if ($substWasCreated) {
    Remove-SubstDrive -DriveLetter $SubstDrive
  }
}

Write-Host "Build succeeded. Log: $logAbs"
