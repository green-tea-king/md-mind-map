# MK2MD Brand Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將目前 v10.72 的所有現行產品品牌、標題與預設名稱統一為 `MK2MD`，發布為 v10.73，並在原 GitHub Pages 專案完成驗證。

**Architecture:** 保留既有單檔 `index.html` 架構，以 `APP_NAME` 作為執行期品牌唯一來源，靜態 HTML 只保留載入 JavaScript 前所需的 `MK2MD` fallback。測試沿用頁內自我測試框架，先加入會在 v10.72 失敗的品牌契約，再做最小修改使其通過；文件與版本資訊隨同一版次更新，歷史 Changelog 與備份名稱保持原樣。

**Tech Stack:** Vanilla HTML、CSS、JavaScript、Node.js 語法檢查、Google Chrome headless、Python 靜態 HTTP server、Git、GitHub Actions、GitHub Pages、GitHub CLI。

## Global Constraints

- 只在目前資料夾 `W:\4. TODO (這裡是公用區 特定電腦勿放)\@MK2MD` 工作，不建立新專案、不搬移或重新命名檔案。
- 不刪除任何專案檔案、資料、設定或部署資源；若之後確有刪除需求，必須先取得使用者明確確認。
- 保留既有單檔架構、命名風格、自我測試框架與 GitHub Pages 部署方式，不做無關重構或依賴更新。
- 現行產品名稱一律為 `MK2MD`；`APP_NAME = 'MK2MD'` 是執行期唯一品牌來源。
- 版本更新為 `10.73`，日期更新為 `2026-07-17`。
- 保留通用功能用語，例如「心智圖節點」與「目前心智圖」。
- 不修改歷史 Changelog、歷史備份檔名、GitHub repository slug `green-tea-king/md-mind-map` 或 Pages URL `https://green-tea-king.github.io/md-mind-map/`。
- `agent.md` 與 `design.md` 只同步現行品牌文字，維持未追蹤且不納入本次部署 commit。
- Git 一律明確指定 `--git-dir="$PWD\.git" --work-tree="$PWD"`，避免 WebDAV 路徑偶發 repository discovery 問題。
- 部署只推送既有 `origin/master`，不建立新平台專案，不 force push，不做自動回滾。
- 任何本機測試失敗都停止 commit 與部署；GitHub Actions 失敗則停止正式站驗證與後續發布宣告。

---

## File Structure

- Modify: `index.html` — 品牌唯一來源、瀏覽器標題、左側品牌卡、診斷與 console 標籤、預設 Markdown、匯出 fallback、版本資訊與頁內自我測試。
- Modify: `README.md` — 現行產品名稱、版本日期與相對部署指令。
- Modify: `PROJECT_RULES.md` — 現行專案名稱。
- Modify locally only: `agent.md` — 接手指南標題中的現行產品名稱；不加入 Git。
- Modify locally only: `design.md` — 系統設計標題與現行產品描述；不加入 Git。
- Preserve unchanged: `.github/workflows/pages.yml` — 使用既有 11 組自我測試與 Pages 部署流程。
- Preserve unchanged: `deploy.ps1` — 本次不用它自動 staging，避免漏掉版本文件；README 只修正未來使用方式。

### Task 1: 保護本機檔案並驗證 v10.72 基準

**Files:**
- Inspect: `index.html`
- Inspect: `.github/workflows/pages.yml`
- Inspect: all current untracked files

**Interfaces:**
- Consumes: 已同步的 `origin/master` v10.72 tracked worktree。
- Produces: 可重現的 v10.72 基準結果與未追蹤檔案雜湊，供完成後比對。

- [ ] **Step 1: 確認 Git 分支、tracked 差異與未追蹤清單**

Run:

```powershell
$repo = $PWD.Path
git --git-dir="$repo\.git" --work-tree="$repo" status --short --branch
git --git-dir="$repo\.git" --work-tree="$repo" diff --check
git --git-dir="$repo\.git" --work-tree="$repo" diff --name-only origin/master -- index.html README.md PROJECT_RULES.md .github/workflows/pages.yml
```

