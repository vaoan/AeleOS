import { describe, expect, it } from "vitest";
import { classifyPage, tally } from "../../scripts/check-page-shapes.mjs";

describe("classifyPage", () => {
  // **A census, not a parse.** It answers what is STORED, which is why it does
  // not reuse `readEitherShape`: that function answers what we can still read,
  // and a shape we have stopped reading is exactly what this has to count.

  it("reads a flat page by its sections' `type`", () => {
    expect(classifyPage([{ type: "gallery", items: [] }])).toBe("flat");
  });

  it("reads a block page by its blocks' `kind`", () => {
    expect(
      classifyPage([
        { kind: "container", mode: "grid", spaces: 2, children: [] },
      ]),
    ).toBe("blocks");
  });

  it("reads the transitional shape by a container's `columns`", () => {
    expect(
      classifyPage([
        { kind: "container", mode: "grid", columns: 3, children: [] },
      ]),
    ).toBe("columns");
  });

  // **The discriminating case.** A classifier that checks only the top level
  // and one that walks the tree agree on every fixture above; they part here.
  // `columns` was written by one save boundary for about a day, and a page
  // carrying it three levels down is still a page that needs the shim.
  it("finds `columns` nested inside an otherwise current page", () => {
    expect(
      classifyPage([
        {
          kind: "container",
          mode: "grid",
          spaces: 2,
          children: [
            {
              kind: "container",
              mode: "stack",
              spaces: 1,
              children: [
                { kind: "container", mode: "grid", columns: 2, children: [] },
              ],
            },
          ],
        },
      ]),
    ).toBe("columns");
  });

  it("reads nothing stored as empty", () => {
    expect(classifyPage([])).toBe("empty");
    expect(classifyPage(null)).toBe("empty");
  });

  it("refuses to guess at a shape it does not recognise", () => {
    expect(classifyPage([{ nonsense: true }])).toBe("unknown");
    expect(classifyPage("not an array")).toBe("unknown");
  });
});

describe("tally", () => {
  it("counts each shape and reports the total", () => {
    expect(
      tally([
        [{ type: "gallery" }],
        [{ kind: "container", mode: "grid", spaces: 2, children: [] }],
        [{ kind: "container", mode: "grid", spaces: 2, children: [] }],
        [],
      ]),
    ).toEqual({
      flat: 1,
      blocks: 2,
      columns: 0,
      empty: 1,
      unknown: 0,
      total: 4,
    });
  });

  // A shape with no rows still has to appear, or a reader cannot tell "none
  // left" from "this script no longer counts them".
  it("reports a zero rather than omitting the shape", () => {
    expect(tally([])).toEqual({
      flat: 0,
      blocks: 0,
      columns: 0,
      empty: 0,
      unknown: 0,
      total: 0,
    });
  });
});
