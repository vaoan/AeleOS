import { describe, expect, it } from "vitest";
import {
  insertBlockAt,
  type InsertResult,
} from "@/features/actors/domain/palette-insert";
import { newContainer, newLeaf } from "@/features/actors/domain/block-edits";
import {
  BLOCK_LIMITS,
  CONTAINER_KIND,
  isContainer,
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
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(isContainer(result.blocks[0]!)).toBe(true);
    expect((result.blocks[0] as ContainerBlock).children).toEqual([
      expect.objectContaining({ title_en: "hello" }),
    ]);
  });

  it("inserts a leaf directly into an existing container's own place, unwrapped", () => {
    // Excludes "every leaf gets wrapped, even one that lands inside an
    // existing container" — only a page-root leaf needs wrapping.
    const grid = container("grid", 2, [null, null]);
    const result = insertBlockAt([grid], [0, 0], text("hi"));
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    const inserted = (result.blocks[0] as ContainerBlock).children[0];
    expect(inserted).toEqual(expect.objectContaining({ title_en: "hi" }));
  });

  it("refuses a container landing past the depth cap", () => {
    // Build a target path at MAX_DEPTH nesting; excludes "the cap is
    // enforced by insertTargetsFor alone and this function trusts its
    // caller" — this function must refuse independently, since a stale
    // target computed before an intervening edit could still reach it.
    // Three nested `stack`s: `outer` at [0], `middle` at [0, 0], `deepest`
    // at [0, 0, 0] — the deepest a container may legally sit. Inserting a
    // fourth container inside `deepest`'s own children, at [0, 0, 0, 0],
    // is one level past MAX_DEPTH (3).
    const deepest = stack([]);
    const middle = stack([deepest]);
    const outer = stack([middle]);
    const result: InsertResult = insertBlockAt(
      [outer],
      [0, 0, 0, 0],
      container("grid", 2, []),
    );
    expect(result).toEqual({ ok: false, reason: "too deep" });
  });

  it("refuses when the destination container is already at BLOCK_LIMITS.children", () => {
    const full = container(
      "grid",
      BLOCK_LIMITS.children,
      Array.from({ length: BLOCK_LIMITS.children }, () => null),
    );
    const result = insertBlockAt([full], [0, 0], text("one too many"));
    expect(result).toEqual({ ok: false, reason: "too many" });
  });

  it("refuses when a page-root insert would cross BLOCK_LIMITS.blocks, counting the wrap", () => {
    // Excludes "the wrapper container itself is not counted toward the cap".
    // 499 top-level sections, each a single block, leaves room for exactly
    // one more block — but a bare-leaf insert at the page root costs TWO
    // (the new stack wrapper plus the leaf inside it), which crosses 500.
    const nearlyFull = Array.from({ length: BLOCK_LIMITS.blocks - 1 }, () =>
      stack([]),
    );
    const result = insertBlockAt(nearlyFull, [0], text("one too many"));
    expect(result).toEqual({ ok: false, reason: "too many" });
  });
});
