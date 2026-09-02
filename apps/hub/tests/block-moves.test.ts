import { describe, expect, it } from "vitest";
import {
  moveBlock,
  moveSiblingBlock,
  type MoveRefusal,
} from "@/features/actors/domain/block-moves";
import {
  blocksSchema,
  BLOCK_LIMITS,
  CONTAINER_KIND,
  isContainer,
  type Block,
  type ContainerBlock,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";

// WHAT THIS SUITE IS FOR.
//
// A drag is a source path, a target path, a tree in and a tree out. Nothing
// here touches a library or a DOM, deliberately: the semantics are settled
// before the drag layer arrives so that it has nothing left to decide, and the
// three rulings it has to honour are the three this suite states.
//
// The rulings, from `2026-08-18-dragging-design.md` §1:
//
//   * onto an empty place it is a MOVE — the source place is left empty;
//   * onto an occupied place it is a SWAP — exactly two things change;
//   * between two sections it is a SHIFT — an ordinary list reorder.
//
// And the THREE refusals, which are refusals rather than clamps: a container
// may never move into its own descendant, a move past the depth cap is
// refused, and a path naming no place at all — what a stale drag produces — is
// refused rather than repaired. `MoveRefusal` (`block-moves.ts:29`) names all
// three, and each answers a value the caller must handle: a caller that could
// not tell a refusal from a no-op would have nothing to say to the person who
// made the drag. This comment said "two" for a while, with a seven-case
// `describe` for the third one further down the same file.

/** A leaf, named so an assertion can say which one it is looking at. */
const leaf = (title: string): LeafBlock => ({
  kind: "text",
  title_en: title,
  description_en: "",
});

/** A container, named the same way, laying as many places as it holds. */
const box = (name: string, children: (Block | null)[]): ContainerBlock => ({
  kind: CONTAINER_KIND,
  mode: "grid",
  spaces: Math.min(BLOCK_LIMITS.spaces, Math.max(1, children.length)),
  name_en: name,
  children,
});

/** One block as its name, and a container as its name and its places. */
const shape = (block: Block | null): unknown => {
  if (block === null) return null;
  return isContainer(block)
    ? [block.name_en, block.children.map((child) => shape(child))]
    : block.title_en;
};

/** A whole page as names and places, which is what every case compares. */
const page = (blocks: readonly Block[]): unknown[] =>
  blocks.map((block) => shape(block));

/** The moved page, failing loudly rather than silently on a refusal. */
const moved = (blocks: readonly Block[], from: number[], to: number[]) => {
  const result = moveBlock(blocks, from, to);
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return page(result.blocks);
};

/** Why a move was refused, failing loudly when it was not refused at all. */
const refusal = (
  blocks: readonly Block[],
  from: number[],
  to: number[],
): MoveRefusal => {
  const result = moveBlock(blocks, from, to);
  if (result.ok)
    throw new Error(`not refused: ${JSON.stringify(page(result.blocks))}`);
  return result.refusal;
};

describe("inspector sibling boundary", () => {
  it("moves siblings through the existing semantics", () => {
    const blocks = [box("A", [leaf("one"), null, leaf("two")])];
    const result = moveSiblingBlock(blocks, [0, 0], [0, 2]);
    expect(result?.ok).toBe(true);
    expect(result?.ok && page(result.blocks)).toEqual([
      ["A", ["two", null, "one"]],
    ]);
  });

  it("ignores synthetic cross-level final over targets before moveBlock can exchange them", () => {
    const blocks = [box("A", [leaf("one"), box("N", [null])])];
    expect(moveSiblingBlock(blocks, [0, 0], [0, 1, 0])).toBeNull();
    expect(moveSiblingBlock(blocks, [0], [0, 0])).toBeNull();
    expect(page(blocks)).toEqual([["A", ["one", ["N", [null]]]]]);
  });
});

describe("moving onto an empty place", () => {
  it("leaves the place it came from empty, and keeps its position", () => {
    const blocks = [box("A", [leaf("one"), null, leaf("two")])];
    expect(moved(blocks, [0, 0], [0, 1])).toEqual([
      ["A", [null, "one", "two"]],
    ]);
  });

  it("carries a block into another section", () => {
    const blocks = [
      box("A", [leaf("one"), null]),
      box("B", [null, leaf("two")]),
    ];
    expect(moved(blocks, [0, 0], [1, 0])).toEqual([
      ["A", [null, null]],
      ["B", ["one", "two"]],
    ]);
  });

  it("carries a block into a container nested inside a section", () => {
    const blocks = [box("A", [leaf("one"), box("N", [null])])];
    expect(moved(blocks, [0, 0], [0, 1, 0])).toEqual([
      ["A", [null, ["N", ["one"]]]],
    ]);
  });

  it("closes the page's own list when a SECTION is the thing that moved", () => {
    const blocks = [box("A", [null]), box("B", [null, leaf("two")])];
    expect(moved(blocks, [1], [0, 0])).toEqual([["A", [["B", [null, "two"]]]]]);
  });

  it("moves the other way when the place dragged FROM is the empty one", () => {
    const blocks = [box("A", [null, leaf("one")])];
    expect(moved(blocks, [0, 0], [0, 1])).toEqual([["A", ["one", null]]]);
  });

  it("pulls a section down into the empty place it was dragged from", () => {
    // **The section removed sits BEFORE the section the empty place is in**,
    // which is what gives this case power: closing the page's list moves every
    // section after it up, so writing the other half of the exchange first is
    // the only order that lands. With the writes the other way round the
    // section escapes back to the top level and the empty place stays empty,
    // and every arrangement where the removal comes last passes regardless.
    const blocks = [box("A", [leaf("one")]), box("B", [null, leaf("two")])];
    expect(moved(blocks, [1, 0], [0])).toEqual([
      ["B", [["A", ["one"]], "two"]],
    ]);
  });

  it("does not touch the tree it was given", () => {
    const blocks = [box("A", [leaf("one"), null])];
    const before = page(blocks);
    moveBlock(blocks, [0, 0], [0, 1]);
    expect(page(blocks)).toEqual(before);
  });
});

describe("moving onto an occupied place", () => {
  it("swaps exactly two things and moves nothing else", () => {
    const blocks = [
      box("A", [leaf("one"), null, leaf("two")]),
      box("B", [leaf("three")]),
    ];
    expect(moved(blocks, [0, 0], [0, 2])).toEqual([
      ["A", ["two", null, "one"]],
      ["B", ["three"]],
    ]);
  });

  it("swaps across sections and across depths", () => {
    const blocks = [
      box("A", [leaf("one")]),
      box("B", [box("N", [leaf("deep")])]),
    ];
    expect(moved(blocks, [0, 0], [1, 0, 0])).toEqual([
      ["A", ["deep"]],
      ["B", [["N", ["one"]]]],
    ]);
  });

  it("swaps a section with the block that was in the place it took", () => {
    const blocks = [box("A", [leaf("one"), null]), box("B", [leaf("two")])];
    // The displaced leaf lands at the top level, which the schema admits and
    // the editor already draws — see `moveBlock`'s own note.
    expect(moved(blocks, [1], [0, 0])).toEqual([
      ["A", [["B", ["two"]], null]],
      "one",
    ]);
  });
});

describe("sections at the top level", () => {
  const blocks = [
    box("A", [leaf("one")]),
    box("B", [leaf("two")]),
    box("C", [leaf("three")]),
  ];

  it("shifts forward rather than swapping", () => {
    expect(moved(blocks, [0], [2])).toEqual([
      ["B", ["two"]],
      ["C", ["three"]],
      ["A", ["one"]],
    ]);
  });

  it("shifts backward rather than swapping", () => {
    expect(moved(blocks, [2], [0])).toEqual([
      ["C", ["three"]],
      ["A", ["one"]],
      ["B", ["two"]],
    ]);
  });
});

describe("a place onto itself", () => {
  it("answers the very tree it was given", () => {
    const blocks = [box("A", [leaf("one"), null])];
    const result = moveBlock(blocks, [0, 1], [0, 1]);
    expect(result).toEqual({ ok: true, blocks });
    expect(result.ok && result.blocks).toBe(blocks);
  });

  it("is a success, where a refusal is not — a caller can tell them apart", () => {
    const blocks = [box("A", [leaf("one")])];
    expect(moveBlock(blocks, [0], [0])).toEqual({ ok: true, blocks });
    expect(moveBlock(blocks, [0], [0, 0])).toEqual({
      ok: false,
      refusal: "into itself",
    });
  });
});

describe("a container may not move into its own descendant", () => {
  it("refuses a section dropped into one of its own places", () => {
    const blocks = [box("A", [leaf("one"), null])];
    expect(refusal(blocks, [0], [0, 1])).toBe("into itself");
  });

  it("refuses a block dropped onto its own ancestor", () => {
    const blocks = [box("A", [box("N", [leaf("one")])])];
    expect(refusal(blocks, [0, 0], [0])).toBe("into itself");
  });

  it("allows a deeper place that is not underneath it at all", () => {
    const blocks = [
      box("A", [leaf("one"), leaf("two")]),
      box("B", [box("N", [null])]),
    ];
    expect(moved(blocks, [0, 1], [1, 0, 0])).toEqual([
      ["A", ["one", null]],
      ["B", [["N", ["two"]]]],
    ]);
  });
});

describe("the depth cap", () => {
  /** A section two levels tall: itself, a container, and a leaf under that. */
  const tall = box("A", [box("N", [leaf("x")])]);

  it("refuses a subtree too tall for the place it was dropped in", () => {
    const blocks = [tall, box("B", [box("M", [null])])];
    expect(refusal(blocks, [0], [1, 0, 0])).toBe("too deep");
  });

  it("refuses when the DISPLACED block is the one that would not fit", () => {
    const blocks = [tall, box("B", [box("M", [box("P", [null])])])];
    expect(refusal(blocks, [0, 0, 0], [1, 0])).toBe("too deep");
  });

  it("allows a move that lands exactly at the cap, and the page still parses", () => {
    const blocks = [tall, box("B", [box("M", [null])])];
    const result = moveBlock(blocks, [0, 0], [1, 0, 0]);
    expect(result.ok && page(result.blocks)).toEqual([
      ["A", [null]],
      ["B", [["M", [["N", ["x"]]]]]],
    ]);
    expect(blocksSchema.safeParse(result.ok && result.blocks).success).toBe(
      true,
    );
  });
});

describe("a path that names no place", () => {
  const blocks = [box("A", [leaf("one"), null])];

  it("refuses the page itself as a source", () => {
    expect(refusal(blocks, [], [0])).toBe("no such place");
  });

  it("refuses the page itself as a target", () => {
    expect(refusal(blocks, [0], [])).toBe("no such place");
  });

  it("refuses a negative index", () => {
    expect(refusal(blocks, [-1], [0])).toBe("no such place");
  });

  it("refuses an index past the end", () => {
    expect(refusal(blocks, [5], [0])).toBe("no such place");
  });

  it("refuses a path that runs through a leaf", () => {
    expect(refusal(blocks, [0, 0, 0], [0, 0])).toBe("no such place");
  });

  it("refuses a path that runs through a place holding nothing", () => {
    expect(refusal(blocks, [0, 1, 0], [0, 0])).toBe("no such place");
  });

  it("refuses a target that names no place, given a source that does", () => {
    expect(refusal(blocks, [0, 0], [0, 9])).toBe("no such place");
  });
});
