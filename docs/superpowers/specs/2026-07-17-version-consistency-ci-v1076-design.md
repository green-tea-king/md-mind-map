# MK2MD v10.76 版本一致性 CI 防呆設計

## 背景

MK2MD 的目前版本會同步出現在 `AGENTS.md`、`README.md` 與 `index.html` 的多個指定位置。v10.75 已把版本同步規則集中到 `AGENTS.md`，但現有 GitHub Pages workflow 只執行 11 組瀏覽器自我測試；若某個版本欄位漏改，仍可能通過功能測試並部署。

## 目標

在既有 GitHub Pages workflow 中加入可重複執行的版本一致性 gate。gate 必須在準備 Pages artifact 與瀏覽器自我測試之前執行；任何指定欄位不一致時停止部署，並清楚列出問題位置、預期值與實際值。

本次交付版本為 `v10.76`，日期為 `2026-07-17`。

## 非目標

- 不修改 MK2MD 的 UI、功能、資料格式或 11 組自我測試行為。
- 不修改 `PROJECT_RULES.md`。
- 不新增 PR workflow、repository、branch、Pages site 或其他部署平台。
- 不新增 `package.json`、npm 套件或其他外部依賴。
- 不改變 Pages artifact；正式網站仍只包含 `index.html` 與 `.nojekyll`。
- 不讀取、修改、納管或刪除既有七個未追蹤檔案。

## 方案比較與決策

### A. 獨立 Node.js 檢查程式與測試（採用）

新增可由本機及 CI 共用的 Node.js 腳本，將解析、驗證與錯誤格式集中管理。優點是規則可測試、錯誤清楚，且不受 YAML 引號或 shell grep 的模糊比對影響；代價是新增兩個維護檔案。

### B. 將 Node.js 邏輯直接寫入 workflow

可少一個正式腳本，但程式藏在 YAML heredoc 中，測試、重用及引號維護都較困難，因此不採用。

### C. 使用 shell 與 grep

實作最短，但容易把歷史 Changelog 的舊版本當成目前版本，也難以產生準確錯誤訊息，因此不採用。

## 架構與檔案責任

### `scripts/check-version-consistency.js`

- 只使用 Node.js 內建的 `fs`、`path` 等模組。
- 匯出純驗證介面，讓測試直接傳入文字內容，不需修改正式檔案。
- 命令列模式從指定根目錄讀取 `AGENTS.md`、`README.md` 與 `index.html`；根目錄預設為目前工作目錄。
- 從 `AGENTS.md` 首段取得唯一的基準版本與日期。
- 以區段或具名欄位為邊界擷取目前值，不進行全檔版本字串計數。
- 收集全部問題後統一輸出；有任何問題時以非零狀態結束，全部一致時輸出通過摘要並以 0 結束。
- 不寫入、不修正也不刪除任何檔案。

### `scripts/check-version-consistency.test.js`

- 使用 Node.js 內建 `assert`，不引入 test runner 或外部依賴。
- 直接測試正式檢查模組的公開介面。
- 使用記憶體中的最小文字 fixture，避免碰觸正式版本檔案。
- 以明確的通過／失敗摘要及程序狀態供本機和 CI 使用。

### `.github/workflows/pages.yml`

`build` job 的順序調整為：

1. Checkout。
2. 執行 `node scripts/check-version-consistency.test.js`。
3. 執行 `node scripts/check-version-consistency.js`。
4. 準備只含 `index.html` 與 `.nojekyll` 的 site 目錄。
5. 執行既有 Chrome 11/11 自我測試 gate。
6. 上傳 Pages artifact；`deploy` job 成功後才發布。

workflow 的觸發條件維持 `master` push 與 `workflow_dispatch`，不新增 PR 觸發。

## 基準資料與檢查契約

`AGENTS.md` 首段的「基準版本為 `v<version>`（`<date>`）」是唯一基準。若基準缺失、格式錯誤或出現多個目前基準，gate 必須失敗。

以下指定位置必須與基準一致：

