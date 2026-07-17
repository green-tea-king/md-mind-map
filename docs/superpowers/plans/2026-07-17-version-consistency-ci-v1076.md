# MK2MD v10.76 Version Consistency CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested, dependency-free version consistency gate to the existing GitHub Pages workflow and release MK2MD v10.76 through the original deployment path.

**Architecture:** A CommonJS Node.js module owns section-bound parsing and validation for `AGENTS.md`, `README.md`, and `index.html`; a separate dependency-free test script exercises its pure public API. The existing Pages workflow runs the tests and then the real repository gate before preparing the single-file artifact and running the existing browser self-test.

**Tech Stack:** Node.js built-in modules (`fs`, `path`, `assert`), GitHub Actions YAML, single-file HTML/JavaScript, PowerShell, installed Chrome/Playwright CLI, GitHub CLI.

## Global Constraints

- Work only in the current MK2MD project folder; do not create a project, move files, create a worktree, or change deployment platform.
- Release version is exactly `v10.76`; release date is exactly `2026-07-17`.
- `AGENTS.md` first-paragraph baseline is the only canonical current version/date source.
- Do not modify UI behavior, data format, `PROJECT_RULES.md`, old Changelog entries, historical filenames, or the seven existing untracked files.
- Do not add `package.json`, npm dependencies, external runtime dependencies, a PR workflow, or another Pages artifact file.
- The published artifact remains exactly `index.html` plus `.nojekyll`.
- Stage every commit with an explicit allowlist; never use `git add .`.
- Push only the existing `origin/master` after all local verification passes.
- Do not delete any file or generated artifact without explicit user confirmation.

---

## File Structure

- Create `scripts/check-version-consistency.js`: pure validation API plus read-only CLI entrypoint.
- Create `scripts/check-version-consistency.test.js`: dependency-free unit/contract tests using in-memory fixtures.
- Modify `.github/workflows/pages.yml`: run test and repository gate before `Prepare single-file site`.
- Modify `AGENTS.md`: synchronize the v10.76 baseline and record the executable gate in required verification.
- Modify `README.md`: synchronize Current Version/date/deploy example and describe the new gate.
- Modify `index.html`: synchronize every required v10.76 source and add the newest Changelog entry without changing runtime behavior.

### Task 1: Build the dependency-free version consistency checker

**Files:**
- Create: `scripts/check-version-consistency.test.js`
- Create: `scripts/check-version-consistency.js`

**Interfaces:**
- Consumes: `{ agentsText: string, readmeText: string, indexText: string }`.
- Produces: `validateVersionConsistency(sources): { ok: boolean, version: string, date: string, issues: Array<{ field: string, expected: string, actual: string }> }`.
- CLI: `node scripts/check-version-consistency.js [root-directory]`; default root is `process.cwd()`.

- [ ] **Step 1: Write the failing test before the implementation exists**

Create `scripts/check-version-consistency.test.js` with the complete test harness and fixtures below:

```js
'use strict';

const assert = require('node:assert/strict');
const { validateVersionConsistency } = require('./check-version-consistency');

function consistentSources() {
  return {
    agentsText: [
      '# MK2MD 專案維護規範',
      '',
      '本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.76`（`2026-07-17`）。預設使用台灣繁體中文協作。'
    ].join('\n'),
    readmeText: [
      '# MK2MD',
      '',
      '## Current Version',
      '',
      '- Version: `v10.76`',
      '- Date: `2026-07-17`',
      '- Tracked app file: `index.html`',
      '',
      '## Deployment',
      '',
      '```powershell',
      '.\\deploy.ps1 -Message "Deploy v10.76"',
      '```',
      '',
      '## Local Files'
    ].join('\n'),
    indexText: [
      '<!DOCTYPE html>',
      '<!--',
      '  Version: v10.76',
      '  Last updated: 2026-07-17',
      '  修改紀錄 Changelog(最新在最上):',
      '  - 2026-07-17 v10.76：加入版本一致性 CI 防呆。',
      '  - 2026-07-17 v10.75：舊版歷史必須保留且不應誤判。',
      '-->',
      '<script>',
      "const APP_VERSION = '10.76';",
      "const APP_DATE = '2026-07-17';",
      "const APP_TITLE = APP_NAME + ' v' + APP_VERSION;",
      'const brandOk = true',
      "  && APP_VERSION === '10.76'",
      "  && APP_DATE === '2026-07-17'",
      "  && APP_TITLE === 'MK2MD v10.76';",
      '</script>'
    ].join('\n')
  };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
  }
}

