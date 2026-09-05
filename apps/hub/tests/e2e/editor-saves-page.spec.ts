import { expect, test, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import {
  establishSharedSession,
  sharedStatePath,
} from "./support/shared-session";
import {
  addBlock,
  addSection,
  handleFor,
  openMore,
  openPageAdd,
  openPageOptions,
  saveAndLeave,
  selectBlock,
  selectPage,
  startFursona,
} from "./support/editor";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";
import { isContainer } from "@/features/actors/domain/block-schema";
import { missingRequiredKinds } from "@/features/actors/domain/required-blocks";

// One sign-in for the whole file: every case below signs in as the same
// shared identity to build its own fresh fursona, and none depends on what
// an earlier case left behind, so they restore one saved session rather
// than minting a fresh ticket each — see `support/shared-session.ts`.
const STATE_PATH = sharedStatePath("editor-saves-page");

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
// **A template ARRIVES as blocks now** (2026-08-28). It is converted once where
// it is declared rather than when it is applied, so this spec no longer runs
// `sectionsToBlocks` itself — the expectations below are built from
// `template.blocks`, which is the very thing the picker hands the editor.
//
// That is a stronger guarantee than the conversion it replaced, and worth
// knowing before somebody "restores" the old shape: building the expectation
// from the same function the product calls could agree with a decomposition
// that had drifted from what a template actually ships, because both sides
// would be running the same drifted code. Reading the shipped value instead
// means the two can genuinely disagree.
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

test.beforeAll(async ({ browser }) => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  await establishSharedSession(browser, identity.userId, STATE_PATH);
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");
test.use({ storageState: STATE_PATH });

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
 * Reads back what the editor currently holds, through the page source dock.
 *
 * **It read the section CARDS until 2026-09-01, and could not any more.** The
 * recursive inspector mounts one selected scope at a time, so at most one
 * `section-card` exists at any moment and it renders none of its descendants.
 * A walk over every card on the page therefore stopped being a reading of the
 * page and became a reading of whatever happened to be selected — which would
 * not have failed loudly, since an editor holding nothing selected answers an
 * empty list, and an empty list is a legal page shape for this helper to
 * report.
 *
 * The dock is the editor's own live document — `{ aeleos, theme, blocks }`,
 * the two `jsonb` columns as `PageSourceField` serialises them from the same
 * `blocks` state every card renders from. So this is still a reading of what
 * the editor HOLDS rather than of the props it was handed, which is the whole
 * point of this suite: a page written as a tree of blocks and read back.
 *
 * The three scalars are lifted the way the controls compute them —
 * `block.name_en ?? ""`, `block.mode`, `String(block.spaces)` — so an
 * expectation written against the old card walk needs no adjusting.
 *
 * **`titles` is FLATTENED, and that is copied behaviour rather than a
 * simplification.** The card walk collected every `leaf-title` inside a
 * section, nested ones included and empty places contributing nothing, which
 * is why {@link IDENTITY_SECTION} spells out four titles for a two-place grid.
 * A depth-first walk that skips nulls and recurses through containers is the
 * same list.
 *
 * The authoring language starts as English, so `name` and `titles` are the
 * `*_en` halves — see `useLanguageToggle`.
 *
 * It leaves the dock closed, because every caller carries on driving the
 * editor underneath it.
 *
 * **And it leaves `More` exactly as it found it (2026-09-05).** `openMore`
 * opens that disclosure to reach `editor-open-source` and has no matching
 * close — a native `<details>` closes only through its own `<summary>`, and
 * nothing here pressed it again. That was harmless while the toolbar sat
 * BELOW the Properties panel (`z-20` against the panel's `z-30`): a `More`
 * left open behind the panel was covered and could not be clicked. The toolbar moved
 * to `z-40` the same day, to fix `More`'s own items being unreachable while
 * the panel is open — and the reverse fault immediately became reachable:
 * `readEditor`, called mid-test with the panel open, left `More` open on top
 * of it, and the very next `panel-tab-secondary` click landed on `More`'s own
 * `interact-with-page` instead — a real, 100%-reproducing failure this
 * comment is what explains. `readEditor` now closes `More` again when IT was
 * the one that opened it, and leaves an already-open `More` exactly as it
 * found it — the same idempotent shape `openMore` itself already uses.
 *
 * @param page - the browser page, sitting on an editor.
 * @returns one entry per section, in the order the editor holds them.
 */
async function readEditor(page: Page): Promise<EditorSection[]> {
  const more = page.getByTestId("editor-more");
  const wasOpen = await more.evaluate(
    (el) => (el.parentElement as HTMLDetailsElement).open,
  );
  await openMore(page);
  await page.getByTestId("editor-open-source").click();
  const dock = page.getByTestId("page-source-dock");
  await expect(dock).toBeVisible();
  const source = await page.getByTestId("page-source-textarea").inputValue();
  await page.getByTestId("page-source-close").click();
  await expect(dock).toBeHidden();
  if (!wasOpen) {
    await more.click();
    const stillOpen = await more.evaluate(
      (el) => (el.parentElement as HTMLDetailsElement).open,
    );
    expect(stillOpen).toBe(false);
  }

  const document: unknown = JSON.parse(source);
  const blocks = (document as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) throw new Error("the dock published no blocks");

  /**
   * Every leaf title beneath one place, in the order the page draws them.
   *
   * @param block - what is in the place, which may be nothing.
   * @returns the titles, with empty places contributing none.
   */
  const titlesOf = (block: unknown): string[] => {
    if (!block || typeof block !== "object") return [];
    const node = block as {
      kind?: unknown;
      title_en?: unknown;
      children?: unknown;
    };
    if (node.kind !== "container") {
      return [typeof node.title_en === "string" ? node.title_en : ""];
    }
    return Array.isArray(node.children) ? node.children.flatMap(titlesOf) : [];
  };

  return blocks.map((block) => {
    const node = block as {
      name_en?: unknown;
      mode?: unknown;
      spaces?: unknown;
      children?: unknown;
    };
    return {
      name: typeof node.name_en === "string" ? node.name_en : "",
      mode: String(node.mode),
      spaces: String(node.spaces),
      titles: Array.isArray(node.children)
        ? node.children.flatMap(titlesOf)
        : [],
    };
  });
}

/**
 * The identity section every page opens with, as {@link readEditor} reads it.
 *
 * **A template names no identity block, so the shim supplies one and puts it
 * FIRST** — the composed `defaultIdentitySection`, a two-place grid holding the
 * portrait beside a stack of the name, the handle and the owner. `readEditor`
 * flattens every leaf beneath a section, nested ones included, so the stack's
 * three arrive after the portrait.
 *
 * Written out rather than derived from `defaultIdentitySection`. Deriving it
 * would need this file to reproduce that flattening, and an expectation built
 * by the same walk it is checking agrees with itself whatever either does.
 */
const IDENTITY_SECTION: EditorSection = {
  name: "",
  mode: "grid",
  spaces: "2",
  titles: ["Portrait", "Name", "Handle", "Owner"],
};

/**
 * The same, for a PERSON — which is two sections rather than one.
 *
 * `defaultIdentitySection` puts `owner` in the stack for a fursona and nothing
 * in its place for a person, because a person has no owner to name. Their third
 * required kind is `fursonas`, which is not part of the composed header at all,
 * so `withRequiredBlocks` appends it in a section of its own. The result is a
 * three-title grid followed by a one-title stack, and getting this wrong looks
 * exactly like the fursona case being right.
 */
const PERSON_HEADER: EditorSection = {
  name: "",
  mode: "grid",
  spaces: "2",
  titles: ["Portrait", "Name", "Handle"],
};

/**
 * And the one that lands at the END rather than beside the header.
 *
 * `withRequiredBlocks` returns the header, then the page, then whatever is
 * still missing — so a kind that is not part of the composed header, and
 * `fursonas` is the only one, is appended after everything the author has.
 * Expecting it second is the mistake this constant exists to stop being made
 * twice.
 */
const PERSON_FURSONAS: EditorSection = {
  name: "",
  mode: "stack",
  spaces: "1",
  titles: ["Fursonas"],
};

/**
 * The same page, as the template that produced it describes itself.
 *
 * Built from the template's own blocks rather than by
 * restating the decomposition table, so what this expects and what the editor
 * is handed cannot disagree about anything except the round trip itself — plus
 * {@link IDENTITY_SECTION}, which is not the template's and is what the editor
 * adds to make the page one the database will accept.
 *
 * @param blocks - a template's own blocks, already converted. The spec used
 *   to take flat sections and run `sectionsToBlocks` itself; a template ships
 *   blocks now, so the conversion lives where it belongs and this helper can
 *   no longer disagree with what the picker actually hands out.
 * @param identity - what the shim put BEFORE them, which differs by actor
 *   kind. A person's page passes an empty list and places its own two around
 *   the result, because one of theirs is appended rather than prepended.
 * @returns what {@link readEditor} must find.
 */
const expectedFrom = (
  blocks: (typeof FURSONA_TEMPLATES)[number]["blocks"],
  identity: EditorSection[] = [IDENTITY_SECTION],
): EditorSection[] => [
  ...identity,
  ...blocks.map((block) => {
    if (!isContainer(block)) throw new Error("a template made a leaf");
    return {
      name: block.name_en ?? "",
      mode: block.mode,
      spaces: String(block.spaces),
      titles: block.children.map((child) =>
        child && !isContainer(child) ? child.title_en : "",
      ),
    };
  }),
];

// EVERY TEMPLATE, DRIVEN FROM THE LIST THAT SHIPS THEM. A template added later
// is covered the moment it is added, which is the property a hand-listed set
// of four cases does not have — and the templates are exactly the surface
// nobody thought to test against the block model.
/**
 * A colour the author picks BEFORE applying a template.
 *
 * It has to be one no shipped look also uses, or "the look replaced it" and
 * "the look happened to agree" would be the same observation.
 */
const CHOSEN_ACCENT = "#e21233";

for (const template of FURSONA_TEMPLATES) {
  test(`the ${template.id} template saves, reopens and reaches a stranger`, async ({
    page,
    browser,
  }) => {
    await page.goto("/es/me");
    const address = (await page.getByTestId("my-address").innerText()).trim();
    expect(address).not.toBe("");

    const handle = handleFor(`tpl${template.id.slice(0, 3)}`);
    await startFursona(page, handle, `Template ${template.id}`);
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });

    // **A colour chosen BEFORE the template, so applying one has something of
    // theirs to lose.** A template carries a `theme` now — null for every
    // shipped starter, meaning leave the author's colours alone — and the only
    // way to prove that survives a real save is to have chosen a colour first.
    // A unit test cannot see a database; this is the same guarantee at the
    // level where the save actually happens.
    //
    // `startFursona` leaves Page selected on its PRIMARY tab (identity fields
    // and the add palette); the theme panel is on the SECONDARY tab now, so
    // it has to be switched to before `theme-open` is reachable.
    await openPageOptions(page);
    await page.getByTestId("theme-open").click();
    await page.getByTestId("theme-accent").fill(CHOSEN_ACCENT);
    await expect(page.getByTestId("theme-accent")).toHaveValue(CHOSEN_ACCENT);

    // **What a template does to a palette depends on whether it HAS one**, and
    // this is that contract as one value rather than a branch. A starter
    // carries `theme: null`, which means leave the author's colours alone; an
    // era look carries a whole palette and replaces them, which is the entire
    // point of being a look. Written unconditionally because a conditional
    // `expect` is one that can silently not run — the exact shape this suite
    // has been bitten by.
    const expectedAccent = template.theme?.accent ?? CHOSEN_ACCENT;

    await openPageAdd(page);
    await page.getByTestId("template-picker").click();
    await page.getByTestId(`template-${template.id}`).click();
    // **A template that already carries its identity gets no header added**,
    // and that is why this is computed rather than assumed. `withRequiredBlocks`
    // seeds the composed portrait-and-handle section only for what a page
    // LACKS — a starter names none of those kinds and gets the whole header,
    // an era look carries its own and gets nothing. Asking
    // `missingRequiredKinds` is what keeps the two cases from needing two
    // tests, and what stops this drifting if a starter ever grows one.
    const expected = expectedFrom(
      template.blocks,
      missingRequiredKinds(template.blocks, "fursona").length > 0
        ? [IDENTITY_SECTION]
        : [],
    );

    // **The confirmation now APPEARS**, where before this branch it did not:
    // choosing a colour is authored work, so `holdsNothingAuthored` answers
    // false and the picker asks first. That is Task 1's change reaching a real
    // browser, and it is asserted rather than tolerated — a `click` that
    // silently found nothing would leave the template unapplied and fail
    // further down with a confusing message.
    await page.getByTestId("template-confirm-yes").click();
    // Applying a template does not change WHICH selection is current — Page
    // stays selected throughout — so the scope key that would remount a pane
    // never fires and the SECONDARY tab is reached by a plain tab click
    // rather than by reselecting Page.
    await page.getByTestId("panel-tab-secondary").click();
    // Applied before anything is saved, so what the editor holds now is the
    // template itself — the state the round trip below is measured against.
    expect(await readEditor(page)).toEqual(expected);

    // **`theme-open` has to be pressed again here, and that is not a
    // duplicate of line 321.** `openPageAdd` above found the panel already on
    // this SECONDARY tab (Page's add palette lives on the PRIMARY one) and
    // fell through to `selectPage`'s close-then-reopen path to get there —
    // which unmounts `ThemeConfigurator` along with the rest of the panel,
    // same as any other full close. Its `open` accordion state is local and
    // does not survive that, exactly as it does not survive the page reload
    // at line 395 below. The panel being back on the secondary tab proves
    // nothing about the accordion inside it.
    await page.getByTestId("theme-open").click();

    // **What a template does to a palette depends on whether it HAS one**, and
    // both branches run here rather than one being assumed. A starter carries
    // `theme: null`, which means leave the author's colours alone; an era look
    // carries a whole palette and replaces them, which is the entire point of
    // being a look. Asserting only the first would have gone red the moment
    // the looks joined the list, and asserting only the second would let a
    // starter quietly reset somebody.
    await expect(page.getByTestId("theme-accent")).toHaveValue(expectedAccent);

    await saveAndLeave(page);

    // THE ROUND TRIP. Written as blocks, read back, flattened — and equal to
    // what went in, layout by layout and item by item. This is the assertion a
    // one-way conversion passes and a wrong one does not.
    await page.goto(`/es/pages/${handle}/edit`);
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    // **The canvas rather than a section card.** Nothing is selected on load,
    // so no card is mounted; the page itself is what the editor draws, and
    // waiting on its first block is what proves the reopened editor has
    // something before the dock is asked what that something is.
    await expect(page.getByTestId("block-preview").first()).toBeVisible();
    expect(await readEditor(page)).toEqual(expected);

    // And whatever the template decided about the palette survived the round
    // trip through the database — which a unit test structurally cannot check.
    await openPageOptions(page);
    await page.getByTestId("theme-open").click();
    await expect(page.getByTestId("theme-accent")).toHaveValue(expectedAccent);

    // And a second save over what was just reopened, which is the shape of the
    // bug that once deleted people's sections: reopen, press Save, lose the
    // page. It must still be there afterwards.
    await saveAndLeave(page);

    const stranger = await browser.newContext({ storageState: undefined });
    try {
      const anonymous = await stranger.newPage();
      const response = await anonymous.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);
      // The template's own sections, plus whatever the editor had to ADD —
      // which is the composed identity header for a starter and nothing at all
      // for an era look, since a look carries its own. `expected` was computed
      // from the same question, so counting it keeps the two in step rather
      // than restating the arithmetic and letting them disagree.
      await expect(anonymous.getByTestId("public-section")).toHaveCount(
        expected.length,
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
  await page.goto("/es/me");
  const address = (await page.getByTestId("my-address").innerText()).trim();

  const handle = handleFor("hand");
  await startFursona(page, handle, "By Hand");

  // A shape and an arrangement that are NOT the ones the add control starts
  // on, so what travels through storage is something this test chose rather
  // than whatever happened to be the default. `addSection` adds at the
  // picker's own fixed starting shape and reshapes it afterward, through the
  // section's own `section-spaces` control — the width moved from before
  // adding to after, matching how nesting already worked.
  //
  // **Adding selects what was added**, so the section this test builds is
  // already showing on its own Layout tab, where its name, mode, spaces and
  // `add-place` all live together — no tab click needed between any of them.
  await addSection(page, "3");
  await page.getByTestId("section-name").fill("A history");
  await page.getByTestId("section-mode").selectOption("timeline");
  // **A width is not a capacity.** The picker's own layout options always
  // start a container at two children — `section-spaces` above only reshapes
  // how many places lay ACROSS, never `children` — so a genuine third place
  // needs its own `add-place` press before this test's middle gap can exist
  // at all.
  await page.getByTestId("add-place").click();

  // **The FIRST and the THIRD place of three, leaving the MIDDLE empty**, and
  // the position of the gap is the whole point rather than the count of gaps.
  // A trailing empty survives anything that merely appends; a middle one is
  // the case a tidy would close, moving everything after it up a place — and
  // it is the one shape a flat item list could not express at all.
  //
  // **There is exactly one global Add now, and it always fills the parent's
  // FIRST empty place — there is no way to target the third place directly
  // while leaving the second one alone.** So all three places are filled in
  // order and the middle one is emptied again afterwards, through Delete —
  // which, on a place nested inside a container, clears it (`clearAt`) rather
  // than removing it, exactly the "empty, not gone" state this test wants.
  // The section is still selected after `add-place`, so the first Add lands
  // in it directly; each Add after that selects what it just added, whose own
  // target is its PARENT — the same section — so the run of three lands in
  // order with no reselection.
  await addBlock(page, { kind: "text" });
  await page.getByTestId("leaf-title").fill("The first day");
  await page.getByTestId("leaf-description").fill("It began.");

  await addBlock(page, { kind: "text" });
  await page.getByTestId("leaf-title").fill("To be cleared");

  await addBlock(page, { kind: "text" });
  await page.getByTestId("leaf-title").fill("Much later");
  await page.getByTestId("leaf-description").fill("It went on.");

  // Select the middle leaf directly by its own canvas path and clear it.
  await selectBlock(page, "1-1");
  await page.getByTestId("remove-block").click();

  await saveAndLeave(page);

  await page.goto(`/es/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();
  expect(await readEditor(page)).toEqual([
    IDENTITY_SECTION,
    {
      name: "A history",
      mode: "timeline",
      spaces: "3",
      titles: ["The first day", "Much later"],
    },
  ]);
  // THE GAP CAME BACK IN ITS OWN POSITION. `readEditor`'s own titles flatten
  // every leaf beneath a section and skip nulls entirely, so the assertion
  // above cannot by itself tell "first and third filled, middle empty" apart
  // from "first and second filled, third empty" — both flatten to the same
  // two titles in the same order. This is the assertion that discriminates:
  // read by POSITION rather than by content. A conversion that closed the gap
  // and appended an empty place at the end would satisfy every count and
  // title assertion above and fail this one.
  //
  // Only a filled place carries `data-block-path` at all; an empty one keeps
  // its own `data-canvas-path` wrapper and renders `public-space` inside it —
  // the same pair `nested-page-build.spec.ts` and `properties-panel.spec.ts`
  // both read the identical way, and it needs no selection first: these
  // attributes come from the renderer itself, not from editor state.
  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);
  await expect(
    page.locator('[data-canvas-path="1-1"]').getByTestId("public-space"),
  ).toHaveCount(1);
  await expect(page.locator('[data-block-path="1-1"]')).toHaveCount(0);
  await expect(page.locator('[data-block-path="1-2"]')).toHaveCount(1);

  const stranger = await browser.newContext({ storageState: undefined });
  try {
    const anonymous = await stranger.newPage();
    const response = await anonymous.goto(`/es/${address}/${handle}`);
    expect(response?.status()).toBe(200);
    // Plus the identity section, whose four leaves join the count.
    await expect(anonymous.getByTestId("public-section")).toHaveCount(2);
    await expect(anonymous.getByTestId("public-leaf")).toHaveCount(2 + 4);
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
  await page.goto("/es/me");
  const address = (await page.getByTestId("my-address").innerText()).trim();

  await page.goto("/es/me/edit");
  // Identity fields are on Page's primary tab; `openPageOptions` would land
  // on the secondary (theme) tab instead.
  await selectPage(page);
  await page.getByTestId("editor-display-name").fill("A Real Person");
  await page.getByTestId("editor-visibility").selectOption("public");

  // The picker applies on the FIRST click, with nothing to confirm — and the
  // reason changed even though the behaviour did not. This page is not empty
  // any more: like every page it opens carrying its required blocks. What makes
  // the confirmation stay out of the way is `holdsNothingAuthored`, which asks
  // whether anything here is the AUTHOR's rather than whether anything is here.
  const [template] = FURSONA_TEMPLATES;
  await openPageAdd(page);
  await page.getByTestId("template-picker").click();
  await page.getByTestId(`template-${template!.id}`).click();

  await saveAndLeave(page);

  await page.goto("/es/me/edit");
  await expect(page.getByTestId("block-preview").first()).toBeVisible();
  expect(await readEditor(page)).toEqual([
    PERSON_HEADER,
    ...expectedFrom(template!.blocks, []),
    PERSON_FURSONAS,
  ]);

  const stranger = await browser.newContext({ storageState: undefined });
  try {
    const anonymous = await stranger.newPage();
    const response = await anonymous.goto(`/es/${address}`);
    expect(response?.status()).toBe(200);
    await expect(anonymous.getByTestId("public-section")).toHaveCount(
      template!.blocks.length + 2,
    );
  } finally {
    await stranger.close();
  }
});
