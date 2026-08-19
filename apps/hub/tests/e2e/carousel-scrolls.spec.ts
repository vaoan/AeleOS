import { expect, test } from "@playwright/test";

import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";

// WHY THIS FILE EXISTS.
//
// **Nothing asserted that a carousel scrolls.** Everything that looked like it
// did was measuring something else:
//
//   * `blocks.test.tsx` asserts the CLASS NAMES `overflow-x-auto` and `snap-x`.
//     jsdom runs no layout at all, so that is a claim about markup and cannot
//     be a claim about behaviour.
//   * `blocks-render.spec.ts` asserts a carousel CARD is no wider than the
//     place it sits in. That is containment — the guard against a card too wide
//     to be seen whole — and it holds identically whether the row scrolls or
//     not.
//
// So a change that left both classes in place and broke the mechanism — a
// `flex-wrap` sneaking in, `shrink-0` lost so the cards squeeze to fit, the row
// laid as a grid — would have passed every check in the repository. That is the
// "green check that cannot fail" shape this project keeps finding, and it was
// found this time by somebody LOOKING at the showcase page and saying the
// carousel was "just 3 pictures standing there".
//
// **They were right about the page and wrong about the bug**, which is worth
// recording: three 384px cards and two gaps come to 1184px inside a 1232px
// section, so at a desktop width there is genuinely nothing to scroll. The
// mechanism was fine; the coverage was not.
//
// The anti-vacuity half is the `grid` control below. Without it, "the row is
// wider than its box" would pass for any container holding enough children,
// and would say nothing about carousels in particular.

/** Enough cards that they cannot fit at any width this suite uses. */
const CARDS = 8;

const carouselPage = () => [
  container({
    name_en: "Swipe",
    mode: "carousel",
    children: Array.from({ length: CARDS }, (_, at) =>
      leaf({ kind: "text", title_en: `Card ${at + 1}` }),
    ),
  }),
  container({
    name_en: "Grid",
    mode: "grid",
    spaces: 2,
    children: Array.from({ length: CARDS }, (_, at) =>
      leaf({ kind: "text", title_en: `Cell ${at + 1}` }),
    ),
  }),
];

test.describe("a carousel", () => {
  let identity: TestIdentity | undefined;

  test.beforeAll(async () => {
    test.skip(!hasClerk(), "needs Clerk credentials");
    identity = await createTestIdentity();
  });

  test.afterAll(async () => {
    if (identity) await deleteTestIdentity(identity.userId);
  });

  test("is a row that genuinely scrolls, where a grid is not", async ({
    page,
  }) => {
    const who = identity;
    test.skip(!who, "needs Clerk credentials");
    if (!who) return;

    const { address, handle } = await seedPage({
      userId: who.userId,
      handlePrefix: "swipe",
      displayName: "Swipe",
      blocks: carouselPage(),
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/en/${address}/${handle}`);

    const row = page.getByTestId("block-carousel");
    const grid = page.getByTestId("block-grid");

    const rowBox = await row.evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    expect(
      rowBox.scroll,
      `a carousel of ${CARDS} cards measured ${rowBox.scroll}px inside ${rowBox.client}px`,
    ).toBeGreaterThan(rowBox.client);

    // THE CONTROL. The same eight children in a grid wrap onto more rows and
    // overflow nothing — so the assertion above is about the carousel rather
    // than about having a lot of children.
    const gridBox = await grid.evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    expect(gridBox.scroll).toBeLessThanOrEqual(gridBox.client + 1);
  });

  test("moves when it is scrolled, and snaps", async ({ page }) => {
    const who = identity;
    test.skip(!who, "needs Clerk credentials");
    if (!who) return;

    const { address, handle } = await seedPage({
      userId: who.userId,
      handlePrefix: "snap",
      displayName: "Snap",
      blocks: carouselPage(),
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/en/${address}/${handle}`);
    const row = page.getByTestId("block-carousel");

    // **Scrolled by a GESTURE, not by script, and the difference is the whole
    // point of this case.** An earlier version set `scrollLeft` directly and
    // claimed in a comment that it distinguished `overflow-x: auto` from
    // `hidden`. It does not: `hidden` still makes a scroll container, and
    // script may scroll it freely — only a USER cannot. Swapping `auto` for
    // `hidden` passed every assertion in this file, which is exactly the fault
    // the file was written to end, reproduced inside it.
    expect(await row.evaluate((el) => el.scrollLeft)).toBe(0);
    await row.hover();
    await page.mouse.wheel(400, 0);
    await expect
      .poll(async () => row.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);

    const snap = await row.evaluate((el) => ({
      row: getComputedStyle(el).scrollSnapType,
      card: getComputedStyle(el.children[0] as Element).scrollSnapAlign,
    }));
    expect(snap.row).toContain("x");
    expect(snap.card).not.toBe("none");
  });

  test("scrolls its own row rather than the page", async ({ page }) => {
    // The reason a carousel is allowed to be wider than its box at all: the
    // overflow belongs to the row. If it reached the document, every page
    // holding one would scroll sideways — which is the fault the containment
    // guards in `blocks-render.spec.ts` exist for, checked here at the width
    // where this row is at its widest.
    const who = identity;
    test.skip(!who, "needs Clerk credentials");
    if (!who) return;

    const { address, handle } = await seedPage({
      userId: who.userId,
      handlePrefix: "bleed",
      displayName: "No bleed",
      blocks: carouselPage(),
    });

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/en/${address}/${handle}`);
    await expect(page.getByTestId("block-carousel")).toBeVisible();

    const document_ = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(
      document_.scroll,
      `the document measured ${document_.scroll}px in ${document_.client}px`,
    ).toBeLessThanOrEqual(document_.client + 1);
  });
});
