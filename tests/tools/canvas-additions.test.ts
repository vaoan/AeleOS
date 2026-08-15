import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error -- a .mjs tool with no declaration file, like its siblings.
import { addedCanvases, canvasNames } from "../../scripts/canvas-additions.mjs";

/** A table in the shape the real one has, with the given entries. */
function table(entries: string): string {
  return `
/** Doc comment mentioning stars: 3 in prose. */
export const CANVAS_SLOTS = {
${entries}
} as const;

export const MAX_CANVAS_COLOURS = Math.max(...Object.values(CANVAS_SLOTS));
`;
}

describe("canvasNames", () => {
  it("reads the names out of the table", () => {
    expect(canvasNames(table("  nebula: 3,\n  stars: 3,\n  none: 0,"))).toEqual(
      ["nebula", "stars", "none"],
    );
  });

  it("reads a quoted key", () => {
    expect(canvasNames(table('  "nebula": 3,'))).toEqual(["nebula"]);
  });

  it("ignores the per-entry doc comments the real table is full of", () => {
    const source = table(`
  nebula: 3,
  /** Points and the lines between them. */
  constellation: 2,
  /** Three bands of water, back to front. */
  waves: 3,
`);
    expect(canvasNames(source)).toEqual(["nebula", "constellation", "waves"]);
  });

  it("stops at the end of the table rather than reading the whole file", () => {
    const source = `${table("  nebula: 3,")}\nexport const OTHER = { impostor: 4 };`;
    expect(canvasNames(source)).not.toContain("impostor");
  });

  it("refuses a file with no table rather than reporting none", () => {
    // Reporting zero canvases would mean "nothing was added, ever" and would
    // switch the suite off silently — the failure this whole check exists to
    // avoid, wearing the check's own clothes.
    expect(() => canvasNames("export const NOTHING = 1;")).toThrow(
      /no CANVAS_SLOTS/,
    );
  });

  it("refuses a table it cannot find the end of", () => {
    expect(() => canvasNames("export const CANVAS_SLOTS = {")).toThrow(
      /object literal/,
    );
  });

  it("reads the real table, so the parser cannot drift from it", () => {
    // The one assertion that fails if the file is reformatted in a way this
    // parser does not follow — which is the only way it can quietly break.
    const real = readFileSync(
      new URL(
        "../../apps/hub/src/shared/domain/canvas-slots.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const names = canvasNames(real);
    expect(names).toContain("nebula");
    expect(names).toContain("aurora");
    expect(names).toContain("hexagons");
    expect(names).toContain("none");
    // Twenty-four today. Asserted as a floor rather than an equality so adding
    // a canvas does not fail this test — which would be a gate on the very act
    // this check is meant to welcome.
    expect(names.length).toBeGreaterThanOrEqual(20);
  });
});

describe("addedCanvases", () => {
  it("finds a canvas that was not there before", () => {
    expect(
      addedCanvases(table("  nebula: 3,"), table("  nebula: 3,\n  moire: 2,")),
    ).toEqual(["moire"]);
  });

  it("finds nothing when the table is untouched", () => {
    expect(addedCanvases(table("  nebula: 3,"), table("  nebula: 3,"))).toEqual(
      [],
    );
  });

  it("is not fooled by a reordering", () => {
    expect(
      addedCanvases(
        table("  nebula: 3,\n  stars: 3,"),
        table("  stars: 3,\n  nebula: 3,"),
      ),
    ).toEqual([]);
  });

  it("does not report a removal as an addition", () => {
    expect(
      addedCanvases(table("  nebula: 3,\n  stars: 3,"), table("  nebula: 3,")),
    ).toEqual([]);
  });

  it("does not report a canvas whose colour count merely changed", () => {
    // Changing how many colours a canvas takes is not introducing one, and
    // running a browser suite over it would be the cost this check avoids.
    expect(addedCanvases(table("  nebula: 3,"), table("  nebula: 4,"))).toEqual(
      [],
    );
  });

  it("reports several at once, which is how they actually arrive", () => {
    expect(
      addedCanvases(
        table("  nebula: 3,"),
        table("  nebula: 3,\n  aurora: 4,\n  plasma: 2,\n  cells: 3,"),
      ),
    ).toEqual(["aurora", "plasma", "cells"]);
  });
});
