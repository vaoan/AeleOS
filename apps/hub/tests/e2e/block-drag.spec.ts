import { expect, test, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import {
  container,
  identityArrangement,
  leaf,
  seedPage,
} from "./support/blocks";
import { liftByKeyboard } from "./support/drag";
import { saveAndLeave } from "./support/editor";

// THE DRAG NOBODY HAD EVER DRIVEN WITH A MOUSE.
//
// Phase 2 shipped the collision function, and every browser-level proof it
// left behind was by KEYBOARD — `section-drag-reorder.spec.ts` still is. That
// is a real proof of a real path, and it is not this one: the keyboard branch
// of `detectCollision` returns the place the coordinate getter already chose
// and **never calls `placeUnderPointer` at all**. So the geometry — the thing
// that decides where a drop lands — was proved only against rectangles a unit
// test wrote for itself. `block-drag.test.ts` builds five nested rectangles
// around one point and asserts the innermost wins; nothing anywhere had asked
// a real layout engine whether the rectangles it produces have that shape.
//
// This file asks. Every case here runs BY MOUSE and, where the input can
// express it, by keyboard as well — the same fixture, the same assertion, two
// gestures — so a disagreement between the two shows up as one red case rather
// than as a feeling that dragging is odd.
//
// **The pointer half asserts the collision's answer before it releases.** A
// place lit by `data-over` is `useDroppable` reporting that `detectCollision`
// named it, so the drop's outcome and the collision's choice fail separately:
// a wrong choice reddens mid-gesture, naming the place it wrongly chose, where
// a test that only inspected the tree afterwards would report a rearrangement
// and leave the reason to be guessed.
//
// **Two things here are arranged so that a right answer and a wrong one look
// different**, which is the trap this phase had already sprung once. A swap
// and an insert-and-shift produce the SAME page when the two places are
// adjacent, and a shift and a swap produce the same page when there are only
// two sections — so the swap is asserted across a place that is not adjacent
// to its source, and the reorder gets a page of its own with THREE sections.
// Neither case could have failed on the obvious fixture.
//
// **The page is seeded rather than built.** Building one through the interface
// is `nested-page-build.spec.ts`'s subject and it proves nothing extra here —
// what a drag needs is a real layout, which a seeded page has, and twenty
// interactions per test to reach it would be twenty ways to fail for reasons
// that are not dragging. `seedPage` writes through the same `security definer`
// RPC the editor writes through, so the fixture is a page the editor could
// have produced.
//
// The viewport is deliberately TALL. A pointer drag that has to scroll is a
// drag whose droppable rectangles were measured before the scroll, and this
// suite must not be the place that discovers what dnd-kit does about that;
// both fixtures fit on screen and nothing here scrolls.
//
// Locators are structural — test ids and paths — because this suite runs in
// Spanish and a section's name is data. The exception is each refusal
// sentence, asserted by its exact Spanish text, and that is the point of it: a
// refusal that named the wrong reason would still be a refusal, and only the
// wording separates "that would put a section inside itself" from "that is one
// level too deep".

// Generous, and NOT serial. Every test opens the page fresh and none of them
// writes to the shared fixture, so a failure here must not skip the cases after
// it — half the value of a matrix run against two gestures is seeing which of
// the two went red.
test.describe.configure({ timeout: 240_000 });

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

/**
 * A laptop that is tall enough to hold a whole fixture without scrolling.
 *
 * The width is the ordinary desktop one, so the container queries resolve a
 * section into as many tracks as it was built with. The height is not a screen
 * anybody owns — it exists so that every place has a rectangle the pointer can
 * reach without moving the document under the rectangles dnd-kit measured when
 * the drag began.
 *
 * **It went from 2600 to 3600 when pages gained their required identity
 * blocks**, because `seedPage` appends a section to every fixture and the
 * page grew past the old height. The failure that reported it did not mention
 * scrolling at all: the SECOND lift of a two-drag test announced nothing, which
 * reads exactly like a dead grip. A grip below the fold is one the pointer
 * never presses. Whoever adds to a fixture here checks this number again.
 */
const TALL = { width: 1400, height: 3600 };

/** How far a pointer travels before `PointerSensor` calls a press a drag. */
const LIFT_DISTANCE = 20;

/** How far inside a place's top-left corner a drop aims. */
const INSET = 8;

/** How many arrow presses a keyboard drag may spend reaching its target. */
const STEP_LIMIT = 12;

/**
 * The main fixture, in one picture:
 *
 * ```
 * 0       section "Uno", four places across
 * 0.0       leaf "Alfa"
 * 0.1       leaf "Beta"
 * 0.2       leaf "Delta"
 * 0.3       container "Otra"     (two places, both empty)
 * 1       section "Dos", two places across
 * 1.0       container "Dentro"   (two places)
 * 1.0.0       leaf "Gamma"
 * 1.0.1       empty
 * 1.1       empty
 * ```
 *
 * The shape is chosen so that every case below is reachable AND
 * distinguishable: three occupied leaf places in one section so a swap can be
 * asserted across a place that is not adjacent to its source, an empty place
 * at the depth cap to move into, a section holding a container so a drop can
 * be refused for depth, and a section with descendants so a drop can be
 * refused for a cycle. The two sections are built differently — four places
 * against two — so a passing drag cannot be a coincidence of two identical
 * cards.
 *
 * @returns the tree, as the database stores it.
 */
const fixture = () => [
  container({
    name_en: "Uno",
    mode: "grid",
    spaces: 4,
    children: [
      leaf({ title_en: "Alfa" }),
      leaf({ title_en: "Beta" }),
      leaf({ title_en: "Delta" }),
      container({
        name_en: "Otra",
        mode: "grid",
        spaces: 2,
        children: [null, null],
      }),
    ],
  }),
  container({
    name_en: "Dos",
    mode: "grid",
    spaces: 2,
    children: [
      container({
        name_en: "Dentro",
        mode: "grid",
        spaces: 2,
        children: [leaf({ title_en: "Gamma" }), null],
      }),
      null,
    ],
  }),
];

/**
 * What the main fixture reads as before anything is dragged.
 *
 * The trailing identity section is `seedPage`'s, not this file's: a page
 * naming no `avatar`, `handle` or `owner` is one the database refuses. It is
 * spelled out because these assertions are deliberately whole-page — a drag
 * that disturbed something it should not have is only visible against the
 * whole — and it sits LAST, so every path this file drags by is unchanged.
 */
const AS_SEEDED = [
  "0=section-card:Uno",
  "0.0=leaf-editor:Alfa",
  "0.1=leaf-editor:Beta",
  "0.2=leaf-editor:Delta",
  "0.3=nested-card:Otra",
  "0.3.0=empty-place:",
  "0.3.1=empty-place:",
  "1=section-card:Dos",
  "1.0=nested-card:Dentro",
  "1.0.0=leaf-editor:Gamma",
  "1.0.1=empty-place:",
  "1.1=empty-place:",
  ...identityArrangement(2),
];

/**
 * Three sections holding one thing each, for the reorder alone.
 *
 * **Three rather than two, and that is the whole reason this is a second
 * page.** The top level SHIFTS where every other level swaps, and on a page of
 * two sections those two operations produce the same result — so a reorder
 * asserted there passes whichever one the code performs. Moving the first
 * section onto the third separates them: a shift leaves `B C A` and a swap
 * would leave `C B A`.
 *
 * @returns the tree, as the database stores it.
 */
const trio = () =>
  ["A", "B", "C"].map((name) =>
    container({
      name_en: name,
      mode: "grid",
      spaces: 1,
      children: [leaf({ title_en: name.toLowerCase() })],
    }),
  );

/** What the three-section fixture reads as before anything is dragged. */
const TRIO_SEEDED = [
  "0=section-card:A",
  "0.0=leaf-editor:a",
  "1=section-card:B",
  "1.0=leaf-editor:b",
  "2=section-card:C",
  "2.0=leaf-editor:c",
  ...identityArrangement(3),
];

let identity: TestIdentity | undefined;
let handle: string | undefined;
let trioHandle: string | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  handle = (
    await seedPage({
      userId: identity.userId,
      handlePrefix: "drag",
      displayName: "Dragged by hand",
      blocks: fixture(),
    })
  ).handle;
  trioHandle = (
    await seedPage({
      userId: identity.userId,
      handlePrefix: "dragtrio",
      displayName: "Three sections",
      blocks: trio(),
    })
  ).handle;
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/**
 * The whole page, place by place, as one readable list.
 *
 * **Every place, not only the ones holding something.** A move leaves its
 * source empty and a swap leaves everything else alone, and neither claim can
 * be made about a list that mentions only what is occupied — "nothing else
 * moved" is a statement about the empty places too.
 *
 * Each entry is `path=what:name`, where the name is whatever the thing calls
 * itself: a leaf's title, a container's name, nothing at all for an empty
 * place. Read from the inputs' own DOM values, so it is what the editor is
 * showing rather than what some state says it should be.
 *
 * @param page - the browser page, sitting on an editor.
 * @returns one entry per place, in document order.
 */
const arrangement = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="place-"]')].map((place) => {
      const held = place.firstElementChild;
      const named = held?.querySelector(
        '[data-testid="leaf-title"], [data-testid="nested-name"], [data-testid="section-name"]',
      );
      const path = place.getAttribute("data-testid")?.slice("place-".length);
      const what = held?.getAttribute("data-testid") ?? "";
      const value = (named as HTMLInputElement | null)?.value ?? "";
      return `${path}=${what}:${value}`;
    }),
  );

