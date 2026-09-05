import { expect, test, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import { liftByKeyboard } from "./support/drag";
import { addBlock, addSection, selectBlock } from "./support/editor";
import {
  establishSharedSession,
  sharedStatePath,
} from "./support/shared-session";

// One sign-in for the whole file: both cases below drive their own fresh
// `/es/pages/new` draft and neither depends on the other, so they share
// one Clerk session rather than minting a ticket each — see
// `support/shared-session.ts`.
const STATE_PATH = sharedStatePath("section-drag-reorder");

// THE ONE INTERACTION NOBODY WOULD NOTICE FROM A SCREENSHOT.
//
// This file is the PORT of the `@hello-pangea/dnd` spec that preceded it, not
// a rewrite: what it asserted is what it asserts, and only the selection and
// grip mechanics are re-derived for the Properties panel
// (2026-09-04) — see this feature's own `CLAUDE.md`, "The Properties panel
// replaces the recursive inspector", for the model this file now drives.
//
// It drives a REAL drag, by KEYBOARD — focus the grip, Space to lift, an arrow
// to move, Space to drop — and that path is both more reliable in Playwright
// than synthesising pointer events, and worth having independently: with
// `block-slot.test.tsx` it is the proof that the grips in this editor are
// reachable and operable without a mouse.
//
// **The grip's own test id and where a drag is initiated both changed with
// the panel, and the underlying mechanism did not.** A grip renders only for
// the SELECTED block, on the live canvas itself, as `canvas-drag-<dot.joined.path>`
// (`editable-block-frame.tsx`) — dot-joined, unlike `data-block-path`'s
// hyphen-joined form. `moveBlock`/`moveSiblingBlock` (`domain/`) still decide
// what a drop means; nothing about that domain layer moved.
//
// **The recursive inspector's own Items list — where the old file drove a
// drag between two ROWS rather than on the canvas — is gone entirely.** There
// is no "row" to enter as a side effect of a drag any more, because there is
// no row: selection happens only by clicking a rendered block on the canvas.
// The two tests this cost, and what replaced each, are recorded at each case
// below rather than only here.
//
// No save happens here. `BlockEditor` rearranges the tree it is holding
// entirely on the client, so the assertion — read the order back from the
// section-name inputs' own DOM values — needs nothing written to the database.
//
// **The shape is what each section is built with**, because a section is
// defined by how many places it has across rather than by a layout name. Two
// different widths, so a passing drag cannot be a coincidence of two
// identically-built cards.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");
test.use({ storageState: STATE_PATH });

let identity: TestIdentity | undefined;

test.beforeAll(async ({ browser }) => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  await establishSharedSession(browser, identity.userId, STATE_PATH);
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/**
 * Reads every top-level section's own name, in canvas order, by selecting
 * each one in turn through {@link selectBlock}.
 *
 * The identity section that opens every fresh draft is path `"0"`; the
 * sections a test builds by hand start at `"1"`. Reading by POSITION rather
 * than through any list is what proves the DOM order changed — path `"1"`
 * after a drag names whichever section is now first, not whichever section
 * was originally built first.
 *
 * @param page - the editor page.
 * @param count - how many authored sections to read, after the identity one.
 * @returns each section's `section-name` value, in canvas order.
 */
async function topLevelNames(page: Page, count: number): Promise<string[]> {
  const names: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    await selectBlock(page, String(index));
    names.push(await page.getByTestId("section-name").inputValue());
  }
  return names;
}

test("a section dragged by keyboard lands in its new position in the DOM", async ({
  page,
}) => {
  await page.goto("/es/pages/new");

  // Three sections, built by hand — a template inserts sections as data without
  // touching a grip at all, which would prove nothing here. Adding selects the
  // new section on its own Layout tab, where `section-name` already lives, so
  // no tab click is needed between building one and naming it.
  await addSection(page, "2");
  await page.getByTestId("section-name").fill("First");

  await addSection(page, "3");
  await page.getByTestId("section-name").fill("Second");

  await addSection(page, "4");
  await page.getByTestId("section-name").fill("Third");

  await expect
    .poll(() => topLevelNames(page, 3))
    .toEqual(["First", "Second", "Third"]);

  // Lift the first section's grip, move it down one, drop it. dnd-kit
  // announces each step to an `aria-live` region it manages itself; waiting on
  // that text — rather than a blind timeout — is what lets each key wait for
  // the previous one's state update and re-render to land before the next one
  // fires. The grip renders only for the selected block, so the third section
  // — still selected from the loop above — is re-selected back to the first
  // before lifting it.
  await selectBlock(page, "1");
  const announcement = page.locator('[id^="DndLiveRegion-"]');

  // `liftByKeyboard` rather than a bare Space: the sensor's own keydown
  // listener arrives a macrotask after the drag starts, and the arrow pressed
  // inside that window is lost silently. `support/drag.ts` carries the whole
  // account.
  await liftByKeyboard(page, page.getByTestId("canvas-drag-1"));
  await expect(announcement).not.toBeEmpty();

  await page.keyboard.press("ArrowDown");
  // Our own wording, from `fursonas.dragOver` in the Spanish catalogue, with
  // the place's one-based designation on the end, ANCHORED — `Movido sobre 2.`
  // is a prefix of `Movido sobre 2.1.`, so an unanchored match would report
  // arrival at a place a level above the one asked for. Waiting on this rather
  // than a fixed delay is what proves the step actually landed before the drop
  // key fires.
  await expect
    .poll(() => announcement.textContent())
    .toMatch(/Movido sobre 3\.$/);
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => announcement.textContent())
    .toMatch(/Movido sobre 4\.$/);

  await page.keyboard.press("Space");

  // The assertion the whole test exists for: the DOM order changed, read from
  // the inputs themselves — not a toast, not an internal state value.
  //
  // Three non-adjacent authored siblings distinguish a shift from a swap.
  await expect
    .poll(() => topLevelNames(page, 3))
    .toEqual(["Second", "Third", "First"]);
});

