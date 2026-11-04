//===================== 繪製 =====================
const viewport = document.getElementById('viewport');
const canvas = document.getElementById('canvas');
const svg = document.getElementById('edges');
const debugGuideEl = document.getElementById('debugGuide');
const statusEl = document.getElementById('status');
const emptyEl = document.getElementById('empty');
const toastEl = document.getElementById('toast');
let toastTimer=null;
const STATUS_HELP_TEXT='右鍵叫出選單(全部功能在這) · 雙擊編輯 · 拖節點換掛載/順序 · 滾輪縮放 · 拖背景平移 · Shift+滾輪水平捲動';
let statusSummary='', statusMessage='', statusLevel='';
function renderStatusBar(){
  if(!statusEl) return;
  statusEl.classList.toggle('info', statusLevel==='info');
  statusEl.classList.toggle('warn', statusLevel==='warn');
  statusEl.classList.toggle('error', statusLevel==='error');
  clearTrustedHTML(statusEl);
  const parts=[
    ['status-main', statusSummary||'沒有內容'],
    ['status-help', STATUS_HELP_TEXT],
    ['status-msg', statusMessage]
  ];
  for(const [cls,text] of parts){
    if(!text) continue;
    const sp=document.createElement('span');
    sp.className=cls;
    sp.textContent=text;
    statusEl.appendChild(sp);
  }
}
function setStatusSummary(text){ statusSummary=String(text||''); renderStatusBar(); }
function setStatusMessage(text, level='info', ttl=2600){
  statusMessage=String(text||'');
  statusLevel=level||'info';
  renderStatusBar();
  clearTimeout(toastTimer);
  if(ttl>0) toastTimer=setTimeout(()=>{ statusMessage=''; statusLevel=''; renderStatusBar(); }, ttl);
}
let edgeFlowRaf=null, edgeFlowStart=0;
function ensureEdgeFlow(){
  if(edgeFlowRaf) return;
  const step=t=>{
    if(!edgeFlowStart) edgeFlowStart=t;
    const off=-((t-edgeFlowStart)/1000*8 % 12);
    svg.querySelectorAll('path.edge-flow').forEach(p=>p.setAttribute('stroke-dashoffset', off.toFixed(2)));
    edgeFlowRaf=requestAnimationFrame(step);
  };
  edgeFlowRaf=requestAnimationFrame(step);
}
function showToast(msg){ if(!msg) return; toastEl.textContent=msg; setStatusMessage(msg,'info',2600); }

