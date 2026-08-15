/**
 * The cloud texture behind every page, as pure functions.
 *
 * Kept separate from the canvas component on purpose: this is the part that has
 * failed twice — once painting nothing, once painting a sheet of white noise —
 * and neither failure raised an error. Isolating it is what makes the output
 * distribution assertable in the test suite rather than judged by eye.
 */

/**
 * How far apart noise cells sit, in tile pixels. Larger means softer clouds.
 *
 * A tile's size must be a whole multiple of this, so the noise lattice closes
 * on itself and the tile can repeat without a seam.
 */
export const CELL_SIZE = 32;

/** Octaves summed by {@link fbm}. Fewer reads as blur; more costs setup time. */
const OCTAVES = 5;

/**
 * The highest value {@link fbm} can realistically reach.
 *
 * Five octaves at halving amplitude sum to just under 1, but the noise itself
 * averages 0.5, so real samples cluster well below the ceiling. A bias at or
 * above this cannot produce a visible pixel — {@link tilePixels} rejects it
 * rather than returning an invisible tile.
 */
const BIAS_CEILING = 0.95;

/**
 * A 32-bit integer hash.
 *
 * `Math.imul` is the explicit 32-bit multiply. Swapping it for `*` happens to
 * produce a byte-identical field at the sizes used here — measured, not
 * assumed, because the surrounding `^` and `>>>` coerce each intermediate back
 * to int32 before the double loses anything that matters. It stays because
 * correctness should not rest on that coincidence holding for every future
 * seed and tile size, not because a regression test would catch the swap. No
 * test does; do not add one claiming otherwise.
 *
 * @param x - grid x.
 * @param y - grid y.
 * @param seed - layer seed.
 * @returns a value in [0, 1).
 */
function hash(x: number, y: number, seed: number): number {
  let n =
    Math.imul(x | 0, 374_761_393) ^
    Math.imul(y | 0, 668_265_263) ^
    Math.imul(seed | 0, 1_274_126_177);
  n = Math.imul(n ^ (n >>> 13), 1_274_126_177);
  n ^= n >>> 16;
  return (n >>> 0) / 4_294_967_296;
}

/**
 * Smoothstep, so noise cells blend instead of showing their grid.
 *
 * @param t - position within a cell, 0 to 1.
 * @returns the eased position.
 */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Positive modulo, so a lattice wraps correctly at and below zero.
 *
 * @param value - the value to wrap.
 * @param period - the lattice period; zero or less means no wrapping.
 * @returns the wrapped value.
 */
const wrap = (value: number, period: number): number =>
  period > 0 ? ((value % period) + period) % period : value;

/**
 * Bilinearly interpolated value noise, optionally on a repeating lattice.
 *
 * @param x - sample x, in cells.
 * @param y - sample y, in cells.
 * @param seed - layer seed.
 * @param period - lattice period in cells; 0 for a non-repeating field.
 * @returns a value in [0, 1].
 */
function valueNoise(
  x: number,
  y: number,
  seed: number,
  period: number,
): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const x0 = wrap(xi, period);
  const y0 = wrap(yi, period);
  const x1 = wrap(xi + 1, period);
  const y1 = wrap(yi + 1, period);
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/**
 * Fractional Brownian motion — five octaves of value noise.
 *
 * This is the cloud structure. One octave reads as blur; the stacked octaves
 * are what give dust its grain at two scales at once.
 *
 * Deterministic for a given `(x, y, seed)`, which is what lets a tile be
 * rendered once and reused for the life of the page.
 *
 * With a `period`, the field repeats exactly every `period` cells in both axes,
 * which is what makes a tile seamless. Every octave wraps at its own multiple
 * of the period, so all five close together rather than only the first.
 *
 * @param x - sample x, in cells.
 * @param y - sample y, in cells.
 * @param seed - layer seed; different seeds give visually independent fields.
 * @param period - repeat length in cells, or 0 for a field that never repeats.
 * @returns a value in [0, 1], whose median over an area sits near 0.5.
 */
export function fbm(x: number, y: number, seed: number, period = 0): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < OCTAVES; octave++) {
    value +=
      valueNoise(
        x * frequency,
        y * frequency,
        seed + octave * 17,
        period * frequency,
      ) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return Math.min(1, value);
}

/** How a cloud tile is tinted and thresholded. */
export interface TileOptions {
  /** Layer seed, so two tiles drifting past each other are not the same cloud. */
  seed: number;
  /** The tint, as 0–255 sRGB channels. */
  rgb: [number, number, number];
  /** Multiplier applied after the bias. Higher gives harder cloud edges. */
  gain: number;
  /** Noise at or below this becomes fully transparent. */
  bias: number;
}

/**
 * RGBA pixels for one cloud tile.
 *
 * Rendered once and then drifted with `drawImage`, so the noise cost is paid at
 * setup rather than every frame.
 *
 * The tile is **seamless**: it is generated on a lattice that repeats every
 * `size / CELL_SIZE` cells, so drawing it edge to edge shows no join. Without
 * this the repeat is a visible vertical and horizontal band across the page —
 * which is exactly what the first version did.
 *
 * Every argument that could produce a silently invisible tile is rejected
 * instead. That is the whole point of the guards: an empty canvas looks like a
 * styling problem and gets debugged for hours, whereas a thrown error names its
 * cause immediately.
 *
 * Unchanged in behaviour; only its numeric literals took the canonical spelling.
 *
 * @param width - tile width in pixels; a positive multiple of {@link CELL_SIZE}.
 * @param height - tile height in pixels; a positive multiple of
 * {@link CELL_SIZE}.
 * @param options - tint and threshold.
 * @returns RGBA bytes, four per pixel, in row-major order. Backed by a plain
 * `ArrayBuffer`, never a `SharedArrayBuffer`, so the result can be handed
 * straight to `new ImageData(...)` without a copy.
 * @throws when width or height is not a positive multiple of {@link CELL_SIZE}
 * — which would seam — or when `gain` is not positive, or when `bias` sits at
 * or above the value fbm can reach, each of which yields a fully transparent
 * tile rather than a visible one.
 */
export function tilePixels(
  width: number,
  height: number,
  options: TileOptions,
): Uint8ClampedArray<ArrayBuffer> {
  if (width <= 0 || height <= 0) {
    throw new Error("tilePixels needs a positive width and height");
  }
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new TypeError("tilePixels needs an integer width and height");
  }
  if (width % CELL_SIZE !== 0 || height % CELL_SIZE !== 0) {
    throw new Error(
      `tilePixels needs a size that is a multiple of ${CELL_SIZE}, or the tile seams`,
    );
  }
  if (width !== height) {
    throw new Error(
      "tilePixels needs a square tile, or the lattice mismatches",
    );
  }
  const { seed, rgb, gain, bias } = options;
  if (gain <= 0) {
    throw new Error("tilePixels needs a positive gain, or the tile is empty");
  }
  if (bias >= BIAS_CEILING) {
    throw new Error(
      `tilePixels needs a bias below ${BIAS_CEILING}, or no pixel is visible`,
    );
  }
  const period = width / CELL_SIZE;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = fbm(x / CELL_SIZE, y / CELL_SIZE, seed, period);
      const alpha = Math.max(0, Math.min(1, (n - bias) * gain));
      const i = (y * width + x) * 4;
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
      out[i + 3] = alpha * 255;
    }
  }
  return out;
}
