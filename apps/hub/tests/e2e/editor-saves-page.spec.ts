import { expect, test, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { handleFor, saveAndLeave, startFursona } from "./support/editor";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";
import { sectionsToBlocks } from "@/features/actors/domain/section-block-shim";
import { isContainer } from "@/features/actors/domain/block-schema";

// THE COVERAGE THAT WAS OWED, AND WHY IT IS OWED IN A BROWSER.
//
// `set_actor_sections` began validating a tree of blocks while the only editor
// there is still composed a flat list of sections, so every save carrying a
// page was refused in production — "Fix these before saving. Your sections
// were refused." The template button is the fastest way to reach it, because
// one click fills a whole page.
//
// **That was known before the branch merged and ruled acceptable.** The ruling
// drew its line at data loss and stopped there, and what it missed is that a
// core surface which cannot save is not a degraded state, it is a broken
// product. What was missing was not an argument; it was a test that drove the
// editor.
//
// So this suite drives the real thing: the real picker, the real Save, the
// real public page, and — the assertion most likely to be skipped and the only
// one that actually proves the round trip — the editor REOPENED on what it
// just wrote. A one-way test passes happily on a save that retypes somebody's
// section on the way back, which they find out a week later.
//
// **The editor composes BLOCKS now**, so what a template arrives as is the
// conversion `sectionsToBlocks` produces — the same one that opens every page
// written before the block model. The expectations below are built from that
// function rather than restated, so a change to the decomposition table is a
// change in one place.
//
// Every template is covered by looping over the list that ships them, so a
// template added later is covered without anybody remembering to add a case.
//
// It runs against the LIVE Supabase project and creates real actors, exactly
// as `signed-in.spec.ts` does; the `actors` rows survive by design, since
// deletion is soft.

// Serial because one identity is shared, and generous because each test walks
// the whole path — a sign-in, a create, two saves, two editor loads and a
// stranger's read. The default 30 seconds covers about half of that, and what
// it produces is a timeout at whichever step happened to be running.
test.describe.configure({ mode: "serial", timeout: 180_000 });

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

/** One section as the editor is holding it. */
interface EditorSection {
  /** The name in the authoring language, which starts as English. */
  name: string;
  /** The arrangement its select is showing. */
  mode: string;
  /** How many places across its shape control is showing. */
  spaces: string;
  /** Every piece of content's title, in the order the places are laid. */
  titles: string[];
}

/**
 * Reads back what the editor currently holds.
 *
 * **Reads the CONTROLS rather than the props**, because what is being proved
 * is that a page survived a round trip through storage: written as a tree of
 * blocks and read back. A component test with the page handed to it as a prop
 * asserts nothing about any of that.
 *
 * The authoring language starts as English, so `name` and `titles` are the
 * `*_en` halves — see `useLanguageToggle`.
 *
 * @param page - the browser page, sitting on an editor.
 * @returns one entry per section, in the order the editor shows them.
 */
async function readEditor(page: Page): Promise<EditorSection[]> {
  const cards = page.getByTestId("section-card");
  const sections: EditorSection[] = [];
  for (let index = 0; index < (await cards.count()); index += 1) {
    const card = cards.nth(index);
    const titles = card.getByTestId("leaf-title");
    const values: string[] = [];
    for (let item = 0; item < (await titles.count()); item += 1) {
      values.push(await titles.nth(item).inputValue());
    }
    sections.push({
      name: await card.getByTestId("section-name").inputValue(),
      mode: await card.getByTestId("section-mode").inputValue(),
      spaces: await card.getByTestId("section-spaces").inputValue(),
      titles: values,
    });
  }
  return sections;
}

/**
 * The same page, as the template that produced it describes itself.
 *
 * Built by running the template through `sectionsToBlocks` rather than by
 * restating the decomposition table, so what this expects and what the editor
 * is handed cannot disagree about anything except the round trip itself.
 *
 * @param sections - a template's own sections.
 * @returns what {@link readEditor} must find.
 */
const expectedFrom = (
  sections: (typeof FURSONA_TEMPLATES)[number]["sections"],
): EditorSection[] =>
  sectionsToBlocks(sections).map((block) => {
    if (!isContainer(block)) throw new Error("a template made a leaf");
    return {
      name: block.name_en ?? "",
      mode: block.mode,
      spaces: String(block.spaces),
      titles: block.children.map((child) =>
        child && !isContainer(child) ? child.title_en : "",
      ),
    };
  });

// EVERY TEMPLATE, DRIVEN FROM THE LIST THAT SHIPS THEM. A template added later
// is covered the moment it is added, which is the property a hand-listed set
// of four cases does not have — and the templates are exactly the surface
// nobody thought to test against the block model.
for (const template of FURSONA_TEMPLATES) {
  test(`the ${template.id} template saves, reopens and reaches a stranger`, async ({
    page,
    browser,
  }) => {
    await signIn(page, await mintTicket(identity!.userId));

    await page.goto("/es/me");
    const address = (await page.getByTestId("my-address").innerText()).trim();
    expect(address).not.toBe("");

    const handle = handleFor(`tpl${template.id.slice(0, 3)}`);
    await startFursona(page, handle, `Template ${template.id}`);

    await page.getByTestId("template-picker").click();
    await page.getByTestId(`template-${template.id}`).click();
    // Applied before anything is saved, so what the editor holds now is the
    // template itself — the state the round trip below is measured against.
    expect(await readEditor(page)).toEqual(expectedFrom(template.sections));

    await saveAndLeave(page);

    // THE ROUND TRIP. Written as blocks, read back, flattened — and equal to
    // what went in, layout by layout and item by item. This is the assertion a
    // one-way conversion passes and a wrong one does not.
    await page.goto(`/es/pages/${handle}/edit`);
    await expect(page.getByTestId("section-card").first()).toBeVisible();
    expect(await readEditor(page)).toEqual(expectedFrom(template.sections));

    // And a second save over what was just reopened, which is the shape of the
    // bug that once deleted people's sections: reopen, press Save, lose the
    // page. It must still be there afterwards.
    await saveAndLeave(page);

    const stranger = await browser.newContext();
    try {
      const anonymous = await stranger.newPage();
      const response = await anonymous.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);
      await expect(anonymous.getByTestId("public-section")).toHaveCount(
        template.sections.length,
      );
      // The page is not merely present but populated: a section that lost its
      // items would still be a section.
      await expect(anonymous.getByTestId("public-leaf").first()).toBeVisible();
    } finally {
      await stranger.close();
    }
  });
}

