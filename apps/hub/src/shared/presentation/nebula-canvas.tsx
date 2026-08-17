"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { CELL_SIZE, tilePixels } from "@/shared/application/nebula-noise";
import {
  cellPixels,
  latticePoints,
  plasmaPixels,
} from "@/shared/application/canvas-raster";
import { dial, many } from "@/shared/domain/canvas-motion";
import { MAX_DPR, renderScale } from "@/shared/domain/canvas-resolution";
import {
  DEFAULT_CANVAS,
  MAX_CANVAS_COLOURS,
  resolveCanvas,
} from "@/shared/domain/canvas-slots";
import {
  blobs,
  bokeh,
  cells,
  curtains,
  fireflies,
  streamlines,
  valueNoise,
  bounced,
  glyphAt,
  mystify,
  rainColumns,
  wanderers,
  warpStars,
  confetti,
  honeycomb,
  orbits,
  ribbons,
  skyline,
  bubbles,
  constellation,
  nodeAt,
  snow,
  waves,
  shootingStars,
  shotProgress,
  starfield,
  twinkle,
} from "@/shared/domain/canvas-field";
import {
  NEBULA_STORAGE_KEY,
  resolveNebula,
} from "@/shared/application/nebula-preference";

/** Event the toggle dispatches so an open page reacts to its own change. */
export const NEBULA_CHANGE_EVENT = "aeleos:nebula-change";

/** Media query deciding whether the field drifts. */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Subscribes to every source that can change the nebula's state.
 *
 * @param onChange - called when any source changes.
 * @returns the unsubscribe function.
 */
function subscribe(onChange: () => void): () => void {
  const media = globalThis.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  // `storage` covers the same preference changed in another tab; the custom
  // event covers this tab, where `storage` deliberately does not fire.
  globalThis.addEventListener("storage", onChange);
  globalThis.addEventListener(NEBULA_CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    globalThis.removeEventListener("storage", onChange);
    globalThis.removeEventListener(NEBULA_CHANGE_EVENT, onChange);
  };
}

/**
 * The current preference and motion setting, as one primitive.
 *
 * A string rather than an object because `useSyncExternalStore` compares
 * snapshots by identity: returning a fresh object every call would re-render
 * forever.
 *
 * @returns `"<stored>|<prefersReducedMotion>"`.
 */
function getSnapshot(): string {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(NEBULA_STORAGE_KEY);
  } catch {
    // Storage throws outright in some privacy modes. Falling through with null
    // means the nebula shows, which is the intended default.
  }
  return `${stored ?? ""}|${globalThis.matchMedia(REDUCED_MOTION).matches}`;
}

/**
 * The snapshot assumed while rendering on the server.
 *
 * Neither input exists there, so this states the default — nebula on, moving.
 * React re-reads the real snapshot straight after hydration, so a visitor who
 * turned it off sees no flash: the canvas paints nothing until its effect runs.
 *
 * @returns the default snapshot.
 */
function getServerSnapshot(): string {
  return "|false";
}

/**
 * Edge length of each offscreen cloud tile, in pixels.
 *
 * Small on purpose: the tile is scaled up to cover the viewport, and the
 * resulting softness *is* the cloud. Rendering at full resolution would cost
 * far more and look worse.
 *
 * Must stay a square multiple of `CELL_SIZE` — that is what lets the noise
 * lattice close on itself so the repeat has no seam. `tilePixels` throws
 * otherwise rather than letting a banded field ship.
 */
const TILE = CELL_SIZE * 8;

/**
 * The colours the tiles depend on, as one comparable string.
 *
 * Only the values that are painted INTO a tile belong here. The blend mode and
 * the opacity are applied per frame at draw time, so a change to either is
 * already live and rebuilding for it would be wasted work.
 *
 * @param styles - the document root's computed styles.
 * @returns a string that changes exactly when a rebuild is needed.
 */
function tintSignature(styles: CSSStyleDeclaration): string {
  // Every slot, not the first two. A signature that watched two colours would
  // miss a change to the third and leave the tiles baked with the old one.
  return Array.from({ length: MAX_CANVAS_COLOURS }, (_, i) =>
    canvasColour(styles, i).join(","),
  ).join("|");
}

/**
 * Everything a STILL frame's appearance depends on, as one comparable string.
 *
 * **`tintSignature` answers a different question and answering it twice was a
 * bug.** That one asks what the offscreen tiles were baked with, so it watches
 * colours and nothing else — correctly, because nothing else is painted into a
 * tile. The still path borrowed it to decide whether to REDRAW, which is a
 * broader question: a reader who has asked for no motion gets one frame and
 * then nothing until something says otherwise, so anything the theme can change
 * about that frame has to be in the comparison or it never reaches the screen.
 *
 * It did not. Choosing a different canvas, or moving the busy or size dial,
 * changed no colour — so the theme arrived, was compared, found equal and
 * discarded, and the picker did nothing. That is the "the control did nothing"
 * fault this feature keeps producing, wearing reduced motion as a disguise.
 *
 * **Speed is deliberately absent.** A still frame is drawn at time zero and
 * every renderer multiplies the clock by the speed dial, so it has nothing to
 * change — reduced motion is exactly the state in which that dial does not
 * apply. Including it would buy a repaint that cannot differ by a pixel.
 *
 * @param styles - the document root's computed styles.
 * @returns a string that changes exactly when a still frame would look
 * different.
 */
function frameSignature(styles: CSSStyleDeclaration): string {
  return [
    styles.getPropertyValue("--canvas").trim(),
    styles.getPropertyValue("--canvas-density").trim(),
    styles.getPropertyValue("--canvas-scale").trim(),
    styles.getPropertyValue("--nebula-opacity").trim(),
    styles.getPropertyValue("--nebula-blend").trim(),
    tintSignature(styles),
  ].join("|");
}

/** How far the field drifts each second, in CSS pixels. */
const DRIFT_PX_PER_SECOND = 4;

/**
 * The cloud layers, drifting at different speeds and scales so the field has
 * depth.
 *
 * **`scale` is the knob that decides how many clouds you see.** It is how far
 * the tile is magnified when drawn, so one noise cell lands at
 * `CELL_SIZE * scale` CSS pixels: at 2.5 a cloud is ~80px and a 1440px screen
 * carries dozens of them, which reads as static rather than as a nebula. The
 * layers are scaled far apart on purpose — a few huge masses, a mid layer, and
 * one fine layer that supplies the grain the big ones lose to magnification.
 * Raise the scales for fewer, larger clouds; lower them for more, smaller ones.
 *
 * The scales are also what keep the repeat illegible. Each layer tiles at its
 * own period, so the three grids never coincide inside a viewport; when all
 * three shared a scale the repeat showed as a visible lattice across the page.
 *
 * `bias` is the threshold below which noise is transparent, so **raising** it
 * empties the space between the masses — which is most of what makes a cloud
 * read as one cloud rather than as part of an overcast sheet. `gain` sharpens
 * the edge where dust meets void.
 */
const LAYERS = [
  { seed: 11, gain: 2.2, bias: 0.5, speed: 1, slot: 0, scale: 7 },
  { seed: 71, gain: 2, bias: 0.54, speed: -0.55, slot: 1, scale: 4.5 },
  // Its own colour now. It reused the far layer's, which is why the depth read
  // as haze rather than as three separate clouds.
  { seed: 137, gain: 2.8, bias: 0.58, speed: 0.28, slot: 2, scale: 2.6 },
] as const;

/**
 * The most points a constellation may draw, whatever the density says.
 *
 * It compares every PAIR, so its cost is the square of this number — at three
 * times density an uncapped field is nine times the work.
 */
const CONSTELLATION_CAP = 220;

/** The most skyline layers worth drawing; beyond this they hide each other. */
const SKYLINE_CAP = 6;

/** A full turn, which most of these need at least once. */
const TWO_PI = Math.PI * 2;

/** How many stars the far layer draws; the nearer layers scale from it. */
const STAR_COUNT = 1200;

/**
 * The most stars the far layer may draw, whatever the density says.
 *
 * The nearer two layers add another 54% on top, so five times density was 9,240
 * stars — each an arc and a fill, and the bright ones a pair of strokes as
 * well. A sky is dense overhead by design; past this the individual stars stop
 * being individual and the top of the field is simply a solid band.
 */
const STAR_CAP = 3600;

/** How many streaks are in one cycle of the sky. */
const SHOT_COUNT = 4;

/** How long that cycle is, in seconds. */
const SHOT_CYCLE = 14;

/** The angle a streak travels, up and to the right. */
const SHOT_ANGLE = (25 * Math.PI) / 180;

/** How many curtains an aurora has. Few and wide — see `curtains`. */
const CURTAIN_COUNT = 4;

/**
 * The most curtains worth drawing, whatever the density says.
 *
 * **The aurora was the only canvas with a superlinear cost and no cap**, which
 * is how five times density reached twenty curtains of nine additive passes
 * each and 636ms a frame. Ten already saturates: the passes composite with
 * `lighter`, so past that the overlaps are white and the eleventh curtain
 * changes nothing anybody can see while costing exactly as much as the first.
 */
const CURTAIN_CAP = 10;

/**
 * The widest a single curtain may be, as a fraction of the viewport.
 *
 * See the clamp in `drawAurora` for why this is a picture and not only a
 * budget.
 */
const CURTAIN_WIDEST = 0.25;

/** The seed every field is generated from, so the sky is the same every time. */
const FIELD_SEED = 0x5eed;

/**
 * Remembers the last field a generator built, so a frame does not rebuild it.
 *
 * **Every generator here is a pure function of a count and the one fixed seed**,
 * which is the property that makes this safe: the same count gives the same
 * field, so keeping it is not caching a guess, it is declining to recompute a
 * constant. Motion comes from the CLOCK, applied to the field at draw time —
 * nothing in the stored value depends on when it was built.
 *
 * The saving is worth having only where the field is large. A honeycomb at five
 * times density is 11,000 objects and a starfield is 9,240, each of nine
 * fields — rebuilt sixty times a second, for a result identical to the one
 * already in hand, and handed to the collector immediately afterwards. The
 * small fields are left alone: a wrapper around six bouncing rectangles costs
 * more to read than it saves.
 *
 * One entry, not a map. The count changes only when somebody moves a slider,
 * so a second entry would never be read, and an unbounded cache keyed on a
 * number somebody can drag is a leak with a user interface.
 *
 * @param build - the generator, taking the count it should build.
 * @returns the same generator, answering repeat counts from memory. The array
 * it returns is SHARED between frames and must not be mutated by the caller —
 * every caller here either reads it or maps it into a fresh array.
 */
