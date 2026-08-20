import { expect, test, type Locator } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";
import { apart, sampleColours, type Probe } from "./support/pixels";

// WHY THIS FILE EXISTS, AND WHY A MODEL IN skins.test.ts WAS NOT ENOUGH.
//
// `@utility surface` reads `border-style` from `--skin-border-style`, so a
// scope that sets the token governs every plain `surface` beneath it, with
// ONE deliberate exception: an element that carries its own Tailwind
// border-style utility, like the `border-dashed` this app ships on its
// empty-state placeholders — the fursona list's, the public profile's, the
// leaf editor's missing-picture box, and an empty PLACE in the block editor. Those placeholders mean "nothing here
// yet", and that meaning must survive whatever border style a section picks
// — the exception is wanted, not a bug to close.
//
// The first version of this claim was proved with `resolveBorderStyle`, a
// hand-written model of var()-substitution in `skins.test.ts`. It was wrong
// in a way jsdom could not catch and the model could not catch either:
// `.border-dashed` declares `border-style: dashed` LITERALLY, and Tailwind
// v4 sorts `@utility` rules in its utilities layer by how many properties
// each declares — `surface` declares far more than `.border-dashed` does,
// so the shorter rule wins the `border-style` property outright, before
// `--skin-border-style` is ever substituted. A model of variable
// substitution has no way to represent "a second declaration won the
// cascade before substitution ran", so every test built on it passed under
// the very behaviour that made the TSDoc's original claim false.
//
// This is that proof instead, against the REAL, compiled app CSS in a real
// Chromium — the utility sort order is a build-time fact about THIS
// stylesheet, and a hand-rolled minimal page could pass or fail by accident
// depending on what rules happen to exist in it.
//
// **And against the real SCOPE, which is the correction this file needed.**
// `blockStyle` is the only thing in the app that sets the token, and it sets
// it INLINE: on a public page's block element (`blocks.tsx`) and on the
// editor's card root (`block-card.tsx`). Nothing sets it at
// `.actor-skin` — no skin does, which is exactly why `skins.test.ts` has to
// exempt it from the "every form token reaches a skin" guard. An earlier
// version of this file injected the token at `.actor-skin` with
// `addStyleTag` and said in a comment that no control wrote it yet; the
// control shipped later on the same branch, and both halves of that comment
// ended up false while the test went on exercising a scope production never
// uses.
//
// So there are three tests, and none is a duplicate of another:
//
//  1. The PUBLIC page, seeded straight into the database as a real
//     Clerk-authenticated caller — the read path a stranger gets. A styled
//     block and an unstyled one on the same page, so "the token reached it"
//     is distinguished from "everything is dotted anyway".
//  2. The EDITOR, driving the popup's own border select. This is the only
//     place in the app where a `surface border-dashed` element sits BENEATH
//     a scope that sets the token — the public page's dashed placeholders
//     are all siblings of the sections, never inside one — so it is the only
//     place the exception can be watched on a path production actually uses.
//  3. The PIXELS. Both of the above read `border-style`, which resolves to
//     `double` whether or not anything double is painted — and at the app's
//     own 1px edge nothing is, because two lines and a gap do not fit in one
//     pixel. That is the whole of the third test, and the reason
//     `--skin-border-min` exists.

// **A test's own card is the LAST one.** Every page opens carrying the identity
// section the database requires, and `add-section` appends — so `.first()` here
// would reach for the identity section's controls instead, and a page-wide
// `section-style-open` matches two buttons rather than one.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

/**
 * What a real engine resolved `border-style` to on one element.
 *
 * The computed value, not the declaration: the whole question here is which
 * of two rules won the property, and only the browser can answer that.
 *
 * @param locator - the element to measure.
 * @returns the resolved `border-top-style`.
 */
const borderStyleOf = (locator: Locator): Promise<string> =>
  locator.evaluate((el) => getComputedStyle(el).borderTopStyle);

