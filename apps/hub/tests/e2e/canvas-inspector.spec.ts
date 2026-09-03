import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addBlock, openPageAdd } from "./support/editor";

// THE INSPECTOR STARTS CLOSED AND DRILLS THROUGH ONE LEVEL AT A TIME.
// Preview is still hide-controls. Empty canvas and Escape deselect.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("the page inspector starts closed, then Page exposes identity in Options", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await expect(page.getByTestId("canvas-inspector")).toHaveCount(0);
  await page.getByTestId("select-page").click();
  await expect(page.getByTestId("canvas-inspector")).toBeVisible();
  await page.getByTestId("inspector-tab-options").click();
  await expect(page.getByTestId("editor-handle")).toBeVisible();
  await expect(page.getByTestId("theme-open")).toBeVisible();
});

test("Items enters one section without mounting its descendants in Options", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await openPageAdd(page);
  await addBlock(page, { mode: "grid" });
  await expect(page.getByTestId("inspector-empty-place")).toHaveCount(2);
  await page.getByTestId("inspector-tab-options").click();
  await expect(page.getByTestId("section-card")).toBeVisible();
  await expect(page.getByTestId("empty-place")).toHaveCount(0);
});

test("Page, nested containers, Back, breadcrumbs, and leaf Options form one path", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await openPageAdd(page);
  await addBlock(page, { mode: "grid" });

  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    mode: "grid",
  });
  await expect(page.getByTestId("inspector-breadcrumb")).toHaveCount(3);
  await page.getByTestId("inspector-back").click();
  await expect(page.getByTestId("inspector-empty-place")).toHaveCount(1);

  await addBlock(page.getByTestId("inspector-empty-place"), { kind: "text" });
  await expect(page.getByTestId("leaf-kind")).toBeVisible();
  await expect(page.getByTestId("inspector-tab-items")).toHaveCount(0);
  await expect(page.getByTestId("inspector-tab-options")).toHaveCount(0);

  await page.getByTestId("inspector-breadcrumb").first().click();
  expect(await page.getByTestId("inspector-item-row").count()).toBeGreaterThan(
    1,
  );
});

test("an empty positional place remains visible and can be filled", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await openPageAdd(page);
  await addBlock(page, { mode: "grid" });
  await expect(page.getByTestId("inspector-empty-place")).toHaveCount(2);

  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    kind: "text",
  });
  await page.getByTestId("leaf-title").fill("Filled");
  await page.getByTestId("inspector-back").click();

  await expect(page.getByTestId("inspector-empty-place")).toHaveCount(1);
  await expect(page.getByTestId("inspector-item-row")).toHaveCount(2);
});

test("a click owned by the empty canvas dismisses the inspector", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await page.getByTestId("select-page").click();
  await expect(page.getByTestId("canvas-inspector")).toBeVisible();

  await page
    .getByTestId("editor-canvas")
    .evaluate((canvas) => (canvas as HTMLElement).click());
  await expect(page.getByTestId("canvas-inspector")).toHaveCount(0);
});

test("Escape closes the inspector and leaves the live page", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await page.getByTestId("select-page").click();
  await expect(page.getByTestId("canvas-inspector")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("canvas-inspector")).toHaveCount(0);
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect(page.getByTestId("select-page")).toBeVisible();
});

test("Escape aimed at a field inside the inspector keeps the selection", async ({
  page,
}) => {
  // **A REGRESSION TEST, and the fault it reproduces was invisible to every
  // assertion in this file.** `SectionStylePopup` closes itself from a
  // bubble-phase `document` listener, and React had flushed that close before
  // a bubble-phase listener in `BlockEditor` ran — so `event.target` was
  // already detached and `target.closest('[data-testid="canvas-inspector"]')`
  // answered null for a field that had genuinely been inside it. Closing the
  // popup therefore deselected too, taking the whole workbench off screen.
  // The listener is on the capture phase now, which asks the question before
  // anything can remove the target.
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await openPageAdd(page);
  await addBlock(page, { mode: "grid" });
  await page.getByTestId("inspector-tab-options").click();

  const card = page.getByTestId("section-card");
  await card.getByTestId("section-style-open").click();
  await expect(page.getByTestId("section-style-panel")).toBeVisible();
  await page.keyboard.press("Escape");

  // The popup closed — so the Escape was delivered and acted on, which is
  // what stops this passing on a build where the key reached nothing at all.
  await expect(page.getByTestId("section-style-panel")).toBeHidden();
  await expect(page.getByTestId("canvas-inspector")).toBeVisible();

  // And the card is still where a person can use it. Asserting the card is
  // merely attached would pass against the off-screen copy this replaced,
  // which was laid out, `aria-hidden` and 1536px to the left of the viewport.
  await page.getByTestId("inspector-tab-items").click();
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    kind: "text",
  });
  await expect(page.getByTestId("leaf-kind")).toBeVisible();
});

test("Preview clears the selected inspector instead of pausing it", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await page.getByTestId("select-page").click();
  await expect(page.getByTestId("canvas-inspector")).toBeVisible();
  await page.getByTestId("hide-controls").click();
  await expect(page.getByTestId("canvas-inspector")).toHaveCount(0);
  await expect(page.getByTestId("select-page")).toBeHidden();
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  await page.getByTestId("show-controls").click();
  await expect(page.getByTestId("canvas-inspector")).toHaveCount(0);
  await expect(page.getByTestId("select-page")).toBeVisible();
});

test("the inspector closes itself directly from a nested leaf", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await openPageAdd(page);
  await addBlock(page, { mode: "grid" });
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    kind: "text",
  });
  await expect(page.getByTestId("leaf-kind")).toBeVisible();

  await page.getByTestId("inspector-close").click();

  await expect(page.getByTestId("canvas-inspector")).toHaveCount(0);
  await expect(page.getByTestId("editor-save")).toBeVisible();
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
});