function remembered<T>(build: (count: number) => T): (count: number) => T {
  let built = -1;
  let field: T | undefined;
  return (count) => {
    if (count !== built || field === undefined) {
      built = count;
      field = build(count);
    }
    return field;
  };
}

/** The sky, rebuilt only when the density dial moves. */
const theStarfield = remembered((count: number) =>
  starfield(FIELD_SEED, count),
);

/** The constellation's points, rebuilt only when the density dial moves. */
const theConstellation = remembered((count: number) =>
  constellation(count, FIELD_SEED),
);

/** The falling flakes, rebuilt only when the density dial moves. */
const theSnow = remembered((count: number) => snow(count, FIELD_SEED));

/** The falling paper, rebuilt only when the density dial moves. */
const theConfetti = remembered((count: number) => confetti(count, FIELD_SEED));

/** The outward streaks, rebuilt only when the density dial moves. */
const theWarpStars = remembered((count: number) =>
  warpStars(count, FIELD_SEED),
);

/** The columns of glyphs, rebuilt only when the density dial moves. */
const theRainColumns = remembered((count: number) =>
  rainColumns(count, FIELD_SEED),
);

/** The lines of the current, rebuilt only when the density dial moves. */
const theStreamlines = remembered((count: number) =>
  streamlines(count, FIELD_SEED),
);

/** The wandering lights, rebuilt only when the density dial moves. */
const theFireflies = remembered((count: number) =>
  fireflies(count, FIELD_SEED),
);

/** The out-of-focus spots, rebuilt only when the density dial moves. */
const theBokeh = remembered((count: number) => bokeh(count, FIELD_SEED));

/**
 * The honeycomb, rebuilt only when the density dial moves.
 *
 * Keyed on the DIAL rather than on a count, because this is the one generator
 * taking two of them. Deriving the second from the first would mean dividing
 * a rounded number back out, which is a different value for some densities.
 */
const theHoneycomb = remembered((density: number) =>
  honeycomb(
    many(HEX_COLUMNS, density, HEX_COLUMN_CAP),
    many(HEX_ROWS, density, HEX_ROW_CAP),
    FIELD_SEED,
  ),
);

/**
 * Somewhere for the two lattice canvases to shade into before it is blitted up.
 *
 * `plasma` and `cells` colour every point of a grid. Done as one `fillRect` per
 * point they were the two most expensive canvases here for a reason that had
 * nothing to do with their arithmetic: a colour assigned as a `rgb(…)` string
 * is CSS parsed, and at the default dials `cells` built one for each of about
 * 26,000 points on every frame.
 *
 * Shading into bytes and blitting once removes that entirely. The bitmap is
 * created ONCE for the life of the canvas rather than per frame — allocating a
 * `<canvas>` sixty times a second is its own leak-shaped problem, and the
 * lattice size only changes when a dial or the window does.
 */
interface Scratch {
  /** The bitmap to blit from, once {@link Scratch.shade} has filled it. */
  canvas: HTMLCanvasElement;
  /**
   * Resizes the bitmap to the lattice and writes the shaded bytes into it.
   *
   * @param columns - lattice width in points.
   * @param rows - lattice height in points.
   * @param pixels - four bytes per point, row-major.
   * @returns false when the bitmap has no 2D context, so the caller can skip
   * drawing rather than blit an empty rectangle over the page.
   */
  shade(
    columns: number,
    rows: number,
    pixels: Uint8ClampedArray<ArrayBuffer>,
  ): boolean;
}

/**
 * Builds the reusable lattice bitmap.
 *
 * @returns the scratch surface.
 */
function makeScratch(): Scratch {
  const canvas = document.createElement("canvas");
  return {
    canvas,
    shade(columns, rows, pixels) {
      // Assigning the same width again would needlessly clear the bitmap, and
      // this runs every frame — so both are compared before being set.
      if (canvas.width !== columns) canvas.width = columns;
      if (canvas.height !== rows) canvas.height = rows;
      const context = canvas.getContext("2d");
      if (!context) return false;
      // `putImageData` REPLACES, so the previous frame's alpha cannot survive
      // under a point this frame leaves transparent.
      context.putImageData(new ImageData(pixels, columns, rows), 0, 0);
      return true;
    },
  };
}

/**
 * Blits a shaded lattice up to the visible canvas.
 *
 * **Nearest neighbour, deliberately.** The lattice IS the picture's
 * resolution — both canvases were drawn as flat blocks of `step` pixels — so
 * smoothing the blit would turn them into a blur, which is a different canvas
 * rather than a faster one.
 *
 * @param ctx - the drawing context.
 * @param scratch - the shaded surface.
 * @param columns - lattice width in points.
 * @param rows - lattice height in points.
 * @param step - how many bitmap pixels one lattice point covers.
 * @returns nothing.
 */
function blitLattice(
  ctx: CanvasRenderingContext2D,
  scratch: Scratch,
  columns: number,
  rows: number,
  step: number,
): void {
  const previousAlpha = ctx.globalAlpha;
  const previousSmoothing = ctx.imageSmoothingEnabled;
  // Half, replacing rather than multiplying the nebula's own opacity, which is
  // what these two canvases did before and is therefore what they still do.
  ctx.globalAlpha = 0.5;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    scratch.canvas,
    0,
    0,
    columns,
    rows,
    0,
    0,
    columns * step,
    rows * step,
  );
  ctx.imageSmoothingEnabled = previousSmoothing;
  ctx.globalAlpha = previousAlpha;
}

/**
 * Draws the sky.
 *
 * Ported from Moonfest's hero canvas in the `eclipse-con` repository, keeping
 * the four things that make it look like a sky rather than like dots:
 *
 *  * **three parallax layers**, each denser, smaller and dimmer than the one in
 *    front of it;
 *  * **stars biased toward the top**, which is worth more than any of the
 *    shimmer — it is what stops a scatter reading as noise;
 *  * **two oscillators per star**, whose product twinkles where one alone only
 *    fades;
 *  * **diffraction spikes** on the big bright ones, which is the detail the eye
 *    reads as "star" without being able to say why.
 *
 * What is deliberately NOT ported is the colour. Moonfest names three fixed
 * tints; here every star is mixed between the author's own two colours, because
 * an author picks two and whichever canvas they choose wears them.
 *
 * @param ctx - the drawing context.
 * @param width - the bitmap width in device pixels.
 * @param height - the bitmap height in device pixels.
 * @param dpr - the device pixel ratio the bitmap was built at.
 * @param tints - the two theme colours, as channel triples.
 * @param seconds - elapsed time.
 * @param animated - false when the reader asked for no motion.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
  animated: boolean,
  density: number,
  scale: number,
) {
  // One colour per LAYER rather than a mix across the whole sky. A layer is the
  // thing somebody can see and therefore the thing worth being able to colour;
  // mixing every star between two made the field one blended wash.
  const layers = theStarfield(many(STAR_COUNT, density, STAR_CAP));
  for (const [index, layer] of layers.entries()) {
    const [r, g, bl] = tints[index % tints.length]!;
    // **Set once per layer, not once per star.** The colour is the same for
    // every star in a layer — only the alpha twinkles, and that has its own
    // property — but it was assigned as a string inside the loop, so the canvas
    // parsed the identical CSS colour for each of up to nine thousand stars.
    const ink = `rgb(${r} ${g} ${bl})`;
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.8 * dpr;
    for (const star of layer.stars) {
      // Still on the still path: one frame at a representative brightness,
      // so reduced motion keeps the sky and loses only the movement.
      const alpha = animated
        ? twinkle(star, seconds, layer.brightness)
        : Math.min(0.95, star.alpha * 0.78 * layer.brightness);
      const x = star.x * width;
      const y = star.y * height;
      const size = star.r * dpr * scale;

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      // The cross only on the big, bright ones. On every star it is a grid of
      // plus signs; on a few it is a sky.
      if (star.r > 1.8 && alpha > 0.45) {
        ctx.globalAlpha = alpha * 0.35;
        ctx.beginPath();
        ctx.moveTo(x - size * 1.6, y);
        ctx.lineTo(x + size * 1.6, y);
        ctx.moveTo(x, y - size * 1.6);
        ctx.lineTo(x, y + size * 1.6);
        ctx.stroke();
      }
    }
  }

  if (!animated) return;

  for (const shot of shootingStars(FIELD_SEED, SHOT_COUNT, SHOT_CYCLE)) {
    const progress = shotProgress(shot, seconds, SHOT_CYCLE);
    if (progress === null) continue;

    // Up and to the right, the angle Moonfest uses.
    const travel = progress * width * 0.5;
    const x = shot.x * width + travel * Math.cos(SHOT_ANGLE);
    const y = shot.y * height - travel * Math.sin(SHOT_ANGLE);
    const tail = shot.length * width;
    const [r, g, bl] = tints[0]!;

    const trail = ctx.createLinearGradient(
      x,
      y,
      x - tail * Math.cos(SHOT_ANGLE),
      y + tail * Math.sin(SHOT_ANGLE),
    );
    trail.addColorStop(0, `rgb(${r} ${g} ${bl} / ${(1 - progress) * 0.8})`);
    trail.addColorStop(1, `rgb(${r} ${g} ${bl} / 0)`);

    ctx.globalAlpha = 1;
    ctx.strokeStyle = trail;
    ctx.lineWidth = 1.8 * dpr;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x - tail * Math.cos(SHOT_ANGLE),
      y + tail * Math.sin(SHOT_ANGLE),
    );
    ctx.stroke();
  }
}

/** How many points a constellation carries. */
const NODE_COUNT = 130;

/** How close two points must be to be joined, as a fraction of the viewport. */
const LINK_WITHIN = 0.13;

/**
 * Draws a constellation: points, and the lines between the near ones.
 *
 * **The lines fade with distance rather than switching on at a threshold.** A
 * hard cutoff makes every line appear and vanish at full strength, which reads
 * as flickering; fading means a link arrives and leaves.
 *
 * The pairs are compared in one triangular sweep, so each is considered once.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param dpr - device pixel ratio, so a dot is a dot on every screen.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawConstellation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const at = theConstellation(many(NODE_COUNT, density, CONSTELLATION_CAP)).map(
    (node) => nodeAt(node, seconds),
  );
  const [lr, lg, lb] = tints[1] ?? tints[0]!;
  ctx.lineWidth = Math.max(1, dpr * 0.6 * scale);
  for (let i = 0; i < at.length; i += 1) {
    for (let j = i + 1; j < at.length; j += 1) {
      const distance = Math.hypot(at[i]!.x - at[j]!.x, at[i]!.y - at[j]!.y);
      if (distance > LINK_WITHIN) continue;
      const fade = (1 - distance / LINK_WITHIN) * 0.5;
      ctx.strokeStyle = `rgb(${lr} ${lg} ${lb} / ${fade})`;
      ctx.beginPath();
      ctx.moveTo(at[i]!.x * width, at[i]!.y * height);
      ctx.lineTo(at[j]!.x * width, at[j]!.y * height);
      ctx.stroke();
    }
  }
  const [pr, pg, pb] = tints[0]!;
  ctx.fillStyle = `rgb(${pr} ${pg} ${pb} / 0.85)`;
  for (const point of at) {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, dpr * 1.4 * scale, 0, TWO_PI);
    ctx.fill();
  }
}

/** How many bands a wave field has. */
const WAVE_COUNT = 5;

