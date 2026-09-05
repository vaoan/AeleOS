# Carrd-style page builder — Phase 1: close the checkpoint's own merge blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **One branch, one PR, sequential phases.** This is Phase 1 of 7 for
> PR #67 (`carrd-style-builder` → `main`). All seven phases land on this
> same branch and merge once, together — do not open a separate PR for
> this phase. Spec: `docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`.
> Sibling phases: `2026-09-04-carrd-style-page-builder-phase-2-compact-menu-and-add.md`
> through `…-phase-7-full-proof.md`.

**Goal:** Fix the checkpoint commit's own stated merge blockers — the public-route bundle leak, the canvas drag ids that never reach announcements/refusals, three missing discriminating tests, and one stale documentation claim — so `conformance` and `hub` (currently both red on this PR) go green, before any of the Carrd redesign's still-missing UI (compact menu, Properties panel, etc.) is built on top of it.

**Architecture:** No new subsystem. This phase is four surgical, independent fixes to code the checkpoint (`86783d6`) already shipped: (1) replace the `EditableBlockInstrumentation` data object `blocks.tsx` currently imports and interprets with a render-prop `EditorRenderHook` the editor constructs, so `blocks.tsx` never names the client-only `editable-block-frame.tsx` module; (2) resolve canvas drag ids the same way every other canvas-aware callback in `block-editor.tsx` already does (`canvasPlacePath(id) ?? placePath(id)`), inside the two functions that currently only try `placePath`; (3) three targeted tests; (4) one documentation correction.

**Tech Stack:** Next.js hub (App Router), React 19 Server/Client Components, `@dnd-kit/core` + `@dnd-kit/sortable`, TypeScript, Vitest + Testing Library, ESLint (`eslint-plugin-boundaries`), cspell.

## Global Constraints

