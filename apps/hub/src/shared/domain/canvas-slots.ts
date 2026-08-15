/**
 * How many colours each canvas actually paints with.
 *
 * **The editor renders this many pickers, so it has to be the truth.** A canvas
 * claiming four colours and using two gives somebody two controls that change
 * nothing — the shape of dead control this repository has already shipped more
 * than once. A canvas using four and claiming two is worse: two of its colours
 * become unreachable and nobody can find out why.
 *
 * The numbers are what each canvas draws with, one per visually distinct part:
 *
 *  * `nebula` — three cloud layers, drifting at different speeds and scales.
 *    They shared two tints before, with the near layer reusing the far one's,
 *    which is why the depth read as haze rather than as separate clouds.
 *  * `stars` — three parallax layers, far to near.
 *  * `aurora` — four curtains.
 *  * `constellation` — the points, and the lines between them.
 *  * `waves` — three bands, back to front.
 *  * `bubbles` — two tints, alternating.
 *  * `snow` — two tints, near and far.
 *  * `grid` — the lines, and the glow along the horizon.
 *  * `blobs` — three glows bleeding into each other.
 *  * `orbits` — three rings, each dragging a trail.
 *  * `hexagons` — the cell outlines, and the glow of one that has opened.
 *  * `ribbons` — three bands of light.
 *  * `confetti` — four colours of paper.
 *  * `skyline` — three layers of buildings, far to near.
 *  * `bokeh` — three tints of out-of-focus light.
 *  * `mystify` — three polygons, each with its own tint.
 *  * `bounce` — three rectangles.
 *  * `rain` — the trailing glyphs, and the bright head of each column.
 *  * `warp` — distant stars, and the ones passing the viewer.
 *  * `none` — nothing to colour.
 *
 * Adding a canvas means adding its count here, and the editor follows without
 * being told twice.
 */
export const CANVAS_SLOTS = {
  nebula: 3,
  stars: 3,
  aurora: 4,
  /** Points and the lines between them. */
  constellation: 2,
  /** Three bands of water, back to front. */
  waves: 3,
  /** Rising circles, in two tints. */
  bubbles: 2,
  /** Falling flakes, near and far. */
  snow: 2,
  /** A horizon grid: its lines and its glow. */
  grid: 2,
  /** Three large glows bleeding into each other. */
  blobs: 3,
  /** Three rings of orbiters, each dragging a trail. */
  orbits: 3,
  /** The cell outlines, and the glow of one that has opened. */
  hexagons: 2,
  /** Three bands of light. */
  ribbons: 3,
  /** Four colours of paper. */
  confetti: 4,
  /** Three layers of buildings, far to near. */
  skyline: 3,
  /** Three tints of out-of-focus light. */
  bokeh: 3,
  /** Three polygons, each with its own tint. */
  mystify: 3,
  /** Three rectangles. */
  bounce: 3,
  /** The trailing glyphs, and the bright head of each column. */
  rain: 2,
  /** Distant stars, and the ones passing the viewer. */
  warp: 2,
  none: 0,
} as const;

/**
 * The most colours any canvas takes.
 *
 * The cap the stored list is checked against, derived rather than written down
 * so it cannot fall behind the table above.
 */
export const MAX_CANVAS_COLOURS = Math.max(...Object.values(CANVAS_SLOTS));

/**
 * How many colours a canvas takes.
 *
 * A name the table does not know takes none, matching the renderer — which
 * falls through to the nebula for an unknown canvas but must not offer pickers
 * for a canvas nobody can select.
 *
 * @param canvas - the canvas's name.
 * @returns the count, or zero.
 */
export function slotsFor(canvas: string): number {
  // `Object.hasOwn`, never `in`. An `in` test is true for every inherited key —
  // `toString`, `constructor`, `__proto__` — so it reported that a canvas
  // called `toString` takes a number of colours, which is the same trap this
  // repository documents for canvas names and section types and which I then
  // walked into here.
  return Object.hasOwn(CANVAS_SLOTS, canvas)
    ? CANVAS_SLOTS[canvas as keyof typeof CANVAS_SLOTS]
    : 0;
}