/** How many points each band is drawn from. More is smoother and slower. */
const WAVE_STEPS = 48;

/**
 * Draws bands of water, back to front.
 *
 * Each band is filled to the bottom rather than stroked, so the ones in front
 * hide the ones behind and the stack reads as depth instead of as overlapping
 * lines.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawWaves(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  for (const wave of waves(many(WAVE_COUNT, density), FIELD_SEED)) {
    const [r, g, b] = tints[wave.tint] ?? tints[0]!;
    ctx.fillStyle = `rgb(${r} ${g} ${b} / 0.32)`;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i <= WAVE_STEPS; i += 1) {
      const t = i / WAVE_STEPS;
      const crest =
        Math.sin((t * wave.length + seconds * wave.speed) * TWO_PI) *
        wave.height;
      ctx.lineTo(t * width, (wave.level + crest * scale) * height);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }
}

/** How many bubbles rise at once. */
const BUBBLE_COUNT = 95;

/**
 * The most bubbles worth drawing, whatever the density says.
 *
 * A ring's cost is its circumference, and the size dial multiplies that, so
 * this is the same count-times-size shape as `bokeh` — 475 rings of up to a
 * sixth of the viewport across measured 42ms a frame. Water does not get more
 * convincing past this; it gets foamier.
 */
const BUBBLE_CAP = 260;

/**
 * The widest a bubble may be, as a fraction of the smaller side.
 *
 * Larger than {@link GLOW_WIDEST} because a bubble is an outline rather than a
 * filled glow, so a big one still reads as a bubble where a big blob reads as
 * a wash. It is here for the cost of the circumference, not for the picture.
 */
const BUBBLE_WIDEST = 0.12;

/**
 * Draws bubbles climbing from the bottom.
 *
 * Each is a ring rather than a disc — a filled circle at this size is a dot,
 * and a dot is the starfield.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param dpr - device pixel ratio.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawBubbles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const side = Math.min(width, height);
  const smaller = side * scale;
  const widest = side * BUBBLE_WIDEST;
  ctx.lineWidth = Math.max(1, dpr);
  for (const bubble of bubbles(
    many(BUBBLE_COUNT, density, BUBBLE_CAP),
    FIELD_SEED,
  )) {
    const climbed = (bubble.offset + seconds * bubble.speed) % 1;
    const [r, g, b] = tints[bubble.tint] ?? tints[0]!;
    // Faded at both ends of the climb, so nothing pops into or out of being.
    const alpha = Math.sin(climbed * Math.PI) * 0.5;
    ctx.strokeStyle = `rgb(${r} ${g} ${b} / ${alpha})`;
    ctx.beginPath();
    ctx.arc(
      (bubble.x + Math.sin(climbed * TWO_PI) * bubble.wander) * width,
      (1 - climbed) * height,
      Math.min(bubble.radius * smaller, widest),
      0,
      TWO_PI,
    );
    ctx.stroke();
  }
}

/** How many flakes fall at once. */
const FLAKE_COUNT = 300;

/**
 * Draws falling snow.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawSnow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const smaller = Math.min(width, height) * scale;
  for (const flake of theSnow(many(FLAKE_COUNT, density))) {
    const fallen = (flake.offset + seconds * flake.speed) % 1;
    const [r, g, b] = tints[flake.tint] ?? tints[0]!;
    ctx.fillStyle = `rgb(${r} ${g} ${b} / 0.7)`;
    ctx.beginPath();
    ctx.arc(
      (flake.x + Math.sin(seconds * flake.swaySpeed * TWO_PI) * flake.sway) *
        width,
      fallen * height,
      flake.radius * smaller,
      0,
      TWO_PI,
    );
    ctx.fill();
  }
}

/** How many lines run toward the horizon, each way. */
const GRID_LINES = 22;

/** Where the horizon sits, as a fraction of the viewport's height. */
const HORIZON = 0.55;

/**
 * Draws a grid running away to a horizon.
 *
 * **The crosswise lines are spaced by a square law and scrolled by the
 * fractional part of time.** Even spacing gives a ladder rather than a plane,
 * and scrolling by whole steps makes the whole grid jump once a second; taking
 * the fraction means the pattern slides continuously and repeats exactly.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param dpr - device pixel ratio.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const horizon = height * HORIZON;
  const [r, g, b] = tints[0]!;
  ctx.lineWidth = Math.max(1, dpr * 0.8);
  ctx.strokeStyle = `rgb(${r} ${g} ${b} / 0.35)`;
  const lines = many(GRID_LINES, density);
  for (let i = -lines; i <= lines; i += 1) {
    ctx.beginPath();
    ctx.moveTo(width / 2 + (i / lines) * width * 0.08, horizon);
    ctx.lineTo(width / 2 + (i / lines) * width * 2.2 * scale, height);
    ctx.stroke();
  }
  const scroll = (seconds * 0.25) % 1;
  for (let i = 0; i < lines; i += 1) {
    const t = (i + scroll) / lines;
    ctx.strokeStyle = `rgb(${r} ${g} ${b} / ${0.3 * t})`;
    ctx.beginPath();
    ctx.moveTo(0, horizon + t * t * (height - horizon));
    ctx.lineTo(width, horizon + t * t * (height - horizon));
    ctx.stroke();
  }
  // The glow along the horizon, which is what stops the grid reading as a
  // wireframe stuck to the bottom of the page.
  const [hr, hg, hb] = tints[1] ?? tints[0]!;
  const glow = ctx.createLinearGradient(0, horizon - height * 0.12, 0, horizon);
  glow.addColorStop(0, `rgb(${hr} ${hg} ${hb} / 0)`);
  glow.addColorStop(1, `rgb(${hr} ${hg} ${hb} / 0.45)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, horizon - height * 0.12, width, height * 0.12);
}

/** How many glows drift past each other. */
const BLOB_COUNT = 5;

/**
 * The most glows worth drawing, whatever the density says.
 *
 * These are the largest single shapes any canvas here paints — a radial
 * gradient over the longer side of the viewport — so a linear rise in count is
 * a linear rise in full-screen fills. Fifteen already covers the page twice
 * over.
 */
const BLOB_CAP = 15;

/**
 * Draws a few large, soft glows.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawBlobs(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const larger = Math.max(width, height) * scale;
  // **Deliberately NOT clamped, unlike `bokeh`.** A blob's own radius is
  // already 0.25 to 0.55 of the longer side, so the width that bounds bokeh's
  // little discs sits UNDER a blob's natural size and clipped one at the
  // default dials — caught by comparing frames before and after, where this
  // was the only canvas whose default moved. It needs no clamp anyway: these
  // are the one shape here that is routinely larger than the viewport, and the
  // canvas clips a fill to its own bounds, so a blob past the edge costs one
  // screen of gradient however large it is told to be. The count is what
  // multiplies that, and `BLOB_CAP` is what bounds the count.
  for (const blob of blobs(many(BLOB_COUNT, density, BLOB_CAP), FIELD_SEED)) {
    const angle = blob.phase + seconds * blob.speed * TWO_PI;
    // Unequal in the two axes, so two glows sharing a speed do not travel in
    // parallel — an ellipse rather than a circle.
    const x = (blob.x + Math.cos(angle) * blob.drift) * width;
    const y = (blob.y + Math.sin(angle) * blob.drift * 0.6) * height;
    const radius = blob.radius * larger;
    const [r, g, b] = tints[blob.tint] ?? tints[0]!;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgb(${r} ${g} ${b} / 0.5)`);
    glow.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

/** How many points go round in an orbit field. */
const ORBIT_COUNT = 64;

/**
 * Draws points orbiting a common centre, each dragging a trail.
 *
 * The trail is an arc drawn behind the point rather than a record of where it
 * has been: every renderer here is a pure function of seed and time, which is
 * what lets a page be themed, resized or re-read without the animation
 * carrying state from before.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param dpr - device pixel ratio.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawOrbits(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const smaller = Math.min(width, height) * scale;
  const cx = width / 2;
  const cy = height / 2;
  ctx.lineCap = "round";
  for (const orbiter of orbits(many(ORBIT_COUNT, density), FIELD_SEED)) {
    const angle = orbiter.phase + seconds * orbiter.speed * TWO_PI;
    const radius = orbiter.radius * smaller;
    const [r, g, b] = tints[orbiter.tint] ?? tints[0]!;
    ctx.strokeStyle = `rgb(${r} ${g} ${b} / 0.4)`;
    ctx.lineWidth = Math.max(1, dpr * 1.6);
    ctx.beginPath();
    // Drawn against the direction of travel, so the trail follows rather than
    // leads — which is the difference between a comet and an arrow.
    ctx.arc(
      cx,
      cy,
      radius,
      angle - Math.sign(orbiter.speed) * orbiter.trail,
      angle,
      orbiter.speed < 0,
    );
    ctx.stroke();
    ctx.fillStyle = `rgb(${r} ${g} ${b} / 0.9)`;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
      dpr * 1.8,
      0,
      TWO_PI,
    );
    ctx.fill();
  }
}

/** How many cells across a honeycomb runs. */
const HEX_COLUMNS = 22;

/** How many rows it runs down. */
const HEX_ROWS = 20;

/**
 * The most cells across, whatever the density says.
 *
 * At five times density this ran 110 columns of 100 rows — eleven thousand
 * cells on a 1440-pixel viewport, which is thirteen pixels each. Their outlines
 * merge into a flat grey wash well before that, so the cap costs a texture
 * nobody could resolve and saves the frame it was taking.
 */
const HEX_COLUMN_CAP = 60;

/** The most rows, for the same reason. */
const HEX_ROW_CAP = 54;

/**
 * How many brightnesses a honeycomb's breathing is sorted into.
 *
 * **Every cell used to be its own `stroke()` call**, and that — not the drawing
 * — was what made this the most expensive canvas here: eleven thousand draw
 * operations a frame, each one a state change the rasteriser cannot batch past.
 * Only the ALPHA differs between them, so the cells are sorted into this many
 * buckets and each bucket is stroked once as a single path.
 *
 * Twelve, because the alpha spans 0.08 to 0.30 — a step of under two hundredths
 * of an alpha, which is below what anybody can see on a translucent hairline,
 * while turning eleven thousand draw calls into twelve.
 */