Expected:

- 分支為 `master...origin/master`，可以 ahead 已核准的設計／計畫文件 commits，但不得有產品檔案相對 `origin/master` 的內容差異。
- `git diff --check` 沒有輸出。
- tracked 檔案相對 `origin/master` 沒有內容差異。
- 未追蹤清單只包含既有本機檔案，不出現新的測試產物。

- [ ] **Step 2: 記錄所有本機未追蹤檔案的 SHA-256**

Run:

```powershell
$repo = $PWD.Path
$untracked = git -c core.quotepath=false --git-dir="$repo\.git" --work-tree="$repo" ls-files --others --exclude-standard
$baselineHashes = foreach ($path in $untracked) {
  Get-FileHash -LiteralPath (Join-Path $repo $path) -Algorithm SHA256 |
    Select-Object @{Name='Path';Expression={$path}}, Hash
}
$baselineHashes | Format-Table -AutoSize
```

Expected: 七個既有未追蹤檔案都有 SHA-256；將 `$baselineHashes` 保留在目前 PowerShell 工作階段，最後核對未預期變更。

- [ ] **Step 3: 執行 JavaScript 語法基準檢查**

Run:

```powershell
node -e "const fs=require('fs'),vm=require('vm');const html=fs.readFileSync('index.html','utf8');const active=html.slice(html.indexOf('-->')+3);const scripts=[...active.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);if(!scripts.length)throw new Error('No inline script found');scripts.forEach((code,i)=>new vm.Script(code,{filename:'index-inline-'+(i+1)+'.js'}));console.log('syntax ok:',scripts.length,'inline script(s)');"
```

Expected: exit code 0 並輸出 `syntax ok: 1 inline script(s)`。

- [ ] **Step 4: 以本機 HTTP 與 Chrome 執行 v10.72 的 11 組完整自我測試**

Run:

```powershell
$server = Start-Process -FilePath python -ArgumentList '-m','http.server','8772','--bind','127.0.0.1' -WorkingDirectory $PWD.Path -WindowStyle Hidden -PassThru
try {
  $ready = $false
  for ($i = 0; $i -lt 20; $i++) {
    try {
      Invoke-WebRequest 'http://127.0.0.1:8772/index.html' -UseBasicParsing -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $ready) { throw 'Local HTTP server did not become ready.' }
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  $url = 'http://127.0.0.1:8772/index.html?ci-selftest=1'
  $cmdLine = '"' + $chrome + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-background-timer-throttling --virtual-time-budget=30000 --dump-dom "' + $url + '"'
  $dom = (& $env:ComSpec /d /s /c $cmdLine 2>$null) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw "Chrome dump-dom failed with exit code $LASTEXITCODE." }
  if ($dom -notmatch 'data-ci-self-test="pass"' -or $dom -notmatch 'data-ci-self-test-passed="11"' -or $dom -notmatch 'data-ci-self-test-failed="0"') {
    throw 'v10.72 baseline self-test did not pass 11/11.'
  }
  'baseline browser self-test: 11 passed, 0 failed'
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id }
}
```

Expected: `baseline browser self-test: 11 passed, 0 failed`。若失敗，停止，不修改產品檔案。

- [ ] **Step 5: 用瀏覽器自動化記錄 v10.72 console 基準**

重新啟動與 Step 4 相同的 Python server，確認 `http://127.0.0.1:8772/index.html` 可連線；在 `http://127.0.0.1:8772/index.html?ci-selftest=1` 開啟全新的 Chrome 自動化頁面，清空載入前紀錄後重新載入，等待 `<html data-ci-self-test="pass">`，再讀取所有 `console` 與未捕捉的 page error。完成後停止這次 Python server。

Expected: page error 為 0、console error 為 0；既有 Canvas `getImageData` 的 `willReadFrequently` warning 若仍出現，只記錄數量作為基準，不把它誤判為本次品牌修改造成的錯誤。

### Task 2: 先建立 MK2MD 品牌契約並確認 RED

**Files:**
- Modify: `index.html:4891-4914`
- Modify: `index.html:5361-5452`

