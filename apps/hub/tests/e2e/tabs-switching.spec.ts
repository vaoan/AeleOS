import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";

// WHY THIS FILE EXISTS.
//
// `tabs` rests entirely on a real browser agreeing with CSS claims no unit
// suite can check, because jsdom neither resolves selector specificity
// against a real stylesheet nor runs layout at all:
//
//   - `label:has(:checked)+&` actually beats `.hidden` for the checked
//     tab's own panel, and no other panel's.
//   - `order-1`/`order-2` actually paints every tab ABOVE the one visible
//     panel in a real, wrapping `flex` container — this is the exact class
//     of claim `blocks-render.spec.ts` was written for, after a `minmax`
//     floor that looked correct on paper overflowed a real phone.
//   - A native radio group is actually operable by keyboard end to end —
//     arrow keys move focus AND selection together, which is browser
//     behaviour this repo does not implement and therefore cannot assert
//     from source.
//
// `border-style-cascade.spec.ts` and `section-skin-nesting.spec.ts` both exist
// for weaker versions of the same argument — each rests on ONE resolved CSS
// fact, where this one needs a selector to win, a layout to hold, AND a
// browser's own keyboard handling, together.
//
// It writes the page straight into the database as a real Clerk-authenticated
// caller — see `support/blocks.ts` — rather than through the editor: what is
// under test is entirely on the READ side, and there is no editor that can
// write a block tree at all until phase 3.
//
// Every locator here is structural (test id, tag, position), never role or
// text — this suite runs in Spanish and a block's own title is data, not a
// catalogue string, but the project-wide rule is blanket for good reason:
// nothing here should ever need to change if a label's WORDING does.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

