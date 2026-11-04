//===================== Markdown 表格 =====================
function splitTableRow(line){
  let s=String(line).trim();
  if(s.startsWith('|')) s=s.slice(1);
  if(s.endsWith('|'))  s=s.slice(0,-1);
  const cells=[]; let cur='', esc=false;
  for(const ch of s){
    if(esc){ cur+=(ch==='|'?'|':'\\'+ch); esc=false; continue; }
    if(ch==='\\'){ esc=true; continue; }
    if(ch==='|'){ cells.push(cur.trim()); cur=''; continue; }
    cur+=ch;
  }
  if(esc) cur+='\\';
  cells.push(cur.trim());
  return cells;
}
function isTableDelimRow(line){
  if(String(line).indexOf('-')<0) return false;
  const cells=splitTableRow(line);
  return cells.length>=2 && cells.every(c=>/^:?-{3,}:?$/.test(c.trim()));
}
function parseTableAligns(line){
  return splitTableRow(line).map(c=>{ const t=c.trim(); const l=t.startsWith(':'), r=t.endsWith(':');
    return (l&&r)?'center':r?'right':l?'left':''; });
}
function alignToDelim(a){ return a==='center'?':---:':a==='right'?'---:':a==='left'?':---':'---'; }
function tableToMdRows(tbl){
  const cell=c=>(c==null?'':String(c).replace(/(^|[^\\])\|/g,'$1\\|')); const cols=tbl.header.length; const rows=[];
  rows.push('| '+tbl.header.map(cell).join(' | ')+' |');
  rows.push('| '+tbl.aligns.map(alignToDelim).join(' | ')+' |');
  for(const r of tbl.rows){ const cs=[]; for(let i=0;i<cols;i++) cs.push(cell(r[i])); rows.push('| '+cs.join(' | ')+' |'); }
  return rows;
}
function tableHtml(tbl){
  const al=i=>(tbl.aligns&&tbl.aligns[i])?` style="text-align:${tbl.aligns[i]}"`:'';
  let h='<table class="mdtable"><thead><tr>';
  tbl.header.forEach((c,i)=>{ h+=`<th${al(i)}>${inlineMd(c)}</th>`; });
  h+='</tr></thead>';
  if(tbl.rows.length){ h+='<tbody>';
    for(const r of tbl.rows){ h+='<tr>';
      for(let i=0;i<tbl.header.length;i++) h+=`<td${al(i)}>${inlineMd(r[i]||'')}</td>`;
      h+='</tr>'; }
    h+='</tbody>'; }
  h+='</table>'; return h;
}
function analyzeMarkdownPanelText(text){
  const lines=String(text||'').replace(/\r/g,'').split('\n');
  const issues=[];
  const push=(line, level, message)=>issues.push({line:Math.max(1,line+1), level, message});
  let fence=null, htmlComment=null, details=null;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const fm=line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if(fm){
      if(!fence) fence={line:i, mark:fm[1][0], len:fm[1].length};
      else if(fm[1][0]===fence.mark && fm[1].length>=fence.len) fence=null;
      continue;
    }
    if(fence) continue;
    if(htmlComment==null && /^\s{0,3}<!--/.test(line) && !/-->/.test(line)) htmlComment=i;
    if(htmlComment!=null && i!==htmlComment && /-->/.test(line)) htmlComment=null;
    if(details==null && /^\s{0,3}<details(?:\s|>)/i.test(line) && !/<\/details>/i.test(line)) details=i;
    if(details!=null && i!==details && /<\/details>/i.test(line)) details=null;
    if(line.indexOf('|')>=0 && i+1<lines.length && isTableDelimRow(lines[i+1])){
      const cols=splitTableRow(line).length, delim=splitTableRow(lines[i+1]).length;
      if(cols!==delim) push(i+1, 'error', `表格分隔列欄數 ${delim} 欄,但表頭是 ${cols} 欄`);
      else {
        for(let j=i+2;j<lines.length;j++){
          const row=lines[j];
          if(row.trim()==='' || row.indexOf('|')<0) break;
          const cells=splitTableRow(row).length;
          if(cells!==cols){ push(j, 'warn', `表格資料列有 ${cells} 欄,表頭是 ${cols} 欄`); break; }
        }
      }
    }
  }
  if(fence) push(fence.line, 'error', `程式碼區塊少了結尾 ${fence.mark.repeat(fence.len)}`);
  if(htmlComment!=null) push(htmlComment, 'error', 'HTML 註解少了結尾 -->');
  if(details!=null) push(details, 'warn', '<details> 少了結尾 </details>');
  issues.sort((a,b)=>a.line-b.line || (a.level==='error'?-1:1));
  return {ok:!issues.some(i=>i.level==='error'), issues};
}
window.analyzeMarkdownPanelText=analyzeMarkdownPanelText;
function titleCharCount(text){ return Array.from(String(text||'').replace(/\s+/g,' ').trim()).length; }
const DEFAULT_PRE_EXPORT_CHECKS=Object.freeze({emptyTitle:true, codeFence:true, table:true, longLimit:80});
function normalizePreExportChecks(value){
  const v=value&&typeof value==='object' ? value : {};
  const limit=Number(v.longLimit);
  return {
    emptyTitle:v.emptyTitle!==false,
    codeFence:v.codeFence!==false,
    table:v.table!==false,
    longLimit:[0,80,120].includes(limit) ? limit : DEFAULT_PRE_EXPORT_CHECKS.longLimit
  };
}
function getPreExportChecks(){
  return normalizePreExportChecks(storageJsonGet(STORAGE_KEYS.preExportChecks, DEFAULT_PRE_EXPORT_CHECKS, 'read pre-export checks'));
}
function savePreExportChecks(settings){
  storageJsonSet(STORAGE_KEYS.preExportChecks, normalizePreExportChecks(settings), 'save pre-export checks');
}
function setPreExportCheck(key, value){
  const s=getPreExportChecks();
  s[key]=value;
  savePreExportChecks(s);
  showToast('匯出前檢查設定已更新');
}
function preExportCheckLabel(key, enabled){ return (enabled?'✓ ':'□ ')+key; }
function isMeaningfulNonTitleNode(n){
  return !!(n && (n.kind==='hr' || n.table || n.code!=null || n.htmlRaw || n.refdef || n.fndef || n.alert));
}
function analyzePreExportMarkdown(sourceText, rootsArr){
  const settings=getPreExportChecks();
  const issues=[];
  const add=(level, message, detail, extra={})=>issues.push({level, message, detail:detail||'', ...extra});
  const diag=analyzeMarkdownPanelText(sourceText||'');
  for(const issue of diag.issues){
    const msg=String(issue.message||'');
    if(!settings.codeFence && /程式碼區塊/.test(msg)) continue;
    if(!settings.table && /表格/.test(msg)) continue;
    add(issue.level, `第 ${issue.line} 行:${issue.message}`, '點擊可跳到原始 Markdown 行', {line:issue.line});
  }
  let emptyCount=0, longCount=0, firstEmpty=null, firstLong=null;
  const emptyNodes=[];
  const walk=n=>{
    if(!n) return;
    const title=String(n.title||'');
    if(!isMeaningfulNonTitleNode(n)){
      if(settings.emptyTitle && !title.trim()){ emptyCount++; emptyNodes.push(n); if(!firstEmpty) firstEmpty=n; }
      const len=titleCharCount(title);
      if(settings.longLimit>0 && len>settings.longLimit){
        longCount++;
        if(!firstLong) firstLong={node:n, len, sample:title.replace(/\s+/g,' ').trim().slice(0,38)};
      }
    }
    for(const c of (n.children||[])) walk(c);
  };
  (rootsArr||[]).forEach(walk);
  if(emptyCount) add('warn', `有 ${emptyCount} 個空標題節點`, firstEmpty?'點擊可補成「未命名節點」':'', firstEmpty?{type:'emptyTitle', nodeId:firstEmpty.id, nodeIds:emptyNodes.map(n=>n.id)}:{});
  if(longCount) add('warn', `有 ${longCount} 個節點超過 ${settings.longLimit} 字`, firstLong?`${firstLong.sample}...(${firstLong.len}字);點擊可定位並編輯第一個過長節點`:'', firstLong?{type:'longTitle', nodeId:firstLong.node.id}:{});
  return {ok:issues.length===0, issues};
}
function locatePreExportNode(node){
  if(!node) return false;
  selectOnly(node);
  render();
  centerOn(node);
  if(mdPanelOpen) highlightMdNode(node);
  return true;
}
function applyEmptyTitleQuickFix(node){
  if(!node || isMeaningfulNonTitleNode(node) || String(node.title||'').trim()) return false;
  node.title='未命名節點';
  return true;
}
function applyPreExportSafeFixes(issues, resolveNode=findByIdAll){
  const fixedNodes=[];
  (issues||[]).forEach(issue=>{
    if(!issue || issue.type!=='emptyTitle') return;
    const ids=Array.isArray(issue.nodeIds) && issue.nodeIds.length ? issue.nodeIds : (issue.nodeId?[issue.nodeId]:[]);
    ids.forEach(id=>{
      const node=resolveNode(id);
      if(applyEmptyTitleQuickFix(node)) fixedNodes.push(node);
    });
  });
  return {fixed:fixedNodes.length, nodes:fixedNodes};
}
function fixPreExportEmptyTitle(node){
  if(!node) return false;
  snapshot();
  if(!applyEmptyTitleQuickFix(node)) return false;
  locatePreExportNode(node);
  setStatusMessage('已補上未命名節點','ok',4500);
  showToast('已補上未命名節點');
  return true;
}
function editPreExportLongNode(node){
  if(!locatePreExportNode(node)) return false;
  setTimeout(()=>{ if(selected===node) editSelected(); }, 0);
  setStatusMessage('已定位過長節點,可直接編輯','warn',4500);
  return true;
}
function gotoPreExportIssue(issue){
  if(!issue) return;
  if(issue.line){
    if(!mdPanelOpen) toggleMdPanel(true);
    focusMdLine(issue.line);
    return;
  }
  if(issue.nodeId){
    const node=findByIdAll(issue.nodeId);
    if(node){
      if(issue.type==='emptyTitle') fixPreExportEmptyTitle(node);
      else if(issue.type==='longTitle') editPreExportLongNode(node);
      else locatePreExportNode(node);
    }
  }
}
function preExportSeverityInfo(level){
  if(level==='error') return {key:'error', name:'錯誤', badge:'ERROR', order:0};
  if(level==='warn') return {key:'warn', name:'警告', badge:'WARN', order:1};
  return {key:'info', name:'建議', badge:'INFO', order:2};
}
function buildPreExportReportGroups(issues){
  const buckets=new Map();
  (issues||[]).forEach((issue, idx)=>{
    const sev=preExportSeverityInfo(issue.level);
    if(!buckets.has(sev.key)) buckets.set(sev.key, {...sev, checks:[]});
    buckets.get(sev.key).checks.push({
      name:`${idx+1}. ${issue.message}`,
      ok:false,
      detail:issue.detail||'',
      action:()=>gotoPreExportIssue(issue)
    });
  });
  return [...buckets.values()]
    .sort((a,b)=>a.order-b.order)
    .map(g=>({
      name:g.name,
      badge:g.badge,
      severity:g.key,
      result:{ok:false, passed:0, failed:g.checks.length, checks:g.checks}
    }));
}
function performPreExportSafeFixes(report){
  const issues=(report&&report.issues)||[];
  const fixable=issues.filter(issue=>{
    if(!issue || issue.type!=='emptyTitle') return false;
    const ids=Array.isArray(issue.nodeIds) && issue.nodeIds.length ? issue.nodeIds : (issue.nodeId?[issue.nodeId]:[]);
    return ids.some(id=>{
      const node=findByIdAll(id);
      return !!(node && !isMeaningfulNonTitleNode(node) && !String(node.title||'').trim());
    });
  });
  if(!fixable.length){
    showToast('沒有可安全修正的項目');
    setStatusMessage('沒有可安全修正的項目','warn',3600);
    return {fixed:0, nodes:[]};
  }
  snapshot();
  const result=applyPreExportSafeFixes(fixable);
  if(!result.fixed){
    showToast('沒有可安全修正的項目');
    setStatusMessage('沒有可安全修正的項目','warn',3600);
    return result;
  }
  render();
  if(result.nodes[0]) centerOn(result.nodes[0]);
  setStatusMessage(`已安全修正 ${result.fixed} 個空標題`,'ok',5200);
  showToast(`已安全修正 ${result.fixed} 個空標題`);
  const nextReport=analyzePreExportMarkdown(toMarkdown(roots), roots);
  if(!nextReport.ok) showPreExportReport(nextReport);
  else closeSelfTestReport();
  return result;
}
function rerunPreExportReport(){
  const report=analyzePreExportMarkdown(toMarkdown(roots), roots);
  if(report.ok){
    closeSelfTestReport();
    setStatusMessage('匯出前檢查通過','ok',4200);
    showToast('匯出前檢查通過');
    return report;
  }
  showPreExportReport(report);
  setStatusMessage(`匯出前檢查:${report.issues.length} 個可改善項目`,'warn',5200);
  return report;
}
function ignoreCurrentPreExportReport(report){
  const count=(report&&report.issues&&report.issues.length)||0;
  closeSelfTestReport();
  setStatusMessage(`已忽略本次匯出前檢查提醒:${count} 項`,'warn',5200);
  showToast('已忽略本次提醒');
  return {ignored:count};
}
function buildPreExportReportActions(report){
  const safeFixCount=(report.issues||[]).reduce((sum,i)=>{
    if(!i || i.type!=='emptyTitle') return sum;
    return sum + (Array.isArray(i.nodeIds) && i.nodeIds.length ? i.nodeIds.length : (i.nodeId?1:0));
  },0);
  const actions=[{label:'重新檢查', title:'重新分析目前心智圖', variant:'primary', fn:()=>rerunPreExportReport()}];
  if(safeFixCount) actions.push({label:`全部可安全修正(${safeFixCount})`, title:'只會批次補空標題', variant:'safe', fn:()=>performPreExportSafeFixes(report)});
  actions.push({label:'忽略本次提醒', title:'只關閉目前報告,不改永久設定', variant:'quiet', fn:()=>ignoreCurrentPreExportReport(report)});
  return actions;
}
function showPreExportReport(report){
  const groups=buildPreExportReportGroups(report.issues||[]);
  const checks=groups.flatMap(g=>g.result.checks);
  return showSelfTestReport({
    title:'匯出前檢查',
    summaryText:`需檢查 ${checks.length} 項`,
    ok:false,
    passed:0,
    failed:checks.length,
    checks,
    groups,
    actions:buildPreExportReportActions(report)
  });
}
function confirmMarkdownExportQuality(sourceText, rootsArr){
  const report=analyzePreExportMarkdown(sourceText, rootsArr);
  if(report.ok) return true;
  showPreExportReport(report);
  const msg=`匯出前檢查發現 ${report.issues.length} 個可改善項目,已在右下方列出。\n\n仍要匯出 Markdown 嗎?`;
  setStatusMessage(`匯出前檢查:${report.issues.length} 個可改善項目`,'warn',7000);
  return confirm(msg);
}
window.analyzePreExportMarkdown=analyzePreExportMarkdown;
window.showPreExportReport=showPreExportReport;
window.buildPreExportReportGroups=buildPreExportReportGroups;
window.buildPreExportReportActions=buildPreExportReportActions;
window.ignoreCurrentPreExportReport=ignoreCurrentPreExportReport;
window.applyEmptyTitleQuickFix=applyEmptyTitleQuickFix;
window.applyPreExportSafeFixes=applyPreExportSafeFixes;
function htmlBlockTag(line){
  const m=String(line||'').match(/^\s{0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s|>|\/>)/);
  if(!m) return null;
  const tag=m[1].toLowerCase();
  const blockTags=new Set(['address','article','aside','base','basefont','blockquote','body','caption','center','col','colgroup','dd','details','dialog','dir','div','dl','dt','fieldset','figcaption','figure','footer','form','frame','frameset','h1','h2','h3','h4','h5','h6','head','header','hr','html','iframe','legend','li','link','main','menu','menuitem','nav','noframes','ol','optgroup','option','p','param','section','source','summary','table','tbody','td','tfoot','th','thead','title','tr','track','ul']);
  return blockTags.has(tag) ? tag : null;
}
function isHtmlBlockStart(line){
  const s=String(line||'');
  return /^\s{0,3}<!--/.test(s) || /^\s{0,3}<\?/.test(s) || /^\s{0,3}<![A-Z]/.test(s) || !!htmlBlockTag(s);
}

