import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintSessionToken,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { liftByKeyboard } from "./support/drag";
import { openPageOptions } from "./support/editor";

// THE SAME FAULT AS section-drag-reorder.spec.ts, IN THE OTHER LIST.
//
// PORTED, not rewritten: what it asserted is what it asserts, and only the
// announcement selector and its wording are re-derived from `@dnd-kit`'s own
// output.
//
// fursona-list.test.tsx used to count buttons by aria-label through a fully
// mocked drag library — it would have passed even if the handle props reached
// the wrong element or nothing at all. `fursona-list.tsx` once wrapped every
// row in a `<Draggable>` and spread those props onto the wrapping `<div>`,
// while `fursona-row.tsx` rendered the grip as a `<button>` *inside* that div,
// carrying none of its own — exactly the shape `section-drag-reorder.spec.ts`
// had already found once. That mock is gone: the list's unit suite renders the
// real hooks now.
//
// **`block-slot.test.tsx` is NOT a guard on THIS grip**, and a sentence here
// used to credit it with being one. That file tests `BlockSlot`, the editor's
// grip; this grip's four props are spread in `SortableFursonaRow`
// (`fursona-list.tsx:188-225`) and their only browser guard is the drag below.
// That guard is real for `listeners` and `setNodeRef` — drop either and the
// drag never starts or never lands — and `fursona-list.test.tsx` now carries
// the assertion for `attributes`, which is the half that would otherwise go
// unnoticed, because the grip is a `<button>` and stays operable without it.
//
// This drives a REAL drag, by KEYBOARD, for the same reason that file does:
// dnd-kit supports keyboard dragging natively — focus the grip, Space to lift,
// Arrow to move, Space to drop — which is both more reliable in Playwright
// than synthesising pointer events, and the only proof in a real browser that
// THIS grip is reachable and operable without a mouse.
//
// The defect it originally reproduced belonged to the library that is gone:
// `@hello-pangea/dnd` refused to start a drag — by mouse OR keyboard — whose
// source event targeted a tag it treats as interactive, unless the `Draggable`
// opted out with `disableInteractiveElementBlocking`, and nothing here did.
// dnd-kit has no such rule: a grip is whatever element carries `listeners`. So
// what can break now is the threading itself, which is exactly what a keyboard
// lift is the sharpest test of.
//
// Unlike the section editor, there is no separate "save" step here:
// `onDragEnd` calls `reorder.mutate` per moved row on drop, which is a real
// write through `set_fursona_order`. So the one test below also proves the
// write reaches the database rather than only the client's own state — and it
// proves that through a Supabase client of its OWN at the end, because a
// reload re-reads the very query the page already rendered from and is
// therefore corroborating rather than independent. See `storedOrder`.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/**
 * The stored order of some fursonas, read outside the page altogether.
 *
 * A second source rather than a second look: this mints its own Clerk session
 * token and its own Supabase client — the way `support/blocks.ts` seeds a page
 * — so nothing about the answer passes through the client query the list
 * rendered from. It reads the two things the product reads separately, for the
 * reason `readArrangement` gives: `my_actors()` returns the actor columns and
 * `actor_profiles` holds the arrangement, and there is no joined view.
 *
 * Rows the caller does not own are invisible to RLS, and rows for other
 * fursonas — the person's own actor among them — are filtered out here, so the
 * answer is about exactly the handles asked for.
 *
 * @param wanted - the handles to report on.
 * @returns those handles, ordered by their stored `sort_order`.
 */
async function storedOrder(wanted: string[]): Promise<string[]> {
  const jwt = await mintSessionToken(identity!.userId);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    },
  );

  const { data: actors, error: actorsError } = await supabase.rpc("my_actors");
  expect(actorsError).toBeNull();
  const { data: profiles, error: profilesError } = await supabase
    .from("actor_profiles")
    .select("actor_ref, sort_order");
  expect(profilesError).toBeNull();

  const handleOf = new Map(
    ((actors ?? []) as Record<string, unknown>[]).map((row) => [
      row.actor_ref as string,
      row.handle as string,
    ]),
  );
  return ((profiles ?? []) as Record<string, unknown>[])
    .map((row) => ({
      handle: handleOf.get(row.actor_ref as string) ?? "",
      sortOrder: (row.sort_order as number | null) ?? 0,
    }))
    .filter((row) => wanted.includes(row.handle))
    .sort((one, other) => one.sortOrder - other.sortOrder)
    .map((row) => row.handle);
}

