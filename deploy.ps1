[CmdletBinding()]
param(
  [switch]$DryRun,
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedHead = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ExpectedRepoSlug = 'green-tea-king/md-mind-map'
$script:ExpectedBranch = 'master'
$script:LiveUrl = 'https://green-tea-king.github.io/md-mind-map/'
$script:ProtectedUntracked = @(
  'BACKUP_MANIFEST.md',
  'MD心智圖_v10_00.html',
  'agent.md',
  'clear-auto-draft.html',
  'design.md',
  'repository-history.bundle'
)

function Invoke-CheckedNative {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = $script:RepoRoot,
    [int]$TimeoutSeconds = 0
  )
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FilePath
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$psi.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if ($TimeoutSeconds -gt 0 -and -not $process.WaitForExit($TimeoutSeconds * 1000)) {
    $process.Kill($true)
    $process.WaitForExit()
    throw "Native command timed out after $TimeoutSeconds seconds: $FilePath $($Arguments -join ' ')"
  }
  if ($TimeoutSeconds -le 0) { $process.WaitForExit() }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $result = [pscustomobject]@{ ExitCode = $process.ExitCode; StdOut = $stdout; StdErr = $stderr }
  if ($result.ExitCode -ne 0) {
    throw "Native command failed ($($result.ExitCode)): $FilePath $($Arguments -join ' ')`n$stderr"
  }
  return $result
}

function Assert-ExactUntrackedSet {
  param([string[]]$Actual, [string[]]$Expected)
  $actualSorted = @($Actual | ForEach-Object { $_.Replace('\\','/') } | Sort-Object)
  $expectedSorted = @($Expected | ForEach-Object { $_.Replace('\\','/') } | Sort-Object)
  $difference = @(Compare-Object -ReferenceObject $expectedSorted -DifferenceObject $actualSorted)
  if ($difference.Count -gt 0) {
    throw "Unexpected untracked paths: $($difference | ForEach-Object { $_.InputObject + $_.SideIndicator } | Join-String -Separator ', ')"
  }
}

function Get-ProtectedSnapshot {
  param([string]$Repo, [string[]]$Paths)
  $snapshot = [ordered]@{}
  foreach ($path in $Paths) {
    $fullPath = Join-Path $Repo $path
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { throw "Protected file missing: $path" }
    $snapshot[$path] = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash
  }
  return $snapshot
}

function Assert-ProtectedSnapshot {
  param([Collections.IDictionary]$Before, [Collections.IDictionary]$After)
  if ($Before.Count -ne $After.Count) { throw 'Protected snapshot path count changed.' }
  foreach ($path in $Before.Keys) {
    if (-not $After.Contains($path) -or $After[$path] -ne $Before[$path]) {
      throw "Protected file changed: $path"
    }
  }
}

function Resolve-RemoteRelation {
  param([string]$LocalHead, [string]$RemoteHead, [bool]$RemoteIsAncestor, [bool]$LocalIsAncestor)
  if ($LocalHead -eq $RemoteHead) { return 'equal' }
  if ($RemoteIsAncestor) { return 'local-ahead' }
  if ($LocalIsAncestor) { return 'remote-ahead' }
  return 'diverged'
}

function Assert-ExpectedHead {
  param([string]$Actual, [string]$Expected, [bool]$IsDryRun)
  if ($IsDryRun) { return }
  if ($Expected -notmatch '^[0-9a-fA-F]{40}$' -or $Actual -ne $Expected.ToLowerInvariant()) {
    throw "ExpectedHead must equal local HEAD: $Actual"
  }
}

function Invoke-Mk2mdDeployment {
  param([switch]$IsDryRun, [string]$ConfirmedHead)
  if (-not $IsDryRun) {
    throw 'Actual deployment is disabled by the policy-core build.'
  }
  return [pscustomobject]@{
    Phase = 'policy-core'
    DryRun = $true
    ConfirmedHead = $ConfirmedHead
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  Invoke-Mk2mdDeployment -IsDryRun:$DryRun -ConfirmedHead $ExpectedHead
}
