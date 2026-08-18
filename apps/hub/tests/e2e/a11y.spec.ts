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
import { container, leaf, seedPage } from "./support/blocks";

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

/**
 * WCAG A and AA, which is the bar this app holds itself to.
 *
 * **`best-practice` is NOT in this list, and several rules people keep
 * assuming this suite runs live only there.** Verified against the installed
 * `axe-core@4.13.0` by reading `getRules()` rather than from memory:
 *
 *  * `heading-order` — `cat.semantics`, `best-practice`. **Does not run.**
 *    This is the rule the "a leaf's title is styled as a heading and is not
 *    one" decision was made for; what actually holds that line is the unit
 *    case `gives a leaf's own title no heading element`, which asserts
 *    `queryByRole("heading")` is null and is stronger here anyway.
 *  * `scope-attr-valid` — `cat.tables`, `best-practice`. **Does not run.** The
 *    `table` leaf's `<th scope="row">` is held by a unit case asserting the
 *    exact attribute value, which is again stronger than a validity check.
 *  * `empty-table-header` — `cat.name-role-value`, `best-practice`. **Does not
 *    run**, which is load-bearing in the other direction: `TableLeaf`
 *    deliberately renders a blank `<th>` for a row whose label its author left
 *    empty but whose value is written, and that is the intended rendering.
 *    Widening this list would flag it.
 *
 * What DOES run and does cover this work: `th-has-data-cells` (`wcag2a`) —
 * which is why `table`'s drop rule matters, since a `<th>` with no `<td>`
 * beside it is a real violation — plus `frame-title`, `label` and `image-alt`,
 * all `wcag2a`.
 *
 * **The rule this list encodes is not "run less".** It is that a sentence
 * crediting a guard is not the guard: this project has now recorded that
 * mistake repeatedly in comments and, once, in a report's REASONING — which is
 * the harder one to catch, because there is no comment to grep. If a
 * best-practice rule is worth holding, add it and deal with what it surfaces —
 * do not describe it as covered.
 */
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
 * @param exclude - selectors to leave out, with a reason at the call site.
 * @returns nothing.
 */
