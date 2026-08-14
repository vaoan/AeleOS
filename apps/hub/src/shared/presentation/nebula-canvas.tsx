"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { CELL_SIZE, tilePixels } from "@/shared/application/nebula-noise";
import { MAX_CANVAS_COLOURS } from "@/shared/domain/canvas-slots";
import {
  aurora,
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

      if (chosen === "stars" || chosen === "aurora") {
        const tints = Array.from({ length: MAX_CANVAS_COLOURS }, (_, i) =>
          canvasColour(styles, i),
        );
        if (chosen === "stars") {
          drawStars(ctx, width, height, dpr, tints, elapsed / 1000, animated);
        } else {
          drawAurora(ctx, width, height, tints, elapsed / 1000);
        }
        return;
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

    // The tint and blend mode are theme-dependent, so a theme change has to
    // rebuild the tiles rather than merely redraw them.
    // `data-theme` for the reader's own light/dark switch, and the subtree for
    // the `<style>` an actor's theme arrives in — which React inserts and
    // replaces as somebody edits. The animated path notices a colour change on
    // its own, by comparison; this is what covers the still one, where nothing
    // redraws unless something says so.
    const observer = new MutationObserver(onResize);
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
