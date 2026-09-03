# Editor Preview, Selection, and Canvas Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear editor selection when Preview opens or the inspector closes,
and make the canvas—not the document—the only vertical scroller while controls
are visible.

**Architecture:** `FursonaEditor` remains the owner of Preview state and passes
`controlsHidden` into `BlockEditor`, which remains the owner of selection and
the canvas node. `BlockEditor` derives no visible selection while Preview is
active, clears its stored selection and both scroll positions in a layout
effect, and exposes one explicit close callback to `CanvasInspector`. Edit mode
forms a bounded flex chain under the app header; Preview removes that bound so
the unchanged page tree returns to document scrolling.

**Tech Stack:** React 19, react-hook-form, Tailwind CSS v4, Vitest with Testing
Library, Playwright, next-intl.

## Global Constraints

- Work test-first. Every production behavior is preceded by a failing test and
  the failure is observed for the intended reason.
- Do not commit; repository rules require an explicit user request.
- Do not add a renderer, iframe, stored state, schema change, or dependency.
- `BlockEditor` remains the sole owner of `EditorSelection`.
- Preview continues to use `data-controls="hidden"` and `CHROME_SCOPE`.
- A vertical scroller clips only at the outer canvas viewport boundary. No
  section, tray, or block receives `overflow`.
- Update exported TSDoc and `apps/hub/src/features/actors/CLAUDE.md` in the same
  change as the implementation.

---

### Task 1: Selection clears from Preview and inspector Close

**Files:**

- Modify: `apps/hub/tests/block-editor.test.tsx`
- Modify: `apps/hub/tests/fursona-editor.test.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/canvas-inspector.tsx`
- Modify: `apps/hub/src/features/actors/presentation/fursona-editor.tsx`
- Modify: `apps/hub/src/app/[locale]/(app)/pages/labels.ts`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/en.json`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/es.json`
- Modify: `apps/hub/tests/support/editor-labels.ts`

**Interfaces:**

- `BlockEditorProps.controlsHidden: boolean`
- `CanvasInspectorLabels.close: string`
- `CanvasInspectorProps.onClose: () => void`
- Test id: `inspector-close`

- [ ] **Step 1: Add failing component tests**

Add cases that:

```tsx
fireEvent.click(screen.getByTestId("select-page"));
rerender(<Harness controlsHidden />);
expect(screen.queryByTestId("canvas-inspector")).toBeNull();
rerender(<Harness controlsHidden={false} />);
expect(screen.queryByTestId("canvas-inspector")).toBeNull();
```

and drive `inspector-close` from Page, a container, and a leaf. Each Close case
must assert:

```tsx
expect(screen.queryByTestId("canvas-inspector")).toBeNull();
expect(screen.getByTestId("editor-canvas")).toBeInTheDocument();
expect(screen.getByTestId("select-page")).toBeInTheDocument();
expect(submitted).not.toHaveBeenCalled();
```

Keep a separate Back assertion proving it selects the parent instead of
closing. Extend `fursona-editor.test.tsx` so Hide controls with Page selected
unmounts the inspector, Show controls does not restore it, and Hide does not
submit.

- [ ] **Step 2: Run the focused tests and observe RED**

Run:

```bash
pnpm --filter hub test -- block-editor.test.tsx fursona-editor.test.tsx
```

Expected failures: `controlsHidden`, `onClose`, and `inspectorClose` are absent;
the existing implementation restores the selected inspector after Show
controls.

- [ ] **Step 3: Implement selection clearing and Close**

In `BlockEditor`, accept `controlsHidden`. Derive:

```tsx
const currentSelection = controlsHidden
  ? null
  : repairSelection(blocks, selection);
```

Use `useLayoutEffect` to set stored selection to null whenever
`controlsHidden` becomes true. Pass `onClose={() => setSelection(null)}` into
`CanvasInspector`.

In `CanvasInspector`, add a named, `type="button"` Close button at the trailing
end of the header using an `X` icon and `tid("inspector-close")`. It must call
`onClose` directly, never `onBack`.

Pass `controlsHidden` from `FursonaEditor`. Add `inspectorClose` to
`BlockEditorLabels`, label construction, both catalogues, and the shared test
fixture.

- [ ] **Step 4: Run the focused tests and observe GREEN**

