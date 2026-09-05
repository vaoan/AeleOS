import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import {
  addBlock,
  addSection,
  openPageAdd,
  selectBlock,
} from "./support/editor";

// WHAT THIS FILE PROVES.
//
// One `AddBlockPicker` replaces the flat `add-content`/`add-nested` pair and
// the sixteen `add-leaf-*`/`add-section` buttons. Its unit suite
// (`add-block-picker.test.tsx`) already proves the component in isolation,
// with a mocked `onAdd`; what only a real browser can prove is that it is
// actually REACHABLE at every scope this feature promises — a full
// container in particular, which is the exact case "the nesting looked
// deleted" bug removed — and that its preview draws the same thing the
// canvas does once chosen, through the real renderer on both sides.
//
// **Rewritten for the Properties panel (2026-09-04).** There is no Items
// list, no `inspector-item-row`, no `inspector-back` and no per-scope Add
// trigger any more — `add-block` is a single global trigger, portalled into
// the editor toolbar, that always targets whatever is currently selected
// (`domain/add-target.ts`'s `addTargetFor`). A test that used to visit a
// specific empty place through its own trigger now just selects the
// enclosing container (or relies on it already being selected from adding
// something into it) and calls `addBlock(page, choice)` directly.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("adds a layout from Page with nothing else selected first", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await openPageAdd(page);
  const before = await page.getByTestId("block-preview").count();
  await addBlock(page, { mode: "grid" });
  await expect(page.getByTestId("block-preview")).toHaveCount(before + 1);
});

test("still adds a nested container to a full two-place section", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await addSection(page, "2");
  // The section is selected; the single global Add targets it directly and
  // fills its first empty place. A leaf's own Add target is its PARENT, so
  // the second call still lands in the section's next empty place with no
  // reselection needed.
  await addBlock(page, { kind: "text" });
  await addBlock(page, { kind: "text" });

  // Both places are filled now — the exact shape that used to offer no way
  // in at all, since `add-nested` lived only on an empty place.
  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);
  await expect(page.locator('[data-block-path="1-1"]')).toHaveCount(1);
  await expect(page.getByTestId("add-block")).toBeVisible();

  // Reselect the section itself — the leaf just added is what is currently
  // selected — so the Add targets the section rather than that leaf's
  // parent (which happens to be the same section, but the point is to
  // exercise selecting the CONTAINER directly).
  const tray = page.getByTestId("block-preview").last();
  await tray.getByTestId("section-header").click();
  const childrenBefore = await page.locator('[data-canvas-path^="1-"]').count();
  await addBlock(page, { mode: "grid" });
  // Adding a CONTAINER selects it — this is the third, newly appended place,
  // proving a full container still admits one more.
  await expect(page.locator('[data-block-path="1-2"]')).toBeVisible();

  await tray.getByTestId("section-header").click();
  await expect(page.locator('[data-canvas-path^="1-"]')).toHaveCount(
    childrenBefore + 1,
  );

  await selectBlock(page, "1-2");
  // The new place is a CONTAINER's own card, not a leaf's — proof that what
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
  // **Adding a CONTAINER auto-selects it.** So no separate selection step is
  // needed between one level and the next; each `addBlock` below already
  // leaves the panel showing the container it just created.
  await addSection(page, "1");
  await addBlock(page, { mode: "grid" });

  // This container's own picker still offers layout — it sits at depth one.
  await page.getByTestId("add-block").click();
  const dialog = page.getByTestId("add-block-picker");
  await expect(dialog).toBeVisible();
  await expect(page.locator("[data-add-mode]").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await addBlock(page, { mode: "grid" });

  // This is the container two levels down from the section — the deepest one
  // may sit, and the add already auto-selected it.
  await page.getByTestId("add-block").click();
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
  const before = await page.getByTestId("block-preview").count();
  await page.getByTestId("add-block").click();
  const dialog = page.getByTestId("add-block-picker");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("block-preview")).toHaveCount(before);
});

test("an outside press closes the picker and adds nothing", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await openPageAdd(page);
  const before = await page.getByTestId("block-preview").count();
  await page.getByTestId("add-block").click();
  const dialog = page.getByTestId("add-block-picker");
  await expect(dialog).toBeVisible();
  // The backdrop itself, not one of the option cards.
  await dialog.click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("block-preview")).toHaveCount(before);
});

test("a text preview in the picker draws the same kind the canvas does after adding", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await addSection(page, "1");
  // The section is selected; there is exactly one `add-block` trigger to
  // reach, whatever the section's own shape.
  await page.getByTestId("add-block").click();
  const dialog = page.getByTestId("add-block-picker");
  await expect(dialog).toBeVisible();
  const textOption = dialog.locator('[data-add-kind="text"]');
  await expect(textOption.getByTestId("public-leaf")).toHaveAttribute(
    "data-block-kind",
    "text",
  );
  await textOption.click();
  await expect(dialog).toBeHidden();

  // **Choosing selects what was added.** Adding a leaf selects it and resets
  // the panel to its Content tab, where `leaf-kind` already lives.
  await expect(page.getByTestId("leaf-kind")).toHaveValue("text");
});
