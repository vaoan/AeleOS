import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage, seedProfile } from "./support/blocks";
import { compareShots } from "./support/pixels";
import {
  establishSharedSession,
  sharedStatePath,
} from "./support/shared-session";
import { openPageAdd } from "./support/editor";

// One sign-in for the whole file: every case below reads the same seeded
// page and none depends on what an earlier case left behind, so they
// restore one saved session rather than minting a fresh ticket each — see
// `support/shared-session.ts`.
const STATE_PATH = sharedStatePath("editor-is-the-page");

// HIDING THE CONTROLS LEAVES THE PAGE. THIS IS WHERE THAT IS A MEASUREMENT.
//
// The editor themes its own document with the draft, lays every section in the
// real `pageBoxClass`, and removes each control island on request. If all three
// are right then the editor with its controls hidden is not a picture of the
// published page — it IS it, in a document with the same viewport, the same
// scroll, the same `body` and the same canvas.
//
// So this photographs ONE seeded page twice, at its public address and in the
// editor with the controls hidden, and requires them to agree.
//
// WHAT IS EQUALISED, AND WHY THAT IS NOT CHEATING.
//
// The nebula canvas animates and is seeded per load, so left running it makes
// every comparison nondeterministic for a reason that has nothing to do with
// the editor. It is hidden identically on both sides — and because that hides
// the very thing an absent backdrop would look like, `the canvas is the
// author's on both sides` below asks that question separately, without quieting
// anything.
//
// The author's FIELD is not flattened, and that is deliberate. It is anchored
// to the window, so which slice sits behind a section is decided by where that
// section is on screen — which is exactly what this suite exists to check, and
// what `pinnedShot` makes checkable by putting the same section at the same
// offset in both documents.
//
// WHY THE FIXTURE LOOKS LIKE THIS.
//
// Rule 27. A fixture simple enough to be tidy makes a right answer and a wrong
// one photograph identically, and the previous fidelity suite shipped three
// faults for exactly that reason. Every element below is here to make some
// specific wrong answer visible:
//
//   * a bare section with no style of its own — it can only look right if the
//     document's own backdrop reaches it, so a preview that painted its own
//     field would differ here and nowhere else;
//   * a background photograph with four quadrants and a diagonal, because
//     `cover` over one box and `cover` over another are indistinguishable
//     unless the picture has detail to crop differently;
//   * weights of [1, 3, 2] — not a palindrome, so a renderer that reversed
//     them would differ, and not a shape any preset could produce;
//   * a bleeding, margin-less banner, which is the one section that reveals a
//     stray column or gutter around the page;
//   * `neon` for ink that overflows its box, which is what the tray's old
//     four-edge clipping destroyed;
//   * `cutout` for `clip-path`;
//   * a nest at the depth cap;
//   * the `widest` measure, which is one of the two stops a wrapping column
//     silently capped;
//   * an owner who is NAMED and PICTURED, because `ensure_person_actor` mints
//     none of those and a nameless owner photographs the same whether the
//     identity data was read or hardcoded away.

// **NOT serial, deliberately.** `playwright.config.ts` already runs one worker,
// so serial buys no isolation here — what it costs is the whole point of a
// responsive guard: the first failing width would skip every other, and a
// report saying "one failed" cannot tell you whether the editor is wrong at
// every size or only below a threshold. Measured while sabotaging this suite:
// removing the page box reported `1 failed` and skipped eleven cases that each
// had something to say.
// SABOTAGE-VERIFIED, and the three break DIFFERENT halves — which is the whole
// reason both halves exist. Measured on this fixture:
//
//   A. The tray loses `pageBoxClass` (renders the section with no page box at
//      all): 11 of 12 cases redden — every box case and every pixel case, at
//      every width. Only the canvas case survives, correctly, since it looks at
//      no geometry.
//
//   B. The `[data-controls="hidden"] [data-editor-stack]` rule is deleted, so
//      the editor's own gaps stay in place with the cards hidden: all FOUR
//      pixel cases redden at 40.7%, 41.2%, 40.2% and 46.1% — and NO box case
//      does. That is exactly right and it is what justifies keeping both: the
//      sections are the same size, they are simply at a different offset, and
//      the author's field is anchored to the window — so the only instrument
//      that can see it is one that reads the backdrop. Worst pixel at desktop:
//      the page paints hot pink `255,68,164` where the editor paints the
//      photograph's blue quadrant `17,46,87`.
//
//   C. The trays are wrapped in a `max-w-7xl` column — root rule 30's own
//      fault, which shipped two headline features broken: all seven box cases
//      redden plus the pixel cases, at 24.4% on a 320 phone where the doubled
//      gutter is the largest fraction of the width.
//
// RUNTIME: 1m06s for all twelve, on this machine, against `next dev`.
//
test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");
test.use({ storageState: STATE_PATH });

