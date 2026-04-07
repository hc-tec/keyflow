param(
  [string]$EnvPath = "",
  [string]$ConfigPath = "",
  [ValidateSet("deepseek-chat", "deepseek-reasoner")]
  [string]$PrimaryModel = "deepseek-chat",
  [string]$WorkspacePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Missing required command: node"
}

$runnerPath = Join-Path $PSScriptRoot "configure_openclaw_deepseek.mjs"
$arguments = @($runnerPath)

if (-not [string]::IsNullOrWhiteSpace($EnvPath)) {
  $arguments += @("--env-path", $EnvPath)
}
if (-not [string]::IsNullOrWhiteSpace($ConfigPath)) {
  $arguments += @("--config-path", $ConfigPath)
}
if (-not [string]::IsNullOrWhiteSpace($PrimaryModel)) {
  $arguments += @("--primary-model", $PrimaryModel)
}
if (-not [string]::IsNullOrWhiteSpace($WorkspacePath)) {
  $arguments += @("--workspace-path", $WorkspacePath)
}

& node @arguments
if ($LASTEXITCODE -ne 0) {
  throw "configure_openclaw_deepseek.mjs failed"
}
