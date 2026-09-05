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

// THE WORKBENCH DOES NOT MOVE WHEN THE AUTHOR CHANGES THEIR PAGE.
//
// The editor wears the page being built: `ThemeScope` mounts the live draft, so
// `:root` carries the author's palette and `SKIN_SCOPE` — which in the editor
// ENCLOSES the controls — carries their face and their spacing. Every control
// is an island wearing `CHROME_SCOPE`, which re-declares AeleOS's own tokens on
// itself so the workbench stays the workbench.
//
// That containment is only as good as the list of properties the island
// restates, and the list is hand-maintained. `color` and `font-family` are on
// it because each was found leaking in turn. **`font-size` was not**, and
// `spacing` writes a raw `font-size` into the skin rule — so choosing
// `compact` shrank every control in the editor. Measured before the fix: 45 of
// 77 marked controls changed, each island's base type going 16px to 13px, and
// the spacing select that CAUSED it shrinking from 14px to 11.375px and from
// 34px to 31px tall under the pointer that had just set it.
//
// **The general shape is why this file is not a case in another suite.** A
// chrome island has to CONSUME every inheritable property it means to own, and
// nothing in the type system, the linter or any unit test can see that list is
// short by one. Only a browser resolving real cascades can, and only against a
// theme actually applied. So this asks the question property by property and
// control by control, and it will catch the NEXT inheritable property somebody
// adds to a theme without adding it to the island.
//
// **The anti-vacuity assertion is the load-bearing one.** "Nothing changed" is
// what a test reports when the theme never applied at all — a wrong selector, a
// control that silently refused, a form that did not commit. So every case
// asserts that the PAGE did change in the same breath as asserting the controls
// did not. Without that pair this file would pass forever on a broken fixture,
// which is root rule 27 exactly.

test.describe.configure({ timeout: 240_000 });
test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;
let handle = "";

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  ({ handle } = await seedPage({
    userId: identity.userId,
    handlePrefix: "stable",
    displayName: "Stable controls",
    blocks: [
      container({
        name_en: "A section",
        spaces: 1,
        children: [
          leaf({
            kind: "text",
            title_en: "A heading",
            description_en: "Some body text, so the page has type to resize.",
          }),
        ],
      }),
    ],
  }));
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/**
 * The properties a chrome island is claiming to own.
 *
 * **Every one of these INHERITS**, which is what makes them the exposure: a
 * property that does not inherit cannot reach a control from an ancestor the
 * author styled, and one that does reaches every descendant that has not been
 * told otherwise. `font-size` is the one this file was written for;
 * `font-family` and `color` are the two that were already found and fixed, kept
 * here so they cannot regress; `letter-spacing` and `line-height` are neither —
 * they are the next two a page-level typography option would reach for, and
 * they cost nothing to watch.
 */
const OWNED = [
  "fontSize",
  "fontFamily",
  "color",
  "letterSpacing",
  "lineHeight",
] as const;

/**
 * Every marked control inside a chrome island, with the properties it owns.
 *
 * Keyed by test id, which is what makes a failure name the control somebody has
 * to go and look at rather than reporting a count.
 *
 * @param page - the editor page.
 * @returns one entry per marked control.
 */
async function controls(page: Page): Promise<Record<string, string>> {
  return page.evaluate(
    (owned) => {
      const out: Record<string, string> = {};
      for (const island of document.querySelectorAll(".aeleos-chrome")) {
        for (const node of [island, ...island.querySelectorAll("*")]) {
          const id = node.getAttribute("data-testid");
          if (!id) continue;
          const style = getComputedStyle(node);
          out[id] = owned
            .map((property) => style[property as keyof CSSStyleDeclaration])
            .join(" | ");
        }
      }
      return out;
    },
    OWNED as unknown as string[],
  );
}

/**
 * What the author's own page looks like, so a no-op fixture cannot pass.
 *
 * Read from a block the author owns rather than from anything in a chrome
 * island — that is the whole point: it must move when the controls do not.
 *
 * @param page - the editor page.
 * @returns the page's own type size and face.
 */
async function pageLooks(page: Page): Promise<string> {
  return page
    .getByTestId("block-preview")
    .first()
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return `${style.fontSize} | ${style.fontFamily}`;
    });
}

/**
 * Opens Page Options with the theme panel already showing.
 *
 * @param page - the browser page.
 */
async function openEditor(page: Page): Promise<void> {
  await signIn(page, await mintTicket(identity!.userId));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto(`/es/pages/${handle}/edit`);
  await page.getByTestId("select-page").click();
  await page.getByTestId("panel-tab-secondary").click();
  await page.getByTestId("theme-open").click();
  await expect(page.getByTestId("theme-spacing")).toBeVisible();
}

/**
 * Names the controls whose owned properties differ between two surveys.
 *
 * @param before - the survey taken first.
 * @param after - the survey taken after the theme changed.
 * @returns one readable line per control that moved.
 */
function moved(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  return Object.keys(before)
    .filter((id) => before[id] !== after[id])
    .map((id) => `${id}: ${before[id]} -> ${after[id]}`);
}

for (const [control, value, what] of [
  ["theme-spacing", "compact", "the spacing"],
  ["theme-font", "casual", "the typeface"],
] as const) {
  test(`changing ${what} moves the page and not the controls`, async ({
    page,
  }) => {
    await openEditor(page);

    const controlsBefore = await controls(page);
    const pageBefore = await pageLooks(page);

    // The survey has to have found something, or every comparison below is
    // between two empty objects and passes for free.
    expect(
      Object.keys(controlsBefore).length,
      "the survey found marked controls inside chrome islands",
    ).toBeGreaterThan(20);

    await page.getByTestId(control).selectOption(value);
    await expect(page.getByTestId(control)).toHaveValue(value);

    const controlsAfter = await controls(page);
    const pageAfter = await pageLooks(page);

    // **ANTI-VACUITY, and it comes first on purpose.** If the choice did not
    // reach the page, the controls trivially did not move either — so this
    // failing tells you the fixture is broken, where the assertion below it
    // failing tells you the product is.
    expect(pageAfter, `${what} reached the author's own page`).not.toBe(
      pageBefore,
    );

    expect(
      moved(controlsBefore, controlsAfter),
      `no control changed when ${what} changed`,
    ).toEqual([]);
  });
}
