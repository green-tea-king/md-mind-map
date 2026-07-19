# MK2MD v10.80 Deployment Boundary Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Resolve the five Important findings from the v10.79 fixed-range review before any repository write or Pages deployment.

**Architecture:** Preserve the existing single-file app and PowerShell CLI. Add a pre-push state barrier, execute the full deployment-contract suite as a production preflight, propagate one deadline through native/CDP cleanup, make self-test status explicit, and remove every unguarded recursive-delete path.

**Tech Stack:** PowerShell 7/.NET, Node.js, installed Chrome CDP, Git, GitHub CLI, GitHub Pages.

## Global Constraints

- Work only in the existing MK2MD folder/current `master`; no new project, move, worktree, branch, platform, or repository.
- No push/deploy until all tasks and a fresh fixed-range review pass.
- Keep the six protected untracked files untouched and unstaged.
- No force push, auto-commit, destructive cleanup, or broad recursive delete.
- The only deletable objects are the current task's own validated TEMP Chrome profiles, already authorized by the user.
- Final release version is `v10.80` / `2026-07-19`; retain all prior Changelog entries.
- Every production fix starts with a failing behavior test.

---

### Task 1: Add pre-push state, full contract preflight, and explicit self-test status

**Files:** `deploy.ps1`, `scripts/test-deploy.ps1`

- [ ] **Step 1: RED tests**

Add behavior fixtures proving:

- changing branch, HEAD, local master ref, fetch URL, push URL, tracked/index state, untracked set, protected hash, or remote SHA after local/browser gates stops before `git push`.
- the push adapter performs the complete pre-push state read immediately before the write and verifies remote SHA/URLs immediately after.
- production `Get-RepositoryContext` invokes `pwsh -NoProfile -File scripts/test-deploy.ps1` through the checked native seam before browser/push; nonzero and timeout stop the flow.
- a DOM result with `SelfTest='fail'`, `Passed=11`, `Failed=0`, and no console/page errors is rejected.

Run `pwsh -NoProfile -File scripts/test-deploy.ps1`; record RED for all cases.

- [ ] **Step 2: Implement exact pre-push barrier**

Add `Get-PrePushRepositoryState` and `Assert-PrePushRepositoryState` using the existing checked native seam. Require branch `master`, exact original HEAD, local/remote master equality expected by the relation, one exact fetch/push URL, clean tracked/index, exact six untracked paths, and original protected hashes. Only then call `git push origin master`; immediately after, recheck URLs, local HEAD, `origin/master`, and `ls-remote`.

- [ ] **Step 3: Run the real contract suite before external probes**

In `Get-RepositoryContext`, after the earliest protected snapshot and version/syntax probes, invoke:

```powershell
pwsh -NoProfile -File scripts/test-deploy.ps1
```

through `Invoke-RepositoryNative`, with the existing bounded timeout. It must complete before local browser, push, Actions, or live-source work. Avoid recursive deployment invocation: the test script dot-sources only and does not call the entrypoint.

- [ ] **Step 4: Preserve and assert self-test status**

Return `SelfTest` and `Detail` from `Invoke-ChromeSelfTest`; require `SelfTest -eq 'pass'` in `Assert-BrowserResult` for local and live results.

- [ ] **Step 5: GREEN, commit, and verify**

Require all prior tests plus new tests green, AST/VM/version/diff/hash gates, direct app Chrome 11/11, and no push/deploy. Commit only the two allowed files:

```powershell
git add -- deploy.ps1 scripts/test-deploy.ps1
git diff --cached --check
git diff --cached --name-only
git commit -m "Close deployment write boundary"
```

---

### Task 2: Enforce strict native and DOM total deadlines

**Files:** `deploy.ps1`, `scripts/test-deploy.ps1`

- [ ] **Step 1: RED tests**

Add a native child that writes output but never closes stdout/stderr and verify timeout cleanup itself is bounded. Add a 90-second DOM-loop fixture whose final CDP response arrives after the deadline; assert it is rejected and no extra command budget is accepted. Add zero-budget sleep/adapter tests.

- [ ] **Step 2: Bound native cleanup**

