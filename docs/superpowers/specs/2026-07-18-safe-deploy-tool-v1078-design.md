# MK2MD v10.78 安全部署工具設計

日期：2026-07-18

狀態：使用者已逐段核准，待實作計畫

目前基準：v10.77，commit `3850b36ccd2918bbdaff8de1b546254fa253cd54`

## 背景

目前根目錄 `deploy.ps1` 是未追蹤的本機工具。它會自行 stage、commit 與 push，只檢查正式站是否出現相同 `APP_VERSION`，沒有涵蓋現行多檔版本規則、精確 HEAD Actions、cache-busted live source、11/11 或 console/page error gate。

這會造成四類風險：

1. 把呼叫前已暫存的其他檔案一起 commit。
2. 已完成 release commit、工作樹乾淨時反而不 push。
3. Git native command 失敗後仍繼續執行並可能誤報成功。
4. 舊正式站若剛好是相同版號，可能被誤認為本次 HEAD 已部署。

v10.78 將把部署工具改為 fail-closed：只部署已提交、已驗證且範圍清楚的精確 HEAD。腳本不再負責建立 release commit。

## 目標

- 保留根目錄 `deploy.ps1` 路徑並納入 Git，不建立新專案、不搬移檔案。
- 部署目標固定為既有 `green-tea-king/md-mind-map`、`master` 與原 GitHub Pages。
- 推送前執行完整版本、語法、Git、保護檔與本機 Chrome gates。
- 只接受 local HEAD 已包含 remote master，或兩者完全相同；遠端領先或分岔時停止。
- push 後只接受 `headSha` 等於 local HEAD 的 Pages run，且 build/deploy 都成功。
- 正式站必須與本機 `index.html` 相符，並通過 cache-busted Chrome 11/11、0 error gate。
- 所有 native command 都檢查 exit code；任何失敗立即停止。
- 提供不產生外部寫入的 `-DryRun`。

## 非目標

- 不自動執行 `git add`、`git commit`、rebase、merge、rollback 或 force push。
- 不建立 branch、repository、Pages site、worktree 或新部署平台。
- 不刪除檔案、資料、Git 歷史、Actions run、Pages 資源或瀏覽器資料。
- 不加入 npm、Playwright、Pester 或其他第三方依賴。
- 不改變網站產品功能、UI、保存模型或 Pages artifact 範圍。

## 核准架構

### `deploy.ps1`

唯一正式部署入口，留在根目錄並納入 Git。責任分成可獨立測試的函式：

- native command fail-closed wrapper。
- repository、branch、origin、工作樹與版本 preflight。
- 六個本機未追蹤檔的 snapshot 與前後比對。
- local/remote commit 關係判定。
- installed Chrome／DevTools browser gate。
- exact-HEAD Actions run 選取與等待。
- cache-busted live source 與 live browser 驗證。
- 最終證據輸出。

腳本被 dot-source 時只載入函式，不執行部署，供 dependency-free 測試呼叫。

### `scripts/test-deploy.ps1`

使用 PowerShell 內建能力與 mock command adapter 測試 `deploy.ps1` 的決策與錯誤處理；測試不得連線 GitHub、push、啟動正式部署或修改 repository。它會在本機 preflight 與現有 Pages workflow 內執行。

### 現有 Pages workflow

在準備 artifact 之前加入：

```powershell
pwsh -NoProfile -File scripts/test-deploy.ps1
```

現有 Ubuntu runner 提供 PowerShell；實作時以真實 Actions run 驗證。Pages artifact 仍只包含 `site/index.html` 與 `site/.nojekyll`。

## CLI 契約

### Dry run

```powershell
.\deploy.ps1 -DryRun
```

執行所有不需要外部寫入的本機檢查，列出：

- version/date。
- local HEAD、remote master 與兩者關係。
- 待推 commits 與 changed paths。
- 本機 Chrome gate 結果。
- 六個未追蹤檔的 SHA-256 snapshot。

不得 push、觸發 workflow 或宣稱已部署。

### 實際部署

```powershell
# Deploy v10.78
.\deploy.ps1 -ExpectedHead <完整 40 字元 SHA>
```

