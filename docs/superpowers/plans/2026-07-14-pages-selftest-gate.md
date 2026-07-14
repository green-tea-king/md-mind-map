# Pages Self-Test Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block GitHub Pages deployment unless all 11 browser self-test groups pass.

**Architecture:** Expose the existing full self-test result as DOM data attributes only for a CI query parameter. Test the prepared Pages artifact through a local HTTP server and preinstalled headless Chrome before upload.

**Tech Stack:** Single-file HTML, vanilla JavaScript, GitHub Actions, headless Google Chrome, Python HTTP server.

## Global Constraints

- Normal users do not see or trigger the CI test path.
- Production remains a single `index.html` file.
- No new package dependency is added.

---

### Task 1: Browser self-test gate

**Files:**
- Modify: `index.html`
- Modify: `.github/workflows/pages.yml`
- Modify: `README.md`

- [ ] Confirm the CI sentinel check fails before implementation.
- [ ] Add a query-controlled full self-test runner and DOM result attributes.
- [ ] Add a headless Chrome check before Pages artifact upload.
- [ ] Verify the passing result reports 11 passed groups and 0 failed groups.
- [ ] Verify the normal URL does not create the CI result attributes.
- [ ] Push and confirm both the self-test and deploy jobs succeed.
