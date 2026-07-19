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
  Assert-True ($source.Contains('[int]$TimeoutSeconds = 60')) 'checked native commands do not have a default bound'
  Assert-True ($source -notmatch '(?s)ConnectAsync\(.{0,250}\[Threading\.CancellationToken\]::None') 'CDP connect is unbounded'
  Assert-True ($source -notmatch '(?s)CloseAsync\(.{0,350}\[Threading\.CancellationToken\]::None') 'CDP close is unbounded'
  Assert-True ($source.Contains('$socket.Abort()')) 'CDP close timeout does not abort the socket'
  Assert-True ($source -notmatch '(?s)\$receiveMessage\s*=\s*\{.{0,300}\}\.GetNewClosure\(\)') 'CDP receive helper is isolated from script-scope functions'
  Assert-True ($source.Contains('throw "Local HEAD changed before push')) 'push adapter does not recheck the exact HEAD immediately before push'
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

$testHead = 'a' * 40
$testRemote = 'b' * 40
$successfulRun = [pscustomobject]@{
  databaseId = 42
  headSha = $testHead
  status = 'completed'
  conclusion = 'success'
  url = 'https://github.com/green-tea-king/md-mind-map/actions/runs/42'
  createdAt = '2026-07-19T02:00:00Z'
  event = 'push'
  jobs = @(
    [pscustomobject]@{ name = 'build'; status = 'completed'; conclusion = 'success' },
    [pscustomobject]@{ name = 'deploy'; status = 'completed'; conclusion = 'success' }
  )
}

function New-TestRepositoryContext([string]$Relation) {
  [pscustomobject]@{
    Branch = 'master'
    OriginSlug = 'green-tea-king/md-mind-map'
    Head = $testHead
    RemoteHead = if ($Relation -eq 'equal') { $testHead } else { $testRemote }
    Relation = $Relation
    Version = '10.77'
    Date = '2026-07-17'
    Commits = @('fixture commit')
    ChangedPaths = @('deploy.ps1')
    ProtectedHashes = [ordered]@{ fixture = 'same' }
  }
}

function New-TestDeploymentAdapters(
  [Collections.Generic.List[string]]$Calls,
  [object]$Context,
  [object[]]$Runs,
  [object]$RunView,
  [byte[]]$LiveBytes
) {
  $localBytes = [Text.Encoding]::UTF8.GetBytes('fixture')
  return @{
    GetRepositoryContext = { $Context }.GetNewClosure()
    StartLocalSite = {
      [void]$Calls.Add('local-start')
      [pscustomobject]@{ Url = 'http://127.0.0.1:4173/index.html'; Process = $null }
    }.GetNewClosure()
    StopLocalSite = { param($site) [void]$Calls.Add('local-stop') }.GetNewClosure()
    Browser = {
      param($url, $version, $date)
      [void]$Calls.Add("browser:$url")
      return $goodBrowser
    }.GetNewClosure()
    Push = { param($head) [void]$Calls.Add("push:$head") }.GetNewClosure()
    RunList = { [void]$Calls.Add('run-list'); return $Runs }.GetNewClosure()
    WatchRun = {
      param($id, $timeoutSeconds)
      [void]$Calls.Add("watch:$id")
      [void]$Calls.Add("watch-timeout:$timeoutSeconds")
    }.GetNewClosure()
    RunView = { param($id) [void]$Calls.Add("run-view:$id"); return $RunView }.GetNewClosure()
    LocalSource = { return $localBytes }.GetNewClosure()
    LiveSource = {
      param($url, $timeoutSeconds)
      [void]$Calls.Add("live-source:$url")
      [void]$Calls.Add("live-timeout:$timeoutSeconds")
      return $LiveBytes
    }.GetNewClosure()
    ProtectedSnapshot = { return $Context.ProtectedHashes }.GetNewClosure()
    Sleep = { param($seconds) [void]$Calls.Add("sleep:$seconds") }.GetNewClosure()
  }
}

