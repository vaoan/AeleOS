import { describe, expect, it } from "vitest";
import {
  derivePalette,
  hexFromOklchValue,
  isDarkBackground,
} from "@/shared/domain/palette";
import {
  contrastRatio,
  parseHex,
  srgbToOklch,
  type Oklch,
} from "@/shared/domain/color";

/**
 * Reads one token back out of a palette as OKLCH.
 *
 * @param palette - the derived palette.
 * @param token - the custom property name.
 * @returns the colour.
 */
function colourOf(palette: Record<string, string>, token: string): Oklch {
  const found = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(
    palette[token] ?? "",
  );
  if (!found) throw new Error(`${token} is not a colour: ${palette[token]}`);
  return [Number(found[1]), Number(found[2]), Number(found[3])];
}

// Deliberately hostile: the extremes, the mid-lightness colours that are hard
// to be readable against in either direction, and the fully saturated hues.
const BACKGROUNDS = [
  "#ffffff",
  "#000000",
  "#7f7f7f",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#00ffff",
  "#ff00ff",
  "#1a1a2e",
  "#f5e6d3",
  "#2d1b4e",
  "#0a0a0a",
  "#fefefe",
];

describe("derivePalette", () => {
  // **The author's own colours are kept exactly.** This reverses an earlier
  // design that pushed a background's lightness away from the middle and capped
  // its chroma so text could always clear 4.5:1. Full creativity is the product
  // decision: a page may be as garish as its owner likes, because the visitor
  // can switch to the default light or dark theme. The escape hatch is what
  // makes the freedom safe, not the correction.
  it.each(BACKGROUNDS)("renders %s exactly as it was picked", (background) => {
    const palette = derivePalette(background, "#00ff88");
    const chosen = srgbToOklch(parseHex(background) as number[]);
    // The field is a gradient, so the chosen colour is its far stop.
    const stops = [
      ...(palette["--field"] ?? "").matchAll(
        /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g,
      ),
    ];
    const base = stops[stops.length - 1]!;
    expect(Number(base[1])).toBeCloseTo(chosen[0], 3);
    expect(Number(base[2])).toBeCloseTo(chosen[1], 3);
  });

  it("renders the accent exactly as it was picked", () => {
    const chosen = srgbToOklch(parseHex("#00ff88") as number[]);
    const palette = derivePalette("#1a1a2e", "#00ff88");
    expect(colourOf(palette, "--accent")[0]).toBeCloseTo(chosen[0], 3);
    expect(colourOf(palette, "--accent")[1]).toBeCloseTo(chosen[1], 3);
  });

  // What the author does NOT pick is still chosen to be as readable as that
  // background allows. On ordinary backgrounds that means clearing the minimum.
  describe.each([
    "#ffffff",
    "#000000",
    "#1a1a2e",
    "#f5e6d3",
    "#2d1b4e",
    "#0a0a0a",
  ])("on the readable background %s", (background) => {
    const palette = derivePalette(background, "#00ff88");
    const surface = colourOf(palette, "--surface");

    it.each(["--ink", "--ink-2", "--muted"])(
      "%s clears the text minimum",
      (token) => {
        expect(
          contrastRatio(colourOf(palette, token), surface),
        ).toBeGreaterThanOrEqual(4.5);
      },
    );

    it("the border clears the non-text minimum", () => {
      expect(
        contrastRatio(colourOf(palette, "--edge"), surface),
      ).toBeGreaterThanOrEqual(3);
    });
  });

  // A mid-grey has NO text colour that clears 4.5:1 in either direction. The
  // honest answer is the better of the two, not a promise — and not a silently
  // altered background, which is what this used to do.
  it.each(["#7f7f7f", "#808080"])(
    "gives %s the best text available rather than promising a minimum",
    (background) => {
      const palette = derivePalette(background, "#00ff88");
      const surface = colourOf(palette, "--surface");
      const ratio = contrastRatio(colourOf(palette, "--ink"), surface);
      // About 2.97 in practice — the best a mid-grey allows.
      expect(ratio).toBeGreaterThan(2.5);
      // The point: it does NOT reach the text minimum, and nothing pretends it
      // does. If a future change makes this pass, the background is being
      // corrected again and that was deliberately given up.
      expect(ratio).toBeLessThan(4.5);
    },
  );

  // One measurement of "is this page dark", shared by every token. Deciding it
  // per token by `lightness < 0.5` is what once put a white heading and
  // near-black body text on the same blue field.
  it.each(BACKGROUNDS)("agrees with itself about %s", (background) => {
    const palette = derivePalette(background, "#00ff88");
    const surface = colourOf(palette, "--surface");
    const above = (token: string) => colourOf(palette, token)[0] > surface[0];
    expect(above("--muted")).toBe(above("--ink"));
    expect(above("--edge")).toBe(above("--ink"));
  });

  it("keeps a heading louder than a muted label", () => {
    const palette = derivePalette("#1a1a2e", "#00ff88");
    const surface = colourOf(palette, "--surface");
    expect(contrastRatio(colourOf(palette, "--ink"), surface)).toBeGreaterThan(
      contrastRatio(colourOf(palette, "--muted"), surface),
    );
  });

  // The hue carries into every token, so a palette reads as one colour scheme
  // rather than as grey text dropped onto a tint.
  it("carries the background's hue into the text", () => {
    const palette = derivePalette("#2d1b4e", "#00ff88");
    expect(colourOf(palette, "--ink")[2]).toBeCloseTo(
      colourOf(palette, "--surface")[2],
      0,
    );
  });

  it("gives the page a gradient rather than a flat fill", () => {
    expect(derivePalette("#1a1a2e", "#00ff88")["--field"]).toContain(
      "radial-gradient",
    );
  });

  it.each([
    ["#0a0a0a", "screen"],
    ["#fefefe", "multiply"],
  ])("blends the cloud for %s with %s", (background, blend) => {
    expect(derivePalette(background, "#00ff88")["--nebula-blend"]).toBe(blend);
  });

  it("keeps a label on the accent readable, since nobody picks that one", () => {
    for (const accent of ["#00ff88", "#000000", "#ffffff", "#7f7f7f"]) {
      const palette = derivePalette("#1a1a2e", accent);
      expect(
        contrastRatio(
          colourOf(palette, "--on-accent"),
          colourOf(palette, "--accent"),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("falls back to the text colour when the accent is not a colour", () => {
    const palette = derivePalette("#1a1a2e", "nonsense");
    expect(palette["--accent"]).toBe(palette["--ink"]);
  });

  it.each(["", "not a colour", "#12345"])("derives nothing from %o", (bad) => {
    expect(derivePalette(bad, "#00ff88")).toEqual({});
  });
});

describe("isDarkBackground", () => {
  it.each([
    ["#000000", true],
    ["#1a1a2e", true],
    ["#ffffff", false],
    ["#f5e6d3", false],
  ])("reads %s as dark=%s", (hex, dark) => {
    expect(isDarkBackground(hex)).toBe(dark);
  });

  it("is not dark when the value is not a colour", () => {
    expect(isDarkBackground("nonsense")).toBe(false);
  });
});

describe("hexFromOklchValue", () => {
  // The configurator seeds its inputs from the live computed styles, so that
  // nothing moves the moment somebody starts theming.
  it("reads a computed value back to hex", () => {
    expect(hexFromOklchValue("oklch(0.46 0.15 25)")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("tolerates the spacing a browser produces", () => {
    expect(hexFromOklchValue("oklch( 0.46  0.15  25 )")).toMatch(
      /^#[0-9a-f]{6}$/,
    );
  });

  it.each(["", "rebeccapurple", "rgb(1 2 3)"])(
    "returns null for %o",
    (value) => {
      expect(hexFromOklchValue(value)).toBeNull();
    },
  );
});
