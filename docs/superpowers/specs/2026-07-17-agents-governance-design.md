# MK2MD 正式 AGENTS.md 治理規格

## 背景

MK2MD 已發布 v10.73，但專案根目錄目前沒有受 Git 追蹤的 `AGENTS.md`。完整接手規範只存在本機未追蹤的 `agent.md`，而且仍含 v10.69 現況敘述；乾淨 clone、GitHub 與新的 Codex 工作環境無法取得這些安全與交付規則。

本次建立精簡、受版本控制且可直接執行的根目錄 `AGENTS.md`，發布為 v10.74。`AGENTS.md` 負責協作、安全、版本、驗證、Git 與部署；`PROJECT_RULES.md` 繼續只負責 UI 功能歸屬；README 提供入口與目前版本資訊。

## 目標

- 新增並追蹤根目錄 `AGENTS.md`，讓 Git clone 與自動化 agent 都取得同一套維護規則。
- 將規則同步到 MK2MD v10.74、2026-07-17 與現有 GitHub Pages workflow 的真實行為。
- 明確記錄單檔架構、產品不變條件、變更流程、版本更新、驗證、Git 安全與原平台部署規則。
- README 的 Maintenance Rules 加入 `AGENTS.md` 第一入口，並同步 v10.74。
- `index.html` 只更新版本、日期與 Changelog，不改產品功能。
- 完成後推送既有 `origin/master`，部署並驗證原 GitHub Pages URL。

## 不在本次範圍

- 不刪除、改名、搬移或追蹤 `agent.md`、`design.md`。
- 不現代化 `agent.md`、`design.md` 其餘 v10.69 內容。
- 不修改 `PROJECT_RULES.md`；它維持 UI 規則唯一責任。
- 不修改 `deploy.ps1`，也不把它當成這次多檔發布的權威入口。
- 不處理 Canvas `willReadFrequently` warnings。
- 不重構 `index.html`、不新增產品功能、不更新依賴、不更換部署平台或 repository slug。
- 不改寫歷史 Changelog、舊規格、舊報告或歷史備份名稱。

## 文件權責

### `AGENTS.md`

`AGENTS.md` 是未來工程師與 Codex 在修改前必讀的協作／交付規範，內容保持精簡、可驗證，不複製整份架構說明。它至少包含：

1. **語言與範圍**：預設台灣繁體中文；只在目前專案資料夾工作；不建立新專案、不搬檔、不改平台。
2. **修改前閱讀順序**：`AGENTS.md`、README、Changelog／版本標頭、部署 workflow、`PROJECT_RULES.md` 與相關程式碼。
3. **專案真實來源**：正式產品是單一 `index.html`；README 是快速入口；workflow 只部署 `index.html` 與 `.nojekyll`。
4. **既定產品決策**：Markdown 是資料本體、桌面直式心智圖、右鍵選單是完整功能入口、禁止恢復自動草稿、HTML sink 使用既有安全 helper。
5. **變更管理**：非小修先提出簡短計畫並等確認；遵守既有架構；禁止無關重構與大量依賴更新。
6. **不可逆操作**：刪除檔案／資料／設定／部署資源、清空資料、資料庫變更或其他不可逆操作必須先取得明確確認。
7. **版本規則**：每個可交付修改都更新版次；同步 `index.html` 檔頭、`APP_VERSION`、`APP_DATE`、最新 Changelog 與 README。規則不再使用含糊的「小改 +0.1」，改為沿用目前逐號增加方式，例如 v10.73 → v10.74；若變更級距不明先提案。
8. **驗證規則**：Node 解析抽出的 app script、`git diff --check`、本機 HTTP + installed Chrome 11 組自檢、真實瀏覽器 title／品牌／console／page error；warning 不得高於既有基準 6。
9. **Git 安全**：修改前查 status，修改後查 diff；WebDAV 上必要時使用明確 `--git-dir`／`--work-tree`；只 allowlist staging，禁止 `git add .`；不 force push。
10. **部署規則**：只部署既有 `green-tea-king/md-mind-map` 的 `master`；確認 Actions head SHA 與本機 HEAD 相同且 success，再用 cache-busted 原正式 URL 驗證 v10.74、MK2MD、11/11 與 console/page error。
11. **完成回報**：固定列出完成內容、檔案、版本、驗證、是否部署、URL、未驗證／需處理事項，並詳細建議下一個任務、理由、範圍、驗證與風險。

`AGENTS.md` 連結 README 與 `PROJECT_RULES.md`，但不複製後者的完整 UI 規則。架構細節仍以程式碼與未來核准後的正式架構文件為準，不把未追蹤 `design.md` 當成 clone 必備依賴。

### `README.md`

README 保持使用者／維護者快速入口：

