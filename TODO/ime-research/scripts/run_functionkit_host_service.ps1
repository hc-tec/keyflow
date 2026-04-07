param(
  [string]$ListenHost = "127.0.0.1",
  [switch]$ExposeToLan,
  [string]$AuthToken = "",
  [int]$Port = 18789,
  [string]$AgentId = "main",
  [string]$ServiceDir = "TODO/function-kit-host-service",
  [string]$OpenClawRepoDir = "TODO/ime-research/repos/openclaw",
  [int]$RenderTimeoutMs = 120000,
  [int]$StatusTimeoutMs = 30000,
  [int]$BodyLimitBytes = 262144
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

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Test-LoopbackHost([string]$HostText) {
  if ([string]::IsNullOrWhiteSpace($HostText)) {
    return $false
  }
  $normalized = $HostText.Trim().ToLowerInvariant()
  return $normalized -in @("127.0.0.1", "localhost", "::1")
}

function New-SharedSecret {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Get-LanIPv4Addresses {
  $addresses = New-Object System.Collections.Generic.List[string]

  if (Get-Command Get-NetIPAddress -ErrorAction SilentlyContinue) {
    try {
      Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object {
          $_.IPAddress -and
          $_.IPAddress -notmatch '^127\.' -and
          $_.IPAddress -ne '0.0.0.0' -and
          $_.SkipAsSource -ne $true
        } |
        ForEach-Object {
          if (-not $addresses.Contains($_.IPAddress)) {
            $addresses.Add($_.IPAddress)
          }
        }
    }
    catch {
    }
  }

  if ($addresses.Count -eq 0) {
    [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
      Where-Object {
        $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up -and
        $_.NetworkInterfaceType -ne [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback
      } |
      ForEach-Object {
        $_.GetIPProperties().UnicastAddresses |
          Where-Object {
            $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
            $_.Address.IPAddressToString -notmatch '^127\.'
          } |
          ForEach-Object {
            $ip = $_.Address.IPAddressToString
            if (-not $addresses.Contains($ip)) {
              $addresses.Add($ip)
            }
          }
      }
  }

  return $addresses.ToArray() | Sort-Object -Unique
}

function Assert-NodeVersion {
  $raw = (& node --version).Trim()
  if (-not $raw.StartsWith("v")) {
    throw "Unrecognized node version: $raw"
  }

  $parts = $raw.TrimStart("v").Split(".")
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  if (-not (($major -gt 22) -or ($major -eq 22 -and $minor -ge 16))) {
    throw "Function Kit host service requires Node >= 22.16 or 24.x. Current version: $raw"
  }
}

$workspaceRoot = Resolve-WorkspaceRoot
$serviceAbs = Resolve-Path (Join-Path $workspaceRoot $ServiceDir)
$openclawAbs = Resolve-Path (Join-Path $workspaceRoot $OpenClawRepoDir)
$effectiveListenHost = $ListenHost

if ($ExposeToLan -and (Test-LoopbackHost $effectiveListenHost)) {
  $effectiveListenHost = "0.0.0.0"
}

if (-not (Test-LoopbackHost $effectiveListenHost) -and [string]::IsNullOrWhiteSpace($AuthToken)) {
  $AuthToken = New-SharedSecret
}

Assert-Command "node"
Assert-Command "pnpm"
Assert-NodeVersion

$env:FUNCTION_KIT_HOST_HOST = $effectiveListenHost
$env:FUNCTION_KIT_HOST_PORT = "$Port"
$env:FUNCTION_KIT_HOST_AUTH_TOKEN = $AuthToken
$env:FUNCTION_KIT_OPENCLAW_AGENT_ID = $AgentId
$env:FUNCTION_KIT_OPENCLAW_REPO = $openclawAbs.Path
$env:FUNCTION_KIT_OPENCLAW_RENDER_TIMEOUT_MS = "$RenderTimeoutMs"
$env:FUNCTION_KIT_OPENCLAW_STATUS_TIMEOUT_MS = "$StatusTimeoutMs"
$env:FUNCTION_KIT_HOST_BODY_LIMIT_BYTES = "$BodyLimitBytes"

Write-Host "Starting Function Kit host service on http://$effectiveListenHost`:$Port"
Write-Host "OpenClaw repo: $($openclawAbs.Path)"
Write-Host "Agent: $AgentId"
if (-not [string]::IsNullOrWhiteSpace($AuthToken)) {
  Write-Host "Host token: $AuthToken"
}
if (-not (Test-LoopbackHost $effectiveListenHost)) {
  $lanUrls = @(Get-LanIPv4Addresses | ForEach-Object { "http://$_`:$Port" })
  if ($lanUrls.Count -gt 0) {
    Write-Host "Android remote base URL candidates:"
    $lanUrls | ForEach-Object { Write-Host "  $_" }
  }
  Write-Host "Android remote auth token: $AuthToken"
}

Push-Location $serviceAbs
try {
  & node ".\src\server.js"
  if ($LASTEXITCODE -ne 0) {
    throw "Function Kit host service exited with code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}
