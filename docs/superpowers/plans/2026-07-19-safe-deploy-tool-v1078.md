# MK2MD v10.78 Safe Deployment Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unsafe local-only deploy helper with a tracked, dependency-free, fail-closed v10.78 deployment tool that verifies the exact release HEAD locally, in GitHub Actions, and on the original GitHub Pages site.

**Architecture:** Keep `deploy.ps1` at the repository root as the only deployment entry point and make its decisions testable by dot-sourcing dependency-free functions. `scripts/test-deploy.ps1` exercises pure policy and adapter behavior without touching GitHub; the real script uses checked native processes, installed Chrome plus loopback CDP, exact-HEAD Actions selection, and live-source hash equality.

**Tech Stack:** PowerShell 7, .NET `Process`/`ClientWebSocket`/`HttpClient`, Git, GitHub CLI, Node.js, Python HTTP server, installed Google Chrome, GitHub Actions, single-file HTML.

## Global Constraints

- Work only in `W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD`; do not create a project, move files, change platform, branch, repository, site, or worktree.
- Target release is `v10.78` dated `2026-07-19`; current remote release base is `3850b36ccd2918bbdaff8de1b546254fa253cd54` (`v10.77`).
- Preserve the original deployment target: repository `green-tea-king/md-mind-map`, branch `master`, URL `https://green-tea-king.github.io/md-mind-map/`.
- Never delete files, data, Git history, Actions runs, Pages resources, browser profiles, or deployment resources.
- Never run `git add .`, force push, automatic merge/rebase/rollback, or credential-mutating `gh auth setup-git`.
- `deploy.ps1` must never stage or commit; it only deploys an already committed exact HEAD.
- Do not add npm, Playwright, Pester, or other third-party dependencies.
- Pages artifact remains exactly `index.html` plus `.nojekyll`; do not publish maintenance files.
- Before Task 1, preserve all seven current untracked hashes. After `deploy.ps1` is intentionally tracked, preserve the remaining six paths and hashes:

```text
7C017FCE631B948ECD402FC8616C6F37E0B7EF79AEF11A4022ED24B644B3EB03  BACKUP_MANIFEST.md
EF01E21DCB43D5999F4FC2CFFB023E36BF84F8EEC49A5682340E60B3CBA92173  MD心智圖_v10_00.html
4C696CE09351809F3640164E161C7E4BF621AB652EBE56B6D2A15F2FEB46FFE8  agent.md
61D5FB45AB927543806F4D1756FB3EEA5EBC7EE54DDB324BCEFE0312A181A7CE  clear-auto-draft.html
9BDF6A9A4DA7946466BF2229C6FE11D91A7EF0B056C97BBC55395DA5AB433B64  design.md
D13703A7940F86235E4FDE2094BED50F649B578984B154C1E3F73E7C0C025385  repository-history.bundle
```

- Run tests before implementation changes in each code task and record the exact RED, then rerun the same test for GREEN.
- Stage every commit with an explicit path allowlist and run `git diff --cached --check` plus `git diff --cached --name-only`.
- Do not push until Task 5 explicitly authorizes deployment after all local gates and reviews pass.

---

### Task 1: Build the fail-closed deployment policy core

**Files:**
- Modify and track: `deploy.ps1`
- Create: `scripts/test-deploy.ps1`
- Preserve: all other tracked and untracked files

**Interfaces:**
- Consumes: the existing root script path and current Git repository.
- Produces:
  - `Invoke-CheckedNative -FilePath <string> -Arguments <string[]> -WorkingDirectory <string> -TimeoutSeconds <int>` returning `{ ExitCode, StdOut, StdErr }` or throwing on non-zero/timeout.
  - `Assert-ExactUntrackedSet -Actual <string[]> -Expected <string[]>`.
  - `Get-ProtectedSnapshot -Repo <string> -Paths <string[]>` returning an ordered path/hash map.
  - `Assert-ProtectedSnapshot -Before <map> -After <map>`.
  - `Resolve-RemoteRelation -LocalHead <sha> -RemoteHead <sha> -RemoteIsAncestor <bool> -LocalIsAncestor <bool>` returning `equal`, `local-ahead`, `remote-ahead`, or `diverged`.
  - `Assert-ExpectedHead -Actual <sha> -Expected <string> -DryRun <bool>`.
  - A main guard: dot-sourcing loads functions and never executes deployment.

