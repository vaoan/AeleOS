import { describe, expect, it } from "vitest";
import {
  blockProblems,
  problemFields,
  problemUnder,
  type BlockProblem,
} from "@/features/actors/domain/block-problems";

// WHAT THIS IS FOR, AND WHY IT IS NOT ENOUGH ON ITS OWN.
//
// A refused save used to produce one banner line saying "fix what is marked"
// over a page where nothing was marked — on the commonest path there is, since
// a new piece of content starts untitled and the write schema requires a
// heading. These functions are what turn react-hook-form's error tree into the
// address of the block that is actually wrong.
//
// The shape of that tree is an ASSUMPTION about somebody else's library, so
// every fixture below is hand-built and proves only the walk. What proves the
// assumption is `fursona-editor.test.tsx`, which drives a real refused save
// through the real resolver and asserts the mark appears — the pattern this
// repository already paid for: a mocked dependency hides its own setup
// requirements, so the test that uses the real thing is the one that counts.

/** The error tree `zodResolver` builds for one refused field. */
const refused = (message = "Too small") => ({ type: "too_small", message });

describe("blockProblems", () => {
  it("finds nothing in an absent error tree", () => {
    expect(blockProblems(undefined)).toEqual([]);
    expect(blockProblems(null)).toEqual([]);
    expect(blockProblems("not an object")).toEqual([]);
  });

  // The ordinary case: a section's first place holds an untitled leaf.
  it("reads a leaf's path out of the tree", () => {
    expect(blockProblems([{ children: [{ title_en: refused() }] }])).toEqual<
      BlockProblem[]
    >([{ path: [0, 0], field: "title_en" }]);
  });

  it("reads a section's own field", () => {
    expect(blockProblems([{ name_en: refused() }])).toEqual<BlockProblem[]>([
      { path: [0], field: "name_en" },
    ]);
  });

  // THE NUMERIC STEPS ARE THE PATH AND THE NAMED ONES ARE NOT, which is what
  // makes `children` — and any level the value's own shape adds later —
  // invisible to the address.
  it("reaches a leaf three levels down", () => {
    expect(
      blockProblems([
        {
          children: [{ children: [{ children: [{ title_en: refused() }] }] }],
        },
      ]),
    ).toEqual<BlockProblem[]>([{ path: [0, 0, 0, 0], field: "title_en" }]);
  });

  it("finds every refusal on one page, not only the first", () => {
    expect(
      blockProblems([
        { children: [{ title_en: refused() }, { title_en: refused() }] },
        { children: [null, { title_en: refused() }] },
      ]),
    ).toEqual<BlockProblem[]>([
      { path: [0, 0], field: "title_en" },
      { path: [0, 1], field: "title_en" },
      { path: [1, 1], field: "title_en" },
    ]);
  });

  // A table leaf's rows are a level of the value's own shape with numeric
  // steps inside it, so a refused cell reports the row and cell indices as
  // part of the path. Recorded rather than defended: nothing marks a cell
  // today, and the block itself is still found by `problemUnder`.
  it("reports a refused table cell beneath its own leaf", () => {
    expect(
      blockProblems([
        { children: [{ rows: [[{ text_en: refused("Too big") }]] }] },
      ]),
    ).toEqual<BlockProblem[]>([{ path: [0, 0, 0, 0], field: "text_en" }]);
  });

  // A PAGE-LEVEL REFUSAL PRODUCES NOTHING, and that is what the editor's two
  // banner messages are told apart by. "Too many blocks" and "blocks are too
  // large" are refines on the whole array, so they carry no index and there is
  // no block to mark.
  it("finds nothing for a refusal on the whole page", () => {
    expect(blockProblems(refused("too many blocks"))).toEqual([]);
  });

  // A node carrying only one of the two keys is a level of the tree, not an
  // error — which is what keeps a block's own field named `type` (there is
  // none today) from being read as one.
  it("walks past a node that carries only part of an error's shape", () => {
    expect(
      blockProblems([{ children: [{ style: { type: "grid" } }] }]),
    ).toEqual([]);
  });
});

describe("problemFields", () => {
  const problems: BlockProblem[] = [
    { path: [0, 1], field: "title_en" },
    { path: [0, 1], field: "link_url" },
    { path: [0], field: "name_en" },
    { path: [0, 1, 2], field: "title_en" },
  ];

  it("names every field refused at exactly that path", () => {
    expect(problemFields(problems, [0, 1])).toEqual(["title_en", "link_url"]);
  });

  it("names nothing for a block with no refusal", () => {
    expect(problemFields(problems, [1])).toEqual([]);
  });

  // A prefix is not a match: a section's own refusal must not mark every leaf
  // inside it, and a leaf's must not mark the section.
  it("does not answer for an ancestor or a descendant", () => {
    expect(problemFields(problems, [0])).toEqual(["name_en"]);
    expect(problemFields(problems, [0, 1, 2])).toEqual(["title_en"]);
  });
});

describe("problemUnder", () => {
  const problems: BlockProblem[] = [{ path: [1, 0, 2], field: "title_en" }];

  // WHAT MAKES A COLLAPSED CARD OPEN ITSELF. Every ancestor of a refusal has
  // to answer true, or a block three levels down inside a collapsed section is
  // a refusal somebody cannot see while the banner tells them it is marked.
  it("answers for the block itself and every container above it", () => {
    expect(problemUnder(problems, [1, 0, 2])).toBe(true);
    expect(problemUnder(problems, [1, 0])).toBe(true);
    expect(problemUnder(problems, [1])).toBe(true);
  });

  it("answers false for a sibling and for anything below the refusal", () => {
    expect(problemUnder(problems, [0])).toBe(false);
    expect(problemUnder(problems, [1, 1])).toBe(false);
    expect(problemUnder(problems, [1, 0, 2, 0])).toBe(false);
  });

  it("answers false when nothing was refused", () => {
    expect(problemUnder([], [0])).toBe(false);
  });
});