test("a fursona dragged by keyboard lands in its new position and survives a reload", async ({
  page,
}) => {
  // Three real editor creates, the drag, two independent reads and cleanup sit
  // too close to Playwright's 30s whole-test default for that bound to be
  // honest. Re-measured twice after the editor-wide sections watch was removed:
  // 24.5s and 25.1s test time (31.58s and 30.72s wall time including runner
  // startup). A 60s case bound is over twice the slower reading while still
  // failing a stuck save or navigation promptly; 120s was not proportional.
  test.setTimeout(60_000);
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
    await openPageOptions(page);
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

  // Lift the first row's grip and move it down TWO, then drop it. dnd-kit
  // announces each step to an `aria-live` region it manages itself; waiting on
  // that text changing — rather than a blind timeout — is what lets each key
  // wait for the previous one's state update and re-render to actually land
  // before the next one fires.
  //
  // **Two presses rather than one, and that is what makes this a measurement.**
  // `onDragEnd` splices the moved row out and back in, which is a SHIFT; moving
  // a row one step onto its neighbour reads `b a c` whether the code shifts or
  // swaps, so the obvious version of this test passed either way — the trap
  // rule 27 of the root `CLAUDE.md` documents. Across two positions a shift reads
  // `b c a` and a swap would read `c b a`. The splice was rewritten on this
  // branch, so this is the fixture that has to be able to tell.
  const announcement = page.locator('[id^="DndLiveRegion-"]');

  // The macrotask inside `liftByKeyboard` is what keeps the first arrow from
  // being swallowed by the sensor's own attach window; `support/drag.ts`
  // carries the account.
  await liftByKeyboard(page, page.getByTestId("drag-fursona").first());
  await expect(announcement).not.toBeEmpty();

  // OUR wording, from `fursonas.dragOver` in the Spanish catalogue, with the
  // row's one-based position on the end, ANCHORED — `Movido sobre 2.` is a
  // prefix of `Movido sobre 2.1.`, which this app also says, so an unanchored
  // match would accept an announcement about something else. dnd-kit's own
  // defaults are hard-coded English built out of raw drag ids, which here are
  // actor refs — a UUID read out at somebody in the wrong language. Waiting on
  // this rather than a fixed delay is what proves the move actually landed
  // before the next key fires.
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => announcement.textContent())
    .toMatch(/Movido sobre 2\.$/);

  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => announcement.textContent())
    .toMatch(/Movido sobre 3\.$/);

  await page.keyboard.press("Space");

  // The DOM reordered, and the drop itself was the write — `onDragEnd` calls
  // `reorder.mutate` for every row the move displaced, no separate save.
  const [first, second, third] = handles;
  await expect.poll(order).toEqual([second, third, first]);

  // A fresh navigation, not the client state the drag just edited in place.
  await page.goto("/es/pages");
  await expect.poll(order).toEqual([second, third, first]);

  // THE ONE READING THAT DOES NOT COME BACK THROUGH THIS PAGE'S OWN QUERY.
  //
  // The reload above used to be credited as "the assertion the whole test
  // exists for", and it is corroborating rather than independent:
  // `useFursonaMutations.reorder` has no optimistic update — it only
  // invalidates `onSuccess` — and the arrangement query carries
  // `initialData: []`, so the DOM assertion before it could not have turned
  // green until the write reached the database and the query re-read it. The
  // reload then re-reads the same client query. Both are worth keeping and
  // neither is a second source.
  //
  // So the order is read once more through a Supabase client this spec mints
  // for itself, exactly as `support/blocks.ts` seeds through one: a different
  // connection, a different token, and no React Query anywhere in it.
  expect(await storedOrder(handles)).toEqual([second, third, first]);
});
