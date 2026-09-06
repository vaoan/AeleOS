import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addSection, selectBlock } from "./support/editor";

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
