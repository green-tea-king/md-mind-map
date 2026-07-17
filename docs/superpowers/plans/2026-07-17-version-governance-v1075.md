# MK2MD v10.75 Version Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 MK2MD 的版本規則與所有版本來源統一為 v10.75，完整驗證後部署回既有 GitHub Pages。

**Architecture:** `AGENTS.md` 是版本規則與同步清單的唯一工程入口；README 只保留快速版本與部署資訊；`index.html` 繼續承載產品版本、Changelog 與品牌自我測試。先用靜態版本契約重現 v10.74 的 RED，再以三檔最小修改達成 GREEN，最後用既有 Pages workflow 與 live browser 驗證同一 SHA。

**Tech Stack:** Markdown、單檔 HTML/CSS/JavaScript、Node.js `vm.Script`、Python HTTP server、installed Google Chrome、Playwright CLI、Git、GitHub CLI、GitHub Actions、GitHub Pages。

## Global Constraints

- 只在 `W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD` 工作；不建立新 project、worktree、branch、repository、Pages site 或部署平台。
- 不刪除、搬移、改名、清空或清理任何檔案、資料、設定、歷史、部署資源或本機未追蹤檔。
- release 版本固定為 `v10.75`，日期固定為 `2026-07-17`，品牌固定為 `MK2MD`。
- release tracked diff 只允許 `AGENTS.md`、`README.md`、`index.html`。
- 不修改 `.github/workflows/pages.yml`、`PROJECT_RULES.md`、`.nojekyll`、`deploy.ps1`、`agent.md`、`design.md` 或產品功能。
- 不修改 `APP_NAME`、DEFAULT_MARKDOWN、UI、資料模型、匯入／匯出、sanitize 或其他測試行為。
- 不新增依賴、測試群組、build system 或 CI 版本一致性 gate。
- staging 使用明確 allowlist，禁止 `git add .`；不 force push、不自動 rollback。
- 七個既有 untracked 檔案必須保持原路徑與 SHA-256。
- 原平台固定為 `green-tea-king/md-mind-map` 的 `master` 與 `https://green-tea-king.github.io/md-mind-map/`。

---

### Task 1: 建立 v10.75 基準與版本治理 RED

**Files:**
- Inspect: `AGENTS.md`
- Inspect: `README.md`
- Inspect: `index.html`
- Inspect: `.github/workflows/pages.yml`
- Inspect: `PROJECT_RULES.md`

**Interfaces:**
- Consumes: HEAD `98b1b44` 的已核准 v10.75 設計規格與目前 v10.74 release。
- Produces: 可重現的版本治理 RED、protected hashes 與七個 untracked baseline；本 Task 不修改檔案、不 commit。

- [ ] **Step 1: 確認 Git 基準與既有未追蹤檔**

Run from `C:\Users\Administrator`:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
git $gitDir $workTree status --short --branch
git $gitDir $workTree rev-parse HEAD
git $gitDir $workTree rev-parse origin/master
git $gitDir $workTree diff --name-only
git $gitDir $workTree diff --cached --name-only
git $gitDir $workTree log -3 --oneline
```

Expected:

- HEAD 包含設計與本計畫文件 commit，並比 `origin/master` ahead。
- tracked staged／unstaged 都是 0。
- 只有原七個 untracked：`BACKUP_MANIFEST.md`、`MD心智圖_v10_00.html`、`agent.md`、`clear-auto-draft.html`、`deploy.ps1`、`design.md`、`repository-history.bundle`。

- [ ] **Step 2: 驗證 protected 與七個 untracked baseline**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
$expected = @{
  'BACKUP_MANIFEST.md' = '7C017FCE631B948ECD402FC8616C6F37E0B7EF79AEF11A4022ED24B644B3EB03'
  'MD心智圖_v10_00.html' = 'EF01E21DCB43D5999F4FC2CFFB023E36BF84F8EEC49A5682340E60B3CBA92173'
  'agent.md' = '4C696CE09351809F3640164E161C7E4BF621AB652EBE56B6D2A15F2FEB46FFE8'
  'clear-auto-draft.html' = '61D5FB45AB927543806F4D1756FB3EEA5EBC7EE54DDB324BCEFE0312A181A7CE'
  'deploy.ps1' = 'DE7628ADEC12B67B48BCEB3AAAB650F79991848FD0998E400ACD6788509A92A5'
  'design.md' = '9BDF6A9A4DA7946466BF2229C6FE11D91A7EF0B056C97BBC55395DA5AB433B64'
  'repository-history.bundle' = 'D13703A7940F86235E4FDE2094BED50F649B578984B154C1E3F73E7C0C025385'
}
$paths = @(git -c core.quotepath=false $gitDir $workTree ls-files --others --exclude-standard)
$mismatches = @($paths | Where-Object {
  -not $expected.ContainsKey($_) -or
  (Get-FileHash -LiteralPath (Join-Path $repo $_) -Algorithm SHA256).Hash -ne $expected[$_]
})
if($paths.Count -ne 7 -or $mismatches.Count){
  throw "Untracked mismatch: count=$($paths.Count); $($mismatches -join ',')"
}
git $gitDir $workTree diff --exit-code -- PROJECT_RULES.md .github/workflows/pages.yml
git $gitDir $workTree diff --exit-code origin/master..HEAD -- PROJECT_RULES.md .github/workflows/pages.yml
'protected files and seven untracked: unchanged'
```