/**
 * How much of a section may differ before it is a different-looking section.
 *
 * A tenth of a percent, the same budget the framed-preview suite calibrated:
 * not covering a known difference, but the margin below which a handful of
 * stray pixels along an antialiased curve is not worth failing a branch for.
 */
const ALLOWED_RATIO = 0.001;

/**
 * The viewport widths this runs at, and why each is here.
 *
 * **The pairs STRADDLE a measured container-query threshold**, rather than
 * sampling round numbers. The width at which a grid stops collapsing to one
 * track is 352px for two places, 544px for three and 720px for four — measured
 * in this repository, see `weighted-places.spec.ts`. Those are the widths where
 * a geometry difference flips a VISIBLE answer, and a doubled 16px gutter is
 * what moved this threshold the last time it went wrong.
 *
 * A stop below and above each threshold is what makes the pair discriminating:
 * a single sample on one side answers the same whether or not the editor's box
 * matches the page's.
 */
const STOPS = [
  { name: "phone 320", width: 320, height: 720, pixels: true },
  { name: "phone 390", width: 390, height: 844, pixels: false },
  {
    name: "under the three-place threshold",
    width: 536,
    height: 900,
    pixels: true,
  },
  {
    name: "over the three-place threshold",
    width: 552,
    height: 900,
    pixels: true,
  },
  {
    name: "under the four-place threshold",
    width: 712,
    height: 900,
    pixels: false,
  },
  {
    name: "over the four-place threshold",
    width: 728,
    height: 900,
    pixels: false,
  },
  { name: "desktop 1280", width: 1280, height: 900, pixels: true },
] as const;

/**
 * A page background picture, served without leaving the machine.
 *
 * It must be an `http(s)` address: `backgroundImageValue` builds on
 * `safeHttpUrl`, which admits only those two schemes, so a `data:` URI is
 * stored happily, read back happily, and refused at the one point that turns it
 * into CSS — a fixture using one passes at 0.000% and proves nothing.
 */
const PHOTO = {
  url: "https://example.com/editor-is-the-page.svg",
  body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
    '<rect width="600" height="400" fill="#12305a"/>' +
    '<rect x="600" width="600" height="400" fill="#8a1f4b"/>' +
    '<rect y="400" width="600" height="400" fill="#1f6f4a"/>' +
    '<rect x="600" y="400" width="600" height="400" fill="#c9a227"/>' +
    '<path d="M0 800 L1200 0" stroke="#ffffff" stroke-width="40"/></svg>',
};

const PORTRAIT =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">' +
      '<rect width="8" height="8" fill="#00c800"/></svg>',
  ).toString("base64");

/**
 * Serves {@link PHOTO} to this browser context.
 *
 * On the CONTEXT rather than the page, which costs nothing and survives a
 * navigation.
 *
 * @param page - the browser page whose context should answer.
 */
async function servePhoto(page: Page): Promise<void> {
  await page
    .context()
    .route(`**${new URL(PHOTO.url).pathname}`, (route) =>
      route.fulfill({ contentType: "image/svg+xml", body: PHOTO.body }),
    );
}

let identity: TestIdentity | undefined;
let address = "";
let handle = "";

