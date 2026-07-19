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
  Assert-True ($source.Contains('Invoke-ExactHeadPush -Initial $context')) `
    'production push adapter does not use the exact pre-push barrier'
}

$dotSourceOutput = @(. $deployPath)

Test-Case 'dot-sourcing does not invoke deployment' {
  Assert-True ($dotSourceOutput.Count -eq 0) 'dot-sourcing invoked deployment'
  $requiredFunctions = @(
    'Invoke-CheckedNative',
    'Invoke-RepositoryNative',
    'Assert-ExactUntrackedSet',
    'Get-ProtectedSnapshot',
    'Assert-ProtectedSnapshot',
    'Resolve-RemoteRelation',
    'Assert-ExpectedHead',
    'Get-FreeLoopbackPort',
    'Get-InstalledChromePath',
    'New-OwnedChromeProfile',
    'Remove-OwnedChromeProfile',
    'Assert-PlainOwnedChromeProfileDirectory',
    'New-ChromeObservationTimeoutException',
    'Throw-ChromeFailure',
    'Start-LocalSiteServer',
    'Stop-OwnedProcess',
    'Receive-CdpMessage',
    'Invoke-CdpCommand',
    'Invoke-ChromeSelfTest',
    'Assert-BrowserResult',
    'Get-RemoteIdentity',
    'Get-RepositoryContext',
    'Get-PrePushRepositoryState',
    'Assert-PrePushRepositoryState',
    'Invoke-ExactHeadPush',
    'Get-RemainingWholeSeconds',
    'Watch-PagesWorkflowRun',
    'Get-PagesWorkflowRun',
    'Get-RepositoryState',
    'Assert-ExactRepositoryState',
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

Test-Case 'CDP command rejects a matching response returned after its total deadline' {
  $threw = $false
  try {
    Wait-CdpCommandResponse -Id 42 -Method 'Runtime.evaluate' `
      -DeadlineUtc ([DateTime]::UtcNow.AddMilliseconds(80)) `
      -ReceiveMessage {
        param([int]$RemainingMilliseconds)
        Start-Sleep -Milliseconds 150
        [pscustomobject]@{ id = 42; result = @{} }
      }
  } catch {
    $threw = $_.Exception.Message -match 'total deadline'
  }
  Assert-True $threw 'late matching CDP response was accepted'
}

Test-Case 'remote relation matrix is stable' {
  Assert-True ((Resolve-RemoteRelation 'a' 'a' $false $false) -eq 'equal') 'equal failed'
  Assert-True ((Resolve-RemoteRelation 'b' 'a' $true $false) -eq 'local-ahead') 'local-ahead failed'
  Assert-True ((Resolve-RemoteRelation 'a' 'b' $false $true) -eq 'remote-ahead') 'remote-ahead failed'
  Assert-True ((Resolve-RemoteRelation 'a' 'b' $false $false) -eq 'diverged') 'diverged failed'
}

Test-Case 'repository slug parser accepts HTTPS SCP-like and SSH URLs' {
  $urls = @(
    'https://github.com/green-tea-king/md-mind-map.git',
    'git@github.com:green-tea-king/md-mind-map.git',
    'ssh://git@github.com/green-tea-king/md-mind-map.git'
  )
  foreach ($url in $urls) {
    Assert-True ((ConvertTo-RepositorySlug -RemoteUrl $url) -eq 'green-tea-king/md-mind-map') "repository slug parse failed for $url"
  }
}

Test-Case 'repository identity rejects non-GitHub URLs and wrong slugs' {
  Assert-True ([bool](Get-Command Assert-RepositorySlug -ErrorAction SilentlyContinue)) 'Assert-RepositorySlug is undefined'
  foreach ($url in @('https://example.com/green-tea-king/md-mind-map.git', 'ssh://git@example.com/green-tea-king/md-mind-map.git')) {
    $threw = $false; try { ConvertTo-RepositorySlug -RemoteUrl $url } catch { $threw = $true }
    Assert-True $threw "non-GitHub URL was accepted: $url"
  }
  $threw = $false; try { Assert-RepositorySlug -Slug 'green-tea-king/another-repo' } catch { $threw = $true }
  Assert-True $threw 'wrong GitHub repository slug was accepted'
  Assert-RepositorySlug -Slug 'green-tea-king/md-mind-map'
}

function New-ProductionPreflightFixture([Collections.IDictionary]$Scenario = @{}) {
  $settings = @{
    Branch = 'master'
    FetchUrls = @('https://github.com/green-tea-king/md-mind-map.git')
    PushUrls = @('https://github.com/green-tea-king/md-mind-map.git')
    WorkingDiffExit = 0
    StagedDiffExit = 0
    Untracked = @($script:ProtectedUntracked)
    AuthExit = 0
    PushPermission = 'true'
    Relation = 'local-ahead'
    SnapshotDrift = $false
    ContractExit = 0
    ContractTimeout = $false
  }
  foreach ($key in $Scenario.Keys) { $settings[$key] = $Scenario[$key] }

  $calls = [Collections.Generic.List[object]]::new()
  $head = 'a' * 40
  $remoteHead = if ($settings.Relation -eq 'equal') { $head } else { 'b' * 40 }
  $native = {
    param($filePath, $arguments, $repoPath, $allowedExitCodes, $timeoutSeconds)
    $arguments = @($arguments)
    $joined = $arguments -join ' '
    $key = switch -Regex ("$filePath $joined") {
      '^git branch --show-current$' { 'git:branch'; break }
      '^git remote get-url --all origin$' { 'git:fetch-url'; break }
      '^git remote get-url --push --all origin$' { 'git:push-url'; break }
      '^git diff --quiet$' { 'git:working-diff'; break }
      '^git diff --cached --quiet$' { 'git:staged-diff'; break }
      '^git -c core\.quotepath=false status --porcelain=v1 -uall$' { 'git:status'; break }
      '^node scripts/check-version-consistency\.test\.js$' { 'node:version-test'; break }
      '^node scripts/check-version-consistency\.js$' { 'node:version-gate'; break }
      '^node -e ' { 'node:vm-script'; break }
      '^pwsh -NoProfile -File scripts/test-deploy\.ps1$' { 'pwsh:contract'; break }
      '^gh auth status$' { 'gh:auth'; break }
      '^gh api repos/green-tea-king/md-mind-map --jq \.permissions\.push$' { 'gh:permission'; break }
      '^git ls-remote origin refs/heads/master$' { 'git:ls-remote'; break }
      '^git fetch --no-tags origin master$' { 'git:fetch'; break }
      '^git rev-parse HEAD$' { 'git:head'; break }
      '^git merge-base --is-ancestor ' { if ($arguments[2] -eq $remoteHead) { 'git:remote-ancestor' } else { 'git:local-ancestor' }; break }
      '^git log --format=%H %s ' { 'git:log'; break }
      '^git diff --name-only ' { 'git:changed-paths'; break }
      default { throw "Unexpected production command: $filePath $joined" }
    }
    [void]$calls.Add([pscustomobject]@{
      Key = $key
      FilePath = $filePath
      Arguments = $arguments
      Repo = $repoPath
      AllowedExitCodes = @($allowedExitCodes)
      TimeoutSeconds = $timeoutSeconds
    })

    if ($key -eq 'pwsh:contract' -and $settings.ContractTimeout) {
      throw 'Native command timed out after 60 seconds: pwsh -NoProfile -File scripts/test-deploy.ps1'
    }

    $exitCode = 0
    $stdout = switch ($key) {
      'git:branch' { [string]$settings.Branch; break }
      'git:fetch-url' { @($settings.FetchUrls) -join "`n"; break }
      'git:push-url' { @($settings.PushUrls) -join "`n"; break }
      'git:working-diff' { $exitCode = [int]$settings.WorkingDiffExit; ''; break }
      'git:staged-diff' { $exitCode = [int]$settings.StagedDiffExit; ''; break }
      'git:status' { @($settings.Untracked | ForEach-Object { "?? $_" }) -join "`n"; break }
      'node:vm-script' { '{"version":"10.78","date":"2026-07-19"}'; break }
      'pwsh:contract' { $exitCode = [int]$settings.ContractExit; 'Deployment contract tests passed: 60/60.'; break }
      'gh:auth' { $exitCode = [int]$settings.AuthExit; ''; break }
      'gh:permission' { [string]$settings.PushPermission; break }
      'git:ls-remote' { "$remoteHead`trefs/heads/master"; break }
      'git:head' { $head; break }
      'git:remote-ancestor' { $exitCode = if ($settings.Relation -in @('equal', 'local-ahead')) { 0 } else { 1 }; ''; break }
      'git:local-ancestor' { $exitCode = if ($settings.Relation -in @('equal', 'remote-ahead')) { 0 } else { 1 }; ''; break }
      'git:log' { "$head fixture commit"; break }
      'git:changed-paths' { 'deploy.ps1'; break }
      default { ''; break }
    }
    $result = [pscustomobject]@{ ExitCode = $exitCode; StdOut = $stdout; StdErr = if ($exitCode) { 'fixture failure' } else { '' } }
    if ($exitCode -notin @($allowedExitCodes)) {
      throw "Native command failed ($exitCode): $filePath $joined`n$($result.StdErr)"
    }
    return $result
  }.GetNewClosure()

  $snapshotState = @{ Count = 0 }
  $snapshotProvider = {
    param($repoPath, $protectedPaths)
    $snapshotState.Count++
    [void]$calls.Add([pscustomobject]@{
      Key = "snapshot:$($snapshotState.Count)"
      Repo = $repoPath
      ProtectedPaths = @($protectedPaths)
    })
    $snapshot = [ordered]@{}
    foreach ($path in $protectedPaths) { $snapshot[$path] = "hash:$path" }
    if ($settings.SnapshotDrift -and $snapshotState.Count -gt 1) { $snapshot[$protectedPaths[0]] = 'changed' }
    return $snapshot
  }.GetNewClosure()

  return [pscustomobject]@{
    Calls = $calls
    Native = $native
    SnapshotProvider = $snapshotProvider
    Head = $head
    RemoteHead = $remoteHead
  }
}

