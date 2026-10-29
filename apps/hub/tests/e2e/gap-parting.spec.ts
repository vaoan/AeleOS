import type { Page } from "@playwright/test";
import { expect, test } from "./support/auto-cleanup";
import {
  createTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addBlock, selectBlock } from "./support/editor";

// WHAT THIS SUITE IS FOR (2026-10-27).
//
// A drag in a list opens a real gap that parts the blocks around it. The
// owner's condition for it: the page must never lose control of where
// things go while it animates. Three faults would break that, and each case
// below holds one of them, measured on a stack of three named leaves:
//
// 1. A gap opening at the lift, beside the lifted block, for a drop that
//    changes nothing — the whole page dropped 48px the moment a block was
//    picked up.
// 2. A pointer in the space BETWEEN two siblings falling through to their
//    container, so the gap jumped to "before the whole section" and back as
//    the pointer crossed each space.
// 3. The gap feeding back into the target: an opening gap grows its block,
//    dnd-kit re-measures it, and a target decided against the moved page
//    moves the gap. With the pointer held still, nothing may keep moving.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

/**
 * Waits real time in the page, for reads that must happen after an animation
 * or across a still interval — the same wait dnd-kit's click-swallow window
 * gets in `drop-mark-matches-landing.spec.ts`.
 *
 * @param page - the editor page.
 * @param ms - how long.
 */
async function pause(page: Page, ms: number): Promise<void> {
  await page.evaluate(
    // eslint-disable-next-line no-restricted-syntax -- an interval of real time is what is being waited for, not a condition.
    (wait) => new Promise((done) => setTimeout(done, wait)),
    ms,
  );
}

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test("a gap opens only where the drop moves something, and holds still under a still pointer", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  // A stack section "1" holding A, B, C at "1-0", "1-1", "1-2".
  await addBlock(page, { mode: "stack" }, "");
  for (const title of ["A", "B", "C"]) {
    await addBlock(page, { kind: "text" }, "1");
    await page.getByTestId("leaf-title").fill(title);
  }

  const topOf = async (path: string) =>
    Math.round(
      (await page.locator(`[data-block-path="${path}"]`).boundingBox())!.y,
    );
  const ghostHost = () =>
    page
      .getByTestId("canvas-gap-ghost")
      .evaluateAll((elements) =>
        elements.map((element) =>
          element
            .closest("[data-canvas-path]")
            ?.getAttribute("data-canvas-path"),
        ),
      );

  await selectBlock(page, "1-0");
  const cTop = await topOf("1-2");
  const a = (await page.locator('[data-canvas-path="1-0"]').boundingBox())!;
  const b = (await page.locator('[data-canvas-path="1-1"]').boundingBox())!;
  const c = (await page.locator('[data-canvas-path="1-2"]').boundingBox())!;
  const x = c.x + c.width / 2;

  // FAULT 1: lifting A opens nothing. The pointer is still over A, whose
  // own gaps would drop it where it is. A gap lives INSIDE the frame of the
  // block it opens above, so what moves is the block (`data-block-path`),
  // never its frame's top.
  const grip = (await page.getByTestId("canvas-drag-1.0").boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 20, grip.y + grip.height / 2);
  await page.mouse.move(x, a.y + a.height / 2, { steps: 4 });
  await pause(page, 300); // the gap animates for 150ms; this waits past it before reading that nothing opened.
  expect(await ghostHost()).toEqual([]);
  expect(await topOf("1-2")).toBe(cTop);

  // FAULT 2: the space between B and C belongs to the gap between them.
  // It sits inside no leaf, only the section, which used to win it.
  await page.mouse.move(x, (b.y + b.height + c.y) / 2, { steps: 6 });
  await expect.poll(ghostHost).toEqual(["1-2"]);
  await expect(page.getByTestId("canvas-drop-before")).toHaveCount(0);
  const marks = await page
    .getByTestId(/^canvas-drop-(before|after|place)$/)
    .evaluateAll((elements) =>
      elements.map((element) =>
        element.closest("[data-canvas-path]")?.getAttribute("data-canvas-path"),
      ),
    );
  expect(marks).not.toContain("1");

  // FAULT 3: with the pointer held still on C's original upper half, the
  // gap above C opens to its full height and then nothing moves. C is read
  // six times across 600ms; a feedback loop between the gap and the target
  // would show as C (or the ghost's host) changing between reads.
  await page.mouse.move(x, c.y + c.height / 4, { steps: 4 });
  await expect.poll(ghostHost).toEqual(["1-2"]);
  await pause(page, 300); // past the 150ms opening, so the reads below see the settled page.
  const settled = await topOf("1-2");
  expect(settled).toBeGreaterThan(cTop);
  for (let read = 0; read < 6; read += 1) {
    await pause(page, 100); // sampling a still page over time is the assertion itself.
    expect(await topOf("1-2")).toBe(settled);
    expect(await ghostHost()).toEqual(["1-2"]);
  }

  // FAULT 3, where it bites: C's lower quarter. The drop is `after` C, so the
  // gap opens BELOW C — which grows C's own frame and moves its midline
  // down past the pointer. Decided against that re-measured frame, the
  // target would flip to `before` C and the gap to C's top; decided against
  // the page at the lift, it stays below C, under a still pointer.
  await page.mouse.move(x, c.y + (c.height * 3) / 4, { steps: 4 });
  await pause(page, 300); // past the 150ms opening and any flip it would cause.
  const ghostBelowC = async () => {
    const ghost = (await page.getByTestId("canvas-gap-ghost").boundingBox())!;
    const block = (await page
      .locator('[data-block-path="1-2"]')
      .boundingBox())!;
    return ghost.y >= block.y + block.height - 1;
  };
  // The stack keeps an empty place after C, so "after C" opens at that
  // place's top rather than at C's own bottom; either way it is below C.
  const below = await ghostHost();
  expect(below).toHaveLength(1);
  for (let read = 0; read < 6; read += 1) {
    await pause(page, 100); // sampling a still page over time is the assertion itself.
    expect(await ghostHost()).toEqual(below);
    expect(await ghostBelowC()).toBe(true);
  }

  await page.mouse.up();
  await expect(page.getByTestId("canvas-gap-ghost")).toHaveCount(0);
  await expect(page.getByTestId("canvas-gap-slot")).toHaveCount(0);
});
