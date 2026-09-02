# Editor interaction, adding, and motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock page interaction while editor controls are visible (with a session-only override that resets whenever controls return), replace the two add palettes with one picker that uses the real renderer, and give editor chrome restrained Motion.

**Architecture:** A pure `pageInteractionsEnabled` function plus `FursonaEditor` session state drive an editor-only DOM boundary under `data-editor-canvas`. Adding stays `addContentAt` / `newLeaf` / `newContainer`; only the UI that chooses _what_ to add changes. Motion wraps editor chrome (`LazyMotion` + `m` + one `MotionConfig reducedMotion="user"`) and never wraps a `@dnd-kit` node, a `SKIN_SCOPE` descendant, or a public route.

**Tech Stack:** Next.js hub, React 19, Tailwind v4 + `cn()`, `@dnd-kit` (unchanged), Motion for React (`motion` package, `motion/react` imports), Vitest, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-02-editor-interaction-and-motion-design.md`.
- No stored-page migration; no `0009` edit; `newLeaf` / `newContainer` / `mayNest` / `MAX_DEPTH` / `moveBlock` / `moveSiblingBlock` keep their contracts.
- Public renderer (`Block` / `PublicBlocks`) gains no editing prop, no Motion import, and no interaction-lock branch.
- Interaction lock must not add overlay, opacity, cursor veil, or extra wrapper that changes container-query size, stacking, clipping, skin scope, or screenshot pixels.
- Motion components render only inside `CHROME_SCOPE`. No Motion ancestor of a `@dnd-kit` draggable/droppable. No `layout` animation this phase.
- Spanish fallback; every new string in `en.json` and `es.json`. Compact toolbar labels at 320 / `sm` / `md` (rule 38).
- Every export: TSDoc contract + tests on happy path and each failure mode. Sabotage-verify new tests.
- Branch from `origin/main`. Picture proof on the PR, not in git. Measure Motion against `hub` build size and the `canvas` job before keeping it.

## File map

| File                                                                   | Responsibility                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/hub/src/features/actors/domain/page-interaction.ts`              | Pure `pageInteractionsEnabled`.                                          |
| `apps/hub/src/features/actors/presentation/canvas-interaction-lock.ts` | Editor-only inert observer under `data-editor-canvas`.                   |
| `apps/hub/src/features/actors/domain/add-samples.ts`                   | Fixed sample blocks for picker previews; never written to the page.      |
| `apps/hub/src/features/actors/presentation/add-block-picker.tsx`       | One Add control + popup with real-renderer options.                      |
| `apps/hub/src/features/actors/presentation/editor-motion.tsx`          | `LazyMotion` + `MotionConfig` + `m` re-exports for chrome.               |
| `apps/hub/src/features/actors/presentation/editor-toolbar.tsx`         | Interact-with-page switch next to Preview.                               |
| `apps/hub/src/features/actors/presentation/fursona-editor.tsx`         | Owns switch + `controlsHidden`; resets switch on Show controls.          |
| `apps/hub/src/features/actors/presentation/block-editor.tsx`           | Effective lock on canvas click; hosts picker; Motion on inspector shell. |
| `apps/hub/src/features/actors/presentation/inspector-items.tsx`        | Empty places use the same Add picker, targeted at that path.             |
| `apps/hub/src/features/actors/presentation/canvas-inspector.tsx`       | Scope-change entrance motion on Items/Options panes.                     |
| Catalogues + `pages/labels.ts` + `tests/support/editor-labels.ts`      | New chrome strings.                                                      |
| `apps/hub/src/features/actors/CLAUDE.md`                               | Standing note: lock, picker, Motion boundary.                            |

Do **not** put Motion, the lock, or the picker in `packages/identity`.

---

### Task 1: Interaction state (pure)

**Files:**

- Create: `apps/hub/src/features/actors/domain/page-interaction.ts`
- Test: `apps/hub/tests/page-interaction.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `pageInteractionsEnabled({ controlsHidden, switchEnabled }: { controlsHidden: boolean; switchEnabled: boolean }): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { pageInteractionsEnabled } from "@/features/actors/domain/page-interaction";

