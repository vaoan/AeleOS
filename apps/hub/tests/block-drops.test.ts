import { describe, expect, it } from "vitest";
import {
  applyDrop,
  applySiblingDrop,
  dropTargetForSibling,
  isLinearScope,
  type DropRefusal,
  type DropTarget,
} from "@/features/actors/domain/block-drops";
import { insertAt } from "@/features/actors/domain/block-edits";
import {
  BLOCK_LIMITS,
  CONTAINER_KIND,
  isContainer,
  type Block,
  type ContainerBlock,
  type ContainerMode,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";

// WHAT THIS SUITE IS FOR.
//
// Carrd-style drops are a source path plus a bar (`before` / `after`) or a
// positional `place`. A stack insert that was implemented as a swap would
// pass on TWO adjacent siblings — both operations leave them exchanged — so
// the linear cases move across a middle neighbour. A grid insert that was
// implemented as a shift would pass on a full row with no holes; the
// positional cases keep a middle empty place that a shift would close.

const leaf = (title: string): LeafBlock => ({
  kind: "text",
  title_en: title,
  description_en: "",
});

const box = (
  name: string,
  children: (Block | null)[],
  mode: ContainerMode = "stack",
): ContainerBlock => ({
  kind: CONTAINER_KIND,
  mode,
  spaces: Math.min(BLOCK_LIMITS.spaces, Math.max(1, children.length)),
  name_en: name,
  children,
});

const shape = (block: Block | null): unknown => {
  if (block === null) return null;
  return isContainer(block)
    ? [block.name_en, block.children.map((child) => shape(child))]
    : block.title_en;
};

const page = (blocks: readonly Block[]): unknown[] =>
  blocks.map((block) => shape(block));

const dropped = (
  blocks: readonly Block[],
  from: number[],
  target: DropTarget,
) => {
  const result = applyDrop(blocks, from, target);
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return {
    tree: page(result.blocks),
    path: result.path,
    blocks: result.blocks,
  };
};

const refusal = (
  blocks: readonly Block[],
  from: number[],
  target: DropTarget,
): DropRefusal => {
  const result = applyDrop(blocks, from, target);
  if (result.ok)
    throw new Error(`not refused: ${JSON.stringify(page(result.blocks))}`);
  return result.refusal;
};

describe("isLinearScope", () => {
  it("treats the page, stack, list and timeline as sequences", () => {
    const blocks = [
      box("S", [leaf("a")], "stack"),
      box("L", [leaf("b")], "list"),
      box("T", [leaf("c")], "timeline"),
      box("G", [leaf("d")], "grid"),
    ];
    expect(isLinearScope(blocks, [])).toBe(true);
    expect(isLinearScope(blocks, [0])).toBe(true);
    expect(isLinearScope(blocks, [1])).toBe(true);
    expect(isLinearScope(blocks, [2])).toBe(true);
    expect(isLinearScope(blocks, [3])).toBe(false);
  });
});

describe("insertAt", () => {
  it("splices a section between two others rather than overwriting", () => {
    const blocks = [box("A", [null]), box("C", [null])];
    expect(page(insertAt(blocks, [1], box("B", [null])))).toEqual([
      ["A", [null]],
      ["B", [null]],
      ["C", [null]],
    ]);
  });
});

describe("linear insertion on the page", () => {
  const sections = () => [
    box("A", [leaf("one")]),
    box("B", [leaf("two")]),
    box("C", [leaf("three")]),
  ];

  it("moves the first section after the last, which a swap cannot", () => {
    const result = dropped(sections(), [0], { kind: "after", path: [2] });
    expect(result.tree).toEqual([
      ["B", ["two"]],
      ["C", ["three"]],
      ["A", ["one"]],
    ]);
    expect(result.path).toEqual([2]);
  });

  it("moves the last section before the first, which a swap cannot", () => {
    const result = dropped(sections(), [2], { kind: "before", path: [0] });
    expect(result.tree).toEqual([
      ["C", ["three"]],
      ["A", ["one"]],
      ["B", ["two"]],
    ]);
    expect(result.path).toEqual([0]);
  });

  it("is a no-op on the bar of the same section and keeps the array identity", () => {
    const blocks = sections();
    const before = applyDrop(blocks, [1], { kind: "before", path: [1] });
    const after = applyDrop(blocks, [1], { kind: "after", path: [1] });
    expect(before).toEqual({ ok: true, blocks, path: [1] });
    expect(after).toEqual({ ok: true, blocks, path: [1] });
    expect(before.ok && before.blocks).toBe(blocks);
  });
});

describe("linear insertion inside a stack", () => {
  it("shifts across a neighbour rather than swapping with the far one", () => {
    const blocks = [box("S", [leaf("A"), leaf("B"), leaf("C")])];
    const result = dropped(blocks, [0, 0], { kind: "after", path: [0, 2] });
    expect(result.tree).toEqual([["S", ["B", "C", "A"]]]);
    expect(result.path).toEqual([0, 2]);
  });

  it("shifts an empty place along with the sequence", () => {
    const blocks = [box("S", [leaf("A"), null, leaf("C")])];
    expect(
      dropped(blocks, [0, 0], { kind: "after", path: [0, 2] }).tree,
    ).toEqual([["S", [null, "C", "A"]]]);
  });
});

describe("positional place drops still swap and keep holes", () => {
  it("swaps two occupied grid places without shifting the middle hole", () => {
    const blocks = [box("G", [leaf("A"), null, leaf("C")], "grid")];
    const result = dropped(blocks, [0, 0], { kind: "place", path: [0, 2] });
    expect(result.tree).toEqual([["G", ["C", null, "A"]]]);
    expect(result.path).toEqual([0, 2]);
  });

  it("refuses a before-bar on a grid, so the linear rule cannot leak", () => {
    const blocks = [box("G", [leaf("A"), leaf("B"), leaf("C")], "grid")];
    expect(refusal(blocks, [0, 0], { kind: "after", path: [0, 2] })).toBe(
      "no such place",
    );
  });
});

describe("leaving a grid for a stack keeps the hole behind", () => {
  it("clears the source place and inserts after the stack sibling", () => {
    const blocks = [
      box("G", [leaf("A"), leaf("keep")], "grid"),
      box("S", [leaf("B"), leaf("C")]),
    ];
    const result = dropped(blocks, [0, 0], { kind: "after", path: [1, 1] });
    expect(result.tree).toEqual([
      ["G", [null, "keep"]],
      ["S", ["B", "C", "A"]],
    ]);
    expect(result.path).toEqual([1, 2]);
  });
});

describe("leaving a stack for a later section adjusts the dest path", () => {
  it("decrements the destination section after removing an earlier one", () => {
    const blocks = [
      box("S", [leaf("A"), leaf("stay")]),
      box("T", [leaf("B"), leaf("C")]),
    ];
    const result = dropped(blocks, [0], { kind: "after", path: [1, 1] });
    expect(result.tree).toEqual([["T", ["B", "C", ["S", ["A", "stay"]]]]]);
    expect(result.path).toEqual([0, 2]);
  });
});

describe("refusals", () => {
  it("refuses a stale path", () => {
    const blocks = [box("S", [leaf("A")])];
    expect(refusal(blocks, [0, 4], { kind: "after", path: [0, 0] })).toBe(
      "no such place",
    );
  });

  it("refuses dropping a container into its own descendant", () => {
    const blocks = [box("S", [leaf("A"), box("N", [leaf("x")])])];
    expect(refusal(blocks, [0], { kind: "after", path: [0, 1] })).toBe(
      "into itself",
    );
  });

  it("refuses a subtree that would sit past the depth cap", () => {
    const tall = box("A", [box("N", [leaf("x")])]);
    const nest = box("B", [box("M", [box("P", [null])])]);
    expect(
      refusal([tall, nest], [0], { kind: "before", path: [1, 0, 0] }),
    ).toBe("too deep");
  });

  // Reachable only cross-parent: `sameParent` is what gates this refusal in
  // `applyLinearDrop`, and a SIBLING drop — the only kind `applySiblingDrop`
  // ever constructs — always has `sameParent` true by construction, so this
  // is a case `dropped`/`refusal` can build directly through `applyDrop`
  // but a canvas or inspector sibling drag can never reach.
  //
  // SABOTAGE-VERIFIED, and it found `applyLinearDrop` carried a SECOND
  // "too many" check (`parent.length > 0 && nextLength >= BLOCK_LIMITS.children`)
  // that was fully subsumed by this one (`!sameParent && destParent.length >
  // 0 && destLength + 1 > BLOCK_LIMITS.children`): removing the source from
  // an unrelated subtree never changes the destination container's own
  // child count, so `nextLength` always equalled `destLength` for a
  // cross-parent drop and the two conditions were the same predicate spelled
  // two ways. Sabotaging the early check alone did not redden this case —
  // the later, unreachable one caught it anyway — which is what proved the
  // second check dead rather than merely redundant with a different fixture.
  // A companion branch reachable only when `from.length === 1 && parent.length
  // === 0` was dead for the same underlying reason: that combination implies
  // `sameParent`, which is already excluded by the time either branch runs.
  // Both were removed from `applyLinearDrop` (they had no test able to
  // discriminate them, and `pnpm --filter hub test:coverage` is what forced
  // the question) rather than left in place — see the feature note's account
  // for the full proof.
  it("refuses a cross-container insert that would overflow the destination's children cap", () => {
    const full = box(
      "Full",
      Array.from({ length: BLOCK_LIMITS.children }, (_, i) => leaf(`t${i}`)),
    );
    const source = box("Source", [leaf("mover")]);
    const blocks = [full, source];
    expect(
      refusal(blocks, [1, 0], {
        kind: "after",
        path: [0, BLOCK_LIMITS.children - 1],
      }),
    ).toBe("too many");
  });

  // `placeExists` guards `applyLinearDrop` at both ends (`from` and
  // `target.path`), and nothing in this file had reached its empty-path,
  // negative-index or non-container-parent arms before these three — every
  // other fixture here builds a path from a real selection, never a raw
  // literal.
  it("refuses an empty path, naming neither the page nor any place in it", () => {
    const blocks = [box("S", [leaf("A")])];
    expect(refusal(blocks, [], { kind: "after", path: [0, 0] })).toBe(
      "no such place",
    );
  });

  it("refuses a negative top-level index", () => {
    const blocks = [box("S", [leaf("A")])];
    expect(refusal(blocks, [-1], { kind: "after", path: [0, 0] })).toBe(
      "no such place",
    );
  });

  it("refuses a target path that walks through a leaf as though it were a container", () => {
    const blocks = [leaf("A")];
    expect(refusal(blocks, [0], { kind: "after", path: [0, 0] })).toBe(
      "no such place",
    );
  });

  // `placeExists` reports an EMPTY place as existing — the index is in the
  // array whatever it holds — so `applyLinearDrop` still has to notice that
  // what it fetched with `blockAt` is `null` before treating it as the
  // block being moved. Nothing here had dragged FROM an empty place before
  // this case.
  it("refuses moving an empty place, rather than moving nothing", () => {
    const blocks = [box("S", [null, leaf("B")])];
    expect(refusal(blocks, [0, 0], { kind: "after", path: [0, 1] })).toBe(
      "no such place",
    );
  });

  // `applyDrop`'s `place` branch hands off to `moveBlock` and returns its
  // refusal unchanged — every other case in this file drives a `place`
  // drop that SUCCEEDS, so this is the first to exercise that hand-off
  // failing.
  it("passes a positional refusal straight through applyDrop", () => {
    const blocks = [box("S", [leaf("A"), box("N", [leaf("x")])])];
    expect(refusal(blocks, [0], { kind: "place", path: [0, 1] })).toBe(
      "into itself",
    );
  });
});

describe("sibling hover conversion", () => {
  it("turns a later stack sibling into an after-bar, not a swap", () => {
    const blocks = [box("S", [leaf("A"), leaf("B"), leaf("C")])];
    const result = applyDrop(
      blocks,
      [0, 0],
      dropTargetForSibling(blocks, [0, 0], [0, 2])!,
    );
    expect(result.ok && page(result.blocks)).toEqual([["S", ["B", "C", "A"]]]);
  });

  it("keeps a grid hover as a place so the hole survives", () => {
    const blocks = [box("G", [leaf("A"), null, leaf("C")], "grid")];
    expect(dropTargetForSibling(blocks, [0, 0], [0, 2])).toEqual({
      kind: "place",
      path: [0, 2],
    });
  });

  // The case above only ever hovers a LATER sibling (`fromIndex < toIndex`),
  // which is the "after" arm. Hovering an EARLIER one is the "before" arm,
  // and nothing in this file exercised it before this case.
  it("turns an earlier stack sibling into a before-bar", () => {
    const blocks = [box("S", [leaf("A"), leaf("B"), leaf("C")])];
    expect(dropTargetForSibling(blocks, [0, 2], [0, 0])).toEqual({
      kind: "before",
      path: [0, 0],
    });
  });

  // Every caller in this app already checks `areSiblingPaths` at the sensor
  // before ever reaching `dropTargetForSibling`, so its own repeat of that
  // check — and `applySiblingDrop`'s `null` answer when it fails — had no
  // case built directly against it: every fixture elsewhere in this file
  // passes two genuine siblings. Called directly with paths that cross
  // parents, both answer null rather than inventing a target.
  it("answers null for two paths that are not siblings", () => {
    const blocks = [box("S", [leaf("A")]), box("T", [leaf("B")])];
    expect(dropTargetForSibling(blocks, [0, 0], [1, 0])).toBeNull();
    expect(applySiblingDrop(blocks, [0, 0], [1, 0])).toBeNull();
  });

  // Every other case in this file drives a genuine sibling hover through
  // `dropTargetForSibling` and `applyDrop` as two separate calls — nothing
  // called `applySiblingDrop` itself with two paths that ARE siblings, so its
  // own hand-off (`target ? applyDrop(...) : null`) had no case reaching the
  // `target` arm. This is that case: it asserts `applySiblingDrop` answers
  // exactly what the two-call form does, for the same from/to pair the first
  // case in this describe block already uses.
  it("hands a genuine sibling hover through to applyDrop", () => {
    const blocks = [box("S", [leaf("A"), leaf("B"), leaf("C")])];
    const target = dropTargetForSibling(blocks, [0, 0], [0, 2]);
    expect(applySiblingDrop(blocks, [0, 0], [0, 2])).toEqual(
      applyDrop(blocks, [0, 0], target!),
    );
  });
});
