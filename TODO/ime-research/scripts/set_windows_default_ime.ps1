param(
  [ValidateSet("show", "apply", "restore")]
  [string]$Mode = "show",
  [string]$InputTip = "0804:{A3F4CDED-B1E9-41EE-9CA6-7B4D0DE6CB0A}{3D02CAB6-2B8E-4781-BA20-1C9267529467}",
  [string]$RestoreLogPath = "",
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

function Get-DefaultInputMethodSnapshot {
  $override = Get-WinDefaultInputMethodOverride
  if ($null -eq $override) {
    return [ordered]@{
      input_method_tip = ""
      description = ""
    }
  }

  if ($override -is [string]) {
    return [ordered]@{
      input_method_tip = $override
      description = ""
    }
  }

  $inputTip = ""
  if ($override.PSObject.Properties.Name -contains "InputMethodTip") {
    $inputTip = [string]$override.InputMethodTip
  }
  elseif ($override.PSObject.Properties.Name -contains "InputTip") {
    $inputTip = [string]$override.InputTip
  }
  else {
    $inputTip = ($override | Out-String).Trim()
  }

  $description = ""
  if ($override.PSObject.Properties.Name -contains "Description") {
    $description = [string]$override.Description
  }

  return [ordered]@{
    input_method_tip = $inputTip
    description = $description
  }
}

function Get-UserLanguageSnapshot {
  return @(
    Get-WinUserLanguageList | ForEach-Object {
      [ordered]@{
        language_tag = $_.LanguageTag
        input_method_tips = @($_.InputMethodTips)
      }
    }
  )
}

function Resolve-RestoreInputTip([string]$WorkspaceRoot, [string]$RequestedRestoreLogPath) {
  if ([string]::IsNullOrWhiteSpace($RequestedRestoreLogPath)) {
    throw "restore mode requires -RestoreLogPath."
  }

  $candidatePaths = @(
    $RequestedRestoreLogPath,
    (Join-Path $WorkspaceRoot $RequestedRestoreLogPath)
  ) | Select-Object -Unique

  foreach ($candidate in $candidatePaths) {
    if (Test-Path $candidate) {
      $json = Get-Content -Raw -Encoding utf8 $candidate | ConvertFrom-Json
      if ($null -eq $json.before.input_method_tip -or [string]::IsNullOrWhiteSpace([string]$json.before.input_method_tip)) {
        throw "Restore log does not contain before.input_method_tip: $candidate"
      }

      return [string]$json.before.input_method_tip
    }
  }

  throw "Restore log not found: $RequestedRestoreLogPath"
}

$workspaceRoot = Resolve-WorkspaceRoot
$stamp = Get-Date -Format "yyyyMMdd"
if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = "TODO/ime-research/logs/${stamp}_windows_ime_${Mode}.json"
}
$logAbs = Join-Path $workspaceRoot $LogPath
Ensure-Dir (Split-Path -Parent $logAbs)

$requestedInputTip = $InputTip
if ($Mode -eq "restore") {
  $requestedInputTip = Resolve-RestoreInputTip -WorkspaceRoot $workspaceRoot -RequestedRestoreLogPath $RestoreLogPath
}

$before = Get-DefaultInputMethodSnapshot
$languagesBefore = Get-UserLanguageSnapshot

$tipPresent = $false
foreach ($language in $languagesBefore) {
  if ($language.input_method_tips -contains $requestedInputTip) {
    $tipPresent = $true
    break
  }
}

if (($Mode -eq "apply" -or $Mode -eq "restore") -and -not $tipPresent) {
  throw "Requested InputTip is not present in current user language list: $requestedInputTip"
}

if ($Mode -eq "apply" -or $Mode -eq "restore") {
  Set-WinDefaultInputMethodOverride -InputTip $requestedInputTip
  Start-Sleep -Milliseconds 500
}

$after = Get-DefaultInputMethodSnapshot
$languagesAfter = Get-UserLanguageSnapshot

$result = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  mode = $Mode
  requested_input_tip = $requestedInputTip
  before = $before
  after = $after
  languages_before = $languagesBefore
  languages_after = $languagesAfter
}

Set-Content -Path $logAbs -Encoding utf8 -Value ($result | ConvertTo-Json -Depth 8)
Write-Output ($result | ConvertTo-Json -Depth 8)

if (($Mode -eq "apply" -or $Mode -eq "restore") -and $after.input_method_tip -ne $requestedInputTip) {
  throw "Default input method override did not change to requested InputTip. See $logAbs"
}