test.describe("--skin-border-style vs. a descendant's own border utility", () => {
  test("a block's own border reaches the plain surfaces inside it, and no others", async ({
    page,
  }) => {
    const identity = await createTestIdentity();
    try {
      // Two sections, the first choosing a border and the second choosing
      // nothing. The second is the control: it makes "the block's own token
      // reached this element" a different observation from "every surface on
      // the page is dotted for some other reason", which a single section
      // could not distinguish. It is also the scoping claim — sections are
      // siblings, so one block's choice must not reach the next.
      //
      // Each holds one `text` leaf, whose card is a PLAIN `surface`: it names
      // no border-style utility of its own, which is what makes it the
      // element the token is supposed to govern.
      const { address, handle } = await seedPage({
        userId: identity.userId,
        handlePrefix: "border",
        displayName: "Border Cascade",
        blocks: [
          container({
            name_en: "Chosen",
            style: { border: "dotted" },
            children: [leaf({ title_en: "An item" })],
          }),
          container({
            name_en: "Untouched",
            children: [leaf({ title_en: "An item" })],
          }),
        ],
      });

      const response = await page.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);

      const cards = page.getByTestId("public-leaf").locator("> div");
      await expect(cards).toHaveCount(2);
      const chosen = cards.nth(0);
      const untouched = cards.nth(1);

      expect(await borderStyleOf(chosen)).toBe("dotted");
      expect(await borderStyleOf(untouched)).toBe("solid");
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });

  test("the editor's own border control reaches the card's face and leaves an empty-state placeholder dashed", async ({
    page,
  }) => {
    const identity = await createTestIdentity();
    try {
      await signIn(page, await mintTicket(identity.userId));
      await page.goto("/es/pages/new");

      // One place across, left empty: an empty place is the editor's own
      // `surface border-dashed` placeholder — this app's "nothing here yet" —
      // which is the whole point of this test, and one place makes it the only
      // one on the card. Built through the controls rather than written as
      // data, so what is measured is the control that shipped.
      await page.getByTestId("new-section-spaces").selectOption("1");
      await page.getByTestId("add-section").click();

      const card = page.getByTestId("section-card").last();
      // The face is the layer carrying `surface` — a plain one, naming no
      // border-style utility — and it is the element the editor's preview
      // actually paints the section's form on.
      const face = page.getByTestId("section-card-face").last();
      const placeholder = card.locator(".border-dashed");
      await expect(placeholder).toHaveCount(1);

      // Before anything is chosen: the face falls through to the design's
      // own solid edge, and the placeholder is dashed. Read first so the
      // assertions after the choice measure a CHANGE rather than a state
      // that was already there — without this, a face that is dotted for
      // some unrelated reason would pass.
      expect(await borderStyleOf(face)).toBe("solid");
      expect(await borderStyleOf(placeholder)).toBe("dashed");

      await page.getByTestId("section-style-open").last().click();
      await page.getByTestId("section-style-border").selectOption("dotted");
      // The choice really did land on the scope, rather than on nothing:
      // `sectionStyle` routes custom properties to the card's ROOT, which is
      // the ancestor both elements below inherit from.
      await expect
        .poll(() =>
          card.evaluate((el) =>
            el.style.getPropertyValue("--skin-border-style"),
          ),
        )
        .toBe("dotted");

      // Half 1: a plain `surface` beneath the scope takes the section's
      // choice.
      expect(await borderStyleOf(face)).toBe("dotted");
      // Half 2: `surface border-dashed` keeps `dashed` — Tailwind's own
      // shorter utility wins `border-style` outright, so the empty-state
      // placeholder's meaning survives whatever the section chose.
      expect(await borderStyleOf(placeholder)).toBe("dashed");
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });

  // **The third test measures PIXELS, and the other two cannot replace it.**
  // Both above read `border-style`, which resolves to `double` whether or not
  // anything double is painted. CSS defines `double` as two lines and a gap
  // summing to the border width, so below 3px there is nothing to divide:
  // sampled in this same Chromium, a 1px edge is one dark pixel and a 2px edge
  // is two, byte-identical to `solid` at the same width, and only from 3px
  // does the run become line-gap-line. Every skin but `neobrutalism`, `comic`
  // and `sticker` sets a narrower edge than that, so "Double line" was a
  // control that accepted a choice and changed nothing on almost every page —
  // the fault this project refused by name when repetition shipped with a
  // length rather than alone.
  //
  // `--skin-border-min` is the fix and this is its proof: the default skin's
  // own `--skin-border` is 1px, so without the floor the assertions below
  // read the same three pixels for both choices and the test goes red.
  test("double paints two lines and a gap on a skin whose own edge is too narrow to have drawn one", async ({
    page,
  }) => {
    const identity = await createTestIdentity();
    try {
      await signIn(page, await mintTicket(identity.userId));
      // The nebula is a live canvas behind every page, so two screenshots of
      // the same coordinates differ by whatever it moved. Reduced motion
      // holds it still; the ratio assertion is because `boundingBox()` reports
      // CSS pixels and `getImageData` indexes device ones.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 1280, height: 1400 });
      expect(await page.evaluate(() => devicePixelRatio)).toBe(1);

      await page.goto("/es/pages/new");
      await page.getByTestId("new-section-spaces").selectOption("2");
      await page.getByTestId("add-section").click();
      await page.getByTestId("collapse-section").last().click();

      const card = page.getByTestId("section-card").last();
      const face = page.getByTestId("section-card-face").last();

      /**
       * The pixel run inward from the face's left edge, at mid-height.
       *
       * Mid-height because `rounded-xl` curves both corners and a probe inside
       * that arc would be answering a question about the radius. Four pixels
       * because a 3px `double` is line, gap, line, and the fourth is the
       * surface beyond it — so the run distinguishes both shapes rather than
       * only detecting a change.
       */
      const run = async (): Promise<number[][]> => {
        // The identity section sits above this card, so the probe reads a
        // screenshot whose coordinates only line up once the card is on
        // screen. Scrolling first is what keeps the pixels the card's own.
        await face.scrollIntoViewIfNeeded();
        const box = (await face.boundingBox())!;
        const y = Math.round(box.y + box.height / 2);
        const probes: Probe[] = [0, 1, 2, 3].map((inset) => ({
          name: `x${inset}`,
          x: Math.round(box.x) + inset,
          y,
        }));
        const sampled = await sampleColours(page, probes);
        return probes.map((probe) => sampled[probe.name]!);
      };

      /**
       * Picks a border style and waits for the CHOICE to land, not for its
       * consequence.
       *
       * Deliberately polls the custom property rather than the resolved
       * `border-width`: waiting on the width would make this helper fail
       * first under the very fault the pixels below are here to catch, and a
       * test whose precondition breaks proves only that a precondition broke.
       *
       * @param border - the value to select.
       * @returns nothing; waits.
       */
      const choose = async (border: string): Promise<void> => {
        await page.getByTestId("section-style-open").last().click();
        await page.getByTestId("section-style-border").selectOption(border);
        await expect
          .poll(() =>
            card.evaluate((el) =>
              el.style.getPropertyValue("--skin-border-style"),
            ),
          )
          .toBe(border);
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("section-style-panel")).toBeHidden();
      };

      const widthOf = (): Promise<string> =>
        face.evaluate((el) => getComputedStyle(el).borderTopWidth);

      // `solid` first, as the control. Its floor is 1px, which is what the
      // default skin already gave it — so this is the app's ordinary edge.
      await choose("solid");
      const solidWidth = await widthOf();
      const solid = await run();
      // `double` raises the floor to 3px, the narrowest width the style has
      // room to exist at.
      await choose("double");
      const doubleWidth = await widthOf();
      const doubled = await run();

      // Both are the same custom property on the same root, so the card has
      // not moved between the two screenshots — if it had, every probe below
      // would be reading a different element's pixels.
      expect((await card.boundingBox())!.width).toBeGreaterThan(0);

      // The third pixel in is the discriminator. Under `solid` it is past a
      // 1px edge and is the surface; under `double` it is the second line.
      // So the two choices must disagree there…
      expect(
        apart(solid[2]!, doubled[2]!),
        "the third pixel in differs between solid and double",
      ).toBeGreaterThan(20);

      // …and, inside the `double` run alone, the middle pixel must be the GAP:
      // unlike its neighbours on either side, and like the surface beyond
      // them. This is the assertion a wider `solid` could not satisfy, which
      // is what makes it a measurement of `double` rather than of the floor.
      expect(
        apart(doubled[0]!, doubled[1]!),
        "double's first line and its gap differ",
      ).toBeGreaterThan(20);
      expect(
        apart(doubled[1]!, doubled[2]!),
        "double's gap and its second line differ",
      ).toBeGreaterThan(20);
      expect(
        apart(doubled[1]!, doubled[3]!),
        "double's gap is the surface showing through",
      ).toBeLessThan(20);

      // The resolved widths last, as corroboration rather than as the proof.
      // Read before the screenshots and asserted after them on purpose: a
      // width assertion placed first would fail before a single pixel had
      // been compared under exactly the fault this test exists for, and the
      // pixel assertions above would never have been seen red at all.
      expect(solidWidth, "solid keeps the design's own hairline").toBe("1px");
      expect(doubleWidth, "double is floored at three pixels").toBe("3px");
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });
});