Refactor `Invoke-CheckedNative`/`Stop-OwnedProcess` so process wait, stdout task wait, stderr task wait, and owned-tree cleanup all share the original deadline. A timeout remains the primary exception; cleanup failures are attached, never allowed to replace it or hang indefinitely.

- [ ] **Step 3: Bind the DOM loop to its deadline**

Pass the 90-second `$deadline` into every `Invoke-CdpCommand`, check the clock after each command returns, and use only remaining milliseconds for sleeps. A late DOM response must throw with the original deadline evidence.

- [ ] **Step 4: GREEN and commit**

Run the full suite, real delayed/continuous/clean Chrome tests, direct MK2MD 11/11, cleanup/profile/hash/AST/VM/version checks, then commit only the two allowed files:

```powershell
git add -- deploy.ps1 scripts/test-deploy.ps1
git diff --cached --check
git commit -m "Bound native and DOM deployment waits"
```

---

### Task 3: Remove unguarded marker-failure deletion

**Files:** `deploy.ps1`, `scripts/test-deploy.ps1`

- [ ] **Step 1: RED tests**

Force marker creation failure and directory replacement/reparse scenarios. Assert no recursive delete is attempted unless the exact validated owned profile marker exists; failed marker creation must preserve the directory and report cleanup failure.

- [ ] **Step 2: Implement safe failure cleanup**

Remove the unguarded `[IO.Directory]::Delete($profilePath, $true)` catch path. On marker failure, validate the exact TEMP/GUID/non-reparse/ownership conditions; if ownership cannot be proven, leave the directory and attach cleanup evidence. Never delete a directory without the marker token.

- [ ] **Step 3: GREEN and commit**

Run all profile adversarial tests, real Chrome lifecycle, and cleanup audit; commit only the two allowed files:

```powershell
git add -- deploy.ps1 scripts/test-deploy.ps1
git diff --cached --check
git commit -m "Harden profile marker failure cleanup"
```

---

### Task 4: Release v10.80 metadata

**Files:** `AGENTS.md`, `README.md`, `index.html`

- [ ] **Step 1: RED and synchronize sources**

Assert real sources are still v10.79, then update baseline, README Current Version/deploy comment, HTML header/constants/brand self-tests, and add this newest Changelog without rewriting history:

```text
- 2026-07-19 v10.80：補強 push 前狀態重驗、完整部署合約前置閘門、原生與 DOM 逾時清理、自我測試狀態及 Chrome profile 失敗清理。
```

- [ ] **Step 2: GREEN and commit**

Run contract/version/syntax/AST/VM/workflow/artifact/hash checks and direct v10.80 Chrome 11/11. Commit exactly:

```powershell
git add -- AGENTS.md README.md index.html
git diff --cached --check
git diff --cached --name-only
git commit -m "Release v10.80 deployment boundary hardening"
```

- [ ] **Step 3: Post-commit DryRun**

From clean HEAD, run the full `deploy.ps1 -DryRun` once in a stable same-repository path. If RaiDrive invalidates child cwd, record fail-closed evidence and do not deploy.

---

### Task 5: Final review and original Pages deployment

**Files:** verify only; no planned modifications.

- [ ] **Step 1:** Freshly run all contract/version/AST/VM/diff/hash/direct Chrome gates and complete DryRun.
- [ ] **Step 2:** Review fixed range `3850b36..HEAD`; any Critical/Important blocks deployment.
- [ ] **Step 3:** Only after review and stable DryRun, run:

```powershell
$head = (git rev-parse HEAD).Trim()
.\deploy.ps1 -ExpectedHead $head
```

- [ ] **Step 4:** Independently verify exact local/origin/remote/Actions/live SHA equality, v10.80 title/brand/date, 11/11, errors 0, warnings 6, protected hashes, and zero owned processes/profiles/listeners.
- [ ] **Step 5:** Report all evidence in Taiwan Traditional Chinese and recommend the next task.

## Self-Review

- All five v10.79 Important findings map to RED tests and implementation tasks.
- Push, Actions, snapshot, timeout, cleanup, self-test status, and full preflight barriers are independently testable.
- No product UI, dependency, platform, artifact, repository, or irreversible-scope change is introduced.
