import { expect, test } from "@playwright/test";

// What this file covers, and what it deliberately does not.
//
// COVERED: the handoff's signed-out leg. Another app links a person to
// `/picker?return_to=…&app=…`; they have never signed into the hub, so they
// have to sign in first and the destination must survive that detour intact.
// This is the whole journey for a first-time visitor and it was broken until
// the change these tests guard — `signInUrlFor` carried the pathname and
// dropped the query, so everyone arrived at the picker with no `return_to`
// and got the refusal.
//
// NOT COVERED: the signed-in journey — landing on the picker, choosing a
// fursona, and being sent back to `return_to` with `actor_ref` appended. The
// refusal cases are not covered either, and cannot be from here: `/picker`
// lives under `[locale]/(app)` and is not in `PUBLIC_ROUTES`, so an anonymous
// request is redirected to sign-in by the proxy and never reaches the page
// that would refuse it. Confirmed against a running dev server — every
// anonymous `GET /picker`, with a good `return_to`, a hostile one or none at
// all, answers 307 to the sign-in page. Reaching the refusal needs a real
// session, and the whole suite is anonymous today; a signed-in fixture means
// driving Google's or Discord's own login, which is its own piece of work.
// Those paths are covered by `tests/picker-page.test.tsx` and
// `tests/picker-actions.test.ts` instead, which call the page and the action
// directly.

/**
 * A destination on an origin that is on nobody's allowlist.
 *
 * It does not need to be: everything below happens before the picker page
 * runs, so the origin allowlist is never consulted. Using an obviously
 * external origin keeps that clear, and keeps the test from implying a
 * deployment must allow something for it to pass.
 */
const RETURN_TO = "https://puck.example/callback";

/** The link a consuming app would put behind its "choose a fursona" button. */
const HANDOFF = `/picker?return_to=${encodeURIComponent(RETURN_TO)}&app=Puck`;

test.describe("the app handoff, signed out", () => {
  // The bug this pins: `signInUrlFor` used to build the sign-in URL from the
  // pathname alone. A person arrived at `/es/sign-in`, signed in, landed on
  // `/es/me`, and the app that sent them never heard back.
  test("an app's picker link keeps its destination across sign-in", async ({
    page,
  }) => {
    await page.goto(HANDOFF);

    await expect(page).toHaveURL(/\/es\/sign-in\?/);
    const redirectUrl = new URL(page.url()).searchParams.get("redirect_url");
    expect(redirectUrl).not.toBeNull();

    // Parsed, not compared as a string. In development Clerk redirects through
    // its own `accounts.dev` handshake to plant a dev-browser cookie and
    // rebuilds the URL on the way back, which reorders the query — traced
    // against a running server, and values-only, nothing dropped. Parameter
    // order was never the contract anyway; the values and their encoding are.
    const inner = new URL(redirectUrl!, page.url());
    expect(inner.pathname).toBe("/picker");

    // The encoding survived a round trip rather than merely looking plausible:
    // `return_to` is a percent-encoded URL nested inside a percent-encoded
    // path, so one missing layer silently truncates it at the `:` or folds
    // `&app=Puck` into it.
    expect(inner.searchParams.get("return_to")).toBe(RETURN_TO);
    expect(inner.searchParams.get("app")).toBe("Puck");

    // Not a dead end: the page they landed on is ours and can actually sign
    // them in.
    await expect(page.getByTestId("sign-in-discord")).toBeVisible();
  });

  // The language comes from the link, not from the browser: the proxy protects
  // the route before next-intl has negotiated anything, so `localeFromPathname`
  // is the only input. An app that links `/en/picker` keeps its person in
  // English through the detour.
  test("a locale-prefixed picker link signs in in that locale", async ({
    page,
  }) => {
    await page.goto(`/en${HANDOFF}`);

    await expect(page).toHaveURL(/\/en\/sign-in\?/);
    const redirectUrl = new URL(page.url()).searchParams.get("redirect_url");
    const inner = new URL(redirectUrl!, page.url());
    expect(inner.pathname).toBe("/en/picker");
    expect(inner.searchParams.get("return_to")).toBe(RETURN_TO);
  });

  // A crafted link repeating the key makes Next report `redirect_url` as an
  // array. The sign-in page is the one page that must always render — it is
  // how anybody recovers — so a 500 here is a denial of sign-in, reachable by
  // sending somebody a link.
  test("a repeated redirect_url still renders the sign-in page", async ({
    page,
  }) => {
    await page.goto(
      "/es/sign-in?redirect_url=/es/me&redirect_url=/es/fursonas",
    );
    await expect(page.getByTestId("sign-in-discord")).toBeVisible();
  });
});

test.describe("the actor-mirror endpoint", () => {
  // The consuming app's server calls this, and a server cannot follow a
  // redirect into a sign-in page and parse the HTML as an actor list. It took
  // two corrections to make this true — the proxy's `auth.protect()` sent a
  // 307, and then next-intl sent a second one to `/es/api/actors/mine` — and
  // neither was visible from the config alone.
  test("answers an unauthenticated caller with 401 JSON, never a redirect", async ({
    request,
  }) => {
    const response = await request.get("/api/actors/mine", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["content-type"]).toContain("application/json");
    // Parses as JSON, and carries no actors.
    expect(await response.json()).not.toHaveProperty("actors");
  });
});
