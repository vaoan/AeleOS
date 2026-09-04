import { describe, expect, it } from "vitest";
import {
  canvasPlaceId,
  canvasPlacePath,
  placeId,
  placeName,
  placeOrder,
  placePath,
  placeUnderPointer,
  stepPlace,
  type PlaceCandidate,
} from "@/features/actors/domain/block-drag";
import { newContainer, newLeaf } from "@/features/actors/domain/block-edits";
import type { Block } from "@/features/actors/domain/block-schema";

// WHERE THE DRAG'S ONE REAL UNKNOWN LIVES.
//
// `moveBlock` decides what a drop MEANS; everything here decides which two
// places a gesture named, which is the half the spike found hardest. A
// collision function that ranks by distance to a rectangle's centre resolves a
// hovered container to a LEAF INSIDE IT — silently, one level in — and the
// spike's working detector was two-level-specific. These cases are built at
// depth three, the deepest the schema admits, because two levels is the depth
// at which the wrong answer and the right one agree.

/**
 * A candidate the library would report, from a path and a rectangle.
 *
 * @param path - where it sits in the page.
 * @param left - its distance from the left.
 * @param top - its distance from the top.
 * @param width - how wide it is.
 * @param height - how tall it is.
 * @returns the candidate.
 */
const at = (
  path: number[],
  left: number,
  top: number,
  width: number,
  height: number,
): PlaceCandidate => ({
  id: placeId(path),
  path,
  rect: { left, top, width, height },
});

// A section at 0,0 1000x400; its first place inset by 20; a container in that
// place; and that container's own first place inset again. FOUR nested
// rectangles, each containing the point (60, 60), which is the whole
// difficulty. The fifth candidate, `[0, 1]`, is a sibling place off to the
// right and contains that point in no sense at all: it is here so the cases
// below have somewhere to resolve to that is not the nest, and a comment here
// counted it among the four for a while.
const NESTED: PlaceCandidate[] = [
  at([0], 0, 0, 1000, 400),
  at([0, 0], 20, 20, 460, 360),
  at([0, 0, 0], 40, 40, 200, 320),
  at([0, 0, 0, 0], 50, 50, 80, 300),
  at([0, 1], 520, 20, 460, 360),
];

describe("placeId and placePath", () => {
  it("names a place and reads it back", () => {
    expect(placeId([0, 1, 2])).toBe("place:0.1.2");
    expect(placePath("place:0.1.2")).toEqual([0, 1, 2]);
    expect(placePath(placeId([7]))).toEqual([7]);
  });

  // AN ID THAT IS NEARLY A PATH IS AN ID FROM SOMEWHERE ELSE. Repairing one
  // would move a block to a position nobody pointed at, which is the same
  // reasoning `placeAt` refuses a stale path on.
  it.each([
    ["another library's id", "Droppable-3"],
    ["no prefix at all", "0.1"],
    ["nothing after the prefix", "place:"],
    ["a negative index", "place:-1"],
    ["a trailing dot", "place:0.1."],
    ["letters", "place:0.a"],
    ["a signed index", "place:+1"],
    ["whitespace", "place:0. 1"],
  ])("refuses %s", (_why, id) => {
    expect(placePath(id)).toBeUndefined();
  });

  // A CLAIM THAT WAS WRITTEN HERE AND WAS FALSE, kept as a case rather than
  // deleted. "A fractional index must be refused" reads like an obvious guard
  // and is not a claim this function can even hold: "." is the SEPARATOR, so
  // `place:1.5` is not the number 1.5 written down, it is the path [1, 5], and
  // there is no reading under which it is ambiguous. The guard that does exist
  // is the digits-only test on each segment, which is what the cases above
  // exercise.
  it("reads a dot as a separator and never as a decimal point", () => {
    expect(placePath("place:1.5")).toEqual([1, 5]);
    expect(placeId([1, 5])).toBe("place:1.5");
  });
});

describe("canvasPlaceId and canvasPlacePath", () => {
  it("keeps a canvas node distinct and reads its path back", () => {
    expect(canvasPlaceId([0, 1, 2])).toBe("canvas-place:0.1.2");
    expect(canvasPlacePath(canvasPlaceId([0, 1, 2]))).toEqual([0, 1, 2]);
    expect(placePath(canvasPlaceId([0, 1, 2]))).toBeUndefined();
  });

  it.each([
    "place:0.1",
    "canvas-place:",
    "canvas-place:-1",
    "canvas-place:0.",
    "canvas-place:a",
  ])("refuses a non-canvas place %s", (id) => {
    expect(canvasPlacePath(id)).toBeUndefined();
  });
});

describe("placeName", () => {
  it("counts from one, because people do", () => {
    expect(placeName([0])).toBe("1");
    expect(placeName([0, 1, 2])).toBe("1.2.3");
  });
});

