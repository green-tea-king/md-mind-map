# MK2MD v10.79 Safe Deployment Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every Critical/Important deployment-safety finding from the fixed-range v10.78 review, release the result as v10.79, and deploy only after a fresh whole-range review passes.

**Architecture:** Keep the existing single-file product and PowerShell deployment CLI. Split repository observation from orchestration so production Git/GitHub gates are behavior-testable, bind every write and Actions query to `green-tea-king/md-mind-map`, preserve one immutable protected-file baseline from the earliest safe point, and require a final repository-state equality gate after live browser verification. Replace the fixed one-second CDP settle with a bounded minimum-observation plus quiet-window policy.

**Tech Stack:** PowerShell 7, .NET Process/HTTP/WebSocket APIs, Node.js `vm.Script`, installed Google Chrome CDP, Git, GitHub CLI, GitHub Actions, GitHub Pages.

## Global Constraints

- Work only in the existing MK2MD directory on the current `master`; no new project, directory move, branch, worktree, repository, site, or hosting platform.
- Do not delete, clean, reset, checkout, rewrite history, force push, dispatch/rerun/cancel Actions, or alter deployment resources.
- Keep the six protected untracked files untouched and unstaged: `BACKUP_MANIFEST.md`, `MD心智圖_v10_00.html`, `agent.md`, `clear-auto-draft.html`, `design.md`, `repository-history.bundle`.
- Keep GitHub Pages artifact scope exactly `index.html` plus `.nojekyll`.
- No production-code fix may be written before its regression test has failed for the expected reason.
- Every native command and wait must have a real total deadline; an adapter returning after its deadline must not be accepted as success.
- Final release version is `v10.79`, date `2026-07-19`, using the existing sequential version rule.
- Do not push or deploy before Tasks 1–4 and the final fixed-range review are approved.

---

### Task 1: Bind production repository identity and make preflight behavior-testable

**Files:**
- Modify: `deploy.ps1`
- Modify: `scripts/test-deploy.ps1`

**Interfaces:**
- Produces `Invoke-RepositoryNative -Native <scriptblock> -FilePath <string> -Arguments <string[]> -Repo <string> -AllowedExitCodes <int[]> -TimeoutSeconds <int>`.
- Produces `Get-RemoteIdentity -Repo <string> -Native <scriptblock>` returning `{ FetchUrl, PushUrl, Slug }`.
- Extends `Get-RepositoryContext -Repo <string> -Native <scriptblock> -SnapshotProvider <scriptblock>`.
- `Native` receives `(filePath, arguments, repo, allowedExitCodes, timeoutSeconds)` and returns the same object contract as `Invoke-CheckedNative`.
- `SnapshotProvider` receives `(repo, protectedPaths)` and returns the ordered SHA-256 dictionary.

- [ ] **Step 1: Add failing production-preflight fixtures**

Add a command-result native fixture that records every call and returns deterministic results for branch, fetch URL, push URLs, tracked/staged diffs, porcelain status, Node gates, GitHub auth/permission, `ls-remote`, fetch, HEAD, ancestry, log, and changed paths.

The RED cases must prove:

```powershell
Get-RepositoryContext -Repo 'fixture' -Native $native -SnapshotProvider $snapshotProvider
```

- accepts one exact fetch URL and one exact push URL whose slug is `green-tea-king/md-mind-map`.
- rejects a wrong push URL before `node`, `gh auth`, `gh api`, `fetch`, browser, or push.
- rejects multiple push URLs before any external write.
- rejects wrong branch, dirty tracked worktree, staged changes, unexpected untracked files, unavailable auth, false push permission, and remote-ahead/diverged fixtures.
- records `snapshot` after exact untracked validation but before the first `node` or `gh` command.
- compares the original snapshot again after version/syntax/auth/remote probes.

Expected RED: the new cases fail because `Get-RepositoryContext` has no injectable native/snapshot boundary, validates only the fetch URL, and snapshots too late.

- [ ] **Step 2: Run RED and preserve exact evidence**

Run:

```powershell
pwsh -NoProfile -File scripts/test-deploy.ps1
```

Record the precise passed/failed count and the expected messages for wrong/multiple push URL, production gate failures, and snapshot ordering.

- [ ] **Step 3: Add one checked repository-command boundary**

Implement the default/injected boundary without shell string composition:

