# MK2MD AGENTS.md Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增受 Git 追蹤的根目錄 `AGENTS.md`，把 MK2MD v10.74 的協作、安全、版本、驗證與原平台部署規則建立成正式治理入口。

**Architecture:** `AGENTS.md` 專管工程協作與交付規則，README 只提供快速入口與版本資訊，`PROJECT_RULES.md` 繼續專管 UI 功能歸屬。產品仍是單一 `index.html`；本次只更新版本、日期與 Changelog，完整瀏覽器自檢用來證明沒有行為回歸。

**Tech Stack:** Markdown、單檔 HTML/CSS/JavaScript、Node.js `vm.Script`、Python HTTP server、Google Chrome、Playwright CLI、Git、GitHub CLI、GitHub Actions、GitHub Pages。

## Global Constraints

- 只在 `W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD` 工作，不建立新專案、不建立 worktree、不搬移或重新命名檔案。
- 不刪除任何專案檔案、資料、設定、歷史、部署資源或本機未追蹤檔；任何不可逆操作都要先取得使用者明確確認。
- 新增並追蹤根目錄 `AGENTS.md`；不刪除、改名、搬移、修改或追蹤 `agent.md`、`design.md`。
- 新版本為 `v10.74`，日期為 `2026-07-17`，品牌維持 `MK2MD`。
- `AGENTS.md` 負責協作／交付；README 負責快速入口；`PROJECT_RULES.md` 只負責 UI 歸屬且本次不得修改。
- `index.html` 只允許 Version、Last updated、`APP_VERSION`、`APP_DATE` 與最新 Changelog 差異；不得修改產品功能、UI、DEFAULT_MARKDOWN、匯出邏輯或 `APP_NAME`。
- 不修改 `.github/workflows/pages.yml`、`deploy.ps1`、依賴、repository slug 或 Pages 設定。
- 保留所有歷史 Changelog、規格、報告與備份名稱，不改寫舊版本文字。
- Git 一律用固定絕對 `--git-dir`／`--work-tree`；只 allowlist staging，禁止 `git add .`、force push、reset、checkout 或自動 rollback。
- 任一文件契約、Node、11/11、console/page error、warning、diff 或 staging gate 失敗，就停止 commit 與部署。
- 部署只推既有 `green-tea-king/md-mind-map` 的 `master`，正式 URL 固定為 `https://green-tea-king.github.io/md-mind-map/`。
- 完成回報使用台灣繁體中文固定七項格式，並詳細建議下一個任務的理由、範圍、驗證、風險與需確認事項。

---

## File Structure

- Create tracked: `AGENTS.md` — 未來工程師與 Codex 的正式協作、安全、版本、驗證、Git 與部署規範。
- Modify tracked: `README.md` — v10.74、部署範例與 `AGENTS.md` 維護入口。
- Modify tracked: `index.html` — v10.74 版本來源與最新 Changelog，無產品行為差異。
- Preserve unchanged: `PROJECT_RULES.md` — UI 功能歸屬規則。
- Preserve unchanged and untracked: `agent.md`, `design.md`, `deploy.ps1`, backups and bundle。
- Preserve unchanged: `.github/workflows/pages.yml` — 既有 11 組自檢與 Pages artifact workflow。

### Task 1: 鎖定本機基準並確認治理契約 RED

**Files:**
- Inspect: all tracked files
- Inspect: seven existing untracked files
- Test missing: `AGENTS.md`

**Interfaces:**
- Consumes: v10.73 deployed HEAD `fd936d271bf6237ce2a7a16d4bc7579bd6a5535b` plus approved design commit `185f27a` and this plan commit。
- Produces: protected-file baseline、seven untracked SHA-256 baseline，以及因 `AGENTS.md` 尚不存在而精準失敗的治理契約 RED。

- [ ] **Step 1: 確認 Git 狀態與核准的 ahead commits**

