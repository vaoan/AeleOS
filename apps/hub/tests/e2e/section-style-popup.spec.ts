import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";

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

// **A test's own card is the LAST one.** Every page opens carrying the identity
// section the database requires, and `add-section` appends — so `.first()` here
// would reach for the identity section's controls instead, and a page-wide
// `section-style-open` matches two buttons rather than one.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("a skin chosen in the popup paints the card behind it at once", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));

  await page.goto("/es/pages/new");

  // One section, built by hand — a template inserts sections as data without
  // touching a single control, which would prove nothing here.
  await page.getByTestId("new-section-spaces").selectOption("2");
  await page.getByTestId("add-section").click();
  await page.getByTestId("section-name").last().fill("Styled");

  const card = page.getByTestId("section-card").last();
  // Nothing chosen yet: the card carries no inline style at all, which is what
  // makes every assertion below a CHANGE rather than a state that was already
  // there.
  expect(await card.evaluate((el) => el.hasAttribute("style"))).toBe(false);

  await page.getByTestId("section-style-open").last().click();
  await expect(page.getByTestId("section-style-panel")).toBeVisible();

  // A skin distinctive enough that no other could produce these values by
  // coincidence, pinned against `skins.ts`'s own table for `neobrutalism`
  // rather than asserted as "a style attribute exists".
  await page.getByTestId("section-style-skin").selectOption("neobrutalism");
  await expect
    .poll(() =>
      card.evaluate((el) => el.style.getPropertyValue("--skin-round")),
    )
    .toBe("0");
  expect(
    await card.evaluate((el) => el.style.getPropertyValue("--skin-border")),
  ).toBe("3px");

  // The background picture and its fit land on the FACE rather than the root —
  // a painted property behind a rounded face would show four bright corner
  // wedges, which is why `SectionCard` splits what inherits from what paints.
  // Reading them off the face is what makes that split a measurement.
  const face = page.getByTestId("section-card-face").last();
  await page
    .getByTestId("section-style-background-url")
    .fill("https://example.com/section-style-popup.png");
  await page.getByTestId("section-style-fit").selectOption("cover");
  await expect
    .poll(() => face.evaluate((el) => el.style.backgroundImage))
    .toBe('url("https://example.com/section-style-popup.png")');
  expect(await face.evaluate((el) => el.style.backgroundSize)).toBe("cover");
});
