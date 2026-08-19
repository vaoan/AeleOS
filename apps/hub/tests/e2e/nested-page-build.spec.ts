import { expect, test, type Locator } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { handleFor, saveAndLeave, startFursona } from "./support/editor";
import { placesOf, tracksOf } from "./support/grid";

// THE TEST THIS WHOLE PHASE EXISTS FOR.
//
// The block model has been storable since `#157` and renderable since the
// phase before this one, and until the editor landed it was reachable by
// NOBODY: the only writer was a flat editor behind a conversion shim, so no
// page in the database was nested and no person could make one. Every other
// spec here either seeds a tree straight into the database — see
// `support/blocks.ts` — or drives a template, which is a tree somebody else
// wrote. Neither answers the question the phase was opened on: can a person
// build one?
//
// So this file builds a page from nothing, through the interface, and asserts
// the two things that make the model worth having:
//
//  * **A section holds a SECTION.** A place is one thing, and the thing may
//    itself be an arrangement — which is the whole difference between a tree
//    and a list with a nicer name. A page that nests only in the fixture proves
//    the renderer; a page that nests because somebody clicked proves the
//    product.
//  * **An empty place keeps its width.** A three-space section holding two
//    things is still three columns wide on a stranger's screen, and the third
//    draws nothing. If that fails, "a shape somebody chose does not change
//    under them" is decoration: `spaces` would mean whatever the content
//    happened to fill.
//
// Both are asserted after a full round trip — built, saved, REOPENED, saved
// again, and finally read by a signed-out stranger — because every one of those
// steps has destroyed somebody's page on this project at least once. The reopen
// in particular is the assertion a one-way test passes happily while the save
// retypes what it stored.
//
// Locators are structural (test id, tag, position), never role or text: this
// suite runs in Spanish, and a section's own name is data rather than a
// catalogue string. The one exception is the nested section's HEADING, which is
// asserted by its text precisely because that text is the author's.
//
// It runs against the LIVE Supabase project and creates a real actor, exactly
// as `editor-saves-page.spec.ts` does; the `actors` row survives by design,
// since deletion is soft.

// Serial and generous: the one test walks a sign-in, a create, three saves, two
// editor loads and a stranger's read. The default 30 seconds covers about a
// third of that, and what it produces is a timeout at whichever step happened
// to be running.
test.describe.configure({ mode: "serial", timeout: 180_000 });

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
 * A laptop, which is where a three-space section has room to be three.
 *
 * `SPACE_CLASS` lays three tracks at `@lg` — 32rem of the section's OWN width,
 * a container query rather than a viewport one — and the page's column is
 * about 1232px here, so the shape resolves rather than collapsing to one.
 */
const LAPTOP = { width: 1280, height: 900 };

/** Tailwind's `gap-4`, in pixels: the gutter a grid lays between places. */
const GAP = 16;

/** How many places across the section is built with. */
const ACROSS = 3;

/**
 * What is IN each place of a container's places row, in order.
 *
 * A place is addressed by POSITION and by nothing else — the same claim
 * `BlockPath` makes — so the assertions below name the first, second and third
 * child of the row rather than looking for what they expect to find in it.
 * That is what lets "the empty one is still third" be a failure rather than a
 * different query.
 *
 * **Two levels, because a place is its own element now.** Each direct child of
 * the row is the `BlockSlot` wrapper — the thing the drag library measures,
 * carrying `place-<path>` — and its one child is the card, the leaf editor or
 * the empty-place invitation. The wrapper is a grid item exactly where the
 * content used to be one, so nothing about the ORDER changed; only the depth
 * did.
 *
 * @param places - the element carrying the `places` test id.
 * @returns a locator over what fills its places, in the order they are laid.
 */
const eachPlace = (places: Locator): Locator => places.locator("> * > *");

