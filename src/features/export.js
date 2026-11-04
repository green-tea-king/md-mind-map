//===================== 匯出圖片 / PDF(純前端 Canvas,無外部相依) =====================
const EXPORT_SUPPORT={
  nodes:[
    '一般節點','中心節點','序言節點','待辦/完成狀態','有序清單序號','圖示徽章',
    'Markdown 水平分隔線','Markdown 表格','圍籬/縮排程式碼','引用節點','標題引言註解',
    'GFM 警示框','腳註定義','參考式連結/圖片定義','Markdown HTML 區塊'
  ],
  inline:['粗體','斜體','刪除線','連結底線','行內程式碼底色','腳註引用','Emoji/短碼','圖片替代文字'],
  edges:['節點虛線連線','收合 stub','水平分隔線虛線'],
  notes:[
    'JPG/PDF 由 Canvas 重畫目前畫面,不是直接截圖 DOM。',
    '圖片節點匯出為替代文字標記,避免跨來源圖片污染 Canvas。',
    '新增節點類型時,請同步補 EXPORT_SUPPORT 與 renderMapToCanvas。'
  ]
};
function detectExportFeatures(){
  const features=new Set();
  canvas.querySelectorAll('.node').forEach(el=>{
    features.add('一般節點');
    if(el.classList.contains('preamble')) features.add('序言節點');
    if(el.classList.contains('done')) features.add('待辦/完成狀態');
    if(el.querySelector('.norder')) features.add('有序清單序號');
    if(el.querySelector('.nicon')) features.add('圖示徽章');
    if(el.classList.contains('hrnode')) features.add('Markdown 水平分隔線');
    if(el.querySelector('table.mdtable')) features.add('Markdown 表格');
    if(el.querySelector('pre.mdpre')) features.add('圍籬/縮排程式碼');
    if(el.classList.contains('htmlnode')) features.add('Markdown HTML 區塊');
    if(el.classList.contains('quote')) features.add('引用節點');
    if(el.querySelector('.nnote')) features.add('標題引言註解');
    if(el.classList.contains('alert')) features.add('GFM 警示框');
    if(el.classList.contains('fndef')) features.add('腳註定義');
    if(el.classList.contains('refdef')) features.add('參考式連結/圖片定義');
    if(el.querySelector('strong')) features.add('粗體');
    if(el.querySelector('em')) features.add('斜體');
    if(el.querySelector('del')) features.add('刪除線');
    if(el.querySelector('a.mlink')) features.add('連結底線');
    if(el.querySelector('code.mdcode')) features.add('行內程式碼底色');
    if(el.querySelector('sup.fnref')) features.add('腳註引用');
    if(el.querySelector('img.mimg')) features.add('圖片替代文字');
  });
  return [...features].sort();
}
function auditExportSupport(){
  const supported=new Set([...EXPORT_SUPPORT.nodes,...EXPORT_SUPPORT.inline,...EXPORT_SUPPORT.edges]);
  const used=detectExportFeatures();
  const unsupported=used.filter(x=>!supported.has(x));
  if(unsupported.length) logCaught(new Error('未列入匯出支援清單: '+unsupported.join(', ')), 'export support audit');
  return {used, unsupported, support:EXPORT_SUPPORT};
}
function _roundRect(ctx,x,y,w,h,r){ r=Math.max(0,Math.min(r,w/2,h/2)); ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function _wrapText(ctx,text,maxW){ const out=[];
  for(const para of String(text).split('\n')){
    if(para===''){ out.push(''); continue; }
    const toks=para.match(/\s+|\S+/g)||[para]; let line='';
    for(const tok of toks){ const test=line+tok;
      if(line==='' && ctx.measureText(tok).width>maxW){ let cur='';
        for(const ch of tok){ if(cur!=='' && ctx.measureText(cur+ch).width>maxW){ out.push(cur); cur=ch; } else cur+=ch; } line=cur;
      } else if(ctx.measureText(test).width<=maxW || line===''){ line=test; }
      else { out.push(line.replace(/\s+$/,'')); line=tok.replace(/^\s+/,''); } }
    out.push(line);
  } return out; }
function _drawCanvasPre(ctx, nodeEl, preEl, nx, ny){
  const nodeRect=nodeEl.getBoundingClientRect(), pr=preEl.getBoundingClientRect(), pcs=getComputedStyle(preEl);
  const sc=scale||1;
  const px=nx+(pr.left-nodeRect.left)/sc, py=ny+(pr.top-nodeRect.top)/sc, pw=pr.width/sc, ph=pr.height/sc;
  const bg=pcs.backgroundColor;
  if(bg && bg!=='rgba(0, 0, 0, 0)' && bg!=='transparent'){ _roundRect(ctx,px,py,pw,ph,parseFloat(pcs.borderTopLeftRadius)||6); ctx.fillStyle=bg; ctx.fill(); }
  const fs=parseFloat(pcs.fontSize)||12, lh=fs*1.45;
  ctx.font='normal 400 '+fs+'px '+(pcs.fontFamily||'monospace');
  ctx.fillStyle=pcs.color||'#1f2933'; ctx.textBaseline='top';
  const padL=parseFloat(pcs.paddingLeft)||11, padR=parseFloat(pcs.paddingRight)||11, padT=parseFloat(pcs.paddingTop)||8;
  const maxW=Math.max(10,pw-padL-padR);
  let ty=py+padT;
  for(const raw of (preEl.textContent||'').split('\n')){
    const wl=_wrapText(ctx, raw, maxW); if(!wl.length) wl.push('');
    for(const ln of wl){ ctx.fillText(ln, px+padL, ty); ty+=lh; }
  }
}
function _drawCanvasTable(ctx, nodeEl, tableEl, nx, ny){
  const nodeRect=nodeEl.getBoundingClientRect(); const sc=scale||1;
  tableEl.querySelectorAll('th,td').forEach(cell=>{
    const cr=cell.getBoundingClientRect(), ccs=getComputedStyle(cell);
    const cx=nx+(cr.left-nodeRect.left)/sc, cy=ny+(cr.top-nodeRect.top)/sc;
    const cw=cr.width/sc, ch=cr.height/sc;
    const bg=ccs.backgroundColor;
    if(bg && bg!=='rgba(0, 0, 0, 0)' && bg!=='transparent'){ ctx.fillStyle=bg; ctx.fillRect(cx,cy,cw,ch); }
    ctx.lineWidth=parseFloat(ccs.borderTopWidth)||1; ctx.strokeStyle=ccs.borderTopColor||'#888';
    ctx.strokeRect(cx,cy,cw,ch);
    const fs=parseFloat(ccs.fontSize)||13, lh=fs*1.35;
    ctx.font=(ccs.fontStyle||'normal')+' '+(ccs.fontWeight||'400')+' '+fs+'px '+(ccs.fontFamily||'sans-serif');
    ctx.fillStyle=ccs.color||'#1f2933'; ctx.textBaseline='top';
    const padL=parseFloat(ccs.paddingLeft)||9, padR=parseFloat(ccs.paddingRight)||9, padT=parseFloat(ccs.paddingTop)||3;
    const align=ccs.textAlign;
    const lines=_wrapText(ctx,(cell.textContent||'').trim(),Math.max(8,cw-padL-padR));
    let ty=cy+padT;
    for(const ln of lines){ let tx=cx+padL; const mw=ctx.measureText(ln).width;
      if(align==='right') tx=cx+cw-padR-mw; else if(align==='center') tx=cx+(cw-mw)/2;
      ctx.fillText(ln,tx,ty); ty+=lh; }
  });
}
function _richFont(seg, fs, family, fallbackWeight, fallbackStyle){
  const weight=seg.weight||fallbackWeight||'400', style=seg.style||fallbackStyle||'normal';
  const size=seg.size||fs, fam=seg.family||family||'sans-serif';
  return style+' '+weight+' '+size+'px '+fam;
}
function _richSegments(root, base){
  const out=[];
  function walk(node, inherited){
    if(node.nodeType===Node.TEXT_NODE){ if(node.nodeValue) out.push({...inherited,text:node.nodeValue}); return; }
    if(node.nodeType!==Node.ELEMENT_NODE) return;
    if(node.tagName==='BR'){ out.push({...inherited,text:'\n'}); return; }
    if(node.tagName==='IMG'){ out.push({...inherited,text:'🖼️ '+(node.getAttribute('alt')||'圖片')}); return; }
    const cs=getComputedStyle(node);
    const next={...inherited,color:cs.color||inherited.color,weight:cs.fontWeight||inherited.weight,
      style:cs.fontStyle||inherited.style,family:cs.fontFamily||inherited.family,
      size:parseFloat(cs.fontSize)||inherited.size,decoration:cs.textDecorationLine||inherited.decoration,
      bg:cs.backgroundColor||inherited.bg};
    node.childNodes.forEach(ch=>walk(ch,next));
  }
  walk(root,base);
  return out;
}
function _layoutRich(ctx, segments, maxW, fs, family, weight, style){
  const lines=[]; let line=[], w=0;
  const pushLine=()=>{ lines.push(line); line=[]; w=0; };
  const addToken=(seg, text)=>{
    if(text==='\n'){ pushLine(); return; }
    if(!text) return;
    ctx.font=_richFont(seg, fs, family, weight, style);
    let tw=ctx.measureText(text).width;
    if(/^\s+$/.test(text) && !line.length) return;
    if(line.length && w+tw>maxW){ pushLine(); if(/^\s+$/.test(text)) return; }
    if(tw>maxW && text.length>1){
      let cur='';
      for(const ch of text){
        const test=cur+ch, cw=ctx.measureText(test).width;
        if(cur && w+cw>maxW){ addToken(seg, cur); cur=ch; }
        else cur=test;
      }
      if(cur) addToken(seg, cur);
      return;
    }
    line.push({...seg,text,width:tw}); w+=tw;
  };
  for(const seg of segments){
    const parts=String(seg.text||'').split(/(\n|\s+|\S+)/).filter(Boolean);
    for(const p of parts) addToken(seg,p);
  }
  if(line.length || !lines.length) pushLine();
  return lines;
}
function _drawRichLines(ctx, lines, x, yMid, lh, fs, family, weight, style){
  let y=yMid;
  for(const line of lines){ let xcur=x;
    for(const seg of line){
      ctx.font=_richFont(seg, fs, family, weight, style);
      ctx.fillStyle=seg.color||'#1f2933'; ctx.textBaseline='middle';
      if(seg.bg && seg.bg!=='rgba(0, 0, 0, 0)' && seg.bg!=='transparent'){
        ctx.save(); ctx.fillStyle=seg.bg; _roundRect(ctx,xcur-3,y-lh*.42,seg.width+6,lh*.84,4); ctx.fill(); ctx.restore();
      }
      ctx.fillText(seg.text,xcur,y);
      if(String(seg.decoration||'').includes('line-through')){
        ctx.save(); ctx.strokeStyle=seg.color||'#64748b'; ctx.lineWidth=Math.max(1,fs*.08);
        ctx.beginPath(); ctx.moveTo(xcur,y); ctx.lineTo(xcur+seg.width,y); ctx.stroke(); ctx.restore();
      }
      if(String(seg.decoration||'').includes('underline')){
        ctx.save(); ctx.strokeStyle=seg.color||'#0369a1'; ctx.lineWidth=Math.max(1,fs*.07);
        const uy=y+fs*.48; ctx.beginPath(); ctx.moveTo(xcur,uy); ctx.lineTo(xcur+seg.width,uy); ctx.stroke(); ctx.restore();
      }
      xcur+=seg.width;
    }
    y+=lh;
  }
}
function _canvasHtmlBlocks(root){
  const blocks=[];
  const directKinds={SUMMARY:'summary',P:'paragraph',LI:'list-item',PRE:'pre',TABLE:'table',BLOCKQUOTE:'blockquote',
    H1:'heading',H2:'heading',H3:'heading',H4:'heading',H5:'heading',H6:'heading'};
  const containers=new Set(['DETAILS','UL','OL','DIV']);
  function walk(parent){
    for(const el of parent.children){
      const kind=directKinds[el.tagName];
      if(kind){ blocks.push({kind,el}); continue; }
      if(containers.has(el.tagName)){
        const before=blocks.length; walk(el);
        if(blocks.length===before && (el.textContent||'').trim()) blocks.push({kind:'generic',el});
        continue;
      }
      if((el.textContent||'').trim() || el.querySelector('img')) blocks.push({kind:'generic',el});
    }
  }
  walk(root);
  if(!blocks.length && (root.textContent||'').trim()) blocks.push({kind:'generic',el:root});
  return blocks;
}
function _drawCanvasHtmlSafe(ctx, nodeEl, htmlEl, nx, ny){
  const nodeRect=nodeEl.getBoundingClientRect(), sc=scale||1;
  const blocks=_canvasHtmlBlocks(htmlEl);
  for(const block of blocks){
    if(block.kind==='pre'){ _drawCanvasPre(ctx,nodeEl,block.el,nx,ny); continue; }
    if(block.kind==='table'){ _drawCanvasTable(ctx,nodeEl,block.el,nx,ny); continue; }
    const el=block.el, r=el.getBoundingClientRect(), cs=getComputedStyle(el);
    const x=nx+(r.left-nodeRect.left)/sc, y=ny+(r.top-nodeRect.top)/sc;
    const w=Math.max(10,r.width/sc), fs=parseFloat(cs.fontSize)||13, lh=parseFloat(cs.lineHeight)||fs*1.45;
    const family=cs.fontFamily||'sans-serif', weight=block.kind==='summary'?'700':(cs.fontWeight||'400'), style=cs.fontStyle||'normal';
    const base={color:cs.color||'#1f2933',weight,style,family,size:fs,decoration:cs.textDecorationLine||'none'};
    const segs=[];
    if(block.kind==='summary') segs.push({...base,text:'▼ '});
    else if(block.kind==='list-item') segs.push({...base,text:'• '});
    segs.push(..._richSegments(el,base));
    const padL=parseFloat(cs.paddingLeft)||0, padR=parseFloat(cs.paddingRight)||0;
    const lines=_layoutRich(ctx,segs,Math.max(8,w-padL-padR),fs,family,weight,style);
    _drawRichLines(ctx,lines,x+padL,y+lh/2,lh,fs,family,weight,style);
  }
  return blocks;
}
function renderMapToCanvas(options={}){
  if(!roots.length) return null;
  if(!options.skipRender) render();
  auditExportSupport();
  const w=Math.ceil(parseFloat(svg.getAttribute('width'))||1), h=Math.ceil(parseFloat(svg.getAttribute('height'))||1);
  let sf=2; const MAX=12000; sf=Math.min(sf, MAX/w, MAX/h); if(!(sf>0)) sf=1; if(sf<0.4) sf=0.4;
  const cv=document.createElement('canvas'); cv.width=Math.round(w*sf); cv.height=Math.round(h*sf);
  const ctx=cv.getContext('2d'); if(!ctx) return null; ctx.scale(sf,sf);
  const exportStats={htmlRaw:0,htmlSafe:0};
  const bg=((getComputedStyle(document.documentElement).getPropertyValue('--bg')||'').trim())||'#ffffff';
  ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
  ctx.lineCap='round'; ctx.lineJoin='round';
  svg.querySelectorAll('path').forEach(p=>{ const d=p.getAttribute('d'); if(!d) return;
    ctx.strokeStyle=p.getAttribute('stroke')||'#9fb3c8'; ctx.lineWidth=parseFloat(p.getAttribute('stroke-width'))||1.5;
    const dash=(p.getAttribute('stroke-dasharray')||'').trim().split(/[,\s]+/).map(Number).filter(n=>n>0);
    if(dash.length) ctx.setLineDash(dash); else ctx.setLineDash([]);
    const off=parseFloat(p.getAttribute('stroke-dashoffset')||'0')||0; ctx.lineDashOffset=off;
    try{ ctx.stroke(new Path2D(d)); }catch(e){ logCaught(e,'draw canvas edge path'); }
    ctx.setLineDash([]); ctx.lineDashOffset=0;
  });
  canvas.querySelectorAll('.node').forEach(el=>{
    const x=el.offsetLeft, y=el.offsetTop, ww=el.offsetWidth, hh=el.offsetHeight, cs=getComputedStyle(el);
    const bw=parseFloat(cs.borderTopWidth)||0, br=parseFloat(cs.borderTopLeftRadius)||8;
    ctx.save(); if(el.classList.contains('done')) ctx.globalAlpha=0.6;
    _roundRect(ctx,x,y,ww,hh,br); ctx.fillStyle=cs.backgroundColor||'#ffffff'; ctx.fill();
    if(bw>0){ _roundRect(ctx,x+bw/2,y+bw/2,ww-bw,hh-bw,Math.max(0,br-bw/2)); ctx.lineWidth=bw; ctx.strokeStyle=cs.borderTopColor||'#c2ccd8'; ctx.stroke(); }
    if(el.classList.contains('hrnode')){
      const hrEl=el.querySelector('.mdhrline'), hrCs=hrEl?getComputedStyle(hrEl):null;
      ctx.globalAlpha=0.9; ctx.strokeStyle=cs.color||'#64748b'; ctx.lineWidth=hrCs?(parseFloat(hrCs.strokeWidth)||2):2;
      ctx.setLineDash([6,6]);
      ctx.beginPath(); ctx.moveTo(x, y+hh/2); ctx.lineTo(x+ww, y+hh/2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore(); return;
    }
    const _tblEl=el.querySelector('table.mdtable');
    if(_tblEl){ _drawCanvasTable(ctx, el, _tblEl, x, y); ctx.restore(); return; }
    const _preEl=el.querySelector('pre.mdpre');
    if(_preEl){ _drawCanvasPre(ctx, el, _preEl, x, y); ctx.restore(); return; }
    if(el.classList.contains('htmlnode')){
      const rawEl=el.querySelector('pre.mdhtmlraw'), safeEl=el.querySelector('.htmlsafe');
      if(rawEl){ _drawCanvasPre(ctx,el,rawEl,x,y); exportStats.htmlRaw++; }
      else if(safeEl){ _drawCanvasHtmlSafe(ctx,el,safeEl,x,y); exportStats.htmlSafe++; }
      ctx.restore(); return;
    }
    const fs=parseFloat(cs.fontSize)||14, lh=fs*1.4, baseColor=cs.color||'#1f2933';
    const baseSeg={color:baseColor,weight:cs.fontWeight||'400',style:cs.fontStyle||'normal',family:cs.fontFamily||'sans-serif',size:fs,decoration:'none'};
    const segs=[]; const ord=el.querySelector('.norder'); if(ord) segs.push({...baseSeg,text:ord.textContent+' '});
    const ck=el.querySelector('.ckbox'); if(ck) segs.push({...baseSeg,text:ck.textContent+' '});
    const ic=el.querySelector('.nicon'); if(ic) segs.push({...baseSeg,text:ic.textContent+' '});
    const tx=el.querySelector('.ntext');
    if(tx){ const rich=_richSegments(tx, baseSeg); if(rich.some(s=>String(s.text||'').trim())) segs.push(...rich); else if(tx.querySelector('img.mimg')) segs.push({...baseSeg,text:''}); }
    else segs.push({...baseSeg,text:el.textContent});
    const padL=parseFloat(cs.paddingLeft)||12, padR=parseFloat(cs.paddingRight)||12, padT=parseFloat(cs.paddingTop)||7;
    const maxW=Math.max(10, ww-bw*2-padL-padR+2);
    const lines=_layoutRich(ctx, segs, maxW, fs, cs.fontFamily||'sans-serif', cs.fontWeight||'400', cs.fontStyle||'normal');
    const _noteEl=el.querySelector('.nnote');
    if(_noteEl){
      // 有引言註解:標題靠上對齊,下方畫內嵌引用塊
      let ty=y+bw+padT+lh/2;
      _drawRichLines(ctx, lines, x+bw+padL, ty, lh, fs, cs.fontFamily||'sans-serif', cs.fontWeight||'400', cs.fontStyle||'normal');
      ty+=lines.length*lh;
      const qlineEls=_noteEl.querySelectorAll('.nqline');
      const nfs=fs*0.88, nlh=nfs*1.5;
      const padIn=11, txtX=x+bw+padL+padIn;
      ctx.save();
      ctx.font='italic '+(cs.fontWeight||'400')+' '+nfs+'px '+(cs.fontFamily||'sans-serif');
      ctx.fillStyle=cs.color||'#1f2933';
      const qLines=[];
      qlineEls.forEach(q=>{ for(const wl of _wrapText(ctx,(q.textContent||'').trim(),maxW-padIn*2)) qLines.push(wl); });
      const noteTop=ty+2, noteH=qLines.length*nlh+12;
      ctx.globalAlpha=1; ctx.fillStyle='#1a1a1a'; ctx.fillRect(x+bw+padL, noteTop, maxW-2, noteH);
      ctx.fillStyle='#ffffff'; ctx.textBaseline='top';
      let qy=noteTop+6;
      for(const wl of qLines){ ctx.fillText(wl, txtX, qy); qy+=nlh; }
      ctx.restore();
    } else {
      const totalH=lines.length*lh; let ty=y+Math.max(bw+padT,(hh-totalH)/2)+lh/2;
      _drawRichLines(ctx, lines, x+bw+padL, ty, lh, fs, cs.fontFamily||'sans-serif', cs.fontWeight||'400', cs.fontStyle||'normal');
    }
    const imgs=[...el.querySelectorAll('img.mimg')];
    if(imgs.length){
      let iy=y+bw+padT;
      for(const img of imgs){
        if(!img.complete || !img.naturalWidth) continue;
        const r=img.getBoundingClientRect(), er=el.getBoundingClientRect();
        const ix=x+(r.left-er.left)/(scale||1), top=y+(r.top-er.top)/(scale||1);
        const iw=r.width/(scale||1), ih=r.height/(scale||1);
        try{ ctx.drawImage(img, ix, top||iy, iw, ih); }catch(e){ logCaught(e,'draw export image'); }
        iy+=ih+4;
      }
    }
    ctx.restore();
  });
  let toggleCount=0;
  canvas.querySelectorAll('.toggle').forEach(el=>{
    const x=el.offsetLeft, y=el.offsetTop, ww=el.offsetWidth, hh=el.offsetHeight, cs=getComputedStyle(el);
    const bw=parseFloat(cs.borderTopWidth)||0, br=parseFloat(cs.borderTopLeftRadius)||ww/2;
    ctx.save();
    _roundRect(ctx,x,y,ww,hh,br); ctx.fillStyle=cs.backgroundColor||'#ffffff'; ctx.fill();
    if(bw>0){ _roundRect(ctx,x+bw/2,y+bw/2,ww-bw,hh-bw,Math.max(0,br-bw/2)); ctx.lineWidth=bw; ctx.strokeStyle=cs.borderTopColor||cs.color||'#9fb3c8'; ctx.stroke(); }
    const glyph=el.querySelector('svg'), lines=glyph?[...glyph.querySelectorAll('line')]:[];
    if(glyph && lines.length){
      const er=el.getBoundingClientRect(), gr=glyph.getBoundingClientRect(), sc=scale||1;
      const vb=(glyph.getAttribute('viewBox')||'0 0 1 1').trim().split(/[\s,]+/).map(Number), vw=vb[2]||1, vh=vb[3]||1;
      const gx=x+(gr.left-er.left)/sc, gy=y+(gr.top-er.top)/sc, gw=gr.width/sc, gh=gr.height/sc;
      ctx.strokeStyle=cs.color||'#9fb3c8'; ctx.lineWidth=parseFloat(getComputedStyle(lines[0]).strokeWidth)||bw||2; ctx.lineCap='round';
      lines.forEach(line=>{
        const x1=Number(line.getAttribute('x1')), y1=Number(line.getAttribute('y1')), x2=Number(line.getAttribute('x2')), y2=Number(line.getAttribute('y2'));
        if(![x1,y1,x2,y2].every(Number.isFinite)) return;
        ctx.beginPath(); ctx.moveTo(gx+(x1-vb[0])*gw/vw,gy+(y1-vb[1])*gh/vh); ctx.lineTo(gx+(x2-vb[0])*gw/vw,gy+(y2-vb[1])*gh/vh); ctx.stroke();
      });
    }
    ctx.restore(); toggleCount++;
  });
  cv._mmScaleFactor=sf; cv._mmMapWidth=w; cv._mmMapHeight=h; cv._mmExportStats=exportStats; cv._mmToggleCount=toggleCount;
  return cv;
}
window.auditMindMapExportSupport=auditExportSupport;
function _dl(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); }
function _dlData(durl,name){ const a=document.createElement('a'); a.href=durl; a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
function _safeFileBase(base){ return (String(base || APP_NAME).trim() || APP_NAME).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120); }
function _expName(ext){ const rootTitle = roots && roots[0] && roots[0].title; return _safeFileBase(currentName || rootTitle || APP_NAME) + '.' + ext; }
function _wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function settleBeforeExport(){
  flushPendingMdText();
  if(document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready,_wait(1200)]);
  render();
  const imgs=[...canvas.querySelectorAll('img.mimg')];
  await Promise.race([Promise.all(imgs.map(img=>img.complete ? Promise.resolve() : new Promise(r=>{ img.addEventListener('load',r,{once:true}); img.addEventListener('error',r,{once:true}); }))),_wait(1400)]);
  render();
}
function showExportSize(kind, cv){
  const sf=cv._mmScaleFactor||1, w=cv.width, h=cv.height;
  showToast(`${kind} 已匯出 ${w}×${h}px / ${sf.toFixed(2)}x`);
}
async function exportJPG(){ flushPendingMdText(); if(!confirmNonMarkdownExport('JPG')) return; await settleBeforeExport(); const cv=renderMapToCanvas({skipRender:true}); if(!cv){ setStatusMessage('沒有可匯出的內容','warn',3600); return; }
  try{ if(cv.toBlob){ cv.toBlob(b=>{ b?_dl(b,_expName('jpg')):_dlData(cv.toDataURL('image/jpeg',0.92),_expName('jpg')); showExportSize('JPG', cv); },'image/jpeg',0.92); }
       else { _dlData(cv.toDataURL('image/jpeg',0.92),_expName('jpg')); showExportSize('JPG', cv); } }
  catch(e){ logCaught(e,'export JPG'); setStatusMessage('匯出 JPG 失敗:'+e.message,'error',6000); } }
