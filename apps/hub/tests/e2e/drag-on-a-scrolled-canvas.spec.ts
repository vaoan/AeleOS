import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/auto-cleanup";
import {
  createTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import {
  container,
  leaf,
  seedPage,
  SEEDED_IDENTITY_SECTIONS,
} from "./support/blocks";
import { selectBlock } from "./support/editor";

// THE CASE THE DRAGGING SPEC NAMED AND NOTHING RAN: A DRAG ON A PAGE TALLER
// THAN THE VIEWPORT, WHERE THE CANVAS SCROLLS UNDER THE POINTER MID-DRAG.
//
// dnd-kit measures every droppable's rectangle at the drag's own start, in
// viewport coordinates, and the canvas is its own scroll container (see
// `editor-canvas-scroll.spec.ts`). If the canvas scrolls while a drag is in
// progress, every measured rectangle is now somewhere else on screen than
// where it was measured — and a collision function that reads the stale
// numbers draws its mark on, and lands the drop in, whichever block USED to
// sit at that screen position rather than the one that does now. The old
// `block-drag.spec.ts` kept this question out of the suite by choosing a
// viewport tall enough that nothing scrolled; it went on 2026-09-01, and the
// live canvas has been the drag surface since 2026-09-04, so the question is
// live. `block-drag.ts`'s TSDoc on `contains` names the gap; this file is the
// case that answers it.
//
// **THE DISCRIMINATING FIXTURE IS A TARGET THAT WAS BELOW THE FOLD WHEN THE
// DRAG BEGAN.** Each case lifts, reads every leaf's on-screen box, scrolls the
// canvas by wheel with the button still down, and picks as its target a leaf
// whose box was wholly below the canvas's visible port before the scroll and
// is wholly inside it after. A rectangle measured at the lift for that leaf
// says "off screen"; only a rectangle that follows the scroll says "here".
// The DOM's own hit test at the pointer is then the independent witness the
// mark is compared against. Without that precondition — a target already on
// screen at the lift, or a page short enough not to scroll — stale and fresh
// rectangles would be the same rectangles and the case could not tell them
// apart (root rule 27: name the wrong behaviour the fixture excludes, and ask
// whether it actually can).
//
// **THE FIXED SCREEN POINT IS THE TARGET'S OWN UPPER QUARTER, NOT THE
// CANVAS'S CENTRE.** A palette lift makes every container reserve real
// height for its append slot at `onDragStart`, so the page's own layout
// grows under the pointer, and a stack page has a gap between one section and
// the next; the canvas's geometric centre landed in exactly such a gap on
// the first run of this file, under nothing with a canvas path at all. The
// upper quarter of a leaf is unambiguously its `before` half — and the leaf
// is one that sits clear of the canvas's own auto-scroll bands, see
// `AUTO_SCROLL_BAND` below for what the second run of this file found.
//
// Both drag origins are covered because they take different paths through
// dnd-kit: a palette thumbnail lives OUTSIDE the canvas, so the canvas is not
// among the active node's own scrollable ancestors and only the targets
// move; a canvas leaf lives INSIDE it, so the source moves with the scroll as
// well and the library's `activeNodeScrollDelta` is in play. A leaf dropped
// before another leaf in a `stack` is a linear insertion for either origin —
// the source is spliced out and in at the index, never swapped (`applyDrop`).

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;
let handle = "";

// Sixteen sections of one `text` leaf each, plus the appended identity
// section at path "16": far taller than the 720px default viewport, without
// relying on editor chrome for height. Every leaf carries its own numbered
// title so a landing can be read back by the words on the block rather than
// by position alone.
const SECTIONS = 16;
const LONG_PAGE = Array.from({ length: SECTIONS }, (_, index) =>
  container({
    name_en: `Section ${index + 1}`,
    mode: "stack",
    children: [
      leaf({
        title_en: `Heading ${index + 1}`,
        description_en:
          "Enough content to make the authored page taller than the " +
          "viewport, so the canvas has somewhere to scroll to mid-drag.",
      }),
    ],
  }),
);

// A wheel of this many CSS pixels. The precondition below, not this number,
// is what proves a target moved from below the fold to on screen; the number
// only needs to be large enough that some leaf does, and 600 is most of a
// 720px viewport.
const WHEEL_DISTANCE = 600;

type Box = { x: number; y: number; width: number; height: number };

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  ({ handle } = await seedPage({
    userId: identity.userId,
    handlePrefix: "scrolldrag",
    displayName: "Drag on a scrolled canvas",
    blocks: LONG_PAGE,
  }));
});