describe("pageInteractionsEnabled", () => {
  it("is off while controls show and the switch is off", () => {
    expect(
      pageInteractionsEnabled({ controlsHidden: false, switchEnabled: false }),
    ).toBe(false);
  });

  it("is on when the toolbar switch is enabled with controls still showing", () => {
    expect(
      pageInteractionsEnabled({ controlsHidden: false, switchEnabled: true }),
    ).toBe(true);
  });

  it("is on whenever controls are hidden, even if the switch is off", () => {
    expect(
      pageInteractionsEnabled({ controlsHidden: true, switchEnabled: false }),
    ).toBe(true);
  });

  it("is on when both Preview and the switch are true", () => {
    expect(
      pageInteractionsEnabled({ controlsHidden: true, switchEnabled: true }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm --filter hub exec vitest run tests/page-interaction.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
/**
 * Whether authored page content may receive pointer and keyboard input.
 *
 * Preview is hide-controls, not a second renderer, so hidden controls always
 * enable interaction. The toolbar switch is the only way to enable it while
 * controls remain visible. Neither input is stored.
 *
 * @param state - editor chrome visibility and the session switch.
 * @returns true when links, media and frames on the canvas must work.
 */
export function pageInteractionsEnabled(state: {
  controlsHidden: boolean;
  switchEnabled: boolean;
}): boolean {
  return state.controlsHidden || state.switchEnabled;
}
```

- [ ] **Step 4: Run to confirm pass**, then `pnpm check:docs`.
- [ ] **Step 5: Commit** `test: cover page-interaction enablement`

---

### Task 2: Canvas interaction lock

**Files:**

- Create: `apps/hub/src/features/actors/presentation/canvas-interaction-lock.ts`
- Test: `apps/hub/tests/canvas-interaction-lock.test.ts`

**Interfaces:**

- Consumes: a canvas `HTMLElement` with `data-editor-canvas`.
- Produces: `lockCanvasInteraction(root: HTMLElement): () => void` — apply inert to matching descendants, observe mutations, restore prior `inert` on unlock/unmount.

Selector (keep in one named constant, tested):

```ts
export const INTERACTIVE =
  "a[href], button, input, select, textarea, details, summary, audio[controls], video[controls], iframe, object, embed, [contenteditable], [tabindex]:not([tabindex='-1'])";
```

Rules:

- Skip any match inside `CHROME_SCOPE` (`aeleos-chrome`) so inspector grips, Add, and toolbar-adjacent chrome are never locked.
- Remember each element's prior `inert` (`hasAttribute("inert")`) in a `WeakMap` or parallel list; restore exactly that on cleanup. Unlock must not enable something the renderer already disabled.
- Do not wrap the canvas. Do not set `inert` on `[data-editor-canvas]` itself (that would lock the canvas click that selects blocks).

- [ ] **Step 1: Failing tests** (jsdom)

Cases that must exist:

1. Locks `a[href]`, `button`, `iframe`, `video[controls]` that are descendants of the canvas.
2. Leaves a `CHROME_SCOPE` button inside the same canvas unlocked (control island).
3. MutationObserver: appending an `a[href]` after lock marks it inert.
4. Cleanup restores prior `inert` on an iframe the fixture already marked inert, and removes `inert` from one that was not.
5. Unmount/cleanup disconnects the observer (appending after cleanup must not mark the new node).

Discriminating fixture: a canvas that already contains one renderer-disabled iframe (`inert` set before lock) **and** one live link. Unlock that restores both to “everything interactive” is the wrong behaviour and must redden.

- [ ] **Step 2: Implement `lockCanvasInteraction`**
- [ ] **Step 3: Cover every branch** (already-inert, newly mounted, chrome skip, cleanup). Sabotage: skip the chrome check and watch the chrome-button case go red.
- [ ] **Step 4: Commit** `feat: lock interactive canvas descendants while editing`

---

### Task 3: Toolbar switch and editor wiring

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/editor-toolbar.tsx`
- Modify: `apps/hub/src/features/actors/presentation/fursona-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx` (`BlockEditorProps` + `onCanvasClick`)
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/en.json`, `es.json` (fursonas namespace)
- Modify: `apps/hub/src/app/[locale]/(app)/pages/labels.ts`
- Modify: `apps/hub/tests/support/editor-labels.ts`
- Test: `apps/hub/tests/fursona-editor.test.tsx`, `apps/hub/tests/editor-toolbar.test.tsx` (create if missing; otherwise extend `fursona-editor.test.tsx`)

**Interfaces:**

Extend `EditorToolbarLabels`:

```ts
/** Pressed/unpressed: page links and controls work while editing. */
interactWithPage: string;
/** Consequence while the switch is off. */
interactWithPageHintOff: string;
/** Consequence while the switch is on. */
interactWithPageHintOn: string;
```

English (starting copy; Spanish must be a real translation, not a key):

- `interactWithPage`: “Interact with page”
- `interactWithPageHintOff`: “Page links and controls are locked so you can select blocks.”
- `interactWithPageHintOn`: “Page links and controls work as they do for a visitor.”

Extend `EditorToolbarProps`:

```ts
interactEnabled: boolean;
onInteractEnabledChange: (next: boolean) => void;
```

The control is `aria-pressed={interactEnabled}`, `aria-describedby` pointing at a visually-hidden hint that swaps with the two strings. Test id: `interact-with-page`. Compact label: icon + `sr-only sm:not-sr-only` like Preview, so 320 does not gain a new overflow band.

`FursonaEditor`:

```ts
const [interactEnabled, setInteractEnabled] = useState(false);
```

- `onHideControls`: `setControlsHidden(true)` only. Do **not** clear the switch here; Preview implies interaction via `pageInteractionsEnabled`.
- Show-controls (the `escapeSlot` / `showControls` press): `setControlsHidden(false); setInteractEnabled(false);` — this is the reset the spec requires.
- Compute `interactionsEnabled = pageInteractionsEnabled({ controlsHidden, switchEnabled: interactEnabled })`.
- Pass `interactEnabled` / `onInteractEnabledChange` into the toolbar (toolbar unmounts with hide-controls, so the switch is not visible in Preview — correct).
- Pass `pageInteractionsEnabled={interactionsEnabled}` into `BlockEditor`.
- Call `lockCanvasInteraction` from a `useEffect` on the canvas node (`document.querySelector("[data-editor-canvas]")` is forbidden; thread a callback ref from `BlockEditor` **or** put the effect inside `BlockEditor` where the canvas already lives). Prefer the lock living in `BlockEditor` so `FursonaEditor` does not query the DOM.

`BlockEditorProps` add:

```ts
/** When true, canvas clicks do not select or clear; page content is live. */
pageInteractionsEnabled: boolean;
```

`onCanvasClick`: if `pageInteractionsEnabled`, return immediately. Otherwise keep today's `data-block-path` lookup / empty-canvas clear.

Mount the lock:

```ts
useEffect(() => {
  if (pageInteractionsEnabled) return;
  const root = canvasRef.current;
  if (!root) return;
  return lockCanvasInteraction(root);
}, [pageInteractionsEnabled, blocks]);
```

`blocks` in the dep list is so newly authored players/embeds are observed even if MutationObserver is late; the observer is still required.

Unit cases in `fursona-editor.test.tsx`:

1. Default: `interact-with-page` is `aria-pressed="false"`; a canvas `a[href]` is inert.
2. Pressing the switch: `aria-pressed="true"`; that link is not inert.
3. Hide controls: switch unmounts; link is not inert.
4. Show controls: switch is back and `aria-pressed="false"` even if it was true before Preview.
5. Pressing the switch does not hide controls and does not clear a Page selection.

- [ ] **Step 1: Failing tests for reset and default-off**
- [ ] **Step 2: Labels in both catalogues + `labels.ts` + fixture bag**
- [ ] **Step 3: Toolbar + FursonaEditor + BlockEditor wiring**
- [ ] **Step 4: `pnpm --filter hub test` the touched suites; `pnpm --filter hub exec vitest run tests/messages.test.ts`**
- [ ] **Step 5: Commit** `feat: session interact-with-page switch that resets on Preview exit`

---

### Task 4: Add picker (real renderer, sample content)

**Files:**

- Create: `apps/hub/src/features/actors/domain/add-samples.ts`
- Create: `apps/hub/src/features/actors/presentation/add-block-picker.tsx`
- Test: `apps/hub/tests/add-samples.test.ts`, `apps/hub/tests/add-block-picker.test.tsx`
- Labels: catalogues, `labels.ts`, `blockEditorLabels()` — `addBlock`, `addBlockTitle`, `addContentGroup`, `addLayoutGroup` (reuse `nestingAtLimit`)

**Interfaces:**

```ts
/** Sample leaf shown in the picker. Never passed to addContentAt. */
export function sampleLeaf(kind: LeafKind): LeafBlock;

/** Sample container shown in the picker. Never passed to addContentAt. */
export function sampleContainer(mode: ContainerMode): ContainerBlock;
```

`sampleLeaf` / `sampleContainer` fill required `title_en` (and whatever `LEAF_FIELDS` requires) with **fixed English placeholders used only as data for the renderer**. Visible caption of each option is `labels.leaf.leafKinds[kind]` / `labels.modes[mode]` — translated chrome, not the sample fields.

What `onChoose` must pass to the editor is still `newLeaf(kind)` or `newContainer(mode, 2)` (page currently uses `NEW_SPACES = 2` for a new section). Assert by identity of kind/mode **and** that `title_en` on the added leaf is `newLeaf`'s empty/default, not the sample string.

`AddBlockPickerProps`:

```ts
export interface AddBlockPickerProps {
  /** Path of the place to fill, or the path addContentAt uses for a scope append. */
  targetPath: BlockPath;
  kinds: readonly LeafKind[];
  /** When false, omit the layout group and show nestingAtLimit. */
  mayAddLayout: boolean;
  atBlockLimit: boolean;
  labels: {
    add: string;
    title: string;
    contentGroup: string;
    layoutGroup: string;
    nestingAtLimit: string;
    leafKinds: Record<LeafKind, string>;
    modes: Record<ContainerMode, string>;
  };
  page: PageContext;
  locale: string;
  onAdd: (block: Block) => void;
}
```

UI:

- One button `data-testid="add-block"` (keep `add-content` as an **alias test id on the same button** for one release of e2e, **or** update every spec in Task 7 in the same change — do not leave both palettes). Prefer one id: `add-block`. Empty-place buttons also `add-block` scoped to the row.
- Popup: native `<dialog>` or a positioned `role="dialog"` with `aria-modal="true"`, labelled by `title`. Test id `add-block-picker`.
- Options: `add-block-option` with `data-add-kind={kind}` or `data-add-mode={mode}`.
- Each option mounts `Block` from `blocks.tsx` with `sampleLeaf` / `sampleContainer`, `depth={1}`, a dummy `path` like `"preview"`, and `page`. Wrap the preview in `CHROME_SCOPE` so it is **outside** `SKIN_SCOPE` / the author’s `:root` claim. Do not put `SKIN_SCOPE` on the preview.
- Previews mount only while the dialog is open.
- Escape and backdrop click close without calling `onAdd`.
- Choosing an option calls `onAdd(newLeaf|newContainer)` then closes.
- If `atBlockLimit`, render `null` (no button).

Unit cases:

1. Closed: no `add-block-picker` in the document (or `open` false / not displayed).
2. Open: one option per forwarded `kinds`, not the full `LEAF_KINDS` — fixture `kinds={["text","link"]}` must not offer `owner`.
3. `mayAddLayout=false`: no `data-add-mode`, `nestingAtLimit` visible.
4. `mayAddLayout=true`: one option per `CONTAINER_MODES`.
5. Click `data-add-kind="link"` calls `onAdd` with `kind === "link"` and `title_en === newLeaf("link").title_en`.
6. Fixture with **two empty places**; picker targeted at path `[0, 1]` — parent must add at index 1. A picker that always fills index 0 passes a one-place fixture and must fail this one (spec proof).
7. Escape / outside click: `onAdd` not called.
8. Preview for `text` renders the same leaf kind the canvas would (`data-block-kind="text"`). Do not mock `Block`.

- [ ] **Step 1: Failing tests (samples + picker, including the non-first place)**
- [ ] **Step 2: Implement samples and picker**
- [ ] **Step 3: Green + sabotage the kinds filter**
- [ ] **Step 4: Commit** `feat: add-block picker with real-renderer samples`

---

### Task 5: One Add control at every scope

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/inspector-items.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx` (`ItemsFooter`, page `addPalette`)
- Test: `apps/hub/tests/block-editor.test.tsx`, `apps/hub/tests/inspector-items.test.tsx` (extend or add)

Replace:

- Empty place: remove separate `add-content` / `add-nested` pair; one `AddBlockPicker` with `targetPath={path}`, `mayAddLayout={mayNest(path)}`.
- Container footer: remove `kinds.map` `add-into-${kind}` buttons; one picker whose `onAdd` is `addAt(nextChildPath, block)` where `nextChildPath` is `[...path, nextChildPosition(container)]`.
- Page palette: remove the sixteen `add-leaf-${kind}` buttons and the `add-section` button **from the leaf/section list**. Keep `section-presets` and the spaces control as they are (spec: presets stay). Page Add picker: `targetPath={[]}`, `mayAddLayout={true}`, `onAdd={addOnPage}`.

A leaf selection still has no Add (no Items pane).

Cases:

1. Page Items: exactly one `add-block`; no `add-leaf-text`; no `add-section` (presets remain).
2. Open a full two-place nested container (both children occupied): Items footer still offers `add-block`; choosing a layout option adds a nested container (`mayNest` true). This is the “nesting looked deleted” bug.
3. Deepest allowed place (`path.length > MAX_DEPTH` is invalid; at `path.length === MAX_DEPTH` `mayNest` is false): picker has no layout group.
4. Leaf Options: `queryByTestId("add-block")` is null.
5. `countBlocks === BLOCK_LIMITS.blocks`: no `add-block`.

Update unit tests that click `add-content` / `add-nested` / `add-into-*` / `add-leaf-*` / `add-section` in `block-editor.test.tsx`, `block-card.test.tsx` (if those buttons moved off `BlockCard` already, only inspector tests). `BlockCard` may still have leftover add UI if `showChildren` is true in unused paths — grep and delete dead add buttons rather than keep a second palette.

- [ ] **Step 1: Failing tests for full-scope nested add and leaf-has-no-add**
- [ ] **Step 2: Replace palettes**
- [ ] **Step 3: Grep `add-leaf-`, `add-into-`, `add-nested`, `add-section` in presentation; only presets/`add-place` remain as separate add-adjacent controls**
- [ ] **Step 4: Commit** `feat: one add picker at every container scope`

---

### Task 6: Motion (chrome only)

**Files:**

- Add dependency: `motion` in `apps/hub/package.json` (workspace protocol as the repo already uses; pin a current stable with `pnpm --filter hub add motion`)
- Create: `apps/hub/src/features/actors/presentation/editor-motion.tsx`
- Modify: `fursona-editor.tsx` (wrap editor chrome tree once)
- Modify: `canvas-inspector.tsx`, `block-editor.tsx` (inspector entry, `md:pl-[…]` transition, selection outline, new inspector rows)
- Test: `apps/hub/tests/editor-motion.test.tsx` plus a static grep test that presentation Motion imports never appear under `blocks.tsx` / public profile

**`editor-motion.tsx`:**

```tsx
"use client";

import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import type { ReactNode } from "react";

/**
 * Feature bundle loaded once for editor chrome. Do not import `motion`
 * from `motion/react` in feature files — that pulls the full namespace.
 */
export { m };

/**
 * One reduced-motion switch for every editor animation.
 *
 * @param props.children - editor chrome that may use {@link m}.
 */
export function EditorMotion({ children }: { children: ReactNode }): ReactNode {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
```

Durations (spec):

- opacity / selection: 150ms
- panel / scope / canvas: 210ms
- translate: 12px max
- easing: `easeOut` on entry; no spring, bounce, stagger, `layout`

Apply:

1. Inspector root (`CanvasInspector`): `m.div` initial `{ opacity: 0, x: -12 }` / `{ y: 12 }` at the phone sheet breakpoint; animate to `{ opacity: 1, x: 0, y: 0 }`. Clearing selection still **unmounts immediately** (no `AnimatePresence` exit delay).
2. Items/Options pane inner wrap: short fade+translate on `tab` / selection path change (`key={tab + path}`).
3. Canvas stack: CSS `transition-[padding] duration-[210ms]` on `md:pl-[min(36rem,40vw)]` is allowed (no Motion on the canvas tree). Prefer CSS here so `@dnd-kit` and the page boxes never get inline transforms.
4. Selection outline: CSS `transition: outline-color` only, still inside the existing `CHROME_SCOPE` `<style>` tag.
5. New inspector rows: `m.div` on the **row chrome** in `InspectorItems`, not on `BlockSlot` / the grip. The grip stays a dnd-kit node with no Motion parent that writes `transform`. Structure: Motion on a sibling label wrapper, or animate opacity only on a wrapper that is **not** the `useDraggable` node. If a wrapper is required, it must not be the element `BlockSlot` attaches listeners to.

Forbidden (lint if cheap, else a unit that reads source):

- `from "motion/react"` outside `editor-motion.tsx` and tests.
- `layout` prop on any `m.*`.
- Motion import in `blocks.tsx`, `public-profile.tsx`, `theme-scope.tsx`.

- [ ] **Step 1: Add `motion`; failing test that `EditorMotion` sets `MotionConfig`**
- [ ] **Step 2: Wire chrome motion; keep canvas/dnd-kit free of `m`**
- [ ] **Step 3: Unit/source guard for the import boundary**
- [ ] **Step 4: Commit** `feat: motion for editor chrome with user reduced-motion`

---

### Task 7: Browser proof

**Files:**

- Create: `apps/hub/tests/e2e/editor-interaction.spec.ts`
- Create: `apps/hub/tests/e2e/add-block-picker.spec.ts`
- Modify: `apps/hub/tests/e2e/section-drag-reorder.spec.ts` (still passes with Motion mounted)
- Modify: `apps/hub/tests/e2e/canvas-inspector.spec.ts`, `nested-page-build.spec.ts`, `editor-saves-page.spec.ts`, `a11y.spec.ts`, `border-style-cascade.spec.ts`, `section-card-face.spec.ts`, `leaf-style-popup.spec.ts` — replace `add-content` / `add-nested` / `add-section` / `add-leaf-*` with picker flows
- Modify: `apps/hub/tests/e2e/responsive.spec.ts` — 320 + `sm`/`md` with Add + open picker + interact switch
- Modify: `apps/hub/tests/e2e/editor-is-the-page.spec.ts` — wait for motion to settle (`expect.poll` on box, or `animations: disabled` via `page.emulateMedia({ reducedMotion: "reduce" })` for the pixel half only if the comparison is otherwise flake-prone; the spec wants settled pixels, not zero motion in ordinary mode)

**Interaction spec (real renderer, real link — do not mock):**

Seed or build a page with a `link` leaf. Default: click the link’s text; expect **no** navigation (`page.url()` still the editor) and the inspector to show that leaf’s Options. Press `interact-with-page`; click the same link; expect navigation or `target=_blank` as the public renderer does. Tab order: while locked, `a[href]` on the canvas is skipped (`inert`); while enabled, it is reachable. Preview: hide-controls, link works; Show controls, link locked again.

**Add spec:**

From Page Items, Add → layout `grid` adds a section without visiting an empty place first. Drill into a **full** two-child section, Add → layout still adds a nested container. At depth cap, layout group absent. Open picker, Escape, no new block. Preview of `text` in the picker and the canvas after add share `data-block-kind="text"`.

**Motion spec:**

Ordinary `prefers-reduced-motion: no-preference`: inspector `getComputedStyle` during the first frames after select shows opacity not yet 1 **or** a transform; after 300ms it is settled. `page.emulateMedia({ reducedMotion: "reduce" })`: duration is 0 / transform none immediately. Do not trust `MotionConfig` alone.

**Drag:** existing pointer + keyboard sibling cases in `section-drag-reorder.spec.ts` must stay green with Motion mounted.

**a11y:** axe on editor with picker **open**.

- [ ] **Step 1: Rewrite add clicks in existing e2e (one helper `addBlock(page, { kind | mode })` in `tests/e2e/support/editor.ts`)**
- [ ] **Step 2: New interaction + picker specs**
- [ ] **Step 3: Reduced-motion + drag + responsive + editor-is-the-page after settle**
- [ ] **Step 4: Commit** `test: browser-cover interaction lock, add picker, and motion`

---

### Task 8: Cost, docs, picture proof

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md` — lock, picker, Motion rules; delete any sentence that still says adding is a flat kind row or that nested sections require an empty place.
- Modify: root `CLAUDE.md` bullet — change DESIGNED, NOT BUILT to done when the work lands; until then keep it designed.
- Record on the PR: `hub` production JS size before/after `pnpm --filter hub build` (client chunks). `canvas` job / `personalised-page-cost.spec.ts` still inside budget. If either regresses past the existing ceilings, revert Motion (keep lock + picker) rather than widening the budget.
- Picture proof: locked canvas click-select; switch on and a link working; Add picker with previews (desktop + 320); nested section added from a full scope; Preview interactive.

**Operational (spec follow-up, same PR or a one-line docs PR — do not block this feature on it):** `CLAUDE.md` picture-proof paragraph must not claim `gh pr comment` uploads files.

- [ ] **Step 1: Feature note + grep stale add-palette sentences**
- [ ] **Step 2: Build + canvas measurements posted on the PR**
- [ ] **Step 3: Picture proof on the PR**
- [ ] **Step 4: Commit docs with the implementation commits, not as a substitute for tests**

---

## Spec coverage (self-review)

| Spec requirement                                                          | Task    |
| ------------------------------------------------------------------------- | ------- |
| Default lock, switch, Preview on, Show controls resets                    | 1, 3    |
| Inert descendants, observer, restore prior inert, no public-route code    | 2, 3    |
| Canvas select only while locked; no overlay                               | 2, 3, 7 |
| Toolbar placement, bilingual, compact labels                              | 3, 7    |
| One Add everywhere except leaves; layout via `mayNest`                    | 4, 5, 7 |
| Picker popup, Escape/outside, `newLeaf`/`newContainer`, `kinds` forwarded | 4, 5    |
| Real-renderer samples, not stored, outside `SKIN_SCOPE`                   | 4       |
| Presets and `add-place` unchanged                                         | 5       |
| No Add at `BLOCK_LIMITS`                                                  | 5       |
| Motion five places, durations, no delayed inspector exit                  | 6       |
| `LazyMotion` + `m`, `MotionConfig reducedMotion="user"`                   | 6       |
| Motion only in `CHROME_SCOPE`; not on dnd-kit; no `layout`                | 6, 7    |
| Reduced motion in a real browser                                          | 7       |
| Sibling drag unchanged                                                    | 7       |
| editor-is-the-page after settle                                           | 7       |
| Build + canvas cost                                                       | 8       |

## Type names later tasks rely on

- `pageInteractionsEnabled` (function and the `BlockEditor` boolean prop — same name, different layers; do not rename one without the other)
- `lockCanvasInteraction`
- `INTERACTIVE`
- `sampleLeaf` / `sampleContainer`
- `AddBlockPicker` / `add-block` / `add-block-picker` / `add-block-option`
- `EditorMotion` / `m`
- Toolbar: `interactWithPage`, `interact-with-page`

Do not introduce `editing` props on leaf renderers.