Run from `C:\Users\Administrator`:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
git --git-dir="$repo\.git" --work-tree="$repo" status --short --branch
git --git-dir="$repo\.git" --work-tree="$repo" diff --check
git --git-dir="$repo\.git" --work-tree="$repo" diff --name-only origin/master -- index.html README.md PROJECT_RULES.md .github/workflows/pages.yml
git --git-dir="$repo\.git" --work-tree="$repo" log --oneline origin/master..HEAD
```

Expected:

- tracked working tree 無差異。
- `origin/master..HEAD` 只包含已核准的 AGENTS design／plan commits。
- 仍只有七個既有 untracked；不得出現 `AGENTS.md` 或測試產物。

- [ ] **Step 2: 記錄 protected files 與七個 untracked 的 SHA-256**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$protected = @(
  'PROJECT_RULES.md',
  '.github/workflows/pages.yml',
  'agent.md',
  'design.md',
  'deploy.ps1'
)
$protectedHashes = foreach($path in $protected){
  $hash = Get-FileHash -LiteralPath (Join-Path $repo $path) -Algorithm SHA256
  [pscustomobject]@{Path=$path; Hash=$hash.Hash}
}
$untracked = git -c core.quotepath=false --git-dir="$repo\.git" --work-tree="$repo" ls-files --others --exclude-standard
$untrackedHashes = foreach($path in $untracked){
  $hash = Get-FileHash -LiteralPath (Join-Path $repo $path) -Algorithm SHA256
  [pscustomobject]@{Path=$path; Hash=$hash.Hash}
}
$protectedHashes | Format-Table -AutoSize
$untrackedHashes | Format-Table -AutoSize
```

Expected seven untracked baselines:

```text
BACKUP_MANIFEST.md       7C017FCE631B948ECD402FC8616C6F37E0B7EF79AEF11A4022ED24B644B3EB03
MD心智圖_v10_00.html     EF01E21DCB43D5999F4FC2CFFB023E36BF84F8EEC49A5682340E60B3CBA92173
agent.md                 4C696CE09351809F3640164E161C7E4BF621AB652EBE56B6D2A15F2FEB46FFE8
clear-auto-draft.html    61D5FB45AB927543806F4D1756FB3EEA5EBC7EE54DDB324BCEFE0312A181A7CE
deploy.ps1               DE7628ADEC12B67B48BCEB3AAAB650F79991848FD0998E400ACD6788509A92A5
design.md                9BDF6A9A4DA7946466BF2229C6FE11D91A7EF0B056C97BBC55395DA5AB433B64
repository-history.bundle D13703A7940F86235E4FDE2094BED50F649B578984B154C1E3F73E7C0C025385
```

- [ ] **Step 3: 執行治理文件 RED 契約**

Run from the project directory:

```powershell
node -e "const fs=require('fs');if(!fs.existsSync('AGENTS.md'))throw new Error('AGENTS.md missing');console.log('AGENTS contract present');"
```

Expected: exit code 1，相關輸出包含：

```text
Error: AGENTS.md missing
```

這是預期 RED：失敗原因必須是正式治理入口尚未建立，不是路徑、Node 或編碼錯誤。此 Task 不修改檔案、不 commit。

### Task 2: 建立 AGENTS.md、更新 v10.74 並完成 GREEN

**Files:**
- Create: `AGENTS.md`
- Modify: `README.md:11-15,40-46,57-67`
- Modify: `index.html:5-6,27-31,727-731`
- Preserve: `PROJECT_RULES.md`, `.github/workflows/pages.yml`, `agent.md`, `design.md`, `deploy.ps1`

**Interfaces:**
- Consumes: Task 1 RED contract、protected hashes、seven untracked hashes。
- Produces: tracked `AGENTS.md`、v10.74 version sources、README governance entry，以及 unchanged product behavior。

- [ ] **Step 1: 建立完整根目錄 `AGENTS.md`**

Use `apply_patch` to create exactly this content:

```markdown
# MK2MD 專案維護規範

本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.74`（`2026-07-17`）。預設使用台灣繁體中文協作。

## 1. 工作範圍與優先順序

- 永遠在目前 MK2MD 專案資料夾內工作，不建立新專案、不搬移檔案、不改成其他部署平台。
- 發生衝突時依序遵守：使用者最新明確指示、本 `AGENTS.md`、`PROJECT_RULES.md`、README、現有程式碼與自我測試。
- `PROJECT_RULES.md` 專管右鍵選單、工具列、命令面板與 UI 功能歸屬；本文件專管協作、安全與交付。
- 規格與計畫不等於已完成行為；以目前程式、測試、Git 與正式站證據為準。

## 2. 修改前必讀與真實來源

修改前依序閱讀：

1. `AGENTS.md`。
2. `README.md` 的目前版本、功能與部署方式。
3. `index.html` 檔頭版本、最新 Changelog 與相關程式區塊。
4. `.github/workflows/pages.yml`。
5. UI 變更時閱讀 `PROJECT_RULES.md`。
6. 與需求直接相關的程式碼、測試與已核准規格。

正式產品是單一 `index.html`，包含 HTML、CSS、JavaScript、預設 Markdown 與 11 組自我測試。GitHub Pages workflow 只發布 `index.html` 與 `.nojekyll`；README 與維護文件不會進入網站 artifact。

## 3. 不可自行推翻的產品決策

