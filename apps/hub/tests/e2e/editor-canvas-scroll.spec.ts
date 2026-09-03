import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import {
  container,
  leaf,
  seedPage,
  SEEDED_IDENTITY_SECTIONS,
} from "./support/blocks";

// EDIT MODE AND PREVIEW HAVE DIFFERENT SCROLL OWNERS.
//
// A class saying `overflow-y-auto` cannot prove anything about geometry: if
// one ancestor forgot `min-h-0`, the canvas expands to its content and the
// document still scrolls. Every case below reads both candidates and drives
// both candidates, so a page that scrolls neither cannot pass as a page whose
// canvas scrolls.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;
let handle = "";

const LONG_PAGE = Array.from({ length: 16 }, (_, index) =>
  container({
    name_en: `Section ${index + 1}`,
    mode: "stack",
    children: [
      leaf({
        title_en: `Heading ${index + 1}`,
        description_en:
          "Enough content to make the authored page taller than every " +
          "viewport in this suite, without relying on controls for height.",
      }),
    ],
  }),
);

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  ({ handle } = await seedPage({
    userId: identity.userId,
    handlePrefix: "canvasscroll",
    displayName: "Canvas scroll ownership",
    blocks: LONG_PAGE,
  }));
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

async function openEditor(page: Page): Promise<Locator> {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/en/pages/${handle}/edit`);
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("block-preview")).toHaveCount(
    LONG_PAGE.length + SEEDED_IDENTITY_SECTIONS,
  );
  return canvas;
}

async function scrollGeometry(_page: Page, canvas: Locator) {
  return canvas.evaluate((element) => {
    return {
      documentPast:
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight,
      canvasPast: element.scrollHeight - element.clientHeight,
      canvasTop: element.scrollTop,
      windowTop: window.scrollY,
    };
  });
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 320, height: 720 },
  { name: "short viewport", width: 1280, height: 500 },
] as const) {
  test(`only the canvas scrolls while controls show at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const canvas = await openEditor(page);
    const first = page.getByTestId("block-preview").first();
    const before = (await first.boundingBox())!.y;

    const initial = await scrollGeometry(page, canvas);
    expect(initial.documentPast).toBeLessThanOrEqual(2);
    expect(initial.canvasPast).toBeGreaterThan(400);

    await page.evaluate(() =>
      window.scrollTo({ top: 400, behavior: "instant" }),
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(resolve)),
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await first.boundingBox())!.y).toBeCloseTo(before, 0);

    await canvas.evaluate((node) =>
      node.scrollTo({ top: 400, behavior: "instant" }),
    );
    await expect
      .poll(() => canvas.evaluate((node) => node.scrollTop))
      .toBe(400);
    expect((await first.boundingBox())!.y).toBeLessThan(before - 300);
  });
}

test("the inspector and canvas scroll independently", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  const canvas = await openEditor(page);
  await page.getByTestId("select-page").click();
  const pane = page
    .getByTestId("canvas-inspector")
    .locator(".overflow-y-auto")
    .first();

  expect(
    await pane.evaluate((node) => node.scrollHeight - node.clientHeight),
  ).toBeGreaterThan(100);
  await pane.evaluate((node) =>
    node.scrollTo({ top: 120, behavior: "instant" }),
  );
  expect(await pane.evaluate((node) => node.scrollTop)).toBe(120);
  expect(await canvas.evaluate((node) => node.scrollTop)).toBe(0);

  await canvas.evaluate((node) =>
    node.scrollTo({ top: 240, behavior: "instant" }),
  );
  expect(await canvas.evaluate((node) => node.scrollTop)).toBe(240);
  expect(await pane.evaluate((node) => node.scrollTop)).toBe(120);
});

test("Preview clears both offsets and returns scrolling to the document", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const canvas = await openEditor(page);
  await page.getByTestId("select-page").click();
  await canvas.evaluate((node) =>
    node.scrollTo({ top: 500, behavior: "instant" }),
  );
  await expect.poll(() => canvas.evaluate((node) => node.scrollTop)).toBe(500);

  await page.getByTestId("hide-controls").click();
  await expect(page.getByTestId("canvas-inspector")).toHaveCount(0);

  const preview = await scrollGeometry(page, canvas);
  expect(preview.canvasTop).toBe(0);
  expect(preview.windowTop).toBe(0);
  expect(preview.canvasPast).toBeLessThanOrEqual(2);
  expect(preview.documentPast).toBeGreaterThan(400);

  await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);

  await page.getByTestId("show-controls").click();
  await expect(page.getByTestId("canvas-inspector")).toHaveCount(0);
  await expect
    .poll(async () => (await scrollGeometry(page, canvas)).documentPast)
    .toBeLessThanOrEqual(2);
  expect(await canvas.evaluate((node) => node.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
