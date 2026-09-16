# Drop Target Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** What the editor draws while dragging is where the block actually
lands — one mark, at the real destination, with the carried block visible.

**Architecture:** The canvas-move path already owns a correct gap vocabulary
(`DropTarget`'s `before`/`after`, drawn as an accent bar only when `isOver`).
The palette path owns none of it and outlines the block _after_ the gap
instead, for every candidate at once. This plan translates palette targets
into that same vocabulary with one pure domain function, raises the shared
mark from a bar to a ghost slot drawn out of flow, deletes the
light-everything behaviour, and adds a `DragOverlay`.

**Tech Stack:** Next.js 16, React 19, `@dnd-kit/core`, Tailwind v4, Vitest,
Playwright.

**Spec:** `docs/superpowers/specs/2026-09-07-drop-target-legibility-design.md`

## Global Constraints

- **No renderer in `blocks.tsx` grows an `editing`/`isEditor` branch.** Drag
  feedback is drawn by the editor's own wrappers only.
- **Motion never renders on a `@dnd-kit` node**, and `DragOverlay` is one.
- **The overlay is editor chrome and must be fully opaque** — `bg-(--menu)`,
  the one token declared opaque in both modes. What is behind it is a colour
  the page's author chose.
- **Nothing a drag measures may move during a drag.** Every mark is
  absolutely positioned and `pointer-events-none`. This is the whole reason
  option C was chosen over letting the gap genuinely open; a change that
  reflows the canvas mid-drag silently reintroduces the fault this plan
  removes.
- **Only the winning target is drawn.** No other candidate is marked.
- **Every export carries TSDoc stating the contract**, and `pnpm lint` fails
  without it.
- **Run `pnpm lint` from the repository root, never from `apps/hub`.**

---

### Task 1: `insertMarkFor` — translate a splice index into a gap

A palette `InsertTarget` carries a bare splice index meaning "insert
**before** this position". Nothing renders a gap, so today it is drawn as the
block sitting at that index — the one that gets pushed down. This function is
the translation, and it is pure so it can be tested without a browser.

**Files:**

- Modify: `apps/hub/src/features/actors/domain/palette-targets.ts`
- Test: `apps/hub/tests/palette-targets.test.ts`

**Interfaces:**

- Consumes: `InsertTarget` (`{ readonly path: BlockPath }`) and `DropTarget`
  (`{ kind: "before" | "after" | "place"; path: BlockPath }` from
  `domain/block-drops.ts`), both already exported.
- Produces: `insertMarkFor(blocks: readonly (Block | null)[], target: InsertTarget): DropTarget | null`

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub/tests/palette-targets.test.ts
import { describe, expect, it } from "vitest";
import { insertMarkFor } from "@/features/actors/domain/palette-targets";
import {
  BLOCK_LIMITS,
  CONTAINER_KIND,
  type Block,
  type ContainerBlock,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";

// These match `tests/block-moves.test.ts`'s own fixtures deliberately. Two
// details are not cosmetic: the container kind is the exported CONTAINER_KIND
// constant rather than a literal, and `spaces` is floored at 1 — a container
// laying zero places is a shape the schema refuses, so `section([])` built
// with `spaces: children.length` would be testing something unrepresentable.
const leaf = (title: string): LeafBlock => ({
  kind: "text",
  title_en: title,
  description_en: "",
});

const section = (children: (Block | null)[]): ContainerBlock => ({
  kind: CONTAINER_KIND,
  mode: "stack",
  spaces: Math.min(BLOCK_LIMITS.spaces, Math.max(1, children.length)),
  children,
});

describe("insertMarkFor", () => {
  // The discriminating case. At a FILLED mid-list index the gap and the
  // block are different elements, which is exactly where the old drawing
  // was wrong; at an empty place they coincide and any implementation
  // passes.
  it("marks the gap BEFORE the block a mid-list index names", () => {
    const blocks = [section([leaf("a"), leaf("b"), leaf("c")])];
    expect(insertMarkFor(blocks, { path: [0, 1] })).toEqual({
      kind: "before",
      path: [0, 1],
    });
  });

  it("marks AFTER the last child for the append index", () => {
    const blocks = [section([leaf("a"), leaf("b")])];
    expect(insertMarkFor(blocks, { path: [0, 2] })).toEqual({
      kind: "after",
      path: [0, 1],
    });
  });

  it("marks the place itself inside an empty container", () => {
    const blocks = [section([])];
    expect(insertMarkFor(blocks, { path: [0, 0] })).toEqual({
      kind: "place",
      path: [0, 0],
    });
  });

  it("marks a gap before an EMPTY place, not the place itself", () => {
    // children[1] is null. Inserting at 1 pushes that empty place down, so
    // the gap above it is still the honest mark.
    const blocks = [section([leaf("a"), null, leaf("c")])];
    expect(insertMarkFor(blocks, { path: [0, 1] })).toEqual({
      kind: "before",
      path: [0, 1],
    });
  });

  it("marks the top level the same way", () => {
    const blocks = [section([leaf("a")]), section([leaf("b")])];
    expect(insertMarkFor(blocks, { path: [1] })).toEqual({
      kind: "before",
      path: [1],
    });
    expect(insertMarkFor(blocks, { path: [2] })).toEqual({
      kind: "after",
      path: [1],
    });
  });

  it("answers null for a path that names no container", () => {
    expect(insertMarkFor([leaf("a")], { path: [0, 5] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/palette-targets.test.ts`
Expected: FAIL — `insertMarkFor` is not exported.

- [ ] **Step 3: Implement it**

Append to `apps/hub/src/features/actors/domain/palette-targets.ts`:

```ts
import type { DropTarget } from "@/features/actors/domain/block-drops";
import { isContainer } from "@/features/actors/domain/block-schema";

/**
 * The gap a palette insert target names, as something a renderer can draw.
 *
 * **An {@link InsertTarget}'s last segment is a splice index, not a block.**
 * `[0, 2]` means "insert before whatever is at index 2 of block 0", so
 * drawing the block at `[0, 2]` marks the block that will be PUSHED DOWN
 * rather than the space the new one takes. This translates the index into a
 * {@link DropTarget}, the same vocabulary the canvas-move path already draws
 * with, so both drags mark a landing the same way.
 *
 * The append index — one past the last child — has no sibling to sit before,
 * so it answers `after` the last child instead. A container with no children
 * has neither, so it answers `place`, naming its own first position.
 *
 * **An empty place is still marked with a gap**, not as a place: inserting
 * before a `null` child pushes that empty place down exactly as it would a
 * filled one, so the honest mark is the space above it.
 *
 * @param blocks - the whole page, read only.
 * @param target - one insert target, as `insertTargetsFor` answers them.
 * @returns the mark to draw, or `null` when the path names no container or
 * points past the end of one.
 */
export function insertMarkFor(
  blocks: readonly (Block | null)[],
  target: InsertTarget,
): DropTarget | null {
  const path = target.path;
  if (path.length === 0) return null;
  const parent = path.slice(0, -1);
  const index = path[path.length - 1]!;
  if (index < 0) return null;

  let siblings: readonly (Block | null)[] = blocks;
  for (const step of parent) {
    const next = siblings[step];
    if (!next || !isContainer(next)) return null;
    siblings = next.children;
  }

  if (index > siblings.length) return null;
  if (siblings.length === 0) return { kind: "place", path: [...parent, 0] };
  if (index === siblings.length) {
    return { kind: "after", path: [...parent, siblings.length - 1] };
  }
  return { kind: "before", path: [...parent, index] };
}
```

Add `Block` to the existing `block-schema` type import at the top of the file
if it is not already there.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/palette-targets.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Sabotage-verify the discriminating case**

Change the final `return` to `{ kind: "place", path: [...parent, index] }` —
the behaviour this function exists to replace. Re-run.
Expected: the mid-list, empty-place and top-level cases go RED. Restore by
**copying the file back from a copy you made before editing**, never with
`git checkout --`, which discards uncommitted work in the same file.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/domain/palette-targets.ts apps/hub/tests/palette-targets.test.ts
git commit -m "feat(actors): translate a palette splice index into the gap it names"
```

---

### Task 2: `DropMark` — one component draws every landing

Today the mark is three inline fragments in `EditableBlockFrame`: two
`<span>` bars for `before`/`after`, and an `outline` class for `place`. They
are about to be used by two callers and to grow a carried height, so they
become one component. Raising the bar to a **ghost slot** happens here.

**Files:**

- Create: `apps/hub/src/features/actors/presentation/drop-mark.tsx`
- Test: `apps/hub/tests/drop-mark.test.tsx`

**Interfaces:**

- Consumes: `DropTarget["kind"]` from `domain/block-drops.ts`, `CHROME_SCOPE`
  from `@/shared/domain/chrome`, `tid` from
  `@/shared/infrastructure/test-id`.
- Produces: `DropMark(props: DropMarkProps)` where
  `DropMarkProps = { readonly kind: DropTarget["kind"]; readonly height: number | null }`.
  Test ids `canvas-drop-before`, `canvas-drop-after`, `canvas-drop-place` —
  the first two are the ids three existing suites already assert, and they do
  not change.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/hub/tests/drop-mark.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DropMark } from "@/features/actors/presentation/drop-mark";

describe("DropMark", () => {
  it("draws a slot above for a before target", () => {
    render(<DropMark kind="before" height={120} />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveStyle({ height: "120px" });
  });

  it("draws a slot below for an after target", () => {
    render(<DropMark kind="after" height={120} />);
    expect(screen.getByTestId("canvas-drop-after")).toBeInTheDocument();
  });

  it("fills the place itself for a place target", () => {
    render(<DropMark kind="place" height={null} />);
    expect(screen.getByTestId("canvas-drop-place")).toBeInTheDocument();
  });

  // A palette drag carries a block that does not exist yet, so no height can
  // be measured for it. The slot must still be visible.
  it("stands at its own minimum when no height is known", () => {
    render(<DropMark kind="before" height={null} />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(mark.className).toContain("min-h-12");
    expect(mark).not.toHaveStyle({ height: "0px" });
  });

  // The whole reason this is an overlay rather than a real opening gap: it
  // must not take part in layout, or every cached droppable rect goes stale
  // mid-drag.
  it("never takes part in layout or swallows the pointer", () => {
    render(<DropMark kind="before" height={80} />);
    const mark = screen.getByTestId("canvas-drop-before");
    expect(mark.className).toContain("absolute");
    expect(mark.className).toContain("pointer-events-none");
  });

  it("wears the chrome scope so an author's theme cannot restyle it", () => {
    render(<DropMark kind="place" height={null} />);
    expect(screen.getByTestId("canvas-drop-place").className).toContain(
      "aeleos-chrome",
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/drop-mark.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement it**

```tsx
// apps/hub/src/features/actors/presentation/drop-mark.tsx
import type { ReactNode } from "react";
import type { DropTarget } from "@/features/actors/domain/block-drops";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link DropMark} needs. */
export interface DropMarkProps {
  /** Which landing this marks — a gap above, a gap below, or the place. */
  readonly kind: DropTarget["kind"];
  /**
   * How tall the carried block is, in pixels, or `null` when nothing can be
   * measured — which is every palette drag, since the block being added does
   * not exist yet and has no height to read.
   */
  readonly height: number | null;
}

/** Where each kind sits relative to the block that hosts it. */
const PLACEMENT: Record<DropTarget["kind"], string> = {
  before: "inset-x-0 top-0 -translate-y-1/2",
  after: "inset-x-0 bottom-0 translate-y-1/2",
  place: "inset-0",
};

/** The test id each kind carries. */
const MARK_ID: Record<DropTarget["kind"], string> = {
  before: "canvas-drop-before",
  after: "canvas-drop-after",
  place: "canvas-drop-place",
};

/**
 * The one mark drawn for a landing, for both drag kinds.
 *
 * **It is a ghost of the space the block will occupy, drawn OUT OF FLOW.**
 * Absolutely positioned and `pointer-events-none`, so the canvas never
 * reflows while a drag is in progress — `@dnd-kit` caches every droppable's
 * rectangle when a drag begins, and a page that moves underneath those
 * rectangles makes the collision answer about where things WERE. Letting the
 * gap genuinely open was weighed and refused for exactly that reason; see the
 * design's §4.
 *
 * The cost that buys: the ghost OVERLAPS the neighbour below rather than
 * pushing it. That is a known and accepted trade, and it is the first thing
 * to look at in a screenshot — if it reads as landing ON something rather
 * than BETWEEN, the fallback is the plain bar this replaced.
 *
 * `place` fills its host instead of straddling an edge, because there the
 * landing IS the place — an empty positional slot, or the block a swap will
 * exchange with.
 *
 * @param props - see {@link DropMarkProps}.
 * @returns the mark, positioned against the nearest positioned ancestor.
 */
export function DropMark(props: DropMarkProps): ReactNode {
  const { kind, height } = props;
  return (
    <span
      aria-hidden
      {...tid(MARK_ID[kind])}
      style={height === null ? undefined : { height: `${height}px` }}
      className={`${CHROME_SCOPE} ${PLACEMENT[kind]} pointer-events-none absolute z-20 min-h-12 rounded-lg border-2 border-dashed border-(--accent) bg-(--accent)/15`}
    />
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/drop-mark.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/presentation/drop-mark.tsx apps/hub/tests/drop-mark.test.tsx
git commit -m "feat(actors): one ghost-slot mark for every drop landing"
```

---

### Task 3: The frame draws one mark, and stops lighting everything

`EditableBlockFrame` currently draws two inline bars and, separately, the
`data-canvas-drop="place"` outline for **every** entry in
`editor.insertTargets`. This replaces all of it with a single `DropMark` for
the one winning target, and deletes `insertTargets` from the instrumentation.

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/editable-block-frame.tsx`
- Modify: `apps/hub/tests/editable-block-frame.test.tsx`
- Modify: `apps/hub/tests/block-card.test.tsx`,
  `apps/hub/tests/block-editor.test.tsx` — both construct
  `EditableBlockInstrumentation` and must drop the removed field.

**Interfaces:**

- Consumes: `DropMark` from Task 2.
- Produces: `EditableBlockInstrumentation` **without** `insertTargets`, and
  **with** `carriedHeight: number | null`.

- [ ] **Step 1: Write the failing test**

Add to `apps/hub/tests/editable-block-frame.test.tsx`:

```tsx
it("marks only the winning target, never every candidate", () => {
  // Two frames, one active target. Exactly one mark may exist on the page.
  const editor = {
    selectedPath: undefined,
    activeTarget: { kind: "before" as const, path: [0, 1] },
    dragLabel: "Move",
    carriedHeight: 96,
  };
  render(
    <>
      <EditableBlockFrame path="0-0" filled editor={editor}>
        <div />
      </EditableBlockFrame>
      <EditableBlockFrame path="0-1" filled editor={editor}>
        <div />
      </EditableBlockFrame>
    </>,
  );
  expect(screen.getAllByTestId("canvas-drop-before")).toHaveLength(1);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/editable-block-frame.test.tsx`
Expected: FAIL — `carriedHeight` is not on the type, and the old code gates
the bar on `isOver`, which jsdom never sets.

- [ ] **Step 3: Implement it**

In `editable-block-frame.tsx`:

1. Delete the `insertTargets` field from `EditableBlockInstrumentation` and
   its TSDoc, and delete the `InsertTarget` import.
2. Add to the interface:

```ts
  /**
   * How tall the block being carried is, in pixels, or `null` when nothing
   * can be measured — every palette drag, since the block does not exist
   * yet. Threaded so the mark is the size of the real landing rather than a
   * fixed guess.
   */
  readonly carriedHeight: number | null;
```

3. Delete the `isInsertTarget` computation entirely.
4. Change the drop attribute to name only the winning `place`:

```tsx
      data-canvas-drop={target === "place" ? "place" : undefined}
```

5. Replace the two inline `<span>` bars with:

```tsx
{
  target ? <DropMark kind={target} height={editor.carriedHeight} /> : null;
}
```

Note the removed `&& isOver` — `activeTarget` is already the single winner
the collision resolved, so gating on `isOver` as well was a second opinion
about the same question, and it is what made the mark invisible in jsdom.
Keep `isOver` in the destructure only if something else still reads it;
otherwise delete it too and let lint tell you.

- [ ] **Step 4: Run the whole hub suite**

Run: `pnpm --filter hub test`
Expected: the three suites naming `insertTargets` fail to compile. Remove that
field from every instrumentation object they build. Re-run until green.

- [ ] **Step 5: Typecheck, because vitest does not**

Run: `pnpm typecheck`
Expected: clean. A green vitest run is not evidence about a file `tsc` never
saw — vitest strips types with esbuild and reports nothing.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/presentation/editable-block-frame.tsx apps/hub/tests
git commit -m "feat(actors): draw one landing mark, not every candidate"
```

---

### Task 4: The palette resolves one winner through the gap translation

`detectCollisionAt`'s palette branch already ranks candidates and returns a
single id. What it never did is publish that choice as an `activeTarget`, so
the frame had nothing to draw and fell back to lighting the whole set.

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Test: `apps/hub/tests/block-editor.test.tsx`

**Interfaces:**

- Consumes: `insertMarkFor` (Task 1), the `carriedHeight` field (Task 3).
- Produces: the instrumentation object passed to the renderer now carries
  `activeTarget` for palette drags too, and `carriedHeight`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/hub/tests/block-editor.test.tsx — add to the drag describe block
it("publishes a gap mark while a palette drag hovers a filled position", () => {
  // Drives the real onDragOver path with a palette payload over the second
  // child of the first section, and asserts the mark is the gap ABOVE it
  // rather than an outline around it.
  const { paletteDragOver } = renderEditorWithPage(threeLeafPage());
  paletteDragOver({ overPath: [0, 1] });
  expect(screen.getByTestId("canvas-drop-before")).toBeInTheDocument();
  expect(screen.queryByTestId("canvas-drop-place")).not.toBeInTheDocument();
});
```

Use the file's existing editor-rendering helper rather than a new one; match
whatever `block-editor.test.tsx` already calls to mount the editor and fire
drag events, and name the helper accordingly.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/block-editor.test.tsx`
Expected: FAIL — no `canvas-drop-before` is rendered for a palette drag.

- [ ] **Step 3: Implement it**

1. In the palette branch of `onDragOver`, translate the winning target and
   store it where the canvas branch already stores its own:

```ts
const winner = insertTargetsRef.current?.find(
  (candidate) => canvasPlaceId(candidate.path) === overId,
);
paletteTarget.current = winner ? insertMarkFor(blocks, winner) : null;
```

2. Add `paletteTarget` beside the existing `pointerTarget` ref, and make the
   value handed to the renderer prefer whichever drag is live:

```ts
activeTarget: paletteTarget.current ?? pointerTarget.current,
```

3. Set `carriedHeight` at `onDragStart`: for a canvas drag read
   `event.active.rect.current.initial?.height ?? null`; for a palette drag it
   is `null`, because the block does not exist yet.
4. Clear `paletteTarget.current` and `carriedHeight` in `onDragEnd` and
   `onDragCancel`, beside the existing `insertTargetsRef.current = null`
   lines — all three of them.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/block-editor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/presentation/block-editor.tsx apps/hub/tests/block-editor.test.tsx
git commit -m "feat(actors): a palette drag publishes the gap it will land in"
```

---

### Task 5: `DragOverlay` — the carried block becomes visible

**Files:**

- Create: `apps/hub/src/features/actors/presentation/drag-preview.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Test: `apps/hub/tests/drag-preview.test.tsx`

**Interfaces:**

- Produces: `DragPreview(props: { readonly label: string })`, rendered inside
  `<DragOverlay>` by `BlockEditor`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/hub/tests/drag-preview.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DragPreview } from "@/features/actors/presentation/drag-preview";

describe("DragPreview", () => {
  it("names what is being carried", () => {
    render(<DragPreview label="Picture" />);
    expect(screen.getByTestId("drag-preview")).toBeInTheDocument();
  });

  // What sits behind this is a colour the page's author chose, and they may
  // choose any colour, so a translucent preview has no guaranteed contrast
  // and no measurement can give it one.
  it("is opaque, and wears the chrome scope", () => {
    render(<DragPreview label="Picture" />);
    const preview = screen.getByTestId("drag-preview");
    expect(preview.className).toContain("bg-(--menu)");
    expect(preview.className).toContain("aeleos-chrome");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/drag-preview.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement it**

```tsx
// apps/hub/src/features/actors/presentation/drag-preview.tsx
import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link DragPreview} needs. */
export interface DragPreviewProps {
  /** What is being carried, in the reader's own language. */
  readonly label: string;
}

/**
 * The thing that follows the cursor during a drag.
 *
 * **Opaque by requirement rather than by taste.** It floats over a page whose
 * colours the author picked and may pick freely, so no contrast can be
 * promised against whatever is behind it; `--menu` is the one token declared
 * opaque in both modes.
 *
 * **No Motion here, ever.** `@dnd-kit` writes this element's `transform` to
 * follow the pointer, and a second system writing the same property is the
 * cascade fight the feature note forbids.
 *
 * @param props - see {@link DragPreviewProps}.
 * @returns the floating preview.
 */
export function DragPreview(props: DragPreviewProps): ReactNode {
  return (
    <div
      {...tid("drag-preview")}
      className={`${CHROME_SCOPE} pointer-events-none flex w-max max-w-64 items-center gap-2 rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-2 text-sm text-(--ink) shadow-lg`}
    >
      <GripVertical className="size-4 shrink-0 text-(--muted)" />
      <span className="truncate">{props.label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Mount it in the editor**

In `block-editor.tsx`, add `DragOverlay` to the `@dnd-kit/core` import and
render it as the last child of `<DndContext>`:

```tsx
<DragOverlay dropAnimation={null}>
  {activeLabel ? <DragPreview label={activeLabel} /> : null}
</DragOverlay>
```

Hold `activeLabel` in state, set at `onDragStart` from the palette item's own
name for a palette drag and from `placeName(path)` for a canvas drag, and
cleared in both `onDragEnd` and `onDragCancel`. `dropAnimation={null}`
because the default flies the preview back to a source rectangle that a
completed insert has already moved.

- [ ] **Step 5: Run the suite and typecheck**

Run: `pnpm --filter hub test && pnpm typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/presentation/drag-preview.tsx apps/hub/src/features/actors/presentation/block-editor.tsx apps/hub/tests/drag-preview.test.tsx
git commit -m "feat(actors): the carried block follows the cursor"
```

---

### Task 6: A swap says it is a swap

Dropping onto an occupied place exchanges the two blocks — the one already
there returns to where the carried one came from. Nothing says so, so it
reads as an overwrite.

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/editable-block-frame.tsx`
- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx`
- Test: `apps/hub/tests/editable-block-frame.test.tsx`

**Interfaces:**

- Produces: `EditableBlockInstrumentation.returningPath: string | null` — the
  renderer path of the place the displaced block goes back to, `null` unless
  the live drag is a swap.

- [ ] **Step 1: Write the failing test**

```tsx
it("marks both ends of a swap", () => {
  const editor = {
    selectedPath: undefined,
    activeTarget: { kind: "place" as const, path: [0, 1] },
    dragLabel: "Move",
    carriedHeight: 96,
    returningPath: "0-0",
  };
  render(
    <>
      <EditableBlockFrame path="0-0" filled editor={editor}>
        <div />
      </EditableBlockFrame>
      <EditableBlockFrame path="0-1" filled editor={editor}>
        <div />
      </EditableBlockFrame>
    </>,
  );
  expect(screen.getByTestId("canvas-drop-place")).toBeInTheDocument();
  expect(screen.getByTestId("canvas-drop-returning")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub exec vitest run tests/editable-block-frame.test.tsx`
Expected: FAIL — `canvas-drop-returning` is rendered by nothing.

- [ ] **Step 3: Implement it**

Add the field to the interface with TSDoc, and render beside the existing
mark:

```tsx
{
  editor.returningPath === encodedPath ? (
    <span
      aria-hidden
      {...tid("canvas-drop-returning")}
      className={`${CHROME_SCOPE} pointer-events-none absolute inset-0 z-20 rounded-lg border-2 border-dotted border-(--muted)`}
    />
  ) : null;
}
```

Dotted and muted rather than dashed and accent, so the two ends of a swap are
told apart at a glance: the accent one is where the carried block is going,
the muted one is where the displaced block is coming back to.

In `block-editor.tsx`, set `returningPath` at `onDragOver` only when the
canvas branch's winning target is `kind === "place"` **and** that place is
occupied; otherwise `null`. A palette insert displaces nothing, so it is
always `null` there.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter hub exec vitest run tests/editable-block-frame.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/presentation apps/hub/tests/editable-block-frame.test.tsx
git commit -m "feat(actors): a swap is marked at both ends"
```

---

### Task 7: The browser proof — the mark is where it lands

The lying-mark fault is a claim about which rectangle a pointer is inside.
No unit test can reach it.

**Files:**

- Create: `apps/hub/tests/e2e/drop-mark-matches-landing.spec.ts`
- Modify: `apps/hub/tests/e2e/palette-drag-to-add.spec.ts` — it asserts the
  old light-everything behaviour and must assert the new one.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub/tests/e2e/drop-mark-matches-landing.spec.ts
// THE DISCRIMINATING FIXTURE IS A FILLED MID-LIST POSITION. At an empty
// place a gap and a place coincide, so the fixed code and the broken code
// land identically and the case passes either way — root rule 27.
test("a palette drop lands where the mark said, mid-list", async ({ page }) => {
  await openEditorWithThreeLeaves(page);
  await startPaletteDrag(page, "text");
  await hoverMidList(page, 1);

  const mark = await page.getByTestId("canvas-drop-before").boundingBox();
  const neighbour = await page
    .locator('[data-canvas-path="0-1"]')
    .boundingBox();
  expect(mark).not.toBeNull();
  expect(neighbour).not.toBeNull();
  // The mark sits ON the boundary above the neighbour, not around it.
  expect(Math.abs(mark!.y - neighbour!.y)).toBeLessThan(mark!.height);

  await dropHere(page);
  // The new block is now at index 1 and the old one moved to 2.
  await expect(page.locator('[data-canvas-path="0-2"]')).toHaveAttribute(
    "data-block-kind",
    "text",
  );
});
```

Build the three helpers from what `palette-drag-to-add.spec.ts` and
`tests/e2e/support/editor.ts` already provide rather than inventing new
plumbing, and route every lift through `tests/e2e/support/drag.ts` — a
keyboard lift must yield a frame and then a macrotask, or the first arrow key
is lost on a heavier page.

- [ ] **Step 2: Run it and watch it fail against the pre-fix behaviour**

Run: `set -a; . ./.secrets; set +a; pnpm --filter hub exec playwright test tests/e2e/drop-mark-matches-landing.spec.ts`
Expected: FAIL. **Check the case count, not the word "passed"** — a suite run
without secrets stands most of itself down and reports green.

- [ ] **Step 3: Make it pass**

It should already pass on Tasks 1–4. If it does not, the gap is in the
translation or the publication, not in the test.

- [ ] **Step 4: Sabotage-verify**

Point the frame's mark back at the block rather than the gap — in
`insertMarkFor`, return `{ kind: "place", path }` for the mid-list case.
Expected: this spec reddens. Restore from a copy, not with `git checkout --`.

- [ ] **Step 5: Run the whole browser suite with secrets loaded**

Run: `set -a; . ./.secrets; set +a; pnpm --filter hub test:e2e`
Expected: green, with the case count matching a full run.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/tests/e2e
git commit -m "test(actors): the mark is where the block lands"
```

---

### Task 8: Photograph it, and write down what the pictures show

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-07-drop-target-legibility-design.md`

- [ ] **Step 1: Run every gate**

```bash
pnpm typecheck && pnpm --filter hub build && pnpm lint && pnpm --filter hub test:coverage && pnpm test:tools && pnpm check:tools
```

Expected: green, coverage at 100% on all four axes.

- [ ] **Step 2: Photograph the drag**

Drive the editor in a real browser and capture: a palette drag hovering a
filled mid-list position, a canvas drag over an empty place, and a swap over
an occupied one. **Read the pictures back as a separate pass**, asking what
else is in the frame rather than only whether the claim holds.

**The named risk to look for first:** the ghost overlaps the block below
rather than pushing it. If it reads as landing ON something rather than
BETWEEN, say so — the fallback is the plain bar, and that is a decision to
raise, not to patch quietly.

- [ ] **Step 3: Update the feature note**

Add a section to `apps/hub/src/features/actors/CLAUDE.md` recording: that the
palette and canvas paths now share one gap vocabulary through
`insertMarkFor`; that an insert target's last segment is a splice index and
drawing the block at that index marks the wrong element; that the mark is out
of flow **because a reflow mid-drag makes every cached droppable rect stale**;
and that only the winner is drawn, superseding the light-everything comment
this removes.

- [ ] **Step 4: Mark the spec delivered**

Change its `**Status:**` line to `delivered`, and record whether the overlap
risk in §4 materialised.

- [ ] **Step 5: Commit and open the pull request**

Picture proof goes on the PR as a comment, hosted from a private gist —
`docs/git-with-gh-token.md` has the mechanism. A green check is not the
picture.

---

## Self-review

**Spec coverage.** §2.1 → Tasks 3 and 4. §2.2 → Task 5. §2.3 → Tasks 1, 3, 4.
§3 → Task 1. §4 → Task 2. §5 → Task 5. §6 → Task 6. §7 → Global Constraints.
§8 → Task 7. No section is unimplemented.

**Known gap, stated rather than hidden.** The spec says the ghost is sized to
what will be carried. That is only knowable for a **canvas move**, where the
source has a measurable rectangle. A palette block does not exist yet and has
no height, so it falls back to `min-h-12` — the same minimum an empty place
already uses. Task 2's fourth case pins that fallback.

**Type consistency.** `carriedHeight: number | null` and `returningPath:
string | null` are introduced in Tasks 3 and 6 and read in Tasks 2, 4 and 6
under those exact names. `insertMarkFor` keeps one signature throughout. Test
ids `canvas-drop-before` and `canvas-drop-after` are unchanged from what three
existing suites already assert; `canvas-drop-place` and
`canvas-drop-returning` are new.