- Markdown 是資料本體；匯入後再匯出要保留語意、層級與順序。
- 維持桌面直式心智圖，不另建手機版、橫向樹或左右雙向樹。
- 右鍵選單是一般功能的完整入口；工具列只放高頻快捷入口。
- 診斷與自檢屬維護功能，保留在命令面板，不放進一般右鍵選單。
- 不恢復自動草稿、草稿復原提示或內容型 localStorage；使用者以匯出 Markdown／HTML 保存內容。
- `---` 是保留原稿順序的水平分隔線，不是普通子節點。
- 一般文字使用安全文字 helper／`textContent`；受控 HTML 使用既有 `sanitizeTrustedMarkup()` 與 `setTrustedHTML()`。
- 正式部署維持單檔 `index.html`，不要拆成新的前端專案或多檔建置架構。

若需求會改變上述決策，先說明影響並取得使用者明確同意。

## 4. 變更流程

### 修改前

- 先執行 `git status --short --branch`，辨識使用者既有變更與未追蹤檔。
- 閱讀相關規範、版本紀錄、部署設定與最小必要程式碼。
- 較大修改先提出簡短計畫並等待確認；小修可直接進行，但仍要回報原因與驗證。

### 修改中

- 遵守既有架構、命名、樣式、測試與工程習慣。
- 不做無關重構、不改無關功能、不任意大量更新依賴。
- 優先沿用既有資料模型與 helper，不建立平行狀態。
- parser、serializer、DOM、Canvas export 若共享同一資料類型，要一起盤點。

### 修改後

- 審閱 `git diff` 與 `git diff --check`。
- 執行與風險相稱的 Node、11/11、瀏覽器、console 與正式站驗證。
- 不能執行的指令要明確說明原因，不得宣稱未執行的驗證已通過。

## 5. 安全與不可逆操作

- 刪除檔案、資料、歷史、設定、部署資源、清空內容、資料庫變更或其他不可逆操作前，一定要取得使用者明確確認。
- 不把來源檔、使用者內容、備份、bundle 或未追蹤工具當成可清理的暫存物。
- 不在文件或程式中寫入 Token、密碼、私人資料或帳號憑證。
- 不 force push、不自動 rollback、不刪除遠端 branch、Pages site 或 Actions 資源。

## 6. 版本規則

每個可交付修改都必須更新版次。沿用目前逐號增加方式，例如 `v10.73` → `v10.74`；若級距不明，先提出建議版號與理由。

每次版本至少同步：

1. `index.html` 檔頭 Version 與 Last updated。
2. `APP_VERSION` 與 `APP_DATE`。
3. 最新 Changelog 項目。
4. README Current Version、日期與部署範例。

不要改寫舊 Changelog 或歷史檔名。

## 7. 必要驗證

- 用 Node `vm.Script` 解析 HTML header comment 之後抽出的 app script；應為 1 個 inline script。
- `git diff --check` 必須無輸出。
- 以本機 HTTP server 與 installed Chrome 執行 `?ci-selftest=1`；應為 `11/11`、0 failed。
- 真實瀏覽器確認 `document.title`、`#brandName`、page error 與 console error；error 必須為 0。
- 既有 Canvas `willReadFrequently` warning 基準是 6；本次變更不得增加。
- UI 變更另依 `PROJECT_RULES.md` 驗證右鍵選單與工具列歸屬。
- 部署後以 cache-busted 正式 URL 重新驗證版本、品牌、11/11 與 console/page error。

## 8. Git 與 staging 安全

- WebDAV 路徑偶發 Git discovery 問題時，從 `C:\Users\Administrator` 使用固定絕對 `--git-dir` 與 `--work-tree`。
- staging 使用明確 allowlist，禁止 `git add .`。
- commit 前執行 `git diff --cached --check` 與 `git diff --cached --name-only`。
- 不覆蓋、不 reset、不 checkout 使用者既有變更。
- `deploy.ps1` 尚未涵蓋所有多檔版本文件與完整 live gate；完成強化前，多檔 release 使用明確 Git／GitHub CLI 流程。

## 9. 原平台部署

- repository：`green-tea-king/md-mind-map`。
- 正式分支：`master`。
- 正式網址：<https://green-tea-king.github.io/md-mind-map/>。
- 只推送既有 `origin/master`，不建立新 repository、site、平台或分支。
- push 後找出 head SHA 等於本機 HEAD 的 `.github/workflows/pages.yml` run，等待 `completed/success`。
- 正式站以 SHA／時間 cache-buster 驗證；Git push 不等於部署完成。

## 10. 完成回報

每次完成工作以台灣繁體中文列出：