`-ExpectedHead` 必須與執行當下 local HEAD 完全相同，否則停止。這是實際 push 的明確確認，不接受縮寫、空值或自動猜測。

舊 `-Message` 參數移除，因為腳本不再建立 commit。README 部署範例改以緊鄰命令的 `# Deploy v<current>` 註解保留目前版本契約；版本一致性 checker 與測試必須同步改為解析此註解和新的 `-ExpectedHead` 命令結構。

## 部署前流程

依下列順序執行；任一步失敗都不得進入下一步：

1. 從腳本路徑定位 repository，不依賴呼叫者目前目錄。
2. 確認 branch 為 `master`，origin slug 精確為 `green-tea-king/md-mind-map`。
3. 只讀檢查 `gh auth status`、repository push permission 與 remote 可達性；不執行會改寫 credential 設定的 `gh auth setup-git`。
4. 確認 tracked worktree 與 index 都乾淨。
5. 確認未追蹤路徑精確為下列六個：
   - `BACKUP_MANIFEST.md`
   - `MD心智圖_v10_00.html`
   - `agent.md`
   - `clear-auto-draft.html`
   - `design.md`
   - `repository-history.bundle`
6. 記錄六檔 SHA-256；部署完成前不得改變。
7. 執行 `scripts/test-deploy.ps1`。
8. 執行 `scripts/check-version-consistency.test.js` 與 repository gate。
9. 執行 PowerShell AST、兩個 Node checker 與單一 inline app script 語法檢查。
10. 啟動本機 HTTP server，以 installed Chrome 驗證版本、日期、品牌、11/11、failed 0、console/page errors 0、warnings 不超過 6。
11. 關閉腳本自己啟動的 Chrome 與 server，確認 listener 歸零；不刪除任何檔案。
12. 取得 remote master 並顯示 local-only commits、changed paths 與 release SHA。

## Local/remote 決策

| 狀態 | 行為 |
|---|---|
| local HEAD 等於 remote master | 不 push；進入 exact-HEAD Actions 與 live 重新驗證 |
| remote master 是 local HEAD 的 ancestor | `-DryRun` 只顯示；實際模式核對 `-ExpectedHead` 後 push |
| remote master 領先 local HEAD | 停止，要求先安全合併遠端 |
| local 與 remote 分岔 | 停止，不 rebase、不 merge、不 force push |
| branch、origin 或 expected SHA 不符 | 停止 |

所有 `git`、`gh`、`node`、`python` 與 Chrome 呼叫都經由同一 native wrapper。PowerShell 的 `$ErrorActionPreference = 'Stop'` 不視為 native command 成功保證；wrapper 必須檢查 exit code 並保留 stdout/stderr。

## Browser gate

不新增第三方瀏覽器依賴。`deploy.ps1` 使用 `.NET Process` 啟動已安裝的 Chrome headless，並透過 loopback Chrome DevTools Protocol 取得：

- `Runtime.consoleAPICalled` 的 error/warning 類型。
- `Runtime.exceptionThrown` 頁面例外。
- DOM 中的 title、brand、version/date 與 `data-ci-self-test-*`。

本機網址使用 HTTP，不使用 `file://`。Chrome 與 server 都必須保存精確 PID，只能停止本次腳本啟動的 process。不得在 repository 建立 `.playwright-cli`、browser profile 或其他測試產物。

## Push、Actions 與正式站

1. 實際模式只執行 `git push origin master`；禁止 force。
2. push 後重驗 local HEAD、`origin/master` 與 remote master 三方相等。
3. 輪詢 Pages workflow，最多等待 exact `headSha` run 出現，不得重用其他 SHA 的舊 run。
4. 使用 `gh run watch --exit-status`，再確認 run、build job 與 deploy job 都是 `completed/success`；Actions 總等待上限 10 分鐘。
5. 建立 `?ci-selftest=1&t=<full-head-sha>` cache-busted URL。
6. 正式站 source 最多等待 5 分鐘；HTTP 必須是 200，且線上 `index.html` SHA-256 必須等於本機 `index.html`。
7. 以 installed Chrome 對 cache-busted URL 重跑版本、日期、品牌、11/11、failed 0、console/page errors 0、warnings不超過 6。
8. 關閉本次 Chrome，重驗六個未追蹤檔 SHA、tracked/index、HEAD/remote 與 process/listener 狀態。

