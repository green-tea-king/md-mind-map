# MK2MD v10.77 Version Error Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the version consistency gate report all independent structure errors when the AGENTS baseline is invalid, without guessing a canonical version, then release MK2MD v10.77 through the original Pages workflow.

**Architecture:** `validateVersionConsistency()` will parse every named field into ordered issue groups before performing any value comparisons. If the AGENTS baseline is valid, comparisons are added to the corresponding field groups; if it is invalid, comparisons are skipped and all independently discoverable structure issues are still returned through the unchanged public API.

**Tech Stack:** Node.js CommonJS and built-in `assert`, single-file HTML/JavaScript, PowerShell, installed Chrome/Playwright CLI, GitHub Actions and GitHub CLI.

## Global Constraints

- Work only in the current MK2MD project folder; do not create a project, move files, create a worktree, or change deployment platform.
- Release version is exactly `v10.77`; release date is exactly `2026-07-17`.
- `AGENTS.md` first-paragraph baseline remains the only canonical current version/date source; never infer a fallback from README or index.
- When the baseline is invalid, collect all independent missing/duplicate structure errors, return empty version/date, skip every value comparison, and fail the gate.
- Preserve the public `validateVersionConsistency({ agentsText, readmeText, indexText }) => { ok, version, date, issues }` contract and CLI format.
- Parent-section failures produce one parent issue, not synthetic child-field errors.
- Do not modify `.github/workflows/pages.yml`, `PROJECT_RULES.md`, UI behavior, data format, old Changelog entries, historical filenames, or the seven existing untracked files.
- Do not add `package.json`, dependencies, a PR workflow, branch, repository, site, platform, or Pages artifact file.
- The published artifact remains exactly `index.html` plus `.nojekyll`.
- Keep the existing v10.76 values inside the in-memory checker test fixture as arbitrary consistent sample data; they are not repository release-version sources.
- Stage every commit with an explicit allowlist; never use `git add .`.
- Push only the existing `origin/master` after all local verification passes.
- Do not delete any file or generated artifact without explicit user confirmation.

---

## File Structure

- Modify `scripts/check-version-consistency.test.js`: add two baseline-invalid regression cases while preserving the existing eight cases.
- Modify `scripts/check-version-consistency.js`: remove the early return, parse into ordered issue groups, and conditionally compare only with a valid baseline.
- Modify `AGENTS.md`: synchronize the v10.77 baseline only; existing version and verification rules remain authoritative.
- Modify `README.md`: synchronize Current Version and deployment example to v10.77.
- Modify `index.html`: synchronize all required v10.77 sources and add one newest Changelog entry without product behavior changes.
- Verify `.github/workflows/pages.yml` is unchanged and still runs the existing test/gate/browser/deploy sequence.

### Task 1: Aggregate structure errors without guessing version values

**Files:**
- Modify: `scripts/check-version-consistency.test.js`
- Modify: `scripts/check-version-consistency.js`

**Interfaces:**
- Consumes: `{ agentsText: string, readmeText: string, indexText: string }`.
- Produces unchanged: `{ ok: boolean, version: string, date: string, issues: Array<{ field: string, expected: string, actual: string }> }`.
- Baseline invalid result: `ok: false`, `version: ''`, `date: ''`, all independent structure issues, no guessed mismatch issues.

- [ ] **Step 1: Add the two approved tests before changing production code**

Insert these tests immediately before the final `if (failed > 0)` block in `scripts/check-version-consistency.test.js`:

```js
test('aggregates independent structure errors when the baseline is missing', () => {
  const sources = consistentSources();
  sources.agentsText = sources.agentsText.replace(
    '本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.76`（`2026-07-17`）。預設使用台灣繁體中文協作。',
    ''
  );
  sources.indexText = sources.indexText.replace("const APP_DATE = '2026-07-17';\n", '');
  sources.readmeText = sources.readmeText.replace(
    '- Version: `v10.76`',
    '- Version: `v10.76`\n- Version: `v10.76`'
  );

  const result = validateVersionConsistency(sources);

  assert.equal(result.ok, false);
  assert.equal(result.version, '');
  assert.equal(result.date, '');
  assert.deepEqual(result.issues.map((issue) => issue.field), [
    'AGENTS.md baseline',
    'index.html APP_DATE',
    'README Current Version'
  ]);
});

