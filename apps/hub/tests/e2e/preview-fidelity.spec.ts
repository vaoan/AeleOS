import {
  expect,
  test,
  type Frame,
  type Locator,
  type Page,
} from "@playwright/test";
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
import { compareShots } from "./support/pixels";

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
/**
 * A page background picture, served to the browser by interception.
 *
 * **It must be an `http(s)` address, and a `data:` URI silently paints
 * nothing.** The page's picture goes through `backgroundImageValue`, which
 * builds on `safeHttpUrl`, which admits only those two schemes — so a data URI
 * is stored happily by `set_actor_theme`, read back happily by `parseTheme`,
 * and refused at the one point that turns it into CSS. That was measured after
 * a fixture using one passed at 0.000% and proved nothing.
 *
 * Deliberately not flat: `cover` over one viewport and `cover` over another are
 * only distinguishable if the picture HAS detail to crop differently. Four
 * quadrants and a diagonal give every crop a different average.
 */
const PHOTO = {
  url: "https://example.com/preview-fidelity-page.svg",
  body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
    '<rect width="600" height="400" fill="#12305a"/>' +
    '<rect x="600" width="600" height="400" fill="#8a1f4b"/>' +
    '<rect y="400" width="600" height="400" fill="#1f6f4a"/>' +
    '<rect x="600" y="400" width="600" height="400" fill="#c9a227"/>' +
    '<path d="M0 800 L1200 0" stroke="#ffffff" stroke-width="40"/></svg>',
};

/**
 * Serves {@link PHOTO} to this page without leaving the machine.
 *
 * @param page - the browser page to intercept on.
 */
async function servePhoto(page: Page): Promise<void> {
  // **On the CONTEXT, not the page.** The preview is a second document, and a
  // page-level route did not reach it: the frame's request for the picture went
  // unfulfilled, the browser fell through to the second background layer, and
  // the preview showed the author's gradient where the page showed the photo —
  // 61.7% differing, for a reason that was entirely the fixture's.
  await page
    .context()
    .route(`**${new URL(PHOTO.url).pathname}`, (route) =>
      route.fulfill({ contentType: "image/svg+xml", body: PHOTO.body }),
    );
}

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
      // **A background PICTURE, which no fixture here has ever carried**, and
      // its absence is why this suite was green through the fault it exists to
      // catch. `bodyBackgroundVars` emits `url(photo), var(--field)`, so the
      // photo is a SEPARATE layer from the gradient — and `quietTheWindow`
      // flattens only the gradient. A fixture without one cannot differ on the
      // one thing that was differing.
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
 * Quiets everything behind the page that belongs to the window.
 *
 * **Only the canvas now.** It animates and is seeded per load, so left running
 * it makes every comparison nondeterministic for a reason that has nothing to
 * do with the preview.
 *
 * The FIELD is no longer flattened, and that is the change this file exists to
 * make. It was flattened to excuse a window-anchoring difference an inline
 * preview could not close; a framed preview has its own window, so the
 * author's field and its background picture must now MATCH rather than be
 * excused. Measured against the inline preview, a fixture carrying a photo
 * differs by 4.8%, 41.9%, 38.5% and 8.0% — so this is the assertion that was
 * missing, not a stricter version of one that was there.
 *
 * @param page - the document to quiet.
 */
async function quietTheWindow(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "canvas{visibility:hidden!important}" +
      // Next's development indicator floats over the bottom-left corner of the
      // window, which is where a section near the end of a long editor sits. It
      // is not served in production and it was the entire remaining difference
      // in one section — a red badge reading "1 Issue" photographed as part of
      // somebody's page.
      "nextjs-portal{display:none!important}",
  });
}

/**
 * Every top-level section's box, in order.
 *
 * **The exact size claim, and it needs no photograph at all.** A box is what
 * "the same section is the same size" actually means, and reading it from the
 * DOM is immune to where anything is scrolled or which device pixel a
 * fractional offset lands on. It is what caught a `fursonas` block previewing
 * as a heading over nothing — 330px on the page against 72px — and it reports
 * that as `height: 244` against `height: 72` rather than as a percentage.
 *
 * @param root - the element the sections live under.
 * @returns one box per section.
 */
