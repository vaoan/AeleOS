import { describe, expect, it } from "vitest";
import {
  insertTargetsFor,
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
