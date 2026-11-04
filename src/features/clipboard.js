//===================== 複製 / 剪下 / 貼上 =====================
let clipboard=null;   // 內部節點剪貼簿(node 樹陣列)
function cloneFresh(node){ const n=makeNode(node.title); n.note=node.note; n.kind=node.kind; n.hlevel=node.hlevel; n.fndef=node.fndef; n.fnid=node.fnid; n.alert=node.alert; n.refdef=node.refdef?{...node.refdef}:undefined; n.htmlRaw=node.htmlRaw; n.quoteRaw=node.quoteRaw; n.orderedNum=node.orderedNum; n.orderedMarker=node.orderedMarker; n.fill=node.fill; n.border=node.border; n.text=node.text; n.icon=node.icon; n.checked=node.checked; n.ordered=node.ordered; n.quote=node.quote; n.table=node.table?{header:[...node.table.header],aligns:[...node.table.aligns],rows:node.table.rows.map(r=>[...r])}:undefined; n.code=node.code; n.lang=node.lang; n.codeFence=node.codeFence; n.collapsed=node.collapsed;
  n.children=node.children.map(cloneFresh); n.children.forEach(c=>c.parent=n); return n; }
function copySelection(){ const tops=topLevelSelected(selection); if(!tops.length) return false; clipboard=tops.map(cloneFresh);
  showToast(`已複製 ${tops.length} 個節點`); return true; }
function cutSelection(){ if(copySelection()) deleteNode(); }
function insertSameLevelAfter(target, nodes){
  if(!nodes||!nodes.length) return [];
  if(target && target.parent){
    const p=target.parent, i=p.children.indexOf(target);
    for(const n of nodes) n.parent=p;
    p.children.splice(i>=0?i+1:p.children.length, 0, ...nodes);
  } else {
    const i=target ? roots.indexOf(target) : -1;
    for(const n of nodes) n.parent=null;
    roots.splice(i>=0?i+1:roots.length, 0, ...nodes);
  }
  return nodes;
}
function pasteClipboard(){ if(!clipboard||!clipboard.length) return;
  snapshot(); const added=insertSameLevelAfter(selected, clipboard.map(cloneFresh));
  selection=new Set(added); selected=added[added.length-1]; render(); }
async function pasteFromSystem(){
  try{ const t=await navigator.clipboard.readText();
    const lines=(t||'').split(/\r?\n/).map(s=>s.replace(/^[\s\-*•·]+/,'').trim()).filter(Boolean);
    if(!lines.length) return;
    snapshot(); const added=insertSameLevelAfter(selected, lines.map(l=>makeNode(l)));
    selection=new Set(added); selected=added[added.length-1]; render();
  }catch(e){ logCaught(e,'read system clipboard'); setStatusMessage('無法讀取系統剪貼簿(請先用本工具複製節點)','warn',5200); }
}
function pasteAny(){ if(clipboard&&clipboard.length) pasteClipboard(); else pasteFromSystem(); }
function setAllCollapsed(val){ if(!roots.length) return; snapshot();
  searchOpenedIds.clear();
  for(const r of roots) (function w(n,depth){ if(depth>0 && hasBranchChildren(n)) n.collapsed=val; for(const c of n.children) w(c,depth+1); })(r,0);
  render(); }
function toggleNodeCollapsed(node){ if(!node||!hasBranchChildren(node)) return;
  searchOpenedIds.delete(node.id); snapshot(); node.collapsed=!node.collapsed; renderKeepingAnchor(node);
}