test("sections built by hand save, reopen and reach a stranger", async ({
  page,
  browser,
}) => {
  await signIn(page, await mintTicket(identity!.userId));

  await page.goto("/es/me");
  const address = (await page.getByTestId("my-address").innerText()).trim();

  const handle = handleFor("hand");
  await startFursona(page, handle, "By Hand");

  // A shape and an arrangement that are NOT the ones the add control starts
  // on, so what travels through storage is something this test chose rather
  // than whatever happened to be the default.
  await page.getByTestId("new-section-spaces").selectOption("3");
  await page.getByTestId("add-section").click();
  const card = page.getByTestId("section-card").first();
  await card.getByTestId("section-name").fill("A history");
  await card.getByTestId("section-mode").selectOption("timeline");
  // **The FIRST and the THIRD place of three, leaving the MIDDLE empty**, and
  // the position of the gap is the whole point rather than the count of gaps.
  // A trailing empty survives anything that merely appends; a middle one is
  // the case a tidy would close, moving everything after it up a place — and
  // it is the one shape a flat item list could not express at all. Every other
  // proof of it is either seeded straight into the database or asserted in
  // jsdom; this is the round trip through the real controls and real storage.
  await card.getByTestId("add-content").nth(0).click();
  await card.getByTestId("leaf-title").first().fill("The first day");
  await card.getByTestId("leaf-description").first().fill("It began.");
  // `nth(1)` of what is left: the first place now holds a leaf, so the two
  // remaining invitations are the second and the third.
  await card.getByTestId("add-content").nth(1).click();
  await card.getByTestId("leaf-title").last().fill("Much later");
  await card.getByTestId("leaf-description").last().fill("It went on.");

  await saveAndLeave(page);

  await page.goto(`/es/pages/${handle}/edit`);
  await expect(page.getByTestId("section-card").first()).toBeVisible();
  expect(await readEditor(page)).toEqual([
    {
      name: "A history",
      mode: "timeline",
      spaces: "3",
      titles: ["The first day", "Much later"],
    },
  ]);
  // THE GAP CAME BACK IN ITS OWN POSITION. Read as the ORDER of the places
  // rather than as a count of empty ones: a conversion that closed the gap and
  // appended an empty place at the end would satisfy every count assertion
  // above and fail this one, which is exactly the shift a "tidy the nulls
  // away" change produces.
  expect(
    await page
      .getByTestId("section-card")
      .first()
      .getByTestId("places")
      .locator("> *")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-testid")),
      ),
  ).toEqual(["leaf-editor", "empty-place", "leaf-editor"]);

  const stranger = await browser.newContext();
  try {
    const anonymous = await stranger.newPage();
    const response = await anonymous.goto(`/es/${address}/${handle}`);
    expect(response?.status()).toBe(200);
    await expect(anonymous.getByTestId("public-section")).toHaveCount(1);
    await expect(anonymous.getByTestId("public-leaf")).toHaveCount(2);
    // The gap a stranger sees. Its GEOMETRY — that the place is a full track
    // wide and that what follows sits past it — is `blocks-render.spec.ts`'s,
    // against a seeded page; what this adds is that a page somebody BUILT
    // arrives there with the same shape.
    await expect(anonymous.getByTestId("public-space")).toHaveCount(1);
  } finally {
    await stranger.close();
  }
});

