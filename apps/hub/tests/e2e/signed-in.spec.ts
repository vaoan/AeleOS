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

  // THE ONE THAT PROVES THE TWO HALVES MEET.
  //
  // Every phase until now could say the rules were right (tests/db, against a
  // real Postgres) or that the plumbing was right (the anonymous suites), but
  // nothing had ever shown somebody's actual page rendering from something
  // somebody actually made. This signs in, creates a public fursona through the
  // real editor, then reads it back as a stranger would.
  //
  // The address comes from /me rather than from the database, because that is
  // the only way a person can learn it — and if that surface ever broke, this
  // test would fail for the same reason a real person would be stuck.
  test("a fursona somebody creates is readable by a stranger", async ({
    page,
    browser,
  }) => {
    await signIn(page, await mintTicket(identity!.userId));

    await page.goto("/es/me");
    const address = (await page.getByTestId("my-address").innerText()).trim();
    expect(address).not.toBe("");

    const handle = `e2e${Date.now().toString().slice(-9)}`;
    await page.goto("/es/fursonas/new");
    await page.getByTestId("editor-handle").fill(handle);
    await page.getByTestId("editor-display-name").fill("End To End");
    await page.getByTestId("editor-visibility").selectOption("public");
    await page.getByTestId("editor-save").click();

    // The editor navigates to the list only when the save was accepted, so
    // arriving there IS the assertion that the write went through.
    await page.waitForURL(/\/fursonas$/, { timeout: 30_000 });

    // A genuinely separate browser context: no session, no cookies, nothing
    // carried over. Reading it in the signed-in page would prove only that the
    // owner can see their own work, which was never in doubt.
    const stranger = await browser.newContext();
    try {
      const anonymous = await stranger.newPage();
      const response = await anonymous.goto(`/es/${address}/${handle}`);

      // The identity proof is the URL, not the rendered copy. Both halves of
      // `/{address}/{handle}` were produced by this test — the address read off
      // /me, the handle typed into the editor — so a 200 here can only be the
      // fursona just created. Asserting the display name instead would assert
      // text, which the lint rule rightly forbids because it cannot tell a
      // person's own words from a translated string.
      expect(response?.status()).toBe(200);
      await expect(anonymous.getByTestId("public-actor-name")).toBeVisible();
    } finally {
      await stranger.close();
    }
  });

  // The other half of the round trip. A person is provisioned private, so
  // before `update_my_profile` existed their own page answered 404 to
  // everybody — including them — and nothing in the product could change it.
  test("a profile somebody publishes is readable by a stranger", async ({
    page,
    browser,
  }) => {
    await signIn(page, await mintTicket(identity!.userId));

    await page.goto("/es/me");
    const address = (await page.getByTestId("my-address").innerText()).trim();

    // Private to begin with, which is the state that made this necessary.
    const before = await browser.newContext();
    try {
      const anonymous = await before.newPage();
      const response = await anonymous.goto(`/es/${address}`);
      expect(response?.status()).toBe(404);
    } finally {
      await before.close();
    }

    await page.getByTestId("me-display-name").fill("A Real Person");
    await page.getByTestId("me-visibility").selectOption("public");
    // A profile is a public page like any other, so it themes like one. That
    // panel was missing here for the whole life of theming: the column stored a
    // theme, the page rendered it, and no screen wrote one.
    await page.getByTestId("theme-open").click();
    await page.getByTestId("theme-skin").selectOption("candy");
    await page.getByTestId("me-save").click();
    await expect(page.getByTestId("me-saved")).toBeVisible();

    const after = await browser.newContext();
    try {
      const anonymous = await after.newPage();
      const response = await anonymous.goto(`/es/${address}`);
      expect(response?.status()).toBe(200);
      await expect(anonymous.getByTestId("public-actor-name")).toBeVisible();
      // The style reached a stranger, and it reached them as the properties it
      // stands for. Asserting on the word "candy" would pass on a page that
      // shipped the name and no style at all.
      const styles = await anonymous.locator("style").allTextContents();
      expect(styles.join("")).toContain("--skin-border:2px");
    } finally {
      await after.close();
    }

    // And it comes back into the panel, which is the half a write-only control
    // would still pass without.
    await page.reload();
    await page.getByTestId("theme-open").click();
    await expect(page.getByTestId("theme-skin")).toHaveValue("candy");
  });

  // Closes one of the two manual steps phase 1b-i left open: "verify a real
  // sign-in provisions exactly one actor row". This asserts it THROUGH THE
  // PRODUCT rather than by counting rows, because the e2e job has no
  // service-role credentials and should not be given any. Two separate sessions
  // for the same identity must resolve to the same platform id; a second row
  // would produce a different one, and ensure_person_actor's idempotency is
  // proven directly in tests/db/provisioning.test.ts.
  test("signing in twice resolves to the same platform id", async ({
    page,
    browser,
  }) => {
    await signIn(page, await mintTicket(identity!.userId));
    await page.goto("/es/me");
    const first = (await page.getByTestId("my-platform-id").innerText()).trim();
    expect(first).not.toBe("");

    const second = await browser.newContext();
    try {
      const other = await second.newPage();
      await signIn(other, await mintTicket(identity!.userId));
      await other.goto("/es/me");
      expect(
        (await other.getByTestId("my-platform-id").innerText()).trim(),
      ).toBe(first);
    } finally {
      await second.close();
    }
  });

  // WHAT THE WHOLE STUDIO WAS FOR. Phases 4a to 4c built an editor that
  // composes a page out of sections, and phase 5 built the page a stranger
  // reads — but nothing had ever shown that something written in the one
  // arrives in the other. A template is the shortest honest path: it inserts
  // real sections through the real picker.
  test("sections written in the editor reach a stranger's browser", async ({
    page,
    browser,
  }) => {
    await signIn(page, await mintTicket(identity!.userId));

    await page.goto("/es/me");
    const address = (await page.getByTestId("my-address").innerText()).trim();

    const handle = `sec${Date.now().toString().slice(-9)}`;
    await page.goto("/es/fursonas/new");
    await page.getByTestId("editor-handle").fill(handle);
    await page.getByTestId("editor-display-name").fill("Has Sections");
    await page.getByTestId("editor-visibility").selectOption("public");

    await page.getByTestId("template-picker").click();
    await page.getByTestId("template-reference-sheet").click();
    await page.getByTestId("editor-save").click();
    await page.waitForURL(/\/fursonas$/, { timeout: 30_000 });

    const stranger = await browser.newContext();
    try {
      const anonymous = await stranger.newPage();
      const response = await anonymous.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);

      // The template ships two sections. Asserting the COUNT rather than the
      // words keeps this independent of both the author's content and the
      // catalogue, and still fails if the sections never made the round trip.
      await expect(anonymous.getByTestId("public-section")).toHaveCount(2);
    } finally {
      await stranger.close();
    }
  });

  // **The whole journey, in one test.** The others each prove one hop; this
  // walks the path a person actually takes — create with sections, theme it,
  // save, read it as a stranger, come back, save again — because the faults
  // worth catching live between the hops rather than inside them.
  //
  // The re-save at the end is the point. `set_actor_sections` REPLACES, so an
  // editor that reopened without somebody's sections deleted every one of them
  // the moment they pressed save. That shipped once, silently, and a unit test
  // of the page props is a weaker proof than doing it in a browser.
  test("a fursona survives being created, themed, read and saved again", async ({
    page,
    browser,
  }) => {
    await signIn(page, await mintTicket(identity!.userId));

    await page.goto("/es/me");
    const address = (await page.getByTestId("my-address").innerText()).trim();

    const handle = `full${Date.now().toString().slice(-9)}`;
    await page.goto("/es/fursonas/new");
    await page.getByTestId("editor-handle").fill(handle);
    await page.getByTestId("editor-display-name").fill("The Whole Journey");
    await page.getByTestId("editor-visibility").selectOption("public");
    await page.getByTestId("template-picker").click();
    await page.getByTestId("template-reference-sheet").click();

    // **A section built by hand, not from a template.** The template path was
    // the only one any test drove, and a template inserts its sections as data
    // — so every control a person actually uses to compose one was unexercised.
    await page.getByTestId("new-section-type").selectOption("stats");
    await page.getByTestId("add-section").click();
    await page.getByTestId("section-name").last().fill("Hecho a mano");
    await page.getByTestId("add-item").last().click();
    await page.getByTestId("item-title").last().fill("Especie");
    await page.getByTestId("item-description").last().fill("Zorro ártico");

    // Theme it: a background colour, an accent, a canvas that is not the
    // default, and a skin. Every one of these travels a different route into
    // the page — and the skin travels a route none of the colours do, since it
    // is stored as a name and resolved into properties when the page renders.
    await page.getByTestId("theme-open").click();
    await page.getByTestId("gradient-colour").fill("#101a2e");
    await page.getByTestId("theme-accent").fill("#00ff88");
    await page.getByTestId("theme-canvas").selectOption("stars");
    await page.getByTestId("theme-canvas-colour-0").fill("#ff0088");
    await page.getByTestId("theme-skin").selectOption("neobrutalism");

    await page.getByTestId("editor-save").click();
    await page.waitForURL(/\/fursonas$/, { timeout: 30_000 });

    // The list offers a way to see the page, now that it is public — and it
    // points at the right one. This assertion was `toBeTruthy()` on a locator
    // to begin with, which can never fail: it passed happily against a test id
    // that did not exist anywhere in the app.
    const view = page.getByTestId(`view-public-${handle}`);
    await expect(view).toBeVisible();
    await expect(view).toHaveAttribute(
      "href",
      new RegExp(`/${address}/${handle}$`),
    );

    const stranger = await browser.newContext();
    try {
      const anonymous = await stranger.newPage();
      const response = await anonymous.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);
      // Two from the template, one built by hand.
      await expect(anonymous.getByTestId("public-section")).toHaveCount(3);

      // The theme reached them. Asserted on the emitted rule rather than on a
      // rendered colour: a computed style would be reading the browser's
      // opinion of the stylesheet, where this reads what the page actually
      // shipped.
      const styles = await anonymous.locator("style").allTextContents();
      const themed = styles.join("");
      expect(themed).toContain("--field");
      expect(themed).toContain("--accent");
      // The skin arrives as the properties it stands for, never as its name.
      // Asserting on "neobrutalism" would pass on a page that shipped the word
      // and no style at all.
      expect(themed).toContain("--skin-border:3px");
    } finally {
      await stranger.close();
    }

    // Back into the editor. Everything must come back — and then survive a save
    // that changes nothing, which is exactly the shape of the bug that once
    // deleted people's sections.
    await page.goto(`/es/fursonas/${handle}/edit`);
    await expect(page.getByTestId("editor-display-name")).toHaveValue(
      "The Whole Journey",
    );
    await page.getByTestId("theme-open").click();
    await expect(page.getByTestId("theme-skin")).toHaveValue("neobrutalism");
    await page.getByTestId("editor-save").click();
    await page.waitForURL(/\/fursonas$/, { timeout: 30_000 });

    const after = await browser.newContext();
    try {
      const anonymous = await after.newPage();
      await anonymous.goto(`/es/${address}/${handle}`);
      // Still three. A re-save that dropped them would leave zero.
      await expect(anonymous.getByTestId("public-section")).toHaveCount(3);
      const themed = (await anonymous.locator("style").allTextContents()).join(
        "",
      );
      expect(themed).toContain("--accent");
    } finally {
      await after.close();
    }
  });
});
