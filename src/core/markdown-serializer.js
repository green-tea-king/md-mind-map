//===================== Markdown 輸出(100% 原生:標題/清單/任務清單/粗斜體/emoji;不含顏色)=====================
function toMarkdown(rootsArr){
  return buildMdRows(rootsArr).map(r=>r.t).join('\n') + '\n';
}