test.describe("tabs, switched in a real browser", () => {
  test("shows one panel at a time, switches by keyboard and by click, keeps the tab row above the panel, and never scrolls sideways at 320px", async ({
    page,
  }) => {
    const identity = await createTestIdentity();
    try {
      // Enough tabs that a 320px viewport genuinely wraps the row, which is
      // the shape the last assertion needs. Each panel's own text is what
      // identifies it in the assertions below, keyed by POSITION (child
      // order), never by reading a tab's own label back.
      //
      // **This count is also load-bearing for assertion 3, below, and that
      // is not obvious from reading it in isolation.** A hidden panel is
      // `display: none` and so is not a flex item at all — only the
      // measured (second) panel and the tabs are laid out when that
      // assertion runs. With `order-1`/`order-2` removed, the surviving
      // items fall back to document order, which puts the later tabs
      // (third onward) BELOW the second panel rather than above it — that
      // is what the assertion actually catches. Trim this list down to two
      // children, or measure the LAST tab's own panel instead of the
      // second's, and no tab would remain below the measured panel to catch
      // the regression: the assertion would stay green whether or not
      // `order-1`/`order-2` exists. Do not shrink this fixture without
      // re-deriving that the assertion still has something to fail against.
      const children = ["First", "Second", "Third", "Fourth", "Fifth"].map(
        (name) => leaf({ title_en: name, description_en: `${name} panel.` }),
      );

      const { address, handle } = await seedPage({
        userId: identity.userId,
        handlePrefix: "tabs",
        displayName: "Tab Switching",
        // A multi-word name, deliberately: it is free text this container's
        // own author typed, and no `id` on the page may carry it. In the
        // block model that is structural rather than careful — every
        // identifier is built from the block's PATH, which is digits and
        // hyphens — and the `aria-controls` assertion below is what proves
        // the property held rather than merely being intended.
        blocks: [container({ mode: "tabs", name_en: "About Me", children })],
      });

      await page.setViewportSize({ width: 1280, height: 800 });
      const response = await page.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByTestId("public-section")).toHaveCount(1);

      const tabs = page.getByTestId("block-tabs");
      const labels = tabs.locator("> label");
      const radios = tabs.locator('input[type="radio"]');
      const panels = tabs.locator("> div");
      await expect(panels).toHaveCount(5);

      // Every radio's aria-controls resolves to a real element, in a real
      // browser, on a section whose name has a space in it. A value
      // containing a space would tokenise into pieces that resolve to
      // nothing — `aria-controls` takes an ID-reference LIST — so asserting
      // there is no whitespace at all is the more direct claim.
      const controlsValues = await radios.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("aria-controls")),
      );
      for (const value of controlsValues) {
        expect(value).toBeTruthy();
        expect(value).not.toMatch(/\s/);
        const resolved = await page.locator(`[id="${value}"]`).count();
        expect(resolved).toBe(1);
      }

      /**
       * Which panels are actually painted, by computed `display` — the one
       * measurement in this file a unit test cannot take, since jsdom runs
       * no layout and resolves no stylesheet against a real cascade.
       *
       * @returns the index of every panel whose computed `display` is not
       * `none`, in document order.
       */
      async function visiblePanelIndices(): Promise<number[]> {
        const count = await panels.count();
        const visible: number[] = [];
        for (let index = 0; index < count; index += 1) {
          const panel = panels.nth(index);
          const display = await panel.evaluate(
            (el) => getComputedStyle(el).display,
          );
          if (display !== "none") visible.push(index);
        }
        return visible;
      }

      // 1. On load, exactly one panel is visible, and it is the first.
      expect(await visiblePanelIndices()).toEqual([0]);

      // 2a. Keyboard: focusing the group and pressing ArrowRight moves BOTH
      // focus and selection to the next radio — the WAI-ARIA automatic-
      // activation behaviour every native radio group gets for free, and
      // the one thing this repo's own source cannot prove about itself.
      await radios.nth(0).focus();
      await page.keyboard.press("ArrowRight");
      expect(await visiblePanelIndices()).toEqual([1]);

      // Back to a known tab before testing the click path independently of
      // whatever state the keyboard assertion left behind.
      await labels.nth(0).click();
      expect(await visiblePanelIndices()).toEqual([0]);

      // 2b. Click: activating the label directly checks its radio exactly as
      // clicking any label focuses and activates the control it wraps.
      await labels.nth(1).click();
      expect(await visiblePanelIndices()).toEqual([1]);

      // 3. The tab row's bounding box sits entirely above the visible
      // panel's. This is the order-1/order-2 claim in a wrapping flex
      // container, and it is the one thing nothing but a browser can catch —
      // reasoning about flexbox order is exactly the class of claim this
      // repo has already gotten wrong once, in the grid that overflowed a
      // real phone at 320px.
      //
      // **Measuring the SECOND panel, with tabs after it still in the
      // fixture, is what gives this power to fail** — see the comment on
      // `children` above for why. A hidden panel is not laid out at all, so
      // with `order-1`/`order-2` removed, only the tabs and the one visible
      // panel remain in flow; the later tabs falling below that panel in
      // document order is the only thing `labelsBottom` can catch here.
      const labelCount = await labels.count();
      const labelBoxes = await Promise.all(
        Array.from({ length: labelCount }, (_unused, index) =>
          labels.nth(index).boundingBox(),
        ),
      );
      const labelsBottom = Math.max(
        ...labelBoxes.map((box) => (box ? box.y + box.height : -Infinity)),
      );
      const visiblePanelBox = await panels.nth(1).boundingBox();
      expect(visiblePanelBox).not.toBeNull();
      expect(labelsBottom).toBeLessThanOrEqual(visiblePanelBox!.y);

      // 4. At the narrowest phone still in use, the page does not scroll
      // sideways — the same shape of risk `blocks-render.spec.ts` guards for
      // the grid, since a wrapping flex row of many tabs is exactly where a
      // fixed width could push the page wider than its viewport.
      await page.setViewportSize({ width: 320, height: 800 });
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `scrollWidth ${overflow.scrollWidth} vs clientWidth ${overflow.clientWidth}`,
      ).toBeLessThanOrEqual(overflow.clientWidth);
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });
});
