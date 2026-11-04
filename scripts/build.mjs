import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATE_FILE = 'src/templates/index.html';
export const BRAND_ICON_FILE = 'assets/brand/mk2md-icon.png';
export const CSS_FILES = [
  'src/styles/base.css',
  'src/styles/dark-mode.css',
  'src/styles/panels.css',
];
export const SOURCE_FILES = [
  'src/core/bootstrap.js',
  'src/core/data-model.js',
  'src/core/markdown-tables-and-preflight.js',
  'src/core/markdown-parser.js',
  'src/core/markdown-serializer.js',
  'src/core/layout.js',
  'src/features/render.js',
  'src/features/markdown-panel.js',
  'src/features/export.js',
  'src/features/editor.js',
  'src/features/clipboard.js',
  'src/features/drag-and-zoom.js',
  'src/features/marquee-and-keyboard.js',
  'src/features/file-and-view-actions.js',
  'src/features/search.js',
  'src/features/context-menu.js',
  'src/features/file-drop.js',
  'src/features/floating-windows.js',
  'src/features/self-tests.js',
  'src/features/default-template.js',
  'src/features/startup.js',
];

const JS_BOUNDARIES = [
  '//===================== 資料模型 =====================',
  '//===================== Markdown 表格 =====================',
  '//===================== Markdown 解析 =====================',
  '//===================== Markdown 輸出(100% 原生:標題/清單/任務清單/粗斜體/emoji;不含顏色)=====================',
  '//===================== 版面配置(固定 Markdown 順序:父節點在左,同層由上往下) =====================',
  '//===================== 繪製 =====================',
  '//===================== 右側原始 Markdown 面板(雙向同步) =====================',
  '//===================== 匯出圖片 / PDF(純前端 Canvas,無外部相依) =====================',
  '//===================== 選取 / 編輯 / 結構操作 =====================',
  '//===================== 複製 / 剪下 / 貼上 =====================',
  '//===================== 滑鼠:選取 / 拖曳改掛載 / 平移 / 縮放 =====================',
  '//===================== 框選(marquee) =====================',
  '//===================== 鍵盤 =====================',
  '//===================== 匯入 / 匯出 / 新建 / 置中 =====================',
  '//===================== 搜尋(類 XMind) =====================',
  '//===================== 右鍵選單(整合所有工具列功能;支援子選單)=====================',
  '//===================== 拖放檔案 =====================',
  '//===================== 浮動工具視窗(拖曳 / 收合 / 記憶位置) =====================',
  '//===================== 範本自檢 =====================',
  '//===================== 啟動範例 =====================',
];
const JS_MODULE_NAMES = SOURCE_FILES.map((file) => file.split('/').at(-1));
const CSS_BOUNDARIES = [
  '/* ===== 深色介面(切換 App 外觀;節點顏色固定使用 Vivid 自動調整)===== */',
  '/* ===== 右側原始 Markdown 面板(雙向同步) ===== */',
];

function splitAtMarkers(text, markers) {
  const positions = markers.map((marker) => {
    const position = text.indexOf(marker);
    if (position < 0) throw new Error(`Source boundary was not found: ${marker}`);
    return position;
  });
  if (positions.some((position, index) => index && position <= positions[index - 1])) {
    throw new Error('Source boundaries are not in ascending order.');
  }
  const starts = [0, ...positions];
  const ends = [...positions, text.length];
  return starts.map((start, index) => text.slice(start, ends[index]));
}

async function extractSources(repoRoot) {
  const current = await readFile(path.join(repoRoot, 'index.html'), 'utf8');
  const styleMatch = current.match(/^<style>\r?\n[\s\S]*?^<\/style>$/m);
  const scriptStartMatch = current.match(/^<script>\r?\n/m);
  const scriptEndMatch = [...current.matchAll(/^<\/script>$/gm)].at(-1);
  const scriptStart = scriptStartMatch?.index ?? -1;
  const scriptEnd = scriptEndMatch ? scriptEndMatch.index + scriptEndMatch[0].length : -1;
  if (!styleMatch || scriptStart < 0 || scriptEnd <= scriptStart) throw new Error('Could not locate the single inline style/script blocks.');

  const styleBlock = styleMatch[0];
  const css = styleBlock.slice('<style>'.length, -'</style>'.length);
  const scriptBlock = current.slice(scriptStart, scriptEnd);
  const js = scriptBlock.slice('<script>'.length, -'</script>'.length);
  const template = current
    .replace(styleBlock, '<style>{{APP_CSS}}</style>')
    .replace(scriptBlock, '<script>{{APP_JS}}</script>');
  const cssParts = splitAtMarkers(css, CSS_BOUNDARIES);
  const jsParts = splitAtMarkers(js, JS_BOUNDARIES);
  if (cssParts.length !== CSS_FILES.length || jsParts.length !== SOURCE_FILES.length) throw new Error('Source split map does not match configured files.');

  const destinations = [
    [TEMPLATE_FILE, template],
    ...CSS_FILES.map((file, index) => [file, cssParts[index]]),
    ...SOURCE_FILES.map((file, index) => [file, jsParts[index]]),
  ];
  for (const [relativePath, content] of destinations) {
    const destination = path.join(repoRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, 'utf8');
  }
  return destinations.length;
}

export async function buildHtml(repoRoot = REPO_ROOT) {
  const template = await readFile(path.join(repoRoot, TEMPLATE_FILE), 'utf8');
  const css = (await Promise.all(CSS_FILES.map((file) => readFile(path.join(repoRoot, file), 'utf8')))).join('');
  const js = (await Promise.all(SOURCE_FILES.map((file) => readFile(path.join(repoRoot, file), 'utf8')))).join('');
  const icon = await readFile(path.join(repoRoot, BRAND_ICON_FILE));
  const iconDataUri = `data:image/png;base64,${icon.toString('base64')}`;
  if (!template.includes('{{APP_CSS}}') || !template.includes('{{APP_JS}}') || !template.includes('{{BRAND_ICON_DATA_URI}}')) {
    throw new Error('Template must contain the CSS, JavaScript, and brand icon build placeholders.');
  }
  return template
    .replace('{{APP_CSS}}', () => css)
    .replace('{{APP_JS}}', () => js)
    .replaceAll('{{BRAND_ICON_DATA_URI}}', () => iconDataUri);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--initialize')) {
    const count = await extractSources(REPO_ROOT);
    console.log(`Initialized ${count} source files from the current index.html.`);
    return;
  }
  if (args.has('--check') === args.has('--write')) {
    throw new Error('Choose exactly one mode: --check or --write.');
  }
  const generated = await buildHtml(REPO_ROOT);
  const outputPath = path.join(REPO_ROOT, 'index.html');
  if (args.has('--write')) {
    await writeFile(outputPath, generated, 'utf8');
    console.log('Generated root index.html.');
    return;
  }
  const current = await readFile(outputPath, 'utf8');
  if (generated !== current) throw new Error('index.html is stale. Run: node scripts/build.mjs --write');
  console.log('Build check passed: index.html matches src/ exactly.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
