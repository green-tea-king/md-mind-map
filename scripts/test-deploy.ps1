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
Test-Case 'deployment source exposes dry-run exact-head and bounded CDP contracts' {
  Assert-True ($source.Contains('[switch]$DryRun')) 'DryRun is missing'
  Assert-True ($source.Contains('[string]$ExpectedHead')) 'ExpectedHead is missing'
  Assert-True ($source.Contains('$script:CdpConnectTimeoutSeconds = 10')) 'CDP connect timeout contract is missing'
  Assert-True ($source.Contains('$script:CdpCloseTimeoutSeconds = 2')) 'CDP close timeout contract is missing'
  Assert-True ($source -notmatch '(?s)ConnectAsync\(.{0,250}\[Threading\.CancellationToken\]::None') 'CDP connect is unbounded'
  Assert-True ($source -notmatch '(?s)CloseAsync\(.{0,350}\[Threading\.CancellationToken\]::None') 'CDP close is unbounded'
  Assert-True ($source.Contains('$socket.Abort()')) 'CDP close timeout does not abort the socket'
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
    'Get-FreeLoopbackPort',
    'Start-LocalSiteServer',
    'Stop-OwnedProcess',
    'Receive-CdpMessage',
    'Invoke-CdpCommand',
    'Invoke-ChromeSelfTest',
    'Assert-BrowserResult',
    'Invoke-Mk2mdDeployment'
  )
  foreach ($name in $requiredFunctions) {
    Assert-True ((Get-Command $name).CommandType -eq 'Function') "$name did not load"
  }
}

Test-Case 'checked native failure and timeout throw' {
  $nonZeroThrew = $false
  try { Invoke-CheckedNative -FilePath 'git' -Arguments @('rev-parse', '--verify', 'refs/heads/__mk2md_missing__') } catch { $nonZeroThrew = $true }
  Assert-True $nonZeroThrew 'native non-zero did not throw'

  $timeoutThrew = $false
  $pwshPath = (Get-Command pwsh -ErrorAction Stop).Source
  try {
    Invoke-CheckedNative -FilePath $pwshPath -Arguments @('-NoProfile', '-Command', 'Start-Sleep -Seconds 5') -TimeoutSeconds 1
  } catch {
    $timeoutThrew = $_.Exception.Message -match 'timed out after 1 seconds'
  }
  Assert-True $timeoutThrew 'native timeout did not throw the timeout contract'
}

Test-Case 'CDP command total deadline bounds an event flood' {
  $events = [Collections.ArrayList]::new()
  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  $threw = $false
  try {
    Wait-CdpCommandResponse -Id 42 -Method 'Runtime.evaluate' `
      -DeadlineUtc ([DateTime]::UtcNow.AddMilliseconds(120)) -EventSink $events `
      -ReceiveMessage {
        param([int]$RemainingMilliseconds)
        Start-Sleep -Milliseconds ([Math]::Min(5, [Math]::Max(1, $RemainingMilliseconds)))
        [pscustomobject]@{ method = 'Runtime.consoleAPICalled'; params = @{ type = 'log' } }
      }
  } catch {
    $threw = $_.Exception.Message -match 'total deadline'
  } finally {
    $stopwatch.Stop()
  }
  Assert-True $threw 'event flood did not hit the CDP command total deadline'
  Assert-True ($events.Count -gt 0) 'event flood was not simulated'
  Assert-True ($stopwatch.ElapsedMilliseconds -lt 1000) 'event flood timeout was not bounded'
}

Test-Case 'remote relation matrix is stable' {
  Assert-True ((Resolve-RemoteRelation 'a' 'a' $false $false) -eq 'equal') 'equal failed'
  Assert-True ((Resolve-RemoteRelation 'b' 'a' $true $false) -eq 'local-ahead') 'local-ahead failed'
  Assert-True ((Resolve-RemoteRelation 'a' 'b' $false $true) -eq 'remote-ahead') 'remote-ahead failed'
  Assert-True ((Resolve-RemoteRelation 'a' 'b' $false $false) -eq 'diverged') 'diverged failed'
}

