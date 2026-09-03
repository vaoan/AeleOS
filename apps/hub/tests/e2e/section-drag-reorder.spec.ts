import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import { liftByKeyboard } from "./support/drag";
import { addBlock, addSection, openPageAdd } from "./support/editor";
import {
  establishSharedSession,
  sharedStatePath,
} from "./support/shared-session";

/**
 * Clicks an `inspector-item-open` button and reads `leaf-title` back,
 * retrying the click until the value sticks.
 *
 * **Diagnosed, not guessed** — this is the same `next dev` Strict Mode
 * remount hazard `addSection` already documents for `section-spaces`: a
 * click that Playwright reports as successful can still land on a mount
 * about to be discarded, so the `selection` state it just set is thrown
 * away while the drag's own reorder (held outside that local state) survives
 * untouched. Observed directly, isolated from every other suspect —
 * `readonly` DOM state after the click showed the inspector fallen back to
 * its page-level view, `leaf-title` absent entirely — on about one run in
 * three; the same click driven with a fresh, non-shared sign-in session
 * never reproduced it, and repeating it against the file's own shared
 * session reproduced it three runs in three. Retrying the click until the
 * surviving mount is the one holding the selection is the established fix
 * for exactly this class of race, not a wider timeout or a blind wait.
 *
 * @param page - the editor page.
 * @param open - the `inspector-item-open` locator to click.
 * @param expected - the value `leaf-title` should read once entry sticks.
 */
async function enterAndReadTitle(
  page: Page,
  open: Locator,
  expected: string,
): Promise<void> {
  await expect
    .poll(async () => {
      await open.click();
      return page
        .getByTestId("leaf-title")
        .inputValue()
        .catch(() => null);
    })
    .toBe(expected);
}

// One sign-in for the whole file: both cases below drive their own fresh
// `/es/pages/new` draft and neither depends on the other, so they share
// one Clerk session rather than minting a ticket each — see
// `support/shared-session.ts`.
const STATE_PATH = sharedStatePath("section-drag-reorder");

// THE ONE INTERACTION NOBODY WOULD NOTICE FROM A SCREENSHOT.
//
// This file is the PORT of the `@hello-pangea/dnd` spec that preceded it, not
// a rewrite: what it asserted is what it asserts, and only the announcement
// selectors are re-derived from `@dnd-kit`'s own output. The reason it exists
// has not changed either.
//
// It drives a REAL drag, by KEYBOARD — focus the grip, Space to lift, an arrow
// to move, Space to drop — and that path is both more reliable in Playwright
// than synthesising pointer events, and worth having independently: with
// `block-slot.test.tsx` it is the proof that the grips in this editor are
// reachable and operable without a mouse.
//
// It found a real defect on its first run under the old library, before any
// threading was broken on purpose: the grip is a `<button>`, and
// `@hello-pangea/dnd` refused to start a drag whose source event targeted a
// tag it treats as interactive, so lifting a section did nothing at all,
// silently, for every input method. `@dnd-kit` has no such rule — a grip is
// whatever element carries `listeners` — so the prop that fixed it is gone
// along with the library, and what could break now is the threading itself.
// That is `block-slot.test.tsx`'s subject, driven through the real hook; this
// is the proof in a real browser, with real layout, that the whole chain works
// end to end.
//
// **The selectors changed and the assertions did not.** The grip's test id is
// its PATH — `drag-0` is the first section, `drag-0.1` the second place of it —
// because a block has no identity but where it sits, and a path-shaped id is
// what lets a spec name a grip three levels down without counting. The
// announcement is `@dnd-kit`'s own live region, `[id^="DndLiveRegion-"]`, and
// the wording is OURS rather than the library's: its defaults are hard-coded
// English built out of raw drag ids, so `dragAnnouncements` says "Movido sobre
// 2." instead, where the number is the place's one-based designation.
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

test("a section dragged by keyboard lands in its new position in the DOM", async ({
  page,
}) => {
  await page.goto("/es/pages/new");

  // Three sections, built by hand — a template inserts sections as data without
  // touching a grip at all, which would prove nothing here.
  await addSection(page, "2");
  await page.getByTestId("inspector-tab-options").click();
  await page.getByTestId("section-name").fill("First");

  await addSection(page, "3");
  await page.getByTestId("inspector-tab-options").click();
  await page.getByTestId("section-name").fill("Second");

  await addSection(page, "4");
  await page.getByTestId("inspector-tab-options").click();
  await page.getByTestId("section-name").fill("Third");
  await openPageAdd(page);

  const names = () => page.getByTestId("inspector-item-open").allTextContents();

  // The identity section is first, so the three sections this test builds are
  // the second through fourth — and the grip lifted
  // below is `drag-1` rather than `drag-0` for the same reason.
  await expect
    .poll(async () => (await names()).slice(1))
    .toEqual([
      expect.stringContaining("First"),
      expect.stringContaining("Second"),
      expect.stringContaining("Third"),
    ]);

  // Lift the first section's grip, move it down one, drop it. dnd-kit
  // announces each step to an `aria-live` region it manages itself; waiting on
  // that text — rather than a blind timeout — is what lets each key wait for
  // the previous one's state update and re-render to land before the next one
  // fires.
  const announcement = page.locator('[id^="DndLiveRegion-"]');

  // `liftByKeyboard` rather than a bare Space: the sensor's own keydown
  // listener arrives a macrotask after the drag starts, and the arrow pressed
  // inside that window is lost silently. `support/drag.ts` carries the whole
  // account.
  await liftByKeyboard(page, page.getByTestId("drag-1"));
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
    .poll(async () => (await names()).slice(1))
    .toEqual([
      expect.stringContaining("Second"),
      expect.stringContaining("Third"),
      expect.stringContaining("First"),
    ]);
  await expect(page.getByTestId("section-name")).toHaveCount(0);
});

