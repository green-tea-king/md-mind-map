# MK2MD v10.75 版本規則一致化設計

## 目標

以 `v10.75`（`2026-07-17`）修正目前版本維護規則的兩個不阻擋問題：

1. `index.html` 檔頭仍寫「小改 +0.1、大改 +1.0」，與 `AGENTS.md` 的逐號增加規則不一致。
2. `AGENTS.md` 的版本同步清單未列出自身基準版號，以及 `index.html` 品牌自我測試內兩個硬編碼版本預期值。

完成後，未來維護者只需以根目錄 `AGENTS.md` 為版本規則真實來源，且能從同一份清單找到所有必須同步的現行版本位置。

## 已選方案

採用方案 A：建立正常的 `v10.75` release，同步修正治理文件、README 與 `index.html` 版本資料，完整驗證後部署回既有 GitHub Pages。

未採用：

- 只改說明而不升版：違反每個可交付修改都必須更新版次的現行規範。
- 本次同時新增 CI 版本一致性檢查：會擴大 workflow 與測試架構範圍，留待後續獨立任務。

## 文件權責與架構

- `AGENTS.md`：版本規則與完整同步清單的唯一工程入口。
- README：只保留目前版本、日期、部署範例與維護入口，不重複完整規則。
- `index.html`：正式產品與執行期版本來源；檔頭只提示版本規則以 `AGENTS.md` 為準。
- `.github/workflows/pages.yml`：本次不修改，繼續以既有 11 組瀏覽器自我測試作部署閘門。
- `PROJECT_RULES.md`：本次不修改；其責任仍限於 UI 功能歸屬。

## 精確變更範圍

### `AGENTS.md`

- 基準版本由 `v10.74` 更新為 `v10.75`，日期維持 `2026-07-17`。
- 保留逐號增加規則。
- 將「每次版本至少同步」改成可直接執行的完整清單：
  1. `AGENTS.md` 首段基準版本與日期。
  2. `index.html` 檔頭 Version 與 Last updated。
  3. `APP_VERSION` 與 `APP_DATE`。
  4. 最新 Changelog 項目。
  5. 品牌自我測試內 `APP_VERSION === '<current>'`。
  6. 品牌自我測試內 `APP_TITLE === 'MK2MD v<current>'`。
  7. README Current Version、日期與部署範例。
- 不改其他產品決策、安全規則、Git 規則或部署平台資訊。

### `index.html`

- Version 更新為 `v10.75`；Last updated 維持 `2026-07-17`。
- 將「小改 +0.1、大改 +1.0」改為「版次規則以根目錄 `AGENTS.md` 為準」，並保留畫面顯示版次與日期的說明。
- Changelog 最上方新增 v10.75 版本治理一致化紀錄；不改寫舊紀錄。
- `APP_VERSION` 更新為 `10.75`；`APP_DATE` 維持 `2026-07-17`。
- 品牌自我測試的兩個版本預期值同步為 `10.75` 與 `MK2MD v10.75`。
- 不修改 `APP_NAME`、產品 UI、資料模型、DEFAULT_MARKDOWN、匯入／匯出或其他自我測試行為。

### README

- Current Version 更新為 `v10.75`；日期維持 `2026-07-17`。
- 本機部署範例更新為 `Deploy v10.75`。
- 其他功能、保存模型、部署平台與維護規則不變。

## 明確不在範圍內

- 不修改 `.github/workflows/pages.yml`、`PROJECT_RULES.md` 或 `.nojekyll`。
- 不修改或追蹤本機 `deploy.ps1`、`agent.md`、`design.md`。
- 不刪除、搬移、改名、清理或重建任何檔案。
- 不建立新 project、worktree、branch、repository、Pages site 或部署平台。
- 不新增依賴、package、build system 或新的產品測試群組。
- 不處理六個既有 Canvas `willReadFrequently` warnings。

## 測試驅動設計

### RED

先執行新的版本治理契約，確認目前 v10.74 狀態因下列原因失敗：

- `AGENTS.md` 基準版本仍是 v10.74。
- `index.html` 仍含舊版號規則文字。
- `APP_VERSION` 與兩個硬編碼自測預期值仍是 10.74。
- README 與部署範例仍是 v10.74。

RED 必須是需求尚未實作造成的精準失敗，不得以路徑、語法或編碼錯誤代替。

### GREEN

最小修改三個 release 檔案後，執行：

- 版本治理靜態契約：所有 v10.75 來源與新同步清單存在，舊版號規則不存在。
- `AGENTS.md` 既有 12 項治理契約。
- 文件／版本一致性檢查。
- Node `vm.Script` 單一 inline app script 語法檢查。
- 本機 HTTP server 與 installed Chrome 的 11/11 自我測試。
- fresh browser session：title `MK2MD v10.75`、brand `MK2MD`、console errors 0、page errors 0、warnings 不超過 6。
- `git diff --check`、protected files 與七個既有 untracked SHA-256 檢查。

## Git 與部署流程

- 只 allowlist stage `AGENTS.md`、`README.md`、`index.html`，禁止 `git add .`。
- release commit 不得包含規格、計畫以外的意外檔案；規格與計畫可各自先建立文件 commit。
- 依使用者核准，最終普通 push 既有 `master` 到 `green-tea-king/md-mind-map`，禁止 force push。
- 等待 `.github/workflows/pages.yml` 中 head SHA 精確等於 release HEAD 的 run 完成且 conclusion 為 `success`。
- 以 cache-busted 正式 URL 驗證 source、title、brand、v10.75、11/11、console/page errors 與 warning 基準。
- workflow 或 live gate 失敗時停止，不自動 rollback、不建立替代站台。

## 安全與保護

- 工作前後比對既有七個 untracked 路徑與 SHA-256；任何差異都停止。
- `PROJECT_RULES.md`、workflow、local docs/tools 與備份不得出現在 release diff。
- WebDAV 瞬時讀取錯誤只允許重跑相同唯讀驗證；若重複或檔案 hash 改變則停止調查，不猜測修復。
- 本次沒有資料遷移、內容格式變更或需要 rollback 的產品行為。

## 完成條件

- tracked release diff 只有 `AGENTS.md`、`README.md`、`index.html`。
- v10.75 所有版本來源一致，舊「小改 +0.1、大改 +1.0」文字消失。
- 本機語法、治理契約、版本契約與 11/11 全部通過。
- 本機與正式站 console/page errors 都是 0，warnings 不超過 6。
- local HEAD、`origin/master`、Actions head SHA 與正式站版本一致。
- 七個既有 untracked 保持原狀，沒有刪除、搬移、追蹤或內容變更。

## 後續但不在本次實作

下一個候選任務是將版本一致性契約加入 CI，讓 workflow 在啟動瀏覽器前先檢查 AGENTS、README、HTML header、常數與自測 expected 是否同步。該工作會修改 workflow，必須另行設計與確認。
