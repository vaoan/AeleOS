import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addBlock, addSection } from "./support/editor";

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
// **There is no trigger and no popup any more (2026-09-04).** The Properties
// panel suppresses `SectionStylePopup`'s own inline trigger everywhere it
// mounts `BlockCard`/`LeafEditor` (`hideStylePopup`), and renders the
// identical `StyleFields` inline on its Appearance tab instead — reached by
// selecting the leaf and switching tabs, with no `section-style-open`/
// `leaf-style-open` id left to collide over, since only one thing is ever
// selected at a time.

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
  await addSection(page, "1");
  // `addSection` leaves the new section selected on its Layout tab, with its
  // one empty place already there — no tab switch needed to reach it.
  await addBlock(page, { kind: "text" });
  // **`avatar` only, and `portrait` is unreachable through any other kind's
  // select.** Choosable here because `offerableLeafKinds` refuses only the
  // ONE kind a page's actor kind has no use for (`owner` on a person page) —
  // `avatar` is never that kind, so a second avatar leaf is an ordinary
  // choice the select offers. Adding selected this leaf, so there is exactly
  // one `leaf-kind` select showing.
  await page.getByTestId("leaf-kind").selectOption("avatar");

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

  // No trigger to disambiguate any more — the leaf just added is the only
  // thing selected, so its own Appearance tab is the only `StyleFields`
  // mounted anywhere.
  await page.getByTestId("panel-tab-secondary").click();
  await expect(page.getByTestId("section-style-portrait")).toBeVisible();

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