**Interfaces:**
- Consumes: `DEFAULT_MARKDOWN: string`、`exportMindMapToMarkdown(): string`、`APP_NAME: string`、`APP_VERSION: string`、`APP_DATE: string`、`APP_TITLE: string`、`collectDiagnostics(): object`、`_safeFileBase(base: string): string`。
- Produces: 兩個納入既有 11 組 CI runner 的品牌回歸契約；不新增測試框架或檔案。

- [ ] **Step 1: 在 `runTemplateSelfTest()` 加入預設 Markdown 品牌斷言**

在既有 `const exported = exportMindMapToMarkdown();` 後加入：

```javascript
add('內建範本使用 MK2MD 品牌標題',
  /^# MK2MD · 使用說明$/m.test(DEFAULT_MARKDOWN)
  && /^# MK2MD · 使用說明$/m.test(exported),
  'MK2MD');
```

- [ ] **Step 2: 在 `runCommandPaletteSelfTest()` 加入執行期品牌與匯出 fallback 斷言**

在函式建立 `checks` 與 `add` helper 後、既有命令面板操作測試前加入：

```javascript
const brandNameEl = document.getElementById('brandName');
const diagnostics = collectDiagnostics();
add('現行品牌名稱集中為 MK2MD',
  APP_NAME === 'MK2MD'
  && APP_VERSION === '10.73'
  && APP_DATE === '2026-07-17'
  && APP_TITLE === 'MK2MD v10.73'
  && document.title === APP_TITLE
  && !!brandNameEl
  && brandNameEl.textContent === APP_NAME
  && diagnostics.app === APP_NAME,
  [APP_NAME, APP_VERSION, APP_DATE, APP_TITLE, document.title,
    brandNameEl && brandNameEl.textContent, diagnostics.app].join('|'));
add('無文件名稱時匯出 fallback 使用 MK2MD',
  _safeFileBase('') === APP_NAME,
  _safeFileBase(''));
```

- [ ] **Step 3: 先跑語法檢查，確認測試本身沒有語法錯誤**

Run:

```powershell
node -e "const fs=require('fs'),vm=require('vm');const html=fs.readFileSync('index.html','utf8');const active=html.slice(html.indexOf('-->')+3);const scripts=[...active.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);if(!scripts.length)throw new Error('No inline script found');scripts.forEach((code,i)=>new vm.Script(code,{filename:'index-inline-'+(i+1)+'.js'}));console.log('syntax ok');"
```

Expected: exit code 0 並輸出 `syntax ok`。

- [ ] **Step 4: 跑本機完整自我測試並確認是預期的 RED**

使用 Task 1 Step 4 的同一段本機 HTTP／Chrome 指令，但將檢查條件改成：

```powershell
if ($dom -notmatch 'data-ci-self-test="fail"' -or $dom -notmatch 'data-ci-self-test-failed="2"') {
  throw 'Expected exactly two brand-related self-test groups to fail on v10.72.'
}
'RED confirmed: template and command-palette groups fail on old branding'
```

Expected: 整體為 fail，恰有 2 組失敗；失敗來源是範本品牌與命令面板／品牌契約。若測試在尚未實作時意外通過，停止並修正測試，不能直接進入 GREEN。

### Task 3: 實作 MK2MD、同步 v10.73 文件並完成 GREEN

**Files:**
- Modify: `index.html:5-6,27-31,269,684,726-732,758,786,884,983,1048-1052,3030-3031,5673,5829`
- Modify: `README.md:1-14,43`
- Modify: `PROJECT_RULES.md:1`
- Modify locally only: `agent.md:1`
- Modify locally only: `design.md:1,7`

**Interfaces:**
- Consumes: Task 2 的品牌契約。
- Produces: `APP_NAME = 'MK2MD'`、`APP_TITLE = 'MK2MD v10.73'`、左側 `#brandName`、診斷品牌值與 `MK2MD` 匯出 fallback；README 與規範同步 v10.73。

- [ ] **Step 1: 更新 `index.html` 版本標頭與新增 v10.73 Changelog 條目**

