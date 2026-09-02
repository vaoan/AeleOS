import { describe, expect, it } from "vitest";
import {
  areSiblingPaths,
  formatBlockPath,
  parentSelection,
  parseBlockPath,
  repairSelection,
  sameSelection,
  siblingTarget,
  type EditorSelection,
} from "@/features/actors/domain/editor-selection";
import { newContainer, newLeaf } from "@/features/actors/domain/block-edits";

describe("parseBlockPath", () => {
  it("reads dotted positions and refuses junk", () => {
    expect(parseBlockPath("0")).toEqual([0]);
    expect(parseBlockPath("2-0-1")).toEqual([2, 0, 1]);
    expect(parseBlockPath("")).toBeUndefined();
    expect(parseBlockPath("0-x")).toBeUndefined();
    expect(parseBlockPath("-1")).toBeUndefined();
  });
});

describe("formatBlockPath", () => {
  it("round-trips what parse accepts", () => {
    expect(formatBlockPath([0])).toBe("0");
    expect(formatBlockPath([2, 0, 1])).toBe("2-0-1");
    expect(parseBlockPath(formatBlockPath([4, 1]))).toEqual([4, 1]);
  });
});

describe("sameSelection", () => {
  it("treats page and a block as different, and matches equal paths", () => {
    const page: EditorSelection = { kind: "page" };
    const block: EditorSelection = { kind: "block", path: [0, 1] };
    expect(sameSelection(null, null)).toBe(true);
    expect(sameSelection(page, { kind: "page" })).toBe(true);
    expect(sameSelection(block, { kind: "block", path: [0, 1] })).toBe(true);
    expect(sameSelection(page, block)).toBe(false);
    expect(sameSelection(block, { kind: "block", path: [0] })).toBe(false);
    expect(sameSelection(null, page)).toBe(false);
  });
});

describe("parentSelection", () => {
  it("clears Page, returns Page from a top-level block, and removes one nested position", () => {
    expect(parentSelection({ kind: "page" })).toBeNull();
    expect(parentSelection({ kind: "block", path: [2] })).toEqual({
      kind: "page",
    });
    expect(parentSelection({ kind: "block", path: [2, 1, 0] })).toEqual({
      kind: "block",
      path: [2, 1],
    });
  });
});

describe("repairSelection", () => {
  it("keeps a resolving path and otherwise returns its closest surviving ancestor", () => {
    const page = [
      {
        ...newContainer("grid", 2),
        children: [
          {
            ...newContainer("stack", 1),
            children: [newLeaf("text")],
          },
          null,
        ],
      },
    ];

    expect(repairSelection(page, { kind: "block", path: [0, 0, 0] })).toEqual({
      kind: "block",
      path: [0, 0, 0],
    });
    expect(repairSelection(page, { kind: "block", path: [0, 0, 7] })).toEqual({
      kind: "block",
      path: [0, 0],
    });
    expect(repairSelection(page, { kind: "block", path: [7, 0] })).toEqual({
      kind: "page",
    });
  });

  it("leaves Page and deselection unchanged", () => {
    expect(repairSelection([], null)).toBeNull();
    expect(repairSelection([], { kind: "page" })).toEqual({ kind: "page" });
  });
});

describe("areSiblingPaths", () => {
  it("accepts only two positions owned by the same immediate parent", () => {
    expect(areSiblingPaths([0], [2])).toBe(true);
    expect(areSiblingPaths([1, 0, 2], [1, 0, 5])).toBe(true);
    expect(areSiblingPaths([0], [0, 1])).toBe(false);
    expect(areSiblingPaths([1, 0], [2, 1])).toBe(false);
    expect(areSiblingPaths([], [])).toBe(false);
  });
});

describe("siblingTarget", () => {
  it("accepts a pointer or keyboard target under the active parent", () => {
    expect(siblingTarget([1, 0], [1, 2])).toEqual([1, 2]);
  });

  it("drops synthetic and stale cross-level keyboard or over targets", () => {
    expect(siblingTarget([1, 0], [2, 0])).toBeUndefined();
    expect(siblingTarget([1, 0], [1, 2, 0])).toBeUndefined();
    expect(siblingTarget([1, 0], undefined)).toBeUndefined();
  });
});