1. 這次做了什麼。
2. 修改了哪些檔案。
3. 版本號更新成多少。
4. 執行了哪些驗證與結果。
5. 是否已部署。
6. 部署 URL、Actions URL、SHA 與時間。
7. 尚未驗證或需要使用者處理的事項。

另加「建議下一個任務」，詳細說明為什麼優先、預計範圍、驗證方式、風險與是否需要使用者確認。
```

- [ ] **Step 2: 更新 README 版本、部署範例與維護入口**

Apply these exact replacements:

```diff
 - Version: `v10.73`
+- Version: `v10.74`
```

```diff
-.\deploy.ps1 -Message "Deploy v10.73"
+.\deploy.ps1 -Message "Deploy v10.74"
```

```diff
-- 修改 UI 前必須先讀 `PROJECT_RULES.md`
+- 修改前先讀 `AGENTS.md`；UI 變更再讀 `PROJECT_RULES.md`
```

保留 Date `2026-07-17`、Pages URL、功能說明與其他 Maintenance Rules。

- [ ] **Step 3: 將 index.html 版本更新為 v10.74**

Apply only these changes:

```diff
-  Version: v10.73
+  Version: v10.74
```

在 Changelog 最上方加入：

```text
  - 2026-07-17 v10.74：新增受版本控制的 AGENTS.md，集中協作、安全、版本、驗證與原平台部署規則；README 加入正式維護入口。
```

更新常數：

```diff
-const APP_VERSION = '10.73';
+const APP_VERSION = '10.74';
```

`Last updated` 與 `APP_DATE` 維持 `2026-07-17`。不得修改 `APP_NAME`、UI、DEFAULT_MARKDOWN、tests 或其他 JavaScript。

- [ ] **Step 4: 跑治理文件 GREEN 契約**

Run:

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('AGENTS.md','utf8');const required=[['MK2MD',/MK2MD/],['v10.74',/v10\.74/],['date',/2026-07-17/],['index',/index\.html/],['ui rules',/PROJECT_RULES\.md/],['selftest',/11\/11/],['repo',/green-tea-king\/md-mind-map/],['pages',/green-tea-king\.github\.io\/md-mind-map/],['delete confirmation',/刪除[^\n]*明確確認/],['no add dot',/禁止 `git add \.`/],['seven-item report',/1\. 這次做了什麼[\s\S]*7\. 尚未驗證/],['next task',/建議下一個任務/]];const missing=required.filter(([,re])=>!re.test(s)).map(([name])=>name);if(missing.length)throw new Error('Missing AGENTS rules: '+missing.join(','));if(/v10\.69/.test(s))throw new Error('Stale v10.69 current-state text');console.log('AGENTS contract: '+required.length+'/'+required.length+' passed');"
```

Expected:

```text
AGENTS contract: 12/12 passed
```

- [ ] **Step 5: 驗證版本來源與文件權責一致**

Run:

```powershell
node -e "const fs=require('fs');const html=fs.readFileSync('index.html','utf8');const readme=fs.readFileSync('README.md','utf8');const agents=fs.readFileSync('AGENTS.md','utf8');const checks=[/Version: v10\.74/.test(html),/Last updated: 2026-07-17/.test(html),/const APP_VERSION = '10\.74';/.test(html),/const APP_DATE = '2026-07-17';/.test(html),/2026-07-17 v10\.74/.test(html),/Version: `v10\.74`/.test(readme),/Date: `2026-07-17`/.test(readme),/AGENTS\.md/.test(readme),/v10\.74/.test(agents)];if(checks.some(ok=>!ok))throw new Error('Version/document consistency failed: '+checks.map(Number).join(''));console.log('version/document consistency: 9/9 passed');"
```

Expected: `version/document consistency: 9/9 passed`。

