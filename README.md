# MK2MD

MK2MD 是單檔 HTML Markdown 心智圖編輯器。

正式入口是 `index.html`，可直接用 GitHub Pages 發佈，也可以在本機用瀏覽器開啟。

Live site:

https://green-tea-king.github.io/md-mind-map/

## Current Version

- Version: `v10.82`
- Date: `2026-07-20`
- Tracked app file: `index.html`

## Main Features

- Markdown 匯入與匯出
- 心智圖節點編輯、拖曳、排序、收合
- 右鍵選單、指令面板、搜尋與定位
- Markdown 標題、清單、引用、表格、程式碼、警示框、腳註；清單操作使用切換語意，圖示操作分開加圖示與清除，分隔線操作明確標示節點上方/下方，剪貼簿操作分開複製貼上與危險操作，警示框與跳脫符號可由節點右鍵文字格式套用
- `---` 水平分隔線支援，顯示為單純分隔線，不當成子節點
- JPG、PDF、Markdown、HTML 單檔匯出；JPG/PDF 會依目前模式保留 HTML 純文字框或安全顯示的 summary、段落、清單與行內格式
- 內建範本包含 HTML details 區塊;預設純文字,可切換白名單安全顯示
- 匯出前檢查報告與安全修正

## Save Model

本工具採手動保存流程。

- 編修內容不使用自動草稿
- 離開頁面前請手動匯出 Markdown 或 HTML 單檔
- 取消舊草稿復原流程後，不再使用 `mm-auto-draft-v1`

## Deployment

GitHub Pages 只發布建置目錄中的 `index.html` 與 `.nojekyll`，不會把維護用的 README、PROJECT_RULES 或備份檔放進網站。發布前會先執行版本一致性檢查，再用無頭 Chrome 執行完整 11 組自檢；任一檢查失敗就停止部署。

本機部署工具：

```powershell
$head = (git rev-parse HEAD).Trim()
# Deploy v10.82
.\deploy.ps1 -ExpectedHead $head
```

`deploy.ps1` 是納入版本控制的 fail-closed 工具，但不會被放進 GitHub Pages artifact。它不會自動 commit；正式模式只接受已提交的精確 HEAD，確認原 repository／branch／remote 關係後才 push，並要求同一 HEAD 的 Actions run、正式站來源 SHA-256 與 Chrome 11/11 都通過。

可先執行 `.\deploy.ps1 -DryRun`，只跑本機版本、Git、來源與 Chrome 閘門，不 push、不等待 Actions，也不驗證正式站。

## Local Files

以下檔案目前建議保留本機，不納入 GitHub Pages：

- `clear-auto-draft.html`: 舊草稿清理工具，草稿功能移除後只作歷史備援
- `MD心智圖_v10_00.html`: 舊版備份檔

## Maintenance Rules

- 修改前先讀 `AGENTS.md`；UI 變更再讀 `PROJECT_RULES.md`
- 右鍵選單是完整功能入口；上方工具列只作高頻快捷入口
- 診斷/自檢是維護功能，不顯示在一般右鍵選單；需要時用命令面板搜尋
- 每次修改 `index.html` 要同步更新檔頭版本、`APP_VERSION`、`APP_DATE` 與 Changelog
- 以桌面版操作為準，不維護手機版入口或手機專用模式
- 不要恢復自動草稿機制
- 刪除檔案前必須先確認
- 部署後要用 live URL 驗證版本與自測狀態