- Every export carries TSDoc stating the contract, not the types (`pnpm check:docs` fails a stale one).
- Every bug fix gets a sabotage-verified regression test: state the exact mutation that must turn each new/changed test red, and confirm it does before restoring.
- Never `git checkout --` as a sabotage restore step (root `CLAUDE.md` rule 34) — copy the file first, or use `git stash`.
- `pnpm lint` runs from the **repository root**, never `apps/hub` (root `CLAUDE.md` operational trap #2 — from `apps/hub`, `tailwindcss` resolves wrong and nine `better-tailwindcss` rules silently disable themselves).
- 100% branch coverage including error paths (`pnpm --filter hub test:coverage`).
- One agent works this phase's tasks in order, in this one working tree — do not run this phase in parallel with any other phase's tasks in the same checkout (root `CLAUDE.md` rule 22).
- `blocks.tsx` is imported by `apps/hub/src/features/actors/public.ts` (the narrow barrel both public routes use) as well as by `index.ts` (the wide barrel `block-editor.tsx` uses) — any fix here must keep `blocks.tsx` free of any import that only an editor needs.

---

## Task 1: Verify the two failing CI checks reproduce locally, and record the exact baseline

This task establishes ground truth before touching anything, so later tasks can be checked against a real "before."

**Files:** none changed — this task only runs commands and records output.

- [ ] **Step 1: Confirm the branch and a clean tree**

```bash
git branch --show-current   # must print: carrd-style-builder
git status --short          # must print nothing
```

- [ ] **Step 2: Install dependencies if `node_modules` is absent**

```bash
pnpm install
```

- [ ] **Step 3: Reproduce the `hub` CI job's failure**

```bash
pnpm --filter hub test:coverage 2>&1 | tail -40
```

Expected: the run passes every test file, then fails at the coverage gate with output matching (percentages may drift slightly as other work lands, but the gate itself must fail before this phase's fixes and pass after):

```
ERROR: Coverage for lines (99.8%) does not meet global threshold (100%)
ERROR: Coverage for statements (99.4%) does not meet global threshold (100%)
ERROR: Coverage for branches (98.82%) does not meet global threshold (100%)
```

- [ ] **Step 4: Reproduce the `conformance` CI job's failure**

```bash
pnpm check:tools 2>&1 | tail -20
```

Expected: `cspell` reports exactly these "Unknown word (Carrd)" / "Unknown word (carrd)" hits (case differs per occurrence) and the command exits 1:

```
apps/hub/src/features/actors/domain/block-drops.ts:24:6 - Unknown word (Carrd)
apps/hub/src/features/actors/domain/block-edits.ts:407:11 - Unknown word (Carrd)
apps/hub/tests/block-drops.test.ts:22:4 - Unknown word (Carrd)
CLAUDE.md:1894:5 - Unknown word (Carrd)
CLAUDE.md:1905:38 - Unknown word (carrd)
docs/superpowers/specs/2026-09-01-recursive-inspector-drill-down-design.md:9:42 - Unknown word (carrd)
docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md:1:3 - Unknown word (Carrd)
CSpell: Files checked: 519, Issues found: 7 in 6 files.
```

- [ ] **Step 5: Nothing to commit.** This task is diagnostic only.

---

## Task 2: Fix `conformance` — teach cspell the word "Carrd"

`Carrd` is a real external product's proper noun, used as the design's own namesake throughout TSDoc comments, a test file's own header comment, and this feature's living documentation — it is not a one-off typo or a word coined for a single sentence, so per root `CLAUDE.md` rule 41's own standard ("a word the CODE needs... appears in an identifier, a TSDoc, or a test name" earns dictionary entry; "a coined word used once in a sentence" does not), it belongs in the project dictionary rather than being reworded away seven times.

**Files:**

- Modify: `cspell.json` (or wherever the `words` list lives — confirm the exact file with `grep -rn '"words"' --include='*.json' .` from repo root before editing; do not guess the path)

**Interfaces:** none — this is a dictionary entry, not code.

- [ ] **Step 1: Locate the dictionary file and its current `words` array**

```bash
grep -rln '"words"' --include='*.json' . | grep -v node_modules
```

- [ ] **Step 2: Add `"Carrd"` to the `words` array**, alphabetically among the existing entries (matching this repo's existing convention — check whether the array is already sorted before deciding where to insert). cspell's own word matching is case-insensitive for a `words` entry by default, so one entry covers both `Carrd` and `carrd`; confirm this by running Step 3 rather than assuming it.

- [ ] **Step 3: Re-run cspell and confirm all seven hits are gone**

```bash
pnpm check:tools 2>&1 | grep -i carrd
```

Expected: no output.

```bash
pnpm check:tools 2>&1 | tail -5
```

Expected: the `cspell` line no longer appears in the failure output; the command should now proceed past the point it stopped at in Task 1 Step 4 (it may still fail later in the `check:tools` chain — that is fine, this task only owns the cspell failure and nothing else in that chain was reported red in the original CI run).

- [ ] **Step 4: Commit**

```bash
git add cspell.json   # or the actual path found in Step 1
git commit -m "Teach cspell the name of the product this design is named after"
```

---

## Task 3: Fix `hub` — close the public-route bundle leak with a render-prop seam

This is the blocker the PR body calls "critical" and asks the next provider to begin with. `presentation/blocks.tsx` is imported by `features/actors/public.ts` (the narrow barrel `/[locale]/[person]` and `/[locale]/[person]/[handle]` use) as well as by the wide `index.ts` barrel `block-editor.tsx` uses. Today, `blocks.tsx` has a **static** top-level `import { EditableBlockFrame, type EditableBlockInstrumentation } from "@/features/actors/presentation/editable-block-frame"` — a `"use client"` module that imports `@dnd-kit/core`. Because ES module imports are analysed statically, this drags `@dnd-kit` and the editor-only wrapper into **every** route that imports `blocks.tsx`, including the two fully public, signed-out routes, even though the `editor` prop those routes pass is always `undefined` and no `EditableBlockFrame` node is ever mounted there. This is the exact shape of fault the actors `CLAUDE.md`'s "public routes have their own barrel" section already fixed once for Motion — same mechanism, this time for dnd-kit.

The fix: `blocks.tsx` stops importing anything from `editable-block-frame.tsx`. Instead, `BlockProps.editor` (and `ModeProps.editor`) become a small function-shaped interface — `EditorRenderHook` — that `blocks.tsx` calls but never constructs. Only `block-editor.tsx` (which already only exists on editor routes) imports `EditableBlockFrame` and builds the hook.

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/blocks.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/editable-block-frame.tsx` (TSDoc only — its own props are unchanged, only who constructs the wrapping changes)
- Test: `apps/hub/tests/blocks.test.tsx` (new cases)
- Test: `apps/hub/tests/block-editor.test.tsx` (existing `editor`-object-literal assertions need updating to the new call shape)

**Interfaces:**

- Consumes: nothing new from earlier tasks.
- Produces: `EditorRenderHook` (exported from `apps/hub/src/features/actors/presentation/blocks.tsx`) — `{ wrap(args: { path: string; filled: boolean; children: ReactNode }): ReactNode }`. `BlockProps.editor?: EditorRenderHook`. `ModeProps.editor?: EditorRenderHook`. Phase 2 and later phases construct this hook from `block-editor.tsx`; no other phase needs to touch `blocks.tsx`'s own recursion for this reason again.

- [ ] **Step 1: Read the current file in full**

```bash
sed -n '1,50p' apps/hub/src/features/actors/presentation/blocks.tsx
```

Confirm the current import block still reads:

```ts
import {
  EditableBlockFrame,
  type EditableBlockInstrumentation,
} from "@/features/actors/presentation/editable-block-frame";
```

and that `BlockProps.editor?: EditableBlockInstrumentation`, `ModeProps.editor?: EditableBlockInstrumentation`, and the two render sites (the leaf branch and the container branch of `Block`, plus the empty-place branch of `placeIn`) each do:

```tsx
return editor ? (
  <EditableBlockFrame path={path} filled editor={editor}>
    {rendered}
  </EditableBlockFrame>
) : (
  rendered
);
```

If any of this has already changed since the checkpoint commit, stop and re-read this task against the current file before proceeding — the diffs below assume this exact starting shape.

- [ ] **Step 2: Write the failing test proving the current leak**

This test asserts a build fact, not a unit behavior, so it belongs beside the existing bundle-boundary guard rather than in `blocks.test.tsx`'s component-render suite. Add to `apps/hub/tests/public-route-imports.test.ts` (the existing guard for the barrel split):

```ts
it("keeps the shared block renderer free of the editor's own drag wrapper", () => {
  const source = readFileSync(
    resolve(__dirname, "../src/features/actors/presentation/blocks.tsx"),
    "utf8",
  );
  expect(source).not.toMatch(/editable-block-frame/);
});
```

(Match this file's existing imports for `readFileSync`/`resolve`/`__dirname` — it already reads route sources the same way; reuse that pattern rather than inventing a second one.)

- [ ] **Step 2b: Run it to verify it fails**

```bash
pnpm --filter hub exec vitest run tests/public-route-imports.test.ts -t "keeps the shared block renderer free"
```

Expected: FAIL — `blocks.tsx` currently does match `/editable-block-frame/`.

- [ ] **Step 3: Add `EditorRenderHook` to `blocks.tsx` and remove the `editable-block-frame` import**

Replace the import block:

```ts
// DELETE:
import {
  EditableBlockFrame,
  type EditableBlockInstrumentation,
} from "@/features/actors/presentation/editable-block-frame";
```

Add, near `BlockProps` in the same file:

```ts
/**
 * Editor-owned wrapping around one rendered block or empty place.
 *
 * **This file never imports the module that builds one.** `blocks.tsx`
 * renders every public route as well as the editor canvas, so a static
 * import of the editor's own drag wrapper here would pull `@dnd-kit` into
 * every public route's bundle whether or not any instrumentation ever
 * mounts — exactly the fault the "public routes have their own barrel"
 * account in `apps/hub/src/features/actors/CLAUDE.md` already fixed once
 * for Motion. `wrap` is constructed by `block-editor.tsx`, the file that
 * already only exists on editor routes, and handed down through the same
 * `editor` prop that already threads through this recursion.
 */
export interface EditorRenderHook {
  /**
   * Wraps one rendered block or empty positional place.
   *
   * @param args - the renderer path (`""` for the page itself), whether a
   * block currently fills that place, and the unmodified rendered node.
   * @returns the node, optionally wrapped with editor-only chrome. The
   * caller is responsible for any `key` a surrounding `.map()` needs — this
   * function's own return value is not itself a list item.
   */
  wrap(args: {
    readonly path: string;
    readonly filled: boolean;
    readonly children: ReactNode;
  }): ReactNode;
}
```

Change the two prop types:

```ts
// BlockProps
editor?: EditorRenderHook;
```

```ts
// ModeProps
editor?: EditorRenderHook;
```

Update `BlockProps.editor`'s own TSDoc paragraph (the one added by the checkpoint, starting "Editor-only instrumentation for direct manipulation") to say:

```ts
/**
 * Editor-owned wrapping for direct manipulation of this rendered tree.
 *
 * Absent on public routes, where the renderer emits exactly its ordinary
 * markup with no wrapping at all. See {@link EditorRenderHook}.
 */
editor?: EditorRenderHook;
```

- [ ] **Step 4: Replace both render sites in `Block`**

In the leaf branch:

```tsx
// BEFORE
return editor ? (
  <EditableBlockFrame path={path} filled editor={editor}>
    {rendered}
  </EditableBlockFrame>
) : (
  rendered
);

// AFTER
return editor
  ? editor.wrap({ path, filled: true, children: rendered })
  : rendered;
```

Apply the identical replacement in the container branch at the foot of `Block` (the second occurrence of the same `editor ? (<EditableBlockFrame …>` pattern).

- [ ] **Step 5: Replace the empty-place branch in `placeIn`**

```tsx
// BEFORE
if (!seat.block) {
  const space = <div {...tid("public-space")} />;
  return props.editor ? (
    <EditableBlockFrame
      key={seat.path}
      path={seat.path}
      filled={false}
      editor={props.editor}
    >
      {space}
    </EditableBlockFrame>
  ) : (
    <div key={seat.path} {...tid("public-space")} />
  );
}

// AFTER
if (!seat.block) {
  const space = <div {...tid("public-space")} />;
  return props.editor ? (
    <Fragment key={seat.path}>
      {props.editor.wrap({ path: seat.path, filled: false, children: space })}
    </Fragment>
  ) : (
    <div key={seat.path} {...tid("public-space")} />
  );
}
```

Add `Fragment` to this file's existing `react` import if it is not already imported.

- [ ] **Step 6: Run the new test to confirm it passes**

```bash
pnpm --filter hub exec vitest run tests/public-route-imports.test.ts -t "keeps the shared block renderer free"
```

Expected: PASS.

- [ ] **Step 7: Update `block-editor.tsx` to construct the hook**

Find the existing `editor={ controlsHidden || interactionsEnabled ? undefined : { selectedPath, activeTarget, dragLabel } }` object literal (checkpoint commit, inside the `PublicBlock` invocation near the seats map). Import `EditableBlockFrame` and the (now-renamed) instrumentation type here — this file is the one place in the app that is allowed to import it, because it only ever renders on an editor route:

```ts
import { EditableBlockFrame } from "@/features/actors/presentation/editable-block-frame";
import type { EditorRenderHook } from "@/features/actors/presentation/blocks";
```

Replace the object literal:

```tsx
// BEFORE
editor={
  controlsHidden || interactionsEnabled
    ? undefined
    : {
        selectedPath: selectedAttr || undefined,
        activeTarget: advertisedTarget,
        dragLabel: labels.dragBlock,
      }
}

// AFTER
editor={
  controlsHidden || interactionsEnabled
    ? undefined
    : ({
        wrap: ({ path, filled, children }) => (
          <EditableBlockFrame
            path={path}
            filled={filled}
            editor={{
              selectedPath: selectedAttr || undefined,
              activeTarget: advertisedTarget,
              dragLabel: labels.dragBlock,
            }}
          >
            {children}
          </EditableBlockFrame>
        ),
      } satisfies EditorRenderHook)
}
```

- [ ] **Step 8: Update `block-editor.test.tsx`'s existing assertions**

Find any test that currently asserts on the shape of the `editor` prop object passed to `PublicBlock`/`Block` directly (searching for `selectedPath:` or `activeTarget:` in that test file). Those tests almost certainly instead assert on rendered DOM (`canvas-drag-node`, the grip test id, `data-canvas-drop`) rather than on the prop object itself, since the object was never exposed to a test — confirm this by reading the file; if any test does reach into the prop directly, rewrite it to assert on rendered output instead, since the prop's shape is now an implementation detail of the hook rather than a data contract.

```bash
grep -n "selectedPath\|activeTarget\b" apps/hub/tests/block-editor.test.tsx
```

- [ ] **Step 9: Run the full `blocks.test.tsx` and `block-editor.test.tsx` suites**

```bash
pnpm --filter hub exec vitest run tests/blocks.test.tsx tests/block-editor.test.tsx
```

Expected: PASS, no changes needed beyond Step 8 if any were required.

- [ ] **Step 10: Sabotage-verify the bundle-leak test**

Copy `blocks.tsx` aside, re-add the deleted import line only (leave everything else as the fixed version — i.e. reintroduce just `import { EditableBlockFrame, type EditableBlockInstrumentation } from "@/features/actors/presentation/editable-block-frame";` at the top, unused), then run:

```bash
cp apps/hub/src/features/actors/presentation/blocks.tsx /tmp/blocks.tsx.bak
# make the sabotage edit by hand: re-add the deleted import line
pnpm --filter hub exec vitest run tests/public-route-imports.test.ts -t "keeps the shared block renderer free"
```

Expected: FAIL — confirms the test can catch the exact fault it exists to catch. Restore:

```bash
cp /tmp/blocks.tsx.bak apps/hub/src/features/actors/presentation/blocks.tsx
rm /tmp/blocks.tsx.bak
pnpm --filter hub exec vitest run tests/public-route-imports.test.ts -t "keeps the shared block renderer free"
```

Expected: PASS again.

- [ ] **Step 11: Measure the actual bundle delta with a real build**

This is the check that matters most — the unit test proves the _source_ names no forbidden module; only a real build proves nothing reaches the _bundle_. Follow the exact method the actors `CLAUDE.md`'s Motion section already used:

```bash
pnpm --filter hub build
cat apps/hub/.next/diagnostics/route-bundle-stats.json | node -e '
const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
for (const [route, info] of Object.entries(data)) {
  if (/\[person\]|\/me|\/pages|\/fursonas/.test(route)) {
    console.log(route, JSON.stringify(info).length > 200 ? "(see full file)" : info);
  }
}
'
```

Read the actual structure of `route-bundle-stats.json` first (`cat apps/hub/.next/diagnostics/route-bundle-stats.json | head -c 2000`) and adapt the extraction above to however that file is actually shaped — the goal is a before/after byte count for `/[locale]/[person]` and `/[locale]/[person]/[handle]` (the two fully public routes) and for one editor route (e.g. `/[locale]/me`).

To get a genuine "before" number for comparison, stash this task's changes, build, record the number, then restore:

```bash
git stash push -- apps/hub/src/features/actors/presentation/blocks.tsx apps/hub/src/features/actors/presentation/block-editor.tsx
pnpm --filter hub build
# record the "before" byte counts for the same routes
git stash pop
pnpm --filter hub build
# record the "after" byte counts
```

Expected: the two public routes' first-load JS drops by roughly the size of `@dnd-kit/core` + `@dnd-kit/utilities` + `editable-block-frame.tsx`'s own code (tens of KB, not zero) — matching the CLAUDE.md's own precedent numbers in kind if not in exact value. Editor routes should be unchanged (they still reach the same code, just through `block-editor.tsx`'s import now instead of `blocks.tsx`'s). Write the exact before/after numbers you observe into this task's commit message — do not claim a number you did not measure.

- [ ] **Step 12: Run the full hub test suite and lint from repo root**

```bash
pnpm --filter hub test
cd /Users/heiner_angaritamaldonado/Documents/AeleOS && pnpm lint
pnpm typecheck
pnpm check:docs
```

Expected: all PASS. `check:docs` matters here specifically: `EditorRenderHook` is a new exported symbol and needs TSDoc `check:docs` is satisfied with (already written in Step 3).

- [ ] **Step 13: Commit**

```bash
git add apps/hub/src/features/actors/presentation/blocks.tsx \
        apps/hub/src/features/actors/presentation/block-editor.tsx \
        apps/hub/tests/public-route-imports.test.ts \
        apps/hub/tests/block-editor.test.tsx
git commit -m "Stop blocks.tsx from naming the editor's own drag wrapper

blocks.tsx is imported by both public routes and the editor; a static
import of editable-block-frame.tsx pulled @dnd-kit into every public
route's bundle regardless of whether any instrumentation ever mounted.
BlockProps.editor is a render-prop (EditorRenderHook) now, constructed
only by block-editor.tsx, which already only exists on editor routes."
```

---

## Task 4: Fix `hub` — route canvas drag ids through announcements and refusal wording

`dragAnnouncements`'s `name` callback and `block-editor.tsx`'s own `refusalOf` both currently resolve a drag id with `placePath(id)` alone. `placePath` only recognises the inspector's `place:` prefix; a canvas drag id (`canvas-place:0.1`, produced by `canvasPlaceId`) makes `placePath` return `undefined`, so `placeName(placePath(id) ?? [])` silently announces `placeName([])` (an empty string) for every canvas drag, and `refusalOf`'s `placePath(activeId)`/`placePath(overId)` both answer `undefined`, so `applySiblingDrop` is never called and a refused canvas drop never gets a spoken sentence. Every other canvas-aware place in this same file (`onDragStart`, `onDragEnd`, `coordinateGetter`, `detectCollision`) already resolves an id with `canvasPlacePath(id) ?? placePath(id)` — this task makes the last two callbacks consistent with that existing pattern.

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Test: `apps/hub/tests/block-editor.test.tsx`

**Interfaces:**

- Consumes: `canvasPlacePath`, `placePath` from `@/features/actors/domain/block-drag` (both already imported in this file).
- Produces: nothing new — this is a bugfix inside two existing functions (`refusalOf`, the `announcements` object literal), no signature changes.

- [ ] **Step 1: Write the failing test**

Add to `apps/hub/tests/block-editor.test.tsx`, in whichever `describe` block already covers drag announcements (search for `dragAnnouncements` or `refusalOf` or the existing sibling-drag-announcement test to find it):

```tsx
it("announces a canvas drag by its place name, not by an empty string", () => {
  render(<BlockEditor {...defaultProps} />);
  // Lift the first top-level block's canvas drag node by keyboard, matching
  // this file's existing keyboard-drag test setup for the inspector case.
  const grip = screen.getByTestId("canvas-drag-0");
  fireEvent.keyDown(grip, { code: "Space" });
  const liveRegion = document.querySelector("[aria-live]")!;
  expect(liveRegion.textContent).not.toBe("");
  expect(liveRegion.textContent).toContain("1"); // one-based place name
  fireEvent.keyDown(grip, { code: "Escape" });
});
```

Match this file's exact existing keyboard-drag test helpers rather than inventing new ones — read the nearest existing `it("...announces...")` case for the inspector and mirror its setup (rendering, `screen.getByTestId`, the live-region selector it already uses) exactly, substituting the canvas grip test id for the inspector one.

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter hub exec vitest run tests/block-editor.test.tsx -t "announces a canvas drag"
```

Expected: FAIL — the live region's `textContent` is empty (or does not contain a place number) because `placeName(placePath(id) ?? [])` resolves to `placeName([])`.

- [ ] **Step 3: Fix `refusalOf`**

```ts
// BEFORE
const refusalOf = (activeId: string, overId: string): string | undefined => {
  const from = placePath(activeId);
  const to = placePath(overId);
  if (!from || !to) return;
  const result = applySiblingDrop(blocks, from, to);
  if (!result) return;
  return result.ok ? undefined : refusalText(result.refusal);
};

// AFTER
const refusalOf = (activeId: string, overId: string): string | undefined => {
  const from = canvasPlacePath(activeId) ?? placePath(activeId);
  const to = canvasPlacePath(overId) ?? placePath(overId);
  if (!from || !to) return;
  const result = applySiblingDrop(blocks, from, to);
  if (!result) return;
  return result.ok ? undefined : refusalText(result.refusal);
};
```

- [ ] **Step 4: Fix the `announcements` name callback**

```ts
// BEFORE
const accessibility = {
  announcements: dragAnnouncements(
    labels.drag,
    (id) => placeName(placePath(id) ?? []),
    refusalOf,
  ),
  screenReaderInstructions: { draggable: labels.drag.instructions },
};

// AFTER
const accessibility = {
  announcements: dragAnnouncements(
    labels.drag,
    (id) => placeName(canvasPlacePath(id) ?? placePath(id) ?? []),
    refusalOf,
  ),
  screenReaderInstructions: { draggable: labels.drag.instructions },
};
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
pnpm --filter hub exec vitest run tests/block-editor.test.tsx -t "announces a canvas drag"
```

Expected: PASS.

- [ ] **Step 6: Sabotage-verify**

```bash
cp apps/hub/src/features/actors/presentation/block-editor.tsx /tmp/block-editor.tsx.bak
```

Edit `refusalOf` back to `placePath(activeId)`/`placePath(overId)` only (remove the `canvasPlacePath(...) ??` prefix on both lines), leaving the `announcements` fix in place. Run:

```bash
pnpm --filter hub exec vitest run tests/block-editor.test.tsx -t "announces a canvas drag"
```

Expected: still PASS if the test above only exercises the `announcements` name path and not `refusalOf` — if so, this proves the test as written does **not** discriminate the `refusalOf` half of this fix, and you must add a second assertion that does (e.g. drop a canvas block into a place that would overflow `BLOCK_LIMITS.children` and assert the spoken refusal sentence is non-empty and matches `labels.drag.tooMany`, not silent). Add that second case now before proceeding — do not ship a fix half of which no test can fail against.

Restore and re-verify both halves are covered:

```bash
cp /tmp/block-editor.tsx.bak apps/hub/src/features/actors/presentation/block-editor.tsx
rm /tmp/block-editor.tsx.bak
pnpm --filter hub exec vitest run tests/block-editor.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src/features/actors/presentation/block-editor.tsx \
        apps/hub/tests/block-editor.test.tsx
git commit -m "Route canvas drag ids through announcements and refusal wording

placePath alone never recognised a canvas-place: id, so a canvas drag
announced an empty place name and a refused canvas drop never spoke.
Both callbacks now resolve an id the same way every other canvas-aware
callback in this file already does."
```

---

## Task 5: Add the three missing discriminating tests the PR body names

Three gaps, each independent, each with its own sabotage.

**Files:**

- Test: `apps/hub/tests/block-drops.test.ts` (the "too many" refusal)
- Test: `apps/hub/tests/block-editor.test.tsx` (Interact-mode stripping)
- Test: `apps/hub/tests/block-edits.test.ts` (three `insertAt` edge contracts)

**Interfaces:** none new — these tests exercise existing exports (`applyDrop`/`applyLinearDrop` via `block-drops.ts`'s public surface, `insertAt` from `block-edits.ts`, and `BlockEditor`'s rendered output).

### 5a — the `too many` refusal on a cross-container linear drop

- [ ] **Step 1: Write the failing test**

Add to `apps/hub/tests/block-drops.test.ts`. Build a `stack` container already holding `BLOCK_LIMITS.children` leaves, and a second top-level `stack` holding one block; drag that one block from the second stack into the first stack's list (a cross-parent linear insert):

```ts
it("refuses a cross-container insert that would overflow the destination's children cap", () => {
  const full = stack(
    Array.from({ length: BLOCK_LIMITS.children }, (_, i) => text(`t${i}`)),
  );
  const source = stack([text("mover")]);
  const blocks = [full, source];
  const result = applyDrop(blocks, [1, 0], {
    kind: "after",
    path: [0, BLOCK_LIMITS.children - 1],
  });
  expect(result).toEqual({ ok: false, refusal: "too many" });
});
```

Match this file's existing `stack(...)`/`text(...)` fixture helpers exactly — read the top of `block-drops.test.ts` for their real signatures before writing this; do not assume the names above are exact if the file's own helpers differ.

- [ ] **Step 2: Run it to verify it fails or passes for the wrong reason**

```bash
pnpm --filter hub exec vitest run tests/block-drops.test.ts -t "refuses a cross-container insert that would overflow"
```

If it already passes, that means `applyLinearDrop`'s existing `too many` branch (visible in the current source around the `!sameParent && destParent.length > 0 && destLength + 1 > BLOCK_LIMITS.children` check) already handles this — in which case this test is not a new behavior, only new _coverage_, which is exactly what the PR body asked for. Confirm this by checking coverage moved:

```bash
pnpm --filter hub test:coverage 2>&1 | grep -A2 "block-drops.ts"
```

- [ ] **Step 3: Sabotage-verify**

```bash
cp apps/hub/src/features/actors/domain/block-drops.ts /tmp/block-drops.ts.bak
```

Change the comparison `destLength + 1 > BLOCK_LIMITS.children` to `destLength + 1 > BLOCK_LIMITS.children + 1` (off-by-one, admits one too many). Run the test:

```bash
pnpm --filter hub exec vitest run tests/block-drops.test.ts -t "refuses a cross-container insert that would overflow"
```

Expected: FAIL. Restore:

```bash
cp /tmp/block-drops.ts.bak apps/hub/src/features/actors/domain/block-drops.ts
rm /tmp/block-drops.ts.bak
```

### 5b — Interact-mode stripping

- [ ] **Step 1: Write the failing test**

Add to `apps/hub/tests/block-editor.test.tsx`:

```tsx
it("renders no drag wrappers or grips while page interaction is on", async () => {
  render(<BlockEditor {...defaultProps} />);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("switch", { name: labels.interactWithPage }),
  );
  expect(screen.queryByTestId("canvas-drag-node")).not.toBeInTheDocument();
  expect(screen.queryByTestId(/^canvas-drag-/)).not.toBeInTheDocument();
});
```

Adjust the switch's accessible name/role to match `EditorToolbar`'s actual markup for the "Interact with page" control — read `editor-toolbar.tsx` for its real `aria-label`/role before writing this line; `queryByTestId(/^canvas-drag-/)` needs a regex-capable query, confirm this codebase's Testing Library setup supports it (it does, by default) or use `screen.queryAllByTestId` with a filter instead if not.

- [ ] **Step 2: Run it to verify it fails or passes for the wrong reason**

```bash
pnpm --filter hub exec vitest run tests/block-editor.test.tsx -t "renders no drag wrappers"
```

This is very likely to **pass already** — Task 3, Step 7's `controlsHidden || interactionsEnabled ? undefined : {...}` ternary already strips `editor` correctly. If it passes on the first run, this test is pure coverage-closing, matching the PR body's own framing ("missing discriminating coverage," not "missing behavior").

- [ ] **Step 3: Sabotage-verify**

```bash
cp apps/hub/src/features/actors/presentation/block-editor.tsx /tmp/block-editor.tsx.bak
```

Change the ternary condition from `controlsHidden || interactionsEnabled` to `controlsHidden` alone (drop the `interactionsEnabled` check). Run:

```bash
pnpm --filter hub exec vitest run tests/block-editor.test.tsx -t "renders no drag wrappers"
```

Expected: FAIL. Restore:

```bash
cp /tmp/block-editor.tsx.bak apps/hub/src/features/actors/presentation/block-editor.tsx
rm /tmp/block-editor.tsx.bak
```

### 5c — `insertAt`'s three edge contracts

`insertAt(blocks, path, block)` has (at least) three contracts nothing currently pins: an empty path is a safe no-op that silently drops `block` (per `insertEntry`'s `if (path.length === 0) return [...entries];`); a top-level index one past the last entry appends; and — this is the one worth the most attention — a **negative** top-level index is passed straight to `Array.prototype.splice`, whose own negative-index semantics (count from the end) mean `insertAt(blocks, [-1], block)` inserts before the last existing entry rather than refusing or prepending. Confirm this reading against the actual current source before writing the test:

```bash
sed -n '416,453p' apps/hub/src/features/actors/domain/block-edits.ts
```

- [ ] **Step 1: Write the three failing tests**

Add to `apps/hub/tests/block-edits.test.ts`:

```ts
describe("insertAt edge contracts", () => {
  it("is a safe no-op on an empty path, and drops nothing else", () => {
    const blocks = [text("a"), text("b")];
    const result = insertAt(blocks, [], text("new"));
    expect(result).toEqual(blocks);
  });

  it("appends when the top-level index is exactly one past the last entry", () => {
    const blocks = [text("a"), text("b")];
    const result = insertAt(blocks, [2], text("new"));
    expect(result.map((b) => b.title_en)).toEqual(["a", "b", "new"]);
  });

  it("documents that a negative top-level index inserts from the end, not the start", () => {
    const blocks = [text("a"), text("b"), text("c")];
    const result = insertAt(blocks, [-1], text("new"));
    // JS splice(-1, 0, x) inserts before the LAST element — this is the
    // native array semantics `insertAt` inherits, not a domain rule. If this
    // assertion ever fails because insertAt starts clamping negative
    // indices, that is a deliberate behavior change and this test's
    // expectation must change with it, not silently.
    expect(result.map((b) => b.title_en)).toEqual(["a", "b", "new", "c"]);
  });
});
```

Match `text(...)`'s real fixture signature from this file's existing helpers (it may take a title string directly or an options object — read the top of the file before assuming `text("a")` compiles).

- [ ] **Step 2: Run them to verify they pass, describing the real current contract**

```bash
pnpm --filter hub exec vitest run tests/block-edits.test.ts -t "insertAt edge contracts"
```

Expected: all three PASS as written above, against the _current_ implementation — these tests are documentation-as-code for behavior that already exists and was simply unpinned, per the PR body's own framing. If any of the three does not match the behavior you observe, correct the test's expectation to match reality (this task's job is to make the real contract checkable, not to change it) and re-verify.

- [ ] **Step 3: Decide whether the negative-index behavior is acceptable, and record the decision**

Read whether any caller of `insertAt` can ever pass a negative top-level index today. `block-drops.ts`'s `applyLinearDrop` always derives `insert` from `destIndex`/`destIndex + 1`, where `destIndex` comes from `target.path.at(-1)!` and `target.path` is only ever produced by `placeExists`-validated real paths from the rendered tree — never a raw negative literal. Confirm this with:

```bash
grep -rn "insertAt(" apps/hub/src/features/actors/
```

If every call site is provably safe today, leave the behavior as documented rather than adding defensive clamping nothing exercises — an unreachable guard is untestable and this repository's own coverage gate would flag it. Write one sentence into `insertAt`'s own TSDoc naming this: "A negative top-level index is not defended against, because every current caller derives its path from a validated place; do not pass a raw index here without re-checking this note."

- [ ] **Step 4: Update `insertAt`'s TSDoc with the sentence from Step 3**

- [ ] **Step 5: Run the full domain test file and `check:docs`**

```bash
pnpm --filter hub exec vitest run tests/block-edits.test.ts
cd /Users/heiner_angaritamaldonado/Documents/AeleOS && pnpm check:docs
```

- [ ] **Step 6: Commit all three sub-tasks together**

```bash
git add apps/hub/tests/block-drops.test.ts \
        apps/hub/tests/block-editor.test.tsx \
        apps/hub/tests/block-edits.test.ts \
        apps/hub/src/features/actors/domain/block-edits.ts
git commit -m "Pin the three coverage gaps the checkpoint's own PR body named

too many on a cross-container linear insert, Interact-mode stripping the
canvas's editor wrappers, and insertAt's empty-path/append/negative-index
contracts. All three describe behavior that already existed and was
simply unpinned; none changes behavior except insertAt's own TSDoc."
```

---

## Task 6: Correct the stale documentation claim about linear insertion

`apps/hub/src/features/actors/CLAUDE.md` line ~1976 says, unqualified: **"A drop is an EXCHANGE, and insert-and-shift was refused rather than overlooked."** That was true of every container mode until this branch. It is false now for `stack`, `list`, and `timeline`, which `block-drops.ts`'s `applyLinearDrop` implements as exactly the insert-and-shift model that paragraph says was refused. It remains true for the positional modes (`grid`, `masonry`, `carousel`, `tabs`, `accordion`), which still go through `moveBlock` unchanged.

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md` (the paragraph at the line found in Step 1, and the paragraph immediately after it)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Locate the exact paragraph**

```bash
grep -n "insert-and-shift was refused" apps/hub/src/features/actors/CLAUDE.md
```

- [ ] **Step 2: Read the full paragraph and the one after it, to know exactly what else references this claim**

```bash
sed -n '1976,2010p' apps/hub/src/features/actors/CLAUDE.md
```

- [ ] **Step 3: Rewrite the paragraph to state both truths, dated**

Replace the opening sentence:

```
**A drop is an EXCHANGE, and insert-and-shift was refused rather than
overlooked.**
```

with:

```
**A drop was an EXCHANGE everywhere, and insert-and-shift was refused
rather than overlooked — until 2026-09-04, and only for POSITIONAL modes
now.** The Carrd-style page builder
(`docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`)
gave `stack`, `list` and `timeline` exactly the insert-and-shift model this
paragraph used to say was refused everywhere — see `domain/block-drops.ts`'s
`applyLinearDrop` and `LINEAR_MODES`. What follows is still the correct and
current account for `grid`, `masonry`, `carousel`, `tabs` and `accordion`,
where a place is still positional and the argument below (an empty place
keeps its width; shifting one would move a shape somebody deliberately
left) still holds exactly as written.
```

Leave the rest of the paragraph (the argument for why shifting is wrong for a _positional_ place) untouched — it remains true, just now scoped.

- [ ] **Step 4: Grep the rest of this file and the root `CLAUDE.md` for any other sentence repeating the same now-partial claim**

```bash
grep -n "insert-and-shift\|Sliding the row along\|slides along" apps/hub/src/features/actors/CLAUDE.md CLAUDE.md
```

Correct any other instance found the same way — scope it to positional modes rather than deleting the reasoning, since the reasoning is still true there.

- [ ] **Step 5: Run the documentation freshness and agent-notes checks**

```bash
pnpm check:docs
pnpm check:agent-notes
```

Expected: both PASS (this file is a `CLAUDE.md`, which `check:agent-notes` governs — confirm no other file changed in this phase's tasks under `features/actors/` without a corresponding note update; if any did, add the note update now rather than in a later phase).

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/CLAUDE.md
git commit -m "Correct a doc claim the checkpoint's own commit made partly false

Insert-and-shift was refused everywhere until this branch gave stack,
list and timeline exactly that model. The positional-mode reasoning
this paragraph makes is still correct and is now scoped to say so."
```

---

## Task 7: Full local verification, matching what CI runs

- [x] **Step 1: Run every check `conformance` and `hub` run, in order**

```bash
cd /Users/heiner_angaritamaldonado/Documents/AeleOS
pnpm lint
pnpm typecheck
pnpm check:docs
pnpm check:agent-notes
pnpm check:tools
pnpm --filter hub test:coverage
pnpm --filter hub build
```

Expected: every command exits 0.

- [x] **Step 2: If any command fails, do not proceed to Phase 2** — return to the task above that owns the failing check and fix it there rather than patching around it in this task.

- [x] **Step 3: Push and confirm CI is green on the real PR**

```bash
git push origin carrd-style-builder
```

Then poll (do not sleep-loop faster than the run actually needs; check every ~90 seconds):

```bash
set -a && . ./.secrets && set +a && export GH_TOKEN="$GH_TOKEN"
gh pr view 67 --json statusCheckRollup --jq '.statusCheckRollup[] | {name, conclusion, status}'
```

Expected, once the run completes: `conformance` and `hub` both `SUCCESS`. `e2e` may still be red — Task 1's diagnosis found four pre-existing-or-regressed failures there (`section-card-face.spec.ts`'s "light: the picture still previews at full strength" case, and three `section-drag-reorder.spec.ts` cases each failing a deep-equality assertion) that this phase does not scope to fix; they are Phase 5's or Phase 6's concern once the canvas and inspector drag mechanisms stop coexisting under separate id prefixes. Do not treat `e2e` failures as blocking Phase 1's own definition of done, but do record their exact names in the Phase 1 → Phase 2 handoff so nobody re-diagnoses them from scratch.

- [x] **Step 4: Write the phase's own completion note into this plan file**

Append a short "Phase 1 status" section at the foot of this file (not a new file) recording: the exact `before`/`after` bundle byte counts measured in Task 3 Step 11, and the four `e2e` failures observed in Step 3 above, verbatim, so Phase 2's implementer does not need to re-run CI to learn what is already known.

---

## Phase 1 status (2026-09-04) — done

All seven tasks landed. `conformance` and `hub` are both `SUCCESS` on PR #67
at commit `baa7376` (`gh pr view 67 --json headRefOid` confirms that commit
is what CI evaluated); `canvas`, `schema-drift` and `idp-cloud` are `SUCCESS`
too. `e2e` is `FAILURE`, on exactly the four cases Task 1's diagnosis
predicted and named above — none new, none this phase's to fix.

**Task 7 itself found a gap the plan did not anticipate**, worth recording
because it cost real work between "the plan's own tasks are done" and "the
gate is green": `pnpm --filter hub test:coverage` failed after Task 6's own
"redundant check, left as-is" ruling on `applyLinearDrop`'s early "too many"
exit — a dead branch is untestable by construction, and this repo's 100%
gate refuses that exactly like an untested live one. Fixing it surfaced a
second, previously-hidden dead branch one function over (`listLength`'s own
`undefined`-returning arm, and `applyLinearDrop`'s consumption of it) and six
genuine coverage gaps in `dropTargetForSibling`/`applySiblingDrop`'s
non-sibling paths, three arms of `placeExists`, `applyDrop`'s `place`-kind
refusal hand-off, and dragging from an empty place under a linear target.
All landed as their own commit, `baa7376`, "Close the coverage gaps
test:coverage found one task later" — see that commit and the feature note's
own dated paragraph in `apps/hub/src/features/actors/CLAUDE.md` for the
account and the reachability proofs.

**Bundle byte counts, measured twice.** The barrel split itself (Task 3 Step
11, already recorded in `apps/hub/src/features/actors/CLAUDE.md` under "The
public routes have their own barrel"):

| route                                |    before |     after |    delta |
| ------------------------------------ | --------: | --------: | -------: |
| `/[locale]/[person]` (+ `/[handle]`) | 1,943,136 | 1,008,803 | −934,333 |
| the six editor routes                | 1,950,813 | 1,950,989 |     +176 |

A fresh `pnpm --filter hub build` at the end of Task 7 — after the coverage
fix's own small edit to `block-drops.ts` — reads `firstLoadUncompressedJsBytes`
of **1,957,333** for the six editor routes and **1,008,869** for
`/[locale]/[person]` (+ `/[handle]`) from
`apps/hub/.next/diagnostics/route-bundle-stats.json`. Both numbers moved a
few hundred bytes from the table above, which is Task 7's own code (a few
lines removed from `applyLinearDrop`, a few added elsewhere) rather than a
regression in the barrel split — the split's own delta, −934,333 bytes on
the two public routes, is unaffected by anything this task changed, since
Task 7 touched no import graph.

**The four `e2e` failures, verbatim, so Phase 2 does not re-diagnose them:**

1. `[chromium] › tests/e2e/section-card-face.spec.ts:630:1 › AeleOS controls stay readable beside a hostile full-strength tray picture`
   ```
   Error: light: the picture still previews at full strength
   expect(received).toBeLessThan(expected)
   Expected: < 30
   Received:   127
   ```
2. `[chromium] › tests/e2e/section-drag-reorder.spec.ts:116:1 › a section dragged by keyboard lands in its new position in the DOM`
   ```
   Error: expect(received).toEqual(expected) // deep equality
   - Expected  - 5
   + Received  + 1
   - Array [
   -   StringContaining "Second",
   -   StringContaining "Third",
   -   StringContaining "First",
   - ]
   + Array []
   Call Log:
   - Timeout 5000ms exceeded while waiting on the predicate
   ```
3. `[chromium] › tests/e2e/section-drag-reorder.spec.ts:197:1 › a nested sibling drag swaps visible places without entering the row`
   (same deep-equality/timeout shape as #2, different fixture)
4. `[chromium] › tests/e2e/section-drag-reorder.spec.ts:266:1 › a pointer drag between sibling rows does not activate either row`
   ```
   Error: expect(received).toEqual(expected) // deep equality
   - Expected  - 4
   + Received  + 1
   - Array [
   -   StringContaining "Right",
   -   StringContaining "Left",
   - ]
   + Array []
   Call Log:
   - Timeout 5000ms exceeded while waiting on the predicate
   ```

202 other `e2e` cases passed. Phase 2 (or whichever phase retires the
separate canvas/inspector drag id prefixes) is where these four get
re-diagnosed, per Task 1's own note above.
