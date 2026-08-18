import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage, type SeedBlock } from "./support/blocks";
import { apart, sampleColours, type Probe } from "./support/pixels";
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
// tracks it declares`, immediately below, and the reason is that without it the
// overflow assertions are unfalsifiable: a page whose `sm:grid-cols-4` never
// generated at all has one column everywhere and never overflows anything. A
// green check that cannot fail is the defect this branch has already produced
// eight times, and here it would hide the entire grid mechanism.
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

/** The track counts the model admits — `BLOCK_LIMITS.tracks` is 4. */
const TRACKS = [1, 2, 3, 4] as const;

/** Tailwind's `gap-4`, in pixels: the gutter every mode lays. */
const GAP = 16;

/** The narrowest phone this project supports. */
const PHONE = { width: 320, height: 900 };

/** A laptop, where every declared track has room to resolve. */
const LAPTOP = { width: 1280, height: 900 };

/**
 * How many tracks a real layout engine resolved a grid into.
 *
 * The computed value of `grid-template-columns` is a space-separated list of
 * RESOLVED track sizes rather than the authored template, so its length is the
 * column count the engine actually chose at this element's current width. This
 * is the measurement jsdom cannot take: it runs no layout, so it has no
 * computed style to read at all.
 *
 * @param grid - the grid container.
 * @returns each track's resolved width, in pixels.
 */
const tracksOf = (grid: Locator): Promise<number[]> =>
  grid.evaluate((el) =>
    getComputedStyle(el)
      .gridTemplateColumns.split(" ")
      .filter(Boolean)
      .map((track) => Number.parseFloat(track)),
  );

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
  // `TRACK_CLASS` maps a stored track count to a static `sm:grid-cols-<n>`
  // rather than to an inline `grid-template-columns`, for one reason: an inline
  // style cannot carry a media query, and a span that survived the collapse to
  // one column would create implicit tracks and push the row past the viewport.
  // That whole design is a bet on Tailwind having GENERATED those four classes
  // out of a `Map` in the source — which its scanner sees only as literal
  // strings — and on the breakpoint being where this file assumes it is.
  //
  // Nothing before this checked either. A build in which no `sm:grid-cols-*`
  // existed would render every page as one column, look entirely plausible, and
  // pass every overflow assertion in this repository.
  test("resolves the tracks it declares above sm, and exactly one below", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "tracks",
      displayName: "Tracks",
      blocks: TRACKS.map((columns) =>
        container({
          name_en: `Grid of ${columns}`,
          mode: "grid",
          columns,
          // Four leaves per grid, so no track can be left empty for want of
          // something to put in it — an item count below the track count would
          // make this measure the fixture rather than the layout.
          children: TRACKS.map((n) => leaf({ title_en: `Leaf ${n}` })),
        }),
      ),
    });

    await page.setViewportSize(LAPTOP);
    const response = await page.goto(`/es/${address}/${handle}`);
    expect(response?.status()).toBe(200);

    const grids = page.getByTestId("block-grid");
    await expect(grids).toHaveCount(TRACKS.length);

    for (const [index, columns] of TRACKS.entries()) {
      const resolved = await tracksOf(grids.nth(index));
      expect(
        resolved.length,
        `a container declaring ${columns} tracks resolved ${resolved.length}`,
      ).toBe(columns);
      // Equal shares, which is what `repeat(<n>, minmax(0, 1fr))` promises and
      // an `auto-fill` template does not. Without it a "4" that resolved into
      // four wildly unequal tracks would pass the count above.
      for (const width of resolved) {
        expect(Math.abs(width - resolved[0]!)).toBeLessThan(1);
      }
    }

    // And the collapse. Every one of the four is a single track on a phone,
    // which is the half that makes a span safe to declare at all.
    await page.setViewportSize(PHONE);
    for (const index of TRACKS.keys()) {
      expect(await tracksOf(grids.nth(index))).toHaveLength(1);
    }
  });

  // A span is a class rather than an inline property for the same reason the
  // track count is, so the same bet is being made twice — and `sm:col-span-*`
  // is generated from a second `Map` the scanner reads as strings. This is the
  // measurement that says the share is real: a block declaring two tracks of
  // four is two tracks and a gutter wide, not "wider than its neighbour".
  test("gives a spanning block exactly the share of the tracks it asked for", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "spans",
      displayName: "Spans",
      blocks: [
        container({
          name_en: "Spans",
          mode: "grid",
          columns: 4,
          children: [
            leaf({ title_en: "One" }),
            leaf({ title_en: "Two", span: 2 }),
            leaf({ title_en: "Three", span: 3 }),
            leaf({ title_en: "Four", span: 4 }),
          ],
        }),
      ],
    });

    await page.setViewportSize(LAPTOP);
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    const grid = page.getByTestId("block-grid");
    const track = (await tracksOf(grid))[0]!;
    const leaves = page.getByTestId("public-leaf");
    await expect(leaves).toHaveCount(4);

    for (const [index, span] of [1, 2, 3, 4].entries()) {
      const box = (await leaves.nth(index).boundingBox())!;
      const expected = span * track + (span - 1) * GAP;
      expect(
        Math.abs(box.width - expected),
        `a span of ${span} measured ${box.width}px against ${expected}px`,
      ).toBeLessThan(2);
    }

    // Below the breakpoint every one of them is one track wide, which is the
    // clamp that stops a stored span creating implicit columns on a phone.
    await page.setViewportSize(PHONE);
    const narrow = await tracksOf(grid);
    expect(narrow).toHaveLength(1);
    for (const index of [0, 1, 2, 3]) {
      const box = (await leaves.nth(index).boundingBox())!;
      expect(Math.abs(box.width - narrow[0]!)).toBeLessThan(2);
    }
  });
});