將版本標頭改為：

```text
Version: v10.73
Last updated: 2026-07-17
```

在最新 Changelog 之前新增：

```text
- 2026-07-17 v10.73：現行產品品牌統一為 MK2MD；同步瀏覽器標題、品牌卡、診斷、console 標籤、預設 Markdown、匯出 fallback、README 與專案規範；新增品牌回歸自我測試。
```

不要修改任何較舊 Changelog 文字。

- [ ] **Step 2: 將靜態標題與品牌卡改成可由 `APP_NAME` 同步**

靜態標題改為：

```html
<title>MK2MD</title>
```

品牌卡標頭改為：

```html
<div class="floatwin" id="fwBrand"><div class="fwhead fwbrand">🧠 <span id="brandName">MK2MD</span></div>
```

這兩處的 `MK2MD` 是 JavaScript 尚未執行前的 fallback；執行期仍由 Step 3 的 `APP_NAME` 覆蓋。

- [ ] **Step 3: 集中執行期品牌、版本與 DOM 同步**

將常數與初始化區更新為：

```javascript
const APP_NAME = 'MK2MD';
const APP_VERSION = '10.73';
const APP_TITLE = APP_NAME + ' v' + APP_VERSION;
const APP_DATE = '2026-07-17';
function syncAppTitle(){ document.title = APP_TITLE; }
syncAppTitle();
{
  const brand = document.getElementById('brandName');
  if(brand) brand.textContent = APP_NAME;
  const version = document.getElementById('appVersion');
  if(version) version.textContent = 'v' + APP_VERSION + ' · ' + APP_DATE;
}
```

- [ ] **Step 4: 讓 console 與診斷資訊使用 `APP_NAME`**

將四個現行 console label 的硬編碼品牌改為同一模式：

```javascript
console.warn('[' + APP_NAME + ']', message);
```

各處保留原本的其餘參數與訊息，只替換 `MD心智圖` label。將 `collectDiagnostics()` 內的 app 欄位改為：

```javascript
app: APP_NAME,
```

- [ ] **Step 5: 讓無文件名稱時的匯出 basename 使用 `APP_NAME`**

保留既有文件名稱與根節點名稱的優先順序，只將兩個最末 fallback 改為：

```javascript
function _safeFileBase(base){
  return (String(base || APP_NAME).trim() || APP_NAME)
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 120);
}
function _expName(ext){
  const rootTitle = roots && roots[0] && roots[0].title;
  return _safeFileBase(currentName || rootTitle || APP_NAME) + '.' + ext;
}
```

如果原始函式排版是單行，維持原專案格式亦可，但邏輯必須完全相同。

- [ ] **Step 6: 更新現行預設 Markdown 品牌文字**

將預設文件主標題改為：

```markdown
# MK2MD · 使用說明
```

將說明瀏覽器標題的句子中，現行產品名稱改為 `MK2MD`；保留通用「心智圖」功能用語。

- [ ] **Step 7: 同步 tracked 文件的名稱、版次與部署指令**

`README.md` 的現行內容改為：

```markdown
# MK2MD

MK2MD 是單檔 HTML Markdown 心智圖編輯器。
```

版本資訊改為 `v10.73` 與 `2026-07-17`，部署範例改為：

```powershell
.\deploy.ps1 -Message "Deploy v10.73"
```

保留 README 中歷史備份檔名與 repository／Pages URL。`PROJECT_RULES.md` 第一行改為：

```markdown
# MK2MD 專案規範
```

- [ ] **Step 8: 只在本機同步未追蹤接手文件的現行名稱**

`agent.md` 第一行改為：

```markdown
# MK2MD 接手指南（工程師 / AI Agent）
```

`design.md` 第一行與第一個現行產品描述改為：

```markdown
# MK2MD 系統設計與技術架構
```

```markdown
MK2MD 是一個
```

只替換句首產品名稱，保留同一句後續既有內容。不要把 `agent.md`、`design.md` 加入 Git；它們的 v10.69 舊基準敘述留待部署後列為文件補強建議。

- [ ] **Step 9: 跑品牌來源掃描與文件一致性檢查**