Expected: `protected files and seven untracked: unchanged`。

- [ ] **Step 3: 執行 v10.75 版本治理 RED**

Run from the repository root:

```powershell
$governance = @'
const fs=require('fs');const a=fs.readFileSync('AGENTS.md','utf8'),h=fs.readFileSync('index.html','utf8'),r=fs.readFileSync('README.md','utf8');const firstBodyParagraph=s=>{const lines=s.replace(/^\uFEFF/,'').split(/\r?\n/);let i=0;while(i<lines.length&&(/^\s*$/.test(lines[i])||/^\s*#/.test(lines[i])))i++;const out=[];while(i<lines.length&&!/^\s*$/.test(lines[i]))out.push(lines[i++]);return out.join('\n')};const section=(s,re)=>(s.match(re)||[])[0]||'';const aFirst=firstBodyParagraph(a),a6=section(a,/^## 6\. 版本規則[^\S\r\n]*\r?\n[\s\S]*?(?=^## 7\.)/m),rv=section(r,/^## Current Version[^\S\r\n]*\r?\n[\s\S]*?(?=^## Main Features[^\S\r\n]*\r?$)/m),rd=section(r,/^## Deployment[^\S\r\n]*\r?\n[\s\S]*?(?=^## Local Files[^\S\r\n]*\r?$)/m),headerStart=h.indexOf('<!--'),headerEnd=h.indexOf('-->',headerStart),header=headerStart>=0&&headerEnd>=0?h.slice(headerStart,headerEnd+3):'',marker='修改紀錄 Changelog(最新在最上):',markerAt=header.indexOf(marker),after=markerAt>=0?header.slice(markerAt+marker.length):'',latest=((after.match(/^[ \t]*-[ \t]+([^\r\n]*)/m)||[])[1]||'');const checks=[['AGENTS baseline',aFirst==='本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.75`（`2026-07-17`）。預設使用台灣繁體中文協作。'],['AGENTS self sync',/^\s*1\. `AGENTS\.md` 首段基準版本與日期。$/m.test(a6)],['AGENTS test version sync',/^\s*5\. 品牌自我測試內的 `APP_VERSION === '<current>'` 預期值。$/m.test(a6)],['AGENTS test title sync',/^\s*6\. 品牌自我測試內的 `APP_TITLE === 'MK2MD v<current>'` 預期值。$/m.test(a6)],['header version',/^[ \t]*Version: v10\.75[ \t]*$/m.test(header)],['header rule',/^[ \t]*版次規則以根目錄 `AGENTS\.md` 為準。畫面左上角會顯示目前版次與日期。[ \t]*$/m.test(header)],['old header removed',!/小改 \+0\.1,大改 \+1\.0/.test(header)],['changelog',/^2026-07-17 v10\.75：/.test(latest)],['runtime version',/^const APP_VERSION = '10\.75';$/m.test(h)],['test version',/^[ \t]*&& APP_VERSION === '10\.75'$/m.test(h)],['test title',/^[ \t]*&& APP_TITLE === 'MK2MD v10\.75'$/m.test(h)],['README version',/^- Version: `v10\.75`$/m.test(rv)&&/^- Date: `2026-07-17`$/m.test(rv)],['README deploy',/^\.\\deploy\.ps1 -Message "Deploy v10\.75"$/m.test(rd)]];const failed=checks.filter(([,ok])=>!ok).map(([name])=>name);if(failed.length)throw new Error('v10.75 governance missing: '+failed.join(', '));console.log('v10.75 governance contract: '+checks.length+'/'+checks.length+' passed');
'@
node -e $governance
```

Expected: exit code 1，錯誤包含 `v10.75 governance missing:`，並列出目前尚未實作的 v10.75 baseline、完整同步清單、header rule、版本來源與 README 項目。若因路徑、編碼或 JavaScript 語法失敗，先修正測試指令再重跑；不可把非需求失敗當 RED。

- [ ] **Step 4: 確認 Task 1 無檔案變更**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
git $gitDir $workTree diff --name-only
git $gitDir $workTree diff --cached --name-only
git $gitDir $workTree status --short
```

