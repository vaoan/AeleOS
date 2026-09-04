import { describe, expect, it } from "vitest";
import { addTargetFor } from "@/features/actors/domain/add-target";
import { newContainer, newLeaf } from "@/features/actors/domain/block-edits";
import {
  CONTAINER_KIND,
  type Block,
  type ContainerBlock,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";

// One selection, one target — this is what `EditorToolbar`'s single Add
// control asks on every render, so each case here is a selection kind that
// mount used to compute a scope-specific target for.

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

describe("addTargetFor", () => {
  it("targets the page root when nothing is selected", () => {
    const blocks = [stack([text("a")])];
    const result = addTargetFor(blocks, null);
    expect(result.targetPath).toEqual([]);
  });

  it("targets the page root when Page is explicitly selected", () => {
    const blocks = [stack([text("a")])];
    const result = addTargetFor(blocks, { kind: "page" });
    expect(result.targetPath).toEqual([]);
  });

  it("targets the container itself when a container is selected — append inside", () => {
    const blocks = [stack([text("a")])];
    const result = addTargetFor(blocks, { kind: "block", path: [0] });
    expect(result.targetPath).toEqual([0]);
  });

  it("targets the leaf's own parent when a leaf is selected — insert after", () => {
    const blocks = [stack([text("a"), text("b")])];
    const result = addTargetFor(blocks, { kind: "block", path: [0, 1] });
    // Adding "after" a leaf inside a container is defined here as appending
    // to that leaf's own parent container — see `addTargetFor`'s own TSDoc
    // for why a literal positional "after index N" has no meaning for a
    // positional (grid/masonry/etc.) container, where `addTargetFor`'s
    // `targetPath` is deliberately the PARENT, not a computed insertion
    // index.
    expect(result.targetPath).toEqual([0]);
  });

  // The deepest CONTAINER a page can hold sits at path length 3 — a section,
  // a container inside it, a container inside that — because a fourth level
  // would exceed MAX_DEPTH and admit only leaves. Selecting that innermost
  // container and asking whether IT may hold a nested layout is the
  // question this refuses: the answer is about the CHILD's depth, one level
  // past the selection, not about the selection's own.
  it("refuses to offer a layout option past the depth cap", () => {
    const deep = stack([stack([stack([text("leaf")])])]);
    const blocks = [deep];
    const result = addTargetFor(blocks, { kind: "block", path: [0, 0, 0] });
    expect(result.targetPath).toEqual([0, 0, 0]);
    expect(result.mayAddLayout).toBe(false);
  });

  it("still offers a layout option one level shallower than the cap", () => {
    const shallower = stack([stack([text("leaf")])]);
    const blocks = [shallower];
    const result = addTargetFor(blocks, { kind: "block", path: [0, 0] });
    expect(result.mayAddLayout).toBe(true);
  });
});