Run:

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');const active=s.slice(s.indexOf('-->')+3);const hits=[...active.matchAll(/MD心智圖/g)];if(hits.length)throw new Error('Active legacy brand occurrences: '+hits.length);console.log('active legacy brand occurrences: 0');"
rg -n "MD心智圖|MD 心智圖|v10\.70|2026-07-14|Deploy v10\.70" README.md PROJECT_RULES.md agent.md design.md
rg -n "APP_NAME|APP_VERSION|APP_DATE|brandName|MK2MD" index.html README.md PROJECT_RULES.md agent.md design.md
```

Expected:

- `index.html` 註解 Changelog 之後沒有 `MD心智圖`。
- 第一個 `rg` 只允許 README 的歷史備份檔名，以及 `agent.md`／`design.md` 尚未現代化的歷史或 v10.69 基準內容；不得出現在現行標題、產品描述或部署指令。
- 第二個 `rg` 顯示 v10.73 執行期品牌、品牌 DOM 與所有現行文件標題均為 `MK2MD`。

- [ ] **Step 10: 執行 GREEN 語法與 11 組瀏覽器自我測試**

先執行 Task 2 Step 3 的 Node 語法檢查，再執行 Task 1 Step 4 的本機 HTTP／Chrome 檢查。

Expected:

- Node exit code 0。
- `data-ci-self-test="pass"`。
- `data-ci-self-test-passed="11"`。
- `data-ci-self-test-failed="0"`。
- 左側品牌卡文字為 `MK2MD`，瀏覽器標題為 `MK2MD v10.73`。

- [ ] **Step 11: 用真實瀏覽器確認品牌畫面與 console 沒有回歸**

在本機 `http://127.0.0.1:8772/index.html?ci-selftest=1` 開啟全新的 Chrome 自動化頁面，等待 `<html data-ci-self-test="pass">`，並讀取 `document.title`、`#brandName.textContent`、所有 console 訊息與未捕捉的 page error。

Expected:

- `document.title` 恰為 `MK2MD v10.73`。
- `#brandName.textContent` 恰為 `MK2MD`。
- page error 為 0、console error 為 0。
- Canvas `willReadFrequently` warning 不得多於 Task 1 記錄的既有基準；如數量增加，停止部署並診斷。

- [ ] **Step 12: 檢查 diff、版本與未追蹤範圍**

Run:

```powershell
$repo = $PWD.Path
git --git-dir="$repo\.git" --work-tree="$repo" diff --check
git --git-dir="$repo\.git" --work-tree="$repo" diff -- index.html README.md PROJECT_RULES.md
git --git-dir="$repo\.git" --work-tree="$repo" status --short
```

Expected:

- `diff --check` 無輸出。
- tracked 差異只有 `index.html`、`README.md`、`PROJECT_RULES.md` 的核准品牌／版本範圍。
- `agent.md`、`design.md` 仍顯示為未追蹤；沒有新增測試產物或其他意外檔案。

- [ ] **Step 13: 明確 staging 並建立 v10.73 實作 commit**

Run:

```powershell
$repo = $PWD.Path
git --git-dir="$repo\.git" --work-tree="$repo" add -- index.html README.md PROJECT_RULES.md
git --git-dir="$repo\.git" --work-tree="$repo" diff --cached --check
git --git-dir="$repo\.git" --work-tree="$repo" diff --cached --name-only
git --git-dir="$repo\.git" --work-tree="$repo" commit -m "Rename product brand to MK2MD"
```

Expected: staged 檔案恰為 `index.html`、`README.md`、`PROJECT_RULES.md`，commit 成功；不得使用 `git add .`。

### Task 4: 部署到原 GitHub Pages 並驗證正式站

**Files:**
- Deploy unchanged workflow: `.github/workflows/pages.yml`
- Deploy tracked release files: `index.html`, `README.md`, `PROJECT_RULES.md`

**Interfaces:**
- Consumes: Task 3 已通過本機 11/11 的 `master` commits。
- Produces: 既有 Pages URL 上的 v10.73，以及成功的既有 Actions workflow run。

