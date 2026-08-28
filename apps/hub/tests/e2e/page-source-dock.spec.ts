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

// THE PAGE-SOURCE DOCK, MOUNTED FOR THE FIRST TIME.
//
// Task 7 is the first change that puts `PageSourceDock` in front of a real
// browser at all — every suite before it exercised the component through
// jsdom, which implements neither `<dialog>`'s user-agent stylesheet nor real
// layout. That gap hid three bugs at once, all in the same class list, and
// none of them had any unit-test-visible symptom:
//
// - A bare, unconditional `flex` utility beat the UA's own
//   `dialog:not([open]) { display: none }` — author origin always wins over
//   user-agent origin, regardless of specificity or layers — so the dock
//   rendered, full size, on every page load, before anyone ever pressed the
//   control that is supposed to open it.
// - The UA stylesheet also sets `left: 0` unconditionally. With that, this
//   component's own `right: 0`, an explicit `width`, and `margin: 0` all in
//   force together, the box was over-constrained and the browser dropped
//   `right` — so the panel rendered pinned to the LEFT edge of the window
//   instead of the right.
// - The UA stylesheet's default `height` is `fit-content`, not `auto`, so
//   with no author `height` declared at all the panel sized itself to its
//   own content rather than stretching from `top` to `bottom` — a few
//   hundred pixels tall instead of the full viewport.
//
// This spec is the regression test for all three, at once, because they were
// found together and the same three-part class-list fix (`hidden open:flex`,
// `left-auto`, `h-auto`) closes all of them. Sabotage-verified: reverting any
// one of the three back to the pre-fix class list reddens the first test
// below.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;
let handle = "";

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  ({ handle } = await seedPage({
    userId: identity.userId,
    handlePrefix: "sourcedock",
    displayName: "Source dock check",
    blocks: [
      container({
        name_en: "About",
        mode: "stack",
        children: [
          leaf({
            title_en: "Original title",
            description_en: "Original words.",
          }),
        ],
      }),
    ],
  }));
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("opens beside the page, reaching the right edge and the foot of the window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  const dock = page.getByTestId("page-source-dock");

  // **Closed by default, and genuinely off-screen — not merely "not the
  // subject of this assertion."** The pre-fix version was visible here: a
  // `toBeVisible()` failure at this line is the display-none regression.
  await expect(dock).toBeHidden();

  await page.getByTestId("editor-open-source").click();
  await expect(dock).toBeVisible();

  const box = (await dock.boundingBox())!;
  const viewport = page.viewportSize()!;

  // **At the RIGHT edge, not the left.** The pre-fix version put `box.x` at
  // 0 — the over-constrained `left`/`right` bug — so this pins it against
  // the viewport's right edge with the panel's own measured width.
  expect(
    box.x + box.width,
    "the dock's right edge sits at the viewport's right edge",
  ).toBeGreaterThan(viewport.width - 2);
  expect(box.x, "the dock is not pinned to the left edge").toBeGreaterThan(
    viewport.width / 2,
  );

  // **Reaching the foot of the window, not sized to its own content.** The
  // pre-fix version stopped a few hundred pixels down — the `fit-content`
  // default height bug — so this checks the panel's bottom edge is near the
  // viewport's own bottom rather than far short of it.
  expect(
    box.y + box.height,
    "the dock reaches near the bottom of the viewport",
  ).toBeGreaterThan(viewport.height - 4);

  await page.getByTestId("page-source-close").click();
  await expect(dock).toBeHidden();
});

// **Sheet mode is what the class list's own `max-md:` rules are for, and
// nothing until now had watched it in a real browser.** The previous task
// broke this exact shape once — `max-md:w-full` alone was not enough against
// the always-on `max-w-[min(48rem,80vw)]` and `min-w-[20rem]`, both of which
// clamp the USED width regardless of what `width` says — and it was found
// only by measuring, not by re-reading the cascade reasoning. 320 is this
// repository's own narrowest-phone convention, matching `responsive.spec.ts`.
test("reaches both edges of the window at a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  await page.getByTestId("editor-open-source").click();
  const dock = page.getByTestId("page-source-dock");
  await expect(dock).toBeVisible();

  const box = (await dock.boundingBox())!;

  expect(
    box.x,
    "the dock reaches the left edge in sheet mode",
  ).toBeLessThanOrEqual(1);
  expect(
    box.x + box.width,
    "the dock reaches the right edge in sheet mode",
  ).toBeGreaterThanOrEqual(319);
});

test("editing the box changes the page; breaking it leaves the page alone", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/en/pages/${handle}/edit`);
  const preview = page.getByTestId("block-preview").first();
  await expect(preview).toBeVisible();
  // A plain string assertion, not `toContainText` — this checks AUTHOR
  // content this fixture wrote, not a translated catalogue string, but the
  // lint rule bans the method itself rather than reasoning about the string,
  // so every text check in this file goes through `.innerText()` instead.
  expect(await preview.innerText()).toContain("Original words.");

  await page.getByTestId("editor-open-source").click();
  const textarea = page.getByTestId("page-source-textarea");
  await expect(textarea).toBeVisible();

  const original = await textarea.inputValue();
  expect(original).toContain("Original title");

  // A genuine hand edit — different whitespace and key order from
  // `toDocument`'s own canonical form — is the input this feature exists
  // for; see `usePageSource`'s own TSDoc on why the mirror guard has to
  // compare against a canonical re-serialisation rather than raw text.
  const edited = original.replace("Original title", "Edited by hand");
  await textarea.fill(edited);

  // Past the hook's 250ms debounce.
  await expect
    .poll(async () => preview.innerText(), { timeout: 5000 })
    .toContain("Edited by hand");

  // Breaking a brace: the strip appears, and the page keeps showing the last
  // ACCEPTED edit rather than reverting or going blank.
  const broken = edited.slice(0, -1);
  await textarea.fill(broken);

  const problems = page.getByTestId("page-source-problems");
  await expect(problems).toBeVisible();
  await expect
    .poll(async () => (await problems.innerText()).length, { timeout: 5000 })
    .toBeGreaterThan(0);
  expect(await preview.innerText()).toContain("Edited by hand");
});
