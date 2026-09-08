import type { Page } from "@playwright/test";
import { expect, test } from "./support/auto-cleanup";
import {
  createTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addBlock, addSection, selectBlock } from "./support/editor";
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
//
// **Three closing-sweep cases (2026-09-06), each proving something the
// tasks above deliberately deferred to "a later task" rather than an
// oversight.** Task 6 proved the append slot by pointer only, onto a
// container with a SINGLE existing place; the keyboard equivalent onto a
// FULLY PACKED container is below. Task 1's own domain-level finding —
// that a container-kind item past the depth cap never reaches the real
// collision pipeline at all, because `insertTargetsFor` refuses it before
// offering it as a target — is proved here in a real browser, by pointer
// (an absence of highlight, not a refusal banner: nothing was ever
// offered, so nothing is ever refused) and by keyboard (stepping can never
// land there, because `insertTargetsRef` — shared between both input
// methods — never contains it).

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
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

/**
 * Drags the `text` thumbnail from the Palette tab onto a real canvas
 * position by KEYBOARD — lift, step backward twice, drop — mirroring the
 * sibling pointer helper's own sequence above.
 *
 * **Backward, and exactly two `ArrowUp` presses, for the identical reason
 * the sibling keyboard test above already measured.** `insertTargetsFor`'s
 * depth-first walk visits the page's LAST top-level section last, so its
 * own targets sit at the very end of the whole order regardless of how
 * much the identity section renders — and two presses is what a real
 * Chromium needed there to land inside it reliably, the first opening the
 * sensor's own listener-attach window (root rule 26) with nothing yet to
 * land on.
 *
 * @param page - the editor page.
 */
async function liftStepDropByKeyboard(page: Page): Promise<void> {
  const thumbnail = page.locator('[data-palette-kind="text"]');
  await expect(thumbnail).toBeVisible();
  await liftByKeyboard(page, thumbnail);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
}

test("adds a leaf thumbnail by keyboard onto a fully occupied container's own append slot, adding a place rather than displacing the one already there", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // A section with exactly ONE place — the identity section is path "0",
  // this new one is "1", matching the pointer version's own naming.
  await addSection(page, "1");
  await selectBlock(page, "1");

  // Fill its one and only place first, by POINTER, so the container is
  // genuinely FULL before the KEYBOARD drop this test is actually about —
  // Task 6's own targeted case proved the append slot is reachable by
  // pointer onto exactly this shape; this is the keyboard equivalent Task 7
  // deferred, proving arrow-key stepping only on ORDINARY (not fully
  // packed) targets.
  await dragTextThumbnailOnto(page, "1-0");
  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);

  await page.getByTestId("panel-tab-palette").click();
  await liftStepDropByKeyboard(page);

  // Whichever of the container's two remaining targets the keyboard
  // landed on — before the existing leaf ("1-0"), or its own trailing
  // append slot ("1-1") — both are ordinary splice-inserts against a
  // container with no null left in it: `insertBlockAt` only ever splices,
  // never overwrites, so the original leaf survives either way and the
  // container simply grows by one. This deliberately does not pin WHICH of
  // the two was chosen — see root rule 27's own diagnostic, "name the
  // wrong behaviour a fixture excludes": the wrong behaviour this case
  // excludes is "the keyboard cannot reach a target here at all, because
  // the container is full" and "a keyboard drop into a full container
  // displaces what was already there" — and this fixture tells both apart
  // from the right one, since neither would leave the original leaf intact
  // alongside a second block.
  const addedToSection = page.locator('[data-block-path^="1-"]');
  await expect(addedToSection).toHaveCount(2);
});