test.beforeAll(async ({ browser }) => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  await establishSharedSession(browser, identity.userId, STATE_PATH);
  await seedProfile({
    userId: identity.userId,
    displayName: "Aeleos",
    avatarUrl: PORTRAIT,
  });
  ({ address, handle } = await seedPage({
    userId: identity.userId,
    handlePrefix: "editorpage",
    displayName: "The editor is the page",
    blocks: [
      container({
        name_en: "Bare stack",
        mode: "stack",
        children: [
          leaf({
            title_en: "Nothing is painted behind me",
            description_en: "So the page's own backdrop has to reach here.",
          }),
        ],
      }),
      container({
        name_en: "Weighted neon",
        mode: "grid",
        spaces: 3,
        weights: [1, 3, 2],
        style: { skin: "neon" },
        children: [
          leaf({ title_en: "Left" }),
          leaf({ title_en: "Middle" }),
          leaf({ title_en: "Right" }),
        ],
      }),
      container({
        name_en: "Cut out and nested",
        mode: "grid",
        spaces: 2,
        style: { skin: "cutout" },
        children: [
          container({
            mode: "stack",
            children: [
              container({
                mode: "stack",
                children: [leaf({ title_en: "At the cap" })],
              }),
            ],
          }),
          leaf({ title_en: "Beside it" }),
        ],
      }),
      container({
        name_en: "Bleeding banner",
        mode: "stack",
        style: { bleed: true, margins: false, skin: "comic" },
        children: [leaf({ title_en: "Edge to edge" })],
      }),
    ],
    theme: {
      measure: "widest",
      skin: "glass",
      // **NOT the default canvas, and that is rule 13.** `themeVars` emits
      // `--canvas` only for a canvas OTHER than the default, so that an
      // untouched page stays byte-for-byte what it was — which means a fixture
      // choosing the default gets no property at all, and a check reading it
      // finds an empty string on a page that is behaving perfectly. Measured:
      // the first version of this fixture said `nebula` and the canvas case
      // failed on a product that was correct.
      canvas: "aurora",
      accent: "#00ff88",
      backgroundUrl: PHOTO.url,
      backgroundFit: "cover",
      background: {
        kind: "linear",
        repeating: false,
        every: 0,
        angle: 135,
        shape: "ellipse",
        extent: "farthest-corner",
        x: 50,
        y: 50,
        stops: [
          { color: "#2a0845", at: 0 },
          { color: "#ff2d95", at: 100 },
        ],
      },
    },
  }));
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/**
 * Quiets what belongs to the window rather than to the page.
 *
 * Only the canvas, which animates and is seeded per load, plus Next's
 * development indicator — a red badge that floats over the bottom-left corner,
 * is not served in production, and was once the entire remaining difference in
 * one section of the suite this replaces.
 *
 * @param page - the document to quiet.
 */
async function quiet(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "canvas{visibility:hidden!important}" +
      "nextjs-portal{display:none!important}" +
      // **The control that brings the workbench back, and it is the one thing
      // on screen that is deliberately not the page.** It is rendered outside
      // the element the hide rule reaches — that is what stops the rule hiding
      // the only way out of the state it created — but it is `fixed` to a
      // corner, so a VIEWPORT clip of a section pinned there captures it.
      // Measured while it sat at the BOTTOM right, against a section pinned
      // low: 2.598% of the last section differing, worst pixel AeleOS's
      // near-white `255,250,247` where the page paints the photograph's gold
      // quadrant at `176,142,34`. It sits at the TOP right now, so the clip it
      // would spoil is a different one — the hiding is still needed, and the
      // number above is a record of the fault rather than of today's geometry.
      //
      // `openEditorAsPage` asserts it is THERE before this hides it, so the
      // suite still fails if hiding the controls leaves no way back.
      '[data-testid="show-controls"]{display:none!important}',
  });
}

/** Every top-level section's box, in order, read from the DOM. */
async function sectionBoxes(root: Locator) {
  await expect(root.getByTestId("public-section").first()).toBeVisible();
  return root.getByTestId("public-section").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        left: Math.round(rect.left * 100) / 100,
      };
    }),
  );
}

/** How far in from the clip's own edge the comparison starts. */
const EDGE_INSET = 2;

