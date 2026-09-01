# Canvas inspector builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the workbench-card editor with a canvas the author clicks, a hideable inspector (Add / Options), two hide levels, and auto-wrap of top-level content, without changing the stored page.

**Architecture:** Selection and wrap/add mutations live in domain functions. `BlockEditor` renders the live page as the canvas (`pageBoxClass` + public `Block`), mounts the inspector only while something is selected, and reuses `BlockCard` / `LeafEditor` / identity / theme inside Options. Preview remains hide-controls.

**Tech Stack:** Next.js hub, react-hook-form, existing block-edits / dnd-kit, Playwright e2e.

## Global Constraints

- No stored-page migration; no `0009` edit; no `moveBlock` rewrite in phase 1.
- Inspector and outline wear `CHROME_SCOPE` so hide-controls still removes them.
- Spanish fallback; every new string in both catalogues.
- `pnpm check:docs` on new domain exports; TSDoc states the contract.
- Branch from `origin/main`. Picture proof on the PR, not in git.

---

### Task 1: Domain — selection, wrap, add into a target

**Files:**

- Modify: `apps/hub/src/features/actors/domain/block-edits.ts`
- Create: `apps/hub/src/features/actors/domain/editor-selection.ts`
- Test: `apps/hub/tests/block-edits.test.ts`, `apps/hub/tests/editor-selection.test.ts`

- [ ] Failing tests for `blockAt`, `wrapLeafOnPage`, `addContentAt`, path parse
- [ ] Implement until green

### Task 2: Inspector shell + canvas selection

**Files:**

- Create: `apps/hub/src/features/actors/presentation/canvas-inspector.tsx`
- Modify: `block-editor.tsx`, `blocks.tsx` (`data-block-path`), `fursona-editor.tsx`, `editor-toolbar.tsx`
- Test: `apps/hub/tests/block-editor.test.tsx`, `apps/hub/tests/fursona-editor.test.tsx`

- [ ] Inspector absent until select; Escape / empty canvas deselect; Preview hides chrome

### Task 3: Options tab holds existing controls

Identity, theme, `BlockCard`, `LeafEditor` move into Options. Canvas keeps `block-preview` test id on each page box.

### Task 4: Add tab + drop-on-canvas

Click and HTML5 drop call `addContentAt` / `wrapLeafOnPage`. Auto-select the new block.

### Task 5: Labels, feature note, e2e, PR proof

Catalogues, `labels.ts`, `CLAUDE.md`, `editor-is-the-page.spec.ts`, new `canvas-inspector.spec.ts`, update `support/editor.ts` helpers, picture proof on the PR.
