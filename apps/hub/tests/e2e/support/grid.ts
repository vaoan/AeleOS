import type { Locator } from "@playwright/test";

// WHAT A REAL LAYOUT ENGINE ANSWERED, WHICH IS THE ONLY PLACE IT CAN BE ASKED.
//
// jsdom runs no layout, so a unit suite can count a grid's DOM children and
// nothing else. Both measurements here are the ones that turn "an empty place
// keeps its width" from a claim about markup into a claim about pixels, and
// they are shared because two suites make it: `blocks-render.spec.ts` on a page
// seeded straight into the database, and `nested-page-build.spec.ts` on one
// somebody built through the editor.

/**
 * How many tracks a real layout engine resolved a grid into, and how wide.
 *
 * The computed value of `grid-template-columns` is a space-separated list of
 * RESOLVED track sizes rather than the authored template, so its length is the
 * column count the engine actually chose at this element's current width.
 *
 * @param grid - the grid container.
 * @returns each track's resolved width, in pixels.
 */
export const tracksOf = (grid: Locator): Promise<number[]> =>
  grid.evaluate((el) =>
    getComputedStyle(el)
      .gridTemplateColumns.split(" ")
      .filter(Boolean)
      .map((track) => Number.parseFloat(track)),
  );

/** One of a grid's places, as the engine laid it. */
export interface PlaceBox {
  /** Its left edge, in page coordinates — which column it landed in. */
  x: number;
  /** Its width, which is what an empty place must keep. */
  width: number;
  /** Everything written inside it, so "empty" can be asserted as empty. */
  text: string;
}

/**
 * Every place of a grid, in the order the author put them.
 *
 * Read through `evaluate` rather than through `boundingBox`, which answers
 * null for an element Playwright considers invisible — and an empty place with
 * nothing in it is exactly that when no sibling stretches it.
 *
 * @param grid - the grid container.
 * @returns one box per place, including the ones drawing nothing.
 */
export const placesOf = (grid: Locator): Promise<PlaceBox[]> =>
  grid.evaluate((el) =>
    [...el.children].map((child) => {
      const box = child.getBoundingClientRect();
      return { x: box.x, width: box.width, text: child.textContent ?? "" };
    }),
  );