/** Where a section is pinned in the viewport before being photographed. */
const PIN_AT = 120;

/**
 * Photographs one section pinned at the same offset in its own viewport.
 *
 * **The offset is the whole point.** The author's field is anchored to the
 * WINDOW, so which slice of their gradient and photograph sits behind a section
 * is decided by where that section is on screen. Two documents at the same
 * viewport still disagree if the same section sits at a different offset in
 * each — and pinning both is what turns "the editor is the page" into a
 * checkable claim rather than a statement about scroll position.
 *
 * Where the section LANDED is read back rather than assumed, because the two
 * documents clamp at the top differently: the public route and the editor put
 * their first section at different offsets, and assuming the scroll took left
 * two otherwise identical photographs 56 pixels apart in the suite this
 * replaces.
 *
 * @param page - the document to scroll and photograph.
 * @param section - the section to pin.
 * @param width - the viewport width, which is the strip's width.
 * @param height - how much of the section to photograph.
 * @returns the pinned strip.
 */
async function pinnedShot(
  page: Page,
  section: Locator,
  width: number,
  height: number,
): Promise<Buffer> {
  const top = await section.evaluate(
    (node) => node.getBoundingClientRect().top + window.scrollY,
  );
  await page.evaluate(
    ([to, pin]) => window.scrollTo({ top: to - pin, behavior: "instant" }),
    [top, PIN_AT],
  );
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  const landed = await section.evaluate(
    (node) => node.getBoundingClientRect().top,
  );
  return page.screenshot({
    animations: "disabled",
    // Inset from the edge, because the outermost row and column are where a
    // clip's own arithmetic lands and two documents need not lay their content
    // at the same sub-pixel phase. The interior is what the assertion is about.
    clip: {
      x: EDGE_INSET,
      y: Math.round(landed) + EDGE_INSET,
      width: width - EDGE_INSET * 2,
      height: height - EDGE_INSET * 2,
    },
  });
}

/**
 * Opens the page at its public address, ready to photograph.
 *
 * @param page - the browser page.
 */
async function openPublished(page: Page): Promise<void> {
  await page.goto(`/en/${address}/${handle}`);
  await expect(page.getByTestId("page-content")).toBeVisible();
  await quiet(page);
}

/**
 * Opens the editor on the same page with its controls hidden.
 *
 * The authoring language is set to English so the two halves are in the same
 * language: the editor renders the language being AUTHORED, which is a feature
 * rather than a difference.
 *
 * @param page - the browser page, already signed in.
 */
async function openEditorAsPage(page: Page): Promise<void> {
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();
  await page.getByTestId("writing-in-en").click();
  await page.getByTestId("hide-controls").click();
  await expect(page.getByTestId("show-controls")).toBeVisible();
  await quiet(page);
}

for (const stop of STOPS) {
  test(`the editor lays the page's own boxes at ${stop.name}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await servePhoto(page);
    await page.setViewportSize({ width: stop.width, height: stop.height });

    await openPublished(page);
    const published = await sectionBoxes(page.getByTestId("page-content"));

    await openEditorAsPage(page);
    const edited = await sectionBoxes(page.locator("form"));

    // **The exact claim, and it needs no photograph.** A box is what "the same
    // section is the same size and in the same place" actually means, and
    // reading it from the DOM is immune to where anything is scrolled. It is
    // what would report a wrapping column as `width: 1248` against `1280`
    // rather than as a percentage of differing pixels.
    expect(edited).toEqual(published);
  });
}

for (const stop of STOPS.filter((entry) => entry.pixels)) {
  test(`the editor paints what the page paints at ${stop.name}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const STRIP = Math.min(stop.height - PIN_AT - EDGE_INSET * 2, 420);
    await servePhoto(page);
    await page.setViewportSize({ width: stop.width, height: stop.height });

    await openPublished(page);
    const onThePage: Buffer[] = [];
    const count = await page
      .getByTestId("page-content")
      .getByTestId("public-section")
      .count();
    for (let index = 0; index < count; index += 1) {
      onThePage.push(
        await pinnedShot(
          page,
          page
            .getByTestId("page-content")
            .getByTestId("public-section")
            .nth(index),
          stop.width,
          STRIP,
        ),
      );
    }

    await openEditorAsPage(page);
    const sections = page.locator("form").getByTestId("public-section");
    expect(await sections.count()).toBe(count);

    for (let index = 0; index < count; index += 1) {
      const inTheEditor = await pinnedShot(
        page,
        sections.nth(index),
        stop.width,
        STRIP,
      );
      const found = await compareShots(page, onThePage[index]!, inTheEditor);
      const report =
        `section ${index} at ${stop.name}: ` +
        `${found.differing} px differing (${(found.ratio * 100).toFixed(3)}%), ` +
        `worst channel ${found.worstChannel}` +
        (found.worstAt
          ? ` at ${found.worstAt.x},${found.worstAt.y} ` +
            `page ${found.worstAt.one.join(",")} vs editor ${found.worstAt.two.join(",")}`
          : "");
      expect(found.ratio, report).toBeLessThan(ALLOWED_RATIO);
    }
  });
}

