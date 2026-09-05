# Drag-to-add from a palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution model is unattended and per-task, not per-branch.** Each task
> below is its OWN branch (cut from `origin/main`, never from the previous
> task's branch), its OWN pull request, its OWN full run of every required
> check (`conformance`, `hub`, `idp-cloud`, `e2e`, `schema-drift`, `canvas`),
> and squash auto-merge on green. Task _N+1_ starts only once task _N_ has
> actually merged to `main` — confirm with `gh pr view <n> --json state` (or
> equivalent) reading `MERGED`, not merely that CI passed. Notify the owner
> only when a task's PR actually merges, not on every step. An intermediate
> merged state may be functionally incomplete (a palette tab that renders but
> cannot yet be dragged from, say) but must never be BROKEN — every existing
> test stays green, the modal `AddBlockPicker` path keeps working right up
> until the task that replaces it, and `main` never regresses.
>
> Spec: `docs/superpowers/specs/2026-09-05-palette-drag-to-add-design.md`.
> Read `apps/hub/src/features/actors/CLAUDE.md` in full before Task 1 — it is
> the authoritative account of the block model, the Properties panel, the
> existing Add mechanism this plan replaces, and the dragging domain
> (`block-drops.ts`/`block-moves.ts`/`block-drag.ts`) this plan extends
> rather than replaces.

**Goal:** Replace the modal `AddBlockPicker` / toolbar-portalled single Add
button with a persistent Palette tab in the Properties panel: an author drags
a leaf-kind or layout thumbnail directly onto a highlighted drop target on the
live canvas (or picks one up and steps between highlighted targets by
keyboard), and dropping inserts real content and selects it, switching the
panel to that block's own Content/Layout tab. Clicking any placed block
closes the palette and opens that block's own tabs, exactly as today; clicking
the Palette tab itself clears selection and returns to the drag-and-drop flow.

**Architecture:** Nothing about the stored document, the public renderer, the
depth cap, or the required-identity-leaf floor changes. Three additions, each
independently useful before the others land: (1) a domain function computing
every valid insertion target for a given palette item (leaf-kind or
layout-kind), reusing the existing `mayNest`/`fitsAt`/`BLOCK_LIMITS` primitives
`block-drops.ts`, `block-clone.ts` and `block-edits.ts` already use for moving
and cloning; (2) a domain function that inserts a freshly-instantiated block at
one of those targets, built on `insertAt` exactly as `wrapLeafOnPage` already
wraps a page-root leaf; (3) presentation wiring that adds palette thumbnails as
a SECOND kind of `@dnd-kit` draggable inside the SAME `DndContext`
`block-editor.tsx` already owns, alongside the existing canvas-origin
draggables `EditableBlockFrame` registers — never a second `DndContext`, which
would be unable to see the other's drag state.

**Tech Stack:** Next.js hub, React 19, `@dnd-kit/core`/`@dnd-kit/sortable`
(existing, no new dependency), react-hook-form (existing `sections` field),
Motion for React inside `CHROME_SCOPE` only (existing convention, unchanged),
Vitest + Testing Library, Playwright + `@axe-core/playwright`.

## Global Constraints

- **No new dnd-kit id prefix collides with `place:`/`canvas-place:`.** This
  plan introduces `palette:` for the draggable SOURCE (a thumbnail) and reuses
  `canvas-place:` for every DROP target, including the new virtual
  append-slot position — see Task 1's note on why the append slot needs no
  new id scheme.
- **`CHROME_SCOPE` on every new control**; Motion, if used at all, stays
  opacity-only and never wraps a `@dnd-kit` node, per the standing rule in
  `apps/hub/src/features/actors/presentation/editor-motion.tsx`.
- **Every export gets contract-stating TSDoc; `pnpm check:docs` enforces it.**
- **100% branch coverage on every new domain function**, sabotage-verified
  per root rule 29 — for each refusal branch, name the wrong behaviour the
  fixture excludes and confirm the fixture can tell it apart before trusting
  the test.
- **`apps/hub/src/features/actors/CLAUDE.md`'s three standing questions are
  re-asked at the end of EVERY task in this plan**, not only the last one —
  its own opening section requires this per change, and a plan spanning nine
  merged PRs is nine separate opportunities for it to go stale.
- **Never remove `AddBlockPicker`/`add-slot.tsx`/`add-target.ts` before the
  palette can fully replace what they do.** Task 8 is the only task that
  deletes them, and only after Tasks 1–7 have shipped a working replacement.
- **Every git/gh action follows `docs/git-with-gh-token.md`**: `set -a; .
./.secrets; set +a`, `GH_HOST=github.com`, confirm identity via `gh api
user`, set `git config --local user.name`/`user.email` from that response
  before the first commit of each task's branch.
- **Branch each task from `origin/main` explicitly** —
  `git checkout -b <name> origin/main`, never bare `-b` — and confirm with
  `git log --oneline origin/main..HEAD` before pushing.

---

## Task 1: Domain — every valid insertion target for a palette item

**Files:**

- Create: `apps/hub/src/features/actors/domain/palette-targets.ts`
- Test: `apps/hub/tests/palette-targets.test.ts`

**Interfaces:**

```ts
/** What is being dragged from the palette: a leaf kind, or a layout mode. */
export type PaletteItem =
  | { readonly kind: "leaf"; readonly leafKind: LeafKind }
  | { readonly kind: "container"; readonly mode: ContainerMode };

/** One place a palette item may be dropped. */
export interface InsertTarget {
  /**
   * Where the new block would be inserted — the LAST segment is the index
   * to insert before, in the parent named by every segment before it (or, at
   * length 1, in the page's own top-level array).
   */
  readonly path: BlockPath;
}
```

- Produces: `export function insertTargetsFor(blocks: readonly Block[], item: PaletteItem): InsertTarget[]`

**Consumes:** `isContainer`, `mayNest` (re-export or import from
`block-edits.ts`), `Block`, `ContainerBlock`, `BlockPath` from
`block-schema.ts`/`block-edits.ts`.

### Why every target collapses to one insertion-index walk

Read `block-edits.ts`'s `insertAt`/`insertEntry` before writing this: an
insertion path's last segment is a SPLICE index, valid at every value from
`0` to `children.length` inclusive (the array's own length is "insert past
the end," i.e. append) — there is no structural difference between "this
place is currently empty," "this place is currently occupied" and "this is
one past the last place." All three are simply different current lengths of
the same array at the moment of the walk. So `insertTargetsFor` is one
depth-first walk of the tree — the page's own top-level `blocks` array plus
every container's `children` — emitting one `InsertTarget` per valid splice
index, filtered by whether `item` may legally land there:

- **Every top-level index (`0` to `blocks.length` inclusive) is always a
  valid target**, whatever `item` is — a leaf gets wrapped in a new
  one-place `stack` on insertion (Task 2), and a container is always legal
  at depth 0 (`mayNest([i])` is `true` for any `i` since path length 1 is
  always `<= MAX_DEPTH`).
- **Every existing container's own indices (`0` to `children.length`
  inclusive) are valid for a LEAF unconditionally**, and valid for a
  CONTAINER only when `mayNest([...containerPath, 0])` — mirroring
  `add-target.ts`'s own existing convention of asking `mayNest` one segment
  longer than the container's own path, since the depth cap is a fact about
  the NEW child's own depth, not the selected container's.
- **The walk continues into every container's children regardless of
  whether THAT container itself may hold a new nested container** — depth
  cap only ever gates whether a CONTAINER fits at a given path, never
  whether a LEAF does, and a container three levels down may still have
  room for more leaves in an even-deeper container that already exists.

```ts
export function insertTargetsFor(
  blocks: readonly Block[],
  item: PaletteItem,
): InsertTarget[] {
  const targets: InsertTarget[] = [];
  for (let index = 0; index <= blocks.length; index += 1) {
    targets.push({ path: [index] });
  }
  const walk = (children: readonly (Block | null)[], path: BlockPath): void => {
    for (const [childIndex, child] of children.entries()) {
      if (!child || !isContainer(child)) continue;
      const containerPath = [...path, childIndex];
      if (item.kind === "leaf" || mayNest([...containerPath, 0])) {
        for (let index = 0; index <= child.children.length; index += 1) {
          targets.push({ path: [...containerPath, index] });
        }
      }
      walk(child.children, containerPath);
    }
  };
  walk(blocks, []);
  return targets;
}
```

- [ ] **Step 1: Write the failing tests** — one per discriminating case, each
      naming the wrong behaviour it excludes per root rule 29:

```ts
describe("insertTargetsFor", () => {
  it("offers every top-level splice index on an empty page for a leaf", () => {
    expect(insertTargetsFor([], { kind: "leaf", leafKind: "text" })).toEqual([
      { path: [0] },
    ]);
  });

  it("offers N+1 top-level indices for N existing sections", () => {
    const blocks = [stack([]), stack([])];
    const targets = insertTargetsFor(blocks, {
      kind: "leaf",
      leafKind: "text",
    });
    expect(targets.map((t) => t.path)).toEqual([[0], [1], [2]]);
  });

  it("offers every place in a container, filled or empty, plus one past the last", () => {
    // A 2-space grid with one place filled — excludes "the append slot is
    // missing" and "occupied places are skipped", the two wrong behaviours
    // this case exists to tell apart from the right one.
    const grid = container("grid", 2, [text("a"), null]);
    const targets = insertTargetsFor([grid], {
      kind: "leaf",
      leafKind: "text",
    });
    expect(targets.map((t) => t.path)).toEqual([
      [0],
      [1], // top level
      [0, 0],
      [0, 1],
      [0, 2], // the grid's own two places plus append
    ]);
  });

  it("refuses a nested container at the depth cap, but still offers its leaves", () => {
    // Build to exactly MAX_DEPTH nested containers, then assert a
    // container-kind palette item gets no target inside the deepest one
    // while a leaf-kind item still does — excludes "the whole subtree is
    // skipped" as well as "the cap is never enforced".
  });

  it("does not offer a container target where mayNest refuses, at any depth short of the cap", () => {
    // A container two levels deep (one below the cap) — mayNest([...path, 0])
    // should still admit a THIRD level; only the fourth is refused. This
    // excludes an off-by-one in the depth arithmetic.
  });
});
```

- [ ] **Step 2: Run to confirm every case fails against no implementation.**
- [ ] **Step 3: Implement `insertTargetsFor` and `PaletteItem` exactly as
      above**, importing `mayNest`/`isContainer` rather than redefining them.
- [ ] **Step 4: Run to confirm every case passes; confirm 100% branch
      coverage with `pnpm --filter hub test:coverage -- palette-targets`.**
- [ ] **Step 5: Sabotage-verify** — for the depth-cap case, change
      `mayNest([...containerPath, 0])` to `mayNest(containerPath)` (the exact
      off-by-one root rule 30's `add-target.ts` account warns against) and
      confirm the depth-cap test reddens; restore. For the append-slot case,
      change the loop bound from `<=` to `<` and confirm the append-slot
      assertion reddens; restore.
- [ ] **Step 6: `pnpm check:docs`; commit; open PR against `origin/main`;
      wait for all six required checks; confirm merge; notify the owner.**

---

## Task 2: Domain — inserting a freshly-built block at a target

**Files:**

- Create: `apps/hub/src/features/actors/domain/palette-insert.ts`
- Test: `apps/hub/tests/palette-insert.test.ts`

**Interfaces:**

```ts
/** Why a palette drop was refused. Mirrors block-drops.ts's DropRefusal shape. */
export type InsertRefusal = "too deep" | "too many";

export type InsertResult =
  | { readonly ok: true; readonly blocks: Block[]; readonly path: BlockPath }
  | { readonly ok: false; readonly reason: InsertRefusal };

export function insertBlockAt(
  blocks: readonly Block[],
  path: BlockPath,
  block: Block,
): InsertResult;
```

**Consumes:** `insertAt`, `blockAt`, `newContainer` from `block-edits.ts`;
`fitsAt` from `block-drops.ts` (already exported for `block-clone.ts`'s
reuse — no new export needed); `isContainer`, `countBlocks`, `BLOCK_LIMITS`
from `block-schema.ts`.

### The one case this function must get right that `cloneAt` never faced

`cloneAt` (`block-clone.ts`) never inserts a bare leaf at the page root —
its source is always whatever already exists there, which is always a
container, because depth 0 only ever holds containers. A palette drop CAN
target the page root with a leaf-kind item, and depth 0 must stay
containers-only — so a leaf landing at a top-level index has to be wrapped
in a new one-place `stack` first, mirroring `wrapLeafOnPage`'s existing
wrap (`{ ...newContainer("stack", 1), children: [leaf] }`) but at an
arbitrary INDEX rather than always appended.

```ts
export function insertBlockAt(
  blocks: readonly Block[],
  path: BlockPath,
  block: Block,
): InsertResult {
  const parentPath = path.slice(0, -1);
  const toInsert: Block =
    parentPath.length === 0 && !isContainer(block)
      ? { ...newContainer("stack", 1), children: [block] }
      : block;

  if (!fitsAt(toInsert, path)) return { ok: false, reason: "too deep" };

  const addedBlocks =
    1 + (isContainer(toInsert) ? countBlocks(toInsert.children) : 0);
  if (parentPath.length === 0) {
    if (countBlocks(blocks) + addedBlocks > BLOCK_LIMITS.blocks) {
      return { ok: false, reason: "too many" };
    }
  } else {
    const parent = blockAt(blocks, parentPath);
    if (
      parent &&
      isContainer(parent) &&
      parent.children.length >= BLOCK_LIMITS.children
    ) {
      return { ok: false, reason: "too many" };
    }
  }

  return { ok: true, blocks: insertAt(blocks, path, toInsert), path };
}
```

Note `fitsAt(toInsert, path)` is asked with `path` DIRECTLY, unlike
`cloneAt`'s `fitsAt(held, destination)` — a palette drop's target path IS
the destination, with no separate "where the source currently sits" to
translate from.

- [ ] **Step 1: Write the failing tests**, each naming what it excludes:

```ts
describe("insertBlockAt", () => {
  it("inserts a container directly at a top-level index", () => {
    const result = insertBlockAt([stack([])], [1], container("grid", 2, []));
    expect(result).toEqual({
      ok: true,
      blocks: [expect.anything(), expect.objectContaining({ mode: "grid" })],
      path: [1],
    });
  });

  it("wraps a leaf landing at a top-level index in a new one-place stack", () => {
    // Excludes "a bare leaf is spliced directly into the top-level array",
    // which would violate depth 0 being containers-only.
    const result = insertBlockAt([], [0], text("hello"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isContainer(result.blocks[0]!)).toBe(true);
      expect((result.blocks[0] as ContainerBlock).children).toEqual([
        expect.objectContaining({ title_en: "hello" }),
      ]);
    }
  });

  it("inserts a leaf directly into an existing container's own place, unwrapped", () => {
    // Excludes "every leaf gets wrapped, even one that lands inside an
    // existing container" — only a page-root leaf needs wrapping.
    const grid = container("grid", 2, [null, null]);
    const result = insertBlockAt([grid], [0, 0], text("hi"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const inserted = (result.blocks[0] as ContainerBlock).children[0];
      expect(inserted).toEqual(expect.objectContaining({ title_en: "hi" }));
    }
  });

  it("refuses a container landing past the depth cap", () => {
    // Build a target path at MAX_DEPTH nesting; excludes "the cap is
    // enforced by insertTargetsFor alone and this function trusts its
    // caller" — this function must refuse independently, since a stale
    // target computed before an intervening edit could still reach it.
  });

  it("refuses when the destination container is already at BLOCK_LIMITS.children", () => {});

  it("refuses when a page-root insert would cross BLOCK_LIMITS.blocks, counting the wrap", () => {
    // Excludes "the wrapper container itself is not counted toward the cap".
  });
});
```

- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Implement exactly as above.**
- [ ] **Step 4: Run to confirm pass; confirm 100% branch coverage.**
- [ ] **Step 5: Sabotage-verify** the wrap condition (`parentPath.length ===
0 && !isContainer(block)` → drop the `parentPath.length === 0` half) and
      confirm the "insert directly into an existing container" case reddens
      (a leaf nested inside a container would get wrapped too); restore. Sabotage
      the `addedBlocks` computation to omit the wrapper's own `+1` and confirm
      the "crossing BLOCK_LIMITS.blocks" case reddens at one fewer block than it
      should; restore.
- [ ] **Step 6: `pnpm check:docs`; commit; PR; wait for green; confirm
      merge; notify.**

---

## Task 3: Domain — ordering insertion targets for keyboard stepping

**Files:**

- Modify: `apps/hub/src/features/actors/domain/palette-targets.ts`
- Test: `apps/hub/tests/palette-targets.test.ts` (extend)

**Interfaces:**

```ts
/** insertTargetsFor's own output, already in drawing (depth-first) order. */
export function orderedInsertTargets(
  blocks: readonly Block[],
  item: PaletteItem,
): InsertTarget[]; // = insertTargetsFor(blocks, item), documented as ordered

/** Steps to the next/previous target in the list, no wraparound. */
export function stepInsertTarget(
  order: readonly InsertTarget[],
  current: InsertTarget | undefined,
  forward: boolean,
): InsertTarget | undefined;

/**
 * Steps to the first target belonging to the next/previous TOP-LEVEL
 * section, skipping every target nested inside the current one — the
 * palette's "Tab skips a whole section" gesture.
 */
export function stepInsertSection(
  order: readonly InsertTarget[],
  current: InsertTarget | undefined,
  forward: boolean,
): InsertTarget | undefined;
```

**Consumes:** nothing beyond Task 1's own `InsertTarget`/`insertTargetsFor`.

### Why `insertTargetsFor` is already ordered, and what `stepInsertTarget` adds

Task 1's walk is depth-first over `blocks`/`children` in array order, which
is already "drawing order" — the same guarantee `placeOrder`
(`block-drag.ts`) states for its own walk. So `orderedInsertTargets` is a
thin, documented alias rather than a second traversal; write it as one so a
future reader does not have to re-derive that the two functions already
agree, mirroring the relationship `block-drag.ts`'s `placeOrder` has to its
own callers.

`stepInsertTarget` mirrors `stepPlace` (`block-drag.ts`) exactly — linear
step through an ordered array by reference equality on `path`
(`formatBlockPath`-comparable), no wraparound at either end, `undefined`
input steps to the first (`forward`) or last (`!forward`) entry.

`stepInsertSection` is the one genuinely new mechanism: given the CURRENT
target's own top-level index (`current.path[0]`), find the first target in
`order` whose own top-level index is strictly greater (`forward`) or
strictly less (`!forward`) than the current one — which lands on the first
target belonging to the NEXT (or previous) top-level section, since `order`
is grouped by top-level index by construction (the walk visits one
top-level entry's whole subtree before moving to the next). `undefined`
input steps to `order[0]`/`order.at(-1)`, matching `stepInsertTarget`.

- [ ] **Step 1: Write the failing tests**:

```ts
describe("stepInsertTarget", () => {
  it("steps forward through the ordered list with no wraparound at the end", () => {});
  it("steps backward with no wraparound at the start", () => {});
  it("starting from undefined steps to the first entry going forward", () => {});
  it("starting from undefined steps to the last entry going backward", () => {});
});

describe("stepInsertSection", () => {
  it("jumps past every target nested inside the current section to the next section's first target", () => {
    // Two 2-space grids; current target is inside the first grid's own
    // places; forward step must land on the SECOND grid's first target,
    // never on the first grid's remaining places. Excludes "it behaves
    // identically to stepInsertTarget".
  });
  it("does nothing past the last section", () => {});
  it("from a top-level (page-root) target, steps to the next top-level target", () => {
    // Excludes "section-skip only works from inside a section".
  });
});
```

- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Implement all three functions.**
- [ ] **Step 4: Run to confirm pass; 100% branch coverage.**
- [ ] **Step 5: Sabotage-verify `stepInsertSection`** by changing its
      comparison from strict (`>`/`<`) to non-strict (`>=`/`<=`) and confirm the
      "jumps past every target nested inside the current section" case reddens
      (it would then stop at the second target inside the SAME section rather
      than skipping to the next one); restore.
- [ ] **Step 6: `pnpm check:docs`; commit; PR; wait; confirm merge; notify.**

---

## Task 4: Presentation — a persistent Palette tab, static content only

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/properties-panel.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Create: `apps/hub/src/features/actors/presentation/add-palette.tsx`
- Test: `apps/hub/tests/properties-panel.test.tsx`,
  `apps/hub/tests/add-palette.test.tsx`

This task ships a THIRD tab that is visible and renders real thumbnails, but
is not yet draggable — the modal `AddBlockPicker` remains the only way to add
a block until Task 5. This is a deliberately incomplete-but-not-broken
increment.

**Interfaces:**

```ts
export interface PropertiesPanelProps {
  // ...existing fields, unchanged...
  /**
   * A third, always-present pseudo-tab. Rendered alongside `primary`/
   * `secondary` but selected independently of `tab` — see `activeTab` below.
   */
  readonly palette: ReactNode;
}

/** Which of the panel's three regions is showing, including "no selection". */
export type PropertiesActiveTab = "primary" | "secondary" | "palette";
```

`PropertiesPanel` currently returns `null` when `selection === null`
(`if (selection === null) return null;`, see the component's current
source). This task changes that: the panel now renders unconditionally,
always showing its `palette` region, with `primary`/`secondary` rendered
`hidden` (not omitted) whenever `selection === null` — so a caller does not
need to special-case "which tabs exist" per selection state, only which
region is ACTIVE.

- [ ] **Step 1: Write the failing tests** for `PropertiesPanel`:

```tsx
it("renders the Palette region even with nothing selected", () => {
  render(<PropertiesPanel {...propsFor(null)} activeTab="palette" />);
  expect(screen.getByTestId("panel-palette")).toBeVisible();
});

it("switches to the Palette tab and hides the other two", () => {
  render(
    <PropertiesPanel
      {...propsFor({ kind: "block", path: [0] })}
      activeTab="primary"
    />,
  );
  await userEvent.click(screen.getByTestId("panel-tab-palette"));
  // assert onTab-equivalent callback fired with "palette", or (if this
  // component owns no internal tab state itself, matching its existing
  // controlled-tab convention) that the caller's activeTab prop is what
  // decides visibility — read the CURRENT component before choosing which.
});
```

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Update `PropertiesPanelProps`** — add `palette: ReactNode`
      and change the `tab: PropertiesTab` prop to `activeTab:
PropertiesActiveTab`, updating every existing caller in `block-editor.tsx`.
      Remove the early `if (selection === null) return null;` return. Render a
      third tab button (`panel-tab-palette`) always present in the tablist
      alongside the two selection-dependent ones (which are themselves hidden,
      not removed, when `selection === null` — their labels come from `labels`,
      which the caller must supply even with no selection; confirm with
      `block-editor.tsx`'s current call site what a sensible "no selection"
      `labels` value is, likely empty-string primary/secondary since nothing
      renders under them).

- [ ] **Step 4: Create `add-palette.tsx`** — `AddPalette`, a grouped list of
      compact thumbnails (Content group: every `LeafKind`; Layout group: every
      `ContainerMode`), each rendered with the REAL renderer
      (`Block`/`PublicBlock` from `blocks.tsx`) over `add-samples.ts`'s existing
      `sampleLeaf(kind)`/`sampleContainer(mode)`, exactly mirroring
      `add-block-picker.tsx`'s existing preview mechanism — `inert`-wrapped for
      the same `nested-interactive` reason (`player`/`jukebox` real transport
      buttons), mounted inside `CHROME_SCOPE`, never `SKIN_SCOPE`. This task's
      version renders each thumbnail SHRUNK (a fixed small `max-h`/`overflow-hidden`
      wrapper is enough for now — Task 5 makes the thumbnail itself the drag
      source and does not need to revisit the shrinking). No `useDraggable` yet;
      each thumbnail is a plain, unfocusable `<div>` for this task (a later task
      makes it a real draggable and gives it a role).

```ts
export interface AddPaletteProps {
  readonly labels: {
    readonly contentGroup: string;
    readonly layoutGroup: string;
    readonly kindNames: Record<LeafKind, string>; // reuse existing catalogue, see leaf-kind-options.tsx
    readonly modeNames: Record<ContainerMode, string>;
  };
}

export function AddPalette(props: AddPaletteProps): ReactNode;
```

- [ ] **Step 5: Wire `AddPalette` into `BlockEditor`'s `palette` prop**,
      building `labels` from the existing catalogue helpers `pages/labels.ts`
      already exposes for leaf kinds and container modes (grep
      `leafKindOptions`/`modeOptions`-shaped helpers rather than re-deriving the
      strings).

- [ ] **Step 6: Run all new and existing tests; confirm `properties-panel.test.tsx` and `block-editor.test.tsx` both still pass unmodified in their non-palette assertions.**

- [ ] **Step 7: `pnpm check:docs`; run `pnpm --filter hub test:e2e` locally
      with secrets sourced to confirm nothing existing regressed (the modal Add
      path is untouched by this task and must still work end to end); commit;
      PR; wait for all six checks; confirm merge; notify the owner — this is the
      first user-visible change, so say plainly in the notification that the tab
      renders but dragging from it does nothing yet.**

---

## Task 5: Presentation — palette thumbnails become real drag sources; drop inserts

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/add-palette.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/editable-block-frame.tsx`
- Modify: `apps/hub/src/features/actors/domain/block-drag.ts`
- Test: `apps/hub/tests/add-palette.test.tsx`,
  `apps/hub/tests/block-editor.test.tsx`,
  `apps/hub/tests/editable-block-frame.test.tsx`

This is the task that makes the palette actually work by POINTER. Keyboard
follows in Task 7.

**Interfaces (additions to `block-drag.ts`):**

```ts
/** The id prefix for a palette-origin drag source. */
export const PALETTE_PREFIX = "palette:";

/** Builds a palette draggable id encoding which item it offers. */
export function paletteId(item: PaletteItem): string; // "palette:leaf:text", "palette:container:grid"

/** The inverse of paletteId, or undefined for a non-palette id. */
export function palettePayload(id: string): PaletteItem | undefined;
```

**Interfaces (additions to `editable-block-frame.tsx`):**

```ts
export interface EditableBlockInstrumentation {
  // ...existing fields...
  /**
   * Every insertion target a palette-origin drag currently in progress
   * would accept — non-null only while such a drag is active. Highlighted
   * identically to `activeTarget`'s existing "place" highlight, but for
   * EVERY entry at once rather than only the one currently under the
   * pointer.
   */
  readonly insertTargets: readonly InsertTarget[] | null;
}
```

### Wiring inside `block-editor.tsx`

- [ ] **Step 1: `AddPalette`'s thumbnails become `useDraggable` sources.**
      Each thumbnail gets `useDraggable({ id: paletteId(item) })`, wired with
      `attributes`/`listeners`/`setNodeRef` exactly as `EditableBlockFrame`
      already demonstrates for the mouse case (`onPointerDown` calling
      `listeners?.onPointerDown?.(event)` — a palette thumbnail is always
      "filled," unlike an empty canvas place, so there is no `disabled`
      condition to add). Give each a real `role="button"` and an
      `aria-label` naming the item (matching `add-block-picker.tsx`'s own
      `role="button"` convention for a non-native-button interactive element
      that must not itself be a `<button>` nested inside anything).

- [ ] **Step 2: `onDragStart` in `block-editor.tsx` branches on origin.**
      Currently it only ever handles canvas-origin ids
      (`canvasPlacePath(activeId) ?? placePath(activeId)`). Add a check for
      `palettePayload(String(event.active.id))` FIRST; when present, compute
      `insertTargetsFor(blocks, item)` (Task 1) and store it in a new ref/state,
      e.g. `insertTargetsRef`, read by `detectCollisionAt`'s palette branch
      (Step 4) and passed down as `editor.insertTargets` to every
      `EditableBlockFrame` (Step 5). Do NOT fall through to the existing
      canvas-move `onDragStart` logic for a palette id — the two are mutually
      exclusive per drag.

- [ ] **Step 3: `onDragCancel` clears `insertTargetsRef`** (and any
      palette-specific refs Step 2 introduces) exactly as it already clears the
      canvas-move refs, so a cancelled palette drag leaves no stale highlight.

- [ ] **Step 4: `detectCollisionAt` gets a palette branch.** Read its
      current signature and body in full before editing
      (`apps/hub/src/features/actors/presentation/block-editor.tsx`, the
      function documented at length in this file's own TSDoc, with the
      `canvasDrag`/`from` branching at its top). Add an EARLY branch: when
      `palettePayload(activeId)` is present, collision is decided purely by
      whether the pointer is over ANY of the ids in `insertTargetsRef.current`
      (each rendered as `canvasPlaceId(target.path)` — Step 6 explains why no
      new id scheme is needed) — no `applyDrop` call at all, since Task 2's
      `insertBlockAt` is what validates a drop, not the existing move planner.
      Rank by deepest path exactly as the existing pointer branch already does
      (longest `path.length` wins when rectangles nest), reusing the same
      `args.droppableRects`/pointer-containment loop shape, just resolving
      candidate ids against `insertTargetsRef.current`'s own path set instead of
      against `applyDrop`'s validation.

- [ ] **Step 5: `onDragEnd` gets a palette branch.** When the just-ended
      drag's `active.id` is a palette id: if `over` is null, do nothing (the
      drag is simply abandoned, matching root rule 33's "no leaf... draws
      nothing" for a cancelled drop and this feature's own spec's "the dragged
      preview simply disappears"); otherwise resolve `over.id` back to a
      `BlockPath` via `canvasPlacePath`, build the real block
      (`newLeaf(item.leafKind)` or `newContainer(item.mode, PICKER_SPACES)` —
      reuse the exact constant `add-block-picker.tsx` already defines for a
      layout's starting width, do not invent a new default), call
      `insertBlockAt(blocks, targetPath, block)` (Task 2), and on success: apply
      the result through the same `field.onChange`-shaped call every other
      mutation in this file uses, select the newly inserted block (its `path`
      from `InsertResult`, unless it was wrapped — Task 2's `insertBlockAt`
      already returns the WRAPPER's path when wrapping occurred, which is
      correct: selecting the wrapper is what lets the panel show that new
      block's own tabs, matching `addAt`'s existing "select what was added and
      reset tab to primary" convention exactly). On `{ ok: false, reason }`,
      show the same refusal-sentence mechanism `onDragEnd`'s existing
      `MoveRefusal` branch already uses (reuse or extend the existing
      catalogue keys — `dragRefusedTooDeep` already exists for `"too deep"`;
      `"too many"` needs its own catalogue key if one does not already exist for
      it — grep before adding a duplicate).

- [ ] **Step 6: Why the append slot needs no new id scheme, this task.**
      `insertTargetsFor` (Task 1) already includes each container's
      one-past-the-last index — e.g. `[0, 2]` for a 2-place container — as an
      ordinary `InsertTarget`. `canvasPlaceId([0, 2])` is a perfectly valid,
      already-decodable id under the EXISTING scheme; what does not yet exist
      is a RENDERED droppable at that id, because `EditableBlockFrame` today
      only wraps positions the renderer actually draws (0 to
      `children.length - 1`). This task therefore does NOT yet make the append
      slot draggable-onto in a real browser — it is a valid `InsertTarget`
      domain-side and `detectCollisionAt`'s loop would find it if a droppable
      existed at that id, but nothing renders one yet. State this limitation
      explicitly in this task's PR description; Task 6 is what renders the
      virtual append-slot droppable. Do not attempt to solve it in this task —
      it requires the `EditorRenderHook.appendSlot` extension, which is
      deliberately its own task so this one stays reviewable.

- [ ] **Step 7: `EditableBlockFrame` highlights every target in
      `editor.insertTargets`, not only the one under the pointer.** Add a
      boolean derived as
      `editor.insertTargets?.some((t) => formatBlockPath(t.path) === encodedPath) ?? false`
      and apply the SAME visual treatment `data-canvas-drop=place` already gets
      (the `outline-2 outline-(--accent)` classes), but keyed on this new
      boolean rather than on `isOver` — every valid target lights up
      SIMULTANEOUSLY, which is the whole point of this feature versus the
      existing single-`activeTarget` canvas-move highlight. Where a place is
      BOTH a valid palette target AND currently under the pointer, the existing
      `isOver`-driven insertion-bar treatment (`canvas-drop-before`/`-after`)
      does not apply here — a palette drop is never a "before/after" linear
      insert into an existing occupied place's neighbour, it targets the place
      itself — so only the outline treatment is needed, not the bar spans.

- [ ] **Step 8: Write the failing component tests first** (per the
      project's own test-first convention), covering: a palette thumbnail is a
      real `useDraggable` (drive it inside a real `DndContext` in the test,
      matching `block-slot.test.tsx`'s own convention for proving a grip is
      really wired rather than merely rendered); dropping a leaf-kind thumbnail
      onto an empty place calls the mutation with a tree containing the new
      leaf and selects its path; dropping a container-kind thumbnail onto a
      path past the depth cap does NOT mutate and shows the refusal sentence;
      dropping onto no target (`over: null`) does not mutate and shows nothing.

- [ ] **Step 9: Run to confirm failure, implement, run to confirm pass.**

- [ ] **Step 10: Sabotage-verify** the collision ranking (revert to
      nearest-centre or first-match, matching this file's own documented
      history of exactly this mistake for canvas-move drags) against a fixture
      with a nested target inside another valid target, confirming the wrong
      one is chosen; restore. Sabotage `insertBlockAt`'s refusal handling by
      swallowing the `ok: false` case silently (no banner) and confirm the
      refusal-sentence test reddens; restore.

- [ ] **Step 11: A targeted browser case, not the full suite yet** — one new
      `tests/e2e/` spec (or an addition to an existing one) driving ONE real
      pointer drag from a palette thumbnail onto ONE real empty place on a
      seeded page, asserting the new block appears and is selected. This is
      intentionally narrow per the plan's own "1-2 targeted cases per slice, not
      full e2e coverage deferred to one task" instruction; the append-slot case,
      the depth-cap case and the keyboard path are each other tasks' own
      targeted cases, not this one's.

- [ ] **Step 12: `pnpm check:docs`; commit; PR; wait for all six checks
      (note this task is the first to touch `e2e` meaningfully — budget for a
      real run); confirm merge; notify the owner that dragging from the palette
      onto an existing empty or occupied place now works, with the append slot
      and keyboard still to come.**

---

## Task 6: Presentation — the virtual append-slot droppable, via `EditorRenderHook.appendSlot`

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/block-contract.ts`
- Modify: `apps/hub/src/features/actors/presentation/blocks.tsx`
- Modify: `apps/hub/src/features/actors/presentation/editable-block-frame.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Test: `apps/hub/tests/blocks.test.tsx`,
  `apps/hub/tests/public-route-imports.test.ts`

This is the task with the highest blast-radius risk in this plan —
`blocks.tsx` is imported by both public routes and every editor route, and
the actors `CLAUDE.md`'s own account of `EditorRenderHook`'s history is
explicit that getting this wrong once already leaked `@dnd-kit` into a
public route's bundle (the "corrected the same day" `editor.wrap` incident).
Read that account in full before touching this file.

**Interfaces (additions to `block-contract.ts`):**

```ts
export interface EditorRenderHook {
  wrap: (args: {
    path: string;
    filled: boolean;
    children: ReactNode;
  }) => ReactNode;
  /**
   * Rendered once after a container's own children, for the position one
   * past the last place — the palette's "append a new row" target.
   * Absent on every public route, exactly like `wrap`; a container renders
   * nothing extra when this is undefined.
   *
   * @param containerPath - the container's own renderer path (hyphenated,
   *   matching `wrap`'s `path`), never the append position itself — the
   *   position is always `containerPath`'s own child count, which only the
   *   caller building this hook (never `blocks.tsx`) needs to know.
   */
  appendSlot?: (containerPath: string) => ReactNode;
}
```

- [ ] **Step 1: Read `blocks.tsx`'s container-rendering code path in full**
      (the function that lays out a container's `children` through `Grid`/
      `Stack`/etc. and calls `editor?.wrap(...)` per place) before writing
      anything, to find the exact point after the last child where
      `editor?.appendSlot?.(path)` belongs.

- [ ] **Step 2: Write the failing test first**, in `blocks.test.tsx`:
      render a container with a mock `editor` hook whose `appendSlot` returns a
      recognisable marker, assert the marker appears exactly once, positioned
      after every rendered child, for every container mode (a mode-parameterised
      case, matching this file's own existing convention of iterating
      `CONTAINER_MODES` for a shared assertion). A second case renders WITHOUT
      `editor` (or with `editor.appendSlot` absent) and asserts NOTHING extra
      renders — the public-route zero-cost guarantee, stated as a test rather
      than only as a comment.

- [ ] **Step 3: Add the call site in `blocks.tsx`.** Exactly one call,
      `editor?.appendSlot?.(path)`, where `path` is the SAME hyphenated path
      `wrap` already receives for this container (never a child index appended
      to it — `appendSlot`'s own TSDoc already states the position is implicit).

- [ ] **Step 4: Run to confirm pass.**

- [ ] **Step 5: Confirm the public-route bundle guarantee mechanically, not
      by inspection alone** — run
      `pnpm --filter hub test -- public-route-imports` and separately compile
      `.next/diagnostics/route-bundle-stats.json` before and after this change
      for `/[locale]/[person]`, comparing bytes exactly as this feature's own
      CLAUDE.md account of the Motion/dnd-kit bundle measurements already does.
      Zero byte change is the bar; if it moved, `appendSlot`'s type or
      `blocks.tsx`'s import of it is pulling something in that should stay
      behind the optional call, and this step must find that before merging,
      not after.

- [ ] **Step 6: Build the append-slot RENDERER in `block-editor.tsx`.**
      A new small component, `AppendSlot` (or a case inside
      `EditableBlockFrame` gated on a new prop — read `EditableBlockFrame`'s
      current shape before choosing; a SEPARATE component is likely cleaner
      since an append slot is never "filled" and never carries a grip, so most
      of `EditableBlockFrame`'s existing branching does not apply), registering
      `useDroppable({ id: canvasPlaceId([...containerPath, childCount]) })` —
      the exact id Task 1's `insertTargetsFor` already emits for this position —
      and rendering the SAME highlight treatment Task 5's `EditableBlockFrame`
      uses, keyed on the identical `editor.insertTargets` membership check. It
      renders NOTHING (an empty, zero-height `CHROME_SCOPE` marker at most) when
      no palette drag is in progress, so an unstyled page never shows a phantom
      extra row.

- [ ] **Step 7: Wire `BlockEditor`'s own `editor` hook object to supply
      `appendSlot`**, mounting `AppendSlot` with the container's own child count
      read from the tree at that path (`blockAt(blocks, parseBlockPath(containerPath))`).

- [ ] **Step 8: A targeted browser case**: drag a leaf-kind thumbnail onto a
      FULLY OCCUPIED container's own append slot (a container with every place
      filled) and assert a new place is created holding the new content, rather
      than displacing anything already there. This is the discriminating case
      Task 1's own "offers every place... plus one past the last" unit test
      already named but could not prove end to end.

- [ ] **Step 9: Sabotage-verify** by removing the `appendSlot` call site
      from `blocks.tsx` and confirming the "renders after every child" test
      reddens while the "renders nothing without `editor`" test stays green
      (proving the two cases discriminate independently); restore.

- [ ] **Step 10: `pnpm check:docs`; re-read
      `apps/hub/src/features/actors/CLAUDE.md`'s standing three questions
      against `EditorRenderHook`'s own account there (it currently describes
      only `wrap`); add a paragraph rather than only appending, if anything it
      already says about the hook's shape becomes incomplete; commit; PR; wait;
      confirm merge; notify — the append slot now works by pointer.**

---

## Task 7: Presentation — the keyboard equivalent

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Test: `apps/hub/tests/block-editor.test.tsx`,
  `apps/hub/tests/e2e/section-drag-reorder.spec.ts` (or a new sibling spec —
  confirm naming convention with existing browser drag specs first)

**Interfaces:** none new at the domain level — this task wires Task 3's
`stepInsertTarget`/`stepInsertSection` into `block-editor.tsx`'s existing
`coordinateGetterAt`-shaped mechanism.

### The mechanism, read against the existing canvas-move keyboard path

`coordinateGetterAt` (already in `block-editor.tsx`, quoted in full in this
feature's own CLAUDE.md account) is a `KeyboardCoordinateGetter` branching
on `FORWARD_KEYS`/`BACK_KEYS` (arrow keys) and returning `{ x, y }` coordinates
of whichever rendered rectangle a step lands on — dnd-kit's own collision
detection then resolves `over` from those coordinates, which is why
`detectCollisionAt`'s keyboard branch (`!args.pointerCoordinates`) simply
returns whatever `keyboardTarget.current` was last set to.

This task needs the SAME shape for a palette-origin drag, but stepping
through `orderedInsertTargets(blocks, item)` (Task 3) rather than
`placeOrder`, and reading `stepInsertTarget` for arrow keys and
`stepInsertSection` for Tab — which requires teaching the getter to
recognise a Tab keypress at all, since dnd-kit's own `KeyboardSensor`
default `keyboardCodes` does not include Tab as a coordinate-changing key.

- [ ] **Step 1: Confirm dnd-kit's own `KeyboardSensorOptions.keyboardCodes`
      shape** by reading the installed package's own type definitions
      (`node_modules/@dnd-kit/core/dist/index.d.ts` or equivalent) — confirm
      whether `keyboardCodes.end`/`start`/`cancel` are the only configurable
      buckets or whether a custom bucket can be added for "step" keys beyond the
      four arrows the default handles. If Tab cannot be added as a recognised
      activator key through configuration alone, the fallback is a plain
      `onKeyDown` listener on the `DndContext`'s own container element,
      checked BEFORE dnd-kit's sensor sees the event (or with
      `event.preventDefault()`/`stopPropagation()` to keep Tab from also moving
      DOM focus during an active drag) — confirm which approach the installed
      version actually supports before writing the implementation step below;
      this is the one place in this plan genuinely deferred to
      implementation-time verification against the real library version, not a
      placeholder in the design.

- [ ] **Step 2: `sensors = useSensors(...)`'s existing `KeyboardSensor`
      configuration gets a palette-aware `coordinateGetter`.** Extend
      `coordinateGetterAt`'s existing shape with a check at its top: if the
      active drag's id is a palette id (`palettePayload`), branch entirely to a
      new palette-stepping path rather than falling through to the existing
      `placeOrder`/`stepPlace` logic — the two are mutually exclusive per drag,
      matching Task 5's `onDragStart` branch. The new path calls
      `stepInsertTarget` (arrow keys) or `stepInsertSection` (Tab, per Step 1's
      finding) against `orderedInsertTargets(pageRef.current, item)`, writes the
      result into a NEW ref (`paletteKeyboardTarget`, parallel to the existing
      `keyboardTarget` ref) and returns the rectangle at
      `canvasPlaceId(next.path)` from `args.context.droppableRects` — reusing
      the existing "keep stepping until a rendered rectangle exists" loop
      `coordinateGetterAt` already has, since a collapsed card can hide a
      target's rectangle here exactly as it can for a canvas-move drag.

- [ ] **Step 3: `detectCollisionAt`'s keyboard branch (`!args.pointerCoordinates`)
      reads `paletteKeyboardTarget.current` for a palette-origin drag** — mirror
      the existing `keyboardTarget.current` read, branched on
      `palettePayload(activeId)` exactly as Step 4 of Task 5 already branches
      the pointer case.

- [ ] **Step 4: Write the failing component test first** — drive a palette
      thumbnail's `useDraggable` inside a real `DndContext` with `KeyboardSensor`
      configured exactly as `BlockEditor` configures it (not a bespoke test
      harness — reuse `block-slot.test.tsx`'s own convention of testing the real
      hook rather than a mock), press Enter/Space to lift, ArrowDown/Right to
      step, Enter/Space to drop, and assert the correct target received the
      insert. A second case presses Tab and asserts the step landed on the
      NEXT top-level section's first target, skipping every target nested
      inside the current one — the discriminating fixture from Task 3's own
      unit test, now driven through the real sensor rather than the pure
      function directly.

- [ ] **Step 5: Run to confirm failure, implement, run to confirm pass.**

- [ ] **Step 6: One targeted browser case** in the e2e suite — pick up a
      palette thumbnail by keyboard (Enter/Space on its own focused element),
      step with arrows to a target, drop with Enter/Space, assert the new block
      is inserted and selected; a second assertion in the SAME case (not a
      second spec, per this plan's "1-2 targeted cases per slice") presses
      Escape mid-drag instead and asserts nothing was inserted. Sequence the
      lift using `tests/e2e/support/drag.ts`'s existing rAF-then-setTimeout
      helper (root rule 26) rather than a bare keypress, since this is the exact
      "first arrow key lost" hazard that helper exists for and a palette lift is
      no different from a canvas-move lift in that respect.

- [ ] **Step 7: Sabotage-verify `stepInsertSection`'s wiring** (not the pure
      function again, already sabotage-verified in Task 3) by wiring Tab to
      `stepInsertTarget` instead and confirming the browser case's Tab assertion
      reddens (it would land on the very next target rather than skipping the
      section); restore.

- [ ] **Step 8: `pnpm check:docs`; commit; PR; wait; confirm merge; notify —
      the palette now works fully by keyboard as well as by pointer.**

---

## Task 8: Remove the superseded modal Add mechanism

**Files:**

- Delete: `apps/hub/src/features/actors/presentation/add-block-picker.tsx`
- Delete: `apps/hub/src/features/actors/presentation/add-slot.tsx`
- Delete: `apps/hub/src/features/actors/domain/add-target.ts`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Modify: `apps/hub/src/features/actors/presentation/editor-toolbar.tsx`
  (remove the `AddSlotTarget` mount)
- Modify: `apps/hub/src/features/actors/presentation/fursona-editor.tsx`
  (remove the `AddSlotProvider` wrap, if it lives there — confirm with
  `grep -rn "AddSlotProvider"`)
- Delete: `apps/hub/tests/add-block-picker.test.tsx`,
  `apps/hub/tests/add-target.test.tsx`, `apps/hub/tests/add-slot.test.tsx`
  (or whatever their exact current names are — confirm with `grep -rl
"AddBlockPicker\|addTargetFor\|AddSlotProvider" apps/hub/tests`)
- Modify: `apps/hub/tests/e2e/support/editor.ts` — `addBlock`/`addSection`/
  `openPageAdd` all currently drive `AddBlockPicker`; rewrite them to drive
  the palette instead (drag, or — if a click-to-add fallback exists on the
  palette by this point, confirm from Task 4–7's actual shipped shape
  before assuming one does — use whichever mechanism the palette actually
  offers). Every existing e2e spec calling these three helpers is
  UNCHANGED at the call site, which is the entire point of keeping the
  helper's name and signature stable across this rewrite.

**This is the only task in this plan allowed to delete the modal path**, per
the Global Constraints. Before starting, confirm every e2e spec that calls
`addBlock`/`addSection`/`openPageAdd` still passes end to end against the
REWRITTEN helpers — this is a large, blast-radius-wide mechanical
substitution and the existing test suite is the safety net for it, not a new
one.

- [ ] **Step 1: Grep every remaining reference to the three modules being
      deleted**, across `apps/hub/src` and `apps/hub/tests`, and resolve each
      one before deleting anything — do not delete first and fix compile errors
      after; that inverts the order this plan's own "no broken intermediate
      state" rule requires WITHIN a single task's own commit, even though the
      task as a whole is one atomic PR.

- [ ] **Step 2: Rewrite `tests/e2e/support/editor.ts`'s three helpers** to
      drive the palette's actual drag (or click, if one exists) mechanism,
      keeping their exported names and parameter shapes unchanged so every
      calling spec needs no edit.

- [ ] **Step 3: Delete the three source modules and their dedicated test
      files.**

- [ ] **Step 4: Remove `AddSlotProvider`/`AddSlotTarget` mounts** from
      `fursona-editor.tsx`/`editor-toolbar.tsx`, and remove the now-dead
      `add-block` toolbar trigger/portal-host markup entirely.

- [ ] **Step 5: Run the FULL local suite** — `pnpm --filter hub test`,
      `pnpm lint` (root), `pnpm typecheck`, `pnpm --filter hub build`,
      `pnpm check:docs`, `pnpm check:agent-notes`, and the full
      `pnpm --filter hub test:e2e` with secrets sourced (root rule 31 — check
      the case COUNT, not merely "passed"). This is the one task in this plan
      where running everything locally before pushing is worth the time, since
      it is a wide mechanical deletion with the highest chance of an
      unnoticed dangling reference.

- [ ] **Step 6: Re-read `apps/hub/src/features/actors/CLAUDE.md` in full
      against this task specifically** — its own "Page interaction locks by
      default" and "The compact builder menu" sections both currently describe
      `AddBlockPicker`/`addTargetFor`/`AddSlotProvider` in the present tense as
      the current mechanism; correct each IN PLACE (never only append) per the
      file's own rule that a document contradicting itself is worse than one
      that is simply wrong, and add the palette's own account of what replaced
      each removed piece — mirroring how this file's own history records every
      other removed mechanism ("what replaced it" alongside "what this
      removes").

- [ ] **Step 7: Commit the documentation update as its own commit within
      this task's branch** (matching the existing plans' convention of
      separating docs from code so a reviewer can see the two apart), then the
      code deletion; PR; wait for all six required checks; confirm merge;
      notify the owner that the palette is now the ONLY way to add a block.**

---

## Task 9: Full browser and accessibility proof, plus picture proof on the PR

**Files:**

- Modify or create: whichever `tests/e2e/` spec(s) this plan's earlier tasks
  left with only narrow, targeted coverage — confirm exactly which by
  re-reading Tasks 5–7's own "targeted case" steps and listing what each one
  deliberately deferred (per Task 5 Step 11's own note: the append-slot
  case, the depth-cap refusal case, and full keyboard coverage were each
  named as belonging to a LATER task).
- Modify: `apps/hub/tests/e2e/a11y.spec.ts` — add a case scanning the
  Palette tab open, and a palette-origin drag in progress with its
  highlights showing, matching this suite's own existing convention of
  scanning a feature's OPEN state rather than only its closed one (the
  actors CLAUDE.md's account of the page-source dock's own axe findings —
  `aria-required-attr`, `nested-interactive` — is exactly the class of
  defect a scan of the OPEN state catches and a scan of the closed one
  cannot).

This task adds no new mechanism — it is the "closing sweep" every other
finished feature in this codebase gets, per the actors CLAUDE.md's own
repeated pattern of a dedicated proof-and-polish pass after the mechanism
lands.

- [ ] **Step 1: Enumerate every gap the previous eight tasks explicitly
      deferred** (grep each task's own commit messages and PR descriptions for
      "targeted case" / "deferred to a later task" / "this task's own note"),
      and write the missing browser cases: the append-slot drop onto a FULLY
      PACKED container by keyboard (Task 6 proved it by pointer only, Task 7
      proved arrow/Tab stepping on ordinary targets only); a container-kind drag
      refused at the depth cap, by both pointer (highlighted targets simply
      exclude the too-deep container, so the assertion is an ABSENCE of
      highlight, not a refusal banner — the domain layer already refuses before
      a target is ever offered, per Task 1) and by keyboard (stepping never
      lands on a too-deep target, for the same reason); the drag announcement
      text for a palette-origin lift/step/drop, matching
      `drag-announcements.ts`'s existing convention for canvas-move drags —
      confirm whether a palette drag needs its own announcement strings or can
      reuse the existing ones, and add them to BOTH `en.json`/`es.json`
      catalogues with the parity check (`messages.test.ts`) covering them if
      new.

- [ ] **Step 2: Run the full `a11y.spec.ts` addition**, sabotage-verifying
      at least one finding the way the page-source dock's own history did —
      if the scan comes back clean on the first real run, that is itself worth
      recording rather than assuming the feature is therefore flawless (root
      rule 19's caution about a scan that never fires applies here too: confirm
      the relevant `wcag2a`/`21aa` rule tags this suite runs actually cover
      whatever the palette's own markup could plausibly get wrong — a highlight
      outline with no accessible-name change, a drag source with no
      `aria-label`, a dialog-free dismiss path for Escape).

- [ ] **Step 3: Run the FULL suite one more time** —
      `pnpm --filter hub test`, `pnpm lint`, `pnpm typecheck`,
      `pnpm --filter hub build`, `pnpm check:docs`, `pnpm check:agent-notes`,
      full `pnpm --filter hub test:e2e` with secrets, and the `canvas` job's own
      local equivalent if one exists (confirm from `package.json` scripts) —
      before opening this task's PR, since it is the last chance to catch
      anything the previous eight tasks' own narrower runs missed.

- [ ] **Step 4: Picture proof, per the root CLAUDE.md's own standing rule**
      ("Picture proof on the PR is part of the work, not a follow-up"). Seed a
      real page, sign in with a real Clerk-authenticated `next dev` session
      (never a screenshot of `main`'s production deployment, per that rule's
      own "photograph the branch, never `main` by accident" caution), and
      photograph: the Palette tab with nothing selected; a pointer drag in
      progress with every valid target highlighted at once (the headline claim
      of this whole feature); the panel switching to the new block's own tab
      immediately after a drop; a depth-capped container showing NO highlight
      for a layout-kind drag. Read every picture back per that rule's own
      second pass — "what else is in this frame, and is any of it wrong" —
      before posting. Host via a private gist exactly as that rule prescribes;
      never attempt a direct upload through `gh pr comment`.

- [ ] **Step 5: Re-read `apps/hub/src/features/actors/CLAUDE.md` one more
      time against the whole plan's cumulative effect**, since eight separate
      tasks each asked this question narrowly against their own change; a
      ninth, wide-angle pass is what catches a cross-task inconsistency none of
      the individual re-reads could see on their own (mirroring how this file's
      own history records a "closing sweep" finding stale claims earlier
      per-task reviews missed, e.g. the "four wrong instructions found on the
      closing task" pattern already documented for the era-looks work).

- [ ] **Step 6: Commit; PR; post the picture-proof comment on the PR (not
      before merge, per that rule's own procedure — open the PR, let checks
      run, post pictures as a PR comment); wait for all six checks; confirm
      merge; notify the owner that the palette drag-to-add feature is complete
      end to end.**
