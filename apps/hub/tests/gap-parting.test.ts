import { describe, expect, it } from "vitest";
import {
  GAP_HEIGHT_MAX,
  GAP_HEIGHT_MIN,
  GAP_REACH,
  reachesPoint,
  gapHeightFor,
  gapSlotFor,
  frozenRect,
} from "@/features/actors/domain/gap-parting";
import {
  BLOCK_LIMITS,
  CONTAINER_KIND,
  type Block,
  type ContainerBlock,
  type ContainerMode,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";

// WHAT THIS SUITE IS FOR.
//
// A gap opens only where an insert SHIFTS the rest: the page's own list and
// the linear modes. A grid keeps its places, so a gap there would draw a
// shift the drop never makes. `after` a sibling that has a next sibling is
// the SAME gap as `before` that next one, and must open in one place only,
// or two slots would both open across one boundary.

const leaf = (title: string): LeafBlock => ({
  kind: "text",
  title_en: title,
  description_en: "",
});

const box = (
  children: (Block | null)[],
  mode: ContainerMode = "stack",
): ContainerBlock => ({
  kind: CONTAINER_KIND,
  mode,
  spaces: Math.min(BLOCK_LIMITS.spaces, Math.max(1, children.length)),
  name_en: "Box",
  children,
});

const page: Block[] = [
  box([leaf("A"), leaf("B"), leaf("C")], "stack"),
  box([leaf("D"), null, leaf("F")], "grid"),
  leaf("Tail"),
];

describe("gapSlotFor", () => {
  it("answers nothing without a target", () => {
    expect(gapSlotFor(page, null)).toBeNull();
  });

  it("answers nothing for a place, which never shifts anything", () => {
    expect(gapSlotFor(page, { kind: "place", path: [0, 1] })).toBeNull();
  });

  it("opens above the sibling a before names, in a linear container", () => {
    expect(gapSlotFor(page, { kind: "before", path: [0, 1] })).toEqual({
      path: [0, 1],
      edge: "top",
    });
  });

  it("opens an after as the next sibling's top, so one boundary has one gap", () => {
    expect(gapSlotFor(page, { kind: "after", path: [0, 0] })).toEqual({
      path: [0, 1],
      edge: "top",
    });
  });

  it("opens an after on the last sibling at its own bottom", () => {
    expect(gapSlotFor(page, { kind: "after", path: [0, 2] })).toEqual({
      path: [0, 2],
      edge: "bottom",
    });
  });

  it("treats the page's own list as linear", () => {
    expect(gapSlotFor(page, { kind: "before", path: [1] })).toEqual({
      path: [1],
      edge: "top",
    });
    expect(gapSlotFor(page, { kind: "after", path: [2] })).toEqual({
      path: [2],
      edge: "bottom",
    });
  });

  it("opens nothing inside a grid, whose places do not shift", () => {
    expect(gapSlotFor(page, { kind: "before", path: [1, 2] })).toBeNull();
    expect(gapSlotFor(page, { kind: "after", path: [1, 0] })).toBeNull();
  });

  it("answers nothing for a path whose parent does not exist", () => {
    expect(gapSlotFor(page, { kind: "before", path: [7, 0] })).toBeNull();
    expect(gapSlotFor(page, { kind: "before", path: [2, 0] })).toBeNull();
  });
});

describe("gapHeightFor", () => {
  it("keeps a height inside the bounds, rounded", () => {
    expect(gapHeightFor(90.6)).toBe(91);
  });

  it("raises a tiny or unmeasured block to the floor", () => {
    expect(gapHeightFor(4)).toBe(GAP_HEIGHT_MIN);
    expect(gapHeightFor(Number.NaN)).toBe(GAP_HEIGHT_MIN);
  });

  it("caps a tall block, so a whole section never opens a screenful", () => {
    expect(gapHeightFor(2000)).toBe(GAP_HEIGHT_MAX);
  });
});

describe("frozenRect", () => {
  it("keeps the first rectangle seen for an id, whatever is measured later", () => {
    const frozen = new Map<string, { top: number }>();
    const first = { top: 10 };
    const later = { top: 170 };
    expect(frozenRect(frozen, "a", first)).toBe(first);
    expect(frozenRect(frozen, "a", later)).toBe(first);
  });

  it("answers nothing for an id never measured, and remembers nothing", () => {
    const frozen = new Map<string, { top: number }>();
    expect(frozenRect(frozen, "a", undefined)).toBeUndefined();
    expect(frozen.size).toBe(0);
  });
});

describe("gapSlotFor, for a block lifted from the canvas", () => {
  it("opens nothing where the lifted block already sits", () => {
    const from = [0, 1];
    expect(gapSlotFor(page, { kind: "before", path: [0, 1] }, from)).toBeNull();
    expect(gapSlotFor(page, { kind: "after", path: [0, 1] }, from)).toBeNull();
    expect(gapSlotFor(page, { kind: "after", path: [0, 0] }, from)).toBeNull();
    expect(gapSlotFor(page, { kind: "before", path: [0, 2] }, from)).toBeNull();
  });

  it("opens nothing at the bottom of the list when the last block is lifted", () => {
    expect(
      gapSlotFor(page, { kind: "after", path: [0, 2] }, [0, 2]),
    ).toBeNull();
  });

  it("still opens one step away from the lifted block", () => {
    expect(gapSlotFor(page, { kind: "before", path: [0, 0] }, [0, 1])).toEqual({
      path: [0, 0],
      edge: "top",
    });
    expect(gapSlotFor(page, { kind: "after", path: [0, 2] }, [0, 1])).toEqual({
      path: [0, 2],
      edge: "bottom",
    });
  });

  it("opens in another list whatever index the lifted block had", () => {
    expect(gapSlotFor(page, { kind: "before", path: [1] }, [0, 1])).toEqual({
      path: [1],
      edge: "top",
    });
  });
});

describe("reachesPoint", () => {
  const rect = { top: 100, bottom: 160, left: 0, right: 200 };

  it("contains a point inside the rectangle", () => {
    expect(reachesPoint(rect, { x: 50, y: 130 }, 0, 0)).toBe(true);
  });

  it("reaches past the top and bottom by what it is given, and no further", () => {
    expect(reachesPoint(rect, { x: 50, y: 92 }, GAP_REACH, GAP_REACH)).toBe(
      true,
    );
    expect(reachesPoint(rect, { x: 50, y: 168 }, GAP_REACH, GAP_REACH)).toBe(
      true,
    );
    expect(
      reachesPoint(rect, { x: 50, y: 100 - GAP_REACH - 1 }, GAP_REACH, 0),
    ).toBe(false);
    expect(reachesPoint(rect, { x: 50, y: 161 }, GAP_REACH, 0)).toBe(false);
  });

  it("never reaches sideways", () => {
    expect(reachesPoint(rect, { x: 201, y: 130 }, GAP_REACH, GAP_REACH)).toBe(
      false,
    );
  });
});
