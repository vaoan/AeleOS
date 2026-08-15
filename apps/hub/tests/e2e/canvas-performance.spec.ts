import { expect, test, type Page } from "@playwright/test";
import { CANVAS_SLOTS } from "@/shared/domain/canvas-slots";

// WHAT THIS GUARDS, AND WHY IT IS NOT A BENCHMARK.
//
// Every canvas here was once affordable, and then some of them quietly were
// not. The honeycomb reached 2192ms a frame — half a frame per SECOND — and
// bokeh 1077ms, and the aurora 636ms, and nothing failed: the page still
// rendered, the suite still passed, and the only symptom was that a browser
// stopped answering while somebody had the size dial up. All three were found
// by measuring on purpose, long after they shipped. That is the gap this file
// closes.
//
// **It is a smoke alarm, not a stopwatch.** A shared CI runner is slower than a
// laptop by an amount nobody can predict and which changes between runs, so an
// assertion tuned to the real numbers would fail for reasons that have nothing
// to do with this repository. The ceiling below is set far above what any
// canvas costs and far below what a broken one costs — it catches an order of
// magnitude, which is the size of every regression this has actually had.
//
// Do NOT tighten it toward the measured values to make it "stricter". A
// performance test that cries wolf gets skipped, and a skipped test guards
// nothing. To learn the real numbers, measure them deliberately.
//
// **The list of canvases comes from `CANVAS_SLOTS`**, not from a list written
// here, so a canvas added to the app is covered without anybody remembering to
// add it. That is the whole point: the expensive ones arrived in one batch and
// were reviewed by eye.

/**
 * The most one frame may cost, in milliseconds.
 *
 * Measured at a device ratio of two, the slowest canvas at the top of both
 * dials costs about 50ms. This is five times that, which leaves room for a
 * runner several times slower than a laptop while still failing every
 * regression this code has actually had — the cheapest of which was 302ms.
 *
 * Verified by sabotage rather than by argument: restoring the honeycomb's
 * original cell sizing took it to 421ms here and this test failed, naming it.
 */
const FRAME_CEILING_MS = 250;

/** How many frames to time. Enough for a median, few enough to stay quick. */
const SAMPLE_FRAMES = 15;

/**
 * How many frames to discard after a change before timing.
 *
 * The first frames after the dials move carry the bitmap resize and any tile
 * rebuild, which is setup rather than the steady cost being asserted.
 */
const SETTLE_FRAMES = 4;

/** The top of `CANVAS_RANGE`, where count and area multiply. */
const WORST = 5;

/** Every canvas the app offers, minus the one that deliberately draws nothing. */
const CANVASES = Object.keys(CANVAS_SLOTS).filter((name) => name !== "none");

/** What a measurement of one canvas comes back with. */
interface FrameCost {
  /** The median cost of one `draw`, in milliseconds. */
  median: number;
  /** How many frames were timed. */
  samples: number;
  /** How many of the canvas's pixels are not fully transparent. */
  painted: number;
}

/** The shape this test installs on `window` to watch the render loop. */
interface Probe {
  /** How long each frame's draw took, most recent last. */
  costs: number[];
}

declare global {
  var __canvasProbe: Probe | undefined;
}

/**
 * Wraps the render loop so each frame's draw is timed.
 *
 * **Times the component's own callback, not the gap between frames.**
 * `requestAnimationFrame` is capped at the display's refresh, so frame deltas
 * quantise: a canvas costing 4ms and one costing 15ms both look like sixty
 * frames a second, and one costing 400ms looks the same as one costing 2000ms.
 * The canvas re-registers its callback every frame, so the next registration
 * picks this wrapper up.
 *
 * **The one-pixel read is not optional, and leaving it out made this test
 * useless the first time it ran.** A 2D canvas RECORDS its drawing commands and
 * rasterises them later, so timing the callback alone measures the recording —
 * every canvas came back between 0.1ms and 2.3ms, including ones that had been
 * costing hundreds. Reading a pixel forces the display list to raster inside
 * the frame being timed, which is where the cost actually lives: of the
 * honeycomb's 2192ms, 0.2ms was building paths and the rest was stroking them.
 *
 * @param page - the page to instrument.
 * @returns nothing.
 */
async function watchFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    globalThis.__canvasProbe = { costs: [] };
    const native = globalThis.requestAnimationFrame.bind(globalThis);
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
      native((time: number) => {
        const started = performance.now();
        callback(time);
        document
          .querySelector("canvas")
          ?.getContext("2d")
          ?.getImageData(0, 0, 1, 1);
        globalThis.__canvasProbe?.costs.push(performance.now() - started);
      });
  });
}

/**
 * Waits for the render loop to draw a number of frames.
 *
 * A condition rather than a sleep: how long a frame takes is the very thing
 * under test, so a fixed wait would be too short exactly when a canvas is slow
 * — which is when this test matters.
 *
 * @param page - the instrumented page.
 * @param count - how many frames to wait for, from now.
 * @returns nothing.
 */
