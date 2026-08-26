import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import {
  container,
  leaf,
  seedPage,
  seedPersonPage,
  seedProfile,
} from "./support/blocks";
import { compareShots, sampleColours } from "./support/pixels";

// THE PREVIEW AGAINST THE PAGE, IN PIXELS.
//
// Every other guard here asks whether the preview emits the right classes or
// lays the right boxes. Both can be entirely green while the thing somebody
// looks at is visibly not their page: the renderer is shared, so the class
// strings match by construction, and geometry assertions only cover the
// properties somebody thought to measure.
//
// This asks the only question the person building a page actually asks — does
// this section look like it will look — by photographing ONE seeded page twice,
// once at its public address and once inside the editor's complete preview, and
// comparing the two images.
//
// WHAT IS DELIBERATELY EQUALISED, AND WHY THAT IS NOT CHEATING.
//
// Two things behind the page are the WINDOW's rather than the section's, and
// both are quieted identically on both sides.
//
// The nebula canvas animates and is seeded per load, so left running it makes
// every comparison nondeterministic for a reason that has nothing to do with
// the preview.
//
// The author's field is a gradient anchored to the viewport on a published
// page, so which slice of it shows behind a given section depends on where that
// section sits on screen — near the top when a stranger opens the page, part
// way down a long editor here. That is a property of scroll position, not of
// the preview, and it is the one difference an inline preview cannot close;
// measured, it moves a section by up to 7 channels, and copying `body`'s
// `background-attachment: fixed` into the host makes it 29 rather than 0.
// Both sides are given the same flat field instead.
//
// What that leaves is everything the preview is actually responsible for: the
// palette, the skin, the surfaces, the type, and every box. Those are what was
// broken, and every fault this has found was invisible to every other check.
//
// SABOTAGE-VERIFIED, re-measured 2026-08-25 against the current fixture:
//
//   * dropping the `:root` compositions `previewThemeCss` restates reddens
//     three of the four sections, at 63.5%, 54.5% and 23.3% — the app's
//     near-white where the page paints the author's colour;
//   * taking `--ink` off the host reddens all four, at 1.04%, 2.07%, 1.69% and
//     0.36%, which is what a page's worth of text amounts to in area;
//   * moving every leaf one pixel inside its own section reddens all four, at
//     0.325%, 0.686%, 0.650% and 0.134%. The last is only 1.3x the budget, so
//     that is the section calibrating `ALLOWED_RATIO` rather than the loudest.
//
// **The third of those has a wrong version that looks identical to run**, and
// it is worth knowing before anybody repeats it. Moving the leaf in
// `blocks.tsx` moves it on BOTH sides — the renderer is shared, which is the
// whole design — so every section reports 0.000% and the sabotage step passes
// while proving nothing about the guard. It has to diverge ONE side: a rule
// emitted into `previewThemeCss`, which reaches preview hosts and nothing else.
// Rule 29 in the root `CLAUDE.md` is this exact shape.

test.describe.configure({ mode: "serial" });
test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

/**
 * How much of a section may differ before it is a different-looking section.
 *
 * **A tenth of a percent, against runs that measure at most a few thousandths
 * of one.** Once the window's own backdrop is quieted these sections compare
 * at 0 to 21 differing pixels out of a hundred thousand and more, varying a
 * little run to run along antialiased curves, so the budget is not covering a
 * known difference — it is the margin below which a handful of stray pixels is
 * not worth failing a branch for.
 *
 * It was 0.5% while the differences were being chased down, and that was
 * measurably too loose: moving every leaf one pixel inside its own section
 * left two of the four sections under it. At a tenth, all four go red — the
 * closest by a factor of 1.3, which is the margin this number actually has.
 * See the file header for that sabotage's one non-obvious requirement.
 */
const ALLOWED_RATIO = 0.001;

const VIEWPORT = { width: 1280, height: 900 };

/**
 * How much of a hard shadow has to survive below a margin-less last section.
 *
 * **Set from a measured gap rather than from taste.** The unclipped build reads
 * 77.33 on both sides, twice, sampling the same four channels-over-field; the
 * clipped build reads 0.00, because a scroll container removes the ink
 * entirely rather than dimming it. There is no spread to speak of between those
 * two — the shadow is opaque and unblurred, so a sample is either on it or on
 * the field — and this sits between them with room on each side.
 */
