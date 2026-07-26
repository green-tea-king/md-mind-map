[CmdletBinding()]
param(
  [switch]$DryRun,
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedHead = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:MaxStartupAttempts = 5
$script:RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Get-StableProcessWorkingDirectory {
  $tempPath = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not (Test-Path -LiteralPath $tempPath -PathType Container)) {
    throw "Stable process working directory is unavailable: $tempPath"
  }
  return $tempPath
}

function Test-TransientStartupFailure {
  param([Parameter(Mandatory)][string]$Message)
  return $Message -match '(?i)(permission denied|not recognized|not found|cannot find|not accessible|access is denied)'
}

$deployPath = Join-Path $script:RepoRoot 'deploy.ps1'
$arguments = @('-NoProfile', '-File', $deployPath)
if ($DryRun) { $arguments += '-DryRun' }
if ($ExpectedHead) { $arguments += @('-ExpectedHead', $ExpectedHead) }

for ($attempt = 1; $attempt -le $script:MaxStartupAttempts; $attempt++) {
  $output = @()
  try {
    Push-Location -LiteralPath (Get-StableProcessWorkingDirectory)
    try {
      $output = @(& pwsh @arguments 2>&1)
      $exitCode = $LASTEXITCODE
    } finally {
      Pop-Location
    }
    $output | ForEach-Object { Write-Output $_ }
    if ($exitCode -eq 0) { exit 0 }
    $message = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
    if ($attempt -ge $script:MaxStartupAttempts -or -not (Test-TransientStartupFailure -Message $message)) {
      throw "Deployment launcher failed with exit code $exitCode.`n$message"
    }
  } catch {
    $message = $_.Exception.Message
    if ($attempt -ge $script:MaxStartupAttempts -or -not (Test-TransientStartupFailure -Message $message)) {
      throw
    }
  }
  Write-Warning "WebDAV deployment startup transient failure; retry $($attempt + 1)/$($script:MaxStartupAttempts)."
  Start-Sleep -Milliseconds (250 * $attempt)
}

throw 'Deployment launcher exhausted its startup retry budget.'