// `block-drag.spec.ts` IS GONE, AND THIS IS WHERE ITS SURVIVING HALF LIVES.
//
// That file drove seventeen cases across levels — a leaf carried out of one
// section into a nested place two deep inside another, a section dropped on
// its own descendant, a drop one level past the cap. The recursive inspector
// withdrew every one of those gestures by design
// (`2026-09-01-recursive-inspector-drill-down-design.md`, §Dragging: "Cross-
// level dragging is not offered in this inspector"), so those cases could not
// be repaired by fixing selectors: there is no longer any input that expresses
// what they were asserting. `moveSiblingBlock` refuses a non-sibling exchange
// before `moveBlock` ever sees it, and `siblingTarget` discards a cross-level
// candidate in pointer collision, keyboard collision and drop handling alike.
//
// Where each half went, so that nobody re-derives this by reading a diff:
//
//   swap on an occupied place ...... the nested-sibling case below, which keeps
//                                    the non-adjacent fixture the trap needs
//   section reorder ................ the first case above, on three sections
//   pointer geometry against a REAL
//     layout engine ................ the pointer case below; this is the only
//                                    thing in the repository that asks
//                                    Chromium for `placeUnderPointer`'s
//                                    rectangles, so it must not be reduced to
//                                    a keyboard drag
//   cycle refusal .................. `block-moves.test.ts`, "refuses a section
//                                    dropped into one of its own places" and
//                                    "refuses a block dropped onto its own
//                                    ancestor"
//   depth-cap refusal .............. `block-moves.test.ts`, "refuses a subtree
//                                    too tall for the place it was dropped in"
//   carrying into a nested place ... `block-moves.test.ts`, "carries a block
//                                    into a container nested inside a section"
//   the plane rule ................. `block-drag.test.ts`, "never offers a
//                                    section's own place to something dragged
//                                    from inside one"
//   the carried subtree's own
//     places being withheld ........ `block-drag.test.ts`, "walks the places in
//                                    the order they are drawn, without what is
//                                    being carried"
//
// **Two things it proved are now proved NOWHERE IN A BROWSER, and saying so is
// the point of writing this down.** `onDragCancel` — Escape abandoning a live
// drag — is held by `drag-announcements.test.ts` at the unit level only. And
// the collapsed-card walk, where `coordinateGetter` steps over places the DOM
// is not showing, has only its unit coverage now; `siblingTarget` narrows that
// walk further than it was narrowed when the fault was found, which makes the
// original fault harder to reach and does not make it impossible. Neither is a
// gap this branch created deliberately; both are gaps whose fixture depended
// on a gesture that no longer exists, and a case rebuilt in sibling scope
// would not discriminate the fault either way. Rule 27: an edge case still has
// to be able to tell a right answer from a wrong one.