const SHADOW_LIFT = 40;

/**
 * The first stop of the backdrop fixture's field.
 *
 * A colour the app's own palette does not contain, so finding it at `:root` is
 * evidence that the AUTHOR's atmosphere reached the document rather than that
 * some atmosphere did.
 */
const AUTHOR_FIELD_FROM = "#2a0845";

/**
 * A portrait that is a fixture rather than a request.
 *
 * An eight-pixel green square as a `data:` address, permitted by `img-src` —
 * see `shared/domain/csp.ts`. A remote picture would make every comparison
 * here depend on a third party answering twice within the same run, which is a
 * flake nothing about this subject calls for.
 */
const PORTRAIT =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">' +
      '<rect width="8" height="8" fill="#00c800"/></svg>',
  ).toString("base64");

let identity: TestIdentity | undefined;
let address = "";
let handle = "";

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  // **The owner is NAMED and PICTURED, and that is the whole fixture rather
  // than dressing.** `ensure_person_actor` mints a person with no display
  // name, no portrait and `private`, so an `owner` block renders the address
  // alone on both sides — and the editor route hardcoded that owner's name and
  // portrait to null for months while every check here stayed green, because
  // the right answer and the wrong one photographed identically. Rule 27 in
  // the root `CLAUDE.md` is this exact shape. Measured once the fixture could
  // discriminate: 304px on the page against 280px in the preview.
  await seedProfile({
    userId: identity.userId,
    displayName: "Aeleos",
    avatarUrl: PORTRAIT,
  });
  ({ address, handle } = await seedPage({
    userId: identity.userId,
    handlePrefix: "previewfidelity",
    displayName: "Preview fidelity",
    blocks: [
      container({
        name_en: "Plain stack",
        name_es: "Pila simple",
        mode: "stack",
        children: [
          leaf({
            title_en: "A written thing",
            title_es: "Algo escrito",
            description_en: "With a sentence under it.",
            description_es: "Con una frase debajo.",
          }),
        ],
      }),
      container({
        name_en: "Weighted grid",
        name_es: "Rejilla con pesos",
        mode: "grid",
        spaces: 3,
        weights: [1, 3, 1],
        style: { skin: "comic" },
        children: [
          leaf({ title_en: "Left", title_es: "Izquierda" }),
          leaf({ title_en: "Middle", title_es: "Centro" }),
          leaf({ title_en: "Right", title_es: "Derecha" }),
        ],
      }),
      container({
        name_en: "Bleeding banner",
        name_es: "Banner a sangre",
        mode: "stack",
        style: { bleed: true },
        children: [
          leaf({ title_en: "Edge to edge", title_es: "De borde a borde" }),
        ],
      }),
    ],
    theme: {
      measure: "wider",
      skin: "neon",
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
 * Quiets everything behind the page that belongs to the window.
 *
 * The canvas is hidden and the field is flattened to one colour, identically on
 * both sides; see this file's header for why each is the honest choice rather
 * than a way of passing. The flat colour is opaque, so a translucent surface
 * still composites against a known backdrop and a surface painting the wrong
 * colour is still plainly wrong.
 *
 * @param page - the document to quiet.
 */
async function quietTheWindow(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "canvas{visibility:hidden!important}" +
      ":root,body,[data-preview-theme]{--field:linear-gradient(#101014,#101014)!important}" +
      // Next's development indicator floats over the bottom-left corner of the
      // window, which is where a section near the end of a long editor sits. It
      // is not served in production and it was the entire remaining difference
      // in one section — a red badge reading "1 Issue" photographed as part of
      // somebody's page.
      "nextjs-portal{display:none!important}",
  });
}

/** One section, as a photograph and as the box the browser laid it in. */
interface SectionShot {
  /** The section's own pixels. */
  image: Buffer;
  /** Its unrounded border box, which is the exact size claim. */
  box: { width: number; height: number };
}

/**
 * Photographs every top-level section of a rendered page, in order.
 *
 * Nothing is nudged onto whole pixels here, and two attempts to are worth
 * recording because both looked like fixes and neither was. A section whose
 * predecessor is 503.5 device pixels tall starts on a HALF pixel, so the same
 * content photographs from one row higher in a document that begins on a whole
 * one. A `transform: translate(0, 0.5px)` promotes the section to a composited
 * layer the compositor then resamples, and a fractional `scrollBy` is undone by
 * Playwright scrolling the element into view for the shot. Both printed the
 * same number they were meant to remove. Whole-pixel placement is forgiven in
 * {@link compareShots} instead, where it is one documented allowance rather
 * than a manoeuvre in the setup.
 *
 * **The BOX is read as well, and it rather than the image is the size claim.**
 * A photograph of a box at `y = 3458.5` spans one device row more than the same
 * box at a whole `y`, so two identical sections can photograph 128 rows and 127
 * — a difference in the CAPTURE and not in the page. Measured: across a page of
 * three sections the heights and widths agree to three decimals while the
 * fractional offsets do not, and they land on the half pixel on the PUBLIC side
 * as readily as on the preview's. Comparing images would therefore have failed
 * for a reason that has nothing to do with fidelity, on a fixture chosen by
 * nothing but where the content above happened to end.
 *
 * @param root - the element the sections live under.
 * @returns one photograph and one box per section.
 */
async function photographSections(root: Locator): Promise<SectionShot[]> {
  const sections = root.getByTestId("public-section");
  await expect(sections.first()).toBeVisible();
  const count = await sections.count();
  const shots: SectionShot[] = [];
  for (let index = 0; index < count; index += 1) {
    const section = sections.nth(index);
    await section.scrollIntoViewIfNeeded();
    const box = await section.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    shots.push({
      image: await section.screenshot({ animations: "disabled" }),
      box,
    });
  }
  return shots;
}

/**
 * Asserts that one section is laid at the same size on both sides.
 *
 * **The BOX, not the photograph**, and the difference is the whole reason this
 * helper exists rather than an inline `toEqual` on the image dimensions. A
 * section at a fractional `y` photographs one device row taller than the same
 * section at a whole one, so image equality fails for a reason that is entirely
 * about where the content above happened to end. The box is what "the same
 * size" actually means, and it is exact: measured across a page of sections,
 * heights and widths agree to three decimals while the offsets do not.
 *
 * It stays SOFT so one mismatched section does not hide the rest of the page,
 * which is how the fursona-list hole was found — 330px against 72px, three
 * sections into a comparison whose other sections were perfect.
 *
 * @param one - the public page's section.
 * @param two - the same section in the preview.
 * @param index - its position, so a failure names it.
 */
function expectSameBox(one: SectionShot, two: SectionShot, index: number) {
  expect.soft(two.box, `section ${index} box`).toEqual(one.box);
}

/**
 * The public page as a stranger sees it.
 *
 * @param page - the browser page to navigate.
 * @returns one photograph per section.
 */
async function photographPublic(page: Page): Promise<SectionShot[]> {
  await page.setViewportSize(VIEWPORT);
  await page.goto(`/es/${address}/${handle}`);
  await quietTheWindow(page);
  return photographSections(page.getByTestId("page-content"));
}

/**
 * The same page inside the editor's complete preview.
 *
 * @param page - the browser page to sign in and navigate.
 * @returns one photograph per section.
 */
async function photographPreview(page: Page): Promise<SectionShot[]> {
  await page.setViewportSize(VIEWPORT);
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/es/pages/${handle}/edit`);
  // The preview renders the language being AUTHORED, which is a feature: an
  // author writing English sees English whatever the app's locale is. The
  // published half of this comparison is `/es/`, so the two are put in the same
  // language rather than treating that deliberate behaviour as a difference.
  await page.getByTestId("writing-in-es").click();
  await page.getByTestId("complete-page-preview-toggle").click();
  const content = page.getByTestId("complete-page-preview-content");
  await expect(content).toBeVisible();
  await quietTheWindow(page);
  return photographSections(content);
}

test("every section looks the same in the preview as on the page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const published = await photographPublic(page);
  const previewed = await photographPreview(page);

  expect(previewed).toHaveLength(published.length);

  const report: string[] = [];
  for (const [index, shot] of published.entries()) {
    const found = await compareShots(page, shot.image, previewed[index]!.image);
    report.push(
      `section ${index}: ${shot.box.width}x${shot.box.height} public, ` +
        `${previewed[index]!.box.width}x${previewed[index]!.box.height} preview, ` +
        `${found.differing} px differing ` +
        `(${(found.ratio * 100).toFixed(3)}%), ` +
        `placed ${found.offset.x},${found.offset.y}, ` +
        `worst channel ${found.worstChannel}` +
        (found.worstAt
          ? ` at ${found.worstAt.x},${found.worstAt.y} ` +
            `(${found.worstAt.one.join()} vs ${found.worstAt.two.join()})`
          : ""),
    );
  }
  console.log(report.join("\n"));

  for (const [index, shot] of published.entries()) {
    const found = await compareShots(page, shot.image, previewed[index]!.image);
    expectSameBox(shot, previewed[index]!, index);
    expect
      .soft(found.ratio, `section ${index} pixels: ${report[index]}`)
      .toBeLessThanOrEqual(ALLOWED_RATIO);
  }
});

// A PERSON'S OWN PAGE, WHICH NOTHING HERE HAD EVER PHOTOGRAPHED.
//
// Every fixture above is a fursona, and the two page kinds carry DIFFERENT
// required blocks — `owner` on a fursona, `fursonas` on a person — so a suite
// made entirely of fursonas cannot see a `fursonas` block at all. `/me/edit`
// passed a hardcoded empty list, so the block previewed as a heading over
// nothing while the page carried a grid of cards: 330px against 72px, a hole
// the height of the content it was previewing.
//
// The SIZE assertion is what catches this rather than the pixel ratio, and
// that is worth knowing before anybody relaxes it: `compareShots` compares
// over the OVERLAP, so a preview that simply stops early scores 0.000%.
test("a person's page previews the characters it lists", async ({ page }) => {
  test.setTimeout(120_000);
  const owner = await seedProfile({
    userId: identity!.userId,
    displayName: "Aeleos",
    avatarUrl: PORTRAIT,
  });
  for (const name of ["Luna", "Sol", "Nube"]) {
    await seedPage({
      userId: identity!.userId,
      handlePrefix: name.toLowerCase(),
      displayName: name,
      blocks: [],
    });
  }
  await seedPersonPage({
    userId: identity!.userId,
    blocks: [
      container({
        name_en: "Me",
        name_es: "Yo",
        mode: "stack",
        children: [
          leaf({ kind: "avatar", title_en: "Portrait", title_es: "Retrato" }),
          leaf({ kind: "handle", title_en: "Handle", title_es: "Alias" }),
        ],
      }),
      container({
        name_en: "My characters",
        name_es: "Mis personajes",
        mode: "stack",
        children: [
          leaf({
            kind: "fursonas",
            title_en: "My characters",
            title_es: "Mis personajes",
          }),
        ],
      }),
    ],
  });

  await page.setViewportSize(VIEWPORT);
  await page.goto(`/es/${owner}`);
  await quietTheWindow(page);
  const published = await photographSections(page.getByTestId("page-content"));

  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/me/edit");
  await page.getByTestId("writing-in-es").click();
  await page.getByTestId("complete-page-preview-toggle").click();
  const content = page.getByTestId("complete-page-preview-content");
  await expect(content).toBeVisible();
  await quietTheWindow(page);
  const previewed = await photographSections(content);

  expect(previewed).toHaveLength(published.length);
  for (const [index, shot] of published.entries()) {
    const found = await compareShots(page, shot.image, previewed[index]!.image);
    expectSameBox(shot, previewed[index]!, index);
    expect
      .soft(found.ratio, `section ${index} pixels`)
      .toBeLessThanOrEqual(ALLOWED_RATIO);
  }
});

// WHAT SITS BEHIND THE PAGE, WHICH THE COMPARISON ABOVE DELIBERATELY QUIETS.
//
// Every case above hides the canvas on both sides, correctly: it animates and
// is seeded per load, so left running it makes each section's comparison
// nondeterministic for a reason that has nothing to do with the preview. That
// is exactly why it needs a case of its own — the quieting made the one thing
// that was missing entirely invisible.
//
// The canvas is `fixed inset-0 -z-10` in the root layout, so on a public page
// it paints between `body`'s field and the content and its clouds show through
// every gutter. The preview host painted an opaque `--field` on an in-flow
// element, which covers a negative layer outright: the same page photographed
// mottled at its address and perfectly smooth in the preview.
//
// Asked as "does hiding the canvas change what the preview paints" rather than
// by comparing against the page. Two photographs of one document a moment
// apart differ only in the thing being switched, where a cross-document
// comparison would drag in the field's own anchoring — the one difference an
// inline preview genuinely cannot close.
test("the page's own backdrop reaches the complete preview", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { handle: canvasHandle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "backdrop",
    displayName: "Backdrop",
    blocks: [
      container({
        name_en: "One",
        name_es: "Uno",
        children: [leaf({ title_en: "Only", title_es: "Solo" })],
      }),
    ],
    // `narrow` leaves wide gutters either side of every section, which is
    // where a visitor sees the canvas on a real page — and therefore where a
    // preview that hides it is most plainly wrong.
    //
    // The field is a colour nothing in the app uses, because "the canvas shows
    // through" and "the AUTHOR's atmosphere shows through" are two different
    // claims: a transparent host over the app's own backdrop satisfies the
    // first and fails the second, and only the second is the feature.
    theme: {
      measure: "narrow",
      canvas: "nebula",
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
          { color: AUTHOR_FIELD_FROM, at: 0 },
          { color: "#ff2d95", at: 100 },
        ],
      },
    },
  });

  await page.setViewportSize(VIEWPORT);
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/es/pages/${canvasHandle}/edit`);

  /**
   * The field the ROOT is resolving, which is what `body` and the canvas read.
   *
   * @returns the computed custom property.
   */
  const rootField = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--field")
        .trim(),
    );

  const closed = await rootField();
  expect(
    closed,
    "the workbench's resting state is the app's own",
  ).not.toContain(AUTHOR_FIELD_FROM);

  await page.getByTestId("complete-page-preview-toggle").click();
  const content = page.getByTestId("complete-page-preview-content");
  await expect(content).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

  // The document wears the AUTHOR's field while the preview is open, which is
  // the half a transparent host cannot supply for itself.
  expect(await rootField()).toContain(AUTHOR_FIELD_FROM);

  const host = content.locator("..");
  // Nothing of its own is painted over the document's atmosphere. Read as
  // computed paint rather than as a class, because a class assertion cannot
  // see a declaration arriving from the emitted stylesheet.
  expect(
    await host.evaluate((node) => getComputedStyle(node).backgroundImage),
  ).toBe("none");

  const withCanvas = await content.screenshot({ animations: "disabled" });
  await page.addStyleTag({ content: "canvas{visibility:hidden!important}" });
  const without = await content.screenshot({ animations: "disabled" });

  const found = await compareShots(page, withCanvas, without);
  expect(found.two, "the same box either way").toEqual(found.one);
  // A nebula is a soft, low-contrast cloud, so this is deliberately not a
  // threshold on how MUCH it differs — only that the backdrop is reaching the
  // preview at all. An opaque host answers zero.
  expect(
    found.differing,
    `hiding the canvas changed ${found.differing} px of the preview`,
  ).toBeGreaterThan(0);

  // Closing gives the workbench its own atmosphere back through the cascade,
  // with nothing reset by hand. Asserted against the value read BEFORE, so a
  // restore that lands somewhere new is still a failure.
  await page.getByTestId("complete-page-preview-toggle").click();
  await expect(content).toBeHidden();
  expect(await rootField()).toBe(closed);
});

