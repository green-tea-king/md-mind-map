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
