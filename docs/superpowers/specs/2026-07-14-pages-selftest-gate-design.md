# GitHub Pages 自檢部署閘門設計

## 目標

GitHub Pages 發布 `index.html` 前，必須在真實無頭 Chrome 中執行網站既有的完整自檢。任一測試失敗時，Actions 停止，舊正式站維持不變。

## 設計

- 一般網址維持原行為，不自動執行完整自檢。
- 只有網址帶有 `?ci-selftest=1` 時，才在畫面完成初始渲染後執行 `runMindMapFullSelfTest()`。
- 結果寫入 `<html>` 的 `data-ci-self-test`、通過數、失敗數與失敗摘要，供無頭瀏覽器讀取。
- Actions 先建立與實際發布相同的 `site/index.html`，啟動本機 HTTP server，再由 Chrome 讀取 CI 測試網址。
- 只有 `data-ci-self-test="pass"`、`passed="11"`、`failed="0"` 同時成立才上傳 Pages artifact。

## 安全與範圍

- CI 參數不修改文件內容、不保存資料、不顯示給一般使用者。
- 不增加 npm、Playwright 或外部網站相依。
- 正式發布內容仍只有 `index.html` 與 `.nojekyll`。

## 驗證

- 未實作標記前，無頭 Chrome 檢查必須失敗。
- 完成後，本機 CI URL 必須輸出 11/11 通過標記。
- GitHub Actions 的瀏覽器自檢步驟與部署工作都必須成功。