// WHAT A SECTION PAINTS OUTSIDE ITSELF, WHICH A SCROLL CONTAINER SWALLOWS.
//
// The complete preview's host carried `overflow-x-auto` so horizontal excess
// would scroll inside the preview rather than dragging the workbench sideways.
// What that overlooked is a rule about the OTHER axis: a `visible` overflow
// paired with a non-visible one computes to `auto`, so the box was a scroll
// container on all four edges — and a scroll container clips ink.
//
// Ink overflow is not scrollable overflow, so nothing appeared to scroll and no
// scrollbar was offered. The shadow was simply gone. A bled, margin-less,
// unnamed section is flush with the host's own edge, so a skin that casts
// outward had its shadow cut off flat there, while the public route's `main`
// clips nothing.
//
// THREE THINGS ABOUT THIS FIXTURE ARE CHOSEN AND NOT INCIDENTAL.
//
// **It measures at the page's FOOT.** The first attempt measured above a first
// section, where the page BAR is opaque and paints over the halo: measured, the
// public page lifts 0 channels above its own banner, so a clipped preview
// lifting 0 would have agreed with it for entirely the wrong reason. Below a
// last section both documents have nothing but the field behind the same ink.
//
// **The skin is `neobrutalism`, whose shadow is `5px 5px 0` — hard, opaque and
// unblurred.** `neon` was tried first and its glow lifts the dark field by 3
// channels at one pixel out and 0 by eight, summing to about 9 across the whole
// halo. That is a real signal and it is inside the range a stray antialiased
// edge could produce, which is a budget that cannot separate the two builds.
// A hard shadow reads as `--ink` against the field: two hundred channels, not
// nine.
//
// **The reference sample is 20px out, not 60.** The preview is the last thing
// in the editor and the document ends 40px below it, so a distant probe reads
// nothing at all — and a lift computed against an absent pixel is arithmetic on
// a black rectangle. Twenty is clear of a five-pixel shadow and still on the
// page.
test("the preview does not clip what a section paints outside itself", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { address: glowAddress, handle: glowHandle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "outwardink",
    displayName: "Outward ink",
    // The banner has to be genuinely LAST, so the identity section this fixture
    // still owes is written here rather than appended after it.
    appendIdentity: false,
    blocks: [
      container({
        name_en: "Identity",
        name_es: "Identidad",
        mode: "stack",
        children: [
          leaf({ kind: "avatar", title_en: "Portrait", title_es: "Retrato" }),
          leaf({ kind: "handle", title_en: "Handle", title_es: "Alias" }),
          leaf({ kind: "owner", title_en: "Owner", title_es: "Dueño" }),
        ],
      }),
      // UNNAMED, so no heading sits between the host's edge and the card that
      // carries the skin; bled and margin-less, so there is no gutter either.
      container({
        mode: "stack",
        style: { bleed: true, margins: false, skin: "neobrutalism" },
        children: [leaf({ title_en: "Banner", title_es: "Banner" })],
      }),
    ],
    theme: { measure: "narrow" },
  });

  /**
   * How much brighter the field is just below the last section than clear of it.
   *
   * @param root - the element the sections live under.
   * @returns each sampled offset and the total lift over the field.
   */
  const shadowBelow = async (root: Locator) => {
    const last = root.getByTestId("public-section").last();
    await last.scrollIntoViewIfNeeded();
    const box = (await last.boundingBox())!;
    const x = Math.round(box.x + box.width / 2);
    const foot = Math.round(box.y + box.height);
    const offsets = [1, 2, 3, 4, 20];
    const painted = await sampleColours(
      page,
      offsets.map((offset) => ({ name: `d${offset}`, x, y: foot + offset })),
    );
    const brightness = (rgb: number[]) => (rgb[0]! + rgb[1]! + rgb[2]!) / 3;
    const field = brightness(painted.d20!);
    return {
      samples: Object.fromEntries(
        offsets.map((offset) => [`d${offset}`, painted[`d${offset}`]!]),
      ),
      total: +offsets
        .slice(0, -1)
        .reduce(
          (sum, offset) => sum + (brightness(painted[`d${offset}`]!) - field),
          0,
        )
        .toFixed(2),
    };
  };

  await page.setViewportSize(VIEWPORT);
  await page.goto(`/es/${glowAddress}/${glowHandle}`);
  await quietTheWindow(page);
  const onThePage = await shadowBelow(page.getByTestId("page-content"));

  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/es/pages/${glowHandle}/edit`);
  await page.getByTestId("writing-in-es").click();
  await page.getByTestId("complete-page-preview-toggle").click();
  const content = page.getByTestId("complete-page-preview-content");
  await expect(content).toBeVisible();
  await quietTheWindow(page);
  const inThePreview = await shadowBelow(content);

  console.log(
    "\nshadow below the banner\n  page:    " +
      JSON.stringify(onThePage) +
      "\n  preview: " +
      JSON.stringify(inThePreview) +
      "\n",
  );

  // The page is the control, and it is asserted FIRST for a reason: if the
  // fixture stopped casting a shadow at all — a skin renamed, a style key
  // dropped, `margins` ceasing to reach the foot — both sides would read zero
  // and the preview's assertion below would pass while proving nothing.
  expect(
    onThePage.total,
    `the fixture casts a shadow at all: ${JSON.stringify(onThePage)}`,
  ).toBeGreaterThan(SHADOW_LIFT);
  expect(
    inThePreview.total,
    `the preview keeps it: ${JSON.stringify(inThePreview)}`,
  ).toBeGreaterThan(SHADOW_LIFT);
});
