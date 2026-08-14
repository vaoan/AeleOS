import { expect, test } from "@playwright/test";

// What this file covers, and what it deliberately does not.
//
// COVERED: that the public actor pages are reachable **without a session** at
// all. Every earlier phase of the fursona studio renders only for a signed-in
// person, so nothing in it has ever had browser-level proof — this is the first
// part a browser can reach. The single assertion that a request for an address
// answers from the page rather than from the sign-in gate exercises the whole
// path: the proxy classified it as public, the locale middleware ran, the route
// rendered, and the anon Supabase client reached the database and got nothing.
//
// NOT COVERED: a real actor's page. No fursona and no person address exists in
// the live database, and seeding one from this job would mean giving the e2e
// runner write credentials it does not have and should not want. So what is
// proven here is the plumbing and the refusal — never the render of somebody's
// actual profile. `tests/db/public-reads.test.ts` proves the rules against a
// real Postgres; nothing yet proves the two halves meet.

/** An address nobody could have been granted. */
const UNKNOWN = "nobody-has-this-address";

/** A handle under it, equally absent. */
const UNKNOWN_HANDLE = "nobody-has-this-handle";

test.describe("the public actor pages, signed out", () => {
  for (const [name, path] of [
    ["a person's profile", `/es/${UNKNOWN}`],
    ["one of their fursonas", `/es/${UNKNOWN}/${UNKNOWN_HANDLE}`],
  ] as const) {
    // The proof that matters. Before the public routes existed, an anonymous
    // request for any such path was classified as protected and answered 307 to
    // the sign-in page — so "does not redirect" is the whole behaviour change,
    // and it is not visible from a unit test.
    test(`${name} answers from the page, not the sign-in gate`, async ({
      page,
    }) => {
      const response = await page.goto(path);

      expect(page.url()).toContain(path);
      expect(page.url()).not.toContain("sign-in");
      expect(response?.status()).toBe(404);
    });

    // The same rule the metadata follows, asserted where a real browser can see
    // the rendered text: a 404 that echoed the address back would confirm which
    // addresses exist to anybody willing to guess.
    test(`${name} names nothing that was asked for`, async ({ page }) => {
      await page.goto(path);

      const body = (await page.locator("body").innerText()).toLowerCase();
      expect(body).not.toContain(UNKNOWN);
      expect(body).not.toContain(UNKNOWN_HANDLE);
    });
  }

  // The 404 arrives inside the app's own chrome rather than as Next's
  // English-only fallback, which in a bilingual app with a shipped visual
  // identity reads as a broken deployment rather than a missing page.
  test("renders the app's own not-found page", async ({ page }) => {
    await page.goto(`/es/${UNKNOWN}`);
    await expect(page.getByTestId("not-found-title")).toBeVisible();
    await expect(page.getByTestId("not-found-home")).toBeVisible();
  });

  // The reserved segments must still belong to the signed-in app. If the actor
  // patterns ever swallowed one, this is where it shows up as a 404 instead of
  // the sign-in redirect.
  test("still sends a signed-in route to sign-in", async ({ page }) => {
    await page.goto("/es/fursonas");
    expect(page.url()).toContain("sign-in");
  });
});