Test-Case 'exact HEAD run selection chooses newest push run' {
  $older = $successfulRun.PSObject.Copy(); $older.databaseId = 41; $older.createdAt = '2026-07-19T01:00:00Z'
  $dispatch = $successfulRun.PSObject.Copy(); $dispatch.databaseId = 43; $dispatch.event = 'workflow_dispatch'; $dispatch.createdAt = '2026-07-19T03:00:00Z'
  $selected = Select-ExactHeadRun -Runs @($older, $dispatch, $successfulRun) -Head $testHead
  Assert-True ($selected.databaseId -eq 42) 'newest exact push run was not selected'
}

Test-Case 'successful Pages run rejects the wrong HEAD SHA' {
  $wrong = $successfulRun.PSObject.Copy(); $wrong.headSha = 'c' * 40
  $threw = $false
  try { Assert-SuccessfulPagesRun -Run $wrong -Head $testHead } catch { $threw = $_.Exception.Message -match 'HEAD' }
  Assert-True $threw 'wrong run SHA was accepted'
}

Test-Case 'Pages run rejects incomplete failed and cancelled states' {
  Assert-True ([bool](Get-Command Assert-SuccessfulPagesRun -ErrorAction SilentlyContinue)) 'Assert-SuccessfulPagesRun is undefined'
  foreach ($state in @(
    @{ status = 'in_progress'; conclusion = '' },
    @{ status = 'completed'; conclusion = 'failure' },
    @{ status = 'completed'; conclusion = 'cancelled' }
  )) {
    $bad = $successfulRun.PSObject.Copy()
    $bad.status = $state.status; $bad.conclusion = $state.conclusion
    $threw = $false; try { Assert-SuccessfulPagesRun -Run $bad -Head $testHead } catch { $threw = $true }
    Assert-True $threw "run state $($state.status)/$($state.conclusion) was accepted"
  }
  $badJob = $successfulRun.PSObject.Copy()
  $badJob.jobs = @(
    [pscustomobject]@{ name = 'build'; status = 'completed'; conclusion = 'success' },
    [pscustomobject]@{ name = 'deploy'; status = 'completed'; conclusion = 'failure' }
  )
  $threw = $false; try { Assert-SuccessfulPagesRun -Run $badJob -Head $testHead } catch { $threw = $true }
  Assert-True $threw 'failed deploy job was accepted'
}

Test-Case 'live source exact SHA-256 match succeeds in memory' {
  $bytes = [Text.Encoding]::UTF8.GetBytes('fixture')
  $result = Wait-LiveSourceMatch -LiveUrl 'https://example.invalid/' -LocalBytes $bytes -Adapters @{
    LiveSource = { param($url) return $bytes }.GetNewClosure()
    Sleep = { param($seconds) throw 'matching source should not sleep' }
  } -TimeoutSeconds 300
  Assert-True ($result.Match -and $result.Hash -eq [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))) 'matching live source was rejected'
}

