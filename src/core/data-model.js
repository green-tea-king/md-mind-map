//===================== 資料模型 =====================
let uidc = 0;
const uid = () => 'n' + (Date.now().toString(36)) + (uidc++).toString(36);
function makeNode(title){ return {id:uid(), title:title||'', children:[], collapsed:false, parent:null}; }
// 由文字建立節點。顏色一律不從檔案讀(改由主題即時上色);仍去除舊版註解並相容讀舊 ic/ck。
function nodeFrom(text){
  text = String(text);
  let icon, checked;
  let m = text.match(/\s*<!--mm:([^>]*)-->\s*$/);
  if(m){
    text = text.slice(0, m.index);
    m[1].split(';').forEach(kv=>{ const i=kv.indexOf('='); const k=kv.slice(0,i), v=kv.slice(i+1);
      if(k==='ic') icon=v; else if(k==='ck') checked=(v==='1'); });   // f/b/t(顏色)忽略
  } else {
    const o = text.match(/\s*<!--c:[#\w]+-->\s*$/);
    if(o){ text = text.slice(0, o.index); }   // 舊顏色標記:去除但忽略
  }
  let title = text.replace(/\s+$/,'');
  // GFM 任務清單:開頭 [ ] / [x] → 待辦勾選(原生語法,優先於舊的 ck 標記)
  const tm = title.match(/^\[([ xX])\]\s+(.*)$/);
  if(tm){ checked = (tm[1].toLowerCase()==='x'); title = tm[2]; }
  // 圖示原生化:文字開頭若為內建圖示 emoji → 抽成徽章(有舊 ic= 則以 ic= 為準)
  if(icon===undefined){ const im = title.match(LEAD_ICON_RE); if(im){ icon = im[1]; title = title.slice(im[0].length); } }
  const n = makeNode(title);
  if(icon) n.icon=icon; if(checked!==undefined) n.checked=checked;
  return n;
}
function setParents(node, parent){
  node.parent = parent||null;
  if(node.kind==='hr'){ node.children=[]; node.collapsed=false; return; }
  node.children=Array.isArray(node.children) ? node.children : [];
  for(const c of node.children) setParents(c, node);
}
function cloneTree(node){ const n={id:node.id,title:node.title,note:node.note,kind:node.kind,hlevel:node.hlevel,fndef:node.fndef,fnid:node.fnid,alert:node.alert,refdef:node.refdef?{...node.refdef}:undefined,htmlRaw:node.htmlRaw,quoteRaw:node.quoteRaw,orderedNum:node.orderedNum,orderedMarker:node.orderedMarker,fill:node.fill,border:node.border,text:node.text,icon:node.icon,checked:node.checked,ordered:node.ordered,quote:node.quote,table:node.table?{header:[...node.table.header],aligns:[...node.table.aligns],rows:node.table.rows.map(r=>[...r])}:undefined,code:node.code,lang:node.lang,codeFence:node.codeFence,collapsed:node.kind==='hr'?false:node.collapsed,children:node.kind==='hr'?[]:node.children.map(cloneTree),parent:null}; return n; }
// 顏色工具
function hexToRgb(c){ c=String(c).replace('#',''); if(c.length===3) c=c.split('').map(x=>x+x).join(''); const n=parseInt(c,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
function luminance(c){ try{ const [r,g,b]=hexToRgb(c); return (0.299*r+0.587*g+0.114*b)/255; }catch(e){ return 1; } }
function textColor(c){ return luminance(c)>0.62 ? '#1f2933' : '#ffffff'; }
function darken(c,f){ try{ let [r,g,b]=hexToRgb(c); r=Math.round(r*(1-f)); g=Math.round(g*(1-f)); b=Math.round(b*(1-f)); return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join(''); }catch(e){ return '#9aa5b1'; } }
function mixHex(a,b,t){ try{ const [r1,g1,b1]=hexToRgb(a), [r2,g2,b2]=hexToRgb(b); const m=(x,y)=>Math.round(x+(y-x)*t);
  return '#'+[m(r1,r2),m(g1,g2),m(b1,b2)].map(x=>x.toString(16).padStart(2,'0')).join(''); }catch(e){ return a; } }
function hslToHex(h,s,l){ s/=100; l/=100; const k=n=>(n+h/30)%12; const a=s*Math.min(l,1-l);
  const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  const hx=x=>Math.round(255*x).toString(16).padStart(2,'0'); return '#'+hx(f(0))+hx(f(8))+hx(f(4)); }
function applyEffectPalette(el, fill){
  const dark = fill && luminance(fill)<0.45;
  const p = dark
    ? {bold:'#fed7aa',em:'#ddd6fe',del:'#cbd5e1',delLine:'#fecaca',link:'#bae6fd',linkLine:'rgba(186,230,253,.65)',code:'#fde68a',codeBg:'rgba(255,255,255,.16)'}
    : {bold:'#c2410c',em:'#7c3aed',del:'#64748b',delLine:'#ef4444',link:'#0369a1',linkLine:'rgba(3,105,161,.45)',code:'#b45309',codeBg:'rgba(245,158,11,.18)'};
  el.style.setProperty('--fx-bold', p.bold);
  el.style.setProperty('--fx-em', p.em);
  el.style.setProperty('--fx-del', p.del);
  el.style.setProperty('--fx-del-line', p.delLine);
  el.style.setProperty('--fx-link', p.link);
  el.style.setProperty('--fx-link-line', p.linkLine);
  el.style.setProperty('--fx-code', p.code);
  el.style.setProperty('--fx-code-bg', p.codeBg);
}
function hasAnyColor(n){ return !!(n.fill||n.border||n.text) || n.children.some(hasAnyColor); }
// Emoji 短碼對照(常用 + 內建圖示);可自行擴充
const EMOJI={star:'⭐',fire:'🔥',white_check_mark:'✅',check:'✅',heavy_check_mark:'✔️',x:'❌',
  exclamation:'❗',bangbang:'‼️',warning:'⚠️',question:'❓',grey_question:'❔',bulb:'💡',pushpin:'📌',
  round_pushpin:'📍',dart:'🎯','+1':'👍',thumbsup:'👍','-1':'👎',thumbsdown:'👎',heart:'❤️',
  broken_heart:'💔',red_circle:'🔴',green_circle:'🟢',large_blue_circle:'🔵',yellow_circle:'🟡',
  white_circle:'⚪',black_circle:'⚫',bell:'🔔',rocket:'🚀',tada:'🎉',sparkles:'✨',zap:'⚡',boom:'💥',
  sos:'🆘',ok:'🆗',new:'🆕',up:'🔼',down:'🔽',memo:'📝',pencil:'✏️',books:'📚',book:'📖',email:'📧',
  phone:'📞',bug:'🐛',wrench:'🔧',hammer:'🔨',gear:'⚙️',lock:'🔒',unlock:'🔓',key:'🔑',mag:'🔍',
  link:'🔗',flag:'🚩',triangular_flag:'🚩',trophy:'🏆',medal:'🏅',crown:'👑',thinking:'🤔',eyes:'👀',
  muscle:'💪',clap:'👏',pray:'🙏',point_right:'👉',point_left:'👈',arrow_right:'➡️',arrow_left:'⬅️',
  arrow_up:'⬆️',arrow_down:'⬇️',sunny:'☀️',cloud:'☁️',snowflake:'❄️',coffee:'☕',apple:'🍎',
  gift:'🎁',moneybag:'💰',dollar:'💵',hourglass:'⏳',alarm_clock:'⏰',stopwatch:'⏱️',calendar:'📅',
  date:'📆',smile:'😄',laughing:'😆',cry:'😢',angry:'😠',heart_eyes:'😍',sweat_smile:'😅',
  fearful:'😨',sleeping:'😴',sunglasses:'😎',clipboard:'📋',chart:'📊',chart_up:'📈',chart_down:'📉',
  hammer_and_wrench:'🛠️',construction:'🚧',no_entry:'⛔',recycle:'♻️',hot_pepper:'🌶️',seedling:'🌱'};
// 行內 Markdown:粗體/斜體(** *、__ _、***)+ Emoji 短碼;先跳脫 HTML 再轉換(顯示用,編輯/匯出仍原始語法)
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
//===================== 單檔功能區塊索引 =====================
// 基礎設定/儲存 -> Markdown parser -> layout/render -> menu/command -> export -> self-test
// 部署仍維持單一 index.html; 這些區塊標記只用來降低維護時的交叉影響。
const trustedHtmlPolicy=(()=>{
  try{
    return window.trustedTypes ? window.trustedTypes.createPolicy('md-mind-map-renderer', {
      createHTML(value){ return String(value==null?'':value); }
    }) : null;
  }catch(e){
    try{ console.warn('[' + APP_NAME + '] Trusted Types policy unavailable', e); }catch(_){ }
    return null;
  }
})();
const SAFE_HTML_TAGS=new Set(['a','strong','em','del','sup','sub','code','pre','img','table','thead','tbody','tr','th','td','small','span','br','hr','mark','kbd','p','div','blockquote','ul','ol','li','details','summary','h1','h2','h3','h4','h5','h6','svg','line','g','circle','path','rect']);
const SAFE_SVG_TAGS=new Set(['svg','line','g','circle','path','rect']);
const SAFE_HTML_ATTRS=new Set(['class','href','title','rel','alt','src','loading','draggable','data-fnid','aria-hidden','preserveaspectratio','style','open']);
const SAFE_SVG_ATTRS=new Set(['class','aria-hidden','preserveaspectratio','x','y','x1','y1','x2','y2','cx','cy','r','width','height','d','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset','style']);
function safeSvgAttribute(name,value){
  const v=String(value||'').trim();
  if(['x','y','x1','y1','x2','y2','cx','cy','r','width','height','stroke-width','stroke-dashoffset'].includes(name)) return /^-?[0-9.]+%?$/.test(v);
  if(name==='d') return /^[0-9A-Za-z .,+()\-]+$/.test(v);
  if(name==='stroke-dasharray') return /^[0-9. ,]+$/.test(v);
  if(name==='stroke-linecap') return /^(round|butt|square)$/.test(v);
  if(name==='stroke-linejoin') return /^(round|miter|bevel)$/.test(v);
  if(['fill','stroke'].includes(name)) return /^(none|#[0-9a-f]{3,8}|rgba?\([0-9 .,%]+\)|[a-z]+)$/i.test(v);
  if(name==='preserveaspectratio') return /^(none|x(mid|min|max)Y(mid|min|max)( meet| slice)?)$/i.test(v);
  if(name==='style') return /^text-align:(left|center|right)$/.test(v);
  return true;
}
function sanitizeTrustedMarkup(html, namespaceURI){
  const value=String(html==null?'':html);
  const sanitizeChildren=root=>{
    [...root.childNodes].forEach(node=>{
      if(node.nodeType===8){ node.remove(); return; }
      if(node.nodeType!==1) return;
      const tag=node.localName.toLowerCase();
      const isSvg=node.namespaceURI==='http://www.w3.org/2000/svg';
      const allowed=isSvg ? SAFE_SVG_TAGS.has(tag) : SAFE_HTML_TAGS.has(tag);
      if(!allowed){ node.remove(); return; }
      [...node.attributes].forEach(attr=>{
        const name=attr.name.toLowerCase(), attrValue=attr.value;
        if(name.startsWith('on')){ node.removeAttribute(attr.name); return; }
        const attrSet=isSvg ? SAFE_SVG_ATTRS : SAFE_HTML_ATTRS;
        if(!attrSet.has(name)){ node.removeAttribute(attr.name); return; }
        if(isSvg && !safeSvgAttribute(name,attrValue)){ node.removeAttribute(attr.name); return; }
        if(name==='href' && !safeLinkHref(attrValue)){ node.removeAttribute(attr.name); return; }
        if(name==='src' && !safeImgSrc(attrValue)){ node.removeAttribute(attr.name); return; }
        if(name==='style' && !/^text-align:(left|center|right)$/.test(attrValue.trim())) node.removeAttribute(attr.name);
        if(name==='loading' && attrValue!=='lazy') node.removeAttribute(attr.name);
        if(name==='draggable' && attrValue!=='false') node.removeAttribute(attr.name);
        if(name==='rel' && attrValue!=='noopener noreferrer') node.removeAttribute(attr.name);
        if(name==='open' && tag!=='details') node.removeAttribute(attr.name);
      });
      sanitizeChildren(node);
    });
  };
  if(namespaceURI==='http://www.w3.org/2000/svg'){
    const doc=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">'+value+'</svg>','image/svg+xml');
    if(doc.querySelector('parsererror')) return '';
    sanitizeChildren(doc.documentElement);
    return [...doc.documentElement.childNodes].map(node=>node.outerHTML||'').join('');
  }
  const template=document.createElement('template');
  template.innerHTML=trustedHtmlPolicy ? trustedHtmlPolicy.createHTML(value) : value;
  sanitizeChildren(template.content);
  return template.innerHTML;
}
// 唯一允許寫入 HTML 字串的入口。呼叫端必須傳入已 escape 或由白名單產生的內容。
function setTrustedHTML(el, html, reason){
  if(!el) return el;
  if(!reason) throw new Error('setTrustedHTML requires an internal render reason');
  const safeValue=sanitizeTrustedMarkup(html,el.namespaceURI);
  el.innerHTML=trustedHtmlPolicy ? trustedHtmlPolicy.createHTML(safeValue) : safeValue;
  return el;
}
function setSafeText(el, value){
  if(!el) return el;
  el.textContent=String(value==null?'':value);
  return el;
}
function renderHtmlBlockContent(el, raw){
  if(!el) return el;
  clearTrustedHTML(el);
  const source=String(raw==null?'':raw);
  if(htmlDisplayMode===HTML_DISPLAY_MODES.safe){
    setTrustedHTML(el, source, 'markdown HTML safe display');
    el.classList.add('htmlsafe');
    if(!el.childNodes.length){
      const fallback=document.createElement('pre'); fallback.className='mdhtmlraw'; setSafeText(fallback, source); el.appendChild(fallback);
    }
  }else{
    el.classList.remove('htmlsafe');
    const rawEl=document.createElement('pre'); rawEl.className='mdhtmlraw'; setSafeText(rawEl, source); el.appendChild(rawEl);
  }
  return el;
}
function clearTrustedHTML(el){ el.textContent=''; return el; }
const mmErrorLog=[];
function logCaught(err, context){
  const item={
    time:new Date().toISOString(),
    context:String(context||'unknown'),
    message:err && err.message ? String(err.message) : String(err||''),
    stack:err && err.stack ? String(err.stack) : ''
  };
  mmErrorLog.push(item);
  if(mmErrorLog.length>80) mmErrorLog.shift();
  if(window.__MM_DEBUG_ERRORS || (typeof debugLayout!=='undefined' && debugLayout)){
    try{ console.warn('[' + APP_NAME + ']', item.context, err); }catch(_){}
  }
  return item;
}
window.getMindMapErrorLog=()=>mmErrorLog.slice();
function applyNodeWrapWidth(value, rerender){
  const allowed={narrow:'40em',normal:'50em',wide:'60em',none:'none'};
  const key=allowed[value]?value:'normal';
  document.documentElement.style.setProperty('--node-wrap-width', allowed[key]);
  storageSet(STORAGE_KEYS.nodeWrap, key, 'save node wrap width');
  if(rerender && roots.length){ renderKeepingAnchor(selected||roots[0], true); showToast('節點寬度已更新'); }
}
function loadNodeWrapWidth(){ applyNodeWrapWidth(storageGet(STORAGE_KEYS.nodeWrap, 'normal', 'read node wrap width'), false); }
const PERF_WARN_LINES = 800;
const PERF_HEAVY_LINES = 1600;
const PERF_WARN_CHARS = 60000;
const PERF_HEAVY_CHARS = 140000;
const PERF_WARN_NODES = 900;
const PERF_HEAVY_NODES = 1600;
let lastMarkdownPerformance={lines:0, chars:0, nodes:0, large:false, heavy:false, parseMs:0, renderMs:0, debounceMs:300};
function markdownPerfStats(text){
  text=String(text||'');
  const lines=text ? text.split('\n').length : 0;
  const chars=text.length;
  return {
    lines,
    chars,
    large:lines>=PERF_WARN_LINES || chars>=PERF_WARN_CHARS,
    heavy:lines>=PERF_HEAVY_LINES || chars>=PERF_HEAVY_CHARS
  };
}
function markdownCommitDelay(text){
  const s=markdownPerfStats(text);
  return s.heavy ? 1200 : (s.large ? 700 : 300);
}
function updateMarkdownPerformance(stats, nodeCount, parseMs, renderMs, debounceMs){
  const nodes=Number(nodeCount||0);
  lastMarkdownPerformance={
    lines:stats.lines,
    chars:stats.chars,
    nodes,
    large:!!(stats.large || nodes>=PERF_WARN_NODES),
    heavy:!!(stats.heavy || nodes>=PERF_HEAVY_NODES),
    parseMs:Math.round(parseMs||0),
    renderMs:Math.round(renderMs||0),
    debounceMs:Math.round(debounceMs||markdownCommitDelay(''))
  };
  return lastMarkdownPerformance;
}
function markdownPerformanceLabel(perf){
  perf=perf||lastMarkdownPerformance;
  if(!perf || !perf.large) return '';
  const level=perf.heavy ? '大型檔案保護中' : '大型檔案';
  return `${level} · 同步延遲 ${perf.debounceMs||300}ms`;
}
function refDefDisplayText(refdef){
  const raw=String(refdef&&refdef.raw||'');
  const url=String(refdef&&refdef.url||'').trim();
  if(!/^data:image\//i.test(url)) return raw;
  const id=String(refdef&&refdef.id||'').trim() || '圖片';
  const format=/^data:image\/svg\+xml,/i.test(url) ? 'SVG' : '圖片';
  return `[${id}]: 內嵌圖片（${format}）`;
}
function nodeAriaLabel(n){
  if(!n) return '心智圖節點';
  if(n.kind==='hr') return 'Markdown 水平分隔線';
  const title=String(n.title || (n.refdef ? refDefDisplayText(n.refdef) : '') || n.code || '空白節點').replace(/\s+/g,' ').trim().slice(0,90);
  const parts=['心智圖節點', title];
  if(n.depth!=null) parts.push('第 '+(Number(n.depth)+1)+' 層');
  if(n.children&&n.children.length) parts.push(n.collapsed?'已收合':'已展開');
  if(n.checked!==undefined) parts.push(n.checked?'待辦已完成':'待辦未完成');
  return parts.filter(Boolean).join('，');
}
function collectDiagnostics(){
  return {
    app:APP_NAME,
    version:APP_VERSION,
    date:APP_DATE,
    url:location.href,
    roots:roots.filter(isBranchNode).length,
    nodes:roots.reduce((s,r)=>s+countNodes(r),0),
    selected:selected?selected.id:null,
    orientation:orient,
    scale:Number(scale.toFixed(3)),
    saveState:hasUnsavedChanges()?'dirty':'saved',
    lastExportAt:lastExportAt||'',
    performance:lastMarkdownPerformance,
    nodeWrap:getComputedStyle(document.documentElement).getPropertyValue('--node-wrap-width').trim(),
    storageKeys:Object.keys(STORAGE_KEYS),
    templateSelfTest:document.documentElement.dataset.templateSelfTest||'',
    templateSelfTestPassed:document.documentElement.dataset.templateSelfTestPassed||'',
    markdownRuleSelfTest:document.documentElement.dataset.markdownRuleSelfTest||'',
    markdownRuleSelfTestPassed:document.documentElement.dataset.markdownRuleSelfTestPassed||'',
    largeMarkdownSelfTest:document.documentElement.dataset.largeMarkdownSelfTest||'',
    largeMarkdownSelfTestPassed:document.documentElement.dataset.largeMarkdownSelfTestPassed||'',
    largeMarkdownSelfTestFailed:document.documentElement.dataset.largeMarkdownSelfTestFailed||'',
    largeMarkdownSelfTestDetail:document.documentElement.dataset.largeMarkdownSelfTestDetail||'',
    exportSelfTest:document.documentElement.dataset.exportSelfTest||'',
    exportSelfTestPassed:document.documentElement.dataset.exportSelfTestPassed||'',
    exportSelfTestFailed:document.documentElement.dataset.exportSelfTestFailed||'',
    exportSelfTestDetail:document.documentElement.dataset.exportSelfTestDetail||'',
    hrPositionSelfTest:document.documentElement.dataset.hrPositionSelfTest||'',
    hrPositionSelfTestPassed:document.documentElement.dataset.hrPositionSelfTestPassed||'',
    hrPositionSelfTestFailed:document.documentElement.dataset.hrPositionSelfTestFailed||'',
    hrPositionSelfTestDetail:document.documentElement.dataset.hrPositionSelfTestDetail||'',
    commandPaletteSelfTest:document.documentElement.dataset.commandPaletteSelfTest||'',
    commandPaletteSelfTestPassed:document.documentElement.dataset.commandPaletteSelfTestPassed||'',
    commandPaletteSelfTestFailed:document.documentElement.dataset.commandPaletteSelfTestFailed||'',
    commandPaletteSelfTestDetail:document.documentElement.dataset.commandPaletteSelfTestDetail||'',
    contextMenuAccessibilitySelfTest:document.documentElement.dataset.contextMenuAccessibilitySelfTest||'',
    contextMenuAccessibilitySelfTestPassed:document.documentElement.dataset.contextMenuAccessibilitySelfTestPassed||'',
    contextMenuAccessibilitySelfTestFailed:document.documentElement.dataset.contextMenuAccessibilitySelfTestFailed||'',
    contextMenuAccessibilitySelfTestDetail:document.documentElement.dataset.contextMenuAccessibilitySelfTestDetail||'',
    searchExperienceSelfTest:document.documentElement.dataset.searchExperienceSelfTest||'',
    searchExperienceSelfTestPassed:document.documentElement.dataset.searchExperienceSelfTestPassed||'',
    searchExperienceSelfTestFailed:document.documentElement.dataset.searchExperienceSelfTestFailed||'',
    searchExperienceSelfTestDetail:document.documentElement.dataset.searchExperienceSelfTestDetail||'',
    keyboardAccessibilitySelfTest:document.documentElement.dataset.keyboardAccessibilitySelfTest||'',
    keyboardAccessibilitySelfTestPassed:document.documentElement.dataset.keyboardAccessibilitySelfTestPassed||'',
    keyboardAccessibilitySelfTestFailed:document.documentElement.dataset.keyboardAccessibilitySelfTestFailed||'',
    keyboardAccessibilitySelfTestDetail:document.documentElement.dataset.keyboardAccessibilitySelfTestDetail||'',
    interactionSelfTest:document.documentElement.dataset.interactionSelfTest||'',
    interactionSelfTestPassed:document.documentElement.dataset.interactionSelfTestPassed||'',
    interactionSelfTestFailed:document.documentElement.dataset.interactionSelfTestFailed||'',
    interactionSelfTestDetail:document.documentElement.dataset.interactionSelfTestDetail||'',
    errors:mmErrorLog.slice(-20)
  };
}
async function copyDiagnostics(){
  const text=JSON.stringify(collectDiagnostics(), null, 2);
  try{ await navigator.clipboard.writeText(text); showToast('診斷資訊已複製'); }
  catch(e){ logCaught(e,'copy diagnostics'); window.prompt('複製診斷資訊', text); }
}
window.collectMindMapDiagnostics=collectDiagnostics;
window.copyMindMapDiagnostics=copyDiagnostics;
function safeLinkHref(raw){
  const href=String(raw||'').trim().replace(/[\u0000-\u001f\u007f]/g,'');
  try{ const u=new URL(href, location.href); return /^(https?:|mailto:)$/i.test(u.protocol) ? href : null; }
  catch(e){ return null; }
}
function parseInlineTarget(raw){
  let s=String(raw||'').trim(), title='';
  const m=s.match(/^(<[^>]+>|\S+)\s+("([^"]*)"|'([^']*)'|\(([^)]*)\))$/);
  if(m){ s=m[1]; title=m[3]||m[4]||m[5]||''; }
  return {url:stripRefUrl(s), title};
}
function linkHtml(label, rawHref, rawTitle){
  const parsed=parseInlineTarget(rawHref);
  const href=safeLinkHref(parsed.url);
  if(!href) return label;
  const attr=href.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const title=String(rawTitle!=null?rawTitle:parsed.title||'點擊開啟連結').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  return `<a href="${attr}" class="mlink" title="${title}" rel="noopener noreferrer">${label}</a>`;
}
function safeImgSrc(raw){
  let src=String(raw||'').trim().replace(/[\u0000-\u001f\u007f]/g,'');
  if(src.startsWith('<') && src.endsWith('>')) src=src.slice(1,-1).trim();
  if(/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);/i.test(src) || /^data:image\/svg\+xml,/i.test(src)) return src;
  if(/^[a-zA-Z]:[\\/]/.test(src)) src='file:///'+src.replace(/\\/g,'/');
  try{ const u=new URL(src, location.href); return /^(https?:|file:|data:)$/i.test(u.protocol) ? u.href : null; }
  catch(e){ return null; }
}
function imgHtml(alt, rawSrc, rawTitle){
  const parsed=parseInlineTarget(rawSrc);
  const src=safeImgSrc(parsed.url);
  const altAttr=escHtml(alt||'').replace(/"/g,'&quot;');
  if(!src) return '🖼️ '+(alt? escHtml(alt) : '圖片');   // 來源不安全:退回文字標示
  const a=src.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const titleAttr=escHtml(rawTitle!=null?rawTitle:(parsed.title||alt||'')).replace(/"/g,'&quot;');
  return `<img class="mimg" src="${a}" alt="${altAttr}" title="${titleAttr}" loading="lazy" draggable="false">`;
}
function bindRenderedImages(root){
  if(!root || !root.querySelectorAll) return;
  root.querySelectorAll('img.mimg').forEach(img=>{
    img.addEventListener('load',()=>{
      try{ window._imgRelayout&&window._imgRelayout(img.currentSrc||img.src); }catch(e){ logCaught(e,'image load relayout'); }
    },{once:true});
    img.addEventListener('error',()=>{
      const label=img.alt||'圖片';
      img.replaceWith(document.createTextNode('🖼️ '+label));
    },{once:true});
  });
}
let mdRefDefs = {};
function normRefId(id){ return String(id||'').trim().replace(/\s+/g,' ').toLowerCase(); }
function stripRefUrl(raw){
  let u=String(raw||'').trim();
  if(u.startsWith('<') && u.endsWith('>')) u=u.slice(1,-1);
  return u;
}
function parseRefDefLine(line){
  const m=String(line).match(/^\s{0,3}\[([^\]\^][^\]]*)\]:\s*(<[^>]+>|\S+)(?:\s+(.+?))?\s*$/);
  if(!m) return null;
  let title=(m[3]||'').trim();
  if((title.startsWith('"')&&title.endsWith('"')) || (title.startsWith("'")&&title.endsWith("'")) || (title.startsWith('(')&&title.endsWith(')'))) title=title.slice(1,-1);
  return { id:m[1], key:normRefId(m[1]), url:stripRefUrl(m[2]), title, raw:String(line).trim() };
}
function rebuildRefDefsFromRoots(){
  mdRefDefs={};
  const walk=n=>{
    if(n.refdef && n.refdef.key) mdRefDefs[n.refdef.key]=n.refdef;
    for(const c of (n.children||[])) walk(c);
  };
  for(const r of roots||[]) walk(r);
}
function inlineMd(t){
  const _codes=[];
  const _esc=[];
  const _html=[];
  const keepHtml=html=>{ _html.push(html); return '\u0002'+(_html.length-1)+'\u0002'; };
  let s = escHtml(t);
  // 反斜線跳脫 \X:先把被跳脫的標點抽出,避免它被當成 Markdown 語法(CommonMark 可跳脫的 ASCII 標點)
  s = s.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, (m,ch)=>{ _esc.push(ch); return '\u0001'+(_esc.length-1)+'\u0001'; });
  s = s.replace(/(`+)([\s\S]*?)\1/g, (m,ticks,c)=>{ _codes.push(c); return '\u0000'+(_codes.length-1)+'\u0000'; }); // 先抽出行內 `程式碼`,避免內部符號被當成粗斜體
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');     // ***粗斜***
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');                  // **粗體**
  s = s.replace(/(^|[^\w])___(.+?)___(?=[^\w]|$)/g, '$1<strong><em>$2</em></strong>'); // ___粗斜___
  s = s.replace(/(^|[^\w])__(.+?)__(?=[^\w]|$)/g, '$1<strong>$2</strong>'); // __粗體__
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');                              // *斜體*
  s = s.replace(/(^|[^\w])_(.+?)_(?=[^\w]|$)/g, '$1<em>$2</em>');          // _斜體_
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');                            // ~~刪除線~~(GFM)
  s = s.replace(/\[\^([^\]]+)\]/g, (m,id)=>{ const e=String(id).replace(/"/g,'&quot;'); return `<sup class="fnref" data-fnid="${e}" title="跳到腳註 ${e}">[${e}]</sup>`; }); // [^id] 腳註引用標記(須在連結/圖片之前)
  s = s.replace(/!\[([^\]]*)\]\((<[^>]+>|[^)\n]+)\)/g, (m,alt,src)=>keepHtml(imgHtml(alt,src))); // ![alt](url/path "title") 圖片(須在連結之前)
  s = s.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (m,alt,id)=>{ const ref=mdRefDefs[normRefId(id||alt)]; return ref?keepHtml(imgHtml(alt,ref.url,ref.title)):m; }); // 參考式圖片 ![alt][id] / ![alt][]
  s = s.replace(/\[([^\]]+)\]\(((?:<[^>]+>|\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?)\)/g, (m,label,href)=>keepHtml(linkHtml(label,href))); // [文字](網址 "title") 連結
  s = s.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (m,label,id)=>{ const ref=mdRefDefs[normRefId(id||label)]; return ref?keepHtml(linkHtml(label,ref.url,ref.title)):m; }); // 參考式連結 [文字][id] / [文字][]
  s = s.replace(/\[([^\]\s][^\]]*)\]/g, (m,label)=>{ const ref=mdRefDefs[normRefId(label)]; return ref?keepHtml(linkHtml(label,ref.url,ref.title)):m; }); // 捷徑參考式連結 [id]
  s = s.replace(/(?<![">=])\bhttps?:\/\/[^\s<)"']+/g, m=>keepHtml(linkHtml(m,m)));   // 裸網址自動連結
  s = s.replace(/:([a-z0-9_+\-]+):/gi, (m,k)=> EMOJI[k.toLowerCase()] || m); // :fire: 等短碼
  s = s.replace(/\u0000(\d+)\u0000/g, (m,i)=> '<code class="mdcode">'+_codes[+i]+'</code>'); // 還原行內程式碼
  s = s.replace(/\u0001(\d+)\u0001/g, (m,i)=>{ const ch=_esc[+i]; return ch==='<'?'&lt;':ch==='>'?'&gt;':ch==='&'?'&amp;':ch; }); // 還原被跳脫的字元(純文字字面)
  s = s.replace(/\u0002(\d+)\u0002/g, (m,i)=>_html[+i]||'');
  return s;
}
function isDescendant(node, maybeAncestor){ // true if node is descendant of maybeAncestor
  let p = node.parent; while(p){ if(p===maybeAncestor) return true; p=p.parent; } return false;
}

let roots = [];               // 多個中心/根節點(同一畫布上各自獨立的心智圖)
let selected = null;          // 主節點(供編輯/新增/方向鍵)
let selection = new Set();    // 多選集合
let scale = 1, panX = 80, panY = 0;
const history = [];
const redoStack = [];
const MIN_ZOOM_SCALE = 0.03;
const DEFAULT_MIN_ZOOM_SCALE = 0.2;
const MAX_ZOOM_SCALE = 2.5;
let searchMatches=[], searchMatchIds=new Set(), searchIdx=-1, currentMatchId=null;
const STACK_GAP = 56;         // 多個根之間的間距
// 多根輔助
function findByIdAll(id){ for(const r of roots){ const n=findById(r,id); if(n) return n; } return null; }
function rootOf(node){ let p=node; while(p && p.parent) p=p.parent; return p; }