describe("placeUnderPointer", () => {
  // THE DEPTH-CAP CASE. Four nested rectangles all contain the point; the
  // answer is the innermost, and it is innermost at depth THREE.
  //
  // **It does not, on its own, discriminate the fault this function exists to
  // avoid**, and a comment here claimed it did. Nearest-centre answers
  // `[0,0,0,0]` too at this point: the four centres sit 461.7, 235.9, 161.2 and
  // 143.2 away from (60, 60), innermost nearest. The case below is what kills
  // nearest-centre, and the credit belongs there.
  it("resolves to the deepest place under the pointer, at the depth cap", () => {
    expect(placeUnderPointer(NESTED, 60, 60, [1])?.path).toEqual([0, 0, 0, 0]);
  });

  // THE ONE THAT MATTERS. At (200, 60) the right answer and the wrong one part
  // company: `[0,0]`'s centre is 148.7 away and `[0,0,0]`'s is 152.3, so a
  // collision ranking by distance to a rectangle's centre answers the PARENT
  // while the pointer is squarely inside the child. Ranking by path length
  // answers the child, which is what "innermost wins" means.
  it("resolves to the container's own place where no child holds the point", () => {
    // Inside [0,0] and inside [0,0,0], but to the right of [0,0,0,0].
    expect(placeUnderPointer(NESTED, 200, 60, [1])?.path).toEqual([0, 0, 0]);
    // Inside [0,0] only.
    expect(placeUnderPointer(NESTED, 400, 60, [1])?.path).toEqual([0, 0]);
  });

  it("resolves to a section itself over its own chrome", () => {
    // Inside the section and outside every one of its places.
    expect(placeUnderPointer(NESTED, 5, 390, [1])?.path).toEqual([0]);
  });

  it("resolves to nothing when the pointer is over no place at all", () => {
    expect(placeUnderPointer(NESTED, 2000, 2000, [1])).toBeUndefined();
  });

  // THE PLANE RULE, AND THE HAZARD IT EXISTS FOR. `moveBlock` shifts two
  // top-level paths and SWAPS a top-level path against a nested one — so a
  // nested block resolved onto a section's own path would exchange with the
  // whole section, which is not what anybody dragging content between two
  // sections meant.
  it("never offers a section's own place to something dragged from inside one", () => {
    expect(placeUnderPointer(NESTED, 5, 390, [0, 1])).toBeUndefined();
  });

  it("still offers a section's own place to another top-level entry", () => {
    expect(placeUnderPointer(NESTED, 5, 390, [3])?.path).toEqual([0]);
  });

  it("offers a nested place to a top-level entry, which is how a section nests", () => {
    expect(placeUnderPointer(NESTED, 60, 60, [3])?.path).toEqual([0, 0, 0, 0]);
  });

  // A container dragged over its own innards IS under the pointer, and is
  // deliberately not filtered out: `moveBlock` refuses it with a sentence
  // somebody can read, which is more use than a target that quietly declines
  // to light up.
  it("offers a place inside the block being dragged, so the refusal can be said", () => {
    expect(placeUnderPointer(NESTED, 60, 60, [0, 0])?.path).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("takes the first of two equally deep places holding the point", () => {
    const overlapping = [
      at([0, 0], 0, 0, 100, 100),
      at([0, 1], 0, 0, 100, 100),
    ];
    expect(placeUnderPointer(overlapping, 50, 50, [1, 0])?.path).toEqual([
      0, 0,
    ]);
  });

  it("counts the far edge as inside", () => {
    const one = [at([0, 0], 10, 10, 40, 40)];
    expect(placeUnderPointer(one, 50, 50, [1, 0])?.path).toEqual([0, 0]);
    expect(placeUnderPointer(one, 51, 50, [1, 0])).toBeUndefined();
    expect(placeUnderPointer(one, 50, 51, [1, 0])).toBeUndefined();
    expect(placeUnderPointer(one, 9, 30, [1, 0])).toBeUndefined();
    expect(placeUnderPointer(one, 30, 9, [1, 0])).toBeUndefined();
  });
});

/** A page: a section holding a nested container holding a leaf, and a second. */
const page = (): Block[] => [
  {
    ...newContainer("grid", 2),
    children: [
      {
        ...newContainer("grid", 2),
        children: [
          { ...newContainer("grid", 1), children: [newLeaf("text")] },
          null,
        ],
      },
      null,
    ],
  },
  { ...newContainer("grid", 2), children: [newLeaf("text"), null] },
];

describe("placeOrder", () => {
  // A LIST CAN LEAVE OUT WHAT A POINTER CANNOT AVOID. Arrowing a section along
  // must not land inside the very thing being carried, which is what makes an
  // ordinary section reorder behave the way somebody expects — and the exact
  // array below says that as well as the order: the whole of `[0]`'s subtree,
  // four places of it, is missing.
  //
  // A second case used to assert that absence separately, with a `some` over
  // the same list. It could not fail unless this one failed first, which is
  // rule 23, so it is gone and its reasoning is here.
  it("walks the places in the order they are drawn, without what is being carried", () => {
    expect(placeOrder(page(), [0])).toEqual([[0], [1], [1, 0], [1, 1]]);
  });

  it("offers no top-level entry to something dragged from inside a section", () => {
    expect(placeOrder(page(), [0, 0])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it("reaches the deepest places when the drag starts there", () => {
    expect(placeOrder(page(), [0, 0, 0, 0])).toEqual([
      [0, 0],
      [0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 1],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it("stops at a leaf rather than walking through it", () => {
    expect(placeOrder([newLeaf("text")], [0])).toEqual([[0]]);
  });
});

describe("stepPlace", () => {
  const order = [[0], [1], [1, 0], [1, 1]];

  it("steps along and back", () => {
    expect(stepPlace(order, [1], true)).toEqual([1, 0]);
    expect(stepPlace(order, [1], false)).toEqual([0]);
  });

  // IT STOPS AT THE ENDS RATHER THAN WRAPPING. A list that wrapped would send
  // somebody who pressed the down arrow once too often back to the top of the
  // page, which reads as the drag having jumped on its own.
  it("stops at either end", () => {
    expect(stepPlace(order, [0], false)).toBeUndefined();
    expect(stepPlace(order, [1, 1], true)).toBeUndefined();
  });

  it("starts at the first place when it is somewhere no longer in the list", () => {
    expect(stepPlace(order, [9, 9], true)).toEqual([0]);
  });

  it("has nowhere to go in an empty list", () => {
    expect(stepPlace([], [0], true)).toBeUndefined();
  });
});
