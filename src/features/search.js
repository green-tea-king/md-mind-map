//===================== 匯入 / 匯出 / 新建 / 置中 =====================
const fileInput=document.getElementById('file');
function openMarkdownFile(){ fileInput.click(); }
fileInput.onchange=e=>{ const f=e.target.files[0]; if(f) loadFile(f); fileInput.value=''; };
let savedMarkdown=null;
let lastExportAt=storageGet(STORAGE_KEYS.lastExportAt, '', 'read last export time');
function exportTimeText(iso){
  if(!iso) return '';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
}
function setLastExportNow(){
  lastExportAt=new Date().toISOString();
  storageSet(STORAGE_KEYS.lastExportAt, lastExportAt, 'save last export time');
}
function markSaved(options={}){
  savedMarkdown=roots.length ? toMarkdown(roots) : '';
  if(options.exported) setLastExportNow();
  refreshSaveState();
}
function hasUnsavedChanges(){
  if(savedMarkdown==null && !roots.length) return false;
  return (roots.length ? toMarkdown(roots) : '') !== savedMarkdown;
}
function confirmNonMarkdownExport(kind){
  if(!hasUnsavedChanges()) return true;
  const msg=`${kind} 不會保存原始 Markdown;建議先匯出 Markdown 保存原稿。`;
  setStatusMessage(msg,'warn',7000);
  return confirm(`${msg}\n\n仍要繼續匯出 ${kind} 嗎?`);
}
function refreshSaveState(){
  if(!saveStateEl) return;
  const current=roots.length ? toMarkdown(roots) : '';
  const dirty=(savedMarkdown==null && !roots.length) ? false : current !== savedMarkdown;
  saveStateEl.textContent=dirty ? '未匯出' : '已匯出';
  saveStateEl.classList.toggle('dirty', dirty);
  saveStateEl.classList.toggle('saved', !dirty);
  const last=exportTimeText(lastExportAt);
  saveStateEl.title=dirty
    ? '目前內容尚未匯出 Markdown,離開前請手動匯出保存'
    : (last ? `目前內容已匯出或未變更;最後匯出:${last}` : '目前內容已匯出或未變更');
  if(saveInfoEl){
    saveInfoEl.textContent=dirty
      ? '尚未保存:請匯出 Markdown'
      : (last ? `最後匯出 ${last}` : '請用匯出 Markdown 保存');
    saveInfoEl.title=saveStateEl.title;
  }
}
function confirmReplace(){ return !hasUnsavedChanges() || confirm('目前內容尚未匯出保存,確定要放棄變更嗎?'); }
function loadFile(file){
  if(!/\.(md|markdown|txt)$/i.test(file.name||'')){ setStatusMessage('只支援 .md、.markdown、.txt 檔案','warn',4200); return; }
  flushPendingMdText();
  if(!confirmReplace()) return;
  const r=new FileReader();
  r.onload=()=>{ originalMarkdownText=String(r.result); const stats=markdownPerfStats(originalMarkdownText); const t0=performance.now();
    if(stats.large) setStatusMessage(`正在載入大型 Markdown:${stats.lines} 行`,'warn',0);
    roots=parseMarkdown(originalMarkdownText); const t1=performance.now(); selectOnly(roots[0]); history.length=0; clearSearch();
    redoStack.length=0; currentFileName=file.name; currentName=file.name.replace(/\.(md|markdown|txt)$/i,''); markSaved(); render(); const t2=performance.now(); fit();
    const perf=updateMarkdownPerformance(stats, roots.reduce((s,r)=>s+countNodes(r),0), t1-t0, t2-t1, markdownCommitDelay(originalMarkdownText));
    if(perf.large) setStatusMessage(`大型 Markdown 已載入:${perf.nodes} 節點 · 解析 ${perf.parseMs}ms · 渲染 ${perf.renderMs}ms`,'info',5200);
  };   // 顏色由主題即時套用
  r.readAsText(file,'utf-8');
}
let currentName=null;   // 載入檔案的原檔名(不含副檔名);null = 非由檔案載入
let currentFileName=null; // 載入檔案的完整檔名;Markdown 匯出沿用原檔名與副檔名
let originalMarkdownText=null; // 未修改匯出時逐字保留原稿;修改後才輸出整理後 Markdown
function exportMd(){
  const sourceBeforeFlush=mdPanelOpen && mdTextEl ? mdTextEl.value : '';
  flushPendingMdText();
  if(!roots.length) return;
  const generated=toMarkdown(roots);   // 100% 原生 Markdown,不含顏色
  const md=(originalMarkdownText!=null && generated===savedMarkdown) ? originalMarkdownText : generated;
  if(!confirmMarkdownExportQuality(sourceBeforeFlush || md, roots)) return;
  const blob=new Blob([md],{type:'text/markdown;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  // 由檔案載入 → 沿用完整原檔名;否則用根節點標題
  a.download = currentFileName || _expName('md');
  a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  originalMarkdownText=md;
  markSaved({exported:true});
  showToast('Markdown 已匯出');
}
function buildSingleFileHTML(markdown){
  return buildStaticViewerHTML(markdown);
}
function buildStaticViewerHTML(markdown){
  const savedRoots=roots, savedScale=scale, savedPanX=panX, savedPanY=panY, savedOrient=orient;
  const savedSelection=[...selection].map(n=>n.id), savedSelected=selected&&selected.id;
  let snapshot='', mapWidth=1, mapHeight=1;
  try{
    roots=parseMarkdown(markdown);
    roots.forEach(r=>setParents(r,null));
    selection=new Set(); selected=null;
    render();
    mapWidth=Math.ceil(parseFloat(svg.getAttribute('width'))||1);
    mapHeight=Math.ceil(parseFloat(svg.getAttribute('height'))||1);
    snapshot=canvas.innerHTML;
  }finally{
    roots=savedRoots; scale=savedScale; panX=savedPanX; panY=savedPanY; orient=savedOrient;
    roots.forEach(r=>setParents(r,null));
    selection=new Set();
    savedSelection.forEach(id=>{ const n=findByIdAll(id); if(n) selection.add(n); });
    selected=savedSelected ? findByIdAll(savedSelected) : null;
    try{ render(); applyTransform(); }catch(e){ logCaught(e,'restore after static html export'); }
  }
  const css=`:root{--bg:#f4f6f9;--panel:#ffffff;--line:#c2ccd8;--txt:#1f2933;--accent:#2f6fed;--accent2:#e8f0ff;--node-wrap-width:50em;--unit-line-width:2px}*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:"Microsoft JhengHei","PingFang TC",system-ui,sans-serif;color:var(--txt);overflow:hidden}body{background:var(--bg)}#viewport{position:fixed;inset:0;overflow:hidden;cursor:grab;background-color:#f7f9fc;background-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='40'%20height='40'%3E%3Cg%20fill='none'%20stroke='%23c2ccd8'%20stroke-width='1' stroke-dasharray='4,4'%3E%3Cpath%20d='M0%200H40'/%3E%3Cpath%20d='M0%200V40'/%3E%3C/g%3E%3C/svg%3E")}#viewport.panning{cursor:grabbing}#canvas{position:absolute;left:0;top:0;transform-origin:0 0}svg#edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}svg#edges path.edge-flow{stroke-dasharray:6 6}.node{position:absolute;width:max-content;max-width:var(--node-wrap-width);padding:7px 12px;border-radius:9px;background:#fff;border:var(--unit-line-width) solid var(--line);font-size:14px;line-height:1.4;user-select:none;pointer-events:none;writing-mode:horizontal-tb;box-shadow:0 1px 4px rgba(20,40,80,.08);white-space:pre-wrap;overflow-wrap:break-word;word-break:normal}.node .ckbox{margin-right:5px;font-size:1.05em;line-height:1}.node .nicon{margin-right:4px}.node .norder{margin-right:5px;font-weight:700;opacity:.75}.node.preamble,.node.lv0.preamble{font-size:30px;line-height:1.45;padding:13px 18px;max-width:min(2200px,calc(100vw - 48px));font-weight:800;overflow-wrap:normal;word-break:keep-all}.node.quote{font-style:italic;background:#1a1a1a!important;border-color:#1a1a1a!important;color:#fff!important}.node .nnote{display:block;margin-top:7px;padding:7px 11px;border-radius:8px;background:#1a1a1a;color:#fff;font-size:.88em;font-style:italic;white-space:normal}.node .nnote .nqline{display:block;line-height:1.5;opacity:.95}.node a.mlink{color:var(--fx-link,#0369a1);font-weight:700;text-decoration:underline;text-decoration-color:var(--fx-link-line,rgba(3,105,161,.45));text-underline-offset:2px;pointer-events:auto}.node img.mimg{display:block;max-width:160px;max-height:88px;min-width:64px;min-height:36px;width:auto;height:auto;border-radius:6px;margin:1px auto;object-fit:contain}.node .ntext.hasimg{display:block}.node sup.fnref{font-size:.7em;line-height:0;vertical-align:super;color:#2563eb;font-weight:700;padding:0 1px}.node strong{color:var(--fx-bold,#c2410c);font-weight:800}.node em{color:var(--fx-em,#7c3aed);font-style:italic}.node del{color:var(--fx-del,#64748b);text-decoration-color:var(--fx-del-line,#ef4444);text-decoration-thickness:1.5px}.node code.mdcode{font-family:ui-monospace,"Cascadia Code",Menlo,Consolas,"Courier New",monospace;font-size:.88em;color:var(--fx-code,#b45309);background:var(--fx-code-bg,rgba(245,158,11,.18));padding:1px 5px;border-radius:4px}.node.fndef{font-size:.94em;opacity:.9}.node.fndef .fnlabel{display:inline-block;font-weight:700;color:#2563eb;margin-right:5px;font-size:.92em}.node.alert{border-left-width:var(--unit-line-width);border-left-style:solid}.node.alert .altitle{display:block;font-weight:800;font-size:.9em;margin-bottom:3px;letter-spacing:.3px}.node.alert .albody{display:block;white-space:pre-wrap;font-size:.95em;opacity:.92}.node.alert.note{border-left-color:#2563eb}.node.alert.note .altitle{color:#2563eb}.node.alert.tip{border-left-color:#16a34a}.node.alert.tip .altitle{color:#16a34a}.node.alert.important{border-left-color:#9333ea}.node.alert.important .altitle{color:#9333ea}.node.alert.warning{border-left-color:#d97706}.node.alert.warning .altitle{color:#d97706}.node.alert.caution{border-left-color:#dc2626}.node.alert.caution .altitle{color:#dc2626}.node.done{opacity:.6}.node.d0{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700}.node.d1{background:#fff;border-color:#2f6fed;font-weight:600}.node.d2{background:#f3f8ff}.node.lv0,.node.lv1,.node.lv2,.node.lv3,.node.lv4,.node.lv5,.node.lv6{border-width:var(--unit-line-width)}.node.tablenode,.node.codenode,.node.htmlnode{max-width:920px}.node .ntext.hastable,.node .ntext.hascode,.node .ntext.hashtml{display:block;white-space:normal}.node table.mdtable{border-collapse:collapse;font-size:.93em;line-height:1.35;margin:1px 0}.node table.mdtable th,.node table.mdtable td{border:var(--unit-line-width) solid rgba(120,132,148,.55);padding:3px 9px;text-align:left;vertical-align:top;white-space:normal}.node table.mdtable th{font-weight:700;background:rgba(120,132,148,.14)}.node pre.mdpre,.node pre.mdhtmlraw{margin:2px 0;padding:8px 11px;border-radius:7px;background:rgba(120,132,148,.16);font-family:ui-monospace,"Cascadia Code",Menlo,Consolas,"Courier New",monospace;font-size:.86em;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;max-width:880px}.node pre.mdpre code{font-family:inherit;background:none;padding:0;white-space:inherit}.node .ntext.htmlsafe>*{max-width:100%}.node .ntext.htmlsafe p,.node .ntext.htmlsafe blockquote{margin:4px 0}.node .ntext.htmlsafe pre{white-space:pre-wrap;overflow-wrap:anywhere}.node .ntext.htmlsafe img{max-width:100%;height:auto}.node.hrnode{width:170px;min-width:120px;max-width:none;padding:9px 0;opacity:1;background:transparent!important;border-width:0!important;border-color:transparent!important;box-shadow:none!important;color:#64748b!important}.node.hrnode .ntext{display:block;width:100%;height:14px;white-space:normal}.node.hrnode .mdhr{display:block;width:100%;height:14px;opacity:.9;margin:0;overflow:visible}.node.hrnode .mdhrline{stroke:currentColor;stroke-width:var(--unit-line-width);stroke-linecap:round;stroke-dasharray:6 6}.zoombar{position:fixed;right:14px;bottom:14px;display:flex;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:5px;box-shadow:0 2px 8px rgba(0,0,0,.08);z-index:5}.zoombar button{width:30px;height:30px;border:none;background:transparent;font-size:17px;cursor:pointer;border-radius:6px;color:var(--txt)}.zoombar button:hover{background:var(--accent2)}#zoomPct{min-width:48px;border:none;background:transparent;color:var(--txt);font:600 11px/30px system-ui,sans-serif;cursor:pointer;border-radius:6px;padding:0 5px}.badge{position:fixed;left:14px;bottom:14px;z-index:4;color:#64748b;background:rgba(255,255,255,.88);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font:700 12px system-ui,sans-serif;box-shadow:0 2px 8px rgba(20,40,80,.08)}`;
  const js=`const viewport=document.getElementById('viewport'),canvas=document.getElementById('canvas'),zoomPct=document.getElementById('zoomPct');let scale=1,panX=0,panY=0;const mapWidth=${mapWidth},mapHeight=${mapHeight},MIN=0.03,MAX=2.5;function clamp(v,a,b){return Math.max(a,Math.min(b,v))}function applyTransform(){canvas.style.transform='translate('+panX+'px,'+panY+'px) scale('+scale+')';const g=40*scale;viewport.style.backgroundSize=g+'px '+g+'px';viewport.style.backgroundPosition=panX+'px '+panY+'px';zoomPct.textContent=Math.round(scale*100)+'%'}function fitStaticView(){const vw=viewport.clientWidth||1,vh=viewport.clientHeight||1,p=80;scale=Math.max(MIN,Math.min(1,Math.min((vw-p)/Math.max(1,mapWidth),(vh-p)/Math.max(1,mapHeight))));panX=(vw-mapWidth*scale)/2;panY=(vh-mapHeight*scale)/2;applyTransform()}function zoomCenter(f){const vw=viewport.clientWidth/2,vh=viewport.clientHeight/2,old=scale;scale=clamp(scale*f,MIN,MAX);panX=vw-(vw-panX)*(scale/old);panY=vh-(vh-panY)*(scale/old);applyTransform()}let pan=null;viewport.addEventListener('pointerdown',e=>{pan={x:e.clientX,y:e.clientY,px:panX,py:panY};viewport.classList.add('panning');viewport.setPointerCapture(e.pointerId)});viewport.addEventListener('pointermove',e=>{if(!pan)return;panX=pan.px+e.clientX-pan.x;panY=pan.py+e.clientY-pan.y;applyTransform()});viewport.addEventListener('pointerup',e=>{pan=null;viewport.classList.remove('panning');try{viewport.releasePointerCapture(e.pointerId)}catch(_){}});viewport.addEventListener('wheel',e=>{e.preventDefault();const old=scale,mx=e.clientX,my=e.clientY;scale=clamp(scale*(e.deltaY<0?1.1:1/1.1),MIN,MAX);panX=mx-(mx-panX)*(scale/old);panY=my-(my-panY)*(scale/old);applyTransform()},{passive:false});document.getElementById('zIn').onclick=()=>zoomCenter(1.15);document.getElementById('zOut').onclick=()=>zoomCenter(1/1.15);document.getElementById('zReset').onclick=fitStaticView;zoomPct.onclick=()=>{scale=1;panX=40;panY=40;applyTransform()};window.addEventListener('resize',fitStaticView);fitStaticView();`;
  const safeTitle='MK2MD v'+APP_VERSION;
  return `<!DOCTYPE html>
<html lang="zh-Hant" data-mk2md-static-viewer="true">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<style>${css}</style>
</head>
<body>
<div id="viewport"><div id="canvas">${snapshot}</div></div>
<div class="badge">${safeTitle} · 靜態展示</div>
<div class="zoombar"><button id="zOut" title="縮小">－</button><button id="zoomPct" title="重設為 100%">100%</button><button id="zIn" title="放大">＋</button><button id="zReset" title="置中縮放">⤢</button></div>
<script>${js.replace(/<\/script/gi,'<\\/script')}<\/script>
</body>
</html>`;
}
function exportHTML(){
  flushPendingMdText();
  if(!confirmNonMarkdownExport('HTML 靜態展示')) return;
  const generated=toMarkdown(roots);
  const md=(originalMarkdownText!=null && generated===savedMarkdown) ? originalMarkdownText : generated;
  const html=buildSingleFileHTML(md);
  _dl(new Blob([html],{type:'text/html;charset=utf-8'}), _expName('html'));
  showToast('HTML 靜態展示已匯出');
}
window.exportJPG=exportJPG; window.exportPDF=exportPDF; window.exportHTML=exportHTML;
function createNewMindMap(){ flushPendingMdText(); if(!confirmReplace()) return; const r0=makeNode('中心主題'); roots=[r0];
  ['分支一','分支二','分支三'].forEach(t=>{ const c=makeNode(t); c.parent=r0; r0.children.push(c); });
  history.length=0; redoStack.length=0; selectOnly(r0); currentName=null; currentFileName=null; originalMarkdownText=null; savedMarkdown=null; clearSearch(); render(); fit(); }

// 圖示 / 待辦
const ICONS=['⭐','🔥','✅','❗','❓','💡','📌','🎯','👍','❤️'];
// 文字開頭的圖示 emoji 偵測(供 nodeFrom 抽取;與匯出「emoji 放進文字」對應)
const LEAD_ICON_RE = new RegExp('^(' + ICONS.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|') + ')\\s*');
function setIcon(ic){ if(!selection.size){ setStatusMessage('請先點選節點,再加圖示','warn',3200); return; } snapshot(); for(const n of selection) n.icon=ic; render(); }
function clearIconAndTodo(){ if(!selection.size) return; snapshot(); for(const n of selection){ delete n.icon; delete n.checked; } render(); }
function toggleTodo(){
  if(!selection.size){ setStatusMessage('請先點選節點,再切換待辦','warn',3200); return; }
  snapshot();
  const addAny=[...selection].some(n=>n.checked===undefined);   // 有人沒方塊 → 全部加上;否則全部移除
  for(const n of selection){ if(addAny){ if(n.checked===undefined) n.checked=false; } else { delete n.checked; } }
  render();
}
// 行內格式:對選取節點整段標題加上/移除 **粗體** / *斜體* / ~~刪除線~~(切換)
function toggleWrap(mk){
  if(!selection.size){ setStatusMessage('請先點選節點再套用樣式','warn',3200); return; }
  snapshot();
  for(const n of selection){ const t=n.title||'';
    if(mk==='*'){ const isBold=/^\*\*[\s\S]+\*\*$/.test(t); const m=t.match(/^\*([\s\S]+)\*$/); n.title=(m && !isBold)?m[1]:'*'+t+'*'; }
    else { const re = mk==='**' ? /^\*\*([\s\S]+)\*\*$/ : /^~~([\s\S]+)~~$/; const m=t.match(re); n.title = m ? m[1] : mk+t+mk; }
  }
  render();
}
const ALERT_TYPES=['NOTE','TIP','IMPORTANT','WARNING','CAUTION'];
const ALERT_MENU_LABELS={NOTE:'📘 套成 NOTE',TIP:'💡 套成 TIP',IMPORTANT:'❗ 套成 IMPORTANT',WARNING:'⚠️ 套成 WARNING',CAUTION:'🛑 套成 CAUTION'};
const ESCAPE_MENU_CHARS=[
  {label:'跳脫 *', ch:'*'},
  {label:'跳脫 _', ch:'_'},
  {label:'跳脫 `', ch:'`'},
  {label:'跳脫 #', ch:'#'},
  {label:'跳脫 >', ch:'>'},
  {label:'跳脫 -', ch:'-'}
];
function canFormatAsAlertNode(node){
  return !!(node && node.parent && node.kind!=='hr' && !node.table && node.code==null && !node.htmlRaw && !node.refdef && !node.fndef && node.kind!=='preamble');
}
function formatAlertNode(node, type){
  if(!canFormatAsAlertNode(node)) return false;
  node.alert=String(type||'NOTE').toUpperCase();
  node.kind='alert';
  delete node.quote;
  delete node.ordered;
  delete node.orderedNum;
  delete node.orderedMarker;
  delete node.checked;
  delete node.icon;
  return true;
}
function removeAlertNodeFormat(node){
  if(!node || !node.alert) return false;
  delete node.alert;
  if(node.kind==='alert') node.kind='ul';
  return true;
}
function applyAlertType(type){
  if(!selection.size){ setStatusMessage('請先點選節點再套用提示框','warn',3200); return; }
  snapshot();
  let changed=0, skipped=0;
  for(const n of selection){ if(formatAlertNode(n, type)) changed++; else skipped++; }
  if(!changed){ undo(); setStatusMessage('中心主題或特殊節點不能套成提示框','warn',4200); return; }
  render();
  setStatusMessage(`已套成 ${String(type).toUpperCase()} 提示框${skipped?'；部分特殊節點略過':''}`,'ok',3600);
}
function removeAlertFormat(){
  if(!selection.size){ setStatusMessage('請先點選節點再移除提示框','warn',3200); return; }
  snapshot();
  let changed=0;
  for(const n of selection){ if(removeAlertNodeFormat(n)) changed++; }
  if(!changed){ undo(); setStatusMessage('選取節點不是提示框','warn',3200); return; }
  render();
  setStatusMessage('已移除提示框格式','ok',3200);
}
function escapeMarkdownCharInText(text, ch){
  const target=String(ch||'');
  if(!target) return String(text||'');
  let out='', s=String(text||'');
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c===target){
      let slashCount=0;
      for(let j=i-1;j>=0 && s[j]==='\\';j--) slashCount++;
      if(slashCount%2===0) out+='\\';
    }
    out+=c;
  }
  return out;
}
function escapeSelectedMarkdownChar(ch){
  if(!selection.size){ setStatusMessage('請先點選節點再跳脫符號','warn',3200); return; }
  snapshot();
  let changed=0;
  for(const n of selection){
    if(n.table || n.code!=null || n.kind==='hr' || n.refdef || n.fndef || n.htmlRaw) continue;
    const before=String(n.title||'');
    const after=escapeMarkdownCharInText(before, ch);
    if(after!==before){ n.title=after; changed++; }
  }
  if(!changed){ undo(); setStatusMessage(`選取文字沒有需要跳脫的 ${ch} 符號`,'warn',3200); return; }
  render();
  setStatusMessage(`已跳脫 ${ch} 符號`,'ok',3200);
}
// 連結:把選取節點包成 [文字](網址)(已是連結則換網址)
function addLink(){
  if(!selection.size){ setStatusMessage('請先點選節點再加連結','warn',3200); return; }
  const url = prompt('輸入連結網址(URL):', 'https://');
  if(!url) return;
  const safeUrl=safeLinkHref(url);
  if(!safeUrl){ showToast('連結網址無效或不安全'); return; }
  snapshot();
  for(const n of selection){ const t=n.title||''; const m=t.match(/^\[([\s\S]+)\]\(([^)]*)\)$/);
    n.title = m ? `[${m[1]}](${safeUrl})` : `[${t||'連結'}](${safeUrl})`; }
  render(); showToast('已加入連結');
}
// 有序清單 / 引用:切換節點類型(兩者互斥)
function toggleOrdered(){ if(!selection.size){ setStatusMessage('請先點選節點','warn',3200); return; } snapshot();
  const add=[...selection].some(n=>!n.ordered); for(const n of selection){ if(add){ n.ordered=true; delete n.quote; } else delete n.ordered; } render(); }
