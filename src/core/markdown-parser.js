//===================== Markdown 解析 =====================
// 回傳「根節點陣列」:每個 H1(# )開啟一個新的中心/根
function parseMarkdown(text){
  mdRefDefs = {};
  const lines = text.replace(/\r/g,'').split('\n');
  const rootsOut = [];
  let cur = null, headingDepth = 0, last = null, stack = [];
  let lastHeading = null;   // 最近一個 heading 節點(供「緊接其下的引言」吸附為 note)
  let noteOpen = false;     // 是否正在連續吸附該 heading 的引言行
  let noteTarget = null, noteTargetIndent = 0; // 一般節點後方縮排引用,可還原成該節點的註解泡泡
  let preambleRoot = null, preambleBlank = false; // 第一個標題前的純文字序言,直接放入最上方中心大泡泡
  let paraNode = null;      // 目前正在累積的純文字段落節點(連續無空行的多行併為一段)
  let listParent = null, listParentDepth = 0;   // 緊接純文字段落(標籤)後的頂格清單,掛為該段落子節點;頂格匯出格式可 round-trip
  let listParentIndent = 0, listParentFromList = false; // 冒號結尾的清單項目也可成為後續同層清單的標籤父節點
  let listParentBlank = false, listParentConsumed = false;
  const labelText = n => String(n&&n.title||'').replace(/\s+$/,'').replace(/[`*_~]+$/,'').replace(/\s+$/,'');
  const isLabelNode = n => /[:：]$/.test(labelText(n));
  function clearListParent(){ listParent=null; listParentDepth=0; listParentIndent=0; listParentFromList=false; listParentBlank=false; listParentConsumed=false; }
  function setListParent(node, depth, indent, fromList){ listParent=node; listParentDepth=depth; listParentIndent=indent||0; listParentFromList=!!fromList; listParentBlank=false; listParentConsumed=false; }
  function clearNoteTarget(){ noteTarget=null; noteTargetIndent=0; }
  function setNoteTarget(node, indent){ noteTarget=node; noteTargetIndent=indent||0; }
  function appendPreamble(text, li){
    if(!preambleRoot){
      preambleRoot=nodeFrom(text); preambleRoot.kind='preamble'; preambleRoot._srcLine=li;
      rootsOut.push(preambleRoot); cur=preambleRoot; stack=[{depth:0,node:preambleRoot}]; last=preambleRoot; headingDepth=0;
    } else {
      preambleRoot.title += (preambleBlank ? '\n\n' : '\n') + text;
    }
    paraNode=preambleRoot; preambleBlank=false; clearNoteTarget(); clearListParent();
  }
  function attachListNode(node, indent){
    let depth;
    if(listParent){
      if(listParentFromList && indent < listParentIndent) clearListParent();
    }
    if(listParent){
      const relIndent = listParentFromList ? Math.max(0, indent - listParentIndent) : indent;
      depth = listParentDepth + 1 + relIndent;
    } else depth = headingDepth + 1 + indent;
    attach(node, depth);
    if(listParent) listParentConsumed=true;
    if(isLabelNode(node)){
      setListParent(node, depth, indent, true);
    }
  }
  function ensureRoot(){ if(!cur){ cur = makeNode('心智圖'); rootsOut.push(cur); stack=[{depth:0,node:cur}]; last=cur; headingDepth=0; } }
  function nextMeaningfulLine(fromLine){
    for(let j=fromLine+1; j<lines.length; j++){
      const s=lines[j].trim();
      if(!s) continue;
      return {index:j, text:s};
    }
    return null;
  }
  function headingVisualDepth(lineText){
    const h=String(lineText||'').match(/^(#{1,6})\s+/);
    return h ? Math.max(0, h[1].length-1) : null;
  }
  function classifyHorizontalRule(fromLine){
    const next=nextMeaningfulLine(fromLine);
    const nextDepth=next ? headingVisualDepth(next.text) : null;
    if(nextDepth!=null){
      return {
        kind:'section',
        depth:nextDepth,
        reason:'下一個非空行是標題,分隔線視為下一章節的同層章節分隔'
      };
    }
    if(last && last.kind==='hr'){
      return {
        kind:'same-level',
        depth:(stack.length?stack[stack.length-1].depth:headingDepth+1),
        reason:'連續分隔線維持同層,避免往下長成子節點'
      };
    }
    return {
      kind:'inline',
      depth:headingDepth + 1,
      reason:'段落或清單後的分隔線,維持在目前標題內容層'
    };
  }
  function attach(node, depth){
    while(stack.length && stack[stack.length-1].depth >= depth) stack.pop();
    const parent = stack.length ? stack[stack.length-1].node : cur;
    if(parent) parent.children.push(node);
    stack.push({depth, node}); last = node;
  }
  function isPlainSetextLine(line){
    if(!line.trim()) return false;
    if(/^\s{4,}|\t/.test(line)) return false;
    return !/^(#{1,6})\s+/.test(line) &&
      !/^\s*\d+[.)]\s+/.test(line) &&
      !/^\s*[-*+]\s+/.test(line) &&
      !/^\s*>/.test(line) &&
      !parseRefDefLine(line) &&
      !/^\s*\[\^([^\]]+)\]:\s+/.test(line) &&
      !/^\s*(`{3,}|~{3,})/.test(line);
  }
  for(let li=0; li<lines.length; li++){
    const line=lines[li];
    if(line.trim()===''){ if(preambleRoot && cur===preambleRoot) preambleBlank=true; paraNode=null; clearNoteTarget();
      if(listParent && isLabelNode(listParent) && !listParentConsumed && !listParentBlank) listParentBlank=true;
      else clearListParent();
      if(lastHeading && lastHeading.note==null && noteOpen){ /* 標題與引言間允許一個空行 */ } else { noteOpen=false; } continue; }
    // 圍籬程式碼區塊(```lang ... ``` 或 ~~~):整塊原樣收成單一程式碼節點
    const fo = line.match(/^(\s*)(`{3,}|~{3,})([^`~]*)$/);
    if(fo){
      noteOpen=false; paraNode=null; clearListParent(); clearNoteTarget();
      const close = fo[2][0]==='`' ? /^\s*`{3,}\s*$/ : /^\s*~{3,}\s*$/;
      const codeLines=[]; let j=li+1;
      for(; j<lines.length; j++){ if(close.test(lines[j])) break; codeLines.push(lines[j]); }
      ensureRoot(); if(cur._srcLine==null) cur._srcLine=li;
      const nd=makeNode(''); nd.code=codeLines.join('\n'); nd.lang=(fo[3]||'').trim(); nd._srcLine=li;
      const depth=(stack.length?stack[stack.length-1].depth:0)+1;
      attach(nd, depth); stack.pop();
      last = stack.length ? stack[stack.length-1].node : cur;
      li=j; continue;
    }
    // HTML 區塊:保留原文;畫面預設純文字,可切換成白名單安全顯示。
    if(isHtmlBlockStart(line)){
      noteOpen=false; paraNode=null; clearListParent(); clearNoteTarget(); ensureRoot(); if(cur._srcLine==null) cur._srcLine=li;
      const hlines=[line]; const tag=htmlBlockTag(line); let j=li+1;
      if(/^\s{0,3}<!--/.test(line)){
        for(; j<lines.length; j++){ hlines.push(lines[j]); if(/-->/.test(lines[j])){ j++; break; } }
      } else if(tag && !new RegExp('</'+tag+'\\s*>','i').test(line) && !/\/>\s*$/.test(line)){
        const closeRe=new RegExp('</'+tag+'\\s*>','i');
        for(; j<lines.length; j++){ if(lines[j].trim()==='') break; hlines.push(lines[j]); if(closeRe.test(lines[j])){ j++; break; } }
      } else {
        for(; j<lines.length; j++){ if(lines[j].trim()==='') break; if(!isHtmlBlockStart(lines[j])) break; hlines.push(lines[j]); }
      }
      const nd=makeNode('HTML 區塊'); nd.kind='html'; nd.htmlRaw=hlines.join('\n'); nd.code=nd.htmlRaw; nd.lang='html'; nd._srcLine=li;
      const depth=(stack.length?stack[stack.length-1].depth:0)+1;
      attach(nd, depth); stack.pop(); last = stack.length ? stack[stack.length-1].node : cur;
      li=j-1; continue;
    }
    // Setext 標題:標題文字下一行 === / ---。=== 視為 H1, --- 視為 H2。
    const sxNext = (li+1<lines.length) ? lines[li+1].match(/^\s*(=+|-+)\s*$/) : null;
    if(sxNext && isPlainSetextLine(line)){
      paraNode=null; clearListParent(); clearNoteTarget();
      const depth = sxNext[1][0]==='=' ? 0 : 1;
      if(depth===0){ cur = nodeFrom(line.trim()); cur._srcLine=li; cur.kind='h'; cur.hlevel=1; rootsOut.push(cur); stack=[{depth:0,node:cur}]; last=cur; headingDepth=0; lastHeading=cur; }
      else { ensureRoot(); if(cur._srcLine==null) cur._srcLine=li; headingDepth=depth; const nd=nodeFrom(line.trim()); nd._srcLine=li; nd.kind='h'; nd.hlevel=2; attach(nd, depth); lastHeading=nd; }
      noteOpen=true; li++; continue;
    }
    // 水平分隔線(--- *** ___):視為可見分隔節點,匯出時保留原生語法。
    // 規則:
    //   section    = 下一個非空行是標題,分隔線放到下一章節同層(例如 ### 後接 --- 再接 ##)。
    //   same-level = 連續分隔線維持同層,避免被當成前一條分隔線的子節點。
    //   inline     = 一般段落/清單內容中的分隔線,維持在目前標題內容層。
    if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){
      noteOpen=false; paraNode=null; clearListParent(); clearNoteTarget(); ensureRoot(); if(cur._srcLine==null) cur._srcLine=li;
      const nd=makeNode(line.trim().replace(/\s+/g,' ')); nd.kind='hr'; nd._srcLine=li;
      const hrRule=classifyHorizontalRule(li);
      nd.hrRule=hrRule.kind; nd.hrReason=hrRule.reason;
      if(hrRule.depth===0){
        rootsOut.push(nd);
        cur=nd; stack=[]; last=nd;
        continue;
      }
      attach(nd, hrRule.depth);
      stack.pop(); last = stack.length ? stack[stack.length-1].node : cur; continue;
    }
    // 表格區塊:標題列 + 對齊分隔列(| --- | :--: |),整塊收成單一表格節點
    if(line.indexOf('|')>=0 && li+1<lines.length && isTableDelimRow(lines[li+1]) && splitTableRow(line).length===splitTableRow(lines[li+1]).length){
      noteOpen=false; paraNode=null; clearListParent(); clearNoteTarget();
      ensureRoot(); if(cur._srcLine==null) cur._srcLine=li;
      const tHeader=splitTableRow(line), tAligns=parseTableAligns(lines[li+1]);
      const tRows=[]; let j=li+2;
      for(; j<lines.length; j++){ const L=lines[j]; if(L.trim()==='' || L.indexOf('|')<0) break; const cells=splitTableRow(L); if(cells.length!==tHeader.length) break; tRows.push(cells); }
      const nd=makeNode(''); nd.table={header:tHeader,aligns:tAligns,rows:tRows}; nd._srcLine=li;
      const depth=(stack.length?stack[stack.length-1].depth:0)+1;
      attach(nd, depth);
      stack.pop();                                   // 表格不作為後續節點的父層
      last = stack.length ? stack[stack.length-1].node : cur;
      li=j-1; continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if(h){
      paraNode=null; clearListParent();
      const depth = h[1].length - 1;
      if(depth===0){ cur = nodeFrom(h[2].trim()); cur._srcLine=li; cur.kind='h'; cur.hlevel=1; rootsOut.push(cur); stack=[{depth:0,node:cur}]; last=cur; headingDepth=0; lastHeading=cur; clearNoteTarget(); }
      else { ensureRoot(); if(cur._srcLine==null) cur._srcLine=li; headingDepth = depth; const nd=nodeFrom(h[2].trim()); nd._srcLine=li; nd.kind='h'; nd.hlevel=depth+1; attach(nd, depth); lastHeading=nd; clearNoteTarget(); }
      noteOpen = true;   // 緊接此標題下方的引言塊,將吸附為此標題的 note
      continue;
    }
    // 有序清單 1. / 1)
    const ol = line.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
    if(ol){ noteOpen=false; paraNode=null; ensureRoot(); if(cur._srcLine==null) cur._srcLine=li; const indent=Math.floor(ol[1].replace(/\t/g,'  ').length/2);
      const nd=nodeFrom(ol[4]); nd.ordered=true; nd.orderedNum=parseInt(ol[2],10); nd.orderedMarker=ol[3]; nd._srcLine=li; attachListNode(nd, indent); setNoteTarget(nd, indent); continue; }
    // 無序清單 - * +
    const b = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if(b){ noteOpen=false; paraNode=null; ensureRoot(); if(cur._srcLine==null) cur._srcLine=li; const indent=Math.floor(b[1].replace(/\t/g,'  ').length/2);
      const nd=nodeFrom(b[2]); nd.kind='ul'; nd._srcLine=li; attachListNode(nd, indent); setNoteTarget(nd, indent); continue; }
    // 官方 Markdown 縮排程式碼區塊:4 個空白或 1 個 tab 起頭,連續區塊收成單一 code node
    if(/^(?: {4}|\t)/.test(line)){
      noteOpen=false; paraNode=null; clearListParent(); clearNoteTarget(); ensureRoot(); if(cur._srcLine==null) cur._srcLine=li;
      const codeLines=[]; let j=li;
      for(; j<lines.length; j++){
        if(lines[j].trim()===''){ codeLines.push(''); continue; }
        const cm=lines[j].match(/^(?: {4}|\t)(.*)$/); if(!cm) break;
        codeLines.push(cm[1]);
      }
      while(codeLines.length && codeLines[codeLines.length-1]==='') codeLines.pop();
      const nd=makeNode(''); nd.code=codeLines.join('\n'); nd.codeFence=false; nd._srcLine=li;
      const depth=(stack.length?stack[stack.length-1].depth:0)+1;
      attach(nd, depth); stack.pop(); last = stack.length ? stack[stack.length-1].node : cur;
      li=j-1; continue;
    }
    // GFM 警示框 > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
    const al = line.match(/^(\s*)>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
    if(al){ noteOpen=false; paraNode=null; clearListParent(); clearNoteTarget(); ensureRoot(); if(cur._srcLine==null) cur._srcLine=li;
      const indent=Math.floor(al[1].replace(/\t/g,'  ').length/2);
      const albody=[]; let j=li+1;
      for(; j<lines.length; j++){
        if(/^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.test(lines[j])) break; // 下一個警示框開始 → 停,讓它各自獨立
        const qm=lines[j].match(/^\s*>\s?(.*)$/); if(!qm) break; albody.push(qm[1]);
      }
      const nd=makeNode(albody.join('\n').replace(/\n+$/,'')); nd.alert=al[2].toUpperCase(); nd.kind='alert'; nd._srcLine=li;
      attach(nd, headingDepth + 1 + indent); stack.pop();
      last = stack.length ? stack[stack.length-1].node : cur;
      li=j-1; continue; }
    // 引用塊 >
      const q = line.match(/^(\s*)>\s?(.*)$/);
    if(q){
      paraNode=null; clearListParent();
      // 緊接在 heading 下方(其後尚未出現其他內容)的引言 → 吸附為該 heading 的 note(標題泡泡內註解)
      if(noteOpen && lastHeading && lastHeading.children.length===0){
        const piece = q[2].replace(/\s+$/,'');
        lastHeading.note = (lastHeading.note ? lastHeading.note + '\n' : '') + piece;
        if(lastHeading._noteLine==null) lastHeading._noteLine=li;
        continue;
      }
      const qIndent=Math.floor(q[1].replace(/\t/g,'  ').length/2);
      if(noteTarget && qIndent > noteTargetIndent){
        const qbody=[q[2].replace(/\s+$/,'')]; let j=li+1;
        for(; j<lines.length; j++){
          if(/^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.test(lines[j])) break;
          const m=lines[j].match(/^(\s*)>\s?(.*)$/); if(!m) break;
          const mi=Math.floor(m[1].replace(/\t/g,'  ').length/2); if(mi < qIndent) break;
          qbody.push(m[2].replace(/\s+$/,''));
        }
        noteTarget.note = (noteTarget.note ? noteTarget.note + '\n' : '') + qbody.join('\n');
        if(noteTarget._noteLine==null) noteTarget._noteLine=li;
        li=j-1; clearNoteTarget(); continue;
      }
      ensureRoot(); if(cur._srcLine==null) cur._srcLine=li; const indent=Math.floor(q[1].replace(/\t/g,'  ').length/2);
      // 連續(無空行)的普通 > 視為同一個引用塊,併成一個節點(忠於 Markdown blockquote 語意)
      const qbody=[q[2].replace(/\s+$/,'')], qraw=[line]; let j=li+1;
      for(; j<lines.length; j++){
        if(/^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.test(lines[j])) break; // 警示框另計
        const m=lines[j].match(/^(\s*)>\s?(.*)$/); if(!m) break;
        qraw.push(lines[j]);
        qbody.push(m[2].replace(/\s+$/,''));
      }
      const nd=nodeFrom(qbody.join('\n')); nd.quote=true; nd.quoteRaw=qraw.join('\n'); nd._srcLine=li; attach(nd, headingDepth + 1 + indent); clearNoteTarget();
      li=j-1; continue; }
    // 腳註定義 [^id]: 內容(留在原位,成為腳註定義節點)
    const fd = line.match(/^(\s*)\[\^([^\]]+)\]:\s+(.*)$/);
    if(fd){ noteOpen=false; paraNode=null; clearListParent(); clearNoteTarget(); ensureRoot(); if(cur._srcLine==null) cur._srcLine=li; const indent=Math.floor(fd[1].replace(/\t/g,'  ').length/2);
      const fbody=[fd[3]]; let j=li+1;
      for(; j<lines.length; j++){
        if(lines[j].trim()===''){ fbody.push(''); continue; }
        const fm=lines[j].match(/^(?: {4}|\t)(.*)$/);
        if(!fm) break;
        fbody.push(fm[1]);
      }
      while(fbody.length && fbody[fbody.length-1]==='') fbody.pop();
      const nd=nodeFrom(fbody.join('\n')); nd.fndef=true; nd.fnid=fd[2]; nd.kind='fndef'; nd._srcLine=li; attach(nd, headingDepth + 1 + indent); li=j-1; continue; }
    // 參考式連結/圖片定義: [id]: https://... "optional title"
    const rd = parseRefDefLine(line);
    if(rd){ noteOpen=false; paraNode=null; clearListParent(); clearNoteTarget(); ensureRoot(); if(cur._srcLine==null) cur._srcLine=li;
      mdRefDefs[rd.key]=rd;
      const nd=makeNode(rd.raw); nd.kind='refdef'; nd.refdef=rd; nd._srcLine=li; attach(nd, headingDepth + 1); stack.pop();
      last = stack.length ? stack[stack.length-1].node : cur; continue; }
    // 清單延續段落:縮排文字接在清單項目後時,保留為同一個 list item 的後續內容。
    const cont = line.match(/^(\s+)(\S.*)$/);
    if(noteTarget && (noteTarget.kind==='ul' || noteTarget.ordered) && cont){
      const contIndent=Math.floor(cont[1].replace(/\t/g,'  ').length/2);
      if(contIndent>noteTargetIndent){
        noteTarget.title += '\n' + cont[2].replace(/\s+$/,'');
        paraNode=null; noteOpen=false;
        continue;
      }
    }
    // 純文字段落:獨立成段落節點(忠於 Markdown「段落是獨立區塊」、保留原始順序);連續無空行的多行併為同一段
    noteOpen=false;
    if((!cur || cur===preambleRoot) && (!rootsOut.length || preambleRoot)){
      appendPreamble(line.trim(), li);
      continue;
    }
    if(paraNode){ paraNode.title += '\n' + line.trim(); }
    else { ensureRoot(); if(cur._srcLine==null) cur._srcLine=li;
      const nd=nodeFrom(line.trim()); nd.kind='p'; nd._srcLine=li; attach(nd, headingDepth + 1); paraNode=nd; setNoteTarget(nd, 0);
      setListParent(nd, headingDepth + 1, 0, false); }   // 此段落可成為緊接其後頂格清單的父節點
  }
  if(!rootsOut.length) rootsOut.push(makeNode('心智圖'));
  rootsOut.forEach(r=>setParents(r, null));
  return rootsOut;
}