async function waitForFrames(page: Page, count: number): Promise<void> {
  await page.evaluate((wanted) => {
    const probe = globalThis.__canvasProbe;
    if (probe) probe.costs.length = 0;
    return wanted;
  }, count);
  await page.waitForFunction(
    (wanted) => (globalThis.__canvasProbe?.costs.length ?? 0) >= wanted,
    count,
    { timeout: 60_000 },
  );
}

test.describe("every canvas holds its frame", () => {
  test.describe.configure({ mode: "serial" });

  // **A retina laptop, because that is where this hurts.** The bitmap is the
  // viewport times the device ratio, so a ratio of two is four times the pixels
  // and these canvases are almost all fill-rate bound. Measuring at the default
  // ratio of one reports a quarter of what a real reader pays, which is the
  // wrong number to set an alarm against.
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  test("no canvas costs an order of magnitude more than it should", async ({
    page,
  }) => {
    // Longer than the default: this walks every canvas in the app twice.
    test.setTimeout(240_000);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/es", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("canvas");
    await watchFrames(page);
    // The loop is running once it has produced frames — which also waits out
    // the dev server's first compile without guessing how long that takes.
    await waitForFrames(page, 10);

    /** Measures one canvas at the given setting of both dials. */
    const measure = async (
      canvas: string,
      dials: number,
    ): Promise<FrameCost> => {
      await page.evaluate(
        ([name, dial]) => {
          const root = document.documentElement;
          root.style.setProperty("--canvas", String(name));
          root.style.setProperty("--canvas-density", String(dial));
          root.style.setProperty("--canvas-speed", "1");
          root.style.setProperty("--canvas-scale", String(dial));
        },
        [canvas, dials] as const,
      );
      await waitForFrames(page, SETTLE_FRAMES + SAMPLE_FRAMES);

      return page.evaluate((settle) => {
        const timed = (globalThis.__canvasProbe?.costs ?? [])
          .slice(settle)
          .sort((a, b) => a - b);

        const element = document.querySelector("canvas");
        const context = element?.getContext("2d");
        let painted = 0;
        if (element && context) {
          // **The WHOLE canvas, not a crop of the middle.** Sampling the centre
          // was the first attempt and it reported the nebula and the orbits as
          // blank — wrongly. At five times size an orbit's rings are wider than
          // the viewport so nothing crosses the middle, and the nebula's masses
          // are far enough apart that the centre can legitimately be void.
          const pixels = context.getImageData(
            0,
            0,
            element.width,
            element.height,
          ).data;
          for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] !== 0) painted += 1;
          }
        }

        return {
          median: timed.length ? timed[Math.floor(timed.length / 2)]! : -1,
          samples: timed.length,
          painted,
        };
      }, SETTLE_FRAMES);
    };

    const slow: string[] = [];
    const blank: string[] = [];
    const report: string[] = [];

    for (const canvas of CANVASES) {
      const worst = await measure(canvas, WORST);
      report.push(`${canvas}: ${worst.median.toFixed(1)}ms`);
      expect(
        worst.samples,
        `${canvas} produced no timed frames — it may not be animating at all`,
      ).toBeGreaterThan(0);
      if (worst.median > FRAME_CEILING_MS) {
        slow.push(`${canvas} ${worst.median.toFixed(0)}ms`);
      }

      // **A canvas that draws nothing is the failure this module was built
      // against**, and it is invisible: the page renders, the gradient behind
      // shows through, and it reads as a design choice rather than a fault.
      // Costing nothing is not the same as being fast.
      //
      // Checked at the DEFAULT dials, the setting every canvas is designed for
      // and the only one where "this should be visible" is a claim worth
      // making. The extremes are allowed to be strange.
      const ordinary = await measure(canvas, 1);
      if (ordinary.painted === 0) blank.push(canvas);
    }

    console.log(`frame cost at busy=${WORST}, size=${WORST}:`);
    console.log(report.join("\n"));

    expect(blank, "these canvases painted no pixel at all").toEqual([]);
    expect(
      slow,
      `these canvases cost more than ${FRAME_CEILING_MS}ms a frame`,
    ).toEqual([]);
  });

  test("the canvas named none draws nothing, and reverses", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/es", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("canvas");
    await watchFrames(page);
    await waitForFrames(page, 10);

    /** How many pixels the canvas has painted, once the change has landed. */
    const painted = async (canvas: string) => {
      await page.evaluate((name) => {
        document.documentElement.style.setProperty("--canvas", name);
      }, canvas);
      await waitForFrames(page, SETTLE_FRAMES);
      return page.evaluate(() => {
        const element = document.querySelector("canvas");
        const context = element?.getContext("2d");
        if (!element || !context) return -1;
        const pixels = context.getImageData(
          0,
          0,
          element.width,
          element.height,
        ).data;
        let count = 0;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] !== 0) count += 1;
        }
        return count;
      });
    };

    expect(await painted("stars")).toBeGreaterThan(0);
    expect(await painted("none")).toBe(0);
    // **Reversible, with no state to reset.** `none` used to be expressed as an
    // opacity of zero, which the renderer rejects as unset — so a page asking
    // for no canvas drew the ordinary one. Reading the name fixed that; this
    // keeps it fixed in both directions.
    expect(await painted("stars")).toBeGreaterThan(0);
  });
});