// THE EDITOR THIS WAS REPORTED ON. `/me/edit` and `/pages/[handle]/edit` render
// the same component and save through the same `useFursonaEditor`, so they
// cannot diverge on the conversion — but they reach it from different routes,
// with different props, and the person's own form uses a different resolver
// (`personEditorSchema`, because a person's provisioned handle is longer than
// `fursonaSchema` allows). A save that worked for a fursona and not for a
// person has happened here before, silently, for exactly that reason.
test("a person's own page saves sections, reopens and reaches a stranger", async ({
  page,
  browser,
}) => {
  await signIn(page, await mintTicket(identity!.userId));

  await page.goto("/es/me");
  const address = (await page.getByTestId("my-address").innerText()).trim();

  await page.goto("/es/me/edit");
  await page.getByTestId("editor-display-name").fill("A Real Person");
  await page.getByTestId("editor-visibility").selectOption("public");

  // The identity is created for this file, so a person's own page has nothing
  // on it yet and the picker applies on the first click — there is nothing to
  // confirm.
  const [template] = FURSONA_TEMPLATES;
  await page.getByTestId("template-picker").click();
  await page.getByTestId(`template-${template!.id}`).click();

  await saveAndLeave(page);

  await page.goto("/es/me/edit");
  await expect(page.getByTestId("section-card").first()).toBeVisible();
  expect(await readEditor(page)).toEqual(expectedFrom(template!.sections));

  const stranger = await browser.newContext();
  try {
    const anonymous = await stranger.newPage();
    const response = await anonymous.goto(`/es/${address}`);
    expect(response?.status()).toBe(200);
    await expect(anonymous.getByTestId("public-section")).toHaveCount(
      template!.sections.length,
    );
  } finally {
    await stranger.close();
  }
});
