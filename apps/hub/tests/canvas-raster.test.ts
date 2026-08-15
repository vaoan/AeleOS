import { describe, expect, it } from "vitest";
import {
  cellPixels,
  latticePoints,
  plasmaPixels,
  type DriftedSite,
} from "@/shared/application/canvas-raster";

/** Reads one lattice point's RGBA out of a shaded buffer. */
function pointAt(
  pixels: Uint8ClampedArray,
  columns: number,
  column: number,
  row: number,
): [number, number, number, number] {
  const at = (row * columns + column) * 4;
  return [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!, pixels[at + 3]!];
}

const RED: [number, number, number] = [255, 0, 0];
const GREEN: [number, number, number] = [0, 255, 0];

describe("latticePoints", () => {
  it("runs one point past the edge, so no strip is left unpainted", () => {
    // 100 pixels at a step of 10 needs points at 0..100 inclusive, which is
    // eleven — ten would stop the pattern ten pixels short of the right edge.
    expect(latticePoints(100, 10)).toBe(11);
  });

  it("covers a length that is not a whole number of steps", () => {
    // The last point starts at 96 and its block runs to 108, past the edge.
    expect(latticePoints(105, 12)).toBe(9);
  });

  it("gives at least one point for a length of zero", () => {
    expect(latticePoints(0, 10)).toBe(1);
  });

  it("treats a negative length as empty rather than as a negative count", () => {
    expect(latticePoints(-50, 10)).toBe(1);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses the step %p, which would loop forever or allocate nothing",
    (step) => {
      expect(() => latticePoints(100, step)).toThrow(/positive step/);
    },
  );
});

describe("cellPixels", () => {
  const two: DriftedSite[] = [
    { x: 0.25, y: 0.5, tint: 0 },
    { x: 0.75, y: 0.5, tint: 1 },
  ];

  it("lights the boundary between two sites and leaves the interiors dark", () => {
    // A square bitmap so the aspect correction is one, and a lattice fine
    // enough that a point lands on the midline between the two sites.
    const columns = 21;
    const rows = 21;
    const pixels = cellPixels(columns, rows, 10, 210, 210, two, [RED, GREEN]);

    // Column 10 is x = 100/210 ~ 0.476, and row 10 is y ~ 0.476 — near the
    // midline at 0.5, where the two distances are almost equal.
    const [, , , onEdge] = pointAt(pixels, columns, 10, 10);
    // Column 5 sits inside the left cell, far from any boundary.
    const [, , , inside] = pointAt(pixels, columns, 5, 10);

    expect(onEdge).toBeGreaterThan(0);
    expect(inside).toBe(0);
  });

  it("colours a boundary point with its nearest site's tint", () => {
    const columns = 21;
    const pixels = cellPixels(columns, 21, 10, 210, 210, two, [RED, GREEN]);
    // Column 10 is x ~ 0.476, so the nearest site is still the left one.
    const [r, g, b] = pointAt(pixels, columns, 10, 10);
    expect([r, g, b]).toEqual(RED);
  });

  it("wraps a tint index past the end of the list rather than failing", () => {
    const beyond: DriftedSite[] = [
      { x: 0.25, y: 0.5, tint: 4 },
      { x: 0.75, y: 0.5, tint: 5 },
    ];
    const columns = 21;
    const pixels = cellPixels(columns, 21, 10, 210, 210, beyond, [RED, GREEN]);
    // Tint 4 wraps to slot 0 in a two-colour list.
    const [r, g, b] = pointAt(pixels, columns, 10, 10);
    expect([r, g, b]).toEqual(RED);
  });

  it("ignores a site that is farther away than the nearest two", () => {
    // Only the NEAREST two decide a point's shading, so a third site off in a
    // corner must leave the boundary between the first two exactly where it
    // was. Track the second-nearest without checking it is not the nearest
    // and this is the case that goes wrong: the far site would displace the
    // real runner-up and wash the boundary out.
    const columns = 21;
    const near = cellPixels(columns, 21, 10, 210, 210, two, [RED, GREEN]);
    const withFar = cellPixels(
      columns,
      21,
      10,
      210,
      210,
      [...two, { x: 0.99, y: 0.99, tint: 0 }],
      [RED, GREEN],
    );
    expect(pointAt(withFar, columns, 10, 10)).toEqual(
      pointAt(near, columns, 10, 10),
    );
  });

  it("paints nothing for a single site, which has no boundary", () => {
    const pixels = cellPixels(
      11,
      11,
      10,
      110,
      110,
      [{ x: 0.5, y: 0.5, tint: 0 }],
      [RED],
    );
    expect(pixels.every((byte) => byte === 0)).toBe(true);
  });

  it("keeps a cell round when the bitmap is not square", () => {
    // The same two sites and the same lattice step, on a square bitmap and on
    // one nearly four times as wide. Distances are measured in the bitmap's
    // proportions, so on the wide one a step across is a longer journey — and
    // the lit band between the two sites must therefore be NARROWER in
    // columns. Drop the correction and the two counts come out the same,
    // which is a pattern that stretches with the window.
    const sites: DriftedSite[] = [
      { x: 0.25, y: 0, tint: 0 },
      { x: 0.75, y: 0, tint: 1 },
    ];
    /**
     * How many of 111 points across the boundary lights, at a given aspect.
     *
     * The lattice is identical in both calls — 111 points sampling x from zero
     * to one — so only the bitmap's proportion differs.
     */
    const lit = (height: number) => {
      const pixels = cellPixels(111, 1, 1, 111, height, sites, [RED, GREEN]);
      let count = 0;
      for (let column = 0; column < 111; column += 1) {
        if (pointAt(pixels, 111, column, 0)[3] > 0) count += 1;
      }
      return count;
    };

    const square = lit(111);
    const wide = lit(30);
    expect(square).toBeGreaterThan(0);
    expect(wide).toBeGreaterThan(0);
    expect(wide).toBeLessThan(square);
  });

  it.each([
    ["columns", 1.5, 4],
    ["rows", 4, 1.5],
  ])(
    "refuses a non-integer %s, which would index the buffer wrongly",
    (_, c, r) => {
      expect(() => cellPixels(c, r, 10, 100, 100, two, [RED])).toThrow(
        TypeError,
      );
    },
  );

  it.each([
    ["columns", 0, 4],
    ["rows", 4, -1],
  ])("refuses a non-positive %s", (_, c, r) => {
    expect(() => cellPixels(c, r, 10, 100, 100, two, [RED])).toThrow(
      /positive lattice/,
    );
  });

  it("refuses an empty site list rather than shading nothing in silence", () => {
    expect(() => cellPixels(4, 4, 10, 100, 100, [], [RED])).toThrow(
      /at least one site/,
    );
  });

  it("refuses an empty tint list rather than reading undefined colours", () => {
    expect(() => cellPixels(4, 4, 10, 100, 100, two, [])).toThrow(
      /at least one tint/,
    );
  });
});

describe("plasmaPixels", () => {
  it("shades every point opaque, so the pass carries the translucency", () => {
    const pixels = plasmaPixels(8, 8, 10, 80, 80, 3.2, 0, RED, GREEN);
    for (let i = 3; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(255);
    }
  });

  it("mixes only between the two colours it was given", () => {
    const pixels = plasmaPixels(8, 8, 10, 80, 80, 3.2, 0, RED, GREEN);
    for (let i = 0; i < pixels.length; i += 4) {
      // Red falls as green rises, and blue is in neither colour.
      expect(pixels[i]! + pixels[i + 1]!).toBeCloseTo(255, -1);
      expect(pixels[i + 2]).toBe(0);
    }
  });

  it("quantises into bands rather than a continuous ramp", () => {
    const pixels = plasmaPixels(64, 64, 4, 256, 256, 3.2, 0, RED, GREEN);
    const seen = new Set<number>();
    for (let i = 0; i < pixels.length; i += 4) seen.add(pixels[i]!);
    // Twenty-two bands, so at most twenty-three distinct values can appear —
    // a continuous field would show hundreds.
    expect(seen.size).toBeLessThanOrEqual(23);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("moves with time, or the demoscene's oldest trick sits still", () => {
    const still = plasmaPixels(16, 16, 10, 160, 160, 3.2, 0, RED, GREEN);
    const later = plasmaPixels(16, 16, 10, 160, 160, 3.2, 1.7, RED, GREEN);
    expect(Array.from(later)).not.toEqual(Array.from(still));
  });

  it("is the same field for the same moment, so a redraw does not shimmer", () => {
    const once = plasmaPixels(16, 16, 10, 160, 160, 3.2, 2.5, RED, GREEN);
    const again = plasmaPixels(16, 16, 10, 160, 160, 3.2, 2.5, RED, GREEN);
    expect(Array.from(again)).toEqual(Array.from(once));
  });

  it.each([
    ["columns", 1.5, 4],
    ["rows", 4, 1.5],
  ])("refuses a non-integer %s", (_, c, r) => {
    expect(() => plasmaPixels(c, r, 10, 100, 100, 3.2, 0, RED, GREEN)).toThrow(
      TypeError,
    );
  });

  it.each([
    ["columns", 0, 4],
    ["rows", 4, 0],
  ])("refuses a non-positive %s", (_, c, r) => {
    expect(() => plasmaPixels(c, r, 10, 100, 100, 3.2, 0, RED, GREEN)).toThrow(
      /positive lattice/,
    );
  });
});
