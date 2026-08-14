import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";

// THE FIRST SIGNED-IN END-TO-END TEST THIS REPOSITORY HAS EVER HAD.
//
// Every other suite here is anonymous, and the reason was real: this app is
// social-login-first with no passwords, so there is no form to fill in, and
// driving Google's or Discord's own login is outside our control. Every phase
// of the fursona studio therefore shipped with the same admission — the editor,
// the sections, the templates, the upload, none of it had ever been loaded by a
// browser.
//
// A Clerk **sign-in token** removes that. The backend mints a one-shot ticket
// for a throwaway user, the browser presents it, and a real session exists with
// no provider and no interface. See `support/clerk-session.ts`.
//
// This runs against the LIVE Supabase project, so it creates a real person
// actor and a real fursona. Both are cleaned up as far as they can be: the
// fursona is deleted through the product's own delete, and the Clerk user is
// removed. The `actors` rows survive by design — deletion is soft, so a handle
// can never be reused — which is the same footprint `idp-cloud` already leaves.

test.describe.configure({ mode: "serial" });

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

test.describe("signed in", () => {
  test("a ticket signs somebody in and provisions their identity", async ({
    page,
  }) => {
    await signIn(page, await mintTicket(identity!.userId));

    await page.goto("/es/me");
    // Reaching /me at all is the assertion: the proxy let it through, the
    // (app) layout's own auth.protect() was satisfied, and the page rendered
    // for a real session rather than redirecting to sign-in.
    expect(page.url()).not.toContain("sign-in");
    await expect(page.getByTestId("sign-out")).toBeVisible();
  });

  test("their fursona list is reachable and empty to begin with", async ({
    page,
  }) => {
    await signIn(page, await mintTicket(identity!.userId));

    await page.goto("/es/fursonas");
    expect(page.url()).toContain("/fursonas");
    expect(page.url()).not.toContain("sign-in");

    // The page's OWN content, not the shell's. A fresh identity has no
    // fursonas, so the create link is the thing that must be there.
    await expect(page.getByTestId("fursonas-title")).toBeVisible();
    await expect(page.getByTestId("fursonas-create")).toBeVisible();
  });
});
