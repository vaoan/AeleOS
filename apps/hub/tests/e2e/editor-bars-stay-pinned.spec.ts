import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";

// THE EDITOR'S BAR STAYS PINNED WHILE THE CANVAS SCROLLS.
//
// Controls-visible editing no longer scrolls the document. The canvas is the
// only scroll owner, which is stronger than relying on `position: sticky`
// inside a long page: the toolbar is outside the scrolling box altogether.
// This guard drives the canvas, because driving `window` now moves nothing and
// would leave Save in place even if the canvas itself were wired incorrectly.
//
// That is what happened on 2026-08-27. Moving `BlockEditor` out of the control
// column so section previews could own the page's full width shortened that
// column to end just after the language strip — and both bars, which lived
// inside it, stopped sticking a few hundred pixels down a page that is
// thousands long. Save was the control that scrolled away, which is the one
// this editor's own toolbar note says must never move.
//
// So this scrolls a genuinely long page and asks where the bar is. Reading
// `getComputedStyle` cannot answer it; only `getBoundingClientRect` after a
// scroll can.
//
// **THERE IS ONE BAR NOW, and half this file went with the other one
// (2026-08-28).** The language strip became a control inside the toolbar, so
// the two claims it used to carry — that the strip is pinned at `--bar-top-2`,
// and that it sits under the save bar rather than 47px below it — no longer
// have a subject. They are DELETED rather than repointed at the toolbar,
// because repointed they would be vacuous: everything in the bar is pinned
// exactly when the bar is, so an assertion about the switch could not fail
// first and would be corroborating rather than evidence. The switch's own
// pinning is covered by Save's, which is the whole of the claim that remains.
//
// What the deletion gives up is the guarantee that the switch is still IN the
// bar at all, and that is picked up where it can actually fail:
// `fursona-editor.test.tsx` asserts containment rather than position, which is
// the only question that can tell "in the bar" from "in a strip above the
// theme panel". Repeating it here in a browser would measure the same fact a
// second time.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;
let handle = "";

/**
 * A page long enough that the fault is unmistakable.
 *
 * Eight sections rather than one or two: the old column ended a few hundred
 * pixels down, so a short page can be scrolled to its bottom without ever
 * passing the point where the bars come unstuck — a fixture that cannot
 * discriminate. Measured on this one, the document is several thousand pixels
 * tall and the probe below scrolls well past where the column used to end.
 */
const LONG_PAGE = Array.from({ length: 8 }, (_, index) =>
  container({
    name_en: `Section ${index + 1}`,
    mode: "stack",
    children: [
      leaf({
        title_en: `Heading ${index + 1}`,
        description_en:
          "A paragraph with enough words in it to give this section some " +
          "height, so the page is long enough to scroll a long way down.",
      }),
    ],
  }),
);

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  ({ handle } = await seedPage({
    userId: identity.userId,
    handlePrefix: "barspinned",
    displayName: "Bars stay pinned",
    blocks: LONG_PAGE,
  }));
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

// **PINNED IS NOT THE SAME CLAIM AS IN THE RIGHT PLACE, and the case below
// this one could not tell them apart (2026-09-03).** It reads Save's own
// starting offset and asserts canvas scrolling never moves it — true of a bar
// resting under the header and equally true of one resting 56px lower, since
// both are outside the scroller and neither moves. So the band this editor
// actually shipped passed it.
//
// A sticky offset is measured from the SCROLLPORT. Confining the scroll to the
// canvas made the bar's nearest scrollport the editor's form, which already
// begins below the header — so `top: var(--bar-top)` counted the header twice
// and left a 56px strip of the author's page between the two bars, with the
// canvas pushed down by the same amount. Measured at 1280x900 before the fix:
// header 0-56, bar 112-171, canvas top 277. After: bar 56-115, canvas top 245.
//
// **The viewport has to be TALL for this to discriminate.** `--bar-top` is
// `0px` under `@media (height <= 600px)`, so the faulty offset resolves to
// zero on a short screen and the band never appears there — a phone-landscape
// fixture would have passed against the very code this case exists to refuse.
test("the bar rests flush under the app header, with no band of page between them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  const rest = await page.evaluate(() => {
    const header = document.querySelector("header")!.getBoundingClientRect();
    const bar = document
      .querySelector('[data-testid="editor-save"]')!
      .closest("div.sticky")!
      .getBoundingClientRect();
    const canvas = document
      .querySelector("[data-editor-canvas]")!
      .getBoundingClientRect();
    return {
      headerBottom: header.bottom,
      barTop: bar.top,
      barBottom: bar.bottom,
      canvasTop: canvas.top,
    };
  });

  // Both directions, because the two faults are mirrored: a positive gap is
  // the band, and a negative one is the bar parking ON the header — which is
  // the fault `--bar-top` was introduced for in the first place.
  expect(
    rest.barTop - rest.headerBottom,
    `the bar rests ${rest.barTop - rest.headerBottom}px from the header's foot`,
  ).toBeCloseTo(0, 0);

  // **The canvas begins exactly AT the bar's foot (2026-09-04).** This used
  // to be a 160px window — `> barBottom` and `< barBottom + 160` — which was
  // wide enough to admit the bar's own `mb-6` and, before that, the 56px band
  // as well. A window that admits the thing it is meant to refuse is rule 27's
  // fixture problem in an assertion: it passed on every version of this
  // layout, faulty or not.
  //
  // Equality is the honest claim, and it is now true because the bar carries
  // no bottom margin: any spacing above the Page pill lives INSIDE the
  // scroller as that column's own `pt-3`, so it scrolls away with the pill
  // instead of holding a strip of the author's backdrop under the chrome
  // forever. `canvasTop` cannot see that padding, which is what makes this a
  // measurement of the two boxes' relationship rather than of a style.
  expect(
    rest.canvasTop,
    `the canvas begins ${rest.canvasTop - rest.barBottom}px below the bar's foot`,
  ).toBeCloseTo(rest.barBottom, 0);
});

test("the save bar stays pinned while the canvas scrolls all the way down", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  const toolbar = page.getByTestId("editor-save");
  const canvas = page.getByTestId("editor-canvas");
  const initialSave = (await toolbar.boundingBox())!;
  expect(initialSave.y).toBeGreaterThanOrEqual(0);
  expect(initialSave.y).toBeLessThan(900);

  const { height, viewport } = await canvas.evaluate((node) => ({
    height: node.scrollHeight,
    viewport: node.clientHeight,
  }));
  // The fixture has to extend well past the viewport for the question to mean
  // anything. Comparing the canvas's own two dimensions also prevents a
  // document-scrolled page from passing on a tall fixture whose canvas simply
  // expanded to fit its content.
  expect(
    height - viewport,
    "the seeded page is long enough to scroll inside the canvas",
  ).toBeGreaterThan(500);

  for (const to of [
    Math.round((height - viewport) / 3),
    Math.round(((height - viewport) * 2) / 3),
    height - viewport,
  ]) {
    await canvas.evaluate(
      (node, top) => node.scrollTo({ top, behavior: "instant" }),
      to,
    );
    await expect.poll(() => canvas.evaluate((node) => node.scrollTop)).toBe(to);

    const save = (await toolbar.boundingBox())!;

    // **Still at the exact place it began.** The toolbar is outside the canvas
    // scroller now, so its contract is stronger than the old sticky-offset
    // range: canvas movement must not move Save by even one CSS pixel.
    expect(
      save.y,
      `Save is still pinned after canvas scroll ${to}`,
    ).toBeCloseTo(initialSave.y, 0);
  }
});