- [ ] **Step 6: 確認 protected files 與七個 untracked 未變**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
git --git-dir="$repo\.git" --work-tree="$repo" diff --exit-code -- PROJECT_RULES.md .github/workflows/pages.yml
$expected = @{
  'BACKUP_MANIFEST.md' = '7C017FCE631B948ECD402FC8616C6F37E0B7EF79AEF11A4022ED24B644B3EB03'
  'MD心智圖_v10_00.html' = 'EF01E21DCB43D5999F4FC2CFFB023E36BF84F8EEC49A5682340E60B3CBA92173'
  'agent.md' = '4C696CE09351809F3640164E161C7E4BF621AB652EBE56B6D2A15F2FEB46FFE8'
  'clear-auto-draft.html' = '61D5FB45AB927543806F4D1756FB3EEA5EBC7EE54DDB324BCEFE0312A181A7CE'
  'deploy.ps1' = 'DE7628ADEC12B67B48BCEB3AAAB650F79991848FD0998E400ACD6788509A92A5'
  'design.md' = '9BDF6A9A4DA7946466BF2229C6FE11D91A7EF0B056C97BBC55395DA5AB433B64'
  'repository-history.bundle' = 'D13703A7940F86235E4FDE2094BED50F649B578984B154C1E3F73E7C0C025385'
}
$paths = git -c core.quotepath=false --git-dir="$repo\.git" --work-tree="$repo" ls-files --others --exclude-standard
$mismatches = foreach($path in $paths){
  $actual = (Get-FileHash -LiteralPath (Join-Path $repo $path) -Algorithm SHA256).Hash
  if(-not $expected.ContainsKey($path) -or $expected[$path] -ne $actual){ "$path expected=$($expected[$path]) actual=$actual" }
}
if($paths.Count -ne 7 -or $mismatches){ throw "Protected/untracked mismatch: count=$($paths.Count); $($mismatches -join '; ')" }
'protected files and seven untracked: unchanged'
```

Expected: `protected files and seven untracked: unchanged`，沒有新的 project test artifact。

- [ ] **Step 7: 執行 Node app script 語法檢查**

Run:

```powershell
node -e "const fs=require('fs'),vm=require('vm');const html=fs.readFileSync('index.html','utf8');const active=html.slice(html.indexOf('-->')+3);const scripts=[...active.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);if(scripts.length!==1)throw new Error('Expected 1 inline app script, got '+scripts.length);scripts.forEach((code,i)=>new vm.Script(code,{filename:'index-inline-'+(i+1)+'.js'}));console.log('syntax ok: 1 inline script');"
```

Expected: `syntax ok: 1 inline script`。

- [ ] **Step 8: 執行本機 Chrome 11 組自我測試**

Run from PowerShell, using a free port `8774`:

```powershell
$server = Start-Process -FilePath python -ArgumentList '-m','http.server','8774','--bind','127.0.0.1' -WorkingDirectory $PWD.Path -WindowStyle Hidden -PassThru
try {
  for($i=0;$i -lt 20;$i++){
    try{ Invoke-WebRequest 'http://127.0.0.1:8774/index.html' -UseBasicParsing -TimeoutSec 2 | Out-Null; break }
    catch{ if($i -eq 19){ throw }; Start-Sleep -Milliseconds 250 }
  }
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  $url = 'http://127.0.0.1:8774/index.html?ci-selftest=1'
  $cmdLine = '"' + $chrome + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-background-timer-throttling --virtual-time-budget=30000 --dump-dom "' + $url + '"'
  $dom = (& $env:ComSpec /d /s /c $cmdLine 2>$null) -join "`n"
  if($LASTEXITCODE -ne 0){ throw "Chrome exit $LASTEXITCODE" }
  if($dom -notmatch 'data-ci-self-test="pass"' -or $dom -notmatch 'data-ci-self-test-passed="11"' -or $dom -notmatch 'data-ci-self-test-failed="0"'){ throw 'Local self-test failed' }
  'local browser self-test: 11 passed, 0 failed'
} finally {
  if($server -and -not $server.HasExited){ Stop-Process -Id $server.Id }
}
```

Expected: `local browser self-test: 11 passed, 0 failed`，且 port 8774 最後沒有 listener。

- [ ] **Step 9: 用真實瀏覽器驗證 title、brand、console 與 page error**

Restart a local server because Step 8 has already stopped its process:

```powershell
$server = Start-Process -FilePath python -ArgumentList '-m','http.server','8774','--bind','127.0.0.1' -WorkingDirectory $PWD.Path -WindowStyle Hidden -PassThru
"PLAYWRIGHT_SERVER_PID=$($server.Id)"
```

Wait for HTTP 200:

```powershell
$ready = $false
for($i=0;$i -lt 20;$i++){
  try{
    $response = Invoke-WebRequest 'http://127.0.0.1:8774/index.html' -UseBasicParsing -TimeoutSec 2
    if($response.StatusCode -eq 200){ $ready = $true; break }
  }catch{
    Start-Sleep -Milliseconds 250
  }
}
if(-not $ready){ throw 'Playwright HTTP server did not become ready' }
'Playwright HTTP server: 200'
```

Then use Playwright CLI in a fresh named session `mk2md-agents-local`. Attach listeners before navigation, reload once after clearing the first-load records, and run this function:

```javascript
async (page) => {
  const consoleEntries = [];
  const pageErrors = [];
  page.on('console', message => consoleEntries.push({type:message.type(), text:message.text()}));
  page.on('pageerror', error => pageErrors.push(error.message));
  const url = 'http://127.0.0.1:8774/index.html?ci-selftest=1';
  await page.goto(url, {waitUntil:'load'});
  await page.locator('html[data-ci-self-test="pass"]').waitFor({timeout:30000});
  consoleEntries.length = 0;
  pageErrors.length = 0;
  await page.reload({waitUntil:'load'});
  await page.locator('html[data-ci-self-test="pass"]').waitFor({timeout:30000});
  await page.waitForTimeout(500);
  return {
    title: await page.title(),
    brand: await page.locator('#brandName').textContent(),
    state: await page.locator('html').getAttribute('data-ci-self-test'),
    passed: await page.locator('html').getAttribute('data-ci-self-test-passed'),
    failed: await page.locator('html').getAttribute('data-ci-self-test-failed'),
    consoleErrors: consoleEntries.filter(entry=>entry.type==='error'),
    warningCount: consoleEntries.filter(entry=>entry.type==='warning').length,
    pageErrors
  };
}
```

Expected:

```json
{"title":"MK2MD v10.74","brand":"MK2MD","state":"pass","passed":"11","failed":"0","consoleErrors":[],"warningCount":6,"pageErrors":[]}
```

Close the Playwright session. Stop only the Python process listening on port 8774 and verify the listener count is zero:

```powershell
$listener = Get-NetTCPConnection -LocalPort 8774 -State Listen -ErrorAction Stop
$processIds = @($listener | Select-Object -ExpandProperty OwningProcess -Unique)
if($processIds.Count -ne 1){ throw "Expected exactly one port 8774 server, got $($processIds.Count)" }
Stop-Process -Id $processIds[0]
if(Get-NetTCPConnection -LocalPort 8774 -State Listen -ErrorAction SilentlyContinue){ throw 'Port 8774 still listening' }
'Playwright session closed; port 8774 listeners: 0'
```

Do not operate the user's existing Chrome session.

- [ ] **Step 10: 審閱完整 diff 與 staging 範圍**

Run from `C:\Users\Administrator`:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
git --git-dir="$repo\.git" --work-tree="$repo" diff --check
git --git-dir="$repo\.git" --work-tree="$repo" diff -- AGENTS.md README.md index.html
git --git-dir="$repo\.git" --work-tree="$repo" diff --name-only
git --git-dir="$repo\.git" --work-tree="$repo" status --short
```

