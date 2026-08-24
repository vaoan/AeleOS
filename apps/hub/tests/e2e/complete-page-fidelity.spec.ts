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
// second section has three places and is measured again at 560px: the public
// page's measured threshold is 544px, while the old shell's second gutter
// leaves this preview below it. Thus a page-width query produces three tracks
// and an editor-column query produces one.

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
        children: [
          leaf({ title_en: "Left" }),
          leaf({ title_en: "Middle" }),
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
  const content = page.getByTestId("complete-page-preview-content");
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
  const available = await page.evaluate(
    () => document.documentElement.clientWidth,
  );

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
  for (let index = 1; index < widths.length; index += 1) {
    expect(widths[index]!).toBeGreaterThan(widths[index - 1]!);
  }
});

test("lets a bled section reach both page edges", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { bled } = await openFixture(page);
  const available = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
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
  expect(await host.evaluate((node) => getComputedStyle(node).overflowX)).toBe(
    "auto",
  );
  expect(
    await host.evaluate((node) => {
      const clipped: string[] = [];
      let current: Element | null = node;
      while (current) {
        const overflow = getComputedStyle(current).overflowX;
        if (overflow === "hidden" || overflow === "clip") {
          clipped.push(current.tagName.toLowerCase());
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
  await page.setViewportSize({ width: 560, height: 900 });
  const { measuredSection } = await openFixture(page);
  await page.getByTestId("theme-measure").selectOption("full");

  const tracks = await tracksOf(measuredSection.getByTestId("block-grid"));
  expect(tracks).toHaveLength(3);
});

const RESPONSIVE_VIEWPORTS = [
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
  // Thirty-six real navigations through server components and Clerk. The
  // responsive matrix is the subject, so keep it whole and bound the measured
  // local/CI spread rather than dropping routes to meet the default timeout.
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

  for (const viewport of RESPONSIVE_VIEWPORTS) {
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

      expect(columnBox.x, route).toBeCloseTo(mainBox.x, 0);
      expect(columnBox.y, route).toBeCloseTo(mainBox.y, 0);
      expect(columnBox.width, route).toBeCloseTo(mainBox.width, 0);
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
