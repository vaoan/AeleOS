import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addBlock, addSection } from "./support/editor";

// WHAT THIS FILE PROVES.
//
// The editor canvas renders the real page — real links, real embeds — so a
// click meant to select a block could otherwise navigate away or start
// media. The interaction lock is unit-tested at the mechanism level
// (`canvas-interaction-lock.test.ts`, `fursona-editor.test.tsx`), but jsdom
// implements no `inert` behaviour at all: it can prove the ATTRIBUTE is
// present and absent correctly, never that a real browser actually refuses
// to focus or activate an inert element. That needs a real browser, driving
// a REAL link — mocking one would remove the exact setup requirement this
// feature exists to enforce.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/**
 * Builds a page with one real `link` leaf and leaves the editor sitting on
 * it — a section already exists (the identity blocks), so a fresh grid
 * section with the link is added beside them, and the newly added link is
 * the LAST `block-link` on the canvas.
 *
 * @param page - the editor page.
 */
async function buildLinkPage(
  page: Parameters<typeof addSection>[0],
): Promise<void> {
  await page.goto("/es/pages/new");
  await addSection(page, "1");
  // `addSection` deliberately leaves the pane on Options — see its own
  // TSDoc — so the empty place this helper targets next is not showing
  // until Items is pressed explicitly.
  await page.getByTestId("inspector-tab-items").click();
  await addBlock(page.getByTestId("inspector-empty-place").last(), {
    kind: "link",
  });
  await page.getByTestId("leaf-title").fill("A real link");
  await page.getByTestId("leaf-link").fill("https://example.com");
}

test("a real link cannot navigate or open a tab by default, and its block is selected instead", async ({
  page,
  context,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await buildLinkPage(page);

  const link = page.getByTestId("block-link").last();
  await expect(link).toBeVisible();

  // **`force: true` is load-bearing, not a shortcut.** `inert` removes the
  // element from hit-testing — a real click at these coordinates lands on
  // the non-inert ancestor `public-leaf` wraps it in, which is exactly the
  // mechanism this test exists to prove. Playwright's own actionability
  // check insists the resolved locator itself be the topmost hit target,
  // which an inert element structurally cannot be; `force` skips that
  // pre-check while still dispatching a real, trusted click at the link's
  // coordinates, so the browser's own hit-test — not Playwright's — decides
  // where it lands.
  const popup = await Promise.race([
    context.waitForEvent("page").then((p) => p),
    // eslint-disable-next-line playwright/no-force-option -- see comment above: `inert` removes the element from hit-testing, so it can never be the topmost target the rule's own check requires.
    link.click({ force: true }).then(() => null),
  ]);
  expect(popup, "the locked canvas must not open a tab").toBeNull();
  // `page.url()` also never left the editor.
  expect(page.url()).toContain("/pages/new");

  // The click landed as a selection instead: Options is showing this exact
  // leaf's own fields.
  await expect(page.getByTestId("leaf-link")).toBeVisible();
});

test("the toolbar switch makes that same link work while controls remain visible", async ({
  page,
  context,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await buildLinkPage(page);

  await page.getByTestId("interact-with-page").click();
  await expect(page.getByTestId("interact-with-page")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.getByTestId("block-link").last().click(),
  ]);
  expect(popup.url()).toContain("example.com");
  await popup.close();

  // The workbench itself never hid — this is the switch, not Preview.
  await expect(page.getByTestId("editor-save")).toBeVisible();
});

test("keyboard focus skips the locked link and reaches it once interaction is enabled", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await buildLinkPage(page);

  const link = page.getByTestId("block-link").last();
  // A real browser refuses to focus an `inert` element even when asked
  // directly — the fact jsdom cannot demonstrate, since it implements no
  // `inert` behaviour at all.
  await link.evaluate((el: HTMLElement) => el.focus());
  expect(
    await link.evaluate((el) => el === document.activeElement),
    "an inert link must not be focusable",
  ).toBe(false);

  await page.getByTestId("interact-with-page").click();
  await link.evaluate((el: HTMLElement) => el.focus());
  expect(
    await link.evaluate((el) => el === document.activeElement),
    "the same link must be focusable once interaction is on",
  ).toBe(true);
});

test("Preview makes the page interactive, and Show controls locks it again", async ({
  page,
  context,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await buildLinkPage(page);

  await page.getByTestId("hide-controls").click();
  await expect(page.getByTestId("editor-save")).toBeHidden();

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.getByTestId("block-link").last().click(),
  ]);
  expect(popup.url()).toContain("example.com");
  await popup.close();

  await page.getByTestId("show-controls").click();
  await expect(page.getByTestId("editor-save")).toBeVisible();

  const link = page.getByTestId("block-link").last();
  // `force: true` for the same reason the earlier lock test needs it: the
  // relocked link is `inert`, which removes it from hit-testing, so
  // Playwright's own actionability check can never see it as the topmost
  // target. Forcing still dispatches a real click at its coordinates.
  const relockedPopup = await Promise.race([
    context.waitForEvent("page").then((p) => p),
    // eslint-disable-next-line playwright/no-force-option -- see comment above.
    link.click({ force: true }).then(() => null),
  ]);
  expect(
    relockedPopup,
    "Show controls must reset interaction to locked",
  ).toBeNull();
});

// **THE MOTION HALF.** `MotionConfig reducedMotion="user"` is a name, not a
// guarantee — root rule 1 applies to a newly adopted tool, and the actors
// feature note says so plainly: the option is believed only once a real
// browser preference has been driven and read back. Two tests, and only one
// of them can be raced by a slow or fast machine.
test("the inspector's entrance settles to its final state in ordinary mode", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await page.getByTestId("select-page").click();
  const inspector = page.getByTestId("canvas-inspector");
  // Not a claim about the FIRST frame — that half is a race no fixed
  // deadline can make honest. What must hold, on any machine, is that the
  // entrance actually reaches its end state.
  await expect
    .poll(
      async () => inspector.evaluate((el) => getComputedStyle(el).opacity),
      { timeout: 2000 },
    )
    .toBe("1");
});

// **This test's own first draft asserted OPACITY was instant too, and a
// real browser refuted it.** Motion's own docs state the actual contract:
// `reducedMotion="user"` "automatically disables transform and layout
// animations... while preserving non-motion properties like opacity and
// backgroundColor" — confirmed here by sampling both across twenty animation
// frames under a real `prefers-reduced-motion: reduce` emulation: `transform`
// read `none` on every one of them, where `opacity` climbed from about 0.22
// to 1 over the same ~200ms it takes in ordinary mode. So only the SLIDE is
// what reduced motion promises to remove, never the fade — and that is the
// one half a fixed deadline cannot race, because there is nothing transient
// to catch: the rest position is meant to be there already, on the very
// first frame.
test("the inspector's entrance never slides under prefers-reduced-motion: reduce", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await page.getByTestId("select-page").click();
  const inspector = page.getByTestId("canvas-inspector");
  await expect(inspector).toBeVisible();
  // No poll: the transform is at rest from the first frame, or it never was.
  const transform = await inspector.evaluate(
    (el) => getComputedStyle(el).transform,
  );
  expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);

  // The fade itself is untouched by reduced motion — polled exactly as the
  // ordinary-mode test above does, since Motion preserves it on purpose.
  await expect
    .poll(
      async () => inspector.evaluate((el) => getComputedStyle(el).opacity),
      { timeout: 2000 },
    )
    .toBe("1");
});
