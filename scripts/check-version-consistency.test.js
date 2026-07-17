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

if (failed > 0) {
  console.error(`Version consistency tests failed: ${failed}/${passed + failed}.`);
  process.exitCode = 1;
} else {
  console.log(`Version consistency tests passed: ${passed}/${passed}.`);
}
