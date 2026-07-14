# HTML 區塊 Canvas 匯出設計

## 目標

讓 Markdown HTML 區塊在 JPG 與 PDF 匯出時，依目前顯示模式保留可讀且一致的視覺結構。

## 已確認問題

- 純文字模式目前由一般富文字流程繪製，沒有完整沿用畫面上的等寬程式碼框樣式。
- 安全顯示模式目前只遞迴收集文字，`summary`、段落與清單的區塊語意會消失。
- 匯出支援稽核尚未辨識「Markdown HTML 區塊」。

## 匯出行為

### 純文字模式

- 使用現有 `_drawCanvasPre` 繪製 `pre.mdhtmlraw`。
- 保留灰底、等寬字、換行與自動折行。
- 匯出內容與畫面上的 HTML 原始碼一致。

### 安全顯示模式

- 新增專用 Canvas HTML 區塊繪製器。
- `<summary>` 畫成區塊標題，並以向下符號表示匯出的是展開內容。
- `<p>` 形成獨立段落。
- `<li>` 每項換行並補項目符號。
- `<strong>`、`<em>`、`<del>`、`<code>` 等行內樣式沿用現有富文字分段樣式。
- JPG/PDF 是靜態圖，因此一律匯出完整展開內容，不模擬可點擊收合。
- 其他白名單標籤以其文字內容安全降級，不能造成空白節點或執行程式碼。

## 支援稽核

- `EXPORT_SUPPORT.nodes` 加入「Markdown HTML 區塊」。
- `detectExportFeatures()` 在 `.htmlnode` 存在時回報此功能。
- `auditExportSupport()` 必須維持零遺漏。

## 驗證

- 匯出自測樣本加入 `<details open>` HTML 區塊。
- 純文字模式確認 Canvas 中 HTML 節點有非背景像素，並使用 `pre.mdhtmlraw` 專用路徑。
- 安全模式確認 Canvas 中 HTML 節點有非背景像素，且結構分析包含 summary、段落與兩個清單項目。
- 測試完成後還原使用者原本的 HTML 顯示模式。
- 本機與 GitHub Pages 都要通過完整自測，且瀏覽器沒有 JavaScript 錯誤。

## 範圍限制

- 不加入外部 Canvas、DOM 截圖或 PDF 套件。
- 不擴大 HTML 標籤或屬性白名單。
- 不改變 HTML 顯示模式的預設值與儲存方式。
- 不把 HTML 區塊轉成可互動的 PDF 元件。
- 不修改 Markdown 原始稿與 HTML 單檔匯出格式。
