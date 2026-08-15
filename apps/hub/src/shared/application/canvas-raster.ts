/**
 * The two canvases that shade every point of a grid, as pure functions.
 *
 * `plasma` and `cells` are not drawn from shapes: they evaluate a field at each
 * point of a lattice and colour it. Everything else here paints tens or
 * hundreds of things; these two paint tens of THOUSANDS, and that difference is
 * what makes them the only canvases whose per-point cost is worth carrying in a
 * module of its own.
 *
 * They were written as one `fillRect` per point with a freshly built
 * `rgb(…)` string for its colour. Both parts of that are far more expensive
 * than the arithmetic they were carrying:
 *
 *  * **A colour assigned as a string is CSS parsed.** At the default dials
 *    `cells` sets one for each of ~26,000 points, every frame.
 *  * **`Math.hypot` is not `sqrt(a*a + b*b)`.** It rescales its arguments to
 *    avoid overflowing on values no screen coordinate can reach, and measured
 *    here it cost about thirty nanoseconds a call against roughly one for the
 *    plain arithmetic. `cells` called it once per point per site.
 *
 * Writing bytes into an `ImageData` instead has neither cost, and the result is
 * the same picture: the caller blits it back through one `drawImage`, scaled by
 * the lattice step with smoothing off, so each lattice point still lands as the
 * same flat block of pixels it was filled as before.
 *
 * Kept beside {@link tilePixels} in `application` because it is the same kind
 * of thing — a field evaluated into RGBA bytes — and for the same reason: a
 * distribution of pixels can be asserted in a test suite, where a canvas that
 * renders "wrong but plausible" cannot.
 */

/** A full turn, matching the renderers this serves. */
const TWO_PI = Math.PI * 2;

/** How many colour bands a plasma is quantised into. */
const PLASMA_BANDS = 22;

/**
 * One point a cellular pattern measures distance from.
 *
 * Positions are already drifted to the current moment: this module knows
 * nothing about time, so the caller advances the sites and this shades them.
 */
export interface DriftedSite {
  /** Where it sits, 0..1 across. */
  x: number;
  /** Where it sits, 0..1 down. */
  y: number;
  /** Which colour slot it takes. */
  tint: number;
}

/**
 * How sharply a cell edge falls off, per unit of distance difference.
 *
 * The renderer's own constant, named here because the shading now happens here.
 */
const EDGE_FALLOFF = 14;

/**
 * Below this the point is left transparent rather than painted.
 *
 * The original skipped its `fillRect` at the same threshold, so this is not a
 * new approximation — it is the same one, written down.
 */
const EDGE_FLOOR = 0.02;

/**
 * How many lattice points span a length, at a given step.
 *
 * The renderers walked `for (let x = 0; x <= width; x += step)`, so the lattice
 * runs one point PAST the edge — which is what stops a partial block at the
 * right and bottom going unpainted. Off-by-one here is a visible strip of
 * missing pattern, so it is derived in one place and tested.
 *
 * @param length - the span in bitmap pixels.
 * @param step - the distance between lattice points, in bitmap pixels.
 * @returns how many points the lattice has, at least one.
 * @throws when `step` is not a positive, finite number, which would otherwise
 * loop forever or allocate a zero-sized buffer.
 */
export function latticePoints(length: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error("latticePoints needs a positive step");
  }
  return Math.max(1, Math.floor(Math.max(0, length) / step) + 1);
}

/**
 * RGBA bytes for a cellular pattern's edges.
 *
 * **What is shaded is the difference between the nearest two distances**, which
 * is zero exactly on a Voronoi boundary and grows away from it — so the edges
 * light and the interiors stay dark. That is the renderer's own rule, moved
 * here unchanged.
 *
 * **Distances are compared squared and rooted twice at the end.** Ordering by
 * squared distance is the same ordering, so the nearest two are the same two;
 * only their difference needs the real distance, and that is two square roots
 * per point rather than one `Math.hypot` per point per site.
 *
 * @param columns - lattice width in points; see {@link latticePoints}.
 * @param rows - lattice height in points.
 * @param step - the lattice step in bitmap pixels. The field is sampled in the
 * BITMAP's proportions rather than the lattice's, which is why this is needed
 * as well as the two counts: the lattice runs one point past the edge, so
 * normalising by the point count instead would squeeze the pattern.
 * @param width - bitmap width in pixels.
 * @param height - bitmap height in pixels.
 * @param sites - the points to measure from, already drifted to this moment.
 * @param tints - one colour per slot; a site's tint indexes into it, wrapping.
 * @returns RGBA bytes, four per lattice point, row-major. Alpha carries the
 * edge strength; a point below the floor is left fully transparent. Backed by a
 * plain `ArrayBuffer`, so it can be handed to `new ImageData(...)` uncopied.
 * @throws when `columns` or `rows` is not a positive integer, when `sites` is
 * empty — which would leave every distance infinite and paint nothing — or when
 * `tints` is empty, which would make every colour lookup undefined.
 */