test("the canvas is the author's on both sides, with nothing quieted", async ({
  page,
}) => {
  // **This case exists because the comparisons above hide the canvas.** They
  // are right to — it animates — but hiding it is exactly what an ABSENT
  // backdrop looks like, so no amount of pixel agreement above can say the
  // editor has one. This asks the question directly and quiets nothing.
  test.setTimeout(120_000);
  await servePhoto(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  const read = () =>
    page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        canvases: document.querySelectorAll("canvas").length,
        canvas: root.getPropertyValue("--canvas").trim(),
        field: root.getPropertyValue("--field").trim(),
        body: getComputedStyle(document.body).backgroundImage,
      };
    });

  await page.goto(`/en/${address}/${handle}`);
  await expect(page.getByTestId("page-content")).toBeVisible();
  const published = await read();

  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();
  const edited = await read();

  expect(edited).toEqual(published);
  // Named rather than only compared, so a run where BOTH lost the backdrop
  // fails instead of agreeing. Two empty strings are equal.
  expect(published.canvases).toBeGreaterThan(0);
  expect(published.canvas).not.toBe("");
  expect(edited.canvas).toBe(published.canvas);
  expect(published.body).toContain("url(");
});

// THE WAY BACK OUT SITS WHERE THE BAR WAS.
//
// It cannot live IN the toolbar: the hide rule removes every `CHROME_SCOPE`
// island by class, so a button inside the bar would be hidden by the very
// press that summoned it, and `fursona-editor.test.tsx` pins that structural
// invariant. What moved is only where it is drawn — the bottom-right corner
// covered the page's own last section, which is the part somebody hides the
// controls to look at.
//
// **Asserted on the measured box rather than on the class list**, because a
// class assertion cannot see the box it produces — root rule 30 is what that
// costs.
test("the way back to the controls is drawn at the top, not over the page's foot", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await servePhoto(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  // **Driven here rather than through `openEditorAsPage`**, whose `quiet`
  // deliberately gives this very button `display:none` so a pinned viewport
  // clip cannot capture it. A helper that hides the subject cannot measure it.
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();
  await page.getByTestId("hide-controls").click();
  await expect(page.getByTestId("show-controls")).toBeVisible();

  const box = await page.getByTestId("show-controls").boundingBox();
  expect(box).not.toBeNull();
  // Well inside the top eighth at this height, and nowhere near the 744px a
  // bottom-anchored button reports — so the two placements cannot both pass.
  expect(box!.y).toBeLessThan(100);

  // **AND IT COVERS NOTHING. The line above could not tell that.** Moved to
  // the corner as a `fixed` element it satisfied "near the top" perfectly
  // while sitting ON the language and light/dark toggles — measured at 88% of
  // each, which does not overlap them so much as put them out of reach. A
  // placement assertion that a broken placement passes is rule 27 exactly, so
  // the guard is what the button DOES to its neighbours.
  const covered = await page.evaluate(`(() => {
    const self = document.querySelector('[data-testid="show-controls"]');
    const b = self.getBoundingClientRect();
    // Excluding the subject, which lives IN the header now and would otherwise
    // report covering itself by 100%.
    return [...document.querySelectorAll("header button, header a")]
      .filter((el) => el !== self && !el.contains(self) && !self.contains(el))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const over =
          Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left)) *
          Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top));
        return { what: el.getAttribute("data-testid") || el.tagName, over };
      })
      .filter((hit) => hit.over > 0);
  })()`);
  expect(covered).toEqual([]);
});