任一步失敗都停止並回報已完成到哪一階段、精確命令／exit code、HEAD、Actions URL（若已有）及尚未驗證事項。不自動重跑、rollback 或修改其他外部狀態。

## 測試契約

`scripts/test-deploy.ps1` 至少涵蓋：

1. 正確 repository/master/乾淨 HEAD 通過 preflight。
2. dirty tracked、staged path、額外／缺少未追蹤檔皆失敗。
3. origin、branch、`ExpectedHead` 不符皆失敗。
4. remote equal、local ahead、remote ahead、diverged 四種決策。
5. 任一 native command 非零都立即停止，不繼續到 push/live。
6. exact-HEAD run 選取，不得接受其他 SHA。
7. Actions timeout、failed/cancelled、job failure 皆失敗。
8. live HTTP、source hash、version/date/brand、自測與 browser errors/warnings fixtures。
9. 六個未追蹤檔前後 hash 差異失敗。
10. source contract 確認部署主流程沒有 `git add`、`git commit`、force push、刪除或 rollback 命令。
11. `-DryRun` 不呼叫 push、Actions watch 或 live deployment success reporting。

測試使用注入的 command/browser adapters，不以修改真實 `.git`、遠端、credential 或正式站來建立 fixture。

## v10.78 預計修改範圍

- `deploy.ps1`：改寫並納入 Git。
- `scripts/test-deploy.ps1`：新增 dependency-free 部署契約測試。
- `scripts/check-version-consistency.js`：README deploy example 改驗證 `# Deploy v<current>` 與 `-ExpectedHead` 新 CLI 結構。
- `scripts/check-version-consistency.test.js`：保留既有 fixture 版本語意並增加新 CLI 的接受／拒絕案例。
- `.github/workflows/pages.yml`：在 artifact 前加入部署腳本測試。
- `AGENTS.md`：基準版本、部署腳本狀態與六個未追蹤檔規則。
- `README.md`：v10.78、日期、新 CLI 與工具已納管說明。
- `index.html`：v10.78 檔頭、日期、最新 Changelog、APP 常數與品牌自測預期。
- 本設計與後續實作計畫文件。

不修改 `PROJECT_RULES.md`、產品 UI/行為、`.nojekyll` 或剩餘六個未追蹤檔。

## 驗收標準

- 部署契約測試與既有版本測試全部通過。
- `-DryRun` 完成全部本機 gates 且外部狀態不變。
- `deploy.ps1` 無 stage/commit/delete/force/rollback 路徑。
- local HEAD、origin/master、remote master、Actions head SHA 與 live source 對應同一 v10.78 commit。
- 本機與正式站 Chrome 都是 11/11、failed 0、console/page errors 0、warnings不超過 6。
- Pages artifact 仍精確為 `index.html` 與 `.nojekyll`。
- 六個本機未追蹤檔部署前後路徑與 SHA-256 不變。
- 沒有新增 repository、branch、worktree、site、平台、瀏覽器依賴或專案內測試產物。

## 風險與控制

- **腳本錯誤推送：** clean-state、exact SHA、ancestor 與原 origin/master gates；無 force。
- **誤選舊 Actions：** 只接受完整 HEAD SHA。
- **正式站快取：** SHA cache-buster 加 source hash 等值。
- **Chrome/server 遺留：** 只管理保存的精確 PID，finally 中確認 listener/process 狀態。
- **WebDAV 瞬時讀取：** 內容 gate 可在讀取前確認路徑；任何失敗以全新命令完整重跑，不把部分輸出當成功。
- **本機檔案受影響：** 六檔 start/end snapshot，不 stage、不刪除。
- **CI runner 漂移：** 部署測試只依賴 runner 的 `pwsh`；若 runner 缺失，workflow fail closed，不跳過測試。
