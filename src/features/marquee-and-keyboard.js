//===================== 框選(marquee) =====================
function startMarquee(e){ marq={sx:e.clientX, sy:e.clientY}; marqEl.style.display='block'; updateMarquee(e); }
function updateMarquee(e){
  const r=viewport.getBoundingClientRect();
  const x1=Math.min(marq.sx,e.clientX), y1=Math.min(marq.sy,e.clientY);
  const x2=Math.max(marq.sx,e.clientX), y2=Math.max(marq.sy,e.clientY);
  marqEl.style.left=(x1-r.left)+'px'; marqEl.style.top=(y1-r.top)+'px';
  marqEl.style.width=(x2-x1)+'px'; marqEl.style.height=(y2-y1)+'px';
}
function finishMarquee(e){
  marqEl.style.display='none';
  const box={l:Math.min(marq.sx,e.clientX), t:Math.min(marq.sy,e.clientY), r:Math.max(marq.sx,e.clientX), b:Math.max(marq.sy,e.clientY)};
  if(box.r-box.l<4 && box.b-box.t<4){ if(!e.shiftKey){ selectOnly(null); render(); } return; } // 視為點擊空白:取消選取
  canvas.querySelectorAll('.node').forEach(d=>{
    const q=d.getBoundingClientRect();
    if(q.left<box.r && q.right>box.l && q.top<box.b && q.bottom>box.t){
      const n=findByIdAll(d.dataset.id); if(n){ selection.add(n); selected=n; }
    }
  });
  render();
}
let _lastLinkOpen=0;
viewport.addEventListener('click', e=>{
  // 點腳註上標標記 → 跳到對應的腳註定義節點
  const fr=e.target.closest('sup.fnref');
  if(fr){ e.preventDefault(); e.stopPropagation(); jumpToFootnote(fr.dataset.fnid); return; }
  const a=e.target.closest('a.mlink'); if(!a) return;
  e.preventDefault(); e.stopPropagation();
  const now=Date.now(); if(now-_lastLinkOpen<400) return; _lastLinkOpen=now;  // 防雙擊重複開啟
  const href=safeLinkHref(a.getAttribute('href'));
  if(href) window.open(href, '_blank', 'noopener,noreferrer');
  else showToast('已阻擋不安全的連結');
});
function findFootnoteDef(fnid){
  for(const r of roots){ let found=null;
    (function walk(n){ if(found) return; if(n.fndef && n.fnid===fnid){ found=n; return; } for(const c of n.children) walk(c); })(r);
    if(found) return found; }
  return null;
}
function jumpToFootnote(fnid){
  const node=findFootnoteDef(fnid);
  if(!node){ showToast('找不到腳註 ['+fnid+'] 的定義'); return; }
  let p=node.parent; while(p){ if(p.collapsed) p.collapsed=false; p=p.parent; }   // 展開定義所在的收合分支
  selectOnly(node); render(); centerOn(node);
  showToast('已跳到腳註 ['+fnid+']');
}
viewport.addEventListener('dblclick', e=>{
  if(e.target.closest('a.mlink')) return;   // 連結上的雙擊不進入編輯
  if(e.target.closest('sup.fnref')) return; // 腳註標記上的雙擊不進入編輯(交給 click 跳轉)
  const noteDom=e.target.closest('.nnote');
  if(noteDom){
    const owner=noteDom.closest('.node'); if(!owner) return;
    const node=findByIdAll(owner.dataset.id); if(!node) return;
    selectOnly(node); refreshSelectionDom(); highlightMdNode(node);
    startEditNote(node, noteDom);
    return;
  }
  const nodeDom=e.target.closest('.node'); if(!nodeDom) return;
  const node=findByIdAll(nodeDom.dataset.id);
  selectOnly(node); refreshSelectionDom(); highlightMdNode(node);   // 輕量選取,不重繪(避免元素被換掉導致無法編輯)
  startEdit(node, nodeDom);
});
viewport.addEventListener('wheel', e=>{
  e.preventDefault();
  // 滾輪 = 縮放(以游標為中心);Shift+滾輪 = 水平平移
  if(e.shiftKey && !e.ctrlKey){ panX-=(e.deltaY||e.deltaX); applyTransform(); return; }
  const rect=viewport.getBoundingClientRect();
  const mx=e.clientX-rect.left, my=e.clientY-rect.top, old=scale;
  let dy=e.deltaY; if(e.deltaMode===1) dy*=16; else if(e.deltaMode===2) dy*=rect.height;
  const k = e.ctrlKey ? 0.01 : 0.0018;   // 觸控板捏合用較大係數;一般滑鼠滾輪較平滑
  scale=clampZoom(scale*Math.exp(-dy*k));
  panX=mx-(mx-panX)*(scale/old); panY=my-(my-panY)*(scale/old);
  applyTransform();
},{passive:false});