Test-Case 'production repository preflight executes the exact checked command sequence' {
  $fixture = New-ProductionPreflightFixture
  $context = Get-RepositoryContext -Repo 'fixture' -Native $fixture.Native -SnapshotProvider $fixture.SnapshotProvider
  Assert-True ($context.FetchUrl -eq 'https://github.com/green-tea-king/md-mind-map.git') 'exact fetch URL was not retained'
  Assert-True ($context.PushUrl -eq 'https://github.com/green-tea-king/md-mind-map.git') 'exact push URL was not retained'
  Assert-True ($context.OriginSlug -eq 'green-tea-king/md-mind-map') 'exact repository slug was not retained'
  $expected = @(
    'git:branch', 'git:fetch-url', 'git:push-url', 'git:working-diff', 'git:staged-diff', 'git:status',
    'snapshot:1', 'node:version-test', 'node:version-gate', 'node:vm-script', 'pwsh:contract', 'gh:auth', 'gh:permission',
    'git:ls-remote', 'git:fetch', 'git:head', 'git:remote-ancestor', 'git:local-ancestor',
    'git:log', 'git:changed-paths', 'snapshot:2'
  )
  $actual = @($fixture.Calls | ForEach-Object Key)
  Assert-True (($actual -join '|') -eq ($expected -join '|')) "production command sequence differed: $($actual -join '|')"
  foreach ($call in @($fixture.Calls | Where-Object { $_.PSObject.Properties.Name -contains 'FilePath' })) {
    Assert-True ($call.Repo -eq 'fixture') "repository command did not use injected repo: $($call.Key)"
    Assert-True ($call.TimeoutSeconds -gt 0) "repository command was unbounded: $($call.Key)"
  }
  Assert-ProtectedSnapshot -Before $context.ProtectedHashes -After ([ordered]@{
    'BACKUP_MANIFEST.md' = 'hash:BACKUP_MANIFEST.md'
    'MD心智圖_v10_00.html' = 'hash:MD心智圖_v10_00.html'
    'agent.md' = 'hash:agent.md'
    'clear-auto-draft.html' = 'hash:clear-auto-draft.html'
    'design.md' = 'hash:design.md'
    'repository-history.bundle' = 'hash:repository-history.bundle'
  })
}

Test-Case 'production preflight runs the full contract suite before external probes and fails closed' {
  foreach ($case in @(
    @{ Scenario = @{ ContractExit = 1 }; Message = 'Native command failed' },
    @{ Scenario = @{ ContractTimeout = $true }; Message = 'timed out after 60 seconds' }
  )) {
    $fixture = New-ProductionPreflightFixture $case.Scenario
    $threw = $false
    try { [void](Get-RepositoryContext -Repo 'fixture' -Native $fixture.Native -SnapshotProvider $fixture.SnapshotProvider) } catch {
      $threw = $_.Exception.Message -match [regex]::Escape($case.Message)
    }
    Assert-True $threw "contract preflight did not fail closed: $($case.Message)"
    $keys = @($fixture.Calls | ForEach-Object Key)
    Assert-True ($keys -contains 'pwsh:contract') 'full contract suite was not invoked'
    Assert-True (@($keys | Where-Object { $_ -like 'gh:*' -or $_ -eq 'git:ls-remote' -or $_ -eq 'git:fetch' }).Count -eq 0) `
      "failed contract suite reached an external probe: $($keys -join '|')"
  }
}

Test-Case 'production preflight rejects wrong or multiple push URLs before external probes' {
  foreach ($scenario in @(
    @{ PushUrls = @('https://github.com/green-tea-king/not-mk2md.git'); Message = 'green-tea-king/md-mind-map' },
    @{ PushUrls = @('https://github.com/green-tea-king/md-mind-map.git', 'git@github.com:someone/else.git'); Message = 'exactly one push URL' }
  )) {
    $fixture = New-ProductionPreflightFixture $scenario
    $threw = $false
    try { Get-RepositoryContext -Repo 'fixture' -Native $fixture.Native -SnapshotProvider $fixture.SnapshotProvider } catch {
      $threw = $_.Exception.Message -match [regex]::Escape($scenario.Message)
    }
    Assert-True $threw "push URL scenario did not fail closed: $($scenario.PushUrls -join ', ')"
    $keys = @($fixture.Calls | ForEach-Object Key)
    Assert-True (@($keys | Where-Object { $_ -like 'node:*' -or $_ -like 'gh:*' -or $_ -eq 'git:fetch' -or $_ -like 'snapshot:*' }).Count -eq 0) `
      "invalid push URL reached a later probe: $($keys -join '|')"
  }
}

Test-Case 'production preflight rejects local repository gate failures' {
  foreach ($case in @(
    @{ Scenario = @{ Branch = 'feature' }; Message = 'branch must be master' },
    @{ Scenario = @{ WorkingDiffExit = 1 }; Message = 'Tracked working-tree changes' },
    @{ Scenario = @{ StagedDiffExit = 1 }; Message = 'Staged changes' },
    @{ Scenario = @{ Untracked = @($script:ProtectedUntracked + 'unexpected.txt') }; Message = 'Unexpected untracked paths' }
  )) {
    $fixture = New-ProductionPreflightFixture $case.Scenario
    $threw = $false
    try { Get-RepositoryContext -Repo 'fixture' -Native $fixture.Native -SnapshotProvider $fixture.SnapshotProvider } catch {
      $threw = $_.Exception.Message -match [regex]::Escape($case.Message)
    }
    Assert-True $threw "local preflight fixture did not reject: $($case.Message)"
  }
}

