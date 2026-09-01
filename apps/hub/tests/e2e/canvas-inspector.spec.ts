import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { openPageAdd } from "./support/editor";

// THE INSPECTOR OPENS WITH THE PAGE AND CLOSES WITHOUT DROPPING THE WORKBENCH
// TREE. Preview is still hide-controls. Empty canvas and Escape deselect.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("the page inspector is open on load, with identity still reachable", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await expect(page.getByTestId("canvas-inspector")).toBeVisible();
  await expect(page.getByTestId("editor-handle")).toBeVisible();
  await expect(page.getByTestId("theme-open")).toBeVisible();
  await expect(page.getByTestId("section-card")).toBeVisible();
});

test("Add does not unmount nested add-content on a section that already exists", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await openPageAdd(page);
  await page.getByTestId("add-section").click();
  await expect(page.getByTestId("add-content").last()).toBeVisible();
  await page.getByTestId("inspector-tab-add").click();
  await expect(page.getByTestId("add-section")).toBeVisible();
  await expect(page.getByTestId("add-content").first()).toBeAttached();
  await expect(page.getByTestId("add-content").first()).toBeHidden();
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
  await page.getByTestId("add-section").click();
  await page.getByTestId("inspector-tab-options").click();

  const card = page.getByTestId("section-card").last();
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
  await card.getByTestId("add-content").first().click();
  await expect(card.getByTestId("leaf-kind").first()).toBeVisible();
});

test("Preview still hides every chrome island, inspector included", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await expect(page.getByTestId("canvas-inspector")).toBeVisible();
  await page.getByTestId("hide-controls").click();
  await expect(page.getByTestId("canvas-inspector")).toBeHidden();
  await expect(page.getByTestId("select-page")).toBeHidden();
  await expect(page.getByTestId("block-preview").first()).toBeVisible();
});