export function cellPixels(
  columns: number,
  rows: number,
  step: number,
  width: number,
  height: number,
  sites: DriftedSite[],
  tints: [number, number, number][],
): Uint8ClampedArray<ArrayBuffer> {
  if (!Number.isInteger(columns) || !Number.isInteger(rows)) {
    throw new TypeError("cellPixels needs an integer lattice size");
  }
  if (columns <= 0 || rows <= 0) {
    throw new Error("cellPixels needs a positive lattice size");
  }
  if (sites.length === 0) {
    throw new Error("cellPixels needs at least one site, or nothing is drawn");
  }
  if (tints.length === 0) {
    throw new Error("cellPixels needs at least one tint");
  }

  const out = new Uint8ClampedArray(columns * rows * 4);
  // Hoisted out of the loops: the site list is walked for every lattice point,
  // and reading `.length` and the tint table through the object each time is
  // work repeated tens of millions of times at the top of the dials.
  const count = sites.length;
  const aspect = width / height;

  for (let row = 0; row < rows; row += 1) {
    // The lattice point's position in 0..1, which is what the sites are in.
    const y = (row * step) / height;
    for (let column = 0; column < columns; column += 1) {
      const x = (column * step) / width;

      let nearest = Infinity;
      let second = Infinity;
      let tint = 0;
      for (let i = 0; i < count; i += 1) {
        const site = sites[i]!;
        // Measured in viewport proportions, or the cells stretch with the
        // window and stop being cells.
        const dx = (x - site.x) * aspect;
        const dy = y - site.y;
        const squared = dx * dx + dy * dy;
        if (squared < nearest) {
          second = nearest;
          nearest = squared;
          tint = site.tint;
        } else if (squared < second) {
          second = squared;
        }
      }

      // Rooted here, twice, rather than once per site above. `second` is never
      // below `nearest` by construction, so this cannot exceed one and needs no
      // ceiling — and with a single site it stays infinite, which falls under
      // the floor and paints nothing, exactly as one point with no boundary
      // should.
      const edge = 1 - (Math.sqrt(second) - Math.sqrt(nearest)) * EDGE_FALLOFF;
      if (edge < EDGE_FLOOR) continue;

      const [r, g, b] = tints[tint % tints.length]!;
      const at = (row * columns + column) * 4;
      out[at] = r;
      out[at + 1] = g;
      out[at + 2] = b;
      out[at + 3] = edge * 255;
    }
  }
  return out;
}

/**
 * RGBA bytes for a plasma: interfering sine fields, the demoscene's oldest
 * trick.
 *
 * Three sines at different frequencies and one radial term. The radial one is
 * what stops it looking like corduroy: without it the field is separable and
 * the eye reads the two axes independently.
 *
 * Quantised into bands, which is what gives plasma its poster edges.
 *
 * **The radial term uses plain arithmetic rather than `Math.hypot`** for the
 * reason this module exists, and it is a distance being compared to nothing —
 * only fed to a sine — so nothing about the result changes.
 *
 * @param columns - lattice width in points; see {@link latticePoints}.
 * @param rows - lattice height in points.
 * @param step - the lattice step in bitmap pixels, needed because the field is
 * sampled in the bitmap's own proportions rather than the lattice's.
 * @param width - bitmap width in pixels.
 * @param height - bitmap height in pixels.
 * @param frequency - how tight the interference is; the size dial divides it.
 * @param seconds - elapsed time, already multiplied by the speed dial.
 * @param from - the colour a band at zero takes.
 * @param to - the colour a band at one takes.
 * @returns RGBA bytes, four per lattice point, row-major, fully opaque — the
 * caller applies the pass's translucency once, rather than per point.
 * @throws when `columns` or `rows` is not a positive integer.
 */
export function plasmaPixels(
  columns: number,
  rows: number,
  step: number,
  width: number,
  height: number,
  frequency: number,
  seconds: number,
  from: [number, number, number],
  to: [number, number, number],
): Uint8ClampedArray<ArrayBuffer> {
  if (!Number.isInteger(columns) || !Number.isInteger(rows)) {
    throw new TypeError("plasmaPixels needs an integer lattice size");
  }
  if (columns <= 0 || rows <= 0) {
    throw new Error("plasmaPixels needs a positive lattice size");
  }

  const out = new Uint8ClampedArray(columns * rows * 4);
  const [ar, ag, ab] = from;
  const [br, bg, bb] = to;

  for (let row = 0; row < rows; row += 1) {
    const y = (row * step) / height;
    for (let column = 0; column < columns; column += 1) {
      const x = (column * step) / width;
      const rx = x - 0.5;
      const ry = y - 0.5;

      const value =
        Math.sin((x * frequency + seconds * 0.6) * TWO_PI) +
        Math.sin((y * frequency * 0.8 - seconds * 0.4) * TWO_PI) +
        Math.sin(((x + y) * frequency * 0.5 + seconds * 0.3) * TWO_PI) +
        /*
         * `Math.hypot` is what this said, and replacing it is the single
         * change that made these two canvases affordable.
         *
         * `hypot` is not a spelling of the Pythagorean formula: it rescales
         * its arguments so the intermediate squares cannot overflow, and it is
         * correctly rounded. Both are worth having when the magnitudes are
         * unknown; neither can matter here, where `rx` and `ry` are offsets
         * from the middle of a bitmap and so lie within plus or minus one.
         *
         * What it cost was measured rather than argued — around thirty
         * nanoseconds a call against roughly one — and this runs once per
         * lattice point, up to twelve thousand times a frame in `plasma` and,
         * before the same change, millions of times a frame in `cells`, which
         * fell from 301ms to 9ms. The rule is right about ordinary code and
         * wrong about a rasteriser's inner loop.
         */
        Math.sin(
          // eslint-disable-next-line unicorn/prefer-modern-math-apis -- see above
          Math.sqrt(rx * rx + ry * ry) * frequency * 2.4 - seconds * 0.7,
        ) *
          TWO_PI *
          0.16;

      const band = Math.round(((value / 4 + 1) / 2) * PLASMA_BANDS);
      const mixed = band / PLASMA_BANDS;
      const at = (row * columns + column) * 4;
      out[at] = Math.round(ar + (br - ar) * mixed);
      out[at + 1] = Math.round(ag + (bg - ag) * mixed);
      out[at + 2] = Math.round(ab + (bb - ab) * mixed);
      out[at + 3] = 255;
    }
  }
  return out;
}