async function sectionBoxes(root: Locator) {
  await expect(root.getByTestId("public-section").first()).toBeVisible();
  return root.getByTestId("public-section").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
}

const PAINT_VIEWPORT = { width: 768, height: 1024 };

/**
 * The window the EDITOR is given while its preview is photographed.
 *
 * **Wider AND taller than the device, and both for the same reason: the
 * camera, not the page.**
 *
 * Wider, because the frame is scaled down to fit the space the editor can give
 * it. At a 768-wide window the surround is about 753 once the scrollbar is
 * priced in, so a 768 device was rendered at 0.98 — and a comparison against a
 * page at 1.0 then measures a resampling rather than a rendering. Measured: 69%
 * differing, with the photo and every box subtly displaced.
 *
 * Taller, because an element screenshot captures whatever is painted OVER that
 * element, and the editor's bar is sticky: with a window the height of the
 * frame, the bar sat across the top of every preview photograph while the
 * public half had its own bar outside the shot.
 *
 * The framed document's own viewport is the iframe's width and height, never
 * the window's, so neither of these changes anything about what is previewed.
 */
const EDITOR_WINDOW = {
  width: PAINT_VIEWPORT.width + 340,
  height: PAINT_VIEWPORT.height + 300,
};

/**
 * Quiets the canvas inside the framed document.
 *
 * `addStyleTag` reaches one document, and the preview is a second one now.
 *
 * @param page - the page holding the frame.
 */
async function quietTheFrame(page: Page): Promise<void> {
  const frame = page
    .frames()
    .find((candidate) => candidate.url().includes("/me/preview"));
  await frame?.addStyleTag({ content: "canvas{visibility:hidden!important}" });
}

/**
 * Opens the editor's preview at the desktop size and answers its document.
 *
 * DESKTOP, because that is the viewport the public half is photographed at. A
 * framed preview is faithful to the box it is given, so comparing one at 390
 * against a page at 1280 would measure the device switch rather than the
 * preview.
 *
 * @param page - the browser page to sign in and navigate.
 * @returns the preview's own frame.
 */
