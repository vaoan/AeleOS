import { expect, test } from "./support/auto-cleanup";
import {
  createTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addBlock, addSection, selectBlock } from "./support/editor";

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
  // **Compared against HALF the mark's own height, not the whole of it
  // (final review, 2026-09-11).** `< mark!.height` also passes at a
  // difference of 0 — a mark drawn flush with "1-1", filling its box rather
  // than straddling the boundary above it, the exact "fills the block
  // rather than falling between two" fault this branch exists to rule out
  // — so that bound could not tell "straddles the boundary" from "fills the
  // block". `-translate-y-1/2` puts the mark's own top edge at HALF its
  // height above the neighbour's, so the true difference is `mark!.height /
  // 2`; the tolerance is sub-pixel rounding, not slack for either fault.
  const straddle = Math.abs(mark!.y - neighbour!.y);
  expect(Math.abs(straddle - mark!.height / 2)).toBeLessThan(2);

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

// THE SAME COMPARISON FOR A CANVAS MOVE, ACROSS A LEAF'S OWN MIDLINE.
//
// A `before`/`after` target in a linear container is decided by which half
// of the hovered block the pointer is in, on EVERY collision check. The mark
// is published from `onDragOver`, and dnd-kit fires that only when the
// resolved `over` id CHANGES — so a pointer that enters a block's top half
// and slides into its bottom half without leaving the block keeps the
// `before` mark while the target the drop will use has already become
// `after`. Found 2026-09-17 by `drag-on-a-scrolled-canvas.spec.ts`, whose
// mid-drag scroll happened to enter a block at one half and settle in the
// other; the scroll was incidental, this is the fault. A palette drag is
// immune: its target is named by the id alone (`insertMarkFor`), never by an
// edge.
//
// **THE DISCRIMINATING GESTURE IS TWO HOVERS INSIDE ONE BLOCK.** Enter "1-2"
// at its upper quarter (mark `before`), slide to its lower quarter WITHOUT
// crossing out of it, and only then read the mark and drop. A case that
// arrived at the lower quarter directly would enter the block already
// resolved to `after` and could not tell the mark that follows the pointer
// from the one frozen at entry (root rule 27).

test("a canvas move's mark follows the pointer across a leaf's midline, and the drop lands where the mark says", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // Three named `text` leaves in a STACK section "1": A at "1-0", B at
  // "1-1", C at "1-2". A stack, not the grid `addSection` builds, because a
  // canvas move inside a positional container is a `place` swap with no
  // edge to get wrong; only a linear container decides `before`/`after`
  // by the pointer's half. Named so the landing can be read back by title.
  await addBlock(page, { mode: "stack" }, "");
  await addBlock(page, { kind: "text" }, "1");
  await page.getByTestId("leaf-title").fill("A");
  await addBlock(page, { kind: "text" }, "1");
  await page.getByTestId("leaf-title").fill("B");
  await addBlock(page, { kind: "text" }, "1");
  await page.getByTestId("leaf-title").fill("C");
  await expect(page.locator('[data-block-path="1-2"]')).toHaveAttribute(
    "data-block-kind",
    "text",
  );

  // Lifts A by its own grip, which renders once the block is selected, and
  // clears `DRAG_THRESHOLD` (8px) before crossing to the target.
  await selectBlock(page, "1-0");
  const grip = await page.getByTestId("canvas-drag-1.0").boundingBox();
  expect(grip).not.toBeNull();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip!.x + grip!.width / 2 + 20,
    grip!.y + grip!.height / 2,
  );

  const marksOnPage = () =>
    page
      .getByTestId(/^canvas-drop-(before|after|place)$/)
      .evaluateAll((elements) =>
        elements.map(
          (element) =>
            `${element.getAttribute("data-testid")} on ${element
              .closest("[data-canvas-path]")
              ?.getAttribute("data-canvas-path")}`,
        ),
      );

  // Enters C at its upper quarter: `before` C.
  const target = page.locator('[data-canvas-path="1-2"]');
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const centreX = box!.x + box!.width / 2;
  await page.mouse.move(centreX, box!.y + box!.height / 4, { steps: 8 });
  await expect.poll(marksOnPage).toEqual(["canvas-drop-before on 1-2"]);

  // Slides to C's lower quarter without leaving C. THE CORE PROOF, part one:
  // the mark is `after` C now, because that is what the drop will do.
  await page.mouse.move(centreX, box!.y + (box!.height * 3) / 4, { steps: 8 });
  await expect.poll(marksOnPage).toEqual(["canvas-drop-after on 1-2"]);

  await page.mouse.up();
  await page.evaluate(
    // eslint-disable-next-line no-restricted-syntax -- dnd-kit's 50ms click-swallow window, see above.
    () => new Promise((done) => setTimeout(done, 100)),
  );

  // THE CORE PROOF, part two: A landed AFTER C — spliced out of index 0 and
  // in at the end — so the order is B, C, A.
  const titleAt = async (path: string) => {
    await selectBlock(page, path);
    return page.getByTestId("leaf-title").inputValue();
  };
  expect(await titleAt("1-0")).toBe("B");
  expect(await titleAt("1-1")).toBe("C");
  expect(await titleAt("1-2")).toBe("A");
});