/**
 * How a place is announced, one-based, anchored to the end of the sentence.
 *
 * `Movido sobre 2.1.` and `Movido sobre 2.1.2.` are both sentences this app
 * says, and the first is a prefix of the second — so a substring match on
 * `2.1.` would report arrival at a place two levels above the one asked for.
 *
 * @param path - the place, in the dotted zero-based form its test id uses.
 * @returns a pattern matching only an announcement about exactly that place.
 */
const announcing = (path: string): RegExp =>
  new RegExp(
    `\\s${path
      .split(".")
      .map((index) => Number(index) + 1)
      .join("\\.")}\\.$`,
  );

/**
 * The refused-drop sentence, or nothing when no drop was refused.
 *
 * Read through `evaluateAll`, which answers an empty list for an element that
 * is not there, rather than through `textContent`, which WAITS for one. Under
 * the sabotage each refusal case exists to survive, the element genuinely never
 * appears — and a helper that waited would spend the whole test timeout before
 * saying so, about the one line that was supposed to explain everything.
 *
 * @param page - the browser page, sitting on an editor.
 * @returns what the editor said, or an empty string.
 */
const refusal = (page: Page): Promise<string> =>
  page
    .getByTestId("drag-refusal")
    .evaluateAll((nodes) => nodes[0]?.textContent ?? "");

