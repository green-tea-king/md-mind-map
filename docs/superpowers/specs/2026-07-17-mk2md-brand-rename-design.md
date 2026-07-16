# MK2MD 品牌改名設計

## 背景

目前正式程式與本機追蹤檔已同步到 `v10.72`。產品的使用者可見品牌仍是 `MD心智圖`，包含左上品牌卡片、瀏覽器分頁、診斷資訊、預設使用說明及部分維護文件。

本次以目前 `@MK2MD` 資料夾作為唯一工作位置，保留遠端 `v10.72` 已完成的 HTML Canvas 匯出、搜尋按需顯示及 GitHub Pages 自檢部署閘門，再將現行品牌集中改為 `MK2MD`，發布為 `v10.73`。

## 目標

- 所有現行產品品牌名稱統一顯示為 `MK2MD`。
- `APP_NAME` 成為執行期品牌名稱的唯一來源。
- 左上品牌卡片與瀏覽器分頁分別顯示 `MK2MD` 與 `MK2MD v10.73`。
- 預設使用說明、診斷資訊、Console 標記及無文件名稱時的匯出檔名使用 `MK2MD`。
- README、PROJECT_RULES、接手指南及系統設計的現行產品名稱同步更新。
- 部署到既有的 `green-tea-king/md-mind-map` GitHub Pages，不建立新平台專案。
- 部署後比較本機、Git 與正式站狀態，提出下一階段維護建議。

## 不變範圍

- GitHub repository 名稱 `green-tea-king/md-mind-map` 不變。
- Pages URL `https://green-tea-king.github.io/md-mind-map/` 不變。
- 正式產品維持單檔 `index.html`，不新增 runtime 相依。
- 一般功能術語如「心智圖節點」、「目前心智圖」及「新增中心主題」不改成品牌名稱。
- 舊版 Changelog 保留當時使用的 `MD心智圖`、`MK心智圖` 與 `Markdown心智圖`，不改寫歷史。
- `MD心智圖_v10_00.html`、`repository-history.bundle`、BACKUP_MANIFEST 及其他歷史備份名稱與內容不變。
- GitHub Pages artifact 仍只有 `index.html` 與 `.nojekyll`。
- 不刪除、搬移或重新命名任何檔案。

## 品牌名稱架構

### 執行期單一來源

`index.html` 內的 `APP_NAME` 設為 `MK2MD`。需要在 JavaScript 啟動前就存在的靜態 `<title>` 也直接使用 `MK2MD`，啟動後再由既有 `syncAppTitle()` 依 `APP_NAME`、`APP_VERSION` 組成完整分頁標題。

左上品牌卡片的品牌文字提供可定位的 DOM 元素，初始化時由 `APP_NAME` 寫入。診斷資料的 `app` 欄位、儲存/安全警告及錯誤紀錄的 Console 前綴都引用 `APP_NAME`，不再各自硬編碼 `MD心智圖`。

### 使用者內容與匯出

內建 `DEFAULT_MARKDOWN` 的主標題與分頁標題說明改用 `MK2MD`。一般「心智圖」功能說明維持原詞。

當文件本身沒有名稱時，JPG、PDF、Markdown 與 HTML 單檔匯出的 fallback basename 改用 `APP_NAME`；已有文件名稱時仍優先使用文件名稱，不改變現有使用者檔名邏輯。

### 文件責任

- `README.md`：標題、產品簡介、版本更新為 `v10.73`，部署命令改用目前資料夾的 `.\deploy.ps1`，不再引用舊的絕對路徑。
- `PROJECT_RULES.md`：現行專案標題改為 `MK2MD 專案規範`。
- `agent.md`、`design.md`：本機現行接手與架構標題、產品描述改為 `MK2MD`；兩檔本次仍保留為本機未追蹤文件，部署後再評估正式納入 Git。
- 歷史 plans/specs、Changelog 與備份清單不回寫舊名稱。

## 版本規則

- 新版本：`v10.73`。
- 日期：`2026-07-17`。
- 同步更新 `index.html` 檔頭 Version/Updated、`APP_VERSION`、`APP_DATE`、Changelog 最新項目及 README Current Version。
- Changelog 摘要說明現行品牌集中改為 `MK2MD`，並列出畫面、分頁、診斷、預設範本與匯出 fallback 的同步範圍。

## 測試設計

品牌修改遵守 RED → GREEN：

1. 先在既有瀏覽器自檢加入品牌斷言。
2. 在尚未修改品牌程式的 `v10.72` 執行，確認只因仍顯示 `MD心智圖` 而失敗。
3. 完成最小品牌修改後重跑，確認品牌斷言與既有 11 組自檢全部通過。

自檢至少涵蓋：

- `APP_NAME === 'MK2MD'`。
- 靜態/執行期分頁標題為 `MK2MD v10.73`。
- 左上品牌卡片顯示 `MK2MD`，不顯示現行舊名稱。
- `collectDiagnostics().app` 等於 `APP_NAME`。
- `DEFAULT_MARKDOWN` 含 `# MK2MD · 使用說明`。
- 無文件名稱時的匯出 fallback basename 為 `MK2MD`。
- 現行 UI 與執行期品牌字串不殘留 `MD心智圖`；舊 Changelog 與歷史檔名列入允許清單。

完整驗證包含：

- 抽取 `index.html` 應用 `<script>` 後執行 JavaScript parser 檢查。
- `git diff --check`。
- 本機 HTTP server + 真實 Chrome。
- `window.runMindMapFullSelfTest({log:true})` 的 11 組自檢全部通過。
- Console 無新增 error；既有 Canvas readback warning 另列為後續效能建議，不混入品牌修改。
- 品牌卡片與瀏覽器分頁人工比對使用者提供的兩張截圖。

## 同步、提交與部署

1. 只在目前 `@MK2MD` 資料夾工作，repository-local `core.autocrlf=false`。
2. 以 `origin/master` 的 `v10.72` 追蹤檔為實作基準；本機未追蹤備份檔以 SHA-256 保護，不覆蓋。
3. 先驗證 `v10.72` 基準，再進入品牌 RED/GREEN 修改。
4. 明確 stage 品牌程式、規範、README、規格與實作計畫；不使用 `git add .`。
5. Push 既有 `master`，由 `.github/workflows/pages.yml` 的 11 組瀏覽器自檢閘門發布。
6. 驗證 Actions 成功、正式 URL 回傳 `v10.73`、品牌為 `MK2MD`、完整自檢通過且 Console 無新增 error。

未通過本機驗證時不提交、不部署。Actions 失敗時不上傳新 artifact，既有正式站保持不變。正式站版本或品牌不符時停止並回報，不執行 force push、強制回退或遠端資源刪除。

## 部署後落差盤點

部署完成後重新 fetch `origin/master`，檢查：

- `HEAD`、`origin/master`、正式站版本是否一致。
- 工作樹是否只剩已知本機維護/備份檔。
- README 與 `index.html` 版本是否一致。
- `agent.md`、`design.md`、`deploy.ps1`、備份檔及 Git bundle 是否應納入版本管理或保留本機。
- 是否建立正式 `AGENTS.md`，承接已確認的長期維護規範。
- 版本規則、部署腳本 staging 範圍及 Canvas `willReadFrequently` warning 是否需要下一輪處理。

後續建議只在部署與落差驗證完成後提出，不混入本次品牌改名實作。