Test-Case 'exact untracked paths are accepted' {
  Assert-ExactUntrackedSet -Actual @('dir\file') -Expected @('dir/file')
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
  try { Assert-ExpectedHead -Actual ('a' * 40) -Expected ('b' * 40) -DryRun $false } catch { $threw = $true }
  Assert-True $threw 'expected-head mismatch did not throw'
}

Test-Case 'dry run bypasses expected-head mismatch' {
  Assert-ExpectedHead -Actual ('a' * 40) -Expected ('b' * 40) -DryRun $true
}

$goodBrowser = [pscustomobject]@{
  Title = 'MK2MD v10.77'; Brand = 'MK2MD'; VersionText = 'v10.77 · 2026-07-17'
  Passed = 11; Failed = 0; ConsoleErrors = @(); PageErrors = @(); Warnings = @(1,2,3,4,5,6)
}

Test-Case 'browser result accepts the current clean baseline after bounded settle' {
  Assert-True ($source.Contains('$script:CdpSettleMilliseconds = 1000')) 'bounded CDP settle contract is missing'
  Assert-True ($source.Contains('$settleDeadline')) 'CDP event settle loop is missing'
  Assert-BrowserResult -Result $goodBrowser -Version '10.77' -Date '2026-07-17'
}

Test-Case 'browser result rejects a console error' {
  Assert-True ([bool](Get-Command Assert-BrowserResult -ErrorAction SilentlyContinue)) 'Assert-BrowserResult is undefined'
  $bad = $goodBrowser.PSObject.Copy(); $bad.ConsoleErrors = @('boom')
  $threw = $false; try { Assert-BrowserResult $bad '10.77' '2026-07-17' } catch { $threw = $true }
  Assert-True $threw 'console error was accepted'
}

Test-Case 'browser result rejects a page error' {
  Assert-True ([bool](Get-Command Assert-BrowserResult -ErrorAction SilentlyContinue)) 'Assert-BrowserResult is undefined'
  $bad = $goodBrowser.PSObject.Copy(); $bad.PageErrors = @('page boom')
  $threw = $false; try { Assert-BrowserResult $bad '10.77' '2026-07-17' } catch { $threw = $true }
  Assert-True $threw 'page error was accepted'
}

Test-Case 'browser result rejects an incomplete self-test' {
  Assert-True ([bool](Get-Command Assert-BrowserResult -ErrorAction SilentlyContinue)) 'Assert-BrowserResult is undefined'
  $bad = $goodBrowser.PSObject.Copy(); $bad.Passed = 10; $bad.Failed = 1
  $threw = $false; try { Assert-BrowserResult $bad '10.77' '2026-07-17' } catch { $threw = $true }
  Assert-True $threw 'incomplete self-test was accepted'
}

Test-Case 'browser result rejects warning count above baseline' {
  Assert-True ([bool](Get-Command Assert-BrowserResult -ErrorAction SilentlyContinue)) 'Assert-BrowserResult is undefined'
  $bad = $goodBrowser.PSObject.Copy(); $bad.Warnings = @(1,2,3,4,5,6,7)
  $threw = $false; try { Assert-BrowserResult $bad '10.77' '2026-07-17' } catch { $threw = $true }
  Assert-True $threw 'warning count above baseline was accepted'
}

Test-Case 'browser result rejects wrong title version and date' {
  Assert-True ([bool](Get-Command Assert-BrowserResult -ErrorAction SilentlyContinue)) 'Assert-BrowserResult is undefined'
  $bad = $goodBrowser.PSObject.Copy()
  $bad.Title = 'MK2MD v10.76'; $bad.Brand = 'Wrong'; $bad.VersionText = 'v10.76 · 2026-07-16'
  $threw = $false; try { Assert-BrowserResult $bad '10.77' '2026-07-17' } catch { $threw = $true }
  Assert-True $threw 'wrong browser identity was accepted'
}

if ($script:failed -gt 0) {
  throw "Deployment contract tests failed: $script:failed failed, $script:passed passed."
}
Write-Host "Deployment contract tests passed: $script:passed/$($script:passed)."
