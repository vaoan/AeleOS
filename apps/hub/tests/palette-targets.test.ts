import { describe, expect, it } from "vitest";
import {
  insertTargetsFor,
  orderedInsertTargets,
  stepInsertSection,
  stepInsertTarget,
  type InsertTarget,
} from "@/features/actors/domain/palette-targets";
import { newContainer, newLeaf } from "@/features/actors/domain/block-edits";
import {
  CONTAINER_KIND,
  type Block,
  type ContainerBlock,
  type ContainerMode,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";

/** A leaf carrying a title, so a fixture is legible in a failure message. */
const text = (title: string): LeafBlock => ({
  ...newLeaf("text"),
  title_en: title,
});

/** A named `stack` container holding the given children. */
const stack = (children: (Block | null)[]): ContainerBlock => ({
  ...newContainer("stack", Math.max(1, children.length)),
  kind: CONTAINER_KIND,
  children,
});

/** A container of the given mode, laid out across `spaces` places. */
const container = (
  mode: ContainerMode,
  spaces: number,
  children: (Block | null)[],
): ContainerBlock => ({
  ...newContainer(mode, spaces),
  children,
});

/** The paths of a target list, for a shorter assertion. */
const paths = (targets: InsertTarget[]) => targets.map((target) => target.path);

/** An {@link InsertTarget} literal, for building step fixtures by hand. */
const at = (path: number[]): InsertTarget => ({ path });

describe("insertTargetsFor", () => {
  it("offers every top-level splice index on an empty page for a leaf", () => {
    expect(
      paths(insertTargetsFor([], { kind: "leaf", leafKind: "text" })),
    ).toEqual([[0]]);
  });

  it("offers N+1 top-level indices for N existing sections", () => {
    // Each section is itself a container, so it ALSO offers its own append
    // slot for its (here empty) children array — a fact `insertTargetsFor`
    // must not hide, since the case below this one relies on exactly the
    // same append slot existing on a container that holds something. So
    // this asserts the TOP-LEVEL indices the case is named for by filtering
    // to path length 1, rather than asserting the whole list is only those
    // three entries — which would be a false claim about a page whose
    // sections are real containers.
    const blocks = [stack([]), stack([])];
    const targets = insertTargetsFor(blocks, {
      kind: "leaf",
      leafKind: "text",
    });
    const topLevel = targets.filter((target) => target.path.length === 1);
    expect(paths(topLevel)).toEqual([[0], [1], [2]]);
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
    expect(paths(targets)).toEqual([
      [0],
      [1], // top level
      [0, 0],
      [0, 1],
      [0, 2], // the grid's own two places plus append
    ]);
  });

  it("refuses a nested container at the depth cap, but still offers its leaves", () => {
    // Built to exactly MAX_DEPTH (3) nested containers: `outer` at [0],
    // `middle` at [0, 0], `deepest` at [0, 0, 0] — the deepest a container
    // may legally sit. A container-kind item must get no target INSIDE
    // `deepest` (that would need a fourth level of container nesting),
    // while a leaf-kind item still does, because the cap gates a
    // container's own depth and never a leaf's. Excludes "the whole
    // subtree is skipped" (the walk still has to visit `deepest`'s own
    // children for a leaf item) as well as "the cap is never enforced" (no
    // depth-4 target is ever offered for a container item).
    const deepest = stack([text("leaf")]);
    const middle = stack([deepest]);
    const outer = stack([middle]);
    const blocks = [outer];

    const forContainer = insertTargetsFor(blocks, {
      kind: "container",
      mode: "stack",
    });
    expect(paths(forContainer)).toEqual([
      [0],
      [1],
      [0, 0],
      [0, 1],
      [0, 0, 0],
      [0, 0, 1],
    ]);

    const forLeaf = insertTargetsFor(blocks, {
      kind: "leaf",
      leafKind: "text",
    });
    expect(paths(forLeaf)).toEqual([
      [0],
      [1],
      [0, 0],
      [0, 1],
      [0, 0, 0],
      [0, 0, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 1],
    ]);
  });

  it("does not offer a container target where mayNest refuses, at any depth short of the cap", () => {
    // A container two levels deep (one below the cap) — mayNest([...path,
    // 0]) should still admit a THIRD level; only the fourth is refused.
    // This excludes an off-by-one in the depth arithmetic: `inner` sits at
    // [0, 0], and a container placed at [0, 0, 0] — one level deeper — is
    // still within MAX_DEPTH, so `inner`'s own places must be offered as
    // targets rather than refused too early.
    const inner = stack([text("leaf")]);
    const outer = stack([inner]);
    const blocks = [outer];

    const forContainer = insertTargetsFor(blocks, {
      kind: "container",
      mode: "stack",
    });
    expect(paths(forContainer)).toEqual([
      [0],
      [1],
      [0, 0],
      [0, 1],
      [0, 0, 0],
      [0, 0, 1],
    ]);
  });
});

describe("orderedInsertTargets", () => {
  it("is insertTargetsFor's own output, not a second traversal", () => {
    // If this ever computed its own walk independently, it could disagree
    // with insertTargetsFor the moment either changed. Asserting equality
    // to a fresh insertTargetsFor call is what excludes that.
    const blocks = [container("grid", 2, [text("a"), null])];
    const item = { kind: "leaf" as const, leafKind: "text" as const };
    expect(orderedInsertTargets(blocks, item)).toEqual(
      insertTargetsFor(blocks, item),
    );
  });
});

describe("stepInsertTarget", () => {
  it("steps forward through the ordered list with no wraparound at the end", () => {
    const order = [at([0]), at([1]), at([2])];
    // A middle step advances by exactly one position.
    expect(stepInsertTarget(order, order[1], true)).toEqual(order[2]);
    // Excludes wrapping back to the first entry once the last is reached.
    expect(stepInsertTarget(order, order[2], true)).toBeUndefined();
  });

  it("steps backward with no wraparound at the start", () => {
    const order = [at([0]), at([1]), at([2])];
    expect(stepInsertTarget(order, order[1], false)).toEqual(order[0]);
    // Excludes wrapping back to the last entry once the first is reached.
    expect(stepInsertTarget(order, order[0], false)).toBeUndefined();
  });

  it("starting from undefined steps to the first entry going forward", () => {
    const order = [at([0]), at([1]), at([2])];
    expect(stepInsertTarget(order, undefined, true)).toEqual(order[0]);
  });

  it("starting from undefined steps to the last entry going backward", () => {
    const order = [at([0]), at([1]), at([2])];
    expect(stepInsertTarget(order, undefined, false)).toEqual(order[2]);
  });
});

describe("stepInsertSection", () => {
  it("jumps past every target nested inside the current section to the next section's first target", () => {
    // Two 2-space grids; current target is inside the first grid's own
    // places; forward step must land on the SECOND grid's first target,
    // never on the first grid's remaining places. Excludes "it behaves
    // identically to stepInsertTarget", which would step to the very next
    // entry in `order` — the first grid's own append slot, [0, 2] — rather
    // than skipping ahead to the second grid.
    const grid1 = container("grid", 2, [text("a"), text("b")]);
    const grid2 = container("grid", 2, [text("c"), text("d")]);
    const order = orderedInsertTargets([grid1, grid2], {
      kind: "leaf",
      leafKind: "text",
    });
    const current = at([0, 1]); // the second (filled) place of the first grid

    const next = stepInsertSection(order, current, true);
    expect(next).toEqual({ path: [1] });

    const merelyNext = stepInsertTarget(order, current, true);
    expect(merelyNext).toEqual({ path: [0, 2] });
    expect(next).not.toEqual(merelyNext);
  });

  it("does nothing past the last section", () => {
    const grid1 = container("grid", 2, [text("a"), text("b")]);
    const grid2 = container("grid", 2, [text("c"), text("d")]);
    const order = orderedInsertTargets([grid1, grid2], {
      kind: "leaf",
      leafKind: "text",
    });
    // The page's own trailing append slot — top-level index 2, one past
    // the last section (grid2, index 1). No target anywhere in `order` has
    // a larger top-level index, so stepping forward from here refuses
    // rather than wrapping or finding a target still inside grid2.
    const current = at([2]);
    expect(stepInsertSection(order, current, true)).toBeUndefined();
  });

  it("from a top-level (page-root) target, steps to the next top-level target", () => {
    // Excludes "section-skip only works from inside a section": current is
    // itself a page-root splice, never nested inside either grid at all.
    const grid1 = container("grid", 2, [text("a"), text("b")]);
    const grid2 = container("grid", 2, [text("c"), text("d")]);
    const order = orderedInsertTargets([grid1, grid2], {
      kind: "leaf",
      leafKind: "text",
    });
    const current = at([0]); // the page-root splice immediately before grid1
    expect(stepInsertSection(order, current, true)).toEqual({ path: [1] });
  });

  it("steps backward to a target with a smaller top-level index", () => {
    const grid1 = container("grid", 2, [text("a"), text("b")]);
    const grid2 = container("grid", 2, [text("c"), text("d")]);
    const order = orderedInsertTargets([grid1, grid2], {
      kind: "leaf",
      leafKind: "text",
    });
    const current = at([1, 0]); // inside the second grid's own places
    expect(stepInsertSection(order, current, false)).toEqual({ path: [0] });
  });

  it("starting from undefined steps to the first entry going forward", () => {
    const order = [at([0]), at([1]), at([0, 0])];
    expect(stepInsertSection(order, undefined, true)).toEqual(order[0]);
  });

  it("starting from undefined steps to the last entry going backward", () => {
    const order = [at([0]), at([1]), at([0, 0])];
    expect(stepInsertSection(order, undefined, false)).toEqual(order[2]);
  });
});
