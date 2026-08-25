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

/** What {@link compareShots} found between two photographs of the same thing. */
export interface ShotComparison {
  /** The first image's size, in device pixels. */
  one: { width: number; height: number };
  /** The second image's size, in the same units. */
  two: { width: number; height: number };
  /** How many compared pixels differed by more than the tolerance. */
  differing: number;
  /** Those pixels as a fraction of the overlapping area, 0 to 1. */
  ratio: number;
  /** The largest single-channel difference seen anywhere. */
  worstChannel: number;
  /**
   * Where the worst pixel was and what each image painted there.
   *
   * Null when nothing differed. Reported so a failure names a coordinate to
   * look at rather than only a percentage.
   */
  worstAt: { x: number; y: number; one: number[]; two: number[] } | null;
  /**
   * The whole-pixel placement that made the two agree best.
   *
   * `{ x: 0, y: 0 }` means the images line up as taken. Reported rather than
   * hidden, because a caller that keeps finding a shift is being told something
   * about where its subject sits, not only about how it looks.
   */
  offset: { x: number; y: number };
}

/**
 * How two photographs of the same subject differ, decoded inside the page.
 *
 * **This exists because a class assertion cannot answer "do these look the
 * same".** The preview and the public route share one renderer, so every class
 * string matches by construction; what differs is the box each is laid in and
 * what paints behind it, and only pixels can report that.
 *
 * Decoding happens in the browser through `Image` and a canvas, the same idiom
 * {@link sampleColours} uses and for the same reason: it keeps an image-decoding
 * dependency out of the repository, and `data:` is already permitted by
 * `img-src`.
 *
 * Images of different sizes are compared over their overlap and the sizes are
 * returned, rather than throwing — a size difference is itself a fidelity
 * finding and the caller should assert it as one.
 *
 * **The two are allowed to sit one whole pixel apart, and that is measured
 * rather than generous.** Where a subject lands is decided by everything above
 * it: a section whose predecessor is 503.5 device pixels tall starts on a half
 * pixel, so the same content photographs from one row higher in a document that
 * happens to begin on a whole one. Caught that way, two byte-identical
 * renderings reported two percent of their pixels differing, with a
 * 232-channel spike wherever a glyph edge met a bright card — a number
 * indistinguishable from a real fault. The best of the nine whole-pixel
 * placements is taken and the winner is reported.
 *
 * What that cannot absorb is anything this is meant to catch: a shift moves the
 * whole image, so content that has moved RELATIVE to the rest of its own
 * section still differs, as does a wrong colour, a missing element, a different
 * size, or a displacement of more than a pixel.
 *
 * @param page - any open page; used only as a decoder, so its own content is
 *   irrelevant.
 * @param one - the first PNG.
 * @param two - the second PNG.
 * @param tolerance - per-channel difference treated as equal, absorbing
 *   antialiasing noise. Defaults to 2.
 * @returns the sizes, how much differed, the worst pixel, and the placement
 *   that agreed best.
 */
export async function compareShots(
  page: Page,
  one: Buffer,
  two: Buffer,
  tolerance = 2,
): Promise<ShotComparison> {
  return page.evaluate(
    async ({ a, b, slack }) => {
      const decode = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d")!.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          pixels: canvas
            .getContext("2d")!
            .getImageData(0, 0, image.width, image.height).data,
        };
      };

      const first = await decode(a);
      const second = await decode(b);
      const width = Math.min(first.width, second.width);
      const height = Math.min(first.height, second.height);

      const at = (shiftX: number, shiftY: number) => {
        let differing = 0;
        let compared = 0;
        let worstChannel = 0;
        let worstAt: {
          x: number;
          y: number;
          one: number[];
          two: number[];
        } | null = null;

        for (let y = Math.max(0, -shiftY); y < height; y += 1) {
          const other = y + shiftY;
          if (other >= second.height) break;
          for (let x = Math.max(0, -shiftX); x < width; x += 1) {
            const alongside = x + shiftX;
            if (alongside >= second.width) break;
            const oneAt = (y * first.width + x) * 4;
            const twoAt = (other * second.width + alongside) * 4;
            let worst = 0;
            for (let channel = 0; channel < 3; channel += 1) {
              worst = Math.max(
                worst,
                Math.abs(
                  first.pixels[oneAt + channel]! -
                    second.pixels[twoAt + channel]!,
                ),
              );
            }
            compared += 1;
            if (worst > slack) differing += 1;
            if (worst > worstChannel) {
              worstChannel = worst;
              worstAt = {
                x,
                y,
                one: [...first.pixels.slice(oneAt, oneAt + 3)],
                two: [...second.pixels.slice(twoAt, twoAt + 3)],
              };
            }
          }
        }

        return {
          differing,
          ratio: compared ? differing / compared : 1,
          worstChannel,
          worstAt,
          offset: { x: shiftX, y: shiftY },
        };
      };

      let best = at(0, 0);
      for (const shiftY of [-1, 0, 1]) {
        for (const shiftX of [-1, 0, 1]) {
          if (shiftX === 0 && shiftY === 0) continue;
          const found = at(shiftX, shiftY);
          if (found.differing < best.differing) best = found;
        }
      }

      return {
        one: { width: first.width, height: first.height },
        two: { width: second.width, height: second.height },
        ...best,
      };
    },
    {
      a: one.toString("base64"),
      b: two.toString("base64"),
      slack: tolerance,
    },
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
