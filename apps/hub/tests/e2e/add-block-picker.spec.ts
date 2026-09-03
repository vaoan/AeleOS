import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addBlock, addSection, openPageAdd } from "./support/editor";

// WHAT THIS FILE PROVES.
//
// One `AddBlockPicker` replaces the flat `add-content`/`add-nested` pair and
// the sixteen `add-leaf-*`/`add-section` buttons. Its unit suite
// (`add-block-picker.test.tsx`) already proves the component in isolation,
// with a mocked `onAdd`; what only a real browser can prove is that it is
// actually REACHABLE at every scope this feature promises — a full
// container's own Items footer in particular, which is the exact control
// "the nesting looked deleted" bug removed — and that its preview draws the
// same thing the canvas does once chosen, through the real renderer on both
// sides.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("adds a layout from Page Items with no empty place visited first", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await openPageAdd(page);
  const before = await page.getByTestId("inspector-item-row").count();
  await addBlock(page, { mode: "grid" });
  await expect(page.getByTestId("inspector-item-row")).toHaveCount(before + 1);
});

test("still adds a nested container from a full two-place section's own Items footer", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await addSection(page, "2");
  await page.getByTestId("inspector-tab-items").click();
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    kind: "text",
  });
  await page.getByTestId("inspector-back").click();
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    kind: "text",
  });
  await page.getByTestId("inspector-back").click();

  // Both places are filled now — the exact shape that used to offer no way
  // in at all, since `add-nested` lived only on an empty place.
  await expect(page.getByTestId("inspector-empty-place")).toHaveCount(0);
  await expect(page.getByTestId("add-block")).toBeVisible();

  const childrenBefore = await page.getByTestId("inspector-item-row").count();
  await addBlock(page, { mode: "grid" });
  // **Adding a CONTAINER auto-enters it** — `addAt` selects what it just
  // added and switches to Items, exactly as choosing a layout anywhere else
  // in this editor does — so `inspector-item-row` here reads the new grid's
  // own two fresh empty places, not the parent section's. `inspector-back`
  // is what returns to the parent to see the count the parent actually
  // gained.
  await expect(page.getByTestId("inspector-item-row")).toHaveCount(2);
  await page.getByTestId("inspector-back").click();
  await expect(page.getByTestId("inspector-item-row")).toHaveCount(
    childrenBefore + 1,
  );
  const nested = page.getByTestId("inspector-item-row").last();
  await nested.getByTestId("inspector-item-open").click();
  await page.getByTestId("inspector-tab-options").click();
  // The new row is a CONTAINER's own card, not a leaf's — proof that what
  // landed was the layout option and not the content one.
  await expect(page.getByTestId("nested-card")).toBeVisible();
});

test("omits the layout group at the depth cap, with the at-limit sentence shown", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // Three levels of containers, the deepest `mayNest` admits: a section, a
  // container inside it, a container inside that.
  //
  // **Adding a CONTAINER auto-enters it.** `addAt`/`InspectorItems`'s own
  // `onAdd` both select what was just added and switch to Items the moment
  // it is a container — the same navigation choosing a layout anywhere else
  // in this editor already does — so no separate `inspector-item-open` click
  // is needed between one level and the next; each `addBlock` below already
  // leaves the inspector standing inside the container it just created.
  await addSection(page, "1");
  await page.getByTestId("inspector-tab-items").click();
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    mode: "grid",
  });
  // This container's own picker still offers layout — it sits at depth one.
  await expect(page.getByTestId("add-block").first()).toBeVisible();
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    mode: "grid",
  });

  // This is the container two levels down from the section — the deepest one
  // may sit, and the add already auto-entered it. Its own Items footer's
  // picker is the LAST `add-block` trigger in this scope: the footer renders
  // after this container's own (still-empty) places, each of which carries
  // its own trigger too.
  await page.getByTestId("add-block").last().click();
  const dialog = page.getByTestId("add-block-picker");
  await expect(dialog).toBeVisible();
  await expect(page.locator("[data-add-mode]")).toHaveCount(0);
  await expect(page.getByTestId("nesting-at-limit")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Escape closes the picker and adds nothing", async ({ page }) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await openPageAdd(page);
  const before = await page.getByTestId("inspector-item-row").count();
  await page.getByTestId("add-block").click();
  const dialog = page.getByTestId("add-block-picker");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("inspector-item-row")).toHaveCount(before);
});

test("an outside press closes the picker and adds nothing", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await openPageAdd(page);
  const before = await page.getByTestId("inspector-item-row").count();
  await page.getByTestId("add-block").click();
  const dialog = page.getByTestId("add-block-picker");
  await expect(dialog).toBeVisible();
  // The backdrop itself, not one of the option cards.
  await dialog.click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("inspector-item-row")).toHaveCount(before);
});

test("a text preview in the picker draws the same kind the canvas does after adding", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await addSection(page, "1");
  await page.getByTestId("inspector-tab-items").click();
  // The empty place's own trigger, not the footer's beside it — both exist
  // at once here, since a one-space section still starts with nothing in
  // its one place.
  await page
    .getByTestId("inspector-empty-place")
    .first()
    .getByTestId("add-block")
    .click();
  const dialog = page.getByTestId("add-block-picker");
  await expect(dialog).toBeVisible();
  const textOption = dialog.locator('[data-add-kind="text"]');
  await expect(textOption.getByTestId("public-leaf")).toHaveAttribute(
    "data-block-kind",
    "text",
  );
  await textOption.click();
  await expect(dialog).toBeHidden();

  // **Choosing auto-enters what was added.** `InspectorItems`'s own `onAdd`
  // selects the new leaf and switches to Options the moment it is not a
  // container, so its own fields — `leaf-kind` among them — are already
  // showing; no separate `inspector-item-open` click is needed or even
  // possible here, since Options draws fields rather than a list.
  await expect(page.getByTestId("leaf-kind")).toHaveValue("text");
});
