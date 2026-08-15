/**
 * How much of the device's resolution each canvas actually needs.
 *
 * **Some of these canvases are made entirely of soft gradients, and a soft
 * gradient does not become softer for being computed at twice the resolution —
 * it only costs four times as much.** The bitmap is what the renderer paints
 * into; the element is stretched over the viewport by CSS either way, so a
 * canvas rendered at half resolution is upscaled by the compositor for free and
 * the work drops quadratically.
 *
 * This is the one lever that helps every fill-rate-bound canvas at once, and
 * fill rate is what the size dial buys: the count of things comes from density
 * and grows linearly, but each thing's AREA comes from size and grows as its
 * square. Measured at 1440x900 on a device ratio of 2, with both dials at
 * five, the aurora cost 636ms a frame and bokeh 217ms at size alone. Neither is
 * a slow frame; both are a page that has stopped responding.
 *
 * **The choice per canvas is whether it has an edge somebody can see.** A star,
 * a constellation line, a glyph of rain and a hexagon outline are all one or
 * two pixels wide, and halving the bitmap makes them blurry — that is a
 * visible loss for a real saving, which is not a trade worth making silently.
 * A cloud, a curtain of light, a bokeh disc and a firefly's halo have no edge
 * at all; the nebula's tile is already magnified sevenfold before it is drawn.
 * Those lose nothing.
 *
 * `plasma` and `cells` are deliberately NOT here even though they look soft.
 * They are drawn as flat blocks on a lattice whose step is measured in bitmap
 * pixels, so lowering the bitmap would make the blocks coarser on screen rather
 * than cheaper at the same size. Their cost is answered where it actually lives
 * — in `canvas-raster`, which shades them into pixels instead of into tens of
 * thousands of separately parsed CSS colours.
 */

/**
 * The canvases with nothing crisp in them, and how far each may be turned down.
 *
 * A half in each axis is a quarter of the pixels. The aurora goes further than
 * the rest because it is the most expensive thing here and the least able to
 * show it: nine nested translucent passes per curtain, every one of them a
 * gradient, with no edge anywhere in the picture to lose.
 *
 * Read through {@link renderScale} rather than directly, so a canvas added to
 * `CANVASES` without a decision here gets FULL resolution. That is the safe
 * default in the direction that matters: it costs speed rather than
 * correctness, and a blurry starfield is a bug report where a slow one is a
 * preference.
 */
const SOFT_CANVASES: Record<string, number> = {
  nebula: 0.5,
  aurora: 0.4,
  blobs: 0.5,
  bokeh: 0.5,
  fireflies: 0.5,
  // **The honeycomb is here on a measurement that surprised me.** Its cells
  // are outlines, which is exactly the "edge somebody can see" this table is
  // meant to protect — so it was left at full resolution, and it stayed the
  // most expensive canvas here by a wide margin even after its draw calls went
  // from eleven thousand to twelve. Timing the parts separately settled it:
  // building the paths cost 0.2ms and rasterising the strokes cost 6.2ms, and
  // at half resolution the same strokes cost 0.7ms. Nine times, not the four a
  // count of pixels predicts, because a hairline shrinks in LENGTH and in
  // WIDTH together. What is lost is sharpness on a line drawn at between 8%
  // and 30% opacity, which is not where anybody is looking.
  hexagons: 0.5,
  // Flat bands of translucent water filled to the bottom of the page. The only
  // edge in it is the crest, and that is a boundary between two soft washes.
  waves: 0.5,
};

/**
 * How much of the device's resolution to render a canvas at.
 *
 * @param canvas - the chosen canvas's name.
 * @returns a fraction of the device pixel ratio, above zero and at most one.
 */
export function renderScale(canvas: string): number {
  // `Object.hasOwn`, never a bare index. `SOFT_CANVASES["toString"]` returns
  // the INHERITED function, so a `??` fallback is never reached — the trap this
  // repository has now documented three times, in `slotsFor` and in `dialsApply`
  // and here.
  return Object.hasOwn(SOFT_CANVASES, canvas) ? SOFT_CANVASES[canvas]! : 1;
}
