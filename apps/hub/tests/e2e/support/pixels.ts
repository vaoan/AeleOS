import type { Locator, Page } from "@playwright/test";
import { contrastRatioBetweenSrgb } from "../../../../../scripts/check-contrast.mjs";

/**
 * One point on a screenshot, and what to call it when an assertion fails.
 *
 * The name is carried alongside the coordinates rather than derived from an
 * index, so a failure says `panel-bottom` instead of `probe 4`.
 */
export type Probe = { name: string; x: number; y: number };

/**
 * The colours a page is actually painting at the given points.
 *
 * **This exists because a computed style cannot answer the question these
 * callers ask.** `clip-path`, `box-shadow` and `outline` all resolve correctly
 * on an element whose paint is being thrown away by an ancestor, so a suite
 * that reads `getComputedStyle` can be entirely green about something no
 * visitor can see. Reading the screenshot is the only answer that cannot be
 * satisfied by a declaration.
 *
 * The screenshot is decoded **inside the page**, through an `Image` and a
 * canvas, which is what keeps this free of an image-decoding dependency in the
 * repository. `data:` is already permitted by `img-src` — see
 * `shared/domain/csp.ts` — so the policy does not have to be relaxed for it.
 *
 * Coordinates are CSS pixels, matching `boundingBox()`; they index the
 * screenshot's device pixels, so a caller sampling at a device pixel ratio
 * other than one must say so. Out-of-bounds points come back as zeros rather
 * than throwing, which is why callers bound their probes against the viewport.
 *
 * @param page - the page to photograph, as it currently stands.
 * @param probes - the points to read.
 * @returns each probe's name against its red, green and blue values.
 */
export async function sampleColours(
  page: Page,
  probes: Probe[],
): Promise<Record<string, number[]>> {
  const png = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ data, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return Object.fromEntries(
        points.map(({ name, x, y }) => [
          name,
          [...context.getImageData(x, y, 1, 1).data].slice(0, 3),
        ]),
      ) as Record<string, number[]>;
    },
    { data: png, points: probes },
  );
}

/**
 * How far apart two sampled colours are, on whichever channel differs most.
 *
 * The worst channel rather than a mean, because a change that moves one
 * channel and leaves the others is still a change somebody can see, and
 * averaging it across three would dilute it toward the noise floor.
 *
 * @param one - the first colour.
 * @param two - the second.
 * @returns the largest per-channel difference.
 */
export function apart(one: number[], two: number[]): number {
  return Math.max(...one.map((value, index) => Math.abs(value - two[index]!)));
}

/**
 * The colour an element's own text is painted in, as sRGB channels 0–255.
 *
 * **Resolved by the browser rather than read from a token**, so a suite
 * asserting on legibility keeps measuring whatever `--ink` or `--muted`
 * currently is — including whatever a person's own palette derived — instead
 * of a literal copied out of `globals.css` that drifts the day the design
 * moves. `color` inherits, so asking any element in a box answers for every
 * label and input inside it that names no colour of its own.
 *
 * The conversion goes through a canvas because a computed `color` is a CSS
 * string, and in this app usually an `oklch()` one; `fillStyle` is the
 * browser's own parser and gamut mapping, which is the same one that painted
 * the pixels {@link sampleColours} reads. Doing the maths here instead would
 * be a second colour pipeline to disagree with the first.
 *
 * @param target - the element whose text colour is wanted.
 * @returns its red, green and blue values, each 0–255.
 */
export async function textColour(target: Locator): Promise<number[]> {
  return target.evaluate((node) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.fillStyle = getComputedStyle(node).color;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  });
}

/**
 * The WCAG contrast ratio between two sampled colours.
 *
 * The companion to {@link apart}, and the difference is what each can prove:
 * `apart` answers "did this change", which is enough for a focus ring or a
 * panel that either paints or does not, and says nothing about whether
 * anybody can read what is there. This answers that second question, and it
 * is the one a control sitting over a person's own background picture has to
 * pass.
 *
 * It delegates to `scripts/check-contrast.mjs`, the same formula
 * `pnpm check:contrast` measures the design's tokens with — one WCAG
 * implementation in the repository, fed measurements here and literals there.
 *
 * @param one - a sampled colour, channels 0–255.
 * @param two - the other, in the same form.
 * @returns the ratio, from 1 (identical) to 21 (black against white).
 */
export function contrast(one: number[], two: number[]): number {
  return contrastRatioBetweenSrgb(
    one.map((channel) => channel / 255),
    two.map((channel) => channel / 255),
  );
}
