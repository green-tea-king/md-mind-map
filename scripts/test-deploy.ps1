$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = Split-Path -Parent $PSScriptRoot
$deployPath = Join-Path $repo 'deploy.ps1'
$script:passed = 0
$script:failed = 0

function Test-Case([string]$Name, [scriptblock]$Body) {
  try {
    & $Body
    $script:passed++
    Write-Host "PASS $Name"
  } catch {
    $script:failed++
    Write-Host "FAIL $Name`: $($_.Exception.Message)"
  }
}

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

$source = Get-Content -LiteralPath $deployPath -Raw -Encoding UTF8

Test-Case 'deployment source has no staging or commit commands' {
  Assert-True ($source -notmatch '(?im)^\s*git\s+(add|commit)\b') 'deploy.ps1 still stages or commits'
}
Test-Case 'deployment source has no force or deletion commands' {
  Assert-True ($source -notmatch '(?i)--force|\bRemove-Item\b|\bdel\b') 'unsafe command remains'
}
Test-Case 'deployment source exposes dry-run and exact-head contracts' {
  Assert-True ($source.Contains('[switch]$DryRun')) 'DryRun is missing'
  Assert-True ($source.Contains('[string]$ExpectedHead')) 'ExpectedHead is missing'
}

$dotSourceOutput = @(. $deployPath)

Test-Case 'dot-sourcing does not invoke deployment' {
  Assert-True ($dotSourceOutput.Count -eq 0) 'dot-sourcing invoked deployment'
  $requiredFunctions = @(
    'Invoke-CheckedNative',
    'Assert-ExactUntrackedSet',
    'Get-ProtectedSnapshot',
    'Assert-ProtectedSnapshot',
    'Resolve-RemoteRelation',
    'Assert-ExpectedHead',
    'Invoke-Mk2mdDeployment'
  )
  foreach ($name in $requiredFunctions) {
    Assert-True ((Get-Command $name).CommandType -eq 'Function') "$name did not load"
  }
}

Test-Case 'checked native failure throws' {
  $threw = $false
  try { Invoke-CheckedNative -FilePath 'git' -Arguments @('rev-parse', '--verify', 'refs/heads/__mk2md_missing__') } catch { $threw = $true }
  Assert-True $threw 'native non-zero did not throw'
}

Test-Case 'remote relation matrix is stable' {
  Assert-True ((Resolve-RemoteRelation 'a' 'a' $false $false) -eq 'equal') 'equal failed'
  Assert-True ((Resolve-RemoteRelation 'b' 'a' $true $false) -eq 'local-ahead') 'local-ahead failed'
  Assert-True ((Resolve-RemoteRelation 'a' 'b' $false $true) -eq 'remote-ahead') 'remote-ahead failed'
  Assert-True ((Resolve-RemoteRelation 'a' 'b' $false $false) -eq 'diverged') 'diverged failed'
}

Test-Case 'exact untracked paths are accepted' {
  Assert-ExactUntrackedSet -Actual @('a', 'b') -Expected @('b', 'a')
}

Test-Case 'unexpected untracked paths throw' {
  $threw = $false
  try { Assert-ExactUntrackedSet -Actual @('a', 'c') -Expected @('a', 'b') } catch { $threw = $true }
  Assert-True $threw 'unexpected untracked paths did not throw'
}

Test-Case 'matching protected snapshots are accepted' {
  $before = [ordered]@{ 'a' = 'one' }
  $after = [ordered]@{ 'a' = 'one' }
  Assert-ProtectedSnapshot -Before $before -After $after
}

Test-Case 'protected snapshot drift throws' {
  $threw = $false
  try {
    Assert-ProtectedSnapshot -Before ([ordered]@{ 'a' = 'one' }) -After ([ordered]@{ 'a' = 'two' })
  } catch { $threw = $true }
  Assert-True $threw 'protected snapshot drift did not throw'
}

Test-Case 'expected-head mismatch throws outside dry run' {
  $threw = $false
  try { Assert-ExpectedHead -Actual ('a' * 40) -Expected ('b' * 40) -IsDryRun $false } catch { $threw = $true }
  Assert-True $threw 'expected-head mismatch did not throw'
}

Test-Case 'dry run bypasses expected-head mismatch' {
  Assert-ExpectedHead -Actual ('a' * 40) -Expected ('b' * 40) -IsDryRun $true
}

if ($script:failed -gt 0) {
  throw "Deployment contract tests failed: $script:failed failed, $script:passed passed."
}
Write-Host "Deployment contract tests passed: $script:passed/$($script:passed)."