Test-Case 'live source SHA-256 mismatch stops at the bound' {
  $threw = $false
  try {
    Wait-LiveSourceMatch -LiveUrl 'https://example.invalid/' `
      -LocalBytes ([Text.Encoding]::UTF8.GetBytes('local')) -Adapters @{
        LiveSource = { param($url) [Text.Encoding]::UTF8.GetBytes('remote') }
        Sleep = { param($seconds) throw 'zero timeout must not sleep' }
      } -TimeoutSeconds 0
  } catch { $threw = $_.Exception.Message -match 'SHA-256' }
  Assert-True $threw 'live mismatch did not fail at the bound'
}

Test-Case 'dry run performs local gates without push Actions or live verification' {
  $calls = [Collections.Generic.List[string]]::new()
  $context = New-TestRepositoryContext 'local-ahead'
  $adapters = New-TestDeploymentAdapters $calls $context @($successfulRun) $successfulRun ([Text.Encoding]::UTF8.GetBytes('fixture'))
  $result = Invoke-Mk2mdDeployment -IsDryRun -ConfirmedHead '' -Adapters $adapters
  Assert-True $result.DryRun 'dry-run report was not returned'
  Assert-True ($calls -contains 'local-start' -and $calls -contains 'local-stop') 'dry run skipped or leaked the local server gate'
  Assert-True (@($calls | Where-Object { $_ -like 'browser:http://127.0.0.1:*' }).Count -eq 1) 'dry run skipped local browser gate'
  Assert-True (@($calls | Where-Object { $_ -like 'push:*' -or $_ -like 'watch:*' -or $_ -like 'live-source:*' -or $_ -like 'browser:https://*' }).Count -eq 0) 'dry run performed an external deployment action'
}

Test-Case 'equal remote skips push and verifies exact Actions live and browser' {
  $calls = [Collections.Generic.List[string]]::new()
  $context = New-TestRepositoryContext 'equal'
  $adapters = New-TestDeploymentAdapters $calls $context @($successfulRun) $successfulRun ([Text.Encoding]::UTF8.GetBytes('fixture'))
  $result = Invoke-Mk2mdDeployment -ConfirmedHead $testHead -Adapters $adapters
  Assert-True (-not $result.Pushed) 'equal relation reported a push'
  Assert-True (@($calls | Where-Object { $_ -like 'push:*' }).Count -eq 0) 'equal relation pushed'
  Assert-True ($calls -contains 'watch:42') 'equal relation skipped exact Actions verification'
  $watchTimeout = [int](($calls | Where-Object { $_ -like 'watch-timeout:*' } | Select-Object -First 1) -replace '^watch-timeout:', '')
  Assert-True ($watchTimeout -ge 1 -and $watchTimeout -le 600) 'Actions watch did not receive the remaining 10-minute bound'
  Assert-True (@($calls | Where-Object { $_ -like 'live-source:*' }).Count -eq 1) 'equal relation skipped live source verification'
  $liveTimeout = [int](($calls | Where-Object { $_ -like 'live-timeout:*' } | Select-Object -First 1) -replace '^live-timeout:', '')
  Assert-True ($liveTimeout -ge 1 -and $liveTimeout -le 300) 'live fetch did not receive the remaining 5-minute bound'
  Assert-True (@($calls | Where-Object { $_ -like 'browser:https://*' }).Count -eq 1) 'equal relation skipped live browser verification'
}

Test-Case 'local ahead pushes only the confirmed exact HEAD' {
  $calls = [Collections.Generic.List[string]]::new()
  $context = New-TestRepositoryContext 'local-ahead'
  $adapters = New-TestDeploymentAdapters $calls $context @($successfulRun) $successfulRun ([Text.Encoding]::UTF8.GetBytes('fixture'))
  $result = Invoke-Mk2mdDeployment -ConfirmedHead $testHead -Adapters $adapters
  Assert-True $result.Pushed 'local-ahead relation did not report a push'
  Assert-True (@($calls | Where-Object { $_ -eq "push:$testHead" }).Count -eq 1) 'local-ahead did not push the exact confirmed HEAD once'
}

Test-Case 'remote ahead stops before browser or push' {
  $calls = [Collections.Generic.List[string]]::new()
  $context = New-TestRepositoryContext 'remote-ahead'
  $adapters = New-TestDeploymentAdapters $calls $context @($successfulRun) $successfulRun ([Text.Encoding]::UTF8.GetBytes('fixture'))
  $threw = $false; try { Invoke-Mk2mdDeployment -ConfirmedHead $testHead -Adapters $adapters } catch { $threw = $_.Exception.Message -match 'remote-ahead' }
  Assert-True $threw 'remote-ahead relation did not stop'
  Assert-True (@($calls | Where-Object { $_ -like 'browser:*' -or $_ -like 'push:*' }).Count -eq 0) 'remote-ahead reached browser or push'
}

Test-Case 'diverged history stops before browser or push' {
  $calls = [Collections.Generic.List[string]]::new()
  $context = New-TestRepositoryContext 'diverged'
  $adapters = New-TestDeploymentAdapters $calls $context @($successfulRun) $successfulRun ([Text.Encoding]::UTF8.GetBytes('fixture'))
  $threw = $false; try { Invoke-Mk2mdDeployment -ConfirmedHead $testHead -Adapters $adapters } catch { $threw = $_.Exception.Message -match 'diverged' }
  Assert-True $threw 'diverged relation did not stop'
  Assert-True (@($calls | Where-Object { $_ -like 'browser:*' -or $_ -like 'push:*' }).Count -eq 0) 'diverged relation reached browser or push'
}

if ($script:failed -gt 0) {
  throw "Deployment contract tests failed: $script:failed failed, $script:passed passed."
}
Write-Host "Deployment contract tests passed: $script:passed/$($script:passed)."