const BREATH_STEPS = 12;

/**
 * Draws a breathing honeycomb.
 *
 * The cells are stroked rather than filled: a filled honeycomb is a wall, and
 * a wall behind text is a page nobody can read.
 *
 * **A cell is sized by how many cells there actually are.** It used to divide
 * the viewport by the CONSTANT `HEX_COLUMNS` while `honeycomb` laid the cells
 * out across the density-multiplied count — so turning density up did not make
 * a finer honeycomb, it made the same giant cells five deep on top of each
 * other. That is why this was the most expensive canvas here by a factor of
 * three: at both dials on five it cost 2191ms a frame, which is not a dropped
 * frame but a page that has stopped answering. At the default density the two
 * counts are the same number and the picture is unchanged.
 *
 * **The colours are set once and the breath rides `globalAlpha`.** Assigning a
 * `rgb(… / …)` string per cell had the canvas parse CSS eleven thousand times
 * a frame; the alpha is the only part that varies, and it has its own property.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param dpr - device pixel ratio.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawHexagons(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const columns = many(HEX_COLUMNS, density, HEX_COLUMN_CAP);
  const radius = (width / columns / 1.8) * scale;
  const [lr, lg, lb] = tints[0]!;
  const [gr, gg, gb] = tints[1] ?? tints[0]!;
  ctx.lineWidth = Math.max(1, dpr * 0.7);
  ctx.strokeStyle = `rgb(${lr} ${lg} ${lb})`;
  ctx.fillStyle = `rgb(${gr} ${gg} ${gb})`;
  // The pass's own translucency, which the alphas below multiply rather than
  // replace — exactly as they did when each was baked into a colour string.
  const base = ctx.globalAlpha;

  // The corner offsets, worked out once. They are the same six for every cell,
  // and at eleven thousand cells that is 66,000 trigonometric calls a frame
  // spent rediscovering one hexagon. Flat-topped, which is what makes the
  // half-column offset tessellate.
  const corners = Array.from({ length: 6 }, (_, corner) => {
    const angle = (corner / 6) * TWO_PI + Math.PI / 6;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });

  // One path per brightness, so the whole honeycomb is a dozen draw calls.
  const outlines = Array.from({ length: BREATH_STEPS }, () => new Path2D());
  const opened = new Path2D();

  for (const cell of theHoneycomb(density)) {
    const breath =
      (Math.sin(cell.phase + seconds * cell.speed * TWO_PI) + 1) / 2;
    const x = cell.x * width;
    const y = cell.y * height;
    const hexagon = new Path2D();
    for (const [corner, offset] of corners.entries()) {
      if (corner === 0) hexagon.moveTo(x + offset.x, y + offset.y);
      else hexagon.lineTo(x + offset.x, y + offset.y);
    }
    hexagon.closePath();
    // `breath` reaches exactly one when the sine peaks, which would index one
    // past the end.
    const step = Math.min(BREATH_STEPS - 1, Math.floor(breath * BREATH_STEPS));
    outlines[step]!.addPath(hexagon);
    if (breath > 0.85) opened.addPath(hexagon);
  }

  for (const [step, outline] of outlines.entries()) {
    // The middle of the bucket, so the quantising does not also darken the
    // whole field by half a step.
    ctx.globalAlpha = base * (0.08 + ((step + 0.5) / BREATH_STEPS) * 0.22);
    ctx.stroke(outline);
  }
  // The glow of the open cells, at the alpha the brightest of them had. It was
  // per cell and is now one pass, which is the one place this quantises
  // something visible: the cells that have just opened glow as strongly as the
  // ones fully open. They are within a fifth of an alpha of each other and
  // every one of them is a cell at its brightest, so the field reads the same.
  ctx.globalAlpha = base * 0.12;
  ctx.fill(opened);
  ctx.globalAlpha = base;
}

/** How many ribbons cross the viewport. */
const RIBBON_COUNT = 5;

/** How many points each ribbon's edges are drawn from. */
const RIBBON_STEPS = 40;

/**
 * Draws long bands of light crossing the viewport.
 *
 * A band between two offset curves rather than a thick stroke, so its width
 * varies along its length — the difference between a ribbon and a wire.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawRibbons(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  for (const ribbon of ribbons(many(RIBBON_COUNT, density), FIELD_SEED)) {
    const [r, g, b] = tints[ribbon.tint] ?? tints[0]!;
    ctx.fillStyle = `rgb(${r} ${g} ${b} / 0.28)`;
    ctx.beginPath();
    for (let i = 0; i <= RIBBON_STEPS; i += 1) {
      const t = i / RIBBON_STEPS;
      const wave =
        Math.sin((t * ribbon.bends + seconds * ribbon.speed) * TWO_PI) *
        ribbon.swing;
      const y = (ribbon.level + wave) * height;
      if (i === 0) ctx.moveTo(t * width, y);
      else ctx.lineTo(t * width, y);
    }
    for (let i = RIBBON_STEPS; i >= 0; i -= 1) {
      const t = i / RIBBON_STEPS;
      const wave =
        Math.sin((t * ribbon.bends + seconds * ribbon.speed) * TWO_PI) *
        ribbon.swing;
      // The far edge is phase-shifted, so the band pinches and swells instead
      // of running at one width.
      const swell =
        ribbon.thickness *
        scale *
        (0.4 + 0.6 * Math.abs(Math.cos(t * ribbon.bends * TWO_PI)));
      ctx.lineTo(t * width, (ribbon.level + wave + swell) * height);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** How many pieces of confetti fall at once. */
const CONFETTO_COUNT = 200;

/**
 * Draws falling, tumbling confetti.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawConfetti(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const smaller = Math.min(width, height) * scale;
  for (const piece of theConfetti(many(CONFETTO_COUNT, density))) {
    const fallen = (piece.offset + seconds * piece.speed) % 1;
    const [r, g, b] = tints[piece.tint] ?? tints[0]!;
    const size = piece.size * smaller;
    // The tumble, as a width that narrows to nothing and opens again. A piece
    // edge-on vanishes for an instant, which is what round particles cannot do.
    const face = Math.cos(
      seconds * piece.spin * TWO_PI + piece.offset * TWO_PI,
    );
    ctx.fillStyle = `rgb(${r} ${g} ${b} / 0.75)`;
    ctx.fillRect(
      (piece.x + Math.sin(fallen * TWO_PI) * piece.drift) * width,
      fallen * height,
      size * Math.abs(face),
      size * 1.6,
    );
  }
}

/** How many layers a skyline has. */
const SKYLINE_LAYERS = 4;

/**
 * Draws a skyline scrolling past, far layers slower.
 *
 * Each layer is drawn twice side by side and scrolled within one layer-width,
 * which is what lets it repeat for ever without a seam.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawSkyline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  for (const layer of skyline(
    many(SKYLINE_LAYERS, density, SKYLINE_CAP),
    FIELD_SEED,
  )) {
    const [r, g, b] = tints[layer.tint] ?? tints[0]!;
    ctx.fillStyle = `rgb(${r} ${g} ${b} / 0.3)`;
    const shift = ((seconds * layer.speed) % 1) * width;
    for (const repeat of [0, 1]) {
      for (const building of layer.buildings) {
        ctx.fillRect(
          building.at * width - shift + repeat * width,
          height - building.height * height * scale,
          building.width * width + 1,
          building.height * height * scale,
        );
      }
    }
  }
}

/** How many out-of-focus spots drift about. */
const SPOT_COUNT = 70;

/**
 * The most spots worth drawing, whatever the density says.
 *
 * Each is a radial gradient over a square of its own diameter, so this is the
 * canvas where count and size multiply most directly: at five on both dials it
 * was 350 spots of up to 0.6 of the viewport across, which measured 1077ms a
 * frame. It is also the canvas where the count matters least — out-of-focus
 * light overlaps into one wash long before this many.
 */
const SPOT_CAP = 150;

/**
 * The widest a spot of bokeh may be, as a fraction of the smaller side.
 *
 * A spot's own radius is 0.02 to 0.12, so this leaves the size dial most of a
 * doubling before it bites and the default frame is untouched. Past it a disc
 * is not a bigger highlight but a tint over the whole page, and with 150 of
 * them the cost is 150 screens of radial gradient a frame.
 *
 * **`blobs` deliberately does not share this**, though it first did. Its own
 * radius starts at 0.25 — twice this — so the same number clipped it at the
 * default dials.
 */
const GLOW_WIDEST = 0.22;

/**
 * Draws out-of-focus spots of light.
 *
 * Each is a soft-edged disc rather than a hard one: a lens renders an
 * out-of-focus point as a bright circle with a fading rim, and a flat disc
 * reads as a sticker.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawBokeh(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const side = Math.min(width, height);
  const smaller = side * scale;
  const widest = side * GLOW_WIDEST;
  for (const spot of theBokeh(many(SPOT_COUNT, density, SPOT_CAP))) {
    const angle = spot.phase + seconds * spot.speed * TWO_PI;
    const x = (spot.x + Math.cos(angle) * spot.drift) * width;
    const y = (spot.y + Math.sin(angle) * spot.drift) * height;
    const radius = Math.min(spot.radius * smaller, widest);
    const [r, g, b] = tints[spot.tint] ?? tints[0]!;
    const glow = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
    glow.addColorStop(0, `rgb(${r} ${g} ${b} / ${spot.glow})`);
    glow.addColorStop(0.75, `rgb(${r} ${g} ${b} / ${spot.glow * 0.7})`);
    glow.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

/** How many polygons mystify draws. */
const MYSTIFY_COUNT = 4;

/**
 * The most polygons worth drawing, whatever the density says.
 *
 * Each drags five to eight echoes of itself, so the count on screen is roughly
 * eight times this — and every one is a stroke across the whole viewport at a
 * line width the size dial multiplies. Twenty polygons was 150 such strokes,
 * which is not a screensaver but a scribble.
 */
const MYSTIFY_CAP = 8;

/** How many corners each has. */
const MYSTIFY_CORNERS = 4;

