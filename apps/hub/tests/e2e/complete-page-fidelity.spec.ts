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
import { tracksOf } from "./support/grid";

// THE COMPLETE PREVIEW, AGAINST THE BOXES THE BROWSER ACTUALLY LAYS OUT.
//
// PublicBlocks already emits every right class. That was not enough: the
// preview used to sit inside the signed-in shell's max-w-7xl column, so the
// widest three measures were capped, bleed stopped at the column, and every
// container query answered against the workbench rather than the page. A unit
// test over class strings cannot see any of those faults.
//
// This fixture asks one page to discriminate every wrong result. The six
// measures have six distinct expected widths at 1600px, so a cap cannot hide
// behind two adjacent values. Its first section bleeds while the second does
// not, so losing the measure entirely cannot flatter the edge assertion. The
// second section has a three-place grid nested in the middle track of a
// weighted `[2,3,2]` outer grid. At a genuine 1600px desktop the public-width
// page gives that middle track more than the nested grid's 512px `@lg`
// threshold, while the old max-w-7xl shell leaves it below the threshold. Thus
// a page-width query produces three tracks and an editor-column query produces
// one at the desktop size this regression is about.

test.describe.configure({ mode: "serial" });
test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

const MEASURES = [
  ["narrow", 620],
  ["medium", 768],
  ["wide", 1024],
  ["wider", 1280],
  ["widest", 1536],
  ["full", null],
] as const;

let identity: TestIdentity | undefined;
let editHandle = "";

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  ({ handle: editHandle } = await seedPage({
    userId: identity.userId,
    handlePrefix: "columnfidelity",
    displayName: "Column fidelity",
    blocks: [],
  }));
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/**
 * Reads one laid box without reducing it to class-string evidence.
 *
 * @param locator - the element Chromium laid out.
 * @returns its viewport-relative rectangle.
 */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

/**
 * Opens an editor over a stored page built to distinguish page and column
 * geometry.
 *
 * @param page - the browser page to sign in and navigate.
 * @returns the complete preview's bled and measured sections.
 */
