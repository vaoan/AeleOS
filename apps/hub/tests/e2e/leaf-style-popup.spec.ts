import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { chooseNewSectionSpaces } from "./support/editor";

// WHAT THIS FILE PROVES.
//
// `SectionStylePopup` reaches a LEAF now, not only a `ContainerBlock` — see
// `presentation/leaf-editor.tsx` and `styleGatesFor` in
// `presentation/block-contract.ts`. A unit suite can assert the gate answers
// correctly per kind (`leaf-editor.test.tsx` does), but it cannot assert that
// a real author reaches the control and that a choice actually changes what
// is drawn — that needs a browser, for the same reason
// `section-style-popup.spec.ts` does: the popup writes to the form field the
// preview reads, live, through react-hook-form's own store, which a unit test
// drives synthetically rather than through the real component tree.
//
// `portrait` is the key exercised here, and its effect is a measured SIZE
// rather than text — which is what lets this file avoid every text-based
// query this repo's lint config refuses (`getByText`, `toContainText`, …):
// `AvatarLeaf` writes the same `size-*` class on its `<img>` and on its
// empty-state placeholder alike, so the box changes whether or not this
// author has ever set a picture. That also makes `portrait` a cleaner proof
// than `label` would have been here — no title has to be typed for the
// preview to show anything at all.
//
// **The trigger this file clicks carries its own test id, `leaf-style-open`,
// not `section-style-open`.** The two popups are the same component and
// briefly shared one id, which is what let two OTHER suites'
// `.last()` calls silently start reaching a leaf's trigger instead of a
// section's the moment a leaf grew one — see
// `SectionStylePopupProps.triggerTestId` for the fix and the feature note
// for the account of finding it.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("a leaf's own portrait-size choice resizes its avatar in the live preview", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));

  await page.goto("/es/pages/new");

  // One section, one place, one piece of content — built by hand so what is
  // measured is the control that shipped, not a template's own data.
  await chooseNewSectionSpaces(page, "1");
  await page.getByTestId("add-section").click();
  await page.getByTestId("add-content").last().click();
  // **`avatar` only, and `portrait` is unreachable through any other kind's
  // select.** Choosable here because `offerableLeafKinds` refuses only the
  // ONE kind a page's actor kind has no use for (`owner` on a person page) —
  // `avatar` is never that kind, so a second avatar leaf is an ordinary
  // choice the select offers.
  await page.getByTestId("leaf-kind").last().selectOption("avatar");

  // **`block-avatar` matches TWO elements without this scoping**, because the
  // identity section this page already carries has one of its own. `.last()`
  // is the one this test just added — the identity section is always the
  // first top-level entry, so its avatar renders first in DOM order.
  const avatar = page
    .getByTestId("block-preview")
    .last()
    .getByTestId("block-avatar")
    .last();

  // **`size-24` (6rem) is what every page already had, absent OR `"m"`.**
  // Read first so the assertions after a choice measure a CHANGE, not a size
  // that was already there.
  await expect
    .poll(async () => (await avatar.boundingBox())?.width)
    .toBeCloseTo(96, 0);

  // **`leaf-style-open`, not `section-style-open`.** A leaf's own trigger
  // carries a distinct test id from a container's now — see
  // `SectionStylePopupProps.triggerTestId` — precisely so a query for one can
  // never resolve to the other. `.last()` is still needed: the identity
  // section's own required leaves (`avatar`, `handle`, `name`) each have one
  // too, and this leaf's is simply the most recently added.
  await page.getByTestId("leaf-style-open").last().click();
  const panel = page.getByTestId("section-style-panel");
  await expect(panel).toBeVisible();

  await page.getByTestId("section-style-portrait").selectOption("l");
  // `size-32` is 8rem.
  await expect
    .poll(async () => (await avatar.boundingBox())?.width)
    .toBeCloseTo(128, 0);
  expect((await avatar.boundingBox())?.height).toBeCloseTo(128, 0);

  await page.getByTestId("section-style-portrait").selectOption("s");
  // `size-12` is 3rem.
  await expect
    .poll(async () => (await avatar.boundingBox())?.width)
    .toBeCloseTo(48, 0);

  // And clearing the choice returns to what a page with no style key at all
  // already draws.
  await page.getByTestId("section-style-portrait").selectOption("");
  await expect
    .poll(async () => (await avatar.boundingBox())?.width)
    .toBeCloseTo(96, 0);
});
