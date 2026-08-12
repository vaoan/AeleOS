import { describe, expect, it } from "vitest";
import { contrastRatio, oklchToSrgb } from "../../scripts/check-contrast.mjs";

describe("oklchToSrgb", () => {
  it("converts white", () => {
    const [r, g, b] = oklchToSrgb(1, 0, 0);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(1, 2);
  });

  it("converts black", () => {
    expect(oklchToSrgb(0, 0, 0).every((c) => c < 0.01)).toBe(true);
  });

  it("clamps values outside the sRGB gamut rather than returning them", () => {
    // A very saturated colour at high lightness is not representable.
    expect(oklchToSrgb(0.99, 0.4, 150).every((c) => c >= 0 && c <= 1)).toBe(
      true,
    );
  });
});

describe("contrastRatio", () => {
  it("gives 21:1 for black on white", () => {
    expect(contrastRatio([0, 0, 0], [1, 0, 0])).toBeCloseTo(21, 0);
  });

  it("gives 1:1 for a colour against itself", () => {
    expect(contrastRatio([0.5, 0.1, 30], [0.5, 0.1, 30])).toBeCloseTo(1, 2);
  });

  it("is order-independent", () => {
    const a: [number, number, number] = [0.27, 0.045, 35];
    const b: [number, number, number] = [0.99, 0.01, 40];
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 4);
  });

  // The figure the design actually depends on.
  it("reproduces the measured light body-text ratio", () => {
    expect(contrastRatio([0.45, 0.045, 30], [0.99, 0.01, 40])).toBeGreaterThan(
      7,
    );
  });
});