Expected:

- planned tracked diff 只有 `README.md`、`index.html`，另有新 `AGENTS.md`。
- `index.html` 只有 Version、Changelog、`APP_VERSION` 三個內容差異；日期值維持 2026-07-17。
- `PROJECT_RULES.md`、workflow 與其他 tracked 檔沒有差異。
- 七個既有 untracked 仍存在；沒有第八個意外未追蹤產物。

- [ ] **Step 11: 精準 staging 並建立 v10.74 release commit**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
git --git-dir="$repo\.git" --work-tree="$repo" add -- AGENTS.md README.md index.html
git --git-dir="$repo\.git" --work-tree="$repo" diff --cached --check
git --git-dir="$repo\.git" --work-tree="$repo" diff --cached --name-only
git --git-dir="$repo\.git" --work-tree="$repo" commit -m "Add MK2MD agent maintenance rules"
```

Expected staged list, exactly:

```text
AGENTS.md
README.md
index.html
```

Commit succeeds; do not amend, push, or deploy in this Task.

### Task 3: 推送既有 master 並驗證原 GitHub Pages

**Files:**
- Deploy tracked HEAD through unchanged `.github/workflows/pages.yml`
- Inspect live: `https://green-tea-king.github.io/md-mind-map/`

**Interfaces:**
- Consumes: Task 2 locally verified v10.74 release commit。
- Produces: `origin/master`、Actions head SHA 與 live v10.74 全部等於同一 HEAD。

- [ ] **Step 1: 執行部署前保護檢查**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$head = git --git-dir="$repo\.git" --work-tree="$repo" rev-parse HEAD
git --git-dir="$repo\.git" --work-tree="$repo" status --short --branch
git --git-dir="$repo\.git" --work-tree="$repo" diff --name-only
git --git-dir="$repo\.git" --work-tree="$repo" diff --cached --name-only
git --git-dir="$repo\.git" --work-tree="$repo" remote get-url origin
gh auth status
"HEAD=$head"
```

Expected: tracked staged／unstaged 都是 0；只有原七個 untracked；origin 是 `https://github.com/green-tea-king/md-mind-map.git`；GitHub account 可 push。

