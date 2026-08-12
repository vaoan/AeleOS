/**
 * Contrast checking for the OKLCH tokens, so "measure, do not eyeball" is a
 * command rather than an instruction.
 *
 * Two of the design's borders originally failed the 3:1 non-text minimum at
 * 1.59:1 and 1.60:1 — both looked correct. This exists so that class of mistake
 * fails a build instead of shipping.
 *
 * It compares opaque colours only, which bounds what it can prove:
 *
 * - `--ring` is deliberately absent. It is translucent over an arbitrary
 *   avatar, so any number here would look like a measurement without being
 *   one. Its check is a manual one against a white and a black image, and it
 *   belongs to the task that introduces avatars.
 * - `--surface` is translucent too, and these pairs use its opaque value. In
 *   dark mode that is pessimistic: the card composites *darker* over the field,
 *   so the real ratio is higher than reported. In light mode it is optimistic
 *   near the field's darker edges — the card sits in the centre column where
 *   the field is lightest, but a full-bleed light surface would need checking
 *   against the composite, not against this.
 *
 * Figures therefore run slightly below the design spec's table, which
 * composited the card. Every pair still clears its minimum.
 *
 * Usage:
 *   node scripts/check-contrast.mjs
 */

/**
 * Converts an OKLCH colour to gamma-encoded sRGB.
 *
 * Out-of-gamut colours are clamped rather than returned as-is, because a
 * negative or greater-than-one channel would sail through the luminance
 * formula and produce a plausible-looking ratio for a colour no screen can
 * show.
 *
 * @param l - lightness, 0 to 1.
 * @param c - chroma.
 * @param h - hue in degrees.
 * @returns the sRGB channels, each within 0..1.
 */
export function oklchToSrgb(l, c, h) {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b2 = c * Math.sin(rad);
  const lLms = l + 0.3963377774 * a + 0.2158037573 * b2;
  const mLms = l - 0.1055613458 * a - 0.0638541728 * b2;
  const sLms = l - 0.0894841775 * a - 1.291485548 * b2;
  const L = lLms ** 3;
  const M = mLms ** 3;
  const S = sLms ** 3;
  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return linear.map((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  });
}

/**
 * Relative luminance of a gamma-encoded sRGB triple, per WCAG 2.1.
 *
 * @param rgb - the sRGB channels, 0..1.
 * @returns the relative luminance, 0 for black and 1 for white.
 */
function luminance(rgb) {
  const [r, g, b] = rgb.map((ch) =>
    ch <= 0.04045 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two OKLCH colours.
 *
 * Order-independent: the lighter colour is always the numerator, so callers
 * need not know which of the two is the foreground.
 *
 * @param fg - one colour as `[l, c, h]`.
 * @param bg - the other colour as `[l, c, h]`.
 * @returns the ratio, from 1 (identical) to 21 (black against white).
 */
export function contrastRatio(fg, bg) {
  const a = luminance(oklchToSrgb(...fg));
  const b = luminance(oklchToSrgb(...bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The pairs the design depends on, each with the minimum it must clear.
 *
 * Text needs 4.5:1; borders and other non-text needs 3:1. Every value here is
 * a token from `apps/hub/src/app/globals.css` — when a token moves, this list
 * moves with it or the check is measuring the old design.
 */
const PAIRS = [
  ["dark: heading on card", [0.96, 0.012, 340], [0.16, 0.04, 305], 4.5],
  ["dark: body on card", [0.8, 0.03, 330], [0.16, 0.04, 305], 4.5],
  ["dark: muted on card", [0.66, 0.03, 330], [0.16, 0.04, 305], 4.5],
  ["dark: card border", [0.52, 0.09, 325], [0.16, 0.04, 305], 3],
  ["dark: accent label", [0.16, 0.04, 350], [0.74, 0.18, 350], 4.5],
  ["dark: star on field", [0.86, 0.15, 78], [0.12, 0.03, 305], 3],
  ["light: heading on card", [0.27, 0.045, 35], [0.99, 0.01, 40], 4.5],
  ["light: body on card", [0.45, 0.045, 30], [0.99, 0.01, 40], 4.5],
  ["light: muted on card", [0.5, 0.045, 30], [0.99, 0.01, 40], 4.5],
  ["light: card border", [0.66, 0.075, 35], [0.99, 0.01, 40], 3],
  ["light: accent label", [0.98, 0.01, 40], [0.46, 0.15, 25], 4.5],
  ["light: star on field", [0.62, 0.16, 32], [0.98, 0.016, 45], 3],
];

/**
 * Checks every pair and reports the result.
 *
 * @returns nothing; exits non-zero when any pair is below its minimum.
 */
function main() {
  let failed = 0;
  for (const [label, fg, bg, min] of PAIRS) {
    const ratio = contrastRatio(fg, bg);
    const ok = ratio >= min;
    if (!ok) failed += 1;
    console.log(
      `${ok ? "  " : "x "}${label.padEnd(26)} ${ratio.toFixed(2)}:1 (needs ${min})`,
    );
  }
  if (failed) {
    console.error(`\n${failed} pair(s) below the minimum.`);
    process.exit(1);
  }
  console.log(`\nAll ${PAIRS.length} token pairs clear their minimum.`);
}

// Only runs as a CLI, so the tests can import the pure functions.
if (process.argv[1]?.endsWith("check-contrast.mjs")) main();
