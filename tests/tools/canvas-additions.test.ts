import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  addedCanvases,
  canvasNames,
  isCanvasSource,
  touchedCanvasSources,
  // @ts-expect-error -- a .mjs tool with no declaration file, like its siblings.
} from "../../scripts/canvas-additions.mjs";

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

describe("isCanvasSource", () => {
  it.each([
    "apps/hub/src/shared/presentation/nebula-canvas.tsx",
    "apps/hub/src/shared/domain/canvas-field.ts",
    "apps/hub/src/shared/domain/canvas-motion.ts",
    "apps/hub/src/shared/domain/canvas-resolution.ts",
    "apps/hub/src/shared/domain/canvas-slots.ts",
    "apps/hub/src/shared/application/canvas-raster.ts",
    "apps/hub/src/shared/application/nebula-noise.ts",
    "apps/hub/src/shared/application/nebula-preference.ts",
    "apps/hub/tests/e2e/canvas-performance.spec.ts",
    "apps/hub/tests/canvas-raster.test.ts",
  ])("watches %s", (path) => {
    expect(isCanvasSource(path)).toBe(true);
  });

  // **The half this check was missing, and it cost every pull request in a
  // run of them.** None of these is named for a canvas, every one of them decides
  // what a personalised page costs to paint, and the suite was skipped from
  // #150 to #155 — runs which between them changed skins, layouts, section
  // styles and the page background — because the pattern only knew the
  // renderers.
  it.each([
    "apps/hub/src/shared/domain/skins.ts",
    "apps/hub/src/app/globals.css",
    "apps/hub/src/features/actors/domain/actor-theme.ts",
    "apps/hub/src/features/actors/presentation/public-sections.tsx",
    "apps/hub/src/features/actors/presentation/section-card.tsx",
    "apps/hub/src/features/actors/presentation/gradient-picker.tsx",
    "apps/hub/src/features/actors/presentation/theme-configurator.tsx",
    "apps/hub/tests/e2e/personalised-page-cost.spec.ts",
  ])("watches %s, which decides what a page costs", (path) => {
    expect(isCanvasSource(path)).toBe(true);
  });

  it.each([
    "supabase/migrations/0009_sections.sql",
    "apps/hub/messages/es.json",
    "apps/hub/src/shared/presentation/page-shell.tsx",
    "apps/hub/src/features/actors/domain/embeds.ts",
    "docs/integrating.md",
    // Named for a canvas but not in the app — the picker's own copy of the
    // list lives elsewhere and cannot change what a frame costs.
    "packages/identity/src/canvas.ts",
  ])("ignores %s", (path) => {
    expect(isCanvasSource(path)).toBe(false);
  });

  it("reads a Windows path, which is what git prints on one", () => {
    expect(
      isCanvasSource("apps\\hub\\src\\shared\\domain\\canvas-field.ts"),
    ).toBe(true);
  });

  it("does not match a name that merely contains the word", () => {
    // `sub-canvas-thing.ts` is not part of this family; the pattern anchors to
    // the start of the basename so a future unrelated module is not swept in.
    expect(
      isCanvasSource("apps/hub/src/shared/domain/my-canvas-notes.ts"),
    ).toBe(false);
  });

  it("watches every canvas module that exists today", () => {
    // The assertion that fails if one of them is renamed out of the family —
    // which is the only way this pattern can quietly stop watching something.
    const real = [
      "apps/hub/src/shared/presentation/nebula-canvas.tsx",
      "apps/hub/src/shared/domain/canvas-field.ts",
      "apps/hub/src/shared/domain/canvas-slots.ts",
      "apps/hub/src/shared/application/canvas-raster.ts",
    ];
    for (const path of real) {
      expect(
        existsSync(new URL(`../../${path}`, import.meta.url)),
        `${path} no longer exists — the pattern may have stopped matching it`,
      ).toBe(true);
    }
    expect(real.filter((path) => !isCanvasSource(path))).toEqual([]);
  });
});

describe("touchedCanvasSources", () => {
  it("picks the canvas files out of a real-looking change", () => {
    expect(
      touchedCanvasSources([
        "docs/integrating.md",
        "apps/hub/src/shared/domain/canvas-field.ts",
        "supabase/migrations/0009_sections.sql",
        "apps/hub/src/shared/presentation/nebula-canvas.tsx",
      ]),
    ).toEqual([
      "apps/hub/src/shared/domain/canvas-field.ts",
      "apps/hub/src/shared/presentation/nebula-canvas.tsx",
    ]);
  });

  it("finds nothing in a change that touches none of them", () => {
    expect(
      touchedCanvasSources([
        "docs/integrating.md",
        "apps/hub/messages/es.json",
      ]),
    ).toEqual([]);
  });

  it("drops the blank line git leaves at the end of its output", () => {
    expect(touchedCanvasSources(["", "  ", ""])).toEqual([]);
  });
});
