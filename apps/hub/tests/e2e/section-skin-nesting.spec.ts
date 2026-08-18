import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";

// WHY THIS FILE EXISTS, AND WHY IT DOES NOT USE THE EDITOR.
//
// `nestedSkinVars` (shared/domain/skins.ts) is what makes a skin nestable: a
// block carrying its own skin emits the FULL property set rather than only its
// differences, so an unset property falls back to `globals.css`'s own default
// instead of leaking through from whatever skin ENCLOSES it. Every test
// proving that so far — `skins.test.ts`, `block-style.test.ts`,
// `blocks.test.tsx` — asserts what the code EMITS. None of them asks a real
// CSS engine what it RESOLVES, and this project has already shipped one rule
// (`[class~="border"]`, see `globals.css`'s own history) that read correctly on
// paper and lost the cascade for months. This is that missing proof, in a real
// Chromium.
//
// **It matters more under the block model than it did on a flat page.** A skin
// scope was one section deep; it can now sit inside a skin inside a skin, three
// levels down, and only a complete property set keeps each level honest.
// `blocks.test.tsx` pins the depth-3 case against the declared properties; this
// file is the one that asks the engine.
//
// The page is written straight into the database as a real Clerk-authenticated
// caller — see `support/blocks.ts` — through the same `security definer`
// functions the editor's own save button calls. What is under test is entirely
// on the READ side: the production route, `Block`, `blockStyle`,
// `nestedSkinVars` and the stylesheet `globals.css` ships — none of which cares
// how the row it reads was written.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

test.describe("a nested skin, resolved rather than merely emitted", () => {
  test("a block's own skin wins where it should, and falls back to the design's default where it should not", async ({
    page,
  }) => {
    const identity = await createTestIdentity();
    try {
      // The first section carries its OWN skin — `paper` — nested inside a
      // page wearing `comic`. The second carries no `style` at all, so it
      // renders under the page's own skin: it stands in for "an element
      // outside the styled section" without depending on any other part of
      // the page happening to render a bordered surface.
      //
      // Each holds one `text` leaf, whose card is a PLAIN `surface` — it
      // names no skin token of its own, which is what makes it the element
      // the enclosing scope is supposed to govern.
      //
      // **`comic` is the page's skin precisely because it sets a property —
      // `--skin-gloss`, a halftone `background-image` — that `paper` does not
      // touch at all.** That is the pairing the second assertion below needs:
      // a page-level value with somewhere silent to leak into if nesting were
      // broken.
      const { address, handle } = await seedPage({
        userId: identity.userId,
        handlePrefix: "skin",
        displayName: "Skin Nesting",
        blocks: [
          container({
            name_en: "Styled",
            style: { skin: "paper" },
            children: [leaf({ title_en: "One" })],
          }),
          container({
            name_en: "Unstyled",
            children: [leaf({ title_en: "Two" })],
          }),
        ],
        theme: { skin: "comic" },
      });

      const response = await page.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByTestId("public-section")).toHaveCount(2);

      // Each section holds one leaf, and a leaf's own card is the first
      // element inside its `public-leaf` wrapper — the wrapper carries the
      // span and the style bag, the card carries `surface`. In document
      // order the first is the styled section's and the second is the
      // unstyled one's, which is what makes this pair stand in for "inside
      // the nested skin" against "outside it, under the page skin".
      const cards = page.getByTestId("public-leaf").locator("> div");
      await expect(cards).toHaveCount(2);
      const styled = cards.nth(0);
      const unstyled = cards.nth(1);

      // 1. The nested scope wins: the styled section's own `--skin-round`
      // (paper's 0.4) produces a different radius than the page's own
      // (comic's 0.6), on the SAME `rounded-xl` class.
      const styledRadius = await styled.evaluate(
        (el) => getComputedStyle(el).borderTopLeftRadius,
      );
      const unstyledRadius = await unstyled.evaluate(
        (el) => getComputedStyle(el).borderTopLeftRadius,
      );
      expect(styledRadius).not.toBe(unstyledRadius);

      // 2. The regression the complete property set exists for, seen end to
      // end: `paper` sets no `--skin-gloss` of its own. A block that fell
      // through to the ENCLOSING skin instead of `globals.css`'s own default
      // would render comic's halftone here; `nestedSkinVars` must resolve it
      // to "none".
      const styledGloss = await styled.evaluate(
        (el) => getComputedStyle(el).backgroundImage,
      );
      const unstyledGloss = await unstyled.evaluate(
        (el) => getComputedStyle(el).backgroundImage,
      );
      expect(styledGloss).toBe("none");
      expect(unstyledGloss).not.toBe("none");
      expect(unstyledGloss).toContain("radial-gradient");

      // 3. `@utility surface` reads the NEAREST `--skin-border` rather than
      // the one the page set: paper's explicit `0px` inside the section,
      // comic's explicit `3px` outside it.
      const styledBorder = await styled.evaluate(
        (el) => getComputedStyle(el).borderTopWidth,
      );
      const unstyledBorder = await unstyled.evaluate(
        (el) => getComputedStyle(el).borderTopWidth,
      );
      expect(styledBorder).toBe("0px");
      expect(unstyledBorder).toBe("3px");
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });

  // THE DEPTH THE FLAT MODEL COULD NOT REACH.
  //
  // A skin scope was one section deep before; a container may now carry one
  // three levels down, inside two others that each carry their own. The unit
  // suite pins the DECLARED properties at every level. This asks the engine
  // what it resolved at the bottom of that stack, which is where a partial
  // reset actually shows: `outline` sets no gloss, so a leaf three levels
  // under `comic` renders the halftone unless every level in between put the
  // default back.
  test("a skin three levels down still resets what its ancestors set", async ({
    page,
  }) => {
    const identity = await createTestIdentity();
    try {
      const { address, handle } = await seedPage({
        userId: identity.userId,
        handlePrefix: "deepskin",
        displayName: "Deep Skin",
        blocks: [
          container({
            name_en: "Outer",
            style: { skin: "comic" },
            children: [
              container({
                style: { skin: "neobrutalism" },
                children: [
                  container({
                    style: { skin: "outline" },
                    children: [leaf({ title_en: "Deepest" })],
                  }),
                ],
              }),
            ],
          }),
        ],
        theme: { skin: "glass" },
      });

      const response = await page.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);

      const card = page.getByTestId("public-leaf").locator("> div");
      await expect(card).toHaveCount(1);

      // `comic` at depth 0 sets a halftone; `neobrutalism` and `outline` set
      // none. The leaf's card sits under all three, so a level that emitted
      // only its differences would leave comic's gloss painting on it.
      expect(
        await card.evaluate((el) => getComputedStyle(el).backgroundImage),
      ).toBe("none");

      // And the nearest scope still wins on a property every skin does set:
      // `outline` draws a 1px edge where `comic` two levels up draws 3px.
      expect(
        await card.evaluate((el) => getComputedStyle(el).borderTopWidth),
      ).toBe("1px");
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });
});
