import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildHtml, SOURCE_FILES, TEMPLATE_FILE } from './build.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(repo, 'index.html'), 'utf8');
const generated = await buildHtml(repo);
assert.equal(generated, html, 'index.html must exactly match the ordered source files');
assert.equal((html.match(/^<script>$/gim) ?? []).length, 1, 'the app must remain a single inline script');
assert.equal((html.match(/^<style>$/gim) ?? []).length, 1, 'the app must remain a single inline style block');
assert.ok(SOURCE_FILES.length >= 8, 'app source must be split into responsibility-based files');
assert.ok(TEMPLATE_FILE.startsWith('src/templates/'), 'HTML shell must live under src/templates');
assert.ok(html.includes('data:image/png;base64,'), 'brand icon must be embedded for offline one-file use');
console.log(`Build contract passed: ${SOURCE_FILES.length} source files produce root index.html byte-for-byte.`);
