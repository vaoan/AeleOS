import { describe, expect, it } from "vitest";
import {
  contrastRatio as scriptContrast,
  oklchToSrgb as scriptOklchToSrgb,
} from "../../../scripts/check-contrast.mjs";
import {
  SURFACE,
  contrastRatio,
  legibleAccent,
  oklchToSrgb,
  parseHex,
  srgbToOklch,
  toHex,
} from "@/shared/domain/color";

describe("parseHex", () => {
  it.each([
    ["#ff0000", [1, 0, 0]],
    ["#00FF00", [0, 1, 0]],
    ["#f00", [1, 0, 0]],
    ["ff0000", [1, 0, 0]],
  ])("reads %s", (hex, expected) => {
    const rgb = parseHex(hex);
    expect(rgb?.map((v) => Math.round(v * 100) / 100)).toEqual(expected);
  });

  // The value comes out of a jsonb column and off an input somebody can type
  // into, so refusing has to be an ordinary outcome rather than a throw.
  it.each(["", "#12", "#12345", "not a colour", "#gggggg", "#1234567"])(
    "refuses %s",
    (hex) => {
      expect(parseHex(hex)).toBeNull();
    },
  );
});

describe("toHex", () => {
  it("round-trips a colour", () => {
    expect(toHex([1, 0, 0])).toBe("#ff0000");
  });

  // Every channel out of the OKLCH conversion can land marginally outside
  // [0,1], and an unclamped channel formats as `#NaN` or a five-digit string.
  it("clamps a channel that left the gamut", () => {
    expect(toHex([1.4, -0.2, 0.5])).toBe("#ff0080");
  });
});

describe("srgbToOklch", () => {
  // The inverse of the conversion the contrast script already ships. Asserting
  // the round trip rather than hand-computed constants: what matters is that
  // the two directions agree, because the accent is converted one way to be
  // adjusted and the other way to be rendered.
  it.each([
    [0.46, 0.15, 25],
    [0.74, 0.18, 350],
    [0.78, 0.12, 200],
    [0.5, 0.05, 130],
  ])("round-trips oklch(%s %s %s)", (l, c, h) => {
    const back = srgbToOklch(oklchToSrgb(l, c, h));
    expect(back[0]).toBeCloseTo(l, 2);
    expect(back[1]).toBeCloseTo(c, 2);
    expect(back[2]).toBeCloseTo(h, 0);
  });

  // Grey has no hue. The conversion must not produce a NaN from atan2(0, 0)
  // and carry it into a CSS value that renders as nothing.
  it.each([
    [0, 0, 0],
    [1, 1, 1],
    [0.5, 0.5, 0.5],
  ])("gives grey a real hue: %o", (...rgb) => {
    const [l, c, h] = srgbToOklch(rgb);
    expect(Number.isFinite(l)).toBe(true);
    expect(c).toBeCloseTo(0, 2);
    expect(Number.isFinite(h)).toBe(true);
  });
});

describe("the contrast maths agrees with the build gate", () => {
  // `scripts/check-contrast.mjs` measures the fixed design tokens and this
  // module measures colours somebody picks. Two implementations of the same
  // formula is a drift risk, so the agreement is asserted rather than assumed —
  // if they part ways, one of the two is lying about legibility.
  it.each([
    [
      [0.46, 0.15, 25],
      [0.99, 0.01, 40],
    ],
    [
      [0.74, 0.18, 350],
      [0.16, 0.04, 305],
    ],
    [
      [0.5, 0.2, 140],
      [0.2, 0.05, 200],
    ],
  ])("matches on %o against %o", (fg, bg) => {
    expect(
      contrastRatio(
        fg as [number, number, number],
        bg as [number, number, number],
      ),
    ).toBeCloseTo(
      scriptContrast(
        fg as [number, number, number],
        bg as [number, number, number],
      ),
      6,
    );
  });

  it("converts colours identically", () => {
    expect(oklchToSrgb(0.6, 0.12, 200)).toEqual(
      scriptOklchToSrgb(0.6, 0.12, 200),
    );
  });
});

describe("legibleAccent", () => {
  const MODES = ["light", "dark"] as const;

  // The whole point. Somebody may pick any colour at all, including the ones
  // that cannot be read on their own page — so the hue and the chroma they
  // chose are kept and the LIGHTNESS is solved for. Warning them instead would
  // mean shipping a picker whose advice can be ignored, and a public page that
  // a stranger cannot read is worse than a page in a colour nobody chose.
  it.each([
    "#ffffff",
    "#000000",
    "#ffff00",
    "#0000ff",
    "#7f7f7f",
    "#ff00ff",
    "#00ffff",
    "#123456",
  ])("makes %s readable in both modes", (hex) => {
    for (const mode of MODES) {
      const { accent } = legibleAccent(hex, mode);
      expect(contrastRatio(accent, SURFACE[mode])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(["#ffffff", "#000000", "#ffff00", "#0000ff", "#7f7f7f"])(
    "gives %s a foreground that can sit on it",
    (hex) => {
      for (const mode of MODES) {
        const { accent, onAccent } = legibleAccent(hex, mode);
        expect(contrastRatio(onAccent, accent)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  // Keeping the hue is what makes this an adjustment rather than a substitute.
  // If a chosen pink came back as a readable green, the picker would be a lie.
  it("keeps the hue somebody chose", () => {
    const chosen = srgbToOklch(parseHex("#ff0088") as number[]);
    for (const mode of MODES) {
      const { accent } = legibleAccent("#ff0088", mode);
      expect(accent[2]).toBeCloseTo(chosen[2], 0);
    }
  });

  // A colour already legible must come back untouched, or every accent drifts
  // toward the same two lightnesses and the picker stops mattering.
  it("leaves an already-legible colour alone", () => {
    const { accent } = legibleAccent(
      toHex(oklchToSrgb(0.46, 0.15, 25)),
      "light",
    );
    expect(accent[0]).toBeCloseTo(0.46, 1);
  });

  it("falls back to the default accent when the colour is not one", () => {
    expect(legibleAccent("not a colour", "light").accent[0]).toBeCloseTo(
      0.46,
      1,
    );
    expect(legibleAccent(undefined, "dark").accent[0]).toBeCloseTo(0.74, 1);
  });
});
