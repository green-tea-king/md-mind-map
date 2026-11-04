//===================== 滑鼠:選取 / 拖曳改掛載 / 平移 / 縮放 =====================
let editing=false;
let drag=null;   // {node, dom, sx, sy, moved, target}
let pan=null;    // {sx, sy, px, py}
let ghost=null;
let marq=null;
const marqEl=document.getElementById('marquee');
const guideEl=document.getElementById('guide');
const dropHintEl=document.getElementById('dropHint');
function refreshSelectionDom(){ const ids=new Set([...selection].map(n=>n.id));
  canvas.querySelectorAll('.node').forEach(d=>d.classList.toggle('sel', ids.has(d.dataset.id))); }
function clearDropTargets(){ canvas.querySelectorAll('.node.droptarget').forEach(d=>d.classList.remove('droptarget')); }
function draggableNodes(nodes){ return (nodes||[]).filter(Boolean); }
function canDragInto(nodes){ return (nodes||[]).filter(Boolean).length>0; }
function draggingOnlyHr(nodes){ const m=draggableNodes(nodes); return m.length>0 && m.every(n=>n.kind==='hr'); }
function siblingListOf(node){ return node && node.parent ? node.parent.children : roots; }
function detachDragNode(n){
  if(!n) return;
  if(n.parent){ const p=n.parent; const i=p.children.indexOf(n); if(i>=0) p.children.splice(i,1); }
  else { const i=roots.indexOf(n); if(i>=0) roots.splice(i,1); }
}
function moveNodesNearTarget(nodes, target, mode){
  const movers=draggableNodes(nodes).filter(n=>n && n!==target);
  const siblings=siblingListOf(target);
  if(!target || !siblings || !movers.length) return false;
  const parent=target.parent||null;
  const safeMovers=movers.filter(n=>!(parent && (n===parent || isDescendant(parent,n))));
  if(!safeMovers.length) return false;
  for(const n of safeMovers) detachDragNode(n);
  let idx=siblings.indexOf(target);
  if(idx<0) return false;
  if(mode==='after') idx+=1;
  siblings.splice(idx,0,...safeMovers);
  safeMovers.forEach(n=>n.parent=parent);
  return true;
}
function moveNodesIntoTarget(nodes, target){
  if(!target || !isBranchNode(target)) return false;
  const movers=draggableNodes(nodes).filter(n=>n && n!==target && !isDescendant(target,n));
  if(!movers.length) return false;
  for(const n of movers){ detachDragNode(n); n.parent=target; target.children.push(n); }
  target.collapsed=false;
  return true;
}
function makeHrNode(){
  const n=makeNode('---');
  n.kind='hr';
  n.hrRule='manual';
  n.hrReason='右鍵選單手動插入的 Markdown 水平分隔線';
  return n;
}
function insertHrNearNodeData(target, mode){
  if(!target || (mode!=='before' && mode!=='after')) return false;
  const siblings=siblingListOf(target);
  if(!siblings) return false;
  const idx=siblings.indexOf(target);
  if(idx<0) return false;
  const hr=makeHrNode();
  hr.parent=target.parent||null;
  siblings.splice(mode==='before' ? idx : idx+1, 0, hr);
  return hr;
}
function insertHrNearNode(target, mode){
  snapshot();
  const hr=insertHrNearNodeData(target, mode);
  if(!hr) return false;
  selectOnly(hr);
  render();
  centerOn(hr);
  showToast(mode==='before' ? '已在上方插入分隔線' : '已在下方插入分隔線');
  return true;
}
function pickDropModeForTarget(movers, target, rel){
  const list=siblingListOf(target), parent=target&&target.parent||null;
  const canSib = !!(list && target && !draggableNodes(movers).some(m=> parent && (m===parent || isDescendant(parent, m))));
  if(draggingOnlyHr(movers) && canSib) return rel<0.5 ? 'before' : 'after';
  if(canSib && rel<0.30) return 'before';
  if(canSib && rel>0.70) return 'after';
  if(canDragInto(movers)) return 'into';
  return null;
}
function pickHrTrailingChildDropTarget(movers, clientX, clientY){
  if(!draggingOnlyHr(movers)) return null;
  const moverIds=new Set(draggableNodes(movers).map(n=>n.id));
  let best=null;
  function visit(n){
    if(!n || moverIds.has(n.id)) return;
    const ch=branchChildren(n);
    if(ch.length){
      const last=ch[ch.length-1];
      if(last && !moverIds.has(last.id)){
        const dom=canvas.querySelector(`.node[data-id="${last.id}"]`);
        if(dom){
          const r=dom.getBoundingClientRect();
          let laneGap, afterGap, crossGap=0;
          if(orient==='h'){
            laneGap=Math.abs(clientX-r.left);
            afterGap=clientY-r.bottom;
            const right=r.right+280;
            crossGap=clientX>right ? clientX-right : 0;
          } else {
            laneGap=Math.abs(clientY-r.top);
            afterGap=clientX-r.right;
            const bottom=r.bottom+280;
            crossGap=clientY>bottom ? clientY-bottom : 0;
          }
          if(afterGap>=-2 && afterGap<=90 && laneGap<=120 && crossGap<=260){
            const score=afterGap + laneGap*0.35 + crossGap*0.45;
            if(!best || score<best.score) best={target:last, mode:'after', score};
          }
        }
      }
    }
    for(const c of branchChildren(n)) visit(c);
  }
  for(const r of roots) visit(r);
  return best ? {target:best.target, mode:best.mode} : null;
}
function pickHrGapDropTarget(movers, clientX, clientY){
  if(!draggingOnlyHr(movers)) return null;
  const moverIds=new Set(draggableNodes(movers).map(n=>n.id));
  const candidates=[];
  canvas.querySelectorAll('.node').forEach(dom=>{
    if(moverIds.has(dom.dataset.id)) return;
    const target=findByIdAll(dom.dataset.id);
    if(!target || !isBranchNode(target)) return;
    const list=siblingListOf(target), parent=target.parent||null;
    if(!list) return;
    if(draggableNodes(movers).some(m=> parent && (m===parent || isDescendant(parent,m)))) return;
    const r=dom.getBoundingClientRect();
    if(r.width<1 || r.height<1) return;
    let mode, mainGap, crossGap, laneGap;
    if(orient==='h'){
      mode = clientY < (r.top+r.bottom)/2 ? 'before' : 'after';
      mainGap = Math.abs(clientY - (mode==='before' ? r.top : r.bottom));
      laneGap = Math.abs(clientX - r.left);
      const left=r.left-96, right=r.right+260;
      crossGap = clientX<left ? left-clientX : (clientX>right ? clientX-right : 0);
    } else {
      mode = clientX < (r.left+r.right)/2 ? 'before' : 'after';
      mainGap = Math.abs(clientX - (mode==='before' ? r.left : r.right));
      laneGap = Math.abs(clientY - r.top);
      const top=r.top-96, bottom=r.bottom+260;
      crossGap = clientY<top ? top-clientY : (clientY>bottom ? clientY-bottom : 0);
    }
    if(mainGap>88 || crossGap>360) return;
    candidates.push({target, mode, mainGap, crossGap, laneGap});
  });
  if(!candidates.length) return null;
  const minLane=Math.min(...candidates.map(c=>c.laneGap));
  let best=null;
  candidates.filter(c=>c.laneGap<=minLane+14).forEach(c=>{
    const score=c.mainGap + c.crossGap*0.45 + c.laneGap*0.25;
    if(!best || score<best.score) best={target:c.target, mode:c.mode, score};
  });
  return best ? {target:best.target, mode:best.mode} : null;
}
function runDragRuleSelfTest(){
  const savedRoots=roots;
  try{
    const rootA=makeNode('Root A'), rootB=makeNode('Root B'), a1=makeNode('A1'), a2=makeNode('A2'), a3=makeNode('A3');
    const hrRoot=makeNode('---'); hrRoot.kind='hr';
    const hrChild=makeNode('---'); hrChild.kind='hr';
    rootA.children=[a1,a2,a3]; a1.parent=rootA; a2.parent=rootA; a3.parent=rootA;
    roots=[rootA,hrRoot,rootB]; setParents(rootA,null); setParents(rootB,null); hrRoot.parent=null;
    const okRootBefore=moveNodesNearTarget([hrRoot], rootB, 'before') && roots.indexOf(hrRoot)===roots.indexOf(rootB)-1 && !hrRoot.parent;
    const okInto=canDragInto([hrChild]) && moveNodesIntoTarget([hrChild], a2) && hrChild.parent===a2 && a2.children.includes(hrChild) && hrChild.children.length===0;
    const okAfter=moveNodesNearTarget([hrChild], a3, 'after') && hrChild.parent===rootA && rootA.children.indexOf(hrChild)===rootA.children.indexOf(a3)+1;
    const okHrDropZone=pickDropModeForTarget([hrChild], a2, 0.49)==='before' && pickDropModeForTarget([hrChild], a2, 0.51)==='after';
    const beforeCount=rootA.children.filter(n=>n.kind==='hr').length;
    const okManualBefore=insertHrNearNodeData(a2,'before') && rootA.children[rootA.children.indexOf(a2)-1].kind==='hr' && rootA.children[rootA.children.indexOf(a2)-1].parent===rootA;
    const okManualAfter=insertHrNearNodeData(a2,'after') && rootA.children[rootA.children.indexOf(a2)+1].kind==='hr' && rootA.children[rootA.children.indexOf(a2)+1].parent===rootA;
    const okManualCount=rootA.children.filter(n=>n.kind==='hr').length===beforeCount+2;
    const badHr=makeHrNode(); badHr.children=[makeNode('bad child')]; setParents(badHr, rootA);
    const okHrChildrenCleared=badHr.children.length===0;
    const okNoHrParent=!isBranchNode(hrChild);
    return {ok:!!(okRootBefore && okInto && okAfter && okHrDropZone && okManualBefore && okManualAfter && okManualCount && okHrChildrenCleared && okNoHrParent), okRootBefore, okInto, okAfter, okHrDropZone, okManualBefore, okManualAfter, okManualCount, okHrChildrenCleared, okNoHrParent};
  }catch(e){
    return {ok:false, error:String(e&&e.message||e)};
  }finally{
    roots=savedRoots;
  }
}
window.runMindMapDragRuleSelfTest=runDragRuleSelfTest;
function runHrPositionSelfTest(options={}){
  const checks=[]; const add=(name, ok, detail='')=>checks.push({name, ok:!!ok, detail:String(detail||'')});
  const savedRoots=roots, savedSelectedId=selected&&selected.id, savedSelectionIds=[...selection].map(n=>n.id);
  const savedScale=scale, savedPanX=panX, savedPanY=panY, savedOrient=orient;
  try{
    roots=parseMarkdown(`# 分隔線位置自檢
- 第一段
---
- 第二段
## 第二層
- A
---
- B
### 第三層
- C
---
- D
`);
    roots.forEach(r=>setParents(r,null));
    selected=roots[0]; selection=new Set([selected]);
    render();
    add('固定上下順序方向', orient==='h', orient);
    function checkBetween(parent, beforeTitle, afterTitle, label){
      const ch=parent.children||[];
      const bi=ch.findIndex(n=>n.title===beforeTitle);
      const ai=ch.findIndex(n=>n.title===afterTitle);
      const hi=ch.findIndex((n,i)=>n.kind==='hr' && i>bi && i<ai);
      const before=ch[bi], hr=ch[hi], after=ch[ai];
      const bd=before&&canvas.querySelector(`.node[data-id="${before.id}"]`);
      const hd=hr&&canvas.querySelector(`.node[data-id="${hr.id}"]`);
      const ad=after&&canvas.querySelector(`.node[data-id="${after.id}"]`);
      if(!(bd&&hd&&ad)){ add(label, false, `missing dom bi=${bi} hi=${hi} ai=${ai}`); return; }
      const by=bd.offsetTop+bd.offsetHeight, hy=hd.offsetTop+hd.offsetHeight/2, ay=ad.offsetTop;
      add(label, by <= hy && hy <= ay, `beforeBottom=${Math.round(by)}, hr=${Math.round(hy)}, afterTop=${Math.round(ay)}`);
    }
    const root=roots[0];
    const h2=root.children.find(n=>n.title==='第二層');
    const h3=h2 && h2.children.find(n=>n.title==='第三層');
    checkBetween(root, '第一段', '第二段', '頂層內容分隔線位於前後段落之間');
    if(h2) checkBetween(h2, 'A', 'B', '第二層分隔線位於前後段落之間'); else add('第二層分隔線位於前後段落之間', false, 'missing h2');
    if(h3) checkBetween(h3, 'C', 'D', '第三層分隔線位於前後段落之間'); else add('第三層分隔線位於前後段落之間', false, 'missing h3');
    const exported=toMarkdown(roots);
    add('匯出仍保留三條分隔線', (exported.match(/^---$/gm)||[]).length>=3, exported);
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `分隔線位置自檢通過:${result.passed}/${checks.length}` : `分隔線位置自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    logCaught(e,'horizontal rule position self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'分隔線位置自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('分隔線位置自檢執行失敗');
    return result;
  }finally{
    roots=savedRoots; scale=savedScale; panX=savedPanX; panY=savedPanY; orient=savedOrient;
    roots.forEach(r=>setParents(r,null));
    selection=new Set();
    savedSelectionIds.forEach(id=>{ const n=findByIdAll(id); if(n) selection.add(n); });
    selected=savedSelectedId ? findByIdAll(savedSelectedId) : null;
    if(!selected && selection.size) selected=[...selection][0];
    try{ render(); applyTransform(); }catch(e){ logCaught(e,'restore after hr position self test'); }
  }
}
window.runMindMapHrPositionSelfTest=runHrPositionSelfTest;
function vrect(dom){ const r=dom.getBoundingClientRect(), v=viewport.getBoundingClientRect();
  return {left:r.left-v.left, top:r.top-v.top, right:r.right-v.left, bottom:r.bottom-v.top,
    cx:r.left-v.left+r.width/2, cy:r.top-v.top+r.height/2}; }
function dropTargetLabel(target){
  if(!target) return '';
  if(target.kind==='hr') return '分隔線';
  const raw=(target.title||target.note||'').split('\n')[0].trim();
  return raw ? raw.replace(/\s+/g,' ').slice(0,24) : '空白節點';
}
function dropHintText(mode, target, movers){
  const name=dropTargetLabel(target);
  if(mode==='into') return `移入「${name}」子節點`;
  const side=mode==='before' ? '上方' : '下方';
  if(draggingOnlyHr(movers||[])) return `水平線會放在「${name}」${side}`;
  return `插入到「${name}」${side}`;
}
// 引導線:從預定父節點連到插入位置,並標出順序棒
function drawGuide(mode, target){
  const tdom=canvas.querySelector(`.node[data-id="${target.id}"]`); if(!tdom){ clearGuide(); return; }
  guideEl.setAttribute('width', viewport.clientWidth); guideEl.setAttribute('height', viewport.clientHeight);
  let path, bar, dot;
  if(orient==='h'){
    let px,py,iy,barL,barR;
    if(mode==='into'){                     // 變成 target 的子節點(接在最後)
      const pr=vrect(tdom); px=pr.right; py=pr.cy;
      const vis = branchChildren(target);
      if(vis.length){ const lc=canvas.querySelector(`.node[data-id="${vis[vis.length-1].id}"]`);
        if(lc){ const lr=vrect(lc); iy=lr.bottom+7; barL=lr.left; barR=lr.right; } else { iy=pr.cy; barL=pr.right+34; barR=barL+56; } }
      else { iy=pr.cy; barL=pr.right+34; barR=barL+56; }
    } else {                               // 插在 target 的前/後(同層換順序)
      const pdom=target.parent ? canvas.querySelector(`.node[data-id="${target.parent.id}"]`) : null;
      const pr=pdom ? vrect(pdom) : null, tr=vrect(tdom); px=pr ? pr.right : tr.left-34; py=pr ? pr.cy : tr.cy;
      iy = (mode==='before') ? tr.top-4 : tr.bottom+4; barL=tr.left; barR=tr.right;
    }
    const mx=(px+barL)/2;
    path=`M ${px} ${py} C ${mx} ${py}, ${mx} ${iy}, ${barL} ${iy}`;
    bar=`<line x1="${barL}" y1="${iy}" x2="${barR}" y2="${iy}" stroke="#2f6fed" stroke-width="4" stroke-linecap="round"/>`;
    dot=`<circle cx="${barL}" cy="${iy}" r="4.5" fill="#2f6fed"/>`;
  } else {
    let px,py,ix,barT,barB;
    if(mode==='into'){                     // 變成 target 的子節點(接在最右)
      const pr=vrect(tdom); px=pr.cx; py=pr.bottom;
      const vis = branchChildren(target);
      if(vis.length){ const lc=canvas.querySelector(`.node[data-id="${vis[vis.length-1].id}"]`);
        if(lc){ const lr=vrect(lc); ix=lr.right+7; barT=lr.top; barB=lr.bottom; } else { ix=pr.cx; barT=pr.bottom+34; barB=barT+56; } }
      else { ix=pr.cx; barT=pr.bottom+34; barB=barT+56; }
    } else {                               // 插在 target 的左/右(同層換順序)
      const pdom=target.parent ? canvas.querySelector(`.node[data-id="${target.parent.id}"]`) : null;
      const pr=pdom ? vrect(pdom) : null, tr=vrect(tdom); px=pr ? pr.cx : tr.cx; py=pr ? pr.bottom : tr.top-34;
      ix = (mode==='before') ? tr.left-4 : tr.right+4; barT=tr.top; barB=tr.bottom;
    }
    const my=(py+barT)/2;
    path=`M ${px} ${py} C ${px} ${my}, ${ix} ${my}, ${ix} ${barT}`;
    bar=`<line x1="${ix}" y1="${barT}" x2="${ix}" y2="${barB}" stroke="#2f6fed" stroke-width="4" stroke-linecap="round"/>`;
    dot=`<circle cx="${ix}" cy="${barT}" r="4.5" fill="#2f6fed"/>`;
  }
  setTrustedHTML(guideEl,
    `<path d="${path}" fill="none" stroke="#2f6fed" stroke-width="2.5" stroke-dasharray="6,4"/>`+ bar + dot,
    'drag guide svg');
  guideEl.style.display='block';
  const tr=tdom.getBoundingClientRect(), vr=viewport.getBoundingClientRect();
  const movers=drag && (drag.movers||[drag.node]);
  dropHintEl.textContent=dropHintText(mode, target, movers);
  dropHintEl.style.left=(tr.left-vr.left+tr.width/2)+'px'; dropHintEl.style.top=(tr.top-vr.top)+'px'; dropHintEl.style.display='block';
}
function clearGuide(){ clearTrustedHTML(guideEl); guideEl.style.display='none'; dropHintEl.style.display='none'; }
function findHrHitNodeDom(clientX, clientY){
  let best=null, bestDist=Infinity;
  const padY=Math.max(14, 20*scale), padX=10;
  canvas.querySelectorAll('.node.hrnode').forEach(dom=>{
    const r=dom.getBoundingClientRect();
    if(clientX<r.left-padX || clientX>r.right+padX || clientY<r.top-padY || clientY>r.bottom+padY) return;
    const cy=r.top+r.height/2;
    const dist=Math.abs(clientY-cy);
    if(dist<bestDist){ best=dom; bestDist=dist; }
  });
  return best;
}

viewport.addEventListener('mousedown', e=>{
  if(e.button!==0) return;
  // 點連結(無修飾鍵)→ 交給 click 開啟,不進入選取/拖曳
  if(e.target.closest('a.mlink') && !e.shiftKey && !e.ctrlKey && !e.metaKey) return;
  if(e.target.closest('sup.fnref')) return;   // 點腳註標記交給 click 跳轉,不拖曳
  const nodeDom = e.target.closest('.node') || findHrHitNodeDom(e.clientX, e.clientY);
  if(nodeDom && !editing){
    const node = findByIdAll(nodeDom.dataset.id);
    if(e.ctrlKey||e.metaKey){ toggleSelect(node); }      // 加選/取消
    else if(e.shiftKey){ addSelect(node); }              // 加入
    else if(node && node.kind==='hr'){ selectOnly(node); } // 分隔線拖曳一律單獨搬移,避免多選殘留造成落點無效
    else if(!selection.has(node)){ selectOnly(node); }   // 一般點擊 → 單選
    else { selected = node; }                            // 點已選的多選成員 → 保留群組、設為主節點
    refreshSelectionDom(); highlightMdNode(selected);                               // 輕量更新,不重繪(保留 DOM 讓雙擊/拖曳正常)
    drag = {node, dom:nodeDom, sx:e.clientX, sy:e.clientY, moved:false, target:null};
    e.preventDefault();
  } else if(!editing){
    if(e.shiftKey){ startMarquee(e); }                   // Shift+拖背景 = 框選
    else { pan = {sx:e.clientX, sy:e.clientY, px:panX, py:panY, moved:false}; viewport.classList.add('panning'); }
  }
});
viewport.addEventListener('focusin', e=>{
  const nodeDom=e.target&&e.target.closest&&e.target.closest('.node');
  if(!nodeDom || editing) return;
  const node=findByIdAll(nodeDom.dataset.id);
  if(node && (node!==selected || selection.size!==1)){
    selectOnly(node);
    refreshSelectionDom();
    highlightMdNode(node);
  }
});
window.addEventListener('mousemove', e=>{
  if(marq){ updateMarquee(e); return; }
  if(drag){
    if(!drag.moved && Math.hypot(e.clientX-drag.sx, e.clientY-drag.sy)>4){
      drag.moved=true;
      // 拖的是多選成員 → 整組移動;否則單一
      drag.movers = draggableNodes((selection.has(drag.node) && selection.size>1) ? topLevelSelected(selection) : [drag.node]);
      if(!drag.movers.length){ drag=null; return; }
      const ids=new Set(drag.movers.map(n=>n.id));
      ghost=document.createElement('div'); ghost.className='dragghost-layer';
      canvas.querySelectorAll('.node').forEach(d=>{
        if(ids.has(d.dataset.id)){
          d.classList.add('dragging'); d.style.pointerEvents='none';
          const r=d.getBoundingClientRect();
          const cl=d.cloneNode(true);
          cl.querySelectorAll('.toggle').forEach(t=>t.remove());
          cl.classList.add('ghostnode'); cl.classList.remove('dragging','sel','match','match-current');
          // 用精確的未縮放尺寸,避免取整造成文字重新折行(變形)
          cl.style.left=r.left+'px'; cl.style.top=r.top+'px';
          cl.style.width=(r.width/scale)+'px'; cl.style.maxWidth='none';
          cl.style.transform=`scale(${scale})`; cl.style.transformOrigin='top left';
          ghost.appendChild(cl);
        }
      });
      document.body.appendChild(ghost);
      drag.gx=e.clientX; drag.gy=e.clientY;
    }
    if(drag.moved){
      ghost.style.transform=`translate(${e.clientX-drag.gx}px, ${e.clientY-drag.gy}px)`;
      clearDropTargets(); clearGuide();
      drag.target=null; drag.dropMode=null;
      const el=document.elementFromPoint(e.clientX,e.clientY);
      const tgtDom=el && el.closest('.node');
      const movers=drag.movers||[drag.node];
      if(draggingOnlyHr(movers)){
        const gap=pickHrTrailingChildDropTarget(movers, e.clientX, e.clientY) || pickHrGapDropTarget(movers, e.clientX, e.clientY);
        if(gap){ drag.dropMode=gap.mode; drag.target=gap.target; drawGuide(gap.mode,gap.target); }
      }
      if(!drag.target && tgtDom){
        const tgt=findByIdAll(tgtDom.dataset.id);
        if(tgt && isBranchNode(tgt) && !movers.includes(tgt) && !movers.some(m=>isDescendant(tgt,m))){
          const q=tgtDom.getBoundingClientRect();
          const rel = orient==='h' ? (e.clientY-q.top)/q.height : (e.clientX-q.left)/q.width;
          const mode=pickDropModeForTarget(movers,tgt,rel);
          if(mode){ drag.dropMode=mode; drag.target=tgt; if(mode==='into') tgtDom.classList.add('droptarget'); drawGuide(mode,tgt); }
        }
      }
    }
  } else if(pan){
    if(Math.hypot(e.clientX-pan.sx, e.clientY-pan.sy)>3) pan.moved=true;
    panX = pan.px + (e.clientX-pan.sx);
    panY = pan.py + (e.clientY-pan.sy);
    applyTransform();
  }
});
window.addEventListener('mouseup', e=>{
  if(marq){ finishMarquee(e); marq=null; return; }
  if(drag){
    if(ghost){ ghost.remove(); ghost=null; }
    clearDropTargets(); clearGuide();
    canvas.querySelectorAll('.node.dragging').forEach(d=>{ d.classList.remove('dragging'); d.style.pointerEvents=''; });
    let changed=false;
    if(drag.moved && drag.target && drag.dropMode){
      if(drag.dropMode==='into'){
        const movers = draggableNodes(drag.movers||[drag.node]).filter(n=> n!==drag.target && !isDescendant(drag.target, n));
        if(movers.length){
          snapshot();
          changed=moveNodesIntoTarget(movers, drag.target);
        }
      } else {  // before / after:插入成同層,換順序
        const movers = draggableNodes(drag.movers||[drag.node]);
        if(movers.length){
          snapshot();
          changed=moveNodesNearTarget(movers, drag.target, drag.dropMode);
        }
      }
    } else if(drag.moved && !drag.target){
      // 拖到空白處(沒落在任何節點上)→ 脫離成獨立中心(根)
      const overEl=document.elementFromPoint(e.clientX, e.clientY);
      if(!(overEl && overEl.closest('.node'))){
        const movers=draggableNodes(drag.movers||[drag.node]).filter(n=> n.parent);
        if(movers.length){
          snapshot();
          for(const n of movers){ detachDragNode(n); n.parent=null; roots.push(n); }
          changed=true;
        }
      }
    }
    drag=null;
    if(changed){ render(); showToast('節點位置已更新'); }   // 只有改掛載才重繪;純點擊不重繪 → 保留 DOM 讓雙擊能正常觸發編輯
  }
  if(pan && !pan.moved){ selectOnly(null); render(); }   // 點空白處 → 取消選取
  pan=null; viewport.classList.remove('panning');
});