Run the Step 2 command. Expected: all selected tests pass with no warnings.

- [ ] **Step 5: Inspect the diff**

Confirm selection still has one owner, Close is not nested inside Back or a
breadcrumb, and no form submission path changed.

---

### Task 2: The canvas owns edit-mode scrolling

**Files:**

- Modify: `apps/hub/tests/fursona-editor.test.tsx`
- Modify: `apps/hub/tests/block-editor.test.tsx`
- Modify: `apps/hub/src/features/actors/presentation/fursona-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Modify: `apps/hub/src/app/globals.css`

**Interfaces:**

- `data-controls="shown"` bounds the workbench below the app header.
- `editor-canvas` owns vertical overflow only while `controlsHidden === false`.
- The same canvas has no inner overflow while Preview is active.

- [ ] **Step 1: Add failing structural tests**

Assert the visible-controls form/data-controls chain carries a bounded
`min-h-0` flex layout, the canvas carries edit-mode
`min-h-0 flex-1 overflow-y-auto overflow-x-clip`, and Preview removes those
overflow utilities. These tests corroborate the browser geometry; they do not
claim to prove scrolling.

- [ ] **Step 2: Run focused tests and observe RED**

Run the Task 1 focused command. Expected: layout/overflow class assertions fail.

- [ ] **Step 3: Implement the bounded flex chain**

While controls show:

- bound the form to `calc(100dvh - var(--bar-h))`;
- make the `data-controls` region a `min-h-0 flex-1 flex-col`;
- make the error-banner column `flex-none`;
- make `BlockEditor` `min-h-0 flex-1 flex-col`;
- keep Page/refusal controls outside the canvas scroller;
- make `editor-canvas` `min-h-0 flex-1 overflow-y-auto overflow-x-clip`.

While controls hide, remove the bound and overflow classes so the document
grows naturally. Remove the stale global rule/comment saying Preview preserves
selection and needs padding zeroed for that reason; keep only rules still
needed by stack flattening.

Do not put overflow on any block/tray. The existing phone bottom sheet remains
an overlay: measured at 320×720, its top is above the canvas's own top, so
making canvas content simultaneously visible above it would require a separate
mobile inspector redesign.

- [ ] **Step 4: Reset scroll at mode boundaries**

In the same `useLayoutEffect` that reacts to `controlsHidden`, set:

```tsx
canvasRef.current?.scrollTo({ top: 0, behavior: "instant" });
window.scrollTo({ top: 0, behavior: "instant" });
```

Run this on both mode transitions. Guard browser globals through the client
component's layout effect; do not introduce module-level DOM access.

- [ ] **Step 5: Run focused tests and observe GREEN**

Run the Task 1 focused command. Expected: all pass.

---

### Task 3: Browser proofs for ownership, transitions, and responsive edges

**Files:**

- Modify: `apps/hub/tests/e2e/canvas-inspector.spec.ts`
- Modify: `apps/hub/tests/e2e/editor-bars-stay-pinned.spec.ts`
- Create: `apps/hub/tests/e2e/editor-canvas-scroll.spec.ts`
- Modify: `apps/hub/tests/e2e/editor-is-the-page.spec.ts` only if its helper
  needs to assert the new no-selection precondition

**Interfaces:**

- Reuse the existing long-page seeding helpers.
- No fixed waits. Geometry settles through locator assertions, animation-frame
  yields, or `expect.poll`.

- [ ] **Step 1: Add failing browser selection tests**

Change the Preview inspector assertion from `toBeHidden()` to count zero. Add:

```ts
await page.getByTestId("hide-controls").click();
await expect(page.getByTestId("canvas-inspector")).toHaveCount(0);
await page.getByTestId("show-controls").click();
await expect(page.getByTestId("canvas-inspector")).toHaveCount(0);
```

Drive Close at Page, container, and leaf depth. Assert controls remain visible
and Save is not triggered.

- [ ] **Step 2: Run the focused browser spec and observe RED**

With secrets loaded, run:

```bash
set -a; . ./.secrets; set +a; pnpm --filter hub test:e2e -- canvas-inspector.spec.ts
```

Expected: current Preview only hides the inspector and there is no Close.
Check the report for zero skipped tests before treating it as evidence.

- [ ] **Step 3: Add edit-mode scroll ownership tests**

On a long page at 1280×900 and 320×720, assert:

```ts
expect(documentScrollPast).toBeLessThanOrEqual(2);
expect(canvas.scrollHeight).toBeGreaterThan(canvas.clientHeight);
```

Record the first block's viewport `y`; attempt `window.scrollTo`, verify
`window.scrollY` and the block are unchanged; then set canvas `scrollTop`,
verify it changed and the block moved. The two operations make “scrolls
neither” and “document still scrolls” distinguishable.

Open the inspector and prove its pane and canvas have independent `scrollTop`
values. Keep the existing bottom-sheet geometry at 320; this task changes the
scroll owner, not the mobile inspector composition.

- [ ] **Step 4: Rewrite the pinned-toolbar proof**

Replace document-height/window-scroll logic in
`editor-bars-stay-pinned.spec.ts` with canvas
`scrollHeight/clientHeight/scrollTop`. After thirds and the end of the canvas,
assert Save remains in the toolbar band. Keep the long-page anti-vacuity
assertion.

- [ ] **Step 5: Add Preview transition tests**

From a nonzero canvas `scrollTop`, press Preview and assert:

- inspector count is zero;
- canvas `scrollTop` is zero;
- `window.scrollY` is zero;
- canvas no longer has inner overflow;
- the document is taller than its viewport and `window.scrollTo` moves it.

Press Show controls and assert document overflow returns to ≤2px, canvas starts
at zero, and no inspector returns.

- [ ] **Step 6: Run focused browser tests and observe GREEN**

Run:

```bash
set -a; . ./.secrets; set +a; pnpm --filter hub test:e2e -- canvas-inspector.spec.ts editor-canvas-scroll.spec.ts editor-bars-stay-pinned.spec.ts editor-is-the-page.spec.ts
```

Expected: zero failures and zero skipped tests.

---

### Task 4: Documentation and full verification

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-01-recursive-inspector-drill-down-design.md`
- Modify: `docs/superpowers/specs/2026-09-03-editor-preview-selection-and-canvas-scroll-design.md`

