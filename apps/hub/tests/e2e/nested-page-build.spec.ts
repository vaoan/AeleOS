import { expect, test } from "./support/auto-cleanup";
import {
  createTestIdentity,
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
  selectBlock,
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
//  * **An empty place keeps its width.** A section holding fewer things than
//    it has room for is still exactly as many columns wide on a stranger's
//    screen, and every unfilled one draws nothing. If that fails, "a shape
//    somebody chose does not change under them" is decoration: `spaces` would
//    mean whatever the content happened to fill.
//
// Both are asserted after a full round trip — built, saved, REOPENED, saved
// again, and finally read by a signed-out stranger — because every one of those
// steps has destroyed somebody's page on this project at least once. The reopen
// in particular is the assertion a one-way test passes happily while the save
// retypes what it stored.
//
// **Rewritten for the palette drag-to-add feature (2026-09-06), and the shape
// of what changed is worth stating before the numbers below.** The single
// global Add this file used to drive filled a container's first empty PLACE
// with no growth at all — a true in-place replace. The persistent Palette tab
// that replaced it can only ever SPLICE-INSERT: `domain/palette-insert.ts`'s
// own `insertBlockAt` writes through `insertAt`, a pure splice, so dropping a
// leaf or a container onto an existing null inserts BEFORE it rather than
// consuming it — the null survives, shifted one position later. There is no
// production-reachable control any more that fills an existing empty place
// without growing its container. `support/editor.ts`'s own `addBlock` targets
// the first still-empty existing place through its `firstOpenPlace` helper,
// which is the closest available approximation: content lands at increasing
// indices in the order it was added — 0, then 1 — exactly as it did before,
// but every container built from a freshly dragged section or nested
// container starts with `PICKER_SPACES` (two) empty places, and those two
// survive every insertion, shifted to the end. So a section that adds two
// pieces of content ends up with FOUR real places, not two: the two just
// added, at the front, and the two it always started with, now trailing
// after them — never fewer, because nothing here can consume a null, only
// insert around it. `ACROSS` is 4 for exactly this reason, matching what the
// two additions below actually produce rather than a number chosen for its
// own sake.

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

/**
 * A laptop, which is where a four-space section has room to be four.
 *
 * `SPACE_CLASS` lays four tracks at `@xl` — the section's OWN width via a
 * container query rather than a viewport one — and the page's column is
 * about 1232px here, so the shape resolves rather than collapsing to fewer
 * columns.
 */
const LAPTOP = { width: 1280, height: 900 };

/** Tailwind's `gap-4`, in pixels: the gutter a grid lays between places. */
const GAP = 16;

/**
 * How many places across the outer section ends up with.
 *
 * Two pieces of content dragged onto a freshly created section, which
 * starts with `PICKER_SPACES` (two) empty places neither insertion can
 * consume — see this file's own header comment. `2 + 2 = 4`.
 */
const ACROSS = 4;

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

  // **A fresh fursona already carries one section — the identity header,
  // path `"0"`.** `withRequiredBlocks` composes it the moment the form
  // opens (`fursona-editor.tsx`'s own default), so the section this test
  // builds by hand is the SECOND top-level one, path `"1"`. The stranger
  // read at the end of this test already accounts for this: two sections,
  // and the identity header's four leaves alongside this test's own three.
  //
  // THE SHAPE, CHOSEN AFTER THE SECTION EXISTS — the palette's own layout
  // thumbnails always start a section at two places (`PICKER_SPACES`);
  // `addSection` reshapes it to four across through its own Layout tab, so
  // what travels through storage is still a number this test picked rather
  // than the default.
  await addSection(page, String(ACROSS));

  // Adding selects the new section on its own Layout tab, where its name,
  // mode and spaces all already live together — no tab switch is needed
  // between any of them.
  await page.getByTestId("section-name").fill("Un mundo");
  await page.getByTestId("section-mode").selectOption("grid");

  // A PIECE OF CONTENT AT THE FIRST OPEN PLACE. Dragged through the
  // persistent Palette tab onto the section's own first still-empty place —
  // `addBlock`'s `firstOpenPlace` helper finds it directly, since the
  // section starts with two empty places and neither has been touched yet.
  await addBlock(page, { kind: "text" }, "1");
  await page.getByTestId("leaf-title").fill("Primera cosa");
  await page.getByTestId("leaf-description").fill("La primera.");

  // A SECTION AT THE SECOND OPEN PLACE, which is the act no editor could
  // perform before this phase — and then something inside THAT, so the tree
  // is genuinely two levels rather than one level with a container sitting
  // empty in it. Dragged onto the same outer section again: its own first
  // still-empty place is now its SECOND one, since the leaf above just took
  // the first.
  await addBlock(page, { mode: "grid" }, "1");
  await page.getByTestId("nested-name").fill("Dentro");
  // An arrangement of its own, and deliberately not the one it was placed
  // with: a nested container that kept its parent's `grid` would round-trip
  // identically whether or not its own mode was ever stored.
  await page.getByTestId("nested-mode").selectOption("timeline");

  // **Both drops landed where this test named them, and now the outer
  // section carries exactly `ACROSS` real places — the two just added, at
  // the front, and its own original two empty ones, shifted to the end by
  // each insertion (see this file's own header comment).** `data-canvas-path`
  // is also mounted, always, on the container's own virtual append slot
  // (`AppendSlot`, Task 6 of the palette drag-to-add feature) — one past the
  // last real place, carrying its own `data-testid="canvas-append-slot"`.
  // Excluded here so this count keeps meaning "how many real places", not
  // "real places plus the one virtual insertion point past them".
  //
  // **A prefix match alone is not enough, and the first version of this
  // count did not know it.** `[data-canvas-path^="1-"]` matches every
  // DESCENDANT under section "1", not only its own direct children — the
  // nested grid built two paragraphs down carries its own two starting
  // empty places at "1-1-0" and "1-1-1", which also start with "1-" and
  // were silently counted alongside the outer section's own four,
  // reporting 6 where the outer section's own shape is 4. So this filters
  // to paths exactly one segment past the prefix — two hyphen-joined
  // segments in total, `"1-<n>"` and nothing deeper — which is what "the
  // outer section's own real places" actually means. Filtered via
  // `evaluateAll` rather than a compound selector string, which
  // `no-restricted-syntax` refuses for any `data-testid` literal reaching
  // `.locator()`.
  const realPlaceCount = await page
    .locator('[data-canvas-path^="1-"]')
    .evaluateAll(
      (els) =>
        els.filter(
          (el) =>
            el.getAttribute("data-testid") !== "canvas-append-slot" &&
            el.getAttribute("data-canvas-path")?.split("-").length === 2,
        ).length,
    );
  expect(realPlaceCount).toBe(ACROSS);

  // Adding a CONTAINER selects IT, so the nested container built above is
  // still selected here, and these two adds target it — its own first still
  // empty place, then its second (the first is taken by the time the second
  // runs, exactly the same "each drop lands at the next open place" rule the
  // outer section's own two drops above already demonstrated).
  await addBlock(page, { kind: "text" }, "1-1");
  await page.getByTestId("leaf-title").fill("Cosa anidada");
  await addBlock(page, { kind: "text" }, "1-1");
  await page.getByTestId("leaf-title").fill("Segunda anidada");

  // AND THE LAST TWO PLACES ARE LEFT EMPTY, on purpose. They are the ones
  // the public page has to keep a column for each. An empty place carries no
  // `data-block-path` at all — only the wrapping `data-canvas-path` — which
  // is what makes it categorically unselectable rather than merely
  // unaddressed by a helper.
  for (const path of ["1-2", "1-3"]) {
    await expect(
      page.locator(`[data-canvas-path="${path}"]`).getByTestId("public-space"),
    ).toHaveCount(1);
    await expect(page.locator(`[data-block-path="${path}"]`)).toHaveCount(0);
  }

  await saveAndLeave(page);

  // THE ROUND TRIP. Written as a tree, read back, and the same tree — its
  // shape, its arrangements, its words, and the position of the places
  // holding nothing. Selecting a block directly by its own canvas path
  // replaces the old breadcrumb-and-Items drill-down entirely.
  await page.goto(`/es/pages/${handle}/edit`);
  await selectBlock(page, "1");
  await expect(page.getByTestId("section-name")).toHaveValue("Un mundo");
  await expect(page.getByTestId("section-mode")).toHaveValue("grid");
  await expect(page.getByTestId("section-spaces")).toHaveValue(String(ACROSS));

  await selectBlock(page, "1-0");
  await expect(page.getByTestId("leaf-title")).toHaveValue("Primera cosa");
  await expect(page.getByTestId("leaf-description")).toHaveValue("La primera.");

  // THE SECOND PLACE IS STILL A SECTION rather than a piece of content, which
  // is what a conversion that flattened on the way through would have lost.
  await selectBlock(page, "1-1");
  await expect(page.getByTestId("nested-name")).toHaveValue("Dentro");
  await expect(page.getByTestId("nested-mode")).toHaveValue("timeline");
  // The nested container also started at `PICKER_SPACES` (two) and never had
  // its own WIDTH reshaped, so its `spaces` field stays two — unlike the
  // outer section, which was reshaped to four AFTER starting at two. That is
  // a claim about `spaces` alone, not about how many real places it holds:
  // its own two additions grew it exactly the same way the outer section's
  // did, from two starting empty places to four (see the two trailing
  // "1-1-2"/"1-1-3" checks below), because `insertBlockAt` splice-inserts
  // regardless of mode. Compare this to `ACROSS` above: the outer section's
  // WIDTH and its starting place count diverged on purpose; the nested
  // one's WIDTH did not, while its place count grew identically either way.
  await expect(page.getByTestId("nested-spaces")).toHaveValue("2");
  await selectBlock(page, "1-1-0");
  await expect(page.getByTestId("leaf-title")).toHaveValue("Cosa anidada");
  await selectBlock(page, "1-1-1");
  await expect(page.getByTestId("leaf-title")).toHaveValue("Segunda anidada");

  // THE EMPTY PLACES CAME BACK EMPTY AND CAME BACK LAST, both inside the
  // nested container and inside the outer one. Position is the model: a
  // tidy that dropped a null would leave a shorter section, and one that
  // closed a gap would leave an empty place somewhere other than where it
  // was left.
  for (const path of ["1-2", "1-3", "1-1-2", "1-1-3"]) {
    await expect(
      page.locator(`[data-canvas-path="${path}"]`).getByTestId("public-space"),
    ).toHaveCount(1);
    await expect(page.locator(`[data-block-path="${path}"]`)).toHaveCount(0);
  }

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

    // THE ASSERTION THE MODEL TURNS ON. Four tracks for a four-space
    // section, four places for four entries, and the last two of them each
    // exactly a track wide while drawing nothing at all.
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

    // Stated as coordinates rather than as DOM indices: the two empty places
    // are the THIRD and FOURTH columns. Were either collapsed, it would sit
    // earlier — or not be there at all.
    for (const index of [2, 3]) {
      expect(
        Math.abs(boxes[index]!.x - boxes[0]!.x - index * (tracks[0]! + GAP)),
      ).toBeLessThan(2);
      // And they really are empty: room, not a broken box.
      expect(boxes[index]!.text).toBe("");
    }
    await expect(anonymous.getByTestId("public-space")).toHaveCount(4);
  } finally {
    await stranger.close();
  }
});