function issueFor(result, field) {
  return result.issues.find((issue) => issue.field === field);
}

test('accepts a consistent current version while ignoring older Changelog entries', () => {
  const result = validateVersionConsistency(consistentSources());
  assert.equal(result.ok, true);
  assert.equal(result.version, '10.76');
  assert.equal(result.date, '2026-07-17');
  assert.deepEqual(result.issues, []);
});

test('rejects markup inserted between the DOCTYPE and header comment', () => {
  const sources = consistentSources();
  sources.indexText = sources.indexText.replace('<!DOCTYPE html>\n<!--', '<!DOCTYPE html>\n<div></div>\n<!--');
  const result = validateVersionConsistency(sources);
  assert.equal(result.ok, false);
  assert.deepEqual(issueFor(result, 'index.html header comment'), {
    field: 'index.html header comment',
    expected: 'exactly 1 header comment immediately after the leading DOCTYPE',
    actual: '0 matches'
  });
});

test('reports an APP_VERSION mismatch', () => {
  const sources = consistentSources();
  sources.indexText = sources.indexText.replace("const APP_VERSION = '10.76';", "const APP_VERSION = '10.75';");
  const result = validateVersionConsistency(sources);
  assert.equal(result.ok, false);
  assert.deepEqual(issueFor(result, 'index.html APP_VERSION'), {
    field: 'index.html APP_VERSION',
    expected: '10.76',
    actual: '10.75'
  });
});

test('reports a README Current Version mismatch', () => {
  const sources = consistentSources();
  sources.readmeText = sources.readmeText.replace('- Version: `v10.76`', '- Version: `v10.75`');
  const result = validateVersionConsistency(sources);
  assert.equal(result.ok, false);
  assert.equal(issueFor(result, 'README Current Version').actual, '10.75');
});

test('reports a newest Changelog mismatch without reading old history as current', () => {
  const sources = consistentSources();
  sources.indexText = sources.indexText.replace('2026-07-17 v10.76：加入', '2026-07-17 v10.74：加入');
  const result = validateVersionConsistency(sources);
  assert.equal(result.ok, false);
  assert.equal(issueFor(result, 'index.html newest Changelog version').actual, '10.74');
});

test('reports a brand self-test title mismatch', () => {
  const sources = consistentSources();
  sources.indexText = sources.indexText.replace("APP_TITLE === 'MK2MD v10.76'", "APP_TITLE === 'MK2MD v10.75'");
  const result = validateVersionConsistency(sources);
  assert.equal(result.ok, false);
  assert.equal(issueFor(result, 'index.html brand self-test APP_TITLE').actual, 'MK2MD v10.75');
});

test('reports a missing current field as a structure error', () => {
  const sources = consistentSources();
  sources.indexText = sources.indexText.replace("const APP_DATE = '2026-07-17';\n", '');
  const result = validateVersionConsistency(sources);
  assert.equal(result.ok, false);
  assert.match(issueFor(result, 'index.html APP_DATE').actual, /0 matches/);
});

test('reports a duplicated current field as a structure error', () => {
  const sources = consistentSources();
  sources.readmeText = sources.readmeText.replace(
    '- Version: `v10.76`',
    '- Version: `v10.76`\n- Version: `v10.76`'
  );
  const result = validateVersionConsistency(sources);
  assert.equal(result.ok, false);
  assert.match(issueFor(result, 'README Current Version').actual, /2 matches/);
});

