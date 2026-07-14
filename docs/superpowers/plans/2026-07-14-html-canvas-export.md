# HTML Canvas Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 Markdown HTML 區塊在 JPG 與 PDF Canvas 匯出時，依純文字或安全顯示模式保留可讀且一致的視覺結構。

**Architecture:** 保留現有 DOM renderer 與單檔架構，在 Canvas 匯出層新增 HTML 專用分析及繪製 helper。純文字模式沿用 `_drawCanvasPre()`；安全模式把已經 sanitizer 處理過的 `.htmlsafe` DOM 轉成帶有區塊語意的行，再交給既有 rich-text 分段與繪圖函式。

**Tech Stack:** 單檔 HTML、原生 JavaScript、DOM、Canvas 2D、內建瀏覽器自檢。

## Global Constraints

- 不加入外部 Canvas、DOM 截圖或 PDF 套件。
- 不擴大 HTML 標籤或屬性白名單。
- 不改變 HTML 顯示模式的預設值與儲存方式。
- 不修改 Markdown 原始稿與 HTML 單檔匯出格式。
- 正式部署仍只有 `index.html` 與 `.nojekyll`。

---

### Task 1: 建立 HTML 匯出失敗案例

**Files:**
- Modify: `index.html` (`runExportSelfTest`)

**Interfaces:**
- Consumes: `parseMarkdown()`, `setHtmlDisplayMode()`, `renderMapToCanvas()`, `_canvasPixelActivity()`。
- Produces: 純文字與安全模式的 HTML Canvas 自檢，以及顯示模式還原保證。

- [x] **Step 1: 在匯出測試 Markdown 加入 `<details open>` HTML 節點**

內容包含 `summary`、獨立段落、兩個清單項目及行內 `strong` / `code`，讓測試能辨識結構是否被扁平化。

- [x] **Step 2: 新增純文字與安全模式檢查**

測試必須確認 `.htmlnode` 被能力稽核辨識、純文字模式走 `pre.mdhtmlraw`、兩種模式的 Canvas 節點範圍都有非背景像素，且安全模式分析結果含一個 summary、一個 paragraph、兩個 list item。

- [x] **Step 3: 執行現有匯出自檢並確認 RED**

在 Chrome Console 執行：

```js
window.runMindMapExportSelfTest({log: true})
```

預期：HTML 能力檢查或安全結構檢查失敗，證明測試確實覆蓋尚未實作功能。

### Task 2: 實作 HTML Canvas renderer

**Files:**
- Modify: `index.html` (`EXPORT_SUPPORT`, `detectExportFeatures`, Canvas helpers, `renderMapToCanvas`)

**Interfaces:**
- Consumes: sanitizer 後的 `.htmlsafe` DOM、`_richSegments()`, `_layoutRich()`, `_drawRichLines()`, `_drawCanvasPre()`。
- Produces: `_canvasHtmlBlocks(root, base)` 與 `_drawCanvasHtmlSafe(ctx, nodeEl, htmlEl, nx, ny)`。

- [x] **Step 1: 補匯出能力 registry 與偵測**

在 `EXPORT_SUPPORT.nodes` 加入 `Markdown HTML 區塊`，並在 `.htmlnode` 存在時由 `detectExportFeatures()` 回報。

- [x] **Step 2: 建立安全 HTML 區塊分析 helper**

輸出有序 block 陣列，每個項目包含 `kind` 與可交給 `_richSegments()` 的 DOM root。`summary` 標記為標題並加 `▼`；`p` 獨立成段；`li` 每項加 `• `；其他白名單元素遞迴降級，不執行任何 HTML。

- [x] **Step 3: 建立安全 HTML Canvas 繪製器**

依 DOM 實際位置和 computed style 取得可用寬度，逐 block 使用 `_layoutRich()` / `_drawRichLines()` 繪製。區塊間距以段落語意控制，summary 使用較粗字重。

- [x] **Step 4: 接入 `renderMapToCanvas()`**

`.htmlnode` 若含 `pre.mdhtmlraw`，先呼叫 `_drawCanvasPre()`；若含 `.htmlsafe`，先呼叫 `_drawCanvasHtmlSafe()`。兩者完成後直接 return，避免一般 rich renderer 再畫一次。

- [x] **Step 5: 執行匯出自檢確認 GREEN**

預期 `window.runMindMapExportSelfTest({log:true})` 全數通過，且測試 finally 還原原本 `htmlDisplayMode`。

### Task 3: 完整驗證、版本與發布

**Files:**
- Modify: `index.html`（版本、日期、changelog）
- Modify: `README.md`（版本與 HTML 圖面匯出說明）

**Interfaces:**
- Consumes: 完成的 HTML Canvas renderer。
- Produces: v10.70 可部署單檔。

- [x] **Step 1: 執行靜態檢查**

抽出 `<script>` 後使用 `node --check`，並執行 `git diff --check`。

- [x] **Step 2: 執行完整瀏覽器自檢**

```js
window.runMindMapFullSelfTest({log: true, report: false})
```

預期所有群組通過，Console 沒有新增 JavaScript 例外。

- [x] **Step 3: 驗證純文字與安全顯示圖面**

分別切換兩種 HTML 顯示模式，匯出或擷取 Canvas，確認純文字為灰底等寬框，安全模式可看見 summary、段落、兩個項目與行內樣式。

- [ ] **Step 4: 更新 v10.70 並部署**

同步 `APP_VERSION`、`APP_DATE`、畫面版號、changelog 與 `README.md`，提交並推送 `master`。等待 Pages Action 成功後以 cache-busting query 驗證正式網站。
