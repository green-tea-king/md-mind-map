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
    deployVersion: [],
    deployCommand: []
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
