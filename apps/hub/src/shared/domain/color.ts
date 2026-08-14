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
 * @param l - lightness, 0–1.
 * @param c - chroma.
 * @param h - hue in degrees.
 * @returns the three channels, each clamped into 0–1.
 */
export function oklchToSrgb(l: number, c: number, h: number): number[] {
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
 * @param rgb - three channels in 0–1.
 * @returns the colour as OKLCH.
 */
export function srgbToOklch(rgb: number[]): Oklch {
  const [r, g, b] = rgb.map((ch) =>
    ch <= 0.04045 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b2 = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
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
    ch <= 0.04045 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4,
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
 * @param hex - what was stored or typed.
 * @returns the channels in 0–1, or null.
 */
export function parseHex(hex: string | undefined): number[] | null {
  const cleaned = (hex ?? "").trim().replace(/^#/, "");
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : cleaned;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
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
