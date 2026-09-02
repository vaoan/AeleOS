import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { chooseNewSectionSpaces, openPageAdd } from "./support/editor";

// WHAT THIS FILE PROVES, AND THE HALF IT LOST.
//
// It used to drive the popup, SAVE, and read the choice back off the public
// page — the whole write path in one test. **That half is gone, because the
// path is.** The editor still composes a flat list of sections and
// `set_actor_sections` now walks a tree of blocks, so its save is refused
// outright until the editor is ported (phase 3). A test asserting a round trip
// through a write nothing can make is not a weaker test; it is one that cannot
// pass, and keeping it green by pointing it somewhere else would be a test
// about a different thing wearing this one's name.
//
// What survives is the half that still has a mechanism: **the popup writes to
// the form field the card reads, live, before anything is saved.** That is the
// paintbrush's whole promise — see somebody's choice on their own card at once
// — and it is a real browser fact rather than a unit one, because the card is
// painted by a `useWatch` subscription through react-hook-form's own store,
// which a unit test drives synthetically.
//
// The READ half — a style already in the database resolving correctly in a
// real CSS engine — is `section-skin-nesting.spec.ts` and
// `border-style-cascade.spec.ts`, both of which seed a block tree directly and
// are unaffected.

// The recursive inspector mounts only the selected card in Options, so the
// popup locator below is singular even though the page carries required
// identity blocks beside the section this test creates.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("a skin chosen in the popup paints the section preview at once", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));

  await page.goto("/es/pages/new");

  // One section, built by hand — a template inserts sections as data without
  // touching a single control, which would prove nothing here.
  await chooseNewSectionSpaces(page, "2");
  await openPageAdd(page);
  await page.getByTestId("add-section").click();
  await page.getByTestId("inspector-tab-options").click();
  await page.getByTestId("section-name").fill("Styled");

  const tray = page.getByTestId("block-preview").last();
  // **One element, not two.** There used to be a `section-preview-face` here —
  // an element the tray painted on the author's behalf so a picture could sit
  // under the card's own corners. The tray paints nothing now and renders the
  // real section, so what inherits and what paints are on the same element, and
  // it is the element a stranger's browser resolves them on.
  const preview = tray.getByTestId("public-section");
  const face = preview;
  // Nothing chosen yet. This makes the skin and picture checks below changes
  // rather than states the section already carried for another reason.
  expect(
    await preview.evaluate((el) => el.style.getPropertyValue("--skin-round")),
  ).toBe("");
  expect(
    await preview.evaluate((el) =>
      el.style.getPropertyValue("background-image"),
    ),
  ).toBe("");

  await page.getByTestId("section-style-open").click();
  await expect(page.getByTestId("section-style-panel")).toBeVisible();

  // A skin distinctive enough that no other could produce these values by
  // coincidence, pinned against `skins.ts`'s own table for `neobrutalism`
  // rather than asserted as "a style attribute exists".
  await page.getByTestId("section-style-skin").selectOption("neobrutalism");
  await expect
    .poll(() =>
      preview.evaluate((el) => el.style.getPropertyValue("--skin-round")),
    )
    .toBe("0");
  expect(
    await preview.evaluate((el) => el.style.getPropertyValue("--skin-border")),
  ).toBe("3px");

  // The background picture and its fit land on the section the renderer draws,
  // which is where a visitor sees them. `splitStyle` and the face it painted on
  // are gone with the tray's card chrome.
  await page
    .getByTestId("section-style-background-url")
    .fill("https://example.com/section-style-popup.png");
  await page.getByTestId("section-style-fit").selectOption("cover");
  await expect
    .poll(() => face.evaluate((el) => el.style.backgroundImage))
    .toBe('url("https://example.com/section-style-popup.png")');
  expect(await face.evaluate((el) => el.style.backgroundSize)).toBe("cover");
});
