//===================== 右鍵選單(整合所有工具列功能;支援子選單)=====================
const ctxEl=document.getElementById('ctxmenu');
let ctxSubs=[];   // 開啟中的子選單堆疊
function closeSubsFrom(level){ while(ctxSubs.length>level){ ctxSubs.pop().remove(); } }
function hideCtx(){ ctxEl.style.display='none'; clearTrustedHTML(ctxEl); closeSubsFrom(0); }
function closeSiblingSubmenus(level, owner){
  closeSubsFrom(level);
  const menu=owner&&owner.parentElement;
  if(menu) menu.querySelectorAll(':scope > button[aria-haspopup="menu"]').forEach(b=>{ if(b!==owner) b.setAttribute('aria-expanded','false'); });
}
function renderMenu(container, items, level){
  container.setAttribute('role','menu');
  container.setAttribute('aria-label', level ? '右鍵子選單' : '右鍵選單');
  for(const it of items){
    if(it==='—'){ const d=document.createElement('div'); d.className='mdiv'; d.setAttribute('role','separator'); container.appendChild(d); continue; }
    if(it && it.header){ const h=document.createElement('div'); h.className='ctxhdr'; h.setAttribute('role','presentation'); h.textContent=it.header; container.appendChild(h); continue; }
    const b=document.createElement('button');
    b.type='button';
    b.setAttribute('role','menuitem');
    setTrustedHTML(b, it.sub ? `${escHtml(it.label)}<small>▸</small>` : (it.key ? `${escHtml(it.label)}<small>${escHtml(it.key)}</small>` : escHtml(it.label)), 'context menu item');
    b.setAttribute('aria-label', String(it.label||'').replace(/[^\p{L}\p{N}\s/.-]/gu,'').trim() || '選單項目');
    if(it.disabled){ b.disabled=true; container.appendChild(b); continue; }
    if(it.sub){
      b.setAttribute('aria-haspopup','menu');
      b.setAttribute('aria-expanded','false');
      b.addEventListener('mouseenter', ()=>{
        closeSiblingSubmenus(level, b);
        b.setAttribute('aria-expanded','true');
        const sub=document.createElement('div'); sub.className='ctxmenu'; sub.style.display='block';
        renderMenu(sub, it.sub, level+1);
        wireMenuKeyboard(sub);
        document.body.appendChild(sub); ctxSubs.push(sub);
        const r=b.getBoundingClientRect(), sw=sub.offsetWidth, sh=sub.offsetHeight;
        let sx=r.right-2; if(sx+sw>innerWidth-6) sx=r.left-sw+2; sx=Math.max(6,sx);
        let sy=r.top-5; if(sy+sh>innerHeight-6) sy=Math.max(6, innerHeight-sh-6);
        sub.style.left=sx+'px'; sub.style.top=sy+'px';
      });
    } else {
      b.addEventListener('mouseenter', ()=>closeSiblingSubmenus(level, b));
      b.onclick=()=>{ hideCtx(); it.fn(); };
    }
    container.appendChild(b);
  }
}
function showCtx(x,y,items){
  closeSubsFrom(0); clearTrustedHTML(ctxEl); ctxEl.style.display='block';
  renderMenu(ctxEl, items, 0);
  wireMenuKeyboard(ctxEl);
  const mw=ctxEl.offsetWidth, mh=ctxEl.offsetHeight;
  ctxEl.style.left=Math.min(x, innerWidth-mw-8)+'px';
  ctxEl.style.top=Math.max(6, Math.min(y, innerHeight-mh-8))+'px';
  const first=ctxEl.querySelector('button:not(:disabled)'); if(first) first.focus();
}
function ctxMenuButtons(menu){ return [...menu.querySelectorAll(':scope > button:not(:disabled)')]; }
function focusMenuButton(menu, delta){
  const bs=ctxMenuButtons(menu); if(!bs.length) return;
  const i=Math.max(0, bs.indexOf(document.activeElement));
  bs[(i+delta+bs.length)%bs.length].focus();
}
function wireMenuKeyboard(menu){
  if(menu._keyboardWired) return;
  menu._keyboardWired=true;
  menu.tabIndex=-1;
  menu.addEventListener('keydown', e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); focusMenuButton(menu, 1); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); focusMenuButton(menu, -1); }
    else if(e.key==='Enter' || e.key===' '){ e.preventDefault(); if(document.activeElement && menu.contains(document.activeElement)) document.activeElement.click(); }
    else if(e.key==='ArrowRight'){ e.preventDefault(); const active=document.activeElement; if(active&&active.getAttribute('aria-haspopup')==='menu'){ active.dispatchEvent(new Event('mouseenter')); const sub=ctxSubs[ctxSubs.length-1]; if(sub){ const b=sub.querySelector('button:not(:disabled)'); if(b) b.focus(); } } }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); const parentMenu=menu.parentElement&&menu.parentElement.closest&&menu.parentElement.closest('.ctxmenu'); const sub=ctxSubs.pop(); if(sub) sub.remove(); const owner=[...document.querySelectorAll('.ctxmenu button[aria-expanded="true"]')].pop(); if(owner){ owner.setAttribute('aria-expanded','false'); owner.focus(); } else if(parentMenu){ const b=parentMenu.querySelector('button:not(:disabled)'); if(b) b.focus(); } }
    else if(e.key==='Escape'){ e.preventDefault(); hideCtx(); }
  });
}
const cmdPaletteEl=document.getElementById('cmdPalette');
const cmdInputEl=document.getElementById('cmdInput');
const cmdListEl=document.getElementById('cmdList');
let cmdActiveIndex=0, cmdMatches=[];
function getCommandItems(){
  return [
    {label:'新建', hint:'檔案', aliases:'new blank', fn:createNewMindMap},
    {label:'開啟 .md', hint:'檔案', aliases:'open import markdown', fn:openMarkdownFile},
    {label:'匯出 Markdown', hint:'保存原始稿', aliases:'save export md original source', fn:exportMd},
    {label:'匯出 HTML 靜態展示', hint:'展示分享', aliases:'html export static viewer offline share not source save', fn:exportHTML},
    {label:'匯出 JPG', hint:'圖面', aliases:'image export not source save', fn:exportJPG},
    {label:'匯出 PDF', hint:'圖面', aliases:'pdf export not source save', fn:exportPDF},
    {label:'搜尋節點', hint:'檢視', aliases:'find search', fn:openSearch},
    {label:'置中縮放', hint:'檢視', aliases:'fit center zoom', fn:fit},
    {label:'HTML 區塊：純文字', hint:'檢視', aliases:'html block text raw plain', fn:()=>setHtmlDisplayMode('text')},
    {label:'HTML 區塊：安全顯示', hint:'檢視', aliases:'html block safe allowlist render', fn:()=>setHtmlDisplayMode('safe')},
    {label:'深色介面', hint:'外觀', aliases:'dark mode', fn:()=>applyDark(true)},
    {label:'淺色介面', hint:'外觀', aliases:'light mode', fn:()=>applyDark(false)},
    {label:'工具列歸位', hint:'檢視', aliases:'reset floating toolbar ui', fn:resetFloatWins},
    {label:'節點寬度 40 字', hint:'版面', aliases:'wrap narrow', fn:()=>applyNodeWrapWidth('narrow',true)},
    {label:'節點寬度 50 字', hint:'版面', aliases:'wrap normal', fn:()=>applyNodeWrapWidth('normal',true)},
    {label:'節點寬度 60 字', hint:'版面', aliases:'wrap wide', fn:()=>applyNodeWrapWidth('wide',true)},
    {label:'不自動換行', hint:'版面', aliases:'wrap none', fn:()=>applyNodeWrapWidth('none',true)},
    {label:'自檢報告', hint:'診斷', aliases:'self test report diagnostics', fn:openSelfTestReport},
    {label:'範本自檢', hint:'診斷', aliases:'test template', fn:()=>runTemplateSelfTest({toast:true,log:true})},
    {label:'Markdown 規則自檢', hint:'診斷', aliases:'test markdown rules', fn:()=>runMarkdownRuleSelfTest({toast:true,log:true})},
    {label:'大型 Markdown 自檢', hint:'診斷', aliases:'test large markdown performance stress', fn:()=>runLargeMarkdownPerformanceSelfTest({toast:true,log:true})},
    {label:'匯出自檢', hint:'診斷', aliases:'test export', fn:()=>runExportSelfTest({toast:true,log:true})},
    {label:'HTML 單檔自檢', hint:'診斷', aliases:'test html single file export regression', fn:()=>runHtmlSingleFileSelfTest({toast:true,log:true})},
    {label:'分隔線位置自檢', hint:'診斷', aliases:'test hr separator position', fn:()=>runHrPositionSelfTest({toast:true,log:true})},
    {label:'命令面板自檢', hint:'診斷', aliases:'test command palette', fn:()=>runCommandPaletteSelfTest({toast:true,log:true})},
    {label:'右鍵選單自檢', hint:'診斷', aliases:'test context menu accessibility aria keyboard', fn:()=>runContextMenuAccessibilitySelfTest({toast:true,log:true})},
    {label:'搜尋體驗自檢', hint:'診斷', aliases:'test search results find', fn:()=>runSearchExperienceSelfTest({toast:true,log:true})},
    {label:'鍵盤操作自檢', hint:'診斷', aliases:'test keyboard accessibility focus escape aria', fn:()=>runKeyboardAccessibilitySelfTest({toast:true,log:true})},
    {label:'完整自檢', hint:'診斷', aliases:'test full', fn:()=>runMindMapFullSelfTest({toast:true,log:true})},
    {label:'複製診斷資訊', hint:'診斷', aliases:'diagnostics copy', fn:copyDiagnostics}
  ];
}
function commandSearchText(cmd){ return (cmd.label+' '+(cmd.hint||'')+' '+(cmd.aliases||'')).toLowerCase(); }
function renderCommandPalette(){
  const q=(cmdInputEl.value||'').trim().toLowerCase();
  cmdMatches=getCommandItems().filter(cmd=>!q || commandSearchText(cmd).includes(q));
  if(cmdActiveIndex>=cmdMatches.length) cmdActiveIndex=Math.max(0, cmdMatches.length-1);
  clearTrustedHTML(cmdListEl);
  if(!cmdMatches.length){
    const empty=document.createElement('div'); empty.className='cmdempty'; empty.textContent='找不到符合的命令';
    cmdListEl.appendChild(empty); return;
  }
  cmdMatches.forEach((cmd,i)=>{
    const b=document.createElement('button');
    b.type='button'; b.className='cmditem'+(i===cmdActiveIndex?' active':'');
    const label=document.createElement('span'); label.textContent=cmd.label; b.appendChild(label);
    if(cmd.hint){ const small=document.createElement('small'); small.textContent=cmd.hint; b.appendChild(small); }
    b.onclick=()=>executeCommand(cmd);
    cmdListEl.appendChild(b);
  });
}
function executeCommand(cmd){
  if(!cmd) return;
  closeCommandPalette();
  cmd.fn();
  showToast('已執行: '+cmd.label);
}
function runCommandSearch(){
  hideCtx();
  cmdActiveIndex=0;
  cmdPaletteEl.classList.add('show');
  cmdInputEl.value='';
  renderCommandPalette();
  cmdInputEl.focus();
  setTimeout(()=>{ if(cmdPaletteEl.classList.contains('show')) cmdInputEl.focus(); },0);
}
function closeCommandPalette(){ cmdPaletteEl.classList.remove('show'); }
cmdInputEl.addEventListener('input', ()=>{ cmdActiveIndex=0; renderCommandPalette(); });
cmdInputEl.addEventListener('keydown', e=>{
  if(e.key==='ArrowDown'){ e.preventDefault(); cmdActiveIndex=Math.min(cmdActiveIndex+1, Math.max(0, cmdMatches.length-1)); renderCommandPalette(); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); cmdActiveIndex=Math.max(cmdActiveIndex-1, 0); renderCommandPalette(); }
  else if(e.key==='Enter'){ e.preventDefault(); executeCommand(cmdMatches[cmdActiveIndex]); }
  else if(e.key==='Escape'){ e.preventDefault(); closeCommandPalette(); }
});
cmdPaletteEl.addEventListener('mousedown', e=>{ if(e.target===cmdPaletteEl) closeCommandPalette(); });
function buildPreExportCheckMenu(){
  const s=getPreExportChecks();
  return [
    {header:'匯出前檢查設定'},
    {label:preExportCheckLabel('空標題提醒', s.emptyTitle), fn:()=>setPreExportCheck('emptyTitle', !s.emptyTitle)},
    {label:preExportCheckLabel('未閉合程式碼', s.codeFence), fn:()=>setPreExportCheck('codeFence', !s.codeFence)},
    {label:preExportCheckLabel('表格欄位問題', s.table), fn:()=>setPreExportCheck('table', !s.table)},
    '—',
    {label:(s.longLimit===80?'✓ ':'')+'過長節點 80 字', fn:()=>setPreExportCheck('longLimit', 80)},
    {label:(s.longLimit===120?'✓ ':'')+'過長節點 120 字', fn:()=>setPreExportCheck('longLimit', 120)},
    {label:(s.longLimit===0?'✓ ':'')+'不檢查過長節點', fn:()=>setPreExportCheck('longLimit', 0)}
  ];
}
function buildMainMenuItems(){
  const isDark = document.documentElement.classList.contains('dark');
  const fileSub = [
    {header: hasUnsavedChanges() ? '未匯出:請先用 .md 保存原始稿' : '已匯出:Markdown 原稿已保存'},
    {label:'📂 開啟 .md…', fn:openMarkdownFile},
    {label:'✨ 新建', fn:createNewMindMap},
    {label:'💾 匯出 .md', key:'保存原始稿', fn:exportMd},
    {label:'🖼 匯出 JPG', key:'圖面', fn:exportJPG},
    {label:'📄 匯出 PDF(A4)', key:'圖面', fn:exportPDF},
    {label:'🌐 匯出 HTML 靜態展示', key:'只供檢視', fn:exportHTML},
    {label:'⚙ 匯出前檢查設定', sub:buildPreExportCheckMenu()},
  ];
  const viewSub = [
    {label:'🎯 置中', fn:fit},
    {label:'🔍 搜尋', key:'⌃F', fn:openSearch},
    {label: mdPanelOpen?'📝 關閉原始碼面板':'📝 原始 Markdown 面板', fn:()=>toggleMdPanel()},
    {label:'HTML 區塊顯示', sub:[
      {label:htmlDisplayMode===HTML_DISPLAY_MODES.text?'✓ 純文字（不渲染）':'純文字（不渲染）', fn:()=>setHtmlDisplayMode('text')},
      {label:htmlDisplayMode===HTML_DISPLAY_MODES.safe?'✓ 安全顯示（白名單）':'安全顯示（白名單）', fn:()=>setHtmlDisplayMode('safe')}
    ]},
    {label: isDark?'☀️ 淺色介面':'🌙 深色介面', fn:()=>applyDark(!isDark)},
    {label:'↔ 節點寬度', sub:[
      {label:'40 字', fn:()=>applyNodeWrapWidth('narrow', true)},
      {label:'50 字', fn:()=>applyNodeWrapWidth('normal', true)},
      {label:'60 字', fn:()=>applyNodeWrapWidth('wide', true)},
      {label:'不自動換行', fn:()=>applyNodeWrapWidth('none', true)}
    ]},
    {label:'⌘ 命令面板', key:'⌃K', fn:runCommandSearch},
    {label:'↺ 工具列歸位', fn:resetFloatWins},
    {label: debugLayout?'🧪 關閉版面除錯':'🧪 版面除錯', fn:toggleDebugLayout},
  ];
  const diagSub = [
    {label:'📋 查看自檢報告', fn:openSelfTestReport},
    {label:'✅ 執行範本自檢', fn:()=>runTemplateSelfTest({toast:true, log:true})},
    {label:'✅ 執行 Markdown 規則自檢', fn:()=>runMarkdownRuleSelfTest({toast:true, log:true})},
    {label:'✅ 執行大型 Markdown 自檢', fn:()=>runLargeMarkdownPerformanceSelfTest({toast:true, log:true})},
    {label:'✅ 執行匯出自檢', fn:()=>runExportSelfTest({toast:true, log:true})},
    {label:'✅ 執行 HTML 單檔自檢', fn:()=>runHtmlSingleFileSelfTest({toast:true, log:true})},
    {label:'✅ 執行分隔線位置自檢', fn:()=>runHrPositionSelfTest({toast:true, log:true})},
    {label:'✅ 執行命令面板自檢', fn:()=>runCommandPaletteSelfTest({toast:true, log:true})},
    {label:'✅ 執行右鍵選單自檢', fn:()=>runContextMenuAccessibilitySelfTest({toast:true, log:true})},
    {label:'✅ 執行搜尋體驗自檢', fn:()=>runSearchExperienceSelfTest({toast:true, log:true})},
    {label:'✅ 執行鍵盤操作自檢', fn:()=>runKeyboardAccessibilitySelfTest({toast:true, log:true})},
    {label:'✅ 執行完整自檢', fn:()=>runMindMapFullSelfTest({toast:true, log:true})},
    {label:'📋 複製診斷資訊', fn:copyDiagnostics},
  ];
  return {fileSub, viewSub, diagSub};
}
function buildStructureMenuItems(node){
  return [
    {label:'＋ 同層節點', key:'Enter', fn:addSibling},
    {label:'＋ 子節點', key:'Tab', fn:addChild},
    {label:'＋ 父節點', key:'⇧Tab', fn:addParent},
    {label: node && node.collapsed ? '▶ 展開' : '▼ 收合', fn:()=>toggleNodeCollapsed(node), disabled:!(node && hasBranchChildren(node))},
    {label:'⬆ 提升為中心主題', fn:detachToRoot, disabled:!(node && node.parent)}
  ];
}
function buildTextFormatMenuItems(){
  const alertSub=ALERT_TYPES.map(type=>({label:ALERT_MENU_LABELS[type], fn:()=>applyAlertType(type)}));
  alertSub.push('—', {label:'✕ 移除提示框格式', fn:removeAlertFormat});
  const escapeSub=ESCAPE_MENU_CHARS.map(item=>({label:item.label, fn:()=>escapeSelectedMarkdownChar(item.ch)}));
  return [
    {header:'基本格式'},
    {label:'粗體 **', key:'⌃B', fn:()=>toggleWrap('**')},
    {label:'斜體 *', key:'⌃I', fn:()=>toggleWrap('*')},
    {label:'刪除線 ~~', fn:()=>toggleWrap('~~')},
    '—',
    {header:'Markdown 區塊'},
    {label:'🔔 警示框 / 提示框', sub:alertSub},
    '—',
    {header:'跳脫符號'},
    {label:'\\ 跳脫符號', sub:escapeSub},
    '—',
    {header:'連結'},
    {label:'🔗 連結…', fn:addLink},
  ];
}
function buildNodeActionGroupItems({structureSub, fmtSub, listSub, iconSub, dividerSub, clipSub}){
  return [
    {label:'➕ 節點操作', sub:structureSub},
    {label:'🅰 文字格式', sub:fmtSub},
    {label:'☑ 清單', sub:listSub},
    {label:'⭐ 圖示', sub:iconSub},
    {label:'─ 分隔線', sub:dividerSub},
    {label:'📋 剪貼簿', sub:clipSub},
  ];
}
function buildListMenuItems(){
  return [
    {label:'☑ 切換待辦', fn:toggleTodo},
    {label:'1. 切換有序清單', fn:toggleOrdered},
    {label:'❝ 切換引用', fn:toggleQuote},
  ];
}
function buildIconMenuItems(){
  return [
    {header:'加圖示'},
    ...ICONS.map(ic=>({label:ic+'　加圖示', fn:()=>setIcon(ic)})),
    '—',
    {header:'清除'},
    {label:'✕ 清除圖示/待辦', fn:clearIconAndTodo},
  ];
}
function buildDividerMenuItems(node){
  return [
    {label:'─ 在這個節點上方加入分隔線', fn:()=>insertHrNearNode(node,'before')},
    {label:'─ 在這個節點下方加入分隔線', fn:()=>insertHrNearNode(node,'after')}
  ];
}
function buildClipboardMenuItems(hasClip){
  return [
    {header:'複製貼上'},
    {label:'📋 複製', key:'⌃C', fn:copySelection},
    {label:'✂️ 剪下', key:'⌃X', fn:cutSelection},
    {label:'📥 貼上', key:'⌃V', fn:pasteAny, disabled:!hasClip},
    '—',
    {header:'危險操作'},
    {label:'🗑 刪除', key:'Del', fn:deleteNode}
  ];
}
viewport.addEventListener('contextmenu', e=>{
  e.preventDefault();
  const nodeDom = roots.length ? e.target.closest('.node') : null;
  const hasClip = !!(clipboard && clipboard.length);
  const clickBtn = id => ()=>{ const el=document.getElementById(id); if(el) el.click(); };
  const {fileSub, viewSub, diagSub}=buildMainMenuItems();
  let items;
  if(nodeDom){
    const node=findByIdAll(nodeDom.dataset.id);
    if(!selection.has(node)){ selectOnly(node); render(); }
    const multi = selection.size>1;
    const fmtSub = buildTextFormatMenuItems();
    const listSub = buildListMenuItems();
    const iconSub = buildIconMenuItems();
    const structureSub=buildStructureMenuItems(node);
    const dividerSub=buildDividerMenuItems(node);
    const clipSub=buildClipboardMenuItems(hasClip);
    items=[
      {header:'編輯'},
      {label:'✏️ 編輯文字', key:'F2', fn:editSelected, disabled:multi},
      {label: node.note==null ? '💬 增加註解' : '💬 編輯註解', fn:()=>editNodeNote(node), disabled:multi},
      {label:'✕ 刪除註解', fn:()=>deleteNodeNote(node), disabled:multi || node.note==null},
      '—',
      {header:'節點'},
      ...buildNodeActionGroupItems({structureSub, fmtSub, listSub, iconSub, dividerSub, clipSub}),
      '—',
      {header:'工具'},
      {label:'📄 檔案', sub:fileSub},
      {label:'👁 檢視', sub:viewSub},
    ];
  } else {
    items=[
      {header:'畫布'},
      {label:'✨ 新增中心主題', fn:addRoot},
      {label:'📥 貼上', key:'⌃V', fn:pasteAny, disabled:!hasClip},
      '—',
      {header:'工具'},
      {label:'📄 檔案', sub:fileSub},
      {label:'👁 檢視', sub:viewSub},
      '—',
      {header:'展開'},
      {label:'▼ 全部展開', fn:()=>setAllCollapsed(false)},
      {label:'▶ 全部收合', fn:()=>setAllCollapsed(true)},
    ];
  }
  showCtx(e.clientX, e.clientY, items);
});
window.addEventListener('mousedown', e=>{ if(!ctxEl.contains(e.target) && !ctxSubs.some(s=>s.contains(e.target))) hideCtx(); });
window.addEventListener('keydown', e=>{ if(e.key==='Escape') hideCtx(); });
window.addEventListener('blur', hideCtx);

