//===================== 選取 / 編輯 / 結構操作 =====================
function flushPendingMdText(){ if(mdInputTimer) commitMdText(); }
function snapshot(skipMdFlush){ if(!skipMdFlush) flushPendingMdText();
  if(roots.length){ history.push(roots.map(cloneTree)); if(history.length>60) history.shift(); redoStack.length=0; } }
function undo(){ flushPendingMdText(); if(history.length){ redoStack.push(roots.map(cloneTree));
  roots=history.pop(); roots.forEach(r=>setParents(r,null));
  const ids=[...selection].map(n=>n.id); selection=new Set();
  ids.forEach(id=>{ const n=findByIdAll(id); if(n) selection.add(n); });
  selected = selected ? findByIdAll(selected.id) : null;
  render(); } }
function redo(){ flushPendingMdText(); if(redoStack.length){ history.push(roots.map(cloneTree));
  roots=redoStack.pop(); roots.forEach(r=>setParents(r,null));
  const ids=[...selection].map(n=>n.id); selection=new Set();
  ids.forEach(id=>{ const n=findByIdAll(id); if(n) selection.add(n); });
  selected = selected ? findByIdAll(selected.id) : null;
  render(); } }
function findById(n,id){ if(n.id===id) return n; for(const c of n.children){ const r=findById(c,id); if(r) return r; } return null; }

function selectOnly(node){
  selection = new Set(node?[node]:[]);
  selected = node||null;
  if(node && node.kind==='hr' && mdPanelOpen) highlightMdNode(node);
}
function addSelect(node){ selection.add(node); selected=node; }
function toggleSelect(node){ if(selection.has(node)){ selection.delete(node); if(selected===node) selected=[...selection].pop()||null; } else { selection.add(node); selected=node; } }
function clearSelection(){ selection.clear(); selected=null; }
function isSel(node){ return selection.has(node); }
// 取最上層的選取節點(排除其祖先也被選取者),用於整組刪除/搬移
function topLevelSelected(set){ const arr=[...set]; return arr.filter(n=> !arr.some(m=> m!==n && isDescendant(n,m))); }
function select(node){ selectOnly(node); render(); }
function selectAllNodes(){ if(!roots.length) return; selection=new Set();
  for(const r of roots) (function w(n){ selection.add(n); for(const c of n.children) w(c); })(r);
  selected=roots[0]; render(); }

function startEdit(node, dom){
  if(node.kind==='hr'){ showToast('水平分隔線請用右側「原始碼」面板編輯'); if(!mdPanelOpen) toggleMdPanel(true); highlightMdNode(node); return; }
  if(node.table){ showToast('表格請用右側「原始碼」面板編輯'); if(!mdPanelOpen) toggleMdPanel(true); highlightMdNode(node); return; }
  if(node.code!=null){ showToast('程式碼區塊請用右側「原始碼」面板編輯'); if(!mdPanelOpen) toggleMdPanel(true); highlightMdNode(node); return; }
  dom.classList.add('editing'); dom.contentEditable='true';
  // edit raw (with \n). Use innerText
  dom.innerText = node.title;
  const r=document.createRange(); r.selectNodeContents(dom);
  const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
  dom.focus(); editing=true;
  function commit(){
    const nextTitle=dom.innerText.replace(/ /g,' ').replace(/\n+$/,'');
    if(nextTitle!==node.title){ snapshot(); node.title=nextTitle; }
    dom.contentEditable='false'; dom.classList.remove('editing'); editing=false;
    dom.removeEventListener('blur',commit); dom.removeEventListener('keydown',key);
    render();
  }
  function key(e){
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); dom.blur(); }
    else if(e.key==='Escape'){ e.preventDefault(); dom.innerText=node.title; dom.blur(); }
    e.stopPropagation();
  }
  dom.addEventListener('blur',commit); dom.addEventListener('keydown',key);
}
function startEditNote(node, noteDom, originalValue){
  const original = arguments.length>=3 ? originalValue : node.note;
  let cancelled=false;
  noteDom.classList.add('editing'); noteDom.contentEditable='true';
  noteDom.innerText = original==null ? '' : String(original);
  const r=document.createRange(); r.selectNodeContents(noteDom);
  const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
  noteDom.focus(); editing=true;
  function restoreOriginal(){
    if(original==null) delete node.note;
    else node.note=String(original);
  }
  function commit(){
    if(cancelled){
      restoreOriginal();
      noteDom.contentEditable='false'; noteDom.classList.remove('editing'); editing=false;
      noteDom.removeEventListener('blur',commit); noteDom.removeEventListener('keydown',key);
      render(); return;
    }
    const raw=noteDom.innerText.replace(/ /g,' ').replace(/\n+$/,'');
    const next = raw.trim()==='' ? null : raw;
    const old = original==null ? null : String(original);
    if(next!==old){ restoreOriginal(); snapshot(); if(next==null) delete node.note; else node.note=next; }
    else restoreOriginal();
    noteDom.contentEditable='false'; noteDom.classList.remove('editing'); editing=false;
    noteDom.removeEventListener('blur',commit); noteDom.removeEventListener('keydown',key);
    render();
  }
  function key(e){
    if(e.key==='Enter'){
      e.preventDefault();
      if(e.ctrlKey||e.metaKey){ noteDom.blur(); }
      else {
        const s=window.getSelection();
        if(s.rangeCount){
          const r=s.getRangeAt(0); r.deleteContents();
          const br=document.createTextNode('\n'); r.insertNode(br);
          r.setStartAfter(br); r.setEndAfter(br); s.removeAllRanges(); s.addRange(r);
        } else document.execCommand && document.execCommand('insertText', false, '\n');
      }
    }
    else if(e.key==='Escape'){ e.preventDefault(); cancelled=true; noteDom.blur(); }
    e.stopPropagation();
  }
  noteDom.addEventListener('blur',commit); noteDom.addEventListener('keydown',key);
}
function editNodeNote(node){
  if(!node) return;
  const original = node.note;
  if(original==null) node.note='';
  selectOnly(node); render();
  const dom=canvas.querySelector(`.node[data-id="${node.id}"] .nnote`);
  if(dom) startEditNote(node, dom, original==null ? null : original);
}
function editSelectedNote(){ if(selected) editNodeNote(selected); }
function deleteNodeNote(node){
  if(!node || node.note==null) return;
  snapshot(); delete node.note; render();
}

