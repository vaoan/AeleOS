import { describe, expect, it } from "vitest";
import {
  addTableCell,
  addTableRow,
  addToPlace,
  appendPlace,
  clearAt,
  mayNest,
  moveSection,
  newContainer,
  newLeaf,
  patchContainer,
  patchLeaf,
  removeAt,
  removeTableCell,
  removeTableRow,
  setAt,
  setLeafKind,
  setSpaces,
  setTableCell,
  SPACE_CHOICES,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import {
  BLOCK_LIMITS,
  blocksSchema,
  isContainer,
  MAX_DEPTH,
  type Block,
  type ContainerBlock,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";

// WHAT THIS SUITE IS FOR.
//
// The editor holds the whole page in one form field and every edit is a pure
// function here, which is deliberate on both counts: a place may hold NOTHING,
// and `useFieldArray` keys every entry by an id it puts on the entry — so it
// cannot represent a `null`, which is the one thing this model turns on. The
// consequence is that all of the editor's real behaviour is testable without a
// DOM, and measured, where the same logic inside a component would not be.
//
// The case the whole model turns on is positional: `[a, null, b]` means `b` is
// third, and no operation here may collapse, trim or reorder that.

/**
 * A leaf with a title, so an assertion can name which one it is looking at.
 *
 * @param title - what to call it.
 * @returns the leaf.
 */
const leaf = (title: string): LeafBlock => ({
  ...newLeaf("text"),
  title_en: title,
});

/** The titles of a container's places, with `null` for an empty one. */
const titlesOf = (block: Block | undefined): (string | null)[] => {
  if (!block || !isContainer(block)) throw new Error("not a container");
  return block.children.map((child) =>
    child && !isContainer(child) ? child.title_en : null,
  );
};

/** A page of one three-space section holding a, nothing, and b. */
const gapped = (): Block[] => [
  {
    ...newContainer("grid", 3),
    children: [leaf("a"), null, leaf("b")],
  },
];

describe("SPACE_CHOICES", () => {
  // Derived rather than listed, so the vocabulary the schema accepts and the
  // one the editor offers cannot drift — a width offered here and refused by
  // `validate_block` would be a save nobody can explain.
  it("offers exactly the widths the schema accepts", () => {
    expect(SPACE_CHOICES).toEqual([1, 2, 3, 4, 5, 6]);
    expect(SPACE_CHOICES.at(-1)).toBe(BLOCK_LIMITS.spaces);
  });
});

describe("newLeaf", () => {
  it("carries the kind and nothing else written", () => {
    expect(newLeaf("picture")).toEqual({
      kind: "picture",
      title_en: "",
      description_en: "",
    });
  });

  // Refused by the write schema on purpose: a block is a heading with
  // something under it, so an untitled one is a blank box. The person is told
  // at the save rather than prevented from placing it.
  it("is refused by the write schema until it is titled", () => {
    expect(blocksSchema.safeParse([newLeaf("text")]).success).toBe(false);
    expect(
      blocksSchema.safeParse([{ ...newLeaf("text"), title_en: "Hi" }]).success,
    ).toBe(true);
  });
});

describe("newContainer", () => {
  // THE SHAPE SOMEBODY JUST CHOSE, MADE VISIBLE. A six-space section holding
  // nothing shows six places to put something in.
  it.each(SPACE_CHOICES)("starts with one empty place per space: %i", (n) => {
    const block = newContainer("grid", n);
    expect(block.spaces).toBe(n);
    expect(block.children).toHaveLength(n);
    expect(block.children.every((child) => child === null)).toBe(true);
  });

  it("is a page the write schema accepts, empty", () => {
    expect(blocksSchema.safeParse([newContainer("stack", 2)]).success).toBe(
      true,
    );
  });
});

describe("mayNest", () => {
  // A section, a container inside it, a container inside that, then leaves.
  // Depth is the path's length less one, because the outermost index names a
  // section at depth 0.
  it("allows a container at every depth the schema does, and no further", () => {
    expect(mayNest([0])).toBe(true);
    expect(mayNest([0, 0])).toBe(true);
    expect(mayNest([0, 0, 0])).toBe(true);
    expect(mayNest([0, 0, 0, 0])).toBe(false);
  });

  it("agrees with MAX_DEPTH rather than with a number of its own", () => {
    const deepest = Array.from({ length: MAX_DEPTH }, () => 0);
    expect(mayNest(deepest)).toBe(true);
    expect(mayNest([...deepest, 0])).toBe(false);
  });
});

describe("setAt", () => {
  it("puts a block in an empty place, keeping every position", () => {
    const page = setAt(gapped(), [0, 1], leaf("middle"));
    expect(titlesOf(page[0])).toEqual(["a", "middle", "b"]);
  });

  it("replaces what is already in a place", () => {
    const page = setAt(gapped(), [0, 0], leaf("z"));
    expect(titlesOf(page[0])).toEqual(["z", null, "b"]);
  });

  // How a section is APPENDED: the page array has no empty entries to keep, so
  // an append is a write to the next index.
  it("appends a section when the path names one past the last", () => {
    const page = setAt(gapped(), [1], newContainer("stack", 1));
    expect(page).toHaveLength(2);
  });

  it("reaches a place three levels down", () => {
    const page: Block[] = [
      {
        ...newContainer("stack", 1),
        children: [
          {
            ...newContainer("stack", 1),
            children: [{ ...newContainer("stack", 1), children: [null] }],
          },
        ],
      },
    ];
    const next = setAt(page, [0, 0, 0, 0], leaf("deep"));
    const first = next[0] as ContainerBlock;
    const second = first.children[0] as ContainerBlock;
    const third = second.children[0] as ContainerBlock;
    expect(titlesOf(third)).toEqual(["deep"]);
  });

  // Not a defence against a caller — the editor only ever builds a path from
  // where it is rendering — but against a path held across a removal, which is
  // the fault a captured index produces.
  it("changes nothing when the path runs through a leaf", () => {
    const page = gapped();
    expect(setAt(page, [0, 0, 0], leaf("nowhere"))).toEqual(page);
  });

  it("changes nothing when the path runs through an empty place", () => {
    const page = gapped();
    expect(setAt(page, [0, 1, 0], leaf("nowhere"))).toEqual(page);
  });

  it("never mutates the page it was given", () => {
    const page = gapped();
    const before = structuredClone(page);
    setAt(page, [0, 1], leaf("middle"));
    expect(page).toEqual(before);
  });
});

describe("clearAt", () => {
  // THE OPERATION THE WHOLE MODEL TURNS ON. Removing what is in a place must
  // not remove the place: the shape an author chose is theirs, and a section
  // that closed up round a deletion would change under them as they worked.
  it("empties a place and leaves it exactly where it was", () => {
    const page = clearAt(gapped(), [0, 0]);
    expect(titlesOf(page[0])).toEqual([null, null, "b"]);
  });

  it("keeps the third thing third", () => {
    const page = clearAt(gapped(), [0, 0]);
    const block = page[0] as ContainerBlock;
    expect(block.children[2]).not.toBeNull();
    expect(block.children).toHaveLength(3);
  });

  // A SECTION HAS NO PLACE TO LEAVE BEHIND, because the page array holds no
  // empty entries — there is nothing above a section to keep room in.
  it("removes a section outright, because a page holds no empty entry", () => {
    const page = clearAt([...gapped(), newContainer("stack", 1)], [0]);
    expect(page).toHaveLength(1);
    expect(page.every((block) => block !== null)).toBe(true);
  });
});

describe("removeAt", () => {
  it("takes a place away and moves everything after it up", () => {
    const page = removeAt(gapped(), [0, 1]);
    expect(titlesOf(page[0])).toEqual(["a", "b"]);
  });

  it("removes a section", () => {
    const page = removeAt([...gapped(), newContainer("stack", 1)], [0]);
    expect(page).toHaveLength(1);
  });

  it("changes nothing when the path runs through a leaf", () => {
    const page = gapped();
    expect(removeAt(page, [0, 0, 0])).toEqual(page);
  });

  it("changes nothing when the path runs through an empty place", () => {
    const page = gapped();
    expect(removeAt(page, [0, 1, 0])).toEqual(page);
  });
});

describe("appendPlace", () => {
  // A place beyond the container's width starts a new row, which is what makes
  // a section grow downward as things are added.
  it("adds one empty place at the end", () => {
    const page = appendPlace(gapped(), [0]);
    expect(titlesOf(page[0])).toEqual(["a", null, "b", null]);
  });

  it("refuses to go past the content cap", () => {
    const full: Block[] = [
      {
        ...newContainer("grid", 2),
        children: Array.from({ length: BLOCK_LIMITS.children }, () => null),
      },
    ];
    const page = appendPlace(full, [0]);
    expect((page[0] as ContainerBlock).children).toHaveLength(
      BLOCK_LIMITS.children,
    );
  });

  it("changes nothing when the path names a leaf", () => {
    const page = gapped();
    expect(appendPlace(page, [0, 0])).toEqual(page);
  });
});

describe("setLeafKind", () => {
  // NOTHING ELSE ON THE BLOCK IS TOUCHED, which is a contract rather than an
  // implementation detail: every field is accepted whatever the kind is, so
  // switching a kind to see what it looks like and switching back finds what
  // was typed still there.
  it("keeps everything the leaf was carrying", () => {
    const page: Block[] = [
      {
        ...newContainer("grid", 1),
        children: [
          {
            ...leaf("Kept"),
            link_url: "https://a.test",
            icon: "paw-print",
            image_url: "https://a.test/p.png",
          },
        ],
      },
    ];
    const once = setLeafKind(page, [0, 0], "social");
    const back = setLeafKind(once, [0, 0], "text");
    expect((back[0] as ContainerBlock).children[0]).toEqual(
      (page[0] as ContainerBlock).children[0],
    );
  });

  it("changes nothing when the path names a container", () => {
    const page = gapped();
    expect(setLeafKind(page, [0], "text")).toEqual(page);
  });

  it("changes nothing when the place is empty", () => {
    const page = gapped();
    expect(setLeafKind(page, [0, 1], "text")).toEqual(page);
  });
});

describe("patchLeaf", () => {
  it("writes the fields it is given and leaves the rest", () => {
    const page = patchLeaf(gapped(), [0, 0], { description_en: "Words." });
    const child = (page[0] as ContainerBlock).children[0] as LeafBlock;
    expect(child).toMatchObject({ title_en: "a", description_en: "Words." });
  });

  it("changes nothing when the path names a container", () => {
    const page = gapped();
    expect(patchLeaf(page, [0], { title_en: "no" })).toEqual(page);
  });
});

describe("patchContainer", () => {
  // THE ANSWER TO "CHANGING A SHAPE MUST NOT DESTROY CONTENT", and it is the
  // model rather than a rescue: `spaces` is a WIDTH and `children` is the
  // content, so narrowing re-wraps into more rows and strands nobody. The way
  // to break this is to rewrite `children` to the new width here, which would
  // destroy everything past it and could not be undone by widening again.
  it("keeps every occupant, in order, when the shape narrows", () => {
    const wide: Block[] = [
      {
        ...newContainer("grid", 6),
        children: ["a", "b", "c", "d", "e", "f"].map((t) => leaf(t)),
      },
    ];
    const narrow = patchContainer(wide, [0], { spaces: 2 });
    expect((narrow[0] as ContainerBlock).spaces).toBe(2);
    expect(titlesOf(narrow[0])).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("keeps an empty place in its position when the shape narrows", () => {
    const narrow = patchContainer(gapped(), [0], { spaces: 1 });
    expect(titlesOf(narrow[0])).toEqual(["a", null, "b"]);
  });

  // Widening is the same act in the other direction and must also add nothing:
  // a place appears when somebody adds one, not when they change the width.
  it("adds no place when the shape widens", () => {
    const wide = patchContainer(gapped(), [0], { spaces: 6 });
    expect(titlesOf(wide[0])).toEqual(["a", null, "b"]);
  });

  it("writes a name, an arrangement and a style", () => {
    const page = patchContainer(gapped(), [0], {
      name_en: "About",
      mode: "tabs",
      style: { skin: "glass" },
    });
    expect(page[0]).toMatchObject({
      name_en: "About",
      mode: "tabs",
      style: { skin: "glass" },
    });
  });

  it("changes nothing when the path names a leaf", () => {
    const page = gapped();
    expect(patchContainer(page, [0, 0], { spaces: 4 })).toEqual(page);
  });
});

describe("setSpaces", () => {
  const page = (spaces: number, weights?: number[]) =>
    [
      {
        ...newContainer("grid", spaces),
        weights,
        children: [leaf("a"), leaf("b"), leaf("c")],
      },
    ] as Block[];

  it("keeps every child when the width narrows", () => {
    const next = setSpaces(page(3, [1, 3, 2]), [0], 2)[0] as ContainerBlock;
    expect(next.children).toHaveLength(3);
  });

  it("truncates the weights to the new width", () => {
    const next = setSpaces(page(3, [1, 3, 2]), [0], 2)[0] as ContainerBlock;
    expect(next.weights).toEqual([1, 3]);
  });

  // The last share is deliberately not 1: padding with the LAST share
  // ([1, 3, 2] -> [1, 3, 2, 2, 2]) would give a different answer than padding
  // with an even share ([1, 3, 2, 1, 1]) here, where a trailing 1 would not
  // have told the two apart.
  it("pads the weights with an even share when the width grows", () => {
    const next = setSpaces(page(3, [1, 3, 2]), [0], 5)[0] as ContainerBlock;
    expect(next.weights).toEqual([1, 3, 2, 1, 1]);
  });

  it("leaves a container with no weights without any", () => {
    const next = setSpaces(page(3), [0], 2)[0] as ContainerBlock;
    expect(next.weights).toBeUndefined();
  });

  it("changes nothing when the path names a leaf", () => {
    const before = gapped();
    expect(setSpaces(before, [0, 0], 2)).toEqual(before);
  });

  it("changes nothing when the place is empty", () => {
    const before = gapped();
    expect(setSpaces(before, [0, 1], 2)).toEqual(before);
  });
});

describe("addToPlace", () => {
  /**
   * A section holding a container holding a container — three levels of
   * container, which is every level `mayNest` allows — with a leaf at the
   * bottom, one level past where a container may sit.
   *
   * **The arithmetic is the thing to get wrong, not the cap.** A leaf's
   * deepest seat is three containers down, so a helper that nests only two
   * and calls itself "at the cap" would sit one level above the only place
   * the refusal this describes can happen. `deepestPath` is asserted against
   * `mayNest` directly, in the tests below, so a helper that drifts fails as
   * a wrong fixture rather than as a passing test of nothing.
   */
  const section3Levels = (): ContainerBlock => ({
    ...newContainer("stack", 1),
    children: [
      {
        ...newContainer("stack", 1),
        children: [
          {
            ...newContainer("stack", 1),
            children: [leaf("deep")],
          },
        ],
      },
    ],
  });

  /** The one place three containers down — a leaf's seat, not a container's. */
  const deepestPath = (): BlockPath => [0, 0, 0, 0];

  it("fills an empty place directly, adding no container nobody asked for", () => {
    const page = [
      {
        ...newContainer("grid", 2),
        name_en: "S",
        children: [null, null],
      },
    ] as Block[];
    const next = addToPlace(page, [0, 0], leaf("a"))[0] as ContainerBlock;
    expect(next.children[0]).toEqual(leaf("a"));
  });

  it("wraps what is already there in a stack and appends", () => {
    const page = [
      {
        ...newContainer("grid", 2),
        name_en: "S",
        children: [leaf("a"), null],
      },
    ] as Block[];
    const place = (addToPlace(page, [0, 0], leaf("b"))[0] as ContainerBlock)
      .children[0] as ContainerBlock;
    expect(place.kind).toBe("container");
    expect(place.mode).toBe("stack");
    expect(place.children).toEqual([leaf("a"), leaf("b")]);
  });

  it("appends to a stack that is already there rather than nesting another", () => {
    const stack: ContainerBlock = {
      ...newContainer("stack", 1),
      children: [leaf("a")],
    };
    const page = [
      {
        ...newContainer("grid", 2),
        name_en: "S",
        children: [stack, null],
      },
    ] as Block[];
    const place = (addToPlace(page, [0, 0], leaf("b"))[0] as ContainerBlock)
      .children[0] as ContainerBlock;
    expect(place.children).toEqual([leaf("a"), leaf("b")]);
    expect(place.children.some((child) => child && isContainer(child))).toBe(
      false,
    );
  });

  it("refuses to wrap where a container may not sit, rather than building a tree too deep", () => {
    // A place at the depth cap may hold content and nothing else — see the
    // helper's own comment for why the arithmetic, not the cap, is the trap.
    expect(mayNest(deepestPath())).toBe(false);
    const deep = [section3Levels()];
    expect(addToPlace(deep, deepestPath(), leaf("b"))).toBe(deep);
  });
});

describe("moveSection", () => {
  it("moves a section to another position among the sections", () => {
    const page: Block[] = [
      { ...newContainer("stack", 1), name_en: "one" },
      { ...newContainer("stack", 1), name_en: "two" },
      { ...newContainer("stack", 1), name_en: "three" },
    ];
    const moved = moveSection(page, 0, 2);
    expect(moved.map((block) => isContainer(block) && block.name_en)).toEqual([
      "two",
      "three",
      "one",
    ]);
  });

  it("changes nothing when there is no section at the source", () => {
    const page = gapped();
    expect(moveSection(page, 5, 0)).toEqual(page);
  });
});

describe("a table leaf's rows", () => {
  /** A page of one section holding one `table` leaf. */
  const withTable = (rows?: { text_en: string; text_es?: string }[][]) =>
    [
      {
        ...newContainer("stack", 1),
        children: [{ ...newLeaf("table"), title_en: "T", rows }],
      },
    ] as Block[];

  /** The rows of the table in a page a test is holding. */
  const rowsOf = (page: Block[]) =>
    ((page[0] as ContainerBlock).children[0] as LeafBlock).rows;

  // A row starts as a PAIR, because `TableLeaf` announces the first cell of
  // each row as that row's header and the rest as its values — a row of one is
  // a header with nothing under it.
  it("adds a row as a pair, from no rows at all", () => {
    expect(rowsOf(addTableRow(withTable(), [0, 0]))).toEqual([
      [{ text_en: "" }, { text_en: "" }],
    ]);
  });

  it("refuses to go past the row cap", () => {
    const full = withTable(
      Array.from({ length: BLOCK_LIMITS.rows }, () => [{ text_en: "x" }]),
    );
    expect(rowsOf(addTableRow(full, [0, 0]))).toHaveLength(BLOCK_LIMITS.rows);
  });

  it("removes one row and leaves the others", () => {
    const page = withTable([
      [{ text_en: "a" }],
      [{ text_en: "b" }],
      [{ text_en: "c" }],
    ]);
    expect(rowsOf(removeTableRow(page, [0, 0], 1))).toEqual([
      [{ text_en: "a" }],
      [{ text_en: "c" }],
    ]);
  });

  it("adds a cell to one row and no other", () => {
    const page = withTable([[{ text_en: "a" }], [{ text_en: "b" }]]);
    expect(rowsOf(addTableCell(page, [0, 0], 0))).toEqual([
      [{ text_en: "a" }, { text_en: "" }],
      [{ text_en: "b" }],
    ]);
  });

  it("refuses to go past the cell cap", () => {
    const full = withTable([
      Array.from({ length: BLOCK_LIMITS.cells }, () => ({ text_en: "x" })),
    ]);
    expect(rowsOf(addTableCell(full, [0, 0], 0))?.[0]).toHaveLength(
      BLOCK_LIMITS.cells,
    );
  });

  it("removes one cell from one row and no other", () => {
    const page = withTable([
      [{ text_en: "a" }, { text_en: "b" }],
      [{ text_en: "c" }, { text_en: "d" }],
    ]);
    expect(rowsOf(removeTableCell(page, [0, 0], 1, 0))).toEqual([
      [{ text_en: "a" }, { text_en: "b" }],
      [{ text_en: "d" }],
    ]);
  });

  it("writes one cell's English text", () => {
    const page = withTable([[{ text_en: "a" }, { text_en: "b" }]]);
    expect(rowsOf(setTableCell(page, [0, 0], 0, 1, "en", "B"))).toEqual([
      [{ text_en: "a" }, { text_en: "B" }],
    ]);
  });

  // AN UNWRITTEN SPANISH CELL IS ABSENT, NOT EMPTY. `text_en` carries a
  // default and `text_es` is optional, so a page whose author has not written
  // the Spanish reads back exactly as it was written rather than carrying a
  // key holding nothing.
  it("writes and then removes one cell's Spanish text", () => {
    const page = withTable([[{ text_en: "a" }]]);
    const written = setTableCell(page, [0, 0], 0, 0, "es", "á");
    expect(rowsOf(written)).toEqual([[{ text_en: "a", text_es: "á" }]]);
    expect(rowsOf(setTableCell(written, [0, 0], 0, 0, "es", ""))).toEqual([
      [{ text_en: "a", text_es: undefined }],
    ]);
  });

  it("leaves every other cell alone", () => {
    const page = withTable([
      [{ text_en: "a" }, { text_en: "b" }],
      [{ text_en: "c" }],
    ]);
    expect(rowsOf(setTableCell(page, [0, 0], 1, 0, "en", "C"))).toEqual([
      [{ text_en: "a" }, { text_en: "b" }],
      [{ text_en: "C" }],
    ]);
  });

  it("changes nothing when the path names a container", () => {
    const page = withTable([[{ text_en: "a" }]]);
    expect(addTableRow(page, [0])).toEqual(page);
  });
});