Test-Case 'production preflight rejects auth permission and unsafe remote relations' {
  foreach ($case in @(
    @{ Scenario = @{ AuthExit = 1 }; Message = 'Native command failed' },
    @{ Scenario = @{ PushPermission = 'false' }; Message = 'push permission' },
    @{ Scenario = @{ Relation = 'remote-ahead' }; Message = 'remote-ahead' },
    @{ Scenario = @{ Relation = 'diverged' }; Message = 'diverged' }
  )) {
    $fixture = New-ProductionPreflightFixture $case.Scenario
    $threw = $false
    try { Get-RepositoryContext -Repo 'fixture' -Native $fixture.Native -SnapshotProvider $fixture.SnapshotProvider } catch {
      $threw = $_.Exception.Message -match [regex]::Escape($case.Message)
    }
    Assert-True $threw "external preflight fixture did not reject: $($case.Message)"
  }
}

Test-Case 'production preflight compares the earliest protected snapshot after all probes' {
  $fixture = New-ProductionPreflightFixture @{ SnapshotDrift = $true }
  $threw = $false
  try { [void](Get-RepositoryContext -Repo 'fixture' -Native $fixture.Native -SnapshotProvider $fixture.SnapshotProvider) } catch {
    $threw = $_.Exception.Message -match 'Protected file changed'
  }
  Assert-True $threw 'protected snapshot drift after production probes was accepted'
  $keys = @($fixture.Calls | ForEach-Object Key)
  Assert-True (($keys.IndexOf('snapshot:1') -gt $keys.IndexOf('git:status')) -and ($keys.IndexOf('snapshot:1') -lt $keys.IndexOf('node:version-test'))) `
    "earliest snapshot was not between exact untracked and Node probes: $($keys -join '|')"
  Assert-True ($keys.IndexOf('snapshot:2') -gt $keys.IndexOf('git:changed-paths')) `
    "protected snapshot was not rechecked after all context probes: $($keys -join '|')"
}

Test-Case 'production final repository observation uses the checked native seam' {
  $calls = [Collections.Generic.List[string]]::new()
  $head = 'a' * 40
  $untrackedFixture = @($script:ProtectedUntracked)
  $native = {
    param($filePath, $arguments, $repoPath, $allowedExitCodes, $timeoutSeconds)
    $joined = @($arguments) -join ' '
    [void]$calls.Add("$filePath $joined")
    $stdout = switch -Regex ("$filePath $joined") {
      '^git branch --show-current$' { 'master'; break }
      '^git rev-parse HEAD$' { $head; break }
      '^git rev-parse refs/heads/master$' { $head; break }
      '^git rev-parse refs/remotes/origin/master$' { $head; break }
      '^git remote get-url --all origin$' { 'https://github.com/green-tea-king/md-mind-map.git'; break }
      '^git remote get-url --push --all origin$' { 'https://github.com/green-tea-king/md-mind-map.git'; break }
      '^git diff --quiet$' { ''; break }
      '^git diff --cached --quiet$' { ''; break }
      '^git -c core\.quotepath=false status --porcelain=v1 -uall$' {
        ($untrackedFixture | ForEach-Object { "?? $_" }) -join "`n"
        break
      }
      '^git ls-remote origin refs/heads/master$' { "$head`trefs/heads/master"; break }
      default { throw "Unexpected final-state command: $filePath $joined" }
    }
    return [pscustomobject]@{ ExitCode = 0; StdOut = $stdout; StdErr = '' }
  }.GetNewClosure()
  $snapshot = { param($repoPath, $protectedPaths) [ordered]@{ fixture = 'same' } }
  $state = Get-RepositoryState -Repo 'fixture' -Native $native -SnapshotProvider $snapshot
  Assert-True ($state.Branch -eq 'master' -and $state.Head -eq $head -and $state.LocalMasterHead -eq $head) `
    'final state omitted branch, HEAD, or local master'
  Assert-True ($state.OriginHead -eq $head -and $state.RemoteHead -eq $head) 'final state omitted origin/master or remote HEAD'
  Assert-True ($state.TrackedClean -and $state.StagedClean) 'final state reported clean fixtures as dirty'
  Assert-True (@($state.Untracked).Count -eq 6) `
    "final state did not preserve the exact untracked set: $(@($state.Untracked).Count) [$(@($state.Untracked) -join '|')]"
  Assert-True (@($calls | Where-Object { $_ -like 'git *' }).Count -ge 9) 'final state bypassed the production native seam'
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
  SelfTest = 'pass'; Detail = ''
  Passed = 11; Failed = 0; ConsoleErrors = @(); PageErrors = @(); Warnings = @(1,2,3,4,5,6)
}

Test-Case 'installed Chrome discovery supports the current Windows or CI host' {
  Assert-True ([bool](Get-Command Get-InstalledChromePath -ErrorAction SilentlyContinue)) `
    'Get-InstalledChromePath is undefined'
  $chromePath = Get-InstalledChromePath
  Assert-True (Test-Path -LiteralPath $chromePath -PathType Leaf) `
    "installed Chrome discovery returned an invalid path: $chromePath"
}

