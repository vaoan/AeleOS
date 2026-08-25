import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";
import { compareShots } from "./support/pixels";

// THE PREVIEW AGAINST THE PAGE, IN PIXELS.
//
// Every other guard here asks whether the preview emits the right classes or
// lays the right boxes. Both can be entirely green while the thing somebody
// looks at is visibly not their page: the renderer is shared, so the class
// strings match by construction, and geometry assertions only cover the
// properties somebody thought to measure.
//
// This asks the only question the person building a page actually asks — does
// this section look like it will look — by photographing ONE seeded page twice,
// once at its public address and once inside the editor's complete preview, and
// comparing the two images.
//
// WHAT IS DELIBERATELY EQUALISED, AND WHY THAT IS NOT CHEATING.
//
// Two things behind the page are the WINDOW's rather than the section's, and
// both are quieted identically on both sides.
//
// The nebula canvas animates and is seeded per load, so left running it makes
// every comparison nondeterministic for a reason that has nothing to do with
// the preview.
//
// The author's field is a gradient anchored to the viewport on a published
// page, so which slice of it shows behind a given section depends on where that
// section sits on screen — near the top when a stranger opens the page, part
// way down a long editor here. That is a property of scroll position, not of
// the preview, and it is the one difference an inline preview cannot close;
// measured, it moves a section by up to 7 channels, and copying `body`'s
// `background-attachment: fixed` into the host makes it 29 rather than 0.
// Both sides are given the same flat field instead.
//
// What that leaves is everything the preview is actually responsible for: the
// palette, the skin, the surfaces, the type, and every box. Those are what was
// broken, and both faults this found were invisible to every other check.
// Sabotage-verified: dropping the `:root` compositions `previewThemeCss`
// restates reddens three sections at 63%, 54% and 17%, painting the app's
// near-white where the page paints the author's colour; taking `--ink` off the
// host reddens three at about 1 to 2%, which is what a page's worth of text
// amounts to in area. Moving every leaf one pixel inside its own section
// reddens all four.

test.describe.configure({ mode: "serial" });
test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

/**
 * How much of a section may differ before it is a different-looking section.
 *
 * **A tenth of a percent, against runs that measure at most a few thousandths
 * of one.** Once the window's own backdrop is quieted these sections compare
 * at 0 to 21 differing pixels out of a hundred thousand and more, varying a
 * little run to run along antialiased curves, so the budget is not covering a
 * known difference — it is the margin below which a handful of stray pixels is
 * not worth failing a branch for.
 *
 * It was 0.5% while the differences were being chased down, and that was
 * measurably too loose: moving every leaf one pixel inside its own section
 * left two of the four sections under it. At a tenth, all four go red.
 */
const ALLOWED_RATIO = 0.001;

const VIEWPORT = { width: 1280, height: 900 };

let identity: TestIdentity | undefined;
let address = "";
let handle = "";

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  ({ address, handle } = await seedPage({
    userId: identity.userId,
    handlePrefix: "previewfidelity",
    displayName: "Preview fidelity",
    blocks: [
      container({
        name_en: "Plain stack",
        name_es: "Pila simple",
        mode: "stack",
        children: [
          leaf({
            title_en: "A written thing",
            title_es: "Algo escrito",
            description_en: "With a sentence under it.",
            description_es: "Con una frase debajo.",
          }),
        ],
      }),
      container({
        name_en: "Weighted grid",
        name_es: "Rejilla con pesos",
        mode: "grid",
        spaces: 3,
        weights: [1, 3, 1],
        style: { skin: "comic" },
        children: [
          leaf({ title_en: "Left", title_es: "Izquierda" }),
          leaf({ title_en: "Middle", title_es: "Centro" }),
          leaf({ title_en: "Right", title_es: "Derecha" }),
        ],
      }),
      container({
        name_en: "Bleeding banner",
        name_es: "Banner a sangre",
        mode: "stack",
        style: { bleed: true },
        children: [
          leaf({ title_en: "Edge to edge", title_es: "De borde a borde" }),
        ],
      }),
    ],
    theme: {
      measure: "wider",
      skin: "neon",
      background: {
        kind: "linear",
        repeating: false,
        every: 0,
        angle: 135,
        shape: "ellipse",
        extent: "farthest-corner",
        x: 50,
        y: 50,
        stops: [
          { color: "#2a0845", at: 0 },
          { color: "#ff2d95", at: 100 },
        ],
      },
    },
  }));
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/**
 * Quiets everything behind the page that belongs to the window.
 *
 * The canvas is hidden and the field is flattened to one colour, identically on
 * both sides; see this file's header for why each is the honest choice rather
 * than a way of passing. The flat colour is opaque, so a translucent surface
 * still composites against a known backdrop and a surface painting the wrong
 * colour is still plainly wrong.
 *
 * @param page - the document to quiet.
 */
