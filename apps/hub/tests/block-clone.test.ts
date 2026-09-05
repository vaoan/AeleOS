import { describe, expect, it } from "vitest";
import { cloneAt } from "@/features/actors/domain/block-clone";
import {
  BLOCK_LIMITS,
  CONTAINER_KIND,
  MAX_DEPTH,
  isContainer,
  type Block,
  type ContainerBlock,
  type ContainerMode,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";

// WHAT THIS SUITE IS FOR.
//
// A clone lands immediately after its source, in the same parent — a
// sibling insert, which shares its source's own path LENGTH. `fitsAt`
// therefore refuses a clone only when the source itself sits somewhere an
// ordinary edit could never have put it, so the "too deep" case has to
// build a subtree deeper than `MAX_DEPTH` by hand rather than reuse a shape
// this editor's own controls could ever have produced.

const leaf = (title: string): LeafBlock => ({
  kind: "text",
  title_en: title,
  description_en: "",
});

const stack = (
  name: string,
  children: (Block | null)[],
  mode: ContainerMode = "stack",
): ContainerBlock => ({
  kind: CONTAINER_KIND,
  mode,
  spaces: Math.max(1, children.length),
  name_en: name,
  children,
});

/**
 * A container nested `levels` deep, each holding exactly the next — deeper
 * than {@link MAX_DEPTH} admits through `mayNest`, built directly rather
 * than through any editor operation so `cloneAt`'s own `fitsAt` guard can be
 * exercised in isolation.
 *
 * @param levels - how many containers deep, the innermost holding a leaf.
 * @returns the outermost container.
 */
function nested(levels: number): ContainerBlock {
  let inner: Block = leaf("bottom");
  for (let at = 0; at < levels; at += 1) {
    inner = stack(`level-${levels - at}`, [inner]);
  }
  return inner as ContainerBlock;
}

const shape = (block: Block | null): unknown => {
  if (block === null) return null;
  return isContainer(block)
    ? [block.name_en, block.children.map((child) => shape(child))]
    : block.title_en;
};

describe("cloneAt", () => {
  it("duplicates a block immediately after itself in its parent", () => {
    const blocks: Block[] = [stack("outer", [leaf("a"), leaf("b")])];
    const result = cloneAt(blocks, [0, 0]);
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(shape(result.blocks[0]!)).toEqual(["outer", ["a", "a", "b"]]);
    expect(result.path).toEqual([0, 1]);
  });

  it("selects the same copy whichever position it duplicates", () => {
    const blocks: Block[] = [stack("outer", [leaf("a"), leaf("b")])];
    const result = cloneAt(blocks, [0, 1]);
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(shape(result.blocks[0]!)).toEqual(["outer", ["a", "b", "b"]]);
    expect(result.path).toEqual([0, 2]);
  });

  it("clones a top-level section immediately after itself", () => {
    const blocks: Block[] = [stack("first", [leaf("a")]), stack("second", [])];
    const result = cloneAt(blocks, [0]);
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.blocks.map((block) => shape(block))).toEqual([
      ["first", ["a"]],
      ["first", ["a"]],
      ["second", []],
    ]);
    expect(result.path).toEqual([1]);
  });

  it("answers the page unchanged, by identity, when the path names nothing", () => {
    const blocks: Block[] = [stack("outer", [null])];
    const result = cloneAt(blocks, [0, 0]);
    expect(result).toEqual({ ok: true, blocks, path: [0, 0] });
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.blocks).toBe(blocks);
  });

  it("refuses when the parent is already at the children cap", () => {
    const full = stack(
      "outer",
      Array.from({ length: BLOCK_LIMITS.children }, (_, i) => leaf(`t${i}`)),
    );
    const result = cloneAt([full], [0, 0]);
    expect(result).toEqual({ ok: false, reason: "too many" });
  });

  it("refuses at the page root once the whole-page block cap would be crossed", () => {
    // The subtree being cloned carries enough of its OWN descendants that
    // duplicating it — rather than the page's top-level length — is what
    // crosses `BLOCK_LIMITS.blocks`. A per-container check would miss this:
    // the page root has no `children` cap of its own.
    const heavy = stack(
      "heavy",
      Array.from({ length: BLOCK_LIMITS.blocks - 1 }, (_, i) => leaf(`t${i}`)),
    );
    const result = cloneAt([heavy], [0]);
    expect(result).toEqual({ ok: false, reason: "too many" });
  });

  it("refuses when the cloned subtree would not fit at the destination depth", () => {
    // `nested(MAX_DEPTH + 1)` has no valid position at ANY depth in this
    // model — `fitsAt` refuses it even at the page root (path length 1),
    // which is exactly the guard this case is proving: cloning cannot smuggle
    // through a subtree the domain's own depth arithmetic already refuses.
    const deep = nested(MAX_DEPTH + 1);
    const result = cloneAt([deep, stack("sibling", [])], [0]);
    expect(result).toEqual({ ok: false, reason: "too deep" });
  });

  it("fits a subtree that reaches exactly to the depth cap", () => {
    const atCap = nested(MAX_DEPTH);
    const result = cloneAt([atCap], [0]);
    expect(result.ok).toBe(true);
  });
});
