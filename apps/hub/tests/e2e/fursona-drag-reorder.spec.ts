import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";

// THE SAME FAULT AS section-drag-reorder.spec.ts, IN THE OTHER LIST.
//
// fursona-list.test.tsx's "offers a drag handle when nothing is filtered"
// counts buttons by aria-label through a fully mocked `@hello-pangea/dnd` — it
// would pass even if `dragHandleProps` reached the wrong element or nothing at
// all. `fursona-list.tsx` wrapped every row in a `<Draggable>` and spread
// `dragHandleProps` onto the wrapping `<div>`, while `fursona-row.tsx` rendered
// the grip as a `<button>` *inside* that div, carrying no handle props of its
// own — exactly the shape `section-drag-reorder.spec.ts` already found once.
//
// This drives a REAL drag, by KEYBOARD, for the same reason that file does:
// `@hello-pangea/dnd` supports keyboard dragging natively — focus the handle,
// Space to lift, Arrow to move, Space to drop — which is both more reliable in
// Playwright than synthesising pointer events for this library, and the only
// proof anywhere in this project that THIS grip is reachable and operable
// without a mouse.
//
// It reproduces the same defect this file's sibling did: the grip is a
// `<button>`, and `@hello-pangea/dnd` refuses to start a drag — by mouse OR
// keyboard — whose source event targets a tag it treats as interactive,
// unless the `Draggable` opts out with `disableInteractiveElementBlocking`.
// Nothing in `fursona-list.tsx` did, so lifting a fursona did nothing at all:
// no error, no announcement, silently inert, for every input method.
//
// Unlike the section editor, there is no separate "save" step here:
// `onDragEnd` calls `reorder.mutate` per moved row on drop, which is a real
// write through `set_fursona_order`. So the one test below also proves the
// write reaches the database rather than only the client's own state — by
// reloading the list from a fresh navigation before reading the order back.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("a fursona dragged by keyboard lands in its new position and survives a reload", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));

  // `/me` first: it is what provisions the person actor, and without one
  // `create_fursona` refuses with "no person actor for caller".
  await page.goto("/es/me");

  // Three fursonas, built through the real editor — a template would not
  // exercise this control any more than it exercises a section's. Named so
  // their default order (nothing arranged yet sorts by handle) is known:
  // a, b, c.
  const stamp = Date.now().toString().slice(-9);
  const handles = [`a${stamp}`, `b${stamp}`, `c${stamp}`];
  for (const handle of handles) {
    await page.goto("/es/pages/new");
    await page.getByTestId("editor-handle").fill(handle);
    await page.getByTestId("editor-display-name").fill(handle);
    await page.getByTestId("editor-visibility").selectOption("public");
    await page.getByTestId("editor-save").click();
    await page.waitForURL(/\/pages$/, { timeout: 30_000 });
  }

  // Each row's public link is keyed by handle, and its DOM order is the
  // list's order — the same test id `signed-in.spec.ts` already reads for a
  // single row, used here to read the whole list's order at once.
  const order = () =>
    page
      .getByTestId(/^view-public-/)
      .evaluateAll((els) =>
        els.map((el) =>
          el.getAttribute("data-testid")?.replace("view-public-", ""),
        ),
      );

  await expect.poll(order).toEqual(handles);

  // Lift the first row's handle, move it down one, drop it. The library
  // announces each step to an `aria-live` region it manages itself; waiting on
  // that text changing — rather than a blind timeout — is what lets each key
  // wait for the previous one's reducer update and re-render to actually land
  // before the next one fires.
  const announcement = page.locator('[id^="rfd-announcement-"]');

  await page.getByTestId("drag-fursona").first().focus();
  await page.keyboard.press("Space");
  await expect(announcement).not.toBeEmpty();

  await page.keyboard.press("ArrowDown");
  // The library's own wording for a move from slot 1 to slot 2 — see
  // `withLocation` in its source. Waiting on this rather than a fixed delay is
  // what proves the move actually landed before the drop key fires.
  await expect.poll(() => announcement.textContent()).toMatch(/to position 2/);

  await page.keyboard.press("Space");

  // The DOM reordered, and the drop itself was the write — `onDragEnd` calls
  // `reorder.mutate` for the moved row on every drop, no separate save.
  const [first, second, third] = handles;
  await expect.poll(order).toEqual([second, first, third]);

  // The assertion the whole test exists for: a fresh navigation, not the
  // client state the drag just edited in place. If the fault this file's
  // sibling found in the section editor existed here too — a reorder that
  // never reached `sort_order` — this reload would show the original order,
  // because `0012`'s public read and this list both sort by that column.
  await page.goto("/es/pages");
  await expect.poll(order).toEqual([second, first, third]);
});