/**
 * Draws bouncing polygons trailing echoes of themselves.
 *
 * **The echoes are the same polygon at earlier times, not a history.** The
 * original kept past shapes in memory; `bounced` makes any past moment as cheap
 * to compute as the present one, so this needs none — which is what keeps every
 * renderer here a pure function of seed and time.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param dpr - device pixel ratio.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawMystify(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  ctx.lineWidth = Math.max(1, dpr * scale);
  for (const shape of mystify(
    many(MYSTIFY_COUNT, density, MYSTIFY_CAP),
    MYSTIFY_CORNERS,
    FIELD_SEED,
  )) {
    const [r, g, b] = tints[shape.tint] ?? tints[0]!;
    for (let echo = shape.echoes; echo >= 0; echo -= 1) {
      const when = seconds - echo * shape.spacing;
      ctx.strokeStyle = `rgb(${r} ${g} ${b} / ${0.5 * (1 - echo / (shape.echoes + 1))})`;
      ctx.beginPath();
      for (const [i, corner] of shape.corners.entries()) {
        const x = bounced(corner.startX + when * corner.speedX) * width;
        const y = bounced(corner.startY + when * corner.speedY) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
}

/** How many rectangles bounce about. */
const WANDERER_COUNT = 6;

/**
 * Draws rectangles bouncing off the edges.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawBounce(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  for (const [i, box] of wanderers(
    many(WANDERER_COUNT, density),
    FIELD_SEED,
  ).entries()) {
    // Bounced within the room the box leaves, so it meets the edge rather than
    // half-leaving it — the corner is the whole point of watching.
    const x = bounced(box.startX + seconds * box.speedX) * (1 - box.width);
    const y = bounced(box.startY + seconds * box.speedY) * (1 - box.height);
    const [r, g, b] = tints[i % 3] ?? tints[0]!;
    ctx.fillStyle = `rgb(${r} ${g} ${b} / 0.5)`;
    ctx.fillRect(
      x * width,
      y * height,
      box.width * width * scale,
      box.height * height * scale,
    );
  }
}

/** How many columns of glyphs fall. */
const RAIN_COLUMNS = 72;

/** The glyphs the rain is made of. */
const RAIN_ALPHABET = "01アイウエオカキクケコサシスセソタチツテト";

/** How many times a second a glyph may change. */
const RAIN_STEPS_PER_SECOND = 8;

/**
 * Draws columns of glyphs falling down the viewport.
 *
 * The head of each column is the brightest and the tail fades, which is what
 * makes it fall rather than simply exist. Glyphs are chosen by a hash of the
 * column, the row and the clock step: `Math.random()` here would reroll every
 * glyph on every frame, which is noise rather than rain.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param dpr - device pixel ratio.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawRain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const size = Math.max(10, (width / RAIN_COLUMNS) * 0.9 * scale);
  ctx.font = `${size}px ui-monospace, monospace`;
  ctx.textBaseline = "top";
  const rows = Math.ceil(height / size);
  const step = Math.floor(seconds * RAIN_STEPS_PER_SECOND);
  const [tr, tg, tb] = tints[0]!;
  const [hr, hg, hb] = tints[1] ?? tints[0]!;
  for (const column of theRainColumns(many(RAIN_COLUMNS, density))) {
    const head = Math.floor(
      ((column.offset + seconds * column.speed) % 1) * (rows + column.length),
    );
    for (let back = 0; back < column.length; back += 1) {
      const row = head - back;
      if (row < 0 || row > rows) continue;
      const glyph =
        RAIN_ALPHABET[glyphAt(column.seed, row, step, RAIN_ALPHABET.length)]!;
      const fade = 1 - back / column.length;
      ctx.fillStyle =
        back === 0
          ? `rgb(${hr} ${hg} ${hb} / 0.95)`
          : `rgb(${tr} ${tg} ${tb} / ${fade * 0.5})`;
      ctx.fillText(glyph, column.x * width - size / 2, row * size);
    }
  }
  // Left as it was found: the font is set on a context every other renderer
  // uses for shapes, and `dpr` is only here to keep the glyphs crisp.
  ctx.font = `${Math.max(10, dpr * 10)}px ui-monospace, monospace`;
}

/** How many stars fly outward. */
const WARP_COUNT = 420;

/**
 * Draws stars flying outward from the centre.
 *
 * Distance grows by a square law: a star near the centre is far away and barely
 * moves, one at the edge is passing the viewer. Even spacing gives a flat disc
 * of dots sliding outward, which is what the effect is not.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param dpr - device pixel ratio.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawWarp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
): void {
  const cx = width / 2;
  const cy = height / 2;
  const reach = Math.hypot(cx, cy);
  ctx.lineCap = "round";
  for (const star of theWarpStars(many(WARP_COUNT, density))) {
    const t = (star.offset + seconds * star.speed) % 1;
    const far = t * t * reach;
    // The streak is the distance travelled since a moment ago, so a star near
    // the viewer draws a long line and a distant one draws a point.
    const near = Math.max(0, t - 0.06);
    const from = near * near * reach;
    const [r, g, b] = tints[t > 0.6 ? 1 : 0] ?? tints[0]!;
    ctx.strokeStyle = `rgb(${r} ${g} ${b} / ${Math.min(1, t * 1.6)})`;
    ctx.lineWidth = Math.max(1, dpr * (0.4 + t * 1.6) * scale);
    ctx.beginPath();
    ctx.moveTo(
      cx + Math.cos(star.angle) * from,
      cy + Math.sin(star.angle) * from,
    );
    ctx.lineTo(
      cx + Math.cos(star.angle) * far,
      cy + Math.sin(star.angle) * far,
    );
    ctx.stroke();
  }
}

/** How many bands each curtain is drawn from, top to bottom. */
const CURTAIN_BANDS = 26;

/**
 * The widths a curtain is drawn at, widest first.
 *
 * Nine of them because three was visibly three: each pass is the same shape
 * narrower, and where the steps are far apart the eye reads them as outlines
 * rather than as a falling-off edge.
 */
const CURTAIN_PASSES = [1, 0.92, 0.83, 0.73, 0.62, 0.5, 0.38, 0.26, 0.14];

/**
 * Draws an aurora: curtains that fold, with the light running up them.
 *
 * **The old one swayed each curtain with a sine and it read as a column.** A
 * pendulum moves every part of a thing together; an aurora folds, so the top of
 * a curtain is somewhere the bottom is not. This walks down each curtain in
 * bands and offsets every band by `valueNoise` sampled at its own depth — so
 * neighbouring bands differ slightly and the ribbon creases.
 *
 * Two more things are what make it read as sky rather than as paint. The bands
 * fade toward the bottom, because an aurora hangs; and each band is drawn with
 * a horizontal falloff, because a curtain has no edge — a flat band with a hard
 * side is a stripe.
 *
 * `lighter` composition, so where two curtains cross they get brighter instead
 * of one covering the other. That is the single change that most makes this look
 * like light rather than like coloured glass.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawAurora(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
) {
  const previous = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";

  for (const curtain of curtains(
    many(CURTAIN_COUNT, density, CURTAIN_CAP),
    FIELD_SEED,
  )) {
    const [r, g, b] = tints[curtain.tint % tints.length]!;
    // **Clamped, and the clamp is a picture as much as a budget.** A curtain
    // is 0.1 to 0.26 of the viewport wide, so at five times size it reached
    // 1.3 viewports — which is not a larger aurora, it is one wall of light
    // with its folds off both edges of the screen. Half the viewport is
    // already the widest a curtain reads as a curtain, and above roughly
    // twice size this is what bounds the fill the nine passes multiply.
    const half = Math.min(
      (curtain.width * width * scale) / 2,
      width * CURTAIN_WIDEST,
    );
    const bottom = curtain.reach * height;

    // **The fold is computed once per band, not once per band per pass.** It
    // depends on the curtain, the depth and the clock — never on how wide the
    // pass is — yet it was sampled inside both edge loops of all nine, so
    // `valueNoise` ran 486 times per curtain to produce 27 distinct values.
    // The passes are nested outlines of ONE shape; sharing the centre line is
    // what makes them so.
    const centres = Array.from({ length: CURTAIN_BANDS + 1 }, (_, band) => {
      const at = band / CURTAIN_BANDS;
      const folded =
        valueNoise(at * 2.4 + seconds * curtain.speed, curtain.seed) - 0.5;
      return { x: (curtain.x + folded * 0.22) * width, y: at * bottom };
    });

    // Brightest at the top and gone by the bottom, with a soft head — an
    // aurora is lit from above and does not begin abruptly. One gradient for
    // the whole curtain, which is what stops it banding: the first version
    // drew horizontal strips of constant alpha and every seam was visible.
    const down = ctx.createLinearGradient(0, 0, 0, bottom);
    down.addColorStop(0, `rgb(${r} ${g} ${b} / 0)`);
    down.addColorStop(
      0.12,
      `rgb(${r} ${g} ${b} / ${0.9 / CURTAIN_PASSES.length})`,
    );
    down.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
    ctx.fillStyle = down;

    // **Nested passes, and the count is the whole quality of the edge.** Each
    // pass is the same fold drawn narrower, composited additively — so the
    // middle accumulates and the sides do not, which is a soft edge without
    // `ctx.filter` (Safari only learned that in 17). Three passes left visible
    // concentric outlines; nine is where the steps stop being separable.
    for (const pass of CURTAIN_PASSES) {
      ctx.beginPath();
      // Down the left edge, then back up the right, so the fold is one shape
      // rather than a stack of rectangles.
      for (let band = 0; band <= CURTAIN_BANDS; band += 1) {
        const { x, y } = centres[band]!;
        if (band === 0) ctx.moveTo(x - half * pass, y);
        else ctx.lineTo(x - half * pass, y);
      }
      for (let band = CURTAIN_BANDS; band >= 0; band -= 1) {
        const { x, y } = centres[band]!;
        ctx.lineTo(x + half * pass, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = previous;
}

/**
 * Draws a plasma: interfering sine fields, the demoscene's oldest trick.
 *
 * A pure function of position and time — no particles, no state, nothing
 * remembered — which is why it is drawn as a grid of cells rather than
 * per-pixel: at one cell per pixel this is a shader's job, and at this size the
 * difference is invisible while the cost is not.
 *
 * **The grid is shaded into bytes and blitted once**, rather than filled as one
 * rectangle per cell. The arithmetic was never the cost: building a
 * `rgb(…)` string per cell and having the canvas parse it as CSS was, and at
 * five times density that is nearly twelve thousand of them a frame.
 * `canvas-raster` carries the field itself, where its output can be asserted.
 *
 * **Tiled exactly, and the alpha is set once.** The first version drew each
 * cell a pixel wider than its step so there would be no seams, and painted each
 * one at `rgb(… / 0.5)` — so every overlap composited twice and the whole field
 * was covered in a bright grid. A single blit cannot overlap itself, and
 * `globalAlpha` applies the translucency to the pass rather than to each cell.
 *
 * @param ctx - the drawing context.
 * @param scratch - the reusable lattice bitmap.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawPlasma(
  ctx: CanvasRenderingContext2D,
  scratch: Scratch,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
) {
  const step = width / many(48, density, 160);
  const columns = latticePoints(width, step);
  const rows = latticePoints(height, step);
  const shaded = scratch.shade(
    columns,
    rows,
    plasmaPixels(
      columns,
      rows,
      step,
      width,
      height,
      3.2 / scale,
      seconds,
      tints[0]!,
      tints[1] ?? tints[0]!,
    ),
  );
  if (shaded) blitLattice(ctx, scratch, columns, rows, step);
}

/** How many points a cellular pattern is measured from. */
const CELL_COUNT = 26;

