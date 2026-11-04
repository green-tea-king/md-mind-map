//===================== 右側原始 Markdown 面板(雙向同步) =====================
const MD_LH=22, MD_PAD=12;
const mdTextEl=document.getElementById('mdText');
const mdHiEl=document.getElementById('mdHi');
const mdInfoEl=document.getElementById('mdInfo');
let mdPanelOpen=false;
let mdTextDriven=false;
let mdLineToId=[];
let mdIdToLine={};
let mdActiveBlock=null;
let mdInputTimer=null;
let mdTyping=false;
function buildMdRows(rootsArr){
  if(!Array.isArray(rootsArr)) rootsArr=[rootsArr];
  const out=[]; const HEADING_LIMIT=2;
  const box=node=>node.checked===undefined?'':(node.checked?'[x] ':'[ ] ');
  const push=(t,id)=>out.push({t,id:id||null});
  function emit(node, prefix, cont){
    const ls=(node.title||'').split('\n'); const ic=node.icon?node.icon+' ':'';
    push(prefix+box(node)+ic+ls[0], node.id);
    for(let i=1;i<ls.length;i++) push(cont+ls[i], node.id);
  }
  function emitNote(node, prefix){
    if(node.note==null || String(node.note)==='') return;
    const pre=prefix||'';
    for(const ql of String(node.note).split('\n')) push(pre+'> '+ql, node.id);   // 緊接節點輸出,不插空行(空行會中斷吸附)
  }
  function bullet(node, indent){
    if(node.alert){ const ind='  '.repeat(indent); push(ind+'> [!'+node.alert+']', node.id);
      for(const _l of String(node.title||'').split('\n')) push(ind+'> '+_l, node.id);
      for(const c of node.children) bullet(c, indent+1); return; }
    if(node.fndef){ const ind='  '.repeat(indent); emit(node, ind+'[^'+node.fnid+']: ', ind+'  '); for(const c of node.children) bullet(c, indent+1); return; }
    if(node.refdef){ push(node.refdef.raw || node.title || ('['+node.refdef.id+']: '+node.refdef.url), node.id); for(const c of node.children) bullet(c, indent); return; }
    if(node.kind==='hr'){ push(node.title || '---', node.id); for(const c of node.children) bullet(c, indent); return; }
    if(node.table){ for(const _t of tableToMdRows(node.table)) push(_t, node.id); for(const c of node.children) bullet(c, indent); return; }
    if(node.kind==='html'){ for(const _l of String(node.htmlRaw||node.code||'').split('\n')) push(_l, node.id); for(const c of node.children) bullet(c, indent); return; }
    if(node.code!=null){
      if(node.codeFence===false){ for(const _l of node.code.split('\n')) push('    '+_l, node.id); }
      else { push('```'+(node.lang||''), node.id); for(const _l of node.code.split('\n')) push(_l, node.id); push('```', node.id); }
      for(const c of node.children) bullet(c, indent); return;
    }
    const ind='  '.repeat(indent); let marker;
    if(node.quote){
      if(node.quoteRaw){ for(const _l of String(node.quoteRaw).split('\n')) push(ind+_l, node.id); }
      else for(const _l of String(node.title||'').split('\n')) push(ind+'> '+_l, node.id);
      for(const c of node.children) bullet(c, indent+1); return; }
    else if(node.ordered){ const i=(node.orderedNum!=null?node.orderedNum:(node.parent?node.parent.children.indexOf(node):0)+1); marker=i+(node.orderedMarker||'.')+' '; }
    else marker='- ';
    emit(node, ind+marker, ind+'  ');
    emitNote(node, ind+'  ');
    for(const c of node.children) bullet(c, indent+1);
  }
  function rec(node, depth){
    // 忠實還原:節點若明確來自某種來源類型,就照原樣輸出
    if(node.kind==='h'){                     // 明確是標題 → 依目前樹狀深度輸出 # 層級,避免重組後沿用舊 hlevel 壓平
      const lvl=Math.min(6, Math.max(2, depth+2));
      emit(node, '#'.repeat(lvl)+' ', '');
      emitNote(node);
      const childDepth=depth+1;
      const hasHeadingSibling=node.children.some(c=>c.kind==='h');
      for(const c of node.children){
        // 同一父節點下若已有標題子節點,其他一般清單節點也是同層資料；
        // 直接輸出成同級標題,避免 `### A` 後接 `- B` 被重新解析成 A 的子節點。
        if(hasHeadingSibling && c.kind==='ul'){
          const clvl=Math.min(6, Math.max(2, childDepth+2));
          emit(c, '#'.repeat(clvl)+' ', '');
          emitNote(c);
          for(const gc of c.children) rec(gc, childDepth+1);
        } else rec(c, childDepth);
      }
      return;
    }
    if(node.kind==='p'){                      // 純文字段落 → 原樣輸出(無標記),保留原始順序
      emit(node, '', '');
      emitNote(node, '  ');
      for(const c of node.children) rec(c, depth+1);
      return;
    }
    if(node.kind==='ul' || node.ordered || node.quote || node.table || node.code!=null || node.fndef || node.alert || node.refdef || node.kind==='hr' || node.kind==='html'){
      bullet(node, 0);                        // 明確是清單/引用/表格/程式碼/腳註定義/警示框 → 維持原形式(含巢狀)
      return;
    }
    // 無來源標記(編輯器新建節點):沿用原本的啟發式——淺層有子節點者視為標題
    if(depth<=HEADING_LIMIT && node.children.length){
      emit(node, '#'.repeat(depth+2)+' ', '');
      emitNote(node);
      for(const c of node.children) rec(c, depth+1);
    } else bullet(node, 0);
  }
  for(const rootN of rootsArr){
    if(rootN.kind==='preamble'){
      emit(rootN, '', '');
      emitNote(rootN, '  ');
      push('', null);
      for(const c of rootN.children) rec(c, 0);
      push('', null);
      continue;
    }
    emit(rootN, '# ', ''); emitNote(rootN); push('', null);
    for(const c of rootN.children) rec(c, 0);
    push('', null);
  }
  const rows=[];
  for(const r of out){ if(r.t==='' && rows.length && rows[rows.length-1].t==='') continue; rows.push(r); }
  while(rows.length && rows[rows.length-1].t==='') rows.pop();
  return rows;
}
function lineAt(pos){ return mdTextEl.value.slice(0,pos).split('\n').length-1; }
function rebuildLineMapFromRows(rows){
  mdLineToId=rows.map(r=>r.id); mdIdToLine={};
  rows.forEach((r,i)=>{ if(r.id!=null && mdIdToLine[r.id]==null) mdIdToLine[r.id]=i; });
}
function rebuildLineMapFromRoots(){
  const n=mdTextEl.value.split('\n').length;
  mdLineToId=new Array(n).fill(null); mdIdToLine={};
  (function walk(arr){ for(const nd of arr){ if(nd._srcLine!=null && nd._srcLine<n){
    if(mdLineToId[nd._srcLine]==null) mdLineToId[nd._srcLine]=nd.id;
    if(mdIdToLine[nd.id]==null) mdIdToLine[nd.id]=nd._srcLine; } walk(nd.children); } })(roots);
}
function setMdInfo(parts, level, issue){
  if(!mdInfoEl) return;
  mdInfoEl.classList.toggle('warn', level==='warn');
  mdInfoEl.classList.toggle('error', level==='error');
  mdInfoEl.classList.toggle('jump', !!(issue && issue.line));
  if(issue && issue.line){
    mdInfoEl.dataset.line=String(issue.line);
    mdInfoEl.title='點一下跳到第 '+issue.line+' 行';
  } else {
    delete mdInfoEl.dataset.line;
    mdInfoEl.removeAttribute('title');
  }
  clearTrustedHTML(mdInfoEl);
  for(const part of parts.filter(Boolean)){
    const sp=document.createElement('span');
    sp.textContent=part;
    mdInfoEl.appendChild(sp);
  }
}
function updateMdInfo(panelText, nodeCount, perf){
  const diag=analyzeMarkdownPanelText(panelText);
  if(diag.issues.length){
    const top=diag.issues[0];
    setMdInfo([top.level==='error'?'Markdown 需要檢查':'Markdown 提醒', `第 ${top.line} 行`, top.message, diag.issues.length>1?`另有 ${diag.issues.length-1} 項`:'' ], top.level, top);
    return diag;
  }
  const label=markdownPerformanceLabel(perf);
  setMdInfo(['雙向同步', `${mdLineToId.length} 行`, `${nodeCount} 節點`, label], '');
  return diag;
}
function focusMdLine(lineNumber){
  const line=Math.max(0, Number(lineNumber||1)-1);
  const lines=mdTextEl.value.split('\n');
  let pos=0;
  for(let i=0;i<line && i<lines.length;i++) pos+=lines[i].length+1;
  const end=pos+(lines[line]||'').length;
  mdTextEl.focus();
  mdTextEl.setSelectionRange(pos,end);
  scrollMdLineIntoView(line);
  setActiveMdLine(line);
  showToast('已跳到第 '+(line+1)+' 行');
}
function goToMdInfoLine(){
  if(!mdInfoEl || !mdInfoEl.dataset.line) return;
  focusMdLine(parseInt(mdInfoEl.dataset.line,10));
}
function refreshMdPanel(fromText){
  if(!mdPanelOpen) return;
  if(mdInputTimer) return;   // 使用者仍在輸入時不回寫 textarea,避免舊計時器完成前文字被其他 render 覆蓋
  let panelText=mdTextEl.value;
  if(fromText){ rebuildLineMapFromRoots(); }
  else {
    const rows=buildMdRows(roots); rebuildLineMapFromRows(rows);
    const text=rows.map(r=>r.t).join('\n')+'\n';
    if(mdTextEl.value!==text) mdTextEl.value=text;
    panelText=text;
  }
  if(document.activeElement!==mdTextEl){ if(selected) highlightMdNode(selected); else setActiveMdLine(null); }
  if(mdInfoEl){
    const c=roots.reduce((s,r)=>s+countNodes(r),0);
    const stats=markdownPerfStats(panelText);
    const perf=updateMarkdownPerformance(stats, c, lastMarkdownPerformance.parseMs, lastMarkdownPerformance.renderMs, markdownCommitDelay(panelText));
    updateMdInfo(panelText, c, perf);
  }
}
function setActiveMdLine(line){
  if(line==null || line<0){ mdHiEl.style.display='none'; mdActiveBlock=null; return; }
  let a=line,b=line; const id=mdLineToId[line];
  if(id!=null){ while(a-1>=0 && mdLineToId[a-1]===id) a--; while(b+1<mdLineToId.length && mdLineToId[b+1]===id) b++; }
  mdActiveBlock={a,b}; mdHiEl.style.display='block';
  mdHiEl.style.top=(MD_PAD + a*MD_LH - mdTextEl.scrollTop)+'px';
  mdHiEl.style.height=((b-a+1)*MD_LH)+'px';
}
function scrollMdLineIntoView(line){
  const top=line*MD_LH, vh=mdTextEl.clientHeight, st=mdTextEl.scrollTop;
  if(top < st) mdTextEl.scrollTop=top;
  else if(top+MD_LH > st+vh-MD_PAD*2) mdTextEl.scrollTop=top+MD_LH-vh+MD_PAD*2;
}
function highlightMdNode(node){
  if(!mdPanelOpen||!node) return;
  const ln=mdIdToLine[node.id];
  if(ln==null){ setActiveMdLine(null); return; }
  setActiveMdLine(ln); scrollMdLineIntoView(ln);
}
function syncMapToMdCursor(doCenter){
  if(!mdPanelOpen) return;
  const line=lineAt(mdTextEl.selectionStart); setActiveMdLine(line);
  const id=mdLineToId[line]; if(id==null) return;
  const n=findByIdAll(id); if(!n) return;
  if(n!==selected || selection.size!==1){ selectOnly(n); refreshSelectionDom(); }
  if(doCenter) centerOn(n);
}
function commitMdText(){
  clearTimeout(mdInputTimer); mdInputTimer=null;
  const text=mdTextEl.value; const curLine=lineAt(mdTextEl.selectionStart);
  const stats=markdownPerfStats(text);
  const t0=performance.now();
  try{ roots=parseMarkdown(text); }
  catch(e){
    logCaught(e,'commit markdown text');
    setMdInfo(['Markdown 解析失敗', e&&e.message ? String(e.message) : '請檢查原始 Markdown'], 'error');
    return;
  }
  const t1=performance.now();
  mdTextDriven=true; render(); mdTextDriven=false;
  const t2=performance.now();
  const perf=updateMarkdownPerformance(stats, roots.reduce((s,r)=>s+countNodes(r),0), t1-t0, t2-t1, markdownCommitDelay(text));
  const id=mdLineToId[curLine]; const n=id?findByIdAll(id):null;
  if(n){ selectOnly(n); refreshSelectionDom(); }
  setActiveMdLine(curLine);
  updateMdInfo(text, perf.nodes, perf);
}
function scheduleMdCommit(){
  if(!mdTyping){ snapshot(true); mdTyping=true; }
  const delay=markdownCommitDelay(mdTextEl.value);
  const stats=markdownPerfStats(mdTextEl.value);
  updateMarkdownPerformance(stats, lastMarkdownPerformance.nodes, lastMarkdownPerformance.parseMs, lastMarkdownPerformance.renderMs, delay);
  clearTimeout(mdInputTimer); mdInputTimer=setTimeout(commitMdText,delay);
  if(stats.large && mdInfoEl) setMdInfo(['大型 Markdown 輸入中','已放慢即時同步避免卡頓',`${stats.lines} 行`], 'warn');
}
function finishMdTyping(){ flushPendingMdText(); mdTyping=false; }
function toggleMdPanel(on){
  mdPanelOpen = (on===undefined) ? !mdPanelOpen : !!on;
  document.documentElement.classList.toggle('md-open', mdPanelOpen);
  storageSet(STORAGE_KEYS.markdownPanelOpen, mdPanelOpen?'1':'0', 'save markdown panel open state');
  if(mdPanelOpen) render(); else setActiveMdLine(null);
}
mdTextEl.addEventListener('input', ()=>{ setActiveMdLine(lineAt(mdTextEl.selectionStart)); scheduleMdCommit(); });
mdTextEl.addEventListener('blur', finishMdTyping);
mdTextEl.addEventListener('click', ()=>syncMapToMdCursor(true));
mdTextEl.addEventListener('keyup', e=>{ if(e.key.indexOf('Arrow')===0||e.key==='Home'||e.key==='End'||e.key==='PageUp'||e.key==='PageDown') syncMapToMdCursor(false); });
mdTextEl.addEventListener('scroll', ()=>{ if(mdActiveBlock) mdHiEl.style.top=(MD_PAD + mdActiveBlock.a*MD_LH - mdTextEl.scrollTop)+'px'; });
mdTextEl.addEventListener('keydown', e=>{ e.stopPropagation();
  if(e.key==='Tab'){ e.preventDefault(); const sp=mdTextEl.selectionStart, en=mdTextEl.selectionEnd, v=mdTextEl.value;
    mdTextEl.value=v.slice(0,sp)+'  '+v.slice(en); mdTextEl.selectionStart=mdTextEl.selectionEnd=sp+2;
    scheduleMdCommit(); } });