test("a section inside a section is built by hand, saved, reopened and read by a stranger", async ({
  page,
  browser,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.setViewportSize(LAPTOP);

  await page.goto("/es/me");
  const address = (await page.getByTestId("my-address").innerText()).trim();
  expect(address).not.toBe("");

  const handle = handleFor("nest");
  await startFursona(page, handle, "Nested by hand");

  // THE SHAPE, CHOSEN BEFORE THERE IS ANYTHING TO PUT IN IT. Three across
  // rather than the two the control starts on, so what travels through storage
  // is a number this test picked.
  await page.getByTestId("new-section-spaces").selectOption(String(ACROSS));
  await page.getByTestId("add-section").click();

  const card = page.getByTestId("section-card").first();
  await card.getByTestId("section-name").fill("Un mundo");
  await card.getByTestId("section-mode").selectOption("grid");

  // The section's own row of places, not a nested one's: a nested container
  // carries a `places` row too, and it is deeper in the document.
  const places = card.getByTestId("places").first();
  await expect(eachPlace(places)).toHaveCount(ACROSS);

  // A PIECE OF CONTENT IN THE FIRST PLACE.
  await eachPlace(places).nth(0).getByTestId("add-content").click();
  await eachPlace(places).nth(0).getByTestId("leaf-title").fill("Primera cosa");
  await eachPlace(places)
    .nth(0)
    .getByTestId("leaf-description")
    .fill("La primera.");

  // A SECTION IN THE SECOND, which is the act no editor could perform before
  // this phase — and then something inside THAT, so the tree is genuinely two
  // levels rather than one level with a container sitting empty in it.
  await eachPlace(places).nth(1).getByTestId("add-nested").click();
  const nested = page.getByTestId("nested-card");
  await expect(nested).toHaveCount(1);
  await nested.getByTestId("nested-name").fill("Dentro");
  // An arrangement of its own, and deliberately not the one it was placed
  // with: a nested container that kept its parent's `grid` would round-trip
  // identically whether or not its own mode was ever stored.
  await nested.getByTestId("nested-mode").selectOption("timeline");

  const inside = nested.getByTestId("places");
  await expect(eachPlace(inside)).toHaveCount(2);
  await eachPlace(inside).nth(0).getByTestId("add-content").click();
  await eachPlace(inside).nth(0).getByTestId("leaf-title").fill("Cosa anidada");
  await eachPlace(inside).nth(1).getByTestId("add-content").click();
  await eachPlace(inside)
    .nth(1)
    .getByTestId("leaf-title")
    .fill("Segunda anidada");

  // AND THE THIRD PLACE IS LEFT EMPTY, on purpose. It is the one the public
  // page has to keep a column for.
  await expect(card.getByTestId("empty-place")).toHaveCount(1);

  await saveAndLeave(page);

  // THE ROUND TRIP. Written as a tree, read back, and the same tree — its
  // shape, its arrangements, its words, and the position of the place holding
  // nothing.
  await page.goto(`/es/pages/${handle}/edit`);
  await expect(page.getByTestId("section-card").first()).toBeVisible();

  const reopened = page.getByTestId("section-card").first();
  await expect(reopened.getByTestId("section-name")).toHaveValue("Un mundo");
  await expect(reopened.getByTestId("section-mode")).toHaveValue("grid");
  await expect(reopened.getByTestId("section-spaces")).toHaveValue(
    String(ACROSS),
  );

  const rePlaces = reopened.getByTestId("places").first();
  await expect(eachPlace(rePlaces)).toHaveCount(ACROSS);
  await expect(
    eachPlace(rePlaces).nth(0).getByTestId("leaf-title"),
  ).toHaveValue("Primera cosa");
  await expect(
    eachPlace(rePlaces).nth(0).getByTestId("leaf-description"),
  ).toHaveValue("La primera.");

  // THE SECOND PLACE IS STILL A SECTION rather than a piece of content, which
  // is what a conversion that flattened on the way through would have lost.
  await expect(eachPlace(rePlaces).nth(1)).toHaveAttribute(
    "data-testid",
    "nested-card",
  );
  const reNested = page.getByTestId("nested-card");
  await expect(reNested.getByTestId("nested-name")).toHaveValue("Dentro");
  await expect(reNested.getByTestId("nested-mode")).toHaveValue("timeline");
  await expect(reNested.getByTestId("nested-spaces")).toHaveValue("2");
  await expect(reNested.getByTestId("leaf-title").nth(0)).toHaveValue(
    "Cosa anidada",
  );
  await expect(reNested.getByTestId("leaf-title").nth(1)).toHaveValue(
    "Segunda anidada",
  );

  // THE EMPTY PLACE CAME BACK EMPTY AND CAME BACK THIRD. Position is the
  // model: a tidy that dropped the null would leave a two-place section, and
  // one that closed the gap would leave the section at three with the empty
  // one somewhere else.
  await expect(eachPlace(rePlaces).nth(2)).toHaveAttribute(
    "data-testid",
    "empty-place",
  );
  await expect(page.getByTestId("empty-place")).toHaveCount(1);

  // A second save over what was just reopened: the shape of the bug that once
  // wrote an empty page over somebody's sections.
  await saveAndLeave(page);

  const stranger = await browser.newContext({ viewport: LAPTOP });
  try {
    const anonymous = await stranger.newPage();
    const response = await anonymous.goto(`/es/${address}/${handle}`);
    expect(response?.status()).toBe(200);

    // One section, because only the outermost container is one; three pieces
    // of content, two of them inside the nested section.
    await expect(anonymous.getByTestId("public-section")).toHaveCount(1);
    await expect(anonymous.getByTestId("public-leaf")).toHaveCount(3);

    // THE NESTING, AS A STRANGER SEES IT. The nested container kept its own
    // arrangement — a `timeline` where its parent is a `grid` — and it is
    // INSIDE the parent's grid rather than beside it, which is the assertion a
    // flattened page would still pass on counts alone.
    const grid = anonymous.getByTestId("block-grid");
    await expect(grid).toHaveCount(1);
    await expect(grid.getByTestId("block-timeline")).toHaveCount(1);
    await expect(
      grid.getByTestId("block-timeline").getByTestId("public-leaf"),
    ).toHaveCount(2);
    // And the nested section carries the name its author wrote, at the heading
    // level its depth calls for. Located by TAG rather than by role, and read
    // rather than matched: this suite may neither query by an accessible name
    // nor assert with `toHaveText`, both of which are about catalogue strings —
    // and this string is the author's own. `h3` rather than any heading is the
    // claim that a container one level down does not repeat its parent's level.
    await expect(grid.locator("h3")).toHaveCount(1);
    expect((await grid.locator("h3").innerText()).trim()).toBe("Dentro");

    // THE ASSERTION THE MODEL TURNS ON. Three tracks for a three-space
    // section, three places for three entries, and the third of them exactly a
    // track wide while drawing nothing at all.
    const tracks = await tracksOf(grid);
    expect(tracks).toHaveLength(ACROSS);

    const boxes = await placesOf(grid);
    expect(boxes).toHaveLength(ACROSS);
    for (const [index, box] of boxes.entries()) {
      expect(
        Math.abs(box.width - tracks[0]!),
        `place ${index + 1} measured ${box.width}px against a track of ${tracks[0]}px`,
      ).toBeLessThan(2);
    }

    // Stated as a coordinate rather than as a DOM index: the empty place is in
    // the THIRD column. Were it collapsed, it would sit in the second — or not
    // be there at all.
    expect(
      Math.abs(boxes[2]!.x - boxes[0]!.x - (ACROSS - 1) * (tracks[0]! + GAP)),
    ).toBeLessThan(2);

    // And it really is empty: room, not a broken box.
    expect(boxes[2]!.text).toBe("");
    await expect(anonymous.getByTestId("public-space")).toHaveCount(1);
  } finally {
    await stranger.close();
  }
});
