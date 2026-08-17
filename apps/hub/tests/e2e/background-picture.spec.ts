import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintSessionToken,
} from "./support/clerk-session";

// WHY THIS FILE EXISTS, AND WHY A STRING ASSERTION ON THE GENERATED CSS
// CANNOT REPLACE IT.
//
// `themeCss` used to write the background picture's `background-image` into
// the `:root` rule, alongside every other custom property — code review that
// read the returned CSS as TEXT saw exactly what it expected: the picture's
// declaration, present, correctly escaped, containing the right address. Every
// unit test agreed, because every unit test asserted the same string.
//
// None of them asked which ELEMENT that rule reaches. `:root` is `<html>`;
// `globals.css` paints `body`'s own, OPAQUE background from `--field`, and
// `body` is a descendant of `<html>` — a descendant's background always
// paints over an ancestor's, unconditionally, regardless of property order or
// specificity. So the picture rendered in every test that read a CSS string
// and in no browser at all: `<html>`'s background-image was set correctly and
// entirely hidden behind `<body>`'s own.
//
// This is the missing proof, in a real Chromium, following the same pattern
// `section-skin-nesting.spec.ts` established: build the page through the
// real, `security definer` RPCs `set_actor_theme` and `set_actor_sections`
// already use, bypassing the editor entirely, and ask a real CSS engine what
// it RESOLVES on the actual painting element — not what a generator emitted
// as a string.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

test.describe("a page background picture, resolved rather than merely emitted", () => {
  test("paints above the gradient, on the element the gradient itself paints on", async ({
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

      const handle = `bg${Date.now().toString().slice(-9)}`;
      const { data: actorRef, error: createError } = await supabase.rpc(
        "create_fursona",
        {
          p_handle: handle,
          p_display_name: "Background Picture",
          p_avatar_url: null,
          p_visibility: "public",
        },
      );
      expect(createError).toBeNull();

      // A real gradient — two stops, not one — so `--field` is unmistakably a
      // `linear-gradient(...)` rather than a colour, and so its presence
      // alongside the picture in the SAME `background-image` list is a
      // meaningful assertion rather than a coincidence of one degenerate case.
      const { error: themeError } = await supabase.rpc("set_actor_theme", {
        p_actor_ref: actorRef,
        p_theme: {
          background: {
            angle: 90,
            stops: [
              { color: "#1a1a2e", at: 0 },
              { color: "#f3e3d3", at: 100 },
            ],
          },
          backgroundUrl: "https://example.com/background-picture.png",
          backgroundFit: "cover",
        },
      });
      expect(themeError).toBeNull();

      const { data: address, error: addressError } =
        await supabase.rpc("my_address");
      expect(addressError).toBeNull();

      const response = await page.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);

      // The computed style is what a screenshot would show: the browser's
      // OWN resolution of the cascade, on the actual element it paints —
      // not the generator's string, and not an inline style either, since
      // this reaches `body` through a stylesheet rule rather than a `style`
      // attribute.
      const bodyBackgroundImage = await page.evaluate(
        () => getComputedStyle(document.body).backgroundImage,
      );

      // Both layers, on `body`. Under the bug this fixes, `body`'s own
      // computed background-image carried only the gradient — the picture
      // was on `<html>` instead, entirely hidden behind this element's own
      // opaque background.
      expect(bodyBackgroundImage).toContain(
        'url("https://example.com/background-picture.png")',
      );
      // Not just "contains gradient" — the design's own default field is
      // ALSO a gradient (a radial one), so that substring alone would pass
      // even if the author's own two-stop linear gradient never reached the
      // page at all. A stop's own colour only appears if the author's
      // gradient made it into the layer list.
      expect(bodyBackgroundImage).toContain("rgb(26, 26, 46)");

      // Layer ORDER: `background-image`'s first entry paints on top, so the
      // picture must be written before the gradient for "sits over the
      // gradient" to be true rather than merely intended.
      const [firstLayer] = bodyBackgroundImage.split(",");
      expect(firstLayer).toContain("background-picture.png");

      // The chosen fit reaches the picture's own layer as a real, resolved
      // `background-size`, proving the whole pipeline from the RPC's
      // `backgroundFit` to what the browser will actually render — not only
      // that an image address arrived.
      const bodyBackgroundSize = await page.evaluate(
        () => getComputedStyle(document.body).backgroundSize,
      );
      expect(bodyBackgroundSize.split(",")[0]?.trim()).toBe("cover");
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });

  // `tile` was proven only as a string before this — `actor-theme.test.ts`
  // asserts `bodyBackgroundVars` emits `background-repeat: repeat, no-repeat`
  // and `background-size: auto, cover`, which is what `bodyBackgroundVars`
  // returns but not what a browser resolves onto the element. This is that
  // proof, the same way `cover` above is proven on the DOM rather than on
  // the generator's return value.
  test("tile resolves on the DOM as a repeating layer beside the gradient's own", async ({
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

      const handle = `tile${Date.now().toString().slice(-8)}`;
      const { data: actorRef, error: createError } = await supabase.rpc(
        "create_fursona",
        {
          p_handle: handle,
          p_display_name: "Background Tile",
          p_avatar_url: null,
          p_visibility: "public",
        },
      );
      expect(createError).toBeNull();

      const { error: themeError } = await supabase.rpc("set_actor_theme", {
        p_actor_ref: actorRef,
        p_theme: {
          background: {
            angle: 90,
            stops: [
              { color: "#1a1a2e", at: 0 },
              { color: "#f3e3d3", at: 100 },
            ],
          },
          backgroundUrl: "https://example.com/background-picture.png",
          backgroundFit: "tile",
        },
      });
      expect(themeError).toBeNull();

      const { data: address, error: addressError } =
        await supabase.rpc("my_address");
      expect(addressError).toBeNull();

      const response = await page.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);

      const [bodyBackgroundRepeat, bodyBackgroundSize] = await page.evaluate(
        () => {
          const style = getComputedStyle(document.body);
          return [style.backgroundRepeat, style.backgroundSize];
        },
      );

      // The picture's own layer repeats; the gradient's own never does —
      // `no-repeat` for the second value is what proves this is two
      // independently-resolved layers rather than one setting applied
      // to both.
      expect(bodyBackgroundRepeat.split(",").map((v) => v.trim())).toEqual([
        "repeat",
        "no-repeat",
      ]);
      // The picture's own layer is left at its natural size under `tile`,
      // and the gradient still resolves to `cover` beside it.
      expect(bodyBackgroundSize.split(",").map((v) => v.trim())).toEqual([
        "auto",
        "cover",
      ]);
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });
});