/**
 * Draws a cellular pattern: the edges where two points are equidistant.
 *
 * **What is drawn is the difference between the nearest two distances**, not
 * the points. That difference is zero exactly on a Voronoi boundary and grows
 * away from it, so shading by it lights the edges and leaves the cell interiors
 * dark. Drawing the points themselves gives dots; drawing the nearest distance
 * alone gives blobs.
 *
 * The points drift, so cells slowly take territory from each other rather than
 * sitting in a fixed mosaic.
 *
 * **This was the slowest canvas here after the aurora and the honeycomb**, and
 * neither of the two things costing it was the Voronoi idea. It measured a
 * distance with `Math.hypot`, once per lattice point per site — and `hypot`
 * rescales its arguments to survive an overflow no screen coordinate can reach,
 * which measured about thirty nanoseconds against roughly one for the plain
 * arithmetic. Then it assigned a `rgb(…)` string per point for the canvas to
 * parse as CSS. `canvas-raster` does neither: it orders by SQUARED distance,
 * which is the same ordering, and roots only the two winners; and it writes
 * bytes. Tiled exactly and made translucent once, for the reason `drawPlasma`
 * carries at length.
 *
 * @param ctx - the drawing context.
 * @param scratch - the reusable lattice bitmap.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawCells(
  ctx: CanvasRenderingContext2D,
  scratch: Scratch,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
) {
  const points = cells(many(CELL_COUNT, density, 90), FIELD_SEED).map(
    (cell) => ({
      x: cell.x + Math.cos(cell.phase + seconds * cell.speed) * cell.drift,
      y: cell.y + Math.sin(cell.phase + seconds * cell.speed) * cell.drift,
      tint: cell.tint,
    }),
  );

  const step = Math.max(6, 14 / scale);
  const columns = latticePoints(width, step);
  const rows = latticePoints(height, step);
  const shaded = scratch.shade(
    columns,
    rows,
    cellPixels(columns, rows, step, width, height, points, tints),
  );
  if (shaded) blitLattice(ctx, scratch, columns, rows, step);
}

/** How many lines follow the flow field. */
const STREAM_COUNT = 90;

/** How many steps each line is walked for. */
const STREAM_STEPS = 34;

/**
 * Draws a flow field: lines that follow a field of angles.
 *
 * **Each line is walked from its seed every frame rather than remembered.** A
 * flow field is normally built by stepping particles and keeping their trails,
 * which is state — and state is the one thing no canvas here may have, because
 * a page must be able to re-render, resize or be re-themed without the
 * animation carrying anything from before. Walking the same field from the same
 * seed gives the identical curve for free.
 *
 * The angle at a point comes from `valueNoise` of both coordinates, so the field
 * is smooth and neighbouring lines travel together — which is what makes it read
 * as a current rather than as scribble.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param dpr - device pixel ratio.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawFlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
) {
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, dpr * 0.9 * scale);

  for (const line of theStreamlines(many(STREAM_COUNT, density, 260))) {
    const [r, g, b] = tints[line.tint % tints.length]!;
    // The whole line drifts along its own path over time, so the current moves
    // without any point being remembered between frames.
    let x = (line.x + ((line.offset + seconds * line.speed) % 1)) % 1;
    let y = line.y;

    ctx.beginPath();
    ctx.moveTo(x * width, y * height);
    for (let step = 0; step < STREAM_STEPS; step += 1) {
      const angle =
        valueNoise(x * 3 + y * 2.3 + seconds * 0.05, FIELD_SEED) * TWO_PI * 1.5;
      x += (Math.cos(angle) * 0.012) / scale;
      y += (Math.sin(angle) * 0.012) / scale;
      if (x < 0 || x > 1 || y < 0 || y > 1) break;
      ctx.lineTo(x * width, y * height);
    }
    ctx.strokeStyle = `rgb(${r} ${g} ${b} / 0.3)`;
    ctx.stroke();
  }
}

/** How many lights drift about. */
const FIREFLY_COUNT = 60;

/**
 * Draws fireflies: lights that wander and breathe.
 *
 * Two independent rates per light, one for where it goes and one for how bright
 * it is. Tying them together makes the swarm blink in unison, which reads as a
 * string of fairy lights rather than as insects.
 *
 * Each is a soft radial glow rather than a disc, for the same reason `bokeh`
 * is: a hard-edged dot reads as a sticker.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @param density - how many of a thing to draw, as a multiplier.
 * @param scale - how large to draw it, as a multiplier.
 * @returns nothing.
 */
