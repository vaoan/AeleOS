"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { CELL_SIZE, tilePixels } from "@/lib/nebula-noise";
import { NEBULA_STORAGE_KEY, resolveNebula } from "@/lib/nebula-preference";

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
 * How far the tiles are scaled when drawn.
 *
 * Lower means finer structure. At 4 the noise was magnified until it read as a
 * smooth haze; the grain that makes it look like dust rather than fog only
 * survives at a smaller multiple.
 */
const TILE_SCALE = 2.5;

/** Seconds for the slower layer to travel one full tile. */
const DRIFT_SECONDS = 90;

/** Device pixel ratio is capped here: beyond 2 costs memory for no visible gain. */
const MAX_DPR = 2;

/**
 * The cloud layers, drifting at different speeds so the field has depth.
 *
 * Three rather than two, and thicker than the first pass: a storm nebula is
 * dust with structure in it, not a wash. The third layer runs at a different
 * speed again, which is what stops the repeat of any one tile from becoming
 * legible as a pattern.
 *
 * `bias` is the threshold below which noise is transparent, so lowering it
 * widens the clouds; `gain` sharpens the edge between dust and void.
 */
const LAYERS = [
  { seed: 11, gain: 2.6, bias: 0.44, speed: 1, tint: "a" },
  { seed: 71, gain: 2.2, bias: 0.48, speed: -0.55, tint: "b" },
  { seed: 137, gain: 3.1, bias: 0.53, speed: 0.28, tint: "a" },
] as const;

/**
 * Fallback layer opacity if the theme does not set one.
 *
 * The themes set their own; this is only what happens if a token goes missing.
 *
 * The field is deliberately dense — a storm nebula rather than a haze — but it
 * is still a background. Composited text was measured at 17.5:1 in dark and
 * 14.7:1 in light against a 4.5:1 requirement, so the density is paid for out
 * of headroom rather than legibility.
 *
 * **The avatar rule is now the tight one.** The brightest thing on any screen
 * has to be the person's own fursona, and this field is far brighter than the
 * first pass. Whoever adds avatars should check them against it, not against
 * the plain gradient.
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
 * 2. The noise is computed **once per size**, not per frame. Animation is two
 *    `drawImage` calls; recomputing would cost a full tile of fBm every frame.
 * 3. The blend mode inverts with the theme — `screen` in dark because dust
 *    emits light, `multiply` in light because it absorbs it. Same texture,
 *    opposite physics.
 *
 * Renders one static frame when animation is off rather than nothing, so
 * reduced motion keeps the design and loses only the movement.
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
    let width = 0;
    let height = 0;

    /**
     * Rebuilds the offscreen tiles for the current size and theme.
     *
     * @returns nothing.
     */
    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = Math.max(1, Math.floor(window.innerWidth * dpr));
      height = Math.max(1, Math.floor(window.innerHeight * dpr));
      // Attributes, not CSS: this is the bitmap size. See the note above.
      canvas.width = width;
      canvas.height = height;

      const styles = getComputedStyle(document.documentElement);
      tiles = LAYERS.map((layer) => {
        const pixels = tilePixels(TILE, TILE, {
          seed: layer.seed,
          gain: layer.gain,
          bias: layer.bias,
          rgb: readRgb(styles, `--nebula-${layer.tint}`),
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
     * Draws both layers at the given time offset.
     *
     * @param elapsed - milliseconds since the animation started.
     * @returns nothing.
     */
    const draw = (elapsed: number) => {
      const styles = getComputedStyle(document.documentElement);
      const blend = styles.getPropertyValue("--nebula-blend").trim();
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation =
        blend === "screen" || blend === "multiply"
          ? (blend as GlobalCompositeOperation)
          : "screen";
      const opacity = Number.parseFloat(
        styles.getPropertyValue("--nebula-opacity"),
      );
      ctx.globalAlpha =
        Number.isFinite(opacity) && opacity > 0 && opacity <= 1
          ? opacity
          : DEFAULT_OPACITY;

      const span = TILE * TILE_SCALE;
      tiles.forEach((tile, i) => {
        const layer = LAYERS[i]!;
        const offset =
          ((elapsed / (DRIFT_SECONDS * 1000)) * layer.speed * span) % span;
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
    const observer = new MutationObserver(onResize);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
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