/**
 * Opens a page in the editor, signed in, at a size nothing scrolls at.
 *
 * @param page - the browser page.
 * @param which - the handle to open; the main fixture by default.
 */
async function openEditor(page: Page, which = handle!): Promise<void> {
  await signIn(page, await mintTicket(identity!.userId));
  await page.setViewportSize(TALL);
  await page.goto(`/es/pages/${which}/edit`);
  await expect(page.getByTestId("section-card").first()).toBeVisible();
}

/**
 * Presses on a grip and moves far enough for the library to call it a drag.
 *
 * The lift is waited for rather than assumed: a grip carrying no listeners
 * starts nothing and says nothing, which is exactly what a dead grip looks
 * like and is the fault `BlockSlot` exists to make impossible.
 *
 * **Waited for as a CHANGE rather than as "the region has words in it."** The
 * second drag of a test begins with the first drag's own "Soltado en 2.1.2."
 * still on screen, so an emptiness check there passes before anything has been
 * lifted — an assertion that cannot fail, in the one place a dead grip would
 * first be noticed.
 *
 * @param page - the browser page.
 * @param from - the place to lift from, dotted and zero-based.
 */
async function liftByPointer(page: Page, from: string): Promise<void> {
  const live = page.locator('[id^="DndLiveRegion-"]');
  const before = await live.textContent();
  const grip = page.getByTestId(`drag-${from}`);
  const held = (await grip.boundingBox())!;
  await page.mouse.move(held.x + held.width / 2, held.y + held.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    held.x + held.width / 2 + LIFT_DISTANCE,
    held.y + held.height / 2,
    { steps: 4 },
  );
  await expect
    .poll(() => live.textContent(), {
      message: `lifting ${from} by mouse announced nothing new`,
    })
    .not.toBe(before);
}

/**
 * Moves the pointer to a point inside a place, without releasing.
 *
 * The aim is a fixed inset from the top-left corner rather than the centre,
 * and that is what makes a CONTAINER reachable at all: the centre of a section
 * is inside one of its own places, so a drag aimed there could never resolve
 * to the section itself.
 *
 * @param page - the browser page.
 * @param to - the place to move over.
 */
async function moveOver(page: Page, to: string): Promise<void> {
  const onto = (await page.getByTestId(`place-${to}`).boundingBox())!;
  await page.mouse.move(onto.x + INSET, onto.y + INSET, { steps: 12 });
}

/**
 * Drags what is in one place onto another **with a real mouse**.
 *
 * This is the path no browser had driven.
 *
 * **It asserts the highlight before releasing.** `data-over` is set from
 * `useDroppable`'s own `isOver`, which is the collision function's answer
 * rendered; so this line is `placeUnderPointer`, run against rectangles a real
 * layout engine produced, asserted directly.
 *
 * @param page - the browser page.
 * @param from - the place to lift from, dotted and zero-based.
 * @param to - the place to drop on.
 */
