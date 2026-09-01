import { describe, expect, it } from "vitest";
import {
  formatBlockPath,
  parseBlockPath,
  sameSelection,
  type EditorSelection,
} from "@/features/actors/domain/editor-selection";

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
