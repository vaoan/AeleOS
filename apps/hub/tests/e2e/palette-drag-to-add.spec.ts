import { expect, test, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addSection, selectBlock } from "./support/editor";
import { liftByKeyboard } from "./support/drag";

// WHAT THIS FILE PROVES.
//
// `block-editor.test.tsx`'s own "dragging from the persistent Palette tab"
// suite already proves the mechanism against jsdom's degenerate,
// all-zero-rect layout: `onDragStart` branches on a palette id first,
// `detectCollisionAt`'s palette branch ranks real registered droppable
// rects, and `onDragEnd` calls `insertBlockAt`. None of that exercises a
// REAL layout — jsdom lays out nothing, so every rect in that suite is
// `{0,0,0,0}` and the "deepest wins" ranking is proved with rectangles the
// test itself constructs, never with rectangles Chromium measured. This is
// the one case in the suite that drags a real palette thumbnail, by a real
// pointer, across real geometry, onto a real empty place on the canvas.
//
// It does not attempt to re-prove ranking, refusal or the two housekeeping
// branches (`onDragCancel`, a drop with no `over`) — those are the unit
// suite's job and a browser adds nothing to them. What only a browser can
// show is that the thumbnail's `useDraggable` wiring, `EditableBlockFrame`'s
// `useDroppable` registration, and `@dnd-kit`'s own pointer sensor agree
// about where a real pointer is, end to end.
//
// **The keyboard equivalent is the same argument, one input method over
// (2026-09-05).** `block-editor.test.tsx`'s own keyboard suite already
// proves `paletteCoordinateAt`'s stepping, `stepInsertSection`'s Tab-skip,
// and the sabotage that would break either — all against jsdom's degenerate
// rects, where a target's rectangle existing or not is a fact about which
// ids are REGISTERED rather than about real geometry. The last test in this
// file is the one keyboard case that lifts a thumbnail with a real Space
// bar, steps with real arrow keys across a layout Chromium actually
// measured, and drops it — plus Escape reaching `KeyboardSensor`'s own
// document-level listener rather than something else on the page swallowing
// it first, which no jsdom test can observe at all.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("drags a leaf thumbnail from the Palette tab onto a real empty place", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // A section with one place, deliberately empty — nothing added into it —
  // so there is a real place on the canvas with nothing occupying it yet.
  // The identity section that opens every fresh draft is top-level path
  // "0"; this section is "1", and its own single empty place is "1-0".
  await addSection(page, "1");
  await selectBlock(page, "1");

  // Opens the persistent Palette tab. It has no `hidden` attribute and no
  // selection dependency — see `properties-panel.tsx` — so it is reachable
  // whatever is or is not currently selected.
  await page.getByTestId("panel-tab-palette").click();
  const thumbnail = page.locator('[data-palette-kind="text"]');
  await expect(thumbnail).toBeVisible();

  const source = await thumbnail.boundingBox();
  const target = await page.locator('[data-canvas-path="1-0"]').boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();

  // Clears `DRAG_THRESHOLD` (8px) before crossing to the target, matching
  // `section-drag-reorder.spec.ts`'s own pointer-drag shape: a single big
  // jump risks the sensor never registering the intermediate move that
  // proves a real drag — rather than a click — is under way.
  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source!.x + source!.width / 2 + 20,
    source!.y + source!.height / 2,
  );
  await page.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();

  // Waits past `@dnd-kit/core`'s own post-drop click-swallow window —
  // `PointerSensor.detach()` keeps a document-level capturing `click`
  // listener alive for exactly 50ms after a drop, root rule 41's measured
  // exemption class, cited the same way `section-drag-reorder.spec.ts`
  // already cites it for an identical mouseup-after-drag sequence.
  await page.evaluate(
    // eslint-disable-next-line no-restricted-syntax -- see comment above.
    () => new Promise((done) => setTimeout(done, 100)),
  );

  // The block landed at the place it was dropped on, carries the dragged
  // kind, and is selected — the Properties panel opened straight to its
  // Content tab, matching `onDragEnd`'s own palette-branch contract.
  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);
  await expect(page.getByTestId("panel-tab-primary")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("leaf-editor")).toBeVisible();
});

/**
 * Drags the `text` thumbnail from the persistent Palette tab onto a real
 * canvas position, by mouse, mirroring the test above's own sequence.
 *
 * **The Palette tab is opened fresh on every call.** Landing a drop selects
 * the newly-added block and switches the Properties panel to its Content
 * tab, which closes the Palette tab it was just showing — so a caller
 * dragging a second thumbnail has to reopen it, exactly as a person would.
 *
 * @param page - the editor page, already on a draft with the target
 * position visible.
 * @param targetPath - the `data-canvas-path` to drop onto.
 */