async function dragByPointer(
  page: Page,
  from: string,
  to: string,
): Promise<void> {
  await liftByPointer(page, from);
  await moveOver(page, to);
  await expect(page.getByTestId(`place-${to}`)).toHaveAttribute(
    "data-over",
    "",
  );
  await page.mouse.up();
}

/**
 * Drags what is in one place onto another **with the keyboard alone**.
 *
 * A keyboard drag walks a list rather than reading geometry, so it cannot be
 * pointed at a target: it is stepped towards one. The direction comes from the
 * BROWSER — which of the two places comes first in the document — rather than
 * from anything that also decides the drag order, so a walk that disagreed
 * with the drawing order would fail here rather than be quietly followed.
 *
 * It stops when the live region names the target. A step that announces
 * nothing new means the list ended without offering it, which is a real answer
 * — the order deliberately leaves out the places inside the block being
 * carried — and it is reported as one rather than as a timeout on the drop.
 *
 * @param page - the browser page.
 * @param from - the place to lift from, dotted and zero-based.
 * @param to - the place to drop on.
 */
async function dragByKeyboard(
  page: Page,
  from: string,
  to: string,
): Promise<void> {
  const live = page.locator('[id^="DndLiveRegion-"]');
  const forward = await page.evaluate(
    ([source, target]) => {
      const one = document.querySelector(`[data-testid="place-${source}"]`)!;
      const other = document.querySelector(`[data-testid="place-${target}"]`)!;
      return Boolean(
        one.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    },
    [from, to],
  );
  const said = async (): Promise<string> => (await live.textContent()) ?? "";
  const wanted = announcing(to);

  // **Waited for as a CHANGE, not as "the region has words in it".** The
  // second drag of a test begins with the first drag's "Soltado en 2.1.2."
  // still on screen, so an emptiness check proves nothing about this lift and
  // the first arrow can be pressed before the drag has begun.
  const before = await said();
  // The lift, and the macrotask that makes the first arrow key land — the
  // whole account of that window is in `support/drag.ts`, which is where it
  // lives so that every spec in this suite gets it rather than the one that
  // diagnosed it.
  await liftByKeyboard(page, page.getByTestId(`drag-${from}`));
  await expect
    .poll(said, { message: `lifting ${from} announced nothing new` })
    .not.toBe(before);

  for (let step = 0; step < STEP_LIMIT && !wanted.test(await said()); step++) {
    const was = await said();
    await page.keyboard.press(forward ? "ArrowDown" : "ArrowUp");
    await expect
      .poll(said, {
        message: `stepping from ${from} towards ${to} stopped at "${was}"`,
      })
      .not.toBe(was);
  }
  expect(await said(), `never reached ${to}`).toMatch(wanted);

  await page.keyboard.press("Space");
}

/** The two gestures, run against the same assertions. */
const GESTURES = [
  { name: "by mouse", drag: dragByPointer },
  { name: "by keyboard", drag: dragByKeyboard },
] as const;

for (const gesture of GESTURES) {
  // A SWAP, AND THE RULING MOST LIKELY TO BE "FIXED" INTO SOMETHING ELSE.
  //
  // A place is positional — place three is place three whether or not anything
  // is in it — so a drop onto an occupied place exchanges the two and moves
  // nothing else. The obvious alternative, insert-and-shift, would close the
  // empty places somebody left on purpose; the ruling is
  // `2026-08-18-dragging-design.md` §1.
  //
  // **`Alfa` is dropped on `Delta` rather than on `Beta` beside it**, and that
  // is the whole strength of this case. An exchange and an insert both leave
  // two ADJACENT places reading `Beta Alfa`, so the obvious version of this
  // test passes whichever the code does. Across a place they are not adjacent
  // to, an exchange reads `Delta Beta Alfa` and an insert would read
  // `Beta Delta Alfa`.
  test(`a piece of content dropped on an occupied place in the same section swaps with it, ${gesture.name}`, async ({
    page,
  }) => {
    await openEditor(page);
    await expect.poll(() => arrangement(page)).toEqual(AS_SEEDED);

    await gesture.drag(page, "0.0", "0.2");

    await expect
      .poll(() => arrangement(page))
      .toEqual([
        "0=section-card:Uno",
        "0.0=leaf-editor:Delta",
        "0.1=leaf-editor:Beta",
        "0.2=leaf-editor:Alfa",
        ...AS_SEEDED.slice(4),
      ]);
  });

  // INTO A NESTED SECTION AND BACK OUT — the capability the whole migration was
  // for, since `@hello-pangea/dnd` rules out dragging from a parent list into a
  // child one in its own README.
  //
  // The target is at the DEPTH CAP: `1.0.1` is a place two levels down, and
  // every rectangle on the way to it — the section's, the nested container's —
  // encloses the pointer too. So the pointer half of this is the case that
  // fails if `placeUnderPointer` ranks by anything but path length, and it
  // fails at the highlight rather than at the tree.
  //
  // Out again, because a move that only goes one way is half a feature: the
  // page must come back to exactly what it was, which also says the place the
  // leaf left was still there to return to.
  test(`a piece of content moves into a nested section's empty place and back out, ${gesture.name}`, async ({
    page,
  }) => {
    await openEditor(page);
    await expect.poll(() => arrangement(page)).toEqual(AS_SEEDED);

    await gesture.drag(page, "0.0", "1.0.1");

    // The place it left is EMPTY and still first of four — a section does not
    // close up around what leaves it.
    await expect
      .poll(() => arrangement(page))
      .toEqual([
        "0=section-card:Uno",
        "0.0=empty-place:",
        ...AS_SEEDED.slice(2, 10),
        "1.0.1=leaf-editor:Alfa",
        "1.1=empty-place:",
        ...identityArrangement(2),
      ]);

    await gesture.drag(page, "1.0.1", "0.0");
    await expect.poll(() => arrangement(page)).toEqual(AS_SEEDED);
  });

  // THE TOP LEVEL SHIFTS WHERE EVERYTHING ELSE SWAPS, and the two sections it
  // passes carry their whole subtrees with them. On its own three-section page,
  // for the reason `trio` gives: on two sections a shift and a swap are the
  // same page, so this assertion would have held whichever one ran.
  test(`a whole section dragged onto another reorders the page, ${gesture.name}`, async ({
    page,
  }) => {
    await openEditor(page, trioHandle!);
    await expect.poll(() => arrangement(page)).toEqual(TRIO_SEEDED);

    await gesture.drag(page, "0", "2");

    await expect
      .poll(() => arrangement(page))
      .toEqual([
        "0=section-card:B",
        "0.0=leaf-editor:b",
        "1=section-card:C",
        "1.0=leaf-editor:c",
        "2=section-card:A",
        "2.0=leaf-editor:a",
        // Untouched: the shift moves A past B and C, and the identity section
        // it stops short of stays exactly where `seedPage` put it.
        ...identityArrangement(3),
      ]);
  });

  // ONE LEVEL TOO FAR, REFUSED IN WORDS.
  //
  // `Uno` holds a container, so it needs two levels beneath wherever it goes;
  // `1.0.1` is already two levels down. `validate_block` in `0009` would refuse
  // the resulting page outright, so the alternative to this sentence is not a
  // deeper page — it is a save that fails much later, about a drag nobody
  // remembers making.
  test(`a drop one level past the cap is refused, and says so, ${gesture.name}`, async ({
    page,
  }) => {
    await openEditor(page);
    await expect.poll(() => arrangement(page)).toEqual(AS_SEEDED);

    await gesture.drag(page, "0", "1.0.1");

    await expect
      .poll(() => refusal(page))
      .toBe(
        "Eso está un nivel más adentro de lo que una página admite, así que no se movió nada.",
      );
    expect(await arrangement(page)).toEqual(AS_SEEDED);
  });
}

// A CYCLE, REFUSED — AND REACHABLE FROM ONE INPUT ONLY.
//
// The tree is stored as `jsonb` and a cycle is not representable in it, so this
// is refused where the move is computed rather than discouraged in the
// interface. A POINTER cannot avoid offering it: the places inside the section
// being carried are genuinely under the pointer, and `placeUnderPointer`
// deliberately excludes nothing for being impossible — a target that quietly
// declined to light up would be a control that did nothing.
//
// There is no keyboard half of this test because there is no keyboard gesture
// that expresses it; the case below is what proves that is by design rather
// than by omission.
//
// **`Dos` is dropped on its own SECOND place rather than on the deep one
// inside `Dentro`**, and the difference is what makes this a test of the cycle
// guard at all. `Dos` needs two levels, so dropping it two levels down is ALSO
// past the cap — remove the cycle guard entirely and such a drop is still
// refused, by the depth rule, wearing a different sentence. Its own direct
// place is at depth one, where it fits perfectly well; the only thing wrong
// with that drop is that it is a cycle.
test("a section dropped inside its own descendant is refused, and says so, by mouse", async ({
  page,
}) => {
  await openEditor(page);
  await expect.poll(() => arrangement(page)).toEqual(AS_SEEDED);

  await dragByPointer(page, "1", "1.1");

  await expect
    .poll(() => refusal(page))
    .toBe(
      "Eso pondría una sección dentro de sí misma, así que no se movió nada.",
    );
  expect(await arrangement(page)).toEqual(AS_SEEDED);
});

// WHY THE CASE ABOVE HAS NO KEYBOARD HALF.
//
// `placeOrder` leaves out the places inside the block being carried, which a
// pointer cannot — and that omission is also what keeps an ordinary section
// reorder behaving as anybody expects: the step after section one is section
// two, not section one's own first place.
//
// It is asserted by walking the WHOLE list rather than by checking that one key
// did nothing. The first press is deliberately the one that would step INTO
// `Dos`; it is a no-op, so the walk that follows starts at `Dos` itself and
// reads back the seven places before it, in drawing order and nothing else.
// Restore the excluded descendants and the very first name read back is `Dos`'s
// own nested container instead of `Uno`'s last empty place.
test("a keyboard drag is never offered a place inside the section it is carrying", async ({
  page,
}) => {
  await openEditor(page);
  await expect.poll(() => arrangement(page)).toEqual(AS_SEEDED);

  const live = page.locator('[id^="DndLiveRegion-"]');
  const said = async (): Promise<string> => (await live.textContent()) ?? "";

  // The sensor's own keydown listener arrives a macrotask after the drag
  // starts — `support/drag.ts` carries the whole account. Without that yield
  // the press below is the one that gets lost, which here would look like the
  // omission it is meant to prove.
  await liftByKeyboard(page, page.getByTestId("drag-1"));
  await expect(live).not.toBeEmpty();

  // Forward one, onto the identity section every page carries — which is what
  // lies after `Dos` now, where once there was nothing at all. **Waited for
  // rather than fired and forgotten**: without it the loop below took its first
  // reading before this step had landed and recorded the arrival here as though
  // it were the first step BACK, which reads as the walk offering a place it
  // never offered.
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(said, { message: "stepping forward off Dos" })
    .toMatch(announcing("2"));

  // And from there, back up through every place OUTSIDE the carried section —
  // never through `Dos`'s own, which is the omission this test exists for.
  const walked: string[] = [];
  for (const place of [
    "1",
    "0.3.1",
    "0.3.0",
    "0.3",
    "0.2",
    "0.1",
    "0.0",
    "0",
  ]) {
    const was = await said();
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(said, { message: `stepping back towards ${place}` })
      .not.toBe(was);
    walked.push((await said()).replace(/^[^\d]+/, "").replace(/\.$/, ""));
  }
  // **`Dos`'s own place is the first step back and belongs here.** A source
  // place is a legal target — dropping a block where it already is changes
  // nothing — so the walk offers it. What must never appear is anything BENEATH
  // it: `2.1` and `2.2` are `Dentro` and the empty place beside it, and neither
  // is in this list.
  expect(walked).toEqual([
    "2",
    "1.4.2",
    "1.4.1",
    "1.4",
    "1.3",
    "1.2",
    "1.1",
    "1",
  ]);

  await page.keyboard.press("Escape");
});

// THE TOP LEVEL IS A PLANE OF ITS OWN, AND NOTHING SAID SO IN A BROWSER.
//
// `moveBlock` SHIFTS two paths of length one and SWAPS a length-one path
// against a nested one, so a piece of content resolved onto a section's own
// place would exchange with the whole section — putting the section into the
// place the leaf left. Legal, and not what anybody dragging content between two
// sections meant. `samePlane` is what withholds it, and the answer it gives is
// deliberately NOTHING AT ALL: no highlight, and a drop that changes nothing.
//
// **A negative is asserted only after a positive**, which is what makes it a
// measurement rather than a race. The pointer first rests on a place that DOES
// accept the leaf and the highlight is waited for; only then does it move up
// into the section's own chrome, so "nothing is lit" is a state the page
// arrived at rather than one it had not got round to leaving.
test("a piece of content hovering a section's own chrome is offered nothing, by mouse", async ({
  page,
}) => {
  await openEditor(page);
  await expect.poll(() => arrangement(page)).toEqual(AS_SEEDED);

  await liftByPointer(page, "0.0");

  // A place inside the other section, which is a legal target: it lights up.
  await moveOver(page, "1.0");
  await expect(page.getByTestId("place-1.0")).toHaveAttribute("data-over", "");

  // The same section's own chrome, above its first place. Another plane.
  await moveOver(page, "1");
  await expect(page.locator("[data-over]")).toHaveCount(0);

  // And it says so WHILE IT IS STILL HAPPENING: a drag over nothing is the
  // app's own "it stayed where it was", not silence.
  //
  // **This poll used to sit after the release, where it could not fail.**
  // `dragAnnouncements` answers the same `cancelled` string from `onDragOver`
  // when `over` is null, and dnd-kit fires `onDragOver` on every change of
  // `overId` — null included — so the sentence was already on screen before
  // the mouse came up and sabotaging the end handler changed nothing about it.
  // Here it is a true statement about `onDragOver`; the END of a drag has its
  // own case below, asserted as a CHANGE.
  await expect
    .poll(() => page.locator('[id^="DndLiveRegion-"]').textContent())
    .toBe("Quedó donde estaba.");

  await page.mouse.up();

  expect(await arrangement(page)).toEqual(AS_SEEDED);
});

// A PREVIEW IS THE PUBLIC RENDERER, NOT ANOTHER EDITOR PLANE.
//
// The tray deliberately sits beside the top-level `BlockSlot`. If it moves
// back inside that droppable, its public section looks read-only but the
// enclosing editor place still covers its rectangle: hovering the preview
// lights the whole section as a target. The fixture first lights a legal place,
// so the negative below is a transition the browser observed rather than a
// drag that never started.
test("a piece of content hovering a section preview is offered no editor target, by mouse", async ({
  page,
}) => {
  await openEditor(page);
  await expect(page.getByTestId("leaf-title").first()).toHaveValue("Alfa");

  await liftByPointer(page, "0.0");
  await moveOver(page, "1.0");
  await expect(page.getByTestId("place-1.0")).toHaveAttribute("data-over", "");

  const preview = page.getByTestId("block-preview").nth(1);
  const box = (await preview.getByTestId("public-section").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 12,
  });

  await expect(page.locator("[data-over]")).toHaveCount(0);
  await expect(preview.locator("[data-over]")).toHaveCount(0);
  expect(await refusal(page)).toBe("");

  await page.mouse.up();
  await expect(page.getByTestId("leaf-title").first()).toHaveValue("Alfa");
});