/**
 * A page holding every mode, at every track count, with children that span.
 *
 * One page rather than one per combination: the overflow question is about the
 * DOCUMENT, so putting every shape on it at once asks the strongest version of
 * it — anything that pushes the page wide does so whatever else is there.
 *
 * Spans of two, three and four are on every mode, including the ones that lay
 * out no tracks at all. That is not a mistake in the fixture: a mode which lays
 * none passes `1` to its children, so a stored span of four must render as one
 * track there, and a mode that forgot to would create implicit columns. The
 * fixture is the shape that catches it.
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
  TRACKS.map((columns) =>
    container({
      name_en: `${mode} of ${columns}`,
      mode,
      columns,
      children: [
        leaf({ title_en: "One", span: 2 }),
        leaf({
          title_en: "Two",
          span: 3,
          description_en:
            "A description long enough to wrap onto several lines on a phone, which is what a real page carries.",
        }),
        leaf({ title_en: "Three", span: 4 }),
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
// it can actually do damage.** A track count alone cannot overflow anything —
// every track a container lays is `minmax(0, 1fr)`, whose floor is zero — so a
// page built only of the shapes above has no fault for the assertion below to
// catch. That was measured rather than assumed: stripping the `sm:` prefix off
// every track and span class, so a four-track grid survives the collapse to a
// phone, reddens the two tests that name the breakpoint and leaves the overflow
// one green.
//
// **The two guards `Block` carries do different work, and each needs its own
// mode here.** Measured at 320px across every mode, with one removed at a time:
//
//  * `grid-cols-[minmax(0,1fr)]` on the `<section>` covers `stack`, `masonry`
//    and `tabs`. Remove it and the `stack` entry below overflows by 416px.
//  * `min-w-0` on the LEAF covers `timeline`, and only `timeline` — it is the
//    one mode that lays `auto` grid tracks (`<ol class="grid gap-6">` and
//    `<li class="relative grid gap-1">`), which have no zero floor of their
//    own. Remove it and the `timeline` entry below overflows by 447px.
//
// **The timeline entry exists because that second sabotage used to pass.** The
// fixture was a `stack` alone, and the report claimed removing `min-w-0`
// reddened this test; it did not — the whole suite stayed green, because
// nothing anywhere put a wide leaf in a timeline. `min-w-0` on the `<section>`
// is genuinely redundant, since a container always carries the explicit
// template; the leaf's is not.
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
EVERY_SHAPE.push(
  container({ name_en: "Nothing here yet", mode: "accordion", children: [] }),
);

test.describe("a page of blocks on the narrowest phone", () => {
  test("never scrolls sideways, in any mode, at any track count, with any span", async ({
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
      EVERY_SHAPE.length,
    );

    // The empty `accordion` section is on this page and renders its heading
    // and nothing else — four disclosure wrappers, one per accordion section
    // that has children, and none for the one that has none. A bordered sliver
    // would show up here as a fifth.
    await expect(page.getByTestId("block-accordion")).toHaveCount(
      TRACKS.length,
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
          columns: 3,
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
          columns: 2,
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
                  columns: 2,
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
  // a full-width section. In a `sm:col-span-*` track the containing block is a
  // fraction of that, and `max-w-80`/`max-w-105` are absolute — so the question
  // "does the frame stay inside its track" has a different answer per shape and
  // per span, and only a browser has it.
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
          columns: 4,
          children: [
            // video: aspect-video w-full
            leaf({
              kind: "player",
              title_en: "A video",
              link_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            }),
            // audio: h-42 w-full
            leaf({
              kind: "player",
              title_en: "A song",
              span: 2,
              link_url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
            }),
            // post: h-150 w-full max-w-105
            leaf({
              kind: "post",
              title_en: "A post",
              link_url: "https://t.me/telegram/83",
            }),
            // The pasted picture, at a span wider than one.
            leaf({
              kind: "picture",
              title_en: "A drawing",
              span: 3,
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
    await expect(leaves).toHaveCount(4);

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
        const box = framed?.getBoundingClientRect();
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
              kind: "player",
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