Expected: tracked diff 為空；七個 untracked 與 Task 開始時相同。本 Task 不 commit。

---

### Task 2: 實作 v10.75 版本治理並完成本機 GREEN

**Files:**
- Modify: `AGENTS.md:1-75`
- Modify: `README.md:10-46`
- Modify: `index.html:2-30,727-731,5375-5382`

**Interfaces:**
- Consumes: Task 1 的 v10.75 RED 與 protected/untracked baseline。
- Produces: 單一 v10.75 release commit；所有本機靜態與瀏覽器 gate 通過，供 Task 3 部署。

- [ ] **Step 1: 更新 `AGENTS.md` 基準版本與同步清單**

Use `apply_patch` to change the first paragraph to:

```markdown
本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.75`（`2026-07-17`）。預設使用台灣繁體中文協作。
```

Replace the current four-item list under `每次版本至少同步：` with exactly:

```markdown
每次版本至少同步：

1. `AGENTS.md` 首段基準版本與日期。
2. `index.html` 檔頭 Version 與 Last updated。
3. `APP_VERSION` 與 `APP_DATE`。
4. 最新 Changelog 項目。
5. 品牌自我測試內的 `APP_VERSION === '<current>'` 預期值。
6. 品牌自我測試內的 `APP_TITLE === 'MK2MD v<current>'` 預期值。
7. README Current Version、日期與部署範例。
```

Do not change any other AGENTS section.

- [ ] **Step 2: 更新 README v10.75 快速資訊**

Use `apply_patch` for only these replacements:

```diff
- Version: `v10.74`
+ Version: `v10.75`
```

```diff
- .\deploy.ps1 -Message "Deploy v10.74"
+ .\deploy.ps1 -Message "Deploy v10.75"
```

Keep `Date: 2026-07-17` and every other README line unchanged.

- [ ] **Step 3: 更新 `index.html` 檔頭規則、版本與 Changelog**

Use `apply_patch` to replace the maintenance header instructions with:

```text
  ⚠ 維護規範(任何人或 AI 接手修改本檔,都必須遵守):
     每次修改完成後,務必依根目錄 `AGENTS.md` 的版本規則與完整同步清單更新所有版本來源。
     本檔至少包含 Version / Last updated、APP_VERSION / APP_DATE、最新 Changelog 與品牌自我測試版本預期值。
     版次規則以根目錄 `AGENTS.md` 為準。畫面左上角會顯示目前版次與日期。
```

Change the header version and add this newest Changelog line:

```diff
-  Version: v10.74
+  Version: v10.75
```

```text
  - 2026-07-17 v10.75：統一版本維護規則；index.html 檔頭改以 AGENTS.md 為準，AGENTS 補齊自身與品牌自我測試的版本同步位置。