// A DRAG ABANDONED, AND THE ONLY THING IN A BROWSER THAT ASKS `onDragCancel`.
//
// Escape ends a drag through `onDragCancel`, which nothing anywhere asserted:
// the one Escape in this file was a tidy-up after another test's walk, with no
// assertion behind it. So the branch that says "it stayed where it was" for an
// abandoned drag had no browser coverage at all.
//
// **It is asserted as a CHANGE, and it has to be.** The cancelled sentence is
// also what `onDragOver` says over nothing, so polling for it from a standing
// start proves only that the page can produce the string. The drag is
// therefore parked on a place that DOES accept it — where the live region
// reads "Movido sobre 2.1." — and only then abandoned, so the assertion is
// that the announcement moved from one specific sentence to the other.
// Sabotage-verified: emptying `onDragCancel` reddens exactly this case and
// leaves the plane case above green, and emptying `onDragOver`'s null branch
// does the reverse.
//
// **`onDragEnd`'s own null branch is still not separately observable**, and
// this case does not claim it. It answers the identical sentence that
// `onDragOver` has already put on screen by the time the mouse comes up, so
// nothing a browser can read distinguishes the two. What holds it is
// `drag-announcements.test.ts` at the unit level, where the callback can be
// asked directly.
test("a drag abandoned with Escape says so and changes nothing, by mouse", async ({
  page,
}) => {
  await openEditor(page);
  await expect.poll(() => arrangement(page)).toEqual(AS_SEEDED);

  const live = page.locator('[id^="DndLiveRegion-"]');

  await liftByPointer(page, "0.0");

  // Parked somewhere real, so the sentence below is a change rather than a
  // string the page happened to be showing already.
  await moveOver(page, "1.0");
  await expect(page.getByTestId("place-1.0")).toHaveAttribute("data-over", "");
  await expect.poll(() => live.textContent()).toMatch(announcing("1.0"));

  await page.keyboard.press("Escape");

  await expect.poll(() => live.textContent()).toBe("Quedó donde estaba.");
  expect(await arrangement(page)).toEqual(AS_SEEDED);

  await page.mouse.up();
});

