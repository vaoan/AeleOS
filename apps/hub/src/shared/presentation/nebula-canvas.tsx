"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { CELL_SIZE, tilePixels } from "@/shared/application/nebula-noise";
import { MAX_CANVAS_COLOURS } from "@/shared/domain/canvas-slots";
import {
  aurora,
  blobs,
  bokeh,
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
  swayOf,
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
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  // `storage` covers the same preference changed in another tab; the custom
  // event covers this tab, where `storage` deliberately does not fire.
  window.addEventListener("storage", onChange);
  window.addEventListener(NEBULA_CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(NEBULA_CHANGE_EVENT, onChange);
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
  return `${stored ?? ""}|${window.matchMedia(REDUCED_MOTION).matches}`;
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

/** How far the field drifts each second, in CSS pixels. */
const DRIFT_PX_PER_SECOND = 4;

/** Device pixel ratio is capped here: beyond 2 costs memory for no visible gain. */
const MAX_DPR = 2;

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

/** A full turn, which most of these need at least once. */
const TWO_PI = Math.PI * 2;

/** How many stars the far layer draws; the nearer layers scale from it. */
const STAR_COUNT = 1200;

/** How many streaks are in one cycle of the sky. */
const SHOT_COUNT = 4;

/** How long that cycle is, in seconds. */
const SHOT_CYCLE = 14;

/** The angle a streak travels, up and to the right. */
const SHOT_ANGLE = (25 * Math.PI) / 180;

/** How many curtains an aurora has. Few and wide — see `aurora`. */
const CURTAIN_COUNT = 4;

/** The seed every field is generated from, so the sky is the same every time. */
const FIELD_SEED = 0x5eed;

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
) {
  // One colour per LAYER rather than a mix across the whole sky. A layer is the
  // thing somebody can see and therefore the thing worth being able to colour;
  // mixing every star between two made the field one blended wash.
  const layers = starfield(FIELD_SEED, STAR_COUNT);
  for (const [index, layer] of layers.entries()) {
    const [r, g, bl] = tints[index % tints.length]!;
    for (const star of layer.stars) {
      // Still on the still path: one frame at a representative brightness,
      // so reduced motion keeps the sky and loses only the movement.
      const alpha = animated
        ? twinkle(star, seconds, layer.brightness)
        : Math.min(0.95, star.alpha * 0.78 * layer.brightness);
      const x = star.x * width;
      const y = star.y * height;
      const size = star.r * dpr;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${r} ${g} ${bl})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      // The cross only on the big, bright ones. On every star it is a grid of
      // plus signs; on a few it is a sky.
      if (star.r > 1.8 && alpha > 0.45) {
        ctx.globalAlpha = alpha * 0.35;
        ctx.strokeStyle = `rgb(${r} ${g} ${bl})`;
        ctx.lineWidth = 0.8 * dpr;
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
const NODE_COUNT = 70;

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
 * @returns nothing.
 */
function drawConstellation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const at = constellation(NODE_COUNT, FIELD_SEED).map((node) =>
    nodeAt(node, seconds),
  );
  const [lr, lg, lb] = tints[1] ?? tints[0]!;
  ctx.lineWidth = Math.max(1, dpr * 0.6);
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
    ctx.arc(point.x * width, point.y * height, dpr * 1.4, 0, TWO_PI);
    ctx.fill();
  }
}

/** How many bands a wave field has. */
const WAVE_COUNT = 3;

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
 * @returns nothing.
 */
function drawWaves(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  for (const wave of waves(WAVE_COUNT, FIELD_SEED)) {
    const [r, g, b] = tints[wave.tint] ?? tints[0]!;
    ctx.fillStyle = `rgb(${r} ${g} ${b} / 0.32)`;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i <= WAVE_STEPS; i += 1) {
      const t = i / WAVE_STEPS;
      const crest =
        Math.sin((t * wave.length + seconds * wave.speed) * TWO_PI) *
        wave.height;
      ctx.lineTo(t * width, (wave.level + crest) * height);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }
}

/** How many bubbles rise at once. */
const BUBBLE_COUNT = 40;

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
 * @returns nothing.
 */
function drawBubbles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const smaller = Math.min(width, height);
  ctx.lineWidth = Math.max(1, dpr);
  for (const bubble of bubbles(BUBBLE_COUNT, FIELD_SEED)) {
    const climbed = (bubble.offset + seconds * bubble.speed) % 1;
    const [r, g, b] = tints[bubble.tint] ?? tints[0]!;
    // Faded at both ends of the climb, so nothing pops into or out of being.
    const alpha = Math.sin(climbed * Math.PI) * 0.5;
    ctx.strokeStyle = `rgb(${r} ${g} ${b} / ${alpha})`;
    ctx.beginPath();
    ctx.arc(
      (bubble.x + Math.sin(climbed * TWO_PI) * bubble.wander) * width,
      (1 - climbed) * height,
      bubble.radius * smaller,
      0,
      TWO_PI,
    );
    ctx.stroke();
  }
}

/** How many flakes fall at once. */
const FLAKE_COUNT = 140;

/**
 * Draws falling snow.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @returns nothing.
 */
function drawSnow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const smaller = Math.min(width, height);
  for (const flake of snow(FLAKE_COUNT, FIELD_SEED)) {
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
const GRID_LINES = 14;

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
 * @returns nothing.
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const horizon = height * HORIZON;
  const [r, g, b] = tints[0]!;
  ctx.lineWidth = Math.max(1, dpr * 0.8);
  ctx.strokeStyle = `rgb(${r} ${g} ${b} / 0.35)`;
  for (let i = -GRID_LINES; i <= GRID_LINES; i += 1) {
    ctx.beginPath();
    ctx.moveTo(width / 2 + (i / GRID_LINES) * width * 0.08, horizon);
    ctx.lineTo(width / 2 + (i / GRID_LINES) * width * 2.2, height);
    ctx.stroke();
  }
  const scroll = (seconds * 0.25) % 1;
  for (let i = 0; i < GRID_LINES; i += 1) {
    const t = (i + scroll) / GRID_LINES;
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
const BLOB_COUNT = 3;

/**
 * Draws a few large, soft glows.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @returns nothing.
 */
function drawBlobs(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const larger = Math.max(width, height);
  for (const blob of blobs(BLOB_COUNT, FIELD_SEED)) {
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
const ORBIT_COUNT = 26;

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
 * @returns nothing.
 */
function drawOrbits(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const smaller = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  ctx.lineCap = "round";
  for (const orbiter of orbits(ORBIT_COUNT, FIELD_SEED)) {
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
const HEX_COLUMNS = 16;

/** How many rows it runs down. */
const HEX_ROWS = 14;

/**
 * Draws a breathing honeycomb.
 *
 * The cells are stroked rather than filled: a filled honeycomb is a wall, and
 * a wall behind text is a page nobody can read.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param dpr - device pixel ratio.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @returns nothing.
 */
function drawHexagons(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const radius = width / HEX_COLUMNS / 1.8;
  const [lr, lg, lb] = tints[0]!;
  const [gr, gg, gb] = tints[1] ?? tints[0]!;
  ctx.lineWidth = Math.max(1, dpr * 0.7);
  for (const cell of honeycomb(HEX_COLUMNS, HEX_ROWS, FIELD_SEED)) {
    const breath =
      (Math.sin(cell.phase + seconds * cell.speed * TWO_PI) + 1) / 2;
    const x = cell.x * width;
    const y = cell.y * height;
    ctx.beginPath();
    for (let corner = 0; corner < 6; corner += 1) {
      // Flat-topped, which is what makes the half-column offset tessellate.
      const angle = (corner / 6) * TWO_PI + Math.PI / 6;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (corner === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgb(${lr} ${lg} ${lb} / ${0.08 + breath * 0.22})`;
    ctx.stroke();
    if (breath > 0.85) {
      ctx.fillStyle = `rgb(${gr} ${gg} ${gb} / ${(breath - 0.85) * 0.8})`;
      ctx.fill();
    }
  }
}

/** How many ribbons cross the viewport. */
const RIBBON_COUNT = 3;

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
 * @returns nothing.
 */
function drawRibbons(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  for (const ribbon of ribbons(RIBBON_COUNT, FIELD_SEED)) {
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
        (0.4 + 0.6 * Math.abs(Math.cos(t * ribbon.bends * TWO_PI)));
      ctx.lineTo(t * width, (ribbon.level + wave + swell) * height);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** How many pieces of confetti fall at once. */
const CONFETTO_COUNT = 90;

/**
 * Draws falling, tumbling confetti.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @returns nothing.
 */
function drawConfetti(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const smaller = Math.min(width, height);
  for (const piece of confetti(CONFETTO_COUNT, FIELD_SEED)) {
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
const SKYLINE_LAYERS = 3;

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
 * @returns nothing.
 */
function drawSkyline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  for (const layer of skyline(SKYLINE_LAYERS, FIELD_SEED)) {
    const [r, g, b] = tints[layer.tint] ?? tints[0]!;
    ctx.fillStyle = `rgb(${r} ${g} ${b} / 0.3)`;
    const shift = ((seconds * layer.speed) % 1) * width;
    for (const repeat of [0, 1]) {
      for (const building of layer.buildings) {
        ctx.fillRect(
          building.at * width - shift + repeat * width,
          height - building.height * height,
          building.width * width + 1,
          building.height * height,
        );
      }
    }
  }
}

/** How many out-of-focus spots drift about. */
const SPOT_COUNT = 34;

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
 * @returns nothing.
 */
function drawBokeh(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const smaller = Math.min(width, height);
  for (const spot of bokeh(SPOT_COUNT, FIELD_SEED)) {
    const angle = spot.phase + seconds * spot.speed * TWO_PI;
    const x = (spot.x + Math.cos(angle) * spot.drift) * width;
    const y = (spot.y + Math.sin(angle) * spot.drift) * height;
    const radius = spot.radius * smaller;
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
const MYSTIFY_COUNT = 2;

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
 * @returns nothing.
 */
function drawMystify(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  ctx.lineWidth = Math.max(1, dpr);
  for (const shape of mystify(MYSTIFY_COUNT, MYSTIFY_CORNERS, FIELD_SEED)) {
    const [r, g, b] = tints[shape.tint] ?? tints[0]!;
    for (let echo = shape.echoes; echo >= 0; echo -= 1) {
      const when = seconds - echo * shape.spacing;
      ctx.strokeStyle = `rgb(${r} ${g} ${b} / ${0.5 * (1 - echo / (shape.echoes + 1))})`;
      ctx.beginPath();
      shape.corners.forEach((corner, i) => {
        const x = bounced(corner.startX + when * corner.speedX) * width;
        const y = bounced(corner.startY + when * corner.speedY) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
  }
}

/** How many rectangles bounce about. */
const WANDERER_COUNT = 3;

/**
 * Draws rectangles bouncing off the edges.
 *
 * @param ctx - the drawing context.
 * @param width - bitmap width.
 * @param height - bitmap height.
 * @param tints - one colour per slot.
 * @param seconds - seconds since the animation started.
 * @returns nothing.
 */
function drawBounce(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  wanderers(WANDERER_COUNT, FIELD_SEED).forEach((box, i) => {
    // Bounced within the room the box leaves, so it meets the edge rather than
    // half-leaving it — the corner is the whole point of watching.
    const x = bounced(box.startX + seconds * box.speedX) * (1 - box.width);
    const y = bounced(box.startY + seconds * box.speedY) * (1 - box.height);
    const [r, g, b] = tints[i % 3] ?? tints[0]!;
    ctx.fillStyle = `rgb(${r} ${g} ${b} / 0.5)`;
    ctx.fillRect(x * width, y * height, box.width * width, box.height * height);
  });
}

/** How many columns of glyphs fall. */
const RAIN_COLUMNS = 46;

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
 * @returns nothing.
 */
function drawRain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const size = Math.max(10, (width / RAIN_COLUMNS) * 0.9);
  ctx.font = `${size}px ui-monospace, monospace`;
  ctx.textBaseline = "top";
  const rows = Math.ceil(height / size);
  const step = Math.floor(seconds * RAIN_STEPS_PER_SECOND);
  const [tr, tg, tb] = tints[0]!;
  const [hr, hg, hb] = tints[1] ?? tints[0]!;
  for (const column of rainColumns(RAIN_COLUMNS, FIELD_SEED)) {
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
const WARP_COUNT = 220;

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
 * @returns nothing.
 */
function drawWarp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  tints: [number, number, number][],
  seconds: number,
): void {
  const cx = width / 2;
  const cy = height / 2;
  const reach = Math.hypot(cx, cy);
  ctx.lineCap = "round";
  for (const star of warpStars(WARP_COUNT, FIELD_SEED)) {
    const t = (star.offset + seconds * star.speed) % 1;
    const far = t * t * reach;
    // The streak is the distance travelled since a moment ago, so a star near
    // the viewer draws a long line and a distant one draws a point.
    const near = Math.max(0, t - 0.06);
    const from = near * near * reach;
    const [r, g, b] = tints[t > 0.6 ? 1 : 0] ?? tints[0]!;
    ctx.strokeStyle = `rgb(${r} ${g} ${b} / ${Math.min(1, t * 1.6)})`;
    ctx.lineWidth = Math.max(1, dpr * (0.4 + t * 1.6));
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

/**
 * Draws an aurora.
 *
 * Each curtain is a vertical gradient that fades out at both ends, swaying on
 * its own sine. They are drawn additively by the caller's blend mode, so where
 * two overlap the colour builds — which is what the real thing does.
 *
 * @param ctx - the drawing context.
 * @param width - the bitmap width in device pixels.
 * @param height - the bitmap height in device pixels.
 * @param tints - the two theme colours, as channel triples.
 * @param seconds - elapsed time.
 * @returns nothing.
 */
function drawAurora(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tints: [number, number, number][],
  seconds: number,
) {
  for (const curtain of aurora(CURTAIN_COUNT, FIELD_SEED)) {
    const centre = swayOf(curtain, seconds) * width;
    const half = (curtain.width * width) / 2;
    // Its own colour per curtain, so four curtains can be four colours.
    const [r, g, b] = tints[curtain.tint % tints.length]!;

    // Horizontal falloff, so a curtain has no edge. A flat band with a hard
    // side is the difference between an aurora and a stripe.
    const across = ctx.createLinearGradient(centre - half, 0, centre + half, 0);
    across.addColorStop(0, `rgb(${r} ${g} ${b} / 0)`);
    across.addColorStop(0.5, `rgb(${r} ${g} ${b} / 0.55)`);
    across.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);

    ctx.fillStyle = across;
    ctx.fillRect(centre - half, 0, half * 2, height);
  }

  // One vertical wash over the whole field, fading the bottom out. Auroras hang
  // from the top; without this they read as columns standing on the floor.
  const down = ctx.createLinearGradient(0, 0, 0, height);
  down.addColorStop(0, "rgb(0 0 0 / 0)");
  down.addColorStop(1, "rgb(0 0 0 / 1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = down;
  ctx.fillRect(0, 0, width, height);
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
  return chosen
    ? readRgb(styles, `--canvas-${slot + 1}`)
    : readRgb(styles, slot % 2 === 0 ? "--nebula-a" : "--nebula-b");
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
    let width = 0;
    let height = 0;
    let dpr = 1;

    /**
     * Rebuilds the offscreen tiles for the current size and theme.
     *
     * @returns nothing.
     */
    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = Math.max(1, Math.floor(window.innerWidth * dpr));
      height = Math.max(1, Math.floor(window.innerHeight * dpr));
      // Attributes, not CSS: this is the bitmap size. See the note above.
      canvas.width = width;
      canvas.height = height;

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
      const blend = styles.getPropertyValue("--nebula-blend").trim();
      // The chosen animation, read from the document root because that is where
      // an actor's theme puts it — the canvas is mounted in the root layout and
      // cannot be handed a prop by a page nested inside it. An unknown name
      // falls through to the nebula, which is what an unthemed page shows.
      const chosen = styles.getPropertyValue("--canvas").trim();

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

      // Rebuild when the theme's colours have moved. Checked here rather than
      // watched, because the values arrive as a `<style>` element React
      // replaces on every keystroke of a colour input — a mutation observer for
      // that is both noisier and later than simply comparing what we drew with.
      // The comparison is two string reads against a computed style this
      // function already holds.
      if (tintSignature(styles) !== bakedWith) build();

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
      if (chosen !== "nebula" && chosen !== "") {
        const tints = Array.from({ length: MAX_CANVAS_COLOURS }, (_, i) =>
          canvasColour(styles, i),
        );
        const seconds = elapsed / 1000;
        // A record rather than a chain of branches: a canvas added to `CANVASES`
        // without an entry here would fall through to the nebula silently, and
        // "the control did nothing" is the fault this feature keeps producing.
        const draws: Record<string, () => void> = {
          stars: () =>
            drawStars(ctx, width, height, dpr, tints, seconds, animated),
          aurora: () => drawAurora(ctx, width, height, tints, seconds),
          constellation: () =>
            drawConstellation(ctx, width, height, dpr, tints, seconds),
          waves: () => drawWaves(ctx, width, height, tints, seconds),
          bubbles: () => drawBubbles(ctx, width, height, dpr, tints, seconds),
          snow: () => drawSnow(ctx, width, height, tints, seconds),
          grid: () => drawGrid(ctx, width, height, dpr, tints, seconds),
          blobs: () => drawBlobs(ctx, width, height, tints, seconds),
          orbits: () => drawOrbits(ctx, width, height, dpr, tints, seconds),
          hexagons: () => drawHexagons(ctx, width, height, dpr, tints, seconds),
          ribbons: () => drawRibbons(ctx, width, height, tints, seconds),
          confetti: () => drawConfetti(ctx, width, height, tints, seconds),
          skyline: () => drawSkyline(ctx, width, height, tints, seconds),
          bokeh: () => drawBokeh(ctx, width, height, tints, seconds),
          mystify: () => drawMystify(ctx, width, height, dpr, tints, seconds),
          bounce: () => drawBounce(ctx, width, height, tints, seconds),
          rain: () => drawRain(ctx, width, height, dpr, tints, seconds),
          warp: () => drawWarp(ctx, width, height, dpr, tints, seconds),
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

      tiles.forEach((tile, i) => {
        const layer = LAYERS[i]!;
        // Both are device pixels, and both are multiplied by `dpr` for the same
        // reason: everything here is a size on screen, and a size in device
        // pixels is half as large on a retina display as on an ordinary one.
        // Leaving the `dpr` out is what made the clouds small and numerous on
        // exactly the machines the design was being judged on.
        const span = TILE * layer.scale * dpr;
        const offset =
          ((elapsed / 1000) * DRIFT_PX_PER_SECOND * layer.speed * dpr) % span;
        // Two extra tiles each way, so the drifting edge never enters view.
        for (let x = -span; x < width + span; x += span) {
          for (let y = -span; y < height + span; y += span) {
            ctx.drawImage(tile, x + offset, y + offset * 0.4, span, span);
          }
        }
      });
    };

    build();

    if (!animated) {
      // A single frame, so reduced motion keeps the design without the movement.
      draw(0);
    } else {
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
    }

    /**
     * Rebuilds and redraws after a resize.
     *
     * @returns nothing.
     */
    const onResize = () => {
      build();
      if (!animated) draw(0);
    };
    window.addEventListener("resize", onResize);

    /**
     * Rebuilds only when the colours actually moved.
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
     * Comparing first makes the common case two property reads and a string
     * compare. The animated path already did this inside `draw`; this is the
     * same guard for everything that arrives from outside.
     *
     * @returns nothing.
     */
    const onThemeChanged = () => {
      const styles = getComputedStyle(document.documentElement);
      if (tintSignature(styles) === bakedWith) return;
      build();
      if (!animated) draw(0);
    };

    // `data-theme` for the reader's own light/dark switch, and the subtree for
    // the `<style>` an actor's theme arrives in. A resize is a separate signal
    // and still rebuilds unconditionally, because the bitmap itself changed
    // size and no comparison of colours would show that.
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
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