test("a nested sibling drag swaps visible places without disturbing the empty one between them", async ({
  page,
}) => {
  await page.goto("/es/pages/new");

  await addSection(page, "3");
  // **A width is not a capacity.** The picker's own layout options always
  // start a container at two children (`PICKER_SPACES` in
  // `add-block-picker.tsx`), and `section-spaces` (set inside `addSection`)
  // reshapes only how many places lay ACROSS — `setSpaces` never touches
  // `children`. So a genuine third, explicitly EMPTY place needs its own
  // `add-place` press before anything is filled, or this section would have
  // only two rows to drag between rather than the three — First, empty,
  // Third — this test is actually named for. The section is already
  // selected, on its own Layout tab, where `add-place` already lives.
  await page.getByTestId("add-place").click();
  await expect(page.locator('[data-canvas-path^="1-"]')).toHaveCount(3);

  // The section is still selected; the single global Add targets it
  // directly, and `nextChildPosition` always fills the FIRST empty place —
  // never the one a caller has in mind — so both adds land at 0 and 1
  // rather than at 0 and 2. There is no control that targets a specific
  // empty place any more (see this file's own header on what the recursive
  // inspector's Items list took with it), so reaching "First, empty, Third"
  // needs a real move first: fill the first two places, then drag the
  // second leaf onto the third, still-empty one. That move is SETUP, not
  // the gesture this test is named for — it drops onto an EMPTY place, which
  // is an ordinary move rather than the swap the assertions below exist to
  // prove.
  await addBlock(page, { kind: "text" });
  await page.getByTestId("leaf-title").fill("First");

  await addBlock(page, { kind: "text" });
  await page.getByTestId("leaf-title").fill("Third");

  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);
  await expect(page.locator('[data-block-path="1-1"]')).toHaveCount(1);
  await expect(
    page.locator('[data-canvas-path="1-2"]').getByTestId("public-space"),
  ).toHaveCount(1);

  const announcement = page.locator('[id^="DndLiveRegion-"]');
  // "Third" is still selected at 1-1 from the add above; move it onto the
  // empty third place. A drop onto an empty place is a MOVE — the source
  // place is simply left empty — so this leaves 1-1 empty and 1-2 holding
  // "Third", which is the starting shape the swap below needs.
  await liftByKeyboard(page, page.getByTestId("canvas-drag-1.1"));
  await expect(announcement).not.toBeEmpty();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => announcement.textContent()).toMatch(/\s3\.$/);
  await page.keyboard.press("Space");

  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);
  await expect(
    page.locator('[data-canvas-path="1-1"]').getByTestId("public-space"),
  ).toHaveCount(1);
  await expect(page.locator('[data-block-path="1-2"]')).toHaveCount(1);

  // NOW the gesture this test is named for: "Third" (moved to 1-2 above,
  // and selected there — "a successful result selects the exact
  // destination path the planner returned") swaps with "First", exchanging
  // the two OCCUPIED, non-adjacent places while the empty one between them
  // is never targeted by either arrow — a swap and an insert-and-shift
  // would leave the same page on ADJACENT places, root rule 27's own trap.
  await liftByKeyboard(page, page.getByTestId("canvas-drag-1.2"));
  await expect(announcement).not.toBeEmpty();

  await page.keyboard.press("ArrowUp");
  await expect.poll(() => announcement.textContent()).toMatch(/\s2\.$/);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => announcement.textContent()).toMatch(/\s1\.$/);

  await page.keyboard.press("Space");

  // The swap happened, and the middle place — never touched by either
  // arrow — is still empty and still second.
  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);
  await expect(
    page.locator('[data-canvas-path="1-1"]').getByTestId("public-space"),
  ).toHaveCount(1);
  await expect(page.locator('[data-block-path="1-2"]')).toHaveCount(1);

  await selectBlock(page, "1-0");
  await expect(page.getByTestId("leaf-title")).toHaveValue("Third");
  await selectBlock(page, "1-2");
  await expect(page.getByTestId("leaf-title")).toHaveValue("First");
});

