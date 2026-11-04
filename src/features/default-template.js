//===================== 範本自檢 =====================
function collectTemplateStats(nodes){
  const stats={roots:nodes.filter(isBranchNode).length,nodes:0,preamble:0,hr:0,table:0,code:0,html:0,alert:0,alerts:new Set(),fndef:0,refdef:0,quote:0,notes:0,todo:0,ordered:0,images:0,links:0};
  const walk=n=>{
    stats.nodes++;
    if(n.kind==='preamble') stats.preamble++;
    if(n.kind==='hr') stats.hr++;
    if(n.table) stats.table++;
    if(n.code!=null) stats.code++;
    if(n.kind==='html') stats.html++;
    if(n.alert){ stats.alert++; stats.alerts.add(n.alert); }
    if(n.fndef) stats.fndef++;
    if(n.refdef) stats.refdef++;
    if(n.quote) stats.quote++;
    if(n.note) stats.notes++;
    if(n.checked!==undefined) stats.todo++;
    if(n.ordered) stats.ordered++;
    const text=(n.title||'')+'\n'+(n.note||'');
    if(/<img\b|!\[/.test(text)) stats.images++;
    if(/<a\b|https?:\/\//.test(text)) stats.links++;
    for(const c of n.children) walk(c);
  };
  for(const r of nodes) walk(r);
  return stats;
}
function runTemplateSelfTest(options={}){
  const checks=[];
  const add=(name, ok, detail)=>checks.push({name, ok:!!ok, detail:detail||''});
  try{
    const parsed=parseMarkdown(DEFAULT_MARKDOWN);
    const stats=collectTemplateStats(parsed);
    const exported=toMarkdown(parsed);
    add('內建範本使用 MK2MD 品牌標題',
      /^# MK2MD · 使用說明$/m.test(DEFAULT_MARKDOWN)
      && /^# MK2MD · 使用說明$/m.test(exported),
      'MK2MD');
    add('範本可解析成多中心心智圖', stats.roots>=2, `${stats.roots} roots`);
    add('範本節點數足夠覆蓋主要功能', stats.nodes>=120, `${stats.nodes} nodes`);
    add('開頭序言節點存在', stats.preamble>=1, `${stats.preamble} preamble`);
    add('多層級水平分隔線存在', stats.hr>=3, `${stats.hr} hr`);
    add('表格節點存在', stats.table>=1, `${stats.table} table`);
    add('程式碼區塊存在', stats.code>=1, `${stats.code} code`);
    add('HTML 區塊示範存在', stats.html>=1, `${stats.html} html`);
    add('五種警示框皆存在', ['NOTE','TIP','IMPORTANT','WARNING','CAUTION'].every(t=>stats.alerts.has(t)), [...stats.alerts].join(','));
    add('腳註定義存在', stats.fndef>=1, `${stats.fndef} footnote`);
    add('參考式連結/圖片定義存在', stats.refdef>=3, `${stats.refdef} refs`);
    let embeddedImageRef=null;
    const findEmbeddedImageRef=n=>{
      if(embeddedImageRef) return;
      if(n.refdef && /^data:image\//i.test(String(n.refdef.url||''))) { embeddedImageRef=n; return; }
      for(const c of n.children||[]) findEmbeddedImageRef(c);
    };
    parsed.forEach(findEmbeddedImageRef);
    add('畫布以摘要顯示內嵌圖片參考定義',
      !!embeddedImageRef && refDefDisplayText(embeddedImageRef.refdef)==='[sample-image]: 內嵌圖片（SVG）',
      embeddedImageRef&&embeddedImageRef.refdef&&embeddedImageRef.refdef.raw);
    add('內嵌圖片參考定義匯出仍保留原始 Data URL',
      !!embeddedImageRef && exported.includes(embeddedImageRef.refdef.raw),
      embeddedImageRef&&embeddedImageRef.refdef&&embeddedImageRef.refdef.raw);
    add('引用與標題註解存在', stats.quote>=1 && stats.notes>=1, `${stats.quote} quotes, ${stats.notes} notes`);
    add('待辦與有序清單存在', stats.todo>=2 && stats.ordered>=3, `${stats.todo} todos, ${stats.ordered} ordered`);
    add('圖片與連結示範存在', stats.images>=1 && stats.links>=2, `${stats.images} images, ${stats.links} links`);
    add('匯出仍保留水平分隔線', /^---$/m.test(exported), '---');
    add('匯出仍保留表格', /\| 項目 \| 數量 \| 狀態 \|/.test(exported), 'table markdown');
    add('匯出仍保留程式碼圍欄', /```text/.test(exported), '```text');
    add('匯出仍保留 HTML 區塊原文', /<details open>[\s\S]*<\/details>/.test(exported), 'details');
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks, stats};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `範本自檢通過:${result.passed}/${checks.length}` : `範本自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    logCaught(e,'template self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'範本自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('範本自檢執行失敗');
    return result;
  }
}
window.runMindMapTemplateSelfTest=runTemplateSelfTest;
function runMarkdownRuleSelfTest(options={}){
  const checks=[];
  const add=(name, ok, detail)=>checks.push({name, ok:!!ok, detail:detail||''});
  const savedPreExportSettings=getPreExportChecks();
  try{
    const oldTitle=document.title;
    document.title='未命名';
    syncAppTitle();
    add('瀏覽器分頁標題包含目前版號', document.title===APP_TITLE && document.title.includes('v'+APP_VERSION), document.title);
    document.title=oldTitle;
    let parsed=parseMarkdown('# T\n| A | B |\n|---|---|\n| x\\|y | z |\n');
    let tableNode=parsed[0].children.find(n=>n.table);
    add('表格支援跳脫 pipe 並以字面 pipe 顯示', tableNode && tableNode.table.rows[0][0]==='x|y', tableNode&&tableNode.table.rows[0][0]);
    let out=toMarkdown(parsed);
    add('表格匯出會補回跳脫 pipe', /\| x\\\|y \| z \|/.test(out), out);
    parsed=parseMarkdown('# T\n3) 第三步\n4) 第四步\n');
    out=toMarkdown(parsed);
    add('有序清單保留原始編號與 ) marker', /^3\) 第三步$/m.test(out) && /^4\) 第四步$/m.test(out), out);
    const mixedRoot=makeNode('訓練'); mixedRoot.kind='h';
    const mixedParent=makeNode('4. 極限'); mixedParent.kind='h'; mixedParent.parent=mixedRoot;
    const mixedHeading=makeNode('啟動步伐'); mixedHeading.kind='h'; mixedHeading.parent=mixedParent;
    const mixedSibling=makeNode('正反手殺球'); mixedSibling.kind='ul'; mixedSibling.parent=mixedParent;
    mixedRoot.children=[mixedParent]; mixedParent.children=[mixedHeading,mixedSibling];
    const mixedOut=toMarkdown([mixedRoot]), mixedRound=parseMarkdown(mixedOut), mixedKids=mixedRound[0]&&mixedRound[0].children[0]&&mixedRound[0].children[0].children;
    add('混合標題與清單同層存檔後保持同層', !!(mixedKids && mixedKids.length===2 && mixedKids.map(n=>n.title).join('|')==='啟動步伐|正反手殺球'), mixedOut);
    parsed=parseMarkdown('# T\n- 第一點\n  這是延續段落\n');
    out=toMarkdown(parsed);
    add('清單縮排文字保留為同一項延續段落', /- 第一點\n  這是延續段落/.test(out), out);
    parsed=parseMarkdown('# T\n[^a]: 第一行\n    第二行\n    第三行\n');
    out=toMarkdown(parsed);
    add('腳註定義支援多行延續', /\[\^a\]: 第一行\n  第二行\n  第三行/.test(out), out);
    parsed=parseMarkdown('# T\n<details>\n<summary>標題</summary>\n內容\n</details>\n');
    out=toMarkdown(parsed);
    add('HTML 區塊安全顯示但匯出保留原文', /<details>[\s\S]*<\/details>/.test(out), out);
    const htmlDisplayProbe=document.createElement('div');
    const htmlDisplayReady=typeof renderHtmlBlockContent==='function' && typeof setHtmlDisplayMode==='function';
    let htmlDisplayDetail='尚未提供 HTML 顯示模式';
    if(htmlDisplayReady){
      const savedMode=htmlDisplayMode;
      setHtmlDisplayMode('text', false);
      renderHtmlBlockContent(htmlDisplayProbe, '<strong>純文字</strong>');
      const rawOk=!!htmlDisplayProbe.querySelector('.mdhtmlraw') && htmlDisplayProbe.textContent.includes('<strong>純文字</strong>');
      setHtmlDisplayMode('safe', false);
      renderHtmlBlockContent(htmlDisplayProbe, '<strong>安全</strong><scr'+'ipt>window.__htmlDisplayBad=1</scr'+'ipt>');
      const safeOk=!!htmlDisplayProbe.querySelector('strong') && !htmlDisplayProbe.querySelector('script');
      htmlDisplayDetail=`純文字:${rawOk};安全顯示:${safeOk}`;
      setHtmlDisplayMode(savedMode, false);
    }
    add('HTML 區塊支援純文字與白名單安全顯示', htmlDisplayReady && htmlDisplayDetail==='純文字:true;安全顯示:true', htmlDisplayDetail);
    parsed=parseMarkdown('# T\n> 第一層\n> > 第二層\n');
    out=toMarkdown(parsed);
    add('引用節點保留巢狀引用 marker', /^> > 第二層$/m.test(out), out);
    add('行內連結支援網址括號', /href="https:\/\/example\.com\/a\(b\)"/.test(inlineMd('[link](https://example.com/a(b))')), inlineMd('[link](https://example.com/a(b))'));
    add('行內連結支援 title', /title="說明"/.test(inlineMd('[link](https://example.com "說明")')), inlineMd('[link](https://example.com "說明")'));
    add('圖片支援 title', /title="圖片說明"/.test(inlineMd('![alt](data:image/png;base64,AA== "圖片說明")')), inlineMd('![alt](data:image/png;base64,AA== "圖片說明")'));
    add('多反引號 code span 不吃掉內部單反引號', /<code class="mdcode">a ` b<\/code>/.test(inlineMd('``a ` b``')), inlineMd('``a ` b``'));
    add('跳脫星號不會觸發斜體', !/<em>/.test(inlineMd('\\*不是斜體\\*')), inlineMd('\\*不是斜體\\*'));
    const alertRoot=makeNode('警示框操作測試');
    const alertNode=makeNode('這是提示內容');
    alertNode.parent=alertRoot; alertRoot.children=[alertNode];
    const alertApplied=formatAlertNode(alertNode,'TIP');
    out=toMarkdown([alertRoot]);
    add('右鍵提示框操作會輸出 GFM alert Markdown', alertApplied && /^> \[!TIP\]$/m.test(out) && /^> 這是提示內容$/m.test(out), out);
    add('移除提示框格式會回到一般清單節點', removeAlertNodeFormat(alertNode) && !alertNode.alert && alertNode.kind==='ul', JSON.stringify({kind:alertNode.kind, alert:alertNode.alert}));
    const escapedText=escapeMarkdownCharInText('*星號* _底線_ `code` #標題 >引用 -清單','*');
    add('右鍵跳脫符號會補反斜線且不重複補', escapedText==='\\*星號\\* _底線_ `code` #標題 >引用 -清單' && escapeMarkdownCharInText(escapedText,'*')===escapedText, escapedText);
    parsed=parseMarkdown('# T\n<!-- 註解\n仍是註解 -->\n');
    out=toMarkdown(parsed);
    add('HTML 註解區塊匯出保留', /<!-- 註解\n仍是註解 -->/.test(out), out);
    parsed=parseMarkdown('# A\nSetext H2\n---\n---\n## B\n');
    add('Setext 與水平線可同時判斷', parsed[0].children.some(n=>n.kind==='h' && n.title==='Setext H2') && parsed[0].children.some(n=>n.kind==='hr'), 'setext/hr');
    parsed=parseMarkdown('開頭序言\n\n---\n\n# A\n');
    add('序言後接 # 前的分隔線維持頂層', parsed[1] && parsed[1].kind==='hr' && !parsed[1].parent, parsed.map(n=>n.kind||n.title).join(','));
    let diag=analyzeMarkdownPanelText('# T\n```js\nconsole.log(1)\n');
    add('原始碼面板會提示未閉合程式碼圍欄', !diag.ok && diag.issues[0] && diag.issues[0].line===2 && /程式碼區塊/.test(diag.issues[0].message), JSON.stringify(diag));
    diag=analyzeMarkdownPanelText('# T\n| A | B |\n|---|---|\n| 1 | 2 | 3 |\n');
    add('原始碼面板會提示表格欄數不一致', diag.issues.some(i=>i.level==='warn' && i.line===4 && /表格資料列/.test(i.message)), JSON.stringify(diag));
    savePreExportChecks(DEFAULT_PRE_EXPORT_CHECKS);
    const preExportRoots=parseMarkdown('# 匯出前檢查\n- \n- '+('很長的節點文字'.repeat(12))+'\n');
    const preExport=analyzePreExportMarkdown('# 匯出前檢查\n| A | B |\n|---|---|\n| 1 | 2 | 3 |\n```js\nx\n', preExportRoots);
    add('匯出前檢查會彙整語法與節點品質', preExport.issues.some(i=>/程式碼區塊/.test(i.message)) && preExport.issues.some(i=>/表格資料列/.test(i.message)) && preExport.issues.some(i=>/空標題/.test(i.message)) && preExport.issues.some(i=>/超過 80 字/.test(i.message)), JSON.stringify(preExport));
    add('匯出前檢查項目可定位行或節點', preExport.issues.some(i=>i.line) && preExport.issues.some(i=>i.nodeId), JSON.stringify(preExport));
    add('匯出前檢查會標記可快速處理類型', preExport.issues.some(i=>i.type==='emptyTitle') && preExport.issues.some(i=>i.type==='longTitle'), JSON.stringify(preExport));
    const emptyNode=preExportRoots[0]&&preExportRoots[0].children&&preExportRoots[0].children[0];
    add('空標題快速修正會補成未命名節點', applyEmptyTitleQuickFix(emptyNode) && emptyNode.title==='未命名節點', emptyNode&&emptyNode.title);
    const groupedPreExport=buildPreExportReportGroups([
      {level:'error', message:'錯誤測試'},
      {level:'warn', message:'警告測試'},
      {level:'info', message:'建議測試'}
    ]);
    add('匯出前檢查報告會依嚴重度分組', groupedPreExport.map(g=>g.name).join('|')==='錯誤|警告|建議' && groupedPreExport.every(g=>g.result.checks.length===1), groupedPreExport.map(g=>`${g.name}:${g.result.checks.length}`).join(','));
    const safeFixRoots=parseMarkdown('# 批次修正\n- \n- \n- '+('很長的節點文字'.repeat(12))+'\n');
    const safeFixReport=analyzePreExportMarkdown('# 批次修正\n', safeFixRoots);
    const safeFixResult=applyPreExportSafeFixes(safeFixReport.issues, id=>{
      for(const r of safeFixRoots){ const n=findById(r,id); if(n) return n; }
      return null;
    });
    const safeFixTitles=safeFixRoots[0].children.map(n=>n.title);
    add('匯出前檢查全部安全修正只處理空標題', safeFixResult.fixed===2 && safeFixTitles[0]==='未命名節點' && safeFixTitles[1]==='未命名節點' && safeFixTitles[2].startsWith('很長的節點文字'), `${safeFixResult.fixed}/${safeFixTitles.join('|')}`);
    const reportActions=buildPreExportReportActions(safeFixReport).map(a=>a.label);
    add('匯出前檢查報告提供重新檢查動作', reportActions.some(label=>label==='重新檢查') && reportActions.some(label=>/^全部可安全修正/.test(label)), reportActions.join(','));
    add('匯出前檢查報告提供本次忽略動作', reportActions.some(label=>label==='忽略本次提醒'), reportActions.join(','));
    const reportActionMeta=buildPreExportReportActions(safeFixReport);
    add('匯出前檢查報告按鈕順序與主次清楚', reportActionMeta.map(a=>a.variant).join('|')==='primary|safe|quiet' && reportActionMeta.map(a=>a.label.replace(/\(.+\)$/,'')).join('|')==='重新檢查|全部可安全修正|忽略本次提醒', reportActionMeta.map(a=>`${a.label}:${a.variant}`).join(','));
    savePreExportChecks({emptyTitle:false, codeFence:false, table:false, longLimit:0});
    const disabledPreExport=analyzePreExportMarkdown('# T\n```js\nx\n| A | B |\n|---|---|\n| 1 | 2 | 3 |\n', preExportRoots);
    add('匯出前檢查設定可關閉提醒項目', disabledPreExport.ok && disabledPreExport.issues.length===0, JSON.stringify(disabledPreExport));
    savePreExportChecks(savedPreExportSettings);
    const dragRule=runDragRuleSelfTest();
    add('分隔線拖曳規則支援插入與拖入', dragRule.ok, JSON.stringify(dragRule));
    const oldW=svg.getAttribute('width'), oldH=svg.getAttribute('height');
    svg.setAttribute('width', '20000'); svg.setAttribute('height', '12000');
    const oldRoots=roots; roots=[makeNode('Zoom Test')];
    const zmin=minZoomScale();
    roots=oldRoots;
    if(oldW==null) svg.removeAttribute('width'); else svg.setAttribute('width', oldW);
    if(oldH==null) svg.removeAttribute('height'); else svg.setAttribute('height', oldH);
    add('大型心智圖縮放下限可低於 20%', zmin < 0.2 && zmin >= MIN_ZOOM_SCALE, String(zmin));
    const smallDelay=markdownCommitDelay('# T\n- A\n');
    const largeText='# Big\n'+Array.from({length:PERF_WARN_LINES+20},(_,i)=>'- node '+i).join('\n');
    const heavyText='# Huge\n'+Array.from({length:PERF_HEAVY_LINES+20},(_,i)=>'- node '+i).join('\n');
    add('大型 Markdown 會自動放慢即時同步', smallDelay===300 && markdownCommitDelay(largeText)>smallDelay && markdownCommitDelay(heavyText)>markdownCommitDelay(largeText), `${smallDelay}/${markdownCommitDelay(largeText)}/${markdownCommitDelay(heavyText)}`);
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `Markdown 規則自檢通過:${result.passed}/${checks.length}` : `Markdown 規則自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    savePreExportChecks(savedPreExportSettings);
    logCaught(e,'markdown rule self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'Markdown 規則自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('Markdown 規則自檢執行失敗');
    return result;
  }
}
window.runMindMapMarkdownRuleSelfTest=runMarkdownRuleSelfTest;
function buildLargeMarkdownFixture(count=PERF_WARN_LINES+160){
  const lines=['# Large Markdown Performance Test','', '> 大型檔案壓力測試'];
  for(let i=1;i<=count;i++){
    if(i%120===0) lines.push('', '---', '');
    if(i%90===0) lines.push(`## Section ${i}`);
    lines.push(`- Node ${i}`);
    if(i%55===0) lines.push(`  - Child ${i}.1`, `  - Child ${i}.2`);
    if(i%240===0) lines.push('', '| Item | Count | State |', '| --- | ---: | :---: |', `| Batch ${i} | ${i} | OK |`, '');
  }
  return lines.join('\n');
}
function runLargeMarkdownPerformanceSelfTest(options={}){
  const checks=[]; const add=(name, ok, detail='')=>checks.push({name, ok:!!ok, detail:String(detail||'')});
  const savedPerf=lastMarkdownPerformance;
  try{
    const md=buildLargeMarkdownFixture();
    const stats=markdownPerfStats(md);
    const delay=markdownCommitDelay(md);
    const t0=performance.now();
    const parsed=parseMarkdown(md);
    const t1=performance.now();
    const nodeCount=parsed.reduce((s,r)=>s+countNodes(r),0);
    const exported=toMarkdown(parsed);
    add('壓力測試樣本達大型檔案門檻', stats.large && !stats.heavy, `${stats.lines} lines, ${stats.chars} chars`);
    add('大型 Markdown 會使用較長同步延遲', delay===700, String(delay));
    add('大型 Markdown 可解析出足夠節點', nodeCount>=PERF_WARN_LINES, String(nodeCount));
    add('大型 Markdown 解析時間可量測', Number.isFinite(t1-t0) && (t1-t0)>=0 && (t1-t0)<5000, `${Math.round(t1-t0)}ms`);
    add('大型 Markdown 匯出仍保留分隔線與表格', /^---$/m.test(exported) && /\| Item \| Count \| State \|/.test(exported), 'hr/table');
    const heavyMd=buildLargeMarkdownFixture(PERF_HEAVY_LINES+80);
    add('超大型 Markdown 會進入重度保護延遲', markdownCommitDelay(heavyMd)===1200, String(markdownCommitDelay(heavyMd)));
    const perf=updateMarkdownPerformance(stats, nodeCount, t1-t0, 0, delay);
    add('效能資料會寫入診斷狀態', lastMarkdownPerformance.nodes===nodeCount && lastMarkdownPerformance.large && lastMarkdownPerformance.parseMs===Math.round(t1-t0), JSON.stringify(perf));
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `大型 Markdown 自檢通過:${result.passed}/${checks.length}` : `大型 Markdown 自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    logCaught(e,'large markdown performance self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'大型 Markdown 自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('大型 Markdown 自檢執行失敗');
    return result;
  }finally{
    lastMarkdownPerformance=savedPerf;
  }
}
window.runMindMapLargeMarkdownPerformanceSelfTest=runLargeMarkdownPerformanceSelfTest;
function runInteractionSelfTest(options={}){
  const checks=[];
  const add=(name, ok, detail)=>checks.push({name, ok:!!ok, detail:detail||''});
  const overlap=(a,b)=>!!(a&&b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top);
  const savedRoots=roots, savedSelectedId=selected&&selected.id, savedSelectionIds=[...selection].map(n=>n.id);
  const savedScale=scale, savedPanX=panX, savedPanY=panY, savedOrient=orient;
  const savedSavedMarkdown=savedMarkdown, savedLastExportAt=lastExportAt;
  const savedConfirm=window.confirm;
  try{
    roots=parseMarkdown('# 互動測試\n- 第一個節點\n- 第二個節點\n');
    setParents(roots[0], null);
    selected=roots[0].children[0]; selection=new Set([selected]);
    render();
    const first=roots[0].children[0], second=roots[0].children[1];
    const sampleHr=makeHrNode();
    add('測試節點已渲染到畫布', !!canvas.querySelector(`.node[data-id="${first.id}"]`), first.id);
    const collapseToggle=canvas.querySelector('.toggle');
    const toggleStyle=collapseToggle&&getComputedStyle(collapseToggle);
    add('收合加減符號在圓鈕內置中', !!(collapseToggle && toggleStyle && toggleStyle.display==='flex' && toggleStyle.alignItems==='center' && toggleStyle.justifyContent==='center' && collapseToggle.offsetWidth===18 && collapseToggle.offsetHeight===18),
      collapseToggle ? `${toggleStyle.display}/${toggleStyle.alignItems}/${toggleStyle.justifyContent}/${collapseToggle.offsetWidth}x${collapseToggle.offsetHeight}` : 'missing toggle');
    const toggleGlyph=collapseToggle&&collapseToggle.querySelector('svg');
    add('收合加減符號使用等粗 SVG 線段', !!(toggleGlyph && toggleGlyph.querySelectorAll('line').length===1 && getComputedStyle(toggleGlyph.querySelector('line')).strokeWidth==='2px'),
      toggleGlyph ? `${toggleGlyph.querySelectorAll('line').length} line/${getComputedStyle(toggleGlyph.querySelector('line')).strokeWidth}` : 'missing svg');
    const toggleLine=toggleGlyph&&toggleGlyph.querySelector('line');
    add('收合符號線段幾何中心固定', !!(toggleGlyph && toggleGlyph.getAttribute('viewBox')==='0 0 14 14' && toggleLine && Number(toggleLine.getAttribute('y1'))===7 && Number(toggleLine.getAttribute('y2'))===7 && Number(toggleLine.getAttribute('x1'))===3 && Number(toggleLine.getAttribute('x2'))===11),
      toggleLine ? `${toggleGlyph.getAttribute('viewBox')} / ${toggleLine.getAttribute('x1')},${toggleLine.getAttribute('y1')}-${toggleLine.getAttribute('x2')},${toggleLine.getAttribute('y2')}` : 'missing line');
    const firstDom=canvas.querySelector(`.node[data-id="${first.id}"]`), firstEdge=svg.querySelector('path.edge-flow');
    add('心智圖單元線條與框線統一粗細', !!(firstDom && firstEdge && getComputedStyle(firstDom).borderTopWidth==='2px' && firstEdge.getAttribute('stroke-width')==='2'), `${firstDom&&getComputedStyle(firstDom).borderTopWidth}|${firstEdge&&firstEdge.getAttribute('stroke-width')}`);
    add('固定 Markdown 順序版面啟用', orient==='h' && VGAP>=18, `orient=${orient}, vgap=${VGAP}`);
    add('拖曳提示使用上/下語言', /上方/.test(dropHintText('before', second, [first])) && /下方/.test(dropHintText('after', second, [first])), dropHintText('before', second, [first])+' / '+dropHintText('after', second, [first]));
    add('分隔線拖曳提示使用水平線上/下語言', /水平線.*上方/.test(dropHintText('before', second, [sampleHr])) && /水平線.*下方/.test(dropHintText('after', second, [sampleHr])), dropHintText('before', second, [sampleHr])+' / '+dropHintText('after', second, [sampleHr]));
    const before=insertHrNearNodeData(second, 'before');
    add('右鍵分隔線插入前方邏輯可用', before && roots[0].children[roots[0].children.indexOf(second)-1].kind==='hr', 'before second');
    const dragRule=runDragRuleSelfTest();
    add('拖曳分隔線規則自檢通過', dragRule.ok, JSON.stringify(dragRule));
    const oldMdValue=mdTextEl.value, oldMdScroll=mdTextEl.scrollTop, oldMdActiveBlock=mdActiveBlock;
    const oldHiDisplay=mdHiEl.style.display, oldHiTop=mdHiEl.style.top, oldHiHeight=mdHiEl.style.height;
    const oldMdInfoHtml=mdInfoEl.innerHTML, oldMdInfoClass=mdInfoEl.className, oldMdInfoLine=mdInfoEl.dataset.line, oldMdInfoTitle=mdInfoEl.getAttribute('title');
    mdTextEl.value='# A\n- B\n- C\n';
    mdTextEl.scrollTop=0;
    setActiveMdLine(1);
    const mdStyle=getComputedStyle(mdTextEl);
    const mdLineHeight=parseFloat(mdStyle.lineHeight), mdPaddingTop=parseFloat(mdStyle.paddingTop);
    const hiTop=parseFloat(mdHiEl.style.top), hiHeight=parseFloat(mdHiEl.style.height);
    add('原始 Markdown 面板行高與高亮對齊', Math.abs(mdLineHeight-MD_LH)<0.5 && Math.abs(mdPaddingTop-MD_PAD)<0.5 && Math.abs(hiTop-(MD_PAD+MD_LH))<0.5 && Math.abs(hiHeight-MD_LH)<0.5,
      `lh=${mdLineHeight}, pad=${mdPaddingTop}, hi=${hiTop}/${hiHeight}`);
    mdTextEl.value='# A\n```js\nx\n';
    mdTextEl.scrollTop=0;
    updateMdInfo(mdTextEl.value, 1, {});
    mdInfoEl.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
    add('原始 Markdown 診斷可點擊跳到問題行', mdInfoEl.classList.contains('jump') && mdInfoEl.dataset.line==='2' && mdActiveBlock && mdActiveBlock.a===1 && mdTextEl.selectionStart===4,
      `class=${mdInfoEl.className}, line=${mdInfoEl.dataset.line}, active=${mdActiveBlock&&mdActiveBlock.a}, sel=${mdTextEl.selectionStart}`);
    mdTextEl.value=oldMdValue; mdTextEl.scrollTop=oldMdScroll; mdActiveBlock=oldMdActiveBlock;
    mdHiEl.style.display=oldHiDisplay; mdHiEl.style.top=oldHiTop; mdHiEl.style.height=oldHiHeight;
    mdInfoEl.innerHTML=oldMdInfoHtml; mdInfoEl.className=oldMdInfoClass;
    if(oldMdInfoLine==null) delete mdInfoEl.dataset.line; else mdInfoEl.dataset.line=oldMdInfoLine;
    if(oldMdInfoTitle==null) mdInfoEl.removeAttribute('title'); else mdInfoEl.setAttribute('title', oldMdInfoTitle);
    const nodeDom=canvas.querySelector(`.node[data-id="${first.id}"]`);
    if(nodeDom){
      nodeDom.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:120,clientY:120}));
      const menuText=ctxEl.textContent||'';
      add('右鍵選單已移除子節點最前/最後分隔線項目', !/插入到子節點最前|插入到子節點最後/.test(menuText), menuText);
      add('右鍵選單已移除方向切換', !/切換方向|橫\/直/.test(menuText), menuText);
      const headers=[...ctxEl.querySelectorAll('.ctxhdr')].map(h=>h.textContent.trim());
      const menuBtn=ctxEl.querySelector('button:not(:disabled)');
      const menuBtnH=menuBtn ? menuBtn.getBoundingClientRect().height : 0;
      add('右鍵選單有清楚分組標題', ['編輯','節點','工具'].every(h=>headers.includes(h)), headers.join(','));
      add('右鍵選單列高與寬度穩定', ctxEl.offsetWidth>=218 && menuBtnH>=32, `w=${ctxEl.offsetWidth}, row=${menuBtnH}`);
      hideCtx();
    } else add('右鍵選單已移除子節點最前/最後分隔線項目', false, 'missing node dom');
    render();
    const cv=renderMapToCanvas({skipRender:true});
    add('匯出畫布可產生內容', !!(cv && cv.width>0 && cv.height>0), cv?`${cv.width}x${cv.height}`:'no canvas');
    const fitCalc=fitViewForContent(12000, 8000, 1600, 900, 80);
    const centerErrX=Math.abs((fitCalc.panX+12000*fitCalc.scale/2)-800);
    const centerErrY=Math.abs((fitCalc.panY+8000*fitCalc.scale/2)-450);
    add('置中縮放會把整張圖置於畫面中央', centerErrX<0.01 && centerErrY<0.01 && fitCalc.scale>=MIN_ZOOM_SCALE, `scale=${fitCalc.scale}, err=${centerErrX}/${centerErrY}`);
    setStatusMessage('測試訊息','info',0);
    const statusText=statusEl.textContent||'';
    const zoom=document.querySelector('.zoombar');
    const sr=statusEl&&statusEl.getBoundingClientRect(), zr=zoom&&zoom.getBoundingClientRect();
    add('左下資訊欄整合教學狀態與訊息', /節點/.test(statusText) && /右鍵叫出選單/.test(statusText) && /測試訊息/.test(statusText) && !overlap(sr,zr),
      `status=${statusText}, status=${sr&&Math.round(sr.left)+'-'+Math.round(sr.right)}, zoom=${zr&&Math.round(zr.left)+'-'+Math.round(zr.right)}`);
    setStatusMessage('', '', 0);
    const oldSavedMarkdown=savedMarkdown, oldLastExportAt=lastExportAt;
    roots=parseMarkdown('# 保存狀態自檢\n- A\n');
    roots.forEach(r=>setParents(r,null));
    savedMarkdown='# different\n';
    lastExportAt='';
    refreshSaveState();
    add('未匯出狀態提示手動匯出', saveStateEl.classList.contains('dirty') && /請匯出 Markdown/.test(saveInfoEl.textContent||''), saveInfoEl.textContent);
    let confirmMessage='';
    window.confirm=msg=>{ confirmMessage=String(msg||''); return false; };
    add('非 Markdown 匯出會提醒不是原稿保存', confirmNonMarkdownExport('HTML 靜態展示')===false && /不會保存原始 Markdown/.test(confirmMessage), confirmMessage);
    savedMarkdown=toMarkdown(roots);
    lastExportAt=new Date().toISOString();
    refreshSaveState();
    add('匯出後顯示最後匯出時間', saveStateEl.classList.contains('saved') && /最後匯出/.test(saveInfoEl.textContent||'') && !!lastExportAt, saveInfoEl.textContent);
    confirmMessage='';
    add('已保存時非 Markdown 匯出不打擾', confirmNonMarkdownExport('PDF')===true && confirmMessage==='', confirmMessage);
    window.confirm=savedConfirm;
    savedMarkdown=oldSavedMarkdown; lastExportAt=oldLastExportAt;
    render();
    svg.setAttribute('width','12000'); svg.setAttribute('height','8000');
    const zmin=minZoomScale();
    add('大型圖縮放下限可低於 20% 且不小於安全下限', zmin>=MIN_ZOOM_SCALE && zmin<0.2, String(zmin));
    roots=parseMarkdown('# 分隔線熱區自檢\n- 上方節點\n---\n- 下方節點\n');
    roots.forEach(r=>setParents(r,null));
    scale=0.08; panX=80; panY=80; render(); applyTransform();
    const hrDom=canvas.querySelector('.node.hrnode');
    const hrRect=hrDom&&hrDom.getBoundingClientRect();
    const hitDom=hrRect&&findHrHitNodeDom(hrRect.left+12, hrRect.top+hrRect.height+10);
    add('低縮放分隔線有螢幕像素拖曳熱區', !!(hitDom && hitDom===hrDom), hitDom&&hitDom.dataset.id);
    add('水平分隔線不顯示額外拖曳符號', !!(hrDom && !hrDom.querySelector('.hrhandle') && /直接拖曳水平線/.test(hrDom.title||'')), hrDom&&hrDom.title);
    const savedDropClass=dropEl.className;
    const nonFileTransfer=new DataTransfer();
    dropEl.classList.remove('show');
    viewport.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:nonFileTransfer}));
    add('非檔案拖曳不顯示檔案置入提示', !dropEl.classList.contains('show'), Array.from(nonFileTransfer.types).join(',')||'no types');
    const fileTransfer=new DataTransfer();
    fileTransfer.items.add(new File(['# MK2MD drag test'],'drag-test.md',{type:'text/markdown'}));
    dropEl.classList.remove('show');
    viewport.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:fileTransfer}));
    add('拖入檔案會顯示檔案置入提示', dropEl.classList.contains('show'), Array.from(fileTransfer.types).join(','));
    dropEl.className=savedDropClass;
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `完整自檢通過:${result.passed}/${checks.length}` : `完整自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    logCaught(e,'interaction self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'完整自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('完整自檢執行失敗');
    return result;
  }finally{
    roots=savedRoots;
    window.confirm=savedConfirm;
    savedMarkdown=savedSavedMarkdown; lastExportAt=savedLastExportAt;
    scale=savedScale; panX=savedPanX; panY=savedPanY; orient=savedOrient;
    roots.forEach(r=>setParents(r,null));
    selection=new Set();
    savedSelectionIds.forEach(id=>{ const n=findByIdAll(id); if(n) selection.add(n); });
    selected=savedSelectedId ? findByIdAll(savedSelectedId) : null;
    if(!selected && selection.size) selected=[...selection][0];
    try{ render(); applyTransform(); }catch(e){ logCaught(e,'restore after interaction self test'); }
  }
}
function runMindMapFullSelfTest(options={}){
  const groups=[
    {name:'範本', result:runTemplateSelfTest({toast:false, log:options.log})},
    {name:'Markdown 規則', result:runMarkdownRuleSelfTest({toast:false, log:options.log})},
    {name:'大型 Markdown', result:runLargeMarkdownPerformanceSelfTest({toast:false, log:options.log})},
    {name:'匯出視覺', result:runExportSelfTest({toast:false, log:options.log})},
    {name:'HTML 單檔', result:runHtmlSingleFileSelfTest({toast:false, log:options.log})},
    {name:'分隔線位置', result:runHrPositionSelfTest({toast:false, log:options.log})},
    {name:'命令面板', result:runCommandPaletteSelfTest({toast:false, log:options.log})},
    {name:'右鍵選單', result:runContextMenuAccessibilitySelfTest({toast:false, log:options.log})},
    {name:'搜尋體驗', result:runSearchExperienceSelfTest({toast:false, log:options.log})},
    {name:'鍵盤操作', result:runKeyboardAccessibilitySelfTest({toast:false, log:options.log})},
    {name:'互動流程', result:runInteractionSelfTest({toast:false, log:options.log})}
  ];
  const checks=[];
  for(const g of groups){ checks.push({name:g.name, ok:!!g.result.ok, detail:`${g.result.passed||0}/${(g.result.checks||[]).length}`}); }
  const failed=checks.filter(c=>!c.ok);
  const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks, groups};
  if(options.log) console.table(checks);
  if(options.toast) showToast(result.ok ? `完整自檢通過:${result.passed}/${checks.length}` : `完整自檢失敗:${failed.length} 組`);
  if(options.report!==false) showSelfTestReport(result);
  return result;
}
const selfTestReportEl=document.getElementById('selfTestReport');
const selfTestSummaryEl=document.getElementById('selfTestSummary');
const selfTestBodyEl=document.getElementById('selfTestBody');
const selfTestCloseEl=document.getElementById('selfTestClose');
const selfTestExpandEl=document.getElementById('selfTestExpand');
const selfTestCollapseEl=document.getElementById('selfTestCollapse');
let lastSelfTestReport=null;
let selfTestReturnFocus=null;
function setReportGroupsCollapsed(collapsed){
  if(!selfTestBodyEl) return;
  selfTestBodyEl.querySelectorAll('.report-group').forEach(g=>{
    g.classList.toggle('collapsed', collapsed);
    const caret=g.querySelector('.report-caret');
    if(caret) caret.textContent=collapsed?'▶':'▼';
  });
}
function showSelfTestReport(result){
  lastSelfTestReport=result;
  if(!selfTestReportEl || !selfTestSummaryEl || !selfTestBodyEl || !result) return result;
  if(document.activeElement && !selfTestReportEl.contains(document.activeElement)) selfTestReturnFocus=document.activeElement;
  const total=(result.checks||[]).length;
  const titleEl=selfTestReportEl.querySelector('.report-title');
  if(titleEl) titleEl.textContent=result.title||'自檢報告';
  selfTestSummaryEl.textContent=result.summaryText || (result.ok ? `通過 ${result.passed}/${total}` : `失敗 ${result.failed} 組`);
  selfTestSummaryEl.classList.toggle('fail', !result.ok);
  selfTestReportEl.querySelectorAll('.report-dynamic-action').forEach(el=>el.remove());
  (result.actions||[]).forEach(action=>{
    if(!action || typeof action.fn!=='function') return;
    const btn=document.createElement('button');
    btn.className='report-action report-dynamic-action'+(action.variant?` ${action.variant}`:'');
    btn.textContent=action.label||'執行';
    btn.title=action.title||action.label||'執行';
    btn.addEventListener('click', action.fn);
    selfTestExpandEl&&selfTestExpandEl.before(btn);
  });
  selfTestBodyEl.replaceChildren();
  const groups=result.groups&&result.groups.length ? result.groups : [{name:'自檢', result}];
  for(const g of groups){
    const group=document.createElement('section');
    const ok=!!(g.result&&g.result.ok);
    group.className='report-group'+(ok?' collapsed':' fail')+(g.severity?` sev-${g.severity}`:'');
    const head=document.createElement('div');
    head.className='report-group-head';
    const caret=document.createElement('span');
    caret.className='report-caret';
    caret.textContent=ok?'▶':'▼';
    const badge=document.createElement('span');
    badge.className='badge';
    badge.textContent=g.badge || (ok?'PASS':'FAIL');
    const name=document.createElement('span');
    name.textContent=g.name||'自檢';
    const meta=document.createElement('small');
    const groupChecks=(g.result&&g.result.checks)||[];
    meta.textContent=`${g.result&&g.result.passed||0}/${groupChecks.length}`;
    head.append(caret,badge,name,meta);
    head.addEventListener('click', ()=>{
      group.classList.toggle('collapsed');
      caret.textContent=group.classList.contains('collapsed')?'▶':'▼';
    });
    group.append(head);
    const failedChecks=groupChecks.filter(c=>!c.ok);
    const showChecks=failedChecks.length ? failedChecks : groupChecks.slice(0,3);
    if(showChecks.length){
      const list=document.createElement('div');
      list.className='report-checks';
      for(const c of showChecks){
        const item=document.createElement('div');
        item.className='report-check'+(c.ok?'':' fail');
        if(typeof c.action==='function'){
          item.classList.add('clickable');
          item.tabIndex=0;
          item.title='點擊定位';
          item.addEventListener('click', c.action);
          item.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); c.action(); } });
        }
        const mark=document.createElement('span');
        mark.textContent=c.ok?'✓':'!';
        const title=document.createElement('b');
        title.textContent=c.name||'未命名檢查';
        item.append(mark,title);
        if(c.detail){
          const detail=document.createElement('div');
          detail.className='report-detail';
          detail.textContent=String(c.detail);
          item.append(detail);
        }
        list.append(item);
      }
      group.append(list);
    }
    selfTestBodyEl.append(group);
  }
  selfTestReportEl.classList.add('show');
  if(selfTestCloseEl) selfTestCloseEl.focus();
  return result;
}
function openSelfTestReport(){
  if(lastSelfTestReport) showSelfTestReport(lastSelfTestReport);
  else showSelfTestReport(runMindMapFullSelfTest({toast:false, report:false}));
}
function closeSelfTestReport(){
  if(selfTestReportEl) selfTestReportEl.classList.remove('show');
  const el=selfTestReturnFocus;
  selfTestReturnFocus=null;
  if(el && typeof el.focus==='function' && document.contains(el)) el.focus();
}
selfTestCloseEl&&selfTestCloseEl.addEventListener('click', closeSelfTestReport);
selfTestExpandEl&&selfTestExpandEl.addEventListener('click', ()=>setReportGroupsCollapsed(false));
selfTestCollapseEl&&selfTestCollapseEl.addEventListener('click', ()=>setReportGroupsCollapsed(true));
function runCommandPaletteSelfTest(options={}){
  const checks=[]; const add=(name, ok, detail='')=>checks.push({name, ok:!!ok, detail:String(detail||'')});
  try{
    const brandNameEl = document.getElementById('brandName');
    const brandIconEl = document.querySelector('#fwBrand .brandIcon');
    const brandCreditEl = document.querySelector('#fwBrand .brandCredit a');
    const diagnostics = collectDiagnostics();
    add('現行品牌名稱集中為 MK2MD',
      APP_NAME === 'MK2MD'
      && APP_VERSION === '11.16'
      && APP_DATE === '2026-11-04'
      && APP_TITLE === 'MK2MD v11.16'
      && document.title === APP_TITLE
      && !!brandNameEl
      && brandNameEl.textContent === APP_NAME
      && !!brandIconEl
      && brandIconEl.getAttribute('src').startsWith('data:image/png;base64,')
      && !!brandCreditEl
      && brandCreditEl.href === 'https://www.flaticon.com/free-icon/mindmap_81155'
      && diagnostics.app === APP_NAME,
      [APP_NAME, APP_VERSION, APP_DATE, APP_TITLE, document.title,
        brandNameEl && brandNameEl.textContent, brandIconEl && brandIconEl.naturalWidth,
        brandCreditEl && brandCreditEl.href, diagnostics.app].join('|'));
    const savedCurrentName = currentName;
    const savedRoots = roots;
    try{
      currentName = '';
      roots = [];
      const fallbackExportName = _expName('md');
      add('無文件名稱時匯出 fallback 使用 MK2MD',
        _safeFileBase('') === APP_NAME
        && fallbackExportName === APP_NAME + '.md',
        fallbackExportName);
    }finally{
      currentName = savedCurrentName;
      roots = savedRoots;
    }
    const commands=getCommandItems();
    const textProbe=document.createElement('div');
    setSafeText(textProbe,'<b>使用者文字</b>');
    let reasonRequired=false;
    try{ setTrustedHTML(textProbe,'<b>missing reason</b>'); }catch(_){ reasonRequired=true; }
    add('使用者文字走安全文字入口且 HTML 入口要求來源說明', textProbe.textContent==='<b>使用者文字</b>' && reasonRequired, textProbe.innerHTML);
    const markupProbe=document.createElement('div');
    setTrustedHTML(markupProbe,'<strong>保留</strong><scr'+'ipt>window.__bad=1</scr'+'ipt><img src="javascript:alert(1)" onerror="window.__bad=2">','sanitizer self test');
    add('HTML 白名單會移除危險標籤、事件與 URL', !!markupProbe.querySelector('strong') && !markupProbe.querySelector('script') && !markupProbe.querySelector('[onerror]') && !markupProbe.querySelector('img[src^="javascript:"]'), markupProbe.innerHTML);
    add('命令清單有基本項目', commands.length>=15, String(commands.length));
    add('命令清單包含檔案功能', commands.some(c=>c.label==='匯出 Markdown') && commands.some(c=>c.label==='匯出 PDF') && commands.some(c=>c.label==='匯出 HTML 靜態展示'), commands.map(c=>c.label).join(','));
    add('命令清單標明 Markdown 是原始稿保存', commands.some(c=>c.label==='匯出 Markdown' && c.hint==='保存原始稿') && commands.some(c=>c.label==='匯出 HTML 靜態展示' && /not source save/.test(c.aliases||'')), commands.map(c=>c.label+':'+(c.hint||'')).join(','));
    add('命令清單包含診斷功能', commands.some(c=>c.label==='完整自檢') && commands.some(c=>c.label==='命令面板自檢') && commands.some(c=>c.label==='HTML 單檔自檢') && commands.some(c=>c.label==='大型 Markdown 自檢') && commands.some(c=>c.label==='右鍵選單自檢') && commands.some(c=>c.label==='搜尋體驗自檢') && commands.some(c=>c.label==='鍵盤操作自檢') && commands.some(c=>c.label==='自檢報告'), commands.map(c=>c.label).join(','));
    const menu=buildMainMenuItems();
    const fileSub=menu.fileSub||[];
    const viewSub=menu.viewSub||[];
    const diagSub=menu.diagSub||[];
    const menuLabels=list=>list.flatMap(item=>{
      if(!item || typeof item==='string') return [];
      const labels=item.label?[item.label]:[];
      if(item.sub) labels.push(...menuLabels(item.sub));
      return labels;
    });
    const rightClickLabels=[...menuLabels(fileSub),...menuLabels(viewSub)];
    const diagnosticLabels=menuLabels(diagSub);
    const hasRightClickLabel=needle=>rightClickLabels.some(label=>String(label).includes(needle));
    add('右鍵選單是一般功能入口', hasRightClickLabel('新建') && hasRightClickLabel('開啟') && hasRightClickLabel('匯出 .md') && hasRightClickLabel('匯出 HTML') && hasRightClickLabel('匯出 JPG') && hasRightClickLabel('匯出 PDF') && hasRightClickLabel('搜尋') && hasRightClickLabel('置中') && (hasRightClickLabel('深色') || hasRightClickLabel('淺色')) && hasRightClickLabel('命令面板'), rightClickLabels.join(','));
    add('診斷自檢不顯示在一般右鍵選單', !rightClickLabels.some(label=>String(label).includes('診斷') || String(label).includes('自檢')), rightClickLabels.join(','));
    add('診斷自檢保留在命令面板', commands.some(c=>c.label==='完整自檢') && commands.some(c=>c.label==='右鍵選單自檢') && diagnosticLabels.some(label=>String(label).includes('完整自檢')), diagnosticLabels.join(','));
    add('快捷入口必須仍存在於右鍵', !!document.getElementById('fwSearch') && hasRightClickLabel('搜尋') && hasRightClickLabel('開啟') && hasRightClickLabel('匯出 .md') && hasRightClickLabel('置中') && (hasRightClickLabel('深色') || hasRightClickLabel('淺色')), rightClickLabels.join(','));
    add('檔案選單包含匯出前檢查設定', fileSub.some(i=>i.label==='⚙ 匯出前檢查設定' && i.sub && i.sub.length>=6), fileSub.map(i=>i.label||i.header||i).join(','));
    const orderedLabels=list=>list.filter(i=>i && typeof i!=='string' && i.label).map(i=>String(i.label));
    const labelIndex=(labels, needle)=>labels.findIndex(label=>label.includes(needle));
    const orderedBefore=(labels, needles)=>needles.every((needle, idx)=>{
      const current=labelIndex(labels, needle);
      const previous=idx===0 ? -1 : labelIndex(labels, needles[idx-1]);
      return current>=0 && current>previous;
    });
    const fileLabels=orderedLabels(fileSub);
    add('檔案選單排序符合一般使用流程', orderedBefore(fileLabels, ['開啟','新建','匯出 .md','匯出 JPG','匯出 PDF','匯出 HTML','匯出前檢查']), fileLabels.join(','));
    const viewLabels=orderedLabels(viewSub);
    const themeNeedle=viewLabels.some(label=>label.includes('深色')) ? '深色' : '淺色';
    add('檢視選單排序符合常用優先', orderedBefore(viewLabels, ['置中','搜尋','原始 Markdown',themeNeedle,'節點寬度','命令面板','工具列歸位','版面除錯']), viewLabels.join(','));
    const sampleStructureNode=makeNode('節點操作排序樣本');
    const sampleStructureChild=makeNode('子節點');
    sampleStructureChild.parent=sampleStructureNode;
    sampleStructureNode.parent={};
    sampleStructureNode.children=[sampleStructureChild];
    const structureLabels=orderedLabels(buildStructureMenuItems(sampleStructureNode));
    add('節點操作排序符合編輯頻率', orderedBefore(structureLabels, ['同層節點','子節點','父節點','收合','提升為中心主題']), structureLabels.join(','));
    const nodeGroupLabels=orderedLabels(buildNodeActionGroupItems({
      structureSub:[],
      fmtSub:[],
      listSub:[],
      iconSub:[],
      dividerSub:[],
      clipSub:[]
    }));
    add('節點右鍵第一層依使用頻率排序', orderedBefore(nodeGroupLabels, ['節點操作','文字格式','清單','圖示','分隔線','剪貼簿']), nodeGroupLabels.join(','));
    const listLabels=orderedLabels(buildListMenuItems());
    add('清單右鍵標籤使用切換語意', orderedBefore(listLabels, ['切換待辦','切換有序清單','切換引用']), listLabels.join(','));
    const iconMenu=buildIconMenuItems();
    const iconMenuParts=iconMenu.map(item=>item&&typeof item!=='string'&&(item.header||item.label)?(item.header||item.label):String(item));
    const iconHeaderIdx=iconMenuParts.indexOf('加圖示');
    const iconDividerIdx=iconMenuParts.indexOf('—');
    const iconClearHeaderIdx=iconMenuParts.indexOf('清除');
    const iconClearActionIdx=labelIndex(iconMenuParts, '清除圖示/待辦');
    add('圖示右鍵子選單分開加圖示與清除', iconHeaderIdx===0 && iconDividerIdx>iconHeaderIdx && iconClearHeaderIdx>iconDividerIdx && iconClearActionIdx>iconClearHeaderIdx && iconMenuParts.filter(part=>part.includes('加圖示')).length>=ICONS.length+1, iconMenuParts.join(','));
    const dividerLabels=orderedLabels(buildDividerMenuItems(sampleStructureNode));
    add('分隔線右鍵標籤明確說明節點上下方', orderedBefore(dividerLabels, ['這個節點上方加入分隔線','這個節點下方加入分隔線']), dividerLabels.join(','));
    const clipboardMenuParts=buildClipboardMenuItems(true).map(item=>item&&typeof item!=='string'&&(item.header||item.label)?(item.header||item.label):String(item));
    const clipboardHeaderIdx=clipboardMenuParts.indexOf('複製貼上');
    const copyActionIdx=clipboardMenuParts.indexOf('📋 複製');
    const cutActionIdx=clipboardMenuParts.indexOf('✂️ 剪下');
    const pasteActionIdx=clipboardMenuParts.indexOf('📥 貼上');
    const clipboardDividerIdx=clipboardMenuParts.indexOf('—');
    const dangerHeaderIdx=clipboardMenuParts.indexOf('危險操作');
    add('剪貼簿右鍵子選單分開複製貼上與危險操作', clipboardHeaderIdx===0 && copyActionIdx>clipboardHeaderIdx && cutActionIdx>copyActionIdx && pasteActionIdx>cutActionIdx && clipboardDividerIdx>pasteActionIdx && dangerHeaderIdx>clipboardDividerIdx && clipboardMenuParts.indexOf('🗑 刪除')>dangerHeaderIdx, clipboardMenuParts.join(','));
    const textFormatMenu=buildTextFormatMenuItems();
    const textFormatLabels=menuLabels(textFormatMenu);
    const textFormatTopLabels=textFormatMenu.map(item=>item&&typeof item!=='string'&&(item.header||item.label)?(item.header||item.label):String(item));
    add('文字格式右鍵包含提示框與跳脫符號', ['套成 NOTE','套成 TIP','套成 IMPORTANT','套成 WARNING','套成 CAUTION','移除提示框','跳脫 *','跳脫 _','跳脫 `','跳脫 #','跳脫 >','跳脫 -'].every(needle=>textFormatLabels.some(label=>String(label).includes(needle))), textFormatLabels.join(','));
    add('文字格式右鍵分段清楚', orderedBefore(textFormatTopLabels, ['基本格式','粗體','斜體','刪除線','Markdown 區塊','警示框','跳脫符號','\\ 跳脫符號','連結','連結…']), textFormatTopLabels.join(','));
    add('命令清單不再提供方向切換', !commands.some(c=>/切換方向|橫式|直式/.test(c.label+' '+(c.aliases||''))), commands.map(c=>c.label).join(','));
    const retiredCompactUiPattern=new RegExp('小螢幕|'+'mobile','i');
    add('桌面版不包含小螢幕入口', !document.getElementById('mobile'+'MenuBtn') && !commands.some(c=>retiredCompactUiPattern.test(c.label+' '+(c.aliases||''))) && typeof window['runMindMap'+'MobileEntrySelfTest']==='undefined', commands.map(c=>c.label).join(','));
    const floatWins=[...document.querySelectorAll('.floatwin')];
    const hiddenFloatWins=floatWins.filter(w=>getComputedStyle(w).display==='none').map(w=>w.id);
    add('搜尋工具預設隱藏且品牌資訊維持顯示', hiddenFloatWins.join(',')==='fwSearch' && getComputedStyle(document.getElementById('fwBrand')).display!=='none', hiddenFloatWins.join(','));
    const floatWinIds=floatWins.map(w=>w.id).sort();
    add('浮動工具窗只保留全域高頻入口', floatWinIds.join('|')==='fwBrand|fwSearch', floatWinIds.join(','));
    const savedFwPos=fwPos;
    fwPos={};
    placeFloatWins();
    const rowWins=FLOAT_ORDER.map(id=>document.getElementById(id)).filter(w=>w && getComputedStyle(w).display!=='none').map(w=>({id:w.id, left:parseFloat(w.style.left)||0, top:parseFloat(w.style.top)||0, width:w.offsetWidth||0}));
    const rows=[];
    for(const w of rowWins){
      let row=rows.find(r=>Math.abs(r.top-w.top)<=1);
      if(!row){ row={top:w.top, wins:[]}; rows.push(row); }
      row.wins.push(w);
    }
    rows.sort((a,b)=>a.top-b.top);
    rows.forEach(r=>r.wins.sort((a,b)=>a.left-b.left));
    const rowGaps=rows.flatMap(r=>r.wins.slice(1).map((w,i)=>Math.round(w.left-(r.wins[i].left+r.wins[i].width))));
    const rowLayoutOk=rows.length>0
      && Math.abs(rows[0].top-FLOAT_TOP)<1
      && rows.every((r,i)=>i===0 || r.top>rows[i-1].top)
      && rows.every(r=>r.wins[0] && Math.abs(r.wins[0].left-FLOAT_LEFT)<1)
      && rowGaps.every(g=>Math.abs(g-FLOAT_GAP)<=1);
    const searchWin=document.getElementById('fwSearch');
    add('搜尋輸入列整合在按需顯示工具窗且檔案編輯檢視改走右鍵', !!(searchWin && searchWin.querySelector('#searchBar') && searchWin.querySelector('#searchWrap') && !searchWin.classList.contains('search-open') && !document.getElementById('btnSearch') && !document.getElementById('fwFile') && !document.getElementById('fwEdit') && !document.getElementById('fwView')), '');
    add('常駐工具窗只保留上方品牌資訊', rowWins.length===1 && rowWins[0].id==='fwBrand' && rowLayoutOk, rows.map(r=>r.wins.map(w=>`${w.id}:${w.left},${w.top},w${w.width}`).join(' | ')).join(' / ')+' gaps='+rowGaps.join(','));
    fwPos=savedFwPos;
    placeFloatWins();
    const sampleFloatWin=document.getElementById('fwSearch')||floatWins[0];
    const clamped=sampleFloatWin&&clampFloatWinPosition(sampleFloatWin,{left:999999,top:999999});
    add('浮動工具窗舊座標會拉回畫面內', !!clamped && clamped.left<=Math.max(0, window.innerWidth-46) && clamped.top<=Math.max(0, window.innerHeight-28), clamped?JSON.stringify(clamped):'missing');
    add('命令面板 DOM 存在', !!(cmdPaletteEl && cmdInputEl && cmdListEl), '');
    add('自檢報告面板 DOM 存在', !!(selfTestReportEl && selfTestSummaryEl && selfTestBodyEl && selfTestExpandEl && selfTestCollapseEl), '');
    runCommandSearch();
    cmdInputEl.value='pdf'; renderCommandPalette();
    add('命令搜尋可過濾', cmdMatches.some(c=>c.label==='匯出 PDF'), cmdMatches.map(c=>c.label).join(','));
    closeCommandPalette();
    add('命令面板可關閉', !cmdPaletteEl.classList.contains('show'), cmdPaletteEl.className);
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `命令面板自檢通過:${result.passed}/${checks.length}` : `命令面板自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    logCaught(e,'command palette self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'命令面板自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('命令面板自檢執行失敗');
    return result;
  }finally{
    closeCommandPalette();
  }
}
window.runMindMapInteractionSelfTest=runInteractionSelfTest;
window.runCommandPaletteSelfTest=runCommandPaletteSelfTest;
function runContextMenuAccessibilitySelfTest(options={}){
  const checks=[]; const add=(name, ok, detail='')=>checks.push({name, ok:!!ok, detail:String(detail||'')});
  const savedRoots=roots, savedSelectedId=selected&&selected.id, savedSelectionIds=[...selection].map(n=>n.id);
  try{
    roots=parseMarkdown('# 右鍵選單自檢\n- 節點\n');
    roots.forEach(r=>setParents(r,null));
    selected=roots[0]; selection=new Set([selected]);
    render();
    const dom=canvas.querySelector('.node');
    if(dom){
      dom.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:160,clientY:160}));
      add('右鍵選單本體使用 menu role', ctxEl.getAttribute('role')==='menu' && !!ctxEl.getAttribute('aria-label'), `${ctxEl.getAttribute('role')}/${ctxEl.getAttribute('aria-label')}`);
      const items=[...ctxEl.querySelectorAll(':scope > button')];
      add('右鍵選單項目使用 menuitem role', items.length>0 && items.every(b=>b.getAttribute('role')==='menuitem'), String(items.length));
      const subOwner=items.find(b=>b.getAttribute('aria-haspopup')==='menu');
      add('有子選單的項目標示 haspopup 與 expanded', !!subOwner && subOwner.getAttribute('aria-expanded')==='false', subOwner&&subOwner.textContent);
      if(subOwner){
        subOwner.focus();
        subOwner.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
        const sub=ctxSubs[ctxSubs.length-1];
        add('方向鍵可開啟子選單並更新 expanded', !!sub && sub.getAttribute('role')==='menu' && subOwner.getAttribute('aria-expanded')==='true', `${!!sub}/${subOwner.getAttribute('aria-expanded')}`);
        const focusedInSub=!!(sub && sub.contains(document.activeElement));
        add('開啟子選單後焦點進入子選單', focusedInSub, document.activeElement&&document.activeElement.textContent);
        if(sub){
          sub.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
          add('左方向鍵可關閉子選單並回到父項', ctxSubs.length===0 && subOwner.getAttribute('aria-expanded')==='false' && document.activeElement===subOwner, `${ctxSubs.length}/${subOwner.getAttribute('aria-expanded')}`);
        }
      }
      ctxEl.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      add('Esc 可關閉右鍵選單', ctxEl.style.display==='none', ctxEl.style.display);
    } else {
      add('右鍵選單測試節點存在', false, 'missing node');
    }
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `右鍵選單自檢通過:${result.passed}/${checks.length}` : `右鍵選單自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    logCaught(e,'context menu accessibility self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'右鍵選單自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('右鍵選單自檢執行失敗');
    return result;
  }finally{
    hideCtx();
    roots=savedRoots;
    roots.forEach(r=>setParents(r,null));
    selection=new Set();
    savedSelectionIds.forEach(id=>{ const n=findByIdAll(id); if(n) selection.add(n); });
    selected=savedSelectedId ? findByIdAll(savedSelectedId) : null;
    if(!selected && selection.size) selected=[...selection][0];
    try{ render(); applyTransform(); }catch(e){ logCaught(e,'restore after context menu self test'); }
  }
}
window.runContextMenuAccessibilitySelfTest=runContextMenuAccessibilitySelfTest;
function runSearchExperienceSelfTest(options={}){
  const checks=[]; const add=(name, ok, detail='')=>checks.push({name, ok:!!ok, detail:String(detail||'')});
  const savedRoots=roots, savedSelectedId=selected&&selected.id, savedSelectionIds=[...selection].map(n=>n.id);
  const savedScale=scale, savedPanX=panX, savedPanY=panY;
  const oldSearchValue=searchInput.value;
  const searchWin=document.getElementById('fwSearch');
  const searchWasOpen=searchWin.classList.contains('search-open');
  try{
    setSearchWindowOpen(false);
    add('搜尋工具平常完全隱藏', getComputedStyle(searchWin).display==='none', getComputedStyle(searchWin).display);
    roots=parseMarkdown('# 搜尋自檢中心\n- Alpha 主要節點\n  - Alpha 子節點\n- Beta 節點\n');
    roots.forEach(r=>setParents(r,null));
    selected=roots[0]; selection=new Set([selected]);
    render();
    searchInput.value='Alpha';
    openSearch();
    runSearch('Alpha', false);
    add('搜尋列整合在搜尋工具窗並會開啟結果清單', searchWin.contains(searchBar) && searchWin.classList.contains('search-open') && getComputedStyle(searchWin).display!=='none' && searchBar.classList.contains('show') && searchWrap.classList.contains('show'), `${getComputedStyle(searchWin).display}/${searchWin.className}/${searchBar.className}/${searchWrap.className}`);
    add('搜尋可找到多個節點', searchMatches.length===2 && searchCount.textContent==='1/2', `${searchMatches.length}/${searchCount.textContent}`);
    add('搜尋結果清單列出命中節點', searchList.querySelectorAll('.searchItem').length===2 && /找到 2 個結果/.test(searchHint.textContent||''), searchHint.textContent);
    const second=searchList.querySelector('.searchItem[data-index="1"]');
    second&&second.click();
    add('點擊搜尋結果會選取並跳到該節點', !!(selected && selected.title==='Alpha 子節點' && currentMatchId===selected.id), selected&&selected.title);
    searchInput.value='不存在的字';
    runSearch(searchInput.value, false);
    add('無結果時有清楚提示', searchMatches.length===0 && /找不到/.test(searchHint.textContent||'') && !!searchList.querySelector('.searchEmpty'), searchHint.textContent);
    closeSearch();
    add('關閉搜尋會清除狀態並隱藏整個工具窗', !searchWin.classList.contains('search-open') && getComputedStyle(searchWin).display==='none' && !searchBar.classList.contains('show') && !searchWrap.classList.contains('show') && searchInput.value==='', `${getComputedStyle(searchWin).display}/${searchWin.className}/${searchBar.className}/${searchWrap.className}/${searchInput.value}`);
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `搜尋體驗自檢通過:${result.passed}/${checks.length}` : `搜尋體驗自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    logCaught(e,'search experience self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'搜尋體驗自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('搜尋體驗自檢執行失敗');
    return result;
  }finally{
    closeSearch();
    searchInput.value=oldSearchValue;
    setSearchWindowOpen(searchWasOpen);
    if(searchWasOpen){ searchBar.classList.add('show'); searchWrap.classList.add('show'); }
    else { searchBar.classList.remove('show'); searchWrap.classList.remove('show'); }
    roots=savedRoots;
    scale=savedScale; panX=savedPanX; panY=savedPanY;
    roots.forEach(r=>setParents(r,null));
    selection=new Set();
    savedSelectionIds.forEach(id=>{ const n=findByIdAll(id); if(n) selection.add(n); });
    selected=savedSelectedId ? findByIdAll(savedSelectedId) : null;
    if(!selected && selection.size) selected=[...selection][0];
    try{ if(searchInput.value) runSearch(searchInput.value, false); else clearSearch(); render(); applyTransform(); }catch(e){ logCaught(e,'restore after search experience self test'); }
  }
}
window.runSearchExperienceSelfTest=runSearchExperienceSelfTest;
function runKeyboardAccessibilitySelfTest(options={}){
  const checks=[]; const add=(name, ok, detail='')=>checks.push({name, ok:!!ok, detail:String(detail||'')});
  const savedRoots=roots, savedSelectedId=selected&&selected.id, savedSelectionIds=[...selection].map(n=>n.id);
  const savedReport=lastSelfTestReport, reportWasOpen=!!(selfTestReportEl&&selfTestReportEl.classList.contains('show'));
  try{
    roots=parseMarkdown('# 鍵盤自檢\n- 第一個節點\n- 第二個節點\n');
    roots.forEach(r=>setParents(r,null));
    selected=roots[0]; selection=new Set([selected]);
    render();
    const firstNode=canvas.querySelector('.node');
    add('節點可用鍵盤聚焦', !!firstNode && firstNode.tabIndex===0 && firstNode.getAttribute('role')==='button', firstNode&&firstNode.outerHTML.slice(0,120));
    add('節點提供 aria-label 與選取狀態', !!firstNode && !!firstNode.getAttribute('aria-label') && firstNode.hasAttribute('aria-selected'), firstNode&&firstNode.getAttribute('aria-label'));
    closeCommandPalette();
    runCommandSearch();
    add('命令面板開啟後焦點進入搜尋框', cmdPaletteEl.classList.contains('show') && document.activeElement===cmdInputEl, document.activeElement&&document.activeElement.id);
    const escEvt=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});
    cmdInputEl.dispatchEvent(escEvt);
    add('命令面板支援 Esc 關閉', !cmdPaletteEl.classList.contains('show'), cmdPaletteEl.className);
    let reportActionHit=false;
    const fakeResult={title:'鍵盤報告測試', ok:false, passed:0, failed:1, checks:[{name:'鍵盤報告測試', ok:false, detail:'ok'}], groups:[{name:'鍵盤報告', result:{ok:false, passed:0, failed:1, checks:[{name:'可顯示並可點擊', ok:false, detail:'ok', action:()=>{ reportActionHit=true; }}]}}]};
    firstNode&&firstNode.focus();
    showSelfTestReport(fakeResult);
    add('自檢報告開啟後焦點進入面板', selfTestReportEl.classList.contains('show') && document.activeElement===selfTestCloseEl, document.activeElement&&document.activeElement.id);
    const clickableReportItem=selfTestBodyEl.querySelector('.report-check.clickable');
    clickableReportItem&&clickableReportItem.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
    add('報告項目支援點擊定位動作', !!clickableReportItem && reportActionHit && selfTestReportEl.querySelector('.report-title').textContent==='鍵盤報告測試', clickableReportItem&&clickableReportItem.textContent);
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    add('自檢報告支援 Esc 關閉並回復焦點', !selfTestReportEl.classList.contains('show') && document.activeElement===firstNode, document.activeElement&&document.activeElement.className);
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `鍵盤操作自檢通過:${result.passed}/${checks.length}` : `鍵盤操作自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    logCaught(e,'keyboard accessibility self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'鍵盤操作自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('鍵盤操作自檢執行失敗');
    return result;
  }finally{
    lastSelfTestReport=savedReport;
    if(reportWasOpen && savedReport) showSelfTestReport(savedReport); else closeSelfTestReport();
    roots=savedRoots;
    roots.forEach(r=>setParents(r,null));
    selection=new Set();
    savedSelectionIds.forEach(id=>{ const n=findByIdAll(id); if(n) selection.add(n); });
    selected=savedSelectedId ? findByIdAll(savedSelectedId) : null;
    if(!selected && selection.size) selected=[...selection][0];
    try{ render(); applyTransform(); }catch(e){ logCaught(e,'restore after keyboard self test'); }
  }
}
window.runKeyboardAccessibilitySelfTest=runKeyboardAccessibilitySelfTest;
window.runMindMapFullSelfTest=runMindMapFullSelfTest;

