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
