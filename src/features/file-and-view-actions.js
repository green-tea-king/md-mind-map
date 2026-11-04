//===================== 鍵盤 =====================
window.addEventListener('keydown', e=>{
  const _inTa = document.activeElement && document.activeElement.tagName==='TEXTAREA';
  if(e.key==='Escape' && selfTestReportEl && selfTestReportEl.classList.contains('show')){ e.preventDefault(); closeSelfTestReport(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='f' && !_inTa){ e.preventDefault(); openSearch(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k' && !_inTa){ e.preventDefault(); runCommandSearch(); return; }
  const ae=document.activeElement; const inField = ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable);
  if(editing || inField) return;
  if((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z'))){ e.preventDefault(); redo(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='a'){ e.preventDefault(); selectAllNodes(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); exportMd(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='c'){ e.preventDefault(); copySelection(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='x'){ e.preventDefault(); cutSelection(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='v'){ e.preventDefault(); pasteAny(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='b'){ e.preventDefault(); toggleWrap('**'); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='i'){ e.preventDefault(); toggleWrap('*'); return; }
  if(!selected) return;
  if(e.key==='Tab'){ e.preventDefault(); if(e.shiftKey) addParent(); else addChild(); }
  else if(e.key==='Enter'){ e.preventDefault(); const focusedNode=ae&&ae.closest&&ae.closest('.node'); if(focusedNode) editSelected(); else addSibling(); }
  else if(e.key==='Delete' || e.key==='Backspace'){ e.preventDefault(); deleteNode(); }
  else if(e.key==='F2'){ e.preventDefault(); editSelected(); }
  else if(e.key.startsWith('Arrow')){ e.preventDefault(); moveSel(e.key); }
});
function moveSel(key){
  if(!selected) return;
  // 依版面方向對應方向鍵:橫式 往父=←/往子=→/同層=↑↓;直式 往父=↑/往子=↓/同層=←→
  const toParent = orient==='h' ? 'ArrowLeft'  : 'ArrowUp';
  const toChild  = orient==='h' ? 'ArrowRight' : 'ArrowDown';
  const sibPrev  = orient==='h' ? 'ArrowUp'    : 'ArrowLeft';
  const sibNext  = orient==='h' ? 'ArrowDown'  : 'ArrowRight';
  if(key===toParent && selected.parent){ select(selected.parent); }
  else if(key===toChild){
    const ch=branchChildren(selected);
    if(ch.length) select(ch[0]);
  }
  else if((key===sibPrev||key===sibNext) && selected.parent){
    const sib=selected.parent.children; let i=sib.indexOf(selected);
    i += (key===sibPrev?-1:1); if(i>=0&&i<sib.length) select(sib[i]);
  }
}

