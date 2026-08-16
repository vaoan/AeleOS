import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";

// WHAT THIS FILE PROVES THAT section-skin-nesting.spec.ts DOES NOT.
//
// That suite proves the READ side: given a section whose `style` was already
// in the database, `nestedSkinVars`, `sectionStyle` and the stylesheet
// resolve it correctly in a real browser. It writes that `style` straight
// through `set_actor_sections`, deliberately bypassing the editor, because at
// the time it was written there was no control in the editor to drive —
// Task 5 of this plan is what built one.
//
// This is the other half: does the WRITE side work at all? `SectionStylePopup`
// writes to `${path}.style` through react-hook-form, `useFursonaEditor` sends
// the form's `sections` to `set_actor_sections` on save, and nothing before
// this file drove that path with a real browser — every unit test mocks the
// form or reads it back through `getValues`, never through a save, a reload of
// the PUBLIC route, and a fresh render. A wiring mistake between the popup and
// the save button — the popup writing to the wrong field name, `useFieldArray`
// dropping the key on submit, the schema stripping it — would pass every
// existing suite and still ship a paintbrush that painted nothing.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("a section's chosen skin and background, saved through the popup, reach the public page", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));

  // `/me` first: it is what provisions the person actor, and without one
  // `create_fursona` refuses with "no person actor for caller".
  await page.goto("/es/me");
  const address = (await page.getByTestId("my-address").innerText()).trim();

  await page.goto("/es/pages/new");
  await page.getByTestId("editor-handle").fill("stylepopup");
  await page.getByTestId("editor-display-name").fill("Style popup");
  await page.getByTestId("editor-visibility").selectOption("public");

  // One section, built by hand — a template inserts sections as data without
  // touching a single control, which would prove nothing here.
  await page.getByTestId("new-section-type").selectOption("cards");
  await page.getByTestId("add-section").click();
  await page.getByTestId("section-name").last().fill("Styled");

  // The control under test: open the popup, choose a skin distinctive enough
  // that no other skin could produce the same values by coincidence, paste a
  // background address, and choose how it fits.
  await page.getByTestId("section-style-open").click();
  await expect(page.getByTestId("section-style-panel")).toBeVisible();
  await page.getByTestId("section-style-skin").selectOption("neobrutalism");
  await page
    .getByTestId("section-style-background-url")
    .fill("https://example.com/section-style-popup.png");
  await page.getByTestId("section-style-fit").selectOption("cover");

  // The preview is the point of the task: the card behind the popup carries
  // the choice live, before any save.
  const preview = page.getByTestId("section-card").first();
  await expect
    .poll(() =>
      preview.evaluate((el) => el.style.getPropertyValue("--skin-round")),
    )
    .toBe("0");

  await page.getByTestId("editor-save").click();
  await page.waitForURL(/\/pages(\?|$)/);

  const response = await page.goto(`/es/${address}/stylepopup`);
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("public-section")).toHaveCount(1);

  // The wrapper `sectionStyle` writes the inline properties onto — see
  // `public-sections.tsx` — is the `<section>` enclosing the heading that
  // carries the `public-section` test id, not the heading itself.
  const wrapper = page
    .locator("section")
    .filter({ has: page.getByTestId("public-section") });

  // `neobrutalism`'s own values, from `skins.ts` — pinned rather than merely
  // "a style attribute exists", the same discipline `public-sections.test.tsx`
  // uses for the same skin.
  await expect(
    wrapper.evaluate((el) =>
      (el as HTMLElement).style.getPropertyValue("--skin-round"),
    ),
  ).resolves.toBe("0");
  await expect(
    wrapper.evaluate((el) =>
      (el as HTMLElement).style.getPropertyValue("--skin-border"),
    ),
  ).resolves.toBe("3px");

  // The background address the popup was given, and the fit it was told —
  // proof the whole path from the control to the saved row to the renderer
  // carried both, not only the skin.
  await expect(
    wrapper.evaluate((el) => (el as HTMLElement).style.backgroundImage),
  ).resolves.toBe('url("https://example.com/section-style-popup.png")');
  await expect(
    wrapper.evaluate((el) => (el as HTMLElement).style.backgroundSize),
  ).resolves.toBe("cover");
});
