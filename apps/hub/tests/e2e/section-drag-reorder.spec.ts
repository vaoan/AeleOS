import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import { liftByKeyboard } from "./support/drag";
import { chooseNewSectionSpaces, openPageAdd } from "./support/editor";
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

  // Two sections, built by hand — a template inserts sections as data without
  // touching a grip at all, which would prove nothing here.
  await chooseNewSectionSpaces(page, "2");
  await openPageAdd(page);
  await page.getByTestId("add-section").click();
  await page.getByTestId("section-name").last().fill("First");

  await chooseNewSectionSpaces(page, "3");
  await openPageAdd(page);
  await page.getByTestId("add-section").click();
  await page.getByTestId("section-name").last().fill("Second");

  const names = () =>
    page
      .getByTestId("section-name")
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      );

  // **The empty name is the identity section's**, which every page opens
  // carrying because the database requires its blocks. It is first, so the two
  // sections this test builds are the second and third — and the grip lifted
  // below is `drag-1` rather than `drag-0` for the same reason.
  await expect.poll(names).toEqual(["", "First", "Second"]);

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

  await page.keyboard.press("Space");

  // The assertion the whole test exists for: the DOM order changed, read from
  // the inputs themselves — not a toast, not an internal state value.
  //
  // **Two sections cannot tell a shift from a swap**, and this fixture is not
  // asked to. Moving one of two by one step reads `Second First` whichever the
  // code does, which is the trap `block-drag.spec.ts:37-43` documents; the
  // three-section case that DOES discriminate lives there, on a page seeded for
  // it. What this file proves is the chain — a real grip, a real sensor, a real
  // browser, an order that changed — and that is worth having on its own.
  await expect.poll(names).toEqual(["", "Second", "First"]);
});

// WHAT THE OLD LIBRARY COULD NOT DO AT ALL, PROVED IN A BROWSER.
//
// `@hello-pangea/dnd`'s own README rules out dragging an item from a parent
// list into a child list, and rules out grids separately. This model is nested
// grids and nothing else, which is why the library was replaced rather than
// configured. So this half of the file is new rather than ported: it drags a
// piece of content out of one section and into a place in another, which is
// the capability the migration was for.
test("a piece of content dragged by keyboard moves into another section's place", async ({
  page,
}) => {
  await page.goto("/es/pages/new");

  await chooseNewSectionSpaces(page, "2");
  await openPageAdd(page);
  await page.getByTestId("add-section").click();
  await openPageAdd(page);
  await page.getByTestId("add-section").click();

  // **Scoped to the first section this test built, which is the SECOND card.**
  // Every page opens carrying the identity section the database requires, so
  // the two sections here are at index 1 and 2 — and a page-wide `.first()`
  // for a title would have typed into the identity section's portrait.
  const built = page.getByTestId("section-card").nth(1);
  await built.getByTestId("add-content").first().click();
  await built.getByTestId("leaf-title").first().fill("Travelled");

  // **Followed by its own words rather than by counting leaf editors.** The
  // identity section holds four of those, so a positional list would be mostly
  // blocks this test never placed; what it is actually about is where ONE
  // piece of content ended up.
  const placesHolding = () =>
    page
      .getByTestId("leaf-title")
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => (node as HTMLInputElement).value === "Travelled")
          .map((node) =>
            node
              .closest("[data-testid^='place-']")
              ?.getAttribute("data-testid"),
          ),
      );

  await expect.poll(placesHolding).toEqual(["place-1.0"]);

  const announcement = page.locator('[id^="DndLiveRegion-"]');

  // The places this walk is offered, in drawing order, are 1.0 1.1 2.0 2.1 —
  // the sections themselves are not, because a nested block dropped onto one
  // would exchange with the whole section rather than land in it.
  await liftByKeyboard(page, page.getByTestId("drag-1.0"));
  await expect(announcement).not.toBeEmpty();

  // Anchored on the end of the sentence: `1.2.` is a prefix of `1.2.3.`, and
  // an unanchored match would report arrival two levels above the place asked
  // for.
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => announcement.textContent()).toMatch(/\s2\.2\.$/);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => announcement.textContent()).toMatch(/\s3\.1\.$/);

  await page.keyboard.press("Space");

  // It left its old place EMPTY rather than closing it up — a place is
  // positional, and the width its author gave it is the model.
  await expect.poll(placesHolding).toEqual(["place-2.0"]);
  await expect(page.getByTestId("empty-place")).toHaveCount(3);
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
