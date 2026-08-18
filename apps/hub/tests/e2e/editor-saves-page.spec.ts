import { expect, test, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";

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
// one that actually proves the conversion — the editor REOPENED on what it
// just wrote. A one-way test passes happily on a shim that retypes somebody's
// section on the way back, which they find out a week later.
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

/**
 * A handle nothing else in the suite can collide with.
 *
 * @param prefix - names the test that made it, so a leftover row is traceable.
 * @returns the handle.
 */
const handleFor = (prefix: string) =>
  `${prefix}${Date.now().toString().slice(-9)}`;

/**
 * Presses Save and waits for the editor to leave.
 *
 * **The banner is asserted before the navigation is waited for**, and the
 * order is the whole value of this helper. A refused save simply stays on the
 * page, so `waitForURL` alone reports a timeout naming nothing —
 * which is precisely how a suite can be red for a week without anybody
 * learning what refused it. Reading the banner first turns the same failure
 * into the message the person actually saw.
 *
 * @param page - the browser page, sitting on an editor.
 */
async function saveAndLeave(page: Page): Promise<void> {
  await page.getByTestId("editor-save").click();
  const banner = page.getByTestId("editor-error-banner");
  await expect
    .poll(
      async () =>
        (await banner.count()) > 0 ||
        /\/pages$/.test(new URL(page.url()).pathname),
      { timeout: 60_000 },
    )
    .toBe(true);
  await expect(banner).toHaveCount(0);
  await page.waitForURL(/\/pages$/, { timeout: 60_000 });
}

/**
 * Fills the four fields a new public fursona needs.
 *
 * @param page - the browser page.
 * @param handle - the fursona's handle.
 * @param displayName - what to show.
 */
async function startFursona(
  page: Page,
  handle: string,
  displayName: string,
): Promise<void> {
  await page.goto("/es/pages/new");
  await page.getByTestId("editor-handle").fill(handle);
  await page.getByTestId("editor-display-name").fill(displayName);
  await page.getByTestId("editor-visibility").selectOption("public");
}

/** One section as the editor is holding it. */
interface EditorSection {
  /** The name in the authoring language, which starts as English. */
  name: string;
  /** The layout its select is showing. */
  type: string;
  /** Every item's title, in order. */
  titles: string[];
}

/**
 * Reads back what the editor currently holds.
 *
 * **Reads the CONTROLS rather than the props**, because what is being proved
 * is that a page survived a round trip through storage: written as a tree of
 * blocks, read back, and flattened into the shape this editor can hold. A
 * component test with the sections handed to it as a prop asserts nothing
 * about any of that.
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
    const titles = card.getByTestId("item-title");
    const values: string[] = [];
    for (let item = 0; item < (await titles.count()); item += 1) {
      values.push(await titles.nth(item).inputValue());
    }
    sections.push({
      name: await card.getByTestId("section-name").inputValue(),
      // The layout select is the only one in a section's header, and the style
      // popup that holds the others is closed.
      type: await card.locator("select").first().inputValue(),
      titles: values,
    });
  }
  return sections;
}

/**
 * The same page, as the template that produced it describes itself.
 *
 * @param sections - a template's own sections.
 * @returns what {@link readEditor} must find.
 */
const expectedFrom = (
  sections: (typeof FURSONA_TEMPLATES)[number]["sections"],
): EditorSection[] =>
  [...sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((one) => ({
      name: one.name_en,
      type: one.type,
      titles: [...one.items]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => item.title_en),
    }));

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

  // A layout that is NOT the one the add control starts on, so the type
  // travelling through storage is something this test chose rather than
  // whatever happened to be the default.
  await page.getByTestId("new-section-type").selectOption("timeline");
  await page.getByTestId("add-section").click();
  const card = page.getByTestId("section-card").first();
  await card.getByTestId("section-name").fill("A history");
  await card.getByTestId("add-item").click();
  await card.getByTestId("item-title").first().fill("The first day");
  await card.getByTestId("item-description").first().fill("It began.");

  await saveAndLeave(page);

  await page.goto(`/es/pages/${handle}/edit`);
  await expect(page.getByTestId("section-card").first()).toBeVisible();
  expect(await readEditor(page)).toEqual([
    { name: "A history", type: "timeline", titles: ["The first day"] },
  ]);

  const stranger = await browser.newContext();
  try {
    const anonymous = await stranger.newPage();
    const response = await anonymous.goto(`/es/${address}/${handle}`);
    expect(response?.status()).toBe(200);
    await expect(anonymous.getByTestId("public-section")).toHaveCount(1);
    await expect(anonymous.getByTestId("public-leaf")).toHaveCount(1);
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