```powershell
function Invoke-RepositoryNative {
  param(
    [scriptblock]$Native,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$Repo,
    [int[]]$AllowedExitCodes = @(0),
    [int]$TimeoutSeconds = 60
  )
  if ($null -eq $Native) {
    return Invoke-CheckedNative -FilePath $FilePath -Arguments $Arguments `
      -WorkingDirectory $Repo -AllowedExitCodes $AllowedExitCodes -TimeoutSeconds $TimeoutSeconds
  }
  return & $Native $FilePath $Arguments $Repo $AllowedExitCodes $TimeoutSeconds
}
```

All production `Get-RepositoryContext` Git, Node, and GitHub calls must pass through this boundary.

- [ ] **Step 4: Validate both fetch and actual push destinations**

Use these exact Git commands before Node/GitHub probes:

```powershell
git remote get-url --all origin
git remote get-url --push --all origin
```

Normalize non-empty lines, require exactly one fetch URL and exactly one push URL, parse both with `ConvertTo-RepositorySlug`, and require both slugs to equal `green-tea-king/md-mind-map`. Store `FetchUrl` and `PushUrl` in the repository context. No `git push` may occur in this task.

- [ ] **Step 5: Establish the protected baseline at the earliest safe point**

After branch, remote identity, tracked/staged cleanliness, porcelain parsing, and exact untracked-set validation—but before Node, `gh`, fetch, or any browser—call the injected/default snapshot provider. Save that original dictionary in `context.ProtectedHashes` and compare it again after all remaining context probes.

- [ ] **Step 6: Run GREEN and real read-only preflight**

Run the complete PowerShell suite, version tests/gate, AST parse, `vm.Script`, `git diff --check`, and `./deploy.ps1 -DryRun`. Require all new production fixtures green, local Chrome 11/11, errors 0, warnings 6, protected hashes unchanged, and no remote/Actions change.

- [ ] **Step 7: Commit Task 1 with an allowlist**

```powershell
git add -- deploy.ps1 scripts/test-deploy.ps1
git diff --cached --check
git diff --cached --name-only
git commit -m "Harden deployment repository preflight"
```

Expected: exactly two committed files; no push or deployment.

---

### Task 2: Bind Actions evidence, enforce strict deadlines, and require final repository equality

**Files:**
- Modify: `deploy.ps1`
- Modify: `scripts/test-deploy.ps1`

**Interfaces:**
- Produces `Get-RemainingWholeSeconds -Deadline <DateTimeOffset> -Operation <string>`; it throws when no time remains and never returns an artificial extra second.
- Produces `Assert-ExactRepositoryState -Initial <object> -Final <object>`.
- Adds `GetRepositoryState` to deployment adapters; it returns branch, HEAD, `origin/master`, remote HEAD, fetch URL, push URL, tracked/staged state, exact untracked paths, and protected hashes.
- Every `gh run list/watch/view` command is explicitly scoped with `--repo green-tea-king/md-mind-map`.

- [ ] **Step 1: Add failing repository-race, GH repository, and deadline tests**

Add RED cases that prove:

- `Get-PagesWorkflowRuns`, `WatchRun`, and `RunView` include `--repo green-tea-king/md-mind-map` even when `GH_REPO` points elsewhere.
- a run URL outside `https://github.com/green-tea-king/md-mind-map/actions/runs/` is rejected.
- if an adapter starts before the deadline but returns after it, `Wait-ExactHeadRun` and `Wait-LiveSourceMatch` throw instead of accepting success.
- `TimeoutSeconds 0` invokes no RunList/WatchRun/RunView/LiveSource/Sleep adapter.
- after live browser success, changed branch, HEAD, fetch URL, push URL, dirty tracked/index, changed untracked set, protected hash drift, or remote HEAD B all stop final success.
- final state is observed after the live browser call, not before it.

Expected RED: repository-scoping arguments, strict post-adapter deadline checks, and final state gate are missing.

- [ ] **Step 2: Run RED**

Run `pwsh -NoProfile -File scripts/test-deploy.ps1` and record the precise failure count/reasons.

- [ ] **Step 3: Bind every GitHub Actions command to the original repository**

Require exact arguments:

```text
gh run list ... --repo green-tea-king/md-mind-map
gh run watch <id> --exit-status --repo green-tea-king/md-mind-map
gh run view <id> --repo green-tea-king/md-mind-map --json ...
```