1. `AGENTS.md` 首段基準版本與日期。
2. `index.html` 檔頭 `Version`。
3. `index.html` 檔頭 `Last updated`。
4. `index.html` 的 `APP_VERSION`。
5. `index.html` 的 `APP_DATE`。
6. `index.html` 最新 Changelog 第一項的版本與日期。
7. 品牌自我測試中的 `APP_VERSION` 預期值。
8. 品牌自我測試中的 `APP_DATE` 預期值。
9. 品牌自我測試中的 `APP_TITLE` 預期值。
10. README `Current Version` 區段的 Version。
11. README `Current Version` 區段的 Date。
12. README Deployment 區段的 `deploy.ps1` 訊息版號。

舊 Changelog、歷史文字與歷史檔名可保留舊版本，不得因此誤判。每個具名的目前版本欄位必須能唯一辨識；缺少或無法唯一辨識時視為結構錯誤並失敗。

## 公開介面與資料流

正式模組提供一個純驗證入口，接收三份文字內容並回傳結構化結果：

```js
validateVersionConsistency({ agentsText, readmeText, indexText })
// => { ok: boolean, version: string, date: string, issues: Array<{ field, expected, actual }> }
```

命令列流程為：讀檔 → 呼叫純驗證入口 → 格式化所有問題 → 設定 exit code。測試只呼叫純驗證入口；CI 先執行測試，再執行實際 repository gate。

## 錯誤處理

- 無法讀取必要檔案：指出檔案路徑並失敗。
- 找不到或重複找到基準／指定欄位：以該欄位的結構錯誤失敗。
- 值不一致：輸出欄位、基準預期值與實際值。
- 同時有多個錯誤：一次列出全部，避免逐次修正才看到下一個問題。
- 檢查程式本身發生未預期例外：輸出例外訊息並以非零狀態結束。

## 測試設計與 TDD

依 Red-Green-Refactor 執行：

1. 先新增測試，引用尚不存在的檢查模組；確認因缺少正式模組而失敗。
2. 實作最小純驗證介面與 CLI，讓一致 fixture 通過。
3. 逐項加入失敗 fixture，至少涵蓋：`APP_VERSION`、README Current Version、最新 Changelog、品牌自我測試、缺失／重複欄位。
4. 加入含舊版 Changelog 的一致 fixture，證明歷史版本不會造成誤判。
5. 將專案同步到 v10.76，執行實際 repository gate。
6. 執行語法檢查、既有 11/11 本機瀏覽器測試、Git diff 與受保護未追蹤檔案檢查。

## 版本同步

本次依 `AGENTS.md` 更新：

- `AGENTS.md` 首段為 v10.76／2026-07-17。
- `index.html` 檔頭、`APP_VERSION`、`APP_DATE`、最新 Changelog 與品牌自我測試預期值。
- README Current Version、日期與部署範例。

新增的 Changelog 只描述版本一致性 CI gate，不改寫任何舊紀錄。

## 部署與驗收

完成本機驗證後，只推送既有 `origin/master`。必須確認該 HEAD 對應的 `Deploy GitHub Pages` workflow 為 `completed/success`，再使用 cache-busted 正式 URL 驗證：

- `document.title` 為 `MK2MD v10.76`。
- `#brandName` 為 `MK2MD`。
- `data-ci-self-test="pass"`、passed `11`、failed `0`。
- console error 與 page error 都是 0。
- Canvas `willReadFrequently` warning 不超過既有基準 6。

## 風險與控制

- **格式變更造成誤判：** 所有擷取器都以 fixture 測試；錯誤訊息指出結構或欄位名稱。
- **規則重複：** `AGENTS.md` 保持人類可讀的權威規則，腳本只將同一契約自動執行，不建立新的版本來源。
- **CI 環境差異：** 腳本只使用 GitHub-hosted runner 已有的 Node.js 與內建模組，不下載依賴。
- **部署受阻：** gate 失敗時不會上傳或發布新 artifact；既有正式站維持上一個成功版本。
- **非預期檔案被納管：** staging 僅使用明確 allowlist，提交前核對 staged file list。

## 完成條件

- 檢查程式測試能先失敗後通過，所有設計案例均通過。
- 實際 repository gate 在 v10.76 資料上通過。
- workflow 在版本 gate 通過後才準備及部署 Pages artifact。
- 既有 11/11 自我測試、本機 Chrome 與正式站驗證通過。
- 正式站 artifact 範圍、產品行為與七個未追蹤檔案保持不變。
