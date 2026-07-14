# Search On Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the search window invisible until opened from `Ctrl+F`, the context menu, or the command palette.

**Architecture:** Keep the existing search DOM and search engine. Centralize visibility changes in `openSearch()` and `closeSearch()` so every entry point behaves consistently.

**Tech Stack:** Single-file HTML, CSS, vanilla JavaScript, built-in browser self-tests.

## Global Constraints

- Production deployment remains one `index.html` file.
- Search remains available from the right-click menu and `Ctrl+F`.
- No automatic draft storage is added.
- Desktop-only interface remains unchanged.

---

### Task 1: Search visibility lifecycle

**Files:**
- Modify: `index.html`
- Test: built-in `runSearchExperienceSelfTest()` and `runMindMapFullSelfTest()`

**Interfaces:**
- Consumes: `openSearch()`, `closeSearch()`, `#fwSearch`, `Ctrl+F`, context-menu search command.
- Produces: a single `search-open` visibility state controlled by the existing search functions.

- [ ] Add assertions that the search window is hidden before opening, visible while searching, and hidden after closing.
- [ ] Run the search self-test and confirm it fails against the current always-visible window.
- [ ] Add the minimal CSS and JavaScript visibility handling.
- [ ] Update the existing layout and interaction self-tests for the hidden default state.
- [ ] Update the version and template wording.
- [ ] Run the complete in-app self-test and browser interaction checks.
- [ ] Commit, push, and verify GitHub Pages.
