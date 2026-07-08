# MD 心智圖

單檔 HTML Markdown 心智圖編輯器。

正式入口是 `index.html`，可直接用 GitHub Pages 發佈，也可以在本機用瀏覽器開啟。

Live site:

https://green-tea-king.github.io/md-mind-map/

## Current Version

- Version: `v10.48`
- Date: `2026-07-08`
- Tracked app file: `index.html`

## Main Features

- Markdown 匯入與匯出
- 心智圖節點編輯、拖曳、排序、收合
- 右鍵選單、指令面板、搜尋與定位
- Markdown 標題、清單、引用、表格、程式碼、警示框、腳註
- `---` 水平分隔線支援，顯示為單純分隔線，不當成子節點
- JPG、PDF、Markdown、HTML 單檔匯出
- 匯出前檢查報告與安全修正

## Save Model

本工具採手動保存流程。

- 編修內容不使用自動草稿
- 離開頁面前請手動匯出 Markdown 或 HTML 單檔
- 取消舊草稿復原流程後，不再使用 `mm-auto-draft-v1`

## Deployment

GitHub Pages 只需要追蹤 `index.html` 與 `.nojekyll`。

本機部署工具：

```powershell
& "W:\4. TODO (這裡是公用區 特定電腦勿放)\MD心智圖\deploy.ps1" -Message "Deploy v10.48"
```

`deploy.ps1` 是本機工具，目前不納入 repo；它會在部署前檢查 GitHub CLI 認證、push 權限與 Git credential 狀態。

## Local Files

以下檔案目前建議保留本機，不納入 GitHub Pages：

- `clear-auto-draft.html`: 舊草稿清理工具，草稿功能移除後只作歷史備援
- `MD心智圖_v10_00.html`: 舊版備份檔

## Maintenance Rules

- 每次修改 `index.html` 要同步更新檔頭版本、`APP_VERSION`、`APP_DATE` 與 Changelog
- 以桌面版操作為準，不維護手機版入口或手機專用模式
- 不要恢復自動草稿機制
- 刪除檔案前必須先確認
- 部署後要用 live URL 驗證版本與自測狀態
