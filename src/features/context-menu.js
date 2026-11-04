//===================== 搜尋(類 XMind) =====================
const searchBar=document.getElementById('searchBar');
const searchInput=document.getElementById('searchInput');
const searchCount=document.getElementById('searchCount');
const searchWrap=document.getElementById('searchWrap');
const searchHint=document.getElementById('searchHint');
const searchList=document.getElementById('searchList');
const searchWindowEl=document.getElementById('fwSearch');
let searchOpenedIds=new Set();
function setSearchWindowOpen(open){
  searchWindowEl.classList.toggle('search-open', !!open);
  searchWindowEl.setAttribute('aria-hidden', open?'false':'true');
}
function openSearch(){
  setSearchWindowOpen(true);
  searchWindowEl.classList.remove('collapsed');
  const collapse=searchWindowEl.querySelector('.fwcollapse');
  if(collapse){ collapse.textContent='–'; collapse.title='收合'; }
  searchBar.classList.add('show'); searchWrap.classList.add('show');
  sanitizeFloatWinPositions();
  searchInput.focus(); searchInput.select();
  if(searchInput.value) runSearch(searchInput.value, false); else updateSearchUI();
}
function refreshSearchDom(){ canvas.querySelectorAll('.node').forEach(d=>{
  d.classList.toggle('match', searchMatchIds.has(d.dataset.id));
  d.classList.toggle('match-current', d.dataset.id===currentMatchId);
}); }
function restoreSearchOpened(){ let changed=false;
  for(const id of searchOpenedIds){ const n=findByIdAll(id); if(n && !n.collapsed){ n.collapsed=true; changed=true; } }
  searchOpenedIds.clear(); return changed;
}
function closeSearch(){ searchBar.classList.remove('show'); searchWrap.classList.remove('show'); searchInput.value=''; setSearchWindowOpen(false); const changed=restoreSearchOpened(); clearSearch(); if(changed) scheduleRender(); else refreshSearchDom(); }
function clearSearch(){ searchMatches=[]; searchMatchIds=new Set(); searchIdx=-1; currentMatchId=null; updateSearchUI(); }
function searchNodePath(n){ const parts=[]; let p=n; while(p){ if(p.title) parts.push(String(p.title).split('\n')[0]); p=p.parent; } return parts.reverse().join(' / '); }
function updateSearchUI(){
  const q=(searchInput.value||'').trim();
  searchCount.textContent = searchMatches.length ? ((searchIdx+1)+'/'+searchMatches.length) : '0/0';
  clearTrustedHTML(searchList);
  if(!q){ searchHint.textContent='輸入文字搜尋節點'; return; }
  if(!searchMatches.length){
    searchHint.textContent='找不到符合的節點';
    const empty=document.createElement('div'); empty.className='searchEmpty'; empty.textContent='沒有搜尋結果';
    searchList.appendChild(empty); return;
  }
  searchHint.textContent=`找到 ${searchMatches.length} 個結果`;
  searchMatches.slice(0,50).forEach((n,i)=>{
    const b=document.createElement('button'); b.type='button'; b.className='searchItem'+(i===searchIdx?' active':'');
    b.dataset.index=String(i);
    const title=document.createElement('span'); title.textContent=(n.title||n.refdef&&n.refdef.raw||n.code||'空白節點').toString().replace(/\s+/g,' ').slice(0,70);
    const path=document.createElement('small'); path.textContent=searchNodePath(n);
    b.append(title,path);
    b.onclick=()=>{ searchIdx=i; currentMatchId=n.id; updateSearchUI(); focusMatch(); };
    searchList.appendChild(b);
  });
  if(searchMatches.length>50){
    const more=document.createElement('div'); more.className='searchEmpty'; more.textContent=`另有 ${searchMatches.length-50} 筆,請輸入更精準關鍵字`;
    searchList.appendChild(more);
  }
  const active=searchList.querySelector('.searchItem.active');
  if(active) active.scrollIntoView({block:'nearest'});
}
function nodeSearchText(n){
  const parts=[n.title,n.note,n.fnid];
  if(n.code!=null) parts.push(n.code,n.lang);
  if(n.alert) parts.push(n.alert);
  if(n.table){ parts.push(...n.table.header,...n.table.aligns); for(const r of n.table.rows) parts.push(...r); }
  return parts.filter(v=>v!=null).join('\n');
}
function runSearch(q, focusFirst){
  const query=(q||'').trim().toLowerCase();
  searchMatches=[];
  if(query && roots.length){ for(const r of roots) (function walk(n){ if(nodeSearchText(n).toLowerCase().includes(query)) searchMatches.push(n); for(const c of n.children) walk(c); })(r); }
  searchMatchIds=new Set(searchMatches.map(n=>n.id));
  searchIdx = searchMatches.length ? 0 : -1;
  currentMatchId = searchIdx>=0 ? searchMatches[0].id : null;
  updateSearchUI();
  if(focusFirst && searchIdx>=0) focusMatch(); else refreshSearchDom();
}
function focusMatch(){ const node=searchMatches[searchIdx]; if(!node) return;
  let p=node.parent; while(p){ if(p.collapsed){ searchOpenedIds.add(p.id); p.collapsed=false; } p=p.parent; }   // 暫時展開命中所在的收合分支
  selectOnly(node); render(); centerOn(node); }
function gotoMatch(delta){ if(!searchMatches.length) return;
  searchIdx=(searchIdx+delta+searchMatches.length)%searchMatches.length;
  currentMatchId=searchMatches[searchIdx].id; updateSearchUI(); focusMatch(); }
function centerOn(node){ const dx=canvas._dx||0, dy=canvas._dy||0;
  panX=viewport.clientWidth/2-(node._x+dx+node._w/2)*scale;
  panY=viewport.clientHeight/2-(node._y+dy)*scale; applyTransform(); }
searchInput.addEventListener('focus', ()=>{ searchBar.classList.add('show'); searchWrap.classList.add('show'); updateSearchUI(); });
searchInput.addEventListener('input', ()=>{ searchBar.classList.add('show'); searchWrap.classList.add('show'); runSearch(searchInput.value, false); });
searchInput.addEventListener('keydown', e=>{
  if(e.key==='Enter'){ e.preventDefault(); if(searchIdx<0) runSearch(searchInput.value, true); else gotoMatch(e.shiftKey?-1:1); }
  else if(e.key==='Escape'){ e.preventDefault(); closeSearch(); }
  e.stopPropagation();
});
document.getElementById('searchPrev').onclick=()=>gotoMatch(-1);
document.getElementById('searchNext').onclick=()=>gotoMatch(1);
document.getElementById('searchClose').onclick=closeSearch;

