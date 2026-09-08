# Carrd-style page builder — Phase 5: interaction completeness + canvas width simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Depends on Phases 1–4.** One branch (`carrd-style-builder`), one PR
> (#67), seven sequential phases. Spec:
> `docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`,
> "Layout" section and "Interaction" section's compact-menu bullet.
>
> **Binding decisions from the owner, not in the spec text:** (1) the
> desktop/mobile canvas-width control wraps `editor-canvas` in a
> fixed-width container (mobile ≈375px, desktop = full width) while every
> control stays live — it is NOT Preview/hide-controls, which is untouched
> and remains the separate mechanism that hides all chrome. (2) 375px is
> chosen because it clears below every measured weighted-grid
> container-query threshold (352/544/720/944/1072px for 2/3/4/5/6 places —
> see `apps/hub/src/features/actors/CLAUDE.md`'s "A place may be wider
> than its neighbours — `weights`" section) so switching to mobile
> genuinely collapses grids rather than merely narrowing an already-wide
> layout.

**Goal:** Finish the interaction layer the checkpoint left incomplete — full pointer/touch/keyboard drag on the canvas surface (not the old inspector), the panel's desktop-right / mobile-bottom-sheet layout with scroll-into-view on open, one hover/selection outline, insertion-bar/place-highlight feedback — and add the compact menu's canvas-width simulator.

**Architecture:** Most of this phase audits and completes checkpoint mechanisms already described in the actors `CLAUDE.md` ("The live renderer is directly draggable now," "Linear parents insert-and-shift; positional parents still exchange") rather than building from nothing — read that account before assuming any given piece is missing. The one genuinely new mechanism is the canvas-width wrapper, a single CSS-width toggle with no new drag or selection logic.

**Tech Stack:** `@dnd-kit/core` (`PointerSensor`, `KeyboardSensor`), Tailwind v4 container queries (`@container`), Motion (unchanged rule: opacity-only near any `@dnd-kit` node), Playwright for the browser-level proof this phase's own tasks require (not deferred to Phase 7 — a mechanism this novel needs its own browser check before Phase 7's full sweep, matching how the dragging design's own phase plan required `section-drag-reorder.spec.ts` before the larger suite existed).

## Global Constraints

- No x/y coordinates, ever.
- `CHROME_SCOPE` on the width-toggle control.
- A keyboard drag must yield a macrotask after the lift (root `CLAUDE.md` rule 26) — if this phase adds any NEW keyboard-drag entry point distinct from the checkpoint's existing one, it must go through `tests/e2e/support/drag.ts`'s existing helper, never a bespoke `setTimeout`.
- Never sabotage-verify by monkey-patching a browser API the instrument itself depends on (root `CLAUDE.md` rule 14's rAF warning) — this phase's sabotage steps mutate source, not runtime.
- One agent, this working tree, in order.

---

## Task 1: Audit what the checkpoint already wired for canvas dragging, against the spec's Interaction bullets

**Files:** none changed — read-only audit, same discipline as Phase 4 Task 1.

- [ ] **Step 1: Re-read the actors `CLAUDE.md`'s "The live renderer is directly draggable now (2026-09-04)" and "Linear parents insert-and-shift" paragraphs.**

- [ ] **Step 2: For each spec Interaction bullet below, confirm present-and-tested, or mark GAP:**

| Spec bullet                                     | Checkpoint mechanism                                                                                                                                                                                                | Present & tested, or GAP |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Drag the rendered block on desktop (pointer)    | `EditableBlockFrame`'s `beginDesktopDrag`, `useDraggable`                                                                                                                                                           |                          |
| Touch uses a grip on the selected block         | `EditableBlockFrame`'s `setActivatorNodeRef` button, `filled && selected`                                                                                                                                           |                          |
| Keyboard uses the same grip                     | Same button, `attributes`/`listeners` spread                                                                                                                                                                        |                          |
| Scrolling never hijacked by a non-grip touch    | `listeners?.onPointerDown` gated on `event.pointerType !== "mouse"` returning early — confirm this actually EXCLUDES touch from starting a drag on a bare block press, only allowing it via the grip                |                          |
| Invalid destinations never advertise themselves | `detectCollision`'s `applyDrop(...).ok` check before admitting a candidate                                                                                                                                          |                          |
| Insertion bar for linear drops                  | `canvas-drop-before`/`canvas-drop-after` spans in `EditableBlockFrame`                                                                                                                                              |                          |
| Place highlight for positional drops            | `data-canvas-drop="place"` + outline classes                                                                                                                                                                        |                          |
| One outline for hover AND selection             | Confirm: does `EditableBlockFrame` currently distinguish "hovered, not selected" from "selected"? Read its `selected`/`isOver` logic — if hover has no visual treatment at all yet, that is the gap this row names. |

- [ ] **Step 3: Record the completed table in this task's commit message.**

---

## Task 2: Close any gap Task 1 found in drag mechanics

Same pattern as Phase 4 Task 2: one commit per gap, TDD, sabotage-verified, only for rows Task 1 actually marked GAP. If Task 1 finds every row already present and tested, this task is a no-op — commit nothing and say so in the phase's tracking, rather than inventing busywork.

---

## Task 3: Desktop-right / mobile-sheet panel layout with scroll-into-view

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx` (the panel-open effect)
- Test: `apps/hub/tests/block-editor.test.tsx`, `apps/hub/tests/e2e/editor-interaction.spec.ts` (or wherever this feature's browser suite for the canvas/panel already lives — confirm the real filename)

Phase 3 already moved the panel to the right and flipped the canvas's own padding. This task's own job is narrower: when a selection opens the panel on a NARROW viewport (the bottom sheet), the newly-selected block must scroll into the visible canvas area above the sheet — per the spec's Layout section: "Mobile: bottom sheet; opening it scrolls the selection into the unobscured canvas."

- [ ] **Step 1: Confirm this does not already exist.** `grep -n "scrollIntoView" apps/hub/src/features/actors/presentation/block-editor.tsx`. If found, read its current condition — it may already exist for the OLD inspector's selection and only need confirming it still fires for the new `PropertiesPanel`.

- [ ] **Step 2: If missing, write the failing browser test** — resize to 320px width, select a block near the bottom of a tall seeded page, assert the selected block's bounding rect does not fall under the bottom sheet's own bounding rect after selection (mirroring this codebase's own `elementFromPoint`/rect-comparison discipline from the save-refusal-banner occlusion fault, root `CLAUDE.md`'s "It shipped a visible fault" account — a `toBeVisible()` assertion alone cannot prove this, only a geometry comparison can).

- [ ] **Step 3: Implement**: in the same effect that currently manages `selection` changes (or a new one keyed on `selection`), when viewport width is below the sheet's own breakpoint (confirm the exact breakpoint from `PropertiesPanel`'s own `md:` classes — it is whatever Tailwind's `md` resolves to, typically 768px) and a block is newly selected, call `.scrollIntoView({ block: "nearest" })` on the element at `data-block-path` matching the selection, scoped to `canvasRef.current`'s own scroll container (not the whole document — Phase 3's occlusion work already established the canvas is the sole scroller while controls show).

- [ ] **Step 4: Run the test to confirm it passes; sabotage-verify** by removing the `scrollIntoView` call, confirm the geometry assertion fails, restore.

- [ ] **Step 5: `pnpm check:docs`, commit.**

---

## Task 4: Canvas-width simulator

**Files:**

- Create: `apps/hub/src/features/actors/domain/canvas-width.ts` (a two-value type and nothing else — this is intentionally tiny)
- Modify: `apps/hub/src/features/actors/presentation/editor-toolbar.tsx` (the control)
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx` (the wrapper around `editor-canvas`)
- Test: `apps/hub/tests/canvas-width.test.ts`, `apps/hub/tests/editor-toolbar.test.tsx`, `apps/hub/tests/e2e/canvas-width.spec.ts`

**Interfaces:**

- Produces: `export type CanvasWidth = "desktop" | "mobile";` and `export const MOBILE_CANVAS_WIDTH_PX = 375;` in `canvas-width.ts`, with TSDoc citing the 352px two-place threshold this value must clear (per the binding decision at the top of this file).

- [ ] **Step 1: Write the failing test for the constant's own contract** — a property-free sanity check that the constant is genuinely below the measured threshold, so a future edit to either number is forced to reconcile them rather than drifting apart silently:

```ts
import { MOBILE_CANVAS_WIDTH_PX } from "@/features/actors/domain/canvas-width";

it("clears below the smallest measured grid-collapse threshold", () => {
  // 352px is the measured viewport width at which a two-place weighted
  // grid first stops collapsing to one column (see this file's own
  // TSDoc and the actors CLAUDE.md's weighted-places account). The
  // canvas's own container is narrower than the viewport by the page's
  // padding, so clearing 352 with margin is what "genuinely collapses"
  // means here, not merely being a smaller number.
  expect(MOBILE_CANVAS_WIDTH_PX).toBeLessThan(352);
});
```

- [ ] **Step 2: Run to verify it currently fails (the file does not exist), then implement, then verify it passes.**

- [ ] **Step 3: Add the toolbar control** — a two-option switch (desktop/mobile), `CHROME_SCOPE`, session-only state (matching `interactEnabled`'s own pattern in `fursona-editor.tsx` — not persisted, not a form field, resets on... — decide and state explicitly whether it resets on Save/navigation or persists for the session; the spec does not say, so pick the least surprising option: session-only, reset on next page load, matching every other session-only toolbar toggle already in this file) with an `aria-describedby` hint sentence stating the consequence, matching `interact-with-page`'s own existing pattern exactly (read that control's markup before writing this one, and copy its shape rather than inventing a new one).

- [ ] **Step 4: Wrap `editor-canvas` in a width-limited container when `canvasWidth === "mobile"`**:

```tsx
<div
  className={canvasWidth === "mobile" ? "mx-auto max-w-[375px]" : ""}
  {...tid("canvas-width-wrapper")}
>
  {/* existing editor-canvas div, unchanged */}
</div>
```

Use the actual `MOBILE_CANVAS_WIDTH_PX` constant rather than a literal `375px` in the class — Tailwind v4's `max-w-[…]` accepts an interpolated value via the same `var()`/arbitrary-value mechanism this codebase already uses elsewhere (`block-tracks.ts`'s `TRACK_FLOOR`, for one) — confirm the exact syntax compiles by running `pnpm --filter hub build` after wiring it, not by assuming Tailwind's arbitrary-value string interpolation works for a JS-side constant without a `style` prop; if the class-string approach cannot cleanly consume the constant, use an inline `style={{ maxWidth: `${MOBILE_CANVAS_WIDTH_PX}px` }}` instead and say so in the commit message.

- [ ] **Step 5: Confirm this wrapper never overlaps or interferes with Preview.** Preview removes the bounded flex chain entirely (per the actors `CLAUDE.md`'s "Preview removes that bound and returns scrolling to the document" account) — the mobile-width wrapper must be OUTSIDE whatever Preview already strips, or Preview would inherit a narrowed canvas it should never have. Write a test asserting the wrapper's max-width class is absent when `controlsHidden` is true, regardless of `canvasWidth`'s own state.

- [ ] **Step 6: Write the component test for the toggle itself** — clicking it toggles `data-testid="canvas-width-wrapper"`'s class between full and 375px-limited, and every control inside the canvas (a grip, the Properties panel trigger) remains clickable in both states (assert with a real click reaching a `data-block-path` element inside the narrowed wrapper, not merely that the class changed).

- [ ] **Step 7: Write the browser-level proof** — `tests/e2e/canvas-width.spec.ts`: seed a page with a 3-place weighted grid section, toggle to mobile, assert (via `getBoundingClientRect`) the three places now stack vertically (the container genuinely collapsed, not merely narrowed), toggle back to desktop, assert they return to three across. This is the discriminating check root `CLAUDE.md` rule 27 would demand: a test asserting only "the wrapper has a narrower `max-width` class" cannot tell a genuine container-query collapse from a wrapper that is narrow but still wider than the 544px three-place threshold by coincidence of some other CSS; only measuring the actual rendered places' positions proves the collapse happened.

- [ ] **Step 8: Sabotage-verify** the browser test by setting `MOBILE_CANVAS_WIDTH_PX` to `600` (above the three-place threshold), confirm the collapse assertion fails, restore to `375`.

- [ ] **Step 9: `pnpm check:docs`, `pnpm lint` from repo root, full test run, commit.**

---

## Task 5: Full local verification

```bash
cd /Users/heiner_angaritamaldonado/Documents/AeleOS
pnpm --filter hub test:coverage
pnpm lint
pnpm typecheck
pnpm check:docs
set -a && . ./.secrets && set +a && pnpm --filter hub test:e2e --grep "canvas-width|editor-interaction"
```

Expected: all PASS.