function fitViewForContent(w, h, vw, vh, padding=80){
  w=Math.max(1, Number(w)||1); h=Math.max(1, Number(h)||1);
  vw=Math.max(1, Number(vw)||1); vh=Math.max(1, Number(vh)||1);
  const usableW=Math.max(1, vw-padding);
  const usableH=Math.max(1, vh-padding);
  const nextScale=Math.max(MIN_ZOOM_SCALE, Math.min(1, Math.min(usableW/w, usableH/h)));
  return {
    scale:nextScale,
    panX:(vw - w*nextScale)/2,
    panY:(vh - h*nextScale)/2
  };
}
function fit(){
  if(!roots.length){ return; }
  render();
  const w=parseFloat(svg.getAttribute('width'))||1, h=parseFloat(svg.getAttribute('height'))||1;
  const view=fitViewForContent(w, h, viewport.clientWidth, viewport.clientHeight, 80);
  scale=view.scale; panX=view.panX; panY=view.panY;
  applyTransform();
}

// zoom buttons
document.getElementById('zIn').onclick=()=>{ zoomCenter(1.15); };
document.getElementById('zOut').onclick=()=>{ zoomCenter(1/1.15); };
document.getElementById('zReset').onclick=fit;
document.getElementById('zoomPct').onclick=()=>{ const vw=viewport.clientWidth/2, vh=viewport.clientHeight/2, old=scale;
  scale=1; panX=vw-(vw-panX)*(scale/old); panY=vh-(vh-panY)*(scale/old); applyTransform(); showToast('縮放已重設為 100%'); };
function zoomCenter(f){ const vw=viewport.clientWidth/2, vh=viewport.clientHeight/2, old=scale;
  scale=clampZoom(scale*f); panX=vw-(vw-panX)*(scale/old); panY=vh-(vh-panY)*(scale/old); applyTransform(); }