async function openPreview(page: Page): Promise<Frame> {
  await page.setViewportSize(VIEWPORT);
  await servePhoto(page);
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/es/pages/${handle}/edit`);
  // The preview renders the language being AUTHORED, which is a feature: an
  // author writing English sees English whatever the app's locale is. The
  // published half is `/es/`, so the two are put in the same language rather
  // than treating that deliberate behaviour as a difference.
  await page.getByTestId("writing-in-es").click();
  await page.getByTestId("complete-page-preview-toggle").click();
  await page.getByTestId("preview-device-desktop").click();
  await expect(
    page
      .frameLocator('[data-testid="complete-page-preview-frame"]')
      .getByTestId("page-content"),
  ).toBeVisible();
  await quietTheWindow(page);
  await quietTheFrame(page);
  return page
    .frames()
    .find((candidate) => candidate.url().includes("/me/preview"))!;
}

test("every section is laid at the same size in the preview as on the page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORT);
  await servePhoto(page);
  await page.goto(`/es/${address}/${handle}`);
  const onThePage = await sectionBoxes(page.getByTestId("page-content"));

  await openPreview(page);
  const inThePreview = await sectionBoxes(
    page
      .frameLocator('[data-testid="complete-page-preview-frame"]')
      .getByTestId("page-content"),
  );

  expect(inThePreview).toEqual(onThePage);
});

/**
 * Where one document's viewport begins in the outer page's coordinates.
 *
 * A named type rather than an inline object, because
 * `jsdoc/check-param-names` expands an inline one into `origin.x`/`origin.y`
 * and `tsdoc/syntax` refuses the dotted name that would take. Two tools
 * fighting is a configuration bug; naming the type settles it without either
 * having to be disabled.
 */
interface ViewportOrigin {
  /** Its left edge on screen. */
  x: number;
  /** Its top edge on screen. */
  y: number;
}

/** Where a section is pinned in its own viewport before being photographed. */
const PIN_AT = 200;

/** How far in from the clip's own edge the comparison starts. */
const EDGE_INSET = 2;

/**
 * Photographs one section pinned at the same offset inside its own viewport.
 *
 * **The offset is the whole point, and it took five wrong instruments to
 * arrive at.** A `fixed` backdrop resolves against the VIEWPORT and does not
 * move when the document scrolls, so which slice of the author's photo sits
 * behind a section is decided by where that section is on screen. Two
 * documents at the same viewport size still disagree if the same section sits
 * at a different offset in each — which is the original fault, one level down,
 * and it is what made every earlier attempt here measure a scroll position
 * rather than a rendering.
 *
 * Pinning both to the same offset is the same kind of normalisation as pinning
 * the viewport size: it is what makes "the preview equals the page" a
 * checkable claim. `PIN_AT` is clear of the public page's own bar, which the
 * preview document deliberately does not have.
 *
 * @param page - the browser page holding both documents.
 * @param scroller - the document to scroll.
 * @param section - the section to pin, in that document.
 * @param origin - where that document's viewport begins on screen, as a
 *   point in the outer page's own coordinates.
 * @param height - how much of the section to photograph.
 * @returns the pinned strip.
 */
async function pinnedShot(
  page: Page,
  scroller: Page | Frame,
  section: Locator,
  origin: ViewportOrigin,
  height: number,
): Promise<Buffer> {
  const top = await section.evaluate(
    (node) => node.getBoundingClientRect().top + window.scrollY,
  );
  await scroller.evaluate(
    ([to, pin]) => window.scrollTo({ top: to - pin, behavior: "instant" }),
    [top, PIN_AT],
  );
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  // **Read where it ACTUALLY landed rather than assuming the scroll took.**
  // Both documents clamp at the top, and they clamp differently: the public
  // page's own bar offsets its first section by 56px where the preview
  // document, which has no bar, starts at zero. Assuming `PIN_AT` produced two
  // otherwise identical photographs 56 pixels apart — a total mismatch for a
  // reason that was entirely the camera's.
  const landed = await section.evaluate(
    (node) => node.getBoundingClientRect().top,
  );
  return page.screenshot({
    animations: "disabled",
    // Rounded, because a fractional clip origin shifts the captured rows by a
    // sub-pixel and the two documents need not lay their content at the same
    // phase. Measured: the unrounded version left 1664 pixels differing, all
    // of them on the outermost row and column.
    // **Inset from the edge**, because the outermost row and column are where
    // a clip's own arithmetic lands and two documents need not lay their
    // content at the same sub-pixel phase. Measured: without the inset, 1664
    // pixels differ and every one of them is on that boundary. The interior is
    // what the assertion is about, and it is held to the strict budget.
    clip: {
      x: Math.round(origin.x) + EDGE_INSET,
      y: Math.round(origin.y + landed) + EDGE_INSET,
      width: PAINT_VIEWPORT.width - EDGE_INSET * 2,
      height: height - EDGE_INSET * 2,
    },
  });
}

test("the preview paints what the page paints", async ({ page }) => {
  test.setTimeout(180_000);
  const STRIP = 420;

  await page.setViewportSize(PAINT_VIEWPORT);
  await servePhoto(page);
  await page.goto(`/es/${address}/${handle}`);
  await quietTheWindow(page);
  const published = await pinnedShot(
    page,
    page,
    page.getByTestId("page-content").getByTestId("public-section").first(),
    { x: 0, y: 0 },
    STRIP,
  );

  await page.setViewportSize(EDITOR_WINDOW);
  await servePhoto(page);
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/es/pages/${handle}/edit`);
  await page.getByTestId("writing-in-es").click();
  await page.getByTestId("complete-page-preview-toggle").click();
  await page.getByTestId("preview-device-tablet").click();
  const framed = page.frameLocator(
    '[data-testid="complete-page-preview-frame"]',
  );
  await expect(framed.getByTestId("page-content")).toBeVisible();
  await quietTheWindow(page);
  await quietTheFrame(page);
  const element = page.getByTestId("complete-page-preview-frame");
  await element.evaluate((node) =>
    node.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  const box = (await element.boundingBox())!;
  const frame = page
    .frames()
    .find((candidate) => candidate.url().includes("/me/preview"))!;
  const previewed = await pinnedShot(
    page,
    frame,
    framed.getByTestId("page-content").getByTestId("public-section").first(),
    { x: Math.round(box.x), y: Math.round(box.y) },
    STRIP,
  );

  if (process.env.SHOT_DIR) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${process.env.SHOT_DIR}/pf-page.png`, published);
    writeFileSync(`${process.env.SHOT_DIR}/pf-preview.png`, previewed);
  }

  const found = await compareShots(page, published, previewed);
  const report =
    `${found.one.width}x${found.one.height} page, ` +
    `${found.two.width}x${found.two.height} preview, ` +
    `${found.differing} px differing (${(found.ratio * 100).toFixed(3)}%), ` +
    `worst ${found.worstChannel}` +
    (found.worstAt
      ? ` at ${found.worstAt.x},${found.worstAt.y} ` +
        `(${found.worstAt.one.join()} vs ${found.worstAt.two.join()})`
      : "");
  console.log(report);

  expect.soft(found.two, "the same box").toEqual(found.one);
  expect.soft(found.ratio, report).toBeLessThanOrEqual(ALLOWED_RATIO);
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
  const onThePage = await sectionBoxes(page.getByTestId("page-content"));

  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/me/edit");
  await page.getByTestId("writing-in-es").click();
  await page.getByTestId("complete-page-preview-toggle").click();
  await page.getByTestId("preview-device-desktop").click();
  const framed = page.frameLocator(
    '[data-testid="complete-page-preview-frame"]',
  );
  await expect(framed.getByTestId("page-content")).toBeVisible();
  const inThePreview = await sectionBoxes(framed.getByTestId("page-content"));

  expect(inThePreview).toEqual(onThePage);
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

  await page.setViewportSize(EDITOR_WINDOW);
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/es/pages/${canvasHandle}/edit`);
  await page.getByTestId("complete-page-preview-toggle").click();
  const framed = page.frameLocator(
    '[data-testid="complete-page-preview-frame"]',
  );
  await expect(framed.getByTestId("page-content")).toBeVisible();

  const frame = page
    .frames()
    .find((candidate) => candidate.url().includes("/me/preview"))!;

  // **The framed document wears the author's theme itself**, which is the
  // whole mechanism: it is a real page, so `ThemeScope` writes the field at
  // its own `:root` and `body` paints it, and the canvas mounted in its own
  // root layout reads its own properties. Nothing is copied across the
  // boundary except the draft.
  const inside = await frame.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      field: root.getPropertyValue("--field").trim().slice(0, 50),
      canvas: root.getPropertyValue("--canvas").trim(),
      attachment: getComputedStyle(document.body).backgroundAttachment,
      canvasPresent: !!document.querySelector("canvas"),
    };
  });
  expect(inside.field).toContain(AUTHOR_FIELD_FROM);
  expect(inside.attachment).toBe("fixed");
  expect(
    inside.canvasPresent,
    "the preview has a canvas of its own to paint the author's backdrop",
  ).toBe(true);

  // And the EDITOR keeps its own atmosphere, which is the boundary this
  // replaces the document-atmosphere trigger with: the author's field reaches
  // the preview by being the preview's own, not by being put on the workbench.
  const outside = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--field")
      .trim(),
  );
  expect(outside).not.toContain(AUTHOR_FIELD_FROM);
});