async function exportPDF(){ flushPendingMdText(); if(!confirmNonMarkdownExport('PDF')) return; await settleBeforeExport(); const cv=renderMapToCanvas({skipRender:true}); if(!cv){ setStatusMessage('沒有可匯出的內容','warn',3600); return; }
  try{ const durl=cv.toDataURL('image/jpeg',0.92), b64=durl.split(',')[1], bin=atob(b64);
    const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    const A4=[595.28,841.89]; const land=cv.width>cv.height;
    const pageW=land?A4[1]:A4[0], pageH=land?A4[0]:A4[1];
    const m=24, availW=pageW-2*m, availH=pageH-2*m, ar=cv.width/cv.height;
    let dw=availW, dh=dw/ar; if(dh>availH){ dh=availH; dw=dh*ar; }
    const dx=(pageW-dw)/2, dy=(pageH-dh)/2;
    const pdf=_buildPdf(bytes, cv.width, cv.height, pageW, pageH, dx, dy, dw, dh);
    _dl(new Blob([pdf],{type:'application/pdf'}), _expName('pdf'));
    showExportSize('PDF', cv);
  }catch(e){ logCaught(e,'export PDF'); setStatusMessage('匯出 PDF 失敗:'+e.message,'error',6000); } }
function _buildPdf(jpeg, pw, ph, pageW, pageH, dx, dy, dw, dh){
  const enc=new TextEncoder(); const chunks=[]; let len=0; const offs=[];
  const put=x=>{ const a=(typeof x==='string')?enc.encode(x):x; chunks.push(a); len+=a.length; };
  const start=()=>offs.push(len);
  put('%PDF-1.4\n');
  start(); put('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  start(); put('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  start(); put('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageW.toFixed(2)+' '+pageH.toFixed(2)+'] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  start(); put('4 0 obj\n<< /Type /XObject /Subtype /Image /Width '+pw+' /Height '+ph+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n'); put(jpeg); put('\nendstream\nendobj\n');
  const content='q\n'+dw.toFixed(2)+' 0 0 '+dh.toFixed(2)+' '+dx.toFixed(2)+' '+dy.toFixed(2)+' cm\n/Im0 Do\nQ\n';
  start(); put('5 0 obj\n<< /Length '+content.length+' >>\nstream\n'+content+'endstream\nendobj\n');
  const xo=len; let xref='xref\n0 6\n0000000000 65535 f \n';
  for(const o of offs){ xref+=String(o).padStart(10,'0')+' 00000 n \n'; }
  put(xref); put('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xo+'\n%%EOF');
  const outb=new Uint8Array(len); let pp=0; for(const c of chunks){ outb.set(c,pp); pp+=c.length; } return outb;
}
function _canvasPixelActivity(cv, rect, bg){
  if(!cv || !rect) return {active:0,total:0,ratio:0};
  const ctx=cv.getContext('2d'); if(!ctx) return {active:0,total:0,ratio:0};
  const sf=cv._mmScaleFactor||1;
  const x0=Math.max(0,Math.floor(rect.x*sf)), y0=Math.max(0,Math.floor(rect.y*sf));
  const x1=Math.min(cv.width,Math.ceil((rect.x+rect.w)*sf)), y1=Math.min(cv.height,Math.ceil((rect.y+rect.h)*sf));
  if(x1<=x0 || y1<=y0) return {active:0,total:0,ratio:0};
  const data=ctx.getImageData(x0,y0,x1-x0,y1-y0).data;
  const b=bg||[255,255,255]; let active=0, total=data.length/4;
  for(let i=0;i<data.length;i+=4){
    const d=Math.abs(data[i]-b[0])+Math.abs(data[i+1]-b[1])+Math.abs(data[i+2]-b[2]);
    if(data[i+3]>10 && d>36) active++;
  }
  return {active,total,ratio:total?active/total:0};
}
function _canvasBackgroundRgb(cv){
  const ctx=cv&&cv.getContext&&cv.getContext('2d'); if(!ctx) return [255,255,255];
  const p=ctx.getImageData(1,1,1,1).data; return [p[0],p[1],p[2]];
}
function runExportSelfTest(options={}){
  const checks=[]; const add=(name, ok, detail)=>checks.push({name, ok:!!ok, detail:detail||''});
  const savedRoots=roots, savedSelectedId=selected&&selected.id, savedSelectionIds=[...selection].map(n=>n.id);
  const savedScale=scale, savedPanX=panX, savedPanY=panY, savedOrient=orient;
  const savedHtmlDisplayMode=htmlDisplayMode;
  try{
    roots=parseMarkdown(`# 匯出自檢
- **粗體**、*斜體*、~~刪除~~、[連結](https://example.com)
---
| 項目 | 數量 | 狀態 |
| --- | ---: | :---: |
| 分隔線 | 1 | OK |
| 表格 | 2 | OK |
\`\`\`text
code block
\`\`\`
> [!WARNING]
> 匯出警示框測試

<details open>
<summary><strong>HTML 摘要</strong></summary>
<p>獨立段落含 <code>inline code</code></p>
<ul>
<li>第一個項目</li>
<li><em>第二個項目</em></li>
</ul>
</details>
`);
    roots.forEach(r=>setParents(r,null));
    selected=roots[0]; selection=new Set([selected]);
    render();
    const audit=auditExportSupport();
    add('匯出支援清單沒有遺漏目前節點類型', audit.unsupported.length===0, audit.unsupported.join(',')||'ok');
    add('匯出能力稽核會辨識 Markdown HTML 區塊', audit.used.includes('Markdown HTML 區塊'), audit.used.join(','));
    add('測試圖含分隔線與表格 DOM', !!canvas.querySelector('.node.hrnode') && !!canvas.querySelector('table.mdtable'), 'hr/table');
    const hrLine=canvas.querySelector('.node.hrnode .mdhrline');
    add('SVG 水平分隔線保留百分比終點', !!(hrLine && hrLine.getAttribute('x2')==='100%'), hrLine&&hrLine.getAttribute('x2'));
    const cv=renderMapToCanvas({skipRender:true});
    add('Canvas 匯出尺寸合理', !!(cv && cv.width>80 && cv.height>80 && cv._mmScaleFactor>0), cv?`${cv.width}x${cv.height}@${cv._mmScaleFactor}`:'no canvas');
    const bg=_canvasBackgroundRgb(cv);
    const toggleEl=canvas.querySelector('.toggle');
    const toggleRect=toggleEl ? {x:toggleEl.offsetLeft+7,y:toggleEl.offsetTop+7,w:4,h:4} : null;
    const togglePix=_canvasPixelActivity(cv,toggleRect,bg);
    add('Canvas 匯出保留收合按鈕符號', !!(toggleEl && cv && cv._mmToggleCount===canvas.querySelectorAll('.toggle').length), `${togglePix.active}/${togglePix.total}; ${cv&&cv._mmToggleCount||0}/${canvas.querySelectorAll('.toggle').length}`);
    const hrEl=canvas.querySelector('.node.hrnode');
    const hrRect=hrEl ? {x:hrEl.offsetLeft, y:hrEl.offsetTop+hrEl.offsetHeight/2-3, w:hrEl.offsetWidth, h:6} : null;
    const hrPix=_canvasPixelActivity(cv, hrRect, bg);
    add('Canvas 內有畫出水平分隔線虛線', hrPix.active>=8 && hrPix.ratio>0.01, `${hrPix.active}/${hrPix.total}`);
    const tblEl=canvas.querySelector('table.mdtable');
    const tblNode=tblEl && tblEl.closest('.node');
    let tblRect=null;
    if(tblEl && tblNode){
      const tr=tblEl.getBoundingClientRect(), nr=tblNode.getBoundingClientRect(), sc=scale||1;
      tblRect={x:tblNode.offsetLeft+(tr.left-nr.left)/sc, y:tblNode.offsetTop+(tr.top-nr.top)/sc, w:tr.width/sc, h:tr.height/sc};
    }
    const tblPix=_canvasPixelActivity(cv, tblRect, bg);
    add('Canvas 內有畫出表格格線與文字', tblPix.active>=30 && tblPix.ratio>0.02, `${tblPix.active}/${tblPix.total}`);
    setHtmlDisplayMode(HTML_DISPLAY_MODES.text, false);
    const rawHtmlNode=canvas.querySelector('.node.htmlnode'), rawPre=rawHtmlNode&&rawHtmlNode.querySelector('pre.mdhtmlraw');
    const rawCv=renderMapToCanvas({skipRender:true}), rawBg=_canvasBackgroundRgb(rawCv);
    const rawRect=rawHtmlNode ? {x:rawHtmlNode.offsetLeft,y:rawHtmlNode.offsetTop,w:rawHtmlNode.offsetWidth,h:rawHtmlNode.offsetHeight} : null;
    const rawPix=_canvasPixelActivity(rawCv,rawRect,rawBg);
    add('HTML 純文字模式使用 pre 專用 Canvas 路徑', !!rawPre && !!(rawCv&&rawCv._mmExportStats&&rawCv._mmExportStats.htmlRaw===1), rawCv&&JSON.stringify(rawCv._mmExportStats));
    add('HTML 純文字模式在 Canvas 有可見內容', rawPix.active>=20 && rawPix.ratio>0.01, `${rawPix.active}/${rawPix.total}`);
    setHtmlDisplayMode(HTML_DISPLAY_MODES.safe, false);
    const safeHtmlNode=canvas.querySelector('.node.htmlnode'), safeHtml=safeHtmlNode&&safeHtmlNode.querySelector('.htmlsafe');
    const blocks=typeof _canvasHtmlBlocks==='function' && safeHtml ? _canvasHtmlBlocks(safeHtml) : [];
    const kinds=blocks.map(b=>b.kind);
    add('HTML 安全模式保留 summary、段落與兩個清單項目', kinds.filter(k=>k==='summary').length===1 && kinds.filter(k=>k==='paragraph').length===1 && kinds.filter(k=>k==='list-item').length===2, kinds.join(','));
    const safeCv=renderMapToCanvas({skipRender:true}), safeBg=_canvasBackgroundRgb(safeCv);
    const safeRect=safeHtmlNode ? {x:safeHtmlNode.offsetLeft,y:safeHtmlNode.offsetTop,w:safeHtmlNode.offsetWidth,h:safeHtmlNode.offsetHeight} : null;
    const safePix=_canvasPixelActivity(safeCv,safeRect,safeBg);
    add('HTML 安全模式使用專用 Canvas 路徑', !!(safeCv&&safeCv._mmExportStats&&safeCv._mmExportStats.htmlSafe===1), safeCv&&JSON.stringify(safeCv._mmExportStats));
    add('HTML 安全模式在 Canvas 有可見內容', safePix.active>=20 && safePix.ratio>0.01, `${safePix.active}/${safePix.total}`);
    const jpg=cv.toDataURL('image/jpeg',0.6);
    add('JPG data URL 可產生', /^data:image\/jpeg;base64,/.test(jpg) && jpg.length>200, String(jpg.length));
    const bytes=new Uint8Array([255,216,255,217]);
    const pdf=_buildPdf(bytes, 1, 1, 595.28, 841.89, 24, 24, 100, 100);
    const pdfHead=new TextDecoder().decode(pdf.slice(0,80));
    const pdfText=new TextDecoder().decode(pdf.slice(0,Math.min(pdf.length,900)));
    add('PDF 結構可產生且內含影像物件', pdfHead.startsWith('%PDF-1.4') && /\/Subtype \/Image/.test(pdfText) && /%%EOF/.test(new TextDecoder().decode(pdf.slice(-40))), String(pdf.length));
    const htmlExport=buildSingleFileHTML(toMarkdown(roots));
    add('HTML 靜態展示匯出內容包含文件與目前版次', /^<!DOCTYPE html>/i.test(htmlExport) && htmlExport.includes('MK2MD v'+APP_VERSION), htmlExport.slice(0,80));
    add('HTML 靜態展示匯出會包含目前心智圖快照', htmlExport.includes('data-mk2md-static-viewer="true"') && htmlExport.includes('匯出自檢') && htmlExport.includes('分隔線'), 'static snapshot');
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `匯出自檢通過:${result.passed}/${checks.length}` : `匯出自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    logCaught(e,'export self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'匯出自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('匯出自檢執行失敗');
    return result;
  }finally{
    roots=savedRoots; scale=savedScale; panX=savedPanX; panY=savedPanY; orient=savedOrient;
    htmlDisplayMode=savedHtmlDisplayMode;
    roots.forEach(r=>setParents(r,null));
    selection=new Set();
    savedSelectionIds.forEach(id=>{ const n=findByIdAll(id); if(n) selection.add(n); });
    selected=savedSelectedId ? findByIdAll(savedSelectedId) : null;
    if(!selected && selection.size) selected=[...selection][0];
    try{ render(); applyTransform(); }catch(e){ logCaught(e,'restore after export self test'); }
  }
}
window.runMindMapExportSelfTest=runExportSelfTest;

function runHtmlSingleFileSelfTest(options={}){
  const checks=[]; const add=(name, ok, detail='')=>checks.push({name, ok:!!ok, detail:String(detail||'')});
  try{
    const closingTag='</'+'script>';
    const md=`# HTML Single File Regression

This content must survive single-file HTML export.

---

| Item | Count | State |
| --- | ---: | :---: |
| Divider | 1 | OK |
| Table | 1 | OK |

## Script Boundary
- Literal closing tag: ${closingTag}
`;
    const html=buildSingleFileHTML(md);
    add('HTML 靜態展示含 DOCTYPE 與目前版次', /^<!DOCTYPE html>/i.test(html) && html.includes('MK2MD v'+APP_VERSION), html.slice(0,80));
    add('HTML 靜態展示標記存在', html.includes('data-mk2md-static-viewer="true"'), 'static marker');
    add('HTML 靜態展示不保留編輯器功能', !/exportHTML|exportMd|mdPanel|cmdPalette|runTemplateSelfTest|DEFAULT_MARKDOWN/.test(html), 'no editor code');
    add('HTML 靜態展示保留檢視互動', /function applyTransform/.test(html) && /wheel/.test(html) && /pointerdown/.test(html) && /fitStaticView/.test(html), 'pan zoom fit');
    add('HTML 靜態展示同步水平線與單元線寬規則', /--unit-line-width:2px/.test(html) && /\.mdhrline\{[^}]*stroke-width:var\(--unit-line-width\)/.test(html) && !/hrhandle/.test(html), '2px / no hr handle');
    add('HTML 靜態展示已跳脫 script 結尾字串', html.includes('Literal closing tag: &lt;/script&gt;') && !html.includes('Literal closing tag: '+closingTag), 'script boundary');
    const openingTag='<'+ 'script>';
    const scriptStart=html.lastIndexOf(openingTag), scriptEnd=html.lastIndexOf(closingTag);
    const script=(scriptStart>=0 && scriptEnd>scriptStart) ? html.slice(scriptStart+8, scriptEnd) : '';
    try{ new Function(script); add('HTML 靜態展示內嵌腳本語法可解析', true, String(script.length)); }
    catch(e){ add('HTML 靜態展示內嵌腳本語法可解析', false, String(e&&e.message||e)); }
    add('HTML 靜態展示保留目前內容快照', html.includes('HTML Single File Regression') && html.includes('Divider') && html.includes('Table'), 'snapshot content');
    const failed=checks.filter(c=>!c.ok);
    const result={ok:failed.length===0, passed:checks.length-failed.length, failed:failed.length, checks};
    if(options.log) console.table(checks);
    if(options.toast) showToast(result.ok ? `HTML 單檔自檢通過:${result.passed}/${checks.length}` : `HTML 單檔自檢失敗:${failed.length} 項`);
    return result;
  }catch(e){
    logCaught(e,'html single-file self test');
    const result={ok:false, passed:0, failed:1, checks:[{name:'HTML 單檔自檢執行例外', ok:false, detail:String(e&&e.message||e)}]};
    if(options.toast) showToast('HTML 單檔自檢執行失敗');
    return result;
  }
}
window.runMindMapHtmlSingleFileSelfTest=runHtmlSingleFileSelfTest;