- [ ] **Step 1: 推送既有 `master`，不建立新平台資源**

Run:

```powershell
$repo = $PWD.Path
git --git-dir="$repo\.git" --work-tree="$repo" status --short --branch
git --git-dir="$repo\.git" --work-tree="$repo" push origin master
```

Expected: push 到 `green-tea-king/md-mind-map` 的既有 `master` 成功；不 force push、不建立新 repository 或 Pages site。

- [ ] **Step 2: 找到並等待這次 GitHub Actions Pages workflow**

Run:

```powershell
$run = gh run list --repo green-tea-king/md-mind-map --workflow pages.yml --branch master --limit 1 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json
$run | Format-List
gh run watch $run.databaseId --repo green-tea-king/md-mind-map --exit-status
```

Expected: head SHA 等於本機 `HEAD`，workflow 結論為 `success`。若失敗，停止，不宣稱已部署成功。

- [ ] **Step 3: 驗證正式站 HTML 是 v10.73／MK2MD**

Run:

```powershell
$head = git --git-dir="$PWD\.git" --work-tree="$PWD" rev-parse HEAD
$url = "https://green-tea-king.github.io/md-mind-map/?verify=$head"
$live = (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 30).Content
if ($live -notmatch "const APP_NAME = 'MK2MD';") { throw 'Live APP_NAME is not MK2MD.' }
if ($live -notmatch "const APP_VERSION = '10.73';") { throw 'Live APP_VERSION is not 10.73.' }
if ($live -notmatch '<title>MK2MD</title>') { throw 'Live static title is not MK2MD.' }
'live source: MK2MD v10.73'
```

Expected: `live source: MK2MD v10.73`。

- [ ] **Step 4: 在正式站跑 11 組瀏覽器自我測試**

Run:

```powershell
$head = git --git-dir="$PWD\.git" --work-tree="$PWD" rev-parse HEAD
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$liveUrl = "https://green-tea-king.github.io/md-mind-map/?ci-selftest=1&verify=$head"
$cmdLine = '"' + $chrome + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-background-timer-throttling --virtual-time-budget=30000 --dump-dom "' + $liveUrl + '"'
$dom = (& $env:ComSpec /d /s /c $cmdLine 2>$null) -join "`n"
if ($LASTEXITCODE -ne 0) { throw "Chrome dump-dom failed with exit code $LASTEXITCODE." }
if ($dom -notmatch 'data-ci-self-test="pass"' -or $dom -notmatch 'data-ci-self-test-passed="11"' -or $dom -notmatch 'data-ci-self-test-failed="0"') {
  throw 'Live browser self-test did not pass 11/11.'
}
if ($dom -notmatch '<title>MK2MD v10\.73</title>' -or $dom -notmatch 'id="brandName">MK2MD</span>') {
  throw 'Live browser branding is not MK2MD v10.73.'
}
'live browser: MK2MD v10.73, 11 passed, 0 failed'
```

Expected: `live browser: MK2MD v10.73, 11 passed, 0 failed`。

- [ ] **Step 5: 用真實瀏覽器確認正式站 console 與可見品牌**

在全新的 Chrome 自動化頁面開啟 `https://green-tea-king.github.io/md-mind-map/?ci-selftest=1`，等待 `<html data-ci-self-test="pass">`，讀取 `document.title`、`#brandName.textContent`、console 訊息與未捕捉的 page error。

Expected: 標題為 `MK2MD v10.73`、品牌卡為 `MK2MD`、page error 為 0、console error 為 0，且沒有比 Task 1 基準新增的 warning。若不符合，回報正式站驗證失敗，不宣稱部署完成。

### Task 5: 比對本機、Git 與正式站落差並提出後續建議

**Files:**
- Inspect: all tracked and untracked project files
- Inspect live: `https://green-tea-king.github.io/md-mind-map/`

**Interfaces:**
- Consumes: 已成功部署的 v10.73 SHA、Actions URL 與正式站結果。
- Produces: 台灣繁體中文收尾報告；不在此任務自動修改或刪除其他檔案。

