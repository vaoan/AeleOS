/** A colour as OKLCH: lightness 0–1, chroma, hue in degrees. */
export type Oklch = [number, number, number];

/** Which of the two schemes a colour has to survive. */
export type ThemeMode = "light" | "dark";

/**
 * Converts OKLCH to sRGB channels in 0–1.
 *
 * The same conversion `scripts/check-contrast.mjs` performs, and
 * `color.test.ts` asserts the two agree — a build gate and a runtime solver
 * that disagree about a colour would each be certifying a different page.
 *
 * Unchanged in behaviour.
 *
 * @param l - lightness, 0–1.
 * @param c - chroma.
 * @param h - hue in degrees.
 * @returns the three channels, each clamped into 0–1.
 */
export function oklchToSrgb(l: number, c: number, h: number): number[] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b2 = c * Math.sin(rad);
  const lLms = l + 0.396_337_777_4 * a + 0.215_803_757_3 * b2;
  const mLms = l - 0.105_561_345_8 * a - 0.063_854_172_8 * b2;
  const sLms = l - 0.089_484_177_5 * a - 1.291_485_548 * b2;
  const L = lLms ** 3;
  const M = mLms ** 3;
  const S = sLms ** 3;
  const linear = [
    4.076_741_662_1 * L - 3.307_711_591_3 * M + 0.230_969_929_2 * S,
    -1.268_438_004_6 * L + 2.609_757_401_1 * M - 0.341_319_396_5 * S,
    -0.004_196_086_3 * L - 0.703_418_614_7 * M + 1.707_614_701 * S,
  ];
  return linear.map((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    return clamped <= 0.003_130_8
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  });
}

/**
 * Converts sRGB channels in 0–1 back to OKLCH.
 *
 * The inverse of {@link oklchToSrgb}, needed because a picker hands over a hex
 * value and the solver works in OKLCH — lightness is the axis it has to move,
 * and it is the one axis sRGB does not have.
 *
 * **Grey gets a real hue rather than `NaN`.** `atan2(0, 0)` is zero in
 * JavaScript rather than undefined, so this is already true; it is stated
 * because a `NaN` reaching a custom property renders as nothing at all, which
 * is the failure that would be hardest to trace back to here.
 *
 * Unchanged in behaviour.
 *
 * @param rgb - three channels in 0–1.
 * @returns the colour as OKLCH.
 */
export function srgbToOklch(rgb: number[]): Oklch {
  const [r, g, b] = rgb.map((ch) =>
    ch <= 0.040_45 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  const l = Math.cbrt(
    0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b,
  );
  const m = Math.cbrt(
    0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b,
  );
  const s = Math.cbrt(
    0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b,
  );
  const lightness =
    0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s;
  const a = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
  const b2 = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;
  const hue = (Math.atan2(b2, a) * 180) / Math.PI;
  return [lightness, Math.hypot(a, b2), hue < 0 ? hue + 360 : hue];
}

/**
 * The relative luminance of sRGB channels in 0–1.
 *
 * @param rgb - three channels in 0–1.
 * @returns the luminance.
 */
function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((ch) =>
    ch <= 0.040_45 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The WCAG contrast ratio between two OKLCH colours.
 *
 * @param fg - one colour.
 * @param bg - the other.
 * @returns the ratio, at least 1.
 */
export function contrastRatio(fg: Oklch, bg: Oklch): number {
  const a = luminance(oklchToSrgb(...fg));
  const b = luminance(oklchToSrgb(...bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Reads `#rgb`, `#rrggbb` or either without the hash.
 *
 * Refusing is an ordinary outcome, not a fault: this parses a value that comes
 * out of a `jsonb` column and off a field somebody can type into.
 *
 * Expands a three-digit hex by spreading the string rather than splitting it, which is the same operation with one fewer intermediate array.
 *
 * @param hex - what was stored or typed.
 * @returns the channels in 0–1, or null.
 */
export function parseHex(hex: string | undefined): number[] | null {
  const cleaned = (hex ?? "").trim().replace(/^#/, "");
  const full =
    cleaned.length === 3 ? [...cleaned].map((ch) => ch + ch).join("") : cleaned;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
}

/**
 * Formats sRGB channels as `#rrggbb`.
 *
 * **Channels are clamped first.** A colour that left the gamut during
 * conversion has channels marginally outside 0–1, and an unclamped one formats
 * as a five-digit string or `NaN` — either of which reaches an `input` that
 * then silently shows black.
 *
 * @param rgb - three channels in 0–1.
 * @returns the hex value, with its hash.
 */
export function toHex(rgb: number[]): string {
  return `#${rgb
    .map((ch) =>
      Math.round(Math.max(0, Math.min(1, ch)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