- [ ] **Step 1: Update the living accounts**

Correct every sentence saying Preview preserves selection. Record Close,
canvas-only edit scrolling, document-scrolled Preview, top reset, and the
outer-viewport overflow ruling. Update root current state because the actors
feature changed beneath its enforced note.

- [ ] **Step 2: Search for stale claims**

Run:

```bash
rg -n "leaves selection intact|without clearing selection|document scrolls instead|Preview hides" CLAUDE.md apps/hub/src/features/actors/CLAUDE.md docs apps/hub/src
```

Expected: no old claim remains unless explicitly marked as corrected history.

- [ ] **Step 3: Run format, unit, type, lint, and tool gates**

Run:

```bash
pnpm exec prettier --write \
  docs/superpowers/specs/2026-09-03-editor-preview-selection-and-canvas-scroll-design.md \
  docs/superpowers/plans/2026-09-03-editor-preview-selection-and-canvas-scroll.md \
  apps/hub/src/features/actors/presentation/block-editor.tsx \
  apps/hub/src/features/actors/presentation/canvas-inspector.tsx \
  apps/hub/src/features/actors/presentation/fursona-editor.tsx \
  apps/hub/tests/block-editor.test.tsx \
  apps/hub/tests/fursona-editor.test.tsx \
  apps/hub/tests/e2e/canvas-inspector.spec.ts \
  apps/hub/tests/e2e/editor-canvas-scroll.spec.ts \
  apps/hub/tests/e2e/editor-bars-stay-pinned.spec.ts
pnpm --filter hub test
pnpm typecheck
pnpm lint
pnpm check:tools
pnpm check:docs
pnpm check:agent-notes
pnpm --filter hub build
```

Expected: every command exits zero.

- [ ] **Step 4: Run the complete credentialed browser suite**

Run:

```bash
set -a; . ./.secrets; set +a; pnpm --filter hub test:e2e
```

Expected: zero failures and zero skipped cases. Read the case counts; the word
“passed” alone is insufficient.

- [ ] **Step 5: Review the final diff**

Run `git diff --check`, `git status --short`, and inspect the complete diff.
Confirm no secret, screenshot, generated test artifact, or unrelated cleanup
is present. Do not commit or push without a new explicit request.
