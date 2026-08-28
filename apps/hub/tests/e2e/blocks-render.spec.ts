import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import {
  container,
  leaf,
  seedPage,
  SEEDED_IDENTITY_LEAVES,
  SEEDED_IDENTITY_SECTIONS,
  type SeedBlock,
} from "./support/blocks";
import { apart, sampleColours, type Probe } from "./support/pixels";
import { placesOf, tracksOf } from "./support/grid";
import { PLAYER_ORIGINS } from "../../src/shared/domain/player-origins";

// WHY THIS FILE EXISTS.
//
// Until it did, the block renderer had never rendered in a browser. `Block` was
// imported by nothing but its own unit suite, and every claim it makes about
// LAYOUT — a track count, a span, an overflow, a frame's aspect, a caption's
// box — was pinned either in jsdom, which runs no layout at all, or reasoned
// from the CSS specification. This project has already shipped two things that
// read correctly on paper and were wrong in a browser: a `minmax` floor that
// overflowed a real phone, and a stylesheet rule that beat every utility from
// outside the cascade for months.
//
// **The most important test here is not the overflow one.** It is `resolves the
// places it declares`, immediately below, and the reason is that without it the
// overflow assertions are unfalsifiable: a page whose four-place class never
// generated at all has one column everywhere and never overflows anything. A
// green check that cannot fail is the defect this branch has already produced
// eight times, and here it would hide the entire grid mechanism.
//
// **And the responsive rules are CONTAINER queries now, not viewport ones**, so
// a whole class of assertion this file could not make became possible: a wide
// window with a narrow space. See the last describe in the file, which is the
// case every 320px guard in this repository is structurally unable to reach.
//
// Every page here is seeded straight into the database as a real
// Clerk-authenticated caller — see `support/blocks.ts`. There is no editor that
// can write a block tree until phase 3, and proving the page without one is
// exactly what this phase is for.
//
// Locators are structural (test id, tag, position), never role or text: this
// suite runs in Spanish and a block's own title is data rather than a catalogue
// string.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

// **Not `serial`, deliberately.** These tests share one throwaway identity
// through `beforeAll` and the project runs one worker with `fullyParallel`
// off, so the order is already fixed — what `serial` would add is that the
// FIRST failure skips every test after it, which is the opposite of what a
// suite written to be sabotaged wants. Each of these pins a different
// mechanism, and breaking one on purpose has to show exactly which assertions
// notice.

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/** The space counts the model admits — `BLOCK_LIMITS.spaces` is 6. */
const SPACES = [1, 2, 3, 4, 5, 6] as const;

/** Tailwind's `gap-4`, in pixels: the gutter every mode lays. */
const GAP = 16;

/** The narrowest phone this project supports. */
const PHONE = { width: 320, height: 900 };

/** A laptop, where every declared place has room to resolve. */
const LAPTOP = { width: 1280, height: 900 };

/**
 * A wide desktop window, for the case a narrow space lives inside one.
 *
 * The page's own column is `max-w-7xl` with `sm:px-6`, so its content is
 * 1232px at any viewport at least this wide — which is what makes "the window
 * is wide and the space is not" a fixture rather than a hope.
 */
const DESKTOP = { width: 1400, height: 900 };

/**
 * Whether the document scrolls sideways, and whether anything is hiding that
 * it would.
 *
 * **The second half is what makes the first mean anything.** An
 * `overflow-x: hidden` silences the symptom while making the overflowing part
 * unreachable instead of visible, and it silences that for every future layout
 * too — the same pairing `responsive.spec.ts` insists on, restated here
 * because this suite builds pages that file never does.
 *
 * @param page - the page to measure.
 * @returns the rightward overflow in pixels, and any ancestor clipping it.
 */
