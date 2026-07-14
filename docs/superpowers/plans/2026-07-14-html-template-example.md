# HTML Template Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in `<details>` HTML block example that visibly demonstrates the existing plain-text and allowlist-safe display modes.

**Architecture:** Keep deployment as the existing single `index.html`. Extend the existing template statistics and self-test first, then add one self-contained HTML block to `DEFAULT_MARKDOWN`; update version metadata and README without changing the sanitizer or default display mode.

**Tech Stack:** Single-file HTML, vanilla JavaScript, CSS, Markdown parser, GitHub Pages Actions, Playwright with installed Chrome.

## Global Constraints

- Default HTML display mode remains `text`.
- Do not expand the HTML allowlist.
- Do not add a toolbar or mobile entry point.
- Do not add external images, URLs, scripts, event attributes, or network requests.
- GitHub Pages continues publishing only `index.html` and `.nojekyll`.
- Do not delete files without explicit user confirmation.

---

### Task 1: Add the HTML template example with regression coverage

**Files:**
- Modify: `index.html` template statistics, `runTemplateSelfTest`, version header, and `DEFAULT_MARKDOWN`
- Modify: `README.md` current version, feature list, and deployment example

**Interfaces:**
- Consumes: `collectTemplateStats(markdown)`, `runTemplateSelfTest(options)`, `DEFAULT_MARKDOWN`, `toMarkdown(roots)`
- Produces: `stats.html` as a number and one built-in `kind === 'html'` template node

- [ ] **Step 1: Write the failing template self-test**

Add HTML counting to `collectTemplateStats` and assertions to `runTemplateSelfTest` before changing `DEFAULT_MARKDOWN`:

```js
const stats={roots:parsed.length,nodes:0,preamble:0,hr:0,table:0,code:0,html:0,alert:0,alerts:new Set(),fndef:0,refdef:0,quote:0,notes:0,todo:0,ordered:0,images:0,links:0};
// inside walk(n)
if(n.kind==='html') stats.html++;

// inside runTemplateSelfTest
add('HTML 區塊示範存在', stats.html>=1, `${stats.html} html`);
add('匯出仍保留 HTML 區塊原文', /<details open>[\s\S]*<\/details>/.test(exported), 'details');
```

- [ ] **Step 2: Run the browser test and verify the new checks fail**

Run the local page through Playwright using installed Chrome and inspect the startup dataset.

Expected result:

```text
templateSelfTest=fail
templateSelfTestFailed=2
```

The two failures must be `HTML 區塊示範存在` and `匯出仍保留 HTML 區塊原文`.

- [ ] **Step 3: Add the minimal built-in Markdown example**

Insert this block after the indented code example and before the GFM alert example in `DEFAULT_MARKDOWN`:

```markdown
## 🌐 HTML 區塊顯示
- HTML 區塊預設顯示原始碼;右鍵 → 檢視 → HTML 區塊顯示,可切換成白名單安全顯示
- 下面使用 details、粗體與清單,安全顯示時會變成可展開、收合的內容
<details open>
<summary>HTML 安全顯示示範</summary>
<p><strong>這段內容通過白名單後才會顯示。</strong></p>
<ul><li>不執行腳本</li><li>匯出 Markdown 保留原始 HTML</li></ul>
</details>
```

- [ ] **Step 4: Update version metadata and documentation**

Update all version locations to `v10.69` and date `2026-07-14`:

```js
const APP_VERSION = '10.69';
const APP_DATE = '2026-07-14';
```

Add this changelog entry:

```text
2026-07-14  v10.69 內建範本新增 HTML details 區塊,直接示範純文字與白名單安全顯示差異。
```

Update `README.md` current version and deploy example to `v10.69`, and state that the built-in template includes an HTML display example.

- [ ] **Step 5: Run syntax and complete local verification**

Run:

```powershell
git diff --check
```

Extract the application `<script>` from `index.html`, run `node --check`, then open:

```text
http://127.0.0.1:8772/index.html?v=1069-html-template-local
```

Expected results:

```text
MD心智圖 v10.69
templateSelfTest=pass
templateSelfTestFailed=0
all automatic self-test groups pass
no JavaScript console errors
```

Also verify that default mode shows the literal `<details open>` source and safe mode produces a visible `<details>` element without a `<script>` element.

- [ ] **Step 6: Commit, push, and verify GitHub Pages**

Run:

```powershell
git add -- index.html README.md
git commit -m "Add HTML block example to built-in template"
git push origin master
```

Wait for the `Deploy GitHub Pages` workflow and verify:

```text
https://green-tea-king.github.io/md-mind-map/?v=1069-html-template-live
```

Expected results match Step 5, and `git status --short --branch` shows `master...origin/master` with no uncommitted changes.