- [ ] **Step 2: 推送既有 master**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
git --git-dir="$repo\.git" --work-tree="$repo" push origin master
```

Expected: normal non-force push success。不得建立新 branch、repo 或 Pages site。

- [ ] **Step 3: 找到精確 SHA 的 Pages run 並等待 success**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$head = git --git-dir="$repo\.git" --work-tree="$repo" rev-parse HEAD
$runs = gh run list --repo green-tea-king/md-mind-map --workflow pages.yml --branch master --limit 10 --json databaseId,headSha,status,conclusion,url,updatedAt | ConvertFrom-Json
$run = $runs | Where-Object headSha -eq $head | Select-Object -First 1
if(-not $run){ throw "No Pages run for HEAD $head" }
$run | Format-List
gh run watch $run.databaseId --repo green-tea-king/md-mind-map --exit-status
```

Expected: matching `headSha` equals local HEAD and conclusion is `success`。失敗時停止，不 rollback 或宣稱部署成功。

- [ ] **Step 4: 驗證 live source 與 Chrome DOM**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
$head = git --git-dir="$repo\.git" --work-tree="$repo" rev-parse HEAD
$stamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$liveUrl = "https://green-tea-king.github.io/md-mind-map/?ci-selftest=1&verify=$head&t=$stamp"
$source = (Invoke-WebRequest $liveUrl -UseBasicParsing -TimeoutSec 30).Content
if($source -notmatch "const APP_NAME = 'MK2MD';" -or $source -notmatch "const APP_VERSION = '10.74';" -or $source -notmatch "const APP_DATE = '2026-07-17';"){ throw 'Live source mismatch' }
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$cmdLine = '"' + $chrome + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-background-timer-throttling --virtual-time-budget=30000 --dump-dom "' + $liveUrl + '"'
$dom = (& $env:ComSpec /d /s /c $cmdLine 2>$null) -join "`n"
if($LASTEXITCODE -ne 0){ throw "Chrome exit $LASTEXITCODE" }
$title = [regex]::Match($dom,'<title>([^<]+)</title>').Groups[1].Value
$brand = [regex]::Match($dom,'id="brandName">([^<]+)</span>').Groups[1].Value
$state = [regex]::Match($dom,'data-ci-self-test="([^"]+)"').Groups[1].Value
$passed = [regex]::Match($dom,'data-ci-self-test-passed="([^"]+)"').Groups[1].Value
$failed = [regex]::Match($dom,'data-ci-self-test-failed="([^"]+)"').Groups[1].Value
if($title -ne 'MK2MD v10.74' -or $brand -ne 'MK2MD' -or $state -ne 'pass' -or $passed -ne '11' -or $failed -ne '0'){ throw "Live DOM mismatch: $title|$brand|$state|$passed|$failed" }
"LIVE=$title|$brand|$state|$passed|$failed"
```

Expected: `LIVE=MK2MD v10.74|MK2MD|pass|11|0`。

- [ ] **Step 5: 用真實瀏覽器驗證 live console/page error**

Use Playwright CLI in a fresh named session and run this complete function:

```javascript
async (page) => {
  const consoleEntries = [];
  const pageErrors = [];
  page.on('console', message => consoleEntries.push({type:message.type(), text:message.text()}));
  page.on('pageerror', error => pageErrors.push(error.message));
  const url = 'https://green-tea-king.github.io/md-mind-map/?ci-selftest=1&t=' + Date.now();
  await page.goto(url, {waitUntil:'load'});
  await page.locator('html[data-ci-self-test="pass"]').waitFor({timeout:30000});
  await page.waitForTimeout(500);
  return {
    title: await page.title(),
    brand: await page.locator('#brandName').textContent(),
    state: await page.locator('html').getAttribute('data-ci-self-test'),
    passed: await page.locator('html').getAttribute('data-ci-self-test-passed'),
    failed: await page.locator('html').getAttribute('data-ci-self-test-failed'),
    consoleErrors: consoleEntries.filter(entry=>entry.type==='error'),
    warningCount: consoleEntries.filter(entry=>entry.type==='warning').length,
    pageErrors
  };
}
```

Expected: title `MK2MD v10.74`、brand `MK2MD`、11/11、console errors 0、page errors 0、warnings no more than 6。Close the named session afterward。

- [ ] **Step 6: 記錄部署證據**

Record in the Task report:

- full HEAD SHA
- push output
- Actions run URL and conclusion
- workflow completion time in Asia/Taipei
- canonical live URL
- live verification time
- source/DOM/console/page error/warning results

This Task creates no project files or commit。

### Task 4: 三方落差、最終報告與下一任務建議

**Files:**
- Inspect: all tracked/untracked project files
- Inspect live: existing GitHub Pages

**Interfaces:**
- Consumes: deployed v10.74 HEAD、Actions evidence、Task 1 baselines。
- Produces: final Taiwan Traditional Chinese seven-item report and detailed next-task recommendation。

- [ ] **Step 1: fetch 並確認本機／origin／live 同一版本**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
git --git-dir="$repo\.git" --work-tree="$repo" fetch origin master
$head = git --git-dir="$repo\.git" --work-tree="$repo" rev-parse HEAD
$origin = git --git-dir="$repo\.git" --work-tree="$repo" rev-parse origin/master
"HEAD=$head"
"ORIGIN=$origin"
git --git-dir="$repo\.git" --work-tree="$repo" status --short --branch
git --git-dir="$repo\.git" --work-tree="$repo" diff --check
```