test('does not guess value mismatches when the baseline is missing', () => {
  const sources = consistentSources();
  sources.agentsText = sources.agentsText.replace(
    '本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.76`（`2026-07-17`）。預設使用台灣繁體中文協作。',
    ''
  );
  sources.indexText = sources.indexText.replace("const APP_VERSION = '10.76';", "const APP_VERSION = '0.00';");

  const result = validateVersionConsistency(sources);

  assert.equal(result.ok, false);
  assert.equal(result.version, '');
  assert.equal(result.date, '');
  assert.deepEqual(result.issues.map((issue) => issue.field), ['AGENTS.md baseline']);
  assert.equal(issueFor(result, 'index.html APP_VERSION'), undefined);
});
```

The second test is a regression guard for behavior the early return already provides; it is intentionally test-first so the refactor cannot introduce guessed mismatches. The first test is the feature RED that must fail before implementation.

- [ ] **Step 2: Run the focused suite and verify the expected RED state**

Run:

```powershell
node scripts/check-version-consistency.test.js
```

Expected: exit code 1 with `Version consistency tests failed: 1/10.` The aggregation test must fail because the current early return yields only `AGENTS.md baseline`; the no-guess regression guard and the original eight tests should pass. If a syntax or fixture error causes the failure, fix the test and rerun until this exact behavioral RED is observed.

- [ ] **Step 3: Replace only `validateVersionConsistency()` with the two-phase implementation**

Keep `captureExactly()`, `markdownSection()`, `compare()`, `readSources()`, `runCli()` and module exports unchanged. Replace the complete `validateVersionConsistency()` function in `scripts/check-version-consistency.js` with:

```js
function validateVersionConsistency({ agentsText, readmeText, indexText }) {
  const issueGroups = {
    baseline: [],
    headerComment: [],
    headerVersion: [],
    headerDate: [],
    changelog: [],
    appVersion: [],
    appDate: [],
    selfVersion: [],
    selfDate: [],
    selfTitle: [],
    readmeCurrentSection: [],
    readmeVersion: [],
    readmeDate: [],
    readmeDeploymentSection: [],
    deployVersion: []
  };

  const baseline = captureExactly(
    agentsText,
    /^本規範是.*基準版本為 `v([^`]+)`（`(\d{4}-\d{2}-\d{2})`）。.*$/gm,
    'AGENTS.md baseline',
    issueGroups.baseline
  );
  const version = baseline ? baseline[0] : '';
  const date = baseline ? baseline[1] : '';

  const headerMatches = Array.from(indexText.matchAll(/^\s*<!DOCTYPE html>\s*<!--([\s\S]*?)-->/gi));
  let header = null;
  if (headerMatches.length !== 1) {
    issueGroups.headerComment.push({
      field: 'index.html header comment',
      expected: 'exactly 1 header comment immediately after the leading DOCTYPE',
      actual: `${headerMatches.length} matches`
    });
  } else {
    header = headerMatches[0][1];
  }

  let headerVersion = null;
  let headerDate = null;
  let changelog = null;
  if (header !== null) {
    headerVersion = captureExactly(
      header,
      /^\s*Version:\s*v([^\s]+)\s*$/gm,
      'index.html header Version',
      issueGroups.headerVersion
    );
    headerDate = captureExactly(
      header,
      /^\s*Last updated:\s*(\d{4}-\d{2}-\d{2})\s*$/gm,
      'index.html header Last updated',
      issueGroups.headerDate
    );
    changelog = captureExactly(
      header,
      /修改紀錄 Changelog\(最新在最上\):\s*\r?\n\s*-\s*(\d{4}-\d{2}-\d{2})\s+v([^：\s]+)：/gm,
      'index.html newest Changelog',
      issueGroups.changelog
    );
  }

  const appVersion = captureExactly(
    indexText,
    /^const APP_VERSION = '([^']+)';$/gm,
    'index.html APP_VERSION',
    issueGroups.appVersion
  );
  const appDate = captureExactly(
    indexText,
    /^const APP_DATE = '([^']+)';$/gm,
    'index.html APP_DATE',
    issueGroups.appDate
  );
  const selfVersion = captureExactly(
    indexText,
    /&& APP_VERSION === '([^']+)'/g,
    'index.html brand self-test APP_VERSION',
    issueGroups.selfVersion
  );
  const selfDate = captureExactly(
    indexText,
    /&& APP_DATE === '([^']+)'/g,
    'index.html brand self-test APP_DATE',
    issueGroups.selfDate
  );
  const selfTitle = captureExactly(
    indexText,
    /&& APP_TITLE === '([^']+)'/g,
    'index.html brand self-test APP_TITLE',
    issueGroups.selfTitle
  );

  const currentVersion = markdownSection(
    readmeText,
    'Current Version',
    'README Current Version section',
    issueGroups.readmeCurrentSection
  );
  let readmeVersion = null;
  let readmeDate = null;
  if (currentVersion !== null) {
    readmeVersion = captureExactly(
      currentVersion,
      /^- Version: `v([^`]+)`\s*$/gm,
      'README Current Version',
      issueGroups.readmeVersion
    );
    readmeDate = captureExactly(
      currentVersion,
      /^- Date: `(\d{4}-\d{2}-\d{2})`\s*$/gm,
      'README Current Date',
      issueGroups.readmeDate
    );
  }

  const deployment = markdownSection(
    readmeText,
    'Deployment',
    'README Deployment section',
    issueGroups.readmeDeploymentSection
  );
  let deployVersion = null;
  if (deployment !== null) {
    deployVersion = captureExactly(
      deployment,
      /^\.\\deploy\.ps1 -Message "Deploy v([^"]+)"\s*$/gm,
      'README deploy example',
      issueGroups.deployVersion
    );
  }

  if (baseline) {
    compare(issueGroups.headerVersion, 'index.html header Version', headerVersion && headerVersion[0], version);
    compare(issueGroups.headerDate, 'index.html header Last updated', headerDate && headerDate[0], date);
    if (changelog) {
      compare(issueGroups.changelog, 'index.html newest Changelog date', changelog[0], date);
      compare(issueGroups.changelog, 'index.html newest Changelog version', changelog[1], version);
    }
    compare(issueGroups.appVersion, 'index.html APP_VERSION', appVersion && appVersion[0], version);
    compare(issueGroups.appDate, 'index.html APP_DATE', appDate && appDate[0], date);
    compare(issueGroups.selfVersion, 'index.html brand self-test APP_VERSION', selfVersion && selfVersion[0], version);
    compare(issueGroups.selfDate, 'index.html brand self-test APP_DATE', selfDate && selfDate[0], date);
    compare(issueGroups.selfTitle, 'index.html brand self-test APP_TITLE', selfTitle && selfTitle[0], `MK2MD v${version}`);
    compare(issueGroups.readmeVersion, 'README Current Version', readmeVersion && readmeVersion[0], version);
    compare(issueGroups.readmeDate, 'README Current Date', readmeDate && readmeDate[0], date);
    compare(issueGroups.deployVersion, 'README deploy example', deployVersion && deployVersion[0], version);
  }

  const issues = Object.values(issueGroups).flat();
  return { ok: issues.length === 0, version, date, issues };
}
```

- [ ] **Step 4: Run the focused suite and real v10.76 repository gate GREEN**

Run:

```powershell
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js
```

Expected:

- `Version consistency tests passed: 10/10.`
- `Version consistency gate passed: v10.76 (2026-07-17).`

- [ ] **Step 5: Run an in-memory aggregation probe without writing files**

Run:

```powershell
@'
const fs = require('node:fs');
const { validateVersionConsistency } = require('./scripts/check-version-consistency');
const sources = {
  agentsText: fs.readFileSync('AGENTS.md', 'utf8').replace(/^本規範是.*基準版本為.*$/m, ''),
  readmeText: fs.readFileSync('README.md', 'utf8').replace(
    '- Version: `v10.76`',
    '- Version: `v10.76`\n- Version: `v10.76`'
  ),
  indexText: fs.readFileSync('index.html', 'utf8')
    .replace("const APP_VERSION = '10.76';", "const APP_VERSION = '0.00';")
    .replace("const APP_DATE = '2026-07-17';\n", '')
};
const result = validateVersionConsistency(sources);
const fields = result.issues.map((issue) => issue.field);
const expected = ['AGENTS.md baseline', 'index.html APP_DATE', 'README Current Version'];
if (result.ok || result.version !== '' || result.date !== '' || JSON.stringify(fields) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected aggregation result: ${JSON.stringify(result)}`);
}
if (fields.includes('index.html APP_VERSION')) throw new Error('APP_VERSION mismatch was guessed without a baseline.');
console.log('Aggregation probe passed: 3 structure issues, 0 guessed mismatches.');
'@ | node -
```

Expected: `Aggregation probe passed: 3 structure issues, 0 guessed mismatches.`

- [ ] **Step 6: Verify syntax, scope, and commit only the two checker files**

Run:

```powershell
node --check scripts/check-version-consistency.js
node --check scripts/check-version-consistency.test.js
git diff --check -- scripts/check-version-consistency.js scripts/check-version-consistency.test.js
git add -- scripts/check-version-consistency.js scripts/check-version-consistency.test.js
git diff --cached --check
git diff --cached --name-only
git commit -m "Aggregate version consistency structure errors"
```

Expected staged files: exactly the two checker files. Do not stage any release metadata or existing untracked file.

### Task 2: Synchronize and verify the v10.77 release

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `index.html`

**Interfaces:**
- Consumes: Task 1's 10/10 checker and unchanged workflow.
- Produces: all canonical release sources synchronized to v10.77/2026-07-17; browser-visible `MK2MD v10.77` with unchanged behavior.

- [ ] **Step 1: Run the fixed v10.77 source contract and verify RED**

Run before changing release metadata:

```powershell
@'
const fs = require('node:fs');
const agents = fs.readFileSync('AGENTS.md', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const checks = [
  agents.includes('基準版本為 `v10.77`（`2026-07-17`）'),
  readme.includes('- Version: `v10.77`'),
  readme.includes('.\\deploy.ps1 -Message "Deploy v10.77"'),
  index.includes('Version: v10.77'),
  index.includes("const APP_VERSION = '10.77';"),
  index.includes("APP_TITLE === 'MK2MD v10.77'")
];
if (!checks.every(Boolean)) {
  console.error(`Expected RED: v10.77 source contract ${checks.filter(Boolean).length}/${checks.length}.`);
  process.exit(1);
}
'@ | node -
```

Expected: exit code 1 with `Expected RED: v10.77 source contract 0/6.`

- [ ] **Step 2: Synchronize the exact v10.77 release fields**

Change `AGENTS.md` first paragraph to:

```markdown
本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.77`（`2026-07-17`）。預設使用台灣繁體中文協作。
```

Change README Current Version and deployment example to:

```markdown
- Version: `v10.77`
- Date: `2026-07-17`
```

```powershell
.\deploy.ps1 -Message "Deploy v10.77"
```

Change the current fields in `index.html` to:

```text
Version: v10.77
Last updated: 2026-07-17
```

Insert this single newest Changelog entry above v10.76:

```text
- 2026-07-17 v10.77：改善版本一致性錯誤彙整；AGENTS baseline 無效時仍一次列出各檔案結構問題，且不猜測版本值。
```

Update runtime and brand self-test expectations to:

```js
const APP_VERSION = '10.77';
const APP_DATE = '2026-07-17';
```

```js
      && APP_VERSION === '10.77'
      && APP_DATE === '2026-07-17'
      && APP_TITLE === 'MK2MD v10.77'
```

Do not change the v10.76 Changelog or the v10.76 in-memory sample fixture in `scripts/check-version-consistency.test.js`.

- [ ] **Step 3: Run the release contract and version gates GREEN**

Run the Step 1 fixed source contract again, then:

```powershell
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js
```

Expected:

- Source contract: exit 0 with all 6 checks true.
- `Version consistency tests passed: 10/10.`
- `Version consistency gate passed: v10.77 (2026-07-17).`

- [ ] **Step 4: Verify syntax and confirm workflow is unchanged**

Run:

```powershell
node --check scripts/check-version-consistency.js
node --check scripts/check-version-consistency.test.js
@'
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const withoutHeader = html.replace(/^\s*<!--[\s\S]*?-->\s*/, '');
const scripts = Array.from(withoutHeader.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi));
if (scripts.length !== 1) throw new Error(`Expected 1 inline script, found ${scripts.length}.`);
new vm.Script(scripts[0][1], { filename: 'index.inline.js' });
console.log('Inline app script syntax passed: 1 script.');
'@ | node -
@'
const fs = require('node:fs');
const workflow = fs.readFileSync('.github/workflows/pages.yml', 'utf8');
const items = [
  'name: Test version consistency gate',
  'name: Check repository version consistency',
  'name: Prepare single-file site',
  'name: Run browser self-test gate',
  'name: Upload Pages artifact'
];
const positions = items.map((item) => workflow.indexOf(item));
if (positions.some((position) => position < 0) || positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
  throw new Error(`Workflow order invalid: ${JSON.stringify(positions)}`);
}
console.log('Workflow order passed and remains unchanged.');
'@ | node -
git diff fbe68d9fe969261dc9f0a2200fd590ce676553b1..HEAD -- .github/workflows/pages.yml
```

Expected: both checker scripts and the one inline app script parse, workflow order passes, and the fixed-base workflow diff has no output.

- [ ] **Step 5: Run local installed-Chrome verification**

Start a foreground server in the repository:

```powershell
python -m http.server 8776 --bind 127.0.0.1
```

From `C:\Users\Administrator`, use Playwright CLI with installed Chrome and a fresh listener/reload at:

```text
http://127.0.0.1:8776/index.html?ci-selftest=1
```

Require title `MK2MD v10.77`, brand `MK2MD`, self-test pass 11/11, failed 0, console/page errors 0, and warnings no greater than 6. Close the browser session, terminate only the exact server cell/process, and confirm port 8776 is no longer listening. If `.playwright-cli` appears inside the repository, stop and ask before deleting it.

- [ ] **Step 6: Protect local files, review, and commit the release metadata**

Compare the seven known untracked paths and SHA-256 values with their pre-task snapshot. Then run:

```powershell
git diff --check -- AGENTS.md README.md index.html
git diff -- AGENTS.md README.md index.html
git add -- AGENTS.md README.md index.html
git diff --cached --check
git diff --cached --name-only
git commit -m "Release v10.77 error aggregation"
```

Expected staged files: exactly `AGENTS.md`, `README.md`, and `index.html`. The workflow, checker files, design/plan docs, and existing untracked files must not appear in this commit.

### Task 3: Final review, push, deploy, and verify the live site

**Files:**
- Verify only; no planned file modifications.

**Interfaces:**
- Consumes: committed v10.77 checker/release and the unchanged existing Pages workflow.
- Produces: local HEAD = `origin/master` = remote master, exact-HEAD Pages run completed/success, and a verified v10.77 live site.

- [ ] **Step 1: Run the complete fresh pre-push verification**

Run:

```powershell
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js
node --check scripts/check-version-consistency.js
node --check scripts/check-version-consistency.test.js
git diff fbe68d9fe969261dc9f0a2200fd590ce676553b1..HEAD --check
git diff --check
git status --short --branch
```

Repeat Task 1's aggregation probe, Task 2's source/workflow/inline-script checks, and a fresh local browser verification. Require 10/10, v10.77 gate, aggregation 3 structure issues/0 guessed mismatches, one inline script, local 11/11/errors 0/warnings <=6, tracked/index clean, seven protected untracked paths only, and port 8776/browser sessions zero.

- [ ] **Step 2: Review exact release scope from the fixed v10.76 base**

Run:

```powershell
git log --oneline --decorate -7
git diff --name-status fbe68d9fe969261dc9f0a2200fd590ce676553b1..HEAD
git diff --stat fbe68d9fe969261dc9f0a2200fd590ce676553b1..HEAD
git diff fbe68d9fe969261dc9f0a2200fd590ce676553b1..HEAD -- .github/workflows/pages.yml PROJECT_RULES.md
```

Expected tracked scope: v10.77 design, plan, two checker files, `AGENTS.md`, `README.md`, and `index.html`. The workflow/PROJECT_RULES diff must be empty; no existing untracked file may appear.

- [ ] **Step 3: Push only existing master and resolve the exact Actions run**

Run:

```powershell
git push origin master
$head = (git rev-parse HEAD).Trim()
$origin = (git rev-parse origin/master).Trim()
if ($head -ne $origin) { throw "HEAD/origin mismatch: $head / $origin" }
$runs = gh run list --workflow pages.yml --branch master --limit 10 --json databaseId,headSha,status,conclusion,url,updatedAt | ConvertFrom-Json
$run = $runs | Where-Object { $_.headSha -eq $head } | Select-Object -First 1
if (-not $run) { throw "No Pages run found for HEAD $head" }
$run | Format-List
```

Do not guess a run id or reuse an older run.

- [ ] **Step 4: Wait for exact-HEAD build/deploy success**

Run in the same PowerShell session, or re-resolve `$run` from the exact current HEAD first:

```powershell
gh run watch $run.databaseId --exit-status
gh run view $run.databaseId --json headSha,status,conclusion,url,updatedAt,jobs
```

Expected: run headSha equals local HEAD, status `completed`, conclusion `success`, and both build and deploy jobs are completed/success. If it fails, report the exact failing job/log and stop; do not rerun, rollback, or modify external state without new approval.

- [ ] **Step 5: Verify cache-busted live source and installed Chrome**

Build the URL from the exact HEAD:

```powershell
$head = (git rev-parse HEAD).Trim()
$liveUrl = "https://green-tea-king.github.io/md-mind-map/?ci-selftest=1&t=$head"
$liveSource = (Invoke-WebRequest -UseBasicParsing $liveUrl).Content
if (-not $liveSource.Contains("const APP_VERSION = '10.77';")) { throw 'Live source is not v10.77.' }
$liveUrl
```

From `C:\Users\Administrator`, open a fresh installed-Chrome Playwright session with fresh console/page-error listeners and reload. Require title `MK2MD v10.77`, brand `MK2MD`, self-test 11/11, failed 0, console/page errors 0, warnings <=6. Close the session and confirm no remaining browsers.

- [ ] **Step 6: Record final evidence and report**

Record final SHA, exact Actions URL/run id/jobs, `updatedAt` converted to Asia/Taipei, live verification time, 10/10 result, aggregation probe result, local/live 11/11 JSON, warning counts, tracked/index status, workflow unchanged evidence, and protected hashes 7/7. Report with the seven required `AGENTS.md` headings and a detailed next-task recommendation. Do not claim deployment until exact-HEAD Actions and the cache-busted live browser both pass.
