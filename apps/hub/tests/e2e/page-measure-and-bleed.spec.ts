import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";

// THE MEASURE AND THE BLEED, AGAINST THE SHELL THAT ACTUALLY WRAPS THEM.
//
// `PublicBlocks` was correct and shipped broken anyway. It puts the measure on
// each top-level section and lets a `bleed` section opt out — which works only
// if `main` holds nothing back sideways, and three separate comments in
// `blocks.tsx` say the route asks the shell for a full-width `main`. **No
// route did.** Both public pages passed `width="wide"`, so every page was laid
// inside `mx-auto max-w-7xl px-4 sm:px-6`, and `COLUMN.full` — added for this,
// documented for this — had no caller at all.
//
// Three things were wrong at once and none of them could fail a unit test:
//
//   1. A SECOND GUTTER inside the page's own, so every public page was 16px
//      narrower on each side than it was meant to be. That is not cosmetic —
//      `SPACE_CLASS` asks a container query, so the lost 32px moved the width
//      at which a three-place section stops collapsing, and
//      `weighted-places.spec.ts` went red on a viewport its own header had
//      measured.
//   2. `widest` (96rem) and `full` (no maximum) CAPPED at the column's 80rem.
//      Two of the six stops a person can pick did nothing whatever.
//   3. A bleeding section could reach neither edge, being inside a centred,
//      padded, capped column.
//
// **Every unit test stayed green through all of it**, because they render
// `PublicBlocks` and assert `MEASURE_CLASS` as class strings. The class was
// always right; the box it was laid in was not. This is the repository's own
// "a mocked dependency hides its own setup requirements" — the suites that
// mocked the shell away are the ones that could not have caught this — so the
// guard has to be the real route in a real browser, which is this file.
//
// **One fixture discriminates all three**, which is rule 27's question asked
// before writing rather than after: at 1600px a `widest` page lays its
// sections in 1536px and the buggy column lays them in 1232px, so a threshold
// of 1280 separates the two and could not be cleared by accident. The bleeding
// section is compared against `documentElement.clientWidth` — never `1600` —
// because that is the width a centred column measures itself against and it
// excludes the scrollbar `w-screen` would have counted.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

/** Wider than `max-w-7xl`, so a page capped at one is measurably narrower. */
const VIEWPORT = { width: 1600, height: 900 };

/** `max-w-7xl` in pixels — what the wrongly-columned page could never exceed. */
const COLUMN_CAP = 1280;

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("a widest page outgrows the old column, and a bleeding section reaches both edges", async ({
  page,
}) => {
  const { address, handle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "measure",
    displayName: "Wide open",
    // The bleeding section FIRST, so neither assertion depends on the
    // identity section `seedPage` appends sitting where it does.
    blocks: [
      container({
        name_en: "Bleeding",
        mode: "stack",
        style: { bleed: true },
        children: [leaf({ title_en: "Edge to edge" })],
      }),
      container({
        name_en: "Measured",
        mode: "stack",
        children: [leaf({ title_en: "Held to the measure" })],
      }),
    ],
    theme: { measure: "widest" },
  });

  await page.setViewportSize(VIEWPORT);
  expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

  const sections = page.getByTestId("public-section");
  const bled = (await sections.nth(0).boundingBox())!;
  const measured = (await sections.nth(1).boundingBox())!;

  // The width a centred column is laid against — NOT the viewport, which
  // includes a scrollbar this page does not lay its content under.
  const available = await page.evaluate(
    () => document.documentElement.clientWidth,
  );

  // (2) The chosen measure genuinely exceeds the column that used to cap it.
  // Under `width="wide"` this reads about 1184 and fails here rather than
  // somewhere further down, which is the point of asserting it first.
  expect(measured.width).toBeGreaterThan(COLUMN_CAP);

  // (3) A bleeding section reaches both edges — the left one too, which is
  // what separates "reaches the edge" from "is merely wide".
  expect(bled.width).toBeCloseTo(available, 0);
  expect(bled.x).toBeCloseTo(0, 0);

  // (1) And the two are genuinely different boxes. A page that lost its
  // measure entirely would pass both assertions above and be a different bug.
  expect(bled.width).toBeGreaterThan(measured.width);
});

test("a flush banner and footer meet the page edges while the middle keeps its chrome", async ({
  page,
}) => {
  const { address, handle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "margins",
    displayName: "Framed middle",
    appendIdentity: false,
    blocks: [
      container({
        name_en: "Banner",
        style: { bleed: true, margins: false },
        children: [leaf({ title_en: "Top" })],
      }),
      container({
        name_en: "Middle",
        children: [leaf({ title_en: "Body" })],
      }),
      container({
        name_en: "Footer",
        style: { bleed: true, margins: false },
        children: [
          leaf({ title_en: "Bottom" }),
          leaf({ kind: "avatar", title_en: "Portrait" }),
          leaf({ kind: "handle", title_en: "Handle" }),
          leaf({ kind: "owner", title_en: "Owner" }),
        ],
      }),
    ],
  });

  // Short enough that the content, not the shell's minimum height, determines
  // `main`'s bottom edge. Otherwise a correct footer is followed by empty
  // viewport space and cannot prove that the section itself removed the floor.
  await page.setViewportSize({ width: VIEWPORT.width, height: 600 });
  expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

  const sections = page.getByTestId("public-section");
  await expect(sections).toHaveCount(3);

  const main = (await page.getByTestId("page-content").boundingBox())!;
  const gutters = page.locator("[data-page-gutter]");
  await expect(gutters).toHaveCount(3);
  const banner = (await gutters.nth(0).boundingBox())!;
  const middle = (await gutters.nth(1).boundingBox())!;
  const footer = (await gutters.nth(2).boundingBox())!;
  const [bannerPaddingTop, footerPaddingBottom] = await gutters.evaluateAll(
    (elements) => [
      getComputedStyle(elements[0]!).paddingTop,
      getComputedStyle(elements[2]!).paddingBottom,
    ],
  );
  const available = await page.evaluate(
    () => document.documentElement.clientWidth,
  );

  expect(bannerPaddingTop).toBe("0px");
  expect(footerPaddingBottom).toBe("0px");
  expect(banner.y).toBeCloseTo(main.y, 0);
  expect(banner.x).toBeCloseTo(0, 0);
  expect(banner.width).toBeCloseTo(available, 0);
  expect(middle.y - (banner.y + banner.height)).toBeGreaterThan(20);
  expect(footer.y).toBeCloseTo(middle.y + middle.height, 0);
  expect(footer.y + footer.height).toBeCloseTo(main.y + main.height, 0);
  expect(footer.x).toBeCloseTo(0, 0);
  expect(footer.width).toBeCloseTo(available, 0);
});
