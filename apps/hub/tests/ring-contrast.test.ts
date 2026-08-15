import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AVATARS,
  composite,
  contrastRatioSrgb,
  type Oklch,
  RINGS,
} from "../../../scripts/check-contrast.mjs";

const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/**
 * Reads `--ring` out of one theme block of the stylesheet.
 *
 * @param theme - which block to read.
 * @returns the declared value.
 */
function ringToken(theme: "light" | "dark"): string {
  const start =
    theme === "dark"
      ? CSS.indexOf('[data-theme="dark"]')
      : CSS.indexOf(":root");
  const block = CSS.slice(start, CSS.indexOf("\n}", start));
  const match = /--ring:\s*([^;]+);/.exec(block);
  if (!match) throw new Error(`--ring not found for ${theme}`);
  return match[1]!.trim();
}

describe("the avatar ring", () => {
  // The whole point of the ring: a fursona must never disappear into the
  // field behind it. White and black are the two that can, one per mode.
  it.each(RINGS)(
    "%s clears 3:1 against both a white and a black avatar",
    (_label, ring, alpha, field) => {
      const flattened = composite(ring, alpha, field);
      for (const [, avatar] of AVATARS) {
        expect(contrastRatioSrgb(flattened, avatar)).toBeGreaterThanOrEqual(3);
      }
    },
  );

  // The checker cannot read CSS, so its copy of the ring could drift from the
  // token that actually renders. Then it would keep passing while the shipped
  // ring failed — which is exactly how the first value survived review.
  it.each(["light", "dark"] as const)(
    "the %s checker values match the stylesheet",
    (theme) => {
      const [, ring, alpha] = RINGS.find(([label]) =>
        label.startsWith(theme),
      ) as [string, Oklch, number, Oklch];
      const [l, c, h] = ring;
      // Rendered in the notation the stylesheet is written in — percentages
      // for lightness and alpha, degrees for hue — because `stylelint` now
      // enforces that form and rewrote every colour into it. The comparison is
      // a string on purpose: this test exists to catch the checker's copy
      // DRIFTING from the token, and parsing both sides first would hide a
      // drift in how the value is spelled, which is how it would actually
      // happen. The float multiply is trimmed because 0.38 * 100 is not 38.
      const percent = (value: number) =>
        `${Number((value * 100).toPrecision(10))}%`;
      const expected = `oklch(${percent(l)} ${c} ${h}deg / ${percent(alpha)})`;
      expect(ringToken(theme)).toBe(expected);
    },
  );

  // The value that shipped in the design and was never measured. Kept as a
  // test so the regression is named rather than merely avoided.
  it("rejects the original light ring, which reached only 1.52:1", () => {
    const original = composite([0.3, 0.055, 30], 0.32, [0.98, 0.016, 45]);
    const vsWhite = contrastRatioSrgb(original, [1, 0, 0]);
    expect(vsWhite).toBeLessThan(3);
    expect(vsWhite).toBeCloseTo(1.52, 1);
  });
});
