//===================== 拖放檔案 =====================
const dropEl=document.getElementById('drop');
function hasDraggedFiles(dataTransfer){
  return !!(dataTransfer && ((dataTransfer.files&&dataTransfer.files.length) || Array.from(dataTransfer.types||[]).includes('Files')));
}
['dragenter','dragover'].forEach(ev=>viewport.addEventListener(ev,e=>{
  if(!hasDraggedFiles(e.dataTransfer)) return;
  e.preventDefault(); dropEl.classList.add('show');
}));
viewport.addEventListener('dragleave',e=>{
  if(!dropEl.classList.contains('show')) return;
  e.preventDefault();
  if(e.target===viewport) dropEl.classList.remove('show');
});
viewport.addEventListener('drop',e=>{
  const hasFiles=hasDraggedFiles(e.dataTransfer);
  e.preventDefault(); dropEl.classList.remove('show');
  if(!hasFiles) return;
  const f=e.dataTransfer.files[0]; if(f) loadFile(f);
});
window.addEventListener('beforeunload', e=>{
  flushPendingMdText();
  if(hasUnsavedChanges()){ e.preventDefault(); e.returnValue=''; }
});