Test-Case 'owned Chrome profile lifecycle is unique exact and fail-closed' {
  $first = New-OwnedChromeProfile
  $second = New-OwnedChromeProfile
  try {
    Assert-True ($first.Path -ne $second.Path) 'owned Chrome profiles were not unique'
    foreach ($profile in @($first, $second)) {
      Assert-True (Test-Path -LiteralPath $profile.Path -PathType Container) `
        "owned Chrome profile was not created: $($profile.Path)"
      Assert-True ((Split-Path -Leaf $profile.Path) -match '^mk2md-chrome-[0-9a-f]{32}$') `
        "owned Chrome profile name was unsafe: $($profile.Path)"
      Assert-True ([IO.Path]::GetFullPath((Split-Path -Parent $profile.Path)).TrimEnd('\','/') -eq `
        [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')) `
        "owned Chrome profile escaped TEMP: $($profile.Path)"
    }

    $wrongToken = if ($first.Token -ne ('0' * 32)) { '0' * 32 } else { '1' * 32 }
    $wrong = [pscustomobject]@{
      Path = $first.Path
      TempRoot = $first.TempRoot
      Token = $wrongToken
      MarkerPath = $first.MarkerPath
    }
    $threw = $false
    try { Remove-OwnedChromeProfile -Profile $wrong } catch { $threw = $_.Exception.Message -match 'marker|owned' }
    Assert-True $threw 'owned Chrome cleanup accepted the wrong creation token'
    Assert-True (Test-Path -LiteralPath $first.Path -PathType Container) `
      'failed-closed Chrome cleanup removed the protected profile'

    $escape = [pscustomobject]@{
      Path = $repo
      TempRoot = $first.TempRoot
      Token = $first.Token
      MarkerPath = Join-Path $repo '.mk2md-owned-profile'
    }
    $threw = $false
    try { Remove-OwnedChromeProfile -Profile $escape } catch { $threw = $_.Exception.Message -match 'owned Chrome profile' }
    Assert-True $threw 'owned Chrome cleanup accepted a path outside TEMP'
    Assert-True (Test-Path -LiteralPath (Join-Path $repo 'index.html') -PathType Leaf) `
      'path-escape guard modified the repository'

    $replacementToken = if ($second.Token -ne ('f' * 32)) { 'f' * 32 } else { 'e' * 32 }
    [IO.File]::WriteAllText($second.MarkerPath, $replacementToken, [Text.UTF8Encoding]::new($false))
    $threw = $false
    try { Remove-OwnedChromeProfile -Profile $second } catch { $threw = $_.Exception.Message -match 'marker' }
    Assert-True $threw 'owned Chrome cleanup accepted a replaced marker'
    Assert-True (Test-Path -LiteralPath $second.Path -PathType Container) `
      'marker-replacement guard removed the protected profile'
    [IO.File]::WriteAllText($second.MarkerPath, $second.Token, [Text.UTF8Encoding]::new($false))
  } finally {
    if (Test-Path -LiteralPath $first.Path) { Remove-OwnedChromeProfile -Profile $first }
    if (Test-Path -LiteralPath $second.Path) { Remove-OwnedChromeProfile -Profile $second }
  }
  Assert-True (-not (Test-Path -LiteralPath $first.Path)) 'first owned Chrome profile was not removed'
  Assert-True (-not (Test-Path -LiteralPath $second.Path)) 'second owned Chrome profile was not removed'
}

Test-Case 'owned Chrome profile guard rejects a top-level reparse point' {
  $reparseFixture = [pscustomobject]@{
    PSIsContainer = $true
    Attributes = [IO.FileAttributes]::Directory -bor [IO.FileAttributes]::ReparsePoint
  }
  $threw = $false
  try {
    Assert-PlainOwnedChromeProfileDirectory -ProfileItem $reparseFixture -ProfilePath 'fixture-reparse'
  } catch {
    $threw = $_.Exception.Message -match 'reparse'
  }
  Assert-True $threw 'owned Chrome profile guard accepted a top-level reparse point'
}

Test-Case 'primary browser timeout keeps evidence when cleanup also fails' {
  $primary = [TimeoutException]::new('Chrome observation timed out with observation elapsed 5007ms.')
  $primary.Data['ObservationElapsedMilliseconds'] = [int64]5007
  $captured = $null
  try {
    Throw-ChromeFailure -PrimaryException $primary -CleanupFailures @('profile cleanup fixture failed')
  } catch {
    $captured = $_.Exception
  }
  Assert-True ($null -ne $captured) 'combined browser failure did not throw'
  Assert-True ($captured.Message -match 'observation timed out') 'cleanup failure replaced the primary browser timeout'
  Assert-True ([int64]$captured.Data['ObservationElapsedMilliseconds'] -eq 5007) `
    'cleanup failure removed the primary observation elapsed evidence'
  Assert-True ([string]$captured.Data['CleanupFailures'] -match 'profile cleanup fixture failed') `
    'combined browser failure omitted cleanup failure evidence'
}

function Get-ChromeFamilyProcessIds {
  $ids = [Collections.Generic.List[int]]::new()
  foreach ($name in @('chrome', 'google-chrome', 'chromium', 'chromium-browser')) {
    foreach ($process in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
      if (-not $ids.Contains($process.Id)) { $ids.Add($process.Id) }
    }
  }
  return @($ids)
}

function New-RealChromeFixtureUrl([string]$BodyScript) {
  $html = @"
<!doctype html><meta charset="utf-8"><title>MK2MD v10.78</title>
<div id="brandName">MK2MD</div><div id="appVersion">v10.78 · 2026-07-19</div>
<script>
document.documentElement.dataset.ciSelfTest='pass';
document.documentElement.dataset.ciSelfTestPassed='11';
document.documentElement.dataset.ciSelfTestFailed='0';
$BodyScript
</script>
"@
  return [uri]('data:text/html;charset=utf-8,' + [uri]::EscapeDataString($html))
}

function Invoke-RealChromeFixture([string]$BodyScript) {
  $tempRoot = [IO.Path]::GetTempPath()
  $chromeBefore = @(Get-ChromeFamilyProcessIds)
  $profilesBefore = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'mk2md-chrome-*' `
    -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  $result = Invoke-ChromeSelfTest -Url (New-RealChromeFixtureUrl $BodyScript) `
    -ExpectedVersion '10.78' -ExpectedDate '2026-07-19'
  $stopwatch.Stop()

  $chromeAfter = @(Get-ChromeFamilyProcessIds)
  $profilesAfter = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'mk2md-chrome-*' `
    -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  $newChrome = @($chromeAfter | Where-Object { $_ -notin $chromeBefore })
  $missingPreexistingChrome = @($chromeBefore | Where-Object { $_ -notin $chromeAfter })
  $newProfiles = @($profilesAfter | Where-Object { $_ -notin $profilesBefore })
  Assert-True ($newChrome.Count -eq 0) "real Chrome fixture leaked owned processes: $($newChrome -join ', ')"
  Assert-True ($missingPreexistingChrome.Count -eq 0) `
    "real Chrome fixture stopped pre-existing Chrome processes: $($missingPreexistingChrome -join ', ')"
  Assert-True ($newProfiles.Count -eq 0) "real Chrome fixture leaked owned profiles: $($newProfiles -join ', ')"
  Assert-True ($result.ChromeProfileUsed) 'real Chrome did not confirm use of its owned profile'
  Assert-True ((Split-Path -Leaf $result.ChromeProfilePath) -match '^mk2md-chrome-[0-9a-f]{32}$') `
    "real Chrome returned an unsafe profile path: $($result.ChromeProfilePath)"
  Assert-True (-not (Test-Path -LiteralPath $result.ChromeProfilePath)) `
    "real Chrome profile was not removed: $($result.ChromeProfilePath)"

  return [pscustomobject]@{ Result = $result; ElapsedMilliseconds = $stopwatch.ElapsedMilliseconds }
}

Test-Case 'real Chrome captures a page error delayed by 1500 milliseconds' {
  $fixture = Invoke-RealChromeFixture "setTimeout(() => { throw new Error('mk2md-delayed-page-error'); }, 1500);"
  Assert-True (@($fixture.Result.PageErrors | Where-Object { $_ -match 'mk2md-delayed-page-error' }).Count -gt 0) `
    "delayed page error was missed: $(@($fixture.Result.PageErrors) -join ' | ')"
  Assert-True ($fixture.Result.ObservationElapsedMilliseconds -ge 2000 -and `
    $fixture.Result.ObservationElapsedMilliseconds -le 5000) `
    "delayed Chrome observation escaped 2000-5000ms: $($fixture.Result.ObservationElapsedMilliseconds)ms"
  Assert-True ($fixture.ElapsedMilliseconds -lt 30000) `
    "delayed Chrome startup/observation/cleanup exceeded 30000ms: $($fixture.ElapsedMilliseconds)ms"
}

Test-Case 'clean real Chrome fixture stays error-free within the hard maximum' {
  $fixture = Invoke-RealChromeFixture ''
  Assert-True ($fixture.Result.ObservationElapsedMilliseconds -ge 2000 -and `
    $fixture.Result.ObservationElapsedMilliseconds -le 5000) `
    "clean Chrome observation escaped 2000-5000ms: $($fixture.Result.ObservationElapsedMilliseconds)ms"
  Assert-True ($fixture.ElapsedMilliseconds -lt 30000) `
    "clean Chrome startup/observation/cleanup exceeded 30000ms: $($fixture.ElapsedMilliseconds)ms"
  Assert-True (@($fixture.Result.ConsoleErrors).Count -eq 0) 'clean Chrome fixture reported console errors'
  Assert-True (@($fixture.Result.PageErrors).Count -eq 0) 'clean Chrome fixture reported page errors'
}

Test-Case 'real Chrome diagnostic resets the quiet window' {
  $fixture = Invoke-RealChromeFixture `
    "setTimeout(() => { console.warn('mk2md-quiet-window-reset'); }, 1900);"
  Assert-True (@($fixture.Result.Warnings | Where-Object { $_ -match 'mk2md-quiet-window-reset' }).Count -gt 0) `
    'quiet-window diagnostic was not captured'
  Assert-True ($fixture.Result.ObservationElapsedMilliseconds -ge 2300 -and `
    $fixture.Result.ObservationElapsedMilliseconds -le 5000) `
    "quiet window was not reset within the hard maximum: $($fixture.Result.ObservationElapsedMilliseconds)ms"
}

Test-Case 'continuous real Chrome diagnostics stop at the hard maximum and clean up' {
  $tempRoot = [IO.Path]::GetTempPath()
  $chromeBefore = @(Get-ChromeFamilyProcessIds)
  $profilesBefore = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'mk2md-chrome-*' `
    -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  $threw = $false
  $failureObservationMilliseconds = $null
  try {
    [void](Invoke-ChromeSelfTest `
      -Url (New-RealChromeFixtureUrl "setInterval(() => { console.warn('mk2md-continuous-diagnostic'); }, 100);") `
      -ExpectedVersion '10.78' -ExpectedDate '2026-07-19')
  } catch {
    $threw = $_.Exception.Message -match '5000ms|total deadline'
    $failureObservationMilliseconds = $_.Exception.Data['ObservationElapsedMilliseconds']
  } finally {
    $stopwatch.Stop()
  }
  $chromeAfter = @(Get-ChromeFamilyProcessIds)
  $profilesAfter = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'mk2md-chrome-*' `
    -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  Assert-True $threw 'continuous diagnostics did not fail at the observation hard maximum'
  Assert-True ($null -ne $failureObservationMilliseconds -and `
    [int64]$failureObservationMilliseconds -ge 5000 -and `
    [int64]$failureObservationMilliseconds -le 5500) `
    "continuous-diagnostic failure lacks bounded observation evidence: $failureObservationMilliseconds"
  Assert-True ($stopwatch.ElapsedMilliseconds -lt 30000) `
    "continuous-diagnostic Chrome lifecycle exceeded 30000ms: $($stopwatch.ElapsedMilliseconds)ms"
  Assert-True (@($chromeAfter | Where-Object { $_ -notin $chromeBefore }).Count -eq 0) `
    'continuous-diagnostic fixture leaked Chrome processes'
  Assert-True (@($chromeBefore | Where-Object { $_ -notin $chromeAfter }).Count -eq 0) `
    'continuous-diagnostic fixture stopped a pre-existing Chrome process'
  Assert-True (@($profilesAfter | Where-Object { $_ -notin $profilesBefore }).Count -eq 0) `
    'continuous-diagnostic fixture leaked owned profiles'
}

Test-Case 'browser result accepts the current clean baseline after bounded observation' {
  Assert-True ($source.Contains('$script:CdpMinimumObservationMilliseconds = 2000')) 'CDP minimum observation contract is missing'
  Assert-True ($source.Contains('$script:CdpQuietWindowMilliseconds = 500')) 'CDP quiet-window contract is missing'
  Assert-True ($source.Contains('$script:CdpMaximumObservationMilliseconds = 5000')) 'CDP hard maximum contract is missing'
  Assert-True (-not $source.Contains('$script:CdpSettleMilliseconds')) 'legacy CDP settle contract remains'
  Assert-True ($source.Contains('$observationDeadline')) 'CDP bounded observation loop is missing'
  Assert-True ($source.Contains('$lastDiagnosticEventAt')) 'CDP quiet-window tracking is missing'
  Assert-True ($source.Contains('-DeadlineUtc $observationDeadline')) 'CDP observation commands are not pinned to the hard maximum'
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

Test-Case 'browser result rejects an explicit failed self-test despite clean counters' {
  $bad = $goodBrowser.PSObject.Copy()
  $bad.SelfTest = 'fail'
  $bad.Detail = 'fixture explicitly failed'
  $threw = $false
  try { Assert-BrowserResult $bad '10.77' '2026-07-17' } catch {
    $threw = $_.Exception.Message -match 'self-test status' -and $_.Exception.Message -match 'fixture explicitly failed'
  }
  Assert-True $threw 'explicit self-test failure was accepted when counters looked clean'
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
    FetchUrl = 'https://github.com/green-tea-king/md-mind-map.git'
    PushUrl = 'https://github.com/green-tea-king/md-mind-map.git'
    Head = $testHead
    RemoteHead = if ($Relation -eq 'equal') { $testHead } else { $testRemote }
    Relation = $Relation
    Version = '10.77'
    Date = '2026-07-17'
    Commits = @('fixture commit')
    ChangedPaths = @('deploy.ps1')
    Untracked = @($script:ProtectedUntracked)
    ProtectedHashes = [ordered]@{ fixture = 'same' }
  }
}

function New-TestRepositoryState([object]$Context) {
  [pscustomobject]@{
    Branch = 'master'
    Head = $Context.Head
    OriginHead = $Context.Head
    RemoteHead = $Context.Head
    FetchUrl = $Context.FetchUrl
    PushUrl = $Context.PushUrl
    TrackedClean = $true
    StagedClean = $true
    Untracked = @($script:ProtectedUntracked)
    ProtectedHashes = [ordered]@{ fixture = 'same' }
  }
}

function New-PrePushFixture([Collections.IDictionary]$BeforeOverrides = @{}) {
  $initial = New-TestRepositoryContext 'local-ahead'
  $before = @{
    Branch = 'master'; Head = $initial.Head; LocalMasterHead = $initial.Head
    OriginHead = $initial.RemoteHead; RemoteHead = $initial.RemoteHead
    FetchUrl = $initial.FetchUrl; PushUrl = $initial.PushUrl
    WorkingDiffExit = 0; StagedDiffExit = 0
    Untracked = @($script:ProtectedUntracked); ProtectedHash = 'same'
  }
  foreach ($key in $BeforeOverrides.Keys) { $before[$key] = $BeforeOverrides[$key] }
  $after = @{
    Branch = 'master'; Head = $initial.Head; LocalMasterHead = $initial.Head
    OriginHead = $initial.Head; RemoteHead = $initial.Head
    FetchUrl = $initial.FetchUrl; PushUrl = $initial.PushUrl
    WorkingDiffExit = 0; StagedDiffExit = 0
    Untracked = @($script:ProtectedUntracked); ProtectedHash = 'same'
  }
  $calls = [Collections.Generic.List[string]]::new()
  $phase = @{ Value = 0 }
  $native = {
    param($filePath, $arguments, $repoPath, $allowedExitCodes, $timeoutSeconds)
    $arguments = @($arguments)
    $joined = $arguments -join ' '
    if ($filePath -eq 'git' -and $joined -eq 'push origin master') {
      [void]$calls.Add('git:push')
      return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = '' }
    }
    if ($filePath -eq 'git' -and $joined -eq 'branch --show-current') { $phase.Value++ }
    $state = if ($phase.Value -le 1) { $before } else { $after }
    $key = switch -Regex ("$filePath $joined") {
      '^git branch --show-current$' { 'git:branch'; break }
      '^git remote get-url --all origin$' { 'git:fetch-url'; break }
      '^git remote get-url --push --all origin$' { 'git:push-url'; break }
      '^git rev-parse HEAD$' { 'git:head'; break }
      '^git rev-parse refs/heads/master$' { 'git:local-master'; break }
      '^git rev-parse refs/remotes/origin/master$' { 'git:origin-master'; break }
      '^git ls-remote origin refs/heads/master$' { 'git:ls-remote'; break }
      '^git diff --quiet$' { 'git:working-diff'; break }
      '^git diff --cached --quiet$' { 'git:staged-diff'; break }
      '^git -c core\.quotepath=false status --porcelain=v1 -uall$' { 'git:status'; break }
      default { throw "Unexpected pre-push command: $filePath $joined" }
    }
    [void]$calls.Add("$($phase.Value):$key")
    $exitCode = 0
    $stdout = switch ($key) {
      'git:branch' { [string]$state.Branch; break }
      'git:fetch-url' { [string]$state.FetchUrl; break }
      'git:push-url' { [string]$state.PushUrl; break }
      'git:head' { [string]$state.Head; break }
      'git:local-master' { [string]$state.LocalMasterHead; break }
      'git:origin-master' { [string]$state.OriginHead; break }
      'git:ls-remote' { "$($state.RemoteHead)`trefs/heads/master"; break }
      'git:working-diff' { $exitCode = [int]$state.WorkingDiffExit; ''; break }
      'git:staged-diff' { $exitCode = [int]$state.StagedDiffExit; ''; break }
      'git:status' { @($state.Untracked | ForEach-Object { "?? $_" }) -join "`n"; break }
    }
    return [pscustomobject]@{ ExitCode = $exitCode; StdOut = $stdout; StdErr = '' }
  }.GetNewClosure()
  $snapshotProvider = {
    param($repoPath, $protectedPaths)
    [void]$calls.Add("$($phase.Value):snapshot")
    $state = if ($phase.Value -le 1) { $before } else { $after }
    return [ordered]@{ fixture = [string]$state.ProtectedHash }
  }.GetNewClosure()
  return [pscustomobject]@{
    Initial = $initial; Native = $native; SnapshotProvider = $snapshotProvider; Calls = $calls
  }
}

Test-Case 'exact push adapter reads and verifies the full state immediately around git push' {
  $fixture = New-PrePushFixture
  Invoke-ExactHeadPush -Initial $fixture.Initial -Repo 'fixture' -Native $fixture.Native `
    -SnapshotProvider $fixture.SnapshotProvider
  $calls = @($fixture.Calls)
  $pushIndex = $calls.IndexOf('git:push')
  Assert-True ($pushIndex -gt 0) 'production exact push adapter did not invoke git push'
  Assert-True ($calls[$pushIndex - 1] -eq '1:snapshot') `
    "full pre-push state was not the operation immediately before git push: $($calls -join '|')"
  Assert-True ($calls[$pushIndex + 1] -eq '2:git:branch') `
    "post-push state verification was not immediate: $($calls -join '|')"
  Assert-True ($calls -contains '2:git:fetch-url' -and $calls -contains '2:git:push-url' -and `
    $calls -contains '2:git:head' -and $calls -contains '2:git:origin-master' -and $calls -contains '2:git:ls-remote') `
    "post-push URL or SHA verification was incomplete: $($calls -join '|')"
}

Test-Case 'every pre-push repository race stops before git push' {
  Assert-True ([bool](Get-Command Invoke-ExactHeadPush -ErrorAction SilentlyContinue)) `
    'Invoke-ExactHeadPush is undefined'
  $mutations = @(
    @{ Name = 'branch'; Value = @{ Branch = 'feature' } },
    @{ Name = 'HEAD'; Value = @{ Head = 'c' * 40 } },
    @{ Name = 'local master'; Value = @{ LocalMasterHead = 'c' * 40 } },
    @{ Name = 'fetch URL'; Value = @{ FetchUrl = 'https://github.com/someone/else.git' } },
    @{ Name = 'push URL'; Value = @{ PushUrl = 'https://github.com/someone/else.git' } },
    @{ Name = 'tracked worktree'; Value = @{ WorkingDiffExit = 1 } },
    @{ Name = 'staged index'; Value = @{ StagedDiffExit = 1 } },
    @{ Name = 'untracked set'; Value = @{ Untracked = @($script:ProtectedUntracked + 'unexpected.txt') } },
    @{ Name = 'protected hash'; Value = @{ ProtectedHash = 'changed' } },
    @{ Name = 'remote SHA'; Value = @{ RemoteHead = 'c' * 40 } },
    @{ Name = 'origin master'; Value = @{ OriginHead = 'c' * 40 } }
  )
  foreach ($mutation in $mutations) {
    $fixture = New-PrePushFixture $mutation.Value
    $threw = $false
    try {
      Invoke-ExactHeadPush -Initial $fixture.Initial -Repo 'fixture' -Native $fixture.Native `
        -SnapshotProvider $fixture.SnapshotProvider
    } catch { $threw = $true }
    Assert-True $threw "pre-push $($mutation.Name) drift was accepted"
    Assert-True (-not ($fixture.Calls -contains 'git:push')) `
      "pre-push $($mutation.Name) drift reached git push: $($fixture.Calls -join '|')"
  }
}

function New-TestDeploymentAdapters(
  [Collections.Generic.List[string]]$Calls,
  [object]$Context,
  [object[]]$Runs,
  [object]$RunView,
  [byte[]]$LiveBytes,
  [object]$FinalState = $null
) {
  $localBytes = [Text.Encoding]::UTF8.GetBytes('fixture')
  $browserResult = $goodBrowser
  if ($null -eq $FinalState) { $FinalState = New-TestRepositoryState $Context }
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
      return $browserResult
    }.GetNewClosure()
    Push = { param($context) [void]$Calls.Add("push:$($context.Head)") }.GetNewClosure()
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
    GetRepositoryState = {
      [void]$Calls.Add('final-state')
      return $FinalState
    }.GetNewClosure()
    Sleep = { param($seconds) [void]$Calls.Add("sleep:$seconds") }.GetNewClosure()
  }
}

Test-Case 'exact HEAD run selection chooses newest push run' {
  $wrongRuns = @(1..20 | ForEach-Object {
    $wrong = $successfulRun.PSObject.Copy()
    $wrong.databaseId = $_
    $wrong.headSha = 'c' * 40
    $wrong.createdAt = "2026-07-18T$($_.ToString('00')):00:00Z"
    $wrong
  })
  $dispatch = $successfulRun.PSObject.Copy(); $dispatch.databaseId = 43; $dispatch.event = 'workflow_dispatch'; $dispatch.createdAt = '2026-07-19T03:00:00Z'
  $selected = Select-ExactHeadRun -Runs @($wrongRuns + @($dispatch, $successfulRun)) -Head $testHead
  Assert-True ($selected.databaseId -eq 42) 'newest exact push run was not selected'
}

Test-Case 'production Pages discovery is pinned to the original repository' {
  $nativeCalls = [Collections.Generic.List[object]]::new()
  $native = {
    param($filePath, $arguments, $timeoutSeconds)
    [void]$nativeCalls.Add([pscustomobject]@{ FilePath = $filePath; Arguments = @($arguments); TimeoutSeconds = $timeoutSeconds })
    return [pscustomobject]@{ ExitCode = 0; StdOut = '[]'; StdErr = '' }
  }.GetNewClosure()
  $oldGhRepo = $env:GH_REPO
  try {
    $env:GH_REPO = 'someone/else'
    $runs = @(Get-PagesWorkflowRuns -TimeoutSeconds 30 -Native $native)
    Assert-True ($runs.Count -eq 0) 'empty gh run list fixture was not parsed'
    Assert-True ($nativeCalls.Count -eq 1) 'gh run list native adapter was not called exactly once'
    $call = $nativeCalls[0]
    Assert-True ($call.FilePath -eq 'gh') 'Pages discovery did not call gh'
    Assert-True ($call.TimeoutSeconds -eq 30) 'Pages discovery did not forward the remaining timeout'
    $joined = $call.Arguments -join ' '
    Assert-True ($joined -match '^run list --workflow pages\.yml --branch master --limit 100 --json .+ --repo green-tea-king/md-mind-map$') `
      "Pages discovery was not pinned to the original repository: $joined"
  } finally {
    $env:GH_REPO = $oldGhRepo
  }
}

Test-Case 'production Pages watch and view are pinned to the original repository' {
  $nativeCalls = [Collections.Generic.List[object]]::new()
  $runFixture = $successfulRun
  $native = {
    param($filePath, $arguments, $timeoutSeconds)
    [void]$nativeCalls.Add([pscustomobject]@{ FilePath = $filePath; Arguments = @($arguments); TimeoutSeconds = $timeoutSeconds })
    $stdout = if (@($arguments) -contains 'view') { $runFixture | ConvertTo-Json -Compress -Depth 6 } else { '' }
    return [pscustomobject]@{ ExitCode = 0; StdOut = $stdout; StdErr = '' }
  }.GetNewClosure()
  $oldGhRepo = $env:GH_REPO
  try {
    $env:GH_REPO = 'someone/else'
    Watch-PagesWorkflowRun -RunId 42 -TimeoutSeconds 30 -Native $native
    $view = Get-PagesWorkflowRun -RunId 42 -TimeoutSeconds 30 -Native $native
    Assert-True ($view.databaseId -eq 42) 'Pages view fixture was not parsed'
  } finally {
    $env:GH_REPO = $oldGhRepo
  }
  Assert-True ($nativeCalls.Count -eq 2) 'Pages watch/view native adapters were not called exactly once each'
  Assert-True (($nativeCalls[0].Arguments -join ' ') -eq 'run watch 42 --exit-status --repo green-tea-king/md-mind-map') `
    "Pages watch was not pinned to the original repository: $($nativeCalls[0].Arguments -join ' ')"
  Assert-True (($nativeCalls[1].Arguments -join ' ') -match '^run view 42 --repo green-tea-king/md-mind-map --json ') `
    "Pages view was not pinned to the original repository: $($nativeCalls[1].Arguments -join ' ')"
}

Test-Case 'successful Pages run rejects the wrong HEAD SHA' {
  $wrong = $successfulRun.PSObject.Copy(); $wrong.headSha = 'c' * 40
  $threw = $false
  try { Assert-SuccessfulPagesRun -Run $wrong -Head $testHead -RunId 42 } catch { $threw = $_.Exception.Message -match 'HEAD' }
  Assert-True $threw 'wrong run SHA was accepted'
}

Test-Case 'successful Pages run requires the canonical repository URL and exact numeric id' {
  foreach ($case in @(
    @{ Url = 'https://github.com/someone/else/actions/runs/42'; DatabaseId = 42 },
    @{ Url = 'https://github.com/green-tea-king/md-mind-map/actions/runs/43'; DatabaseId = 42 },
    @{ Url = 'https://github.com/green-tea-king/md-mind-map/actions/runs/42'; DatabaseId = 43 }
  )) {
    $bad = $successfulRun.PSObject.Copy()
    $bad.url = $case.Url
    $bad.databaseId = $case.DatabaseId
    $threw = $false
    try { Assert-SuccessfulPagesRun -Run $bad -Head $testHead -RunId 42 } catch {
      $threw = $_.Exception.Message -match 'URL|run id|database id|canonical'
    }
    Assert-True $threw "Pages run URL/id mismatch was accepted: $($case.Url) / $($case.DatabaseId)"
  }
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
    $threw = $false; try { Assert-SuccessfulPagesRun -Run $bad -Head $testHead -RunId 42 } catch { $threw = $true }
    Assert-True $threw "run state $($state.status)/$($state.conclusion) was accepted"
  }
  $badJob = $successfulRun.PSObject.Copy()
  $badJob.jobs = @(
    [pscustomobject]@{ name = 'build'; status = 'completed'; conclusion = 'success' },
    [pscustomobject]@{ name = 'deploy'; status = 'completed'; conclusion = 'failure' }
  )
  $threw = $false; try { Assert-SuccessfulPagesRun -Run $badJob -Head $testHead -RunId 42 } catch { $threw = $true }
  Assert-True $threw 'failed deploy job was accepted'
}

Test-Case 'missing exact HEAD run retries within a bounded timeout' {
  $calls = [Collections.Generic.List[string]]::new()
  $adapters = @{
    RunList = { param($timeoutSeconds) [void]$calls.Add("list:$timeoutSeconds"); return @() }.GetNewClosure()
    WatchRun = { param($id, $timeoutSeconds) [void]$calls.Add("watch:$id") }.GetNewClosure()
    RunView = { param($id, $timeoutSeconds) throw 'RunView must not run without an exact match' }
    Sleep = { param($seconds) [void]$calls.Add("sleep:$seconds") }.GetNewClosure()
  }
  $threw = $false
  try { Wait-ExactHeadRun -Head $testHead -Adapters $adapters -TimeoutSeconds 0 } catch {
    $threw = $_.Exception.Message -match 'Timed out' -and $_.Exception.Message -match $testHead
  }
  Assert-True $threw 'missing exact HEAD run did not report a bounded timeout with the HEAD'
  Assert-True ($calls.Count -eq 0) "zero-bound lookup called an adapter: $($calls -join '|')"
}

Test-Case 'remaining whole seconds never creates an artificial extra second' {
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds(10.9)
  $remaining = Get-RemainingWholeSeconds -Deadline $deadline -Operation 'fixture'
  Assert-True ($remaining -gt 0 -and $remaining -le 10) "remaining whole seconds rounded up: $remaining"
  $threw = $false
  try { Get-RemainingWholeSeconds -Deadline ([DateTimeOffset]::UtcNow) -Operation 'expired fixture' } catch {
    $threw = $_.Exception.Message -match 'expired fixture' -and $_.Exception.Message -match 'Timed out'
  }
  Assert-True $threw 'expired deadline did not throw with the operation name'
}

Test-Case 'Actions result returning after the total deadline is rejected' {
  $calls = [Collections.Generic.List[string]]::new()
  $adapters = @{
    RunList = {
      param($timeoutSeconds)
      [void]$calls.Add('run-list')
      Start-Sleep -Milliseconds 2100
      return @($successfulRun)
    }.GetNewClosure()
    WatchRun = { param($id, $timeoutSeconds) [void]$calls.Add('watch') }.GetNewClosure()
    RunView = { param($id, $timeoutSeconds) [void]$calls.Add('view'); return $successfulRun }.GetNewClosure()
    Sleep = { param($seconds) [void]$calls.Add('sleep') }.GetNewClosure()
  }
  $threw = $false
  try { Wait-ExactHeadRun -Head $testHead -Adapters $adapters -TimeoutSeconds 2 } catch {
    $threw = $_.Exception.Message -match 'Timed out'
  }
  Assert-True $threw 'late Actions list result was accepted'
  Assert-True (($calls -join '|') -eq 'run-list') "an adapter ran after the Actions deadline: $($calls -join '|')"
}

Test-Case 'Actions watch view and retry sleep returning after the deadline are rejected' {
  foreach ($lateAdapter in @('watch', 'view', 'sleep')) {
    $calls = [Collections.Generic.List[string]]::new()
    $scenarioName = $lateAdapter
    $runFixture = $successfulRun
    $adapters = @{
      RunList = {
        param($timeoutSeconds)
        [void]$calls.Add('run-list')
        if ($scenarioName -eq 'sleep') { return @() }
        return @($runFixture)
      }.GetNewClosure()
      WatchRun = {
        param($id, $timeoutSeconds)
        [void]$calls.Add('watch')
        if ($scenarioName -eq 'watch') { Start-Sleep -Milliseconds 2100 }
      }.GetNewClosure()
      RunView = {
        param($id, $timeoutSeconds)
        [void]$calls.Add('view')
        if ($scenarioName -eq 'view') { Start-Sleep -Milliseconds 2100 }
        return $runFixture
      }.GetNewClosure()
      Sleep = {
        param($seconds)
        [void]$calls.Add('sleep')
        if ($scenarioName -eq 'sleep') { Start-Sleep -Milliseconds 2100 }
      }.GetNewClosure()
    }
    $threw = $false
    try { Wait-ExactHeadRun -Head $testHead -Adapters $adapters -TimeoutSeconds 2 } catch {
      $threw = $_.Exception.Message -match 'Timed out'
    }
    Assert-True $threw "late Actions $lateAdapter result was accepted"
    $lateIndex = $calls.IndexOf($lateAdapter)
    Assert-True ($lateIndex -eq ($calls.Count - 1)) `
      "an adapter ran after late Actions $lateAdapter`: $($calls -join '|')"
  }
}

Test-Case 'live source exact SHA-256 match succeeds in memory' {
  $bytes = [Text.Encoding]::UTF8.GetBytes('fixture')
  $result = Wait-LiveSourceMatch -LiveUrl 'https://example.invalid/' -LocalBytes $bytes -Adapters @{
    LiveSource = { param($url) return $bytes }.GetNewClosure()
    Sleep = { param($seconds) throw 'matching source should not sleep' }
  } -TimeoutSeconds 300
  Assert-True ($result.Match -and $result.Hash -eq [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))) 'matching live source was rejected'
}

