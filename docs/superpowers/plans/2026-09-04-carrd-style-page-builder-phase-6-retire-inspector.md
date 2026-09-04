# Carrd-style page builder — Phase 6: retire the superseded inspector-only paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Depends on Phases 1–5 being proven first** — do not start this phase
> until `PropertiesPanel` (Phase 3), the compact menu (Phase 2), and full
> canvas interaction (Phase 5) have each been manually exercised and their
> own test suites are green. This phase's entire job is deletion; deleting
> the old mechanism before its replacement is proven would leave the
> editor with neither. One branch (`carrd-style-builder`), one PR (#67).

**Goal:** Remove `inspector-items.tsx` and every inspector-only sibling-drag path (the `place:` id prefix, `placePath`/`placeId`/`placeOrder`/`placeUnderPointer`'s inspector-only call sites) now that `PropertiesPanel` + direct canvas dragging fully replace them, and correct every part of `apps/hub/src/features/actors/CLAUDE.md` that still describes the retired mechanism as current.

**Architecture:** Pure subtraction plus documentation correction. No new behavior. The riskiest part is not the deletion itself but confirming nothing still depends on the `place:` id space or `inspector-items.tsx`'s exports before removing them — Task 1 exists to make that confirmable rather than assumed.

**Tech Stack:** Same as prior phases; `madge` (already run in `pnpm check:tools`) to confirm no remaining import edge points at the deleted files.

## Global Constraints

- `pnpm check:docs` and `pnpm check:agent-notes` must both pass after every documentation edit in this phase, not only at the end.
- Whoever fixes a fault deletes the note saying it is open — the actors `CLAUDE.md`'s own standing rule, directly on point for this entire phase.
- Never delete a test whose assertion still names live, current behavior — only delete tests whose SUBJECT no longer exists.
- One agent, this working tree, in order.

---

## Task 1: Confirm nothing still depends on what this phase removes

**Files:** none changed — audit only.

- [ ] **Step 1: Find every remaining reference to the files this phase deletes**

```bash
grep -rln "inspector-items\|canvas-inspector" apps/hub/src apps/hub/tests
```

(Note: `canvas-inspector.tsx` was already renamed to `properties-panel.tsx` in Phase 3 — this grep should find only stale references, if any, which this task corrects as a side effect.)

- [ ] **Step 2: Find every remaining call site of the inspector-only id functions**

```bash
grep -rn "\bplacePath\(\|\bplaceId\(\|\bplaceOrder\(\|\bplaceUnderPointer\(" apps/hub/src/features/actors/
```

For each hit, confirm whether it is:
(a) still needed because a positional-mode drop (grid/masonry/etc.) genuinely still uses the `place:` id space for something the CANVAS's own `canvas-place:` space does not cover — re-read `block-editor.tsx`'s `detectCollision`/`coordinateGetter`/`onDragEnd` (Phase 1 Task 4 already touched two of these) to confirm whether, after Phases 2–5, the canvas surface has become the ONLY drag surface, making the `place:` space entirely dead; or
(b) genuinely dead, safe to delete.

- [ ] **Step 3: Run `madge` to confirm no import cycle or dangling edge exists into `inspector-items.tsx` before deleting it**

```bash
pnpm --filter hub exec madge --circular --extensions ts,tsx apps/hub/src/features/actors/presentation/inspector-items.tsx
```

- [ ] **Step 4: Write the findings from Steps 1–3 into this task's commit message** (informational only — no code changes yet).

---

## Task 2: Delete `inspector-items.tsx` and its dedicated tests

Only proceed with this task if Task 1 concluded the `place:` id space and `inspector-items.tsx`'s exports are genuinely dead. If Task 1 found the positional-mode drag path still depends on inspector-only machinery, stop here, write down exactly what still depends on it, and treat unifying that onto the canvas's own `canvas-place:` space as a new task inserted before this one — do not delete a still-load-bearing file to satisfy this phase's own title.

**Files:**

- Delete: `apps/hub/src/features/actors/presentation/inspector-items.tsx`
- Delete: `apps/hub/tests/inspector-items.test.tsx` (if it exists as its own file)
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx` (remove the import and whatever wired `items`/`hasItems` into the old `CanvasInspector`/`PropertiesPanel` props — Phase 3 should already have removed the `items`/`hasItems` PROPS from the panel itself; this task removes the now-orphaned code in `block-editor.tsx` that used to BUILD those props)
- Modify: `apps/hub/src/features/actors/domain/block-drag.ts` (remove `placeId`/`placePath`/`placeOrder`/`placeUnderPointer` if Task 1 confirmed they are dead; keep `canvasPlaceId`/`canvasPlacePath`/`placeName` — rename anything still needed to drop its now-misleading "canvas" qualifier if it becomes the only surface, e.g. `canvasPlaceId` → `placeId` once there is only one id space again, updating every call site in the same commit)

- [ ] **Step 1: Delete the files.**

- [ ] **Step 2: Remove now-dead exports from `block-drag.ts`**, per Task 1's findings. If renaming `canvasPlaceId` → `placeId` (collapsing back to one id space now that the inspector's own space is gone), do this as its own commit, separate from the deletion, so a reviewer can see "delete the old surface" and "the remaining surface no longer needs a qualifying prefix" as two distinct, individually revertible changes.

- [ ] **Step 3: Run the full test suite and fix every resulting compile/test failure** — there will be several, since `block-editor.tsx`'s own drag callbacks (`detectCollision`, `coordinateGetter`, `onDragStart`, `onDragEnd`, `refusalOf`, the `announcements` name callback — all touched in Phase 1 Task 4) currently branch on `canvasPlacePath(...) ?? placePath(...)`; once `placePath` no longer exists, each of these simplifies to a single, unconditional resolution. Simplify each one rather than leaving a dead `?? placePath(...)` fallback that can never fire.

```bash
pnpm --filter hub test 2>&1 | tail -100
```

- [ ] **Step 4: `pnpm check:docs`, `pnpm lint` from repo root, `pnpm typecheck`.**

- [ ] **Step 5: Commit.**

```bash
git add -A
git commit -m "Delete the superseded recursive-inspector drag surface

inspector-items.tsx and the place: id space are gone now that the
canvas is the only drag surface. Every drag callback in block-editor.tsx
that branched on canvasPlacePath(...) ?? placePath(...) simplifies to
one unconditional resolution."
```

---

## Task 3: Correct every stale claim in `apps/hub/src/features/actors/CLAUDE.md`

This is the task the actors `CLAUDE.md`'s own opening section exists for: "Whoever fixes a fault deletes the note saying it is open." Multiple paragraphs in that file currently describe the recursive inspector, its Items pane, sibling-only drag, and the dual dnd-kit id-prefix coexistence as CURRENT — all of it is retired by Task 2.

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md`

- [ ] **Step 1: Grep for every paragraph describing the retired mechanism**

```bash
grep -n "Items tab\|Items pane\|inspector-items\|sibling-only\|Inspector rows register only visible siblings\|separate dnd-kit id prefix\|recursive inspector" apps/hub/src/features/actors/CLAUDE.md
```

- [ ] **Step 2: For each hit, correct the paragraph in place** — do not append a new paragraph saying "this is now retired" beside an old one still asserting it is current; edit the old paragraph itself, per the file's own rule that a document contradicting itself is worse than one that is simply wrong. Name what replaced each retired mechanism (Phase 2's unified Add, Phase 3's `PropertiesPanel`, Phase 5's canvas-only dragging) and the date this phase lands.

- [ ] **Step 3: Check the "Dragging (2026-08-18; inspector corrected 2026-09-01)" section's own correction banner** — it currently says "The recursive inspector mounts only one level and offers only visible siblings... The current browser proof is `section-drag-reorder.spec.ts`." Both halves are now false: there is no recursive inspector, and Phase 5's browser proof (whatever file it landed in) is the current proof, not `section-drag-reorder.spec.ts`, which Task 4 below removes.

- [ ] **Step 4: Re-run `pnpm check:agent-notes` and `pnpm check:docs`** after every edit, not only at the end — this file's own size makes it easy to introduce a self-contradiction between a paragraph edited early in this task and one edited later; catch it immediately rather than at the end of the phase.

- [ ] **Step 5: Commit the documentation correction as its own commit, separate from Task 2's code deletion.**

---

## Task 4: Retire `section-drag-reorder.spec.ts`'s sibling-only cases, or the whole file

**Files:**

- Modify or delete: `apps/hub/tests/e2e/section-drag-reorder.spec.ts`

This file's own header (per the actors `CLAUDE.md`'s account) already carries a correction banner explaining it replaced an earlier, larger `block-drag.spec.ts` when cross-level dragging was withdrawn from the recursive inspector. Its own cases now test a mechanism (sibling-only inspector drag) that Task 2 deleted. Phase 5's own browser proof (Task 2 of Phase 5, wherever it landed) should already cover pointer/touch/keyboard dragging on the canvas — confirm it covers everything this file's surviving cases proved, then delete this file outright rather than leaving a suite that tests a mechanism with no code behind it.