function addChild(){ if(!selected) return; if(selected.kind==='hr'){ showToast('分隔線不能新增子節點'); return; } snapshot();
  const n=makeNode('新節點'); n.parent=selected; selected.collapsed=false; selected.children.push(n); selectOnly(n); render(); editSelected(); }
function addSibling(){ if(!selected) return;
  if(!selected.parent){ addRoot(); return; }      // 根的「同層」= 新增一個中心主題
  snapshot();
  const p=selected.parent; const i=p.children.indexOf(selected); const n=makeNode('新節點'); n.parent=p;
  p.children.splice(i+1,0,n); selectOnly(n); render(); editSelected(); }
// 新增父節點:在選取節點上方插入一層,選取節點變成它的子節點
function addParent(){ if(!selected) return; snapshot();
  const x=selected, n=makeNode('新節點');
  if(x.parent){ const p=x.parent; const i=p.children.indexOf(x); p.children.splice(i,1,n); n.parent=p; n.children=[x]; x.parent=n; }
  else { const i=roots.indexOf(x); n.parent=null; n.children=[x]; x.parent=n; if(i>=0) roots.splice(i,1,n); else roots.push(n); }
  selectOnly(n); render(); editSelected(); }
// 新增一個中心/根節點(獨立的心智圖)
function addRoot(){ snapshot();
  const n=makeNode('新中心主題');
  const i = selected ? roots.indexOf(rootOf(selected)) : -1;
  if(i>=0) roots.splice(i+1,0,n); else roots.push(n);
  selectOnly(n); render(); editSelected(); }
// 把選取節點提升為獨立的中心主題(脫離原父節點)
function detachToRoot(){
  const nodes = topLevelSelected(selection).filter(n=>n.parent);
  if(!nodes.length) return;
  snapshot();
  for(const n of nodes){ const p=n.parent; p.children.splice(p.children.indexOf(n),1); n.parent=null; roots.push(n); }
  selectOnly(nodes[nodes.length-1]); render();
}
function deleteNode(){
  const nodes = topLevelSelected(selection);   // 可整組刪除(含整個中心主題)
  if(!nodes.length) return;
  snapshot();
  let fallback=null;
  for(const n of nodes){
    if(n.parent){ const p=n.parent; const i=p.children.indexOf(n); if(i>=0){ p.children.splice(i,1); fallback=p; } }
    else { const i=roots.indexOf(n); if(i>=0){ roots.splice(i,1); fallback = roots[Math.min(i, roots.length-1)]||null; } }
  }
  selectOnly(fallback); render();
}
function editSelected(){ const dom=canvas.querySelector(`.node[data-id="${selected.id}"]`); if(dom) startEdit(selected,dom); }