Test-Case 'live source transport rejects a nonpositive timeout without adding one second' {
  $threw = $false
  try { [void](Get-LiveSourceBytes -Url 'https://example.invalid/' -TimeoutSeconds 0) } catch {
    $threw = $_.Exception.Message -match 'positive timeout'
  }
  Assert-True $threw 'live source transport accepted or artificially extended a zero timeout'
}

Test-Case 'live source SHA-256 mismatch stops at the bound' {
  $calls = [Collections.Generic.List[string]]::new()
  $threw = $false
  try {
    Wait-LiveSourceMatch -LiveUrl 'https://example.invalid/' `
      -LocalBytes ([Text.Encoding]::UTF8.GetBytes('local')) -Adapters @{
        LiveSource = { param($url) [void]$calls.Add('live-source'); [Text.Encoding]::UTF8.GetBytes('remote') }.GetNewClosure()
        Sleep = { param($seconds) [void]$calls.Add('sleep') }.GetNewClosure()
      } -TimeoutSeconds 0
  } catch { $threw = $_.Exception.Message -match 'SHA-256' }
  Assert-True $threw 'live mismatch did not fail at the bound'
  Assert-True ($calls.Count -eq 0) "zero-bound live match called an adapter: $($calls -join '|')"
}

Test-Case 'matching live source returning after the total deadline is rejected' {
  $bytes = [Text.Encoding]::UTF8.GetBytes('fixture')
  $calls = [Collections.Generic.List[string]]::new()
  $threw = $false
  try {
    Wait-LiveSourceMatch -LiveUrl 'https://example.invalid/' -LocalBytes $bytes -Adapters @{
      LiveSource = {
        param($url, $timeoutSeconds)
        [void]$calls.Add('live-source')
        Start-Sleep -Milliseconds 2100
        return $bytes
      }.GetNewClosure()
      Sleep = { param($seconds) [void]$calls.Add('sleep') }.GetNewClosure()
    } -TimeoutSeconds 2
  } catch { $threw = $_.Exception.Message -match 'SHA-256' -and $_.Exception.Message -match 'Timed out' }
  Assert-True $threw 'late matching live source was accepted'
  Assert-True (($calls -join '|') -eq 'live-source') "an adapter ran after the live deadline: $($calls -join '|')"
}

Test-Case 'dry run performs local gates without push Actions or live verification' {
  $calls = [Collections.Generic.List[string]]::new()
  $context = New-TestRepositoryContext 'local-ahead'
  $adapters = New-TestDeploymentAdapters $calls $context @($successfulRun) $successfulRun ([Text.Encoding]::UTF8.GetBytes('fixture'))
  $result = Invoke-Mk2mdDeployment -IsDryRun -ConfirmedHead '' -Adapters $adapters
  Assert-True $result.DryRun 'dry-run report was not returned'
  Assert-True ($calls -contains 'local-start' -and $calls -contains 'local-stop') 'dry run skipped or leaked the local server gate'
  Assert-True (@($calls | Where-Object { $_ -like 'browser:http://127.0.0.1:*' }).Count -eq 1) 'dry run skipped local browser gate'
  Assert-True (@($calls | Where-Object { $_ -like 'push:*' -or $_ -like 'watch:*' -or $_ -like 'live-source:*' -or $_ -like 'browser:https://*' -or $_ -eq 'final-state' }).Count -eq 0) 'dry run performed an external deployment action'
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
  $liveBrowserCall = @($calls | Where-Object { $_ -like 'browser:https://*' })[0]
  Assert-True ($calls.IndexOf('final-state') -gt $calls.IndexOf($liveBrowserCall)) `
    "final repository state was not observed after live browser success: $($calls -join '|')"
}

Test-Case 'local ahead pushes only the confirmed exact HEAD' {
  $calls = [Collections.Generic.List[string]]::new()
  $context = New-TestRepositoryContext 'local-ahead'
  $adapters = New-TestDeploymentAdapters $calls $context @($successfulRun) $successfulRun ([Text.Encoding]::UTF8.GetBytes('fixture'))
  $result = Invoke-Mk2mdDeployment -ConfirmedHead $testHead -Adapters $adapters
  Assert-True $result.Pushed 'local-ahead relation did not report a push'
  Assert-True (@($calls | Where-Object { $_ -eq "push:$testHead" }).Count -eq 1) 'local-ahead did not push the exact confirmed HEAD once'
  Assert-True ($calls -contains 'final-state') 'local-ahead path skipped the final repository state gate'
}

Test-Case 'equal and local-ahead paths reject every final repository state drift' {
  $mutations = @(
    @{ Name = 'branch'; Apply = { param($state) $state.Branch = 'feature' } },
    @{ Name = 'HEAD'; Apply = { param($state) $state.Head = 'c' * 40 } },
    @{ Name = 'origin/master'; Apply = { param($state) $state.OriginHead = 'c' * 40 } },
    @{ Name = 'remote HEAD'; Apply = { param($state) $state.RemoteHead = 'b' * 40 } },
    @{ Name = 'fetch URL'; Apply = { param($state) $state.FetchUrl = 'https://github.com/someone/else.git' } },
    @{ Name = 'push URL'; Apply = { param($state) $state.PushUrl = 'https://github.com/someone/else.git' } },
    @{ Name = 'tracked worktree'; Apply = { param($state) $state.TrackedClean = $false } },
    @{ Name = 'staged index'; Apply = { param($state) $state.StagedClean = $false } },
    @{ Name = 'untracked set'; Apply = { param($state) $state.Untracked = @($script:ProtectedUntracked + 'unexpected.txt') } },
    @{ Name = 'protected hashes'; Apply = { param($state) $state.ProtectedHashes = [ordered]@{ fixture = 'drifted' } } }
  )
  foreach ($relation in @('equal', 'local-ahead')) {
    foreach ($mutation in $mutations) {
      $calls = [Collections.Generic.List[string]]::new()
      $context = New-TestRepositoryContext $relation
      $state = New-TestRepositoryState $context
      & $mutation.Apply $state
      $adapters = New-TestDeploymentAdapters $calls $context @($successfulRun) $successfulRun `
        ([Text.Encoding]::UTF8.GetBytes('fixture')) $state
      $threw = $false
      try { [void](Invoke-Mk2mdDeployment -ConfirmedHead $testHead -Adapters $adapters 6>$null) } catch { $threw = $true }
      Assert-True $threw "$relation accepted final $($mutation.Name) drift"
      $liveBrowserCall = @($calls | Where-Object { $_ -like 'browser:https://*' })[0]
      Assert-True ($calls.IndexOf('final-state') -gt $calls.IndexOf($liveBrowserCall)) `
        "$relation checked final $($mutation.Name) before live browser"
    }
  }
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