// TAKING THE PAGE'S OWN LOOK OFF WHILE BUILDING.
//
// The unit case proves the switch writes `data-page-theme`. It cannot prove
// that writing it removes anything, because `themeCss`'s gate is a stylesheet
// and jsdom resolves no custom properties through one — root rule 30 is what
// an assertion on the attribute alone would be worth.
//
// **Read off `--canvas`, which the author's theme emits and the default does
// not.** `themeVars` writes that property only for a canvas OTHER than the
// design's, so an empty string is the design's own — a value the author's theme
// cannot produce, which is what makes the two states distinguishable at all.
test("the builder can take the page's own look off, and put it back", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await servePhoto(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  const canvas = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--canvas")
        .trim(),
    );

  // Anti-vacuity: the page really is wearing something, so "it went away"
  // below is not passing on a page that never had a look of its own.
  const wearing = await canvas();
  expect(wearing).not.toBe("");

  await page.getByTestId("page-theme-switch").click();
  await expect.poll(canvas).toBe("");

  await page.getByTestId("page-theme-switch").click();
  await expect.poll(canvas).toBe(wearing);

  // **The narrowest screen, with the switch actually present.**
  // `responsive.spec.ts` drives `/pages/new`, whose theme is the default — so
  // `isCustomised` is false there and that suite has never once rendered this
  // control. A bar control nothing checks at 320px is how the last one cost
  // 71px of sideways scroll.
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByTestId("page-theme-switch")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, `the editor scrolls sideways by ${overflow}px`).toBeLessThan(
    2,
  );
});

// **A WORKBENCH GROUP MUST BE OPAQUE, and the style popup was not.**
// What is behind an editor control is a colour its author chose, and they may
// choose any colour — so a translucent control has no guaranteed contrast and
// nothing can give it one. That is why the toolbar takes `--menu`, the one
// token declared opaque in both modes.
//
// The section style popup took `--surface`, which carries `/.9` in the chrome
// scope, so the page showed through it. Every select INSIDE the popup already
// used `--menu`; the group around them did not, which is why nothing looked
// wrong in the source. It was found by reading a screenshot of the popup and
// noticing the page behind it — no check in the repository had an opinion.
//
// The assertion is on the ALPHA rather than on the class, because a class name
// is what was already right. `--surface` is asserted translucent in the same
// scope as the control: without it a build where both tokens were opaque would
// pass this and prove nothing about which one the popup reads.
test("every workbench group is opaque, whatever the page behind it", async ({
  page,
}) => {
  await page.goto("/es/pages/new");
  await openPageAdd(page);
  await expect(page.getByTestId("add-section")).toBeVisible();
  await openPageAdd(page);
  await page.getByTestId("add-section").click();

  // Adding opens the new section on ITEMS; its own controls, the style
  // trigger among them, are the other tab.
  await page.getByTestId("inspector-tab-options").click();
  const card = page.getByTestId("section-card");
  await card.getByTestId("section-style-open").click();
  const panel = page.getByTestId("section-style-panel");
  await expect(panel).toBeVisible();

  const seen = await panel.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      background: style.backgroundColor,
      opacity: style.opacity,
      surface: style.getPropertyValue("--surface").trim(),
    };
  });

  // The control paints something, and paints it at full alpha.
  expect(seen.background).not.toMatch(/transparent|rgba?\([^)]*,\s*0\s*\)/);
  expect(seen.background).not.toMatch(/\/\s*0?\.\d/);
  expect(seen.opacity).toBe("1");

  // The discriminating half: the token it must NOT be reading is translucent
  // right here, so this pair can tell the two apart.
  expect(seen.surface).toMatch(/\/\s*\.?9/);
});