mdInfoEl.addEventListener('click', goToMdInfoLine);
document.getElementById('mdClose').onclick=()=>toggleMdPanel(false);
document.getElementById('mdTab').onclick=()=>toggleMdPanel(true);
(function(){ let d=null;
  document.getElementById('mdResize').addEventListener('mousedown', e=>{
    d={x:e.clientX, w:parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mdw'))||360};
    document.body.style.userSelect='none'; e.preventDefault(); });
  window.addEventListener('mousemove', e=>{ if(!d) return; let w=d.w-(e.clientX-d.x);
    w=Math.max(240,Math.min(680,w)); document.documentElement.style.setProperty('--mdw', w+'px');
    if(mdActiveBlock) mdHiEl.style.top=(MD_PAD + mdActiveBlock.a*MD_LH - mdTextEl.scrollTop)+'px'; });
  window.addEventListener('mouseup', ()=>{ if(d){ storageSet(STORAGE_KEYS.markdownPanelWidth, (getComputedStyle(document.documentElement).getPropertyValue('--mdw')||'').trim(), 'save markdown panel width'); document.body.style.userSelect=''; } d=null; });
})();
(function(){ const w=storageGet(STORAGE_KEYS.markdownPanelWidth, '', 'read markdown panel width'); if(w) document.documentElement.style.setProperty('--mdw', w); })();

