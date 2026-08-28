import { expect, test, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";

// THE EDITOR'S BAR STAYS PINNED FOR THE WHOLE PAGE.
//
// **A `position: sticky` element sticks only within its PARENT's box.** When
// that box ends, the element scrolls away with it — silently, with no error and
// nothing in any computed style to read: `position` still says `sticky` and the
// offset still says what it always said. The only way to see it is to scroll a
// real page and look at where the bar ended up.
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

/**
 * How far down the viewport a named bar offset resolves to, in pixels.
 *
 * Read from the document rather than written down here, because `--bar-top` is
 * composed in `globals.css` out of the bar height — and a copy of that
 * arithmetic in a test is a second source of truth that drifts the first time
 * a bar changes height.
 *
 * @param page - the editor page.
 * @param name - the custom property to resolve.
 * @returns the offset in pixels.
 */
async function barOffset(page: Page, name: string): Promise<number> {
  return page.evaluate((property) => {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.top = `var(${property})`;
    document.body.append(probe);
    const top =
      probe.getBoundingClientRect().top -
      document.body.getBoundingClientRect().top;
    probe.remove();
    return top;
  }, name);
}

test("the save bar stays pinned all the way down", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  const toolbar = page.getByTestId("editor-save");

  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  // The fixture has to be long enough for the question to mean anything.
  expect(height, "the seeded page is long enough to scroll").toBeGreaterThan(
    3000,
  );

  const barTop = await barOffset(page, "--bar-top");

  for (const to of [1200, 2400, height - 900]) {
    await page.evaluate(
      (top) => window.scrollTo({ top, behavior: "instant" }),
      to,
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(resolve)),
    );

    const save = (await toolbar.boundingBox())!;

    // **Still on screen, and still where the offset puts it.** A bar that has
    // come unstuck is not merely misplaced: it is above the viewport entirely,
    // so its `y` goes negative and keeps going. The tolerance is the bar's own
    // padding, since this probe is on a control inside the bar rather than on
    // the bar element.
    expect(
      save.y,
      `Save is still pinned after scrolling to ${to}`,
    ).toBeGreaterThanOrEqual(barTop - 1);
    expect(
      save.y,
      `Save has not drifted down after scrolling to ${to}`,
    ).toBeLessThan(barTop + 60);
  }
});