async function overflow(
  page: Page,
): Promise<{ past: number; hiding: string[] }> {
  // Next's dev overlay is a fixed element of its own and is not part of the
  // app; it is absent from a production build and must not decide this.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  return (await page.evaluate(`(() => {
    const root = document.documentElement;
    const hiding = ["html", "body", "main"]
      .map((selector) => [selector, document.querySelector(selector)])
      .filter(([, element]) => element)
      .map(([selector, element]) => [selector, getComputedStyle(element).overflowX])
      .filter(([, overflowX]) => overflowX === "hidden" || overflowX === "clip")
      .map(([selector, overflowX]) => selector + ":" + overflowX);
    return { past: root.scrollWidth - root.clientWidth, hiding };
  })()`)) as { past: number; hiding: string[] };
}

/**
 * Asserts the page fits its viewport and is not clipping to manage it.
 *
 * @param page - the page to measure.
 * @param where - what to name in a failure.
 * @returns nothing.
 */
async function fits(page: Page, where: string): Promise<void> {
  const { past, hiding } = await overflow(page);
  // A pixel of slack, and no more: sub-pixel rounding is real and a scrollable
  // page is not.
  expect(past, `${where} scrolls sideways by ${past}px`).toBeLessThan(2);
  expect(
    hiding,
    `${where} hides horizontal overflow instead of fitting: ${hiding.join(", ")}`,
  ).toEqual([]);
}

test.describe("the grid a container declares", () => {
  // THE ASSERTION EVERY OTHER ONE IN THIS FILE RESTS ON.
  //
  // `SPACE_CLASS` maps a stored space count to a static
  // `@<size>:[grid-template-columns:var(--block-tracks,repeat(<n>,minmax(0,1fr)))]`
  // rather than to an inline `grid-template-columns`, for one reason: an inline
  // style cannot carry a query of any kind, so the collapse to a single column
  // in a box too narrow for the count would have nowhere to live. The `var()`
  // is where a container's own `weights` arrive, and the fallback is the
  // uniform list — so an unweighted page reaches the same tracks it always did
  // without a branch. That whole design is a bet on Tailwind having GENERATED
  // those classes out of a `Map` in the source — which its scanner sees only as
  // literal strings — and on the thresholds being where this file assumes they
  // are.
  //
  // Nothing before this checked either. A build in which none of those classes
  // existed would render every page as one column, look entirely plausible, and
  // pass every overflow assertion in this repository.
  test("resolves the places it declares when it has room, and one when it has not", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "spaces",
      displayName: "Spaces",
      blocks: SPACES.map((spaces) =>
        container({
          name_en: `Grid of ${spaces}`,
          mode: "grid",
          spaces,
          // As many leaves as the widest count, so no place can be left empty
          // for want of something to put in it — an item count below the space
          // count would make this measure the fixture rather than the layout.
          children: SPACES.map((n) => leaf({ title_en: `Leaf ${n}` })),
        }),
      ),
    });

    await page.setViewportSize(LAPTOP);
    const response = await page.goto(`/es/${address}/${handle}`);
    expect(response?.status()).toBe(200);

    const grids = page.getByTestId("block-grid");
    await expect(grids).toHaveCount(SPACES.length);

    for (const [index, spaces] of SPACES.entries()) {
      const resolved = await tracksOf(grids.nth(index));
      expect(
        resolved.length,
        `a container declaring ${spaces} places resolved ${resolved.length}`,
      ).toBe(spaces);
      // Equal shares, which is what `repeat(<n>, minmax(0, 1fr))` promises and
      // an `auto-fill` template does not. Without it a "4" that resolved into
      // four wildly unequal tracks would pass the count above.
      for (const width of resolved) {
        expect(Math.abs(width - resolved[0]!)).toBeLessThan(1);
      }
    }

    // And the collapse. Every one of them is a single column on a phone, where
    // the section's own box is 288px and no threshold in the vocabulary is met.
    await page.setViewportSize(PHONE);
    for (const index of SPACES.keys()) {
      expect(await tracksOf(grids.nth(index))).toHaveLength(1);
    }
  });

  // THE DECISION THE WHOLE MODEL RESTS ON, MEASURED IN A BROWSER.
  //
  // An empty place occupies its position and draws nothing: it keeps its
  // width, and the row does not close up. Collapsing would make a space count
  // meaningless the moment a section were partly filled — a three-place
  // section holding two things would read as two columns — and the shape its
  // author chose would change under them as they worked.
  //
  // The unit suite can only count DOM children; this is where "keeps its
  // width" becomes a number. Grid auto-placement is what does the work, and
  // an empty div is exactly the kind of element a renderer, a linter or a
  // future `.filter(Boolean)` deletes without anybody noticing, because
  // nothing about the page LOOKS different until a filled place moves into
  // its column.
  test("keeps an empty place at the width of a filled one, in its own column", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "empty",
      displayName: "Empty",
      blocks: [
        container({
          name_en: "A place left open",
          mode: "grid",
          spaces: 3,
          // First, EMPTY, third — and a fourth on the next row, so the row
          // beneath is measured too. A trailing empty follows it, which is the
          // one an over-eager tidy would trim first.
          children: [
            leaf({ title_en: "First" }),
            null,
            leaf({ title_en: "Third" }),
            leaf({ title_en: "Fourth" }),
            null,
          ],
        }),
      ],
    });

    await page.setViewportSize(LAPTOP);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    const grid = page.getByTestId("block-grid");
    const tracks = await tracksOf(grid);
    expect(tracks).toHaveLength(3);

    // Every place, as the engine laid it — see `placesOf` for why this is
    // read through `evaluate` rather than through `boundingBox`.
    const places = await placesOf(grid);

    // Five places for five entries, and none of them trimmed.
    expect(places).toHaveLength(5);

    // THE POSITION. "Third" is in the third column — which is what an empty
    // place keeping its width means, stated as a coordinate rather than as a
    // DOM index. If the empty place collapsed, "Third" would sit where the
    // empty one is now.
    expect(
      Math.abs(places[2]!.x - places[1]!.x - tracks[0]! - GAP),
    ).toBeLessThan(2);
    expect(places[2]!.text).toContain("Third");

    // THE WIDTH. The empty place is a track wide, exactly like its neighbours.
    for (const [index, place] of places.entries()) {
      expect(
        Math.abs(place.width - tracks[0]!),
        `place ${index + 1} measured ${place.width}px against a track of ${tracks[0]}px`,
      ).toBeLessThan(2);
    }

    // And it really is empty: room, not a broken box.
    expect(places[1]!.text).toBe("");
    expect(places[4]!.text).toBe("");
    await expect(page.getByTestId("public-space")).toHaveCount(2);

    // The second row starts under the first, so "Fourth" is back in column one
    // rather than continuing along a row that never ended.
    expect(Math.abs(places[3]!.x - places[0]!.x)).toBeLessThan(2);
  });
});

/**
 * A page holding every mode, at every space count, with an empty place in each.
 *
 * One page rather than one per combination: the overflow question is about the
 * DOCUMENT, so putting every shape on it at once asks the strongest version of
 * it — anything that pushes the page wide does so whatever else is there.
 *
 * **Every container carries an empty place**, including the modes that lay out
 * no places across at all. That is not a mistake in the fixture: an empty place
 * is an element with no content and no size of its own, and the question of
 * whether one can push a phone sideways has a different answer per mode. It is
 * also the shape that catches a mode dropping an empty place by accident, since
 * the section count and the disclosure count below are both exact.
 */
const EVERY_SHAPE: SeedBlock[] = [
  "stack",
  "grid",
  "masonry",
  "carousel",
  "tabs",
  "accordion",
  "timeline",
].flatMap((mode) =>
  SPACES.map((spaces) =>
    container({
      name_en: `${mode} of ${spaces}`,
      mode,
      spaces,
      children: [
        leaf({ title_en: "One" }),
        leaf({
          title_en: "Two",
          description_en:
            "A description long enough to wrap onto several lines on a phone, which is what a real page carries.",
        }),
        null,
        leaf({ title_en: "Four" }),
      ],
    }),
  ),
);

/**
 * The widest leaf the model admits: eight cells of real words.
 *
 * @param title - what to call it, so a failure names the mode it was in.
 * @returns the leaf.
 */
const wideTable = (title: string): SeedBlock =>
  leaf({
    kind: "table",
    title_en: title,
    rows: [
      Array.from({ length: 8 }, (_unused, column) => ({
        text_en: `Cell ${column + 1} with real words in it`,
      })),
    ],
  });

// **And that leaf goes on the same page twice, in the two arrangements where
// it can actually do damage.** A space count alone cannot overflow anything —
// every track a container lays is `minmax(0, 1fr)`, whose floor is zero — so a
// page built only of the shapes above has no fault for the assertion below to
// catch. That was measured rather than assumed: making a six-place grid survive
// the collapse to a phone reddens the tests that name the threshold and leaves
// the overflow one green.
//
// **The two guards `Block` carries do different work, and each needs its own
// mode here.** Measured at 320px across every mode, with one removed at a time:
//
//  * `grid-cols-[minmax(0,1fr)]` on the `<section>` covers `stack`, `masonry`
//    and `tabs`. Remove it and the `stack` entry below overflows by 416px.
//  * The LEAF's own guard covers `timeline`, and only `timeline` — it is the
//    one mode that lays `auto` grid tracks (`<ol class="grid gap-6">` and
//    `<li class="relative grid gap-1">`), which have no zero floor of their
//    own.
//
// **That second guard is TWO classes and neither can be sabotaged alone.** The
// leaf carries `min-w-0` and `@container`, and `container-type: inline-size`
// applies inline-size containment — so it zeroes the same min-content
// contribution `min-w-0` zeroes. Re-measured on this branch by deleting one at
// a time: either alone leaves every test in this file green, and removing BOTH
// reddens two of them — the 320px sweep by 367px of sideways scroll, and the
// narrow-space case at the bottom by a table box painting 271px outside its
// place. So a report that removed one and watched the suite stay green has
// measured the other, not the absence of a fault.
//
// **The timeline entry exists because that sabotage used to pass for a
// different reason.** The fixture was a `stack` alone, and nothing anywhere
// put a wide leaf in a timeline. `min-w-0` on the `<section>` is genuinely
// redundant, since a container always carries the explicit template.
//
// **And the reason a `grid` is exempt is not the one first written down here.**
// It is NOT that a flex column floors its items at `min-width: auto`: per
// Flexbox §4.5 an automatic minimum size applies only on the flex container's
// MAIN axis, so in a column that property computes to `0` and the items are not
// floored at all. What differs is one level up — `Grid` emits `grid-cols-1`,
// which zeroes the container's own min-content size, where `Stack`'s flex
// column propagates its items' min-content into its cross-axis min-content and
// hands that to whatever sizes it.
EVERY_SHAPE.push(
  container({
    name_en: "The widest leaf, stacked",
    mode: "stack",
    children: [wideTable("Eight columns in a stack")],
  }),
  container({
    name_en: "The widest leaf, in sequence",
    mode: "timeline",
    children: [wideTable("Eight columns in a timeline")],
  }),
);

// A container holding nothing, which the model admits: `children` defaults to
// `[]` on both the write and the read path, and the editor that would make one
// by accident does not exist yet. `Accordion` is the mode where it matters,
// because the wrapper carries the border and the surface — so an unguarded
// empty one is a bordered sliver with nothing in it, the `dl` with no rows in
// a new place. The unit suite pins the guard; this is the page it appears on.
// A container of nothing but EMPTY places goes the same way, and is on the
// page beside it, because a place that draws nothing is exactly the thing an
// unguarded wrapper would count as content.
EVERY_SHAPE.push(
  container({ name_en: "Nothing here yet", mode: "accordion", children: [] }),
  container({
    name_en: "Places left open",
    mode: "accordion",
    spaces: 2,
    children: [null, null],
  }),
);

test.describe("a page of blocks on the narrowest phone", () => {
  test("never scrolls sideways, in any mode, at any space count, with an empty place", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "shapes",
      displayName: "Every Shape",
      blocks: EVERY_SHAPE,
    });

    await page.setViewportSize(PHONE);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);
    await expect(page.getByTestId("public-section")).toHaveCount(
      EVERY_SHAPE.length + SEEDED_IDENTITY_SECTIONS,
    );

    // Two accordion sections on this page render their heading and nothing
    // else: the one with no children at all, and the one whose every place is
    // empty. So the count is one disclosure wrapper per accordion section that
    // holds something — a bordered sliver from either would show up here as an
    // extra.
    await expect(page.getByTestId("block-accordion")).toHaveCount(
      SPACES.length,
    );

    // And every mode that lays a BOX kept its empty place. One per container
    // in `EVERY_SHAPE` except the two label-lifting modes, which drop it, and
    // except the two accordions appended after it — one of which contributes
    // its two empty places to nothing at all.
    const boxed = ["stack", "grid", "masonry", "carousel", "timeline"].length;
    await expect(page.getByTestId("public-space")).toHaveCount(
      boxed * SPACES.length,
    );

    await fits(page, "every mode at 320px");

    // And at the width where the tracks actually exist, because a page that
    // fits only because nothing laid out is not the claim being made.
    await page.setViewportSize(LAPTOP);
    await fits(page, "every mode at 1280px");
  });

  // `break-inside: avoid` is what stops CSS multi-column splitting one child
  // across a column boundary and stranding its last lines at the top of the
  // next — the one failure this mode has that a grid cannot. A split element
  // has more than one client rect and exactly one bounding box, so
  // `getClientRects().length` is the only reading that can tell them apart,
  // and it is a browser fact with no jsdom equivalent whatever.
  test("keeps every masonry child in one column", async ({ page }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "masonry",
      displayName: "Masonry",
      blocks: [
        container({
          name_en: "Packed",
          mode: "masonry",
          spaces: 3,
          // Deliberately ragged: multi-column balances its columns, so equal
          // children give the engine no reason to break one and the assertion
          // nothing to fail against.
          children: [1, 7, 2, 9, 3, 11, 4].map((lines) =>
            leaf({
              title_en: `Card of ${lines}`,
              description_en: Array.from(
                { length: lines },
                (_unused, n) =>
                  `Line ${n + 1} of a description written to be long enough to wrap.`,
              ).join(" "),
            }),
          ),
        }),
      ],
    });

    await page.setViewportSize(LAPTOP);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    const packed = page.getByTestId("block-masonry");
    // Three columns really resolved, so the children have somewhere to be
    // split ACROSS. Without this the rect assertion below passes on a
    // single-column fallback where no break was ever possible.
    expect(
      await packed.evaluate((el) => getComputedStyle(el).columnCount),
    ).toBe("3");

    const rects = await packed.evaluate((el) =>
      [...el.children].map((child) => child.getClientRects().length),
    );
    expect(rects).toHaveLength(7);
    expect(rects.every((count) => count === 1)).toBe(true);
  });

  // The modes that were sized against the PAGE's own padding and now sit
  // inside a grid track. `carousel` scrolls its own row and `timeline` hangs a
  // marker outside its list at `-left-7.5`; in a full-width section either can
  // bleed into the page gutter unnoticed, and in a track it bleeds into the
  // gap and the neighbour. Depth 3, because that is the deepest the model
  // admits and where a negative offset has the least room.
  test("keeps a nested carousel and timeline inside their own tracks", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "nested",
      displayName: "Nested",
      blocks: [
        container({
          name_en: "Outer",
          mode: "grid",
          spaces: 2,
          children: [
            container({
              mode: "carousel",
              children: [
                leaf({ title_en: "Swipe one" }),
                leaf({ title_en: "Swipe two" }),
                leaf({ title_en: "Swipe three" }),
              ],
            }),
            container({
              mode: "timeline",
              children: [
                container({
                  mode: "grid",
                  spaces: 2,
                  children: [
                    leaf({ title_en: "Deep one" }),
                    leaf({ title_en: "Deep two" }),
                  ],
                }),
                leaf({ title_en: "Then this" }),
              ],
            }),
          ],
        }),
      ],
    });

    await page.setViewportSize(LAPTOP);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    const outer = page.getByTestId("block-grid").first();
    const tracks = await tracksOf(outer);
    expect(tracks).toHaveLength(2);
    const outerBox = (await outer.boundingBox())!;

    // **The bound is each nested mode's OWN track, not the whole grid**, and
    // that distinction is the test. Measured: moving `timeline`'s marker from
    // `-left-7.5` to `-left-24` — ninety-six pixels out, well into the
    // neighbour — leaves it comfortably inside the grid, because the timeline
    // sits in the SECOND track. An assertion against the grid's own edges
    // passes on that sabotage and proves nothing; these do not.
    const bounds = [
      { id: "block-carousel", left: outerBox.x, width: tracks[0]! },
      {
        id: "block-timeline",
        left: outerBox.x + tracks[0]! + GAP,
        width: tracks[1]!,
      },
    ];

    for (const { id, left, width } of bounds) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(
        box.x,
        `${id} starts left of its own track`,
      ).toBeGreaterThanOrEqual(left - 1);
      expect(
        box.x + box.width,
        `${id} ends right of its own track`,
      ).toBeLessThanOrEqual(left + width + 1);
    }

    // `timeline`'s marker is the specific thing at risk: it is absolutely
    // positioned at `-left-7.5`, thirty pixels outside its own list item, and
    // the list's `pl-6 ml-1.5` is what it was sized against — the two only
    // cancel out if both survived nesting. Bounded against the timeline's own
    // track for the reason above.
    const marker = page.getByTestId("block-timeline").locator("li > span");
    const markerBox = (await marker.first().boundingBox())!;
    expect(
      markerBox.x,
      "the timeline marker hangs outside its own track",
    ).toBeGreaterThanOrEqual(bounds[1]!.left - 1);

    await fits(page, "a depth-3 tree at 1280px");
    await page.setViewportSize(PHONE);
    await fits(page, "a depth-3 tree at 320px");
  });
});

test.describe("what a leaf puts inside a track", () => {
  // `FRAME_SHAPE`'s four classes and `picture`'s `w-full` were all written for
  // a full-width section. In one place of a four-place section the containing
  // block is a quarter of that, and `max-w-80`/`max-w-105` are absolute — so
  // the question "does the frame stay inside its place" has a different answer
  // per shape, and only a browser has it.
  // **A DENSITY THAT ONLY REACHES INSIDE A CARD IS HALF A DENSITY**, and the
  // gap between two sections is a number no unit test can read. Measured on
  // real pages before this: a `compact` page and a default page differed in
  // card padding and in type size and agreed EXACTLY on the 40px between every
  // section, because the page box carried `mt-10` and `pt-6 sm:pt-10` — fixed
  // classes no option could touch. The type was already tighter than the sites
  // being imitated while the page still read as airy.
  //
  // **The same tree twice, so the only difference is the theme.** Two pages
  // with different content could differ in gap for a dozen reasons; this pair
  // can differ for exactly one. The default page is what pins the absent case
  // to the values the fixed classes had, which is the claim that "no stored
  // page moved" actually rests on.
  test("a page's spacing reaches BETWEEN its sections, not only inside them", async ({
    page,
  }) => {
    const blocks = [
      container({
        name_en: "First",
        mode: "stack",
        children: [leaf({ kind: "text", title_en: "One" })],
      }),
      container({
        name_en: "Second",
        mode: "stack",
        children: [leaf({ kind: "text", title_en: "Two" })],
      }),
    ];

    const tight = await seedPage({
      userId: identity!.userId,
      handlePrefix: "tight",
      displayName: "Tight",
      blocks,
      theme: { spacing: "compact" },
    });
    const plain = await seedPage({
      userId: identity!.userId,
      handlePrefix: "plain",
      displayName: "Plain",
      blocks,
    });

    /**
     * The vertical distance between the first two sections of a page.
     *
     * @param address - the owner's address.
     * @param handle - the fursona's handle.
     * @returns the gap in CSS pixels, rounded.
     */
    const gapOf = async (address: string, handle: string): Promise<number> => {
      expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);
      const boxes = page.locator("[data-page-gutter]");
      await expect(boxes.first()).toBeVisible();
      const first = (await boxes.nth(0).boundingBox())!;
      const second = (await boxes.nth(1).boundingBox())!;
      return Math.round(second.y - (first.y + first.height));
    };

    await page.setViewportSize(LAPTOP);

    // The default is exactly what `mt-10` was, which is what makes "absence
    // changes nothing" a measurement rather than a promise.
    expect(await gapOf(plain.address, plain.handle)).toBe(40);

    // And `compact` is `0.5rem`, near-flush on purpose: the arrangements this
    // exists for stacked their boxes with a hairline between them, and a gap
    // that merely halves still reads as modern.
    expect(await gapOf(tight.address, tight.handle)).toBe(8);
  });

  // **A CLASS THAT COMPILES TO NOTHING LOOKS EXACTLY LIKE ONE THAT WORKS.**
  // `image_fit` was first written as `object-(--img-fit)`, which reads like
  // every other token utility in this codebase — `bg-(--menu)`, `text-(--muted)`
  // — and emits NO CSS AT ALL: Tailwind's `(--var)` shorthand resolves against
  // a utility's own namespace, and `object-`'s is `object-position`, not
  // `object-fit`. Compiled through Tailwind directly, the candidate produced an
  // empty rule set.
  //
  // Every unit test stayed green, and structurally had to: they render the
  // component and assert CLASS STRINGS, and the class string was always
  // exactly what was intended. This is root rule 30 with the subject one step
  // in — a claim about what a class MEANS, checked by a suite that can only
  // see what it is CALLED. The only thing that can tell the two apart is a
  // browser reading the computed property, which is what this does.
  test("fits a picture the way its block asked, as a computed property", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "fit",
      displayName: "Fit",
      blocks: [
        container({
          name_en: "Fit",
          mode: "grid",
          spaces: 2,
          children: [
            leaf({
              kind: "picture",
              title_en: "Whole",
              image_url: "https://example.com/wide.png",
              style: { image_fit: "contain" },
            }),
            // **The control, and it is what makes the case discriminate.**
            // Without it, a stylesheet where BOTH resolved to `contain` — or
            // where the token leaked onto every block — would pass. Absence
            // must still be the crop every stored page has.
            leaf({
              kind: "picture",
              title_en: "Cropped",
              image_url: "https://example.com/tall.png",
            }),
          ],
        }),
      ],
    });

    await page.setViewportSize(LAPTOP);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    const fits = await page
      .getByTestId("block-grid")
      .first()
      .evaluate((el) =>
        [...el.querySelectorAll("img")].map(
          (img) => getComputedStyle(img).objectFit,
        ),
      );
    expect(fits).toEqual(["contain", "cover"]);
  });

  test("keeps every frame and picture inside the track it was placed in", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "media",
      displayName: "Media",
      blocks: [
        container({
          name_en: "Media",
          mode: "grid",
          spaces: 4,
          children: [
            // video: aspect-video w-full
            leaf({
              kind: "embed",
              title_en: "A video",
              link_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            }),
            // audio: h-42 w-full
            leaf({
              kind: "embed",
              title_en: "A song",
              link_url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
            }),
            // post: h-150 w-full max-w-105
            leaf({
              kind: "embed",
              title_en: "A post",
              link_url: "https://t.me/telegram/83",
            }),
            // The pasted picture, in a place of its own like everything else.
            leaf({
              kind: "picture",
              title_en: "A drawing",
              image_url: "https://example.com/drawing.png",
            }),
          ],
        }),
      ],
    });

    await page.setViewportSize(LAPTOP);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    const grid = page.getByTestId("block-grid");
    expect(await tracksOf(grid)).toHaveLength(4);

    // Each block's own wrapper holds the track; whatever the kind rendered
    // inside it must not be wider. This is the assertion `FRAME_SHAPE` never
    // had — its classes were chosen against a full-width section.
    //
    // **Two of the four are bounded from BOTH sides, and that is the half this
    // originally over-credited.** `video` and `picture` are `w-full`, so "no
    // wider than its wrapper" is true of them by construction and cannot fail
    // whatever happens — the upper bound alone settles nothing about the two
    // shapes debt item 7 actually names. Asserting they FILL the track is the
    // claim with a fault behind it: delete `w-full` from either and an
    // `<img>` falls back to its intrinsic width and an `<iframe>` to 300px.
    // The other two carry a `max-w-*` and are genuinely allowed to be
    // narrower, so they get the upper bound only.
    const leaves = page.getByTestId("public-leaf");
    await expect(leaves).toHaveCount(4 + SEEDED_IDENTITY_LEAVES);

    /**
     * A leaf's own track, and whatever the kind painted inside it.
     *
     * @param index - which leaf.
     * @returns the wrapper's box and the frame's or picture's, in page
     * coordinates.
     */
    const painted = async (index: number) => {
      const wrapper = (await leaves.nth(index).boundingBox())!;
      const inner = await leaves.nth(index).evaluate((el) => {
        const framed = el.querySelector("iframe, img");
        // **A frame's box, not the frame.** Since embeds began fitting the
        // height their provider actually paints, the `<iframe>` sits inside a
        // box that carries the border and the sizing, and the frame fills that
        // box's CONTENT — two pixels narrower than the track by exactly the
        // border. What is placed in the track is the box; what fills the box
        // is the frame. A picture has no such wrapper and is measured as it
        // always was.
        const sized =
          framed instanceof HTMLIFrameElement ? framed.parentElement : framed;
        const box = sized?.getBoundingClientRect();
        return box ? { x: box.x, width: box.width } : null;
      });
      expect(
        inner,
        `block ${index} rendered no frame or picture`,
      ).not.toBeNull();
      return { wrapper, inner: inner! };
    };

    for (const index of [0, 1, 2, 3]) {
      const { wrapper, inner } = await painted(index);
      expect(
        inner.x + inner.width,
        `block ${index} paints past its own track`,
      ).toBeLessThanOrEqual(wrapper.x + wrapper.width + 1);
    }

    // The lower bound, on the two shapes it is a claim about. Separated rather
    // than made conditional inside the loop above, because an `expect` behind
    // an `if` reads as "this may not be checked" and is the thing the lint rule
    // is right about.
    for (const index of [0, 3]) {
      const { wrapper, inner } = await painted(index);
      expect(
        inner.width,
        `block ${index} does not fill the track it was given`,
      ).toBeGreaterThanOrEqual(wrapper.width - 1);
    }

    // And the aspect a video frame asks for actually resolved, which is the
    // half a width check alone cannot see: `aspect-video` in a narrow track is
    // where a frame either scales or keeps a height nothing asked for.
    const video = page.locator("iframe").first();
    const shape = (await video.boundingBox())!;
    expect(Math.abs(shape.width / shape.height - 16 / 9)).toBeLessThan(0.05);

    await fits(page, "a grid of frames at 1280px");
    await page.setViewportSize(PHONE);
    await fits(page, "a grid of frames at 320px");
  });

  // `table` wraps itself in `overflow-x-auto` and the claim was a class name.
  // Eight columns of real words do not fit a 320px viewport, so the two halves
  // have to be measured together: the TABLE's own box scrolls and the PAGE's
  // does not. Either one alone passes on the wrong implementation.
  //
  // **THIS IS A REGRESSION TEST, and it was red on the first run.** At 320px
  // `document.scrollWidth` read 656 against a `clientWidth` of 320, and the
  // scroll box round the table had itself resolved to 638px — so it had
  // nothing left to scroll and the `overflow-x-auto` did nothing whatever. The
  // table was not overflowing the page: a chain of grid and flex items with
  // `min-width: auto` had grown the PAGE to fit the table, which looks
  // identical to a reader and has the opposite cause. `min-w-0` and an
  // explicit `minmax(0, 1fr)` track on the elements `Block` renders is the
  // fix; see its TSDoc. Taking either away makes this file red again, at this
  // assertion first.
  test("scrolls a wide table inside its own box rather than scrolling the page", async ({
    page,
  }) => {
    // `BLOCK_LIMITS.cells` is 8 — the widest row the model admits, which is
    // the case the `overflow-x-auto` exists for.
    const cells = (row: number) =>
      Array.from({ length: 8 }, (_unused, column) => ({
        text_en: `Row ${row + 1} cell ${column + 1} with real words in it`,
      }));

    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "table",
      displayName: "Table",
      blocks: [
        container({
          name_en: "Measurements",
          children: [
            leaf({
              kind: "table",
              title_en: "Every measurement",
              description_en: "Written down so nobody has to ask.",
              rows: [cells(0), cells(1), cells(2)],
            }),
          ],
        }),
      ],
    });

    await page.setViewportSize(PHONE);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    const table = page.getByTestId("block-table");
    const box = await table.evaluate((el) => {
      const scroller = el.parentElement!;
      return {
        content: scroller.scrollWidth,
        visible: scroller.clientWidth,
        overflowX: getComputedStyle(scroller).overflowX,
      };
    });

    // The table really is wider than the phone — without this, the page-level
    // assertion below would pass on a table that simply fitted, proving
    // nothing about the scroll box at all.
    expect(box.content).toBeGreaterThan(box.visible);
    // And the box doing the scrolling is no wider than the phone, which is the
    // half that names the original fault directly: it measured 638px on a
    // 320px screen, so there was nothing for it to scroll.
    expect(box.visible).toBeLessThanOrEqual(PHONE.width);
    expect(box.overflowX).toBe("auto");
    await fits(page, "a page holding a table of eight columns at 320px");
  });

  // The `<caption>` layout, which was deliberately NOT settled in code: a
  // caption is `display: table-caption` in every UA sheet, and `display: grid`
  // on it would take the element out of the table's own caption box. jsdom
  // cannot answer where that leaves it, so `TableLeaf` puts a `<div>` INSIDE
  // the caption instead and left the question open. This is the answer: the
  // caption sits above the first row and spans the table's own width.
  test("lays a table's caption above its rows and across its width", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "caption",
      displayName: "Caption",
      blocks: [
        container({
          name_en: "Captioned",
          children: [
            leaf({
              kind: "table",
              title_en: "Every measurement",
              description_en: "Written down so nobody has to ask.",
              rows: [
                [{ text_en: "Height" }, { text_en: "180cm" }],
                [{ text_en: "Tail" }, { text_en: "60cm" }],
              ],
            }),
          ],
        }),
      ],
    });

    await page.setViewportSize(LAPTOP);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    const table = page.getByTestId("block-table");
    const boxes = await table.evaluate((el) => {
      const caption = el.querySelector("caption")!.getBoundingClientRect();
      const firstRow = el.querySelector("tbody tr")!.getBoundingClientRect();
      const whole = el.getBoundingClientRect();
      return {
        caption: { y: caption.y, bottom: caption.bottom, width: caption.width },
        row: { y: firstRow.y },
        table: { width: whole.width },
      };
    });

    // Above the rows, entirely — not merely starting higher.
    expect(boxes.caption.bottom).toBeLessThanOrEqual(boxes.row.y + 1);
    // And as wide as the table, which is what a caption box is and what a
    // `display: grid` on the element itself would have cost.
    expect(Math.abs(boxes.caption.width - boxes.table.width)).toBeLessThan(2);
  });

  // `<th scope="row">` was an attribute nothing had watched a platform read.
  // What makes the pair announced together is the accessibility tree mapping
  // that `th` to `rowheader` rather than to `columnheader` or a plain cell,
  // and Chromium's own tree is the closest thing to a screen reader that CI
  // can ask. It is not an announcement; it is the mapping every announcement
  // is built from, which is as far as a browser can be driven here.
  test("maps a table's row header to rowheader in the accessibility tree", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "rowhead",
      displayName: "Ax Table",
      blocks: [
        container({
          name_en: "Measurements",
          children: [
            leaf({
              kind: "table",
              title_en: "Every measurement",
              rows: [
                [{ text_en: "Height" }, { text_en: "180cm" }],
                [{ text_en: "Tail" }, { text_en: "60cm" }],
              ],
            }),
          ],
        }),
      ],
    });

    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);
    await expect(page.getByTestId("block-table")).toBeVisible();

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Accessibility.enable");
    const { root } = await cdp.send("DOM.getDocument");
    const { nodes } = await cdp.send("Accessibility.queryAXTree", {
      nodeId: root.nodeId,
      role: "rowheader",
    });

    const names = nodes
      .map((node) => node.name?.value)
      .filter((name): name is string => typeof name === "string");
    expect(names).toEqual(["Height", "Tail"]);
  });
});

test.describe("the focus ring a surface draws inside itself", () => {
  // `@utility surface` sets `outline-offset: -3px` unconditionally, because a
  // ring at the default offset is painted OUTSIDE the border box and
  // `clip-path` clips an element's whole paint — so under `cutout` an outward
  // ring simply does not exist and a keyboard visitor loses the indicator
  // (WCAG 2.4.7). That has never been measured on a PUBLIC page: the only
  // existing proof is on the editor's own card.
  //
  // It reads pixels rather than a computed style on purpose. `outline` resolves
  // correctly on an element whose paint is being thrown away by an ancestor, so
  // a suite reading `getComputedStyle` can be entirely green about something no
  // visitor can see. That is the whole argument `support/pixels.ts` exists for.
  test("paints inside a link and a social chip, even under a clipping skin", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "focus",
      displayName: "Focus",
      blocks: [
        container({
          name_en: "Elsewhere",
          // The clipping skin, which is the case an outward ring fails.
          style: { skin: "cutout" },
          children: [
            leaf({
              kind: "link",
              title_en: "A link",
              link_url: "https://example.com/somewhere",
            }),
            leaf({
              kind: "social",
              title_en: "A chip",
              link_url: "https://bsky.app/profile/someone.bsky.social",
            }),
          ],
        }),
      ],
    });

    // The nebula is a live canvas behind every page, so two screenshots would
    // otherwise catch it on different frames. Reduced motion is the app's own
    // way of holding it still.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(LAPTOP);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    expect(await page.evaluate(() => devicePixelRatio)).toBe(1);

    for (const id of ["block-link", "block-social"]) {
      const chip = page.getByTestId(id);
      const box = (await chip.boundingBox())!;

      // Four pixels in from the top-left corner and the same distance down
      // the left edge: an inset ring at -3px with a 2px stroke covers both,
      // and `cutout`'s chamfer takes the corner while leaving the edge — so
      // the pair reads as "the ring exists" under either.
      const probes: Probe[] = [
        {
          name: `${id}-corner`,
          x: Math.round(box.x) + 4,
          y: Math.round(box.y) + 4,
        },
        {
          name: `${id}-edge`,
          x: Math.round(box.x) + 4,
          y: Math.round(box.y + box.height / 2),
        },
      ];

      const before = await sampleColours(page, probes);

      // **Tabbed to, not focused programmatically.** `:focus-visible` follows
      // the interaction modality, so a `.focus()` call can leave a browser
      // deciding not to paint a ring at all — which would make this fail for a
      // reason that has nothing to do with the offset. Walking there with the
      // keyboard is also what a visitor who needs the ring actually does, so
      // it proves the chip is reachable at the same time.
      const reached = await tabTo(page, chip);
      expect(reached, `${id} was not reachable by keyboard`).toBe(true);

      const after = await sampleColours(page, probes);
      const moved = probes.map((probe) =>
        apart(before[probe.name]!, after[probe.name]!),
      );
      expect(
        Math.max(...moved),
        `${id} painted no visible focus ring: ${probes
          .map((probe, index) => `${probe.name} ${moved[index]}`)
          .join(", ")}`,
      ).toBeGreaterThan(20);
    }
  });
});

/**
 * Walks the keyboard focus onto an element.
 *
 * Bounded rather than looping until it lands: a target that is not reachable at
 * all must fail as a false answer rather than as a timeout, because a timeout
 * says nothing about which of the two went wrong.
 *
 * @param page - the page to press Tab on.
 * @param target - the element to reach.
 * @returns whether focus arrived within the bound.
 */
async function tabTo(page: Page, target: Locator): Promise<boolean> {
  const handle = await target.elementHandle();
  for (let press = 0; press < 40; press += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(
      (element) => document.activeElement === element,
      handle,
    );
    if (focused) return true;
  }
  return false;
}

test.describe("the policy the route serves", () => {
  // The header is declared in `next.config.ts` against `/:path*`, which is a
  // pattern rather than a list — so "it is served on the route that renders
  // blocks" is a claim about Next's own matching, not about our source. It has
  // never been read off a response, on this route or any other.
  //
  // And `frame-src` is derived from `EMBED_PROVIDERS` rather than listed
  // separately, which makes the agreement structural in the SOURCE. What that
  // does not prove is that the value reaching a browser carries every origin a
  // `player` or `post` leaf can actually resolve to — that is a build-time and
  // deploy-time question, and this is where it gets asked.
  test("carries a frame-src covering every provider a leaf can reach", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "csp",
      displayName: "Policy",
      blocks: [
        container({
          name_en: "Framed",
          children: [
            leaf({
              kind: "embed",
              title_en: "A video",
              link_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            }),
          ],
        }),
      ],
    });

    const response = await page.goto(`/es/${address}/${handle}`);
    expect(response?.status()).toBe(200);

    const policy =
      (await response!.headerValue("content-security-policy")) ?? "";
    expect(policy, "no policy on the route that renders blocks").not.toBe("");

    const frameSrc = policy
      .split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("frame-src "));
    expect(frameSrc, "the policy names no frame-src").toBeTruthy();

    // Every origin, not "some" — the derivation exists so that a provider
    // added to the table is allowed in the same edit, and a build that dropped
    // one would frame nothing from it with no error anybody would see.
    const missing = PLAYER_ORIGINS.filter(
      (origin) => !frameSrc!.includes(origin),
    );
    expect(missing, `frame-src is missing ${missing.join(", ")}`).toEqual([]);

    // The anti-vacuity control. `PLAYER_ORIGINS` being empty would make the
    // filter above pass forever; this is the same non-vacuity guard
    // `embeds.test.ts` puts under its own completeness check.
    expect(PLAYER_ORIGINS.length).toBeGreaterThan(10);

    // The frame really is on the page, so this is the policy a real embed is
    // served under rather than one measured on an empty route.
    await expect(page.locator("iframe")).toHaveCount(1);
  });
});

// A WIDE WINDOW WITH A NARROW SPACE.
//
// **This is the case every 320px guard in this repository is structurally
// unable to reach**, and saying why is the whole point of the file. Those
// guards resize the WINDOW — and the window is not what is narrow here. A leaf
// in one place of a three-place section is about a third of the page wide at
// any viewport at all, and every viewport-prefixed rule inside it believes it
// has the whole screen. The deeper the tree, the worse the lie.
//
// So this seeds a page whose narrow spaces sit inside a 1400px window and asks
// three things a `sm:`-prefixed renderer answers wrongly:
//
//  1. A container INSIDE a narrow space collapses to one column, because its
//     own box is 400px and no threshold in the vocabulary is met. Under
//     `sm:grid-cols-4` it lays four tracks of about 88px instead, at a window
//     eight hundred pixels wider than that breakpoint.
//  2. A carousel card is no wider than the space it scrolls in. Under
//     `sm:w-96` it is a fixed 384px inside a place of about 192px, so no card
//     can ever be seen whole — which is a real defect that produces no page
//     overflow at all, because the carousel scrolls its own row. It is
//     invisible to `fits` and to every existing assertion here.
//  3. Nothing painted inside a narrow space paints past it — the eight-cell
//     table, the embedded frame and the pasted picture the brief names,
//     measured against the box they were actually given rather than against
//     the document. That one is a standing claim rather than a falsifiable
//     one under a restored breakpoint: what breaks it is removing a
//     containment guard, not restoring a viewport rule.
//
// The `timeline` in the first narrow space is deliberate and is what makes (3)
// have a fault behind it. It is the one mode that lays `auto` grid tracks,
// which have no zero floor of their own, so a wide descendant there grows the
// track and sticks out of the place it was put in — visibly, and into the
// document's own scrollWidth.
test.describe("a narrow space inside a wide window", () => {
  /** The eight-cell table, the frame and the picture, in one narrow place. */
  const CROWDED: SeedBlock[] = [
    container({
      name_en: "A third of the page",
      mode: "grid",
      spaces: 3,
      children: [
        container({
          mode: "timeline",
          children: [
            wideTable("Eight columns in a third of the page"),
            leaf({
              kind: "embed",
              title_en: "A video",
              link_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            }),
            leaf({
              kind: "picture",
              title_en: "A drawing",
              image_url: "https://example.com/drawing.png",
            }),
          ],
        }),
        // A container that declares four places INSIDE one place of three.
        // This is the assertion a viewport breakpoint fails.
        container({
          mode: "grid",
          spaces: 4,
          children: [
            leaf({ title_en: "Deep one" }),
            leaf({ title_en: "Deep two" }),
            leaf({ title_en: "Deep three" }),
            leaf({ title_en: "Deep four" }),
          ],
        }),
        leaf({ title_en: "Beside it" }),
      ],
    }),
    // Six places, so one of them is about 192px — narrow enough that a card of
    // a fixed 384px cannot hide inside it. At three places it would fit, and
    // the assertion would pass on the very sabotage it exists to catch.
    container({
      name_en: "A sixth of the page",
      mode: "grid",
      spaces: 6,
      children: [
        container({
          mode: "carousel",
          children: [
            leaf({ title_en: "Swipe one" }),
            leaf({ title_en: "Swipe two" }),
            leaf({ title_en: "Swipe three" }),
          ],
        }),
        leaf({ title_en: "Two" }),
        leaf({ title_en: "Three" }),
        leaf({ title_en: "Four" }),
        leaf({ title_en: "Five" }),
        leaf({ title_en: "Six" }),
      ],
    }),
  ];

  test("collapses and contains what is inside a narrow space, at 1400px", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "narrow",
      displayName: "Narrow",
      blocks: CROWDED,
    });

    await page.setViewportSize(DESKTOP);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    const sections = page.getByTestId("public-section");
    await expect(sections).toHaveCount(
      CROWDED.length + SEEDED_IDENTITY_SECTIONS,
    );

    // THE ANTI-VACUITY CONTROL, and this file's own lesson applied to itself:
    // the window really is wide and the space really is not. Without it every
    // assertion below passes on a page that simply never laid its places, and
    // "no overflow in a narrow space" would be a claim about nothing.
    const outer = sections.nth(0).getByTestId("block-grid").first();
    const across = await tracksOf(outer);
    expect(across, "the outer section did not lay three places").toHaveLength(
      3,
    );
    const page_ = await outer.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(across[0]!).toBeLessThan(page_ / 2);
    expect(page_).toBeGreaterThan(1000);

    // Each place of the outer section, as the engine laid it.
    const places = await outer.evaluate((el) =>
      [...el.children].map((child) => {
        const box = child.getBoundingClientRect();
        return { left: box.x, right: box.right };
      }),
    );

    // (1) THE COLLAPSE. The nested container declares four places and has a
    // 400px box, so it lays one. `sm:grid-cols-4` would lay four.
    const nested = sections.nth(0).getByTestId("block-grid").nth(1);
    expect(
      await tracksOf(nested),
      "a container inside a narrow space laid more than one place",
    ).toHaveLength(1);

    // (3) CONTAINMENT. Every frame, picture and scroll box in the first narrow
    // place stays inside that place — measured against the PLACE, never
    // against the document, which is the distinction the 320px guards cannot
    // make.
    //
    // **A TABLE IS MEASURED BY ITS SCROLL BOX, NEVER BY THE TABLE.** The
    // `<table>` is DESIGNED to be wider than the box around it — that is the
    // whole of what `overflow-x-auto` buys — so its own rect extends past the
    // place by exactly however much there is left to scroll, and asserting on
    // it would fail a correct render for doing its job. What must stay inside
    // the place is the BOX, and the fault that catches is the one this
    // repository already met at 320px: the box growing to fit the table, so
    // there was nothing left to scroll and the class was decoration.
    const painted = await page.evaluate(`(() => {
      const grid = document.querySelectorAll('[data-testid="block-grid"]')[0];
      const place = grid.children[0];
      const inside = place.querySelectorAll('iframe, img, [data-testid="block-table"]');
      return [...inside].map((element) => {
        const measured = element.tagName === "TABLE" ? element.parentElement : element;
        const box = measured.getBoundingClientRect();
        return {
          what: element.tagName.toLowerCase() + (element.getAttribute("data-testid") ?? ""),
          right: box.right,
          width: box.width,
          scrolls: measured.scrollWidth > measured.clientWidth,
        };
      });
    })()`);
    const bounded = painted as {
      what: string;
      right: number;
      width: number;
      scrolls: boolean;
    }[];
    // A frame, a picture and a table: nothing rendered as a fallback instead.
    expect(bounded.length).toBeGreaterThanOrEqual(3);
    for (const item of bounded) {
      expect(
        item.right,
        `${item.what} paints ${item.right - places[0]!.right}px past its own place`,
      ).toBeLessThanOrEqual(places[0]!.right + 1);
    }
    // ANTI-VACUITY, and the reason the line above is worth having: the box is
    // only proof of containment if what it holds is too wide to fit. A table
    // that happened to fit its narrow place would satisfy the assertion while
    // pinning nothing at all.
    expect(
      bounded.find((one) => one.what.includes("block-table"))?.scrolls,
      "the eight-cell table fitted its narrow place, so containment proved nothing",
    ).toBe(true);

    // (2) THE FIXED CARD. A carousel card is no wider than the place it
    // scrolls in — the fault that produces no page overflow whatever, because
    // the row scrolls itself.
    const swipe = sections.nth(1);
    const sixth = await swipe
      .getByTestId("block-grid")
      .first()
      .evaluate((el) => el.children[0]!.getBoundingClientRect().width);
    const card = await swipe
      .getByTestId("block-carousel")
      .evaluate((el) => el.children[0]!.getBoundingClientRect().width);
    expect(
      card,
      `a carousel card measured ${card}px inside a place of ${sixth}px`,
    ).toBeLessThanOrEqual(sixth + 1);

    // And the document itself, which is the claim the existing guards make at
    // a width where it is easy. Here it is made where a wide leaf has a narrow
    // box and the window has room to hide the difference.
    await fits(page, "a narrow space at 1400px");
  });
});
