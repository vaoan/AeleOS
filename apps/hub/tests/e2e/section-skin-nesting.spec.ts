import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintSessionToken,
} from "./support/clerk-session";

// WHY THIS FILE EXISTS, AND WHY IT STILL DOES NOT USE THE EDITOR.
//
// `nestedSkinVars` (shared/domain/skins.ts) is what makes a skin nestable: a
// section carrying its own skin emits the FULL property set rather than only
// its differences, so an unset property falls back to `globals.css`'s own
// default instead of leaking through from the page's enclosing skin. Every
// test proving that so far — `skins.test.ts`, `public-sections.test.tsx` —
// asserts what the code EMITS. None of them asks a real CSS engine what it
// RESOLVES, and this project has already shipped one rule
// (`[class~="border"]`, see `globals.css`'s own history) that read correctly
// on paper and lost the cascade for months. This is that missing proof, in a
// real Chromium.
//
// **A per-section skin now HAS a control — `SectionStylePopup`, shipped with
// Task 5 — and `section-style-popup.spec.ts` drives it.** That file proves the
// WRITE side: the popup writes to the field the save button reads, and the
// saved row reaches the public route. This file still bypasses the editor on
// purpose, because it proves something that file does not: what a real CSS
// engine RESOLVES, several layers past the row that was written. The section
// (and the page's own skin) are written the same way `tests/db/` and
// `scripts/run-cloud-idp.mjs` already write through these functions: as a
// real, Clerk-authenticated caller, straight through `set_actor_sections` and
// `set_actor_theme` — the exact `security definer` functions the editor's own
// save button also calls. What is under test here is entirely on the READ
// side: the production route, `PublicSections`, `sectionStyle`,
// `nestedSkinVars` and the stylesheet `globals.css` ships — none of which
// cares how the row it reads was written.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

test.describe("a nested skin, resolved rather than merely emitted", () => {
  test("a section's own skin wins where it should, and falls back to the design's default where it should not", async ({
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

      const handle = `skin${Date.now().toString().slice(-9)}`;
      const { data: actorRef, error: createError } = await supabase.rpc(
        "create_fursona",
        {
          p_handle: handle,
          p_display_name: "Skin Nesting",
          p_avatar_url: null,
          p_visibility: "public",
        },
      );
      expect(createError).toBeNull();

      // The first section carries its OWN skin — `paper` — nested inside a
      // page wearing `comic`. The second carries no `style` at all, so it
      // renders under the page's own skin: it stands in for "an element
      // outside the styled section" without depending on any other part of
      // the page happening to render a bordered surface.
      const { error: sectionsError } = await supabase.rpc(
        "set_actor_sections",
        {
          p_actor_ref: actorRef,
          p_sections: [
            {
              name_en: "Styled",
              type: "cards",
              sort_order: 0,
              items: [{ title_en: "One", description_en: "", sort_order: 0 }],
              style: { skin: "paper" },
            },
            {
              name_en: "Unstyled",
              type: "cards",
              sort_order: 1,
              items: [{ title_en: "Two", description_en: "", sort_order: 0 }],
            },
          ],
        },
      );
      expect(sectionsError).toBeNull();

      // `comic` is chosen for the PAGE precisely because it sets a property —
      // `--skin-gloss`, a halftone `background-image` — that `paper` does not
      // touch at all. That is the pairing the second assertion below needs:
      // a page-level value with somewhere silent to leak into if nesting were
      // broken.
      const { error: themeError } = await supabase.rpc("set_actor_theme", {
        p_actor_ref: actorRef,
        p_theme: { skin: "comic" },
      });
      expect(themeError).toBeNull();

      const { data: address, error: addressError } =
        await supabase.rpc("my_address");
      expect(addressError).toBeNull();

      const response = await page.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByTestId("public-section")).toHaveCount(2);

      // Both sections use the `cards` layout, so each renders one bordered,
      // rounded card inside its own `public-cards` container. Flattened in
      // document order, the first is the styled section's and the second is
      // the unstyled one's — which is what makes this pair stand in for
      // "inside the nested skin" against "outside it, under the page skin".
      const cards = page.getByTestId("public-cards").locator("> div");
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

      // 2. The regression Task 1 fixed, seen end to end: `paper` sets no
      // `--skin-gloss` of its own. A section that fell through to the
      // ENCLOSING skin instead of `globals.css`'s own default would render
      // comic's halftone here; `nestedSkinVars` must resolve it to "none".
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
});