function drawFireflies(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
  density: number,
  scale: number,
) {
  const previous = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  const smaller = Math.min(width, height);

  for (const light of theFireflies(many(FIREFLY_COUNT, density, 400))) {
    const wander = light.phase + seconds * light.speed * TWO_PI;
    const x = (light.x + Math.cos(wander) * light.range) * width;
    const y = (light.y + Math.sin(wander * 0.7) * light.range) * height;
    const glow =
      (Math.sin(light.phase + seconds * light.pulse * TWO_PI) + 1) / 2;
    const radius = smaller * 0.012 * scale * (0.5 + glow);
    const [r, g, b] = tints[light.tint % tints.length]!;

    const halo = ctx.createRadialGradient(x, y, 0, x, y, radius);
    halo.addColorStop(0, `rgb(${r} ${g} ${b} / ${0.25 + glow * 0.55})`);
    halo.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.globalCompositeOperation = previous;
}

/**
 * Fallback layer opacity if the theme does not set one.
 *
 * The themes set their own; this is only what happens if a token goes missing.
 *
 * The field is a few large masses with real void between them, not an even
 * cover: the earlier pass filled the screen with small clouds, and a texture
 * that busy competes with the content instead of sitting behind it. Composited
 * text was measured at 17.5:1 in dark and 14.7:1 in light against a 4.5:1
 * requirement, and the masses are no brighter than that pass — only larger —
 * so the headroom that paid for the density still covers this.
 *
 * **The avatar rule is now the tight one.** The brightest thing on any screen
 * has to be the person's own fursona, and this field is far brighter than the
 * first pass. Whoever adds avatars should check them against it, not against
 * the plain gradient — and against a bright mass rather than a dark gap, since
 * the field is no longer uniform enough for one sample to stand for all of it.
 */
const DEFAULT_OPACITY = 0.3;

/**
 * Reads an `r g b` custom property, accepting either spaces or commas.
 *
 * The tints live in CSS rather than here so they change with the theme in one
 * place. Both separators are accepted because the tokens are written
 * space-separated in the Tailwind style, and a comma-only parser silently fell
 * back to grey on every frame — the clouds rendered, so nothing looked broken
 * until the pixels were sampled.
 *
 * The fallback is mid grey and therefore visible on purpose. A transparent
 * fallback would be indistinguishable from the blank-canvas bug this whole
 * module is defended against.
 *
 * @param styles - the computed styles to read from.
 * @param name - the custom property name.
 * @returns the three channels, 0-255.
 */
/**
 * One of the canvas's colours, by slot.
 *
 * **Falls back to the design's own two**, alternating, so a page nobody has
 * themed looks exactly as it did before canvases had slots — `globals.css`
 * still defines `--nebula-a` and `--nebula-b` and nothing else needed to
 * change there.
 *
 * @param styles - the document root's computed styles.
 * @param slot - which colour, from zero.
 * @returns the three channels, 0-255.
 */
function canvasColour(
  styles: CSSStyleDeclaration,
  slot: number,
): [number, number, number] {
  const chosen = styles.getPropertyValue(`--canvas-${slot + 1}`).trim();
  // The design's own two, alternating, for a canvas whose author picked
  // nothing. Named rather than chosen inside the conditional, so the two cases
  // read as "theirs" and "ours" instead of as three branches.
  const ours = slot % 2 === 0 ? "--nebula-a" : "--nebula-b";
  return readRgb(styles, chosen ? `--canvas-${slot + 1}` : ours);
}

function readRgb(
  styles: CSSStyleDeclaration,
  name: string,
): [number, number, number] {
  const parts = styles
    .getPropertyValue(name)
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) {
    return [128, 128, 128];
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

/**
 * The drifting cloud layer behind every page.
 *
 * Sits between the CSS gradient and the content: `fixed`, `inset-0`,
 * `pointer-events-none`, and never focusable. The gradient alone is a complete
 * design, so this layer failing to render degrades rather than breaks the page.
 *
 * Three things here are load-bearing and have each been got wrong before:
 *
 * 1. `width` and `height` are set as **attributes**, in device pixels. A canvas
 *    is a replaced element — `inset-0` stretches its CSS box while leaving the
 *    bitmap at its intrinsic 300x150, which looks like a small square in the
 *    corner.
 * 2. The noise is computed **once per size**, not per frame. Animation is a
 *    handful of `drawImage` calls; recomputing would cost a full tile of fBm
 *    every frame.
 * 3. The blend mode inverts with the theme — `screen` in dark because dust
 *    emits light, `multiply` in light because it absorbs it. Same texture,
 *    opposite physics.
 *
 * **The four retro savers are built from `bounced`**, which folds a sawtooth
 * back on itself instead of wrapping it. A modulo teleports a thing from one
 * edge to the other; a reflection is a bounce. That is why none of them
 * remembers a velocity, and why mystify can draw its echoes as the same polygon
 * at earlier TIMES rather than as a history it keeps.
 *
 * **Three dials scale it: how busy, how fast, and how big.** Density multiplies how many
 * of a thing each canvas draws; speed multiplies the clock, so no renderer
 * needs to know speed exists — one asked to go twice as fast is simply handed a
 * time twice as large. Size multiplies what each thing measures, which changes
 * what a canvas IS rather than how much of it there is. All three are read from
 * the root like every other themed value, and all three clamp rather than
 * refuse.
 *
 * **The nebula answers them too, and did not used to.** It read raw `elapsed`
 * and a fixed set of layers, so the one canvas a page gets by default was the
 * one canvas the sliders did not move. Density is its OPACITY rather than a
 * count: the clouds tile the whole viewport whatever happens, so "busier" means
 * thicker.
 *
 * **Every renderer is a pure function of seed and time.** Nothing carries
 * state between frames, which is what lets a page be themed, resized or
 * re-read without the animation jumping — and it is why anything needing a
 * simulation (flocking, a particle swarm following a flow field) is not here.
 * A trail is drawn as an arc rather than accumulated.
 *
 * **The renderers are a record keyed by name.** A canvas added to `CANVASES`
 * without an entry there falls through to the nebula silently, which is the
 * "the control did nothing" fault this feature keeps producing wearing a new
 * hat — and a record makes the omission a missing key rather than a missing
 * branch somebody has to notice.
 *
 * **It draws whichever canvas `--canvas` names**, falling through to the nebula
 * for a name it does not know — which is also what an unthemed page gets, since
 * an unthemed page sets no such property. The choice arrives as a custom
 * property rather than as a prop because this is mounted in the root layout,
 * and a page nested inside it has no way to hand it one. That is the same
 * channel `--nebula-blend` and `--nebula-opacity` already travel on.
 *
 * **That fallback is resolved ONCE, by `resolveCanvas`, before anything reads
 * the name.** It used to be applied where the drawing was chosen and nowhere
 * else, so the resolution table was asked about the raw string instead — and
 * `renderScale("")` answers 1 where `renderScale("nebula")` answers 0.5. Since
 * `themeCss` emits `--canvas` only for a canvas other than the default, `""` is
 * what nearly every page in the app serves, and every one of them drew the
 * nebula at four times its intended pixels: 35.8ms a frame at a device ratio of
 * two, against 8.9ms named. A fallback that each consumer applies for itself is
 * a fallback each consumer gets a separate chance to disagree about.
 *
 * **Every canvas takes one colour per part it paints with**, read from
 * `--canvas-N` and falling back to the design's own two when unset — so a page
 * nobody has themed looks exactly as it did before canvases had slots. The
 * nebula's three layers each have their own now; they shared two, with the near
 * layer reusing the far one's, which is why its depth read as haze. A canvas
 * that hard-coded a palette would break all of this.
 *
 * **It rebuilds only when the theme's colours actually move**, and that guard
 * is load-bearing: the observer watches the whole document, because the
 * `<style>` an actor's theme arrives in is rendered inside the page and React
 * replaces it on every frame of a gradient drag. Wired straight to a rebuild,
 * every one of those frames recomputed three layers of fractal noise — about
 * 24ms each, more than a frame's entire budget — and the theming editor was
 * unusable for a reason nowhere near the code that appeared to cause it.
 *
 * **It rebuilds when the theme's colours move.** The nebula's tint is painted
 * INTO its offscreen tiles, so a colour change is invisible until they are
 * remade — which is why an author dragging a backdrop colour watched nothing
 * happen. The animated path compares each frame; the still path is told by a
 * mutation observer, because nothing redraws there unless something says so.
 *
 * **`none` is honoured by name.** It used to be expressed as an opacity of
 * zero, which silently did nothing: a non-positive opacity is rejected below as
 * unset, so a page asking for no canvas drew the ordinary one.
 *
 * The starfield is Moonfest's, ported from `eclipse-con`: three parallax
 * layers, stars crowded toward the top, two oscillators per star, diffraction
 * spikes on the bright ones, and streaks crossing on a cycle.
 *
 * Renders one static frame when animation is off rather than nothing, so
 * reduced motion keeps the design and loses only the movement — and that
 * applies to every canvas here, not only the nebula.
 * Its colours arrive as `--canvas-N` custom properties read from the document root, never as classes — a canvas mounted above every page cannot be handed a prop by one.
 * Unchanged in behaviour; its slot colours resolve through one named fallback rather than a conditional inside a conditional.
 *
 * **Two ways a renderer here can draw an artefact instead of a picture**, both
 * found by looking and both easy to repeat. Filling a shape as strips of
 * constant alpha BANDS — every seam is a visible line, which is what the
 * aurora did before it became one polygon under a vertical gradient. And
 * drawing tiles a pixel oversized to hide seams composites the overlap twice,
 * so a half-transparent fill draws the very grid the overlap was meant to
 * prevent: plasma and cells tile on exact integers with `ctx.globalAlpha` set
 * once, which paints every pixel exactly once.
 *
 * **The bitmap is not always the device's resolution, and that is where most
 * of the speed here comes from.** `renderScale` names a fraction per canvas
 * and `resize` folds it into `dpr`, so every renderer follows without being
 * told: each measures its lines and radii in device pixels, so a bitmap at half
 * resolution gets half-size lines that land the same size on screen, and the
 * compositor stretches the result for nothing. It is compared against
 * `sizedAt` rather than assigned each frame, because setting `canvas.width`
 * clears and reallocates the bitmap. A canvas with a visible EDGE — a star, a
 * glyph of rain, a constellation line — is not in that table and must not be
 * added to it for speed alone.
 *
 * **`resize` and `bake` are separate, and a resize no longer bakes.** A tile is
 * `TILE` square whatever the window is, so dragging a window edge was
 * recomputing three layers of five-octave fractal noise for a result already
 * in hand.
 *
 * **Every field generator large enough to matter is remembered between
 * frames**, through `remembered`. They are pure functions of a count and the
 * one fixed seed, so keeping the result is not caching a guess — it is
 * declining to rebuild a constant eleven thousand objects at a time. Motion
 * comes from the CLOCK, applied to the stored field at draw time. The arrays
 * it hands back are SHARED, so a renderer may read one or map it into a fresh
 * array, and may never mutate it in place.
 *
 * **The two lattice canvases shade into bytes rather than into thousands of
 * parsed colours.** `cells` and `plasma` colour every point of a grid, which is
 * tens of thousands of points where every other canvas here paints tens or
 * hundreds of things; a `fillRect` and a fresh `rgb(…)` string each was what
 * made them expensive, not their arithmetic. See `canvas-raster`.
 *
 * **Where a dial's cost grows faster than the dial, there is a cap, and each
 * one is named.** Density multiplies how many; size multiplies each one's AREA.
 * The product is what ran the honeycomb to 2192ms a frame and the aurora to
 * 636ms — and in both cases the picture at that setting was a solid wall
 * rather than a dense one, so the cap is as much a picture as a budget.
 *
 * **The still path asks TWO questions, and asking one was a bug.** With motion
 * off this paints a single frame and then nothing until something says
 * otherwise. What said otherwise compared `tintSignature` — the colours — which
 * is the right test for whether the offscreen TILES need rebaking and the wrong
 * one for whether the SCREEN needs redrawing: choosing another canvas, or
 * moving the busy or size dial, changes no colour. The theme arrived, matched,
 * and was discarded, so the picker did nothing for the readers least able to
 * work out why. `frameSignature` is the second question and covers everything a
 * still frame can show. The animated path never needed either — it re-reads the
 * root sixty times a second — which is exactly why the fault could sit here
 * unseen.
 *
 * **`prefers-reduced-motion` is a rendering mode here, not a switch that turns
 * the design off.** One frame is still drawn, and every canvas honours it; what
 * is lost is the movement and nothing else.
 */
export function NebulaCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [storedPart, reducedPart] = snapshot.split("|");
  const { enabled, animated } = resolveNebula(
    storedPart === "" ? null : (storedPart ?? null),
    reducedPart === "true",
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let tiles: HTMLCanvasElement[] = [];
    // What the tiles were baked with. The nebula's colour is painted INTO the
    // offscreen tiles, so a tint change is invisible until they are rebuilt —
    // which is why an author dragging a backdrop colour saw nothing happen.
    let bakedWith = "";
    // What is currently ON SCREEN, which is not the same as what the tiles were
    // baked with — see `frameSignature`. Only the still path reads it, because
    // only the still path has to decide whether to draw at all.
    let shownWith = "";
    let width = 0;
    let height = 0;
    let dpr = 1;
    // The fraction of device resolution the bitmap currently has. Zero until
    // the first `resize`, which no `renderScale` returns, so the first draw
    // always sizes the bitmap rather than relying on a sentinel nobody set.
    let sizedAt = 0;
    const scratch = makeScratch();

    /**
     * Sizes the bitmap for a canvas's resolution.
     *
     * **The soft canvases are given a smaller bitmap and the compositor
     * stretches it**, which is where most of the fill-rate saving in this file
     * comes from — see `canvas-resolution`. Folding the fraction into `dpr` is
     * what makes every renderer follow without being told: each measures its
     * line widths and radii in device pixels, so a bitmap at half resolution
     * gets half-size lines that land at the same size on the screen.
     *
     * @param fraction - how much of the device ratio to render at.
     * @returns nothing.
     */
    const resize = (fraction: number) => {
      sizedAt = fraction;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * fraction;
      width = Math.max(1, Math.floor(window.innerWidth * dpr));
      height = Math.max(1, Math.floor(window.innerHeight * dpr));
      // Attributes, not CSS: this is the bitmap size. See the note above.
      canvas.width = width;
      canvas.height = height;
    };

    /**
     * Rebuilds the nebula's offscreen tiles for the current theme.
     *
     * **Separate from `resize`, and that separation is a real saving.** The
     * tiles are `TILE` square whatever the window is, so a resize never needed
     * to recompute them — and doing so cost three layers of five-octave fractal
     * noise, about 24ms each, on every frame of a window drag.
     *
     * @returns nothing.
     */
    const bake = () => {
      const styles = getComputedStyle(document.documentElement);
      bakedWith = tintSignature(styles);
      tiles = LAYERS.map((layer) => {
        const pixels = tilePixels(TILE, TILE, {
          seed: layer.seed,
          gain: layer.gain,
          bias: layer.bias,
          rgb: canvasColour(styles, layer.slot),
        });
        const off = document.createElement("canvas");
        off.width = TILE;
        off.height = TILE;
        off
          .getContext("2d")
          ?.putImageData(new ImageData(pixels, TILE, TILE), 0, 0);
        return off;
      });
    };

    /**
     * Draws every layer at the given time offset.
     *
     * @param elapsed - milliseconds since the animation started.
     * @returns nothing.
     */
    const draw = (elapsed: number) => {
      const styles = getComputedStyle(document.documentElement);
      // Recorded here, before any early return, so the still path knows what is
      // on screen even when what is on screen is deliberately nothing — a page
      // that asked for `none` and then picks a canvas again has to redraw, and
      // it is the only signal that would say so.
      shownWith = frameSignature(styles);
      const blend = styles.getPropertyValue("--nebula-blend").trim();
      // The chosen animation, read from the document root because that is where
      // an actor's theme puts it — the canvas is mounted in the root layout and
      // cannot be handed a prop by a page nested inside it.
      //
      // **Resolved once, here, and every line below uses the resolved name.**
      // An unset property and an unknown one both mean the default canvas, and
      // this function used to say so in one place and not in another: it drew
      // the nebula for `""` and then asked `renderScale("")`, which answers 1
      // where `renderScale("nebula")` answers 0.5. `themeCss` emits `--canvas`
      // only for a NON-default canvas, so `""` is what almost every page in the
      // app serves — and every one of them drew the nebula at four times the
      // pixels it was designed for. See `resolveCanvas`.
      const chosen = resolveCanvas(styles.getPropertyValue("--canvas").trim());

      // **`none` is handled here, by name.** It used to be expressed as an
      // opacity of zero, which never worked: the guard below rejects a
      // non-positive opacity as unset and substitutes the default, so a page
      // asking for no canvas got the ordinary one. Reading the name means the
      // choice is reversible too — the next frame after somebody picks a canvas
      // again draws it, with no state to reset.
      if (chosen === "none") {
        ctx.clearRect(0, 0, width, height);
        return;
      }

      // Resize when the chosen canvas wants a different resolution from the one
      // the bitmap has. Compared rather than assigned every frame because
      // setting `canvas.width` CLEARS the bitmap and reallocates it, which at
      // sixty frames a second is both a stutter and a steady stream of garbage.
      const wanted = renderScale(chosen);
      if (wanted !== sizedAt) resize(wanted);

      // Rebuild when the theme's colours have moved. Checked here rather than
      // watched, because the values arrive as a `<style>` element React
      // replaces on every keystroke of a colour input — a mutation observer for
      // that is both noisier and later than simply comparing what we drew with.
      // The comparison is two string reads against a computed style this
      // function already holds.
      if (tintSignature(styles) !== bakedWith) bake();

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation =
        blend === "screen" || blend === "multiply"
          ? (blend as GlobalCompositeOperation)
          : "screen";
      const opacity = Number.parseFloat(
        styles.getPropertyValue("--nebula-opacity"),
      );
      // `>= 0`, not `> 0`. Zero is a value somebody may legitimately set and
      // rejecting it as "unset" is what made an explicit request for no cloud
      // draw the default one instead.
      ctx.globalAlpha =
        Number.isFinite(opacity) && opacity >= 0 && opacity <= 1
          ? opacity
          : DEFAULT_OPACITY;

      // Every canvas but the nebula draws from the same tint list, so it is
      // read once here rather than by each of them.
      if (chosen !== DEFAULT_CANVAS) {
        const tints = Array.from({ length: MAX_CANVAS_COLOURS }, (_, i) =>
          canvasColour(styles, i),
        );
        // **Two dials, read from the root like every other themed value.**
        // Density multiplies how many of a thing each canvas draws; speed
        // multiplies the clock, so no renderer needs to know it exists — one
        // asked to go twice as fast is simply handed a time twice as large.
        const density = dial(
          styles.getPropertyValue("--canvas-density").trim(),
        );
        const seconds =
          (elapsed / 1000) *
          dial(styles.getPropertyValue("--canvas-speed").trim());
        const scale = dial(styles.getPropertyValue("--canvas-scale").trim());
        // A record rather than a chain of branches: a canvas added to `CANVASES`
        // without an entry here would fall through to the nebula silently, and
        // "the control did nothing" is the fault this feature keeps producing.
        const draws: Record<string, () => void> = {
          stars: () =>
            drawStars(
              ctx,
              width,
              height,
              dpr,
              tints,
              seconds,
              animated,
              density,
              scale,
            ),
          aurora: () =>
            drawAurora(ctx, width, height, tints, seconds, density, scale),
          plasma: () =>
            drawPlasma(
              ctx,
              scratch,
              width,
              height,
              tints,
              seconds,
              density,
              scale,
            ),
          cells: () =>
            drawCells(
              ctx,
              scratch,
              width,
              height,
              tints,
              seconds,
              density,
              scale,
            ),
          flow: () =>
            drawFlow(ctx, width, height, dpr, tints, seconds, density, scale),
          fireflies: () =>
            drawFireflies(ctx, width, height, tints, seconds, density, scale),
          constellation: () =>
            drawConstellation(
              ctx,
              width,
              height,
              dpr,
              tints,
              seconds,
              density,
              scale,
            ),
          waves: () =>
            drawWaves(ctx, width, height, tints, seconds, density, scale),
          bubbles: () =>
            drawBubbles(
              ctx,
              width,
              height,
              dpr,
              tints,
              seconds,
              density,
              scale,
            ),
          snow: () =>
            drawSnow(ctx, width, height, tints, seconds, density, scale),
          grid: () =>
            drawGrid(ctx, width, height, dpr, tints, seconds, density, scale),
          blobs: () =>
            drawBlobs(ctx, width, height, tints, seconds, density, scale),
          orbits: () =>
            drawOrbits(ctx, width, height, dpr, tints, seconds, density, scale),
          hexagons: () =>
            drawHexagons(
              ctx,
              width,
              height,
              dpr,
              tints,
              seconds,
              density,
              scale,
            ),
          ribbons: () =>
            drawRibbons(ctx, width, height, tints, seconds, density, scale),
          confetti: () =>
            drawConfetti(ctx, width, height, tints, seconds, density, scale),
          skyline: () =>
            drawSkyline(ctx, width, height, tints, seconds, density, scale),
          bokeh: () =>
            drawBokeh(ctx, width, height, tints, seconds, density, scale),
          mystify: () =>
            drawMystify(
              ctx,
              width,
              height,
              dpr,
              tints,
              seconds,
              density,
              scale,
            ),
          bounce: () =>
            drawBounce(ctx, width, height, tints, seconds, density, scale),
          rain: () =>
            drawRain(ctx, width, height, dpr, tints, seconds, density, scale),
          warp: () =>
            drawWarp(ctx, width, height, dpr, tints, seconds, density, scale),
        };
        const drawChosen = Object.hasOwn(draws, chosen)
          ? draws[chosen]
          : undefined;
        // An unknown name falls through to the nebula, which is what an
        // unthemed page shows and what a page whose stored canvas was renamed
        // should get rather than nothing at all.
        if (drawChosen) {
          drawChosen();
          return;
        }
      }

      // **The nebula answers the dials as well.** It used raw `elapsed` and a
      // fixed set of layers, so speed and size passed it by entirely — the one
      // canvas a page gets by default was the one canvas the sliders did not
      // move.
      //
      // Density is opacity here rather than a count. There is nothing to have
      // more of: the clouds tile the whole viewport whatever happens, so
      // "busier" means thicker, and the alpha is what carries that. Clamped,
      // because past one it is a wall.
      const nebulaDensity = dial(
        styles.getPropertyValue("--canvas-density").trim(),
      );
      const nebulaSpeed = dial(
        styles.getPropertyValue("--canvas-speed").trim(),
      );
      const nebulaScale = dial(
        styles.getPropertyValue("--canvas-scale").trim(),
      );
      ctx.globalAlpha = Math.min(1, ctx.globalAlpha * nebulaDensity);
      for (const [i, tile] of tiles.entries()) {
        const layer = LAYERS[i]!;
        // Both are device pixels, and both are multiplied by `dpr` for the same
        // reason: everything here is a size on screen, and a size in device
        // pixels is half as large on a retina display as on an ordinary one.
        // Leaving the `dpr` out is what made the clouds small and numerous on
        // exactly the machines the design was being judged on.
        const span = TILE * layer.scale * dpr * nebulaScale;
        const offset =
          ((elapsed / 1000) *
            nebulaSpeed *
            DRIFT_PX_PER_SECOND *
            layer.speed *
            dpr) %
          span;
        // Two extra tiles each way, so the drifting edge never enters view.
        for (let x = -span; x < width + span; x += span) {
          for (let y = -span; y < height + span; y += span) {
            ctx.drawImage(tile, x + offset, y + offset * 0.4, span, span);
          }
        }
      }
    };

    resize(
      renderScale(
        resolveCanvas(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--canvas")
            .trim(),
        ),
      ),
    );
    bake();

    if (animated) {
      const start = performance.now();
      /**
       * The animation loop.
       *
       * @param now - the frame timestamp.
       * @returns nothing.
       */
      const tick = (now: number) => {
        draw(now - start);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    } else {
      // A single frame, so reduced motion keeps the design without the movement.
      draw(0);
    }

    /**
     * Resizes the bitmap and redraws after the window changes size.
     *
     * **It no longer re-bakes the nebula's tiles**, and that is a fix rather
     * than a tidy-up: a tile is `TILE` square whatever the window is, so
     * dragging a window edge was recomputing three layers of five-octave
     * fractal noise — the single most expensive thing this component does —
     * for a result identical to the one already in hand.
     *
     * @returns nothing.
     */
    const onResize = () => {
      resize(sizedAt);
      if (!animated) draw(0);
    };
    window.addEventListener("resize", onResize);

    /**
     * Bakes and redraws when the theme actually moved — two questions, not
     * one.
     *
     * **This guard is the difference between a smooth drag and a rough one.**
     * The observer below watches the whole document, because the `<style>` an
     * actor's theme arrives in is rendered inside the page — and React replaces
     * that element on every frame of a gradient drag. Wired straight to
     * `onResize`, as it first was, every one of those frames recomputed three
     * layers of fractal noise, which is by far the most expensive thing this
     * component does. The theming editor was unusable and the cost was nowhere
     * near the code that appeared to cause it.
     *
     * **Asking one question where there were two was itself a bug.** Rebaking
     * depends on the COLOURS, because nothing else is painted into a tile.
     * Redrawing depends on everything a frame can show. The still path used the
     * colour comparison for both, so a reader who had asked for no motion could
     * pick a different canvas, or move the busy or size dial, and watch nothing
     * happen: the theme arrived, matched on colour, and was thrown away. The
     * animated path never showed it, because there every frame re-reads the
     * root anyway.
     *
     * Comparing still makes the common case a handful of property reads and a
     * string compare, which is what keeps the drag smooth.
     *
     * @returns nothing.
     */
    const onThemeChanged = () => {
      const styles = getComputedStyle(document.documentElement);
      if (tintSignature(styles) !== bakedWith) bake();
      // Only the still path. The animated one redraws sixty times a second and
      // reads the root each time, so telling it what changed is telling it
      // something it is about to find out.
      if (!animated && frameSignature(styles) !== shownWith) draw(0);
    };

    // `data-theme` for the reader's own light/dark switch, and the subtree for
    // the `<style>` an actor's theme arrives in. A resize is a separate signal
    // and still resizes unconditionally, because the bitmap itself changed size
    // and no comparison of colours would show that.
    const observer = new MutationObserver(onThemeChanged);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
      childList: true,
      subtree: true,
    });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
  }, [enabled, animated]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 size-full"
    />
  );
}
