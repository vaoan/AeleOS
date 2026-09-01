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
  await expect(page.getByTestId("add-content").last()).toBeVisible();
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
