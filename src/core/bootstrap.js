
"use strict";
/*
  JS 區塊地圖
  1. 版次 / 資料模型 / 主題色
  2. Markdown 工具: escape、inlineMd、表格、parseMarkdown
  3. 版面與渲染: measure、layout、render、連線動畫、debug overlay
  4. 原始 Markdown 面板: buildMdRows、toMarkdown、雙向同步
  5. 匯出: Canvas 繪圖、JPG、PDF、Markdown 下載
  6. 操作: undo/redo、選取、編輯、拖曳、搜尋、剪貼簿
  7. 檔案/視圖/右鍵: loadFile、fit、context menu
  8. 啟動範例與初始化
*/
//===================== 版次資訊(修改本檔請同步更新,並更新檔頭註解與 Changelog)=====================
const APP_NAME = 'MK2MD';
const APP_VERSION = '11.15';
const APP_TITLE = APP_NAME + ' v' + APP_VERSION;
const APP_DATE = '2026-11-04';
function syncAppTitle(){ document.title = APP_TITLE; }
syncAppTitle();
{
  const brand = document.getElementById('brandName');
  if(brand) brand.textContent = APP_NAME;
  const version = document.getElementById('appVersion');
  if(version) version.textContent = 'v' + APP_VERSION + ' · ' + APP_DATE;
}
const saveStateEl = document.getElementById('saveState');
const saveInfoEl = document.getElementById('saveInfo');
const PREF_VERSION='9.82';
const STORAGE_KEYS=Object.freeze({
  prefVersion:'mm-pref-version',
  markdownPanelOpen:'mm-mdopen',
  markdownPanelWidth:'mm-mdw',
  floatingWindows:'mm-fwpos10',
  darkMode:'mm-dark',
  nodeWrap:'mm-node-wrap',
  htmlDisplayMode:'mm-html-display-mode',
  lastExportAt:'mm-last-export-at',
  preExportChecks:'mm-pre-export-checks'
});
const PREF_KEYS=[
  STORAGE_KEYS.markdownPanelOpen,
  STORAGE_KEYS.markdownPanelWidth,
  STORAGE_KEYS.floatingWindows,
  STORAGE_KEYS.darkMode,
  STORAGE_KEYS.nodeWrap,
  STORAGE_KEYS.htmlDisplayMode,
  STORAGE_KEYS.preExportChecks
];
function storageReport(err, context){
  if(typeof logCaught==='function') return logCaught(err, context);
  try{ console.warn('[' + APP_NAME + ']', context, err); }catch(_){}
  return null;
}
function storageGet(key, fallback=null, context){
  try{ const v=localStorage.getItem(key); return v==null ? fallback : v; }
  catch(e){ storageReport(e, context||('read '+key)); return fallback; }
}
function storageSet(key, value, context){
  try{ localStorage.setItem(key, String(value)); return true; }
  catch(e){ storageReport(e, context||('save '+key)); return false; }
}
function storageRemove(key, context){
  try{ localStorage.removeItem(key); return true; }
  catch(e){ storageReport(e, context||('remove '+key)); return false; }
}
function storageJsonGet(key, fallback, context){
  const raw=storageGet(key, null, context||('read '+key));
  if(raw==null) return fallback;
  try{ return JSON.parse(raw); }
  catch(e){ storageReport(e, context||('parse '+key)); return fallback; }
}
function storageJsonSet(key, value, context){ return storageSet(key, JSON.stringify(value), context||('save '+key)); }
(function(){
  try{
    if(storageGet(STORAGE_KEYS.prefVersion)!==PREF_VERSION){
      for(const k of PREF_KEYS) storageRemove(k, 'migrate preference '+k);
      storageSet(STORAGE_KEYS.prefVersion, PREF_VERSION, 'save preference version');
    }
  }catch(e){ try{ console.warn('[' + APP_NAME + '] preference migration', e); }catch(_){} }
})();

const HTML_DISPLAY_MODES=Object.freeze({text:'text',safe:'safe'});
function normalizeHtmlDisplayMode(value){ return value===HTML_DISPLAY_MODES.safe ? value : HTML_DISPLAY_MODES.text; }
let htmlDisplayMode=normalizeHtmlDisplayMode(storageGet(STORAGE_KEYS.htmlDisplayMode, HTML_DISPLAY_MODES.text, 'read HTML display mode'));
function setHtmlDisplayMode(mode, remember=true){
  htmlDisplayMode=normalizeHtmlDisplayMode(mode);
  if(remember) storageSet(STORAGE_KEYS.htmlDisplayMode, htmlDisplayMode, 'save HTML display mode');
  if(typeof render==='function') render();
  if(remember) showToast('HTML 區塊顯示：'+(htmlDisplayMode===HTML_DISPLAY_MODES.safe?'安全顯示':'純文字'));
}