- [ ] **Step 1: Read this file's current cases in full.**
- [ ] **Step 2: For each case, confirm an equivalent exists in Phase 5's browser suite** (list which Phase 5 case covers which of this file's cases).
- [ ] **Step 3: If every case has a Phase 5 equivalent, delete this file.** If any case tests something Phase 5's suite does not cover, port that ONE case into Phase 5's suite first, confirm it passes there, then delete this file.
- [ ] **Step 4: Update `apps/hub/src/features/actors/CLAUDE.md`'s references to this filename** (Task 3 above may have already caught some — re-grep after this task's deletion to confirm none remain: `grep -n "section-drag-reorder" apps/hub/src/features/actors/CLAUDE.md`).
- [ ] **Step 5: Commit.**

---

## Task 5: Full local verification

```bash
cd /Users/heiner_angaritamaldonado/Documents/AeleOS
pnpm --filter hub test
pnpm lint
pnpm typecheck
pnpm check:docs
pnpm check:agent-notes
pnpm check:tools
set -a && . ./.secrets && set +a && pnpm --filter hub test:e2e
```

Expected: all PASS, including the full `test:e2e` run — this is the first point in the seven phases where the four pre-existing `e2e` failures Phase 1 Task 1 recorded (the `section-card-face.spec.ts` case and three `section-drag-reorder.spec.ts` cases) should finally be gone, the latter three by deletion in Task 4 above and the former by whatever Phase 5's audit found and fixed. If any of the four is still failing at this point, that is this phase's own blocker — do not carry it into Phase 7 unexamined.