if (failed > 0) {
  console.error(`Version consistency tests failed: ${failed}/${passed + failed}.`);
  process.exitCode = 1;
} else {
  console.log(`Version consistency tests passed: ${passed}/${passed}.`);
}
```

- [ ] **Step 2: Run the test and verify the expected RED failure**

Run:

```powershell
node scripts/check-version-consistency.test.js
```

Expected: exit code 1 with `MODULE_NOT_FOUND` for `./check-version-consistency`. If the failure is a syntax error in the test, fix the test and rerun until the missing implementation is the only reason.

- [ ] **Step 3: Implement the minimal checker**

Create `scripts/check-version-consistency.js`:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function captureExactly(text, regex, field, issues) {
  const matches = Array.from(text.matchAll(regex));
  if (matches.length !== 1) {
    issues.push({
      field,
      expected: 'exactly 1 current field',
      actual: `${matches.length} matches`
    });
    return null;
  }
  return matches[0].slice(1);
}

function markdownSection(text, heading, field, issues) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = Array.from(text.matchAll(new RegExp(`^## ${escaped}\\s*$`, 'gm')));
  if (matches.length !== 1) {
    issues.push({
      field,
      expected: 'exactly 1 section',
      actual: `${matches.length} matches`
    });
    return null;
  }
  const rest = text.slice(matches[0].index + matches[0][0].length);
  const nextHeading = rest.search(/^##\s/m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function compare(issues, field, actual, expected) {
  if (actual !== null && actual !== expected) {
    issues.push({ field, expected, actual });
  }
}

function validateVersionConsistency({ agentsText, readmeText, indexText }) {
  const issues = [];
  const baseline = captureExactly(
    agentsText,
    /^本規範是.*基準版本為 `v([^`]+)`（`(\d{4}-\d{2}-\d{2})`）。.*$/gm,
    'AGENTS.md baseline',
    issues
  );

  if (!baseline) {
    return { ok: false, version: '', date: '', issues };
  }

  const [version, date] = baseline;
  const headerMatches = Array.from(indexText.matchAll(/^\s*<!DOCTYPE html>\s*<!--([\s\S]*?)-->/gi));
  let header = null;
  if (headerMatches.length !== 1) {
    issues.push({
      field: 'index.html header comment',
      expected: 'exactly 1 header comment immediately after the leading DOCTYPE',
      actual: `${headerMatches.length} matches`
    });
  } else {
    header = headerMatches[0][1];
  }

  if (header !== null) {
    const headerVersion = captureExactly(header, /^\s*Version:\s*v([^\s]+)\s*$/gm, 'index.html header Version', issues);
    const headerDate = captureExactly(header, /^\s*Last updated:\s*(\d{4}-\d{2}-\d{2})\s*$/gm, 'index.html header Last updated', issues);
    const changelog = captureExactly(
      header,
      /修改紀錄 Changelog\(最新在最上\):\s*\r?\n\s*-\s*(\d{4}-\d{2}-\d{2})\s+v([^：\s]+)：/gm,
      'index.html newest Changelog',
      issues
    );
    compare(issues, 'index.html header Version', headerVersion && headerVersion[0], version);
    compare(issues, 'index.html header Last updated', headerDate && headerDate[0], date);
    if (changelog) {
      compare(issues, 'index.html newest Changelog date', changelog[0], date);
      compare(issues, 'index.html newest Changelog version', changelog[1], version);
    }
  }

  const appVersion = captureExactly(indexText, /^const APP_VERSION = '([^']+)';$/gm, 'index.html APP_VERSION', issues);
  const appDate = captureExactly(indexText, /^const APP_DATE = '([^']+)';$/gm, 'index.html APP_DATE', issues);
  const selfVersion = captureExactly(indexText, /&& APP_VERSION === '([^']+)'/g, 'index.html brand self-test APP_VERSION', issues);
  const selfDate = captureExactly(indexText, /&& APP_DATE === '([^']+)'/g, 'index.html brand self-test APP_DATE', issues);
  const selfTitle = captureExactly(indexText, /&& APP_TITLE === '([^']+)'/g, 'index.html brand self-test APP_TITLE', issues);
  compare(issues, 'index.html APP_VERSION', appVersion && appVersion[0], version);
  compare(issues, 'index.html APP_DATE', appDate && appDate[0], date);
  compare(issues, 'index.html brand self-test APP_VERSION', selfVersion && selfVersion[0], version);
  compare(issues, 'index.html brand self-test APP_DATE', selfDate && selfDate[0], date);
  compare(issues, 'index.html brand self-test APP_TITLE', selfTitle && selfTitle[0], `MK2MD v${version}`);

  const currentVersion = markdownSection(readmeText, 'Current Version', 'README Current Version section', issues);
  if (currentVersion !== null) {
    const readmeVersion = captureExactly(currentVersion, /^- Version: `v([^`]+)`\s*$/gm, 'README Current Version', issues);
    const readmeDate = captureExactly(currentVersion, /^- Date: `(\d{4}-\d{2}-\d{2})`\s*$/gm, 'README Current Date', issues);
    compare(issues, 'README Current Version', readmeVersion && readmeVersion[0], version);
    compare(issues, 'README Current Date', readmeDate && readmeDate[0], date);
  }

  const deployment = markdownSection(readmeText, 'Deployment', 'README Deployment section', issues);
  if (deployment !== null) {
    const deployVersion = captureExactly(
      deployment,
      /^\.\\deploy\.ps1 -Message "Deploy v([^"]+)"\s*$/gm,
      'README deploy example',
      issues
    );
    compare(issues, 'README deploy example', deployVersion && deployVersion[0], version);
  }

  return { ok: issues.length === 0, version, date, issues };
}