- Current Version 更新為 v10.74、2026-07-17。
- Maintenance Rules 第一項改為「修改前先讀 `AGENTS.md`；UI 變更再讀 `PROJECT_RULES.md`」。
- 保留原 Pages URL、repository 行為、功能說明與本機檔案說明。
- 本次不擴寫完整安全規則，避免與 `AGENTS.md` 重複。

### `PROJECT_RULES.md`

本次不修改。它繼續只管理右鍵選單、工具列、命令面板與 UI 驗證，避免協作規則與 UI 規則互相複製。

## 版本與 Changelog

- 新版本：`v10.74`。
- 日期：`2026-07-17`。
- `index.html` 同步：檔頭 Version、Last updated、`APP_VERSION`、`APP_DATE`、最新 Changelog。
- Changelog 摘要：新增正式受版本控制的 `AGENTS.md`，集中協作、安全、版本、驗證與原平台部署規則；README 加入維護入口。
- 不修改 `APP_NAME='MK2MD'`、產品 UI、DEFAULT_MARKDOWN 或匯出邏輯。

## 測試與驗證設計

### 文件靜態契約

以只讀掃描確認：

- `git ls-files -- AGENTS.md` 恰有 1 筆。
- `AGENTS.md` 包含 `MK2MD`、`v10.74`、`2026-07-17`、`index.html`、`PROJECT_RULES.md`、`11/11`、原 repo／Pages、刪除需確認、`git add .` 禁止與固定七項回報。
- `AGENTS.md` 不把 v10.69 描述成現況，也不包含祕密、Token 或帳號資料。
- README 連結 `AGENTS.md`，並顯示 v10.74／2026-07-17。
- `index.html` 的檔頭、`APP_VERSION`、`APP_DATE` 與最新 Changelog 一致。
- `PROJECT_RULES.md`、`agent.md`、`design.md`、workflow 與 `deploy.ps1` 沒有差異。

### 產品與瀏覽器回歸

雖然本次只改治理文件與版本資訊，仍執行既有完整門檻：

- 抽取 HTML header comment 之後的 app script，用 Node `vm.Script` 驗證 1 個 inline script。
- 本機 HTTP + installed Chrome：`data-ci-self-test=pass`、11 passed、0 failed。
- 真實瀏覽器：`document.title='MK2MD v10.74'`、`#brandName='MK2MD'`、page error 0、console error 0、Canvas warning 不多於 6。
- `git diff --check` 無輸出。
- staged allowlist 只包含 `AGENTS.md`、`README.md`、`index.html` 與本次核准的 spec／plan 文件；7 個既有 untracked 不得納入。

### 部署與正式站

- 推送既有 `origin/master`，不 force push。
- 等待 `.github/workflows/pages.yml` 對本次完整 HEAD 完成且 success。
- 正式 URL `https://green-tea-king.github.io/md-mind-map/` 加 SHA／時間 cache-buster。
- 驗證 live source 為 MK2MD v10.74、執行期 title／品牌正確、自檢 11/11、page／console error 0、warnings 不高於 6。

## 失敗處理與安全邊界

- 文件契約、Node、11/11、console 或 diff 任一失敗，不建立 release commit、不部署。
- staging 清單出現未核准檔案時停止，不自動 unstage、reset 或刪除；先檢查原因。
- Actions 失敗時停止，不 force push、不刪除部署資源、不自動回滾。
- WebDAV Git discovery 偶發失敗時，從 `C:\Users\Administrator` 使用固定絕對 `--git-dir`／`--work-tree` 重做唯讀查詢；不得把 transient error 當成功。
- 不把本機未追蹤文件、備份、bundle 或工具納入 commit。

## 提交與部署範圍

設計與實作分開提交：

1. 設計規格 commit：只包含本文件。
2. 實作計畫 commit：只包含後續 implementation plan。
3. v10.74 release commit：明確 stage `AGENTS.md`、`README.md`、`index.html`。
4. 推送既有 `master`，讓原 Pages workflow 部署同一 HEAD。

本次沒有功能分支、PR、worktree、檔案刪除或平台遷移。

## 完成定義

- 根目錄 `AGENTS.md` 已受 Git 追蹤，內容與 v10.74 真實行為一致。
- README 已連結 `AGENTS.md` 且版本一致。
- `index.html` 僅有版本／日期／Changelog 變更，產品行為無差異。
- Node、11/11、console／page error、warning、diff 與 staging 門檻全部通過。
- `HEAD = origin/master = Actions head SHA = live v10.74`。
- 原有 7 個 untracked 仍存在，未被修改（除先前已核准的 `agent.md`／`design.md` 品牌同步）、未被 staging、未被刪除。
- 最終以台灣繁體中文提供固定七項收尾與下一任務詳細建議。
