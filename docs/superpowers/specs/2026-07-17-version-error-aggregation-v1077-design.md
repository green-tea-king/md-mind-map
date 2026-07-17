# MK2MD v10.77 版本錯誤彙整設計

## 背景

v10.76 已在既有 GitHub Pages workflow 中加入版本一致性 gate，並以 `AGENTS.md` 首段作為唯一的目前版本與日期基準。最終整體審查確認 gate 能安全阻止版本不一致部署，但發現一個非阻斷診斷缺口：當 `AGENTS.md` baseline 缺失或重複時，`validateVersionConsistency()` 會立即返回，因此同一次檢查不會繼續列出 README 與 index 的其他結構錯誤。

使用者已選擇不回滾 v10.76，並核准在 v10.77 修正這個錯誤彙整行為。

## 目標

將版本檢查分成「無條件結構解析」與「有條件值比較」兩個階段。即使 canonical baseline 無效，gate 仍應收集所有彼此獨立的缺失／重複欄位問題；但因正確版本與日期未知，不得猜測 expected value，也不得改用 README 或 index 作為備用基準。

本次交付版本為 `v10.77`，日期為 `2026-07-17`。

## 非目標

- 不改變 `AGENTS.md` 是唯一 canonical current version/date source 的規則。
- 不修改 `.github/workflows/pages.yml`、workflow 觸發條件、Permissions、Actions 或 Pages artifact。
- 不修改 MK2MD 的 UI、功能、資料格式或 11 組瀏覽器自我測試行為。
- 不修改 `PROJECT_RULES.md`、舊 Changelog 或歷史檔名。
- 不新增套件、`package.json`、外部依賴、branch、repository、site 或部署平台。
- 不修改、納管或刪除七個既有未追蹤檔案。

## 方案比較與決策

### A. 兩階段解析與比較（採用）

第一階段解析所有具名欄位並收集結構問題，第二階段只有在 baseline 有效時才執行值比較。這能維持單一基準、產生完整且不誤導的錯誤清單，也能沿用目前 API 與 helper。

### B. 以空字串或 sentinel 當 expected value

可用較少控制流程繼續執行 `compare()`，但會輸出「expected 空白／unknown，actual 10.76」等誤導訊息，因此不採用。

### C. 使用 README 或 index 作為備用基準

可在 AGENTS baseline 無效時繼續比較版本值，但會建立第二個版本真實來源並掩蓋 canonical source 的損壞，因此不採用。

## 對外行為

### Baseline 有效

- 行為維持 v10.76：解析所有指定欄位，並將 version/date/title 與 baseline 比較。
- 缺失、重複及 mismatch 全部加入 `issues`。
- 全部一致時回傳 `ok: true` 與 canonical `version`、`date`。

### Baseline 無效

- `AGENTS.md baseline` 結構錯誤加入 `issues`。
- 繼續解析 index header、最新 Changelog、APP 常數、品牌自我測試、README Current Version 與 Deployment。
- 所有彼此獨立的缺失或重複欄位繼續加入 `issues`。
- 不執行任何需要 canonical version/date 的 mismatch 比較。
- 回傳 `version: ''`、`date: ''`、`ok: false`。
- CLI 一次輸出全部已收集的結構錯誤並以非零狀態結束。

### 父區段無效

- README `Current Version` section 缺失或重複時，只回報 section 結構錯誤，不再為其 Version／Date 子欄位額外製造缺失訊息。
- README `Deployment` section 缺失或重複時，只回報 section 結構錯誤，不再為 deploy example 製造額外缺失訊息。
- index leading DOCTYPE/header comment 無效時，只回報 header comment 結構錯誤；仍繼續解析檔頭外的 APP 常數與品牌自我測試。
- header comment 有效但其 Version、Last updated 或 newest Changelog 無效時，逐欄收集各自的結構問題。

## 架構與資料流

`scripts/check-version-consistency.js` 保留現有公開介面：

```js
validateVersionConsistency({ agentsText, readmeText, indexText })
// => { ok, version, date, issues }
```

內部資料流調整為：

1. 建立 `issues`。
2. 使用 `captureExactly()` 解析 AGENTS baseline，但不提前 return。
3. 無條件解析 index 與 README 可辨識的結構欄位，將 capture 結果保存在區域變數。
4. 若 baseline 有效，取得 `version`／`date` 並執行全部 `compare()`。
5. 若 baseline 無效，略過全部 mismatch compare。
6. 依 `issues.length` 決定 `ok`，並回傳有效或空白的 version/date。

