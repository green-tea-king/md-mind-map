//===================== 啟動範例 =====================
const DEFAULT_MARKDOWN = `這是一段 Markdown 開頭序言,因為它寫在第一個 # 標題之前,所以會顯示成最上方的中心大泡泡。
匯出 Markdown 時,它仍會保留在檔案最前面,不會被改成 # 標題。

---

# MK2MD · 使用說明
> 【根節點 # 的註解】這份說明會帶你快速上手所有功能。
> 緊接在標題下方的引言,會收進標題泡泡內當「註解」(泡泡中有泡泡)。
## 🚀 三步上手
> 【第二層 ## 的註解】最快的開始方式,照著三步走就會了。
- 第一步:雙擊任一節點即可編輯文字;Enter 完成、Esc 取消
- 第二步:選一個節點,按 Tab 長出子節點、按 Enter 加同層節點
- 第三步:完成後在空白處右鍵 → 檔案 → 匯出,存成 .md 保存
- 小提醒:本工具不會自動存檔,離開前請記得匯出
## 🖱 操作介面
### 右鍵選單是總入口
> 【第三層 ### 的註解】幾乎所有功能都在右鍵選單裡。
> 在節點上、或在空白處按右鍵,選單內容會不一樣。
- 在節點上按右鍵:編輯、文字格式、清單、圖示、複製貼上、刪除、收合
- 在空白處按右鍵:新增中心主題、貼上、檔案、檢視、主題、全部展開或收合
- 含子選單:文字格式 / 清單 / 圖示 / 檔案 / 檢視 / 主題
#### 右鍵子選單(第四層示範)
> 【第四層 #### 的註解】更深的層級一樣可以有引言註解。
> 註解功能不限層級,任何標題下方緊接的引言都會收進泡泡。
- 子選單裡還能再展開細項
---
- 第四層分隔線後的同層內容,用來測試深層節點中的水平線
---
### 滑鼠與觸控
- 拖背景 = 平移;滾輪 = 縮放;Shift+滾輪 = 水平捲動
- 單擊 = 選取;雙擊 = 編輯;拖節點 = 搬移
- 觸控:單指平移、雙指縮放、點兩下編輯
## ✏️ 編輯節點
### 新增
- Tab:在選取節點底下長出子節點
- Enter:在同一層再加一個節點
- Shift+Tab:在上方插入一層父節點
- 空白處右鍵「新增中心主題」可開另一張獨立心智圖
### 刪除與復原
- Del 或 Backspace:刪除選取節點(可多選一起刪)
- Ctrl+Z 復原;Ctrl+Y 或 Ctrl+Shift+Z 重做
### 搬移與排序
- 拖到另一節點上面 = 改掛載(換父節點)
- 拖到節點上方或下方 = 同層換順序
- 拖到空白處 = 脫離成獨立中心主題
- 方向鍵:在節點之間移動選取焦點
### 多選
- Ctrl+點選:逐一加選或取消
- Shift+拖曳空白處:框選一整區
- Ctrl+A:全選所有節點
## 🅰 文字格式(原生 Markdown)
- 粗體:Ctrl+B,或輸入 **文字**
- 斜體:Ctrl+I,或輸入 *文字*
- 刪除線:右鍵 → 文字格式,或輸入 ~~文字~~
- 連結:[顯示文字](網址),貼上裸網址也會自動變連結;點一下開新分頁
- 裸網址:https://example.com 會自動變成可點連結
- 參考式連結:[OpenAI 文件][openai-docs]、捷徑參考式 [MDN Web Docs]
- 圖片:用 ![範例圖片](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='120' viewBox='0 0 220 120'%3E%3Crect width='220' height='120' rx='16' fill='%23e8f0ff'/%3E%3Ccircle cx='62' cy='60' r='28' fill='%232f6fed'/%3E%3Cpath d='M104 42h72v12h-72zM104 66h52v10h-52z' fill='%231f2933'/%3E%3Ctext x='110' y='100' font-family='Arial' font-size='14' fill='%2364748b'%3EMarkdown Image%3C/text%3E%3C/svg%3E) 語法,會在同一個節點內顯示縮圖
- 參考式圖片:![參考式圖片][sample-image]
- 腳註:正文用 [^1] 標記、另一行用 [^1]: 內容 定義;標記會變成可點的上標數字[^1],點一下會跳到下面的腳註定義節點。同一個腳註可被多處引用[^1],定義只會有一份
[^1]: 這就是腳註定義,留在原本的位置;點上方的上標數字就會跳到這裡。
[openai-docs]: https://platform.openai.com/docs
[MDN Web Docs]: https://developer.mozilla.org/
[sample-image]: data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='220'%20height='80'%20viewBox='0%200%20220%2080'%3E%3Crect%20width='220'%20height='80'%20rx='14'%20fill='%23ecfdf5'/%3E%3Cpath%20d='M22%2052l34-34%2030%2030%2020-18%2038%2038H22z'%20fill='%2316a34a'/%3E%3Ccircle%20cx='166'%20cy='24'%20r='12'%20fill='%23f59e0b'/%3E%3Ctext%20x='24'%20y='72'%20font-family='Arial'%20font-size='13'%20fill='%230f766e'%3EReference%20Image%3C/text%3E%3C/svg%3E
- Emoji 短碼:輸入 :fire: :bulb: :rocket: 會自動轉成 🔥💡🚀
## ☑ 清單與圖示
- 待辦:行首輸入 [ ] 或 [x],或右鍵 → 清單 → 待辦
- [x] 這是已完成的待辦範例(點方框可切換)
- [ ] 這是未完成的待辦範例
- 有序清單:1. 2. 3. 會顯示序號(右鍵 → 清單 → 有序)
1. 第一個有序項目
2. 第二個有序項目
3. 第三個有序項目
- 巢狀清單:子項目縮排(2 空格或 Tab)會變成下一層,匯出 .md 會原樣保留層級
  - 第二層項目
    - 第三層項目
- 引用備註:行首輸入 > 變成引用塊;緊接在標題正下方的引用,會收進該標題泡泡內當註解(泡泡中有泡泡),其餘位置維持獨立引用節點
- 圖示:右鍵 → 圖示,可加 ⭐🔥✅❗💡📌🎯👍❤️ 等徽章
## 📊 表格(v8.4 新功能)
- 直接寫 Markdown 表格,會自動呈現成「真正的表格」,不再拆成一堆節點
| 項目 | 數量 | 狀態 |
|---|---:|:---:|
| 蘋果 | \`12\` | 充足 |
| 香蕉 | \`5\` | 偏少 |
| 柳橙 | \`8\` | 適中 |
- 對齊:分隔列用 :--- 靠左、---: 靠右、:--: 置中(上表「數量」靠右、「狀態」置中)
- 行內 \`程式碼\` 用反引號 \`...\` 包起來,會顯示成灰底樣式
- 表格可在右側「原始碼」面板編輯;匯出 .md 與 JPG / PDF 都會保留表格
## ─ 水平分隔線(v9.60+)
- 下面這行 --- 會顯示成單純水平線,不是子節點泡泡
- 分隔線左側對齊同層節點,右側對齊同層最長節點
---
- 分隔線後面的同層節點,用來示範右側最長寬度對齊
## 🧾 程式碼區塊(v8.6 新功能)
- 用三個反引號 \`\`\` 包起來的內容會變成程式碼框:等寬字、保留換行與縮排
\`\`\`text
購物清單:
水果
  → 蘋果
  → 香蕉
飲料
  → 牛奶
\`\`\`
- 反引號後可接語言名稱(如 \`\`\`text、\`\`\`js),目前僅作純文字呈現
- 縮排程式碼:用 4 個空白或 1 個 Tab 起頭,也會收成程式碼節點

    這是縮排程式碼區塊
    第二行會保留縮排與換行
## 🌐 HTML 區塊顯示
- HTML 區塊預設顯示原始碼;右鍵 → 檢視 → HTML 區塊顯示,可切換成白名單安全顯示
- 下面使用 details、粗體與清單,安全顯示時會變成可展開、收合的內容
<details open>
<summary>HTML 安全顯示示範</summary>
<p><strong>這段內容通過白名單後才會顯示。</strong></p>
<ul><li>不執行腳本</li><li>匯出 Markdown 保留原始 HTML</li></ul>
</details>
## 🚨 警示框 / 跳脫(v9.2 新功能)
- GFM 警示框:用 > [!NOTE] 開頭、後續 > 行為內容,會變成依類型上色的提示框(共 NOTE / TIP / IMPORTANT / WARNING / CAUTION 五種)
> [!NOTE]
> 這是一則 NOTE 提示,藍色;適合補充說明。
> [!TIP]
> 這是一則 TIP 提示,綠色;適合放技巧。
> [!IMPORTANT]
> 這是一則 IMPORTANT 重要提示,紫色;適合放關鍵提醒。
> [!WARNING]
> 這是 WARNING 警告,橙色;提醒使用者小心。
> [!CAUTION]
> 這是 CAUTION 危險提醒,紅色;適合放高風險事項。
- 跳脫字元:想顯示字面符號(而不是觸發格式)時,在符號前加反斜線。例如 \\* 顯示星號、\\_ 顯示底線、\\\` 顯示反引號
## Setext 標題示範
Setext H1 寫法
===
Setext H2 寫法
---
## 💬 引言的兩種命運(註解 vs 獨立節點)
> 【情況一】緊接標題、乾淨的引言 → 收進標題泡泡當「註解」。
> 這段就是本標題的註解(你正在看的這塊)。
- 【情況二】標題下「先有清單項、之後才出現 >」,該引言不會收進泡泡,而是變成獨立引用節點(看下一個黑底泡泡)
> 因為我前面已經有清單項了,所以我是獨立的引用節點,不是註解。
- 【情況三】用空行隔開的第二段引言,也會自成獨立節點
> 我和上面的引言之間有空行,所以我也是獨立的一塊。
## 📝 原始 Markdown 面板(雙向同步)
- 開關:點畫面右緣的「原始碼」分頁,或右鍵 → 檢視 → 原始 Markdown 面板
- 點節點 → 面板會高亮對應的文字列並捲動到位
- 高亮:目前節點對應行會以淡色橫條標示,行距較寬方便對照
- 點文字列 → 心智圖會選取並置中對應節點
- 提示:如果程式碼區塊、HTML 註解、details 或表格欄數看起來有問題,面板下方會顯示行號;點提示可跳到該行
- 即時編輯:在面板裡改 Markdown,心智圖會即時跟著更新
- 調整:拖面板左緣可改寬度;開關與寬度都會自動記住
- 大型檔案保護:貼入很多行 Markdown 時,同步會自動放慢,避免每打一字就卡住
## 💾 匯出與檔案
- 匯出 .md:右鍵 → 檔案 → 匯出(或 Ctrl+S),這才是保存原始 Markdown 原稿
- 匯出 HTML 靜態展示:右鍵 → 檔案 → 匯出 HTML 靜態展示,可離線展示目前心智圖,只保留平移、縮放與置中,不是原稿保存
- 匯出 JPG:右鍵 → 檔案 → 匯出 JPG,整張圖的高解析圖片;未保存時會先提醒
- 匯出 PDF:右鍵 → 檔案 → 匯出 PDF,整張圖縮放置入單張 A4;未保存時會先提醒
- 匯出前檢查:匯出 .md 前會提醒空標題、過長節點、未閉合程式碼區塊與表格欄位問題
- 快速修正:檢查報告中點擊空標題可補成「未命名節點」,點擊過長節點可定位並開啟編輯
- 全部可安全修正:匯出前檢查可批次補空標題,不會自動改寫過長文字或語法內容
- 重新檢查:修正問題後可在報告上直接刷新清單,不用重新執行匯出
- 忽略本次提醒:只關閉目前這次報告,不會改變永久檢查設定
- 報告按鈕主次:重新檢查是主要動作,安全修正是輔助動作,忽略本次使用低調樣式
- 分頁標題:瀏覽器分頁會顯示 MK2MD 與目前版號,避免舊分頁顯示未命名
- 分隔線拖曳:低縮放時,分隔線上下仍保留螢幕像素熱區,比較容易抓取
- 分隔線握把:滑過或選取分隔線時,左側會顯示拖曳握把提示
- 嚴重度分組:匯出前檢查會分成錯誤、警告、建議,優先處理錯誤再看警告
- 檢查設定:右鍵 → 檔案 → 匯出前檢查設定,可調整過長節點門檻或關閉部分提醒
- 開啟:右鍵 → 檔案 → 開啟,或把 .md 檔直接拖進畫面
- 新建:右鍵 → 檔案 → 新建,開一張空白心智圖
- 保存方式:本工具不使用自動草稿;離開前請用「匯出 Markdown」保存,HTML/JPG/PDF 不等於保存原始稿
## 🎨 配色
- 固定使用活力分支 Vivid 配色,不提供主題切換
- 顏色只是畫面視覺辨識,不會寫進 .md;載入時自動上色
## 🧭 版面與檢視
- 版面:固定 Markdown 順序瀏覽,父節點在左、同層由上往下排列,更接近原始 Markdown 的閱讀順序
- 置中:右鍵 → 檢視 → 置中,或右下角 ＋／－ 縮放、⤢ 重置
- 深色介面:右鍵 → 檢視 → 深色或淺色(會記住選擇)
- 搜尋:平常隱藏;按 Ctrl+F 或右鍵 → 檢視 → 搜尋開啟,Enter 跳下一個、Shift+Enter 跳上一個,Esc 關閉
- 命令面板:Ctrl+K,或右鍵 → 檢視 → 命令面板,可搜尋檔案、檢視、版面與自檢命令
- 每個節點右側的圓圈 ＋／－ 可展開或收合該分支
- 診斷/自檢:Ctrl+K 開啟命令面板後搜尋「自檢」,可檢查範本、Markdown 規則、大型 Markdown、匯出、HTML 單檔、分隔線位置、命令面板、右鍵選單、搜尋體驗、鍵盤操作與完整流程
- 自檢報告:執行完整自檢後會顯示報告面板,列出各組通過狀態與失敗原因
- 匯出自檢:會確認分隔線、表格、HTML、JPG/PDF 結構都有被匯出
## ⌨️ 快速鍵一覽
### 編輯結構
- Tab 子節點 · Enter 同層 · Shift+Tab 父節點
- Del 刪除 · F2 編輯文字 · 方向鍵 移動焦點
### 復原 · 選取 · 剪貼
- Ctrl+Z 復原 · Ctrl+Y 重做 · Ctrl+A 全選
- Ctrl+C 複製 · Ctrl+X 剪下 · Ctrl+V 貼上
### 格式 · 檔案
- Ctrl+B 粗體 · Ctrl+I 斜體
- Ctrl+F 搜尋 · Ctrl+K 命令面板 · Ctrl+S 匯出存檔

# 多中心示範
## 同一張畫布可放多個中心
- 各中心彼此獨立、互不相連
- 空白處右鍵「新增中心主題」可再開一張
- 在任一節點右鍵「提升為中心主題」可把它獨立出來
## 動手玩玩看
- 雙擊我,改成你自己的文字
- 選我之後按 Tab,幫我長一個子節點
- 打開右側「原始碼」面板,看看我長什麼樣子`;
roots = parseMarkdown(DEFAULT_MARKDOWN);
const templateSelfTestResult=runTemplateSelfTest({toast:false});
document.documentElement.dataset.templateSelfTest=templateSelfTestResult.ok?'pass':'fail';
document.documentElement.dataset.templateSelfTestPassed=String(templateSelfTestResult.passed);
document.documentElement.dataset.templateSelfTestFailed=String(templateSelfTestResult.failed);
const markdownRuleSelfTestResult=runMarkdownRuleSelfTest({toast:false});
document.documentElement.dataset.markdownRuleSelfTest=markdownRuleSelfTestResult.ok?'pass':'fail';
document.documentElement.dataset.markdownRuleSelfTestPassed=String(markdownRuleSelfTestResult.passed);
document.documentElement.dataset.markdownRuleSelfTestFailed=String(markdownRuleSelfTestResult.failed);
const largeMarkdownSelfTestResult=runLargeMarkdownPerformanceSelfTest({toast:false});
document.documentElement.dataset.largeMarkdownSelfTest=largeMarkdownSelfTestResult.ok?'pass':'fail';
document.documentElement.dataset.largeMarkdownSelfTestPassed=String(largeMarkdownSelfTestResult.passed);
document.documentElement.dataset.largeMarkdownSelfTestFailed=String(largeMarkdownSelfTestResult.failed);
document.documentElement.dataset.largeMarkdownSelfTestDetail=largeMarkdownSelfTestResult.checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail).join(' | ');
const exportSelfTestResult=runExportSelfTest({toast:false});
document.documentElement.dataset.exportSelfTest=exportSelfTestResult.ok?'pass':'fail';
document.documentElement.dataset.exportSelfTestPassed=String(exportSelfTestResult.passed);
document.documentElement.dataset.exportSelfTestFailed=String(exportSelfTestResult.failed);
document.documentElement.dataset.exportSelfTestDetail=exportSelfTestResult.checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail).join(' | ');
const htmlSingleFileSelfTestResult=runHtmlSingleFileSelfTest({toast:false});
document.documentElement.dataset.htmlSingleFileSelfTest=htmlSingleFileSelfTestResult.ok?'pass':'fail';
document.documentElement.dataset.htmlSingleFileSelfTestPassed=String(htmlSingleFileSelfTestResult.passed);
document.documentElement.dataset.htmlSingleFileSelfTestFailed=String(htmlSingleFileSelfTestResult.failed);
document.documentElement.dataset.htmlSingleFileSelfTestDetail=htmlSingleFileSelfTestResult.checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail).join(' | ');
const hrPositionSelfTestResult=runHrPositionSelfTest({toast:false});
document.documentElement.dataset.hrPositionSelfTest=hrPositionSelfTestResult.ok?'pass':'fail';
document.documentElement.dataset.hrPositionSelfTestPassed=String(hrPositionSelfTestResult.passed);
document.documentElement.dataset.hrPositionSelfTestFailed=String(hrPositionSelfTestResult.failed);
document.documentElement.dataset.hrPositionSelfTestDetail=hrPositionSelfTestResult.checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail).join(' | ');
const commandPaletteSelfTestResult=runCommandPaletteSelfTest({toast:false});
document.documentElement.dataset.commandPaletteSelfTest=commandPaletteSelfTestResult.ok?'pass':'fail';
document.documentElement.dataset.commandPaletteSelfTestPassed=String(commandPaletteSelfTestResult.passed);
document.documentElement.dataset.commandPaletteSelfTestFailed=String(commandPaletteSelfTestResult.failed);
document.documentElement.dataset.commandPaletteSelfTestDetail=commandPaletteSelfTestResult.checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail).join(' | ');
const contextMenuAccessibilitySelfTestResult=runContextMenuAccessibilitySelfTest({toast:false});
document.documentElement.dataset.contextMenuAccessibilitySelfTest=contextMenuAccessibilitySelfTestResult.ok?'pass':'fail';
document.documentElement.dataset.contextMenuAccessibilitySelfTestPassed=String(contextMenuAccessibilitySelfTestResult.passed);
document.documentElement.dataset.contextMenuAccessibilitySelfTestFailed=String(contextMenuAccessibilitySelfTestResult.failed);
document.documentElement.dataset.contextMenuAccessibilitySelfTestDetail=contextMenuAccessibilitySelfTestResult.checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail).join(' | ');
const searchExperienceSelfTestResult=runSearchExperienceSelfTest({toast:false});
document.documentElement.dataset.searchExperienceSelfTest=searchExperienceSelfTestResult.ok?'pass':'fail';
document.documentElement.dataset.searchExperienceSelfTestPassed=String(searchExperienceSelfTestResult.passed);
document.documentElement.dataset.searchExperienceSelfTestFailed=String(searchExperienceSelfTestResult.failed);
document.documentElement.dataset.searchExperienceSelfTestDetail=searchExperienceSelfTestResult.checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail).join(' | ');
document.documentElement.dataset.keyboardAccessibilitySelfTest='manual';
document.documentElement.dataset.keyboardAccessibilitySelfTestPassed='0';
document.documentElement.dataset.keyboardAccessibilitySelfTestFailed='0';
document.documentElement.dataset.keyboardAccessibilitySelfTestDetail='完整自檢或手動診斷時執行,避免啟動時操作焦點';
const interactionSelfTestResult=runInteractionSelfTest({toast:false});
document.documentElement.dataset.interactionSelfTest=interactionSelfTestResult.ok?'pass':'fail';
document.documentElement.dataset.interactionSelfTestPassed=String(interactionSelfTestResult.passed);
document.documentElement.dataset.interactionSelfTestFailed=String(interactionSelfTestResult.failed);
document.documentElement.dataset.interactionSelfTestDetail=interactionSelfTestResult.checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail).join(' | ');
selectOnly(roots[0]);
markSaved();
render(); fit();   // 顏色由 render() 依目前主題即時套用(預設 Vivid)
function runCiSelfTestIfRequested(){
  if(new URLSearchParams(location.search).get('ci-selftest')!=='1') return;
  const root=document.documentElement;
  root.dataset.ciSelfTest='running';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    try{
      const result=runMindMapFullSelfTest({toast:false, log:false, report:false});
      root.dataset.ciSelfTest=result.ok?'pass':'fail';
      root.dataset.ciSelfTestPassed=String(result.passed);
      root.dataset.ciSelfTestFailed=String(result.failed);
      root.dataset.ciSelfTestDetail=result.checks.filter(c=>!c.ok).map(c=>c.name+': '+c.detail).join(' | ');
    }catch(e){
      logCaught(e,'CI full self test');
      root.dataset.ciSelfTest='fail';
      root.dataset.ciSelfTestPassed='0';
      root.dataset.ciSelfTestFailed='1';
      root.dataset.ciSelfTestDetail=String(e&&e.message||e);
    }
  }));
}
runCiSelfTestIfRequested();
// 字體載入完成後,節點寬度會變化;重算一次版面,避免連接線與節點邊緣對不齊(出現空隙)
if(document.fonts && document.fonts.ready){ document.fonts.ready.then(()=>{ try{ const a=selected; renderKeepingAnchor(a); }catch(e){ logCaught(e,'font-ready anchor render'); try{ render(); }catch(_){ logCaught(_,'font-ready fallback render'); } } }); }
(function(){ const op=storageGet(STORAGE_KEYS.markdownPanelOpen, null, 'read markdown panel open state'); if(op==='1') toggleMdPanel(true); })();