async function openEditor(page: Page): Promise<Locator> {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/en/pages/${handle}/edit`);
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("block-preview")).toHaveCount(
    SECTIONS + SEEDED_IDENTITY_SECTIONS,
  );
  // The canvas, not the document, is what has somewhere to scroll — the
  // ownership `editor-canvas-scroll.spec.ts` proves — and it starts at the
  // top, so the wheel below has the whole page to move through.
  expect(
    await canvas.evaluate((element) => ({
      past: element.scrollHeight - element.clientHeight,
      top: element.scrollTop,
    })),
  ).toEqual({ past: expect.any(Number), top: 0 });
  expect(
    await canvas.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    ),
  ).toBeGreaterThan(WHEEL_DISTANCE);
  return canvas;
}

/** The on-screen box of every section's own leaf, by section index. */
async function leafBoxes(page: Page): Promise<(Box | null)[]> {
  const boxes: (Box | null)[] = [];
  for (let index = 0; index < SECTIONS; index += 1) {
    boxes.push(
      await page.locator(`[data-canvas-path="${index}-0"]`).boundingBox(),
    );
  }
  return boxes;
}

// dnd-kit's own auto-scroll: a pointer within this fraction of a scroll
// container's height from its top or bottom edge scrolls it, for as long as
// the pointer stays there (`defaultThreshold` in `@dnd-kit/core`). A target
// hovered inside that band keeps moving under the pointer after the wheel has
// settled — which is how an earlier run of this file drew its mark on a
// section whose leaf had just slid out from under the pointer — so a target
// only counts as on screen when it is wholly inside the middle of the port.
const AUTO_SCROLL_BAND = 0.2;

const below = (box: Box | null, port: Box): boolean =>
  box !== null && box.y >= port.y + port.height;
const inside = (box: Box | null, port: Box): boolean => {
  const band = port.height * AUTO_SCROLL_BAND;
  return (
    box !== null &&
    box.y >= port.y + band &&
    box.y + box.height <= port.y + port.height - band
  );
};

/**
 * The deepest `data-canvas-path` under a screen point, read from the real
 * hit-testing stack rather than from any rectangle dnd-kit holds — which is
 * the point: this is the independent witness the mark is compared against.
 * The floating `<DragOverlay>` preview sits under the pointer during a drag
 * and has no canvas path of its own, so it is skipped rather than answered.
 */
async function pathUnderPointer(
  page: Page,
  x: number,
  y: number,
): Promise<string | null> {
  return page.evaluate(
    ([px, py]) => {
      for (const element of document.elementsFromPoint(px, py)) {
        const host = element.closest("[data-canvas-path]");
        if (host) return host.getAttribute("data-canvas-path");
      }
      return null;
    },
    [x, y],
  );
}

/**
 * Scrolls the canvas by wheel at the pointer's current position and waits
 * until its `scrollTop` has stopped changing, so what follows reads a settled
 * layout rather than a frame mid-scroll. Resolves with the settled offset.
 */
async function wheelAndSettle(page: Page, canvas: Locator): Promise<number> {
  await page.mouse.wheel(0, WHEEL_DISTANCE);
  return canvas.evaluate(
    (element) =>
      new Promise<number>((resolve) => {
        let last = -1;
        const tick = (): void => {
          const now = element.scrollTop;
          if (now > 0 && now === last) resolve(now);
          else {
            last = now;
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
}

/**
 * With a drag already under way: parks the pointer over the canvas, scrolls
 * it, and picks the first leaf that was wholly below the visible port before
 * the scroll and is wholly inside it after — the precondition that makes the
 * rest of a case discriminating — then moves the pointer onto that leaf's
 * upper quarter and returns which section it belongs to and its box.
 */
async function scrollOntoAFreshLeaf(
  page: Page,
  canvas: Locator,
): Promise<{ section: number; leaf: Locator; box: Box }> {
  const port = await canvas.boundingBox();
  expect(port).not.toBeNull();
  const before = await leafBoxes(page);
  await page.mouse.move(port!.x + port!.width / 2, port!.y + port!.height / 2, {
    steps: 8,
  });

  // THE SCROLL, WITH THE BUTTON STILL DOWN.
  const settled = await wheelAndSettle(page, canvas);
  expect(settled).toBeGreaterThan(0);

  const after = await leafBoxes(page);
  const section = after.findIndex(
    (box, index) => below(before[index]!, port!) && inside(box, port!),
  );
  expect(
    section,
    "no leaf moved from below the fold to on screen — the scroll proved nothing",
  ).toBeGreaterThanOrEqual(0);
  const leaf = page.locator(`[data-canvas-path="${section}-0"]`);
  const box = after[section]!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 4, {
    steps: 8,
  });
  // The independent witness: the DOM's own hit test agrees the pointer is
  // over this leaf, and not over whichever block sat here before the scroll.
  expect(
    await pathUnderPointer(page, box.x + box.width / 2, box.y + box.height / 4),
  ).toBe(`${section}-0`);
  // And the hover itself moved nothing: the offset the wheel settled at is
  // the offset the mark is read against, or the witness above was read
  // against a layout that has since slid on.
  expect(await canvas.evaluate((element) => element.scrollTop)).toBe(settled);
  return { section, leaf, box };
}

/**
 * THE CORE PROOF, part one: exactly one landing mark on the whole page, it is
 * `before`, it belongs to the leaf under the pointer, and it straddles the
 * boundary above that leaf — translated up by half its own height, the same
 * reading `drop-mark-matches-landing.spec.ts` makes — rather than sitting on
 * whichever leaf occupied this screen position before the scroll.
 */
async function expectBeforeMarkOn(
  page: Page,
  leaf: Locator,
  path: string,
): Promise<void> {
  // Every mark on the page, named with its host, so a failure says WHERE the
  // editor drew instead — the stale block, the section, or nowhere — rather
  // than only that it was not here; and dnd-kit's own spoken answer beside
  // it, since the live region names what the library resolved the pointer
  // to whether or not a mark followed.
  const witness = async () => ({
    marks: await page
      .getByTestId(/^canvas-drop-(before|after|place)$/)
      .evaluateAll((elements) =>
        elements.map(
          (element) =>
            `${element.getAttribute("data-testid")} on ${element
              .closest("[data-canvas-path]")
              ?.getAttribute("data-canvas-path")}`,
        ),
      ),
    announced: await page.locator('[id^="DndLiveRegion-"]').textContent(),
  });
  await expect
    .poll(witness)
    .toEqual(
      expect.objectContaining({ marks: [`canvas-drop-before on ${path}`] }),
    );
  const mark = page.getByTestId("canvas-drop-before");
  const markBox = await mark.boundingBox();
  const leafBox = await leaf.boundingBox();
  expect(markBox).not.toBeNull();
  expect(leafBox).not.toBeNull();
  const straddle = Math.abs(markBox!.y - leafBox!.y);
  expect(Math.abs(straddle - markBox!.height / 2)).toBeLessThan(2);
}

/** Past `@dnd-kit/core`'s own 50ms post-drop click-swallow window. */
async function settleDrop(page: Page): Promise<void> {
  await page.evaluate(
    // eslint-disable-next-line no-restricted-syntax -- see the doc comment.
    () => new Promise((done) => setTimeout(done, 100)),
  );
}

test("a palette drop lands on the leaf under the pointer after the canvas scrolled mid-drag", async ({
  page,
}) => {
  const canvas = await openEditor(page);

  await page.getByTestId("panel-tab-palette").click();
  const thumbnail = page.locator('[data-palette-kind="link"]');
  await expect(thumbnail).toBeVisible();
  await thumbnail.scrollIntoViewIfNeeded();
  const source = await thumbnail.boundingBox();
  expect(source).not.toBeNull();

  // Clears `DRAG_THRESHOLD` (8px) before anything else, matching
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

  const target = await scrollOntoAFreshLeaf(page, canvas);
  await expectBeforeMarkOn(page, target.leaf, `${target.section}-0`);

  await page.mouse.up();
  await settleDrop(page);

  // THE CORE PROOF, part two: the block landed where that mark was — at
  // index 0 of the section that came on screen, pushing its own text leaf to
  // index 1 — and every earlier section still holds exactly its one leaf.
  const { section } = target;
  await expect(
    page.locator(`[data-block-path="${section}-0"]`),
  ).toHaveAttribute("data-block-kind", "link");
  await expect(
    page.locator(`[data-block-path="${section}-1"]`),
  ).toHaveAttribute("data-block-kind", "text");
  for (let index = 0; index < section; index += 1) {
    await expect(page.locator(`[data-block-path^="${index}-"]`)).toHaveCount(1);
  }
});

test("a canvas leaf dropped after the canvas scrolled mid-drag is inserted before the leaf under the pointer", async ({
  page,
}) => {
  const canvas = await openEditor(page);

  // The first authored section's leaf, lifted by its own grip — which only
  // renders once the block is selected. Path "1-0" carries "Heading 2".
  await selectBlock(page, "1-0");
  const grip = page.getByTestId("canvas-drag-1.0");
  const gripBox = await grip.boundingBox();
  expect(gripBox).not.toBeNull();
  await page.mouse.move(
    gripBox!.x + gripBox!.width / 2,
    gripBox!.y + gripBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    gripBox!.x + gripBox!.width / 2 + 20,
    gripBox!.y + gripBox!.height / 2,
  );

  const target = await scrollOntoAFreshLeaf(page, canvas);
  expect(target.section).toBeGreaterThan(1);
  await expectBeforeMarkOn(page, target.leaf, `${target.section}-0`);

  await page.mouse.up();
  await settleDrop(page);

  // THE CORE PROOF, part two: a linear insertion before the leaf under the
  // pointer. The lifted "Heading 2" now opens the section that came on
  // screen, that section's own heading follows it, and section 1 — spliced
  // out, not swapped — holds no block at all.
  // Read through the Properties panel's own title field rather than the
  // rendered text, the way `section-drag-reorder.spec.ts` reads names.
  const { section } = target;
  const titleAt = async (path: string) => {
    await selectBlock(page, path);
    return page.getByTestId("leaf-title").inputValue();
  };
  expect(await titleAt(`${section}-0`)).toBe("Heading 2");
  expect(await titleAt(`${section}-1`)).toBe(`Heading ${section + 1}`);
  await expect(page.locator('[data-block-path^="1-"]')).toHaveCount(0);
});
