import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import {
  addBlock,
  addSection,
  handleFor,
  saveAndLeave,
  startFursona,
} from "./support/editor";
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

  // THE SHAPE, CHOSEN AFTER THE SECTION EXISTS — the picker's own layout
  // options always start a section at two places, matching how nesting
  // already worked; `addSection` reshapes it to three across through its own
  // Options control, so what travels through storage is still a number this
  // test picked rather than the default.
  await addSection(page, String(ACROSS));

  // Adding selects the new section, and `addSection` leaves it on Options —
  // where the fields below already live.
  await page.getByTestId("section-name").fill("Un mundo");
  await page.getByTestId("section-mode").selectOption("grid");
  await page.getByTestId("inspector-tab-items").click();
  // **A width is not a capacity.** `section-spaces` (set inside `addSection`)
  // only reshapes how many places lay ACROSS — the container's own
  // `children` stays at the picker's default of two until something actually
  // grows it. `add-place` appends the third, explicitly empty place this
  // test's own three-across shape needs; this comment used to claim Items
  // "exposes only its three immediate places" already, which was false the
  // moment it was written.
  await page.getByTestId("add-place").click();
  await expect(page.getByTestId("inspector-item-row")).toHaveCount(ACROSS);

  // A PIECE OF CONTENT IN THE FIRST PLACE.
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    kind: "text",
  });
  await page.getByTestId("leaf-title").fill("Primera cosa");
  await page.getByTestId("leaf-description").fill("La primera.");
  await page.getByTestId("inspector-back").click();

  // A SECTION IN THE SECOND, which is the act no editor could perform before
  // this phase — and then something inside THAT, so the tree is genuinely two
  // levels rather than one level with a container sitting empty in it.
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    mode: "grid",
  });
  await page.getByTestId("inspector-tab-options").click();
  await page.getByTestId("nested-name").fill("Dentro");
  // An arrangement of its own, and deliberately not the one it was placed
  // with: a nested container that kept its parent's `grid` would round-trip
  // identically whether or not its own mode was ever stored.
  await page.getByTestId("nested-mode").selectOption("timeline");
  await page.getByTestId("inspector-tab-items").click();
  await expect(page.getByTestId("inspector-item-row")).toHaveCount(2);
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    kind: "text",
  });
  await page.getByTestId("leaf-title").fill("Cosa anidada");
  await page.getByTestId("inspector-back").click();
  await addBlock(page.getByTestId("inspector-empty-place").first(), {
    kind: "text",
  });
  await page.getByTestId("leaf-title").fill("Segunda anidada");
  await page.getByTestId("inspector-back").click();
  await page.getByTestId("inspector-back").click();

  // AND THE THIRD PLACE IS LEFT EMPTY, on purpose. It is the one the public
  // page has to keep a column for.
  await expect(page.getByTestId("inspector-empty-place")).toHaveCount(1);

  await saveAndLeave(page);

  // THE ROUND TRIP. Written as a tree, read back, and the same tree — its
  // shape, its arrangements, its words, and the position of the place holding
  // nothing.
  await page.goto(`/es/pages/${handle}/edit`);
  await page.getByTestId("select-page").click();
  await page.getByTestId("inspector-item-open").last().click();
  await page.getByTestId("inspector-tab-options").click();
  await expect(page.getByTestId("section-name")).toHaveValue("Un mundo");
  await expect(page.getByTestId("section-mode")).toHaveValue("grid");
  await expect(page.getByTestId("section-spaces")).toHaveValue(String(ACROSS));
  await page.getByTestId("inspector-tab-items").click();

  await page.getByTestId("inspector-item-open").first().click();
  await expect(page.getByTestId("leaf-title")).toHaveValue("Primera cosa");
  await expect(page.getByTestId("leaf-description")).toHaveValue("La primera.");
  await page.getByTestId("inspector-back").click();

  // THE SECOND PLACE IS STILL A SECTION rather than a piece of content, which
  // is what a conversion that flattened on the way through would have lost.
  await page.getByTestId("inspector-item-open").nth(1).click();
  await page.getByTestId("inspector-tab-options").click();
  await expect(page.getByTestId("nested-name")).toHaveValue("Dentro");
  await expect(page.getByTestId("nested-mode")).toHaveValue("timeline");
  await expect(page.getByTestId("nested-spaces")).toHaveValue("2");
  await page.getByTestId("inspector-tab-items").click();
  await page.getByTestId("inspector-item-open").first().click();
  await expect(page.getByTestId("leaf-title")).toHaveValue("Cosa anidada");
  await page.getByTestId("inspector-back").click();
  await page.getByTestId("inspector-item-open").nth(1).click();
  await expect(page.getByTestId("leaf-title")).toHaveValue("Segunda anidada");
  await page.getByTestId("inspector-back").click();
  await page.getByTestId("inspector-back").click();

  // THE EMPTY PLACE CAME BACK EMPTY AND CAME BACK THIRD. Position is the
  // model: a tidy that dropped the null would leave a two-place section, and
  // one that closed the gap would leave the section at three with the empty
  // one somewhere else.
  expect(
    await page
      .getByTestId("inspector-item-row")
      .evaluateAll((rows) =>
        rows.map((row) =>
          row.querySelector('[data-testid="inspector-empty-place"]')
            ? "empty"
            : "occupied",
        ),
      ),
  ).toEqual(["occupied", "occupied", "empty"]);

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
    // Plus the identity section the editor opened with and the save stored,
    // whose four leaves — portrait, name, handle, owner — join the count.
    await expect(anonymous.getByTestId("public-section")).toHaveCount(2);
    await expect(anonymous.getByTestId("public-leaf")).toHaveCount(3 + 4);

    // THE NESTING, AS A STRANGER SEES IT. The nested container kept its own
    // arrangement — a `timeline` where its parent is a `grid` — and it is
    // INSIDE the parent's grid rather than beside it, which is the assertion a
    // flattened page would still pass on counts alone.
    // Scoped to the section this test built, which is the last one: the
    // identity section above it is a `grid` too, so a page-wide locator
    // matches both and every measurement below would be taken on whichever
    // came first.
    const grid = anonymous
      .getByTestId("public-section")
      .last()
      .getByTestId("block-grid");
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