- [ ] **Step 1: fetch 並確認本機 HEAD 與 `origin/master` 一致**

Run:

```powershell
$repo = $PWD.Path
git --git-dir="$repo\.git" --work-tree="$repo" fetch origin master
$head = git --git-dir="$repo\.git" --work-tree="$repo" rev-parse HEAD
$origin = git --git-dir="$repo\.git" --work-tree="$repo" rev-parse origin/master
"HEAD=$head"
"origin/master=$origin"
git --git-dir="$repo\.git" --work-tree="$repo" status --short --branch
```

Expected: `HEAD` 等於 `origin/master`；branch 不再 ahead／behind；只剩原有本機未追蹤檔案。

- [ ] **Step 2: 核對未追蹤檔案與基準雜湊**

Run:

```powershell
$repo = $PWD.Path
$untracked = git -c core.quotepath=false --git-dir="$repo\.git" --work-tree="$repo" ls-files --others --exclude-standard
$finalHashes = foreach ($path in $untracked) {
  Get-FileHash -LiteralPath (Join-Path $repo $path) -Algorithm SHA256 |
    Select-Object @{Name='Path';Expression={$path}}, Hash
}
$finalHashes | Format-Table -AutoSize
```

Expected: 除已核准同步品牌的 `agent.md`、`design.md` 外，其餘既有未追蹤檔案 SHA-256 與 Task 1 相同；不得有新的專案內測試產物。

- [ ] **Step 3: 整理本機／Git／正式站三方版本證據**

Run:

```powershell
rg -n "Version: v10\.73|Last updated: 2026-07-17|const APP_NAME = 'MK2MD'|const APP_VERSION = '10\.73'|const APP_DATE = '2026-07-17'" index.html
rg -n "MK2MD|v10\.73|2026-07-17|\.\\deploy\.ps1" README.md PROJECT_RULES.md
gh run list --repo green-tea-king/md-mind-map --workflow pages.yml --branch master --limit 1 --json headSha,conclusion,url,updatedAt
```

Expected: 本機與 Git SHA 相同，正式站來源為 `MK2MD v10.73`，最新 workflow 為 success。

- [ ] **Step 4: 用固定七項格式回報並列出不自動執行的建議**

回報必須包含：

1. 這次完成全面現行品牌改名、v10.73、測試與既有 Pages 部署。
2. tracked 修改檔案為 `index.html`、`README.md`、`PROJECT_RULES.md`；本機未追蹤品牌同步為 `agent.md`、`design.md`；另有已核准的規格與計畫文件 commits。
3. 版本號為 `v10.73`。
4. 列出 Node 語法、RED 證據、本機 11/11、`git diff --check`、Actions success、正式站 11/11 的實際結果。
5. 是否已部署：是，僅限原 GitHub Pages 專案。
6. 部署 URL：`https://green-tea-king.github.io/md-mind-map/`，並附 Actions run URL、部署完成時間與 HEAD SHA。
7. 尚未處理／建議後續：建立或補強 `AGENTS.md`、決定是否追蹤 `agent.md`／`design.md`、把兩份 v10.69 舊文件完整同步到 v10.73、修正 `deploy.ps1` 只 staging 部分檔案的風險、統一版本來源規則、另案處理 Canvas `willReadFrequently` 警告。這些建議本次都不直接修改。

---

## Plan Self-Review

- Spec coverage: 品牌來源、UI、頁籤、診斷、console、預設 Markdown、匯出 fallback、版本、tracked／local-only 文件、RED／GREEN、本機／CI／正式站驗證、原平台部署與部署後落差均有對應任務。
- Placeholder scan: 計畫沒有 `TBD`、`TODO`、未定檔名、未定函式或要求實作者自行補內容的步驟。
- Type consistency: 所有測試與實作使用既有 `string` 常數、DOM element、plain object 診斷值與 `_safeFileBase(base: string): string`；函式與欄位名稱前後一致。
- Scope control: 沒有檔案刪除、移動、重新命名、依賴升級、repo slug 變更、部署平台變更或歷史內容改寫。
