import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintSessionToken,
} from "./support/clerk-session";

// WHY THIS FILE EXISTS, AND WHAT THE UNIT SUITE CANNOT PROVE ON ITS OWN.
//
// `public-sections.test.tsx` asserts what `sectionStyle` and `Cards` EMIT —
// the `--card-size` custom property, and the literal `grid-template-columns`
// template that reads it. Neither of those is the claim `card_size` actually
// makes: that a page with a small minimum shows MORE cards per row than the
// same page with a large one, at the same width. `auto-fill` is resolved by
// a real CSS engine, and jsdom does not run layout at all — a template that
// parses correctly and never actually wraps would leave every unit assertion
// here green. This is the check that would catch that, in a real Chromium,
// the same way `section-skin-nesting.spec.ts` is what catches a nested skin
// that is emitted correctly and resolved wrong.
//
// **It also caught a real bug the first version of this file missed.** A
// bare `minmax(size, 1fr)` does not shrink its floor when the container is
// narrower than `size` — the collapsed single column stays exactly `size`
// wide and overflows, rather than shrinking to fit. `l`'s minimum is wider
// than a 320px phone has room for after the page's own padding, so the
// unguarded template overflowed the viewport by 16px there — real
// horizontal scroll, on a real page, that no unit test could see because
// jsdom never lays anything out. `Cards` now wraps every size in `min(size,
// 100%)`, and the overflow assertion below is what stands guard against
// that regressing, on whichever size is widest.
//
// It writes through `set_actor_sections` as a real Clerk-authenticated
// caller, not through the editor — `SectionStylePopup` does offer `card_size`
// now (see `features/actors/CLAUDE.md`, "A section's own form"), but driving
// it through the form would only prove the popup writes the field it
// renders, which `section-style-popup.test.tsx` already covers. What is
// under test here is entirely on the READ side: the production route,
// `PublicSections`, `sectionStyle`, `Cards`, and whatever a real browser
// makes of the `grid-template-columns` they emit.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

test.describe("the cards grid, resolved rather than merely emitted", () => {
  test("a smaller card_size puts more cards in a row than a larger one, and the largest never overflows a phone", async ({
    page,
  }) => {
    const identity = await createTestIdentity();
    try {
      const jwt = await mintSessionToken(identity.userId);
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
        {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${jwt}` } },
        },
      );

      const { error: provisionError } = await supabase.rpc(
        "ensure_person_actor",
      );
      expect(provisionError).toBeNull();

      const handle = `cardsize${Date.now().toString().slice(-6)}`;
      const { data: actorRef, error: createError } = await supabase.rpc(
        "create_fursona",
        {
          p_handle: handle,
          p_display_name: "Card Sizes",
          p_avatar_url: null,
          p_visibility: "public",
        },
      );
      expect(createError).toBeNull();

      // Enough items in each section that neither minimum could ever run out
      // of them before the row does — column COUNT is what is under test, so
      // the item count must never be the thing limiting it.
      const items = Array.from({ length: 10 }, (_, i) => ({
        title_en: `Item ${i}`,
        description_en: "",
        sort_order: i,
      }));

      // Two sections, small first and large second, so document order can be
      // trusted rather than re-derived from `sort_order` on the read side.
      const { error: sectionsError } = await supabase.rpc(
        "set_actor_sections",
        {
          p_actor_ref: actorRef,
          p_sections: [
            {
              name_en: "Small",
              type: "cards",
              sort_order: 0,
              items,
              style: { card_size: "s" },
            },
            {
              name_en: "Large",
              type: "cards",
              sort_order: 1,
              items,
              style: { card_size: "l" },
            },
          ],
        },
      );
      expect(sectionsError).toBeNull();

      const { data: address, error: addressError } =
        await supabase.rpc("my_address");
      expect(addressError).toBeNull();

      // A laptop-width viewport, set explicitly rather than trusting whatever
      // a project default happens to be — the claim is about a real width,
      // and the test should say which one.
      await page.setViewportSize({ width: 1280, height: 800 });
      const response = await page.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByTestId("public-section")).toHaveCount(2);

      const grids = page.getByTestId("public-cards");
      await expect(grids).toHaveCount(2);

      /**
       * How many columns a real layout engine actually resolved
       * `grid-template-columns` into.
       *
       * The computed value is a space-separated list of resolved track
       * sizes — not the authored template — so its length IS the column
       * count `auto-fill` chose at the element's current width. This is
       * the one measurement in this file a unit test cannot take: jsdom
       * runs no layout, so it has no computed style to read here at all.
       */
      const columnCount = (locatorIndex: number) =>
        grids
          .nth(locatorIndex)
          .evaluate(
            (el) =>
              getComputedStyle(el)
                .gridTemplateColumns.split(" ")
                .filter(Boolean).length,
          );

      const smallColumns = await columnCount(0);
      const largeColumns = await columnCount(1);

      expect(
        smallColumns,
        `small card_size: ${smallColumns} columns, large: ${largeColumns} columns`,
      ).toBeGreaterThan(largeColumns);

      // Not just "more" — the small minimum should resolve to a genuine row
      // rather than a single column, since plenty of items were given room
      // for it.
      expect(smallColumns).toBeGreaterThan(1);
      expect(largeColumns).toBeGreaterThanOrEqual(1);

      // THE GUARD: the largest card_size must never push the PAGE wider than
      // its viewport, on the narrowest supported phone. `minmax(size, 1fr)`
      // alone does not shrink its floor when the container is narrower than
      // `size` — the single collapsed column stays exactly `size` wide and
      // overflows, rather than shrinking to fit. `Cards` wraps every size in
      // `min(size, 100%)` for exactly this reason; this is the browser-level
      // proof that the wrap actually holds, on the section that carries the
      // widest minimum, `l`, at the width `responsive.spec.ts` treats as the
      // narrowest a real phone still in use.
      await page.setViewportSize({ width: 320, height: 800 });
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(
        overflow.scrollWidth,
        `document.documentElement.scrollWidth: ${overflow.scrollWidth} vs window.innerWidth: ${overflow.innerWidth}`,
      ).toBeLessThanOrEqual(overflow.innerWidth);
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });
});