Expected: HEAD equals origin/master and deployed Actions SHA；tracked clean；seven untracked only。

- [ ] **Step 2: 確認 AGENTS 已追蹤與 protected/untracked hashes 不變**

Run:

```powershell
$repo = 'W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD'
git --git-dir="$repo\.git" --work-tree="$repo" ls-files -- AGENTS.md
```

Expected: exactly `AGENTS.md`。

Run the complete protected/untracked check:

```powershell
git --git-dir="$repo\.git" --work-tree="$repo" diff --exit-code -- PROJECT_RULES.md .github/workflows/pages.yml
$expected = @{
  'BACKUP_MANIFEST.md' = '7C017FCE631B948ECD402FC8616C6F37E0B7EF79AEF11A4022ED24B644B3EB03'
  'MD心智圖_v10_00.html' = 'EF01E21DCB43D5999F4FC2CFFB023E36BF84F8EEC49A5682340E60B3CBA92173'
  'agent.md' = '4C696CE09351809F3640164E161C7E4BF621AB652EBE56B6D2A15F2FEB46FFE8'
  'clear-auto-draft.html' = '61D5FB45AB927543806F4D1756FB3EEA5EBC7EE54DDB324BCEFE0312A181A7CE'
  'deploy.ps1' = 'DE7628ADEC12B67B48BCEB3AAAB650F79991848FD0998E400ACD6788509A92A5'
  'design.md' = '9BDF6A9A4DA7946466BF2229C6FE11D91A7EF0B056C97BBC55395DA5AB433B64'
  'repository-history.bundle' = 'D13703A7940F86235E4FDE2094BED50F649B578984B154C1E3F73E7C0C025385'
}
$paths = git -c core.quotepath=false --git-dir="$repo\.git" --work-tree="$repo" ls-files --others --exclude-standard
$mismatches = foreach($path in $paths){
  $actual = (Get-FileHash -LiteralPath (Join-Path $repo $path) -Algorithm SHA256).Hash
  if(-not $expected.ContainsKey($path) -or $expected[$path] -ne $actual){ "$path expected=$($expected[$path]) actual=$actual" }
}
if($paths.Count -ne 7 -or $mismatches){ throw "Protected/untracked mismatch: count=$($paths.Count); $($mismatches -join '; ')" }
'protected files and seven untracked: unchanged'
```

Expected: `protected files and seven untracked: unchanged`。

- [ ] **Step 3: 整理已知後續事項並選最高優先下一任務**

Use current evidence to prioritize, without implementing:

1. Modernize／decide tracking role for local `agent.md` and `design.md` v10.69 content。
2. Harden `deploy.ps1` allowlist staging and exact Actions/live gates。
3. Add executable version consistency verification to CI without changing single-file artifact。
4. Correct stale maintenance-comment wording in a future version。
5. Investigate six Canvas `willReadFrequently` warnings with performance and pixel regression evidence。

Recommend one highest-priority task and explain purpose、scope、files、verification、risks、confirmation requirements。

- [ ] **Step 4: 用固定七項格式交付**

Final response must include:

1. 這次做了什麼。
2. 修改了哪些檔案。
3. 版本號更新成多少。
4. 執行了哪些驗證與結果。
5. 是否已部署。
6. 部署 URL、Actions URL、SHA、部署／驗證時間。
7. 尚未驗證或需要使用者處理的事項。

Add a detailed “建議下一個任務” section after these seven items。

---

## Plan Self-Review

- Spec coverage: tracked `AGENTS.md`、README ownership、v10.74 sources、RED/GREEN、protected hashes、Node、11/11、real browser、allowlist staging、original Pages deploy、three-way audit and next-task reporting all map to explicit tasks。
- Placeholder scan: no unfinished labels、unnamed files、undefined functions or “similar to another task” shortcuts remain。
- Interface consistency: AGENTS static contract、version consistency checks、Node extraction、Chrome dataset attributes、Git SHA and live URL values use the same exact names throughout。
- Scope control: no `PROJECT_RULES.md`、workflow、deploy script、local docs、backups、product behavior、dependencies or platform settings are modified。
