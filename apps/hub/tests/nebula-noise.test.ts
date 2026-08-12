import { describe, expect, it } from "vitest";
import { CELL_SIZE, fbm, tilePixels } from "@/shared/application/nebula-noise";

/** A valid tile size: square and a whole number of noise cells. */
const SIZE = CELL_SIZE * 8;

describe("fbm", () => {
  it("stays within 0 and 1", () => {
    for (let i = 0; i < 200; i++) {
      const v = fbm(i * 0.37, i * 0.11, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for the same seed", () => {
    expect(fbm(3.5, 2.5, 7)).toBe(fbm(3.5, 2.5, 7));
  });

  it("differs between seeds, or every layer would be identical", () => {
    expect(fbm(3.5, 2.5, 7)).not.toBe(fbm(3.5, 2.5, 23));
  });

  it("varies across space, or the field would be one flat tone", () => {
    const a = fbm(0.5, 0.5, 7);
    const b = fbm(9.5, 4.25, 7);
    expect(a).not.toBe(b);
  });

  // Guards the shape of the historical bug: a field whose median sits far from
  // its threshold clamps every pixel to zero (blank canvas) or to one (a solid
  // sheet), and neither raises an error.
  //
  // Verified by sabotage — moving the octave amplitudes red-lines this. It does
  // NOT catch swapping Math.imul for `*`: that was measured and produces an
  // identical field. See the note on `hash`.
  it("has a median near the middle of its range", () => {
    const values: number[] = [];
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 60; x++) values.push(fbm(x / 26, y / 26, 7));
    }
    values.sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    expect(median).toBeGreaterThan(0.35);
    expect(median).toBeLessThan(0.65);
  });

  // A hash that overflows the double collapses onto a few values. Distinct
  // output is what proves it did not.
  it("produces many distinct values rather than collapsing", () => {
    const seen = new Set<number>();
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) seen.add(fbm(x / 9, y / 9, 3));
    }
    expect(seen.size).toBeGreaterThan(1000);
  });
});

describe("tilePixels", () => {
  const opts = {
    seed: 7,
    rgb: [200, 80, 160] as [number, number, number],
    gain: 2.4,
    bias: 0.44,
  };

  it("returns four channels per pixel", () => {
    expect(tilePixels(SIZE, SIZE, opts).length).toBe(SIZE * SIZE * 4);
  });

  it("paints the requested colour", () => {
    const px = tilePixels(SIZE, SIZE, opts);
    expect(px[0]).toBe(200);
    expect(px[1]).toBe(80);
    expect(px[2]).toBe(160);
  });

  // The defect these catch shipped, and showed as vertical and horizontal
  // bands across the page: the tile is drawn edge to edge, so the step from
  // the last column back to the first must be an ordinary step, not a jump.
  //
  // Compared against the tile's own interior gradient rather than a constant.
  // A fixed tolerance is a guess about the gain and cell size that stops being
  // true the moment either is tuned; this stays honest through both.
  const alphaAt = (px: Uint8ClampedArray, x: number, y: number) =>
    px[(y * SIZE + x) * 4 + 3]!;

  /**
   * The largest step between horizontally adjacent pixels inside the tile.
   *
   * @param px - the tile.
   * @returns the maximum interior step, in alpha units.
   */
  const maxInteriorStep = (px: Uint8ClampedArray): number => {
    let max = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE - 1; x++) {
        max = Math.max(
          max,
          Math.abs(alphaAt(px, x, y) - alphaAt(px, x + 1, y)),
        );
      }
    }
    return max;
  };

  it("tiles seamlessly, left edge against right", () => {
    const px = tilePixels(SIZE, SIZE, opts);
    const interior = maxInteriorStep(px);
    for (let y = 0; y < SIZE; y++) {
      const step = Math.abs(alphaAt(px, SIZE - 1, y) - alphaAt(px, 0, y));
      expect(step).toBeLessThanOrEqual(interior);
    }
  });

  it("tiles seamlessly, top edge against bottom", () => {
    const px = tilePixels(SIZE, SIZE, opts);
    const interior = maxInteriorStep(px);
    for (let x = 0; x < SIZE; x++) {
      const step = Math.abs(alphaAt(px, x, SIZE - 1) - alphaAt(px, x, 0));
      expect(step).toBeLessThanOrEqual(interior);
    }
  });

  // Cloud coverage: neither blank nor a solid sheet. Both have shipped — 0%
  // once, and 59.7% white noise another time — and neither raised an error.
  it("produces partial coverage rather than nothing or everything", () => {
    const px = tilePixels(SIZE, SIZE, opts);
    let visible = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 8) visible++;
    const pct = (visible / (px.length / 4)) * 100;
    expect(pct).toBeGreaterThan(20);
    expect(pct).toBeLessThan(95);
  });

  it("varies its alpha rather than painting one flat sheet", () => {
    const px = tilePixels(SIZE, SIZE, opts);
    const alphas = new Set<number>();
    for (let i = 3; i < px.length; i += 4) alphas.add(px[i]!);
    expect(alphas.size).toBeGreaterThan(20);
  });

  it("gives different tiles for different seeds", () => {
    const a = tilePixels(SIZE, SIZE, opts);
    const b = tilePixels(SIZE, SIZE, { ...opts, seed: 99 });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  // A bias above the noise ceiling is the "paints nothing" failure. It must be
  // a caller error rather than a silently invisible layer.
  it("rejects a bias that could only produce an empty tile", () => {
    expect(() => tilePixels(SIZE, SIZE, { ...opts, bias: 1 })).toThrow(/bias/i);
    expect(() => tilePixels(SIZE, SIZE, { ...opts, bias: 1.5 })).toThrow(
      /bias/i,
    );
  });

  it("rejects a non-positive gain, which would erase the tile", () => {
    expect(() => tilePixels(SIZE, SIZE, { ...opts, gain: 0 })).toThrow(/gain/i);
    expect(() => tilePixels(SIZE, SIZE, { ...opts, gain: -2 })).toThrow(
      /gain/i,
    );
  });

  it("rejects a non-positive size rather than returning an empty buffer", () => {
    expect(() => tilePixels(0, SIZE, opts)).toThrow(/positive/i);
    expect(() => tilePixels(SIZE, -CELL_SIZE, opts)).toThrow(/positive/i);
  });

  it("rejects a non-integer size, which would mis-shape the buffer", () => {
    expect(() => tilePixels(SIZE + 0.5, SIZE, opts)).toThrow(/integer/i);
  });

  // A size that is not a whole number of cells cannot close its lattice, so
  // the tile would seam however carefully it is drawn.
  it("rejects a size that is not a whole number of cells", () => {
    expect(() => tilePixels(SIZE + 1, SIZE + 1, opts)).toThrow(/multiple/i);
  });

  it("rejects a non-square tile, whose lattice would mismatch", () => {
    expect(() => tilePixels(SIZE, SIZE * 2, opts)).toThrow(/square/i);
  });
});