function render(){
  rebuildRefDefsFromRoots();
  const oldPos=new Map([...canvas.querySelectorAll('.node')].map(d=>[d.dataset.id,{x:d.offsetLeft,y:d.offsetTop}]));
  emptyEl.style.display = roots.length ? 'none' : 'flex';
  // remove old node divs + toggles (keep svg)
  [...canvas.querySelectorAll('.node, .toggle')].forEach(e=>e.remove());
  clearTrustedHTML(svg);
  if(!roots.length){ applyTransform(); setStatusSummary('沒有內容'); refreshMdPanel(mdTextDriven); refreshSaveState(); return; }
  canvas.classList.toggle('vert', orient==='v');
  // 顏色純由 Vivid 配色即時套用(視覺辨識用,不存檔);新節點也會自動上色
  for(const r of roots) colorizeTheme(r, VIVID_THEME);

  // 收集每個根的可見節點;list = 全部節點(供建立 DOM / 連線 / 開關鈕)
  const groups = roots.map(r=>({root:r, list:measure(r)}));
  const list = [];
  for(const g of groups) for(const it of g.list) list.push(it);
  // 1) create + measure
  for(const it of list){
    const d = document.createElement('div');
    d.className = 'node lv' + Math.min(it.depth,6) + (it.depth<=2 ? (' d'+it.depth) : '');
    d.dataset.id = it.node.id;
    const n = it.node;
    d.tabIndex=0;
    d.setAttribute('role','button');
    d.setAttribute('aria-selected', selection.has(n)?'true':'false');
    d.setAttribute('aria-label', nodeAriaLabel(n));
    if(n.kind==='preamble') d.classList.add('preamble');
    if(n.quote) d.classList.add('quote');   // 引用塊樣式
    if(n.fndef){ d.classList.add('fndef'); d.dataset.fnid=n.fnid;   // 腳註定義節點
      const fl=document.createElement('span'); fl.className='fnlabel'; fl.textContent='[腳註 '+n.fnid+']'; d.appendChild(fl); }
    // 有序清單序號(顯示在同層中的位置)
    if(n.ordered){ const i=(n.orderedNum!=null?n.orderedNum:(n.parent?n.parent.children.indexOf(n):0)+1);
      const od=document.createElement('span'); od.className='norder'; od.textContent=i+(n.orderedMarker||'.'); d.appendChild(od); }
    // checkbox(待辦)
    if(n.checked!==undefined){
      const cb=document.createElement('span'); cb.className='ckbox'+(n.checked?' on':''); cb.textContent=n.checked?'☑':'☐';
      cb.addEventListener('mousedown',ev=>ev.stopPropagation());
      cb.addEventListener('click',ev=>{ ev.stopPropagation(); snapshot(); n.checked=!n.checked; render(); });
      d.appendChild(cb);
    }
    // icon(圖示)
    if(n.icon){ const ic=document.createElement('span'); ic.className='nicon'; ic.textContent=n.icon; d.appendChild(ic); }
    // title / 表格
    const tx=document.createElement('span'); tx.className='ntext';
    if(n.refdef){ tx.textContent = refDefDisplayText(n.refdef); }
    else if(n.alert){
      const TYPE={NOTE:'📘 NOTE',TIP:'💡 TIP',IMPORTANT:'❗ IMPORTANT',WARNING:'⚠️ WARNING',CAUTION:'🛑 CAUTION'};
      d.classList.add('alert', n.alert.toLowerCase());
      const ti=document.createElement('span'); ti.className='altitle'; ti.textContent=TYPE[n.alert]||('📘 '+n.alert);
      const bd=document.createElement('span'); bd.className='albody'; setTrustedHTML(bd, n.title? inlineMd(n.title):' ', 'alert body');
      tx.appendChild(ti); tx.appendChild(bd);
    }
    else if(n.kind==='hr'){ setTrustedHTML(tx, '<svg class="mdhr" aria-hidden="true" preserveAspectRatio="none"><line class="mdhrline" x1="0" y1="7" x2="100%" y2="7"/></svg>', 'markdown horizontal rule svg'); d.classList.add('hrnode'); d.title='Markdown 水平分隔線: '+(n.title||'---')+'；可直接拖曳水平線排序'; }
    else if(n.kind==='html' || n.htmlRaw){ tx.classList.add('hashtml'); d.classList.add('htmlnode'); renderHtmlBlockContent(tx, n.htmlRaw||n.code||''); d.title='Markdown HTML 區塊：'+(htmlDisplayMode===HTML_DISPLAY_MODES.safe?'白名單安全顯示':'純文字顯示'); }
    else if(n.table){ tx.classList.add('hastable'); setTrustedHTML(tx, tableHtml(n.table), 'markdown table'); d.classList.add('tablenode'); }
    else if(n.code!=null){ tx.classList.add('hascode'); setTrustedHTML(tx, '<pre class="mdpre"><code>'+escHtml(n.code)+'</code></pre>', 'markdown code block'); d.classList.add('codenode'); }
    else setTrustedHTML(tx, n.title ? inlineMd(n.title) : ' ', 'node inline markdown');
    if(tx.querySelector && tx.querySelector('img.mimg')){ tx.classList.add('hasimg'); d.classList.add('imgnode'); }
    if(n.checked) tx.style.textDecoration='line-through';
    d.appendChild(tx);
    // 引言註解:緊接此標題下方的 blockquote,呈現為內嵌引用小泡泡(泡泡中有泡泡)
    if(n.note!=null){
      const nb=document.createElement('span'); nb.className='nnote';
      const qlines=String(n.note).split('\n');
      for(const ql of qlines){ const ln=document.createElement('span'); ln.className='nqline'; setTrustedHTML(ln, ql ? inlineMd(ql) : '&nbsp;', 'node note inline markdown'); nb.appendChild(ln); }
      d.appendChild(nb);
    }
    bindRenderedImages(d);
    if(n.checked) d.classList.add('done');
    if(n.quote){ /* 引用節點:用 CSS 的黑底白字,不套主題色 */ }
    else {
      if(n.fill) d.style.background = n.fill;
      if(n.text) d.style.color = n.text;            else if(n.fill) d.style.color = textColor(n.fill);
      if(n.border) d.style.borderColor = n.border;  else if(n.fill) d.style.borderColor = darken(n.fill, 0.18);
    }
    applyEffectPalette(d, n.quote ? '#1a1a1a' : (n.fill || '#ffffff'));
    if(isSel(it.node)) d.classList.add('sel');
    if(searchMatchIds.has(it.node.id)) d.classList.add('match');
    if(it.node.id===currentMatchId) d.classList.add('match-current');
    canvas.appendChild(d);
    it.dom = d;
    it.node._h = d.offsetHeight;
    it.node._w = d.offsetWidth;
    // 額外記錄「文字實際右緣」相對節點左緣的距離,僅供連線/收合鈕起點使用(不動 _w、不影響版面與高度,
    // 因此接點垂直位置不受影響)。換行長節點的框比文字寬時,連線改從文字右緣出發,消除右側留白造成的空隙。
    it.node._textW = it.node._w;
    if(!it.node.table && it.node.code==null && !it.node.alert && !it.node.note && !d.querySelector('img.mimg')){
      try{
        const nb=d.getBoundingClientRect();
        const cs=getComputedStyle(d);
        const padR=parseFloat(cs.paddingRight)||0, bR=parseFloat(cs.borderRightWidth)||0;
        const rng=document.createRange(); rng.selectNodeContents(d);
        const rects=rng.getClientRects(); const sc=scale||1;
        let maxRight=0;
        for(const r of rects){ const rr=(r.right-nb.left)/sc; if(rr>maxRight) maxRight=rr; }  // 最靠右的文字邊界
        if(maxRight>0){ const tw=Math.ceil(maxRight+padR+bR); if(tw>0 && tw < it.node._w-1) it.node._textW=tw; }
      }catch(e){ logCaught(e,'measure rendered text width'); }
    }
  }
  // 水平分隔線先給最小寬度;實際右端等 layout 完後再延伸到全畫布最右節點。
  for(const it of list){
    const n=it.node;
    if(n.kind!=='hr') continue;
    n._w=Math.max(HR_MIN_WIDTH, n._w||0); n._textW=n._w;
    it.dom.style.width=n._w+'px';
  }
  // 2) 逐一根版面配置,再於跨軸方向堆疊,使多個中心不重疊
  let cross = 0;
  for(let gi=0; gi<groups.length; gi++){
    const g = groups[gi];
    const glist = g.list;
    let mainPos=null;
    if(orient==='v'){   // 只有直式需要同層列高;橫式由每個父節點自身寬度決定子節點位置
      const maxMain = {}; let maxDepth = 0;
      for(const it of glist){ maxMain[it.depth]=Math.max(maxMain[it.depth]||0,it.node._h); if(it.depth>maxDepth) maxDepth=it.depth; }
      mainPos={0:0};
      for(let d=1; d<=maxDepth; d++) mainPos[d]=mainPos[d-1]+(maxMain[d-1]||0)+ROWGAP;
    }
    layout(g.root, mainPos);
    if(g.root.kind==='hr'){
      const band=Math.max(STACK_GAP, (orient==='h'?g.root._h:g.root._w) + VGAP*2);
      if(orient==='h'){
        const dy=cross + band/2 - g.root._y;
        for(const it of glist) it.node._y += dy;
      } else {
        const dx=cross + band/2 - (g.root._x + g.root._w/2);
        for(const it of glist) it.node._x += dx;
      }
      g.root._sub=band;
      cross += band;
      continue;
    }
    if(orient==='h'){
      for(const it of glist) it.node._y += cross;
      cross += g.root._sub;
    } else {
      for(const it of glist) it.node._x += cross;
      cross += g.root._sub;
    }
    const next=groups[gi+1];
    if(!next || next.root.kind!=='hr') cross += STACK_GAP;
  }
  // 分隔線右端延伸到所在中心主題的最右側非分隔線節點;左端保留原本同層對齊位置。
  const allNonHr = list.filter(it=>it.node.kind!=='hr');
  const allRight = Math.max(...allNonHr.map(it=>it.node._x + it.node._w));
  for(const g of groups){
    const groupRight = g.root.kind==='hr' ? allRight : Math.max(...g.list.filter(it=>it.node.kind!=='hr').map(it=>it.node._x + it.node._w));
    if(!Number.isFinite(groupRight)) continue;
    for(const it of g.list){
      const n=it.node;
      if(n.kind!=='hr') continue;
      const w=Math.max(HR_MIN_WIDTH, Math.ceil(groupRight - n._x));
      n._w=w; n._textW=w; it.dom.style.width=w+'px';
    }
  }
  // 分隔線延伸後可能橫跨到同一張圖的長文字泡泡;最後再做一次碰撞避讓。
  if(orient==='h'){
    const overlapsX=(a,b)=>a.x1 < b.x2 && a.x2 > b.x1;
    for(const g of groups){
      const blockers=g.list.filter(it=>it.node.kind!=='hr').map(it=>{
        const n=it.node;
        return {x1:n._x, x2:n._x+n._w, y1:n._y-n._h/2, y2:n._y+n._h/2};
      });
      const hrs=g.list.filter(it=>it.node.kind==='hr').sort((a,b)=>a.node._y-b.node._y);
      for(const it of hrs){
        const n=it.node;
        for(let guard=0; guard<40; guard++){
          const h={x1:n._x, x2:n._x+n._w, y1:n._y-Math.max(4,n._h/2), y2:n._y+Math.max(4,n._h/2)};
          const hit=blockers
            .filter(b=>overlapsX(h,b) && h.y1 < b.y2+6 && h.y2 > b.y1-6)
            .sort((a,b)=>a.y2-b.y2)[0];
          if(!hit) break;
          n._y = hit.y2 + VGAP/2 + Math.max(4,n._h/2);
        }
      }
    }
  }
  // 3) shift to positive space
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const it of list){ const n=it.node;
    minX=Math.min(minX,n._x); minY=Math.min(minY,n._y-n._h/2);
    maxX=Math.max(maxX,n._x+n._w); maxY=Math.max(maxY,n._y+n._h/2);
  }
  const pad=40, dx=pad-minX, dy=pad-minY;
  // 4) position + toggles
  for(const it of list){ const n=it.node;
    it.dom.style.left=(n._x+dx)+'px';
    it.dom.style.top=(n._y-n._h/2+dy)+'px';
    const old=oldPos.get(n.id);
    if(old && !_suppressNodeMotion){ it.dom.style.transform=`translate(${old.x-(n._x+dx)}px,${old.y-(n._y-n._h/2+dy)}px)`; }
    else it.dom.classList.add('node-enter');
    const branchVis = branchChildren(n);
    const hasBranch = hasBranchChildren(n);
    if(hasBranch){
      const tg=document.createElement('div'); tg.className='toggle';
      tg.appendChild(createToggleGlyph(n.collapsed));
      tg.title = n.collapsed ? '展開' : '收合';
      // 顏色繼承上層(本節點)的框線色:展開=白底+同色框與符號;收合=同色底+深色框+白色符號
      const lc = n.border || '#9fb3c8';
      if(n.collapsed){ tg.style.background=lc; tg.style.borderColor=darken(lc,0.28); tg.style.color='#fff'; }
      else           { tg.style.background='#fff'; tg.style.borderColor=lc; tg.style.color=lc; }
      // 精準置中於「分支交點」(用與連線相同的 turnX/turnY 公式;直接定位到畫布座標)
      const vis = branchVis;
      let jx, jy;
      if(orient==='h'){
        const pxr = n._x + n._w;
        const childL = vis.length ? Math.min(...vis.map(c=>c._x)) : pxr+TRUNK_GAP*2;
        jx = (pxr + childL)/2 + dx; jy = n._y + dy;   // 收合鈕置於父節點右緣與子節點左緣的中點
      } else {
        const pyb = n._y + n._h/2;
        const childT = vis.length ? Math.min(...vis.map(c=>c._y - c._h/2)) : pyb+TRUNK_GAP*2;
        jx = n._x + n._w/2 + dx; jy = (pyb + childT)/2 + dy;   // 直式:置於父下緣與子上緣的中點
      }
      tg.style.left=(jx-9)+'px'; tg.style.top=(jy-9)+'px';
      tg.style.right='auto'; tg.style.bottom='auto'; tg.style.transform='none';
      tg.addEventListener('mousedown',e=>{e.stopPropagation();});
      tg.addEventListener('click',e=>{e.stopPropagation(); toggleNodeCollapsed(n);});
      canvas.appendChild(tg);
    }
  }
  // 5) edges
  const w=maxX-minX+pad*2, h=maxY-minY+pad*2;
  svg.setAttribute('width',w); svg.setAttribute('height',h);
  const paths=[];
  const BW=[2, 2, 2, 2, 2, 2, 2];   // 所有節點外框與分支線統一線寬
  const RAD = 18;          // 轉角圓角半徑
  const TRUNK = TRUNK_GAP; // 幹線(分支交點)距父節點的距離
  const TOGGLE_GAP = 10;   // 收合鈕半徑+間距;連線停在按鈕外緣,避免轉角穿過按鈕
  const stroke=(d,c,w)=>`<path class="edge-flow" d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6 6" stroke-dashoffset="0"/>`;
  // 以開關鈕(交點)為分隔,全層級一致拆色:
  //   上段(父→交點的 stub)= 父框線色;下段(交點→各子節點的幹線+圓角+腿)= 子框線色。
  //   多個不同色子節點共用幹線時,以「由遠到近」順序繪製,讓每條分支的幹線段顯示自己的顏色。
  for(const it of list){ const n=it.node;
    const pc = n.border || '#9fb3c8';            // 父色(上段 stub)
    const pw = BW[Math.min(it.depth, 6)];        // 父寬
    const cw = BW[Math.min(it.depth+1, 6)];      // 子寬
    const vis = branchChildren(n);
    if(vis.length){
      if(orient==='h'){
        const px=n._x+n._w+dx, py=n._y+dy;
        const childLmin = Math.min(...vis.map(c=>c._x))+dx;
        const turnX = (px + childLmin)/2;   // 分岔交點置於父節點右緣與最近子左緣的中點(與收合鈕一致)
        paths.push(stroke(`M ${px} ${py} L ${Math.max(px, turnX-TOGGLE_GAP)} ${py}`, pc, pw));               // 上段:父色 stub
        const order=[...vis].sort((a,b)=>Math.abs((b._y+dy)-py)-Math.abs((a._y+dy)-py));  // 遠→近
        for(const c of order){ const cx=c._x+dx, cy=c._y+dy, cc=c.border||'#9fb3c8';
          if(Math.abs(cy-py)<0.5){ paths.push(stroke(`M ${Math.min(cx, turnX+TOGGLE_GAP)} ${cy} L ${cx} ${cy}`, cc, cw)); }
          else { const s=cy>py?1:-1, startY=py+s*TOGGLE_GAP, r=Math.min(RAD, Math.abs(cy-startY), Math.max(0,cx-turnX)), conn=cy-s*r;
            paths.push(stroke(`M ${turnX} ${startY} L ${turnX} ${conn}`, cc, cw));        // 下段:子色幹線
            paths.push(stroke(`M ${turnX} ${conn} Q ${turnX} ${cy} ${turnX+r} ${cy} L ${cx} ${cy}`, cc, cw)); } // 下段:子色圓角+腿
        }
      } else {
        const px=n._x+n._w/2+dx, py=n._y+n._h/2+dy;
        const childTmin = Math.min(...vis.map(c=>c._y - c._h/2))+dy;
        const turnY = (py + childTmin)/2;   // 分岔交點置於父下緣與最近子上緣的中點(與收合鈕一致)
        paths.push(stroke(`M ${px} ${py} L ${px} ${Math.max(py, turnY-TOGGLE_GAP)}`, pc, pw));               // 上段:父色 stub
        const order=[...vis].sort((a,b)=>Math.abs((b._x+b._w/2+dx)-px)-Math.abs((a._x+a._w/2+dx)-px)); // 遠→近
        for(const c of order){ const cx=c._x+c._w/2+dx, cy=c._y-c._h/2+dy, cc=c.border||'#9fb3c8';
          if(Math.abs(cx-px)<0.5){ paths.push(stroke(`M ${cx} ${Math.min(cy, turnY+TOGGLE_GAP)} L ${cx} ${cy}`, cc, cw)); }
          else { const s=cx>px?1:-1, startX=px+s*TOGGLE_GAP, r=Math.min(RAD, Math.abs(cx-startX), Math.max(0,cy-turnY)), conn=cx-s*r;
            paths.push(stroke(`M ${startX} ${turnY} L ${conn} ${turnY}`, cc, cw));        // 下段:子色幹線
            paths.push(stroke(`M ${conn} ${turnY} Q ${cx} ${turnY} ${cx} ${turnY+r} L ${cx} ${cy}`, cc, cw)); } // 下段:子色圓角+腿
        }
      }
    }
    if(n.collapsed && hasBranchChildren(n)){   // 收合:短 stub 連到開關鈕(用父色)
      if(orient==='h'){ const px=n._x+n._w+dx, py=n._y+dy; paths.push(stroke(`M ${px} ${py} L ${px+TRUNK_GAP} ${py}`, pc, pw)); }
      else            { const px=n._x+n._w/2+dx, py=n._y+n._h/2+dy; paths.push(stroke(`M ${px} ${py} L ${px} ${py+TRUNK_GAP}`, pc, pw)); }
    }
  }
  setTrustedHTML(svg, paths.join(''), 'edge svg paths');
  ensureEdgeFlow();
  drawDebugOverlay(list, w, h, dx, dy);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ for(const it of list){ it.dom.style.transform=''; it.dom.classList.remove('node-enter'); } }));
  canvas._dx=dx; canvas._dy=dy;
  applyTransform();
  const centerCount = roots.filter(isBranchNode).length;
  setStatusSummary((centerCount>1 ? `${centerCount} 個中心 · ` : '')
    + `節點 ${roots.reduce((s,r)=>s+countNodes(r),0)} 個`
    + (selection.size>1 ? ` · 已選 ${selection.size} 個`
       : (selected? ` · 已選:「${(selected.title||'').split('\n')[0].slice(0,18)}」`:'')));
  refreshMdPanel(mdTextDriven);
  refreshSaveState();
}
let renderQueued=false;
function scheduleRender(after){
  if(renderQueued) return;
  renderQueued=true;
  requestAnimationFrame(()=>{
    renderQueued=false;
    render();
    if(typeof after==='function') after();
  });
}
let debugLayout=false;
function drawDebugOverlay(list, w, h, dx, dy){
  if(!debugGuideEl) return;
  debugGuideEl.setAttribute('width',w); debugGuideEl.setAttribute('height',h);
  if(!debugLayout){ clearTrustedHTML(debugGuideEl); return; }
  const bits=[];
  for(const it of list){ const n=it.node;
    const l=n._x+dx, t=n._y-n._h/2+dy, r=l+n._w, cy=n._y+dy, cx=l+n._w/2;
    bits.push(`<rect x="${l}" y="${t}" width="${n._w}" height="${n._h}" fill="none" stroke="rgba(239,68,68,.55)" stroke-width="1" stroke-dasharray="4,3"/>`);
    bits.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="#ef4444"/>`);
    if(orient==='h') bits.push(`<circle cx="${r}" cy="${cy}" r="3" fill="#0ea5e9"/>`);
    else bits.push(`<circle cx="${cx}" cy="${t+n._h}" r="3" fill="#0ea5e9"/>`);
  }
  setTrustedHTML(debugGuideEl, bits.join(''), 'debug overlay svg');
}
// 圖片載入完成後,節點高度才會確定;延遲去抖動重繪一次,避免圖片撐開後與相鄰節點重疊
// 用 URL 記錄已穩定的圖片(跨重繪保留),確保每張圖只觸發一次重繪,不會無限迴圈
let _imgRelayoutT=null; const _imgSettled=new Set();
window._imgRelayout=function(src){ if(src){ if(_imgSettled.has(src)) return; _imgSettled.add(src); }
  if(_imgRelayoutT) clearTimeout(_imgRelayoutT); _imgRelayoutT=setTimeout(()=>{ _imgRelayoutT=null; try{
    const prev=_suppressNodeMotion; _suppressNodeMotion=true;
    try{ render(); } finally { _suppressNodeMotion=prev; }
  }catch(e){ logCaught(e,'image relayout render'); } }, 80); };
function countNodes(n){ let c=1; for(const ch of n.children) c+=countNodes(ch); return c; }
// 重繪並讓 anchor 節點維持在原本的螢幕位置(scale 不變、版面不跳動)
let _suppressNodeMotion=false;
function renderKeepingAnchor(anchor, suppressMotion){
  if(!anchor){ render(); return; }
  const sx = panX + (anchor._x + (canvas._dx||0))*scale;   // 重繪前的螢幕座標
  const sy = panY + (anchor._y + (canvas._dy||0))*scale;
  const prevSuppress=_suppressNodeMotion;
  _suppressNodeMotion=!!suppressMotion;
  try{ render(); } finally { _suppressNodeMotion=prevSuppress; } // 版面重算(scale 不動)
  panX = sx - (anchor._x + (canvas._dx||0))*scale;          // 補回位移,讓 anchor 不動
  panY = sy - (anchor._y + (canvas._dy||0))*scale;
  applyTransform();
}
function applyTransform(){
  canvas.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;
  const g=40*scale;   // 網格跟著平移與縮放
  viewport.style.backgroundSize = g+'px '+g+'px';
  viewport.style.backgroundPosition = panX+'px '+panY+'px';
  const z=document.getElementById('zoomPct'); if(z) z.textContent=Math.round(scale*100)+'%';
}
function mapFitScale(padding=80){
  const w=parseFloat(svg.getAttribute('width'))||1, h=parseFloat(svg.getAttribute('height'))||1;
  const vw=viewport.clientWidth||1, vh=viewport.clientHeight||1;
  return Math.min(1, vw/(w+padding), vh/(h+padding));
}
function minZoomScale(){
  if(!roots.length) return DEFAULT_MIN_ZOOM_SCALE;
  const fitScale=mapFitScale(80);
  return Math.max(MIN_ZOOM_SCALE, Math.min(DEFAULT_MIN_ZOOM_SCALE, fitScale*0.95));
}
function clampZoom(value){
  return Math.min(MAX_ZOOM_SCALE, Math.max(minZoomScale(), value));
}
