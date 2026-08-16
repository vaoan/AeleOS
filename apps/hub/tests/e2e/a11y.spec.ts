import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";

// WHAT THIS MEASURES, AND THE ONE THING IT DELIBERATELY DOES NOT.
//
// `check:contrast` measures the design's TOKEN PAIRS — ink on card, muted on
// bar — by computing them. It cannot see a rendered page, so it cannot catch a
// control with no accessible name, a heading that skips a level, an image with
// no alt text, or text placed on a background nobody thought to pair it with.
// axe reads the page a browser actually built.
//
// **A themed page is checked in full, including its colours — and that was not
// the plan.** This suite was written with `color-contrast` disabled there, on
// the reasoning that a person's palette is theirs and CI must never argue for
// correcting it behind their back. Measured with the rule ON, the page passes:
// `derivePalette` solves text against whatever background an author picked, and
// it clears 4.5:1. So the exemption became an assertion instead.
//
// The distinction that survives, and it matters: the theme here is created by
// the test, so a failure means the DESIGN's default became unreadable. Pointing
// this suite at somebody's real page would be a different thing entirely, and
// `color-contrast` would come off for it — the app renders an author's colours
// verbatim on purpose, and what makes that safe is `PageThemeSwitch` offering
// every visitor the way out, not a linter refusing the page.

/** WCAG A and AA, which is the bar this app holds itself to. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Runs axe and fails with the rule ids and the elements they landed on.
 *
 * The default assertion prints the whole violation objects, which for anything
 * over one finding is unreadable — and an unreadable failure is one somebody
 * reruns rather than fixes.
 *
 * @param page - the page to analyse.
 * @param where - what to name in a failure.
 * @param disabled - rules to leave off, with a reason at the call site.
 * @returns nothing.
 */
async function isAccessible(
  page: Page,
  where: string,
  disabled: string[] = [],
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(disabled)
    .analyze();

  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}) on ${violation.nodes.length}: ` +
      violation.nodes
        .slice(0, 2)
        .map((node) => node.target.join(" "))
        .join(", "),
  );
  expect(summary, `${where} has accessibility violations`).toEqual([]);
}

test.describe("the signed-out pages are accessible", () => {
  test("sign-in", async ({ page }) => {
    await page.goto("/es/sign-in");
    await expect(page.getByTestId("wordmark")).toBeVisible();
    await isAccessible(page, "the sign-in page");
  });

  test("the not-found page", async ({ page }) => {
    await page.goto("/es/nobody-has-this-address");
    await expect(page.getByTestId("not-found-title")).toBeVisible();
    await isAccessible(page, "the not-found page");
  });
});

test.describe.configure({ mode: "serial" });

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test.describe("the signed-in pages are accessible", () => {
  test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

  test("the list and the editor", async ({ page }) => {
    await signIn(page, await mintTicket(identity!.userId));

    for (const path of ["/es/me", "/es/pages"]) {
      await page.goto(path);
      await expect(page.getByTestId("wordmark")).toBeVisible();
      await isAccessible(page, path);
    }

    // The editor with its theme panel open: the densest screen in the app, and
    // the one where a control without a name is most likely to appear, since
    // half of it is colour swatches and sliders.
    await page.goto("/es/pages/new");
    await page.getByTestId("theme-open").click();
    await expect(page.getByTestId("theme-canvas")).toBeVisible();
    await isAccessible(page, "the editor with the theme panel open");

    // Close the theme panel before opening a section's own style popup, so
    // axe reads one open overlay at a time rather than two stacked ones.
    await page.getByTestId("theme-open").click();

    // A section's own paintbrush popup — an OVERLAY, unlike the theme panel
    // above and `IconPicker`'s inline one, so it is the one surface in this
    // screen that owes Escape, an outside-click close, and its own focus
    // management rather than merely a name on every control. Never opened by
    // any e2e suite before this finding: a popup axe never sees is a popup it
    // cannot fail on, which is not the same as one that passes.
    await page.getByTestId("add-section").click();
    await page.getByTestId("section-style-open").click();
    await expect(page.getByTestId("section-style-panel")).toBeVisible();
    await isAccessible(page, "the editor with a section's style popup open");
  });
});

test.describe("a page wearing its author's colours", () => {
  test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

  test("is accessible in every way except the colours its owner chose", async ({
    page,
  }) => {
    await signIn(page, await mintTicket(identity!.userId));

    await page.goto("/es/me");
    const address = (await page.getByTestId("my-address").innerText()).trim();

    await page.goto("/es/pages/new");
    await page.getByTestId("editor-handle").fill("a11y");
    await page.getByTestId("editor-display-name").fill("Nova");
    await page.getByTestId("editor-visibility").selectOption("public");
    await page.getByTestId("theme-open").click();
    // A skin as well as the default palette, so what axe reads is a page that
    // has actually been styled rather than the design wearing its own colours.
    await page.getByTestId("theme-skin").selectOption("glass");
    await page.getByTestId("template-picker").click();
    await page.getByTestId("template-reference-sheet").click();
    await page.getByTestId("editor-save").click();
    await page.waitForURL(/\/pages(\?|$)/);

    await page.goto(`/es/${address}/a11y`);
    await expect(page.getByTestId("public-actor-name")).toBeVisible();

    // **`color-contrast` stays ON here, and that is a measured decision.**
    //
    // The carve-out this test was written with turned out to be unnecessary:
    // run with the rule enabled, a themed page passes. `derivePalette` solves
    // text against whatever background its author picked, and on this theme it
    // clears 4.5:1 — so what would have been an exemption is an assertion that
    // the solver works, on a real rendered page rather than in a unit.
    //
    // The theme is created BY this test, which is what makes that safe: the
    // palette is the design's own default plus a skin, so a failure here means
    // the default became unreadable, not that somebody's taste did.
    //
    // What must never happen is CI failing on a palette a PERSON chose. The
    // design renders those verbatim — `palette.test.ts` asserts the field is
    // used unaltered so that reintroducing a correction fails loudly — and what
    // makes that freedom safe is the escape hatch, not measurement. If this
    // suite is ever pointed at somebody's actual page, `color-contrast` comes
    // off for it, and the reason is a product decision rather than an oversight.
    await isAccessible(page, "a themed public page");
  });
});