// A WALK THAT STEPPED INTO PLACES NOTHING WAS SHOWING, AND SAID THE WRONG
// THING WHILE IT DID.
//
// `placeOrder` walks the whole STORED tree, and a collapsed card renders none
// of its places — so those places register no droppable and the library has no
// rectangle for them. The coordinate getter used to move onto one anyway and
// fall back to the current coordinates, after which the collision named an id
// nothing had registered, dnd-kit resolved `over` to null, and the drag
// announced "Quedó donde estaba." — "it stayed where it was" — WHILE IT WAS
// STILL RUNNING. A space bar pressed there dropped nothing at all, because
// `onDragEnd` returns early on a null `over`.
//
// **The fixture puts the collapsed card in the MIDDLE of the walk**, which is
// what makes the assertion a measurement rather than an absence. `Otra` sits at
// `0.3` with two places inside it, so a forward walk from `0.0` reaches
// `0.1`, `0.2`, `0.3` and then must SKIP `0.3.0` and `0.3.1` to arrive at
// `1.0`. Collapse the last card instead and the fault looks like a walk that
// stopped, which is a legal answer at the end of a list.
test("a keyboard walk steps over the places a collapsed card is not showing", async ({
  page,
}) => {
  await openEditor(page);
  await expect.poll(() => arrangement(page)).toEqual(AS_SEEDED);

  // `Otra`, the nested container in the first section's last place. Collapsing
  // it withdraws its own two places from the DOM and leaves the place holding
  // it exactly where it was.
  await page.getByTestId("collapse-nested").first().click();
  await expect(page.getByTestId("place-0.3.0")).toHaveCount(0);
  await expect(page.getByTestId("place-0.3")).toHaveCount(1);

  const live = page.locator('[id^="DndLiveRegion-"]');
  const said = async (): Promise<string> => (await live.textContent()) ?? "";

  await liftByKeyboard(page, page.getByTestId("drag-0.0"));
  await expect(live).not.toBeEmpty();

  // Every place still on screen, in order — and then the one two steps past
  // the two that are not. The fourth press is the whole test: it used to land
  // on `0.3.0`, which nothing was drawing.
  for (const place of ["0.1", "0.2", "0.3", "1.0"]) {
    const was = await said();
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(said, { message: `stepping towards ${place}, from "${was}"` })
      .toMatch(announcing(place));
  }

  // And a drop there lands, which is the other half of the fault: over a place
  // with no rectangle the space bar did nothing whatsoever.
  await page.keyboard.press("Space");

  await expect
    .poll(() => arrangement(page))
    .toEqual([
      "0=section-card:Uno",
      "0.0=nested-card:Dentro",
      "0.0.0=leaf-editor:Gamma",
      "0.0.1=empty-place:",
      "0.1=leaf-editor:Beta",
      "0.2=leaf-editor:Delta",
      "0.3=nested-card:Otra",
      "1=section-card:Dos",
      "1.0=leaf-editor:Alfa",
      "1.1=empty-place:",
      ...identityArrangement(2),
    ]);
});