function readSources(rootDirectory) {
  return {
    agentsText: fs.readFileSync(path.join(rootDirectory, 'AGENTS.md'), 'utf8'),
    readmeText: fs.readFileSync(path.join(rootDirectory, 'README.md'), 'utf8'),
    indexText: fs.readFileSync(path.join(rootDirectory, 'index.html'), 'utf8')
  };
}

function runCli(argv = process.argv.slice(2)) {
  const rootDirectory = path.resolve(argv[0] || process.cwd());
  try {
    const result = validateVersionConsistency(readSources(rootDirectory));
    if (!result.ok) {
      console.error(`Version consistency gate failed: ${result.issues.length} issue(s).`);
      for (const issue of result.issues) {
        console.error(`- ${issue.field}: expected ${issue.expected}; actual ${issue.actual}`);
      }
      process.exitCode = 1;
      return result;
    }
    console.log(`Version consistency gate passed: v${result.version} (${result.date}).`);
    return result;
  } catch (error) {
    console.error(`Version consistency gate error: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = { validateVersionConsistency, runCli };
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js
```

Expected before the v10.76 release sync:

- Tests: `Version consistency tests passed: 8/8.`
- Real repository gate: `Version consistency gate passed: v10.75 (2026-07-17).`

- [ ] **Step 5: Run a mutation probe without writing files**

Run:

```powershell
@'
const fs = require('node:fs');
const { validateVersionConsistency } = require('./scripts/check-version-consistency');
const sources = {
  agentsText: fs.readFileSync('AGENTS.md', 'utf8'),
  readmeText: fs.readFileSync('README.md', 'utf8'),
  indexText: fs.readFileSync('index.html', 'utf8').replace("const APP_VERSION = '10.75';", "const APP_VERSION = '0.00';")
};
const result = validateVersionConsistency(sources);
if (result.ok || !result.issues.some((issue) => issue.field === 'index.html APP_VERSION' && issue.actual === '0.00')) {
  throw new Error('Mutation probe did not detect the APP_VERSION mismatch.');
}
console.log('Mutation probe passed: APP_VERSION mismatch detected.');
'@ | node -
```

Expected: `Mutation probe passed: APP_VERSION mismatch detected.` with no project file writes.

- [ ] **Step 6: Review and commit only the checker files**

Run:

```powershell
git diff --check -- scripts/check-version-consistency.js scripts/check-version-consistency.test.js
git add -- scripts/check-version-consistency.js scripts/check-version-consistency.test.js
git diff --cached --check
git diff --cached --name-only
git commit -m "Add tested version consistency gate"
```

Expected staged files: exactly the two `scripts/` files. Commit must succeed without staging any existing untracked file.

### Task 2: Wire the gate into Pages and release v10.76

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `index.html`

**Interfaces:**
- Consumes: `node scripts/check-version-consistency.test.js` and `node scripts/check-version-consistency.js` from Task 1.
- Produces: a `build` job that cannot prepare/upload the Pages artifact until both version commands pass; all designated sources resolve to v10.76/2026-07-17.

- [ ] **Step 1: Run the workflow contract probe and verify RED**

Run before changing the workflow:

```powershell
@'
const fs = require('node:fs');
const workflow = fs.readFileSync('.github/workflows/pages.yml', 'utf8');
const required = [
  'name: Test version consistency gate',
  'node scripts/check-version-consistency.test.js',
  'name: Check repository version consistency',
  'node scripts/check-version-consistency.js'
];
const missing = required.filter((text) => !workflow.includes(text));
if (missing.length) {
  console.error(`Expected RED: workflow is missing ${missing.length} version-gate contract item(s).`);
  process.exit(1);
}
'@ | node -
```

Expected: exit code 1 and `Expected RED: workflow is missing 4 version-gate contract item(s).`

- [ ] **Step 2: Add the two gate steps before site preparation**

Insert the following immediately after Checkout and before `Prepare single-file site` in `.github/workflows/pages.yml`:

```yaml
      - name: Test version consistency gate
        run: node scripts/check-version-consistency.test.js

      - name: Check repository version consistency
        run: node scripts/check-version-consistency.js
```

Do not change triggers, permissions, concurrency, browser self-test, artifact contents, deploy job, or pinned action SHAs.

- [ ] **Step 3: Synchronize all v10.76 version locations**

Apply these exact content changes:

`AGENTS.md`:

```markdown
本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.76`（`2026-07-17`）。預設使用台灣繁體中文協作。
```

Add this required-verification bullet after the Node `vm.Script` bullet:

```markdown
- 執行 `node scripts/check-version-consistency.test.js` 與 `node scripts/check-version-consistency.js`；測試與實際 repository gate 都必須通過。
```

`README.md`:

```markdown
- Version: `v10.76`
- Date: `2026-07-17`
```

Change the deployment description to state that version consistency runs before the browser gate:

```markdown
GitHub Pages 只發布建置目錄中的 `index.html` 與 `.nojekyll`，不會把維護用的 README、PROJECT_RULES 或備份檔放進網站。發布前會先執行版本一致性檢查，再用無頭 Chrome 執行完整 11 組自檢；任一檢查失敗就停止部署。
```

Change the local deployment example to:

```powershell
.\deploy.ps1 -Message "Deploy v10.76"
```

`index.html`:

```text
Version: v10.76
Last updated: 2026-07-17
```

Insert only this new Changelog item above v10.75:

```text
- 2026-07-17 v10.76：加入版本一致性 CI 防呆；部署前自動檢查 AGENTS、README、index 檔頭、執行期常數、最新 Changelog 與品牌自我測試版號。
```

Update the runtime and brand self-test expectations to exactly:

```js
const APP_VERSION = '10.76';
const APP_DATE = '2026-07-17';
```

```js
      && APP_VERSION === '10.76'
      && APP_DATE === '2026-07-17'
      && APP_TITLE === 'MK2MD v10.76'
```

- [ ] **Step 4: Verify workflow order and v10.76 consistency GREEN**

Run:

```powershell
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
console.log('Workflow order passed: version tests -> repository gate -> prepare -> browser -> upload.');
'@ | node -
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js
```

Expected:

- Workflow order message passes.
- Unit/contract tests pass 8/8.
- Repository gate prints `Version consistency gate passed: v10.76 (2026-07-17).`

- [ ] **Step 5: Verify script syntax and the unchanged app script**

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
```

Expected: all three syntax checks exit 0 and the app check reports exactly 1 inline script.

- [ ] **Step 6: Run local browser verification**

Start a foreground local HTTP server from the repository and keep its exec cell id:

```powershell
python -m http.server 8776 --bind 127.0.0.1
```

From `C:\Users\Administrator`, open installed Chrome through Playwright CLI at:

```text
http://127.0.0.1:8776/index.html?ci-selftest=1
```

Verify through a fresh page listener/reload that:

- title is `MK2MD v10.76`;
- `#brandName` is `MK2MD`;
- `data-ci-self-test` is `pass` and the complete result is 11/11;
- passed is `11` and failed is `0`;
- console errors and page errors are empty;
- warning count is no greater than 6.

Close the Playwright session, terminate only the exact server cell/process, and confirm port 8776 is no longer listening. If `.playwright-cli` is accidentally created inside the repository, stop and ask the user before deleting it.

- [ ] **Step 7: Protect local files, review, and commit the release changes**

Before staging, compare the seven known untracked files with their pre-task names/hashes and verify none changed. Then run:

```powershell
git diff --check -- .github/workflows/pages.yml AGENTS.md README.md index.html
git diff -- .github/workflows/pages.yml AGENTS.md README.md index.html
git add -- .github/workflows/pages.yml AGENTS.md README.md index.html
git diff --cached --check
git diff --cached --name-only
git commit -m "Gate v10.76 deployment on version consistency"
```

Expected staged files: exactly `.github/workflows/pages.yml`, `AGENTS.md`, `README.md`, and `index.html`.

### Task 3: Final review, push, deployment, and live verification

**Files:**
- Verify only; no planned file changes.

**Interfaces:**
- Consumes: committed v10.76 gate and the existing `Deploy GitHub Pages` workflow.
- Produces: `origin/master` at the local HEAD, a `completed/success` Pages run for that exact SHA, and a verified v10.76 live site.

- [ ] **Step 1: Run the complete fresh pre-push verification**

Run from the repository:

```powershell
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js
node --check scripts/check-version-consistency.js
node --check scripts/check-version-consistency.test.js
git diff HEAD~2..HEAD --check
git status --short --branch
```

Also repeat the Task 2 inline-app syntax check and local browser check. Confirm tracked files are clean and only the original seven untracked files remain.

- [ ] **Step 2: Review exact release scope**

Run:

```powershell
git log --oneline --decorate -6
git diff --name-only f2d23cb..HEAD
git diff --stat f2d23cb..HEAD
git diff f2d23cb..HEAD -- .github/workflows/pages.yml AGENTS.md README.md index.html scripts/check-version-consistency.js scripts/check-version-consistency.test.js
```

Expected implementation scope: two new scripts plus the workflow and three v10.76 sources. Design and plan documents are the only additional documentation commits. No protected local file appears.

- [ ] **Step 3: Push only existing master and identify the exact Actions run**

Run:

```powershell
git push origin master
git rev-parse HEAD
git rev-parse origin/master
gh run list --workflow pages.yml --branch master --limit 10 --json databaseId,headSha,status,conclusion,url,updatedAt
```

Expected: local HEAD equals `origin/master`. Select only the workflow run whose `headSha` equals that exact HEAD.

- [ ] **Step 4: Wait for deployment completion**

Resolve the exact database id from the current HEAD and wait for that run:

```powershell
$head = (git rev-parse HEAD).Trim()
$runs = gh run list --workflow pages.yml --branch master --limit 10 --json databaseId,headSha,status,conclusion,url,updatedAt | ConvertFrom-Json
$run = $runs | Where-Object { $_.headSha -eq $head } | Select-Object -First 1
if (-not $run) { throw "No Pages run found for HEAD $head" }
gh run watch $run.databaseId --exit-status
gh run view $run.databaseId --json headSha,status,conclusion,url,updatedAt,jobs
```

Expected: `headSha` equals local HEAD, `status` is `completed`, `conclusion` is `success`, and both `build` and `deploy` succeed. Do not guess or reuse an older run.

- [ ] **Step 5: Verify the live source and browser with a cache buster**

Build a cache-busted live URL from the exact HEAD and fetch it:

```powershell
$head = (git rev-parse HEAD).Trim()
$liveUrl = "https://green-tea-king.github.io/md-mind-map/?ci-selftest=1&t=$head"
$liveSource = (Invoke-WebRequest -UseBasicParsing $liveUrl).Content
if (-not $liveSource.Contains("const APP_VERSION = '10.76';")) { throw 'Live source is not v10.76.' }
$liveUrl
```

Verify live source contains v10.76 header/runtime/self-test sources, then use a fresh Playwright installed-Chrome session from `C:\Users\Administrator` and verify:

- title `MK2MD v10.76`;
- brand `MK2MD`;
- self-test `pass`, passed `11`, failed `0`;
- zero console errors and zero page errors;
- warnings no greater than 6.

Close the browser session and confirm Playwright reports no remaining browser sessions.

- [ ] **Step 6: Record final evidence and report**

Record the final SHA, Actions URL, `updatedAt` converted to Asia/Taipei, live verification time, test counts, warning count, tracked status, and unchanged untracked-file evidence. Report in Taiwan Traditional Chinese using the seven required headings from `AGENTS.md`, followed by a detailed next-task recommendation. Do not claim deployment until the exact run and cache-busted live browser checks both pass.