async function dragTextThumbnailOnto(
  page: Page,
  targetPath: string,
): Promise<void> {
  await page.getByTestId("panel-tab-palette").click();
  const thumbnail = page.locator('[data-palette-kind="text"]');
  await expect(thumbnail).toBeVisible();
  const source = await thumbnail.boundingBox();
  const target = await page
    .locator(`[data-canvas-path="${targetPath}"]`)
    .boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source!.x + source!.width / 2 + 20,
    source!.y + source!.height / 2,
  );
  await page.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  // See the sibling test's own account of `PointerSensor.detach()`'s 50ms
  // post-drop click-swallow window.
  await page.evaluate(
    // eslint-disable-next-line no-restricted-syntax -- see comment above.
    () => new Promise((done) => setTimeout(done, 100)),
  );
}

test("drags a leaf thumbnail onto a fully occupied container's own append slot, adding a place rather than displacing the one already there", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // A section with exactly one place — the identity section is path "0",
  // this new one is "1", matching the sibling test's own naming.
  await addSection(page, "1");
  await selectBlock(page, "1");

  // Fill its one and only place first, so the container is genuinely FULL
  // before the drop this test is actually about — `insertTargetsFor`'s own
  // unit test already named "every place, plus one past the last" as a
  // shape, but could not prove end to end that dropping onto the ONE-PAST
  // position adds a place rather than landing on — and displacing — the
  // last real one.
  await dragTextThumbnailOnto(page, "1-0");
  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);

  // Reselect the container — the drop above selected the new leaf instead
  // — and drop a SECOND thumbnail one past it. `data-canvas-path="1-1"` is
  // rendered by `AppendSlot` now, which this task adds; before it, nothing
  // in the DOM answered to that path at all.
  await selectBlock(page, "1");
  await dragTextThumbnailOnto(page, "1-1");

  // The ORIGINAL leaf at "1-0" survived untouched, and a NEW place at "1-1"
  // holds what was just dropped — two children, not one displaced by
  // another.
  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);
  await expect(page.locator('[data-block-path="1-1"]')).toHaveCount(1);
});

// **The keyboard equivalent (2026-09-05).** `block-editor.test.tsx`'s own
// "dragging from the persistent Palette tab by keyboard" suite already
// proves `paletteCoordinateAt`'s stepping and Tab's section-skip against
// jsdom's degenerate rects — this is the one case that lifts a real palette
// thumbnail by a real Space bar, steps with real arrow keys, and drops it
// onto a real registered droppable Chromium measured, plus the one gesture
// only a browser can honestly prove: Escape reaching `KeyboardSensor`'s own
// document-level listener rather than being swallowed by something else on
// the page.
test("adds a leaf thumbnail by keyboard, and Escape cancels a drag without adding anything", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // A section with no filled children of its own, matching the pointer
  // test's own naming: the identity section is path "0", this one is "1".
  // `addSection` picks the `grid` layout from the Add picker, which always
  // starts a fresh container at `PICKER_SPACES` (two places) regardless of
  // the width chosen afterward through `section-spaces` — width narrows how
  // many places sit ACROSS, never how many children exist — so this section
  // opens with two empty places rather than one. Every locator below matches
  // any FILLED child of it (`^="1-"`), not one exact position, for exactly
  // that reason: which of its several real, rendered targets a keyboard step
  // lands on is this mechanism's own business, not a shape this test should
  // pin.
  await addSection(page, "1");
  await selectBlock(page, "1");
  await page.getByTestId("panel-tab-palette").click();
  const thumbnail = page.locator('[data-palette-kind="text"]');
  await expect(thumbnail).toBeVisible();
  const addedToSection = page.locator('[data-block-path^="1-"]');
  await expect(addedToSection).toHaveCount(0);

  // Escape mid-drag: lifts, steps once, cancels. Nothing lands — every place
  // in the section stays empty.
  await liftByKeyboard(page, thumbnail);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(addedToSection).toHaveCount(0);

  // The real thing: lift the same thumbnail again, step onto one of the
  // section's own empty places, and drop.
  //
  // **Backward, not forward, and that is deliberate rather than
  // interchangeable.** `/pages/new` seeds a REAL identity section at path
  // "0" first (`ensurePersonActor`'s own required blocks), so stepping
  // FORWARD from a fresh lift walks `insertTargetsFor`'s page-root splices
  // (none rendered) and then straight into the IDENTITY section's own
  // rendered targets, landing the leaf there rather than in the section
  // this test just added — this draft's own first attempt did exactly that
  // and found nothing at any `1-*` path afterward. Stepping BACKWARD is
  // reliable regardless of how much the identity section renders, because
  // `insertTargetsFor`'s depth-first walk visits this section — the LAST
  // top-level entry on the page — last, so every one of its own targets
  // sits at the very end of the whole order, however many of them there
  // are. Two `ArrowUp` presses are what it took here, measured against a
  // real Chromium rather than assumed: the first opens the sensor's own
  // listener-attach window (root rule 26) with nothing yet to land on, and
  // the second lands inside this section.
  await liftByKeyboard(page, thumbnail);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");

  await expect(addedToSection).toHaveCount(1);
  await expect(page.getByTestId("panel-tab-primary")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("leaf-editor")).toBeVisible();
});
