# MK2MD Project Structure and Brand Implementation Plan

**Goal:** Organize MK2MD into a clean, understandable project tree with feature-grouped source files, an obvious Windows launcher, root-level user/maintainer/history documents, and a generated single-file app that remains compatible with GitHub Pages.

**Architecture:** Keep `index.html` as the generated, directly-openable app and existing Pages artifact. Make `src/` the source of truth, split HTML/CSS/JavaScript by responsibility, and use a dependency-free Node build script to concatenate the ordered sources. Keep deployment and test tooling in `scripts/`, preserve the existing Pages repository and branch, and move only positively identified obsolete local assets into `temp/` without deleting them.

**Tech Stack:** Existing vanilla HTML/CSS/JavaScript, Node.js built-ins, PowerShell, GitHub Actions Pages.

## Global Constraints

- Work only in `W:\4. TODO\@MK2MD`; do not create another project or worktree.
- Preserve the existing one-file `index.html` runtime and original GitHub Pages repository, branch, workflow, and URL.
- Preserve the six pre-existing tracked modifications; do not reset, checkout, stage, commit, push, or deploy.
- Do not delete any file; place only confirmed obsolete files in `temp/` and retain them.
- Keep README, AGENTS, PROJECT_RULES, and CHANGELOG at the repository root.
- Keep the brand name `MK2MD`, use selected Flaticon icon candidate C with required attribution, preserve current interaction/layout structure, and use the existing blue palette as the recommended baseline unless accessibility checks show a defect.
- Update the application version and date everywhere required by the repo rules.

---

### Task 1: Capture current source boundaries and add a deterministic build gate

**Files:**
- Create: `scripts/build.mjs`
- Create: `scripts/test-build.mjs`
- Create: `src/templates/index.html`
- Create: `src/styles/base.css`
- Create: `src/styles/canvas.css`
- Create: `src/styles/panels.css`
- Create: `src/core/bootstrap.js`
- Create: `src/core/model-and-markdown.js`
- Create: `src/core/render-and-layout.js`
- Create: `src/features/editor.js`
- Create: `src/features/drag-zoom.js`
- Create: `src/features/markdown-panel.js`
- Create: `src/features/export.js`
- Create: `src/features/menus-and-search.js`
- Create: `src/features/diagnostics-and-selftests.js`
- Create: `src/features/startup.js`
- Modify: `.github/workflows/pages.yml`
- Modify: `deploy.ps1`
- Test: `scripts/check-version-consistency.test.js`
- Test: `scripts/test-deploy.ps1`

**Interfaces:**
- `scripts/build.mjs --write` assembles the exact root `index.html` from the shell template, ordered CSS files, and ordered classic-script source files; concatenation preserves the shared lexical scope and execution order.
- `scripts/build.mjs --check` performs the same assembly in memory and exits nonzero when root `index.html` differs.
- `scripts/test-build.mjs` verifies source presence/order, placeholders, exactly one runtime inline script, and byte-for-byte deterministic output.

- [ ] Inspect line boundaries before extraction; create a baseline SHA-256 for the current root `index.html` and preserve all existing changes.
- [ ] Split source at existing semantic section markers without changing statements or order.
- [ ] Write the assembler and failing build-contract tests.
- [ ] Run build tests; require the expected initial mismatch to fail before generation.
- [ ] Generate `index.html`, compare the resulting app behavior and output structure against baseline.
- [ ] Add `node scripts/test-build.mjs` and `node scripts/build.mjs --check` to GitHub Actions and deployment preflight.

### Task 2: Add an obvious launcher and organize deployment scripts

**Files:**
- Create: `啟動 MK2MD.bat`
- Move: `deploy.ps1` to `scripts/deploy.ps1`
- Modify: `scripts/start-deploy.ps1`
- Modify: `scripts/test-deploy.ps1`
- Modify: `README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Root `啟動 MK2MD.bat` opens the already-built root `index.html` in the default browser and does not require Node.js.
- `scripts/start-deploy.ps1` launches `scripts/deploy.ps1` from a stable working directory; the deployment script resolves repository root as its parent directory.

- [ ] Update deployment script self-location/repository-root logic and all callers/test fixtures from root `deploy.ps1` to `scripts/deploy.ps1`.
- [ ] Add the launcher with a clear error if `index.html` is missing.
- [ ] Run deployment contract tests and a local launcher smoke test.

### Task 3: Keep root documentation complete and versioned

**Files:**
- Create: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `PROJECT_RULES.md`
- Modify: `index.html` (generated)
- Modify: `src/core/bootstrap.js` (version source)

- [ ] Copy the existing complete history into root `CHANGELOG.md`, preserving old entries and dates.
- [ ] Add the new architecture/build/launcher entry at the top.
- [ ] Bump app version from `11.14` to `11.15` and date to `2026-11-04`; synchronize the generated header, runtime constants, self-test expected version, README, and AGENTS baseline.
- [ ] Document source-of-truth rules: edit `src/`, run the build, do not hand-edit generated `index.html`.
- [ ] Run version consistency tests and read back each version source.

### Task 4: Add selected brand assets and safely group confirmed obsolete files

**Files:**
- Create: `assets/brand/mk2md-icon.svg`
- Create: `assets/brand/ATTRIBUTION.md`
- Create: `temp/README.md`
- Modify: `src/templates/index.html`
- Modify: `src/styles/base.css`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] Obtain Flaticon candidate C as a local SVG asset and preserve its exact author/source attribution; inline the SVG during build so the single-file app works offline.
- [ ] Replace the emoji brand mark/favIcon with that asset and align global interface tokens to the current blue palette without changing user-defined mind-map node colors or layout.
- [ ] Inventory old, redundant, and nonessential root files with hashes; move only confirmed safe historical files to `temp/`; do not delete or touch data not proven obsolete.
- [ ] Keep `temp/` excluded from Pages/Git tracking and protected by the deployment snapshot test.
- [ ] Verify the resulting tree and icon/license note.

### Task 5: Run full regression and review the complete diff

**Files:**
- Test: `node scripts/test-build.mjs`
- Test: `node scripts/check-version-consistency.test.js`
- Test: `node scripts/check-version-consistency.js`
- Test: `pwsh -NoProfile -File scripts/test-deploy.ps1`
- Test: full browser CI gate from `.github/workflows/pages.yml`
- Test: `git diff --check`

- [ ] Confirm `index.html` is reproducible from `src/` and remains the only Pages app artifact.
- [ ] Run the existing 11/11 browser self-tests and drag/drop/reorder regressions.
- [ ] Run deployment contract tests including protected `temp/` snapshot behavior.
- [ ] Confirm no pre-existing changes were discarded, no unrelated function changed, and no app dependency was added.
- [ ] Report local completion; no commit, push, or deployment in this task.
