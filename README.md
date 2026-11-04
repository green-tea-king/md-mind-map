# MK2MD

MK2MD 是單檔 HTML Markdown 心智圖編輯器。正式網站仍由根目錄的 `index.html` 提供；可離線直接開啟，也可部署至既有 GitHub Pages。

正式網址：<https://green-tea-king.github.io/md-mind-map/>

## Current Version

- Version: `v11.15`
- Date: `2026-11-04`
- 正式入口：`index.html`
- 可維護來源：`src/`

## 快速啟動

在 Windows 檔案總管雙擊根目錄的「啟動 MK2MD.bat」，或直接以瀏覽器開啟 `index.html`。此工具不需安裝、不需登入；編輯內容請手動匯出 Markdown 保存。

## 專案結構

- `src/core/`：版本、資料模型、Markdown 解析／序列化與版面邏輯。
- `src/features/`：渲染、編輯、拖曳、匯出、搜尋、選單等功能。
- `src/styles/`：主題、面板與版面樣式。
- `src/templates/`：HTML 外殼及預設內容。
- `assets/brand/`：品牌圖示與授權標示；建置時會內嵌至單檔 HTML。
- `scripts/`：建置、測試與原平台部署工具。
- `temp/`：受保護的本機舊檔／備份歸檔區，不會發布至網站。
- `啟動 MK2MD.bat`：Windows 根目錄啟動器。
- `README.md`、`AGENTS.md`、`PROJECT_RULES.md`、`CHANGELOG.md`：使用說明、工作規範、功能歸屬及版本歷程。

## 修改、建置與測試

修改程式請編輯 `src/`，不要直接改產生的 `index.html`。在專案根目錄執行：

```powershell
node scripts/build.mjs --write
node scripts/build.mjs --check
node scripts/test-build.mjs
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js
pwsh -NoProfile -File scripts/test-deploy.ps1
```

每次可交付修改都要依 `AGENTS.md` 更新版號、日期與歷程，再重建 `index.html`。`node scripts/build.mjs --check` 確認發布單檔與所有來源完全一致。

## Deployment

仍使用原 GitHub Pages 專案 `green-tea-king/md-mind-map`，只發布根目錄 `index.html` 與 `.nojekyll`；不會建立新平台或專案。部署前需先完成版本、部署合約和 Chrome 驗證。正式部署只可用精確已提交的 HEAD：

```powershell
$head = (git rev-parse HEAD).Trim()
# Deploy v11.15
.\scripts\start-deploy.ps1 -ExpectedHead $head
```

`scripts/start-deploy.ps1` 是 Windows 啟動入口，`scripts/deploy.ps1` 是 fail-closed 部署工具。部署不會自動 commit；需要通過相同 HEAD 的 Actions、正式站雜湊與 Chrome 驗證。`-DryRun` 僅執行本機閘門，不會 push 或驗證正式站。

## 保存與歸檔

MK2MD 不使用自動草稿。編修後請手動匯出 Markdown；HTML 僅供靜態展示。`temp/` 是受保護歸檔區，不可當成快取清空；移入前應記錄來源、用途和 SHA-256。沒有經確認的舊檔就不移動或刪除。

品牌圖示採 Flaticon 上 Magnific 的 Mindmap 圖示；應用程式內保留可見署名，詳見 `assets/brand/ATTRIBUTION.md`。
