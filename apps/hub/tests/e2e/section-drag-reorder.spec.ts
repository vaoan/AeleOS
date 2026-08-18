import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";

// THE ONE INTERACTION NOBODY WOULD NOTICE FROM A SCREENSHOT.
//
// section-editor.test.tsx's "offers a drag handle for each section" counts
// buttons by aria-label through a fully mocked `@hello-pangea/dnd` — it would
// pass even if `dragHandleProps` reached the wrong element or nothing at all.
// Task 4 moved that prop from `SectionEditor` wrapping each row in a handle of
// its own to `SectionCard` rendering the handle in its own header row, which
// is exactly the edit most likely to break the threading silently: the grip
// still renders, still looks right, and simply does nothing.
//
// This drives a REAL drag, by KEYBOARD. `@hello-pangea/dnd` supports keyboard
// dragging natively — focus the handle, Space to lift, Arrow to move, Space to
// drop — and that path is both more reliable in Playwright than synthesising
// pointer events for this library, and worth having independently: it is the
// only proof anywhere in this project that the handle is reachable and
// operable without a mouse.
//
// It found a real defect on its first run, before any threading was broken on
// purpose: the handle is a `<button>`, and `@hello-pangea/dnd` refuses to
// start a drag — by mouse OR keyboard — whose source event targets a tag it
// treats as interactive, unless the `Draggable` opts out with
// `disableInteractiveElementBlocking`. Nothing in `section-editor.tsx` did, so
// lifting a section did nothing at all: no error, no announcement, silently
// inert — for every input method, not only this one. See the prop on
// `<Draggable>` there for the fix.
//
// No save happens here. `SectionEditor` reorders through `useFieldArray`
// entirely on the client, so the assertion — read the order back from the
// section-name inputs' own DOM values — needs nothing written to the
// database.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("a section dragged by keyboard lands in its new position in the DOM", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // Two sections, built by hand — a template inserts sections as data without
  // touching the drag handle at all, which would prove nothing here.
  await page.getByTestId("new-section-type").selectOption("cards");
  await page.getByTestId("add-section").click();
  await page.getByTestId("section-name").last().fill("First");

  await page.getByTestId("new-section-type").selectOption("gallery");
  await page.getByTestId("add-section").click();
  await page.getByTestId("section-name").last().fill("Second");

  const names = () =>
    page
      .getByTestId("section-name")
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      );

  await expect.poll(names).toEqual(["First", "Second"]);

  // Lift the first section's handle, move it down one, drop it. The library
  // announces each step to an `aria-live` region it manages itself; waiting on
  // that text changing — rather than a blind timeout — is what lets each key
  // wait for the previous one's reducer update and re-render to actually land
  // before the next one fires.
  const announcement = page.locator('[id^="rfd-announcement-"]');

  await page.getByTestId("drag-section").first().focus();
  await page.keyboard.press("Space");
  await expect(announcement).not.toBeEmpty();

  await page.keyboard.press("ArrowDown");
  // The library's own wording for a move from slot 1 to slot 2 — see
  // `withLocation` in its source. Waiting on this rather than a fixed delay
  // is what proves the move actually landed before the drop key fires.
  await expect.poll(() => announcement.textContent()).toMatch(/to position 2/);

  await page.keyboard.press("Space");

  // The assertion the whole test exists for: the DOM order changed, read from
  // the inputs themselves — not a toast, not an internal state value.
  await expect.poll(names).toEqual(["Second", "First"]);
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
// stale, so the test's subject no longer exists — and it could not be kept in
// any case, because the editor still writes the flat shape the database now
// refuses. When the editor is ported (phase 3) the round trip is worth a spec
// again, for whatever the new save actually risks.