// WHAT A SECTION PAINTS OUTSIDE ITSELF.
//
// The inline preview's host was a scroll container — `overflow-x: auto` pairs
// the visible axis to `auto` as well — and a scroll container clips ink. Ink
// overflow is not scrollable overflow, so nothing scrolled and no scrollbar
// appeared; a `neobrutalism` banner's hard cast simply vanished, measured at
// 77.33 channels over the field on the page against 0.00 in the preview.
//
// **The preview is a separate document now, so that host is gone entirely.**
// What remains to guard is that the framed document does not grow a scroller
// of its own: its `main` is the same `PageContent` the public route uses, and
// if anything ever wraps it in one the same clipping returns with no scrollbar
// to announce it.
test("the framed document is not a scroll container", async ({ page }) => {
  test.setTimeout(120_000);
  const { handle: inkHandle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "outwardink",
    displayName: "Outward ink",
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
      container({
        mode: "stack",
        style: { bleed: true, margins: false, skin: "neobrutalism" },
        children: [leaf({ title_en: "Banner", title_es: "Banner" })],
      }),
    ],
    theme: { measure: "narrow" },
  });

  await page.setViewportSize(EDITOR_WINDOW);
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/es/pages/${inkHandle}/edit`);
  await page.getByTestId("complete-page-preview-toggle").click();
  await expect(
    page
      .frameLocator('[data-testid="complete-page-preview-frame"]')
      .getByTestId("page-content"),
  ).toBeVisible();

  const frame = page
    .frames()
    .find((candidate) => candidate.url().includes("/me/preview"))!;
  const clipping = await frame.evaluate(() => {
    const clipped: string[] = [];
    let node: Element | null = document.querySelector(
      '[data-testid="page-content"]',
    );
    while (node) {
      const style = getComputedStyle(node);
      for (const overflow of [style.overflowX, style.overflowY]) {
        if (overflow !== "visible") {
          clipped.push(`${node.tagName.toLowerCase()}:${overflow}`);
        }
      }
      node = node.parentElement;
    }
    return clipped;
  });

  expect(
    clipping,
    "nothing between the page content and the framed document clips or scrolls",
  ).toEqual([]);
});

// **ONE SCROLLBAR, WITHOUT GIVING BACK THE DEVICE VIEWPORT.**
//
// The preview had its own scroll, nested inside the editor's, which is what a
// real device window costs. The tempting cure is to grow the frame to its
// content's height — and that re-opens the fault this whole file exists for,
// because a page's backdrop is `background-attachment: fixed` and a 390x4000
// window is not one any visitor has.
//
// So the window stays and the page's scroll drives it: the frame pins clear of
// the editor's three bars, the spacer around it is as tall as the scaled
// distance the content can travel, and progress through the spacer is progress
// through the document.
//
// Rule 27 — the three ways this can be wrong, and what tells each apart:
// remove the driver and the framed document never moves; remove the pin and
// the frame scrolls away instead of holding its place; leave the framed
// document scrollable and a wheel over it fights the driver. Each has its own
// assertion below rather than one that would pass on two of the three.
test("the editor's scroll drives the pinned preview", async ({ page }) => {
  test.setTimeout(120_000);
  const { handle: tallHandle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "drivenscroll",
    displayName: "Driven scroll",
    // Tall enough that the framed page genuinely overflows its device: with
    // nothing to scrub, every assertion here would pass on a broken driver.
    blocks: Array.from({ length: 8 }, (_, at) =>
      container({
        name_en: `Section ${at + 1}`,
        name_es: `Sección ${at + 1}`,
        mode: "stack",
        children: [
          leaf({
            title_en: `Heading ${at + 1}`,
            title_es: `Encabezado ${at + 1}`,
            description_en: "A sentence with enough words to take a line.",
            description_es: "Una frase con palabras suficientes.",
          }),
        ],
      }),
    ),
  });

  await page.setViewportSize(EDITOR_WINDOW);
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto(`/es/pages/${tallHandle}/edit`);
  await page.getByTestId("complete-page-preview-toggle").click();
  await expect(
    page
      .frameLocator('[data-testid="complete-page-preview-frame"]')
      .getByTestId("page-content"),
  ).toBeVisible();

  const frame = page
    .frames()
    .find((candidate) => candidate.url().includes("/me/preview"))!;

  // 1. A wheel over the frame scrolls the PAGE, not the framed document.
  //
  // **The framed document keeps its own scrolling, deliberately.** Taking it
  // away with `overflow: hidden` was tried and clips ink overflow — the fault
  // the scroll-container case below this one exists to catch. So the gesture
  // is forwarded instead, and what is asserted is where it LANDS.
  const overflows = await frame.evaluate(
    () =>
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight,
  );
  expect(overflows, "the framed page is taller than its device").toBe(true);

  // **The reading is taken AFTER the hover, and that is not fussiness.**
  // Playwright scrolls an element into view to hover it, so a reading taken
  // before moved on its own — and the assertion then passed with the
  // forwarding deleted, which is the whole failure this repository calls
  // rule 27. Verified by deleting it again afterwards.
  await page
    .getByTestId("complete-page-preview-frame")
    .hover({ position: { x: 40, y: 40 } });
  const before = await page.evaluate(() => globalThis.scrollY);
  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => page.evaluate(() => globalThis.scrollY))
    .toBeGreaterThan(before);

  // 2. Scrolling the editor moves the framed document.
  //
  // **The zero point is where the frame BEGINS to pin, not where the spacer
  // starts.** They differ by the pin offset — measured 184px here — and
  // starting from the spacer's own top puts the page 184px into the scrub
  // already, which reads as "the driver is broken" when it is working
  // perfectly.
  const spacerTop = await page
    .getByTestId("preview-scroller")
    .evaluate((node) => node.getBoundingClientRect().top + globalThis.scrollY);
  // Guarded exactly as the component guards it. An unpinned element computes
  // `top: auto`, and an unguarded `parseFloat` would make `start` — and every
  // number derived from it — `NaN`, which swamps the assertions below with a
  // failure about arithmetic instead of about the frame having scrolled away.
  const pinnedAt = await page
    .getByTestId("preview-surround")
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).top) || 0);
  const start = spacerTop - pinnedAt;

  await page.evaluate((y) => globalThis.scrollTo(0, y), start);
  await expect.poll(() => frame.evaluate(() => globalThis.scrollY)).toBe(0);

  await page.evaluate((y) => globalThis.scrollTo(0, y + 400), start);
  await expect
    .poll(() => frame.evaluate(() => globalThis.scrollY))
    .toBeGreaterThan(0);

  // 3. And the frame HELD ITS PLACE while that happened.
  //
  // Asserted as "it did not move between two scroll positions" rather than as
  // "its top equals the offset the stylesheet declares". The second reads
  // better and is a worse test: on an unpinned element `top` computes to
  // `auto`, so it fails by `NaN` rather than by the box having moved — and it
  // would pass for anything that happened to sit at the right offset once.
  const topAt = () =>
    page
      .getByTestId("preview-surround")
      .evaluate((node) => node.getBoundingClientRect().top);
  const held = await topAt();
  await page.evaluate((y) => globalThis.scrollTo(0, y + 700), start);
  expect(Math.abs((await topAt()) - held), "the frame stayed put").toBeLessThan(
    2,
  );
  // And it is held at the offset meant for it, clear of the three bars — a
  // frame pinned at `top: 0` would sit under the header.
  expect(held).toBeGreaterThan(0);
  expect(Math.abs(held - pinnedAt)).toBeLessThan(2);

  // 4. Scrolling to the very end of the spacer reaches the end of the page,
  //    so nothing is unreachable — the failure a pin without a driver causes.
  const spacerHeight = await page
    .getByTestId("preview-scroller")
    .evaluate((node) => node.getBoundingClientRect().height);
  await page.evaluate((y) => globalThis.scrollTo(0, y), start + spacerHeight);
  const inner = () =>
    frame.evaluate(() => ({
      at: globalThis.scrollY,
      max:
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight,
    }));
  const { max } = await inner();
  expect(
    max,
    "the framed page really does have somewhere to scroll",
  ).toBeGreaterThan(0);
  // Polled: the driver runs on an animation frame, so its last write lands
  // after the scroll call returns.
  await expect
    .poll(async () => (await inner()).at)
    .toBeGreaterThanOrEqual(max - 2);
});
