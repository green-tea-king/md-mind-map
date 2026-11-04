//===================== 版面配置(固定 Markdown 順序:父節點在左,同層由上往下) =====================
const HGAP = 54, VGAP = 18;       // 固定版面:欄距 / 同層垂直間距
const ROWGAP = 58, COLGAP = 26;   // 舊直式相容:列距 / 同層水平間距
const TRUNK_GAP = 28;             // 幹線(分支交點)距父節點的距離;連線與開關鈕共用
const HR_MIN_WIDTH = 180;         // 水平分隔線的基準寬度,避免短線太像裝飾點
let orient = 'h';                 // 固定 Markdown 順序:父節點在左、同層節點由上往下排列

function isBranchNode(n){ return !!n && n.kind!=='hr'; }
function visibleChildren(n){ return n.kind==='hr' ? [] : (n.collapsed ? [] : n.children); }
function createToggleGlyph(collapsed){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 14 14');
  svg.setAttribute('aria-hidden','true');
  const horizontal=document.createElementNS('http://www.w3.org/2000/svg','line');
  horizontal.setAttribute('x1','3'); horizontal.setAttribute('y1','7');
  horizontal.setAttribute('x2','11'); horizontal.setAttribute('y2','7');
  svg.appendChild(horizontal);
  if(collapsed){
    const vertical=document.createElementNS('http://www.w3.org/2000/svg','line');
    vertical.setAttribute('x1','7'); vertical.setAttribute('y1','3');
    vertical.setAttribute('x2','7'); vertical.setAttribute('y2','11');
    svg.appendChild(vertical);
  }
  return svg;
}
function branchChildren(n, opts){
  const source = opts && opts.includeCollapsed ? (n.children||[]) : visibleChildren(n);
  return source.filter(isBranchNode);
}
function hasBranchChildren(n){ return branchChildren(n, {includeCollapsed:true}).length>0; }
function measure(node){
  const list = [];
  (function walk(n, depth){ list.push({node:n,depth}); for(const c of visibleChildren(n)) walk(c, depth+1); })(node,0);
  return list;
}
// 座標慣例(兩種方向皆然,讓定位/置中程式碼不變):_x = 左緣,_y = 垂直中心
function layout(node, mainPos){
  if(orient==='h'){
    function shiftY(n, dy){ n._y+=dy; for(const c of visibleChildren(n)) shiftY(c, dy); }
    function fullBoundsY(n){
      let min=n._y-n._h/2, max=n._y+n._h/2;
      for(const c of visibleChildren(n)){ const b=fullBoundsY(c); min=Math.min(min,b.min); max=Math.max(max,b.max); }
      return {min,max};
    }
    function branchBoundsY(n){
      let min=n._y-n._h/2, max=n._y+n._h/2;
      for(const c of branchChildren(n)){ const b=branchBoundsY(c); min=Math.min(min,b.min); max=Math.max(max,b.max); }
      return {min,max};
    }
    function decorBandSize(items, gap){
      const decor=items.filter(c=>!isBranchNode(c));
      if(!decor.length) return gap;
      return gap*(decor.length+1) + decor.reduce((sum,c)=>sum+(c._h||0),0);
    }
    function positionDecorBySourceOrder(n, ch, childX){
      function placeDecorList(list, startY, endY){
        if(!list.length) return;
        const contentH=list.reduce((sum,c)=>sum+(c._h||0),0);
        const gap=Math.max(0,(endY-startY-contentH)/(list.length+1));
        let y=startY+gap;
        for(const c of list){
          c._x=childX;
          c._y=y+c._h/2;
          c._sub=c._h;
          y+=c._h+gap;
          for(const gc of visibleChildren(c)){
            if(gc._x==null || gc._y==null){
              gc._x=c._x+c._w+HGAP;
              gc._y=c._y;
              gc._sub=gc._h||0;
            }
          }
        }
      }
      const branchItems=ch.map((node,index)=>({node,index})).filter(it=>isBranchNode(it.node));
      if(!branchItems.length){
        placeDecorList(ch.filter(c=>!isBranchNode(c)), n._y+n._h/2+VGAP/2, n._y+n._h/2+VGAP*2);
        return;
      }
      const leading=ch.slice(0,branchItems[0].index).filter(c=>!isBranchNode(c));
      if(leading.length){
        const nb=branchBoundsY(branchItems[0].node);
        const band=decorBandSize(leading, VGAP);
        placeDecorList(leading, nb.min-band, nb.min);
      }
      for(let i=0;i<branchItems.length-1;i++){
        const left=branchItems[i], right=branchItems[i+1];
        const between=ch.slice(left.index+1,right.index).filter(c=>!isBranchNode(c));
        if(!between.length) continue;
        const pb=branchBoundsY(left.node), nb=branchBoundsY(right.node);
        placeDecorList(between, pb.max, nb.min);
      }
      const trailing=ch.slice(branchItems[branchItems.length-1].index+1).filter(c=>!isBranchNode(c));
      if(trailing.length){
        const pb=branchBoundsY(branchItems[branchItems.length-1].node);
        const band=decorBandSize(trailing, VGAP);
        placeDecorList(trailing, pb.max, pb.max+band);
      }
    }
    function place(n, depth, top, x){ n._x=x;                    // 子節點與自己的父節點保持固定間距
      const ch=visibleChildren(n);
      if(!ch.length){ n._y=top+n._h/2; n._sub=n._h; return fullBoundsY(n); }
      let cursor=top, first=null, last=null;
      const childX=n._x+n._w+HGAP;
      const branchItems=ch.map((node,index)=>({node,index})).filter(it=>isBranchNode(it.node));
      for(let i=0;i<branchItems.length;i++){
        const item=branchItems[i], c=item.node;
        let b=place(c,depth+1,cursor,childX);
        const dy=cursor-b.min;
        if(Math.abs(dy)>0.01){ shiftY(c,dy); b={min:b.min+dy,max:b.max+dy}; }
        first=first||c; last=c;
        const next=branchItems[i+1];
        const between=next ? ch.slice(item.index+1,next.index) : [];
        cursor=b.max+decorBandSize(between, VGAP);
      }
      if(first && last) n._y=(first._y+last._y)/2;
      else n._y=top+n._h/2;
      positionDecorBySourceOrder(n, ch, childX);
      const b=branchItems.length ? fullBoundsY(n) : {min:n._y-n._h/2,max:n._y+n._h/2};
      n._sub=Math.max(n._h,b.max-b.min); return b;
    }
    place(node,0,0,0);
  } else {
    function decorBandSizeX(items, gap){
      const decor=items.filter(c=>!isBranchNode(c));
      if(!decor.length) return gap;
      return gap*(decor.length+1) + decor.reduce((sum,c)=>sum+(c._w||0),0);
    }
    function subSize(n){ const ch=visibleChildren(n);
      if(!ch.length){ n._sub=n._w; return n._sub; }
      const branchItems=ch.map((node,index)=>({node,index})).filter(it=>isBranchNode(it.node));
      if(!branchItems.length){ n._sub=n._w; return n._sub; }
      let s=0;
      const leading=ch.slice(0,branchItems[0].index);
      if(leading.length) s+=decorBandSizeX(leading, COLGAP);
      for(let i=0;i<branchItems.length;i++){
        const item=branchItems[i], next=branchItems[i+1];
        s+=subSize(item.node);
        if(next) s+=decorBandSizeX(ch.slice(item.index+1,next.index), COLGAP);
      }
      const trailing=ch.slice(branchItems[branchItems.length-1].index+1);
      if(trailing.length) s+=decorBandSizeX(trailing, COLGAP);
      n._sub=Math.max(s,n._w); return n._sub; }
    function positionDecorXBySourceOrder(n, ch, childY){
      function branchBoundsX(bn){
        let min=bn._x, max=bn._x+bn._w;
        for(const bc of branchChildren(bn)){ const b=branchBoundsX(bc); min=Math.min(min,b.min); max=Math.max(max,b.max); }
        return {min,max};
      }
      function placeDecorList(list, startX, endX){
        if(!list.length) return;
        const contentW=list.reduce((sum,c)=>sum+(c._w||0),0);
        const gap=Math.max(0,(endX-startX-contentW)/(list.length+1));
        let x=startX+gap;
        for(const c of list){
          c._x=x;
          c._y=childY+c._h/2;
          c._sub=c._w;
          x+=c._w+gap;
        }
      }
      const branchItems=ch.map((node,index)=>({node,index})).filter(it=>isBranchNode(it.node));
      if(!branchItems.length){
        placeDecorList(ch.filter(c=>!isBranchNode(c)), n._x+n._w/2, n._x+n._w/2+COLGAP*2);
        return;
      }
      const leading=ch.slice(0,branchItems[0].index).filter(c=>!isBranchNode(c));
      if(leading.length){
        const nb=branchBoundsX(branchItems[0].node);
        const band=decorBandSizeX(leading, COLGAP);
        placeDecorList(leading, nb.min-band, nb.min);
      }
      for(let i=0;i<branchItems.length-1;i++){
        const left=branchItems[i], right=branchItems[i+1];
        const between=ch.slice(left.index+1,right.index).filter(c=>!isBranchNode(c));
        if(!between.length) continue;
        const pb=branchBoundsX(left.node), nb=branchBoundsX(right.node);
        placeDecorList(between, pb.max, nb.min);
      }
      const trailing=ch.slice(branchItems[branchItems.length-1].index+1).filter(c=>!isBranchNode(c));
      if(trailing.length){
        const pb=branchBoundsX(branchItems[branchItems.length-1].node);
        const band=decorBandSizeX(trailing, COLGAP);
        placeDecorList(trailing, pb.max, pb.max+band);
      }
    }
    function place(n, depth, left){ n._y=mainPos[depth]+n._h/2;  // 同層靠上齊頭(列線對齊上緣)
      const ch=visibleChildren(n);
      if(!ch.length){ n._x=left+(n._sub-n._w)/2; return; }
      const branchItems=ch.map((node,index)=>({node,index})).filter(it=>isBranchNode(it.node));
      if(!branchItems.length){ n._x=left+(n._sub-n._w)/2; positionDecorXBySourceOrder(n,ch,mainPos[depth+1]||mainPos[depth]); return; }
      let span=0;
      for(let i=0;i<branchItems.length;i++){
        const item=branchItems[i], next=branchItems[i+1];
        span+=item.node._sub;
        if(next) span+=decorBandSizeX(ch.slice(item.index+1,next.index), COLGAP);
      }
      let l=left+Math.max(0,(n._sub-span)/2);                            // node 較寬時:子群置中於 slot
      let first=null, last=null;
      for(let i=0;i<branchItems.length;i++){
        const item=branchItems[i], c=item.node, next=branchItems[i+1];
        place(c,depth+1,l); first=first||c; last=c;
        const between=next ? ch.slice(item.index+1,next.index) : [];
        l+=c._sub+decorBandSizeX(between, COLGAP);
      }
      const cf=first._x+first._w/2, cl=last._x+last._w/2;
      n._x=(cf+cl)/2 - n._w/2;
      positionDecorXBySourceOrder(n,ch,mainPos[depth+1]||mainPos[depth]); }
    subSize(node); place(node,0,0);
  }
}