- [ ] **Step 1: Record the protected baseline and exact Git state**

Run from the repository:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/master
Get-FileHash -Algorithm SHA256 -LiteralPath @(
  'BACKUP_MANIFEST.md',
  'MD心智圖_v10_00.html',
  'agent.md',
  'clear-auto-draft.html',
  'deploy.ps1',
  'design.md',
  'repository-history.bundle'
)
```

Expected: local HEAD is the approved design/plan chain, `origin/master` remains `3850b36...`, only the seven known untracked files appear, and all seven hashes match the recorded baseline. Stop on any drift.

- [ ] **Step 2: Write the first dependency-free RED contracts**

Create `scripts/test-deploy.ps1` with a tiny assertion runner and source checks that are safe against the old script:

```powershell
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

if ($script:failed -gt 0) {
  throw "Deployment contract tests failed: $script:failed failed, $script:passed passed."
}
Write-Host "Deployment contract tests passed: $script:passed/$($script:passed)."
```

- [ ] **Step 3: Run the RED test against the old script**

Run:

```powershell
pwsh -NoProfile -File scripts/test-deploy.ps1
```

Expected: non-zero exit; the old `git add`, `git commit`, missing `DryRun`, and missing `ExpectedHead` contracts fail. Do not dot-source the old script because it would execute its current deployment body.

- [ ] **Step 4: Replace the unsafe entry structure with checked, testable policy functions**

Rewrite the root script around this exact entry contract:

```powershell
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
```

Add these exact untracked-set and SHA snapshot functions. They only read paths and hashes:

```powershell
function Assert-ExactUntrackedSet {
  param([string[]]$Actual, [string[]]$Expected)
  $actualSorted = @($Actual | ForEach-Object { $_.Replace('\','/') } | Sort-Object)
  $expectedSorted = @($Expected | ForEach-Object { $_.Replace('\','/') } | Sort-Object)
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
```

- [ ] **Step 5: Expand the GREEN policy tests to 12 cases**

After the source checks, dot-source the rewritten script and add direct cases for checked-native non-zero behavior, all four remote relations, exact/unexpected untracked paths, snapshot drift, expected-head mismatch, and dot-source safety. Use a guaranteed failing native process without repository writes:

```powershell
. $deployPath

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
```

Expected final line: `Deployment contract tests passed: 12/12.`

- [ ] **Step 6: Run Task 1 verification**

Run:

```powershell
pwsh -NoProfile -File scripts/test-deploy.ps1
$tokens = $null; $errors = $null
[void][Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'deploy.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors.Message -join "`n") }
git diff --check -- deploy.ps1 scripts/test-deploy.ps1
git status --short --branch
```

Expected: 12/12, zero parser errors, no whitespace errors, `deploy.ps1` and its test are the only Task 1 tracked changes, and the six remaining untracked hashes match.

- [ ] **Step 7: Commit Task 1 with an explicit allowlist**

```powershell
git add -- deploy.ps1 scripts/test-deploy.ps1
git diff --cached --check
git diff --cached --name-only
git commit -m "Add fail-closed deployment core"
```

Expected staged files: exactly `deploy.ps1` and `scripts/test-deploy.ps1`. Do not push.

---

### Task 2: Add installed-Chrome CDP and local HTTP gates

**Files:**
- Modify: `deploy.ps1`
- Modify: `scripts/test-deploy.ps1`

**Interfaces:**
- Consumes: Task 1 policy functions and checked native wrapper.
- Produces:
  - `Get-FreeLoopbackPort`.
  - `Start-LocalSiteServer` returning exact process, port, and URL.
  - `Stop-OwnedProcess -Process <Process> -Label <string>`.
  - `Invoke-CdpCommand`/`Receive-CdpMessage` using `ClientWebSocket`.
  - `Invoke-ChromeSelfTest -Url <uri> -ExpectedVersion <string> -ExpectedDate <date>` returning `{ Title, Brand, VersionText, Passed, Failed, ConsoleErrors, PageErrors, Warnings }`.
  - `Assert-BrowserResult` enforcing MK2MD title/brand, 11/11, zero errors, and warnings `<= 6`.

- [ ] **Step 1: Add RED browser-result fixtures**

Add six tests before browser implementation:

```powershell
$goodBrowser = [pscustomobject]@{
  Title = 'MK2MD v10.77'; Brand = 'MK2MD'; VersionText = 'v10.77 · 2026-07-17'
  Passed = 11; Failed = 0; ConsoleErrors = @(); PageErrors = @(); Warnings = @(1,2,3,4,5,6)
}

Test-Case 'browser result accepts the current clean baseline' {
  Assert-BrowserResult -Result $goodBrowser -Version '10.77' -Date '2026-07-17'
}
Test-Case 'browser result rejects a console error' {
  $bad = $goodBrowser.PSObject.Copy(); $bad.ConsoleErrors = @('boom')
  $threw = $false; try { Assert-BrowserResult $bad '10.77' '2026-07-17' } catch { $threw = $true }
  Assert-True $threw 'console error was accepted'
}
```

Add four more rejecting cases: page error; self-test not 11/11 or failed nonzero in one combined case; warning count 7; and wrong title/version/date in one identity case. Together with the clean baseline and console-error case, Task 2 adds exactly six cases.

- [ ] **Step 2: Run RED**

Run `pwsh -NoProfile -File scripts/test-deploy.ps1`.

Expected: the six new cases fail because `Assert-BrowserResult` is undefined.

- [ ] **Step 3: Implement Chrome CDP without repository artifacts**

Use a free loopback port, `.NET Process` with `chrome.exe --headless=new --remote-debugging-port=<port>`, and `HttpClient` polling of `/json/version`. Create a page target through `/json/new?<encoded-url>`, then use `ClientWebSocket` to enable `Runtime`, `Log`, and `Page` domains.

The DOM evaluation expression must return JSON with exact fields:

```javascript
JSON.stringify({
  title: document.title,
  brand: document.querySelector('#brandName')?.textContent?.trim() || '',
  versionText: document.querySelector('#appVersion')?.textContent?.trim() || '',
  selfTest: document.documentElement.dataset.ciSelfTest || '',
  passed: Number(document.documentElement.dataset.ciSelfTestPassed || 0),
  failed: Number(document.documentElement.dataset.ciSelfTestFailed || 0),
  detail: document.documentElement.dataset.ciSelfTestDetail || ''
})
```

Collect `Runtime.consoleAPICalled` events by `params.type`; store `error` separately and count `warning`. Collect `Runtime.exceptionThrown` as page errors. Do not create a browser profile, `.playwright-cli`, log file, or repository temp file.

- [ ] **Step 4: Implement owned local server lifecycle**

Start `python -m http.server <free-port> --bind 127.0.0.1` through `.NET Process`, save the exact process object, and poll `http://127.0.0.1:<port>/index.html` until HTTP 200. In `finally`, kill only that process tree if still running, wait for exit, and confirm the chosen port no longer has a listener. Killing a process is allowed; do not delete files.

- [ ] **Step 5: Run GREEN unit and real local browser verification**

Run:

```powershell
pwsh -NoProfile -File scripts/test-deploy.ps1
. .\deploy.ps1
$server = Start-LocalSiteServer -Repo (Resolve-Path '.')
try {
  $result = Invoke-ChromeSelfTest -Url ($server.Url + '?ci-selftest=1') -ExpectedVersion '10.77' -ExpectedDate '2026-07-17'
  Assert-BrowserResult -Result $result -Version '10.77' -Date '2026-07-17'
  $result | ConvertTo-Json -Depth 5
} finally {
  Stop-OwnedProcess -Process $server.Process -Label 'local HTTP server'
}
```

Expected: deployment tests `18/18`; title `MK2MD v10.77`, brand `MK2MD`, 11/11, failed 0, console/page errors 0, warnings 6; Chrome/server processes and listener zero; repository contains no `.playwright-cli` or browser artifact.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- deploy.ps1 scripts/test-deploy.ps1
git diff --cached --check
git diff --cached --name-only
git commit -m "Add Chrome deployment preflight"
```

Expected: exactly two staged files; no push.

---

### Task 3: Add exact-HEAD Git, Actions, live-source, and orchestration gates

**Files:**
- Modify: `deploy.ps1`
- Modify: `scripts/test-deploy.ps1`

**Interfaces:**
- Consumes: Task 1 policy core and Task 2 browser gate.
- Produces:
  - `Get-RepositoryContext` with branch/origin/head/status/untracked/version/date.
  - `Select-ExactHeadRun -Runs <objects> -Head <sha>`.
  - `Assert-SuccessfulPagesRun -Run <object> -Head <sha>`.
  - `Wait-ExactHeadRun` with a 10-minute bound.
  - `Wait-LiveSourceMatch` with a 5-minute bound and in-memory SHA-256 equality.
  - `Invoke-Mk2mdDeployment` complete dry-run/equal/local-ahead orchestration.

- [ ] **Step 1: Add RED Git/Actions/live fixtures**

Add ten cases for exact run selection, wrong SHA rejection, incomplete/failed/cancelled jobs, source hash match/mismatch, dry-run call log, remote equal verification-only, local-ahead push, remote-ahead stop, and diverged stop.

Use injected adapters with a call log:

```powershell
$calls = [Collections.Generic.List[string]]::new()
$fake = @{
  Push = { param($head) $calls.Add("push:$head") }
  WatchRun = { param($id) $calls.Add("watch:$id") }
  LiveSource = { param($url) [Text.Encoding]::UTF8.GetBytes('fixture') }
  Browser = { param($url,$version,$date) $goodBrowser }
  Sleep = { param($seconds) $calls.Add("sleep:$seconds") }
}
```

Dry-run must leave `$calls` without `push:`, `watch:`, or live-success entries.

- [ ] **Step 2: Run RED**

Run `pwsh -NoProfile -File scripts/test-deploy.ps1`.

Expected: the new exact-run/live/orchestration contracts fail before implementation.

- [ ] **Step 3: Implement repository preflight and remote relation**

Require:

- branch exactly `master`.
- parsed origin slug exactly `green-tea-king/md-mind-map` for HTTPS or SSH syntax.
- `git diff --quiet` and `git diff --cached --quiet` both clean.
- exact six untracked paths only.
- `gh auth status`, push permission true, and remote master reachable without `gh auth setup-git`.
- local/remote relation resolved from exact SHA plus ancestor checks.
- full local-only commit and changed-path display before any push.

If remote is ahead/diverged, throw before browser deployment or push. If equal, skip push but continue exact-run/live verification. If local-ahead, require exact `ExpectedHead` before `git push origin master`.

- [ ] **Step 4: Implement exact Actions selection and bounded waits**

Parse `gh run list --workflow pages.yml --branch master --json databaseId,headSha,status,conclusion,url,createdAt,updatedAt,event`. Filter to complete local HEAD plus `event == 'push'`, sort by `createdAt` descending, and select the newest matching run. Wait with the checked native wrapper using `gh run watch <id> --exit-status` and `-TimeoutSeconds 600`, then query jobs and require run/build/deploy all `completed/success`.

Timeout must throw with HEAD and last observed run state. Never dispatch, rerun, cancel, delete, or guess a run id.

- [ ] **Step 5: Implement live source and final browser equality**

Build:

```powershell
$liveUrl = "https://green-tea-king.github.io/md-mind-map/?ci-selftest=1&t=$head"
```

Fetch source bytes in memory through `HttpClient`; compare `SHA256.HashData(liveBytes)` to `SHA256.HashData([IO.File]::ReadAllBytes(indexPath))`. Retry mismatch/HTTP-not-ready for at most five minutes. After equality, run the Task 2 Chrome gate against the same cache-busted URL.

- [ ] **Step 6: Complete `-DryRun` behavior and report object**

Dry-run executes repository/version/syntax/protected/browser gates and prints relation, commits, paths, SHA, version/date, and browser JSON. It must stop before push, Actions watch, and live success reporting.

Actual mode returns a final object containing:

```powershell
[pscustomobject]@{
  Version = $version
  Date = $date
  Head = $head
  Relation = $relation
  Pushed = $pushed
  ActionsId = $run.databaseId
  ActionsUrl = $run.url
  LiveUrl = $liveUrl
  LocalBrowser = $localBrowser
  LiveBrowser = $liveBrowser
  ProtectedHashes = $afterSnapshot
  CompletedAt = [DateTimeOffset]::Now
}
```

- [ ] **Step 7: Run GREEN and prove dry-run has no external writes**

Run:

```powershell
$beforeHead = (git rev-parse HEAD).Trim()
$beforeRemote = ((git ls-remote origin refs/heads/master) -split '\s+')[0]
pwsh -NoProfile -File scripts/test-deploy.ps1
.\deploy.ps1 -DryRun
$afterHead = (git rev-parse HEAD).Trim()
$afterRemote = ((git ls-remote origin refs/heads/master) -split '\s+')[0]
if ($beforeHead -ne $afterHead -or $beforeRemote -ne $afterRemote) { throw 'DryRun changed Git state' }
```

Expected: `33/33`; dry-run local Chrome 11/11/errors 0/warnings 6; no push, new Actions run, commit, staged file, browser session, listener, or protected hash change.

- [ ] **Step 8: Commit Task 3**

```powershell
git add -- deploy.ps1 scripts/test-deploy.ps1
git diff --cached --check
git diff --cached --name-only
git commit -m "Add exact HEAD deployment verification"
```

Expected: exactly two staged files; no push.

---

### Task 4: Integrate the new CLI, CI contract, and v10.78 release metadata

**Files:**
- Modify: `scripts/check-version-consistency.js`
- Modify: `scripts/check-version-consistency.test.js`
- Modify: `.github/workflows/pages.yml`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `index.html`
- Test: `scripts/check-version-consistency.test.js`
- Test: `scripts/test-deploy.ps1`

**Interfaces:**
- Consumes: completed tracked deployment tool and its 33/33 contract suite.
- Produces: v10.78/2026-07-19 repository sources, new README deploy block, version checker support for the block, and Pages CI execution of the deployment contract.

- [ ] **Step 1: Add RED version-checker cases for the new README CLI**

Update the in-memory README fixture to:

```text
$head = (git rev-parse HEAD).Trim()
# Deploy v10.76
.\deploy.ps1 -ExpectedHead $head
```

Add two tests:

```javascript
test('reports a README deploy comment version mismatch', () => {
  const sources = makeSources();
  sources.readmeText = sources.readmeText.replace('# Deploy v10.76', '# Deploy v10.75');
  const result = validateVersionConsistency(sources);
  assert.equal(issueFor(result, 'README deploy example').actual, '10.75');
});

test('rejects the legacy deploy Message command structure', () => {
  const sources = makeSources();
  sources.readmeText = sources.readmeText.replace(
    '.\\deploy.ps1 -ExpectedHead $head',
    '.\\deploy.ps1 -Message "Deploy v10.76"'
  );
  const result = validateVersionConsistency(sources);
  assert.match(issueFor(result, 'README deploy command').actual, /0 matches/);
});
```

- [ ] **Step 2: Run checker RED**

Run `node scripts/check-version-consistency.test.js`.

Expected: the new cases fail because the checker still parses the legacy `-Message` command.

- [ ] **Step 3: Update checker structure and preserve error ordering**

Replace the legacy capture with two exact captures inside the README Deployment section:

```javascript
const deployVersion = captureExactly(
  deployment,
  /^# Deploy v([^\s]+)\s*$/gm,
  'README deploy example',
  issueGroups.deployVersion
);
captureExactly(
  deployment,
  /^\.\\deploy\.ps1 -ExpectedHead \$head\s*$/gm,
  'README deploy command',
  issueGroups.deployCommand
);
```

Add `deployCommand` immediately after `deployVersion` in `issueGroups`, keep baseline-invalid behavior structural-only, and compare only `deployVersion` to the AGENTS baseline. Public API/CLI exports remain unchanged.

- [ ] **Step 4: Run checker GREEN**

Run `node scripts/check-version-consistency.test.js`.

Expected: `Version consistency tests passed: 12/12.` The actual repository gate may still report the old README command until Step 6; that is the expected release-metadata RED and must not be treated as a checker failure.

- [ ] **Step 5: Add the deployment contract to the existing Pages workflow**

After `Check repository version consistency` and before `Prepare single-file site`, add:

```yaml
      - name: Test deployment tool contract
        shell: pwsh
        run: ./scripts/test-deploy.ps1
```

Do not change permissions, branch, concurrency, artifact preparation, browser gate, upload, or deploy job.

- [ ] **Step 6: Synchronize v10.78 release sources**

Use date `2026-07-19` everywhere.

In `AGENTS.md`:

- baseline `v10.78` / `2026-07-19`.
- replace the warning that `deploy.ps1` is incomplete with the tracked fail-closed tool and exact CLI.
- document that six listed local files remain untracked after `deploy.ps1` becomes tracked.

In README:

```powershell
$head = (git rev-parse HEAD).Trim()
# Deploy v10.78
.\deploy.ps1 -ExpectedHead $head
```

Explain `-DryRun`, no auto-commit, exact-HEAD Actions/live gates, and that the tool is tracked but excluded from the Pages artifact.

In `index.html`, synchronize header, `APP_VERSION`, `APP_DATE`, brand self-test expectations, and newest Changelog exactly:

```text
- 2026-07-19 v10.78：部署工具改為 fail-closed；只部署已提交的精確 HEAD，加入 DryRun、原遠端防護、Actions 綁定、正式站雜湊與 Chrome 11/11 驗證。
```

- [ ] **Step 7: Run the full integrated GREEN suite**

Run:

```powershell
pwsh -NoProfile -File scripts/test-deploy.ps1
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js
node --check scripts/check-version-consistency.js
node --check scripts/check-version-consistency.test.js
```

Extract the one inline app script after the header comment and compile it with `new vm.Script(...)`. Parse both PowerShell files with the PowerShell AST. Validate workflow order:

1. version tests
2. repository gate
3. deployment tool contract
4. prepare site
5. browser gate
6. upload artifact

Expected: deployment `33/33`, version checker `12/12`, repository gate `v10.78 (2026-07-19)`, all syntax checks pass, one inline script, and workflow artifact commands remain only `cp index.html` plus `.nojekyll`.

- [ ] **Step 8: Review exact release scope and commit**

Require the implementation range from `b695f81` to contain only the plan plus these approved paths:

```text
AGENTS.md
README.md
index.html
deploy.ps1
scripts/test-deploy.ps1
scripts/check-version-consistency.js
scripts/check-version-consistency.test.js
.github/workflows/pages.yml
docs/superpowers/plans/2026-07-19-safe-deploy-tool-v1078.md
```

`PROJECT_RULES.md`, `.nojekyll`, product UI behavior, and six untracked files must have no diff.

Stage Task 4 explicitly:

```powershell
git add -- AGENTS.md README.md index.html scripts/check-version-consistency.js scripts/check-version-consistency.test.js .github/workflows/pages.yml
git diff --cached --check
git diff --cached --name-only
git commit -m "Release v10.78 safe deployment tool"
```

Do not push yet.

- [ ] **Step 9: Run installed-Chrome local v10.78 gate from the committed release**

Run `.\deploy.ps1 -DryRun` from the clean repository after the Task 4 commit.

Expected: title `MK2MD v10.78`, brand `MK2MD`, version/date `v10.78 · 2026-07-19`, 11/11, failed 0, console/page errors 0, warnings 6; no push or Actions wait. If this post-commit DryRun fails, fix it in a new commit rather than amending the reviewed release commit.

---

### Task 5: Final review, dry-run proof, original Pages deployment, and live verification

**Files:**
- Verify only; no planned file modifications.

**Interfaces:**
- Consumes: committed v10.78 exact HEAD and tracked deployment tool.
- Produces: local HEAD = origin/master = remote master = exact Actions SHA = live v10.78 source, with local/live Chrome 11/11 evidence.

- [ ] **Step 1: Run complete fresh pre-deploy verification**

From a new PowerShell process, rerun:

```powershell
pwsh -NoProfile -File scripts/test-deploy.ps1
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js
.\deploy.ps1 -DryRun
git diff --check 3850b36ccd2918bbdaff8de1b546254fa253cd54..HEAD
git status --short --branch
```

Expected: 33/33, 12/12, v10.78 gate, local 11/11/errors 0/warnings 6, tracked/index clean, exact six untracked paths/hashes, no browser/listener, and remote still at the v10.77 base.

- [ ] **Step 2: Perform final fixed-range code review**

Review `3850b36..HEAD` for correctness, unsafe native execution, command injection, accidental write paths, exact SHA handling, timeout behavior, process ownership, cross-platform mock tests, version consistency, and artifact scope. Any Critical or Important finding stops deployment and returns to a new approved fix cycle.

- [ ] **Step 3: Deploy through the new exact-head CLI**

Run:

```powershell
$head = (git rev-parse HEAD).Trim()
.\deploy.ps1 -ExpectedHead $head
```

Expected: the script repeats local gates, pushes only `origin master`, waits for the exact `$head` Pages run, verifies build/deploy success, source hash equality, and live Chrome v10.78 11/11/errors 0/warnings 6.

- [ ] **Step 4: Independently verify the script's final evidence**

Run outside the deploy script:

```powershell
$head = (git rev-parse HEAD).Trim()
$origin = (git rev-parse origin/master).Trim()
$remote = ((git ls-remote origin refs/heads/master) -split '\s+')[0]
if (@($head,$origin,$remote | Select-Object -Unique).Count -ne 1) { throw 'SHA mismatch' }
gh run list --workflow pages.yml --branch master --limit 10 --json databaseId,headSha,status,conclusion,url,updatedAt
```

Select only the exact HEAD run and require completed/success build and deploy jobs. Fetch the cache-busted live bytes again and compare SHA-256 to local `index.html`; rerun installed Chrome with fresh listeners.

- [ ] **Step 5: Verify protected/local cleanup state**

Require:

- the six known untracked files and hashes are unchanged.
- tracked worktree/index clean.
- no `.playwright-cli` or new repository artifact.
- Chrome sessions, owned servers, and listeners are zero.
- no deleted file, branch, run, site, or deployment resource.

- [ ] **Step 6: Record completion evidence**

Report in Taiwan Traditional Chinese, with the key result first, then:

1. work completed.
2. files changed.
3. version `v10.78` and release SHA.
4. 33/33, 12/12, version gate, syntax, dry-run, local/live 11/11 results.
5. deployed yes/no.
6. original live URL, exact Actions URL/id, SHA, push/deploy/live verification times in Asia/Taipei.
7. remaining risk or user action.

Add a detailed next-task recommendation. Do not claim success unless the exact-HEAD Actions run and cache-busted live browser both pass.

## Plan Self-Review Checklist

- Spec coverage: safe core, no auto-commit, exact six untracked after tracking the tool, dry-run, Chrome CDP, exact Actions, live hash, CI test, v10.78 metadata, and original deployment all map to explicit tasks.
- Interface consistency: Task 1 policy functions feed Task 2 browser and Task 3 orchestration; Task 4 integrates the new README CLI with the checker; Task 5 consumes the final CLI unchanged.
- Scope: no new project, dependency, platform, branch, worktree, Pages artifact, product UI behavior, or destructive cleanup.
- Failure policy: every preflight, native command, remote relation, Actions state, source hash, browser result, and protected snapshot fails closed.