async function openFixture(page: Page) {
  const { handle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "previewfidelity",
    displayName: "Preview fidelity",
    blocks: [
      container({
        name_en: "Bleeding",
        style: { bleed: true },
        children: [leaf({ title_en: "Edge to edge" })],
      }),
      container({
        name_en: "Measured grid",
        mode: "grid",
        spaces: 3,
        weights: [2, 3, 2],
        children: [
          leaf({ title_en: "Left" }),
          container({
            name_en: "Nested three places",
            mode: "grid",
            spaces: 3,
            children: [
              leaf({ title_en: "Nested left" }),
              leaf({ title_en: "Nested middle" }),
              leaf({ title_en: "Nested right" }),
            ],
          }),
          leaf({ title_en: "Right" }),
        ],
      }),
    ],
    theme: { measure: "wider" },
  });

  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/es/pages/${handle}/edit`);
  await page.getByTestId("theme-open").click();
  await page.getByTestId("complete-page-preview-toggle").click();
  // **DESKTOP, and the measures are read inside the FRAME.** The preview is
  // its own document now, so a depth-0 section applies its measure against the
  // frame's viewport rather than the editor's — which is the whole reason the
  // route exists, and it means every box below is read through the frame.
  await page.getByTestId("preview-device-desktop").click();
  const framed = page.frameLocator(
    '[data-testid="complete-page-preview-frame"]',
  );
  const content = framed.getByTestId("page-content");
  await expect(content).toBeVisible();
  const sections = content.getByTestId("public-section");
  const pageBoxes = content.locator("[data-page-gutter]");
  await expect(sections).toHaveCount(3);
  return {
    content,
    bled: pageBoxes.nth(0),
    measured: pageBoxes.nth(1),
    measuredSection: sections.nth(1),
  };
}

test("tracks all six page measures", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { measured } = await openFixture(page);
  const available = await page
    .frames()
    .find((candidate) => candidate.url().includes("/me/preview"))!
    .evaluate(() => document.documentElement.clientWidth);

  const widths: number[] = [];
  const expectedWidths: number[] = [];
  for (const [measure, cap] of MEASURES) {
    await page.getByTestId("theme-measure").selectOption(measure);
    const box = await boxOf(measured);
    const expected = cap === null ? available : Math.min(cap, available);
    widths.push(box.width);
    expectedWidths.push(expected);
  }
  expect(widths).toEqual(expectedWidths);
  // **Strictly increasing only while the cap is below the frame's own width.**
  // The preview is a real viewport now — the desktop device's 1280 — so
  // `widest` (1536) and `full` (no maximum) both clamp to 1280 and are equal
  // BY CONSTRUCTION rather than because a measure was lost. Asserting a strict
  // increase across those two would be asserting something the viewport makes
  // impossible; what is still worth pinning is that every stop below the frame
  // width is distinct, and that the two above it are exactly the frame width.
  const distinct = widths.filter((width) => width < available);
  for (let index = 1; index < distinct.length; index += 1) {
    expect(distinct[index]!).toBeGreaterThan(distinct[index - 1]!);
  }
  expect(
    widths.filter((width) => width === available).length,
    "the stops at or past the frame's width all clamp to it",
  ).toBe(widths.length - distinct.length);
});

test("lets a bled section reach both page edges", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { bled } = await openFixture(page);
  const available = await page
    .frames()
    .find((candidate) => candidate.url().includes("/me/preview"))!
    .evaluate(() => document.documentElement.clientWidth);
  const edge = await boxOf(bled);
  expect(edge.x).toBeCloseTo(0, 0);
  expect(edge.width).toBeCloseTo(available, 0);
});

test("keeps horizontal excess reachable rather than clipping the preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { content } = await openFixture(page);
  const host = content.locator("..");

  // **The subject is the INTENT, not the mechanism, and this case used to
  // assert the mechanism.** It required `overflow-x: auto` on the host, which
  // did keep excess reachable — and also made the box a scroll container on
  // BOTH axes, because a `visible` axis paired with a non-visible one computes
  // to `auto`. That clipped every skin's outward ink at the preview's edges,
  // where the public route's `main` clips none. Excess is now reachable because
  // the DOCUMENT scrolls, which is what a stranger gets on an over-wide page.
  expect(
    await host.evaluate((node) => {
      const style = getComputedStyle(node);
      return { x: style.overflowX, y: style.overflowY };
    }),
    "the preview host is the same kind of box as the public route's main",
  ).toEqual({ x: "visible", y: "visible" });

  // Nothing from the content up to the document may clip, on either axis — a
  // hidden ancestor would make the workbench look as though the page fits.
  expect(
    await host.evaluate((node) => {
      const clipped: string[] = [];
      let current: Element | null = node;
      while (current) {
        const style = getComputedStyle(current);
        for (const overflow of [style.overflowX, style.overflowY]) {
          if (overflow === "hidden" || overflow === "clip") {
            clipped.push(current.tagName.toLowerCase());
          }
        }
        current = current.parentElement;
      }
      return clipped;
    }),
  ).toEqual([]);
});

test("a three-place preview queries the page width, not the editor column", async ({
  page,
}) => {
  // A genuine desktop, and the same width the measure/bleed cases use. A
  // top-level three-place section would be non-discriminating here because
  // both the fixed 1600px page and the broken 1232px host clear `@lg`. The
  // weighted middle track is about 651px fixed and 494px broken, putting the
  // two implementations on opposite sides of the nested section's 512px
  // query threshold.
  await page.setViewportSize({ width: 1600, height: 900 });
  const { measuredSection } = await openFixture(page);
  await page.getByTestId("theme-measure").selectOption("full");

  const nestedSection = measuredSection.locator("section").first();
  const nestedBox = await boxOf(nestedSection);
  const tracks = await tracksOf(nestedSection.getByTestId("block-grid"));
  expect
    .soft(
      nestedBox.width,
      `nested section is ${nestedBox.width}px wide at the desktop viewport`,
    )
    .toBeGreaterThan(512);
  expect(tracks).toHaveLength(3);
});

const COLUMN_VIEWPORTS = [
  // Wider than max-w-7xl, so a wrong desktop cap produces a different box
  // rather than passing behind the viewport edge.
  { width: 1600, height: 900 },
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
] as const;

test("every signed-in route retains the old wide-column geometry", async ({
  page,
}) => {
  // Forty-two real navigations through server components and Clerk. The
  // responsive plus capped-desktop matrix is the subject, so keep it whole and
  // bound the measured local/CI spread rather than dropping routes to meet the
  // default timeout.
  test.setTimeout(120_000);
  await signIn(page, await mintTicket(identity!.userId));
  const routes = [
    ["/es/me", 1],
    ["/es/pages", 1],
    ["/es/pages/new", 2],
    [`/es/pages/${editHandle}/edit`, 2],
    ["/es/me/edit", 2],
    ["/es/picker", 1],
  ] as const;

  for (const viewport of COLUMN_VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const [route, columnCount] of routes) {
      await page.goto(route);
      const main = page.getByTestId("page-content");
      const columns = page.getByTestId("wide-page-column");
      await expect(columns, `${route} at ${viewport.width}px`).toHaveCount(
        columnCount,
      );
      const column = columns.first();
      const mainBox = await boxOf(main);
      const columnBox = await boxOf(column);
      const styles = await column.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
        };
      });

      const expectedWidth = Math.min(viewport.width, 1280);
      const expectedX = mainBox.x + (mainBox.width - expectedWidth) / 2;
      expect.soft(columnBox.x, route).toBeCloseTo(expectedX, 0);
      expect(columnBox.y, route).toBeCloseTo(mainBox.y, 0);
      expect.soft(columnBox.width, route).toBeCloseTo(expectedWidth, 0);
      const pad = viewport.width >= 640 ? "24px" : "16px";
      const vertical = viewport.width >= 640 ? "40px" : "24px";
      expect(styles).toEqual({
        paddingLeft: pad,
        paddingRight: pad,
        paddingTop: vertical,
        // Editors transfer the old bottom padding to the full-width complete
        // preview that follows; every control still starts in the same box.
        paddingBottom: columnCount === 2 ? "0px" : vertical,
      });
    }
  }

  await page.goto("/es/fursonas");
  await page.waitForURL(/\/es\/pages$/);
});