async function isAccessible(
  page: Page,
  where: string,
  disabled: string[] = [],
  exclude: string[] = [],
): Promise<void> {
  const builder = new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(disabled);
  for (const selector of exclude) builder.exclude(selector);
  const results = await builder.analyze();

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

// EVERY BLOCK KIND AND EVERY MODE, ON ONE PAGE, WEARING A THEME.
//
// This is the only place axe ever sees the block renderer. It matters more
// than the count of kinds suggests, because several of them build markup no
// other surface in this app does: `tabs` is a native radio group whose labels
// carry the only accessible name each tab has, `accordion` is `<details>`,
// `table` is a real `<table>` with `<th scope="row">`, `player` and `post` are
// sandboxed `<iframe>`s, and `picture` reads its own title as alt text. A
// missing name on any of those is `wcag2a` and does run — see `TAGS`, which
// also names the three rules that do NOT and what holds each line instead.
//
// **An unnamed CONTAINER is deliberately one of the tabs.** `tabs` and
// `accordion` lift a child's name onto the control, and a child that has none
// falls back to its position — a numeral, because a `<label>` whose only
// content is an `sr-only` radio is a form control with no accessible name, and
// that is axe's `label` rule at `wcag2a`.
//
// It has to be a container rather than a leaf, and where that rule is enforced
// moved: `name_en` is optional on a container, while `title_en` is refused
// empty by `validate_block` in `0009`, so an unnamed LEAF is a shape no stored
// page can hold. The read schema is deliberately looser than that — it accepts
// one rather than failing the whole page over it — so if a leaf with no title
// ever does reach a renderer, `PlainLeaf` and `Seat.ordinal` already answer
// for it. This fixture exercises the fallback through the shape the database
// will actually store.
const EVERY_KIND = [
  container({
    name_en: "Stack",
    mode: "stack",
    children: [
      leaf({ kind: "text", title_en: "Words", description_en: "Some prose." }),
      leaf({
        kind: "quote",
        title_en: "Somebody",
        description_en: "A thing said.",
      }),
      leaf({ kind: "progress", title_en: "Ref sheet", description_en: "60%" }),
    ],
  }),
  container({
    name_en: "Grid",
    mode: "grid",
    columns: 2,
    children: [
      leaf({ kind: "stat", title_en: "Species", description_en: "Arctic fox" }),
      leaf({
        kind: "link",
        title_en: "Elsewhere",
        link_url: "https://example.com/",
      }),
      leaf({
        kind: "social",
        title_en: "Bluesky",
        link_url: "https://bsky.app/profile/someone.bsky.social",
      }),
      leaf({
        kind: "picture",
        title_en: "A drawing of a fox",
        image_url: "https://example.com/fox.png",
      }),
    ],
  }),
  container({
    name_en: "Tabs",
    mode: "tabs",
    children: [
      leaf({ kind: "text", title_en: "Named", description_en: "A panel." }),
      // No name at all: the tab falls back to its position. See above.
      container({
        children: [
          leaf({ kind: "text", title_en: "Inside", description_en: "More." }),
        ],
      }),
    ],
  }),
  container({
    name_en: "Accordion",
    mode: "accordion",
    children: [
      leaf({ kind: "text", title_en: "Open me", description_en: "Inside." }),
    ],
  }),
  container({
    name_en: "Media",
    mode: "carousel",
    children: [
      leaf({
        kind: "player",
        title_en: "A song",
        link_url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      }),
      leaf({
        kind: "post",
        title_en: "A post",
        link_url: "https://t.me/telegram/83",
      }),
    ],
  }),
  container({
    name_en: "Table",
    mode: "timeline",
    children: [
      leaf({
        kind: "table",
        title_en: "Measurements",
        rows: [
          [{ text_en: "Height" }, { text_en: "180cm" }],
          // A blank first cell beside a written value: an ordinary table with
          // a gap in it, and the reason `empty-table-header` must stay out of
          // `TAGS`.
          [{ text_en: "" }, { text_en: "and change" }],
        ],
      }),
    ],
  }),
];

test.describe("a page of blocks wearing its author's colours", () => {
  test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

  test("is accessible with every block kind and every mode on it", async ({
    page,
  }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "a11y",
      displayName: "Nova",
      blocks: EVERY_KIND,
      // A skin as well as a palette, so what axe reads is a page that has
      // actually been styled rather than the design wearing its own colours.
      theme: {
        skin: "glass",
        accent: "#00ff88",
        background: {
          angle: 90,
          stops: [
            { color: "#101a2e", at: 0 },
            { color: "#f3e3d3", at: 100 },
          ],
        },
      },
    });

    const response = await page.goto(`/es/${address}/${handle}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("public-actor-name")).toBeVisible();
    await expect(page.getByTestId("public-section")).toHaveCount(
      EVERY_KIND.length,
    );

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
    // **Every `<iframe>`'s own title is asserted here rather than by axe**,
    // because excluding the frames excludes `frame-title` along with them.
    // That attribute is the part of an embed that is OURS — `EmbedFrame` falls
    // back to the provider's id so it can never be empty — and it is `wcag2a`.
    const titles = await page
      .locator("iframe")
      .evaluateAll((frames) =>
        frames.map((frame) => frame.getAttribute("title") ?? ""),
      );
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.filter((title) => title === "")).toEqual([]);

    await isAccessible(
      page,
      "a themed public page of blocks",
      [],
      // **The providers' own markup is excluded, and it is not ours to fix.**
      // `@axe-core/playwright` injects into every frame, so a `player` or a
      // `post` leaf drags Spotify's and Telegram's widgets into the results —
      // measured here on the first run: four violations, all of them inside
      // `.h-42` and `.h-150`, including a `color-contrast` on Telegram's own
      // link colours and an `image-alt` on an avatar Telegram renders.
      //
      // Excluding them is the only honest option, and the alternative is
      // worse than it looks: leaving the rules on would make this suite go red
      // whenever a third party changed their widget, and turning the RULES off
      // instead would turn them off for our own markup too. What is lost is
      // covered above — the frame element itself is checked directly.
      ["iframe"],
    );
  });
});