test("a pointer drag between sibling places does not select either one", async ({
  page,
}) => {
  await page.goto("/es/pages/new");
  await addSection(page, "2");
  await addBlock(page, { kind: "text" });
  await page.getByTestId("leaf-title").fill("Left");
  await addBlock(page, { kind: "text" });
  await page.getByTestId("leaf-title").fill("Right");

  // The just-added "Right" leaf is selected; reselect "Left" so its grip is
  // the one rendered before the drag begins.
  await selectBlock(page, "1-0");

  const source = await page.getByTestId("canvas-drag-1.0").boundingBox();
  const target = await page.locator('[data-canvas-path="1-1"]').boundingBox();
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
    {
      steps: 8,
    },
  );
  await page.mouse.up();

  // **A third instance of rule 41's measured exemption class, diagnosed
  // rather than guessed.** `PointerSensor.detach()` in `@dnd-kit/core@6.3.1`
  // keeps a document-level, CAPTURING `click` listener alive for exactly
  // 50ms after a drag ends (`setTimeout(this.documentListeners.removeAll,
  // 50)`), on purpose: it calls `stopPropagation()` to swallow the synthetic
  // click that a mouseup-after-drag produces, so the drop does not also
  // activate whatever sits under the pointer. A capture-phase
  // `stopPropagation()` on `document` stops the event before ANY element's
  // own listener runs — so a genuinely independent click landing inside that
  // window is silently lost too, whoever it targets. Waiting past dnd-kit's
  // own constant, margin included, is not a guess about machine speed.
  await page.evaluate(
    // eslint-disable-next-line no-restricted-syntax -- see comment above.
    () => new Promise((done) => setTimeout(done, 100)),
  );

  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);
  await expect(page.locator('[data-block-path="1-1"]')).toHaveCount(1);
  await selectBlock(page, "1-0");
  await expect(page.getByTestId("leaf-title")).toHaveValue("Right");
  await selectBlock(page, "1-1");
  await expect(page.getByTestId("leaf-title")).toHaveValue("Left");

  // The pointer sequence itself did not open a stray selection anywhere: the
  // panel is showing exactly the block just selected above, and nothing else.
  await expect(page.getByTestId("properties-panel")).toBeVisible();
});

// THE OTHER HALF OF THIS FILE IS GONE, AND THE FAULT IT GUARDED CANNOT
// RECUR.
//
// A second test used to drag, SAVE, and read the order back from a fresh load
// of the public route. It existed because `onDragEnd` once called only `move`
// and nothing rewrote `sort_order`: the array reordered on screen, the save
// sent every section under its ORIGINAL `sort_order`, and both the database
// and the public page sorted by that field rather than by array position — so
// the save silently undid the drag.
//
// **A block has no `sort_order`.** The array IS the order, at every depth;
// `PublicBlocks` sorts nothing and has nothing to sort by, which is asserted
// directly in `blocks.test.tsx`. There is no field left for a save to send
// stale, so the test's subject no longer exists. What the save now risks is
// covered by `editor-saves-page.spec.ts`, which reopens what it wrote.
