import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import {
  establishSharedSession,
  sharedStatePath,
} from "./support/shared-session";

const STATE_PATH = sharedStatePath("signed-in");

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

test.beforeAll(async ({ browser }) => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  // Established here rather than minted per test — see `support/shared-session.ts`.
  // The FIRST test below deliberately does NOT restore it: its whole subject
  // is whether a ticket sign-in itself provisions an identity, so it keeps its
  // own explicit `signIn`/`mintTicket` call and is outside the nested
  // `describe` that shares this session.
  await establishSharedSession(browser, identity.userId, STATE_PATH);
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

  // **Everything past this point restores the session `beforeAll` already
  // established, rather than minting a fresh ticket per case.** None of them
  // is about the sign-in itself — see `support/shared-session.ts`.
  test.describe("after the ticket", () => {
    test.use({ storageState: STATE_PATH });

    // THE ONE THING ABOUT THIS PAGE NO UNIT TEST CAN SEE.
    //
    // The signed-in layout asks the shell for `width="full"` now, and `/me` owns
    // the former `max-w-7xl` box through `WidePageColumn`. That route-owned box
    // deliberately drops vertical centring because page lists and editors are
    // long. This page is one short card, so it centres the card inside its own
    // box, and the assertion has to be a measured box: class strings cannot
    // prove where nested flex owners put it.
    //
    // The wrong behaviours being excluded are named so the fixture can be checked
    // against them: top-aligned in a tall column, and stretched across the wide
    // one. Both are what this page did before. The viewport is tall and wide on
    // purpose — the slack assertions are what make the two distinguishable at
    // all, since on a short window a centred card and a top-aligned one land in
    // the same place.
    test("their identity card sits in the middle of the window", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/es/me");

      const card = page.getByTestId("card");
      await expect(card).toHaveCount(1);

      const column = (await page.getByTestId("page-content").boundingBox())!;
      const box = (await card.boundingBox())!;

      // Without this slack the test passes whatever the page does.
      expect(column.height - box.height).toBeGreaterThan(200);
      expect(column.width - box.width).toBeGreaterThan(200);

      const off = (a: {
        x: number;
        y: number;
        width: number;
        height: number;
      }) => ({
        x: a.x + a.width / 2,
        y: a.y + a.height / 2,
      });
      expect(Math.abs(off(box).y - off(column).y)).toBeLessThanOrEqual(2);
      expect(Math.abs(off(box).x - off(column).x)).toBeLessThanOrEqual(2);
    });

    test("their fursona list is reachable and empty to begin with", async ({
      page,
    }) => {
      await page.goto("/es/pages");
      expect(page.url()).toContain("/pages");
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
      await page.goto("/es/me");
      const address = (await page.getByTestId("my-address").innerText()).trim();
      expect(address).not.toBe("");

      const handle = `e2e${Date.now().toString().slice(-9)}`;
      await page.goto("/es/pages/new");
      await page.getByTestId("editor-handle").fill(handle);
      await page.getByTestId("editor-display-name").fill("End To End");
      await page.getByTestId("editor-visibility").selectOption("public");
      await page.getByTestId("editor-save").click();

      // The editor navigates to the list only when the save was accepted, so
      // arriving there IS the assertion that the write went through.
      await page.waitForURL(/\/pages$/, { timeout: 30_000 });

      // A genuinely separate browser context: no session, no cookies, nothing
      // carried over. Reading it in the signed-in page would prove only that the
      // owner can see their own work, which was never in doubt.
      const stranger = await browser.newContext({ storageState: undefined });
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

        // **A page with nothing WRITTEN on it still names its actor**, and this
        // fursona is the one place in this suite where that state is guaranteed:
        // it was created through the editor with no sections of its own.
        //
        // This used to assert an empty-state message. That message is gone,
        // because the state it described cannot occur any more: the identity
        // blocks are supplied by `withRequiredBlocks` when a stored page names
        // none, so the screen of gradient a visitor could not tell from a
        // failed load is now a portrait, a handle and a link to the owner.
        // Asserting the owner link is what makes this case about the empty
        // page rather than about any page — it is a block this fursona never
        // wrote and could only have got from the shim.
        await expect(anonymous.getByTestId("block-owner")).toBeVisible();
        await expect(anonymous.getByTestId("public-empty")).toHaveCount(0);
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
      await page.goto("/es/me");
      const address = (await page.getByTestId("my-address").innerText()).trim();

      // Private to begin with, which is the state that made this necessary.
      const before = await browser.newContext({ storageState: undefined });
      try {
        const anonymous = await before.newPage();
        const response = await anonymous.goto(`/es/${address}`);
        expect(response?.status()).toBe(404);
      } finally {
        await before.close();
      }

      // **Edited in the page editor, reached from the list.** A person's public
      // page is a page like every other one there, so it is edited where they
      // are — `/me` carries only the identity card now.
      await page.goto("/es/pages");
      await page.getByTestId("edit-my-profile").click();
      await page.waitForURL(/\/me\/edit$/, { timeout: 30_000 });
      await page.getByTestId("editor-display-name").fill("A Real Person");
      await page.getByTestId("editor-visibility").selectOption("public");
      await page.getByTestId("theme-open").click();
      await page.getByTestId("theme-skin").selectOption("candy");
      await page.getByTestId("editor-save").click();
      await page.waitForURL(/\/pages$/, { timeout: 30_000 });

      const after = await browser.newContext({ storageState: undefined });
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

      // And it comes back into the editor, which is the half a write-only
      // control would still pass without.
      await page.goto("/es/me/edit");
      await page.getByTestId("theme-open").click();
      await expect(page.getByTestId("theme-skin")).toHaveValue("candy");
      // A person has no handle to choose: theirs is the provisioned
      // `u-<actor_ref>`, which appears in no address. The field is absent rather
      // than disabled — and its 34 characters once made the form refuse to save
      // with no message anywhere, because there was no input to attach one to.
      await expect(page.getByTestId("editor-handle")).toHaveCount(0);
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
      // `page` arrives already signed in via the restored session — established
      // minutes ago rather than moments ago, but it is a genuinely separate
      // sign-in from `other`'s below, which is what this test is actually about.
      await page.goto("/es/me");
      const first = (
        await page.getByTestId("my-platform-id").innerText()
      ).trim();
      expect(first).not.toBe("");

      const second = await browser.newContext({ storageState: undefined });
      try {
        const other = await second.newPage();
        // A genuinely fresh ticket for a genuinely independent session — this
        // is the one call in this describe kept deliberately, because the
        // claim under test is that TWO sign-ins converge on one platform id.
        await signIn(other, await mintTicket(identity!.userId));
        await other.goto("/es/me");
        expect(
          (await other.getByTestId("my-platform-id").innerText()).trim(),
        ).toBe(first);
      } finally {
        await second.close();
      }
    });

    // THE TEST THAT USED TO LIVE HERE, AND WHERE IT WENT.
    //
    // "Sections written in the editor reach a stranger's browser" inserted a
    // template through the real picker, saved, and counted the sections on the
    // public page. It was removed when `set_actor_sections` began validating a
    // tree of blocks and the flat editor's save was refused — which was the
    // production bug, sitting in plain sight as a deleted test.
    //
    // It is back, wider, in `editor-saves-page.spec.ts`: EVERY template, driven
    // from the list that ships them, saved, reopened in the editor, saved again
    // and read as a stranger; a page built by hand; and the person's own editor
    // at `/me/edit`, which is where it was actually reported. The other half —
    // what is STORED reaches a stranger's browser, in every mode and every kind
    // — is `blocks-render.spec.ts`, which seeds directly because a flat editor
    // cannot compose most of those trees.

    // **The whole journey, in one test.** The others each prove one hop; this
    // walks the path a person actually takes — create, theme it, save, read it
    // as a stranger, come back, save again — because the faults worth catching
    // live between the hops rather than inside them.
    //
    // The re-save at the end is the point. `set_actor_sections` REPLACES, so an
    // editor that reopened without somebody's page deleted every block of it the
    // moment they pressed save. That shipped once, silently, and a unit test of
    // the page props is a weaker proof than doing it in a browser. **It is
    // asserted on the THEME here**; the section half of the same assertion lives
    // in `editor-saves-page.spec.ts`, once per template.
    test("a fursona survives being created, themed, read and saved again", async ({
      page,
      browser,
    }) => {
      await page.goto("/es/me");
      const address = (await page.getByTestId("my-address").innerText()).trim();

      const handle = `full${Date.now().toString().slice(-9)}`;
      await page.goto("/es/pages/new");
      await page.getByTestId("editor-handle").fill(handle);
      await page.getByTestId("editor-display-name").fill("The Whole Journey");
      await page.getByTestId("editor-visibility").selectOption("public");

      // **No sections here on purpose.** This journey is the THEME half — a
      // theme travels its own RPC and is what every assertion below is about.
      // The sections half is `editor-saves-page.spec.ts`, which does the same
      // create/save/read/reopen/re-save walk for every template rather than for
      // one page, and a second copy of it here would only be a slower way to
      // find the same failure.

      // Theme it: a background colour, an accent, a canvas that is not the
      // default, and a skin. Every one of these travels a different route into
      // the page — and the skin travels a route none of the colours do, since it
      // is stored as a name and resolved into properties when the page renders.
      await page.getByTestId("theme-open").click();
      // **Copied FIRST, because a copy is a starting point.** The profile this
      // suite published earlier is themed, so the panel offers to take its look;
      // everything chosen below then lands on top of it, and the assertions
      // further down are all about those later choices.
      //
      // Pressing it after them instead is what the first version of this did, and
      // CI was right to fail it: the copy replaces the WHOLE theme, so it wiped
      // the gradient and the accent the test had just set. That is the button
      // working, and the test using it backwards.
      await page.getByTestId("theme-copy-profile").click();
      await page.getByTestId("gradient-colour").fill("#101a2e");
      await page.getByTestId("theme-accent").fill("#00ff88");
      await page.getByTestId("theme-canvas").selectOption("stars");
      await page.getByTestId("theme-canvas-colour-0").fill("#ff0088");
      await page.getByTestId("theme-skin").selectOption("neobrutalism");

      await page.getByTestId("editor-save").click();
      await page.waitForURL(/\/pages$/, { timeout: 30_000 });

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

      const stranger = await browser.newContext({ storageState: undefined });
      try {
        const anonymous = await stranger.newPage();
        const response = await anonymous.goto(`/es/${address}/${handle}`);
        expect(response?.status()).toBe(200);

        // The theme reached the page. Asserted on the emitted rule rather than on a
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
      await page.goto(`/es/pages/${handle}/edit`);
      await expect(page.getByTestId("editor-display-name")).toHaveValue(
        "The Whole Journey",
      );
      await page.getByTestId("theme-open").click();
      await expect(page.getByTestId("theme-skin")).toHaveValue("neobrutalism");
      await page.getByTestId("editor-save").click();
      await page.waitForURL(/\/pages$/, { timeout: 30_000 });

      const after = await browser.newContext({ storageState: undefined });
      try {
        const anonymous = await after.newPage();
        await anonymous.goto(`/es/${address}/${handle}`);
        // Still themed. A re-save that dropped what the editor reopened with
        // would leave a page wearing nothing.
        const themed = (
          await anonymous.locator("style").allTextContents()
        ).join("");
        expect(themed).toContain("--accent");
        expect(themed).toContain("--skin-border:3px");
      } finally {
        await after.close();
      }
    });
  });
});