function toggleQuote(){ if(!selection.size){ setStatusMessage('請先點選節點','warn',3200); return; } snapshot();
  const add=[...selection].some(n=>!n.quote); for(const n of selection){ if(add){ n.quote=true; delete n.ordered; } else delete n.quote; } render(); }

// 固定配色:活力分支 Vivid。顏色僅供畫面辨識,不寫入 Markdown。
// palette 只需列出各主幹的主色(main),淺底與深色字由程式自動推算。
const VIVID_THEME={
  name:'活力分支 Vivid',
  center:'#3A3F47',
  // 交錯排序,讓相鄰主幹色相拉開(避免橙/黃等相鄰撞色):紅→綠→藍→橙→紫→青→粉→金
  palette:['#EF4444','#16A34A','#2F6FED','#F59E0B','#8B5CF6','#06B6D4','#EC4899','#EAB308']
};
// 只上色,不含 snapshot/render
function colorizeTheme(start, t){
  // 深色介面時,把(偏黑的)中心色調亮,避免中心節點與深色背景融在一起
  const dark = document.documentElement.classList.contains('dark');
  const center = dark ? mixHex(t.center, '#ffffff', 0.24) : t.center;
  // Vivid:深色中心;每條主幹一個鮮明色(實色底),子孫用該色淺色版(淺底+同色框+深色字)
  start.fill=center; start.border=center; start.text=textColor(center);
  const pal=t.palette, n=pal.length||1;
  branchChildren(start,{includeCollapsed:true}).forEach((c,i)=>{
    const main = pal[i % n];
    const light = mixHex(main, '#FFFFFF', 0.82);   // 淺色底(混 82% 白)
    const txt   = mixHex(main, '#16202A', 0.34);   // 深色字(混向深藍黑)
    c.fill=main; c.border=main; c.text=textColor(main);   // 主幹:實色底、自動黑/白字
    (function paint(m){ for(const ch of branchChildren(m,{includeCollapsed:true})){ ch.fill=light; ch.border=main; ch.text=txt; paint(ch); } })(c);
  });
}

