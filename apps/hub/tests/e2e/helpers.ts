import type { Page } from "@playwright/test";

/**
 * How much of the canvas each measurement samples, in device pixels.
 *
 * A window rather than the whole bitmap: enough pixels to be representative,
 * few enough that a sample is cheap to take repeatedly.
 */
const SAMPLE = 300;

/**
 * Waits until the nebula has genuinely finished setting up.
 *
 * Readiness rather than a delay. Three things have to be true before a
 * measurement means anything, and each is checked rather than waited out:
 *
 * - webfonts are loaded, because a late face shifts the layout, resizes the
 *   canvas and legitimately rebuilds the tiles — sampling through that reads
 *   as movement when nothing is moving;
 * - the bitmap is at viewport size rather than the 300x150 intrinsic default;
 * - at least one pixel has been painted, so the tiles exist.
 *
 * `waitForFunction` polls on animation frames and fails on the test's own
 * timeout — the most generous bound available — so a nebula that never appears
 * fails loudly instead of passing a sleep and then asserting against a blank
 * canvas.
 *
 * **The font wait is a separate `evaluate`, and that split is the whole point.**
 * `waitForFunction` does not await what its predicate returns; it tests the
 * returned value for truthiness, and an `async` predicate always returns a
 * Promise, which is always truthy. This helper used to await the font promise
 * inside the predicate, which made it `async` — so it resolved on its first
 * poll having checked nothing at all, and every caller was really sampling one
 * animation frame after `goto`. `evaluate` does await a returned Promise;
 * `waitForFunction` has to be handed a synchronous predicate. Do not fold these
 * two calls back together.
 *
 * That no-op is what went red the first time this suite ran on a runner. On
 * Windows the first frame lands in ~16ms and the sample was painted by luck; on
 * a cold two-core runner the bitmap was still 300x150 and untouched, and "the
 * nebula paints structure" measured 0% coverage — the blank-canvas failure the
 * assertion exists to catch, reported against a canvas the product had simply
 * not drawn yet. Verified by sabotage: pointed at a page with the nebula
 * switched off, where no canvas ever exists, the old helper returned in 11ms
 * and this one times out.
 *
 * @param page - the page under test.
 * @returns nothing; resolves once the nebula is ready to measure.
 */
export async function waitForNebulaReady(page: Page): Promise<void> {
  // `then` rather than returning it directly: `document.fonts.ready` resolves
  // with the FontFaceSet, which cannot be serialised back to the test.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForFunction((sample) => {
    const canvas = document.querySelector("canvas");
    if (!canvas || canvas.width < 400) return false;
    const data = canvas
      .getContext("2d")
      ?.getImageData(0, 0, sample, sample).data;
    if (!data) return false;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) return true;
    return false;
  }, SAMPLE);
}

/**
 * The total alpha painted in the sample window.
 *
 * One number standing in for the whole field: it changes whenever the clouds
 * move, and stays put when they do not.
 *
 * @param page - the page under test.
 * @returns the summed alpha, or -1 when there is no canvas.
 */
export function nebulaAlpha(page: Page): Promise<number> {
  return page.evaluate((sample) => {
    const data = document
      .querySelector("canvas")
      ?.getContext("2d")
      ?.getImageData(0, 0, sample, sample).data;
    if (!data) return -1;
    let total = 0;
    for (let i = 3; i < data.length; i += 4) total += data[i]!;
    return total;
  }, SAMPLE);
}

/**
 * Whether the field moves over a fixed number of animation frames.
 *
 * Counted in frames rather than milliseconds, so the answer does not depend on
 * how loaded the machine is: the question is whether the nebula moved when it
 * had the chance to, and a frame is exactly one chance.
 *
 * @param page - the page under test.
 * @param frames - how many animation frames to allow.
 * @returns true when the field changed within those frames.
 */
export function movesWithin(page: Page, frames: number): Promise<boolean> {
  return page.evaluate(
    async ([sample, frameCount]) => {
      const read = () => {
        const data = document
          .querySelector("canvas")
          ?.getContext("2d")
          ?.getImageData(0, 0, sample!, sample!).data;
        if (!data) return -1;
        let total = 0;
        for (let i = 3; i < data.length; i += 4) total += data[i]!;
        return total;
      };
      const before = read();
      for (let i = 0; i < frameCount!; i++) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(0)));
        if (read() !== before) return true;
      }
      return false;
    },
    [SAMPLE, frames] as const,
  );
}

/**
 * The average red and blue of the painted cloud pixels.
 *
 * Red against blue is what separates the two tints: light absorbs and reads
 * solar orange, dark emits and reads hydrogen pink.
 *
 * @param page - the page under test.
 * @returns the channel averages, or null when nothing is painted.
 */
export function nebulaTint(
  page: Page,
): Promise<{ r: number; b: number } | null> {
  return page.evaluate(() => {
    const data = document
      .querySelector("canvas")
      ?.getContext("2d")
      ?.getImageData(0, 0, 250, 250).data;
    if (!data) return null;
    let r = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Above the noise floor, so nearly-transparent pixels do not drag the
      // average towards whatever happens to be underneath.
      if (data[i + 3]! > 5) {
        r += data[i]!;
        b += data[i + 2]!;
        n++;
      }
    }
    return n ? { r: r / n, b: b / n } : null;
  });
}