// The recursive inspector offers one scope at a time. This replaces the old
// cross-level drag with a non-adjacent sibling exchange that includes an empty
// authored position and proves the grip never activates its row.
test("a nested sibling drag swaps visible places without entering the row", async ({
  page,
}) => {
  await page.goto("/es/pages/new");

  await addSection(page, "3");
  // `addSection` leaves the pane on Options — its own TSDoc says so — so
  // the section's empty places are not showing until Items is pressed.
  await page.getByTestId("inspector-tab-items").click();
  // **A width is not a capacity.** The picker's own layout options always
  // start a container at two children (`PICKER_SPACES` in
  // `add-block-picker.tsx`), and `section-spaces` reshapes only how many
  // places lay ACROSS — `setSpaces` never touches `children`. So a genuine
  // third, explicitly EMPTY place needs its own `add-place` press before
  // anything is filled, or this section would have only two rows to drag
  // between rather than the three — First, empty, Third — this test is
  // actually named for.
  await page.getByTestId("add-place").click();
  await expect(page.getByTestId("inspector-item-row")).toHaveCount(3);
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    kind: "text",
  });
  await page.getByTestId("leaf-title").fill("First");
  await page.getByTestId("inspector-back").click();
  await addBlock(page.getByTestId("inspector-empty-place").last(), {
    kind: "text",
  });
  await page.getByTestId("leaf-title").fill("Third");
  await page.getByTestId("inspector-back").click();

  const rows = () => page.getByTestId("inspector-item-row").allTextContents();
  await expect
    .poll(rows)
    .toEqual([
      expect.stringContaining("First"),
      expect.any(String),
      expect.stringContaining("Third"),
    ]);
  await expect(page.getByTestId("inspector-empty-place")).toHaveCount(1);
  await expect(page.getByTestId("drag-1")).toHaveCount(0);

  const announcement = page.locator('[id^="DndLiveRegion-"]');
  await liftByKeyboard(page, page.getByTestId("drag-1.0"));
  await expect(announcement).not.toBeEmpty();

  await page.keyboard.press("ArrowDown");
  await expect.poll(() => announcement.textContent()).toMatch(/\s2\.2\.$/);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => announcement.textContent()).toMatch(/\s2\.3\.$/);

  await page.keyboard.press("Space");

  await expect
    .poll(rows)
    .toEqual([
      expect.stringContaining("Third"),
      expect.any(String),
      expect.stringContaining("First"),
    ]);
  await expect(page.getByTestId("inspector-empty-place")).toHaveCount(1);
  await expect(page.getByTestId("leaf-editor")).toHaveCount(0);

  await enterAndReadTitle(
    page,
    page.getByTestId("inspector-item-open").last(),
    "First",
  );
});

test("a pointer drag between sibling rows does not activate either row", async ({
  page,
}) => {
  await page.goto("/es/pages/new");
  await addSection(page, "2");
  // Same as above: Items must be pressed before an empty place shows.
  await page.getByTestId("inspector-tab-items").click();
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    kind: "text",
  });
  await page.getByTestId("leaf-title").fill("Left");
  await page.getByTestId("inspector-back").click();
  await addBlock(page.getByTestId("inspector-empty-place"), { kind: "text" });
  await page.getByTestId("leaf-title").fill("Right");
  await page.getByTestId("inspector-back").click();

  const source = await page.getByTestId("drag-1.0").boundingBox();
  const target = await page.getByTestId("place-1.1").boundingBox();
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
  // window is silently lost too, whoever it targets. That is exactly what
  // this test's own `inspector-item-open` clicks below were racing:
  // diagnosed by isolating every other suspect (a fresh, non-shared sign-in
  // reproduced nothing; retrying the click itself still failed inside a
  // 5-second poll on some runs, which a one-shot swallow could not explain
  // on its own). Waiting past dnd-kit's own constant, margin included, is not
  // a guess about machine speed.
  await page.evaluate(
    // eslint-disable-next-line no-restricted-syntax -- see comment above.
    () => new Promise((done) => setTimeout(done, 100)),
  );

  await expect
    .poll(() => page.getByTestId("inspector-item-row").allTextContents())
    .toEqual([
      expect.stringContaining("Right"),
      expect.stringContaining("Left"),
    ]);
  await expect(page.getByTestId("leaf-editor")).toHaveCount(0);
  await expect(page.getByTestId("canvas-inspector")).toBeVisible();

  // The pointer sequence itself did not open either row. A later, independent
  // click must still work; suppressing that click would turn drag protection
  // into a two-click row.
  await enterAndReadTitle(
    page,
    page.getByTestId("inspector-item-open").first(),
    "Right",
  );
  await page.getByTestId("inspector-back").click();
  await enterAndReadTitle(
    page,
    page.getByTestId("inspector-item-open").last(),
    "Left",
  );
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
//   swap on an occupied place ...... the nested-sibling case above, which keeps
//                                    the non-adjacent fixture the trap needs
//   section reorder ................ the first case above, on three sections
//   pointer geometry against a REAL
//     layout engine ................ the pointer case above; this is the only
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