test("shows no highlight for a container-kind drag past the depth cap, while a shallower target still lights up", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // Section "1" > nested container "1-0" > nested container "1-0-0" —
  // three containers deep, which `mayNest` still admits
  // (`path.length <= MAX_DEPTH`, 3). A container's own places INSIDE
  // "1-0-0" would sit at a FOURTH level, which `insertTargetsFor`
  // (`domain/palette-targets.ts`) refuses to offer for a container-kind
  // item — the exact domain-level finding `block-editor.test.tsx`'s own
  // comment on this case already names as unreachable through the real
  // collision pipeline any other way. Neither `addBlock` call below needs
  // a prior `selectBlock`: the palette implies no target of its own, so
  // each call names its own destination container path directly.
  await addSection(page, "2");
  await addBlock(page, { mode: "grid" }, "1");
  await addBlock(page, { mode: "grid" }, "1-0");

  await page.getByTestId("panel-tab-palette").click();
  const thumbnail = page.locator('[data-palette-mode="grid"]');
  await expect(thumbnail).toBeVisible();
  await thumbnail.scrollIntoViewIfNeeded();
  const source = await thumbnail.boundingBox();
  expect(source).not.toBeNull();

  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  );
  await page.mouse.down();
  // Clears `DRAG_THRESHOLD` so the sensor actually activates and
  // `insertTargetsRef` is populated — nothing is highlighted before this.
  await page.mouse.move(
    source!.x + source!.width / 2 + 20,
    source!.y + source!.height / 2,
  );

  // `data-canvas-drop="place"` is set from `editor.insertTargets`
  // MEMBERSHIP alone (`editable-block-frame.tsx`) — constant for the whole
  // drag, independent of where the pointer currently sits — so this reads
  // correctly regardless of the pointer's exact position at this instant.
  // The innermost container's own two places never appear in that list for
  // a container-kind item: no highlight, for the entire drag.
  await expect(
    page.locator('[data-canvas-path="1-0-0-0"]'),
  ).not.toHaveAttribute("data-canvas-drop", "place");
  await expect(
    page.locator('[data-canvas-path="1-0-0-1"]'),
  ).not.toHaveAttribute("data-canvas-drop", "place");

  // A shallower target, one level up inside "1-0" itself, still admits a
  // nested container (`mayNest([1,0,0])` holds — a new container there
  // would sit at path length 3, still within the cap) — so its own
  // still-empty place lights up during the exact same drag.
  await expect(page.locator('[data-canvas-path="1-0-1"]')).toHaveAttribute(
    "data-canvas-drop",
    "place",
  );

  // Ends the drag with nothing under the pointer, so nothing is inserted —
  // this case is about what lights up mid-drag, not about a drop.
  await page.mouse.move(9999, 9999);
  await page.mouse.up();
  await expect(page.locator('[data-canvas-path="1-0-0-0"]')).toHaveCount(1);
  await expect(page.locator('[data-block-path^="1-0-0-"]')).toHaveCount(0);
});

test("a container-kind keyboard drag never lands inside a container already at the depth cap", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // The identical three-deep tree the pointer case above builds: section
  // "1" > nested container "1-0" > nested container "1-0-0".
  await addSection(page, "2");
  await addBlock(page, { mode: "grid" }, "1");
  await addBlock(page, { mode: "grid" }, "1-0");

  // Each `addBlock` above lands on an EXISTING null place rather than an
  // append slot (`firstOpenPlace`'s own contract), which `insertAt` inserts
  // BEFORE — growing its target container by one rather than filling the
  // null in place (`support/editor.ts`'s own `firstOpenPlace`/
  // `dragPaletteOnto` account). So "1-0" already carries THREE direct
  // children before this test's own drag — the nested container "1-0-0" at
  // index 0, plus the two starting places `newContainer(mode, 2)` gave
  // "1-0" itself, both shifted one index later — never the two this test
  // originally assumed. Counted below rather than hard-coded, since the
  // exact number is an artefact of that growth arithmetic and not a fact
  // worth pinning by itself.
  const directChildrenPathLength3 = (): Promise<number> =>
    page
      .locator('[data-canvas-path^="1-0-"]')
      .evaluateAll(
        (elements) =>
          elements.filter(
            (element) =>
              element.getAttribute("data-canvas-path")?.split("-").length === 3,
          ).length,
      );
  const directChildrenBefore = await directChildrenPathLength3();

  await page.getByTestId("panel-tab-palette").click();
  const thumbnail = page.locator('[data-palette-mode="grid"]');
  await expect(thumbnail).toBeVisible();
  await liftByKeyboard(page, thumbnail);

  // **Exactly two `ArrowUp` presses lands on one of "1-0"'s OWN last two
  // splices — never inside "1-0-0" — and that is guaranteed by the domain
  // order, not merely likely.** `insertTargetsRef` (shared with the pointer
  // branch above, and therefore already proved not to contain anything
  // inside "1-0-0") ends, for this tree, with "1-0"'s own splices in
  // ascending order, the append slot last. Backward from a fresh lift
  // reaches the LAST of those on the first EFFECTIVE press; a real Chromium
  // can lose exactly one press to the sensor's own listener-attach window
  // (root rule 26), so two presses reach the last splice or the one before
  // it — never the FIRST, which is the only one that would insert BEFORE
  // the existing nested container at index 0 and shift its own path. Both
  // reachable targets insert AFTER it instead, so "1-0-0" keeps its path
  // and its contents untouched either way.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");

  // "1-0-0" — the container at the depth cap — is untouched: its own two
  // starting empty places still carry no content, at the SAME paths, which
  // could only stay true if nothing was ever inserted ahead of it inside
  // "1-0".
  await expect(page.locator('[data-canvas-path="1-0-0-0"]')).toHaveCount(1);
  await expect(page.locator('[data-canvas-path="1-0-0-1"]')).toHaveCount(1);
  await expect(page.locator('[data-block-path^="1-0-0-"]')).toHaveCount(0);

  // And something WAS added — the drag genuinely landed and dropped, rather
  // than silently doing nothing — as one more direct child of "1-0", beside
  // the untouched nested container. Asserted RELATIVE to the count taken
  // before the drag, rather than as a second hard-coded absolute, for the
  // same reason the count above is computed rather than assumed.
  const directChildrenAfter = await directChildrenPathLength3();
  expect(directChildrenAfter).toBe(directChildrenBefore + 1);
});
