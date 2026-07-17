# MK2MD 專案維護規範

本規範是工程師與 Codex 修改專案前的第一入口。基準版本為 `v10.76`（`2026-07-17`）。預設使用台灣繁體中文協作。

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

1. `AGENTS.md` 首段基準版本與日期。
2. `index.html` 檔頭 Version 與 Last updated。
3. `APP_VERSION` 與 `APP_DATE`。
4. 最新 Changelog 項目。
5. 品牌自我測試內的 `APP_VERSION === '<current>'` 預期值。
6. 品牌自我測試內的 `APP_TITLE === 'MK2MD v<current>'` 預期值。
7. README Current Version、日期與部署範例。

不要改寫舊 Changelog 或歷史檔名。

## 7. 必要驗證

- 用 Node `vm.Script` 解析 HTML header comment 之後抽出的 app script；應為 1 個 inline script。
- 執行 `node scripts/check-version-consistency.test.js` 與 `node scripts/check-version-consistency.js`；測試與實際 repository gate 都必須通過。
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