// AND IT SURVIVES STORAGE.
//
// Everything above is a rearrangement of a tree the editor is holding — no
// write, by design, because that is all `BlockEditor` does. What the database
// receives is a separate question, and it is the one the model's positions turn
// on: a save that tidied away the place a drag left empty, or that sent what
// was loaded rather than what is held, would leave every test above green and
// every page in the product wrong the moment somebody pressed Save.
//
// Its own page, so a failed run cannot leave a shared fixture rearranged for
// whatever runs after it.
test("an arrangement made by dragging survives a save and a reload", async ({
  page,
}) => {
  const own = (
    await seedPage({
      userId: identity!.userId,
      handlePrefix: "dragsave",
      displayName: "Dragged and saved",
      blocks: fixture(),
    })
  ).handle;

  await openEditor(page, own);
  await expect.poll(() => arrangement(page)).toEqual(AS_SEEDED);

  // Two drags, so what is stored differs from the seed in both of the ways a
  // move can: a place left empty at the front of a section, and a place filled
  // at the depth cap.
  await dragByPointer(page, "0.0", "1.0.1");
  await dragByPointer(page, "0.1", "1.1");

  const dragged = [
    "0=section-card:Uno",
    "0.0=empty-place:",
    "0.1=empty-place:",
    "0.2=leaf-editor:Delta",
    "0.3=nested-card:Otra",
    "0.3.0=empty-place:",
    "0.3.1=empty-place:",
    "1=section-card:Dos",
    "1.0=nested-card:Dentro",
    "1.0.0=leaf-editor:Gamma",
    "1.0.1=leaf-editor:Alfa",
    "1.1=leaf-editor:Beta",
    // Untouched by either drag, and asserted rather than excluded: a save that
    // dropped the identity section would still be a page, and this is the one
    // case here that reads it back out of the database.
    ...identityArrangement(2),
  ];
  await expect.poll(() => arrangement(page)).toEqual(dragged);

  await saveAndLeave(page);

  await page.goto(`/es/pages/${own}/edit`);
  await expect(page.getByTestId("section-card").first()).toBeVisible();
  await expect.poll(() => arrangement(page)).toEqual(dragged);
});