```

Keep `Last updated: 2026-07-17` and all older Changelog entries unchanged.

- [ ] **Step 4: 更新執行期版本與兩個自我測試預期值**

Use `apply_patch` for exactly:

```diff
-const APP_VERSION = '10.74';
+const APP_VERSION = '10.75';
```

```diff
-      && APP_VERSION === '10.74'
+      && APP_VERSION === '10.75'
```

```diff
-      && APP_TITLE === 'MK2MD v10.74'
+      && APP_TITLE === 'MK2MD v10.75'
```

Keep `APP_NAME = 'MK2MD'` and `APP_DATE = '2026-07-17'` unchanged.

- [ ] **Step 5: 執行 v10.75 版本治理 GREEN**

Run from the repository root:

```powershell
$governance = @'
const fs=require('fs');const a=fs.readFileSync('AGENTS.md','utf8'),h=fs.readFileSync('index.html','utf8'),r=fs.readFileSync('README.md','utf8');const firstBodyParagraph=s=>{const lines=s.replace(/^\uFEFF/,'').split(/\r?\n/);let i=0;while(i<lines.length&&(/^\s*$/.test(lines[i])||/^\s*#/.test(lines[i])))i++;const out=[];while(i<lines.length&&!/^\s*$/.test(lines[i]))out.push(lines[i++]);return out.join('\n')};const section=(s,re)=>(s.match(re)||[])[0]||'';const aFirst=firstBodyParagraph(a),a6=section(a,/^## 6\. 版本規則[^\S\r\n]*\r?\n[\s\S]*?(?=^## 7\.)/m),rv=section(r,/^## Current Version[^\S\r\n]*\r?\n[\s\S]*?(?=^## Main Features[^\S\r\n]*\r?$)/m),rd=section(r,/^## Deployment[^\S\r\n]*\r?\n[\s\S]*?(?=^## Local Files[^\S\r\n]*\r?$)/m),headerStart=h.indexOf('<!--'),headerEnd=h.indexOf('-->',headerStart),header=headerStart>=0&&headerEnd>=0?h.slice(headerStart,headerEnd+3):'',marker='修改紀錄 Changelog(最新在最上):',markerAt=header.indexOf(marker),after=markerAt>=0?header.slice(markerAt+marker.length):'',latest=((after.match(/^[ \t]*-[ \t]+([^\r\n]*)/m)||[])[1]||'');const checks=[['AGENTS baseline',aFirst==='本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.75`（`2026-07-17`）。預設使用台灣繁體中文協作。'],['AGENTS self sync',/^\s*1\. `AGENTS\.md` 首段基準版本與日期。$/m.test(a6)],['AGENTS test version sync',/^\s*5\. 品牌自我測試內的 `APP_VERSION === '<current>'` 預期值。$/m.test(a6)],['AGENTS test title sync',/^\s*6\. 品牌自我測試內的 `APP_TITLE === 'MK2MD v<current>'` 預期值。$/m.test(a6)],['header version',/^[ \t]*Version: v10\.75[ \t]*$/m.test(header)],['header rule',/^[ \t]*版次規則以根目錄 `AGENTS\.md` 為準。畫面左上角會顯示目前版次與日期。[ \t]*$/m.test(header)],['old header removed',!/小改 \+0\.1,大改 \+1\.0/.test(header)],['changelog',/^2026-07-17 v10\.75：/.test(latest)],['runtime version',/^const APP_VERSION = '10\.75';$/m.test(h)],['test version',/^[ \t]*&& APP_VERSION === '10\.75'$/m.test(h)],['test title',/^[ \t]*&& APP_TITLE === 'MK2MD v10\.75'$/m.test(h)],['README version',/^- Version: `v10\.75`$/m.test(rv)&&/^- Date: `2026-07-17`$/m.test(rv)],['README deploy',/^\.\\deploy\.ps1 -Message "Deploy v10\.75"$/m.test(rd)]];const failed=checks.filter(([,ok])=>!ok).map(([name])=>name);if(failed.length)throw new Error('v10.75 governance missing: '+failed.join(', '));console.log('v10.75 governance contract: '+checks.length+'/'+checks.length+' passed');
'@
node -e $governance
```

Expected: `v10.75 governance contract: 13/13 passed` with exit code 0. Do not alter its assertions after implementation.

- [ ] **Step 6: 執行既有 AGENTS 與文件版本契約**

Run:

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('AGENTS.md','utf8');const required=[['MK2MD',/MK2MD/],['v10.75',/v10\.75/],['date',/2026-07-17/],['index',/index\.html/],['ui rules',/PROJECT_RULES\.md/],['selftest',/11\/11/],['repo',/green-tea-king\/md-mind-map/],['pages',/green-tea-king\.github\.io\/md-mind-map/],['delete confirmation',/刪除[^\n]*明確確認/],['no add dot',/禁止[^\n]*git add \./],['seven-item report',/1\. 這次做了什麼[\s\S]*7\. 尚未驗證/],['next task',/建議下一個任務/]];const missing=required.filter(([,re])=>!re.test(s)).map(([name])=>name);if(missing.length)throw new Error('Missing AGENTS rules: '+missing.join(','));console.log('AGENTS contract: '+required.length+'/'+required.length+' passed');"
$consistency = @'
const fs=require('fs');const h=fs.readFileSync('index.html','utf8'),r=fs.readFileSync('README.md','utf8'),a=fs.readFileSync('AGENTS.md','utf8');const firstBodyParagraph=s=>{const lines=s.replace(/^\uFEFF/,'').split(/\r?\n/);let i=0;while(i<lines.length&&(/^\s*$/.test(lines[i])||/^\s*#/.test(lines[i])))i++;const out=[];while(i<lines.length&&!/^\s*$/.test(lines[i]))out.push(lines[i++]);return out.join('\n')};const section=(s,re)=>(s.match(re)||[])[0]||'';const aFirst=firstBodyParagraph(a),rv=section(r,/^## Current Version[^\S\r\n]*\r?\n[\s\S]*?(?=^## Main Features[^\S\r\n]*\r?$)/m),rd=section(r,/^## Deployment[^\S\r\n]*\r?\n[\s\S]*?(?=^## Local Files[^\S\r\n]*\r?$)/m),headerStart=h.indexOf('<!--'),headerEnd=h.indexOf('-->',headerStart),header=headerStart>=0&&headerEnd>=0?h.slice(headerStart,headerEnd+3):'',marker='修改紀錄 Changelog(最新在最上):',markerAt=header.indexOf(marker),after=markerAt>=0?header.slice(markerAt+marker.length):'',latest=((after.match(/^[ \t]*-[ \t]+([^\r\n]*)/m)||[])[1]||'');const c=[/^[ \t]*Version: v10\.75[ \t]*$/m.test(header),/^[ \t]*Last updated: 2026-07-17[ \t]*$/m.test(header),/^const APP_VERSION = '10\.75';$/m.test(h),/^const APP_DATE = '2026-07-17';$/m.test(h),/^2026-07-17 v10\.75：/.test(latest),/^- Version: `v10\.75`$/m.test(rv),/^- Date: `2026-07-17`$/m.test(rv),/^\.\\deploy\.ps1 -Message "Deploy v10\.75"$/m.test(rd),aFirst==='本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.75`（`2026-07-17`）。預設使用台灣繁體中文協作。'];if(c.some(x=>!x))throw new Error('version consistency '+c.map(Number).join(''));console.log('version/document consistency: 9/9 passed');
'@
node -e $consistency
```

Expected:

```text
AGENTS contract: 12/12 passed
version/document consistency: 9/9 passed
```

- [ ] **Step 7: 執行 Node app script 語法檢查**

Run:

```powershell
node -e "const fs=require('fs'),vm=require('vm');const h=fs.readFileSync('index.html','utf8'),a=h.slice(h.indexOf('-->')+3),s=[...a.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);if(s.length!==1)throw new Error('Expected one inline script, got '+s.length);new vm.Script(s[0],{filename:'index-inline.js'});console.log('syntax ok: 1 inline script');"
```

Expected: `syntax ok: 1 inline script`。

- [ ] **Step 8: 驗證 protected 與七個 untracked 未變**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
$expected = @{
  'BACKUP_MANIFEST.md' = '7C017FCE631B948ECD402FC8616C6F37E0B7EF79AEF11A4022ED24B644B3EB03'
  'MD心智圖_v10_00.html' = 'EF01E21DCB43D5999F4FC2CFFB023E36BF84F8EEC49A5682340E60B3CBA92173'
  'agent.md' = '4C696CE09351809F3640164E161C7E4BF621AB652EBE56B6D2A15F2FEB46FFE8'
  'clear-auto-draft.html' = '61D5FB45AB927543806F4D1756FB3EEA5EBC7EE54DDB324BCEFE0312A181A7CE'
  'deploy.ps1' = 'DE7628ADEC12B67B48BCEB3AAAB650F79991848FD0998E400ACD6788509A92A5'
  'design.md' = '9BDF6A9A4DA7946466BF2229C6FE11D91A7EF0B056C97BBC55395DA5AB433B64'
  'repository-history.bundle' = 'D13703A7940F86235E4FDE2094BED50F649B578984B154C1E3F73E7C0C025385'
}
$paths = @(git -c core.quotepath=false $gitDir $workTree ls-files --others --exclude-standard)
$mismatches = @($paths | Where-Object {
  -not $expected.ContainsKey($_) -or
  (Get-FileHash -LiteralPath (Join-Path $repo $_) -Algorithm SHA256).Hash -ne $expected[$_]
})
if($paths.Count -ne 7 -or $mismatches.Count){
  throw "Untracked mismatch: count=$($paths.Count); $($mismatches -join ',')"
}
git $gitDir $workTree diff --exit-code -- PROJECT_RULES.md .github/workflows/pages.yml
git $gitDir $workTree diff --exit-code origin/master..HEAD -- PROJECT_RULES.md .github/workflows/pages.yml
'protected files and seven untracked: unchanged'
```

Expected: `protected files and seven untracked: unchanged`。

- [ ] **Step 9: 執行本機 Chrome 11 組自我測試**

Start only a new hidden Python server on port 8775:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$server = Start-Process -FilePath python -ArgumentList '-m','http.server','8775','--bind','127.0.0.1' -WorkingDirectory $repo -WindowStyle Hidden -PassThru
$ready = $false
for($i=0;$i -lt 20;$i++){
  try{
    if((Invoke-WebRequest 'http://127.0.0.1:8775/index.html' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200){
      $ready = $true
      break
    }
  }catch{}
  Start-Sleep -Milliseconds 250
}
if(-not $ready){ Stop-Process -Id $server.Id -Force; throw 'Local server did not become ready' }
"LOCAL_SERVER_PID=$($server.Id)"
```

Use a fresh Playwright CLI session `mk2md-v1075-local` with installed Chrome:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=mk2md-v1075-local open 'http://127.0.0.1:8775/index.html?ci-selftest=1' --browser chrome
$code = "async (page) => { const c=[]; const e=[]; page.on('console',m=>c.push({type:m.type(),text:m.text()})); page.on('pageerror',x=>e.push(x.message)); await page.reload({waitUntil:'load'}); await page.locator('html[data-ci-self-test=`"pass`"]' ).waitFor({timeout:30000}); await page.waitForTimeout(500); return {title:await page.title(),brand:await page.locator('#brandName').textContent(),state:await page.locator('html').getAttribute('data-ci-self-test'),passed:await page.locator('html').getAttribute('data-ci-self-test-passed'),failed:await page.locator('html').getAttribute('data-ci-self-test-failed'),consoleErrors:c.filter(x=>x.type==='error'),warningCount:c.filter(x=>x.type==='warning').length,pageErrors:e}; }"
npx --yes --package @playwright/cli playwright-cli -s=mk2md-v1075-local run-code $code
```

Expected JSON:

```json
{"title":"MK2MD v10.75","brand":"MK2MD","state":"pass","passed":"11","failed":"0","consoleErrors":[],"warningCount":6,"pageErrors":[]}
```

If `open` or `run-code` fails, still execute the close/stop commands below before reporting the failure; do not continue to commit.

Close only this session and stop only the recorded server PID:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=mk2md-v1075-local close
Stop-Process -Id $server.Id -Force
if(Get-NetTCPConnection -LocalPort 8775 -State Listen -ErrorAction SilentlyContinue){ throw 'Port 8775 still listening' }
'local session closed; port 8775 listeners: 0'
```

Do not operate or close the user's existing Chrome session.

- [ ] **Step 10: 審閱完整 release diff**

Run from `C:\Users\Administrator`:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
git $gitDir $workTree diff --check
git $gitDir $workTree diff -- AGENTS.md README.md index.html
git $gitDir $workTree diff --name-only
git $gitDir $workTree status --short
```

Expected release tracked diff exactly:

```text
AGENTS.md
README.md
index.html
```

Confirm `index.html` has only maintenance-header text, Version, newest Changelog, `APP_VERSION`, and two self-test expected changes. Confirm no product logic, UI or protected file difference.

- [ ] **Step 11: 精準 staging 並建立 release commit**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
git $gitDir $workTree add -- AGENTS.md README.md index.html
git $gitDir $workTree diff --cached --check
$staged = @(git $gitDir $workTree diff --cached --name-only)
$expectedStaged = @('AGENTS.md','README.md','index.html')
if(Compare-Object $expectedStaged $staged){ throw "Staging mismatch: $($staged -join ',')" }
git $gitDir $workTree commit -m "Align v10.75 version governance rules"
```

Expected: commit succeeds with exactly the three release files. Do not push or deploy in this Task.

---

### Task 3: 推送既有 master 並驗證原 GitHub Pages

**Files:**
- Deploy: tracked HEAD through unchanged `.github/workflows/pages.yml`
- Inspect: `https://green-tea-king.github.io/md-mind-map/`

**Interfaces:**
- Consumes: Task 2 locally verified v10.75 release commit。
- Produces: local HEAD、`origin/master`、Actions head SHA 與 live v10.75 一致的部署證據；本 Task 不修改檔案。

- [ ] **Step 1: 執行部署前 gate**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
$head = git $gitDir $workTree rev-parse HEAD
git $gitDir $workTree status --short --branch
git $gitDir $workTree diff --name-only
git $gitDir $workTree diff --cached --name-only
git $gitDir $workTree remote get-url origin
gh auth status
"HEAD=$head"
```

Expected: tracked clean；只有原七個 untracked；origin 是 `https://github.com/green-tea-king/md-mind-map.git`；GitHub account 可 push。

- [ ] **Step 2: 普通推送既有 master**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
git $gitDir $workTree push origin master
```

Expected: normal non-force push success。不得建立新 branch、repository 或 Pages site。

- [ ] **Step 3: 找到精確 HEAD 的 Pages run 並等待 success**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
$head = git $gitDir $workTree rev-parse HEAD
$runs = gh run list --repo green-tea-king/md-mind-map --workflow pages.yml --branch master --limit 10 --json databaseId,headSha,status,conclusion,url,updatedAt | ConvertFrom-Json
$run = $runs | Where-Object headSha -eq $head | Select-Object -First 1
if(-not $run){ throw "No Pages run for HEAD $head" }
$run | Format-List
gh run watch $run.databaseId --repo green-tea-king/md-mind-map --exit-status
```

Expected: matching `headSha` equals local HEAD and conclusion is `success`。失敗時停止，不 rollback 或宣稱部署成功。

- [ ] **Step 4: 驗證 live source**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
$head = git $gitDir $workTree rev-parse HEAD
$stamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$liveUrl = "https://green-tea-king.github.io/md-mind-map/?ci-selftest=1&verify=$head&t=$stamp"
$source = (Invoke-WebRequest $liveUrl -UseBasicParsing -TimeoutSec 30).Content
$checks = @(
  $source -match "const APP_NAME = 'MK2MD';",
  $source -match "const APP_VERSION = '10.75';",
  $source -match "const APP_DATE = '2026-07-17';",
  $source -match 'Version: v10.75',
  $source -match '2026-07-17 v10.75'
)
if($checks -contains $false){ throw 'Live source mismatch' }
'live source: v10.75 passed'
```

Expected: `live source: v10.75 passed`。

- [ ] **Step 5: 用 fresh browser 驗證 live DOM、console 與 page error**

Run:

```powershell
$liveBrowserUrl = "https://green-tea-king.github.io/md-mind-map/?ci-selftest=1&t=$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())"
npx --yes --package @playwright/cli playwright-cli -s=mk2md-v1075-live open $liveBrowserUrl --browser chrome
$code = "async (page) => { const c=[]; const e=[]; page.on('console',m=>c.push({type:m.type(),text:m.text()})); page.on('pageerror',x=>e.push(x.message)); await page.reload({waitUntil:'load'}); await page.locator('html[data-ci-self-test=`"pass`"]' ).waitFor({timeout:30000}); await page.waitForTimeout(500); return {title:await page.title(),brand:await page.locator('#brandName').textContent(),state:await page.locator('html').getAttribute('data-ci-self-test'),passed:await page.locator('html').getAttribute('data-ci-self-test-passed'),failed:await page.locator('html').getAttribute('data-ci-self-test-failed'),consoleErrors:c.filter(x=>x.type==='error'),warningCount:c.filter(x=>x.type==='warning').length,pageErrors:e}; }"
npx --yes --package @playwright/cli playwright-cli -s=mk2md-v1075-live run-code $code
```

Expected JSON:

```json
{"title":"MK2MD v10.75","brand":"MK2MD","state":"pass","passed":"11","failed":"0","consoleErrors":[],"warningCount":6,"pageErrors":[]}
```

If `open` or `run-code` fails, still close `mk2md-v1075-live` before reporting the failure; do not claim deployment verification passed.

Close the session and confirm no Codex browser remains:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=mk2md-v1075-live close
npx --yes --package @playwright/cli playwright-cli list
```

Expected: `(no browsers)`。

- [ ] **Step 6: 記錄部署證據**

Record in the Task report:

- full HEAD SHA
- normal push output
- Actions run URL、head SHA、conclusion 與 Asia/Taipei completion time
- canonical live URL 與 verification time
- live source、title、brand、11/11、console/page errors、warning count
- final local/origin SHA equality

This Task creates no project files or commit.

---

### Task 4: 部署後一致性稽核與固定格式交付

**Files:**
- Inspect: all tracked and seven untracked project files
- Inspect: existing GitHub Pages and Actions evidence

**Interfaces:**
- Consumes: Task 3 deployed v10.75 HEAD and live evidence。
- Produces: final Taiwan Traditional Chinese seven-item report and one detailed next-task recommendation；本 Task 不修改檔案。

- [ ] **Step 1: fetch 並確認 local/origin/Actions 一致**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
git $gitDir $workTree fetch origin master
$head = git $gitDir $workTree rev-parse HEAD
$origin = git $gitDir $workTree rev-parse origin/master
if($head -ne $origin){ throw "HEAD/origin mismatch: $head $origin" }
git $gitDir $workTree status --short --branch
git $gitDir $workTree diff --check
"HEAD=origin/master=$head"
```

Expected: HEAD equals `origin/master` and deployed Actions head SHA；tracked clean；seven untracked only。

- [ ] **Step 2: 重跑 protected 與七個 untracked gate**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$gitDir = "--git-dir=$repo\.git"
$workTree = "--work-tree=$repo"
$expected = @{
  'BACKUP_MANIFEST.md' = '7C017FCE631B948ECD402FC8616C6F37E0B7EF79AEF11A4022ED24B644B3EB03'
  'MD心智圖_v10_00.html' = 'EF01E21DCB43D5999F4FC2CFFB023E36BF84F8EEC49A5682340E60B3CBA92173'
  'agent.md' = '4C696CE09351809F3640164E161C7E4BF621AB652EBE56B6D2A15F2FEB46FFE8'
  'clear-auto-draft.html' = '61D5FB45AB927543806F4D1756FB3EEA5EBC7EE54DDB324BCEFE0312A181A7CE'
  'deploy.ps1' = 'DE7628ADEC12B67B48BCEB3AAAB650F79991848FD0998E400ACD6788509A92A5'
  'design.md' = '9BDF6A9A4DA7946466BF2229C6FE11D91A7EF0B056C97BBC55395DA5AB433B64'
  'repository-history.bundle' = 'D13703A7940F86235E4FDE2094BED50F649B578984B154C1E3F73E7C0C025385'
}
$paths = @(git -c core.quotepath=false $gitDir $workTree ls-files --others --exclude-standard)
$mismatches = @($paths | Where-Object {
  -not $expected.ContainsKey($_) -or
  (Get-FileHash -LiteralPath (Join-Path $repo $_) -Algorithm SHA256).Hash -ne $expected[$_]
})
if($paths.Count -ne 7 -or $mismatches.Count){
  throw "Untracked mismatch: count=$($paths.Count); $($mismatches -join ',')"
}
git $gitDir $workTree diff --exit-code -- PROJECT_RULES.md .github/workflows/pages.yml
git $gitDir $workTree diff --exit-code origin/master..HEAD -- PROJECT_RULES.md .github/workflows/pages.yml
'protected files and seven untracked: unchanged'
```

Expected: `protected files and seven untracked: unchanged`。

- [ ] **Step 3: 整理下一個最高優先任務**

Recommend but do not implement: add an executable version-consistency gate to `.github/workflows/pages.yml` before the browser self-test. Explain:

- why it is now highest priority: the v10.74 RED proved hard-coded version sources can drift while JavaScript remains syntactically valid;
- expected scope: workflow inline Node check or a tracked focused script, without changing the single-file published artifact;
- validation: intentional RED on one mismatched source, GREEN on all current sources, existing 11/11, Actions and live gates;
- risk: workflow quoting and duplicated rule ownership;
- confirmation: workflow modification and another release require user approval; no deletion is involved.

- [ ] **Step 4: 用固定七項格式交付**

Final response must include:

1. 這次做了什麼。
2. 修改了哪些檔案。
3. 版本號更新成多少。
4. 執行了哪些驗證與結果。
5. 是否已部署。
6. 部署 URL、Actions URL、SHA、部署／驗證時間。
7. 尚未驗證或需要使用者處理的事項。

Add a detailed `建議下一個任務` section after these seven items. Mention the six existing Canvas warnings as non-blocking if they remain exactly at baseline.

---

## Plan Self-Review

- Spec coverage: AGENTS ownership、index header rule、v10.75 sources、two hard-coded expected values、README、RED/GREEN、protected hashes、browser 11/11、allowlist staging、original Pages deployment and fixed reporting all map to explicit steps。
- Scope control: no workflow、PROJECT_RULES、local tools/docs、backups、product behavior、dependencies or platform changes are planned。
- Interface consistency: v10.75、2026-07-17、MK2MD、port 8775、session names、expected warning count and release file allowlist are exact throughout。
- Assertion precision: RED 與 GREEN 使用完全相同的 13 項 assertions；AGENTS 限定首個正文段落及 `## 6` section、README 限定 Current Version／Deployment sections、index 限定第一個 header comment 與 Changelog marker 後第一個項目，runtime／品牌預期值使用 multiline 行錨定，避免歷史文字或錯誤區段造成假陽性。
- Protected scope: Task 1、Task 2、Task 4 同時檢查 working-tree diff 與 `origin/master..HEAD` committed diff，防止 protected files 的既有提交差異漏檢。
- Safety: no delete/move/rename/force/rollback operation exists；server and browser cleanup target only processes/sessions created by the plan。
- Placeholder scan: no unfinished label、unnamed file、undefined function or cross-task shorthand remains；每個 Task 所需的命令與變數都在該 Task 內完整定義。`<current>` 是要寫入 AGENTS 的固定規則文字，不是待填值。
