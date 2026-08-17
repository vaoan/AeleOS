/**
 * Types for the token contrast checker.
 *
 * The checker itself is plain `.mjs` so it can run as a CLI without a build
 * step or a TypeScript loader, matching `check-doc-freshness.mjs`. This
 * declaration exists so its tests can be written in TypeScript and still
 * typecheck.
 */

/** An OKLCH colour as `[lightness, chroma, hue]`. */
export type Oklch = [number, number, number];

/**
 * Converts an OKLCH colour to gamma-encoded sRGB.
 *
 * @param l - lightness, 0 to 1.
 * @param c - chroma.
 * @param h - hue in degrees.
 * @returns the sRGB channels, each within 0..1.
 */
export declare function oklchToSrgb(l: number, c: number, h: number): number[];

/**
 * WCAG contrast ratio between two OKLCH colours.
 *
 * @param fg - one colour as `[l, c, h]`.
 * @param bg - the other colour as `[l, c, h]`.
 * @returns the ratio, from 1 (identical) to 21 (black against white).
 */
export declare function contrastRatio(fg: Oklch, bg: Oklch): number;

/**
 * Flattens a translucent colour over an opaque one, in linear light.
 *
 * @param fg - the translucent colour as `[l, c, h]`.
 * @param alpha - its alpha, 0 to 1.
 * @param bg - the opaque colour behind it as `[l, c, h]`.
 * @returns the resulting opaque sRGB triple, gamma-encoded.
 */
export declare function composite(
  fg: Oklch,
  alpha: number,
  bg: Oklch,
): number[];

/**
 * Contrast ratio between an already-composited sRGB colour and an OKLCH one.
 *
 * @param rgb - a gamma-encoded sRGB triple.
 * @param other - the other colour as `[l, c, h]`.
 * @returns the ratio, from 1 to 21.
 */
export declare function contrastRatioSrgb(rgb: number[], other: Oklch): number;

/**
 * Contrast ratio between two gamma-encoded sRGB colours, each channel 0..1.
 *
 * The pair form, for callers holding two measured colours rather than a
 * measurement and a token.
 *
 * @param one - a gamma-encoded sRGB triple.
 * @param two - the other, in the same form.
 * @returns the ratio, from 1 to 21.
 */
export declare function contrastRatioBetweenSrgb(
  one: number[],
  two: number[],
): number;

/** The avatar ring per mode: label, ring, alpha, and the field behind it. */
export declare const RINGS: [string, Oklch, number, Oklch][];

/** The two avatars a ring has to survive: pure white and pure black. */
export declare const AVATARS: [string, Oklch][];
