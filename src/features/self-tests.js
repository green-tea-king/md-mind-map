//===================== 浮動工具視窗(拖曳 / 收合 / 記憶位置) =====================
const FW_KEY=STORAGE_KEYS.floatingWindows;   // 版號:工具視窗組成再變更(新增「清單」窗、文字窗加 S/🔗),重設一次排版
let fwPos=storageJsonGet(FW_KEY, {}, 'read floating window positions')||{};
function saveFwPos(){ storageJsonSet(FW_KEY, fwPos, 'save floating window positions'); }
let fwZ=100;
function clampFloatWinPosition(w, pos){
  const r=w.getBoundingClientRect();
  const ww=Math.max(46, Math.round(r.width||w.offsetWidth||46));
  const wh=Math.max(28, Math.round(r.height||w.offsetHeight||28));
  const maxLeft=Math.max(0, window.innerWidth-Math.min(46, ww));
  const maxTop=Math.max(0, window.innerHeight-Math.min(28, wh));
  return {
    left:Math.max(0, Math.min(Number(pos&&pos.left)||0, maxLeft)),
    top:Math.max(0, Math.min(Number(pos&&pos.top)||0, maxTop))
  };
}
function applyFloatWinPosition(w, pos){
  const next=clampFloatWinPosition(w, pos);
  w.style.left=next.left+'px';
  w.style.top=next.top+'px';
  return next;
}
function sanitizeFloatWinPositions(){
  let changed=false;
  for(const w of document.querySelectorAll('.floatwin')){
    if(!fwPos[w.id]) continue;
    const next=applyFloatWinPosition(w, fwPos[w.id]);
    if(next.left!==fwPos[w.id].left || next.top!==fwPos[w.id].top){
      fwPos[w.id]=next;
      changed=true;
    }
  }
  if(changed) saveFwPos();
  return changed;
}

const FLOAT_TOP=14, FLOAT_LEFT=14, FLOAT_GAP=14, FLOAT_ROW_GAP=10;
const FLOAT_ORDER=['fwBrand','fwSearch'];
// 預設排版:上方水平排列,同列 top 對齊;寬度不足時換到下一排。
// 使用者拖過的視窗(已記憶位置)則沿用,重設工具列會回到此排列。
function placeFloatWins(){
  let x=FLOAT_LEFT, y=FLOAT_TOP, rowH=0;
  const wins=FLOAT_ORDER.map(id=>document.getElementById(id)).filter(Boolean);
  for(const w of wins){
    if(fwPos[w.id]){ fwPos[w.id]=applyFloatWinPosition(w, fwPos[w.id]); continue; }
    const ww=w.offsetWidth, wh=w.offsetHeight;
    if(x>FLOAT_LEFT && x+ww>window.innerWidth-FLOAT_LEFT){
      x=FLOAT_LEFT;
      y+=rowH+FLOAT_ROW_GAP;
      rowH=0;
    }
    applyFloatWinPosition(w, {left:x, top:y});
    x+=ww+FLOAT_GAP;
    rowH=Math.max(rowH, wh);
  }
  saveFwPos();
}
// 拖曳(抓標題列;避開收合鈕)
(function(){ let d=null, cur=null;
  document.querySelectorAll('.fwhead').forEach(head=>{
    head.addEventListener('mousedown', e=>{
      if(e.target.closest('.fwcollapse')) return;
      cur=head.closest('.floatwin'); const r=cur.getBoundingClientRect();
      d={x:e.clientX, y:e.clientY, l:r.left, t:r.top}; cur.style.zIndex=++fwZ; e.preventDefault();
    });
  });
  window.addEventListener('mousemove', e=>{ if(!d) return;
    let nl=d.l+e.clientX-d.x, nt=d.t+e.clientY-d.y;
    nl=Math.max(0, Math.min(nl, window.innerWidth-46));
    nt=Math.max(0, Math.min(nt, window.innerHeight-28));
    cur.style.left=nl+'px'; cur.style.top=nt+'px';
  });
  window.addEventListener('mouseup', ()=>{ if(d&&cur){
    // 一次記住全部視窗位置,避免「部分記憶、部分自動」造成重疊
    document.querySelectorAll('.floatwin').forEach(w=>{ fwPos[w.id]={left:parseInt(w.style.left)||0, top:parseInt(w.style.top)||0}; });
    saveFwPos(); } d=null; cur=null; });
})();
// 收合
document.querySelectorAll('.fwcollapse').forEach(b=>{
  b.onclick=()=>{ const w=b.closest('.floatwin'); const c=w.classList.toggle('collapsed'); b.textContent=c?'＋':'–'; b.title=c?'展開':'收合'; };
});
// 還原工具列:清掉記憶位置與收合狀態,重新依預設排列
function resetFloatWins(){
  fwPos={}; storageRemove(FW_KEY, 'reset floating window positions');
  document.querySelectorAll('.floatwin').forEach(w=>{ w.classList.remove('collapsed'); w.style.removeProperty('z-index'); });
  document.querySelectorAll('.fwcollapse').forEach(b=>{ b.textContent='–'; b.title='收合'; });
  placeFloatWins();
}
// 淺色 / 深色 介面切換(預設跟隨系統,手動切換會記住)
function applyDark(on){ document.documentElement.classList.toggle('dark', on);
  const b=document.getElementById('btnDark'); if(b){ b.textContent = on ? '☀️ 淺色' : '🌙 深色'; b.title = on ? '切換為淺色介面' : '切換為深色介面'; }
  storageSet(STORAGE_KEYS.darkMode, on?'1':'0', 'save dark mode preference');
  if(typeof render==='function' && roots.length) render();   // 重新上色(中心色深淺隨介面)
}
function toggleDebugLayout(){
  debugLayout=!debugLayout;
  document.documentElement.classList.toggle('debug-on', debugLayout);
  render();
  showToast(debugLayout?'版面除錯已開啟':'版面除錯已關閉');
}
(function(){ let pref=storageGet(STORAGE_KEYS.darkMode, null, 'read dark mode preference');
  applyDark(pref==='1'); })();   // 預設淺色;使用者手動切換才記住深色
loadNodeWrapWidth();
placeFloatWins();
let _viewportRelayoutT=null;
function scheduleViewportRelayout(){
  clearTimeout(_viewportRelayoutT);
  _viewportRelayoutT=setTimeout(()=>{
    _viewportRelayoutT=null;
    if(roots.length) renderKeepingAnchor(selected||roots[0], true);
  }, 120);
}
window.addEventListener('resize', ()=>{ // 視窗縮小時把跑到畫面外的視窗拉回可見範圍,並重畫分支線
  sanitizeFloatWinPositions();
  scheduleViewportRelayout();
});
window.addEventListener('orientationchange', ()=>{ sanitizeFloatWinPositions(); scheduleViewportRelayout(); });
if(window.visualViewport) window.visualViewport.addEventListener('resize', ()=>{ sanitizeFloatWinPositions(); scheduleViewportRelayout(); });

