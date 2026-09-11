import { expect, test } from "./support/auto-cleanup";
import {
  createTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addBlock, addSection } from "./support/editor";

// THE BROWSER PROOF THE LYING-MARK FAULT NEEDED: drag to a spot, read where
// the mark is, drop, and assert the block landed where the mark said.
// Nothing else in this repository makes that comparison — every existing
// case either reads the mark alone (`palette-drag-to-add.spec.ts`'s
// highlight cases) or reads the landing alone (its own drop cases), never
// both against each other for the SAME drag.
//
// **THE DISCRIMINATING FIXTURE IS A FILLED MID-LIST POSITION.** At an empty
// place, a gap and a place coincide, so a drop that draws its mark on the
// space and one that (wrongly) drew it on a block would still land in the
// same spot — the case would pass either way. Root rule 27: name the wrong
// behaviour a fixture excludes, and ask whether it actually can. A section
// with three FILLED text leaves gives a middle position with a real
// neighbour on both sides, which is what makes "the mark is ON the boundary
// above that neighbour, not around it" and "the block actually landed
// there" two separate, checkable claims rather than one that happens to
// agree with the other by construction.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test("a palette drop lands where the mark said, mid-list", async ({ page }) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // A section with three filled `text` leaves. The identity section that
  // opens every fresh draft is path "0"; this one is "1". `addSection`
  // starts it with `PICKER_SPACES` (two) empty places; the first two
  // `addBlock` calls fill both, and the third lands on the container's own
  // append slot — see `support/editor.ts`'s `firstOpenPlace` for why that is
  // the real, documented behaviour rather than an assumption. All three land
  // at increasing indices, so the result is "1-0"/"1-1"/"1-2", each a real
  // `text` leaf.
  await addSection(page, "1");
  await addBlock(page, { kind: "text" }, "1");
  await addBlock(page, { kind: "text" }, "1");
  await addBlock(page, { kind: "text" }, "1");
  await expect(page.locator('[data-block-path="1-0"]')).toHaveAttribute(
    "data-block-kind",
    "text",
  );
  await expect(page.locator('[data-block-path="1-1"]')).toHaveAttribute(
    "data-block-kind",
    "text",
  );
  await expect(page.locator('[data-block-path="1-2"]')).toHaveAttribute(
    "data-block-kind",
    "text",
  );

  // Lifts a `link` thumbnail — a different kind from the three leaves
  // already on the page, so the dropped block is distinguishable from what
  // it displaces rather than indistinguishable text meeting more text.
  await page.getByTestId("panel-tab-palette").click();
  const thumbnail = page.locator('[data-palette-kind="link"]');
  await expect(thumbnail).toBeVisible();
  await thumbnail.scrollIntoViewIfNeeded();
  const source = await thumbnail.boundingBox();
  expect(source).not.toBeNull();

  // Hovers the MIDDLE leaf, "1-1" — a filled, mid-list position. Its own
  // `EditableBlockFrame` wrapper registers the droppable
  // `insertMarkFor` resolves to a `before` mark on ("1-1" is exactly the
  // splice-before-index-1 target's own encoded path), so hovering the
  // existing block directly is what a real palette drag onto that boundary
  // looks like.
  const middle = page.locator('[data-canvas-path="1-1"]');
  await middle.scrollIntoViewIfNeeded();
  const middleBox = await middle.boundingBox();
  expect(middleBox).not.toBeNull();

  // Clears `DRAG_THRESHOLD` (8px) before crossing to the target, matching
  // `support/editor.ts`'s own `dragPaletteOnto` shape.
  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source!.x + source!.width / 2 + 20,
    source!.y + source!.height / 2,
  );
  await middle.scrollIntoViewIfNeeded();
  const settled = await middle.boundingBox();
  expect(settled).not.toBeNull();
  await page.mouse.move(
    settled!.x + settled!.width / 2,
    settled!.y + settled!.height / 2,
    { steps: 8 },
  );
  await page.getByTestId("canvas-drop-before").waitFor();

  // ONLY THE WINNER IS MARKED — the central claim of this whole branch,
  // named directly rather than left to `getByTestId`'s own strict-mode
  // resolution (which throws on more than one match for the SAME test id,
  // but says nothing about a second mark of a DIFFERENT kind existing
  // somewhere else on the page at once).
  expect(await page.getByTestId(/^canvas-drop-/).count()).toBe(1);

  // THE CORE PROOF, part one: read where the mark says the block will land.
  // `DropMark`'s `before` placement (`drop-mark.tsx`) sits at the top of its
  // host, translated up by half its own height, so it straddles the
  // boundary just above "1-1" rather than sitting inside its box — "on the
  // boundary above the neighbour, not around it."
  const mark = await page.getByTestId("canvas-drop-before").boundingBox();
  const neighbour = await page
    .locator('[data-canvas-path="1-1"]')
    .boundingBox();
  expect(mark).not.toBeNull();
  expect(neighbour).not.toBeNull();
  expect(Math.abs(mark!.y - neighbour!.y)).toBeLessThan(mark!.height);

  await page.mouse.up();
  // Past `@dnd-kit/core`'s own post-drop click-swallow window —
  // `PointerSensor.detach()` keeps a document-level capturing `click`
  // listener alive for exactly 50ms after a drop (root rule 41's measured
  // exemption class).
  await page.evaluate(
    // eslint-disable-next-line no-restricted-syntax -- see comment above.
    () => new Promise((done) => setTimeout(done, 100)),
  );

  // THE CORE PROOF, part two: the block actually landed where the mark
  // said. A `before` mark on "1-1" means the new block is inserted AT index
  // 1, pushing the two leaves that were at "1-1" and "1-2" down to "1-2" and
  // "1-3" — never overwriting, never landing at the end.
  await expect(page.locator('[data-block-path="1-0"]')).toHaveAttribute(
    "data-block-kind",
    "text",
  );
  await expect(page.locator('[data-block-path="1-1"]')).toHaveAttribute(
    "data-block-kind",
    "link",
  );
  await expect(page.locator('[data-block-path="1-2"]')).toHaveAttribute(
    "data-block-kind",
    "text",
  );
  await expect(page.locator('[data-block-path="1-3"]')).toHaveAttribute(
    "data-block-kind",
    "text",
  );
});