不新增新的 canonical source、public function、CLI flag 或輸出格式。

## 錯誤順序

為維持可預期的 CLI 與測試結果，issues 依下列固定順序累積：

1. `AGENTS.md baseline`。
2. index header comment、Version、Last updated、newest Changelog。
3. index APP_VERSION、APP_DATE、品牌自我測試 APP_VERSION、APP_DATE、APP_TITLE。
4. README Current Version section、Version、Date。
5. README Deployment section、deploy example。

結構錯誤保留目前 `{ field, expected, actual }` 格式；不增加 guessed、fallback 或 skipped comparison 類型的 issue。

## 測試設計與 TDD

保留 v10.76 的 8 個 contract tests，新增 2 個測試，目標為 10/10：

1. **Baseline 缺失時彙整所有獨立結構問題**
   - 移除 AGENTS baseline。
   - 移除 index `APP_DATE`。
   - 在 README Current Version section 重複 Version 欄位。
   - RED：目前實作只回報 baseline，一次彙整 assertion 失敗。
   - GREEN：結果依序包含 baseline、APP_DATE 與 README Current Version 三個結構 issue；version/date 為空。

2. **Baseline 無效時不猜測 mismatch expected value**
   - 移除 AGENTS baseline。
   - 將結構仍有效的 `APP_VERSION` 改成其他值。
   - 結果只包含 baseline 結構 issue，不包含 `index.html APP_VERSION` mismatch；version/date 為空。

既有 8 個測試必須繼續通過，尤其是 baseline 有效時的 APP_VERSION mismatch、README mismatch、最新 Changelog、DOCTYPE/header、缺失與重複欄位案例。

## 版本同步

依 `AGENTS.md` 同步：

- `AGENTS.md` 首段為 v10.77／2026-07-17。
- `index.html` 檔頭、`APP_VERSION`、`APP_DATE`、最新 Changelog 與品牌自我測試預期值。
- README Current Version、Date 與 Deployment 範例。

新增 Changelog 只描述錯誤彙整改善，不改寫 v10.76 或更早歷史。

## 驗證與部署

本機驗證至少包含：

- 10/10 版本檢查器測試。
- 實際 repository version consistency gate。
- mutation-free multi-error probe，證明同次回傳多個結構 issue。
- 兩個 checker scripts 的 `node --check`。
- Node `vm.Script` 解析 `index.html` 唯一 inline app script。
- workflow order source check，確認 workflow 未被修改且仍先跑 gate。
- 本機 HTTP + installed Chrome：v10.77、11/11、0 failed、console/page errors 0、warnings 不超過 6。
- `git diff --check`、明確 allowlist staging、七個既有未追蹤檔 SHA-256 7/7。

部署只使用既有 `origin/master` 與既有 GitHub Pages workflow。push 後必須選取 head SHA 等於 v10.77 HEAD 的 run，等待 build/deploy `completed/success`，再使用 cache-busted 正式 URL 重驗 source、v10.77、MK2MD、11/11、errors 0 與 warnings 不超過 6。

## 風險與控制

- **錯誤訊息過度展開：** 父 section 無效時不再檢查其子欄位，避免同一根因產生多筆噪音。
- **無基準時產生假 mismatch：** 所有 `compare()` 集中置於 baseline 有效條件內；測試明確禁止 APP_VERSION mismatch issue。
- **結構 parser 被值比較重構破壞：** 保留現有 `captureExactly()`、`markdownSection()` 與欄位名稱，只調整控制流程。
- **版本同步遺漏：** 版本一致性 gate 與 10/10 tests 在 commit、push 與部署前重跑。
- **部署後回歸：** 保留既有 Pages browser gate，並以正式站真實 Chrome 再驗證。
- **WebDAV 瞬時失敗：** 失敗批次不採信；Git 從 `C:\Users\Administrator` 使用固定絕對 git-dir/work-tree 重跑。

## 完成條件

- 新增的 multi-error test 在修正前以預期原因失敗，修正後通過。
- 10/10 contract tests 與實際 v10.77 repository gate 通過。
- Baseline 無效時同時收集獨立結構錯誤，但不產生猜測性 mismatch。
- Workflow、產品行為、Pages artifact 與七個既有未追蹤檔保持不變。
- 本機與正式站皆為 v10.77、11/11、errors 0、warnings 不超過 6。
- Exact-HEAD Pages run build/deploy completed/success。