Extend `Assert-SuccessfulPagesRun` to require the canonical run URL prefix and numeric run id equality. Do not read or trust `GH_REPO`.

- [ ] **Step 4: Replace soft timeouts with strict total deadlines**

Before every adapter call, calculate remaining time from the original deadline. If it is zero or negative, throw without calling the adapter. Immediately after each RunList, WatchRun, RunView, Sleep, or LiveSource return, compare the clock to the same deadline; expired results cannot be accepted. Remove `Max(1, remaining)` behavior that extends the total bound.

- [ ] **Step 5: Revalidate exact state immediately before reporting success**

After live source equality and live Chrome validation, call `GetRepositoryState`. `Assert-ExactRepositoryState` must require:

```text
Branch == master
Head == initial Head
origin/master == initial Head
remote refs/heads/master == initial Head
FetchUrl == initial FetchUrl
PushUrl == initial PushUrl
tracked and staged clean
untracked set == the exact six paths
protected hashes == the initial earliest snapshot
```

The `equal` path and the `local-ahead`/pushed path use the same final gate. The final report object may be returned only after it passes.

- [ ] **Step 6: Run GREEN and DryRun**

Run all PowerShell cases and the real DryRun. DryRun must continue to stop before push, Actions watch, live fetch, and final live success; it must still compare protected state after the local browser gate.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- deploy.ps1 scripts/test-deploy.ps1
git diff --cached --check
git diff --cached --name-only
git commit -m "Bind exact deployment completion state"
```

Expected: exactly two committed files; no push or deployment.

---

### Task 3: Detect delayed browser errors with a bounded observation policy

**Files:**
- Modify: `deploy.ps1`
- Modify: `scripts/test-deploy.ps1`

**Interfaces:**
- Replaces `$script:CdpSettleMilliseconds` with:

```powershell
$script:CdpMinimumObservationMilliseconds = 2000
$script:CdpQuietWindowMilliseconds = 500
$script:CdpMaximumObservationMilliseconds = 5000
```

- Produces a bounded observation loop that continues to feed the same CDP event sink and performs a final DOM barrier before result aggregation.

- [ ] **Step 1: Add a real Chrome delayed-exception RED test**

Build an in-memory `data:text/html` fixture containing `#brandName`, `#appVersion`, the exact v10.78 title/date, and immediate `document.documentElement.dataset.ciSelfTest='pass'`, `passed='11'`, `failed='0'`. Schedule:

```javascript
setTimeout(() => { throw new Error('mk2md-delayed-page-error'); }, 1500);
```

Call `Invoke-ChromeSelfTest` against that fixture and require `PageErrors` to contain `mk2md-delayed-page-error`. Also retain a clean real Chrome fixture/result that completes within the 5-second maximum and has zero errors.

Expected RED: the current 1000ms settle returns before the delayed exception.

- [ ] **Step 2: Run RED and confirm the real failure**

Run the PowerShell suite on installed Chrome. Confirm the new test fails specifically because `PageErrors` is empty, not because Chrome/data URL/CDP setup failed.

- [ ] **Step 3: Implement minimum observation, quiet window, and hard maximum**

After the page first reports self-test pass:

- observe for at least 2000ms.
- keep issuing bounded `Runtime.evaluate` barriers and collecting all intervening events.
- after the minimum, require at least 500ms with no new error/warning/exception events.
- never observe beyond 5000ms total.
- perform one final DOM evaluation before aggregating console errors, page errors, and warnings.

Any CDP command keeps its existing total deadline; the observation loop must not reset or extend the 5000ms maximum.

- [ ] **Step 4: Run GREEN and the actual MK2MD local gate**

Require the delayed error is detected, the clean fixture stays error-free, the actual app remains 11/11 with 0 console/page errors and exactly 6 known warnings, and owned Chrome/server/profile counts return to zero.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- deploy.ps1 scripts/test-deploy.ps1
git diff --cached --check
git diff --cached --name-only
git commit -m "Detect delayed deployment browser errors"
```

Expected: exactly two committed files; no push or deployment.

---

### Task 4: Release v10.79 metadata and documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `index.html`
- Test: `scripts/check-version-consistency.test.js`
- Test: `scripts/check-version-consistency.js`

**Interfaces:**
- Consumes the approved hardened deployment CLI from Tasks 1–3.
- Produces repository baseline `v10.79` / `2026-07-19` and README command `# Deploy v10.79`.