async function quietTheWindow(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "canvas{visibility:hidden!important}" +
      ":root,body,[data-preview-theme]{--field:linear-gradient(#101014,#101014)!important}" +
      // Next's development indicator floats over the bottom-left corner of the
      // window, which is where a section near the end of a long editor sits. It
      // is not served in production and it was the entire remaining difference
      // in one section — a red badge reading "1 Issue" photographed as part of
      // somebody's page.
      "nextjs-portal{display:none!important}",
  });
}

/**
 * Photographs every top-level section of a rendered page, in order.
 *
 * Nothing is nudged onto whole pixels here, and two attempts to are worth
 * recording because both looked like fixes and neither was. A section whose
 * predecessor is 503.5 device pixels tall starts on a HALF pixel, so the same
 * content photographs from one row higher in a document that begins on a whole
 * one; that is where the last two percent of every difference came from. A
 * `transform: translate(0, 0.5px)` promotes the section to a composited layer
 * the compositor then resamples, and a fractional `scrollBy` is undone by
 * Playwright scrolling the element into view for the shot. Both printed the
 * same number they were meant to remove. Whole-pixel placement is forgiven in
 * {@link compareShots} instead, where it is one documented allowance rather
 * than a manoeuvre in the setup.
 *
 * @param root - the element the sections live under.
 * @returns one PNG per section.
 */
async function photographSections(root: Locator): Promise<Buffer[]> {
  const sections = root.getByTestId("public-section");
  await expect(sections.first()).toBeVisible();
  const count = await sections.count();
  const shots: Buffer[] = [];
  for (let index = 0; index < count; index += 1) {
    const section = sections.nth(index);
    await section.scrollIntoViewIfNeeded();
    shots.push(await section.screenshot({ animations: "disabled" }));
  }
  return shots;
}

/**
 * The public page as a stranger sees it.
 *
 * @param page - the browser page to navigate.
 * @returns one photograph per section.
 */
async function photographPublic(page: Page): Promise<Buffer[]> {
  await page.setViewportSize(VIEWPORT);
  await page.goto(`/es/${address}/${handle}`);
  await quietTheWindow(page);
  return photographSections(page.getByTestId("page-content"));
}

/**
 * The same page inside the editor's complete preview.
 *
 * @param page - the browser page to sign in and navigate.
 * @returns one photograph per section.
 */
async function photographPreview(page: Page): Promise<Buffer[]> {
  await page.setViewportSize(VIEWPORT);
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/es/pages/${handle}/edit`);
  // The preview renders the language being AUTHORED, which is a feature: an
  // author writing English sees English whatever the app's locale is. The
  // published half of this comparison is `/es/`, so the two are put in the same
  // language rather than treating that deliberate behaviour as a difference.
  await page.getByTestId("writing-in-es").click();
  await page.getByTestId("complete-page-preview-toggle").click();
  const content = page.getByTestId("complete-page-preview-content");
  await expect(content).toBeVisible();
  await quietTheWindow(page);
  return photographSections(content);
}

test("every section looks the same in the preview as on the page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const published = await photographPublic(page);
  const previewed = await photographPreview(page);

  expect(previewed).toHaveLength(published.length);

  const report: string[] = [];
  for (const [index, shot] of published.entries()) {
    const found = await compareShots(page, shot, previewed[index]!);
    report.push(
      `section ${index}: ${found.one.width}x${found.one.height} public, ` +
        `${found.two.width}x${found.two.height} preview, ` +
        `${found.differing} px differing ` +
        `(${(found.ratio * 100).toFixed(3)}%), ` +
        `placed ${found.offset.x},${found.offset.y}, ` +
        `worst channel ${found.worstChannel}` +
        (found.worstAt
          ? ` at ${found.worstAt.x},${found.worstAt.y} ` +
            `(${found.worstAt.one.join()} vs ${found.worstAt.two.join()})`
          : ""),
    );
  }
  console.log(report.join("\n"));

  for (const [index, shot] of published.entries()) {
    const found = await compareShots(page, shot, previewed[index]!);
    expect.soft(found.two, `section ${index} size`).toEqual(found.one);
    expect
      .soft(found.ratio, `section ${index} pixels: ${report[index]}`)
      .toBeLessThanOrEqual(ALLOWED_RATIO);
  }
});