- [ ] **Step 1: Synchronize every current version source**

Update:

- `AGENTS.md` baseline to `v10.79` / `2026-07-19`.
- README Current Version and deploy comment to v10.79, retaining `$head` and `-ExpectedHead $head` exactly.
- `index.html` header Version/Last updated, `APP_VERSION`, `APP_DATE`, brand self-test expectations, and newest Changelog.

Use this exact newest Changelog entry:

```text
- 2026-07-19 v10.79：強化 fail-closed 部署邊界；鎖定 fetch、push 與 Actions repository，提前保護本機檔案，完成前重驗精確 HEAD，並捕捉延遲瀏覽器錯誤。
```

Do not rewrite the v10.78 entry or any older history.

- [ ] **Step 2: Run the full release gate**

Run:

```powershell
pwsh -NoProfile -File scripts/test-deploy.ps1
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js
node --check scripts/check-version-consistency.js
node --check scripts/check-version-consistency.test.js
```

Parse both PowerShell files with the PowerShell AST and compile the one inline app script with `vm.Script`. Verify workflow order/artifact scope, `git diff --check`, exact six untracked hashes, and no `.playwright-cli` or `mk2md-chrome-*` artifact.

- [ ] **Step 3: Commit the release metadata**

```powershell
git add -- AGENTS.md README.md index.html
git diff --cached --check
git diff --cached --name-only
git commit -m "Release v10.79 deployment hardening"
```

Expected: exactly three committed files; no push or deployment.

- [ ] **Step 4: Run post-commit real DryRun**

From the clean committed HEAD, require v10.79 / 2026-07-19, local Chrome 11/11, errors 0, warnings 6, exact protected hashes, clean tracked/index, and unchanged remote/Actions id.

---

### Task 5: Whole-range review, original Pages deployment, and independent live proof

**Files:**
- Verify only; no planned modifications.

**Interfaces:**
- Consumes the final committed v10.79 exact HEAD.
- Produces `local HEAD = origin/master = remote master = exact Actions SHA = live source SHA-256`, plus local/live Chrome 11/11 evidence.

- [ ] **Step 1: Run fresh pre-deploy verification**

Require the complete PowerShell suite, version tests/gate, syntax checks, post-commit DryRun, exact six hashes, clean tracked/index, no owned process/profile/listener, and remote still at the v10.77 base until deployment.

- [ ] **Step 2: Perform a fresh fixed-range review**

Review `3850b36ccd2918bbdaff8de1b546254fa253cd54..HEAD`. Any Critical or Important finding stops deployment and starts a new versioned fix cycle. The reviewer must explicitly recheck all five v10.78 Important findings and the strict-deadline Minor.

- [ ] **Step 3: Deploy only through the exact-head CLI**

```powershell
$head = (git rev-parse HEAD).Trim()
.\deploy.ps1 -ExpectedHead $head
```

The script may push only existing `origin/master`, with the verified single push URL. It must wait for the exact repository/HEAD Pages run and return only after live source, live browser, and final repository equality all pass.

- [ ] **Step 4: Independently verify deployment evidence**

Outside the script, recheck local/origin/remote SHA equality, exact Actions run URL/id/head/status/build/deploy, cache-busted live SHA-256 equality, live v10.79 title/brand/date, 11/11, errors 0, warnings 6, six protected hashes, and zero owned cleanup artifacts.

- [ ] **Step 5: Record completion**

Report in Taiwan Traditional Chinese: work, files, v10.79 SHA, all validation results, deployment yes/no, original live/Actions URLs and Asia/Taipei time, remaining risks, and a detailed next-task recommendation.

## Plan Self-Review Checklist

- Spec coverage: all five Important findings and the strict-deadline Minor have a RED test, implementation task, GREEN gate, and final review requirement.
- Interface consistency: Task 1 repository adapters feed Task 2 final equality; Task 2 keeps Task 3 browser adapters unchanged; Task 4 only synchronizes release sources; Task 5 performs no planned modification.
- Scope: no new frontend project, dependency, platform, branch, worktree, Pages artifact, UI behavior, destructive cleanup, or automatic commit.
- Failure policy: wrong/multiple push URL, wrong Actions repository, expired adapter result, late browser error, protected drift, or final SHA/state mismatch all fail closed before success.
- Placeholder scan: no implementation step is deferred or unspecified.
